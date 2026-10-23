import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { PanelAccordion, TxtF, NumF } from '../fields';

// Content panel: SEARCH (site search box + results, on the published site)
export default function SearchPanel({ ctx }) {
  const { c, set } = ctx;
  const [taxes, setTaxes] = useState([]);
  useEffect(() => {
    fetch('api.php?action=get_taxonomy_list').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTaxes(d); }).catch(() => {});
  }, []);
  const facets = c.facets || [];
  const toggle = (key, on) => set('facets', on ? [...facets, key] : facets.filter((x) => x !== key));
  return (
    <PanelAccordion title="Site Search" icon={Search} defaultOpen={true}>
      <TxtF label="Placeholder" value={c.placeholder} onChange={v => set('placeholder', v)} placeholder="Search the site…" />
      <TxtF label="Button text" value={c.buttonText} onChange={v => set('buttonText', v)} placeholder="Search" />
      <TxtF label="When nothing is found" value={c.noResults} onChange={v => set('noResults', v)} placeholder="No results for" />
      <NumF label="Results to show (1–50)" min={1} max={50} value={c.limit ?? 10} onChange={v => set('limit', v)} />
      <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', margin: '12px 0 6px' }}>Filters (faceted search)</label>
      <div role="group" aria-label="Filters" style={{ display: 'grid', gap: '4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
          <input type="checkbox" checked={facets.includes('collection')} onChange={e => toggle('collection', e.target.checked)} /> Collection (Pages, or the name of each collection)
        </label>
        {taxes.map(t => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
            <input type="checkbox" checked={facets.includes('tax:' + t.id)} onChange={e => toggle('tax:' + t.id, e.target.checked)} /> {t.name} <span style={{ color: '#64748b' }}>({t.collection})</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        Visitors tick the choices to narrow the results: the choices of one filter combine with "or", and the filters with "and".
        Choices are listed from the published content.
      </p>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        Searches the titles, descriptions and text of every published page and collection item (pages hidden from search engines
        are left out). The search list is rebuilt each time you publish. Tip: put this block on a page called “Search”; a link to
        <code style={{ color: '#38bdf8' }}> /search/?q=word </code> opens it with results.
      </p>
    </PanelAccordion>
  );
}
