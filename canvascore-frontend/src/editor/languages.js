import { __ } from '../i18n/index.js';
// Multilingual sites, the editor's side (the server's is canvascore-admin/languages.php). The site's languages are { enabled, default, list: [{ code, name }] }.
// A page or an item has a language (`lang`, '' = the default language) and shares `trans_group` with its translations. The default language is
// published at the root (/about/), the others in a folder of their own (/it/chi-siamo/). Pure functions: the screens only draw and listen.

// The languages offered when adding one (the name is how the language writes its own name: it is what visitors read in the switcher)
export const LANGUAGE_PRESETS = [
  ['en', __("English")], ['it', __("Italiano")], ['fr', __("Français")], ['de', __("Deutsch")], ['es', __("Español")], ['pt', __("Português")], ['pt-br', __("Português (Brasil)")],
  ['nl', __("Nederlands")], ['sv', __("Svenska")], ['da', __("Dansk")], ['no', __("Norsk")], ['fi', __("Suomi")], ['pl', __("Polski")], ['cs', 'Čeština'], ['sk', __("Slovenčina")],
  ['hu', __("Magyar")], ['ro', __("Română")], ['bg', 'Български'], ['el', 'Ελληνικά'], ['tr', __("Türkçe")], ['ru', 'Русский'], ['uk', 'Українська'],
  ['ar', 'العربية'], ['he', 'עברית'], ['hi', 'हिन्दी'], ['ja', '日本語'], ['ko', '한국어'], ['zh', '中文'], ['id', __("Bahasa Indonesia")], ['vi', __("Tiếng Việt")],
  ['hr', __("Hrvatski")], ['sl', __("Slovenščina")], ['ca', __("Català")], ['gsw', __("Schwiizerdütsch")],
];
export const MAX_LANGUAGES = 12;

// A language code as the site writes it ("it", "pt-br"); '' when it is not one (the same rule as the server)
export const cleanCode = (raw) => {
  const c = String(raw ?? '').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(c) ? c : '';
};
// The code as browsers write it ("pt-BR")
export const langTag = (code) => {
  const c = cleanCode(code);
  if (!c) return '';
  const [l, r] = c.split('-');
  return r ? `${l}-${r.length === 2 ? r.toUpperCase() : r}` : l;
};

export const isMultilingual = (cfg) => !!(cfg && cfg.enabled && Array.isArray(cfg.list) && cfg.list.length >= 2);
export const codesOf = (cfg) => (cfg && Array.isArray(cfg.list) ? cfg.list.map((l) => l.code) : []);
// The language a page or an item is in: its code, the default's for one with none; '' on a site that is not multilingual
export function langOf(row, cfg) {
  if (!isMultilingual(cfg)) return '';
  const c = cleanCode(row && row.lang);
  return c && codesOf(cfg).includes(c) ? c : cfg.default;
}
// Is it one of the site's languages? (content in a language that was taken away is not published)
export const langKnown = (row, cfg) => {
  const c = cleanCode(row && row.lang);
  if (!c) return true;
  return isMultilingual(cfg) ? codesOf(cfg).includes(c) : c === (cfg && cfg.default);
};
export const langName = (code, cfg) => ((cfg && cfg.list) || []).find((l) => l.code === code)?.name || String(code || '').toUpperCase();
// The folder of the language ("it/"), '' for the default
export const langPrefix = (code, cfg) => (isMultilingual(cfg) && code && code !== cfg.default ? `${code}/` : '');

const isRootSlug = (s) => s === 'index' || s === 'home' || !s;
// Where a page is online: the path ("/it/chi-siamo/", "/" for a home page), the value a menu or a button link holds ("it/chi-siamo/index.html"),
// and the link rich text holds ("{{BASE_URL}}it/chi-siamo/")
export function pagePath(p, cfg) {
  const pre = langPrefix(langOf(p, cfg), cfg);
  const slug = p.clean_slug || p.slug || '';
  return Number(p.is_home) === 1 || isRootSlug(slug) ? `/${pre}` : `/${pre}${slug}/`;
}
export const pageFile = (p, cfg) => `${pagePath(p, cfg).replace(/^\//, '')}index.html`;
export const pageLink = (p, cfg) => `{{BASE_URL}}${pagePath(p, cfg).replace(/^\//, '')}`;
// The pages or items that are translations of `row` (not itself), by language
export function translationsOf(rows, row) {
  const g = row && row.trans_group;
  if (!g) return [];
  return (rows || []).filter((r) => r.id !== row.id && r.trans_group === g && !Number(r.is_draft_copy));
}
// The site languages `row` has no translation in yet
export function missingLanguages(rows, row, cfg) {
  if (!isMultilingual(cfg)) return [];
  const have = new Set([langOf(row, cfg), ...translationsOf(rows, row).map((r) => langOf(r, cfg))]);
  return cfg.list.filter((l) => !have.has(l.code));
}
// Rows in one language ('' = all of them)
export const inLanguage = (rows, code, cfg) => (code ? (rows || []).filter((r) => langOf(r, cfg) === code) : rows || []);
