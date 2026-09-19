import React, { useState } from "react";
import { X, Sparkles, Loader2, Layers } from "lucide-react";
import { useI18n } from "../i18n";
import { Workspace, Quiz } from "../types";

interface QuizModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onQuizCreated: (quiz: Quiz) => void;
  initialTopic?: string;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onQuizCreated,
  initialTopic = "",
}) => {
  const { t, lang } = useI18n();
  const [questionType, setQuestionType] = useState<"mcq" | "essay" | "mixed">("mixed");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "adaptive">("medium");
  const [count, setCount] = useState(5);
  const [scope, setScope] = useState<"entire" | "concept" | "page" | "weak" | "custom">("entire");
  const [selectedConcept, setSelectedConcept] = useState("");
  const [selectedPage, setSelectedPage] = useState<number | "">("");
  const [customTopic, setCustomTopic] = useState(initialTopic);
  const [quizLanguage, setQuizLanguage] = useState<"ar" | "en" | "same">(lang === "ar" ? "ar" : "en");
  const [mcqRatio, setMcqRatio] = useState(0.6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    let resolvedTopic = "";
    if (scope === "concept" && selectedConcept) {
      resolvedTopic = `Concept: ${selectedConcept}`;
    } else if (scope === "page" && selectedPage) {
      resolvedTopic = `Page ${selectedPage}`;
    } else if (scope === "weak") {
      resolvedTopic = `Weak Topics: ${workspace.weakTopics?.slice(0, 2).join(", ") || "General Weak Areas"}`;
    } else if (scope === "custom" && customTopic.trim()) {
      resolvedTopic = customTopic.trim();
    }

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionType,
          difficulty,
          count,
          topic: resolvedTopic,
          language: quizLanguage,
          mcqRatio: questionType === "mixed" ? mcqRatio : questionType === "mcq" ? 1.0 : 0.0,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to generate quiz");
      }

      const createdQuiz: Quiz = await res.json();
      onQuizCreated(createdQuiz);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to generate quiz");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="quiz-generator-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleCreate}
      >
        <div className="modal-top">
          <div>
            <span className="eyebrow">{t("quizModalTitle")}</span>
            <h2>{t("quizModalTitle")}</h2>
            <p>{t("quizModalDesc")}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {/* Question Type Selection */}
        <div className="modal-field">
          <label>{t("quizTypeLabel")}</label>
          <div className="button-group-row">
            <button
              type="button"
              className={questionType === "mcq" ? "active" : ""}
              onClick={() => setQuestionType("mcq")}
            >
              {t("quizTypeMcq")}
            </button>
            <button
              type="button"
              className={questionType === "essay" ? "active" : ""}
              onClick={() => setQuestionType("essay")}
            >
              {t("quizTypeEssay")}
            </button>
            <button
              type="button"
              className={questionType === "mixed" ? "active" : ""}
              onClick={() => setQuestionType("mixed")}
            >
              {t("quizTypeMixed")}
            </button>
          </div>
        </div>

        {/* If Mixed: Ratio selector */}
        {questionType === "mixed" && (
          <div className="modal-field">
            <label>
              {t("quizMixedRatioLabel")}: {Math.round((1 - mcqRatio) * 100)}% Essay / {Math.round(mcqRatio * 100)}% MCQ
            </label>
            <input
              type="range"
              min="0.2"
              max="0.8"
              step="0.1"
              value={mcqRatio}
              onChange={(e) => setMcqRatio(parseFloat(e.target.value))}
            />
          </div>
        )}

        {/* Difficulty */}
        <div className="modal-field">
          <label>{t("quizDiffLabel")}</label>
          <div className="button-group-row four-col">
            <button
              type="button"
              className={difficulty === "easy" ? "active" : ""}
              onClick={() => setDifficulty("easy")}
            >
              {t("diffEasy")}
            </button>
            <button
              type="button"
              className={difficulty === "medium" ? "active" : ""}
              onClick={() => setDifficulty("medium")}
            >
              {t("diffMedium")}
            </button>
            <button
              type="button"
              className={difficulty === "hard" ? "active" : ""}
              onClick={() => setDifficulty("hard")}
            >
              {t("diffHard")}
            </button>
            <button
              type="button"
              className={difficulty === "adaptive" ? "active" : ""}
              onClick={() => setDifficulty("adaptive")}
            >
              {t("diffAdaptive")}
            </button>
          </div>
        </div>

        {/* Question Count & Language */}
        <div className="modal-grid-2">
          <div className="modal-field">
            <label>{t("quizCountLabel")}</label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={5}>5 Questions</option>
              <option value={10}>10 Questions</option>
              <option value={15}>15 Questions</option>
              <option value={20}>20 Questions</option>
            </select>
          </div>

          <div className="modal-field">
            <label>{t("quizLangLabel")}</label>
            <select
              value={quizLanguage}
              onChange={(e) => setQuizLanguage(e.target.value as any)}
            >
              <option value="ar">{t("quizLangAr")}</option>
              <option value="en">{t("quizLangEn")}</option>
              <option value="same">{t("quizLangSame")}</option>
            </select>
          </div>
        </div>

        {/* Topic Scope */}
        <div className="modal-field">
          <label>{t("quizTopicScopeLabel")}</label>
          <div className="button-group-row wrap">
            <button
              type="button"
              className={scope === "entire" ? "active" : ""}
              onClick={() => setScope("entire")}
            >
              {t("quizTopicEntireDoc")}
            </button>
            {workspace.concepts && workspace.concepts.length > 0 && (
              <button
                type="button"
                className={scope === "concept" ? "active" : ""}
                onClick={() => setScope("concept")}
              >
                {t("quizTopicConcept")}
              </button>
            )}
            <button
              type="button"
              className={scope === "page" ? "active" : ""}
              onClick={() => setScope("page")}
            >
              {t("quizTopicPage")}
            </button>
            <button
              type="button"
              className={scope === "weak" ? "active" : ""}
              onClick={() => setScope("weak")}
            >
              {t("quizTopicWeak")}
            </button>
            <button
              type="button"
              className={scope === "custom" ? "active" : ""}
              onClick={() => setScope("custom")}
            >
              {t("quizTopicCustom")}
            </button>
          </div>

          {scope === "concept" && workspace.concepts && (
            <select
              className="mt-2"
              value={selectedConcept}
              onChange={(e) => setSelectedConcept(e.target.value)}
            >
              <option value="">Select a concept…</option>
              {workspace.concepts.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} ({c.masteryScore}% mastery)
                </option>
              ))}
            </select>
          )}

          {scope === "page" && (
            <input
              type="number"
              className="mt-2"
              min={1}
              max={workspace.documents?.[0]?.pageCount || 100}
              placeholder={`Enter page number (1 - ${workspace.documents?.[0]?.pageCount || 10})`}
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value ? Number(e.target.value) : "")}
            />
          )}

          {scope === "custom" && (
            <input
              type="text"
              className="mt-2"
              placeholder={t("quizTopicCustomPlaceholder")}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
            />
          )}
        </div>

        <button type="submit" className="primary-submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          <span>{busy ? t("quizGenerating") : t("quizStartBtn")}</span>
        </button>
      </form>
    </div>
  );
};
