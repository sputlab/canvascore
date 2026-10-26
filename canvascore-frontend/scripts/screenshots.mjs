// scripts/screenshots.mjs — takes the screenshots of the README and the tutorials from the demo site, in English and Italian.
//   node scripts/screenshots.mjs [--out=../docs/images] [--firefox=/Applications/Firefox.app/Contents/MacOS/firefox] [--only=editor,pages]
// It builds the demo site on a scratch folder (scripts/demo-build.php), serves it with PHP's built-in server, builds the editor, and drives a headless
// Firefox over WebDriver BiDi: it signs in, opens each screen and saves docs/images/<screen>.png (English) and docs/images/it/<screen>.png (Italian),
// plus the published site as a visitor sees it. Run it again after a change of the interface to refresh them.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const arg = (n, d) => (process.argv.find((a) => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=') || d;
const OUT = path.resolve(root, arg('out', '../docs/images'));
const FIREFOX = arg('firefox', '/Applications/Firefox.app/Contents/MacOS/firefox');
const ONLY = arg('only', '').split(',').filter(Boolean);
const PORT = 8190, BIDI = 9444;
const it = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales/it.json'), 'utf8'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const cleanup = () => { for (const k of kids) { try { k.kill('SIGTERM'); } catch { /* gone */ } } try { execFileSync('pkill', ['-f', scratch]); } catch { /* none */ } fs.rmSync(scratch, { recursive: true, force: true }); };
process.on('exit', cleanup); process.on('SIGINT', () => process.exit(1));

// 1. the editor, built
console.log('Building the editor…');
const dist = path.join(scratch, 'dist');
execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: root, stdio: 'ignore' });
// 2. the demo site, built and served (with the editor in its admin folder)
console.log('Building the demo site…');
const site = path.join(scratch, 'site');
const build = spawn('php', ['scripts/demo-build.php', `--site=${site}`, '--keep', `--port=${PORT}`], { cwd: root });
kids.push(build);
let log = ''; build.stdout.on('data', (d) => { log += d; }); build.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 600 && !/The server stays up/.test(log); i++) { await sleep(200); if (build.exitCode !== null) break; }
if (!/The server stays up/.test(log)) { console.error('The demo site could not be built:\n' + log); process.exit(1); }
const pass = (log.match(/sign in as builder \/ (\S+)/) || [])[1];
const adminDir = path.join(site, 'web', 'canvascore-admin');
for (const f of fs.readdirSync(dist)) fs.cpSync(path.join(dist, f), path.join(adminDir, f), { recursive: true });
const BASE = `http://127.0.0.1:${PORT}`;

// 3. Firefox
fs.mkdirSync(path.join(scratch, 'profile'));
kids.push(spawn(FIREFOX, ['--headless', '--no-remote', '--profile', path.join(scratch, 'profile'), `--remote-debugging-port=${BIDI}`], { stdio: 'ignore' }));
let ws; for (let i = 0; i < 100; i++) { try { ws = await new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${BIDI}/session`); w.onopen = () => res(w); w.onerror = rej; }); break; } catch { await sleep(300); } }
if (!ws) { console.error('Firefox did not start (is it at ' + FIREFOX + '? use --firefox=…)'); process.exit(1); }
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('session.new', { capabilities: {} });
const ctx = (await send('browsingContext.getTree', {})).result.contexts[0].context;
await send('browsingContext.setViewport', { context: ctx, viewport: { width: 1440, height: 900 } });
const nav = (url) => send('browsingContext.navigate', { context: ctx, url, wait: 'complete' });
const ev = async (expression) => { const r = await send('script.evaluate', { expression, target: { context: ctx }, awaitPromise: true, resultOwnership: 'none' }); if (r.result?.type === 'exception') throw new Error(r.result.exceptionDetails.text); return r.result?.result?.value; };
const wait = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await ev(expr); if (v) return v; } catch { /* not yet */ } await sleep(150); } return null; };
const shot = async (file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await send('browsingContext.captureScreenshot', { context: ctx, origin: 'viewport' });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('  ' + path.relative(OUT, file));
};
const click = (js) => ev(`(()=>{const el=${js}; if(el){el.click(); return true} return false})()`);
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.trim()===${JSON.stringify(text)})`;

async function tour(locale) {
  const T = (k) => (locale === 'it' ? (it[k] || k) : k);
  const dir = locale === 'it' ? path.join(OUT, 'it') : OUT;
  const want = (n) => !ONLY.length || ONLY.includes(n);
  await send('storage.deleteCookies', {});
  await nav(BASE + '/canvascore-admin/');
  await ev(`localStorage.setItem('cc_locale', ${JSON.stringify(locale)})`); await ev(`sessionStorage.clear()`);
  await nav(BASE + '/canvascore-admin/');
  await wait(`!!document.querySelector('form')`);
  if (want('sign-in')) { await sleep(400); await shot(path.join(dir, 'sign-in.png')); }
  await ev(`(()=>{const f=(n,v)=>{const el=document.querySelector('input[autocomplete="'+n+'"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));}; f('username','builder'); f('current-password',${JSON.stringify(pass)}); document.querySelector('form').requestSubmit();})()`);
  await wait(`!!document.querySelector('nav.ui-nav')`);
  await sleep(500);
  const screens = [['pages', 'Pages'], ['collections', 'Collections'], ['media', 'Media'], ['menu', 'Menu'], ['settings', 'Global Options'], ['popups', 'Popups'], ['languages', 'Languages'], ['integrations', 'Integrations'], ['backup', 'Backup'], ['updates', 'Updates'], ['library', 'Template library'], ['packages', 'Block packages']];
  for (const [name, label] of screens) {
    if (!want(name)) continue;
    if (!(await click(byText('nav.ui-nav button', T(label))))) { console.log('  (no ' + label + ' in the sidebar)'); continue; }
    await sleep(900);
    if (name === 'collections') { await click(byText('main button', 'Blog')); await sleep(700); }
    await shot(path.join(dir, name + '.png'));
  }
  // the page editor, on the Home page
  if (want('editor')) {
    await click(byText('nav.ui-nav button', T('Pages'))); await wait(`!![...document.querySelectorAll('main button.ui-cell-title')].length`); await sleep(500);
    await click(`[...document.querySelectorAll('main button.ui-cell-title')].find(x=>x.textContent.trim().startsWith('Home'))`); await wait(`!!document.querySelector('.cc-master-wrapper')`); await sleep(1500);
    if (want('editor')) await shot(path.join(dir, 'editor.png'));
  }
}
for (const locale of ['en', 'it']) { console.log(locale === 'en' ? 'English:' : 'Italian:'); await tour(locale); }
// the published site, as a visitor sees it
if (!ONLY.length || ONLY.includes('site')) {
  console.log('The site:');
  await send('browsingContext.setViewport', { context: ctx, viewport: { width: 1280, height: 800 } });
  await nav(BASE + '/index.html'); await sleep(900); await shot(path.join(OUT, 'site-home.png'));
  await nav(BASE + '/it/index.html'); await sleep(900); await shot(path.join(OUT, 'it/site-home.png'));
  await nav(BASE + '/blog/index.html'); await sleep(900); await shot(path.join(OUT, 'site-blog.png'));
}
console.log('Done: ' + OUT);
process.exit(0);
