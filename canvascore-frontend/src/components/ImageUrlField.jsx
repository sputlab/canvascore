// An image address field with "Upload" (straight into the media library, with its progress) and "Library"
// (pick an image already uploaded), plus a small preview. Used by Global Options for the favicon and the
// default social image.
import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { Button, Input } from '../ui/kit';
import { notify } from '../ui/notify';
import { uploadImage } from '../editor/upload';
import { brandIconUrl } from '../ui/branding';
import MediaPickerModal from './MediaPickerModal';
import { __ } from '../i18n/index.js';

export default function ImageUrlField({ id, value, onChange, placeholder, accept = 'image/*', label }) {
  const fileRef = useRef(null);
  const [progress, setProgress] = useState(null);   // null = idle, 0..1 while uploading
  const [picking, setPicking] = useState(false);
  const [broken, setBroken] = useState('');
  const preview = brandIconUrl(value);

  const upload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setProgress(0);
    try {
      const data = await uploadImage(file, { onProgress: setProgress });
      if (data && data.success && data.url) { onChange(data.url); notify(__("{0} uploaded. Save & Publish to apply it.", file.name)); }
      else notify(data && data.message || __("Upload error."), 'error');
    } catch { notify(__("Connection problem: the image was not uploaded."), 'error'); }
    setProgress(null);
  };

  return (
    <div className="cc-imgfield">
      <div className="cc-imgfield__row">
        <span className="cc-imgfield__thumb" aria-hidden="true">
          {preview && broken !== preview ? <img src={preview} alt="" onError={() => setBroken(preview)} /> : <ImageIcon size={16} />}
        </span>
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} id={id} />
      </div>
      <div className="cc-imgfield__row">
        <input ref={fileRef} type="file" accept={accept} hidden onChange={upload} aria-hidden="true" tabIndex={-1} />
        <Button size="sm" icon={Upload} onClick={() => fileRef.current && fileRef.current.click()} disabled={progress !== null} aria-label={__("Upload image: {0}", label)}>
          {progress !== null ? __("Uploading {0}%", Math.round(progress * 100)) : __("Upload image")}
        </Button>
        <Button size="sm" variant="ghost" icon={ImageIcon} onClick={() => setPicking(true)} aria-label={__("Choose from the media library: {0}", label)}>{__("Library")}</Button>
      </div>
      {picking && <MediaPickerModal onClose={() => setPicking(false)} onSelect={(url) => { onChange(url); setPicking(false); }} />}
    </div>
  );
}
