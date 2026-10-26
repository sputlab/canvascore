// One place for how blocks are presented in the editor: name, icon, category and search keywords.
// Used by the Add panel (grouped + search), the property panel header, the navigator and templates.
import {
  LayoutTemplate, LayoutGrid, Grid, Columns3, Type, Image as ImageIcon, SquareChartGantt, SeparatorHorizontal,
  MonitorPlay, Code, PanelLeft, Star, MessageSquareQuote, Info, Mail, Rows3, PanelTop, HelpCircle, Images,
  GalleryHorizontal, GitCompare, Timer, ListOrdered, Hash, BarChart3, Table2, History, CreditCard, Users,
  Building2, Store, MapPin, Library, Crown, Square, Search, LayoutDashboard, Columns2, TrendingUp, CircleUserRound,
  StarHalf, MessagesSquare, SquareMousePointer, ScrollText, MapPinned, TableOfContents, Share2, Code2,
  Calculator, ListChecks, Film, Headphones, Megaphone, MailPlus, Braces, Link2, Tags, Languages,
  Package, Quote, Heart, Bell, Camera, Gift, Rocket, Sparkles, Zap, Globe, Layers, Palette, Award, Bookmark, Calendar, Clock,
  Coffee, Flag, Lightbulb, MessageCircle, Music, Newspaper, Phone, Shield, ShoppingBag, Smile, ThumbsUp, Trophy, Video,
} from 'lucide-react';
import { __ } from '../i18n/index.js';

export const CATEGORIES = [
  { id: 'layout', label: __("Layout"), hint: __("Containers that hold other blocks") },
  { id: 'basic', label: __("Basic"), hint: __("Text, images, buttons") },
  { id: 'sections', label: __("Sections"), hint: __("Ready-made page sections") },
  { id: 'interactive', label: __("Interactive"), hint: __("Things visitors click or watch") },
  { id: 'data', label: __("Lists & data"), hint: __("Steps, numbers, tables, people") },
  { id: 'business', label: __("Business & dynamic"), hint: __("Contacts, maps, collections") },
  { id: 'packages', label: __("Block packages"), hint: __("Blocks from installed packages") },
];

export const BLOCKS = [
  { type: 'SECTION', label: __("Section"), icon: LayoutTemplate, category: 'layout', color: '#38bdf8', keywords: 'wrapper band background full width' },
  { type: 'CONTAINER', label: __("Container"), icon: LayoutGrid, category: 'layout', color: '#f472b6', keywords: 'box wrapper div group' },
  { type: 'FLEX_ROW', label: __("Flex Row"), icon: Columns3, category: 'layout', color: '#a78bfa', keywords: 'row columns side by side flexbox' },
  { type: 'CSS_GRID', label: __("CSS Grid"), icon: Grid, category: 'layout', color: '#a78bfa', keywords: 'grid columns layout' },
  { type: 'GRID', label: __("Simple Grid"), icon: LayoutGrid, category: 'layout', color: '#94a3b8', keywords: 'columns html' },

  { type: 'TEXT', label: __("Text"), icon: Type, category: 'basic', color: '#38bdf8', keywords: 'paragraph heading rich text title' },
  { type: 'IMAGE', label: __("Image"), icon: ImageIcon, category: 'basic', color: '#a78bfa', keywords: 'picture photo' },
  { type: 'BUTTON', label: __("Button"), icon: SquareChartGantt, category: 'basic', color: '#f472b6', keywords: 'link cta call to action' },
  { type: 'DIVIDER', label: __("Divider"), icon: SeparatorHorizontal, category: 'basic', color: '#f59e0b', keywords: 'separator line wave spacer' },
  { type: 'CODE_SNIPPET', label: __("Code Snippet"), icon: Code2, category: 'basic', color: '#f59e0b', keywords: 'code highlight syntax copy programming' },
  { type: 'AUDIO_PLAYER', label: __("Audio Player"), icon: Headphones, category: 'basic', color: '#ef4444', keywords: 'audio podcast music mp3 sound player episode' },
  { type: 'VIDEO', label: __("Video"), icon: MonitorPlay, category: 'basic', color: '#ef4444', keywords: 'youtube vimeo embed' },
  { type: 'HTML', label: __("Custom HTML"), icon: Code, category: 'basic', color: '#f59e0b', keywords: 'code embed script', admin: true },

  { type: 'HERO', label: __("Hero"), icon: LayoutTemplate, category: 'sections', color: '#fcd34d', keywords: 'header banner intro title' },
  { type: 'IMAGE_TEXT', label: __("Image + Text"), icon: PanelLeft, category: 'sections', color: '#fdba74', keywords: 'media split side' },
  { type: 'CARDS', label: __("Cards"), icon: Columns3, category: 'sections', color: '#86efac', keywords: 'features boxes columns' },
  { type: 'ICON_BOX', label: __("Icon Box"), icon: Star, category: 'sections', color: '#eab308', keywords: 'feature emoji' },
  { type: 'TESTIMONIAL', label: __("Testimonial"), icon: MessageSquareQuote, category: 'sections', color: '#3b82f6', keywords: 'quote review' },
  { type: 'CALLOUT', label: __("Callout"), icon: Info, category: 'sections', color: '#f59e0b', keywords: 'alert notice info warning' },
  { type: 'FORM', label: __("Form"), icon: Mail, category: 'sections', color: '#a855f7', keywords: 'contact email newsletter' },
  { type: 'BENTO', label: __("Bento Grid"), icon: LayoutDashboard, category: 'sections', color: '#86efac', keywords: 'features tiles mosaic grid' },
  { type: 'SPLIT_CTA', label: __("Split CTA"), icon: Columns2, category: 'sections', color: '#fcd34d', keywords: 'call to action two buttons banner' },
  { type: 'CASE_STUDY', label: __("Case Study"), icon: TrendingUp, category: 'sections', color: '#3b82f6', keywords: 'success story result client metric' },
  { type: 'AUTHOR_BIO', label: __("Author Bio"), icon: CircleUserRound, category: 'sections', color: '#a78bfa', keywords: 'writer profile about person' },
  { type: 'VIDEO_HERO', label: __("Video Hero"), icon: Film, category: 'sections', color: '#fcd34d', keywords: 'header banner background video loop intro mp4' },
  { type: 'ANNOUNCEMENT_BAR', label: __("Announcement Bar"), icon: Megaphone, category: 'sections', color: '#f59e0b', keywords: 'notice banner promo offer top sticky dismiss' },
  { type: 'NEWSLETTER', label: __("Newsletter Signup"), icon: MailPlus, category: 'sections', color: '#a855f7', keywords: 'subscribe email list mailing signup form' },
  { type: 'WIZARD', label: __("Multi-step Form"), icon: ListChecks, category: 'sections', color: '#a855f7', keywords: 'form steps wizard quote questionnaire survey progress' },
  { type: 'SCROLLYTELLING', label: __("Scrollytelling"), icon: ScrollText, category: 'sections', color: '#fdba74', keywords: 'story sticky image scroll steps narrative' },
  { type: 'TESTIMONIAL_WALL', label: __("Testimonial Wall"), icon: MessagesSquare, category: 'sections', color: '#3b82f6', keywords: 'reviews quotes masonry customers' },

  { type: 'ACCORDION', label: __("Accordion"), icon: Rows3, category: 'interactive', color: '#10b981', keywords: 'collapse expand faq' },
  { type: 'TABS', label: __("Tabs"), icon: PanelTop, category: 'interactive', color: '#10b981', keywords: 'tabbed panels' },
  { type: 'FAQ', label: __("FAQ"), icon: HelpCircle, category: 'interactive', color: '#10b981', keywords: 'questions answers' },
  { type: 'SLIDER', label: __("Slider"), icon: Images, category: 'interactive', color: '#10b981', keywords: 'carousel slideshow' },
  { type: 'PRICE_CALCULATOR', label: __("Price Calculator"), icon: Calculator, category: 'interactive', color: '#10b981', keywords: 'pricing estimate sliders quote plan cost total' },
  { type: 'HOTSPOTS', label: __("Product Hotspots"), icon: MapPinned, category: 'interactive', color: '#10b981', keywords: 'pins image points annotations tour' },
  { type: 'HOVER_GRID', label: __("Hover Reveal Grid"), icon: SquareMousePointer, category: 'interactive', color: '#10b981', keywords: 'portfolio services image overlay cards' },
  { type: 'GALLERY', label: __("Gallery"), icon: GalleryHorizontal, category: 'interactive', color: '#10b981', keywords: 'images lightbox photos' },
  { type: 'BEFORE_AFTER', label: __("Before / After"), icon: GitCompare, category: 'interactive', color: '#10b981', keywords: 'compare slider' },
  { type: 'COUNTDOWN', label: __("Countdown"), icon: Timer, category: 'interactive', color: '#10b981', keywords: 'timer launch event date' },

  { type: 'STEPS', label: __("Steps"), icon: ListOrdered, category: 'data', color: '#f59e0b', keywords: 'process how it works' },
  { type: 'COUNTERS', label: __("Counters"), icon: Hash, category: 'data', color: '#f59e0b', keywords: 'numbers stats' },
  { type: 'PROGRESS', label: __("Progress Bars"), icon: BarChart3, category: 'data', color: '#f59e0b', keywords: 'skills bars percent' },
  { type: 'TABLE', label: __("Data Table"), icon: Table2, category: 'data', color: '#f59e0b', keywords: 'table rows columns' },
  { type: 'TIMELINE', label: __("Timeline"), icon: History, category: 'data', color: '#f59e0b', keywords: 'history milestones' },
  { type: 'PRICING', label: __("Pricing"), icon: CreditCard, category: 'data', color: '#f59e0b', keywords: 'plans price table' },
  { type: 'PAYMENT_BUTTON', label: __("Payment Button"), icon: CreditCard, category: 'business', color: '#635bff', keywords: 'stripe pay buy checkout donate payment link purchase shop' },
  { type: 'TEAM', label: __("Team"), icon: Users, category: 'data', color: '#f59e0b', keywords: 'people members staff' },
  { type: 'REVIEW_SUMMARY', label: __("Review Summary"), icon: StarHalf, category: 'data', color: '#f59e0b', keywords: 'rating stars score reviews average' },
  { type: 'LOGOS', label: __("Logo Cloud"), icon: Building2, category: 'data', color: '#f59e0b', keywords: 'clients partners brands' },

  { type: 'BUSINESS', label: __("Business Info"), icon: Store, category: 'business', color: '#22d3ee', keywords: 'address hours contact opening' },
  { type: 'MAPS', label: __("Map"), icon: MapPin, category: 'business', color: '#22d3ee', keywords: 'google maps location' },
  { type: 'COLLECTION_LIST', label: __("Collection List"), icon: Library, category: 'business', color: '#22d3ee', keywords: 'blog posts news items dynamic' },
  { type: 'TABLE_OF_CONTENTS', label: __("Table of Contents"), icon: TableOfContents, category: 'business', color: '#22d3ee', keywords: 'toc index headings navigation anchor' },
  { type: 'SHARE_BAR', label: __("Share Bar"), icon: Share2, category: 'business', color: '#22d3ee', keywords: 'social share facebook whatsapp copy link print' },
  { type: 'SEARCH', label: __("Site Search"), icon: Search, category: 'business', color: '#22d3ee', keywords: 'search find query results' },
  { type: 'ITEM_FIELD', label: __("Item Field"), icon: Braces, category: 'business', color: '#a78bfa', keywords: 'field custom data value collection item' },
  { type: 'RELATED', label: __("Related Items"), icon: Link2, category: 'business', color: '#f472b6', keywords: 'related items references team projects backlinks' },
  { type: 'ITEM_TERMS', label: __("Categories & Tags"), icon: Tags, category: 'business', color: '#34d399', keywords: 'categories tags taxonomy terms labels topics' },
  { type: 'LANGUAGE_SWITCHER', label: __("Language Switcher"), icon: Languages, category: 'business', color: '#38bdf8', keywords: 'language translate translation switch multilingual locale flag english italian' },
];

// The icons a block package can name in its catalog entry (anything else gets the package icon)
export const PACKAGE_ICONS = {
  Package, Quote, Heart, Bell, Camera, Gift, Rocket, Sparkles, Zap, Globe, Layers, Palette, Award, Bookmark, Calendar, Clock, Coffee, Flag,
  Lightbulb, MessageCircle, Music, Newspaper, Phone, Shield, ShoppingBag, Smile, ThumbsUp, Trophy, Video, Star, Info, Mail, Search, Users, Store,
  MapPin, Image: ImageIcon, Type, Code, Link2, Tags, Library, Table2, ListChecks, Film, Headphones, Megaphone, TrendingUp, Share2,
};

// Blocks of installed block packages, registered at run time from what the server sends (blockPackages.js); they sit in the
// "Block packages" group and are never replaced by, or replace, a core block.
let PACKAGE_BLOCKS = [];
export function registerPackageCatalog(entries) {
  PACKAGE_BLOCKS = (entries || []).filter((e) => e && typeof e.type === 'string' && !BLOCKS.some((b) => b.type === e.type)).map((e) => ({
    type: e.type, label: String(e.label || e.type).slice(0, 40), icon: PACKAGE_ICONS[e.icon] || Package, category: 'packages',
    color: /^#[0-9a-fA-F]{6}$/.test(e.color || '') ? e.color : '#94a3b8', keywords: String(e.keywords || ''), package: e.package || '',
  }));
}
const allBlocks = () => [...BLOCKS, ...PACKAGE_BLOCKS];

const BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));
BY_TYPE.MASTER = { type: 'MASTER', label: __("Global Master"), icon: Crown, category: 'layout', color: '#fcd34d' };

export const blockInfo = (type) => BY_TYPE[type] || PACKAGE_BLOCKS.find((b) => b.type === type) || { type, label: String(type || __("Block")).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), icon: Square, color: '#94a3b8' };
export const blockLabel = (type) => blockInfo(type).label;
export const CONTAINER_TYPES = ['SECTION', 'CONTAINER', 'FLEX_ROW', 'CSS_GRID'];

// Blocks matching a search (name, type or keywords), for the Add panel
export function searchBlocks(query, { admin = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return allBlocks().filter((b) => (admin || !b.admin) && (!q || `${b.label} ${b.type} ${b.keywords || ''}`.toLowerCase().includes(q)));
}
