// Admin shell: a persistent sidebar to move between sections (no more "Back to Dashboard" round trips),
// the signed-in user, logout and the version. The page editor is full screen and does not use it.
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  FileText, LayoutTemplate, Library, Image as ImageIcon, ListTree, Palette, Inbox, Users, LogOut, Globe,
  Menu as MenuIcon, X, DatabaseBackup, KeyRound, Info, ExternalLink, CircleArrowUp, Package, DownloadCloud,
} from 'lucide-react';
import { Button } from '../ui/kit';
import ChangePasswordDialog from './ChangePasswordDialog';
import AboutDialog from './AboutDialog';
import { BrandLogo } from '../ui/BrandLogo';
import { notify } from '../ui/notify';

const NAV = [
  { group: 'Content', items: [
    { view: 'manager', label: 'Pages', icon: FileText },
    { view: 'collections', label: 'Collections', icon: Library },
    { view: 'templates', label: 'Templates', icon: LayoutTemplate },
    { view: 'media', label: 'Media', icon: ImageIcon },
  ] },
  { group: 'Site', items: [
    { view: 'menu', label: 'Menu', icon: ListTree },
    { view: 'settings', label: 'Global Options', icon: Palette },
  ] },
  { group: 'Administration', admin: true, items: [
    { view: 'submissions', label: 'Submissions', icon: Inbox },
    { view: 'users', label: 'Accounts', icon: Users },
    { view: 'backup', label: 'Backup', icon: DatabaseBackup },
    { view: 'updates', label: 'Updates', icon: CircleArrowUp },
    { view: 'packages', label: 'Block packages', icon: Package },
    { view: 'wpimport', label: 'Import from WordPress', icon: DownloadCloud },
  ] },
];

export default function AdminLayout({ children, wide }) {
  const { currentView, setView, userRole, username, logout, publishSiteAsync, appVersion, appBuild, serverVersion } = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const siteName = useStore((s) => s.branding.siteName) || 'My Site';
  const demo = useStore((s) => s.demo);
  const version = (serverVersion && serverVersion.app) || appVersion || '0.0.0';
  const build = (serverVersion && serverVersion.build) || appBuild;

  const go = (view) => { setView(view); setNavOpen(false); };
  const publish = async () => {
    setPublishing(true);
    const res = await publishSiteAsync();
    setPublishing(false);
    if (res && res.success) notify(res.message || 'Site published.');
    else notify((res && res.message) || 'Publish failed.', 'error');
    if (res && res.success) useStore.getState().refreshPages();
  };

  return (
    <div className="ui-shell" data-nav-open={navOpen}>
      <aside className="ui-sidebar" aria-label="Main navigation">
        <div className="ui-brand" title={siteName}><BrandLogo /> <span className="ui-brand__name">{siteName}</span></div>
        <div style={{ padding: '0 12px 6px' }}>
          <Button variant="success" block icon={Globe} onClick={publish} disabled={publishing} title="Rebuild and publish the whole site">
            {publishing ? 'Publishing…' : 'Publish Site'}
          </Button>
          {/* The published site's home page: the folder above canvascore-admin/ */}
          <a className="ui-btn ui-btn--ghost ui-btn--block" href="../" target="_blank" rel="noopener noreferrer" title="Open the published site in a new tab" style={{ marginTop: 6 }}>
            <ExternalLink size={16} aria-hidden="true" />View Site
          </a>
        </div>
        <nav className="ui-nav">
          {NAV.filter((g) => !g.admin || userRole === 'admin').map((g) => (
            <div key={g.group}>
              <div className="ui-nav__group">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.view} type="button" className="ui-nav__item" aria-current={currentView === it.view ? 'page' : undefined} onClick={() => go(it.view)}>
                  <it.icon size={16} aria-hidden="true" /> {it.label}
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
                <div className="ui-user__role" style={{ color: userRole === 'admin' ? '#38bdf8' : '#a78bfa' }}>{userRole}</div>
              </span>
              {!demo && <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setPwOpen(true)} title="Change your password" aria-label="Change your password" />}
              <Button variant="ghost" size="sm" icon={LogOut} onClick={logout} title="Log out" aria-label="Log out" />
            </div>
          )}
          <div className="ui-version ui-version--row">
            <span>CanvasCore v{version}{build ? ` · build ${build}` : ''}</span>
            <button type="button" className="ui-version__info" onClick={() => setAboutOpen(true)} aria-label="About CanvasCore" title="About CanvasCore"><Info size={14} aria-hidden="true" /></button>
          </div>
          {serverVersion && appVersion && (serverVersion.app !== appVersion || (appBuild && serverVersion.build && Number(serverVersion.build) !== Number(appBuild))) && (
            <div className="ui-version" style={{ color: '#f59e0b' }}>Editor v{appVersion}{appBuild ? ` (build ${appBuild})` : ''} / server v{serverVersion.app}{serverVersion.build ? ` (build ${serverVersion.build})` : ''}: reload the page after updating.</div>
          )}
        </div>
      </aside>
      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
      {aboutOpen && <AboutDialog version={version} build={build} onClose={() => setAboutOpen(false)} />}
      {navOpen && <div className="ui-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="ui-main">
        <div className="ui-topbar">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" aria-label={navOpen ? 'Close menu' : 'Open menu'} onClick={() => setNavOpen(!navOpen)}>
            {navOpen ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
          <BrandLogo size={22} iconSize={13} radius={6} /> <span className="ui-brand__name">{siteName}</span>
        </div>
        <main className={`ui-content${wide ? ' ui-content--wide' : ''}`}>{children}</main>
      </div>
    </div>
  );
}
