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
import { blockDef, renderDefBlock } from './blockDef.mjs';

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
export function resolveBlockUrl(url) {
  url = String(url ?? '').trim();
  if (url === '') return '#';
  if (url === '#' || /^(?:f|ht)tps?:\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) return url;
  if (url === 'index.html' || url === 'index/index.html' || url === 'home/index.html' || url === '/') return '{{BASE_URL}}';
  const clean = url.replace(/index\/index\.html|index\.html/g, '');
  return '{{BASE_URL}}' + clean.replace(/^\/+/, '');
}

// ---- helpers shared by the "content" blocks (twins of cc_* in compiler.php) ----
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-zA-Z0-9-]+(?:,\s*[#0-9a-zA-Z.,%()\s-]+)?\))$/;
function ccColor(v, d) { v = String(v ?? '').trim(); if (v === '') return d; return COLOR_RE.test(v) ? v : d; }
export { ccColor as ccColorValue };
const ccIsNum = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
function ccNum(v, min, max, d) { return ccIsNum(v) ? Math.max(min, Math.min(max, Number(v))) : d; }
export function ccFmtNum(v, dec) {
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
export { ccExtUrl as ccExtUrlValue, ccInitials as ccInitialsValue };
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
export { ccMediaSrc as ccMediaSrcValue };
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

  // A block with a shared definition (canvascore-admin/blocks/) is rendered from it, here and on the site
  const def = blockDef(t);
  if (def) { const h = renderDefBlock(def, block, { innerId, fields: !!opts.fields }); return h === null ? '' : customCss + h; }

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
