import React from "react";
import { CheckCircle2, HelpCircle, BookOpen } from "lucide-react";

interface FormattedMessageProps {
  content: string;
  isAssistant?: boolean;
}

/**
 * Strips raw markdown noise (asterisks, stray hashes, raw quotes) and renders
 * structured, clean, eye-friendly cards and typography for students.
 */
export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content, isAssistant }) => {
  if (!isAssistant) {
    return <div className="user-message-text">{content}</div>;
  }

  // Pre-clean content:
  // Remove robotic greeting intros if present
  let text = content
    .replace(/^أهلاً بك!?\s*بصفتي\s*(\*\*.*?\*\*|[^*—\n]+)[—\n]*/i, "")
    .replace(/ملاحظة هامة:.*?أتمنى لك كل التوفيق.*?$/msi, "")
    .trim();

  // Split into paragraphs / logical sections by double newlines or horizontal dividers
  const rawSections = text.split(/(?:\r?\n){2,}|(?:\n---+\n)/);

  return (
    <div className="formatted-assistant-message" dir="auto">
      {rawSections.map((sec, secIdx) => {
        const trimmed = sec.trim();
        if (!trimmed || trimmed === "---") return null;

        // Check if section is a major heading (e.g. # or ### or starts with 📚)
        if (/^#{1,4}\s+/.test(trimmed)) {
          const headingText = trimmed.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "").trim();
          return (
            <div key={secIdx} className="message-section-heading">
              <BookOpen size={16} className="heading-icon" />
              <h4>{headingText}</h4>
            </div>
          );
        }

        // Check if section is highlighting the correct answer
        const isCorrectAnswer =
          /(?:الإجابة الصحيحة|Correct Answer|الخيار الصحيح)/i.test(trimmed);

        if (isCorrectAnswer) {
          return (
            <div key={secIdx} className="message-correct-card">
              <div className="correct-card-header">
                <CheckCircle2 size={16} />
                <span>الإجابة الصحيحة</span>
              </div>
              <div className="correct-card-body">{renderLines(trimmed)}</div>
            </div>
          );
        }

        // Check if section contains a Question block (e.g., "السؤال الأول" or "> **السؤال:**" or "Question 1:")
        const isQuestionBlock =
          /(?:السؤال\s*(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)|Question\s*\d+|>\s*\*{0,2}السؤال)/i.test(trimmed);

        if (isQuestionBlock) {
          return (
            <div key={secIdx} className="message-question-card">
              <div className="question-card-badge">
                <HelpCircle size={15} />
                <span>سؤال من المحاضرة</span>
              </div>
              <div className="question-card-content">
                {renderLines(trimmed)}
              </div>
            </div>
          );
        }

        // Standard educational section / paragraph
        return (
          <div key={secIdx} className="message-section-block">
            {renderLines(trimmed)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Render individual lines, detecting bullet points, options (A, B, C, D), and paragraphs cleanly.
 */
function renderLines(sectionText: string): React.ReactNode {
  const lines = sectionText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className="section-lines">
      {lines.map((line, lineIdx) => {
        // Strip blockquote marker >
        let cleanLine = line.replace(/^>\s*/, "");

        // Check for subheadings (### or bold question title)
        if (/^###\s+/.test(cleanLine)) {
          const title = cleanLine.replace(/^###\s+/, "").replace(/\*\*/g, "");
          return (
            <h5 key={lineIdx} className="section-subheading" dir="auto">
              {title}
            </h5>
          );
        }

        // Highlight correct answer row cleanly without BiDi scrambling
        const correctLineMatch = cleanLine.match(/^(?:[\*\-•]\s*)?(?:\*\*)?(?:الإجابة الصحيحة|Correct Answer|الخيار الصحيح)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+)$/i);
        if (correctLineMatch) {
          const rawAnswer = correctLineMatch[1].replace(/\*\*/g, "").trim();
          const optMatch = rawAnswer.match(/^(?:الخيار\s*)?(?:\(?\s*([A-D])\s*[\)\.\:]?|\(([A-D])\))(?:\s+(.+))?$/i);
          if (optMatch) {
            const letter = (optMatch[1] || optMatch[2]).toUpperCase();
            const text = (optMatch[3] || "").trim().replace(/^[\)\:\.\-]\s*/, "");
            return (
              <div key={lineIdx} className="correct-answer-highlight-row" dir="auto">
                <span className="option-letter highlighted" dir="ltr">{letter}</span>
                {text ? <span className="correct-answer-text" dir="auto">{formatInlineText(text)}</span> : null}
              </div>
            );
          }
          return (
            <div key={lineIdx} className="correct-answer-highlight-row" dir="auto">
              <span className="correct-answer-text" dir="auto">{formatInlineText(rawAnswer)}</span>
            </div>
          );
        }

        // Detect explanation row
        const explMatch = cleanLine.match(/^(?:[\*\-•]\s*)?(?:\*\*)?(?:الشرح|التوضيح|Explanation|Reason)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+)$/i);
        if (explMatch) {
          const explText = explMatch[1].replace(/\*\*/g, "").trim();
          return (
            <div key={lineIdx} className="correct-answer-explanation-row" dir="auto">
              <strong className="explanation-label">الشرح:</strong>
              <span className="explanation-text" dir="auto">{formatInlineText(explText)}</span>
            </div>
          );
        }

        // Detect multiple-choice options like * A) ... or A) ... or A. ... or **A)** ...
        const optionMatch = cleanLine.match(/^(?:[\*\-•]\s*)?(?:\*\*)?(?:\(?\s*([A-D])\s*[\)\.\:\-]|\(([A-D])\))\s*(?:\*\*)?\s*(.+)$/i);
        if (optionMatch) {
          const letter = (optionMatch[1] || optionMatch[2]).toUpperCase();
          const text = optionMatch[3].replace(/\*\*/g, "").trim();
          return (
            <div key={lineIdx} className="mcq-option-line" dir="auto">
              <span className="option-letter" dir="ltr">{letter}</span>
              <span className="option-text" dir="auto">{formatInlineText(text)}</span>
            </div>
          );
        }

        // Detect bullet points (* or - or •)
        const isBullet = /^[\*\-•]\s+/.test(cleanLine);
        if (isBullet) {
          const text = cleanLine.replace(/^[\*\-•]\s+/, "");
          return (
            <div key={lineIdx} className="bullet-point-line" dir="auto">
              <span className="bullet-dot" dir="ltr">•</span>
              <span className="bullet-text" dir="auto">{formatInlineText(text)}</span>
            </div>
          );
        }

        // Regular line
        return (
          <p key={lineIdx} className="regular-line" dir="auto">
            {formatInlineText(cleanLine)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Parses inline text: converts **bold** into <strong>, strips stray asterisks/hashes,
 * ensures no raw symbols like `**`, `*`, `###` appear in the student's view.
 */
function formatInlineText(raw: string): React.ReactNode {
  // Split on **bold** patterns
  const parts = raw.split(/(\*\*[^*]+?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2).trim();
      return (
        <strong key={i} className="clean-strong">
          {inner}
        </strong>
      );
    }
    // Clean out stray asterisks or hashes from plain text
    const cleaned = part.replace(/\*+/g, "").replace(/^#+\s*/g, "");
    return <React.Fragment key={i}>{cleaned}</React.Fragment>;
  });
}
