// Media library actions shared by the library page and the picker: an image from a web address.
import { notify } from '../ui/notify';
import { promptDialog } from '../ui/dialog';

// Asks for the address of an image, has the server download it into the library (public addresses only) and resolves with the
// server's answer ({ success, url, filename, … }), or null when cancelled. Failures are reported to the user.
export async function addImageFromUrl(folder = '') {
  const url = await promptDialog({
    title: 'Add an image from a web address',
    message: 'CanvasCore downloads the image into your library, so it keeps working if the other site changes. Use images you have the right to use.',
    label: 'Image address', placeholder: 'https://example.com/photo.jpg', confirmLabel: 'Add to the library',
  });
  if (!url) return null;
  let d;
  try {
    d = await (await fetch('api.php?action=media_import_url', { method: 'POST', body: JSON.stringify({ url, folder }) })).json();
  } catch { d = { success: false, message: 'Connection problem: the image was not added.' }; }
  notify((d && d.message) || (d && d.success ? 'Image added.' : 'The image was not added.'), d && d.success ? 'success' : 'error');
  return d && d.success ? d : null;
}
