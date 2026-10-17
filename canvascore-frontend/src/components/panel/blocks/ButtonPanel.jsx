import React from 'react';
import { SquareChartGantt, Palette, MousePointerClick } from 'lucide-react';
import { PanelAccordion, ColorF, SelF } from '../fields';
import { labelStyle, inputStyle } from '../helpers';
import { BUTTON_EFFECTS } from '../../../render/effects.mjs';
import { BUTTON_PRESETS } from '../../../render/kit.mjs';

// Content panel: BUTTON
export default function ButtonPanel({ ctx }) {
  const { selectedBlock, handleContentChange, handleStyleChange, patchStyles, pages } = ctx;
  const c = selectedBlock.content;
  const st = selectedBlock.styles;
  const hasBorder = parseFloat(st.borderWidth) > 0;
  return (
    <>
    <PanelAccordion title="Button Settings" icon={SquareChartGantt} defaultOpen={true}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '20px', cursor: 'pointer' }}>
        <input type="checkbox" checked={selectedBlock.content.useGlobal ?? true} onChange={e => handleContentChange('useGlobal', e.target.checked)} /> Use Global Style (Brand)
      </label>
      <label style={labelStyle}>Button preset</label>
      <select style={{ ...inputStyle, marginBottom: 4 }} value={c.preset || ''} aria-label="Button preset" onChange={e => handleContentChange('preset', e.target.value)}>
        <option value="">Custom</option>{BUTTON_PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 14px' }}>The preset sets the colours and corners of the site's button style (Global Options › Buttons &amp; fields). Colours set in the Colors section win over it.</p>
      <label style={labelStyle}>Button Size</label>
      <select style={inputStyle} value="" onChange={e => {
        if (e.target.value === 'sm') patchStyles({ padding: '8px 16px', fontSize: '14px' });
        if (e.target.value === 'md') patchStyles({ padding: '12px 24px', fontSize: '16px' });
        if (e.target.value === 'lg') patchStyles({ padding: '18px 36px', fontSize: '20px' });
      }}>
        <option value="">Custom</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>
      </select>
      <label style={labelStyle}>Text</label>
      <input type="text" style={inputStyle} placeholder="Click here" value={selectedBlock.content.text ?? ''} onChange={e => handleContentChange('text', e.target.value)} />
      <label style={labelStyle}>Link</label>
      <select style={{...inputStyle, marginBottom: '8px'}} value={selectedBlock.content.url ?? '#'} onChange={e => handleContentChange('url', e.target.value)}>
        <option value="#">Select internal page...</option>
        {pages.map(p => <option key={p.id} value={p.clean_slug ? p.clean_slug + '/index.html' : 'index.html'}>📄 {p.title}</option>)}
      </select>
      <input type="text" style={inputStyle} placeholder="Custom URL..." value={selectedBlock.content.url ?? ''} onChange={e => handleContentChange('url', e.target.value)} />
    </PanelAccordion>

    <PanelAccordion title="Colors" icon={Palette} defaultOpen={false}>
      <ColorF label={c.useGlobal ?? true ? 'Background (empty = brand color)' : 'Background'} value={st.backgroundColor} onChange={v => handleStyleChange('backgroundColor', v)} placeholder={c.useGlobal ?? true ? 'Brand color' : 'Default'} />
      <ColorF label="Text color" value={st.color} onChange={v => handleStyleChange('color', v)} allowTransparent={false} placeholder={c.useGlobal ?? true ? '#ffffff' : 'Default'} />
      <ColorF label="Border" value={hasBorder ? st.borderColor : ''} allowTransparent={false} placeholder="No border"
        onChange={v => {
          if (!v) patchStyles({ borderColor: '', borderWidth: '' });
          else patchStyles(hasBorder ? { borderColor: v } : { borderColor: v, borderWidth: '2px', borderStyle: 'solid' });
        }} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>Outline button: Background Transparent + a Border and Text color.</p>
    </PanelAccordion>

    <PanelAccordion title="Hover" icon={MousePointerClick} defaultOpen={false}>
      <ColorF label="Background on hover" value={c.btnHoverBg} onChange={v => handleContentChange('btnHoverBg', v)} placeholder="No change" />
      <ColorF label="Text color on hover" value={c.btnHoverColor} onChange={v => handleContentChange('btnHoverColor', v)} allowTransparent={false} placeholder="No change" />
      {hasBorder && <ColorF label="Border on hover" value={c.btnHoverBorder} onChange={v => handleContentChange('btnHoverBorder', v)} allowTransparent={false} placeholder="No change" />}
      <SelF label="Hover effect" value={c.btnEffect || ''} onChange={v => handleContentChange('btnEffect', v)} options={BUTTON_EFFECTS} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>Point at the button in the canvas to try it.</p>
    </PanelAccordion>
    </>
  );
}
