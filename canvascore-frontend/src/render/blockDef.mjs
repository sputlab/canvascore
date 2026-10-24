// canvascore-frontend/src/render/blockDef.mjs
// Shared block definitions: a block described ONCE, as a settings schema plus a template, in
// canvascore-admin/blocks/<name>.json. This engine (the editor) and its twin canvascore-admin/blockdef.php (the
// published site) read the same file, so a block has one rendering by construction. The Content panel is generated
// from the same schema (src/components/panel/SchemaPanel.jsx).
//
// Rendering a block = clean its content with the schema, then fill the template with the clean values:
//
//   settings   { key: { type, default, … } }: every value the template may use. Raw content never reaches the
//              template: each value is rebuilt from its setting, so a wrong type or a hostile value gets the default.
//     text      a string (numbers and booleans as PHP casts them; arrays and objects → ''); trim, fallbackWhenEmpty,
//               fallbackWhenBlank (the default when blank once trimmed, the value untrimmed otherwise),
//               pattern (a regex the whole value must match, else the default), maxLength
//     richtext  HTML: sanitized by the server (cc_sanitize_html), as is in the editor; may be printed raw
//     number    min, max, default; int (whole number) or round (decimals); parse: "int" reads the leading whole
//               number of a text ("7px" → 7), as cc_int()
//     bool      default true: anything but false is true; default false: true when PHP finds it non-empty;
//               strict: only the value true; phpTruthy: the default when missing, else PHP's truthiness
//     enum      options [{ value, label, data? }]: one of the values, else the default. The chosen option's data
//               (strings written in the definition, so trusted HTML) is opt.<key>.<name>
//     color     a CSS colour (cc_color), else the default
//     image     an image address (cc_img_url): any other scheme → ''
//     code      HTML printed as is, NOT sanitized: only for code surfaces that only admins can change (HTML.code)
//     list      item: { key: setting } per item (a non-object item gets the defaults), or of: setting (a list of
//               plain values, {{.}} in the loop); max; skipEmpty (drops the values that are empty once trimmed);
//               count: { as, min, max } adds a top-level number: the item count, clamped; skipNonObjects (drops
//               items that are not objects, as PHP's is_array()); keepIf (a flag's conditions each item must meet);
//               unique (lists of values); defaultsByIndex: { key: [values] } (a missing value takes the one at its
//               position); for lists of values max applies after skipEmpty and unique
//               share: { of, as, format: { key: decimals } } gives each item its share of the total of "of", in %
//     object    item: { key: setting }: one object (a non-object gets the defaults); {{#key}}…{{/key}} enters it
//     calc      a number from another one: of (or fallback when that one is 0), / div, * mul, + add, then min / max
//     flag      true when its conditions on the other clean values hold ("when", all of them, or one with "any"):
//               { key: true | false } (as a section sees it), { key: [texts] }, { key: { not: [texts] } },
//               { key: { gt: n } } / { key: { lt: n } } (a number above / below)
//     choices   options [{ value, data }]: the values picked (a list of texts), as a list of { value, …data } in the
//               options' order (data is trusted, as for enum)
//     from: "styles" reads the value from the block's styles (after its text style) instead of its content.
//     transform: once every value is clean, one of TRANSFORMS below (or a list of them, applied in order) (twins of the PHP ones): blockUrl (an internal
//               link → {{BASE_URL}}…), cssUrl (for url('…')), urlencode, lines2br (escaped, a <br /> per line break:
//               trusted), videoEmbed (a YouTube or Vimeo address → its player address, '' otherwise), fmtNum
//               (thousands separators, decimals from the sibling named by decimalsFrom), extUrl (https:// added when
//               missing), initials (of a name), mailto (a valid address → mailto:…, else ''), contactUrl (an email
//               address → mailto:…, else extUrl), br (lines → escaped, joined by <br>), repeat (the setting's text,
//               value times), mediaSrc (an audio or video address: http(s) or a path), mediaMime (its type from the
//               extension), replace (from → to), plain (a number, ≤ 4 decimals), json, telDigits, stripScheme, mapsUrl,
//               code, lineNumbers, tableData (rows of a pipe- or tab-separated text, with headerFrom)
//   renderIf   a value that must be true, or the block (and its custom CSS) renders nothing
//   script     the name of the block's behaviour script (site only; CC_TPL_SCRIPTS in blockdef.php)
//
//   template   a string (or an array of strings, joined): logic-light, Mustache-like, escaping built in
//     {{name}}           the value, HTML-escaped (& " ' < >, as PHP's htmlspecialchars)
//     {{{name}}}         printed raw ONLY when the value is trusted HTML (richtext, option data, the engine's own
//                        values); anything else is still escaped
//     {{#name}}…{{/name}}   a list: once per item (the item's values come first, then @index @number @first @last);
//                        an object: once, inside it; anything else: once when true
//     {{^name}}…{{/name}}   when false or empty
//     {{#name?}}…{{/name?}} / {{^name?}}   when true / false, without entering a list
//     {{#name=v}}…{{/name=v}} / {{^name=v}} when the value is / is not the text v
//     {{! a comment }}
//     Names can be dotted (opt.variant.bg). Built in: _id (the block's id), _classes (effect and custom classes,
//     starting with a space), _style (the block's inline style, minus the keys in rootStyleOmit; trusted),
//     _field.<key> (editor only: the in-place editing attributes of a setting with "inline"), _script (site only:
//     the block's behaviour script, named by "script"), _lb and _rb ({ and }: a literal { can't stand right before a
//     tag, so CSS like .x{{{#a}}…{{/a}}} is written .x{{{_lb}}}{{#a}}…{{/a}}{{{_rb}}}; the parser refuses the former),
//     _base (the {{BASE_URL}} placeholder that publishing replaces with the site's address).
//
// The engine knows no block: a new block needs a definition file, its line in BLOCK_DEFS below, and nothing else.
import { ccImgUrl, ccCssUrl, ccColorValue, buildInlineStyle, resolveBlockUrl, ccFmtNum, ccExtUrlValue, ccInitialsValue, ccMediaSrcValue, ccMediaMimeValue, ccEncValue } from './renderBlock.mjs';
import { effectClasses } from './effects.mjs';
import { withTextPreset } from './typography.mjs';

// <defs:begin> one import per file in canvascore-admin/blocks/ (tests/parity.mjs checks the two lists agree)
import ACCORDION from '../../../canvascore-admin/blocks/accordion.json' with { type: 'json' };
import AUDIO_PLAYER from '../../../canvascore-admin/blocks/audio-player.json' with { type: 'json' };
import AUTHOR_BIO from '../../../canvascore-admin/blocks/author-bio.json' with { type: 'json' };
import BEFORE_AFTER from '../../../canvascore-admin/blocks/before-after.json' with { type: 'json' };
import BENTO from '../../../canvascore-admin/blocks/bento.json' with { type: 'json' };
import BUSINESS from '../../../canvascore-admin/blocks/business.json' with { type: 'json' };
import CALLOUT from '../../../canvascore-admin/blocks/callout.json' with { type: 'json' };
import CARDS from '../../../canvascore-admin/blocks/cards.json' with { type: 'json' };
import CASE_STUDY from '../../../canvascore-admin/blocks/case-study.json' with { type: 'json' };
import CODE_SNIPPET from '../../../canvascore-admin/blocks/code-snippet.json' with { type: 'json' };
import COUNTDOWN from '../../../canvascore-admin/blocks/countdown.json' with { type: 'json' };
import COUNTERS from '../../../canvascore-admin/blocks/counters.json' with { type: 'json' };
import DIVIDER from '../../../canvascore-admin/blocks/divider.json' with { type: 'json' };
import FAQ from '../../../canvascore-admin/blocks/faq.json' with { type: 'json' };
import GALLERY from '../../../canvascore-admin/blocks/gallery.json' with { type: 'json' };
import GRID from '../../../canvascore-admin/blocks/grid.json' with { type: 'json' };
import HOTSPOTS from '../../../canvascore-admin/blocks/hotspots.json' with { type: 'json' };
import HOVER_GRID from '../../../canvascore-admin/blocks/hover-grid.json' with { type: 'json' };
import HTML from '../../../canvascore-admin/blocks/html.json' with { type: 'json' };
import ICON_BOX from '../../../canvascore-admin/blocks/icon-box.json' with { type: 'json' };
import IMAGE_TEXT from '../../../canvascore-admin/blocks/image-text.json' with { type: 'json' };
import IMAGE from '../../../canvascore-admin/blocks/image.json' with { type: 'json' };
import LOGOS from '../../../canvascore-admin/blocks/logos.json' with { type: 'json' };
import MAPS from '../../../canvascore-admin/blocks/maps.json' with { type: 'json' };
import PRICING from '../../../canvascore-admin/blocks/pricing.json' with { type: 'json' };
import PROGRESS from '../../../canvascore-admin/blocks/progress.json' with { type: 'json' };
import REVIEW_SUMMARY from '../../../canvascore-admin/blocks/review-summary.json' with { type: 'json' };
import SCROLLYTELLING from '../../../canvascore-admin/blocks/scrollytelling.json' with { type: 'json' };
import SEARCH from '../../../canvascore-admin/blocks/search.json' with { type: 'json' };
import SHARE_BAR from '../../../canvascore-admin/blocks/share-bar.json' with { type: 'json' };
import SLIDER from '../../../canvascore-admin/blocks/slider.json' with { type: 'json' };
import SPLIT_CTA from '../../../canvascore-admin/blocks/split-cta.json' with { type: 'json' };
import STEPS from '../../../canvascore-admin/blocks/steps.json' with { type: 'json' };
import TABLE_OF_CONTENTS from '../../../canvascore-admin/blocks/table-of-contents.json' with { type: 'json' };
import TABLE from '../../../canvascore-admin/blocks/table.json' with { type: 'json' };
import TABS from '../../../canvascore-admin/blocks/tabs.json' with { type: 'json' };
import TEAM from '../../../canvascore-admin/blocks/team.json' with { type: 'json' };
import TESTIMONIAL_WALL from '../../../canvascore-admin/blocks/testimonial-wall.json' with { type: 'json' };
import TESTIMONIAL from '../../../canvascore-admin/blocks/testimonial.json' with { type: 'json' };
import TEXT from '../../../canvascore-admin/blocks/text.json' with { type: 'json' };
import TIMELINE from '../../../canvascore-admin/blocks/timeline.json' with { type: 'json' };
import VIDEO_HERO from '../../../canvascore-admin/blocks/video-hero.json' with { type: 'json' };
import VIDEO from '../../../canvascore-admin/blocks/video.json' with { type: 'json' };
export const BLOCK_DEFS = [ACCORDION, AUDIO_PLAYER, AUTHOR_BIO, BEFORE_AFTER, BENTO, BUSINESS, CALLOUT, CARDS, CASE_STUDY, CODE_SNIPPET, COUNTDOWN, COUNTERS, DIVIDER, FAQ, GALLERY, GRID, HOTSPOTS, HOVER_GRID, HTML, ICON_BOX, IMAGE_TEXT, IMAGE, LOGOS, MAPS, PRICING, PROGRESS, REVIEW_SUMMARY, SCROLLYTELLING, SEARCH, SHARE_BAR, SLIDER, SPLIT_CTA, STEPS, TABLE_OF_CONTENTS, TABLE, TABS, TEAM, TESTIMONIAL_WALL, TESTIMONIAL, TEXT, TIMELINE, VIDEO_HERO, VIDEO];
// <defs:end>
const BY_TYPE = new Map(BLOCK_DEFS.map((d) => [d.type, d]));
export const blockDef = (type) => BY_TYPE.get(type) || null;

// ---------------------------------------------------------------------------------------------- values
class Trusted { constructor(h) { this.h = h; } }
const trusted = (h) => new Trusted(String(h));
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Trusted);

// htmlspecialchars() with PHP's defaults (ENT_QUOTES): the one escaping of both engines
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A content value as text, cast as PHP's cc_str() does
const str = (v) => (v === null || v === undefined || typeof v === 'object' ? '' : typeof v === 'boolean' ? (v ? '1' : '') : String(v));
// PHP's is_numeric(): decimal or exponent notation, surrounding whitespace allowed
const isNumeric = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(v));
// PHP's empty(): false, 0, 0.0, '', '0', null, an empty array
const phpEmpty = (v) => v === undefined || v === null || v === false || v === 0 || v === '' || v === '0' || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);
// Round half away from zero at `dec` decimals (PHP's round())
const roundTo = (n, dec) => { const m = 10 ** dec; const r = Math.floor(Math.abs(n) * m + 0.5 + 1e-9) / m; return n < 0 ? -r : r; };
// A number as text, the same in both engines: no exponent, no trailing zeros
export const numText = (n, dec) => {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(Math.max(0, Math.min(10, dec ?? 10))).replace(/\.?0+$/, '') || '0';
};
// PHP's trim(): only spaces, tabs, line breaks, NUL and vertical tabs (not the other Unicode spaces)
// eslint-disable-next-line no-control-regex -- the characters PHP's trim() removes
const phpTrim = (t) => t.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
const truthy = (v) => (v instanceof Trusted ? v.h !== '' : !phpEmpty(v));   // an empty list or object is false, as PHP's empty array
const asText = (v) => (v instanceof Trusted ? v.h : typeof v === 'number' ? numText(v) : str(v));

// ---------------------------------------------------------------------------------------------- cleaning
function cleanValue(s, raw, ctx) {
  const missing = raw === undefined || raw === null;
  switch (s.type) {
    case 'text': {
      let v = missing ? str(s.default ?? '') : str(raw);
      if (s.trim) v = phpTrim(v);
      if (s.fallbackWhenEmpty && v === '') v = str(s.default ?? '');
      if (s.fallbackWhenBlank && phpTrim(v) === '') v = str(s.default ?? '');   // blank once trimmed: the default (else kept as is)
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) v = str(s.default ?? '');
      if (s.maxLength) v = [...v].slice(0, s.maxLength).join('');
      return v;
    }
    case 'richtext': return trusted(missing ? str(s.default ?? '') : str(raw));   // the server sanitizes; the canvas runs safeHtml() over the block
    case 'number': {
      const d = s.default ?? 0;
      if (s.parse === 'int') {   // the leading whole number, as cc_int(): "7px" → 7, "abc" → the default
        const m = (typeof raw === 'string' || typeof raw === 'number') ? String(raw).match(/^\s*([+-]?\d+)/) : null;
        return m ? Math.max(s.min ?? -Infinity, Math.min(s.max ?? Infinity, parseInt(m[1], 10))) : d;
      }
      let n = isNumeric(raw) ? Math.max(s.min ?? -Infinity, Math.min(s.max ?? Infinity, Number(raw))) : d;
      if (s.int) n = Math.trunc(n);
      else if (s.round !== undefined) n = roundTo(n, s.round);
      return n;
    }
    case 'bool':
      if (s.phpTruthy) return missing ? !!s.default : !phpEmpty(raw);   // `?? default` then PHP's truthiness
      return s.strict ? raw === true : s.default === true ? raw !== false : !phpEmpty(raw);
    case 'enum': {
      const v = str(raw);
      return (s.options || []).some((o) => o.value === v) && !missing ? v : str(s.default ?? '');
    }
    case 'color': return ccColorValue(str(raw), s.default ?? '');
    case 'image': return ccImgUrl(missing ? (s.default ?? '') : str(raw));
    case 'code': return trusted(missing ? str(s.default ?? '') : str(raw));
    case 'list': {
      let items = Array.isArray(raw) ? raw : [];
      if (s.skipNonObjects) items = items.filter((it) => it !== null && typeof it === 'object');   // PHP's is_array()
      if (s.of) {   // a list of values: cleaned, then skipEmpty, unique, max
        let vals = items.map((it) => cleanValue(s.of, it, ctx));
        if (s.skipEmpty) vals = vals.filter((v) => phpTrim(asText(v)) !== '');
        if (s.unique) vals = vals.filter((v, i) => vals.findIndex((w) => asText(w) === asText(v)) === i);
        return s.max ? vals.slice(0, s.max) : vals;
      }
      if (s.max) items = items.slice(0, s.max);
      let out = items.map((it, i) => {
        let src = isObj(it) ? it : {};
        if (s.defaultsByIndex) {   // a missing value takes the default at the item's position
          src = { ...src };
          for (const [k, list] of Object.entries(s.defaultsByIndex)) if (src[k] === undefined || src[k] === null) src[k] = list[i] ?? '';
        }
        return cleanSettings(s.item || {}, src, {}, ctx);
      });
      if (s.keepIf) out = out.filter((it) => condHolds(s.keepIf, it, false));
      if (s.share) {   // each item's share of the list's total, in % (0 when the total is 0)
        const sum = out.reduce((a, it) => a + (typeof it[s.share.of] === 'number' ? it[s.share.of] : 0), 0);
        for (const it of out) {
          const pct = sum > 0 ? (typeof it[s.share.of] === 'number' ? it[s.share.of] : 0) / sum * 100 : 0;
          it[s.share.as] = pct;
          for (const [k, dec] of Object.entries(s.share.format || {})) it[k] = ccFmtNum(pct, dec);
        }
      }
      return out;
    }
    case 'object': return cleanSettings(s.item || {}, isObj(raw) ? raw : {}, {}, ctx);
    case 'choices': {   // the options picked (texts in a list), in the definition's order, each with its data
      const picked = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
      return (s.options || []).filter((o) => picked.includes(o.value)).map((o) => {
        const it = { value: o.value };
        for (const [k, v] of Object.entries(o.data || {})) it[k] = trusted(v);
        return it;
      });
    }
    case 'calc': case 'flag': return 0;   // computed once the other values are clean
    default: return '';
  }
}
// The clean values of a block (or of a list item): one per setting, plus opt.<key> for enums and the list counts
function cleanSettings(settings, content, styles, ctx) {
  const out = {}; const opt = {};
  for (const [key, s] of Object.entries(settings)) {
    const src = s.from === 'styles' ? styles : content;
    const raw = own(src, s.key || key) ? src[s.key || key] : undefined;
    out[key] = cleanValue(s, raw, ctx);
    if (s.type === 'enum') {
      const o = (s.options || []).find((x) => x.value === out[key]);
      const data = {};
      if (o && o.data) for (const [k, v] of Object.entries(o.data)) data[k] = trusted(v);
      opt[key] = data;
    }
    if (s.type === 'list' && s.count) out[s.count.as] = Math.max(s.count.min ?? 0, Math.min(s.count.max ?? Infinity, out[key].length));
  }
  if (Object.keys(opt).length) out.opt = opt;
  // second pass: values computed from the clean ones
  for (const [key, s] of Object.entries(settings)) {
    if (s.type === 'calc') { const b = s.fallback && !truthy(out[s.of]) ? out[s.fallback] : out[s.of]; out[key] = Math.max(s.min ?? -Infinity, Math.min(s.max ?? Infinity, (typeof b === 'number' ? b : 0) / (s.div ?? 1) * (s.mul ?? 1) + (s.add ?? 0))); }
    if (s.type === 'flag') out[key] = condHolds(s.when || {}, out, !!s.any);
    for (const t of [].concat(s.transform || [])) if (TRANSFORMS[t]) out[key] = TRANSFORMS[t](out[key], s, out);   // one transform or a chain
  }
  return out;
}

// A flag's conditions on the clean values: { key: true | false } (true / false as a section sees it), { key: [texts] }
// (one of them), { key: { not: [texts] } } (none of them); all must hold, or one with "any"
function condHolds(when, vals, any) {
  const one = ([k, want]) => {
    let v = vals;
    for (const part of k.split('.')) v = own(v, part) ? v[part] : undefined;   // a dotted name reaches into objects (opt.x.y)
    if (want === true || want === false) return truthy(v) === want;
    if (Array.isArray(want)) return want.includes(asText(v));
    if (want.gt !== undefined || want.lt !== undefined) {   // a number above gt / below lt
      const n = typeof v === 'number' ? v : 0;
      return (want.gt === undefined || n > want.gt) && (want.lt === undefined || n < want.lt);
    }
    return !(want.not || []).includes(asText(v));
  };
  const list = Object.entries(when);
  return any ? list.some(one) : list.every(one);
}

// The lines of a text, trimmed as PHP does, empty ones dropped (cc_lines())
const textLines = (t) => t.split(/\r\n|\r|\n/).map(phpTrim).filter((l) => l !== '');
const normCode = (t) => [...t.replace(/\r\n?/g, '\n').replace(/\n+$/, '')].slice(0, 50000).join('');

// Value transforms: twins of CC_TPL_TRANSFORMS in blockdef.php
const VIDEO_YT = /(?:youtube(?:-nocookie)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
const VIDEO_VM = /vimeo\.com\/(?:video\/)?([0-9]+)/i;
const TRANSFORMS = {
  blockUrl: (v) => resolveBlockUrl(asText(v)),
  cssUrl: (v) => ccCssUrl(asText(v)),
  // PHP's urlencode(): everything but letters, digits and - _ . is %-encoded, a space is +
  urlencode: (v) => encodeURIComponent(asText(v)).replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+'),
  // PHP's nl2br(htmlspecialchars()): the line break is kept, <br /> before it
  lines2br: (v) => trusted(esc(asText(v)).replace(/(\r\n|\n\r|\n|\r)/g, '<br />$1')),
  videoEmbed: (v) => {
    const u = asText(v); let m = u.match(VIDEO_YT);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(VIDEO_VM);
    return m ? 'https://player.vimeo.com/video/' + m[1] : '';
  },
  extUrl: (v) => ccExtUrlValue(asText(v)),
  mediaSrc: (v) => ccMediaSrcValue(asText(v)),
  replace: (v, s) => asText(v).split(String(s.from ?? '')).join(String(s.to ?? '')),
  // a valid email address → mailto:…, anything else → an https:// address
  contactUrl: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(v)) ? 'mailto:' + asText(v) : ccExtUrlValue(asText(v))),
  // the lines of a text, trimmed, empty ones dropped, escaped and joined by <br> (cc_br()): trusted
  br: (v) => trusted(asText(v).split(/\r\n|\r|\n/).map(phpTrim).filter((l) => l !== '').map(esc).join('<br>')),
  // the definition's text, as many times as the value (trusted: the text is the definition's own)
  repeat: (v, s) => trusted(String(s.text ?? '').repeat(Math.max(0, Math.trunc(typeof v === 'number' ? v : 0)))),
  initials: (v) => ccInitialsValue(asText(v)),
  // a valid email address → mailto:…, anything else → ''
  mailto: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(v)) ? 'mailto:' + asText(v) : ''),
  // a number as plain text: at most 4 decimals, no trailing zeros (cc_plain())
  plain: (v) => { const n = roundTo(typeof v === 'number' ? v : 0, 4); const t = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); return t === '-0' ? '0' : t; },
  mediaMime: (v) => ccMediaMimeValue(ccMediaSrcValue(asText(v))),
  json: (v) => JSON.stringify(Array.isArray(v) ? v.map(asText) : asText(v)),
  telDigits: (v) => asText(v).replace(/[^0-9+]/g, ''),
  stripScheme: (v) => asText(v).replace(/^https?:\/\//i, ''),
  // an address (lines) → a Google Maps search link
  mapsUrl: (v) => 'https://www.google.com/maps/search/?api=1&query=' + ccEncValue(textLines(asText(v)).join(', ')),
  // code text: line breaks normalized, trailing ones removed, at most 50,000 characters
  code: (v) => normCode(asText(v)),
  // 1…n, one per line of the (normalized) code
  lineNumbers: (v) => Array.from({ length: normCode(asText(v)).split('\n').length }, (_, i) => i + 1).join('\n'),
  // "a | b | c" or tab-separated lines → { ncols, head: [cells] (when headerFrom is on), rows: [{ cells, odd }] }, padded
  tableData: (v, s, sib) => {
    const rows = textLines(asText(v)).map((l) => l.split(/\s*\|\s*|\t/));
    const head = truthy(sib[s.headerFrom]) && rows.length ? rows.shift() : null;
    let ncols = head ? head.length : 0;
    for (const r of rows) ncols = Math.max(ncols, r.length);
    const pad = (r) => Array.from({ length: ncols }, (_, i) => r[i] ?? '');
    return { ncols, head: head ? pad(head) : [], rows: rows.map((r, i) => ({ cells: pad(r), odd: i % 2 === 1 })) };
  },
  fmtNum: (v, s, sib) => ccFmtNum(typeof v === 'number' ? v : 0, s.decimalsFrom ? sib[s.decimalsFrom] : (s.decimals ?? 0)),
};

// ---------------------------------------------------------------------------------------------- templates
const TAG = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{([#^/!]?)\s*([^}]*?)\s*\}\}/g;
// The template as a tree: strings, { v: name, raw }, { s: name, inv, kind: 'each'|'test'|'eq', eq, body: [...] }
export function parseTemplate(src) {
  const text = Array.isArray(src) ? src.join('') : String(src ?? '');
  const root = []; const stack = [{ body: root, name: null }];
  let last = 0; let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.body.push(text.slice(last, m.index));
    last = TAG.lastIndex;
    if (m[1] !== undefined) {
      if (m[1].startsWith('{')) throw new Error(`Template: a literal { before {{{ (write {{{_lb}}}): ${m[1]}`);
      top.body.push({ v: m[1], raw: true }); continue;
    }
    const [sigil, name] = [m[2], m[3]];
    if (sigil === '!') continue;
    if (sigil === '#' || sigil === '^') {
      if (name.startsWith('{')) throw new Error(`Template: a literal { before {{ (write {{{_lb}}}): ${name}`);
      const node = { s: name, inv: sigil === '^', body: [] };
      if (name.endsWith('?')) Object.assign(node, { kind: 'test', path: name.slice(0, -1) });
      else if (name.includes('=')) Object.assign(node, { kind: 'eq', path: name.slice(0, name.indexOf('=')), eq: name.slice(name.indexOf('=') + 1) });
      else Object.assign(node, { kind: 'each', path: name });
      top.body.push(node);
      stack.push({ body: node.body, name });
      continue;
    }
    if (sigil === '/') {
      if (stack.length < 2 || top.name !== name) throw new Error(`Template: {{/${name}}} closes ${top.name ? `{{#${top.name}}}` : 'nothing'}`);
      stack.pop();
      continue;
    }
    if (name === '') throw new Error('Template: empty tag');
    if (name.startsWith('{')) throw new Error(`Template: a literal { before {{ (write {{{_lb}}}): ${name}`);
    top.body.push({ v: name, raw: false });
  }
  if (stack.length > 1) throw new Error(`Template: {{#${stack[stack.length - 1].name}}} is not closed`);
  if (last < text.length) root.push(text.slice(last));
  return root;
}

function lookup(scopes, path) {
  if (path === '.') return scopes[scopes.length - 1];
  const [first, ...rest] = path.split('.');
  let v;
  for (let i = scopes.length - 1; i >= 0; i--) if (own(scopes[i], first)) { v = scopes[i][first]; break; }
  for (const k of rest) v = own(v, k) ? v[k] : undefined;
  return v;
}
function renderNodes(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += n; continue; }
    if (n.v !== undefined) {
      const v = lookup(scopes, n.v);
      out += n.raw && v instanceof Trusted ? v.h : esc(asText(v));
      continue;
    }
    const v = lookup(scopes, n.path);
    if (n.kind === 'eq') { if ((asText(v) === n.eq) !== n.inv) out += renderNodes(n.body, scopes); continue; }
    if (n.inv || n.kind === 'test') { if (truthy(v) !== n.inv) out += renderNodes(n.body, scopes); continue; }
    if (Array.isArray(v)) {
      v.forEach((it, i) => { out += renderNodes(n.body, [...scopes, { '@index': i, '@number': i + 1, '@first': i === 0, '@last': i === v.length - 1 }, it]); });
    } else if (isObj(v)) { if (Object.keys(v).length) out += renderNodes(n.body, [...scopes, v]); }
    else if (truthy(v)) out += renderNodes(n.body, scopes);
  }
  return out;
}

// A transform applied to one value (the panel uses it to check what an editor typed, e.g. a video link)
export const transformValue = (name, v) => (TRANSFORMS[name] ? asText(TRANSFORMS[name](v, {}, {})) : asText(v));

const PARSED = new Map();
const parsed = (def) => { if (!PARSED.has(def)) PARSED.set(def, parseTemplate(def.template)); return PARSED.get(def); };

// The HTML of a block that has a definition (no custom CSS or device rules: renderBlock adds those).
// host: { innerId, fields } — the block's id as renderBlock computed it, and whether to mark in-place fields.
export function renderDefBlock(def, block, host) {
  const styles = withTextPreset(block.styles);
  const content = isObj(block.content) ? block.content : {};
  const values = cleanSettings(def.settings || {}, content, isObj(styles) ? styles : {}, {});
  const anim = effectClasses(styles, content);
  const custom = !phpEmpty(content.customClass) ? str(content.customClass) : '';
  const rootStyles = { ...styles };
  for (const k of def.rootStyleOmit || []) delete rootStyles[k];
  const field = {};
  for (const [key, s] of Object.entries(def.settings || {})) {
    if (s.inline) field[key] = trusted(host.fields ? ` data-cc-field="${key}" contenteditable="true" data-cc-placeholder="${esc(s.placeholder || '')}"` : '');
  }
  if (def.renderIf && !truthy(values[def.renderIf])) return null;   // nothing at all, not even the custom CSS
  const builtIn = { _id: host.innerId, _classes: anim + (custom !== '' ? ' ' + custom : ''), _style: trusted(buildInlineStyle(rootStyles)), _field: field, _script: trusted(''), _lb: trusted('{'), _rb: trusted('}'), _base: trusted('{{BASE_URL}}') };
  return renderNodes(parsed(def), [builtIn, values]);
}
