import React, { useState, useEffect } from 'react';
import { useDraftSync } from '../session/hooks';
import { useStore } from '../store/useStore';
import { PanelTop, PanelBottom, Edit3, Trash2, Save, Palette, Mail, Search, ShieldCheck, Settings2, Cookie, Megaphone } from 'lucide-react';
import RedirectsCard from './RedirectsCard';
import GlobalColorsCard from './GlobalColorsCard';
import TextStylesCard from './TextStylesCard';
import ButtonsFieldsCard from './ButtonsFieldsCard';
import { normalizeTypography } from '../render/typography.mjs';
import { normalizeKit } from '../render/kit.mjs';
import { normalizePalette } from '../editor/palette';
import ImageUrlField from './ImageUrlField';
import { Button, Card, Field, Input, Select, Checkbox, PageHeader } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { renderBlock } from '../render/renderBlock.mjs';
import { safeHtml } from '../utils/safeHtml';
import { isMultilingual, langName, pageFile } from '../editor/languages';
import { __ } from '../i18n/index.js';

const DEFAULT_SETTINGS = { brandColor: '#3b82f6', fontFamily: 'Inter', adminEmail: '', emailFrom: '', emailSubject: '', siteSuffix: ' | My Site' };

export default function GlobalSettings() {
  const { setView, publishSiteAsync, setActivePage, setBlocks, setSelectedBlockId, userRole } = useStore();
  const isAdmin = userRole === 'admin';
  const pages = useStore((st) => st.pages) || [];
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  // Saving before the data arrives (or after it failed) would overwrite the site's data with defaults
  const [loadState, setLoadState] = useState('loading');
  // Local backup of unsaved work (see src/session/)
  const draft = useDraftSync('settings', settings);
  const [restoredAt, setRestoredAt] = useState(null);

  useEffect(() => {
    fetch('api.php?action=get_settings')
      .then(res => res.json())
      .then(data => {
        const server = { ...DEFAULT_SETTINGS, ...(data && typeof data === 'object' ? data : {}) };
        const pending = draft.loaded(server);            // unsaved local draft (expired session, refresh...)
        setSettings(pending ? pending.value : server);
        if (pending) setRestoredAt(pending.savedAt);
        setLoadState('ready');
      })
      .catch(() => { setLoadState('error'); notify(__("Could not load the options from the server. Reload the page before saving."), 'error'); });
  }, [draft]);

  const saveSettings = async () => {
    if (loadState !== 'ready') return;
    setIsSaving(true);
    try {
      const r = await fetch('api.php?action=save_settings', { method: 'POST', body: JSON.stringify(settings) });
      const saved = await r.json();
      if (!saved || !saved.success) {
        notify(__("Global options NOT saved: {0}\nYour changes are still here and backed up on this device.", (saved && saved.message) || 'unexpected response'), 'error');
        setIsSaving(false);
        return;
      }
      draft.saved(settings);
      setRestoredAt(null);
      useStore.getState().setBranding(settings);   // new site name / favicon in the sidebar right away
      useStore.getState().setPalette(normalizePalette(settings));   // the colour fields' swatches follow
      useStore.getState().setTypography(normalizeTypography(settings));   // the text styles of the editor follow
      useStore.getState().setKit(normalizeKit(settings));   // and the button presets and field style
      const pub = await publishSiteAsync();
      if (pub && pub.success) notify(__("Global options saved and site updated."));
      else notify(__("Global options saved, but publishing the site had an issue."), 'error');
    } catch { notify(__("Error saving settings. Your changes are still here and backed up on this device."), 'error'); }
    setIsSaving(false);
  };

  // Languages: a language may have a header and a footer of its own (without one it uses the default language's)
  const langs = useStore((s) => s.languages);
  const multi = isMultilingual(langs);
  const [partLang, setPartLang] = useState('');
  const pl = multi && partLang && partLang !== langs.default && langs.list.some((l) => l.code === partLang) ? partLang : '';
  const plName = pl ? langName(pl, langs) : '';
  const editPart = async (name) => {
    try {
      const res = await fetch('api.php?action=get_parts');
      const parts = await res.json();
      setActivePage({ id: `part_${name}${pl ? ':' + pl : ''}`, __part: name, lang: pl, title: (name === 'header' ? __("Site Header (global)") : __("Site Footer (global)")) + (pl ? ` · ${plName}` : ''), layout: 'full', bg_color: '#ffffff', boxed_width: '1200px', seo_title: '', seo_description: '', status: 'part' });
      // a language that has none yet starts from the default language's blocks (to write over)
      const own = parts[pl ? `${name}:${pl}` : name];
      setBlocks(Array.isArray(own) ? own : (Array.isArray(parts[name]) ? parts[name] : []));
      setSelectedBlockId(null);
      setView('editor');
    } catch { notify(__("Could not open the {0}.", name), 'error'); }
  };
  const deletePart = async (name) => {
    if (!(await confirmDialog({ title: __("Delete the {0}{1}?", pl ? plName + ' ' : 'global ', name), message: pl ? __("{0} goes back to the default language's {1}. This cannot be undone.", plName, name) : __("All its blocks are removed from every page. This cannot be undone."), confirmLabel: __("Delete {0}", name), danger: true }))) return;
    try {
      await fetch('api.php?action=delete_part', { method: 'POST', body: JSON.stringify({ name: pl ? `${name}:${pl}` : name }) });
      await publishSiteAsync();
      notify(__("{0}{1} deleted.", name.charAt(0).toUpperCase() + name.slice(1), pl ? ` in ${plName}` : ''));
    } catch { notify(__("Delete failed."), 'error'); }
  };

  const set = (patch) => setSettings({ ...settings, ...patch });
  const cookie = settings.cookieBanner && typeof settings.cookieBanner === 'object' ? settings.cookieBanner : {};
  const setCookie = (patch) => set({ cookieBanner: { ...cookie, ...patch } });
  const ann = settings.announcement && typeof settings.announcement === 'object' ? settings.announcement : {};
  const setAnn = (patch) => set({ announcement: { ...ann, ...patch } });
  const FONTS = [['Inter', __("Inter (Clean, Modern)")], ['Roboto', __("Roboto (Google Standard)")], ['Poppins', __("Poppins (Soft, Web)")], ['Open Sans', 'Open Sans (Readable)'],
    ['Montserrat', __("Montserrat (Geometric)")], ['Lato', __("Lato (Elegant)")], ['Oswald', __("Oswald (High Impact)")], ['Playfair Display', 'Playfair Display (Elegant Serif)'],
    ['Raleway', __("Raleway (Thin, Chic)")], ['Ubuntu', __("Ubuntu (Tech)")], ['Lora', __("Lora (Editorial Serif)")]];

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon={Settings2} title={__("Global Options")} description={__("Settings that apply to the whole site. Saving also republishes the site.")}
        actions={<Button variant="primary" icon={Save} onClick={saveSettings} disabled={isSaving || loadState !== 'ready'} title={loadState === 'loading' ? __("Loading…") : loadState === 'error' ? __("Not loaded: reload the page") : undefined}>{isSaving ? __("Saving…") : loadState === 'loading' ? __("Loading…") : __("Save & Publish")}</Button>} />

      {restoredAt && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#0c4a6e', border: '1px solid #0369a1', borderRadius: 10, padding: '9px 13px', marginBottom: 16, fontSize: 13, color: '#e0f2fe' }}>
          <span><strong>{__("Restored unsaved changes")}</strong> {__("from")} {new Date(restoredAt).toLocaleString()}{__(". They are")} <strong>{__("not saved to the site yet")}</strong>{__(": click Save &amp; Publish to keep them.")}</span>
          <Button size="sm" variant="ghost" onClick={async () => {
            if (!(await confirmDialog({ title: __("Discard the restored changes?"), message: __("The options go back to their last saved version."), confirmLabel: __("Discard changes"), danger: true }))) return;
            setSettings(draft.discard()); setRestoredAt(null);
          }}>{__("Discard")}</Button>
        </div>
      )}

      <GlobalColorsCard settings={settings} set={set} />
      <TextStylesCard settings={settings} set={set} />

      <ButtonsFieldsCard settings={settings} set={set} />

      <Card title={__("Typography")} icon={Palette} description={__("The site's font. The brand colour is the Primary global colour above.")}>
        <div className="ui-grid">
          <Field label={__("Primary font (Google Fonts)")}>
            <Select value={settings.fontFamily || 'Inter'} onChange={e => set({ fontFamily: e.target.value })} options={FONTS} />
          </Field>
        </div>
        <Checkbox label={__("Let the menu inherit the brand color on hover")} checked={!!settings.menuInheritTheme} onChange={e => set({ menuInheritTheme: e.target.checked })} />
        <p className="ui-hint" style={{ margin: '4px 0 0 24px' }}>{__("When off, the menu uses only its own colors set in the Menu Builder.")}</p>
      </Card>

      <Card title={__("Site identity & SEO")} icon={Search} description={__("How the site appears in browser tabs, search engines and social shares.")}>
        <div className="ui-grid">
          <Field label={__("Site name")}><Input value={settings.siteName || ''} onChange={e => set({ siteName: e.target.value })} placeholder={__("My Site")} /></Field>
          <Field label={__("Site address (for sitemap, social and RSS)")} hint={__("Needed for the RSS feeds of collections (/collection/feed.xml) and for the canonical links.")}><Input value={settings.siteUrl || ''} onChange={e => set({ siteUrl: e.target.value })} placeholder={__("https://www.example.com")} /></Field>
          <Field label={__("Page title suffix")} hint={__("Added to every page title in the browser tab. Leave empty for none.")}>
            <Input value={settings.siteSuffix !== undefined ? settings.siteSuffix : ' | My Site'} onChange={e => set({ siteSuffix: e.target.value })} placeholder={__(" | My Site")} />
          </Field>
          <Field label={__("Favicon")} hint={__("A square image (PNG, SVG or ICO, at least 64×64). Also used as the logo of this admin.")}>
            <ImageUrlField label={__("Favicon")} value={settings.faviconUrl} onChange={(v) => set({ faviconUrl: v })} placeholder={__("/uploads/favicon.png")} accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,image/webp,image/gif,image/jpeg" />
          </Field>
          <Field label={__("Default social image (OG)")} hint={__("Shown when a page is shared on social networks. 1200×630 works best.")}>
            <ImageUrlField label={__("Default social image")} value={settings.defaultOgImage} onChange={(v) => set({ defaultOgImage: v })} placeholder={__("/uploads/og-default.png")} />
          </Field>
        </div>
        <Checkbox label={__("Allow search engines to index the site (robots.txt)")} checked={settings.robotsAllow !== false} onChange={e => set({ robotsAllow: e.target.checked })} />
      </Card>

      <Card title={__("Global header & footer")} icon={PanelTop} description={__("Blocks shown at the top and bottom of every page, under or above the menu.")}>
        {multi && (
          <Field label={__("Language")} hint={pl ? __("{0} uses its own header and footer once you save them; until then it shows the default language's.", plName) : __("The default language. Choose another one to give it a header and a footer of its own.")}>
            <Select aria-label={__("Language of the header and footer")} value={pl} onChange={(e) => setPartLang(e.target.value)} options={[['', `${langName(langs.default, langs)} (default)`], ...langs.list.filter((l) => l.code !== langs.default).map((l) => [l.code, l.name])]} />
          </Field>
        )}
        <div className="ui-grid">
          {[['header', PanelTop], ['footer', PanelBottom]].map(([name, Icon]) => (
            <div key={name} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, textTransform: 'capitalize' }}><Icon size={16} color="#38bdf8" aria-hidden="true" /> {name}</div>
              <Checkbox label={__("Enabled (shown on all pages)")} checked={settings[`${name}Enabled`] !== false} onChange={e => set({ [`${name}Enabled`]: e.target.checked })} />
              <div className="ui-row" style={{ marginTop: 12 }}>
                <Button variant="primary" size="sm" icon={Edit3} onClick={() => editPart(name)} style={{ flex: 1 }}>{__("Edit")} {name}{pl ? ` (${plName})` : ''}</Button>
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => deletePart(name)}>{pl ? __("Use default") : __("Delete")}</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={__("Cookie banner")} icon={Cookie} description={__("A notice at the bottom of every page with Accept and Decline. The visitor's choice is remembered.")}>
        <Checkbox label={__("Show the cookie banner")} checked={!!cookie.enabled} onChange={e => setCookie({ enabled: e.target.checked })} />
        {cookie.enabled && <>
          <Field label={__("Text")}><Input value={cookie.text || ''} onChange={e => setCookie({ text: e.target.value })} placeholder={__("We use cookies to improve your experience and to understand how the site is used.")} /></Field>
          <div className="ui-grid">
            <Field label={__("Accept button")}><Input value={cookie.acceptLabel || ''} onChange={e => setCookie({ acceptLabel: e.target.value })} placeholder={__("Accept")} /></Field>
            <Field label={__("Decline button")}><Input value={cookie.declineLabel || ''} onChange={e => setCookie({ declineLabel: e.target.value })} placeholder={__("Decline")} /></Field>
            <Field label={__("Privacy policy page")}><Select value={cookie.privacyUrl || ''} onChange={e => setCookie({ privacyUrl: e.target.value })}
              options={[['', __("— no link —")], ...pages.filter(p => !Number(p.is_draft_copy)).map(p => [pageFile(p, langs), p.title])]} /></Field>
            <Field label={__("Link text")}><Input value={cookie.privacyLabel || ''} onChange={e => setCookie({ privacyLabel: e.target.value })} placeholder={__("Privacy policy")} /></Field>
            <Field label={__("Position")}><Select value={cookie.position || 'bottom'} onChange={e => setCookie({ position: e.target.value })}
              options={[['bottom', __("Bottom, centered")], ['bottom-left', __("Bottom left")], ['bottom-right', __("Bottom right")]]} /></Field>
          </div>
          <p className="ui-hint">{__("To load a tracking or marketing script only after the visitor accepts, an admin can add it in a Custom HTML block as")} <code>&lt;script type="text/plain" data-cc-consent&gt;…&lt;/script&gt;</code> {__("(embeds:")} <code>&lt;iframe data-cc-consent-src="…"&gt;</code>{__("). Any link with")} <code>data-cc-consent-open</code> {__("shows the banner again.")}</p>
        </>}
      </Card>

      <Card title={__("Announcement bar")} icon={Megaphone} description={__("A message at the top of every page, such as an offer or a notice. Visitors can dismiss it; it comes back when you change the message.")}>
        <Checkbox label={__("Show the announcement bar on every page")} checked={!!ann.enabled} onChange={e => setAnn({ enabled: e.target.checked })} />
        {ann.enabled && <>
          <Field label={__("Message")}><Input value={ann.text || ''} onChange={e => setAnn({ text: e.target.value })} placeholder={__("Free shipping on orders over €50")} /></Field>
          <div className="ui-grid">
            <Field label={__("Icon (one emoji, optional)")}><Input value={ann.icon || ''} onChange={e => setAnn({ icon: e.target.value })} /></Field>
            <Field label={__("Link text (empty = no link)")}><Input value={ann.linkText || ''} onChange={e => setAnn({ linkText: e.target.value })} placeholder={__("Shop now")} /></Field>
            <Field label={__("Link to a page")}><Select value={pages.some(p => !Number(p.is_draft_copy) && (pageFile(p, langs)) === ann.linkUrl) ? ann.linkUrl : ''} onChange={e => setAnn({ linkUrl: e.target.value })}
              options={[['', __("— or type an address —")], ...pages.filter(p => !Number(p.is_draft_copy)).map(p => [pageFile(p, langs), p.title])]} /></Field>
            <Field label={__("Link address")}><Input value={ann.linkUrl || ''} onChange={e => setAnn({ linkUrl: e.target.value })} placeholder={__("/offers or https://…")} /></Field>
            <Field label={__("Colors")}><Select value={ann.preset || 'info'} onChange={e => setAnn({ preset: e.target.value })}
              options={[['info', __("Dark")], ['promo', __("Brand color")], ['warning', __("Warning (yellow)")], ['success', __("Success (green)")]]} /></Field>
            <Field label={__("Alignment")}><Select value={ann.align === 'left' ? 'left' : 'center'} onChange={e => setAnn({ align: e.target.value })} options={[['center', __("Centered")], ['left', __("Left")]]} /></Field>
          </div>
          <Checkbox label={__("Stay at the top while scrolling")} checked={ann.sticky === true} onChange={e => setAnn({ sticky: e.target.checked })} />
          <Checkbox label={__("Visitors can dismiss it")} checked={ann.dismissible !== false} onChange={e => setAnn({ dismissible: e.target.checked })} />
          {String(ann.text || '').trim() !== '' && (
            <div style={{ marginTop: 12 }}>
              <div className="ui-hint" style={{ marginBottom: 6 }}>{__("Preview")}</div>
              <div className="cc-ann-preview" style={{ borderRadius: 8, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: safeHtml(renderBlock({ id: 'ann_preview', type: 'ANNOUNCEMENT_BAR', styles: {}, content: { ...ann, sticky: false } })) }} />
            </div>
          )}
        </>}
      </Card>

      {isAdmin && <RedirectsCard />}

      {isAdmin && <>
      <Card title={__("Form emails")} icon={Mail} description={__("Where messages sent through the site's forms are delivered.")}>
        <Field label={__("Default receiving email (To)")} hint={__("Used by forms that don't have their own receiving email.")}>
          <Input type="email" value={settings.adminEmail || ''} onChange={e => set({ adminEmail: e.target.value })} placeholder={__("admin@yoursite.com")} />
        </Field>
        <div className="ui-grid">
          <Field label={__("Sender email (From)")}><Input type="email" value={settings.emailFrom || ''} onChange={e => set({ emailFrom: e.target.value })} placeholder={__("noreply@yoursite.com")} /></Field>
          <Field label={__("Default subject")}><Input value={settings.emailSubject || ''} onChange={e => set({ emailSubject: e.target.value })} placeholder={__("New submission from your website")} /></Field>
        </div>
      </Card>

      <Card title={__("Security")} icon={ShieldCheck}>
        <Field label={__("Session timeout (minutes of inactivity)")} hint={__("Between 5 and 720 (12 h). Working in the editor counts as activity. When it expires you are asked to sign in again and your unsaved work is kept.")}>
          <Input type="number" min="5" max="720" value={settings.sessionTimeoutMinutes ?? 30} onChange={e => set({ sessionTimeoutMinutes: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} style={{ maxWidth: 160 }} />
        </Field>
        <Field label={__("Trusted proxy addresses")} hint={__("Only if the site is behind a reverse proxy or CDN: the proxy's IP addresses, separated by commas. Login protection and form spam limits then use each visitor's real address. Leave empty otherwise.")}>
          <Input value={settings.trustedProxies || ''} onChange={e => set({ trustedProxies: e.target.value })} placeholder="e.g. 10.0.0.2, 10.0.0.3" />
        </Field>
      </Card>
      </>}
    </div>
  );
}
