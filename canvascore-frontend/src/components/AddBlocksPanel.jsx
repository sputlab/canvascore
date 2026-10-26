// Editor left panel, "Add" tab: every block grouped by category, with a search box, plus the
// user's saved templates and global masters. Blocks go inside the selected container, or at the end.
import React, { useEffect, useState } from 'react';
import { useStore, readBlockClipboard } from '../store/useStore';
import { Crown, Library, Trash2, ChevronDown, ClipboardPaste } from 'lucide-react';
import { CATEGORIES, searchBlocks, blockLabel } from '../editor/blockCatalog';
import { SearchInput } from '../ui/kit';
import { __ } from '../i18n/index.js';

function Group({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 6 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', background: 'none', border: 'none', color: '#94a3b8', font: '800 10.5px/1 Inter, system-ui, sans-serif', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
        <span>{title}{count !== undefined && <span style={{ color: '#475569', marginLeft: 6 }}>{count}</span>}</span>
        <ChevronDown size={13} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && children}
    </div>
  );
}

const tile = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 4px', minHeight: 64, cursor: 'pointer', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 8, font: '600 11px/1.15 Inter, system-ui, sans-serif', textAlign: 'center' };

export default function AddBlocksPanel({ onAdd, targetType, parentId = null }) {
  const { userRole, templates, masters, addSavedBlock, deleteTemplate, insertMaster, deleteMaster, isEditingMaster, pasteBlock } = useStore();
  const [query, setQuery] = useState('');
  // A block copied here or in another tab (the clipboard lives in localStorage; copying here re-renders
  // through the store, copying in another tab through the storage event)
  const [, setTick] = useState(0);
  const clip = readBlockClipboard();
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'cc_block_clipboard') setTick((t) => t + 1); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const found = searchBlocks(query, { admin: userRole === 'admin' });
  const q = query.trim().toLowerCase();
  const myTemplates = (templates || []).filter((t) => !q || String(t.name).toLowerCase().includes(q));
  const myMasters = (masters || []).filter((m) => !q || String(m.name).toLowerCase().includes(q));

  return (
    <div style={{ padding: 10 }}>
      {clip && (
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 8 }} onClick={() => pasteBlock()}
          title={__("Paste the copied block (Ctrl/Cmd+V)")}>
          <ClipboardPaste size={14} aria-hidden="true" /> {__("Paste copied")} {blockLabel(clip.block.type)}
        </button>
      )}
      <SearchInput value={query} onChange={setQuery} placeholder={__("Search blocks…")} label={__("Search blocks")} />
      <p style={{ margin: '8px 2px 6px', fontSize: 11, color: '#64748b' }} aria-live="polite">
        {targetType ? <>{__("Adds inside the selected")} <strong style={{ color: '#38bdf8' }}>{blockLabel(targetType)}</strong></> : __("Adds at the end of the page")}
      </p>

      {CATEGORIES.map((cat) => {
        const items = found.filter((b) => b.category === cat.id);
        if (!items.length) return null;
        return (
          <Group key={cat.id} title={cat.label} count={q ? items.length : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {items.map((b) => (
                <button key={b.type} type="button" className="cc-add-tile" style={tile} onClick={() => onAdd(b.type)} title={__("Add {0}", b.label)}>
                  <b.icon size={18} color={b.color} aria-hidden="true" /> {b.label}
                </button>
              ))}
            </div>
          </Group>
        );
      })}
      {found.length === 0 && !myTemplates.length && !myMasters.length && (
        <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: '20px 0' }}>{__("No blocks match “")}{query}”.</p>
      )}

      {!isEditingMaster && (myTemplates.length > 0 || !q) && (
        <Group title={__("My templates")} count={myTemplates.length} defaultOpen={false}>
          {myTemplates.length === 0 ? (
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 2px 8px' }}>{__("Save a block as a template from its panel (the save icon) to reuse a copy of it.")}</p>
          ) : myTemplates.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button type="button" onClick={() => addSavedBlock(t.content_json, parentId)} className="ui-btn ui-btn--secondary ui-btn--sm" style={{ flex: 1, justifyContent: 'flex-start', color: '#ddd6fe' }} title={__("Insert a copy")}>
                <Library size={14} aria-hidden="true" /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              </button>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label={__("Delete template {0}", t.name)} title={__("Delete template")}
                onClick={() => deleteTemplate(t.id)} style={{ color: '#f87171' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </Group>
      )}

      {!isEditingMaster && (myMasters.length > 0 || !q) && (
        <Group title={__("Global masters")} count={myMasters.length} defaultOpen={false}>
          {myMasters.length === 0 ? (
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 2px 8px' }}>{__("A master is a block shared by many pages: edit it once, it changes everywhere. Create one from a block's panel (Master).")}</p>
          ) : myMasters.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button type="button" onClick={() => insertMaster(m.id, m.name, parentId)} className="ui-btn ui-btn--gold ui-btn--sm" style={{ flex: 1, justifyContent: 'flex-start' }} title={__("Insert this master")}>
                <Crown size={14} aria-hidden="true" /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              </button>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label={__("Delete master {0}", m.name)} title={__("Delete master")}
                onClick={() => deleteMaster(m.id)} style={{ color: '#f87171' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </Group>
      )}
    </div>
  );
}
