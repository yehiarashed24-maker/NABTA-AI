import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, X, Sparkles, RefreshCw, BookOpen } from "lucide-react";
import { useI18n } from "../i18n";
import { speakText, stopSpeaking, isSpeaking, createSpeechRecognizer, unlockAudio } from "../audio";
import { Workspace } from "../types";

interface VoiceTutorModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const VoiceTutorModal: React.FC<VoiceTutorModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const { t, lang } = useI18n();
  const [isListening, setIsListening] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [statusText, setStatusText] = useState("");
  const [speechRate, setSpeechRate] = useState(1.15);
  const [isMuted, setIsMuted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const recognizerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(isOpen);

  // Keep isOpenRef strictly in sync
  isOpenRef.current = isOpen;

  const handleClose = () => {
    isOpenRef.current = false;
    abortControllerRef.current?.abort();
    stopSpeaking();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.pause();
        window.speechSynthesis.cancel();
      } catch {}
    }
    recognizerRef.current?.stop();
    setIsListening(false);
    setIsAiSpeaking(false);
    setIsBusy(false);
    onClose();
  };

  // Keyboard shortcut: Escape closes modal and cuts audio immediately
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopSpeaking();
      abortControllerRef.current?.abort();
      recognizerRef.current?.stop();
      setIsListening(false);
      setIsAiSpeaking(false);
      setIsBusy(false);
      return;
    }

    unlockAudio();
    setStatusText(t("voiceIdleState"));

    // Welcoming greeting on open
    const greeting =
      lang === "ar"
        ? `أهلاً بك! أنا نبتة جاهز لمساعدتك وشرح أي نقطة في مادة "${workspace.title}". تفضل بسؤالي بصوتك.`
        : `Welcome! I'm Nabta, ready to explain any concept in "${workspace.title}". Speak your question anytime.`;
    setAiResponse(greeting);

    if (!isMuted) {
      setIsAiSpeaking(true);
      speakText(greeting, lang, {
        rate: speechRate,
        onEnd: () => {
          if (!isOpenRef.current) {
            stopSpeaking();
            return;
          }
          setIsAiSpeaking(false);
          startListeningFlow();
        },
        onError: () => {
          setIsAiSpeaking(false);
        },
      });
    }

    return () => {
      stopSpeaking();
      abortControllerRef.current?.abort();
      recognizerRef.current?.stop();
    };
  }, [isOpen]);

  const startListeningFlow = () => {
    if (!isOpenRef.current) return;
    if (recognizerRef.current) {
      recognizerRef.current.stop();
    }

    const recognizer = createSpeechRecognizer(lang, {
      onStart: () => {
        if (!isOpenRef.current) return;
        setIsListening(true);
        setStatusText(t("voiceListeningState"));
      },
      onResult: (text, isFinal) => {
        if (!isOpenRef.current) return;
        setTranscript(text);
        if (isFinal) {
          sendVoiceQuery(text);
        }
      },
      onError: (err) => {
        console.warn("Speech recognition error", err);
        setIsListening(false);
        setStatusText(t("voiceIdleState"));
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    recognizerRef.current = recognizer;
    if (recognizer.isSupported) {
      recognizer.start();
    } else {
      setStatusText(t("voiceMicDenied"));
    }
  };

  const toggleMic = () => {
    unlockAudio();
    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
      setStatusText(t("voiceIdleState"));
    } else {
      stopSpeaking();
      setIsAiSpeaking(false);
      startListeningFlow();
    }
  };

  const sendVoiceQuery = async (queryText: string) => {
    if (!queryText.trim() || isBusy || !isOpenRef.current) return;
    setIsBusy(true);
    recognizerRef.current?.stop();
    setIsListening(false);
    stopSpeaking();
    setStatusText(t("loading"));

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: queryText,
          grounded: true,
          mode: "voice",
          isVoice: true,
          language: lang,
        }),
      });

      // If modal was closed during fetch, abort speaking
      if (!isOpenRef.current) {
        stopSpeaking();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get AI response.");
      }
      const reply = data.answer || data.reply || "";
      if (!reply) {
        throw new Error("No answer received from AI.");
      }

      setAiResponse(reply);
      setStatusText(t("voiceSpeakingState"));

      if (!isMuted && isOpenRef.current) {
        setIsAiSpeaking(true);
        speakText(reply, lang, {
          rate: speechRate,
          onEnd: () => {
            if (!isOpenRef.current) {
              stopSpeaking();
              return;
            }
            setIsAiSpeaking(false);
            setStatusText(t("voiceIdleState"));
            startListeningFlow();
          },
          onError: () => {
            setIsAiSpeaking(false);
            setStatusText(t("voiceIdleState"));
          },
        });
      } else {
        setStatusText(t("voiceIdleState"));
      }

      if (isOpenRef.current) {
        await onRefresh();
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (isOpenRef.current) {
        setAiResponse(err.message || "Failed to get AI response.");
        setStatusText(t("voiceIdleState"));
      }
    } finally {
      if (isOpenRef.current) {
        setIsBusy(false);
      }
    }
  };

  const teachMeLesson = async () => {
    unlockAudio();
    const concept = workspace.weakTopics?.[0] || workspace.concepts?.[0]?.name || "Core Lesson Concepts";
    const prompt =
      lang === "ar"
        ? `اشرح لي درس ${concept} باختصار في جملتين واضحتين بالصوت.`
        : `Teach me a short 2-sentence spoken summary about ${concept}.`;
    setTranscript(prompt);
    sendVoiceQuery(prompt);
  };

  const explainSimpler = () => {
    unlockAudio();
    const prompt =
      lang === "ar"
        ? "اشرح النقطة السابقة بأسلوب أبسط في جملتين ومثال واقعي."
        : "Can you explain that point simpler in two spoken sentences with an everyday example?";
    setTranscript(prompt);
    sendVoiceQuery(prompt);
  };

  const toggleSlower = () => {
    const newRate = speechRate <= 0.88 ? 1.15 : 0.85;
    setSpeechRate(newRate);
    if (isAiSpeaking && aiResponse && isOpenRef.current) {
      stopSpeaking();
      speakText(aiResponse, lang, {
        rate: newRate,
        onEnd: () => {
          if (!isOpenRef.current) {
            stopSpeaking();
            return;
          }
          setIsAiSpeaking(false);
        },
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop voice-modal-backdrop" onClick={handleClose}>
      <div className="voice-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="voice-modal-header">
          <div className="voice-header-title">
            <span className="live-pill">
              <span className="live-pulse" /> LIVE VOICE TUTOR
            </span>
            <h3>{t("voiceModalTitle")}</h3>
            <p>{t("voiceModalSub")}</p>
          </div>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close voice tutor">
            <X size={18} />
          </button>
        </div>

        {/* Visualizer Orb / Waves */}
        <div className={`voice-visualizer ${isListening ? "listening" : ""} ${isAiSpeaking ? "speaking" : ""}`}>
          <div className="voice-wave wave-1" />
          <div className="voice-wave wave-2" />
          <div className="voice-wave wave-3" />
          <div className="voice-orb">
            {isAiSpeaking ? <Volume2 size={36} /> : isListening ? <Mic size={36} /> : <Sparkles size={36} />}
          </div>
        </div>

        <div className="voice-status-badge">
          <span>{statusText}</span>
        </div>

        {/* Conversation Stream Cards */}
        <div className="voice-speech-boxes">
          {transcript && (
            <div className="voice-bubble user">
              <strong>{t("you")}</strong>
              <p>{transcript}</p>
            </div>
          )}
          {aiResponse && (
            <div className="voice-bubble assistant">
              <div className="bubble-head">
                <strong>{t("nabta")}</strong>
                <button
                  type="button"
                  className="voice-mini-btn"
                  onClick={() => {
                    unlockAudio();
                    if (isAiSpeaking) {
                      stopSpeaking();
                      setIsAiSpeaking(false);
                    } else if (isOpenRef.current) {
                      setIsAiSpeaking(true);
                      speakText(aiResponse, lang, {
                        rate: speechRate,
                        onEnd: () => {
                          if (!isOpenRef.current) {
                            stopSpeaking();
                            return;
                          }
                          setIsAiSpeaking(false);
                        },
                      });
                    }
                  }}
                  title={isAiSpeaking ? "Stop voice" : "Read aloud"}
                >
                  {isAiSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>
              <p>{aiResponse}</p>
            </div>
          )}
        </div>

        {/* Quick Voice Controls & Actions */}
        <div className="voice-quick-actions">
          <button type="button" className="voice-pill-action" onClick={teachMeLesson} disabled={isBusy}>
            <BookOpen size={14} />
            <span>{t("voiceTeachMeBtn")}</span>
          </button>
          <button type="button" className="voice-pill-action" onClick={explainSimpler} disabled={isBusy}>
            <Sparkles size={14} />
            <span>{t("voiceSimplerBtn")}</span>
          </button>
          <button type="button" className={`voice-pill-action ${speechRate < 1 ? "active" : ""}`} onClick={toggleSlower}>
            <RefreshCw size={14} />
            <span>{speechRate < 1 ? "1.0x Normal" : t("voiceSlowerBtn")}</span>
          </button>
        </div>

        {/* Main Microphone Button */}
        <div className="voice-footer-controls">
          <button
            type="button"
            className={`voice-mic-main ${isListening ? "active" : ""}`}
            onClick={toggleMic}
            title={isListening ? "Stop listening" : "Start speaking"}
          >
            {isListening ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
          <button
            type="button"
            className={`voice-mute-toggle ${isMuted ? "muted" : ""}`}
            onClick={() => {
              if (!isMuted) stopSpeaking();
              setIsMuted(!isMuted);
            }}
            title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};
