# CanvasCore

Block-based CMS that generates **static HTML** sites: a React visual editor (drag & drop)
and a PHP + SQLite backend that compiles pages into `.html` files ready to serve.

> **Status: public preview (0.x).** CanvasCore is feature-complete for everyday sites and well tested, but until
> 1.0 the API and data formats may still change between minor versions (database and content migrations run
> automatically on update). Take a backup before updating, and please
> [report what you find](https://github.com/sputlab/CanvasCore/issues).

## What it does

- **Block editor**: more than 50 blocks (text, images, galleries, layout, heroes, forms, pricing, FAQs, maps, and more),
  drag and drop, with a canvas that shows the published page as it will look.
- **Block packages**: add blocks made by other people from a ZIP (definition, panel, style sheet, images, tests). A package
  holds no code that runs, is checked in full before it is installed, and is sandboxed like the core blocks.
- **WordPress importer**: bring pages, posts, categories, tags and pictures over from a WordPress export file, as drafts
  you can check first.
- **Styles**: per-device styles (desktop, tablet and phone), global colours, text styles, button presets and a form
  field style, and copy and paste of a block's style.
- **Collections** (blogs, news, portfolios, catalogues): custom fields of nine types, one design per collection with
  dynamic values (`{{field:price}}`), categories and tags with their own pages, paginated listings and archives (by
  year, month, sort and filter), related items (by reference or by shared tags), lists with fields, sort and filter,
  and structured data (schema.org) for search engines.
- **Publishing**: a static site of HTML files, with RSS feeds, a sitemap, a search index with filters, redirects, scheduled
  publishing (a page or item goes live and comes down at a time; `cron.php` for sites nobody edits), and images
  optimised to WebP with responsive sizes.
- **Roles and review**: authors write and submit for review, reviewers approve or send back with a note, editors publish directly, and a
  collection can be limited to chosen people.
- **Media library**: folders, crop, a focal point that keeps the subject in view, replacing a file without breaking pages, and adding an image
  from a web address.
- **Running it**: accounts with admin, editor, reviewer and author roles, drafts and version history, whole-site backups, forms with
  submissions, a cookie banner, and **one-click updates**: the admin checks GitHub releases, verifies the package
  signature, takes a backup, updates, and rolls back if a check fails.

## Manuals

- [User Guide](docs/manuals/USER-GUIDE.md): building and editing the site
- [Block Reference](docs/manuals/BLOCK-REFERENCE.md): every block and its settings
- [Administrator Guide](docs/manuals/ADMIN-GUIDE.md): installing, hosting, accounts, backups, security
- [Developer Guide](docs/manuals/DEVELOPER-GUIDE.md): architecture, local setup, adding blocks, tests

## Structure

```
.
├── docs/                  Manuals (docs/manuals/) and changelog (CHANGELOG.md)
├── canvascore-admin/      PHP backend (runs on the server, in the site's admin folder)
│   ├── api.php            Editor JSON API (auth, pages, media, menu, users…)
│   ├── compiler.php       PHP block renderer → HTML
│   ├── rebuild_all.php    Publishes the whole site into the parent folder
│   ├── publish.php        The publish itself and scheduled publishing (also used by cron.php)
│   ├── update.php         One-click updates: signed release, backup, swap, rollback
│   ├── update-keys.php    Public keys the releases are signed with
│   ├── blockdef.php       Engine of the shared block definitions (PHP twin of src/render/blockDef.mjs)
│   ├── blockpkg.php       Block packages: install checks, registry, scoped CSS
│   ├── wpimport.php       WordPress importer (export reader, HTML to blocks, image download)
│   ├── roles.php          Roles and review: what each role may do, ownership, collection access
│   ├── blocks/            One definition per block (settings, template, panel), read by PHP and the editor
│   ├── submit_form.php    Public endpoint for form submissions
│   ├── install.php        Setup wizard with setup key (delete after use)
│   ├── config.php         Session, CSRF, data dir, security headers, HTML/SVG sanitizers
│   ├── migrations.php     DB schema and content migrations
│   ├── blocks.json        Block defaults (shared with the editor)
│   ├── starters.json      Starter page templates
│   ├── master.html        HTML template for published pages
│   └── version.json       Single source of the version (app, db_schema, build)
└── canvascore-frontend/   React 19 + Vite + Zustand editor
    ├── src/               Components, store, session handling, JS block renderer
    ├── public/            Icons and menu-preview.html (sandboxed Menu Builder preview), copied into the build
    ├── tests/             JS↔PHP parity, blocks, session, panel, server and security tests
    └── scripts/bump.mjs   Increments the build number in version.json
```

## Requirements

- Node.js ≥ 20 (developed with 24) and npm
- PHP ≥ 8 with `pdo_sqlite` and `dom` (`zip` for backups and block packages; `sodium`, `zip` and `curl` for one-click updates; `xml` for the WordPress importer and `curl` for its picture download); the PHP CLI
  is also needed for the tests (`test:security` also needs `curl` and `sodium`)

## Development

```bash
cd canvascore-frontend
npm install
npm run dev        # editor in development (needs a PHP server for api.php: see the Developer Guide)
npm run lint       # oxlint
npm test           # JS↔PHP parity, blocks, content, session, UI, server, security
npm run build      # build into dist/ (increments the build in canvascore-admin/version.json)
```

## Deploy

1. `npm run build` in `canvascore-frontend/`.
2. Upload `canvascore-admin/` to the server, inside the site's web root, **keeping the folder name**
   `canvascore-admin` (published forms post to `canvascore-admin/submit_form.php`).
3. Copy the contents of `canvascore-frontend/dist/` into that folder.
4. Open `install.php` in the browser (e.g. `https://www.example.com/canvascore-admin/install.php`): it checks the
   server requirements (including that the data folder can't be downloaded from the web) and writes a
   **setup key** to `install-key.txt` in the data folder. Open that file with FTP or your hosting file manager
   and paste the key into the wizard: this proves you control the server, so nobody else can install first.
   The wizard then creates the database, the first administrator account, the base settings and, if you like,
   a homepage from a starter, deletes the key file and leaves you signed in to the editor.
5. Delete `install.php` (the wizard offers a button for it). Once installation is complete the
   file locks itself anyway.

There is no default account: until the wizard has run, the editor's sign-in screen points to `install.php`.

**Updating.** From 0.21.0 on, an admin updates from the editor: **Administration › Updates** checks the latest GitHub
release and installs it (signed package, backup first, rollback if a check fails). Earlier versions, and servers that
lack the requirements the page lists, update by hand: repeat steps 1–3 over the existing files and keep the data
folder (see the [Administrator Guide](docs/manuals/ADMIN-GUIDE.md#5-updating-to-a-new-version)).

The published site is written to the folder **above** `canvascore-admin/`
(`index.html`, one folder per slug, `sitemap.xml`, `robots.txt`, `404.html`, `uploads/`).
Data (SQLite DB, settings, sessions) goes to a `canvascore-data` folder outside the web root if one can be
written (next to the site folder, or next to the web root when the site is in a sub-folder of it), otherwise to
`canvascore-admin/data/`. On Apache, `.htaccess` files written automatically deny access to the data and to the
backend's library files and add security headers to the admin folder; on Nginx add the equivalent rules by hand
(see the [Administrator Guide](docs/manuals/ADMIN-GUIDE.md#42-nginx)).

> Locally, the root of this repository is that same web root: the `.gitignore`
> ignores everything at the root except the files listed explicitly, so generated
> output never ends up in commits.

## Versioning

Semantic versioning; the version lives in `canvascore-admin/version.json` and is read
by both PHP and Vite. See the [changelog](docs/CHANGELOG.md) and the
[GitHub releases](https://github.com/sputlab/CanvasCore/releases).

## Contributing and security

Bug reports, ideas and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security
vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Community: [Discord](https://discord.gg/sD8KMc2kN) · Bugs and suggestions: bug@sputlab.com

## License

Copyright © 2026 Stefano Soranzio.

CanvasCore is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; see the license for details.

In short: you can use CanvasCore for any purpose, including commercial sites. If you modify it and let other people
use your modified version over a network (for example, hosting the editor for clients), you must offer them its
source code under the same license. The sites and content you build with CanvasCore are yours and are not covered
by the AGPL.

**Additional permission (AGPL section 7):** the HTML, CSS and JavaScript that CanvasCore writes into a published
site (the page markup, `effects.css` and the block scripts included in published pages) may be used, copied,
modified and distributed as part of that site under terms of your choice, without the AGPL's requirements applying
to the site. This permission does not cover the editor or the backend in `canvascore-admin/`.
