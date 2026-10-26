import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { __ } from '../i18n/index.js';

// Demo mode only: a small fixed banner with the countdown to the next reset, which wipes every change and signs
// everyone out. Shown over every section, the full-screen page editor included.
export default function DemoBanner() {
  const demo = useStore((s) => s.demo);
  const fetchBranding = useStore((s) => s.fetchBranding);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remaining = Math.max(0, Math.ceil((((demo && demo.resetAt) || now) - now) / 1000));
  // Once the reset is due, ask the server again for the next one (a few seconds later, so the reset has run)
  useEffect(() => {
    if (!demo || remaining > 0) return undefined;
    const id = setTimeout(() => fetchBranding(), 5000);
    return () => clearTimeout(id);
  }, [demo, remaining, fetchBranding]);
  if (!demo) return null;

  const secs = remaining;
  const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
  const limits = [demo.maxNewPages != null && `${demo.maxNewPages} new pages`, demo.maxNewItems != null && `${demo.maxNewItems} new collection items`].filter(Boolean).join(' and ');

  return (
    <div role="status"
      style={{ position: 'fixed', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147481000, background: '#082f49', color: '#bae6fd', border: '1px solid #0369a1', borderRadius: '999px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', maxWidth: 'calc(100vw - 24px)', pointerEvents: 'none' }}>
      <RotateCcw size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
      <span>
        {secs > 0
          ? <>{__("Demo: every change is wiped in")} <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</strong></>
          : <strong>{__("Demo: resetting now…")}</strong>}
        {limits && <span style={{ opacity: 0.8 }}> {__("· up to")} {limits}</span>}
      </span>
    </div>
  );
}
