// Administration › Import from WordPress (admin): pages, posts, categories, tags and images from a WordPress export file
// (Tools › Export › All content, a .xml file). Three steps: choose the file (it is only read, nothing changes yet), pick what to
// bring over, watch it run. The server does the work in slices (api.php wp_* actions, canvascore-admin/wpimport.php); this page
// asks for the next slice until it reports it is finished, and can be left open without risk: a step is safe to repeat.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DownloadCloud, Upload, AlertTriangle, CheckCircle2, FileText, Newspaper, Image as ImageIcon, Tags } from 'lucide-react';
import { Button, Card, PageHeader, Checkbox, Field, Input, Select } from '../ui/kit';
import { notify } from '../ui/notify';
import { postForm } from '../editor/upload';
import { useStore } from '../store/useStore';
import { __, _n } from '../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());

export default function ImportWordPress() {
  const fileRef = useRef(null);
  const stop = useRef(false);
  const [info, setInfo] = useState(null);          // { demo, curl, xml, max_mb, upload_mb, collections }
  const [stage, setStage] = useState('choose');    // choose | options | running | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState('');
  const [summary, setSummary] = useState(null);    // what the file holds
  const [progress, setProgress] = useState(null);  // the last answer of a step
  const [opts, setOpts] = useState({ pages: true, posts: true, media: true, drafts: true, redirects: true, collection: '', collection_name: __("Blog") });
  const refreshPages = useStore((s) => s.refreshPages);

  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));
  useEffect(() => {
    fetch('api.php?action=wp_info').then((r) => r.json()).then((d) => setInfo(d && d.success ? d : { error: (d && d.message) || __("Could not load the importer.") }))
      .catch(() => setInfo({ error: __("Could not load the importer.") }));
    return () => { stop.current = true; };
  }, []);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const d = await postForm('wp_analyze', form, {});
      if (d && d.success) {
        setJob(d.job); setSummary(d.summary);
        const c = d.summary.counts;
        setOpts((o) => ({ ...o, pages: c.pages > 0, posts: c.posts > 0, media: c.media > 0 }));
        setStage('options');
      } else setError((d && d.message) || __("The file could not be read."));
    } catch { setError(__("Connection problem: the file may not have arrived.")); }
    setBusy(false);
  };

  const run = useCallback(async (first, options) => {
    setStage('running'); setError('');
    let d = first ? await post('wp_start', { job: first, options }) : null;
    while (!stop.current) {
      if (d && !d.success && !d.busy) { setError(d.message || __("The import stopped.")); setStage('options'); return; }
      if (d && d.success) {
        setProgress(d);
        if (d.finished) { setStage('done'); if (refreshPages) refreshPages(); notify(__("Import finished.")); return; }
      }
      d = await post('wp_step', { job: first || job }).catch(() => ({ success: false, busy: true }));   // a lost answer: ask again
      if (d && d.busy) await new Promise((r) => setTimeout(r, 1500));
    }
  }, [job, refreshPages]);

  const start = () => { stop.current = false; run(job, opts); };
  const reset = () => { if (job && stage !== 'running') post('wp_discard', { job }); setStage('choose'); setJob(''); setSummary(null); setProgress(null); setError(''); };

  const c = summary && summary.counts;
  const skipped = summary ? Object.entries(summary.skipped || {}) : [];
  const nothing = !opts.pages && !opts.posts && !opts.media;
  const pct = (kind) => (progress && progress.totals[kind] > 0 ? Math.min(100, Math.round((progress.done[kind] / progress.totals[kind]) * 100)) : null);

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader icon={DownloadCloud} title={__("Import from WordPress")} description={__("Bring pages, posts, categories, tags and pictures over from a WordPress site. In WordPress choose Tools › Export › All content and upload the .xml file here.")} />

      {info && info.error && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{info.error}</span></div>}
      {info && info.demo && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{__("The importer is turned off in the demo.")}</span></div>}
      {info && info.xml === false && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{__("This server has no XML support (the PHP xml extension). Ask your host to enable it.")}</span></div>}
      {error && <div role="alert" className="cc-backup-alert" data-testid="wp-error"><AlertTriangle size={16} aria-hidden="true" /><span>{error}</span></div>}

      {stage === 'choose' && (
        <Card title={__("1. Choose the export file")} icon={Upload} description={__("The file is only read: nothing in your site changes until you start the import. Up to {0} MB{1}. For a bigger site, export Posts and Pages separately.", (info && info.max_mb) || 200, info && info.upload_mb ? `; this server accepts uploads of ${Math.floor(info.upload_mb)} MB` : '')}>
          <Button variant="primary" icon={Upload} disabled={busy || !info || info.error || info.demo || info.xml === false} onClick={() => fileRef.current && fileRef.current.click()}>
            {busy ? __("Reading the file…") : __("Choose the export (.xml)…")}
          </Button>
          <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; upload(f); }} />
        </Card>
      )}

      {stage === 'options' && summary && (
        <>
          <Card title={__("2. What to import from {0}", summary.site.title || summary.site.url || 'the file')} icon={FileText} description={__("Tick what you want. Nothing is deleted or replaced: everything is added next to what you already have.")}>
            <div className="cc-import-list" data-testid="wp-summary">
              <Checkbox label={__("Pages ({0})", c.pages)} checked={opts.pages} disabled={!c.pages} onChange={(e) => set({ pages: e.target.checked })} />
              {summary.sample_pages.length > 0 && <p className="ui-hint cc-import-sample">{summary.sample_pages.join(' · ')}{c.pages > summary.sample_pages.length ? ' …' : ''}</p>}
              <Checkbox label={__("Posts ({0}) with {1} and {2}", c.posts, _n(c.categories, 'category', 'categories'), _n(c.tags, 'tag', 'tags'))} checked={opts.posts} disabled={!c.posts} onChange={(e) => set({ posts: e.target.checked })} />
              {summary.sample_posts.length > 0 && <p className="ui-hint cc-import-sample">{summary.sample_posts.join(' · ')}{c.posts > summary.sample_posts.length ? ' …' : ''}</p>}
              <Checkbox label={__("Pictures ({0}): copy them into your Media library", c.media)} checked={opts.media} disabled={!c.media} onChange={(e) => set({ media: e.target.checked })} />
              {opts.media && info && info.curl === false && <p className="ui-hint" role="alert">{__("This server cannot download files (no PHP curl extension): pictures will stay on the old site.")}</p>}
              {!opts.media && c.media > 0 && <p className="ui-hint">{__("Pictures stay where they are: they keep working only while the old site is online.")}</p>}
            </div>
            {skipped.length > 0 && <p className="ui-hint" data-testid="wp-skipped">{__("Left out:")} {skipped.map(([k, n]) => `${n} ${k}`).join(', ')}.</p>}
          </Card>

          {opts.posts && c.posts > 0 && (
            <Card title={__("Where the posts go")} icon={Newspaper} description={__("Posts become the items of a collection, with their categories and tags.")}>
              <Field label={__("Collection")}>
                <Select value={opts.collection} onChange={(e) => set({ collection: e.target.value })} aria-label={__("Collection for the posts")}>
                  <option value="">{__("A new collection…")}</option>
                  {((info && info.collections) || []).map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </Select>
              </Field>
              {!opts.collection && (
                <Field label={__("Name of the new collection")}>
                  <Input value={opts.collection_name} onChange={(e) => set({ collection_name: e.target.value })} maxLength={120} aria-label={__("Name of the new collection")} />
                </Field>
              )}
            </Card>
          )}

          <Card title={__("How to bring them")} icon={Tags}>
            <Checkbox label={__("Import everything as drafts, so I can look at it first (recommended)")} checked={opts.drafts} onChange={(e) => set({ drafts: e.target.checked })} />
            <Checkbox label={__("Forward the old addresses to the new ones")} checked={opts.redirects} disabled={opts.drafts} onChange={(e) => set({ redirects: e.target.checked })} />
            <p className="ui-hint">{__("Old addresses are forwarded only for what is imported as published, and never from an address a page of your site already uses. Published items go online at your next Publish.")}</p>
          </Card>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" icon={DownloadCloud} disabled={nothing || busy} onClick={start}>{__("Start the import")}</Button>
            <Button variant="ghost" onClick={reset}>{__("Cancel")}</Button>
          </div>
        </>
      )}

      {(stage === 'running' || stage === 'done') && progress && (
        <Card title={stage === 'done' ? __("Done") : __("3. Importing…")} icon={stage === 'done' ? CheckCircle2 : DownloadCloud}
          description={stage === 'done' ? __("Everything that could be imported has been added.") : __("This can take a few minutes for a big site. Keep this page open.")}>
          <ul className="cc-update-steps" aria-label={__("Progress")} data-testid="wp-progress">
            {[['media', __("Pictures"), ImageIcon], ['pages', __("Pages"), FileText], ['posts', __("Posts"), Newspaper]].filter(([k]) => progress.totals[k] > 0).map(([k, label, Icon]) => (
              <li key={k} data-ok={pct(k) === 100 ? 'true' : undefined} data-kind={k}>
                <Icon size={13} aria-hidden="true" /> {label}: {progress.done[k]} {__("of")} {progress.totals[k]}{progress.failed[k] ? __(" ({0} failed)", progress.failed[k]) : ''}
                <progress value={progress.done[k]} max={progress.totals[k]} style={{ marginLeft: 8, verticalAlign: 'middle' }} aria-label={__("{0} progress", label)} />
              </li>
            ))}
          </ul>
          {stage === 'done' && (
            <div className="cc-backup-result" role="status" data-testid="wp-result">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>
                <strong>
                  {[progress.created.pages ? _n(progress.created.pages, 'page', 'pages') : '', progress.created.posts ? _n(progress.created.posts, 'post', 'posts') : '',
                    progress.created.media ? _n(progress.created.media, 'picture', 'pictures') : '', progress.created.terms ? _n(progress.created.terms, 'category or tag', 'categories and tags') : '',
                    progress.created.redirects ? _n(progress.created.redirects, 'redirect', 'redirects') : ''].filter(Boolean).join(', ') || __("Nothing new")} {__("imported.")}
                </strong>
                {' '}{progress.published > 0 ? __("Published items go online at your next Publish.") : __("Everything is a draft: open the pages and posts, check them, then publish.")}
                {progress.warnings && progress.warnings.length > 0 && (
                  <>
                    <br />{__("Worth a look:")}
                    <ul className="cc-update-steps" aria-label={__("Things to check")}>
                      {progress.warnings.map((w, i) => <li key={i} data-ok="false"><AlertTriangle size={13} aria-hidden="true" /> {w}</li>)}
                    </ul>
                  </>
                )}
              </span>
            </div>
          )}
          {stage === 'done' && <div style={{ marginTop: 12 }}><Button onClick={reset}>{__("Import another file")}</Button></div>}
        </Card>
      )}
      {stage === 'running' && !progress && <p className="ui-hint" role="status">{__("Starting…")}</p>}
    </div>
  );
}
