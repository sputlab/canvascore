import React, { useState, useEffect } from 'react';
import { Inbox, Download, Trash2, RefreshCw } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, Badge, SearchInput } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchRows = () => fetch('api.php?action=get_submissions')
    .then(res => res.json())
    .then(data => { if (Array.isArray(data)) setRows(data); setLoading(false); })
    .catch(() => setLoading(false));
  const load = () => { setLoading(true); fetchRows(); };
  useEffect(() => { fetchRows(); }, []);

  const exportCsv = async () => {
    try {
      const res = await fetch('api.php?action=export_submissions');
      const data = await res.json();
      if (!data.success) return;
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `form-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { notify(__("Export failed."), 'error'); }
  };

  const deleteOne = async (id) => {
    if (!(await confirmDialog({ title: __("Delete this submission?"), message: __("This cannot be undone."), confirmLabel: __("Delete"), danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_submission', { method: 'POST', body: JSON.stringify({ id }) })).json();
      if (!data || data.success === false) { notify(data && data.message || __("Could not delete the submission."), 'error'); return; }
      setRows((rs) => rs.filter(r => r.id !== id));
    } catch { notify(__("Could not delete the submission (connection problem)."), 'error'); }
  };

  const clearAll = async () => {
    if (!(await confirmDialog({ title: __("Delete ALL submissions?"), message: __("Every form submission is deleted. Export them first if you may need them. This cannot be undone."), confirmLabel: __("Delete all"), danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=clear_submissions', { method: 'POST', body: '{}' })).json();
      if (!data || data.success === false) { notify(data && data.message || __("Could not delete the submissions."), 'error'); return; }
      setRows([]);
    } catch { notify(__("Could not delete the submissions (connection problem)."), 'error'); }
  };

  const shown = rows.filter((r) => !query || JSON.stringify([r.form_id, r.page, r.data]).toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader icon={Inbox} title={__("Form Submissions")} description={__("Messages visitors sent through the site's forms.")}
        actions={<>
          <Button icon={RefreshCw} onClick={load}>{__("Refresh")}</Button>
          <Button variant="primary" icon={Download} onClick={exportCsv} disabled={!rows.length}>{__("Export CSV")}</Button>
          <Button variant="danger" icon={Trash2} onClick={clearAll} disabled={!rows.length}>{__("Clear all")}</Button>
        </>} />

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', maxWidth: 360 }}><SearchInput value={query} onChange={setQuery} placeholder={__("Search messages…")} label={__("Search submissions")} /></div>
          <span className="ui-hint">{shown.length} {__("of")} {rows.length}</span>
        </div>
      )}

      {loading ? <p className="ui-hint">{__("Loading…")}</p> : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={__("No submissions yet")}>{__("They will appear here when visitors send a form.")}</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map(r => (
            <article key={r.id} className="ui-card" style={{ margin: 0, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="ui-row" style={{ gap: 8 }}><Badge tone="accent">{r.form_id || 'form'}</Badge><span className="ui-hint">{r.created_at}{r.page ? ` · from ${r.page}` : ''}</span></span>
                <IconButton icon={Trash2} label={__("Delete submission")} size="sm" onClick={() => deleteOne(r.id)} style={{ color: '#f87171' }} />
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, margin: 0 }}>
                {Object.entries(r.data || {}).map(([k, v]) => (
                  <div key={k} style={{ background: '#0f172a', borderRadius: 8, padding: '8px 12px' }}>
                    <dt style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{k}</dt>
                    <dd style={{ margin: 0, fontSize: 13, color: '#f8fafc', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
