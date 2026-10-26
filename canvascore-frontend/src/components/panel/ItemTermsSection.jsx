// Categories & tags (Page Settings, for a collection item): the terms the item has, per taxonomy of its collection.
// A taxonomy that takes several terms gets checkboxes; one that takes a single term gets a choice.
import React from 'react';
import { Tags } from 'lucide-react';
import { PanelAccordion } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { __ } from '../../i18n/index.js';

export default function ItemTermsSection({ activePage, updateActivePage }) {
  const taxes = activePage.__taxonomies || [];
  const terms = activePage.terms || {};
  const set = (taxId, ids) => updateActivePage({ terms: { ...terms, [taxId]: ids } });
  return (
    <PanelAccordion title={__("Categories & tags")} icon={Tags} defaultOpen={taxes.length > 0}>
      {taxes.length === 0 ? (
        <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{__("This collection has no categories or tags yet. An admin adds them in Collections › Categories & tags.")}</p>
      ) : taxes.map((t) => {
        const picked = terms[t.id] || [];
        return (
          <div key={t.id} style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{t.name}{t.multiple ? '' : __(" (one term)")}</label>
            {t.multiple ? (
              <div style={{ display: 'grid', gap: 4 }}>
                {t.terms.map((m) => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                    <input type="checkbox" aria-label={`${t.name}: ${m.name}`} checked={picked.includes(m.id)}
                      onChange={(e) => set(t.id, e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} /> {m.name}
                  </label>
                ))}
                {t.terms.length === 0 && <span style={{ fontSize: 11, color: '#64748b' }}>{__("No terms yet.")}</span>}
              </div>
            ) : (
              <select style={inputStyle} aria-label={t.name} value={picked[0] || ''} onChange={(e) => set(t.id, e.target.value ? [e.target.value] : [])}>
                <option value="">—</option>
                {t.terms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </PanelAccordion>
  );
}
