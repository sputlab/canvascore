import React from 'react';
import { Library } from 'lucide-react';
import { PanelAccordion } from '../fields';
import { labelStyle, inputStyle } from '../helpers';
import { SortOptions, CardFieldsBox } from './listFields';
import { __ } from '../../../i18n/index.js';

// Content panel: COLLECTION_LIST
export default function CollectionListPanel({ ctx }) {
  const { selectedBlock, handleContentChange, patchContent, collections } = ctx;
  return (
    <PanelAccordion title={__("Collection List")} icon={Library} defaultOpen={true}>
      <label style={labelStyle}>{__("Collection")}</label>
      <select style={inputStyle} value={selectedBlock.content.collectionId || ''} onChange={e => {
        const c = collections.find(x => x.id === e.target.value);
        patchContent({ collectionId: e.target.value, collectionSlug: c ? c.slug : '', collectionName: c ? c.name : '' });
      }}>
        <option value="">{__("— choose a collection —")}</option>
        {collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.item_count})</option>)}
      </select>
      {collections.length === 0 && <p style={{ fontSize: '11px', color: '#f59e0b', margin: '6px 0 0 0' }}>{__("No collections yet. Create one in the Collections section.")}</p>}

      <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Source")}</label>
      <select style={inputStyle} value={selectedBlock.content.source || 'active'} onChange={e => handleContentChange('source', e.target.value)}>
        <option value="active">{__("Active (not archived)")}</option>
        <option value="archived">{__("Archived only")}</option>
        <option value="all">{__("All")}</option>
      </select>

      <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Layout")}</label>
      <select style={inputStyle} value={selectedBlock.content.layout || 'grid'} onChange={e => handleContentChange('layout', e.target.value)}>
        <option value="grid">{__("Grid (cards)")}</option>
        <option value="list">{__("List (rows)")}</option>
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', marginTop: '12px' }}>
        <input type="checkbox" checked={!!selectedBlock.content.showAll} onChange={e => handleContentChange('showAll', e.target.checked)} /> {__("Show all items (ignore limit)")}
      </label>

      {!selectedBlock.content.showAll && <>
        <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Items to show")}</label>
        <input type="number" min="1" style={inputStyle} placeholder="6" value={selectedBlock.content.limit ?? ''} onChange={e => handleContentChange('limit', e.target.value === '' ? undefined : Math.max(1, parseInt(e.target.value, 10) || 1))} />
      </>}

      {(selectedBlock.content.layout || 'grid') === 'grid' && <>
      <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Columns")}</label>
      <select style={inputStyle} value={selectedBlock.content.columns || 3} onChange={e => handleContentChange('columns', parseInt(e.target.value))}>
        <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
      </select>

      </>}

      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[['showCover', __("Show cover image")], ['showDate', __("Show date")], ['showExcerpt', __("Show excerpt")]].map(([k, lbl]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
            <input type="checkbox" checked={selectedBlock.content[k] !== false} onChange={e => handleContentChange(k, e.target.checked)} /> {lbl}
          </label>
        ))}
      </div>

      <CardFieldsBox ctx={ctx} />
      <SortOptions ctx={ctx} />
      <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Filter buttons (by a choice field)")}</label>
      <select style={inputStyle} value={selectedBlock.content.filterField || ''} onChange={e => handleContentChange('filterField', e.target.value)}>
        <option value="">{__("None")}</option>
        {((collections.find(c => c.id === selectedBlock.content.collectionId) || {}).fields || []).filter(f => f.type === 'choice').map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>{__("Visitors pick a choice to show only the matching items. The fields are set on each item.")}</p>
    </PanelAccordion>
  );
}
