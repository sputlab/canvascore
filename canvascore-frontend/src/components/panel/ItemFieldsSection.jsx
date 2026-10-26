// Item fields (Page Settings, for a collection item): one input per field of the item's collection, typed to the
// field (rich text, a number, a date, an image or a gallery from the media library, a link, a choice, an item of
// another collection). The values are saved with the item (field_values).
import React, { useEffect, useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { PanelAccordion, ImgF } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { RichTextField } from '../../editor/RichText';
import MediaPickerModal from '../MediaPickerModal';
import { emptyFieldValue } from '../../editor/itemFields';
import { __ } from '../../i18n/index.js';

const wrap = { marginBottom: 14 };
const hint = { margin: '4px 0 0', fontSize: 11, color: '#64748b' };

export default function ItemFieldsSection({ activePage, updateActivePage }) {
  const defs = activePage.__fieldDefs || [];
  const values = activePage.field_values || {};
  const [picker, setPicker] = useState(null);   // { id, index } while the media library is open (index -1: add to a gallery)
  const [refs, setRefs] = useState({});         // items of each collection a reference can point to: { [collectionId]: [{id,title}] }
  const targets = [...new Set(defs.filter((d) => d.type === 'reference' && d.target).map((d) => d.target))].join(',');

  useEffect(() => {
    let alive = true;
    targets.split(',').filter(Boolean).forEach((cid) => {
      fetch('api.php?action=get_items&collection=' + encodeURIComponent(cid)).then((r) => r.json()).then((d) => {
        if (alive && Array.isArray(d)) setRefs((r) => ({ ...r, [cid]: d.map((it) => ({ id: it.id, title: it.title || __("Untitled") })) }));
      }).catch(() => {});
    });
    return () => { alive = false; };
  }, [targets]);

  const set = (id, v) => updateActivePage({ field_values: { ...values, [id]: v } });
  const current = (d) => (values[d.id] !== undefined ? values[d.id] : emptyFieldValue(d));

  const renderInput = (d) => {
    const v = current(d);
    switch (d.type) {
      case 'text':
        return <input type="text" style={inputStyle} aria-label={d.label} value={v} onChange={(e) => set(d.id, e.target.value)} />;
      case 'richtext':
        return <RichTextField label={null} variant="full" minHeight={120} value={v} onChange={(html) => set(d.id, html)} />;
      case 'number':
        return <input type="number" style={inputStyle} aria-label={d.label} value={v === null ? '' : v} onChange={(e) => set(d.id, e.target.value === '' ? null : Number(e.target.value))} />;
      case 'date':
        return <input type="date" style={inputStyle} aria-label={d.label} value={v} onChange={(e) => set(d.id, e.target.value)} />;
      case 'image':
        return <ImgF label={null} value={v} onChange={(url) => set(d.id, url)} onPick={() => setPicker({ id: d.id, index: null })} />;
      case 'gallery':
        return (
          <div style={{ display: 'grid', gap: 8 }}>
            {v.map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}><ImgF label={null} value={url} onChange={(u) => set(d.id, v.map((x, k) => (k === i ? u : x)))} onPick={() => setPicker({ id: d.id, index: i })} /></div>
                <button type="button" aria-label={__("Remove image {0}", i + 1)} title={__("Remove")} onClick={() => set(d.id, v.filter((_, k) => k !== i))}
                  style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '6px' }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setPicker({ id: d.id, index: -1 })} style={{ justifySelf: 'start', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
              <Plus size={12} style={{ verticalAlign: '-2px' }} /> {__("Add image")}
            </button>
          </div>
        );
      case 'link':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <input type="text" style={inputStyle} placeholder={__("Text")} aria-label={__("{0} text", d.label)} value={v.text} onChange={(e) => set(d.id, { ...v, text: e.target.value })} />
            <input type="text" style={inputStyle} placeholder={__("https://… or a page of this site")} aria-label={__("{0} address", d.label)} value={v.url} onChange={(e) => set(d.id, { ...v, url: e.target.value })} />
          </div>
        );
      case 'choice':
        if (d.multiple) {
          return (
            <div style={{ display: 'grid', gap: 4 }}>
              {(d.options || []).map((o) => (
                <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                  <input type="checkbox" checked={v.includes(o.value)} onChange={(e) => set(d.id, e.target.checked ? [...v, o.value] : v.filter((x) => x !== o.value))} /> {o.label}
                </label>
              ))}
            </div>
          );
        }
        return (
          <select style={inputStyle} value={v} onChange={(e) => set(d.id, e.target.value)} aria-label={d.label}>
            <option value="">—</option>
            {(d.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'reference': {
        const list = refs[d.target] || [];
        return (
          <select style={inputStyle} value={v} onChange={(e) => set(d.id, e.target.value)} aria-label={d.label}>
            <option value="">{d.target ? '—' : __("No collection chosen for this field")}</option>
            {list.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
          </select>
        );
      }
      default:
        return null;
    }
  };

  const onPicked = (url) => {
    if (!picker) return;
    const d = defs.find((x) => x.id === picker.id);
    if (d && d.type === 'gallery') {
      const list = current(d);
      set(d.id, picker.index === -1 ? [...list, url] : list.map((x, k) => (k === picker.index ? url : x)));
    } else set(picker.id, url);
    setPicker(null);
  };

  return (
    <PanelAccordion title={__("Item fields")} icon={ListChecks} defaultOpen={defs.length > 0}>
      {defs.length === 0 ? (
        <p style={hint}>{__("This collection has no custom fields yet. An admin adds them in Collections › Fields.")}</p>
      ) : defs.map((d) => (
        <div key={d.id} style={wrap}>
          <label style={labelStyle}>{d.label}{d.required ? ' *' : ''}</label>
          {renderInput(d)}
          {d.required && <p style={hint}>{__("Required to publish.")}</p>}
        </div>
      ))}
      {picker && <MediaPickerModal onClose={() => setPicker(null)} onSelect={onPicked} />}
    </PanelAccordion>
  );
}
