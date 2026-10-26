import React from 'react';
import { Tags } from 'lucide-react';
import { PanelAccordion, SelF, TxtF } from '../fields';
import { __ } from '../../../i18n/index.js';

// Content panel: ITEM_TERMS (the categories and tags of the item being published)
export default function ItemTermsPanel({ ctx }) {
  const { c, set, itemTaxonomies } = ctx;
  const taxes = itemTaxonomies || [];
  return (
    <PanelAccordion title={__("Categories & tags")} icon={Tags} defaultOpen={true}>
      <SelF label={__("Show")} value={c.taxonomy || ''} onChange={(v) => set('taxonomy', v)}
        options={[['', __("All of them (named by taxonomy)")], ...taxes.map((t) => [t.id, t.name])]} />
      <TxtF label={__("Between the terms")} value={c.separator ?? ' · '} onChange={(v) => set('separator', v)} placeholder=" · " />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        {__("The terms the item has, as links to their listing pages. Choose the terms in the item's settings (Categories & tags). Shown on item pages only; the editor shows a placeholder.")}
      </p>
    </PanelAccordion>
  );
}
