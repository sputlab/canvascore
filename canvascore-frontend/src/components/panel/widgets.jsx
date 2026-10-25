// Panel widgets: the few controls of a generated Content panel (SchemaPanel.jsx) that are more than a field
// (registered by name in widgetRegistry.js). A block definition names one, the way it names a behaviour script: a section with "widget" (the section's content), or a
// setting with "control": "widget:<name>" (in place of its field; list items too). Each receives { ctx, def, s, k }
// (a section gets no s/k; a list item's widget also gets item and patch).
import React, { useState, useEffect } from 'react';
import { ItemCard, TxtF, NumF, ColorF } from './fields';
import { labelStyle, inputStyle, lstAddBtn, fldInput } from './helpers';
import { DEFAULT_HOURS } from './constants';

// --- Hotspots: the click-to-place area and the pins (a pin selected in the cards is placed by a click on the image)
function PinPlacer({ image, ratio, pins, selected, onSelect, onPlace }) {
  const place = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height || selected == null) return;
    const pct = (v, max) => Math.round(Math.min(100, Math.max(0, (v / max) * 100)) * 10) / 10;
    onPlace(selected, pct(e.clientX - r.left, r.width), pct(e.clientY - r.top, r.height));
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div role="group" aria-label="Pin placement area: click to move the selected pin" onClick={place}
        style={{ position: 'relative', cursor: selected == null ? 'default' : 'crosshair', borderRadius: 8, overflow: 'hidden', background: '#e2e8f0', aspectRatio: image ? undefined : ratio, border: '1px solid #334155' }}>
        {image && <img src={image} alt="" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }} />}
        {pins.map((p, i) => (
          <button key={i} type="button" aria-label={`Select pin ${i + 1}`} aria-pressed={selected === i}
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
            style={{ position: 'absolute', left: `${Number(p.x) || 0}%`, top: `${Number(p.y) || 0}%`, transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%', padding: 0, cursor: 'pointer', font: '700 11px/1 system-ui', color: '#fff', background: selected === i ? '#f59e0b' : '#3b82f6', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }}>{i + 1}</button>
        ))}
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0 0' }}>{selected == null ? 'Select a pin, then click on the image to place it.' : `Pin ${selected + 1} selected: click on the image to move it.`}</p>
    </div>
  );
}
export function HotspotPins({ ctx }) {
  const { c, lstOf, lstPatch, lstRemove, lstAdd, lstMove } = ctx;
  const pins = lstOf('pins');
  const [selected, setSelected] = useState(pins.length ? 0 : null);
  const sel = selected != null && selected < pins.length ? selected : null;
  return (
    <>
      <PinPlacer image={c.image} ratio={c.ratio || '16 / 9'} pins={pins} selected={sel} onSelect={setSelected} onPlace={(i, x, y) => lstPatch('pins', i, { x, y })} />
      {pins.map((p, i) => (
        <ItemCard key={i} title={p.title || `Pin ${i + 1}`} index={i} total={pins.length} onMove={(d) => { lstMove('pins', i, d); setSelected(Math.min(pins.length - 1, Math.max(0, i + d))); }} onRemove={() => { lstRemove('pins', i); setSelected(null); }}>
          <TxtF label="Title" value={p.title} onChange={(v) => lstPatch('pins', i, { title: v })} />
          <TxtF label="Text" value={p.text} onChange={(v) => lstPatch('pins', i, { text: v })} multiline rows={2} />
          <TxtF label="Link text (empty = no link)" value={p.linkText} onChange={(v) => lstPatch('pins', i, { linkText: v })} />
          <TxtF label="Link" value={p.href} onChange={(v) => lstPatch('pins', i, { href: v })} placeholder="/page or https://…" />
          <NumF label="Position from the left (%)" value={p.x ?? 50} onChange={(v) => lstPatch('pins', i, { x: v })} min={0} max={100} step={0.5} />
          <NumF label="Position from the top (%)" value={p.y ?? 50} onChange={(v) => lstPatch('pins', i, { y: v })} min={0} max={100} step={0.5} />
          <button onClick={() => setSelected(i)} style={{ ...lstAddBtn, marginTop: 6, borderStyle: 'solid', borderWidth: '1px', color: '#94a3b8' }}>Place this pin on the image</button>
        </ItemCard>
      ))}
      {pins.length < 20 && <button onClick={() => { lstAdd('pins', { x: 50, y: 50, title: 'New pin', text: '', linkText: '', href: '' }); setSelected(pins.length); }} style={lstAddBtn}>+ Add pin</button>}
    </>
  );
}

// --- Site Search: the filters visitors can use (the collection, and each taxonomy of the site)
export function SearchFacets({ ctx }) {
  const { c, set } = ctx;
  const [taxes, setTaxes] = useState([]);
  useEffect(() => {
    fetch('api.php?action=get_taxonomy_list').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTaxes(d); }).catch(() => {});
  }, []);
  const facets = Array.isArray(c.facets) ? c.facets : [];
  const toggle = (key, on) => set('facets', on ? [...facets, key] : facets.filter((x) => x !== key));
  return (
    <>
      <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', margin: '12px 0 6px' }}>Filters (faceted search)</label>
      <div role="group" aria-label="Filters" style={{ display: 'grid', gap: '4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
          <input type="checkbox" checked={facets.includes('collection')} onChange={(e) => toggle('collection', e.target.checked)} /> Collection (Pages, or the name of each collection)
        </label>
        {taxes.map((t) => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input type="checkbox" checked={facets.includes('tax:' + t.id)} onChange={(e) => toggle('tax:' + t.id, e.target.checked)} /> {t.name} <span style={{ color: '#64748b' }}>({t.collection})</span>
          </label>
        ))}
      </div>
    </>
  );
}

// --- Business Details: the week's opening hours, one compact row per day
export function BusinessHours({ ctx }) {
  const { c, set, lstPatch } = ctx;
  const hours = Array.isArray(c.hours) ? c.hours : [];
  if (hours.length === 0) return <button onClick={() => set('hours', DEFAULT_HOURS)} style={lstAddBtn}>+ Add weekly hours</button>;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px 74px 24px', gap: '4px', fontSize: '10px', color: '#64748b', fontWeight: 700 }}><span>DAY (label)</span><span>OPENS</span><span>CLOSES</span><span title="Closed">✕</span></div>
      {hours.map((hr, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 74px 74px 24px', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
          <input type="text" style={fldInput} value={hr.day ?? ''} onChange={(e) => lstPatch('hours', i, { day: e.target.value })} />
          <input type="time" style={fldInput} value={hr.open || ''} disabled={!!hr.closed} onChange={(e) => lstPatch('hours', i, { open: e.target.value })} />
          <input type="time" style={fldInput} value={hr.close || ''} disabled={!!hr.closed} onChange={(e) => lstPatch('hours', i, { close: e.target.value })} />
          <input type="checkbox" title="Closed" checked={!!hr.closed} onChange={(e) => lstPatch('hours', i, { closed: e.target.checked })} />
        </div>
      ))}
      <button onClick={() => set('hours', [])} style={{ ...lstAddBtn, marginTop: '8px', borderStyle: 'solid', borderWidth: '1px', color: '#94a3b8' }}>Remove opening hours</button>
    </>
  );
}

// --- Grid and Cards: how many columns (or cards), and the rich content of each
const gridCount = (b) => (b.type === 'CARDS' ? (b.content.items || []).length : (parseInt(b.content.columns) || 2));   // same fallback as the renderers
export function GridCount({ ctx }) {
  const { selectedBlock, patchContent } = ctx;
  const isCards = selectedBlock.type === 'CARDS';
  const items = selectedBlock.content.items || [];
  const count = gridCount(selectedBlock);
  return (
    <>
      <label style={labelStyle}>{isCards ? 'Number of cards' : 'Number of columns'}: {count}</label>
      <input type="range" min="1" max={isCards ? 12 : 24} style={{ width: '100%', cursor: 'pointer' }} value={count}
        aria-label={isCards ? 'Number of cards' : 'Number of columns'}
        onChange={(e) => {
          const n = parseInt(e.target.value);
          const newItems = Array(n).fill('').map((_, i) => (items[i] !== undefined ? items[i] : (isCards ? `<h3>Card ${i + 1}</h3><p>Describe it here.</p>` : `<p>Column ${i + 1}</p>`)));
          // Cards wrap on their own (auto-fit): only the list changes. A grid also stores its columns.
          patchContent({ ...(isCards ? {} : { columns: n }), items: newItems });
        }} />
    </>
  );
}
export function GridItems({ ctx }) {
  const { selectedBlock, handleContentChange, setMediaPickerTarget } = ctx;
  const isCards = selectedBlock.type === 'CARDS';
  const items = selectedBlock.content.items || [];
  return items.map((item, idx) => (
    <div key={idx} style={{ background: '#0f172a', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #334155' }}>
      <label style={{ ...labelStyle, marginTop: 0 }}>{isCards ? 'Card' : 'Item'} {idx + 1}</label>
      <textarea rows="4" style={inputStyle} value={item} onChange={(e) => handleContentChange('items', items.map((x, i) => (i === idx ? e.target.value : x)))} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
        <button onClick={() => setMediaPickerTarget({ type: 'grid_item', index: idx })} style={{ flex: 1, padding: '6px', background: '#334155', color: '#f8fafc', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Image</button>
        <button onClick={() => handleContentChange('items', items.map((x, i) => (i === idx ? x + '<a href="#" style="display:inline-block; padding:10px 20px; background:#3b82f6; color:#fff; border-radius:6px; text-decoration:none; margin-top:10px; font-weight:bold;">Click Here</a>' : x)))}
          style={{ flex: 1, padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Button</button>
      </div>
    </div>
  ));
}

// --- Button: a size preset (sets the padding and the text size) and the border (its width and style come with it)
export function ButtonSize({ ctx }) {
  const { patchStyles } = ctx;
  return (
    <>
      <label style={labelStyle}>Button Size</label>
      <select style={inputStyle} value="" onChange={(e) => {
        if (e.target.value === 'sm') patchStyles({ padding: '8px 16px', fontSize: '14px' });
        if (e.target.value === 'md') patchStyles({ padding: '12px 24px', fontSize: '16px' });
        if (e.target.value === 'lg') patchStyles({ padding: '18px 36px', fontSize: '20px' });
      }}>
        <option value="">Custom</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>
      </select>
    </>
  );
}
export function ButtonBorder({ ctx }) {
  const { selectedBlock, patchStyles } = ctx;
  const st = selectedBlock.styles || {};
  const hasBorder = parseFloat(st.borderWidth) > 0;
  return (
    <ColorF label="Border" value={hasBorder ? st.borderColor : ''} allowTransparent={false} placeholder="No border"
      onChange={(v) => {
        if (!v) patchStyles({ borderColor: '', borderWidth: '' });
        else patchStyles(hasBorder ? { borderColor: v } : { borderColor: v, borderWidth: '2px', borderStyle: 'solid' });
      }} />
  );
}

// --- Hero buttons: a quick look (filled, outlined, or text only) that sets the colours
const LOOKS = [['solid', 'Solid'], ['outline', 'Outline'], ['ghost', 'Text only']];
const lookOf = (b) => (b.bgColor === 'transparent' ? (b.borderColor ? 'outline' : 'ghost') : 'solid');
const applyLook = (b, id) => {
  const ink = b.bgColor && b.bgColor !== 'transparent' ? b.bgColor : (b.borderColor || '#ffffff');
  if (id === 'outline') return { bgColor: 'transparent', borderColor: b.borderColor || ink, textColor: b.borderColor || ink };
  if (id === 'ghost') return { bgColor: 'transparent', borderColor: '', textColor: b.textColor === '#ffffff' || !b.textColor ? ink : b.textColor };
  return { bgColor: b.borderColor || (b.bgColor !== 'transparent' && b.bgColor) || '#3b82f6', borderColor: '', textColor: '#ffffff' };
};
export function HeroButtonLook({ item, patch }) {
  return (
    <div>
      <label style={labelStyle}>Style</label>
      <div className="ui-seg" role="group" aria-label="Button style" style={{ display: 'flex', gap: 4 }}>
        {LOOKS.map(([id, name]) => (
          <button key={id} type="button" className="ui-seg__btn" aria-pressed={lookOf(item) === id} onClick={() => patch(applyLook(item, id))}>{name}</button>
        ))}
      </div>
    </div>
  );
}

// A payment link for the Payment Button: pick one of the links kept in Administration › Integrations › Stripe, or paste one made in the Stripe dashboard.
// (The block accepts only https://buy.stripe.com/… and https://donate.stripe.com/… addresses: anything else leaves the button empty.)
export function PaymentLink({ ctx, k, item, patch }) {
  // at the top of a block's content the panel gives no patchItem: ctx.set(key, value) is the way
  const put = (v) => (patch ? patch({ [k]: v }) : ctx.set(k, v));
  const [links, setLinks] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('api.php?action=integrations_payment_links').then((r) => r.json()).then((d) => { if (alive) setLinks(d && d.success ? d.links : []); }).catch(() => { if (alive) setLinks([]); });
    return () => { alive = false; };
  }, []);
  const value = (item && item[k]) || '';
  const known = (links || []).some((l) => l.url === value);
  return (
    <>
      <label style={labelStyle}>Stripe payment link</label>
      <select style={inputStyle} aria-label="Choose a payment link" value={known ? value : ''} onChange={(e) => put(e.target.value)}>
        <option value="">{links === null ? 'Loading…' : links.length ? 'Choose a payment link…' : 'No payment links yet'}</option>
        {(links || []).map((l) => <option key={l.id} value={l.url}>{l.name}{l.amount ? ` — ${l.amount} ${String(l.currency || '').toUpperCase()}` : ''}</option>)}
      </select>
      <label style={{ ...labelStyle, marginTop: 8 }}>Or paste a link</label>
      <input style={inputStyle} aria-label="Payment link address" type="url" placeholder="https://buy.stripe.com/…" value={value} onChange={(e) => put(e.target.value.trim())} />
      {value && !/^https:\/\/(buy|donate)\.stripe\.com\//.test(value) && <p role="alert" style={{ fontSize: 11, color: '#fbbf24', margin: '6px 0 0' }}>This is not a Stripe payment link, so the button stays empty.</p>}
      {(links || []).length === 0 && links !== null && <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>Add links in Administration › Integrations › Stripe.</p>}
    </>
  );
}
