import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AuthenticatedImage } from '../common/AuthenticatedImage';

export const GoToViewpointIcon: React.FC<{ className?: string }> = ({
  className = 'w-3.5 h-3.5',
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const ExpandImageIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
    <path d="M11 8v6M8 11h6" />
  </svg>
);

interface ViewpointImageModalProps {
  isOpen: boolean;
  src: string | null;
  title: string;
  canNavigate3D?: boolean;
  onNavigate3D?: () => void;
  onClose: () => void;
}

export const ViewpointImageModal: React.FC<ViewpointImageModalProps> = ({
  isOpen,
  src,
  title,
  canNavigate3D = false,
  onNavigate3D,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !src) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-asphalt-700 bg-asphalt-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-asphalt-700 bg-asphalt-950 px-3.5 py-2.5">
          <h4 className="truncate text-xs font-semibold text-asphalt-100">
            {title}
          </h4>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigate3D && (
              <button
                type="button"
                disabled={!canNavigate3D}
                onClick={() => {
                  onNavigate3D();
                  onClose();
                }}
                title="Ir al punto de vista en el visor 3D"
                className="inline-flex items-center gap-1.5 rounded border border-pavasal-500/50 bg-pavasal-500/15 px-2.5 py-1 text-[11px] font-semibold text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:opacity-40 transition-colors"
              >
                <GoToViewpointIcon className="w-3.5 h-3.5" />
                <span>Ir al punto de vista</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar imagen (Esc)"
              aria-label="Cerrar imagen"
              className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-xs text-asphalt-200 hover:border-asphalt-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center overflow-auto bg-asphalt-950/90 p-3 min-w-[280px] min-h-[200px]">
          <AuthenticatedImage
            src={src}
            alt={title}
            className="max-h-[78vh] max-w-[86vw] w-auto h-auto object-contain rounded"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ViewpointImageModal;
