// Administration › Template library (admin): starter pages, sections and full-site kits shared by the community. The list is the
// library's signed index; a kit is downloaded, checked against the index and cleaned like an editor's save (custom code is dropped)
// before anything is added. Pages arrive as drafts; sections go to Add › My templates; a site kit's header, footer, menu and colours are
// applied only when asked, after a safety copy that Restore puts back. A kit can also be installed from a file.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Store, Upload, RefreshCw, FileText, LayoutTemplate, Layers, AlertTriangle, CheckCircle2, Undo2, X, Download } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, PageHeader, Badge, EmptyState, SearchInput, Segmented, Checkbox } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { postForm } from '../editor/upload';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
const TYPES = [['all', 'All'], ['page', 'Pages'], ['section', 'Sections'], ['site', 'Site kits']];
const TYPE_LABEL = { page: 'Page', section: 'Sections', site: 'Site kit' };
const TYPE_ICON = { page: FileText, section: Layers, site: LayoutTemplate };
const when = (s) => String(s || '').replace('T', ' ').slice(0, 16);

// Asks before a kit is installed: what it will add, and for a site kit whether to apply its design
function InstallDialog({ kit, onCancel, onInstall }) {
  const [design, setDesign] = useState(false);
  const adds = kit.type === 'file' ? 'what the file holds: draft pages, sections for Add › My templates, or the pages of a whole site' : kit.type === 'page' ? 'one draft page' : kit.type === 'section' ? 'its sections to Add › My templates' : `${kit.pages || 'its'} draft page${kit.pages === 1 ? '' : 's'}`;
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cc-kit-title" style={{ width: 'min(520px, 100%)' }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
        <div className="ui-dialog__head"><h2 id="cc-kit-title" className="ui-dialog__title">Install “{kit.name}”?</h2></div>
        <p className="ui-dialog__msg">It adds {adds}. Nothing you already have is replaced or deleted, and pages arrive as <strong>drafts</strong> with free addresses. Anything in the kit that runs code (Custom HTML, custom CSS or JavaScript, form email addresses) is left out.</p>
        {(kit.type === 'site' || kit.type === 'file') && (
          <div style={{ margin: '4px 0 8px' }}>
            <Checkbox label={kit.type === 'file' ? 'If it is a site kit, also apply its design: header, footer, menu and colours' : 'Also apply its design: header, footer, menu and colours'} checked={design} onChange={(e) => setDesign(e.target.checked)} />
            <p className="ui-hint" role="note">{design ? 'Your current header, footer, menu and colours are replaced. A safety copy is kept: Restore puts them back.' : 'Your header, footer, menu and colours stay as they are.'}</p>
          </div>
        )}
        <div className="ui-dialog__actions">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={Download} onClick={() => onInstall({ design })}>Install the kit</Button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateLibrary() {
  const { setView, setActivePage, setBlocks, setSelectedBlockId } = useStore();
  const fileRef = useRef(null);
  const [data, setData] = useState(null);       // the answer of library_index
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState(null);   // the kit whose install dialog is open
  const [fileOpts, setFileOpts] = useState(null);   // { file } while the install dialog of a chosen file is open
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);   // the last install's answer: { kit, success, message, result, errors }

  // The library's list: an effect asks without touching the loading flag (it starts as loading); a button sets it first
  const fetchIndex = useCallback((refresh) => fetch(`api.php?action=library_index${refresh ? '&refresh=1' : ''}`).then((r) => r.json())
    .then((d) => { setData(d && d.success ? d : { kits: [], installed: [], error: (d && d.message) || 'Could not load the library.' }); })
    .catch(() => setData({ kits: [], installed: [], error: 'Could not load the library (connection problem).' }))
    .finally(() => setLoading(false)), []);
  const load = useCallback((refresh) => { setLoading(true); return fetchIndex(refresh); }, [fetchIndex]);
  useEffect(() => { fetchIndex(false); }, [fetchIndex]);

  const finish = (d, name) => {
    setResult({ name, success: !!(d && d.success), message: (d && d.message) || 'Unexpected answer from the server.', result: d && d.result, errors: (d && d.errors) || [] });
    if (d && d.success) { notify(d.message); load(false); } else notify((d && d.message) || 'The kit was not installed.', 'error');
  };
  const install = async (kit, opts) => {
    setAsking(null); setBusy(kit.id); setResult(null);
    try { finish(await post('library_install', { id: kit.id, options: opts }), kit.name); } catch { finish({ success: false, message: 'Connection problem: the kit may not have arrived.' }, kit.name); }
    setBusy('');
  };
  const installFile = async (file, opts) => {
    setFileOpts(null); setBusy('file'); setResult(null);
    try {
      const form = new FormData();
      form.append('kit', file, file.name); form.append('options', JSON.stringify(opts));
      finish(await postForm('library_install_file', form, {}), file.name);
    } catch { finish({ success: false, message: 'Connection problem: the kit may not have arrived.' }, file.name); }
    setBusy('');
  };
  const undo = async (row) => {
    if (!(await confirmDialog({ title: `Restore the design from before “${row.name}”?`, message: 'Your previous header, footer, menu and colours come back. The pages the kit added stay.', confirmLabel: 'Restore' }))) return;
    const d = await post('library_undo', { install_id: row.install_id });
    notify(d.message || (d.success ? 'Restored.' : 'Not restored.'), d.success ? 'success' : 'error');
    if (d.success) { setResult(null); load(false); }
  };
  const openPage = async (id) => {
    try {
      const pages = await (await fetch('api.php?action=get_pages')).json();
      const page = (Array.isArray(pages) ? pages : []).find((p) => p.id === id);
      if (!page) { setView('manager'); return; }
      setActivePage(page);
      try { setBlocks(JSON.parse(page.content_json || '[]')); } catch { setBlocks([]); }
      setSelectedBlockId(null);
      setView('editor');
    } catch { notify('Could not open the page (connection problem).', 'error'); }
  };

  const q = query.trim().toLowerCase();
  const kits = ((data && data.kits) || []).filter((k) => (type === 'all' || k.type === type) && (!q || `${k.name} ${k.author} ${k.description} ${(k.tags || []).join(' ')}`.toLowerCase().includes(q)));
  const installed = (data && data.installed) || [];
  const off = !data || data.demo || data.zip === false;

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader icon={Store} title="Template library" description="Starter pages, sections and full-site kits shared by the community. Install one, then change it like anything you made."
        actions={<>
          <Button icon={RefreshCw} onClick={() => load(true)} disabled={loading}>Refresh</Button>
          <Button icon={Upload} onClick={() => fileRef.current && fileRef.current.click()} disabled={off || !!busy}>Install from a file…</Button>
          <input ref={fileRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} aria-label="Kit file"
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) setFileOpts({ file: f }); }} />
        </>} />

      {data && data.demo && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>The template library is turned off in the demo.</span></div>}
      {data && data.zip === false && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>The PHP zip extension is not available on this server, so kits cannot be installed.</span></div>}
      {data && data.error && <div role="alert" className="cc-backup-alert" data-testid="lib-error"><AlertTriangle size={16} aria-hidden="true" /><span>{data.error}</span></div>}
      {data && data.warning && <div role="status" className="cc-backup-alert" data-testid="lib-warning"><AlertTriangle size={16} aria-hidden="true" /><span>{data.warning}</span></div>}

      {result && (
        <div className={`cc-backup-result${result.success ? '' : ' cc-backup-result--error'}`} role="status" data-testid="lib-result" style={{ marginBottom: 14 }}>
          {result.success ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
          <span style={{ flex: 1 }}>
            <strong>{result.message}</strong>
            {result.errors.length > 0 && <ul className="cc-update-steps" aria-label="Problems found">{result.errors.map((e, i) => <li key={i} data-ok="false"><AlertTriangle size={13} aria-hidden="true" /> {e}</li>)}</ul>}
            {result.success && result.result && (
              <>
                {result.result.pages.length > 0 && (
                  <ul className="cc-update-steps" aria-label="Pages added">
                    {result.result.pages.map((p) => (
                      <li key={p.id} data-ok="true">{p.title} <span className="ui-hint">/{p.slug}/</span>{p.home ? <> <Badge tone="accent">its home page</Badge></> : null} <Button size="sm" variant="ghost" onClick={() => openPage(p.id)}>Open</Button></li>
                    ))}
                  </ul>
                )}
                {result.result.templates > 0 && <p className="ui-hint">Find them in the page editor under <strong>Add › My templates</strong>.</p>}
                {result.result.images > 0 && <p className="ui-hint">{result.result.images} image{result.result.images === 1 ? '' : 's'} added to the Media library (folder Library).</p>}
                {result.result.dropped_code > 0 && <p className="ui-hint" role="note">{result.result.dropped_code} Custom HTML block{result.result.dropped_code === 1 ? ' was' : 's were'} left empty: kits cannot bring code.</p>}
                {result.result.pages.some((p) => p.home) && <p className="ui-hint">To use its home page as your Home, open it and tick “Set as home” in Page settings, then publish.</p>}
              </>
            )}
          </span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label="Dismiss" onClick={() => setResult(null)}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Segmented label="Kind of kit" value={type} onChange={setType} options={TYPES} />
        <div style={{ flex: '1 1 220px', maxWidth: 320 }}><SearchInput value={query} onChange={setQuery} placeholder="Search the library…" label="Search kits" /></div>
      </div>

      {loading && !data ? <p className="ui-hint">Loading…</p> : kits.length === 0 ? (
        <EmptyState icon={Store} title={data && (data.kits || []).length ? 'No kit matches' : 'The library has no kits to show'}>
          {data && (data.kits || []).length ? 'Try another word, or another kind.' : (data && data.error ? 'See the message above. You can still install a kit from a file.' : 'Nothing is published yet. You can install a kit from a file.')}
        </EmptyState>
      ) : (
        <div className="ui-grid" style={{ '--ui-min': '250px', gap: 16 }} aria-label="Kits">
          {kits.map((k) => {
            const Icon = TYPE_ICON[k.type] || FileText;
            return (
              <article key={k.id} className="ui-card" data-kit={k.id} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', margin: 0 }}>
                <div style={{ height: 150, background: 'linear-gradient(135deg, #0f172a, #1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  {k.preview ? <img src={`api.php?action=library_preview&id=${encodeURIComponent(k.id)}`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon size={36} aria-hidden="true" />}
                </div>
                <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 15, color: '#f8fafc' }}>{k.name}</h2>
                    <Badge tone="accent">{TYPE_LABEL[k.type]}</Badge>
                    {k.installed && <Badge tone="published">Installed {k.installed}</Badge>}
                  </div>
                  <p className="ui-hint" style={{ margin: 0 }}>{k.author ? `by ${k.author} · ` : ''}v{k.version}{k.license ? ` · ${k.license}` : ''}{k.type === 'site' && k.pages ? ` · ${k.pages} pages` : ''}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>{k.description}</p>
                  {k.tags && k.tags.length > 0 && <p className="ui-hint" style={{ margin: 0 }}>{k.tags.join(' · ')}</p>}
                  <div style={{ flex: 1 }} />
                  <Button variant="primary" block icon={Download} disabled={off || !!busy} onClick={() => setAsking(k)}>{busy === k.id ? 'Installing…' : k.installed ? 'Install again' : 'Install'}</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {installed.length > 0 && (
        <section className="ui-card" aria-label="Installed kits" style={{ marginTop: 20 }}>
          <h2 className="ui-card__title" style={{ marginTop: 0 }}>Installed kits</h2>
          <ul className="cc-backup-list" aria-label="Installed kits">
            {installed.map((row) => (
              <li key={row.install_id} className="cc-backup-item" data-install={row.install_id}>
                <span className="cc-backup-item__main">
                  <span className="cc-backup-item__title">{row.name} <span className="ui-hint">{row.version}</span> <Badge tone="neutral">{TYPE_LABEL[row.type] || row.type}</Badge></span>
                  <span className="cc-backup-item__meta">{when(row.at)}{row.user ? ` · by ${row.user}` : ''} · {row.type === 'section' ? `${row.templates} section${row.templates === 1 ? '' : 's'}` : `${(row.pages || []).length} draft page${(row.pages || []).length === 1 ? '' : 's'}`}{row.design ? ' · design applied' : ''}{row.restored ? ' · design restored' : ''}</span>
                </span>
                <span className="cc-backup-item__actions">
                  {row.undo ? <Button size="sm" icon={Undo2} onClick={() => undo(row)}>Restore the previous design</Button> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {asking && <InstallDialog kit={asking} onCancel={() => setAsking(null)} onInstall={(o) => install(asking, o)} />}
      {fileOpts && <InstallDialog kit={{ name: fileOpts.file.name, type: 'file', pages: 0 }} onCancel={() => setFileOpts(null)} onInstall={(o) => installFile(fileOpts.file, o)} />}
    </div>
  );
}
