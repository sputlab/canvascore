// tests/panels-ui.mjs
// Editor INTEGRATION tests for the 12 new blocks, with the REAL components mounted in jsdom
// (loaded through Vite in SSR mode): addBlock → PropertyPanel → field edits → store,
// and SortableBlock (canvas) for each block.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blockDefs = JSON.parse(readFileSync(path.join(PROJECT, '../canvascore-admin/blocks.json'), 'utf8'));

let fails = 0, total = 0;
const check = (name, cond, extra = '') => {
  total++;
  if (cond) console.log('  ✓ ' + name);
  else { fails++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 3000) {
  const t0 = Date.now();
  for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > timeout) return null; await sleep(20); }
}

// ---- jsdom environment as the global "window"
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/canvascore-admin/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['document', 'localStorage', 'location', 'history', 'navigator', 'getComputedStyle', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent', 'CustomEvent', 'MutationObserver', 'SVGElement', 'DocumentFragment', 'Text']) {
  if (k in w) Object.defineProperty(globalThis, k, { configurable: true, get: () => w[k] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis, writable: true });
globalThis.addEventListener = (...a) => w.addEventListener(...a);
globalThis.removeEventListener = (...a) => w.removeEventListener(...a);
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.alert = () => {}; globalThis.confirm = () => true;
globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const vite = await createServer({
  root: PROJECT, configFile: false, logLevel: 'error', appType: 'custom', clearScreen: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [react()],
  define: { __APP_VERSION__: '"test"', __APP_BUILD__: '0', __BLOCK_DEFS__: JSON.stringify(blockDefs) },
  optimizeDeps: { noDiscovery: true, include: [] },
});

const doc = w.document;
const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)];
const $ = (sel, root = doc) => root.querySelector(sel);
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
function setValue(el, value) {
  const proto = el instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype : el instanceof w.HTMLSelectElement ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  el.dispatchEvent(new w.Event(el instanceof w.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
// field tied to a label: <div><label>text</label><input/select/textarea></div>
const field = (labelText) => {
  const lab = $$('label').find((l) => l.textContent.trim().startsWith(labelText));
  return lab ? lab.parentElement.querySelector('input,select,textarea') : null;
};
const checkbox = (labelText) => { const lab = $$('label').find((l) => l.textContent.includes(labelText) && l.querySelector('input[type="checkbox"]')); return lab && lab.querySelector('input'); };
const buttonByText = (txt) => $$('button').find((b) => b.textContent.trim().includes(txt));

const { useStore } = await vite.ssrLoadModule('/src/store/useStore.js');
const PropertyPanel = (await vite.ssrLoadModule('/src/components/PropertyPanel.jsx')).default;
const SortableBlock = (await vite.ssrLoadModule('/src/components/SortableBlock.jsx')).default;
const { createRoot } = await import('react-dom/client');
const React = await import('react');
const { DndContext } = await import('@dnd-kit/core');
const { SortableContext } = await import('@dnd-kit/sortable');

let root = null;
const mount = (el) => { if (root) root.unmount(); doc.getElementById('root').innerHTML = ''; root = createRoot(doc.getElementById('root')); root.render(el); };
const st = () => useStore.getState();
const content = () => st().blocks[0].content;
function addAndSelect(type) {
  useStore.setState({ blocks: [], selectedBlockId: null, pastBlocks: [], futureBlocks: [], activePage: { id: 'p', title: 'T', slug: 't', layout: 'boxed' }, viewport: 'desktop', masters: [], templates: [], pages: [] });
  st().addBlock(type);
  const b = st().blocks[0];
  st().setSelectedBlockId(b.id);
  return b;
}

const TYPES = ['DIVIDER', 'CALLOUT', 'STEPS', 'COUNTERS', 'PROGRESS', 'TABLE', 'COUNTDOWN', 'TIMELINE', 'LOGOS', 'TEAM', 'BEFORE_AFTER', 'BUSINESS', 'BENTO', 'SPLIT_CTA', 'CASE_STUDY', 'AUTHOR_BIO', 'REVIEW_SUMMARY', 'TESTIMONIAL_WALL', 'HOVER_GRID', 'SCROLLYTELLING', 'HOTSPOTS', 'TABLE_OF_CONTENTS', 'SHARE_BAR', 'CODE_SNIPPET', 'PRICE_CALCULATOR', 'WIZARD', 'VIDEO_HERO', 'AUDIO_PLAYER', 'ANNOUNCEMENT_BAR', 'NEWSLETTER'];
const PANEL = { DIVIDER: 'Divider', CALLOUT: 'Callout', STEPS: 'Steps', COUNTERS: 'Counters', PROGRESS: 'Progress Bars', TABLE: 'Data Table', COUNTDOWN: 'Countdown', TIMELINE: 'Timeline', LOGOS: 'Logos', TEAM: 'Team Members', BEFORE_AFTER: 'Before / After', BUSINESS: 'Business Details', BENTO: 'Bento Tiles', SPLIT_CTA: 'Left Side', CASE_STUDY: 'Case Study', AUTHOR_BIO: 'Author', REVIEW_SUMMARY: 'Rating', TESTIMONIAL_WALL: 'Testimonials', HOVER_GRID: 'Grid Items', SCROLLYTELLING: 'Story Steps', HOTSPOTS: 'Hotspot Image', TABLE_OF_CONTENTS: 'Table of Contents', SHARE_BAR: 'Share Bar', CODE_SNIPPET: 'Code', PRICE_CALCULATOR: 'Calculator Texts', WIZARD: 'Steps and Fields', VIDEO_HERO: 'Background Video', AUDIO_PLAYER: 'Audio', ANNOUNCEMENT_BAR: 'Announcement', NEWSLETTER: 'Newsletter Signup' };
let failedRun = false;
try {
  console.log('\nADD BLOCK — the blocks.json defaults reach the editor');
  for (const t of TYPES) {
    const b = addAndSelect(t);
    const def = blockDefs.types[t];
    check(`${t}: addBlock creates the block with the default content`, b.type === t && JSON.stringify(b.content) === JSON.stringify(def.content));
  }

  console.log('\nADDING A BLOCK — it is selected and scrolled into view');
  {
    st().setBlocks([]); st().setSelectedBlockId(null);
    const scrolled = [];
    w.Element.prototype.scrollIntoView = function (o) { scrolled.push({ id: this.getAttribute('data-test-id') || this.id, el: this, o }); };
    st().addBlock('DIVIDER');
    const added = st().blocks[0];
    check('addBlock selects the new block (so its settings open on the right) and flags it to be revealed', !!added && st().selectedBlockId === added.id && st().revealBlockId === added.id);
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [added.id] }, React.createElement(SortableBlock, { block: added }))));
    await waitFor(() => scrolled.length > 0 && st().revealBlockId === null);
    check('the block\'s frame scrolls into view, centred, and the flag is cleared so it happens only once', scrolled.length === 1 && scrolled[0].o.block === 'center' && st().revealBlockId === null);
    await sleep(60);
    check('re-rendering the block does not scroll again', scrolled.length === 1);
    st().addBlock('DIVIDER');
    check('a second block added becomes the selected one', st().blocks.length === 2 && st().selectedBlockId === st().blocks[1].id && st().selectedBlockId !== added.id);
    st().setBlocks([]); st().setSelectedBlockId(null);
  }

  console.log('\nPANELS — mounted and editable');
  for (const t of TYPES) {
    addAndSelect(t);
    mount(React.createElement(PropertyPanel));
    const ok = await waitFor(() => $$('button').some((b) => b.textContent.includes(PANEL[t])));
    check(`${t}: the "${PANEL[t]}" panel appears (no rendering error)`, !!ok);
  }

  // --- interactions per type
  addAndSelect('DIVIDER'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Style'));
  check('DIVIDER: with "line" there is no height field', !field('Height px'));
  setValue(field('Style'), 'wave'); await sleep(40);
  check('DIVIDER: changing the style updates the store', content().style === 'wave');
  check('DIVIDER: with "wave" height and flip appear, width disappears', !!field('Height px') && !!checkbox('Flip vertically') && !field('Width %'));
  click(checkbox('Flip vertically')); await sleep(40);
  check('DIVIDER: the checkbox updates the store', content().flip === true);
  setValue(field('Color'), '#ff0000'); await sleep(40);
  check('DIVIDER: the color updates the store', content().color === '#ff0000');

  addAndSelect('CALLOUT'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Text'));
  setValue(field('Text'), '<p>nuovo</p>'); setValue(field('Type'), 'danger'); await sleep(40);
  check('CALLOUT: text and type update the store', content().text === '<p>nuovo</p>' && content().variant === 'danger');

  addAndSelect('STEPS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add step'));
  click(buttonByText('+ Add step')); await sleep(40);
  check('STEPS: "+ Add step" adds a step', content().items.length === 4);
  const firstTitle = content().items[0].title;
  click($$('button[title="Move down"]')[0]); await sleep(40);
  check('STEPS: "Move down" swaps the first two steps', content().items[1].title === firstTitle);
  click($$('button[title="Remove"]')[0]); await sleep(40);
  check('STEPS: "Remove" deletes the step', content().items.length === 3);
  check('STEPS: the buttons at the edges are disabled (you cannot move out of the list)', $$('button[title="Move up"]')[0].disabled === true);

  addAndSelect('COUNTERS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add counter'));
  const valInput = field('Value');
  setValue(valInput, '250'); await sleep(40);
  check('COUNTERS: the value is saved as a NUMBER (not a string)', content().items[0].value === 250);
  setValue(valInput, ''); await sleep(40);
  check('COUNTERS: cleared field → empty string (the compiler treats it as 0)', content().items[0].value === '');
  click(buttonByText('+ Add counter')); await sleep(40);
  check('COUNTERS: adding a counter', content().items.length === 5);

  addAndSelect('PROGRESS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add bar'));
  setValue(field('Value %'), '42'); await sleep(40);
  check('PROGRESS: numeric percentage value', content().items[0].value === 42);
  click(buttonByText('+ Add bar')); await sleep(40);
  check('PROGRESS: adding a bar', content().items.length === 4);

  addAndSelect('TABLE'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Data'));
  setValue(field('Data'), 'A | B\n1 | 2'); await sleep(40);
  check('TABLE: pasted data ends up in the store as is', content().data === 'A | B\n1 | 2');

  addAndSelect('COUNTDOWN'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Target date'));
  setValue(field('Target date'), '2031-02-03T04:05'); setValue(field('Time zone'), '+02:00'); await sleep(40);
  check('COUNTDOWN: date/time and time zone update the store in the format the compiler expects', content().datetime === '2031-02-03T04:05' && content().utcOffset === '+02:00');
  check('COUNTDOWN: the time zone menu contains "visitor local time" and offsets from -12:00 to +14:00', (() => { const o = [...field('Time zone').options].map((x) => x.value); return o[0] === 'local' && o.includes('-12:00') && o.includes('+14:00') && o.includes('+05:30'); })());
  setValue(field('When it ends'), 'hide'); await sleep(40);
  check('COUNTDOWN: with "hide" the message field disappears', content().endAction === 'hide' && !field('Message'));

  addAndSelect('TIMELINE'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add event'));
  click(buttonByText('+ Add event')); await sleep(40);
  check('TIMELINE: adding an event', content().items.length === 4);

  // panels generated from the shared block definitions (canvascore-admin/blocks/)
  addAndSelect('IMAGE'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Aspect Ratio'));
  check('IMAGE: the panel generated from its definition shows every setting', ['Image URL', 'Alt Text (SEO)', 'Object-Fit Mode', 'Aspect Ratio', 'Focus / Object Position', 'Zoom (Scale)'].every((l) => !!field(l)));
  st().updateBlock(st().blocks[0].id, { content: { src: 'a.jpg' } }); await sleep(40);
  check('IMAGE: a missing value shows the setting\'s default (cover, auto, centre, zoom 1)', field('Object-Fit Mode').value === 'cover' && field('Aspect Ratio').value === 'auto' && field('Focus / Object Position').value === 'center' && field('Zoom (Scale)').value === '1');
  setValue(field('Aspect Ratio'), '4 / 3'); setValue(field('Object-Fit Mode'), 'contain'); await sleep(40);
  check('IMAGE: picking a choice updates the store', content().aspectRatio === '4 / 3' && content().objectFit === 'contain');
  setValue(field('Zoom (Scale)'), '1.5'); await sleep(40);
  check('IMAGE: the zoom slider stores a number', content().scale === 1.5);
  check('IMAGE: the image field has the media library button', !!$$('button').find((b) => b.getAttribute('aria-label') === 'Choose from the media library'));
  addAndSelect('ICON_BOX'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Icon / Emoji'));
  setValue(field('Icon / Emoji'), '\u2605'); await sleep(40);
  check('ICON_BOX: text settings update the store; "textarea" gives several lines', content().icon === '\u2605' && field('Description').tagName === 'TEXTAREA');
  addAndSelect('CALLOUT'); mount(React.createElement(PropertyPanel)); await waitFor(() => checkbox('Show icon'));
  check('CALLOUT: a switch that is on by default shows checked', checkbox('Show icon').checked === true && field('Text').tagName === 'TEXTAREA');
  click(checkbox('Show icon')); await sleep(40);
  check('CALLOUT: …and turning it off stores false', content().showIcon === false);
  addAndSelect('STEPS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Steps Layout'));
  click(buttonByText('Steps Layout')); await waitFor(() => field('Layout'));
  setValue(field('Layout'), 'vertical'); await sleep(40);
  check('STEPS: a closed section opens; its choice and its hint are there', content().layout === 'vertical' && doc.body.textContent.includes('becomes vertical on small screens'));
  check('STEPS: each item card is titled from the definition', $$('span').some((x) => x.textContent === 'Step 1'));

  addAndSelect('VIDEO'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('YouTube / Vimeo Link'));
  setValue(field('YouTube / Vimeo Link'), 'https://example.com/clip'); await sleep(40);
  check('VIDEO: a link that is not YouTube or Vimeo shows a warning', !!$$('[role="alert"]').find((x) => /doesn't look like a YouTube or Vimeo/.test(x.textContent)));
  setValue(field('YouTube / Vimeo Link'), 'https://youtu.be/dQw4w9WgXcQ'); await sleep(40);
  check('VIDEO: …and none for a video link', !$$('[role="alert"]').find((x) => /doesn't look like/.test(x.textContent)) && content().url === 'https://youtu.be/dQw4w9WgXcQ');
  addAndSelect('MAPS'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Zoom Level'));
  setValue(field('Zoom Level'), '12'); await sleep(40);
  check('MAPS: the zoom slider stores a number and its label shows it', content().zoom === 12 && $$('label').some((l) => l.textContent === 'Zoom Level: 12'));
  addAndSelect('HTML'); useStore.setState({ userRole: 'editor' }); mount(React.createElement(PropertyPanel)); await waitFor(() => field('HTML Code'));
  check('HTML: for an editor the code is read-only, with the reason', field('HTML Code').readOnly === true && doc.body.textContent.includes('Only admins can change custom code'));
  useStore.setState({ userRole: 'admin' }); mount(React.createElement(PropertyPanel)); await waitFor(() => field('HTML Code'));
  check('HTML: …and editable for an admin', field('HTML Code').readOnly === false && !doc.body.textContent.includes('Only admins can change custom code'));
  addAndSelect('COUNTERS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Counters Settings'));
  click(buttonByText('Counters Settings')); await waitFor(() => field('Columns'));
  setValue(field('Columns'), '3'); await sleep(40);
  check('COUNTERS: a list of numbers stores a number', content().columns === 3);
  check('COUNTERS: the duration shows while counting up is on', !!field('Duration ms'));
  click(checkbox('Count up when scrolled into view')); await sleep(40);
  check('COUNTERS: …and hides when it is off', content().animate === false && !field('Duration ms'));
  check('COUNTERS: values computed for the page are never shown in the panel', !field('shown') && !$$('label').some((l) => /^shown/.test(l.textContent)));

  // --- every block with a shared definition gets its panel generated from it (SchemaPanel + named widgets)
  {
    const { BLOCK_DEFS } = await vite.ssrLoadModule('/src/render/blockDef.mjs');
    const { PANEL_WIDGETS } = await vite.ssrLoadModule('/src/components/panel/widgetRegistry.js');
    const { CONTENT_PANELS } = await vite.ssrLoadModule('/src/components/panel/blocks/index.js');
    const problems = [];
    const look = (settings, keys, where) => {
      for (const k of keys) {
        const st = settings[k];
        if (!st) { problems.push(`${where}: no setting "${k}"`); continue; }
        const ctl = st.control || '';
        if (ctl.startsWith('widget:') && !PANEL_WIDGETS[ctl.slice(7)]) problems.push(`${where}: no widget ${ctl}`);
        if (st.itemKeys) look(st.item || {}, st.itemKeys, `${where}.${k}`);
      }
    };
    for (const d of BLOCK_DEFS) {
      if (!Array.isArray(d.panel)) { problems.push(`${d.type}: no panel`); continue; }
      if (!/SchemaPanel/.test((CONTENT_PANELS[d.type] || {}).displayName || '')) problems.push(`${d.type}: its panel is not the generated one`);
      for (const g of d.panel) {
        look(d.settings, g.keys || [], `${d.type} / ${g.title}`);
        if (g.widget && !PANEL_WIDGETS[g.widget]) problems.push(`${d.type} / ${g.title}: no widget ${g.widget}`);
      }
    }
    check(`every one of the ${BLOCK_DEFS.length} definitions has a generated panel whose fields and widgets all exist`, problems.length === 0, problems.join('; '));
    const notShown = [];
    for (const d of BLOCK_DEFS) {
      addAndSelect(d.type); mount(React.createElement(PropertyPanel));
      if (!(await waitFor(() => d.panel.every((g) => $$('button').some((b) => b.textContent.includes(g.title))), 1500))) notShown.push(d.type);
    }
    check('…and each one mounts with all its sections (no rendering error)', notShown.length === 0, notShown.join(', '));
  }
  const realFetch0 = globalThis.fetch;
  globalThis.fetch = async (u) => new Response(JSON.stringify(String(u).includes('get_media_folders') ? [] : String(u).includes('get_media') ? [{ name: 'photo.jpg', url: '/uploads/photo.jpg', alt: 'A photo' }] : []), { status: 200 });
  // an image with a focal point in the library fills the Image block's Focus; one without leaves it as it is
  globalThis.fetch = async (u) => new Response(JSON.stringify(String(u).includes('get_media_folders') ? [] : String(u).includes('get_media') ? [{ name: 'photo.jpg', url: '/uploads/photo.jpg', alt: 'A photo', focal: { x: 30, y: 70.5 } }, { name: 'plain.jpg', url: '/uploads/plain.jpg', alt: '' }] : []), { status: 200 });
  addAndSelect('IMAGE'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('button').find((b) => b.getAttribute('aria-label') === 'Choose from the media library'));
  click($$('button').find((b) => b.getAttribute('aria-label') === 'Choose from the media library'));
  click(await waitFor(() => $('[aria-label="Choose A photo"]'))); await sleep(40);
  check('IMAGE: a focal point set in the library fills the block\'s Focus (an object-position) with the image', content().src === '/uploads/photo.jpg' && content().objectPosition === '30% 70.5%', JSON.stringify(content()));
  check('…and the Focus field shows that value instead of falling back to Center', !!$$('select').find((x) => [...x.options].some((o) => o.value === '30% 70.5%') && x.value === '30% 70.5%'));
  click($$('button').find((b) => b.getAttribute('aria-label') === 'Choose from the media library'));
  click(await waitFor(() => $('[aria-label="Choose plain.jpg"]'))); await sleep(40);
  check('…an image without a focal point leaves the Focus as it is', content().src === '/uploads/plain.jpg' && content().objectPosition === '30% 70.5%', JSON.stringify(content()));
  globalThis.fetch = async (u) => new Response(JSON.stringify(String(u).includes('get_media_folders') ? [] : String(u).includes('get_media') ? [{ name: 'photo.jpg', url: '/uploads/photo.jpg', alt: 'A photo' }] : []), { status: 200 });
  addAndSelect('GALLERY'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add image from media'));
  const nImgs = content().images.length;
  click(buttonByText('+ Add image from media'));
  click(await waitFor(() => $('[aria-label="Choose A photo"]'))); await sleep(40);
  const lastImg = content().images[content().images.length - 1];
  check('GALLERY: "+ Add image from media" adds an item with the picked image and its alt text', content().images.length === nImgs + 1 && lastImg.src === '/uploads/photo.jpg' && lastImg.alt === 'A photo' && lastImg.caption === '', JSON.stringify(lastImg));
  addAndSelect('BEFORE_AFTER'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('button[title="Choose from the media library"]').length);
  st().updateBlock(st().blocks[0].id, { content: { ...content(), before: { label: 'Prima' } } }); await sleep(40);
  click($$('button[title="Choose from the media library"]')[0]);
  click(await waitFor(() => $('[aria-label="Choose A photo"]'))); await sleep(40);
  check('BEFORE_AFTER: the library fills the BEFORE side (image and alt text), keeping its other values', content().before.src === '/uploads/photo.jpg' && content().before.alt === 'A photo' && content().before.label === 'Prima', JSON.stringify(content().before));
  check('BEFORE_AFTER: the sides are boxed with their titles; the slider label shows its value', doc.body.textContent.includes('BEFORE (left)') && doc.body.textContent.includes('AFTER (right)') && (click(buttonByText('Compare Settings')), true));
  await waitFor(() => $$('label').some((l) => /^Starting position \(50%\)$/.test(l.textContent)));
  check('…"Starting position (50%)"', $$('label').some((l) => /^Starting position \(50%\)$/.test(l.textContent)));
  globalThis.fetch = realFetch0;

  addAndSelect('SHARE_BAR'); mount(React.createElement(PropertyPanel)); await waitFor(() => checkbox('Print'));
  st().updateBlock(st().blocks[0].id, { content: { ...content(), networks: [] } }); await sleep(40);
  click(checkbox('Print')); await sleep(40); click(checkbox('Facebook')); await sleep(40);
  check('SHARE_BAR: the network checkboxes keep the networks in their own order', JSON.stringify(content().networks) === '["facebook","print"]', JSON.stringify(content().networks));

  addAndSelect('PRICING'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Features'));
  setValue(field('Features'), 'One\nTwo'); await sleep(40);
  check('PRICING: features are edited one per line', JSON.stringify(content().plans[0].features) === '["One","Two"]');
  check('PRICING: the highlighted plan is starred in its card title', $$('span').some((x) => /^Plan \d ★$/.test(x.textContent)));

  addAndSelect('BUSINESS'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Button text'));
  click(checkbox('Show a “Get directions” button')); await sleep(40);
  check('BUSINESS: the directions button text hides with the button', content().mapsLink === false && !field('Button text'));
  click(buttonByText('Opening Hours')); await sleep(40);
  const hoursBefore = (content().hours || []).length;
  if (hoursBefore === 0) { click(await waitFor(() => buttonByText('+ Add weekly hours'))); await sleep(40); }
  check('BUSINESS: the opening hours widget: one row per day with times and a closed box', (content().hours || []).length === 7 && $$('input[type="time"]').length === 14 && !!buttonByText('Remove opening hours'));

  addAndSelect('HERO'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Hero Buttons'));
  click(buttonByText('Hero Buttons')); await waitFor(() => $('[aria-label="Button style"]'));
  click([...$('[aria-label="Button style"]').querySelectorAll('button')].find((b) => b.textContent === 'Outline')); await sleep(40);
  check('HERO: the button look widget turns a button into an outline one', content().buttons[0].bgColor === 'transparent' && !!content().buttons[0].borderColor);
  check('…and its hover border appears once it has a border', !!$$('label').find((l) => l.textContent.trim() === 'Border') && !!$$('span').find((x) => x.textContent === 'ON HOVER'));

  addAndSelect('BUTTON'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Colors'));
  click(buttonByText('Colors')); click(buttonByText('Hover')); await waitFor(() => $$('label').some((l) => l.textContent.startsWith('Background (empty = brand color)')));
  check('BUTTON: with the global style on, the background field says the brand colour is used; no hover border without a border', !!$$('label').find((l) => l.textContent.startsWith('Background (empty = brand color)')) && !$$('label').find((l) => l.textContent.startsWith('Border on hover')));
  setValue($$('input').find((i) => i.getAttribute('aria-label') === 'Background (empty = brand color)'), '#ff0000'); await sleep(40);
  check('BUTTON: a colour of the Colors section is a style of the block', st().blocks[0].styles.backgroundColor === '#ff0000');

  addAndSelect('COUNTDOWN'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Countdown Display'));
  click(buttonByText('Countdown Display')); await waitFor(() => field('Days label'));
  check('COUNTDOWN: the unit labels sit two per row', field('Days label').closest('div').parentElement === field('Hours label').closest('div').parentElement && getComputedStyle(field('Days label').closest('div').parentElement).display === 'grid');
  addAndSelect('REVIEW_SUMMARY'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Rating Breakdown'));
  click(buttonByText('Rating Breakdown')); await sleep(40);
  check('REVIEW_SUMMARY: each breakdown card is titled with its stars', $$('span').some((x) => x.textContent === '5 stars'));
  addAndSelect('TEAM'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add member'));
  check('TEAM: each member card is titled with the name', $$('span').some((x) => x.textContent === content().members[0].name));

  // --- block packages in the editor: registered at run time, they join the catalog, the Add panel, addBlock, the panels and the canvas
  {
    const { registerPackages, packageCss } = await vite.ssrLoadModule('/src/editor/blockPackages.js');
    const cat = await vite.ssrLoadModule('/src/editor/blockCatalog.js');
    const { contentPanelFor } = await vite.ssrLoadModule('/src/components/panel/blocks/index.js');
    const AddBlocksPanel = (await vite.ssrLoadModule('/src/components/AddBlocksPanel.jsx')).default;
    const exDir = path.join(PROJECT, '../docs/examples/block-packages/pull-quote');
    const ex = JSON.parse(readFileSync(path.join(exDir, 'blocks/pull-quote.json'), 'utf8'));
    const T = 'X_PULL_QUOTE__PULL_QUOTE';
    const payload = {
      packages: [{ id: 'pull-quote', name: 'Pull Quote', version: '1.0.0', blocks: [
        { type: T, definition: { type: T, settings: ex.settings, template: ex.template, panel: ex.panel, _pkg: 'pull-quote' }, catalog: ex.catalog, defaults: ex.defaults },
        { type: 'X_PULL_QUOTE__PIC', definition: { type: 'X_PULL_QUOTE__PIC', settings: { alt: { type: 'text', default: '' } }, template: '<div id="{{_id}}" class="pic{{_classes}}"><img src="{{_assets}}pic.png" alt="{{alt}}"></div>', panel: [{ title: 'Picture', keys: ['alt'], open: true }], _pkg: 'pull-quote' },
          catalog: { label: 'Picture', icon: 'NoSuchIcon', keywords: 'photo' }, defaults: [] },
      ] }],
      css: '.cc-pkg-pull-quote{&.pq {color:red}}\n',
    };
    check('before a package is registered its block is just an unknown type (not in the catalog)', !cat.searchBlocks('pull quote').some((b) => b.type === T) && cat.blockInfo(T).category === undefined);
    const v0 = st().packagesVersion;
    registerPackages(payload);
    check('registering packages tells the editor to redraw', st().packagesVersion === v0 + 1);
    const info = cat.blockInfo(T);
    check('a package block gets its catalog entry: name, "Block packages" group, colour', info.label === 'Pull Quote' && info.category === 'packages' && info.color === '#f59e0b' && cat.CATEGORIES.some((c) => c.id === 'packages'));
    check('…an icon that is not on the list becomes the package icon, and search finds it by its keywords', cat.blockInfo('X_PULL_QUOTE__PIC').icon === cat.PACKAGE_ICONS.Package && cat.blockInfo(T).icon === cat.PACKAGE_ICONS.Quote && cat.searchBlocks('testimonial').some((b) => b.type === T) && cat.searchBlocks('photo').some((b) => b.type === 'X_PULL_QUOTE__PIC'));
    check('the core catalog is untouched', cat.searchBlocks('callout').some((b) => b.type === 'CALLOUT') && cat.blockInfo('CALLOUT').category !== 'packages');
    check('the package CSS is kept for the canvas', packageCss() === payload.css);

    mount(React.createElement(AddBlocksPanel, { onAdd: (t) => { globalThis.__added = t; }, targetType: null }));
    await waitFor(() => buttonByText('Pull Quote'));
    check('the Add panel lists them in the "Block packages" group', $$('button').some((b) => /Block packages/.test(b.textContent)) && !!buttonByText('Pull Quote') && !!buttonByText('Picture'));
    click(buttonByText('Pull Quote')); await sleep(20);
    check('…and a click adds the block', globalThis.__added === T);

    const b = addAndSelect(T);
    check('addBlock gives a package block the defaults of its package (content and styles)', b.content.author === 'Steve Jobs' && b.content.accent === '#f59e0b' && b.styles.padding === '24px 0' && b.type === T, JSON.stringify(b));
    check('…and an empty list of defaults is fine', addAndSelect('X_PULL_QUOTE__PIC').type === 'X_PULL_QUOTE__PIC');
    addAndSelect(T); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Quote'));
    check('the panel is generated from the package definition: its sections and fields', ['Pull Quote', 'Pull Quote Link', 'Pull Quote Style'].every((t) => !!buttonByText(t)) && !!field('Author') && !!field('Role or source (empty = none)') && field('Quote').tagName === 'TEXTAREA');
    setValue(field('Author'), 'Ada'); await sleep(40);
    check('…editing a field changes the block', content().author === 'Ada');
    click(buttonByText('Pull Quote Style')); await waitFor(() => field('Alignment'));
    setValue(field('Alignment'), 'center'); await sleep(40);
    check('…a choice stores its value', content().align === 'center');

    addAndSelect(T);
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [st().blocks[0].id] }, React.createElement(SortableBlock, { block: st().blocks[0] }))));
    const el = await waitFor(() => doc.querySelector('.pq.cc-pkg-pull-quote'));
    check('the canvas draws a package block from its definition, with the package class', !!el && /Design is not just/.test(el.textContent) && !/Unknown element/.test(doc.body.innerHTML));
    const b2 = addAndSelect('X_PULL_QUOTE__PIC');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [b2.id] }, React.createElement(SortableBlock, { block: b2 }))));
    const img = await waitFor(() => doc.querySelector('.pic img'));
    check('a package\'s images are loaded from the site folder (../canvascore-blocks/ next to the admin folder)', !!img && img.getAttribute('src') === '../canvascore-blocks/pull-quote/pic.png', img && img.getAttribute('src'));
    check('a core package-free block is not changed by any of this', contentPanelFor('CALLOUT') && contentPanelFor(T) && !contentPanelFor('X_NOPE__NOPE'));

    registerPackages({ packages: [], css: '' });
    check('registering the packages again replaces them: an uninstalled block is gone from the catalog and the panel', !cat.searchBlocks('pull quote').some((b3) => b3.type === T) && cat.blockInfo(T).category !== 'packages' && !contentPanelFor(T) && packageCss() === '');
    registerPackages({ packages: [{ id: 'evil', name: 'Evil', version: '1.0.0', blocks: [{ type: 'CALLOUT', definition: { type: 'CALLOUT', settings: {}, template: '<b id="{{_id}}" class="{{_classes}}">x</b>', _pkg: 'evil' }, catalog: { label: 'Hacked' } }] }], css: '' });
    check('a package can not take the place of a core block', cat.blockInfo('CALLOUT').label === 'Callout' && !cat.searchBlocks('hacked').length);
    registerPackages({ packages: [], css: '' });
  }

  addAndSelect('LOGOS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add empty slot'));
  click(buttonByText('+ Add empty slot')); await sleep(40);
  check('LOGOS: adding an empty slot', content().logos.length === 6 && content().logos[5].src === '');
  check('LOGOS: the "from media" button opens the picker (no errors)', (() => { try { click(buttonByText('+ Add logo from media')); return true; } catch { return false; } })());
  await sleep(60);

  addAndSelect('TEAM'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add member'));
  click(buttonByText('+ Add member')); await sleep(40);
  check('TEAM: adding a member with all expected fields', content().members.length === 4 && ['name', 'role', 'bio', 'photo', 'email', 'linkedin', 'twitter', 'website'].every((k) => k in content().members[3]));

  addAndSelect('BENTO'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add tile'));
  click(buttonByText('+ Add tile')); await sleep(40);
  check('BENTO: "+ Add tile" adds a tile with all expected fields', content().tiles.length === 6 && ['size', 'icon', 'title', 'text', 'image', 'alt', 'bg', 'color', 'href'].every((k) => k in content().tiles[5]));
  setValue($$('select').find((s) => [...s.options].some((o) => o.value === 'large')), 'tall'); await sleep(40);
  check('BENTO: the size of the first tile updates the store', content().tiles[0].size === 'tall');

  addAndSelect('SPLIT_CTA'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Title'));
  setValue(field('Title'), 'New left title'); await sleep(40);
  check('SPLIT_CTA: editing the left title keeps the rest of the left side', content().left.title === 'New left title' && content().left.buttonText === 'Get a quote' && content().right.title === 'Just have a question?');

  addAndSelect('CASE_STUDY'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Headline metric'));
  setValue(field('Headline metric'), '3x'); await sleep(40);
  check('CASE_STUDY: the metric updates the store', content().metric === '3x');

  addAndSelect('AUTHOR_BIO'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Name'));
  setValue(field('Name'), 'Sam Lee'); await sleep(40);
  click(buttonByText('Author Links')); await sleep(40);
  click(buttonByText('+ Add link')); await sleep(40);
  check('AUTHOR_BIO: name and a new link update the store', content().name === 'Sam Lee' && content().links.length === 3 && content().links[2].label === 'New link');

  addAndSelect('LOGOS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Logos Layout'));
  click(buttonByText('Logos Layout')); await sleep(40);
  check('LOGOS: direction, fade and speed are hidden for the grid layout', !field('Direction') && !checkbox('Fade the edges') && !$$('input[type="range"]').length);
  setValue(field('Layout'), 'marquee'); await sleep(40);
  setValue(field('Direction'), 'right'); await sleep(40);
  click(checkbox('Fade the edges')); await sleep(40);
  const speed = $$('input[type="range"]')[0];
  setValue(speed, '60'); await sleep(40);
  check('LOGOS strip: direction, fading edges and the speed slider update the store', content().direction === 'right' && content().fade === false && content().speed === 60, JSON.stringify({ d: content().direction, f: content().fade, s: content().speed }));
  check('LOGOS strip: the slider label shows the loop time', $$('label').some((l) => l.textContent.includes('one loop every 60 s')));

  addAndSelect('REVIEW_SUMMARY'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Average rating (0–5)'));
  setValue(field('Average rating (0–5)'), '4.2'); await sleep(40);
  check('REVIEW_SUMMARY: the average updates the store as a number', content().average === 4.2);

  addAndSelect('TESTIMONIAL_WALL'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add testimonial'));
  click(buttonByText('+ Add testimonial')); await sleep(40);
  check('TESTIMONIAL_WALL: "+ Add testimonial" adds one with all expected fields', content().items.length === 7 && ['quote', 'name', 'role', 'avatar', 'rating'].every((k) => k in content().items[6]));

  addAndSelect('HOVER_GRID'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add item'));
  click(buttonByText('+ Add item')); await sleep(40);
  click(buttonByText('Hover Layout')); await sleep(40);
  setValue(field('Reveal effect'), 'fade'); await sleep(40);
  check('HOVER_GRID: adding an item and changing the effect update the store', content().items.length === 4 && content().effect === 'fade');

  addAndSelect('SCROLLYTELLING'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add step'));
  click(buttonByText('+ Add step')); await sleep(40);
  check('SCROLLYTELLING: "+ Add step" adds a step with all expected fields', content().steps.length === 4 && ['title', 'text', 'image', 'alt'].every((k) => k in content().steps[3]));

  addAndSelect('HOTSPOTS'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('[aria-label^="Pin placement area"]').length);
  const placer = $$('[aria-label^="Pin placement area"]')[0];
  placer.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 });
  check('HOTSPOTS: the first pin is selected and the placer says so', /Pin 1 selected/.test(doc.body.textContent));
  placer.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 200, clientY: 100 })); await sleep(40);
  check('HOTSPOTS: clicking on the placement area moves the selected pin there (in percent of the image)', content().pins[0].x === 25 && content().pins[0].y === 25, JSON.stringify([content().pins[0].x, content().pins[0].y]));
  click($$('button[aria-label="Select pin 2"]')[0]); await sleep(40);
  placer.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 700, clientY: 400 })); await sleep(40);
  check('HOTSPOTS: selecting another pin and clicking outside the area clamps to the edge', content().pins[1].x === 100 && content().pins[1].y === 100 && content().pins[0].x === 25);
  click(buttonByText('+ Add pin')); await sleep(40);
  check('HOTSPOTS: "+ Add pin" adds a centred pin with all expected fields and selects it', content().pins.length === 4 && content().pins[3].x === 50 && ['x', 'y', 'title', 'text', 'linkText', 'href'].every((k) => k in content().pins[3]) && /Pin 4 selected/.test(doc.body.textContent));

  addAndSelect('TABLE_OF_CONTENTS'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Contents Layout'));
  click(buttonByText('Contents Layout')); await sleep(40);
  check('TABLE_OF_CONTENTS: the distance from the top only appears for a sticky list', !field('Distance from the top px'));
  click(checkbox('Stay in view while scrolling')); await sleep(40);
  check('TABLE_OF_CONTENTS: sticky on → the field appears and the store follows', content().sticky === true && !!field('Distance from the top px'));
  setValue(field('Headings to list'), 'h2h3'); await sleep(40);
  check('TABLE_OF_CONTENTS: the headings level updates the store', content().levels === 'h2h3');

  addAndSelect('SHARE_BAR'); mount(React.createElement(PropertyPanel)); await waitFor(() => checkbox('Telegram'));
  check('SHARE_BAR: the default networks are ticked', checkbox('Facebook').checked && !checkbox('Telegram').checked && checkbox('Copy link').checked);
  click(checkbox('Telegram')); await sleep(40);
  check('SHARE_BAR: ticking a network adds it in the fixed order (not at the end)', JSON.stringify(content().networks) === JSON.stringify(['facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'email', 'copy']), JSON.stringify(content().networks));
  click(checkbox('Facebook')); await sleep(40);
  check('SHARE_BAR: unticking removes it', !content().networks.includes('facebook') && content().networks.length === 6);

  addAndSelect('CODE_SNIPPET'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Code'));
  setValue(field('Code'), 'echo 1;'); setValue(field('Language'), 'php'); await sleep(40);
  check('CODE_SNIPPET: the code and the language update the store', content().code === 'echo 1;' && content().language === 'php');
  click(buttonByText('Code Display')); await sleep(40);
  click(checkbox('Line numbers')); await sleep(40);
  check('CODE_SNIPPET: line numbers update the store; the copy button is on by default', content().lineNumbers === true && checkbox('Copy button').checked);

  addAndSelect('PRICE_CALCULATOR'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Sliders'));
  click(buttonByText('Sliders')); await sleep(40);
  click(buttonByText('+ Add slider')); await sleep(40);
  check('PRICE_CALCULATOR: "+ Add slider" adds a slider with all expected fields', content().sliders.length === 3 && ['label', 'unit', 'min', 'max', 'step', 'value', 'included', 'price'].every((k) => k in content().sliders[2]));
  click(buttonByText('Add-ons')); await sleep(40);
  click(buttonByText('+ Add add-on')); await sleep(40);
  check('PRICE_CALCULATOR: "+ Add add-on" adds an add-on (not ticked)', content().addons.length === 3 && content().addons[2].checked === false && 'price' in content().addons[2]);
  setValue(field('Currency symbol'), '$'); await sleep(40);
  setValue(field('Number format'), 'eu'); await sleep(40);
  check('PRICE_CALCULATOR: the currency and the number format update the store', content().currency === '$' && content().numberFormat === 'eu');
  click(buttonByText('Monthly / Yearly')); await sleep(40);
  check('PRICE_CALCULATOR: the yearly options are shown for a calculator with the switch', !!field('Discount for paying yearly (%)'));
  click(checkbox('Let visitors switch between monthly and yearly')); await sleep(40);
  check('PRICE_CALCULATOR: switching the option off hides them and updates the store', content().billingToggle === false && !field('Discount for paying yearly (%)'));

  addAndSelect('WIZARD'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add step'));
  const emailField = () => $$('input[type="email"]').find((i) => i.placeholder === 'Leave blank for Global Email');
  st().userRole = 'admin'; mount(React.createElement(PropertyPanel)); await waitFor(() => emailField());
  const adminSees = !!emailField();
  st().userRole = 'editor'; mount(React.createElement(PropertyPanel)); await sleep(60);
  const editorSees = !!emailField();
  st().userRole = 'admin'; mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('+ Add step'));
  check('WIZARD: the receiving email is offered to admins and not to editors', adminSees === true && editorSees === false, JSON.stringify({ adminSees, editorSees }));
  click(buttonByText('+ Add step')); await sleep(40);
  check('WIZARD: "+ Add step" adds a step with an empty field list', content().steps.length === 4 && Array.isArray(content().steps[3].fields) && content().steps[3].fields.length === 0);
  click($$('button').filter((b) => b.textContent.trim() === '+ Add field')[0]); await sleep(40);
  check('WIZARD: "+ Add field" adds a field to that step only, with all expected fields', content().steps[0].fields.length === 3 && ['label', 'type', 'required', 'options', 'placeholder'].every((k) => k in content().steps[0].fields[2]) && content().steps[1].fields.length === 2);
  const selects = $$('select').filter((s2) => [...s2.options].some((o) => o.value === 'checkboxes'));
  const choiceLists = () => $$('label').filter((l) => l.textContent.trim().startsWith('Choices (one per line)')).length;
  check('WIZARD: only choose-one, drop-down and choose-several fields have a list of choices (the default form has a radio: 1; the new text field adds none)', choiceLists() === 2 && content().steps[0].fields[2].type === 'text', String(choiceLists()));
  setValue(selects[2], 'select'); await sleep(40);
  check('WIZARD: changing a field to a drop-down shows its list of choices and the empty-choice text, and keeps the other steps', content().steps[0].fields[2].type === 'select' && choiceLists() === 3 && $$('label').some((l) => l.textContent.trim().startsWith('Text before a choice is made')) && content().steps[1].fields.length === 2, String(choiceLists()));
  const newChoices = $$('label').filter((l) => l.textContent.trim().startsWith('Choices (one per line)')).map((l) => l.parentElement.querySelector('textarea'))[0];
  setValue(newChoices, 'a\nb'); await sleep(40);
  check('WIZARD: the choices are stored as text, one per line', content().steps[0].fields[2].options === 'a\nb');

  addAndSelect('VIDEO_HERO'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('input').find((i) => i.placeholder === 'Video file address'));
  setValue($$('input').find((i) => i.placeholder === 'Video file address'), '/uploads/clip.mp4'); await sleep(40);
  check('VIDEO_HERO: the video address updates the store', content().video === '/uploads/clip.mp4');
  click(checkbox('Also play the video on phones (uses mobile data)')); await sleep(40);
  check('VIDEO_HERO: "also on phones" updates the store (off by default)', content().mobileVideo === true);
  click(buttonByText('Hero Buttons')); await sleep(40);
  check('VIDEO_HERO: at most two buttons: the default hero has two, so there is no "+ Add button" until one is removed', !buttonByText('+ Add button') && content().buttons.length === 2);
  click($$('button[title="Remove"]')[0]); await sleep(40);
  check('VIDEO_HERO: removing one makes "+ Add button" appear', content().buttons.length === 1 && !!buttonByText('+ Add button'));
  click(buttonByText('+ Add button')); await sleep(40);
  check('VIDEO_HERO: …and it adds a button with all expected fields (and hides itself again at two)', content().buttons.length === 2 && ['text', 'url', 'style'].every((k) => k in content().buttons[1]) && !buttonByText('+ Add button'));
  click($$('button[title="Choose from the media library"]')[0]); await sleep(80);
  check('VIDEO_HERO: the library button asks for a VIDEO (the picker says so and offers video files)', /Choose a video/.test(doc.body.textContent));

  addAndSelect('AUDIO_PLAYER'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('input').find((i) => i.placeholder === 'Audio file address'));
  setValue($$('input').find((i) => i.placeholder === 'Audio file address'), '/uploads/ep1.mp3'); await sleep(40);
  setValue(field('Title (empty = none)'), 'Episode 1'); await sleep(40);
  check('AUDIO_PLAYER: the audio address and title update the store', content().src === '/uploads/ep1.mp3' && content().title === 'Episode 1');

  addAndSelect('ANNOUNCEMENT_BAR'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Message'));
  setValue(field('Message'), 'Big sale today'); setValue(field('Colors'), 'warning'); await sleep(40);
  click(checkbox('Stay at the top while scrolling')); await sleep(40);
  check('ANNOUNCEMENT_BAR: the message, the colors and "stay at the top" update the store without losing the other fields', content().text === 'Big sale today' && content().preset === 'warning' && content().sticky === true && content().linkText === 'Shop now' && content().dismissible === true);

  addAndSelect('NEWSLETTER'); mount(React.createElement(PropertyPanel)); await waitFor(() => buttonByText('Fields'));
  click(buttonByText('Fields')); await sleep(40);
  check('NEWSLETTER: the name fields only appear when "Ask for a name too" is ticked', !field('Name field name'));
  click(checkbox('Ask for a name too')); await sleep(40);
  check('NEWSLETTER: ticking it shows them and updates the store', content().askName === true && !!field('Name field name'));
  setValue(field('Agreement text (empty = no checkbox)'), 'I agree'); await sleep(40);
  check('NEWSLETTER: the agreement text updates the store', content().consentText === 'I agree');
  check('NEWSLETTER: admins are offered the receiving email', !!$$('input[type="email"]').find((i) => i.placeholder === 'Leave blank for Global Email'));

  addAndSelect('BEFORE_AFTER'); mount(React.createElement(PropertyPanel)); await waitFor(() => $$('button').some((b) => b.textContent.includes('Before / After')));
  const imgs = $$('input[placeholder="Image URL"]');
  setValue(imgs[0], 'https://x.example/prima.jpg'); setValue(imgs[1], 'https://x.example/dopo.jpg'); await sleep(40);
  check('BEFORE_AFTER: the two images go to before/after (keeping alt and label)', content().before.src === 'https://x.example/prima.jpg' && content().after.src === 'https://x.example/dopo.jpg' && content().before.label === 'Before' && content().after.label === 'After');

  addAndSelect('BUSINESS'); mount(React.createElement(PropertyPanel)); await waitFor(() => field('Business name'));
  setValue(field('Business name'), 'Bar Roma'); await sleep(40);
  check('BUSINESS: the name updates the store', content().name === 'Bar Roma');
  click($$('button').find((b) => b.textContent.includes('Opening Hours'))); await sleep(60);
  const times = $$('input[type="time"]');
  check('BUSINESS: 7 rows of hours (14 time fields)', times.length === 14);
  setValue(times[0], '07:30'); await sleep(40);
  check('BUSINESS: changing Monday opening time updates only that row', content().hours[0].open === '07:30' && content().hours[1].open === '09:00' && content().hours.length === 7);
  const closedBoxes = $$('input[type="checkbox"][title="Closed"]');
  check('BUSINESS: Sunday marked as closed, with the time fields disabled', closedBoxes[6].checked === true && times[12].disabled === true);
  click(closedBoxes[0]); await sleep(40);
  check('BUSINESS: ticking "closed" on Monday', content().hours[0].closed === true);
  click(buttonByText('Remove opening hours')); await sleep(40);
  check('BUSINESS: "Remove opening hours" clears the hours', content().hours.length === 0 && !!buttonByText('+ Add weekly hours'));
  click(buttonByText('+ Add weekly hours')); await sleep(40);
  check('BUSINESS: "+ Add weekly hours" restores the 7 days', content().hours.length === 7 && content().hours[0].day === 'Monday');

  console.log('\nCANVAS — every block is drawn in the editor (canonical renderer)');
  const CLS = { DIVIDER: 'cc-divider', CALLOUT: 'cc-callout', STEPS: 'cc-steps', COUNTERS: 'cc-counters', PROGRESS: 'cc-progress', TABLE: 'cc-table-block', COUNTDOWN: 'cc-countdown', TIMELINE: 'cc-timeline', LOGOS: 'cc-logos', TEAM: 'cc-team', BEFORE_AFTER: 'cc-ba', BUSINESS: 'cc-business', BENTO: 'cc-bento', SPLIT_CTA: 'cc-split-cta', CASE_STUDY: 'cc-case', AUTHOR_BIO: 'cc-author', REVIEW_SUMMARY: 'cc-review-summary', TESTIMONIAL_WALL: 'cc-testimonial-wall', HOVER_GRID: 'cc-hover-grid', SCROLLYTELLING: 'cc-story', HOTSPOTS: 'cc-hotspots', TABLE_OF_CONTENTS: 'cc-toc', SHARE_BAR: 'cc-share', CODE_SNIPPET: 'cc-code', PRICE_CALCULATOR: 'cc-calc', WIZARD: 'cc-wizard', VIDEO_HERO: 'cc-vhero', AUDIO_PLAYER: 'cc-audio', ANNOUNCEMENT_BAR: 'cc-announce', NEWSLETTER: 'cc-newsletter' };
  for (const t of TYPES) {
    const b = addAndSelect(t);
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [b.id] }, React.createElement(SortableBlock, { block: b }))));
    const el = await waitFor(() => doc.querySelector('.' + CLS[t]));
    check(`${t}: drawn in the canvas (.${CLS[t]}), without "Unknown element"`, !!el && !/Unknown element/.test(doc.body.innerHTML));
  }
  // the editor's own placeholder blocks (Collection List, Master…) show real text, never a raw \uXXXX escape
  {
    const b = addAndSelect('COLLECTION_LIST');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [b.id] }, React.createElement(SortableBlock, { block: b }))));
    await sleep(60);
    check('COLLECTION_LIST: the canvas shows its label with the books emoji, not a raw \\uD83D escape', /Collection List/.test(doc.body.textContent) && !/\\u[0-9a-fA-F]{4}/.test(doc.body.textContent) && doc.body.textContent.includes('\uD83D\uDCDA'), doc.body.textContent.slice(0, 120));
  }
  // before/after in the canvas: the slider must move the line even without the published <script>
  {
    const b = addAndSelect('BEFORE_AFTER');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [b.id] }, React.createElement(SortableBlock, { block: b }))));
    const range = await waitFor(() => doc.querySelector('.cc-ba-range'));
    const ba = doc.querySelector('.cc-ba');
    check('BEFORE_AFTER canvas: start position 50%', ba.style.getPropertyValue('--pos') === '50%');
    // the canvas wires the slider in an effect, after the HTML is in the page: keep moving it until the listener is there
    await waitFor(() => { range.value = '80'; range.dispatchEvent(new w.Event('input', { bubbles: true })); return ba.style.getPropertyValue('--pos') === '80%'; });
    check('BEFORE_AFTER canvas: moving the slider updates the position (faithful preview)', ba.style.getPropertyValue('--pos') === '80%', ba.style.getPropertyValue('--pos'));
    check('BEFORE_AFTER canvas: the block receives clicks (usable slider)', doc.querySelector('.cc-ba').parentElement.style.pointerEvents === 'auto');
  }
  // batch 3 on the canvas: the published scripts don't run there, so the same functions are run by the editor
  {
    const codeBlock = addAndSelect('CODE_SNIPPET');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [codeBlock.id] }, React.createElement(SortableBlock, { block: { ...codeBlock, content: { ...codeBlock.content, code: 'const total = 42; // note' } } }))));
    const kw = await waitFor(() => doc.querySelector('.cc-code-code .cc-tk-k'));
    check('CODE_SNIPPET canvas: the code is colored and its text is unchanged', !!kw && kw.textContent === 'const' && doc.querySelector('.cc-code-code').textContent === 'const total = 42; // note' && !!doc.querySelector('.cc-code-code .cc-tk-c'));
    check('CODE_SNIPPET canvas: the copy button is there and the block receives clicks', doc.querySelector('.cc-code-copy').hidden === false && doc.querySelector('.cc-code').parentElement.style.pointerEvents === 'auto');

    const shareBlock = addAndSelect('SHARE_BAR');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [shareBlock.id] }, React.createElement(SortableBlock, { block: shareBlock }))));
    const bar = await waitFor(() => { const e = doc.querySelector('.cc-share'); return e && !e.hidden ? e : null; });
    check('SHARE_BAR canvas: the bar is shown (without its page links) so it can be designed', !!bar && doc.querySelectorAll('.cc-share-btn').length === 6 && doc.querySelector('a[data-net="x"]').getAttribute('href') === '#');

    const hs = addAndSelect('HOTSPOTS');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [hs.id] }, React.createElement(SortableBlock, { block: hs }))));
    await waitFor(() => doc.querySelector('.cc-hotspots'));
    check('HOTSPOTS canvas: the block receives the mouse, so pins can be hovered', doc.querySelector('.cc-hotspots').parentElement.style.pointerEvents === 'auto' && doc.querySelectorAll('.cc-hs-pin').length === 3);

    const calcBlock = addAndSelect('PRICE_CALCULATOR');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [calcBlock.id] }, React.createElement(SortableBlock, { block: calcBlock }))));
    await waitFor(() => doc.querySelector('.cc-calc'));
    const calcStart = doc.querySelector('.cc-calc-amount').textContent;
    const rng = doc.querySelector('.cc-calc-range');
    // the editor attaches the script's listeners just after the HTML is in the page: keep moving the slider until it answers
    // 29 base + (20 - 3 free) * 8 + (50 - 10 free) * 0.5 + 9 for the ticked add-on = 194
    await waitFor(() => { rng.value = '20'; rng.dispatchEvent(new w.Event('input', { bubbles: true })); return doc.querySelector('.cc-calc-amount').textContent === '€194'; });
    check('PRICE_CALCULATOR canvas: moving a slider in the editor updates the total (so the design can be tried), and the block receives the mouse', calcStart === '€74' && doc.querySelector('.cc-calc-amount').textContent === '€194' && doc.querySelector('.cc-calc').parentElement.style.pointerEvents === 'auto', doc.querySelector('.cc-calc-amount').textContent);

    const wzBlock = addAndSelect('WIZARD');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [wzBlock.id] }, React.createElement(SortableBlock, { block: wzBlock }))));
    await waitFor(() => doc.querySelector('.cc-wizard'));
    await waitFor(() => doc.querySelector('.cc-wz-progress') && !doc.querySelector('.cc-wz-progress').hidden);
    const stepsShown = () => [...doc.querySelectorAll('.cc-wz-step')].map((e) => (e.hidden ? 0 : 1)).join('');
    check('MULTI-STEP FORM canvas: starts on step 1 with the progress shown', stepsShown() === '100' && doc.querySelector('.cc-wz-count').textContent === 'Step 1 of 3');
    click(doc.querySelector('.cc-wz-next')); await sleep(30);
    check('MULTI-STEP FORM canvas: Next walks to the next step even with required fields empty (nothing is validated in the editor)', stepsShown() === '010' && doc.querySelector('.cc-wz-count').textContent === 'Step 2 of 3');
    click(doc.querySelector('.cc-wz-next')); await sleep(30);
    const sub = new w.Event('submit', { bubbles: true, cancelable: true }); doc.querySelector('.cc-wz-form').dispatchEvent(sub);
    check('MULTI-STEP FORM canvas: Send does nothing in the editor (the form is never submitted)', stepsShown() === '001' && sub.defaultPrevented === true);

    const vhBlock = addAndSelect('VIDEO_HERO');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [vhBlock.id] }, React.createElement(SortableBlock, { block: { ...vhBlock, content: { ...vhBlock.content, video: '/uploads/clip.mp4', poster: '/uploads/poster.jpg' } } }))));
    await waitFor(() => doc.querySelector('.cc-vhero'));
    await sleep(60);
    check('VIDEO_HERO canvas: the poster is shown and the video does not load or play while editing (no preload, no button)', /poster\.jpg/.test(doc.querySelector('.cc-vh-poster').getAttribute('style')) && doc.querySelector('video').getAttribute('preload') === 'none' && doc.querySelector('.cc-vh-toggle').hidden === true && doc.querySelector('video').paused === true);

    const auBlock = addAndSelect('AUDIO_PLAYER');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [auBlock.id] }, React.createElement(SortableBlock, { block: auBlock }))));
    await waitFor(() => doc.querySelector('.cc-audio') && doc.querySelector('.cc-au-ui') && !doc.querySelector('.cc-au-ui').hidden);
    check('AUDIO_PLAYER canvas: the custom player replaces the browser\'s controls, and the block receives the mouse', !doc.querySelector('.cc-au-el').hasAttribute('controls') && doc.querySelector('.cc-audio').parentElement.style.pointerEvents === 'auto' && doc.querySelector('.cc-au-title').textContent === 'Episode title');

    const anBlock = addAndSelect('ANNOUNCEMENT_BAR');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [anBlock.id] }, React.createElement(SortableBlock, { block: anBlock }))));
    await waitFor(() => doc.querySelector('.cc-announce') && doc.querySelector('.cc-ann-close') && !doc.querySelector('.cc-ann-close').hidden);
    click(doc.querySelector('.cc-ann-close')); await sleep(30);
    check('ANNOUNCEMENT_BAR canvas: the bar and its close button are shown, and the button does nothing in the editor (it is never hidden or remembered)', doc.querySelector('.cc-announce').hidden === false && doc.querySelector('.cc-ann-text').textContent.length > 0);

    // Table of Contents: lists the headings of the page being edited, and follows them
    const tocBlock = addAndSelect('TABLE_OF_CONTENTS');
    const textBlock = { id: 'tx1', type: 'TEXT', styles: {}, content: { text: '<h2>First</h2><p>x</p><h2>Second</h2>' } };
    mount(React.createElement('div', { className: 'cc-canvas' }, React.createElement(DndContext, null, React.createElement(SortableContext, { items: [textBlock.id, tocBlock.id] },
      React.createElement(SortableBlock, { block: textBlock }), React.createElement(SortableBlock, { block: { ...tocBlock, content: { ...tocBlock.content, levels: 'h2' } } })))));
    const listed = await waitFor(() => { const li = doc.querySelectorAll('.cc-toc-item'); return li.length === 2 ? li : null; });
    check('TABLE_OF_CONTENTS canvas: lists the headings of the canvas', !!listed && [...listed].map((li) => li.textContent).join() === 'First,Second', listed ? [...listed].map((li) => li.textContent).join() : 'none');
    check('TABLE_OF_CONTENTS canvas: the editor\'s headings are not given ids and the list is shown', !doc.querySelector('.cc-canvas h2').id && doc.querySelector('.cc-toc').hidden === false && doc.querySelector('.cc-toc-empty').hidden === true);
    doc.querySelector('.cc-canvas h2').textContent = 'Renamed';
    const renamed = await waitFor(() => doc.querySelector('.cc-toc-item') && doc.querySelector('.cc-toc-item').textContent === 'Renamed');
    check('TABLE_OF_CONTENTS canvas: follows an edit of a heading on its own', !!renamed);
    mount(React.createElement('div', { className: 'cc-canvas' }, React.createElement(DndContext, null, React.createElement(SortableContext, { items: [tocBlock.id] }, React.createElement(SortableBlock, { block: tocBlock })))));
    await waitFor(() => doc.querySelector('.cc-toc'));
    await sleep(80);
    check('TABLE_OF_CONTENTS canvas: with no headings it stays visible with a hint, so the block can still be selected', doc.querySelector('.cc-toc').hidden === false && doc.querySelector('.cc-toc-empty').hidden === false);
  }
  // table/accordion as a control: static blocks don't capture the mouse (they get selected)
  {
    const b = addAndSelect('DIVIDER');
    mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: [b.id] }, React.createElement(SortableBlock, { block: b }))));
    await waitFor(() => doc.querySelector('.cc-divider'));
    check('DIVIDER canvas: does not capture the mouse (selects/drags normally)', doc.querySelector('.cc-divider').parentElement.style.pointerEvents === 'none');
  }

  // Every block of every starter template, in every tab, as admin: the panel must never crash.
  // Template blocks may have no "content" at all (e.g. SECTION/CONTAINER): a crash unmounts the whole app.
  console.log('\nSTARTERS — every template block opens every tab (admin)');
  {
    const starters = JSON.parse(readFileSync(path.join(PROJECT, '../canvascore-admin/starters.json'), 'utf8'));
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const panelAlive = () => $$('button').some((x) => x.textContent.trim() === 'Advanced');
    for (const stt of starters) {
      const all = [];
      const walk = (bs) => { for (const b of bs || []) { all.push(b); walk(b.children); } };
      walk(stt.blocks);
      if (!all.length) continue;
      const broken = [];
      for (const b of all) {
        useStore.setState({ blocks: structuredClone(stt.blocks), selectedBlockId: b.id, userRole: 'admin', pastBlocks: [], futureBlocks: [], activePage: { id: 'p', title: 'T', slug: 't', layout: 'boxed' }, viewport: 'desktop', masters: [], templates: [], pages: [] });
        mount(React.createElement(PropertyPanel));
        await waitFor(panelAlive);
        // layout blocks (SECTION/CONTAINER/FLEX_ROW) have no Content tab
        const tabs = ['SECTION', 'CONTAINER', 'FLEX_ROW'].includes(b.type) ? ['Style', 'Advanced'] : ['Content', 'Style', 'Advanced'];
        for (const tab of tabs) {
          const btn = $$('button').find((x) => x.textContent.trim() === tab);
          if (!btn) { broken.push(`${b.id} ${b.type} (no ${tab} tab)`); break; }
          click(btn); await tick();
          if (!panelAlive()) { broken.push(`${b.id} ${b.type} (${tab})`); break; }
        }
      }
      check(`${stt.id}: all ${all.length} blocks open every tab`, broken.length === 0, broken.join(', '));
    }
    // a SECTION with no "content" is still editable from Advanced (the write creates content)
    const cs = starters.find((s) => s.id === 'coming-soon');
    useStore.setState({ blocks: structuredClone(cs.blocks), selectedBlockId: cs.blocks[0].id, userRole: 'admin' });
    mount(React.createElement(PropertyPanel));
    click(await waitFor(() => buttonByText('Advanced'))); await tick();
    click(await waitFor(() => buttonByText('Custom Code'))); await tick();
    const idInput = await waitFor(() => field('CSS ID'));
    if (idInput) { setValue(idInput, 'launch'); await tick(); }
    const saved = st().blocks[0];
    check('content-less SECTION: setting the CSS ID in Advanced saves it', saved.content?.customId === 'launch' && saved.children.length === 1, JSON.stringify(saved.content));
  }

  // Slugs are site-wide URLs: helpers, automatic slug and the duplicate warning in Page Info
  console.log('\nSLUGS — unique site-wide');
  {
    const { slugify, slugOwner, uniqueSlug } = await vite.ssrLoadModule('/src/utils/slug.js');
    const pages = [
      { id: 'a', title: 'About', slug: 'about', clean_slug: 'about', status: 'published', is_draft_copy: 0 },
      { id: 'b', title: 'Services', slug: 'services', clean_slug: 'services', status: 'draft', is_draft_copy: 0 },
      { id: 'draft-a', title: 'About', slug: 'about', clean_slug: 'about', is_draft_copy: 1, parent_id: 'a' },
    ];
    const collections = [{ id: 'c', name: 'Blog', slug: 'blog' }];
    check('slugify: accents, spaces and symbols', slugify('  Chi Siamo & Più! ') === 'chi-siamo-piu');
    check('uniqueSlug: free slug is kept', uniqueSlug('Contact', { pages, collections }) === 'contact');
    check('uniqueSlug: taken by a page → -2', uniqueSlug('About', { pages, collections }) === 'about-2');
    check('uniqueSlug: taken by a collection → -2', uniqueSlug('Blog', { pages, collections }) === 'blog-2');
    check('uniqueSlug: system folder is never used', uniqueSlug('Uploads', { pages }) === 'uploads-2');
    check('slugOwner: a page does not conflict with itself or its draft copy',
      slugOwner('about', { pages, pageId: 'a' }) === null && slugOwner('about', { pages, pageId: 'draft-a', parentId: 'a' }) === null);
    check('slugOwner: a live page is reported as blocking', (({ label, live } = {}) => /About/.test(label) && live)(slugOwner('about', { pages, pageId: 'b' }) || undefined));
    check('slugOwner: a draft page is reported as non-blocking', (({ label, live } = {}) => /Services/.test(label) && !live)(slugOwner('services', { pages, pageId: 'n' }) || undefined));

    const tick = () => new Promise((r) => setTimeout(r, 0));
    const openPageInfo = async (activePage) => {
      useStore.setState({ blocks: [], selectedBlockId: null, pages, activePage, userRole: 'admin' });
      mount(React.createElement(PropertyPanel));
      const pageInfo = await waitFor(() => buttonByText('Page Info'));
      if (pageInfo.getAttribute('aria-expanded') !== 'true') click(pageInfo); // open by default now
      await tick();
    };
    const warning = () => $$('[role="alert"]').map((e) => e.textContent).join(' ');
    // the slug input is the one right after its label (field() would return the title input above it)
    const slugInput = () => { const lab = $$('label').find((l) => l.textContent.trim() === 'URL (Slug)'); return lab && lab.nextElementSibling; };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => new Response(JSON.stringify(String(u).includes('get_collections') ? collections : []), { status: 200 });

    await openPageInfo({ id: 'n', title: 'New Page', slug: 'new-page', status: 'draft', is_draft_copy: 0 });
    setValue(await waitFor(() => field('Internal Title')), 'About'); await tick();
    check('Page Info: typing a taken title picks the next free slug', st().activePage.slug === 'about-2', st().activePage.slug);
    check('Page Info: no warning for the automatic slug', warning() === '', warning());
    setValue(slugInput(), 'about'); await tick();
    check('Page Info: a slug used by a live page shows a blocking warning', /already used by page “About”.*cannot be published/.test(warning()), warning());
    setValue(slugInput(), 'services'); await tick();
    check('Page Info: a slug used by a draft page shows a draft warning', /page “Services” \(a draft\)/.test(warning()), warning());
    await waitFor(() => true); setValue(slugInput(), 'blog'); await tick();
    check('Page Info: a slug used by a collection shows a warning', /already used by collection “Blog”/.test(warning()), warning());
    setValue(slugInput(), 'about-us'); await tick();
    check('Page Info: a free slug clears the warning', warning() === '', warning());

    await openPageInfo({ id: 'draft-a', parent_id: 'a', title: 'About', slug: 'about', status: 'draft', is_draft_copy: 1 });
    check('Page Info: the draft copy of a page does not warn about its own slug', warning() === '', warning());
    globalThis.fetch = realFetch;
  }

  // Menu Builder: tabs, themes, stackable effects (legacy single `effect` is migrated on load)
  console.log('\nMENU BUILDER — tabs, themes, effects');
  {
    const realFetch = globalThis.fetch;
    const saved = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes('get_menu')) return new Response(JSON.stringify({ items: [{ id: 'm1', title: 'Home', url: '', children: [] }], settings: { effect: 'glare', textColor: '#111111' } }));
      if (u.includes('save_menu')) { saved.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true })); }
      return new Response(JSON.stringify({ success: true, html: '' }));
    };
    useStore.setState({ pages: [] });
    const MenuBuilder = (await vite.ssrLoadModule('/src/components/MenuBuilder.jsx')).default;
    mount(React.createElement(MenuBuilder));
    const tab = (name) => $$('[role="tab"]').find((b) => b.textContent.includes(name));
    const pressed = () => $$('button[aria-pressed="true"]').map((b) => b.textContent.trim());
    check('menu: opens on the Structure tab with the items', !!(await waitFor(() => doc.querySelector('input[placeholder="Label"]'))) && tab('Structure').getAttribute('aria-selected') === 'true');
    check('menu: six tabs (Structure, Themes, Style, Effects, Layout & Logo, Mobile)', ['Structure', 'Themes', 'Style', 'Effects', 'Layout & Logo', 'Mobile'].every((n) => !!tab(n)));
    check('menu: the Effects tab shows a count of the active effects (legacy effect migrated)', /Effects\s*1/.test(tab('Effects').textContent), tab('Effects').textContent);

    click(tab('Effects')); await waitFor(() => buttonByText('Underline'));
    check('menu: the legacy "glare" effect is shown as on', pressed().some((t) => t.includes('Glare')), pressed().join('|'));
    click(buttonByText('Underline')); await sleep(30);
    click(buttonByText('Glass')); await sleep(30);
    check('menu: effects from different groups stack', ['Glare', 'Underline', 'Glass'].every((n) => pressed().some((t) => t.includes(n))), pressed().join('|'));
    click(buttonByText('Dot')); await sleep(30);
    check('menu: in a "pick one" group the new effect replaces the old one', pressed().some((t) => t.includes('Dot')) && !pressed().some((t) => t.includes('Underline')), pressed().join('|'));
    check('menu: scroll effects warn while the bar is not sticky', /Turn on "Fixed on top"/.test(doc.body.textContent));

    click(tab('Themes')); await waitFor(() => $$('button[aria-label^="Apply the"]').length);
    check('menu: at least 10 theme cards', $$('button[aria-label^="Apply the"]').length >= 10);
    click($$('button[aria-label="Apply the Warm theme"]')[0]); await sleep(30);
    check('menu: the applied theme is marked as in use', $$('button[aria-label="Apply the Warm theme"]')[0].getAttribute('aria-pressed') === 'true');
    check('menu: an Undo bar appears', !!buttonByText('Undo'));
    click(buttonByText('Undo')); await sleep(30);
    check('menu: Undo restores the previous settings', $$('button[aria-label="Apply the Warm theme"]')[0].getAttribute('aria-pressed') === 'false' && !buttonByText('Undo'));
    click($$('button[aria-label="Apply the Midnight theme"]')[0]); await sleep(30);

    click(tab('Style')); await waitFor(() => field('FONT WEIGHT'));
    check('menu: Style tab has Items, Typography and Bar fields', !!field('TEXT COLOR') && !!field('LETTER CASE') && !!field('BAR HEIGHT'));
    setValue(field('LETTER CASE'), 'uppercase'); await sleep(30);
    click(tab('Themes')); await sleep(30);
    check('menu: customizing a value clears the "in use" mark', $$('button[aria-pressed="true"][aria-label^="Apply the"]').length === 0);

    click(tab('Mobile')); await waitFor(() => field('MOBILE BREAKPOINT'));
    check('menu: Mobile tab has breakpoint, burger icons, burger position and logo toggle', !!field('MOBILE BREAKPOINT') && $$('[aria-label="Burger icon"] button').length === 10 && !!$$('[aria-label="Burger position"]')[0] && !!checkbox('Show the logo'));
    check('menu: a legacy ☰ menu starts on the Classic icon', doc.querySelector('[aria-label="Burger icon"] button[aria-pressed="true"]')?.title === 'Classic');
    click(doc.querySelector('[aria-label="Burger icon"] button[title="Dots"]')); await sleep(30);
    click($$('[aria-label="Burger position"] button').find((b) => b.textContent === 'Left')); await sleep(30);
    click(checkbox('Show the logo')); await sleep(30);
    check('menu: picking icon, side and logo visibility updates the controls', doc.querySelector('[aria-label="Burger icon"] button[aria-pressed="true"]')?.title === 'Dots'
      && $$('[aria-label="Burger position"] button[aria-pressed="true"]')[0]?.textContent === 'Left' && checkbox('Show the logo').checked === false);
    check('menu: no custom character field unless Custom is chosen', !field('CUSTOM CHARACTER'));
    click(doc.querySelector('[aria-label="Burger icon"] button[title="Custom character"]')); await sleep(30);
    setValue(field('CUSTOM CHARACTER'), '≡'); await sleep(30);
    check('menu: Custom shows the character field', field('CUSTOM CHARACTER')?.value === '≡');
    click(doc.querySelector('button[title="Mobile"]')); await sleep(30);
    check('menu: the preview can switch to a mobile width', doc.querySelector('iframe[title="menu-preview"]').style.width === '390px');

    click(buttonByText('Save & Publish'));
    await waitFor(() => saved.length);
    const s = saved[0] && saved[0].settings;
    check('menu: saves `effects` (Midnight) + the custom letter case, without the legacy `effect` key', !!s && Array.isArray(s.effects) && s.effects.includes('glass') && s.textTransform === 'uppercase' && !('effect' in s), JSON.stringify(s && s.effects));
    check('menu: saves the mobile settings', !!s && s.burgerStyle === 'custom' && s.burgerIcon === '≡' && s.mobileBurgerSide === 'left' && s.mobileShowLogo === false, JSON.stringify(s && [s.burgerStyle, s.burgerIcon, s.mobileBurgerSide, s.mobileShowLogo]));
    globalThis.fetch = realFetch;
  }

  // The canvas uses the published pages' box model: padded full-width blocks (e.g. forms) must not overflow
  console.log('\nCANVAS — same box model as the published page');
  {
    const Canvas = (await vite.ssrLoadModule('/src/components/Canvas.jsx')).default;
    const css = readFileSync(path.join(PROJECT, 'src/ui/global.css'), 'utf8');
    const styleEl = doc.createElement('style'); styleEl.textContent = css; doc.head.appendChild(styleEl);
    const formBlock = { id: 'f1', type: 'FORM', styles: { padding: '40px', backgroundColor: '#fff', borderRadius: '12px', width: '100%' }, content: blockDefs.types.FORM.content };
    useStore.setState({ blocks: [formBlock], selectedBlockId: null, viewport: 'desktop', activePage: { id: 'p', title: 'T', slug: 't', layout: 'boxed' } });
    mount(React.createElement(Canvas));
    const form = await waitFor(() => doc.querySelector('.cc-canvas .cc-form-block'));
    check('canvas: blocks are inside .cc-canvas', !!form);
    check('canvas: padded form box uses border-box (as on the published page)', !!form && w.getComputedStyle(form).boxSizing === 'border-box', form && w.getComputedStyle(form).boxSizing);
    styleEl.remove();
  }
} catch (e) {
  failedRun = true; fails++; total++;
  console.error('  ✗ EXCEPTION: ' + ((e && e.stack) || e).toString().split('\n').slice(0, 6).join(' | '));
}

// ---------------------------------------------------------------- on-canvas handles and the right-click menu
console.log('\nCANVAS HANDLES AND MENU');
try {
  const hb = { id: 'hn1', type: 'TEXT', styles: { padding: '4px', margin: '0 auto' }, content: { text: '<p>x</p>' } };
  useStore.setState({ blocks: [hb], selectedBlockId: 'hn1', viewport: 'desktop', pastBlocks: [], futureBlocks: [], contextMenu: null });
  mount(React.createElement(DndContext, null, React.createElement(SortableContext, { items: ['hn1'] }, React.createElement(SortableBlock, { block: hb }))));
  await sleep(40);
  const at = (id) => st().blocks.find((b) => b.id === id);
  const handles = [...doc.querySelectorAll('[data-handle]')];
  check('the selected block has ten handles: margin, padding and width and height', handles.length === 10, String(handles.length));
  useStore.setState({ selectedBlockId: null }); await sleep(40);
  check('…and none on a block that is not selected', doc.querySelectorAll('[data-handle]').length === 0);
  useStore.setState({ selectedBlockId: 'hn1' }); await sleep(30);
  const pd = (id, x, y) => doc.querySelector(`[data-handle="${id}"]`).dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  const moveTo = (x, y) => w.dispatchEvent(new w.MouseEvent('pointermove', { clientX: x, clientY: y }));
  const release = () => w.dispatchEvent(new w.MouseEvent('pointerup', {}));

  pd('padding-top', 50, 100); moveTo(50, 112); release();
  check('dragging the top padding edge down 12 px: the top padding grows, the other sides keep their values', at('hn1').styles.padding === '16px 4px 4px 4px', at('hn1').styles.padding);
  pd('margin-left', 50, 100); moveTo(42, 100); release();
  check('dragging the left margin edge keeps the centring of the other side (auto)', at('hn1').styles.margin === '0 auto 0 8px', at('hn1').styles.margin);
  pd('width', 300, 200); moveTo(360, 200); release();
  check('dragging the width handle sets the width in pixels', at('hn1').styles.width === '60px', at('hn1').styles.width);
  pd('height', 300, 200); moveTo(300, 220); release();
  check('dragging the height handle sets the height in pixels', at('hn1').styles.height === '20px', at('hn1').styles.height);

  // a whole drag (several moves) is ONE undo step
  const before = at('hn1').styles.padding;
  pd('padding-right', 100, 50); moveTo(98, 50); moveTo(94, 50); moveTo(90, 50); release();
  check('a drag over several moves ends where the pointer is (the right padding follows it)', at('hn1').styles.padding === '16px 14px 4px 4px', at('hn1').styles.padding);
  st().undo();
  check('…and one undo takes back the whole drag', at('hn1').styles.padding === before, at('hn1').styles.padding);

  // the arrow keys nudge a handle (Shift: 10 px)
  const key = (id, k, shift) => doc.querySelector(`[data-handle="${id}"]`).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
  key('padding-left', 'ArrowRight', true);
  check('the arrow keys move a handle: Shift + Right moves the left padding 10 px', at('hn1').styles.padding === '16px 4px 4px 14px', at('hn1').styles.padding);
  key('padding-left', 'ArrowDown');
  check('…and an arrow along the other axis does nothing', at('hn1').styles.padding === '16px 4px 4px 14px');

  // the right-click on the block opens its menu for it
  const frame = doc.querySelector('[data-handle]').parentElement;
  frame.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
  check('right-clicking a block opens its menu for that block', st().contextMenu && st().contextMenu.blockId === 'hn1' && st().contextMenu.x === 30 && st().contextMenu.y === 40, JSON.stringify(st().contextMenu));
  st().closeContextMenu();
} catch (e) {
  failedRun = true; fails++; total++;
  console.error('  ✗ EXCEPTION (handles): ' + ((e && e.stack) || e).toString().split('\n').slice(0, 6).join(' | '));
}

try { root?.unmount(); } catch { /* noop */ }
await vite.close();
console.log(`\n${fails === 0 ? 'PANELS UI OK' : fails + ' checks failed'} (${total} checks)${failedRun ? ' — aborted by an exception' : ''}`);
process.exit(fails === 0 ? 0 : 1);
