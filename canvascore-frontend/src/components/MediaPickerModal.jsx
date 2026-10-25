import React, { useState, useEffect, useRef, useCallback } from 'react';
import { notify } from '../ui/notify';
import { Image as ImageIcon, X, Upload, Link2 } from 'lucide-react';
import { addImageFromUrl } from '../editor/mediaActions';
import { focalCss } from '../editor/imageTools';
import { SearchInput } from '../ui/kit';
import { useUploader } from '../editor/useUploader';
import { UploadPanel } from './UploadPanel';
import { formatBytes, acceptFor, kindOf } from '../editor/mediaInfo';
import MediaThumb from './MediaThumb';

// Media library picker (modal): choose an uploaded image (or audio / video file: `kind`) or upload new ones.
// Used by the property panel and by the rich text editor. onSelect(url, alt): alt = the image's
// description saved in the library (empty when none), so blocks can fill their alt field; focal = the image's focal point as an
// object-position ("30% 70%", empty when none), so an Image block can keep the subject in view.
const NOUN = { image: ['an', 'image', 'images'], audio: ['an', 'audio file', 'audio files'], video: ['a', 'video', 'videos'] };
const MediaPickerModal = ({ onClose, onSelect, kind = 'image' }) => {
  const [article, one, many] = NOUN[kind] || NOUN.image;
  const [images, setImages] = useState(null);   // null = loading
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('\u0000all');   // filter: every image, '' = not in a folder, or a folder
  const closeRef = useRef(null);
  const fetchMedia = () => fetch('api.php?action=get_media').then((res) => res.json())
    .then((data) => setImages(Array.isArray(data) ? data : []))
    .catch(() => { setImages([]); notify('Could not load the media library.', 'error'); });
  useEffect(() => {
    fetchMedia(); if (closeRef.current) closeRef.current.focus();
    fetch('api.php?action=get_media_folders').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setFolders(d); }).catch(() => {});
  }, []);
  const uploader = useUploader(useCallback((ok) => { if (ok) fetchMedia(); }, []));

  // New images go into the folder being shown (none when showing every image)
  const handleUpload = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    uploader.start(files, folder === '\u0000all' ? '' : folder);
  };

  const fromUrl = async () => { const d = await addImageFromUrl(folder === '\u0000all' ? '' : folder); if (d) fetchMedia(); };

  const q = query.trim().toLowerCase();
  const ofKind = (images || []).filter((img) => kindOf(img) === kind);
  const shown = ofKind.filter((img) => (folder === '\u0000all' || (img.folder || '') === folder) && (!q || `${img.name} ${img.alt || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-dialog cc-picker" role="dialog" aria-modal="true" aria-labelledby="cc-picker-title"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
        <div className="ui-dialog__head" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ui-dialog__icon" aria-hidden="true"><ImageIcon size={18} /></span>
            <h2 id="cc-picker-title" className="ui-dialog__title">Choose {article} {one}</h2>
          </span>
          <span className="ui-row" style={{ gap: 8 }}>
            <label className="ui-btn ui-btn--success ui-btn--sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} aria-hidden="true" /> {uploader.busy ? 'Uploading…' : 'Upload'}
              <input type="file" multiple style={{ display: 'none' }} accept={acceptFor(kind)} onChange={handleUpload} />
            </label>
            {kind === 'image' && <button type="button" className="ui-btn ui-btn--sm" onClick={fromUrl}><Link2 size={14} aria-hidden="true" /> From a web address</button>}
            <button ref={closeRef} type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
          </span>
        </div>
        {images && ofKind.length > 0 && (
          <div style={{ margin: '6px 0 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}><SearchInput value={query} onChange={setQuery} placeholder="Search by name or description…" label={`Search ${many}`} /></div>
            <select className="ui-select" aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} style={{ flex: '0 1 220px' }}>
              <option value={'\u0000all'}>All {many}</option>
              <option value="">Not in a folder</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        <div className="cc-picker__grid">
          {images === null ? <p className="ui-hint">Loading…</p>
            : ofKind.length === 0 ? <p className="ui-hint">No {many} yet: upload one{kind === 'image' ? '' : ', or close this window and paste the address of a file hosted elsewhere'}.</p>
            : shown.length === 0 ? <p className="ui-hint">No {many} match your search.</p>
            : shown.map((img) => (
              <button key={img.name} type="button" className="cc-picker__item" onClick={() => onSelect(img.url, img.alt || '', focalCss(img.focal))}
                title={img.alt ? `${img.name} — ${img.alt}` : img.name} aria-label={`Choose ${img.alt || img.name}`}>
                <MediaThumb item={{ ...img, url: `${img.url}?v=${img.mtime || 0}` }} />
                <span className="cc-picker__meta">{kind !== 'image' ? img.name.replace(/^\d+_/, '') : (img.w ? `${img.w}×${img.h}` : '')}{img.bytes ? ` · ${formatBytes(img.bytes)}` : ''}</span>
              </button>
            ))}
        </div>
      </div>
      <UploadPanel uploader={uploader} />
    </div>
  );
};

export default MediaPickerModal;
