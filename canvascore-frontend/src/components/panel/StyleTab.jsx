import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, Layout, BoxSelect, Palette, Type } from 'lucide-react';
import { PanelAccordion, SpacingControl, ColorInput } from './fields';
import { handleNumericKey, labelStyle, inputStyle } from './helpers';
import DeviceBar from './DeviceBar';
import StyleToolbar from './StyleToolbar';
import { blockLabel } from '../../editor/blockCatalog';
import { TYPE_PRESETS } from '../../render/typography.mjs';

// Blocks whose buttons are part of the block: the Style tab styles the whole block, the buttons have their own
// settings in the Content tab (a border set here goes around the whole block, not around its buttons)
const OWN_BUTTONS = ['HERO', 'VIDEO_HERO', 'PRICING', 'SPLIT_CTA', 'PRICE_CALCULATOR', 'CASE_STUDY', 'NEWSLETTER', 'FORM', 'WIZARD', 'ANNOUNCEMENT_BAR'];

// Style tab (every block): size, spacing, typography, background, borders.
export default function StyleTab({ ctx }) {
  const { selectedBlock, handleStyleChange, patchStyles } = ctx;
  // A border needs a style to show: the Style list shows "Solid" when none is set, so setting a thickness or a
  // colour also stores "solid" (otherwise the browser draws no border at all)
  const setBorder = (prop, value) => {
    if (!selectedBlock.styles.borderStyle && value) patchStyles({ [prop]: value, borderStyle: 'solid' });
    else handleStyleChange(prop, value);
  };
  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>

    <StyleToolbar block={selectedBlock} />

    <DeviceBar block={selectedBlock} />
    {OWN_BUTTONS.includes(selectedBlock.type) && (
      <p className="cc-style-note" style={{ margin: '0 0 6px', padding: '8px 10px', borderRadius: 8, background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.25)', fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.45 }}>
        These styles apply to the whole {blockLabel(selectedBlock.type)} block. Its buttons have their own colours and style in the <strong>Content</strong> tab.
      </p>
    )}

    <PanelAccordion title="Size & Dimensions" icon={Layout} defaultOpen={false}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
        <div>
          <label style={labelStyle}>Width</label>
          <input type="text" style={inputStyle} value={selectedBlock.styles.width || ''} onChange={e => handleStyleChange('width', e.target.value)} placeholder="e.g. 100%, 500px" />
        </div>
        <div>
          <label style={labelStyle}>Height</label>
          <input type="text" style={inputStyle} value={selectedBlock.styles.height || ''} onChange={e => handleStyleChange('height', e.target.value)} placeholder="e.g. auto, 50vh" />
        </div>
        <div>
          <label style={labelStyle}>Max Width</label>
          <input type="text" style={inputStyle} value={selectedBlock.styles.maxWidth || ''} onChange={e => handleStyleChange('maxWidth', e.target.value)} placeholder="e.g. 1200px" />
        </div>
        <div>
          <label style={labelStyle}>Min Height</label>
          <input type="text" style={inputStyle} value={selectedBlock.styles.minHeight || ''} onChange={e => handleStyleChange('minHeight', e.target.value)} placeholder="e.g. 300px" />
        </div>
      </div>
      <label style={labelStyle}>Block Alignment (Centering)</label>
      <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
        <button onClick={() => handleStyleChange('margin', '0 auto 0 0')} style={{ flex: 1, padding: '8px', background: selectedBlock.styles.margin === '0 auto 0 0' ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', color: '#f8fafc' }}><AlignLeft size={14}/></button>
        <button onClick={() => handleStyleChange('margin', '0 auto')} style={{ flex: 1, padding: '8px', background: selectedBlock.styles.margin === '0 auto' ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', color: '#f8fafc' }}><AlignCenter size={14}/></button>
        <button onClick={() => handleStyleChange('margin', '0 0 0 auto')} style={{ flex: 1, padding: '8px', background: selectedBlock.styles.margin === '0 0 0 auto' ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', color: '#f8fafc' }}><AlignRight size={14}/></button>
      </div>
    </PanelAccordion>

    <PanelAccordion title="Spacing (Margin & Padding)" icon={Layout} defaultOpen={false}>
      <SpacingControl label="MARGIN (Outer Space)" value={selectedBlock.styles.margin} onChange={val => handleStyleChange('margin', val)} />
      <SpacingControl label="PADDING (Inner Space)" value={selectedBlock.styles.padding} onChange={val => handleStyleChange('padding', val)} />
    </PanelAccordion>

    <PanelAccordion title="Typography" icon={Type} defaultOpen={false}>
      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Text style</label>
      <select style={{ ...inputStyle, marginBottom: 6 }} value={selectedBlock.styles.textPreset || ''} onChange={e => handleStyleChange('textPreset', e.target.value)} aria-label="Text style">
        <option value="">Default</option>
        {TYPE_PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {selectedBlock.styles.textPreset && (
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#94a3b8', lineHeight: 1.45 }}>Font, size, weight and line height come from Global Options › Text styles. Values set below win.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Font Size (↑/↓)</label>
          <input type="text" value={selectedBlock.styles.fontSize || ''} onChange={e => handleStyleChange('fontSize', e.target.value)} onKeyDown={e => handleNumericKey(e, selectedBlock.styles.fontSize, val => handleStyleChange('fontSize', val))} style={inputStyle} placeholder="e.g. 16px" />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Line Height (↑/↓)</label>
          <input type="text" value={selectedBlock.styles.lineHeight || ''} onChange={e => handleStyleChange('lineHeight', e.target.value)} onKeyDown={e => handleNumericKey(e, selectedBlock.styles.lineHeight, val => handleStyleChange('lineHeight', val))} style={inputStyle} placeholder="e.g. 1.5" />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Font Weight</label>
          <select style={{...inputStyle, marginBottom:0}} value={selectedBlock.styles.fontWeight || ''} onChange={e => handleStyleChange('fontWeight', e.target.value)}>
            <option value="">Default</option>
            <option value="300">Light (300)</option>
            <option value="400">Normal (400)</option>
            <option value="600">Semi Bold (600)</option>
            <option value="700">Bold (700)</option>
            <option value="900">Black (900)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Text Transform</label>
          <select style={{...inputStyle, marginBottom:0}} value={selectedBlock.styles.textTransform || ''} onChange={e => handleStyleChange('textTransform', e.target.value)}>
            <option value="">Default</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </div>
      </div>
      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Text Color</label>
      <div style={{ marginBottom: '10px' }}>
        <ColorInput label="text color" value={selectedBlock.styles.color} onChange={v => handleStyleChange('color', v)} placeholder="Inherited" allowTransparent={false} />
      </div>
      <label style={{ fontSize: '10px', color: '#94a3b8' }}>Letter Spacing (↑/↓)</label>
      <input type="text" value={selectedBlock.styles.letterSpacing || ''} onChange={e => handleStyleChange('letterSpacing', e.target.value)} onKeyDown={e => handleNumericKey(e, selectedBlock.styles.letterSpacing, val => handleStyleChange('letterSpacing', val))} style={{...inputStyle, marginBottom:0}} placeholder="e.g. 1px" />
    </PanelAccordion>

    <PanelAccordion title="Background & Alignment" icon={Palette} defaultOpen={false}>
      <label style={labelStyle}>Background Color</label>
      <div style={{ marginBottom: '15px' }}>
        <ColorInput label="background color" value={selectedBlock.styles.backgroundColor} onChange={v => handleStyleChange('backgroundColor', v)} />
      </div>
      <label style={labelStyle}>Text Alignment</label>
      <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
        {['left', 'center', 'right'].map(align => (
          <button key={align} onClick={() => handleStyleChange('textAlign', align)} style={{ flex: 1, padding: '8px', background: selectedBlock.styles.textAlign === align ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', color: '#f8fafc' }}>
            {align === 'left' ? <AlignLeft size={14}/> : align === 'center' ? <AlignCenter size={14}/> : <AlignRight size={14}/>}
          </button>
        ))}
      </div>
    </PanelAccordion>

    <PanelAccordion title="Borders & Shadows" icon={BoxSelect} defaultOpen={false}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Thickness (↑/↓)</label>
          <input type="text" value={selectedBlock.styles.borderWidth || '0px'} onChange={e => setBorder('borderWidth', e.target.value)} onKeyDown={e => handleNumericKey(e, selectedBlock.styles.borderWidth, val => setBorder('borderWidth', val))} style={inputStyle} placeholder="e.g. 2px" />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Style</label>
          <select style={inputStyle} value={selectedBlock.styles.borderStyle || 'solid'} onChange={e => handleStyleChange('borderStyle', e.target.value)}>
            <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
          </select>
        </div>
      </div>
      <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Color</label>
      <div style={{ marginBottom: '15px' }}>
        <ColorInput label="border color" value={selectedBlock.styles.borderColor} onChange={v => setBorder('borderColor', v)} placeholder="#000000" />
      </div>
      <label style={labelStyle}>Border Radius (↑/↓ to adjust)</label>
      <input type="text" placeholder="e.g. 10px, 50%" value={selectedBlock.styles.borderRadius || '0px'} onChange={e => handleStyleChange('borderRadius', e.target.value)} onKeyDown={e => handleNumericKey(e, selectedBlock.styles.borderRadius, val => handleStyleChange('borderRadius', val))} style={inputStyle} />
    </PanelAccordion>
  </div>
  );
}
