import React from 'react';
import { Layout, Mail } from 'lucide-react';
import { PanelAccordion, ItemCard, TxtF, SelF, ChkF } from '../fields';
import { labelStyle, inputStyle, lstAddBtn } from '../helpers';
import { RichTextField } from '../../../editor/RichText';
import { __ } from '../../../i18n/index.js';

const DEFAULT_FIELDS = [{ label: __("Name"), type: 'text', required: true }, { label: __("Email"), type: 'email', required: true }, { label: __("Message"), type: 'textarea', required: true }];

// Same list as the renderers accept (FORM_TYPES / CC_FORM_TYPES)
const FIELD_TYPES = [['text', __("Short text")], ['email', __("Email")], ['tel', __("Phone")], ['number', __("Number")], ['url', __("Website address")], ['date', __("Date")], ['textarea', __("Long text")]];

// Content panel: FORM
export default function FormPanel({ ctx }) {
  const { selectedBlock, handleContentChange, userRole } = ctx;
  // Same defaults as the renderer, so an older form without "fields" shows (and edits) what the site shows
  const formFields = Array.isArray(selectedBlock.content.fields) ? selectedBlock.content.fields : DEFAULT_FIELDS;
  const patchField = (idx, p) => handleContentChange('fields', formFields.map((f, i) => (i === idx ? { ...f, ...p } : f)));
  const moveField = (idx, d) => {
    const j = idx + d; if (j < 0 || j >= formFields.length) return;
    const next = [...formFields]; [next[idx], next[j]] = [next[j], next[idx]]; handleContentChange('fields', next);
  };
  return (
    <>
      <PanelAccordion title={__("Form Settings")} icon={Mail} defaultOpen={true}>
        <label style={labelStyle}>{__("Form Title")}</label>
        <RichTextField label={__("Form title")} variant="basic" value={selectedBlock.content.title ?? '<h3>Contact Us</h3>'} onChange={(val) => handleContentChange('title', val)} />
        {userRole === 'admin' && <>
          <label style={labelStyle}>{__("Receiving Email")}</label>
          <input type="email" style={inputStyle} value={selectedBlock.content.email || ''} onChange={e => handleContentChange('email', e.target.value)} placeholder={__("Leave blank for Global Email")} />
        </>}
        <label style={labelStyle}>{__("Submit Button Text")}</label>
        <input type="text" style={inputStyle} value={selectedBlock.content.btnText ?? ''} placeholder={__("Send Message")} onChange={e => handleContentChange('btnText', e.target.value)} />
        <label style={labelStyle}>{__("Message after sending")}</label>
        <input type="text" style={inputStyle} value={selectedBlock.content.successMsg ?? ''} placeholder={__("Sent!")} onChange={e => handleContentChange('successMsg', e.target.value)} />
        <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0' }}>{__("Shown to the visitor once the message has been sent.")}</p>
      </PanelAccordion>

      <PanelAccordion title={__("Form Fields")} icon={Layout} defaultOpen={false}>
        {formFields.map((field, idx) => (
          <ItemCard key={idx} title={__("Field {0}", idx + 1)} index={idx} total={formFields.length} onMove={(d) => moveField(idx, d)}
            onRemove={() => handleContentChange('fields', formFields.filter((_, i) => i !== idx))}>
            <TxtF label={__("Label")} value={field.label} onChange={v => patchField(idx, { label: v })} placeholder={__("e.g. Name")} />
            <SelF label={__("Type")} value={field.type || 'text'} onChange={v => patchField(idx, { type: v })} options={FIELD_TYPES} />
            <ChkF label={__("Required field")} checked={field.required} onChange={v => patchField(idx, { required: v })} />
          </ItemCard>
        ))}
        <button onClick={() => handleContentChange('fields', [...formFields, { label: __("New Field"), type: 'text', required: false }])} style={lstAddBtn}>{__("+ Add Field")}</button>
      </PanelAccordion>
    </>
  );
}
