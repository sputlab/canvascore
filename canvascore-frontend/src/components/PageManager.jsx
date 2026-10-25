import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { uniqueSlug } from '../utils/slug';
import { FileText, Plus, Trash2, Edit3, LayoutTemplate, ExternalLink, Copy, Home } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, SearchInput, Segmented, Select, StatusBadge, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { canCreate, canManageSite, reviewOf, REVIEW_LABEL } from '../session/permissions';

export default function PageManager() {
  const { setView, setActivePage, setBlocks, pages, setPages, setSelectedBlockId, userRole } = useStore();
  const mayCreate = canCreate(userRole);
  // the review of a page is on the draft copy when there is one
  const pageReview = (p) => reviewOf(p.draft_copy && p.draft_copy.review_state ? p.draft_copy : p);
  // who may delete: editors and admins any page; an author their own pages that were never published; a reviewer none
  const mayDelete = (p) => canManageSite(userRole) || (userRole === 'author' && p.status !== 'published' && p.status !== 'modified');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('updated');

  const loadPages = useCallback(() => {
    fetch('api.php?action=get_pages')
      .then(res => { if (!res.ok) throw new Error("Unauthorized"); return res.json(); })
      .then(data => { if (Array.isArray(data)) setPages(data); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [setPages]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const createPage = async () => {
    const id = 'page-' + Date.now();
    const slug = uniqueSlug('New Page', { pages });
    const newPage = {
      id, title: 'New Page', slug, clean_slug: slug,
      layout: 'boxed', boxed_width: '1200px', bg_color: '#ffffff',
      seo_title: '', seo_description: '', content_json: '[]',
      status: 'draft', is_draft_copy: 0, parent_id: null, is_home: 0
    };
    // Persist right away: this way the page is a real record and the right-hand panel
    // behaves exactly as when it is reopened from the dashboard.
    try {
      const data = await (await fetch('api.php?action=save_page', { method: 'POST', body: JSON.stringify({ ...newPage, blocks: [], publish: false }) })).json();
      if (!data || data.success === false) { notify('Could not create the page: ' + ((data && data.message) || 'unexpected answer'), 'error'); return; }
    } catch { notify('Could not create the page (connection problem).', 'error'); return; }
    setPages([newPage, ...pages]);
    setActivePage(newPage);
    setBlocks([]);
    setSelectedBlockId(null);
    setView('editor');
  };

  const pageUrl = (page) => {
    const slug = page.clean_slug || 'index';
    if (Number(page.is_home) || slug === 'index' || slug === 'home') return '../index.html';
    return `../${encodeURIComponent(slug)}/index.html`;
  };

  const editPage = (page) => {
    let targetPage = page;
    // If the page was modified and has a hidden draft copy, open the copy!
    if (page.status === 'modified' && page.draft_copy) {
      targetPage = page.draft_copy;
    }
    setActivePage(targetPage);
    try { setBlocks(JSON.parse(targetPage.content_json || '[]')); } catch { setBlocks([]); }
    setSelectedBlockId(null);
    setView('editor');
  };

  const deletePage = async (id) => {
    const pg = pages.find((p) => p.id === id);
    if (!(await confirmDialog({ title: `Delete the page "${pg ? pg.title : 'this page'}"?`, message: 'If it is online, it is removed from the site too. This cannot be undone.', confirmLabel: 'Delete page', danger: true }))) return;
    try {
      const data = await (await fetch('api.php?action=delete_page', { method: 'POST', body: JSON.stringify({ id }) })).json();
      if (!data || data.success === false) { notify('Could not delete the page: ' + ((data && data.message) || 'unexpected answer'), 'error'); return; }
      setPages(pages.filter(p => p.id !== id));
      notify('Page deleted.');
    } catch { notify('Error deleting page.', 'error'); }
  };

  // Copy of a page as a new draft (the live version's content, a free slug)
  const duplicatePage = async (page) => {
    const id = 'page-' + Date.now();
    const title = `${page.title} (copy)`;
    const slug = uniqueSlug(title, { pages });
    const source = page.status === 'modified' && page.draft_copy ? page.draft_copy : page;
    let blocks = [];
    try { blocks = JSON.parse(source.content_json || '[]'); } catch { blocks = []; }
    const copy = {
      ...page, id, title, slug, clean_slug: slug, content_json: JSON.stringify(blocks),
      status: 'draft', is_draft_copy: 0, parent_id: null, is_home: 0, draft_copy: undefined, updated_at: new Date().toISOString(),
    };
    try {
      const res = await fetch('api.php?action=save_page', { method: 'POST', body: JSON.stringify({ ...copy, blocks, publish: false }) });
      const data = await res.json();
      if (data && data.success === false) { notify(data.message || 'Could not duplicate the page.', 'error'); return; }
      setPages([copy, ...pages]);
      notify(`"${title}" created as a draft.`);
    } catch { notify('Could not duplicate the page.', 'error'); }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not saved yet';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const statusOf = (p) => (p.status === 'modified' ? 'modified' : p.status === 'published' ? 'published' : 'draft');
  const counts = useMemo(() => pages.reduce((c, p) => { c[statusOf(p)]++; return c; }, { published: 0, modified: 0, draft: 0 }), [pages]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = pages.filter((p) => (filter === 'all' || statusOf(p) === filter)
      && (!q || `${p.title} ${p.clean_slug || ''}`.toLowerCase().includes(q)));
    return [...list].sort((a, b) => (sort === 'title'
      ? String(a.title).localeCompare(String(b.title))
      : String(b.updated_at || '').localeCompare(String(a.updated_at || ''))));
  }, [pages, query, filter, sort]);

  return (
    <>
      <PageHeader icon={FileText} title="Pages" description="Every page of the site. Drafts stay private until you publish them."
        actions={<>
          {mayCreate && <Button icon={LayoutTemplate} onClick={() => setView('templates')}>From a template</Button>}
          {mayCreate && <Button variant="primary" icon={Plus} onClick={createPage}>New Page</Button>}
        </>} />

      {loading ? (
        <p className="ui-hint" style={{ padding: 40, textAlign: 'center' }}>Loading…</p>
      ) : pages.length === 0 ? (
        <EmptyState icon={FileText} title="No pages yet" action={mayCreate ? <div className="ui-row" style={{ justifyContent: 'center' }}>
          <Button variant="primary" icon={Plus} onClick={createPage}>Create a blank page</Button>
          <Button icon={LayoutTemplate} onClick={() => setView('templates')}>Start from a template</Button>
        </div> : null}>{mayCreate ? 'Create your first page, blank or from a ready-made template.' : 'There are no pages to review yet.'}</EmptyState>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: '1 1 240px', maxWidth: 340 }}><SearchInput value={query} onChange={setQuery} placeholder="Search by title or URL…" label="Search pages" /></div>
            <Segmented label="Filter by status" value={filter} onChange={setFilter} options={[
              ['all', `All ${pages.length}`], ['published', `Published ${counts.published}`], ['modified', `Modified ${counts.modified}`], ['draft', `Drafts ${counts.draft}`],
            ]} />
            <div style={{ marginLeft: 'auto', width: 170 }}>
              <Select aria-label="Sort pages" value={sort} onChange={(e) => setSort(e.target.value)} options={[['updated', 'Recently updated'], ['title', 'Title (A–Z)']]} />
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={FileText} title="No pages match" action={<Button onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</Button>} />
          ) : (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead><tr><th>Page</th><th>Status</th><th>Last update</th><th>Author</th><th className="ui-cell-actions">Actions</th></tr></thead>
                <tbody>
                  {shown.map((page) => (
                    <tr key={page.id} onDoubleClick={() => editPage(page)}>
                      <td style={{ maxWidth: 360 }}>
                        <button type="button" onClick={() => editPage(page)} className="ui-cell-title" title="Edit page"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: '#f8fafc', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</span>
                          {Number(page.is_home) ? <Badge tone="accent" icon={Home}>Home</Badge> : null}
                        </button>
                        <div className="ui-cell-muted" style={{ color: '#38bdf8' }}>/{Number(page.is_home) ? '' : (page.clean_slug || 'index')}</div>
                      </td>
                      <td>
                        <StatusBadge status={page.status} />
                        {pageReview(page).state && <div style={{ marginTop: 4 }} data-testid="page-review"><Badge tone={pageReview(page).state === 'pending' ? 'draft' : 'neutral'}>{REVIEW_LABEL[pageReview(page).state]}</Badge></div>}
                      </td>
                      <td className="ui-cell-muted">{formatDate(page.updated_at)}</td>
                      <td className="ui-cell-muted">{page.author || 'admin'}</td>
                      <td className="ui-cell-actions">
                        <span className="ui-row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }}>
                          {page.status !== 'draft' && page.status !== 'draft_new' && (
                            <a href={pageUrl(page)} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" title="View the published page" aria-label={`View ${page.title} online`}><ExternalLink size={14} /></a>
                          )}
                          {mayCreate && <IconButton icon={Copy} label={`Duplicate ${page.title}`} size="sm" onClick={() => duplicatePage(page)} />}
                          <Button variant="primary" size="sm" icon={Edit3} onClick={() => editPage(page)}>Edit</Button>
                          {mayDelete(page) && <IconButton icon={Trash2} label={`Delete ${page.title}`} size="sm" onClick={() => deletePage(page.id)} style={{ color: '#f87171' }} />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
