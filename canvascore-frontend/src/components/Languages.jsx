// Administration › Languages (admin): the languages of the site and which one is the default (published at the root; the others each in a folder of their own:
// /it/…), and the texts a language replaces in the site-wide parts (the announcement bar and the cookie banner). Pages and collection items are translated
// from their own lists (Translate); the Language Switcher block lets visitors move between the translations; the pages carry hreflang links.
import React, { useEffect, useMemo, useState } from 'react';
import { Languages as LanguagesIcon, Plus, Trash2, Save, Info, Megaphone, Cookie } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, IconButton, Card, PageHeader, Field, Input, Select, Checkbox, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { LANGUAGE_PRESETS, MAX_LANGUAGES, cleanCode } from '../editor/languages';
import { __ } from '../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
const ANN = [['text', __("Text of the bar"), 300], ['linkText', __("Link text"), 60], ['linkUrl', __("Link address"), 500]];
const COOKIE = [['text', __("Message"), 500], ['acceptLabel', __("Accept button"), 40], ['declineLabel', __("Decline button"), 40], ['privacyLabel', __("Privacy link text"), 60], ['privacyUrl', __("Privacy page address"), 500]];

export default function Languages() {
  const setStore = useStore((s) => s.setLanguages);
  const pages = useStore((s) => s.pages);
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [siteUrl, setSiteUrl] = useState(null);
  const [preset, setPreset] = useState('');
  const [custom, setCustom] = useState({ code: '', name: '' });

  useEffect(() => {
    let alive = true;
    fetch('api.php?action=get_languages').then((r) => r.json()).then((d) => {
      if (!alive) return;
      const l = (d && d.languages) || { enabled: false, default: '', list: [], strings: {} };
      const full = { enabled: !!l.enabled, default: l.default || '', list: l.list || [], strings: l.strings || {} };
      setCfg(full); setSaved(JSON.stringify(full));
    }).catch(() => { if (alive) { setCfg({ enabled: false, default: '', list: [], strings: {} }); notify(__("Could not load the languages."), 'error'); } });
    fetch('api.php?action=get_settings').then((r) => r.json()).then((s) => { if (alive) setSiteUrl(String((s && s.siteUrl) || '')); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const dirty = cfg && JSON.stringify(cfg) !== saved;
  const taken = useMemo(() => new Set((cfg ? cfg.list : []).map((l) => l.code)), [cfg]);
  if (!cfg) return <p className="ui-hint">{__("Loading…")}</p>;

  const patch = (p) => setCfg((c) => ({ ...c, ...p }));
  const add = (code, name) => {
    const c = cleanCode(code);
    if (!c) { notify(__("A language code is two or three letters, like it or de (and an optional region: pt-br)."), 'error'); return false; }
    if (taken.has(c)) { notify(__("That language is already in the list."), 'error'); return false; }
    if (cfg.list.length >= MAX_LANGUAGES) { notify(__("A site can have up to {0} languages.", MAX_LANGUAGES), 'error'); return false; }
    const list = [...cfg.list, { code: c, name: String(name || '').trim() || c.toUpperCase() }];
    patch({ list, default: cfg.default || c });
    return true;
  };
  const setName = (code, name) => patch({ list: cfg.list.map((l) => (l.code === code ? { ...l, name } : l)) });
  const used = (code) => (pages || []).filter((p) => !Number(p.is_draft_copy) && p.lang === code).length;
  const remove = async (l) => {
    const n = used(l.code);
    if (!(await confirmDialog({ title: __("Remove {0}?", l.name), message: n ? (n === 1 ? __("1 page in this language will no longer be published (they stay in the editor). Items of collections in this language too.") : __("{0} pages in this language will no longer be published (they stay in the editor). Items of collections in this language too.", n)) : __("Nothing is written in this language yet."), confirmLabel: __("Remove language"), danger: n > 0 }))) return;
    const list = cfg.list.filter((x) => x.code !== l.code);
    const strings = { ...cfg.strings }; delete strings[l.code];
    patch({ list, strings, default: cfg.default === l.code ? (list[0] ? list[0].code : '') : cfg.default });
  };
  const setText = (code, group, key, value) => {
    const cur = cfg.strings[code] || {};
    patch({ strings: { ...cfg.strings, [code]: { ...cur, [group]: { ...(cur[group] || {}), [key]: value } } } });
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await post('save_languages', cfg);
      if (!d.success) { notify(d.message || __("Not saved."), 'error'); return; }
      const l = d.languages;
      const full = { enabled: !!l.enabled, default: l.default || '', list: l.list || [], strings: l.strings || {} };
      setCfg(full); setSaved(JSON.stringify(full)); setStore(full);
      notify(d.message || __("Languages saved."), d.clash && d.clash.length ? 'error' : 'success');
    } catch { notify(__("Not saved (connection problem)."), 'error'); } finally { setBusy(false); }
  };

  const others = cfg.list.filter((l) => l.code !== cfg.default);
  return (
    <>
      <PageHeader icon={LanguagesIcon} title={__("Languages")} description={__("Publish the site in more than one language. Every translation is a page (or a collection item) of its own, with its own address, texts and search engine details; visitors move between them with the Language Switcher block.")}
        actions={<Button variant="primary" icon={Save} onClick={save} disabled={busy || !dirty}>{busy ? __("Saving…") : __("Save languages")}</Button>} />

      <Card title={__("Languages of the site")} icon={LanguagesIcon}
        description={__("The default language is published at the root of the site (/about/); each other language has a folder of its own (/it/chi-siamo/).")}>
        <Checkbox label={__("This site is multilingual")} checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        {cfg.enabled && cfg.list.length < 2 && <p className="ui-hint" role="status">{__("Add at least two languages.")}</p>}
        <div className="ui-table-wrap" style={{ marginTop: 12 }}>
          <table className="ui-table">
            <thead><tr><th>{__("Code")}</th><th>{__("Name")}</th><th>{__("Address")}</th><th>{__("Default")}</th><th className="ui-cell-actions">{__("Remove")}</th></tr></thead>
            <tbody>
              {cfg.list.length === 0 && <tr><td colSpan={5} className="ui-cell-muted">{__("No languages yet: add the first below (usually the one the site is written in now).")}</td></tr>}
              {cfg.list.map((l) => (
                <tr key={l.code} data-lang={l.code}>
                  <td><code>{l.code}</code></td>
                  <td><Input aria-label={__("Name of {0}", l.code)} value={l.name} maxLength={40} onChange={(e) => setName(l.code, e.target.value)} /></td>
                  <td className="ui-cell-muted">{l.code === cfg.default ? '/' : `/${l.code}/`}</td>
                  <td><input type="radio" name="default-language" aria-label={__("{0} is the default language", l.name)} checked={l.code === cfg.default} onChange={() => patch({ default: l.code })} /></td>
                  <td className="ui-cell-actions"><IconButton icon={Trash2} label={__("Remove {0}", l.name)} size="sm" style={{ color: '#f87171' }} onClick={() => remove(l)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ui-row" style={{ marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={__("Add a language")}>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)} options={[['', __("Choose…")], ...LANGUAGE_PRESETS.filter(([c]) => !taken.has(c)).map(([c, n]) => [c, `${n} (${c})`])]} />
          </Field>
          <Button icon={Plus} disabled={!preset} onClick={() => { const p = LANGUAGE_PRESETS.find(([c]) => c === preset); if (p && add(p[0], p[1])) setPreset(''); }}>{__("Add")}</Button>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="ui-hint" style={{ cursor: 'pointer' }}>{__("A language that is not in the list")}</summary>
          <div className="ui-row" style={{ marginTop: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label={__("Code")} hint={__("2–3 letters, e.g. sq or fil")}><Input value={custom.code} maxLength={11} onChange={(e) => setCustom({ ...custom, code: e.target.value })} /></Field>
            <Field label={__("Name")} hint={__("As the language writes it")}><Input value={custom.name} maxLength={40} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></Field>
            <Button icon={Plus} disabled={!custom.code} onClick={() => { if (add(custom.code, custom.name)) setCustom({ code: '', name: '' }); }}>{__("Add")}</Button>
          </div>
        </details>
        {cfg.enabled && siteUrl === '' && (
          <p className="ui-hint" role="status" style={{ marginTop: 12 }}>
            <Info size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {__("Search engines need absolute addresses for the hreflang links: set the site address in Global Options (Site address), or they are left out.")}
          </p>
        )}
      </Card>

      {cfg.enabled && others.length > 0 && (
        <Card title={__("Texts per language")} icon={Megaphone}
          description={__("The announcement bar and the cookie banner are set once in Global Options. Fill a field here to replace it in a language; a field left empty keeps the site's own text.")}>
          {others.map((l) => {
            const s = cfg.strings[l.code] || {};
            return (
              <details key={l.code} data-texts={l.code} style={{ borderTop: '1px solid #334155', padding: '10px 0' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{l.name} <Badge>{l.code}</Badge></summary>
                <h3 className="ui-card__title" style={{ marginTop: 12 }}><Megaphone size={14} color="#38bdf8" aria-hidden="true" /> {__("Announcement bar")}</h3>
                {ANN.map(([k, label, max]) => (
                  <Field key={k} label={label}><Input aria-label={`${l.name}: ${label}`} value={(s.announcement || {})[k] || ''} maxLength={max} onChange={(e) => setText(l.code, 'announcement', k, e.target.value)} /></Field>
                ))}
                <h3 className="ui-card__title" style={{ marginTop: 12 }}><Cookie size={14} color="#38bdf8" aria-hidden="true" /> {__("Cookie banner")}</h3>
                {COOKIE.map(([k, label, max]) => (
                  <Field key={k} label={label}><Input aria-label={`${l.name}: ${label}`} value={(s.cookie || {})[k] || ''} maxLength={max} onChange={(e) => setText(l.code, 'cookie', k, e.target.value)} /></Field>
                ))}
              </details>
            );
          })}
        </Card>
      )}

      <Card title={__("How it works")} icon={Info}>
        <ul className="ui-hint" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>{__("In")} <strong>{__("Pages")}</strong> {__("and in a")} <strong>{__("Collection")}</strong>{__(", use")} <em>{__("Translate")}</em> {__("to start a translation: a draft copy in the other language that you then write over. Translations are linked, so the site can offer a visitor the same page in another language.")}</li>
          <li>{__("Add the")} <strong>{__("Language Switcher")}</strong> {__("block to the header (Global header) or to any page. The Menu, the global header and the footer can each have their own version per language.")}</li>
          <li>{__("Every page gets")} <code>&lt;html lang&gt;</code> {__("and hreflang links to its translations, and the sitemap lists them, so search engines show the right language to the right visitor.")}</li>
          <li>{__("Publish the site to apply the changes. Nothing changes on a site until at least two languages are added and this is switched on.")}</li>
        </ul>
      </Card>
    </>
  );
}
