import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Sparkles,
  FileText,
  Layers,
  ChevronRight,
  ChevronDown,
  Globe2,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  Lightbulb,
  Split,
  Table,
  Target,
  RefreshCw,
} from 'lucide-react';
import { Workspace, TopicExplanation, ExplanationsData } from '../types';
import { useI18n } from '../i18n';

interface ExplanationsViewProps {
  workspace: Workspace;
  onOpenPdf: (page?: number) => void;
  onOpenSheet: (sheetNum: number) => void;
  onOpenQuizWithTopic: (topic: string) => void;
  onOpenTutorWithQuery: (query: string) => void;
  onRefreshWorkspace: () => Promise<void>;
}

export const ExplanationsView: React.FC<ExplanationsViewProps> = ({
  workspace,
  onOpenPdf,
  onOpenSheet,
  onOpenQuizWithTopic,
  onOpenTutorWithQuery,
  onRefreshWorkspace,
}) => {
  const { t, lang, setLang } = useI18n();
  const isRtl = lang === 'ar';

  const explanations: ExplanationsData | null = workspace.explanations || null;
  const topics: TopicExplanation[] = explanations?.topics || [];

  const [activeTopicId, setActiveTopicId] = useState<string>(topics[0]?.topicId || '');
  const [selectedLanguage, setSelectedLanguage] = useState<'ar_eg' | 'ar_msa' | 'en'>(
    explanations?.language || (lang === 'en' ? 'en' : 'ar_eg')
  );
  const [isChangingLanguage, setIsChangingLanguage] = useState<boolean>(false);

  useEffect(() => {
    if (explanations?.language && explanations.language !== selectedLanguage) {
      setSelectedLanguage(explanations.language);
    }
  }, [explanations?.language]);

  const isArView = selectedLanguage !== 'en';

  const activeTopic = topics.find((t) => t.topicId === activeTopicId) || topics[0];

  const handleLanguageChange = async (newLang: 'ar_eg' | 'ar_msa' | 'en') => {
    setSelectedLanguage(newLang);
    setLang(newLang === 'en' ? 'en' : 'ar');
    setIsChangingLanguage(true);
    try {
      await fetch(`/api/workspaces/${workspace.id}/explanations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang }),
      });
      await onRefreshWorkspace();
    } catch (err) {
      console.error('Failed to change explanation style:', err);
    } finally {
      setIsChangingLanguage(false);
    }
  };

  if (!topics.length) {
    return (
      <div className="empty-explanations-state">
        <BookOpen size={48} className="text-emerald-700" />
        <h3>{t('tabExplanations')}</h3>
        <p>
          {isRtl
            ? 'جاري إعداد الشروحات المنظمة والعميقة لمواضيع هذه المادة...'
            : 'Preparing structured topic-by-topic explanations for this material...'}
        </p>
      </div>
    );
  }

  return (
    <div className="explanations-container" dir={isArView ? 'rtl' : 'ltr'}>
      {/* Top Bar: Dialect / Style Selector */}
      <div className="explanations-header-bar">
        <div className="bar-left">
          <BookOpen size={20} className="text-emerald-800" />
          <div>
            <h3>{t('tabExplanations')}</h3>
            <span className="subtitle-text">
              {isArView
                ? `${topics.length} مواضيع منهجية موثقة ومربوطة بأوراق المذاكرة`
                : `${topics.length} grounded study topics linked to your study sheets`}
            </span>
          </div>
        </div>

        <div className="style-selector-box">
          <span className="style-label">
            <Globe2 size={15} /> {isArView ? 'أسلوب ولغة الشرح:' : 'Explanation Style:'}
          </span>
          <div className="style-pills">
            <button
              className={`style-pill ${selectedLanguage === 'ar_eg' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('ar_eg')}
              disabled={isChangingLanguage}
            >
              🇪🇬 {t('langStyleEg')}
            </button>
            <button
              className={`style-pill ${selectedLanguage === 'ar_msa' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('ar_msa')}
              disabled={isChangingLanguage}
            >
              🇸🇦 {t('langStyleMsa')}
            </button>
            <button
              className={`style-pill ${selectedLanguage === 'en' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('en')}
              disabled={isChangingLanguage}
            >
              🇬🇧 {t('langStyleEn')}
            </button>
          </div>
          {isChangingLanguage && <RefreshCw size={15} className="spin text-emerald-700" />}
        </div>
      </div>

      {/* Main Split Layout: Topics Sidebar + Detailed Explanation */}
      <div className="explanations-main-grid">
        {/* Topics Sidebar Navigation */}
        <aside className="topics-sidebar-nav">
          <span className="nav-heading">
            {isArView ? `المواضيع الدراسية (${topics.length})` : `Study Topics (${topics.length})`}
          </span>
          <div className="topics-menu-list">
            {topics.map((item, idx) => (
              <button
                key={item.topicId}
                className={`topic-menu-item ${activeTopic?.topicId === item.topicId ? 'active' : ''}`}
                onClick={() => setActiveTopicId(item.topicId)}
              >
                <div className="topic-num-circle">{idx + 1}</div>
                <div className="topic-menu-text">
                  <strong>{item.topicTitle}</strong>
                  <span className="pages-span">
                    {isArView ? 'صفحات:' : 'Pages:'} {(item.sourcePages || [1]).join(', ')}
                  </span>
                </div>
                <ChevronRight size={14} className="arrow-icon" />
              </button>
            ))}
          </div>
        </aside>

        {/* Active Topic Detailed Content */}
        {activeTopic && (
          <main className="topic-content-detail">
            {/* Topic Hero Card */}
            <div className="topic-hero-card">
              <div className="hero-top">
                <span className="topic-badge">
                  {isArView
                    ? `موضوع تعليمي #${topics.findIndex((t) => t.topicId === activeTopic.topicId) + 1}`
                    : `Study Topic #${topics.findIndex((t) => t.topicId === activeTopic.topicId) + 1}`}
                </span>
                <div className="hero-links">
                  {activeTopic.linkedSheetNumbers?.map((sNum) => (
                    <button
                      key={sNum}
                      className="link-sheet-btn"
                      onClick={() => onOpenSheet(sNum)}
                      title={isArView ? 'عرض ورقة المذاكرة الخاصة بهذا الموضوع' : 'Open linked study sheet'}
                    >
                      <Layers size={13} />
                      <span>{isArView ? `ورقة مذاكرة #${sNum}` : `Study Sheet #${sNum}`}</span>
                    </button>
                  ))}
                  {activeTopic.sourcePages?.map((p) => (
                    <button
                      key={p}
                      className="link-page-btn"
                      onClick={() => onOpenPdf(p)}
                      title={isArView ? 'فتح المستند الأصلي عند هذه الصفحة' : 'Open original PDF at this page'}
                    >
                      <FileText size={13} />
                      <span>{isArView ? `صفحة ${p}` : `Page ${p}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              <h2 className="topic-title">{activeTopic.topicTitle}</h2>
              <p className="topic-overview-lead">{activeTopic.overview}</p>

              {/* Action Buttons for this Topic */}
              <div className="topic-action-strip">
                <button
                  className="strip-btn primary"
                  onClick={() => onOpenQuizWithTopic(activeTopic.topicTitle)}
                >
                  <Target size={15} />
                  <span>{t('practiceTopicBtn')}</span>
                </button>
                <button
                  className="strip-btn secondary"
                  onClick={() =>
                    onOpenTutorWithQuery(
                      isArView
                        ? `اشرح لي بالتفصيل موضوع: ${activeTopic.topicTitle}`
                        : `Explain in detail the topic: ${activeTopic.topicTitle}`
                    )
                  }
                >
                  <MessageCircle size={15} />
                  <span>{t('askAboutTopicBtn')}</span>
                </button>
              </div>
            </div>

            {/* Intuitive Analogy / Simplified View */}
            {activeTopic.sections?.simplifiedAnalogy && (
              <div className="analogy-card">
                <div className="analogy-header">
                  <Lightbulb size={20} className="text-amber-600" />
                  <h4>{isArView ? 'الفكرة المبسطة (تشبيه ذهني سريع)' : 'Intuitive Mental Model & Analogy'}</h4>
                  <span className="badge-ai">{t('aiExplainBadge')}</span>
                </div>
                <p className="analogy-text">{activeTopic.sections.simplifiedAnalogy}</p>
              </div>
            )}

            {/* Detailed Walkthrough */}
            <div className="explanation-section-card">
              <div className="section-card-header">
                <h3>{isArView ? 'الشرح المنهجي المتعمق' : 'In-Depth Conceptual Walkthrough'}</h3>
                <span className="badge-grounded">{t('sourceFactBadge')}</span>
              </div>
              <div className="section-body-text">
                {activeTopic.sections?.detailedExplanation?.split('\n\n').map((paragraph, pIdx) => (
                  <p key={pIdx} style={{ whiteSpace: 'pre-line', lineHeight: 1.85 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            {/* Key Definitions & Terminology */}
            {activeTopic.sections?.definitions && activeTopic.sections.definitions.length > 0 && (
              <div className="definitions-section-card">
                <div className="section-card-header">
                  <h3>{isArView ? 'أهم المصطلحات والتعريفات' : 'Key Terminology & Definitions'}</h3>
                  <span className="badge-grounded">{t('sourceFactBadge')}</span>
                </div>
                <div className="definitions-grid">
                  {activeTopic.sections.definitions.map((def, dIdx) => (
                    <div key={dIdx} className="def-item-card">
                      <div className="def-term-header">
                        <span className="def-bullet" />
                        <h4>{def.term}</h4>
                        {def.sourcePages && def.sourcePages.length > 0 && (
                          <span className="page-pill">
                            {isArView ? `ص ${def.sourcePages.join(', ')}` : `p. ${def.sourcePages.join(', ')}`}
                          </span>
                        )}
                      </div>
                      <p className="def-meaning">{def.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step-by-Step Processes */}
            {activeTopic.sections?.stepByStepProcesses && activeTopic.sections.stepByStepProcesses.length > 0 && (
              <div className="process-section-card">
                <div className="section-card-header">
                  <h3>{isArView ? 'خطوات وآلية العمل التفصيلية' : 'Step-by-Step Mechanism & Workflow'}</h3>
                </div>
                <div className="process-steps-list">
                  {activeTopic.sections.stepByStepProcesses.map((st) => (
                    <div key={st.step} className="step-row-item">
                      <div className="step-num-badge">{st.step}</div>
                      <div className="step-content-box">
                        <strong>{st.action}</strong>
                        <p>{st.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Practical Examples */}
            {activeTopic.sections?.practicalExamples && activeTopic.sections.practicalExamples.length > 0 && (
              <div className="examples-section-card">
                <div className="section-card-header">
                  <h3>{isArView ? 'أمثلة وتطبيقات عملية واقعية' : 'Real-World Practical Examples'}</h3>
                  <span className="badge-ai">{t('aiExplainBadge')}</span>
                </div>
                <div className="examples-list">
                  {activeTopic.sections.practicalExamples.map((ex, eIdx) => (
                    <div key={eIdx} className="example-box">
                      <CheckCircle2 size={16} className="text-emerald-700" />
                      <p>{ex}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Concept Comparisons */}
            {activeTopic.sections?.conceptComparisons && activeTopic.sections.conceptComparisons.length > 0 && (
              <div className="comparisons-section-card">
                <div className="section-card-header">
                  <h3>{isArView ? 'مقارنات مفاهيمية وفروق جوهرية' : 'Conceptual Comparisons & Distinctions'}</h3>
                  <Split size={18} className="text-emerald-800" />
                </div>
                <div className="comparisons-grid">
                  {activeTopic.sections.conceptComparisons.map((cmp, cIdx) => (
                    <div key={cIdx} className="comparison-card">
                      <div className="cmp-vs-row">
                        <span className="concept-a">{cmp.conceptA}</span>
                        <span className="vs-tag">{isArView ? 'ضد' : 'VS'}</span>
                        <span className="concept-b">{cmp.conceptB}</span>
                      </div>
                      <p className="difference-text">{cmp.difference}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagram or Table Explanation */}
            {activeTopic.sections?.diagramOrTableExplanation && (
              <div className="diagram-explain-card">
                <div className="section-card-header">
                  <Table size={18} className="text-indigo-700" />
                  <h4>{isArView ? 'شرح الجداول والمخططات التوضيحية' : 'Tables & Diagrams Walkthrough'}</h4>
                  <span className="badge-grounded">{t('sourceFactBadge')}</span>
                </div>
                <p>{activeTopic.sections.diagramOrTableExplanation}</p>
              </div>
            )}

            {/* Explicit Source Grounding Breakdown */}
            <div className="grounding-audit-card">
              <div className="section-card-header">
                <h3>{isArView ? 'توثيق المصدر والتفريق المنهجي' : 'Source Grounding & AI Pedagogical Notes'}</h3>
              </div>
              <div className="audit-split-columns">
                <div className="audit-col source-col">
                  <div className="col-header">
                    <CheckCircle2 size={16} className="text-emerald-700" />
                    <strong>
                      {t('sourceFactBadge')} {isArView ? '(من المذكرة نصياً)' : '(Directly from Lecture)'}
                    </strong>
                  </div>
                  <ul>
                    {activeTopic.sections?.sourceGroundedPoints?.map((pt, pIdx) => (
                      <li key={pIdx}>{pt}</li>
                    ))}
                  </ul>
                </div>

                <div className="audit-col ai-col">
                  <div className="col-header">
                    <Sparkles size={16} className="text-indigo-600" />
                    <strong>
                      {t('aiExplainBadge')} {isArView ? '(توضيحات إضافية وتشبيهات)' : '(AI Tutor Analogies & Context)'}
                    </strong>
                  </div>
                  <ul>
                    {activeTopic.sections?.supplementaryAiPoints?.map((pt, pIdx) => (
                      <li key={pIdx}>{pt}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Exam Tips & Key Takeaways */}
            {activeTopic.sections?.keyTakeaways && activeTopic.sections.keyTakeaways.length > 0 && (
              <div className="takeaways-card">
                <div className="takeaways-header">
                  <AlertTriangle size={18} className="text-amber-600" />
                  <h4>{isArView ? 'خلاصة ليلة الامتحان ونقاط التركيز' : 'Exam Focus & Key Takeaways'}</h4>
                </div>
                <ul className="takeaways-list">
                  {activeTopic.sections.keyTakeaways.map((tk, tIdx) => (
                    <li key={tIdx}>{tk}</li>
                  ))}
                </ul>
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
};
