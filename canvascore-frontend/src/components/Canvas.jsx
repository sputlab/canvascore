import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { normalizePalette, paletteVars } from '../editor/palette';
import { normalizeTypography, typeCanvasCss, typeFontsUsed } from '../render/typography.mjs';
import { normalizeKit, kitCss } from '../render/kit.mjs';
import SortableBlock from './SortableBlock';
import { packageCss } from '../editor/blockPackages';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { __ } from '../i18n/index.js';
import { dndAccessibility } from '../i18n/dnd.js';

// The site's effects CSS. In the editor, entrance animations and looping motion stay still
// (blocks visible, text easy to edit) and play only on "Preview" (previewEffects.js); hovers stay live.
const EFFECTS_CSS = (typeof __EFFECTS_CSS__ !== 'undefined' ? __EFFECTS_CSS__ : '') + `
.cc-canvas .cc-reveal:not(.is-visible) { opacity: 1; }
.cc-canvas [class*="cc-loop-"]:not(.cc-fx-preview) { animation: none !important; }`;

// Brand color and font of the site (Global Options), loaded once; the font also from Google Fonts.
function useSiteLook() {
  const [look, setLook] = useState({ brandColor: '#3b82f6', fontFamily: 'Inter' });
  useEffect(() => {
    let alive = true;
    fetch('api.php?action=get_settings')
      .then((res) => res.json())
      .then((data) => {
        if (!alive || !data || typeof data !== 'object') return;
        // The published pages use Inter when no site font is chosen (rebuild_all.php): the canvas does the same
        const fontFamily = (typeof data.fontFamily === 'string' ? data.fontFamily.replace(/[^A-Za-z0-9 -]/g, '') : '').trim() || 'Inter';
        const palette = normalizePalette(data);
        useStore.getState().setPalette(palette);
        useStore.getState().setTypography(normalizeTypography(data));
        useStore.getState().setKit(normalizeKit(data));
        setLook({ brandColor: palette[0].value, fontFamily });
        // the site font and the fonts of the text styles
        const families = [fontFamily, ...typeFontsUsed(normalizeTypography(data)).filter((f) => f !== fontFamily)];
        if (!document.getElementById('cc-canvas-font')) {
          const link = document.createElement('link');
          link.id = 'cc-canvas-font'; link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f)}:wght@300;400;600;700;900`).join('&')}&display=swap`;
          document.head.appendChild(link);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return look;
}

export default function Canvas() {
  const { blocks, moveBlock, activePage, viewport, setSelectedBlockId } = useStore();
  const palette = useStore((s) => s.palette);
  const typography = useStore((s) => s.typography);
  const kit = useStore((s) => s.kit);
  const pageMode = useStore((s) => s.activePage);
  const site = useSiteLook();

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      moveBlock(active.id, over.id);
    }
  };

  const isBoxed = activePage?.layout === 'boxed';
  // Sizes include the padding, like the published page's wrapper (box-sizing: border-box): a boxed page of 1200px
  // has 1160px for its blocks on the site, and the same here. Phone and tablet previews add their 12px frame
  // outside the device width.
  let canvasWidth = '100%';
  if (viewport === 'mobile') canvasWidth = 'calc(375px + 24px)';
  else if (viewport === 'tablet') canvasWidth = 'calc(768px + 24px)';

  const wrapperStyle = {
    width: canvasWidth,
    maxWidth: isBoxed && viewport === 'desktop' ? (activePage?.boxed_width || '1200px') : '100%',
    margin: '0 auto',
    padding: isBoxed ? '0 20px' : '0',
    boxSizing: 'border-box',
    // Phone/tablet: the blocks' width rules are turned into container queries on this box (editor/devicePreview.js)
    ...(viewport !== 'desktop' ? { containerType: 'inline-size', containerName: 'cc-canvas' } : {}),
    minHeight: '100vh',
    backgroundColor: activePage?.bg_color || '#ffffff',
    transition: 'width 0.3s ease, max-width 0.3s ease',
    boxShadow: viewport !== 'desktop' ? '0 0 50px rgba(0,0,0,0.5)' : 'none',
    border: viewport !== 'desktop' ? '12px solid #0f172a' : 'none',
    borderRadius: viewport !== 'desktop' ? '30px' : '0',
    overflow: 'hidden',
    position: 'relative',
    // Same variables as master.html, so brand-colored buttons and the site font match the published page
    // the global colours (Global Options): the primary one is the brand colour
    ...paletteVars(palette),
    '--brand-color': palette && palette[0] ? palette[0].value : site.brandColor,
    '--font-family': `'${site.fontFamily}', sans-serif`
  };

  // What the canvas shows here: the design of a collection, or an item built from it (read-only layout)
  const banner = pageMode && pageMode.__design
    ? __("The design of this collection: every item page is built from these blocks. Type {{field:key}} to show a field of each item, or {{item:title}} for its title. Publish the site to update the items.")
    : pageMode && pageMode.__popup
      ? __("You are editing a popup: these blocks appear in a window over your pages when its trigger fires. Use “Preview the popup” in the panel to see it as visitors will, and set when it appears there too.")
    : pageMode && pageMode.__locked
      ? __("This item is built from its collection's design, so its layout is read-only here. Change the layout in Collections › Design; the fields and settings of the item are edited in the panel.")
      : null;
  return (
    <div style={{ padding: viewport !== 'desktop' ? '40px 0' : '0', minHeight: '100%', display: 'flex', justifyContent: 'center', flexDirection: 'column' }} onClick={() => setSelectedBlockId(null)}>
      {banner && <div role="status" style={{ maxWidth: 1100, width: '100%', alignSelf: 'center', boxSizing: 'border-box', padding: '10px 14px', margin: '12px 0 0', background: '#0c4a6e', color: '#e0f2fe', borderRadius: 10, fontSize: 13, lineHeight: 1.45 }}>{banner}</div>}
      <style>{EFFECTS_CSS}</style>
      <style data-cc-packages>{packageCss().replace(/\{\{BASE_URL\}\}canvascore-blocks\//g, '../canvascore-blocks/')}</style>
      {/* the text styles of the device being edited (Global Options › Text styles) */}
      <style>{typeCanvasCss(typography, viewport) + kitCss(kit || {}, '.cc-canvas')}</style>
      <div className="cc-canvas" style={wrapperStyle} onClick={(e) => {
        // Clicking the empty area of the page clears the selection
        if(e.target === e.currentTarget) setSelectedBlockId(null);
      }}>
        <DndContext accessibility={dndAccessibility} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map(block => (
              <SortableBlock key={block.id} block={block} />
            ))}
          </SortableContext>
        </DndContext>
        <div style={{ height: '250px', width: '100%', clear: 'both', pointerEvents: 'none' }}></div>
      </div>
    </div>
  );
}
