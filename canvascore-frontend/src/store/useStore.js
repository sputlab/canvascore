import { create } from 'zustand';
import { normalizePalette } from '../editor/palette';
import { flushDrafts, setDraftUser } from '../session/drafts';
import { CONTAINER_TYPES } from '../editor/blockCatalog';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
let paletteRequest = null;   // one settings request for all the colour fields

// Unique ids even for many blocks created in the same millisecond (templates, masters, imports)
let idSeq = 0;
export const newBlockId = () => 'block-' + Date.now().toString(36) + '-' + (++idSeq).toString(36) + Math.random().toString(36).slice(2, 7);

const pushHistory = (state, newBlocks) => {
  const past = [...state.pastBlocks, state.blocks];
  if (past.length > 30) past.shift();
  return { blocks: newBlocks, pastBlocks: past, futureBlocks: [] };
};

const updateNode = (blocks, id, updates) => {
  return blocks.map(block => {
    if (block.id === id) return { ...block, ...updates };
    if (block.children) return { ...block, children: updateNode(block.children, id, updates) };
    return block;
  });
};

const removeNode = (blocks, id) => {
  return blocks.filter(block => block.id !== id).map(block => {
    if (block.children) return { ...block, children: removeNode(block.children, id) };
    return block;
  });
};

const isContainerNode = (b) => Array.isArray(b.children) || CONTAINER_TYPES.includes(b.type);
const findNodeById = (list, id) => {
  for (const b of list || []) { if (b.id === id) return b; const r = findNodeById(b.children, id); if (r) return r; }
  return null;
};
// Adds inside the parent when it exists and is a container, otherwise at the end of the page
// (a stale or non-container selection must never give a Text block "children").
const addTo = (blocks, parentId, newBlock) => {
  const parent = parentId ? findNodeById(blocks, parentId) : null;
  return parent && isContainerNode(parent) ? insertNode(blocks, parentId, newBlock) : [...blocks, newBlock];
};

const insertNode = (blocks, parentId, newBlock) => {
  return blocks.map(block => {
    if (block.id === parentId) {
      return { ...block, children: [...(block.children || []), newBlock] };
    }
    if (block.children) {
      return { ...block, children: insertNode(block.children, parentId, newBlock) };
    }
    return block;
  });
};

// Reorders two SIBLING blocks (same parent) at any depth of the tree.
// Returns { found, nodes }. If active and over are not siblings, found = false (no-op).

// General move within the tree (cross-container, cycle-safe)
const findInTree = (list, id) => {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { list, index: i, node: list[i] };
    if (list[i].children) {
      const r = findInTree(list[i].children, id);
      if (r) return r;
    }
  }
  return null;
};
const nodeContainsId = (node, id) => {
  if (node.id === id) return true;
  if (node.children) for (const c of node.children) if (nodeContainsId(c, id)) return true;
  return false;
};
const arrayMoveImpl = (arr, from, to) => {
  const a = arr.slice();
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
};
const moveInTree = (roots, activeId, overId) => {
  if (!activeId || !overId || activeId === overId) return null;
  const tree = JSON.parse(JSON.stringify(roots));
  const a = findInTree(tree, activeId);
  if (!a) return null;
  if (nodeContainsId(a.node, overId)) return null; // no cycles
  const oPre = findInTree(tree, overId);
  if (!oPre) return null;
  // Dropped on an EMPTY container (also a sibling): goes inside it
  if (Array.isArray(oPre.node.children) && oPre.node.children.length === 0) {
    a.list.splice(a.index, 1);
    findInTree(tree, overId).node.children.push(a.node);
    return tree;
  }
  // Same parent: directional reorder (fixes dragging downwards)
  if (a.list === oPre.list) {
    const reordered = arrayMoveImpl(a.list, a.index, oPre.index);
    a.list.length = 0; a.list.push(...reordered);
    return tree;
  }
  // Cross-container
  const node = a.node;
  a.list.splice(a.index, 1);
  const o = findInTree(tree, overId);
  if (!o) return null;
  const emptyContainer = Array.isArray(o.node.children) && o.node.children.length === 0;
  if (emptyContainer) o.node.children.push(node);
  else o.list.splice(o.index, 0, node);
  return tree;
};

// Explicit move (Layers tab): puts the block 'before' or 'after' the target, or 'inside' it
// (at the end of a container's children). Exported for the tests. Returns null when not possible.
export const placeInTree = (roots, activeId, targetId, position) => {
  if (!activeId || !targetId || activeId === targetId) return null;
  const tree = JSON.parse(JSON.stringify(roots));
  const a = findInTree(tree, activeId);
  if (!a || nodeContainsId(a.node, targetId)) return null; // not into itself or its own children
  const t0 = findInTree(tree, targetId);
  if (!t0 || (position === 'inside' && !Array.isArray(t0.node.children))) return null;
  a.list.splice(a.index, 1);
  const t = findInTree(tree, targetId);
  if (position === 'inside') t.node.children.push(a.node);
  else t.list.splice(position === 'after' ? t.index + 1 : t.index, 0, a.node);
  return tree;
};

const lastEdit = { sig: '', t: 0, blocks: null };

// ---- block copies: duplicate, copy/paste (also between pages and tabs), move among siblings ----
const CLIPBOARD_KEY = 'cc_block_clipboard';
// Deep copy with new ids everywhere (a copy must never share an id with its original)
export const cloneWithNewIds = (node) => {
  const copy = JSON.parse(JSON.stringify(node));
  const walk = (n) => {
    n.id = newBlockId();
    if (n.content && Array.isArray(n.content.buttons)) n.content.buttons = n.content.buttons.map((b) => (b && b.id ? { ...b, id: newBlockId() } : b));
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(copy);
  return copy;
};
// Puts `node` right after the block `afterId` (same parent); null when afterId isn't found
const insertAfter = (roots, afterId, node) => {
  const tree = JSON.parse(JSON.stringify(roots));
  const f = findInTree(tree, afterId);
  if (!f) return null;
  f.list.splice(f.index + 1, 0, node);
  return tree;
};
export const readBlockClipboard = () => {
  try { const v = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || 'null'); return v && v.block && v.block.type ? v : null; } catch { return null; }
};

// The ids of every block of a type on the page (nested blocks too), in page order
export const blockIdsOfType = (blocks, type) => {
  const out = [];
  const walk = (list) => { for (const b of list || []) { if (b.type === type) out.push(b.id); walk(b.children); } };
  walk(blocks);
  return out;
};

export const useStore = create((set, get) => ({
  isAuthenticated: false,
  userRole: 'editor',
  username: null,
  mustChangePw: false,
  installed: true,           // false until install.php has run (the sign-in screen then points to it)
  appVersion: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''),
  appBuild: (typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 0),
  serverVersion: null,
  palette: null,              // the global colours (Global Options), loaded once by the colour fields: [{id, name, value}]
  typography: null,           // the text styles (Global Options › Text styles), as normalizeTypography() returns them
  kit: null,                  // button presets and the field style (Global Options › Buttons & fields), as normalizeKit() returns them
  branding: { siteName: '', faviconUrl: '' },   // site name + favicon (Global Options) for the login and the sidebar
  demo: null,   // demo mode only: { username, password, resetMinutes, nextResetIn, resetAt, maxNewPages, maxNewItems }

  // ---- session (see src/session/) ----
  sessionExpired: false,        // true: login shown ON TOP of the app (which stays mounted with all its state)
  expiredUser: null,
  expiredAt: null,
  expiredReason: null,
  sessionExpiresAt: null,       // expected local expiry timestamp (ms), from the server
  sessionTimeout: null,         // seconds of inactivity allowed
  sessionWarning: false,        // less than ~2 minutes to expiry
  // ---- local backup of unsaved work ----
  editorDirty: false,
  editorRestored: false,        // the editor was restored from a local draft
  editorDraftFound: null,       // { savedAt }: opening a page found unsaved work from an earlier visit (offered for restore)
  draftBackupFailed: false,     // the local backup failed (storage full/unavailable)

  fetchVersion: async () => {
    try {
      const res = await fetch('api.php?action=version');   // signed-in users only
      const data = await res.json();
      if (data && data.app) set({ serverVersion: data });
    } catch { /* noop */ }
  },

  fetchBranding: async () => {
    try {
      const res = await fetch('api.php?action=branding');
      const data = await res.json();
      if (data && typeof data === 'object') {
        get().setBranding(data);
        // resetAt: when the next reset is due, on this device's clock
        set({ demo: data.demo && typeof data.demo === 'object' ? { ...data.demo, resetAt: Date.now() + (Number(data.demo.nextResetIn) || 0) * 1000 } : null });
      }
    } catch { /* noop: the default name and icon stay */ }
  },
  setPalette: (list) => set({ palette: Array.isArray(list) ? list : null }),
  setTypography: (t) => set({ typography: t && typeof t === 'object' ? t : null }),
  setKit: (k) => set({ kit: k && typeof k === 'object' ? k : null }),
  loadPalette: () => {
    if (paletteRequest) return paletteRequest;
    paletteRequest = fetch('api.php?action=get_settings').then((r) => r.json())
      .then((d) => { get().setPalette(normalizePalette(d)); })
      .catch(() => { paletteRequest = null; });
    return paletteRequest;
  },
  setBranding: (b) => set({ branding: { siteName: String((b && b.siteName) || '').trim(), faviconUrl: String((b && b.faviconUrl) || '').trim() } }),

  checkAuth: async () => {
    try {
      const res = await fetch('api.php?action=check_auth');
      const data = await res.json();
      if (data.csrf) window.__CC_CSRF = data.csrf;
      setDraftUser(data.authenticated ? (data.username || null) : null);
      set({
        installed: data.installed !== false,
        isAuthenticated: data.authenticated, userRole: data.role, username: data.username || null, mustChangePw: !!data.must_change_pw,
        sessionExpiresAt: data.authenticated && data.expires_in != null ? Date.now() + data.expires_in * 1000 : null,
        sessionTimeout: data.timeout ?? null,
      });
    } catch { /* offline: stays unauthenticated */ }
  },
  login: async (username, password) => {
    try {
      const res = await fetch('api.php?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (data.success) {
        if (data.csrf) window.__CC_CSRF = data.csrf;
        setDraftUser(data.username || null);
        set({
          isAuthenticated: true, userRole: data.role, username: data.username || null, mustChangePw: !!data.must_change_pw,
          sessionExpiresAt: data.expires_in != null ? Date.now() + data.expires_in * 1000 : null, sessionTimeout: data.timeout ?? null,
        });
      }
      return data;
    } catch { return { success: false, message: 'Server error' }; }
  },
  // Login from the "session expired" screen. Does NOT adopt a different user's identity: this tab holds
  // another user's unsaved work and must neither inherit it nor write its backups into the other account.
  reauth: async (username, password) => {
    try {
      const res = await fetch('api.php?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!data.success) return data;
      const expected = get().expiredUser;
      if (expected && data.username && data.username !== expected) return { ...data, differentUser: true };
      if (data.csrf) window.__CC_CSRF = data.csrf;
      setDraftUser(data.username || null);
      set({
        isAuthenticated: true, userRole: data.role, username: data.username || null, mustChangePw: !!data.must_change_pw,
        sessionExpiresAt: data.expires_in != null ? Date.now() + data.expires_in * 1000 : null, sessionTimeout: data.timeout ?? null,
      });
      return data;
    } catch { return { success: false, message: 'Server error' }; }
  },
  logout: async () => {
    flushDrafts();                                   // back up unsaved work BEFORE resetting the state
    try { await fetch('api.php?action=logout', { method: 'POST', body: '{}' }); } catch { /* without network, still sign out of the interface */ }
    window.__CC_CSRF = null;
    setDraftUser(null);
    set({
      isAuthenticated: false, userRole: 'editor', username: null, mustChangePw: false,
      // no work state may survive the logout (the next user must not inherit it)
      currentView: 'manager', activePage: null, blocks: [], pastBlocks: [], futureBlocks: [], selectedBlockId: null,
      isEditingMaster: false, editingMaster: null, pages: [],
      sessionExpired: false, expiredUser: null, expiredAt: null, expiredReason: null, sessionExpiresAt: null, sessionWarning: false,
      editorDirty: false, editorRestored: false, editorDraftFound: null, draftBackupFailed: false,
    });
  },

  changeOwnPassword: async (password) => {
    try {
      const res = await fetch('api.php?action=change_own_password', { method: 'POST', body: JSON.stringify({ password }) });
      const data = await res.json();
      if (data.success) { if (data.csrf) window.__CC_CSRF = data.csrf; set({ mustChangePw: false }); get().fetchVersion(); }
      return data;
    } catch { return { success: false, message: 'Server error' }; }
  },

  publishSiteAsync: async () => {
    try {
      // An expired session is handled by the fetch guard: login on top of the app and the request retried.
      const res = await fetch('rebuild_all.php', { method: 'POST', body: '{}' });
      const text = await res.text();
      return JSON.parse(text);
    } catch { return { success: false, message: 'Connection error.' }; }
  },

  currentView: 'manager', setView: (view) => set({ currentView: view }),
  viewport: 'desktop', setViewport: (vp) => set({ viewport: vp }),

  pages: [],
  setPages: (pages) => set({ pages: Array.isArray(pages) ? pages : [] }),
  // Reloads the page list (dashboard statuses change after publishing)
  refreshPages: async () => {
    try { const r = await fetch('api.php?action=get_pages'); const d = await r.json(); if (Array.isArray(d)) set({ pages: d }); } catch { /* keep the current list */ }
  },
  activePage: null,
  updateActivePage: (updates) => set((state) => ({ activePage: { ...state.activePage, ...updates } })),
  setActivePage: (page) => set({ activePage: page }),

  blocks: [], pastBlocks: [], futureBlocks: [],
  setBlocks: (blocks) => set({
    blocks: Array.isArray(blocks) ? blocks : [],
    pastBlocks: [],
    futureBlocks: []
  }),
  selectedBlockId: null, setSelectedBlockId: (id) => set({ selectedBlockId: id }),
  revealBlockId: null,   // a block just added: its canvas frame scrolls into view once, then this is cleared

  templates: [],
  fetchTemplates: async () => {
    try {
      const res = await fetch('api.php?action=get_templates');
      const data = await res.json();
      set({ templates: Array.isArray(data) ? data : [] });
    } catch { /* noop */ }
  },
  addSavedBlock: (blockStr, parentId = null) => set((state) => {
    try {
      const blockData = JSON.parse(blockStr);
      const regenerateIds = (node) => {
        node.id = newBlockId();
        if (node.children) node.children = node.children.map(regenerateIds);
        return node;
      };
      const newBlock = regenerateIds(blockData);
      return pushHistory(state, addTo(state.blocks, parentId, newBlock));
    } catch { return state; }
  }),
  deleteTemplate: async (id) => {
    const t = (get().templates || []).find((x) => x.id === id);
    if (!(await confirmDialog({ title: `Delete the template${t ? ` "${t.name}"` : ''}?`, message: 'Blocks already added to pages stay. This cannot be undone.', confirmLabel: 'Delete template', danger: true }))) return;
    await fetch('api.php?action=delete_template', { method: 'POST', body: JSON.stringify({ id }) });
    get().fetchTemplates();
  },

  // ---- Master Components ----
  masters: [],
  editingMaster: null,
  isEditingMaster: false,

  fetchMasters: async () => {
    try {
      const res = await fetch('api.php?action=get_masters');
      const data = await res.json();
      set({ masters: Array.isArray(data) ? data : [] });
    } catch { /* noop */ }
  },

  saveAsMaster: async (blockId, name) => {
    const state = get();
    const findBlock = (nodes, id) => {
      for (let n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
          const found = findBlock(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const blockToSave = findBlock(state.blocks, blockId);
    if (!blockToSave) return;

    const masterId = 'master-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    try {
      const res = await fetch('api.php?action=save_master', {
        method: 'POST',
        body: JSON.stringify({ id: masterId, name, content_json: JSON.stringify(blockToSave) })
      });
      const data = await res.json().catch(() => null);
      // Only link the block once the master really exists (otherwise the block would be lost)
      if (!res.ok || !data || !data.success) { notify('Master NOT saved: ' + ((data && data.message) || 'unexpected response') + '. The block was left as it is.', 'error'); return; }
      await get().fetchMasters();

      const replaceWithPointer = (nodes, id) => {
        return nodes.map(n => {
          if (n.id === id) return { id: n.id, type: 'MASTER', content: { masterId, name }, styles: {} };
          if (n.children) return { ...n, children: replaceWithPointer(n.children, id) };
          return n;
        });
      };
      set(s => pushHistory(s, replaceWithPointer(s.blocks, blockId)));
      notify(`Master "${name}" saved and linked.`);
    } catch { notify('Error saving the master (connection problem). The block was left as it is.', 'error'); }
  },

  enterMasterEditMode: (masterId) => {
    const state = get();
    const master = state.masters.find(m => m.id === masterId);
    if (!master) return;
    let content;
    try { content = JSON.parse(master.content_json); } catch { return; }
    set({
      editingMaster: { id: master.id, name: master.name, pageBackup: state.blocks, activePageBackup: state.activePage },
      isEditingMaster: true,
      blocks: [content],
      pastBlocks: [], futureBlocks: [], selectedBlockId: null
    });
  },

  // save = true -> save and close; save = false -> cancel and restore
  exitMasterEditMode: async (save = true) => {
    const state = get();
    if (!state.editingMaster) return;

    if (save && state.blocks.length > 0) {
      const updatedMasterBlock = state.blocks[0];
      try {
        const res = await fetch('api.php?action=save_master', {
          method: 'POST',
          body: JSON.stringify({ id: state.editingMaster.id, name: state.editingMaster.name, content_json: JSON.stringify(updatedMasterBlock) })
        });
        const data = await res.json();
        if (!data || !data.success) {
          notify('Master NOT saved: ' + ((data && data.message) || 'unknown error') + '. Your changes are still here: try again.', 'error');
          return;                                      // stays in edit mode: nothing lost
        }
        await get().fetchMasters();
      } catch {
        notify('Master NOT saved (connection problem). Your changes are still here: try again.', 'error');
        return;
      }
    }

    set({
      blocks: state.editingMaster.pageBackup || [],
      activePage: state.editingMaster.activePageBackup || null,
      editingMaster: null, isEditingMaster: false,
      pastBlocks: [], futureBlocks: [], selectedBlockId: null
    });
    if (save) notify('Master updated everywhere it is used.');
  },

  deleteMaster: async (id) => {
    const m = (get().masters || []).find((x) => x.id === id);
    if (!(await confirmDialog({ title: `Delete the master${m ? ` "${m.name}"` : ''}?`, message: 'It is removed from EVERY page that uses it. This cannot be undone.', confirmLabel: 'Delete master', danger: true }))) return;
    await fetch('api.php?action=delete_master', { method: 'POST', body: JSON.stringify({ id }) });
    get().fetchMasters();
    set((state) => {
      const purgeLocal = (nodes) => {
        return nodes.filter(n => !(n.type === 'MASTER' && n.content.masterId === id))
          .map(n => n.children ? { ...n, children: purgeLocal(n.children) } : n);
      };
      return pushHistory(state, purgeLocal(state.blocks));
    });
  },

  insertMaster: (masterId, name, parentId = null) => {
    const newBlock = { id: newBlockId(), type: 'MASTER', content: { masterId, name }, styles: {} };
    set((state) => pushHistory(state, addTo(state.blocks, parentId, newBlock)));
  },

  // ---- History ----
  undo: () => set((state) => {
    if (state.pastBlocks.length === 0) return state;
    const previous = state.pastBlocks[state.pastBlocks.length - 1];
    return { pastBlocks: state.pastBlocks.slice(0, -1), futureBlocks: [state.blocks, ...state.futureBlocks], blocks: previous };
  }),
  redo: () => set((state) => {
    if (state.futureBlocks.length === 0) return state;
    const next = state.futureBlocks[0];
    return { pastBlocks: [...state.pastBlocks, state.blocks], futureBlocks: state.futureBlocks.slice(1), blocks: next };
  }),

  addBlock: (type, parentId = null) => {
    const defs = (typeof __BLOCK_DEFS__ !== 'undefined') ? __BLOCK_DEFS__ : { _baseStyles: {}, types: {} };
    const def = defs.types[type] || {};
    const styles = { ...(defs._baseStyles || {}), ...(def.styles || {}) };
    // deep clone of content so blocks don't share references
    const content = def.content ? JSON.parse(JSON.stringify(def.content)) : {};
    if (type === 'HERO' && Array.isArray(content.buttons)) {
      content.buttons = content.buttons.map(b => ({ id: newBlockId(), ...b }));
    }
    const newBlock = { id: newBlockId(), type, content, styles };
    if (def.children || CONTAINER_TYPES.includes(type)) newBlock.children = [];

    // The new block is selected (its settings open) and scrolled into view: it lands at the end of the page or
    // inside the selected container, often out of sight
    set((state) => ({ ...pushHistory(state, addTo(state.blocks, parentId, newBlock)), selectedBlockId: newBlock.id, revealBlockId: newBlock.id }));
  },

  // Typing in a field sends one update per key: quick successive edits of the same block and the same
  // fields merge into ONE undo step (otherwise 30 characters would fill the whole undo history).
  duplicateBlock: (id) => {
    const node = findNodeById(get().blocks, id);
    if (!node) return null;
    const copy = cloneWithNewIds(node);
    set((state) => {
      const tree = insertAfter(state.blocks, id, copy);
      return tree ? { ...pushHistory(state, tree), selectedBlockId: copy.id } : state;
    });
    return copy.id;
  },
  // The copied block stays in this browser (localStorage): paste it on any page, in any tab
  copyBlock: (id) => {
    const node = findNodeById(get().blocks, id);
    if (!node) return false;
    try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ block: node, copiedAt: Date.now() })); } catch { return false; }
    set({ blockClipboardAt: Date.now() });
    return true;
  },
  blockClipboardAt: 0,
  // Pastes inside the selected container, after the selected block, or at the end of the page
  pasteBlock: () => {
    const clip = readBlockClipboard();
    if (!clip) return null;
    const copy = cloneWithNewIds(clip.block);
    set((state) => {
      const sel = state.selectedBlockId ? findNodeById(state.blocks, state.selectedBlockId) : null;
      let tree;
      if (sel && isContainerNode(sel)) tree = insertNode(state.blocks, sel.id, copy);
      else if (sel) tree = insertAfter(state.blocks, sel.id, copy);
      if (!tree) tree = [...state.blocks, copy];
      return { ...pushHistory(state, tree), selectedBlockId: copy.id };
    });
    return copy.id;
  },
  // One step up (-1) or down (+1) among its siblings
  moveBlockBy: (id, dir) => set((state) => {
    const tree = JSON.parse(JSON.stringify(state.blocks));
    const f = findInTree(tree, id);
    if (!f) return state;
    const j = f.index + dir;
    if (j < 0 || j >= f.list.length) return state;
    [f.list[f.index], f.list[j]] = [f.list[j], f.list[f.index]];
    return pushHistory(state, tree);
  }),
  // Restore an older version of the page's blocks (one undo step; saved only with Save Draft / Publish)
  replaceBlocks: (blocks) => set((state) => ({ ...pushHistory(state, Array.isArray(blocks) ? blocks : []), selectedBlockId: null })),

  updateBlock: (id, updates) => set((state) => {
    const sig = id + '|' + Object.keys(updates || {}).map((k) => k + ':' + (updates[k] && typeof updates[k] === 'object' ? Object.keys(updates[k]).sort().join(',') : '')).join(';');
    const now = Date.now();
    const merge = lastEdit.sig === sig && now - lastEdit.t < 1200 && state.pastBlocks.length > 0 && state.blocks === lastEdit.blocks;
    const blocks = updateNode(state.blocks, id, updates);
    lastEdit.sig = sig; lastEdit.t = now; lastEdit.blocks = blocks;
    return merge ? { blocks, futureBlocks: [] } : pushHistory(state, blocks);
  }),
  // Copy style: the look of one block (its styles and its tablet and phone overrides), to paste onto others.
  // Held in memory for the session; a paste is one undo step, however many blocks it changes.
  styleClipboard: null,
  copyStyle: (id) => {
    const b = findNodeById(get().blocks, id);
    if (!b) return null;
    const clip = { type: b.type, styles: { ...(b.styles || {}) }, responsive: b.responsive ? JSON.parse(JSON.stringify(b.responsive)) : undefined };
    set({ styleClipboard: clip });
    return clip;
  },
  pasteStyle: (ids) => {
    const clip = get().styleClipboard;
    if (!clip || !Array.isArray(ids) || !ids.length) return 0;
    set((state) => {
      let blocks = state.blocks;
      for (const id of ids) {
        blocks = updateNode(blocks, id, { styles: { ...clip.styles }, responsive: clip.responsive ? JSON.parse(JSON.stringify(clip.responsive)) : undefined });
      }
      return pushHistory(state, blocks);
    });
    return ids.length;
  },
  // Reset to the global style: the block's own styles and device overrides go, so it follows the site's presets again.
  // Kept: its text style (a preset it picked), its entrance animation and its hidden devices (visibility, not style).
  resetStyle: (id) => set((state) => {
    const b = findNodeById(state.blocks, id);
    if (!b) return state;
    const keep = {};
    for (const k of ['textPreset', 'animation']) if (b.styles && b.styles[k] !== undefined) keep[k] = b.styles[k];
    const hide = b.responsive && Array.isArray(b.responsive.hide) && b.responsive.hide.length ? { hide: [...b.responsive.hide] } : undefined;
    return pushHistory(state, updateNode(state.blocks, id, { styles: keep, responsive: hide }));
  }),
  removeBlock: (id) => set((state) => {
    const historyState = pushHistory(state, removeNode(state.blocks, id));
    return { ...historyState, selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId };
  }),

  // Real reorder: works among siblings at any level of the tree.
  moveBlock: (activeId, overId) => set((state) => {
    const moved = moveInTree(state.blocks, activeId, overId);
    if (!moved) return state;
    return pushHistory(state, moved);
  }),

  moveBlockTo: (activeId, targetId, position) => set((state) => {
    const moved = placeInTree(state.blocks, activeId, targetId, position);
    if (!moved) return state;
    return pushHistory(state, moved);
  })
}));
