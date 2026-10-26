// "Start from…": a new collection item can begin as an empty page or as one of the starter templates.
import React, { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Plus, FileText } from 'lucide-react';
import { fetchStarters, starterOutline } from '../editor/starters';
import { __ } from '../i18n/index.js';

export default function StarterPickerDialog({ title = __("Start from…"), onPick, onClose }) {
  const [starters, setStarters] = useState(null);
  const firstRef = useRef(null);
  useEffect(() => { fetchStarters().then(setStarters); }, []);
  useEffect(() => { if (starters && firstRef.current) firstRef.current.focus(); }, [starters]);
  const list = starters ? [...starters.filter((s) => s.id === 'blank'), ...starters.filter((s) => s.id !== 'blank')] : [];
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-dialog cc-starter-pick" role="dialog" aria-modal="true" aria-labelledby="cc-starter-title"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
        <div className="ui-dialog__head">
          <span className="ui-dialog__icon" aria-hidden="true"><LayoutTemplate size={18} /></span>
          <h2 id="cc-starter-title" className="ui-dialog__title">{title}</h2>
        </div>
        <p className="ui-dialog__msg">{__("Begin with an empty item or a ready-made layout: everything stays editable.")}</p>
        {!starters ? <p className="ui-dialog__msg">{__("Loading templates…")}</p> : (
          <ul className="cc-starter-pick__list">
            {(list.length ? list : [{ id: 'blank', name: __("Blank"), description: __("Start from an empty page."), blocks: [] }]).map((st, i) => (
              <li key={st.id}>
                <button ref={i === 0 ? firstRef : undefined} type="button" className="cc-starter-pick__item" onClick={() => onPick(st)}>
                  <span className="cc-starter-pick__icon" aria-hidden="true">{st.id === 'blank' ? <Plus size={18} /> : <FileText size={18} />}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong>{st.name}</strong>
                    <small>{st.description}</small>
                    {starterOutline(st).length > 0 && <small className="cc-starter-pick__outline">{starterOutline(st).join(' · ')}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ui-dialog__actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>{__("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
