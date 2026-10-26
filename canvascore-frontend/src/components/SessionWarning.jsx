import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getSession } from '../session/runtime';
import { __ } from '../i18n/index.js';

// Non-blocking warning shortly before the inactivity timeout. Shown only while the user is idle:
// any mouse movement/keypress extends the session and closes it.
export default function SessionWarning() {
  const expiresAt = useStore((s) => s.sessionExpiresAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remaining = Math.max(0, Math.ceil(((expiresAt || now) - now) / 1000));
  const mm = Math.floor(remaining / 60); const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div role="alert" aria-live="assertive"
      style={{ position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147482000, background: '#78350f', color: '#fef3c7', border: '1px solid #b45309', borderRadius: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px', maxWidth: 'calc(100vw - 24px)' }}>
      <Clock size={18} style={{ flexShrink: 0 }} />
      <span>{__("Your session expires in")} <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</strong> {__("due to inactivity. Unsaved work is backed up automatically.")}</span>
      <button onClick={() => getSession().keepalive()} style={{ background: '#fbbf24', color: '#451a03', border: 'none', borderRadius: '8px', padding: '6px 12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{__("Stay signed in")}</button>
    </div>
  );
}
