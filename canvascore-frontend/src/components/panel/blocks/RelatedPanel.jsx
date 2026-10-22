import React from 'react';
import { Link2 } from 'lucide-react';
import { PanelAccordion, NumF, SelF, TxtF } from '../fields';
import { CardFieldsBox, SortOptions } from './listFields';

// Content panel: RELATED (the items of a collection that point to the item being published)
export default function RelatedPanel({ ctx }) {
  const { selectedBlock, handleContentChange, patchContent, collections, itemCollectionId } = ctx;
  const c = selectedBlock.content;
  const coll = (collections || []).find((x) => x.id === c.collectionId);
  // only a reference that points to the collection of the item being edited can relate the two
  const refs = (coll && coll.fields ? coll.fields : []).filter((f) => f.type === 'reference' && f.target === itemCollectionId);
  return (
    <PanelAccordion title="Related items" icon={Link2} defaultOpen={true}>
      <TxtF label="Heading (optional)" value={c.title} onChange={(v) => handleContentChange('title', v)} placeholder="Related" />
      <SelF label="Items of collection" value={c.collectionId || ''}
        onChange={(v) => { const cc = (collections || []).find((x) => x.id === v); patchContent({ collectionId: v, collectionName: cc ? cc.name : '', fieldId: '' }); }}
        options={[['', '— choose a collection —'], ...(collections || []).map((x) => [x.id, x.name])]} />
      <SelF label="That point to this item through the field" value={c.fieldId || ''} onChange={(v) => handleContentChange('fieldId', v)}
        options={[['', refs.length ? '— choose a field —' : (c.collectionId ? 'No such field' : '—')], ...refs.map((f) => [f.id, f.label])]} />
      {!itemCollectionId && <p style={{ fontSize: '11px', color: '#f59e0b', margin: '6px 0 0' }}>Use this block on a collection item page: it lists the items that point to that item.</p>}
      {itemCollectionId && c.collectionId && refs.length === 0 && (
        <p style={{ fontSize: '11px', color: '#f59e0b', margin: '6px 0 0' }}>No reference field of this collection points to the item's collection. Add one in Collections › Fields.</p>
      )}
      <NumF label="How many" min={1} max={50} value={c.limit ?? 3} onChange={(v) => handleContentChange('limit', v)} />
      <SelF label="Columns" value={String(c.columns || 3)} onChange={(v) => handleContentChange('columns', parseInt(v, 10))}
        options={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]} />
      <CardFieldsBox ctx={ctx} />
      <SortOptions ctx={ctx} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        On each item page, this lists the items of the chosen collection that point to it. Nothing shows on other pages.
      </p>
    </PanelAccordion>
  );
}
