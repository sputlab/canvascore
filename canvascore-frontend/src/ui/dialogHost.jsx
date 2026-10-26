// Renders the dialogs asked with confirmDialog()/promptDialog() (./dialog.js), one at a time (the rest wait).
// Accessible modal: focus moves in and stays in (Tab cycles), Esc cancels, Enter confirms,
// and focus goes back where it was when the dialog closes.
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { setDialogHost } from './dialog';
import { __ } from '../i18n/index.js';

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => setDialogHost((req) => setQueue((q) => [...q, req])), []);
  const current = queue[0];
  if (!current) return null;
  const close = (value) => { current.resolve(value); setQueue((q) => q.slice(1)); };
  return <Dialog key={current.id} req={current} onClose={close} />;
}

function Dialog({ req, onClose }) {
  const isPrompt = req.kind === 'prompt';
  const [value, setValue] = useState(req.defaultValue || '');
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const returnTo = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const required = isPrompt && req.required !== false && !req.readOnly;
  const invalid = required && value.trim() === '';

  const cancel = () => onClose(isPrompt ? null : false);
  const confirm = () => {
    if (invalid) { if (inputRef.current) inputRef.current.focus(); return; }
    onClose(isPrompt ? value.trim() : true);
  };

  useEffect(() => {
    // The first focus: the text field, or the safe button for a destructive action
    const first = isPrompt ? inputRef.current : (req.danger ? cancelRef.current : confirmRef.current);
    if (first) { first.focus(); if (isPrompt && first.select) first.select(); }
    const back = returnTo.current;
    return () => { if (back && back.isConnected && back.focus) back.focus(); };
  }, [isPrompt, req.danger]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') { e.preventDefault(); confirm(); return; }
    if (e.key === 'Tab') {   // keep the focus inside the dialog
      const f = [...boxRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };

  const Icon = req.danger ? AlertTriangle : HelpCircle;
  const titleId = `ui-dlg-t-${req.id}`;
  const msgId = `ui-dlg-m-${req.id}`;
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div ref={boxRef} className={`ui-dialog${req.danger ? ' ui-dialog--danger' : ''}`} role={isPrompt ? 'dialog' : 'alertdialog'} aria-modal="true"
        aria-labelledby={titleId} aria-describedby={req.message ? msgId : undefined} onKeyDown={onKeyDown}>
        <div className="ui-dialog__head">
          <span className="ui-dialog__icon" aria-hidden="true"><Icon size={18} /></span>
          <h2 id={titleId} className="ui-dialog__title">{req.title || (isPrompt ? __("Enter a value") : __("Are you sure?"))}</h2>
        </div>
        {req.message && <p id={msgId} className="ui-dialog__msg">{req.message}</p>}
        {isPrompt && (
          <label className="ui-dialog__field">
            {req.label && <span className="ui-label">{req.label}</span>}
            <input ref={inputRef} className="ui-input" value={value} readOnly={!!req.readOnly} placeholder={req.placeholder}
              aria-invalid={invalid ? 'true' : undefined} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        <div className="ui-dialog__actions">
          {!req.hideCancel && <button ref={cancelRef} type="button" className="ui-btn ui-btn--secondary" onClick={cancel}>{req.cancelLabel || __("Cancel")}</button>}
          <button ref={confirmRef} type="button" className={`ui-btn ${req.danger ? 'ui-btn--danger-solid' : 'ui-btn--primary'}`} onClick={confirm} disabled={invalid}>
            {req.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
