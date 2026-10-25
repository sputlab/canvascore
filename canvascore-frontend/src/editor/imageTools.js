// Image tools of the media library: the maths of the crop frame and the focal point. Pure functions (the dialog,
// ImageTools.jsx, only draws and listens). A rectangle is { x, y, w, h } in pixels of the image; `nat` is { w, h }.

export const ASPECTS = [
  ['free', 'Free'], ['orig', 'Original shape'], ['1:1', 'Square 1:1'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9 wide'],
  ['4:5', '4:5 portrait'], ['9:16', '9:16 tall'], ['3:1', '3:1 banner'],
];
export const MIN_CROP = 8;
// The formats the server can crop (GD): JPEG, PNG and WebP
export const CROPPABLE = ['jpg', 'jpeg', 'png', 'webp'];

// The width / height an aspect id stands for; null = free
export function aspectValue(id, nat) {
  if (id === 'free') return null;
  if (id === 'orig') return nat.w / nat.h;
  const [a, b] = String(id).split(':').map(Number);
  return a > 0 && b > 0 ? a / b : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rounded = (r, nat) => {
  const w = clamp(Math.round(r.w), 1, nat.w); const h = clamp(Math.round(r.h), 1, nat.h);
  return { x: clamp(Math.round(r.x), 0, nat.w - w), y: clamp(Math.round(r.y), 0, nat.h - h), w, h };
};

// The biggest rectangle of the aspect that fits the image, centred (the whole image when free)
export function initialRect(nat, aspect) {
  if (!aspect) return { x: 0, y: 0, w: nat.w, h: nat.h };
  let w = nat.w; let h = w / aspect;
  if (h > nat.h) { h = nat.h; w = h * aspect; }
  return rounded({ x: (nat.w - w) / 2, y: (nat.h - h) / 2, w, h }, nat);
}

// A new aspect on the current rectangle: same centre, as large as possible inside the image
export function reshape(r, aspect, nat) {
  if (!aspect) return r;
  const cx = r.x + r.w / 2; const cy = r.y + r.h / 2;
  let w = Math.max(r.w, r.h * aspect); let h = w / aspect;
  w = Math.min(w, 2 * Math.min(cx, nat.w - cx), 2 * Math.min(cy, nat.h - cy) * aspect); h = w / aspect;
  if (w < MIN_CROP || h < MIN_CROP) return initialRect(nat, aspect);
  return rounded({ x: cx - w / 2, y: cy - h / 2, w, h }, nat);
}

// Where a handle is anchored: the fixed point of the rectangle and the direction it grows in (-1, 0 or 1 on each axis)
const HANDLES = {
  se: (r) => [r.x, r.y, 1, 1], nw: (r) => [r.x + r.w, r.y + r.h, -1, -1], ne: (r) => [r.x, r.y + r.h, 1, -1], sw: (r) => [r.x + r.w, r.y, -1, 1],
  e: (r) => [r.x, r.y + r.h / 2, 1, 0], w: (r) => [r.x + r.w, r.y + r.h / 2, -1, 0], s: (r) => [r.x + r.w / 2, r.y, 0, 1], n: (r) => [r.x + r.w / 2, r.y + r.h, 0, -1],
};
export const HANDLE_IDS = Object.keys(HANDLES);

// The rectangle after dragging `handle` ('move' or one of HANDLE_IDS) by (dx, dy) pixels from `start`
export function dragRect(start, handle, dx, dy, nat, aspect) {
  if (handle === 'move') return rounded({ ...start, x: clamp(start.x + dx, 0, nat.w - start.w), y: clamp(start.y + dy, 0, nat.h - start.h) }, nat);
  const spec = HANDLES[handle];
  if (!spec) return start;
  const [ax, ay, dirX, dirY] = spec(start);
  let w = dirX === 0 ? start.w : start.w + dirX * dx;
  let h = dirY === 0 ? start.h : start.h + dirY * dy;
  const maxW = dirX === 1 ? nat.w - ax : dirX === -1 ? ax : 2 * Math.min(ax, nat.w - ax);
  const maxH = dirY === 1 ? nat.h - ay : dirY === -1 ? ay : 2 * Math.min(ay, nat.h - ay);
  if (aspect) {
    if (dirX === 0) w = h * aspect; else if (dirY === 0) h = w / aspect; else w = Math.max(w, h * aspect);
    w = Math.max(MIN_CROP, Math.min(w, maxW, maxH * aspect)); h = w / aspect;
  } else {
    w = clamp(w, Math.min(MIN_CROP, maxW), maxW); h = clamp(h, Math.min(MIN_CROP, maxH), maxH);
  }
  return rounded({ x: dirX === 1 ? ax : dirX === -1 ? ax - w : ax - w / 2, y: dirY === 1 ? ay : dirY === -1 ? ay - h : ay - h / 2, w, h }, nat);
}

// A typed size or position: the rectangle with one field changed and the rest kept valid (and in shape when an aspect is set)
export function setField(r, field, value, nat, aspect) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return r;
  if (field === 'x') return rounded({ ...r, x: clamp(v, 0, nat.w - r.w) }, nat);
  if (field === 'y') return rounded({ ...r, y: clamp(v, 0, nat.h - r.h) }, nat);
  if (field === 'w') {
    const w = clamp(v, 1, nat.w - r.x); const h = aspect ? w / aspect : r.h;
    return h > nat.h - r.y ? r : rounded({ ...r, w, h }, nat);
  }
  const h = clamp(v, 1, nat.h - r.y); const w = aspect ? h * aspect : r.w;
  return w > nat.w - r.x ? r : rounded({ ...r, w, h }, nat);
}

// ---- focal point: percentages of the width and the height
export const focalFromPoint = (px, py, box) => ({
  x: Math.round(clamp(((px - box.left) / box.width) * 100, 0, 100) * 10) / 10,
  y: Math.round(clamp(((py - box.top) / box.height) * 100, 0, 100) * 10) / 10,
});
// "30% 70%": what the Image block's Focus setting stores (an object-position)
export const focalCss = (f) => (f && Number.isFinite(f.x) && Number.isFinite(f.y) ? `${+f.x}% ${+f.y}%` : '');
