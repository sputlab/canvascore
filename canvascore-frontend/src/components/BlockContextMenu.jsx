// Right-click menu of a block on the canvas: Duplicate, Move up and down, Copy style, Paste style, Save as template.
// One menu for the whole canvas (the store holds where it opened and for which block). Escape, a click outside, a
// scroll or a resize closes it.
import React, { useEffect, useRef } from 'react';
import { Copy, ClipboardPaste, CopyPlus, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { useStore, findNodeById } from '../store/useStore';
import { notify } from '../ui/notify';
import { blockLabel } from '../editor/blockCatalog';
import { __ } from '../i18n/index.js';

const W = 228;
const H = 262;

// Where a block sits among its siblings: its index and how many siblings it has
function siblingsOf(list, id) {
  const i = (list || []).findIndex((b) => b.id === id);
  if (i >= 0) return { index: i, count: list.length };
  for (const b of list || []) { const r = b.children && siblingsOf(b.children, id); if (r && r.index >= 0) return r; }
  return { index: -1, count: 0 };
}

export default function BlockContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const blocks = useStore((s) => s.blocks);
  const clip = useStore((s) => s.styleClipboard);
  const ref = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => useStore.getState().closeContextMenu();
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!menu) return null;
  const block = findNodeById(blocks, menu.blockId);
  if (!block) return null;
  const { index, count } = siblingsOf(blocks, block.id);
  const label = blockLabel(block.type);
  const st = useStore.getState();
  // one action, then the menu closes
  const run = (fn) => () => { st.closeContextMenu(); fn(); };
  const items = [
    { id: 'duplicate', label: __("Duplicate"), icon: CopyPlus, run: run(() => st.duplicateBlock(block.id)) },
    { id: 'up', label: __("Move up"), icon: ArrowUp, disabled: index <= 0, run: run(() => st.moveBlockBy(block.id, -1)) },
    { id: 'down', label: __("Move down"), icon: ArrowDown, disabled: index < 0 || index >= count - 1, run: run(() => st.moveBlockBy(block.id, 1)) },
    'divider',
    { id: 'copy', label: __("Copy style"), icon: Copy, run: run(() => { st.copyStyle(block.id); notify(__("Style of this {0} copied. Paste it onto another block.", label)); }) },
    { id: 'paste', label: __("Paste style"), icon: ClipboardPaste, disabled: !clip, run: run(() => { st.pasteStyle([block.id]); notify(__("Style pasted.")); }) },
    'divider',
    { id: 'template', label: __("Save as template"), icon: Save, run: run(() => st.saveBlockAsTemplate(block.id)) },
  ];
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - H - 8));
  return (
    <div ref={ref} role="menu" aria-label={__("{0} block menu", label)} className="cc-block-menu"
      style={{ position: 'fixed', left, top, width: W, zIndex: 9500, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6, fontSize: 13 }}>
      <div style={{ padding: '4px 8px 6px', fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '.4px' }}>{label}</div>
      {items.map((it, i) => (it === 'divider'
        ? <div key={`d${i}`} role="separator" style={{ height: 1, background: '#1e293b', margin: '4px 2px' }} />
        : (
          <button key={it.id} type="button" role="menuitem" disabled={it.disabled} onClick={it.run}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', border: 'none', borderRadius: 6, background: 'transparent',
              color: it.disabled ? '#475569' : '#e2e8f0', cursor: it.disabled ? 'default' : 'pointer', textAlign: 'left', font: 'inherit' }}
            onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#1e293b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <it.icon size={14} aria-hidden="true" />{it.label}
          </button>
        )))}
    </div>
  );
}
