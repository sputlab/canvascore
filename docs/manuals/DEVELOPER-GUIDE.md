# CanvasCore Developer Guide

For developers joining the project. It covers how the pieces fit together, how to run and test them
locally, and the conventions the code follows. Paths are relative to the repository root.

Related manuals: [User Guide](USER-GUIDE.md) (using the editor), [Block Reference](BLOCK-REFERENCE.md)
(every block and its settings), [Administrator Guide](ADMIN-GUIDE.md) (install, hosting, accounts, backups).
Release history: [CHANGELOG.md](../CHANGELOG.md) and GitHub Releases. Contributing: [CONTRIBUTING.md](../../CONTRIBUTING.md)
(pull requests, sign-off, license of contributions). Security reports: [SECURITY.md](../../SECURITY.md) (privately,
never in a public issue).

**Contents**

1. [Overview and architecture](#1-overview-and-architecture)
2. [Repository layout](#2-repository-layout)
3. [Local development](#3-local-development) (lint, tests, building)
4. [Data model](#4-data-model) (storage, tables, page states, revisions, redirects, migrations)
5. [Rendering](#5-rendering)
6. [Publishing pipeline](#6-publishing-pipeline-rebuild_allphp)
7. [Server helpers](#7-server-helpers) (`config.php`, `compiler.php`, `media.php`, `update.php`, `backup.php`)
8. [Adding a new block](#8-adding-a-new-block)
9. [Editor state](#9-editor-state-srcstoreusestorejs)
10. [Saving and sessions](#10-saving-and-sessions)
11. [UI conventions](#11-ui-conventions)
12. [Backend API conventions](#12-backend-api-conventions-canvascore-adminapiphp)
13. [Versioning, releases and git workflow](#13-versioning-releases-and-git-workflow)

---

## 1. Overview and architecture

CanvasCore is a block-based CMS that **publishes static HTML**. It has two halves:

- **`canvascore-frontend/`**: the editor, a single-page app built with React 19, Vite and Zustand
  (drag & drop with dnd-kit, icons from lucide-react).
- **`canvascore-admin/`**: the PHP 8 backend with SQLite. It serves the editor's JSON API, stores
  content, and compiles the published pages into `.html` files in the folder **above** itself (the web root).

```
  Browser (editor SPA, served from canvascore-admin/)
  ┌──────────────────────────────────────────────┐
  │ React components ── Zustand store (useStore) │
  │        │                                     │
  │   renderBlock.mjs  (canvas = site HTML)      │
  │        │  fetch() wrapped by fetchGuard.js    │
  └────────┼─────────────────────────────────────┘
           │ JSON  (X-CSRF-Token, CCSESSID session cookie)
           ▼
  canvascore-admin/api.php ──► SQLite (canvascore.sqlite) + settings.json / menu.json
           │                    in the data dir (canvascore-data outside the web root, or canvascore-admin/data)
           │
  "Publish" (POST)
           ▼
  canvascore-admin/rebuild_all.php
           │  master.html + effects.css + menu + header/footer + cookie banner
           ▼
  canvascore-admin/compiler.php  render_block()      canvascore-admin/media.php  cc_optimize_images()
           │
           ▼
  ../index.html, ../<slug>/index.html, ../<collection>/<item>/index.html,
  ../<collection>/feed.xml, ../search-index.json, redirect pages at old addresses,
  ../sitemap.xml, ../robots.txt, ../404.html, ../.htaccess   (static files, served by any web server)

  One rendering contract:
     src/render/renderBlock.mjs  ≡  compiler.php render_block()
     checked block by block by tests/parity.mjs (JS output vs PHP CLI output)
     46 blocks are described ONCE (canvascore-admin/blocks/*.json) and rendered by two small
     engines (src/render/blockDef.mjs, canvascore-admin/blockdef.php): section 5, "Shared block definitions"
```

The key idea: the editor canvas shows each block with **the same HTML the site will get**. The JS renderer
(`renderBlock.mjs`) and the PHP compiler (`compiler.php`) are two implementations of one contract, kept
identical by an automated parity test rather than by sharing code across runtimes. Since 0.21.0 most blocks
need no hand-written pair: a block is a **definition** (a settings schema plus a template) that both engines
read, and its Content panel is generated from the same file.

## 2. Repository layout

```
README.md                    Overview, requirements, deploy, license
LICENSE                      GNU AGPL v3 text (CanvasCore is AGPL-3.0-or-later)
CONTRIBUTING.md              How to report bugs and send pull requests
SECURITY.md                  Supported versions, private vulnerability reporting
docs/                        CHANGELOG.md, manuals/
docs/manuals/                These manuals
docs/dev/                    Local-only internal notes (git-ignored, not in the repository)
canvascore-admin/            PHP backend (deployed into the site's admin folder)
canvascore-frontend/         React editor
```

**`canvascore-admin/`**

| File | Purpose |
| --- | --- |
| `api.php` | The editor's JSON API: auth, branding, pages, collections and items (incl. bulk actions), parts, masters, templates, media and media folders, menu, settings, users, backup, revisions, redirects |
| `compiler.php` | `render_block()` (block → HTML), `render_menu_html()`, `cc_cookie_banner_html()`, shared helpers (`cc_int`, `build_inline_style`, `cc_effect_classes`…) |
| `rebuild_all.php` | Publishes the whole site (pages, collection items, feeds, search index, redirects, sitemap, robots, 404, `.htaccess`), removes stale files |
| `config.php` | Data dir, security headers and the admin `.htaccess`, session boot and account check, CSRF and same-origin check, client IP and trusted proxies, login throttling, rate limits, code surfaces, content sanitizing on save (`cc_sanitize_blocks`), editor redaction, re-linking, revisions, redirects, reserved slugs, unpublishing deleted items/collections, public branding, SVG check, `cc_sanitize_html`, `cc_version`, slugs |
| `media.php` | Image optimization (WebP copies in `uploads/_cc/`, `srcset` on publish), the media metadata (`media.json`), media library folders (`media-folders.json`) and where images are used |
| `backup.php` | Whole-site backup as a ZIP, its checks and restore, saved copies and safety copies in `backups/` |
| `publish.php` | `cc_publish_site()` (the whole publish, used by `rebuild_all.php`, the scheduler and `cron.php`) and the scheduled publishing (`cc_run_schedules()`) |
| `update.php` | One-click updates: release check, signed package, backup, folder swap, health check, rollback (section 7) |
| `update-keys.php` | The public keys (Ed25519) that releases are signed with; the private key is never in the repository |
| `blockdef.php` | The PHP engine of the shared block definitions: setting cleaning, the template language, transforms, behaviour scripts (section 5) |
| `integrations.php` | Integrations: the settings file with its cleaners, the outgoing HTTP call, signed webhooks, Mailchimp and Brevo, the analytics snippet, Stripe payment links, the activity log (section 7) |
| `library.php` | The template library: the signed index, kit reading and checks, cleaning, installing and undo (sections 7 and 8.4) |
| `roles.php` | Roles and review: what each role may do, ownership, per-collection access and the review flow (section 7) |
| `blockpkg.php` | Block packages: the format, the install checks, the registry in the data folder, the scoped CSS (sections 7 and 8.3) |
| `wpimport.php` | The WordPress importer: export reader, HTML to blocks, image download, the resumable import (section 7) |
| `blocks/*.json` | One definition per block: settings, template, panel (46 files). Read by the editor at build time and by PHP at publish time |
| `migrations.php` | Versioned DB migrations and content migrations |
| `submit_form.php` | Public endpoint for form submissions (rate-limited; recipient, fields and success message from `forms.json`) |
| `install.php` | Setup wizard: setup key, requirements (including the HTTP check of the data folder), first account; locks itself once installed |
| `blocks.json` | Block defaults (`_baseStyles` + `types`), shared with the editor |
| `starters.json` | Starter page templates |
| `master.html` | HTML shell of every published page (`{{PAGE_CONTENT}}`, `{{MAIN_MENU}}`, `{{EFFECTS_CSS}}`…) |
| `effects.css` | Entrance/hover/loop effects and button hovers, inlined into pages and the canvas |
| `version.json` | Single source of the version (`app`, `db_schema`, `content_schema`, `build`, `built`) |

**`canvascore-frontend/`**

| Path | Purpose |
| --- | --- |
| `vite.config.js` | Injects `__APP_VERSION__`, `__APP_BUILD__`, `__BLOCK_DEFS__`, `__EFFECTS_CSS__` from `../canvascore-admin/`; the `canvascore-editor-csp` plugin adds the editor's Content Security Policy (`script-src 'self'`) and `referrer` / `robots` metas to the **built** `index.html` (not in the dev server, which needs inline scripts) |
| `public/menu-preview.html` | Menu Builder live preview: a page of its own, loaded in a sandboxed iframe (`allow-scripts`, no same origin) and fed the menu HTML by `postMessage`, so the menu's scripts run there and not under the editor's CSP |
| `scripts/bump.mjs` | `prebuild` hook: increments `build` in `version.json`, syncs `package.json` version |
| `scripts/library-kit.php`, `scripts/library-index.php` | Template library tools: `library-kit.php check` or `pack <folder>` for kit authors; `library-index.php --key … --kits … --base-url …` builds and signs the index (section 8.4) |
| `scripts/block-package.php` | Developer tool for block packages: `check <folder or zip>` runs the install checks, `pack <folder>` makes the ZIP (section 8.3) |
| `scripts/release-keygen.php`, `scripts/release-package.php` | Release tooling: make the signing key pair; pack and sign the update package of a release (section 13) |
| `.oxlintrc.json` | Lint config (react + oxc plugins) |
| `src/main.jsx` | Entry: imports `apiClient.js` first (installs the fetch guard), then the CSS and `<App />`; refuses to render inside a frame (`window.top !== window.self`) |
| `src/App.jsx` | Auth gate, view switch (`currentView`), overlays (session, drafts, toasts, dialogs) |
| `src/store/useStore.js` | The Zustand store: auth, pages, block tree, history, masters, templates |
| `src/render/renderBlock.mjs` | Canonical JS renderer (`renderBlock`, `blockRoot`, `buildInlineStyle`, `ccInt`, `escapeHtml`) |
| `src/render/blockDef.mjs` | The JS engine of the shared block definitions: imports `blocks/*.json` (`BLOCK_DEFS`), cleans each value with its setting, fills the template (section 5) |
| `src/render/effects.mjs` | Effect catalogs and `effectClasses()` / `buttonHover()` |
| `src/render/blockRuntime.mjs` | Behaviour scripts shared by the canvas and published pages (ES5). Each script sits between `// cc-<name>:begin` and `// cc-<name>:end`; the canvas runs it through the `init*Block` wrappers in `SortableBlock.jsx` |
| `src/render/logosMarquee.mjs` | Logo Cloud scrolling strip (repeats the logos to fill the line); the published page runs the same logic from `CC_LOGOS_SCRIPT` |
| `src/editor/blockCatalog.js` | Block names, icons, categories, keywords; `CONTAINER_TYPES` |
| `src/editor/RichText.jsx`, `commands.js`, `cleanHtml.js` | Rich text editor (in-place regions, toolbar, paste cleanup) |
| `src/utils/safeHtml.js` | `safeHtml(html)`: DOMPurify (`dompurify`, pinned to an exact version) with CanvasCore's config. **Every** HTML string the editor puts into its own DOM (canvas, version history preview, rich text fields, `insertHtml`, Edit HTML) goes through it; returns `''` when there is no DOM |
| `src/editor/layerDrop.js`, `previewEffects.js` | Layers drop positions; "Preview animation" on the canvas |
| `src/editor/placeholder.js` | `placeholderImage(w, h)`: built-in placeholder image as a `data:` PNG drawn on a canvas (no outside service; an SVG would be blanked on save) |
| `src/editor/mediaInfo.js` | Media library / picker helpers (`formatBytes`) |
| `src/editor/upload.js` | `uploadImage(file, { folder, onProgress })` and `postForm(action, form, { onProgress })`: XHR uploads with progress and the CSRF header, retried once through `fetch` on 401/403 |
| `src/editor/useUploader.js` | `useUploader(onFinished)`: upload queue (one file at a time) with per-file progress and result; rendered by `UploadPanel.jsx` |
| `src/components/VisualEditor.jsx` | Page editor: top bar, save/publish, shortcuts, side panels |
| `src/components/RevisionHistory.jsx` | Version history panel (History button): list, preview and restore of saved versions |
| `src/components/RedirectsCard.jsx` | Global Options › Redirects (list, add, delete; admins change them) |
| `src/components/ChangePasswordDialog.jsx` | "Change your own password" dialog (sidebar key icon) |
| `src/components/AboutDialog.jsx` | "About CanvasCore" (the ⓘ next to the version): version, website, GitHub, Discord, bug email, donations |
| `src/components/MediaManager.jsx`, `MoveToFolderDialog.jsx`, `UploadPanel.jsx` | Media library: folders, selection and bulk actions, sorting, "Move to…" dialog, upload progress panel (also used by `MediaPickerModal.jsx`) |
| `src/components/ImageUrlField.jsx` | Image address field with Upload (with progress), Library and preview (Global Options › Favicon / Default social image) |
| `src/components/Backup.jsx` | Backup page: make/download/keep backups, list saved and safety copies, chunked upload and restore, legacy `.json` import |
| `src/components/Canvas.jsx`, `SortableBlock.jsx` | Canvas and the per-block frame (DnD, selection, in-place text) |
| `src/components/PropertyPanel.jsx` | Content / Style / Advanced tabs for the selected block |
| `src/components/panel/` | `StyleTab`, `AdvancedTab`, `PageSettings`, `fields.jsx`, `helpers.js`, `constants.js` |
| `src/components/panel/SchemaPanel.jsx`, `widgets.jsx`, `widgetRegistry.js` | The Content panel generated from a block definition, and the named widgets it can use (hotspot pins, search filters, opening hours, grid columns, button size and border, hero button looks) |
| `src/components/panel/blocks/` | The hand-written Content panels of the blocks that are not (yet) definitions (`FlexRowPanel.jsx`, `FormPanel.jsx`…); `index.js` maps type → panel (`CONTENT_PANELS`) and adds a generated panel for every definition |
| `src/session/permissions.js` | The role table for the editor (`ROLES`, `canCreate`, `canPublishDirect`, `canPublishSite`, `canManageSite`, `canReview`, `reviewOf`): the twin of `roles.php`, so no button is offered that the server would refuse |
| `src/components/ReviewQueue.jsx`, `ReviewBar.jsx`, `CollectionAccess.jsx` | Reviews / My submissions; the review banner of the page editor; Collections › Who can work here |
| `src/components/ImageTools.jsx`, `src/editor/imageTools.js`, `mediaActions.js` | The media library's Crop and Focal point dialog and its pure maths (frame, handles, aspect, focal point); an image from a web address |
| `src/components/Integrations.jsx` | Administration › Integrations: the Webhooks, Newsletter, Analytics, Stripe and Activity tabs; keys are only typed in, never shown |
| `src/components/TemplateLibrary.jsx` | Administration › Template library: cards, filters, the install dialog, results, installed kits and Restore |
| `src/components/BlockPackages.jsx`, `src/editor/blockPackages.js` | Administration › Block packages; and the editor side of packages: `registerPackages()` registers their definitions, catalog entries and CSS, `loadBlockPackages()` fetches `pkg_list` after sign-in |
| `src/components/ImportWordPress.jsx` | Administration › Import from WordPress: choose, options, progress and report (drives `wp_analyze`, `wp_start`, `wp_step`) |
| `src/components/Updates.jsx` | Administration › Updates: check, update, requirements, history |
| `src/components/*.jsx` | Admin screens: PageManager, Collections, Templates, MediaManager, MediaPickerModal, MenuBuilder, GlobalSettings, UserManager, Submissions, Backup, AdminLayout… |
| `src/session/` | Session manager, fetch guard, local draft backups and trackers |
| `src/ui/` | UI kit (`kit.jsx`, `kit.css`), `global.css`, `notify.js` + `toast.jsx`, `dialog.js` + `dialogHost.jsx`, `branding.js` (`useBrandingHead()`, `brandIconUrl()`) + `BrandLogo.jsx` (site favicon as the admin logo) |
| `src/menu/menuThemes.js` | Menu defaults, themes, effect groups (mirrored in `compiler.php`) |
| `tests/` | The 12 test suites (10 Node, plus `server.php` and `security.php` in PHP) and the `render_php.php` / `render_php_list.php` / `render_def.php` / `render_menu.php` CLI helpers |

## 3. Local development

Requirements: Node.js ≥ 20 (developed with 24), npm, PHP ≥ 8 with `pdo_sqlite` and `dom` (`zip` for backups,
`curl` for `test:security`; `gd` with WebP support for the optimized image copies, skipped without it). The PHP
CLI must be on `PATH` for the tests.

```bash
cd canvascore-frontend
npm install
```

### Running the editor against PHP

The editor calls **relative** URLs (`api.php?action=…`, `rebuild_all.php`), so it must be served from
the same folder as the PHP files. `vite.config.js` has **no dev proxy**, so `npm run dev` alone gives you
the UI but every API call hits Vite and fails. Two setups work:

**A. PHP built-in server + watched build (no config changes).** The repository root is the web root, the
same layout as production (the `.gitignore` ignores all generated output at the root).

```bash
# terminal 1, repo root: serve the site and the admin. Several workers: php -S otherwise answers one
# request at a time, and a publish (or any slow request) would hold up every other call from the editor.
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8000

# terminal 2, canvascore-frontend/: rebuild the editor into canvascore-admin/ on every change
npx vite build --watch --outDir ../canvascore-admin
```

`npx vite build` does **not** run the `prebuild` hook, so the build number is not bumped. Vite won't empty
an `outDir` outside the project root, so the PHP files stay untouched; the emitted `index.html`, `assets/`,
`favicon.svg` and `icons.svg` are git-ignored in `canvascore-admin/` (the build also emits `menu-preview.html`). Data goes to
`../canvascore-data` next to the repository (outside it) when writable. Note that `php -S` ignores `.htaccess`
(the `canvascore-admin/.htaccess` that `api.php` writes is git-ignored too).

**First account.** There is no `admin`/`admin` any more: until an account exists, `api.php` answers 503
`not_installed`. Open `http://127.0.0.1:8000/canvascore-admin/install.php` once, paste the setup key from
`../canvascore-data/install-key.txt`, then use `http://127.0.0.1:8000/canvascore-admin/`. Without the wizard,
create an account in an existing database by hand and mark the site installed:

```bash
cd ../canvascore-data
HASH=$(php -r 'echo password_hash("dev-password-1", PASSWORD_DEFAULT);')
sqlite3 canvascore.sqlite "INSERT INTO admin (username, password_hash, role, must_change_pw, session_gen) VALUES ('dev', '$HASH', 'admin', 0, 0);
  INSERT OR REPLACE INTO cc_meta (key, value) VALUES ('installed_at', datetime('now'));"
```

**B. Vite dev server with HMR + a local proxy.** Run `PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8000` at the repo root as above and
add a proxy to your local `vite.config.js` (**don't commit it**):

```js
server: { proxy: {
  '/api.php': 'http://127.0.0.1:8000/canvascore-admin',
  '/rebuild_all.php': 'http://127.0.0.1:8000/canvascore-admin',
} },
```

The session cookie (`CCSESSID`) uses path `/`, so it works through the proxy (the CSRF token lives in memory,
not in a cookie). Sign-in and every POST must look same-origin (`Origin` / `Sec-Fetch-Site`): keep the proxy's
default of passing the browser's `Host` through (no `changeOrigin`). The dev server doesn't add the editor's CSP,
so check CSP-sensitive changes in a build. Publishing writes the site one
level above `canvascore-admin/`, i.e. the repo root.

### Lint

```bash
npm run lint                      # oxlint --max-warnings 0: the repo is kept at zero warnings
```

### Tests

`npm test` runs the 12 suites in sequence (each exits non-zero on failure):

| Script | File | Covers |
| --- | --- | --- |
| `test:parity` | `tests/parity.mjs` | JS ↔ PHP parity of structure, classes and inline styles for fixtures of every block (plus defaults from `blocks.json`); for the shared definitions the two engines must give the **same HTML byte for byte** (hostile values included), and the template language, setting cleaning and every transform are checked on test definitions in both engines |
| `test:blocks` | `tests/blocks.mjs` | Behaviour of the compiled Accordion, Tabs, Pricing, Gallery (lightbox script run in jsdom), sanitizing |
| `test:content` | `tests/blocks-content.mjs` | Divider…Business blocks: safe and working PHP output (clock/rAF/IntersectionObserver controlled) |
| `test:session` | `tests/session.mjs` | Drafts, trackers, session manager with a fake expiring server and simulated clock, fetch guard |
| `test:session-ui` | `tests/session-ui.mjs` | Real `<App />` against a fake backend: expiry mid-save, login overlay, retry |
| `test:panels` | `tests/panels-ui.mjs` | `addBlock` → `PropertyPanel` field edits → store, and canvas rendering per block; every definition has a generated panel whose fields and widgets exist and that mounts |
| `test:starters` | `tests/starters.mjs` | `starters.json`: known types, real content fields, unique ids, renders in JS and PHP |
| `test:menu` | `tests/menu.mjs` | Menu effect catalog in sync with `compiler.php`, every theme/effect rendered by PHP, escaping |
| `test:rich-text` | `tests/rich-text.mjs` | Paste cleanup, in-place editing keeps layout, toolbars, tidy on blur |
| `test:ui` | `tests/ui-shell.mjs` | Sidebar, Pages screen, editor top bar and shortcuts, Add panel, property tabs, effects, Layers, dialogs, media library (folders, selection, uploads), site branding and About, Backup page, Collections (rename, bulk actions) |
| `test:server` | `tests/server.php` (`php tests/server.php`) | Server helpers through the real PHP code: security helpers (rich-text styles and links, `cc_sanitize_blocks`, active URLs, reserved slugs, redirect targets, CSS colors/lengths, image URLs, `build_inline_style`), migration 8 on an old database (default account removed, installed flag, stored rich text cleaned, `session_gen` and unique names), code surfaces kept on editors' saves, re-linking after a slug change, client IP behind trusted proxies, SVG upload check, sanitizer, `cc_int`, slider arrows and reduced motion, form fallbacks and field types, revision history, image copies and `srcset`, redirects (chains, loops, `.htaccess` block, redirect page), cookie banner, Site Search block, public branding, media folders and image usage, backup and restore (contents, refused files, newer versions, safety copies), deleted collections and items going offline |
| `test:security` | `tests/security.php` (`php tests/security.php`) | Security regressions over real HTTP: installs a fresh copy of `canvascore-admin/` in a temporary folder, serves it with PHP's built-in server and replays the attacks of the 0.14.0 security review (no default account, setup key, sessions, CSRF and login CSRF, throttling, roles, sanitizing, SVGs, reserved addresses, forms…); they must all fail. Needs the PHP CLI with `pdo_sqlite`, `dom`, `zip` and `curl` |

How they work:

- **PHP side**: the tests pipe a block (or menu) as JSON to `php tests/render_php.php` /
  `tests/render_menu.php`, which `require` the real `compiler.php`. No web server is involved. `render_php_list.php`
  renders a whole list of blocks in one process (the parity test uses it: seconds instead of minutes) and
  `render_def.php` renders ad-hoc definitions (the template-language checks).
- **`tests/server.php`** is plain PHP: it `require`s `compiler.php` (which loads `config.php`), calls the helpers
  directly and prints the same `✓` / `✗` checks. It never touches the real data dir: files go to temp dirs
  (`sys_get_temp_dir()`), databases are in-memory SQLite (`new PDO('sqlite::memory:')`, tables created by
  running the real closures from `cc_db_migrations()`), and the media metadata file is redirected with
  `$GLOBALS['CC_MEDIA_META_FILE']`, which `cc_media_meta_file()` honours. The same goes for
  `CC_MEDIA_FOLDERS_FILE` (media folders), `CC_BACKUP_DATA_DIR`, `CC_UPLOADS_DIR` and `CC_BACKUP_DIR` (backup and
  restore) and `CC_SITE_ROOT` (`cc_unpublish_files()`). `cc_client_ip()` takes the trusted
  proxy list as an argument for the same reason.
- **Component tests** (`panels-ui`, `rich-text`, `session-ui`, `ui-shell`) create a `JSDOM`, expose its
  globals on `globalThis`, start Vite in middleware mode (`createServer({ server: { middlewareMode: true } })`)
  and load the real modules with `vite.ssrLoadModule('/src/...')`, then mount them with `react-dom` and drive
  them with DOM events. `__BLOCK_DEFS__` etc. are passed via `define`. `fetch` is stubbed or replaced by a
  fake backend.
- **`tests/security.php`** also covers the integrations (fake Mailchimp, Brevo, Stripe and a webhook receiver; the signature, consent, the honeypot, masked keys, the analytics snippet, the Payment Button), the template library (a signed test index, a hostile kit, a wrong checksum, a changed index, undo) over HTTP, block packages (install by upload, refusals, images served, an editor using a block) and the WordPress import (who may use it, a hostile file, a full import) over HTTP, and the updates over real HTTP: a fake release feed (`update-source.php` and a test
  `update-keys.php` in the temporary install) serves signed and tampered packages; an untrusted signature, a changed package,
  a path outside the admin folder, a wrong version, a file PHP can't parse and a new version that fails its first check must
  all be refused or rolled back with the old version intact, and a signed release must install.
- Output is a list of `✓` / `✗` checks and a final `… OK` line.

### Building

```bash
npm run build                                   # prebuild bumps build in version.json, output in dist/
npx vite build --outDir /tmp/cc-check           # build check WITHOUT bumping the build number
```

Deploying is described in the [README](../../README.md#deploy) and the [Administrator Guide](ADMIN-GUIDE.md):
the contents of `dist/` are copied into `canvascore-admin/`.

## 4. Data model

### Storage locations

`cc_data_dir()` (`config.php`) keeps an existing database where it is. For a new one it picks the first
writable folder outside the web root (`DOCUMENT_ROOT`, via `cc_doc_root()` / `cc_path_inside()`) among
`dirname(DOCUMENT_ROOT)/canvascore-data-<sub-folder>` (only when the site is in a sub-folder of the web root; one
folder per site),
`../../canvascore-data` and `canvascore-admin/data/`, falling back to any writable one. Data in
`canvascore-admin/data/` is moved out (DB, `settings.json`, `menu.json`, `forms.json`) as soon as a folder outside
the web root can be written. It contains:

| File | Content |
| --- | --- |
| `canvascore.sqlite` | All structured content (tables below) |
| `settings.json` | Global Options: `brandColor`, `fontFamily`, `siteName`, `siteSuffix`, `siteUrl`, `faviconUrl`, `defaultOgImage`, `robotsAllow`, `menuInheritTheme`, `headerEnabled`, `footerEnabled`, `cookieBanner` (`{ enabled, text, acceptLabel, declineLabel, privacyLabel, privacyUrl, position }`), `adminEmail`, `emailFrom`, `emailSubject`, `sessionTimeoutMinutes`, `trustedProxies` (the last five are admin-only: `get_settings` leaves them out for editors and an editor's save keeps the stored values) |
| `menu.json` | `{ "items": [...], "settings": {...} }`, nested items (`children`), legacy flat format still read |
| `integrations.json` | Integrations (0600): `webhooks` (id, name, url, enabled, forms, secret), `mailchimp` and `brevo` (enabled, api_key, list_id, forms; double_optin), `analytics` (provider and ids, consent), `stripe` (api_key, links). Written by `cc_int_save()`; only masked copies reach the editor (`cc_int_public()`). Not in a backup |
| `forms.json` | Written by each publish: form id → `{ to, labels, success, type, meta }` (recipient, field labels in order, success message; `type` form, newsletter or wizard; `meta` = the positions of the first `email`, `name` and `consent` fields), so addresses never reach the client and `submit_form.php` accepts only `field_0…field_N-1` with those labels. Older registries (id → recipient string) are still read |
| `media.json` | Media metadata per uploaded file name: `alt`, `w`, `h`, `bytes`, `variants` (widths of the WebP copies), `optimized`, `folder` (media library folder path such as `Products/Shoes`, `''` = none; see `media.php`) |
| `media-folders.json` | Array of media folder paths, so empty folders exist too (parents of listed folders are implied) |
| `backups/` | Backup ZIPs: `backup-…zip` (kept by hand), `before-restore-…zip` (safety copies, newest 5), `download-…zip` and `upload-….part` (temporary, removed after an hour); deny-all `.htaccess` |
| `packages/` | Installed block packages: `<id>/` (the package's files, as installed) and `index.json` (the registry: id, version, enabled, installer, date) |
| `library/` | Template library: `index.json` (the verified index and when it was fetched), `previews/`, `installed.json` (the log of installs), `undo-<id>.json` (the safety copy of a site kit's design) |
| `imports/` | WordPress import jobs, one folder per job (`meta.json`, `state.json`, `slugs.json`, `terms.json`, `pages.jsonl`, `posts.jsonl`, `media.jsonl`, `mediamap.json`, `lock`); deleted on discard and after 7 days; deny-all `.htaccess` |
| `updates/` | One-click updates (`update.php`): `db-<version>-…sqlite` and `code-<version>-…zip` copies taken before each update (newest 3 of each), `history.json`, `last-check.json`, `health.json` (the one-time token of the running check); deny-all `.htaccess` |
| `published_files.json` | Manifest of files the last successful publish wrote (`…/index.html` and `…/feed.xml`, relative to the site root); used to delete pages and feeds no longer published |
| `login_attempts.json`, `rate_*.json` | Login throttling (at most 5000 keys) and form rate limits |
| `sessions/` | PHP session files (dedicated folder) |
| `install-key.txt`, `.install.lock` | Setup key and lock of `install.php` (the key file is deleted after installing) |
| `quarantine/` | SVGs moved out of `uploads/` by the one-time recheck after updating to 0.14.1 (`cc_meta` key `svg_recheck_v1`) |

Outside the data dir, package images are copied to `canvascore-blocks/<id>/` in the site root (a reserved address), and in the site root, a publish also writes `search-index.json` (the Site Search index,
public by design), and uploads get their optimized copies in `uploads/_cc/`.

### Tables

- **`pages`**: `id, parent_id, title, slug, clean_slug, seo_title, seo_description, seo_image, layout`
  (`boxed`/full), `bg_color, boxed_width, content_json, status, is_draft_copy, is_home, noindex, content_schema, author, updated_at`.
  `noindex = 1` (migration 7) adds `<meta name="robots" content="noindex">` and leaves the page out of the
  sitemap and the search index; `save_page` only touches it when the client sends the key.
- **`collections`** (`id, name, slug`, plus `fields` = the custom field definitions as JSON, `schema_json` = the
  structured-data type and field map, and `design_json` = the blocks every item page is built from) and
  **`collection_items`** (`id, collection_id, title, slug, excerpt, cover_image, date, content_json, status` draft/published,
  `archived, seo_*, content_schema, updated_at`, and `field_values` = the item's values keyed by field id).
  Items publish to `/<collection-slug>/<item-slug>/`. The `COLLECTION_LIST` and `RELATED` blocks list them at build time
  (from a per-build cache, `cc_collections_data()`). With a design, `content_json` is not used for the page layout: it is
  kept as it is.
- **`collection_taxonomies`** (`id, collection_id, name, slug, multiple, position`) and **`collection_terms`**
  (`id, taxonomy_id, collection_id, name, slug, description, position`): the categories and tags of a collection
  (migration 12). An item's terms are `collection_items.terms_json` (`{taxonomy id: [term ids]}`); term ids are unique across
  the site, and the cleaners drop any id that is not a term of the item's own collection.
- **`collections.archive_json`** (migration 13): `{ perPage, years, filters, sorts }` for the listing and archive pages.
- **`pages.publish_at` / `unpublish_at`** and the same two columns on `collection_items` (migration 14): `"YYYY-MM-DD HH:MM"`
  in the server's local time, `''` when not scheduled. The scheduler (`cc_run_schedules()`) clears a time once it has made the change.
- **`master_components`** (`id, name, content_json`): one block (a subtree) reused by reference.
- **`templates`** (`id, name, content_json`): one block saved as a reusable **copy**.
- **`site_parts`** (`name` = `header`/`footer`, `content_json` = block array): global header/footer.
- **`page_revisions`** (migration 6: `id, owner, title, content_json, kind` draft/published, `author, created_at`,
  index on `(owner, id)`): version history. `owner` is the **live** page id (a draft copy's saves are recorded
  under its parent) or `item:<id>` for a collection item. See `cc_add_revision()`.
- **`redirects`** (migration 7: `from_path` primary key, `to_path, auto, created_at`): old addresses that
  forward elsewhere. Paths are site paths with slashes (`/old-page/`, `/blog/old-post/`); `to_path` may also be a
  full `http(s)://` address. `auto = 1` for redirects made by a rename, `0` for ones added in Global Options.
- **Roles and review** (migration 15): `pages` and `collection_items` carry `created_by`, `review_state` (`''`, `pending`, `changes`),
  `review_note`, `review_by` (who submitted), `review_at` and `reviewed_by` (who last approved or sent back); `collections.access_json` is
  `{ mode: all | selected, users: [names] }`. The review state of a published page being changed is on its **draft copy**.
- **`admin`** (users: `id, username, password_hash, role` admin/editor/reviewer/author, `must_change_pw`, `session_gen`; migration 8
  adds a unique `NOCASE` index on `username` and `session_gen`, bumped by a password change or reset to end the
  account's other sessions), **`form_submissions`** (at most `CC_FORM_MAX_ROWS` = 20000 are stored),
  **`cc_meta`** (key/value: the applied `db_schema`, `installed_at`, `dummy_hash` for timing-safe sign-in,
  `svg_recheck_v1`).

### Page states

| `status` | Meaning |
| --- | --- |
| `draft` | Never published; edited in place |
| `published` | Live; the row is the live version |
| `modified` | Live, with a **hidden draft copy** holding unpublished changes |

Saving a draft of a published page (`save_page` without `publish`) creates a row `draft-<uniqid>` with
`is_draft_copy = 1`, `parent_id = <live id>`, and sets the live row to `modified`; the response's `new_id`
is the copy, which the editor switches to. Further draft saves update the copy. Publishing the copy writes
its content onto the parent (status `published`), deletes the copy and returns the parent id.
`discard_draft` only acts on a live page (`published`/`modified`, not a copy): it deletes its copies and resets a
`modified` parent to `published`; anything else is left alone, so it can never publish a page. `get_pages` returns only non-copy
rows, with the latest copy attached as `draft_copy` for `modified` pages.

`is_home` is exclusive (`apply_home()` in `api.php`) and only touched when the client sends the key.
Slugs are unique site-wide among live pages and collections (`cc_slug_owner()`), enforced on publish; drafts may
share a slug. `cc_reserved_slugs()` (`canvascore-admin` and the admin folder's real name, `uploads`,
`canvascore-data`, `data`) are refused by `save_page` even for drafts, and by collections and redirects;
`rebuild_all.php`, `cc_unpublish_files()` and the manifest cleanup never write into or delete from them.

**Slug changes.** Publishing a page under a new slug calls `relink_slug_change()` (`api.php`), which:

- drops any redirect **from** the new address (`cc_drop_redirect_from()`: a live page must not be hidden by it);
- adds a redirect from the old address to the new one (`cc_add_redirect()`, `/` when the page became the home);
- re-links content: it decodes the JSON of every row of `pages`, `collection_items`, `site_parts` and
  `master_components`, plus `menu.json`, and runs `cc_relink_node()` on the decoded data (so escaped slashes in
  the stored JSON don't matter), writing back only the rows that changed.

A published collection item whose slug changes gets the same redirect treatment in `save_item`
(`/<collection>/<old>/` → `/<collection>/<new>/`). Renaming a collection's slug (`save_collection` with a new `slug`,
in a transaction) adds `/<old-col>/<item>/` → `/<new-col>/<item>/` for each of its published items, and moving a
published item to another collection (`bulk_items` `move`) adds its own redirect (after dropping any redirect from
the destination address). The files move at the next publish; the stale ones are removed by the manifest cleanup.

### Revisions

Every save (`save_page` draft or publish, `save_item`) calls `cc_add_revision($pdo, $owner, $title,
$content_json, $kind)`. It skips the insert when content and title equal the newest revision, keeps the newest
`CC_REVISIONS_KEEP` (40) per owner, and swallows exceptions (history must never block a save). The editor reads
them with `get_revisions` / `get_revision` and restores one with the store's `replaceBlocks()` as an unsaved,
undoable change.

### Block JSON

`content_json` of a page, item or part is an **array** of blocks; masters and templates store **one** block.

```json
{
  "id": "block-lx3k9a-1f4ab2",
  "type": "SECTION",
  "content": { "customId": "", "customClass": "", "customCss": "__THIS__ { … }",
               "hoverEffect": "lift", "animDuration": "slow", "animDelay": "300" },
  "styles":  { "padding": "80px 20px", "backgroundColor": "#ffffff", "width": "100%", "animation": "fade-up" },
  "children": [ { "id": "…", "type": "TEXT", "content": { "text": "<p>Hi</p>" }, "styles": {} } ]
}
```

- `styles` are camelCase CSS properties rendered inline; `styles.animation` holds the entrance effect and
  is never emitted as CSS.
- `children` exists only on containers (`SECTION`, `CONTAINER`, `FLEX_ROW`, `CSS_GRID`).
- A master reference is `{ id, type: "MASTER", content: { masterId, name }, styles: {} }`; the compiler
  resolves it from `master_components` (cycles are skipped).
- `content` fields per type: see `blocks.json` and the [Block Reference](BLOCK-REFERENCE.md).

### Migrations

`api.php` runs `cc_migrate($pdo)` and `cc_migrate_content($pdo)` on every request (`migrations.php`).

**DB schema** (currently 15; 6 = `page_revisions`, 7 = `redirects` + `pages.noindex`, 8 = security: `admin.session_gen`,
unique user names, old default account removed, pre-wizard sites marked installed, stored content sanitized, 9 = custom
fields (`collections.fields`, `collection_items.field_values`), 10 = structured data (`collections.schema_json`), 11 = the
collection design (`collections.design_json`), 12 = categories and tags (`collection_taxonomies`, `collection_terms`,
`collection_items.terms_json`), 13 = listing and archives (`collections.archive_json`), 14 = scheduled publishing
(`publish_at` / `unpublish_at` on pages and items), 15 = roles and review (`created_by` and the review columns on pages and
items, `collections.access_json`)): add a numbered closure
to `cc_db_migrations()`, then bump `db_schema` in `version.json` and note it in the CHANGELOG. Each migration
runs once, in order, in a transaction, and the number is recorded in `cc_meta`.

```php
9 => function ($pdo) {
    cc_add_col($pdo, 'pages', 'canonical_url', "TEXT DEFAULT ''");   // idempotent, no exception
},
```

Use `cc_add_col()`; SQLite rejects non-constant defaults in `ALTER` (add the column without a default and
backfill with `UPDATE`).

**Content schema** (currently 1, no migrations yet): add `N => function ($blocks) { …; return $blocks; }`
to `cc_content_migrations()` and bump `content_schema`. Note: `cc_migrate_content()` only walks the `pages`
table today; a real format change must also migrate `collection_items`, `site_parts`, `master_components`
and `templates`, and `starters.json`.

## 5. Rendering

### The contract

`renderBlock(block, opts)` in `src/render/renderBlock.mjs` and `render_block($block)` in `compiler.php`
must return the same structure, classes and inline styles for every block. The canvas
(`SortableBlock.jsx`) injects `renderBlock()` output for unselected blocks, so what you see is the site.

Differences that are allowed (and ignored by the parity test):

- **Rich text** is passed through raw in JS (the canvas then runs the whole block HTML through `safeHtml()`);
  PHP runs it through `cc_sanitize_html()`.
- `<script>` nodes (slider arrows/autoplay, lightbox, counters, site search…) are emitted **only by the PHP
  compiler**; the JS renderer leaves them out (they wouldn't run on the canvas anyway) and the parity test
  drops every `<script>` before comparing.
- `<style>` behaviour nodes (responsive rules) are each renderer's own, except for the blocks in
  `STRICT_STYLE` in `tests/parity.mjs`, whose `<style>` text carries logic and is compared.
- `MASTER` and `COLLECTION_LIST` render a placeholder comment in JS; the editor draws them itself.
- Links to internal pages become `{{BASE_URL}}…`; the compiler substitutes the base path, the canvas `#`.

### Shared block definitions (`canvascore-admin/blocks/`)

Since 0.21.0 a block can be described **once**, in `canvascore-admin/blocks/<name>.json`, instead of as a
`renderBlock.mjs` case, a `compiler.php` case and a hand-written panel. 46 blocks are definitions; the rest
(containers, Master, Collection List, the item blocks, the form blocks, Announcement Bar, Price Calculator) are
still code because they need the database, the form registry or the children of the block. Two small engines read
the same files:

| Engine | Where | Used by |
| --- | --- | --- |
| `src/render/blockDef.mjs` | imports every file (the `// <defs:begin>` region; `tests/parity.mjs` checks it against the folder) | the canvas and `renderBlock()` |
| `canvascore-admin/blockdef.php` | `cc_block_defs()` loads `blocks/*.json` | `render_block()` through `cc_render_def_block()` |

Both run first in the renderers (`renderBlock.mjs` and `cc_render_block_body()`): a block type with a definition never
reaches the old `switch`. `customCss`, device rules and the block's id are added around the definition's HTML as for any block.

**How a block is rendered.** (1) Every value of the block is **rebuilt from its setting**: the raw content is never
given to the template, so a value of the wrong type (a list where a text belongs, an object, a hostile string) becomes the
setting's default instead of breaking the page. (2) The template is filled with the clean values.

A definition file:

```json
{
  "type": "CALLOUT",
  "settings": { "title": { "type": "text", "default": "", "label": "Title (optional)" }, "...": {} },
  "template": ["<div id=\"{{_id}}\" class=\"cc-callout{{_classes}}\" ...>", "{{title}}", "</div>\n"],
  "panel": [{ "title": "Callout", "icon": "Info", "open": true, "keys": ["title"] }],
  "rootStyleOmit": ["textAlign"], "script": "progress", "renderIf": "embed"
}
```

`template` is a string or a list of strings joined together. `rootStyleOmit` leaves styles out of `{{{_style}}}` (the
block places them itself), `script` names a behaviour script and `renderIf` names a setting that must be true or the
block renders nothing.

**Setting types** (`cleanValue()` / `cc_tpl_clean_value()`):

| Type | Value |
| --- | --- |
| `text` | A string, cast as PHP does (arrays and objects give `''`). Options: `default`, `trim`, `fallbackWhenEmpty`, `fallbackWhenBlank`, `pattern` (the whole value must match, else the default), `maxLength`, `stringsOnly` |
| `richtext` | HTML, **trusted**: PHP sanitizes it (`cc_sanitize_html()`); the canvas runs the block through `safeHtml()`. A rich text setting must also be in `CC_RICH_FIELDS` (`config.php`) so it is cleaned when saved: a test checks it |
| `code` | HTML printed as is, **not** sanitized: only for code that just admins can change (Custom HTML) |
| `number` | `min`, `max`, `default`; `int`, `round` (decimals) or `parse: "int"` (the leading whole number of a text, like `cc_int()`) |
| `bool` | Default `true`: anything but `false` is true. Default `false`: true when PHP finds the value non-empty. `strict` (only `true`), `phpTruthy` |
| `enum` | One of `options` (`[{ value, label?, data? }]`), else the default. The chosen option's `data` (written in the definition, so trusted) is `opt.<setting>.<name>` |
| `color` | A CSS colour (`cc_color()`), else the default |
| `image` | An image address (`cc_img_url()`): other schemes give `''` |
| `list` | `item` (settings of each item), or `of` (a list of plain values: `skipEmpty`, `unique`, `max`). Options: `max`, `count: { as, min, max }` (adds the item count), `skipNonObjects`, `keepIf`, `share`, `defaultsByIndex`, `presentAs` |
| `object` | `item`: settings of one object |
| `choices` | The `options` picked (a list of texts), as a list in the options' order |
| `calc`, `flag` | Computed from the other clean values: `calc` (`of`, `fallback`, `div`, `mul`, `add`, `min`, `max`), `flag` (`when` conditions, `any`) |

Common to all: `key` (the content key, when not the setting's name), `from: "styles"` (read a style of the block),
and `transform` (one transform or a list, applied after every value is clean).

**Template language** (logic-light, Mustache-like, escaping built in; the two parsers refuse the same templates):

- `{{name}}` prints the value **escaped** (as `htmlspecialchars`). `{{{name}}}` prints it raw **only** when the value is
  trusted HTML (rich text, option data, the engine's own values); anything else is still escaped.
- `{{#name}}…{{/name}}`: once per item of a list, once for an object, once when a value is true. `{{^name}}…{{/name}}`:
  when false or empty. `{{#name?}}` / `{{^name?}}`: true or false **without** entering a list. `{{#name=text}}` /
  `{{^name=text}}`: the value is, or is not, that text (`{{^title=}}` = "not empty"). `{{! comment }}`.
- Names can be dotted (`opt.variant.bg`, `t.rows`). Inside a list: the item's values, then `@index`, `@number`, `@first`,
  `@last`, and `{{.}}` for a list of plain values.
- Built in: `_id`, `_classes` (effects and custom class, starting with a space), `_style` (the block's inline style),
  `_field.<setting>` (the in-place editing attributes, editor only, for a setting with `inline`), `_script`, `_lb` and
  `_rb` (`{` and `}`: a literal `{` right before a tag is refused, write `{{{_lb}}}`), `_base` (the `{{BASE_URL}}`
  placeholder) and `_editing` (true on the canvas while in-place editing is on).

**Transforms** (twins in `TRANSFORMS` of `blockDef.mjs` and `CC_TPL_TRANSFORMS` of `blockdef.php`; the first group are
links and addresses, the second text, the third numbers and data): `blockUrl`, `legacyUrl`, `extUrl`, `contactUrl`,
`mailto`, `cssUrl`, `urlencode`, `mapsUrl`, `mediaSrc`, `mediaMime`, `videoEmbed`, `stripScheme`, `telDigits` · `lines2br`,
`br`, `initials`, `replace`, `code`, `lineNumbers`, `json` · `fmtNum`, `plain`, `repeat`, `tableData`, `buttonPreset`,
`buttonHover`. To add one, write it in both files (same result for every input, hostile ones included) and add a case to
the template checks in `tests/parity.mjs`.

**Behaviour scripts** stay on the site (the canvas runs its own copies, section 8.2, step 9): the definition's
`script` names an entry of `CC_TPL_SCRIPTS` in `blockdef.php`, a function that receives the block's id and clean values and
returns the whole `<script>` element (the Business block also builds its JSON-LD there). The engine puts the result in
`{{{_script}}}`, and the JS engine leaves it empty, as the parity test expects.

**The Content panel** comes from the same file: `panel` lists the sections (`title`, `icon`, `open`, `keys`, `hint` as text
or a list, `hintIf`, `showIf`, `widget`), and each setting carries its `label`, `placeholder`, `control` (`textarea`, `code`,
`select` with `choices` or `choicesFrom`, `range`, `editor`, `link`, `datetime`, `file`, `lines`, `widget:<name>`), `hint`,
`half`, `showIf`, `subhead`, `labelWhen` and, for lists, `itemTitle`, `itemKeys`, `newItem`, `addLabel`, `addFromMedia`. The
full list is the comment at the top of `src/components/panel/SchemaPanel.jsx`. Controls that are more than a field are
**widgets** in `widgets.jsx`, registered in `widgetRegistry.js` and named by the definition. `src/components/panel/blocks/index.js`
adds a generated panel to `CONTENT_PANELS` for every definition that has no hand-written one.

**Checks.** `tests/parity.mjs` renders every fixture of every definition in both engines and requires identical HTML,
checks that each file in `blocks/` is imported in `blockDef.mjs`, and runs the template language, the setting cleaning and
the transforms on test definitions in both engines. `tests/server.php` checks that every definition loads and that every
rich text setting is in `CC_RICH_FIELDS`; `tests/panels-ui.mjs` that every panel is generated from existing settings and
widgets. When moving a block from code to a definition, take its output on a set of real and hostile fixtures **before** and
**after**: published HTML must stay identical for real content (what changes should only be wrong-typed or hostile values).

### `opts.fields` and in-place editing

`renderBlock(block, { fields: true })` adds `data-cc-field="<name>" contenteditable="true"
data-cc-placeholder="…"` to the elements that hold rich text, via the local `field(name, placeholder)`
helper. `SortableBlock.jsx` uses it for selected blocks listed in `TEXT_FIELDS`
(`TEXT.text`, `HERO.title/subtitle`, `IMAGE_TEXT.text`, `FORM.title`) and hands the HTML to
`InlineRegions` (`src/editor/RichText.jsx`), which commits each field on blur.

### Containers: `blockRoot`

The container types are listed once, in `CONTAINER_TYPES` (`src/editor/blockCatalog.js`:
`SECTION`, `CONTAINER`, `FLEX_ROW`, `CSS_GRID`); the store, `SortableBlock.jsx` (`CONTAINERS = CONTAINER_TYPES`),
`LayerNavigator`, `VisualEditor`, `PropertyPanel` and `Templates` all import it instead of keeping their own lists.
`blockRoot(block)` returns `{ tag, id, className, style }` for the four container types (and `null`
otherwise). The JS renderer uses it to build the container HTML; the canvas uses it to create the real
React element and render the children as sortable React nodes inside it. `CSS_GRID` adds
`display:grid`, `grid-template-columns: repeat(columns, 1fr)` and `gap`. The editor frame takes the
"sizing" properties (`width`, `margin`, `flex*`, `grid*`, `order`…, see `SIZING_KEYS`) so flex/grid
parents behave like on the site.

### Shared helpers (keep both sides identical)

| JS (`renderBlock.mjs`) | PHP (`compiler.php`) | Rule |
| --- | --- | --- |
| `buildInlineStyle(styles)` | `build_inline_style($styles)` | camelCase → kebab-case; skips `''`, `null`, `animation`, keys not matching `/^[a-zA-Z][a-zA-Z0-9-]*$/`, object/array values, and values containing `; { } < > \`, `expression(`, `javascript:` or `vbscript:`; values HTML-escaped |
| `ccImgUrl(u)` / `ccCssUrl(u)` | `cc_img_url($u)` / `cc_css_url($u)` | image address: `http(s)`, a path or a `data:image/(png\|jpeg\|gif\|webp\|avif);` URL, any other scheme → `''`; the CSS variant also percent-encodes quotes, parentheses, backslashes and `< >` (Hero background, Gallery images) |
| `ccInt(v, def, min, max)` | `cc_int($v, $def, $min, $max)` | leading integer like `parseInt` (`"7px"` → 7), clamped, default otherwise |
| `escapeHtml(s)` | `htmlspecialchars()` | every attribute and plain-text value |
| `ccColor`, `ccNum`, `ccFmtNum`, `ccExtUrl`, `ccLines`, `ccBr`, `ccInitials`, `ccEnc` | `cc_color`, `cc_num`, `cc_fmt_num`, `cc_ext_url`, `cc_lines`, `cc_br`, `cc_initials`, `cc_enc` | twins for the content blocks |
| `resolveBlockUrl` | `cc_block_url` | internal URL → `{{BASE_URL}}…`, `mailto:`/`tel:` intact |
| `normalizePalette`, `paletteVars`, `colorRef`, `resolveColor` (`src/editor/palette.js`) | `cc_palette`, `cc_palette_css`, `cc_is_color_ref` (`config.php`) | global colours: the five built-in ones first, then the custom ones; hex only; a colour field may store `var(--cc-color-<id>, <hex>)` |
| `normalizeTypography`, `typeCanvasCss`, `withTextPreset` (`src/render/typography.mjs`) | `cc_typography`, `cc_type_css`, `cc_with_text_preset` (`config.php`) | text styles: known presets, fonts, sizes, weights and line heights only; a block's `textPreset` becomes `var(--cc-type-…)` values |
| `normalizeKit`, `kitCss`, `buttonPresetCss`, `cleanKitValue` (`src/render/kit.mjs`) | `cc_kit`, `cc_kit_css`, `cc_button_preset_css`, `cc_kit_clean` (`config.php`) | button presets and the field style: colours (hex, `transparent` or a colour reference) and corner radii only |

### Presets and global variables

Global colours, text styles and button and field styles are CSS custom properties, so a change in Global Options
reaches every block without republishing them one by one:

| Variable | Set by | Used by |
| --- | --- | --- |
| `--cc-color-<id>` (and `--brand-color`, the Primary colour) | `cc_palette_css()` in `master.html` `{{COLOR_VARS}}` | any colour field that stores `var(--cc-color-<id>, <hex>)` |
| `--cc-type-<preset>-font` / `-size` / `-weight` / `-line` | `cc_type_css()` in `{{TYPE_CSS}}`; the desktop values on `:root`, tablet and phone in `@media` | the site's `h1`–`h6`, `body`, `small`, `.cc-btn` rules; a block's text style (`cc_with_text_preset()`) |
| `--cc-btn-<preset>-bg` / `-text` / `-border` / `-radius` | `cc_kit_css()` on `:root` | `cc_button_preset_css()`: a button that picks a preset |
| `--cc-field-bg` / `-border` / `-radius` | `cc_kit_css()` on `:root` | the input fields of forms, wizards, newsletter and site search, each with its built-in value as the fallback |

In the editor the same variables are written on `.cc-canvas` (`typeCanvasCss()` for the device being edited, and
`kitCss()`), so the canvas shows what the site shows without the editor's own interface being restyled.

Rules that keep this safe and in step:

- A value that is not set emits nothing: the built-in look stays. Every fallback in a `var()` is the built-in look.
- Colour and length values are validated on the server (`cc_kit_clean()`, `cc_type_clean()`) and in the editor
  (`cleanKitValue()`, `cleanTypeValue()`); a value that is not a colour, a length or a known font is dropped at save time.
- A text style or a button preset is stored as a name (`textPreset`, `preset`), never as CSS. The renderers turn it into
  variables in both `renderBlock.mjs` and `compiler.php`, and `tests/parity.mjs` checks the two agree.
- Fonts used by a text style are added to the Google Fonts link on every page (`rebuild_all.php`, `$families`).

Escaping rules:

- Every value interpolated into an attribute or text node is escaped. Ids are reduced to `[A-Za-z0-9_-]`.
- Enumerated values (form field types, effects, layouts) are checked against an allowlist; numbers go
  through `ccInt`/`cc_int` or `ccNum`/`cc_num`; colors through `ccColor`/`cc_color`.
- `customCss` replaces `__THIS__` with `#<id>` and strips `</style` / `</script`.
- Rich text is made safe on the server: `cc_sanitize_html()` (`config.php`) is a DOM allowlist of
  tags and attributes, strips event handlers and `javascript:`/`vbscript:` URLs (including ones hidden by
  control characters), limits inline styles to `CC_STYLE_PROPS` (`cc_sanitize_style()`: no positioning, `url()`,
  escapes or expressions), keeps `target` only as `_blank`/`_self` (adding `rel="noopener noreferrer"` to
  `_blank`) and `id` only as a plain name. Without `ext-dom` it keeps only basic formatting tags with **no**
  attributes (the installer requires `dom`). It runs at publish time in `compiler.php` **and at save time**:
  `cc_sanitize_blocks()` cleans the fields listed in `CC_RICH_FIELDS` (and blanks active URLs anywhere in
  `content` via `cc_scrub_urls()`, except `code`/`customCss`/`customJs`) in `save_page`, `save_item`, `save_part`,
  `save_master`, `save_template`, and `cc_sanitize_all_content()` runs after a restore or import and in migration 8.
  A new rich-text field must be wrapped in `cc_sanitize_html()` in `compiler.php` **and** added to
  `CC_RICH_FIELDS`.
- In the editor, every HTML string inserted into the DOM goes through `safeHtml()` (`src/utils/safeHtml.js`,
  DOMPurify), and the built editor's CSP allows no inline script: never use `dangerouslySetInnerHTML` /
  `innerHTML` without it.
- Non-admins don't receive a `FORM`'s `email`: the read actions that return `content_json` (`get_pages`,
  `get_item`, `get_parts`, `get_masters`, `get_templates`, `get_revision`) pass it through `cc_redact_content_json()`
  for them. A new read action returning content must do the same.
- Non-admins can't add or change "code surfaces" (`HTML.code`, `customCss`/`customJs`, a `FORM`'s `email`), but
  they no longer wipe an admin's code either: `cc_keep_code_surfaces($blocks, $previous)` restores those fields
  from the stored version, matched by block id, in `save_page`, `save_item`, `save_part`, `save_master` and
  `save_template`; new blocks from an editor get empty code. (`cc_strip_code_surfaces()` still exists in
  `config.php` but no save uses it any more.)

### Dynamic values

A text or a value of any block may hold a **dynamic value** (the syntax is in the User Guide): `{{field:KEY}}`,
`{{field:KEY.part}}` and `{{item:title|excerpt|date|url}}`. The values are bound once per block, before it is rendered:

- **On the site**: `cc_render_block_body()` calls `cc_bind_deep($content, cc_item_context())` at its start. The item
  context (set by `rebuild_all.php` around each item's blocks: `defs`, `values`, `items`, `page`, `item`, `collection_id`)
  supplies the values. Without a context (any other page) the tokens are removed, so a placeholder never reaches a visitor.
- **In the editor**: `SortableBlock` shows `bindBlock(rawBlock, contextFor(activePage))` (`src/render/itemBinding.mjs`):
  an item shows its values, a design shows the field names in brackets, and a page shows nothing. `renderBlock.mjs`
  receives content that is already bound and never binds itself, so its output is the same as the site's.
- **Edits always use the raw block** (`rawBlock`): a bound value is never saved back into the content.
- `cc_bind_token()` and `tokenValue()` are the twins (same escaping as `htmlspecialchars()`, same date and number
  format). The tests check both with the same literal (`tests/server.php` and `tests/ui-shell.mjs`, "DYNAMIC VALUES").

### Effects

`effectClasses(styles, content)` (`src/render/effects.mjs`) ≡ `cc_effect_classes()` builds
` cc-reveal <animation> cc-dur-* cc-delay-* cc-hover-* cc-loop-*` from `styles.animation`,
`content.animDuration`, `animDelay`, `hoverEffect`, `loopEffect`. `buttonHover({bg,color,border,effect})` ≡
`cc_button_hover()` returns the classes (`cc-hbg`, `cc-hcol`, `cc-hbd`, `cc-bfx-*`) and CSS variables
(`--cc-hover-bg`…). Unknown values are dropped. The allowlists exist twice (the arrays in `effects.mjs`,
the `CC_FX_*` constants in `compiler.php`): change both.

The CSS lives in `canvascore-admin/effects.css`:

- published pages: `rebuild_all.php` replaces `{{EFFECTS_CSS}}` in `master.html` with the file; a small
  script in `master.html` adds `is-visible` via `IntersectionObserver`;
- canvas: `vite.config.js` injects it as `__EFFECTS_CSS__`; `Canvas.jsx` adds overrides so entrance and loop
  effects stay still while editing and play only on "Preview animation" (`previewEffects.js`).

## 6. Publishing pipeline (`publish.php`, `rebuild_all.php`, `cron.php`)

`cc_publish_site($pdo, $data_dir, $base_dir)` in `publish.php` is the whole publish. The **Publish Site** button reaches it
through `rebuild_all.php` (after the login and CSRF checks); the scheduler reaches it through `cc_run_schedules()` in the same
file, called by `api.php` on an admin request when a change is due (`cc_schedules_pending()`), and by `cron.php` from the
command line. A scheduled run has no request, so each HTTP publish remembers the site's base path in `cc_meta.site_base_dir`.

The collection pages are written after the items, with one page shell (`$render_page`) and one paginated writer (`$archive`):
the listing, the sorts, the years and months, the filters of the choice fields, and the taxonomy and term pages. An archive
address that an item already uses is skipped with a warning. The search index (`search-index.json`) carries each entry's
facets: `f` (the collection, and `tax:<id>` with the terms) and `fl` (their labels).


A POST to `rebuild_all.php` (login + CSRF, an account that still exists and has no pending forced password change
via `cc_session_account()`, session released right away) rebuilds the whole site in one pass:

1. **Setup**: settings, menu HTML, header/footer parts, safe brand color/font/suffix, `$media_meta =
   cc_media_meta_all()`, and `$cookie_html = cc_cookie_banner_html($settings['cookieBanner'])`.
2. **`$write($path, $content)`**: every output file goes through this closure. It refuses (as a failure) any path
   outside the site folder, with `..`, not matching plain `[A-Za-z0-9._-]` segments ending in `.html`, `.xml`,
   `.json` or `.txt`, or inside a reserved folder; otherwise it creates folders, records a failure in `$failed`,
   and adds the path (relative to the site root) to `$written`. Use it for any new output file, so the file is
   reported when it can't be written and lands in the manifest.
3. **Feeds** (only when `siteUrl` is set: feeds need absolute links): `$feeds` holds every collection with
   published, non-archived items; `$feed_links` is the `<link rel="alternate" type="application/rss+xml">` list
   added to every page's head.
4. **`$finish($html, $canonical, $noindex)`**: the finishing touches shared by pages, items and the 404: a
   `<link rel="canonical">` (when the absolute address is known), `<meta name="robots" content="noindex">`,
   the feed links before `</head>`, the cookie banner before `</body>` (`{{BASE_URL}}` substituted), then
   `cc_optimize_images()` (`srcset` of the WebP copies, lazy loading, `fetchpriority="high"` on the first image).
5. **Pages** (`published`/`modified`, live rows only; a reserved slug is skipped with a warning, and `bg_color` /
   `boxed_width` go through `cc_css_color()` / `cc_css_length()`): rendered into `master.html`, written to `/<slug>/index.html`
   and/or the root `index.html` (home routing). Pages without `noindex` go into the sitemap and the search
   index (`{ t, u, d, x }`: title, URL, description or first 160 characters, first 3000 characters of plain text).
6. **Collection items** (published) at `/<collection>/<item>/index.html`; non-archived ones go into the search
   index and their collection's feed.
7. **RSS**: `/<collection>/feed.xml` per feed, newest 50 items by `date` (or `updated_at`).
8. **Search index**: `search-index.json` at the site root, read by the Site Search block's script.
9. **Redirects**: each row is validated again with `cc_redirect_path()` / `cc_redirect_target()` (invalid ones
   are skipped with a warning); if a page was written at `from_path` in this build the row is
   deleted (the page wins); otherwise a small page from `cc_redirect_page_html()` is written at the old address
   (works on any host) and a rule is collected for Apache.
10. `forms.json` (`{ to, labels, success, type, meta }` per form, from `cc_form_registry()`), `sitemap.xml`, `robots.txt`,
    `404.html` (finished with `noindex`).
11. **`.htaccess`** at the site root: `cc_htaccess_with_redirects()` replaces the marked
    `# BEGIN/END CanvasCore redirects` block with `Redirect 301` lines and leaves everything else (e.g. the
    `ErrorDocument 404` line) as it is; the file is only rewritten when it changed.
12. **Manifest cleanup**: when nothing failed, files listed in the previous `published_files.json` but not
    written now are deleted, only if they match `…/index.html` or `…/feed.xml` (never the root `index.html`),
    and their emptied folders removed (never inside a reserved folder). Then the manifest is replaced with
    `$written`.

The response is `{ success:false }` with the first unwritten file when anything failed, otherwise "Build
successful: N pages published", plus removed pages and non-fatal `$warnings` (feeds, collections, redirects,
reserved addresses). An exception is logged (`CanvasCore publish: …`) and answered with a generic message.

## 7. Server helpers

### `config.php`

| Function | What it does |
| --- | --- |
| `cc_keep_code_surfaces(&$blocks, $previous)` | Editors' saves: restores `HTML.code`, `customCss`/`customJs` and `FORM.email` from the stored blocks (array or JSON), matched by id; new blocks get none. Replaces `cc_strip_code_surfaces()` for page/item/part/master (and template) saves |
| `cc_relink_node(&$node, $oldUrl, $newUrl, $oldBase, $newBase)` | Walks decoded JSON: link fields (`url`, `btnUrl`, `buttonUrl`, `href`, `link`) equal to `old/index.html` become `new/index.html`; `{{BASE_URL}}old/` inside any string becomes `{{BASE_URL}}new/`. Returns whether anything changed. Used by `relink_slug_change()` in `api.php` for all content tables and the menu |
| `cc_add_revision($pdo, $owner, $title, $content_json, $kind)` | Records a version (see [Revisions](#revisions)) |
| `cc_client_ip($trustedOverride = null)` | The visitor's address. If `REMOTE_ADDR` is in `cc_trusted_proxies()` (Global Options › Security), returns the nearest untrusted valid IP from `X-Forwarded-For`; otherwise `REMOTE_ADDR`, so the header can't be faked. The argument sets the proxy list (tests) |
| `cc_is_https()` | `HTTPS` from the server; `X-Forwarded-Proto` / `X-Forwarded-SSL` only when `REMOTE_ADDR` is a trusted proxy |
| `cc_security_headers()` | Anti-framing, `nosniff`, `Referrer-Policy`, COOP headers for every PHP response of the admin; `$GLOBALS['CC_HT_ADMIN']` is the matching `canvascore-admin/.htaccess` (headers for the static editor page, `menu-preview.html` exception, deny rules for library files and JSON), written by `ensure_admin_htaccess()` from `api.php` and `install.php` (left alone once an admin replaces it with a file of their own) |
| `cc_session_start()` / `cc_boot_session()` / `cc_session_login($user)` / `cc_session_logout()` | Session `CCSESSID` (strict mode, no trans-sid). `cc_boot_session()` resumes a session only when the cookie is present (visitors never get one) and enforces the inactivity limit and the 7-day absolute limit (`started`); `cc_session_login()` regenerates the id and stores `user_id`, `username`, `role`, `gen`, `csrf` |
| `cc_session_account($pdo)` | The signed-in account row, re-read on every request: logs the session out when the account is gone, renamed, or its `session_gen` changed; refreshes `role` from the database |
| `cc_issue_csrf()` / `cc_verify_csrf_or_die()` / `cc_same_origin_request()` | Per-session token in `X-CSRF-Token` (no cookie copy; an old `cc_csrf` cookie is deleted) plus an `Origin` / `Sec-Fetch-Site` check; 403 otherwise |
| `cc_redirect_path($p)` / `cc_redirect_target($t)` | Normalize and validate: a path becomes lowercase `/a/b/` (the home `/`, `..` and reserved folders can't be a source); a target may also be `/` or a full `http(s)://` address without spaces, `"`, `< >`, backslashes or control characters. `null` when invalid |
| `cc_reserved_slugs()` / `cc_slug_reserved($slug)` | CanvasCore's own top-level folders (admin folder name, `canvascore-admin`, `uploads`, `canvascore-data`, `data`) |
| `cc_css_color($v, $default)` / `cc_css_length($v, $default)` | A hex/`rgb(a)()`/named color, or a number with `px`, `%`, `rem`, `em`, `vw`; anything else → default (page `bg_color`, `boxed_width`) |
| `cc_sanitize_blocks(&$blocks)` / `cc_sanitize_content_json($json)` / `cc_sanitize_all_content($pdo)` | Save-time cleaning of a block list or single block (rich-text fields of `CC_RICH_FIELDS`, `cc_scrub_urls()` for active URLs, children recursively); the last one rewrites every stored content table |
| `cc_redact_blocks(&$blocks)` / `cc_redact_content_json($json)` | Blank `FORM.content.email` in what editors receive |
| `cc_add_redirect($pdo, $from, $to, $auto = 1)` | Upserts a redirect, **collapsing chains** (rows pointing to `$from` now point to `$to`) and **avoiding loops** (any redirect from `$to` is deleted: something lives there now; self-redirects removed) |
| `cc_drop_redirect_from($pdo, $path)` | Deletes the redirect from an address a published page now owns |
| `cc_redirect_page_html($href)` | The static page written at an old address: `noindex`, canonical, meta refresh and a `location.replace()` that keeps query and hash |
| `cc_htaccess_with_redirects($existing, $rules)` | Returns `.htaccess` content with the marked redirects block replaced (or removed when there are no rules) |
| `cc_rate_allow($bucket, $key, $max, $window)` | Sliding-window rate limit in `rate_<bucket>.json` (file lock); `submit_form.php` uses `('forms', cc_client_ip(), 8, 600)` |
| `cc_login_begin($username)` / `cc_login_result($username, $ok)` / `cc_login_wait($username)` / `cc_login_keys()` | Login throttling in `login_attempts.json` (file lock, at most `CC_LOGIN_MAX_KEYS` = 5000 entries). `cc_login_begin()` counts the attempt **before** the password check, atomically, and returns the seconds to wait: 5 per account + IP / 15 min, 20 per IP / 15 min, 100 per account / hour, each → 15 minutes wait. A success clears the account + IP key and takes one off the others. `change_own_password` uses it for the current password too |
| `cc_svg_is_safe($path)` | Allowlist check of an SVG (`CC_SVG_ELEMENTS`, editor metadata namespaces in `CC_SVG_INERT_NS`): no other namespaces (HTML, MathML), no event handlers, `xml:base`, animation attributes except on `animateTransform`, `href`/`src` only to `#id` (and raster `data:` / `http(s)` for `<image>`/`<feImage>`), CSS without `@import`, escapes or `url()` other than `url(#id)`, no processing instructions or entities; false without `ext-dom`. Also used by the one-time recheck in `api.php` that moves failing old uploads to `quarantine/` |
| `cc_unpublish_files($data_dir, $prefix, $extra = [])` | Takes generated files offline at once: deletes the `…/index.html` / `…/feed.xml` under `$prefix` (`blog/` or `blog/post/`) that are in `published_files.json` (or in `$extra`), removes the emptied folders and updates the manifest. Never touches other files. Site root from `$GLOBALS['CC_SITE_ROOT']` (tests) |
| `cc_unpublish_item($pdo, $data_dir, $item)` | A deleted published item: `cc_unpublish_files()` for its folder, unless another published item of the collection owns the same address. Used by `delete_item` and `bulk_items` `delete`; `delete_collection` unpublishes the collection folder |
| `cc_public_branding($settings)` | What `api.php?action=branding` may return before sign-in: `siteName` (max 120 characters) and `faviconUrl` (dropped unless `http(s)://`, root-relative or a plain relative path) |

### `compiler.php`

- `cc_cookie_banner_html($cfg)`: the consent banner and its script for `settings.cookieBanner` (`''` unless
  `enabled`). Text escaped, privacy link through `{{BASE_URL}}`, choice in `localStorage` (`cc_consent`).
  `<script type="text/plain" data-cc-consent>` and `<iframe data-cc-consent-src>` are activated only after Accept;
  `data-cc-consent-open` reopens the banner.
- `case 'SEARCH'` + `CC_SEARCH_SCRIPT`: the Site Search block. The markup carries `data-index` (`{{BASE_URL}}search-index.json`),
  `data-empty` and `data-limit` (`cc_int`, 1–50); the nowdoc script (with `%ID%` replaced by the block id) loads
  the index on first use and handles `?q=`.
- `CC_CODE_SCRIPT`, `CC_TOC_SCRIPT`, `CC_SHARE_SCRIPT`, `CC_CALC_SCRIPT`, `CC_WIZARD_SCRIPT`, `CC_VIDEO_SCRIPT`,
  `CC_AUDIO_SCRIPT` and `CC_ANNOUNCE_SCRIPT` are copies of the regions of `src/render/blockRuntime.mjs`, copied
  verbatim. Edit the `.mjs` file and copy the region again; `tests/blocks-content.mjs` fails when the two differ.
  A region must not contain `</script`, `<!--` or `-->`.
- `SLIDER`: with 2+ images it adds `cc-slider-prev` / `cc-slider-next` buttons; the script pauses autoplay on
  hover and doesn't autoplay under `prefers-reduced-motion`.

### Custom fields, lists, related items and structured data

Helpers for the collection features (all in `config.php` unless noted; `compiler.php` for the rendering):

| Function | What it does |
| --- | --- |
| `cc_field_defs($raw, $pdo)` | The tidy field definitions: valid ids and unique keys, the nine types (`CC_FIELD_TYPES`), choices with unique values, a reference to a collection that exists |
| `cc_field_clean($def, $value, $pdo)` / `cc_field_values($defs, $raw, $pdo, $publishing)` | One value, cleaned for its type; all the values of an item, plus the labels of the required fields left empty (only when publishing) |
| `cc_field_link($url)` / `cc_field_image($url)` | A link: web, mail, phone or a site path (never another scheme). An image: the rule of `cc_img_url()`, kept here because the API does not load `compiler.php` |
| `cc_schema_clean($raw, $defs)` | The structured data: a known type (`CC_SCHEMA_TYPES`), a field per property of the right type, an ISO currency |
| `cc_collections_data()` (compiler) | The per-build cache: collections with their `defsById` and published items with their `vals`, and an index of every item for references |
| `cc_list_cards($items, $cslug, $opts)` / `cc_list_options()` (compiler) | The cards of a Collection List or a Related block (grid or rows; card fields; the filter attribute) |
| `cc_sort_items($items, $sortBy, $desc, $defs)` (compiler) | Sort by title, date or a field; items without a value go last |
| `cc_list_filter_ui($innerId, $fieldDef)` (compiler) | The filter buttons and their script; nothing without a choice field |
| `cc_render_related($block)` (compiler) | The Related block: the items whose reference points to the item being published |
| `cc_item_jsonld($schema, $defsById, $values, $title, $url, $imageFn)` (compiler) | The item's JSON-LD script; `JSON_HEX_*` flags keep the script from closing early |
| `cc_field_html($def, $value, $content, $ctx)` / `cc_render_item_field($block)` (compiler) | One field's HTML for its type, and the Item Field block |

`api.php` gives the definitions and the structured data back in `get_collections` (decoded and cleaned), and returns
`has_design` instead of the design itself. `save_collection` only changes what it is sent (`fields`, `schema`).

### Taxonomies, archives, schedules and search facets

| Function | What it does |
| --- | --- |
| `cc_taxonomies_clean($raw)` / `cc_taxonomies_load($pdo, $cid)` (`config.php`) | The taxonomies of a collection with their terms: names and addresses unique within the collection, a reserved address refused, term ids kept or made new |
| `cc_terms_clean($raw, $pdo, $cid)` (`config.php`) | An item's terms: only terms of its collection's taxonomies, one term at most for a single-term taxonomy |
| `cc_tax_free_id($pdo, $table, $id, $cid)` (`config.php`) | A taxonomy or term id: the one sent when no other collection uses it, a new one otherwise |
| `cc_archive_clean($raw)` (`config.php`) | The listing settings: items per page (3 to 50) and which archives are on |
| `cc_archive_nav()`, `cc_archive_browse_html()`, `cc_archive_page_inner()` (`compiler.php`) | The pagination links, the browse links of the first listing page, and the body of an archive page |
| `cc_term_page_inner()`, `cc_taxonomy_index_inner()`, `cc_render_item_terms()` (`compiler.php`) | The term page, the taxonomy page, and the Categories & Tags block |
| `cc_render_related_tags($block, $ctx)` (`compiler.php`) | The Related block in tag mode: the items sharing the item's terms, most shared first |
| `cc_schedule_clean($raw)` (`publish.php`) | A schedule time from the editor ("YYYY-MM-DDTHH:MM") or the stored form; `false` when invalid |
| `cc_schedules_pending()` / `cc_run_schedules()` (`publish.php`) | Is a change due? Make the due changes (a page or an item goes live, or comes down), then publish the site when any changed |

`api.php` returns the taxonomies with `get_taxonomies`, and `get_taxonomy_list` lists every taxonomy with its collection (for the
search filters). `save_taxonomies` (admins) replaces a collection's taxonomies and cleans each item's `terms_json`. `set_schedule`
(POST `{ kind: 'page'|'item', id, publish_at, unpublish_at }`) sets a schedule; `''` clears it, and an unpublish time must be after
the publish time. `save_collection` also takes `archive` (`{ perPage, years, filters, sorts }`). A page being edited may be its
hidden draft copy: `set_schedule` writes to the live page behind it.

### `media.php`

Audio and video (MP3, M4A, OGG, WAV, MP4, WebM) are stored without copies. `cc_media_kind()` tells the kind of a file, and `cc_media_sniff()` checks that it starts the way its type says; restore from a backup uses the same check.

Loaded by `api.php` and `rebuild_all.php`. Copies are `uploads/_cc/<name>-<width>.webp` for `CC_IMG_WIDTHS`
(480, 960, 1600) narrower than the original (never enlarged, EXIF orientation applied, skipped when GD or the
memory limit can't handle the image). The original is never changed.

| Function | What it does |
| --- | --- |
| `cc_media_process($uploads_dir, $name)` | Makes the copies and merges `{ w, h, bytes, variants, optimized }` into `media.json` (called by `upload_media` and `optimize_media`) |
| `cc_optimize_images($html, $uploads_url, $meta = null)` | Publish time: adds `srcset`/`sizes` to `<img>`s of uploaded files that have copies, `loading="lazy"` (except the first image, which gets `fetchpriority="high"`), `decoding="async"` |
| `cc_media_crop($uploads_dir, $name, $x, $y, $w, $h, $mode)` | Crops a JPEG, PNG or WebP (the upright image, pixels): `copy` saves a new `<time>_<name>-crop.<ext>` (description and folder carried), `replace` overwrites the original and makes its copies again. Returns `[name, error]` |
| `cc_media_replace($uploads_dir, $name, $tmp, $size)` / `cc_media_check_file()` | Replaces a file's content under the same name: the new file must really be what the extension says (image type through `getimagesize`, SVG through `cc_svg_is_safe`, audio and video through `cc_media_sniff`); copies are made again and the focal point is cleared |
| `cc_media_focal_clean($f)` / `cc_media_focal_css($f)` | A focal point `{ x, y }` in percent, kept in 0–100 with one decimal (or `null`), and its `object-position` ("30% 70%"). Stored in `media.json` as `focal` |
| `cc_media_forget($uploads_dir, $name)` | Deletes a file's copies and metadata (`delete_media`) |
| `cc_media_meta_all()` / `cc_media_meta_update($fn)` | Read / locked update of `media.json`; `cc_media_meta_file()` honours `$GLOBALS['CC_MEDIA_META_FILE']` (tests) |
| `cc_media_folder_path($p)` | Normalizes a folder path (`" Products / Shoes "` → `"Products/Shoes"`); `''` = no folder, `null` = invalid (max 5 levels, segments of 1–50 letters, digits, spaces, `_ . ( ) & -`, no `.`/`..`) |
| `cc_media_folders()` | All folders, sorted: those in `media-folders.json`, those used in `media.json`, and every parent of them |
| `cc_media_folder_create($path)` / `cc_media_folder_rename($from, $to)` / `cc_media_folder_delete($path)` | Folder operations. Rename moves sub-folders and images' `folder` along (refused when the target exists or is inside the source); delete moves its images to the parent folder and deletes no file |
| `cc_media_move($names, $folder)` | Sets `folder` for the given files (creating the folder). **Folders are labels**: files never move on disk, so image URLs never change |
| `cc_media_usage($pdo, $names)` | Where each file is used: searches the stored content of pages, draft copies (`Page draft`), items (incl. `cover_image`), `site_parts`, `master_components`, and `settings.json` / `menu.json`, by bare file name; returns `name => ["Page: Home", …]` |

### `integrations.php` (integrations)

Loaded by `submit_form.php` (only when `integrations.json` exists, to run after the answer), by `publish.php` (the analytics snippet) and by `api.php` for the `integrations_*` and `stripe_link_*` actions
(admins; `integrations_payment_links` is readable by every signed-in user, for the Payment Button panel). It uses `cc_wp_url_check()` of `wpimport.php` for public-address checks. The admin-facing description is section 12.4 of the
[Administrator Guide](ADMIN-GUIDE.md#12-block-packages-and-the-wordpress-importer).

| Function | What it does |
| --- | --- |
| `cc_int_load()` / `cc_int_save()` / `cc_int_public()` | The settings file (defaults filled in; written 0600) and the copy the editor may see: keys as `••••last4` hints, secrets as hints, never a stored key |
| `cc_int_clean_webhook()`, `cc_int_clean_mailchimp()`, `cc_int_clean_brevo()`, `cc_int_clean_analytics()`, `cc_int_clean_stripe_key()` | What a save keeps: a public https webhook address (`cc_int_webhook_url()`), key formats (Mailchimp `<32 hex>-<dc>`, Brevo `xkeysib-…`, Stripe `sk_`/`rk_`), id formats, a choice of forms (`all`, `newsletter`, or form ids). A key left empty or masked keeps the saved one |
| `cc_int_http($method, $url, $body, $opts)` | The one outgoing call: https only, a host list for the services, `public` (the address must be public, the connection pinned with `CURLOPT_RESOLVE`), no redirects, a 6 s limit, 64 KB of answer. Stub: `$GLOBALS['CC_INT_HTTP']` |
| `cc_int_dispatch($pdo, $form, $byIndex, $fields, $subId, $page, $site)` | What a submission triggers: the matching webhooks (body from `cc_int_webhook_body()`, headers and HMAC signature `cc_int_sign()`), then the newsletter services for a contact found by `cc_int_contact()` and allowed by `cc_int_may_subscribe()` (a ticked consent field, or a newsletter form with none). Everything is logged |
| `cc_int_log()` / `cc_int_resend()` | The `integration_log` table (created on first use, newest 300): a failure keeps the payload to send again; a success keeps none |
| `cc_int_mailchimp_subscribe()` / `cc_int_brevo_subscribe()` / `cc_int_test_service()` | `PUT /lists/<id>/members/<md5(email)>` with `status_if_new` subscribed or pending (Basic auth); `POST /contacts` with `updateEnabled`, an `api-key` header; and the list lookups for *Test the connection* |
| `cc_int_analytics_html($analytics, $banner)` | The head snippet for Google Analytics, Plausible or Matomo; held back with `type="text/plain" data-cc-consent` (the cookie banner activates it) when there is a banner and the service uses cookies |
| `cc_int_stripe_create_link()` / `cc_int_stripe_set_active()` / `cc_int_stripe_link_ok()` | Product, price (smallest currency unit) and payment link through the Stripe API with the key as a bearer token; deactivating a `plink_` link; the only addresses a payment link may have |

`submit_form.php` sends the visitor's answer first (a `Content-Length` and `Connection: close`, `fastcgi_finish_request()` where there is one) and then runs `$CC_AFTER`, which calls `cc_int_dispatch()`; the honeypot and rate-limit
paths return before it is set, so they trigger nothing, and a demo site never calls out. `cc_form_registry()` records each form's `type` and `meta` through `cc_form_meta_note()` while `FORM`, `WIZARD` and `NEWSLETTER` render.
Test overrides: `$GLOBALS['CC_INT_FILE']`, `CC_INT_HTTP`; `integrations-source.php` (the services' base addresses, `allow_private`) is how `tests/security.php` points a real installation at fake Mailchimp, Brevo, Stripe and webhook
receivers. `tests/server.php` covers the library (INTEGRATIONS), `tests/ui-shell.mjs` the page and the block's panel, `tests/parity.mjs` the Payment Button in both engines.

### `library.php` (template library)

Loaded by `api.php` when a `library_*` action is called (admins; installs are off in the demo). It reuses the downloader of `update.php`
(`cc_update_fetch()`, `cc_update_url_ok()`). The admin-facing description is section 12.3 of the [Administrator Guide](ADMIN-GUIDE.md#12-block-packages-and-the-wordpress-importer); the kit format is 8.4 here.

| Function | What it does |
| --- | --- |
| `cc_lib_source()` | The feed: `index`, `sig`, `hosts` (the only hosts a download may use) and `https`; overridden by `library-source.php` (kept across updates: `CC_UPDATE_KEEP_FILES`) |
| `cc_lib_index($force)` | The verified index (cached an hour in `library/index.json`): the signature over `"canvascore-library-v1\n" . sha256(index.json)` is checked against `cc_update_keys()` before anything is believed; entries are cleaned (`cc_lib_entry_clean()`: slug id, known type, a sha256, an allowed https address) and a failed download falls back to the last good copy, marked `stale` |
| `cc_lib_download($entry)` / `cc_lib_preview($entry)` | The kit ZIP (8 MB at most), refused unless its sha256 is the index's; the preview picture, validated as a real raster image (300 KB) and cached, served by `library_preview` |
| `cc_lib_read($source)` | Reads a ZIP or a folder with the real size of every file, name rules, `kit.json` and `content.json` checks, the block types (`blocks.json` plus package blocks), the images the content points to, SVG and raster checks. Returns the kit and a list of `errors` |
| `cc_lib_prepare_blocks($blocks, $assetUrls, &$dropped)` | What a kit's blocks become: image addresses swapped in, then `cc_keep_code_surfaces($blocks, [])` (no code), `cc_sanitize_blocks()` and fresh block ids |
| `cc_lib_menu_clean()`, `cc_lib_design_clean()`, `cc_lib_page_fields()` | A menu (labels and plain addresses, three levels), a design (the cleaners of Global Options, a safe font family) and a page's fields |
| `cc_lib_install($pdo, $kit, $opts, $user, $baseDir)` | Copies the images (`Library/<name>` in the media library) and adds draft pages (free addresses), templates or the pages of a site kit in one transaction; `design` also applies the header, footer, menu and colours after saving `library/undo-<id>.json`; logs to `installed.json` |
| `cc_lib_undo($pdo, $installId)` | Puts the saved header, footer, menu and settings back (once) |

Test overrides: `$GLOBALS['CC_LIB_DIR']`, `CC_LIB_DATA_DIR` (where `menu.json` and `settings.json` are), `CC_LIB_UPLOADS`, `CC_LIB_KEYS`, `CC_LIB_FETCH` (a stub downloader) and
`CC_LIB_APP_VERSION` (also an environment variable of the tools). `tests/server.php` covers the library (valid and hostile kits, cleaning, installs, undo, the signed index),
`tests/ui-shell.mjs` the page, and `tests/security.php` the whole flow over HTTP against a fake feed.

### `roles.php` (roles and review)

Loaded by `api.php`. The roles are `CC_ROLES` (`config.php`: `admin`, `editor`, `reviewer`, `author`; `cc_role_clean()` turns anything else into `editor`, as before
roles existed). The admin-facing description is section 6 of the [Administrator Guide](ADMIN-GUIDE.md#6-accounts-and-roles).

| Function | What it does |
| --- | --- |
| `CC_CONTRIBUTOR_DENIED` | The actions an author or a reviewer may not call (site-wide ones and bulk changes); `api.php` answers `{ success: false, code: 'forbidden' }` before the action runs. Everything else is checked inside the action |
| `cc_can_create()`, `cc_can_publish_directly()`, `cc_can_publish_site()`, `cc_can_edit_any()`, `cc_is_contributor()` | The small table of what a role may do (`rebuild_all.php` uses `cc_can_publish_site()`) |
| `cc_page_save_check()` / `cc_item_save_check()` | What `save_page` / `save_item` allow for this role and this row: an author edits only their own (a draft copy belongs to its page), never publishes (`needs_review`), is locked while the row waits (`in_review`), cannot change a published item (`published_locked`); a reviewer creates nothing and publishes only a row in `pending` |
| `cc_collection_access_clean()` / `cc_collection_allowed()` / `cc_collections_denied_ids()` | Per-collection access: `get_collections`, `get_items`, `get_item`, `save_item`, `delete_item`, `bulk_items` and `get_taxonomies` honour it |
| `cc_review_allowed()`, `cc_review_set()`, `cc_review_published()`, `cc_review_queue()` | The review flow behind `review_submit`, `review_back`, `review_withdraw` and `review_queue`; a publish clears the review (and records the approver) |

An author's `get_pages` and `get_items` are filtered to their own work. Test overrides: none needed (`tests/server.php` calls the helpers on an in-memory
database made from `cc_db_migrations()`; `tests/security.php` replays the whole flow over HTTP with an author, a reviewer, an editor and an admin).

### `update.php` (one-click updates)

Loaded by `api.php` (admins only: `update_info`, `update_check`, `update_install`). It installs a release from GitHub; the
admin-facing description is section 5.1 of the [Administrator Guide](ADMIN-GUIDE.md#5-updating-to-a-new-version).

A release carries two extra assets: `canvascore-<version>.zip` (every file under `canvascore-admin/`, the built editor included)
and `canvascore-<version>.zip.sig` (base64 Ed25519 signature of `"canvascore-update-v1\n" . sha256(zip)`). A release without
them is shown as "no signed package".

| Function | What it does |
| --- | --- |
| `cc_update_source()` | The feed: `latest` (the GitHub API address), `hosts` (the only hosts a download may use) and `https`. Overridden by `update-source.php` (an array; not shipped, kept across updates) for a mirror or the tests |
| `cc_update_keys()` | The trusted public keys from `update-keys.php` (base64, 32 bytes each) |
| `cc_update_get()` / `cc_update_fetch()` | A download: HTTPS and an allowed host on **every** redirect hop, a size limit (the stream stops past it), cURL or `file_get_contents` |
| `cc_update_latest()` / `cc_update_check()` | The release (`tag_name` as a version, notes, size, the two assets); `available` only when `version_compare` says newer. The check is remembered in `updates/last-check.json`; the download addresses never go to the browser |
| `cc_update_requirements()` | What this server needs (sodium, zip, a downloader, keys, write access, 300 MB free) |
| `cc_update_verify()` | `sodium_crypto_sign_verify_detached` against every trusted key |
| `cc_update_inspect()` | Every entry is a plain file under `canvascore-admin/`: no `..`, `\`, NUL or `//`, no link, nothing under `data/` or among `CC_UPDATE_KEEP_FILES`; size and count limits; `CC_UPDATE_REQUIRED` files present; `version.json` equals the release |
| `cc_update_unpack()` / `cc_update_syntax_error()` | Unpack into a new folder; `token_get_all(…, TOKEN_PARSE)` on every PHP file |
| `cc_update_copy_db()` / `cc_update_copy_code()` | `VACUUM INTO` copy of the database and a ZIP of the current code (without `data/`) in `updates/`, newest 3 kept |
| `cc_update_swap()` / `cc_update_unswap()` | Rename the admin folder aside, the new one in, the legacy `data/` folder and `CC_UPDATE_KEEP_FILES` (`.htaccess`, `update-source.php`) across; the undo puts everything back |
| `cc_update_health_check()` | Calls `api.php?action=update_health` with a one-time token (a hash stored in `updates/health.json`, valid 2 minutes): the new `api.php` has opened the database and migrated it. `ok`, `failed` (rolls back) or `skipped` (the server can't call itself) |
| `cc_update_install($pdo, $version, $user, $health)` | The whole flow under a lock; the steps and the rollback; records `updates/history.json`. `$health` replaces the health call (tests) |

Design rules: **nothing is trusted before the signature**; the package is unpacked into a folder next to the admin folder and
parsed before the swap; a failure after the swap restores the code **and** the database copy (a new version may have migrated it);
a version that is not newer is never installed. Library files are listed in the admin `.htaccess` deny rule
(`config.php`, `CC_HT_ADMIN`) and answer 404 when opened directly.

`tests/server.php` covers the pieces (signatures, package checks, swap and undo); `tests/security.php` runs the whole flow over
HTTP against a fake feed, including every refusal and a rollback.

### `blockpkg.php` (block packages)

Loaded by `compiler.php` (so every publish and render knows the installed packages) and by `api.php` (admins: `pkg_info`,
`pkg_install`, `pkg_set_enabled`, `pkg_remove`; any signed-in user: `pkg_list`, which the editor calls after sign-in). The admin-facing
description is section 12.1 of the [Administrator Guide](ADMIN-GUIDE.md#12-block-packages-and-the-wordpress-importer); the format is
section 8.3 here.

| Function | What it does |
| --- | --- |
| `cc_pkg_read($source)` | Reads a ZIP or a folder: manifest, blocks, CSS, images and a list of `errors`. Sizes are checked on the real decompressed data, not on what the ZIP claims |
| `cc_pkg_check_manifest()` / `cc_pkg_check_block()` / `cc_pkg_check_setting()` | The manifest (id, version, `minVersion` against `cc_version()['app']`, or `$GLOBALS['CC_PKG_APP_VERSION']`) and every definition: allowed keys and setting types (no `code`, no widgets), known transforms only, `{{_id}}` and `{{_classes}}` in the template, regular expressions that compile |
| `cc_pkg_html_problem()` / `cc_pkg_css_problem()` / `cc_pkg_selector_problem()` | The static checks of the template HTML and of the style sheet: no script, frame, form, style or event attribute, no active address; no `@import`, no backslash, only `@media`, `@supports` and `@container`, `url()` only as `__ASSETS__/…` or an image `data:` address; `&` only at the start of a selector, nothing that can reach outside the block (`+`, `~`, `:has(&)`…) |
| `cc_pkg_run_checks($id, $blocks)` | The package's own `tests` and the **hostile-value fuzz**: hostile text, addresses, arrays and numbers typed into every setting; the rendered HTML is parsed with `DOMDocument` and a script, event attribute or active address refuses the package |
| `cc_pkg_install($source, $user)` | Everything above, then: a newer version replaces an older one (the same or an older version is refused), files to `packages/<id>/`, images to `canvascore-blocks/<id>/` (with the uploads `.htaccess`), the registry. Returns `{ success, message, errors, id, types }` |
| `cc_pkg_load()` / `cc_pkg_defs()` | Reads an installed package and **checks it again**; the definitions of the enabled packages, which `cc_block_defs()` adds to the core ones (a core block always wins) |
| `cc_pkg_css()` / `cc_pkg_editor_payload()` / `cc_pkg_rich_fields()` | The package CSS nested as `.cc-pkg-<id>{ … }` (the `{{PACKAGE_CSS}}` placeholder of `master.html`, filled by `publish.php`); what the editor needs (`packages`, `css`); the rich-text fields of a package block (`cc_sanitize_blocks()` cleans them on save) |
| `cc_pkg_info($pdo)` / `cc_pkg_usage()` | The list for the admin page, with where each package's blocks are used |

A package block's type is `X_<ID>__<NAME>` (upper case, dashes as underscores), so it can never clash with a core type. The engines add the
class `cc-pkg-<id>` and the built-in `{{_assets}}` (`{{BASE_URL}}canvascore-blocks/<id>/`; the canvas rewrites it to `../canvascore-blocks/`).
`cc_render_block_body()` and `renderBlock()` catch a failure of a package block and give an HTML comment instead, so a publish never stops
because of a package. Test overrides: `$GLOBALS['CC_PACKAGES_DIR']`, `CC_SITE_ROOT`, `CC_PKG_APP_VERSION` (also the environment variable of the CLI tool).
`tests/server.php` covers the library (BLOCK PACKAGES, WHAT IS REFUSED, RICH TEXT), `tests/parity.mjs` that both engines render a package block
identically, `tests/panels-ui.mjs` the editor registration, `tests/ui-shell.mjs` the admin page and `tests/security.php` the whole flow over HTTP.
Packages are not part of a site backup (`backup.php` does not know them).

### `wpimport.php` (WordPress importer)

Loaded by `api.php` only when a `wp_*` action is called (admins, not in the demo): `wp_info`, `wp_analyze` (multipart `file`), `wp_start`
(`{ job, options }`), `wp_step` (`{ job }`), `wp_discard`. The admin-facing description is section 12.2 of the Administrator Guide.

The import is a small state machine over a **job folder** (`imports/<job>/`, a 16-hex id): `analyze` reads the export once with `XMLReader`
(no entities, no network, a document type is refused, 200 MB and 50,000 entries at most) and writes `pages.jsonl`, `posts.jsonl`, `media.jsonl`
(one JSON line per entry, so memory stays flat) and `meta.json`; `start` creates the collection, its Categories and Tags and the new address
of every entry (`slugs.json`: old path to new path, also `?p=` and `?page_id=`), in one transaction; `step` does about 15 seconds of work
(pictures, then pages, then posts) and saves `state.json` after every entry, so a repeated step continues where it stopped. A lock file
refuses two steps at once (`busy`).

| Function | What it does |
| --- | --- |
| `cc_wp_analyze($file)` / `cc_wp_summary()` | Read and summarise; returns `{ job, summary }` or `{ error }` |
| `cc_wp_start($pdo, $job, $options)` | The options (`pages`, `posts`, `media`, `drafts`, `redirects`, `collection`, `collection_name`), the collection, taxonomies and terms (limits `CC_TAX_MAX`, `CC_TERM_MAX`), unique addresses |
| `cc_wp_step($pdo, $job, $budget)` | One slice; returns the progress (`phase`, `totals`, `done`, `created`, `failed`, and when finished `warnings`) |
| `cc_wp_blocks($html, $ctx)` | WordPress HTML to blocks: removes comments, turns `[caption]` and `[gallery ids]` into figures and drops other shortcodes, splits old posts at blank lines, rewrites picture and link addresses through `$ctx`, then walks the top level (headings, lists, quotes and tables collect into a Text block; a picture, video link, `<pre>` or rule starts a block of its own; layout wrappers are unwrapped). Callers run `cc_sanitize_blocks()` on the result |
| `cc_wp_url_check($url)` | Whether an address may be downloaded: http(s), no credentials, ports 80, 443, 8080, 8443 only, and **every** address the name resolves to must be public (`FILTER_FLAG_NO_PRIV_RANGE` and `NO_RES_RANGE` plus 100.64.0.0/10) |
| `cc_wp_fetch($url)` / `cc_wp_store_image()` | The download (cURL, redirects followed by hand and checked at every hop, the connection pinned to the checked address with `CURLOPT_RESOLVE`, 25 MB cap) and the upload checks (extension allow-list, real image through `getimagesize`, SVG through `cc_svg_is_safe`, then `cc_media_process()`) |

Redirects are made only for entries imported as published, never from an address that is a live page or collection, nor from an address that is
another imported entry's new address. Test overrides: `$GLOBALS['CC_WP_DIR']`, `CC_WP_UPLOADS`, `CC_WP_BASE_DIR`, `CC_WP_FETCH` (a stub downloader) and
`CC_WP_RESOLVE` (a stub resolver). `tests/fixtures/wordpress.xml` is a small export used by `tests/server.php` (WORDPRESS IMPORT) and `tests/security.php`;
`tests/ui-shell.mjs` covers the page.

### `backup.php`

Loaded by `api.php`. A backup is a ZIP with `manifest.json` (`format: "canvascore-backup"`, `format_version`
`CC_BACKUP_FORMAT` = 1, `app`, `build`, `db_schema`, `content_schema`, `created_at`, `kind`, `site_name`,
`includes`, `counts`, `uploads`), `db/<table>.json` (every row of `CC_BACKUP_TABLES`: `pages` incl. draft copies,
`templates`, `master_components`, `site_parts`, `collections`, `collection_items`, `redirects`; plus the optional
`page_revisions` and `form_submissions`), `data/<file>.json` (`CC_BACKUP_DATA_FILES`: `settings.json`, `menu.json`,
`media.json`, `media-folders.json`) and `uploads/…` (images only, stored uncompressed). The `admin` and `cc_meta`
tables are never included.

| Function | What it does |
| --- | --- |
| `cc_backup_create($pdo, $dest, $opts)` | Writes the ZIP (`history`, `submissions`, `kind`); returns the manifest or throws |
| `cc_backup_inspect($path)` | Opens and checks a ZIP without changing anything: manifest, only allowed entries (`cc_backup_upload_path_ok()`: image extensions, plain names, no `..`), not newer than this install (`format_version`, `db_schema`), enough disk space |
| `cc_backup_restore($pdo, $path)` | Reads and validates every table and data file first; unpacks images into `.cc-restore-…` next to `uploads/`, drops unsafe SVGs / non-images, swaps the folders (`.cc-old-uploads-…` kept until the end); replaces the tables in one transaction (optional tables only when present; columns intersected with the current schema, so older backups load) and puts the old uploads back on failure; then writes settings (keeping the current `trustedProxies`), menu and media data, and runs `cc_migrate_content()` |
| `cc_backup_safety_copy($pdo)` | `before-restore-…zip` of the current site; keeps the newest `CC_BACKUP_KEEP_SAFETY` (5) |
| `cc_backup_list()` / `cc_backup_name_ok()` / `cc_backup_cleanup()` | Saved backups with their manifest info; strict file name check; removes temporary `download-*.zip` / `upload-*.part` older than an hour |
| `cc_backup_max_upload()` / `cc_backup_slug($name)` | Smaller of `upload_max_filesize` and `post_max_size` (chunk size for the client); download file name from the site name |

When adding a content table or a data file that belongs to the site, add it to `CC_BACKUP_TABLES` /
`CC_BACKUP_DATA_FILES` (both creation and the restore whitelist use them), and to the tests in `tests/server.php`.

## 8. Adding a new block

There are two ways. Prefer a **shared definition** (8.1): one JSON file, no renderer code and no panel to write.
Write the block in **code** (8.2) only when it can't be described that way: it needs the database or the form registry,
or it holds other blocks.

### 8.1 With a shared definition

Example: a `QUOTE` block (section 5, "Shared block definitions", describes every setting type, the template language and the panel keys).

1. **Catalog**: add `{ type: 'QUOTE', label: 'Quote', icon: …, category: 'sections', color, keywords }` to `BLOCKS` in
   `src/editor/blockCatalog.js` (`admin: true` hides it from editors in the Add panel; enforce on the server if it matters).
2. **Defaults**: add `"QUOTE": { "content": {…}, "styles": {…} }` to `types` in `canvascore-admin/blocks.json`: this is what a
   new block starts with. The `default` of a setting is only the fallback for a value that is missing or wrong.
3. **Definition**: `canvascore-admin/blocks/quote.json` with `type`, `settings`, `template` and `panel`. Start from a block of
   the same shape (`callout.json` for a text block, `faq.json` for a list). Use `{{x}}` for every value and `{{{x}}}` only for
   rich text and option data. Rich text settings must also be listed in `CC_RICH_FIELDS` (`config.php`).
4. **Register it in the editor**: add the import line and the name to `BLOCK_DEFS` in `src/render/blockDef.mjs` (between
   the `// <defs:begin>` and `// <defs:end>` lines). PHP picks the file up on its own; `npm run test:parity` fails if the
   two lists differ.
5. **Panel**: the `panel` of the file is all there is to write. A control that is more than a field (a map, a picker…)
   is a widget in `src/components/panel/widgets.jsx`, registered in `widgetRegistry.js`.
6. **Behaviour** (optional): a script that runs on the page goes in `CC_TPL_SCRIPTS` of `blockdef.php` (the canvas
   runs its own copy through an `init*Block` wrapper, as in 8.2, steps 8 and 9).
7. **Fixtures**: add real and hostile fixtures to `fixtures` in `tests/parity.mjs` (empty values, out-of-range numbers,
   wrong types, strings with quotes and `<`): both engines must give the same HTML.
8. **Tests and docs**: `npm test` and lint, the block's entry in [BLOCK-REFERENCE.md](BLOCK-REFERENCE.md), a CHANGELOG
   line under `[Unreleased]`, optionally use it in `starters.json`.

### 8.3 As a package

A block that is **not** part of CanvasCore is a **block package** (Administration › Block packages): a ZIP any admin can install. A package
is declarative, so it needs no code and can't run any: the same definition format as 8.1, plus a manifest, a style sheet and images. The
complete example is `docs/examples/block-packages/pull-quote`.

```
pull-quote/
├── package.json         id, name, version, author, description, homepage, license, minVersion
├── blocks/pull-quote.json   one file per block (12 at most)
├── style.css            optional, 40 KB at most
├── assets/quote.svg     images: png, jpg, gif, webp, avif, svg
└── README.md, LICENSE   allowed, ignored
```

- **`package.json`**: `id` (lower case letters, digits, dashes; it names the folders and the block types), `name`, `version` (`1.2.3`), and the
  optional `author`, `description`, `homepage`, `license` and `minVersion` (an install on an older CanvasCore is refused).
- **`blocks/<name>.json`**: `name` (the block's file name), `catalog` (`label`, `icon` from a fixed list of icon names, `keywords`, `color`),
  `defaults` (`content` and `styles`: what a new block starts with), `settings`, `template`, `panel`, and optionally `rootStyleOmit`, `renderIf`
  and `tests`. Settings, template language and panel are those of section 5 ("Shared block definitions") with these limits: setting types `text`,
  `richtext`, `number`, `bool`, `enum`, `color`, `image`, `list`, `object`, `choices`, `calc`, `flag` (no `code`); only the known transforms;
  no behaviour scripts and no panel widgets; the template must contain `{{_id}}` and `{{_classes}}`; its static HTML may not hold a script,
  frame, form, style element, event attribute or active address (`javascript:`…). Use `{{_assets}}` for the package's images
  (`<img src="{{_assets}}quote.svg">`). A rich-text setting is cleaned on save like the core ones.
- **`style.css`**: written without a prefix. The server nests it under `.cc-pkg-<id>`: a plain selector is something **inside** the block and `&` is
  the block itself (`&.pq { … }`). `@media`, `@supports` and `@container` are allowed; `@import`, backslash escapes, `+` or `~` against the block,
  and any `url()` other than `url(__ASSETS__/file.png)` or an image `data:` address are refused. Rules are published once in the `<style>` of every page
  (`{{PACKAGE_CSS}}` in `master.html`) and in the editor's canvas.
- **`tests`**: up to 20 per block, run at install and by the CLI: `{ "name", "content": { … }, "contains": [ … ], "notContains": [ … ] }`; the HTML is
  rendered by the PHP engine.
- **Block type**: `X_<ID>__<NAME>`, e.g. `X_PULL_QUOTE__PULL_QUOTE`. It is what is stored in the pages.

Develop with the CLI from the repository root:

```bash
php canvascore-frontend/scripts/block-package.php check docs/examples/block-packages/pull-quote       # the install checks (a folder or a .zip)
php canvascore-frontend/scripts/block-package.php pack  docs/examples/block-packages/pull-quote out.zip   # check, then the ZIP to install
CC_PKG_APP_VERSION=0.22.0 php canvascore-frontend/scripts/block-package.php check <folder>             # against another CanvasCore version
```

`check` is the same code as an install, so a package that passes it installs. Both engines render a package block from the same template, which
is why a package has no PHP or JS to write; what a package can't do (read the database, hold other blocks, run a script) is a block for 8.2.

### 8.4 As a library kit

A **template library kit** is a ZIP anyone can propose to the community library (the `sputlab/canvascore-library` repository): a starter page, a few sections or
a whole site. It is data, not code. The examples are in `docs/examples/library-kits`.

```
bistro-site/
├── kit.json         id, name, version, type (page | section | site), author, description, license, tags, minVersion, homepage
├── content.json     the pages, sections or site (below)
├── preview.png      optional (png, jpg or webp, 300 KB at most)
├── assets/logo.svg  images the content uses: png, jpg, gif, webp, avif, svg
└── README.md, LICENSE   allowed, ignored
```

- **`content.json`**: for a **page** `{ "page": { title, slug, layout, bg_color, boxed_width, seo_title, seo_description }, "blocks": [...] }`; for **sections**
  `{ "sections": [ { "name": "Hero", "block": { …one block… } } ] }`; for a **site** `{ "pages": [ { title, slug, home, layout, …, blocks } ], "header": [...],
  "footer": [...], "menu": { "items": [ { label, url, children } ] }, "design": { brandColor, fontFamily, colors, typography, buttonStyles, fieldStyle } }`.
  Blocks are the stored block objects (`type`, `content`, `styles`, `children`); ids are made again on install. Write an image as `kit:assets/<file>`.
- **Limits**: 8 MB, 300 entries, 30 pages, 40 sections, 3000 blocks, nesting 14 deep, 3 MB per file. Only blocks the site has (core or package) may be used.
- **What an install drops**: Custom HTML code, a form's receiving email and custom CSS/JS (the cleaning of an editor's save), unsafe rich text, menu items with
  addresses that are not plain, and design values that are not valid. So a kit cannot carry code, and its forms need an email address set after the install.

Tools (repository root): `php canvascore-frontend/scripts/library-kit.php check <folder|zip>` runs the install checks, `… pack <folder> [out.zip]` makes the ZIP
(`CC_LIB_APP_VERSION=0.24.0` checks `minVersion` against another version). The **maintainers** publish with `php canvascore-frontend/scripts/library-index.php --key=<secret-key>
--kits=<folder of ZIPs> --base-url=https://raw.githubusercontent.com/sputlab/canvascore-library/main/ --out=<folder>`: it checks every kit, writes `index.json` (id, name,
type, version, author, description, tags, size, sha256, url, preview) and `index.json.sig`, copies the previews, and refuses a key that is not in `update-keys.php`.

### 8.2 With code

Example: a `QUOTE` block. Use a nearby code block (e.g. `ITEM_TERMS` or `WIZARD`) as a template at each step: catalog
entry, `blocks.json` defaults, a panel in `panel/blocks/` (`WizardPanel.jsx`), both renderers (with the script only in PHP)
and the parity fixtures.

1. **Catalog**: add `{ type: 'QUOTE', label: 'Quote', icon: …, category: 'sections', color, keywords }` to
   `BLOCKS` in `src/editor/blockCatalog.js`. Add `admin: true` to hide it from editors in the Add panel
   (UI only; enforce on the server if it matters).
2. **Defaults**: add `"QUOTE": { "content": {…}, "styles": {…} }` to `types` in `canvascore-admin/blocks.json`.
   `addBlock()` merges `_baseStyles` + `styles` and deep-clones `content`. Containers add `"children": true`.
   Keep the file's formatting: 2-space indentation and non-ASCII characters written as `\uXXXX` escapes (as
   Python's `json.dump(..., indent=2, ensure_ascii=True)` writes them, e.g. `"Search the site…"`), so diffs
   stay minimal.
3. **Panel**: create `src/components/panel/blocks/QuotePanel.jsx` with a default export
   `({ ctx }) => …`, built from `fields.jsx` (`PanelAccordion`, `TxtF`, `NumF`, `SelF`, `ChkF`, `ColorF`,
   `ImgF`, `ItemCard`). `ctx` provides `c` (content), `set(key, value)`, `patchContent`, `handleStyleChange`,
   `pick(type, index)` for the media picker, and list helpers (`lstOf`, `lstAdd`, `lstPatch`, `lstRemove`,
   `lstMove`). Register it in `CONTENT_PANELS` in `panel/blocks/index.js`. Style and Advanced tabs are shared;
   the Content tab is shown exactly when the type has an entry in `CONTENT_PANELS` (`PropertyPanel.jsx`), so a
   block without a panel opens on Style.
4. **JS renderer**: add `case 'QUOTE':` to `renderBlock()` in `src/render/renderBlock.mjs`. Root element:
   `id="${innerId}"`, `class="cc-quote${animClass}${innerClass}"`, `${styleString}` or `style="${styleAttr} …"`,
   prefixed with `customCss`. Escape everything that isn't rich text.
5. **PHP compiler**: add the mirror `case 'QUOTE':` to `render_block()` in `canvascore-admin/compiler.php`,
   using `htmlspecialchars`, `cc_int`/`cc_num`/`cc_color` and `cc_sanitize_html()` for rich text.
   Add CSS rules that carry logic in a `<style>` next to the block (and the type to `STRICT_STYLE`).
   Behaviour scripts go **only** here (`SEARCH` keeps its script in the `CC_SEARCH_SCRIPT` nowdoc with an `%ID%`
   placeholder); the JS renderer doesn't emit them and the parity test ignores `<script>` nodes.
6. **Parity fixtures**: add one or more fixtures to `fixtures` in `tests/parity.mjs` (edge cases too: empty
   values, out-of-range numbers, hostile strings), and the type to the "fixtures from the real defaults"
   list. Run `npm run test:parity`.
7. **In-place text (optional)**: mark rich-text elements with `${field('text', 'Type…')}` in
   `renderBlock.mjs` and add the type to `TEXT_FIELDS` in `src/components/SortableBlock.jsx`
   (`'full'` or `'basic'` toolbar).
8. **Canvas behaviour (optional)**: injected `<script>`s don't run in the editor. If the block needs JS
   on the canvas, wire it in a `useEffect` in `SortableBlock.jsx` (see `SLIDER`, `BEFORE_AFTER`); add it to
   `INTERACTIVE` if clicks must reach the canvas HTML.
9. **Shared runtime (optional)**: if the canvas must run the same behaviour as the published page, put the script in a
   `// cc-<name>:begin` / `:end` region of `src/render/blockRuntime.mjs`, copy it into `compiler.php` as a `CC_*_SCRIPT`
   constant, and wire the canvas through an `init*Block` wrapper called from `SortableBlock.jsx`.
10. **Tests**: behaviour of the compiled HTML in `tests/blocks-content.mjs` (or `blocks.mjs`), or a quick
   output check in `tests/server.php` (as for `SEARCH`); the panel in `tests/panels-ui.mjs`. Then `npm test` and lint.
11. **Docs**: the block's entry in [BLOCK-REFERENCE.md](BLOCK-REFERENCE.md), a CHANGELOG line under
    `[Unreleased]`, optionally use it in `starters.json` (checked by `test:starters`).

A new **container** type must be added to `CONTAINER_TYPES` (`blockCatalog.js`), which every editor module
uses (store, canvas, Layers, property panel, templates), and to `blockRoot()` (`renderBlock.mjs`) and the PHP
compiler. Whether it gets a Content tab depends only on `CONTENT_PANELS` (e.g. `FLEX_ROW` has
`FlexRowPanel.jsx`; `SECTION` and `CONTAINER` have none).

## 9. Editor state (`src/store/useStore.js`)

One Zustand store holds auth, the current view (`currentView`: `manager`, `editor`, `menu`, `media`,
`settings`, `users`, `templates`, `submissions`, `collections`, `backup`), `viewport`, the page list,
`activePage`, the block tree and session/draft flags. `branding` (`{ siteName, faviconUrl }`) is loaded by
`fetchBranding()` (public `api.php?action=branding`, awaited before the first screen so the sign-in page doesn't
change after it appears) and updated by `setBranding()` when Global Options are saved; `useBrandingHead()` keeps the
tab title (`<site name> · Admin`) and favicon in step. Components read it with `useStore()` /
selectors; non-React code uses `useStore.getState()` / `setState()`.

**Tree helpers** (module-private, immutable): `updateNode`, `removeNode`, `insertNode`, `findNodeById`,
`findInTree`, `nodeContainsId`.

- `newBlockId()` → `block-<time36>-<seq36><random>`: unique even for many blocks created in the same
  millisecond. Use it for every new block and when cloning (`addSavedBlock` regenerates all ids of a template).
- `addTo(blocks, parentId, block)` inserts inside `parentId` only if it exists **and** is a container
  (`children` array or a `CONTAINER_TYPES` type); otherwise it appends at the end of the page. A stale or
  non-container selection can never give a Text block children. `VisualEditor` passes the selected block as
  parent only when it is a container (`getValidParentId()`).
- `moveBlock(activeId, overId)` (canvas drag & drop): dropping onto an **empty** container moves inside it;
  same parent → reorder; different parents → insert before the target. No-op when it would create a cycle.
- `moveBlockTo(activeId, targetId, 'before' | 'after' | 'inside')` (Layers tab) uses the exported
  `placeInTree()`; `inside` appends to a container's children. `src/editor/layerDrop.js` decides the position.
- `moveBlockBy(id, -1 | 1)` swaps a block with its previous/next sibling (Alt+↑/↓, the panel's quick bar).

**Copies and the block clipboard**:

- `cloneWithNewIds(node)` (exported) deep-copies a block and gives it, every descendant and every Hero button a
  fresh `newBlockId()`. Any copy must go through it: a copy must never share an id with its original.
- `duplicateBlock(id)` inserts a clone right after the original (same parent) and selects it; returns the new id.
- `copyBlock(id)` stores `{ block, copiedAt }` in `localStorage` under `'cc_block_clipboard'` (so it survives
  page changes and works across tabs of the same browser) and bumps `blockClipboardAt` (a change signal for
  subscribers). `readBlockClipboard()` (exported) returns the entry or `null` (invalid JSON, no `type`, storage
  unavailable); the Add tab (`AddBlocksPanel.jsx`) uses it to offer "Paste copied …".
- `pasteBlock()` inserts a clone of the clipboard block inside the selected container, after the selected
  block, or at the end of the page, and selects it.
- `replaceBlocks(blocks)` replaces the whole tree as **one undoable step** and clears the selection (restoring a
  version from History); unlike `setBlocks()` it keeps the history, and it isn't saved until Save Draft / Publish.

**Shortcuts** (`VisualEditor.jsx`): one `keydown` listener on `window` in the **capture phase** (the in-place
text editor stops propagation; Ctrl/Cmd+S must still arrive). It does nothing while the session-expired login is
shown or a `.ui-dialog` is open. Ctrl/Cmd+S always works (it blurs the active text first so it commits); every
other shortcut is ignored while typing (`contentEditable`, `INPUT`, `TEXTAREA`, `SELECT`): undo/redo
(Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y), Ctrl/Cmd+D duplicate, Ctrl/Cmd+C copy block (only when no text is
selected), Ctrl/Cmd+V paste block (only when the clipboard holds one), Delete/Backspace delete, Alt+↑/↓ move,
Esc deselect. In master edit mode block shortcuts need a selected block.

**History**: `pastBlocks` / `futureBlocks` snapshots of `blocks` (max 30). Every structural change goes
through `pushHistory()`, which clears the redo stack. `updateBlock(id, updates)` merges quick successive
edits into **one** step, so typing in a field makes one undo step instead of one per key: same block, same keys
(and same nested keys for object values) — compared through a signature kept in the module-level `lastEdit`
— within 1.2 s, and no other change in between (`state.blocks` must still be the tree the last edit produced). `setBlocks()` resets history (opening a page). Always pass new objects to
`updateBlock`; mutating nested arrays in place breaks undo.

**Selection**: `selectedBlockId` / `setSelectedBlockId` (Esc deselects). `removeBlock` clears it when the
selected block is deleted; `duplicateBlock` and `pasteBlock` select the new block.

**Global options in the editor**: `palette`, `typography` and `kit` (button presets and field style) hold the normalised
Global Options (`normalizePalette()`, `normalizeTypography()`, `normalizeKit()`). `Canvas` (`useSiteLook`) and
`GlobalSettings` set them when they load and when the options are saved, so the editor follows a saved change at once.
`loadPalette()` fetches the palette once for the colour fields that need it.

**Style clipboard**: `styleClipboard` holds the style copied from a block (`{ type, styles, responsive }`), for the
session only. `copyStyle(id)`, `pasteStyle(ids)` (one undo step for all the blocks) and `resetStyle(id)` (keeps the
block's `textPreset`, `animation` and hidden devices) are used by the Copy & paste style accordion
(`components/panel/CopyPasteStyle.jsx`) and by the canvas menu.

**Canvas menu**: `contextMenu` (`{ x, y, blockId }` or `null`) is opened by `openContextMenu()` from a right-click on
a block (`SortableBlock`) and drawn once, by `BlockContextMenu.jsx`, which closes it on Esc, a click outside, scroll
or resize. `saveBlockAsTemplate(id)` asks for a name and posts the block to `save_template`; the Style tab and the
menu both use it.

**Drags and undo**: `breakUndoMerge()` makes the next edit a new undo step. The canvas handles
(`components/BlockHandles.jsx`, maths in `editor/handles.js`) call it when a drag or a key press starts, so one drag
is one step even though it writes on every move.

**Custom fields and designs in the editor**: an item's page carries `__item`, its field definitions (`__fieldDefs`),
its `field_values` and, when its collection has a design, `__locked: true`. A design is a page with `__design` (its
`collection_id` and `__fieldDefs`), saved with `save_collection_design`. `pushHistory()` and `updateBlock()` return no
change while the page is locked (`layoutLocked()`), and so do undo and redo, so no edit path can change an item's
layout. Saving a locked item sends `blocks: null`.

**Master edit mode**: `enterMasterEditMode(masterId)` saves the page (`editingMaster.pageBackup`,
`activePageBackup`) and loads the master as `blocks = [master]`. `exitMasterEditMode(true)` posts
`save_master` and only restores the page if it succeeded (on failure it stays, nothing lost);
`exitMasterEditMode(false)` cancels. While editing a master, page save, publish and Ctrl+S are disabled.
`saveAsMaster()` replaces the block with a `MASTER` pointer only after the server confirmed the save.

## 10. Saving and sessions

### Save flow (`VisualEditor.jsx`)

- `savePageRaw(publish)` reads the **latest** state with `useStore.getState()` and posts to `save_part`
  (`activePage.__part`), `save_item` (`activePage.__item`) or `save_page`, updating `activePage.id` from
  `new_id` when a draft copy is created or promoted.
- `savePage(publish)` enforces **one save at a time** (`saveInFlight` ref: a second click/Ctrl+S waits),
  snapshots what it sends (`sent = editorSnapshot(state).page`, `sentScope = editorScope(state)`) and, on
  success, calls `draft.markSaved(sent, sentScope)`. Only what was sent becomes "saved": edits made while
  the request was running stay dirty and backed up.
- Publish = `savePage(true)`, then `publishSiteAsync()` (POST `rebuild_all.php`), then the page list is
  refreshed. A failed save aborts the publish.

### Local backups (`src/session/drafts.js`, `draftTrackers.js`, `hooks.js`)

- `drafts.js`: per-user entries in `localStorage` under `cc_draft:v1:<user>:<scope>`, with an in-memory
  fallback; `saveDraft()` returns `{ ok:false }` instead of throwing (the UI shows `draftBackupFailed`).
  Entries older than 14 days are purged. `canon()` gives order-independent JSON for comparisons.
  `registerFlusher()` / `flushDrafts()` write pending backups on `pagehide`, logout and session expiry.
- `draftTrackers.js`: `createEditorDraftTracker()` compares the canonical snapshot of page + blocks (and
  master, in master mode) with the saved baseline, debounced 600 ms, and sets `editorDirty`. Scopes are
  `editor:page:<id>`; `createDraftChannel()` does the same for `menu` and `settings`.
  `applyDraftToStore()` restores an entry.
- `hooks.js`: `useEditorDraft()` (returns `{ markSaved, discard, restoreFound, dismissFound }`) and
  `useDraftSync(scope, value)` for the Menu and Global Options screens. Logic lives in the pure modules,
  tested in Node.
- Opening a page that has an older backup sets `editorDraftFound: { savedAt }`; `VisualEditor` shows an
  "Unsaved changes found" banner with Restore / Discard. It is never deleted silently.
- `DraftRestorePrompt.jsx` (mounted in `App.jsx`) lists the signed-in user's backups once per sign-in and
  offers to restore them.

### Fetch guard and session manager

`src/apiClient.js` (first import in `main.jsx`) calls `installSession()` (`session/runtime.js`), which
replaces `window.fetch` with `createGuardedFetch()` (`session/fetchGuard.js`):

- adds `X-CSRF-Token` to relative requests (token from `window.__CC_CSRF`, set by `check_auth`, `login` and
  `change_own_password`; it is kept only in memory, never in a cookie);
- for `api.php` / `rebuild_all.php` (except `login`, `logout`, `check_auth`, `session_status`, `version`):
  a **401** shows the login on top of the app (`SessionExpiredOverlay`, app kept mounted and `inert`), waits
  for re-login and **retries once**; a **403** whose message mentions CSRF refreshes the token and retries.

So components simply call `fetch('api.php?action=…', { method: 'POST', body: JSON.stringify(data) })`.

`session/sessionManager.js` polls `session_status` (read-only, doesn't extend the session) every 30 s,
sends `keepalive` at most once a minute and only after user activity, warns before expiry
(`SessionWarning`), and refuses to adopt a different user on re-login (`reauth`).

**Session lock**: PHP file sessions allow one request per session at a time. `api.php` calls
`session_write_close()` for every GET right after the auth gate (and in `session_status`), and
`rebuild_all.php` closes it before compiling. GET handlers therefore **must not write `$_SESSION`**.

## 11. UI conventions

- **Two class namespaces.** Admin UI uses the kit's `ui-*` classes (`src/ui/kit.css`, tokens `--ui-*`).
  The canvas renders the site's real HTML with `cc-*` classes; `global.css` has no rules on bare elements so
  nothing leaks into it, and `.cc-canvas` resets text to the published page's base. Don't style `cc-*` site
  classes from the admin, and don't use `ui-*` in rendered blocks. (The editor layout itself uses a few
  `cc-editor`, `cc-pp…` classes defined in `kit.css`.)
- **Components** (`src/ui/kit.jsx`): `Button` (variants, `icon`, `size`), `IconButton` (requires `label`,
  used as `aria-label`), `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `SearchInput`, `Segmented`,
  `Card`, `Badge`, `StatusBadge`, `EmptyState`, `PageHeader`, `Tabs`, `Section`. Admin screens are wrapped
  in `AdminLayout`. Property panels use `panel/fields.jsx`.
- **Messages**: `notify(message, 'success' | 'error' | 'info')` from `src/ui/notify.js`, shown by
  `<Toaster />`. No `alert()`.
- **Confirmations and input**: `await confirmDialog({ title, message, confirmLabel, danger })` → boolean and
  `await promptDialog({ title, label, defaultValue })` → string or `null` (`src/ui/dialog.js`, rendered by
  `<DialogHost />`). No `window.confirm` / `window.prompt`. Destructive actions: `danger: true`, a specific
  label ("Delete page"), and a message saying what happens.
- **Accessibility**: real `<button>`s and labelled fields, visible focus (`--ui-focus`), `role="tablist"` /
  `aria-selected` for tabs, `aria-current` in navigation; dialogs trap focus, Esc cancels, Enter confirms.
  Global shortcuts ignore keys while a `.ui-dialog` is open.
- **Theme**: colors, radii and fonts are tokens in `kit.css` `:root`; change them there, not inline.
  (Older panels still use inline style objects from `panel/helpers.js`.)

## 12. Backend API conventions (`canvascore-admin/api.php`)

- **Routing**: `?action=<name>`; a flat sequence of `if ($action === '…' && $_SERVER['REQUEST_METHOD'] === 'POST') { …; exit; }`
  blocks. Unknown actions fall through to `{"success":false,"message":"Invalid action."}`.
- **Order at the top**: JSON headers and `cc_security_headers()`, `display_errors` off (warnings go to the log,
  never into JSON; `config.php` turns it off for every web request), the admin `.htaccess`, DB open + migrations
  (a failure answers a generic 500 and logs the details), the one-time SVG recheck, then: **503** `not_installed`
  for everything except `branding`, `session_status`, `check_auth` until `cc_is_installed()`, POST without a
  session → **401** (`cc_unauthorized()`), CSRF + same-origin check on every POST except `login`
  (`cc_verify_csrf_or_die()`, **403**), public actions (`branding`, `session_status`, `check_auth`, `login` (JSON
  `Content-Type` and same origin only), `logout`), the **auth gate** (`cc_session_account()`; `$account` is the
  row and `$is_admin` comes from it, never from the session), the forced password change (**403**
  `must_change_pw` for everything except `change_own_password`, `keepalive`, `version`), `cc_session_touch()`,
  `version` (signed-in only), `session_write_close()` for GET.
- **Admin-only**: add the action to the `in_array($action, [...]) && !$is_admin` list near the top (users,
  backup actions, submissions), or check `$is_admin` inside the handler (collections, redirects, admin-only settings
  fields). Data an editor must not see is removed from read responses too: `get_settings` drops `adminEmail`,
  `emailFrom`, `emailSubject`, `sessionTimeoutMinutes` and `trustedProxies` for non-admins, and `save_settings`
  keeps their stored values.
- **Input**: `json_decode(file_get_contents('php://input'), true)`; validate types; slugs through
  `cc_safe_slug()`; prepared statements only.
- **Output**: mutations return `{ "success": bool, "message": "…" }` (plus `new_id`, `id`, `code` such as
  `slug_taken`); errors are normally HTTP 200 with `success:false`. Read actions return the data directly
  (arrays/objects).
- New state-changing actions must be POST so they get the CSRF check.

Recently added actions:

| Action | Method | Notes |
| --- | --- | --- |
| `get_revisions` | GET `?owner=` | Versions of a page (a draft copy id is mapped to its live page) or `item:<id>`: `id, title, kind, author, created_at, size`, newest first |
| `get_revision` | GET `?id=` | One version with its `content_json` |
| `get_redirects` | GET | All redirects (`from_path, to_path, auto, created_at`); any signed-in user |
| `save_redirect` / `delete_redirect` | POST `{ from, to }` / `{ from }` | Admins only; validated with `cc_redirect_path()` / `cc_redirect_target()`, saved through `cc_add_redirect(…, 0)`; effective at the next publish |
| `save_media_meta` | POST `{ name, alt }` | Alt text of a library image (max 300 characters) in `media.json` |
| `optimize_media` | POST | Makes the WebP copies of images not yet optimized, in ~20 s batches: returns `{ done, remaining }`; call again while `remaining > 0` |
| `change_own_password` | POST `{ current, password }` | Any role, own account; `current` is required unless `must_change_pw` is set (the forced first change) and counts toward login throttling; 8+ characters, not `admin`, not the username, not the current one; clears `must_change_pw`, bumps `session_gen` (other sessions end), regenerates the session id and returns the new `csrf` |
| `add_user` / `delete_user` / `force_password` | POST | Admins. Usernames `^[A-Za-z0-9._@-]{3,32}$`, unique `NOCASE`; the last admin and your own account can't be deleted; `force_password` refuses your own id and bumps the target's `session_gen` |
| `branding` | GET | **Public** (no sign-in): `{ siteName, faviconUrl }` from `cc_public_branding()`, nothing else from the settings |
| `get_media_folders` | GET | Array of folder paths (`cc_media_folders()`) |
| `media_folder_create` / `media_folder_rename` / `media_folder_delete` | POST `{ path }` / `{ from, to }` / `{ path }` | Any signed-in user; returns `{ success, folders }` |
| `media_move` | POST `{ names, folder }` | Sets the folder of existing files (`''` = none); returns `{ moved, folders }` |
| `media_usage` | POST `{ names }` | `{ usage: { name: ["Page: Home", …] } }` (`cc_media_usage()`), shown before deleting |
| `bulk_items` | POST `{ op, ids, collection_id? }` | Any signed-in user. `op`: `move`, `archive`, `unarchive`, `delete`; max 1000 ids. Returns `{ done, skipped: [{ id, title, reason }], removed_files }`. `move` skips items already in the target and published items whose slug is taken by a published item there, and adds redirects for moved published items |
| `backup_info` | GET | `{ zip, max_upload, backups }` (admins) |
| `backup_create` | POST `{ history, submissions, temp }` | `temp: true` makes a one-time `download-…zip`; otherwise a `backup-…zip` kept in `backups/`. Errors come back as JSON before any download starts |
| `backup_download` | GET `?name=` | Streams a saved backup (or a `download-…` one, deleted after sending, named after the site) |
| `backup_delete` | POST `{ name }` | Deletes a saved backup or safety copy |
| `backup_upload_chunk` | POST multipart `{ id, index, chunk }` | Appends a piece to `backups/upload-<id>.part` (`id`: 16 hex characters; index 0 starts the file) |
| `set_role` | POST `{ id, role }` | Admins: changes an account's role (not your own away from admin, not the last admin). Applies at the account's next request |
| `review_queue` | GET | Review rows (`kind` page/item, `title`, `state`, `note`, `by`, `at`, `collection`): everything to review for reviewers, editors and admins; an author's own work |
| `review_submit` / `review_back` / `review_withdraw` | POST `{ kind, id, note }` | Submit (the owner, or an editor), send back (a reviewer, editor or admin; the note is required) and withdraw (who submitted it, or a reviewer, editor or admin); return the row's review fields |
| `media_crop` | POST `{ name, x, y, w, h, mode }` | `mode` `copy` or `replace`; returns `{ name, replaced }`. Not for authors or reviewers |
| `media_replace` | POST multipart `name`, `file` | Replaces a library file's content under its name. Not for authors or reviewers |
| `media_import_url` | POST `{ url, folder }` | Downloads an image into the library (the importer's downloader); not in the demo. `save_media_meta` also takes `focal` (`{ x, y }` or `null`) and `get_media` returns it |
| `integrations_get` | GET | Admins: `{ config (masked), log (latest 60 deliveries), forms (from forms.json), demo, curl }` |
| `integrations_save` | POST `{ section, data }` | Admins, not in the demo: `section` webhooks (a list; returns `new_secrets` once), mailchimp, brevo, analytics or stripe_key |
| `integrations_test` / `integrations_rotate_secret` / `integrations_resend` / `integrations_log_clear` | POST | Admins: send a sample webhook or test a service's list; make a new webhook secret (returned once); send a failed delivery again; clear the log |
| `stripe_link_create` / `stripe_link_add` / `stripe_link_set_active` / `stripe_link_remove` | POST | Admins: create a link with the key, add one by address (`https://buy.stripe.com/…`), switch it on or off (at Stripe too when made here), drop it from the list |
| `integrations_payment_links` | GET | Any signed-in user: the active links (`id, name, amount, currency, url`) for the Payment Button panel |
| `library_index` | GET `?refresh=1` | Admins: `{ kits, installed, fetched, stale, warning, error, demo, zip, sodium }`; kits without their download address or checksum, `installed` = the version installed |
| `library_preview` | GET `?id=` | Admins: a kit's preview as an image (cached; `nosniff`), 404 when there is none |
| `library_install` | POST `{ id, options: { design } }` | Admins, not in the demo: downloads the kit of the signed index, checks its sha256, reads it and installs it; returns `{ success, message, result: { pages, templates, design, images, dropped_code, install_id } }` or `errors` |
| `library_install_file` | POST multipart `kit`, `options` (JSON) | Admins, not in the demo: the same for a ZIP the admin sends |
| `library_undo` | POST `{ install_id }` | Admins: puts back the design an install replaced (once) |
| `pkg_list` | GET | Any signed-in user: `{ packages, css }`, the enabled packages' block definitions, catalog entries and scoped CSS (`cc_pkg_editor_payload()`) |
| `pkg_info` | GET | Admins: `{ zip, demo, max_mb, packages }` with `used` (where the blocks are used) |
| `pkg_install` | POST multipart `package` | Admins, not in the demo: `cc_pkg_install()`; returns `{ success, message, errors, id, types }` (`errors` lists every problem) |
| `pkg_set_enabled` / `pkg_remove` | POST `{ id, enabled }` / `{ id }` | Admins, not in the demo; return `{ success, packages }` |
| `wp_info` | GET | Admins: `{ demo, curl, xml, max_mb, upload_mb, collections }` |
| `wp_analyze` | POST multipart `file` | Admins, not in the demo: reads the export; returns `{ job, summary }` or `{ success: false, message }` |
| `wp_start` / `wp_step` | POST `{ job, options }` / `{ job }` | Admins: start (and the first slice) and next slice; return the progress, `finished: true` at the end; `busy: true` when another step is running. A step is safe to repeat |
| `wp_discard` | POST `{ job }` | Admins: deletes the job folder |
| `update_info` | GET | Admins: `{ current, requirements, last_check, history, demo }` |
| `update_check` | GET | Admins: asks GitHub and returns `{ release }` (version, notes, size, whether it is newer and has a signed package) or an error message |
| `update_install` | POST `{ version }` | Admins, not in the demo. `version` must be the latest release; runs `cc_update_install()` and returns `{ success, message, steps, from, to, rolled_back, history }`. The session is closed first (`session_write_close()`): the update takes a while |
| `update_health` | GET | Public but useless without the one-time `X-CC-Update-Token` header: 404 otherwise. Answers the update's own check (`{ app, db_schema, db_schema_applied }`) |
| `backup_restore` / `backup_restore_saved` | POST `{ upload, size }` / `{ name }` | One at a time (`.restore.lock`): inspect, safety copy, `cc_backup_restore()`. Returns `{ success, message, counts, skipped, safety, backups }`; the client then republishes |

`upload_media` also returns `meta` (from `cc_media_process()`) and accepts an optional `folder` field;
`get_media` returns `folder, mtime, alt, w, h, bytes, optimized, variants` per file (the `_cc` folder isn't listed);
`delete_media` accepts `{ name }` or `{ names: [...] }` and calls `cc_media_forget()` for each.
`save_collection` (admins) renames: without an explicit `slug` the address is kept; it returns `{ id, name, slug,
moved }`. `delete_collection` and `delete_item` take the published files offline at once and return `removed_files`.

`get_collection_design` (`?collection=`) returns `{ blocks }`. `save_collection_design` (admins; POST `{ collection_id,
blocks }`) sanitizes the blocks like a page and stores them as the collection's design. `save_item` accepts `field_values`
(cleaned against the collection's fields; a required field left empty refuses a **publish** with `code: "required"`
and the labels in the message) and `blocks: null` (keeps the stored blocks: an item built from a design sends no blocks).
`get_collection_design`, `get_taxonomies`, `save_taxonomies`, `get_taxonomy_list` and `set_schedule` are described in the
helpers section: taxonomies and schedules are written with the same CSRF and login checks as every other POST.
`export_site` / `import_site` (the pre-0.14 `.json` format) remain; the editor only uses `import_site`, for old
backups.

```php
if ($action === 'save_thing' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$is_admin) { echo json_encode(['success' => false, 'message' => 'Only admins can manage things.']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    if (!is_array($d)) { echo json_encode(['success' => false, 'message' => 'Invalid payload.']); exit; }
    $pdo->prepare("UPDATE things SET name = ? WHERE id = ?")->execute([trim((string)($d['name'] ?? '')), $d['id'] ?? '']);
    echo json_encode(['success' => true, 'message' => 'Saved.']); exit;
}
```

`rebuild_all.php` follows the same rules (login, POST only, CSRF) and reports files it couldn't write
instead of claiming success.

## 13. Versioning, releases and git workflow

`canvascore-admin/version.json` is the single source of truth, read by PHP (`cc_version()`) and Vite:

```json
{ "app": "0.14.1", "db_schema": 8, "content_schema": 1, "build": 28, "built": "2026-10-13T08:08:55.709Z" }
```

- `build`/`built` are bumped by `scripts/bump.mjs` on every `npm run build` (it also syncs `version` in
  `package.json` / `package-lock.json` with `app`). The sidebar (`AdminLayout.jsx`) shows
  `CanvasCore v<app> · build <n>` (from `api.php?action=version`, signed-in users only) and warns when the editor's built-in
  `app` version differs from the server's (reload needed after an update).
- Every published page carries `<meta name="generator" content="CanvasCore">`, deliberately without the version.

Three versions live in that file: `app` (the product, SemVer), `db_schema` (the last DB migration) and
`content_schema` (the saved block format). Bump `db_schema` / `content_schema` together with a new migration (see
[Migrations](#migrations)); a content migration runs on the next request, `cc_migrate_content()` rewrites the stored
`content_json` (of `pages`, today) and stamps the new `content_schema`, and rows saved afterwards are already at the
current version.

Cutting a release:

1. Set `app` in `version.json` (SemVer; while `0.x`, MINOR = new features or format changes, PATCH = fixes only;
   1.0.0 once the API and formats are stable), and the same version in `package.json` and `package-lock.json`.
2. Move `[Unreleased]` in `docs/CHANGELOG.md` (Keep a Changelog format) to a dated `## [x.y.z] - YYYY-MM-DD` section,
   and update the manuals and the README.
3. `npm test` and `npm run lint` (zero warnings).
4. Commit the release, merge it into `main` (`--no-ff`) and push `main`.
5. **Make the signed update package** (sites update themselves from it, section 7, `update.php`), from a clean checkout of the
   released commit so that `git ls-files` lists exactly what is released:
   ```bash
   cd canvascore-frontend
   npx vite build --outDir /tmp/cc-dist --emptyOutDir          # the editor, without bumping the build number
   php scripts/release-package.php --key=$HOME/.canvascore/release-signing.key --dist=/tmp/cc-dist --out=/tmp/cc-release
   ```
   It packs the tracked files of `canvascore-admin/` and the built editor into `canvascore-<version>.zip`, runs the checks a
   site makes before installing (paths, required files, version), signs it and verifies the signature
   (`canvascore-<version>.zip.sig`). It refuses a key that is not in `update-keys.php`.
6. Tag the release `vX.Y.Z` and publish a GitHub release whose notes are that CHANGELOG section (plus update steps
   when needed), with **both files attached as assets**, and mark it as the **latest** release (the Updates page reads
   `releases/latest`). There are no release-notes files in the repository.

**The signing key.** `php scripts/release-keygen.php <file>` makes an Ed25519 pair: the secret key is written to `<file>`
(mode 600; it refuses a path inside the repository) and the public key is printed for `canvascore-admin/update-keys.php`.
Keep the secret key outside the repository and back it up: whoever has it can sign updates that every site installs.
To **rotate** the key, release a version that lists **both** public keys, signed with the old key; once sites have
updated, sign later releases with the new one (a site accepts a package signed by any key it lists).

Contributions from outside follow [CONTRIBUTING.md](../../CONTRIBUTING.md) (focused pull requests, tests and a
CHANGELOG line, `Signed-off-by` per the DCO, contributions licensed AGPL-3.0-or-later). Vulnerabilities are reported
privately as described in [SECURITY.md](../../SECURITY.md) (bug@sputlab.com or GitHub private vulnerability
reporting); only the latest 0.x release gets security fixes.

Git workflow used in this repository:

- Work on a **feature branch** (`menu`, `text_editor`, `ui_reorg`, `bugfix`, `confirm_dialog`…), with
  descriptive commits that also update `[Unreleased]` in the CHANGELOG.
- Merge into `main` with `git merge --no-ff <branch>` so each feature stays a visible unit.
- Run `npm run build` on `main` and commit the bumped `canvascore-admin/version.json` **on its own**
  ("Bump build number to N"); a release commit carries `app` itself.
- Never commit generated output: `dist/`, the editor build copied into `canvascore-admin/`, the data dir and
  the published site at the repo root are all git-ignored. A new root-level file must be whitelisted in
  `.gitignore`.
- Internal working notes (phase notes, old release notes, design notes) go in `docs/dev/`, which is git-ignored:
  they stay on your machine. Anything other developers need belongs in these manuals or the CHANGELOG.
