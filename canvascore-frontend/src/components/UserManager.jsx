import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { UserPlus, Users, Trash2, KeyRound } from 'lucide-react';
import { Button, Card, Field, Input, Select, PageHeader, Badge } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { ROLES, roleLabel } from '../session/permissions';
import { __ } from '../i18n/index.js';

export default function UserManager() {
  const me = useStore((st) => st.username);
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [pw, setPw] = useState(null); // { id, username, a, b }: inline "change password" form for one account

  const fetchUsers = () => {
    fetch('api.php?action=get_users')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setUsers(data); })
      .catch(console.error);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      const res = await fetch('api.php?action=add_user', { method: 'POST', body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }) });
      const data = await res.json();
      notify(data.message || (data.success ? __("User added.") : __("Error adding user.")), data.success ? 'success' : 'error');
      if (data.success) {
        setNewUsername(''); setNewPassword(''); setNewRole('editor');
        fetchUsers();
      }
    } catch { notify(__("Error adding user."), 'error'); }
  };

  const pwError = !pw ? '' : pw.a.length < 8 ? __("At least 8 characters.") : pw.a !== pw.b ? __("The two passwords do not match.") : '';
  const handleForcePassword = async (e) => {
    e.preventDefault();
    if (!pw || pwError) return;
    try {
      const res = await fetch('api.php?action=force_password', { method: 'POST', body: JSON.stringify({ id: pw.id, password: pw.a }) });
      const data = await res.json();
      notify(data.success === false ? data.message || __("Not changed.") : __("Password of \"{0}\" changed. They will be asked to choose a new one at the next sign-in.", pw.username), data.success === false ? 'error' : 'success');
      if (data.success !== false) setPw(null);
    } catch { notify(__("Network error."), 'error'); }
  };

  const changeRole = async (u, role) => {
    try {
      const data = await (await fetch('api.php?action=set_role', { method: 'POST', body: JSON.stringify({ id: u.id, role }) })).json();
      notify(data.message || (data.success ? __("Role changed.") : __("The role was not changed.")), data.success ? 'success' : 'error');
    } catch { notify(__("Network error."), 'error'); }
    fetchUsers();
  };

  const handleDeleteUser = async (id, username) => {
    if (!(await confirmDialog({ title: __("Delete the account \"{0}\"?", username), message: __("They will no longer be able to sign in. Their pages stay."), confirmLabel: __("Delete account"), danger: true }))) return;
    try {
      const res = await fetch('api.php?action=delete_user', { method: 'POST', body: JSON.stringify({ id }) });
      const data = await res.json();
      notify(data.message || __("Done."), data.success ? 'success' : 'error');
      if (data.success) fetchUsers();
    } catch { notify(__("Network error."), 'error'); }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon={Users} title={__("Accounts")} description={__("People who can sign in to the editor, and what each may do. Authors write and submit for review, reviewers approve, editors publish directly, administrators also manage accounts, backups and custom code.")} />

      <Card title={__("Add a user")} icon={UserPlus}>
        <form onSubmit={handleAddUser}>
          <div className="ui-grid" style={{ '--ui-min': '180px' }}>
            <Field label={__("Username")}><Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required autoComplete="off" /></Field>
            <Field label={__("Password")}><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" /></Field>
            <Field label={__("Role")}>
              <Select value={newRole} onChange={e => setNewRole(e.target.value)} aria-label={__("Role of the new account")} options={ROLES.map((r) => [r.id, r.label])} />
            </Field>
          </div>
          <p className="ui-hint" data-testid="role-hint">{(ROLES.find((r) => r.id === newRole) || {}).hint}</p>
          <Button type="submit" variant="success" icon={UserPlus}>{__("Add user")}</Button>
        </form>
      </Card>

      <Card title={__("Accounts ({0})", users.length)} icon={Users}>
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>{__("User")}</th><th>{__("Role")}</th><th className="ui-cell-actions">{__("Actions")}</th></tr></thead>
            <tbody>
              {users.map(u => (
                <React.Fragment key={u.id}>
                <tr>
                  <td className="ui-cell-title">{u.username}{u.username === me && <span className="ui-hint" style={{ fontWeight: 400 }}> {__("(you)")}</span>}</td>
                  <td>
                    <Select aria-label={__("Role of {0}", u.username)} value={u.role} onChange={(e) => changeRole(u, e.target.value)} options={ROLES.map((r) => [r.id, r.label])} style={{ width: 'auto' }} />
                    {u.role === 'admin' && <span style={{ marginLeft: 6 }}><Badge tone="accent">{roleLabel(u.role)}</Badge></span>}
                  </td>
                  <td className="ui-cell-actions">
                    <span className="ui-row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                      <Button size="sm" icon={KeyRound} aria-expanded={pw?.id === u.id} onClick={() => setPw(pw?.id === u.id ? null : { id: u.id, username: u.username, a: '', b: '' })}>{__("Change password")}</Button>
                      <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteUser(u.id, u.username)} disabled={u.username === me} title={u.username === me ? __("You cannot delete your own account") : undefined}>{__("Delete")}</Button>
                    </span>
                  </td>
                </tr>
                {pw?.id === u.id && (
                  <tr><td colSpan={3}>
                    <form onSubmit={handleForcePassword} className="ui-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <label className="ui-label" style={{ display: 'grid', gap: 4 }}>{__("New password")}
                        <input className="ui-input" type="password" autoComplete="new-password" autoFocus value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
                      </label>
                      <label className="ui-label" style={{ display: 'grid', gap: 4 }}>{__("Repeat it")}
                        <input className="ui-input" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
                      </label>
                      <Button type="submit" variant="primary" size="sm" disabled={!!pwError}>{__("Set password")}</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPw(null)}>{__("Cancel")}</Button>
                      {pw.a && pwError && <span className="ui-error">{pwError}</span>}
                    </form>
                  </td></tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
