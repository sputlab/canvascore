// tests/languages.mjs
// Multilingual sites, the editor's side, with the real components mounted in jsdom (Vite SSR):
//  - the helpers (language of a page, addresses, translations, slugs per language);
//  - Administration › Languages: add, default, remove, texts, save;
//  - Pages and Collections: language filter, badges, translations, Translate;
//  - Page Settings: language, translations, unlink; the Language Switcher block (panel, preview);
//  - Menu and header/footer per language; the sidebar entry.
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

// ---- a small fake server
let LANGS = { enabled: true, default: 'en', list: [{ code: 'en', name: 'English' }, { code: 'it', name: 'Italiano' }], strings: { it: { cookie: { acceptLabel: 'Accetta' } } } };
let SETTINGS = { siteUrl: '', siteName: 'Acme' };
const calls = [];
const PAGES = [
  { id: 'p1', title: 'Home', clean_slug: 'home', status: 'published', is_home: 1, lang: 'en', trans_group: 'tg_h', updated_at: '2026-10-01 10:00:00', content_json: '[]' },
  { id: 'p1it', title: 'Benvenuti', clean_slug: 'home', status: 'published', is_home: 1, lang: 'it', trans_group: 'tg_h', updated_at: '2026-10-02 10:00:00', content_json: '[]' },
  { id: 'p2', title: 'About us', clean_slug: 'about', status: 'published', is_home: 0, lang: 'en', trans_group: '', updated_at: '2026-10-05 10:00:00', content_json: '[]' },
  { id: 'p3', title: 'Contatti', clean_slug: 'contatti', status: 'draft', is_home: 0, lang: 'it', trans_group: '', updated_at: '2026-10-03 10:00:00', content_json: '[]' },
];
const COLS = [{ id: 'c1', name: 'Blog', slug: 'blog' }];
const ITEMS = [
  { id: 'i1', collection_id: 'c1', title: 'Hello', slug: 'hello', date: '2026-10-03', status: 'published', archived: 0, lang: 'en', trans_group: 'tg_i' },
  { id: 'i1it', collection_id: 'c1', title: 'Ciao', slug: 'ciao', date: '2026-10-03', status: 'draft', archived: 0, lang: 'it', trans_group: 'tg_i' },
  { id: 'i2', collection_id: 'c1', title: 'Second', slug: 'second', date: '2026-10-02', status: 'published', archived: 0, lang: 'en', trans_group: '' },
];
let MENU = { items: [{ id: 'm1', title: 'About', url: 'about/index.html', children: [] }], settings: {}, langs: { it: { items: [{ id: 'm1', title: 'Chi siamo', url: 'it/contatti/index.html', children: [] }] } } };
let PARTS = { header: [{ id: 'hd', type: 'TEXT', styles: {}, content: { text: '<p>HEADER EN</p>' } }], footer: [], 'header:it': [{ id: 'hdi', type: 'TEXT', styles: {}, content: { text: '<p>HEADER IT</p>' } }] };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ u, body: init.body });
  const body = () => JSON.parse(init.body || '{}');
  if (u.includes('save_languages')) { const b = body(); LANGS = { ...b }; return new Response(JSON.stringify({ success: true, languages: LANGS, active: true, clash: [], message: 'Languages saved. Publish the site to apply them.' })); }
  if (u.includes('get_languages')) return new Response(JSON.stringify({ success: true, languages: LANGS, active: true, max: 12 }));
  if (u.includes('get_settings')) return new Response(JSON.stringify(SETTINGS));
  if (u.includes('save_settings')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('translate_page')) { const b = body(); const src = PAGES.find((p) => p.id === b.id); const np = { ...src, id: 'p-new', title: src.title, lang: b.lang, trans_group: src.trans_group || 'tg_new', status: 'draft', is_home: 0, clean_slug: src.clean_slug + '-' + b.lang }; PAGES.unshift(np); return new Response(JSON.stringify({ success: true, page: np, message: 'The translation was created as a draft.' })); }
  if (u.includes('translate_item')) { const b = body(); const src = ITEMS.find((p) => p.id === b.id); const ni = { ...src, id: 'i-new', lang: b.lang, trans_group: src.trans_group || 'tg_new', status: 'draft' }; ITEMS.unshift(ni); return new Response(JSON.stringify({ success: true, item: ni, message: 'The translation was created as a draft.' })); }
  if (u.includes('unlink_translation')) return new Response(JSON.stringify({ success: true, message: 'Unlinked from its translations.' }));
  if (u.includes('get_pages')) return new Response(JSON.stringify(PAGES));
  if (u.includes('get_collections')) return new Response(JSON.stringify(COLS.map((c) => ({ ...c, item_count: ITEMS.length }))));
  if (u.includes('get_items')) return new Response(JSON.stringify(ITEMS));
  if (u.includes('get_item&')) { const it = ITEMS.find((x) => u.includes('id=' + x.id)); return new Response(JSON.stringify({ ...it, content_json: '[]', field_values: '{}', terms_json: '{}' })); }
  if (u.includes('get_taxonomies')) return new Response(JSON.stringify([]));
  if (u.includes('get_menu')) return new Response(JSON.stringify(MENU));
  if (u.includes('save_menu')) { MENU = body(); return new Response(JSON.stringify({ success: true })); }
  if (u.includes('get_parts')) return new Response(JSON.stringify(PARTS));
  if (u.includes('delete_part')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('rebuild_all')) return new Response(JSON.stringify({ success: true, message: 'Published.' }));
  if (u.includes('save_page')) return new Response(JSON.stringify({ success: true }));
  if (u.includes('save_item')) return new Response(JSON.stringify({ success: true, id: body().id }));
  if (u.includes('action=branding')) return new Response(JSON.stringify({ siteName: 'Acme', faviconUrl: '' }));
  return new Response(JSON.stringify([]));
};

const vite = await createServer({
  root: PROJECT, configFile: false, logLevel: 'error', appType: 'custom', clearScreen: false,
  server: { middlewareMode: true, hmr: false, watch: null }, plugins: [react()],
  define: { __APP_VERSION__: '"test"', __APP_BUILD__: '0', __BLOCK_DEFS__: JSON.stringify(blockDefs) },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const doc = w.document;
const $ = (sel, root = doc) => root.querySelector(sel);
const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const typeIn = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const choose = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const btn = (txt, root = doc) => $$('button', root).find((b) => b.textContent.trim() === txt);
const btnHas = (txt, root = doc) => $$('button', root).find((b) => b.textContent.includes(txt));

const L = await vite.ssrLoadModule('/src/editor/languages.js');
const { slugOwner, uniqueSlug } = await vite.ssrLoadModule('/src/utils/slug.js');
const { livePageUrl } = await vite.ssrLoadModule('/src/editor/liveUrl.js');
const { useStore } = await vite.ssrLoadModule('/src/store/useStore.js');
const AdminLayout = (await vite.ssrLoadModule('/src/components/AdminLayout.jsx')).default;
const Languages = (await vite.ssrLoadModule('/src/components/Languages.jsx')).default;
const PageManager = (await vite.ssrLoadModule('/src/components/PageManager.jsx')).default;
const Collections = (await vite.ssrLoadModule('/src/components/Collections.jsx')).default;
const PageSettings = (await vite.ssrLoadModule('/src/components/panel/PageSettings.jsx')).default;
const MenuBuilder = (await vite.ssrLoadModule('/src/components/MenuBuilder.jsx')).default;
const GlobalSettings = (await vite.ssrLoadModule('/src/components/GlobalSettings.jsx')).default;
const VisualEditor = (await vite.ssrLoadModule('/src/components/VisualEditor.jsx')).default;
const { Toaster } = await vite.ssrLoadModule('/src/ui/toast.jsx');
const { DialogHost } = await vite.ssrLoadModule('/src/ui/dialogHost.jsx');
const { BLOCKS } = await vite.ssrLoadModule('/src/editor/blockCatalog.js');
const { CONTENT_PANELS } = await vite.ssrLoadModule('/src/components/panel/blocks/index.js');
const { renderBlock } = await vite.ssrLoadModule('/src/render/renderBlock.mjs');
const { createRoot } = await import('react-dom/client');
const React = await import('react');
let root = null;
const mount = (el) => { if (root) root.unmount(); doc.getElementById('root').innerHTML = ''; root = createRoot(doc.getElementById('root')); root.render(React.createElement(React.Fragment, null, el, React.createElement(Toaster), React.createElement(DialogHost))); };
const st = () => useStore.getState();
const confirmOk = async (label) => { const b = await waitFor(() => $$('[role="dialog"] button, [role="alertdialog"] button').find((x) => x.textContent.trim() === label)); if (b) click(b); return !!b; };

try {
  console.log('HELPERS');
  const cfg = { enabled: true, default: 'en', list: [{ code: 'en', name: 'English' }, { code: 'it', name: 'Italiano' }, { code: 'pt-br', name: 'Português' }] };
  check('a language code is 2–3 letters and an optional region, lowercased; anything else is nothing', L.cleanCode(' IT ') === 'it' && L.cleanCode('pt-BR') === 'pt-br' && L.cleanCode('../x') === '' && L.cleanCode('a') === '' && L.cleanCode('english') === '' && L.cleanCode(null) === '');
  check('…and is written as browsers write it', L.langTag('pt-br') === 'pt-BR' && L.langTag('it') === 'it' && L.langTag('zh-hans') === 'zh-hans');
  check('a site is multilingual when it is switched on and has at least two languages', L.isMultilingual(cfg) && !L.isMultilingual({ ...cfg, enabled: false }) && !L.isMultilingual({ enabled: true, list: [{ code: 'en' }] }) && !L.isMultilingual(null));
  check('the language of a page: its own, the default\'s when it has none or has a language the site does not have; nothing on a one-language site', L.langOf({ lang: 'it' }, cfg) === 'it' && L.langOf({ lang: '' }, cfg) === 'en' && L.langOf({}, cfg) === 'en' && L.langOf({ lang: 'xx' }, cfg) === 'en' && L.langOf({ lang: 'it' }, { ...cfg, enabled: false }) === '');
  check('the folder of a language: none for the default', L.langPrefix('it', cfg) === 'it/' && L.langPrefix('en', cfg) === '' && L.langPrefix('', cfg) === '' && L.langPrefix('it', null) === '');
  const home = { clean_slug: 'welcome', is_home: 1, lang: 'en' }, homeIt = { clean_slug: 'home', is_home: 1, lang: 'it' };
  check('where a page is online: its slug in its language\'s folder; a home page, or index/home, is the root of the folder', L.pagePath({ clean_slug: 'about', lang: 'en' }, cfg) === '/about/' && L.pagePath({ clean_slug: 'chi-siamo', lang: 'it' }, cfg) === '/it/chi-siamo/' && L.pagePath(home, cfg) === '/' && L.pagePath(homeIt, cfg) === '/it/' && L.pagePath({ clean_slug: 'index', lang: 'pt-br' }, cfg) === '/pt-br/' && L.pagePath({ clean_slug: 'about', lang: 'it' }, null) === '/about/');
  check('…the link values for menus, buttons and text', L.pageFile({ clean_slug: 'chi-siamo', lang: 'it' }, cfg) === 'it/chi-siamo/index.html' && L.pageFile(home, cfg) === 'index.html' && L.pageFile(homeIt, cfg) === 'it/index.html' && L.pageLink({ clean_slug: 'chi-siamo', lang: 'it' }, cfg) === '{{BASE_URL}}it/chi-siamo/' && L.pageLink(home, cfg) === '{{BASE_URL}}' && L.pageLink({ clean_slug: 'about' }, cfg) === '{{BASE_URL}}about/');
  const rows = [{ id: 'a', lang: 'en', trans_group: 'g' }, { id: 'b', lang: 'it', trans_group: 'g' }, { id: 'c', lang: 'en', trans_group: '' }, { id: 'd', lang: 'en', trans_group: 'g', is_draft_copy: 1 }];
  check('translations: the other rows of the group (never a draft copy); the languages left to translate into', L.translationsOf(rows, rows[0]).map((r) => r.id).join() === 'b' && L.translationsOf(rows, rows[2]).length === 0 && L.missingLanguages(rows, rows[0], cfg).map((l) => l.code).join() === 'pt-br' && L.missingLanguages(rows, rows[2], cfg).map((l) => l.code).join() === 'it,pt-br' && L.missingLanguages(rows, rows[0], { ...cfg, enabled: false }).length === 0);
  check('slugs belong to a language: the same address in two languages is fine, not twice in one; the default language may not take the folder of another', slugOwner('about', { pages: PAGES, lang: 'it', cfg }) === null && slugOwner('about', { pages: PAGES, lang: 'en', cfg })?.label.includes('About us') && slugOwner('it', { pages: [], lang: 'en', cfg })?.label === 'the folder of a language' && slugOwner('it', { pages: [], lang: 'it', cfg }) === null && slugOwner('about', { pages: PAGES }) !== null);
  check('…and a free variant is found per language', uniqueSlug('About', { pages: PAGES, lang: 'it', cfg }) === 'about' && uniqueSlug('About', { pages: PAGES, lang: 'en', cfg }) === 'about-2');
  check('the live address of a page of another language is in its folder (also an item and a header)', livePageUrl({ id: 'x', status: 'published', clean_slug: 'chi-siamo', lang: 'it' }, [], null, cfg) === '../it/chi-siamo/' && livePageUrl({ __item: true, status: 'published', slug: 'ciao', lang: 'it' }, [], 'blog', cfg) === '../it/blog/ciao/' && livePageUrl({ __part: 'header', lang: 'it' }, [], null, cfg) === '../it/' && livePageUrl({ id: 'x', status: 'published', clean_slug: 'about', lang: 'en' }, [], null, cfg) === '../about/');

  console.log('\nLANGUAGES SCREEN');
  useStore.setState({ currentView: 'languages', userRole: 'admin', username: 'ann', pages: PAGES, languages: LANGS });
  mount(React.createElement(AdminLayout, null, React.createElement(Languages)));
  await waitFor(() => $('nav.ui-nav'));
  check('administrators have Languages in the sidebar', !!btn('Languages', $('nav.ui-nav')));
  const tableRows = () => $$('tbody tr[data-lang]');
  await waitFor(() => tableRows().length === 2);
  check('the languages of the site: code, name, address, which one is the default', tableRows().length === 2 && tableRows()[0].textContent.includes('en') && $('input[aria-label="Name of it"]').value === 'Italiano' && tableRows()[1].textContent.includes('/it/') && $('input[aria-label="English is the default language"]').checked);
  check('nothing to save until something changes', btn('Save languages').disabled);
  choose($('select'), 'de'); await sleep(30);
  click(btn('Add')); await sleep(40);
  check('adding a language from the list: it appears (with its own address) and the list no longer offers it', tableRows().length === 3 && tableRows()[2].textContent.includes('/de/') && $('input[aria-label="Name of de"]').value === 'Deutsch' && !$$('select option').some((o) => o.value === 'de'));
  typeIn($('input[aria-label="Name of de"]'), 'Deutsch (Schweiz)'); await sleep(20);
  click($('input[aria-label="Italiano is the default language"]')); await sleep(30);
  check('the default can be changed, the names can be written', $('input[aria-label="Italiano is the default language"]').checked && tableRows()[1].textContent.includes('/it/') === false && tableRows()[0].textContent.includes('/en/'));
  click($('input[aria-label="English is the default language"]')); await sleep(20);
  const det = $$('details').find((d) => d.textContent.includes('not in the list')); det.open = true;
  typeIn($$('input', det)[0], 'SQ'); typeIn($$('input', det)[1], 'Shqip'); await sleep(20);
  click(btn('Add', det)); await sleep(30);
  check('a language that is not in the list can be added by its code', tableRows().length === 4 && !!$('input[aria-label="Name of sq"]'));
  typeIn($$('input', det)[0], '../x'); await sleep(10); click(btn('Add', det)); await sleep(30);
  check('…a code that is not a code is refused with a message', tableRows().length === 4 && !!(await waitFor(() => $$('.ui-toast').some((t) => /two or three letters/.test(t.textContent)))));
  click($('button[aria-label="Remove Shqip"]'));
  check('removing a language asks first, and says what it means for the pages written in it', await confirmOk('Remove language') && (await waitFor(() => tableRows().length === 3)) !== null);
  click($('button[aria-label="Remove Italiano"]'));
  check('…a language with pages in it says how many stop being published', !!(await waitFor(() => $$('[role="dialog"], [role="alertdialog"]').some((d) => /2 pages in this language will no longer be published/.test(d.textContent)))));
  const dlg = $$('button').find((b) => b.textContent.trim() === 'Cancel' || b.textContent.trim() === 'Keep'); if (dlg) click(dlg);
  await sleep(40);
  check('…and Cancel keeps it', tableRows().length === 3);
  const detT = await waitFor(() => $$('details[data-texts]')[0]);
  check('texts per language (announcement bar, cookie banner) for each language except the default one; a saved text is shown', $$('details[data-texts]').length === 2 && !!$('input[aria-label="Italiano: Accept button"]') && $('input[aria-label="Italiano: Accept button"]').value === 'Accetta' && !!detT);
  typeIn($('input[aria-label="Italiano: Text of the bar"]'), 'Sconti su tutto'); await sleep(20);
  calls.length = 0;
  click(btn('Save languages'));
  const sv = await waitFor(() => calls.find((c) => c.u.includes('save_languages')));
  const sent = sv && JSON.parse(sv.body);
  check('saving sends the list, the default and the texts', !!sent && sent.enabled === true && sent.default === 'en' && sent.list.map((l) => l.code).join() === 'en,it,de' && sent.list[2].name === 'Deutsch (Schweiz)' && sent.strings.it.announcement.text === 'Sconti su tutto' && sent.strings.it.cookie.acceptLabel === 'Accetta');
  await sleep(60);
  check('…the store follows, and the button waits for the next change', st().languages.list.length === 3 && btn('Save languages').disabled && !!$$('.ui-toast').some((t) => /Languages saved/.test(t.textContent)));
  check('without a site address the screen says hreflang needs one', /site address/.test($('.ui-card').parentElement.textContent) && /Site address/.test(doc.body.textContent));
  useStore.setState({ languages: LANGS = { enabled: true, default: 'en', list: [{ code: 'en', name: 'English' }, { code: 'it', name: 'Italiano' }], strings: {} } });
  useStore.setState({ userRole: 'editor' }); await sleep(30);
  check('an editor does not see the entry', !btn('Languages', $('nav.ui-nav')));
  useStore.setState({ userRole: 'admin' });

  console.log('\nPAGES');
  useStore.setState({ currentView: 'manager', userRole: 'admin', pages: PAGES, languages: LANGS });
  mount(React.createElement(PageManager));
  const prow = () => $$('tbody tr');
  await waitFor(() => prow().length === 4);
  const homeRow = () => prow().find((r) => r.textContent.includes('Home'));
  check('a multilingual site shows the language of each page, the translations it has and the ones it lacks', !!homeRow() && $('[data-testid="page-languages"]', homeRow()).textContent.includes('EN') && /IT/.test($('[data-testid="page-languages"]', homeRow()).textContent) && !!btnHas('+ IT', prow().find((r) => r.textContent.includes('About us'))) && !btnHas('+ IT', homeRow()));
  check('…the address is the page\'s real one, language folder included', prow().find((r) => r.textContent.includes('Contatti')).textContent.includes('/it/contatti/') && homeRow().textContent.includes('/'));
  choose($('select[aria-label="Filter by language"]'), 'it'); await sleep(40);
  check('filter by language', prow().length === 2 && prow().every((r) => /Benvenuti|Contatti/.test(r.textContent)));
  choose($('select[aria-label="Filter by language"]'), ''); await sleep(40);
  calls.length = 0;
  click($('button[aria-label="Translate About us into Italiano"]'));
  const tr = await waitFor(() => calls.find((c) => c.u.includes('translate_page')));
  check('Translate asks the server for a draft copy in the language, then opens it in the editor', !!tr && JSON.parse(tr.body).id === 'p2' && JSON.parse(tr.body).lang === 'it' && (await waitFor(() => st().currentView === 'editor' && st().activePage && st().activePage.id === 'p-new')) !== null && st().activePage.lang === 'it');
  PAGES.shift();

  console.log('\nCOLLECTIONS');
  useStore.setState({ currentView: 'collections', userRole: 'admin', languages: LANGS, activePage: null });
  mount(React.createElement(Collections));
  click(await waitFor(() => $$('.cc-col-nav button, nav button, button').find((b) => b.textContent.trim().startsWith('Blog') && !b.getAttribute('aria-label'))));
  const irow = () => $$('tbody tr');
  await waitFor(() => irow().length === 3);
  const helloRow = () => irow().find((r) => r.textContent.includes('Hello'));
  check('items show their language, their translations and the ones they lack', !!helloRow() && /EN/.test($('[data-testid="item-languages"]', helloRow()).textContent) && /IT/.test($('[data-testid="item-languages"]', helloRow()).textContent) && !!btnHas('+ IT', irow().find((r) => r.textContent.includes('Second'))) && !btnHas('+ IT', helloRow()));
  choose($('select[aria-label="Filter items by language"]'), 'it'); await sleep(40);
  check('filter the items by language', irow().length === 1 && irow()[0].textContent.includes('Ciao'));
  choose($('select[aria-label="Filter items by language"]'), ''); await sleep(40);
  calls.length = 0;
  click($('button[aria-label="Translate Second into Italiano"]'));
  const ti = await waitFor(() => calls.find((c) => c.u.includes('translate_item')));
  check('Translate on an item asks for a draft copy and opens it in the editor, in its language', !!ti && JSON.parse(ti.body).id === 'i2' && (await waitFor(() => st().currentView === 'editor' && st().activePage && st().activePage.__item && st().activePage.id === 'i-new')) !== null && st().activePage.lang === 'it' && st().activePage.trans_group === 'tg_new');
  ITEMS.shift();

  console.log('\nPAGE SETTINGS');
  const settingsCtx = (page, extra = {}) => ({ activePage: page, updateActivePage: st().updateActivePage, pages: PAGES, collections: COLS, coverInputRef: { current: null }, blocks: [], ...extra });
  useStore.setState({ activePage: { ...PAGES[0] }, languages: LANGS, editorDirty: false });
  mount(React.createElement(PageSettings, { ctx: settingsCtx({ ...PAGES[0] }) }));
  const sel = await waitFor(() => $('#cc-page-lang'));
  check('Page Settings has a Language section: the language of the page, fixed while it has translations', !!sel && sel.value === 'en' && sel.disabled && /fixed while it is linked/.test(doc.body.textContent));
  check('…its translations are listed (open one) and there is nothing left to translate into on a two-language site', !!$('[data-translation="p1it"]') && /Italiano/.test($('[data-translation="p1it"]').textContent) && !btnHas('Translate into') && !!btnHas('Unlink from its translations'));
  mount(React.createElement(PageSettings, { ctx: settingsCtx({ ...PAGES[2] }) }));
  await waitFor(() => $('#cc-page-lang') && !$('#cc-page-lang').disabled);
  check('a page without translations can change language, and offers to translate', !$('#cc-page-lang').disabled && !!btnHas('Translate into Italiano') && /No translations yet/.test(doc.body.textContent));
  useStore.setState({ activePage: { ...PAGES[2] } });
  mount(React.createElement(PageSettings, { ctx: settingsCtx(st().activePage) }));
  await waitFor(() => $('#cc-page-lang'));
  choose($('#cc-page-lang'), 'it'); await sleep(40);
  check('changing the language updates the page being edited', st().activePage.lang === 'it');
  useStore.setState({ activePage: { ...PAGES[2] }, editorDirty: true });
  mount(React.createElement(PageSettings, { ctx: settingsCtx(st().activePage) }));
  await waitFor(() => btnHas('Translate into Italiano'));
  check('with unsaved changes the translation waits (it starts from the saved version)', btnHas('Translate into Italiano').disabled && /Save first/.test(doc.body.textContent));
  useStore.setState({ editorDirty: false, languages: { ...LANGS, enabled: false } });
  mount(React.createElement(PageSettings, { ctx: settingsCtx({ ...PAGES[2] }) }));
  await sleep(60);
  check('a site that is not multilingual shows none of this', !$('#cc-page-lang'));
  useStore.setState({ languages: LANGS });

  console.log('\nLANGUAGE SWITCHER');
  check('the block is in the catalog, has a settings panel, and the editor renders nothing for it (the links are made when the site is published)', BLOCKS.some((b) => b.type === 'LANGUAGE_SWITCHER' && b.label === 'Language Switcher') && !!CONTENT_PANELS.LANGUAGE_SWITCHER && renderBlock({ id: 'sw', type: 'LANGUAGE_SWITCHER', styles: {}, content: {} }) === '');
  check('its defaults are a row of names with the current language shown', blockDefs.types.LANGUAGE_SWITCHER.content.style === 'list' && blockDefs.types.LANGUAGE_SWITCHER.content.labels === 'name' && blockDefs.types.LANGUAGE_SWITCHER.content.showCurrent === true);
  const swBlock = (content) => ({ id: 'sw1', type: 'LANGUAGE_SWITCHER', styles: { ...blockDefs.types.LANGUAGE_SWITCHER.styles }, content: { ...blockDefs.types.LANGUAGE_SWITCHER.content, ...content } });
  useStore.setState({ currentView: 'editor', activePage: { ...PAGES[2], lang: 'en' }, blocks: [swBlock({})], selectedBlockId: 'sw1', isEditingMaster: false, editorRestored: false, pastBlocks: [], futureBlocks: [], templates: [], masters: [], userRole: 'admin', viewport: 'desktop', languages: LANGS });
  mount(React.createElement(VisualEditor));
  const prev = await waitFor(() => $('[data-cc-lang-preview]'));
  check('on the canvas the block shows the languages of the site (the current one in bold)', !!prev && /English/.test(prev.textContent) && /Italiano/.test(prev.textContent) && !!$$('li', prev).find((li) => li.textContent === 'English' && li.style.fontWeight === '700'));
  check('its settings: look, names or codes, the current language', !!$$('select').find((s) => [...s.options].some((o) => o.value === 'dropdown')) && /Show the current language too/.test(doc.body.textContent));
  useStore.setState({ blocks: [swBlock({ style: 'dropdown', labels: 'code', showCurrent: false })], selectedBlockId: null });
  await waitFor(() => $('[data-cc-lang-preview] select'));
  const dd = $('[data-cc-lang-preview] select');
  check('as a drop-down of codes without the current language', !!dd && [...dd.options].map((o) => o.textContent).join() === 'IT');
  useStore.setState({ languages: { ...LANGS, enabled: false } });
  await waitFor(() => !$('[data-cc-lang-preview]'));
  check('a site with one language shows a hint instead', !$('[data-cc-lang-preview]') && /at least two languages/.test(doc.body.textContent));
  useStore.setState({ languages: LANGS });

  console.log('\nMENU AND HEADER PER LANGUAGE');
  useStore.setState({ currentView: 'menu', userRole: 'admin', pages: PAGES, languages: LANGS });
  mount(React.createElement(MenuBuilder));
  const menuLang = await waitFor(() => $('#menu-lang'));
  await waitFor(() => $$('input[placeholder="Label"]').length === 1);
  check('the menu builder offers a menu per language; a language without a menu of its own says it uses the default one', !!menuLang && [...menuLang.options].map((o) => o.textContent).join('|') === 'English (default)|Italiano');
  const rowsIn = () => $$('input[placeholder="Label"]').map((i) => i.value);
  check('the default language\'s items are shown first', rowsIn().join() === 'About');
  choose(menuLang, 'it'); await sleep(50);
  check('choosing a language shows its own menu', rowsIn().join() === 'Chi siamo');
  check('…whose page links offer the pages of that language, with their folder', $$('select').some((s) => [...s.options].some((o) => o.value === 'it/contatti/index.html')) && !$$('select').some((s) => [...s.options].some((o) => o.value === 'about/index.html' && o.textContent === 'About us')));
  click(btn('Use the default menu')); await sleep(40);
  check('"Use the default menu" drops its own', !btnHas('Use the default menu') && !!btnHas('Start from the default menu') && /uses the default menu/.test($('#menu-lang').textContent));
  click(btn('Start from the default menu')); await sleep(40);
  check('"Start from the default menu" copies it to write over', rowsIn().join() === 'About' && !!btnHas('Use the default menu'));
  typeIn($$('input[placeholder="Label"]')[0], 'Chi siamo'); await sleep(30);
  calls.length = 0;
  click(btnHas('Save & Publish'));
  const sm = await waitFor(() => calls.find((c) => c.u.includes('save_menu')));
  const smb = sm && JSON.parse(sm.body);
  check('saving sends the default menu and the menus of the languages that have one', !!smb && smb.items[0].title === 'About' && smb.langs.it.items[0].title === 'Chi siamo' && !smb.langs.en);
  PARTS['header:it'] = [{ id: 'hdi', type: 'TEXT', styles: {}, content: { text: '<p>HEADER IT</p>' } }];
  useStore.setState({ currentView: 'settings', userRole: 'admin', pages: PAGES, languages: LANGS, activePage: null });
  mount(React.createElement(GlobalSettings));
  const partLang = await waitFor(() => $('select[aria-label="Language of the header and footer"]'));
  check('Global Options: the header and the footer can be given to a language', !!partLang && [...partLang.options].map((o) => o.textContent).join('|') === 'English (default)|Italiano' && !!btnHas('Edit header') && !btnHas('Edit header (Italiano)'));
  choose(partLang, 'it'); await sleep(40);
  check('…the buttons say which one they open; deleting returns the language to the default', !!btnHas('Edit header (Italiano)') && !!btnHas('Use default'));
  click(btnHas('Edit header (Italiano)'));
  await waitFor(() => st().currentView === 'editor');
  check('a language\'s header opens in the editor with its own blocks and language', st().activePage.__part === 'header' && st().activePage.lang === 'it' && /Italiano/.test(st().activePage.title) && JSON.stringify(st().blocks).includes('HEADER IT'));
  calls.length = 0;
  useStore.setState({ currentView: 'editor', userRole: 'admin' });
  mount(React.createElement(VisualEditor));
  await waitFor(() => $('header.cc-ed-top'));
  await sleep(60);
  click(btnHas('Save', $('header.cc-ed-top')));
  const sp = await waitFor(() => calls.find((c) => c.u.includes('save_part')));
  check('…and is saved as that language\'s', !!sp && JSON.parse(sp.body).name === 'header' && JSON.parse(sp.body).lang === 'it');
  useStore.setState({ currentView: 'editor', activePage: { ...PAGES[3] }, blocks: [], languages: LANGS });
  calls.length = 0;
  mount(React.createElement(VisualEditor));
  await waitFor(() => $('header.cc-ed-top')); await sleep(60);
  click(btnHas('Save Draft', $('header.cc-ed-top')));
  const spg = await waitFor(() => calls.find((c) => c.u.includes('save_page')));
  check('saving a page of a multilingual site sends its language', !!spg && JSON.parse(spg.body).lang === 'it');
  useStore.setState({ languages: { ...LANGS, enabled: false } });
  await sleep(300);
  calls.length = 0;
  click(btnHas('Save Draft', $('header.cc-ed-top')));
  const spg2 = await waitFor(() => calls.find((c) => c.u.includes('save_page')));
  check('…and on a site that is not multilingual it sends none (the stored one is kept)', !!spg2 && !('lang' in JSON.parse(spg2.body)));
} catch (e) {
  console.error('  ✗ the test run stopped:', e && e.stack || e);
  fails++;
}
if (root) { try { root.unmount(); } catch { /* done */ } }
await vite.close();
console.log('\n' + (fails === 0 ? 'LANGUAGES OK' : `${fails} checks failed`) + ` (${total} checks)`);
process.exit(fails === 0 ? 0 : 1);
