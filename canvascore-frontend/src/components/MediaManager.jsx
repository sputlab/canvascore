import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image as ImageIcon, Trash2, Upload, Copy, Zap, Folder, FolderOpen, FolderPlus, Pencil, Images, Inbox, MoveRight, X, CheckSquare, Crop, Crosshair, RefreshCw, Link2 } from 'lucide-react';
import { Button, IconButton, PageHeader, EmptyState, SearchInput, Badge, Select } from '../ui/kit';
import { notify } from '../ui/notify';
import { confirmDialog, promptDialog } from '../ui/dialog';
import { formatBytes, acceptFor, kindOf } from '../editor/mediaInfo';
import MediaThumb from './MediaThumb';
import { useUploader } from '../editor/useUploader';
import { UploadPanel } from './UploadPanel';
import MoveToFolderDialog from './MoveToFolderDialog';
import ImageTools from './ImageTools';
import { CROPPABLE } from '../editor/imageTools';
import { addImageFromUrl } from '../editor/mediaActions';
import { postForm } from '../editor/upload';

// Media library: images, audio and video. Folders (labels: the files never move, so addresses don't change), upload with
// progress (button or drag & drop), search and sort, select several files (Shift+click for a range) to
// move, copy or delete them together, alt text, size info, optimized copies, drag images onto a folder.
const ALL = '\u0000all';       // every image
const LOOSE = '';             // images not in a folder
const KINDS = [['all', 'All files'], ['image', 'Images'], ['audio', 'Audio'], ['video', 'Video']];
const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'Name A–Z'], ['za', 'Name Z–A'], ['big', 'Largest first'], ['small', 'Smallest first']];
const leaf = (p) => p.split('/').pop();
const post = async (action, body) => (await fetch('api.php?action=' + action, { method: 'POST', body: JSON.stringify(body) })).json();

export default function MediaManager() {
  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [current, setCurrent] = useState(ALL);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [lastClicked, setLastClicked] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dropFolder, setDropFolder] = useState(null);
  const [moving, setMoving] = useState(null);           // names being moved (dialog open)
  const [optimizing, setOptimizing] = useState(null);
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceTarget = useRef(null);
  const [tools, setTools] = useState(null);           // { image, start } while the image tools are open

  const fetchMedia = useCallback(() => {
    fetch('api.php?action=get_media').then((res) => res.json()).then((data) => { if (Array.isArray(data)) setImages(data); }).catch(console.error);
    fetch('api.php?action=get_media_folders').then((res) => res.json()).then((data) => { if (Array.isArray(data)) setFolders(data); }).catch(console.error);
  }, []);
  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const uploader = useUploader(useCallback((ok) => { if (ok) fetchMedia(); }, [fetchMedia]));
  const uploadFolder = current === ALL ? LOOSE : current;
  const upload = (files) => uploader.start(files, uploadFolder);

  // ---- what is shown
  const q = query.trim().toLowerCase();
  const inView = images.filter((img) => (current === ALL || (img.folder || '') === current)
    && (kind === 'all' || kindOf(img) === kind)
    && (!q || `${img.name} ${img.alt || ''}`.toLowerCase().includes(q)));
  const sorters = {
    new: (a, b) => (b.mtime || 0) - (a.mtime || 0), old: (a, b) => (a.mtime || 0) - (b.mtime || 0),
    az: (a, b) => a.name.localeCompare(b.name), za: (a, b) => b.name.localeCompare(a.name),
    big: (a, b) => (b.bytes || 0) - (a.bytes || 0), small: (a, b) => (a.bytes || 0) - (b.bytes || 0),
  };
  const shown = [...inView].sort(sorters[sort] || sorters.new);
  const childFolders = current === ALL ? [] : folders.filter((f) => (current === LOOSE ? !f.includes('/') : f.startsWith(current + '/') && !f.slice(current.length + 1).includes('/')));
  const countIn = (f) => images.filter((i) => (i.folder || '') === f || (f !== '' && (i.folder || '').startsWith(f + '/'))).length;

  // ---- selection
  const sel = [...selected].filter((n) => images.some((i) => i.name === n));
  const toggle = (name, e) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e && e.shiftKey && lastClicked) {   // range in the current order
        const a = shown.findIndex((i) => i.name === lastClicked); const b = shown.findIndex((i) => i.name === name);
        if (a > -1 && b > -1) { const [x, y] = a < b ? [a, b] : [b, a]; shown.slice(x, y + 1).forEach((i) => next.add(i.name)); return next; }
      }
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    setLastClicked(name);
  };
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.name));
  const selectAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((i) => i.name)));
  const clearSel = () => setSelected(new Set());

  // ---- actions
  const removeImages = async (names) => {
    let usage = {};
    try { usage = (await post('media_usage', { names })).usage || {}; } catch { usage = {}; }
    const used = names.filter((n) => (usage[n] || []).length);
    const where = [...new Set(used.flatMap((n) => usage[n]))].slice(0, 6);
    const one = names.length === 1;
    const ok = await confirmDialog({
      title: one ? `Delete "${names[0]}"?` : `Delete ${names.length} images?`,
      message: (used.length
        ? `${one ? 'It is' : `${used.length} of them ${used.length === 1 ? 'is' : 'are'}`} still used: ${where.join(', ')}${where.length < used.flatMap((n) => usage[n]).length ? '…' : ''}. Those places will show a broken image.\n\n`
        : 'They are not used on any page.\n\n') + 'This cannot be undone.',
      confirmLabel: one ? 'Delete image' : `Delete ${names.length} images`, danger: true,
    });
    if (!ok) return;
    try {
      const data = await post('delete_media', { names });
      notify(data.message || 'Deleted.');
      setSelected((prev) => { const n = new Set(prev); names.forEach((x) => n.delete(x)); return n; });
      fetchMedia();
    } catch { notify('Error deleting images.', 'error'); }
  };
  const moveImages = async (names, folder) => {
    try {
      const data = await post('media_move', { names, folder });
      if (!data.success) { notify(data.message || 'Not moved.', 'error'); return; }
      notify(`${data.moved} image${data.moved === 1 ? '' : 's'} moved to ${folder ? `“${folder}”` : 'no folder'}.`);
      setFolders(data.folders || folders); clearSel(); fetchMedia();
    } catch { notify('The images were not moved (connection problem).', 'error'); }
  };
  const copyUrls = async (urls) => {
    const text = urls.map((u) => (u.startsWith('http') ? u : window.location.origin + u)).join('\n');
    try { await navigator.clipboard.writeText(text); notify(urls.length === 1 ? 'Address copied.' : `${urls.length} addresses copied.`); }
    catch { await promptDialog({ title: 'Copy the address', message: 'Copying is blocked here: select it and copy it (Ctrl/Cmd+C).', defaultValue: text, readOnly: true, confirmLabel: 'Done', hideCancel: true }); }
  };
  // Image from a web address, and replacing the content of a file (the name and so every page that uses it stay)
  const fromUrl = async () => { const d = await addImageFromUrl(uploadFolder); if (d) fetchMedia(); };
  const askReplace = (img) => { replaceTarget.current = img; if (replaceRef.current) replaceRef.current.click(); };
  const replaceWith = async (file) => {
    const img = replaceTarget.current; replaceTarget.current = null;
    if (!file || !img) return;
    let usage = {};
    try { usage = (await post('media_usage', { names: [img.name] })).usage || {}; } catch { usage = {}; }
    const where = usage[img.name] || [];
    const ok = await confirmDialog({
      title: `Replace “${img.name.replace(/^\d+_/, '')}”?`,
      message: `The file keeps its name, description and folder; its content becomes “${file.name}”. ${where.length ? `It is used in: ${where.slice(0, 6).join(', ')}${where.length > 6 ? '…' : ''}. They show the new file after the next publish.` : 'No page uses it.'}\n\nThe old content is gone: this cannot be undone. The new file must be the same kind (${(img.name.split('.').pop() || '').toUpperCase()}).`,
      confirmLabel: 'Replace the file', danger: true,
    });
    if (!ok) return;
    const form = new FormData(); form.append('name', img.name); form.append('file', file, file.name);
    try {
      const d = await postForm('media_replace', form, {});
      notify((d && d.message) || 'Done.', d && d.success ? 'success' : 'error');
      if (d && d.success) fetchMedia();
    } catch { notify('The file was not replaced (connection problem).', 'error'); }
  };
  const saveAlt = async (img, alt) => {
    if ((img.alt || '') === alt) return;
    setImages((list) => list.map((x) => (x.name === img.name ? { ...x, alt } : x)));
    try {
      const data = await post('save_media_meta', { name: img.name, alt });
      if (!data.success) notify(data.message || 'The description was not saved.', 'error');
    } catch { notify('The description was not saved (connection problem).', 'error'); }
  };

  // ---- folders
  const newFolder = async () => {
    const base = current === ALL ? '' : current;
    const name = await promptDialog({ title: base ? `New folder in “${base}”` : 'New folder', label: 'Folder name', placeholder: 'e.g. Products', confirmLabel: 'Create folder' });
    if (!name) return;
    const path = base ? `${base}/${name}` : name;
    const data = await post('media_folder_create', { path });
    if (!data.success) { notify(data.message, 'error'); return; }
    setFolders(data.folders || []); setCurrent(path);
  };
  const renameFolder = async (f) => {
    const name = await promptDialog({ title: `Rename “${leaf(f)}”`, label: 'Folder name', defaultValue: leaf(f), confirmLabel: 'Rename' });
    if (!name || name === leaf(f)) return;
    const to = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) + name : name;
    const data = await post('media_folder_rename', { from: f, to });
    if (!data.success) { notify(data.message, 'error'); return; }
    setFolders(data.folders || []); if (current === f || current.startsWith(f + '/')) setCurrent(to + current.slice(f.length)); fetchMedia();
  };
  const deleteFolder = async (f) => {
    const n = countIn(f);
    const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    if (!(await confirmDialog({ title: `Delete the folder “${leaf(f)}”?`, message: n ? `Its ${n} image${n === 1 ? '' : 's'} (and its sub-folders) go to ${parent ? `“${parent}”` : '“Not in a folder”'}. No image is deleted.` : 'It is empty.', confirmLabel: 'Delete folder', danger: true }))) return;
    const data = await post('media_folder_delete', { path: f });
    setFolders(data.folders || []); if (current === f || current.startsWith(f + '/')) setCurrent(parent || ALL); fetchMedia();
  };

  // Dragging images onto a folder moves them (the whole selection when the dragged image is selected)
  const dragStart = (e, img) => {
    const names = selected.has(img.name) ? sel : [img.name];
    e.dataTransfer.setData('application/x-cc-images', JSON.stringify(names));
    e.dataTransfer.effectAllowed = 'move';
  };
  const folderDrop = (e, f) => {
    const raw = e.dataTransfer.getData('application/x-cc-images');
    setDropFolder(null);
    if (!raw) return;
    e.preventDefault(); e.stopPropagation();
    try { moveImages(JSON.parse(raw), f); } catch { /* not ours */ }
  };
  const folderDropProps = (f) => ({
    onDragOver: (e) => { if ([...e.dataTransfer.types].includes('application/x-cc-images')) { e.preventDefault(); setDropFolder(f); } },
    onDragLeave: () => setDropFolder((d) => (d === f ? null : d)),
    onDrop: (e) => folderDrop(e, f),
  });

  // Optimized copies for images uploaded before
  const optimizeAll = async () => {
    let done = 0; let skipped = 0;
    setOptimizing({ done: 0, remaining: images.filter((x) => !x.optimized).length });
    try {
      for (let i = 0; i < 200; i++) {
        const data = await post('optimize_media', {});
        if (!data.success) { notify(data.message || 'Optimization stopped.', 'error'); break; }
        done += data.done; skipped += (data.skipped || []).length;
        setOptimizing({ done, remaining: data.remaining });
        if (!data.remaining) break;
      }
      if (done) notify(`${done} image${done === 1 ? '' : 's'} optimized.`);
      if (skipped) notify(`${skipped} image${skipped === 1 ? '' : 's'} could not be optimized here (the server may lack WebP support or memory). They still work as they are.`, 'info');
      if (!done && !skipped) notify('Nothing to optimize.');
    } catch { notify('Optimization stopped (connection problem).', 'error'); }
    setOptimizing(null);
    fetchMedia();
  };
  const notOptimized = images.filter((x) => kindOf(x) === 'image' && !x.optimized).length;

  const folderItem = (f, label, Icon, depth = 0, count) => (
    <div key={f === ALL ? 'all' : 'f:' + f} className="cc-media-folder" data-drop={dropFolder === f ? 'true' : undefined} style={{ paddingLeft: 8 + depth * 14 }} {...(f === ALL ? {} : folderDropProps(f))}>
      <button type="button" className="cc-media-folder__btn" aria-current={current === f ? 'true' : undefined} onClick={() => { setCurrent(f); clearSel(); }}>
        <Icon size={15} aria-hidden="true" /> <span className="cc-media-folder__name" title={f === ALL || f === LOOSE ? label : f}>{label}</span>
        <span className="cc-media-folder__count">{count}</span>
      </button>
      {f !== ALL && f !== LOOSE && current === f && (
        <span className="cc-media-folder__tools">
          <IconButton icon={Pencil} label={`Rename the folder ${leaf(f)}`} size="sm" onClick={() => renameFolder(f)} />
          <IconButton icon={Trash2} label={`Delete the folder ${leaf(f)}`} size="sm" onClick={() => deleteFolder(f)} style={{ color: '#f87171' }} />
        </span>
      )}
    </div>
  );

  const title = current === ALL ? 'All images' : current === LOOSE ? 'Not in a folder' : current;
  return (
    <div onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); } }}>
      <PageHeader icon={ImageIcon} title="Media Library" description="Images, audio and video you can use in any page. Drop files anywhere on this page to upload them into the open folder."
        actions={<>
          <Button icon={FolderPlus} onClick={newFolder}>New folder</Button>
          <Button icon={Link2} onClick={fromUrl}>From a web address</Button>
          <Button variant="success" icon={Upload} onClick={() => fileRef.current && fileRef.current.click()}>{uploader.busy ? 'Uploading…' : 'Upload'}</Button>
          <input ref={fileRef} type="file" multiple accept={acceptFor('all')} style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </>} />

      <div className="cc-media-layout">
        <nav className="ui-card cc-media-folders" aria-label="Folders">
          {folderItem(ALL, 'All images', Images, 0, images.length)}
          {folderItem(LOOSE, 'Not in a folder', Inbox, 0, images.filter((i) => !i.folder).length)}
          {folders.length > 0 && <div className="ui-nav__group" style={{ padding: '10px 8px 4px' }}>Folders</div>}
          {folders.map((f) => folderItem(f, leaf(f), current === f ? FolderOpen : Folder, f.split('/').length - 1, countIn(f)))}
          {folders.length === 0 && <p className="ui-hint" style={{ padding: '8px' }}>No folders yet. Create one with “New folder”, then drag images onto it.</p>}
        </nav>

        <section className="cc-media-main" aria-label={title}>
          <div className="cc-media-toolbar">
            <h2 className="ui-card__title" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
            <div style={{ flex: '1 1 220px', maxWidth: 320 }}><SearchInput value={query} onChange={setQuery} placeholder="Search name or description…" label="Search images" /></div>
            <Select aria-label="Show" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} style={{ width: 'auto' }} />
            <Select aria-label="Sort images" value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} style={{ width: 'auto' }} />
            {shown.length > 0 && (
              <label className="ui-check" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={allShownSelected} onChange={selectAll} /> Select all</label>
            )}
            {notOptimized > 0 && (
              <Button size="sm" icon={Zap} onClick={optimizeAll} disabled={!!optimizing} title="Make smaller copies so pages load faster on phones">
                {optimizing ? `Optimizing… ${optimizing.done} done, ${optimizing.remaining} left` : `Optimize ${notOptimized} older image${notOptimized === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>

          {sel.length > 0 && (
            <div className="cc-media-selbar" role="toolbar" aria-label="Selected images">
              <CheckSquare size={16} aria-hidden="true" /> <strong>{sel.length} selected</strong>
              <span style={{ flex: 1 }} />
              <Button size="sm" icon={MoveRight} onClick={() => setMoving(sel)}>Move to folder…</Button>
              <Button size="sm" icon={Copy} onClick={() => copyUrls(images.filter((i) => selected.has(i.name)).map((i) => i.url))}>Copy addresses</Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => removeImages(sel)}>Delete</Button>
              <IconButton icon={X} label="Clear the selection" size="sm" onClick={clearSel} />
            </div>
          )}

          <div className="ui-card" style={{ minHeight: 320, margin: 0, outline: dragging ? '2px dashed #38bdf8' : 'none', outlineOffset: 4 }}>
            {childFolders.length > 0 && (
              <div className="cc-media-subfolders">
                {childFolders.map((f) => (
                  <button key={f} type="button" className="cc-media-subfolder" data-drop={dropFolder === f ? 'true' : undefined} onClick={() => { setCurrent(f); clearSel(); }} {...folderDropProps(f)}>
                    <Folder size={18} aria-hidden="true" /> <span title={f}>{leaf(f)}</span> <span className="cc-media-folder__count">{countIn(f)}</span>
                  </button>
                ))}
              </div>
            )}
            {images.length === 0 ? (
              <EmptyState icon={ImageIcon} title="The library is empty" action={<Button variant="success" icon={Upload} onClick={() => fileRef.current && fileRef.current.click()}>Upload your first image</Button>}>
                Upload images here or drop them onto this page.
              </EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState icon={ImageIcon} title={q ? 'No images match your search' : 'No images in this folder'}>
                {q ? 'Try another word.' : 'Upload images here, or drag images from another folder onto this one in the list on the left.'}
              </EmptyState>
            ) : (
              <div className="cc-media-grid">
                {shown.map((img) => {
                  const isSel = selected.has(img.name);
                  return (
                    <figure key={img.name} className="cc-media-card" data-selected={isSel ? 'true' : undefined} draggable onDragStart={(e) => dragStart(e, img)}>
                      <div className="cc-media-card__thumb" onClick={(e) => toggle(img.name, e)}>
                        <MediaThumb item={{ ...img, url: `${img.url}?v=${img.mtime || 0}` }} draggable={false} />
                        <label className="cc-media-card__check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSel} onChange={() => {}} onClick={(e) => toggle(img.name, e)} aria-label={`Select ${img.name}`} />
                        </label>
                      </div>
                      <figcaption className="cc-media-card__body">
                        <div className="cc-media-card__row">
                          <span className="cc-media-card__name" title={img.name}>{img.name}</span>
                          <span className="cc-media-card__actions">
                            {kindOf(img) === 'image' && <IconButton icon={Crop} label={`Crop ${img.name} or set its focal point`} size="sm" onClick={() => setTools({ image: img, start: CROPPABLE.includes(img.name.split('.').pop().toLowerCase()) ? 'crop' : 'focal' })} />}
                            <IconButton icon={RefreshCw} label={`Replace the file ${img.name}`} size="sm" onClick={() => askReplace(img)} />
                            <IconButton icon={Copy} label={`Copy the address of ${img.name}`} size="sm" onClick={() => copyUrls([img.url])} />
                            <IconButton icon={MoveRight} label={`Move ${img.name} to a folder`} size="sm" onClick={() => setMoving([img.name])} />
                            <IconButton icon={Trash2} label={`Delete ${img.name}`} size="sm" onClick={() => removeImages([img.name])} style={{ color: '#f87171' }} />
                          </span>
                        </div>
                        <div className="cc-media-card__meta">
                          {kindOf(img) !== 'image' ? <span>{kindOf(img) === 'audio' ? 'Audio' : 'Video'}</span> : null}
                          {img.w ? <span>{img.w}×{img.h}</span> : null}
                          {img.bytes ? <span>{formatBytes(img.bytes)}</span> : null}
                          {current === ALL && img.folder ? <span className="cc-media-card__folder" title={img.folder}><Folder size={11} aria-hidden="true" /> {leaf(img.folder)}</span> : null}
                          {kindOf(img) === 'image' && img.variants && img.variants.length ? <Badge tone="published">Optimized</Badge> : null}
                          {img.focal ? <span className="cc-media-card__focal" title={`Focal point ${img.focal.x}% / ${img.focal.y}%`}><Crosshair size={11} aria-hidden="true" /> Focal point</span> : null}
                        </div>
                        {kindOf(img) === 'image' && <input className="ui-input cc-media-card__alt" aria-label={`Description of ${img.name}`} placeholder="Description (alt text)" defaultValue={img.alt || ''}
                          onBlur={(e) => saveAlt(img, e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {moving && <MoveToFolderDialog count={moving.length} folders={folders} initial={current === ALL ? '' : current}
        onClose={() => setMoving(null)} onMove={(f) => { const names = moving; setMoving(null); moveImages(names, f); }} />}
      <input ref={replaceRef} type="file" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} aria-label="New file for the replaced image"
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; replaceWith(f); }} />
      {tools && <ImageTools image={tools.image} start={tools.start} onClose={() => setTools(null)} onDone={() => fetchMedia()} />}
      <UploadPanel uploader={uploader} />
    </div>
  );
}
