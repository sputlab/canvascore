// Style tab › Copy & paste style: copy the look of this block (its styles and tablet and phone overrides), then paste
// it onto this block, onto any other blocks of the page (nested ones too) you tick, or reset this block to the global
// style. Every paste is one undo step (Ctrl+Z).
import React, { useState } from 'react';
import { Copy, ClipboardPaste, RotateCcw } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Button } from '../../ui/kit';
import { notify } from '../../ui/notify';
import { confirmDialog } from '../../ui/dialog';
import { blockLabel } from '../../editor/blockCatalog';
import { PanelAccordion } from './fields';
import { __ } from '../../i18n/index.js';

// Every block of the page in page order, with its depth and a number per type ("Hero 2")
function pageBlocks(blocks) {
  const out = [];
  const counts = {};
  const walk = (list, depth) => {
    for (const b of list || []) {
      counts[b.type] = (counts[b.type] || 0) + 1;
      out.push({ id: b.id, type: b.type, depth, label: `${blockLabel(b.type)} ${counts[b.type]}` });
      walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return out;
}

export default function CopyPasteStyle({ block }) {
  const clip = useStore((s) => s.styleClipboard);
  const blocks = useStore((s) => s.blocks);
  // the blocks a paste can reach: every other block of the page
  const targets = pageBlocks(blocks).filter((t) => t.id !== block.id);
  // the ticks belong to the block they were made on: another block starts with none
  const [pick, setPick] = useState({ owner: block.id, ids: [] });
  const picked = pick.owner === block.id ? pick.ids : [];
  const setPicked = (ids) => setPick({ owner: block.id, ids: typeof ids === 'function' ? ids(picked) : ids });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const sameType = targets.filter((t) => t.type === block.type).map((t) => t.id);
  const label = blockLabel(block.type);
  const paste = (ids, what) => {
    const n = useStore.getState().pasteStyle(ids);
    notify(__("Style pasted {0}{1}. Ctrl+Z undoes it.", what, n > 1 ? __(" ({0} blocks)", n) : ''));
    setPicked([]);
  };
  const copy = () => {
    useStore.getState().copyStyle(block.id);
    notify(__("Style of this {0} copied. Paste it onto another block.", label));
  };
  const reset = async () => {
    if (!(await confirmDialog({ title: __("Reset this block to the global style?"), message: __("Its own colours, spacing, typography and device overrides are removed, so it follows the site's styles again. Its text style and animation stay. Ctrl+Z undoes it."), confirmLabel: __("Reset style"), danger: true }))) return;
    useStore.getState().resetStyle(block.id);
    notify(__("Style reset to the global style."));
  };
  return (
    <PanelAccordion title={__("Copy & paste style")} icon={Copy} defaultOpen={false}>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8', lineHeight: 1.45 }}>
        {clip ? __("Copied from a {0} block. Paste it onto this block or onto other blocks below.", blockLabel(clip.type)) : __("Copy this block's style, then paste it onto other blocks.")}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <Button size="sm" icon={Copy} onClick={copy}>{__("Copy style")}</Button>
        <Button size="sm" icon={ClipboardPaste} disabled={!clip} onClick={() => paste([block.id], 'onto this block')}>{__("Paste onto this block")}</Button>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>{__("Reset to global style")}</Button>
      </div>
      {targets.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{__("Paste onto other blocks")}</div>
          <div role="group" aria-label={__("Blocks to paste onto")} style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 2, marginBottom: 8 }}>
            {targets.map((t) => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e2e8f0', padding: '3px 0', paddingLeft: t.depth * 14 }}>
                <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} aria-label={__("Paste onto {0}", t.label)} />
                {t.label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sameType.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(sameType)}>{__("Select all")} {label} {__("blocks")}</Button>}
            <Button size="sm" icon={ClipboardPaste} disabled={!clip || picked.length === 0} onClick={() => paste(picked, `onto ${picked.length} ${picked.length === 1 ? 'block' : 'blocks'}`)}>
              {__("Paste onto selected")}{picked.length ? ` (${picked.length})` : ''}
            </Button>
          </div>
        </>
      )}
    </PanelAccordion>
  );
}
