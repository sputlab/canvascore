// Button and field styles (Global Options › Buttons & fields), reused across blocks.
// Button presets (Primary, Secondary, Outline) are sets of background, text colour, border colour and corner radius;
// a button that picks one (content.preset) gets them as CSS variables (--cc-btn-<id>-<prop>), so every button using a
// preset follows it when it changes. The field style (--cc-field-<prop>) is the background, border and radius of the
// form inputs of the site (forms, wizards, newsletter sign-ups and site search). A value that is not set keeps the
// built-in look. Mirrors cc_kit(), cc_kit_css() and cc_button_preset_css() in config.php and compiler.php.

export const BUTTON_PRESETS = [['primary', 'Primary'], ['secondary', 'Secondary'], ['outline', 'Outline']];
export const BUTTON_IDS = BUTTON_PRESETS.map(([id]) => id);
export const BUTTON_PROPS = ['bg', 'text', 'border', 'radius'];
export const FIELD_PROPS = ['bg', 'border', 'radius'];
// The built-in look of each preset (used when the site has not set a value)
const BUTTON_DEFAULTS = {
  primary: { bg: 'var(--brand-color, #3b82f6)', text: '#ffffff', border: 'transparent', radius: '6px' },
  secondary: { bg: '#0f172a', text: '#ffffff', border: 'transparent', radius: '6px' },
  outline: { bg: 'transparent', text: 'var(--brand-color, #3b82f6)', border: 'var(--brand-color, #3b82f6)', radius: '6px' },
};
const CSS_NAME = { bg: 'bg', text: 'text', border: 'border', radius: 'radius' };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// A global colour reference, as the palette writes it: var(--cc-color-<id>, #hex) (or the brand colour)
const REF_RE = /^var\(--(?:brand-color|cc-color-[a-z][a-z0-9-]{0,31})(?:\s*,\s*(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}))?\)$/;
const RADIUS_RE = /^\d{1,3}(\.\d{1,2})?(px|rem|em|%)?$/;

// One value of one property, or '' when it is not valid
export function cleanKitValue(prop, v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (prop === 'radius') return RADIUS_RE.test(s) ? s : '';
  if (s === 'transparent') return s;
  if (HEX_RE.test(s)) return s.toLowerCase();
  return REF_RE.test(s) ? s : '';
}

// The tidy form of the saved styles: { buttons: { primary: { bg, text, border, radius } }, field: { bg, border, radius } }
export function normalizeKit(settings) {
  const st = settings && typeof settings === 'object' ? settings : {};
  const pick = (src, props) => {
    const o = {};
    if (src && typeof src === 'object') for (const k of props) { const v = cleanKitValue(k, src[k]); if (v) o[k] = v; }
    return o;
  };
  const buttons = {};
  const rawButtons = st.buttonStyles && typeof st.buttonStyles === 'object' ? st.buttonStyles : {};
  for (const id of BUTTON_IDS) { const o = pick(rawButtons[id], BUTTON_PROPS); if (Object.keys(o).length) buttons[id] = o; }
  const field = pick(st.fieldStyle, FIELD_PROPS);
  return { buttons, field };
}

// The declarations of a button that picks a preset (empty for an unknown preset). The values are variables, so the
// preset's own values, and the built-in look when there are none, both come from one place.
export function buttonPresetCss(id) {
  if (!BUTTON_IDS.includes(id)) return '';
  const d = BUTTON_DEFAULTS[id];
  return `background: var(--cc-btn-${id}-bg, ${d.bg}); color: var(--cc-btn-${id}-text, ${d.text}); `
    + `border: 2px solid var(--cc-btn-${id}-border, ${d.border}); border-radius: var(--cc-btn-${id}-radius, ${d.radius}); `;
}

// The variables for a scope: ':root' on published pages, '.cc-canvas' in the editor. Only the values that are set.
export function kitCss(kit, scope) {
  const vars = [];
  for (const id of BUTTON_IDS) {
    const v = (kit.buttons || {})[id] || {};
    for (const p of BUTTON_PROPS) if (v[p]) vars.push(`--cc-btn-${id}-${CSS_NAME[p]}: ${v[p]};`);
  }
  for (const p of FIELD_PROPS) if ((kit.field || {})[p]) vars.push(`--cc-field-${CSS_NAME[p]}: ${kit.field[p]};`);
  return vars.length ? `${scope}{${vars.join(' ')}}` : '';
}

