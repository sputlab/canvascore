// Popups: windows that open over the site when something happens (a delay, scrolling, the visitor about to leave, a click on a link), built from blocks
// like a page. The list: what each one does and when, with Edit (the page editor, with the popup's own settings), Duplicate, Publish / Unpublish and Delete.
// A published popup goes onto the pages it applies to at the next Publish Site.
import React, { useCallback, useEffect, useState } from 'react';
import { AppWindow, Plus, Pencil, Copy, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, IconButton, PageHeader, EmptyState, StatusBadge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { STARTERS, defaultSettings, triggerSummary, rulesSummary } from '../editor/popups';
import { __, _n } from '../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

export default function Popups() {
  const { setView, setActivePage, setBlocks, setSelectedBlockId } = useStore();
  const [list, setList] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetch('api.php?action=get_popups').then((r) => r.json())
    .then((d) => setList(Array.isArray(d) ? d : []))
    .catch(() => { setList([]); notify(__("Could not load the popups."), 'error'); }), []);
  useEffect(() => { load(); }, [load]);

  const openEditor = (p, blocks) => {
    setActivePage({ id: p.id, __popup: true, title: p.name, slug: '', status: p.status === 'published' ? 'published' : 'draft', settings: p.settings, layout: 'full', bg_color: '#ffffff', boxed_width: '1100px', seo_title: '', seo_description: '' });
    setBlocks(blocks);
    setSelectedBlockId(null);
    setView('editor');
  };
  const edit = async (p) => {
    try {
      const d = await (await fetch('api.php?action=get_popup&id=' + encodeURIComponent(p.id))).json();
      if (!d || !d.id) { notify(__("This popup no longer exists."), 'error'); load(); return; }
      let blocks = []; try { blocks = JSON.parse(d.content_json || '[]'); } catch { blocks = []; }
      openEditor({ id: d.id, name: d.name, status: d.status, settings: d.settings }, Array.isArray(blocks) ? blocks : []);
    } catch { notify(__("Could not open the popup (connection problem)."), 'error'); }
  };
  const create = async (starter) => {
    setPicking(false); setBusy(true);
    try {
      const blocks = starter.blocks();
      const settings = defaultSettings();
      const d = await post('save_popup', { name: starter.id === 'blank' ? __("New popup") : starter.name, status: 'draft', blocks, settings });
      if (!d.success) { notify(d.message || __("The popup was not created."), 'error'); return; }
      openEditor({ id: d.id, name: starter.id === 'blank' ? __("New popup") : starter.name, status: 'draft', settings }, blocks);
    } catch { notify(__("The popup was not created (connection problem)."), 'error'); } finally { setBusy(false); }
  };
  const copyOf = async (p) => {
    try {
      const full = await (await fetch('api.php?action=get_popup&id=' + encodeURIComponent(p.id))).json();
      let blocks = []; try { blocks = JSON.parse(full.content_json || '[]'); } catch { blocks = []; }
      const d = await post('save_popup', { name: `${p.name} (copy)`, status: 'draft', blocks, settings: full.settings });
      notify(d.success ? __("Duplicated as a draft.") : d.message || __("Not duplicated."), d.success ? 'success' : 'error');
      load();
    } catch { notify(__("Not duplicated (connection problem)."), 'error'); }
  };
  const setStatus = async (p, status) => {
    try {
      const full = await (await fetch('api.php?action=get_popup&id=' + encodeURIComponent(p.id))).json();
      let blocks = []; try { blocks = JSON.parse(full.content_json || '[]'); } catch { blocks = []; }
      const d = await post('save_popup', { id: p.id, name: p.name, status, blocks, settings: full.settings });
      notify(d.message || (d.success ? __("Done.") : __("Not changed.")), d.success ? 'success' : 'error');
      load();
    } catch { notify(__("Not changed (connection problem)."), 'error'); }
  };
  const remove = async (p) => {
    if (!(await confirmDialog({ title: __("Delete the popup “{0}”?", p.name), message: __("It disappears from the site at the next publish. This cannot be undone."), confirmLabel: __("Delete popup"), danger: true }))) return;
    const d = await post('delete_popup', { id: p.id });
    notify(d.success ? __("Popup deleted.") : d.message || __("Not deleted."), d.success ? 'success' : 'error');
    load();
  };

  return (
    <>
      <PageHeader icon={AppWindow} title={__("Popups")} description={__("Windows that open over your pages: a newsletter box after a few seconds, an offer when the visitor is about to leave… Built from blocks like a page; you choose what makes them appear and where, for whom and how often.")}
        actions={<Button variant="primary" icon={Plus} onClick={() => setPicking(true)} disabled={busy}>{__("New popup")}</Button>} />
      {list === null ? <p className="ui-hint">{__("Loading…")}</p> : list.length === 0 ? (
        <EmptyState icon={AppWindow} title={__("No popups yet")} action={<Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>{__("Create the first popup")}</Button>}>
          {__("A popup is shown on the site only when it is published and the site is published.")}
        </EmptyState>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table" aria-label={__("Popups")}>
            <thead><tr><th>{__("Popup")}</th><th>{__("Status")}</th><th>{__("When it appears")}</th><th>{__("Rules")}</th><th className="ui-cell-actions">{__("Actions")}</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} data-popup={p.id} onDoubleClick={() => edit(p)}>
                  <td style={{ maxWidth: 260 }}><div className="ui-cell-title" title={p.name}>{p.name}</div><div className="ui-cell-muted">{_n(p.blocks, "block", "blocks")}</div></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="ui-cell-muted">{triggerSummary(p.settings)}</td>
                  <td className="ui-cell-muted">{rulesSummary(p.settings)}</td>
                  <td className="ui-cell-actions">
                    <span className="ui-row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }}>
                      <Button variant="primary" size="sm" icon={Pencil} onClick={() => edit(p)}>{__("Edit")}</Button>
                      <IconButton icon={p.status === 'published' ? EyeOff : Eye} label={p.status === 'published' ? __("Unpublish {0}", p.name) : __("Publish {0}", p.name)} size="sm" onClick={() => setStatus(p, p.status === 'published' ? 'draft' : 'published')} />
                      <IconButton icon={Copy} label={__("Duplicate {0}", p.name)} size="sm" onClick={() => copyOf(p)} />
                      <IconButton icon={Trash2} label={__("Delete {0}", p.name)} size="sm" onClick={() => remove(p)} style={{ color: '#f87171' }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picking && (
        <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPicking(false); }}>
          <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="cc-newpop-title" style={{ width: 'min(520px, 100%)' }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setPicking(false); } }}>
            <div className="ui-dialog__head" style={{ justifyContent: 'space-between' }}>
              <h2 id="cc-newpop-title" className="ui-dialog__title">{__("New popup: start from…")}</h2>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label={__("Close")} onClick={() => setPicking(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {STARTERS.map((st) => (
                <button key={st.id} type="button" className="ui-btn" data-starter={st.id} onClick={() => create(st)} style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '10px 14px', display: 'block' }}>
                  <strong style={{ display: 'block' }}>{st.name}</strong><span className="ui-hint">{st.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
