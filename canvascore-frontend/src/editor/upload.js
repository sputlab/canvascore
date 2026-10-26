import { __ } from '../i18n/index.js';
import { translatePayload } from '../i18n/apiMessages.js';
// Uploads a file (one image to the media library, a backup to restore) and reports its progress (0..1).
// XMLHttpRequest is used because fetch can't report upload progress; it sends the same CSRF token as the
// fetch guard. If the server answers 401/403 (session expired or token to refresh) the upload is retried
// once through fetch, whose guard handles sign-in again and the token refresh.
const token = () => (typeof window !== 'undefined' && window.__CC_CSRF) || '';

const viaFetch = async (action, form) => {
  const res = await fetch(`api.php?action=${action}`, { method: 'POST', body: form });
  return res.json();
};

export function uploadImage(file, { folder = '', onProgress = () => {} } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (folder) form.append('folder', folder);
  return postForm('upload_media', form, { onProgress });
}

// POSTs a FormData to an api.php action and resolves with its JSON answer. onSent(): the file is sent and
// the server is now working on it (a restore can take a while after the upload).
export function postForm(action, form, { onProgress = () => {}, onSent = () => {} } = {}) {
  if (typeof XMLHttpRequest === 'undefined') return viaFetch(action, form).finally(() => onProgress(1));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `api.php?action=${action}`);
    const t = token();
    if (t) xhr.setRequestHeader('X-CSRF-Token', t);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(0.99, e.loaded / e.total)); };
    xhr.upload.onload = () => onSent();
    xhr.onload = () => {
      if (xhr.status === 401 || xhr.status === 403) { viaFetch(action, form).then(resolve, reject); return; }
      onProgress(1);
      try { resolve(translatePayload(JSON.parse(xhr.responseText))); } catch { resolve({ success: false, message: __("Unexpected answer from the server ({0}).", xhr.status) }); }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(form);
  });
}
