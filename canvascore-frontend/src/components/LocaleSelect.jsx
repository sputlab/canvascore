// The language of the admin interface (not of the site: that is Administration › Languages). Kept in this browser; the page reloads to apply it.
import React from 'react';
import { Languages } from 'lucide-react';
import { __, LOCALES, getLocale, setLocale } from '../i18n/index.js';

export default function LocaleSelect({ compact = false }) {
  const label = __("Interface language");
  return (
    <label className="ui-locale" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
      <Languages size={14} aria-hidden="true" />
      {!compact && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{label}</span>}
      <select aria-label={label} title={label} value={getLocale()} onChange={(e) => setLocale(e.target.value)}
        style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 6, padding: '3px 6px', fontSize: 12, cursor: 'pointer' }}>
        {LOCALES.map(([code, name]) => <option key={code} value={code} style={{ color: '#0f172a' }}>{name}</option>)}
      </select>
    </label>
  );
}
