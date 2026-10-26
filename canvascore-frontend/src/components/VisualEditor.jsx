import React, { useState, useEffect, useRef } from 'react';
import { useStore, readBlockClipboard } from '../store/useStore';
import PropertyPanel from './PropertyPanel';
import BlockContextMenu from './BlockContextMenu';
import Canvas from './Canvas';
import LayerNavigator from './LayerNavigator';
import EditorDraftStatus from './EditorDraftStatus';
import { useEditorDraft } from '../session/hooks';
import { clearDraft } from '../session/drafts';
import { editorScope, editorSnapshot } from '../session/draftTrackers';
import AddBlocksPanel from './AddBlocksPanel';
import RevisionHistory from './RevisionHistory';
import {
  ChevronLeft, Monitor, Tablet, Smartphone, Undo2, Redo2, Save, Globe, Layers, PlusCircle, Crown, AlertCircle,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, History, ExternalLink, ClipboardCheck,
} from 'lucide-react';
import { Button, IconButton, Segmented, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { CONTAINER_TYPES } from '../editor/blockCatalog';
import { confirmDialog, promptDialog } from '../ui/dialog';
import ReviewBar from './ReviewBar';
import { canPublishDirect, canReview, reviewOf } from '../session/permissions';
import { livePageUrl } from '../editor/liveUrl';

// Remembered per browser: which side panels are open
const readPanels = () => { try { return JSON.parse(localStorage.getItem('cc_editor_panels') || '{}'); } catch { return {}; } };
const writePanels = (v) => { try { localStorage.setItem('cc_editor_panels', JSON.stringify(v)); } catch { /* private mode */ } };

export default function VisualEditor() {
  const {
    activePage, setView, blocks, addBlock, updateActivePage,
    viewport, setViewport, undo, redo, pastBlocks, futureBlocks,
    fetchTemplates, publishSiteAsync, selectedBlockId, setSelectedBlockId,
    fetchMasters, isEditingMaster, exitMasterEditMode, setPages, userRole, username,
  } = useStore();

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveInFlight = useRef(null); // one save at a time: a second click/Ctrl+S waits for the running one
  const saveDraftRef = useRef(null); // Ctrl+S handler → the current saveDraft
  // On narrow screens the panels cover the canvas, so they start closed there
  const [panels, setPanels] = useState(() => ((window.innerWidth || 1280) < 860 ? { left: false, right: false } : { left: true, right: true, ...readPanels() }));
  const togglePanel = (side) => setPanels((p) => { const n = { ...p, [side]: !p[side] }; writePanels(n); return n; });
  const [leftTab, setLeftTab] = useState('add');

  // Local backup of unsaved work + "modified" state (see src/session/)
  const draft = useEditorDraft();
  const editorRestored = useStore((s) => s.editorRestored);
  const editorDraftFound = useStore((s) => s.editorDraftFound);

  useEffect(() => {
    fetchTemplates();
    fetchMasters();
    const handleKeyDown = (e) => {
      if (useStore.getState().sessionExpired) return;   // with the login on top, the editor "behind" must not be modified
      if (document.querySelector('.ui-dialog')) return;  // a dialog is open: its keys (Esc, Enter, Tab) are its own
      const t = e.target;
      const typing = !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        // Save draft: a text being edited is committed first (it saves when it loses focus)
        e.preventDefault();
        if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
        setTimeout(() => saveDraftRef.current && saveDraftRef.current(), 0);
        return;
      }
      if (typing) return; // typing: the field has its own undo
      const k = (e.key || '').toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.ctrlKey && !e.metaKey && k === 'y') {
        e.preventDefault(); redo();
      }
      // Block shortcuts (not while typing): duplicate, copy/paste blocks, delete, move
      const st = useStore.getState();
      const sel = st.selectedBlockId;
      const mod = e.metaKey || e.ctrlKey;
      const textSelected = () => { const g = window.getSelection && window.getSelection(); return !!(g && !g.isCollapsed && String(g).trim()); };
      if (st.isEditingMaster && !sel) return;
      if (mod && !e.shiftKey && !e.altKey && k === 'd' && sel) { e.preventDefault(); st.duplicateBlock(sel); return; }
      if (mod && !e.shiftKey && !e.altKey && k === 'c' && sel && !textSelected()) {
        e.preventDefault();
        if (st.copyBlock(sel)) notify('Block copied. Paste it here or on another page with Ctrl/Cmd+V.');
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && k === 'v' && readBlockClipboard()) { e.preventDefault(); st.pasteBlock(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && sel) {
        e.preventDefault(); st.removeBlock(sel); notify('Block deleted. Press Ctrl/Cmd+Z to bring it back.', 'info'); return;
      }
      if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sel) { e.preventDefault(); st.moveBlockBy(sel, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (e.key === 'Escape' && useStore.getState().selectedBlockId) setSelectedBlockId(null);
    };
    // Capture phase: the in-place text editor stops keydown propagation, Ctrl+S must still get here
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [undo, redo, fetchTemplates, fetchMasters, setSelectedBlockId]);

  const savePageRaw = async (publish = false) => {
    if (isEditingMaster) return null;
    // Always the LATEST content (not this render's copy): edits made just before the click are included
    const { activePage, blocks, languages: langs } = useStore.getState();
    // Global header/footer: saved to site_parts
    if (activePage.__part) {
      try {
        const res = await fetch('api.php?action=save_part', { method: 'POST', body: JSON.stringify({ name: activePage.__part, blocks, ...(activePage.lang ? { lang: activePage.lang } : {}) }) });
        return await res.json();
      } catch { notify('Error saving the part.', 'error'); return null; }
    }
    // The design of a collection (its blocks are every item page's layout): saved, and shown by publishing the site
    if (activePage.__design) {
      try {
        const res = await fetch('api.php?action=save_collection_design', { method: 'POST', body: JSON.stringify({ collection_id: activePage.collection_id, blocks }) });
        const data = await res.json();
        if (data.success) notify('Design saved. Publish the site to update the item pages.');
        else notify(data.message || 'Could not save the design.', 'error');
        return data;
      } catch { notify('Error saving the design.', 'error'); return null; }
    }
    // A popup: saved to its own table; "published" means it goes on the pages at the next publish of the site
    if (activePage.__popup) {
      try {
        const res = await fetch('api.php?action=save_popup', { method: 'POST', body: JSON.stringify({ id: activePage.id, name: activePage.title, status: publish ? 'published' : (activePage.status || 'draft'), blocks, settings: activePage.settings || {} }) });
        const data = await res.json();
        if (data.success) updateActivePage({ id: data.id, status: data.status });
        return data;
      } catch { notify('Error saving the popup.', 'error'); return null; }
    }
    // Collection item: saved to collection_items
    if (activePage.__item) {
      try {
        const res = await fetch('api.php?action=save_item', { method: 'POST', body: JSON.stringify({
          id: activePage.id, collection_id: activePage.collection_id,
          title: activePage.title, slug: activePage.slug, excerpt: activePage.excerpt,
          cover_image: activePage.cover_image, date: activePage.date, archived: activePage.archived ? 1 : 0,
          status: publish ? 'published' : (activePage.status || 'draft'),
          seo_title: activePage.seo_title, seo_description: activePage.seo_description,
          // an item built from the design keeps its own blocks as they are (null: not sent)
          blocks: activePage.__locked ? null : blocks,
          field_values: activePage.field_values || {},
          terms: activePage.terms || {},
          ...(langs && langs.enabled ? { lang: activePage.lang || '' } : {})
        }) });
        const data = await res.json();
        if (data.success && publish) updateActivePage({ status: 'published', review_state: '', review_note: '', review_by: '', review_at: '' });
        return data;
      } catch { notify('Error saving the item.', 'error'); return null; }
    }
    const payload = {
      id: activePage.id, title: activePage.title, slug: activePage.slug,
      seo_title: activePage.seo_title, seo_description: activePage.seo_description, seo_image: activePage.seo_image,
      layout: activePage.layout, boxed_width: activePage.boxed_width, bg_color: activePage.bg_color, blocks: blocks,
      is_home: Number(activePage.is_home) ? 1 : 0,
      noindex: Number(activePage.noindex) ? 1 : 0,
      ...(langs && langs.enabled ? { lang: activePage.lang || '' } : {}),
      publish: publish
    };
    try {
      const res = await fetch('api.php?action=save_page', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();

      // If we just created a hidden draft copy (because it was published and we saved as draft)
      if (!publish && data.new_id && data.new_id !== activePage.id) {
         updateActivePage({ id: data.new_id, is_draft_copy: 1, parent_id: activePage.id });
      }
      // If we published a draft copy, the ID goes back to being the parent's
      if (publish && data.new_id) {
         updateActivePage({ id: data.new_id, is_draft_copy: 0, status: 'published', review_state: '', review_note: '', review_by: '', review_at: '' });
      }
      return data;
    } catch { notify('Error saving the page.', 'error'); return null; }
  };

  // After EVERY successful save the current state becomes the "saved" one: the local backup is no longer needed.
  // Only what was SENT counts as saved (edits made while the request runs stay unsaved and backed up).
  const savePage = async (publish = false) => {
    if (saveInFlight.current) await saveInFlight.current.catch(() => {});
    const run = (async () => {
      const st = useStore.getState();
      const sent = editorSnapshot(st).page;
      const sentScope = editorScope(st);
      const data = await savePageRaw(publish);
      if (data && data.success) draft.markSaved(sent, sentScope);
      return data;
    })();
    saveInFlight.current = run;
    setIsSaving(true);
    try { return await run; } finally {
      if (saveInFlight.current === run) { saveInFlight.current = null; setIsSaving(false); }
    }
  };

  const publishSite = async () => {
    if (isEditingMaster) return;
    setIsPublishing(true);

    try {
      const saved = await savePage(true);
      if (!saved || !saved.success) {
        // a required field of a collection item is empty: say which one (the item stays a draft)
        if (saved && saved.code === 'required') { notify(saved.message, 'error'); setIsPublishing(false); return; }
        notify('Not published: saving the page failed' + (saved && saved.message ? ' (' + saved.message + ')' : '') + '.\nYour changes are still here and backed up on this device.', 'error');
        setIsPublishing(false);
        return;
      }
      const res = await publishSiteAsync();
      if (res && res.success) notify(`Published. ${res.message || ''}`.trim());
      else notify(`Error: ${res?.message || 'Server unreachable'}`, 'error');

      // Update the global state to reflect the changes in the dashboard
      fetch('api.php?action=get_pages').then(r => r.json()).then(d => setPages(d));
    } catch {
      notify('Error publishing.', 'error');
    }

    setIsPublishing(false);
  };

  const discardChanges = async () => {
    if (!(await confirmDialog({ title: 'Discard the draft?', message: 'All draft changes are thrown away and the page goes back to the version that is online.', confirmLabel: 'Discard draft', danger: true }))) return;
    try {
      await fetch('api.php?action=discard_draft', { method: 'POST', body: JSON.stringify({ id: activePage.parent_id }) });
      fetch('api.php?action=get_pages').then(r => r.json()).then(d => setPages(d));
      draft.discard();
      setView('manager');
    } catch { notify('Error discarding the changes.', 'error'); }
  };

  const getValidParentId = () => {
    if (!selectedBlockId) return null;
    const findNode = (nodes, id) => {
      for (let n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
          const found = findNode(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    const block = findNode(blocks, selectedBlockId);
    if (block && CONTAINER_TYPES.includes(block.type)) return block.id;
    return null;
  };

  const handleAddBlock = (type) => {
    const targetId = getValidParentId();
    addBlock(type, targetId);
  };

  const saveDraft = () => savePage(false).then((res) => {
    if (!res) return;
    if (res.success) notify(activePage?.__part ? 'Saved.' : 'Draft saved.');
    else notify('Save FAILED: ' + (res.message || 'unexpected response') + '\nYour changes are still here and backed up on this device.', 'error');
  });
  useEffect(() => { saveDraftRef.current = isEditingMaster ? null : saveDraft; });

  // Review: an author submits their work (it is saved first, so the reviewer sees what was written); a reviewer approves by publishing
  const real = !activePage?.__part && !activePage?.__design && !activePage?.__popup && !isEditingMaster;
  const review = reviewOf(activePage);
  const pendingReview = review.state === 'pending';
  const directPublish = canPublishDirect(userRole);
  const approving = !directPublish && canReview(userRole) && pendingReview;     // a reviewer: Publish = approve, only for what was submitted
  const showPublish = directPublish || (real && approving);
  const locked = userRole === 'author' && pendingReview;                         // it waits for a reviewer: no changes meanwhile
  const liveUnchanged = activePage?.__item ? activePage.status === 'published' : (activePage?.status === 'published' && Number(activePage?.is_draft_copy) !== 1);
  const showSubmit = real && userRole !== 'reviewer' && !directPublish && !pendingReview && !liveUnchanged;
  const submitForReview = async () => {
    const note = await promptDialog({ title: 'Submit for review', message: 'A reviewer is told this is ready. You cannot change it while it waits (you can withdraw it).', label: 'A note for the reviewer (optional)', required: false, confirmLabel: 'Submit' });
    if (note === null) return;
    const saved = await savePage(false);
    if (!saved || !saved.success) { notify('Not submitted: saving failed' + (saved && saved.message ? ' (' + saved.message + ')' : '') + '.', 'error'); return; }
    const cur = useStore.getState().activePage;
    try {
      const d = await (await fetch('api.php?action=review_submit', { method: 'POST', body: JSON.stringify({ kind: cur.__item ? 'item' : 'page', id: cur.id, note }) })).json();
      if (d.success) { notify('Submitted for review.'); updateActivePage({ review_state: 'pending', review_note: note, review_by: username, review_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }); }
      else notify(d.message || 'Not submitted.', 'error');
    } catch { notify('Not submitted (connection problem).', 'error'); }
  };

  const leave = async () => {
    if (useStore.getState().editorDirty && !(await confirmDialog({ title: 'Leave with unsaved changes?', message: 'They stay backed up on this device and will be offered next time you open the page, but they are NOT saved to the site.', confirmLabel: 'Leave anyway', cancelLabel: 'Stay' }))) return;
    setSelectedBlockId(null);
    setView(activePage?.__item || activePage?.__design ? 'collections' : activePage?.__part ? 'settings' : activePage?.__popup ? 'popups' : 'manager');
  };

  const parentId = getValidParentId();
  const findType = (nodes, id) => { for (const n of nodes || []) { if (n.id === id) return n.type; const r = findType(n.children, id); if (r) return r; } return null; };
  const targetType = parentId ? findType(blocks, parentId) : null;
  // The collection's address, for an item's live link
  const pages = useStore((s) => s.pages);
  const [colSlug, setColSlug] = useState(null);
  useEffect(() => {
    if (!activePage?.__item || !activePage.collection_id) return undefined;
    let alive = true;
    fetch('api.php?action=get_collections').then((r) => r.json()).then((d) => {
      const c = Array.isArray(d) ? d.find((x) => x.id === activePage.collection_id) : null;
      if (alive) setColSlug(c ? c.slug : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [activePage?.__item, activePage?.collection_id]);
  const siteLangs = useStore((s) => s.languages);
  const liveUrl = activePage?.__popup ? null : livePageUrl(activePage, pages, colSlug, siteLangs);

  const kind = activePage?.__part ? (activePage.__part === 'header' ? 'Global header' : 'Global footer') : activePage?.__design ? 'Collection design' : activePage?.__item ? 'Collection item' : activePage?.__popup ? 'Popup' : null;
  const backLabel = activePage?.__item || activePage?.__design ? 'Collections' : activePage?.__part ? 'Global Options' : activePage?.__popup ? 'Popups' : 'Pages';

  return (
    <div className="cc-editor">
      {isEditingMaster ? (
        <header className="cc-ed-top cc-ed-top--master">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Crown size={17} aria-hidden="true" /> <strong>Editing a global master</strong>
            <span className="cc-ed-hide-sm">— changes apply everywhere it is used.</span>
          </span>
          <span className="ui-row" style={{ flexWrap: 'nowrap' }}>
            <button type="button" onClick={() => exitMasterEditMode(false)} className="cc-ed-master-btn">Cancel</button>
            <button type="button" onClick={() => exitMasterEditMode(true)} className="cc-ed-master-btn cc-ed-master-btn--solid">Save Master &amp; Close</button>
          </span>
        </header>
      ) : (
        <header className="cc-ed-top">
          <div className="cc-ed-top__group" style={{ minWidth: 0, flex: '1 1 0' }}>
            <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={leave} title={`Back to ${backLabel}`}>{backLabel}</Button>
            <span className="cc-ed-sep" />
            <span className="cc-ed-title" title={activePage?.title}>{activePage?.title || 'Untitled page'}</span>
            {kind ? <Badge tone="accent">{kind}</Badge> : <span className="cc-ed-hide-sm"><StatusBadgeFor page={activePage} /></span>}
            <span className="cc-ed-hide-md"><EditorDraftStatus /></span>
          </div>
          <div className="cc-ed-top__group" style={{ justifyContent: 'center' }}>
            <Segmented label="Preview size" value={viewport} onChange={setViewport} options={[
              ['desktop', null, Monitor, 'Desktop'], ['tablet', null, Tablet, 'Tablet'], ['mobile', null, Smartphone, 'Mobile'],
            ]} />
            <IconButton icon={Undo2} label="Undo (Ctrl+Z)" size="sm" onClick={undo} disabled={pastBlocks.length === 0} />
            <IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" size="sm" onClick={redo} disabled={futureBlocks.length === 0} />
          </div>
          <div className="cc-ed-top__group" style={{ justifyContent: 'flex-end', flex: '1 1 0' }}>
            <IconButton icon={ExternalLink} size="sm" disabled={!liveUrl}
              label={liveUrl ? 'View the published page in a new tab (changes not yet published are not shown)' : 'Not published yet: publish it to view it online'}
              onClick={() => { if (liveUrl) window.open(liveUrl, '_blank', 'noopener,noreferrer'); }} />
            {!activePage?.__part && !activePage?.__popup && (
              <IconButton icon={History} label="Version history" size="sm" onClick={() => setHistoryOpen(true)} />
            )}
            {activePage?.is_draft_copy == 1 && (
              <Button variant="danger" size="sm" icon={AlertCircle} onClick={discardChanges} title="Throw away the draft and go back to the published version"><span className="cc-ed-hide-md">Discard draft</span></Button>
            )}
            <Button size="sm" icon={Save} onClick={saveDraft} disabled={isSaving || isPublishing || locked} title={locked ? 'Waiting for review: withdraw the submission to change it' : 'Save draft (Ctrl+S)'}><span className="cc-ed-hide-sm">{activePage?.__part ? 'Save' : 'Save Draft'}</span></Button>
            {showSubmit && <Button variant="primary" size="sm" icon={ClipboardCheck} onClick={submitForReview} disabled={isSaving || isPublishing}>{review.state === 'changes' ? 'Submit again' : 'Submit for review'}</Button>}
            {showPublish && <Button variant="primary" size="sm" icon={Globe} onClick={publishSite} disabled={isPublishing || isSaving} title={approving ? 'Approve: publish this page and update the whole site' : 'Publish this page, then update the whole site (menus and lists)'}>{isPublishing ? 'Publishing…' : approving ? 'Approve & publish' : 'Publish'}</Button>}
          </div>
        </header>
      )}

      {real && <ReviewBar page={activePage} role={userRole} username={username} onChange={(patch) => updateActivePage(patch)} />}

      <div className="cc-ed-body">
        <aside className="cc-ed-left" data-open={panels.left} aria-label="Add blocks and page structure">
          <div className="ui-tabs" role="tablist" aria-label="Left panel">
            <button type="button" role="tab" className="ui-tab" aria-selected={leftTab === 'add'} onClick={() => setLeftTab('add')}><PlusCircle size={14} aria-hidden="true" /> Add</button>
            <button type="button" role="tab" className="ui-tab" aria-selected={leftTab === 'nav'} onClick={() => setLeftTab('nav')}><Layers size={14} aria-hidden="true" /> Layers</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {leftTab === 'nav' ? <LayerNavigator /> : <AddBlocksPanel onAdd={handleAddBlock} targetType={targetType} parentId={parentId} />}
          </div>
        </aside>
        <button type="button" className="cc-ed-toggle cc-ed-toggle--left" onClick={() => togglePanel('left')}
          aria-label={panels.left ? 'Hide the left panel' : 'Show the left panel'} title={panels.left ? 'Hide panel' : 'Show panel'}>
          {panels.left ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>

        <main className="cc-ed-canvas" aria-label="Page canvas">
          <Canvas />
        </main>

        <button type="button" className="cc-ed-toggle cc-ed-toggle--right" onClick={() => togglePanel('right')}
          aria-label={panels.right ? 'Hide the settings panel' : 'Show the settings panel'} title={panels.right ? 'Hide panel' : 'Show panel'}>
          {panels.right ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
        <aside className="cc-ed-right" data-open={panels.right} aria-label="Settings">
          <PropertyPanel />
          <BlockContextMenu />
        </aside>
      </div>

      {historyOpen && activePage && (
        <RevisionHistory owner={activePage.__item ? 'item:' + activePage.id : activePage.id} onClose={() => setHistoryOpen(false)} />
      )}
      {editorDraftFound && !editorRestored && (
        <div role="status" className="cc-ed-restored">
          <span><strong>Unsaved changes found</strong> for this page{editorDraftFound.savedAt ? ` (from ${new Date(editorDraftFound.savedAt).toLocaleString()})` : ''}. They were never saved to the site.</span>
          <Button size="sm" variant="primary" onClick={() => draft.restoreFound()}>Restore</Button>
          <Button size="sm" variant="ghost" onClick={() => draft.dismissFound()}>Discard</Button>
        </div>
      )}
      {editorRestored && (
        <div role="status" className="cc-ed-restored">
          <span><strong>Restored unsaved changes</strong> from your previous session. They are <strong>not saved to the site yet</strong>: use Save Draft or Publish to keep them.</span>
          <Button size="sm" variant="ghost" onClick={async () => {
            if (!(await confirmDialog({ title: 'Discard the restored changes?', message: 'The page goes back to its last saved version.', confirmLabel: 'Discard changes', danger: true }))) return;
            clearDraft(editorScope(useStore.getState()));
            draft.discard();
            setSelectedBlockId(null); setView('manager');
          }}>Discard</Button>
        </div>
      )}
    </div>
  );
}

function StatusBadgeFor({ page }) {
  if (!page) return null;
  if (Number(page.is_draft_copy)) return <Badge tone="modified">Modified · draft</Badge>;
  if (page.status === 'published') return <Badge tone="published">Published</Badge>;
  return <Badge tone="draft">Draft</Badge>;
}
