// Scheduled publishing (Page Settings, for a page or a collection item): when it goes live and when it comes down.
// The change is made at that time by the server (on the next admin visit, or by cron.php on a server with no admin).
import React, { useState } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import { PanelAccordion } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { notify } from '../../ui/notify';
import { __ } from '../../i18n/index.js';

// "2026-11-03 09:30" as the browser's date-time field wants it ("2026-11-03T09:30"), and back
const toField = (v) => (v || '').replace(' ', 'T');
const fromField = (v) => (v || '').replace('T', ' ');

export default function ScheduleSection({ activePage, updateActivePage }) {
  const kind = activePage.__item ? 'item' : 'page';
  const [publishAt, setPublishAt] = useState(toField(activePage.publish_at));
  const [unpublishAt, setUnpublishAt] = useState(toField(activePage.unpublish_at));
  const [busy, setBusy] = useState(false);
  const live = activePage.status === 'published';
  let status = live ? __("Live.") : __("Not live.");
  if (live && activePage.unpublish_at) status = __("Live until {0}.", fromField(activePage.unpublish_at));
  if (!live && activePage.publish_at) status = __("Goes live at {0}.", fromField(activePage.publish_at));

  const save = async () => {
    setBusy(true);
    try {
      const data = await (await fetch('api.php?action=set_schedule', { method: 'POST', body: JSON.stringify({ kind, id: activePage.id, publish_at: publishAt, unpublish_at: unpublishAt }) })).json();
      if (!data || !data.success) { notify(data && data.message || __("Could not save the schedule."), 'error'); return; }
      updateActivePage({ publish_at: data.publish_at, unpublish_at: data.unpublish_at });
      notify(data.publish_at || data.unpublish_at ? __("Schedule saved.") : __("Schedule cleared."));
    } catch { notify(__("Could not save the schedule (connection problem)."), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <PanelAccordion title={__("Scheduled publishing")} icon={CalendarClock} defaultOpen={!!(activePage.publish_at || activePage.unpublish_at)}>
      <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 10px' }}>{status}</p>
      <label style={labelStyle}>{__("Publish at")}</label>
      <input type="datetime-local" style={inputStyle} aria-label={__("Publish at")} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
      <label style={{ ...labelStyle, marginTop: '10px' }}>{__("Unpublish at")}</label>
      <input type="datetime-local" style={inputStyle} aria-label={__("Unpublish at")} value={unpublishAt} onChange={(e) => setUnpublishAt(e.target.value)} />
      <button type="button" onClick={save} disabled={busy}
        style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        <Save size={13} /> {__("Save schedule")}
      </button>
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0', lineHeight: 1.45 }}>
        {__("Times are the server's local time. Leave a field empty to clear it. The site is published again at the time, which happens on the next admin visit or from cron.php. A page with unpublished edits waiting is not changed by its schedule.")}
      </p>
    </PanelAccordion>
  );
}
