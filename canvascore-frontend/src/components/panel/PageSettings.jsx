import React, { useState } from 'react';
import MediaPickerModal from '../MediaPickerModal';
import { Layout, Globe, FileEdit, Upload } from 'lucide-react';
import { PanelAccordion, ImgF, ChkF } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { slugify, slugOwner, uniqueSlug } from '../../utils/slug';
import ItemFieldsSection from './ItemFieldsSection';
import ItemTermsSection from './ItemTermsSection';
import ScheduleSection from './ScheduleSection';
import PopupSettings from './PopupSettings';
import LanguageSection from './LanguageSection';
import { useStore } from '../../store/useStore';
import { __ } from '../../i18n/index.js';

// Page settings, shown when no block is selected: page info, URL, structure, SEO (and item fields for collection items).
export default function PageSettings({ ctx }) {
  const { activePage, updateActivePage, pages, collections, coverInputRef } = ctx;
  const [sharePicker, setSharePicker] = useState(false);
  const langs = useStore((s) => s.languages);
  if (activePage?.__popup) return <PopupSettings ctx={ctx} />;   // a popup has its own settings (look, triggers, display rules)
  // Hide the draft suffix from the user in the UI to avoid confusion
  const displaySlug = activePage?.slug || '';
  // Pages and collections share the top-level URLs (collection items are checked by the server)
  // (an address belongs to one language: the same slug can be used once in each)
  const slugCtx = { pages, collections, pageId: activePage?.id, parentId: activePage?.parent_id, lang: activePage?.lang || '', cfg: langs };
  const slugTakenBy = activePage?.__item ? null : slugOwner(slugify(displaySlug), slugCtx);

  return (
    <div style={{ paddingBottom: '40px', color: '#f8fafc' }}>
      <div style={{ padding: '15px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a', position: 'sticky', top: 0, zIndex: 10 }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', color: '#38bdf8' }}><FileEdit size={16} /> {__("Page Settings")}</h3>
      </div>
      <div style={{ padding: '12px' }}>

        {activePage?.__item && (
          <PanelAccordion title={__("Item Settings")} icon={FileEdit} defaultOpen={true}>
            <label style={labelStyle}>{__("Status")}</label>
            <select style={inputStyle} value={activePage.status || 'draft'} onChange={e => updateActivePage({ status: e.target.value })}>
              <option value="draft">{__("Draft (not published)")}</option>
              <option value="published">{__("Published")}</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', margin: '12px 0' }}>
              <input type="checkbox" checked={!!activePage.archived} onChange={e => updateActivePage({ archived: e.target.checked })} /> {__("Archived (moved to the archive list)")}
            </label>

            <label style={labelStyle}>{__("Date")}</label>
            <input type="date" style={inputStyle} value={activePage.date || ''} onChange={e => updateActivePage({ date: e.target.value })} />

            <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Cover image")}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" style={{ ...inputStyle, flex: 1 }} value={activePage.cover_image || ''} onChange={e => updateActivePage({ cover_image: e.target.value })} placeholder={__("/uploads/cover.jpg")} />
              <button onClick={() => coverInputRef.current && coverInputRef.current.click()} style={{ padding: '0 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Upload size={13} /></button>
              <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                const f = e.target.files[0]; e.target.value = ''; if (!f) return;
                const fd = new FormData(); fd.append('file', f);
                try { const r = await fetch('api.php?action=upload_media', { method: 'POST', body: fd }); const d = await r.json(); if (d.success && d.url) updateActivePage({ cover_image: d.url }); } catch { /* noop */ }
              }} />
            </div>
            {activePage.cover_image && <img src={activePage.cover_image} alt="" style={{ marginTop: '8px', width: '100%', borderRadius: '8px', display: 'block' }} />}

            <label style={{ ...labelStyle, marginTop: '12px' }}>{__("Excerpt")}</label>
            <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={activePage.excerpt || ''} onChange={e => updateActivePage({ excerpt: e.target.value })} placeholder={__("Short summary shown in lists")} />
          </PanelAccordion>
        )}

        {!activePage?.__part && !activePage?.__design && <LanguageSection activePage={activePage} updateActivePage={updateActivePage} pages={pages} />}
        {!activePage?.__part && !activePage?.__design && <ScheduleSection activePage={activePage} updateActivePage={updateActivePage} />}
        {activePage?.__item && <ItemFieldsSection activePage={activePage} updateActivePage={updateActivePage} />}
        {activePage?.__item && <ItemTermsSection activePage={activePage} updateActivePage={updateActivePage} />}

        {activePage?.__design && (
          <PanelAccordion title={__("Dynamic values")} icon={FileEdit} defaultOpen={true}>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.45 }}>
              {__("Type one of these in any text, button, image or link of the design. Each item page shows its own value.")}
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '12px', color: '#cbd5e1', display: 'grid', gap: 4 }}>
              {(activePage.__fieldDefs || []).map((d) => <li key={d.id}><code style={{ color: '#38bdf8' }}>{`{{field:${d.key}}}`}</code> {d.label}{d.type === 'link' ? <> · <code style={{ color: '#38bdf8' }}>{`{{field:${d.key}.text}}`}</code> {__("text")}</> : null}</li>)}
              <li><code style={{ color: '#38bdf8' }}>{'{{item:title}}'}</code> {__("the item's title")}</li>
              <li><code style={{ color: '#38bdf8' }}>{'{{item:excerpt}}'}</code> {__("the excerpt")}</li>
              <li><code style={{ color: '#38bdf8' }}>{'{{item:date}}'}</code> {__("the date, written out")}</li>
              <li><code style={{ color: '#38bdf8' }}>{'{{item:url}}'}</code> {__("the item's address, for share links")}</li>
            </ul>
            {(activePage.__fieldDefs || []).length === 0 && <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>{__("This collection has no fields yet (Collections › Fields).")}</p>}
          </PanelAccordion>
        )}

        <PanelAccordion title={__("Page Info")} icon={FileEdit} defaultOpen={!activePage?.__item}>
          <label style={labelStyle}>{__("Internal Title")}</label>
          <input type="text" value={activePage?.title || ''} onChange={(e) => {
            const title = e.target.value;
            const published = ['published', 'modified'].includes(activePage?.status);
            const autoSlug = !activePage?._slugEdited && !published && !Number(activePage?.is_draft_copy);
            if (autoSlug) updateActivePage({ title, slug: activePage?.__item ? slugify(title) : uniqueSlug(title, slugCtx) });
            else updateActivePage({ title });
          }} style={inputStyle} />

          <label style={labelStyle}>{__("URL (Slug)")}</label>
          <input type="text" value={displaySlug} onChange={(e) => {
            const cleanedSlug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            updateActivePage({ slug: cleanedSlug, _slugEdited: true });
          }} onBlur={(e) => updateActivePage({ slug: slugify(e.target.value), _slugEdited: true })} style={{ ...inputStyle, ...(slugTakenBy ? { borderColor: '#f87171' } : {}) }} aria-invalid={slugTakenBy ? true : undefined} />
          {slugTakenBy && (
            <p role="alert" style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#fca5a5' }}>
              /{slugify(displaySlug)}{__("/ is already used by")} {slugTakenBy.label}{slugTakenBy.live
                ? __(". Choose another slug: this page cannot be published with it.")
                : __(" (a draft). Choose another slug: only one of the two pages could be published.")}
            </p>
          )}
        </PanelAccordion>

        <PanelAccordion title={__("Page Structure")} icon={Layout} defaultOpen={false}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#f8fafc', fontWeight: 'bold', marginBottom: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!Number(activePage?.is_home)} onChange={e => updateActivePage({ is_home: e.target.checked ? 1 : 0 })} style={{ width: '16px', height: '16px' }} />
            {__("Set as Homepage (site root)")}
          </label>
          <p style={{ margin: '0 0 15px 0', fontSize: '11px', color: '#64748b' }}>{__("The homepage is published at the site root (index.html), whatever its slug is.")}</p>
          <label style={labelStyle}>{__("Page Layout")}</label>
          <select style={inputStyle} value={activePage?.layout || 'boxed'} onChange={e => updateActivePage({layout: e.target.value})}>
            <option value="boxed">{__("Boxed (Centered)")}</option>
            <option value="full">{__("Full Width")}</option>
          </select>
          {activePage?.layout !== 'full' && (
            <>
              <label style={labelStyle}>{__("Maximum Width (e.g. 1200px or 90%)")}</label>
              <input type="text" style={inputStyle} value={activePage?.boxed_width || '1200px'} onChange={e => updateActivePage({boxed_width: e.target.value})} />
            </>
          )}
          <label style={labelStyle}>{__("Background Color")}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="color" value={activePage?.bg_color || '#ffffff'} onChange={e => updateActivePage({bg_color: e.target.value})} style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={activePage?.bg_color || '#ffffff'} onChange={e => updateActivePage({bg_color: e.target.value})} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          </div>
        </PanelAccordion>

        <PanelAccordion title={__("SEO & Meta Data")} icon={Globe} defaultOpen={false}>
          <label style={labelStyle}>{__("Meta Title")} <Count n={(activePage?.seo_title || '').length} max={60} /></label>
          <input type="text" value={activePage?.seo_title || ''} onChange={e => updateActivePage({seo_title: e.target.value})} style={inputStyle} placeholder={activePage?.title || ''} />
          <label style={labelStyle}>{__("Meta Description")} <Count n={(activePage?.seo_description || '').length} max={160} /></label>
          <textarea value={activePage?.seo_description || ''} onChange={e => updateActivePage({seo_description: e.target.value})} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder={__("One or two sentences that make people want to click")} />
          {activePage?.__item ? (
            <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>{__("When this item is shared, its cover image is used as the picture.")}</p>
          ) : <>
            <ImgF label={__("Social share image")} value={activePage?.seo_image || ''} onChange={v => updateActivePage({ seo_image: v })} onPick={() => setSharePicker(true)} />
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>{__("Shown when the page is shared on social networks and chats (best 1200×630). Empty = the site's default share image.")}</p>
          </>}
          <SnippetPreview page={activePage?.__item ? { ...activePage, seo_image: activePage.cover_image } : activePage} />
          {!activePage?.__item && <>
            <ChkF label={__("Hide this page from search engines")} checked={!!Number(activePage?.noindex)} onChange={v => updateActivePage({ noindex: v ? 1 : 0 })} />
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>{__("Adds “noindex”, leaves it out of the sitemap and of the site search. Useful for thank-you pages, drafts of campaigns, legal pages.")}</p>
          </>}
          {sharePicker && <MediaPickerModal onClose={() => setSharePicker(false)} onSelect={(url) => { updateActivePage({ seo_image: url }); setSharePicker(false); }} />}
        </PanelAccordion>
      </div>
    </div>
  );
}

// "52 / 60" next to a field: green within the recommended length, amber above it
function Count({ n, max }) {
  return <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 10.5, color: n === 0 ? '#64748b' : n <= max ? '#34d399' : '#fbbf24' }}>{n} / {max}</span>;
}

// How the page looks in a search result and as a shared link
function SnippetPreview({ page }) {
  const title = (page?.seo_title || page?.title || __("Page title")).slice(0, 70);
  const desc = (page?.seo_description || __("Add a meta description: it is the text shown under the title in search results.")).slice(0, 170);
  const path = !page?.slug || page.slug === 'index' || Number(page.is_home) ? '' : page.slug + '/';
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', fontFamily: 'arial, sans-serif' }} aria-label={__("Search result preview")}>
        <div style={{ fontSize: 11.5, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{__("yoursite.com ›")} {path || 'home'}</div>
        <div style={{ fontSize: 16, color: '#1a0dab', lineHeight: 1.3, margin: '2px 0' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: '#4d5156', lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }} aria-label={__("Shared link preview")}>
        {page?.seo_image
          ? <img src={page.seo_image} alt="" style={{ display: 'block', width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover', background: '#e2e8f0' }} />
          : <div style={{ aspectRatio: '1.91 / 1', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>{__("Default share image")}</div>}
        <div style={{ padding: '8px 10px', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
        </div>
      </div>
    </div>
  );
}
