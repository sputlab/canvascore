// Image tools of the media library (a dialog for one image): Crop, and Focal point.
//  - Crop: drag the frame (or type its size) and save it as a new image, or over the original (same address: every page that uses
//    it shows the cropped image). JPEG, PNG and WebP.
//  - Focal point: click the subject. It is remembered with the image and offered to a block when the image is chosen, so the
//    block keeps the subject in view whenever the picture is cropped to fit (an Image block's Focus setting).
import React, { useEffect, useRef, useState } from 'react';
import { Crop, Crosshair, X, Save } from 'lucide-react';
import { Button, Select, Tabs, Field, Input } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog } from '../ui/dialog';
import { ASPECTS, CROPPABLE, HANDLE_IDS, aspectValue, initialRect, reshape, dragRect, setField, focalFromPoint, focalCss } from '../editor/imageTools';

const post = async (action, body) => (await fetch('api.php?action=' + action, { method: 'POST', body: JSON.stringify(body) })).json();
const extOf = (n) => String(n || '').split('.').pop().toLowerCase();
const HANDLE_CURSOR = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' };
const HANDLE_POS = { n: ['50%', '0%'], s: ['50%', '100%'], e: ['100%', '50%'], w: ['0%', '50%'], ne: ['100%', '0%'], nw: ['0%', '0%'], se: ['100%', '100%'], sw: ['0%', '100%'] };

export default function ImageTools({ image, onClose, onDone, start = 'crop' }) {
  const canCrop = CROPPABLE.includes(extOf(image.name));
  const [tab, setTab] = useState(start === 'crop' && !canCrop ? 'focal' : start);
  const [nat, setNat] = useState(image.w && image.h ? { w: image.w, h: image.h } : null);
  const imgRef = useRef(null);
  const closeRef = useRef(null);
  const src = `${image.url}${image.url.includes('?') ? '&' : '?'}v=${image.mtime || 0}`;

  // ---- crop
  const [aspectId, setAspectId] = useState('free');
  const [moved, setRect] = useState(null);          // the frame once the user has changed it; until then, the biggest one of the shape
  const [mode, setMode] = useState('copy');
  const [busy, setBusy] = useState(false);
  const aspect = nat ? aspectValue(aspectId, nat) : null;
  const rect = moved || (nat ? initialRect(nat, aspect) : null);
  useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);

  const onLoad = (e) => { const el = e.currentTarget; if (el.naturalWidth) setNat({ w: el.naturalWidth, h: el.naturalHeight }); };
  const pickAspect = (id) => { setAspectId(id); if (nat && rect) setRect(reshape(rect, aspectValue(id, nat), nat)); };

  const beginDrag = (handle) => (e) => {
    if (!nat || !rect || !imgRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const box = imgRef.current.getBoundingClientRect();
    const scale = box.width ? nat.w / box.width : 1;
    const from = { x: e.clientX, y: e.clientY, rect };
    const move = (ev) => setRect(dragRect(from.rect, handle, (ev.clientX - from.x) * scale, (ev.clientY - from.y) * scale, nat, aspect));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const saveCrop = async () => {
    if (!rect || !nat) return;
    if (mode === 'replace') {
      let usage = {};
      try { usage = (await post('media_usage', { names: [image.name] })).usage || {}; } catch { usage = {}; }
      const where = usage[image.name] || [];
      const ok = await confirmDialog({
        title: 'Crop the original?',
        message: (where.length ? `“${image.name}” is used in: ${where.slice(0, 6).join(', ')}${where.length > 6 ? '…' : ''}. They will show the cropped image after the next publish.` : 'No page uses this image.')
          + '\n\nThe original is replaced and this cannot be undone. To keep it, save the crop as a new image instead.',
        confirmLabel: 'Crop and replace', danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const d = await post('media_crop', { name: image.name, x: rect.x, y: rect.y, w: rect.w, h: rect.h, mode });
      if (d.success) { notify(d.message); if (onDone) onDone({ cropped: d.name, replaced: d.replaced }); onClose(); }
      else notify(d.message || 'The image was not cropped.', 'error');
    } catch { notify('The image was not cropped (connection problem).', 'error'); }
    setBusy(false);
  };

  // ---- focal point
  const [focal, setFocal] = useState(image.focal || null);
  const stageRef = useRef(null);
  const setFromEvent = (e) => { if (stageRef.current) setFocal(focalFromPoint(e.clientX, e.clientY, stageRef.current.getBoundingClientRect())); };
  const pointerOnStage = (e) => {
    e.preventDefault(); setFromEvent(e);
    const move = (ev) => setFromEvent(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const typeFocal = (axis, v) => {
    const n = Math.min(100, Math.max(0, Number(v)));
    if (Number.isFinite(n)) setFocal({ x: 50, y: 50, ...(focal || {}), [axis]: Math.round(n * 10) / 10 });
  };
  const saveFocal = async (value) => {
    setBusy(true);
    try {
      const d = await post('save_media_meta', { name: image.name, focal: value });
      if (d.success) { notify(value ? 'Focal point saved.' : 'Focal point cleared.'); if (onDone) onDone({ focal: value }); onClose(); }
      else notify(d.message || 'The focal point was not saved.', 'error');
    } catch { notify('The focal point was not saved (connection problem).', 'error'); }
    setBusy(false);
  };

  const tabs = [...(canCrop ? [['crop', 'Crop', Crop]] : []), ['focal', 'Focal point', Crosshair]];
  const pct = (v, total) => `${(v / total) * 100}%`;
  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-dialog cc-imgtools" role="dialog" aria-modal="true" aria-labelledby="cc-imgtools-title" style={{ width: 'min(920px, 100%)' }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
        <div className="ui-dialog__head" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="ui-dialog__icon" aria-hidden="true"><Crop size={18} /></span>
            <h2 id="cc-imgtools-title" className="ui-dialog__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Edit {image.name.replace(/^\d+_/, '')}</h2>
          </span>
          <button ref={closeRef} type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <Tabs value={tab} onChange={setTab} tabs={tabs} label="Image tools" idPrefix="imgtool" />

        {tab === 'crop' && (
          <div role="tabpanel" aria-labelledby="imgtool-crop">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <div className="cc-imgtools__stage" style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', justifyContent: 'center', background: '#0b1220', borderRadius: 8, padding: 8 }}>
                <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', touchAction: 'none', userSelect: 'none' }}>
                  <img ref={imgRef} src={src} alt="" draggable={false} onLoad={onLoad} style={{ display: 'block', maxWidth: '100%', maxHeight: '52vh' }} />
                  {nat && rect && (
                    <div className="cc-crop" data-testid="crop-frame" onPointerDown={beginDrag('move')}
                      style={{ position: 'absolute', left: pct(rect.x, nat.w), top: pct(rect.y, nat.h), width: pct(rect.w, nat.w), height: pct(rect.h, nat.h), boxShadow: '0 0 0 9999px rgba(2,6,23,.62)', outline: '2px solid #38bdf8', cursor: 'move' }}>
                      {HANDLE_IDS.map((h) => (
                        <span key={h} data-handle={h} onPointerDown={beginDrag(h)}
                          style={{ position: 'absolute', left: HANDLE_POS[h][0], top: HANDLE_POS[h][1], width: 14, height: 14, margin: -7, background: '#38bdf8', border: '2px solid #0f172a', borderRadius: 3, cursor: `${HANDLE_CURSOR[h]}-resize` }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ flex: '0 1 250px', minWidth: 220 }}>
                <Field label="Shape">
                  <Select aria-label="Crop shape" value={aspectId} onChange={(e) => pickAspect(e.target.value)} options={ASPECTS} />
                </Field>
                {rect && nat && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']].map(([k, l]) => (
                      <Field key={k} label={`${l} (px)`}>
                        <Input type="number" aria-label={`Crop ${l.toLowerCase()} in pixels`} min={0} max={k === 'x' || k === 'w' ? nat.w : nat.h} value={rect[k]} onChange={(e) => setRect(setField(rect, k, e.target.value, nat, aspect))} />
                      </Field>
                    ))}
                  </div>
                )}
                {rect && <p className="ui-hint" data-testid="crop-size">The result is {rect.w} × {rect.h} px{nat && (rect.w < nat.w || rect.h < nat.h) ? ` (from ${nat.w} × ${nat.h})` : ''}.</p>}
                <fieldset style={{ border: 0, padding: 0, margin: '10px 0 0' }}>
                  <legend className="ui-label" style={{ marginBottom: 6 }}>Save as</legend>
                  <label className="ui-check" style={{ display: 'flex', marginBottom: 6 }}><input type="radio" name="crop-mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /> A new image (the original stays)</label>
                  <label className="ui-check" style={{ display: 'flex' }}><input type="radio" name="crop-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace the original</label>
                </fieldset>
                {mode === 'replace' && <p className="ui-hint" role="note">Every page that uses this image will show the cropped one.</p>}
              </div>
            </div>
            <div className="ui-dialog__actions" style={{ marginTop: 14 }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" icon={Save} disabled={busy || !rect} onClick={saveCrop}>{busy ? 'Saving…' : mode === 'copy' ? 'Save the cropped image' : 'Crop the original'}</Button>
            </div>
          </div>
        )}

        {tab === 'focal' && (
          <div role="tabpanel" aria-labelledby="imgtool-focal">
            <p className="ui-hint" style={{ marginTop: 10 }}>Click the most important part of the picture. When a block shows this image cropped to fit (a banner, a square), it keeps that point in view.</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', justifyContent: 'center', background: '#0b1220', borderRadius: 8, padding: 8 }}>
                <div ref={stageRef} data-testid="focal-stage" onPointerDown={pointerOnStage} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}>
                  <img src={src} alt="" draggable={false} onLoad={onLoad} style={{ display: 'block', maxWidth: '100%', maxHeight: '52vh' }} />
                  {focal && <span data-testid="focal-marker" aria-hidden="true" style={{ position: 'absolute', left: `${focal.x}%`, top: `${focal.y}%`, width: 26, height: 26, margin: -13, border: '3px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 2px #0f172a, 0 0 8px rgba(0,0,0,.6)', pointerEvents: 'none' }} />}
                </div>
              </div>
              <div style={{ flex: '0 1 250px', minWidth: 220 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Across (%)"><Input type="number" min={0} max={100} step={0.5} aria-label="Focal point across in percent" value={focal ? focal.x : ''} placeholder="50" onChange={(e) => typeFocal('x', e.target.value)} /></Field>
                  <Field label="Down (%)"><Input type="number" min={0} max={100} step={0.5} aria-label="Focal point down in percent" value={focal ? focal.y : ''} placeholder="50" onChange={(e) => typeFocal('y', e.target.value)} /></Field>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }} aria-label="How it looks when cropped" role="group">
                  {[['16 / 9', 'Wide'], ['1 / 1', 'Square'], ['4 / 5', 'Portrait']].map(([ar, label]) => (
                    <figure key={ar} style={{ margin: 0, flex: ar === '16 / 9' ? '1.6 1 0' : '1 1 0', minWidth: 0 }}>
                      <div style={{ aspectRatio: ar, overflow: 'hidden', borderRadius: 6, background: '#0b1220' }}>
                        <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: focal ? focalCss(focal) : 'center', display: 'block' }} />
                      </div>
                      <figcaption className="ui-hint" style={{ textAlign: 'center', marginTop: 4 }}>{label}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
            <div className="ui-dialog__actions" style={{ marginTop: 14 }}>
              {image.focal && <Button variant="ghost" disabled={busy} onClick={() => saveFocal(null)}>Remove the focal point</Button>}
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" icon={Save} disabled={busy || !focal} onClick={() => saveFocal(focal)}>{busy ? 'Saving…' : 'Save the focal point'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
