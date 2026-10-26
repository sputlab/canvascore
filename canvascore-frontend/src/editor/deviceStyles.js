// Editing styles per device (block.responsive, see renderBlock.mjs). The Style tab works on the device being
// previewed: on desktop it changes the block's own styles; on tablet or phone it writes overrides, and a value equal
// to what that device would inherit anyway (or an emptied field) removes the override instead.
import { DEVICE_KEYS, effectiveStyles } from '../render/renderBlock.mjs';
import { __ } from '../i18n/index.js';

export const DEVICES = [['desktop', __("Desktop")], ['tablet', __("Tablet")], ['mobile', __("Phone")]];
export const deviceName = (d) => (DEVICES.find(([id]) => id === d) || DEVICES[0])[1];

// The block with its styles as shown on `device`, for the panel's fields
export const blockOnDevice = (block, device) => (block && device && device !== 'desktop' ? { ...block, styles: effectiveStyles(block, device) } : block);

// The tidy form of a responsive object: no empty parts; undefined when nothing is left
export function tidyResponsive(r) {
  if (!r || typeof r !== 'object') return undefined;
  const out = {};
  for (const d of ['tablet', 'mobile']) if (r[d] && typeof r[d] === 'object' && Object.keys(r[d]).length) out[d] = r[d];
  if (Array.isArray(r.hide) && r.hide.length) out.hide = [...new Set(r.hide.filter((d) => ['desktop', 'tablet', 'mobile'].includes(d)))];
  return Object.keys(out).length ? out : undefined;
}

// The update ({styles, responsive}) for setting `patch` on `device`
export function deviceStylePatch(block, device, patch) {
  const styles = { ...((block && block.styles) || {}) };
  if (!device || device === 'desktop') {
    Object.assign(styles, patch);
    return { styles };
  }
  const r = { ...((block && block.responsive) || {}) };
  const own = { ...(r[device] || {}) };
  const inherited = device === 'tablet' ? styles : effectiveStyles(block, 'tablet');
  for (const [k, v] of Object.entries(patch)) {
    if (!DEVICE_KEYS.includes(k)) { styles[k] = v; continue; }   // effects and the like stay the same on every device
    if (v === '' || v === undefined || v === null || String(v) === String(inherited[k] ?? '')) delete own[k];
    else own[k] = v;
  }
  r[device] = own;
  return { styles, responsive: tidyResponsive(r) };
}

// Which style properties have their own value on `device`
export const deviceOverrides = (block, device) => (device === 'tablet' || device === 'mobile') ? Object.keys((block && block.responsive && block.responsive[device]) || {}) : [];

// Hide / show the block on a device
export function hidePatch(block, device, hidden) {
  const r = { ...((block && block.responsive) || {}) };
  const set = new Set(Array.isArray(r.hide) ? r.hide : []);
  if (hidden) set.add(device); else set.delete(device);
  r.hide = [...set];
  return { responsive: tidyResponsive(r) };
}

// Back to the inherited styles on a device
export function resetDevicePatch(block, device) {
  const r = { ...((block && block.responsive) || {}) };
  delete r[device];
  return { responsive: tidyResponsive(r) };
}
