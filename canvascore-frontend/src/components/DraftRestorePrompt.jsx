import React, { useState } from 'react';
import { notify } from '../ui/notify';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { listDrafts, clearDraft, describeDraft } from '../session/drafts';
import { applyDraftToStore } from '../session/draftTrackers';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

const ago = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  return Math.round(h / 24) + ' d ago';
};

// On startup (after a refresh or a new session): offers to recover unsaved work.
export default function DraftRestorePrompt() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const username = useStore((s) => s.username);
  const sessionExpired = useStore((s) => s.sessionExpired);
  const user = isAuthenticated && username ? username : null;
  // One check per sign-in: the backup is re-read only when the signed-in user changes.
  const [check, setCheck] = useState({ user: null, items: null });
  if (check.user !== user) {
    const found = user ? listDrafts(user) : [];
    setCheck({ user, items: found.length ? found : null });
  }
  const items = check.user === user ? check.items : null;
  const setItems = (v) => setCheck((c) => ({ ...c, items: v }));

  if (!items || sessionExpired) return null;

  const restore = (entry) => {
    const view = applyDraftToStore(entry, useStore.setState);
    if (!view) { notify(__("This backup could not be restored."), 'error'); return; }
    setItems(null);
  };
  const discard = async (entry) => {
    const d = describeDraft(entry);
    if (!(await confirmDialog({ title: __("Discard the unsaved changes to \"{0}\"?", d.title), message: __("They were never saved to the site. This cannot be undone."), confirmLabel: __("Discard changes"), danger: true }))) return;
    clearDraft(entry.scope, username);
    const rest = items.filter((x) => x.scope !== entry.scope);
    setItems(rest.length ? rest : null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cc-restore-title"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147481000, background: 'rgba(2,6,23,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '520px', background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '22px', color: '#f8fafc', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <h2 id="cc-restore-title" style={{ margin: '0 0 6px', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '9px' }}><History size={19} color="#38bdf8" /> {__("Unsaved work found")}</h2>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
          {__("These changes were backed up on this device but never saved to the site (for example because the session expired). Restore them to keep working.")}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '45vh', overflowY: 'auto' }}>
          {items.map((entry) => {
            const d = describeDraft(entry);
            return (
              <div key={entry.scope} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.4px' }}>{d.kind}</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{__("Backed up")} {ago(entry.savedAt)}</div>
                </div>
                <button onClick={() => restore(entry)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '7px', padding: '7px 11px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}><RotateCcw size={13} /> {__("Restore")}</button>
                <button onClick={() => discard(entry)} title={__("Discard")} aria-label={__("Discard {0}", d.title)} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: '7px', padding: '7px', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={() => setItems(null)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: '12.5px' }}>{__("Decide later")}</button>
        </div>
      </div>
    </div>
  );
}
