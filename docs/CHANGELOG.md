# Changelog

All notable changes to CanvasCore are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version stays at `0.x`, the API and formats may change from one
minor to the next: `MINOR` signals new features, `PATCH` fixes.

## [Unreleased]

### Added
- **Integrations** (Administration › **Integrations**, admins): webhooks, newsletter services, analytics and Stripe payment links.
  - **Webhooks for forms**: every submission of the forms you choose (all, or some) is sent to your own https address as a JSON POST
    (event, form, fields, page, site), signed with a secret of that webhook (`X-CanvasCore-Signature: sha256=` HMAC-SHA256 of
    `timestamp.body`, with `X-CanvasCore-Timestamp`, `-Event` and `-Delivery`). It runs after the visitor has been answered; *Send a test*,
    a new secret on request, and an **Activity** list of deliveries where a failed one can be sent again. Addresses must be public (never a
    private or internal network, no credentials, https); the connection is pinned to the address that was checked and redirects are not followed.
  - **Newsletter services**: **Mailchimp** (audience, optional double opt-in) and **Brevo** (list). The email (and name) of a submission is
    added only **with consent**: a ticked consent box, or a Newsletter block that asks for none (the form is the signup); a plain contact
    form is never a signup. Choose Newsletter blocks only, every form with a ticked consent box, or chosen forms; *Test the connection* names the list.
  - **Analytics**: Google Analytics 4, Plausible or Matomo, as a snippet in the head of every published page. Services that use cookies wait for
    the cookie banner's Accept when the site has one (Plausible does not need to). Ids and addresses are checked strictly (nothing with code in it).
  - **Stripe payment links**: a Stripe key (a restricted one is enough) lets you create a product, price and payment link from the admin; or add a link
    made in the Stripe dashboard (no key needed). A new **Payment Button** block (Business) takes a link from that list (or a pasted one), and only
    `buy.stripe.com` / `donate.stripe.com` addresses work; the visitor pays on Stripe's own page.
  - Keys live in `integrations.json` in the data folder (0600, never in `settings.json`, never sent to the editor except masked); a key field
    left empty keeps the saved key. A form's kind and the positions of its email, name and consent fields are now written to `forms.json` at publish.
    Integration settings and the activity list are not part of a backup.
  - `integrations-source.php` (not part of a release, kept when a site updates itself) points the services to other addresses (a mirror, a test).
- **Online template library** (Administration › **Template library**, admins; also *Browse the online library* on the Templates page): starter
  pages, sections and full-site kits shared by the community, installed from the admin.
  - **Kinds of kit**: a **page** (one draft page), **sections** (each becomes an entry of *Add › My templates*) and a **site kit** (several
    draft pages and, if you tick it, its header, footer, menu and colours). Cards show a preview, the kind, author, version and licence; filter
    by kind, search names, descriptions and tags; installed kits are marked; every install is listed.
  - **Curated and checked**: the library is an index kept by the CanvasCore maintainers and **signed** (Ed25519, the release keys); a site
    uses it only if the signature verifies, downloads a kit only from the library's hosts over https, and checks its sha256 against the
    index. The last good list is kept when the library cannot be reached. Previews are fetched by the server and shown from the site itself.
  - **A kit is untrusted content**: it passes the cleaning of an editor's save. Custom HTML is emptied, form email addresses and custom
    CSS/JavaScript are removed, rich text is sanitized, a menu keeps labels and plain addresses only, a design keeps valid colours, text and
    button styles and a safe font only, images must be real images (SVG without scripts), file names and sizes are checked, and a kit may
    only use blocks the site has. The page says how many Custom HTML blocks were left empty.
  - **Nothing is replaced**: pages arrive as drafts with free addresses (a clash gets a number), made by the installer; images go to the
    Media library (folder *Library*). A site kit's design is applied only when asked, after a **safety copy** that **Restore the previous
    design** puts back.
  - **Install from a file**: an admin can install a kit ZIP they have (same checks).
  - **Developer tools**: `php scripts/library-kit.php check|pack <folder>` for kit authors, `php scripts/library-index.php --key … --kits … --base-url …`
    for the maintainers (builds and signs the index), and three example kits in `docs/examples/library-kits` (a page, a section kit and a site kit).
  - `library-source.php` is kept when a site updates itself (like `update-source.php`), and answers nothing when opened directly on Apache (the admin `.htaccess` hides it).
  - The default library is `github.com/sputlab/canvascore-library` (the index and kits are served from raw.githubusercontent.com); a site can point
    to another with `library-source.php` in the admin folder, like `update-source.php`.

## [0.23.0] - 2026-10-25 — Roles and review, and image tools

### Added
- **Roles and review.** Two new roles next to admin and editor, chosen in **Accounts** (each account has a role menu; an admin can
  change a role at any time, never the last admin's).
  - **Author**: writes their own pages and items, saves drafts and **submits them for review**. Sees only their own pages and items,
    cannot publish (nor publish the site), cannot change what belongs to the whole site (menu, Global Options, templates, masters,
    media management, bulk actions, scheduling). Can upload images, delete their own never-published drafts and keep working on a
    published page of their own (the changes are a draft copy, submitted like any draft). Published *items* are changed by an editor.
  - **Reviewer**: sees and can edit all content, creates nothing, and **approves** what was submitted (approving = publishing it, and
    Publish Site) or **sends it back with a note**. A reviewer cannot publish what nobody submitted.
  - **Editor** and **admin** work as before (editors publish directly; they also see the submissions and can send them back).
  - **Review flow**: *Submit for review* (with an optional note) saves the page first. While it waits, the author cannot change it
    (they can withdraw it). The reviewer finds it in **Reviews** (an author's own page there is **My submissions**) and opens it;
    a banner shows who submitted it and the note, with *Send back…* and *Approve & publish*. A page sent back shows the reviewer's
    note to the author, who changes it and submits it again. Page and item lists show where each stands.
  - **Per-collection access** (Collections › *Who can work here*, admins): everyone, or only the people chosen. Others do not see the
    collection, its items or its categories and cannot save items in it; bulk actions skip it.
  - Enforced by the server (`roles.php`), not only hidden in the editor. Migration 15 adds `created_by` and the review columns to pages
    and items (existing pages keep their author as creator) and `access_json` to collections; items made before have no creator, so only
    editors and admins change them.
- **Image tools in the media library.** Each image has a **Crop** button (the frame can be dragged and resized, or typed in pixels;
  shapes: free, original, 1:1, 4:3, 3:2, 16:9, 4:5, 9:16, 3:1) that saves the crop as a **new image** or **over the original**
  (same address: every page that uses it shows the cropped image; the page lists where it is used and asks first). JPEG, PNG and WebP;
  the description and folder are kept, and the optimized copies are made again.
  - **Focal point**: click the subject of a picture (or type its position). It is stored with the image, shown on its card and
    offered when the image is chosen: an **Image** block's *Focus* is filled with it, so the subject stays in view when the
    picture is cropped to fit. The Focus field shows such a value instead of falling back to Center.
  - **Replace file**: a new file takes the place of a library file, keeping its name (so no page breaks), description and folder.
    It must be the same kind of image (a PNG cannot replace a .jpg) and passes the checks of an upload; its focal point is cleared.
  - **From a web address**: the library and the picker can add an image by its address. The server downloads it (public addresses
    only: never a private or internal network, no credentials in the address, usual ports, redirects re-checked, 25 MB) and checks
    it like an upload; the file's own type decides its extension, so an address without one works. Turned off in the demo.

### Upgrade notes
- Migration 15 (the schema becomes 15) runs by itself on the first request: it adds `created_by` and the review columns to pages and items and
  `access_json` to collections. Existing accounts keep their role; pages keep their author as creator; items made before have no creator, so
  only editors and admins change them and authors do not see them.
- **Nginx**: add `roles` to the library-file rule of the example in the Administrator Guide (section 4.2); one-click updates do not change your
  server configuration. Apache needs nothing.
- The Image block's Focus can now hold a point such as `30% 70%` (from a focal point in the library): nothing to change.

## [0.22.0] - 2026-10-25 — Block packages and the WordPress importer

### Added
- **Block packages** (Administration › **Block packages**, admins): third-party blocks installed from a ZIP. A package holds
  `package.json`, one `blocks/<name>.json` per block (a block definition: settings, template and panel, with the block's
  catalog entry, its defaults and its own tests), an optional `style.css` and images in `assets/`. Its blocks appear in the
  Add panel under **Block packages**, get their Content panel generated from the definition, and are rendered by the same two
  engines as the core blocks, so the canvas and the published page match.
  - **Sandboxed by construction.** A package holds no code that runs: no script, no server code, no `code` settings, no panel
    widgets. Templates can't contain `<script>`, `<style>`, frames, forms, event attributes or active addresses; only the
    engine's known transforms are available; text is escaped, rich text is sanitized (also when saved), addresses go through
    the same checks as core blocks.
  - **Checked on install**, and refused with every reason listed: the layout, sizes and file names of the ZIP (no links, no
    `..`, nothing but a package's files), the manifest and every definition, the HTML written in the templates, the style
    sheet, every image (SVG through the SVG check), the package's own tests, and a **hostile-value fuzz**: hostile text,
    addresses, arrays and numbers are typed into every setting and the rendered HTML is parsed: a script, an event attribute
    or an active address in the output refuses the package.
  - **Scoped CSS.** `style.css` is nested under the package's own class (`.cc-pkg-<id>{ … }`): a plain selector is something
    inside the block and `&` is the block itself. Selectors that could reach outside it (`html:has(&)`, `& + .x`, `body &`) are
    refused, as are `@import`, escapes and external `url()`; images are written `url(__ASSETS__/file.png)`.
  - Installed packages live in the data folder (`packages/<id>/`); their images are copied to `canvascore-blocks/<id>/` in the
    site (a reserved address). A newer version replaces an older one; a package can be switched off (its blocks leave the
    published pages but stay saved) or removed, and the page shows where its blocks are used. A faulty package block is left
    out of a page instead of stopping a publish, and a package can never replace a core block.
  - **Developer tool**: `php scripts/block-package.php check <folder|zip>` runs the install checks; `… pack <folder>` makes the
    ZIP. A complete example is in `docs/examples/block-packages/pull-quote`.
- **WordPress importer** (Administration › **Import from WordPress**, admins): pages, posts, categories, tags and pictures from a
  WordPress export file (Tools › Export › All content, a `.xml`). Three steps: the file is read and summarised (nothing in the
  site changes), you choose what to bring over, and the import runs in slices with a progress bar that can be left open.
  - Posts become the items of a new or an existing collection, with their date, excerpt, featured picture (cover image), SEO
    title and description (Yoast / Rank Math), and their categories and tags in the collection's Categories and Tags. Pages become
    pages; every address is made unique (a clash with a page you already have gets `-2`). Password-protected entries, the trash and
    other WordPress entries (menus, products, …) are left out and listed.
  - Content is converted to blocks: paragraphs, headings, lists, quotes and tables become Text blocks; pictures Image blocks (a
    gallery shortcode becomes its pictures); YouTube and Vimeo links and embeds Video blocks; `<pre>` Code Snippet blocks with
    their language; rules Dividers; layout wrappers are unwrapped. Scripts, forms, other iframes and shortcodes are left out and
    reported. Everything goes through the same cleaning as a normal save. Links between imported pages and posts point to the new
    addresses.
  - Pictures are copied into the Media library from the old site: only public web addresses (no private or reserved networks, no
    credentials, usual ports; every redirect is checked again and the connection is pinned to the checked address), 25 MB each, and
    the checks of an upload (real image, safe SVG). Without it pictures stay on the old site.
  - Imported as **drafts** by default; optionally as published, with the old addresses forwarded to the new ones (never from an
    address a page of the site already uses).
  - The export file is read as a stream with no entities and no network access; a file with a document type is refused. Nothing is
    deleted or replaced: everything is added.

### Upgrade notes
- No migration: the schema stays at 14. New folders are created when first used: `packages/` and `imports/` in the data folder,
  `canvascore-blocks/` in the site (a reserved address: no page or collection can take it).
- **Nginx**: add the `canvascore-blocks` location and `blockpkg|wpimport` to the library-file rule of the example in the Administrator
  Guide (section 4.2). One-click updates do not change your server configuration; Apache needs nothing.
- Block packages are not included in site backups: keep their `.zip` files.

### Fixed
- A link to a page chosen in the rich-text link dialog (`{{BASE_URL}}about/`) was stored with its braces percent-encoded
  (`%7B%7BBASE_URL%7D%7D`) after a save, so the published link broke. The placeholder is now kept.

## [0.21.1] - 2026-10-24 — Collection List label on the canvas

### Fixed
- The **Collection List** block showed the raw text `\uD83D\uDCDA Collection List` on the editor's canvas instead of
  the books emoji (the published page was not affected). A test now checks the canvas label.

## [0.21.0] - 2026-10-24 — One-click updates and shared block definitions

### Added
- **One-click updates** (Administration › **Updates**, admins): **Check for updates** asks GitHub for the latest
  CanvasCore release and shows its version, size and release notes; **Update to …** installs it:
  1. the update package (`canvascore-<version>.zip`) and its signature (`.zip.sig`) are downloaded over HTTPS, from
     GitHub's hosts only (each redirect is checked), within a size limit;
  2. the **Ed25519 signature** is checked against the trusted release keys in `canvascore-admin/update-keys.php`:
     a package not signed with the CanvasCore release key is refused;
  3. the package is checked: every file inside `canvascore-admin/`, no `..`, no links, nothing for the site's data
     folder, the required files present, and its `version.json` matching the release. Older or equal versions are
     never installed;
  4. a **backup** is taken: a safety copy of the content (listed in Backup), plus copies of the database and of the
     current code in the data folder (`updates/`, the newest 3 kept);
  5. the new version is unpacked next to the admin folder, and its PHP files are checked to parse. Then the two folders
     are swapped. The data folder, when it is inside the admin folder, and the admin folder's own `.htaccess` are kept;
  6. the new version is called once, with a one-time token: it opens the database, runs its migrations and answers
     with its version;
  7. **rollback**: if a check after the swap fails, the previous folder and the database copy are put back. Nothing
     of the old version is left in the site.

  The page also lists what the server needs (the sodium and zip extensions, curl, write access, free space) and the
  update history. Updates are off in the demo. The first version that can update itself this way is 0.21.0.
- **Release tooling**: `scripts/release-keygen.php` makes the signing key pair (the secret key must be kept outside the
  repository). `scripts/release-package.php` builds the editor, packs `canvascore-admin/` with it, runs the same checks
  a site makes, and signs the package. Both files are uploaded as assets of the GitHub release.
- **Shared block definitions**: a block can now be described once, in `canvascore-admin/blocks/<name>.json`, as a
  settings schema plus a template. The editor (`src/render/blockDef.mjs`) and the published site (`blockdef.php`)
  read the same file, so the block has one rendering by construction instead of two renderers kept in step by hand.
  - **Settings** (`text`, `richtext`, `number`, `bool`, `enum`, `color`, `image`, `list`) rebuild every value before it
    reaches the template: a value of the wrong type or a hostile value gets the setting's default.
  - **Templates** use a logic-light, Mustache-like language with escaping built in: `{{name}}` is always escaped;
    `{{{name}}}` prints raw only trusted HTML (sanitized rich text, the definition's own data). Sections cover lists,
    tests and equality.
  - **The Content panel** is generated from the same schema (`SchemaPanel.jsx`) for all 45 blocks: sections, labels,
    hints and defaults come from the definition. Its controls cover texts, numbers, switches, choices, colours, images
    and audio or video files, the rich text editor, page links, one-per-line lists, date and time, cards for list
    items (with "add from the media library"), objects, multiple choices, half-width pairs, fields shown only when
    another setting calls for them, and fields that edit the block's style. The few controls that are more than a field
    are named widgets (`widgets.jsx`): placing hotspot pins on the image, the Site Search filters, the opening hours,
    the Grid and Cards columns, the button size and border, and the Hero button looks. 29 hand-written panels are gone.
  - Behaviour scripts stay site-side, named by the definition.

  Blocks moved to it: **Text, Image, Icon Box, Testimonial, Callout, Timeline, Steps, Progress Bars, Grid, Cards,
  Image + Text, FAQ, Map, Video, Custom HTML, Divider, Counters, Accordion, Tabs, Pricing, Gallery, Logos, Team, Bento,
  Split CTA, Case Study, Author Bio, Review Summary, Testimonial Wall, Hover Grid, Slider, Before / After, Countdown,
  Table of Contents, Share Bar, Audio Player, Scrollytelling, Hotspots, Video Hero, Code Snippet, Data Table, Site Search,
  Business Details, Button and Hero**: 45 blocks. Behaviour scripts and structured data (the Business JSON-LD) stay
  site-only, named by the definition. Still written in code, on purpose: the containers (the editor draws their children),
  Master, Collection List and the item blocks (Item Field, Related, Categories & tags: they read the database), the
  form blocks (Form, Multi-step Form, Newsletter: they register their recipient for the form handler), the
  Announcement Bar (shared with the site-wide bar) and the Price Calculator (it computes the prices on the server). Their published HTML is unchanged for real content
  (checked byte for byte against the previous renderer, with every field also fuzzed with wrong types and hostile
  values), and the editor and the site now give exactly the same HTML for them. The engine also has lists of plain
  values, value transforms (internal links, CSS addresses, URL encoding, line breaks, video players, number format),
  computed sizes and flags, objects, filtered lists and shares of a total, multiple choices, numeric conditions, admin-only code, blocks that render only when a value is set, and behaviour scripts that receive
  the block's values. The generated panel shows a field only when another setting calls for it, warns about a link
  it can't use, and keeps code read-only for editors. `npm run test:parity` checks both engines on every definition, hostile values
  included, and on the template language itself.

### Changed
- The admin folder's `.htaccess` also blocks direct access to `publish.php`, `blockdef.php`, `update.php`, `update-keys.php`
  and `update-source.php`; on Nginx add them to the library-files rule and let the JSON rule cover `blocks/` (Administrator
  Guide, section 4.2).
- Update packages must contain `blockdef.php` and the `blocks/` definitions.

### Security
- Every update package is checked against the CanvasCore release key before anything is unpacked, and every file name in
  it is checked (nothing outside `canvascore-admin/`, no links, nothing for the data folder).

### Fixed
- Publishing no longer stops on content of the wrong type in the blocks above (for example a list where a text was
  expected, from an import): the value gets its default. An Image block no longer outputs a `javascript:` address
  or an object-fit value that is not one of its choices, and a Progress bar colour that is not a colour gets the
  brand colour. Likewise Grid, Cards, FAQ and Counters with an object where a list belongs, Image + Text with a
  `javascript:` image, Divider with a colour that is not a colour; a Map zoom is kept between 1 and 21. Gallery,
  Logos and Team images go through the image address check (no `javascript:`), a Gallery aspect ratio or corner radius
  that is not one gets the default, and an unknown Tabs or Team style gets the default style. Slider and Before / After
  images, aspect ratios and image fit values go through the same checks, and so do a Hero button's colours and corner
  radius. A Button with an empty text shows "Click here".

## [0.20.0] - 2026-10-24 — Categories and tags, archives, scheduled publishing, faceted search

### Added
- **Related items by tag**: the Related block has a second mode, **That share tags with this item**: the other items of
  the collection that share terms with this one, the most shared first, optionally through one taxonomy.
- **Faceted Site Search**: the Site Search block offers filters (the collection, and each taxonomy). Visitors tick
  choices: the choices of one filter combine with "or", and the filters with "and". With filters on, a search with no
  words browses the matching items. The search index carries each entry's collection and terms.
- **Scheduled publishing**: a page or a collection item can go live at a date and time (**Publish at**) and come down
  at one (**Unpublish at**), set in its settings (Page Settings › Scheduled publishing). The change is made by the server
  at that time: on the next admin request, or by `cron.php` from the command line on a server with no admin in use
  (for example `*/5 * * * * php /path/to/site/canvascore-admin/cron.php`). The site is published again after a change.
  A page with unpublished edits waiting, or an address another live page uses, is left alone and reported.
- **Listing and archive pages** of each collection, built from one paginated layout: the listing (`/<collection>/`,
  `/<collection>/page/2/`…), its sorts (oldest first, A–Z), its years and months (`/<collection>/2026/`,
  `/<collection>/2026/10/`), a filter archive for each choice of its choice fields (`/<collection>/filter/tier/gold/`),
  and the pages of its categories and tags, now paginated. The first listing page links to all of them.
- **Collections › Listing & archives** (admins): the items per page (3 to 50) and which archives are published.
  An address that an item already uses is never written over; the archive is skipped with a publish warning.
- Database schema 13: `collections.archive_json` (added on update).
- Database schema 14: `pages.publish_at`, `pages.unpublish_at`, `collection_items.publish_at`, `collection_items.unpublish_at` (added on update).

### Categories and tags per collection (Collections › Categories & tags, admins define them): a collection has
  taxonomies (for example Category, which takes one term, and Tags, which takes several). Each taxonomy has terms with
  a name, an address and a description. An item picks its terms in its settings (Page Settings › Categories & tags).
- **Listing pages**: each taxonomy gets a page with its terms and their counts, and each term gets a page with its
  live items (newest first), built from the same layout as the item pages and listed in the sitemap.
- **Categories & Tags block**: on an item page, shows the item's terms as links to their listing pages (one taxonomy,
  or all of them, with a separator).
- Database schema 12: `collection_taxonomies`, `collection_terms`, and `collection_items.terms_json` (added on update).

### Documentation
- The user guide (categories and tags, listing and archive pages, scheduled publishing, related items by tag, search
  filters), the block reference (Categories & Tags, the Related modes, the Site Search filters), the administrator
  guide (migrations 12 to 14, the archive pages, scheduled publishing and cron) and the developer guide (the tables, the
  publish split into `publish.php`, the helpers and the API) are updated. The manuals index is at 0.20.0.

## [0.19.0] - 2026-10-22 — Custom fields, one design per collection, structured data

### Added
- **Custom fields per collection** (Collections › Fields, admins define them): text, rich text, number, date, image,
  gallery, link, choice (one or several) and reference to an item of another collection. Each field can be required
  to publish: a collection item with a required field left empty stays a draft, and the message names the field. Every
  item fills them in its settings (Page Settings › Item fields), with the media library for images and galleries.
- **Item Field block**: shows one field of the collection item being published on its page, with its label if asked
  (numbers: decimals; dates: long or ISO format). Pages that are not collection items show nothing.
- Database schema 9: `collections.fields` and `collection_items.field_values` (added on update).
- **Collection List: fields on the cards**, a **sort** (title, date, or a field) and a **filter** by a choice field
  (buttons above the list, shown without a reload).
- **Related Items block**: on an item page, lists the items of a collection that point to it through a reference field
  (a department page listing its people, a client page listing its projects).
- **Structured data for search engines**: a collection can be Product, Event or Person (Collections › Fields). Its item
  pages get schema.org JSON-LD from the fields chosen for each property (price in the currency chosen, photo, dates...).
- Database schema 10: `collections.schema_json` (added on update).
- **One design per collection** (Collections › Design, admins): the blocks every item page of the collection is built
  from. It is edited like a page, and published with the site. An item keeps its fields and settings, and its layout is
  read-only in the editor (the canvas says so). A collection without a design keeps the blocks of each item.
- **Dynamic values** in any block: `{{field:key}}` shows a field of the item (`{{field:key.text}}` the text of a link,
  `.url` a link or a reference's page, `.title` a reference's title), `{{item:title}}`, `{{item:excerpt}}`,
  `{{item:date}}` and `{{item:url}}` show the item itself. In the editor, the design shows the field names in brackets.
- Database schema 11: `collections.design_json` (added on update).

### Documentation
- The user guide (custom fields, the design of a collection, dynamic values, structured data, the list options and the
  Related Items block), the block reference (Related Items, Item Field, Collection List options), the administrator guide
  (migrations 9 to 11, structured data on publish, roles) and the developer guide (the data model, dynamic values, the
  collection helpers, the new API actions and the layout lock) are updated. The manuals index is at 0.19.0.

## [0.18.0] - 2026-10-18 — Button and field presets, copy & paste style, on-canvas handles

### Added
- **Button presets** (Global Options › **Buttons & fields**): **Primary**, **Secondary** and **Outline**, each with a
  background, a text colour, a border and a corner radius, colours can be global colours. The Button block (Content
  tab) and every button of a Hero pick one with **Button preset**; the buttons that use a preset follow it when it changes.
  The colours set in a block's own Colors section still win.
- **Field style** (Global Options › Buttons & fields): the background, border and corner radius of the input fields of
  forms, wizards, newsletter sign-ups and site search. Without a value, the fields keep their look.
- **Copy & paste style** (an accordion at the top of the Style tab): copy the look of a block (its styles and its tablet
  and phone overrides), paste it onto this block, or onto any other blocks of the page, nested ones too, ticked from a
  list; **Select all … blocks** ticks every block of a type. A paste is one undo step.
- **Reset to global style**: removes a block's own styles and device overrides so it follows the site's styles again
  (it keeps its text style, its entrance animation and its hidden devices). It asks first.
- **On-canvas handles** on the selected block: drag the margin (outside its edges), the padding (inside), the width
  (right edge) and the height (bottom edge). Values are set for the device being previewed, a side you don't drag keeps
  its value (a centred block stays centred), and each drag is one undo step. The arrow keys nudge a focused handle
  (Shift: 10 px).
- **Right-click menu** on a block: Duplicate, Move up, Move down, Copy style, Paste style and Save as template.

### Changed
- **Save as template** is one action in the store, shared by the settings panel header and the canvas menu.
- Copy & paste style lists every other block of the page as a target, instead of only blocks of the same type.

### Documentation
- The user guide, block reference, administrator guide and developer guide cover the text styles, global colours,
  button presets and field style, copy & paste style, the canvas handles and the block menu. The manuals index is at 0.18.0.

## [0.17.0] - 2026-10-17 — Styles per device, global colours and text styles

### Added
- **Global colours** (Global Options): a named palette of five built-in colours (Primary, which is the brand colour,
  Secondary, Accent, Text and Background) that can be renamed and changed, plus custom colours that can be added and
  removed. Every colour field of the editor and the text editor's colour menu offers the palette as swatches. A field
  that uses a global colour follows it when the palette changes; Unlink keeps the current colour as a fixed value.
  Published pages define the palette as CSS variables.
- **Text styles** (Global Options): named presets for H1–H6, body text, small text and buttons, each with a font, size,
  weight and line height, and tablet and phone overrides. The site's own headings, body, small text and buttons use
  them. In the Style tab, Typography › Text style applies a preset to a block; values the block sets itself still win.
  Button blocks keep their bold default unless the Button preset sets a weight.
- **Styles per device** (roadmap Phase 1): every block can have its own spacing, size, typography, colours, borders
  and layout on tablets (up to 1024px) and phones (up to 767px). The Style tab edits the device being previewed: a
  Desktop / Tablet / Phone switch at its top is the same as the editor's preview size. Tablet values override the
  desktop ones and phones inherit the tablet values; setting a field back to the inherited value removes the
  override, and Reset gives a device the inherited styles again. Effects (animations, hovers) stay the same on every
  device.
- **Hide on desktop, tablet or phone** (Advanced › Visibility). In the editor a hidden block stays visible, faded and
  marked "Hidden on phone", so it can still be selected.
- Published pages get the overrides as media rules on the block's id (`block.responsive`, no change for pages without
  them); the editor previews them directly. Same rules in the PHP compiler and the editor (parity fixtures, hostile
  values included); checked in Firefox: the published page at 1280, 768 and 375px matches the editor's three
  previews.

### Fixed
- **Borders set in the Style tab could stay invisible**: the Style list shows "Solid" when no style is stored, but
  without one the browser draws no border. Setting a thickness or a colour now stores the style too.
- The Style tab of blocks that have their own buttons (Hero, Video Hero, Pricing, Split CTA, Price Calculator, Case
  Study, Newsletter, Form, Multi-step Form, Announcement Bar) says that its styles apply to the whole block, and that
  the buttons are styled in the Content tab: a border set there framed the whole Hero instead of its buttons.

## [0.16.0] - 2026-10-15 — More starters, editor matches the site

### Added
- **12 new starter pages** built with the 0.15.0 blocks: SaaS Product, Agency, Product Showcase, Blog Article,
  Podcast Episode, Documentation, Quote Request, Newsletter Landing, Webinar, Personal Portfolio, Restaurant and Our
  Story (24 starters in all, offered by Templates and by the setup wizard). Their placeholder images are small
  palette PNGs, so they survive saving.
- **Collection items from a template**: Collections › New Item asks where to start: an empty item or any starter
  template.
- **View Site** under Publish Site opens the published home page in a new tab, and the page editor has a button
  that opens the published version of the page being edited (disabled until it has been published).

### Changed
- The "make it a global master" button in the block panel is an icon (crown) without the "Master" label.

### Fixed
- **Buttons in the editor now have the size they have on the published page.** The editor stretched every Button
  block to the full width of the canvas; the canvas measured 40px wider than the published page's content (the
  padding was added to the page width); and with no site font chosen it used the system font instead of Inter, the
  published default. Measured in a browser: every button of every block now has the same width, height, font and
  padding in the editor and on the site.
- **Phone and tablet previews** apply the blocks' mobile layout (stacked columns, smaller grids) as a phone or tablet
  does: the blocks' width-based CSS rules become container queries on the preview.

## [0.15.0] - 2026-10-15 — Premium blocks

Eighteen new blocks, audio and video in the media library, and a site-wide announcement bar.

### Added
- **Blocks**: Audio Player, Code Snippet, Multi-step Form, Newsletter Signup, Video Hero, Announcement Bar, Bento
  Grid, Split CTA, Case Study, Author Bio, Testimonial Wall, Scrollytelling, Price Calculator, Product Hotspots,
  Hover Reveal Grid, Review Summary, Table of Contents and Share Bar. Each one has a panel, an editor preview and
  the same output on the published page.
- **Announcement bar**: a site-wide bar in **Global Options** (with a preview), shown on every page. It sticks to the
  top while scrolling, or under the top menu when that is pinned. Visitors can dismiss it, and it stays dismissed
  until the message changes.
- **Media library**: uploads of MP3, M4A, OGG and WAV audio and MP4 and WebM video, shown as tiles with a type
  filter. The picker of each block offers only the kind it needs.
- **Backups** keep audio and video files.
- **Logo Cloud**: the scrolling strip repeats the logos until they fill the line in both directions.
- **Placeholders** for new images, slides and logos are PNG files, so they survive saving.
- **Demo mode** for public demo sites, on only when `demo.json` exists in the data folder (normal installations are
  unchanged): the sign-in screen offers the demo login, a banner counts down to the next reset, password changes
  and uploads are refused, form emails are skipped (submissions are kept), published pages are hidden from search
  engines, and visitors may create a limited number of pages and collection items per reset.

### Changed
- A block added from the Add panel is selected, its settings open, and it is scrolled into view.
- The `hidden` attribute is respected by Video Hero, Price Calculator and Share Bar even where the block sets its
  own `display`, so their hidden parts stay hidden on phones.
- The Multi-step Form and Newsletter Signup send their answers to the same place as the Form block, and their
  receiving email is an administrator setting, like the Form block's.

### Security
- Audio and video uploads must start the way their type says: a script, page or document renamed to `.mp3` or
  `.mp4` is refused, and each file has a size cap with a clear message when the server's own upload limit is hit.
- A backup restore keeps the real audio and video files and skips any file that does not match its type. Before,
  one media file that did not match made the whole backup refuse to restore.

### Fixed
- The Logo Cloud scrolling strip no longer pushes the editor's panels and top bar off the screen.
- The Multi-step Form moves focus to the step's fields in Firefox.
- The Price Calculator shows its currency symbol as text.
- Editing two announcement bar fields in the same moment no longer loses one of the changes.

## [0.14.1] - 2026-10-13 — Security release

A full security review of the backend and the editor before the repository went public. **Update as soon as
possible.** After updating everyone signs in again once (the session cookie changed), and on Nginx the new rules in
the Administrator Guide §4 should be added.

### Security
- **Stored XSS from an editor to an admin (critical)**: rich text is now cleaned when it is saved, not only when it is
  published, for every role and everywhere it is stored (pages, collection items, header/footer, masters, templates,
  version history; restored backups and imports too; existing content is cleaned once when updating). The editor runs
  under a strict Content Security Policy (scripts only from its own files) and every piece of HTML it shows goes
  through DOMPurify, so content can never run code in the admin.
- **No default `admin`/`admin` account**: it gave full access to anyone between uploading the files and running the
  installer, and the forced password change was only checked by the browser. The API now answers "not installed"
  until `install.php` has run; the installer asks for a **setup key** written to `install-key.txt` in the data folder
  (proof of access to the server), runs under a lock and requires the DOM extension. A forced password change is
  enforced by the server. The old default account is deleted once a real account exists.
- **An editor could replace, delete or redirect the admin panel** by publishing a page at `/canvascore-admin/` through
  "discard draft". CanvasCore's own folders (`canvascore-admin`, `uploads`, `canvascore-data`, `data`) are now
  reserved for pages, collections and redirects; "discard draft" only reverts real drafts; publishing never writes
  into or deletes from those folders, and every file it writes stays inside the site folder.
- **Data folder of sites installed in a sub-folder** (`example.com/site/`) was inside the web root while the
  installer reported it outside: new installations put it next to the web root, and the installer now checks over
  HTTP whether the data folder can be downloaded (installation is refused if it can).
- **Sessions end with the account**: deleting an account, resetting a password or changing your own ends the other
  open sessions at once; the role is always read from the database; sessions last at most a week.
- **Sign-in**: attempts are counted before the password is checked (parallel requests can't exceed the limit), with
  limits per account and address, per address and per account; unknown user names take as long as wrong passwords;
  the attempts file can't grow without limit. The login only accepts JSON from the same site (no login CSRF).
- **CSRF**: the token is tied to the session (the script-readable `cc_csrf` cookie is gone) and requests marked as
  coming from another site, or with a foreign `Origin`, are refused.
- **SVG uploads**: checked against an allowlist of drawing elements and attributes (animated links, embedded HTML or
  MathML, external references, `@import` and processing instructions are refused). SVGs uploaded before that fail
  the new check are moved to `quarantine/` in the data folder on the first request after updating.
- **Backups**: restored redirects are validated (a crafted backup could inject `.htaccess` directives or write files
  outside the site); backup names carry 128 random bits.
- **Forms**: only the form's own fields are stored and mailed, with size limits per field and per submission, a cap
  on stored submissions, the success message from the form's settings (never from the visitor), and no error details
  for visitors. The form CSV export also protects column names against spreadsheet formulas.
- **Clickjacking and headers**: the admin can't be framed by another site (`X-Frame-Options`, CSP `frame-ancestors`,
  plus a check in the editor itself); `canvascore-admin/.htaccess` is written automatically with the security headers
  and denies the library files and JSON data; library PHP files answer 404 when opened directly.
- **Other**: editors no longer receive a form's own receiving email; Gallery and Hero image URLs, page colors and
  widths and block style values are validated (no `javascript:` links or CSS breakouts); inline styles in rich text
  are limited to typography and box properties; links opening a new tab get `rel="noopener"`; without the DOM
  extension rich text keeps only plain formatting tags; anonymous visitors get no session; the version is shown to
  signed-in users only (and no longer in published pages' generator tag); errors are never displayed, only logged;
  `X-Forwarded-Proto` is trusted only from trusted proxies; user names are unique and checked; the last admin can't be
  deleted; uploads never overwrite an existing file.

### Added
- `npm run test:security` (`tests/security.php`): installs a fresh copy, serves it with PHP's built-in server and
  replays every attack from the review over HTTP. Part of `npm test`.

### Changed
- The Menu Builder's live preview runs in its own sandboxed page (`menu-preview.html`), so the editor's policy can
  forbid inline scripts.
- DB migration 8 (`admin.session_gen`, unique user names). New dependency: `dompurify` 3.4.16.

## [0.14.0] - 2026-10-13 — First public release

CanvasCore is now free software, released under the GNU Affero General Public License v3.0 or later.

### Added
- **License**: `LICENSE` (GNU AGPL v3), with an additional permission (section 7) so the HTML, CSS and JavaScript
  written into published sites can be used under any terms; see the README. The About dialog shows the license.
- `SECURITY.md` (how to report vulnerabilities privately, supported versions) and `CONTRIBUTING.md` (bug reports,
  development setup, pull requests, DCO sign-off). The README states the project status (public preview).
- **Rename a collection**: a ✎ next to each collection (and "Rename" above its items) changes its name; the address
  (`/blog/`) stays unless you change it too. A new address asks first, and every published item forwards from its
  old URL to the new one after the next publish.
- **Bulk actions on collection items**: a checkbox on each row (shift-click selects a range, the header box selects
  all) opens a selection bar to **move** the items to another collection, **archive** / **unarchive** or **delete**
  them in one go. Items whose URL slug is already used by a published item in the destination are skipped and
  listed; moved published items forward from their old address. New `api.php?action=bulk_items`.
- **Full site backup (ZIP)**: Backup › "Download backup (.zip)" saves everything in one file: pages and their drafts,
  collections and items, templates, masters, global header/footer, redirects, Global Options, the menu, and every
  uploaded image with its description and folder (plus the optimized copies). Version history and form messages are
  optional. User accounts and passwords are never included. "Keep a copy on the server" stores it in the data folder
  (`backups/`, outside the public site); saved copies can be downloaded, restored or deleted.
- **Restore**: from a backup ZIP (uploaded in pieces, so the server's upload limit doesn't matter) or from a copy on
  the server. The file is checked first (only known tables and data files, images only, no paths that leave the
  folders, unsafe SVGs and fake images left out, backups from a newer version refused). A **safety copy** of the
  current site is saved automatically before every restore (the newest 5 are kept). Images are swapped and the
  content replaced in one transaction; if it fails nothing changes. Accounts and the server's trusted proxies are kept;
  the site is republished afterwards. Old `.json` backups can still be imported. The installer now checks for the
  PHP zip extension (needed for backups).
- **Site branding in the admin**: the sign-in screen, the sidebar and the browser tab show the site name (set at
  installation, editable in Global Options) and the site's favicon instead of "CanvasCore" and the default icon
  (falls back to the default icon when there is no favicon or it can't be loaded). "CanvasCore" stays in the
  sidebar footer next to the version. New public `api.php?action=branding` returns only the site name and favicon.
- **About CanvasCore**: an ⓘ next to the version opens a dialog with the version, a link to sputlab.com, the
  source code on GitHub, the Discord server (both with their own logos), the bug/suggestion email (bug@sputlab.com)
  and the donation page.
- **Global Options › Favicon / Default social image**: "Upload image" (with progress) and "Library" buttons next to
  the address, plus a preview.
- **Media library folders**: create, rename and delete folders (nested), see counts, open a folder to see its images
  and sub-folders; drag images onto a folder to move them. Folders are labels (`media-folders.json` + `folder` in
  `media.json`): files never move, so image addresses and pages that use them don't change. Deleting a folder deletes
  no image (they go to the parent). New uploads go into the open folder. The image picker can filter by folder.
- **Select several images**: checkboxes (Shift+click for a range, Select all) and a bar to move them to a folder,
  copy their addresses or delete them together. Deleting warns where the images are still used (pages, drafts,
  collection items, header/footer, masters, Global Options, menu). Sorting: newest, oldest, name, size.
- **Upload progress**: a panel lists every file being uploaded with its progress bar and result (files that aren't
  images are refused with a reason); it stays until closed. Also in the image picker.
- **Redirects**: renaming a published page or collection item makes its old address forward to the new one (a page
  at the old address on any host, plus real `301`s in a marked block of the site's `.htaccess` on Apache). Chains
  collapse, loops are avoided, a page published at an old address cancels its redirect. Global Options › Redirects
  (admins) lists them and lets you add your own. DB migration 7 (`redirects`, `pages.noindex`).
- **SEO**: canonical links on every page; "Hide this page from search engines" (noindex, left out of the sitemap and
  the site search); character counts for meta title/description; search-result and shared-link previews; the social
  share image can be picked from the media library.
- **RSS feeds**: `/collection/feed.xml` for each collection with published items (newest 50), announced in every
  page's head; needs Global Options › Site address.
- **Site Search block**: a search box with instant results from `search-index.json`, rebuilt at each publish (titles,
  descriptions and text of published pages and items); `?q=` opens it with results.
- **Cookie banner** (Global Options): text, Accept/Decline labels, privacy page link, position; remembers the choice.
  Scripts written as `<script type="text/plain" data-cc-consent>` (and `<iframe data-cc-consent-src>`) run only after
  Accept; `data-cc-consent-open` reopens the banner.
- **Faster images**: every uploaded photo gets smaller WebP copies (480, 960, 1600 px wide; never enlarged; phone
  photos turned upright) in `uploads/_cc/`. Published pages give each uploaded image a `srcset` of those copies, so
  phones download a fraction of the size; images load lazily except the first one, which loads with priority.
  "Optimize N older images" in Media makes the copies for images uploaded before. New `canvascore-admin/media.php`.
- **Media library**: each image shows its size in pixels and file size, an "Optimized" badge, and a description
  (alt text) field. Picking an image for a block fills the block's empty alt text with that description.
- **Image picker**: same look as the admin, search by name or description, sizes shown, several uploads at once,
  Esc closes it; the "choose from the media library" buttons have accessible labels.
- **Version history** (History button in the editor's top bar): every Save Draft or Publish that changes a page or
  collection item keeps a version (the newest 40). Preview any version and restore it into the editor as an unsaved
  change (Ctrl/Cmd+Z undoes it). DB migration 6 (`page_revisions`).
- **Duplicate, copy and paste blocks**: Ctrl/Cmd+D duplicates the selected block (with everything inside);
  Ctrl/Cmd+C copies it and Ctrl/Cmd+V pastes it on any page, even in another tab (also "Paste copied …" in the Add
  tab); pasting goes inside the selected container, after the selected block, or at the end.
- **Move and delete from the keyboard**: Alt+↑/↓ moves the selected block among its neighbours, Delete/Backspace
  deletes it (Ctrl/Cmd+Z brings it back). The settings panel has a quick bar (move up/down, duplicate, copy) and the
  Layers row a duplicate button.
- **Change your own password** from the sidebar (key icon next to Logout): current password + the new one twice.
  Any role. A voluntary change now requires the current password.
- **Flex Row** has a Content tab: direction, space between blocks, horizontal/vertical alignment, wrapping.
- **Form**: editable "Message after sending", Phone / Website address / Date field types, fields can be reordered.
- **Image + Text**: image description (alt text). **FAQ** questions and **Slider** slides can be reordered.
- **Slider**: previous/next arrows on the site (a fading slider without autoplay can now be browsed); autoplay
  pauses on hover and is off for visitors who ask for less motion.
- **Trusted proxy addresses** (Global Options › Security, admins): behind a reverse proxy or CDN, login protection
  and form limits use each visitor's real address.
- Server test suite (`npm run test:server`, part of `npm test`).
- **Manuals** in `docs/manuals/`: a User Guide (editors), a Block Reference (every block and its settings),
  an Administrator Guide (installation, web server, updates, accounts, publishing, backups, forms, security,
  troubleshooting) and a Developer Guide (architecture, local setup, data model, rendering and parity, adding a
  block, saving and sessions, conventions, releases). Linked from the README.
- **In-app confirmation dialogs** replace the browser's confirm()/prompt() pop-ups everywhere (deleting pages,
  blocks, images, collections, accounts, templates, masters, submissions; discarding drafts; importing a backup;
  leaving with unsaved changes; naming a template or a master). Each says what will happen, deletions have a red
  button with a clear label and start on Cancel, Esc cancels, Enter confirms, focus stays inside the dialog.
  For code: `confirmDialog()` / `promptDialog()` in `src/ui/dialog.js`.
- **Effects in the Advanced tab** of every block: 12 entrance animations (fade, slide in from left/right,
  zoom in/out, flip, rotate, blur, bounce…) with speed and delay, **hover effects** (lift, grow, shrink,
  shadow, glow, tilt, brighten, black & white → color) and **looping motion** (float, pulse, bounce, swing,
  heartbeat, shake, spin), plus **Preview animation** in the editor. All of it stays still for visitors who ask
  their system for less motion. The CSS lives in `canvascore-admin/effects.css`, shared by the site and the canvas.
- **Button hovers**: hover background, text and border colors and a hover effect (lift, grow, press, shadow,
  glow, shine sweep, outline ring, pulse) for the Button block and for each Hero button.
- **Transparent / outline buttons**: every color field in the panels has a **Transparent** option and a clear
  button; Hero buttons get Solid / Outline / Text only looks and an optional border; the Button block gets a
  Colors section; the Style tab gets a **Text color**.
- **Reorganized admin UI**:
  - **Sidebar navigation** for every section (Pages, Collections, Templates, Media, Menu, Global Options and,
    for admins, Submissions, Accounts, Backup), with Publish Site, the signed-in user, logout and the version;
    on small screens it collapses behind a menu button. No more "Back to Dashboard" round trips.
  - **Pages**: search by title or URL, status filters with counts, sorting, a Home badge, **duplicate page**,
    click a title to edit.
  - **Page editor**: a top bar with the page name and status, save state, preview sizes, undo/redo, Save Draft
    and Publish; side panels beside the canvas instead of over it, each collapsible (remembered per browser).
    Shortcuts: **Ctrl/Cmd+S** saves the draft, **Esc** deselects the block.
  - **Add panel**: blocks grouped by category (Layout, Basic, Sections, Interactive, Lists & data, Business &
    dynamic) with **search** by name or keyword, and it says where the block will go; your templates and
    global masters in the same panel.
  - **Property panel**: the block's name and icon in the header, Content / Style / Advanced tabs that behave
    the same for every block, the first section of each panel open, **Spacing moved to Style**.
  - **Media**: drag & drop and multiple uploads, search, copy an image's address.
  - **Global Options** grouped into cards (Brand & typography, Site identity & SEO, Header & footer, Form
    emails, Security); **Submissions** search; **Accounts** as a table (you can't delete yourself);
    **Backup** page for export/import (moved out of the Pages header).
  - **Notifications** ("Draft saved", "Published", errors) instead of blocking alert dialogs.
  - A shared **UI kit** (`src/ui/kit.jsx`, `kit.css`) so buttons, fields, cards, tabs and tables look and
    behave the same everywhere, with visible keyboard focus.
- The property panel is split into one file per block (`src/components/panel/blocks/`), plus shared Style,
  Advanced and Page Settings panels; block names and icons come from one catalog (`src/editor/blockCatalog.js`).
- `tests/ui-shell.mjs` (`npm run test:ui`, part of `npm test`).
- **New rich text editor** (`src/editor/`), replacing Jodit everywhere with one consistent editor:
  - **Edits the text in place on the canvas**: the block's own HTML becomes editable, so a selected text keeps
    exactly the size, spacing and margins it has on the published page (nothing moves when you click into it);
    the toolbar floats above the text without taking space, and the caret lands where you clicked.
  - **The same toolbar in the property panel**, docked above the field. Titles get a basic toolbar (text style,
    bold/italic/underline, colors, alignment, link, clear formatting, undo/redo, HTML); body text gets the full
    one (adds font, size, strikethrough, sub/superscript, lists, quote, horizontal line, image, table).
  - Headings and paragraph styles (paragraph, H1–H4, quote, code block), relative text sizes that scale with
    the theme, text color and highlight palettes with a **site color** that follows the brand color.
  - Links to a URL or to one of the site's pages, with **open in a new tab** (`rel="noopener"`) and **nofollow**;
    Ctrl/Cmd+K opens the link dialog.
  - Images from the **media library** (or an address, with alt text); **tables** with header row, add/delete
    rows and columns.
  - **Paste cleanup**: content from Word, Google Docs and web pages keeps headings, paragraphs, lists, links,
    tables and bold/italic/underline, and loses fonts, sizes, colors, classes, scripts and inline images;
    Word bullet paragraphs become real lists. Ctrl/Cmd+Shift+V pastes plain text.
  - Edits are saved when the text loses focus, tidied (`<b>`→`<strong>`, empty fields saved as empty).
  - `tests/rich-text.mjs` (`npm run test:rich-text`, part of `npm test`).
- **Menu Builder reorganized into tabs** (Structure, Themes, Style, Effects, Layout & Logo, Mobile) with
  the live preview pinned on top and a Desktop/Mobile switch to check the hamburger menu.
- **12 menu themes**: Classic, Professional, Fresh, Warm, Midnight, Minimal, Ocean, Sunset, Earth, Pastel,
  Bold and Corporate. A theme sets colors, item shape, typography and effects in one click, keeps the links,
  logo, alignment and mobile settings, can be undone, and is marked "In use" until you customize it.
- **Stackable menu effects** (`settings.effects`, replacing the single `effect`): 22 effects in 7 groups:
  hover indicator (underline, center underline, overline, highlight, dot), hover motion (lift, grow, pop),
  hover glow (text glow, shadow), bar (glass, glare, accent line), on scroll for sticky bars (shrink,
  hide on scroll down, shadow), submenu opening (fade, slide, zoom) and page load (slide down, fade in,
  stagger). Effects in different groups combine; "pick one" groups keep a single effect. Menus saved with
  the old `effect` keep working. Animations are turned off for visitors who prefer reduced motion.
- Menu typography (font size, weight, letter case, letter spacing), a button text color for the pill/box
  styles (it was always white), and an optional highlight of the current page (`aria-current` is always set).
- **Mobile menu options** (Mobile tab): 8 burger icons (classic, staggered, two lines, thin, bold, dots,
  grid, boxed) plus "icon + Menu" and a custom character; the burger turns into ✕ while the menu is open
  (`aria-expanded` is kept in sync). The burger can sit on the left, with the logo moving to the right,
  and the logo can be hidden on mobile only.
- `tests/menu.mjs` (`npm run test:menu`, part of `npm test`): keeps the effect catalog in sync between the
  editor and the compiler and renders every theme and effect through the PHP compiler.
- **Setup wizard** (`canvascore-admin/install.php`): checks the server requirements (PHP,
  extensions, writable folders, data dir inside/outside the web root, editor build, `mail()`, HTTPS),
  creates the DB with the existing migrations, an administrator account that replaces the default
  `admin`/`admin`, the site name and address, the email for forms and an optional homepage from a starter
  (created as a draft). Signs you in to the editor automatically at the end of the installation. CSRF-protected;
  it locks itself once the site is already installed (including installs that predate the wizard) and offers to
  delete itself from the server.
- **8 new starter page templates**, available from "Start from a template" and in the installer:
  Services, Pricing, Portfolio, Team, FAQ, Coming Soon, Local Business and Event. They use the newer
  blocks (Steps, Pricing, Data table, Accordion, Gallery, Counters, Logo cloud, Team, Timeline,
  Countdown, Business details, Map).
- `tests/starters.mjs` (`npm run test:starters`, part of `npm test`): checks every starter for unknown
  block types, misspelled content fields and duplicate ids, and renders each one in both the editor
  renderer and the PHP compiler.
- **Unique URLs site-wide**: a page can't be published on a URL already used by another live page,
  a collection or a system folder (`uploads`, `canvascore-admin`), and a collection item can't reuse a
  published item's slug in the same collection. The server refuses with a clear message; drafts can
  still be saved. Page Info warns as you type, and new pages (blank or from a template) get a free
  slug automatically (`new-page`, `new-page-2`…).

### Changed
- Manuals updated for this release (media folders, backups and restore, site branding, collection rename and bulk
  actions, license).
- Internal development notes (phase notes, per-version release notes, the old versioning note) are no longer part
  of the repository; release notes are now published as GitHub releases, drafted from this changelog.

### Fixed
- Deleting a collection item (or a whole collection) now takes its published page offline at once, like deleting a
  page; before, the HTML stayed online until the next publish. Only files a build wrote are removed, and a deleted
  draft never removes the live page that shares its address. Deleting a collection also removes its RSS feed and the
  version history of its items.
- Archived items in the Collections list show only "Archived" instead of "Published" and "Archived" together.
- The Collections list keeps a fixed width: a long collection name is cut with an ellipsis (full name on hover)
  instead of stretching its row and pushing the delete button out of the card; the items header no longer squeezes
  a long name into a narrow column.
- The items table of a collection fits its card without horizontal scrolling: long titles and slugs end in "…"
  (full text on hover), the Edit button is a pencil icon only, and on narrow screens the date is hidden and the
  status moves under the title.
- Media library: the bar shown when images are selected has a solid background, so its text is readable over the
  images scrolling under it.
- **Media library: long file names pushed the copy/delete buttons out of the card**: names are now cut with "…" (full
  name on hover) and the buttons always stay visible.
- Images the server can't process (GD without WebP, memory) stay "not optimized" and are retried; Media says how many
  were skipped. Publishing leaves missing optimized copies out of the `srcset` (e.g. a site restored without
  `uploads/_cc/`). Collection items no longer show the page-only share image / noindex options (they use the cover).
- Manuals updated for all the new features (User Guide, Block Reference, Administrator Guide, Developer Guide).
- **An editor's save wiped the admin's code**: Custom HTML, custom CSS and a form's receiving email set by an admin
  are now kept as they were (editors still can't add or change code); Custom HTML is shown read-only to editors.
- **Renaming a page didn't update links**: the re-linking never matched (escaped slashes in the stored JSON). Links in
  buttons, menus and text are now updated in pages, collection items, header/footer and masters. Deleting a master
  also removes it from collection items and the header/footer.
- **New Buttons ignored the brand color** (a fixed blue default); **placeholder images were broken** (the service
  is gone: built-in placeholders now); emptied button/form texts fall back to their defaults.
- Editors no longer see (or receive from the server) the form email and security settings; new accounts need
  8+ character passwords; the Pricing badge can be edited (or cleared) whether or not the plan is highlighted.
- Friendly block names instead of internal ones in the canvas; accurate "Add inside / at the end" label in Layers;
  a warning for video links that aren't YouTube/Vimeo; the version warning also compares build numbers.
- Publishing reports sitemap/robots/404 write failures; hosts without mbstring no longer break forms.
- README: the admin folder must keep the name `canvascore-admin` (published forms post to it); the dev server
  note points to the Developer Guide. `docs/VERSIONING.md` gave the wrong changelog location; the PHASE notes are
  marked as historical. `npm run lint` now enforces zero warnings.
- **Collections looked empty on the first visit**: the list showed "No collections yet" while it was still
  loading, and the request could wait behind a slower one (PHP keeps one request per session at a time).
  Read-only requests and publishing now release the session right away; the screen shows "Loading…",
  errors with a Retry button, and coming back from an item reopens its collection.
- **Global masters were never published** (the publisher read the database from the old location): they now
  appear on the site; a master that contains itself is skipped instead of crashing the build.
- **The homepage flag was cleared on every save** from the editor: it is now sent, and a save that doesn't
  mention it keeps the current home.
- **Lost work**: edits made while a save was running were marked as saved; reopening a page silently
  deleted its local backup (now offered with Restore / Discard); the "restored" banner followed to other pages;
  two saves could run at once; Ctrl/Cmd+S while typing opened the browser's Save dialog; Ctrl+Shift+Z / Ctrl+Y
  redo didn't work on Windows/Linux.
- **Undo**: editing FAQ items, slider images or form fields couldn't be undone (the history was changed in place);
  typing now makes one undo step instead of one per key.
- **Editor**: blocks could be added "inside" a Text block (and vanish); dropping onto an empty sibling container
  swapped them instead of moving inside; templates could create duplicate block ids; Save as Master replaced the
  block even when the save failed; moving from the Hero title to the subtitle lost the caret.
- **Panels**: the last Hero button couldn't be removed; ↑/↓ broke decimal values (line height 1.5 → 1px);
  CSS Grid columns could become invalid; Button text, grid gap, slider delay and collection limit couldn't be
  cleared; older forms showed no fields; quick successive style edits overwrote each other.
- **Menu / Global Options**: saving before the data loaded overwrote everything with the defaults.
- **Deleting a draft could delete a live page's file** with the same address; deleting the home page left it online.
- **Publishing** now removes pages that are no longer published (deleted, unpublished, renamed, deleted items),
  reports files it couldn't write instead of "Build successful", and requires a POST with the security token.
- **Editor text was pale**: the canvas inherited the dark editor's light text color; it now starts from the
  same base as the published page (dark text, the site font and brand color from Global Options).
- **Layers drag & drop**: rows no longer stretch or shrink while dragging; a line shows where the block will
  land (before/after), a highlight when it goes inside a Section/Container, and blocks can be dropped
  after the last item or into a container that already has blocks.
- **Cards**: the slider showed 2 for a block with 3 cards; it now counts the cards ("Number of cards").
- **Button size** (Small/Medium/Large) only applied the font size, not the padding.
- Selecting a text on the canvas no longer changes its layout (the old editor replaced it with a boxed editor
  with its own padding and toolbar).
- Ctrl/Cmd+Z while typing in a field no longer undoes the whole page.
- Mobile menu with **center or right** button alignment: the burger no longer ends up in the middle and the
  centered logo no longer floats over the open menu; on mobile the bar always puts logo and burger at the edges.
- Menu accent line drawn over the open submenus.
- **Mobile menu always open**: the menu list's inline `display:flex` beat the mobile CSS, so on phones the
  items were always shown and the burger could not close them (on the site and in the preview).
- Menu Builder preview with "Fixed on top": the menu no longer slides down after each change. The preview now
  renders the bar exactly as on the site, over a sample page you can scroll to try "Fixed on top" and the
  scroll effects.
- **Templates**: a page created from a template kept the slug `new-page` instead of following its
  title like a new blank page; it now starts as e.g. `coming-soon`.
- **Editor canvas**: padded full-width blocks (forms, icon boxes, testimonials…) overflowed their box in
  the editor while looking right on the site. The canvas now uses the same `box-sizing: border-box`
  as the published pages.
- **Editor**: opening the Advanced tab on a section or container that came from a starter template
  blanked the whole editor (admins only). Template blocks have no `content` object and the panel read
  it directly; the panel now always gets `content`/`styles` objects. Affected every starter, including
  Landing, About and Contact.
- **Publishing**: `rebuild_all.php` read the global settings before loading them, so the menu's
  "inherit the theme" option (hover color = brand color) was ignored on the published site even though it
  worked in the preview, and the same applied to disabling the global header/footer
  (`headerEnabled` / `footerEnabled`).

### Security
- SVG uploads with scripts or event handlers are refused, and SVGs in uploads/ can't run scripts when opened.
- Values that reach published pages are validated or escaped: brand color, font, site suffix, menu settings,
  form field types, grid columns, style property names, Hero sizes; `javascript:` links hidden behind control
  characters are removed by the sanitizer.
- Editors can no longer change the form email recipients or the session timeout (admin settings).
- Login: 5 wrong passwords in 15 minutes for an account from one address → 15 minutes wait.
- Public forms: unknown forms refused, at most 8 submissions per 10 minutes per address, no crash on crafted fields;
  CSV export protects against spreadsheet formulas.
- API answers never contain PHP warnings; the uploads `.htaccess` no longer breaks images on mod_php hosts;
  password resets require 8+ characters (inline form instead of a browser prompt).

### Removed
- `jodit-react` and the unused `react-simple-wysiwyg` dependencies.

## [0.13.0] - 2026-10-07 — 12 new blocks

### Added
- **Divider**: line, gradient line, dots, wave/curve/diagonal (SVG, can also be flipped) and spacer.
- **Callout**: Info / Success / Warning / Danger / Note box with a title and rich text (sanitized).
- **Steps**: numbered steps laid out horizontally (with connectors) or vertically; on mobile they become vertical.
- **Counters** (animated counters): numbers that count up when they scroll into view. The final value is already
  in the HTML (useful without JS and for search engines); the animation respects `prefers-reduced-motion`.
- **Progress bars**: accessible bars (`role="progressbar"`), color per bar, fill on entry.
- **Data table**: paste from Excel/Google Sheets (cells separated by `|` or Tab); header row, first column
  as a row header, striped rows, borders, compact, sticky header with scroll; responsive.
- **Countdown**: visitor's local time or a fixed UTC offset; final message or hidden block;
  the date is readable even without JS (`<time>`).
- **Timeline**: vertical on the left or alternating (from 769 px up).
- **Logo cloud**: grid or continuously scrolling strip (CSS only, pauses on hover, stops with
  `prefers-reduced-motion`, the duplicated set is hidden from screen readers and the keyboard), grayscale with color on hover.
- **Team**: person cards with photo or initials, role, bio and links (email, LinkedIn, X, website).
- **Before/After**: comparison with a draggable handle, keyboard accessible (`input range`);
  interactive in the editor canvas too.
- **Business info**: address, phone, email, website, directions button (Google Maps), opening hours table and
  **schema.org LocalBusiness** structured data (JSON-LD) for Google, with validated days and hours.
- Configuration panels for all the blocks (reordering ↑/↓, adding/removing items, media picker for
  logos, team photos and before/after images) and a "CONTENT BLOCKS" group in the ADD panel.

### Changed
- Colors and numbers of the new blocks go through validators shared by PHP and JS: only "safe" CSS values
  (no `;`, `{}`, `url()`), numbers clamped to sensible ranges.
- Counters use explicit rounding that is identical in PHP and JS (neither `number_format` nor `toFixed`
  agree on cases like 2.675): the editor and the site always show the same number.
- The property panel reads the content from the store and not from the copy of the last render: two quick
  edits in a row no longer overwrite each other (pre-existing defect, found by the new tests).
- The parity test includes the 12 blocks (variants and edge cases, real defaults from `blocks.json`) and also
  compares the text of the `<style>` tags.

### Notes
- No DB migration; `content_schema` unchanged. No additional PHP dependency: **mbstring is not
  required** (it is not always installed; an `mb_strtoupper` in the first version would have broken publishing).
- Countdown: a fixed UTC offset does not follow daylight saving time; for "midnight for everyone" deadlines use local time.
- Business info: the structured data is published only if there is a name; there is no "open now" indicator.
- In the editor canvas, counters, bars and countdowns show their final state (the scripts only run on the
  published page); Before/After, on the other hand, is interactive.
- `master.html` uses `IntersectionObserver` without a check (pre-existing "reveal" script): irrelevant in
  current browsers, only visible in test environments such as jsdom.
- Tests: `npm test` now also runs `test:content` (149 checks on the compiler, including scripts executed in
  jsdom and JSON-LD) and `test:panels` (71 checks: real panels and canvas mounted in jsdom).
## [0.12.0] - 2026-10-06 — Expired session: work kept safe, no false successes

### Added
- **Deterministic server-side inactivity timeout** (previously expiry depended on PHP's garbage
  collector, ~24 min and unpredictable). Default 30 minutes, configurable in Global Options →
  Security (5–720 min). Working in the interface counts as activity: someone editing for a long time without
  saving is not signed out, someone who is really idle expires on time.
- **Immediate expiry detection**: read-only polling (`session_status`, does not extend the
  session), a check when returning to the tab / resuming from sleep / getting the network back, and a non-blocking
  warning ~2 minutes before expiry with "Stay signed in".
- **Login over the app**: on expiry a login screen appears that covers the interface, which
  stays mounted and inert with all its state (menu, settings, editor). After logging in you pick up
  exactly where you left off.
- **Failed requests are completed**: a save/publish interrupted by expiry
  is kept waiting and re-run ONCE after logging back in, with the new CSRF token.
- **Automatic local backup of unsaved work** (page, item, header/footer and master editors;
  Menu Builder; Global Options), per user, in the browser. After a refresh or a new session
  "Unsaved work found" is offered with Restore/Discard; the login page explains that the session expired.
- Save status in the editor ("All changes saved" / "Unsaved changes · backed up on this device")
  and a confirmation when leaving the editor with unsaved changes.
- `session_status` (read-only) and `keepalive` endpoints.

### Fixed
- **False successes**: "Draft saved!", "Menu saved…" and "Global options saved…" appeared even with
  a 401/error response. Now the outcome is real; publishing does not start if saving fails.
- Saving a **master** with an error discarded the changes with "updated globally": now you stay
  in edit mode.
- A POST with an expired session got a 403 (CSRF) instead of a 401: now the login check comes before
  the CSRF one. A 403 for an expired CSRF token with a valid session repairs itself.
- On a 401 the app unmounted and lost the components' state.
- Logging out without a network stopped halfway and left work state behind for the next user.
- If a different user logs in on expiry, the tab does not take on their identity, does not run the pending
  requests on their behalf and does not write the other user's backups into their account (found by the tests).

### Changed
- PHP sessions live in a dedicated folder (`<data>/sessions`, permissions 0700) with
  `use_strict_mode`: expiry no longer depends on the GC of other applications on the server.
- The APIs respond with `Cache-Control: no-store`.

### Notes
- On the first update all users will have to log in again once (the sessions folder changes).
- Backups are per browser and per user (they don't follow the user to another device) and are
  deleted after 14 days. There is no conflict detection if someone else edits the same page
  in the meantime.
- Tests: `npm test` now also runs the session tests (150 checks: backups, trackers, manager with a fake
  server and simulated clock, fetch guard) and the integration test on the real interface (49 checks:
  the real `App` in jsdom). Verified with mutation testing (bugs planted on purpose, all detected).
## [0.11.0] - 2026-10-06 — New blocks: Accordion, Tabs, Pricing, Gallery

### Added
- **Accordion**: items with rich (HTML) content, Cards/Flat style, icon
  (+ / ▾ / none), first item open, *exclusive* mode (only one open) or
  *multiple*. Uses `<details>`: works without JavaScript. (The **FAQ** block
  remains for plain-text questions/answers.)
- **Tabs**: tabs with rich content, Underline/Pills style, left/center/right
  alignment. Implemented in CSS only (radio + `:checked`): no
  JavaScript, they work even with JS disabled and can be navigated with the arrow keys.
- **Pricing**: plans with name, price, period, description, feature list
  (one per line), button (URL, `mailto:`, or a site page), a
  **highlighted** plan with a badge. Automatic columns (max 4), 1 column on mobile.
- **Gallery with lightbox**: *Grid* layout (uniform thumbnails with the chosen
  ratio) or *Masonry* (natural ratios), 1–6 columns, gap, rounded corners,
  optional captions. Lightbox with previous/next, keyboard (←/→/Esc),
  swipe on touch, click on the backdrop, focus trapped and restored; without
  JavaScript the image still opens (direct link). Images can be added
  from the Media Manager.
- Configuration panels with reordering (↑/↓), removing and adding items.
- Accordion and Tabs are interactive in the editor canvas too.
- Behavioral tests (`npm run test:blocks`, included in `npm test`): Tabs
  logic evaluated on the elements actually selected by the CSS, lightbox executed
  in jsdom, sanitization, exclusive/multiple accordion, Pricing URLs.

### Changed
- The parity test now also compares the text of the `<style>` tags for the blocks
  whose CSS carries logic (Accordion, Tabs, Pricing, Gallery) and includes the real
  defaults from `blocks.json`. Previously the `<style>` tags were ignored: a regression in the
  Tabs logic would have gone unnoticed.
- New devDependency: `jsdom` (tests only).

### Notes
- No DB migration; `content_schema` unchanged (the new types are additive).
- The content of the Accordion/Tabs panels is edited as text/HTML in the
  side panel (like Grid/Cards), not with the inline visual editor.
- Rich content is sanitized server-side (scripts, `on*`, `javascript:`).
## [0.10.1] - 2026-10-06

### Fixed
- **Items' "Archived" state not kept**: the item editor did not load
  the flag (the checkbox always started empty) and every save sent
  `archived: 0`, wiping the state set from the list. Now the editor loads
  the real value and saves it correctly.
- The backend no longer resets the flag when a save does not include it: if the
  `archived` key is missing, the value already saved is **kept**.
- The Archive/Restore toggle in the list used a JS truthiness test that, with
  a `"0"` value (a string, as returned by some versions of PHP/PDO), never
  archived. Now `get_item`/`get_items` always return an integer and the
  toggle compares numerically.

### Added
- After archiving/restoring from the list a notice appears with a
  **Publish now** button: public lists (Collection List) are generated at
  build time, so they update on the next publish. No
  automatic republishing (so as not to publish changes that have not been confirmed yet).
## [0.10.0] - 2026-10-06 — Blog: archive, cover, list, "show all"

### Added
- **Archiving items**: every item has an **Archived** flag. An archived
  article stays published and reachable, but leaves the main list.
  The Collections section has an "archived" badge and a quick button to
  archive/restore.
- **Item Settings** in the item editor: you can finally set the **cover
  image** (with upload), **excerpt**, **date**, **status** and **Archived**.
- **Collection List** block extended:
  - **Source**: Active (not archived) / Archived only / All — a single block
    covers both the home page and the archive page (no duplicate block);
  - **Layout**: Grid (cards) or **List** (rows, ideal with many articles);
  - **Show all**: ignores the limit and shows all items (e.g. an archive page).
    The limit is still useful for "latest N" (e.g. 3 on the home page).

### Changed
- **DB migration v5**: `collection_items.archived` column. Automatic.

### Design notes
I preferred a single `COLLECTION_LIST` with a *Source* option over a separate
`ARCHIVE_LIST` block: just one block to maintain, and more flexible. Real
pagination (pages /2, /3…) remains a possible future step; with "Show all"
on a dedicated archive page the full history is accessible anyway.
## [0.9.1] - 2026-10-06 — Blog / Collections (part 2: list block)

### Added
- New **Collection List** block: lists a collection's published items
  on any page, as a grid of cards (cover, date, title, excerpt) with a
  link to the item's page. Configurable from the panel: collection, number of
  items, columns, and toggles for cover/date/excerpt. Responsive (1 column on mobile).
- The block is **dynamic**: at build time the compiler inserts the real items (sorted
  by date, published only); in the editor it shows a placeholder preview.

### Notes
- Being dynamic, it is excluded from the static parity test (like Masters).
- With this the blog is "browsable": you create the collection and its items (0.9.0) and put
  a Collection List on the home page or an archive page to list them.
## [0.9.0] - 2026-10-06 — Blog / Collections (part 1)

### Added
- **Collections**: repeatable content types (Blog, Portfolio, …) with multiple
  items. New **Collections** section in the dashboard:
  - creating/deleting collections (admin);
  - items with title, slug, excerpt, cover, date, status (draft/published), SEO;
  - every item is edited with the **same block editor** as pages.
- **Static generation of items**: every published item becomes a page
  `/<collection>/<item>/index.html`, with menu, global header/footer, OpenGraph
  meta (type=article, cover as the social image) and inclusion in the sitemap.
- Endpoints: `get_collections`, `save_collection`, `delete_collection` (admin),
  `get_items`, `get_item`, `save_item`, `delete_item`.

### Changed
- **DB migration v4**: `collections` and `collection_items` tables. Applied
  automatically (verified on new and existing DBs).
- Removed the Header/Footer buttons from the dashboard (they are now in Global Options).

### Next (part 2)
- An "item list / archive" block to place on any page (e.g. the list
  of blog posts), with cards, excerpts and links to the items.
## [0.8.1] - 2026-10-06

### Added
- In **Global Options** → "Global Header & Footer": switches to
  **enable/disable** the global header and footer (when disabled they are not
  shown on any page), plus **Edit** and **Delete** buttons for
  each. Delete removes all the blocks of that part.
- `delete_part` endpoint (empties the header or footer).
## [0.8.0] - 2026-10-05 — Global header/footer

### Added
- **Global header and footer**: two block areas (built with the same editor)
  applied automatically to **all** published pages — the header before the
  content, the footer after it, both full width.
- Dashboard: **Header** and **Footer** buttons to open them in the editor; "code"
  blocks remain reserved to admins (server-side stripping here too).
- Site export/import now also include the header and footer.

### Changed
- **DB migration v3**: new `site_parts` table (header/footer). Applied
  automatically by the migration runner (verified on new and existing DBs).
## [0.7.3] - 2026-10-05 — UI refresh (pass 2): editor

### Changed
- **Denser, more premium editor**:
  - the blocks in the add panel are now in a **2-column grid** of
    compact tiles (icon + short label), much denser and tidier than
    the full-width list;
  - narrower side panels (left 270→250, right 320→300) to give the canvas more
    room;
  - floating bar, accordions, property panel header and Save/Publish bar
    with tighter spacing;
  - less padding around the canvas (more working area).
- Shorter block labels (Section, Container, Cards, Video, Form, FAQ,
  Slider, Maps, Image…) for clarity and density.
## [0.7.2] - 2026-10-05 — UI refresh (pass 1 rev.): high density & dashboard

### Changed
- **Much higher density** across the whole admin interface: tighter container
  padding and **more compact input fields/labels** (smaller height and font)
  in the form-heavy screens (Global Options, Menu Builder,
  Property Panel, Accounts) — more information on screen on a 14" FHD display.
- **Reorganized dashboard**: the user pill (name + role) is now at the top
  left with the **Logout** button next to it; the primary actions (New Page,
  Publish All) at the top right; the secondary navigation (Templates, Media,
  Menu, Global Options, Submissions, Accounts, Export, Import) in a dedicated compact
  bar. Smaller, more elegant buttons.
- The "Account" button is now **"Accounts"**.
## [0.7.1] - 2026-10-05 — UI refresh (pass 1): density & premium

### Added
- Global UI base (`src/ui/global.css`) with a shared palette and **design tokens**,
  thin scrollbars, improved text rendering, selection and a soft entrance.
  It deliberately leaves generic elements alone so as not to alter the canvas
  preview.

### Changed
- **Reduced density** across the whole admin interface to make better use of
  small screens (14" FHD): padding of the main containers, of the dashboard
  (header, toolbar, rows), of the editor (bar, panels) and of the DOM Navigator
  slightly tighter, while keeping breathing room and readability.
## [0.7.0] - 2026-10-05 — SEO/publishing & advanced forms

### Added
- **SEO & publishing**: automatic generation of `sitemap.xml`, `robots.txt`
  and a `404.html` page on every build; per-page **OpenGraph/Twitter** meta
  (title, description, image, url, site name) and **favicon** in the `<head>`;
  `ErrorDocument` for Apache. New options in Global Options: Site URL, Site
  Name, Favicon, default social image, indexing toggle (robots).
- **Per-page social (OG) image** field in the SEO panel.
- **Advanced forms**: every submission is **stored in the database**; new
  **Submissions** section (admin) to browse them, with **CSV export** and deletion.
  Built-in **honeypot** anti-spam in the forms (bot submissions are discarded).
- Endpoints: `get_submissions`, `export_submissions`, `delete_submission`,
  `clear_submissions` (admin).

### Changed
- **DB migration v2** (the first beyond the baseline): `pages.seo_image` column and
  `form_submissions` table. Applied automatically by the migration runner
  (verified idempotent, on new and existing DBs).
- Form submissions are stored **even** if email is not configured.

### Notes
- The sitemap uses absolute URLs if you set "Site URL" in Global Options.
- Site export/import now also include `seo_image`.
## [0.6.1] - 2026-10-05

### Changed
- Removed "Pro" from the product name (login screen) and from the
  "Custom Code" label in the property panel.
- Swapped the icons of the Export/Import buttons in the dashboard.

### Added
- In the dashboard's page list, a button to **open the page in a
  new browser tab** (opens the published version).
- A small UI touch: wider actions column and hover on the page list rows.
## [0.6.0] - 2026-10-05 — Step C: templates & import/export

### Added
- **Starter templates**: new "Templates" section in the dashboard
  with ready-made pages (Blank, Landing Page, About, Contact). Choosing one
  creates a new, fully editable draft page. The templates are in
  `canvascore-admin/starters.json` (easy to extend).
- **Export site**: the admin can download a full backup of the site in a single
  JSON file (pages, menu, settings, masters, templates) + a media manifest.
- **Import site**: the admin can restore/replace the site from an export
  file (user accounts are NOT touched). The import runs in a transaction and
  applies any content migrations.
- Endpoints: `get_starters`, `export_site` (admin), `import_site` (admin).

### Notes
- Export/import cover structure and configuration. The media files in `/uploads`
  must be copied separately when moving the site to another server (the manifest
  in the export lists the referenced files). For backup/restore on the same
  server, the media stay where they are and the restore is complete.
- Export→edit→import round trip verified: the site is restored
  identically (pages, homepage, menu, settings).
## [0.5.1] - 2026-10-05

### Fixed
- **FAQ and FORM were not rendered in the editor canvas** (they appeared as
  "Unknown element") while they were correct on the compiled page: they were missing from the
  canonical JS renderer. Added and now covered by the parity test.
- **Flex Row and CSS Grid in the editor canvas**: child blocks did not
  size/align correctly. The selection/drag frame now
  carries the sizing/positioning properties (width, flex, grid, margin, ...),
  behaving like the real item, while the canonical content neutralizes them
  (no double application). Flex/grid in the editor match the site.
- **Slider in the editor canvas**: it now animates both the fade effect and the
  slide effect, driving the canonical DOM. Previously they were static in the editor.
- **DOM Navigator**: dragging downwards did not work (you could only
  drag upwards). Reordering among siblings is now directional (arrayMove),
  so it works in both directions.

### Added
- Parity test extended with FAQ, FORM and **cross cases** (Flex Row and CSS Grid
  with nested blocks inside): 23 fixtures, all green.
## [0.5.0] - 2026-10-05

### Added
- **Cross-container drag & drop**: in the canvas you can now move
  elements between different containers/sections and into the cells of CSS Grid / Simple
  Grid, as well as reorder them. Dragging a block onto an empty container
  inserts it inside; dragging it onto another block makes it that block's sibling
  in the same position.
- **Drag & drop in the DOM Navigator** (left panel): every item has a
  drag handle, with reordering and re-nesting between containers/sections.
- Unified, cycle-safe tree move (`moveBlock`): prevents moving
  a block inside one of its own descendants.

### Notes
- Move logic verified in isolation on all cases (cross-container,
  empty containers, reordering, cycle prevention, moving subtrees).
- The precision of the drop "target" in the canvas depends on dnd-kit's collision
  detection: for precise re-nesting the DOM Navigator is the handiest tool.
## [0.4.0] - 2026-10-05

### Changed
- **Phase 2 closed — editor wired to the canonical renderer.** The editor no longer has
  its own separate rendering implementation: visual items (images,
  buttons, sliders, cards, grids, icons, testimonials, videos, maps, HTML) and
  content not being edited are shown with the **same HTML as the published
  site** (`renderBlock.mjs` renderer). Containers use `blockRoot`, the single
  source shared with the compiler for the root element. React code remains only
  for inline editing (Jodit) of text blocks while they are selected.
- As a result the canvas preview matches the compiled page (including
  button alignment, slider/image aspect ratio, etc.).

### Added
- `blockRoot()` in the canonical renderer: description of a block's root
  element, shared between the editor (React) and the compiler.

### Fixed
- The parity test now normalizes styles semantically (irrelevant spacing
  around `:` and `,`), so it compares real CSS equivalence.

### Notes
- The published output (PHP compiler) does not change and is covered by the parity test
  (`npm run test:parity`), still green on all 19 blocks.
## [0.3.2] - 2026-10-04

### Fixed
- The menu's text color and hover color were not applied to the top-level
  items (only to submenus) and the hover background was never applied: a specificity
  conflict with the theme's global rules. Now the menu is **authoritative**
  (it uses !important on its own colors) and the legacy menu rules have been removed
  from the template, so the configured colors always win.
- "Logo / buttons gap": in the real menu the spacing was not applied because a
  `margin:0` on the list reset the `margin-left`. Fixed the order of the styles.

### Added
- **Authentic preview** in the Menu Builder: it is now generated by the real compiler and
  shown in an isolated iframe, so it is identical to the published menu (hover,
  effects, logo, layout). Links are made inert.
- Global settings: **"Let the menu inherit the global brand color on
  hover"** flag (default OFF). Off, the menu uses only the colors set in the Menu
  Builder; on, hover uses the global brand color.

### Changed
- Removed the legacy menu CSS rules from the template (`master.html`): all of the
  menu styling is now generated by the Menu Builder, with no conflicts.
## [0.3.1] - 2026-10-04

### Fixed
- The menu colors (text, hover text, hover background) did not change:
  they were overridden by global template rules with higher specificity.
  Now the menu rules are prefixed with `.cc-navigation` and take
  precedence.
- "Sticky" menu not working: the template's `body { overflow-x: clip }` breaks
  `position: sticky`. The sticky menu now uses `position: fixed` (with automatic
  height compensation), so it really stays at the top.
- "Glare" effect: the shine clipped the submenus at the height of the bar.
  Now the sheen is on a dedicated overlay clipped to the bar only, so dropdowns are
  no longer cut off.

### Added
- Menu Builder: the "Item border" field now has a dropdown with presets
  (none, thin, solid, dashed, dotted) in addition to the Custom option.
- Menu Builder: the "Item radius" field can be adjusted with the up/down arrow keys.
- Menu Builder: besides a URL, the logo can be uploaded directly,
  and the file ends up in the Media Manager.
- The upload endpoint returns the URL of the uploaded file.

## [0.3.0] - 2026-10-04

### Added
- Menu Builder rewritten on a **nested tree model** (children) with
  a live preview and **drag & drop** reordering among items at the same level;
  the ⇥/⇤ buttons nest/un-nest an item as a submenu.
- Menu items **without a link**: leaving the URL empty, the top-level item only opens
  its own submenu (useful when there is no page for the parent level).
- Multi-level submenus (sub-submenus too) with cascading dropdowns.
- Extended menu customization: item borders, spacing between items,
  text color, text/background color on mouse hover, bar height,
  background color with adjustable **opacity**, shadow (soft/medium/strong).
- Logo: image, height, alignment (left/right) **independent** of
  that of the buttons, with configurable spacing and the requested priority
  logic (same side = logo and buttons next to each other; opposite sides = at the edges).
- Selectable "premium" effects: animated underline, lift, glassmorphism
  (blur), glare (animated reflection).
- Dashboard: indicator of the logged-in user (name + role) at the top.

### Fixed
- Submenu bug: moving an item from one menu to another did not update the parent
  (flat model with parentId). With the new nested tree,
  reordering and nesting are consistent and persist correctly.

### Notes
- Backward compatibility: menus saved in the old flat format (parentId)
  are converted to a tree automatically, both in the editor and in the compiler.

## [0.2.1] - 2026-10-04

### Fixed
- A new user (e.g. an editor) created by the admin was not required to change
  their password at first login: now `add_user` sets `must_change_pw`, and
  a password reset by the admin (`force_password`) also forces the change at the
  user's next login.
- More robust CSRF token lifecycle across user switches: login aligns the
  double-submit cookie with the new session token and logout deletes it. This removes
  stale tokens between sessions of different users (the likely cause of POSTs
  being rejected after logging in as a different user in the same
  browser).

## [0.2.0] - 2026-10-04

### Added
- Automatic versioning: every `npm run build` increments a build number and
  stamps the date (`build`/`built` fields in version.json via `scripts/bump.mjs` +
  the `prebuild` hook). The version (build included) is shown in the panel.
- Foundations of the single rendering contract:
  - `canvascore-admin/blocks.json`: single source of truth for the block defaults
    (content + styles), consumed both by the editor (via Vite) and by PHP.
  - `src/render/renderBlock.mjs`: canonical renderer in pure JS, mirroring the
    PHP compiler.
  - Automatic parity test (`npm run test:parity`): compares the structure and
    styles produced by the JS renderer and the PHP compiler on a set of fixtures;
    it fails if they diverge.
- The editor's `addBlock` now builds blocks from `blocks.json` (no more
  duplicated, implicit defaults).

### Fixed
- ICON_BOX block: duplicated `style` attribute in the compiler (invalid HTML) that
  made the text alignment ineffective; now a single, correct attribute.
  (divergence detected automatically by the new parity test).
- Cleaned up a double `style` attribute on TESTIMONIAL too.

## [0.1.0] - 2026-10-04

First versioned release. It gathers the stabilization (Phase 0) and
security (Phase 1) work, brought to an advanced, stable and usable MVP.

### Added
- Versioning system: `version.json` as the single source of truth for the app
  version, DB schema and content schema; `?action=version` endpoint; version
  shown in the panel and injected into the frontend build; `<meta generator>`
  in the compiled pages.
- Versioned DB migration runner (`migrations.php`) with a `cc_meta` table,
  replacing the old stack of `ALTER ... try/catch` and converging both
  new and existing installations.
- Scaffold for content migrations (block format) and a
  `content_schema` column stamped on saved pages.
- Homepage management: exclusive "Set as Homepage" flag, published at the
  root whatever the slug.
- CSRF with a session token + double-submit cookie; hardened session
  (HttpOnly, SameSite=Lax, Secure over HTTPS).
- Forced password change at first login for the default admin.
- Data dir moved outside the web root (with a real write test and a
  bidirectional safety migration).
- XSS sanitization of rich-text content; "code" blocks (custom HTML/CSS)
  reserved to admins, with server-side removal for non-admins.
- Server-side registry of form recipients (`forms.json`): no more email addresses
  in the client, with per-form recipient restore.
- Auto-slug from the title for pages that have not been published yet.
- Real drag & drop of blocks (reordering among siblings at every level).

### Changed
- `api.php` and `rebuild_all.php` now use a shared module (`config.php`) for
  session, data dir, CSRF and sanitization.
- Media upload: image extension whitelist + MIME check; FPM-safe `.htaccess`
  that prevents scripts from running in `/uploads`.

### Fixed
- Publishing no longer worked (missing schema columns): the schema is now
  complete and migrated automatically.
- Draft → hidden copy → publish → discard flow aligned between frontend and
  backend.
- SQL injection in slug renaming (now a prepared statement) and path traversal
  in file generation (sanitized slug).
- Open relay in the form mailer; reflected XSS in the result message.
- Images not visible after upload (regression from `php_flag` in `.htaccess`
  on PHP-FPM).
- Saves failing with 403 on upgraded installations (fragile CSRF on the existing
  session) and the "can read but can't save" case caused by a non-writable data dir.
- Removed dead code and components that did not compile.

[Unreleased]: https://github.com/sputlab/CanvasCore/compare/v0.23.0...HEAD
[0.23.0]: https://github.com/sputlab/CanvasCore/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/sputlab/CanvasCore/compare/v0.21.1...v0.22.0
[0.21.1]: https://github.com/sputlab/CanvasCore/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/sputlab/CanvasCore/compare/v0.20.0...v0.21.0
[0.16.0]: https://github.com/sputlab/CanvasCore/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/sputlab/CanvasCore/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/sputlab/CanvasCore/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/sputlab/CanvasCore/releases/tag/v0.14.0
