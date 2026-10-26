// canvascore-frontend/src/session/draftTrackers.js
// Logic (pure, no React) that decides WHEN there is unsaved work and writes it to the local backup.
//  - createEditorDraftTracker: block editor (pages, collection items, header/footer, masters)
//  - createDraftChannel:       views with local state (menu, global settings)
//  - applyDraftToStore:        restores a draft into the store

import { canon, saveDraft, clearDraft, readDraft } from './drafts.js';

// Page fields that count for "I changed something" (excludes updated_at, content_json, ...)
const PAGE_KEYS = ['id', 'title', 'slug', 'seo_title', 'seo_description', 'seo_image', 'layout', 'bg_color', 'boxed_width',
  'is_home', 'noindex', 'excerpt', 'cover_image', 'date', 'archived', 'status', 'collection_id', '__part', '__item', '__popup', 'settings', 'lang'];

export function pickPage(p) {
  const r = {};
  if (!p) return r;
  for (const k of PAGE_KEYS) if (p[k] !== undefined) r[k] = p[k];
  return r;
}

// Page without the heavy fields (the content lives in "blocks"): avoids tripling the backup size.
export function slimPage(p) {
  if (!p) return p;
  const { content_json, draft_copy, ...rest } = p; // eslint-disable-line no-unused-vars
  return rest;
}

// In Master mode "blocks" holds the master; the real page lives in editingMaster.pageBackup.
export function editorSnapshot(s) {
  const master = !!(s.isEditingMaster && s.editingMaster);
  const page = master ? s.editingMaster.activePageBackup : s.activePage;
  const blocks = master ? s.editingMaster.pageBackup : s.blocks;
  return {
    page: { page: pickPage(page), blocks: blocks || [] },
    master: master ? { id: s.editingMaster.id, name: s.editingMaster.name, blocks: s.blocks || [] } : null,
  };
}

export function editorPayload(s) {
  const snap = editorSnapshot(s);
  const master = !!(s.isEditingMaster && s.editingMaster);
  const fullPage = master ? s.editingMaster.activePageBackup : s.activePage;
  return { page: { page: slimPage(fullPage), blocks: snap.page.blocks }, master: snap.master };
}

export function editorContextKey(s) {
  const master = !!(s.isEditingMaster && s.editingMaster);
  const page = master ? s.editingMaster.activePageBackup : s.activePage;
  return 'page:' + (page && page.id ? page.id : 'new');
}
export const editorScope = (s) => 'editor:' + editorContextKey(s);

const realSetTimeout = (f, ms) => setTimeout(f, ms);
const realClearTimeout = (t) => clearTimeout(t);

export function createEditorDraftTracker({ getState, setState, debounceMs = 600, setTimeoutFn = realSetTimeout, clearTimeoutFn = realClearTimeout }) {
  // base.x: undefined = baseline not captured yet | null = "always treat as modified"
  // (state restored from a draft: the server version is unknown) | string = signature of the saved state
  const base = { page: undefined, master: undefined };
  let timer = null;
  let lastMasterId = null;
  let started = false;
  let found = null;                         // backup found when opening the page: { scope, entry }, kept until a decision

  const masterId = (s) => ((s.isEditingMaster && s.editingMaster) ? s.editingMaster.id : null);
  const sigPage = (s) => canon(editorSnapshot(s).page);
  const sigMaster = (s) => { const m = editorSnapshot(s).master; return m ? canon(m) : undefined; };

  function dirtyState(s) {
    const snap = editorSnapshot(s);
    const pageDirty = base.page === null || (base.page !== undefined && canon(snap.page) !== base.page);
    const masterDirty = !!snap.master && (base.master === null || (base.master !== undefined && canon(snap.master) !== base.master));
    return pageDirty || masterDirty;
  }

  function evaluate() {
    clearTimeoutFn(timer); timer = null;
    if (!started) return;
    const s = getState();
    if (!s.activePage) return;              // state reset (logout/leaving the editor): don't touch the drafts
    const scope = editorScope(s);
    if (dirtyState(s)) {
      const r = saveDraft(scope, editorPayload(s));
      // Editing the server version replaces the older backup that was offered: the offer goes away
      if (found && found.scope === scope) { found = null; setState({ editorDraftFound: null }); }
      setState({ editorDirty: true, draftBackupFailed: !r.ok });
    } else {
      // back to the saved state (save or undo): nothing to protect, except a backup still on offer
      if (!(found && found.scope === scope)) clearDraft(scope);
      setState({ editorDirty: false, draftBackupFailed: false });
    }
  }

  function start() {
    const s = getState();
    const restored = !!s.editorRestored;
    base.page = restored ? null : sigPage(s);
    lastMasterId = masterId(s);
    base.master = lastMasterId ? (restored ? null : sigMaster(s)) : undefined;
    started = true;
    // Unsaved work left from an earlier visit to this page (not restored at sign-in): offer it, never delete it silently
    found = null;
    if (!restored && s.activePage) {
      const scope = editorScope(s);
      const d = readDraft(scope);
      if (d && d.payload && d.payload.page && canon(d.payload.page) !== base.page) found = { scope, entry: { scope, payload: d.payload, savedAt: d.savedAt } };
    }
    setState({ editorDirty: restored, editorDraftFound: found ? { savedAt: found.entry.savedAt } : null });
  }

  // "Restore" on the offer: loads the backup into the editor (then treated as unsaved, like a restore at sign-in)
  function restoreFound() {
    if (!found) return false;
    const entry = found.entry;
    found = null;
    applyDraftToStore(entry, setState);
    start();
    return true;
  }
  // "Discard" on the offer: deletes that backup
  function dismissFound() {
    if (found) clearDraft(found.scope);
    found = null;
    setState({ editorDraftFound: null });
  }

  // Call on every store change (subscribe). The heavy work is debounced.
  function onChange(s, prev) {
    if (!started) return;
    if (s.blocks === prev.blocks && s.activePage === prev.activePage
      && s.isEditingMaster === prev.isEditingMaster && s.editingMaster === prev.editingMaster) return;
    const mid = masterId(s);
    if (mid !== lastMasterId) {             // entering/leaving master editing
      lastMasterId = mid;
      base.master = mid ? sigMaster(s) : undefined;
    }
    clearTimeoutFn(timer);
    timer = setTimeoutFn(evaluate, debounceMs);
  }

  // After a successful page save. `sent` = editorSnapshot(state when the request was sent).page and
  // `sentScope` its backup scope: only what was SENT becomes the baseline, so edits made while the request
  // was in flight stay unsaved (and backed up). Id and status come from the server's answer.
  function markSaved(sent, sentScope) {
    const s = getState();
    if (sent) {
      const cur = editorSnapshot(s).page.page;
      base.page = canon({ page: { ...sent.page, id: cur.id, status: cur.status }, blocks: sent.blocks });
    } else {
      base.page = sigPage(s);
    }
    if (sentScope && sentScope !== editorScope(s)) clearDraft(sentScope);   // the page id changed (draft copy)
    if (s.editorRestored) setState({ editorRestored: false });
    evaluate();
  }

  // Discards unsaved work ("undo restored changes", "discard draft" on the server):
  // the current state becomes the baseline, so the local draft is deleted and not rewritten.
  function discard() {
    const s = getState();
    base.page = sigPage(s);
    base.master = (s.isEditingMaster && s.editingMaster) ? sigMaster(s) : undefined;
    if (s.editorRestored) setState({ editorRestored: false });
    evaluate();
  }

  // Leaving the editor: last backup, then the per-page flags are reset (they must not follow to another page)
  function dispose() {
    evaluate();
    started = false; found = null;
    const s = getState();
    if (s.editorRestored || s.editorDraftFound) setState({ editorRestored: false, editorDraftFound: null });
  }

  return { start, onChange, evaluate, markSaved, discard, restoreFound, dismissFound, dispose, _base: () => ({ ...base }) };
}

// ---------------------------------------------------------------------------
// Channel for views with local state (menu, settings): compared with the value loaded from the server.
// ---------------------------------------------------------------------------
export function createDraftChannel(scope, { debounceMs = 600, setTimeoutFn = realSetTimeout, clearTimeoutFn = realClearTimeout, onBackupStatus = () => {} } = {}) {
  let ready = false;
  let base = '';
  let server;
  let current;
  let timer = null;

  function evaluate() {
    clearTimeoutFn(timer); timer = null;
    if (!ready) return;                     // before loading from the server nothing is written (or deleted)
    if (canon(current) === base) { clearDraft(scope); onBackupStatus(true); }
    else { const r = saveDraft(scope, current); onBackupStatus(r.ok); }
  }

  return {
    // Call when the data arrives from the server. Returns the draft to re-apply, if any.
    loaded(serverValue) {
      server = serverValue; current = serverValue; base = canon(serverValue); ready = true;
      const d = readDraft(scope);
      if (!d) return null;
      if (canon(d.payload) === base) { clearDraft(scope); return null; }   // matches the server: not needed
      return { value: d.payload, savedAt: d.savedAt };
    },
    update(value) {
      current = value;
      if (!ready) return;
      clearTimeoutFn(timer);
      timer = setTimeoutFn(evaluate, debounceMs);
    },
    saved(value) { base = canon(value); current = value; evaluate(); },
    discard() { clearDraft(scope); current = server; base = canon(server); clearTimeoutFn(timer); timer = null; return server; },
    flush: evaluate,
    serverValue: () => server,
    isDirty: () => ready && canon(current) !== base,
  };
}

// ---------------------------------------------------------------------------
// Restores a draft into the store. Returns the target view.
// ---------------------------------------------------------------------------
export function applyDraftToStore(entry, setState) {
  const scope = entry.scope || '';
  if (scope === 'menu') { setState({ currentView: 'menu' }); return 'menu'; }
  if (scope === 'settings') { setState({ currentView: 'settings' }); return 'settings'; }
  if (scope.startsWith('editor:')) {
    const pl = entry.payload || {};
    const page = pl.page && pl.page.page;
    const master = pl.master || null;
    if (!page) return null;
    setState({
      activePage: page,
      blocks: master ? master.blocks : (pl.page.blocks || []),
      isEditingMaster: !!master,
      editingMaster: master ? { id: master.id, name: master.name, pageBackup: pl.page.blocks || [], activePageBackup: page } : null,
      pastBlocks: [], futureBlocks: [], selectedBlockId: null,
      currentView: 'editor', editorRestored: true, editorDirty: true,
    });
    return 'editor';
  }
  return null;
}
