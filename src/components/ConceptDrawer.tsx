import React from "react";
import { X, Volume2, Target, MessageCircle, FileText, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import { speakText } from "../audio";
import { Concept, MasteryEvidence, Workspace } from "../types";

interface ConceptDrawerProps {
  concept: Concept | null;
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onPractice: (conceptName: string) => void;
  onAskTutor: (conceptName: string) => void;
}

export const ConceptDrawer: React.FC<ConceptDrawerProps> = ({
  concept,
  workspace,
  isOpen,
  onClose,
  onPractice,
  onAskTutor,
}) => {
  const { t, lang } = useI18n();

  if (!isOpen || !concept) return null;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "weak":
        return t("masteryWeakTitle");
      case "learning":
        return t("masteryLearningTitle");
      case "good":
        return t("masteryGoodTitle");
      case "strong":
        return t("masteryStrongTitle");
      default:
        return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "weak":
        return "status-weak";
      case "learning":
        return "status-learning";
      case "good":
        return "status-good";
      case "strong":
        return "status-strong";
      default:
        return "";
    }
  };

  // Find all evidence items for this concept
  const relevantEvidence = (workspace.masteryEvidence || []).filter(
    (e) => e.conceptId === concept.id || e.conceptName === concept.name
  );

  const handleListen = () => {
    const textToSpeak = `${concept.name}. ${concept.description}. Supporting pages: ${concept.sourcePages?.join(", ") || "General"}.`;
    speakText(textToSpeak, lang, { rate: 0.95 });
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="concept-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className={`drawer-status-pill ${getStatusClass(concept.masteryStatus)}`}>
              {getStatusLabel(concept.masteryStatus)} · {concept.masteryScore}%
            </span>
            <h2>{concept.name}</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-content">
          {/* Mastery Meter */}
          <div className="drawer-meter-box">
            <div className="meter-label-row">
              <span>{t("progMastery")}</span>
              <strong>{concept.masteryScore}%</strong>
            </div>
            <div className="drawer-meter-track">
              <div
                className={`drawer-meter-fill ${getStatusClass(concept.masteryStatus)}`}
                style={{ width: `${concept.masteryScore}%` }}
              />
            </div>
          </div>

          {/* Definition / Explanation */}
          <div className="drawer-section">
            <span className="section-label">{t("guideCoreConcepts")}</span>
            <p className="concept-desc">{concept.description}</p>
          </div>

          {/* Supporting Pages */}
          {concept.sourcePages && concept.sourcePages.length > 0 && (
            <div className="drawer-section">
              <span className="section-label">{t("supportingPages")}</span>
              <div className="page-pills">
                {concept.sourcePages.map((pg) => (
                  <span key={pg} className="page-pill">
                    <FileText size={13} /> {t("pageCitation", { page: pg })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Log */}
          <div className="drawer-section">
            <span className="section-label">{t("masteryEvidenceTitle")}</span>
            {relevantEvidence.length > 0 ? (
              <div className="evidence-timeline">
                {relevantEvidence.slice(-5).map((ev) => (
                  <div key={ev.id} className="evidence-item">
                    <div className={`evidence-icon ${ev.scoreDelta >= 0 ? "positive" : "negative"}`}>
                      {ev.scoreDelta >= 0 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    </div>
                    <div className="evidence-body">
                      <span>{ev.reason}</span>
                      <small>
                        {ev.scoreDelta > 0 ? `+${ev.scoreDelta}%` : `${ev.scoreDelta}%`} ·{" "}
                        {new Date(ev.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="evidence-empty">
                Baseline assessment assigned from initial document processing. Take a practice quiz to generate evidence.
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="drawer-actions">
          <button
            type="button"
            className="drawer-action-btn primary"
            onClick={() => {
              onPractice(concept.name);
              onClose();
            }}
          >
            <Target size={15} />
            <span>{t("masteryPracticeConceptBtn")}</span>
          </button>
          <button
            type="button"
            className="drawer-action-btn subtle"
            onClick={() => {
              onAskTutor(concept.name);
              onClose();
            }}
          >
            <MessageCircle size={15} />
            <span>{t("masteryAskTutorBtn")}</span>
          </button>
          <button
            type="button"
            className="drawer-action-btn subtle"
            onClick={handleListen}
            title={t("masteryListenBtn")}
          >
            <Volume2 size={15} />
            <span>{t("masteryListenBtn")}</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
