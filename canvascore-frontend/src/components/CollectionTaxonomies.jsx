// Collections › Categories & tags: the taxonomies of a collection (for example Category, which takes one term, and Tags,
// which takes several) and their terms. Each term gets its own listing page, /<collection>/<taxonomy>/<term>/. Admins
// change them; an item picks its terms in its settings.
import React, { useEffect, useState } from 'react';
import { Tags, Plus, Trash2, Save } from 'lucide-react';
import { Button, Section, Field, Input } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { optionValue } from '../editor/itemFields';

const rowStyle = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'grid', gap: 8, background: '#fff' };

// The shape the server takes: names and addresses (an address is made from the name when it is left out)
const toSend = (list) => list.map((t) => ({ id: t.id, name: t.name, slug: optionValue(t.name), multiple: !!t.multiple,
  terms: t.terms.map((m) => ({ id: m.id, name: m.name, slug: optionValue(m.name), description: m.description || '' })) }));

export default function CollectionTaxonomies({ collection, canEdit, onSaved }) {
  const [list, setList] = useState(null);   // null while loading
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('api.php?action=get_taxonomies&collection=' + encodeURIComponent(collection.id)).then((r) => r.json()).then((d) => {
      if (alive) setList(Array.isArray(d) ? d.map((t) => ({ ...t, terms: t.terms || [] })) : []);
    }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [collection.id]);

  const edit = (fn) => setList((l) => fn(l));
  const addTax = () => edit((l) => [...l, { id: '', name: `Taxonomy ${l.length + 1}`, multiple: true, terms: [] }]);
  const addTerm = (ti) => edit((l) => l.map((t, i) => (i === ti ? { ...t, terms: [...t.terms, { id: '', name: 'New term', description: '' }] } : t)));
  const setTax = (ti, patch) => edit((l) => l.map((t, i) => (i === ti ? { ...t, ...patch } : t)));
  const setTerm = (ti, mi, patch) => edit((l) => l.map((t, i) => (i === ti ? { ...t, terms: t.terms.map((m, k) => (k === mi ? { ...m, ...patch } : m)) } : t)));
  const delTax = async (ti) => {
    const t = list[ti];
    if (!(await confirmDialog({ title: `Delete "${t.name}" and its terms?`, message: 'The items keep their other terms. Their terms of this taxonomy are removed. Save to apply.', confirmLabel: 'Delete', danger: true }))) return;
    edit((l) => l.filter((_, i) => i !== ti));
  };
  const delTerm = (ti, mi) => edit((l) => l.map((t, i) => (i === ti ? { ...t, terms: t.terms.filter((_, k) => k !== mi) } : t)));

  const save = async () => {
    setBusy(true);
    try {
      const data = await (await fetch('api.php?action=save_taxonomies', { method: 'POST', body: JSON.stringify({ collection_id: collection.id, taxonomies: toSend(list) }) })).json();
      if (!data || !data.success) { notify((data && data.message) || 'Could not save the categories and tags.', 'error'); return; }
      setList(data.taxonomies.map((t) => ({ ...t, terms: t.terms || [] })));
      notify('Categories and tags saved. Publish the site to update the listing pages.');
      if (onSaved) onSaved();
    } catch { notify('Could not save the categories and tags (connection problem).', 'error'); }
    finally { setBusy(false); }
  };

  const count = list ? list.length : 0;
  if (!canEdit) {
    return (
      <Section title={`Categories & tags (${count})`} icon={Tags} defaultOpen={false}>
        {list === null ? <p className="ui-cell-muted">Loading…</p> : count === 0 ? <p className="ui-cell-muted">This collection has no categories or tags.</p>
          : <ul style={{ margin: 0, paddingLeft: 18 }}>{list.map((t) => <li key={t.id}>{t.name} <span className="ui-cell-muted">({t.terms.map((m) => m.name).join(', ') || 'no terms'})</span></li>)}</ul>}
      </Section>
    );
  }
  return (
    <Section title={`Categories & tags (${count})`} icon={Tags} defaultOpen={count === 0}>
      {list === null ? <p className="ui-cell-muted">Loading…</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((t, ti) => (
            <div key={t.id || `new-${ti}`} style={rowStyle} data-taxonomy-row={ti}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'end' }}>
                <Field label="Taxonomy name" hint={`Address: /${collection.slug}/${optionValue(t.name) || '…'}/`}>
                  <Input value={t.name} maxLength={80} aria-label={`Taxonomy ${ti + 1} name`} onChange={(e) => setTax(ti, { name: e.target.value })} />
                </Field>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', paddingBottom: 8 }}>
                  <input type="checkbox" checked={!!t.multiple} onChange={(e) => setTax(ti, { multiple: e.target.checked })} /> Several terms per item
                </label>
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete taxonomy ${t.name}`} title="Delete taxonomy" onClick={() => delTax(ti)} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {t.terms.map((m, mi) => (
                  <div key={m.id || `new-${mi}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) auto', gap: 8, alignItems: 'center' }}>
                    <Input value={m.name} maxLength={80} aria-label={`${t.name} term ${mi + 1} name`} onChange={(e) => setTerm(ti, mi, { name: e.target.value })} />
                    <Input value={m.description || ''} maxLength={500} placeholder="Description (shown on its page)" aria-label={`${t.name} term ${mi + 1} description`} onChange={(e) => setTerm(ti, mi, { description: e.target.value })} />
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete term ${m.name}`} title="Delete term" onClick={() => delTerm(ti, mi)} />
                  </div>
                ))}
                <div><Button size="sm" icon={Plus} onClick={() => addTerm(ti)}>Add term</Button></div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="sm" icon={Plus} onClick={addTax} disabled={list === null}>Add taxonomy</Button>
        <Button variant="primary" size="sm" icon={Save} onClick={save} disabled={busy || list === null}>Save categories and tags</Button>
      </div>
    </Section>
  );
}
