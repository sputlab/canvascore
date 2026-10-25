import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ChevronLeft, Sliders, Palette, Shield, Save, Trash2, Crown, FileEdit, MousePointerClick, ArrowUp, ArrowDown, CopyPlus, Clipboard } from 'lucide-react';
import MediaPickerModal from './MediaPickerModal';
import { IconButton, Button } from '../ui/kit';
import { blockOnDevice, deviceStylePatch } from '../editor/deviceStyles';
import { notify } from '../ui/notify';
import { blockInfo, CONTAINER_TYPES } from '../editor/blockCatalog';
import { findLiveBlock } from './panel/helpers';
import { contentPanelFor, renderContentPanel } from './panel/blocks';
import StyleTab from './panel/StyleTab';
import AdvancedTab from './panel/AdvancedTab';
import PageSettings from './panel/PageSettings';
import { confirmDialog, promptDialog } from '../ui/dialog';

// Editor right panel. With no block selected it shows the page settings; with a block selected,
// three tabs: Content (the block's own panel, src/components/panel/blocks/), Style and Advanced
// (shared by every block). The first section of each tab starts open.
const TABS = [['content', 'Content', Sliders], ['style', 'Style', Palette], ['advanced', 'Advanced', Shield]];

export default function PropertyPanel() {
  const { blocks, selectedBlockId, setSelectedBlockId, updateBlock, removeBlock, activePage, updateActivePage, pages, enterMasterEditMode, saveAsMaster, userRole, duplicateBlock, copyBlock, moveBlockBy, viewport } = useStore();

  // Blocks from templates, imports or older pages may have no "content"/"styles" (e.g. SECTION/CONTAINER):
  // the panel reads them directly, so it always gets objects (a crash here blanks the whole editor).
  const foundBlock = findLiveBlock(blocks, selectedBlockId);
  const selectedBlock = foundBlock && (!foundBlock.content || !foundBlock.styles)
    ? { ...foundBlock, content: foundBlock.content || {}, styles: foundBlock.styles || {} }
    : foundBlock;

  const [activeTab, setActiveTab] = useState('content');
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [collections, setCollections] = useState([]);
  const coverInputRef = useRef(null);
  useEffect(() => { fetch('api.php?action=get_collections').then(r => r.json()).then(d => { if (Array.isArray(d)) setCollections(d); }).catch(() => {}); }, []);

  // one implementation, shared with the canvas menu (store: saveBlockAsTemplate)
  const handleSaveTemplate = () => useStore.getState().saveBlockAsTemplate(selectedBlock.id);
  const handleCreateMaster = async () => {
    const name = await promptDialog({ title: 'Make a global master', message: 'The block becomes shared: edit it once and it changes on every page that uses it.', label: 'Master name', placeholder: 'e.g. Main Header', confirmLabel: 'Create master' });
    if (!name || name.trim() === '') return;
    await saveAsMaster(selectedBlock.id, name);
  };
  const handleDeleteBlock = async () => {
    const info = blockInfo(selectedBlock.type);
    const inside = selectedBlock.children && selectedBlock.children.length;
    if (await confirmDialog({ title: `Delete this ${info.label} block?`, message: inside ? 'Everything inside it is deleted too. You can undo it with Ctrl+Z.' : 'You can undo it with Ctrl+Z.', confirmLabel: 'Delete block', danger: true })) removeBlock(selectedBlock.id);
  };

  // Content is ALWAYS read from the store (not from the last render's copy): two edits in quick succession
  // must not overwrite each other.
  const liveContent = () => {
    const cur = selectedBlock ? findLiveBlock(useStore.getState().blocks, selectedBlock.id) : null;
    return (cur || selectedBlock || {}).content || {};
  };
  const handleContentChange = (property, value) => updateBlock(selectedBlock.id, { content: { ...liveContent(), [property]: value } });
  const patchContent = (patch) => updateBlock(selectedBlock.id, { content: { ...liveContent(), ...patch } });
  // Styles likewise come from the store, so quick successive edits (or two in one handler) all stick.
  const liveStyles = () => {
    const cur = selectedBlock ? findLiveBlock(useStore.getState().blocks, selectedBlock.id) : null;
    return (cur || selectedBlock || {}).styles || {};
  };
  // Style changes go to the device being previewed (desktop = the block's own styles, tablet/phone = overrides)
  const liveBlock = () => (selectedBlock ? findLiveBlock(useStore.getState().blocks, selectedBlock.id) : null) || selectedBlock || {};
  const patchStyles = (patch) => {
    const b = liveBlock();
    updateBlock(selectedBlock.id, deviceStylePatch({ ...b, styles: liveStyles() }, useStore.getState().viewport, patch));
  };
  const handleStyleChange = (property, value) => patchStyles({ [property]: value });

  // Helpers for list blocks: immutable updates (no mutation of the store state)
  const lstOf = (key) => { const v = liveContent()[key]; return Array.isArray(v) ? v : []; };
  const lstPatch = (key, idx, patch) => handleContentChange(key, lstOf(key).map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const lstRemove = (key, idx) => handleContentChange(key, lstOf(key).filter((_, i) => i !== idx));
  const lstAdd = (key, item) => handleContentChange(key, [...lstOf(key), item]);
  const lstMove = (key, idx, dir) => {
    const l = [...lstOf(key)]; const j = idx + dir;
    if (j < 0 || j >= l.length) return;
    [l[idx], l[j]] = [l[j], l[idx]];
    handleContentChange(key, l);
  };

  const renderMediaPicker = () => {
    if (!mediaPickerTarget) return null;
    // The image's alt text from the library fills the block's alt field when that is still empty
    return <MediaPickerModal kind={(typeof mediaPickerTarget === 'object' && mediaPickerTarget.kind) || 'image'} onClose={() => setMediaPickerTarget(null)} onSelect={(url, alt = '', focal = '') => {
      const t = mediaPickerTarget;
      const withAlt = (item, key = 'alt') => (alt && !(item && item[key]) ? { [key]: alt } : {});
      const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      if (typeof t === 'string') {
        if (t === 'src') patchContent({ src: url, ...withAlt(liveContent()) });
        else handleContentChange(t, url);
      } else if (t.type === 'grid_item') {
        handleContentChange('items', lstOf('items').map((it, i) => (i === t.index ? it + `<img src="${esc(url)}" alt="${esc(alt)}" style="max-width:100%; border-radius:8px; display:block; margin: 10px 0;" />` : it)));
      } else if (t.type === 'slider_img') {
        lstPatch('images', t.index, { src: url, ...withAlt(lstOf('images')[t.index]) });
      } else if (t.type === 'gallery_img') {
        lstPatch('images', t.index, { src: url, ...withAlt(lstOf('images')[t.index]) });
      } else if (t.type === 'gallery_add') {
        lstAdd('images', { src: url, alt, caption: '' });
      } else if (t.type === 'logo_img') {
        lstPatch('logos', t.index, { src: url, ...withAlt(lstOf('logos')[t.index]) });
      } else if (t.type === 'logo_add') {
        lstAdd('logos', { src: url, alt, href: '' });
      } else if (t.type === 'into') {
        // add: a new item of the list with the image (and its alt text); obj: into an object of the content
        if (t.add) lstAdd(t.list, { ...(t.item || {}), [t.key]: url, ...(t.alt ? { [t.alt]: alt } : {}) });
        else if (t.obj) { const cur = liveContent()[t.obj] || {}; handleContentChange(t.obj, { ...cur, [t.key]: url, ...(t.alt ? withAlt(cur, t.alt) : {}) }); }
        else if (t.list) lstPatch(t.list, t.index, { [t.key]: url, ...(t.alt ? withAlt(lstOf(t.list)[t.index], t.alt) : {}) });
        else patchContent({ [t.key]: url, ...(t.alt ? withAlt(liveContent(), t.alt) : {}), ...(t.focal && focal ? { [t.focal]: focal } : {}) });   // a focal point set in the library fills the block's Focus
      } else if (t.type === 'team_photo') {
        lstPatch('members', t.index, { photo: url });
      } else if (t.type === 'ba_before' || t.type === 'ba_after') {
        const k = t.type === 'ba_before' ? 'before' : 'after';
        const cur = liveContent()[k] || {};
        handleContentChange(k, { ...cur, src: url, ...withAlt(cur) });
      }
      setMediaPickerTarget(null);
    }} />;
  };

  if (!selectedBlock) {
    return <PageSettings ctx={{ activePage, updateActivePage, pages, collections, coverInputRef, blocks }} />;
  }

  const info = blockInfo(selectedBlock.type);
  const head = (color, actions) => (
    <div className="cc-pp-head">
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <IconButton icon={ChevronLeft} label="Back to page settings (Esc)" size="sm" onClick={() => setSelectedBlockId(null)} />
        <info.icon size={15} color={color || info.color} aria-hidden="true" />
        <strong className="cc-pp-title">{info.label}</strong>
      </span>
      <span className="ui-row" style={{ gap: 4, flexWrap: 'nowrap' }}>{actions}</span>
    </div>
  );
  // Quick actions on the selected block (same as the keyboard shortcuts)
  const sib = (function where(list) { for (let i = 0; i < (list || []).length; i++) { if (list[i].id === selectedBlock.id) return { i, n: list.length }; const r = where(list[i].children); if (r) return r; } return null; })(blocks) || { i: 0, n: 1 };
  const quick = (
    <div className="cc-pp-quick" role="toolbar" aria-label="Block actions">
      <IconButton icon={ArrowUp} label="Move up (Alt+↑)" size="sm" disabled={sib.i === 0} onClick={() => moveBlockBy(selectedBlock.id, -1)} />
      <IconButton icon={ArrowDown} label="Move down (Alt+↓)" size="sm" disabled={sib.i >= sib.n - 1} onClick={() => moveBlockBy(selectedBlock.id, 1)} />
      <span className="cc-ed-sep" style={{ height: 18 }} />
      <IconButton icon={CopyPlus} label="Duplicate (Ctrl/Cmd+D)" size="sm" onClick={() => duplicateBlock(selectedBlock.id)} />
      <IconButton icon={Clipboard} label="Copy, to paste on any page (Ctrl/Cmd+C)" size="sm" onClick={() => { if (copyBlock(selectedBlock.id)) notify(`${info.label} copied. Paste it on any page with Ctrl/Cmd+V or from the Add tab.`); }} />
    </div>
  );

  if (selectedBlock.type === 'MASTER') {
    return (
      <div className="cc-pp">
        {head('#fcd34d', <IconButton icon={Trash2} label="Remove this master from the page" size="sm" onClick={handleDeleteBlock} style={{ color: '#f87171' }} />)}
        {quick}
        <div style={{ padding: 14 }}>
          <div className="ui-card" style={{ textAlign: 'center' }}>
            <Crown size={30} color="#fcd34d" style={{ marginBottom: 8 }} aria-hidden="true" />
            <h3 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 15 }}>{selectedBlock.content?.name || 'Global Component'}</h3>
            <p className="ui-hint" style={{ fontSize: 12.5 }}>This is a global component. Changes made to it appear on every page that uses it.</p>
            <Button variant="gold" block icon={FileEdit} onClick={() => enterMasterEditMode(selectedBlock.content.masterId)} style={{ marginTop: 14 }}>Edit Global Master</Button>
          </div>
        </div>
      </div>
    );
  }

  // Layout blocks have no Content tab; the tab in use falls back to Style for them
  const hasContentPanel = !!contentPanelFor(selectedBlock.type);
  const tabs = TABS.filter(([id]) => id !== 'content' || hasContentPanel); // blocks without a content panel (Section, Container) open on Style
  const tab = tabs.some(([id]) => id === activeTab) ? activeTab : tabs[0][0];
  const c = selectedBlock.content || {};
  // The panel's fields show the block's values on the previewed device
  const shownBlock = blockOnDevice(selectedBlock, viewport);
  const ctx = {
    selectedBlock: shownBlock, device: viewport, c, set: handleContentChange, handleContentChange, patchContent, handleStyleChange, patchStyles, updateBlock, setMediaPickerTarget,
    pick: (type, index) => () => setMediaPickerTarget(index === undefined ? { type } : { type, index }),
    // Generic picker target for new blocks: the image goes into content[key], into item `index` of the list
    // content[list], into the object content[obj], or (add) into a new item of the list; `alt` names the alt-text
    // field that the library's alt text fills while it is empty.
    pickTo: (target) => () => setMediaPickerTarget({ type: 'into', ...target }),
    ARS: [['16 / 9', '16:9'], ['4 / 3', '4:3'], ['3 / 2', '3:2'], ['1 / 1', '1:1'], ['21 / 9', '21:9']],
    pages, collections, lstOf, lstPatch, lstRemove, lstAdd, lstMove, userRole,
    // the custom fields of the collection item being edited (Item Field block)
    fieldDefs: activePage?.__fieldDefs || [],
    // the collection of the item being edited (a Related block needs a reference to it)
    itemCollectionId: activePage?.__item ? activePage.collection_id : null,
    // the categories and tags of the collection of the item being edited (Categories & tags block)
    itemTaxonomies: activePage?.__item ? (activePage.__taxonomies || []) : [],
  };

  return (
    <div className="cc-pp">
      {renderMediaPicker()}
      {head(null, <>
        <IconButton icon={Save} label="Save as template (a reusable copy)" size="sm" onClick={handleSaveTemplate} style={{ color: '#c4b5fd' }} />
        <IconButton icon={Crown} label="Make it a global master: edit once, update everywhere" size="sm" onClick={handleCreateMaster} style={{ color: '#fbbf24' }} />
        <IconButton icon={Trash2} label="Delete block" size="sm" onClick={handleDeleteBlock} style={{ color: '#f87171' }} />
      </>)}
      {quick}

      <div className="ui-tabs" role="tablist" aria-label="Block settings" style={{ background: '#0f172a' }}>
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" className="ui-tab" aria-selected={tab === id} onClick={() => setActiveTab(id)}>
            <Icon size={14} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div style={{ padding: 12 }} role="tabpanel">
        {tab === 'content' && (hasContentPanel
          ? renderContentPanel(selectedBlock.type, ctx)
          : (
            <div className="ui-hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8 }}>
              <MousePointerClick size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
              {CONTAINER_TYPES.includes(selectedBlock.type) ? 'Add blocks inside this container from the Add panel; set its look in Style.' : 'Edit this block directly on the canvas; set its look in Style.'}
            </div>
          ))}
        {tab === 'style' && <StyleTab ctx={ctx} />}
        {tab === 'advanced' && <AdvancedTab ctx={ctx} />}
      </div>
    </div>
  );
}
