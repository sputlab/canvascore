// The Content panel of a block with a shared definition (canvascore-admin/blocks/<name>.json), generated from its
// settings: "panel" lists the sections and the settings in each; a setting's label, control and hints come from the
// setting itself. The values shown are the block's own (a missing value shows the setting's default).
//   text      a text field (control "textarea": several lines; "select" with choices: a list to pick from)
//   richtext  control "code": HTML in a monospace text area
//   code      a monospace text area; adminOnly: read-only for editors, with adminOnlyMessage
//   number    a number field (control "range": a slider from rangeMin to rangeMax, showValue puts the value in its
//             label; control "select" with choices: a list of numbers)
//   bool      a checkbox      enum   a list of its options      color   a colour field      image   address + library
//   list      one card per item (move, remove), with the item's settings, and an add button (newItem)
// Also: hidden (never in the panel), showIf { key: [values] | { not: [values] } } (shown only while another setting
// has one of those values), check + checkMessage (a warning when the transform named by check gives nothing), and on a
// section: hint, shown while hintIf holds.
import React from 'react';
import {
  Image as ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3, LayoutGrid,
  HelpCircle, MapPin, MonitorPlay, Code, SeparatorHorizontal, Hash,
} from 'lucide-react';
import { PanelAccordion, ItemCard, TxtF, NumF, SelF, ChkF, ColorF, ImgF, Fld } from './fields';
import { lstAddBtn, fldInput } from './helpers';
import { transformValue } from '../../render/blockDef.mjs';

// The icons a definition can name for its sections (anything else gets the generic one)
const ICONS = { Image: ImageIcon, Star, MessageSquareQuote, Info, History, Sliders, ListOrdered, BarChart3, HelpCircle, MapPin, MonitorPlay, Code, SeparatorHorizontal, Hash };

// The value a field shows: the stored one, else the setting's default (a missing switch shows its default state)
const shownValue = (s, v) => {
  if (s.type === 'bool') return s.default === true ? v !== false : !!v;
  if (v === undefined || v === null) return ['enum', 'number'].includes(s.type) || s.control === 'select' || s.control === 'range' ? s.default : '';
  return v;
};
// showIf / hintIf: every named setting has one of the listed values (or none of the "not" ones)
const holds = (cond, settings, values) => !cond || Object.entries(cond).every(([k, want]) => {
  const v = settings[k] ? shownValue(settings[k], values[k]) : values[k];
  return Array.isArray(want) ? want.includes(v) : !(want.not || []).includes(v);
});

function Control({ s, value, onChange, onPick, role }) {
  const v = shownValue(s, value);
  const label = s.label || '';
  switch (s.type) {
    case 'bool': return <ChkF label={label} checked={v} onChange={onChange} />;
    case 'enum': return <SelF label={label} value={v} onChange={onChange} options={(s.options || []).map((o) => [o.value, o.label || o.value])} />;
    case 'color': return <ColorF label={label} value={v} onChange={onChange} placeholder={s.placeholder} />;
    case 'image': return <ImgF label={label} value={v} onChange={onChange} onPick={onPick} />;
    case 'code': {
      const locked = s.adminOnly && role !== 'admin';
      return (
        <Fld label={label}>
          <textarea rows={s.rows || 6} readOnly={locked} aria-label={label} style={{ ...fldInput, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', opacity: locked ? 0.7 : 1 }}
            value={v} onChange={(e) => onChange(e.target.value)} />
          {locked && s.adminOnlyMessage && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0' }}>{s.adminOnlyMessage}</p>}
        </Fld>
      );
    }
    case 'number':
      if (s.control === 'range') {
        return (
          <Fld label={s.showValue ? `${label}: ${v}` : label}>
            <input type="range" aria-label={label} min={s.rangeMin ?? s.min} max={s.rangeMax ?? s.max} step={s.step ?? 1} style={{ width: '100%', cursor: 'pointer' }}
              value={v} onChange={(e) => onChange(parseFloat(e.target.value))} />
          </Fld>
        );
      }
      if (s.control === 'select') return <SelF label={label} value={v} onChange={(x) => onChange(Number(x))} options={s.choices || []} />;
      return <NumF label={label} min={s.min} max={s.max} step={s.step} value={v} onChange={onChange} />;
    default: {
      if (s.control === 'select') return <SelF label={label} value={v} onChange={onChange} options={s.choices || []} />;
      const warn = s.check && String(v).trim() !== '' && transformValue(s.check, v) === '';
      return (
        <>
          <TxtF label={label} value={v} onChange={onChange} placeholder={s.placeholder} multiline={s.control === 'textarea' || s.control === 'code'} rows={s.rows} mono={s.control === 'code'} />
          {warn && <p role="alert" style={{ fontSize: '11px', color: '#fbbf24', margin: '6px 0 0' }}>{s.checkMessage}</p>}
        </>
      );
    }
  }
}

export default function SchemaPanel({ def, ctx }) {
  const { c, set, lstOf, lstPatch, lstRemove, lstAdd, lstMove, pickTo, userRole } = ctx;
  const settings = def.settings || {};
  const field = (key) => {
    const s = settings[key];
    if (!s || s.hidden || !holds(s.showIf, settings, c)) return null;
    if (s.type !== 'list') {
      return <Control key={key} s={s} value={c[key]} role={userRole} onChange={(v) => set(key, v)} onPick={pickTo({ key, ...(s.altKey ? { alt: s.altKey } : {}) })} />;
    }
    const items = lstOf(key);
    return (
      <React.Fragment key={key}>
        {items.map((it, i) => {
          const iv = it && typeof it === 'object' ? it : {};
          return (
            <ItemCard key={i} title={(s.itemTitle || 'Item {n}').replace('{n}', i + 1)} index={i} total={items.length} onMove={(d) => lstMove(key, i, d)} onRemove={() => lstRemove(key, i)}>
              {Object.entries(s.item || {}).filter(([, is]) => !is.hidden && holds(is.showIf, s.item, iv)).map(([k, is]) => (
                <Control key={k} s={is} value={iv[k]} role={userRole} onChange={(v) => lstPatch(key, i, { [k]: v })}
                  onPick={pickTo({ key: k, list: key, index: i, ...(is.altKey ? { alt: is.altKey } : {}) })} />
              ))}
            </ItemCard>
          );
        })}
        <button type="button" onClick={() => lstAdd(key, JSON.parse(JSON.stringify(s.newItem || {})))} style={lstAddBtn}>{s.addLabel || '+ Add item'}</button>
      </React.Fragment>
    );
  };
  return (
    <>
      {(def.panel || []).map((g) => (
        <PanelAccordion key={g.title} title={g.title} icon={ICONS[g.icon] || LayoutGrid} defaultOpen={!!g.open}>
          {(g.keys || []).map(field)}
          {g.hint && holds(g.hintIf, settings, c) && <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' }}>{g.hint}</p>}
        </PanelAccordion>
      ))}
    </>
  );
}
