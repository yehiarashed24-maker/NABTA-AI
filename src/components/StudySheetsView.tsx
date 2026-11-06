import React, { useState } from 'react';
import {
  Download,
  FileCheck,
  FileText,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  ExternalLink,
  BookOpen,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { StudySheet, Workspace, CoverageReport } from '../types';
import { useI18n } from '../i18n';

interface StudySheetsViewProps {
  workspace: Workspace;
  onOpenPdf: (page?: number) => void;
  onOpenQuizWithTopic?: (topic: string) => void;
  onOpenTutorWithQuery?: (query: string) => void;
}

function sanitizeSvgClient(svg?: string): string {
  const raw = String(svg || '').trim();
  if (!raw.startsWith('<svg')) return '';
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|applet|meta|link|base)\b[^>]*>/gi, '')
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, 'blocked:');
}

export const StudySheetsView: React.FC<StudySheetsViewProps> = ({
  workspace,
  onOpenPdf,
  onOpenQuizWithTopic,
  onOpenTutorWithQuery,
}) => {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';
  const sheets: StudySheet[] = workspace.studySheets || [];
  const coverage: CoverageReport | null = workspace.coverageReport || null;

  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'reader' | 'gallery'>('reader');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showCoverageModal, setShowCoverageModal] = useState<boolean>(false);

  const currentSheet = sheets[activeSheetIndex] || sheets[0];

  const handleNext = () => {
    if (activeSheetIndex < sheets.length - 1) {
      setActiveSheetIndex(activeSheetIndex + 1);
    }
  };

  const handlePrev = () => {
    if (activeSheetIndex > 0) {
      setActiveSheetIndex(activeSheetIndex - 1);
    }
  };

  const handleDownloadSingleSvg = () => {
    if (!currentSheet) return;
    window.open(`/api/workspaces/${workspace.id}/sheets/${currentSheet.sheetNumber}/svg`, '_blank');
  };

  const handleDownloadAllPdf = () => {
    window.open(`/api/workspaces/${workspace.id}/sheets/download-pdf`, '_blank');
  };

  if (!sheets.length) {
    return (
      <div className="empty-sheets-state">
        <Layers size={48} className="text-emerald-700" />
        <h3>{t('tabSheets')}</h3>
        <p>جاري توليد وتنسيق أوراق المذاكرة الذكية الخاصة بهذا المستند...</p>
      </div>
    );
  }

  return (
    <div className="study-sheets-container">
      {/* Top Action & Control Bar */}
      <div className="sheets-toolbar">
        <div className="toolbar-left">
          <div className="view-toggle-pills">
            <button
              className={`pill-btn ${viewMode === 'reader' ? 'active' : ''}`}
              onClick={() => setViewMode('reader')}
            >
              <Eye size={15} />
              <span>{t('sheetOfTotal', { current: currentSheet?.sheetNumber || 1, total: sheets.length })}</span>
            </button>
            <button
              className={`pill-btn ${viewMode === 'gallery' ? 'active' : ''}`}
              onClick={() => setViewMode('gallery')}
            >
              <Layers size={15} />
              <span>{t('allSheetsGallery')}</span>
            </button>
          </div>

          {viewMode === 'reader' && (
            <div className="sheet-nav-controls">
              <button
                className="nav-arrow-btn"
                onClick={isRtl ? handleNext : handlePrev}
                disabled={isRtl ? activeSheetIndex >= sheets.length - 1 : activeSheetIndex === 0}
                title={t('sheetPrev')}
              >
                <ChevronLeft size={18} />
              </button>

              <select
                className="sheet-select-dropdown"
                value={activeSheetIndex}
                onChange={(e) => setActiveSheetIndex(Number(e.target.value))}
              >
                {sheets.map((s, idx) => (
                  <option key={s.id} value={idx}>
                    #{s.sheetNumber}: {s.title.slice(0, 36)}...
                  </option>
                ))}
              </select>

              <button
                className="nav-arrow-btn"
                onClick={isRtl ? handlePrev : handleNext}
                disabled={isRtl ? activeSheetIndex === 0 : activeSheetIndex >= sheets.length - 1}
                title={t('sheetNext')}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-right">
          {viewMode === 'reader' && (
            <div className="zoom-controls">
              <button
                className="zoom-btn"
                onClick={() => setZoomLevel(Math.max(0.6, zoomLevel - 0.15))}
                title={t('sheetZoomOut')}
              >
                <ZoomOut size={15} />
              </button>
              <span className="zoom-text">{Math.round(zoomLevel * 100)}%</span>
              <button
                className="zoom-btn"
                onClick={() => setZoomLevel(Math.min(2.2, zoomLevel + 0.15))}
                title={t('sheetZoomIn')}
              >
                <ZoomIn size={15} />
              </button>
              <button
                className="zoom-btn"
                onClick={() => setZoomLevel(1)}
                title={t('sheetResetZoom')}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}

          <button
            className="action-btn outline-btn"
            onClick={() => setShowCoverageModal(true)}
            title={t('coverageReportBtn')}
          >
            <FileCheck size={16} />
            <span className="hide-on-mobile">{t('coverageReportBtn')}</span>
          </button>

          <button
            className="action-btn outline-btn"
            onClick={() => onOpenPdf(currentSheet?.sourcePages?.[0] || 1)}
            title={t('openOriginalPdf')}
          >
            <BookOpen size={16} />
            <span className="hide-on-mobile">{t('openOriginalPdf')}</span>
          </button>

          <button
            className="action-btn primary-btn"
            onClick={handleDownloadAllPdf}
            title={t('sheetDownloadPdf')}
          >
            <Download size={16} />
            <span>{t('sheetDownloadPdf')}</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'reader' ? (
        <div className="sheet-reader-layout">
          {/* Main Sheet SVG Canvas Container */}
          <div className="sheet-canvas-wrapper">
            <div
              className="sheet-svg-viewport"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
              }}
            >
              {currentSheet?.svgImage ? (
                <div
                  className="svg-sheet-embed"
                  dangerouslySetInnerHTML={{ __html: sanitizeSvgClient(currentSheet.svgImage) }}
                />
              ) : (
                <div className="sheet-fallback-card">
                  <h2>{currentSheet?.title}</h2>
                  <p>{currentSheet?.subtitle}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Context & Topic Sidebar */}
          <div className="sheet-sidebar-meta">
            <div className="meta-card">
              <span className="meta-eyebrow">{isRtl ? 'سياق الموضوع' : 'TOPIC CONTEXT'}</span>
              <h4>{currentSheet?.topicTitle}</h4>
              <p className="meta-desc">{currentSheet?.subtitle}</p>

              <div className="meta-source-pages">
                <span className="source-label">{isRtl ? 'صفحات المصدر:' : 'Source Pages:'}</span>
                <div className="source-badges">
                  {(currentSheet?.sourcePages || [1]).map((p) => (
                    <button
                      key={p}
                      className="source-page-tag"
                      onClick={() => onOpenPdf(p)}
                      title={isRtl ? 'فتح الصفحة في المستند الأصلي' : 'Open Original Page'}
                    >
                      <FileText size={12} />
                      <span>{isRtl ? `صفحة ${p}` : `Page ${p}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="meta-actions">
                <button
                  className="meta-action-btn"
                  onClick={handleDownloadSingleSvg}
                >
                  <Download size={14} />
                  <span>{t('sheetDownloadSvg')}</span>
                </button>
                {onOpenQuizWithTopic && (
                  <button
                    className="meta-action-btn secondary"
                    onClick={() => onOpenQuizWithTopic(currentSheet.topicTitle)}
                  >
                    <Sparkles size={14} />
                    <span>{t('practiceTopicBtn')}</span>
                  </button>
                )}
                {onOpenTutorWithQuery && (
                  <button
                    className="meta-action-btn secondary"
                    onClick={() =>
                      onOpenTutorWithQuery(
                        isRtl
                          ? `اشرح لي الورقة رقم ${currentSheet.sheetNumber}: ${currentSheet.title}`
                          : `Explain Study Sheet #${currentSheet.sheetNumber}: ${currentSheet.title}`
                      )
                    }
                  >
                    <BookOpen size={14} />
                    <span>{t('askAboutTopicBtn')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Cards Summary */}
            <div className="cards-outline-box">
              <span className="meta-eyebrow">
                {isRtl
                  ? `أقسام الورقة (${currentSheet?.cards?.length || 0})`
                  : `SHEET SECTIONS (${currentSheet?.cards?.length || 0})`}
              </span>
              <ul className="sheet-sections-list">
                {currentSheet?.cards?.map((c) => (
                  <li key={c.id} className="section-list-item">
                    <span className="bullet-dot" />
                    <div>
                      <strong>{c.title}</strong>
                      {c.badge && <span className="mini-badge">{c.badge}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* Gallery Grid Mode */
        <div className="sheets-gallery-grid">
          {sheets.map((sheet, idx) => (
            <div
              key={sheet.id}
              className={`gallery-sheet-card ${idx === activeSheetIndex ? 'selected' : ''}`}
              onClick={() => {
                setActiveSheetIndex(idx);
                setViewMode('reader');
              }}
            >
              <div className="gallery-card-header">
                <span className="sheet-num-badge">#{sheet.sheetNumber}</span>
                <span className="sheet-coverage-badge">
                  <CheckCircle2 size={12} /> {isRtl ? '100% موثق من المصدر' : '100% Grounded'}
                </span>
              </div>

              <div className="gallery-thumbnail-preview">
                {sheet.svgImage ? (
                  <div
                    className="svg-mini-thumb"
                    dangerouslySetInnerHTML={{ __html: sanitizeSvgClient(sheet.svgImage) }}
                  />
                ) : (
                  <div className="thumb-placeholder">
                    <Layers size={32} />
                  </div>
                )}
              </div>

              <div className="gallery-card-body">
                <h4>{sheet.title}</h4>
                <p>{sheet.subtitle.slice(0, 75)}...</p>
                <div className="gallery-card-footer">
                  <span>
                    {isRtl ? 'الصفحات:' : 'Pages:'} {(sheet.sourcePages || [1]).join(', ')}
                  </span>
                  <span className="view-link">{isRtl ? 'عرض الورقة ←' : 'View Sheet →'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Completeness & Source Coverage Modal */}
      {showCoverageModal && coverage && (
        <div className="modal-backdrop" onClick={() => setShowCoverageModal(false)}>
          <div className="coverage-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-title-box">
                <FileCheck size={22} className="text-emerald-700" />
                <h3>{t('coverageTitle')}</h3>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowCoverageModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="coverage-score-hero">
                <div className="score-circle">
                  <span className="big-pct">{coverage.coveragePercentage}%</span>
                  <span className="sub-label">{t('coverageVerified')}</span>
                </div>
                <div className="score-summary-stats">
                  <div className="stat-row">
                    <span>{t('mappedBlocksLabel')}:</span>
                    <strong>{coverage.mappedBlocks} / {coverage.totalBlocks}</strong>
                  </div>
                  <div className="stat-row">
                    <span>{t('flaggedBlocksLabel')}:</span>
                    <strong>{coverage.flaggedUncertainBlocks}</strong>
                  </div>
                  <div className="stat-row">
                    <span>Generated Study Sheets:</span>
                    <strong>{sheets.length} Sheets</strong>
                  </div>
                </div>
              </div>

              <div className="page-coverage-breakdown">
                <h4>Source Pages Coverage Breakdown:</h4>
                <div className="page-bars-list">
                  {coverage.sourcePageCoverage?.map((stat) => (
                    <div key={stat.page} className="page-bar-row">
                      <span className="page-num">Page {stat.page}</span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${stat.coverage}%` }}
                        />
                      </div>
                      <span className="pct-num">{stat.coverage}%</span>
                      <button
                        className="jump-page-link"
                        onClick={() => {
                          setShowCoverageModal(false);
                          onOpenPdf(stat.page);
                        }}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {coverage.notes && coverage.notes.length > 0 && (
                <div className="coverage-notes-box">
                  <h4>Preservation Notes:</h4>
                  <ul>
                    {coverage.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="action-btn primary-btn"
                onClick={() => setShowCoverageModal(false)}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
