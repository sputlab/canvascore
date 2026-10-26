import React, { useState, createContext, useContext } from 'react';
import { useStore } from '../store/useStore';
import { DndContext, DragOverlay, pointerWithin, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Trash2, GripVertical, CopyPlus } from 'lucide-react';
import { blockInfo, CONTAINER_TYPES } from '../editor/blockCatalog';
import { dropPosition, containsId, findBlock } from '../editor/layerDrop';
import { confirmDialog } from '../ui/dialog';
import { __ } from '../i18n/index.js';
import { dndAccessibility } from '../i18n/dnd.js';

// Drag state shared by every row: the dragged id and where it would land ({ id, pos }).
const DragState = createContext({ activeId: null, drop: null });

// The rows never move or resize while dragging (no sortable transforms): a line shows
// where the block will land (before/after a row) or a highlight when it goes inside a container.
const LayerNode = ({ block, depth = 0 }) => {
  const { selectedBlockId, setSelectedBlockId, removeBlock, duplicateBlock } = useStore();
  const { activeId, drop } = useContext(DragState);
  const isSelected = selectedBlockId === block.id;
  const isContainer = block.children !== undefined;
  const [isOpen, setIsOpen] = useState(true);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: block.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: block.id, data: { isContainer } });
  const target = drop && drop.id === block.id ? drop.pos : null;
  const info = blockInfo(block.type);

  return (
    <div style={{ opacity: isDragging ? 0.45 : 1 }} data-drop={target || undefined}>
      <div
        ref={(el) => { setDragRef(el); setDropRef(el); }}
        role="treeitem" tabIndex={0} aria-selected={isSelected} aria-expanded={isContainer ? isOpen : undefined}
        onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBlockId(block.id); } }}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', minHeight: '30px', boxSizing: 'border-box', padding: '0 10px',
          paddingLeft: `${depth * 15 + 6}px`,
          background: target === 'inside' ? 'rgba(56,189,248,.16)' : (isSelected ? '#1e293b' : 'transparent'),
          outline: target === 'inside' ? '1px dashed #38bdf8' : 'none', outlineOffset: '-1px',
          borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
          cursor: 'pointer', color: isSelected ? '#f8fafc' : '#cbd5e1',
          fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.02)'
        }}
      >
        {(target === 'before' || target === 'after') && (
          <span aria-hidden="true" style={{ position: 'absolute', left: `${depth * 15 + 6}px`, right: 4, [target === 'before' ? 'top' : 'bottom']: -1, height: 2, background: '#38bdf8', borderRadius: 2, pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: -3, top: -2, width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
          </span>
        )}
        <span {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} title={__("Drag to move")} aria-label={__("Move {0}", info.label)}
          style={{ cursor: activeId ? 'grabbing' : 'grab', color: '#475569', display: 'flex', marginRight: '2px', touchAction: 'none' }}>
          <GripVertical size={12} />
        </span>

        <div style={{ width: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }} onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
          {isContainer ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          {React.createElement(info.icon, { size: 13, color: info.color, 'aria-hidden': true })}
          <span style={{ fontWeight: isContainer ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {info.label}{block.content?.customId ? <span style={{ color: '#64748b', fontWeight: 400 }}> #{block.content.customId}</span> : null}
          </span>
        </div>

        {isSelected && (
          <button onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }} title={__("Duplicate (Ctrl/Cmd+D)")} aria-label={__("Duplicate block")}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, marginRight: 8 }}>
            <CopyPlus size={12} />
          </button>
        )}
        {isSelected && (
          <button onClick={async (e) => { e.stopPropagation(); if (await confirmDialog({ title: __("Delete this {0} block?", info.label), message: isContainer ? __("Everything inside it is deleted too. You can undo it with Ctrl+Z.") : __("You can undo it with Ctrl+Z."), confirmLabel: __("Delete block"), danger: true })) removeBlock(block.id); }}
            title={__("Delete block")} aria-label={__("Delete block")} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {isContainer && isOpen && block.children && block.children.length > 0 && (
        <div style={{ borderLeft: '1px solid #334155', marginLeft: `${depth * 15 + 14}px` }}>
          {block.children.map(child => <LayerNode key={child.id} block={child} depth={0} />)}
        </div>
      )}
    </div>
  );
};

export default function LayerNavigator() {
  const { blocks, selectedBlockId, addBlock, moveBlockTo } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState(null);
  const [drop, setDrop] = useState(null);

  // Pointer height over the hovered row -> before / inside / after (never into the dragged block itself)
  const onDragMove = ({ active, over, activatorEvent, delta }) => {
    if (!over || over.id === active.id || containsId(findBlock(blocks, active.id), over.id)) { setDrop(null); return; }
    const y = (activatorEvent?.clientY ?? 0) + delta.y;
    const rect = over.rect;
    const ratio = rect.height ? (y - rect.top) / rect.height : 0.5;
    const pos = dropPosition(Math.max(0, Math.min(1, ratio)), !!over.data.current?.isContainer);
    setDrop((d) => (d && d.id === over.id && d.pos === pos ? d : { id: over.id, pos }));
  };
  const reset = () => { setActiveId(null); setDrop(null); };
  const onDragEnd = ({ active }) => {
    if (drop) moveBlockTo(active.id, drop.id, drop.pos);
    reset();
  };
  const dragged = activeId ? findBlock(blocks, activeId) : null;
  // The quick buttons add inside the selected block only when it is a container (else at the end)
  const selectedBlock = selectedBlockId ? findBlock(blocks, selectedBlockId) : null;
  const selectedContainer = selectedBlock && (Array.isArray(selectedBlock.children) || CONTAINER_TYPES.includes(selectedBlock.type)) ? selectedBlock : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
      <div style={{ padding: '11px 12px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', letterSpacing: '1px' }}>{__("PAGE STRUCTURE")}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {blocks.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{__("The page is empty. Add a block from the Add tab.")}</div>
        ) : (
          <DndContext accessibility={dndAccessibility} sensors={sensors} collisionDetection={pointerWithin}
            onDragStart={({ active }) => setActiveId(active.id)} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={reset}>
            <DragState.Provider value={{ activeId, drop }}>
              <div role="tree" aria-label={__("Page structure")}>
              {blocks.map(block => <LayerNode key={block.id} block={block} depth={0} />)}
              </div>
            </DragState.Provider>
            <DragOverlay dropAnimation={null}>
              {dragged ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#1e293b', border: '1px solid #38bdf8', borderRadius: 6, color: '#f8fafc', fontSize: 12, fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,.4)', whiteSpace: 'nowrap', cursor: 'grabbing' }}>
                  {React.createElement(blockInfo(dragged.type).icon, { size: 13, color: blockInfo(dragged.type).color, 'aria-hidden': true })}
                  {blockInfo(dragged.type).label}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <div style={{ padding: '11px 12px', borderTop: '1px solid #1e293b', background: '#1e293b' }}>
        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
          {selectedContainer ? <>{__("Add inside the selected")} <span style={{ color: '#38bdf8' }}>{blockInfo(selectedContainer.type).label}</span>:</> : __("Add at the end of the page:")}
        </p>
        <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: '#64748b' }}>{__("Tip: drag")} <GripVertical size={10} style={{ verticalAlign: 'middle' }} /> {__("to move a block. Drop on the middle of a Section, Container, Flex Row or CSS Grid to put it inside.")}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={() => addBlock('SECTION', selectedBlockId)} style={{ padding: '6px', background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>{__("+ Section")}</button>
          <button onClick={() => addBlock('CONTAINER', selectedBlockId)} style={{ padding: '6px', background: '#0f172a', color: '#f472b6', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>{__("+ Container")}</button>
          <button onClick={() => addBlock('FLEX_ROW', selectedBlockId)} style={{ padding: '6px', background: '#0f172a', color: '#a78bfa', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>{__("+ Flex Row")}</button>
          <button onClick={() => addBlock('TEXT', selectedBlockId)} style={{ padding: '6px', background: '#0f172a', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>{__("+ Text")}</button>
        </div>
      </div>
    </div>
  );
}
