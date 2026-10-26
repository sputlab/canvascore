// Collections › Listing & archives: how many items a listing page holds, and which archives the site publishes for the
// collection (the years, the filters of its choice fields, and the sorts). The pages themselves are built on publish.
import React, { useState } from 'react';
import { Library, Save } from 'lucide-react';
import { Button, Section, Field, Input } from '../ui/kit';
import { notify } from '../ui/notify';
import { __ } from '../i18n/index.js';

export default function CollectionArchives({ collection, canEdit, onSaved }) {
  const start = collection.archive || {};
  const [perPage, setPerPage] = useState(start.perPage || 12);
  const [years, setYears] = useState(start.years !== false);
  const [filters, setFilters] = useState(start.filters !== false);
  const [sorts, setSorts] = useState(start.sorts !== false);
  const [busy, setBusy] = useState(false);
  const summary = `${perPage} per page${years ? ', years' : ''}${filters ? ', filters' : ''}${sorts ? ', sorts' : ''}`;

  const save = async () => {
    setBusy(true);
    try {
      const archive = { perPage: Math.max(3, Math.min(50, Number(perPage) || 12)), years, filters, sorts };
      const data = await (await fetch('api.php?action=save_collection', { method: 'POST', body: JSON.stringify({ id: collection.id, name: collection.name, slug: collection.slug, archive }) })).json();
      if (!data || !data.success) { notify(data && data.message || __("Could not save the listing settings."), 'error'); return; }
      notify(__("Listing settings saved. Publish the site to update the archive pages."));
      if (onSaved) onSaved();
    } catch { notify(__("Could not save the listing settings (connection problem)."), 'error'); }
    finally { setBusy(false); }
  };

  if (!canEdit) {
    return <Section title={__("Listing & archives")} icon={Library} defaultOpen={false}><p className="ui-cell-muted">{summary}{__(". Only admins change these settings.")}</p></Section>;
  }
  return (
    <Section title={__("Listing & archives")} icon={Library} defaultOpen={false}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Field label={__("Items per page (3 to 50)")}>
          <Input type="number" min={3} max={50} value={perPage} aria-label={__("Items per page")} onChange={(e) => setPerPage(e.target.value)} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={years} onChange={(e) => setYears(e.target.checked)} /> {__("Year and month archives (/")}{collection.slug}/2026/)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={filters} onChange={(e) => setFilters(e.target.checked)} /> {__("Filter archives for each choice of a choice field")}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={sorts} onChange={(e) => setSorts(e.target.checked)} /> {__("Sorted listings (oldest first, A–Z)")}
        </label>
        <p className="ui-cell-muted" style={{ margin: 0, fontSize: 12 }}>
          {__("Every archive is paginated and linked from the first listing page. Each archive is a page of the site, so the site is published again to show them.")}
        </p>
        <div><Button variant="primary" size="sm" icon={Save} onClick={save} disabled={busy}>{__("Save listing settings")}</Button></div>
      </div>
    </Section>
  );
}
