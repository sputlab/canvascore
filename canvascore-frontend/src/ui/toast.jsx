// Non-blocking notifications ("Draft saved", "Published"), instead of alert() dialogs that stop the work.
// Shows what notify() (./notify.js) sends. Errors stay until dismissed, the rest fade after a few seconds.
import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { subscribe } from './notify';
import { __ } from '../i18n/index.js';

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function Toaster() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const add = (t) => {
      setToasts((all) => [...all.slice(-3), t]);
      if (t.tone !== 'error') setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id)), 4000);
    };
    return subscribe(add);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="ui-toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone] || Info;
        return (
          <div key={t.id} className={`ui-toast ui-toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ whiteSpace: 'pre-line' }}>{t.message}</span>
            <button type="button" aria-label={__("Dismiss")} onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
