// The Content panel of a block with a shared definition (canvascore-admin/blocks/<name>.json), generated from its
// settings. "panel" lists the sections: { title, icon, open, keys, hint (text or list), hintIf, showIf, widget }. A
// setting shown in the panel takes its label, control and hints from the setting itself; it edits the content key it
// reads (its "key", else its name), or the block's style with from: "styles". A missing value shows the default.
// Settings that only shape the page (derived values, flags, sums) are left out by listing the ones to show.
//
//   field types   bool → checkbox · enum → select · color · image (address + library) · number · text · richtext · code
//                 · list (cards; a list of values with control "lines": one per line) · object (its settings, boxed or
//                 flat) · choices (a checkbox per option)
//   control       textarea · code (monospace) · color · select (+ choices, or choicesFrom: a list the editor already has) ·
//                 range (rangeMin, rangeMax, step, valueLabel "… {v} …", rtl) · editor (the rich text editor, variant,
//                 minHeight, editorLabel: its accessible name when not the label) · link (a page of the site or any address) · datetime · image · file (fileKind) · lines ·
//                 widget:<name> (widgets.jsx, widgetRegistry.js)
//   also          label, placeholder, labelWhen [{ when, label, placeholder }], hint, hintIf, half (two per row),
//                 subhead (a small heading above), showIf { key | styles.key: [values] | { not } | { gt, lt } | bool },
//                 hidden, noTransparent, adminOnly + adminOnlyMessage, check + checkMessage, altKey (the library's
//                 alt text fills it), focalKey (the key the image's focal point from the library fills: an object-position)
//   lists         itemKeys (the fields of a card, in order; else every setting of the item), itemTitle "Plan {n}" / "{stars|?} stars", itemTitleKey (a field's value, else itemTitle), itemMark
//                 { key, text }, newItem ("$placeholder:WxH" makes a placeholder image), addLabel, maxItems,
//                 addFromMedia { label, key, alt } (picks an image and adds an item with it)
import React from 'react';
import {
  Image as ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3, LayoutGrid,
  HelpCircle, MapPin, MonitorPlay, Code, SeparatorHorizontal, Hash, Headphones, CircleUserRound, Link2, GitCompare,
  LayoutDashboard, Store, Clock, TrendingUp, Quote, Code2, Timer, GalleryHorizontal, MapPinned, SquareMousePointer,
  Building2, StarHalf, ScrollText, Search, Share2, SquareChartGantt, Palette, MousePointerClick, Layout, CreditCard,
  Images, PanelLeft, PanelRight, TableOfContents, Table2, Users, MessagesSquare, Film, Type, Rows3, PanelTop, Columns3,
} from 'lucide-react';
import { PanelAccordion, ItemCard, TxtF, NumF, SelF, ChkF, ColorF, ImgF, FileF, Fld } from './fields';
import { lstAddBtn, fldInput, labelStyle } from './helpers';
import { transformValue } from '../../render/blockDef.mjs';
import { BUTTON_EFFECTS } from '../../render/effects.mjs';
import { BUTTON_PRESETS } from '../../render/kit.mjs';
import { UTC_OFFSETS, BUSINESS_TYPES } from './constants';
import { RichTextField } from '../../editor/RichText';
import { placeholderImage } from '../../editor/placeholder';
import { PANEL_WIDGETS } from './widgetRegistry';

// The icons a definition can name for its sections (anything else gets the generic one)
const ICONS = {
  Image: ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3, HelpCircle, MapPin, MonitorPlay, Code,
  SeparatorHorizontal, Hash, Headphones, CircleUserRound, Link2, GitCompare, LayoutDashboard, Store, Clock, TrendingUp, Quote, Code2, Timer,
  GalleryHorizontal, MapPinned, SquareMousePointer, Building2, StarHalf, ScrollText, Search, Share2, SquareChartGantt, Palette,
  MousePointerClick, Layout, CreditCard, Images, PanelLeft, PanelRight, TableOfContents, Table2, Users, MessagesSquare, Film, Type,
  Rows3, PanelTop, Columns3,
};
// Option lists the editor already has, by name (choicesFrom): one source for the panel and the rest of the editor
const CHOICES = {
  buttonEffects: BUTTON_EFFECTS,
  buttonPresets: [['', 'Custom'], ...BUTTON_PRESETS],
  utcOffsets: UTC_OFFSETS.map((o) => [o, o === 'local' ? "Visitor's local time" : 'UTC' + o]),
  businessTypes: BUSINESS_TYPES.map((b) => [b, b]),
};
const hintStyle = { fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' };

// The value a field shows: the stored one, else the setting's default (a missing switch shows its default state)
const shownValue = (s, v) => {
  if (s.type === 'bool') return s.strict ? v === true : s.default === true ? v !== false : !!v;
  if (v === undefined || v === null) return ['enum', 'number'].includes(s.type) || ['select', 'range'].includes(s.control) ? s.default : (s.type === 'list' ? [] : '');
  return v;
};
// showIf / hintIf / labelWhen: every condition holds. A name is a sibling setting (its shown value), or styles.<prop>.
function holds(cond, scope) {
  if (!cond) return true;
  return Object.entries(cond).every(([k, want]) => {
    const v = k.startsWith('styles.') ? (scope.styles || {})[k.slice(7)] : (scope.settings[k] ? shownValue(scope.settings[k], scope.values[scope.settings[k].key || k]) : scope.values[k]);
    if (want === true || want === false) return !!v === want;
    if (Array.isArray(want)) return want.some((w) => w === v || String(w) === String(v));
    if (want.gt !== undefined || want.lt !== undefined) { const n = parseFloat(v) || 0; return (want.gt === undefined || n > want.gt) && (want.lt === undefined || n < want.lt); }
    return !(want.not || []).some((w) => w === v || String(w) === String(v));
  });
}
const choicesOf = (s) => (s.choicesFrom ? CHOICES[s.choicesFrom] || [] : s.choices || (s.options || []).map((o) => [o.value, o.label || o.value]));
const makeItem = (tpl) => JSON.parse(JSON.stringify(tpl || {}), (k, v) => {
  const m = typeof v === 'string' && v.match(/^\$placeholder:(\d+)x(\d+)$/);
  return m ? placeholderImage(Number(m[1]), Number(m[2])) : v;
});
const itemTitle = (s, it, i) => {
  if (s.itemTitleKey && it[s.itemTitleKey]) return String(it[s.itemTitleKey]);
  const t = (s.itemTitle || 'Item {n}').replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, d) => (k === 'n' ? String(i + 1) : String(it[k] ?? d ?? '')));
  return s.itemMark && it[s.itemMark.key] ? t + s.itemMark.text : t;
};

// One field. scope: { settings, values, styles, ctx, pick (target base for the media library), patch (k, v), patchItem }
function Control({ k, s, scope }) {
  const { ctx } = scope;
  const fromStyles = s.from === 'styles';
  const key = s.key || k;
  const raw = fromStyles ? (scope.styles || {})[key] : scope.values[key];
  const v = shownValue(s, raw);
  const onChange = (x) => (fromStyles ? ctx.handleStyleChange(key, x) : scope.patch(key, x));
  const alt = (s.labelWhen || []).find((w) => holds(w.when, scope)) || {};
  const label = alt.label ?? s.label ?? '';
  const placeholder = alt.placeholder ?? s.placeholder;
  const onPick = ctx.pickTo({ ...scope.pick, key, ...(s.altKey ? { alt: s.altKey } : {}), ...(s.focalKey ? { focal: s.focalKey } : {}), ...(s.fileKind ? { kind: s.fileKind } : {}) });
  const control = s.control || '';

  if (control.startsWith('widget:')) {
    const W = PANEL_WIDGETS[control.slice(7)];
    return W ? <W ctx={ctx} s={s} k={key} item={scope.values} patch={scope.patchItem} /> : null;
  }
  if (s.type === 'object') {
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const inner = { ...scope, settings: s.item || {}, values: obj, styles: null, patch: (kk, x) => onChange({ ...obj, [kk]: x }), pick: { obj: key } };
    const fields = <Fields keys={s.itemKeys || Object.keys(s.item || {})} scope={inner} labels={s.labels} />;
    return s.flat ? fields : (
      <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '8px', border: '1px solid #334155' }}>
        {s.boxTitle && <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>{s.boxTitle}</div>}
        {fields}
      </div>
    );
  }
  if (s.type === 'choices') {
    const chosen = Array.isArray(raw) ? raw : [];
    const order = (s.options || []).map((o) => o.value);
    return (s.options || []).map((o) => (
      <ChkF key={o.value} label={o.label || o.value} checked={chosen.includes(o.value)} onChange={(on) => onChange(order.filter((n) => (n === o.value ? on : chosen.includes(n))))} />
    ));
  }
  if (s.type === 'list' && control === 'lines') {
    return <TxtF label={label} value={(Array.isArray(raw) ? raw : []).join('\n')} onChange={(t) => onChange(t.split('\n'))} placeholder={placeholder} multiline rows={s.rows || 4} />;
  }
  if (s.type === 'list') return <ListField k={key} s={s} scope={scope} />;
  if (s.type === 'bool') return <ChkF label={label} checked={v} onChange={onChange} />;
  if (s.type === 'color' || control === 'color') return <ColorF label={label} value={raw ?? ''} onChange={onChange} placeholder={placeholder} allowTransparent={!s.noTransparent} />;
  if (s.type === 'image' || control === 'image') return <ImgF label={label} value={raw ?? ''} onChange={onChange} onPick={onPick} />;
  if (control === 'file') return <FileF label={label} value={raw ?? ''} onChange={onChange} onPick={onPick} kind={s.fileKind} />;
  if (s.type === 'code' || control === 'code') {
    const locked = s.adminOnly && ctx.userRole !== 'admin';
    return (
      <Fld label={label}>
        <textarea rows={s.rows || 6} readOnly={locked} aria-label={label} placeholder={placeholder} style={{ ...fldInput, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', opacity: locked ? 0.7 : 1 }}
          value={raw ?? ''} onChange={(e) => onChange(e.target.value)} />
        {locked && s.adminOnlyMessage && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0' }}>{s.adminOnlyMessage}</p>}
      </Fld>
    );
  }
  if (control === 'editor') return <><label style={labelStyle}>{label}</label><RichTextField label={s.editorLabel || label} variant={s.variant || 'full'} minHeight={s.minHeight} value={raw || ''} onChange={onChange} /></>;
  if (control === 'link') {
    return (
      <Fld label={label}>
        <select style={{ ...fldInput, marginBottom: '6px' }} aria-label={`${label}: a page of the site`} value={raw ?? '#'} onChange={(e) => onChange(e.target.value)}>
          <option value="#">Select internal page...</option>
          {(ctx.pages || []).map((p) => <option key={p.id} value={p.clean_slug ? p.clean_slug + '/index.html' : 'index.html'}>📄 {p.title}</option>)}
        </select>
        <input type="text" style={fldInput} aria-label={label} placeholder={placeholder || 'Custom URL...'} value={raw ?? ''} onChange={(e) => onChange(e.target.value)} />
      </Fld>
    );
  }
  if (control === 'datetime') return <Fld label={label}><input type="datetime-local" aria-label={label} style={fldInput} value={raw || ''} onChange={(e) => onChange(e.target.value)} /></Fld>;
  if (control === 'range') {
    const shown = s.valueLabel ? s.valueLabel.replace('{v}', v) : (s.showValue ? `${label}: ${v}` : label);
    return (
      <Fld label={shown}>
        <input type="range" aria-label={label} min={s.rangeMin ?? s.min} max={s.rangeMax ?? s.max} step={s.step ?? 1} style={{ width: '100%', cursor: 'pointer', ...(s.rtl ? { direction: 'rtl' } : {}) }}
          value={v} onChange={(e) => onChange(parseFloat(e.target.value))} />
      </Fld>
    );
  }
  if (s.type === 'enum' || control === 'select') {
    let opts = choicesOf(s);
    // a value the choices don't list but the setting accepts (a focal point such as "30% 70%" set by the picker): shown as it is
    if (s.pattern && v !== '' && v != null && !opts.some(([o]) => String(o) === String(v)) && new RegExp(s.pattern).test(String(v))) opts = [...opts, [v, `Focal point (${v})`]];
    const has = (x) => opts.some(([o]) => String(o) === String(x));
    const cur = has(v) ? v : has(s.default) ? s.default : (opts[0] || [''])[0];   // a value that is not one of the choices: the default, else the first
    const numeric = s.type === 'number';
    return <SelF label={label} value={cur ?? ''} onChange={(x) => onChange(numeric ? Number(x) : x)} options={opts} />;
  }
  if (s.type === 'number') return <NumF label={label} min={s.min} max={s.max} step={s.step} value={v} onChange={onChange} placeholder={placeholder} />;
  const warn = s.check && String(v).trim() !== '' && transformValue(s.check, v) === '';
  return (
    <>
      <TxtF label={label} value={v} onChange={onChange} placeholder={placeholder} multiline={control === 'textarea'} rows={s.rows} />
      {warn && <p role="alert" style={{ fontSize: '11px', color: '#fbbf24', margin: '6px 0 0' }}>{s.checkMessage}</p>}
    </>
  );
}

// The fields of a section, a list item or an object: shown ones only, two "half" ones per row, with their hints
function Fields({ keys, scope, labels }) {
  const out = [];
  let pair = [];
  const flush = () => { if (pair.length) out.push(<div key={'h' + out.length} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>{pair}</div>); pair = []; };
  for (const k of keys) {
    const s0 = scope.settings[k];
    if (!s0 || s0.hidden || s0.type === 'flag' || s0.type === 'calc' || !holds(s0.showIf, scope)) continue;
    const s = labels && labels[k] ? { ...s0, label: labels[k] } : s0;
    const el = (
      <React.Fragment key={k}>
        {s.subhead && <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #334155' }}><span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '.5px' }}>{s.subhead}</span></div>}
        <Control k={k} s={s} scope={scope} />
        {s.hint && holds(s.hintIf, scope) && <p style={{ ...hintStyle, margin: '6px 0 0 0' }}>{s.hint}</p>}
      </React.Fragment>
    );
    if (s.half) { pair.push(el); if (pair.length === 2) flush(); } else { flush(); out.push(el); }
  }
  flush();
  return out;
}

// A list of objects: one card per item (move, remove), its fields, and the add buttons
function ListField({ k, s, scope }) {
  const { ctx } = scope;
  const items = ctx.lstOf(k);
  const full = s.maxItems && items.length >= s.maxItems;
  const secondary = { ...lstAddBtn, borderStyle: 'solid', borderWidth: '1px', color: '#94a3b8' };
  return (
    <>
      {items.map((it0, i) => {
        const it = it0 && typeof it0 === 'object' ? it0 : {};
        const inner = {
          ...scope, settings: s.item || {}, values: it, styles: null, pick: { list: k, index: i },
          patch: (kk, x) => ctx.lstPatch(k, i, { [kk]: x }), patchItem: (p) => ctx.lstPatch(k, i, p),
        };
        return (
          <ItemCard key={i} title={itemTitle(s, it, i)} index={i} total={items.length} onMove={(d) => ctx.lstMove(k, i, d)} onRemove={() => ctx.lstRemove(k, i)}>
            <Fields keys={s.itemKeys || Object.keys(s.item || {})} scope={inner} />
          </ItemCard>
        );
      })}
      {!full && s.addFromMedia && (
        <button type="button" onClick={() => ctx.setMediaPickerTarget({ type: 'into', list: k, add: true, key: s.addFromMedia.key, alt: s.addFromMedia.alt, item: makeItem(s.newItem) })}
          style={{ ...lstAddBtn, marginBottom: '6px' }}>{s.addFromMedia.label}</button>
      )}
      {!full && s.addLabel !== false && (
        <button type="button" onClick={() => ctx.lstAdd(k, makeItem(s.newItem))} style={s.addFromMedia ? secondary : lstAddBtn}>{s.addLabel || '+ Add item'}</button>
      )}
    </>
  );
}

export default function SchemaPanel({ def, ctx }) {
  const settings = def.settings || {};
  const scope = {
    ctx, settings, values: ctx.c, styles: (ctx.selectedBlock && ctx.selectedBlock.styles) || {}, pick: {},
    patch: (k, v) => ctx.set(k, v),
  };
  return (
    <>
      {(def.panel || []).filter((g) => holds(g.showIf, scope)).map((g) => {
        const W = g.widget ? PANEL_WIDGETS[g.widget] : null;
        const hints = [].concat(g.hint || []);
        return (
          <PanelAccordion key={g.title} title={g.title} icon={ICONS[g.icon] || LayoutGrid} defaultOpen={!!g.open}>
            {W && <W ctx={ctx} def={def} />}
            <Fields keys={g.keys || []} scope={scope} />
            {holds(g.hintIf, scope) && hints.map((h, i) => <p key={i} style={hintStyle}>{h}</p>)}
          </PanelAccordion>
        );
      })}
    </>
  );
}
