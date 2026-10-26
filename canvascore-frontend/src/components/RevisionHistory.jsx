// Version history of the page (or collection item) open in the editor: every save with changed content
// is kept on the server (the newest 40). Pick one to preview it, then restore it into the editor as an
// unsaved change: Ctrl/Cmd+Z undoes the restore, Save Draft / Publish keeps it.
import React, { useEffect, useRef, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { safeHtml } from '../utils/safeHtml';
import { renderBlock } from '../render/renderBlock.mjs';
import { Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

const when = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString(); };

export default function RevisionHistory({ owner, onClose }) {
  const replaceBlocks = useStore((s) => s.replaceBlocks);
  const [list, setList] = useState(null);       // null = loading
  const [sel, setSel] = useState(null);         // { id, blocks, … }
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('api.php?action=get_revisions&owner=' + encodeURIComponent(owner)).then((r) => r.json())
      .then((d) => { if (alive) setList(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) { setList([]); notify(__("Could not load the history."), 'error'); } });
    if (closeRef.current) closeRef.current.focus();
    return () => { alive = false; };
  }, [owner]);

  const open = async (rev) => {
    setBusy(true);
    try {
      const d = await (await fetch('api.php?action=get_revision&id=' + rev.id)).json();
      let blocks = [];
      try { blocks = JSON.parse(d.content_json || '[]'); } catch { blocks = []; }
      setSel({ ...rev, blocks: Array.isArray(blocks) ? blocks : [] });
    } catch { notify(__("Could not open that version."), 'error'); }
    setBusy(false);
  };

  const restore = async () => {
    if (!sel) return;
    const ok = await confirmDialog({ title: __("Restore this version?"), message: __("The page content goes back to the version of {0}. Nothing is saved until you click Save Draft or Publish, and Ctrl/Cmd+Z undoes it.", when(sel.created_at)), confirmLabel: __("Restore version") });
    if (!ok) return;
    replaceBlocks(sel.blocks);
    notify(__("Version of {0} restored. Save Draft or Publish to keep it.", when(sel.created_at)));
    onClose();
  };

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-dialog cc-history" role="dialog" aria-modal="true" aria-labelledby="cc-hist-title"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
        <div className="ui-dialog__head" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ui-dialog__icon" aria-hidden="true"><History size={18} /></span>
            <h2 id="cc-hist-title" className="ui-dialog__title">{__("Version history")}</h2>
          </span>
          <button ref={closeRef} type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label={__("Close")} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cc-history__body">
          <ul className="cc-history__list" aria-label={__("Saved versions")}>
            {list === null && <li className="ui-hint">{__("Loading…")}</li>}
            {list && list.length === 0 && <li className="ui-hint">{__("No saved versions yet. Every Save Draft or Publish that changes the page adds one.")}</li>}
            {(list || []).map((r, i) => (
              <li key={r.id}>
                <button type="button" className="cc-history__item" aria-current={sel && sel.id === r.id ? 'true' : undefined} onClick={() => open(r)}>
                  <span style={{ fontWeight: 600 }}>{when(r.created_at)}{i === 0 ? ' · latest' : ''}</span>
                  <span className="ui-row" style={{ gap: 6 }}>
                    <Badge tone={r.kind === 'published' ? 'published' : 'draft'}>{r.kind === 'published' ? __("Published") : __("Draft")}</Badge>
                    {r.author && <span className="ui-hint">{r.author}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="cc-history__preview" aria-live="polite">
            {!sel ? <p className="ui-hint" style={{ padding: 12 }}>{busy ? __("Opening…") : __("Pick a version to preview it.")}</p> : (
              <>
                <div className="cc-history__frame"><div className="cc-canvas cc-history__page" dangerouslySetInnerHTML={{ __html: safeHtml(sel.blocks.map((b) => renderBlock(b)).join('').replace(/<style data-cc-device>[\s\S]*?<\/style>\n?/g, '')) }} /></div>
                <div className="ui-dialog__actions" style={{ marginTop: 10 }}>
                  <button type="button" className="ui-btn ui-btn--primary" onClick={restore}><RotateCcw size={15} aria-hidden="true" /> {__("Restore this version")}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
