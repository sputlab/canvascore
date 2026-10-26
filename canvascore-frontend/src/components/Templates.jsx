import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { notify } from '../ui/notify';
import { uniqueSlug } from '../utils/slug';
import { LayoutTemplate, Plus, FileText, Store } from 'lucide-react';
import { Button, PageHeader, EmptyState } from '../ui/kit';
import { fetchStarters, starterBlocks, starterOutline } from '../editor/starters';
import { __ } from '../i18n/index.js';

const newPageId = () => 'page-' + Date.now();

export default function Templates() {
  const { setView, setActivePage, setBlocks, setSelectedBlockId, pages, setPages, userRole } = useStore();
  const [starters, setStarters] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStarters().then(setStarters);
  }, []);

  const applyStarter = async (starter) => {
    setBusy(true);
    const id = newPageId();
    const blocks = starterBlocks(starter);
    // The slug follows the title, as for a new blank page (and skips slugs already in use)
    const title = starter.name === 'Blank' ? __("New Page") : starter.name;
    const slug = uniqueSlug(title, { pages });
    const newPage = {
      id, title, slug, clean_slug: slug,
      layout: 'boxed', boxed_width: '1200px', bg_color: '#ffffff',
      seo_title: '', seo_description: '', content_json: JSON.stringify(blocks),
      status: 'draft', is_draft_copy: 0, parent_id: null, is_home: 0,
    };
    try {
      const data = await (await fetch('api.php?action=save_page', { method: 'POST', body: JSON.stringify({ ...newPage, blocks, publish: false }) })).json();
      if (!data || data.success === false) { notify(__("Could not create the page: {0}", (data && data.message) || 'unexpected answer'), 'error'); setBusy(false); return; }
    } catch { notify(__("Could not create the page (connection problem)."), 'error'); setBusy(false); return; }
    setPages([newPage, ...pages]);
    setActivePage(newPage);
    setBlocks(blocks);
    setSelectedBlockId(null);
    setBusy(false);
    setView('editor');
  };

  const outline = starterOutline;

  return (
    <>
      <PageHeader icon={LayoutTemplate} title={__("Start from a template")}
        description={__("Pick a starting point. It creates a new draft page you can fully edit.")}
        actions={userRole === 'admin' && <Button icon={Store} onClick={() => setView('library')}>{__("Browse the online library")}</Button>} />
      {starters.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title={__("No templates available")} />
      ) : (
        <div className="ui-grid" style={{ '--ui-min': '240px', gap: 16 }}>
          {starters.map(st => (
            <article key={st.id} className="ui-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', margin: 0 }}>
              <div style={{ height: 96, background: 'linear-gradient(135deg, #0f172a, #1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                {st.id === 'blank' ? <Plus size={32} aria-hidden="true" /> : <FileText size={32} aria-hidden="true" />}
              </div>
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15, color: '#f8fafc' }}>{st.name}</h2>
                <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>{st.description}</p>
                {outline(st).length > 0 && (
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.5 }} title={__("Sections in this template")}>{outline(st).join(' · ')}</p>
                )}
                <div style={{ flex: 1 }} />
                <Button variant="primary" block disabled={busy} onClick={() => applyStarter(st)}>{__("Use template")}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
