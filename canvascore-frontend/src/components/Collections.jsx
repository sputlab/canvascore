import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Library, Plus, Trash2, Pencil, FileText, Folder, Archive, ArchiveRestore, Globe, CheckSquare, MoveRight, X, LayoutTemplate, Languages as LanguagesIcon } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, Badge, StatusBadge, Select } from '../ui/kit';
import { slugify } from '../utils/slug';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import StarterPickerDialog from './StarterPickerDialog';
import { starterBlocks } from '../editor/starters';
import CollectionFields from './CollectionFields';
import CollectionTaxonomies from './CollectionTaxonomies';
import CollectionArchives from './CollectionArchives';
import CollectionAccess from './CollectionAccess';
import { canCreate, canManageSite, reviewOf, REVIEW_LABEL } from '../session/permissions';
import { isMultilingual, langOf, langName, translationsOf, missingLanguages } from '../editor/languages';
import { __, _n } from '../i18n/index.js';

// An item's custom field values as an object (the server keeps them as JSON text)
const parseFieldValues = (raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};

export default function Collections() {
  const { setView, userRole, setActivePage, setBlocks, setSelectedBlockId, publishSiteAsync, activePage, setPendingItem } = useStore();
  const mayCreate = canCreate(userRole);
  const manage = canManageSite(userRole);   // bulk actions, archiving, deleting any item
  const mayDelete = (it) => manage || (userRole === 'author' && it.status !== 'published');
  const [collections, setCollections] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error (never "empty" while still loading)
  const [active, setActive] = useState(null); // selected collection
  const [items, setItems] = useState([]);
  const [itemsState, setItemsState] = useState('idle');
  const activeRef = useRef(null);
  const [newName, setNewName] = useState(null); // inline "new collection" field (null = closed)
  const [renaming, setRenaming] = useState(null); // { id, name, slug, oldSlug } while the rename form is open
  const [selected, setSelected] = useState(() => new Set()); // ids of the selected items
  const [lastClicked, setLastClicked] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [needsPublish, setNeedsPublish] = useState(''); // why the public site is behind ('' = it is not)
  const [publishing, setPublishing] = useState(false);
  const [picking, setPicking] = useState(false);   // "New Item": choosing a starter template
  // Languages: the filter of the list, the language of each item and its translations (Translate starts one)
  const langs = useStore((s) => s.languages);
  const multi = isMultilingual(langs);
  const [langFilter, setLangFilter] = useState('');
  const [translating, setTranslating] = useState('');

  const loadCollections = () => {
    return fetch('api.php?action=get_collections').then(r => r.json()).then(d => {
      if (!Array.isArray(d)) throw new Error((d && d.message) || __("Unexpected answer from the server"));
      setCollections(d); setLoadState('ready');
      return d;
    }).catch((e) => { setLoadState('error'); notify(__("Could not load the collections: {0}", e.message), 'error'); return null; });
  };
  const loadItems = (cid) => {
    setItemsState('loading');
    return fetch('api.php?action=get_items&collection=' + encodeURIComponent(cid)).then(r => r.json()).then(d => {
      if (activeRef.current !== cid) return;              // another collection was chosen meanwhile
      if (!Array.isArray(d)) throw new Error((d && d.message) || __("Unexpected answer from the server"));
      setItems(d); setItemsState('ready');
      setSelected((prev) => { const ids = new Set(d.map((x) => x.id)); const next = new Set([...prev].filter((id) => ids.has(id))); return next.size === prev.size ? prev : next; });
    }).catch((e) => { if (activeRef.current === cid) { setItemsState('error'); notify(__("Could not load the items: {0}", e.message), 'error'); } });
  };
  // Choosing a collection: the previous items go away at once, then the new ones load
  const choose = (c) => { activeRef.current = c ? c.id : null; setItems([]); setSelected(new Set()); setLastClicked(null); setMoveTo(''); setActive(c); if (c) loadItems(c.id); };

  const createCollection = async (e) => {
    if (e) e.preventDefault();
    const name = (newName || '').trim();
    if (!name) return;
    try {
      const res = await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ name }) });
      const data = await res.json();
      if (data.success) { setNewName(null); notify(__("Collection \"{0}\" created.", name)); loadCollections(); }
      else notify(data.message || __("Could not create the collection."), 'error');
    } catch { notify(__("Could not create the collection (connection problem)."), 'error'); }
  };
  const startRename = (c) => { setNewName(null); setRenaming({ id: c.id, name: c.name, slug: c.slug, oldSlug: c.slug }); };
  const renameCollection = async (e) => {
    if (e) e.preventDefault();
    const r = renaming; if (!r) return;
    const name = r.name.trim();
    const slug = slugify(r.slug) || slugify(name) || r.oldSlug;
    if (!name) return;
    if (slug !== r.oldSlug && !(await confirmDialog({ title: __("Change the address to /{0}/?", slug), message: __("The items of this collection move from /{0}/… to /{1}/…. The old addresses forward to the new ones after you publish the site.", r.oldSlug, slug), confirmLabel: __("Change address") }))) return;
    try {
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: r.id, name, slug }) })).json();
      if (!data || !data.success) { notify(data && data.message || __("Could not rename the collection."), 'error'); return; }
      setRenaming(null);
      if (active?.id === r.id) setActive((a) => ({ ...a, name: data.name, slug: data.slug }));
      notify(__("Collection renamed to \"{0}\".", data.name));
      if (data.moved) setNeedsPublish(__("The collection address changed. The site uses the new address after you publish it."));
      loadCollections();
    } catch { notify(__("Could not rename the collection (connection problem)."), 'error'); }
  };
  const removeCollection = async (c) => {
    if (!(await confirmDialog({ title: __("Delete the collection \"{0}\"?", c.name), message: __("All its items are deleted too. This cannot be undone."), confirmLabel: __("Delete collection"), danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_collection', { method: 'POST', body: JSON.stringify({ id: c.id }) })).json();
      if (!data || data.success === false) { notify(data && data.message || __("Could not delete the collection."), 'error'); return; }
      if (active?.id === c.id) choose(null);
      if (renaming?.id === c.id) setRenaming(null);
      notify(__("Collection \"{0}\" deleted.", c.name));
    } catch { notify(__("Could not delete the collection (connection problem)."), 'error'); }
    loadCollections();
  };

  // A new item (item = null) can start from a starter template: its blocks, with fresh ids
  // The design of a collection: the blocks every item page is built from (admins). It is edited like a page; the site
  // shows it once it is published.
  const openDesign = async (c) => {
    let blocks = [];
    try {
      const data = await (await fetch('api.php?action=get_collection_design&collection=' + encodeURIComponent(c.id))).json();
      blocks = Array.isArray(data.blocks) ? data.blocks : [];
    } catch { notify(__("Could not open the design (connection problem)."), 'error'); return; }
    setActivePage({ id: 'design_' + c.id, __design: true, collection_id: c.id, __collectionSlug: c.slug, __fieldDefs: c.fields || [],
      title: __("Design of {0}", c.name), slug: c.slug, layout: 'full', bg_color: '#ffffff', boxed_width: '1100px', status: 'draft', seo_title: '', seo_description: '' });
    setBlocks(blocks);
    setSelectedBlockId(null);
    setView('editor');
  };
  const editItem = async (item, starter = null, col = active) => {
    let full = { id: item?.id, collection_id: col.id, lang: multi ? (langFilter || langs.default) : '', trans_group: '', title: __("New Item"), slug: 'new-item', excerpt: '', cover_image: '', date: new Date().toISOString().slice(0, 10), status: 'draft', archived: 0, seo_title: '', seo_description: '', blocks: starter ? starterBlocks(starter) : [] };
    if (item) {
      try {
        const res = await fetch('api.php?action=get_item&id=' + encodeURIComponent(item.id));
        const data = await res.json();
        if (!data || !data.id) { notify(__("This item no longer exists (deleted elsewhere?)."), 'error'); loadItems(col.id); return; }
        let blocks = [];
        try { blocks = JSON.parse(data.content_json || '[]'); } catch { blocks = []; }
        full = { ...data, blocks, field_values: parseFieldValues(data.field_values), terms: parseFieldValues(data.terms_json) };
      } catch { notify(__("Could not open the item (connection problem)."), 'error'); return; }
    }
    // the collection's categories and tags, for the item's settings
    let taxes = [];
    try { taxes = await (await fetch('api.php?action=get_taxonomies&collection=' + encodeURIComponent(col.id))).json(); } catch { taxes = []; }
    if (!Array.isArray(taxes)) taxes = [];
    // open the block editor on the item's content
    setActivePage({
      id: full.id || ('item_' + Date.now()),
      __item: true, collection_id: col.id, lang: full.lang || '', trans_group: full.trans_group || '',
      title: full.title, slug: full.slug, excerpt: full.excerpt, cover_image: full.cover_image,
      date: full.date, status: full.status === 'published' ? 'published' : 'draft',
      archived: Number(full.archived) ? 1 : 0,
      seo_title: full.seo_title || '', seo_description: full.seo_description || '',
      // the custom fields: their definitions (for the inputs and the Item Field block) and this item's values
      __fieldDefs: col.fields || [], field_values: full.field_values || {},
      // categories and tags: the collection's taxonomies, and the terms this item has (taxonomy id => term ids)
      __taxonomies: taxes, terms: full.terms || {},
      // scheduled publishing of the item
      publish_at: full.publish_at || '', unpublish_at: full.unpublish_at || '',
      // who made it and where it is in the review (the editor's top bar)
      created_by: full.created_by || '', review_state: full.review_state || '', review_note: full.review_note || '', review_by: full.review_by || '', review_at: full.review_at || '',
      layout: 'full', bg_color: '#ffffff', boxed_width: '1100px',
    });
    // With a design, the item's page is the design: its blocks come from the design and stay as they are (read-only)
    let blocks = Array.isArray(full.blocks) ? full.blocks : [];
    let locked = false;
    if (col.has_design) {
      try {
        const d = await (await fetch('api.php?action=get_collection_design&collection=' + encodeURIComponent(col.id))).json();
        blocks = Array.isArray(d.blocks) ? d.blocks : [];
        locked = blocks.length > 0;
      } catch { notify(__("Could not open the item (connection problem)."), 'error'); return; }
    }
    setActivePage({ ...useStore.getState().activePage, __locked: locked, __collectionSlug: col.slug });
    setBlocks(blocks);
    setSelectedBlockId(null);
    setView('editor');
  };
  // Coming back from editing an item: reopen its collection
  useEffect(() => {
    const pend = useStore.getState().pendingItem;   // the Reviews page asked for an item
    const backTo = pend ? pend.collection_id : (activePage && activePage.__item ? activePage.collection_id : null);
    loadCollections().then((list) => {
      if (!list || !backTo) return;
      const c = list.find((x) => x.id === backTo);
      if (!c) return;
      choose(c);
      if (pend) { setPendingItem(null); editItem({ id: pend.id }, null, c); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Bulk actions (also used for a single item): move, archive, unarchive, delete
  const runBulk = async (op, ids, extra = {}) => {
    setBulkBusy(true);
    try {
      const data = await (await fetch('api.php?action=bulk_items', { method: 'POST', body: JSON.stringify({ op, ids, ...extra }) })).json();
      if (!data || !data.success) { notify(data && data.message || __("The action could not be completed."), 'error'); return null; }
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      if (skipped.length) notify((skipped.length === 1 ? __("1 item was skipped: ") : __("{0} items were skipped: ", skipped.length)) + skipped.slice(0, 3).map((x) => `"${x.title || x.id}" (${x.reason})`).join(', ') + (skipped.length > 3 ? '…' : '.'), 'error');
      return data;
    } catch { notify(__("The action could not be completed (connection problem)."), 'error'); return null; }
    finally {
      setBulkBusy(false);
      if (active) loadItems(active.id);
    }
  };
  const toggleArchive = async (item) => {
    const data = await runBulk(Number(item.archived) ? 'unarchive' : 'archive', [item.id]);
    if (data && data.done) setNeedsPublish(__("Archive change saved. Public lists update when you publish the site."));
  };
  const selIds = items.filter((it) => selected.has(it.id)).map((it) => it.id);
  const selItems = items.filter((it) => selected.has(it.id));
  const clearSel = () => { setSelected(new Set()); setLastClicked(null); };
  const toggleSel = (id, e) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e && e.shiftKey && lastClicked) {   // range in the list order
        const a = items.findIndex((x) => x.id === lastClicked); const b = items.findIndex((x) => x.id === id);
        if (a >= 0 && b >= 0) { const on = !prev.has(id); items.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => (on ? next.add(x.id) : next.delete(x.id))); return next; }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastClicked(id);
  };
  const allSelected = items.length > 0 && items.every((it) => selected.has(it.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((it) => it.id)));
  const n = selIds.length;
  const plural = (k) => _n(k, 'item', 'items');
  const bulkArchive = async (archive) => {
    const ids = selItems.filter((it) => !!Number(it.archived) !== archive).map((it) => it.id);
    if (!ids.length) return;
    const data = await runBulk(archive ? 'archive' : 'unarchive', ids);
    if (data && data.done) { notify(archive ? __("{0} archived.", plural(data.done)) : __("{0} restored from the archive.", plural(data.done))); setNeedsPublish(__("Archive change saved. Public lists update when you publish the site.")); }
  };
  const bulkMove = async () => {
    const target = collections.find((c) => c.id === moveTo);
    if (!target || !n) return;
    const data = await runBulk('move', selIds, { collection_id: target.id });
    if (data && data.done) {
      notify(__("{0} moved to \"{1}\".", plural(data.done), target.name));
      setMoveTo('');
      setNeedsPublish(__("Items moved. Their pages move to the new address when you publish the site."));
      loadCollections();
    }
  };
  const bulkDelete = async () => {
    if (!n) return;
    if (!(await confirmDialog({ title: __("Delete {0}?", plural(n)), message: __("The selected items are removed from the collection and their pages are taken offline. This cannot be undone."), confirmLabel: __("Delete {0}", plural(n)), danger: true }))) return;
    const data = await runBulk('delete', selIds);
    if (data && data.done) {
      notify(__("{0} deleted.", plural(data.done)));
      setNeedsPublish(__("Items deleted. Lists, search and the sitemap update when you publish the site."));
      loadCollections();
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      const res = await publishSiteAsync();
      if (res && res.success) { setNeedsPublish(''); notify(res.message || __("Site published.")); } else notify(res && res.message || __("Publish error"), 'error');
    } catch { notify(__("Publish error"), 'error'); }
    setPublishing(false);
  };

  const removeItem = async (item) => {
    if (!(await confirmDialog({ title: __("Delete \"{0}\"?", item.title), message: __("The item is removed from the collection and its page is taken offline. This cannot be undone."), confirmLabel: __("Delete item"), danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_item', { method: 'POST', body: JSON.stringify({ id: item.id }) })).json();
      if (!data || data.success === false) notify(data && data.message || __("Could not delete the item."), 'error');
      else { notify(__("\"{0}\" deleted.", item.title)); setNeedsPublish(__("Item deleted. Lists, search and the sitemap update when you publish the site.")); }
    } catch { notify(__("Could not delete the item (connection problem)."), 'error'); }
    loadItems(active.id); loadCollections();
  };

  const statusBadge = (it) => (Number(it.archived) ? <Badge>{__("Archived")}</Badge> : (
    <>
      <StatusBadge status={it.status} />
      {reviewOf(it).state && <span style={{ marginLeft: 6 }} data-testid="item-review"><Badge tone={it.review_state === 'pending' ? 'draft' : 'neutral'}>{REVIEW_LABEL[it.review_state]}</Badge></span>}
    </>
  ));
  const others = collections.filter((c) => c.id !== active?.id);
  const shownItems = multi && langFilter ? items.filter((it) => langOf(it, langs) === langFilter) : items;
  // A translation of an item: a draft copy in another language, opened in the editor
  const translateItem = async (it, code) => {
    setTranslating(it.id + code);
    try {
      const d = await (await fetch('api.php?action=translate_item', { method: 'POST', body: JSON.stringify({ id: it.id, lang: code }) })).json();
      if (!d || !d.success) { notify(d && d.message || __("Could not create the translation."), 'error'); return; }
      notify(d.message || __("Translation created."));
      loadItems(active.id);
      editItem(d.item);
    } catch { notify(__("Could not create the translation (connection problem)."), 'error'); } finally { setTranslating(''); }
  };
  return (
    <>
      {picking && active && (
        <StarterPickerDialog title={__("New item in \"{0}\"", active.name)} onClose={() => setPicking(false)}
          onPick={(st) => { setPicking(false); editItem(null, st.id === 'blank' ? null : st); }} />
      )}
      <PageHeader icon={Library} title={__("Collections")} description={__("Groups of similar pages, such as a blog, news or a portfolio. Show them on any page with the Collection List block.")}
        actions={userRole === 'admin' && <Button variant="primary" icon={Plus} onClick={() => { setRenaming(null); setNewName(''); }}>{__("New collection")}</Button>} />

      {newName !== null && (
        <form className="ui-card cc-col-form" onSubmit={createCollection}>
          <label htmlFor="cc-new-col" className="ui-label" style={{ margin: 0 }}>{__("Name")}</label>
          <input id="cc-new-col" className="ui-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={__("e.g. Blog, News, Portfolio")} style={{ flex: '1 1 200px' }}
            onKeyDown={(e) => { if (e.key === 'Escape') setNewName(null); }} />
          <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()}>{__("Create")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)}>{__("Cancel")}</Button>
        </form>
      )}

      {renaming && (
        <form className="ui-card cc-col-form" onSubmit={renameCollection} aria-label={__("Rename collection")}
          onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }}>
          <label htmlFor="cc-ren-col" className="ui-label" style={{ margin: 0 }}>{__("Name")}</label>
          <input id="cc-ren-col" className="ui-input" autoFocus value={renaming.name} maxLength={120} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} style={{ flex: '2 1 200px' }} />
          <label htmlFor="cc-ren-slug" className="ui-label" style={{ margin: 0 }}>{__("Address")}</label>
          <span className="cc-col-form__slug">
            <span aria-hidden="true">/</span>
            <input id="cc-ren-slug" className="ui-input" value={renaming.slug} onChange={(e) => setRenaming({ ...renaming, slug: e.target.value })} aria-describedby="cc-ren-hint" />
            <span aria-hidden="true">/</span>
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={!renaming.name.trim()}>{__("Save")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>{__("Cancel")}</Button>
          <p id="cc-ren-hint" className="ui-hint" style={{ flexBasis: '100%', margin: 0 }}>{__("Changing the address moves every item of the collection to a new URL; the old ones forward to the new ones.")}</p>
        </form>
      )}

      {needsPublish && (
        <div role="status" className="ui-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', marginBottom: 14, borderColor: '#38bdf8', fontSize: 13, flexWrap: 'wrap' }}>
          <span>{needsPublish}</span>
          <Button variant="success" size="sm" icon={Globe} onClick={publishNow} disabled={publishing}>{publishing ? __("Publishing…") : __("Publish now")}</Button>
        </div>
      )}

      <div className="cc-collections-grid">
        <nav className="ui-card cc-col-list" aria-label={__("Collections")}>
          {loadState === 'loading' ? (
            <p className="ui-hint" style={{ padding: 6 }} aria-live="polite">{__("Loading collections…")}</p>
          ) : loadState === 'error' ? (
            <div style={{ padding: 6 }}><p className="ui-error" style={{ marginBottom: 8 }}>{__("The collections could not be loaded.")}</p><Button size="sm" onClick={() => { setLoadState('loading'); loadCollections(); }}>{__("Retry")}</Button></div>
          ) : collections.length === 0 ? (
            <p className="ui-hint" style={{ padding: 6 }}>{__("No collections yet.")}</p>
          ) : collections.map(c => (
            <div key={c.id} className="cc-col-row">
              <button type="button" className="ui-nav__item cc-col-row__btn" aria-current={active?.id === c.id ? 'page' : undefined} onClick={() => choose(c)} title={c.name}>
                <Folder size={15} aria-hidden="true" />
                <span className="cc-col-row__name">{c.name}</span>
                <Badge>{c.item_count}</Badge>
              </button>
              {userRole === 'admin' && <>
                <IconButton icon={Pencil} label={__("Rename collection {0}", c.name)} size="sm" onClick={() => startRename(c)} />
                <IconButton icon={Trash2} label={__("Delete collection {0}", c.name)} size="sm" onClick={() => removeCollection(c)} style={{ color: '#f87171' }} />
              </>}
            </div>
          ))}
        </nav>

        <section className="ui-card cc-col-main" aria-label={active ? __("Items of {0}", active.name) : __("Items")}>
          {!active ? (
            <EmptyState icon={Library} title={__("Choose a collection")}>{__("Select a collection")}{userRole === 'admin' ? __(" or create one") : ''} {__("to manage its items.")}</EmptyState>
          ) : (
            <>
              <div className="cc-col-head">
                <div className="cc-col-head__title">
                  <h2 className="ui-card__title" title={active.name}>{active.name}</h2>
                  <div className="ui-cell-muted" title={`/${active.slug}/`}>/{active.slug}/</div>
                </div>
                <span className="ui-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {multi && <Select aria-label={__("Filter items by language")} value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ width: 'auto', maxWidth: 170 }}>
                    <option value="">{__("All languages")}</option>
                    {langs.list.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </Select>}
                  {userRole === 'admin' && <Button size="sm" icon={Pencil} onClick={() => startRename(active)}>{__("Rename")}</Button>}
                  {userRole === 'admin' && <Button size="sm" icon={LayoutTemplate} onClick={() => openDesign(active)} title={active.has_design ? __("Edit the design every item page is built from") : __("Design the item pages of this collection")}>{active.has_design ? __("Design") : __("Make the design")}</Button>}
                  {mayCreate && <Button variant="primary" size="sm" icon={Plus} onClick={() => setPicking(true)}>{__("New Item")}</Button>}
                </span>
              </div>

              <CollectionFields key={active.id} collection={active} collections={collections} canEdit={userRole === 'admin'}
                onSaved={() => loadCollections().then((d) => { if (Array.isArray(d)) { const c = d.find((x) => x.id === active.id); if (c) setActive(c); } })} />
              <CollectionTaxonomies key={`tax-${active.id}`} collection={active} canEdit={userRole === 'admin'} onSaved={() => loadCollections()} />
              <CollectionArchives key={`arc-${active.id}`} collection={active} canEdit={userRole === 'admin'} onSaved={() => loadCollections()} />
              <CollectionAccess key={`acc-${active.id}`} collection={active} canEdit={userRole === 'admin'} onSaved={() => loadCollections().then((d) => { if (Array.isArray(d)) { const c = d.find((x) => x.id === active.id); if (c) setActive(c); } })} />

              {n > 0 && manage && (
                <div className="cc-media-selbar" role="toolbar" aria-label={__("Selected items")} style={{ marginBottom: 12 }}>
                  <CheckSquare size={16} aria-hidden="true" /> <strong>{n} {__("selected")}</strong>
                  <span style={{ flex: 1 }} />
                  {others.length > 0 && <>
                    <Select aria-label={__("Move to collection")} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ width: 'auto', maxWidth: 200 }} disabled={bulkBusy}>
                      <option value="">{__("Move to…")}</option>
                      {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Button size="sm" icon={MoveRight} onClick={bulkMove} disabled={!moveTo || bulkBusy}>{__("Move")}</Button>
                  </>}
                  {selItems.some((it) => !Number(it.archived)) && <Button size="sm" icon={Archive} onClick={() => bulkArchive(true)} disabled={bulkBusy}>{__("Archive")}</Button>}
                  {selItems.some((it) => Number(it.archived)) && <Button size="sm" icon={ArchiveRestore} onClick={() => bulkArchive(false)} disabled={bulkBusy}>{__("Unarchive")}</Button>}
                  <Button size="sm" variant="danger" icon={Trash2} onClick={bulkDelete} disabled={bulkBusy}>{__("Delete")}</Button>
                  <IconButton icon={X} label={__("Clear the selection")} size="sm" onClick={clearSel} />
                </div>
              )}

              {itemsState === 'loading' && items.length === 0 ? (
                <p className="ui-hint" aria-live="polite">{__("Loading items…")}</p>
              ) : itemsState === 'error' ? (
                <div><p className="ui-error" style={{ marginBottom: 8 }}>{__("The items could not be loaded.")}</p><Button size="sm" onClick={() => loadItems(active.id)}>{__("Retry")}</Button></div>
              ) : items.length === 0 ? (
                <EmptyState icon={FileText} title={__("No items yet")} action={mayCreate ? <Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>{__("Create the first item")}</Button> : null} />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table cc-col-table">
                    <thead><tr>
                      <th className="cc-col-check"><input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = n > 0 && !allSelected; }} onChange={toggleAll} aria-label={__("Select all items")} /></th>
                      <th>{__("Title")}</th>{multi && <th>{__("Languages")}</th>}<th className="cc-col-date">{__("Date")}</th><th className="cc-col-status">{__("Status")}</th><th className="ui-cell-actions cc-col-actions">{__("Actions")}</th>
                    </tr></thead>
                    <tbody>
                      {shownItems.map(it => (
                        <tr key={it.id} onDoubleClick={() => editItem(it)} className={selected.has(it.id) ? 'cc-col-row--selected' : undefined}>
                          <td className="cc-col-check"><input type="checkbox" checked={selected.has(it.id)} onChange={() => {}} onClick={(e) => toggleSel(it.id, e)} onDoubleClick={(e) => e.stopPropagation()} aria-label={__("Select {0}", it.title)} /></td>
                          <td className="cc-col-title"><div className="ui-cell-title" title={it.title}>{it.title}</div><div className="ui-cell-muted" title={`/${it.slug}/`}>/{it.slug}/</div><div className="cc-col-status-inline">{statusBadge(it)}</div></td>
                          {multi && (
                            <td data-testid="item-languages">
                              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                <Badge tone="accent" icon={LanguagesIcon}>{langOf(it, langs).toUpperCase()}</Badge>
                                {translationsOf(items, it).map((t) => (
                                  <button key={t.id} type="button" className="ui-btn ui-btn--ghost ui-btn--sm" title={__("Edit the {0} translation: {1}", langName(langOf(t, langs), langs), t.title)} onClick={() => editItem(t)}>{langOf(t, langs).toUpperCase()}</button>
                                ))}
                                {mayCreate && missingLanguages(items, it, langs).map((l) => (
                                  <button key={l.code} type="button" className="ui-btn ui-btn--ghost ui-btn--sm" style={{ opacity: 0.8 }} disabled={translating !== ''} title={__("Translate into {0}", l.name)} aria-label={__("Translate {0} into {1}", it.title, l.name)} onClick={() => translateItem(it, l.code)}>+ {l.code.toUpperCase()}</button>
                                ))}
                              </span>
                            </td>
                          )}
                          <td className="ui-cell-muted cc-col-date">{it.date || '—'}</td>
                          <td className="cc-col-status">{statusBadge(it)}</td>
                          <td className="ui-cell-actions">
                            <span className="ui-row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }}>
                              {manage && <IconButton icon={Number(it.archived) ? ArchiveRestore : Archive} label={Number(it.archived) ? __("Unarchive") : __("Archive")} size="sm" onClick={() => toggleArchive(it)} disabled={bulkBusy} />}
                              <IconButton icon={Pencil} label={__("Edit {0}", it.title)} size="sm" onClick={() => editItem(it)} />
                              {mayDelete(it) && <IconButton icon={Trash2} label={__("Delete {0}", it.title)} size="sm" onClick={() => removeItem(it)} style={{ color: '#f87171' }} />}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
