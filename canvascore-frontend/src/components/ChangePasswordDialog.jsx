// "Change password" for the signed-in user (any role): current password + the new one twice.
// Same modal look and keyboard behaviour as the confirmation dialogs (ui-dialog).
import React, { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { notify } from '../ui/notify';
import { __ } from '../i18n/index.js';

export default function ChangePasswordDialog({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef(null);
  useEffect(() => { if (first.current) first.current.focus(); }, []);
  const problem = form.next.length > 0 && form.next.length < 8 ? __("At least 8 characters.")
    : form.again && form.next !== form.again ? __("The two new passwords do not match.") : '';
  const ready = form.current && form.next.length >= 8 && form.next === form.again;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('api.php?action=change_own_password', { method: 'POST', body: JSON.stringify({ current: form.current, password: form.next }) });
      const data = await res.json();
      if (data && data.success) { if (data.csrf) window.__CC_CSRF = data.csrf; notify(__("Password changed.")); onClose(); return; }
      setError((data && data.message) || __("The password was not changed."));
    } catch { setError(__("Connection problem: the password was not changed.")); }
    setBusy(false);
  };
  const field = (key, label, auto, ref) => (
    <label className="ui-dialog__field">
      <span className="ui-label">{label}</span>
      <input ref={ref} className="ui-input" type="password" autoComplete={auto} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="cc-pw-title" onSubmit={submit}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
        <div className="ui-dialog__head">
          <span className="ui-dialog__icon" aria-hidden="true"><KeyRound size={18} /></span>
          <h2 id="cc-pw-title" className="ui-dialog__title">{__("Change your password")}</h2>
        </div>
        {field('current', __("Current password"), 'current-password', first)}
        {field('next', __("New password (at least 8 characters)"), 'new-password')}
        {field('again', __("Repeat the new password"), 'new-password')}
        {(problem || error) && <p className="ui-error" role="alert" style={{ marginTop: 8 }}>{error || problem}</p>}
        <div className="ui-dialog__actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>{__("Cancel")}</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={!ready || busy}>{busy ? __("Saving…") : __("Change password")}</button>
        </div>
      </form>
    </div>
  );
}
