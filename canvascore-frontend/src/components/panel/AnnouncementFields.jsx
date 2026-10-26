import React from 'react';
import { TxtF, SelF, ChkF, ColorF } from './fields';
import { __ } from '../../i18n/index.js';

// The fields of an announcement bar (`value` = the block's content). onChange gets only what changed ({ key: value }),
// to be merged into the live content: two quick edits can never overwrite each other.
const ANNOUNCEMENT_PRESETS = [['info', __("Dark")], ['promo', __("Brand color")], ['warning', __("Warning (yellow)")], ['success', __("Success (green)")]];

export default function AnnouncementFields({ value, onChange }) {
  const c = value && typeof value === 'object' ? value : {};
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <>
      <TxtF label={__("Message")} value={c.text} onChange={set('text')} multiline rows={2} placeholder={__("Free shipping on orders over €50")} />
      <TxtF label={__("Icon (one emoji, optional)")} value={c.icon} onChange={set('icon')} />
      <TxtF label={__("Link text (empty = no link)")} value={c.linkText} onChange={set('linkText')} placeholder={__("Shop now")} />
      <TxtF label={__("Link")} value={c.linkUrl} onChange={set('linkUrl')} placeholder={__("/offers or https://…")} />
      <SelF label={__("Colors")} value={ANNOUNCEMENT_PRESETS.some(([id]) => id === c.preset) ? c.preset : 'info'} onChange={set('preset')} options={ANNOUNCEMENT_PRESETS} />
      <ColorF label={__("Background (empty = from the colors above)")} value={c.bg} onChange={set('bg')} />
      <ColorF label={__("Text color (empty = from the colors above)")} value={c.color} onChange={set('color')} />
      <SelF label={__("Alignment")} value={c.align === 'left' ? 'left' : 'center'} onChange={set('align')} options={[['center', __("Centered")], ['left', __("Left")]]} />
      <ChkF label={__("Stay at the top while scrolling")} checked={c.sticky === true} onChange={set('sticky')} />
      <ChkF label={__("Visitors can dismiss it (remembered until the message changes)")} checked={c.dismissible !== false} onChange={set('dismissible')} />
    </>
  );
}
