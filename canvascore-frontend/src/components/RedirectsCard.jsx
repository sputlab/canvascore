// Global Options › Redirects (admins): old addresses that forward to new ones. Renamed pages and items
// add theirs automatically; others can be added by hand. They take effect when the site is published.
import React, { useEffect, useState } from 'react';
import { CornerDownRight, Trash2, Plus } from 'lucide-react';
import { Card, Button, IconButton, Input, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

export default function RedirectsCard() {
  const [list, setList] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const load = () => fetch('api.php?action=get_redirects').then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      const data = await (await fetch('api.php?action=save_redirect', { method: 'POST', body: JSON.stringify({ from, to }) })).json();
      if (!data.success) { notify(data.message || __("The redirect was not saved."), 'error'); return; }
      notify(data.message || __("Redirect saved.")); setFrom(''); setTo(''); load();
    } catch { notify(__("The redirect was not saved (connection problem)."), 'error'); }
  };
  const remove = async (r) => {
    if (!(await confirmDialog({ title: __("Remove the redirect from {0}?", r.from_path), message: __("Visitors and search engines using the old address will get “page not found” after the next publish."), confirmLabel: __("Remove redirect"), danger: true }))) return;
    try {
      await fetch('api.php?action=delete_redirect', { method: 'POST', body: JSON.stringify({ from: r.from_path }) });
      load();
    } catch { notify(__("The redirect was not removed (connection problem)."), 'error'); }
  };

  return (
    <Card title={__("Redirects")} icon={CornerDownRight} description={__("Old addresses that send visitors (and search engines, with a permanent 301 on Apache) to the new ones. Renaming a published page or item adds one automatically.")}>
      {list === null ? <p className="ui-hint">{__("Loading…")}</p> : list.length === 0 ? <p className="ui-hint">{__("No redirects yet.")}</p> : (
        <div className="ui-table-wrap" style={{ marginBottom: 12 }}>
          <table className="ui-table">
            <thead><tr><th>{__("Old address")}</th><th>{__("Goes to")}</th><th></th><th className="ui-cell-actions" aria-label={__("Actions")}></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.from_path}>
                  <td><code>{r.from_path}</code></td>
                  <td><code>{r.to_path}</code></td>
                  <td>{Number(r.auto) ? <Badge>{__("automatic")}</Badge> : <Badge tone="accent">{__("added by hand")}</Badge>}</td>
                  <td className="ui-cell-actions"><IconButton icon={Trash2} label={__("Remove the redirect from {0}", r.from_path)} size="sm" onClick={() => remove(r)} style={{ color: '#f87171' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="ui-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="ui-label" style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>{__("Old address")}<Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={__("/old-page/")} /></label>
        <label className="ui-label" style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>{__("New address")}<Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={__("/new-page/ or https://…")} /></label>
        <Button type="submit" icon={Plus} disabled={!from.trim() || !to.trim()}>{__("Add redirect")}</Button>
      </form>
    </Card>
  );
}
