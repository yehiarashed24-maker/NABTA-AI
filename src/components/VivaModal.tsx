import React, { useState, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, X, CheckCircle2, Award, Loader2, Send } from "lucide-react";
import { useI18n } from "../i18n";
import { speakText, stopSpeaking, createSpeechRecognizer } from "../audio";
import { Workspace } from "../types";

interface VivaModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const VivaModal: React.FC<VivaModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const { t, lang } = useI18n();
  const [sessionStarted, setSessionStarted] = useState(false);
  const [topic, setTopic] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [userAnswer, setUserAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const recognizerRef = useRef<any>(null);

  if (!isOpen) return null;

  const startViva = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/viva/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      });
      const data = await res.json();
      setCurrentQuestion(data.question);
      setHistory([{ role: "examiner", content: data.question }]);
      setSessionStarted(true);

      speakText(data.question, lang, { rate: 0.95 });
    } catch (err: any) {
      alert(err.message || "Failed to start Viva exam");
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      const recognizer = createSpeechRecognizer(lang, {
        onStart: () => setIsListening(true),
        onResult: (text, isFinal) => {
          setUserAnswer(text);
        },
        onError: () => setIsListening(false),
        onEnd: () => setIsListening(false),
      });
      recognizerRef.current = recognizer;
      if (recognizer.isSupported) {
        recognizer.start();
      }
    }
  };

  const submitTurn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userAnswer.trim() || busy) return;

    setBusy(true);
    recognizerRef.current?.stop();
    setIsListening(false);
    stopSpeaking();

    const answerToSend = userAnswer;
    setUserAnswer("");

    const updatedHistory = [...history, { role: "candidate", content: answerToSend }];
    setHistory(updatedHistory);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/viva/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: updatedHistory,
          userResponse: answerToSend,
          topic: topic.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.isComplete) {
        setEvaluation(data);
        await onRefresh();
      } else {
        setCurrentQuestion(data.nextQuestion);
        setHistory([...updatedHistory, { role: "examiner", content: data.nextQuestion }]);
        speakText(data.nextQuestion, lang, { rate: 0.95 });
      }
    } catch (err: any) {
      alert(err.message || "Failed to process viva answer");
    } finally {
      setBusy(false);
    }
  };

  const resetAndClose = () => {
    stopSpeaking();
    recognizerRef.current?.stop();
    setSessionStarted(false);
    setCurrentQuestion("");
    setHistory([]);
    setEvaluation(null);
    setUserAnswer("");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={resetAndClose}>
      <div className="viva-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="viva-modal-header">
          <div>
            <span className="live-pill">ORAL VIVA VOCE</span>
            <h3>{t("vivaModalTitle")}</h3>
            <p>{t("vivaModalSub")}</p>
          </div>
          <button type="button" className="modal-close" onClick={resetAndClose}>
            <X size={18} />
          </button>
        </div>

        {!sessionStarted ? (
          <div className="viva-intro">
            <div className="viva-badge-box">
              <Award size={40} />
              <h4>{t("vivaTitle")}</h4>
              <p>{t("vivaStartNotice")}</p>
            </div>
            <label className="field-label">
              <span>{t("quizTopicScopeLabel")} (Optional)</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. CIA Triad & Cryptographic Controls"
              />
            </label>
            <button
              type="button"
              className="primary-submit"
              onClick={startViva}
              disabled={busy}
            >
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {t("vivaBeginBtn")}
            </button>
          </div>
        ) : evaluation ? (
          <div className="viva-result">
            <div className="viva-score-banner">
              <span className="eyebrow">{t("vivaScoreLabel")}</span>
              <strong>{evaluation.score}%</strong>
              <p>{evaluation.feedback}</p>
            </div>

            <div className="viva-feedback-columns">
              {evaluation.strengths?.length > 0 && (
                <div className="viva-point-box strengths">
                  <strong>{t("vivaStrengthsTitle")}</strong>
                  <ul>
                    {evaluation.strengths.map((item: string, idx: number) => (
                      <li key={idx}>
                        <CheckCircle2 size={14} /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.weaknesses?.length > 0 && (
                <div className="viva-point-box weaknesses">
                  <strong>{t("vivaWeaknessesTitle")}</strong>
                  <ul>
                    {evaluation.weaknesses.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="viva-mastery-notice">
              <span>{t("vivaMasteryUpdated")}</span>
            </div>

            <button type="button" className="dark-button" onClick={resetAndClose}>
              {t("vivaFinishBtn")}
            </button>
          </div>
        ) : (
          <div className="viva-conversation">
            <div className="examiner-card">
              <div className="examiner-header">
                <strong>{t("nabta")} (Examiner)</strong>
                <button
                  type="button"
                  className="voice-mini-btn"
                  onClick={() => speakText(currentQuestion, lang, { rate: 0.95 })}
                >
                  <Volume2 size={14} />
                </button>
              </div>
              <p>{currentQuestion}</p>
            </div>

            <form className="viva-candidate-area" onSubmit={submitTurn}>
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={t("vivaTurnInputPlaceholder")}
                rows={3}
                disabled={busy}
              />
              <div className="candidate-controls">
                <button
                  type="button"
                  className={`viva-mic-btn ${isListening ? "active" : ""}`}
                  onClick={toggleMic}
                  title="Speak response"
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  <span>{isListening ? "Listening…" : "Speak Answer"}</span>
                </button>
                <button
                  type="submit"
                  className="primary-submit compact"
                  disabled={!userAnswer.trim() || busy}
                >
                  {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  <span>{busy ? t("vivaEvaluatingTurn") : t("vivaSubmitTurn")}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
