// canvascore-frontend/src/session/runtime.js
// Connects the session modules to the browser: installs the fetch guard, listens for user
// activity and tab visibility changes. Installed only once per page.
import { useStore } from '../store/useStore';
import { createSessionManager } from './sessionManager';
import { createGuardedFetch } from './fetchGuard';
import { withTranslatedMessages } from '../i18n/apiMessages.js';
import { flushDrafts, setExpiredNotice, clearExpiredNotice } from './drafts';

export function installSession(win = window) {
  if (win.__CC_SESSION) return win.__CC_SESSION;

  const originalFetch = win.fetch.bind(win);
  // CSRF token from memory (set by login / check_auth); it is never stored where scripts could read it from a cookie
  const getToken = () => win.__CC_CSRF || '';

  const session = createSessionManager({
    store: useStore,
    fetchFn: originalFetch,                       // the manager's calls do NOT go through the guard
    onFlush: flushDrafts,
    onExpired: (info) => setExpiredNotice(info),
    onReauthenticated: () => clearExpiredNotice(),
    setCsrf: (t) => { win.__CC_CSRF = t; },
    reload: () => win.location.reload(),
  });

  win.fetch = withTranslatedMessages(createGuardedFetch({ originalFetch, session, getToken, baseHref: win.location.href }));
  win.__CC_FETCH_WRAPPED = true;
  win.__CC_SESSION = session;

  // User activity: keeps the session alive ONLY while actually working.
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach((ev) => {
    win.addEventListener(ev, () => session.noteActivity(), { passive: true, capture: true });
  });
  // Back to the tab, resume from sleep, network restored: immediate check (without waiting for timers).
  win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'visible') session.recheck(); });
  win.addEventListener('focus', () => session.recheck());
  win.addEventListener('online', () => session.recheck());
  // Tab close/reload: last save of the local backups.
  win.addEventListener('pagehide', () => flushDrafts());

  return session;
}

export const getSession = () => (typeof window !== 'undefined' && window.__CC_SESSION) || installSession();
