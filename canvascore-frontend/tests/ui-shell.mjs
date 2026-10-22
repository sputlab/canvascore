// tests/ui-shell.mjs
// The reorganized admin UI, with the real components mounted in jsdom (Vite SSR):
//  - admin sidebar: sections, current section, admin-only group, navigation;
//  - Pages: search, status filters with counts, duplicate;
//  - editor: top bar (back, devices, save, publish), Ctrl+S, Esc, collapsible panels (remembered);
//  - Add panel: categories, search, admin-only blocks;
//  - property panel: block name from the catalog, tabs, spacing in Style, first section open;
//  - effects (Advanced tab), hero/button colors and hovers, cards count, Layers drop positions.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blockDefs = JSON.parse(readFileSync(path.join(PROJECT, '../canvascore-admin/blocks.json'), 'utf8'));
let fails = 0, total = 0;
const check = (name, cond, extra = '') => { total++; if (cond) console.log('  ✓ ' + name); else { fails++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 3000) { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > timeout) return null; await sleep(20); } }

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/canvascore-admin/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['document', 'localStorage', 'location', 'history', 'navigator', 'getComputedStyle', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent', 'CustomEvent', 'MutationObserver', 'SVGElement', 'DocumentFragment', 'Text', 'DOMParser', 'Range']) {
  if (k in w) Object.defineProperty(globalThis, k, { configurable: true, get: () => w[k] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis, writable: true });
globalThis.getSelection = () => w.getSelection();
globalThis.addEventListener = (...a) => w.addEventListener(...a);
globalThis.removeEventListener = (...a) => w.removeEventListener(...a);
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.alert = () => {}; globalThis.confirm = () => { throw new Error('native confirm() used'); }; globalThis.prompt = () => { throw new Error('native prompt() used'); };
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, body: init.body });
  if (u.includes('save_page')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('save_settings')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('get_pages')) return new Response(JSON.stringify(PAGES));
  if (u.includes('get_media_folders')) return new Response(JSON.stringify(MEDIA_FOLDERS));
  if (u.includes('get_media')) return new Response(JSON.stringify(MEDIA));
  if (u.includes('media_move')) { const b = JSON.parse(init.body); MEDIA.forEach((m) => { if (b.names.includes(m.name)) m.folder = b.folder; }); return new Response(JSON.stringify({ success: true, moved: b.names.length, folders: MEDIA_FOLDERS })); }
  if (u.includes('media_usage')) return new Response(JSON.stringify({ success: true, usage: { 'sky.jpg': ['Page: Home'] } }));
  if (u.includes('delete_media')) { const b = JSON.parse(init.body); return new Response(JSON.stringify({ success: true, deleted: b.names.length, message: `${b.names.length} images deleted.` })); }
  if (u.includes('upload_media')) return new Response(JSON.stringify({ success: true, url: '/uploads/123_new-icon.png' }));
  if (u.includes('backup_info')) return new Response(JSON.stringify({ success: true, zip: true, max_upload: 300 * 1024, backups: BACKUPS }));
  if (u.includes('backup_create')) { const b = JSON.parse(init.body); BACKUP_OPTS.push(b); return new Response(JSON.stringify({ success: true, name: b.temp ? 'download-20261013-101500-ab12.zip' : 'backup-20261013-101600-cd34.zip', backups: b.temp ? BACKUPS : [{ ...BACKUPS[1], name: 'backup-20261013-101600-cd34.zip', created: 1791900000 }, ...BACKUPS] })); }
  if (u.includes('backup_upload_chunk')) { CHUNKS.push({ id: init.body.get('id'), index: init.body.get('index'), size: init.body.get('chunk').size }); return new Response(JSON.stringify({ success: true })); }
  if (u.includes('backup_restore')) return new Response(JSON.stringify({ success: true, message: 'Backup restored (Acme).', counts: { pages: 3, collection_items: 2, images: 5 }, skipped: ['bad.svg'], safety: 'before-restore-20261013-101700-ef56.zip', backups: BACKUPS }));
  if (u.includes('backup_delete')) return new Response(JSON.stringify({ success: true, backups: BACKUPS.slice(1) }));
  if (u.includes('get_collections')) return new Response(JSON.stringify(COLS.map((c) => ({ ...c, item_count: ITEMS.filter((i) => i.collection_id === c.id).length }))));
  if (u.includes('get_items')) { const cid = decodeURIComponent(u.split('collection=')[1]); return new Response(JSON.stringify(ITEMS.filter((i) => i.collection_id === cid))); }
  if (u.includes('save_collection')) { const b = JSON.parse(init.body); COL_SAVES.push(b); const c = COLS.find((x) => x.id === b.id); const moved = c.slug !== b.slug; Object.assign(c, { name: b.name, slug: b.slug }); return new Response(JSON.stringify({ success: true, id: c.id, name: c.name, slug: c.slug, moved })); }
  if (u.includes('bulk_items')) {
    const b = JSON.parse(init.body); BULK.push(b);
    const skipped = [];
    b.ids.forEach((id) => {
      const it = ITEMS.find((i) => i.id === id);
      if (b.op === 'archive' || b.op === 'unarchive') it.archived = b.op === 'archive' ? 1 : 0;
      else if (b.op === 'delete') ITEMS.splice(ITEMS.indexOf(it), 1);
      else if (b.op === 'move') { if (it.slug === 'clash') skipped.push({ id, title: it.title, reason: 'the URL slug "clash" is already used there' }); else it.collection_id = b.collection_id; }
    });
    return new Response(JSON.stringify({ success: true, done: b.ids.length - skipped.length, skipped }));
  }
  if (u.includes('rebuild_all')) return new Response(JSON.stringify({ success: true, message: 'Published.' }));
  if (u.includes('action=branding')) return new Response(JSON.stringify({ siteName: 'Acme Bakery', faviconUrl: '/uploads/fav.png' }));
  if (u.includes('optimize_media')) return new Response(JSON.stringify({ success: true, done: 1, remaining: 0 }));
  if (u.includes('save_media_meta')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('get_starters')) return new Response(JSON.stringify(STARTERS));
  if (u.includes('get_revisions')) return new Response(JSON.stringify([{ id: 2, title: 'P', kind: 'published', author: 'ann', created_at: '2026-10-12 10:00:00' }, { id: 1, title: 'P', kind: 'draft', author: 'bob', created_at: '2026-10-11 09:00:00' }]));
  if (u.includes('get_revision&')) return new Response(JSON.stringify({ id: 1, content_json: JSON.stringify([{ id: 'old1', type: 'TEXT', styles: {}, content: { text: '<p>Old version text</p>' } }]) }));
  return new Response(JSON.stringify([]));
};

const vite = await createServer({
  root: PROJECT, configFile: false, logLevel: 'error', appType: 'custom', clearScreen: false,
  server: { middlewareMode: true, hmr: false, watch: null }, plugins: [react()],
  define: { __APP_VERSION__: '"test"', __APP_BUILD__: '0', __BLOCK_DEFS__: JSON.stringify(blockDefs) },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const doc = w.document;
const $ = (sel) => doc.querySelector(sel);
const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const typeIn = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const btn = (txt, root = doc) => $$('button', root).find((b) => b.textContent.trim() === txt);
const btnHas = (txt, root = doc) => $$('button', root).find((b) => b.textContent.includes(txt));

const LONG = 'a-really-really-long-file-name-that-has-no-spaces-at-all-and-keeps-going-forever-2026.jpg';
const MEDIA = [
  { name: 'sky.jpg', url: '/uploads/sky.jpg', folder: 'Products', mtime: 200, alt: 'Blue sky', w: 2000, h: 1000, bytes: 345000, optimized: true, variants: [480, 960, 1600] },
  { name: 'old.png', url: '/uploads/old.png', folder: '', mtime: 100, alt: '', w: 0, h: 0, bytes: 1200, optimized: false, variants: [] },
  { name: LONG, url: '/uploads/' + LONG, folder: '', mtime: 300, alt: '', w: 10, h: 10, bytes: 900, optimized: true, variants: [] },
];
const MEDIA_FOLDERS = ['Products', 'Products/Shoes'];
const BACKUPS = [
  { name: 'before-restore-20261012-090000-aa11.zip', kind: 'safety', bytes: 5 * 1048576, created: 1791795600, site_name: 'Acme', app: '0.13.0', counts: { pages: 12, collection_items: 4 }, uploads: { files: 37 } },
  { name: 'backup-20261011-090000-bb22.zip', kind: 'saved', bytes: 3 * 1048576, created: 1791709200, site_name: 'Acme', app: '0.13.0', counts: { pages: 1 }, uploads: { files: 1 } },
];
const BACKUP_OPTS = [];
const LONG_COL = 'Recipes and seasonal stories from our kitchen, collected over many many years';
const COLS = [{ id: 'c1', name: 'Blog', slug: 'blog' }, { id: 'c2', name: LONG_COL, slug: 'recipes' }];
const ITEMS = [
  { id: 'i1', collection_id: 'c1', title: 'Live post', slug: 'live', date: '2026-10-03', status: 'published', archived: 0 },
  { id: 'i2', collection_id: 'c1', title: 'Old post', slug: 'old', date: '2026-10-02', status: 'published', archived: 1 },
  { id: 'i3', collection_id: 'c1', title: 'Draft post', slug: 'draft', date: '2026-10-01', status: 'draft', archived: 0 },
  { id: 'i4', collection_id: 'c1', title: 'Clash post', slug: 'clash', date: '2026-09-30', status: 'published', archived: 0 },
];
const COL_SAVES = [];
const BULK = [];
const CHUNKS = [];
const STARTERS = [{ id: 'blank', name: 'Blank', description: 'Start from an empty page.', blocks: [] },
  { id: 'story', name: 'Our Story', description: 'A brand story.', blocks: [{ id: 'st-1', type: 'SECTION', styles: {}, children: [{ id: 'st-t', type: 'TEXT', styles: {}, content: { text: '<h2>Once upon a time</h2>' } }] }] }];
const PAGES = [
  { id: 'p1', title: 'Home', clean_slug: 'index', status: 'published', is_home: 1, updated_at: '2026-10-01 10:00:00', content_json: '[]' },
  { id: 'p2', title: 'About us', clean_slug: 'about', status: 'modified', updated_at: '2026-10-05 10:00:00', content_json: '[{"id":"b1","type":"TEXT","content":{"text":"<p>x</p>"},"styles":{}}]' },
  { id: 'p3', title: 'Contact', clean_slug: 'contact', status: 'draft', updated_at: '2026-10-03 10:00:00', content_json: '[]' },
];

const { useStore } = await vite.ssrLoadModule('/src/store/useStore.js');
const AdminLayout = (await vite.ssrLoadModule('/src/components/AdminLayout.jsx')).default;
const PageManager = (await vite.ssrLoadModule('/src/components/PageManager.jsx')).default;
const VisualEditor = (await vite.ssrLoadModule('/src/components/VisualEditor.jsx')).default;
const PropertyPanel = (await vite.ssrLoadModule('/src/components/PropertyPanel.jsx')).default;
const { Toaster } = await vite.ssrLoadModule('/src/ui/toast.jsx');
const { DialogHost } = await vite.ssrLoadModule('/src/ui/dialogHost.jsx');
const { BLOCKS } = await vite.ssrLoadModule('/src/editor/blockCatalog.js');
const { CONTENT_PANELS } = await vite.ssrLoadModule('/src/components/panel/blocks/index.js');
const { createRoot } = await import('react-dom/client');
const React = await import('react');
let root = null;
const mount = (el) => { if (root) root.unmount(); doc.getElementById('root').innerHTML = ''; root = createRoot(doc.getElementById('root')); root.render(React.createElement(React.Fragment, null, el, React.createElement(Toaster), React.createElement(DialogHost))); };
const st = () => useStore.getState();

let failedRun = false;
try {
  console.log('CATALOG');
  const types = Object.keys(blockDefs.types);
  check('every block type has a name, icon and category in the catalog', types.every((t) => BLOCKS.some((b) => b.type === t && b.label && b.icon && b.category)), types.filter((t) => !BLOCKS.some((b) => b.type === t)).join(','));
  check('every non-layout block has a Content panel', types.filter((t) => !['SECTION', 'CONTAINER', 'FLEX_ROW'].includes(t)).every((t) => CONTENT_PANELS[t]), types.filter((t) => !['SECTION', 'CONTAINER', 'FLEX_ROW'].includes(t) && !CONTENT_PANELS[t]).join(','));

  console.log('\nADMIN SIDEBAR');
  useStore.setState({ currentView: 'manager', userRole: 'admin', username: 'ann', pages: PAGES });
  mount(React.createElement(AdminLayout, null, React.createElement('p', null, 'child')));
  const nav = await waitFor(() => $('nav.ui-nav'));
  check('sections: Pages, Collections, Templates, Media, Menu, Global Options', ['Pages', 'Collections', 'Templates', 'Media', 'Menu', 'Global Options'].every((l) => btn(l, nav)));
  check('admins also see Submissions, Accounts and Backup', ['Submissions', 'Accounts', 'Backup'].every((l) => btn(l, nav)));
  check('the current section is marked (aria-current)', btn('Pages', nav).getAttribute('aria-current') === 'page');
  click(btn('Media', nav));
  check('clicking a section opens it', st().currentView === 'media');
  const viewSite = $$('.ui-sidebar a').find((a) => /View Site/.test(a.textContent));
  check('"View Site" under Publish Site opens the published home page in a new tab', !!viewSite && viewSite.getAttribute('href') === '../' && viewSite.getAttribute('target') === '_blank' && /noopener/.test(viewSite.getAttribute('rel'))
    && viewSite.closest('div') === btnHas('Publish Site').closest('div'));
  check('user, logout and version in the sidebar', /ann/.test($('.ui-sidebar__foot').textContent) && !!$('[aria-label="Log out"]') && !!$('[aria-label="Change your password"]') && /CanvasCore v/.test($('.ui-sidebar__foot').textContent));
  useStore.setState({ userRole: 'editor' });
  await sleep(30);
  check('editors do not see the administration group', !btn('Accounts', $('nav.ui-nav')) && !btn('Backup', $('nav.ui-nav')));

  console.log('\nPAGES');
  useStore.setState({ currentView: 'manager', userRole: 'admin', pages: PAGES });
  mount(React.createElement(PageManager));
  const rows = () => $$('tbody tr');
  await waitFor(() => rows().length === 3);
  check('all pages listed, most recently updated first', rows().length === 3 && rows()[0].textContent.includes('About us'));
  check('status filters with counts', ['All 3', 'Published 1', 'Modified 1', 'Drafts 1'].every((l) => btn(l)));
  click(btn('Drafts 1')); await sleep(30);
  check('filter: drafts only', rows().length === 1 && rows()[0].textContent.includes('Contact'));
  click(btn('All 3')); await sleep(30);
  typeIn($('input[type="search"]'), 'abou'); await sleep(30);
  check('search by title', rows().length === 1 && rows()[0].textContent.includes('About us'));
  typeIn($('input[type="search"]'), 'contact'); await sleep(30);
  check('search by URL', rows().length === 1);
  typeIn($('input[type="search"]'), ''); await sleep(30);
  check('the homepage is marked', rows().some((r) => r.textContent.includes('Home') && r.querySelector('.ui-badge--accent')));
  click($('button[aria-label="Duplicate About us"]'));
  await waitFor(() => st().pages.length === 4);
  const copy = st().pages[0];
  const saved = calls.find((c) => c.u.includes('save_page'));
  check('duplicate: a new draft "(copy)" with a free slug and the same content', copy.title === 'About us (copy)' && copy.status === 'draft' && copy.slug !== 'about' && saved && JSON.parse(saved.body).blocks.length === 1, JSON.stringify([copy.title, copy.slug]));
  check('…and a notification instead of a blocking alert', !!(await waitFor(() => $('.ui-toast'))));

  console.log('\nEDITOR');
  localStorage.clear();
  const hero = { id: 'h1', type: 'HERO', styles: { ...blockDefs.types.HERO.styles }, content: { ...blockDefs.types.HERO.content } };
  const section = { id: 's1', type: 'SECTION', styles: {}, content: {}, children: [] };
  useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, blocks: [hero, section], selectedBlockId: null, isEditingMaster: false, editorRestored: false, pastBlocks: [], futureBlocks: [], templates: [], masters: [], userRole: 'editor', viewport: 'desktop' });
  calls.length = 0;
  mount(React.createElement(VisualEditor));
  const top = await waitFor(() => $('header.cc-ed-top'));
  check('top bar: back to Pages, page title and status', !!btnHas('Pages', top) && top.textContent.includes('Contact') && !!top.querySelector('.ui-badge--draft'));
  check('top bar: preview sizes, undo/redo, Save Draft and Publish', ['Desktop', 'Tablet', 'Mobile'].every((t) => top.querySelector(`button[title="${t}"]`)) && !!top.querySelector('[aria-label^="Undo"]') && !!btnHas('Save Draft', top) && !!btnHas('Publish', top));
  await sleep(60); // effects (keyboard shortcuts) are attached after the first paint
  click(top.querySelector('button[title="Mobile"]'));
  check('preview size switch', st().viewport === 'mobile');
  const viewPage = top.querySelector('button[aria-label^="Not published yet"]');
  check('a "view page" button, disabled while the page has never been published', !!viewPage && viewPage.disabled);
  const { livePageUrl } = await vite.ssrLoadModule('/src/editor/liveUrl.js');
  const pg = [{ id: 'p1', status: 'modified', clean_slug: 'about', is_home: 0 }, { id: 'p0', status: 'published', clean_slug: 'home', is_home: 1 }];
  check('…its address: the live page, a draft copy\'s parent, the home page, a published item', livePageUrl({ id: 'p1', status: 'modified', clean_slug: 'about' }, pg) === '../about/'
    && livePageUrl({ id: 'd', is_draft_copy: 1, parent_id: 'p1', clean_slug: 'renamed' }, pg) === '../about/' && livePageUrl(pg[1], pg) === '../'
    && livePageUrl({ __item: true, status: 'published', slug: 'post' }, pg, 'blog') === '../blog/post/' && livePageUrl({ __item: true, status: 'draft', slug: 'post' }, pg, 'blog') === null
    && livePageUrl({ id: 'n', status: 'draft', clean_slug: 'new' }, pg) === null && livePageUrl({ __part: 'header' }, pg) === '../');
  const canvasEl = $('.cc-canvas');
  check('phone preview: the canvas is a container, so the blocks\' mobile rules apply as on a phone', canvasEl.style.containerType === 'inline-size' && canvasEl.style.boxSizing === 'border-box');
  const { toContainerQueries } = await vite.ssrLoadModule('/src/editor/devicePreview.js');
  check('…width media queries become container queries (other media features stay)', toContainerQueries('@media(max-width: 768px){a{b:c}}@media (min-width:769px){x{}}@media(hover:none){y{}}') === '@container cc-canvas (max-width: 768px){a{b:c}}@container cc-canvas (min-width: 769px){x{}}@media(hover:none){y{}}');
  useStore.setState({ blocks: [hero, section, { id: 'bt1', type: 'BUTTON', styles: { ...blockDefs.types.BUTTON.styles }, content: { ...blockDefs.types.BUTTON.content } }] });
  click(top.querySelector('button[title="Desktop"]')); await sleep(40);
  const btnA = await waitFor(() => $('.cc-canvas .cc-btn-wrap > a.cc-btn'));
  check('a Button keeps its own size in the canvas (not stretched to the full width, as on the published page)', !!btnA && !/width:\s*100%/.test(btnA.getAttribute('style')) && /display: inline-block/.test(btnA.getAttribute('style')), btnA && btnA.getAttribute('style'));
  check('desktop: the canvas uses the published wrapper\'s box model and plain media queries', !$('.cc-canvas').style.containerType && $('.cc-canvas').style.boxSizing === 'border-box');
  check('the canvas uses the published default font (Inter) when no site font is set', /Inter/.test($('.cc-canvas').style.getPropertyValue('--font-family')));
  useStore.setState({ blocks: [hero, section] });
  click(top.querySelector('button[title="Mobile"]')); await sleep(30);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  check('Ctrl+S saves the draft', !!(await waitFor(() => calls.some((c) => c.u.includes('save_page')))));
  check('…with a notification', !!(await waitFor(() => $$('.ui-toast').some((t) => /Draft saved/.test(t.textContent)))));
  st().setSelectedBlockId('h1'); await sleep(30);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc deselects the block', st().selectedBlockId === null);
  const left = $('.cc-ed-left');
  click($('button[aria-label="Hide the left panel"]')); await sleep(30);
  check('the left panel can be hidden (canvas gets the space)', left.getAttribute('data-open') === 'false' && JSON.parse(localStorage.getItem('cc_editor_panels')).left === false);
  click($('button[aria-label="Show the left panel"]')); await sleep(30);

  console.log('\nADD PANEL');
  check('blocks grouped in categories', ['Layout', 'Basic', 'Sections', 'Interactive', 'Lists & data', 'Business & dynamic'].every((c) => $$('.cc-ed-left button').some((b) => b.textContent.startsWith(c))));
  check('admin-only blocks hidden for editors (Custom HTML)', !btnHas('Custom HTML', $('.cc-ed-left')));
  typeIn($('.cc-ed-left input[type="search"]'), 'map'); await sleep(30);
  const tiles = () => $$('.cc-add-tile').map((b) => b.textContent.trim());
  check('search finds blocks by name or keyword ("map" → Map)', tiles().includes('Map') && !tiles().includes('Hero'), tiles().join(','));
  typeIn($('.cc-ed-left input[type="search"]'), 'carousel'); await sleep(30);
  check('…by keyword ("carousel" → Slider)', tiles().join(',') === 'Slider', tiles().join(','));
  st().setSelectedBlockId('s1'); await sleep(30);
  check('tells where blocks will go (inside the selected Section)', /inside the selected Section/.test($('.cc-ed-left').textContent));
  click($$('.cc-add-tile').find((b) => b.textContent.trim() === 'Slider'));
  check('adding puts the block inside the selected container', st().blocks[1].children.length === 1 && st().blocks[1].children[0].type === 'SLIDER');

  console.log('\nPROPERTY PANEL');
  useStore.setState({ selectedBlockId: 'h1', userRole: 'admin' });
  mount(React.createElement(PropertyPanel));
  const head = await waitFor(() => $('.cc-pp-head'));
  check('header shows the block name from the catalog', !!head && head.textContent.includes('Hero'));
  const masterBtn = head.querySelector('button[aria-label^="Make it a global master"]');
  check('"make it a master" is an icon button without the "Master" label', !!masterBtn && masterBtn.textContent.trim() === '' && !!masterBtn.querySelector('svg'));
  check('tabs Content / Style / Advanced', ['Content', 'Style', 'Advanced'].every((t) => $$('[role="tab"]').some((b) => b.textContent.trim() === t)));
  check('the first Content section starts open', $$('.ui-section')[0].getAttribute('data-open') === 'true');
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(30);
  check('Spacing (margin & padding) is in the Style tab', !!btnHas('Spacing (Margin & Padding)'));
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Advanced')); await sleep(30);
  check('Advanced has entrance / hover / looping effects and custom code', ['Entrance Animation', 'Hover Effect', 'Looping Motion', 'Custom Code'].every((t) => !!btnHas(t)) && !btnHas('Spacing (Margin & Padding)'));
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Content')); await sleep(30);
  useStore.setState({ selectedBlockId: 's1' }); await sleep(30);
  check('a Section (no Content tab) falls back to Style', !$$('[role="tab"]').some((b) => b.textContent.trim() === 'Content') && $$('[role="tab"]').find((b) => b.getAttribute('aria-selected') === 'true').textContent.trim() === 'Style');
  useStore.setState({ selectedBlockId: null }); await sleep(30);
  check('no selection → page settings, Page Info open', !!btnHas('Page Info') && btnHas('Page Info').getAttribute('aria-expanded') === 'true');

  console.log('\nEFFECTS & BUTTONS');
  const pick = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const selByLabel = (txt) => { const l = $$('label').find((x) => x.textContent.trim() === txt); return l && l.parentElement.querySelector('select'); };
  const openSec = async (t) => { const b = btnHas(t); if (b && b.getAttribute('aria-expanded') !== 'true') { click(b); await sleep(30); } };
  const blk = (id) => (function find(list) { for (const b of list) { if (b.id === id) return b; const r = b.children && find(b.children); if (r) return r; } return null; })(st().blocks);
  useStore.setState({ selectedBlockId: 'h1' }); await sleep(30);
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Advanced')); await sleep(30);
  pick(selByLabel('When the block scrolls into view'), 'bounce-in'); await sleep(30);
  check('entrance animation is saved', blk('h1').styles.animation === 'bounce-in');
  pick(selByLabel('Delay'), '300'); await sleep(30);
  pick(selByLabel('Speed'), 'slow'); await sleep(30);
  await openSec('Hover Effect'); pick(selByLabel('When the mouse is over the block'), 'lift'); await sleep(30);
  await openSec('Looping Motion'); pick(selByLabel('Keeps moving gently'), 'float'); await sleep(30);
  const hc = blk('h1').content;
  check('speed, delay, hover and loop are saved on the block', hc.animDelay === '300' && hc.animDuration === 'slow' && hc.hoverEffect === 'lift' && hc.loopEffect === 'float', JSON.stringify(hc));
  check('a Preview animation button is offered', !!btnHas('Preview animation'));
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Content')); await sleep(30);
  await openSec('Hero Buttons');
  const card = () => $$('span').find((x) => x.textContent === 'Button 1').closest('div').parentElement;
  click(btn('Outline', card())); await sleep(30);
  let b0 = blk('h1').content.buttons[0];
  check('hero button Outline = transparent fill with a border', b0.bgColor === 'transparent' && !!b0.borderColor && b0.textColor === b0.borderColor, JSON.stringify(b0));
  click(btn('Solid', card())); await sleep(30);
  check('hero button Solid gets a fill again', blk('h1').content.buttons[0].bgColor !== 'transparent' && !blk('h1').content.buttons[0].borderColor);
  click(btn('Transparent', card())); await sleep(30);
  check('hero button background has a Transparent option', blk('h1').content.buttons[0].bgColor === 'transparent');
  pick($$('select', card()).find((x) => [...x.options].some((o) => o.value === 'shine')), 'shine'); await sleep(30);
  check('hero button hover effect is saved', blk('h1').content.buttons[0].effect === 'shine');

  const bt = { id: 'bt1', type: 'BUTTON', styles: {}, content: { text: 'Go', url: '#', useGlobal: true } };
  const cards = { id: 'c1', type: 'CARDS', styles: {}, content: { items: ['<h3>a</h3>', '<h3>b</h3>', '<h3>c</h3>'] } };
  useStore.setState({ blocks: [...st().blocks, bt, cards], selectedBlockId: 'bt1', viewport: 'desktop' }); await sleep(30);
  pick($$('select').find((x) => [...x.options].some((o) => o.value === 'lg')), 'lg'); await sleep(30);
  check('button size sets padding and font size together', blk('bt1').styles.padding === '18px 36px' && blk('bt1').styles.fontSize === '20px', JSON.stringify(blk('bt1').styles));
  // styles per device: on the phone preview the same control writes phone overrides, desktop stays as it is
  useStore.setState({ viewport: 'mobile' }); await sleep(30);
  pick($$('select').find((x) => [...x.options].some((o) => o.value === 'sm')), 'sm'); await sleep(30);
  check('on the phone preview a style change becomes a phone override (desktop unchanged)', blk('bt1').styles.padding === '18px 36px' && blk('bt1').responsive?.mobile?.padding === '8px 16px' && blk('bt1').responsive?.mobile?.fontSize === '14px', JSON.stringify(blk('bt1').responsive));
  useStore.setState({ viewport: 'desktop' }); await sleep(30);
  // Style tab borders: a thickness alone must show a border (the Style list shows "Solid" when none is stored)
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(30);
  if (!$$('input').some((i) => i.getAttribute('placeholder') === 'e.g. 2px')) { click(btnHas('Borders')); await sleep(30); }
  const bw = $$('input').find((i) => i.getAttribute('placeholder') === 'e.g. 2px');
  typeIn(bw, '3px'); await sleep(30);
  check('setting a border thickness in the Style tab also stores the "solid" style shown, so the border appears', blk('bt1').styles.borderWidth === '3px' && blk('bt1').styles.borderStyle === 'solid', JSON.stringify(blk('bt1').styles));
  check('a Button block gets no "its buttons are styled in Content" note', !$('.cc-style-note'));
  useStore.setState({ selectedBlockId: 'h1' }); await sleep(30);
  check('a Hero\'s Style tab says its buttons are styled in the Content tab (a border here frames the whole Hero)', /whole Hero block/.test($('.cc-style-note')?.textContent || '') && /Content/.test($('.cc-style-note').textContent));
  useStore.setState({ selectedBlockId: 'bt1' }); await sleep(30);
  click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Content')); await sleep(30);
  await openSec('Hover');
  pick(selByLabel('Hover effect'), 'glow'); await sleep(30);
  check('button hover effect is saved', blk('bt1').content.btnEffect === 'glow');
  const { renderBlock } = await vite.ssrLoadModule('/src/render/renderBlock.mjs');
  const bh = renderBlock({ ...blk('bt1'), content: { ...blk('bt1').content, btnHoverBg: '#111111' } });
  check('rendered button carries the hover classes and color', bh.includes('class="cc-btn cc-hbg cc-bfx-glow"') && bh.includes('--cc-hover-bg:#111111'));
  useStore.setState({ selectedBlockId: 'c1' }); await sleep(30);
  check('a Cards block with 3 cards shows 3 on the slider', $$('label').some((l) => l.textContent.trim() === 'Number of cards: 3') && $('input[type="range"]').value === '3');

  console.log('\nLAYERS');
  const { placeInTree } = await vite.ssrLoadModule('/src/store/useStore.js');
  const { dropPosition } = await vite.ssrLoadModule('/src/editor/layerDrop.js');
  const tree = [{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }, { id: 'c', children: [] }];
  const ids = (t) => JSON.stringify(t, (k, v) => (k === 'id' || k === 'children' || Array.isArray(v) || typeof v === 'object' ? v : undefined));
  check('drop before / after a row', ids(placeInTree(tree, 'b', 'a', 'before')) === ids([{ id: 'b' }, { id: 'a', children: [{ id: 'a1' }] }, { id: 'c', children: [] }]) && ids(placeInTree(tree, 'a1', 'c', 'after')) === ids([{ id: 'a', children: [] }, { id: 'b' }, { id: 'c', children: [] }, { id: 'a1' }]));
  check('drop inside an (empty) container', ids(placeInTree(tree, 'b', 'c', 'inside')) === ids([{ id: 'a', children: [{ id: 'a1' }] }, { id: 'c', children: [{ id: 'b' }] }]));
  check('a container cannot go inside itself or its children; inside a non-container is refused', placeInTree(tree, 'a', 'a1', 'after') === null && placeInTree(tree, 'b', 'a1', 'inside') === null);
  check('pointer height → before / inside / after', dropPosition(0.1, true) === 'before' && dropPosition(0.5, true) === 'inside' && dropPosition(0.9, true) === 'after' && dropPosition(0.4, false) === 'before' && dropPosition(0.6, false) === 'after');
  const LayerNavigator = (await vite.ssrLoadModule('/src/components/LayerNavigator.jsx')).default;
  mount(React.createElement(LayerNavigator)); await sleep(40);
  const countAll = (list) => list.reduce((n, b) => n + 1 + countAll(b.children || []), 0);
  check('layers list every block with a drag handle, rows keep their size (no transforms)', $$('[role="treeitem"]').length === countAll(st().blocks) && $$('[aria-label^="Move "]').length === countAll(st().blocks) && !$$('[role="treeitem"]').some((r) => /scale/.test(r.parentElement.getAttribute('style') || '')));

  console.log('\nDIALOGS');
  {
    const key = (el, k, extra = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    useStore.setState({ currentView: 'manager', userRole: 'admin', pages: PAGES.map((p) => ({ ...p })) });
    mount(React.createElement(AdminLayout, null, React.createElement(PageManager))); await sleep(60);
    const delBtn = () => $('[aria-label="Delete Contact"]');
    click(delBtn());
    let dlg = await waitFor(() => $('[role="alertdialog"]'));
    check('deleting a page asks in an in-app dialog (no browser confirm)', !!dlg && /Delete the page "Contact"\?/.test(dlg.textContent) && dlg.getAttribute('aria-modal') === 'true');
    check('destructive action: red button with a clear label, focus starts on Cancel', !!btn('Delete page', dlg) && btn('Delete page', dlg).className.includes('danger') && doc.activeElement === btn('Cancel', dlg));
    key(doc.activeElement, 'Tab'); key(doc.activeElement, 'Tab');
    check('Tab stays inside the dialog', dlg.contains(doc.activeElement));
    click(btn('Cancel', dlg)); await sleep(40);
    check('Cancel closes it and nothing is deleted', !$('[role="alertdialog"]') && st().pages.some((p) => p.id === 'p3'));
    click(delBtn()); dlg = await waitFor(() => $('[role="alertdialog"]'));
    key(dlg, 'Escape'); await sleep(40);
    check('Esc cancels too', !$('[role="alertdialog"]') && st().pages.some((p) => p.id === 'p3'));
    click(delBtn()); dlg = await waitFor(() => $('[role="alertdialog"]'));
    click(btn('Delete page', dlg)); await sleep(60);
    check('Confirm deletes the page', !$('[role="alertdialog"]') && !st().pages.some((p) => p.id === 'p3'));

    const { promptDialog, confirmDialog } = await vite.ssrLoadModule('/src/ui/dialog.js');
    let answer = 'unset';
    promptDialog({ title: 'Save as template', label: 'Template name' }).then((v) => { answer = v; });
    const pd = await waitFor(() => $('[role="dialog"].ui-dialog'));
    const input = pd && pd.querySelector('input');
    check('prompt dialog: the text field has the focus, OK is disabled while empty', doc.activeElement === input && btn('OK', pd).disabled);
    typeIn(input, '  Hero block  '); await sleep(20);
    key(input, 'Enter'); await sleep(30);
    check('Enter confirms and gives back the trimmed text', answer === 'Hero block');
    const order = [];
    confirmDialog({ title: 'First?' }).then((v) => order.push('1:' + v));
    confirmDialog({ title: 'Second?' }).then((v) => order.push('2:' + v));
    await sleep(30);
    check('dialogs asked together are shown one at a time', $$('.ui-dialog').length === 1 && /First\?/.test($('.ui-dialog').textContent));
    click(btn('OK', $('.ui-dialog'))); await sleep(30);
    click(btn('Cancel', $('.ui-dialog'))); await sleep(30);
    check('…in order, each with its own answer', order.join(',') === '1:true,2:false', order.join(','));
  }

  console.log('\nPRODUCT FIXES');
  {
    const tabBtn = (t) => $$('[role="tab"]').find((b) => b.textContent.trim() === t);
    const blk2 = (id) => (function find(list) { for (const b of list) { if (b.id === id) return b; const r = b.children && find(b.children); if (r) return r; } return null; })(st().blocks);
    const flex = { id: 'fr1', type: 'FLEX_ROW', styles: { display: 'flex', gap: '20px', flexWrap: 'wrap' }, content: {}, children: [] };
    const html = { id: 'hb1', type: 'HTML', styles: {}, content: { code: '<b>admin code</b>' } };
    const video = { id: 'vd1', type: 'VIDEO', styles: {}, content: { url: 'https://example.com/clip' } };
    const form = { id: 'fm1', type: 'FORM', styles: {}, content: { title: '<h3>T</h3>', fields: [{ label: 'A', type: 'text' }, { label: 'B', type: 'text' }] } };
    useStore.setState({ blocks: [flex, html, video, form], selectedBlockId: 'fr1', userRole: 'editor', pastBlocks: [], futureBlocks: [] });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    check('Flex Row has a Content tab with its layout (direction, space, alignment, wrap)', !!tabBtn('Content') && !!btnHas('Row Layout') && ['Direction', 'Space between blocks', 'Horizontal alignment', 'Vertical alignment'].every((l) => $$('label').some((x) => x.textContent.trim() === l)));
    const dir = $$('label').find((x) => x.textContent.trim() === 'Direction').parentElement.querySelector('select');
    pick(dir, 'column'); await sleep(30);
    check('…and it changes the row\'s styles', blk2('fr1').styles.flexDirection === 'column');
    useStore.setState({ selectedBlockId: 'hb1' }); await sleep(40);
    const ta = $('.cc-ed-right textarea, textarea');
    check('Custom HTML is read-only for editors, with an explanation', !!ta && ta.readOnly && /Only admins can change custom code/.test(doc.body.textContent));
    useStore.setState({ selectedBlockId: 'vd1' }); await sleep(40);
    check('a link that is not YouTube/Vimeo shows a warning', /doesn't look like a YouTube or Vimeo/.test(doc.body.textContent));
    useStore.setState({ selectedBlockId: 'fm1' }); await sleep(40);
    check('editors don\'t see the form\'s receiving email; everyone gets "Message after sending"', !$$('label').some((x) => x.textContent.trim() === 'Receiving Email') && $$('label').some((x) => x.textContent.trim() === 'Message after sending'));
    await openSec('Form Fields');
    const typeSel = $$('select').find((x) => [...x.options].some((o) => o.value === 'tel'));
    check('form fields offer phone, website and date types', !!typeSel && ['tel', 'url', 'date'].every((v) => [...typeSel.options].some((o) => o.value === v)));
    click($$('button[title="Move down"]')[0]); await sleep(30);
    check('form fields can be reordered', blk2('fm1').content.fields.map((f) => f.label).join('') === 'BA');
    useStore.setState({ userRole: 'admin' });

    const ChangePasswordDialog = (await vite.ssrLoadModule('/src/components/ChangePasswordDialog.jsx')).default;
    let closed = false;
    mount(React.createElement(ChangePasswordDialog, { onClose: () => { closed = true; } })); await sleep(40);
    const pw = $$('.ui-dialog input[type="password"]');
    check('change password: current + new twice, button disabled until valid', pw.length === 3 && btn('Change password').disabled);
    typeIn(pw[0], 'oldpass1'); typeIn(pw[1], 'short'); await sleep(20);
    check('…too short is explained', /At least 8 characters/.test($('.ui-dialog').textContent));
    typeIn(pw[1], 'newpass123'); typeIn(pw[2], 'newpass123'); await sleep(20);
    check('…valid → can submit', !btn('Change password').disabled && !closed);
  }

  console.log('\nEDITOR PRODUCTIVITY');
  {
    const key = (k, extra = {}) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    const ids = () => st().blocks.map((b) => b.id);
    const sec = { id: 'sx1', type: 'SECTION', styles: {}, content: {}, children: [{ id: 'in1', type: 'TEXT', styles: {}, content: { text: '<p>in</p>' } }] };
    const hero = { id: 'h9', type: 'HERO', styles: {}, content: { title: '<h1>H</h1>', buttons: [{ id: 'bb1', text: 'Go', url: '#' }] } };
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, blocks: [hero, sec, { id: 't9', type: 'TEXT', styles: {}, content: { text: '<p>t</p>' } }], selectedBlockId: 'sx1', pastBlocks: [], futureBlocks: [], isEditingMaster: false, userRole: 'admin' });
    try { localStorage.removeItem('cc_block_clipboard'); } catch { /* */ }
    mount(React.createElement(VisualEditor)); await waitFor(() => $('[aria-label="Version history"]')); await sleep(150);
    key('d', { ctrlKey: true }); await sleep(30);
    const dup = st().blocks[2];
    check('Ctrl+D duplicates the selected block right after it, with new ids inside too', ids().length === 4 && dup.type === 'SECTION' && dup.id !== 'sx1' && dup.children[0].id !== 'in1' && st().selectedBlockId === dup.id);
    key('ArrowUp', { altKey: true }); await sleep(30);
    check('Alt+↑ moves it up among its siblings', st().blocks[1].id === dup.id);
    key('Delete'); await sleep(30);
    check('Delete removes the selected block (undoable)', !ids().includes(dup.id) && ids().length === 3);
    key('z', { ctrlKey: true }); await sleep(30);
    check('…Ctrl+Z brings it back', ids().includes(dup.id));
    useStore.setState({ selectedBlockId: 'h9' }); await sleep(20);
    key('c', { ctrlKey: true }); await sleep(30);
    check('Ctrl+C copies the block to a clipboard that survives page changes', !!JSON.parse(localStorage.getItem('cc_block_clipboard') || 'null'));
    useStore.setState({ activePage: { ...PAGES[1] }, blocks: [{ id: 'q1', type: 'TEXT', styles: {}, content: {} }], selectedBlockId: 'q1', pastBlocks: [] }); await sleep(40);
    click($('.ui-tab[aria-selected]') && $$('.ui-tab').find((b) => /Add/.test(b.textContent))); await sleep(30);
    check('the Add tab offers "Paste copied Hero"', !!btnHas('Paste copied Hero'));
    key('v', { ctrlKey: true }); await sleep(30);
    const pasted = st().blocks[1];
    check('Ctrl+V pastes it after the selected block on another page, with fresh ids', !!pasted && pasted.type === 'HERO' && pasted.id !== 'h9' && pasted.content.buttons[0].id !== 'bb1');

    click($('[aria-label="Version history"]'));
    const hist = await waitFor(() => $('.cc-history'));
    await waitFor(() => $$('.cc-history__item').length === 2);
    check('Version history lists the saved versions (published / draft, who, when)', $$('.cc-history__item').length === 2 && /Published/.test($$('.cc-history__item')[0].textContent) && /bob/.test($$('.cc-history__item')[1].textContent));
    click($$('.cc-history__item')[1]);
    await waitFor(() => /Old version text/.test(($('.cc-history__frame') || {}).textContent || ''));
    check('…picking one shows a preview', /Old version text/.test($('.cc-history__frame').textContent));
    click(btnHas('Restore this version', hist));
    const cd = await waitFor(() => $('[role="alertdialog"]'));
    click(btn('Restore version', cd)); await sleep(60);
    check('…Restore puts it in the editor as an unsaved change (one undo step)', st().blocks.length === 1 && st().blocks[0].content.text === '<p>Old version text</p>' && !$('.cc-history'));
    st().undo();
    check('…and Ctrl+Z undoes the restore', st().blocks.length === 2);
  }

  console.log('\nIMAGES');
  {
    const MediaManager = (await vite.ssrLoadModule('/src/components/MediaManager.jsx')).default;
    mount(React.createElement(MediaManager));
    await waitFor(() => $$('figure').length === 3);
    const card = (name) => $$('figure').find((f) => f.querySelector('.cc-media-card__name').textContent === name);
    check('the library shows size, file size and "Optimized"', /2000×1000/.test(card('sky.jpg').textContent) && /337 KB/.test(card('sky.jpg').textContent) && /Optimized/.test(card('sky.jpg').textContent) && !/Optimized/.test(card('old.png').textContent));
    const altIn = card('old.png').querySelector('input[aria-label^="Description"]');
    typeIn(altIn, 'Old logo'); altIn.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); await sleep(40);
    const saved = calls.filter((c) => c.u.includes('save_media_meta')).pop();
    check('an image description is saved when you leave the field', !!saved && JSON.parse(saved.body).alt === 'Old logo' && JSON.parse(saved.body).name === 'old.png');
    const opt = btnHas('Optimize 1 older image');
    check('"Optimize older images" appears when some aren\'t optimized', !!opt);
    click(opt); await waitFor(() => calls.some((c) => c.u.includes('optimize_media'))); await sleep(60);
    check('…and runs the optimization on the server', calls.some((c) => c.u.includes('optimize_media')));
  }

  console.log('\nMEDIA LIBRARY: FOLDERS, SELECTION, UPLOADS');
  {
    const MediaManager = (await vite.ssrLoadModule('/src/components/MediaManager.jsx')).default;
    mount(React.createElement(MediaManager));
    await waitFor(() => $$('figure').length === 3);
    const card = (name) => $$('figure').find((f) => f.querySelector('.cc-media-card__name').textContent === name);
    const lc = card(LONG);
    check('a long file name is cut with "…" and its buttons stay inside the card (copy, move, delete)',
      lc.querySelector('.cc-media-card__name').title === LONG && lc.querySelectorAll('.cc-media-card__actions button').length === 3
      && /cc-media-card__name \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/.test(readFileSync(path.join(PROJECT, 'src/ui/kit.css'), 'utf8')));
    check('newest first by default', $$('.cc-media-card__name').map((n) => n.textContent)[0] === LONG);
    const folderBtn = (label) => $$('.cc-media-folder__btn').find((b) => b.querySelector('.cc-media-folder__name').textContent === label);
    check('folders on the left with counts (All, Not in a folder, Products, Shoes)', /3/.test(folderBtn('All images').textContent) && /2/.test(folderBtn('Not in a folder').textContent) && !!folderBtn('Products') && !!folderBtn('Shoes'));
    click(folderBtn('Products')); await sleep(30);
    check('opening a folder shows its images and its sub-folders', $$('figure').length === 1 && !!$$('.cc-media-subfolder').find((b) => /Shoes/.test(b.textContent)));
    click(folderBtn('All images')); await sleep(30);
    // selection: click one, Shift+click another selects the range
    const box = (name) => card(name).querySelector('input[type="checkbox"]');
    click(box(LONG)); await sleep(10);
    box('old.png').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); await sleep(30);
    check('selecting images (Shift+click selects the range in between)', /3 selected/.test($('.cc-media-selbar').textContent));
    click(btnHas('Move to folder…'));
    const md = await waitFor(() => $('[aria-labelledby="cc-move-title"]'));
    check('"Move to folder…" lists the folders', !!md && [...md.querySelectorAll('option')].some((o) => o.value === 'Products/Shoes'));
    pick(md.querySelector('select'), 'Products/Shoes'); await sleep(10);
    click(btn('Move', md)); await sleep(60);
    const mv = calls.filter((c) => c.u.includes('media_move')).pop();
    check('…moves all the selected images at once', !!mv && JSON.parse(mv.body).names.length === 3 && JSON.parse(mv.body).folder === 'Products/Shoes');
    await waitFor(() => $$('figure').length === 3);
    click(card('sky.jpg').querySelector('input[type="checkbox"]')); click(card('old.png').querySelector('input[type="checkbox"]')); await sleep(30);
    click(btnHas('Delete', $('.cc-media-selbar')));
    const dd = await waitFor(() => $('[role="alertdialog"]'));
    check('deleting several images asks once, and warns where they are still used', !!dd && /Delete 2 images\?/.test(dd.textContent) && /Page: Home/.test(dd.textContent));
    click(btn('Delete 2 images', dd)); await sleep(60);
    const del = calls.filter((c) => c.u.includes('delete_media')).pop();
    check('…and deletes them in one go', !!del && JSON.parse(del.body).names.length === 2);
    // uploads with a progress panel (fetch path: no XMLHttpRequest in this test)
    const fileInput = $('input[type="file"]');
    const F = globalThis.File || w.File; const f1 = new F(['x'], 'one.jpg', { type: 'image/jpeg' }); const f2 = new F(['y'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [f1, f2], configurable: true });
    fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
    const panel = await waitFor(() => $('.cc-upload-panel') && /1 uploaded, 1 failed/.test($('.cc-upload-panel').textContent) && $('.cc-upload-panel'), 3000);
    check('uploading shows a panel with each file, its progress and the result', !!panel && /one\.jpg/.test(panel.textContent) && /Not an image/.test(panel.textContent));
    click($('.cc-upload-panel [aria-label="Close"]')); await sleep(20);
    check('…which closes when you are done', !$('.cc-upload-panel'));
  }

  {
    // picking an image fills the block's alt text when it is empty
    useStore.setState({ blocks: [{ id: 'im1', type: 'IMAGE', styles: {}, content: { src: '', alt: '' } }], selectedBlockId: 'im1' });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    click($('[aria-label="Choose from the media library"]'));
    const item = await waitFor(() => $('.cc-picker__item[aria-label="Choose Blue sky"]'));
    check('the picker shows the library with sizes and a search box', !!item && /2000×1000/.test($('.cc-picker').textContent) && !!$('.cc-picker input[type="search"], .cc-picker .ui-search input'));
    if (item) click(item);
    await sleep(40);
    check('…and picking an image also fills the empty alt text', st().blocks[0].content.src === '/uploads/sky.jpg' && st().blocks[0].content.alt === 'Blue sky', JSON.stringify(st().blocks[0].content));
  }

  console.log('\nSEO & SITE FEATURES');
  {
    const { CONTENT_PANELS: CP } = await vite.ssrLoadModule('/src/components/panel/blocks/index.js');
    check('Site Search is in the Add catalog and has a settings panel', BLOCKS.some((b) => b.type === 'SEARCH') && !!CP.SEARCH);
    useStore.setState({ selectedBlockId: null, activePage: { ...PAGES[1], seo_title: 'About us — the team', seo_description: '' }, userRole: 'admin' });
    mount(React.createElement(PropertyPanel)); await sleep(50);
    await openSec('SEO & Meta Data');
    check('SEO: character counts and search/share previews', /19 \/ 60/.test(doc.body.textContent) && !!$('[aria-label="Search result preview"]') && !!$('[aria-label="Shared link preview"]'));
    const hide = $$('label').find((l) => /Hide this page from search engines/.test(l.textContent)).querySelector('input');
    click(hide); await sleep(30);
    check('"Hide this page from search engines" is stored on the page', Number(st().activePage.noindex) === 1);
    useStore.setState({ currentView: 'settings', pages: PAGES });
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default)));
    await waitFor(() => btnHas('Save & Publish') && !btnHas('Save & Publish').disabled, 3000);
    const cookieBox = $$('label').find((l) => /Show the cookie banner/.test(l.textContent));
    check('Global Options has a Cookie banner card', !!cookieBox);
    if (cookieBox) { click(cookieBox.querySelector('input')); await sleep(30); }
    check('…with text, buttons, privacy page and position once enabled', ['Accept button', 'Decline button', 'Privacy policy page', 'Position'].every((t) => $$('label').some((l) => l.textContent.trim() === t)));
    const annBox = $$('label').find((l) => /Show the announcement bar on every page/.test(l.textContent));
    check('Global Options has an Announcement bar card', !!annBox);
    if (annBox) { click(annBox.querySelector('input')); await sleep(30); }
    const annLab = (t) => $$('label').find((l) => l.textContent.trim() === t);
    check('…with message, link, colors and alignment once enabled (and nothing before)', ['Message', 'Link text (empty = no link)', 'Link to a page', 'Link address', 'Colors', 'Alignment'].every((t) => !!annLab(t)));
    check('…without a message there is no preview yet', !$('.cc-ann-preview'));
    const annMsg = annLab('Message') && doc.getElementById(annLab('Message').getAttribute('for'));
    if (annMsg) { typeIn(annMsg, 'Big sale <b>today</b>'); await sleep(40); }
    const annPrev = $('.cc-ann-preview');
    check('…then a preview drawn by the same renderer as the published bar, with the text escaped (no markup, no script)', !!annPrev && annPrev.textContent.includes('Big sale <b>today</b>') && !annPrev.querySelector('b') && !annPrev.querySelector('script') && !!annPrev.querySelector('.cc-announce'));
    check('admins see the Redirects card', /Redirects/.test(doc.body.textContent) && !!btnHas('Add redirect'));
  }

  console.log('\nMEDIA LIBRARY: AUDIO AND VIDEO');
  {
    MEDIA.push({ name: '1700000100_clip.mp4', kind: 'video', url: '/uploads/1700000100_clip.mp4', folder: '', mtime: 1700000100, alt: '', w: 0, h: 0, bytes: 5242880, optimized: true, variants: [] },
      { name: '1700000200_episode.mp3', kind: 'audio', url: '/uploads/1700000200_episode.mp3', folder: '', mtime: 1700000200, alt: '', w: 0, h: 0, bytes: 3145728, optimized: true, variants: [] });
    const MediaManager = (await vite.ssrLoadModule('/src/components/MediaManager.jsx')).default;
    mount(React.createElement(MediaManager));
    await waitFor(() => $$('figure').length === 5);
    const card = (name) => $$('figure').find((f) => f.querySelector('.cc-media-card__name').textContent === name);
    check('audio and video are listed next to the images, as tiles (no <img>, nothing loaded), with their type and size', !!card('1700000100_clip.mp4').querySelector('.cc-media-tile[data-kind="video"]') && !card('1700000100_clip.mp4').querySelector('img') && !!card('1700000200_episode.mp3').querySelector('.cc-media-tile[data-kind="audio"]') && /Video/.test(card('1700000100_clip.mp4').textContent) && /5\.0 MB/.test(card('1700000100_clip.mp4').textContent) && /MP3/.test(card('1700000200_episode.mp3').textContent));
    check('…without a description field or an "Optimized" badge (those are for images)', !card('1700000100_clip.mp4').querySelector('input[aria-label^="Description"]') && !/Optimized/.test(card('1700000100_clip.mp4').textContent) && !!card('sky.jpg').querySelector('input[aria-label^="Description"]'));
    check('the upload button takes images, audio and video', /\.mp4/.test($('input[type="file"]').getAttribute('accept')) && /\.mp3/.test($('input[type="file"]').getAttribute('accept')) && /image\/\*/.test($('input[type="file"]').getAttribute('accept')));
    const show = $('select[aria-label="Show"]');
    show.value = 'video'; show.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(40);
    check('the "Show" filter narrows the library to video…', $$('figure').length === 1 && !!card('1700000100_clip.mp4'));
    show.value = 'audio'; show.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(40);
    check('…or audio…', $$('figure').length === 1 && !!card('1700000200_episode.mp3'));
    show.value = 'image'; show.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(40);
    check('…or images…', $$('figure').length === 3 && !card('1700000100_clip.mp4'));
    show.value = 'all'; show.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(40);
    check('…and "All files" shows everything again', $$('figure').length === 5);

    const MediaPickerModal = (await vite.ssrLoadModule('/src/components/MediaPickerModal.jsx')).default;
    const picked = [];
    mount(React.createElement(MediaPickerModal, { kind: 'video', onClose: () => {}, onSelect: (u) => picked.push(u) }));
    await waitFor(() => $$('.cc-picker__item').length === 1);
    check('the picker for a video block offers only videos, and says so', /Choose a video/.test(doc.body.textContent) && $$('.cc-picker__item').length === 1 && /clip\.mp4/.test($('.cc-picker__item').getAttribute('title')) && /\.mp4/.test($('input[type="file"]').getAttribute('accept')) && !/\.mp3/.test($('input[type="file"]').getAttribute('accept')));
    click($('.cc-picker__item')); await sleep(20);
    check('…and choosing one hands back its address', picked[0] === '/uploads/1700000100_clip.mp4');
    mount(React.createElement(MediaPickerModal, { kind: 'audio', onClose: () => {}, onSelect: () => {} }));
    await waitFor(() => $$('.cc-picker__item').length === 1);
    check('the picker for an audio block offers only audio, and says so ("Choose an audio file")', /Choose an audio file/.test(doc.body.textContent) && $$('.cc-picker__item').length === 1 && /episode\.mp3/.test($('.cc-picker__item').getAttribute('title')));
    mount(React.createElement(MediaPickerModal, { onClose: () => {}, onSelect: () => {} }));
    await waitFor(() => $$('.cc-picker__item').length === 3);
    check('the usual image picker still shows only images (3), as before', /Choose an image/.test(doc.body.textContent) && !$$('.cc-picker__item').some((b) => /clip|episode/.test(b.getAttribute('title'))) && /image\/\*/.test($('input[type="file"]').getAttribute('accept')));
    MEDIA.splice(MEDIA.length - 2, 2);
  }

  console.log('\nSITE BRANDING & ABOUT');
  {
    await st().fetchBranding();
    check('the store loads the site name and favicon (public "branding" action)', st().branding.siteName === 'Acme Bakery' && st().branding.faviconUrl === '/uploads/fav.png');
    useStore.setState({ currentView: 'manager', userRole: 'admin', username: 'ann' });
    mount(React.createElement(AdminLayout, null, React.createElement('p', null, 'child')));
    await waitFor(() => $('.ui-brand'));
    check('sidebar shows the site name instead of "CanvasCore"', /Acme Bakery/.test($('.ui-brand').textContent) && !/CanvasCore/.test($('.ui-brand').textContent));
    check('…with the site favicon as its logo', $('.ui-brand img')?.getAttribute('src') === '/uploads/fav.png');
    check('"CanvasCore" stays in the footer next to the version', /CanvasCore v/.test($('.ui-sidebar__foot').textContent));
    click($('[aria-label="About CanvasCore"]'));
    const about = await waitFor(() => $('[role="dialog"][aria-labelledby="cc-about-title"]'));
    const hrefs = about ? $$('a', about).map((a) => a.getAttribute('href')) : [];
    check('the ⓘ next to the version opens "About CanvasCore"', !!about && /Version /.test(about.textContent));
    check('…with links to sputlab.com, GitHub, Discord, the bug email and donations', ['https://www.sputlab.com', 'https://github.com/sputlab/CanvasCore', 'https://discord.gg/sD8KMc2kN', 'https://www.sputlab.com/donate'].every((h) => hrefs.includes(h)) && hrefs.some((h) => h.startsWith('mailto:bug@sputlab.com')) && /bug@sputlab\.com/.test(about.textContent));
    check('…and the license (GNU AGPL, links to the LICENSE file)', hrefs.includes('https://github.com/sputlab/CanvasCore/blob/main/LICENSE') && /AGPL/.test(about.textContent));
    const rowOf = (h) => $$('li', about).find((li) => li.querySelector(`a[href="${h}"]`));
    check('…GitHub and Discord show their own logos', ['https://github.com/sputlab/CanvasCore', 'https://discord.gg/sD8KMc2kN'].every((h) => { const svg = rowOf(h)?.querySelector('svg'); return svg && svg.getAttribute('viewBox') === '0 0 24 24' && svg.getAttribute('aria-hidden') === 'true' && !/lucide/.test(svg.getAttribute('class') || ''); }));
    check('…external links open in a new tab safely', $$('a[target="_blank"]', about).every((a) => /noopener/.test(a.getAttribute('rel'))));
    about.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(30);
    check('…and Escape closes it', !$('[aria-labelledby="cc-about-title"]'));

    const Login = (await vite.ssrLoadModule('/src/components/Login.jsx')).default;
    mount(React.createElement(Login)); await sleep(30);
    check('sign-in screen shows the site name and favicon', $('h1')?.textContent === 'Acme Bakery' && $('main img')?.getAttribute('src') === '/uploads/fav.png');
    const { useBrandingHead, brandIconUrl } = await vite.ssrLoadModule('/src/ui/branding.js');
    mount(React.createElement(() => { useBrandingHead(); return null; })); await sleep(30);
    check('browser tab: site name and favicon', doc.title === 'Acme Bakery · Admin' && doc.querySelector('link[rel="icon"]')?.getAttribute('href') === '/uploads/fav.png');
    check('favicon addresses: relative ones are resolved from the admin, unsafe ones dropped', brandIconUrl('uploads/a.png') === '../uploads/a.png' && brandIconUrl('javascript:alert(1)') === '' && brandIconUrl('https://x.test/f.ico') === 'https://x.test/f.ico' && brandIconUrl('//evil.test/x.png') === '');
    useStore.setState({ branding: { siteName: 'Acme Bakery', faviconUrl: '' } });
    mount(React.createElement(AdminLayout, null, 'x')); await sleep(30);
    check('no favicon set → the default app icon', !$('.ui-brand img') && !!$('.ui-brand svg'));

    useStore.setState({ currentView: 'settings', pages: PAGES });
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default)));
    await waitFor(() => btnHas('Save & Publish') && !btnHas('Save & Publish').disabled, 3000);
    check('Favicon and social image fields have "Upload image" and "Library"', !!$('[aria-label="Upload image: Favicon"]') && !!$('[aria-label="Upload image: Default social image"]') && $$('button').filter((b) => b.textContent.trim() === 'Library').length === 2);
    const favLabel = $$('label').find((l) => l.textContent.trim() === 'Favicon');
    const favInput = favLabel && doc.getElementById(favLabel.getAttribute('for'));
    const fileInput = $('[aria-label="Upload image: Favicon"]').parentElement.querySelector('input[type="file"]');
    const F = globalThis.File || w.File;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new F(['x'], 'icon.png', { type: 'image/png' })] });
    fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => favInput && favInput.value === '/uploads/123_new-icon.png', 2000);
    check('uploading a favicon fills its address (and the label still points at the field)', !!favInput && favInput.value === '/uploads/123_new-icon.png' && calls.some((c) => c.u.includes('upload_media')));
    click($('[aria-label="Choose from the media library: Default social image"]'));
    const pick = await waitFor(() => $('[aria-label="Choose Blue sky"]'));
    if (pick) click(pick);
    await sleep(30);
    const ogLabel = $$('label').find((l) => l.textContent.trim() === 'Default social image (OG)');
    check('"Library" picks an image from the media library', doc.getElementById(ogLabel.getAttribute('for'))?.value === '/uploads/sky.jpg');

    const css = readFileSync(path.join(PROJECT, 'src/ui/kit.css'), 'utf8');
    check('media selection bar has a solid background (readable text)', /\.cc-media-selbar \{[^}]*background: #1e293b/.test(css));
  }

  console.log('\nBACKUP');
  {
    const clicked = [];
    const origClick = w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click = function () { clicked.push(this.getAttribute('href')); };
    useStore.setState({ currentView: 'backup', userRole: 'admin' });
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/Backup.jsx')).default)));
    const list = await waitFor(() => $('[aria-label="Backups on the server"]'));
    check('the page lists the backups kept on the server, safety copies marked', !!list && $$('li', list).length === 2 && /Safety copy before a restore/.test(list.textContent) && /Saved copy/.test(list.textContent));
    check('…with what each contains and its size', /12 pages · 4 items · 37 image files · 5\.0 MB/.test(list.textContent) || /12 pages · 4 items · 37 image files/.test(list.textContent), list && list.textContent);
    check('says what a backup includes (images too) and that accounts never are', /every uploaded image/.test(doc.body.textContent) && /User accounts and passwords are never included/.test(doc.body.textContent));
    click($$('label').find((l) => /version history/.test(l.textContent)).querySelector('input')); await sleep(20);
    click(btnHas('Download backup (.zip)'));
    await waitFor(() => clicked.length, 2000);
    check('Download: the backup is made first (with the chosen options), then the browser downloads it', BACKUP_OPTS[0] && BACKUP_OPTS[0].temp === true && BACKUP_OPTS[0].history === false && BACKUP_OPTS[0].submissions === true && clicked[0] === 'api.php?action=backup_download&name=download-20261013-101500-ab12.zip', JSON.stringify([BACKUP_OPTS, clicked]));
    click(btnHas('Keep a copy on the server'));
    await waitFor(() => $$('li', $('[aria-label="Backups on the server"]')).length === 3, 2000);
    check('"Keep a copy on the server" adds it to the list', $$('li', $('[aria-label="Backups on the server"]')).length === 3 && BACKUP_OPTS[1].temp === false);
    const dlBtn = $$('button').find((b) => /^Download the backup of/.test(b.getAttribute('aria-label') || ''));
    click(dlBtn); await sleep(20);
    check('a saved backup can be downloaded', clicked[1] === 'api.php?action=backup_download&name=backup-20261013-101600-cd34.zip', clicked[1]);

    // restore from a file: sent in pieces under the server's upload limit (300 KB here), then restored by id
    const fileInput = $('input[type="file"]');
    const F = globalThis.File || w.File;
    const before = calls.length;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new F([new Uint8Array(600 * 1024)], 'site-backup.zip', { type: 'application/zip' })] });
    fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
    const dlg = await waitFor(() => $('[role="alertdialog"]'));
    check('restoring asks first, saying the site is replaced and a safety copy is made', !!dlg && /REPLACES the whole site/.test(dlg.textContent) && /safety copy/.test(dlg.textContent));
    click(btn('Restore and replace the site', dlg));
    const res = await waitFor(() => $('.cc-backup-result'), 3000);
    check('restore: result with counts, files left out and the safety copy', !!res && /Backup restored \(Acme\)/.test(res.textContent) && /3 pages, 2 items, 5 image files/.test(res.textContent) && /bad\.svg/.test(res.textContent) && /safety copy/.test(res.textContent), res && res.textContent);
    await waitFor(() => calls.some((c) => c.u.includes('rebuild_all')), 2000);
    const rc = calls.find((c) => c.u.includes('action=backup_restore') && !c.u.includes('saved'));
    check('a big file is uploaded in pieces below the server limit, then restored by its upload id', CHUNKS.length === 3 && CHUNKS.every((c) => c.size <= 300 * 1024 && c.id === CHUNKS[0].id) && CHUNKS.map((c) => c.index).join() === '0,1,2'
      && CHUNKS.reduce((a, c) => a + c.size, 0) === 600 * 1024 && rc && JSON.parse(rc.body).upload === CHUNKS[0].id && JSON.parse(rc.body).size === 600 * 1024, JSON.stringify(CHUNKS));
    check('…then the pages and site name are reloaded and the site is published', calls.some((c) => c.u.includes('rebuild_all')) && calls.slice(before).some((c) => c.u.includes('action=branding')) && calls.slice(before).some((c) => c.u.includes('get_pages')));
    const rs = $$('button').find((b) => /^Restore the backup of/.test(b.getAttribute('aria-label') || ''));
    click(rs);
    const dlg2 = await waitFor(() => $('[role="alertdialog"]'));
    check('restoring a saved backup asks first too', !!dlg2 && /REPLACES the whole site/.test(dlg2.textContent));
    click(btn('Restore and replace the site', dlg2));
    await waitFor(() => calls.some((c) => c.u.includes('backup_restore_saved')), 2000);
    check('…and sends only its name', (() => { const c = calls.find((x) => x.u.includes('backup_restore_saved')); return c && JSON.parse(c.body).name === 'before-restore-20261012-090000-aa11.zip'; })());
    await sleep(50);
    const del = $$('button').find((b) => /^Delete the backup of/.test(b.getAttribute('aria-label') || ''));
    click(del);
    const dlg3 = await waitFor(() => $('[role="alertdialog"]'));
    check('deleting a backup asks first', !!dlg3 && /cannot be undone/.test(dlg3.textContent));
    click(btn('Delete backup', dlg3));
    await waitFor(() => calls.some((c) => c.u.includes('backup_delete')), 2000);
    check('…then deletes it', calls.some((c) => c.u.includes('backup_delete')));
    w.HTMLAnchorElement.prototype.click = origClick;
  }

  console.log('\nSTYLES PER DEVICE');
  {
    const ds = await vite.ssrLoadModule('/src/editor/deviceStyles.js');
    const rb = await vite.ssrLoadModule('/src/render/renderBlock.mjs');
    const b0 = { id: 'r1', type: 'TEXT', styles: { padding: '40px', fontSize: '20px', animation: 'fade-up' }, content: { text: '<p>x</p>' } };
    const t1 = { ...b0, ...ds.deviceStylePatch(b0, 'tablet', { padding: '20px', animation: 'zoom-in' }) };
    check('a tablet change is a tablet override; effects stay the same on every device', t1.styles.padding === '40px' && t1.responsive.tablet.padding === '20px' && t1.styles.animation === 'zoom-in' && !('animation' in t1.responsive.tablet));
    const m1 = { ...t1, ...ds.deviceStylePatch(t1, 'mobile', { padding: '20px', fontSize: '16px' }) };
    check('phones inherit the tablet value: setting the same value adds no phone override', !('padding' in m1.responsive.mobile) && m1.responsive.mobile.fontSize === '16px');
    check('effective styles: desktop, tablet (desktop + tablet), phone (+ phone)', rb.effectiveStyles(m1, 'desktop').padding === '40px' && rb.effectiveStyles(m1, 'tablet').padding === '20px' && rb.effectiveStyles(m1, 'mobile').padding === '20px' && rb.effectiveStyles(m1, 'mobile').fontSize === '16px' && rb.effectiveStyles(m1, 'tablet').fontSize === '20px');
    const back = { ...m1, ...ds.deviceStylePatch(m1, 'tablet', { padding: '40px' }) };
    check('going back to the inherited value removes the override (nothing left = no responsive data)', back.responsive && !back.responsive.tablet && !!back.responsive.mobile && ds.tidyResponsive({ tablet: {}, mobile: {}, hide: [] }) === undefined);
    const h = { ...b0, ...ds.hidePatch(b0, 'mobile', true) };
    check('hide on a device', JSON.stringify(h.responsive) === '{"hide":["mobile"]}' && ds.hidePatch(h, 'mobile', false).responsive === undefined);
    check('published page: media rules on the block id, tablet ≤1024px, phone ≤767px, hidden ranges', /@media\(max-width:1024px\)\{#r1\{padding:20px !important;\}\}/.test(rb.renderBlock(m1)) && /@media\(max-width:767px\)\{#r1\{font-size:16px !important;\}\}/.test(rb.renderBlock(m1)) && /@media\(max-width:767px\)\{#r1\{display:none !important;\}\}/.test(rb.renderBlock(h)));

    // the panel and the canvas follow the previewed device
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, blocks: [m1, h], selectedBlockId: 'r1', viewport: 'tablet', userRole: 'admin', isEditingMaster: false });
    mount(React.createElement(VisualEditor)); await sleep(80);
    click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(40);
    const bar = $('.cc-device-bar');
    check('the Style tab says which device it edits (synced with the preview size)', !!bar && bar.querySelector('[aria-pressed="true"]')?.textContent.trim() === 'Tablet' && /up to 1024px/.test(bar.textContent) && /1 setting changed/.test(bar.textContent));
    click($$('button', bar).find((b) => b.textContent.trim() === 'Phone')); await sleep(40);
    check('…switching it switches the canvas preview', st().viewport === 'mobile');
    const canvasText = $('.cc-canvas #r1');
    check('the canvas shows the phone styles directly (no media rules in the editor)', !!canvasText && /font-size: 16px/.test(canvasText.getAttribute('style')) && /padding: 20px/.test(canvasText.getAttribute('style')) && !$('.cc-canvas style[data-cc-device]'));
    const badge = $$('.cc-hidden-badge');
    check('a block hidden on this device is shown faded with a "Hidden on phone" mark', badge.length === 1 && /Hidden on phone/.test(badge[0].textContent));
    const reset = $$('button', $('.cc-device-bar')).find((b) => /Reset/.test(b.textContent));
    click(reset); await sleep(30);
    check('Reset gives the phone the tablet styles again', !blk('r1').responsive?.mobile && blk('r1').responsive?.tablet?.padding === '20px');
    click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Advanced')); await sleep(40);
    if (!$$('label').some((l) => /^Hide on /.test(l.textContent.trim()))) { click(btnHas('Visibility')); await sleep(30); }
    const vis = $$('label').filter((l) => /^Hide on /.test(l.textContent.trim()));
    check('Advanced › Visibility: hide on desktop, tablet, phone', vis.length === 3);
    click(vis[0].querySelector('input')); await sleep(30);
    check('…ticking one stores it', (blk('r1').responsive?.hide || []).includes('desktop'));
    useStore.setState({ viewport: 'desktop', selectedBlockId: null });
  }

  console.log('\nGLOBAL COLOURS');
  {
    const pal = await vite.ssrLoadModule('/src/editor/palette.js');
    const p0 = pal.normalizePalette({ brandColor: '#ff0000', colors: [{ id: 'sale', name: 'Sale', value: '#E11D48' }, { id: 'bad id', value: '#000' }] });
    check('palette: built-in colours (primary = brand colour) then custom ones', p0.map((c) => c.id).join(',') === 'primary,secondary,accent,text,background,sale' && p0[0].value === '#ff0000' && p0[5].value === '#e11d48');
    check('a reference points to a palette colour and resolves to its current value', pal.colorRef(p0[5]) === 'var(--cc-color-sale, #e11d48)' && pal.parseColorRef('var(--cc-color-sale, #e11d48)').id === 'sale'
      && pal.resolveColor('var(--cc-color-sale, #000000)', p0) === '#e11d48' && pal.parseColorRef('var(--brand-color, #3b82f6)').id === 'primary' && pal.parseColorRef('#fff') === null);
    // the colour fields offer the palette; picking a swatch stores a reference
    useStore.setState({ palette: p0, currentView: 'editor', activePage: { ...PAGES[2] }, viewport: 'desktop', userRole: 'admin', isEditingMaster: false,
      blocks: [{ id: 'gc1', type: 'TEXT', styles: {}, content: { text: '<p>x</p>' } }], selectedBlockId: 'gc1' });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(30);
    if (!$('[aria-label="Pick text color"]')) { click(btnHas('Typography')); await sleep(30); }
    const sw = $$('.cc-swatches')[0];
    check('colour fields show the global colours as swatches', !!sw && $$('button', sw).length === 6 && $$('button', sw).some((b) => /Sale \(global colour\)/.test(b.getAttribute('aria-label'))));
    click($$('button', sw).find((b) => /^Accent/.test(b.getAttribute('aria-label')))); await sleep(30);
    check('…picking one stores a reference to it, not a fixed colour', blk('gc1').styles.color === 'var(--cc-color-accent, #f59e0b)', blk('gc1').styles.color);
    const chip = $('.cc-color-global');
    check('…and the field shows the colour by name ("Accent · global")', !!chip && /Accent/.test(chip.textContent) && /global/.test(chip.textContent));
    click($$('button', chip).find((b) => b.textContent.trim() === 'Unlink')); await sleep(30);
    check('Unlink keeps today\'s colour as a fixed value', blk('gc1').styles.color === '#f59e0b');

    // Global Options › Global colours
    useStore.setState({ currentView: 'settings', palette: null });
    calls.length = 0;
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default)));
    const rowsOf = () => $$('.cc-palette__row');
    await waitFor(() => rowsOf().length === 5 && btnHas('Save & Publish'));   // loaded (the defaults show before the answer)
    check('Global colours lists the five built-in colours (Primary = brand colour), none deletable', rowsOf().length === 5 && /Primary/.test(rowsOf()[0].querySelector('input[aria-label="Colour name"]').value) && !rowsOf()[0].querySelector('button[aria-label^="Delete"]'));
    click(btnHas('Add colour')); await sleep(30);
    check('"Add colour" adds a custom colour that can be renamed and deleted', rowsOf().length === 6 && !!rowsOf()[5].querySelector('button[aria-label^="Delete"]'), `rows=${rowsOf().length} btn=${btnHas('Add colour')?.outerHTML.slice(0,120)}`);
    typeIn(rowsOf()[5].querySelector('input[aria-label="Colour name"]'), 'Sale'); await sleep(20);
    const prim = rowsOf()[0].querySelector('input[type="color"]');
    Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(prim, '#123456'); prim.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(20);
    click(btnHas('Save & Publish'));
    const sent = await waitFor(() => calls.find((c) => c.u.includes('save_settings')));
    const body = sent ? JSON.parse(sent.body) : {};
    check('saving sends the palette, and the primary colour as the brand colour', Array.isArray(body.colors) && body.colors.length === 6 && body.colors[5].name === 'Sale' && body.colors[0].value === '#123456' && body.brandColor === '#123456', sent && sent.body.slice(0, 200));
    check('…and the colour fields everywhere get the new palette', await waitFor(() => (st().palette || []).length === 6 && st().palette[0].value === '#123456'));
  }

  console.log('\nTEXT STYLES');
  {
    const ty = await vite.ssrLoadModule('/src/render/typography.mjs');
    const rb = await vite.ssrLoadModule('/src/render/renderBlock.mjs');
    // the same literals as the PHP tests (server.php, security.php)
    const typo = ty.normalizeTypography({ typography: { h1: { font: 'Poppins', size: '3rem', weight: '700', lineHeight: '1.1', tablet: { size: '2.4rem' }, mobile: { size: 'bogus', font: 'Comic Sans' } },
      body: { font: 'Comic Sans', size: '17px' }, unknown: { size: '9px' } } });
    check('text styles: only known presets, fonts and values are kept; tablet and phone are overrides', JSON.stringify(typo) === '{"h1":{"font":"Poppins","size":"3rem","weight":"700","lineHeight":"1.1","tablet":{"size":"2.4rem"}},"body":{"size":"17px"}}', JSON.stringify(typo));
    check('a block with a text preset gets the preset variables; its own values win, emptied ones fall back', JSON.stringify(ty.withTextPreset({ textPreset: 'h2', fontSize: '', color: 'red' })) === '{"fontFamily":"var(--cc-type-h2-font)","fontSize":"var(--cc-type-h2-size)","fontWeight":"var(--cc-type-h2-weight)","lineHeight":"var(--cc-type-h2-line)","color":"red"}');
    check('…an unknown text preset is ignored', JSON.stringify(ty.withTextPreset({ textPreset: 'nope', color: 'red' })) === '{"color":"red"}');
    const desk = ty.typeCanvasCss(typo, 'desktop'), tab = ty.typeCanvasCss(typo, 'tablet'), mob = ty.typeCanvasCss(typo, 'mobile');
    check('the editor shows the device it edits: desktop 3rem, tablet its own size, phone the tablet size', desk.includes('--cc-type-h1-size: 3rem;') && tab.includes('--cc-type-h1-size: 2.4rem;') && mob.includes('--cc-type-h1-size: 2.4rem;')
      && !mob.includes('Comic Sans') && desk.includes('.cc-canvas h1{font-family: var(--cc-type-h1-font); font-size: var(--cc-type-h1-size);'), desk.slice(0, 200));
    check('…and the site elements are scoped to the canvas (the editor\'s own chrome is not restyled)', !/(^|[}\s])body\{/.test(desk) && desk.includes('.cc-canvas{'));
    check('a text style of a block renders as variables, not as a property of its own', (() => { const h = rb.renderBlock({ id: 'tp1', type: 'TEXT', styles: { textPreset: 'h2' }, content: { text: '<p>a</p>' } }); return h.includes('font-size: var(--cc-type-h2-size)') && !h.includes('text-preset'); })());

    // Style tab: the Text style picker sets the block's preset
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, viewport: 'desktop', userRole: 'admin', isEditingMaster: false,
      blocks: [{ id: 'ts1', type: 'TEXT', styles: {}, content: { text: '<p>x</p>' } }], selectedBlockId: 'ts1' });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(30);
    if (!$('select[aria-label="Text style"]')) { click(btnHas('Typography')); await sleep(30); }
    const ts = $('select[aria-label="Text style"]');
    check('the Style tab offers the text styles (Default, Heading 1–6, Body, Small, Button)', !!ts && ts.options.length === 10 && ts.options[9].textContent === 'Button');
    if (ts) { ts.value = 'h3'; ts.dispatchEvent(new w.Event('change', { bubbles: true })); }
    await sleep(30);
    check('…picking one sets the block\'s text style', st().blocks.find((b) => b.id === 'ts1').styles.textPreset === 'h3');

    // Global Options › Text styles: a size is saved for the preset
    useStore.setState({ currentView: 'settings', palette: null, typography: null });
    calls.length = 0;
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default)));
    const h1Size = await waitFor(() => btnHas('Save & Publish') && $('input[aria-label="Heading 1 size"]'));
    check('Global Options shows the text styles (Heading 1 size, with the default as placeholder)', !!h1Size && h1Size.placeholder === 'Default');
    if (h1Size) { typeIn(h1Size, '4rem'); h1Size.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); }
    await sleep(30);
    click(btnHas('Save & Publish'));
    const sentTs = await waitFor(() => calls.find((c) => c.u.includes('save_settings')));
    const bodyTs = sentTs ? JSON.parse(sentTs.body) : {};
    check('saving sends the text style, and the editor gets it', bodyTs.typography && bodyTs.typography.h1 && bodyTs.typography.h1.size === '4rem', sentTs && sentTs.body.slice(0, 160));
    check('…and the editor\'s text styles follow', await waitFor(() => st().typography && st().typography.h1 && st().typography.h1.size === '4rem'));
  }

  console.log('\nBUTTON AND FIELD STYLES');
  {
    const kit = await vite.ssrLoadModule('/src/render/kit.mjs');
    const rb = await vite.ssrLoadModule('/src/render/renderBlock.mjs');
    // the same literals as the PHP tests (server.php, security.php)
    const k = kit.normalizeKit({ buttonStyles: { primary: { bg: '#112233', text: 'red;}body{', radius: '999px' }, outline: { border: 'var(--cc-color-accent, #f59e0b)', bg: 'transparent' }, nope: { bg: '#000' } },
      fieldStyle: { bg: '#fafafa', border: 'javascript:x', radius: '4px;' } });
    check('button presets and field style: only valid values are kept, in a fixed order', JSON.stringify(k) === '{"buttons":{"primary":{"bg":"#112233","radius":"999px"},"outline":{"bg":"transparent","border":"var(--cc-color-accent, #f59e0b)"}},"field":{"bg":"#fafafa"}}', JSON.stringify(k));
    check('a button that picks a preset gets its variables, with the built-in look as fallback', kit.buttonPresetCss('primary') === "background: var(--cc-btn-primary-bg, var(--brand-color, #3b82f6)); color: var(--cc-btn-primary-text, #ffffff); border: 2px solid var(--cc-btn-primary-border, transparent); border-radius: var(--cc-btn-primary-radius, 6px); " && kit.buttonPresetCss('nope') === '');
    check('the site\'s button presets and field style as CSS variables (only the values that are set)', kit.kitCss(k, ':root') === ':root{--cc-btn-primary-bg: #112233; --cc-btn-primary-radius: 999px; --cc-btn-outline-bg: transparent; --cc-btn-outline-border: var(--cc-color-accent, #f59e0b); --cc-field-bg: #fafafa;}' && kit.kitCss(kit.normalizeKit({}), ':root') === '');
    const btnHtml = rb.renderBlock({ id: 'bq', type: 'BUTTON', styles: {}, content: { text: 'x', url: '#', preset: 'outline' } });
    check('a BUTTON block with a preset uses the preset variables for its colours', btnHtml.includes('var(--cc-btn-outline-bg, transparent)') && btnHtml.includes('var(--cc-btn-outline-text, var(--brand-color, #3b82f6))'));
    check('…and its own colours are not used', !rb.renderBlock({ id: 'bq2', type: 'BUTTON', styles: {}, content: { text: 'x', url: '#', preset: 'outline', bgColor: '#123456' } }).includes('#123456'));
    check('the search field uses the field style variables, with the built-in look as fallback', rb.renderBlock({ id: 'sq', type: 'SEARCH', styles: {}, content: {} }).includes('background:var(--cc-field-bg, #fff)'));

    // Global Options › Buttons & fields: a colour and a radius are saved
    useStore.setState({ currentView: 'settings', palette: null, typography: null, kit: null });
    calls.length = 0;
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default)));
    const bg = await waitFor(() => btnHas('Save & Publish') && $('input[aria-label="Primary button background"]'));
    check('Global Options shows the button presets and the form field style', !!bg && !!$('input[aria-label="Outline button border"]') && !!$('input[aria-label="Form field background"]'));
    if (bg) typeIn(bg, '#112233');
    const rad = $('input[aria-label="Primary button corner radius"]');
    if (rad) { typeIn(rad, '999px'); rad.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); }
    await sleep(30);
    click(btnHas('Save & Publish'));
    const sentK = await waitFor(() => calls.find((c) => c.u.includes('save_settings')));
    const bodyK = sentK ? JSON.parse(sentK.body) : {};
    check('saving sends the button preset and the field style', bodyK.buttonStyles && bodyK.buttonStyles.primary && bodyK.buttonStyles.primary.bg === '#112233' && bodyK.buttonStyles.primary.radius === '999px', sentK && sentK.body.slice(0, 200));
    check('…and the editor gets them', await waitFor(() => st().kit && st().kit.buttons && st().kit.buttons.primary && st().kit.buttons.primary.bg === '#112233'));

    // the BUTTON block's Button preset picker
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, viewport: 'desktop', userRole: 'admin', isEditingMaster: false,
      blocks: [{ id: 'bt1', type: 'BUTTON', styles: {}, content: { text: 'Go', url: '#' } }], selectedBlockId: 'bt1' });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    if (!$('select[aria-label="Button preset"]')) { click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Content')); await sleep(30); }
    const bp = $('select[aria-label="Button preset"]');
    check('the Button block offers the presets (Custom, Primary, Secondary, Outline)', !!bp && bp.options.length === 4);
    if (bp) { bp.value = 'outline'; bp.dispatchEvent(new w.Event('change', { bubbles: true })); }
    await sleep(30);
    check('…picking one sets the block\'s preset', st().blocks.find((b) => b.id === 'bt1').content.preset === 'outline');
  }

  console.log('\nCOPY STYLE');
  {
    const byId = (id) => (function find(list) { for (const b of list) { if (b.id === id) return b; const r = b.children && find(b.children); if (r) return r; } return null; })(st().blocks);
    const openCP = async () => { if (!btn('Copy style')) { click(btnHas('Copy & paste style')); await sleep(30); } };
    const look = { color: 'red', margin: '4px' };
    const hero = (id, styles, n) => ({ id, type: 'HERO', styles, content: { title: `<h1>${n}</h1>`, buttons: [] } });
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, viewport: 'desktop', userRole: 'admin', isEditingMaster: false, pastBlocks: [], futureBlocks: [], styleClipboard: null,
      blocks: [{ id: 'cs1', type: 'TEXT', styles: { ...look }, responsive: { tablet: { fontSize: '12px' } }, content: { text: '<p>a</p>' } },
        { id: 'cs2', type: 'TEXT', styles: {}, content: { text: '<p>b</p>' } },
        { id: 'cs3', type: 'TEXT', styles: { padding: '9px' }, content: { text: '<p>c</p>' } },
        { id: 'cs4', type: 'IMAGE', styles: {}, content: { src: 'a.jpg' } },
        { id: 'sec1', type: 'SECTION', styles: {}, content: {}, children: [hero('hr1', { padding: '10px' }, 1), hero('hr2', {}, 2)] },
        hero('hr3', { color: 'blue' }, 3)],
      selectedBlockId: 'cs1' });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Style')); await sleep(30);
    await openCP();
    check('the Style tab has a "Copy & paste style" accordion', !!btnHas('Copy & paste style'));
    check('paste is off until a style is copied', !!btn('Paste onto this block').disabled);
    click(btn('Copy style')); await sleep(20);
    check('…and on once one is copied', !btn('Paste onto this block').disabled);
    check('the other blocks of the page are listed, nested ones too (Hero 1 is inside a section)', !!$('input[aria-label="Paste onto Hero 1"]') && !!$('input[aria-label="Paste onto Hero 3"]') && !!$('input[aria-label="Paste onto Text 2"]'));

    useStore.setState({ selectedBlockId: 'cs2' }); await sleep(60);
    await openCP();
    click(btn('Paste onto this block')); await sleep(30);
    check('paste onto this block: its styles and tablet overrides are the copied ones', JSON.stringify(byId('cs2').styles) === JSON.stringify(look) && byId('cs2').responsive.tablet.fontSize === '12px', JSON.stringify(byId('cs2')));

    // copy from the blue Hero 3, then paste onto Hero 1 (nested in a section) and Hero 2, from another block
    useStore.setState({ selectedBlockId: 'hr3' }); await sleep(60);
    await openCP();
    click(btn('Copy style')); await sleep(20);
    useStore.setState({ selectedBlockId: 'cs1' }); await sleep(60);
    await openCP();
    click($('input[aria-label="Paste onto Hero 1"]')); await sleep(20);
    click($('input[aria-label="Paste onto Hero 2"]')); await sleep(20);
    check('two boxes ticked: the button says how many', !!btnHas('Paste onto selected (2)'));
    click(btnHas('Paste onto selected (2)')); await sleep(30);
    check('…the ticked blocks (a nested hero too) take the copied style', JSON.stringify(byId('hr1').styles) === '{"color":"blue"}' && JSON.stringify(byId('hr2').styles) === '{"color":"blue"}', JSON.stringify([byId('hr1').styles, byId('hr2').styles]));
    check('…the Hero that was not ticked, and the text, keep theirs', JSON.stringify(byId('hr3').styles) === '{"color":"blue"}' && JSON.stringify(byId('cs3').styles) === '{"padding":"9px"}');
    useStore.getState().undo(); await sleep(20);
    check('…and that paste is ONE undo step', JSON.stringify(byId('hr1').styles) === '{"padding":"10px"}' && JSON.stringify(byId('hr2').styles) === '{}', JSON.stringify([byId('hr1').styles, byId('hr2').styles]));

    click(btnHas('Select all Text blocks')); await sleep(30);
    check('"Select all Text blocks" ticks the other text blocks', !!btnHas('Paste onto selected (2)') && !$('input[aria-label="Paste onto Image 1"]').checked);
    click(btnHas('Paste onto selected (2)')); await sleep(30);
    check('…and they take the style that is copied now (the blue Hero\'s)', JSON.stringify(byId('cs2').styles) === '{"color":"blue"}' && JSON.stringify(byId('cs3').styles) === '{"color":"blue"}', JSON.stringify([byId('cs2').styles, byId('cs3').styles]));

    click(btn('Reset to global style')); await sleep(20);
    const dlg = await waitFor(() => btn('Reset style'));
    check('reset asks first, in the app\'s dialog', !!dlg);
    if (dlg) click(dlg); await sleep(40);
    check('…then the block has no own styles or device overrides', JSON.stringify(byId('cs1').styles) === '{}' && !byId('cs1').responsive, JSON.stringify(byId('cs1')));
  }

  console.log('\nCANVAS HANDLES: THE BOX MATHS');
  {
    const h = await vite.ssrLoadModule('/src/editor/handles.js');
    check('a box value is read as its four sides, however it is written', JSON.stringify(h.boxSides('8px')) === '["8px","8px","8px","8px"]' && JSON.stringify(h.boxSides('0 auto')) === '["0","auto","0","auto"]' && JSON.stringify(h.boxSides('1px 2px 3px')) === '["1px","2px","3px","2px"]' && JSON.stringify(h.boxSides('')) === '["0","0","0","0"]');
    check('dragging one side writes that side and keeps the others (auto stays auto)', h.setBoxSide('0 auto', 3, 12) === '0 auto 0 12px' && h.setBoxSide('', 0, 8) === '8px 0 0 0');
    check('a drag never goes below zero, and follows the pointer with its sign', h.dragValue(10, 5, -1) === 5 && h.dragValue(2, -10, 1) === 0 && h.dragValue(4, 12, 1) === 16);
    check('an "auto" side counts as 0 px when dragged', h.sidePx('auto') === 0 && h.sidePx('12px') === 12);
  }

  console.log('\nCUSTOM FIELDS');
  {
    const CF = (await vite.ssrLoadModule('/src/components/CollectionFields.jsx')).default;
    calls.length = 0;
    mount(React.createElement(CF, { collection: { id: 'col_x', name: 'Team', slug: 'team', fields: [] }, collections: [], canEdit: true }));
    await sleep(30);
    click(btnHas('Add field')); await sleep(30);
    typeIn($('input[aria-label="Field 1 label"]'), 'Colour'); await sleep(20);
    const type = $('select[aria-label="Field 1 type"]');
    type.value = 'choice'; type.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(30);
    const ch = $('textarea[aria-label="Colour choices"]');
    check('a choice field has a box for its choices', !!ch);
    if (ch) { Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ch, 'red\nBlue | Azure'); ch.dispatchEvent(new w.Event('input', { bubbles: true })); }
    await sleep(20);
    click(btnHas('Save fields')); await sleep(20);
    const sentF = await waitFor(() => calls.find((c) => c.u.includes('save_collection')));
    const bodyF = sentF ? JSON.parse(sentF.body) : {};
    check('saving sends the fields: a key from the label, and the choices as values and labels', bodyF.fields && bodyF.fields.length === 1 && bodyF.fields[0].key === 'colour' && bodyF.fields[0].type === 'choice'
      && JSON.stringify(bodyF.fields[0].options) === '[{"value":"red","label":"red"},{"value":"blue","label":"Azure"}]' && !('_choices' in bodyF.fields[0]), JSON.stringify(bodyF.fields));
    check('the collection keeps its name and address when its fields are saved', bodyF.name === 'Team' && bodyF.slug === 'team' && bodyF.id === 'col_x');
    COL_SAVES.length = 0;   // this save is not the rename tested below

    // the item editor: one input per field, typed to the field
    const defs = [
      { id: 'nm', key: 'name', label: 'Name', type: 'text', required: true },
      { id: 'st', key: 'story', label: 'Story', type: 'richtext', required: false },
      { id: 'tr', key: 'tier', label: 'Tier', type: 'choice', multiple: true, options: [{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }] },
      { id: 'lk', key: 'site', label: 'Site', type: 'link', required: false },
    ];
    useStore.setState({ currentView: 'editor', selectedBlockId: null, blocks: [], pastBlocks: [], futureBlocks: [],
      activePage: { id: 'it1', __item: true, collection_id: 'col_x', title: 'Ada', slug: 'ada', excerpt: '', cover_image: '', date: '2026-10-19', status: 'draft', seo_title: '', seo_description: '', __fieldDefs: defs, field_values: {} } });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    const nameIn = await waitFor(() => $('input[aria-label="Name"]'));
    check('the item editor has an input for each field of the collection', !!nameIn && !!$('input[aria-label="Site address"]') && $$('input[type="checkbox"]').length >= 2);
    if (nameIn) typeIn(nameIn, 'Ada Lovelace');
    await sleep(20);
    check('…and a typed value is kept with the item', st().activePage.field_values.nm === 'Ada Lovelace', JSON.stringify(st().activePage.field_values));
    const gold = $$('label').find((l) => l.textContent.trim() === 'Gold');
    if (gold) click(gold.querySelector('input')); await sleep(30);
    check('a multiple choice keeps the boxes ticked', JSON.stringify(st().activePage.field_values.tr) === '["gold"]', JSON.stringify(st().activePage.field_values.tr));
    const addr = $('input[aria-label="Site address"]');
    if (addr) typeIn(addr, 'https://example.com'); await sleep(20);
    check('a link keeps its address', st().activePage.field_values.lk && st().activePage.field_values.lk.url === 'https://example.com', JSON.stringify(st().activePage.field_values.lk));

    // the Item Field block: its field is chosen from the collection's fields
    useStore.setState({ selectedBlockId: 'if1', blocks: [{ id: 'if1', type: 'ITEM_FIELD', styles: {}, content: { field: '' } }] });
    mount(React.createElement(PropertyPanel)); await sleep(60);
    if (!$$('label').find((l) => l.textContent.trim() === 'Field')) { click($$('[role="tab"]').find((b) => b.textContent.trim() === 'Content')); await sleep(30); }
    const fieldLabel = $$('label').find((l) => l.textContent.trim() === 'Field');
    const fieldSel = fieldLabel && fieldLabel.parentElement.querySelector('select');
    check('the Item Field block lists the collection\'s fields', !!fieldSel && [...fieldSel.options].some((o) => /Story \(Rich text\)/.test(o.textContent)));
    if (fieldSel) { fieldSel.value = 'st'; fieldSel.dispatchEvent(new w.Event('change', { bubbles: true })); }
    await sleep(30);
    check('…choosing one sets the block\'s field', st().blocks.find((b) => b.id === 'if1').content.field === 'st');
  }

  console.log('\nLISTS, RELATED AND STRUCTURED DATA');
  {
    const LP = (await vite.ssrLoadModule('/src/components/panel/blocks/CollectionListPanel.jsx')).default;
    const RP = (await vite.ssrLoadModule('/src/components/panel/blocks/RelatedPanel.jsx')).default;
    const CF = (await vite.ssrLoadModule('/src/components/CollectionFields.jsx')).default;
    const cols = [
      { id: 'col_s', name: 'Staff', slug: 'staff', fields: [
        { id: 'dept', key: 'dept', label: 'Department', type: 'reference', target: 'col_d' },
        { id: 'role', key: 'role', label: 'Role', type: 'choice', multiple: false, options: [{ value: 'a', label: 'A' }] },
        { id: 'pay', key: 'pay', label: 'Pay', type: 'number' }] },
      { id: 'col_d', name: 'Departments', slug: 'departments', fields: [] }];
    const changes = [];
    let content = { collectionId: 'col_s', collectionName: 'Staff', cardFields: [] };
    const ctxL = () => ({ selectedBlock: { id: 'lb', type: 'COLLECTION_LIST', content, styles: {} },
      handleContentChange: (k, v) => { changes.push([k, v]); content = { ...content, [k]: v }; }, patchContent: (p) => { content = { ...content, ...p }; }, collections: cols });
    mount(React.createElement(LP, { ctx: ctxL() })); await sleep(30);
    const box = $('[aria-label="Fields on each card"]');
    check('the list panel offers the fields of the chosen collection for the cards', !!box && box.querySelectorAll('input').length === 3);
    if (box) click(box.querySelectorAll('input')[1]);
    check('…ticking one sets the card fields', JSON.stringify(changes.find((c) => c[0] === 'cardFields')) === '["cardFields",["role"]]', JSON.stringify(changes));
    const selWith = (text) => $$('select').find((x) => [...x.options].some((o) => o.textContent.startsWith(text)));
    const sortSel = selWith('Newest first');
    if (sortSel) { sortSel.value = 'pay'; sortSel.dispatchEvent(new w.Event('change', { bubbles: true })); }
    check('the list can be sorted by a field (number, date, text or single choice)', changes.some((c) => c[0] === 'sortBy' && c[1] === 'pay') && !!sortSel && [...sortSel.options].some((o) => o.textContent === 'Pay'));
    const filtSel = selWith('None');
    if (filtSel) { filtSel.value = 'role'; filtSel.dispatchEvent(new w.Event('change', { bubbles: true })); }
    check('a choice field gives the filter buttons', changes.some((c) => c[0] === 'filterField' && c[1] === 'role') && !!filtSel && [...filtSel.options].every((o) => o.value !== 'pay'));

    // Related items: the reference must point to the collection of the item being edited
    let rcontent = { collectionId: 'col_s', fieldId: '' };
    const rchanges = [];
    const rctx = (itemCol) => ({ selectedBlock: { id: 'rb', type: 'RELATED', content: rcontent, styles: {} },
      handleContentChange: (k, v) => { rchanges.push([k, v]); rcontent = { ...rcontent, [k]: v }; }, patchContent: (p) => { rcontent = { ...rcontent, ...p }; }, collections: cols, itemCollectionId: itemCol });
    mount(React.createElement(RP, { ctx: rctx('col_d') })); await sleep(30);
    check('a Related block offers the reference fields that point to the item\'s collection', !!$$('select').find((x) => [...x.options].some((o) => o.textContent === 'Department')));
    mount(React.createElement(RP, { ctx: rctx(null) })); await sleep(30);
    check('…and says so when it is not used on a collection item', /collection item page/.test(doc.body.textContent));

    // Structured data: the type, and which field gives each property
    COL_SAVES.length = 0; calls.length = 0;
    mount(React.createElement(CF, { collection: { id: 'col_s', name: 'Staff', slug: 'staff', fields: cols[0].fields, schema: {} }, collections: cols, canEdit: true })); await sleep(30);
    // the Fields section is closed when the collection has fields: open it
    if (!$('select[aria-label="Structured data type"]')) { click($$('button').find((b) => /^Fields \(/.test(b.textContent.trim()))); await sleep(30); }
    const typeSel = $('select[aria-label="Structured data type"]');
    if (typeSel) { typeSel.value = 'Person'; typeSel.dispatchEvent(new w.Event('change', { bubbles: true })); }
    await sleep(30);
    const jobSel = $('select[aria-label="Structured data Job title"]');
    check('the structured data offers the properties of its type, with the fields that fit', !!jobSel && [...jobSel.options].some((o) => o.value === 'role') && ![...jobSel.options].some((o) => o.value === 'pay'));
    if (jobSel) { jobSel.value = 'role'; jobSel.dispatchEvent(new w.Event('change', { bubbles: true })); }
    await sleep(20);
    click(btnHas('Save fields')); await sleep(20);
    const sentS = await waitFor(() => calls.find((c) => c.u.includes('save_collection')));
    const bodyS = sentS ? JSON.parse(sentS.body) : {};
    check('saving sends the structured data of the collection', JSON.stringify(bodyS.schema) === '{"type":"Person","map":{"jobTitle":"role"},"currency":""}', JSON.stringify(bodyS.schema));
    COL_SAVES.length = 0;
  }

  console.log('\nITEM DESIGN AND DYNAMIC VALUES');
  {
    const ib = await vite.ssrLoadModule('/src/render/itemBinding.mjs');
    const bdefs = [{ id: 't1', key: 'name', type: 'text', label: 'Name' }, { id: 'n1', key: 'price', type: 'number', label: 'Price' },
      { id: 'd1', key: 'when', type: 'date', label: 'When' }, { id: 'l1', key: 'site', type: 'link', label: 'Site' },
      { id: 'c1', key: 'tier', type: 'choice', label: 'Tier', multiple: true, options: [{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }] },
      { id: 'x1', key: 'lead', type: 'reference', label: 'Lead', target: 'c2' }];
    const bctx = { defs: bdefs, values: { t1: '<b>Ada</b> & co', n1: 12.5, d1: '2026-10-19', l1: { url: 'chi-siamo/index.html', text: 'About' }, c1: ['gold', 'silver'], x1: 'i9' },
      items: { i9: { title: 'Ada L.', slug: 'ada', col_slug: 'team', live: true } }, item: 'i1',
      page: { title: 'Ada "L"', excerpt: '', date: '2026-10-19', url: '{{BASE_URL}}team/ada/' } };
    const tpl = 'Hi {{field:name}}, {{field:price}} on {{field:when}}. {{field:site}} / {{field:site.text}} / {{field:tier}} / {{field:lead}} {{field:lead.url}} | {{item:title}} {{item:date}} {{field:missing}} {{item:url}}';
    // the same literals as the PHP tests (server.php, DYNAMIC VALUES)
    check('dynamic values: fields, item and reference tokens become the item\'s values, escaped (as on the site)', ib.bindValue(tpl, bctx) === 'Hi &lt;b&gt;Ada&lt;/b&gt; &amp; co, 12.5 on October 19, 2026. {{BASE_URL}}chi-siamo/ / About / Gold, Silver / Ada L. {{BASE_URL}}team/ada/ | Ada &quot;L&quot; October 19, 2026  {{BASE_URL}}team/ada/', ib.bindValue(tpl, bctx));
    check('dynamic values: outside an item they are removed', ib.bindValue(tpl, null) === 'Hi ,  on .  /  /  /   |    ');
    check('dynamic values: every string of a content is bound, keys kept', JSON.stringify(ib.bindValue({ text: '{{field:price}}', nested: { a: '{{item:title}}' }, n: 3 }, bctx)) === '{"text":"12.5","nested":{"a":"Ada &quot;L&quot;"},"n":3}');
    check('the design shows the names of the fields, in brackets', ib.bindValue('{{field:name}} {{item:title}}', { placeholder: true, defs: bdefs }) === '[Name] [Title]');
    check('the editor binds an item to its values, and a design to placeholders, and a page to nothing', ib.contextFor({ __design: true, __fieldDefs: bdefs }).placeholder === true
      && ib.contextFor({ __item: true, __fieldDefs: bdefs, field_values: {}, title: 'T', slug: 't', __collectionSlug: 'books' }).page.url === '/books/t/' && ib.contextFor({ id: 'p' }) === null);
    // the block's own edits keep the raw text: a bound block is only a copy for the display
    const raw = { id: 'b', type: 'TEXT', content: { text: '{{field:name}}' } };
    check('binding a block gives a copy: its raw content is unchanged', ib.bindBlock(raw, { placeholder: true, defs: bdefs }).content.text === '[Name]' && raw.content.text === '{{field:name}}');

    // a locked item (built from the design): nothing changes its blocks
    useStore.setState({ currentView: 'editor', blocks: [{ id: 'lk1', type: 'TEXT', styles: {}, content: { text: 'design text' } }], pastBlocks: [], futureBlocks: [], selectedBlockId: null,
      activePage: { id: 'it9', __item: true, __locked: true, collection_id: 'col_books', title: 'x', slug: 'x', __fieldDefs: [] } });
    st().updateBlock('lk1', { content: { text: 'changed' } });
    st().removeBlock('lk1');
    st().addBlock('TEXT');
    st().moveBlockBy('lk1', 1);
    st().undo();
    check('a locked item cannot change its layout: edit, remove, add, move and undo all leave the design alone', st().blocks.length === 1 && st().blocks[0].content.text === 'design text' && st().pastBlocks.length === 0, JSON.stringify(st().blocks));
    useStore.setState({ activePage: { id: 'it9', __item: true, collection_id: 'col_books', title: 'x', slug: 'x', __fieldDefs: [] } });
    st().updateBlock('lk1', { content: { text: 'changed' } });
    check('…and an item that is not locked is edited as before', st().blocks[0].content.text === 'changed');
    useStore.setState({ activePage: null, blocks: [] });
  }

  console.log('\nCANVAS MENU');
  {
    const BlockContextMenu = (await vite.ssrLoadModule('/src/components/BlockContextMenu.jsx')).default;
    const labels = () => $$('[role="menuitem"]').map((b) => b.textContent.trim());
    const item = (t) => $$('[role="menuitem"]').find((b) => b.textContent.trim() === t);
    useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2] }, viewport: 'desktop', userRole: 'admin', isEditingMaster: false, pastBlocks: [], futureBlocks: [], styleClipboard: null, selectedBlockId: null, contextMenu: null,
      blocks: [{ id: 'mx1', type: 'TEXT', styles: { color: 'red' }, content: { text: '<p>1</p>' } }, { id: 'mx2', type: 'TEXT', styles: {}, content: { text: '<p>2</p>' } }] });
    mount(React.createElement(BlockContextMenu));
    st().openContextMenu(50, 60, 'mx2'); await sleep(40);
    check('the menu lists the block actions', ['Duplicate', 'Move up', 'Move down', 'Copy style', 'Paste style', 'Save as template'].every((l) => labels().includes(l)), labels().join('|'));
    check('the menu is for the block it opened on: Move down is off (it is the last block), Paste style is off (nothing copied)', !item('Move up').disabled && item('Move down').disabled && item('Paste style').disabled);
    click(item('Move up')); await sleep(30);
    check('Move up moves the block, and the menu closes', st().blocks.map((b) => b.id).join() === 'mx2,mx1' && st().contextMenu === null, st().blocks.map((b) => b.id).join());
    st().openContextMenu(50, 60, 'mx1'); await sleep(40);
    click(item('Copy style')); await sleep(20);
    check('Copy style copies that block\'s style', st().styleClipboard && st().styleClipboard.styles.color === 'red');
    st().openContextMenu(50, 60, 'mx2'); await sleep(40);
    check('…and Paste style is on now', !item('Paste style').disabled);
    click(item('Paste style')); await sleep(20);
    check('Paste style pastes onto the block the menu is for', st().blocks.find((b) => b.id === 'mx2').styles.color === 'red');
    st().openContextMenu(50, 60, 'mx2'); await sleep(40);
    click(item('Duplicate')); await sleep(20);
    check('Duplicate adds a copy right after the block', st().blocks.length === 3 && st().blocks[1].id !== 'mx2' && st().blocks[1].id !== 'mx1' && st().blocks[1].styles.color === 'red', st().blocks.map((b) => b.id).join());
    st().openContextMenu(50, 60, 'mx1'); await sleep(40);
    doc.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    await sleep(20);
    check('a click outside closes the menu', st().contextMenu === null && $$('[role="menu"]').length === 0);
    st().openContextMenu(50, 60, 'mx1'); await sleep(40);
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(20);
    check('Escape closes the menu', st().contextMenu === null);
    st().openContextMenu(50, 60, 'mx1'); await sleep(40);
    calls.length = 0;
    click(item('Save as template')); await sleep(20);
    const tpl = await waitFor(() => $('[role="dialog"].ui-dialog'));
    check('Save as template asks for a name first', !!tpl && /Save as template/.test(tpl.textContent));
    if (tpl) { typeIn(tpl.querySelector('input'), 'My block'); tpl.querySelector('input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    const saved = await waitFor(() => calls.find((c) => c.u.includes('save_template')));
    check('…and the block is sent as a template under that name', !!saved && JSON.parse(saved.body).name === 'My block' && JSON.parse(saved.body).content_json.includes('"id":"mx1"'), saved && saved.body.slice(0, 120));
  }

  console.log('\nCOLLECTIONS');
  {
    useStore.setState({ currentView: 'collections', userRole: 'admin', activePage: null });
    mount(React.createElement(AdminLayout, null, React.createElement((await vite.ssrLoadModule('/src/components/Collections.jsx')).default)));
    const nav = await waitFor(() => $$('.cc-col-row', $('nav[aria-label="Collections"]')).length === 2 && $('nav[aria-label="Collections"]'));
    const longRow = $$('.cc-col-row', nav).find((r) => r.textContent.includes('Recipes'));
    check('a long collection name is cut with an ellipsis instead of stretching the list', !!longRow && longRow.querySelector('.cc-col-row__name') && longRow.querySelector('button').getAttribute('title') === LONG_COL);
    const css = (await import('node:fs')).readFileSync(new URL('../src/ui/kit.css', import.meta.url), 'utf8');
    check('…the list has a fixed width and its rows can shrink (min-width: 0, nowrap + ellipsis)', /\.cc-collections-grid \{[^}]*grid-template-columns: 260px minmax\(0, 1fr\)/.test(css) && /\.cc-col-row__btn \{[^}]*min-width: 0/.test(css) && /\.cc-col-row__name \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(css));
    click($$('button', nav).find((b) => b.textContent.includes('Blog')));
    const rows = await waitFor(() => $$('tbody tr').length === 4 && $$('tbody tr'));
    const statusOf = (t) => rows.find((r) => r.textContent.includes(t)).children[3].textContent;
    check('each item has a pencil-only Edit button (no text label)', rows.every((r) => { const b = r.querySelector('button[aria-label^="Edit "]'); return b && b.textContent.trim() === '' && b.querySelector('svg'); }) && !rows.some((r) => btn('Edit', r)));
    check('the items table fits its card: fixed layout, long titles and slugs end in "…" with the full text on hover', /\.cc-col-table \{[^}]*table-layout: fixed/.test(css) && /\.cc-col-title > div \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(css)
      && rows.every((r) => r.querySelector('.cc-col-title .ui-cell-title').getAttribute('title') === r.querySelector('.cc-col-title .ui-cell-title').textContent));
    check('an archived item shows only "Archived" (not "Published" too)', statusOf('Old post') === 'Archived' && statusOf('Live post') === 'Published' && statusOf('Draft post') === 'Draft', rows.map((r) => r.children[3].textContent).join('|'));

    // a new item can start from a starter template
    click(btnHas('New Item'));
    const pick = await waitFor(() => $('[aria-labelledby="cc-starter-title"]') && $$('.cc-starter-pick__item').length === 2 && $('[aria-labelledby="cc-starter-title"]'));
    check('"New Item" offers Blank and the starter templates', !!pick && /New item in "Blog"/.test(pick.textContent) && /Our Story/.test(pick.textContent) && /Blank/.test($$('.cc-starter-pick__item')[0].textContent));
    click($$('.cc-starter-pick__item').find((b) => /Our Story/.test(b.textContent)));
    await waitFor(() => st().currentView === 'editor');
    const nb = st().blocks;
    check('…picking one opens the editor on a new item with the template\'s blocks (fresh ids)', st().currentView === 'editor' && st().activePage.__item && st().activePage.collection_id === 'c1' && /^item_/.test(st().activePage.id)
      && nb.length === 1 && nb[0].type === 'SECTION' && nb[0].id !== 'st-1' && nb[0].children[0].content.text === '<h2>Once upon a time</h2>' && nb[0].children[0].id !== 'st-t');
    useStore.setState({ currentView: 'collections', activePage: null, blocks: [] }); await sleep(30);

    // rename (name only: the address stays)
    click($('[aria-label="Rename collection Blog"]'));
    const ren = await waitFor(() => $('form[aria-label="Rename collection"]'));
    check('Rename opens a form with the current name and address', !!ren && $('#cc-ren-col').value === 'Blog' && $('#cc-ren-slug').value === 'blog');
    typeIn($('#cc-ren-col'), 'Journal');
    click(btn('Save', ren));
    await waitFor(() => !$('form[aria-label="Rename collection"]'), 2000);
    check('…saving sends the new name and keeps the address', COL_SAVES[0] && COL_SAVES[0].id === 'c1' && COL_SAVES[0].name === 'Journal' && COL_SAVES[0].slug === 'blog' && !$('[role="alertdialog"]'));
    check('…the list and the header show the new name', await waitFor(() => /Journal/.test(nav.textContent) && $('.cc-col-head__title h2').textContent === 'Journal'));
    // rename with a new address asks first
    click(btn('Rename'));
    await waitFor(() => $('form[aria-label="Rename collection"]'));
    typeIn($('#cc-ren-slug'), 'Our Journal');
    click(btn('Save', $('form[aria-label="Rename collection"]')));
    const adlg = await waitFor(() => $('[role="alertdialog"]'));
    check('changing the address asks first and explains the old URLs forward', !!adlg && /\/our-journal\//.test(adlg.textContent) && /forward/.test(adlg.textContent));
    click(btn('Change address', adlg));
    await waitFor(() => COL_SAVES.length === 2, 2000);
    check('…then saves the cleaned slug and reminds to publish', COL_SAVES[1].slug === 'our-journal' && !!(await waitFor(() => /address changed/.test($('[role="status"]')?.textContent || ''))));

    // multi-select
    const cb = (t) => $$('tbody tr').find((r) => r.textContent.includes(t)).querySelector('input[type="checkbox"]');
    check('no selection bar until something is selected', !$('[aria-label="Selected items"]'));
    click(cb('Live post'));
    cb('Draft post').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    const bar = await waitFor(() => $('[aria-label="Selected items"]'));
    check('shift-click selects a range; the bar shows the count', !!bar && /3 selected/.test(bar.textContent) && cb('Old post').checked);
    check('…Archive and Unarchive are offered for a mixed selection, plus Move and Delete', !!btn('Archive', bar) && !!btn('Unarchive', bar) && !!btn('Delete', bar) && !!bar.querySelector('select[aria-label="Move to collection"]'));
    click(btn('Archive', bar));
    await waitFor(() => BULK.length === 1, 2000);
    check('Archive sends only the items not archived yet, in one request', BULK[0].op === 'archive' && BULK[0].ids.join() === 'i1,i3');
    check('…and the list updates', !!(await waitFor(() => $$('tbody tr').filter((r) => r.children[3].textContent === 'Archived').length === 3)));
    // select all → move to the other collection (one is refused there)
    click($('thead input[aria-label="Select all items"]'));
    await waitFor(() => /4 selected/.test($('[aria-label="Selected items"]')?.textContent || ''));
    const sel = $('select[aria-label="Move to collection"]');
    check('the move list offers the other collections only', $$('option', sel).map((o) => o.value).join() === ',c2');
    Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(sel, 'c2'); sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(20);
    click(btn('Move', $('[aria-label="Selected items"]')));
    await waitFor(() => BULK.length === 2, 2000);
    check('Move sends the selected items and the destination', BULK[1].op === 'move' && BULK[1].collection_id === 'c2' && BULK[1].ids.length === 4);
    const moved = await waitFor(() => $$('tbody tr').length === 1 && $$('tbody tr'));
    check('…moved items leave the list; a refused one stays and is explained', !!moved && /Clash post/.test(moved[0].textContent) && /skipped/.test(doc.body.textContent) && /already used/.test(doc.body.textContent));
    check('…the selection keeps only what is still listed', /1 selected/.test($('[aria-label="Selected items"]')?.textContent || ''));
    check('…and the item counts are refreshed', !!(await waitFor(() => $$('.cc-col-row', nav).find((r) => r.textContent.includes('Recipes'))?.querySelector('.ui-badge')?.textContent === '3')));
    click(btn('Delete', $('[aria-label="Selected items"]')));
    const ddlg = await waitFor(() => $('[role="alertdialog"]'));
    check('bulk delete asks first, saying the pages go offline', !!ddlg && /Delete 1 item\?/.test(ddlg.textContent) && /offline/.test(ddlg.textContent));
    click(btn('Delete 1 item', ddlg));
    await waitFor(() => BULK.length === 3, 2000);
    check('…then deletes them', BULK[2].op === 'delete' && BULK[2].ids.join() === 'i4' && !!(await waitFor(() => $('.ui-empty'))));
  }

  console.log('\nSTORE & SAVING');
  {
    const { newBlockId } = await vite.ssrLoadModule('/src/store/useStore.js');
    const ids = new Set(); for (let i = 0; i < 2000; i++) ids.add(newBlockId());
    check('block ids are unique even when made in the same millisecond', ids.size === 2000);
    useStore.setState({ blocks: [{ id: 't1', type: 'TEXT', styles: {}, content: { text: '<p>a</p>' } }, { id: 'sx', type: 'SECTION', styles: {}, content: {}, children: [] }], pastBlocks: [], futureBlocks: [] });
    st().addBlock('SECTION', 't1');
    check('"add inside" a Text block adds at the end of the page instead (no children on a Text)', !st().blocks[0].children && st().blocks.length === 3);
    st().addBlock('TEXT', 'gone-id');
    check('"add inside" a block that no longer exists adds at the end of the page', st().blocks.length === 4);
    st().moveBlock('t1', 'sx');
    check('dragging a block onto an EMPTY sibling container puts it inside', (st().blocks.find((b) => b.id === 'sx').children || []).some((c) => c.id === 't1'));
    useStore.setState({ blocks: [{ id: 'u1', type: 'TEXT', styles: {}, content: { text: '' } }], pastBlocks: [], futureBlocks: [] });
    for (const ch of 'hello') st().updateBlock('u1', { content: { text: (st().blocks[0].content.text || '') + ch } });
    check('typing in a field = one undo step, not one per key', st().pastBlocks.length === 1 && st().blocks[0].content.text === 'hello');
    st().undo();
    check('…and undo brings back the text before typing', st().blocks[0].content.text === '');

    // a save that runs while the user keeps editing: only what was sent counts as saved
    const { createEditorDraftTracker, editorSnapshot, editorScope } = await vite.ssrLoadModule('/src/session/draftTrackers.js');
    useStore.setState({ activePage: { id: 'pz', title: 'P' }, blocks: [{ id: 'z1', type: 'TEXT', styles: {}, content: { text: '<p>v1</p>' } }], editorRestored: false, isEditingMaster: false, editingMaster: null });
    const tr = createEditorDraftTracker({ getState: useStore.getState, setState: useStore.setState, setTimeoutFn: (f) => f(), clearTimeoutFn: () => {} });
    tr.start();
    useStore.setState({ blocks: [{ id: 'z1', type: 'TEXT', styles: {}, content: { text: '<p>v2</p>' } }] }); tr.evaluate();
    const sent = editorSnapshot(st()).page; const scope = editorScope(st());
    useStore.setState({ blocks: [{ id: 'z1', type: 'TEXT', styles: {}, content: { text: '<p>v3 typed during the save</p>' } }] }); tr.evaluate();
    tr.markSaved(sent, scope);
    check('edits made while a save is running stay "unsaved" (and backed up)', st().editorDirty === true);
    tr.markSaved(editorSnapshot(st()).page, editorScope(st()));
    check('…until they are saved too', st().editorDirty === false);
    tr.dispose();

    // reopening a page that has unsaved work from an earlier visit: offered, never deleted silently
    const drafts = await vite.ssrLoadModule('/src/session/drafts.js');
    drafts.setDraftUser('ann');
    useStore.setState({ activePage: { id: 'pk', title: 'K' }, blocks: [{ id: 'k1', type: 'TEXT', styles: {}, content: { text: '<p>server</p>' } }], editorRestored: false });
    const kScope = editorScope(st());
    drafts.saveDraft(kScope, { page: { page: { id: 'pk', title: 'K' }, blocks: [{ id: 'k1', type: 'TEXT', styles: {}, content: { text: '<p>unsaved edit</p>' } }] }, master: null });
    let tk = createEditorDraftTracker({ getState: useStore.getState, setState: useStore.setState, setTimeoutFn: (f) => f(), clearTimeoutFn: () => {} });
    tk.start();
    check('reopening a page with a backup offers to restore it', !!st().editorDraftFound);
    tk.dispose();
    check('…leaving without deciding keeps the backup', !!drafts.readDraft(kScope) && !st().editorDraftFound);
    tk = createEditorDraftTracker({ getState: useStore.getState, setState: useStore.setState, setTimeoutFn: (f) => f(), clearTimeoutFn: () => {} });
    tk.start(); tk.restoreFound();
    check('…and Restore brings the unsaved edit back (as unsaved)', st().blocks[0].content.text === '<p>unsaved edit</p>' && st().editorRestored === true && st().editorDirty === true);
    tk.dispose();
    check('leaving resets the "restored" flag (it must not follow to another page)', st().editorRestored === false);
  }
} catch (e) {
  failedRun = true; fails++; total++;
  console.error('  ✗ EXCEPTION: ' + ((e && e.stack) || e).toString().split('\n').slice(0, 6).join(' | '));
}
try { root?.unmount(); } catch { /* noop */ }
await vite.close();
console.log(`\n${fails === 0 ? 'UI SHELL OK' : fails + ' checks failed'} (${total} checks)${failedRun ? ' — aborted by an exception' : ''}`);
process.exit(fails === 0 ? 0 : 1);
