// The Content panel of a block with a shared definition (canvascore-admin/blocks/<name>.json), generated from its
// settings: "panel" lists the sections and the settings in each; a setting's label, control and hints come from the
// setting itself. The values shown are the block's own (a missing value shows the setting's default).
//   text      a text field (control "textarea": several lines; "select" with choices: a list to pick from)
//   richtext  control "code": HTML in a monospace text area
//   number    a number field (control "range": a slider from rangeMin to rangeMax)
//   bool      a checkbox      enum   a list of its options      color   a colour field      image   address + library
//   list      one card per item (move, remove), with the item's settings, and an add button (newItem)
import React from 'react';
import { Image as ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3, LayoutGrid } from 'lucide-react';
import { PanelAccordion, ItemCard, TxtF, NumF, SelF, ChkF, ColorF, ImgF, Fld } from './fields';
import { lstAddBtn } from './helpers';

// The icons a definition can name for its sections (anything else gets the generic one)
const ICONS = { Image: ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3 };

// The value a field shows: the stored one, else the setting's default (a missing switch shows its default state)
const shownValue = (s, v) => {
  if (s.type === 'bool') return s.default === true ? v !== false : !!v;
  if (v === undefined || v === null) return ['enum', 'number'].includes(s.type) || s.control === 'select' || s.control === 'range' ? s.default : '';
  return v;
};

function Control({ s, value, onChange, onPick }) {
  const v = shownValue(s, value);
  const label = s.label || '';
  switch (s.type) {
    case 'bool': return <ChkF label={label} checked={v} onChange={onChange} />;
    case 'enum': return <SelF label={label} value={v} onChange={onChange} options={(s.options || []).map((o) => [o.value, o.label || o.value])} />;
    case 'color': return <ColorF label={label} value={v} onChange={onChange} placeholder={s.placeholder} />;
    case 'image': return <ImgF label={label} value={v} onChange={onChange} onPick={onPick} />;
    case 'number':
      if (s.control === 'range') {
        return (
          <Fld label={label}>
            <input type="range" aria-label={label} min={s.rangeMin ?? s.min} max={s.rangeMax ?? s.max} step={s.step ?? 1} style={{ width: '100%', cursor: 'pointer' }}
              value={v} onChange={(e) => onChange(parseFloat(e.target.value))} />
          </Fld>
        );
      }
      return <NumF label={label} min={s.min} max={s.max} step={s.step} value={v} onChange={onChange} />;
    default:
      if (s.control === 'select') return <SelF label={label} value={v} onChange={onChange} options={s.choices || []} />;
      return <TxtF label={label} value={v} onChange={onChange} placeholder={s.placeholder} multiline={s.control === 'textarea' || s.control === 'code'} rows={s.rows} mono={s.control === 'code'} />;
  }
}

export default function SchemaPanel({ def, ctx }) {
  const { c, set, lstOf, lstPatch, lstRemove, lstAdd, lstMove, pickTo } = ctx;
  const settings = def.settings || {};
  const field = (key) => {
    const s = settings[key];
    if (!s) return null;
    if (s.type !== 'list') {
      return <Control key={key} s={s} value={c[key]} onChange={(v) => set(key, v)} onPick={pickTo({ key, ...(s.altKey ? { alt: s.altKey } : {}) })} />;
    }
    const items = lstOf(key);
    return (
      <React.Fragment key={key}>
        {items.map((it, i) => (
          <ItemCard key={i} title={(s.itemTitle || 'Item {n}').replace('{n}', i + 1)} index={i} total={items.length} onMove={(d) => lstMove(key, i, d)} onRemove={() => lstRemove(key, i)}>
            {Object.entries(s.item || {}).map(([k, is]) => (
              <Control key={k} s={is} value={it && typeof it === 'object' ? it[k] : undefined} onChange={(v) => lstPatch(key, i, { [k]: v })}
                onPick={pickTo({ key: k, list: key, index: i, ...(is.altKey ? { alt: is.altKey } : {}) })} />
            ))}
          </ItemCard>
        ))}
        <button type="button" onClick={() => lstAdd(key, JSON.parse(JSON.stringify(s.newItem || {})))} style={lstAddBtn}>{s.addLabel || '+ Add item'}</button>
      </React.Fragment>
    );
  };
  return (
    <>
      {(def.panel || []).map((g) => (
        <PanelAccordion key={g.title} title={g.title} icon={ICONS[g.icon] || LayoutGrid} defaultOpen={!!g.open}>
          {(g.keys || []).map(field)}
          {g.hint && <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' }}>{g.hint}</p>}
        </PanelAccordion>
      ))}
    </>
  );
}
