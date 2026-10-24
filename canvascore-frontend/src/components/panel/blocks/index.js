// Content-tab panel of each block type (the Style and Advanced tabs are shared by all blocks). A block with a shared
// definition that has a "panel" gets a panel generated from its settings (SchemaPanel); the others have their own here.
import React from 'react';
import { BLOCK_DEFS } from '../../../render/blockDef.mjs';
import SchemaPanel from '../SchemaPanel';
import AccordionTabsPanel from './AccordionTabsPanel';
import BeforeAfterPanel from './BeforeAfterPanel';
import BusinessPanel from './BusinessPanel';
import ButtonPanel from './ButtonPanel';
import CollectionListPanel from './CollectionListPanel';
import CountdownPanel from './CountdownPanel';
import CssGridPanel from './CssGridPanel';
import FormPanel from './FormPanel';
import GalleryPanel from './GalleryPanel';
import GridCardsPanel from './GridCardsPanel';
import FlexRowPanel from './FlexRowPanel';
import SearchPanel from './SearchPanel';
import HeroPanel from './HeroPanel';
import LogosPanel from './LogosPanel';
import PricingPanel from './PricingPanel';
import SliderPanel from './SliderPanel';
import TablePanel from './TablePanel';
import TeamPanel from './TeamPanel';
import TextPanel from './TextPanel';
import BentoPanel from './BentoPanel';
import SplitCtaPanel from './SplitCtaPanel';
import CaseStudyPanel from './CaseStudyPanel';
import AuthorBioPanel from './AuthorBioPanel';
import ReviewSummaryPanel from './ReviewSummaryPanel';
import TestimonialWallPanel from './TestimonialWallPanel';
import HoverGridPanel from './HoverGridPanel';
import ScrollytellingPanel from './ScrollytellingPanel';
import HotspotsPanel from './HotspotsPanel';
import TableOfContentsPanel from './TableOfContentsPanel';
import ShareBarPanel from './ShareBarPanel';
import CodeSnippetPanel from './CodeSnippetPanel';
import PriceCalculatorPanel from './PriceCalculatorPanel';
import WizardPanel from './WizardPanel';
import VideoHeroPanel from './VideoHeroPanel';
import AudioPlayerPanel from './AudioPlayerPanel';
import AnnouncementBarPanel from './AnnouncementBarPanel';
import NewsletterPanel from './NewsletterPanel';
import ItemFieldPanel from './ItemFieldPanel';
import RelatedPanel from './RelatedPanel';
import ItemTermsPanel from './ItemTermsPanel';

export const CONTENT_PANELS = {
  ACCORDION: AccordionTabsPanel,
  BEFORE_AFTER: BeforeAfterPanel,
  BUSINESS: BusinessPanel,
  BUTTON: ButtonPanel,
  CARDS: GridCardsPanel,
  FLEX_ROW: FlexRowPanel,
  SEARCH: SearchPanel,
  ITEM_FIELD: ItemFieldPanel,
  RELATED: RelatedPanel,
  ITEM_TERMS: ItemTermsPanel,
  COLLECTION_LIST: CollectionListPanel,
  COUNTDOWN: CountdownPanel,
  CSS_GRID: CssGridPanel,
  FORM: FormPanel,
  GALLERY: GalleryPanel,
  GRID: GridCardsPanel,
  HERO: HeroPanel,
  IMAGE_TEXT: TextPanel,
  LOGOS: LogosPanel,
  PRICING: PricingPanel,
  SLIDER: SliderPanel,
  TABLE: TablePanel,
  TABS: AccordionTabsPanel,
  TEAM: TeamPanel,
  TEXT: TextPanel,
  BENTO: BentoPanel,
  SPLIT_CTA: SplitCtaPanel,
  CASE_STUDY: CaseStudyPanel,
  AUTHOR_BIO: AuthorBioPanel,
  REVIEW_SUMMARY: ReviewSummaryPanel,
  TESTIMONIAL_WALL: TestimonialWallPanel,
  HOVER_GRID: HoverGridPanel,
  SCROLLYTELLING: ScrollytellingPanel,
  HOTSPOTS: HotspotsPanel,
  TABLE_OF_CONTENTS: TableOfContentsPanel,
  SHARE_BAR: ShareBarPanel,
  CODE_SNIPPET: CodeSnippetPanel,
  PRICE_CALCULATOR: PriceCalculatorPanel,
  WIZARD: WizardPanel,
  VIDEO_HERO: VideoHeroPanel,
  AUDIO_PLAYER: AudioPlayerPanel,
  ANNOUNCEMENT_BAR: AnnouncementBarPanel,
  NEWSLETTER: NewsletterPanel,
};

for (const def of BLOCK_DEFS) {
  if (!def.panel || CONTENT_PANELS[def.type]) continue;
  const Generated = ({ ctx }) => React.createElement(SchemaPanel, { def, ctx });
  Generated.displayName = `SchemaPanel(${def.type})`;
  CONTENT_PANELS[def.type] = Generated;
}
