import React from 'react';
import { Sliders, MailPlus } from 'lucide-react';
import { PanelAccordion, TxtF, SelF, ChkF, ColorF } from '../fields';
import { labelStyle, inputStyle } from '../helpers';
import { __ } from '../../../i18n/index.js';

// Content panel: NEWSLETTER
export default function NewsletterPanel({ ctx }) {
  const { c, set, userRole } = ctx;
  return (
    <>
      <PanelAccordion title={__("Newsletter Signup")} icon={MailPlus} defaultOpen={true}>
        <TxtF label={__("Title (empty = none)")} value={c.title} onChange={v => set('title', v)} />
        <TxtF label={__("Text (empty = none)")} value={c.text} onChange={v => set('text', v)} multiline rows={2} />
        <TxtF label={__("Button text")} value={c.buttonText} onChange={v => set('buttonText', v)} placeholder={__("Subscribe")} />
        <TxtF label={__("Message after signing up")} value={c.successMsg} onChange={v => set('successMsg', v)} placeholder={__("Thank you for subscribing!")} />
        {userRole === 'admin' && <>
          <label style={labelStyle}>{__("Receiving Email")}</label>
          <input type="email" style={inputStyle} value={c.email || ''} onChange={e => set('email', e.target.value)} placeholder={__("Leave blank for Global Email")} />
        </>}
        <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' }}>{__("Sign-ups are saved with the other form messages (Submissions) and emailed like any form. They are not sent to a mailing service: export them from Submissions.")}</p>
      </PanelAccordion>
      <PanelAccordion title={__("Fields")} icon={Sliders} defaultOpen={false}>
        <TxtF label={__("Email field name (shown in Submissions)")} value={c.emailLabel} onChange={v => set('emailLabel', v)} placeholder={__("Email")} />
        <TxtF label={__("Email field hint (empty = the name)")} value={c.placeholder} onChange={v => set('placeholder', v)} placeholder={__("Your email address")} />
        <ChkF label={__("Ask for a name too")} checked={c.askName === true} onChange={v => set('askName', v)} />
        {c.askName === true && <>
          <TxtF label={__("Name field name")} value={c.nameLabel} onChange={v => set('nameLabel', v)} placeholder={__("Name")} />
          <TxtF label={__("Name field hint (empty = the name)")} value={c.namePlaceholder} onChange={v => set('namePlaceholder', v)} />
        </>}
        <TxtF label={__("Agreement text (empty = no checkbox)")} value={c.consentText} onChange={v => set('consentText', v)} multiline rows={2} placeholder={__("I agree to receive emails…")} />
      </PanelAccordion>
      <PanelAccordion title={__("Newsletter Style")} icon={Sliders} defaultOpen={false}>
        <SelF label={__("Fields")} value={c.formLayout === 'stacked' ? 'stacked' : 'inline'} onChange={v => set('formLayout', v)} options={[['inline', __("In one row")], ['stacked', __("One below the other")]]} />
        <SelF label={__("Style")} value={c.layout === 'plain' ? 'plain' : 'card'} onChange={v => set('layout', v)} options={[['card', __("Card")], ['plain', __("Plain")]]} />
        <ColorF label={__("Accent color (empty = brand color)")} value={c.accent} onChange={v => set('accent', v)} />
      </PanelAccordion>
    </>
  );
}
