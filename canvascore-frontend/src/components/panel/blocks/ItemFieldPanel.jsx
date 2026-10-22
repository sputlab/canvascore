import React from 'react';
import { Braces } from 'lucide-react';
import { PanelAccordion, SelF, ChkF } from '../fields';
import { FIELD_TYPE_LABEL } from '../../../editor/itemFields';

// Content panel: ITEM_FIELD (one field of the collection item being published)
export default function ItemFieldPanel({ ctx }) {
  const { c, set, fieldDefs } = ctx;
  const defs = fieldDefs || [];
  const def = defs.find((d) => d.id === c.field);
  return (
    <PanelAccordion title="Item field" icon={Braces} defaultOpen={true}>
      <SelF label="Field" value={c.field || ''} onChange={(v) => set('field', v)}
        options={[['', defs.length ? 'Choose a field…' : 'This page has no collection fields'], ...defs.map((d) => [d.id, `${d.label} (${FIELD_TYPE_LABEL[d.type] || d.type})`])]} />
      <ChkF label="Show the field name above the value" checked={!!c.showLabel} onChange={(v) => set('showLabel', v)} />
      {def && def.type === 'number' && (
        <SelF label="Decimals" value={String(c.decimals ?? 0)} onChange={(v) => set('decimals', Number(v))}
          options={[['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]} />
      )}
      {def && def.type === 'date' && (
        <SelF label="Date format" value={c.dateFormat || 'long'} onChange={(v) => set('dateFormat', v)} options={[['long', 'October 19, 2026'], ['iso', '2026-10-19']]} />
      )}
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        Shows the value of this field on each collection item page. On other pages it shows nothing; in the editor it shows a placeholder.
        Fill the values in the settings of the item (Page Settings › Item fields).
      </p>
    </PanelAccordion>
  );
}
