import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Library, Plus, Trash2, Pencil, FileText, Folder, Archive, ArchiveRestore, Globe, CheckSquare, MoveRight, X, LayoutTemplate } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, Badge, StatusBadge, Select } from '../ui/kit';
import { slugify } from '../utils/slug';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import StarterPickerDialog from './StarterPickerDialog';
import { starterBlocks } from '../editor/starters';
import CollectionFields from './CollectionFields';
import CollectionTaxonomies from './CollectionTaxonomies';

// An item's custom field values as an object (the server keeps them as JSON text)
const parseFieldValues = (raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};

export default function Collections() {
  const { setView, userRole, setActivePage, setBlocks, setSelectedBlockId, publishSiteAsync, activePage } = useStore();
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

  const loadCollections = () => {
    return fetch('api.php?action=get_collections').then(r => r.json()).then(d => {
      if (!Array.isArray(d)) throw new Error((d && d.message) || 'Unexpected answer from the server');
      setCollections(d); setLoadState('ready');
      return d;
    }).catch((e) => { setLoadState('error'); notify('Could not load the collections: ' + e.message, 'error'); return null; });
  };
  const loadItems = (cid) => {
    setItemsState('loading');
    return fetch('api.php?action=get_items&collection=' + encodeURIComponent(cid)).then(r => r.json()).then(d => {
      if (activeRef.current !== cid) return;              // another collection was chosen meanwhile
      if (!Array.isArray(d)) throw new Error((d && d.message) || 'Unexpected answer from the server');
      setItems(d); setItemsState('ready');
      setSelected((prev) => { const ids = new Set(d.map((x) => x.id)); const next = new Set([...prev].filter((id) => ids.has(id))); return next.size === prev.size ? prev : next; });
    }).catch((e) => { if (activeRef.current === cid) { setItemsState('error'); notify('Could not load the items: ' + e.message, 'error'); } });
  };
  // Choosing a collection: the previous items go away at once, then the new ones load
  const choose = (c) => { activeRef.current = c ? c.id : null; setItems([]); setSelected(new Set()); setLastClicked(null); setMoveTo(''); setActive(c); if (c) loadItems(c.id); };
  // Coming back from editing an item: reopen its collection
  useEffect(() => {
    const backTo = activePage && activePage.__item ? activePage.collection_id : null;
    loadCollections().then((list) => { if (list && backTo) { const c = list.find((x) => x.id === backTo); if (c) choose(c); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createCollection = async (e) => {
    if (e) e.preventDefault();
    const name = (newName || '').trim();
    if (!name) return;
    try {
      const res = await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ name }) });
      const data = await res.json();
      if (data.success) { setNewName(null); notify(`Collection "${name}" created.`); loadCollections(); }
      else notify(data.message || 'Could not create the collection.', 'error');
    } catch { notify('Could not create the collection (connection problem).', 'error'); }
  };
  const startRename = (c) => { setNewName(null); setRenaming({ id: c.id, name: c.name, slug: c.slug, oldSlug: c.slug }); };
  const renameCollection = async (e) => {
    if (e) e.preventDefault();
    const r = renaming; if (!r) return;
    const name = r.name.trim();
    const slug = slugify(r.slug) || slugify(name) || r.oldSlug;
    if (!name) return;
    if (slug !== r.oldSlug && !(await confirmDialog({ title: `Change the address to /${slug}/?`, message: `The items of this collection move from /${r.oldSlug}/… to /${slug}/…. The old addresses forward to the new ones after you publish the site.`, confirmLabel: 'Change address' }))) return;
    try {
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: r.id, name, slug }) })).json();
      if (!data || !data.success) { notify((data && data.message) || 'Could not rename the collection.', 'error'); return; }
      setRenaming(null);
      if (active?.id === r.id) setActive((a) => ({ ...a, name: data.name, slug: data.slug }));
      notify(`Collection renamed to "${data.name}".`);
      if (data.moved) setNeedsPublish('The collection address changed. The site uses the new address after you publish it.');
      loadCollections();
    } catch { notify('Could not rename the collection (connection problem).', 'error'); }
  };
  const removeCollection = async (c) => {
    if (!(await confirmDialog({ title: `Delete the collection "${c.name}"?`, message: 'All its items are deleted too. This cannot be undone.', confirmLabel: 'Delete collection', danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_collection', { method: 'POST', body: JSON.stringify({ id: c.id }) })).json();
      if (!data || data.success === false) { notify((data && data.message) || 'Could not delete the collection.', 'error'); return; }
      if (active?.id === c.id) choose(null);
      if (renaming?.id === c.id) setRenaming(null);
      notify(`Collection "${c.name}" deleted.`);
    } catch { notify('Could not delete the collection (connection problem).', 'error'); }
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
    } catch { notify('Could not open the design (connection problem).', 'error'); return; }
    setActivePage({ id: 'design_' + c.id, __design: true, collection_id: c.id, __collectionSlug: c.slug, __fieldDefs: c.fields || [],
      title: 'Design of ' + c.name, slug: c.slug, layout: 'full', bg_color: '#ffffff', boxed_width: '1100px', status: 'draft', seo_title: '', seo_description: '' });
    setBlocks(blocks);
    setSelectedBlockId(null);
    setView('editor');
  };
  const editItem = async (item, starter = null) => {
    let full = { id: item?.id, collection_id: active.id, title: 'New Item', slug: 'new-item', excerpt: '', cover_image: '', date: new Date().toISOString().slice(0, 10), status: 'draft', archived: 0, seo_title: '', seo_description: '', blocks: starter ? starterBlocks(starter) : [] };
    if (item) {
      try {
        const res = await fetch('api.php?action=get_item&id=' + encodeURIComponent(item.id));
        const data = await res.json();
        if (!data || !data.id) { notify('This item no longer exists (deleted elsewhere?).', 'error'); loadItems(active.id); return; }
        let blocks = [];
        try { blocks = JSON.parse(data.content_json || '[]'); } catch { blocks = []; }
        full = { ...data, blocks, field_values: parseFieldValues(data.field_values), terms: parseFieldValues(data.terms_json) };
      } catch { notify('Could not open the item (connection problem).', 'error'); return; }
    }
    // the collection's categories and tags, for the item's settings
    let taxes = [];
    try { taxes = await (await fetch('api.php?action=get_taxonomies&collection=' + encodeURIComponent(active.id))).json(); } catch { taxes = []; }
    if (!Array.isArray(taxes)) taxes = [];
    // open the block editor on the item's content
    setActivePage({
      id: full.id || ('item_' + Date.now()),
      __item: true, collection_id: active.id,
      title: full.title, slug: full.slug, excerpt: full.excerpt, cover_image: full.cover_image,
      date: full.date, status: full.status === 'published' ? 'published' : 'draft',
      archived: Number(full.archived) ? 1 : 0,
      seo_title: full.seo_title || '', seo_description: full.seo_description || '',
      // the custom fields: their definitions (for the inputs and the Item Field block) and this item's values
      __fieldDefs: active.fields || [], field_values: full.field_values || {},
      // categories and tags: the collection's taxonomies, and the terms this item has (taxonomy id => term ids)
      __taxonomies: taxes, terms: full.terms || {},
      layout: 'full', bg_color: '#ffffff', boxed_width: '1100px',
    });
    // With a design, the item's page is the design: its blocks come from the design and stay as they are (read-only)
    let blocks = Array.isArray(full.blocks) ? full.blocks : [];
    let locked = false;
    if (active.has_design) {
      try {
        const d = await (await fetch('api.php?action=get_collection_design&collection=' + encodeURIComponent(active.id))).json();
        blocks = Array.isArray(d.blocks) ? d.blocks : [];
        locked = blocks.length > 0;
      } catch { notify('Could not open the item (connection problem).', 'error'); return; }
    }
    setActivePage({ ...useStore.getState().activePage, __locked: locked, __collectionSlug: active.slug });
    setBlocks(blocks);
    setSelectedBlockId(null);
    setView('editor');
  };
  // Bulk actions (also used for a single item): move, archive, unarchive, delete
  const runBulk = async (op, ids, extra = {}) => {
    setBulkBusy(true);
    try {
      const data = await (await fetch('api.php?action=bulk_items', { method: 'POST', body: JSON.stringify({ op, ids, ...extra }) })).json();
      if (!data || !data.success) { notify((data && data.message) || 'The action could not be completed.', 'error'); return null; }
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      if (skipped.length) notify(`${skipped.length} item${skipped.length === 1 ? ' was' : 's were'} skipped: ` + skipped.slice(0, 3).map((x) => `"${x.title || x.id}" (${x.reason})`).join(', ') + (skipped.length > 3 ? '…' : '.'), 'error');
      return data;
    } catch { notify('The action could not be completed (connection problem).', 'error'); return null; }
    finally {
      setBulkBusy(false);
      if (active) loadItems(active.id);
    }
  };
  const toggleArchive = async (item) => {
    const data = await runBulk(Number(item.archived) ? 'unarchive' : 'archive', [item.id]);
    if (data && data.done) setNeedsPublish('Archive change saved. Public lists update when you publish the site.');
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
  const plural = (k) => `${k} item${k === 1 ? '' : 's'}`;
  const bulkArchive = async (archive) => {
    const ids = selItems.filter((it) => !!Number(it.archived) !== archive).map((it) => it.id);
    if (!ids.length) return;
    const data = await runBulk(archive ? 'archive' : 'unarchive', ids);
    if (data && data.done) { notify(`${plural(data.done)} ${archive ? 'archived' : 'restored from the archive'}.`); setNeedsPublish('Archive change saved. Public lists update when you publish the site.'); }
  };
  const bulkMove = async () => {
    const target = collections.find((c) => c.id === moveTo);
    if (!target || !n) return;
    const data = await runBulk('move', selIds, { collection_id: target.id });
    if (data && data.done) {
      notify(`${plural(data.done)} moved to "${target.name}".`);
      setMoveTo('');
      setNeedsPublish('Items moved. Their pages move to the new address when you publish the site.');
      loadCollections();
    }
  };
  const bulkDelete = async () => {
    if (!n) return;
    if (!(await confirmDialog({ title: `Delete ${plural(n)}?`, message: 'The selected items are removed from the collection and their pages are taken offline. This cannot be undone.', confirmLabel: `Delete ${plural(n)}`, danger: true }))) return;
    const data = await runBulk('delete', selIds);
    if (data && data.done) {
      notify(`${plural(data.done)} deleted.`);
      setNeedsPublish('Items deleted. Lists, search and the sitemap update when you publish the site.');
      loadCollections();
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      const res = await publishSiteAsync();
      if (res && res.success) { setNeedsPublish(''); notify(res.message || 'Site published.'); } else notify((res && res.message) || 'Publish error', 'error');
    } catch { notify('Publish error', 'error'); }
    setPublishing(false);
  };

  const removeItem = async (item) => {
    if (!(await confirmDialog({ title: `Delete "${item.title}"?`, message: 'The item is removed from the collection and its page is taken offline. This cannot be undone.', confirmLabel: 'Delete item', danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_item', { method: 'POST', body: JSON.stringify({ id: item.id }) })).json();
      if (!data || data.success === false) notify((data && data.message) || 'Could not delete the item.', 'error');
      else { notify(`"${item.title}" deleted.`); setNeedsPublish('Item deleted. Lists, search and the sitemap update when you publish the site.'); }
    } catch { notify('Could not delete the item (connection problem).', 'error'); }
    loadItems(active.id); loadCollections();
  };

  const statusBadge = (it) => (Number(it.archived) ? <Badge>Archived</Badge> : <StatusBadge status={it.status} />);
  const others = collections.filter((c) => c.id !== active?.id);
  return (
    <>
      {picking && active && (
        <StarterPickerDialog title={`New item in "${active.name}"`} onClose={() => setPicking(false)}
          onPick={(st) => { setPicking(false); editItem(null, st.id === 'blank' ? null : st); }} />
      )}
      <PageHeader icon={Library} title="Collections" description="Groups of similar pages, such as a blog, news or a portfolio. Show them on any page with the Collection List block."
        actions={userRole === 'admin' && <Button variant="primary" icon={Plus} onClick={() => { setRenaming(null); setNewName(''); }}>New collection</Button>} />

      {newName !== null && (
        <form className="ui-card cc-col-form" onSubmit={createCollection}>
          <label htmlFor="cc-new-col" className="ui-label" style={{ margin: 0 }}>Name</label>
          <input id="cc-new-col" className="ui-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Blog, News, Portfolio" style={{ flex: '1 1 200px' }}
            onKeyDown={(e) => { if (e.key === 'Escape') setNewName(null); }} />
          <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()}>Create</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)}>Cancel</Button>
        </form>
      )}

      {renaming && (
        <form className="ui-card cc-col-form" onSubmit={renameCollection} aria-label="Rename collection"
          onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }}>
          <label htmlFor="cc-ren-col" className="ui-label" style={{ margin: 0 }}>Name</label>
          <input id="cc-ren-col" className="ui-input" autoFocus value={renaming.name} maxLength={120} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} style={{ flex: '2 1 200px' }} />
          <label htmlFor="cc-ren-slug" className="ui-label" style={{ margin: 0 }}>Address</label>
          <span className="cc-col-form__slug">
            <span aria-hidden="true">/</span>
            <input id="cc-ren-slug" className="ui-input" value={renaming.slug} onChange={(e) => setRenaming({ ...renaming, slug: e.target.value })} aria-describedby="cc-ren-hint" />
            <span aria-hidden="true">/</span>
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={!renaming.name.trim()}>Save</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>Cancel</Button>
          <p id="cc-ren-hint" className="ui-hint" style={{ flexBasis: '100%', margin: 0 }}>Changing the address moves every item of the collection to a new URL; the old ones forward to the new ones.</p>
        </form>
      )}

      {needsPublish && (
        <div role="status" className="ui-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', marginBottom: 14, borderColor: '#38bdf8', fontSize: 13, flexWrap: 'wrap' }}>
          <span>{needsPublish}</span>
          <Button variant="success" size="sm" icon={Globe} onClick={publishNow} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish now'}</Button>
        </div>
      )}

      <div className="cc-collections-grid">
        <nav className="ui-card cc-col-list" aria-label="Collections">
          {loadState === 'loading' ? (
            <p className="ui-hint" style={{ padding: 6 }} aria-live="polite">Loading collections…</p>
          ) : loadState === 'error' ? (
            <div style={{ padding: 6 }}><p className="ui-error" style={{ marginBottom: 8 }}>The collections could not be loaded.</p><Button size="sm" onClick={() => { setLoadState('loading'); loadCollections(); }}>Retry</Button></div>
          ) : collections.length === 0 ? (
            <p className="ui-hint" style={{ padding: 6 }}>No collections yet.</p>
          ) : collections.map(c => (
            <div key={c.id} className="cc-col-row">
              <button type="button" className="ui-nav__item cc-col-row__btn" aria-current={active?.id === c.id ? 'page' : undefined} onClick={() => choose(c)} title={c.name}>
                <Folder size={15} aria-hidden="true" />
                <span className="cc-col-row__name">{c.name}</span>
                <Badge>{c.item_count}</Badge>
              </button>
              {userRole === 'admin' && <>
                <IconButton icon={Pencil} label={`Rename collection ${c.name}`} size="sm" onClick={() => startRename(c)} />
                <IconButton icon={Trash2} label={`Delete collection ${c.name}`} size="sm" onClick={() => removeCollection(c)} style={{ color: '#f87171' }} />
              </>}
            </div>
          ))}
        </nav>

        <section className="ui-card cc-col-main" aria-label={active ? `Items of ${active.name}` : 'Items'}>
          {!active ? (
            <EmptyState icon={Library} title="Choose a collection">Select a collection{userRole === 'admin' ? ' or create one' : ''} to manage its items.</EmptyState>
          ) : (
            <>
              <div className="cc-col-head">
                <div className="cc-col-head__title">
                  <h2 className="ui-card__title" title={active.name}>{active.name}</h2>
                  <div className="ui-cell-muted" title={`/${active.slug}/`}>/{active.slug}/</div>
                </div>
                <span className="ui-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {userRole === 'admin' && <Button size="sm" icon={Pencil} onClick={() => startRename(active)}>Rename</Button>}
                  {userRole === 'admin' && <Button size="sm" icon={LayoutTemplate} onClick={() => openDesign(active)} title={active.has_design ? 'Edit the design every item page is built from' : 'Design the item pages of this collection'}>{active.has_design ? 'Design' : 'Make the design'}</Button>}
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => setPicking(true)}>New Item</Button>
                </span>
              </div>

              <CollectionFields key={active.id} collection={active} collections={collections} canEdit={userRole === 'admin'}
                onSaved={() => loadCollections().then((d) => { if (Array.isArray(d)) { const c = d.find((x) => x.id === active.id); if (c) setActive(c); } })} />
              <CollectionTaxonomies key={`tax-${active.id}`} collection={active} canEdit={userRole === 'admin'} onSaved={() => loadCollections()} />

              {n > 0 && (
                <div className="cc-media-selbar" role="toolbar" aria-label="Selected items" style={{ marginBottom: 12 }}>
                  <CheckSquare size={16} aria-hidden="true" /> <strong>{n} selected</strong>
                  <span style={{ flex: 1 }} />
                  {others.length > 0 && <>
                    <Select aria-label="Move to collection" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ width: 'auto', maxWidth: 200 }} disabled={bulkBusy}>
                      <option value="">Move to…</option>
                      {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Button size="sm" icon={MoveRight} onClick={bulkMove} disabled={!moveTo || bulkBusy}>Move</Button>
                  </>}
                  {selItems.some((it) => !Number(it.archived)) && <Button size="sm" icon={Archive} onClick={() => bulkArchive(true)} disabled={bulkBusy}>Archive</Button>}
                  {selItems.some((it) => Number(it.archived)) && <Button size="sm" icon={ArchiveRestore} onClick={() => bulkArchive(false)} disabled={bulkBusy}>Unarchive</Button>}
                  <Button size="sm" variant="danger" icon={Trash2} onClick={bulkDelete} disabled={bulkBusy}>Delete</Button>
                  <IconButton icon={X} label="Clear the selection" size="sm" onClick={clearSel} />
                </div>
              )}

              {itemsState === 'loading' && items.length === 0 ? (
                <p className="ui-hint" aria-live="polite">Loading items…</p>
              ) : itemsState === 'error' ? (
                <div><p className="ui-error" style={{ marginBottom: 8 }}>The items could not be loaded.</p><Button size="sm" onClick={() => loadItems(active.id)}>Retry</Button></div>
              ) : items.length === 0 ? (
                <EmptyState icon={FileText} title="No items yet" action={<Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>Create the first item</Button>} />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table cc-col-table">
                    <thead><tr>
                      <th className="cc-col-check"><input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = n > 0 && !allSelected; }} onChange={toggleAll} aria-label="Select all items" /></th>
                      <th>Title</th><th className="cc-col-date">Date</th><th className="cc-col-status">Status</th><th className="ui-cell-actions cc-col-actions">Actions</th>
                    </tr></thead>
                    <tbody>
                      {items.map(it => (
                        <tr key={it.id} onDoubleClick={() => editItem(it)} className={selected.has(it.id) ? 'cc-col-row--selected' : undefined}>
                          <td className="cc-col-check"><input type="checkbox" checked={selected.has(it.id)} onChange={() => {}} onClick={(e) => toggleSel(it.id, e)} onDoubleClick={(e) => e.stopPropagation()} aria-label={`Select ${it.title}`} /></td>
                          <td className="cc-col-title"><div className="ui-cell-title" title={it.title}>{it.title}</div><div className="ui-cell-muted" title={`/${it.slug}/`}>/{it.slug}/</div><div className="cc-col-status-inline">{statusBadge(it)}</div></td>
                          <td className="ui-cell-muted cc-col-date">{it.date || '—'}</td>
                          <td className="cc-col-status">{statusBadge(it)}</td>
                          <td className="ui-cell-actions">
                            <span className="ui-row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }}>
                              <IconButton icon={Number(it.archived) ? ArchiveRestore : Archive} label={Number(it.archived) ? 'Unarchive' : 'Archive'} size="sm" onClick={() => toggleArchive(it)} disabled={bulkBusy} />
                              <IconButton icon={Pencil} label={`Edit ${it.title}`} size="sm" onClick={() => editItem(it)} />
                              <IconButton icon={Trash2} label={`Delete ${it.title}`} size="sm" onClick={() => removeItem(it)} style={{ color: '#f87171' }} />
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
