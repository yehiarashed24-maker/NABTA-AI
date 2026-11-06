import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Workspace } from '../types';
import { useI18n } from '../i18n';

interface OriginalPdfModalProps {
  workspace: Workspace;
  isOpen: boolean;
  initialPage?: number;
  onClose: () => void;
}

export const OriginalPdfModal: React.FC<OriginalPdfModalProps> = ({
  workspace,
  isOpen,
  initialPage = 1,
  onClose,
}) => {
  const { t } = useI18n();
  const [page, setPage] = useState<number>(initialPage);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  if (!isOpen) return null;

  const doc = workspace.documents[0];
  const fileUrl = doc ? `/api/workspaces/${workspace.id}/documents/${doc.id}/file#page=${page}` : '';

  return (
    <div className={`original-pdf-overlay ${isMaximized ? 'maximized' : ''}`}>
      <div className="original-pdf-window">
        {/* Window Header */}
        <div className="pdf-window-header">
          <div className="header-left">
            <FileText size={18} className="text-emerald-700" />
            <div>
              <strong>{doc?.name || 'Original Document'}</strong>
              <span className="page-info">
                · {doc?.pageCount || 1} {t('pages')}
              </span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="win-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <a
              href={`/api/workspaces/${workspace.id}/documents/${doc?.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="win-btn"
              title="Open in new tab"
            >
              <ExternalLink size={16} />
            </a>
            <button className="win-btn close" onClick={onClose} title={t('close')}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PDF Viewer Iframe */}
        <div className="pdf-viewer-frame-box">
          {doc ? (
            <iframe
              src={fileUrl}
              title={doc.name}
              className="pdf-iframe"
            />
          ) : (
            <div className="empty-pdf-message">
              <p>لم يتم العثور على ملف PDF أصلي في هذا الدفتر.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
