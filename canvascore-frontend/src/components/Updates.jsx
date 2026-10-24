// Administration › Updates: one-click updates (admin). The server checks the latest CanvasCore release on GitHub; installing
// it downloads the signed package, verifies the signature, takes a backup, swaps in the new version and checks it starts,
// and rolls back if any check fails. Server side: canvascore-admin/update.php.
import React, { useCallback, useEffect, useState } from 'react';
import { CircleArrowUp, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle, History, ExternalLink, PackageCheck, CircleX } from 'lucide-react';
import { Button, Card, PageHeader, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { formatBytes } from '../editor/mediaInfo';

const RESULT = { updated: ['published', 'Updated'], rolled_back: ['modified', 'Rolled back'], failed: ['draft', 'Failed'] };
const when = (t) => (t ? new Date(t * 1000).toLocaleString() : '');

export default function Updates() {
  const [info, setInfo] = useState(null);         // { current, requirements, last_check, history, demo }
  const [release, setRelease] = useState(null);   // the latest release, after a check
  const [working, setWorking] = useState('');     // 'check' | 'install' | ''
  const [result, setResult] = useState(null);     // the last install's answer

  const load = useCallback(() => fetch('api.php?action=update_info').then((r) => r.json())
    .then((d) => {
      if (!d || !d.success) { setInfo({ error: (d && d.message) || 'Could not load the update status.', requirements: [], history: [] }); return; }
      setInfo(d);
      if (d.last_check) setRelease((r) => r || d.last_check);
    })
    .catch(() => setInfo({ error: 'Could not load the update status.', requirements: [], history: [] })), []);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    setWorking('check');
    try {
      const d = await (await fetch('api.php?action=update_check')).json();
      if (!d || !d.success) notify((d && d.message) || 'Could not check for updates.', 'error');
      else { setRelease(d.release); notify(d.release.available ? `Version ${d.release.latest} is available.` : 'CanvasCore is up to date.'); }
    } catch { notify('Could not check for updates (connection problem).', 'error'); }
    setWorking('');
  };

  const install = async () => {
    if (!release) return;
    if (!(await confirmDialog({
      title: `Update CanvasCore to ${release.latest}?`,
      message: 'The signed package is downloaded and verified, and a backup is taken first (content, database and code). The editor is replaced by the new version; if a check fails, the current version is put back.\n\nOther people using the editor should save their work first.',
      confirmLabel: `Update to ${release.latest}`,
    }))) return;
    setWorking('install'); setResult(null);
    try {
      const d = await (await fetch('api.php?action=update_install', { method: 'POST', body: JSON.stringify({ version: release.latest }) })).json();
      setResult(d || { success: false, message: 'Unexpected answer from the server.' });
      if (d && d.history) setInfo((i) => ({ ...i, history: d.history }));
      if (d && d.success) notify(d.message || 'Updated.');
      else notify((d && d.message) || 'The update failed.', 'error');
    } catch { setResult({ success: false, message: 'The connection was lost during the update. Reload the page to see which version is running.' }); }
    setWorking('');
  };

  const reqs = (info && info.requirements) || [];
  const missing = reqs.filter((r) => !r.ok);
  const history = (info && info.history) || [];
  const busy = !!working;
  const current = (result && result.success && result.to) || (info && info.current) || '';
  const canInstall = release && release.available && release.package && !missing.length && !(info && info.demo) && !(result && result.success);

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader icon={CircleArrowUp} title="Updates" description="Install new CanvasCore versions from here. Every package is signed: one that was not signed with the CanvasCore release key is refused." />

      {info && info.error && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{info.error}</span></div>}

      <Card title="CanvasCore version" icon={PackageCheck}
        description={info ? `Installed: version ${current}.${release && release.checked_at ? ` Last checked ${when(release.checked_at)}.` : ''}` : 'Loading…'}
        actions={<Button icon={RefreshCw} onClick={check} disabled={busy || !info}>{working === 'check' ? 'Checking…' : 'Check for updates'}</Button>}>
        {release && (release.available ? (
          <div className="cc-update-release">
            <div className="cc-update-release__head">
              <strong>Version {release.latest} is available</strong>
              {release.published_at && <span className="ui-hint">released {new Date(release.published_at).toLocaleDateString()}</span>}
              {release.size > 0 && <span className="ui-hint">· {formatBytes(release.size)}</span>}
              {release.url && <a href={release.url} target="_blank" rel="noopener noreferrer" className="ui-hint">Release page <ExternalLink size={12} aria-hidden="true" /></a>}
            </div>
            {release.notes && <pre className="cc-update-notes" aria-label="Release notes">{release.notes}</pre>}
            {!release.package && <p className="ui-hint cc-backup-warn"><AlertTriangle size={15} aria-hidden="true" /> This release has no signed update package: update it by hand (see the README).</p>}
            {info && info.demo && <p className="ui-hint">Updates are turned off in the demo.</p>}
            <div className="ui-row" style={{ marginTop: 12 }}>
              <Button variant="primary" icon={CircleArrowUp} onClick={install} disabled={busy || !canInstall}>{working === 'install' ? 'Updating…' : `Update to ${release.latest}`}</Button>
            </div>
          </div>
        ) : <p className="ui-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={15} color="#22c55e" aria-hidden="true" /> CanvasCore is up to date (latest release: {release.latest}).</p>)}

        {working === 'install' && (
          <div className="cc-backup-progress" role="status" aria-live="polite">
            <span>Updating… keep this page open. It can take a minute.</span>
            <span className="cc-upload-panel__bar" aria-hidden="true"><span className="cc-backup-progress__busy" style={{ width: '100%' }} /></span>
          </div>
        )}
        {result && (
          <div className={`cc-backup-result${result.success ? '' : ' cc-backup-result--error'}`} role="status">
            {result.success ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
            <span>
              <strong>{result.message}</strong>
              {result.steps && result.steps.length > 0 && (
                <ol className="cc-update-steps">
                  {result.steps.map(([text, ok], i) => <li key={i} data-ok={ok ? 'true' : 'false'}>{ok ? <CheckCircle2 size={13} aria-hidden="true" /> : <CircleX size={13} aria-hidden="true" />} {text}</li>)}
                </ol>
              )}
              {result.success && <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Reload the editor</Button>}
            </span>
          </div>
        )}
      </Card>

      <Card title="Server requirements" icon={ShieldCheck} description="What this server needs to update itself.">
        {!info ? <p className="ui-hint">Loading…</p> : (
          <ul className="cc-update-reqs" aria-label="Server requirements">
            {reqs.map((r) => <li key={r.id} data-ok={r.ok ? 'true' : 'false'}>{r.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />} {r.label}</li>)}
          </ul>
        )}
        {missing.length > 0 && <p className="ui-hint" style={{ marginTop: 8 }}>Ask your host to fix what is missing, or update by hand: upload the new canvascore-admin folder over the old one.</p>}
      </Card>

      <Card title="Update history" icon={History} description="The backups taken before each update are in Backup (safety copies) and in the data folder (updates/).">
        {history.length === 0 ? <p className="ui-hint">No updates installed from here yet.</p> : (
          <ul className="cc-backup-list" aria-label="Update history">
            {history.map((h, i) => {
              const [tone, label] = RESULT[h.result] || ['neutral', h.result];
              return (
                <li key={i} className="cc-backup-item">
                  <span className="cc-backup-item__main">
                    <span className="cc-backup-item__title">{h.from} → {h.to} <Badge tone={tone}>{label}</Badge></span>
                    <span className="cc-backup-item__meta">{when(h.at)}{h.by ? ` · ${h.by}` : ''}{h.result !== 'updated' && h.message ? ` · ${h.message}` : ''}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
