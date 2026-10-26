// Admin shell: a persistent sidebar to move between sections (no more "Back to Dashboard" round trips),
// the signed-in user, logout and the version. The page editor is full screen and does not use it.
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  FileText, LayoutTemplate, Library, Image as ImageIcon, ListTree, Palette, Inbox, Users, LogOut, Globe,
  Menu as MenuIcon, X, DatabaseBackup, KeyRound, Info, ExternalLink, CircleArrowUp, Package, DownloadCloud, ClipboardCheck, Store, Plug, AppWindow, Languages as LanguagesIcon,
} from 'lucide-react';
import { Button } from '../ui/kit';
import ChangePasswordDialog from './ChangePasswordDialog';
import AboutDialog from './AboutDialog';
import { BrandLogo } from '../ui/BrandLogo';
import { notify } from '../ui/notify';
import { canManageSite, canPublishSite, canReview, roleLabel } from '../session/permissions';
import { __ } from '../i18n/index.js';
import LocaleSelect from './LocaleSelect.jsx';

const NAV = [
  { group: __("Content"), items: [
    { view: 'manager', label: __("Pages"), icon: FileText },
    { view: 'collections', label: __("Collections"), icon: Library },
    { view: 'reviews', label: __("Reviews"), authorLabel: __("My submissions"), icon: ClipboardCheck },
    { view: 'templates', label: __("Templates"), icon: LayoutTemplate, site: true },
    { view: 'popups', label: __("Popups"), icon: AppWindow, site: true },
    { view: 'media', label: __("Media"), icon: ImageIcon },
  ] },
  { group: __("Site"), site: true, items: [
    { view: 'menu', label: __("Menu"), icon: ListTree },
    { view: 'settings', label: __("Global Options"), icon: Palette },
  ] },
  { group: __("Administration"), admin: true, items: [
    { view: 'submissions', label: __("Submissions"), icon: Inbox },
    { view: 'users', label: __("Accounts"), icon: Users },
    { view: 'backup', label: __("Backup"), icon: DatabaseBackup },
    { view: 'updates', label: __("Updates"), icon: CircleArrowUp },
    { view: 'packages', label: __("Block packages"), icon: Package },
    { view: 'library', label: __("Template library"), icon: Store },
    { view: 'languages', label: __("Languages"), icon: LanguagesIcon },
    { view: 'integrations', label: __("Integrations"), icon: Plug },
    { view: 'wpimport', label: __("Import from WordPress"), icon: DownloadCloud },
  ] },
];

export default function AdminLayout({ children, wide }) {
  const { currentView, setView, userRole, username, logout, publishSiteAsync, appVersion, appBuild, serverVersion } = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const siteName = useStore((s) => s.branding.siteName) || __("My Site");
  const demo = useStore((s) => s.demo);
  const version = (serverVersion && serverVersion.app) || appVersion || '0.0.0';
  const build = (serverVersion && serverVersion.build) || appBuild;

  const go = (view) => { setView(view); setNavOpen(false); };
  const publish = async () => {
    setPublishing(true);
    const res = await publishSiteAsync();
    setPublishing(false);
    if (res && res.success) notify(res.message || __("Site published."));
    else notify(res && res.message || __("Publish failed."), 'error');
    if (res && res.success) useStore.getState().refreshPages();
  };

  return (
    <div className="ui-shell" data-nav-open={navOpen}>
      <aside className="ui-sidebar" aria-label={__("Main navigation")}>
        <div className="ui-brand" title={siteName}><BrandLogo /> <span className="ui-brand__name">{siteName}</span></div>
        <div style={{ padding: '0 12px 6px' }}>
          {canPublishSite(userRole) && (
            <Button variant="success" block icon={Globe} onClick={publish} disabled={publishing} title={__("Rebuild and publish the whole site")}>
              {publishing ? __("Publishing…") : __("Publish Site")}
            </Button>
          )}
          {/* The published site's home page: the folder above canvascore-admin/ */}
          <a className="ui-btn ui-btn--ghost ui-btn--block" href="../" target="_blank" rel="noopener noreferrer" title={__("Open the published site in a new tab")} style={{ marginTop: 6 }}>
            <ExternalLink size={16} aria-hidden="true" />{__("View Site")}
          </a>
        </div>
        <nav className="ui-nav">
          {NAV.filter((g) => (!g.admin || userRole === 'admin') && (!g.site || canManageSite(userRole))).map((g) => (
            <div key={g.group}>
              <div className="ui-nav__group">{g.group}</div>
              {g.items.filter((it) => !it.site || canManageSite(userRole)).map((it) => (
                <button key={it.view} type="button" className="ui-nav__item" aria-current={currentView === it.view ? 'page' : undefined} onClick={() => go(it.view)}>
                  <it.icon size={16} aria-hidden="true" /> {!canReview(userRole) && it.authorLabel ? it.authorLabel : it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="ui-sidebar__foot">
          {username && (
            <div className="ui-user">
              <span className="ui-avatar" aria-hidden="true">{username.slice(0, 2)}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <div className="ui-user__name">{username}</div>
                <div className="ui-user__role" style={{ color: userRole === 'admin' ? '#38bdf8' : '#a78bfa' }}>{roleLabel(userRole).toLowerCase()}</div>
              </span>
              {!demo && <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setPwOpen(true)} title={__("Change your password")} aria-label={__("Change your password")} />}
              <Button variant="ghost" size="sm" icon={LogOut} onClick={logout} title={__("Log out")} aria-label={__("Log out")} />
            </div>
          )}
          <div style={{ padding: '4px 12px 2px' }}><LocaleSelect /></div>
          <div className="ui-version ui-version--row">
            <span>{__("CanvasCore v")}{version}{build ? ` · build ${build}` : ''}</span>
            <button type="button" className="ui-version__info" onClick={() => setAboutOpen(true)} aria-label={__("About CanvasCore")} title={__("About CanvasCore")}><Info size={14} aria-hidden="true" /></button>
          </div>
          {serverVersion && appVersion && (serverVersion.app !== appVersion || (appBuild && serverVersion.build && Number(serverVersion.build) !== Number(appBuild))) && (
            <div className="ui-version" style={{ color: '#f59e0b' }}>{__("Editor v")}{appVersion}{appBuild ? __(" (build {0})", appBuild) : ''} {__("/ server v")}{serverVersion.app}{serverVersion.build ? __(" (build {0})", serverVersion.build) : ''}{__(": reload the page after updating.")}</div>
          )}
        </div>
      </aside>
      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
      {aboutOpen && <AboutDialog version={version} build={build} onClose={() => setAboutOpen(false)} />}
      {navOpen && <div className="ui-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="ui-main">
        <div className="ui-topbar">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" aria-label={navOpen ? __("Close menu") : __("Open menu")} onClick={() => setNavOpen(!navOpen)}>
            {navOpen ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
          <BrandLogo size={22} iconSize={13} radius={6} /> <span className="ui-brand__name">{siteName}</span>
        </div>
        <main className={`ui-content${wide ? ' ui-content--wide' : ''}`}>{children}</main>
      </div>
    </div>
  );
}
