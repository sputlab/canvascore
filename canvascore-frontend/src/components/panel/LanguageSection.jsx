// Language (Page Settings, for a page or a collection item of a multilingual site): the language the page is written in, and its translations: open one,
// start one in a language it lacks (a draft copy to write over), or take the page out of the group. A page that has translations keeps its language.
import React, { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PanelAccordion } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { confirmDialog } from '../../ui/dialog';
import { notify } from '../../ui/notify';
import { isMultilingual, langOf, langName, translationsOf, missingLanguages } from '../../editor/languages';
import { __ } from '../../i18n/index.js';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const link = { background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: 12, textDecoration: 'underline' };

export default function LanguageSection({ activePage, updateActivePage, pages }) {
  const langs = useStore((s) => s.languages);
  const dirty = useStore((s) => s.editorDirty);
  const { setActivePage, setBlocks, setSelectedBlockId, refreshPages } = useStore();
  const isItem = !!activePage?.__item;
  const [itemRows, setItemRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const multi = isMultilingual(langs);
  const liveId = Number(activePage?.is_draft_copy) === 1 && activePage.parent_id ? activePage.parent_id : activePage?.id;

  // an item: the other items of its collection (the translations are among them)
  useEffect(() => {
    if (!multi || !isItem || !activePage.collection_id) return undefined;
    let alive = true;
    fetch('api.php?action=get_items&collection=' + encodeURIComponent(activePage.collection_id)).then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d)) setItemRows(d); }).catch(() => {});
    return () => { alive = false; };
  }, [multi, isItem, activePage?.collection_id, activePage?.trans_group]);

  if (!multi) return null;
  const rows = isItem ? itemRows : pages;
  const me = { ...activePage, id: liveId };
  const mine = translationsOf(rows, me);
  const missing = missingLanguages(rows, me, langs);
  const code = langOf(activePage, langs);
  const grouped = !!activePage.trans_group && mine.length > 0;

  const openPage = async (p) => {
    if (dirty && !(await confirmDialog({ title: __("Leave with unsaved changes?"), message: __("They stay backed up on this device, but they are NOT saved to the site."), confirmLabel: __("Leave anyway"), cancelLabel: __("Stay") }))) return;
    const target = p.status === 'modified' && p.draft_copy ? p.draft_copy : p;
    let blocks = []; try { blocks = JSON.parse(target.content_json || '[]'); } catch { blocks = []; }
    setActivePage(target); setBlocks(Array.isArray(blocks) ? blocks : []); setSelectedBlockId(null);
  };
  const translate = async (lang) => {
    setBusy(true);
    try {
      const d = await post(isItem ? 'translate_item' : 'translate_page', { id: liveId, lang });
      if (!d || !d.success) { notify(d && d.message || __("Could not create the translation."), 'error'); return; }
      notify(d.message || __("Translation created."));
      if (isItem) { updateActivePage({ trans_group: d.item.trans_group }); setItemRows((r) => [...r.filter((x) => x.id !== d.item.id), d.item]); } else {
        await refreshPages();
        updateActivePage({ trans_group: d.page.trans_group });
        const fresh = useStore.getState().pages.find((p) => p.id === d.page.id) || d.page;
        await openPage(fresh);
      }
    } catch { notify(__("Could not create the translation (connection problem)."), 'error'); } finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!(await confirmDialog({ title: __("Unlink from its translations?"), message: __("The pages stay as they are, but are no longer offered as each other's translation (language switcher, hreflang)."), confirmLabel: __("Unlink") }))) return;
    const d = await post('unlink_translation', { kind: isItem ? 'item' : 'page', id: liveId });
    if (d && d.success) { updateActivePage({ trans_group: '' }); refreshPages(); setItemRows((r) => r.map((x) => (x.trans_group === activePage.trans_group ? { ...x, trans_group: '' } : x))); notify(d.message || __("Unlinked.")); } else notify(d && d.message || __("Not unlinked."), 'error');
  };

  return (
    <PanelAccordion title={__("Language")} icon={Languages} defaultOpen={true}>
      <label style={labelStyle} htmlFor="cc-page-lang">{__("This")} {isItem ? 'item' : 'page'} {__("is written in")}</label>
      <select id="cc-page-lang" style={inputStyle} value={code} disabled={grouped} onChange={(e) => updateActivePage({ lang: e.target.value })}>
        {langs.list.map((l) => <option key={l.code} value={l.code}>{l.name}{l.code === langs.default ? ' (default)' : ''}</option>)}
      </select>
      {grouped && <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0' }}>{__("Its language is fixed while it is linked to translations.")}</p>}
      <label style={labelStyle}>{__("Translations")}</label>
      {mine.length === 0 && <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 6px' }}>{__("No translations yet.")}</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
        {mine.map((t) => (
          <li key={t.id} style={{ fontSize: 12, color: '#cbd5e1' }} data-translation={t.id}>
            <strong>{langName(langOf(t, langs), langs)}</strong>: {isItem ? t.title : <button type="button" style={link} onClick={() => openPage(t)}>{t.title}</button>}
            <span style={{ color: '#64748b' }}> · {t.status === 'published' ? 'published' : t.status === 'modified' ? 'modified' : 'draft'}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {missing.map((l) => (
            <button key={l.code} type="button" disabled={busy || dirty || !activePage.id} onClick={() => translate(l.code)}
              style={{ display: 'block', width: '100%', marginBottom: 6, padding: '7px 10px', background: 'transparent', color: '#38bdf8', border: '1px dashed #334155', borderRadius: 6, cursor: busy || dirty ? 'default' : 'pointer', fontSize: 12, opacity: busy || dirty ? 0.5 : 1 }}>
              {__("+ Translate into")} {l.name}
            </button>
          ))}
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{dirty ? __("Save first: a translation starts from the saved version.") : __("A draft copy to write over: same blocks and settings, an address of its own.")}</p>
        </div>
      )}
      {grouped && <button type="button" style={{ ...link, marginTop: 8, color: '#94a3b8' }} onClick={unlink}>{__("Unlink from its translations")}</button>}
    </PanelAccordion>
  );
}
