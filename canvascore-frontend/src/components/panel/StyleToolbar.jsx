// Top of the Style tab: copy the look of this block, paste it onto this block or onto every block of its type, or
// reset this block to the global style. A paste is one undo step (Ctrl+Z).
import React from 'react';
import { Copy, ClipboardPaste, RotateCcw } from 'lucide-react';
import { useStore, blockIdsOfType } from '../../store/useStore';
import { Button } from '../../ui/kit';
import { notify } from '../../ui/notify';
import { confirmDialog } from '../../ui/dialog';
import { blockLabel } from '../../editor/blockCatalog';

export default function StyleToolbar({ block }) {
  const clip = useStore((s) => s.styleClipboard);
  const blocks = useStore((s) => s.blocks);
  const label = blockLabel(block.type);
  const others = blockIdsOfType(blocks, block.type).filter((id) => id !== block.id);
  const copy = () => {
    useStore.getState().copyStyle(block.id);
    notify(`Style of this ${label} copied. Paste it onto another block.`);
  };
  const paste = () => {
    useStore.getState().pasteStyle([block.id]);
    notify('Style pasted.');
  };
  const pasteAll = () => {
    const n = useStore.getState().pasteStyle([block.id, ...others]);
    notify(`Style pasted onto ${n} ${label} blocks. Ctrl+Z undoes it.`);
  };
  const reset = async () => {
    if (!(await confirmDialog({ title: 'Reset this block to the global style?', message: 'Its own colours, spacing, typography and device overrides are removed, so it follows the site\'s styles again. Its text style and animation stay. Ctrl+Z undoes it.', confirmLabel: 'Reset style', danger: true }))) return;
    useStore.getState().resetStyle(block.id);
    notify('Style reset to the global style.');
  };
  return (
    <div className="cc-style-toolbar" role="group" aria-label="Style actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
      <Button size="sm" icon={Copy} onClick={copy}>Copy style</Button>
      <Button size="sm" icon={ClipboardPaste} onClick={paste} disabled={!clip} title={clip ? `Paste the style of a ${blockLabel(clip.type)} block` : 'Copy a style first'}>Paste style</Button>
      {clip && others.length > 0 && <Button size="sm" onClick={pasteAll} title={`Paste this style onto every ${label} block on the page`}>Paste to all {label} blocks</Button>}
      <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>Reset to global style</Button>
    </div>
  );
}
