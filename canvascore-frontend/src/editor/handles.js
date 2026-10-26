import { __ } from '../i18n/index.js';
// On-canvas handles of the selected block: drag a margin edge (outside), a padding edge (inside), or the width and
// height. The maths is here, apart from the pointer code: a box value ("10px", "0 auto", "8px 16px 4px") is read as its
// four sides [top, right, bottom, left], and dragging one side writes only that side. An "auto" side stays "auto"
// (a centred block keeps its centring when its padding is dragged; a margin side dragged on purpose becomes pixels).

// One handle per side or size. axis: the pointer direction it reads; sign: how the value follows it.
export const HANDLES = [
  { id: 'margin-top', kind: 'margin', side: 0, axis: 'y', sign: -1, label: __("Margin top") },
  { id: 'margin-right', kind: 'margin', side: 1, axis: 'x', sign: 1, label: __("Margin right") },
  { id: 'margin-bottom', kind: 'margin', side: 2, axis: 'y', sign: 1, label: __("Margin bottom") },
  { id: 'margin-left', kind: 'margin', side: 3, axis: 'x', sign: -1, label: __("Margin left") },
  { id: 'padding-top', kind: 'padding', side: 0, axis: 'y', sign: 1, label: __("Padding top") },
  { id: 'padding-right', kind: 'padding', side: 1, axis: 'x', sign: -1, label: __("Padding right") },
  { id: 'padding-bottom', kind: 'padding', side: 2, axis: 'y', sign: -1, label: __("Padding bottom") },
  { id: 'padding-left', kind: 'padding', side: 3, axis: 'x', sign: 1, label: __("Padding left") },
  { id: 'width', kind: 'size', prop: 'width', axis: 'x', sign: 1, label: __("Width") },
  { id: 'height', kind: 'size', prop: 'height', axis: 'y', sign: 1, label: __("Height") },
];
export const handleById = (id) => HANDLES.find((h) => h.id === id) || null;

// The four sides of a box value as text: [top, right, bottom, left] (1 value: all; 2: vertical, horizontal; 3; 4)
export function boxSides(value) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ['0', '0', '0', '0'];
  const [t, r = t, b = t, l = r] = parts;
  return [t, r, b, l];
}

// A side as a number of pixels for dragging (an "auto" or unreadable side is 0)
export const sidePx = (text) => {
  const n = parseFloat(text);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

// The box value with one side set to n pixels; the other sides are kept as they are
export function setBoxSide(value, side, n) {
  const sides = boxSides(value);
  sides[side] = `${Math.round(n)}px`;
  return sides.join(' ');
}

// The value of a handle at a pointer offset (dx or dy, in pixels) from where the drag started
export const dragValue = (start, offset, sign) => Math.max(0, Math.round(start + offset * sign));
