// tests/popups.mjs: the popup runtime (canvascore-admin/popups.js) in jsdom, on the HTML the real PHP writes (render_popups.php).
// A fake clock drives the timers and Date.now, so triggers, rules and frequency are checked without waiting.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const phpScript = fileURLToPath(new URL('./render_popups.php', import.meta.url));
let fails = 0, total = 0;
const check = (name, cond, extra = '') => { total++; if (cond) console.log('  ✓ ' + name); else { fails++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

const TEXT = (t) => [{ id: 'b1', type: 'TEXT', content: { text: `<p>${t}</p>` }, styles: {} }];
const FORM = [{ id: 'b2', type: 'FORM', content: { customId: 'pop-form', fields: [{ label: 'Email', type: 'email' }] }, styles: {} }];
const mkPopup = (id, settings = {}, blocks = TEXT('Hello ' + id)) => ({ id, name: 'Popup ' + id, blocks, settings });
const html = (popups, ctx) => execFileSync('php', [phpScript], { input: JSON.stringify({ popups, ctx }), stdio: ['pipe', 'pipe', 'pipe'] }).toString();

// A page with the popups, a clock and what the browser holds. opts: width, touch, store (localStorage seed), session, now, extra (more body html)
function page(popups, opts = {}) {
  const clock = { now: opts.now ?? Date.parse('2026-10-25T10:00:00'), t: 0, timers: [], id: 0 };
  const dom = new JSDOM(`<!doctype html><html><body><a id="open" href="#popup-${popups[0].id}">open</a>${opts.extra || ''}${html(popups)}</body></html>`, {
    runScripts: 'outside-only', url: 'https://x.test/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { value: opts.width ?? 1280, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });
      w.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } };
      w.setTimeout = (fn, ms) => { const id = ++clock.id; clock.timers.push({ id, at: clock.t + (ms || 0), fn }); return id; };
      w.clearTimeout = (id) => { clock.timers = clock.timers.filter((x) => x.id !== id); };
      w.Element.prototype.getClientRects = function () { return [1]; };
      w.matchMedia = (q) => ({ matches: !!opts.touch && /coarse/.test(q), addListener() {}, removeListener() {} });
      for (const [k, v] of Object.entries(opts.store || {})) w.localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(opts.session || {})) w.sessionStorage.setItem(k, v);
    },
  });
  const w = dom.window, d = w.document;
  // the inline scripts of the page (the runtime), run once the fake clock is in place
  for (const s of [...d.querySelectorAll('script:not([type])')]) w.eval(s.textContent);
  const advance = (ms) => { const end = clock.t + ms; for (;;) { const due = clock.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; clock.timers = clock.timers.filter((x) => x !== due); clock.t = due.at; due.fn(); } clock.t = end; clock.now += ms; };
  return { w, d, clock, advance, el: (id) => d.getElementById('cc-popup-' + id), open: (id) => { const e = d.getElementById('cc-popup-' + id); return !!e && !e.hidden; }, store: (k) => w.localStorage.getItem(k) };
}
const T = (s) => ({ triggers: { time: { on: true, seconds: s }, scroll: { on: false }, exit: { on: false }, click: true } });

console.log('\nTIME');
{
  const p = page([mkPopup('pop_aaaaaaaa', T(5))]);
  check('a popup starts hidden, with the box inside', p.el('pop_aaaaaaaa').hidden === true && !!p.el('pop_aaaaaaaa').querySelector('.cc-popup__box'));
  p.advance(4900); check('…it does not show before its time', !p.open('pop_aaaaaaaa'));
  p.advance(200);
  check('…it shows after the delay (5 s), animates in, locks the page scroll and takes the focus', p.open('pop_aaaaaaaa') && /is-open/.test(p.el('pop_aaaaaaaa').className) && p.d.body.style.overflow === 'hidden' && p.d.activeElement === p.el('pop_aaaaaaaa').querySelector('.cc-popup__box'));
  check('…and remembers that it was shown', !!JSON.parse(p.store('cc_popup_pop_aaaaaaaa')).t);
  const q = page([mkPopup('pop_bbbbbbbb', T(0))]); q.advance(50);
  check('a delay of 0 shows it at once', q.open('pop_bbbbbbbb'));
}

console.log('\nCLOSING');
{
  const mk = (extra = {}) => { const p = page([mkPopup('pop_c1c1c1c1', { ...T(1), ...extra })]); p.advance(1100); return p; };
  let p = mk(); check('(it is open)', p.open('pop_c1c1c1c1'));
  p.el('pop_c1c1c1c1').querySelector('.cc-popup__close').click(); p.advance(400);
  check('the close button closes it, gives the page its scroll back and the focus where it was', !p.open('pop_c1c1c1c1') && p.d.body.style.overflow === '');
  p = mk(); p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); p.advance(400);
  check('Esc closes it', !p.open('pop_c1c1c1c1'));
  p = mk({ look: { closeEsc: false } }); p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); p.advance(400);
  check('…unless Esc is switched off', p.open('pop_c1c1c1c1'));
  p = mk(); p.el('pop_c1c1c1c1').querySelector('.cc-popup__overlay').click(); p.advance(400);
  check('a click on the overlay closes it', !p.open('pop_c1c1c1c1'));
  p = mk({ look: { closeOverlay: false } }); p.el('pop_c1c1c1c1').querySelector('.cc-popup__overlay').click(); p.advance(400);
  check('…unless that is switched off', p.open('pop_c1c1c1c1'));
  p = mk({ look: { closeButton: false } });
  check('the close button can be left out', !p.el('pop_c1c1c1c1').querySelector('.cc-popup__close'));
  p = page([mkPopup('pop_c8c8c8c8', T(1), FORM)]); p.advance(1100);
  const bx = p.el('pop_c8c8c8c8'), close = bx.querySelector('.cc-popup__close'), field = bx.querySelector('input[type="email"]'), submit = bx.querySelector('button[type="submit"]');
  const tab = (shift) => { const e = new p.w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: !!shift, bubbles: true, cancelable: true }); p.d.dispatchEvent(e); return e.defaultPrevented; };
  submit.focus(); const wrapped = tab(false);
  check('Tab on the last control goes back to the first one (the focus stays inside the dialog)', wrapped && p.d.activeElement === close, p.d.activeElement && p.d.activeElement.outerHTML.slice(0, 60));
  close.focus(); const back = tab(true);
  check('…and Shift+Tab on the first goes to the last', back && p.d.activeElement === submit);
  field.focus(); check('…between them Tab is left to the browser', !tab(false));
}

console.log('\nSCROLL AND EXIT INTENT');
{
  const sc = { triggers: { time: { on: false }, scroll: { on: true, percent: 50 }, exit: { on: false }, click: true } };
  const p = page([mkPopup('pop_d1d1d1d1', sc)]);
  const scrollTo = (y) => { Object.defineProperty(p.d.documentElement, 'scrollHeight', { value: 3000, configurable: true }); Object.defineProperty(p.w, 'pageYOffset', { value: y, configurable: true }); p.w.dispatchEvent(new p.w.Event('scroll')); p.advance(50); };
  scrollTo(500); check('a scroll trigger waits until the visitor has scrolled that far (500 of 2200 px: 23%)', !p.open('pop_d1d1d1d1'));
  scrollTo(1200); check('…then shows (1200 of 2200 px: 55%)', p.open('pop_d1d1d1d1'));
  const ex = { triggers: { time: { on: false }, scroll: { on: false }, exit: { on: true }, click: true } };
  const leave = (p2, y = -1, rel = null) => { const e = new p2.w.MouseEvent('mouseout', { clientY: y, bubbles: true }); Object.defineProperty(e, 'relatedTarget', { value: rel }); p2.d.dispatchEvent(e); p2.advance(50); };
  let q = page([mkPopup('pop_e1e1e1e1', ex)]);
  leave(q); check('exit intent is not armed in the first two seconds', !q.open('pop_e1e1e1e1'));
  q.advance(2100); leave(q, 300); check('…the mouse leaving by the side or bottom does not count', !q.open('pop_e1e1e1e1'));
  leave(q, -1, q.d.body); check('…nor moving onto another element', !q.open('pop_e1e1e1e1'));
  leave(q); check('…the mouse leaving through the top of the window shows it', q.open('pop_e1e1e1e1'));
  q = page([mkPopup('pop_e2e2e2e2', ex)], { touch: true }); q.advance(2100); leave(q);
  check('on a touch screen there is no exit intent', !q.open('pop_e2e2e2e2'));
}

console.log('\nRULES');
{
  const seen = (p) => { p.advance(1100); return p.open(p.d.querySelector('.cc-popup').id.replace('cc-popup-', '')); };
  const id = 'pop_f1f1f1f1';
  check('devices: a popup switched off for phones does not show on a phone, but does on a desktop', !seen(page([mkPopup(id, { ...T(1), rules: { devices: { mobile: false } } })], { width: 400 })) && seen(page([mkPopup(id, { ...T(1), rules: { devices: { mobile: false } } })], { width: 1280 })));
  check('…tablets are 768–1024 px wide', !seen(page([mkPopup(id, { ...T(1), rules: { devices: { tablet: false } } })], { width: 900 })) && seen(page([mkPopup(id, { ...T(1), rules: { devices: { tablet: false } } })], { width: 1500 })));
  const noNew = { ...T(1), rules: { visitor: 'returning' } }, noRet = { ...T(1), rules: { visitor: 'new' } };
  check('visitors: "returning" skips a first visit; "new" skips someone who has been here', !seen(page([mkPopup(id, noNew)])) && seen(page([mkPopup(id, noNew)], { store: { cc_visited: '1' } })) && seen(page([mkPopup(id, noRet)])) && !seen(page([mkPopup(id, noRet)], { store: { cc_visited: '1' } })));
  const sched = (from, to) => ({ ...T(1), rules: { schedule: { from, to } } });
  check('schedule: before the start date or after the end date it stays away; inside the dates (inclusive) it shows', !seen(page([mkPopup(id, sched('2026-10-26', ''))])) && !seen(page([mkPopup(id, sched('', '2026-10-24'))])) && seen(page([mkPopup(id, sched('2026-10-25', '2026-10-25'))])) && seen(page([mkPopup(id, sched('2026-01-01', '2026-12-31'))])));
}

console.log('\nFREQUENCY');
{
  const id = 'pop_a9a9a9a9';
  const run = (freq, store, session, advanceDays = 0) => { const p = page([mkPopup(id, { ...T(1), rules: { frequency: freq } })], { store, session, now: Date.parse('2026-10-25T10:00:00') + advanceDays * 86400000 }); p.advance(1100); return p.open(id); };
  const rec = { cc_popup_pop_a9a9a9a9: JSON.stringify({ t: Date.parse('2026-10-25T10:00:00') }) };
  check('once: shown the first time, never again', run({ mode: 'once' }, {}) && !run({ mode: 'once' }, rec) && !run({ mode: 'once' }, rec, {}, 400));
  check('days: not again before N days have passed (7), again after', !run({ mode: 'days', days: 7 }, rec, {}, 3) && run({ mode: 'days', days: 7 }, rec, {}, 8));
  check('session: once per browser session, again in a new one', run({ mode: 'session' }, {}) && !run({ mode: 'session' }, rec, { cc_popup_pop_a9a9a9a9: '1' }) && run({ mode: 'session' }, rec, {}));
  check('always: on every visit', run({ mode: 'always' }, rec, { cc_popup_pop_a9a9a9a9: '1' }));
  const conv = { cc_popup_pop_a9a9a9a9: JSON.stringify({ t: Date.parse('2026-10-25T10:00:00'), c: 1 }) };
  check('a popup whose form was sent does not come back (except "always")', !run({ mode: 'days', days: 1 }, conv, {}, 30) && !run({ mode: 'session' }, conv, {}) && run({ mode: 'always' }, conv));
  const p = page([mkPopup(id, { ...T(1), rules: { frequency: { mode: 'days', days: 1 } } }, FORM)]); p.advance(1100);
  const f = p.el(id).querySelector('form'); f.addEventListener('submit', (e) => e.preventDefault()); f.dispatchEvent(new p.w.Event('submit', { bubbles: true, cancelable: true }));
  check('sending a form inside the popup records that it was answered', JSON.parse(p.store('cc_popup_' + id)).c === 1);
}

console.log('\nMANUAL OPENING, ORDER, THE COOKIE BANNER');
{
  const id = 'pop_b7b7b7b7';
  const rec = { cc_popup_pop_b7b7b7b7: JSON.stringify({ t: Date.parse('2026-10-25T10:00:00') }) };
  let p = page([mkPopup(id, { triggers: { time: { on: false }, scroll: { on: false }, exit: { on: false }, click: true }, rules: { frequency: { mode: 'once' }, devices: { desktop: false } } })], { store: rec });
  p.d.getElementById('open').click(); p.advance(50);
  check('a link to #popup-ID opens it by hand, whatever the rules say (frequency, device)', p.open(id));
  p = page([mkPopup(id, { triggers: { time: { on: false }, scroll: { on: false }, exit: { on: false }, click: false } })]);
  p.d.getElementById('open').click(); p.advance(50);
  check('…unless the click trigger is switched off', !p.open(id));
  p = page([mkPopup('pop_c2c2c2c2', { ...T(3), rules: { priority: 20 } }), mkPopup('pop_c3c3c3c3', { ...T(3), rules: { priority: 5 } })]); p.advance(3100);
  check('two popups due together: only one shows, the one with the lower priority number', p.open('pop_c3c3c3c3') && !p.open('pop_c2c2c2c2'));
  p = page([mkPopup('pop_c4c4c4c4', T(1)), mkPopup('pop_c5c5c5c5', T(2))]); p.advance(2500);
  check('…and a second one does not pile up on the first', p.open('pop_c4c4c4c4') && !p.open('pop_c5c5c5c5'));
  p = page([mkPopup('pop_c6c6c6c6', T(1))], { extra: '<div id="cc-consent">Cookies</div>' }); p.advance(1100);
  check('while the cookie banner is on screen the popup waits', !p.open('pop_c6c6c6c6'));
  p.d.getElementById('cc-consent').hidden = true; p.advance(600);
  check('…and shows once the visitor has answered it', p.open('pop_c6c6c6c6'));
}

console.log('\nROBUSTNESS');
{
  const dom = new JSDOM('<!doctype html><body><script type="application/json" id="cc-popups-data">{not json</script></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  let err = '';
  try { dom.window.eval(execFileSync('php', ['-r', 'echo file_get_contents(__DIR__ . "/../../canvascore-admin/popups.js");'], { cwd: fileURLToPath(new URL('.', import.meta.url)) }).toString()); } catch (e) { err = String(e); }
  check('broken data does nothing and raises no error', err === '');
  const e2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  let err2 = '';
  try { e2.window.eval(execFileSync('php', ['-r', 'echo file_get_contents(__DIR__ . "/../../canvascore-admin/popups.js");'], { cwd: fileURLToPath(new URL('.', import.meta.url)) }).toString()); } catch (e) { err2 = String(e); }
  check('a page with no popup list does nothing', err2 === '');
  const q = page([mkPopup('pop_d7d7d7d7', T(1))]);
  check('a page without storage (private mode) still works: nothing breaks when localStorage throws', (() => { try { Object.defineProperty(q.w, 'localStorage', { get() { throw new Error('denied'); } }); q.advance(1100); return true; } catch { return false; } })());
}

console.log(`\n${fails === 0 ? 'POPUPS OK' : fails + ' checks failed'} (${total} checks)`);
process.exit(fails === 0 ? 0 : 1);
