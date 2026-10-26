// Administration › Integrations (admin): webhooks for form submissions, newsletter services (Mailchimp, Brevo), analytics (Google Analytics,
// Plausible, Matomo) and Stripe payment links. The keys live in the data folder and come back here masked; a key field left empty keeps the
// saved key. Deliveries run after the visitor is answered and are listed under Activity (a failed one can be sent again).
import React, { useCallback, useEffect, useState } from 'react';
import { Plug, Webhook, Mail, BarChart3, CreditCard, ListChecks, Plus, Trash2, Send, Save, AlertTriangle, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { Button, Card, PageHeader, Field, Input, Select, Checkbox, Badge, Tabs } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
const TABS = [['webhooks', __("Webhooks"), Webhook], ['newsletter', __("Newsletter"), Mail], ['analytics', __("Analytics"), BarChart3], ['stripe', __("Stripe"), CreditCard], ['activity', __("Activity"), ListChecks]];
const CURRENCIES = ['eur', 'usd', 'gbp', 'chf', 'cad', 'aud', 'sek', 'nok', 'dkk', 'pln', 'jpy'];
const when = (s) => String(s || '').replace('T', ' ').slice(0, 16);

// Which forms: all, the newsletter ones, or chosen ones
function FormsChoice({ value, onChange, forms, allLabel, newsletterLabel, id }) {
  const kind = Array.isArray(value) ? 'chosen' : value;
  const ids = Array.isArray(value) ? value : [];
  return (
    <div>
      <Select aria-label={__("Forms for {0}", id)} value={kind} onChange={(e) => onChange(e.target.value === 'chosen' ? [] : e.target.value)}
        options={[...(newsletterLabel ? [['newsletter', newsletterLabel]] : []), ['all', allLabel], ['chosen', __("Only the forms I choose")]]} />
      {kind === 'chosen' && (
        <div role="group" aria-label={__("Forms")} style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {forms.length === 0 ? <p className="ui-hint">{__("No forms yet: publish a page that has a form first.")}</p> : forms.map((f) => (
            <Checkbox key={f.id} label={`${f.type === 'newsletter' ? __("Newsletter") : f.type === 'wizard' ? __("Multi-step form") : __("Form")}: ${f.labels.join(', ') || f.id}`} checked={ids.includes(f.id)}
              onChange={(e) => onChange(e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function Webhooks({ data, reload, secrets, setSecrets }) {
  const [rows, setRows] = useState(() => data.config.webhooks.map((w) => ({ ...w })));
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const d = await post('integrations_save', { section: 'webhooks', data: rows });
      if (!d.success) { notify(d.message || __("Not saved."), 'error'); return; }
      notify(__("Webhooks saved."));
      setRows(d.config.webhooks.map((w) => ({ ...w })));
      if (d.new_secrets && Object.keys(d.new_secrets).length) setSecrets((s) => ({ ...s, ...d.new_secrets }));
      reload();
    } catch { notify(__("Not saved (connection problem)."), 'error'); } finally { setBusy(false); }
  };
  const test = async (w) => { const d = await post('integrations_test', { kind: 'webhook', id: w.id }); notify(d.message || d.success ? __("Sent.") : __("Failed."), d.success ? 'success' : 'error'); reload(); };
  const rotate = async (w) => {
    if (!(await confirmDialog({ title: __("New secret for “{0}”?", w.name), message: __("The old secret stops working at once: update the receiver with the new one."), confirmLabel: __("Make a new secret") }))) return;
    const d = await post('integrations_rotate_secret', { id: w.id });
    if (d.success) { setSecrets((s) => ({ ...s, [w.id]: d.secret })); reload(); } else notify(d.message || __("Failed."), 'error');
  };
  return (
    <Card title={__("Webhooks")} icon={Webhook} description={__("Send every submission of your forms to your own address (Zapier, Make, n8n, your server…) as soon as it arrives: a signed JSON POST, after the visitor has been answered.")}>
      {rows.length === 0 && <p className="ui-hint">{__("No webhooks yet.")}</p>}
      {rows.map((w, i) => (
        <div key={w.id || `new${i}`} data-webhook={w.id || 'new'} style={{ border: '1px solid #334155', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div className="ui-grid" style={{ '--ui-min': '220px' }}>
            <Field label={__("Name")}><Input aria-label={__("Webhook {0} name", i + 1)} value={w.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={__("Zapier")} /></Field>
            <Field label={__("Address (https)")}><Input aria-label={__("Webhook {0} address", i + 1)} value={w.url} onChange={(e) => set(i, { url: e.target.value })} placeholder={__("https://hooks.example.com/…")} /></Field>
          </div>
          <Field label={__("Which forms")}><FormsChoice id={`webhook ${i + 1}`} value={w.forms} onChange={(v) => set(i, { forms: v })} forms={data.forms} allLabel={__("All forms")} /></Field>
          <Checkbox label={__("On")} checked={!!w.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />
          {w.id && secrets[w.id] && (
            <div role="status" className="cc-backup-result" data-testid="webhook-secret" style={{ margin: '8px 0' }}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span><strong>{__("Secret (shown once, copy it now):")}</strong> <code>{secrets[w.id]}</code> <Button size="sm" variant="ghost" icon={Copy} onClick={() => navigator.clipboard && navigator.clipboard.writeText(secrets[w.id]).then(() => notify(__("Copied.")))}>{__("Copy")}</Button></span>
            </div>
          )}
          <div className="ui-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {w.id && <><Button size="sm" icon={Send} onClick={() => test(w)}>{__("Send a test")}</Button><Button size="sm" icon={RefreshCw} onClick={() => rotate(w)}>{__("New secret")}</Button><span className="ui-hint">{__("Secret")} {w.secret_hint}</span></>}
            <span style={{ flex: 1 }} />
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={__("Remove webhook {0}", i + 1)}>{__("Remove")}</Button>
          </div>
        </div>
      ))}
      <div className="ui-row" style={{ gap: 8 }}>
        <Button icon={Plus} onClick={() => setRows((r) => [...r, { name: '', url: '', enabled: true, forms: 'all' }])} disabled={rows.length >= 10}>{__("Add a webhook")}</Button>
        <Button variant="primary" icon={Save} onClick={save} disabled={busy}>{busy ? __("Saving…") : __("Save webhooks")}</Button>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary>{__("How to check a delivery")}</summary>
        <p className="ui-hint">{__("Each request carries")} <code>X-CanvasCore-Timestamp</code> {__("and")} <code>X-CanvasCore-Signature: sha256=…</code>{__(", the HMAC-SHA256 of")} <code>timestamp + "." + body</code> {__("with the secret. Recompute it on your side and refuse a request whose signature differs or whose timestamp is old. The body is JSON:")} <code>event</code>, <code>form</code> (<code>id</code>, <code>type</code>), <code>submission</code> (<code>id</code>, <code>page</code>, <code>fields</code>{__(") and")} <code>site</code>.</p>
      </details>
    </Card>
  );
}

function Service({ name, svc, cfg, forms, reload, doubleOptin, keyHint, idLabel, idPlaceholder }) {
  const [c, setC] = useState({ enabled: cfg.enabled, api_key: '', list_id: cfg.list_id, double_optin: !!cfg.double_optin, forms: cfg.forms });
  const [busy, setBusy] = useState('');
  const save = async () => {
    setBusy('save');
    try {
      const d = await post('integrations_save', { section: svc, data: c });
      if (!d.success) { notify(d.message || __("Not saved."), 'error'); return; }
      notify(__("{0} saved.", name)); setC((x) => ({ ...x, api_key: '' })); reload();
    } catch { notify(__("Not saved (connection problem)."), 'error'); } finally { setBusy(''); }
  };
  const test = async () => { setBusy('test'); const d = await post('integrations_test', { kind: svc }); notify(d.message || d.success ? __("Connected.") : __("Failed."), d.success ? 'success' : 'error'); setBusy(''); };
  return (
    <Card title={name} icon={Mail} description={__("Add the people who sign up on your site to a {0} {1}. Only with their consent: a ticked consent box, or a Newsletter block (which is the signup itself).", name, svc === 'mailchimp' ? 'audience' : 'list')} data-service={svc}>
      <Checkbox label={__("Send sign-ups to {0}", name)} checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} />
      <div className="ui-grid" style={{ '--ui-min': '240px', marginTop: 8 }}>
        <Field label={__("API key")} hint={cfg.has_key ? __("Saved ({0}). Leave empty to keep it.", cfg.key_hint) : keyHint}>
          <Input type="password" aria-label={__("{0} API key", name)} autoComplete="off" value={c.api_key} onChange={(e) => setC({ ...c, api_key: e.target.value })} placeholder={cfg.has_key ? cfg.key_hint : ''} />
        </Field>
        <Field label={idLabel}><Input aria-label={`${name} ${idLabel}`} value={c.list_id} onChange={(e) => setC({ ...c, list_id: e.target.value })} placeholder={idPlaceholder} /></Field>
      </div>
      {doubleOptin && <Checkbox label={__("Ask them to confirm by email first (double opt-in)")} checked={c.double_optin} onChange={(e) => setC({ ...c, double_optin: e.target.checked })} />}
      <Field label={__("Which forms")}><FormsChoice id={name} value={c.forms} onChange={(v) => setC({ ...c, forms: v })} forms={forms} newsletterLabel={__("Newsletter blocks only")} allLabel={__("Every form with a ticked consent box")} /></Field>
      <div className="ui-row" style={{ gap: 8 }}>
        <Button variant="primary" icon={Save} onClick={save} disabled={!!busy}>{busy === 'save' ? __("Saving…") : __("Save {0}", name)}</Button>
        <Button icon={Send} onClick={test} disabled={!!busy || !cfg.has_key}>{__("Test the connection")}</Button>
      </div>
    </Card>
  );
}

function Analytics({ data, reload }) {
  const [a, setA] = useState({ ...data.config.analytics });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      const d = await post('integrations_save', { section: 'analytics', data: a });
      if (d.success) { notify(__("Analytics saved. Publish the site to put it on your pages.")); setA({ ...d.config.analytics }); reload(); } else notify(d.message || __("Not saved."), 'error');
    } catch { notify(__("Not saved (connection problem)."), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card title={__("Analytics")} icon={BarChart3} description={__("Count your visitors with a service you already use. The snippet is added to every page at the next publish.")}>
      <Field label={__("Service")}>
        <Select aria-label={__("Analytics service")} value={a.provider} onChange={(e) => set({ provider: e.target.value })} options={[['none', __("None")], ['ga4', __("Google Analytics 4")], ['plausible', __("Plausible")], ['matomo', __("Matomo")]]} />
      </Field>
      {a.provider === 'ga4' && <Field label={__("Measurement ID")} hint={__("Looks like G-XXXXXXXXXX (Admin › Data streams in Google Analytics).")}><Input aria-label={__("Measurement ID")} value={a.ga4_id} onChange={(e) => set({ ga4_id: e.target.value })} placeholder={__("G-XXXXXXXXXX")} /></Field>}
      {a.provider === 'plausible' && (
        <div className="ui-grid" style={{ '--ui-min': '220px' }}>
          <Field label={__("Your site's domain")} hint={__("As added in Plausible.")}><Input aria-label={__("Plausible domain")} value={a.plausible_domain} onChange={(e) => set({ plausible_domain: e.target.value })} placeholder={__("example.com")} /></Field>
          <Field label={__("Plausible host (self-hosted only)")}><Input aria-label={__("Plausible host")} value={a.plausible_host} onChange={(e) => set({ plausible_host: e.target.value })} placeholder={__("plausible.io")} /></Field>
        </div>
      )}
      {a.provider === 'matomo' && (
        <div className="ui-grid" style={{ '--ui-min': '220px' }}>
          <Field label={__("Matomo address (https)")}><Input aria-label={__("Matomo address")} value={a.matomo_url} onChange={(e) => set({ matomo_url: e.target.value })} placeholder={__("https://stats.example.com/")} /></Field>
          <Field label={__("Site ID")}><Input aria-label={__("Matomo site ID")} value={a.matomo_site} onChange={(e) => set({ matomo_site: e.target.value })} placeholder="1" /></Field>
        </div>
      )}
      {(a.provider === 'ga4' || a.provider === 'matomo') && (
        <Checkbox label={__("Wait for the visitor to accept cookies (needs the cookie banner in Global Options)")} checked={!!a.consent} onChange={(e) => set({ consent: e.target.checked })} />
      )}
      {a.provider === 'plausible' && <p className="ui-hint">{__("Plausible does not use cookies, so it counts every visit without asking.")}</p>}
      {(a.provider === 'ga4' || a.provider === 'matomo') && a.consent && <p className="ui-hint">{__("With the cookie banner on, the snippet only runs after the visitor presses Accept. Without a banner it runs for everyone.")}</p>}
      <Button variant="primary" icon={Save} onClick={save} disabled={busy}>{busy ? __("Saving…") : __("Save analytics")}</Button>
    </Card>
  );
}

function Stripe({ data, reload }) {
  const s = data.config.stripe;
  const [key, setKey] = useState('');
  const [nl, setNl] = useState({ name: '', amount: '', currency: 'eur', adjustable: false });
  const [add, setAdd] = useState({ name: '', url: '' });
  const [busy, setBusy] = useState('');
  const run = async (what, action, body, ok) => {
    setBusy(what);
    try { const d = await post(action, body); notify(d.message || d.success ? ok : __("Failed."), d.success ? 'success' : 'error'); if (d.success) { reload(); return d; } } catch { notify(__("Connection problem."), 'error'); } finally { setBusy(''); }
    return null;
  };
  return (
    <>
      <Card title={__("Stripe")} icon={CreditCard} description={__("Sell with Stripe payment links: the visitor pays on Stripe's own page, so no card data ever touches your site. Put a link on a page with the Payment Button block.")}>
        <Field label={__("Secret or restricted key")} hint={s.has_key ? __("Saved ({0}{1}). Leave empty to keep it.", s.key_hint, s.mode ? `, ${s.mode} mode` : '') : __("Needed only to create links from here. Use a restricted key that can write Products, Prices and Payment Links.")}>
          <Input type="password" aria-label={__("Stripe key")} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.has_key ? s.key_hint : __("rk_live_… or sk_test_…")} />
        </Field>
        <div className="ui-row" style={{ gap: 8 }}>
          <Button variant="primary" icon={Save} disabled={!!busy || !key} onClick={async () => { const d = await run('key', 'integrations_save', { section: 'stripe_key', data: { api_key: key } }, __("Key saved.")); if (d) setKey(''); }}>{__("Save the key")}</Button>
          {s.has_key && <Button variant="danger" onClick={() => run('clear', 'integrations_save', { section: 'stripe_key', data: { clear_key: true } }, __("Key removed."))} disabled={!!busy}>{__("Remove the key")}</Button>}
          {s.mode && <Badge tone={s.mode === 'live' ? 'published' : 'draft'}>{s.mode === 'live' ? __("Live mode") : __("Test mode")}</Badge>}
        </div>
      </Card>
      <Card title={__("Payment links")} icon={CreditCard} description={__("The links the Payment Button block offers.")}>
        {s.links.length === 0 ? <p className="ui-hint">{__("No payment links yet. Create one below, or add one you made in the Stripe dashboard.")}</p> : (
          <ul className="cc-backup-list" aria-label={__("Payment links")}>
            {s.links.map((l) => (
              <li key={l.id} className="cc-backup-item" data-link={l.id}>
                <span className="cc-backup-item__main">
                  <span className="cc-backup-item__title">{l.name} {l.amount ? <span className="ui-hint">{l.amount} {String(l.currency || '').toUpperCase()}</span> : null} {!l.active && <Badge tone="neutral">{__("Off")}</Badge>}</span>
                  <span className="cc-backup-item__meta">{l.url}</span>
                </span>
                <span className="cc-backup-item__actions">
                  <Checkbox label={__("Offer")} checked={!!l.active} onChange={(e) => run('toggle', 'stripe_link_set_active', { id: l.id, active: e.target.checked }, __("Done."))} />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={__("Remove {0}", l.name)} onClick={() => run('remove', 'stripe_link_remove', { id: l.id }, __("Removed from the list."))} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={__("Create a payment link")} icon={Plus} description={__("Made at Stripe with your key: a product, its price and a link to pay.")}>
        <div className="ui-grid" style={{ '--ui-min': '180px' }}>
          <Field label={__("Product name")}><Input aria-label={__("Product name")} value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} placeholder={__("Online course")} /></Field>
          <Field label={__("Price")}><Input aria-label={__("Price")} inputMode="decimal" value={nl.amount} onChange={(e) => setNl({ ...nl, amount: e.target.value })} placeholder="49.00" /></Field>
          <Field label={__("Currency")}><Select aria-label={__("Currency")} value={nl.currency} onChange={(e) => setNl({ ...nl, currency: e.target.value })} options={CURRENCIES.map((c) => [c, c.toUpperCase()])} /></Field>
        </div>
        <Checkbox label={__("The buyer can change the quantity")} checked={nl.adjustable} onChange={(e) => setNl({ ...nl, adjustable: e.target.checked })} />
        <Button variant="primary" icon={Plus} disabled={!!busy || !s.has_key} onClick={async () => { const d = await run('create', 'stripe_link_create', nl, __("Payment link created.")); if (d) setNl({ ...nl, name: '', amount: '' }); }}>{busy === 'create' ? __("Creating…") : __("Create the link")}</Button>
        {!s.has_key && <p className="ui-hint">{__("Save your Stripe key first.")}</p>}
      </Card>
      <Card title={__("Add an existing link")} icon={Plus} description={__("A payment link you made in the Stripe dashboard (https://buy.stripe.com/…): no key needed.")}>
        <div className="ui-grid" style={{ '--ui-min': '220px' }}>
          <Field label={__("Name")}><Input aria-label={__("Link name")} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder={__("Workshop ticket")} /></Field>
          <Field label={__("Link")}><Input aria-label={__("Link address")} value={add.url} onChange={(e) => setAdd({ ...add, url: e.target.value })} placeholder={__("https://buy.stripe.com/…")} /></Field>
        </div>
        <Button icon={Plus} disabled={!!busy || !add.name || !add.url} onClick={async () => { const d = await run('add', 'stripe_link_add', add, __("Link added.")); if (d) setAdd({ name: '', url: '' }); }}>{__("Add the link")}</Button>
      </Card>
    </>
  );
}

function Activity({ data, reload }) {
  const resend = async (r) => { const d = await post('integrations_resend', { id: r.id }); notify(d.message || d.success ? __("Sent.") : __("Failed."), d.success ? 'success' : 'error'); reload(); };
  const clear = async () => { if (!(await confirmDialog({ title: __("Clear the activity list?"), message: __("Failed deliveries that could be sent again are forgotten too."), confirmLabel: __("Clear"), danger: true }))) return; await post('integrations_log_clear'); reload(); };
  return (
    <Card title={__("Activity")} icon={ListChecks} description={__("The latest deliveries of webhooks and newsletter sign-ups. A failed one can be sent again.")} actions={data.log.length > 0 && <Button size="sm" variant="ghost" onClick={clear}>{__("Clear")}</Button>}>
      {data.log.length === 0 ? <p className="ui-hint">{__("Nothing sent yet.")}</p> : (
        <div className="ui-table-wrap">
          <table className="ui-table" aria-label={__("Deliveries")}>
            <thead><tr><th>{__("When")}</th><th>{__("What")}</th><th>{__("Result")}</th><th className="ui-cell-actions">{' '}</th></tr></thead>
            <tbody>
              {data.log.map((r) => (
                <tr key={r.id} data-log={r.id}>
                  <td className="ui-cell-muted">{when(r.created_at)}</td>
                  <td>{r.kind === 'webhook' ? __("Webhook") : __("Newsletter")}: {r.target} <span className="ui-hint">{r.event}</span></td>
                  <td><Badge tone={r.status === 'ok' ? 'published' : 'draft'}>{r.status === 'ok' ? __("Sent") : __("Failed")}</Badge> <span className="ui-hint">{r.detail}</span></td>
                  <td className="ui-cell-actions">{r.can_resend && <Button size="sm" icon={Send} onClick={() => resend(r)}>{__("Send again")}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function Integrations() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('webhooks');
  const [secrets, setSecrets] = useState({});   // a webhook's secret, shown once (kept here so a reload of the list does not lose it)
  const [rev, setRev] = useState(0);        // bumped on each reload so the forms below start from what the server holds
  const reload = useCallback(() => fetch('api.php?action=integrations_get').then((r) => r.json())
    .then((d) => { setData(d && d.success ? d : { error: (d && d.message) || __("Could not load the integrations.") }); setRev((n) => n + 1); })
    .catch(() => setData({ error: __("Could not load the integrations (connection problem).") })), []);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon={Plug} title={__("Integrations")} description={__("Connect your forms and your site to other services: webhooks, newsletters, analytics and Stripe payment links.")} />
      {data && data.error && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{data.error}</span></div>}
      {data && data.demo && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{__("Integrations are turned off in the demo.")}</span></div>}
      {data && data.curl === false && <div role="alert" className="cc-backup-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{__("This server has no PHP curl extension, so nothing can be sent to other services.")}</span></div>}
      {!data ? <p className="ui-hint">{__("Loading…")}</p> : data.error ? null : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={TABS} label={__("Integrations")} idPrefix="int" />
          <div role="tabpanel" aria-labelledby={`int-${tab}`} style={{ marginTop: 12 }} key={`${tab}-${rev}`}>
            {tab === 'webhooks' && <Webhooks data={data} reload={reload} secrets={secrets} setSecrets={setSecrets} />}
            {tab === 'newsletter' && (
              <>
                <Service name="Mailchimp" svc="mailchimp" cfg={data.config.mailchimp} forms={data.forms} reload={reload} doubleOptin keyHint={__("In Mailchimp: Profile › Extras › API keys (it ends with -us21 or similar).")} idLabel={__("Audience ID")} idPlaceholder="a1b2c3d4e5" />
                <Service name="Brevo" svc="brevo" cfg={data.config.brevo} forms={data.forms} reload={reload} keyHint={__("In Brevo: SMTP & API › API keys (it starts with xkeysib-).")} idLabel={__("List ID")} idPlaceholder="3" />
              </>
            )}
            {tab === 'analytics' && <Analytics data={data} reload={reload} />}
            {tab === 'stripe' && <Stripe data={data} reload={reload} />}
            {tab === 'activity' && <Activity data={data} reload={reload} />}
          </div>
        </>
      )}
    </div>
  );
}
