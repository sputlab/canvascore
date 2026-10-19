// Content-tab panel of each block type (the Style and Advanced tabs are shared by all blocks).
import AccordionTabsPanel from './AccordionTabsPanel';
import BeforeAfterPanel from './BeforeAfterPanel';
import BusinessPanel from './BusinessPanel';
import ButtonPanel from './ButtonPanel';
import CalloutPanel from './CalloutPanel';
import CollectionListPanel from './CollectionListPanel';
import CountdownPanel from './CountdownPanel';
import CountersPanel from './CountersPanel';
import CssGridPanel from './CssGridPanel';
import DividerPanel from './DividerPanel';
import FaqPanel from './FaqPanel';
import FormPanel from './FormPanel';
import GalleryPanel from './GalleryPanel';
import GridCardsPanel from './GridCardsPanel';
import FlexRowPanel from './FlexRowPanel';
import SearchPanel from './SearchPanel';
import HeroPanel from './HeroPanel';
import HtmlPanel from './HtmlPanel';
import IconBoxPanel from './IconBoxPanel';
import ImagePanel from './ImagePanel';
import LogosPanel from './LogosPanel';
import MapsPanel from './MapsPanel';
import PricingPanel from './PricingPanel';
import ProgressPanel from './ProgressPanel';
import SliderPanel from './SliderPanel';
import StepsPanel from './StepsPanel';
import TablePanel from './TablePanel';
import TeamPanel from './TeamPanel';
import TestimonialPanel from './TestimonialPanel';
import TextPanel from './TextPanel';
import TimelinePanel from './TimelinePanel';
import VideoPanel from './VideoPanel';
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

export const CONTENT_PANELS = {
  ACCORDION: AccordionTabsPanel,
  BEFORE_AFTER: BeforeAfterPanel,
  BUSINESS: BusinessPanel,
  BUTTON: ButtonPanel,
  CALLOUT: CalloutPanel,
  CARDS: GridCardsPanel,
  FLEX_ROW: FlexRowPanel,
  SEARCH: SearchPanel,
  ITEM_FIELD: ItemFieldPanel,
  RELATED: RelatedPanel,
  COLLECTION_LIST: CollectionListPanel,
  COUNTDOWN: CountdownPanel,
  COUNTERS: CountersPanel,
  CSS_GRID: CssGridPanel,
  DIVIDER: DividerPanel,
  FAQ: FaqPanel,
  FORM: FormPanel,
  GALLERY: GalleryPanel,
  GRID: GridCardsPanel,
  HERO: HeroPanel,
  HTML: HtmlPanel,
  ICON_BOX: IconBoxPanel,
  IMAGE: ImagePanel,
  IMAGE_TEXT: TextPanel,
  LOGOS: LogosPanel,
  MAPS: MapsPanel,
  PRICING: PricingPanel,
  PROGRESS: ProgressPanel,
  SLIDER: SliderPanel,
  STEPS: StepsPanel,
  TABLE: TablePanel,
  TABS: AccordionTabsPanel,
  TEAM: TeamPanel,
  TESTIMONIAL: TestimonialPanel,
  TEXT: TextPanel,
  TIMELINE: TimelinePanel,
  VIDEO: VideoPanel,
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
