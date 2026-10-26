import { __ } from '../i18n/index.js';
// Custom fields of a collection (Collections › Fields): the nine types, and what an empty value of each looks like.
// The server cleans every definition and value (canvascore-admin/config.php: cc_field_defs, cc_field_clean).
export const FIELD_TYPES = [
  ['text', __("Text")], ['richtext', __("Rich text")], ['number', __("Number")], ['date', __("Date")], ['image', __("Image")],
  ['gallery', __("Gallery (several images)")], ['link', __("Link")], ['choice', __("Choice")], ['reference', __("Reference to an item")],
];
export const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES);

// A new field's id: short and lower case, as the server expects
export const newFieldId = () => 'f' + Math.random().toString(36).slice(2, 10);

// A field key from its label: lower case, no accents, starting with a letter ("Price (€)" becomes "price")
export function keyFromLabel(label) {
  const k = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '');
  return k.slice(0, 40) || 'field';
}

// A choice option's value from its label (lower case, dashes)
export const optionValue = (label) => String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// The value an item starts with for a field of this type
export function emptyFieldValue(def) {
  switch (def && def.type) {
    case 'number': return null;
    case 'gallery': return [];
    case 'link': return { url: '', text: '' };
    case 'choice': return def.multiple ? [] : '';
    default: return '';
  }
}

// Is a value empty (nothing to show, and nothing to publish as a required field)?
export function isEmptyFieldValue(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'url' in v) return !v.url && !v.text;
  return false;
}

// Structured data for search engines (mirror of CC_SCHEMA_TYPES in canvascore-admin/config.php): the schema.org type
// of a collection's items, and for each property the field types that can give it
export const SCHEMA_TYPES = {
  Product: { label: __("Product (a shop item)"), props: { image: ['Image', ['image', 'gallery']], description: ['Description', ['text', 'richtext']], price: ['Price', ['number']], sku: ['SKU', ['text']] } },
  Event: { label: __("Event"), props: { startDate: ['Start date', ['date']], location: ['Location', ['text']], image: ['Image', ['image', 'gallery']], description: ['Description', ['text', 'richtext']] } },
  Person: { label: __("Person"), props: { jobTitle: ['Job title', ['text', 'choice']], image: ['Photo', ['image', 'gallery']], description: ['Bio', ['text', 'richtext']] } },
};
