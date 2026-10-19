import React from 'react';
import { labelStyle, inputStyle } from '../helpers';
import { FIELD_TYPE_LABEL } from '../../../editor/itemFields';

// The fields of the collection a block lists (for the cards, the sort and the filter)
const collectionFieldsOf = (collections, collectionId) => ((collections || []).find((c) => c.id === collectionId) || {}).fields || [];

// Cards: which fields of the collection each card shows, in the order they are ticked
export function CardFieldsBox({ ctx }) {
  const { selectedBlock, handleContentChange, collections } = ctx;
  const fields = collectionFieldsOf(collections, selectedBlock.content.collectionId);
  const shown = selectedBlock.content.cardFields || [];
  if (fields.length === 0) return null;
  return (
    <>
      <label style={{ ...labelStyle, marginTop: '12px' }}>Fields on each card</label>
      <div role="group" aria-label="Fields on each card" style={{ display: 'grid', gap: '4px' }}>
        {fields.map((f) => (
          <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
            <input type="checkbox" checked={shown.includes(f.id)} onChange={(e) => handleContentChange('cardFields', e.target.checked ? [...shown, f.id] : shown.filter((x) => x !== f.id))} />
            {f.label} <span style={{ color: '#64748b' }}>({FIELD_TYPE_LABEL[f.type] || f.type})</span>
          </label>
        ))}
      </div>
    </>
  );
}

// Sort: the title, the date, or a field (number, date, text or single choice)
export function SortOptions({ ctx }) {
  const { selectedBlock, handleContentChange, collections } = ctx;
  const fields = collectionFieldsOf(collections, selectedBlock.content.collectionId)
    .filter((f) => ['number', 'date', 'text'].includes(f.type) || (f.type === 'choice' && !f.multiple));
  return (
    <>
      <label style={{ ...labelStyle, marginTop: '12px' }}>Sort by</label>
      <select style={inputStyle} value={selectedBlock.content.sortBy || ''} onChange={(e) => handleContentChange('sortBy', e.target.value)}>
        <option value="">Newest first (as now)</option>
        <option value="title">Title</option>
        <option value="date">Date</option>
        {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      {selectedBlock.content.sortBy ? (
        <select style={{ ...inputStyle, marginTop: '6px' }} value={selectedBlock.content.sortDir || 'asc'} onChange={(e) => handleContentChange('sortDir', e.target.value)} aria-label="Sort order">
          <option value="asc">Ascending (A–Z, oldest or smallest first)</option>
          <option value="desc">Descending (Z–A, newest or largest first)</option>
        </select>
      ) : null}
    </>
  );
}
