// The texts the server writes into its answers (messages, errors, warnings) are in English; in another language they are put through the
// dictionary as they arrive, so every screen shows them in the admin's language without each one asking. A message with no translation stays as it is.
import { __, getLocale } from './index.js';

const TEXT_KEYS = new Set(['message', 'error', 'errors', 'warning', 'warnings', 'notes', 'problems']);

// Only the answer's own message fields: the answer itself and the objects directly inside it (a list of results, a "result"), never deeper.
// What an answer carries as the site's content (the blocks of a page, a header, a design) has fields called "message" too, and must come back as stored.
const MAX_DEPTH = 1;
export function translatePayload(v, textual = false, depth = 0) {
  if (typeof v === 'string') return textual ? __(v) : v;
  if (Array.isArray(v)) return v.map((x) => translatePayload(x, textual, depth));
  if (v && typeof v === 'object') {
    if (depth > MAX_DEPTH) return v;
    const out = {};
    for (const k of Object.keys(v)) out[k] = translatePayload(v[k], TEXT_KEYS.has(k), depth + 1);
    return out;
  }
  return v;
}

const API_RE = /(?:^|\/)(?:api|rebuild_all)\.php(?:\?|$)/;

// fetch() whose JSON answers from the API come back with their texts translated (nothing is done in English)
export function withTranslatedMessages(fetchFn) {
  return async function translatedFetch(input, init) {
    const res = await fetchFn(input, init);
    if (getLocale() === 'en') return res;
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (!API_RE.test(url) || !/json/i.test(res.headers.get('content-type') || '')) return res;
    let data;
    try { data = await res.clone().json(); } catch { return res; }
    return new Response(JSON.stringify(translatePayload(data)), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}
