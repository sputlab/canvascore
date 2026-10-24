// Administration › Block packages (admin): install, switch on and off, and remove packages of third-party blocks. A package
// is a ZIP of block definitions (settings, template, panel), an optional style sheet and images: it holds no code that
// runs, and an install is refused unless it passes the checks of canvascore-admin/blockpkg.php. The blocks of the enabled
// packages appear in the Add panel under "Block packages".
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Upload, ShieldCheck, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button, Card, PageHeader, Badge, EmptyState, Checkbox } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { postForm } from '../editor/upload';
import { loadBlockPackages } from '../editor/blockPackages';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());

export default function BlockPackages() {
  const fileRef = useRef(null);
  const [info, setInfo] = useState(null);        // { zip, demo, max_mb, packages }
  const [working, setWorking] = useState('');    // 'install' | ''
  const [result, setResult] = useState(null);    // the last install's answer

  const load = useCallback(() => fetch('api.php?action=pkg_info').then((r) => r.json())
    .then((d) => setInfo(d && d.success ? d : { packages: [], error: (d && d.message) || 'Could not load the packages.' }))
    .catch(() => setInfo({ packages: [], error: 'Could not load the packages.' })), []);
  useEffect(() => { load(); }, [load]);

  const refresh = (packages) => { if (packages) setInfo((i) => ({ ...i, packages })); loadBlockPackages(); };

  const install = async (file) => {
    if (!file) return;
    if (!(await confirmDialog({
      title: `Install "${file.name}"?`,
      message: 'A package cannot run code, and the server checks every file before installing it. Still, install only packages from people you trust: its blocks will show their content on your site.',
      confirmLabel: 'Install the package',
    }))) return;
    setWorking('install'); setResult(null);
    try {
      const form = new FormData();
      form.append('package', file, file.name);
      const d = await postForm('pkg_install', form, {});
      setResult(d || { success: false, message: 'Unexpected answer from the server.', errors: [] });
      if (d && d.success) { notify(d.message); load(); loadBlockPackages(); }
      else notify((d && d.message) || 'The package was not installed.', 'error');
    } catch { setResult({ success: false, message: 'Connection problem: the package may not have arrived.', errors: [] }); }
    setWorking('');
  };

  const toggle = async (p, enabled) => {
    const d = await post('pkg_set_enabled', { id: p.id, enabled });
    if (d && d.success) { notify(enabled ? `${p.name} is on.` : `${p.name} is off: its blocks are not published.`); refresh(d.packages); }
    else notify((d && d.message) || 'Could not change the package.', 'error');
  };
  const remove = async (p) => {
    if (!(await confirmDialog({
      title: `Remove "${p.name}"?`,
      message: p.used > 0
        ? `${p.used} saved ${p.used === 1 ? 'page, item or template uses' : 'pages, items or templates use'} its blocks. They stay saved but disappear from the pages until the package is installed again.`
        : 'No page uses its blocks.',
      confirmLabel: 'Remove', danger: true,
    }))) return;
    const d = await post('pkg_remove', { id: p.id });
    if (d && d.success) { notify('Package removed.'); refresh(d.packages); }
    else notify((d && d.message) || 'Could not remove the package.', 'error');
  };

  const packages = (info && info.packages) || [];
  const busy = !!working;
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader icon={Package} title="Block packages" description="Add blocks made by other people: a package holds block definitions, an optional style sheet and images. Its blocks appear in the Add panel under “Block packages”." />

      {info && info.error && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{info.error}</span></div>}
      {info && info.zip === false && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>The PHP zip extension is not available on this server, so packages cannot be installed. Ask your host to enable it.</span></div>}

      <Card title="Install a package" icon={Upload} description={`A .zip file of up to ${(info && info.max_mb) || 5} MB. It is checked before anything is installed: the files, the definitions, the HTML and CSS it writes, its images, its own tests, and what happens when hostile values are typed into its settings.`}>
        <Button variant="primary" icon={Upload} disabled={busy || !info || info.zip === false || (info && info.demo)} onClick={() => fileRef.current && fileRef.current.click()}>
          {working === 'install' ? 'Checking and installing…' : 'Choose a package (.zip)…'}
        </Button>
        <input ref={fileRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; install(f); }} />
        {info && info.demo && <p className="ui-hint" style={{ marginTop: 8 }}>Packages are turned off in the demo.</p>}
        {result && (
          <div className={`cc-backup-result${result.success ? '' : ' cc-backup-result--error'}`} role="status">
            {result.success ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
            <span>
              <strong>{result.message}</strong>
              {result.errors && result.errors.length > 0 && (
                <ul className="cc-update-steps" aria-label="Problems found">
                  {result.errors.map((e, i) => <li key={i} data-ok="false"><AlertTriangle size={13} aria-hidden="true" /> {e}</li>)}
                </ul>
              )}
            </span>
          </div>
        )}
      </Card>

      <Card title="Installed packages" icon={ShieldCheck} description="Switch a package off to take its blocks out of the Add panel and off the published pages, without losing them from the pages.">
        {!info ? <p className="ui-hint">Loading…</p> : packages.length === 0 ? (
          <EmptyState icon={Package} title="No block packages yet">Install a .zip package above.</EmptyState>
        ) : (
          <ul className="cc-backup-list" aria-label="Installed packages">
            {packages.map((p) => (
              <li key={p.id} className="cc-backup-item" data-package={p.id}>
                <span className="cc-backup-item__main">
                  <span className="cc-backup-item__title">
                    {p.name} <span className="ui-hint">{p.version}</span>
                    {!p.valid ? <Badge tone="draft">Damaged</Badge> : p.enabled ? <Badge tone="published">On</Badge> : <Badge tone="neutral">Off</Badge>}
                  </span>
                  <span className="cc-backup-item__meta">
                    {p.author ? `${p.author} · ` : ''}{p.blocks.length} block{p.blocks.length === 1 ? '' : 's'}: {p.blocks.map((b) => b.label).join(', ') || '—'}
                    {p.license ? ` · ${p.license}` : ''}{p.used > 0 ? ` · used in ${p.used} place${p.used === 1 ? '' : 's'}` : ''}
                  </span>
                  {p.description && <span className="cc-backup-item__meta">{p.description}</span>}
                </span>
                <span className="cc-backup-item__actions">
                  <Checkbox label="On" checked={p.enabled} disabled={!p.valid} onChange={(e) => toggle(p, e.target.checked)} />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(p)} aria-label={`Remove ${p.name}`} title="Remove" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Make your own" icon={Package} description="A package is a folder: package.json, blocks/<name>.json (settings, template, panel, tests), style.css and images.">
        <p className="ui-hint">Check it and make the .zip with <code>php canvascore-frontend/scripts/block-package.php check &lt;folder&gt;</code> and <code>… pack &lt;folder&gt;</code>. The Developer Guide describes the format; <code>docs/examples/block-packages/pull-quote</code> is a complete example.</p>
      </Card>
    </div>
  );
}
