// Global Options › Buttons & fields: the site's button presets (Primary, Secondary, Outline) and the style of its form
// fields. A button that picks a preset follows it when it changes here; the form inputs use the field style.
import React from 'react';
import { MousePointerClick } from 'lucide-react';
import { Card, Field } from '../ui/kit';
import { ColorInput } from './panel/fields';
import { normalizeKit, cleanKitValue, BUTTON_PRESETS } from '../render/kit.mjs';
import { __ } from '../i18n/index.js';

const RADIUS_HINT = 'e.g. 6px or 999px';

export default function ButtonsFieldsCard({ settings, set }) {
  const kit = normalizeKit(settings);
  // one value of a button preset or of the field style; '' removes it (the built-in look comes back)
  const putButton = (id, prop, value) => {
    const cur = { ...(kit.buttons[id] || {}) };
    if (value) cur[prop] = value; else delete cur[prop];
    set({ buttonStyles: { ...kit.buttons, [id]: cur } });
  };
  const putField = (prop, value) => {
    const cur = { ...kit.field };
    if (value) cur[prop] = value; else delete cur[prop];
    set({ fieldStyle: cur });
  };
  // A corner radius is typed: it is applied when the field loses focus, and only a valid length is kept
  const radiusInput = (label, value, onCommit) => (
    <input className="ui-input" aria-label={label} defaultValue={value || ''} key={`${label}-${value || ''}`} placeholder={__("Built-in")} style={{ minWidth: 0 }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== '' && cleanKitValue('radius', v) !== v) { e.target.value = value || ''; return; }   // not a length: keep the saved one
        if (v !== (value || '')) onCommit(v);
      }} />
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 };
  return (
    <Card title={__("Buttons & fields")} icon={MousePointerClick} description={__("Button presets: blocks that pick one (the Button block and the buttons of a Hero) use these colours and corners. Form fields use the field style. Colours can be global colours.")}>
      {BUTTON_PRESETS.map(([id, label]) => {
        const v = kit.buttons[id] || {};
        return (
          <div key={id} className="cc-button-preset" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>{label} {__("button")}</div>
            <div style={grid}>
              <Field label={__("Background")}><ColorInput label={__("{0} button background", label)} value={v.bg || ''} allowTransparent onChange={(c) => putButton(id, 'bg', c)} placeholder={__("Built-in")} /></Field>
              <Field label={__("Text")}><ColorInput label={__("{0} button text", label)} value={v.text || ''} allowTransparent={false} allowClear onChange={(c) => putButton(id, 'text', c)} placeholder={__("Built-in")} /></Field>
              <Field label={__("Border (empty = none)")}><ColorInput label={__("{0} button border", label)} value={v.border || ''} allowTransparent={false} onChange={(c) => putButton(id, 'border', c)} placeholder={__("No border")} /></Field>
              <Field label={__("Corner radius")}>{radiusInput(`${label} button corner radius`, v.radius, (r) => putButton(id, 'radius', r))}</Field>
            </div>
          </div>
        );
      })}
      <div className="cc-field-style" style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>{__("Form fields")}</div>
        <div style={grid}>
          <Field label={__("Background")}><ColorInput label={__("Form field background")} value={kit.field.bg || ''} allowTransparent={false} onChange={(c) => putField('bg', c)} placeholder={__("White")} /></Field>
          <Field label={__("Border")}><ColorInput label={__("Form field border")} value={kit.field.border || ''} allowTransparent={false} onChange={(c) => putField('border', c)} placeholder={__("Light grey")} /></Field>
          <Field label={__("Corner radius")}>{radiusInput(__("Form field corner radius"), kit.field.radius, (r) => putField('radius', r))}</Field>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748b' }}>{__("Form fields: forms, wizards, newsletter sign-ups and site search. Radius:")} {RADIUS_HINT}.</p>
      </div>
    </Card>
  );
}
