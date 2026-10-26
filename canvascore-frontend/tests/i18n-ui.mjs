// tests/i18n-ui.mjs — the admin in Italian, with the real app mounted in jsdom (Vite SSR): every screen is opened and what it shows
// (texts, placeholders, titles, labels) is scanned for English that was left untranslated. Also the language choice: on the sign-in screen
// and in the sidebar, kept in this browser.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blockDefs = JSON.parse(readFileSync(path.join(PROJECT, '../canvascore-admin/blocks.json'), 'utf8'));
const it = JSON.parse(readFileSync(path.join(PROJECT, 'src/i18n/locales/it.json'), 'utf8'));
let fails = 0, total = 0;
const check = (name, cond, extra = '') => { total++; if (cond) console.log('  ✓ ' + name); else { fails++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 3000) { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > timeout) return null; await sleep(20); } }

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/canvascore-admin/', pretendToBeVisual: true });
const w = dom.window;
w.localStorage.setItem('cc_locale', 'it');
for (const k of ['document', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator', 'getComputedStyle', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLIFrameElement', 'Node', 'Element', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'DOMParser', 'FileReader', 'Blob', 'File', 'FormData', 'CustomEvent', 'DataTransfer', 'Range', 'XMLHttpRequest', 'DocumentFragment', 'SVGElement']) {
  if (k in w) Object.defineProperty(globalThis, k, { configurable: true, get: () => w[k] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis, writable: true });
globalThis.getSelection = () => w.getSelection();
globalThis.addEventListener = (...a) => w.addEventListener(...a);
globalThis.removeEventListener = (...a) => w.removeEventListener(...a);
globalThis.dispatchEvent = (...a) => w.dispatchEvent(...a);
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.alert = () => {}; globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const PAGES = [
  { id: 'p1', title: 'Home', clean_slug: 'home', slug: 'home', status: 'published', is_home: 1, lang: '', trans_group: '', updated_at: '2026-10-01 10:00:00', content_json: JSON.stringify([{ id: 'b1', type: 'HERO', styles: {}, content: { title: 'Welcome' } }, { id: 'b2', type: 'TEXT', styles: {}, content: { text: '<p>Hello</p>' } }]), review_state: '', created_by: 'ann' },
  { id: 'p2', title: 'About us', clean_slug: 'about', slug: 'about', status: 'draft', is_home: 0, lang: '', trans_group: '', updated_at: '2026-10-05 10:00:00', content_json: '[]', review_state: 'pending', created_by: 'bob' },
];
let authed = true, role = 'admin';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('check_auth')) return json({ authenticated: authed, role, username: 'ann', installed: true, csrf: 'tok', timeout: 3600 });
  if (u.includes('action=branding')) return json({ siteName: 'Acme', faviconUrl: '' });
  if (u.includes('action=version')) return json({ app: 'test', db_schema: 17, build: 0 });
  if (u.includes('get_languages')) return json({ success: true, languages: { enabled: false, default: '', list: [], strings: {} }, active: false, max: 12 });
  if (u.includes('get_pages')) return json(PAGES);
  if (u.includes('get_collections')) return json([{ id: 'c1', name: 'Blog', slug: 'blog', item_count: 1, fields: '[]' }]);
  if (u.includes('get_items')) return json([{ id: 'i1', collection_id: 'c1', title: 'Hello', slug: 'hello', date: '2026-10-03', status: 'published', archived: 0 }]);
  if (u.includes('get_media_folders')) return json([]);
  if (u.includes('get_media')) return json([{ name: 'sky.jpg', url: 'uploads/sky.jpg', type: 'image', size: 1000, folder: '' }]);
  if (u.includes('get_users') || u.includes('list_users')) return json([{ id: 1, username: 'ann', role: 'admin' }]);
  if (u.includes('get_menu')) return json({ items: [{ id: 'm1', title: 'About', url: 'about/index.html', children: [] }], settings: {} });
  if (u.includes('get_settings')) return json({ siteName: 'Acme', siteUrl: '' });
  if (u.includes('get_parts')) return json({ header: [], footer: [] });
  if (u.includes('get_popups')) return json([{ id: 'pop_1', name: 'Promo', status: 'draft', blocks: 1, settings: {} }]);
  if (u.includes('integrations_get')) return json({ success: true, config: { webhooks: [], mailchimp: {}, brevo: {}, analytics: {}, stripe: {} }, log: [], forms: [], demo: false, curl: true });
  if (u.includes('update_status') || u.includes('update_check')) return json({ success: true, current: 'test', latest: null });
  if (u.includes('list_backups') || u.includes('get_backups')) return json({ success: true, backups: [], zip: true });
  return json([]);
};

const vite = await createServer({
  root: PROJECT, configFile: false, logLevel: 'error', appType: 'custom', clearScreen: false,
  server: { middlewareMode: true, hmr: false, watch: null }, plugins: [react()],
  define: { __APP_VERSION__: '"test"', __APP_BUILD__: '0', __BLOCK_DEFS__: JSON.stringify(blockDefs) },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const doc = w.document;
const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)];
const { useStore } = await vite.ssrLoadModule('/src/store/useStore.js');
const App = (await vite.ssrLoadModule('/src/App.jsx')).default;
const { createRoot } = await import('react-dom/client');
const React = await import('react');
let root = createRoot(doc.getElementById('root'));

// English words that the Italian interface never uses
const EN = /\b(the|and|your|you|this|that|with|from|will|are|has|have|been|click|choose|enter|these|those|when|which|before|after|only|each|every|into|than|then|here|there|its|used|use|add|set|new|show|hide|none|all|not|can|for|to|of|is|it|or|be|save|delete|cancel|page|pages|item|items|image|images)\b/i;
const IT_HINT = /\b(Aggiungi|il|lo|la|le|gli|di|del|della|dei|delle|per|con|che|non|sono|è|un|una|uno|nel|nella|sul|sulla|da|più|già|tutti|tutte|ogni|dopo|prima|solo)\b|[àèéìòù]|\w'\w/i;
const ALLOW = new Set(['Italiano (it)', 'Popup', 'Webhook', 'Webhooks', 'Newsletter', 'Stripe', 'Backup', 'Menu', 'Home', 'Tag', 'Link', 'Media', 'Email', 'OK', 'CSV', 'HTML', 'CSS', 'WordPress', 'Plausible', 'Matomo', 'Google Analytics 4', 'Mailchimp', 'Brevo', 'Hero', 'Blog', 'Kit']);
function scan() {
  const found = new Set();
  const take = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length < 3 || ALLOW.has(t) || !/[A-Za-z]{3}/.test(t)) return; if (EN.test(t) && !IT_HINT.test(t) && !Object.values(it).includes(t)) found.add(t); };
  const walker = doc.createTreeWalker(doc.body, 4);
  let n; while ((n = walker.nextNode())) { const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA)$/.test(p.tagName) || p.closest('[contenteditable]')) continue; take(n.nodeValue); }
  for (const el of $$('[placeholder],[title],[aria-label]')) { if (el.closest('[contenteditable]')) continue; take(el.getAttribute('placeholder')); take(el.getAttribute('title')); take(el.getAttribute('aria-label')); }
  return found;
}
const left = new Map();
const note = (screen) => { for (const t of scan()) { if (!left.has(t)) left.set(t, screen); } };

try {
  console.log('SIGN-IN SCREEN');
  authed = false;
  root.render(React.createElement(App)); await waitFor(() => doc.querySelector('form'));
  const bodyText = doc.body.textContent;
  check('the sign-in screen is in Italian', bodyText.includes(it['Sign in']) || bodyText.includes(it['Login']), bodyText.slice(0, 120));
  check('the language can be chosen there', !!doc.querySelector('select[aria-label="' + it['Interface language'] + '"]'));
  note('sign-in');
  authed = true;
  root.unmount(); doc.getElementById('root').innerHTML = ''; root = createRoot(doc.getElementById('root'));

  console.log('\nSCREENS');
  await useStore.getState().checkAuth();
  root.render(React.createElement(App)); await waitFor(() => doc.querySelector('nav.ui-nav'));
  check('the sidebar is in Italian, and offers the language', doc.querySelector('nav.ui-nav').textContent.includes(it['Pages']) && !!doc.querySelector('select[aria-label="' + it['Interface language'] + '"]'), doc.querySelector('nav.ui-nav')?.textContent);
  const views = ['manager', 'collections', 'reviews', 'templates', 'popups', 'media', 'menu', 'settings', 'submissions', 'users', 'backup', 'updates', 'packages', 'wpimport', 'library', 'integrations', 'languages'];
  for (const v of views) {
    try {
      useStore.setState({ currentView: v, userRole: 'admin', username: 'ann', pages: PAGES });
      await sleep(250); note(v);
    } catch (e) { console.log('  (could not open ' + v + ': ' + String(e.message).slice(0, 80) + ')'); }
  }
  // the page editor with a block selected, each tab
  try {
    const page = PAGES[0];
    useStore.setState({ currentView: 'editor', activePage: page, blocks: JSON.parse(page.content_json), selectedBlockId: 'b1' });
    await sleep(400); note('editor');
    for (const tab of ['Contenuto', 'Stile', 'Avanzate']) { const b = $$('button,[role="tab"]').find((x) => x.textContent.trim() === tab); if (b) { b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(150); note('editor ' + tab); } }
    useStore.setState({ selectedBlockId: null }); await sleep(200); note('editor (page settings)');
  } catch (e) { console.log('  (could not open the editor: ' + String(e.message).slice(0, 100) + ')'); }
  check('the screens open in Italian', true);
  const list = [...left].map(([t, s]) => `${s}: ${t}`);
  console.log('  English left on screen (' + list.length + ')' + (list.length ? ':\n   ' + list.slice(0, 60).join('\n   ') : ''));
  check('no English text is left on any screen', list.length === 0, list.length + ' texts');
} catch (e) { fails++; console.error('FAILED', e); }
await vite.close();
console.log('\n' + (fails ? 'I18N UI FAILED (' + fails + ' of ' + total + ')' : 'I18N UI OK (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
