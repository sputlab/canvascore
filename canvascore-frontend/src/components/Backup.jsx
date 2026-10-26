// Whole-site backup (admin). A backup is one ZIP with the content (pages, collections, templates, masters,
// header/footer, redirects, optionally version history and form messages), Global Options, the menu and
// every uploaded image. It can be downloaded or kept on the server, and restored from either. Before a
// restore the server saves a safety copy of the current site (listed here), so a restore can be undone.
// Old .json backups (before 0.14) can still be imported. Server side: canvascore-admin/backup.php.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { DatabaseBackup, Upload, Download, AlertTriangle, Server, RotateCcw, Trash2, ShieldCheck, Archive, CheckCircle2 } from 'lucide-react';
import { Button, Card, Checkbox, PageHeader, EmptyState, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { postForm } from '../editor/upload';
import { formatBytes } from '../editor/mediaInfo';
import { __, _n } from '../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
// Starts the browser's own download (no copy in memory, works for big files)
const startDownload = (name) => {
  const a = document.createElement('a');
  a.href = `api.php?action=backup_download&name=${encodeURIComponent(name)}`;
  a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
};
// Sends a file in pieces smaller than the server's upload limit, so a backup of any size can be restored
const uploadInChunks = async (file, maxUpload, onProgress) => {
  const size = Math.max(256 * 1024, Math.min(8 * 1048576, maxUpload ? maxUpload - 256 * 1024 : 8 * 1048576));
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const total = Math.max(1, Math.ceil(file.size / size));
  for (let i = 0; i < total; i++) {
    const piece = file.slice(i * size, Math.min(file.size, (i + 1) * size));
    const form = new FormData();
    form.append('id', id); form.append('index', String(i));
    form.append('chunk', piece, 'chunk');
    const d = await postForm('backup_upload_chunk', form, { onProgress: (p) => onProgress((i * size + p * piece.size) / file.size || 0) });
    if (!d || !d.success) return { success: false, message: d && d.message || __("The upload failed.") };
  }
  return { success: true, id };
};
const backupSummary = (b) => {
  const c = b.counts || {};
  const parts = [_n(c.pages || 0, 'page', 'pages')];
  if (c.collection_items) parts.push(_n(c.collection_items, 'item', 'items'));
  parts.push(_n((b.uploads && b.uploads.files) || 0, 'image file', 'image files'));
  return parts.join(' · ');
};

export default function Backup() {
  const { publishSiteAsync, refreshPages, fetchBranding } = useStore();
  const fileRef = useRef(null);
  const [info, setInfo] = useState(null);           // { zip, max_upload, backups }
  const [opts, setOpts] = useState({ history: true, submissions: true });
  const [working, setWorking] = useState('');       // 'download' | 'save' | 'restore' | ''
  const [progress, setProgress] = useState(null);   // restore upload: 0..1, 'server' once sent
  const [result, setResult] = useState(null);       // last restore's answer

  const load = useCallback(() => fetch('api.php?action=backup_info').then((r) => r.json())
    .then((d) => setInfo(d && d.success ? d : { zip: false, max_upload: 0, backups: [], error: (d && d.message) || __("Could not load the backups.") }))
    .catch(() => setInfo({ zip: false, max_upload: 0, backups: [], error: __("Could not load the backups.") })), []);
  useEffect(() => { load(); }, [load]);

  const make = async (temp) => {
    setWorking(temp ? 'download' : 'save');
    try {
      const d = await post('backup_create', { ...opts, temp });
      if (!d || !d.success) notify(__("Backup failed: {0}", (d && d.message) || 'unexpected answer from the server'), 'error');
      else if (temp) { startDownload(d.name); notify(__("Backup ready: the download is starting.")); }
      else { notify(__("Backup saved on the server.")); setInfo((i) => ({ ...i, backups: d.backups || [] })); }
    } catch { notify(__("Backup failed: connection problem."), 'error'); }
    setWorking('');
  };

  const afterRestore = async (d) => {
    setResult(d);
    if (d.backups) setInfo((i) => ({ ...i, backups: d.backups }));
    if (!d.success) { notify(d.message || __("Restore failed."), 'error'); return; }
    notify(d.message || __("Backup restored."));
    await refreshPages();
    if (fetchBranding) fetchBranding();
    const pub = await publishSiteAsync();
    if (!pub || !pub.success) notify(__("Restored, but publishing the site had an issue: use Publish Site."), 'error');
  };

  const restoreFile = async (file) => {
    if (!file) return;
    const legacy = /\.json$/i.test(file.name);
    if (!(await confirmDialog({
      title: __("Restore \"{0}\"?", file.name),
      message: legacy ? __("This old-format backup REPLACES the pages, menu, options, masters and templates. Collections and images are not in it and stay as they are. User accounts are kept.") : __("This REPLACES the whole site (pages, collections, templates, options, menu and all images) with the backup. User accounts are kept.\n\nA safety copy of the current site is saved on the server first, so you can go back."),
      confirmLabel: __("Restore and replace the site"), danger: true,
    }))) return;
    setWorking('restore'); setResult(null);
    try {
      if (legacy) {
        const res = await fetch('api.php?action=import_site', { method: 'POST', body: await file.text() });
        await afterRestore(await res.json());
      } else {
        setProgress(0);
        const up = await uploadInChunks(file, (info && info.max_upload) || 0, setProgress);
        if (!up.success) { await afterRestore(up); return; }
        setProgress('server');
        await afterRestore(await post('backup_restore', { upload: up.id, size: file.size }));
      }
    } catch { notify(__("Restore failed: connection problem. Check the site, and use a safety copy below if needed."), 'error'); load(); }
    finally { setProgress(null); setWorking(''); }
  };

  const restoreSaved = async (b) => {
    if (!(await confirmDialog({
      title: __("Restore the backup of {0}?", new Date(b.created * 1000).toLocaleString()),
      message: __("It REPLACES the whole site with this backup ({0}). User accounts are kept.\n\nA safety copy of the current site is saved first.", backupSummary(b)),
      confirmLabel: __("Restore and replace the site"), danger: true,
    }))) return;
    setWorking('restore'); setResult(null); setProgress('server');
    try { await afterRestore(await post('backup_restore_saved', { name: b.name })); }
    catch { notify(__("Restore failed: connection problem."), 'error'); load(); }
    setProgress(null); setWorking('');
  };

  const remove = async (b) => {
    if (!(await confirmDialog({ title: __("Delete this backup?"), message: __("{0}\n{1} · {2}\n\nThis cannot be undone.", b.name, backupSummary(b), formatBytes(b.bytes)), confirmLabel: __("Delete backup"), danger: true }))) return;
    try {
      const d = await post('backup_delete', { name: b.name });
      if (d && d.success) { notify(__("Backup deleted.")); setInfo((i) => ({ ...i, backups: d.backups || [] })); }
      else notify(d && d.message || __("Delete failed."), 'error');
    } catch { notify(__("Delete failed."), 'error'); }
  };

  const busy = !!working;
  const noZip = info && !info.zip;
  const backups = (info && info.backups) || [];

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader icon={DatabaseBackup} title={__("Backup")} description={__("Save the whole site (content, options and images) to one ZIP file, and restore it here or on another CanvasCore installation.")} />

      {noZip && (
        <div role="alert" className="cc-backup-alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{info.error || __("The PHP zip extension is not available on this server, so full backups cannot be made or restored. Ask your host to enable it.")} {__("Old .json backups can still be imported below.")}</span>
        </div>
      )}

      <Card title={__("Make a backup")} icon={Archive} description={__("Pages and their drafts, collections and items, templates, masters, global header and footer, redirects, Global Options, the menu, and every uploaded image with its description and folder. User accounts and passwords are never included.")}>
        <div className="cc-backup-opts">
          <Checkbox label={__("Include the version history of pages and items")} checked={opts.history} onChange={(e) => setOpts({ ...opts, history: e.target.checked })} />
          <Checkbox label={__("Include the messages received through forms")} checked={opts.submissions} onChange={(e) => setOpts({ ...opts, submissions: e.target.checked })} />
        </div>
        <div className="ui-row" style={{ marginTop: 12 }}>
          <Button variant="primary" icon={Download} onClick={() => make(true)} disabled={busy || noZip || !info}>{working === 'download' ? __("Preparing the backup…") : __("Download backup (.zip)")}</Button>
          <Button icon={Server} onClick={() => make(false)} disabled={busy || noZip || !info}>{working === 'save' ? __("Saving…") : __("Keep a copy on the server")}</Button>
        </div>
        <p className="ui-hint" style={{ marginTop: 10 }}>{__("Keep downloaded backups somewhere safe, away from the server: a copy on the server is lost if the server is.")}</p>
      </Card>

      <Card title={__("Backups on the server")} icon={Server} description={__("Copies kept on this server, outside the public site. A safety copy is saved automatically before every restore (the newest 5 are kept).")}>
        {!info ? <p className="ui-hint">{__("Loading…")}</p> : backups.length === 0 ? (
          <EmptyState icon={Server} title={__("No backups on the server yet")}>{__("Use “Keep a copy on the server” above.")}</EmptyState>
        ) : (
          <ul className="cc-backup-list" aria-label={__("Backups on the server")}>
            {backups.map((b) => (
              <li key={b.name} className="cc-backup-item">
                <span className="cc-backup-item__icon" aria-hidden="true">{b.kind === 'safety' ? <ShieldCheck size={18} /> : <Archive size={18} />}</span>
                <span className="cc-backup-item__main">
                  <span className="cc-backup-item__title">
                    {new Date(b.created * 1000).toLocaleString()}
                    {b.kind === 'safety' ? <Badge tone="draft">{__("Safety copy before a restore")}</Badge> : <Badge tone="accent">{__("Saved copy")}</Badge>}
                  </span>
                  <span className="cc-backup-item__meta">{b.site_name ? `${b.site_name} · ` : ''}{backupSummary(b)} · {formatBytes(b.bytes)}{b.app ? ` · v${b.app}` : ''}</span>
                </span>
                <span className="cc-backup-item__actions">
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => startDownload(b.name)} disabled={busy} aria-label={__("Download the backup of {0}", new Date(b.created * 1000).toLocaleString())}>{__("Download")}</Button>
                  <Button size="sm" icon={RotateCcw} onClick={() => restoreSaved(b)} disabled={busy} aria-label={__("Restore the backup of {0}", new Date(b.created * 1000).toLocaleString())}>{__("Restore")}</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(b)} disabled={busy} aria-label={__("Delete the backup of {0}", new Date(b.created * 1000).toLocaleString())} title={__("Delete")} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={__("Restore from a file")} icon={Upload} description={__("Upload a backup ZIP made on this or another CanvasCore site. Old .json backups are accepted too.")}>
        <p className="ui-hint cc-backup-warn">
          <AlertTriangle size={15} aria-hidden="true" />
          {__("Restoring replaces the whole site. User accounts are kept, and a safety copy of the current site is saved first.")}
        </p>
        <Button variant="danger" icon={Upload} disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>{working === 'restore' ? __("Restoring…") : __("Choose a backup file…")}</Button>
        <input ref={fileRef} type="file" accept=".zip,application/zip,application/x-zip-compressed,.json,application/json" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; restoreFile(f); }} />

        {progress !== null && (
          <div className="cc-backup-progress" role="status" aria-live="polite">
            <span>{progress === 'server' ? __("Restoring the site… keep this page open.") : __("Uploading the backup… {0}%", Math.round(progress * 100))}</span>
            <span className="cc-upload-panel__bar" aria-hidden="true"><span className={progress === 'server' ? 'cc-backup-progress__busy' : ''} style={{ width: progress === 'server' ? '100%' : `${Math.round(progress * 100)}%` }} /></span>
          </div>
        )}
        {result && (
          <div className={`cc-backup-result${result.success ? '' : ' cc-backup-result--error'}`} role="status">
            {result.success ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
            <span>
              <strong>{result.message || (result.success ? __("Backup restored.") : __("Restore failed."))}</strong>
              {result.success && result.counts && <> {_n(result.counts.pages || 0, 'page', 'pages')}, {_n(result.counts.collection_items || 0, 'item', 'items')}, {_n(result.counts.images || 0, 'image file', 'image files')}.</>}
              {result.skipped && result.skipped.length > 0 && <> {__("Left out (not safe or not images):")} {result.skipped.join(', ')}.</>}
              {result.safety && <> {__("The previous site was saved as a safety copy (listed above).")}</>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
