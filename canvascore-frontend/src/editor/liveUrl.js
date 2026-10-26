import { langOf, langPrefix } from './languages';

// Where the page being edited is online (relative to canvascore-admin/), or null when it isn't published yet.
// A draft copy's live version is its parent page; header/footer show on the home page. `cfg`: the site's languages (a language other than the default
// is published in a folder of its own).
export function livePageUrl(p, pages, colSlug, cfg = null) {
  if (!p) return null;
  const pre = langPrefix(langOf(p, cfg), cfg);
  if (p.__part) return `../${pre}`;
  if (p.__item) return p.status === 'published' && colSlug && p.slug ? `../${pre}${colSlug}/${encodeURIComponent(p.slug)}/` : null;
  const live = Number(p.is_draft_copy) === 1 ? (pages || []).find((x) => x.id === p.parent_id) : p;
  if (!live || !['published', 'modified'].includes(live.status)) return null;
  const slug = live.clean_slug || live.slug || '';
  return (Number(live.is_home) === 1 || slug === 'index' || slug === 'home' || !slug) ? `../${pre}` : `../${pre}${encodeURIComponent(slug)}/`;
}
