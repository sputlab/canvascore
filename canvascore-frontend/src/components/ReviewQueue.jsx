// Reviews: what is waiting for a reviewer. Reviewers, editors and admins see every submission and can open it (to read it, edit it and
// approve it by publishing), send it back with a note, or withdraw it. Authors see their own work here ("My submissions"): what is
// waiting, and what came back with a note.
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, FileText, Library, Undo2, MessageSquareWarning, ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, PageHeader, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { promptDialog } from '../ui/dialog';
import { canReview, REVIEW_LABEL } from '../session/permissions';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const when = (s) => String(s || '').replace('T', ' ').slice(0, 16);

export default function ReviewQueue() {
  const { userRole, username, setView, setActivePage, setBlocks, setSelectedBlockId, setPendingItem } = useStore();
  const [rows, setRows] = useState(null);
  const reviewer = canReview(userRole);

  const load = useCallback(() => fetch('api.php?action=review_queue').then((r) => r.json())
    .then((d) => setRows(d && d.success ? d.items : []))
    .catch(() => { setRows([]); notify('Could not load the reviews.', 'error'); }), []);
  useEffect(() => { load(); }, [load]);

  // Open a page in the editor (a submitted draft copy opens through its live page, as the page list does)
  const open = async (r) => {
    if (r.kind === 'item') { setPendingItem({ id: r.id, collection_id: r.collection_id }); setView('collections'); return; }
    try {
      const pages = await (await fetch('api.php?action=get_pages')).json();
      const list = Array.isArray(pages) ? pages : [];
      const target = list.find((p) => p.id === r.id) || list.find((p) => p.draft_copy && p.draft_copy.id === r.id);
      if (!target) { notify('That page is no longer there.', 'error'); load(); return; }
      const page = target.status === 'modified' && target.draft_copy ? target.draft_copy : target;
      setActivePage(page);
      try { setBlocks(JSON.parse(page.content_json || '[]')); } catch { setBlocks([]); }
      setSelectedBlockId(null);
      setView('editor');
    } catch { notify('Could not open the page (connection problem).', 'error'); }
  };
  const sendBack = async (r) => {
    const note = await promptDialog({ title: `Send “${r.title}” back`, message: `${r.by} sees your note next to the ${r.kind}, and can change it and submit it again.`, label: 'What should change?', confirmLabel: 'Send back' });
    if (!note) return;
    const d = await post('review_back', { kind: r.kind, id: r.id, note });
    notify(d.message || (d.success ? 'Sent back.' : 'Not sent back.'), d.success ? 'success' : 'error');
    load();
  };
  const withdraw = async (r) => {
    const d = await post('review_withdraw', { kind: r.kind, id: r.id });
    notify(d.message || (d.success ? 'Withdrawn.' : 'Not withdrawn.'), d.success ? 'success' : 'error');
    load();
  };

  const pending = (rows || []).filter((r) => r.state === 'pending');
  const back = (rows || []).filter((r) => r.state === 'changes');
  const list = (title, items, empty) => (
    <section className="ui-card" aria-label={title} style={{ marginBottom: 14 }}>
      <h2 className="ui-card__title" style={{ marginTop: 0 }}>{title} <Badge>{items.length}</Badge></h2>
      {items.length === 0 ? <p className="ui-hint">{empty}</p> : (
        <ul className="cc-backup-list" aria-label={title}>
          {items.map((r) => (
            <li key={`${r.kind}:${r.id}`} className="cc-backup-item" data-review={`${r.kind}:${r.id}`}>
              <span className="cc-backup-item__main">
                <span className="cc-backup-item__title">
                  {r.kind === 'item' ? <Library size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />} {r.title || 'Untitled'}{' '}
                  <Badge tone={r.state === 'pending' ? 'draft' : 'neutral'}>{REVIEW_LABEL[r.state]}</Badge>
                </span>
                <span className="cc-backup-item__meta">
                  {r.kind === 'item' ? `Item in ${r.collection || 'a collection'}` : 'Page'}{r.by ? ` · from ${r.by}` : ''}{r.at ? ` · ${when(r.at)}` : ''}
                </span>
                {r.note && <span className="cc-backup-item__meta" data-testid="review-note"><MessageSquareWarning size={12} aria-hidden="true" /> “{r.note}”</span>}
              </span>
              <span className="cc-backup-item__actions">
                <Button size="sm" icon={ExternalLink} onClick={() => open(r)}>{reviewer && r.state === 'pending' ? 'Open to review' : 'Open'}</Button>
                {reviewer && r.state === 'pending' && <Button size="sm" icon={MessageSquareWarning} onClick={() => sendBack(r)}>Send back…</Button>}
                {r.state === 'pending' && (reviewer || r.by === username) && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => withdraw(r)}>Withdraw</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon={ClipboardCheck} title={reviewer ? 'Reviews' : 'My submissions'}
        description={reviewer ? 'Pages and items authors have submitted. Open one to read it and edit it if you want, then publish it to approve it, or send it back with a note.'
          : 'Work you submitted for review, and what came back with a note. Submit a page or an item from the editor when it is ready.'} />
      {rows === null ? <p className="ui-hint">Loading…</p> : (
        <>
          {list(reviewer ? 'Waiting for review' : 'Waiting for a reviewer', pending, reviewer ? 'Nothing is waiting for review.' : 'You have nothing waiting for review.')}
          {list('Sent back with changes requested', back, 'Nothing was sent back.')}
        </>
      )}
    </div>
  );
}
