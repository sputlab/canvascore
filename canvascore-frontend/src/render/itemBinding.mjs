// Dynamic values (see the PHP twin: canvascore-admin/compiler.php, cc_bind_deep). A text or value of a block may hold
// {{field:KEY}}, {{field:KEY.part}} (a link's url or text, a reference's title or url) or {{item:title|excerpt|date|url}}.
// The context decides what they become:
//   null                  no item: removed (a visitor never sees a placeholder)
//   { placeholder: true } the design, edited in the editor: the name of the field, in brackets
//   { defs, values, item, items } an item: its values (the editor shows the item being edited)
export const TOKEN_RE = /\{\{(field|item):([a-z][a-z0-9_]{0,39})(?:\.([a-z]{1,20}))?\}\}/g;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The same escaping as PHP's htmlspecialchars() (single quotes included)
export const escText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// "October 19, 2026" from 2026-10-19; '' when it is not a date
export function longDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return '';
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

// A number without trailing zeros (12.5 and 12 as "12.5" and "12")
export const plainNumber = (v) => {
  const r = Math.round(Number(v) * 1e6) / 1e6;
  return escText(Object.is(r, -0) ? '0' : String(r));
};

const ITEM_LABELS = { title: 'Title', excerpt: 'Excerpt', date: 'Date', url: 'Address' };

function tokenValue(kind, name, part, ctx) {
  if (ctx === null || ctx === undefined) return '';
  if (ctx.placeholder) {
    if (kind === 'item') return escText(`[${ITEM_LABELS[name] || name}]`);
    const d = (ctx.defs || []).find((x) => x.key === name);
    return escText(`[${d ? d.label : name}]`);
  }
  if (kind === 'item') {
    const it = ctx.page || {};
    if (name === 'date') return escText(longDate(it.date));
    if (['title', 'excerpt', 'url'].includes(name)) return escText(it[name] ?? '');
    return '';
  }
  const d = (ctx.defs || []).find((x) => x.key === name);
  if (!d) return '';
  const v = (ctx.values || {})[d.id] ?? null;
  switch (d.type) {
    case 'text': case 'image': return escText(v ?? '');
    case 'richtext': return String(v ?? '');
    case 'number': return v === null || v === undefined ? '' : plainNumber(v);
    case 'date': return escText(longDate(v));
    case 'link': {
      const url = v && typeof v === 'object' ? String(v.url || '') : '';
      if (part === 'text') return escText(v && v.text ? v.text : url);
      return url ? escText(linkHref(url)) : '';
    }
    case 'choice': {
      const names = [];
      for (const x of [].concat(v ?? [])) { const o = (d.options || []).find((op) => op.value === x); if (o) names.push(escText(o.label)); }
      return names.join(', ');
    }
    case 'reference': {
      const ref = typeof v === 'string' && v && ctx.items ? ctx.items[v] : null;
      if (!ref) return '';
      if (part === 'url') return ref.live ? escText('{{BASE_URL}}' + ref.col_slug + '/' + ref.slug + '/') : '';
      return escText(ref.title);
    }
    default: return '';
  }
}

// The same as cc_block_url() for a field's link: a page of the site, or the address as it is
function linkHref(url) {
  if (/^(?:f|ht)tps?:\/\//i.test(url) || /^(?:mailto|tel):/i.test(url) || url === '#') return url;
  if (['index.html', 'index/index.html', 'home/index.html', '/'].includes(url)) return '{{BASE_URL}}';
  return '{{BASE_URL}}' + url.replace(/index\/index\.html|index\.html/g, '').replace(/^\/+/, '');
}

// Replaces the tokens of a string, or of every string in an array or object (keys kept)
export function bindValue(v, ctx) {
  if (typeof v === 'string') {
    if (!v.includes('{{')) return v;
    return v.replace(TOKEN_RE, (_, kind, name, part) => tokenValue(kind, name, part, ctx));
  }
  if (Array.isArray(v)) return v.map((x) => bindValue(x, ctx));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = bindValue(v[k], ctx);
    return out;
  }
  return v;
}

// The block as it is shown: its content bound. Its children are bound when they are shown themselves.
export function bindBlock(block, ctx) {
  if (!block || typeof block !== 'object' || !block.content || typeof block.content !== 'object') return block;
  return { ...block, content: bindValue(block.content, ctx) };
}

// What the dynamic values of the page being edited are bound to: the design (placeholders), an item (its values),
// or nothing (a page: the tokens are removed, as on the site)
export function contextFor(page) {
  if (!page) return null;
  if (page.__design) return { placeholder: true, defs: page.__fieldDefs || [] };
  if (page.__item) {
    return { defs: page.__fieldDefs || [], values: page.field_values || {},
      page: { title: page.title || '', excerpt: page.excerpt || '', date: page.date || '', url: page.__collectionSlug ? `/${page.__collectionSlug}/${page.slug || ''}/` : '' } };
  }
  return null;
}
