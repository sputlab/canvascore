// The admin interface's language. Every visible text of the editor is written in English in the source and goes through __(): the English
// text is the key, and a locale file (src/i18n/locales/<code>.json) maps it to the language, with {0}, {1}… for the values put into it.
// A text with no translation shows in English. The language is chosen in the sidebar (or on the sign-in screen), kept in this browser, and
// applied by reloading, so texts built at load time (menus, lists of options) are in the language too.
import it from './locales/it.json' with { type: 'json' };

export const LOCALES = [['en', 'English'], ['it', 'Italiano']];
const DICTS = { it };
const KEY = 'cc_locale';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || DICTS[saved]) return saved;
  } catch { /* storage blocked: the browser's language */ }
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || 'en').slice(0, 2).toLowerCase() : 'en';
  return DICTS[nav] ? nav : 'en';
}

let current = detect();
export const getLocale = () => current;

function fill(s, args) {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined || args[i] === null ? '' : String(args[i]))) : s;
}

// __('Save', …values): the text in the admin's language
export function __(key, ...args) {
  if (typeof key !== 'string') return key;
  const d = DICTS[current];
  const s = d && typeof d[key] === 'string' && d[key] !== '' ? d[key] : key;
  return fill(s, args);
}

// A count with its noun: _n(3, 'page', 'pages') → "3 pagine"; the translations of both forms are looked up on their own
export function _n(n, one, other) {
  return `${n} ${__(Number(n) === 1 ? one : other)}`;
}

// Changes the language (kept in this browser) and reloads, so everything is drawn again in it
export function setLocale(code, reload = true) {
  if (code !== 'en' && !DICTS[code]) return;
  try { localStorage.setItem(KEY, code); } catch { /* not kept */ }
  current = code;
  if (reload && typeof location !== 'undefined') location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
