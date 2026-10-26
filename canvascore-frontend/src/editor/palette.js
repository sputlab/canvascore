import { __ } from '../i18n/index.js';
// Global colours (Global Options): a named palette in the settings ("colors": [{id, name, value}]). Each colour is
// a CSS variable, --cc-color-<id>, on published pages and in the editor. A field that uses one stores a reference,
// var(--cc-color-<id>, <its value when chosen>): change the palette and the whole site follows; the value after the
// comma is only a fallback. "primary" is the brand colour (brandColor, --brand-color). Mirrors cc_palette() in config.php.
export const DEFAULT_COLORS = [['primary', __("Primary"), '#3b82f6'], ['secondary', __("Secondary"), '#0f172a'], ['accent', __("Accent"), '#f59e0b'],
  ['text', __("Text"), '#0f172a'], ['background', __("Background"), '#ffffff']];
export const BUILT_IN_IDS = DEFAULT_COLORS.map(([id]) => id);

const REF_RE = /^var\(--(brand-color|cc-color-([a-z][a-z0-9-]{0,31}))(?:\s*,\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}))?\)$/;
export const paletteHex = (v) => { const s = String(v ?? '').trim(); return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s.toLowerCase() : null; };

export function normalizePalette(settings) {
  const st = settings && typeof settings === 'object' ? settings : {};
  const saved = new Map();
  for (const c of Array.isArray(st.colors) ? st.colors : []) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? '').trim().toLowerCase();
    const value = paletteHex(c.value);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || !value || saved.has(id) || saved.size >= 40) continue;
    saved.set(id, { id, name: String(c.name ?? '').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 40), value }); // eslint-disable-line no-control-regex
  }
  const out = [];
  for (const [id, name, value] of DEFAULT_COLORS) {
    const c = saved.get(id) || { id, name, value };
    if (id === 'primary' && !saved.has('primary') && paletteHex(st.brandColor)) c.value = paletteHex(st.brandColor);
    out.push({ ...c, name: c.name || name });
    saved.delete(id);
  }
  for (const c of saved.values()) out.push({ ...c, name: c.name || c.id.charAt(0).toUpperCase() + c.id.slice(1) });
  return out;
}

// The palette as CSS custom properties, for a React style object
export const paletteVars = (palette) => Object.fromEntries((palette || []).map((c) => [`--cc-color-${c.id}`, c.value]));
export const paletteCss = (palette) => (palette || []).map((c) => `--cc-color-${c.id}: ${c.value};`).join(' ');

// A field's value that points to a global colour: var(--cc-color-<id>, fallback)
export const colorRef = (c) => `var(--cc-color-${c.id}, ${c.value})`;
export function parseColorRef(v) {
  const m = REF_RE.exec(String(v ?? '').trim());
  if (!m) return null;
  return { id: m[1] === 'brand-color' ? 'primary' : m[2], fallback: m[3] || '' };
}
// What a value looks like on screen: the palette colour it points to, or the value itself
export function resolveColor(v, palette) {
  const ref = parseColorRef(v);
  if (!ref) return v;
  const c = (palette || []).find((x) => x.id === ref.id);
  return c ? c.value : (ref.fallback || '');
}

// A free id for a new custom colour, from its name
export function newColorId(name, palette) {
  const base = (String(name || 'colour').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'colour').replace(/^[^a-z]+/, '') || 'colour';
  const taken = new Set((palette || []).map((c) => c.id));
  let id = base.slice(0, 28), n = 2;
  while (taken.has(id)) id = `${base.slice(0, 26)}-${n++}`;
  return id;
}
