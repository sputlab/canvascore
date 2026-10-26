// Administration › Updates: one-click updates (admin). The server checks the latest CanvasCore release on GitHub; installing
// it downloads the signed package, verifies the signature, takes a backup, swaps in the new version and checks it starts,
// and rolls back if any check fails. Server side: canvascore-admin/update.php.
import React, { useCallback, useEffect, useState } from 'react';
import { CircleArrowUp, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle, History, ExternalLink, PackageCheck, CircleX } from 'lucide-react';
import { Button, Card, PageHeader, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { formatBytes } from '../editor/mediaInfo';
import { __ } from '../i18n/index.js';

const RESULT = { updated: ['published', __("Updated")], rolled_back: ['modified', __("Rolled back")], failed: ['draft', __("Failed")] };
const when = (t) => (t ? new Date(t * 1000).toLocaleString() : '');

export default function Updates() {
  const [info, setInfo] = useState(null);         // { current, requirements, last_check, history, demo }
  const [release, setRelease] = useState(null);   // the latest release, after a check
  const [working, setWorking] = useState('');     // 'check' | 'install' | ''
  const [result, setResult] = useState(null);     // the last install's answer

  const load = useCallback(() => fetch('api.php?action=update_info').then((r) => r.json())
    .then((d) => {
      if (!d || !d.success) { setInfo({ error: (d && d.message) || __("Could not load the update status."), requirements: [], history: [] }); return; }
      setInfo(d);
      if (d.last_check) setRelease((r) => r || d.last_check);
    })
    .catch(() => setInfo({ error: __("Could not load the update status."), requirements: [], history: [] })), []);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    setWorking('check');
    try {
      const d = await (await fetch('api.php?action=update_check')).json();
      if (!d || !d.success) notify(d && d.message || __("Could not check for updates."), 'error');
      else { setRelease(d.release); notify(d.release.available ? __("Version {0} is available.", d.release.latest) : __("CanvasCore is up to date.")); }
    } catch { notify(__("Could not check for updates (connection problem)."), 'error'); }
    setWorking('');
  };

  const install = async () => {
    if (!release) return;
    if (!(await confirmDialog({
      title: __("Update CanvasCore to {0}?", release.latest),
      message: __("The signed package is downloaded and verified, and a backup is taken first (content, database and code). The editor is replaced by the new version; if a check fails, the current version is put back.\n\nOther people using the editor should save their work first."),
      confirmLabel: __("Update to {0}", release.latest),
    }))) return;
    setWorking('install'); setResult(null);
    try {
      const d = await (await fetch('api.php?action=update_install', { method: 'POST', body: JSON.stringify({ version: release.latest }) })).json();
      setResult(d || { success: false, message: __("Unexpected answer from the server.") });
      if (d && d.history) setInfo((i) => ({ ...i, history: d.history }));
      if (d && d.success) notify(d.message || __("Updated."));
      else notify(d && d.message || __("The update failed."), 'error');
    } catch { setResult({ success: false, message: __("The connection was lost during the update. Reload the page to see which version is running.") }); }
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
      <PageHeader icon={CircleArrowUp} title={__("Updates")} description={__("Install new CanvasCore versions from here. Every package is signed: one that was not signed with the CanvasCore release key is refused.")} />

      {info && info.error && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{info.error}</span></div>}

      <Card title={__("CanvasCore version")} icon={PackageCheck}
        description={info ? __("Installed: version {0}.{1}", current, release && release.checked_at ? __(" Last checked {0}.", when(release.checked_at)) : '') : __("Loading…")}
        actions={<Button icon={RefreshCw} onClick={check} disabled={busy || !info}>{working === 'check' ? __("Checking…") : __("Check for updates")}</Button>}>
        {release && (release.available ? (
          <div className="cc-update-release">
            <div className="cc-update-release__head">
              <strong>{__("Version")} {release.latest} {__("is available")}</strong>
              {release.published_at && <span className="ui-hint">{__("released")} {new Date(release.published_at).toLocaleDateString()}</span>}
              {release.size > 0 && <span className="ui-hint">· {formatBytes(release.size)}</span>}
              {release.url && <a href={release.url} target="_blank" rel="noopener noreferrer" className="ui-hint">{__("Release page")} <ExternalLink size={12} aria-hidden="true" /></a>}
            </div>
            {release.notes && <pre className="cc-update-notes" aria-label={__("Release notes")}>{release.notes}</pre>}
            {!release.package && <p className="ui-hint cc-backup-warn"><AlertTriangle size={15} aria-hidden="true" /> {__("This release has no signed update package: update it by hand (see the README).")}</p>}
            {info && info.demo && <p className="ui-hint">{__("Updates are turned off in the demo.")}</p>}
            <div className="ui-row" style={{ marginTop: 12 }}>
              <Button variant="primary" icon={CircleArrowUp} onClick={install} disabled={busy || !canInstall}>{working === 'install' ? __("Updating…") : __("Update to {0}", release.latest)}</Button>
            </div>
          </div>
        ) : <p className="ui-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={15} color="#22c55e" aria-hidden="true" /> {__("CanvasCore is up to date (latest release:")} {release.latest}).</p>)}

        {working === 'install' && (
          <div className="cc-backup-progress" role="status" aria-live="polite">
            <span>{__("Updating… keep this page open. It can take a minute.")}</span>
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
              {result.success && <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => window.location.reload()} style={{ marginTop: 8 }}>{__("Reload the editor")}</Button>}
            </span>
          </div>
        )}
      </Card>

      <Card title={__("Server requirements")} icon={ShieldCheck} description={__("What this server needs to update itself.")}>
        {!info ? <p className="ui-hint">{__("Loading…")}</p> : (
          <ul className="cc-update-reqs" aria-label={__("Server requirements")}>
            {reqs.map((r) => <li key={r.id} data-ok={r.ok ? 'true' : 'false'}>{r.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />} {r.label}</li>)}
          </ul>
        )}
        {missing.length > 0 && <p className="ui-hint" style={{ marginTop: 8 }}>{__("Ask your host to fix what is missing, or update by hand: upload the new canvascore-admin folder over the old one.")}</p>}
      </Card>

      <Card title={__("Update history")} icon={History} description={__("The backups taken before each update are in Backup (safety copies) and in the data folder (updates/).")}>
        {history.length === 0 ? <p className="ui-hint">{__("No updates installed from here yet.")}</p> : (
          <ul className="cc-backup-list" aria-label={__("Update history")}>
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
