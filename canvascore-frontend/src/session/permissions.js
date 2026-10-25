// What each role may do, for the editor to show only what works. The server decides (canvascore-admin/roles.php): this is
// the same table, so a button is never offered that the server would refuse.
//   admin     everything
//   editor    all content, publishes directly
//   reviewer  all content; approves what authors submit (approving = publishing it); creates nothing; no site-wide changes
//   author    their own pages and items; saves drafts and submits them for review; cannot publish; no site-wide changes
export const ROLES = [
  { id: 'admin', label: 'Administrator', hint: 'Full control: accounts, backups, updates, custom code.' },
  { id: 'editor', label: 'Editor', hint: 'All content; publishes directly.' },
  { id: 'reviewer', label: 'Reviewer', hint: 'Reviews what authors submit: approves it (publishes it) or sends it back. Creates nothing.' },
  { id: 'author', label: 'Author', hint: 'Writes their own pages and items and submits them for review. Cannot publish.' },
];
export const roleLabel = (r) => (ROLES.find((x) => x.id === r) || { label: r }).label;

export const canCreate = (r) => r !== 'reviewer';              // new pages and items
export const canPublishDirect = (r) => r === 'admin' || r === 'editor';
export const canPublishSite = (r) => r !== 'author';
export const canManageSite = (r) => r === 'admin' || r === 'editor';   // menu, global options, templates, masters, media management
export const canReview = (r) => r !== 'author';                // approve or send back what was submitted
export const isContributor = (r) => r === 'author' || r === 'reviewer';

// The review of a page or an item: '' | 'pending' | 'changes'
export const reviewOf = (p) => ({ state: (p && p.review_state) || '', note: (p && p.review_note) || '', by: (p && p.review_by) || '', at: (p && p.review_at) || '', approvedBy: (p && p.reviewed_by) || '' });
export const REVIEW_LABEL = { pending: 'Waiting for review', changes: 'Changes requested' };
