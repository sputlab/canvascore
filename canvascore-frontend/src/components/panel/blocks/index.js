// Content-tab panel of each block type (the Style and Advanced tabs are shared by all blocks). A block with a shared
// definition that has a "panel" gets a panel generated from its settings (SchemaPanel); the others have their own here.
import React from 'react';
import { BLOCK_DEFS } from '../../../render/blockDef.mjs';
import SchemaPanel from '../SchemaPanel';
import CollectionListPanel from './CollectionListPanel';
import CssGridPanel from './CssGridPanel';
import FormPanel from './FormPanel';
import FlexRowPanel from './FlexRowPanel';
import PriceCalculatorPanel from './PriceCalculatorPanel';
import WizardPanel from './WizardPanel';
import AnnouncementBarPanel from './AnnouncementBarPanel';
import NewsletterPanel from './NewsletterPanel';
import ItemFieldPanel from './ItemFieldPanel';
import RelatedPanel from './RelatedPanel';
import ItemTermsPanel from './ItemTermsPanel';

export const CONTENT_PANELS = {
  FLEX_ROW: FlexRowPanel,
  ITEM_FIELD: ItemFieldPanel,
  RELATED: RelatedPanel,
  ITEM_TERMS: ItemTermsPanel,
  COLLECTION_LIST: CollectionListPanel,
  CSS_GRID: CssGridPanel,
  FORM: FormPanel,
  PRICE_CALCULATOR: PriceCalculatorPanel,
  WIZARD: WizardPanel,
  ANNOUNCEMENT_BAR: AnnouncementBarPanel,
  NEWSLETTER: NewsletterPanel,
};

for (const def of BLOCK_DEFS) {
  if (!def.panel || CONTENT_PANELS[def.type]) continue;
  const Generated = ({ ctx }) => React.createElement(SchemaPanel, { def, ctx });
  Generated.displayName = `SchemaPanel(${def.type})`;
  CONTENT_PANELS[def.type] = Generated;
}
