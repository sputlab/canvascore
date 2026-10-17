import React from 'react';
import { Layout, Sliders, Image as ImageIcon } from 'lucide-react';
import { PanelAccordion, ItemCard, Fld, TxtF, SelF, ColorF } from '../fields';
import { handleNumericKey, labelStyle, inputStyle, fldInput, lstAddBtn } from '../helpers';
import { BUTTON_EFFECTS } from '../../../render/effects.mjs';
import { BUTTON_PRESETS } from '../../../render/kit.mjs';

// Quick looks for a hero button: filled, outlined (transparent with a border) or text only.
const STYLE_PRESETS = [['solid', 'Solid'], ['outline', 'Outline'], ['ghost', 'Text only']];
const presetOf = (b) => (b.bgColor === 'transparent' ? (b.borderColor ? 'outline' : 'ghost') : 'solid');
const applyPreset = (b, id) => {
  const ink = b.bgColor && b.bgColor !== 'transparent' ? b.bgColor : (b.borderColor || '#ffffff');
  if (id === 'outline') return { bgColor: 'transparent', borderColor: b.borderColor || ink, textColor: b.borderColor || ink };
  if (id === 'ghost') return { bgColor: 'transparent', borderColor: '', textColor: b.textColor === '#ffffff' || !b.textColor ? ink : b.textColor };
  return { bgColor: b.borderColor || (b.bgColor !== 'transparent' && b.bgColor) || '#3b82f6', borderColor: '', textColor: '#ffffff' };
};
import { RichTextField } from '../../../editor/RichText';

// Content panel: HERO
export default function HeroPanel({ ctx }) {
  const { selectedBlock, handleContentChange, setMediaPickerTarget, pages } = ctx;
  const buttons = selectedBlock.content.buttons || [];
  const patch = (i, p) => handleContentChange('buttons', buttons.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const moveBtn = (i, d) => {
    const j = i + d; if (j < 0 || j >= buttons.length) return;
    const next = [...buttons]; [next[i], next[j]] = [next[j], next[i]]; handleContentChange('buttons', next);
  };
  return (
    <>
      <PanelAccordion title="Background & Titles" icon={Layout} defaultOpen={true}>
        <label style={labelStyle}>Hero Background Image</label>
        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
          <input type="text" style={{...inputStyle, flex: 1}} value={selectedBlock.content.bgImage || ''} onChange={e => handleContentChange('bgImage', e.target.value)} />
          <button type="button" title="Choose from the media library" aria-label="Choose from the media library" onClick={() => setMediaPickerTarget('bgImage')} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 12px', cursor: 'pointer' }}><ImageIcon size={16}/></button>
        </div>
        <label style={labelStyle}>Main Title</label>
        <RichTextField label="Main title" variant="basic" value={selectedBlock.content.title || ''} onChange={(val) => handleContentChange('title', val)} />
        <label style={labelStyle}>Subtitle</label>
        <RichTextField label="Subtitle" variant="basic" value={selectedBlock.content.subtitle || ''} onChange={(val) => handleContentChange('subtitle', val)} />
      </PanelAccordion>

      <PanelAccordion title="Hero Buttons" icon={Sliders} defaultOpen={false}>
        {buttons.map((btn, index) => (
          <ItemCard key={index} title={`Button ${index + 1}`} index={index} total={buttons.length}
            onMove={(d) => moveBtn(index, d)} onRemove={() => handleContentChange('buttons', buttons.filter((_, i) => i !== index))}>
            <TxtF label="Text" value={btn.text} onChange={v => patch(index, { text: v })} placeholder="Button text" />
            <SelF label="Button preset" value={btn.preset || ''} onChange={v => patch(index, { preset: v })} options={[['', 'Custom'], ...BUTTON_PRESETS]} />
            {btn.preset ? <p style={{ fontSize: '11px', color: '#64748b', margin: '-4px 0 8px' }}>Colours and corners come from the preset (Global Options › Buttons &amp; fields).</p> : null}
            <Fld label="Link">
              <select style={{...fldInput, marginBottom: '6px'}} value={btn.url ?? '#'} onChange={e => patch(index, { url: e.target.value })}>
                <option value="#">Select internal page...</option>
                {pages.map(p => <option key={p.id} value={p.clean_slug ? p.clean_slug + '/index.html' : 'index.html'}>📄 {p.title}</option>)}
              </select>
              <input type="text" style={fldInput} placeholder="Custom URL..." value={btn.url ?? ''} onChange={e => patch(index, { url: e.target.value })} />
            </Fld>
            <Fld label="Style">
              <div className="ui-seg" role="group" aria-label="Button style" style={{ display: 'flex', gap: 4 }}>
                {STYLE_PRESETS.map(([id, name]) => (
                  <button key={id} type="button" className="ui-seg__btn" aria-pressed={presetOf(btn) === id} onClick={() => patch(index, applyPreset(btn, id))}>{name}</button>
                ))}
              </div>
            </Fld>
            <ColorF label="Background" value={btn.bgColor} onChange={v => patch(index, { bgColor: v })} />
            <ColorF label="Text color" value={btn.textColor} onChange={v => patch(index, { textColor: v })} allowTransparent={false} />
            <ColorF label="Border (empty = no border)" value={btn.borderColor} onChange={v => patch(index, { borderColor: v })} allowTransparent={false} placeholder="No border" />
            <Fld label="Corner radius (↑/↓)">
              <input type="text" value={btn.borderRadius ?? ''} onChange={e => patch(index, { borderRadius: e.target.value })}
                onKeyDown={e => handleNumericKey(e, btn.borderRadius, val => patch(index, { borderRadius: val }))} style={fldInput} />
            </Fld>
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #334155' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '.5px' }}>ON HOVER</span>
              <ColorF label="Background" value={btn.hoverBg} onChange={v => patch(index, { hoverBg: v })} placeholder="No change" />
              <ColorF label="Text color" value={btn.hoverColor} onChange={v => patch(index, { hoverColor: v })} allowTransparent={false} placeholder="No change" />
              {btn.borderColor ? <ColorF label="Border" value={btn.hoverBorder} onChange={v => patch(index, { hoverBorder: v })} allowTransparent={false} placeholder="No change" /> : null}
              <SelF label="Effect" value={btn.effect || ''} onChange={v => patch(index, { effect: v })} options={BUTTON_EFFECTS} />
            </div>
          </ItemCard>
        ))}
        <button onClick={() => handleContentChange('buttons', [...buttons, { text: 'New Button', url: '#', bgColor: '#10b981', textColor: '#ffffff', borderRadius: '8px' }])} style={lstAddBtn}>+ Add Button</button>
      </PanelAccordion>
    </>
  );
}
