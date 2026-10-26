// Backup › Public demo (admins, only on a site that is a demo: demo.json in the data folder). A demo puts itself back to its baseline every few
// minutes; here the baseline is chosen (the site as it is now), the visitors' account is made, and a reset can be forced. Server side: demo.php.
import React, { useCallback, useEffect, useState } from 'react';
import { Presentation, RotateCcw, UserPlus, Camera } from 'lucide-react';
import { Button, Card, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';

const post = (action) => fetch(`api.php?action=${action}`, { method: 'POST', body: '{}' }).then((r) => r.json());
const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '');

export default function DemoCard() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => fetch('api.php?action=demo_status').then((r) => r.json()).then((d) => setSt(d && d.success ? d : null)).catch(() => setSt(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!st) return null;

  const run = async (action, ask) => {
    if (ask && !(await confirmDialog(ask))) return;
    setBusy(action);
    try {
      const d = await post(action);
      notify(d.message || '', d.success ? 'success' : 'error');
      if (d.status) setSt({ success: true, ...d.status }); else load();
    } catch { notify(__("Not done (connection problem)."), 'error'); } finally { setBusy(''); }
  };
  const last = st.last;

  return (
    <Card title={__("Public demo")} icon={Presentation} description={__("This site is a demo: it puts itself back to its starting point every few minutes, so visitors can try the editor freely.")}>
      <ul className="ui-hint" style={{ margin: '0 0 12px', paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>{__("Every {0} minutes", st.resetMinutes)} · {st.publish ? __("visitors may publish") : __("visitors cannot publish")}</li>
        <li>{st.baseline ? <>{__("Starting point saved")} {when(st.baseline.at)}</> : <><Badge tone="draft">{__("No starting point yet")}</Badge> {__("Make the site as you want visitors to find it, then save it as the starting point.")}</>}</li>
        <li>{st.account ? (st.account.ready ? __("The visitors' account “{0}” is ready (editor).", st.username) : __("The account “{0}” exists but is not ready: refresh it.", st.username)) : __("The visitors' account “{0}” does not exist yet.", st.username)}</li>
        {last && <li>{__("Last reset")} {when(last.at)}: {last.message}</li>}
        <li>{st.token ? __("A cron service can reset it by address (demo-reset.php with the token of demo.json).") : __("It resets itself on the first visit of every period; no scheduled task is needed.")}</li>
      </ul>
      <div className="ui-row" style={{ flexWrap: 'wrap' }}>
        <Button icon={Camera} disabled={!!busy} onClick={() => run('demo_baseline', { title: __("Use the site as the starting point?"), message: __("The demo will be put back to the site as it is now, every {0} minutes. Visitors' changes are not kept.", st.resetMinutes), confirmLabel: __("Save the starting point") })}>{busy === 'demo_baseline' ? __("Saving…") : __("Keep this site as the starting point")}</Button>
        <Button icon={UserPlus} disabled={!!busy} onClick={() => run('demo_account')}>{__("Make the visitors' account")}</Button>
        <Button icon={RotateCcw} disabled={!!busy || !st.baseline} onClick={() => run('demo_reset', { title: __("Reset the demo now?"), message: __("The site goes back to its starting point; what was changed since is lost."), confirmLabel: __("Reset now"), danger: true })}>{busy === 'demo_reset' ? __("Resetting…") : __("Reset now")}</Button>
      </div>
    </Card>
  );
}
