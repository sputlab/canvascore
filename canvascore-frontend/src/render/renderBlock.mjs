// canvascore-frontend/src/render/renderBlock.mjs
// CANONICAL block renderer, in plain JS (no React/DOM dependency).
// It is the single rendering contract: it must produce the SAME HTML as compiler.php.
// Parity is checked automatically by tests/parity.mjs (npm run test:parity).
//
// Note: rich-text content (text/title/subtitle/items...) is passed through here
// AS IS. XSS sanitization happens server-side in the compiler; in the parity
// test the inner content is normalized, so it does not affect the comparison
// of structure and styles.

import { effectClasses, buttonHover } from './effects.mjs';
import { ccPlain } from './blockRuntime.mjs';
import { withTextPreset } from './typography.mjs';
import { buttonPresetCss } from './kit.mjs';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// An image address: http(s), a relative or root path, or an inline raster image; any other scheme -> ''.
// Mirrors cc_img_url() / cc_css_url() in compiler.php.
export function ccImgUrl(u) {
  const s = String(u ?? '').trim();
  // eslint-disable-next-line no-control-regex -- browsers ignore control characters in a URL scheme
  const probe = s.replace(/[\x00-\x20\x7f]+/g, '').toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:/.test(probe) && !/^(https?:|data:image\/(png|jpe?g|gif|webp|avif);)/.test(probe)) return '';
  return s;
}
export function ccCssUrl(u) {
  return ccImgUrl(u).replace(/'/g, '%27').replace(/"/g, '%22').replace(/\\/g, '%5C').replace(/\(/g, '%28').replace(/\)/g, '%29')
    .replace(/[\n\r]/g, '').replace(/</g, '%3C').replace(/>/g, '%3E');
}

// Whole number within [min, max] (default when missing or not a number). Mirrors cc_int() in compiler.php.
export function ccInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
const FORM_TYPES = ['text', 'email', 'textarea', 'number', 'tel', 'url', 'date'];

// Mirrors the compiler's build_inline_style(): camelCase -> kebab, skips '' and 'animation'.
// Property names must look like CSS properties (a crafted key can't break out of the style attribute).
export function buildInlineStyle(styles) {
  if (!styles || typeof styles !== 'object') return '';
  let str = '';
  for (const k of Object.keys(styles)) {
    const v = styles[k];
    if (v === '' || v === null || v === undefined || k === 'animation') continue;
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(k) || typeof v === 'object') continue;
    if (/[;{}<>\\]|expression\s*\(|javascript:|vbscript:/i.test(String(v))) continue;   // mirrors build_inline_style()
    const kebab = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    str += `${kebab}: ${escapeHtml(v)}; `;
  }
  return str;
}

function resolveInternalUrl(url) {
  if (!url) return '#';
  if (/^(?:f|ht)tps?:\/\//i.test(url) || url === '#') return url;
  if (url === 'index.html' || url === 'index/index.html' || url === 'home/index.html' || url === '/') {
    return '{{BASE_URL}}';
  }
  const clean = url.replace(/index\/index\.html|index\.html/g, '');
  return '{{BASE_URL}}' + clean.replace(/^\/+/, '');
}

// Canonical root of a block (single source shared editor<->compiler for containers).
// Returns tag + id + className + style (camelCase object, ready for React).
export function blockRoot(block) {
  const styles = withTextPreset(block.styles);   // the block's text style (Style tab) under its own values
  const content = block.content || {};
  const id = block.id ? String(block.id).replace(/[^a-zA-Z0-9_-]/g, '') : 'b_x';
  const innerId = content.customId ? String(content.customId).replace(/[^a-zA-Z0-9_-]/g, '') : id;
  const animClass = effectClasses(styles, content);
  // a React className here (editor containers): only class-name characters
  const innerClass = content.customClass ? ' ' + String(content.customClass).replace(/[^A-Za-z0-9_\s-]/g, '') : '';
  switch (block.type) {
    case 'SECTION':   return { tag: 'section', id: innerId, className: `cc-section${animClass}${innerClass}`, style: { ...styles } };
    case 'CONTAINER': return { tag: 'div', id: innerId, className: `cc-container${animClass}${innerClass}`, style: { ...styles } };
    case 'FLEX_ROW':  return { tag: 'div', id: innerId, className: `cc-flex-row${animClass}${innerClass}`, style: { ...styles } };
    case 'CSS_GRID': {
      const columns = ccInt(content.columns, 2, 1, 12);
      const gap = content.gap ?? '20px';
      return { tag: 'div', id: innerId, className: `cc-css-grid${animClass}${innerClass}`, style: { ...styles, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, overflow: 'hidden' } };
    }
    default: return null;
  }
}

// URL for block links (mirror of the compiler's cc_block_url; mailto:/tel: left intact)
function resolveBlockUrl(url) {
  url = String(url ?? '').trim();
  if (url === '') return '#';
  if (url === '#' || /^(?:f|ht)tps?:\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) return url;
  if (url === 'index.html' || url === 'index/index.html' || url === 'home/index.html' || url === '/') return '{{BASE_URL}}';
  const clean = url.replace(/index\/index\.html|index\.html/g, '');
  return '{{BASE_URL}}' + clean.replace(/^\/+/, '');
}

function toInt(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

// ---- helpers shared by the "content" blocks (twins of cc_* in compiler.php) ----
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-zA-Z0-9-]+(?:,\s*[#0-9a-zA-Z.,%()\s-]+)?\))$/;
function ccColor(v, d) { v = String(v ?? '').trim(); if (v === '') return d; return COLOR_RE.test(v) ? v : d; }
const ccIsNum = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
function ccNum(v, min, max, d) { return ccIsNum(v) ? Math.max(min, Math.min(max, Number(v))) : d; }
function ccFmtNum(v, dec) {
  // Same explicit rounding as the PHP compiler (cc_fmt_num).
  v = Number(v);
  const m = 10 ** dec;
  let r = Math.floor(Math.abs(v) * m + 0.5 + 1e-9) / m;
  if (v < 0) r = -r;
  if (r === 0) r = 0;
  const parts = r.toFixed(dec).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
function ccExtUrl(v) {
  v = String(v ?? '').trim();
  if (v === '') return '';
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://' + v.replace(/^\/+/, '');
}
function ccLines(s) { return String(s ?? '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter((l) => l !== ''); }
function ccBr(s) { return ccLines(s).map(escapeHtml).join('<br>'); }
function ccInitials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => [...p][0]).join('');
}
// A content value as text, cast the way PHP does (objects/arrays/null -> '', booleans -> '1' / ''). Twin of cc_str() / cc_esc().
function ccStr(v) { if (v === null || v === undefined || typeof v === 'object') return ''; if (typeof v === 'boolean') return v ? '1' : ''; return String(v); }
function ccEsc(v) { return escapeHtml(ccStr(v)); }
function ccEnc(s) { return encodeURIComponent(String(s ?? '')).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }

// Share Bar networks, in the order they are shown: [id, label, glyph, brand color]. The glyph is a short badge text
// (social networks) or an inline icon. Twin of CC_SHARE_NETS in compiler.php.
const SHARE_ICON = (paths) => `<svg class="cc-share-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const SHARE_NETS = [
  ['facebook', 'Facebook', 'f', '#1877f2'], ['x', 'X', 'X', '#000000'], ['linkedin', 'LinkedIn', 'in', '#0a66c2'],
  ['whatsapp', 'WhatsApp', 'W', '#25d366'], ['telegram', 'Telegram', 'T', '#229ed9'],
  ['email', 'Email', SHARE_ICON('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'), '#475569'],
  ['copy', 'Copy link', SHARE_ICON('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'), '#475569'],
  ['print', 'Print', SHARE_ICON('<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'), '#475569'],
  ['share', 'Share', SHARE_ICON('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>'), '#475569'],
];
// Multi-step Form field types: the Form block's, plus choices. Twin of CC_WIZARD_TYPES in compiler.php.
const WIZARD_TYPES = ['text', 'email', 'textarea', 'number', 'tel', 'url', 'date', 'select', 'radio', 'checkboxes', 'consent'];
const WZ_INPUT = 'width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 8px); font:inherit; background:var(--cc-field-bg, #fff); color:#0f172a; box-sizing:border-box;';
const WZ_BTN = 'padding:12px 24px; border-radius:8px; font:700 15px/1 inherit; cursor:pointer;';
// An amount: rounded half up at `dec` decimals, thousands separators, "1,234.56" or "1.234,56" (eu), the currency before
// or after (with a no-break space). Twin of cc_money() in compiler.php and of money() in blockRuntime.mjs.
function ccMoney(v, dec, eu, cur, after) {
  let s = ccFmtNum(v, dec);
  if (eu) s = s.replace(/[,.]/g, (ch) => (ch === ',' ? '.' : ','));
  return after ? s + '\u00a0' + cur : cur + s;
}
// Code Snippet languages: [id, label]. Twin of CC_CODE_LANGS in compiler.php.
const CODE_LANGS = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript'], ['json', 'JSON'], ['php', 'PHP'], ['shell', 'Shell'], ['text', '']];

// A media file address (audio, video): http(s) or a path on this site; any other scheme (javascript:, data:…) -> ''.
// Twin of cc_media_src() in compiler.php.
function ccMediaSrc(u) {
  const t = String(u ?? '').trim();
  // eslint-disable-next-line no-control-regex -- browsers ignore control characters in a URL scheme
  const probe = t.replace(/[\x00-\x20\x7f]+/g, '').toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:/.test(probe) && !/^https?:/.test(probe)) return '';
  return t;
}
// The MIME type a file's extension says ('' when unknown). Twin of cc_media_mime().
const MEDIA_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav' };
function ccMediaMime(src) {
  const m = String(src).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return m && Object.prototype.hasOwnProperty.call(MEDIA_MIME, m[1].toLowerCase()) ? MEDIA_MIME[m[1].toLowerCase()] : '';
}
// CRC-32 of the UTF-8 text as 8 hex digits (the same as PHP's crc32()): the announcement's "dismissed" key
function ccCrc32(str) {
  let crc = 0xFFFFFFFF;
  for (const byte of new TextEncoder().encode(str)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}
// Announcement Bar presets: [background, text color]. Twin of cc_announcement_html() in compiler.php, which also
// draws the site-wide bar (Global Options).
const ANN_PRESETS = { info: ['#0f172a', '#ffffff'], promo: ['var(--brand-color, #3b82f6)', '#ffffff'], warning: ['#fef3c7', '#78350f'], success: ['#dcfce7', '#14532d'] };
export function announcementHtml(c, id, extra, styleAttr, requireText) {
  c = c && typeof c === 'object' ? c : {};
  const text = [...ccStr(c.text).trim()].slice(0, 300).join('');
  if (requireText && text === '') return '';
  const preset = Object.prototype.hasOwnProperty.call(ANN_PRESETS, c.preset) ? c.preset : 'info';
  const bg = ccColor(c.bg, ANN_PRESETS[preset][0]);
  const fg = ccColor(c.color, ANN_PRESETS[preset][1]);
  const linkText = [...ccStr(c.linkText).trim()].slice(0, 60).join('');
  const linkUrl = ccStr(c.linkUrl).trim();
  const icon = [...ccStr(c.icon).trim()].slice(0, 4).join('');
  const sticky = c.sticky === true;
  const dismissible = c.dismissible !== false;
  const left = c.align === 'left';
  const key = ccCrc32(text + '|' + linkText + '|' + linkUrl);
  return `<div id="${id}" class="cc-announce cc-ann-${preset}${extra}" role="region" aria-label="Announcement" data-key="${key}" style="${styleAttr}${sticky ? ' position:sticky; top:0; z-index:9000;' : ''} background:${bg}; color:${fg}; padding:10px 16px; font-size:14px; line-height:1.4;">`
    + `<div class="cc-ann-inner" style="display:flex; align-items:center; justify-content:${left ? 'flex-start' : 'center'}; flex-wrap:wrap; gap:4px 12px; max-width:1200px; margin:0 auto; position:relative; padding-right:${dismissible ? '36px' : '0'}; box-sizing:border-box;">`
    + (icon !== '' ? `<span class="cc-ann-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : '')
    + `<span class="cc-ann-text">${escapeHtml(text)}</span>`
    + (linkText !== '' ? `<a class="cc-ann-link" href="${escapeHtml(resolveBlockUrl(linkUrl))}" style="color:inherit; font-weight:700; text-decoration:underline; white-space:nowrap;">${escapeHtml(linkText)} &rarr;</a>` : '')
    + (dismissible ? `<button type="button" class="cc-ann-close" hidden aria-label="Dismiss the announcement" style="position:absolute; right:0; top:50%; transform:translateY(-50%); width:28px; height:28px; padding:0; border:none; border-radius:50%; background:transparent; color:inherit; font-size:20px; line-height:1; cursor:pointer;">&times;</button>` : '')
    + `</div></div>\n`;
}

// opts.fields (editor canvas only): marks the rich text fields as editable in place
// (data-cc-field + contenteditable) on the same elements the site renders, so editing keeps the layout.
// ---------------------------------------------------------------------------
// Styles per device: block.responsive = { tablet: {styles}, mobile: {styles}, hide: ['desktop'|'tablet'|'mobile'] }.
// Overrides of the block's own (desktop) styles, written as media rules on the block's id; phones inherit the
// tablet overrides. Mirrors cc_device_css() in compiler.php. The editor applies the same overrides directly to the
// previewed device (effectiveStyles), so it renders without these rules (opts.noDeviceCss).
// ---------------------------------------------------------------------------
export const TABLET_MAX = 1024;
export const MOBILE_MAX = 767;
export const DEVICE_KEYS = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'padding', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'width', 'height', 'maxWidth', 'minWidth', 'minHeight', 'maxHeight', 'fontSize', 'lineHeight',
  'letterSpacing', 'fontWeight', 'textTransform', 'textAlign', 'color', 'backgroundColor', 'borderWidth', 'borderStyle', 'borderColor',
  'borderRadius', 'gap', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'order'];
const BTN_OUTER_KEYS = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'textAlign'];
const deviceDecls = (styles, keys) => {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return '';
  let out = '';
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(styles, k)) continue;
    const raw = styles[k];
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const v = String(raw).trim();
    if (v === '' || /[;{}<>\\]|expression\s*\(|javascript:|vbscript:|\/\*/i.test(v)) continue;
    out += k.replace(/(?<!^)[A-Z]/g, (m) => '-' + m).toLowerCase() + ':' + v + ' !important;';
  }
  return out;
};
export function deviceCss(block, id) {
  const r = block && block.responsive;
  if (!r || typeof r !== 'object' || Array.isArray(r) || !id) return '';
  const isBtn = block.type === 'BUTTON';
  const rule = (styles) => {
    if (!isBtn) { const d = deviceDecls(styles, DEVICE_KEYS); return d ? `#${id}{${d}}` : ''; }
    const o = deviceDecls(styles, BTN_OUTER_KEYS);
    const i = deviceDecls(styles, DEVICE_KEYS.filter((k) => !BTN_OUTER_KEYS.includes(k)));
    return (o ? `#${id}{${o}}` : '') + (i ? `#${id}>.cc-btn{${i}}` : '');
  };
  let css = '';
  const t = rule(r.tablet);
  if (t) css += `@media(max-width:${TABLET_MAX}px){${t}}`;
  const m = rule(r.mobile);
  if (m) css += `@media(max-width:${MOBILE_MAX}px){${m}}`;
  const hide = Array.isArray(r.hide) ? r.hide : [];
  const ranges = [['desktop', `(min-width:${TABLET_MAX + 1}px)`], ['tablet', `(min-width:${MOBILE_MAX + 1}px) and (max-width:${TABLET_MAX}px)`], ['mobile', `(max-width:${MOBILE_MAX}px)`]];
  for (const [dev, q] of ranges) if (hide.includes(dev)) css += `@media${q}{#${id}{display:none !important;}}`;
  return css ? `<style data-cc-device>${css}</style>\n` : '';
}

// The styles a block has on a device: its own, then the tablet overrides, then (phone) the phone overrides.
export function effectiveStyles(block, device) {
  const base = (block && block.styles) || {};
  const r = (block && block.responsive) || {};
  const pick = (o) => { const out = {}; if (o && typeof o === 'object') for (const k of DEVICE_KEYS) if (o[k] !== undefined && o[k] !== '') out[k] = o[k]; return out; };
  if (device === 'tablet') return { ...base, ...pick(r.tablet) };
  if (device === 'mobile') return { ...base, ...pick(r.tablet), ...pick(r.mobile) };
  return base;
}
export const hiddenOn = (block, device) => !!(block && block.responsive && Array.isArray(block.responsive.hide) && block.responsive.hide.includes(device));

export function renderBlock(block, opts = {}) {
  if (!block || typeof block !== 'object') return '';
  const html = renderBlockBody(block, opts);
  if (opts.noDeviceCss || block.type === 'MASTER' || !block.responsive) return html;
  const bid = block.id ? String(block.id).replace(/[^a-zA-Z0-9_-]/g, '') : '';
  const id = block.content && block.content.customId ? String(block.content.customId).replace(/[^a-zA-Z0-9_-]/g, '') : bid;
  return deviceCss(block, id) + html;
}

function renderBlockBody(block, opts = {}) {
  if (!block || typeof block !== 'object') return '';
  const field = (name, placeholder) => (opts.fields ? ` data-cc-field="${name}" contenteditable="true" data-cc-placeholder="${placeholder}"` : '');

  const styles = withTextPreset(block.styles);   // the block's text style (Style tab) under its own values
  const content = block.content || {};
  const styleAttr = buildInlineStyle(styles);
  const styleString = styleAttr ? ` style="${styleAttr}"` : '';
  const animClass = effectClasses(styles, content);

  const blockId = block.id ? String(block.id).replace(/[^a-zA-Z0-9_-]/g, '') : 'b_x';
  const innerId = content.customId ? String(content.customId).replace(/[^a-zA-Z0-9_-]/g, '') : blockId;
  const innerClass = content.customClass ? ' ' + escapeHtml(content.customClass) : '';

  let customCss = '';
  if (content.customCss) {
    let css = String(content.customCss).replace(/__THIS__/g, '#' + innerId);
    css = css.replace(/<\/\s*(style|script)/gi, '');
    customCss = `<style>\n${css}\n</style>\n`;
  }

  let childrenHtml = '';
  if (Array.isArray(block.children)) {
    for (const child of block.children) childrenHtml += renderBlock(child);
  }

  const t = block.type;
  let html = '';

  if (t === 'MASTER') {
    // Masters are resolved by the compiler via the DB; in the editor they are handled separately.
    return `<!-- Master: ${escapeHtml(content.name ?? '')} -->\n`;
  }

  switch (t) {
    case 'SECTION': {
      const r = blockRoot(block);
      return customCss + `<section id="${r.id}" class="${r.className}" style="${buildInlineStyle(r.style)}">\n${childrenHtml}\n</section>\n`;
    }

    case 'CONTAINER': {
      const r = blockRoot(block);
      return customCss + `<div id="${r.id}" class="${r.className}" style="${buildInlineStyle(r.style)}">\n${childrenHtml}\n</div>\n`;
    }

    case 'FLEX_ROW': {
      const r = blockRoot(block);
      return customCss + `<div id="${r.id}" class="${r.className}" style="${buildInlineStyle(r.style)}">\n${childrenHtml}\n</div>\n`;
    }

    case 'CSS_GRID': {
      const r = blockRoot(block);
      html = `<style>@media(max-width: 768px){ #${r.id} { grid-template-columns: 1fr !important; } }</style>`;
      html += `<div id="${r.id}" class="${r.className}" style="${buildInlineStyle(r.style)}">\n${childrenHtml}</div>\n`;
      return customCss + html;
    }

    case 'TEXT':
      return customCss + `<div id="${innerId}" class="cc-text${animClass}${innerClass}"${styleString}${field('text', 'Type your text…')}>\n${content.text ?? ''}\n</div>\n`;

    case 'IMAGE': {
      const src = escapeHtml(content.src ?? '');
      const alt = escapeHtml(content.alt ?? '');
      const fit = escapeHtml(content.objectFit ?? 'cover');
      const pos = escapeHtml(content.objectPosition ?? 'center');
      const scale = escapeHtml(content.scale ?? '1');
      const ar = content.aspectRatio ?? 'auto';
      const arStyle = (ar && ar !== 'auto') ? ` aspect-ratio:${escapeHtml(ar)};` : '';
      return customCss + `<figure id="${innerId}" class="cc-image${animClass}${innerClass}" style="${styleAttr} margin:0; overflow:hidden;${arStyle}"><img src="${src}" alt="${alt}" loading="lazy" style="width:100%; height:100%; object-fit:${fit}; object-position:${pos}; transform:scale(${scale}); display:block; border-radius:inherit;"></figure>\n`;
    }

    case 'BUTTON': {
      const url = escapeHtml(resolveInternalUrl(content.url ?? '#'));
      const text = escapeHtml(content.text || 'Click here');
      const align = escapeHtml(styles.textAlign ?? 'center');
      const margin = escapeHtml(styles.margin ?? '0');
      const useGlobal = content.useGlobal !== false;
      const own = { ...styles };
      delete own.margin; delete own.textAlign; delete own.animation;
      // A button preset (Global Options › Buttons & fields) gives the colours and corners, as variables
      const preset = buttonPresetCss(content.preset);
      const globalStyle = preset ? preset + 'padding: 12px 24px; ' : (useGlobal ? 'background: var(--brand-color, #3b82f6); color: #fff; border-radius: 6px; padding: 12px 24px; ' : '');
      const hv = buttonHover({ bg: content.btnHoverBg, color: content.btnHoverColor, border: content.btnHoverBorder, effect: content.btnEffect });
      const btnStyle = 'display:inline-block; text-decoration:none; font-weight:var(--cc-type-button-weight, bold); box-sizing:border-box; ' + globalStyle + buildInlineStyle(own) + escapeHtml(hv.vars);
      return customCss + `<div id="${innerId}" class="cc-btn-wrap${animClass}${innerClass}" style="text-align:${align}; margin:${margin};">\n<a href="${url}" class="cc-btn${hv.cls}" style="${btnStyle}">${text}</a>\n</div>\n`;
    }

    case 'GRID': {
      const columns = ccInt(content.columns, 2, 1, 24);
      html = `<style>@media(max-width: 768px){ #${innerId} { grid-template-columns: 1fr !important; } }</style>`;
      html += `<div id="${innerId}" class="cc-grid ${animClass}${innerClass}" style="${styleAttr} display:grid; grid-template-columns:repeat(${columns}, 1fr); gap:20px; overflow:hidden;">\n`;
      if (Array.isArray(content.items)) for (const item of content.items) html += `  <div style="min-width:0;">\n${item}\n  </div>\n`;
      html += `</div>\n`;
      return customCss + html;
    }

    case 'HERO': {
      const bgUrl = ccCssUrl(content.bgImage);
      const bg = bgUrl ? `background-image: url('${escapeHtml(bgUrl)}'); background-size: cover; background-position: center;` : '';
      const title = content.title ?? '';
      const subtitle = content.subtitle ?? '';
      const minHeight = escapeHtml(styles.minHeight ?? 'auto');
      // The legacy single button only for very old heroes without a list: an emptied list stays empty
      let buttons = Array.isArray(content.buttons) ? content.buttons : [];
      if (!Array.isArray(content.buttons)) buttons = [{ text: content.btnText ?? 'Start Now', url: content.btnUrl ?? '#', bgColor: 'var(--brand-color, #3b82f6)', textColor: '#ffffff', borderRadius: '8px' }];
      let buttonsHtml = `<div style="display:flex; gap:15px; flex-wrap:wrap; justify-content:${escapeHtml(styles.textAlign ?? 'center')};">`;
      for (const btn of buttons) {
        const bUrl = escapeHtml(resolveInternalUrl(btn.url));
        const hv = buttonHover({ bg: btn.hoverBg, color: btn.hoverColor, border: btn.hoverBorder, effect: btn.effect });
        const bBorder = btn.borderColor ? `2px solid ${escapeHtml(btn.borderColor)}` : 'none';
        // a button preset (Global Options › Buttons & fields) replaces the button's own colours and corners
        const look = buttonPresetCss(btn.preset) || `background:${escapeHtml(btn.bgColor)}; color:${escapeHtml(btn.textColor)}; border-radius:${escapeHtml(btn.borderRadius)}; border:${bBorder}; `;
        buttonsHtml += `<a href="${bUrl}" class="cc-btn${hv.cls}" style="display:inline-block; padding:14px 28px; ${look}text-decoration:none; font-weight:var(--cc-type-button-weight, bold); box-sizing:border-box; ${escapeHtml(hv.vars)}">${escapeHtml(btn.text)}</a>`;
      }
      buttonsHtml += `</div>`;
      return customCss + `<section id="${innerId}" class="cc-hero${animClass}${innerClass}" style="${styleAttr} ${bg} min-height:${minHeight}; display:flex; flex-direction:column; justify-content:center;">\n<div>\n${opts.fields ? `<div${field('title', 'Title')}>${title}</div>` : title}\n<div style="margin:20px 0;"${field('subtitle', 'Subtitle')}>${subtitle}</div>\n${buttonsHtml}\n</div>\n</section>\n`;
    }

    case 'IMAGE_TEXT': {
      const layout = (content.layout ?? 'img-left') === 'img-right' ? 'row-reverse' : 'row';
      const src = escapeHtml(content.src ?? '');
      const alt = escapeHtml(content.alt ?? '');
      const text = content.text ?? '';
      return customCss + `<section id="${innerId}" class="cc-img-text${animClass}${innerClass}" style="${styleAttr} display:flex; gap:40px; align-items:center; flex-direction:${layout}; flex-wrap:wrap;">\n<div style="flex:1 1 300px; width:100%;"><img src="${src}" alt="${alt}" style="width:100%; border-radius:8px; display:block;"></div>\n<div style="flex:1 1 300px; width:100%;"${field('text', 'Type your text…')}>${text}</div>\n</section>\n`;
    }

    case 'CARDS': {
      html = `<section id="${innerId}" class="cc-cards${animClass}${innerClass}" style="${styleAttr}">\n<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">\n`;
      if (Array.isArray(content.items)) for (const item of content.items) html += `<div style="background:#fff; padding:30px; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.05); border:1px solid #e2e8f0; min-width:0;">${item}</div>\n`;
      html += `</div>\n</section>\n`;
      return customCss + html;
    }

    case 'VIDEO': {
      const url = content.url ?? '';
      let embed = '';
      const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i);
      if (yt) embed = 'https://www.youtube.com/embed/' + yt[1];
      else { const vm = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i); if (vm) embed = 'https://player.vimeo.com/video/' + vm[1]; }
      if (!embed) return '';
      return customCss + `<div id="${innerId}" class="cc-video${animClass}${innerClass}"${styleString}>\n<div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:inherit;">\n<iframe src="${embed}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen loading="lazy"></iframe>\n</div>\n</div>\n`;
    }

    case 'ICON_BOX': {
      const icon = escapeHtml(content.icon ?? '\u26a1');
      const title = escapeHtml(content.title ?? '');
      const desc = escapeHtml(content.description ?? '');
      const align = escapeHtml(styles.textAlign ?? 'center');
      const ibOwn = { ...styles }; delete ibOwn.textAlign; delete ibOwn.animation;
      return customCss + `<div id="${innerId}" class="cc-icon-box${animClass}${innerClass}" style="${buildInlineStyle(ibOwn)}text-align:${align};">\n<div style="font-size:36px; margin-bottom:15px;">${icon}</div>\n<h3 style="margin:0 0 10px 0; font-size:18px;">${title}</h3>\n<p style="margin:0; font-size:14px; opacity:0.8;">${desc}</p>\n</div>\n`;
    }

    case 'TESTIMONIAL': {
      const quote = escapeHtml(content.quote ?? '');
      const author = escapeHtml(content.author ?? '');
      const role = escapeHtml(content.role ?? '');
      return customCss + `<div id="${innerId}" class="cc-testimonial${animClass}${innerClass}" style="${styleAttr}">\n<p style="font-size:16px; font-style:italic; margin:0 0 20px 0; line-height:1.6;">\u201c${quote}\u201d</p>\n<div style="font-weight:700; font-size:14px;">${author}</div>\n<div style="font-size:12px; opacity:0.6;">${role}</div>\n</div>\n`;
    }

    case 'SLIDER': {
      const effect = content.effect ?? 'slide';
      const isFade = effect === 'fade';
      const fit = escapeHtml(content.objectFit ?? 'cover');
      const opos = escapeHtml(content.objectPosition ?? 'center');
      const ar = escapeHtml(content.aspectRatio ?? '16 / 9');
      const hasHeight = styles.height && styles.height !== 'auto';
      const boxSize = hasHeight ? '' : ` aspect-ratio:${ar};`;
      html = `<div id="${innerId}" class="cc-slider${animClass}${innerClass}" style="${styleAttr} position:relative; overflow:hidden; border-radius:inherit;${boxSize}">\n`;
      html += `  <div class="cc-slides" style="display:flex; position:relative; height:100%; ${isFade ? '' : 'overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; -ms-overflow-style:none;'}">\n`;
      if (Array.isArray(content.images)) {
        content.images.forEach((img, idx) => {
          const src = escapeHtml(img.src ?? '');
          const alt = escapeHtml(img.alt ?? '');
          if (isFade) {
            const opacity = idx === 0 ? 1 : 0;
            const pos = idx === 0 ? 'relative' : 'absolute';
            html += `    <img src="${src}" alt="${alt}" style="position:${pos}; top:0; left:0; width:100%; height:100%; object-fit:${fit}; object-position:${opos}; opacity:${opacity}; transition:opacity 0.8s ease; border-radius:inherit;" class="cc-slide">\n`;
          } else {
            html += `    <img src="${src}" alt="${alt}" style="flex:0 0 100%; width:100%; height:100%; scroll-snap-align:start; object-fit:${fit}; object-position:${opos}; border-radius:inherit;" class="cc-slide">\n`;
          }
        });
      }
      html += `  </div>\n`;
      // Previous / next arrows (also the only way through a fading slider without autoplay)
      if (Array.isArray(content.images) && content.images.length > 1) {
        html += `  <button type="button" class="cc-slider-prev" aria-label="Previous slide" style="position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; border:none; border-radius:50%; background:rgba(15,23,42,0.55); color:#fff; font-size:24px; line-height:1; cursor:pointer; z-index:2; display:flex; align-items:center; justify-content:center; padding:0; left:10px;">&#8249;</button>\n`;
        html += `  <button type="button" class="cc-slider-next" aria-label="Next slide" style="position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; border:none; border-radius:50%; background:rgba(15,23,42,0.55); color:#fff; font-size:24px; line-height:1; cursor:pointer; z-index:2; display:flex; align-items:center; justify-content:center; padding:0; right:10px;">&#8250;</button>\n`;
      }
      html += `</div>\n`;
      // note: the compiler's <style>/<script> (arrows, autoplay) does not affect structure/styles
      return customCss + html;
    }

    case 'MAPS': {
      const address = encodeURIComponent(content.address ?? '');
      const zoom = parseInt(content.zoom ?? 15, 10) || 15;
      return customCss + `<div id="${innerId}" class="cc-maps${animClass}${innerClass}" style="${styleAttr}">\n  <div style="position:relative; overflow:hidden; padding-bottom:56.25%; height:0; border-radius:inherit;">\n    <iframe src="https://maps.google.com/maps?q=${address}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen loading="lazy"></iframe>\n  </div>\n</div>\n`;
    }

    case 'FAQ': {
      let items = '';
      if (Array.isArray(content.items)) {
        for (const it of content.items) {
          const q = escapeHtml(it.q ?? '');
          const a = escapeHtml(it.a ?? '').replace(/\r\n|\r|\n/g, '<br />');
          items += `  <details style="margin-bottom:10px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">\n    <summary style="padding:15px 20px; font-weight:600; cursor:pointer; background:#f8fafc; outline:none; list-style:none;"><span style="display:inline-block; width:15px; font-weight:bold; color:var(--brand-color, #3b82f6);">+</span> ${q}</summary>\n    <div style="padding:15px 20px; border-top:1px solid #e2e8f0; font-size:15px; color:#475569; line-height:1.6;">${a}</div>\n  </details>\n`;
        }
      }
      return customCss + `<div id="${innerId}" class="cc-faq${animClass}${innerClass}" style="${styleAttr}">\n${items}</div>\n`;
    }

    case 'FORM': {
      const btnText = escapeHtml(content.btnText || 'Send Message');
      const successMsg = escapeHtml(content.successMsg || 'Sent!');
      const title = content.title ?? '<h3>Contact Us</h3>';
      const formId = content.customId
        ? 'f_' + String(content.customId).replace(/[^a-zA-Z0-9_-]/g, '')
        : 'f_' + String(block.id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      let fieldsHtml = '';
      const fields = Array.isArray(content.fields) ? content.fields : [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Message', type: 'textarea', required: true }];
      fields.forEach((f, i) => {
        const fLabel = escapeHtml(f.label ?? '');
        const fType = FORM_TYPES.includes(f.type) ? f.type : 'text';
        const req = f.required ? 'required' : '';
        const name = 'field_' + i;
        fieldsHtml += `<input type="hidden" name="_label_${name}" value="${fLabel}">\n`;
        fieldsHtml += `<div style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px; font-weight:600;">${fLabel}</label>`;
        if (fType === 'textarea') fieldsHtml += `<textarea name="${name}" ${req} rows="4" style="width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 6px); font-family:inherit; background:var(--cc-field-bg, #fff); box-sizing:border-box;"></textarea>`;
        else fieldsHtml += `<input type="${fType}" name="${name}" ${req} style="width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 6px); font-family:inherit; background:var(--cc-field-bg, #fff); box-sizing:border-box;">`;
        fieldsHtml += `</div>\n`;
      });
      return customCss + `<div id="${innerId}" class="cc-form-block${animClass}${innerClass}"${styleString}>\n<div style="margin-bottom:20px;"${field('title', 'Form title')}>${title}</div>\n<form id="${formId}" action="{{BASE_URL}}canvascore-admin/submit_form.php" method="POST">\n<input type="hidden" name="_form" value="${formId}">\n<input type="hidden" name="_success" value="${successMsg}">\n<input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute; left:-9999px; width:0; height:0; opacity:0;">\n${fieldsHtml}<button type="submit" style="padding:12px 24px; background:var(--brand-color, #3b82f6); color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">${btnText}</button>\n</form>\n</div>\n`;
    }

    case 'ACCORDION': {
      const items = Array.isArray(content.items) ? content.items : [];
      const multi = !!content.allowMultiple;
      const openFirst = !!content.openFirst;
      const icon = content.icon ?? 'plus';
      const variant = content.variant ?? 'card';
      const iconChar = icon === 'chevron' ? '&#9662;' : (icon === 'none' ? '' : '+');
      const rot = icon === 'chevron' ? 'rotate(180deg)' : 'rotate(45deg)';
      const itemStyle = variant === 'flat'
        ? 'border-bottom:1px solid #e2e8f0;'
        : 'margin-bottom:10px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;';
      const sumStyle = 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; font-weight:600; cursor:pointer; list-style:none;';
      const bodyStyle = 'padding:4px 18px 16px; font-size:15px; color:#475569; line-height:1.6;';
      let h = `<div id="${innerId}" class="cc-accordion${animClass}${innerClass}" style="${styleAttr}">\n`;
      h += `<style>#${innerId} .cc-acc-item>summary{list-style:none}#${innerId} .cc-acc-item>summary::-webkit-details-marker{display:none}#${innerId} .cc-acc-icon{transition:transform .2s ease; display:inline-block; color:var(--brand-color, #3b82f6)}#${innerId} .cc-acc-item[open]>summary .cc-acc-icon{transform:${rot}}</style>\n`;
      items.forEach((it, i) => {
        const attrs = (multi ? '' : ` name="${innerId}"`) + ((openFirst && i === 0) ? ' open' : '');
        h += `<details class="cc-acc-item"${attrs} style="${itemStyle}">\n`;
        h += `<summary style="${sumStyle}"><span class="cc-acc-title">${escapeHtml(it.title ?? '')}</span>${iconChar !== '' ? `<span class="cc-acc-icon" aria-hidden="true">${iconChar}</span>` : ''}</summary>\n`;
        h += `<div class="cc-acc-body" style="${bodyStyle}">${it.content ?? ''}</div>\n`;
        h += `</details>\n`;
      });
      h += `</div>\n`;
      return customCss + h;
    }

    case 'TABS': {
      const items = Array.isArray(content.items) ? content.items : [];
      const variant = content.variant ?? 'underline';
      const align = content.tabAlign ?? 'left';
      const justify = align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start');
      const n = items.length;
      const barStyle = `display:flex; flex-wrap:wrap; gap:6px; justify-content:${justify};` + (variant === 'underline' ? ' border-bottom:1px solid #e2e8f0;' : '');
      const tabStyle = variant === 'pills'
        ? 'display:inline-block; padding:8px 16px; border-radius:999px; font-weight:600; font-size:14px; cursor:pointer; color:#475569; background:#f1f5f9;'
        : 'display:inline-block; padding:10px 16px; font-weight:600; font-size:14px; cursor:pointer; color:#64748b; border-bottom:2px solid transparent; margin-bottom:-1px;';
      const activeCss = variant === 'pills'
        ? 'background:var(--brand-color, #3b82f6) !important; color:#fff !important;'
        : 'color:var(--brand-color, #3b82f6) !important; border-bottom-color:var(--brand-color, #3b82f6) !important;';
      let css = `#${innerId} .cc-tab-input{position:absolute; opacity:0; width:0; height:0; pointer-events:none}#${innerId} .cc-tab-panel{display:none}`;
      for (let k = 1; k <= n; k++) {
        css += `#${innerId} .cc-tab-input:nth-of-type(${k}):checked ~ .cc-tab-bar .cc-tab:nth-child(${k}){${activeCss}}`;
        css += `#${innerId} .cc-tab-input:nth-of-type(${k}):checked ~ .cc-tab-panels .cc-tab-panel:nth-child(${k}){display:block}`;
        css += `#${innerId} .cc-tab-input:nth-of-type(${k}):focus-visible ~ .cc-tab-bar .cc-tab:nth-child(${k}){outline:2px solid var(--brand-color, #3b82f6); outline-offset:2px}`;
      }
      let inputs = '', labels = '', panels = '';
      items.forEach((it, i) => {
        const k = i + 1;
        inputs += `<input type="radio" class="cc-tab-input" name="${innerId}-tabs" id="${innerId}-t${k}"${i === 0 ? ' checked' : ''}>`;
        labels += `<label class="cc-tab" for="${innerId}-t${k}" style="${tabStyle}">${escapeHtml(it.title ?? '')}</label>`;
        panels += `<div class="cc-tab-panel" style="font-size:15px; line-height:1.6; color:#475569;">${it.content ?? ''}</div>`;
      });
      let h = `<div id="${innerId}" class="cc-tabs${animClass}${innerClass}" style="${styleAttr} position:relative;">\n`;
      h += `<style>${css}</style>\n${inputs}\n`;
      h += `<div class="cc-tab-bar" style="${barStyle}">${labels}</div>\n`;
      h += `<div class="cc-tab-panels" style="padding-top:18px;">${panels}</div>\n</div>\n`;
      return customCss + h;
    }

    case 'PRICING': {
      const plans = Array.isArray(content.plans) ? content.plans : [];
      let cols = toInt(content.columns, 0);
      if (cols < 1) cols = Math.max(1, Math.min(4, plans.length));
      cols = Math.min(cols, 4);
      let cards = '';
      for (const pl of plans) {
        const hl = !!pl.highlighted;
        const name = escapeHtml(pl.name ?? '');
        const price = escapeHtml(pl.price ?? '');
        const period = escapeHtml(pl.period ?? '');
        const desc = escapeHtml(pl.description ?? '');
        const badge = escapeHtml(pl.badge ?? '');
        const btnText = escapeHtml(pl.buttonText ?? '');
        const btnUrl = escapeHtml(resolveBlockUrl(pl.buttonUrl ?? '#'));
        const cardStyle = 'position:relative; display:flex; flex-direction:column; padding:28px 24px; border-radius:14px; background:#fff; box-sizing:border-box; ' + (hl ? 'border:2px solid var(--brand-color, #3b82f6); box-shadow:0 10px 30px rgba(15,23,42,0.12);' : 'border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04);');
        const badgeHtml = badge !== '' ? `<div class="cc-plan-badge" style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:var(--brand-color, #3b82f6); color:#fff; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; padding:4px 12px; border-radius:999px; white-space:nowrap;">${badge}</div>` : '';
        const periodHtml = period !== '' ? `<span class="cc-plan-period" style="font-size:14px; color:#64748b; margin-left:4px;">${period}</span>` : '';
        const descHtml = desc !== '' ? `<p class="cc-plan-desc" style="margin:10px 0 0 0; font-size:14px; color:#64748b; line-height:1.5;">${desc}</p>` : '';
        let feat = '';
        const features = Array.isArray(pl.features) ? pl.features : [];
        for (const f0 of features) {
          const f = String(f0 ?? '').trim();
          if (f === '') continue;
          feat += `<li style="display:flex; gap:10px; align-items:flex-start; margin:0 0 10px 0; font-size:14px; color:#334155;"><span aria-hidden="true" style="color:var(--brand-color, #3b82f6); font-weight:700;">&#10003;</span><span>${escapeHtml(f)}</span></li>`;
        }
        const btnHtml = btnText !== '' ? `<a href="${btnUrl}" class="cc-plan-btn" style="display:block; text-align:center; text-decoration:none; font-weight:700; padding:12px 18px; border-radius:8px; margin-top:auto; box-sizing:border-box; ${hl ? 'background:var(--brand-color, #3b82f6); color:#fff;' : 'background:#f1f5f9; color:#0f172a;'}">${btnText}</a>` : '';
        cards += `<div class="cc-plan${hl ? ' cc-plan-hl' : ''}" style="${cardStyle}">${badgeHtml}`
          + `<h3 class="cc-plan-name" style="margin:0; font-size:18px; color:#0f172a;">${name}</h3>`
          + `<div class="cc-plan-price" style="margin-top:14px; display:flex; align-items:baseline;"><span class="cc-plan-amount" style="font-size:38px; font-weight:800; color:#0f172a; line-height:1;">${price}</span>${periodHtml}</div>`
          + descHtml
          + `<ul class="cc-plan-features" style="list-style:none; padding:0; margin:20px 0 24px 0;">${feat}</ul>`
          + `${btnHtml}</div>`;
      }
      let h = `<style>@media(max-width:900px){#${innerId} .cc-pricing-grid{grid-template-columns:1fr !important}}</style>`;
      h += `<div id="${innerId}" class="cc-pricing${animClass}${innerClass}" style="${styleAttr}">\n`;
      h += `<div class="cc-pricing-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:24px; align-items:stretch; padding-top:12px;">${cards}</div>\n</div>\n`;
      return customCss + h;
    }

    case 'GALLERY': {
      const images = Array.isArray(content.images) ? content.images : [];
      const isMasonry = (content.layout ?? 'grid') === 'masonry';
      const cols = Math.max(1, Math.min(6, toInt(content.columns, 3)));
      const gap = Math.max(0, Math.min(80, toInt(content.gap, 12)));
      const ar = content.aspectRatio ?? '1 / 1';
      const radius = escapeHtml(content.borderRadius ?? '8px');
      const lightbox = (content.lightbox ?? true) !== false && images.length > 0;
      const captions = !!content.showCaptions;
      const mobCols = Math.min(cols, 2);
      const useAr = !isMasonry && !!ar && ar !== 'auto';
      const containerStyle = isMasonry
        ? `column-count:${cols}; column-gap:${gap}px;`
        : `display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:${gap}px;`;
      const figStyle = isMasonry ? `margin:0 0 ${gap}px 0; break-inside:avoid;` : 'margin:0;';
      const itemStyle = `display:block; overflow:hidden; border-radius:${radius};` + (useAr ? ` aspect-ratio:${escapeHtml(ar)};` : '') + (lightbox ? ' cursor:zoom-in;' : '');
      const imgStyle = useAr ? 'width:100%; height:100%; object-fit:cover; display:block;' : 'width:100%; height:auto; display:block;';
      let figs = '';
      for (const im of images) {
        const src = escapeHtml(ccImgUrl(im.src));
        const alt = escapeHtml(im.alt ?? '');
        const cap = escapeHtml(im.caption ?? '');
        const imgHtml = `<img src="${src}" alt="${alt}" loading="lazy" style="${imgStyle}">`;
        const inner = lightbox
          ? `<a href="${src}" class="cc-gal-item" data-caption="${cap}" style="${itemStyle}">${imgHtml}</a>`
          : `<div class="cc-gal-item" style="${itemStyle}">${imgHtml}</div>`;
        const capHtml = (captions && cap !== '') ? `<figcaption class="cc-gal-cap" style="font-size:13px; color:#64748b; margin-top:6px;">${cap}</figcaption>` : '';
        figs += `<figure class="cc-gal-fig" style="${figStyle}">${inner}${capHtml}</figure>`;
      }
      const mobCss = isMasonry ? `column-count:${mobCols} !important` : `grid-template-columns:repeat(${mobCols}, 1fr) !important`;
      let h = `<style>@media(max-width:768px){#${innerId} .cc-gal-grid{${mobCss}}}</style>`;
      h += `<div id="${innerId}" class="cc-gallery${animClass}${innerClass}" style="${styleAttr}">\n`;
      h += `<div class="cc-gal-grid" style="${containerStyle}">${figs}</div>\n`;
      if (lightbox) {
        const btn = 'position:absolute; background:rgba(15,23,42,0.6); color:#fff; border:none; cursor:pointer; line-height:1; border-radius:999px; width:44px; height:44px; font-size:26px;';
        h += `<div class="cc-lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" style="display:none; position:fixed; top:0; right:0; bottom:0; left:0; background:rgba(2,6,23,0.92); z-index:100000; align-items:center; justify-content:center; flex-direction:column;">`
          + `<button type="button" class="cc-lb-close" aria-label="Close" style="${btn} top:16px; right:16px;">&times;</button>`
          + `<button type="button" class="cc-lb-prev" aria-label="Previous" style="${btn} left:16px; top:50%; margin-top:-22px;">&#8249;</button>`
          + `<img class="cc-lb-img" alt="" style="max-width:90vw; max-height:78vh; object-fit:contain; border-radius:8px;">`
          + `<div class="cc-lb-cap" style="color:#e2e8f0; font-size:14px; margin-top:12px; text-align:center; padding:0 60px;"></div>`
          + `<button type="button" class="cc-lb-next" aria-label="Next" style="${btn} right:16px; top:50%; margin-top:-22px;">&#8250;</button>`
          + `</div>\n`;
        // the lightbox <script> is emitted only by the compiler (behavior, not structure)
      }
      h += `</div>\n`;
      return customCss + h;
    }

    case 'DIVIDER': {
      const c = content;
      let style = c.style ?? 'line';
      if (!['line', 'gradient', 'dots', 'wave', 'curve', 'diagonal', 'spacer'].includes(style)) style = 'line';
      const color = ccColor(c.color, '#cbd5e1');
      const thick = Math.trunc(ccNum(c.thickness ?? 2, 1, 20, 2));
      const width = Math.trunc(ccNum(c.width ?? 100, 10, 100, 100));
      const height = Math.trunc(ccNum(c.height ?? 80, 10, 400, 80));
      const flip = !!c.flip;
      let inner;
      if (style === 'line') inner = `<hr class="cc-divider-line" style="border:0; border-top:${thick}px solid ${color}; width:${width}%; margin:0 auto;">`;
      else if (style === 'gradient') inner = `<div class="cc-divider-line" aria-hidden="true" style="height:${thick}px; width:${width}%; margin:0 auto; background:linear-gradient(90deg, transparent, ${color}, transparent);"></div>`;
      else if (style === 'dots') inner = `<div class="cc-divider-dots" aria-hidden="true" style="text-align:center; color:${color}; font-size:${8 + thick * 2}px; letter-spacing:10px; line-height:1;">&bull;&bull;&bull;</div>`;
      else if (style === 'spacer') inner = `<div class="cc-divider-spacer" aria-hidden="true" style="height:${height}px;"></div>`;
      else {
        const paths = {
          wave: 'M0,60 C150,100 350,20 600,60 C850,100 1050,20 1200,60 L1200,120 L0,120 Z',
          curve: 'M0,0 C300,120 900,120 1200,0 L1200,120 L0,120 Z',
          diagonal: 'M0,120 L1200,0 L1200,120 Z',
        };
        inner = `<svg class="cc-divider-shape" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true" focusable="false" style="display:block; width:100%; height:${height}px;${flip ? ' transform:scaleY(-1);' : ''}"><path d="${paths[style]}" fill="${color}"></path></svg>`;
      }
      return customCss + `<div id="${innerId}" class="cc-divider cc-divider-${style}${animClass}${innerClass}" style="${styleAttr}">\n${inner}\n</div>\n`;
    }

    case 'CALLOUT': {
      const c = content;
      const variants = {
        info: ['#e0f2fe', '#0284c7', '#0c4a6e', '&#8505;'],
        success: ['#dcfce7', '#16a34a', '#14532d', '&#10003;'],
        warning: ['#fef3c7', '#d97706', '#78350f', '&#9888;'],
        danger: ['#fee2e2', '#dc2626', '#7f1d1d', '&#10006;'],
        note: ['#f1f5f9', '#64748b', '#1e293b', '&#9998;'],
      };
      const v = Object.prototype.hasOwnProperty.call(variants, c.variant) ? c.variant : 'info';
      const [bg, bd, fg, ic] = variants[v];
      const title = escapeHtml(c.title ?? '');
      const text = c.text ?? '';
      const showIcon = (c.showIcon ?? true) !== false;
      return customCss + `<div id="${innerId}" class="cc-callout cc-callout-${v}${animClass}${innerClass}" role="note" style="${styleAttr} display:flex; gap:14px; padding:16px 18px; border-radius:10px; border-left:4px solid ${bd}; background:${bg}; color:${fg};">`
        + (showIcon ? `<span class="cc-callout-icon" aria-hidden="true" style="font-size:20px; line-height:1.3; flex-shrink:0;">${ic}</span>` : '')
        + `<div class="cc-callout-body" style="flex:1; min-width:0;">`
        + (title !== '' ? `<div class="cc-callout-title" style="font-weight:700; margin-bottom:4px;">${title}</div>` : '')
        + `<div class="cc-callout-text" style="font-size:15px; line-height:1.55;">${text}</div></div></div>\n`;
    }

    case 'STEPS': {
      const c = content;
      const items = Array.isArray(c.items) ? c.items : [];
      const vertical = (c.layout ?? 'horizontal') === 'vertical';
      const cols = Math.max(1, Math.min(4, items.length));
      let css, rootStyle, numStyle;
      if (vertical) {
        css = `#${innerId} .cc-step{position:relative; padding-left:60px; padding-bottom:28px}#${innerId} .cc-step:last-child{padding-bottom:0}#${innerId} .cc-step:not(:last-child)::after{content:""; position:absolute; left:19px; top:44px; bottom:4px; width:2px; background:#e2e8f0}`;
        rootStyle = ' list-style:none; margin:0; padding:0;';
        numStyle = 'position:absolute; left:0; top:0; ';
      } else {
        css = `#${innerId} .cc-step{position:relative; text-align:center}#${innerId} .cc-step:not(:last-child)::after{content:""; position:absolute; top:19px; left:calc(50% + 28px); width:calc(100% - 32px); height:2px; background:#e2e8f0}@media(max-width:768px){#${innerId}.cc-steps-horizontal{grid-template-columns:1fr !important}#${innerId} .cc-step:not(:last-child)::after{display:none}}`;
        rootStyle = ` list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:24px;`;
        numStyle = 'margin:0 auto 14px; ';
      }
      let lis = '';
      items.forEach((it, i) => {
        const title = escapeHtml(it.title ?? '');
        const text = escapeHtml(it.text ?? '');
        lis += `<li class="cc-step"><div class="cc-step-num" style="${numStyle}display:flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:50%; background:var(--brand-color, #3b82f6); color:#fff; font-weight:700;">${i + 1}</div>`
          + `<h3 class="cc-step-title" style="margin:0 0 6px 0; font-size:17px;">${title}</h3>`
          + (text !== '' ? `<p class="cc-step-text" style="margin:0; font-size:14px; color:#64748b; line-height:1.55;">${text}</p>` : '')
          + `</li>`;
      });
      return customCss + `<style>${css}</style>`
        + `<ol id="${innerId}" class="cc-steps cc-steps-${vertical ? 'vertical' : 'horizontal'}${animClass}${innerClass}" style="${styleAttr}${rootStyle}">${lis}</ol>\n`;
    }

    case 'COUNTERS': {
      const c = content;
      const items = Array.isArray(c.items) ? c.items : [];
      let cols = Math.trunc(ccNum(c.columns ?? 0, 0, 4, 0));
      if (cols < 1) cols = Math.max(1, Math.min(4, items.length));
      let cells = '';
      for (const it of items) {
        const val = ccIsNum(it.value) ? Number(it.value) : 0;
        const dec = Math.trunc(ccNum(it.decimals ?? 0, 0, 2, 0));
        const pre = escapeHtml(it.prefix ?? '');
        const suf = escapeHtml(it.suffix ?? '');
        const label = escapeHtml(it.label ?? '');
        cells += `<div class="cc-counter" style="text-align:center; padding:8px;"><div class="cc-counter-value" data-target="${val}" data-decimals="${dec}" data-prefix="${pre}" data-suffix="${suf}" style="font-size:44px; font-weight:800; color:var(--brand-color, #3b82f6); line-height:1.1; font-variant-numeric:tabular-nums;">${pre}${ccFmtNum(val, dec)}${suf}</div>`
          + (label !== '' ? `<div class="cc-counter-label" style="margin-top:6px; color:#64748b; font-size:15px;">${label}</div>` : '') + `</div>`;
      }
      let h = `<style>@media(max-width:768px){#${innerId} .cc-counters-grid{grid-template-columns:repeat(2, 1fr) !important}}</style>`;
      h += `<div id="${innerId}" class="cc-counters${animClass}${innerClass}" style="${styleAttr}">\n`;
      h += `<div class="cc-counters-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:16px;">${cells}</div>\n`;
      h += `</div>\n`;
      return customCss + h;
    }

    case 'PROGRESS': {
      const c = content;
      const items = Array.isArray(c.items) ? c.items : [];
      const hh = Math.trunc(ccNum(c.height ?? 10, 4, 30, 10));
      const showValue = (c.showValue ?? true) !== false;
      let rows = '';
      for (const it of items) {
        const label = escapeHtml(it.label ?? '');
        const val = Math.round(ccNum(it.value ?? 0, 0, 100, 0) * 10) / 10;
        const color = ccColor(it.color, 'var(--brand-color, #3b82f6)');
        rows += `<div class="cc-progress-item" style="margin-bottom:18px;"><div class="cc-progress-head" style="display:flex; justify-content:space-between; font-size:14px; font-weight:600; margin-bottom:6px;"><span class="cc-progress-label">${label}</span>`
          + (showValue ? `<span class="cc-progress-value">${val}%</span>` : '') + `</div>`
          + `<div class="cc-progress-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}" style="height:${hh}px; background:#e2e8f0; border-radius:999px; overflow:hidden;"><div class="cc-progress-fill" data-w="${val}" style="width:${val}%; height:100%; background:${color}; border-radius:999px;"></div></div></div>`;
      }
      return customCss + `<div id="${innerId}" class="cc-progress${animClass}${innerClass}" style="${styleAttr}">\n${rows}\n</div>\n`;
    }

    case 'TABLE': {
      const c = content;
      const rows = ccLines(c.data ?? '').map((l) => l.split(/\s*\|\s*|\t/));
      const headerRow = (c.headerRow ?? true) !== false;
      const striped = (c.striped ?? true) !== false;
      const bordered = !!c.bordered;
      const compact = !!c.compact;
      const rowHeaders = !!c.rowHeaders;
      const sticky = !!c.stickyHeader;
      const maxH = Math.trunc(ccNum(c.maxHeight ?? 0, 0, 1200, 0));
      const caption = escapeHtml(c.caption ?? '');
      const head = (headerRow && rows.length) ? rows.shift() : null;
      let ncols = head ? head.length : 0;
      for (const r of rows) ncols = Math.max(ncols, r.length);
      const pad = compact ? '6px 10px' : '12px 14px';
      const wrap = 'overflow-x:auto;' + ((sticky && maxH > 0) ? ` max-height:${maxH}px; overflow-y:auto;` : '');
      const cellBorder = bordered ? 'border:1px solid #e2e8f0;' : 'border-bottom:1px solid #e2e8f0;';
      const thStyle = `padding:${pad}; background:#f1f5f9; border-bottom:2px solid #cbd5e1; font-weight:700;` + (sticky ? ' position:sticky; top:0;' : '') + (bordered ? ' border:1px solid #cbd5e1;' : '');
      let table = '';
      if (ncols > 0) {
        table += `<table class="cc-table" style="width:100%; border-collapse:collapse; font-size:14px; text-align:left;">`;
        if (caption !== '') table += `<caption style="caption-side:top; text-align:left; font-weight:700; padding:0 0 10px 0;">${caption}</caption>`;
        if (head) {
          table += '<thead><tr>';
          for (let i = 0; i < ncols; i++) table += `<th scope="col" style="${thStyle}">${escapeHtml(head[i] ?? '')}</th>`;
          table += '</tr></thead>';
        }
        table += '<tbody>';
        rows.forEach((r, ri) => {
          table += `<tr${(striped && ri % 2 === 1) ? ' style="background:#f8fafc;"' : ''}>`;
          for (let i = 0; i < ncols; i++) {
            const cell = escapeHtml(r[i] ?? '');
            if (i === 0 && rowHeaders) table += `<th scope="row" style="padding:${pad}; ${cellBorder} font-weight:600;">${cell}</th>`;
            else table += `<td style="padding:${pad}; ${cellBorder}">${cell}</td>`;
          }
          table += '</tr>';
        });
        table += '</tbody></table>';
      }
      return customCss + `<div id="${innerId}" class="cc-table-block${animClass}${innerClass}" style="${styleAttr}">\n<div class="cc-table-wrap" style="${wrap}">${table}</div>\n</div>\n`;
    }

    case 'COUNTDOWN': {
      const c = content;
      let dt = String(c.datetime ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) dt = '2030-01-01T00:00';
      let tz = String(c.utcOffset ?? 'local');
      if (tz !== 'local' && !/^[+-]\d{2}:\d{2}$/.test(tz)) tz = 'local';
      const target = tz === 'local' ? dt : dt + ':00' + tz;
      const dateText = dt.replace('T', ' ') + (tz === 'local' ? '' : ' UTC' + tz);
      const end = (c.endAction ?? 'message') === 'hide' ? 'hide' : 'message';
      const endMsg = escapeHtml(c.endMessage ?? '');
      const showSeconds = (c.showSeconds ?? true) !== false;
      const showDate = (c.showDate ?? true) !== false;
      const units = [['days', 'labelDays', 'Days'], ['hours', 'labelHours', 'Hours'], ['minutes', 'labelMinutes', 'Minutes']];
      if (showSeconds) units.push(['seconds', 'labelSeconds', 'Seconds']);
      let cells = '';
      for (const u of units) {
        cells += `<div class="cc-cd-unit" style="text-align:center; min-width:72px;"><span class="cc-cd-num" data-unit="${u[0]}" style="display:block; font-size:42px; font-weight:800; line-height:1.1; font-variant-numeric:tabular-nums; color:var(--brand-color, #3b82f6);">00</span>`
          + `<span class="cc-cd-label" style="display:block; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">${escapeHtml(c[u[1]] ?? u[2])}</span></div>`;
      }
      let h = `<div id="${innerId}" class="cc-countdown${animClass}${innerClass}" data-target="${escapeHtml(target)}" data-end="${end}" role="timer" style="${styleAttr}">\n`;
      h += `<div class="cc-cd-units" style="display:flex; justify-content:center; gap:16px; flex-wrap:wrap;">${cells}</div>\n`;
      if (showDate) h += `<div class="cc-cd-date" style="text-align:center; font-size:13px; color:#94a3b8; margin-top:12px;"><time datetime="${escapeHtml(target)}">${escapeHtml(dateText)}</time></div>\n`;
      h += `<div class="cc-cd-done" hidden style="text-align:center; font-size:22px; font-weight:700;">${endMsg}</div>\n`;
      h += `</div>\n`;
      return customCss + h;
    }

    case 'TIMELINE': {
      const c = content;
      const items = Array.isArray(c.items) ? c.items : [];
      const alt = (c.layout ?? 'left') === 'alternate';
      let css = `#${innerId}::before{content:""; position:absolute; left:9px; top:6px; bottom:6px; width:2px; background:#e2e8f0}#${innerId} .cc-tl-item{position:relative; margin-bottom:28px}#${innerId} .cc-tl-item:last-child{margin-bottom:0}#${innerId} .cc-tl-dot{position:absolute; left:-34px; top:4px; width:20px; height:20px; border-radius:50%; background:var(--brand-color, #3b82f6); border:4px solid #fff; box-shadow:0 0 0 2px #e2e8f0; box-sizing:border-box}`;
      if (alt) {
        css += `@media(min-width:769px){#${innerId}{padding-left:0 !important}#${innerId}::before{left:50%; margin-left:-1px}#${innerId} .cc-tl-item{width:50%; box-sizing:border-box; padding-right:36px; text-align:right}#${innerId} .cc-tl-item:nth-child(even){margin-left:50%; padding-right:0; padding-left:36px; text-align:left}#${innerId} .cc-tl-dot{left:auto; right:-46px}#${innerId} .cc-tl-item:nth-child(even) .cc-tl-dot{right:auto; left:-46px}}`;
      }
      let lis = '';
      for (const it of items) {
        const date = escapeHtml(it.date ?? '');
        const title = escapeHtml(it.title ?? '');
        const text = escapeHtml(it.text ?? '');
        lis += `<li class="cc-tl-item"><span class="cc-tl-dot" aria-hidden="true"></span>`
          + (date !== '' ? `<div class="cc-tl-date" style="font-size:13px; font-weight:700; color:var(--brand-color, #3b82f6); margin-bottom:4px;">${date}</div>` : '')
          + `<h3 class="cc-tl-title" style="margin:0 0 6px 0; font-size:18px;">${title}</h3>`
          + (text !== '' ? `<p class="cc-tl-text" style="margin:0; font-size:14px; color:#64748b; line-height:1.55;">${text}</p>` : '')
          + `</li>`;
      }
      return customCss + `<style>${css}</style><ol id="${innerId}" class="cc-timeline cc-timeline-${alt ? 'alternate' : 'left'}${animClass}${innerClass}" style="${styleAttr} list-style:none; margin:0; padding:0 0 0 34px; position:relative;">${lis}</ol>\n`;
    }

    case 'LOGOS': {
      const c = content;
      const logos = Array.isArray(c.logos) ? c.logos : [];
      const marquee = (c.layout ?? 'grid') === 'marquee';
      const title = escapeHtml(c.title ?? '');
      const cols = Math.trunc(ccNum(c.columns ?? 5, 1, 8, 5));
      const hh = Math.trunc(ccNum(c.height ?? 48, 20, 120, 48));
      const gap = Math.trunc(ccNum(c.gap ?? 40, 8, 80, 40));
      const gray = (c.grayscale ?? true) !== false;
      const speed = Math.trunc(ccNum(c.speed ?? 30, 10, 120, 30));
      const imgStyle = `height:${hh}px; width:auto; max-width:100%; object-fit:contain; display:block;` + (gray ? ' filter:grayscale(1); opacity:0.7; transition:filter 0.2s, opacity 0.2s;' : '');
      const mk = (lg, dup) => {
        const src = escapeHtml(lg.src ?? '');
        const altT = dup ? '' : escapeHtml(lg.alt ?? '');
        const href = resolveBlockUrl(lg.href ?? '');
        const img = `<img src="${src}" alt="${altT}" loading="lazy" style="${imgStyle}">`;
        const box = 'display:flex; align-items:center; justify-content:center;';
        if (String(lg.href ?? '').trim() !== '' && href !== '#') {
          return `<a href="${escapeHtml(href)}" class="cc-logo-item" rel="noopener"${dup ? ' tabindex="-1" aria-hidden="true"' : ''} style="${box}">${img}</a>`;
        }
        return `<div class="cc-logo-item"${dup ? ' aria-hidden="true"' : ''} style="${box}">${img}</div>`;
      };
      let set1 = '', set2 = '';
      for (const lg of logos) { set1 += mk(lg, false); set2 += mk(lg, true); }
      let css = gray ? `#${innerId} .cc-logo-item:hover img,#${innerId} .cc-logo-item:focus-visible img{filter:none !important; opacity:1 !important}` : '';
      let body;
      if (marquee) {
        // direction: right plays the same loop backwards; fade: edges fade out (both off when missing, as before)
        const reverse = c.direction === 'right' ? ' reverse' : '';
        const fade = c.fade === true;
        css += `@keyframes ccMq_${innerId}{from{transform:translateX(0)}to{transform:translateX(-50%)}}#${innerId} .cc-logos-track{animation:ccMq_${innerId} ${speed}s linear infinite${reverse}}#${innerId} .cc-logos-marquee:hover .cc-logos-track{animation-play-state:paused}`
          + (fade ? `#${innerId} .cc-logos-marquee{-webkit-mask-image:linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);mask-image:linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)}` : '')
          + `@media(prefers-reduced-motion:reduce){#${innerId} .cc-logos-track{animation:none; flex-wrap:wrap; width:auto !important}#${innerId} .cc-logos-set[aria-hidden="true"]{display:none}${fade ? `#${innerId} .cc-logos-marquee{-webkit-mask-image:none;mask-image:none}` : ''}}`;
        const setStyle = `display:flex; align-items:center; gap:${gap}px; padding-right:${gap}px;`;
        // contain:inline-size: the moving track (wider than the strip) never widens the page, a row or the editor
        body = `<div class="cc-logos-marquee" style="overflow:hidden; contain:inline-size;"><div class="cc-logos-track" style="display:flex; width:max-content;"><div class="cc-logos-set" style="${setStyle}">${set1}</div><div class="cc-logos-set" aria-hidden="true" style="${setStyle}">${set2}</div></div></div>`;
      } else {
        css += `@media(max-width:768px){#${innerId} .cc-logos-grid{grid-template-columns:repeat(${Math.min(cols, 3)}, 1fr) !important}}`;
        body = `<div class="cc-logos-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:${gap}px; align-items:center; justify-items:center;">${set1}</div>`;
      }
      return customCss + `<style>${css}</style><div id="${innerId}" class="cc-logos${animClass}${innerClass}" style="${styleAttr}">\n`
        + (title !== '' ? `<div class="cc-logos-title" style="text-align:center; font-size:14px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:24px;">${title}</div>` : '')
        + body + `\n</div>\n`;
    }

    case 'TEAM': {
      const c = content;
      const members = Array.isArray(c.members) ? c.members : [];
      let cols = Math.trunc(ccNum(c.columns ?? 0, 0, 4, 0));
      if (cols < 1) cols = Math.max(1, Math.min(4, members.length));
      const shape = c.photoShape ?? 'circle';
      const radius = shape === 'square' ? '0' : (shape === 'rounded' ? '16px' : '50%');
      const card = (c.layout ?? 'card') === 'card';
      const cardStyle = card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; ' : 'padding:8px; ';
      const linkDefs = [['email', 'Email'], ['linkedin', 'LinkedIn'], ['twitter', 'X'], ['website', 'Website']];
      let cells = '';
      for (const m of members) {
        const name = escapeHtml(m.name ?? '');
        const role = escapeHtml(m.role ?? '');
        const bio = escapeHtml(m.bio ?? '');
        const photo = String(m.photo ?? '').trim();
        const pstyle = `width:112px; height:112px; border-radius:${radius}; margin:0 auto 14px; `;
        const media = photo !== ''
          ? `<img src="${escapeHtml(photo)}" alt="${name}" loading="lazy" style="${pstyle}object-fit:cover; display:block;">`
          : `<div class="cc-member-initials" aria-hidden="true" style="${pstyle}background:#e0e7ff; color:#3730a3; display:flex; align-items:center; justify-content:center; font-size:36px; font-weight:700; text-transform:uppercase;">${escapeHtml(ccInitials(m.name ?? ''))}</div>`;
        let links = '';
        for (const ld of linkDefs) {
          const raw = String(m[ld[0]] ?? '').trim();
          if (raw === '') continue;
          let href;
          if (ld[0] === 'email') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) continue; href = 'mailto:' + raw; }
          else href = ccExtUrl(raw);
          links += `<a href="${escapeHtml(href)}" class="cc-member-link" rel="noopener" aria-label="${name} - ${ld[1]}" style="color:inherit;">${ld[1]}</a>`;
        }
        cells += `<div class="cc-member" style="${cardStyle}text-align:center;">${media}`
          + `<h3 class="cc-member-name" style="margin:0; font-size:18px;">${name}</h3>`
          + (role !== '' ? `<div class="cc-member-role" style="color:var(--brand-color, #3b82f6); font-weight:600; font-size:14px; margin-top:2px;">${role}</div>` : '')
          + (bio !== '' ? `<p class="cc-member-bio" style="margin:10px 0 0 0; font-size:14px; color:#64748b; line-height:1.55;">${bio}</p>` : '')
          + (links !== '' ? `<div class="cc-member-links" style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:12px; font-size:13px;">${links}</div>` : '')
          + `</div>`;
      }
      return customCss + `<style>@media(max-width:768px){#${innerId} .cc-team-grid{grid-template-columns:repeat(${Math.min(cols, 2)}, 1fr) !important}}@media(max-width:480px){#${innerId} .cc-team-grid{grid-template-columns:1fr !important}}</style>`
        + `<div id="${innerId}" class="cc-team${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-team-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:24px;">${cells}</div>\n</div>\n`;
    }

    case 'BEFORE_AFTER': {
      const c = content;
      const b = (c.before && typeof c.before === 'object') ? c.before : {};
      const a = (c.after && typeof c.after === 'object') ? c.after : {};
      const start = Math.round(ccNum(c.startPosition ?? 50, 0, 100, 50));
      const ar = escapeHtml(c.aspectRatio ?? '16 / 9');
      const showLabels = (c.showLabels ?? true) !== false;
      const img = 'width:100%; height:100%; object-fit:cover; display:block;';
      const chip = 'position:absolute; top:12px; background:rgba(15,23,42,0.7); color:#fff; font-size:12px; padding:3px 9px; border-radius:6px;';
      let h = `<style>#${innerId}:focus-within .cc-ba-knob{outline:2px solid var(--brand-color, #3b82f6); outline-offset:2px}</style>`;
      h += `<div id="${innerId}" class="cc-ba${animClass}${innerClass}" style="${styleAttr} --pos:${start}%; position:relative; overflow:hidden; aspect-ratio:${ar}; user-select:none;">\n`;
      h += `<img class="cc-ba-after" src="${escapeHtml(a.src ?? '')}" alt="${escapeHtml(a.alt ?? '')}" loading="lazy" style="position:absolute; top:0; left:0; ${img}">`;
      h += `<div class="cc-ba-before" style="position:absolute; top:0; left:0; width:100%; height:100%; clip-path:inset(0 calc(100% - var(--pos)) 0 0);"><img src="${escapeHtml(b.src ?? '')}" alt="${escapeHtml(b.alt ?? '')}" loading="lazy" style="${img}"></div>`;
      if (showLabels) {
        h += `<span class="cc-ba-label cc-ba-label-before" style="${chip} left:12px;">${escapeHtml(b.label ?? 'Before')}</span>`;
        h += `<span class="cc-ba-label cc-ba-label-after" style="${chip} right:12px;">${escapeHtml(a.label ?? 'After')}</span>`;
      }
      h += `<div class="cc-ba-handle" aria-hidden="true" style="position:absolute; top:0; bottom:0; left:var(--pos); width:2px; margin-left:-1px; background:#fff; pointer-events:none;"><span class="cc-ba-knob" style="position:absolute; top:50%; left:50%; width:36px; height:36px; margin:-18px 0 0 -18px; border-radius:50%; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; font-size:14px; color:#0f172a;">&#8596;</span></div>`;
      h += `<input type="range" class="cc-ba-range" min="0" max="100" step="0.1" value="${start}" aria-label="Comparison slider" style="position:absolute; top:0; left:0; width:100%; height:100%; margin:0; opacity:0; cursor:ew-resize;">\n`;
      h += `</div>\n`;
      return customCss + h;
    }

    case 'BUSINESS': {
      const c = content;
      const types = ['LocalBusiness', 'Restaurant', 'Store', 'CafeOrCoffeeShop', 'Dentist', 'HairSalon', 'HealthAndBeautyBusiness', 'ProfessionalService', 'LegalService', 'AutoRepair', 'Hotel', 'Organization'];
      void types;
      const nameRaw = String(c.name ?? '').trim();
      const addrLines = ccLines(c.address ?? '');
      const phone = String(c.phone ?? '').trim();
      const phoneDigits = phone.replace(/[^0-9+]/g, '');
      const email = String(c.email ?? '').trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const web = ccExtUrl(c.website ?? '');
      const closedLabel = escapeHtml(c.closedLabel ?? 'Closed');
      const hoursTitle = escapeHtml(c.hoursTitle ?? 'Opening hours');
      const note = escapeHtml(c.note ?? '');
      const hours = Array.isArray(c.hours) ? c.hours.slice(0, 7) : [];
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      let contact = '';
      if (nameRaw !== '') contact += `<h3 class="cc-biz-name" style="margin:0 0 10px 0; font-size:20px;">${escapeHtml(nameRaw)}</h3>`;
      if (addrLines.length) contact += `<address class="cc-biz-address" style="font-style:normal; line-height:1.6; margin:0 0 10px 0;">${ccBr(c.address ?? '')}</address>`;
      if (phoneDigits !== '') contact += `<div class="cc-biz-line" style="margin-bottom:4px;"><a class="cc-biz-link" href="tel:${escapeHtml(phoneDigits)}" style="color:inherit;">${escapeHtml(phone)}</a></div>`;
      if (emailOk) contact += `<div class="cc-biz-line" style="margin-bottom:4px;"><a class="cc-biz-link" href="mailto:${escapeHtml(email)}" style="color:inherit;">${escapeHtml(email)}</a></div>`;
      if (web !== '') contact += `<div class="cc-biz-line" style="margin-bottom:4px;"><a class="cc-biz-link" href="${escapeHtml(web)}" rel="noopener" style="color:inherit;">${escapeHtml(web.replace(/^https?:\/\//i, ''))}</a></div>`;
      if (addrLines.length && ((c.mapsLink ?? true) !== false)) {
        contact += `<a class="cc-biz-directions" rel="noopener" href="${escapeHtml('https://www.google.com/maps/search/?api=1&query=' + ccEnc(addrLines.join(', ')))}" style="display:inline-block; margin-top:12px; padding:9px 16px; border-radius:8px; background:var(--brand-color, #3b82f6); color:#fff; text-decoration:none; font-weight:600; font-size:14px;">${escapeHtml(c.directionsLabel ?? 'Get directions')}</a>`;
      }
      let rows = '';
      hours.forEach((hr, i) => {
        const closed = !!hr.closed;
        const open = String(hr.open ?? '').trim(); const close = String(hr.close ?? '').trim();
        const okTimes = /^\d{2}:\d{2}$/.test(open) && /^\d{2}:\d{2}$/.test(close);
        const val = (closed || !okTimes) ? closedLabel : escapeHtml(open) + '&ndash;' + escapeHtml(close);
        rows += `<tr style="border-bottom:1px solid #e2e8f0;"><th scope="row" style="text-align:left; padding:8px 0; font-weight:600;">${escapeHtml(hr.day ?? dayNames[i])}</th><td style="text-align:right; padding:8px 0;">${val}</td></tr>`;
      });
      let hoursHtml = '';
      if (rows !== '' || note !== '') {
        hoursHtml = `<div class="cc-biz-hours"><h3 class="cc-biz-hours-title" style="margin:0 0 10px 0; font-size:20px;">${hoursTitle}</h3>`
          + (rows !== '' ? `<table class="cc-biz-table" style="width:100%; border-collapse:collapse; font-size:15px;"><tbody>${rows}</tbody></table>` : '')
          + (note !== '' ? `<p class="cc-biz-note" style="margin:10px 0 0 0; font-size:13px; color:#64748b;">${note}</p>` : '') + `</div>`;
      }
      let h = `<style>@media(max-width:768px){#${innerId}{grid-template-columns:1fr !important}}</style>`;
      h += `<div id="${innerId}" class="cc-business${animClass}${innerClass}" style="${styleAttr} display:grid; grid-template-columns:repeat(2, 1fr); gap:32px;">\n`;
      h += `<div class="cc-biz-contact">${contact}</div>\n${hoursHtml}\n`;
      h += `</div>\n`;
      return customCss + h;
    }

    case 'COLLECTION_LIST':
      return `<!-- CollectionList: ${escapeHtml(content.collectionSlug || content.collectionId || '')} -->\n`;

    case 'HTML':
      return customCss + `<div id="${innerId}" class="cc-html-block${animClass}${innerClass}"${styleString}>\n${content.code ?? ''}\n</div>\n`;

    case 'SEARCH': {
      // Site search: the published page's script searches search-index.json (written at publish)
      const ph = escapeHtml(content.placeholder || 'Search the site…');
      const btn = escapeHtml(content.buttonText || 'Search');
      const empty = escapeHtml(content.noResults || 'No results for');
      const limit = ccInt(content.limit, 10, 1, 50);
      html = `<div id="${innerId}" class="cc-search${animClass}${innerClass}" style="${styleAttr}" data-index="{{BASE_URL}}search-index.json" data-empty="${empty}" data-limit="${limit}">\n`;
      html += `<form class="cc-search-form" role="search" style="display:flex; gap:8px; flex-wrap:wrap;">\n`;
      html += `<input type="search" name="q" aria-label="${ph}" placeholder="${ph}" style="flex:1 1 220px; min-width:0; padding:12px 14px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 8px); font:inherit; background:var(--cc-field-bg, #fff); color:inherit; box-sizing:border-box;">\n`;
      html += `<button type="submit" style="padding:12px 20px; border:none; border-radius:8px; background:var(--brand-color, #3b82f6); color:#fff; font:inherit; font-weight:600; cursor:pointer;">${btn}</button>\n`;
      html += `</form>\n<div class="cc-search-results" aria-live="polite" style="margin-top:16px;"></div>\n</div>\n`;
      return customCss + html;
    }

    case 'BENTO': {
      const c = content;
      const tiles = Array.isArray(c.tiles) ? c.tiles : [];
      const cols = ccInt(c.columns, 3, 2, 4);
      const rowH = ccInt(c.rowHeight, 180, 100, 400);
      const gap = ccInt(c.gap, 16, 0, 48);
      const hover = ['lift', 'zoom', 'none'].includes(c.hover) ? c.hover : 'lift';
      const spans = { normal: [1, 1], wide: [2, 1], tall: [1, 2], large: [2, 2] };
      let cells = '';
      for (const tile of tiles) {
        if (!tile || typeof tile !== 'object') continue;
        const size = typeof tile.size === 'string' && Object.prototype.hasOwnProperty.call(spans, tile.size) ? tile.size : 'normal';
        const img = ccImgUrl(ccStr(tile.image));
        const bg = ccColor(tile.bg, '#f1f5f9');
        const fg = ccColor(tile.color, img !== '' ? '#ffffff' : '#0f172a');
        const href = ccStr(tile.href).trim();
        const tag = href !== '' ? 'a' : 'div';
        const title = ccEsc(tile.title);
        const text = ccEsc(tile.text);
        const icon = ccEsc(tile.icon);
        cells += `<${tag} class="cc-bento-tile cc-bento-${size}"${href !== '' ? ` href="${escapeHtml(resolveBlockUrl(href))}"` : ''} style="grid-column:span ${spans[size][0]}; grid-row:span ${spans[size][1]}; position:relative; overflow:hidden; border-radius:16px; background:${bg}; color:${fg}; padding:24px; display:flex; flex-direction:column; justify-content:flex-end; text-decoration:none; min-width:0;">`
          + (img !== '' ? `<img class="cc-bento-img" src="${escapeHtml(img)}" alt="${ccEsc(tile.alt)}" loading="lazy" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"><div class="cc-bento-shade" aria-hidden="true" style="position:absolute; inset:0; background:linear-gradient(to top, rgba(15,23,42,0.78), rgba(15,23,42,0) 65%);"></div>` : '')
          + `<div class="cc-bento-body" style="position:relative;">`
          + (icon !== '' ? `<div class="cc-bento-icon" aria-hidden="true" style="font-size:28px; line-height:1; margin-bottom:10px;">${icon}</div>` : '')
          + (title !== '' ? `<h3 class="cc-bento-title" style="margin:0; font-size:20px; line-height:1.25; color:inherit;">${title}</h3>` : '')
          + (text !== '' ? `<p class="cc-bento-text" style="margin:6px 0 0 0; font-size:14px; line-height:1.5; opacity:0.85;">${text}</p>` : '')
          + `</div></${tag}>`;
      }
      return customCss + `<style>#${innerId} .cc-bento-tile{transition:transform .25s ease, box-shadow .25s ease}#${innerId} .cc-bento-img{transition:transform .5s ease}`
        + `#${innerId}.cc-bento-hover-lift .cc-bento-tile:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(15,23,42,0.16)}#${innerId}.cc-bento-hover-zoom .cc-bento-tile:hover .cc-bento-img{transform:scale(1.06)}`
        + `@media(max-width:768px){#${innerId} .cc-bento-grid{grid-template-columns:repeat(2, 1fr) !important}}@media(max-width:480px){#${innerId} .cc-bento-grid{grid-template-columns:1fr !important}#${innerId} .cc-bento-tile{grid-column:auto !important;grid-row:auto !important}}`
        + `@media(prefers-reduced-motion:reduce){#${innerId} .cc-bento-tile,#${innerId} .cc-bento-img{transition:none !important;transform:none !important}}</style>`
        + `<div id="${innerId}" class="cc-bento cc-bento-hover-${hover}${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-bento-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); grid-auto-rows:minmax(${rowH}px, auto); gap:${gap}px;">${cells}</div>\n</div>\n`;
    }

    case 'SPLIT_CTA': {
      const c = content;
      const gap = ccInt(c.gap, 16, 0, 48);
      const radius = ccInt(c.radius, 16, 0, 40);
      const side = (s, which, d) => {
        s = s && typeof s === 'object' ? s : {};
        const icon = ccEsc(s.icon);
        const title = ccEsc(s.title);
        const text = ccEsc(s.text);
        const btn = ccEsc(s.buttonText);
        return `<div class="cc-split-cta-side cc-split-cta-${which}" style="flex:1; min-width:0; background:${ccColor(s.bg, d[0])}; color:${ccColor(s.color, d[1])}; padding:40px 32px; border-radius:${radius}px; display:flex; flex-direction:column; align-items:flex-start; gap:12px;">`
          + (icon !== '' ? `<div class="cc-split-cta-icon" aria-hidden="true" style="font-size:32px; line-height:1;">${icon}</div>` : '')
          + (title !== '' ? `<h3 class="cc-split-cta-title" style="margin:0; font-size:24px; line-height:1.25; color:inherit;">${title}</h3>` : '')
          + (text !== '' ? `<p class="cc-split-cta-text" style="margin:0; font-size:15px; line-height:1.6; opacity:0.9;">${text}</p>` : '')
          + (btn !== '' ? `<a class="cc-split-cta-btn" href="${escapeHtml(resolveBlockUrl(s.buttonUrl))}" style="display:inline-block; margin-top:8px; padding:12px 22px; border-radius:8px; background:${ccColor(s.buttonBg, d[2])}; color:${ccColor(s.buttonColor, d[3])}; font-weight:700; text-decoration:none;">${btn}</a>` : '')
          + `</div>`;
      };
      return customCss + `<style>@media(max-width:768px){#${innerId} .cc-split-cta-row{flex-direction:column !important}}</style>`
        + `<div id="${innerId}" class="cc-split-cta${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-split-cta-row" style="display:flex; gap:${gap}px;">`
        + side(c.left, 'left', ['#0f172a', '#ffffff', '#3b82f6', '#ffffff'])
        + side(c.right, 'right', ['#eff6ff', '#0f172a', '#0f172a', '#ffffff'])
        + `</div>\n</div>\n`;
    }

    case 'CASE_STUDY': {
      const c = content;
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const vertical = c.layout === 'vertical';
      const img = ccImgUrl(ccStr(c.image));
      const logo = ccImgUrl(ccStr(c.logo));
      const client = ccEsc(c.client);
      const metric = ccEsc(c.metric);
      const metricLabel = ccEsc(c.metricLabel);
      const title = ccEsc(c.title);
      const text = ccEsc(c.text);
      const quote = ccEsc(c.quote);
      const quoteAuthor = ccEsc(c.quoteAuthor);
      const linkText = ccEsc(c.linkText);
      let body = '';
      if (logo !== '' || client !== '') {
        body += `<div class="cc-case-client" style="display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#64748b;">`
          + (logo !== '' ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" style="height:28px; width:auto; display:block;">` : '') + client + `</div>`;
      }
      if (metric !== '') {
        body += `<div class="cc-case-metric"><div class="cc-case-metric-value" style="font-size:44px; font-weight:800; line-height:1; color:${accent};">${metric}</div>`
          + (metricLabel !== '' ? `<div class="cc-case-metric-label" style="margin-top:4px; font-size:14px; color:#475569;">${metricLabel}</div>` : '') + `</div>`;
      }
      if (title !== '') body += `<h3 class="cc-case-title" style="margin:0; font-size:22px; line-height:1.3; color:#0f172a;">${title}</h3>`;
      if (text !== '') body += `<p class="cc-case-text" style="margin:0; font-size:15px; line-height:1.6; color:#475569;">${text}</p>`;
      if (quote !== '') {
        body += `<blockquote class="cc-case-quote" style="margin:0; padding-left:14px; border-left:3px solid ${accent}; font-style:italic; color:#334155; font-size:15px; line-height:1.55;">${quote}`
          + (quoteAuthor !== '' ? `<cite class="cc-case-quote-author" style="display:block; margin-top:6px; font-style:normal; font-weight:600; font-size:13px; color:#64748b;">&mdash; ${quoteAuthor}</cite>` : '') + `</blockquote>`;
      }
      if (linkText !== '') body += `<a class="cc-case-link" href="${escapeHtml(resolveBlockUrl(c.linkUrl))}" style="margin-top:auto; color:${accent}; font-weight:700; text-decoration:none;">${linkText} &rarr;</a>`;
      return customCss + `<style>@media(max-width:768px){#${innerId} .cc-case-card{flex-direction:column !important}#${innerId} .cc-case-media{flex:0 0 220px !important}}</style>`
        + `<article id="${innerId}" class="cc-case${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-case-card" style="display:flex; flex-direction:${vertical ? 'column' : 'row'}; background:#fff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; box-shadow:0 4px 18px rgba(15,23,42,0.06);">`
        + (img !== '' ? `<div class="cc-case-media" style="flex:${vertical ? '0 0 240px' : '0 0 42%'}; position:relative; min-height:220px; background:#e2e8f0;"><img src="${escapeHtml(img)}" alt="${ccEsc(c.alt)}" loading="lazy" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"></div>` : '')
        + `<div class="cc-case-body" style="flex:1; min-width:0; padding:32px; display:flex; flex-direction:column; gap:14px;">${body}</div>`
        + `</div>\n</article>\n`;
    }

    case 'AUTHOR_BIO': {
      const c = content;
      const centered = c.layout === 'centered';
      const boxed = c.boxed !== false;
      const name = ccEsc(c.name);
      const role = ccEsc(c.role);
      const label = ccEsc(c.label);
      const bio = ccBr(ccStr(c.bio));
      const photo = ccImgUrl(ccStr(c.photo));
      const pstyle = 'width:88px; height:88px; border-radius:50%; flex-shrink:0; ';
      const media = photo !== ''
        ? `<img class="cc-author-photo" src="${escapeHtml(photo)}" alt="${name}" loading="lazy" style="${pstyle}object-fit:cover; display:block;">`
        : `<div class="cc-author-initials" aria-hidden="true" style="${pstyle}background:#e0e7ff; color:#3730a3; display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:700; text-transform:uppercase;">${escapeHtml(ccInitials(ccStr(c.name)))}</div>`;
      let links = '';
      for (const l of (Array.isArray(c.links) ? c.links : [])) {
        if (!l || typeof l !== 'object') continue;
        const raw = ccStr(l.url).trim();
        const text = ccEsc(l.label);
        if (raw === '' || text === '') continue;
        const href = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? 'mailto:' + raw : ccExtUrl(raw);
        links += `<a href="${escapeHtml(href)}" class="cc-author-link" rel="noopener" style="color:var(--brand-color, #3b82f6); font-weight:600; text-decoration:none;">${text}</a>`;
      }
      return customCss + `<style>@media(max-width:600px){#${innerId} .cc-author-card{flex-direction:column !important;align-items:center !important;text-align:center}#${innerId} .cc-author-links{justify-content:center !important}}</style>`
        + `<aside id="${innerId}" class="cc-author${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-author-card" style="display:flex; flex-direction:${centered ? 'column' : 'row'}; align-items:${centered ? 'center' : 'flex-start'}; gap:20px; ${centered ? 'text-align:center; ' : ''}${boxed ? 'background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:24px; ' : ''}">`
        + media + `<div class="cc-author-body" style="min-width:0;">`
        + (label !== '' ? `<div class="cc-author-label" style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--brand-color, #3b82f6);">${label}</div>` : '')
        + `<div class="cc-author-name" style="font-size:20px; font-weight:700; color:#0f172a; margin-top:4px;">${name}</div>`
        + (role !== '' ? `<div class="cc-author-role" style="font-size:14px; color:#64748b;">${role}</div>` : '')
        + (bio !== '' ? `<p class="cc-author-bio" style="margin:10px 0 0 0; font-size:15px; line-height:1.6; color:#334155;">${bio}</p>` : '')
        + (links !== '' ? `<div class="cc-author-links" style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:14px; justify-content:${centered ? 'center' : 'flex-start'};">${links}</div>` : '')
        + `</div></div>\n</aside>\n`;
    }

    case 'REVIEW_SUMMARY': {
      const c = content;
      const color = ccColor(c.color, '#f59e0b');
      const stacked = c.layout === 'stacked';
      const avg = ccNum(c.average, 0, 5, 0);
      const avgTxt = ccFmtNum(avg, 1);
      const total = ccNum(c.total, 0, 1e9, 0);
      const title = ccEsc(c.title);
      const totalLabel = ccEsc(c.totalLabel);
      const source = ccEsc(c.source);
      const linkText = ccEsc(c.linkText);
      const mode = ['percent', 'count', 'none'].includes(c.rowValue) ? c.rowValue : 'percent';
      const rows = (Array.isArray(c.distribution) ? c.distribution : []).filter((r) => r && typeof r === 'object');
      const counts = rows.map((r) => ccNum(r.count, 0, 1e9, 0));
      const sum = counts.reduce((a, b) => a + b, 0);
      let dist = '';
      rows.forEach((r, i) => {
        const pct = sum > 0 ? counts[i] / sum * 100 : 0;
        const value = mode === 'percent' ? ccFmtNum(pct, 0) + '%' : (mode === 'count' ? ccFmtNum(counts[i], 0) : '');
        dist += `<li class="cc-rs-row" style="display:flex; align-items:center; gap:10px; font-size:14px;">`
          + `<span class="cc-rs-row-label" style="width:34px; flex-shrink:0; color:#475569;">${ccInt(r.stars, 5, 1, 5)} &#9733;</span>`
          + `<span class="cc-rs-bar" style="flex:1; height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;"><span class="cc-rs-bar-fill" style="display:block; height:100%; width:${ccFmtNum(pct, 1)}%; background:${color}; border-radius:999px;"></span></span>`
          + (value !== '' ? `<span class="cc-rs-row-value" style="width:48px; text-align:right; flex-shrink:0; color:#64748b;">${value}</span>` : '')
          + `</li>`;
      });
      const showDist = c.showDistribution !== false && dist !== '';
      return customCss + `<style>@media(max-width:640px){#${innerId} .cc-rs-card{flex-direction:column !important;align-items:stretch !important}}</style>`
        + `<div id="${innerId}" class="cc-review-summary${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-rs-card" style="display:flex; flex-direction:${stacked ? 'column' : 'row'}; gap:32px; align-items:${stacked ? 'stretch' : 'center'}; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:28px;">`
        + `<div class="cc-rs-score" style="flex:0 0 auto; text-align:center;">`
        + (title !== '' ? `<div class="cc-rs-title" style="font-size:14px; font-weight:700; color:#475569; margin-bottom:8px;">${title}</div>` : '')
        + `<div class="cc-rs-average" style="font-size:52px; font-weight:800; line-height:1; color:#0f172a;">${avgTxt}</div>`
        + `<div class="cc-rs-stars" role="img" aria-label="${avgTxt} out of 5 stars" style="position:relative; display:inline-block; margin-top:8px; font-size:26px; line-height:1; letter-spacing:2px; color:#e2e8f0;">&#9733;&#9733;&#9733;&#9733;&#9733;`
        + `<span class="cc-rs-stars-fill" aria-hidden="true" style="position:absolute; top:0; left:0; bottom:0; width:${ccFmtNum(avg / 5 * 100, 1)}%; overflow:hidden; white-space:nowrap; color:${color};">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>`
        + `<div class="cc-rs-total" style="margin-top:8px; font-size:14px; color:#64748b;">${ccFmtNum(total, 0)}${totalLabel !== '' ? ' ' + totalLabel : ''}</div>`
        + (source !== '' ? `<div class="cc-rs-source" style="margin-top:4px; font-size:12px; color:#94a3b8;">${source}</div>` : '')
        + (linkText !== '' ? `<a class="cc-rs-link" href="${escapeHtml(resolveBlockUrl(ccStr(c.linkUrl)))}" style="display:inline-block; margin-top:12px; font-size:14px; font-weight:700; color:var(--brand-color, #3b82f6); text-decoration:none;">${linkText} &rarr;</a>` : '')
        + `</div>`
        + (showDist ? `<ul class="cc-rs-dist" style="flex:1; min-width:0; list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px;">${dist}</ul>` : '')
        + `</div>\n</div>\n`;
    }

    case 'TESTIMONIAL_WALL': {
      const c = content;
      const items = (Array.isArray(c.items) ? c.items : []).filter((it) => it && typeof it === 'object');
      const cols = ccInt(c.columns, 3, 1, 4);
      const gap = ccInt(c.gap, 20, 0, 48);
      const card = c.cardStyle !== 'minimal';
      const showRatings = c.showRatings !== false;
      const starColor = ccColor(c.starColor, '#f59e0b');
      let cards = '';
      for (const it of items) {
        const name = ccEsc(it.name);
        const role = ccEsc(it.role);
        const quote = ccBr(ccStr(it.quote));
        const avatar = ccImgUrl(ccStr(it.avatar));
        const rating = ccInt(it.rating, 0, 0, 5);
        const astyle = 'width:40px; height:40px; border-radius:50%; flex-shrink:0; ';
        const media = avatar !== ''
          ? `<img class="cc-tw-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" style="${astyle}object-fit:cover; display:block;">`
          : `<span class="cc-tw-initials" aria-hidden="true" style="${astyle}background:#e0e7ff; color:#3730a3; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; text-transform:uppercase;">${escapeHtml(ccInitials(ccStr(it.name)))}</span>`;
        cards += `<figure class="cc-tw-card" style="break-inside:avoid; display:inline-block; width:100%; box-sizing:border-box; margin:0 0 ${gap}px 0; ${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:22px; box-shadow:0 2px 8px rgba(15,23,42,0.04);' : 'padding:8px 0;'}">`
          + (showRatings && rating > 0 ? `<div class="cc-tw-rating" role="img" aria-label="${rating} out of 5 stars" style="color:${starColor}; font-size:16px; letter-spacing:2px; margin-bottom:10px;">${'&#9733;'.repeat(rating)}${rating < 5 ? `<span style="color:#e2e8f0;">${'&#9733;'.repeat(5 - rating)}</span>` : ''}</div>` : '')
          + `<blockquote class="cc-tw-quote" style="margin:0; font-size:15px; line-height:1.6; color:#334155;">${quote}</blockquote>`
          + `<figcaption class="cc-tw-author" style="display:flex; align-items:center; gap:10px; margin-top:16px;">${media}<span style="min-width:0;">`
          + `<span class="cc-tw-name" style="display:block; font-weight:700; font-size:14px; color:#0f172a;">${name}</span>`
          + (role !== '' ? `<span class="cc-tw-role" style="display:block; font-size:13px; color:#64748b;">${role}</span>` : '')
          + `</span></figcaption></figure>`;
      }
      return customCss + `<style>@media(max-width:768px){#${innerId} .cc-tw-grid{column-count:${Math.min(cols, 2)} !important}}@media(max-width:480px){#${innerId} .cc-tw-grid{column-count:1 !important}}</style>`
        + `<div id="${innerId}" class="cc-testimonial-wall${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-tw-grid" style="column-count:${cols}; column-gap:${gap}px;">${cards}</div>\n</div>\n`;
    }

    case 'HOVER_GRID': {
      const c = content;
      const items = (Array.isArray(c.items) ? c.items : []).filter((it) => it && typeof it === 'object');
      const cols = ccInt(c.columns, 3, 1, 4);
      const gap = ccInt(c.gap, 16, 0, 48);
      const radius = ccInt(c.radius, 12, 0, 40);
      const ar = ['1 / 1', '4 / 3', '3 / 2', '16 / 9', '3 / 4'].includes(c.aspectRatio) ? c.aspectRatio : '4 / 3';
      const effect = c.effect === 'fade' ? 'fade' : 'slide';
      const overlay = ccColor(c.overlay, 'rgba(15,23,42,0.72)');
      let cells = '';
      for (const it of items) {
        const img = ccImgUrl(ccStr(it.image));
        const href = ccStr(it.href).trim();
        const tag = href !== '' ? 'a' : 'div';
        const title = ccEsc(it.title);
        const text = ccEsc(it.text);
        cells += `<${tag} class="cc-hg-item"${href !== '' ? ` href="${escapeHtml(resolveBlockUrl(href))}"` : ''} style="position:relative; display:block; overflow:hidden; border-radius:${radius}px; aspect-ratio:${ar}; background:#e2e8f0; color:#fff; text-decoration:none;">`
          + (img !== '' ? `<img class="cc-hg-img" src="${escapeHtml(img)}" alt="${ccEsc(it.alt)}" loading="lazy" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : '')
          + `<div class="cc-hg-reveal" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:flex-end; padding:20px; background:${overlay};">`
          + (title !== '' ? `<h3 class="cc-hg-title" style="margin:0; font-size:18px; line-height:1.3; color:#fff;">${title}</h3>` : '')
          + (text !== '' ? `<p class="cc-hg-text" style="margin:6px 0 0 0; font-size:14px; line-height:1.5; color:rgba(255,255,255,0.88);">${text}</p>` : '')
          + `</div></${tag}>`;
      }
      return customCss + `<style>#${innerId} .cc-hg-reveal{transition:opacity .3s ease, transform .3s ease}#${innerId}.cc-hg-fade .cc-hg-reveal{opacity:0}#${innerId}.cc-hg-slide .cc-hg-reveal{opacity:0;transform:translateY(16px)}`
        + `#${innerId} .cc-hg-item:hover .cc-hg-reveal,#${innerId} .cc-hg-item:focus-within .cc-hg-reveal,#${innerId} .cc-hg-item:focus .cc-hg-reveal{opacity:1;transform:none}`
        + `#${innerId} .cc-hg-img{transition:transform .5s ease}#${innerId} .cc-hg-item:hover .cc-hg-img{transform:scale(1.05)}`
        + `@media(hover:none){#${innerId} .cc-hg-reveal{opacity:1 !important;transform:none !important}}`
        + `@media(prefers-reduced-motion:reduce){#${innerId} .cc-hg-reveal,#${innerId} .cc-hg-img{transition:none !important}#${innerId} .cc-hg-item:hover .cc-hg-img{transform:none}}`
        + `@media(max-width:768px){#${innerId} .cc-hg-grid{grid-template-columns:repeat(${Math.min(cols, 2)}, 1fr) !important}}@media(max-width:480px){#${innerId} .cc-hg-grid{grid-template-columns:1fr !important}}</style>`
        + `<div id="${innerId}" class="cc-hover-grid cc-hg-${effect}${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-hg-grid" style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:${gap}px;">${cells}</div>\n</div>\n`;
    }

    case 'SCROLLYTELLING': {
      const c = content;
      const steps = (Array.isArray(c.steps) ? c.steps : []).filter((st) => st && typeof st === 'object').slice(0, 12);
      const right = c.side === 'right';
      const ratio = ['4 / 3', '1 / 1', '3 / 4', '16 / 9', '3 / 2'].includes(c.ratio) ? c.ratio : '4 / 3';
      const top = ccInt(c.stickyTop, 80, 0, 300);
      const stepH = ccInt(c.stepHeight, 70, 40, 120);
      const gap = ccInt(c.gap, 48, 0, 120);
      let imgs = '', items = '', rules = '';
      steps.forEach((st, i) => {
        const img = ccImgUrl(ccStr(st.image));
        const title = ccEsc(st.title);
        const text = ccBr(ccStr(st.text));
        imgs += img !== ''
          ? `<img class="cc-story-img" data-i="${i}" src="${escapeHtml(img)}" alt="${ccEsc(st.alt)}" loading="lazy" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">`
          : `<div class="cc-story-img cc-story-ph" data-i="${i}" aria-hidden="true" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:56px; font-weight:800; color:#94a3b8;">${i + 1}</div>`;
        items += `<li class="cc-story-step" data-i="${i}" style="min-height:${stepH}vh; display:flex; flex-direction:column; justify-content:center; padding:24px 0;">`
          + (title !== '' ? `<h3 class="cc-story-title" style="margin:0 0 10px 0; font-size:26px; line-height:1.25;">${title}</h3>` : '')
          + (text !== '' ? `<p class="cc-story-text" style="margin:0; font-size:16px; line-height:1.7; color:#475569;">${text}</p>` : '')
          + `</li>`;
        rules += `#${innerId}[data-active="${i}"] .cc-story-img[data-i="${i}"]{opacity:1}#${innerId}.cc-story-on[data-active="${i}"] .cc-story-step[data-i="${i}"]{opacity:1}`;
      });
      return customCss + `<style>#${innerId} .cc-story-img{opacity:0;transition:opacity .5s ease}#${innerId}.cc-story-on .cc-story-step{opacity:.35;transition:opacity .4s ease}${rules}`
        + `@media(max-width:768px){#${innerId} .cc-story-grid{grid-template-columns:1fr !important;gap:16px !important}#${innerId} .cc-story-media{order:0 !important;top:0 !important;z-index:2}#${innerId} .cc-story-frame{aspect-ratio:16 / 9 !important;max-height:36vh}#${innerId} .cc-story-step{min-height:55vh !important}}`
        + `@media(prefers-reduced-motion:reduce){#${innerId} .cc-story-img,#${innerId}.cc-story-on .cc-story-step{transition:none !important}}</style>`
        + `<div id="${innerId}" class="cc-story cc-story-${right ? 'right' : 'left'}${animClass}${innerClass}" data-active="0" style="${styleAttr}">\n`
        + `<div class="cc-story-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:${gap}px; align-items:start;">`
        + `<div class="cc-story-media" style="position:sticky; top:${top}px; align-self:start;${right ? ' order:2;' : ''}"><div class="cc-story-frame" style="position:relative; aspect-ratio:${ratio}; border-radius:16px; overflow:hidden; background:#e2e8f0;">${imgs}</div></div>`
        + `<ol class="cc-story-steps" style="list-style:none; margin:0; padding:0;">${items}</ol>`
        + `</div>\n</div>\n`;
    }

    case 'HOTSPOTS': {
      const c = content;
      const pins = (Array.isArray(c.pins) ? c.pins : []).filter((p) => p && typeof p === 'object').slice(0, 20);
      const img = ccImgUrl(ccStr(c.image));
      const ratio = ['16 / 9', '4 / 3', '3 / 2', '1 / 1', '21 / 9'].includes(c.ratio) ? c.ratio : '16 / 9';
      const color = ccColor(c.pinColor, '#3b82f6');
      const textColor = ccColor(c.pinTextColor, '#ffffff');
      const radius = ccInt(c.radius, 12, 0, 40);
      const pulse = c.pulse !== false;
      let cells = '';
      pins.forEach((p, i) => {
        const x = ccNum(p.x, 0, 100, 50);
        const y = ccNum(p.y, 0, 100, 50);
        const v = y > 55 ? 'above' : 'below';
        const h = x < 25 ? 'left' : (x > 75 ? 'right' : 'center');
        const title = ccEsc(p.title);
        const text = ccBr(ccStr(p.text));
        const linkText = ccEsc(p.linkText);
        cells += `<div class="cc-hs-pin cc-hs-${v} cc-hs-${h}" style="position:absolute; left:${ccFmtNum(x, 1)}%; top:${ccFmtNum(y, 1)}%; transform:translate(-50%, -50%);">`
          + `<button type="button" class="cc-hs-btn" aria-describedby="${innerId}-p${i}" aria-label="${title !== '' ? title : 'Hotspot ' + (i + 1)}" style="position:relative; width:30px; height:30px; padding:0; border-radius:50%; border:2px solid #fff; background:${color}; color:${textColor}; font:700 13px/1 inherit; cursor:pointer; box-shadow:0 2px 8px rgba(15,23,42,0.35);">`
          + (pulse ? `<span class="cc-hs-ring" aria-hidden="true" style="position:absolute; inset:-2px; border-radius:50%; background:${color}; pointer-events:none;"></span>` : '')
          + `<span class="cc-hs-num" style="position:relative;">${i + 1}</span></button>`
          + `<div class="cc-hs-pop" id="${innerId}-p${i}" role="tooltip" style="position:absolute; width:240px; max-width:70vw; padding:14px 16px; background:#fff; color:#0f172a; border-radius:10px; box-shadow:0 12px 32px rgba(15,23,42,0.22); font-size:14px; line-height:1.5; text-align:left;">`
          + (title !== '' ? `<strong class="cc-hs-title" style="display:block; margin-bottom:4px;">${title}</strong>` : '')
          + (text !== '' ? `<span class="cc-hs-text" style="display:block; color:#475569;">${text}</span>` : '')
          + (linkText !== '' ? `<a class="cc-hs-link" href="${escapeHtml(resolveBlockUrl(ccStr(p.href)))}" style="display:inline-block; margin-top:8px; font-weight:700; color:var(--brand-color, #3b82f6); text-decoration:none;">${linkText} &rarr;</a>` : '')
          + `</div></div>`;
      });
      const id = '#' + innerId;
      return customCss + `<style>${id} .cc-hs-pop{opacity:0;visibility:hidden;transition:opacity .15s ease}${id} .cc-hs-pin:hover,${id} .cc-hs-pin:focus-within,${id} .cc-hs-pin.is-open{z-index:3}`
        + `${id} .cc-hs-pin:hover .cc-hs-pop,${id} .cc-hs-pin:focus-within .cc-hs-pop,${id} .cc-hs-pin.is-open .cc-hs-pop{opacity:1;visibility:visible}`
        + `${id} .cc-hs-below .cc-hs-pop{top:calc(100% + 10px)}${id} .cc-hs-above .cc-hs-pop{bottom:calc(100% + 10px)}`
        + `${id} .cc-hs-center .cc-hs-pop{left:50%;transform:translateX(-50%)}${id} .cc-hs-left .cc-hs-pop{left:0}${id} .cc-hs-right .cc-hs-pop{right:0}`
        + `@keyframes ccHsRing_${innerId}{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.3);opacity:0}}${id} .cc-hs-ring{animation:ccHsRing_${innerId} 2s ease-out infinite}`
        + `@media(prefers-reduced-motion:reduce){${id} .cc-hs-ring{animation:none;display:none}${id} .cc-hs-pop{transition:none}}</style>`
        + `<div id="${innerId}" class="cc-hotspots${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-hs-stage" style="position:relative;">`
        + (img !== ''
          ? `<img class="cc-hs-img" src="${escapeHtml(img)}" alt="${ccEsc(c.alt)}" loading="lazy" style="display:block; width:100%; height:auto; border-radius:${radius}px;">`
          : `<div class="cc-hs-img cc-hs-ph" aria-hidden="true" style="aspect-ratio:${ratio}; background:#e2e8f0; border-radius:${radius}px;"></div>`)
        + cells + `</div>\n</div>\n`;
    }

    case 'TABLE_OF_CONTENTS': {
      const c = content;
      const title = ccEsc(c.title);
      const levels = c.levels === 'h2h3' ? 'h2h3' : 'h2';
      const sticky = c.sticky === true;
      const top = ccInt(c.stickyTop, 90, 0, 300);
      const offset = ccInt(c.offset, 80, 0, 300);
      const card = c.layout !== 'plain';
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const id = '#' + innerId;
      return customCss + `<style>${id} a{color:inherit;text-decoration:none}${id} a:hover{color:${accent}}${id} .cc-toc-item{margin:0;padding:4px 0}${id} .cc-toc-l3{padding-left:16px;font-size:.93em;opacity:.9}${id} .is-active>a{color:${accent};font-weight:700}${id} .cc-toc-num{opacity:.7}</style>`
        + `<nav id="${innerId}" class="cc-toc cc-toc-${card ? 'card' : 'plain'}${animClass}${innerClass}" hidden data-levels="${levels}" data-numbered="${c.numbered === true ? '1' : '0'}" data-highlight="${c.highlight !== false ? '1' : '0'}" data-offset="${offset}" aria-label="${title !== '' ? title : 'Table of contents'}" style="${styleAttr}${sticky ? ` position:sticky; top:${top}px;` : ''}">\n`
        + `<div class="cc-toc-box" style="${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:20px 22px;' : 'padding:0;'}">`
        + (title !== '' ? `<div class="cc-toc-title" style="font-weight:700; font-size:15px; margin-bottom:10px; color:#0f172a;">${title}</div>` : '')
        + `<ol class="cc-toc-list" style="list-style:none; margin:0; padding:0; font-size:14px; line-height:1.4; color:#475569;"></ol>`
        + `<p class="cc-toc-empty" hidden style="margin:0; font-size:13px; color:#94a3b8;">The headings of this page appear here.</p>`
        + `</div>\n</nav>\n`;
    }

    case 'SHARE_BAR': {
      const c = content;
      const title = ccEsc(c.title);
      const chosen = Array.isArray(c.networks) ? c.networks.filter((n) => typeof n === 'string') : [];
      const icons = c.style === 'icons';
      const radius = c.shape === 'square' ? '0' : (c.shape === 'rounded' ? '8px' : '999px');
      const colors = ['mono', 'dark'].includes(c.colors) ? c.colors : 'brand';
      const size = ccInt(c.size, 40, 28, 64);
      const align = c.align === 'center' ? 'center' : (c.align === 'right' ? 'flex-end' : 'flex-start');
      const textAlign = c.align === 'center' ? 'center' : (c.align === 'right' ? 'right' : 'left');
      let btns = '';
      for (const [net, label, glyph, brand] of SHARE_NETS) {
        if (!chosen.includes(net)) continue;
        const link = ['facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'email'].includes(net);
        const paint = colors === 'brand' ? `background:${brand}; color:#ffffff; border:1px solid ${brand};` : (colors === 'dark' ? 'background:#0f172a; color:#ffffff; border:1px solid #0f172a;' : 'background:#ffffff; color:#0f172a; border:1px solid #cbd5e1;');
        const inner = (glyph.startsWith('<svg') ? glyph : `<span class="cc-share-badge" aria-hidden="true" style="font-weight:800; font-size:14px; line-height:1;">${glyph}</span>`)
          + (icons ? '' : `<span class="cc-share-label">${label}</span>`);
        const aria = link && net !== 'email' ? `Share on ${label}` : (net === 'email' ? 'Share by email' : label);
        const st = `display:inline-flex; align-items:center; justify-content:center; gap:8px; height:${size}px; min-width:${size}px; padding:0 ${icons ? 0 : 16}px; box-sizing:border-box; border-radius:${radius}; font:600 14px/1 inherit; text-decoration:none; cursor:pointer; ${paint}`;
        btns += link
          ? `<a class="cc-share-btn cc-share-${net}" data-net="${net}" href="#" target="_blank" rel="noopener noreferrer" aria-label="${aria}" style="${st}">${inner}</a>`
          : `<button type="button" class="cc-share-btn cc-share-${net}" data-act="${net}" aria-label="${aria}" style="${st}">${inner}</button>`;
      }
      return customCss + `<style>#${innerId}[hidden],#${innerId} [hidden]{display:none !important}#${innerId} .cc-share-btn:hover{filter:brightness(.92)}#${innerId} .cc-share-btn:focus-visible{outline:2px solid var(--brand-color, #3b82f6);outline-offset:2px}</style>`
        + `<div id="${innerId}" class="cc-share${animClass}${innerClass}" hidden data-msg="${ccEsc(c.message)}" style="${styleAttr}">\n`
        + (title !== '' ? `<div class="cc-share-title" style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:10px; text-align:${textAlign};">${title}</div>` : '')
        + `<div class="cc-share-list" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:${align};">${btns}</div>\n</div>\n`;
    }

    case 'CODE_SNIPPET': {
      const c = content;
      const langRow = CODE_LANGS.find((l) => l[0] === c.language) || CODE_LANGS[CODE_LANGS.length - 1];
      const lang = langRow[0];
      const code = [...ccStr(c.code).replace(/\r\n?/g, '\n').replace(/\n+$/, '')].slice(0, 50000).join('');
      const filename = ccEsc(c.filename);
      const dark = c.theme !== 'light';
      const fs = ccInt(c.fontSize, 14, 11, 20);
      const maxH = ccInt(c.maxHeight, 0, 0, 1200);
      const copy = c.copyButton !== false;
      const lineNums = c.lineNumbers === true;
      const pal = dark ? ['#0f172a', '#e2e8f0', '#1e293b', '#111c33', '#94a3b8'] : ['#f8fafc', '#0f172a', '#e2e8f0', '#f1f5f9', '#64748b'];
      const tk = dark
        ? { c: '#7c8aa5', s: '#86efac', k: '#c4b5fd', n: '#fdba74', f: '#7dd3fc', v: '#fca5a5', t: '#f472b6', a: '#fcd34d' }
        : { c: '#64748b', s: '#15803d', k: '#7c3aed', n: '#c2410c', f: '#0369a1', v: '#b91c1c', t: '#be185d', a: '#b45309' };
      let tokCss = '';
      for (const k of Object.keys(tk)) tokCss += `#${innerId} .cc-tk-${k}{color:${tk[k]}${k === 'c' ? ';font-style:italic' : ''}}`;
      const showBar = filename !== '' || langRow[1] !== '' || copy;
      const lines = code.split('\n').length;
      let gutter = '';
      if (lineNums) { const nums = []; for (let i = 1; i <= lines; i++) nums.push(i); gutter = nums.join('\n'); }
      return customCss + `<style>${tokCss}#${innerId} .cc-code-copy:hover{filter:brightness(1.2)}</style>`
        + `<figure id="${innerId}" class="cc-code cc-code-${dark ? 'dark' : 'light'}${animClass}${innerClass}" data-lang="${lang}" style="${styleAttr} margin:0; border-radius:12px; overflow:hidden; background:${pal[0]}; color:${pal[1]}; border:1px solid ${pal[2]};">\n`
        + (showBar ? `<div class="cc-code-bar" style="display:flex; align-items:center; gap:10px; padding:8px 14px; background:${pal[3]}; border-bottom:1px solid ${pal[2]}; font:600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:${pal[4]};">`
          + `<span class="cc-code-file" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${filename !== '' ? filename : langRow[1]}</span>`
          + (filename !== '' && langRow[1] !== '' ? `<span class="cc-code-lang">${langRow[1]}</span>` : '')
          + (copy ? `<button type="button" class="cc-code-copy" hidden aria-label="Copy the code" style="padding:5px 10px; border-radius:6px; border:1px solid ${pal[2]}; background:transparent; color:inherit; font:600 12px/1 inherit; cursor:pointer;">Copy</button>` : '')
          + `</div>` : '')
        + `<div class="cc-code-scroll" style="overflow:auto;${maxH > 0 ? ` max-height:${maxH}px;` : ''}">`
        + `<div class="cc-code-wrap" style="display:flex; min-width:max-content; font:${fs}px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">`
        + (lineNums ? `<span class="cc-code-gutter" aria-hidden="true" style="flex:0 0 auto; padding:16px 12px 16px 16px; text-align:right; white-space:pre; user-select:none; color:${pal[4]};">${gutter}</span>` : '')
        + `<pre class="cc-code-pre" style="flex:1; margin:0; padding:16px; white-space:pre; tab-size:2; font:inherit;"><code class="cc-code-code" style="font:inherit;">${escapeHtml(code)}</code></pre>`
        + `</div></div>\n</figure>\n`;
    }

    case 'PRICE_CALCULATOR': {
      const c = content;
      const objs = (v) => (Array.isArray(v) ? v : []).filter((o) => o && typeof o === 'object');
      const sliders = objs(c.sliders).slice(0, 6);
      const addons = objs(c.addons).slice(0, 8);
      const cur = [...ccStr(c.currency).trim()].slice(0, 6).join('');
      const after = c.currencyPos === 'after';
      const eu = c.numberFormat === 'eu';
      const dec = ccInt(c.decimals, 0, 0, 2);
      const base = ccNum(c.basePrice, 0, 1e7, 0);
      const disc = ccNum(c.yearlyDiscount, 0, 90, 0);
      const toggle = c.billingToggle === true;
      const yearly = toggle && c.defaultBilling === 'yearly';
      const f = yearly ? 12 * (1 - disc / 100) : 1;
      const word = (v, d) => ccEsc([...(ccStr(v).trim() || d)].slice(0, 30).join(''));
      const perM = ' / ' + word(c.periodMonth, 'month');
      const perY = ' / ' + word(c.periodYear, 'year');
      const saveTpl = ccEsc([...(ccStr(c.saveText).trim() || 'You save {amount} a year')].slice(0, 80).join(''));
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const card = c.layout !== 'plain';
      const title = ccEsc(c.title);
      const intro = ccBr(ccStr(c.intro));
      const curHtml = escapeHtml(cur);   // the symbol goes into the page as text: escaped
      const money = (v) => ccMoney(v, dec, eu, curHtml, after);
      let total = base, controls = '', lines = '';
      if (base > 0) lines += `<li class="cc-calc-line" data-line="base" style="display:flex; justify-content:space-between; gap:12px; font-size:14px; color:#475569; padding:4px 0;"><span class="cc-calc-line-label">${word(c.baseLabel, 'Base price')}</span><span class="cc-calc-line-amt">${money(base * f)}</span></li>`;
      sliders.forEach((sl, i) => {
        const min = ccNum(sl.min, -1e9, 1e9, 0);
        let max = ccNum(sl.max, -1e9, 1e9, 100);
        if (max <= min) max = min + 1;
        const step = ccNum(sl.step, 0.01, 1e6, 1);
        const val = Math.min(max, Math.max(min, ccNum(sl.value, -1e9, 1e9, min)));
        const price = ccNum(sl.price, 0, 1e7, 0);
        const incl = ccNum(sl.included, 0, 1e9, 0);
        const unit = ccEsc([...ccStr(sl.unit).trim()].slice(0, 30).join(''));
        const label = ccEsc(sl.label);
        const cost = Math.max(0, val - incl) * price;
        total += cost;
        const sid = `${innerId}-s${i}`;
        controls += `<div class="cc-calc-row" style="margin-bottom:22px;"><div class="cc-calc-head" style="display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-weight:600; font-size:15px; color:#0f172a;"><label for="${sid}">${label}</label><output class="cc-calc-val" for="${sid}" data-for="${sid}">${ccPlain(val)}${unit !== '' ? ' ' + unit : ''}</output></div>`
          + `<input type="range" class="cc-calc-range" id="${sid}" min="${ccPlain(min)}" max="${ccPlain(max)}" step="${ccPlain(step)}" value="${ccPlain(val)}" data-price="${ccPlain(price)}" data-incl="${ccPlain(incl)}" data-unit="${unit}" data-line="s${i}" style="width:100%; accent-color:${accent};"></div>`;
        lines += `<li class="cc-calc-line"${cost !== 0 ? '' : ' hidden'} data-line="s${i}" style="display:flex; justify-content:space-between; gap:12px; font-size:14px; color:#475569; padding:4px 0;"><span class="cc-calc-line-label">${label}</span><span class="cc-calc-line-amt">${money(cost * f)}</span></li>`;
      });
      addons.forEach((ad, i) => {
        const price = ccNum(ad.price, 0, 1e7, 0);
        const on = ad.checked === true;
        const label = ccEsc(ad.label);
        if (on) total += price;
        controls += `<label class="cc-calc-addon-row" style="display:flex; align-items:center; gap:10px; margin-bottom:12px; font-size:15px; color:#0f172a; cursor:pointer;"><input type="checkbox" class="cc-calc-addon" data-price="${ccPlain(price)}" data-line="a${i}"${on ? ' checked' : ''} style="width:18px; height:18px; accent-color:${accent};"><span class="cc-calc-addon-label" style="flex:1;">${label}</span><span class="cc-calc-addon-price" style="color:#64748b; font-size:14px;">+ ${money(price)}${perM}</span></label>`;
        lines += `<li class="cc-calc-line"${on ? '' : ' hidden'} data-line="a${i}" style="display:flex; justify-content:space-between; gap:12px; font-size:14px; color:#475569; padding:4px 0;"><span class="cc-calc-line-label">${label}</span><span class="cc-calc-line-amt">${money(price * f)}</span></li>`;
      });
      const saved = total * 12 - total * f;
      const saveShown = yearly && saved > 0;
      const btnText = ccEsc(c.buttonText);
      const note = ccBr(ccStr(c.note));
      const id = '#' + innerId;
      const billing = toggle
        ? `<div class="cc-calc-billing" role="radiogroup" aria-label="Billing period" style="display:inline-flex; padding:4px; background:#f1f5f9; border-radius:999px; margin-bottom:24px;">`
          + `<label class="cc-calc-pill"><input type="radio" name="${innerId}-billing" value="monthly"${yearly ? '' : ' checked'}><span>${word(c.monthlyLabel, 'Monthly')}</span></label>`
          + `<label class="cc-calc-pill"><input type="radio" name="${innerId}-billing" value="yearly"${yearly ? ' checked' : ''}><span>${word(c.yearlyLabel, 'Yearly')}${disc > 0 ? `<em class="cc-calc-badge"> -${ccPlain(disc)}%</em>` : ''}</span></label></div>`
        : '';
      return customCss + `<style>${id}[hidden],${id} [hidden]{display:none !important}${id} .cc-calc-pill input{position:absolute;opacity:0;pointer-events:none}${id} .cc-calc-pill span{display:inline-block;padding:8px 18px;border-radius:999px;font-weight:600;font-size:14px;color:#475569;cursor:pointer}${id} .cc-calc-pill input:checked+span{background:#fff;color:#0f172a;box-shadow:0 1px 4px rgba(15,23,42,0.15)}${id} .cc-calc-pill input:focus-visible+span{outline:2px solid ${accent};outline-offset:2px}${id} .cc-calc-badge{font-style:normal;color:${accent};font-weight:700}${id} .cc-calc-btn:hover{filter:brightness(.92)}${id} input[type=range]:focus-visible,${id} .cc-calc-addon:focus-visible{outline:2px solid ${accent};outline-offset:2px}</style>`
        + `<div id="${innerId}" class="cc-calc${animClass}${innerClass}" data-base="${ccPlain(base)}" data-disc="${ccPlain(disc)}" data-dec="${dec}" data-fmt="${eu ? 'eu' : 'en'}" data-cur="${ccEsc(cur)}" data-pos="${after ? 'after' : 'before'}" data-per-m="${perM}" data-per-y="${perY}" data-save="${saveTpl}" style="${styleAttr}">\n`
        + `<div class="cc-calc-card" style="${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;'}">`
        + (title !== '' ? `<div class="cc-calc-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">${title}</div>` : '')
        + (intro !== '' ? `<p class="cc-calc-intro" style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">${intro}</p>` : '')
        + billing
        + `<div class="cc-calc-controls">${controls}</div>`
        + `<div class="cc-calc-summary" style="border-top:1px solid #e2e8f0; padding-top:18px; margin-top:8px;">`
        + (lines !== '' ? `<ul class="cc-calc-lines" style="list-style:none; margin:0 0 12px 0; padding:0;">${lines}</ul>` : '')
        + `<div class="cc-calc-total-row" role="status" aria-live="polite" aria-atomic="true" style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;"><span class="cc-calc-total-label" style="font-weight:700; font-size:15px; color:#0f172a;">${word(c.totalLabel, 'Estimated total')}</span><span><strong class="cc-calc-amount" style="font-size:40px; font-weight:800; line-height:1.1; color:#0f172a;">${money(total * f)}</strong><span class="cc-calc-per" style="font-size:15px; color:#64748b;">${yearly ? perY : perM}</span></span></div>`
        + `<div class="cc-calc-save"${saveShown ? '' : ' hidden'} style="margin-top:6px; text-align:right; font-size:14px; font-weight:600; color:${accent};">${saveShown ? saveTpl.split('{amount}').join(money(saved)) : ''}</div>`
        + (btnText !== '' ? `<a class="cc-calc-btn" href="${escapeHtml(resolveBlockUrl(ccStr(c.buttonUrl)))}" style="display:block; margin-top:20px; padding:14px 24px; text-align:center; border-radius:10px; background:${accent}; color:#ffffff; font-weight:700; text-decoration:none;">${btnText}</a>` : '')
        + (note !== '' ? `<p class="cc-calc-note" style="margin:12px 0 0 0; font-size:13px; line-height:1.5; color:#64748b;">${note}</p>` : '')
        + `</div></div>\n</div>\n`;
    }

    case 'WIZARD': {
      const c = content;
      const objs = (v) => (Array.isArray(v) ? v : []).filter((o) => o && typeof o === 'object');
      const steps = objs(c.steps).slice(0, 8);
      const n = steps.length;
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const dots = c.progress === 'steps';
      const card = c.layout !== 'plain';
      const text = (v, d, max) => ccEsc([...(ccStr(v).trim() || d)].slice(0, max).join(''));
      const title = ccEsc(c.title);
      const intro = ccBr(ccStr(c.intro));
      const stepLabel = text(c.stepLabel, 'Step {n} of {total}', 60);
      const successMsg = ccStr(c.successMsg).trim() || 'Thank you! We will be in touch.';
      const formId = c.customId ? 'f_' + String(c.customId).replace(/[^a-zA-Z0-9_-]/g, '') : 'f_' + String(block.id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      let fi = 0, stepsHtml = '', dotsHtml = '';
      steps.forEach((st, si) => {
        const fields = objs(st.fields).slice(0, 12);
        const stTitle = ccEsc(st.title);
        const desc = ccBr(ccStr(st.description));
        let inner = '';
        fields.forEach((f) => {
          if (fi >= 40) return;
          const name = 'field_' + fi, fid = `${innerId}-f${fi}`;
          const label = ccEsc(f.label);
          const type = WIZARD_TYPES.includes(f.type) ? f.type : 'text';
          const req = f.required === true ? ' required' : '';
          const opts = ccLines(ccStr(f.options)).slice(0, 20).map((o) => [...o].slice(0, 100).join(''));
          fi++;
          inner += `<input type="hidden" name="_label_${name}" value="${label}">\n`;
          if (type === 'radio' || type === 'checkboxes') {
            const radio = type === 'radio';
            inner += `<fieldset class="cc-wz-field cc-wz-group" data-req="${!radio && req !== '' ? '1' : '0'}" style="border:0; margin:0 0 16px 0; padding:0; min-width:0;"><legend class="cc-wz-label" style="padding:0;">${label}</legend>`
              + opts.map((o) => `<label class="cc-wz-opt" style="display:flex; align-items:center; gap:8px; margin:6px 0; font-size:15px; color:#0f172a;"><input type="${radio ? 'radio' : 'checkbox'}" name="${name}${radio ? '' : '[]'}" value="${escapeHtml(o)}"${radio ? req : ''} style="width:18px; height:18px; accent-color:${accent};"><span>${escapeHtml(o)}</span></label>`).join('')
              + `</fieldset>\n`;
          } else if (type === 'consent') {
            inner += `<div class="cc-wz-field"><label class="cc-wz-opt" style="display:flex; align-items:flex-start; gap:8px; font-size:14px; color:#475569;"><input type="checkbox" id="${fid}" name="${name}" value="Yes"${req} style="width:18px; height:18px; margin-top:2px; accent-color:${accent};"><span>${label}</span></label></div>\n`;
          } else if (type === 'select') {
            inner += `<div class="cc-wz-field"><label class="cc-wz-label" for="${fid}">${label}</label><select id="${fid}" name="${name}"${req} style="${WZ_INPUT}"><option value="">${text(f.placeholder, 'Choose an option', 60)}</option>`
              + opts.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('') + `</select></div>\n`;
          } else if (type === 'textarea') {
            inner += `<div class="cc-wz-field"><label class="cc-wz-label" for="${fid}">${label}</label><textarea id="${fid}" name="${name}"${req} rows="4" style="${WZ_INPUT}"></textarea></div>\n`;
          } else {
            inner += `<div class="cc-wz-field"><label class="cc-wz-label" for="${fid}">${label}</label><input type="${type}" id="${fid}" name="${name}"${req} style="${WZ_INPUT}"></div>\n`;
          }
        });
        stepsHtml += `<fieldset class="cc-wz-step" data-i="${si}" tabindex="-1" style="border:0; margin:0; padding:0; min-width:0;"><legend class="cc-wz-step-title" style="padding:0; font-size:20px; font-weight:700; color:#0f172a; margin-bottom:4px;">${stTitle !== '' ? stTitle : 'Step ' + (si + 1)}</legend>`
          + (desc !== '' ? `<p class="cc-wz-step-desc" style="margin:0 0 16px 0; font-size:14px; color:#64748b;">${desc}</p>` : '')
          + inner + `</fieldset>\n`;
        dotsHtml += `<li class="cc-wz-dot${si === 0 ? ' is-current' : ''}"${si === 0 ? ' aria-current="step"' : ''}><span class="cc-wz-dot-n">${si + 1}</span><span class="cc-wz-dot-t">${stTitle !== '' ? stTitle : 'Step ' + (si + 1)}</span></li>`;
      });
      const pct = n > 0 ? (100 / n).toFixed(1) : '100.0';
      const progress = `<div class="cc-wz-progress" hidden style="margin-bottom:24px;">`
        + (dots ? `<ol class="cc-wz-dots" style="list-style:none; display:flex; gap:8px; margin:0 0 10px 0; padding:0;">${dotsHtml}</ol>` : `<div class="cc-wz-track" style="height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;"><div class="cc-wz-fill" style="height:100%; width:${pct}%; background:${accent}; border-radius:999px;"></div></div>`)
        + `<div class="cc-wz-count" aria-live="polite" style="margin-top:8px; font-size:13px; color:#64748b;">${stepLabel.split('{n}').join('1').split('{total}').join(String(n))}</div></div>`;
      const id = '#' + innerId;
      return customCss + `<style>${id} .cc-wz-label{display:block;margin-bottom:6px;font-weight:600;font-size:14px;color:#0f172a}${id} .cc-wz-field{margin-bottom:16px}${id} input:focus-visible,${id} select:focus,${id} textarea:focus{outline:2px solid ${accent};outline-offset:1px}`
        + `${id} .cc-wz-dot{display:flex;align-items:center;gap:8px;flex:1;font-size:13px;color:#94a3b8}${id} .cc-wz-dot-n{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#475569;font-weight:700;flex-shrink:0}`
        + `${id} .cc-wz-dot.is-current .cc-wz-dot-n,${id} .cc-wz-dot.is-done .cc-wz-dot-n{background:${accent};color:#fff}${id} .cc-wz-dot.is-current{color:#0f172a;font-weight:600}${id} .cc-wz-fill{transition:width .3s ease}${id} .cc-wz-step:focus{outline:none}${id} button:hover{filter:brightness(.94)}`
        + `@media(max-width:600px){${id} .cc-wz-dot-t{display:none}${id} .cc-wz-card{padding:20px !important}}@media(prefers-reduced-motion:reduce){${id} .cc-wz-fill{transition:none}}</style>`
        + `<div id="${innerId}" class="cc-wizard${animClass}${innerClass}" data-step-label="${stepLabel}" style="${styleAttr}">\n`
        + `<div class="cc-wz-card" style="${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;'}">`
        + (title !== '' ? `<div class="cc-wz-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">${title}</div>` : '')
        + (intro !== '' ? `<p class="cc-wz-intro" style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">${intro}</p>` : '')
        + progress
        + `<form id="${formId}" class="cc-wz-form" action="{{BASE_URL}}canvascore-admin/submit_form.php" method="POST">\n<input type="hidden" name="_form" value="${formId}">\n<input type="hidden" name="_success" value="${escapeHtml(successMsg)}">\n<input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute; left:-9999px; width:0; height:0; opacity:0;">\n`
        + stepsHtml
        + `<div class="cc-wz-nav" style="display:flex; align-items:center; gap:10px; margin-top:24px;"><button type="button" class="cc-wz-back" hidden style="${WZ_BTN} background:#ffffff; color:#0f172a; border:1px solid #cbd5e1;">${text(c.backText, 'Back', 30)}</button><span style="flex:1;"></span>`
        + `<button type="button" class="cc-wz-next" hidden style="${WZ_BTN} background:${accent}; color:#ffffff; border:none;">${text(c.nextText, 'Next', 30)}</button>`
        + `<button type="submit" class="cc-wz-submit" style="${WZ_BTN} background:${accent}; color:#ffffff; border:none;">${text(c.btnText, 'Send', 30)}</button></div>\n</form>\n</div>\n</div>\n`;
    }

    case 'VIDEO_HERO': {
      const c = content;
      const objs = (v) => (Array.isArray(v) ? v : []).filter((o) => o && typeof o === 'object');
      const sources = [ccMediaSrc(ccStr(c.video)), ccMediaSrc(ccStr(c.video2))].filter((u) => u !== '');
      const poster = ccImgUrl(ccStr(c.poster));
      const overlay = ccColor(c.overlay, '#0f172a');
      const op = ccInt(c.overlayOpacity, 55, 0, 90);
      const h = ccInt(c.height, 560, 280, 1000);
      const center = c.align !== 'left';
      const color = ccColor(c.textColor, '#ffffff');
      const title = ccEsc(c.title);
      const subtitle = ccBr(ccStr(c.subtitle));
      const btns = objs(c.buttons).slice(0, 2).filter((b) => ccStr(b.text).trim() !== '');
      let btnHtml = '';
      for (const b of btns) {
        const primary = b.style !== 'secondary';
        btnHtml += `<a class="cc-vh-btn cc-vh-btn-${primary ? 'primary' : 'secondary'}" href="${escapeHtml(resolveBlockUrl(ccStr(b.url)))}" style="padding:14px 28px; border-radius:10px; font-weight:700; text-decoration:none; ${primary ? 'background:#ffffff; color:#0f172a;' : 'border:2px solid rgba(255,255,255,0.85); color:#ffffff;'}">${ccEsc(b.text)}</a>`;
      }
      const icon = (cls, d, hidden) => `<svg class="${cls}"${hidden ? ' style="display:none"' : ''} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${d}</svg>`;
      return customCss + `<style>#${innerId} [hidden]{display:none !important}</style>`
        + `<section id="${innerId}" class="cc-vhero${animClass}${innerClass}" data-mobile="${c.mobileVideo === true ? '1' : '0'}" style="${styleAttr} position:relative; overflow:hidden; min-height:${h}px; display:flex; align-items:center; justify-content:center; background:#0f172a; color:${color};">\n`
        + (poster !== '' ? `<div class="cc-vh-poster" aria-hidden="true" style="position:absolute; inset:0; background-image:url('${escapeHtml(ccCssUrl(poster))}'); background-size:cover; background-position:center;"></div>` : '')
        + (sources.length ? `<video class="cc-vh-video" muted loop playsinline preload="none" aria-hidden="true"${poster !== '' ? ` poster="${escapeHtml(poster)}"` : ''} style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">${sources.map((u) => `<source src="${escapeHtml(u)}"${ccMediaMime(u) !== '' ? ` type="${ccMediaMime(u)}"` : ''}>`).join('')}</video>` : '')
        + `<div class="cc-vh-overlay" aria-hidden="true" style="position:absolute; inset:0; background:${overlay}; opacity:${ccPlain(op / 100)};"></div>`
        + `<div class="cc-vh-inner" style="position:relative; width:100%; max-width:900px; padding:64px 24px; box-sizing:border-box; text-align:${center ? 'center' : 'left'}; ${center ? 'margin:0 auto;' : 'margin-right:auto;'}">`
        + (title !== '' ? `<h2 class="cc-vh-title" style="margin:0; font-size:clamp(32px, 5vw, 56px); line-height:1.1; font-weight:800; color:inherit;">${title}</h2>` : '')
        + (subtitle !== '' ? `<p class="cc-vh-subtitle" style="margin:16px 0 0 0; font-size:clamp(16px, 2vw, 20px); line-height:1.6; opacity:0.92;">${subtitle}</p>` : '')
        + (btnHtml !== '' ? `<div class="cc-vh-buttons" style="display:flex; gap:12px; flex-wrap:wrap; justify-content:${center ? 'center' : 'flex-start'}; margin-top:28px;">${btnHtml}</div>` : '')
        + `</div>`
        + (sources.length && c.showPause !== false ? `<button type="button" class="cc-vh-toggle" hidden aria-label="Pause the background video" style="position:absolute; right:16px; bottom:16px; width:40px; height:40px; padding:0; border-radius:50%; border:1px solid rgba(255,255,255,0.6); background:rgba(15,23,42,0.55); color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center;">${icon('cc-vh-i-pause', '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', false)}${icon('cc-vh-i-play', '<path d="M8 5v14l11-7z"/>', true)}</button>` : '')
        + `</section>\n`;
    }

    case 'AUDIO_PLAYER': {
      const c = content;
      const src = ccMediaSrc(ccStr(c.src));
      const cover = ccImgUrl(ccStr(c.cover));
      const title = ccEsc(c.title);
      const artist = ccEsc(c.artist);
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const card = c.layout !== 'plain';
      const skip = c.skip !== false;
      const speed = c.speed !== false;
      const ico = (cls, d, hidden) => `<svg class="${cls}"${hidden ? ' style="display:none"' : ''} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">${d}</svg>`;
      const sBtn = 'min-width:44px; height:36px; padding:0 10px; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font:600 13px/1 inherit; cursor:pointer;';
      return customCss + `<style>#${innerId} button:hover{filter:brightness(.95)}#${innerId} button:focus-visible,#${innerId} input:focus-visible{outline:2px solid ${accent};outline-offset:2px}</style>`
        + `<div id="${innerId}" class="cc-audio${animClass}${innerClass}" data-skip="15" style="${styleAttr}">\n`
        + `<div class="cc-au-card" style="${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:20px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;'}">`
        + (title !== '' || artist !== '' || cover !== ''
          ? `<div class="cc-au-head" style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">`
            + (cover !== '' ? `<img class="cc-au-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" style="width:64px; height:64px; border-radius:10px; object-fit:cover; flex-shrink:0;">` : '')
            + `<div class="cc-au-meta" style="min-width:0;">`
            + (title !== '' ? `<div class="cc-au-title" style="font-weight:700; font-size:17px; color:#0f172a;">${title}</div>` : '')
            + (artist !== '' ? `<div class="cc-au-artist" style="font-size:14px; color:#64748b; margin-top:2px;">${artist}</div>` : '')
            + `</div></div>` : '')
        + `<audio class="cc-au-el" controls preload="none"${src !== '' ? ` src="${escapeHtml(src)}"` : ''} style="display:block; width:100%;"></audio>`
        + `<div class="cc-au-ui" hidden>`
        + `<div class="cc-au-bar" style="display:flex; align-items:center; gap:10px;"><span class="cc-au-cur" style="min-width:40px; font-size:13px; font-variant-numeric:tabular-nums; color:#64748b;">0:00</span>`
        + `<input type="range" class="cc-au-seek" min="0" max="0" step="0.1" value="0" aria-label="Seek" style="flex:1; min-width:0; accent-color:${accent};">`
        + `<span class="cc-au-dur" style="min-width:40px; text-align:right; font-size:13px; font-variant-numeric:tabular-nums; color:#64748b;">0:00</span></div>`
        + `<div class="cc-au-controls" style="display:flex; align-items:center; justify-content:center; gap:12px; margin-top:12px;">`
        + (skip ? `<button type="button" class="cc-au-back" aria-label="Back 15 seconds" style="${sBtn}">-15s</button>` : '')
        + `<button type="button" class="cc-au-play" aria-label="Play" style="width:52px; height:52px; padding:0; border-radius:50%; border:none; background:${accent}; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center;">${ico('cc-au-i-play', '<path d="M8 5v14l11-7z"/>', false)}${ico('cc-au-i-pause', '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', true)}</button>`
        + (skip ? `<button type="button" class="cc-au-fwd" aria-label="Forward 15 seconds" style="${sBtn}">+15s</button>` : '')
        + (speed ? `<button type="button" class="cc-au-speed" aria-label="Playback speed" style="${sBtn}">1&times;</button>` : '')
        + `</div></div>\n</div>\n</div>\n`;
    }

    case 'ANNOUNCEMENT_BAR':
      return customCss + announcementHtml(content, innerId, animClass + innerClass, styleAttr, false);

    case 'NEWSLETTER': {
      const c = content;
      const accent = ccColor(c.accent, 'var(--brand-color, #3b82f6)');
      const card = c.layout !== 'plain';
      const inline = c.formLayout !== 'stacked';
      const text = (v, d, max) => ccEsc([...(ccStr(v).trim() || d)].slice(0, max).join(''));
      const raw = (v, d, max) => [...(ccStr(v).trim() || d)].slice(0, max).join('');
      const title = ccEsc(c.title);
      const intro = ccBr(ccStr(c.text));
      const emailLabel = raw(c.emailLabel, 'Email', 100);
      const nameLabel = raw(c.nameLabel, 'Name', 100);
      const consent = raw(c.consentText, '', 300);
      const askName = c.askName === true;
      const successMsg = ccStr(c.successMsg).trim() || 'Thank you for subscribing!';
      const formId = c.customId ? 'f_' + String(c.customId).replace(/[^a-zA-Z0-9_-]/g, '') : 'f_' + String(block.id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      const input = `padding:12px 14px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 8px); font:inherit; background:var(--cc-field-bg, #fff); color:#0f172a; box-sizing:border-box; min-width:0; ${inline ? 'flex:1 1 200px;' : 'width:100%;'}`;
      let fi = 0, fields = '';
      if (askName) { fields += `<input type="hidden" name="_label_field_${fi}" value="${escapeHtml(nameLabel)}"><input type="text" name="field_${fi}" required autocomplete="name" aria-label="${escapeHtml(nameLabel)}" placeholder="${text(c.namePlaceholder, nameLabel, 100)}" style="${input}">`; fi++; }
      fields += `<input type="hidden" name="_label_field_${fi}" value="${escapeHtml(emailLabel)}"><input type="email" name="field_${fi}" required autocomplete="email" aria-label="${escapeHtml(emailLabel)}" placeholder="${text(c.placeholder, emailLabel, 100)}" style="${input}">`; fi++;
      const button = `<button type="submit" class="cc-nl-submit" style="padding:12px 24px; border:none; border-radius:8px; background:${accent}; color:#ffffff; font:700 15px/1 inherit; cursor:pointer; ${inline ? '' : 'width:100%;'}">${text(c.buttonText, 'Subscribe', 40)}</button>`;
      const consentHtml = consent !== '' ? `<input type="hidden" name="_label_field_${fi}" value="${escapeHtml(consent)}"><label class="cc-nl-consent" style="display:flex; align-items:flex-start; gap:8px; flex:1 1 100%; font-size:13px; line-height:1.5; color:#64748b;"><input type="checkbox" name="field_${fi}" value="Yes" required style="width:18px; height:18px; margin-top:1px; accent-color:${accent};"><span>${escapeHtml(consent)}</span></label>` : '';
      return customCss + `<style>#${innerId} input:focus-visible,#${innerId} button:focus-visible{outline:2px solid ${accent};outline-offset:2px}#${innerId} .cc-nl-submit:hover{filter:brightness(.93)}@media(max-width:600px){#${innerId} .cc-nl-card{padding:20px !important}}</style>`
        + `<div id="${innerId}" class="cc-newsletter${animClass}${innerClass}" style="${styleAttr}">\n`
        + `<div class="cc-nl-card" style="${card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;'}">`
        + (title !== '' ? `<div class="cc-nl-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">${title}</div>` : '')
        + (intro !== '' ? `<p class="cc-nl-text" style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:#475569;">${intro}</p>` : '')
        + `<form id="${formId}" class="cc-nl-form" action="{{BASE_URL}}canvascore-admin/submit_form.php" method="POST" style="display:flex; flex-wrap:wrap; gap:10px; ${inline ? 'align-items:stretch;' : 'flex-direction:column; align-items:stretch;'}">\n`
        + `<input type="hidden" name="_form" value="${formId}"><input type="hidden" name="_success" value="${escapeHtml(successMsg)}"><input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute; left:-9999px; width:0; height:0; opacity:0;">\n`
        + (inline ? fields + button + consentHtml : fields + consentHtml + button)   // stacked: the agreement comes before the button
        + `\n</form>\n</div>\n</div>\n`;
    }

    // a field of the collection item being published: the editor shows a placeholder, the page is built on the server
    case 'ITEM_FIELD':
    case 'RELATED':
    case 'ITEM_TERMS':
      return '';

    default:
      return `<!-- Unknown element: ${String(t).replace(/[^A-Za-z0-9_]/g, '')} -->\n`;
  }
}

export default renderBlock;
