import { __ } from '../i18n/index.js';
// Menu Builder catalog: ready-made themes and the stackable effects.
// The effect ids are rendered by render_menu_html() in canvascore-admin/compiler.php
// (CC_MENU_EFFECTS lists the same ids and groups; tests/menu.mjs keeps them in sync).

export const DEFAULT_SETTINGS = {
  align: 'flex-end', styleType: 'link', textColor: '#334155', hoverTextColor: '#3b82f6',
  hoverBgColor: 'transparent', bgColor: '#3b82f6', buttonTextColor: '#ffffff', borderRadius: '6px', itemGap: '20px',
  itemBorder: 'none', menuBgColor: 'transparent', menuBgOpacity: 100, barHeight: '64px',
  barPadding: '0 24px', isSticky: false, shadow: 'none', effects: [],
  fontSize: '15px', fontWeight: '600', textTransform: 'none', letterSpacing: '0px', highlightCurrent: false,
  logoUrl: '', logoAlign: 'left', logoHeight: '40px', logoGap: '24px', logoLink: 'index.html',
  mobileThreshold: '768', burgerIcon: '☰', burgerStyle: 'lines', mobileBurgerSide: 'right', mobileShowLogo: true,
};

// Burger icons for the mobile menu. Same SVG markup as CC_MENU_BURGERS in compiler.php
// (tests/menu.mjs compares them); 'label' adds the word "Menu", 'custom' shows the burgerIcon text.
const svgOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">';
export const BURGER_ICONS = [
  { id: 'lines', label: __("Classic"), svg: svgOpen + '<path d="M4 6h16M4 12h16M4 18h16"/></svg>' },
  { id: 'staggered', label: __("Staggered"), svg: svgOpen + '<path d="M4 6h16M4 12h12M4 18h8"/></svg>' },
  { id: 'two-lines', label: __("Two lines"), svg: svgOpen + '<path d="M4 9h16M4 15h16"/></svg>' },
  { id: 'thin', label: __("Thin"), svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' },
  { id: 'bold', label: __("Bold"), svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' },
  { id: 'dots', label: __("Dots"), svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' },
  { id: 'grid', label: __("Grid"), svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>' },
  { id: 'boxed', label: __("Boxed"), svg: svgOpen + '<rect x="2.5" y="2.5" width="19" height="19" rx="5"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h9"/></svg>' },
];
export const BURGER_STYLES = [...BURGER_ICONS.map((b) => b.id), 'label', 'custom'];

// Menus saved before the picker existed: a custom character stays, the default ☰ becomes 'lines'.
export function burgerStyleOf(s) {
  if (s && BURGER_STYLES.includes(s.burgerStyle)) return s.burgerStyle;
  const icon = String((s && s.burgerIcon) || '').trim();
  return icon && icon !== '☰' ? 'custom' : 'lines';
}

// Effects, grouped. In a "single" group only one effect can be on at a time (they animate the
// same property); "multi" groups stack freely. Effects from different groups always combine.
export const EFFECT_GROUPS = [
  {
    id: 'decor', label: __("Hover indicator"), mode: 'single', hint: __("A mark drawn on the hovered item."),
    effects: [
      { id: 'underline', label: __("Underline"), hint: __("Grows left to right") },
      { id: 'underline-center', label: __("Center underline"), hint: __("Grows from the middle") },
      { id: 'overline', label: __("Overline"), hint: __("A line above the item") },
      { id: 'highlight', label: __("Highlight"), hint: __("A soft fill rises behind the text") },
      { id: 'dot', label: __("Dot"), hint: __("A small dot under the item") },
    ],
  },
  {
    id: 'motion', label: __("Hover motion"), mode: 'single', hint: __("How the hovered item moves."),
    effects: [
      { id: 'lift', label: __("Lift"), hint: __("Moves up slightly") },
      { id: 'grow', label: __("Grow"), hint: __("Scales up a little") },
      { id: 'pop', label: __("Pop"), hint: __("Springy scale") },
    ],
  },
  {
    id: 'glow', label: __("Hover glow"), mode: 'multi', hint: __("Light around the hovered item."),
    effects: [
      { id: 'glow', label: __("Text glow"), hint: __("Glow in the hover color") },
      { id: 'halo', label: __("Shadow"), hint: __("A shadow under the item") },
    ],
  },
  {
    id: 'bar', label: __("Bar"), mode: 'multi', hint: __("Effects on the whole menu bar."),
    effects: [
      { id: 'glass', label: __("Glass"), hint: __("Blurs the page behind a see-through bar") },
      { id: 'glare', label: __("Glare"), hint: __("An animated sheen sweeps across") },
      { id: 'accent-line', label: __("Accent line"), hint: __("A colored line under the bar") },
    ],
  },
  {
    id: 'scroll', label: __("On scroll"), mode: 'multi', hint: __("Only with \"Fixed on top\" enabled."), needsSticky: true,
    effects: [
      { id: 'shrink', label: __("Shrink"), hint: __("The bar gets slimmer") },
      { id: 'hide-on-scroll', label: __("Hide on scroll down"), hint: __("Comes back when scrolling up") },
      { id: 'shadow-on-scroll', label: __("Shadow"), hint: __("Adds a shadow once scrolled") },
    ],
  },
  {
    id: 'dropdown', label: __("Submenu opening"), mode: 'single', hint: __("How dropdowns appear on desktop."),
    effects: [
      { id: 'dd-fade', label: __("Fade"), hint: __("Fades in") },
      { id: 'dd-slide', label: __("Slide"), hint: __("Fades in sliding down") },
      { id: 'dd-zoom', label: __("Zoom"), hint: __("Fades in growing") },
    ],
  },
  {
    id: 'entrance', label: __("Page load"), mode: 'single', hint: __("Played once when the page opens."),
    effects: [
      { id: 'enter-slide', label: __("Slide down"), hint: __("The bar slides in from the top") },
      { id: 'enter-fade', label: __("Fade in"), hint: __("The bar fades in") },
      { id: 'enter-stagger', label: __("Stagger"), hint: __("Items appear one after another") },
    ],
  },
];

const GROUP_OF = Object.fromEntries(EFFECT_GROUPS.flatMap((g) => g.effects.map((e) => [e.id, g])));
export const EFFECT_IDS = Object.keys(GROUP_OF);

// Valid, de-duplicated effects; in single groups the first one wins.
export function cleanEffects(list) {
  const out = []; const taken = new Set();
  for (const id of Array.isArray(list) ? list : []) {
    const g = GROUP_OF[id];
    if (!g || out.includes(id)) continue;
    if (g.mode === 'single') { if (taken.has(g.id)) continue; taken.add(g.id); }
    out.push(id);
  }
  return out;
}

// Turns an effect on/off; turning one on in a single group replaces its sibling.
export function toggleEffect(list, id) {
  const cur = cleanEffects(list);
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  const g = GROUP_OF[id];
  if (!g) return cur;
  const kept = g.mode === 'single' ? cur.filter((x) => GROUP_OF[x] !== g) : cur;
  return [...kept, id];
}

// Settings saved before effects could be combined had a single `effect` string.
export function normalizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const legacy = s && s.effect && s.effect !== 'none' ? [s.effect] : [];
  out.effects = cleanEffects(Array.isArray(s && s.effects) ? s.effects : legacy);
  out.burgerStyle = burgerStyleOf(s);
  delete out.effect;
  return out;
}

// What a theme controls: colors, item shape, typography, bar look and effects.
// Structure, logo, alignment, sticky and mobile settings are left as they are.
export const THEME_KEYS = ['styleType', 'textColor', 'hoverTextColor', 'hoverBgColor', 'bgColor', 'buttonTextColor',
  'borderRadius', 'itemGap', 'itemBorder', 'menuBgColor', 'menuBgOpacity', 'barHeight', 'shadow', 'effects',
  'fontSize', 'fontWeight', 'textTransform', 'letterSpacing'];

const base = {
  styleType: 'link', hoverBgColor: 'transparent', bgColor: '#3b82f6', buttonTextColor: '#ffffff', borderRadius: '6px',
  itemGap: '20px', itemBorder: 'none', menuBgOpacity: 100, barHeight: '64px', shadow: 'none', effects: [],
  fontSize: '15px', fontWeight: '600', textTransform: 'none', letterSpacing: '0px',
};
const theme = (id, name, description, values) => ({ id, name, description, settings: { ...base, ...values } });

export const THEMES = [
  theme('classic', __("Classic"), __("White bar, dark text, blue underline."), {
    menuBgColor: '#ffffff', textColor: '#1f2937', hoverTextColor: '#2563eb', shadow: 'soft',
    effects: ['underline', 'dd-fade'],
  }),
  theme('professional', __("Professional"), __("Deep navy bar with crisp light items."), {
    menuBgColor: '#0f172a', textColor: '#cbd5e1', hoverTextColor: '#ffffff', hoverBgColor: '#1e293b',
    borderRadius: '6px', itemGap: '8px', barHeight: '68px', shadow: 'medium', fontWeight: '500',
    effects: ['dd-slide'],
  }),
  theme('fresh', __("Fresh"), __("Mint background with green pill buttons."), {
    styleType: 'pill', menuBgColor: '#f0fdf4', textColor: '#14532d', hoverTextColor: '#ffffff', hoverBgColor: '#15803d',
    bgColor: '#22c55e', itemGap: '10px', shadow: 'soft', effects: ['grow', 'dd-slide'],
  }),
  theme('warm', __("Warm"), __("Cream tones with an orange accent."), {
    menuBgColor: '#fff7ed', textColor: '#7c2d12', hoverTextColor: '#ea580c', itemGap: '26px', shadow: 'soft',
    effects: ['underline-center', 'accent-line', 'dd-fade'],
  }),
  theme('midnight', __("Midnight"), __("Dark glass bar with golden highlights."), {
    menuBgColor: '#111827', menuBgOpacity: 88, textColor: '#d1d5db', hoverTextColor: '#fbbf24', shadow: 'strong',
    letterSpacing: '0.3px', effects: ['glass', 'glow', 'dot', 'dd-fade'],
  }),
  theme('minimal', __("Minimal"), __("No background, airy spacing, quiet details."), {
    menuBgColor: 'transparent', textColor: '#111111', hoverTextColor: '#6b7280', itemGap: '34px', fontWeight: '500',
    fontSize: '14px', effects: ['overline'],
  }),
  theme('ocean', __("Ocean"), __("Blue bar with rounded box buttons."), {
    styleType: 'box', menuBgColor: '#0c4a6e', textColor: '#e0f2fe', hoverTextColor: '#ffffff', hoverBgColor: '#0369a1',
    bgColor: '#0284c7', borderRadius: '8px', itemGap: '10px', shadow: 'medium', effects: ['lift', 'halo', 'dd-slide'],
  }),
  theme('sunset', __("Sunset"), __("Vivid purple with pink pills and a sheen."), {
    styleType: 'pill', menuBgColor: '#6d28d9', textColor: '#f5f3ff', hoverTextColor: '#ffffff', hoverBgColor: '#db2777',
    bgColor: '#ec4899', itemGap: '10px', shadow: 'medium', effects: ['glare', 'pop', 'dd-zoom'],
  }),
  theme('earth', __("Earth"), __("Natural paper tones with an olive highlight."), {
    menuBgColor: '#f5f5f0', textColor: '#3f3f2e', hoverTextColor: '#4d7c0f', borderRadius: '4px', itemGap: '14px',
    itemBorder: 'none', shadow: 'soft', effects: ['highlight', 'dd-fade'],
  }),
  theme('pastel', __("Pastel"), __("Soft pink with gentle rounded buttons."), {
    styleType: 'pill', menuBgColor: '#fdf2f8', textColor: '#831843', hoverTextColor: '#831843', hoverBgColor: '#f9a8d4',
    bgColor: '#fbcfe8', buttonTextColor: '#831843', itemGap: '10px', effects: ['lift', 'dd-zoom'],
  }),
  theme('bold', __("Bold"), __("Black and white, uppercase, square edges."), {
    styleType: 'box', menuBgColor: '#000000', textColor: '#ffffff', hoverTextColor: '#000000', hoverBgColor: '#ffffff',
    bgColor: '#000000', borderRadius: '0px', itemGap: '4px', barHeight: '72px', textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: '700', fontSize: '13px', itemBorder: '1px solid #ffffff', effects: ['enter-stagger', 'dd-slide'],
  }),
  theme('corporate', __("Corporate"), __("Light gray bar, slate text, teal accent."), {
    menuBgColor: '#f8fafc', textColor: '#334155', hoverTextColor: '#0f766e', itemGap: '24px', barHeight: '72px',
    shadow: 'soft', effects: ['underline', 'accent-line', 'shadow-on-scroll', 'dd-slide'],
  }),
];

// Applies a theme on top of the current settings, keeping everything a theme doesn't control.
export const applyTheme = (settings, t) => ({ ...settings, ...t.settings, effects: [...t.settings.effects] });

// The theme whose values the settings still match exactly (null once anything was customized).
export function matchingTheme(settings) {
  const same = (k, a, b) => (k === 'effects'
    ? JSON.stringify([...cleanEffects(a)].sort()) === JSON.stringify([...cleanEffects(b)].sort())
    : String(a) === String(b));
  return THEMES.find((t) => THEME_KEYS.every((k) => same(k, t.settings[k], settings[k]))) || null;
}
