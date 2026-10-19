// Collections › Fields: the custom fields of a collection. Admins define them (label, type, required, choices,
// the collection a reference points to); every item of the collection then fills them in (PageSettings › Item fields).
import React, { useState } from 'react';
import { ListChecks, ArrowUp, ArrowDown, Trash2, Plus, Save } from 'lucide-react';
import { Button, Section, Field, Input, Select } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { FIELD_TYPES, newFieldId, keyFromLabel, optionValue } from '../editor/itemFields';

// Choices, one per line: "label" or "value | label"
const choicesText = (options) => (options || []).map((o) => (o.value === optionValue(o.label) ? o.label : `${o.value} | ${o.label}`)).join('\n');
function parseChoices(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const [v, l] = raw.includes('|') ? raw.split('|').map((x) => x.trim()) : [null, raw];
    const label = (l || v || '').slice(0, 80);
    let value = optionValue(v || label) || 'option';
    let n = 2;
    while (seen.has(value)) value = `${optionValue(v || label).slice(0, 36)}-${n++}`;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

const rowStyle = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: '#fff' };
const twoCols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 10 };

export default function CollectionFields({ collection, collections, canEdit, onSaved }) {
  const [defs, setDefs] = useState(() => (collection.fields || []).map((f) => ({ ...f, _choices: choicesText(f.options) })));
  const [busy, setBusy] = useState(false);
  const others = (collections || []).filter((c) => c.id !== collection.id);
  const update = (id, patch) => setDefs((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (i, dir) => setDefs((list) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
  const add = () => setDefs((list) => [...list, { id: newFieldId(), key: keyFromLabel(`Field ${list.length + 1}`), label: `Field ${list.length + 1}`, type: 'text', required: false, _choices: '' }]);
  const remove = async (f) => {
    if (!(await confirmDialog({ title: `Delete the field "${f.label}"?`, message: 'The values the items already have for it are kept in the database but no longer shown. Save to apply.', confirmLabel: 'Delete field', danger: true }))) return;
    setDefs((list) => list.filter((x) => x.id !== f.id));
  };
  const save = async () => {
    setBusy(true);
    // two labels that give the same key get their keys numbered (the server keeps one of each key)
    const used = new Set();
    const fields = defs.map(({ _choices, ...f }) => {
      let key = f.key, n = 2;
      while (used.has(key)) key = `${f.key.slice(0, 36)}_${n++}`;
      used.add(key);
      return { ...f, key, ...(f.type === 'choice' ? { options: parseChoices(_choices) } : {}) };
    });
    try {
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: collection.id, name: collection.name, slug: collection.slug, fields }) })).json();
      if (!data || !data.success) { notify((data && data.message) || 'Could not save the fields.', 'error'); return; }
      notify('Fields saved.');
      if (onSaved) onSaved();
    } catch { notify('Could not save the fields (connection problem).', 'error'); }
    finally { setBusy(false); }
  };

  if (!canEdit) {
    return (
      <Section title={`Fields (${defs.length})`} icon={ListChecks} defaultOpen={false}>
        {defs.length === 0 ? <p className="ui-cell-muted">This collection has no custom fields.</p>
          : <ul style={{ margin: 0, paddingLeft: 18 }}>{defs.map((f) => <li key={f.id}>{f.label} <span className="ui-cell-muted">({FIELD_TYPES.find(([t]) => t === f.type)?.[1] || f.type})</span></li>)}</ul>}
        <p className="ui-cell-muted" style={{ marginTop: 8 }}>Only admins can change the fields.</p>
      </Section>
    );
  }
  return (
    <Section title={`Fields (${defs.length})`} icon={ListChecks} defaultOpen={defs.length === 0}>
      <div style={{ display: 'grid', gap: 10 }}>
        {defs.map((f, i) => (
          <div key={f.id} style={rowStyle} data-field-row={f.id}>
            <div style={twoCols}>
              <Field label="Label">
                <Input value={f.label} maxLength={80} aria-label={`Field ${i + 1} label`} onChange={(e) => update(f.id, { label: e.target.value, key: keyFromLabel(e.target.value) })} />
              </Field>
              <Field label="Type">
                <Select aria-label={`Field ${i + 1} type`} value={f.type} onChange={(e) => update(f.id, { type: e.target.value })} options={FIELD_TYPES} />
              </Field>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12, color: '#475569' }}>
              <span>Key: <code>{f.key}</code> <span className="ui-cell-muted">(used in the Item Field block)</span></span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> Required to publish
              </label>
              <span style={{ flex: 1 }} />
              <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={`Move ${f.label} up`} title="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
              <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={`Move ${f.label} down`} title="Move down" onClick={() => move(i, 1)} disabled={i === defs.length - 1} />
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${f.label}`} title="Delete field" onClick={() => remove(f)} />
            </div>
            {f.type === 'choice' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#475569' }}>Choices, one per line: <code>label</code> or <code>value | label</code></label>
                <textarea aria-label={`${f.label} choices`} rows={4} value={f._choices} onChange={(e) => update(f.id, { _choices: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                  <input type="checkbox" checked={!!f.multiple} onChange={(e) => update(f.id, { multiple: e.target.checked })} /> Several choices can be picked
                </label>
              </div>
            )}
            {f.type === 'reference' && (
              <Field label="Points to items of">
                <Select aria-label={`${f.label} target collection`} value={f.target || ''} onChange={(e) => update(f.id, { target: e.target.value })}
                  options={[['', 'Choose a collection…'], ...(collections || []).map((c) => [c.id, c.name])]} />
                {others.length === 0 && <span className="ui-cell-muted" style={{ fontSize: 11 }}>Tip: it can also point to items of this collection.</span>}
              </Field>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="sm" icon={Plus} onClick={add}>Add field</Button>
        <Button variant="primary" size="sm" icon={Save} onClick={save} disabled={busy}>Save fields</Button>
      </div>
    </Section>
  );
}
