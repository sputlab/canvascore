import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, LogIn, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getSession } from '../session/runtime';
import { listDrafts, describeDraft, storageAvailable } from '../session/drafts';
import { __ } from '../i18n/index.js';

// Login screen shown ON TOP of the app when the session has expired.
// The app underneath stays mounted (and inert): after login you resume exactly where you were.
export default function SessionExpiredOverlay() {
  const expiredUser = useStore((s) => s.expiredUser);
  const sessionTimeout = useStore((s) => s.sessionTimeout);
  const draftBackupFailed = useStore((s) => s.draftBackupFailed);

  const [username, setUsername] = useState(expiredUser || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pwRef = useRef(null);
  const userRef = useRef(null);

  const backups = useMemo(() => (expiredUser ? listDrafts(expiredUser) : []), [expiredUser]);
  const minutes = sessionTimeout ? Math.round(sessionTimeout / 60) : null;

  useEffect(() => { (expiredUser ? pwRef : userRef).current?.focus(); }, [expiredUser]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await useStore.getState().reauth(username.trim(), password);
      if (!res.success) { setError(res.message || __("Authentication error")); }
      else {
        const same = getSession().completeReauth({ username: res.username, csrf: res.differentUser ? undefined : res.csrf });
        if (!same) { setError(__("Signed in as a different user: reloading…")); return; }   // stays blocked until the reload
      }
    } catch { setError(__("Server connection error")); }
    setBusy(false);
  };

  const inputStyle = { width: '100%', padding: '11px 14px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '5px', letterSpacing: '0.4px' };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="cc-expired-title"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000, background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: '420px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', color: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#78350f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={19} color="#fcd34d" /></div>
          <h2 id="cc-expired-title" style={{ margin: 0, fontSize: '19px' }}>{__("Session expired")}</h2>
        </div>
        <p style={{ margin: '10px 0 14px', fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.55 }}>
          {__("You were signed out")}{minutes ? <> {__("after")} <strong>{minutes} {__("minutes")}</strong> {__("of inactivity")}</> : ' because your session ended'}{__(". Sign in again to continue")} <strong>{__("exactly where you left off")}</strong>.
        </p>

        {draftBackupFailed || !storageAvailable() ? (
          <div style={{ display: 'flex', gap: '10px', background: '#451a03', border: '1px solid #92400e', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '12.5px', color: '#fde68a', lineHeight: 1.5 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{__("A local backup could not be stored on this device. Your changes are still in this window: sign in to keep working and")} <strong>{__("do not close or reload this tab")}</strong>.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', background: '#052e1c', border: '1px solid #065f46', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '12.5px', color: '#a7f3d0', lineHeight: 1.5 }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>{__("Your work is safe.")}</strong> {__("Nothing was lost.")}
              {backups.length > 0 ? __(" Unsaved changes are backed up on this device:") : __(" There were no unsaved changes.")}
              {backups.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#d1fae5' }}>
                  {backups.map((b) => { const d = describeDraft(b); return <li key={b.scope}>{d.kind}: <strong>{d.title}</strong></li>; })}
                </ul>
              )}
            </span>
          </div>
        )}

        <label htmlFor="cc-exp-user" style={labelStyle}>{__("USERNAME")}</label>
        <input id="cc-exp-user" ref={userRef} type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} />
        <label htmlFor="cc-exp-pw" style={labelStyle}>{__("PASSWORD")}</label>
        <input id="cc-exp-pw" ref={pwRef} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />

        {error && <div role="alert" style={{ color: '#fca5a5', fontSize: '13px', marginTop: '10px' }}>{error}</div>}

        <button type="submit" disabled={busy || !username || !password}
          style={{ width: '100%', marginTop: '16px', padding: '12px', background: (busy || !username || !password) ? '#1e40af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <LogIn size={16} /> {busy ? __("Signing in…") : __("Sign in and continue")}
        </button>
        <p style={{ margin: '12px 0 0', fontSize: '11.5px', color: '#64748b', lineHeight: 1.5 }}>
          {__("Anything you were saving when the session ended is completed automatically after you sign in.")}
        </p>
      </form>
    </div>
  );
}
