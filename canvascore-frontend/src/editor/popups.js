// Popups in the editor: the defaults, how a popup is described in words (the list and the panel), the starters, and the preview's HTML.
// The server (canvascore-admin/popups.php) checks every setting again; this is the twin of its defaults.
import { newBlockId } from '../store/useStore';
import { renderBlock } from '../render/renderBlock.mjs';

export const POSITIONS = [['center', 'Centered (a dialog)'], ['bottom-right', 'Corner: bottom right'], ['bottom-left', 'Corner: bottom left'], ['top-bar', 'Bar across the top'], ['bottom-bar', 'Bar across the bottom']];
export const ANIMATIONS = [['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['none', 'None']];
export const FREQUENCIES = [['always', 'Every time it is due'], ['session', 'Once per visit (browser session)'], ['days', 'Again after some days'], ['once', 'Only once per visitor']];

export const defaultSettings = () => ({
  look: { position: 'center', width: 520, animation: 'fade', overlay: true, overlayColor: '#0f172a', overlayOpacity: 60, background: '#ffffff', radius: 16, padding: 28, closeButton: true, closeOverlay: true, closeEsc: true },
  triggers: { time: { on: true, seconds: 5 }, scroll: { on: false, percent: 50 }, exit: { on: false }, click: true },
  rules: { where: { mode: 'all', pages: [], collections: [] }, devices: { desktop: true, tablet: true, mobile: true }, visitor: 'all', frequency: { mode: 'days', days: 7 }, schedule: { from: '', to: '' }, priority: 10 },
});
// settings from the server (or older ones) with every missing value filled in
export function withDefaults(s) {
  const d = defaultSettings(); const x = s && typeof s === 'object' ? s : {};
  const m = (a, b) => ({ ...a, ...(b && typeof b === 'object' ? b : {}) });
  return {
    look: m(d.look, x.look),
    triggers: { time: m(d.triggers.time, x.triggers && x.triggers.time), scroll: m(d.triggers.scroll, x.triggers && x.triggers.scroll), exit: m(d.triggers.exit, x.triggers && x.triggers.exit), click: !x.triggers || x.triggers.click !== false },
    rules: { ...m(d.rules, x.rules), where: m(d.rules.where, x.rules && x.rules.where), devices: m(d.rules.devices, x.rules && x.rules.devices), frequency: m(d.rules.frequency, x.rules && x.rules.frequency), schedule: m(d.rules.schedule, x.rules && x.rules.schedule) },
  };
}

// "After 5 s", "At 50% scroll", "Exit intent": what makes it show
export function triggerSummary(s) {
  const t = withDefaults(s).triggers; const out = [];
  if (t.time.on) out.push(t.time.seconds > 0 ? `After ${t.time.seconds} s` : 'At once');
  if (t.scroll.on) out.push(`At ${t.scroll.percent}% scroll`);
  if (t.exit.on) out.push('Exit intent');
  if (!out.length) out.push(t.click ? 'Only from a link' : 'No trigger');
  return out.join(' · ');
}
// "Everywhere", "On 3 pages", "Everywhere except 2 pages", "Once a week"…
export function rulesSummary(s) {
  const r = withDefaults(s).rules; const bits = [];
  const n = r.where.pages.length + r.where.collections.length;
  const things = `${r.where.pages.length ? `${r.where.pages.length} page${r.where.pages.length === 1 ? '' : 's'}` : ''}${r.where.pages.length && r.where.collections.length ? ' and ' : ''}${r.where.collections.length ? `${r.where.collections.length} collection${r.where.collections.length === 1 ? '' : 's'}` : ''}`;
  bits.push(r.where.mode === 'all' ? 'Everywhere' : r.where.mode === 'include' ? (n ? `Only on ${things}` : 'Nowhere yet') : (n ? `Everywhere except ${things}` : 'Everywhere'));
  const f = r.frequency;
  bits.push(f.mode === 'always' ? 'Every time' : f.mode === 'session' ? 'Once per visit' : f.mode === 'once' ? 'Once per visitor' : (f.days === 1 ? 'Once a day' : f.days === 7 ? 'Once a week' : `Every ${f.days} days`));
  const off = ['desktop', 'tablet', 'mobile'].filter((k) => r.devices[k] === false);
  if (off.length) bits.push(`Not on ${off.join(', ')}`);
  if (r.visitor !== 'all') bits.push(r.visitor === 'new' ? 'New visitors' : 'Returning visitors');
  if (r.schedule.from || r.schedule.to) bits.push(`${r.schedule.from || '…'} → ${r.schedule.to || '…'}`);
  return bits.join(' · ');
}

// A block with the defaults the Add panel gives it (the same as the store's addBlock), for the starters
function makeBlock(type, content = {}, styles = {}) {
  const defs = (typeof __BLOCK_DEFS__ !== 'undefined') ? __BLOCK_DEFS__ : { _baseStyles: {}, types: {} };
  const def = defs.types[type] || {};
  const b = { id: newBlockId(), type, content: { ...(def.content ? JSON.parse(JSON.stringify(def.content)) : {}), ...content }, styles: { ...(defs._baseStyles || {}), ...(def.styles || {}), ...styles } };
  return b;
}
export const STARTERS = [
  { id: 'blank', name: 'Blank', description: 'An empty popup: add the blocks you want.', blocks: () => [] },
  { id: 'newsletter', name: 'Newsletter', description: 'A heading and a sign-up box.', blocks: () => [
    makeBlock('TEXT', { text: '<h2 style="text-align:center">Stay in the loop</h2><p style="text-align:center">One short email when there is something new. No spam.</p>' }),
    makeBlock('NEWSLETTER', { title: '', text: '', layout: 'plain', formLayout: 'stacked' }),
  ] },
  { id: 'offer', name: 'Offer', description: 'A heading, a line of text and a button.', blocks: () => [
    makeBlock('TEXT', { text: '<h2 style="text-align:center">10% off your first order</h2><p style="text-align:center">Use the button below and the discount is applied for you.</p>' }),
    makeBlock('BUTTON', { text: 'Get the offer', url: '#' }),
  ] },
];

// The popup as the visitors will see it, open: for the preview in the editor (the same structure and style sheet as the published one)
export function popupPreviewHtml(blocks, settingsIn, name = 'Popup', safe = (h) => h) {
  const s = withDefaults(settingsIn).look;
  const hex = /^#[0-9a-f]{6}$/i.test(s.overlayColor) ? s.overlayColor : '#0f172a';
  const rgba = `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${Math.round(s.overlayOpacity) / 100})`;
  const inner = (blocks || []).map((b) => renderBlock(b)).join('').replace(/\{\{BASE_URL\}\}canvascore-blocks\//g, '../canvascore-blocks/').replace(/\{\{BASE_URL\}\}/g, '#');
  const center = s.position === 'center';
  return {
    className: `cc-popup cc-popup--${s.position} cc-popup--${s.animation} is-open`,
    style: { '--cc-pop-w': `${s.width}px`, '--cc-pop-bg': s.background, '--cc-pop-radius': `${s.radius}px`, '--cc-pop-pad': `${s.padding}px`, '--cc-pop-ov': rgba },
    overlay: center && s.overlay, closeButton: s.closeButton, label: name, content: safe(inner),
  };
}
