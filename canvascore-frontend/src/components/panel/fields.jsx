// Reusable controls of the property panel (sections, spacing box, list item cards, labelled fields).
import React, { useEffect } from 'react';
import { ArrowUp, ArrowDown, Trash2, Image as ImageIcon } from 'lucide-react';
import { Section } from '../../ui/kit';
import { useStore } from '../../store/useStore';
import { colorRef, parseColorRef, resolveColor } from '../../editor/palette';
import { handleNumericKey, lstIconBtn, fldInput, fldLabel } from './helpers';
import { __ } from '../../i18n/index.js';

// Collapsible section (same look everywhere: ui-section from the UI kit)
export const PanelAccordion = ({ title, icon, children, defaultOpen = false }) => (
  <Section title={title} icon={icon} defaultOpen={defaultOpen}>{children}</Section>
);

export const SpacingControl = ({ label, value, onChange }) => {
  const vals = value ? value.split(' ') : ['0px', '0px', '0px', '0px'];
  const t = vals[0] || '0px'; const r = vals[1] || t; const b = vals[2] || t; const l = vals[3] || r;
  const update = (idx, val) => { const newVals = [t, r, b, l]; newVals[idx] = val; onChange(newVals.join(' ')); };
  const inputStyle = { width: '65px', height: '28px', textAlign: 'center', fontSize: '11px', border: '1px solid #334155', borderRadius: '4px', background: '#0f172a', color: '#f8fafc', padding: '0 4px', boxSizing: 'border-box' };

  return (
    <div style={{ marginBottom: '5px' }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px' }}>
        {label}
        <span style={{fontWeight:'normal', fontSize:'9px', color:'#64748b'}}>{__("(px, rem, % - Use ↑/↓)")}</span>
      </label>
      <div style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '9px', color: '#64748b', width:'25px', textAlign:'right', fontWeight:'bold' }}>{__("TOP")}</span><input type="text" value={t} onChange={e => update(0, e.target.value)} onKeyDown={e => handleNumericKey(e, t, val => update(0, val))} style={inputStyle} /></div>
        <div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '9px', color: '#64748b', width:'25px', textAlign:'right', fontWeight:'bold' }}>{__("LEFT")}</span><input type="text" value={l} onChange={e => update(3, e.target.value)} onKeyDown={e => handleNumericKey(e, l, val => update(3, val))} style={inputStyle} /></div>
          <div style={{ width: '20px', height: '20px', background: '#334155', borderRadius: '4px' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="text" value={r} onChange={e => update(1, e.target.value)} onKeyDown={e => handleNumericKey(e, r, val => update(1, val))} style={inputStyle} /><span style={{ fontSize: '9px', color: '#64748b', fontWeight:'bold' }}>{__("RIGHT")}</span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '9px', color: '#64748b', width:'25px', textAlign:'right', fontWeight:'bold' }}>{__("BOT")}</span><input type="text" value={b} onChange={e => update(2, e.target.value)} onKeyDown={e => handleNumericKey(e, b, val => update(2, val))} style={inputStyle} /></div>
      </div>
    </div>
  );
};

export const ItemCard = ({ title, index, total, onMove, onRemove, children }) => (
  <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '8px', border: '1px solid #334155' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '6px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{title}</span>
      <div style={{ display: 'flex', gap: '2px' }}>
        <button disabled={index === 0} onClick={() => onMove(-1)} title={__("Move up")} style={lstIconBtn(index === 0)}><ArrowUp size={13} /></button>
        <button disabled={index === total - 1} onClick={() => onMove(1)} title={__("Move down")} style={lstIconBtn(index === total - 1)}><ArrowDown size={13} /></button>
        <button onClick={onRemove} title={__("Remove")} style={{ ...lstIconBtn(false), color: '#ef4444' }}><Trash2 size={13} /></button>
      </div>
    </div>
    {children}
  </div>
);

export const Fld = ({ label, children }) => (<div>{label && <label style={fldLabel}>{label}</label>}{children}</div>);
export const TxtF = ({ label, value, onChange, placeholder, multiline, rows, mono }) => (
  <Fld label={label}>
    {multiline
      ? <textarea rows={rows || 3} style={{ ...fldInput, resize: 'vertical', ...(mono ? { fontFamily: 'monospace', fontSize: '11px' } : {}) }} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      : <input type="text" style={fldInput} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
  </Fld>
);
export const NumF = ({ label, value, onChange, min, max, step, placeholder }) => (
  <Fld label={label}><input type="number" min={min} max={max} step={step} style={fldInput} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></Fld>
);
export const SelF = ({ label, value, onChange, options }) => (
  <Fld label={label}><select style={fldInput} aria-label={label || undefined} value={value} onChange={e => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Fld>
);
export const ChkF = ({ label, checked, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', marginTop: '8px' }}><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /> {label}</label>
);
// Color field: swatch + typed value (any CSS color) + Transparent + clear. Used for every color in the panels.
const checker = 'repeating-conic-gradient(#94a3b8 0% 25%, #e2e8f0 0% 50%) 50% / 10px 10px';
// The global colours as swatches under a colour field; picking one stores a reference, so the field follows the
// palette when it changes (Global Options › Global colours)
export const PaletteSwatches = ({ value, onPick }) => {
  const palette = useStore((s) => s.palette);
  const loadPalette = useStore((s) => s.loadPalette);
  useEffect(() => { if (!palette) loadPalette(); }, [palette, loadPalette]);
  if (!palette || !palette.length) return null;
  const ref = parseColorRef(value);
  return (
    <div className="cc-swatches" role="group" aria-label={__("Global colours")} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
      {palette.map((c) => (
        <button key={c.id} type="button" title={__("{0} (global colour)", c.name)} aria-label={__("{0} (global colour)", c.name)} aria-pressed={!!ref && ref.id === c.id}
          onClick={() => onPick(colorRef(c))}
          style={{ width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', padding: 0, background: c.value, border: ref && ref.id === c.id ? '2px solid #38bdf8' : '1px solid #475569', boxShadow: ref && ref.id === c.id ? '0 0 0 2px #0f172a inset' : 'none' }} />
      ))}
    </div>
  );
};

export const ColorInput = ({ value, onChange, placeholder, allowTransparent = true, allowClear = true, label }) => {
  const palette = useStore((s) => s.palette);
  const v = value ?? '';
  const ref = parseColorRef(v);
  const global = ref ? (palette || []).find((c) => c.id === ref.id) : null;
  const shown = resolveColor(v, palette);
  const hex = /^#[0-9a-fA-F]{6}$/.test(shown) ? shown : (/^#[0-9a-fA-F]{3}$/.test(shown) ? '#' + shown.slice(1).split('').map(c => c + c).join('') : null);
  const isTransparent = v === 'transparent';
  const chip = { height: '30px', padding: '0 8px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', border: '1px solid #334155', flexShrink: 0 };
  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ position: 'relative', width: '30px', height: '30px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, border: '1px solid #334155', background: isTransparent || !v ? checker : shown }}>
          <input type="color" aria-label={label ? __("Pick {0}", label) : __("Pick a color")} value={hex || '#ffffff'} onChange={e => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }} />
        </span>
        {ref ? (
          // A global colour: shown by name; "Unlink" keeps today's colour as a fixed value
          <span className="cc-color-global" style={{ ...fldInput, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{global ? global.name : __("Missing colour")} <span style={{ color: '#64748b' }}>{__("· global")}</span></span>
            <button type="button" onClick={() => onChange(shown || '')} title={__("Keep this colour but stop following the global colour")} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', padding: 0 }}>{__("Unlink")}</button>
          </span>
        ) : (
          <input type="text" aria-label={label || __("Color")} style={{ ...fldInput, flex: 1, minWidth: 0 }} value={v} onChange={e => onChange(e.target.value)} placeholder={placeholder || __("Default")} />
        )}
        {allowTransparent && (
          <button type="button" onClick={() => onChange('transparent')} title={__("No fill (transparent)")} aria-pressed={isTransparent}
            style={{ ...chip, background: isTransparent ? '#38bdf8' : '#1e293b', color: isTransparent ? '#0f172a' : '#cbd5e1' }}>{__("Transparent")}</button>
        )}
        {allowClear && v !== '' && (
          <button type="button" onClick={() => onChange('')} title={__("Back to default")} aria-label={__("Clear color")} style={{ ...chip, background: 'transparent', color: '#94a3b8', padding: '0 6px' }}>×</button>
        )}
      </div>
      <PaletteSwatches value={v} onPick={onChange} />
    </div>
  );
};
export const ColorF = ({ label, value, onChange, placeholder, allowTransparent = true }) => (
  <Fld label={label}><ColorInput label={label} value={value} onChange={onChange} placeholder={placeholder || __("#cbd5e1")} allowTransparent={allowTransparent} /></Fld>
);
// An audio or video file: its address (a library file or any https:// address) and a button for the library
export const FileF = ({ label, value, onChange, onPick, kind = 'video' }) => (
  <Fld label={label}>
    <div style={{ display: 'flex', gap: '6px' }}>
      <input type="text" style={{ ...fldInput, flex: 1 }} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={kind === 'audio' ? __("Audio file address") : __("Video file address")} />
      <button onClick={onPick} title={__("Choose from the media library")} aria-label={__("Choose from the media library")} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 9px', cursor: 'pointer' }}><ImageIcon size={13} /></button>
    </div>
  </Fld>
);
export const ImgF = ({ label, value, onChange, onPick }) => (
  <Fld label={label}>
    <div style={{ display: 'flex', gap: '6px' }}>
      {value ? <img src={value} alt="" style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} /> : null}
      <input type="text" style={{ ...fldInput, flex: 1 }} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={__("Image URL")} />
      <button onClick={onPick} title={__("Choose from the media library")} aria-label={__("Choose from the media library")} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 9px', cursor: 'pointer' }}><ImageIcon size={13} /></button>
    </div>
  </Fld>
);
