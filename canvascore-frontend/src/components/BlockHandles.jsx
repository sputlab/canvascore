// On-canvas handles of the selected block: drag its margin (orange, outside its edges), its padding (green, inside
// its edges), its width (right edge) and its height (bottom edge). The values are written for the device being
// previewed, like the Style tab. Arrow keys nudge a focused handle (Shift: 10 px). Maths: src/editor/handles.js.
import React, { useEffect, useRef, useState } from 'react';
import { useStore, findNodeById } from '../store/useStore';
import { deviceStylePatch } from '../editor/deviceStyles';
import { effectiveStyles } from '../render/renderBlock.mjs';
import { HANDLES, boxSides, sidePx, setBoxSide, dragValue } from '../editor/handles';
import { __ } from '../i18n/index.js';

const COLORS = { margin: '#f59e0b', padding: '#22c55e', size: '#38bdf8' };
// Where each handle sits on the frame (the frame is position: relative)
const PLACE = {
  'margin-top': { top: -6, left: '50%', x: '-50%', cursor: 'ns-resize' },
  'margin-bottom': { bottom: -6, left: '50%', x: '-50%', cursor: 'ns-resize' },
  'margin-left': { left: -6, top: '50%', y: '-50%', cursor: 'ew-resize' },
  'margin-right': { right: -6, top: '50%', y: '-50%', cursor: 'ew-resize' },
  'padding-top': { top: 4, left: '50%', x: '-50%', cursor: 'ns-resize' },
  'padding-bottom': { bottom: 4, left: '50%', x: '-50%', cursor: 'ns-resize' },
  'padding-left': { left: 4, top: '50%', y: '-50%', cursor: 'ew-resize' },
  'padding-right': { right: 4, top: '50%', y: '-50%', cursor: 'ew-resize' },
  width: { right: -6, top: '25%', y: '-50%', cursor: 'ew-resize' },
  height: { bottom: -6, left: '25%', x: '-50%', cursor: 'ns-resize' },
};

export default function BlockHandles({ block, frameRef }) {
  const viewport = useStore((s) => s.viewport);
  const [drag, setDrag] = useState(null);   // { id, text } while a handle is dragged
  const stop = useRef(null);
  // stop a drag that is still running when the handles go away (another block selected, the tab changed)
  useEffect(() => () => { if (stop.current) stop.current(); }, []);

  // The block as it is now (not the copy this render was made from), and the value of a handle on it
  const live = () => findNodeById(useStore.getState().blocks, block.id);
  const valueOf = (b, spec) => {
    if (spec.kind === 'size') return null;
    return sidePx(boxSides(effectiveStyles(b, viewport)[spec.kind])[spec.side]);
  };
  // Writes a handle's new value: a side of the box, or the width or height in pixels, for the device being edited
  const apply = (spec, n) => {
    const b = live();
    if (!b) return;
    const patch = spec.kind === 'size'
      ? { [spec.prop]: `${Math.round(n)}px` }
      : { [spec.kind]: setBoxSide(effectiveStyles(b, viewport)[spec.kind], spec.side, n) };
    useStore.getState().updateBlock(b.id, deviceStylePatch(b, viewport, patch));
  };
  // The size of a handle now: a box side, or the frame's width or height on the canvas
  const current = (spec) => {
    if (spec.kind !== 'size') return valueOf(live() || block, spec);
    const el = frameRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.round(spec.prop === 'width' ? r.width : r.height);
  };

  const startDrag = (e, spec) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (stop.current) stop.current();
    useStore.getState().breakUndoMerge();   // this drag is one undo step
    const origin = spec.axis === 'x' ? e.clientX : e.clientY;
    const start = current(spec);
    const move = (ev) => {
      const offset = (spec.axis === 'x' ? ev.clientX : ev.clientY) - origin;
      const n = dragValue(start, offset, spec.sign);
      apply(spec, n);
      setDrag({ id: spec.id, text: `${spec.label} ${Math.round(n)}px` });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stop.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    stop.current = end;
  };

  const onKey = (e, spec) => {
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const dir = keys[e.key];
    if (!dir) return;
    if ((spec.axis === 'x') !== (dir[0] !== 0)) return;   // only the arrows along the handle's direction
    e.preventDefault();
    e.stopPropagation();
    useStore.getState().breakUndoMerge();   // one key press is one undo step
    const step = (e.shiftKey ? 10 : 1) * (dir[0] || dir[1]) * spec.sign;
    const n = dragValue(current(spec), step, 1);
    apply(spec, n);
    setDrag({ id: spec.id, text: `${spec.label} ${n}px` });
  };

  return (
    <>
      {HANDLES.map((spec) => {
        const place = PLACE[spec.id];
        const color = COLORS[spec.kind];
        const transform = [place.x && `translateX(${place.x})`, place.y && `translateY(${place.y})`].filter(Boolean).join(' ') || undefined;
        const pos = Object.fromEntries(Object.entries(place).filter(([k]) => !['x', 'y', 'cursor'].includes(k)));
        const cursor = place.cursor;
        const active = drag && drag.id === spec.id;
        return (
          <div key={spec.id} className="cc-block-handle" data-handle={spec.id} role="slider" tabIndex={0}
            aria-label={__("{0}. Drag, or use the arrow keys", spec.label)} title={spec.label}
            onPointerDown={(e) => startDrag(e, spec)} onKeyDown={(e) => onKey(e, spec)} onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', ...pos, transform, width: 10, height: 10, borderRadius: 3, background: color, border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(15,23,42,.45)', cursor, zIndex: 30, touchAction: 'none', boxSizing: 'border-box', outline: active ? '2px solid #0f172a' : 'none' }}>
            {active && (
              <span style={{ position: 'absolute', left: 14, top: -4, whiteSpace: 'nowrap', background: '#0f172a', color: '#f8fafc', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, pointerEvents: 'none' }}>
                {drag.text}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
