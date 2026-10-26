import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ShieldAlert } from 'lucide-react';
import { __ } from '../i18n/index.js';

export default function ForcePasswordChange() {
  const { changeOwnPassword, logout } = useStore();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pwd.length < 8) { setError(__("The password must be at least 8 characters.")); return; }
    if (pwd === 'admin') { setError(__("Please choose a different password than the default.")); return; }
    if (pwd !== confirm) { setError(__("The two passwords do not match.")); return; }
    setBusy(true);
    const res = await changeOwnPassword(pwd);
    setBusy(false);
    if (!res.success) setError(res.message || __("Could not change the password."));
  };

  const inputStyle = { width: '100%', padding: '12px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', fontFamily: 'Inter, system-ui, sans-serif', padding: '20px' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: '420px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', color: '#fbbf24' }}>
          <ShieldAlert size={22} />
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>{__("Set a new password")}</h2>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          {__("For security you must replace the default password before using CanvasCore.")}
        </p>

        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '5px' }}>{__("NEW PASSWORD")}</label>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} style={inputStyle} autoFocus />

        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '5px' }}>{__("CONFIRM PASSWORD")}</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />

        {error && <div style={{ color: '#fca5a5', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '12px', background: busy ? '#1e40af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? __("Saving...") : __("Save and continue")}
        </button>
        <button type="button" onClick={logout} style={{ width: '100%', padding: '10px', background: 'transparent', color: '#64748b', border: 'none', marginTop: '10px', cursor: 'pointer', fontSize: '12px' }}>
          {__("Log out")}
        </button>
      </form>
    </div>
  );
}
