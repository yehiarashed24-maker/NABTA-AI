import React, { useState } from 'react';
import {
  X,
  Target,
  Sliders,
  Sparkles,
  Layers,
  FileText,
  AlertCircle,
  CheckSquare,
  Square,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { Workspace, Quiz } from '../types';
import { useI18n } from '../i18n';

interface CustomQuizBuilderModalProps {
  workspace: Workspace;
  isOpen: boolean;
  initialTopic?: string;
  onClose: () => void;
  onQuizCreated: (quiz: Quiz) => void;
}

export const CustomQuizBuilderModal: React.FC<CustomQuizBuilderModalProps> = ({
  workspace,
  isOpen,
  initialTopic = '',
  onClose,
  onQuizCreated,
}) => {
  const { t } = useI18n();
  const topics = workspace.semanticTopics || [];
  const sheets = workspace.studySheets || [];
  const totalPages = workspace.documents[0]?.pageCount || 1;

  const [scopeType, setScopeType] = useState<
    'lecture' | 'topic' | 'multi_topic' | 'pages' | 'sheets' | 'weak_topics'
  >(initialTopic ? 'topic' : 'lecture');

  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    topics.find((t) => t.title.toLowerCase().includes(initialTopic.toLowerCase()))?.id || topics[0]?.id || ''
  );
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    topics.slice(0, 2).map((t) => t.id)
  );
  const [pagesInput, setPagesInput] = useState<string>('1-3');
  const [selectedSheetNumbers, setSelectedSheetNumbers] = useState<number[]>([1, 2]);

  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq', 'true_false', 'short']);
  const [showInstantFeedback, setShowInstantFeedback] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const toggleQuestionType = (type: string) => {
    if (questionTypes.includes(type)) {
      if (questionTypes.length > 1) {
        setQuestionTypes(questionTypes.filter((t) => t !== type));
      }
    } else {
      setQuestionTypes([...questionTypes, type]);
    }
  };

  const toggleMultiTopic = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      if (selectedTopicIds.length > 1) {
        setSelectedTopicIds(selectedTopicIds.filter((t) => t !== id));
      }
    } else {
      setSelectedTopicIds([...selectedTopicIds, id]);
    }
  };

  const toggleSheetNumber = (num: number) => {
    if (selectedSheetNumbers.includes(num)) {
      if (selectedSheetNumbers.length > 1) {
        setSelectedSheetNumbers(selectedSheetNumbers.filter((n) => n !== num));
      }
    } else {
      setSelectedSheetNumbers([...selectedSheetNumbers, num]);
    }
  };

  const parsePagesRange = (str: string): number[] => {
    const pages: number[] = [];
    const parts = str.split(',');
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.max(1, start); p <= Math.min(totalPages, end); p++) {
            pages.push(p);
          }
        }
      } else {
        const p = parseInt(part.trim(), 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          pages.push(p);
        }
      }
    }
    return pages.length ? [...new Set(pages)] : [1];
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');

    let scopePayload: any = { type: scopeType };
    if (scopeType === 'topic') {
      scopePayload.topicId = selectedTopicId;
    } else if (scopeType === 'multi_topic') {
      scopePayload.topicIds = selectedTopicIds;
    } else if (scopeType === 'pages') {
      scopePayload.pages = parsePagesRange(pagesInput);
    } else if (scopeType === 'sheets') {
      scopePayload.sheetNumbers = selectedSheetNumbers;
    } else if (scopeType === 'weak_topics') {
      scopePayload.type = 'weak_topics';
    }

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: scopePayload,
          count: questionCount,
          difficulty,
          questionTypes,
          showInstantFeedback,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create quiz');
      }

      const newQuiz: Quiz = await res.json();
      onQuizCreated(newQuiz);
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء توليد الاختبار.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="custom-quiz-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-title-box">
            <Target size={22} className="text-emerald-700" />
            <div>
              <h3>{t('customQuizBuilderTitle')}</h3>
              <span className="sub-tag">تحديد دقيق لنطاق الأسئلة وأنواعها ومستوى الصعوبة</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body custom-quiz-body">
          {error && (
            <div className="error-alert-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Quiz Scope Selection */}
          <div className="quiz-setting-block">
            <label className="block-label">{t('quizScopeLabel')}:</label>
            <div className="scope-pills-grid">
              <button
                type="button"
                className={`scope-pill ${scopeType === 'lecture' ? 'active' : ''}`}
                onClick={() => setScopeType('lecture')}
              >
                {t('quizScopeLecture')}
              </button>
              <button
                type="button"
                className={`scope-pill ${scopeType === 'topic' ? 'active' : ''}`}
                onClick={() => setScopeType('topic')}
              >
                {t('quizScopeTopic')}
              </button>
              <button
                type="button"
                className={`scope-pill ${scopeType === 'multi_topic' ? 'active' : ''}`}
                onClick={() => setScopeType('multi_topic')}
              >
                {t('quizScopeMultiTopic')}
              </button>
              <button
                type="button"
                className={`scope-pill ${scopeType === 'pages' ? 'active' : ''}`}
                onClick={() => setScopeType('pages')}
              >
                {t('quizScopePages')}
              </button>
              <button
                type="button"
                className={`scope-pill ${scopeType === 'sheets' ? 'active' : ''}`}
                onClick={() => setScopeType('sheets')}
              >
                {t('quizScopeSheets')}
              </button>
              <button
                type="button"
                className={`scope-pill ${scopeType === 'weak_topics' ? 'active' : ''}`}
                onClick={() => setScopeType('weak_topics')}
              >
                {t('quizScopeWeak')}
              </button>
            </div>

            {/* Scope Parameter Inputs */}
            {scopeType === 'topic' && (
              <div className="sub-scope-picker">
                <label>اختر الموضوع المراد اختباره:</label>
                <select
                  className="modal-select-input"
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                >
                  {topics.map((top) => (
                    <option key={top.id} value={top.id}>
                      {top.title} (صفحات: {(top.sourcePages || [1]).join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scopeType === 'multi_topic' && (
              <div className="sub-scope-picker">
                <label>حدد المواضيع (موضوعين أو أكثر):</label>
                <div className="checkbox-items-wrap">
                  {topics.map((top) => {
                    const isChecked = selectedTopicIds.includes(top.id);
                    return (
                      <button
                        key={top.id}
                        type="button"
                        className={`item-chip ${isChecked ? 'checked' : ''}`}
                        onClick={() => toggleMultiTopic(top.id)}
                      >
                        {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                        <span>{top.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scopeType === 'pages' && (
              <div className="sub-scope-picker">
                <label>أدخل نطاق الصفحات (مثلاً: 2-5 أو 1, 3, 7):</label>
                <input
                  type="text"
                  className="modal-text-input"
                  value={pagesInput}
                  onChange={(e) => setPagesInput(e.target.value)}
                  placeholder="e.g. 1-4 or 2, 5"
                />
                <span className="input-hint">إجمالي صفحات المستند: {totalPages} صفحة</span>
              </div>
            )}

            {scopeType === 'sheets' && (
              <div className="sub-scope-picker">
                <label>حدد أوراق المذاكرة المصممة:</label>
                <div className="checkbox-items-wrap">
                  {sheets.map((s) => {
                    const isChecked = selectedSheetNumbers.includes(s.sheetNumber);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`item-chip ${isChecked ? 'checked' : ''}`}
                        onClick={() => toggleSheetNumber(s.sheetNumber)}
                      >
                        {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                        <span>ورقة #{s.sheetNumber}: {s.title.slice(0, 28)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. Question Types Checkboxes */}
          <div className="quiz-setting-block">
            <label className="block-label">{t('quizTypesLabel')}:</label>
            <div className="types-selection-grid">
              <label
                className={`type-option-card ${questionTypes.includes('mcq') ? 'active' : ''}`}
                onClick={() => toggleQuestionType('mcq')}
              >
                <input
                  type="checkbox"
                  checked={questionTypes.includes('mcq')}
                  readOnly
                />
                <div>
                  <strong>{t('quizTypeMcq')}</strong>
                  <p>4 خيارات مع إجابة صحيحة واحدة وتوضيح تربوي للخيارات.</p>
                </div>
              </label>

              <label
                className={`type-option-card ${questionTypes.includes('true_false') ? 'active' : ''}`}
                onClick={() => toggleQuestionType('true_false')}
              >
                <input
                  type="checkbox"
                  checked={questionTypes.includes('true_false')}
                  readOnly
                />
                <div>
                  <strong>{t('quizTypeTrueFalse')}</strong>
                  <p>عبارات لتأكيد الفهم الدقيق والتمييز بين المفاهيم.</p>
                </div>
              </label>

              <label
                className={`type-option-card ${questionTypes.includes('short') ? 'active' : ''}`}
                onClick={() => toggleQuestionType('short')}
              >
                <input
                  type="checkbox"
                  checked={questionTypes.includes('short')}
                  readOnly
                />
                <div>
                  <strong>{t('quizTypeShort')}</strong>
                  <p>أسئلة كتابية تقيَّم بدقة بناءً على سلم تصحيح ونقاط معيارية.</p>
                </div>
              </label>

              <label
                className={`type-option-card ${questionTypes.includes('scenario') ? 'active' : ''}`}
                onClick={() => toggleQuestionType('scenario')}
              >
                <input
                  type="checkbox"
                  checked={questionTypes.includes('scenario')}
                  readOnly
                />
                <div>
                  <strong>{t('quizTypeScenario')}</strong>
                  <p>مشكلات تطبيقية وسيناريوهات تحاكي الامتحانات الواقعية.</p>
                </div>
              </label>
            </div>
          </div>

          {/* 3. Number of Questions & Difficulty */}
          <div className="quiz-settings-dual-row">
            <div className="setting-col">
              <label className="block-label">
                عدد الأسئلة: <span className="highlight-val">{questionCount} أسئلة</span>
              </label>
              <input
                type="range"
                min={3}
                max={15}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="range-slider-input"
              />
              <div className="slider-limits">
                <span>3</span>
                <span>10</span>
                <span>15</span>
              </div>
            </div>

            <div className="setting-col">
              <label className="block-label">{t('quizDifficulty')}:</label>
              <div className="difficulty-pill-group">
                {(['easy', 'medium', 'hard', 'adaptive'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`diff-pill ${difficulty === d ? 'active' : ''}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {d === 'easy' ? 'سهل' : d === 'medium' ? 'متوسط' : d === 'hard' ? 'متقدم' : 'تكيفي ⚡'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Instant Feedback Option */}
          <div className="feedback-toggle-row">
            <label className="toggle-label" onClick={() => setShowInstantFeedback(!showInstantFeedback)}>
              <input
                type="checkbox"
                checked={showInstantFeedback}
                onChange={() => {}}
              />
              <span>{t('instantFeedbackLabel')}</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="action-btn outline-btn" onClick={onClose} disabled={loading}>
            {t('cancel')}
          </button>
          <button className="action-btn primary-btn" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>جاري توليد الاختبار...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>{t('generateQuizBtn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
