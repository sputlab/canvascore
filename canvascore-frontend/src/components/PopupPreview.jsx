// A preview of a popup in the editor: the same markup and style sheet as on the published site (canvascore-admin/popups.css), shown open over the editor.
import React, { useEffect, useRef } from 'react';
import { popupPreviewHtml } from '../editor/popups';
import { safeHtml } from '../utils/safeHtml';

const POPUPS_CSS = typeof __POPUPS_CSS__ !== 'undefined' ? __POPUPS_CSS__ : '';

export default function PopupPreview({ blocks, settings, name, onClose }) {
  const p = popupPreviewHtml(blocks, settings, name || 'Popup', safeHtml);
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    if (box.current) box.current.focus();
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); if (prev && prev.focus) prev.focus(); };
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000 }} data-testid="popup-preview">
      <style>{POPUPS_CSS}</style>
      <div className={p.className} style={p.style} role="dialog" aria-modal="true" aria-label={`Preview of ${p.label}`}>
        {p.overlay && <div className="cc-popup__overlay" onClick={onClose} />}
        <div className="cc-popup__box" tabIndex={-1} ref={box}>
          {p.closeButton && <button type="button" className="cc-popup__close" aria-label="Close the preview" onClick={onClose}>&times;</button>}
          <div className="cc-popup__content" dangerouslySetInnerHTML={{ __html: p.content }} />
        </div>
      </div>
      {!p.overlay && <button type="button" onClick={onClose} style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100001, padding: '8px 14px', borderRadius: 8, border: 0, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>Close the preview</button>}
    </div>
  );
}
