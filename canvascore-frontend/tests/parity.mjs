// tests/parity.mjs
// PARITY check between the canonical JS renderer (src/render/renderBlock.mjs)
// and the PHP compiler (canvascore-admin/compiler.php).
//
// Compares the STRUCTURE and STYLES of the HTML produced by the two renderers, ignoring:
//  - the inner rich-text text/HTML (sanitized differently on the server),
//  - convenience <script>/<style> tags (slider autoplay, media queries) that don't
//    change the box layout.
// Exits with a non-zero code if it finds differences (usable in CI).

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { renderBlock } from '../src/render/renderBlock.mjs';
import { BLOCK_DEFS, blockDef, renderDefBlock } from '../src/render/blockDef.mjs';
import { readdirSync } from 'node:fs';

const phpScript = fileURLToPath(new URL('./render_php.php', import.meta.url));

// --- Fixtures: one representative block per type, with meaningful styles/content ---
const fixtures = [
  { id: 'f1', type: 'SECTION', styles: { padding: '80px 20px', backgroundColor: '#fff', width: '100%', margin: '10px' }, children: [] },
  { id: 'f2', type: 'CONTAINER', styles: { maxWidth: '1200px', margin: '0 auto', width: '100%' }, children: [] },
  { id: 'f3', type: 'FLEX_ROW', styles: { display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%' }, children: [] },
  { id: 'f4', type: 'CSS_GRID', styles: { width: '100%' }, content: { columns: 3, gap: '30px' }, children: [] },
  { id: 'f5', type: 'TEXT', styles: { padding: '10px 0', width: '100%' }, content: { text: '<p>ciao</p>' } },
  { id: 'f6', type: 'IMAGE', styles: { width: '100%' }, content: { src: 'a.jpg', alt: 'x', objectFit: 'cover', aspectRatio: '1 / 1', objectPosition: 'top', scale: 1.2 } },
  { id: 'f7', type: 'BUTTON', styles: { textAlign: 'left', margin: '10px', padding: '30px 60px', borderWidth: '2px', borderColor: '#f00', borderStyle: 'solid' }, content: { text: 'Vai', url: 'chi-siamo', useGlobal: true } },
  { id: 'f7b', type: 'BUTTON', styles: { textAlign: 'right', backgroundColor: '#222', padding: '8px 16px' }, content: { text: 'X', url: '#', useGlobal: false } },
  { id: 'f8', type: 'GRID', styles: { width: '100%' }, content: { columns: 2, items: ['<p>a</p>', '<p>b</p>'] } },
  { id: 'f9', type: 'HERO', styles: { padding: '100px 20px', backgroundColor: '#0f172a', color: '#fff', textAlign: 'center', width: '100%', minHeight: '400px' }, content: { title: '<h1>Hi</h1>', subtitle: '<p>s</p>', bgImage: 'bg.jpg', buttons: [{ text: 'Go', url: 'servizi', bgColor: '#3b82f6', textColor: '#fff', borderRadius: '8px' }] } },
  { id: 'f10', type: 'IMAGE_TEXT', styles: { padding: '60px 0', width: '100%' }, content: { src: 'a.jpg', text: '<h2>t</h2>', layout: 'img-right' } },
  { id: 'f11', type: 'CARDS', styles: { padding: '60px 0', width: '100%' }, content: { items: ['<h3>a</h3>', '<h3>b</h3>'] } },
  { id: 'f12', type: 'VIDEO', styles: { borderRadius: '12px', width: '100%' }, content: { url: 'https://youtu.be/dQw4w9WgXcQ' } },
  { id: 'f13', type: 'ICON_BOX', styles: { padding: '30px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', width: '100%' }, content: { icon: '*', title: 'Feature', description: 'd' } },
  { id: 'f14', type: 'TESTIMONIAL', styles: { padding: '40px', backgroundColor: '#f8fafc', borderRadius: '16px', width: '100%' }, content: { quote: 'q', author: 'a', role: 'r' } },
  { id: 'f15', type: 'SLIDER', styles: { width: '100%' }, content: { effect: 'slide', images: [{ src: 'a.jpg' }, { src: 'b.jpg' }], aspectRatio: '21 / 9', objectFit: 'cover', objectPosition: 'center' } },
  { id: 'f15b', type: 'SLIDER', styles: { width: '100%' }, content: { effect: 'fade', images: [{ src: 'a.jpg' }, { src: 'b.jpg' }] } },
  { id: 'f16', type: 'MAPS', styles: { width: '100%' }, content: { address: 'Roma', zoom: 14 } },
  { id: 'f17', type: 'HTML', styles: { width: '100%' }, content: { code: '<p>raw</p>' } },
  { id: 'f18', type: 'FAQ', styles: { width: '100%' }, content: { items: [{ q: 'Q1?', a: 'A1' }, { q: 'Q2?', a: 'riga1\nriga2' }] } },
  { id: 'f19', type: 'FORM', styles: { padding: '40px', width: '100%' }, content: { title: '<h3>Contatti</h3>', btnText: 'Invia', successMsg: 'Grazie', email: 'a@b.it', customId: 'myform', fields: [{ label: 'Nome', type: 'text', required: true }, { label: 'Msg', type: 'textarea' }] } },
  // ---- effects and button hovers ----
  { id: 'e1', type: 'BUTTON', styles: { backgroundColor: 'transparent', color: '#111', borderWidth: '2px', borderStyle: 'solid', borderColor: '#111', animation: 'bounce-in' }, content: { text: 'Hover', url: '#', useGlobal: false, btnHoverBg: '#111', btnHoverColor: '#fff', btnHoverBorder: '#222', btnEffect: 'shine', animDuration: 'slow', animDelay: '300' } },
  { id: 'e2', type: 'HERO', styles: { textAlign: 'left' }, content: { title: '<h1>T</h1>', subtitle: '', buttons: [
      { text: 'Solid', url: '#', bgColor: '#3b82f6', textColor: '#fff', borderRadius: '8px', hoverBg: '#1d4ed8', effect: 'lift' },
      { text: 'Outline', url: '#', bgColor: 'transparent', textColor: '#fff', borderRadius: '8px', borderColor: '#ffffff', hoverBg: '#ffffff', hoverColor: '#0f172a' },
  ] } },
  { id: 'e3', type: 'TEXT', styles: { animation: 'fade-left' }, content: { text: '<p>x</p>', animDelay: 1000, hoverEffect: 'lift', loopEffect: 'float' } },
  { id: 'e4', type: 'SECTION', styles: { animation: 'nope' }, content: { hoverEffect: 'bad', loopEffect: 'pulse', animDuration: 'fast' }, children: [] },
  { id: 'e5', type: 'BUTTON', styles: {}, content: { text: 'B', url: '#', btnEffect: 'evil" onmouseover="x', btnHoverBg: '"><script>' } },
  { id: 's1', type: 'SEARCH', styles: { maxWidth: '720px', margin: '0 auto' }, content: { placeholder: 'Find', buttonText: 'Go', noResults: 'Nothing for', limit: 5 } },
  { id: 's2', type: 'SEARCH', styles: {}, content: {} },
  // ---- cross tests: containers with blocks inside ----
  { id: 'fx1', type: 'FLEX_ROW', styles: { display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%' }, children: [
      { id: 'fx1a', type: 'IMAGE', styles: { width: '50%' }, content: { src: 'a.jpg', aspectRatio: '1 / 1' } },
      { id: 'fx1b', type: 'TEXT', styles: { width: '50%', padding: '10px' }, content: { text: '<p>col</p>' } },
      { id: 'fx1c', type: 'BUTTON', styles: { textAlign: 'center' }, content: { text: 'Go', url: '#', useGlobal: true } },
  ] },
  { id: 'fx2', type: 'CSS_GRID', styles: { width: '100%' }, content: { columns: 3, gap: '16px' }, children: [
      { id: 'fx2a', type: 'ICON_BOX', styles: { padding: '20px', textAlign: 'center' }, content: { icon: '*', title: 'A', description: 'd' } },
      { id: 'fx2b', type: 'IMAGE', styles: {}, content: { src: 'b.jpg', aspectRatio: '16 / 9' } },
      { id: 'fx2c', type: 'FLEX_ROW', styles: { display: 'flex', gap: '8px' }, children: [
          { id: 'fx2c1', type: 'BUTTON', styles: {}, content: { text: 'X', url: '#' } },
      ] },
  ] },
  // ---- new blocks (0.11.0) ----
  { id: 'n1', type: 'ACCORDION', styles: { width: '100%' }, content: { allowMultiple: false, openFirst: true, icon: 'plus', variant: 'card', items: [{ title: 'Prima', content: '<p>uno</p>' }, { title: 'Seconda', content: '<p>due</p>' }] } },
  { id: 'n1b', type: 'ACCORDION', styles: { width: '100%' }, content: { allowMultiple: true, openFirst: false, icon: 'chevron', variant: 'flat', items: [{ title: 'A', content: '<p>x</p>' }] } },
  { id: 'n1c', type: 'ACCORDION', styles: {}, content: { icon: 'none', items: [] } },
  { id: 'n2', type: 'TABS', styles: { width: '100%' }, content: { variant: 'underline', tabAlign: 'left', items: [{ title: 'Uno', content: '<p>a</p>' }, { title: 'Due', content: '<p>b</p>' }, { title: 'Tre', content: '<p>c</p>' }] } },
  { id: 'n2b', type: 'TABS', styles: {}, content: { variant: 'pills', tabAlign: 'center', items: [{ title: 'Solo', content: '<p>s</p>' }] } },
  { id: 'n3', type: 'PRICING', styles: { padding: '20px 0', width: '100%' }, content: { columns: 0, plans: [
      { name: 'Free', price: '$0', period: '/mo', description: 'Start here', features: ['One', 'Two', ''], buttonText: 'Go', buttonUrl: 'chi-siamo', highlighted: false, badge: '' },
      { name: 'Pro', price: '$19', period: '/mo', description: '', features: ['Everything'], buttonText: 'Mail us', buttonUrl: 'mailto:info@example.com', highlighted: true, badge: 'Popular' } ] } },
  { id: 'n4', type: 'GALLERY', styles: { width: '100%' }, content: { layout: 'grid', columns: 3, gap: 12, aspectRatio: '1 / 1', borderRadius: '8px', lightbox: true, showCaptions: false, images: [{ src: 'a.jpg', alt: 'A', caption: 'Cap A' }, { src: 'b.jpg', alt: 'B', caption: '' }] } },
  { id: 'n4b', type: 'GALLERY', styles: { width: '100%' }, content: { layout: 'masonry', columns: 4, gap: 8, lightbox: false, showCaptions: true, images: [{ src: 'a.jpg', alt: 'A', caption: 'Didascalia' }, { src: 'b.jpg', alt: 'B', caption: 'Altra' }] } },

  // ---- 12 new blocks (0.13.0): variants and edge cases ----
  { id: 'd1', type: 'DIVIDER', styles: { width: '100%' }, content: { style: 'line', color: '#ff0000', thickness: 4, width: 60 } },
  { id: 'd2', type: 'DIVIDER', styles: {}, content: { style: 'gradient', color: 'rgb(10, 20, 30)', thickness: 3, width: 80 } },
  { id: 'd3', type: 'DIVIDER', styles: {}, content: { style: 'dots', color: 'tomato', thickness: 5 } },
  { id: 'd4', type: 'DIVIDER', styles: {}, content: { style: 'wave', color: '#0f172a', height: 120, flip: true } },
  { id: 'd5', type: 'DIVIDER', styles: {}, content: { style: 'curve', height: 60 } },
  { id: 'd6', type: 'DIVIDER', styles: {}, content: { style: 'diagonal', color: 'var(--brand-color, #3b82f6)' } },
  { id: 'd7', type: 'DIVIDER', styles: {}, content: { style: 'spacer', height: 200 } },
  { id: 'd8', type: 'DIVIDER', styles: {}, content: { style: 'inventato', color: 'red; background:url(x)', thickness: 999, width: -5 } },
  { id: 'c1', type: 'CALLOUT', styles: { width: '100%' }, content: { variant: 'warning', title: 'Attenzione', text: '<p>testo</p>', showIcon: true } },
  { id: 'c2', type: 'CALLOUT', styles: {}, content: { variant: 'danger', title: '', text: '<p>solo testo</p>', showIcon: false } },
  { id: 'c3', type: 'CALLOUT', styles: {}, content: { variant: 'sconosciuta', text: '' } },
  { id: 'st1', type: 'STEPS', styles: { width: '100%' }, content: { layout: 'horizontal', items: [{ title: 'Uno', text: 'a' }, { title: 'Due', text: '' }, { title: 'Tre', text: 'c' }] } },
  { id: 'st2', type: 'STEPS', styles: {}, content: { layout: 'vertical', items: [{ title: 'Primo', text: 'x' }, { title: 'Secondo', text: 'y' }] } },
  { id: 'st3', type: 'STEPS', styles: {}, content: { layout: 'horizontal', items: [] } },
  { id: 'k1', type: 'COUNTERS', styles: { width: '100%' }, content: { columns: 0, animate: true, duration: 1000, items: [{ value: 1234567, prefix: '$', suffix: '+', decimals: 0, label: 'Revenue' }, { value: '4.5', decimals: 1, label: 'Rating' }, { value: 'abc', label: 'Invalid' }] } },
  { id: 'k2', type: 'COUNTERS', styles: {}, content: { columns: 2, animate: false, items: [{ value: 12.345, decimals: 2, suffix: '%' }] } },
  { id: 'p1', type: 'PROGRESS', styles: { width: '100%' }, content: { height: 14, showValue: true, animate: true, items: [{ label: 'Design', value: 90.55, color: '#10b981' }, { label: 'Dev', value: 150, color: 'bad;color' }, { label: 'Neg', value: -3 }] } },
  { id: 'p2', type: 'PROGRESS', styles: {}, content: { showValue: false, animate: false, items: [{ label: 'X', value: 40 }] } },
  { id: 'tb1', type: 'TABLE', styles: { width: '100%' }, content: { data: 'Nome | Eta | Citta\nAnna | 30 | Roma\nMarco | 41\nGiulia | 28 | Milano | extra', caption: 'Persone', headerRow: true, striped: true, bordered: true, compact: true, rowHeaders: true, stickyHeader: true, maxHeight: 300 } },
  { id: 'tb2', type: 'TABLE', styles: {}, content: { data: 'a\tb\n\n  c | d  \n', headerRow: false, striped: false } },
  { id: 'tb3', type: 'TABLE', styles: {}, content: { data: '', headerRow: true } },
  { id: 'cd1', type: 'COUNTDOWN', styles: { width: '100%' }, content: { datetime: '2030-06-15T18:30', utcOffset: '+02:00', endAction: 'message', endMessage: 'Fatto!', showSeconds: true, showDate: true, labelDays: 'Giorni', labelHours: 'Ore', labelMinutes: 'Minuti', labelSeconds: 'Secondi' } },
  { id: 'cd2', type: 'COUNTDOWN', styles: {}, content: { datetime: 'non valida', utcOffset: 'boh', endAction: 'hide', showSeconds: false, showDate: false } },
  { id: 'tl1', type: 'TIMELINE', styles: { width: '100%' }, content: { layout: 'left', items: [{ date: '2021', title: 'Inizio', text: 'a' }, { date: '', title: 'Senza data', text: '' }] } },
  { id: 'tl2', type: 'TIMELINE', styles: {}, content: { layout: 'alternate', items: [{ date: '2022', title: 'A', text: 'x' }, { date: '2023', title: 'B', text: 'y' }, { date: '2024', title: 'C', text: 'z' }] } },
  { id: 'lg1', type: 'LOGOS', styles: { width: '100%' }, content: { layout: 'grid', title: 'Clienti', columns: 4, height: 40, gap: 24, grayscale: true, logos: [{ src: 'a.png', alt: 'A', href: 'https://a.example' }, { src: 'b.png', alt: 'B', href: '' }, { src: 'c.png', alt: 'C', href: 'chi-siamo/index.html' }] } },
  { id: 'lg2', type: 'LOGOS', styles: {}, content: { layout: 'marquee', title: '', speed: 20, grayscale: false, gap: 30, logos: [{ src: 'a.png', alt: 'A', href: 'https://a.example' }, { src: 'b.png', alt: 'B', href: '' }] } },
  { id: 'tm1', type: 'TEAM', styles: { width: '100%' }, content: { columns: 0, layout: 'card', photoShape: 'rounded', members: [
      { name: 'Anna Rossi', role: 'CEO', bio: 'Guida.', photo: 'anna.jpg', email: 'anna@example.com', linkedin: 'linkedin.com/in/anna', twitter: 'https://x.com/anna', website: '' },
      { name: 'marco', role: '', bio: '', photo: '', email: 'non-una-email', linkedin: '', twitter: '', website: 'example.com' },
      { name: '', role: 'Ruolo', photo: '' } ] } },
  { id: 'tm2', type: 'TEAM', styles: {}, content: { columns: 2, layout: 'minimal', photoShape: 'square', members: [{ name: 'Zed', role: 'Dev' }] } },
  { id: 'ba1', type: 'BEFORE_AFTER', styles: { width: '100%' }, content: { startPosition: 30, aspectRatio: '4 / 3', showLabels: true, before: { src: 'b.jpg', alt: 'Prima', label: 'Prima' }, after: { src: 'a.jpg', alt: 'Dopo', label: 'Dopo' } } },
  { id: 'ba2', type: 'BEFORE_AFTER', styles: {}, content: { startPosition: 999, showLabels: false, before: { src: 'b.jpg' }, after: { src: 'a.jpg' } } },
  { id: 'bz1', type: 'BUSINESS', styles: { width: '100%' }, content: { name: 'Bar Roma', businessType: 'CafeOrCoffeeShop', address: 'Via Roma 1\n00100 Roma', phone: '+39 06 123 4567', email: 'info@bar.example', website: 'bar.example/it', mapsLink: true, directionsLabel: 'Indicazioni', hoursTitle: 'Orari', closedLabel: 'Chiuso', note: 'Chiuso nei festivi', hours: [{ day: 'Lunedi', open: '08:00', close: '19:00', closed: false }, { day: 'Martedi', open: '', close: '', closed: true }, { day: 'Mercoledi', open: 'x', close: 'y', closed: false }] } },
  { id: 'bz2', type: 'BUSINESS', styles: {}, content: { name: '', address: '', phone: '', email: 'sbagliata', hours: [] } },
  { id: 'bn1', type: 'BENTO', styles: { width: '100%' }, content: { columns: 4, rowHeight: 200, gap: 12, hover: 'zoom', tiles: [
      { size: 'large', icon: '*', title: 'Big', text: 'Text', image: 'big.jpg', alt: 'Alt', bg: '#000', color: '', href: 'chi-siamo/index.html' },
      { size: 'wide', title: 'Wide', bg: '#eff6ff', href: 'https://example.com' },
      { size: 'tall', title: '', text: '', icon: '' },
      { size: 'evil', title: 'Unknown size' }, 'not a tile', null, { size: ['wide'], title: 'Array size' } ] } },
  { id: 'bn2', type: 'BENTO', styles: {}, content: { columns: 'x', rowHeight: 9999, gap: -5, hover: 'evil', tiles: [
      { size: 'wide', title: '<b>x</b>', bg: 'red;}', color: 'url(x)', image: 'javascript:alert(1)', href: 'javascript:alert(2)' },
      { title: ['array'], text: { o: 1 }, icon: true, image: 7 } ] } },
  { id: 'bn3', type: 'BENTO', styles: {}, content: {} },
  { id: 'sc1', type: 'SPLIT_CTA', styles: { width: '100%' }, content: { gap: 24, radius: 0,
      left: { icon: '!', title: 'Left', text: 'L', buttonText: 'Go', buttonUrl: 'contatti/index.html', bg: '#111', color: '#fff', buttonBg: '#f00', buttonColor: '#fff' },
      right: { title: 'Right', text: '', buttonText: '', bg: 'expression(x)' } } },
  { id: 'sc2', type: 'SPLIT_CTA', styles: {}, content: { gap: 999, radius: 'r', left: 'nope', right: null } },
  { id: 'cs1', type: 'CASE_STUDY', styles: { width: '100%' }, content: { layout: 'horizontal', image: 'case.jpg', alt: 'Team', logo: 'logo.svg', client: 'ACME', metric: '+240%', metricLabel: 'traffic', title: 'T', text: 'S', quote: 'Q', quoteAuthor: 'A', linkText: 'Read', linkUrl: 'https://example.com', accent: '#10b981' } },
  { id: 'cs2', type: 'CASE_STUDY', styles: {}, content: { layout: 'vertical', image: 'case.jpg', title: 'Only a title', quote: 'Q', quoteAuthor: '' } },
  { id: 'cs3', type: 'CASE_STUDY', styles: {}, content: { image: 'javascript:alert(1)', logo: 'data:text/html,x', accent: 'red;}', client: '', metric: '', linkText: 'L', linkUrl: 'javascript:alert(2)' } },
  { id: 'ab1', type: 'AUTHOR_BIO', styles: { width: '100%' }, content: { layout: 'horizontal', boxed: true, label: 'About', name: 'Alex Morgan', role: 'Editor', bio: 'Line one\nLine two', photo: 'alex.jpg', links: [{ label: 'Site', url: 'example.com' }, { label: 'Mail', url: 'alex@example.com' }] } },
  { id: 'ab2', type: 'AUTHOR_BIO', styles: {}, content: { layout: 'centered', boxed: false, label: '', name: 'solo', role: '', bio: '', photo: '',
      links: ['x', null, { label: '', url: 'a.example' }, { label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Empty', url: '' }] } },
  { id: 'ab3', type: 'AUTHOR_BIO', styles: {}, content: { name: ['x'], bio: { a: 1 }, photo: 'vbscript:x', links: 'nope' } },
  { id: 'lg3', type: 'LOGOS', styles: {}, content: { layout: 'marquee', speed: 45, direction: 'right', fade: true, logos: [{ src: 'a.png', alt: 'A' }, { src: 'b.png', alt: 'B' }] } },
  { id: 'lg4', type: 'LOGOS', styles: {}, content: { layout: 'marquee', direction: 'up', fade: 'yes', logos: [{ src: 'a.png', alt: 'A' }] } },
  { id: 'rs1', type: 'REVIEW_SUMMARY', styles: { width: '100%' }, content: { layout: 'side', title: 'Rating', average: 4.76, total: 1280, totalLabel: 'reviews', source: 'Google', color: '#ef4444', rowValue: 'count', linkText: 'All', linkUrl: 'recensioni/index.html',
      distribution: [{ stars: 5, count: 1000 }, { stars: 4, count: 200 }, { stars: 3, count: 50 }, { stars: 2, count: 20 }, { stars: 1, count: 10 }] } },
  { id: 'rs2', type: 'REVIEW_SUMMARY', styles: {}, content: { layout: 'stacked', average: 9, total: -3, rowValue: 'none', distribution: [{ stars: 9, count: 'x' }, 'junk', { stars: 0, count: 0 }] } },
  { id: 'rs3', type: 'REVIEW_SUMMARY', styles: {}, content: { average: 'abc', showDistribution: false, color: 'red;}', distribution: [{ stars: 5, count: 3 }] } },
  { id: 'rs4', type: 'REVIEW_SUMMARY', styles: {}, content: {} },
  { id: 'tw1', type: 'TESTIMONIAL_WALL', styles: { width: '100%' }, content: { columns: 4, gap: 12, cardStyle: 'card', showRatings: true, starColor: '#000', items: [
      { quote: 'One\nTwo', name: 'Laura Bianchi', role: 'Owner', avatar: 'l.jpg', rating: 5 }, { quote: 'Q', name: 'Tom', role: '', avatar: '', rating: 3 }, { quote: 'Q', name: '', rating: 0 }, 'junk' ] } },
  { id: 'tw2', type: 'TESTIMONIAL_WALL', styles: {}, content: { columns: 9, gap: -1, cardStyle: 'minimal', showRatings: false, items: [{ quote: '<b>x</b>', name: ['n'], avatar: 'javascript:x', rating: 99 }] } },
  { id: 'hg1', type: 'HOVER_GRID', styles: { width: '100%' }, content: { columns: 4, gap: 8, radius: 0, aspectRatio: '16 / 9', effect: 'fade', overlay: 'rgba(0,0,0,0.5)', items: [
      { image: 'a.jpg', alt: 'A', title: 'T', text: 'X', href: 'servizi/index.html' }, { image: '', title: '', text: '' }, null ] } },
  { id: 'hg2', type: 'HOVER_GRID', styles: {}, content: { columns: 0, aspectRatio: '99 / 1', effect: 'boom', overlay: 'url(x)', items: [{ image: 'javascript:alert(1)', href: 'javascript:alert(2)', title: '<img src=x>' }] } },
  { id: 'ss1', type: 'SCROLLYTELLING', styles: { width: '100%' }, content: { side: 'right', ratio: '16 / 9', stickyTop: 100, stepHeight: 80, gap: 24, steps: [
      { title: 'One', text: 'a\nb', image: 'one.jpg', alt: 'First' }, { title: 'Only a title' }, { text: 'Only text', image: '' }, 'junk', null, { title: 'Bad image', image: 'javascript:alert(1)' } ] } },
  { id: 'ss2', type: 'SCROLLYTELLING', styles: {}, content: { side: 'x', ratio: '99 / 1', stickyTop: 'abc', stepHeight: 9999, gap: -5, steps: [{ title: '<b>x</b>', text: { o: 1 }, image: 7, alt: ['a'] }] } },
  { id: 'ss3', type: 'SCROLLYTELLING', styles: {}, content: {} },
  { id: 'hs1', type: 'HOTSPOTS', styles: { width: '100%' }, content: { image: 'product.jpg', alt: 'Product', radius: 0, pinColor: '#ef4444', pinTextColor: '#000', pulse: false, pins: [
      { x: 10, y: 20, title: 'Left top', text: 'a\nb', linkText: 'More', href: 'prodotti/index.html' }, { x: 50, y: 60, title: 'Centre bottom' }, { x: 90, y: 90, title: '', text: 'No title' }, { x: 25, y: 55 }, { x: 75, y: 55.5 }, 'junk', null ] } },
  { id: 'hs2', type: 'HOTSPOTS', styles: {}, content: { image: 'javascript:alert(1)', ratio: '99 / 1', pinColor: 'red;}', pins: [{ x: 'abc', y: 500, title: '<img src=x>', linkText: 'L', href: 'javascript:alert(2)' }, { x: -5, y: -5, title: ['t'] }] } },
  { id: 'hs3', type: 'HOTSPOTS', styles: {}, content: {} },
  { id: 'tc1', type: 'TABLE_OF_CONTENTS', styles: { width: '100%' }, content: { title: 'On this page', levels: 'h2h3', numbered: true, highlight: false, sticky: true, stickyTop: 120, offset: 100, layout: 'plain', accent: '#10b981' } },
  { id: 'tc2', type: 'TABLE_OF_CONTENTS', styles: {}, content: { title: '<b>x</b>', levels: 'h9', numbered: 'yes', sticky: 'yes', stickyTop: 9999, offset: -1, layout: 'weird', accent: 'red;}' } },
  { id: 'tc3', type: 'TABLE_OF_CONTENTS', styles: {}, content: {} },
  { id: 'sb1', type: 'SHARE_BAR', styles: { width: '100%' }, content: { title: 'Share', message: 'Read this', networks: ['facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'email', 'copy', 'print', 'share'], style: 'icons', shape: 'square', colors: 'dark', size: 48, align: 'center' } },
  { id: 'sb2', type: 'SHARE_BAR', styles: {}, content: { title: 'T', networks: ['copy', 'x', 'evil', 7, null, 'facebook'], style: 'buttons', shape: 'rounded', colors: 'mono', size: 9999, align: 'right' } },
  { id: 'sb3', type: 'SHARE_BAR', styles: {}, content: { title: '<b>x</b>', message: '"><script>x</script>', networks: 'facebook', colors: 'neon', align: 'up' } },
  { id: 'sb4', type: 'SHARE_BAR', styles: {}, content: {} },
  { id: 'cn1', type: 'CODE_SNIPPET', styles: { width: '100%' }, content: { language: 'php', filename: 'index.php', theme: 'light', fontSize: 16, maxHeight: 300, lineNumbers: true, copyButton: true, code: '<?php\necho "hi"; // x\n\n$a = [1, 2];' } },
  { id: 'cn2', type: 'CODE_SNIPPET', styles: {}, content: { language: 'evil', filename: '<b>x</b>', theme: 'neon', fontSize: 999, maxHeight: -5, lineNumbers: 'yes', copyButton: false, code: '</script><script>alert(1)</script>\r\nsecond\r\n\r\n\r\n' } },
  { id: 'cn3', type: 'CODE_SNIPPET', styles: {}, content: { language: 'text', code: '' } },
  { id: 'cn4', type: 'CODE_SNIPPET', styles: {}, content: { language: 'js', copyButton: false, code: { o: 1 } } },
  { id: 'cn5', type: 'CODE_SNIPPET', styles: {}, content: {} },
  { id: 'pc1', type: 'PRICE_CALCULATOR', styles: { width: '100%' }, content: { title: 'Prezzo', intro: 'a\nb', layout: 'card', accent: '#10b981', currency: '€', currencyPos: 'after', numberFormat: 'eu', decimals: 2, basePrice: 1234.5, baseLabel: 'Base', periodMonth: 'mese', periodYear: 'anno',
      billingToggle: true, defaultBilling: 'yearly', monthlyLabel: 'Mensile', yearlyLabel: 'Annuale', yearlyDiscount: 15, saveText: 'Risparmi {amount}', totalLabel: 'Totale', buttonText: 'Vai', buttonUrl: 'contatti/index.html', note: 'x\ny',
      sliders: [{ label: 'Utenti', unit: 'utenti', min: 1, max: 100, step: 1, value: 25, included: 5, price: 7.25 }, { label: 'Spazio', unit: 'GB', min: 0, max: 1, step: 0.1, value: 0.5, included: 0, price: 100 }],
      addons: [{ label: 'Supporto', price: 49.99, checked: true }, { label: 'Dominio', price: 9, checked: false }] } },
  { id: 'pc2', type: 'PRICE_CALCULATOR', styles: {}, content: { title: '<b>x</b>', currency: '<script>x</script>12345678', currencyPos: 'weird', numberFormat: 'xx', decimals: 99, basePrice: -5, accent: 'red;}', billingToggle: 'yes', defaultBilling: 'yearly', yearlyDiscount: 999,
      sliders: [{ label: '<i>a</i>', unit: '<b>u</b>', min: 50, max: 10, step: 0, value: 999, included: -3, price: -2 }, 'junk', null, { min: 'a', max: 'b', step: 'c', value: 'd', price: 'e' }],
      addons: [{ label: ['x'], price: 'y', checked: 'yes' }, 7], buttonText: 'B', buttonUrl: 'javascript:alert(1)', note: { o: 1 } } },
  { id: 'pc3', type: 'PRICE_CALCULATOR', styles: {}, content: {} },
  { id: 'pc4', type: 'PRICE_CALCULATOR', styles: {}, content: { layout: 'plain', billingToggle: true, yearlyDiscount: 0, defaultBilling: 'yearly', basePrice: 10, currency: '$', sliders: [] } },
  { id: 'wz1', type: 'WIZARD', styles: { width: '100%' }, content: { title: 'Quote', intro: 'a\nb', progress: 'steps', layout: 'card', accent: '#ef4444', stepLabel: 'Passo {n} di {total}', btnText: 'Invia', nextText: 'Avanti', backText: 'Indietro', successMsg: 'Grazie', email: 'a@b.it', steps: [
      { title: 'You', description: 'Who?', fields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Phone', type: 'tel' }] },
      { title: 'Project', fields: [{ label: 'Need', type: 'radio', required: true, options: 'A\nB\n\n  C  ' }, { label: 'Budget', type: 'select', options: 'x\ny', placeholder: 'Pick' }, { label: 'Extras', type: 'checkboxes', required: true, options: 'One\nTwo' }] },
      { title: '', fields: [{ label: 'Message', type: 'textarea' }, { label: 'Agree', type: 'consent', required: true }, { label: 'Date', type: 'date' }, { label: 'N', type: 'number' }, { label: 'URL', type: 'url' }] }] } },
  { id: 'wz2', type: 'WIZARD', styles: {}, content: { title: '<b>x</b>', progress: 'evil', layout: 'plain', accent: 'red;}', customId: 'My Form!', successMsg: '"><script>x</script>', steps: [
      { title: '<img src=x onerror=a>', description: { o: 1 }, fields: [{ label: '"><b>', type: 'evil', required: 'yes' }, 'junk', null, { label: ['x'], type: 'select', options: Array.from({ length: 30 }, (_, i) => 'opt' + i).join('\n') }] }, 'junk', null,
      { fields: 'nope' }] } },
  { id: 'wz3', type: 'WIZARD', styles: {}, content: {} },
  { id: 'wz4', type: 'WIZARD', styles: {}, content: { steps: [{ title: 'Only', fields: [{ label: 'A', type: 'text' }] }] } },
  { id: 'vh1', type: 'VIDEO_HERO', styles: { width: '100%' }, content: { video: '/uploads/a.mp4', video2: 'https://cdn.example.com/a.webm?x=1#t', poster: '/uploads/p.jpg', height: 700, overlay: '#000000', overlayOpacity: 30, align: 'left', textColor: '#ffeeaa', title: 'Hello', subtitle: 'a\nb', showPause: false, mobileVideo: true,
      buttons: [{ text: 'Go', url: 'contatti/index.html', style: 'primary' }, { text: 'More', url: 'https://example.com', style: 'secondary' }, { text: 'Third', url: 'x' }] } },
  { id: 'vh2', type: 'VIDEO_HERO', styles: {}, content: { video: 'javascript:alert(1)', video2: 'data:text/html,x', poster: 'javascript:alert(2)', height: 99999, overlay: 'red;}', overlayOpacity: 500, align: 'evil', textColor: 'url(x)', title: '<img src=x onerror=a>', subtitle: { o: 1 },
      buttons: ['junk', null, { text: '', url: 'a' }, { text: '<b>x</b>', url: 'javascript:alert(3)' }] } },
  { id: 'vh3', type: 'VIDEO_HERO', styles: {}, content: {} },
  { id: 'vh4', type: 'VIDEO_HERO', styles: {}, content: { poster: 'p.jpg', title: 'Only a poster' } },
  { id: 'vh5', type: 'VIDEO_HERO', styles: {}, content: { video: 'noextension', buttons: [{ text: '' }, { text: 'Second' }, { text: 'Third' }] } },
  { id: 'ap1', type: 'AUDIO_PLAYER', styles: { width: '100%' }, content: { src: '/uploads/a.mp3', title: 'Episode', artist: 'Show', cover: 'c.jpg', layout: 'plain', accent: '#ef4444', skip: false, speed: false } },
  { id: 'ap2', type: 'AUDIO_PLAYER', styles: {}, content: { src: 'javascript:alert(1)', title: '<b>x</b>', artist: ['a'], cover: 'javascript:alert(2)', accent: 'red;}', layout: 'evil', skip: 'no', speed: 0 } },
  { id: 'ap3', type: 'AUDIO_PLAYER', styles: {}, content: {} },
  { id: 'an1', type: 'ANNOUNCEMENT_BAR', styles: { width: '100%' }, content: { text: 'Spedizione gratuita sopra 50 €', icon: '🎁', linkText: 'Scopri', linkUrl: 'offerte/index.html', preset: 'promo', sticky: true, dismissible: true, align: 'left' } },
  { id: 'an2', type: 'ANNOUNCEMENT_BAR', styles: {}, content: { text: '<img src=x onerror=a>', icon: '12345678', linkText: 'L', linkUrl: 'javascript:alert(1)', preset: 'evil', bg: 'red;}', color: 'url(x)', sticky: 'yes', dismissible: false } },
  { id: 'an3', type: 'ANNOUNCEMENT_BAR', styles: {}, content: {} },
  { id: 'an4', type: 'ANNOUNCEMENT_BAR', styles: {}, content: { text: 'Warning', preset: 'warning', bg: '#123456', color: '#abcdef', dismissible: false } },
  { id: 'nl1', type: 'NEWSLETTER', styles: { width: '100%' }, content: { title: 'Join', text: 'a\nb', placeholder: 'Mail', emailLabel: 'E-mail', askName: true, nameLabel: 'Nome', namePlaceholder: 'Il tuo nome', consentText: 'Accetto', buttonText: 'Iscriviti', successMsg: 'Grazie', email: 'a@b.it', layout: 'plain', formLayout: 'stacked', accent: '#10b981' } },
  { id: 'nl2', type: 'NEWSLETTER', styles: {}, content: { title: '<b>x</b>', text: { o: 1 }, placeholder: '"><script>x</script>', emailLabel: '"><b>', askName: 'yes', consentText: '<i>c</i>', buttonText: '<u>b</u>', successMsg: '"><x>', customId: 'My Form!', formLayout: 'evil', accent: 'red;}' } },
  { id: 'nl3', type: 'NEWSLETTER', styles: {}, content: {} },
  // Categories & Tags: the terms of the item being published; nothing on any other page (both renderers)
  { id: 'it1', type: 'ITEM_TERMS', styles: { width: '100%' }, content: { taxonomy: 'tx1', separator: ' · ' } },
  // Related Items: the items that point to the collection item being published; nothing on any other page (both renderers)
  { id: 'rl1', type: 'RELATED', styles: { width: '100%' }, content: { collectionId: 'c1', fieldId: 'f1', limit: 3, columns: 3, title: 'Team', cardFields: ['x'] } },
  // Item Field: shows a field of the collection item being published; on any other page it shows nothing (both renderers)
  { id: 'if1', type: 'ITEM_FIELD', styles: { width: '100%' }, content: { field: '', showLabel: false, decimals: 0, dateFormat: 'long' } },
  { id: 'if2', type: 'ITEM_FIELD', styles: {}, content: { field: 'price', showLabel: true, decimals: 2, dateFormat: 'iso' } },
  // button presets (Global Options › Buttons & fields): a block picks one; an unknown one is ignored; a hero's button
  { id: 'bp1', type: 'BUTTON', styles: { textAlign: 'center' }, content: { text: 'Primo', url: '#', preset: 'primary' } },
  { id: 'bp2', type: 'BUTTON', styles: { margin: '4px' }, content: { text: 'Secondo', url: '#', useGlobal: false, preset: 'outline' } },
  { id: 'bp3', type: 'BUTTON', styles: {}, content: { text: 'Custom', url: '#', preset: 'nope' } },
  { id: 'bp4', type: 'HERO', styles: {}, content: { title: '<h1>H</h1>', subtitle: '', buttons: [{ text: 'A', url: '#', bgColor: '#f00', textColor: '#fff', borderRadius: '4px', preset: 'secondary' },
    { text: 'B', url: '#', bgColor: '#0f0', textColor: '#000', borderRadius: '4px', borderColor: '#00f' }] } },
];

// Fixtures from the REAL DEFAULTS (blocks.json): exactly what the editor creates with addBlock.
{
  const defs = JSON.parse(readFileSync(fileURLToPath(new URL('../../canvascore-admin/blocks.json', import.meta.url)), 'utf-8'));
  for (const type of ['ACCORDION', 'TABS', 'PRICING', 'GALLERY', 'DIVIDER', 'CALLOUT', 'STEPS', 'COUNTERS', 'PROGRESS', 'TABLE', 'COUNTDOWN', 'TIMELINE', 'LOGOS', 'TEAM', 'BEFORE_AFTER', 'BUSINESS', 'BENTO', 'SPLIT_CTA', 'CASE_STUDY', 'AUTHOR_BIO', 'REVIEW_SUMMARY', 'TESTIMONIAL_WALL', 'HOVER_GRID', 'SCROLLYTELLING', 'HOTSPOTS', 'TABLE_OF_CONTENTS', 'SHARE_BAR', 'CODE_SNIPPET', 'PRICE_CALCULATOR', 'WIZARD', 'VIDEO_HERO', 'AUDIO_PLAYER', 'ANNOUNCEMENT_BAR', 'NEWSLETTER']) {
    const def = defs.types[type];
    if (!def) { console.error(`blocks.json: type ${type} is missing`); process.exit(1); }
    fixtures.push({ id: 'def_' + type.toLowerCase(), type, styles: { ...(defs._baseStyles || {}), ...(def.styles || {}) }, content: JSON.parse(JSON.stringify(def.content || {})) });
  }
}

// Normalizes an HTML tree into a comparable representation:
// tag + classes + normalized style, discarding text and <script> nodes.
function normalizeStyle(style) {
  if (!style) return '';
  return style.split(';').map(s => s.trim()).filter(Boolean)
    .map(s => s.replace(/\s+/g, ' ').replace(/:\s+/g, ':').replace(/,\s+/g, ',')).sort().join('; ');
}

function skeleton($, el) {
  const node = $(el);
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'script' || tag === 'style') return null; // ignore textual JS/CSS behavior
  const cls = (node.attr('class') || '').split(/\s+/).filter(Boolean).sort().join('.');
  const style = normalizeStyle(node.attr('style'));
  // relevant structural attributes
  const attrs = {};
  for (const a of ['href', 'src', 'object-fit']) { const v = node.attr(a); if (v) attrs[a] = v; }
  const children = [];
  node.children().each((_, c) => { const s = skeleton($, c); if (s) children.push(s); });
  return { tag, cls, style, attrs, children };
}

function toSkeleton(html) {
  const $ = load(`<div id="__root__">${html}</div>`, null, false);
  const root = $('#__root__')[0];
  const out = [];
  $(root).children().each((_, c) => { const s = skeleton($, c); if (s) out.push(s); });
  return out;
}

function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (!a[i]) { out.push(`${path}[${i}]: missing in JS`); continue; }
      if (!b[i]) { out.push(`${path}[${i}]: missing in PHP`); continue; }
      out.push(...diff(a[i], b[i], `${path}[${i}]`));
    }
    return out;
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k === 'children') { out.push(...diff(a[k] || [], b[k] || [], `${path}.children`)); continue; }
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        out.push(`${path}.${k}: JS=${JSON.stringify(a[k])}  PHP=${JSON.stringify(b[k])}`);
      }
    }
    return out;
  }
  return [`${path}: JS=${JSON.stringify(a)} PHP=${JSON.stringify(b)}`];
}

// For these blocks the generated CSS carries LOGIC (radio tabs, open state, responsive):
// besides the structure we also compare the text of the <style> tags.
const STRICT_STYLE = new Set(['ACCORDION', 'TABS', 'PRICING', 'GALLERY', 'DIVIDER', 'CALLOUT', 'STEPS', 'COUNTERS', 'PROGRESS', 'TABLE', 'COUNTDOWN', 'TIMELINE', 'LOGOS', 'TEAM', 'BEFORE_AFTER', 'BUSINESS', 'BENTO', 'SPLIT_CTA', 'CASE_STUDY', 'AUTHOR_BIO', 'REVIEW_SUMMARY', 'TESTIMONIAL_WALL', 'HOVER_GRID', 'SCROLLYTELLING', 'HOTSPOTS', 'TABLE_OF_CONTENTS', 'SHARE_BAR', 'CODE_SNIPPET', 'PRICE_CALCULATOR', 'WIZARD', 'VIDEO_HERO', 'AUDIO_PLAYER', 'ANNOUNCEMENT_BAR', 'NEWSLETTER']);
function styleTexts(html) {
  const $ = load(`<div id="__root__">${html}</div>`, null, false);
  return $('style').map((_, e) => $(e).text().replace(/\s+/g, ' ').replace(/:\s+/g, ':').replace(/,\s+/g, ',').trim()).get();
}

let failures = 0;
for (const fx of fixtures) {
  const jsHtml = renderBlock(fx);
  let phpHtml;
  try {
    phpHtml = execFileSync('php', [phpScript], { input: JSON.stringify(fx) }).toString();
  } catch (e) {
    console.error(`[${fx.type}] PHP error:`, e.message);
    failures++; continue;
  }
  const d = diff(toSkeleton(jsHtml), toSkeleton(phpHtml));
  if (STRICT_STYLE.has(fx.type)) {
    const a = styleTexts(jsHtml), b = styleTexts(phpHtml);
    if (JSON.stringify(a) !== JSON.stringify(b)) d.push(`<style> differs: JS=${JSON.stringify(a).slice(0, 160)}…  PHP=${JSON.stringify(b).slice(0, 160)}…`);
  }
  if (d.length) {
    failures++;
    console.error(`\n✗ PARITY FAILED — ${fx.type} (${fx.id})`);
    for (const line of d.slice(0, 20)) console.error('   ' + line);
  } else {
    console.log(`✓ ${fx.type}`);
  }
}

// --- Styles per device: the media rules must be byte-identical in both renderers (hostile values included) ---
const RESP = { tablet: { padding: '20px', fontSize: '18px', animation: 'cc-fade-up', textAlign: 'center' },
  mobile: { padding: '10px', margin: '0 auto', fontSize: '15px', color: 'red;}body{display:none', backgroundColor: '</style><script>x()</script>', width: 'expression(alert(1))', gap: 12, order: '' },
  hide: ['desktop', 'mobile', 'nonsense'] };
const deviceFixtures = [
  { id: 'd1', type: 'TEXT', styles: { padding: '40px' }, content: { text: '<p>x</p>' }, responsive: RESP },
  { id: 'd2', type: 'BUTTON', styles: { padding: '12px 24px' }, content: { text: 'Go', url: '#' }, responsive: RESP },
  { id: 'd3', type: 'SECTION', styles: {}, children: [{ id: 'd3c', type: 'TEXT', styles: {}, content: { text: '<p>y</p>' }, responsive: { mobile: { fontSize: '14px' } } }], responsive: { tablet: { padding: '30px 10px' } } },
  { id: 'd4', type: 'HERO', styles: {}, content: { title: '<h1>t</h1>', customId: 'my-hero' }, responsive: { hide: ['tablet'] } },
  { id: 'd5', type: 'TEXT', styles: {}, content: { text: '<p>z</p>' }, responsive: { tablet: {}, mobile: null, hide: [] } },
];
const deviceRules = (html) => [...html.matchAll(/<style data-cc-device>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
for (const fx of deviceFixtures) {
  const js = deviceRules(renderBlock(fx));
  const php = deviceRules(execFileSync('php', [phpScript], { input: JSON.stringify(fx) }).toString());
  const hostile = /script|expression|body\{|nonsense|animation/i.test(js.join(''));
  if (JSON.stringify(js) !== JSON.stringify(php) || hostile) { failures++; console.error(`\n✗ DEVICE STYLES — ${fx.type} (${fx.id})\n   JS=${JSON.stringify(js)}\n   PHP=${JSON.stringify(php)}`); }
  else console.log(`✓ device styles: ${fx.type} (${fx.id})${js.length ? '' : ' — no rules'}`);
}

// --- Shared block definitions (canvascore-admin/blocks/): both engines must give the SAME HTML, byte for byte ---
console.log('\nSHARED BLOCK DEFINITIONS');
{
  const files = readdirSync(fileURLToPath(new URL('../../canvascore-admin/blocks/', import.meta.url))).filter((f) => f.endsWith('.json')).sort();
  const listed = BLOCK_DEFS.map((d) => d.type).sort();
  const onDisk = files.map((f) => JSON.parse(readFileSync(fileURLToPath(new URL('../../canvascore-admin/blocks/' + f, import.meta.url)), 'utf-8')).type).sort();
  if (JSON.stringify(listed) !== JSON.stringify(onDisk)) { failures++; console.error(`✗ BLOCK_DEFS (blockDef.mjs) and the files in blocks/ differ: ${listed} / ${onDisk}`); }
  else console.log(`✓ every definition file is listed in blockDef.mjs (${files.length})`);
  const noScript = (h) => h.replace(/[ \t]*<script>[\s\S]*?<\/script>\n/g, '');   // site-only behaviour scripts (with their indentation)
  const H = `a'b"c<d>&e`;
  const extra = { customId: 'my id!', customClass: `x"y z`, customCss: '__THIS__{color:red}', animDelay: 300, hoverEffect: 'lift' };
  const st = { padding: '10px', textAlign: 'right', animation: 'fade-up', textPreset: 'h2', color: 'red;}x{' };
  const hostile = [
    { type: 'TEXT', content: { text: ['arr'], ...extra }, styles: st }, { type: 'TEXT', content: { text: 42 } },
    { type: 'IMAGE', content: { src: 'javascript:alert(1)', alt: H, aspectRatio: '4 / 5', scale: '"x', objectFit: `a"b`, objectPosition: 'x;y', ...extra }, styles: st },
    { type: 'IMAGE', content: { src: { o: 1 }, alt: ['x'], aspectRatio: '', scale: null } },
    { type: 'ICON_BOX', content: { icon: ['x'], title: 7, description: null, ...extra }, styles: st },
    { type: 'TESTIMONIAL', content: { quote: { o: 1 }, author: true, role: false, ...extra }, styles: st },
    { type: 'CALLOUT', content: { variant: 'evil', title: '0', showIcon: false, ...extra }, styles: st }, { type: 'CALLOUT', content: { variant: ['info'], showIcon: 'no', title: ['t'] } },
    { type: 'TIMELINE', content: { layout: 'alternate', items: ['junk', 7, null, { title: ['t'], date: { a: 1 }, text: H }], ...extra }, styles: st },
    { type: 'STEPS', content: { items: Array.from({ length: 6 }, (_, i) => ({ title: 'S' + i, text: i % 2 ? H : '' })), ...extra }, styles: st },
    { type: 'STEPS', content: { layout: 'vertical', items: { a: { title: 'object, not a list' } } } },
    { type: 'PROGRESS', content: { height: '7px', items: ['junk', 9, { value: true, color: ['x'] }, { value: 33.333 }, { value: '66.66' }, { value: 12.25 }, { value: 0.05 }, { value: 150, color: 'url(x)' }, { value: -5 }] } },
    { type: 'PROGRESS', content: { height: 999, showValue: false, animate: false, items: [{ value: 50, label: H }], ...extra }, styles: st },
  ].map((b, i) => ({ id: 'h' + i, ...b }));
  const defFixtures = [...fixtures.filter((f) => blockDef(f.type)), ...hostile];
  const phpHtml = defFixtures.map((fx) => execFileSync('php', [phpScript], { input: JSON.stringify(fx) }).toString());
  let same = 0;
  defFixtures.forEach((fx, i) => {
    if (noScript(phpHtml[i]) === renderBlock(fx)) { same++; return; }
    failures++; console.error(`✗ ${fx.type} (${fx.id}): the two engines differ\n   JS =${JSON.stringify(renderBlock(fx)).slice(0, 300)}\n   PHP=${JSON.stringify(noScript(phpHtml[i])).slice(0, 300)}`);
  });
  console.log(`✓ the same HTML from both engines: ${same} of ${defFixtures.length} blocks (hostile values included)`);
  const typeMix = new Set(defFixtures.map((f) => f.type));
  for (const d of BLOCK_DEFS) if (!typeMix.has(d.type)) { failures++; console.error(`✗ no fixture for ${d.type}`); }

  // The template language and the value cleaning, on definitions made for the test
  const T = (template, settings, content, styles) => ({ def: { type: 'T', settings: settings || {}, template }, block: { id: 'b1', type: 'T', content: content || {}, styles: styles || {} } });
  const cases = [
    T('{{a}}|{{{a}}}|{{{r}}}|{{r}}', { a: { type: 'text' }, r: { type: 'richtext' } }, { a: `<b>'&"`, r: '<i>x</i>' }),
    T('{{#l}}[{{@index}}{{@number}}{{@first}}{{@last}}:{{x}}/{{top}}]{{/l}}{{^l}}none{{/l}}', { l: { type: 'list', item: { x: { type: 'text', default: 'd' } } }, top: { type: 'text', default: 'T' } }, { l: [{ x: 'a' }, 'junk', { x: 'c' }] }),
    T('{{#l}}x{{/l}}{{^l}}none{{/l}}{{#l?}}yes{{/l?}}{{^l?}}no{{/l?}}', { l: { type: 'list', item: {} } }, { l: [] }),
    T('{{#e=b}}B{{/e=b}}{{^e=b}}notB{{/e=b}}:{{e}}:{{{opt.e.html}}}:{{opt.e.html}}', { e: { type: 'enum', default: 'a', options: [{ value: 'a', data: { html: '<u>a</u>' } }, { value: 'b', data: { html: '<u>b</u>' } }] } }, { e: 'b' }),
    T('{{e}}', { e: { type: 'enum', default: 'a', options: [{ value: 'a' }, { value: '1' }] } }, { e: 1 }),
    T('{{n}} {{i}} {{r}} {{big}} {{neg}} {{bad}}', { n: { type: 'number', min: 0, max: 10 }, i: { type: 'number', int: true, default: 3 }, r: { type: 'number', round: 2 }, big: { type: 'number' }, neg: { type: 'number', int: true }, bad: { type: 'number', default: 7 } },
      { n: '12', i: '4.9', r: 1.005, big: 1e15, neg: -0.5, bad: '0x1A' }),
    T('{{#t}}T{{/t}}{{#f}}F{{/f}}{{#d}}D{{/d}}{{#z}}Z{{/z}}{{#o}}O{{/o}}', { t: { type: 'bool', default: true }, f: { type: 'bool' }, d: { type: 'bool', default: true }, z: { type: 'bool' }, o: { type: 'bool' } }, { t: 0, f: '0', d: false, z: [], o: { k: 1 } }),
    T('{{c}}|{{d}}|{{img}}|{{p}}|{{m}}|{{w}}', { c: { type: 'color', default: '#000' }, d: { type: 'color', default: '#111' }, img: { type: 'image' }, p: { type: 'text', pattern: '^[a-z]+$', default: 'def' }, m: { type: 'text', maxLength: 3 }, w: { type: 'text', default: 'x', fallbackWhenEmpty: true } },
      { c: 'var(--cc-color-a, #fff)', d: 'red;}', img: ' JaVa\tscript:alert(1)', p: 'A1', m: 'àèìòù', w: '' }),
    T('{{s}}|{{x}}|{{_s}}|{{{_style}}}|{{_classes}}|{{_id}}', { s: { type: 'text', from: 'styles', key: 'textAlign', default: 'left' }, x: { type: 'text', from: 'styles', key: 'nope', default: 'dflt' } }, { customClass: 'a<b' }, { textAlign: 'center', color: '#f00' }),
    T('{{! a comment }}{{a.b.c}}{{#o}}{{k}}{{/o}}{{.}}', { o: { type: 'list', item: { k: { type: 'text' } } } }, { o: [{ k: 1 }] }),
    T('{{#a}}unclosed', {}), T('{{/a}}', {}), T('{{#a}}{{/b}}', {}), T('{{}}', {}),
    // 0.21: lists of values, code, calc, transforms, renderIf, leading whole numbers
    T('{{#l}}[{{{.}}}|{{.}}]{{/l}}{{#f}}<{{.}}>{{/f}}', { l: { type: 'list', of: { type: 'richtext' } }, f: { type: 'list', of: { type: 'text' }, skipEmpty: true } }, { l: ['<b>x</b>', 7, null], f: ['a', '  ', '', ['x'], 'b'] }),
    T('{{{c}}}|{{c}}', { c: { type: 'code' } }, { c: '<script>admin()</script>' }),
    T('{{d}} {{e}}', { t: { type: 'number', int: true, default: 2 }, d: { type: 'calc', of: 't', mul: 2, add: 8 }, e: { type: 'calc', of: 'missing', add: 1 } }, { t: '5' }),
    T('{{u}}|{{c}}|{{e}}|{{{b}}}|{{v}}|{{w}}|{{n}}', { u: { type: 'text', transform: 'blockUrl' }, c: { type: 'text', transform: 'cssUrl' }, e: { type: 'text', transform: 'urlencode' }, b: { type: 'text', transform: 'lines2br' },
      v: { type: 'text', transform: 'videoEmbed' }, w: { type: 'text', key: 'v2', transform: 'videoEmbed' }, n: { type: 'number', transform: 'fmtNum', decimalsFrom: 'dec' }, dec: { type: 'number', int: true } },
      { u: 'chi-siamo/index.html', c: "a'(b).jpg", e: "a b&c/é~!*'()", b: 'one\ntwo\r\n<3', v: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1', v2: 'https://vimeo.com/123456', n: 1234567.875, dec: 2 }),
    T('x', { v: { type: 'text' } }, { v: '' }),
    T('{{a}} {{b}} {{c}} {{d}} {{e}}', { a: { type: 'number', parse: 'int', default: 15, min: 1, max: 21 }, b: { type: 'number', parse: 'int', default: 15 }, c: { type: 'number', parse: 'int', default: 15 }, d: { type: 'number', parse: 'int', default: 15 }, e: { type: 'number', parse: 'int', default: 15, min: 1, max: 21 } },
      { a: '7px', b: 'abc', c: true, d: 7.9, e: '-3' }),
  ];
  cases[cases.length - 2].def.renderIf = 'v';
  cases.push(T('.x{{{#a}}y{{/a}}}', {}), T('.x{{{{a}}}}', {}), T('.x{{{_lb}}}{{#a}}y{{/a}}{{{_rb}}}', { a: { type: 'bool', default: true } }));
  cases.push(
    T('[{{t}}]{{#s}}S{{/s}}{{#n}}N{{/n}}|{{c}} {{m}}|{{#all}}A{{/all}}{{#any}}Y{{/any}}{{#none}}0{{/none}}', {
      t: { type: 'text', trim: true }, s: { type: 'bool', strict: true }, n: { type: 'bool', strict: true },
      cols: { type: 'number', int: true }, auto: { type: 'number', default: 3 }, c: { type: 'calc', of: 'cols', fallback: 'auto' }, m: { type: 'calc', of: 'c', max: 2 },
      l: { type: 'list', of: { type: 'text' } },
      all: { type: 'flag', when: { t: { not: [''] }, l: true, cols: ['0'] } }, any: { type: 'flag', any: true, when: { s: true, n: true } }, none: { type: 'flag', when: { l: false } } },
      { t: ' \t hi \n', s: true, n: 1, cols: 0, l: ['x'] }),
    T('{{#o}}<{{a}}|{{b}}>{{/o}}{{#p}}P{{/p}}|{{#l}}[{{k}}:{{pct}}:{{p0}}]{{/l}}|{{d}}|{{{r}}}|{{{br}}}|{{u}}|{{v}}', {
      o: { type: 'object', item: { a: { type: 'text', default: 'A' }, b: { type: 'color', default: '#000' } } }, p: { type: 'object', item: { q: { type: 'text' } } },
      l: { type: 'list', skipNonObjects: true, keepIf: { k: { not: [''] } }, share: { of: 'n', as: 'pct', format: { p0: 0 } }, item: { k: { type: 'text' }, n: { type: 'number', min: 0 } } },
      x: { type: 'number', default: 4.3 }, d: { type: 'calc', of: 'x', div: 5, mul: 100, transform: 'fmtNum', decimals: 1 },
      r: { type: 'number', parse: 'int', key: 'rr', default: 3, transform: 'repeat', text: '&#9733;' },
      br: { type: 'text', transform: 'br' }, u: { type: 'text', transform: 'contactUrl' }, v: { type: 'text', key: 'vv', transform: 'contactUrl' } },
      { o: { b: 'red;}' }, p: 'junk', l: ['junk', 7, null, ['list'], { k: 'a', n: 1 }, { k: '', n: 50 }, { k: 'b', n: 2 }], rr: '2', br: ' one \n\n  two<3 \r\n', u: 'me@site.com', vv: 'site.com/x' }),
    T('{{#c}}[{{value}}:{{{d}}}]{{/c}}|{{#hi}}H{{/hi}}{{#lo}}L{{/lo}}{{#mid}}M{{/mid}}|{{#t0}}a{{/t0}}{{#t1}}b{{/t1}}{{#t2}}c{{/t2}}{{#t3}}d{{/t3}}|{{r}}|{{m1}}|{{m2}}', {
      c: { type: 'choices', options: [{ value: 'x', data: { d: '<i>X</i>' } }, { value: 'y', data: { d: 'Y' } }, { value: 'z', data: { d: 'Z' } }] },
      n: { type: 'number' }, hi: { type: 'flag', when: { n: { gt: 55 } } }, lo: { type: 'flag', when: { n: { lt: 25 } } }, mid: { type: 'flag', when: { n: { gt: 25, lt: 75 } } },
      t0: { type: 'bool', default: true, phpTruthy: true }, t1: { type: 'bool', default: true, phpTruthy: true }, t2: { type: 'bool', default: true, phpTruthy: true }, t3: { type: 'bool', default: false, phpTruthy: true },
      r: { type: 'text', transform: 'replace', from: 'T', to: ' ' }, m1: { type: 'text', transform: 'mediaSrc' }, m2: { type: 'text', transform: 'mediaSrc' } },
      { c: ['z', 'x', 7, 'nope', 'x'], n: 60, t1: 0, t2: 'no', r: '2030-01-01T10:00', m1: ' /media/a.mp3 ', m2: 'data:audio/mp3;base64,AA' }),
    T('{{i}}|{{m}}|{{x}}|{{e}}', { i: { type: 'text', transform: 'initials' }, m: { type: 'text', transform: 'mailto' }, x: { type: 'text', key: 'm', transform: 'mailto' }, e: { type: 'text', transform: 'extUrl' } },
      { i: '  émile   zola  rossi', m: 'bad@address', e: '//linkedin.com/in/x' }),
  );
  const phpOut = JSON.parse(execFileSync('php', [fileURLToPath(new URL('./render_def.php', import.meta.url))], { input: JSON.stringify(cases) }).toString());
  let ok = 0;
  cases.forEach((c, i) => {
    let js;
    try { js = renderDefBlock(c.def, c.block, { innerId: 'b1', fields: false }); } catch { js = 'ERROR'; }
    if (js === phpOut[i]) ok++;
    else { failures++; console.error(`✗ template case ${i}: JS=${JSON.stringify(js)}  PHP=${JSON.stringify(phpOut[i])}`); }
  });
  console.log(`✓ template language and value cleaning: ${ok} of ${cases.length} cases the same in both engines`);
  const expect = (i, want) => { const js = (() => { try { return renderDefBlock(cases[i].def, cases[i].block, { innerId: 'b1' }); } catch { return 'ERROR'; } })(); if (js !== want) { failures++; console.error(`✗ case ${i} gives ${JSON.stringify(js)}, expected ${JSON.stringify(want)}`); } };
  expect(0, '&lt;b&gt;&#039;&amp;&quot;|&lt;b&gt;&#039;&amp;&quot;|<i>x</i>|&lt;i&gt;x&lt;/i&gt;');   // {{{ }}} prints raw only trusted HTML
  expect(1, '[011:a/T][12:d/T][231:c/T]');   // @first / @last print 1 or nothing
  expect(2, 'noneno');
  expect(3, 'B:b:<u>b</u>:&lt;u&gt;b&lt;/u&gt;');
  expect(4, '1');
  expect(5, '10 4 1.01 1000000000000000 0 7');
  expect(6, 'TO');
  expect(7, 'var(--cc-color-a, #fff)|#111||def|àèì|x');
  expect(8, 'center|dflt||text-align: center; color: #f00; | a&lt;b|b1');
  expect(9, '1');
  for (const i of [10, 11, 12, 13]) expect(i, 'ERROR');
  expect(14, '[<b>x</b>|&lt;b&gt;x&lt;/b&gt;][7|7][|]<a><b>');
  expect(15, '<script>admin()</script>|&lt;script&gt;admin()&lt;/script&gt;');
  expect(16, '18 1');
  expect(17, '{{BASE_URL}}chi-siamo/|a%27%28b%29.jpg|a+b%26c%2F%C3%A9%7E%21%2A%27%28%29|one<br />\ntwo<br />\r\n&lt;3|https://www.youtube.com/embed/dQw4w9WgXcQ|https://player.vimeo.com/video/123456|1,234,567.88');
  expect(18, null);   // renderIf: nothing at all
  expect(19, '7 15 15 7 1');
  expect(20, 'ERROR'); expect(21, 'ERROR');   // a literal { right before a tag is refused
  expect(22, '.x{y}');
  expect(23, '[hi]S|3 2|AY');
  expect(24, '<A|#000>P|[a:33.3333333333:33][b:66.6666666667:67]|86.0|&#9733;&#9733;|one<br>two&lt;3|mailto:me@site.com|https://site.com/x');
  expect(25, '[x:<i>X</i>][z:Z]|HM|ac|2030-01-01 10:00|/media/a.mp3|');
  expect(26, 'éz|||https://linkedin.com/in/x');
}

console.log(`\n${failures === 0 ? 'PARITY OK' : failures + ' blocks differ'}`);
process.exit(failures === 0 ? 0 : 1);
