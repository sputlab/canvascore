// The review banner of the page editor: where a page or an item is in the review, and what the person looking at it may do.
//   waiting for review   author: "you can't edit it while it waits" + Withdraw · reviewer, editor, admin: the note + Send back…
//   changes requested    everyone: the note (the reviewer's) next to the work
import React from 'react';
import { ClipboardCheck, MessageSquareWarning, Undo2 } from 'lucide-react';
import { Button } from '../ui/kit';
import { notify } from '../ui/notify';
import { promptDialog } from '../ui/dialog';
import { canReview, reviewOf } from '../session/permissions';

const post = (action, body) => fetch(`api.php?action=${action}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const when = (s) => String(s || '').replace('T', ' ').slice(0, 16);
const NONE = { review_state: '', review_note: '', review_by: '', review_at: '' };

export default function ReviewBar({ page, role, username, onChange }) {
  const review = reviewOf(page);
  if (!page || !review.state) return null;
  const kind = page.__item ? 'item' : 'page';
  const reviewer = canReview(role);

  const sendBack = async () => {
    const note = await promptDialog({ title: `Send this ${kind} back`, message: `${review.by || 'The author'} sees your note and can submit it again.`, label: 'What should change?', confirmLabel: 'Send back' });
    if (!note) return;
    const d = await post('review_back', { kind, id: page.id, note });
    notify(d.message || (d.success ? 'Sent back.' : 'Not sent back.'), d.success ? 'success' : 'error');
    if (d.success) onChange({ review_state: 'changes', review_note: note });
  };
  const withdraw = async () => {
    const d = await post('review_withdraw', { kind, id: page.id });
    notify(d.message || (d.success ? 'Withdrawn.' : 'Not withdrawn.'), d.success ? 'success' : 'error');
    if (d.success) onChange(NONE);
  };

  const pending = review.state === 'pending';
  return (
    <div className="cc-ed-banner" role="status" data-testid="review-bar" data-state={review.state}
      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px', background: pending ? '#1e3a5f' : '#4a3512', color: '#f1f5f9', fontSize: 13 }}>
      {pending ? <ClipboardCheck size={16} aria-hidden="true" /> : <MessageSquareWarning size={16} aria-hidden="true" />}
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>
        {pending
          ? <><strong>Waiting for review</strong>{review.by ? ` · submitted by ${review.by}` : ''}{review.at ? ` · ${when(review.at)}` : ''}.{' '}
              {reviewer ? 'Publish it to approve it, or send it back.' : 'You cannot change it while it waits: withdraw it to keep working.'}
              {review.note && <> <em data-testid="review-bar-note">“{review.note}”</em></>}</>
          : <><strong>Changes requested</strong>{page.reviewed_by ? ` by ${page.reviewed_by}` : ''}: <em data-testid="review-bar-note">“{review.note}”</em> Make the changes, then submit it again.</>}
      </span>
      {pending && reviewer && <Button size="sm" icon={MessageSquareWarning} onClick={sendBack}>Send back…</Button>}
      {pending && (reviewer || review.by === username) && <Button size="sm" variant="ghost" icon={Undo2} onClick={withdraw}>Withdraw</Button>}
    </div>
  );
}
