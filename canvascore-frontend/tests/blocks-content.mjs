// tests/blocks-content.mjs
// BEHAVIORAL tests for the blocks: Divider, Callout, Steps, Counters, Progress, Table, Countdown,
// Timeline, Logos, Team, Before/After, Business. Parity (parity.mjs) checks that editor and compiler
// produce the same structure; here we check that the PHP compiler's HTML is SAFE and WORKS.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { JSDOM } from 'jsdom';
import { renderBlock } from '../src/render/renderBlock.mjs';
import { fillLogosMarquee, marqueeSpeed } from '../src/render/logosMarquee.mjs';
import { ccTokens } from '../src/render/blockRuntime.mjs';

const phpScript = fileURLToPath(new URL('./render_php.php', import.meta.url));
const php = (type, content, styles = {}) => execFileSync('php', [phpScript], { input: JSON.stringify({ id: 'tb', type, styles, content }) }).toString();
const js = (type, content, styles = {}) => renderBlock({ id: 'tb', type, styles, content });
const $ = (html) => load(`<div id="__r">${html}</div>`, null, false);

let fails = 0, total = 0;
const check = (name, cond, extra = '') => {
  total++;
  if (cond) console.log('  ✓ ' + name);
  else { fails++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

// ------------------------------------------------------------------ jsdom environment with controlled clock/rAF/IO
function page(html, { now = null, reduced = false, withIO = true } = {}) {
  const ticks = []; const frames = []; const ios = []; const state = { now };
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'dangerously', pretendToBeVisual: false,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: reduced });
      if (withIO) win.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.t = []; ios.push(this); } observe(x) { this.t.push(x); } unobserve(x) { this.t = this.t.filter((y) => y !== x); } disconnect() {} };
      else delete win.IntersectionObserver;
      win.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
      win.setInterval = (fn) => { ticks.push(fn); return ticks.length; };
      win.clearInterval = () => { ticks.cleared = (ticks.cleared || 0) + 1; };
      if (now !== null) {
        const Real = win.Date;
        win.Date = class extends Real {
          constructor(...a) { if (a.length === 0) super(state.now); else super(...a); }
          static now() { return state.now; }
        };
      }
    },
  });
  return {
    dom, doc: dom.window.document, state,
    see: () => ios.forEach((io) => io.cb(io.t.map((t) => ({ isIntersecting: true, target: t })))),
    frame: (ts) => { const f = frames.splice(0); f.forEach((cb) => cb(ts)); },
    tick: () => ticks.forEach((f) => f()),
    cleared: () => ticks.cleared || 0,
    pendingFrames: () => frames.length,
  };
}

// =============================================================== DIVIDER
section('DIVIDER');
{
  const h = php('DIVIDER', { style: 'inventato', color: 'red; background:url(http://evil)', thickness: 999, width: -5 });
  check('unknown style → "line"', /<hr class="cc-divider-line"/.test(h));
  check('color with ";" / url() rejected → default color', !/evil|url\(/.test(h) && /#cbd5e1/.test(h));
  check('thickness and width capped (20 px, 10 %)', /border-top:20px solid/.test(h) && /width:10%/.test(h));
  for (const bad of ['red}body{display:none', 'javascript:alert(1)', 'expression(alert(1))', '#12', 'rgb(1,2,3);x', 'url(x)', '</style><script>x</script>']) {
    const o = php('DIVIDER', { style: 'wave', color: bad });
    check(`hostile color is rejected: ${bad.slice(0, 26)}`, !/display:none|javascript|expression|<script|<\/style>|url\(/.test(o) && /fill="#cbd5e1"/.test(o));
  }
  for (const ok of ['#fff', '#0F172AFF', 'tomato', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120, 50%, 50%)', 'var(--brand-color, #3b82f6)']) {
    check(`valid color accepted: ${ok}`, php('DIVIDER', { style: 'wave', color: ok }).includes(`fill="${ok}"`));
  }
  check('flipped wave → scaleY(-1)', /transform:scaleY\(-1\)/.test(php('DIVIDER', { style: 'wave', flip: true })) && !/scaleY/.test(php('DIVIDER', { style: 'wave' })));
  check('spacer height capped at 400', /height:400px/.test(php('DIVIDER', { style: 'spacer', height: 9999 })));
  check('decorative shapes are hidden from screen readers', /aria-hidden="true"/.test(php('DIVIDER', { style: 'curve' })) && /aria-hidden="true"/.test(php('DIVIDER', { style: 'gradient' })));
}

// =============================================================== CALLOUT
section('CALLOUT');
{
  const evil = '<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(2)">l</a><img src=x onerror="alert(3)">';
  const h = php('CALLOUT', { variant: 'info', title: '<b>T</b>', text: evil });
  check('rich content sanitized (script, on*, javascript:)', !/<script|onclick|onerror|javascript:/i.test(h) && h.includes('ok'));
  check('title escaped', h.includes('&lt;b&gt;T&lt;/b&gt;') && !h.includes('<b>T</b>'));
  check('role="note" (not "alert": it must not announce itself on load)', /role="note"/.test(h) && !/role="alert"/.test(h));
  check('unknown variant → info', /cc-callout-info/.test(php('CALLOUT', { variant: 'x', text: '' })));
  check('showIcon=false → no icon', !/cc-callout-icon/.test(php('CALLOUT', { variant: 'danger', showIcon: false, text: 'a' })));
  check('empty title → no title element', !/cc-callout-title/.test(php('CALLOUT', { variant: 'note', title: '', text: 'a' })));
}

// =============================================================== STEPS
section('STEPS');
{
  const items = [{ title: 'A', text: 'x' }, { title: 'B' }, { title: 'C', text: 'z' }, { title: 'D' }, { title: 'E' }];
  const hz = php('STEPS', { layout: 'horizontal', items }); const d = $(hz);
  check('numbering 1..n in order', d('.cc-step-num').map((_, e) => d(e).text()).get().join(',') === '1,2,3,4,5');
  check('it is an ordered list <ol> with one <li> per step', d('ol').length === 1 && d('li.cc-step').length === 5);
  check('horizontal: columns = min(4, n)', /repeat\(4, 1fr\)/.test(hz));
  check('horizontal: collapses on mobile and hides the connectors', /max-width:768px/.test(hz) && /display:none/.test(hz));
  const vt = php('STEPS', { layout: 'vertical', items: items.slice(0, 2) });
  check('vertical: no grid and no media query', !/grid-template-columns/.test(vt) && !/@media/.test(vt));
  check('step without text → no paragraph', $(php('STEPS', { items: [{ title: 'solo titolo' }] }))('.cc-step-text').length === 0);
  check('zero steps → a valid empty list, no errors', $(php('STEPS', { items: [] }))('ol').length === 1);
  check('the title is escaped', !php('STEPS', { items: [{ title: '<img src=x onerror=a>' }] }).includes('<img'));
}

// =============================================================== NUMBERS: PHP == JS
section('NUMBER FORMATTING — the site and the editor must show the same number');
{
  const cases = [[1234567, 0], [0, 0], [4.5, 1], [2.675, 2], [1.005, 2], [0.285, 2], [12.345, 2], [0.5, 0], [1.5, 0], [2.5, 0], [-1234.567, 2], [-0.001, 0], [999.995, 2], [1e6 + 0.5, 0], [3.14159, 2], [5, 2], [100, 1], [1234.5, 1]];
  const bad = [];
  for (const [v, dec] of cases) {
    const p = $(php('COUNTERS', { animate: false, items: [{ value: v, decimals: dec }] }))('.cc-counter-value').text();
    const j = $(js('COUNTERS', { animate: false, items: [{ value: v, decimals: dec }] }))('.cc-counter-value').text();
    if (p !== j) bad.push(`${v}/${dec}: PHP=${p} JS=${j}`);
  }
  check(`${cases.length} values (2.675, 1.005, 0.5, negatives, thousands…) identical in PHP and JS`, bad.length === 0, bad.join(' | '));
  const txt = (v, dec) => $(php('COUNTERS', { animate: false, items: [{ value: v, decimals: dec }] }))('.cc-counter-value').text();
  check('thousands with commas: 1234567 → 1,234,567', txt(1234567, 0) === '1,234,567');
  check('2.675 with 2 decimals → 2.68 (half rounded up, not 2.67)', txt(2.675, 2) === '2.68');
  check('-0.001 with 0 decimals → "0" (not "-0")', txt(-0.001, 0) === '0');
}

// =============================================================== COUNTERS
section('COUNTERS');
{
  const items = [{ value: 1234567, prefix: '$', suffix: '+', decimals: 0, label: 'Rev' }, { value: '4.5', decimals: 1, label: 'Rate' }, { value: 'abc', label: 'Bad' }, { value: 7, prefix: '<b>', label: '<i>x</i>' }];
  const h = php('COUNTERS', { items, animate: true, duration: 1000 }); const d = $(h);
  const vals = d('.cc-counter-value').map((_, e) => d(e).text()).get();
  check('final text already in the HTML (no JS, SEO): prefix + thousands + suffix', vals[0] === '$1,234,567+' && vals[1] === '4.5');
  check('non-numeric value → 0', vals[2] === '0');
  check('prefix/label escaped', !h.includes('<b>') && !h.includes('<i>'));
  check('automatic columns (max 4) and a 2-column grid on mobile', /repeat\(4, 1fr\)/.test(h) && /repeat\(2, 1fr\) !important/.test(h));
  check('animate=false → no script', !/<script/.test(php('COUNTERS', { items, animate: false })));
  check('duration capped (500..5000 ms)', /var dur=5000;/.test(php('COUNTERS', { items, animate: true, duration: 999999 })) && /var dur=500;/.test(php('COUNTERS', { items, animate: true, duration: 1 })));
  check('no script when there are no counters', !/<script/.test(php('COUNTERS', { items: [], animate: true })));

  // script in jsdom
  const single = php('COUNTERS', { animate: true, duration: 1000, items: [{ value: 1000, suffix: '+', label: 'x' }, { value: 4.5, decimals: 1 }] });
  let p = page(single);
  const els = () => [...p.doc.querySelectorAll('.cc-counter-value')];
  check('at start the counters begin at 0 (before entering the viewport)', els()[0].textContent === '0+' && els()[1].textContent === '0.0');
  p.see(); p.frame(0);
  p.frame(500);
  const mid = els()[0].textContent;
  check('mid-animation the value is intermediate (between 0 and 1,000)', /^\d{1,3}\+$/.test(mid) && mid !== '0+' && mid !== '1,000+', mid);
  p.frame(1500);
  check('at the end of the animation it returns EXACTLY the text computed by the server', els()[0].textContent === '1,000+' && els()[1].textContent === '4.5', els().map((e) => e.textContent).join(' | '));
  const tricky = php('COUNTERS', { animate: true, duration: 1000, items: [{ value: 2.675, decimals: 2 }] });
  p = page(tricky); p.see(); p.frame(0); p.frame(5000);
  check('at the end of the animation 2.675 stays "2.68" as computed by the server (toFixed would give 2.67)', p.doc.querySelector('.cc-counter-value').textContent === '2.68', p.doc.querySelector('.cc-counter-value').textContent);
  p = page(single, { reduced: true });
  check('prefers-reduced-motion: no animation, final value right away', [...p.doc.querySelectorAll('.cc-counter-value')][0].textContent === '1,000+');
  p = page(single, { withIO: false });
  check('without IntersectionObserver: final value (no counter stuck at 0)', [...p.doc.querySelectorAll('.cc-counter-value')][0].textContent === '1,000+');
  p = page(single);
  p.see(); p.frame(0);
  check('the animation runs only once per counter (unobserve)', p.pendingFrames() === 2);
}

// =============================================================== PROGRESS
section('PROGRESS');
{
  const h = php('PROGRESS', { height: 14, animate: true, items: [{ label: 'A', value: 90.55, color: '#10b981' }, { label: 'B', value: 150, color: 'bad;color' }, { label: 'C', value: -3 }, { label: 'D', value: 'x' }] });
  const d = $(h);
  const now = d('.cc-progress-track').map((_, e) => d(e).attr('aria-valuenow')).get();
  check('values clamped to 0–100 and rounded to 1 decimal', now.join(',') === '90.6,100,0,0', now.join(','));
  check('accessible bars: role=progressbar with valuemin/max/now and a label', d('[role="progressbar"]').length === 4 && d('[role="progressbar"]').first().attr('aria-label') === 'A' && d('[role="progressbar"]').first().attr('aria-valuemax') === '100');
  check('hostile color discarded, valid color kept', !/bad;color/.test(h) && /#10b981/.test(h));
  check('height clamped to 4..30', /height:30px/.test(php('PROGRESS', { height: 999, items: [{ label: 'x', value: 1 }] })) && /height:4px/.test(php('PROGRESS', { height: 0, items: [{ label: 'x', value: 1 }] })));
  check('showValue=false → no percentage', !/cc-progress-value/.test(php('PROGRESS', { showValue: false, items: [{ label: 'x', value: 5 }] })));
  const sc = php('PROGRESS', { animate: true, items: [{ label: 'A', value: 80 }, { label: 'B', value: 40 }] });
  let p = page(sc);
  const fills = () => [...p.doc.querySelectorAll('.cc-progress-fill')];
  check('with JS the bars start at 0%', fills().every((f) => f.style.width === '0%'));
  p.see(); p.frame(0);
  check('when they enter the viewport they fill to the real value', fills().map((f) => f.style.width).join(',') === '80%,40%', fills().map((f) => f.style.width).join(','));
  p = page(sc, { withIO: false });
  check('without IntersectionObserver: bars already at the real value', [...p.doc.querySelectorAll('.cc-progress-fill')].map((f) => f.style.width).join(',') === '80%,40%');
  p = page(sc, { reduced: true });
  check('prefers-reduced-motion: bars already at the real value', [...p.doc.querySelectorAll('.cc-progress-fill')].map((f) => f.style.width).join(',') === '80%,40%');
}

// =============================================================== TABLE
section('TABLE');
{
  const data = 'Nome | Età | Città\nAnna | 30 | Roma\nMarco | 41\nGiulia | 28 | Milano | extra';
  const h = php('TABLE', { data, caption: 'Persone', headerRow: true, striped: true, rowHeaders: true, stickyHeader: true, maxHeight: 300 }); const d = $(h);
  check('first row = header (<th scope="col">)', d('thead th[scope="col"]').map((_, e) => d(e).text()).get().join(',') === 'Nome,Età,Città,');
  check('ragged rows: all get the same number of cells (the widest wins)', d('tbody tr').map((_, e) => d(e).children().length).get().join(',') === '4,4,4');
  check('first column as row header (<th scope="row">)', d('tbody th[scope="row"]').length === 3);
  check('caption present', d('caption').text() === 'Persone');
  check('alternating (zebra) rows only on odd rows', d('tbody tr').map((_, e) => d(e).attr('style') || '').get().join('|') === '|background:#f8fafc;|');
  check('sticky header with max height → inner scroll', /max-height:300px/.test(h) && /position:sticky/.test(h));
  check('without maxHeight the sticky header doesn\'t create a scroll container', !/max-height/.test(php('TABLE', { data, stickyHeader: true, maxHeight: 0 })));
  check('wrapper with horizontal scroll (responsive)', /overflow-x:auto/.test(h));
  const tsv = $(php('TABLE', { data: 'a\tb\n\n  c | d  \n', headerRow: false }));
  check('mixed separators (| and tab), empty rows ignored, spaces trimmed', tsv('tbody tr').length === 2 && tsv('tr').first().children().first().text() === 'a' && tsv('tr').last().children().first().text() === 'c' && tsv('thead').length === 0);
  check('empty data → no table (and no error)', $(php('TABLE', { data: '' }))('table').length === 0);
  const xss = php('TABLE', { data: 'H\n<script>alert(1)</script> | <img src=x onerror=a>' });
  check('cells are escaped (no HTML injection)', !/<script|<img/.test(xss) && xss.includes('&lt;script&gt;'));
  check('zebra can be turned off / borders / compact', !/background:#f8fafc/.test(php('TABLE', { data: 'a\nb\nc\nd', headerRow: false, striped: false })) && /border:1px solid #e2e8f0/.test(php('TABLE', { data: 'a\nb', bordered: true })) && /padding:6px 10px/.test(php('TABLE', { data: 'a\nb', compact: true })));
}

// =============================================================== COUNTDOWN
section('COUNTDOWN');
{
  const t = (c) => $(php('COUNTDOWN', c))('.cc-countdown').attr('data-target');
  check('visitor\'s local time: date without time zone', t({ datetime: '2030-06-15T18:30', utcOffset: 'local' }) === '2030-06-15T18:30');
  check('fixed time zone: ISO with offset', t({ datetime: '2030-06-15T18:30', utcOffset: '+02:00' }) === '2030-06-15T18:30:00+02:00');
  check('invalid date → default date (no error)', t({ datetime: 'ieri' }) === '2030-01-01T00:00');
  check('invalid offset → local time', t({ datetime: '2030-06-15T18:30', utcOffset: '+2' }) === '2030-06-15T18:30');
  const inj = php('COUNTDOWN', { datetime: '2030-01-01T00:00', utcOffset: '"><script>x</script>' });
  check('injection in the time zone rejected: the hostile string doesn\'t appear and the zone falls back to "local"', !inj.includes('"><script>x') && !inj.includes('x</script>') && $(inj)('.cc-countdown').attr('data-target') === '2030-01-01T00:00');
  const d = $(php('COUNTDOWN', { datetime: '2030-06-15T18:30', utcOffset: '+02:00', showSeconds: false }));
  check('showSeconds=false → 3 units', d('.cc-cd-unit').length === 3 && d('[data-unit="seconds"]').length === 0);
  check('date readable without JS: <time datetime> with date and UTC', d('time').attr('datetime') === '2030-06-15T18:30:00+02:00' && d('time').text() === '2030-06-15 18:30 UTC+02:00');
  check('role="timer" and no live region (doesn\'t announce every second)', d('[role="timer"]').length === 1 && !/aria-live/.test(php('COUNTDOWN', {})));

  const html = php('COUNTDOWN', { datetime: '2030-01-01T00:00', utcOffset: 'local', endAction: 'message', endMessage: 'Fatto!' });
  const local = (y, mo, da, h, mi, s) => new Date(y, mo - 1, da, h, mi, s).getTime();
  let p = page(html, { now: local(2029, 12, 30, 22, 58, 57) });
  const num = (u) => p.doc.querySelector(`[data-unit="${u}"]`).textContent;
  check('correct computation: 1 d 1 h 1 m 3 s to New Year', [num('days'), num('hours'), num('minutes'), num('seconds')].join(':') === '01:01:01:03', [num('days'), num('hours'), num('minutes'), num('seconds')].join(':'));
  p.state.now += 1000; p.tick();
  check('after 1 second: 1 d 1 h 1 m 2 s', [num('days'), num('hours'), num('minutes'), num('seconds')].join(':') === '01:01:01:02');
  p.state.now = local(2029, 12, 31, 23, 59, 59); p.tick();
  check('day/hour/minute rollover: 00:00:00:01', [num('days'), num('hours'), num('minutes'), num('seconds')].join(':') === '00:00:00:01');
  check('before the deadline the final message is hidden', p.doc.querySelector('.cc-cd-done').hidden === true);
  p.state.now = local(2030, 1, 1, 0, 0, 0); p.tick();
  check('at the deadline: resets to zero, stops the timer, shows the message and hides the numbers', [num('days'), num('seconds')].join(':') === '00:00' && p.cleared() === 1 && p.doc.querySelector('.cc-cd-done').hidden === false && p.doc.querySelector('.cc-cd-units').style.display === 'none');
  p = page(html, { now: local(2031, 5, 5, 5, 5, 5) });
  check('page opened AFTER the deadline: final message right away', p.doc.querySelector('.cc-cd-done').hidden === false);
  p = page(php('COUNTDOWN', { datetime: '2030-01-01T00:00', endAction: 'hide', endMessage: 'x' }), { now: local(2031, 1, 1, 0, 0, 0) });
  check('endAction=hide: the block disappears', p.doc.querySelector('.cc-countdown').style.display === 'none');
  p = page(php('COUNTDOWN', { datetime: '2030-01-01T00:00', endAction: 'message', endMessage: '' }), { now: local(2031, 1, 1, 0, 0, 0) });
  check('empty final message: the zeros stay (no empty block)', p.doc.querySelector('.cc-cd-units').style.display !== 'none' && p.doc.querySelector('.cc-cd-done').hidden === true);
  // fixed time zone: independent of the visitor's time zone
  p = page(php('COUNTDOWN', { datetime: '2030-06-15T18:30', utcOffset: '+02:00' }), { now: Date.parse('2030-06-15T16:29:50Z') });
  check('fixed time zone: 18:30 at +02:00 = 16:30 UTC → 10 s left', [num('minutes'), num('seconds')].join(':') === '00:10');
  p = page(php('COUNTDOWN', { datetime: '2030-06-15T18:30', utcOffset: '-05:00' }), { now: Date.parse('2030-06-15T23:29:50Z') });
  check('negative time zone: 18:30 at -05:00 = 23:30 UTC → 10 s left', [num('minutes'), num('seconds')].join(':') === '00:10');
  p = page(php('COUNTDOWN', { datetime: '2030-06-15T18:30', utcOffset: '+00:00' }), { now: Date.parse('2030-06-14T18:30:00Z') });
  check('over 99 days/hours to a distant date: 3-digit days not truncated', num('days') === '01');
  p = page(php('COUNTDOWN', { datetime: '2030-01-01T00:00', utcOffset: '+00:00' }), { now: Date.parse('2029-01-01T00:00:00Z') });
  check('at 365 days: "365" (not truncated to 2 digits)', num('days') === '365');
}

// =============================================================== TIMELINE
section('TIMELINE');
{
  const items = [{ date: '2021', title: 'A', text: 'x' }, { date: '', title: 'B' }, { date: '2023', title: 'C', text: 'z' }];
  const left = php('TIMELINE', { layout: 'left', items }); const d = $(left);
  check('ordered list with one <li> per event, dots hidden from screen readers', d('ol.cc-timeline').length === 1 && d('li.cc-tl-item').length === 3 && d('.cc-tl-dot[aria-hidden="true"]').length === 3);
  check('date and text optional (omitted when empty)', d('.cc-tl-date').length === 2 && d('.cc-tl-text').length === 2);
  check('left layout: no alternating arrangement', !/min-width:769px/.test(left));
  check('alternating layout: only from 769px up (stays left on mobile)', /@media\(min-width:769px\)/.test(php('TIMELINE', { layout: 'alternate', items })));
  check('text escaped', !php('TIMELINE', { items: [{ title: '<img src=x onerror=a>' }] }).includes('<img'));
}

// =============================================================== LOGOS
section('LOGOS');
{
  const logos = [{ src: 'a.png', alt: 'A', href: 'https://a.example' }, { src: 'b.png', alt: 'B', href: '' }, { src: 'c.png', alt: 'C', href: 'chi-siamo/index.html' }];
  const g = php('LOGOS', { layout: 'grid', title: 'Clienti', logos }); const d = $(g);
  check('grid: no duplicates, one image per logo', d('img').length === 3 && d('[aria-hidden="true"]').length === 0);
  check('logos with a link are <a rel="noopener">, the others <div>', d('a.cc-logo-item[rel="noopener"]').length === 2 && d('div.cc-logo-item').length === 1);
  check('internal link resolved with BASE_URL', d('a.cc-logo-item').last().attr('href') === '{{BASE_URL}}chi-siamo/');
  check('title shown; columns on mobile capped at 3', d('.cc-logos-title').text() === 'Clienti' && /repeat\(3, 1fr\) !important/.test(php('LOGOS', { columns: 8, logos })));
  check('grayscale, back to color on hover/focus', /filter:grayscale\(1\)/.test(g) && /:hover img/.test(g) && /:focus-visible img/.test(g));
  const m = php('LOGOS', { layout: 'marquee', speed: 20, logos }); const dm = $(m);
  check('marquee: two sets, the second hidden from screen readers', dm('.cc-logos-set').length === 2 && dm('.cc-logos-set').last().attr('aria-hidden') === 'true');
  check('the duplicate set is not keyboard-reachable (tabindex=-1, empty alt)', dm('.cc-logos-set[aria-hidden="true"] a').toArray().every((a) => dm(a).attr('tabindex') === '-1') && dm('.cc-logos-set[aria-hidden="true"] img').toArray().every((i) => dm(i).attr('alt') === ''));
  check('CSS animation with a unique name per block and the chosen speed', /@keyframes ccMq_tb/.test(m) && /ccMq_tb 20s linear infinite/.test(m));
  check('pause on hover and prefers-reduced-motion (no motion, no duplicates)', /animation-play-state:paused/.test(m) && /prefers-reduced-motion:reduce/.test(m) && /\.cc-logos-set\[aria-hidden="true"\]\{display:none\}/.test(m));
  check('speed clamped to 10..120 s', /ccMq_tb 120s/.test(php('LOGOS', { layout: 'marquee', speed: 9999, logos })) && /ccMq_tb 10s/.test(php('LOGOS', { layout: 'marquee', speed: 1, logos })));
  check('the strip moves with CSS alone (its script only repeats logos to fill the line); the grid has no script', /@keyframes ccMq_/.test(m.replace(/<script>[\s\S]*?<\/script>/g, '')) && [...m.matchAll(/<script>/g)].length === 1 && !/<script/.test(g));
  check('a "javascript:" URL in the logo link does not become an executable link', !/href="javascript:/i.test(php('LOGOS', { logos: [{ src: 'a.png', alt: 'x', href: 'javascript:alert(1)' }] })));
}

// =============================================================== TEAM
section('TEAM');
{
  const members = [
    { name: 'Anna Rossi', role: 'CEO', bio: 'Guida.', photo: 'anna.jpg', email: 'anna@example.com', linkedin: 'linkedin.com/in/anna', twitter: 'https://x.com/anna', website: '' },
    { name: 'élodie martin', role: '', bio: '', photo: '', email: 'non-una-email', website: 'example.com' },
    { name: 'marco', photo: '' }, { name: '', role: 'Ruolo' }, { name: '😀 Zed', photo: '' },
  ];
  const h = php('TEAM', { members, columns: 0 }); const d = $(h);
  check('photo present → <img> with alt = name', d('img[src="anna.jpg"]').attr('alt') === 'Anna Rossi');
  const ini = d('.cc-member-initials').map((_, e) => d(e).text()).get();
  check('no photo: initials of the first two names (accented/emoji too, without mbstring)', ini.join('|') === 'ém|m||😀Z', ini.join('|'));
  check('initials are uppercased by CSS (not by PHP)', /text-transform:uppercase/.test(h));
  check('valid email → mailto:, invalid → no link', d('a[href="mailto:anna@example.com"]').length === 1 && !/non-una-email/.test(h));
  check('social link without scheme → https:// (linkedin.com/in/anna)', d('a[href="https://linkedin.com/in/anna"]').length === 1 && d('a[href="https://x.com/anna"]').length === 1 && d('a[href="https://example.com"]').length === 1);
  check('links with aria-label "Name - Service" and rel=noopener', d('a[aria-label="Anna Rossi - LinkedIn"][rel="noopener"]').length === 1);
  check('automatic columns max 4; 2 on mobile, 1 on small screens', /repeat\(4, 1fr\)/.test(h) && /repeat\(2, 1fr\) !important/.test(h) && /max-width:480px/.test(h));
  check('photo shape: circle/rounded/square', /border-radius:50%/.test(php('TEAM', { members: [{ name: 'a' }], photoShape: 'circle' })) && /border-radius:16px/.test(php('TEAM', { members: [{ name: 'a' }], photoShape: 'rounded' })) && /border-radius:0;/.test(php('TEAM', { members: [{ name: 'a' }], photoShape: 'square' })));
  check('"javascript:" in a social field does not become an executable link', !/href="javascript:/i.test(php('TEAM', { members: [{ name: 'a', linkedin: 'javascript:alert(1)', website: 'javascript:alert(2)' }] })));
  check('name/role/bio escaped', !php('TEAM', { members: [{ name: '<img src=x onerror=a>', role: '<b>', bio: '<script>' }] }).match(/<img|<b>|<script/));
}

// =============================================================== BEFORE / AFTER
section('BEFORE_AFTER');
{
  const h = php('BEFORE_AFTER', { startPosition: 30, aspectRatio: '4 / 3', before: { src: 'b.jpg', alt: 'Prima', label: 'Prima' }, after: { src: 'a.jpg', alt: 'Dopo', label: 'Dopo' } }); const d = $(h);
  check('start position in the CSS (--pos) and on the slider', /--pos:30%/.test(h) && d('input.cc-ba-range').attr('value') === '30');
  check('accessible slider: range input with a label, 0–100', d('input[type="range"][aria-label="Comparison slider"]').attr('min') === '0' && d('input[type="range"]').attr('max') === '100');
  check('"before" is the clipped part, "after" sits underneath', d('.cc-ba-before img').attr('src') === 'b.jpg' && d('img.cc-ba-after').attr('src') === 'a.jpg' && /clip-path:inset\(0 calc\(100% - var\(--pos\)\) 0 0\)/.test(h));
  check('Before/After labels (can be turned off)', d('.cc-ba-label').length === 2 && $(php('BEFORE_AFTER', { showLabels: false, before: { src: 'b' }, after: { src: 'a' } }))('.cc-ba-label').length === 0);
  check('start position clamped to 0–100', /--pos:100%/.test(php('BEFORE_AFTER', { startPosition: 999, before: { src: 'b' }, after: { src: 'a' } })) && /--pos:0%/.test(php('BEFORE_AFTER', { startPosition: -5, before: { src: 'b' }, after: { src: 'a' } })));
  check('the handle doesn\'t capture the mouse (you drag the slider underneath)', /pointer-events:none/.test(h));
  const p = page(h);
  const root = p.doc.querySelector('.cc-ba'); const r = p.doc.querySelector('.cc-ba-range');
  check('script: on start sets --pos from the slider', root.style.getPropertyValue('--pos') === '30%');
  r.value = '72.5'; r.dispatchEvent(new p.dom.window.Event('input', { bubbles: true }));
  check('script: moving the slider updates --pos', root.style.getPropertyValue('--pos') === '72.5%', root.style.getPropertyValue('--pos'));
  r.value = '0'; r.dispatchEvent(new p.dom.window.Event('input', { bubbles: true }));
  check('script: far left 0%', root.style.getPropertyValue('--pos') === '0%');
}

// =============================================================== BUSINESS
section('BUSINESS');
{
  const hours = [{ day: 'Lunedì', open: '08:00', close: '19:00' }, { day: 'Martedì', closed: true }, { day: 'Mercoledì', open: 'x', close: 'y' }, { day: 'Giovedì', open: '09:00', close: '13:30' }];
  const base = { name: 'Bar "Roma" & C.', businessType: 'CafeOrCoffeeShop', address: 'Via Roma 1\n00100 Roma', phone: '+39 (06) 123-4567', email: 'info@bar.example', website: 'bar.example/it', hours, closedLabel: 'Chiuso', directionsLabel: 'Indicazioni', note: 'Festivi chiuso' };
  const h = php('BUSINESS', base); const d = $(h);
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  check('exactly one JSON-LD block', ld.length === 1);
  const j = JSON.parse(ld[0][1]);
  check('valid JSON-LD: type, name, address, phone, email, url', j['@context'] === 'https://schema.org' && j['@type'] === 'CafeOrCoffeeShop' && j.name === 'Bar "Roma" & C.' && j.address.streetAddress === 'Via Roma 1, 00100 Roma' && j.telephone === '+39061234567' && j.email === 'info@bar.example' && j.url === 'https://bar.example/it', JSON.stringify(j));
  check('structured hours only for valid, open days (Mon and Thu), with the right day', JSON.stringify(j.openingHoursSpecification.map((s) => [s.dayOfWeek, s.opens, s.closes])) === JSON.stringify([['Monday', '08:00', '19:00'], ['Thursday', '09:00', '13:30']]), JSON.stringify(j.openingHoursSpecification));
  check('the day label is free text (Lunedì) but the JSON-LD uses schema.org names', d('th[scope="row"]').first().text() === 'Lunedì' && j.openingHoursSpecification[0].dayOfWeek === 'Monday');
  const cells = d('.cc-biz-table tr').map((_, e) => d(e).find('td').text()).get();
  check('rows: hours, closed, invalid hours → closed, hours', cells.join('|') === '08:00–19:00|Chiuso|Chiuso|09:00–13:30', cells.join('|'));
  check('phone: tel: link with digits and + only', d('a[href="tel:+39061234567"]').length === 1);
  check('multi-line address (<br>) in an <address>', d('address').html().includes('Via Roma 1<br>00100 Roma'));
  check('directions: encoded Google Maps URL', d('a.cc-biz-directions').attr('href') === 'https://www.google.com/maps/search/?api=1&query=Via%20Roma%201%2C%2000100%20Roma', d('a.cc-biz-directions').attr('href'));
  check('website without scheme → https://, shown without scheme', d('a[href="https://bar.example/it"]').text() === 'bar.example/it');
  check('note shown; hours title customizable', d('.cc-biz-note').text() === 'Festivi chiuso' && d('.cc-biz-hours-title').text() === 'Opening hours');

  // a name that tries to close the <script> must not be able to inject code
  const inj = php('BUSINESS', { name: '</script><script>alert(1)</script><img src=x onerror=a>', address: 'a', hours: [] });
  const scripts = [...inj.matchAll(/<script/g)].length;
  check('name with "</script><script>": a single <script> (no injection)', scripts === 1 && !/<script>alert/.test(inj), `script=${scripts}`);
  const ij = JSON.parse([...inj.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)][0][1]);
  check('…and the name stays intact in the JSON (only escaped)', ij.name === '</script><script>alert(1)</script><img src=x onerror=a>');
  check('…the visible text is escaped', !/<img src=x/.test(inj.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')));

  check('jsonLd=false → no script', !/<script/.test(php('BUSINESS', { ...base, jsonLd: false })));
  check('no name → no JSON-LD (incomplete data is not published)', !/<script/.test(php('BUSINESS', { address: 'x', hours })));
  check('type not in the list → LocalBusiness', JSON.parse([...php('BUSINESS', { ...base, businessType: 'Evil<Type>' }).matchAll(/ld\+json">([\s\S]*?)<\/script>/g)][0][1])['@type'] === 'LocalBusiness');
  const min = $(php('BUSINESS', { name: '', address: '', phone: '', email: 'sbagliata', hours: [] }));
  check('all empty/invalid: no links, no errors, no table', min('a').length === 0 && min('table').length === 0);
  check('mapsLink=false → no directions button', $(php('BUSINESS', { ...base, mapsLink: false }))('a.cc-biz-directions').length === 0);
  check('at most 7 days', $(php('BUSINESS', { name: 'x', hours: Array.from({ length: 12 }, (_, i) => ({ day: 'g' + i, open: '09:00', close: '10:00' })) }))('.cc-biz-table tr').length === 7);
  check('collapses to one column on mobile', /grid-template-columns:1fr !important/.test(h));
}

// =============================================================== BENTO
section('BENTO');
{
  const h = php('BENTO', { columns: 3, tiles: [
    { size: 'large', title: 'Big', image: 'big.jpg', alt: 'A photo', href: 'chi-siamo/index.html' },
    { size: 'wide', title: 'Wide' }, { size: 'tall', title: 'Tall' }, { size: 'evil', title: 'Normal' } ] });
  const d = $(h);
  const tiles = d('.cc-bento-tile');
  check('one tile per item, in order', tiles.length === 4 && tiles.map((_, e) => d(e).find('.cc-bento-title').text()).get().join() === 'Big,Wide,Tall,Normal');
  check('sizes become grid spans (large 2×2, wide 2×1, tall 1×2, unknown → 1×1)', ['span 2; grid-row:span 2', 'span 2; grid-row:span 1', 'span 1; grid-row:span 2', 'span 1; grid-row:span 1'].every((x, i) => (tiles.eq(i).attr('style') || '').includes('grid-column:' + x)));
  check('a tile with a link is an <a> to the internal page, the others are <div>', tiles.eq(0).is('a') && tiles.eq(0).attr('href') === '{{BASE_URL}}chi-siamo/' && tiles.eq(1).is('div'));
  check('an image tile has the photo with its alt text and white text over a shade', d('.cc-bento-img').attr('alt') === 'A photo' && d('.cc-bento-shade').length === 1 && /color:#ffffff/.test(tiles.eq(0).attr('style')));
  check('without an image the text is dark', /color:#0f172a/.test(tiles.eq(1).attr('style')));
  const bad = php('BENTO', { columns: 9, rowHeight: 20, gap: 500, hover: 'evil', tiles: [{ title: '<img src=x onerror=a>', image: 'javascript:alert(1)', href: 'javascript:alert(2)', bg: 'red;}x{', color: 'url(x)' }, 'junk', null] });
  check('out-of-range layout values are clamped (4 columns, 100px rows, 48px gap), unknown hover → lift', /repeat\(4, 1fr\)/.test(bad) && /minmax\(100px, auto\)/.test(bad) && /gap:48px/.test(bad) && /cc-bento-hover-lift/.test(bad));
  check('hostile tile: text escaped, no javascript: image or link, unsafe colors replaced', !/<img src=x/.test(bad) && !/src="javascript:/i.test(bad) && !/href="javascript:/i.test(bad) && !/red;\}/.test(bad) && !/url\(x\)/.test(bad));
  check('non-object tiles are skipped', $(bad)('.cc-bento-tile').length === 1);
  check('stacks to 2 columns on tablets and 1 on phones, without spans', /max-width:768px\)\{#tb \.cc-bento-grid\{grid-template-columns:repeat\(2, 1fr\)/.test(h) && /grid-column:auto !important;grid-row:auto !important/.test(h));
  check('hover motion is switched off for visitors who prefer reduced motion', /prefers-reduced-motion:reduce/.test(h));
}

// =============================================================== SPLIT_CTA
section('SPLIT_CTA');
{
  const d = $(php('SPLIT_CTA', { left: { title: 'L', text: 'Left text', buttonText: 'Go', buttonUrl: 'contatti/index.html' }, right: { title: 'R', buttonText: '' } }));
  check('two sides, left then right', d('.cc-split-cta-side').length === 2 && d('.cc-split-cta-side').eq(0).hasClass('cc-split-cta-left') && d('.cc-split-cta-side').eq(1).hasClass('cc-split-cta-right'));
  check('a button only where it has text, linking to the internal page', d('.cc-split-cta-btn').length === 1 && d('.cc-split-cta-btn').attr('href') === '{{BASE_URL}}contatti/');
  const bad = php('SPLIT_CTA', { gap: 999, left: { title: '<script>x</script>', bg: 'expression(alert(1))', buttonText: 'B', buttonUrl: 'javascript:alert(1)' }, right: 'junk' });
  check('hostile values: title escaped, unsafe color replaced by the default, no javascript: link, gap clamped', !/<script>x/.test(bad) && !/expression/.test(bad) && !/href="javascript:/i.test(bad) && /gap:48px/.test(bad) && /background:#0f172a/.test(bad));
  check('a side that is not an object still renders (empty, with its default colors)', $(bad)('.cc-split-cta-right').length === 1 && /background:#eff6ff/.test(bad));
  check('stacks vertically on mobile', /flex-direction:column !important/.test(bad));
}

// =============================================================== CASE_STUDY
section('CASE_STUDY');
{
  const full = { image: 'case.jpg', alt: 'The team', logo: 'logo.svg', client: 'ACME', metric: '+240%', metricLabel: 'traffic', title: 'T', text: 'S', quote: 'Great', quoteAuthor: 'Jane', linkText: 'Read', linkUrl: 'https://example.com/case', accent: '#10b981' };
  const d = $(php('CASE_STUDY', full));
  check('image with alt text, client logo and name, metric with label', d('.cc-case-media img').attr('alt') === 'The team' && d('.cc-case-client img').attr('src') === 'logo.svg' && d('.cc-case-client').text() === 'ACME' && d('.cc-case-metric-value').text() === '+240%' && d('.cc-case-metric-label').text() === 'traffic');
  check('quote with its author in a <cite>, and the link', d('blockquote.cc-case-quote cite').text() === '— Jane' && d('a.cc-case-link').attr('href') === 'https://example.com/case' && d('a.cc-case-link').text() === 'Read →');
  check('the accent color is used for the metric, the quote border and the link', (php('CASE_STUDY', full).match(/#10b981/g) || []).length === 3);
  const min = $(php('CASE_STUDY', { title: 'Only' }));
  check('only what is filled in is shown (no image, logo, metric, quote or link)', min('.cc-case-media, .cc-case-client, .cc-case-metric, .cc-case-quote, .cc-case-link').length === 0 && min('.cc-case-title').text() === 'Only');
  const bad = php('CASE_STUDY', { image: 'javascript:alert(1)', logo: 'data:text/html,x', accent: 'red;}', title: '<img src=x onerror=a>', linkText: 'L', linkUrl: 'javascript:alert(2)' });
  check('hostile values: no javascript:/data:text images, no javascript: link, text escaped, accent falls back to the brand color', !/javascript:/i.test(bad.replace(/\{\{BASE_URL\}\}javascript:alert\(2\)/, '')) && !/data:text/.test(bad) && !/<img src=x/.test(bad) && /var\(--brand-color, #3b82f6\)/.test(bad));
  check('image above the text with layout=vertical, and on mobile', /flex-direction:column; background:#fff/.test(php('CASE_STUDY', { ...full, layout: 'vertical' })) && /\.cc-case-card\{flex-direction:column !important\}/.test(php('CASE_STUDY', full)));
}

// =============================================================== AUTHOR_BIO
section('AUTHOR_BIO');
{
  const d = $(php('AUTHOR_BIO', { label: 'About', name: 'Alex Morgan', role: 'Editor', bio: 'Line one\nLine two', photo: 'alex.jpg', links: [{ label: 'Site', url: 'example.com' }, { label: 'Mail', url: 'alex@example.com' }, { label: '', url: 'nolabel.example' }, { label: 'Nothing', url: '' }] }));
  check('photo with the name as alt text, label, name and role', d('img.cc-author-photo').attr('alt') === 'Alex Morgan' && d('.cc-author-label').text() === 'About' && d('.cc-author-name').text() === 'Alex Morgan' && d('.cc-author-role').text() === 'Editor');
  check('bio keeps its line breaks', d('.cc-author-bio').html() === 'Line one<br>Line two');
  check('links: website → https://, email → mailto:, links without label or address are skipped', d('a.cc-author-link').map((_, e) => d(e).attr('href')).get().join() === 'https://example.com,mailto:alex@example.com');
  const init = $(php('AUTHOR_BIO', { name: 'Alex Morgan', photo: '' }));
  check('without a photo: initials', init('.cc-author-initials').text() === 'AM' && init('img').length === 0);
  const bad = php('AUTHOR_BIO', { name: '<b>x</b>', bio: '<script>a</script>', photo: 'vbscript:x', links: [{ label: 'Bad', url: 'javascript:alert(1)' }, 'junk'] });
  check('hostile values: escaped, no vbscript: photo, no javascript: link', !/<b>x/.test(bad) && !/<script>a/.test(bad) && !/vbscript/.test(bad) && !/href="javascript:/i.test(bad));
  check('centered layout without the card', (() => { const h = php('AUTHOR_BIO', { name: 'x', layout: 'centered', boxed: false }); return /flex-direction:column; align-items:center/.test(h) && !/background:#f8fafc/.test(h); })());
}

// =============================================================== LOGOS strip: direction and fading edges
section('LOGOS strip options');
{
  const logos = [{ src: 'a.png', alt: 'A' }, { src: 'b.png', alt: 'B' }];
  const old = php('LOGOS', { layout: 'marquee', speed: 30, logos });
  check('a strip saved before these options renders as before (left, no fade)', /linear infinite\}/.test(old) && !/mask-image/.test(old));
  const r = php('LOGOS', { layout: 'marquee', speed: 30, direction: 'right', fade: true, logos });
  check('direction right: the same loop plays in reverse', /linear infinite reverse\}/.test(r));
  check('fade: the edges are masked, and the mask is removed when motion is reduced', /\.cc-logos-marquee\{-webkit-mask-image:linear-gradient\(90deg/.test(r) && /prefers-reduced-motion:reduce\)\{[^@]*-webkit-mask-image:none;mask-image:none/.test(r));
  check('only the exact values switch the options on (direction "up", fade "yes" → off)', (() => { const h = php('LOGOS', { layout: 'marquee', direction: 'up', fade: 'yes', logos }); return !/reverse/.test(h) && !/mask-image/.test(h); })());
  check('the grid layout ignores both options', !/reverse|mask-image/.test(php('LOGOS', { layout: 'grid', direction: 'right', fade: true, logos })));
}

// =============================================================== built-in placeholder images survive saving
section('Placeholder images survive saving');
{
  // the same test as cc_scrub_urls() in config.php: a value matching it is blanked when a page is saved
  // eslint-disable-next-line no-control-regex -- browsers ignore control characters in a URL scheme (as in cc_scrub_urls)
  const blanked = (v) => /^(javascript|vbscript|livescript|data:(text|application)|data:image\/svg)/.test(String(v).replace(/[\x00-\x20\x7f]+/g, '').toLowerCase());
  const walk = (node, out) => { if (node && typeof node === 'object') for (const v of Object.values(node)) walk(v, out); else if (typeof node === 'string' && node.startsWith('data:')) out.push(node); return out; };
  const defs = walk(JSON.parse(readFileSync(new URL('../../canvascore-admin/blocks.json', import.meta.url), 'utf-8')), []);
  const starters = walk(JSON.parse(readFileSync(new URL('../../canvascore-admin/starters.json', import.meta.url), 'utf-8')), []);
  check('the default block placeholders are PNG images (saving keeps them)', defs.length > 0 && defs.every((u) => u.startsWith('data:image/png;base64,') && !blanked(u)), `${defs.filter(blanked).length} would be blanked`);
  check('the starter pages\' placeholders are PNG images too', starters.length > 0 && starters.every((u) => u.startsWith('data:image/png;base64,') && !blanked(u)), `${starters.filter(blanked).length} would be blanked`);
  check('the editor\'s placeholder is a PNG (and the rule does not blank it)', !blanked('data:image/png;base64,iVBORw0KGgo='));
}

// =============================================================== batch 3: scripts shared by the editor canvas and published pages
section('Shared scripts (Code Snippet, Table of Contents, Share Bar, Price Calculator, Multi-step Form, Video Hero, Audio Player, Announcement Bar)');
const RUNTIME_SRC = readFileSync(new URL('../src/render/blockRuntime.mjs', import.meta.url), 'utf-8');
const COMPILER_SRC = readFileSync(new URL('../../canvascore-admin/compiler.php', import.meta.url), 'utf-8');
const regionOf = (src, name) => { const m = src.match(new RegExp(`// cc-${name}:begin\\n[\\s\\S]*?// cc-${name}:end\\n`)); return m ? m[0] : null; };
{
  for (const name of ['hl', 'code', 'toc', 'share', 'calc', 'wizard', 'video', 'audio', 'announce']) {
    const a = regionOf(RUNTIME_SRC, name), b = regionOf(COMPILER_SRC, name);
    check(`"${name}": the text in the compiler is identical to the editor's (blockRuntime.mjs)`, !!a && a === b);
    check(`"${name}": nothing in it can end or confuse a <script> element`, !!a && !/<\/script|<!--|-->/i.test(a));
  }
}
const pub = (html, { title = 'Page title', url = 'https://example.com/page/?x=1#top', clipboard = true, share = false, io = false, reduced = false, mobile = false, storage = {}, storageBlocked = false, playRejects = false } = {}) => {
  const calls = { written: [], printed: 0, shared: [], exec: 0, played: 0, paused: 0 }; const ios = [];
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body><main>${html}</main></body></html>`, {
    runScripts: 'dangerously', url, pretendToBeVisual: true,
    beforeParse(win) {
      win.matchMedia = (q) => ({ matches: /max-width/.test(String(q)) ? mobile : reduced });
      win.print = () => { calls.printed++; };
      // jsdom has no media playback: a small stand-in (play / pause events, a clock and a length that the tests set)
      const mp = win.HTMLMediaElement.prototype;
      Object.defineProperty(mp, 'paused', { get() { return this.__paused !== false; }, configurable: true });
      Object.defineProperty(mp, 'currentTime', { get() { return this.__t || 0; }, set(v) { this.__t = Number(v); }, configurable: true });
      Object.defineProperty(mp, 'duration', { get() { return this.__d === undefined ? NaN : this.__d; }, configurable: true });
      mp.play = function () { calls.played++; if (playRejects) return Promise.reject(new Error('blocked')); this.__paused = false; this.dispatchEvent(new win.Event('play')); return Promise.resolve(); };
      mp.pause = function () { calls.paused++; this.__paused = true; this.dispatchEvent(new win.Event('pause')); };
      if (storageBlocked) Object.defineProperty(win, 'localStorage', { get() { throw new Error('storage blocked'); }, configurable: true });
      else for (const [k, v] of Object.entries(storage)) { try { win.localStorage.setItem(k, v); } catch { /* none */ } }
      win.requestAnimationFrame = (cb) => { cb(); return 1; };
      if (clipboard) Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: (t) => { calls.written.push(t); return Promise.resolve(); } }, configurable: true });
      if (share) Object.defineProperty(win.navigator, 'share', { value: (d) => { calls.shared.push(d); return Promise.resolve(); }, configurable: true });
      if (io) win.IntersectionObserver = class { constructor(cb, o) { this.cb = cb; this.o = o; this.t = []; ios.push(this); } observe(x) { this.t.push(x); } disconnect() {} };
      win.document.execCommand = () => { calls.exec++; return true; };
    },
  });
  return { win: dom.window, doc: dom.window.document, calls, ios, click: (el) => el.dispatchEvent(new dom.window.Event('click', { bubbles: true })) };
};
const settle = () => new Promise((r) => setTimeout(r, 20));

// =============================================================== CODE_SNIPPET: highlighter
section('CODE_SNIPPET highlighter');
{
  const cls = (code, lang) => ccTokens(code, lang).map(([c, t]) => (c ? c + ':' : '') + t);
  const has = (code, lang, ...want) => { const got = cls(code, lang); return want.every((w) => got.includes(w)); };
  check('JavaScript: keywords, strings, comments, numbers, function calls', has('const x = "a"; // note\nfoo(42)', 'js', 'k:const', 's:"a"', 'c:// note', 'n:42', 'f:foo'));
  check('JavaScript: template strings and block comments', has('`a ${b}` /* c */', 'js', 's:`a ${b}`', 'c:/* c */'));
  check('JavaScript: a keyword inside a word is not a keyword (iffy, xif)', !cls('iffy xif', 'js').some((t) => t.startsWith('k:')));
  check('JSON: keys, string values, numbers and literals', has('{"name": "x", "n": -3.5, "ok": true, "z": null}', 'json', 'a:"name"', 's:"x"', 'n:-3.5', 'k:true', 'k:null'));
  check('CSS: at-rules, properties, colors, lengths, comments', has('@media (x) { a { color: #fff; margin: 12px; } } /* c */', 'css', 'k:@media', 'a:color', 'n:#fff', 'n:12px', 'c:/* c */'));
  check('CSS: digits inside names (h1, .col2) are left alone', !cls('h1 .col2 { }', 'css').some((t) => t.startsWith('n:')));
  check('HTML: tags, attributes, strings, comments', has('<div class="a" id=\'b\'>x</div><!-- c -->', 'html', 't:<div', 'a:class', 's:"a"', 'a:id', 's:\'b\'', 't:>', 't:</div', 'c:<!-- c -->'));
  check('PHP: open tag, variables, keywords, strings, comments, calls', has('<?php $a = strlen("x"); // c\nreturn $a;', 'php', 'k:<?php', 'v:$a', 'f:strlen', 's:"x"', 'c:// c', 'k:return'));
  check('Shell: comments, variables, keywords, strings', has('# c\nif [ "$HOME" ]; then echo ${A} fi', 'shell', 'c:# c', 'k:if', 'k:then', 'k:echo', 'v:${A}', 's:"$HOME"'.replace('$HOME', '$HOME')));
  check('plain text and unknown languages: one token, no colors', cls('const x', 'text').length === 1 && cls('const x', 'cobol').length === 1 && cls('const x', undefined).length === 1);
  const corpus = ['', 'a', '"unterminated', "'x\\", '/* never closed', '`open ${', 'x = "a\\"b" + \'c\'', 'é 日本語 😀 "😀"', 'a\r\nb\r\n', '<<<EOF\n$x\nEOF', '\\', '"', '--'];
  check('lossless: the tokens always add up to the original text, in every language', ['js', 'json', 'css', 'html', 'php', 'shell', 'text', 'x'].every((lang) => corpus.every((code) => ccTokens(code, lang).map((t) => t[1]).join('') === code)));
  check('an unterminated block comment colors the rest; a quote cut short by a line break is left plain (strings never span lines)', has('a /* never', 'js', 'c:/* never') && !cls('a "never\nb', 'js').some((t) => t.startsWith('s:')) && has('x = "never', 'js', 's:"never'));
  const big = 'const a = "x"; // c\n'.repeat(2500);
  const t0 = Date.now(); const bigTokens = ccTokens(big, 'js');
  check('50,000 characters are highlighted in well under a second', Date.now() - t0 < 1500 && bigTokens.map((t) => t[1]).join('') === big, `${Date.now() - t0}ms`);
  const t1 = Date.now(); ccTokens('"' + '\\'.repeat(20000) + 'x', 'js'); ccTokens('/*'.repeat(20000), 'css'); ccTokens('<' + 'a='.repeat(10000), 'html');
  check('pathological input does not hang the highlighter', Date.now() - t1 < 1500, `${Date.now() - t1}ms`);
}

// =============================================================== CODE_SNIPPET
section('CODE_SNIPPET');
{
  const code = '<?php\n// hello\n$x = "a";\nreturn $x;\n\n\n';
  const h = php('CODE_SNIPPET', { language: 'php', filename: 'index.php', code, lineNumbers: true });
  const d = $(h);
  check('the code is plain escaped text in <pre><code> (colors are added in the browser), trailing blank lines trimmed', d('pre code').text() === '<?php\n// hello\n$x = "a";\nreturn $x;' && d('pre code span').length === 0);
  check('file name and language in the bar, with a copy button that stays hidden until the script runs', d('.cc-code-file').text() === 'index.php' && d('.cc-code-lang').text() === 'PHP' && d('button.cc-code-copy').attr('hidden') !== undefined);
  check('line numbers: one per line, in a gutter hidden from screen readers', d('.cc-code-gutter').text() === '1\n2\n3\n4' && d('.cc-code-gutter').attr('aria-hidden') === 'true');
  check('the language is recorded for the script; unknown languages become plain text', d('figure').attr('data-lang') === 'php' && $(php('CODE_SNIPPET', { language: 'cobol', code: 'x' }))('figure').attr('data-lang') === 'text');
  check('plain text without a file name and without a copy button has no bar at all', $(php('CODE_SNIPPET', { language: 'text', code: 'x', copyButton: false }))('.cc-code-bar').length === 0);
  check('Windows line breaks become \\n, and the dark/light themes use their own colors', $(php('CODE_SNIPPET', { code: 'a\r\nb\r\n' }))('code').text() === 'a\nb' && /background:#0f172a/.test(h) && /background:#f8fafc/.test(php('CODE_SNIPPET', { theme: 'light', code: 'x' })));
  check('maximum height and text size are applied and clamped', /max-height:300px/.test(php('CODE_SNIPPET', { code: 'x', maxHeight: 300 })) && /max-height:1200px/.test(php('CODE_SNIPPET', { code: 'x', maxHeight: 99999 })) && !/max-height/.test(php('CODE_SNIPPET', { code: 'x', maxHeight: -5 })) && /font:20px\/1\.6/.test(php('CODE_SNIPPET', { code: 'x', fontSize: 999 })));
  const bad = php('CODE_SNIPPET', { language: '"><script>x</script>', filename: '<img src=x onerror=a>', code: '</code></pre></figure><script>alert(1)</script><img src=x onerror=a>' });
  const bd = $(bad);
  check('hostile code and file name stay text: no element comes out of them', bd('img').length === 0 && bd('code').children().length === 0 && /&lt;\/script&gt;/.test(bad) && bd('figure').length === 1);
  check('the block has exactly one <script> (the highlighter), and no "</script" inside the code text', [...bad.matchAll(/<script>/g)].length === 1 && bad.split('</script>').length === 2);
  check('the code is limited to 50,000 characters', $(php('CODE_SNIPPET', { code: 'x'.repeat(60000) }))('code').text().length === 50000);
  check('code that is not text is ignored', $(php('CODE_SNIPPET', { code: { o: 1 } }))('code').text() === '');

  // the published script, run in jsdom
  const src = 'const total = 42; // count\nfoo("a")';
  const p = pub(php('CODE_SNIPPET', { language: 'js', code: src }));
  const pc = p.doc.querySelector('.cc-code-code');
  check('published: the code is colored (keywords, strings, numbers, comments, calls) and its text is unchanged', pc.textContent === src && ['k', 's', 'n', 'c', 'f'].every((k) => pc.querySelector('.cc-tk-' + k)));
  const spans = [...pc.children].map((e) => e.className.replace('cc-tk-', '') + ':' + e.textContent);
  check('published: exactly the tokens the editor canvas produces', JSON.stringify(spans) === JSON.stringify(ccTokens(src, 'js').filter((t) => t[0]).map((t) => t[0] + ':' + t[1])));
  const btn = p.doc.querySelector('.cc-code-copy');
  check('published: the copy button appears', btn.hidden === false);
  p.click(btn); await settle();
  check('published: it copies the code (not the colors) and says "Copied" for a moment', p.calls.written[0] === src && btn.textContent === 'Copied');
  const nc = pub(php('CODE_SNIPPET', { language: 'js', code: 'a' }), { clipboard: false });
  nc.click(nc.doc.querySelector('.cc-code-copy'));
  check('published: without the clipboard API it falls back to selecting and copying', nc.calls.exec === 1 && !nc.doc.querySelector('textarea'));
  const hostile = pub(php('CODE_SNIPPET', { language: 'html', code: '<img src=x onerror="alert(1)"><script>alert(2)</script>' }));
  check('published: HTML in the code is only ever text: no element is created, no script runs', hostile.doc.querySelectorAll('.cc-code-code img, .cc-code-code script').length === 0 && hostile.doc.querySelector('.cc-code-code').textContent === '<img src=x onerror="alert(1)"><script>alert(2)</script>');
}

// =============================================================== TABLE_OF_CONTENTS
section('TABLE_OF_CONTENTS');
{
  const h = php('TABLE_OF_CONTENTS', { title: 'On this page', levels: 'h2h3', numbered: true, sticky: true, stickyTop: 120, offset: 100 });
  const d = $(h);
  check('the block starts hidden and empty: only the script makes it appear', d('nav.cc-toc').attr('hidden') !== undefined && d('.cc-toc-list').children().length === 0 && d('nav').attr('aria-label') === 'On this page');
  check('settings are handed to the script as attributes (levels, numbering, highlighting, offset)', d('nav').attr('data-levels') === 'h2h3' && d('nav').attr('data-numbered') === '1' && d('nav').attr('data-highlight') === '1' && d('nav').attr('data-offset') === '100');
  check('sticky: position and distance from the top; not sticky by default', /position:sticky; top:120px/.test(h) && !/position:sticky/.test(php('TABLE_OF_CONTENTS', {})));
  check('a nameless contents list is still labelled for screen readers', $(php('TABLE_OF_CONTENTS', { title: '' }))('nav').attr('aria-label') === 'Table of contents');
  const bad = php('TABLE_OF_CONTENTS', { title: '<img src=x onerror=a>', levels: 'h9', stickyTop: 9999, offset: -1, accent: 'red;}' });
  check('hostile values: escaped title, unknown level → H2, numbers clamped, unsafe accent replaced', !/<img src=x/.test(bad) && $(bad)('nav').attr('data-levels') === 'h2' && $(bad)('nav').attr('data-offset') === '0' && !/red;\}/.test(bad));

  const page = '<div class="cc-text"><h1>Title</h1><h2>Intro</h2><p>x</p><h3>Sub one</h3><h2 id="keep">Keep</h2><h2>Intro</h2><h2>   </h2><h3>Sub two</h3></div>';
  const make = (c, extra = '') => pub(php('TABLE_OF_CONTENTS', c) + page + extra);
  await settle();
  const t = make({ levels: 'h2h3', numbered: true });
  await settle();
  const items = [...t.doc.querySelectorAll('.cc-toc-item')];
  check('published: lists the H2 and H3 headings of the page in order, skipping empty ones and the page title', items.map((li) => li.textContent).join('|') === '1. Intro|1.1. Sub one|2. Keep|3. Intro|3.1. Sub two', items.map((li) => li.textContent).join('|'));
  check('published: sub-headings are marked as such', items.map((li) => /cc-toc-l3/.test(li.className) ? 3 : 2).join('') === '23223');
  check('published: headings get unique ids (a duplicate name gets -2), an existing id is kept', [...t.doc.querySelectorAll('a')].map((a) => a.getAttribute('href')).join() === '#intro,#sub-one,#keep,#intro-2,#sub-two' && t.doc.getElementById('keep').textContent === 'Keep');
  check('published: the block appears, the "no headings" hint stays hidden, headings leave room for a sticky header', t.doc.querySelector('nav').hidden === false && t.doc.querySelector('.cc-toc-empty').hidden === true && t.doc.getElementById('intro').style.scrollMarginTop === '80px');
  const only2 = make({});
  await settle();
  check('published: by default only H2 headings, not numbered', [...only2.doc.querySelectorAll('.cc-toc-item')].map((li) => li.textContent).join('|') === 'Intro|Keep|Intro' && only2.doc.querySelectorAll('.cc-toc-num').length === 0);
  const none = pub(php('TABLE_OF_CONTENTS', {}) + '<p>No headings here</p>');
  await settle();
  check('published: a page without headings keeps the block hidden', none.doc.querySelector('nav').hidden === true);
  const inside = pub('<div class="cc-text"><h2>Own</h2></div>' + php('TABLE_OF_CONTENTS', { title: 'Own title' }));
  await settle();
  check('published: the contents list never lists its own title or entries', [...inside.doc.querySelectorAll('.cc-toc-item')].map((li) => li.textContent).join() === 'Own');
  const xss = pub(php('TABLE_OF_CONTENTS', {}) + '<div class="cc-text"><h2><img src=x onerror="alert(1)">Safe <b>bold</b></h2></div>');
  await settle();
  check('published: heading text becomes text in the list (no markup is copied)', xss.doc.querySelector('.cc-toc-item').textContent === 'Safe bold' && xss.doc.querySelectorAll('.cc-toc-item img, .cc-toc-item b').length === 0);
  // highlighting the section being read
  const hl = make({ levels: 'h2' });
  await settle();
  const heads = [...hl.doc.querySelectorAll('main h2')].filter((e) => e.textContent.trim());
  heads.forEach((e, i) => { e.getBoundingClientRect = () => ({ top: [-300, -40, 500][i] }); });
  hl.win.dispatchEvent(new hl.win.Event('scroll'));
  const active = [...hl.doc.querySelectorAll('.cc-toc-item')].map((li) => /is-active/.test(li.className));
  check('published: while scrolling, the last heading that has passed the top is highlighted (and marked current)', JSON.stringify(active) === '[false,true,false]' && hl.doc.querySelector('.is-active a').getAttribute('aria-current') === 'true');
  // the very end of the page: the last heading may never reach the top, but it is the one being read
  const endPage = make({ levels: 'h2' });
  await settle();
  const endHeads = [...endPage.doc.querySelectorAll('main h2')].filter((e) => e.textContent.trim());
  endHeads.forEach((e, i) => { e.getBoundingClientRect = () => ({ top: [-900, -500, 300][i] }); });
  Object.defineProperty(endPage.win, 'pageYOffset', { value: 1500, configurable: true });
  Object.defineProperty(endPage.win, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(endPage.doc.documentElement, 'scrollHeight', { value: 2300, configurable: true });
  endPage.win.dispatchEvent(new endPage.win.Event('scroll'));
  check('published: at the very bottom of the page the last heading is highlighted even if it never reached the top', JSON.stringify([...endPage.doc.querySelectorAll('.cc-toc-item')].map((li) => /is-active/.test(li.className))) === '[false,false,true]');
  // which headings count: the author's own, not the design headings of other blocks
  const mixed = pub(php('TABLE_OF_CONTENTS', { levels: 'h2h3' })
    + '<div class="cc-text"><h2>Text heading</h2><h3 class="cc-special">Classed heading</h3></div>'
    + '<div class="cc-story"><ol><li><h3 class="cc-story-title">Story step</h3></li></ol></div>'
    + '<div class="cc-collection"><h3 style="margin:0">Collection card title</h3></div>'
    + '<div class="cc-hero"><h2>Hero heading</h2></div><div class="cc-img-text"><h2>Image text heading</h2></div><div class="cc-html-block"><h2>Custom html heading</h2></div>'
    + '<h2>Loose heading outside any block</h2>');
  await settle();
  check('published: lists headings written in Text, Hero, Image + Text and Custom HTML blocks; leaves out the titles that belong to other blocks (Scrollytelling, Collection List...), classed headings and loose ones', [...mixed.doc.querySelectorAll('.cc-toc-item')].map((li) => li.textContent).join('|') === 'Text heading|Hero heading|Image text heading|Custom html heading', [...mixed.doc.querySelectorAll('.cc-toc-item')].map((li) => li.textContent).join('|'));
  const off = make({ levels: 'h2', highlight: false });
  await settle();
  check('published: highlighting can be switched off (no scroll listener work)', off.doc.querySelectorAll('.is-active').length === 0);
}

// =============================================================== SHARE_BAR
section('SHARE_BAR');
{
  const all = ['facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'email', 'copy', 'print', 'share'];
  const h = php('SHARE_BAR', { title: 'Share', networks: [...all].reverse() });
  const d = $(h);
  check('the networks always come in the same order, whatever order they were chosen in', d('.cc-share-btn').map((_, e) => d(e).attr('class').split(' ')[1].replace('cc-share-', '')).get().join() === all.join());
  check('social links are <a> that open in a new tab without handing over the window; the others are buttons', d('a.cc-share-btn').length === 6 && d('a.cc-share-btn').toArray().every((a) => d(a).attr('target') === '_blank' && d(a).attr('rel') === 'noopener noreferrer') && d('button.cc-share-btn').length === 3 && d('button.cc-share-btn').toArray().every((b) => d(b).attr('type') === 'button'));
  check('the bar starts hidden (it is useless without the script)', d('.cc-share').attr('hidden') !== undefined);
  check('every button has an accessible name', d('.cc-share-btn').toArray().every((b) => (d(b).attr('aria-label') || '').length > 3) && d('.cc-share-x').attr('aria-label') === 'Share on X' && d('.cc-share-email').attr('aria-label') === 'Share by email');
  check('"buttons" shows the names, "icons" only the symbols', d('.cc-share-label').length === 9 && $(php('SHARE_BAR', { networks: all, style: 'icons' }))('.cc-share-label').length === 0);
  check('only known networks are used; nothing chosen means no buttons', $(php('SHARE_BAR', { networks: ['evil', 7, null, 'x'] }))('.cc-share-btn').length === 1 && $(php('SHARE_BAR', { networks: 'facebook' }))('.cc-share-btn').length === 0 && $(php('SHARE_BAR', {}))('.cc-share-btn').length === 0);
  check('colors: network colors, white with border, dark; shapes; size is clamped', /background:#1877f2/.test(h) && /border:1px solid #cbd5e1/.test(php('SHARE_BAR', { networks: ['x'], colors: 'mono' })) && /background:#0f172a/.test(php('SHARE_BAR', { networks: ['x'], colors: 'dark' })) && /border-radius:0;/.test(php('SHARE_BAR', { networks: ['x'], shape: 'square' })) && /height:64px/.test(php('SHARE_BAR', { networks: ['x'], size: 9999 })) && /height:28px/.test(php('SHARE_BAR', { networks: ['x'], size: 1 })));
  const bad = php('SHARE_BAR', { title: '<img src=x onerror=a>', message: '"><script>alert(1)</script>', networks: ['x'] });
  check('hostile title and message are escaped (the message lives in an attribute)', !/<img src=x/.test(bad) && !/"><script>alert/.test(bad) && $(bad)('.cc-share').attr('data-msg') === '"><script>alert(1)</script>');

  const p = pub(php('SHARE_BAR', { networks: all, message: 'Read this & that' }), { share: true });
  const href = (n) => p.doc.querySelector(`a[data-net="${n}"]`).href;
  const u = encodeURIComponent('https://example.com/page/?x=1');
  check('published: the bar appears and every link points at the current page (without the #fragment)', p.doc.querySelector('.cc-share').hidden === false && href('facebook') === `https://www.facebook.com/sharer/sharer.php?u=${u}` && href('linkedin') === `https://www.linkedin.com/sharing/share-offsite/?url=${u}`);
  check('published: the message goes into X, WhatsApp, Telegram and the email', href('x') === `https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent('Read this & that')}` && href('whatsapp') === `https://wa.me/?text=${encodeURIComponent('Read this & that https://example.com/page/?x=1')}` && href('telegram').includes('text=' + encodeURIComponent('Read this & that')) && href('email') === `mailto:?subject=${encodeURIComponent('Read this & that')}&body=${u}`);
  const dflt = pub(php('SHARE_BAR', { networks: ['x'] }));
  check('published: without a message, the page title is used', dflt.doc.querySelector('a[data-net="x"]').href.endsWith('&text=' + encodeURIComponent('Page title')));
  const copyBtn = p.doc.querySelector('[data-act="copy"]');
  p.click(copyBtn); await settle();
  check('published: "Copy link" copies the page address and confirms', p.calls.written[0] === 'https://example.com/page/?x=1' && copyBtn.querySelector('.cc-share-label').textContent === 'Copied');
  p.click(p.doc.querySelector('[data-act="print"]'));
  check('published: "Print" opens the print dialog', p.calls.printed === 1);
  p.click(p.doc.querySelector('[data-act="share"]'));
  check('published: "Share" uses the phone\'s share sheet with the title and address', p.calls.shared.length === 1 && p.calls.shared[0].url === 'https://example.com/page/?x=1' && p.calls.shared[0].title === 'Read this & that');
  const noShare = pub(php('SHARE_BAR', { networks: ['share', 'copy'] }));
  check('published: "Share" is removed where the browser has no share sheet', noShare.doc.querySelector('[data-act="share"]').hidden === true && noShare.doc.querySelector('[data-act="copy"]').hidden === false);
  const evil = pub(php('SHARE_BAR', { networks: ['x', 'email'], message: '"><script>window.pwned=1</script>' }));
  check('published: a hostile message cannot inject anything (it is only URL-encoded)', evil.win.pwned === undefined && evil.doc.querySelectorAll('main script').length === 1 && evil.doc.querySelector('a[data-net="x"]').href.includes('%22%3E%3Cscript%3E'));
}

// =============================================================== SCROLLYTELLING
section('SCROLLYTELLING');
{
  const steps = [{ title: 'One', text: 'a\nb', image: 'one.jpg', alt: 'First image' }, { title: 'Two', text: 'second' }, { title: 'Three', image: 'three.jpg' }];
  const h = php('SCROLLYTELLING', { steps });
  const d = $(h);
  check('one image (or numbered placeholder) and one text per step, in order', d('.cc-story-img').length === 3 && d('.cc-story-step').length === 3 && d('img.cc-story-img').eq(0).attr('alt') === 'First image' && d('.cc-story-ph').text() === '2' && d('.cc-story-title').map((_, e) => d(e).text()).get().join() === 'One,Two,Three');
  check('text keeps its line breaks', d('.cc-story-text').eq(0).html() === 'a<br>b');
  check('the first image is the one showing before any scrolling (the rules for every step are in the stylesheet)', d('.cc-story').attr('data-active') === '0' && /#tb\[data-active="0"\] \.cc-story-img\[data-i="0"\]\{opacity:1\}/.test(h) && /#tb\[data-active="2"\] \.cc-story-img\[data-i="2"\]\{opacity:1\}/.test(h));
  check('the image side: left by default, right on request (the image column is ordered after the text)', !/order:2/.test(h) && /order:2/.test(php('SCROLLYTELLING', { steps, side: 'right' })));
  check('on phones the image sticks to the top above the text, shorter, in one column', /max-width:768px\)\{#tb \.cc-story-grid\{grid-template-columns:1fr !important/.test(h) && /max-height:36vh/.test(h) && /min-height:55vh/.test(h));
  check('the dimming of inactive steps only applies once the script is running (.cc-story-on)', /\.cc-story-on \.cc-story-step\{opacity:\.35/.test(h) && !/class="cc-story-step"[^>]*opacity/.test(h));
  check('motion is switched off for visitors who prefer reduced motion', /prefers-reduced-motion:reduce\)\{#tb \.cc-story-img,#tb\.cc-story-on \.cc-story-step\{transition:none/.test(h));
  const bad = php('SCROLLYTELLING', { side: 'x', ratio: '99 / 1', stickyTop: 'abc', stepHeight: 9999, gap: -5, steps: [{ title: '<img src=x onerror=a>', text: { o: 1 }, image: 'javascript:alert(1)' }, 'junk', null] });
  check('hostile values: escaped, no javascript: image, junk steps skipped, numbers clamped, unknown shape → 4:3', !/<img src=x/.test(bad) && !/src="javascript:/i.test(bad) && $(bad)('.cc-story-step').length === 1 && /min-height:120vh/.test(bad) && /gap:0px/.test(bad) && /aspect-ratio:4 \/ 3/.test(bad) && /top:80px/.test(bad));
  check('at most 12 steps', $(php('SCROLLYTELLING', { steps: Array.from({ length: 20 }, (_, i) => ({ title: 'S' + i })) }))('.cc-story-step').length === 12);
  check('no steps: an empty block and no script', $(php('SCROLLYTELLING', {}))('.cc-story-step').length === 0 && !/<script/.test(php('SCROLLYTELLING', {})));

  const p = pub(h, { io: true });
  const root = p.doc.querySelector('.cc-story');
  check('published: the script starts watching the steps around the middle of the screen', root.classList.contains('cc-story-on') && p.ios[0].t.length === 3 && p.ios[0].o.rootMargin === '-45% 0px -45% 0px');
  const els = [...p.doc.querySelectorAll('.cc-story-step')];
  p.ios[0].cb([{ isIntersecting: true, target: els[2] }]);
  check('published: the step in the middle decides the active image', root.getAttribute('data-active') === '2');
  p.ios[0].cb([{ isIntersecting: false, target: els[2] }, { isIntersecting: true, target: els[1] }]);
  check('published: leaving a step does not change anything by itself; entering another one does', root.getAttribute('data-active') === '1');
  const noIo = pub(h);
  check('published: without IntersectionObserver nothing is dimmed and the first image stays', !noIo.doc.querySelector('.cc-story').classList.contains('cc-story-on') && noIo.doc.querySelector('.cc-story').getAttribute('data-active') === '0');
  const one = pub(php('SCROLLYTELLING', { steps: [{ title: 'Only' }] }), { io: true });
  check('published: a single step needs no watching', one.ios.length === 0);
}

// =============================================================== HOTSPOTS
section('HOTSPOTS');
{
  const pins = [{ x: 10, y: 20, title: 'Top left', text: 'a\nb', linkText: 'More', href: 'prodotti/index.html' }, { x: 50, y: 60, title: 'Middle low' }, { x: 90, y: 90, text: 'No title' }, { x: 25, y: 55 }, { x: 75.4, y: 55.5 }];
  const h = php('HOTSPOTS', { image: 'p.jpg', alt: 'The product', pins });
  const d = $(h);
  check('image with alt text, one numbered pin per hotspot', d('img.cc-hs-img').attr('alt') === 'The product' && d('.cc-hs-pin').length === 5 && d('.cc-hs-num').map((_, e) => d(e).text()).get().join() === '1,2,3,4,5');
  check('pins sit at their position in percent', /left:10\.0%; top:20\.0%/.test(h) && /left:75\.4%; top:55\.5%/.test(h));
  const pos = (i) => d('.cc-hs-pin').eq(i).attr('class').replace('cc-hs-pin ', '');
  check('the text opens below a pin in the top half, above it in the bottom half; away from the nearest side edge', [pos(0), pos(1), pos(2), pos(3), pos(4)].join('|') === 'cc-hs-below cc-hs-left|cc-hs-above cc-hs-center|cc-hs-above cc-hs-right|cc-hs-below cc-hs-center|cc-hs-above cc-hs-right', [pos(0), pos(1), pos(2), pos(3), pos(4)].join('|'));
  check('each pin is a real button named by its title ("Hotspot N" without one), described by its text', d('button.cc-hs-btn').eq(0).attr('aria-label') === 'Top left' && d('button.cc-hs-btn').eq(2).attr('aria-label') === 'Hotspot 3' && d('button.cc-hs-btn').eq(0).attr('aria-describedby') === 'tb-p0' && d('#tb-p0').attr('role') === 'tooltip');
  check('the text, line breaks and an internal link', d('#tb-p0 .cc-hs-text').html() === 'a<br>b' && d('#tb-p0 .cc-hs-link').attr('href') === '{{BASE_URL}}prodotti/' && d('#tb-p0 .cc-hs-link').text() === 'More →');
  check('it opens on hover and on keyboard focus even without the script, and the pulse is switched off for reduced motion', /\.cc-hs-pin:hover \.cc-hs-pop,#tb \.cc-hs-pin:focus-within \.cc-hs-pop/.test(h) && /prefers-reduced-motion:reduce\)\{#tb \.cc-hs-ring\{animation:none;display:none/.test(h));
  check('the pulsing ring can be switched off; without an image there is a grey box in the chosen shape', $(php('HOTSPOTS', { pulse: false, pins }))('.cc-hs-ring').length === 0 && /aspect-ratio:4 \/ 3/.test(php('HOTSPOTS', { ratio: '4 / 3', pins })) && $(php('HOTSPOTS', { pins }))('.cc-hs-ph').length === 1);
  const bad = php('HOTSPOTS', { image: 'javascript:alert(1)', pinColor: 'red;}', pins: [{ x: 'abc', y: 500, title: '<img src=x onerror=a>', linkText: 'L', href: 'javascript:alert(2)' }, { x: -5, y: -5 }, 'junk', null] });
  check('hostile values: escaped, no javascript: image or link, unsafe color replaced, positions clamped (abc → centre, 500 → 100, -5 → 0), junk skipped', !/<img src=x/.test(bad) && !/src="javascript:/i.test(bad) && !/href="javascript:/i.test(bad) && !/red;\}/.test(bad) && $(bad)('.cc-hs-pin').length === 2 && /left:50\.0%; top:100\.0%/.test(bad) && /left:0\.0%; top:0\.0%/.test(bad));
  check('at most 20 pins; none means no script', $(php('HOTSPOTS', { pins: Array.from({ length: 30 }, () => ({ x: 1, y: 1 })) }))('.cc-hs-pin').length === 20 && !/<script/.test(php('HOTSPOTS', {})));

  const p = pub(h);
  const pinEls = [...p.doc.querySelectorAll('.cc-hs-pin')]; const btns = [...p.doc.querySelectorAll('.cc-hs-btn')];
  check('published: every pin button announces that it is collapsed', btns.every((b) => b.getAttribute('aria-expanded') === 'false'));
  p.click(btns[0]);
  check('published: a click or tap opens that pin\'s text', pinEls[0].classList.contains('is-open') && btns[0].getAttribute('aria-expanded') === 'true');
  p.click(btns[1]);
  check('published: opening another pin closes the first', !pinEls[0].classList.contains('is-open') && btns[0].getAttribute('aria-expanded') === 'false' && pinEls[1].classList.contains('is-open'));
  p.click(btns[1]);
  check('published: clicking the same pin again closes it', !pinEls[1].classList.contains('is-open'));
  p.click(btns[2]); p.doc.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('published: Escape closes it', !pinEls[2].classList.contains('is-open') && btns[2].getAttribute('aria-expanded') === 'false');
  p.click(btns[3]); p.click(p.doc.body);
  check('published: a click anywhere else closes it', !pinEls[3].classList.contains('is-open'));
}

// =============================================================== PRICE_CALCULATOR
section('PRICE_CALCULATOR');
const phpReg = (type, content, id = 'tb') => JSON.parse(execFileSync('php', [fileURLToPath(new URL('./render_registry.php', import.meta.url))], { input: JSON.stringify({ id, type, styles: {}, content }) }).toString());
{
  const calc = { title: 'Estimate', basePrice: 29, currency: '€', periodMonth: 'month', billingToggle: true, yearlyDiscount: 20, sliders: [
    { label: 'Team', unit: 'people', min: 1, max: 50, step: 1, value: 5, included: 3, price: 8 }, { label: 'Storage', unit: 'GB', min: 10, max: 500, step: 10, value: 50, included: 10, price: 0.5 }],
    addons: [{ label: 'Support', price: 49, checked: false }, { label: 'Domain', price: 9, checked: true }], buttonText: 'Start', buttonUrl: 'contatti/index.html', note: 'Excl. VAT' };
  const h = php('PRICE_CALCULATOR', calc);
  const d = $(h);
  // 29 base + (5-3)*8 = 16 + (50-10)*0.5 = 20 + domain 9 = 74
  check('the starting total is worked out on the server: base + sliders beyond their free units + ticked add-ons', d('.cc-calc-amount').text() === '€74' && d('.cc-calc-per').text() === ' / month', d('.cc-calc-amount').text());
  check('every slider has its range, step, price, free units, unit and value showing', d('.cc-calc-range').length === 2 && d('.cc-calc-range').eq(0).attr('min') === '1' && d('.cc-calc-range').eq(0).attr('max') === '50' && d('.cc-calc-range').eq(1).attr('step') === '10' && d('.cc-calc-range').eq(1).attr('data-price') === '0.5' && d('.cc-calc-range').eq(0).attr('data-incl') === '3' && d('.cc-calc-val').eq(0).text() === '5 people' && d('.cc-calc-val').eq(1).text() === '50 GB');
  check('each slider is labelled and its value is an <output> tied to it (accessible names)', d('label[for="tb-s0"]').text() === 'Team' && d('output.cc-calc-val').eq(0).attr('for') === 'tb-s0');
  check('the breakdown shows the base price, the sliders that cost something and the ticked add-ons; unticked ones are hidden', d('.cc-calc-line').map((_, e) => d(e).attr('data-line') + (d(e).attr('hidden') !== undefined ? '(hidden)' : '')).get().join() === 'base,s0,s1,a0(hidden),a1' && d('.cc-calc-line-amt').map((_, e) => d(e).text()).get().join() === '€29,€16,€20,€49,€9');
  check('add-ons list their monthly price, and are ticked as set', d('.cc-calc-addon-price').eq(0).text() === '+ €49 / month' && d('.cc-calc-addon').eq(1).attr('checked') !== undefined && d('.cc-calc-addon').eq(0).attr('checked') === undefined);
  check('the monthly / yearly switch is a real radio group (with the discount shown) and monthly is chosen', d('.cc-calc-billing').attr('role') === 'radiogroup' && d('.cc-calc-billing input').length === 2 && d('.cc-calc-billing input[value="monthly"]').attr('checked') !== undefined && d('.cc-calc-badge').text().trim() === '-20%');
  check('the button goes to the internal page; the note is shown', d('.cc-calc-btn').attr('href') === '{{BASE_URL}}contatti/' && d('.cc-calc-note').text() === 'Excl. VAT');
  const yr = $(php('PRICE_CALCULATOR', { ...calc, defaultBilling: 'yearly' }));
  // 74 * 12 * 0.8 = 710.4 → €710; without discount 888 → saves 177.6 → €178
  check('shown yearly: 12 months minus the discount, "/ year", and what it saves', yr('.cc-calc-amount').text() === '€710' && yr('.cc-calc-per').text() === ' / year' && yr('.cc-calc-save').attr('hidden') === undefined && yr('.cc-calc-save').text() === 'You save €178 a year' && yr('.cc-calc-line-amt').eq(0).text() === '€278');
  check('…monthly: no saving message', d('.cc-calc-save').attr('hidden') !== undefined && d('.cc-calc-save').text() === '');
  check('no switch without the option (and never yearly then)', $(php('PRICE_CALCULATOR', { ...calc, billingToggle: false, defaultBilling: 'yearly' }))('.cc-calc-billing').length === 0 && $(php('PRICE_CALCULATOR', { ...calc, billingToggle: false, defaultBilling: 'yearly' }))('.cc-calc-amount').text() === '€74');
  const fm = (extra) => $(php('PRICE_CALCULATOR', { basePrice: 1234567.891, currency: '€', ...extra }))('.cc-calc-amount').text();
  check('number formats: 1,234,568 and 1.234.568,89 with decimals; the currency before or after (with a no-break space)', fm({}) === '€1,234,568' && fm({ decimals: 2 }) === '€1,234,567.89' && fm({ decimals: 2, numberFormat: 'eu' }) === '€1.234.567,89' && fm({ decimals: 2, numberFormat: 'eu', currencyPos: 'after' }) === '1.234.567,89 €');
  check('amounts round half up (2.675 → 2.68, 0.005 → 0.01)', $(php('PRICE_CALCULATOR', { basePrice: 2.675, decimals: 2 }))('.cc-calc-amount').text() === '2.68' && $(php('PRICE_CALCULATOR', { basePrice: 0.005, decimals: 2 }))('.cc-calc-amount').text() === '0.01');
  const bad = php('PRICE_CALCULATOR', { title: '<img src=x onerror=a>', currency: '<script>x</script>', basePrice: -5, decimals: 99, accent: 'red;}', billingToggle: 'yes', yearlyDiscount: 999, buttonText: 'B', buttonUrl: 'javascript:alert(1)',
    sliders: [{ label: '<i>a</i>', unit: '<b>u</b>', min: 50, max: 10, step: 0, value: 999, included: -3, price: -2 }, 'junk', null], addons: [{ label: ['x'], price: 'y', checked: 'yes' }, 7] });
  const bd = $(bad);
  check('hostile values: everything escaped, no javascript: link, unsafe color replaced', !/<img src=x|<script>x|<i>a|<b>u/.test(bad) && !/href="javascript:/i.test(bad) && !/red;\}/.test(bad));
  // the currency symbol is shown inside every amount: markup in it must stay text (6 characters are enough for "<!--" or "<b>")
  for (const [name, fn] of [['PHP', php], ['the editor', js]]) {
    const cm = $(fn('PRICE_CALCULATOR', { basePrice: 5, currency: '<!--', sliders: [{ label: 'x', min: 0, max: 9, step: 1, value: 2, price: 1 }], addons: [{ label: 'y', price: 3, checked: true }] }));
    const bm = $(fn('PRICE_CALCULATOR', { basePrice: 5, currency: '<b>X</b>' }));
    check(`${name}: a currency like "<!--" or "<b>" stays visible text in every amount, and the rest of the block is intact`, cm('.cc-calc-amount').text() === '<!--10' && cm('.cc-calc-line-amt').map((_, e) => cm(e).text()).get().join() === '<!--5,<!--2,<!--3' && cm('.cc-calc-btn, .cc-calc-summary').length >= 1 && bm('.cc-calc-amount').text() === '<b>X</5' && bm('.cc-calc-amount b').length === 0);
  }
  check('odd numbers are tamed: a negative price becomes 0, decimals ≤ 2, a switch needs exactly true, a slider with min ≥ max still works, value is kept inside the range', bd('.cc-calc-billing').length === 0 && /data-dec="2"/.test(bad) && bd('.cc-calc-range').attr('min') === '50' && bd('.cc-calc-range').attr('max') === '51' && bd('.cc-calc-range').attr('value') === '51' && bd('.cc-calc-range').attr('data-price') === '0' && bd('.cc-calc-amount').text() === '<scrip0.00' && bd('.cc-calc-range').length === 1 && bd('.cc-calc-addon').length === 1);
  check('at most 6 sliders and 8 add-ons; the currency is cut at 6 characters', $(php('PRICE_CALCULATOR', { sliders: Array.from({ length: 9 }, () => ({ label: 'x' })), addons: Array.from({ length: 12 }, () => ({ label: 'y' })) }))('.cc-calc-range').length === 6 && $(php('PRICE_CALCULATOR', { addons: Array.from({ length: 12 }, () => ({ label: 'y' })) }))('.cc-calc-addon').length === 8 && /data-cur="12345678"/.test(php('PRICE_CALCULATOR', { currency: '12345678' })) === false);
  // the server and the editor produce the same numbers in every text
  const texts = (html) => { const q = $(html); return ['.cc-calc-amount', '.cc-calc-per', '.cc-calc-save', '.cc-calc-line-amt', '.cc-calc-val', '.cc-calc-addon-price'].map((sel) => q(sel).map((_, e) => q(e).text()).get().join('|')).join(' # '); };
  const variants = [calc, { ...calc, defaultBilling: 'yearly', numberFormat: 'eu', decimals: 2, currencyPos: 'after' }, { basePrice: 1234.5, decimals: 1, sliders: [{ label: 'x', min: 0, max: 1, step: 0.1, value: 0.5, price: 100 }], addons: [{ label: 'a', price: 49.99, checked: true }] }, { basePrice: 10, billingToggle: true, defaultBilling: 'yearly', yearlyDiscount: 0 }];
  check('PHP and the editor\'s renderer write exactly the same amounts, units and labels', variants.every((v) => texts(php('PRICE_CALCULATOR', v)) === texts(js('PRICE_CALCULATOR', v))), variants.map((v) => texts(php('PRICE_CALCULATOR', v)) === texts(js('PRICE_CALCULATOR', v))).join());
  check('the attributes the script reads are the same on both sides', ['data-base', 'data-disc', 'data-dec', 'data-fmt', 'data-cur', 'data-pos', 'data-per-m', 'data-per-y', 'data-save'].every((a) => variants.every((v) => $(php('PRICE_CALCULATOR', v))('.cc-calc').attr(a) === $(js('PRICE_CALCULATOR', v))('.cc-calc').attr(a))));

  // the published script
  const p = pub(php('PRICE_CALCULATOR', calc));
  const amount = () => p.doc.querySelector('.cc-calc-amount').textContent;
  const setRange = (i, v) => { const r = p.doc.querySelectorAll('.cc-calc-range')[i]; r.value = String(v); r.dispatchEvent(new p.win.Event('input', { bubbles: true })); };
  const lineAmt = (k) => p.doc.querySelector(`.cc-calc-line[data-line="${k}"]`);
  check('published: starting numbers are unchanged by the script (it agrees with the server)', amount() === '€74' && p.doc.querySelectorAll('.cc-calc-line-amt')[1].textContent === '€16');
  setRange(0, 13);   // (13-3)*8 = 80 → 29+80+20+9 = 138
  check('published: moving a slider updates the value shown, its line and the total at once', amount() === '€138' && p.doc.querySelector('.cc-calc-val').textContent === '13 people' && lineAmt('s0').querySelector('.cc-calc-line-amt').textContent === '€80');
  setRange(0, 2);    // inside the free units: costs nothing → line hidden
  check('published: a slider inside its free units costs nothing and its line disappears', amount() === '€58' && lineAmt('s0').hidden === true);
  const sup = p.doc.querySelectorAll('.cc-calc-addon')[0]; sup.checked = true; sup.dispatchEvent(new p.win.Event('change', { bubbles: true }));
  check('published: ticking an add-on adds it and shows its line', amount() === '€107' && lineAmt('a0').hidden === false);
  const yearlyRadio = p.doc.querySelector('.cc-calc-billing input[value="yearly"]'); yearlyRadio.checked = true; yearlyRadio.dispatchEvent(new p.win.Event('change', { bubbles: true }));
  // (29 + 0 + 20 + 49 + 9) = 107 → *12*0.8 = 1027.2
  check('published: switching to yearly shows the yearly total, "/ year", every line scaled, and the saving', amount() === '€1,027' && p.doc.querySelector('.cc-calc-per').textContent === ' / year' && lineAmt('base').querySelector('.cc-calc-line-amt').textContent === '€278' && p.doc.querySelector('.cc-calc-save').hidden === false && p.doc.querySelector('.cc-calc-save').textContent === 'You save €257 a year', p.doc.querySelector('.cc-calc-save').textContent);
  const monthlyRadio = p.doc.querySelector('.cc-calc-billing input[value="monthly"]'); monthlyRadio.checked = true; yearlyRadio.checked = false; monthlyRadio.dispatchEvent(new p.win.Event('change', { bubbles: true }));
  check('published: and back to monthly (the saving message goes away)', amount() === '€107' && p.doc.querySelector('.cc-calc-per').textContent === ' / month' && p.doc.querySelector('.cc-calc-save').hidden === true);
  const eu = pub(php('PRICE_CALCULATOR', { basePrice: 1000, decimals: 2, numberFormat: 'eu', currencyPos: 'after', currency: '€', sliders: [{ label: 'x', min: 0, max: 100, step: 1, value: 0, price: 1234.56 }] }));
  const er = eu.doc.querySelector('.cc-calc-range'); er.value = '2'; er.dispatchEvent(new eu.win.Event('input', { bubbles: true }));
  check('published: the script formats like the server (1.000,00 € → 3.469,12 €)', eu.doc.querySelector('.cc-calc-amount').textContent === '3.469,12 €', eu.doc.querySelector('.cc-calc-amount').textContent);
  const dec = pub(php('PRICE_CALCULATOR', { sliders: [{ label: 'x', unit: 'kg', min: 0, max: 1, step: 0.1, value: 0.5, price: 10 }] }));
  const dr = dec.doc.querySelector('.cc-calc-range'); dr.value = '0.7'; dr.dispatchEvent(new dec.win.Event('input', { bubbles: true }));
  check('published: decimal slider values read cleanly (0.7 kg), the total follows', dec.doc.querySelector('.cc-calc-val').textContent === '0.7 kg' && dec.doc.querySelector('.cc-calc-amount').textContent === '7', dec.doc.querySelector('.cc-calc-amount').textContent);
}

// =============================================================== WIZARD (multi-step form)
section('WIZARD');
{
  const wiz = { title: 'Quote', intro: 'Tell us more', email: 'owner@corp.example', successMsg: 'Thanks!', steps: [
    { title: 'You', description: 'Who?', fields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }] },
    { title: 'Project', fields: [{ label: 'Need', type: 'radio', required: true, options: 'A\nB\n\n  C  ' }, { label: 'Budget', type: 'select', options: 'x\ny', placeholder: 'Pick' }, { label: 'Extras', type: 'checkboxes', required: true, options: 'One\nTwo' }] },
    { title: '', fields: [{ label: 'Message', type: 'textarea' }, { label: 'I agree', type: 'consent', required: true }] }] };
  const out = phpReg('WIZARD', wiz, 'wz-1');
  const h = out.html; const d = $(h);
  check('one fieldset per step (focusable by the script), with the step title as its legend (a number when there is none)', d('fieldset.cc-wz-step').length === 3 && d('fieldset.cc-wz-step').toArray().every((e) => d(e).attr('tabindex') === '-1') && d('.cc-wz-step-title').map((_, e) => d(e).text()).get().join('|') === 'You|Project|Step 3' && d('.cc-wz-step-desc').text() === 'Who?');
  check('every field of every step is numbered in order (field_0 … field_6) and carries its label, so the form endpoint reads it like any form', d('[name^="_label_field_"]').map((_, e) => d(e).attr('name') + '=' + d(e).attr('value')).get().join() === '_label_field_0=Name,_label_field_1=Email,_label_field_2=Need,_label_field_3=Budget,_label_field_4=Extras,_label_field_5=Message,_label_field_6=I agree');
  check('it posts to the same endpoint as the Form block, with the same hidden fields and honeypot', d('form').attr('action') === '{{BASE_URL}}canvascore-admin/submit_form.php' && d('form').attr('method') === 'POST' && d('input[name="_form"]').attr('value') === d('form').attr('id') && d('input[name="_hp"]').length === 1 && d('input[name="_success"]').attr('value') === 'Thanks!');
  check('the form\'s registry entry holds the labels in the same order, the recipient, the message, the kind and where the email, name and consent fields are', JSON.stringify(out.registry[d('form').attr('id')]) === JSON.stringify({ to: 'owner@corp.example', labels: ['Name', 'Email', 'Need', 'Budget', 'Extras', 'Message', 'I agree'], success: 'Thanks!', type: 'wizard', meta: { name: 0, email: 1, consent: 6 } }), JSON.stringify(out.registry));
  check('the recipient never appears in the page itself', !/owner@corp\.example/.test(h));
  check('text, email and long-text fields have their own control, label tied to it, and required where asked', d('input[type="text"][name="field_0"]').attr('required') !== undefined && d('label[for="wz-1-f0"]').text() === 'Name' && d('input[type="email"][name="field_1"]').length === 1 && d('textarea[name="field_5"]').attr('required') === undefined);
  check('choose-one: radio buttons (trimmed choices, empty lines dropped), each required', d('input[type="radio"][name="field_2"]').map((_, e) => d(e).attr('value')).get().join() === 'A,B,C' && d('input[type="radio"][name="field_2"]').toArray().every((e) => d(e).attr('required') !== undefined));
  check('drop-down: a first empty choice with the placeholder, then the choices', d('select[name="field_3"] option').map((_, e) => d(e).attr('value') + ':' + d(e).text()).get().join() === ':Pick,x:x,y:y');
  check('choose-several: checkboxes sent as a list, in a group that is marked required (checked by the script)', d('input[type="checkbox"][name="field_4[]"]').length === 2 && d('input[name="field_4[]"]').attr('required') === undefined && d('.cc-wz-group').eq(1).attr('data-req') === '1' && d('.cc-wz-group').eq(0).attr('data-req') === '0');
  check('agreement: one box whose text is the label', d('input[type="checkbox"][name="field_6"]').attr('required') !== undefined && d('input[name="field_6"]').attr('value') === 'Yes' && d('label.cc-wz-opt span').last().text() === 'I agree');
  check('without the script every step shows (long form) and the step buttons are hidden; only "Send" is visible', d('.cc-wz-step[hidden]').length === 0 && d('.cc-wz-back').attr('hidden') !== undefined && d('.cc-wz-next').attr('hidden') !== undefined && d('.cc-wz-submit').attr('hidden') === undefined && d('.cc-wz-progress').attr('hidden') !== undefined);
  check('progress: a bar at 1/3 and "Step 1 of 3" by default; numbered steps on request', /width:33\.3%/.test(h) && d('.cc-wz-count').text() === 'Step 1 of 3' && $(php('WIZARD', { ...wiz, progress: 'steps' }))('.cc-wz-dot').length === 3 && $(php('WIZARD', { ...wiz, progress: 'steps' }))('.cc-wz-fill').length === 0);
  check('the step text can be translated ({n} and {total})', $(php('WIZARD', { ...wiz, stepLabel: 'Passo {n} di {total}' }))('.cc-wz-count').text() === 'Passo 1 di 3');
  const id1 = d('form').attr('id'), other = phpReg('WIZARD', wiz, 'wz-2').html;
  check('every wizard has its own form id (so its submissions are told apart); a custom id is used as given (cleaned)', id1 !== $(other)('form').attr('id') && /^f_[a-f0-9]{16}$/.test(id1) && $(php('WIZARD', { ...wiz, customId: 'My Form!' }))('form').attr('id') === 'f_MyForm');
  const bad = phpReg('WIZARD', { title: '<b>x</b>', progress: 'evil', accent: 'red;}', successMsg: '"><script>x</script>', steps: [
    { title: '<img src=x onerror=a>', description: { o: 1 }, fields: [{ label: '"><b>', type: 'evil', required: 'yes' }, 'junk', null, { label: ['x'], type: 'select', options: Array.from({ length: 30 }, (_, i) => 'opt' + i).join('\n') }] }, 'junk', null, { fields: 'nope' }] }, 'wz-3');
  const bh = bad.html, bd = $(bh);
  check('hostile values: escaped everywhere (labels, titles, options, messages), unsafe color replaced', !/<img src=x|<b>x|"><b>|"><script>/.test(bh) && !/red;\}/.test(bh) && bd('input[name="_success"]').attr('value') === '"><script>x</script>');
  check('odd input is tamed: an unknown field type is a text field, "required" needs exactly true, junk steps and fields are skipped, at most 20 choices', bd('fieldset.cc-wz-step').length === 2 && bd('input[type="text"][name="field_0"]').length === 1 && bd('input[name="field_0"]').attr('required') === undefined && bd('select option').length === 21 && Object.values(bad.registry)[0].labels.length === 2);
  check('limits: 8 steps, 12 fields a step, 40 fields in all', $(php('WIZARD', { steps: Array.from({ length: 12 }, () => ({ title: 't', fields: [{ label: 'a' }] })) }))('.cc-wz-step').length === 8 && $(php('WIZARD', { steps: [{ fields: Array.from({ length: 20 }, () => ({ label: 'a' })) }] }))('input[type="text"][name^="field_"]').length === 12 && $(php('WIZARD', { steps: Array.from({ length: 6 }, () => ({ fields: Array.from({ length: 12 }, () => ({ label: 'a' })) })) }))('input[name^="field_"]').length === 40);
  check('an empty wizard is still a valid, harmless form', $(php('WIZARD', {}))('.cc-wz-step').length === 0 && $(php('WIZARD', {}))('form').length === 1);
  const texts = (html) => { const q = $(html); return ['.cc-wz-title', '.cc-wz-intro', '.cc-wz-step-title', '.cc-wz-label', '.cc-wz-count', 'option', '.cc-wz-opt span', 'button'].map((sel) => q(sel).map((_, e) => q(e).text()).get().join('|')).join(' # '); };
  check('PHP and the editor\'s renderer write the same texts, labels and choices', [wiz, { ...wiz, progress: 'steps', stepLabel: 'Passo {n}' }, {}].every((v) => texts(php('WIZARD', v)) === texts(js('WIZARD', v))));

  // the published script
  const mk = () => pub(php('WIZARD', wiz));
  const p = mk();
  const vis = () => [...p.doc.querySelectorAll('.cc-wz-step')].map((e) => !e.hidden).join();
  const fill = (name, v) => { const e = p.doc.querySelector(`[name="${name}"]`); e.value = v; };
  check('published: starts on step 1 only, with Next visible (not Back, not Send), the progress shown and "Step 1 of 3"', vis() === 'true,false,false' && p.doc.querySelector('.cc-wz-back').hidden === true && p.doc.querySelector('.cc-wz-next').hidden === false && p.doc.querySelector('.cc-wz-submit').hidden === true && p.doc.querySelector('.cc-wz-progress').hidden === false && p.doc.querySelector('.cc-wz-count').textContent === 'Step 1 of 3');
  check('published: the browser\'s own checking is replaced by the script\'s (novalidate), since hidden steps can\'t be focused', p.doc.querySelector('form').hasAttribute('novalidate'));
  p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: Next stays on the step while a required field is empty', vis() === 'true,false,false');
  fill('field_0', 'Ann'); fill('field_1', 'not-an-email'); p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: …and while a value is not valid for its type (an email)', vis() === 'true,false,false');
  fill('field_1', 'ann@example.com'); p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: with valid answers Next shows step 2, the bar moves to 67%, "Step 2 of 3", Back appears', vis() === 'false,true,false' && p.doc.querySelector('.cc-wz-fill').style.width === '66.7%' && p.doc.querySelector('.cc-wz-count').textContent === 'Step 2 of 3' && p.doc.querySelector('.cc-wz-back').hidden === false);
  check('published: the new step takes the focus (announced with its title, for keyboard and screen reader users)', p.doc.activeElement === p.doc.querySelectorAll('.cc-wz-step')[1]);
  p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: a required choose-one stays put until something is chosen', vis() === 'false,true,false');
  p.doc.querySelector('input[name="field_2"][value="B"]').checked = true; p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: …and so does a required choose-several (at least one box)', vis() === 'false,true,false');
  p.doc.querySelector('input[name="field_4[]"][value="Two"]').checked = true; p.doc.querySelector('input[name="field_4[]"][value="Two"]').dispatchEvent(new p.win.Event('change', { bubbles: true }));
  p.click(p.doc.querySelector('.cc-wz-back'));
  check('published: Back returns to step 1 with the answers kept', vis() === 'true,false,false' && p.doc.querySelector('[name="field_0"]').value === 'Ann');
  p.click(p.doc.querySelector('.cc-wz-next')); p.click(p.doc.querySelector('.cc-wz-next'));
  check('published: on the last step Send replaces Next and the bar is full', vis() === 'false,false,true' && p.doc.querySelector('.cc-wz-submit').hidden === false && p.doc.querySelector('.cc-wz-next').hidden === true && parseFloat(p.doc.querySelector('.cc-wz-fill').style.width) === 100);
  const ev1 = new p.win.Event('submit', { bubbles: true, cancelable: true }); p.doc.querySelector('form').dispatchEvent(ev1);
  check('published: sending is refused while the agreement box is not ticked', ev1.defaultPrevented === true);
  p.doc.querySelector('[name="field_6"]').checked = true;
  const ev2 = new p.win.Event('submit', { bubbles: true, cancelable: true }); p.doc.querySelector('form').dispatchEvent(ev2);
  check('published: with everything valid the form is sent normally (not prevented)', ev2.defaultPrevented === false);
  const q = mk();
  const qvis = () => [...q.doc.querySelectorAll('.cc-wz-step')].map((e) => !e.hidden).join();
  q.doc.querySelector('[name="field_0"]').value = 'Ann'; q.doc.querySelector('[name="field_1"]').value = 'a@b.co';
  const ev3 = new q.win.Event('submit', { bubbles: true, cancelable: true }); q.doc.querySelector('form').dispatchEvent(ev3);
  check('published: pressing Enter in the middle of the form moves on instead of sending it', ev3.defaultPrevented === true && qvis() === 'false,true,false');
  const r2 = mk(); r2.doc.querySelector('[name="field_0"]').value = 'Ann'; r2.doc.querySelector('[name="field_1"]').value = 'a@b.co';
  r2.click(r2.doc.querySelector('.cc-wz-next')); r2.doc.querySelector('input[name="field_2"][value="A"]').checked = true; r2.doc.querySelector('input[name="field_4[]"]').checked = true; r2.click(r2.doc.querySelector('.cc-wz-next'));
  r2.doc.querySelector('input[name="field_2"][value="A"]').checked = false;   // an earlier answer gets lost somehow
  const ev4 = new r2.win.Event('submit', { bubbles: true, cancelable: true }); r2.doc.querySelector('form').dispatchEvent(ev4);
  check('published: sending checks every step and returns to the first one that is not valid', ev4.defaultPrevented === true && [...r2.doc.querySelectorAll('.cc-wz-step')].map((e) => !e.hidden).join() === 'false,true,false');
  const single = pub(php('WIZARD', { steps: [{ title: 'Only', fields: [{ label: 'A', type: 'text' }] }] }));
  check('published: a single step is just a form (no Next, no progress)', single.doc.querySelector('.cc-wz-next').hidden === true && single.doc.querySelector('.cc-wz-progress').hidden === true && single.doc.querySelector('.cc-wz-submit').hidden === false);
  const dots = pub(php('WIZARD', { ...wiz, progress: 'steps' }));
  dots.doc.querySelector('[name="field_0"]').value = 'A'; dots.doc.querySelector('[name="field_1"]').value = 'a@b.co'; dots.click(dots.doc.querySelector('.cc-wz-next'));
  check('published: numbered steps mark the finished and the current one (aria-current)', [...dots.doc.querySelectorAll('.cc-wz-dot')].map((e) => /is-done/.test(e.className) ? 'done' : /is-current/.test(e.className) ? 'current' : 'todo').join() === 'done,current,todo' && dots.doc.querySelectorAll('.cc-wz-dot[aria-current="step"]').length === 1);
}

// =============================================================== VIDEO_HERO
section('VIDEO_HERO');
{
  const vh = { video: '/uploads/a.mp4', video2: 'https://cdn.example.com/a.webm?x=1#t', poster: '/uploads/p.jpg', title: 'Hello', subtitle: 'a\nb', height: 700, overlayOpacity: 30,
    buttons: [{ text: 'Go', url: 'contatti/index.html', style: 'primary' }, { text: 'More', url: 'https://example.com', style: 'secondary' }, { text: 'Third', url: 'x' }] };
  const h = php('VIDEO_HERO', vh); const d = $(h);
  check('one <source> per video address, with the type its extension says (a query string or #fragment does not hide it)', d('video source').map((_, e) => d(e).attr('src') + ' ' + d(e).attr('type')).get().join('|') === '/uploads/a.mp4 video/mp4|https://cdn.example.com/a.webm?x=1#t video/webm');
  check('the video is muted, loops, plays inline, is decorative for screen readers and loads nothing until the script starts it (preload none, no autoplay attribute)', d('video').attr('muted') !== undefined && d('video').attr('loop') !== undefined && d('video').attr('playsinline') !== undefined && d('video').attr('aria-hidden') === 'true' && d('video').attr('preload') === 'none' && d('video').attr('autoplay') === undefined && d('video').attr('poster') === '/uploads/p.jpg');
  check('the poster is also a layer behind everything, so it shows where the video is not loaded (phones, reduced motion, no script)', /background-image:url\('\/uploads\/p\.jpg'\)/.test(d('.cc-vh-poster').attr('style')));
  check('the headline, subtitle with line breaks, and at most two buttons (internal link resolved)', d('h2.cc-vh-title').text() === 'Hello' && d('.cc-vh-subtitle').html() === 'a<br>b' && d('.cc-vh-btn').length === 2 && d('.cc-vh-btn-primary').attr('href') === '{{BASE_URL}}contatti/' && d('.cc-vh-btn-secondary').attr('href') === 'https://example.com');
  check('the pause / play icons are SVG, which ignores the hidden attribute: the one not shown starts with display:none (in PHP and in the editor\'s renderer)', [php, js].every((fn) => { const q = $(fn('VIDEO_HERO', vh)); return q('.cc-vh-i-pause').attr('style') === undefined && q('.cc-vh-i-play').attr('style') === 'display:none' && q('.cc-vh-i-play').attr('hidden') === undefined; }));
  check('the pause button exists but stays hidden until the script runs; it is left out with "no pause button" and with no video', d('.cc-vh-toggle').attr('hidden') !== undefined && $(php('VIDEO_HERO', { ...vh, showPause: false }))('.cc-vh-toggle').length === 0 && $(php('VIDEO_HERO', { poster: 'p.jpg' }))('.cc-vh-toggle').length === 0);
  check('height and overlay strength are applied and clamped', /min-height:700px/.test(h) && /opacity:0\.3;/.test(h) && /min-height:1000px/.test(php('VIDEO_HERO', { height: 99999 })) && /min-height:280px/.test(php('VIDEO_HERO', { height: 5 })) && /opacity:0\.9;/.test(php('VIDEO_HERO', { overlayOpacity: 500 })));
  const bad = php('VIDEO_HERO', { video: 'javascript:alert(1)', video2: 'data:text/html,x', poster: 'javascript:alert(2)', overlay: 'red;}', textColor: 'url(x)', title: '<img src=x onerror=a>', subtitle: { o: 1 }, buttons: ['junk', null, { text: '', url: 'a' }, { text: '<b>x</b>', url: 'javascript:alert(3)' }] });
  const bd = $(bad);
  check('hostile values: no <video> from javascript: or data: addresses, no javascript: poster or link, text escaped, unsafe colors replaced', bd('video').length === 0 && !/javascript:alert\((1|2)\)/.test(bad) && !/href="javascript:/i.test(bad) && !/<img src=x|<b>x/.test(bad) && !/red;\}|url\(x\)/.test(bad) && !/data:text/.test(bad));
  check('with no video there is no script and no pause button; with one there is exactly one script', !/<script/.test(bad) && [...h.matchAll(/<script>/g)].length === 1);
  const same = ['/uploads/a.mp4', 'https://x.example/a.webm?y=1', 'javascript:alert(1)', '  data:text/html,x  ', 'noextension', 'a.MP4', '//cdn.example.com/v.mp4', 'jav\tascript:alert(1)', '/uploads/video.ogv'];
  check('PHP and the editor\'s renderer accept and refuse exactly the same video addresses, with the same types', same.every((u) => { const f = (fn) => $(fn('VIDEO_HERO', { video: u }))('source').map((_, e) => $(fn('VIDEO_HERO', { video: u }))(e).attr('src') + '|' + $(fn('VIDEO_HERO', { video: u }))(e).attr('type')).get().join(); return f(php) === f(js); }), same.map((u) => $(php('VIDEO_HERO', { video: u }))('source').length).join());

  // the published script
  const mk = (extra = {}, opts = {}) => pub(php('VIDEO_HERO', { ...vh, ...extra }), opts);
  const label = (q) => q.doc.querySelector('.cc-vh-toggle').getAttribute('aria-label');
  const a1 = mk();
  check('published: the video is started (muted autoplay needs a script), its preload is raised, and the button appears showing "pause"', a1.calls.played === 1 && a1.doc.querySelector('video').preload === 'auto' && a1.doc.querySelector('.cc-vh-toggle').hidden === false && label(a1) === 'Pause the background video' && a1.doc.querySelector('.cc-vh-i-pause').style.display !== 'none' && a1.doc.querySelector('.cc-vh-i-play').style.display === 'none');
  a1.click(a1.doc.querySelector('.cc-vh-toggle'));
  check('published: the button pauses it (label and icon switch)…', a1.calls.paused === 1 && label(a1) === 'Play the background video' && a1.doc.querySelector('.cc-vh-i-play').style.display !== 'none' && a1.doc.querySelector('.cc-vh-i-pause').style.display === 'none');
  a1.click(a1.doc.querySelector('.cc-vh-toggle'));
  check('published: …and starts it again', a1.calls.played === 2 && label(a1) === 'Pause the background video');
  const r1 = mk({}, { reduced: true });
  check('published: for visitors who prefer reduced motion the video is NOT started (poster only), and the button offers to play it', r1.calls.played === 0 && r1.doc.querySelector('video').preload === 'none' && r1.doc.querySelector('.cc-vh-toggle').hidden === false && label(r1) === 'Play the background video');
  r1.click(r1.doc.querySelector('.cc-vh-toggle'));
  check('published: …and pressing it plays the video', r1.calls.played === 1 && label(r1) === 'Pause the background video');
  const m1 = mk({}, { mobile: true });
  check('published: on a phone the poster stays (nothing is loaded, no button) unless the author chose video there', m1.calls.played === 0 && m1.doc.querySelector('video').preload === 'none' && m1.doc.querySelector('.cc-vh-toggle').hidden === true);
  const m2 = mk({ mobileVideo: true }, { mobile: true });
  check('published: with "also on phones" the video plays there too', m2.calls.played === 1 && m2.doc.querySelector('.cc-vh-toggle').hidden === false);
  const blocked = mk({}, { playRejects: true });
  check('published: if the browser refuses to autoplay, nothing breaks: the poster stays and the button offers play', blocked.calls.played === 1 && label(blocked) === 'Play the background video');
}

// =============================================================== AUDIO_PLAYER
section('AUDIO_PLAYER');
{
  const au = { src: '/uploads/a.mp3', title: 'Episode 1', artist: 'The Show', cover: '/uploads/c.jpg' };
  const h = php('AUDIO_PLAYER', au); const d = $(h);
  check('a real <audio> element with the file, not loaded until played (preload none) and with the browser\'s own controls (used when the script does not run)', d('audio.cc-au-el').attr('src') === '/uploads/a.mp3' && d('audio').attr('controls') !== undefined && d('audio').attr('preload') === 'none');
  check('title, artist and cover are shown whatever the script does (cover is decorative)', d('.cc-au-title').text() === 'Episode 1' && d('.cc-au-artist').text() === 'The Show' && d('.cc-au-cover').attr('alt') === '' && d('.cc-au-cover').attr('src') === '/uploads/c.jpg');
  check('the play / pause icons are SVG, which ignores the hidden attribute: the pause icon starts with display:none (in PHP and in the editor\'s renderer)', [php, js].every((fn) => { const q = $(fn('AUDIO_PLAYER', au)); return q('.cc-au-i-play').attr('style') === undefined && q('.cc-au-i-pause').attr('style') === 'display:none' && q('.cc-au-i-pause').attr('hidden') === undefined; }));
  check('the custom player is hidden until the script runs, and made of real buttons with names and a labelled seek bar', d('.cc-au-ui').attr('hidden') !== undefined && d('button.cc-au-play').attr('aria-label') === 'Play' && d('input.cc-au-seek').attr('aria-label') === 'Seek' && d('.cc-au-back').attr('aria-label') === 'Back 15 seconds' && d('.cc-au-fwd').attr('aria-label') === 'Forward 15 seconds' && d('.cc-au-speed').attr('aria-label') === 'Playback speed');
  check('the skip and speed buttons can be left out; no title/artist/cover means no heading row', $(php('AUDIO_PLAYER', { ...au, skip: false, speed: false }))('.cc-au-back, .cc-au-fwd, .cc-au-speed').length === 0 && $(php('AUDIO_PLAYER', { src: 'a.mp3' }))('.cc-au-head').length === 0);
  const bad = php('AUDIO_PLAYER', { src: 'javascript:alert(1)', title: '<b>x</b>', artist: ['a'], cover: 'javascript:alert(2)', accent: 'red;}' });
  check('hostile values: no javascript: file or cover, text escaped, unsafe color replaced', $(bad)('audio').attr('src') === undefined && !/javascript:alert/.test(bad) && !/<b>x/.test(bad) && !/red;\}/.test(bad));
  check('PHP and the editor\'s renderer write the same title, artist, buttons and addresses', [au, { ...au, skip: false }, { src: 'javascript:x', title: 'T' }, {}].every((v) => { const t = (fn) => { const q = $(fn('AUDIO_PLAYER', v)); return q('audio').attr('src') + '|' + q('.cc-au-title').text() + '|' + q('.cc-au-artist').text() + '|' + q('button').map((_, e) => q(e).attr('class') + q(e).attr('aria-label')).get().join(); }; return t(php) === t(js); }));

  const p = pub(h);
  const el = p.doc.querySelector('.cc-au-el'); const q = (c) => p.doc.querySelector(c);
  check('published: the custom player replaces the browser\'s controls', !el.hasAttribute('controls') && q('.cc-au-ui').hidden === false);
  el.__d = 200; el.dispatchEvent(new p.win.Event('loadedmetadata'));
  check('published: the length is shown as minutes:seconds and sets the seek bar', q('.cc-au-dur').textContent === '3:20' && q('.cc-au-seek').max === '200' && q('.cc-au-seek').getAttribute('aria-valuetext') === '0:00 of 3:20');
  p.click(q('.cc-au-play'));
  check('published: Play starts the audio and the button becomes Pause', p.calls.played === 1 && q('.cc-au-play').getAttribute('aria-label') === 'Pause' && q('.cc-au-i-pause').style.display !== 'none' && q('.cc-au-i-play').style.display === 'none');
  el.currentTime = 65; el.dispatchEvent(new p.win.Event('timeupdate'));
  check('published: the position follows the audio (1:05 of 3:20), also for screen readers', q('.cc-au-cur').textContent === '1:05' && q('.cc-au-seek').value === '65' && q('.cc-au-seek').getAttribute('aria-valuetext') === '1:05 of 3:20');
  el.__d = 3725; el.dispatchEvent(new p.win.Event('durationchange'));
  check('published: a long file shows hours (1:02:05)', q('.cc-au-dur').textContent === '1:02:05');
  el.__d = 200; el.dispatchEvent(new p.win.Event('durationchange'));
  p.click(q('.cc-au-back'));
  check('published: back 15 seconds', el.currentTime === 50);
  el.currentTime = 5; p.click(q('.cc-au-back'));
  check('published: back never goes before the start', el.currentTime === 0);
  el.currentTime = 195; p.click(q('.cc-au-fwd'));
  check('published: forward never goes past the end', el.currentTime === 200);
  const sp = []; for (let i = 0; i < 5; i++) { p.click(q('.cc-au-speed')); sp.push(q('.cc-au-speed').textContent + el.playbackRate); }
  check('published: the speed button cycles 1.25×, 1.5×, 2×, 0.75× and back to 1×', sp.join(' ') === '1.25×1.25 1.5×1.5 2×2 0.75×0.75 1×1', sp.join(' '));
  q('.cc-au-seek').value = '120'; q('.cc-au-seek').dispatchEvent(new p.win.Event('input', { bubbles: true }));
  check('published: dragging the seek bar moves the audio', el.currentTime === 120 && q('.cc-au-cur').textContent === '2:00');
  p.click(q('.cc-au-play'));
  check('published: Pause pauses', p.calls.paused === 1 && q('.cc-au-play').getAttribute('aria-label') === 'Play');
  const two = pub(php('AUDIO_PLAYER', { ...au, src: '/uploads/1.mp3' }).replace('id="tb"', 'id="tb"') + php('AUDIO_PLAYER', au).replace(/tb/g, 'tc'));
  const [e1, e2] = two.doc.querySelectorAll('.cc-au-el');
  two.click(two.doc.querySelector('#tb .cc-au-play')); two.click(two.doc.querySelector('#tc .cc-au-play'));
  check('published: starting one player pauses the other (never two at once)', e1.paused === true && e2.paused === false);
  const rej = pub(h, { playRejects: true }); rej.click(rej.doc.querySelector('.cc-au-play'));
  check('published: a refused play() breaks nothing (the button stays on Play)', rej.doc.querySelector('.cc-au-play').getAttribute('aria-label') === 'Play');
}

// =============================================================== ANNOUNCEMENT_BAR
section('ANNOUNCEMENT_BAR');
const phpCall = (code) => execFileSync('php', ['-r', `require ${JSON.stringify(fileURLToPath(new URL('../../canvascore-admin/compiler.php', import.meta.url)))}; ${code}`]).toString();
{
  const an = { text: 'Spedizione gratuita sopra 50 €', icon: '🎁', linkText: 'Scopri', linkUrl: 'offerte/index.html', preset: 'promo', sticky: true };
  const h = php('ANNOUNCEMENT_BAR', an); const d = $(h);
  check('a labelled region with the message, an emoji icon (hidden from screen readers) and a link to the internal page', d('.cc-announce').attr('role') === 'region' && d('.cc-announce').attr('aria-label') === 'Announcement' && d('.cc-ann-text').text() === 'Spedizione gratuita sopra 50 €' && d('.cc-ann-icon').attr('aria-hidden') === 'true' && d('.cc-ann-icon').text() === '🎁' && d('.cc-ann-link').attr('href') === '{{BASE_URL}}offerte/' && d('.cc-ann-link').text() === 'Scopri →');
  check('the close button exists but stays hidden until the script runs (the message itself is visible without any script)', d('.cc-ann-close').attr('hidden') !== undefined && d('.cc-announce').attr('hidden') === undefined && d('.cc-ann-close').attr('aria-label') === 'Dismiss the announcement' && $(php('ANNOUNCEMENT_BAR', { text: 'x', dismissible: false }))('.cc-ann-close').length === 0);
  check('sticky pins it to the top of the screen (below the menu\'s own layer, so open menus show over it); the presets and custom colors', /position:sticky; top:0; z-index:9000/.test(h) && /background:var\(--brand-color, #3b82f6\); color:#ffffff/.test(h) && /background:#fef3c7; color:#78350f/.test(php('ANNOUNCEMENT_BAR', { text: 'x', preset: 'warning' })) && /background:#123456; color:#abcdef/.test(php('ANNOUNCEMENT_BAR', { text: 'x', bg: '#123456', color: '#abcdef' })) && !/position:sticky/.test(php('ANNOUNCEMENT_BAR', { text: 'x' })));
  const bad = php('ANNOUNCEMENT_BAR', { text: '<img src=x onerror=a>', icon: '12345678', linkText: 'L', linkUrl: 'javascript:alert(1)', preset: 'evil', bg: 'red;}', color: 'url(x)', sticky: 'yes' });
  check('hostile values: escaped text, no javascript: link, unsafe colors replaced, unknown preset → dark, the icon is cut at 4 characters, sticky needs exactly true', !/<img src=x/.test(bad) && !/href="javascript:/i.test(bad) && !/red;\}|url\(x\)/.test(bad) && /background:#0f172a/.test(bad) && $(bad)('.cc-ann-icon').text() === '1234' && !/position:sticky/.test(bad));
  check('the block with no message still draws an (empty) bar so it can be selected and edited; the site-wide bar draws nothing', $(php('ANNOUNCEMENT_BAR', {}))('.cc-announce').length === 1 && phpCall("echo cc_announcement_html(['enabled' => true, 'text' => '   '], 'x', '', '', true);") === '' && phpCall("echo cc_announcement_html(['text' => 'Hello'], 'x', '', '', true);").includes('Hello'));
  const key = (fn, c) => $(fn('ANNOUNCEMENT_BAR', c))('.cc-announce').attr('data-key');
  const msgs = [{ text: 'Hello' }, { text: 'Spedizione gratuita sopra 50 €', linkText: 'Scopri', linkUrl: 'a/index.html' }, { text: '🎁 日本語 é ñ' }, { text: '' }];
  check('the "dismissed" key is the same in PHP and in the editor (8 hex digits), and changes when the message, link text or link changes', msgs.every((m) => /^[0-9a-f]{8}$/.test(key(php, m)) && key(php, m) === key(js, m)) && new Set([key(php, { text: 'A' }), key(php, { text: 'B' }), key(php, { text: 'A', linkText: 'x' }), key(php, { text: 'A', linkUrl: 'y' })]).size === 4 && key(php, { text: 'A', icon: '!' }) === key(php, { text: 'A' }));
  check('PHP and the editor\'s renderer write the same message, link and buttons', [an, { text: 'x', dismissible: false, align: 'left' }, {}].every((v) => { const t = (fn) => { const q = $(fn('ANNOUNCEMENT_BAR', v)); return q('.cc-ann-text').text() + '|' + q('.cc-ann-link').attr('href') + '|' + q('.cc-ann-close').length + '|' + q('.cc-ann-icon').text(); }; return t(php) === t(js); }));

  // a sticky bar and a menu pinned to the top of the screen (position: fixed): the bar stays UNDER the menu, never over it
  const withMenu = async (menuStyle, bottom, bar = { text: 'x', sticky: true }) => {
    const q = pub(`<nav class="cc-navigation" style="${menuStyle}"></nav>` + php('ANNOUNCEMENT_BAR', bar));
    const nav = q.doc.querySelector('.cc-navigation');
    const state = { bottom };
    nav.getBoundingClientRect = () => ({ bottom: state.bottom });
    await settle();
    return { q, state, bar: q.doc.querySelector('.cc-announce'), nav };
  };
  const fixedMenu = await withMenu('position:fixed; top:0; z-index:9999', 70);
  check('published: under a menu pinned to the top the bar sticks at the menu\'s bottom edge (70px), not over it', fixedMenu.bar.style.top === '70px', fixedMenu.bar.style.top);
  fixedMenu.state.bottom = 52; fixedMenu.q.win.dispatchEvent(new fixedMenu.q.win.Event('scroll'));
  check('published: …following the menu when it shrinks while scrolling', fixedMenu.bar.style.top === '52px');
  fixedMenu.state.bottom = -3; fixedMenu.q.win.dispatchEvent(new fixedMenu.q.win.Event('scroll'));
  check('published: …and going up to the top when the menu slides out of sight (never a negative distance)', fixedMenu.bar.style.top === '0px');
  const flowMenu = await withMenu('position:relative', 70);
  check('published: a menu that is not pinned needs nothing: the bar sticks to the top of the screen', flowMenu.bar.style.top === '0px');
  const noMenu = pub(php('ANNOUNCEMENT_BAR', { text: 'x', sticky: true }));
  await settle();
  check('published: with no menu at all the bar sticks to the top', noMenu.doc.querySelector('.cc-announce').style.top === '0px');
  const plainBar = await withMenu('position:fixed; top:0', 70, { text: 'x' });
  check('published: a bar that is not sticky is left alone (it scrolls away with the page)', plainBar.bar.style.top === '');

  const p = pub(h); const root = p.doc.querySelector('.cc-announce');
  check('published: the close button appears; the bar is shown', root.hidden === false && root.querySelector('.cc-ann-close').hidden === false);
  p.click(root.querySelector('.cc-ann-close'));
  check('published: dismissing hides it and remembers that for this message', root.hidden === true && p.win.localStorage.getItem('cc_ann_' + root.getAttribute('data-key')) === '1');
  const again = pub(h, { storage: { ['cc_ann_' + $(h)('.cc-announce').attr('data-key')]: '1' } });
  check('published: on the next page the dismissed bar stays hidden', again.doc.querySelector('.cc-announce').hidden === true);
  const changed = pub(php('ANNOUNCEMENT_BAR', { ...an, text: 'A new offer' }), { storage: { ['cc_ann_' + $(h)('.cc-announce').attr('data-key')]: '1' } });
  check('published: a changed message comes back for visitors who dismissed the old one', changed.doc.querySelector('.cc-announce').hidden === false);
  const blocked = pub(h, { storageBlocked: true });
  blocked.click(blocked.doc.querySelector('.cc-ann-close'));
  check('published: where the browser blocks storage, it is simply shown again on the next page, and dismissing still works now', blocked.doc.querySelector('.cc-announce').hidden === true);
}

// =============================================================== NEWSLETTER
section('NEWSLETTER');
{
  const nl = { title: 'Join', text: 'Monthly news', placeholder: 'Your email', emailLabel: 'E-mail', askName: true, nameLabel: 'Nome', consentText: 'I agree <3', buttonText: 'Subscribe now', successMsg: 'Thanks!', email: 'owner@corp.example' };
  const out = phpReg('NEWSLETTER', nl, 'nl-1'); const h = out.html; const d = $(h);
  check('it posts to the same endpoint as the Form block, with its hidden fields and honeypot, and the message', d('form').attr('action') === '{{BASE_URL}}canvascore-admin/submit_form.php' && d('form').attr('method') === 'POST' && d('input[name="_form"]').attr('value') === d('form').attr('id') && d('input[name="_hp"]').length === 1 && d('input[name="_success"]').attr('value') === 'Thanks!');
  check('fields are numbered in order (name, email, agreement) with their labels, for the form endpoint', d('input[name^="_label_field_"]').map((_, e) => d(e).attr('name') + '=' + d(e).attr('value')).get().join() === '_label_field_0=Nome,_label_field_1=E-mail,_label_field_2=I agree <3');
  check('the registry holds the same labels in the same order, the recipient, the message, the kind and the field positions', JSON.stringify(out.registry[d('form').attr('id')]) === JSON.stringify({ to: 'owner@corp.example', labels: ['Nome', 'E-mail', 'I agree <3'], success: 'Thanks!', type: 'newsletter', meta: { name: 0, email: 1, consent: 2 } }), JSON.stringify(out.registry));
  check('the recipient never appears in the page', !/owner@corp\.example/.test(h));
  check('the email field is a required email input named for screen readers, the name field required text, the agreement a required checkbox', d('input[type="email"][name="field_1"]').attr('required') !== undefined && d('input[name="field_1"]').attr('aria-label') === 'E-mail' && d('input[name="field_1"]').attr('placeholder') === 'Your email' && d('input[type="text"][name="field_0"]').attr('required') !== undefined && d('input[type="checkbox"][name="field_2"]').attr('required') !== undefined && d('input[name="field_2"]').attr('value') === 'Yes' && d('.cc-nl-consent span').text() === 'I agree <3');
  const plain = phpReg('NEWSLETTER', {}, 'nl-2');
  check('by default: only an email field and the button; the registry has just "Email"', $(plain.html)('input[name^="field_"]').length === 1 && $(plain.html)('.cc-nl-submit').text() === 'Subscribe' && JSON.stringify(Object.values(plain.registry)[0].labels) === '["Email"]' && $(plain.html)('.cc-nl-consent').length === 0);
  const order = (layout) => { const q = $(php('NEWSLETTER', { ...nl, formLayout: layout })); return q('form').children().toArray().map((e) => (q(e).hasClass('cc-nl-submit') ? 'button' : q(e).hasClass('cc-nl-consent') ? 'consent' : '')).filter(Boolean).join(); };
  check('in a row the agreement sits below the button; stacked, it comes before the button', order('inline') === 'button,consent' && order('stacked') === 'consent,button');
  const id1 = d('form').attr('id'), id2 = $(phpReg('NEWSLETTER', nl, 'nl-3').html)('form').attr('id');
  check('every newsletter has its own form id (so its sign-ups are told apart); a custom id is cleaned', id1 !== id2 && /^f_[a-f0-9]{16}$/.test(id1) && $(php('NEWSLETTER', { customId: 'My Form!' }))('form').attr('id') === 'f_MyForm');
  const bad = phpReg('NEWSLETTER', { title: '<b>x</b>', text: { o: 1 }, placeholder: '"><script>x</script>', emailLabel: '"><b>', consentText: '<i>c</i>', buttonText: '<u>b</u>', successMsg: '"><x>', accent: 'red;}' }, 'nl-4');
  check('hostile values: escaped everywhere (labels, hint, button, message), unsafe color replaced', !/<b>x|"><script>|"><b>|<i>c|<u>b|"><x>/.test(bad.html) && !/red;\}/.test(bad.html) && $(bad.html)('input[name="_success"]').attr('value') === '"><x>');
  const texts = (html) => { const q = $(html); return ['.cc-nl-title', '.cc-nl-text', 'button', '.cc-nl-consent span'].map((sel) => q(sel).map((_, e) => q(e).text()).get().join('|')).join(' # ') + ' # ' + q('input').map((_, e) => (q(e).attr('type') || '') + (q(e).attr('placeholder') || '') + (q(e).attr('aria-label') || '')).get().join(); };
  check('PHP and the editor\'s renderer write the same texts, labels and fields', [nl, {}, { ...nl, formLayout: 'stacked', askName: false }].every((v) => texts(php('NEWSLETTER', v)) === texts(js('NEWSLETTER', v))));
}

// =============================================================== hidden elements stay hidden
section('The hidden attribute is not overridden by an inline display');
{
  // An element with its own inline "display" (flex, inline-flex…) ignores the hidden attribute: a "hidden" pause button
  // or an unticked add-on's line would show. Every block that has such an element carries a rule that restores it.
  const defs = JSON.parse(readFileSync(new URL('../../canvascore-admin/blocks.json', import.meta.url), 'utf-8'));
  const more = { SHARE_BAR: { networks: ['facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'email', 'copy', 'print', 'share'] } };
  const bad = [];
  for (const [type, def] of Object.entries(defs.types)) {
    if (def.children) continue;
    for (const [name, fn] of [['PHP', php], ['editor', js]]) {
      const html = fn(type, { ...(def.content || {}), ...(more[type] || {}) }, def.styles || {});
      const q = $(html);
      const offenders = q('[hidden]').toArray().filter((e) => /(^|;|\s)display\s*:/.test(q(e).attr('style') || ''));
      if (offenders.length && !/\[hidden\]\{display:none !important\}/.test(html)) bad.push(`${type} (${name}): ${offenders.length}`);
    }
  }
  check('no block has a hidden element with its own display unless the block restores [hidden]', bad.length === 0, bad.join(', '));
  check('the blocks that need it do carry the rule (Video Hero, Price Calculator, Share Bar), in PHP and in the editor\'s renderer', ['VIDEO_HERO', 'PRICE_CALCULATOR', 'SHARE_BAR'].every((t) => [php, js].every((fn) => /\[hidden\]\{display:none !important\}/.test(fn(t, { ...defs.types[t].content, ...(more[t] || {}), video: '/a.mp4' }, defs.types[t].styles)))));
  const calc = $(php('PRICE_CALCULATOR', defs.types.PRICE_CALCULATOR.content));
  check('a Price Calculator line that is hidden (an unticked add-on) is really hidden: it has the attribute AND the block restores it', calc('li.cc-calc-line[hidden]').length >= 1 && /#tb\[hidden\],#tb \[hidden\]\{display:none !important\}/.test(php('PRICE_CALCULATOR', defs.types.PRICE_CALCULATOR.content)));
}

// =============================================================== LOGOS strip: logos repeat to cover the strip
section('LOGOS strip fill (published script and editor canvas)');
{
  // jsdom has no layout: every logo is 60px wide (+ the 40px gap = 100px), the strip is `box` px wide
  const stripPage = (html, { box = 1000, reduced = false, loaded = true, io = false } = {}) => {
    const ros = []; const ios = [];
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      runScripts: 'dangerously',
      beforeParse(win) {
        win.matchMedia = () => ({ matches: reduced });
        win.ResizeObserver = class { constructor(cb) { this.cb = cb; ros.push(this); } observe() {} disconnect() {} };
        if (io) win.IntersectionObserver = class { constructor(cb, o) { this.cb = cb; this.o = o; ios.push(this); } observe() {} disconnect() { this.off = true; } };
        const rect = win.HTMLElement.prototype.getBoundingClientRect;
        win.HTMLElement.prototype.getBoundingClientRect = function () { return this.classList.contains('cc-logo-item') ? { width: win.__w, height: 48, left: 0, right: win.__w, top: 0, bottom: 48 } : rect.call(this); };
        win.__w = 60;
        Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return this.classList.contains('cc-logos-marquee') ? win.__box : 0; } });
        Object.defineProperty(win.HTMLImageElement.prototype, 'complete', { get() { return win.__loaded; } });   // jsdom never loads images
        win.__box = box; win.__loaded = loaded;
      },
    });
    return { win: dom.window, doc: dom.window.document, ros, ios };
  };
  const logos = [{ src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'A', href: 'https://a.example' }, { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'B' }];
  const content = { layout: 'marquee', speed: 30, logos };
  const sets = (doc) => [...doc.querySelectorAll('.cc-logos-set')];

  const p = stripPage(php('LOGOS', content));
  const [s1, s2] = sets(p.doc);
  check('published: 2 logos in a 1000px strip are repeated until a set covers it (10 per set)', s1.children.length === 10 && s2.children.length === 10, `${s1.children.length}/${s2.children.length}`);
  check('…the loop time grows with the copies, so the speed stays the same (30s × 5 = 150s)', p.doc.querySelector('.cc-logos-track').style.animationDuration === '150s', p.doc.querySelector('.cc-logos-track').style.animationDuration);
  const copies = [...s1.querySelectorAll('.cc-logo-fill')];
  check('…the copies are hidden from screen readers and the keyboard, with empty alt text', copies.length === 8 && copies.every((c) => c.getAttribute('aria-hidden') === 'true' && c.querySelector('img').getAttribute('alt') === '') && copies.filter((c) => c.tagName === 'A').every((c) => c.getAttribute('tabindex') === '-1'));
  check('…copies load their image at once (not lazily), so they never pop in while moving', copies.every((c) => !c.querySelector('img').hasAttribute('loading')));
  const near = stripPage(php('LOGOS', content), { io: true });
  const lazyCount = (d) => d.querySelectorAll('.cc-logos-track img[loading="lazy"]').length;
  const lazyBefore = lazyCount(near.doc);
  near.ios[0].cb([{ isIntersecting: true }]);
  check('…the strip\'s logos stay lazy until it comes within 200px of the view, then all load at once (both sets)', lazyBefore === 4 && lazyCount(near.doc) === 0 && near.ios[0].o.rootMargin === '200px' && near.ios[0].off === true, `${lazyBefore} → ${lazyCount(near.doc)}`);
  check('…the original logos keep their alt text and order', s1.children[0].querySelector('img').getAttribute('alt') === 'A' && s1.children[1].querySelector('img').getAttribute('alt') === 'B');
  p.win.__box = 1500; p.ros[0].cb();
  check('…when the strip gets wider, more copies are added', sets(p.doc)[0].children.length === 16 && p.doc.querySelector('.cc-logos-track').style.animationDuration === '240s');
  p.win.__box = 300; p.ros[0].cb();
  check('…and when it gets narrower the extra copies are removed from both sets, with the speed adjusted', sets(p.doc)[0].children.length === 4 && sets(p.doc)[1].children.length === 4 && p.doc.querySelector('.cc-logos-track').style.animationDuration === '60s' && sets(p.doc)[0].children[0].querySelector('img').getAttribute('alt') === 'A');

  const slow = stripPage(php('LOGOS', content), { loaded: false });
  check('published: while the logos are still loading nothing is added (their width is unknown)', sets(slow.doc)[0].children.length === 2);
  slow.win.__loaded = true; slow.doc.querySelector('.cc-logos-set img').dispatchEvent(new slow.win.Event('load'));
  check('…and the strip is filled as soon as they have loaded', sets(slow.doc)[0].children.length === 10);
  // measured too early (logos without their size yet: groups look 80px wide → 13 copies), corrected when they load
  const early = stripPage(php('LOGOS', content), { loaded: true }, 0);
  early.win.__w = 0; early.ros[0].cb();
  const tooMany = sets(early.doc)[0].children.length;
  early.win.__w = 60; early.doc.querySelector('.cc-logos-set img').dispatchEvent(new early.win.Event('load'));
  check('published: copies added before the logos had their size are removed once they load (no slow crawl)', tooMany === 26 && sets(early.doc)[0].children.length === 10 && sets(early.doc)[1].children.length === 10 && early.doc.querySelector('.cc-logos-track').style.animationDuration === '150s', `${tooMany} → ${sets(early.doc)[0].children.length}`);

  const wide = stripPage(php('LOGOS', content), { box: 150 });
  check('published: logos that already cover the strip are not repeated', sets(wide.doc)[0].children.length === 2 && wide.doc.querySelector('.cc-logos-track').style.animationDuration === '30s');
  const still = stripPage(php('LOGOS', content), { reduced: true });
  check('published: nothing is added for visitors who prefer reduced motion', sets(still.doc)[0].children.length === 2);
  check('published: the grid layout has no script', !/<script/.test(php('LOGOS', { ...content, layout: 'grid' })));
  check('the moving track never widens the page, a row or the editor (the strip box has contain:inline-size)', /class="cc-logos-marquee" style="overflow:hidden; contain:inline-size;"/.test(php('LOGOS', content)) && /class="cc-logos-marquee" style="overflow:hidden; contain:inline-size;"/.test(js('LOGOS', content)));
  check('the editor\'s layout column can\'t grow wider than the screen (kit.css: minmax(0, 1fr))', /\.cc-editor \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(readFileSync(new URL('../src/ui/kit.css', import.meta.url), 'utf-8')));
  check('published: a strip without logos has no script', !/<script/.test(php('LOGOS', { ...content, logos: [] })));
  check('published: the speed in the script is the clamped number from the block', /var dur=120,/.test(php('LOGOS', { ...content, speed: '9999' })) && /var dur=30,/.test(php('LOGOS', { ...content, speed: 'x;alert(1)' })));

  // the editor canvas: renderBlock (no script) + fillLogosMarquee()
  const c = stripPage(js('LOGOS', content));
  const stop = fillLogosMarquee(c.doc.querySelector('.cc-logos'), 30);
  check('canvas: same result as the published page (10 per set, 150s)', sets(c.doc)[0].children.length === 10 && sets(c.doc)[1].children.length === 10 && c.doc.querySelector('.cc-logos-track').style.animationDuration === '150s');
  stop();
  fillLogosMarquee(c.doc.querySelector('.cc-logos'), 30);
  check('canvas: running again over a filled strip keeps the speed (copies are not counted as originals)', sets(c.doc)[0].children.length === 10 && c.doc.querySelector('.cc-logos-track').style.animationDuration === '150s', c.doc.querySelector('.cc-logos-track').style.animationDuration);
  check('canvas: speed values are read like the compiler does', marqueeSpeed('45') === 45 && marqueeSpeed(5) === 10 && marqueeSpeed(500) === 120 && marqueeSpeed('abc') === 30 && marqueeSpeed('') === 30 && marqueeSpeed(null) === 30);
}

// =============================================================== REVIEW_SUMMARY
section('REVIEW_SUMMARY');
{
  const dist = [{ stars: 5, count: 75 }, { stars: 4, count: 20 }, { stars: 3, count: 5 }, { stars: 2, count: 0 }, { stars: 1, count: 0 }];
  const d = $(php('REVIEW_SUMMARY', { title: 'Rating', average: 4.76, total: 1280, totalLabel: 'reviews', source: 'Google', distribution: dist }));
  check('average with one decimal, total with thousands separator, label and source', d('.cc-rs-average').text() === '4.8' && d('.cc-rs-total').text() === '1,280 reviews' && d('.cc-rs-source').text() === 'Google');
  check('stars: an accessible label and a fill proportional to the average (4.76/5 = 95.2%)', d('.cc-rs-stars').attr('role') === 'img' && d('.cc-rs-stars').attr('aria-label') === '4.8 out of 5 stars' && /width:95\.2%/.test(d('.cc-rs-stars-fill').attr('style')));
  check('one bar per row, widths are each row\'s share of all reviews', d('.cc-rs-row').length === 5 && /width:75\.0%/.test(d('.cc-rs-bar-fill').eq(0).attr('style')) && /width:0\.0%/.test(d('.cc-rs-bar-fill').eq(4).attr('style')));
  check('percentages next to the bars by default', d('.cc-rs-row-value').map((_, e) => d(e).text()).get().join() === '75%,20%,5%,0%,0%');
  check('…or the number of reviews, or nothing', $(php('REVIEW_SUMMARY', { distribution: dist, rowValue: 'count' }))('.cc-rs-row-value').eq(0).text() === '75' && $(php('REVIEW_SUMMARY', { distribution: dist, rowValue: 'none' }))('.cc-rs-row-value').length === 0);
  check('no reviews at all: empty bars, no division by zero', /width:0\.0%/.test(php('REVIEW_SUMMARY', { distribution: [{ stars: 5, count: 0 }] })));
  const bad = php('REVIEW_SUMMARY', { average: 99, total: -5, title: '<script>x</script>', color: 'red;}', linkText: 'L', linkUrl: 'javascript:alert(1)', distribution: [{ stars: 42, count: 'x' }, 'junk'] });
  check('out-of-range values are clamped (average 5.0, total 0, stars 5) and junk rows skipped', $(bad)('.cc-rs-average').text() === '5.0' && $(bad)('.cc-rs-total').text() === '0' && $(bad)('.cc-rs-row-label').text() === '5 ★' && $(bad)('.cc-rs-row').length === 1);
  check('hostile values: escaped title, unsafe color replaced, no javascript: link', !/<script>x/.test(bad) && !/red;\}/.test(bad) && !/href="javascript:/i.test(bad));
  check('no rating markup for search engines', !/application\/ld\+json|itemprop|AggregateRating/.test(php('REVIEW_SUMMARY', { average: 4.5, total: 10, distribution: dist })));
  check('breakdown can be hidden', $(php('REVIEW_SUMMARY', { distribution: dist, showDistribution: false }))('.cc-rs-dist').length === 0);
}

// =============================================================== TESTIMONIAL_WALL
section('TESTIMONIAL_WALL');
{
  const h = php('TESTIMONIAL_WALL', { columns: 3, items: [
    { quote: 'Line one\nLine two', name: 'Laura Bianchi', role: 'Owner', avatar: 'l.jpg', rating: 4 },
    { quote: 'Short', name: 'Tom Becker', role: '', avatar: '', rating: 0 } ] });
  const d = $(h);
  check('one card per testimonial, as <figure> with <blockquote> and <figcaption>', d('figure.cc-tw-card').length === 2 && d('figure blockquote').length === 2 && d('figure figcaption').length === 2);
  check('quote keeps its line breaks; name and role shown', d('.cc-tw-quote').eq(0).html() === 'Line one<br>Line two' && d('.cc-tw-name').eq(0).text() === 'Laura Bianchi' && d('.cc-tw-role').eq(0).text() === 'Owner');
  check('rating: an accessible label, 4 filled stars and 1 empty one; 0 = no stars', d('.cc-tw-rating').length === 1 && d('.cc-tw-rating').attr('aria-label') === '4 out of 5 stars' && d('.cc-tw-rating > span').text().length === 1);
  check('photo, or initials when there is none', d('img.cc-tw-avatar').attr('src') === 'l.jpg' && d('.cc-tw-initials').text() === 'TB');
  check('masonry columns: 3 on desktop, 2 on tablets, 1 on phones', /column-count:3;/.test(h) && /max-width:768px\)\{#tb \.cc-tw-grid\{column-count:2/.test(h) && /max-width:480px\)\{#tb \.cc-tw-grid\{column-count:1/.test(h));
  check('cards never split across columns', /break-inside:avoid/.test(h));
  const bad = php('TESTIMONIAL_WALL', { columns: 9, showRatings: false, items: [{ quote: '<img src=x onerror=a>', name: '<b>n</b>', avatar: 'javascript:x', rating: 99 }, 'junk', null] });
  check('hostile values: escaped, no javascript: photo, junk items skipped, columns clamped to 4', !/<img src=x|<b>n/.test(bad) && !/javascript:/.test(bad) && $(bad)('.cc-tw-card').length === 1 && /column-count:4;/.test(bad));
  check('ratings can be hidden', $(bad)('.cc-tw-rating').length === 0);
}

// =============================================================== HOVER_GRID
section('HOVER_GRID');
{
  const h = php('HOVER_GRID', { columns: 3, effect: 'slide', items: [
    { image: 'a.jpg', alt: 'Branding work', title: 'Branding', text: 'Logos', href: 'servizi/index.html' },
    { image: 'b.jpg', alt: '', title: 'No link', text: '' } ] });
  const d = $(h);
  check('items with a link are <a> to the page, the others <div>', d('.cc-hg-item').eq(0).is('a') && d('.cc-hg-item').eq(0).attr('href') === '{{BASE_URL}}servizi/' && d('.cc-hg-item').eq(1).is('div'));
  check('image with alt text, title and text in the reveal layer', d('.cc-hg-img').eq(0).attr('alt') === 'Branding work' && d('.cc-hg-reveal').eq(0).find('.cc-hg-title').text() === 'Branding' && d('.cc-hg-reveal').eq(1).find('.cc-hg-text').length === 0);
  check('revealed on hover and on keyboard focus', /\.cc-hg-item:hover \.cc-hg-reveal,#tb \.cc-hg-item:focus-within \.cc-hg-reveal,#tb \.cc-hg-item:focus \.cc-hg-reveal\{opacity:1;transform:none\}/.test(h));
  check('always visible on touch screens (no hover)', /@media\(hover:none\)\{#tb \.cc-hg-reveal\{opacity:1 !important/.test(h));
  check('no motion for visitors who prefer reduced motion', /prefers-reduced-motion:reduce\)\{#tb \.cc-hg-reveal,#tb \.cc-hg-img\{transition:none/.test(h));
  check('effect class: slide or fade (unknown → slide)', /cc-hg-slide/.test(h) && /cc-hg-fade/.test(php('HOVER_GRID', { effect: 'fade', items: [] })) && /cc-hg-slide/.test(php('HOVER_GRID', { effect: 'boom', items: [] })));
  const bad = php('HOVER_GRID', { columns: 0, aspectRatio: '99 / 1', overlay: 'url(x)', items: [{ image: 'javascript:alert(1)', href: 'javascript:alert(2)', title: '<img src=x>' }, 'junk'] });
  check('hostile values: shape and overlay fall back to defaults, no javascript: image or link, escaped, junk skipped', /aspect-ratio:4 \/ 3/.test(bad) && /rgba\(15,23,42,0\.72\)/.test(bad) && !/src="javascript:|href="javascript:/i.test(bad) && !/<img src=x>/.test(bad) && $(bad)('.cc-hg-item').length === 1 && /repeat\(1, 1fr\)/.test(bad));
}

console.log(`\n${fails === 0 ? 'BLOCK CONTENT OK' : fails + ' checks failed'} (${total} checks)`);
process.exit(fails === 0 ? 0 : 1);
