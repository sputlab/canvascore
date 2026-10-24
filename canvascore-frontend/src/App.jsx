import React, { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { getSession } from './session/runtime';
import { purgeOldDrafts } from './session/drafts';
import VisualEditor from './components/VisualEditor';
import PageManager from './components/PageManager';
import MenuBuilder from './components/MenuBuilder';
import MediaManager from './components/MediaManager';
import GlobalSettings from './components/GlobalSettings';
import UserManager from './components/UserManager';
import Templates from './components/Templates';
import Submissions from './components/Submissions';
import Collections from './components/Collections';
import Login from './components/Login';
import ForcePasswordChange from './components/ForcePasswordChange';
import SessionExpiredOverlay from './components/SessionExpiredOverlay';
import SessionWarning from './components/SessionWarning';
import DemoBanner from './components/DemoBanner';
import DraftRestorePrompt from './components/DraftRestorePrompt';
import AdminLayout from './components/AdminLayout';
import Backup from './components/Backup';
import Updates from './components/Updates';
import { Toaster } from './ui/toast';
import { DialogHost } from './ui/dialogHost';
import { useBrandingHead } from './ui/branding';

export default function App() {
  const { currentView, isAuthenticated, checkAuth, userRole, mustChangePw, fetchVersion, fetchBranding, sessionExpired, sessionWarning } = useStore();
  useBrandingHead();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.fontFamily = 'Inter, system-ui, sans-serif';
    document.body.style.backgroundColor = '#0f172a';

    // Wait for the site name and icon too, so the sign-in screen doesn't change after it appears
    Promise.all([checkAuth(), fetchBranding()]).then(() => setLoading(false));
  }, [checkAuth, fetchBranding]);
  // The version is for signed-in users only
  useEffect(() => { if (isAuthenticated && !mustChangePw) fetchVersion(); }, [isAuthenticated, mustChangePw, fetchVersion]);

  // The session manager runs while authenticated (even with the login overlay shown).
  useEffect(() => {
    const session = getSession();
    if (isAuthenticated) { session.start(); purgeOldDrafts(); } else { session.stop(); }
  }, [isAuthenticated]);

  if (loading) return <div style={{ width: '100vw', height: '100vh', background: '#0f172a' }}></div>;
  if (!isAuthenticated) return <Login />;
  if (mustChangePw) return <ForcePasswordChange />;

  let view = <PageManager />;
  if (currentView === 'editor') view = <VisualEditor />;
  else if (currentView === 'menu') view = <MenuBuilder />;
  else if (currentView === 'media') view = <MediaManager />;
  else if (currentView === 'settings') view = <GlobalSettings />;
  else if (currentView === 'users' && userRole === 'admin') view = <UserManager />;
  else if (currentView === 'templates') view = <Templates />;
  else if (currentView === 'submissions' && userRole === 'admin') view = <Submissions />;
  else if (currentView === 'collections') view = <Collections />;
  else if (currentView === 'backup' && userRole === 'admin') view = <Backup />;
  else if (currentView === 'updates' && userRole === 'admin') view = <Updates />;
  // Every section except the full-screen page editor lives in the admin shell (sidebar navigation)
  if (currentView !== 'editor') view = <AdminLayout wide={currentView === 'manager'}>{view}</AdminLayout>;

  return (
    <>
      {/* With the session expired the app stays MOUNTED (no state lost) but inert: the login sits on top of it. */}
      <div style={{ display: 'contents' }} inert={sessionExpired ? true : undefined} aria-hidden={sessionExpired ? true : undefined}>
        {view}
      </div>
      {sessionWarning && !sessionExpired && <SessionWarning />}
      <DemoBanner />
      {sessionExpired && <SessionExpiredOverlay />}
      <DraftRestorePrompt />
      <Toaster />
      <DialogHost />
    </>
  );
}
