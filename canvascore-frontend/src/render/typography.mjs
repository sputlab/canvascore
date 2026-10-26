// Text styles (Global Options › Text styles): named presets for the headings H1–H6, body text, small text and
// buttons, each with a font, size, weight and line height. Tablet and phone values are overrides of the desktop ones
// (the same model as the blocks' styles per device). Every value is a CSS variable, --cc-type-<preset>-<prop>, so a
// block that picks a preset (styles.textPreset) follows the text styles when they change, and the site's own h1–h6,
// body, small and button elements are styled by the same rules. Mirrors cc_typography(), cc_type_css() and
// cc_with_text_preset() in config.php and compiler.php.

import { __ } from '../i18n/index.js';

// [id, label, the element or class the preset styles on the site]
export const TYPE_PRESETS = [
  ['h1', __("Heading 1"), 'h1'], ['h2', __("Heading 2"), 'h2'], ['h3', __("Heading 3"), 'h3'], ['h4', __("Heading 4"), 'h4'],
  ['h5', __("Heading 5"), 'h5'], ['h6', __("Heading 6"), 'h6'], ['body', __("Body"), 'body'], ['small', __("Small"), 'small'], ['button', __("Button"), '.cc-btn'],
];
export const TYPE_IDS = TYPE_PRESETS.map(([id]) => id);
// The fonts a preset can use: the Google Fonts the site loads (the same list as the site font)
export const TYPE_FONTS = ['Inter', 'Roboto', 'Poppins', 'Open Sans', 'Montserrat', 'Lato', 'Oswald', 'Playfair Display', 'Raleway', 'Ubuntu', 'Lora'];
// The weights the Google Fonts links load
export const TYPE_WEIGHTS = ['300', '400', '600', '700', '900'];
export const TYPE_PROPS = ['font', 'size', 'weight', 'lineHeight'];
const CSS_PROP = { font: 'font-family', size: 'font-size', weight: 'font-weight', lineHeight: 'line-height' };
const SHORT = { font: 'font', size: 'size', weight: 'weight', lineHeight: 'line' };
export const TABLET_MAX_TYPE = 1024;
export const MOBILE_MAX_TYPE = 767;

const SIZE_RE = /^\d{1,5}(\.\d+)?(px|%|rem|em|vw)?$/;
const LINE_RE = /^\d{1,2}(\.\d{1,2})?(px|rem|em)?$/;
// One value of one property, or '' when it is not valid
export function cleanTypeValue(prop, v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (prop === 'font') return TYPE_FONTS.includes(s) ? s : '';
  if (prop === 'weight') return TYPE_WEIGHTS.includes(s) ? s : '';
  if (prop === 'size') return SIZE_RE.test(s) ? s : '';
  return LINE_RE.test(s) ? s : '';
}

// The tidy form of settings.typography: { h1: { font, size, weight, lineHeight, tablet: {...}, mobile: {...} } },
// only the presets and values that are set
export function normalizeTypography(settings) {
  const raw = settings && typeof settings.typography === 'object' && settings.typography ? settings.typography : {};
  const pick = (src) => {
    const o = {};
    if (src && typeof src === 'object') for (const k of TYPE_PROPS) { const v = cleanTypeValue(k, src[k]); if (v) o[k] = v; }
    return o;
  };
  const out = {};
  for (const id of TYPE_IDS) {
    const p = raw[id];
    const base = pick(p);
    for (const d of ['tablet', 'mobile']) { const o = pick(p && p[d]); if (Object.keys(o).length) base[d] = o; }
    if (Object.keys(base).length) out[id] = base;
  }
  return out;
}

// The values a preset has on a device: the desktop ones, then the tablet overrides, then (phone) the phone overrides
export function typeValuesFor(preset, device) {
  const p = preset || {};
  const out = {};
  for (const k of TYPE_PROPS) if (p[k]) out[k] = p[k];
  if (device === 'tablet' || device === 'mobile') for (const k of TYPE_PROPS) if (p.tablet && p.tablet[k]) out[k] = p.tablet[k];
  if (device === 'mobile') for (const k of TYPE_PROPS) if (p.mobile && p.mobile[k]) out[k] = p.mobile[k];
  return out;
}

const varValue = (prop, v) => (prop === 'font' ? `'${v}', sans-serif` : v);
const typeVar = (id, prop) => `--cc-type-${id}-${SHORT[prop]}`;

// A block's styles with its text preset applied: the preset's properties as variables, under the block's own values
// (a value the block sets, or a tablet/phone override, wins; an emptied field falls back to the preset)
export function withTextPreset(styles) {
  const s = styles && typeof styles === 'object' ? styles : {};
  const { textPreset, ...rest } = s;
  if (!TYPE_IDS.includes(textPreset)) return rest;
  const ref = {
    fontFamily: `var(${typeVar(textPreset, 'font')})`,
    fontSize: `var(${typeVar(textPreset, 'size')})`,
    fontWeight: `var(${typeVar(textPreset, 'weight')})`,
    lineHeight: `var(${typeVar(textPreset, 'lineHeight')})`,
  };
  const out = { ...ref };
  for (const [k, v] of Object.entries(rest)) {
    if (k in ref && (v === '' || v === null || v === undefined)) continue;
    out[k] = v;
  }
  return out;
}

// The text styles as CSS for the editor canvas (.cc-canvas), for one device: the values that device gets, without media
// queries (the canvas shows one device at a time, whatever the window's width)
export function typeCanvasCss(typography, device) {
  const vars = [];
  const rules = [];
  for (const [id, , target] of TYPE_PRESETS) {
    const v = typeValuesFor((typography || {})[id], device);
    const decl = [];
    for (const k of TYPE_PROPS) {
      if (!v[k]) continue;
      vars.push(`${typeVar(id, k)}: ${varValue(k, v[k])};`);
      decl.push(`${CSS_PROP[k]}: var(${typeVar(id, k)});`);
    }
    if (decl.length) rules.push(`${target === 'body' ? '.cc-canvas' : `.cc-canvas ${target}`}{${decl.join(' ')}}`);
  }
  return vars.length ? `.cc-canvas{${vars.join(' ')}}${rules.join('')}` : '';
}

// The Google Fonts a site with these text styles loads, beside the site font
export function typeFontsUsed(typography) {
  const out = [];
  for (const id of TYPE_IDS) {
    const f = (typography || {})[id] && (typography || {})[id].font;
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}
