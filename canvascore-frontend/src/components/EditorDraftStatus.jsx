import React from 'react';
import { CheckCircle2, CloudOff, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { __ } from '../i18n/index.js';

// Save status in the editor: the user must always know whether there is unsaved work and whether it is safe.
export default function EditorDraftStatus() {
  const dirty = useStore((s) => s.editorDirty);
  const failed = useStore((s) => s.draftBackupFailed);
  const base = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '4px 2px' };
  if (dirty && failed) return <div style={{ ...base, color: '#fca5a5' }} role="status"><CloudOff size={13} /> {__("Unsaved changes: local backup failed")}</div>;
  if (dirty) return <div style={{ ...base, color: '#fcd34d' }} role="status"><ShieldCheck size={13} /> {__("Unsaved changes · backed up on this device")}</div>;
  return <div style={{ ...base, color: '#64748b' }} role="status"><CheckCircle2 size={13} /> {__("All changes saved")}</div>;
}
