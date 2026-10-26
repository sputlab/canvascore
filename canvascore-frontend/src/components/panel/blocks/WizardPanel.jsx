import React from 'react';
import { Sliders, ListChecks, Mail } from 'lucide-react';
import { PanelAccordion, ItemCard, TxtF, SelF, ChkF, ColorF } from '../fields';
import { labelStyle, inputStyle, lstAddBtn } from '../helpers';
import { __ } from '../../../i18n/index.js';

// Same list as the renderers accept (WIZARD_TYPES / CC_WIZARD_TYPES)
const FIELD_TYPES = [['text', __("Short text")], ['email', __("Email")], ['tel', __("Phone")], ['number', __("Number")], ['url', __("Website address")], ['date', __("Date")], ['textarea', __("Long text")],
  ['select', __("Drop-down list")], ['radio', __("Choose one (buttons)")], ['checkboxes', __("Choose several (boxes)")], ['consent', __("Agreement (one box)")]];
const HAS_OPTIONS = ['select', 'radio', 'checkboxes'];

// Content panel: WIZARD
export default function WizardPanel({ ctx }) {
  const { c, set, lstOf, lstPatch, lstRemove, lstAdd, lstMove, userRole } = ctx;
  const steps = lstOf('steps');
  const fieldsOf = (st) => (Array.isArray(st.fields) ? st.fields : []);
  const setFields = (si, fields) => lstPatch('steps', si, { fields });
  const patchField = (si, fi, p) => setFields(si, fieldsOf(steps[si]).map((f, i) => (i === fi ? { ...f, ...p } : f)));
  const moveField = (si, fi, d) => {
    const list = [...fieldsOf(steps[si])]; const j = fi + d;
    if (j < 0 || j >= list.length) return;
    [list[fi], list[j]] = [list[j], list[fi]]; setFields(si, list);
  };
  return (
    <>
      <PanelAccordion title={__("Form Settings")} icon={Mail} defaultOpen={true}>
        <TxtF label={__("Title (empty = none)")} value={c.title} onChange={v => set('title', v)} />
        <TxtF label={__("Introduction (empty = none)")} value={c.intro} onChange={v => set('intro', v)} multiline rows={2} />
        {userRole === 'admin' && <>
          <label style={labelStyle}>{__("Receiving Email")}</label>
          <input type="email" style={inputStyle} value={c.email || ''} onChange={e => set('email', e.target.value)} placeholder={__("Leave blank for Global Email")} />
        </>}
        <TxtF label={__("Message after sending")} value={c.successMsg} onChange={v => set('successMsg', v)} placeholder={__("Thank you! We will be in touch.")} />
        <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0' }}>{__("Answers are saved with the other form messages (Submissions) and emailed like any form. Without JavaScript the steps show as one long form.")}</p>
      </PanelAccordion>

      <PanelAccordion title={__("Steps and Fields")} icon={ListChecks} defaultOpen={true}>
        {steps.map((st, si) => (
          <ItemCard key={si} title={st.title || __("Step {0}", si + 1)} index={si} total={steps.length} onMove={(d) => lstMove('steps', si, d)} onRemove={() => lstRemove('steps', si)}>
            <TxtF label={__("Step title")} value={st.title} onChange={v => lstPatch('steps', si, { title: v })} />
            <TxtF label={__("Short text under the title")} value={st.description} onChange={v => lstPatch('steps', si, { description: v })} />
            {fieldsOf(st).map((f, fi) => (
              <ItemCard key={fi} title={__("Field {0}", fi + 1)} index={fi} total={fieldsOf(st).length} onMove={(d) => moveField(si, fi, d)} onRemove={() => setFields(si, fieldsOf(st).filter((_, i) => i !== fi))}>
                <TxtF label={f.type === 'consent' ? __("Agreement text") : __("Label")} value={f.label} onChange={v => patchField(si, fi, { label: v })} />
                <SelF label={__("Type")} value={f.type || 'text'} onChange={v => patchField(si, fi, { type: v })} options={FIELD_TYPES} />
                {HAS_OPTIONS.includes(f.type) && <TxtF label={__("Choices (one per line)")} value={f.options} onChange={v => patchField(si, fi, { options: v })} multiline rows={4} />}
                {f.type === 'select' && <TxtF label={__("Text before a choice is made")} value={f.placeholder} onChange={v => patchField(si, fi, { placeholder: v })} placeholder={__("Choose an option")} />}
                <ChkF label={__("Required")} checked={f.required === true} onChange={v => patchField(si, fi, { required: v })} />
              </ItemCard>
            ))}
            {fieldsOf(st).length < 12 && <button onClick={() => setFields(si, [...fieldsOf(st), { label: __("New field"), type: 'text', required: false, options: '', placeholder: '' }])} style={lstAddBtn}>{__("+ Add field")}</button>}
          </ItemCard>
        ))}
        {steps.length < 8 && <button onClick={() => lstAdd('steps', { title: __("New step"), description: '', fields: [] })} style={lstAddBtn}>{__("+ Add step")}</button>}
        <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' }}>{__("Up to 8 steps, 12 fields each and 40 fields in all. A required field must be filled in before the visitor can go on.")}</p>
      </PanelAccordion>

      <PanelAccordion title={__("Form Style")} icon={Sliders} defaultOpen={false}>
        <SelF label={__("Progress")} value={c.progress === 'steps' ? 'steps' : 'bar'} onChange={v => set('progress', v)} options={[['bar', __("Bar with \"Step 2 of 3\"")], ['steps', __("Numbered steps")]]} />
        <TxtF label={__("Step text ({n} and {total} are replaced)")} value={c.stepLabel} onChange={v => set('stepLabel', v)} placeholder={__("Step {n} of {total}")} />
        <TxtF label={__("Next button")} value={c.nextText} onChange={v => set('nextText', v)} placeholder={__("Next")} />
        <TxtF label={__("Back button")} value={c.backText} onChange={v => set('backText', v)} placeholder={__("Back")} />
        <TxtF label={__("Send button")} value={c.btnText} onChange={v => set('btnText', v)} placeholder={__("Send")} />
        <SelF label={__("Style")} value={c.layout === 'plain' ? 'plain' : 'card'} onChange={v => set('layout', v)} options={[['card', __("Card")], ['plain', __("Plain")]]} />
        <ColorF label={__("Accent color (empty = brand color)")} value={c.accent} onChange={v => set('accent', v)} />
      </PanelAccordion>
    </>
  );
}
