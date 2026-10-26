// Collections › Fields: the custom fields of a collection. Admins define them (label, type, required, choices,
// the collection a reference points to); every item of the collection then fills them in (PageSettings › Item fields).
import React, { useState } from 'react';
import { ListChecks, ArrowUp, ArrowDown, Trash2, Plus, Save } from 'lucide-react';
import { Button, Section, Field, Input, Select } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { FIELD_TYPES, FIELD_TYPE_LABEL, SCHEMA_TYPES, newFieldId, keyFromLabel, optionValue } from '../editor/itemFields';
import { __ } from '../i18n/index.js';

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
  // structured data for search engines: the schema.org type of the items and the field behind each property
  const [sType, setSType] = useState((collection.schema && collection.schema.type) || '');
  const [sMap, setSMap] = useState((collection.schema && collection.schema.map) || {});
  const [sCur, setSCur] = useState((collection.schema && collection.schema.currency) || '');
  const others = (collections || []).filter((c) => c.id !== collection.id);
  const update = (id, patch) => setDefs((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (i, dir) => setDefs((list) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
  const add = () => setDefs((list) => [...list, { id: newFieldId(), key: keyFromLabel(__("Field {0}", list.length + 1)), label: __("Field {0}", list.length + 1), type: 'text', required: false, _choices: '' }]);
  const remove = async (f) => {
    if (!(await confirmDialog({ title: __("Delete the field \"{0}\"?", f.label), message: __("The values the items already have for it are kept in the database but no longer shown. Save to apply."), confirmLabel: __("Delete field"), danger: true }))) return;
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
      const schema = { type: sType, map: sType ? sMap : {}, currency: sType === 'Product' ? sCur : '' };
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: collection.id, name: collection.name, slug: collection.slug, fields, schema }) })).json();
      if (!data || !data.success) { notify(data && data.message || __("Could not save the fields."), 'error'); return; }
      notify(__("Fields saved."));
      if (onSaved) onSaved();
    } catch { notify(__("Could not save the fields (connection problem)."), 'error'); }
    finally { setBusy(false); }
  };

  if (!canEdit) {
    return (
      <Section title={__("Fields ({0})", defs.length)} icon={ListChecks} defaultOpen={false}>
        {defs.length === 0 ? <p className="ui-cell-muted">{__("This collection has no custom fields.")}</p>
          : <ul style={{ margin: 0, paddingLeft: 18 }}>{defs.map((f) => <li key={f.id}>{f.label} <span className="ui-cell-muted">({FIELD_TYPES.find(([t]) => t === f.type)?.[1] || f.type})</span></li>)}</ul>}
        <p className="ui-cell-muted" style={{ marginTop: 8 }}>{__("Only admins can change the fields.")}</p>
      </Section>
    );
  }
  return (
    <Section title={__("Fields ({0})", defs.length)} icon={ListChecks} defaultOpen={defs.length === 0}>
      <div style={{ display: 'grid', gap: 10 }}>
        {defs.map((f, i) => (
          <div key={f.id} style={rowStyle} data-field-row={f.id}>
            <div style={twoCols}>
              <Field label={__("Label")}>
                <Input value={f.label} maxLength={80} aria-label={__("Field {0} label", i + 1)} onChange={(e) => update(f.id, { label: e.target.value, key: keyFromLabel(e.target.value) })} />
              </Field>
              <Field label={__("Type")}>
                <Select aria-label={__("Field {0} type", i + 1)} value={f.type} onChange={(e) => update(f.id, { type: e.target.value })} options={FIELD_TYPES} />
              </Field>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12, color: '#475569' }}>
              <span>{__("Key:")} <code>{f.key}</code> <span className="ui-cell-muted">{__("(used in the Item Field block)")}</span></span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> {__("Required to publish")}
              </label>
              <span style={{ flex: 1 }} />
              <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={__("Move {0} up", f.label)} title={__("Move up")} onClick={() => move(i, -1)} disabled={i === 0} />
              <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={__("Move {0} down", f.label)} title={__("Move down")} onClick={() => move(i, 1)} disabled={i === defs.length - 1} />
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={__("Delete {0}", f.label)} title={__("Delete field")} onClick={() => remove(f)} />
            </div>
            {f.type === 'choice' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#475569' }}>{__("Choices, one per line:")} <code>label</code> {__("or")} <code>value | label</code></label>
                <textarea aria-label={__("{0} choices", f.label)} rows={4} value={f._choices} onChange={(e) => update(f.id, { _choices: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                  <input type="checkbox" checked={!!f.multiple} onChange={(e) => update(f.id, { multiple: e.target.checked })} /> {__("Several choices can be picked")}
                </label>
              </div>
            )}
            {f.type === 'reference' && (
              <Field label={__("Points to items of")}>
                <Select aria-label={__("{0} target collection", f.label)} value={f.target || ''} onChange={(e) => update(f.id, { target: e.target.value })}
                  options={[['', __("Choose a collection…")], ...(collections || []).map((c) => [c.id, c.name])]} />
                {others.length === 0 && <span className="ui-cell-muted" style={{ fontSize: 11 }}>{__("Tip: it can also point to items of this collection.")}</span>}
              </Field>
            )}
          </div>
        ))}
      </div>
      <div style={{ ...rowStyle, marginTop: 12 }}>
        <Field label={__("Structured data for search engines (Google and others)")}>
          <Select aria-label={__("Structured data type")} value={sType} onChange={(e) => { setSType(e.target.value); setSMap({}); }}
            options={[['', __("None")], ...Object.entries(SCHEMA_TYPES).map(([id, t]) => [id, t.label])]} />
        </Field>
        {sType && (
          <>
            <p className="ui-cell-muted" style={{ margin: 0, fontSize: 12 }}>{__("Each item page gets this data. The name and the address come from the item; the other properties come from these fields:")}</p>
            <div style={twoCols}>
              {Object.entries(SCHEMA_TYPES[sType].props).map(([prop, [label, allowed]]) => (
                <Field key={prop} label={label}>
                  <Select aria-label={__("Structured data {0}", label)} value={sMap[prop] || ''} onChange={(e) => setSMap((m) => ({ ...m, [prop]: e.target.value || undefined }))}
                    options={[['', __("— none —")], ...defs.filter((d) => allowed.includes(d.type)).map((d) => [d.id, `${d.label} (${FIELD_TYPE_LABEL[d.type] || d.type})`])]} />
                </Field>
              ))}
            </div>
            {sType === 'Product' && (
              <Field label={__("Currency (ISO code, for the price)")}>
                <Input value={sCur} maxLength={3} aria-label={__("Structured data currency")} placeholder={__("EUR")} onChange={(e) => setSCur(e.target.value.toUpperCase())} />
              </Field>
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="sm" icon={Plus} onClick={add}>{__("Add field")}</Button>
        <Button variant="primary" size="sm" icon={Save} onClick={save} disabled={busy}>{__("Save fields")}</Button>
      </div>
    </Section>
  );
}
