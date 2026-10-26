import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../store/useStore';
import { langOf } from '../editor/languages';
import { InlineRegions } from '../editor/RichText';
import { Crown } from 'lucide-react';
import { renderBlock, blockRoot, effectiveStyles, hiddenOn } from '../render/renderBlock.mjs';
import { fillLogosMarquee } from '../render/logosMarquee.mjs';
import { initCodeBlock, initShareBlock, initTocBlock, initCalcBlock, initWizardBlock, initVideoBlock, initAudioBlock, initAnnounceBlock } from '../render/blockRuntime.mjs';
import { safeHtml } from '../utils/safeHtml';
import { forViewport } from '../editor/devicePreview';
import { blockLabel, CONTAINER_TYPES } from '../editor/blockCatalog';
import { bindBlock, contextFor } from '../render/itemBinding.mjs';
import BlockHandles from './BlockHandles';

const CONTAINERS = CONTAINER_TYPES;
// Blocks whose canonical HTML is interactive in the canvas too (native details/radio, no JS):
// a click opens/switches the tab AND selects the block (the event bubbles up to the frame).
const INTERACTIVE = ['ACCORDION', 'TABS', 'BEFORE_AFTER', 'HOTSPOTS', 'CODE_SNIPPET', 'PRICE_CALCULATOR', 'WIZARD', 'AUDIO_PLAYER'];

// Properties that define how the block is SIZED/POSITIONED as an item of its parent:
// they go on the frame (so flex/grid behave as on the site), not duplicated in the content.
const SIZING_KEYS = ['width', 'maxWidth', 'minWidth', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'gridColumn', 'gridRow', 'order'];

// A Button block's styles are the button's own (the published page puts them on the <a>, inside a full-width
// wrapper): they stay on it untouched, or the forced width below would stretch every button across the canvas.
const OWN_STYLE_TYPES = ['BUTTON'];
function splitStyles(styles = {}, type = '') {
  if (OWN_STYLE_TYPES.includes(type)) return { outer: {}, inner: { ...styles } };
  const outer = {};
  const inner = { ...styles };
  for (const k of SIZING_KEYS) {
    if (styles[k] !== undefined && styles[k] !== '') outer[k] = styles[k];
    delete inner[k];
  }
  // The content fills the frame (height/minHeight stay intrinsic to the block)
  inner.width = '100%';
  inner.margin = '0';
  if (styles.maxWidth !== undefined) inner.maxWidth = 'none';
  inner.minWidth = 0;
  return { outer, inner };
}

// Rich text fields edited in place on the canvas, with their toolbar ('basic' for titles, 'full' for body text)
const TEXT_FIELDS = {
  TEXT: { text: 'full' },
  HERO: { title: 'basic', subtitle: 'basic' },
  IMAGE_TEXT: { text: 'full' },
  FORM: { title: 'basic' },
};

function canonicalHtml(block, viewport) {
  // a package's images live in the site folder canvascore-blocks/, next to the admin folder
  return forViewport(renderBlock(block).replace(/\{\{BASE_URL\}\}canvascore-blocks\//g, '../canvascore-blocks/').replace(/\{\{BASE_URL\}\}/g, '#'), viewport);
}

export default function SortableBlock({ block: rawBlock, isMasterPreview = false }) {
  const { selectedBlockId, setSelectedBlockId, updateBlock, viewport, masters } = useStore();
  // The block as it is shown: its dynamic values bound to the page (the design's placeholders, an item's values).
  // Edits always work on rawBlock, so a placeholder is never saved back into the content.
  const page = useStore((s) => s.activePage);
  const bindCtx = contextFor(page);
  const block = bindBlock(rawBlock, bindCtx);
  // An item built from its collection's design: its layout is read-only here (the fields and the settings are edited)
  const locked = !!(page && page.__locked);
  const revealBlockId = useStore((s) => s.revealBlockId);
  const fieldDefs = useStore((s) => s.activePage && s.activePage.__fieldDefs);
  const siteLangs = useStore((s) => s.languages);
  const frameRef = useRef(null);
  const isSelected = selectedBlockId === block.id && !isMasterPreview;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: block.id,
    disabled: isMasterPreview || locked,
  });

  // A block that was just added from the Add panel scrolls into view (once)
  useEffect(() => {
    if (revealBlockId !== block.id || !frameRef.current) return;
    const el = frameRef.current;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    useStore.setState({ revealBlockId: null });
  }, [revealBlockId, block.id]);

  // Slider animation (fade/slide) in the editor: drives the injected canonical DOM
  const sliderRef = useRef(null);
  useEffect(() => {
    if (block.type !== 'SLIDER') return;
    const root = sliderRef.current;
    if (!root) return;
    const slides = root.querySelectorAll('.cc-slide');
    if (!slides || slides.length < 2) return;
    const isFade = block.content?.effect === 'fade';
    const delay = Math.max(1200, parseInt(block.content?.delay, 10) || 3000);
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % slides.length;
      if (isFade) {
        slides.forEach((s, k) => { s.style.opacity = k === i ? '1' : '0'; });
      } else {
        const track = root.querySelector('.cc-slides');
        if (track) track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
      }
    }, delay);
    return () => clearInterval(id);
  }, [block]);

  // Before/After: in the editor the injected HTML's <script>s don't run, so the slider is wired up here
  // (same behavior as the published script: the slider sets --pos).
  // htmlRef: the element holding the block's injected HTML
  const htmlRef = useRef(null);
  useEffect(() => {
    if (block.type !== 'BEFORE_AFTER') return undefined;
    const root = htmlRef.current && htmlRef.current.querySelector('.cc-ba');
    const range = root && root.querySelector('.cc-ba-range');
    if (!range) return undefined;
    const set = () => root.style.setProperty('--pos', range.value + '%');
    range.addEventListener('input', set);
    return () => range.removeEventListener('input', set);
  }, [block]);

  // Logo Cloud scrolling strip: the logos repeat to cover the strip, as on the published page (CC_LOGOS_SCRIPT)
  useEffect(() => {
    if (block.type !== 'LOGOS' || block.content?.layout !== 'marquee') return undefined;
    return fillLogosMarquee(htmlRef.current && htmlRef.current.querySelector('.cc-logos'), block.content?.speed);
  }, [block]);

  // Code Snippet, Share Bar, Table of Contents, Price Calculator and Multi-step Form: the published scripts don't run on the canvas, so the same
  // functions (src/render/blockRuntime.mjs) are run here
  useEffect(() => {
    if (block.type === 'CODE_SNIPPET') initCodeBlock(htmlRef.current && htmlRef.current.querySelector('.cc-code'));
    else if (block.type === 'SHARE_BAR') initShareBlock(htmlRef.current && htmlRef.current.querySelector('.cc-share'));
    else if (block.type === 'PRICE_CALCULATOR') initCalcBlock(htmlRef.current && htmlRef.current.querySelector('.cc-calc'));
    else if (block.type === 'WIZARD') initWizardBlock(htmlRef.current && htmlRef.current.querySelector('.cc-wizard'));
    else if (block.type === 'VIDEO_HERO') initVideoBlock(htmlRef.current && htmlRef.current.querySelector('.cc-vhero'));
    else if (block.type === 'AUDIO_PLAYER') initAudioBlock(htmlRef.current && htmlRef.current.querySelector('.cc-audio'));
    else if (block.type === 'ANNOUNCEMENT_BAR') initAnnounceBlock(htmlRef.current && htmlRef.current.querySelector('.cc-announce'));
    else if (block.type === 'TABLE_OF_CONTENTS') return initTocBlock(htmlRef.current && htmlRef.current.querySelector('.cc-toc'));
    return undefined;
  }, [block]);

  // Where the click that selected a text block landed: the caret is placed there once it becomes editable
  const [clickPoint, setClickPoint] = useState(null);
  const handleClick = (e) => {
    if (isMasterPreview) return;
    e.stopPropagation();
    if (locked) return;
    if (!isSelected && TEXT_FIELDS[block.type]) setClickPoint({ x: e.clientX, y: e.clientY });
    setSelectedBlockId(block.id);
  };
  const commitField = useCallback((key, value) => {
    updateBlock(rawBlock.id, { content: { ...rawBlock.content, [key]: value } });
  }, [rawBlock.id, rawBlock.content, updateBlock]);

  // Right-click: the block is selected and its menu opens (the innermost block of a container gets it)
  const handleContextMenu = (e) => {
    if (isMasterPreview || locked) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedBlockId(block.id);
    useStore.getState().openContextMenu(e.clientX, e.clientY, block.id);
  };

  const handleContentChange = (key, value) => {
    updateBlock(rawBlock.id, { content: { ...rawBlock.content, [key]: value } });
  };

  // The previewed device's styles (desktop + tablet overrides + phone overrides): the canvas shows them directly,
  // so the block renders without its device media rules (those are for the published page)
  const { outer, inner } = splitStyles(effectiveStyles(block, viewport), block.type);
  const innerBlock = { ...block, styles: inner, responsive: undefined };
  const DEVICE_NAMES = { desktop: 'desktop', tablet: 'tablet', mobile: 'phone' };
  const hiddenHere = !isMasterPreview && hiddenOn(block, viewport);

  // Frame: neutral + sizing/positioning properties (behaves like the item in its parent)
  const wrapperStyle = {
    position: 'relative',
    transform: CSS.Translate.toString(transform),
    // Hidden on this device: still shown (so it can be selected and edited), faded and marked
    opacity: isDragging ? 0.6 : hiddenHere ? 0.35 : 1,
    outline: isSelected ? '2px solid #38bdf8' : hiddenHere ? '1px dashed #94a3b8' : 'none',
    outlineOffset: '-2px',
    cursor: isMasterPreview ? 'inherit' : (isSelected ? 'default' : 'pointer'),
    zIndex: isDragging ? 1000 : 1,
    boxSizing: 'border-box',
    ...outer,
    minHeight: CONTAINERS.includes(block.type) ? (outer.minHeight || '40px') : outer.minHeight,
  };

  const innerId = block.content?.customId || block.id;
  const innerClass = block.content?.customClass || '';

  const dragHandle = isSelected && (
    <div {...attributes} {...listeners} style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: '#38bdf8', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold', cursor: 'grab', zIndex: 50, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
      {blockLabel(block.type)}
    </div>
  );

  const emptyPlaceholder = (label) => (
    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', border: '1px dashed rgba(148, 163, 184, 0.4)', borderRadius: '8px', fontSize: '11px', margin: '10px' }}>{label}</div>
  );

  const renderBody = () => {
    // MASTER
    if (block.type === 'MASTER') {
      const masterInfo = masters.find(m => m.id === block.content.masterId);
      let masterRealContent = null;
      if (masterInfo) { try { masterRealContent = JSON.parse(masterInfo.content_json); } catch { /* noop */ } }
      return (
        <div id={innerId} className={`cc-master-wrapper ${innerClass}`} style={{ outline: isSelected ? '2px solid #fcd34d' : '1px solid transparent', position: 'relative', width: '100%' }}>
          {isSelected && (
            <div style={{ position: 'absolute', top: 0, right: 0, background: '#fcd34d', color: '#78350f', fontSize: '10px', padding: '4px 8px', fontWeight: 'bold', zIndex: 10, borderBottomLeftRadius: '6px' }}>👑 GLOBAL MASTER</div>
          )}
          <div style={{ pointerEvents: 'none' }}>
            {masterRealContent ? (
              <SortableBlock block={masterRealContent} isMasterPreview={true} />
            ) : (
              <div style={{ padding: '40px 20px', background: '#fef3c7', border: '2px dashed #f59e0b', borderRadius: '12px', textAlign: 'center', color: '#92400e' }}>
                <Crown size={32} color="#d97706" style={{ margin: '0 auto 10px', display: 'block' }} />
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{block.content.name || 'Master Component'}</h3>
                <p style={{ margin: 0, fontSize: '13px', opacity: 0.8 }}>⚠ Content not found.</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // COLLECTION_LIST: dynamic block (the compiler inserts the real items at build time)
    if (block.type === 'COLLECTION_LIST') {
      const c = block.content || {};
      const cols = Math.max(1, parseInt(c.columns, 10) || 3);
      return (
        <div style={{ padding: '14px', pointerEvents: isMasterPreview ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#64748b', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>{'\uD83D\uDCDA'} Collection List</span>
            <span style={{ color: '#38bdf8' }}>{c.collectionName || c.collectionSlug || 'choose a collection \u2192'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px' }}>
            {Array.from({ length: Math.min(cols, Math.max(1, parseInt(c.limit, 10) || cols)) }).map((_, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                {c.showCover !== false && <div style={{ aspectRatio: '16/9', background: '#e2e8f0' }} />}
                <div style={{ padding: '14px' }}>
                  {c.showDate !== false && <div style={{ height: '8px', width: '40%', background: '#e2e8f0', borderRadius: '4px', marginBottom: '8px' }} />}
                  <div style={{ height: '12px', width: '75%', background: '#cbd5e1', borderRadius: '4px' }} />
                  {c.showExcerpt !== false && <div style={{ height: '8px', width: '95%', background: '#e2e8f0', borderRadius: '4px', marginTop: '8px' }} />}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>Live items are generated on publish.</div>
        </div>
      );
    }

    // ITEM_FIELD: the page shows the value only on a collection item; the canvas shows which field it is
    if (block.type === 'ITEM_FIELD') {
      const d = (fieldDefs || []).find((x) => x.id === block.content?.field);
      return emptyPlaceholder(d ? `Item field: ${d.label}. Shown on each collection item page.` : 'Item field: choose a field in the settings panel.');
    }

    // ITEM_TERMS: the categories and tags of the item being published (shown on its page)
    if (block.type === 'ITEM_TERMS') return emptyPlaceholder('Categories and tags of the item, shown on each collection item page.');

    // LANGUAGE_SWITCHER: the links are made when the site is published (they depend on the page); the canvas shows the languages of the site
    if (block.type === 'LANGUAGE_SWITCHER') {
      const c = block.content || {};
      const list = siteLangs && siteLangs.enabled && Array.isArray(siteLangs.list) && siteLangs.list.length >= 2 ? siteLangs.list : null;
      if (!list) return emptyPlaceholder('Language switcher: add at least two languages in Administration › Languages.');
      const cur = langOf(page, siteLangs);   // the language of the page being edited
      const text = (l) => (c.labels === 'code' ? l.code.toUpperCase() : l.name);
      const shown = list.filter((l) => c.showCurrent !== false || l.code !== cur);
      return (
        <div style={{ padding: '8px 0', pointerEvents: isMasterPreview ? 'auto' : 'none' }} data-cc-lang-preview>
          {c.style === 'dropdown'
            ? <select aria-label="Language" defaultValue={cur} style={{ font: 'inherit', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a' }}>{shown.map((l) => <option key={l.code} value={l.code}>{text(l)}</option>)}</select>
            : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>{shown.map((l) => <li key={l.code} style={{ fontWeight: l.code === cur ? 700 : 400 }}>{text(l)}</li>)}</ul>}
        </div>
      );
    }

    // RELATED: the items that point to the collection item being published (listed on the published item page)
    if (block.type === 'RELATED') {
      const cname = block.content?.collectionName;
      return emptyPlaceholder(cname ? `Related items from ${cname}. Shown on each collection item page.` : 'Related items: choose a collection and a reference field in the settings panel.');
    }

    // CONTAINER: canonical root (with sizing neutralized) + interactive React children
    if (CONTAINERS.includes(block.type)) {
      const r = blockRoot(innerBlock);
      const style = { ...r.style, boxSizing: 'border-box' };
      if (block.type === 'CSS_GRID' && viewport === 'mobile') style.gridTemplateColumns = '1fr';
      const kids = block.children || [];
      const childIds = kids.map(c => c.id);
      const children = kids.length > 0
        ? <SortableContext items={childIds} strategy={verticalListSortingStrategy}>{kids.map(c => <SortableBlock key={c.id} block={c} isMasterPreview={isMasterPreview} />)}</SortableContext>
        : emptyPlaceholder(`Empty ${blockLabel(block.type)}. Select it and add blocks from the Add tab, or drop them here in Layers.`);
      return React.createElement(r.tag, { id: r.id, className: r.className, style }, children);
    }

    // Selected text blocks: the block's own HTML with its text fields editable in place, so the text keeps
    // the size, spacing and margins it has on the published page (the toolbar floats above it)
    if (TEXT_FIELDS[block.type] && isSelected && !isMasterPreview && !bindCtx) {
      return (
        <InlineRegions html={forViewport(renderBlock(innerBlock, { fields: true }), viewport)} variants={TEXT_FIELDS[block.type]}
          onCommit={commitField} initialPoint={clickPoint} style={{ width: '100%' }} />
      );
    }
    if (block.type === 'HTML' && isSelected && !isMasterPreview && useStore.getState().userRole === 'admin') {
      return (
        <textarea rows="6" value={rawBlock.content.code || ''} onChange={(e) => handleContentChange('code', e.target.value)} onClick={(e) => e.stopPropagation()}
          style={{ width: '100%', padding: '12px', fontFamily: 'monospace', fontSize: '13px', background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', borderRadius: '6px', boxSizing: 'border-box' }} />
      );
    }

    // SLIDER: canonical HTML + animation driven via ref
    if (block.type === 'SLIDER') {
      return (
        <div ref={sliderRef} style={{ pointerEvents: isMasterPreview ? 'auto' : 'none', width: '100%' }} dangerouslySetInnerHTML={{ __html: safeHtml(canonicalHtml(innerBlock, viewport)) }} />
      );
    }

    // Everything else (and unselected editables): canonical HTML = identical to the site
    return (
      <div ref={htmlRef} style={{ pointerEvents: (isMasterPreview || INTERACTIVE.includes(block.type)) ? 'auto' : 'none', width: '100%' }} dangerouslySetInnerHTML={{ __html: safeHtml(canonicalHtml(innerBlock, viewport)) }} />
    );
  };

  return (
    <div ref={(el) => { setNodeRef(el); frameRef.current = el; }} style={wrapperStyle} onClick={handleClick} onContextMenu={handleContextMenu}>
      {dragHandle}
      {isSelected && !isDragging && !locked && block.type !== 'MASTER' && <BlockHandles block={rawBlock} frameRef={frameRef} />}
      {hiddenHere && <div className="cc-hidden-badge" style={{ position: 'absolute', top: 4, right: 4, zIndex: 40, background: '#334155', color: '#f8fafc', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', pointerEvents: 'none' }}>Hidden on {DEVICE_NAMES[viewport]}</div>}
      {block.content?.customCss && <style>{String(block.content.customCss).replace(/__THIS__/g, `#${innerId}`)}</style>}
      {renderBody()}
    </div>
  );
}
