// Block effects (Advanced tab) and button hovers: the allowed values and the classes they add.
// Mirrored in compiler.php (cc_effect_classes / cc_button_hover); the CSS is canvascore-admin/effects.css.

import { __ } from '../i18n/index.js';

export const REVEAL_ANIMATIONS = [
  ['none', __("None")], ['fade-in', __("Fade in")], ['fade-up', __("Fade up")], ['fade-down', __("Fade down")],
  ['fade-left', __("Slide in from the left")], ['fade-right', __("Slide in from the right")],
  ['zoom-in', __("Zoom in")], ['zoom-out', __("Zoom out")], ['flip-up', __("Flip up")], ['flip-left', __("Flip sideways")],
  ['rotate-in', __("Rotate in")], ['blur-in', __("Blur in")], ['bounce-in', __("Bounce in")],
];
export const DURATIONS = [['', __("Normal (0.8s)")], ['fast', __("Fast (0.5s)")], ['slow', __("Slow (1.2s)")], ['slower', __("Very slow (1.8s)")]];
export const DELAYS = [['', __("No delay")], ['100', '0.1s'], ['200', '0.2s'], ['300', '0.3s'], ['500', '0.5s'], ['800', '0.8s'], ['1000', '1s'], ['1500', '1.5s']];
export const HOVER_EFFECTS = [
  ['', __("None")], ['lift', __("Lift")], ['grow', __("Grow")], ['shrink', __("Shrink")], ['shadow', __("Shadow")],
  ['glow', __("Glow (brand color)")], ['tilt', __("Tilt")], ['brighten', __("Brighten")], ['grayscale', __("Black & white → color")],
];
export const LOOP_EFFECTS = [
  ['', __("None")], ['float', __("Float")], ['pulse', __("Pulse")], ['bounce', __("Bounce")], ['swing', __("Swing")],
  ['heartbeat', __("Heartbeat")], ['shake', __("Shake (every few seconds)")], ['spin', __("Spin (slow)")],
];
export const BUTTON_EFFECTS = [
  ['', __("Color change only")], ['lift', __("Lift")], ['grow', __("Grow")], ['press', __("Press")], ['shadow', __("Shadow")],
  ['glow', __("Glow")], ['shine', __("Shine sweep")], ['ring', __("Outline ring")], ['pulse', __("Pulse")],
];

const allowed = (list) => new Set(list.map(([v]) => v).filter((v) => v && v !== 'none'));
const REVEAL = allowed(REVEAL_ANIMATIONS);
const DUR = allowed(DURATIONS);
const DELAY = allowed(DELAYS);
const HOVER = allowed(HOVER_EFFECTS);
const LOOP = allowed(LOOP_EFFECTS);
const BFX = allowed(BUTTON_EFFECTS);

// Classes of a block's effects, each with a leading space ('' when none). Unknown values are dropped.
export function effectClasses(styles = {}, content = {}) {
  let c = '';
  if (REVEAL.has(styles.animation)) {
    c += ` cc-reveal ${styles.animation}`;
    if (DUR.has(content.animDuration)) c += ` cc-dur-${content.animDuration}`;
    if (DELAY.has(String(content.animDelay ?? ''))) c += ` cc-delay-${content.animDelay}`;
  }
  if (HOVER.has(content.hoverEffect)) c += ` cc-hover-${content.hoverEffect}`;
  if (LOOP.has(content.loopEffect)) c += ` cc-loop-${content.loopEffect}`;
  return c;
}

// Hover of a button: { cls: ' cc-hbg cc-bfx-lift…', vars: '--cc-hover-bg:…; ' } (values are HTML-escaped by the caller).
export function buttonHover({ bg, color, border, effect } = {}) {
  let cls = '';
  let vars = '';
  const ok = (v) => typeof v === 'string' && v.trim() !== '';
  if (ok(bg)) { cls += ' cc-hbg'; vars += `--cc-hover-bg:${bg}; `; }
  if (ok(color)) { cls += ' cc-hcol'; vars += `--cc-hover-color:${color}; `; }
  if (ok(border)) { cls += ' cc-hbd'; vars += `--cc-hover-border:${border}; `; }
  if (BFX.has(effect)) cls += ` cc-bfx-${effect}`;
  return { cls, vars };
}
