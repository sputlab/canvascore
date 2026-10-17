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
      .catch(() => { setLoadState('error'); notify('Could not load the options from the server. Reload the page before saving.', 'error'); });
  }, [draft]);

  const saveSettings = async () => {
    if (loadState !== 'ready') return;
    setIsSaving(true);
    try {
      const r = await fetch('api.php?action=save_settings', { method: 'POST', body: JSON.stringify(settings) });
      const saved = await r.json();
      if (!saved || !saved.success) {
        notify('Global options NOT saved: ' + ((saved && saved.message) || 'unexpected response') + '\nYour changes are still here and backed up on this device.', 'error');
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
      if (pub && pub.success) notify('Global options saved and site updated.');
      else notify('Global options saved, but publishing the site had an issue.', 'error');
    } catch { notify('Error saving settings. Your changes are still here and backed up on this device.', 'error'); }
    setIsSaving(false);
  };

  const editPart = async (name) => {
    try {
      const res = await fetch('api.php?action=get_parts');
      const parts = await res.json();
      setActivePage({ id: `part_${name}`, __part: name, title: name === 'header' ? 'Site Header (global)' : 'Site Footer (global)', layout: 'full', bg_color: '#ffffff', boxed_width: '1200px', seo_title: '', seo_description: '', status: 'part' });
      setBlocks(Array.isArray(parts[name]) ? parts[name] : []);
      setSelectedBlockId(null);
      setView('editor');
    } catch { notify('Could not open the ' + name + '.', 'error'); }
  };
  const deletePart = async (name) => {
    if (!(await confirmDialog({ title: `Delete the global ${name}?`, message: 'All its blocks are removed from every page. This cannot be undone.', confirmLabel: `Delete ${name}`, danger: true }))) return;
    try {
      await fetch('api.php?action=delete_part', { method: 'POST', body: JSON.stringify({ name }) });
      await publishSiteAsync();
      notify(`${name.charAt(0).toUpperCase() + name.slice(1)} deleted.`);
    } catch { notify('Delete failed.', 'error'); }
  };

  const set = (patch) => setSettings({ ...settings, ...patch });
  const cookie = settings.cookieBanner && typeof settings.cookieBanner === 'object' ? settings.cookieBanner : {};
  const setCookie = (patch) => set({ cookieBanner: { ...cookie, ...patch } });
  const ann = settings.announcement && typeof settings.announcement === 'object' ? settings.announcement : {};
  const setAnn = (patch) => set({ announcement: { ...ann, ...patch } });
  const FONTS = [['Inter', 'Inter (Clean, Modern)'], ['Roboto', 'Roboto (Google Standard)'], ['Poppins', 'Poppins (Soft, Web)'], ['Open Sans', 'Open Sans (Readable)'],
    ['Montserrat', 'Montserrat (Geometric)'], ['Lato', 'Lato (Elegant)'], ['Oswald', 'Oswald (High Impact)'], ['Playfair Display', 'Playfair Display (Elegant Serif)'],
    ['Raleway', 'Raleway (Thin, Chic)'], ['Ubuntu', 'Ubuntu (Tech)'], ['Lora', 'Lora (Editorial Serif)']];

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon={Settings2} title="Global Options" description="Settings that apply to the whole site. Saving also republishes the site."
        actions={<Button variant="primary" icon={Save} onClick={saveSettings} disabled={isSaving || loadState !== 'ready'} title={loadState === 'loading' ? 'Loading…' : loadState === 'error' ? 'Not loaded: reload the page' : undefined}>{isSaving ? 'Saving…' : loadState === 'loading' ? 'Loading…' : 'Save & Publish'}</Button>} />

      {restoredAt && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#0c4a6e', border: '1px solid #0369a1', borderRadius: 10, padding: '9px 13px', marginBottom: 16, fontSize: 13, color: '#e0f2fe' }}>
          <span><strong>Restored unsaved changes</strong> from {new Date(restoredAt).toLocaleString()}. They are <strong>not saved to the site yet</strong>: click Save &amp; Publish to keep them.</span>
          <Button size="sm" variant="ghost" onClick={async () => {
            if (!(await confirmDialog({ title: 'Discard the restored changes?', message: 'The options go back to their last saved version.', confirmLabel: 'Discard changes', danger: true }))) return;
            setSettings(draft.discard()); setRestoredAt(null);
          }}>Discard</Button>
        </div>
      )}

      <GlobalColorsCard settings={settings} set={set} />
      <TextStylesCard settings={settings} set={set} />

      <ButtonsFieldsCard settings={settings} set={set} />

      <Card title="Typography" icon={Palette} description="The site's font. The brand colour is the Primary global colour above.">
        <div className="ui-grid">
          <Field label="Primary font (Google Fonts)">
            <Select value={settings.fontFamily || 'Inter'} onChange={e => set({ fontFamily: e.target.value })} options={FONTS} />
          </Field>
        </div>
        <Checkbox label="Let the menu inherit the brand color on hover" checked={!!settings.menuInheritTheme} onChange={e => set({ menuInheritTheme: e.target.checked })} />
        <p className="ui-hint" style={{ margin: '4px 0 0 24px' }}>When off, the menu uses only its own colors set in the Menu Builder.</p>
      </Card>

      <Card title="Site identity & SEO" icon={Search} description="How the site appears in browser tabs, search engines and social shares.">
        <div className="ui-grid">
          <Field label="Site name"><Input value={settings.siteName || ''} onChange={e => set({ siteName: e.target.value })} placeholder="My Site" /></Field>
          <Field label="Site address (for sitemap, social and RSS)" hint="Needed for the RSS feeds of collections (/collection/feed.xml) and for the canonical links."><Input value={settings.siteUrl || ''} onChange={e => set({ siteUrl: e.target.value })} placeholder="https://www.example.com" /></Field>
          <Field label="Page title suffix" hint="Added to every page title in the browser tab. Leave empty for none.">
            <Input value={settings.siteSuffix !== undefined ? settings.siteSuffix : ' | My Site'} onChange={e => set({ siteSuffix: e.target.value })} placeholder=" | My Site" />
          </Field>
          <Field label="Favicon" hint="A square image (PNG, SVG or ICO, at least 64×64). Also used as the logo of this admin.">
            <ImageUrlField label="Favicon" value={settings.faviconUrl} onChange={(v) => set({ faviconUrl: v })} placeholder="/uploads/favicon.png" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,image/webp,image/gif,image/jpeg" />
          </Field>
          <Field label="Default social image (OG)" hint="Shown when a page is shared on social networks. 1200×630 works best.">
            <ImageUrlField label="Default social image" value={settings.defaultOgImage} onChange={(v) => set({ defaultOgImage: v })} placeholder="/uploads/og-default.png" />
          </Field>
        </div>
        <Checkbox label="Allow search engines to index the site (robots.txt)" checked={settings.robotsAllow !== false} onChange={e => set({ robotsAllow: e.target.checked })} />
      </Card>

      <Card title="Global header & footer" icon={PanelTop} description="Blocks shown at the top and bottom of every page, under or above the menu.">
        <div className="ui-grid">
          {[['header', PanelTop], ['footer', PanelBottom]].map(([name, Icon]) => (
            <div key={name} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, textTransform: 'capitalize' }}><Icon size={16} color="#38bdf8" aria-hidden="true" /> {name}</div>
              <Checkbox label="Enabled (shown on all pages)" checked={settings[`${name}Enabled`] !== false} onChange={e => set({ [`${name}Enabled`]: e.target.checked })} />
              <div className="ui-row" style={{ marginTop: 12 }}>
                <Button variant="primary" size="sm" icon={Edit3} onClick={() => editPart(name)} style={{ flex: 1 }}>Edit {name}</Button>
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => deletePart(name)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Cookie banner" icon={Cookie} description="A notice at the bottom of every page with Accept and Decline. The visitor's choice is remembered.">
        <Checkbox label="Show the cookie banner" checked={!!cookie.enabled} onChange={e => setCookie({ enabled: e.target.checked })} />
        {cookie.enabled && <>
          <Field label="Text"><Input value={cookie.text || ''} onChange={e => setCookie({ text: e.target.value })} placeholder="We use cookies to improve your experience and to understand how the site is used." /></Field>
          <div className="ui-grid">
            <Field label="Accept button"><Input value={cookie.acceptLabel || ''} onChange={e => setCookie({ acceptLabel: e.target.value })} placeholder="Accept" /></Field>
            <Field label="Decline button"><Input value={cookie.declineLabel || ''} onChange={e => setCookie({ declineLabel: e.target.value })} placeholder="Decline" /></Field>
            <Field label="Privacy policy page"><Select value={cookie.privacyUrl || ''} onChange={e => setCookie({ privacyUrl: e.target.value })}
              options={[['', '— no link —'], ...pages.filter(p => !Number(p.is_draft_copy)).map(p => [p.clean_slug ? p.clean_slug + '/index.html' : 'index.html', p.title])]} /></Field>
            <Field label="Link text"><Input value={cookie.privacyLabel || ''} onChange={e => setCookie({ privacyLabel: e.target.value })} placeholder="Privacy policy" /></Field>
            <Field label="Position"><Select value={cookie.position || 'bottom'} onChange={e => setCookie({ position: e.target.value })}
              options={[['bottom', 'Bottom, centered'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']]} /></Field>
          </div>
          <p className="ui-hint">To load a tracking or marketing script only after the visitor accepts, an admin can add it in a Custom HTML block as <code>&lt;script type="text/plain" data-cc-consent&gt;…&lt;/script&gt;</code> (embeds: <code>&lt;iframe data-cc-consent-src="…"&gt;</code>). Any link with <code>data-cc-consent-open</code> shows the banner again.</p>
        </>}
      </Card>

      <Card title="Announcement bar" icon={Megaphone} description="A message at the top of every page, such as an offer or a notice. Visitors can dismiss it; it comes back when you change the message.">
        <Checkbox label="Show the announcement bar on every page" checked={!!ann.enabled} onChange={e => setAnn({ enabled: e.target.checked })} />
        {ann.enabled && <>
          <Field label="Message"><Input value={ann.text || ''} onChange={e => setAnn({ text: e.target.value })} placeholder="Free shipping on orders over €50" /></Field>
          <div className="ui-grid">
            <Field label="Icon (one emoji, optional)"><Input value={ann.icon || ''} onChange={e => setAnn({ icon: e.target.value })} /></Field>
            <Field label="Link text (empty = no link)"><Input value={ann.linkText || ''} onChange={e => setAnn({ linkText: e.target.value })} placeholder="Shop now" /></Field>
            <Field label="Link to a page"><Select value={pages.some(p => !Number(p.is_draft_copy) && (p.clean_slug ? p.clean_slug + '/index.html' : 'index.html') === ann.linkUrl) ? ann.linkUrl : ''} onChange={e => setAnn({ linkUrl: e.target.value })}
              options={[['', '— or type an address —'], ...pages.filter(p => !Number(p.is_draft_copy)).map(p => [p.clean_slug ? p.clean_slug + '/index.html' : 'index.html', p.title])]} /></Field>
            <Field label="Link address"><Input value={ann.linkUrl || ''} onChange={e => setAnn({ linkUrl: e.target.value })} placeholder="/offers or https://…" /></Field>
            <Field label="Colors"><Select value={ann.preset || 'info'} onChange={e => setAnn({ preset: e.target.value })}
              options={[['info', 'Dark'], ['promo', 'Brand color'], ['warning', 'Warning (yellow)'], ['success', 'Success (green)']]} /></Field>
            <Field label="Alignment"><Select value={ann.align === 'left' ? 'left' : 'center'} onChange={e => setAnn({ align: e.target.value })} options={[['center', 'Centered'], ['left', 'Left']]} /></Field>
          </div>
          <Checkbox label="Stay at the top while scrolling" checked={ann.sticky === true} onChange={e => setAnn({ sticky: e.target.checked })} />
          <Checkbox label="Visitors can dismiss it" checked={ann.dismissible !== false} onChange={e => setAnn({ dismissible: e.target.checked })} />
          {String(ann.text || '').trim() !== '' && (
            <div style={{ marginTop: 12 }}>
              <div className="ui-hint" style={{ marginBottom: 6 }}>Preview</div>
              <div className="cc-ann-preview" style={{ borderRadius: 8, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: safeHtml(renderBlock({ id: 'ann_preview', type: 'ANNOUNCEMENT_BAR', styles: {}, content: { ...ann, sticky: false } })) }} />
            </div>
          )}
        </>}
      </Card>

      {isAdmin && <RedirectsCard />}

      {isAdmin && <>
      <Card title="Form emails" icon={Mail} description="Where messages sent through the site's forms are delivered.">
        <Field label="Default receiving email (To)" hint="Used by forms that don't have their own receiving email.">
          <Input type="email" value={settings.adminEmail || ''} onChange={e => set({ adminEmail: e.target.value })} placeholder="admin@yoursite.com" />
        </Field>
        <div className="ui-grid">
          <Field label="Sender email (From)"><Input type="email" value={settings.emailFrom || ''} onChange={e => set({ emailFrom: e.target.value })} placeholder="noreply@yoursite.com" /></Field>
          <Field label="Default subject"><Input value={settings.emailSubject || ''} onChange={e => set({ emailSubject: e.target.value })} placeholder="New submission from your website" /></Field>
        </div>
      </Card>

      <Card title="Security" icon={ShieldCheck}>
        <Field label="Session timeout (minutes of inactivity)" hint="Between 5 and 720 (12 h). Working in the editor counts as activity. When it expires you are asked to sign in again and your unsaved work is kept.">
          <Input type="number" min="5" max="720" value={settings.sessionTimeoutMinutes ?? 30} onChange={e => set({ sessionTimeoutMinutes: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} style={{ maxWidth: 160 }} />
        </Field>
        <Field label="Trusted proxy addresses" hint="Only if the site is behind a reverse proxy or CDN: the proxy's IP addresses, separated by commas. Login protection and form spam limits then use each visitor's real address. Leave empty otherwise.">
          <Input value={settings.trustedProxies || ''} onChange={e => set({ trustedProxies: e.target.value })} placeholder="e.g. 10.0.0.2, 10.0.0.3" />
        </Field>
      </Card>
      </>}
    </div>
  );
}
