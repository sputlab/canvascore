// Collections › Who can work here (admins): everyone, or only the people chosen. Admins always can. Someone without access does not
// see the collection, its items or its categories, and cannot save items in it. (Authors still see only their own items, and the
// usual limits of their role apply inside it.)
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Save } from 'lucide-react';
import { Button, Section } from '../ui/kit';
import { notify } from '../ui/notify';
import { roleLabel } from '../session/permissions';

export default function CollectionAccess({ collection, canEdit, onSaved }) {
  const start = collection.access || { mode: 'all', users: [] };
  const [mode, setMode] = useState(start.mode === 'selected' ? 'selected' : 'all');
  const [users, setUsers] = useState(() => new Set(start.users || []));
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  const summary = mode === 'selected' ? `Only ${users.size} chosen ${users.size === 1 ? 'person' : 'people'} (and admins)` : 'Everyone who can sign in';

  useEffect(() => {
    if (!canEdit) return;
    fetch('api.php?action=get_users').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setPeople(d.filter((u) => u.role !== 'admin')); }).catch(() => {});
  }, [canEdit]);

  const toggle = (name) => setUsers((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const save = async () => {
    setBusy(true);
    try {
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: collection.id, name: collection.name, slug: collection.slug, access: { mode, users: [...users] } }) })).json();
      if (!data || !data.success) { notify((data && data.message) || 'Could not save who has access.', 'error'); return; }
      notify('Access saved.');
      if (onSaved) onSaved();
    } catch { notify('Could not save who has access (connection problem).', 'error'); }
    finally { setBusy(false); }
  };

  if (!canEdit) return null;
  return (
    <Section title="Who can work here" icon={ShieldCheck} defaultOpen={false} actions={<span className="ui-cell-muted" data-testid="access-summary">{summary}</span>}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="ui-label" style={{ marginBottom: 6 }}>Access</legend>
        <label className="ui-check" style={{ display: 'flex', marginBottom: 6 }}><input type="radio" name={`access-${collection.id}`} checked={mode === 'all'} onChange={() => setMode('all')} /> Everyone who can sign in</label>
        <label className="ui-check" style={{ display: 'flex' }}><input type="radio" name={`access-${collection.id}`} checked={mode === 'selected'} onChange={() => setMode('selected')} /> Only the people I choose</label>
      </fieldset>
      {mode === 'selected' && (
        <div role="group" aria-label="People with access" style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {people.length === 0 ? <p className="ui-hint">No editors, reviewers or authors yet: add accounts first.</p>
            : people.map((u) => (
              <label key={u.id} className="ui-check" style={{ display: 'flex' }}>
                <input type="checkbox" checked={users.has(u.username)} onChange={() => toggle(u.username)} aria-label={u.username} /> {u.username} <span className="ui-hint">({roleLabel(u.role).toLowerCase()})</span>
              </label>
            ))}
        </div>
      )}
      <p className="ui-hint" style={{ marginTop: 8 }}>Someone without access does not see this collection or its items, and cannot add or change them. Admins always have access.</p>
      <Button variant="primary" size="sm" icon={Save} onClick={save} disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Saving…' : 'Save access'}</Button>
    </Section>
  );
}
