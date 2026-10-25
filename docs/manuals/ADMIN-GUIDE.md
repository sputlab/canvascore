# CanvasCore Administrator Guide

This guide is for the person who installs, hosts and runs a CanvasCore site: preparing the
server, installing and updating, managing accounts, publishing, backups, forms and security.
It assumes you are comfortable with a hosting control panel, FTP/SFTP and a shell, but not
that you are a developer.

- Building and editing pages: [User Guide](USER-GUIDE.md)
- Architecture, local development, tests: [Developer Guide](DEVELOPER-GUIDE.md)

Throughout this guide, `example.com` is your domain and `/var/www/example.com/public` is the
web root (the folder the domain serves). Replace both with your own values.

**Contents**

1. [Requirements](#1-requirements)
2. [Folder layout on the server](#2-folder-layout-on-the-server)
3. [Installation](#3-installation)
4. [Web server configuration](#4-web-server-configuration) (Apache, Nginx, HTTPS, reverse proxy / CDN)
5. [Updating to a new version](#5-updating-to-a-new-version) (one-click updates, manual update, rollback)
6. [Accounts and roles](#6-accounts-and-roles)
7. [Publishing](#7-publishing) (what a publish writes, redirects, RSS, site search, cookie banner, images)
8. [Backup and restore](#8-backup-and-restore) (site backup as ZIP, restore, safety copies, server-level backups)
9. [Forms and email](#9-forms-and-email)
10. [Security](#10-security)
11. [Troubleshooting](#11-troubleshooting)
12. [Block packages and the WordPress importer](#12-block-packages-and-the-wordpress-importer) (installing packages, importing a WordPress site)
13. [License](#13-license)

---

## 1. Requirements

| Item | Requirement |
|---|---|
| PHP | **8.0 or newer** (the installer refuses older versions) |
| PHP extensions (required) | `pdo_sqlite`, `json`, `session`, `dom` (`php-xml` on some systems: rich text and SVG uploads are checked with it; without it SVGs are refused and rich text loses its links, images and formatting attributes) |
| PHP extensions (recommended) | `zip` (`ZipArchive`): needed to make and restore site backups on the Backup page (section 8); without it only old `.json` backups can be imported |
| PHP extensions (for one-click updates) | `sodium` (checks the signature of the update package), `zip` and `curl` (download), and write access to the admin folder and the web root (section 5.1). The Updates page lists what this server lacks. Without them you update by hand (section 5.2) |
| PHP extensions (optional) | `gd` **with WebP support** (`imagewebp()`), for image optimization: without it uploaded images are used as they are, with no smaller copies (section 7.7). `exif`, to turn phone photos the right way up in those copies. `mbstring`: CanvasCore has built-in fallbacks for the functions it uses, so forms, the site search and the media library work without it |
| PHP functions | `mail()` enabled, if you want form notifications by email (submissions are stored either way) |
| PHP settings | `file_uploads = On`; `upload_max_filesize` / `post_max_size` large enough for your images (backup ZIPs are uploaded in pieces, so they are not limited by these settings; old `.json` backups are sent in one piece); a `memory_limit` large enough for your photos if you want them optimized (about 5 bytes per pixel: a 12-megapixel photo needs roughly 60 MB free; larger images are skipped) |
| Web server | Apache 2.4 (with `.htaccess` enabled; `mod_alias` for real 301 redirects) or Nginx + PHP-FPM |
| HTTPS | Strongly recommended. Without it, passwords and session cookies travel unencrypted |
| To build the editor | Node.js 20 or newer and npm (on your computer, not on the server) |

The installer (`install.php`) checks the PHP version, the required extensions (including `dom`),
`zip` (a warning if missing), the writable folders, whether the data folder can be downloaded from
the web (section 2), the editor build, `mail()` and HTTPS, and shows each item as OK, warning or
failure before it lets you install. It does **not** check GD/WebP or `mbstring`: to see whether
GD can write WebP, run `php -r 'var_dump(function_exists("imagewebp"));'` with the same PHP the
site uses (or look for "WebP Support" in the `gd` section of `phpinfo()`).

---

## 2. Folder layout on the server

CanvasCore lives **inside** the site it publishes. The admin folder sits directly in the web
root, and published pages are written to the folder above it (the web root itself).

```
/var/www/example.com/
├── canvascore-data/              Data: DB, settings, sessions (NOT reachable from the web)
│   ├── canvascore.sqlite         Pages, collections, accounts, templates, masters, submissions,
│   │                             version history (page_revisions), redirects
│   ├── settings.json             Global Options
│   ├── menu.json                 Menu
│   ├── media.json                Image metadata: description (alt text), size, optimized copies,
│   │                             media library folder
│   ├── media-folders.json        Media library folders (also the empty ones)
│   ├── forms.json                Form registry (form id → recipient, field labels, success
│   │                             message), written on publish
│   ├── published_files.json      Files written by the last successful publish (pages, items,
│   │                             redirect pages, feed.xml, ...)
│   ├── login_attempts.json       Login throttling state
│   ├── rate_forms.json           Form rate-limit state
│   ├── sessions/                 PHP session files for the editor
│   ├── install-key.txt           Setup key for the installer (deleted once installed, section 3.3)
│   ├── quarantine/               SVGs uploaded before 0.14.1 that fail the current check (section 5)
│   ├── backups/                  Site backups kept on the server and safety copies (section 8),
│   │                             with its own deny-all .htaccess
│   ├── updates/                  One-click updates (section 5.1): copies of the database and of the
│   │                             code taken before each update (the newest 3 of each), the update
│   │                             history and the last check; deny-all .htaccess
│   ├── packages/                 Installed block packages (section 12.1), one folder each, and the
│   │                             list of them (index.json)
│   ├── imports/                  WordPress imports in progress or just finished (section 12.2); a job
│   │                             folder is removed when you discard it and after 7 days; deny-all .htaccess
│   └── .htaccess                 "Deny all" (safety net)
└── public/                       Web root
    ├── index.html                Home page               ┐
    ├── about/index.html          One folder per page      │
    ├── blog/my-post/index.html   Collection items         │
    ├── blog/feed.xml             RSS feed per collection  │ written by "Publish Site"
    ├── old-page/index.html       Redirect page (old URL)  │
    ├── sitemap.xml, robots.txt   SEO files                │
    ├── search-index.json         Site search data         │
    ├── 404.html                  Not-found page           │
    ├── .htaccess                 ErrorDocument 404 +      ┘ (Apache only; see 4.1)
    │                             "CanvasCore redirects" block
    ├── uploads/                  Media library (images), with its own .htaccess
    │   └── _cc/                  Optimized WebP copies (480/960/1600 px), made on upload
    ├── canvascore-blocks/        Images of the installed block packages (one folder per package),
    │                             with the same .htaccess as uploads/; a reserved address
    └── canvascore-admin/         The editor (PHP backend + built React app)
        ├── index.html, assets/   Editor build (from canvascore-frontend/dist/)
        ├── menu-preview.html     Menu Builder live preview (sandboxed)
        ├── api.php, rebuild_all.php, submit_form.php, config.php, ...
        ├── blocks/               Definitions of the blocks (settings and template, one file per block)
        ├── update.php, update-keys.php   One-click updates and the public keys of the releases
        ├── blockpkg.php, wpimport.php, roles.php   Block packages, the WordPress importer, roles and review (libraries)
        ├── .htaccess             Security headers and access rules (Apache, written automatically)
        └── version.json          Version of the installed release
```

Rules to keep in mind:

1. **Keep the folder name `canvascore-admin`.** Published forms post to
   `canvascore-admin/submit_form.php`, and that name is reserved as a URL (like `uploads`,
   `canvascore-data` and `data`, section 7.1). Renaming the folder breaks the site's forms.
2. **The admin folder must sit directly in the web root.** Publishing writes to its parent folder.
   If the site lives in a sub-path (for example `example.com/site/`), put `canvascore-admin`
   inside `site/`; links are generated relative to that path.
3. **Data directory.** CanvasCore keeps its data outside the web root whenever PHP can write
   there. A new installation uses `canvascore-data/` two levels above `canvascore-admin` (that is,
   next to the web root, outside it). If the site lives in a sub-folder of the web root
   (`example.com/site/`), that folder would still be inside the web root, so a folder next to the
   web root itself is used instead, named after the sub-folder (`canvascore-data-site/`; two sites in
   different sub-folders never share one). The web root comes from the server's `DOCUMENT_ROOT`. Only when no folder outside the web root can be written does CanvasCore fall
   back to `canvascore-admin/data/`, inside the web root, protected by a deny-all `.htaccess` on
   Apache (on Nginx, add the rules of section 4.2). The installer then tests over HTTP whether the
   folder can be downloaded, and refuses to install if it can.
   - An existing database stays where it is. If it is in `canvascore-admin/data/` and a folder
     outside the web root becomes writable later, the database and the `settings.json`,
     `menu.json`, `forms.json` files are copied there and the old database file is deleted.
     Other files are **not** moved: copy `media.json` (image descriptions and folders),
     `media-folders.json`, `published_files.json` (stale page cleanup) and the `backups/` folder
     to the new folder yourself.
   - To get the recommended layout, create the folder and give the PHP user write access:
     ```bash
     mkdir /var/www/example.com/canvascore-data
     chown www-data:www-data /var/www/example.com/canvascore-data
     chmod 750 /var/www/example.com/canvascore-data
     ```
     (`www-data` is the PHP user on Debian/Ubuntu; it may be `apache`, `nginx` or your hosting
     account user elsewhere.)
   - If your domain's web root is the account root itself, check where `canvascore-data` ends up
     and make sure it cannot be opened with a URL.
4. **Write permissions.** PHP must be able to write to the web root (published pages, feeds,
   `search-index.json`, the root `.htaccess` on Apache), to `uploads/` (including the `_cc/`
   sub-folder it creates) and to the data directory.

---

## 3. Installation

### 3.1 Build the editor (on your computer)

1. Get the release source and open a terminal in `canvascore-frontend/`.
2. Run:
   ```bash
   npm install
   npm run build
   ```
   The build writes the editor into `canvascore-frontend/dist/` and increments the build number
   in `canvascore-admin/version.json` (via `scripts/bump.mjs`). Always upload that
   `version.json` together with the build.

### 3.2 Upload

1. Upload the whole `canvascore-admin/` folder into the web root, keeping its name:
   `/var/www/example.com/public/canvascore-admin/`.
2. Copy the **contents** of `canvascore-frontend/dist/` (`index.html`, `assets/`, icons, `menu-preview.html`) into
   that same `canvascore-admin/` folder.
3. Create the data folder outside the web root as shown in section 2 (recommended).
4. Make sure PHP can write to the web root and to `uploads/` (it is created on first upload).

### 3.3 Run the setup wizard

1. Open `https://example.com/canvascore-admin/install.php`.
2. Review the requirements list. Failures (red) must be fixed before you can continue: for
   example a missing `dom` extension, a data folder PHP cannot write, or a data folder inside the
   web root that **can be downloaded** by anyone (the installer writes a random test file there and
   requests it from the server itself). Warnings (for example "Data folder inside the web root"
   when it is protected or could not be checked, "mail() unavailable", "Not using HTTPS") let you
   install but should be fixed soon.
3. **Setup key.** The wizard writes a random key to `install-key.txt` in the data folder (the
   page shows the folder's path). Open that file with your hosting file manager or FTP/SFTP and
   paste its content into the **Setup key** field. This proves you have access to the server's
   files, so nobody who finds a freshly uploaded site can install it before you.
4. Fill in the form:
   - **Site name** (up to 120 characters) and **site address** (for example
     `https://www.example.com`; used for the sitemap, `robots.txt` and social sharing tags).
   - **Administrator username**: 3–32 characters, letters, digits, `.`, `-`, `_`, `@`. The field
     starts empty: choose a name that is hard to guess, not `admin`.
   - **Password**: at least 8 characters, not `admin` and not equal to the username.
   - **Email for forms** (optional): the default recipient of form submissions.
   - **Starter** (optional): creates a homepage from a template, saved as a **draft**.
5. Submit. The wizard creates the database and your administrator account, saves the settings,
   deletes `install-key.txt` and signs you in to the editor. Only one installation can run at a
   time; if something fails, the page says so and the details are in the server error log
   (prefix `CanvasCore install:`).
6. **Delete `install.php`.** The wizard offers a button for it. If the automatic deletion fails,
   remove the file by FTP/SSH. Once the site is installed the wizard locks itself anyway (it
   only offers to delete itself), but it should not stay on the server.

### 3.4 No default account

There is no default login: the first account is the one you create in the wizard. If you open
`https://example.com/canvascore-admin/` before running it, the sign-in screen says
"CanvasCore is not set up yet" with a link to `install.php`, and the API answers everything except
the sign-in screen's own checks with HTTP 503 (`not_installed`).

### 3.5 After installation

1. In **Global Options**, check the site address (needed for RSS feeds and canonical links),
   the form emails and the session timeout, and set the **Favicon** (it is also shown as the
   logo on the sign-in screen and in the admin sidebar). If the site is behind a reverse proxy or CDN, fill
   in **Trusted proxy addresses** (section 4.4). Turn on the **Cookie banner** if the site needs
   one (section 7.6).
2. Build your homepage, mark it as Home and click **Publish Site**.
3. Open `https://example.com/` and check that the page and `https://example.com/sitemap.xml` load.
4. Make a first backup from the **Backup** page (section 8.1) and set up a server-level backup
   (section 8.3).

---

## 4. Web server configuration

### 4.1 Apache

CanvasCore writes its own `.htaccess` files; they work only if Apache reads them
(`AllowOverride All` for the site directory is the simplest setting).

| File | Written when | Content |
|---|---|---|
| `canvascore-data/.htaccess` and `canvascore-admin/data/.htaccess` | on every request, if missing or changed | Deny all access |
| `backups/.htaccess` in the data directory | whenever the Backup page uses the folder | Deny all access |
| `canvascore-admin/.htaccess` | on every request to `api.php` or `install.php`, if missing or changed (only while it is CanvasCore's own file) | Security headers for everything in the admin folder, including the editor page (`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`; needs `mod_headers`), except `menu-preview.html`, which the editor frames itself (`SAMEORIGIN` / `frame-ancestors 'self'`). Denies the library files `config.php`, `compiler.php`, `migrations.php`, `media.php`, `backup.php` and any `.json`, `.md`, `.sqlite`, `.log`, `.zip`, `.part`, `.lock` file |
| `canvascore-blocks/.htaccess` | when a block package with images is installed | The same rules as `uploads/.htaccess` (no scripts; the images are the package's own) |
| `uploads/.htaccess` | on every image upload (and restore), if missing or changed | Deny `.php`, `.phtml`, `.phar`, `.php3`–`.php7`, `.phps`, `.pht`, `.cgi`, `.pl`, `.py`, `.sh`; `php_flag engine off` under mod_php; `X-Content-Type-Options: nosniff`; for `.svg`, the header `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; sandbox` (needs `mod_headers`) |
| `.htaccess` in the web root | on every publish | Created with `ErrorDocument 404 /404.html` (with the site's base path) if it does not exist. On every publish CanvasCore rewrites **only** the block between `# BEGIN CanvasCore redirects` and `# END CanvasCore redirects` (one `Redirect 301 /old/ /new/` line per redirect, inside `<IfModule mod_alias.c>`); the block is removed when there are no redirects |

If you already have a root `.htaccess` (HTTPS rules, your own redirects), CanvasCore keeps
everything outside its marked block as it is; it does not add the `ErrorDocument` line to an
existing file, so add `ErrorDocument 404 /404.html` yourself. Do not edit inside the marked
block: it is replaced on the next publish. Manage redirects in Global Options › Redirects
instead (section 7.4).

`canvascore-admin/.htaccess` is kept up to date while it is CanvasCore's own (its first line is
`# CanvasCore: written automatically…`). If you replace it with a file of your own (for example to
add HTTP basic auth), CanvasCore leaves it alone: copy CanvasCore's rules into it, or the security
headers and deny rules are lost. Whatever the server, the library files (`config.php`, `compiler.php`,
`migrations.php`, `media.php`, `backup.php`, `publish.php`, `blockdef.php`, `blockpkg.php`, `wpimport.php`, `roles.php`, `update.php`, `update-keys.php`) answer 404
when opened directly.

### 4.2 Nginx

Nginx ignores `.htaccess` files, so the same protections must go into the server block.
A complete example for PHP-FPM:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;
    root /var/www/example.com/public;
    index index.html index.php;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 20m;            # image uploads; backup ZIPs are sent in pieces of up to 8 MB

    # Data folders, should they ever be inside the web root (at any depth)
    location ~ /canvascore-data(/|$) { deny all; return 404; }

    # Hidden files (.htaccess, .cc_wtest_*)
    location ~ /\. { deny all; return 404; }

    # Admin: security headers, no access to the data fallback, library files and JSON
    location ^~ /canvascore-admin/ {
        add_header X-Frame-Options "DENY" always;
        add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "same-origin" always;

        location ^~ /canvascore-admin/data/ { deny all; return 404; }
        location ~ /\. { deny all; return 404; }
        location ~ ^/canvascore-admin/(config|compiler|migrations|media|backup|publish|blockdef|blockpkg|wpimport|roles|update|update-keys|update-source)\.php$ { deny all; return 404; }
        location ~ ^/canvascore-admin/([^/]+/)?[^/]+\.(json|md|sqlite|log|zip|part|lock)$ { deny all; return 404; }

        # The Menu Builder's live preview is framed by the editor itself
        location = /canvascore-admin/menu-preview.html {
            add_header X-Frame-Options "SAMEORIGIN" always;
            add_header Content-Security-Policy "frame-ancestors 'self'; base-uri 'none'; object-src 'none'" always;
            add_header X-Content-Type-Options "nosniff" always;
            add_header Referrer-Policy "same-origin" always;
        }

        location ~ \.php$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/run/php/php8.3-fpm.sock;   # adjust to your PHP version
        }
    }

    # Uploads: never execute scripts, no MIME sniffing, and sandbox SVGs
    location ^~ /uploads/ {
        add_header X-Content-Type-Options "nosniff" always;
        location ~* \.(php|phtml|phar|php[3-7]|phps|pht|cgi|pl|py|sh)$ { deny all; return 404; }
        location ~* \.svg$ {
            add_header X-Content-Type-Options "nosniff" always;
            add_header Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; sandbox" always;
        }
    }

    # Images of block packages (0.22.0): the same rules as uploads
    location ^~ /canvascore-blocks/ {
        add_header X-Content-Type-Options "nosniff" always;
        location ~* \.(php|phtml|phar|php[3-7]|phps|pht|cgi|pl|py|sh)$ { deny all; return 404; }
        location ~* \.svg$ {
            add_header X-Content-Type-Options "nosniff" always;
            add_header Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; sandbox" always;
        }
    }

    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;   # adjust to your PHP version
    }
}

server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}
```

The `^~` prefix makes the admin and uploads blocks win over the server-level `\.php$` location,
so a script uploaded under another name can never reach PHP-FPM; that is also why the admin
block has its own `\.php$` location. Inside a block, regular-expression locations are tried in
order, so keep the deny rules above it. `add_header` inside a `location` replaces the headers of
the outer block, which is why the preview's block repeats all four. If the site lives in a
sub-folder (`example.com/site/`), prefix the paths: `/site/canvascore-admin/`, `/site/uploads/`,
`/site/canvascore-blocks/`. **Updating from before 0.22.0:** add the `canvascore-blocks` block and
`blockpkg|wpimport|roles` to the library-file rule shown above (one-click updates do not change your server configuration).

**Redirects on Nginx.** Nginx ignores the `.htaccess` block of 301s. The old addresses still
work, because publishing also writes a small redirect page at each old address (it sends the
browser on at once and tells search engines the new address with a canonical link), but they
answer `200` instead of a permanent `301`. To give search engines real 301s, copy the list from
Global Options › Redirects into the server block, one line per redirect, and reload Nginx:

```nginx
    location = /old-page/          { return 301 /new-page/; }
    location = /blog/old-post/     { return 301 /blog/new-post/; }
```

Repeat this when the list changes (renaming a published page or item adds a redirect). An exact
`location =` match wins over `location /`, so the redirect page on disk is never reached.

### 4.3 HTTPS

1. Install a certificate (Let's Encrypt or your host's panel) and redirect HTTP to HTTPS.
2. Behind a proxy or load balancer that terminates TLS, make sure it sends
   `X-Forwarded-Proto: https` (or `X-Forwarded-SSL: on`) and list its address in Trusted proxy
   addresses (section 4.4): CanvasCore uses the header to mark the session cookie `Secure`, and
   believes it only from a listed proxy.
3. Set the site address in Global Options to the `https://` URL and publish again, so the
   sitemap, canonical links, RSS feeds and sharing tags use it.

### 4.4 Behind a reverse proxy or CDN

Behind a reverse proxy, load balancer or CDN (Cloudflare, a Docker/Kubernetes ingress, an Nginx
in front of Apache…), every request reaches PHP from the proxy's address. Login throttling and
the form rate limit would then count all visitors as one: one person's wrong passwords could
lock an account for everybody, and 8 messages from anyone would block the site's forms.

Fix it in **Global Options › Security › Trusted proxy addresses** (admins): enter the IP
addresses the proxy connects from, separated by commas (for example `10.0.0.2, 10.0.0.3`).
Only valid IP addresses are kept; ranges (CIDR) are not accepted, so list each address.

- When a request comes **from a listed address**, CanvasCore reads `X-Forwarded-For` and uses
  the nearest address in it that is not a listed proxy as the visitor's address.
- From any other address, `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-SSL` are
  ignored, so a visitor cannot fake their address or the connection's security by sending them.
- Leave the field empty when nothing sits in front of the server.

Make sure the proxy sets (or appends to) `X-Forwarded-For`.

---

## 5. Updating to a new version

There are two ways: the **one-click update** from the editor (section 5.1, from 0.21.0 on) and the
**manual update**, uploading the new files yourself (section 5.2). Either way the frontend (editor
build) and the PHP files form **one release**: they are always installed together. An editor build
talking to older PHP files (or the reverse) can fail in unexpected ways.

### 5.1 One-click update (Administration › Updates)

**Updates** in the sidebar (admins only) checks the latest CanvasCore release on GitHub and
installs it.

1. **Check for updates** shows the latest release: its version, size and release notes. A release
   that is not newer than the installed version is never offered, so an update can't go back to an
   older one.
2. **Update to …** asks for confirmation, then does the following. Keep the page open: it takes
   about a minute, and the page lists each step as it is done.
   1. Downloads the release package (`canvascore-<version>.zip`) and its signature
      (`canvascore-<version>.zip.sig`) over HTTPS, from GitHub's own addresses only (every redirect
      is checked), within a size limit.
   2. **Checks the signature.** Releases are signed with the CanvasCore release key (Ed25519). The
      public key is in `canvascore-admin/update-keys.php`. A package that was not signed with it,
      or was changed after signing, is refused and nothing is installed.
   3. Checks the package: every file belongs to `canvascore-admin/`, no file path goes outside it,
      no links, nothing for your data folder, the files an installation needs are all there, and
      its `version.json` is the release's version.
   4. **Takes a backup**: a safety copy of the content (listed on the Backup page), a copy of the
      database and a copy of the current code, the last two in the `updates/` folder of the data
      directory (the newest 3 of each are kept).
   5. Unpacks the new version next to the admin folder, checks that its PHP files can be read, and
      swaps the two folders. Your data folder (if it is inside the admin folder), the admin
      folder's own `.htaccess` and `update-source.php` come along.
   6. Calls the new version once, with a one-time token. It opens the database, runs its
      migrations (section 5.2, step 6) and answers with its version.
   7. **Rolls back if any step after the swap fails**: the previous folder and the database copy
      are put back, and the page says what went wrong. Nothing of the failed version stays on the
      site.
3. When it says **updated**, click **Reload the editor** and **Publish Site** (section 5.2, step 9).

The page also shows what this server needs (the PHP `sodium`, `zip` and `curl` extensions, write
access to the admin folder and the web root, and 300 MB of free disk space) and the **history** of
the updates made from here, with the ones that were rolled back.

Things to know:

- **Files you added yourself** inside `canvascore-admin/` are not carried over: only the data
  folder, `.htaccess` and `update-source.php` are. They stay in the code copy in `updates/`.
- **Other people in the editor** should save their work first: the editor is replaced while it
  runs. Everyone reloads afterwards.
- **A server that can't call itself** (for example one that blocks requests to its own address, or
  an admin folder behind a password): the update still installs, but step 6 is skipped, so the new
  version finishes its migrations on the first request after the update, and there is no automatic
  rollback for a failure then. Use the copies in `updates/` (below) if that happens.
- **A demo site** (with `demo.json`) can't be updated from the page.
- **The first update from 0.20.0 or earlier is manual** (section 5.2): those versions don't have
  the Updates page yet.
- **Releases without a signed package** (only the source code) can't be installed from the page:
  the page says so, and you update by hand.
- `update-source.php` (not part of a release) can point the page to another release feed (a mirror,
  or a test); it is described in the Developer Guide.

**Going back by hand.** If an update could not be rolled back, or you want the previous version
again: in the data folder, `updates/` holds `code-<version>-<date>-<id>.zip` (the previous
`canvascore-admin/` folder, without its data folder) and `db-<version>-<date>-<id>.sqlite` (the
database before the update). Unpack the code zip over `canvascore-admin/` (delete the new files
first), put the database copy in place of `canvascore.sqlite` while no one is using the editor,
and reload. A database that a newer version already migrated can't be used by the older code,
so always restore both together. The Backup page's safety copy restores the content on its own.

### 5.2 Manual update

1. **Back up first**: download a site backup from the Backup page (section 8.1), or, better
   before an update, copy the data directory, `uploads/` and the site files (section 8.3).
2. On your computer, build the new release: `cd canvascore-frontend && npm install && npm run build`.
3. Upload the new `canvascore-admin/` files, overwriting the old ones (`*.php`, `*.json`,
   `master.html`, `effects.css`, `version.json`, and the `blocks/` folder, new in 0.21.0; `blockpkg.php` and
   `wpimport.php` are new in 0.22.0).
   - **Do not** delete or overwrite `canvascore-admin/data/` if your data lives there.
   - **Do not** touch `uploads/` or `canvascore-data/`.
4. Copy the contents of the new `dist/` into `canvascore-admin/`. You can delete the old
   `canvascore-admin/assets/` folder first; the new `index.html` points to the new files.
5. Delete the `install.php` that came with the release (it is locked on an installed site, but
   should not stay on the server).
6. Open the editor. **Database migrations run automatically** on the first request: each
   pending schema step is applied in order, in a transaction, and recorded in the `cc_meta`
   table (key `db_schema`). There is nothing to run by hand. The current schema is **15**
   (`db_schema` in `version.json`); the most recent steps are:

   | Migration | Adds |
   |---|---|
   | 6 | `page_revisions` table: version history of pages and collection items (section 7.8) |
   | 7 | `redirects` table (old addresses → new ones, section 7.4) and the `pages.noindex` column ("Hide this page from search engines") |
   | 8 | Security (0.14.1): the `admin.session_gen` column (section 6), user names unique regardless of case (when no two existing names differ only in case), the old default `admin`/`admin` account deleted once another account exists (a site set up before the wizard then counts as installed), and the rich text already stored cleaned like new saves |
   | 9 | Custom fields per collection: `collections.fields` and `collection_items.field_values` |
   | 10 | Structured data per collection: `collections.schema_json` |
   | 11 | One design per collection: `collections.design_json` |
   | 12 | Categories and tags: `collection_taxonomies`, `collection_terms` tables and `collection_items.terms_json` |
   | 13 | Listing and archive pages: `collections.archive_json` (page size and archives) |
   | 14 | Scheduled publishing: `publish_at` and `unpublish_at` on pages and items (section 7.9) |
   | 15 | Roles and review (0.23.0, section 6.6): `created_by` and the review columns (`review_state`, `review_note`, `review_by`, `review_at`, `reviewed_by`) on pages and items, `collections.access_json`; existing pages get their author as creator |

   0.23.0 adds migration 15 (the schema becomes 15); nothing else needs doing by hand. Existing accounts keep their role (admin or editor). New in 0.22.0: the `packages/` and `imports/`
   folders of the data directory and the `canvascore-blocks/` folder of the site are created when first
   used (section 12), and the Nginx rules of section 4.2 gain `canvascore-blocks` (Apache writes its
   own rules).

   Back up the data directory before updating: a migration cannot be undone by installing the
   older release again. (The one-click update does it for you, section 5.1.)
7. Ask everyone to **reload any open editor tabs** (a hard refresh, Ctrl/Cmd+Shift+R). A tab
   opened before the update still runs the old editor.
8. Check the version at the bottom of the sidebar: `CanvasCore v0.14.1 · build 29` (example).
   The version is shown only to signed-in users (sidebar and About).
   If an orange line says `Editor vX / server vY: reload the page after updating`, the browser
   is still running the old editor: reload it. If the warning persists after a reload, the new
   `dist/` was not uploaded (or a cache/CDN is serving the old `index.html`).
9. Click **Publish Site** so every page is regenerated with the new release. Published pages
   carry `<meta name="generator" content="CanvasCore">` without a version number, so check the
   version in the editor, not in the pages.
10. Optional, after updating from a release without image optimization: in **Media**, click
    **Optimize N older images** to make the smaller copies of the images uploaded before
    (section 7.7), then publish again so pages get the `srcset`.

**Updating from 0.14.0 or earlier to 0.14.1** (security release). Besides the steps above:

- The PHP `dom` extension is now required (section 1).
- Everyone signs in again once: the session cookie is now called `CCSESSID`.
- If the site still had only the old default `admin`/`admin` account, the editor now says
  "CanvasCore is not set up yet": upload `install.php` again and run it with the setup key
  (section 3.3). Otherwise the `admin`/`admin` account, if present, is deleted.
- On the first request, SVG images uploaded earlier that fail the stricter check are moved from
  `uploads/` to `quarantine/` in the data directory (each one is logged in the server error log).
  Pages that used them show a missing image: export those files again as plain SVG or PNG and
  upload them.
- On Nginx, add the new rules of section 4.2 (admin security headers, library files, data
  folders). On Apache, `canvascore-admin/.htaccess` and the new `uploads/.htaccess` are
  written automatically at the first request to the editor.
- A site in a sub-folder of the web root (`example.com/site/`) keeps its data where it is: in
  `canvascore-data/` next to the site folder, which is inside the web root. On Apache its
  deny-all `.htaccess` protects it; on Nginx add the `canvascore-data` rule of section 4.2. To
  move it out, copy the whole folder next to the web root with the sub-folder's name (for
  `example.com/site/`: `/var/www/example.com/canvascore-data-site`, if the web root is
  `/var/www/example.com/public`), make it writable by PHP and delete the old one: an existing
  database there is found first.
- Publish the site (step 9): the form registry then lists each form's fields and success message
  (section 9).

What changed in each release is listed in `docs/CHANGELOG.md` and in the release notes on
GitHub Releases.

---

## 6. Accounts and roles

Accounts are managed in **Accounts** (admins only): add an account with its role, change a role at any time from the menu in the list
(you cannot take the admin role from yourself, and the last admin can never be changed), reset a password or delete an account.
There are four roles:

| | Admin | Editor | Reviewer | Author |
|---|---|---|---|---|
| Sees | everything | all content | all content | only their own pages and items |
| Creates pages and items | yes | yes | no | yes |
| Edits | everything | all content | all content | their own, until published (items) |
| Publishes | yes | yes | only what was submitted (approving it), and Publish Site | no: submits for review |
| Menu, Global Options, templates, masters, media management | yes | yes | no | no |
| Accounts, backups, updates, code, collections setup | yes | no | no | no |

**Admin**: full access.

**Editor**: can edit and publish pages, collection items, menu, media, templates, masters,
header/footer and most Global Options, and can run Publish Site. Editors **cannot**:

- see or manage **Accounts** (list, add, delete, reset passwords);
- use **Backup** (make, download, restore or delete site backups);
- see, export or delete form **Submissions**;
- create, rename or delete **collections** (they can add, edit, move, archive and delete the
  items of existing ones);
- define a collection's **fields**, its **design**, its **structured data**, its **categories and tags** and its **listing
  and archive** settings (Collections › Fields, Design, Categories & tags, Listing & archives);
- add or change **code**. Custom HTML blocks and a block's custom CSS/JS stay **exactly as an
  admin saved them** when an editor saves the page, item, header/footer, master or template
  (matched by block id on the server); an editor can only move or delete those blocks. Custom
  HTML is shown read-only to editors, the custom code fields of the Advanced tab are hidden, and
  code an editor tries to add is dropped;
- see or change a **Form block's own receiving email**: the field is hidden for editors and
  the server keeps the value the admin saved;
- see or change the **form email settings** (default recipient, From address, subject), the
  **session timeout** or the **trusted proxy addresses**: the server does not send these values
  to an editor, and when an editor saves Global Options those fields keep their current values;
- add, change or remove **redirects** (Global Options › Redirects is shown to admins only;
  renaming a page or item still adds its redirect automatically).

**Reviewer** and **author** work inside a review flow (section 6.6): authors write and submit, reviewers approve or send back. Both have
the editor's limits above, and in addition cannot change what belongs to the whole site: the menu, Global Options, templates, masters,
header and footer, redirects, or manage the media library (they can upload images and add them by address and set an image's
description); and they cannot bulk-edit, archive or schedule items. A reviewer deletes nothing; an author deletes only their own
pages and items that were never published.

The role is read from the database on every request, and a session ends at its next request
when its account is deleted or its password is reset or changed elsewhere. Sessions also end
after the inactivity timeout (section 10) and, at the latest, **7 days** after signing in.

Usernames have 3–32 characters (letters, digits, `.`, `_`, `-`, `@`) and are unique regardless
of case: `Anna` and `anna` are the same account, and either spelling signs in.

### 6.1 Change your own password

Every user, whatever the role, can change their own password: click the **key icon** next to
Logout in the sidebar, enter the **current password** and the new one twice (8 or more
characters, not `admin`, not your username, and different from the current one). The current
password is required for every voluntary change, and wrong ones count like wrong sign-ins
(section 10). Only the forced change right after signing in (new account, reset) asks for the
new password alone; until it is done the server refuses everything else for that account.
Changing your password signs your account out in every other browser; the one you are using
stays signed in.

### 6.2 Add a user

1. Go to **Accounts**.
2. Enter a username (see the rules above), a temporary password (**at least 8 characters**: the server refuses
   shorter ones) and the role (Administrator, Editor, Reviewer or Author: the page explains the one chosen), then add the account.
3. Give the credentials to the person through a safe channel. At their first sign-in they must
   choose a new password (8 or more characters).

The role can be changed later from the menu in the Accounts list; it applies at the person's next request. You cannot take the admin role
from yourself, and the last administrator cannot be changed.

### 6.3 Reset a password

1. In **Accounts**, choose the password action on the user's row.
2. Enter the new password twice (at least 8 characters).
3. The account is signed out everywhere at once. The user signs in with the new password and
   is asked to choose a new one immediately.

This is for other accounts: to change your own password, use section 6.1.

### 6.4 Delete a user

1. In **Accounts**, click delete on the row and confirm.
2. The person can no longer sign in, and any session they have open ends at its next request;
   the pages they wrote stay.

You cannot delete your own account, and the last admin account cannot be deleted.

### 6.5 Lost the only admin password

There is no "forgot password" email. With shell access to the server:

```bash
cd /var/www/example.com/canvascore-data          # or public/canvascore-admin/data
cp canvascore.sqlite canvascore.sqlite.bak
HASH=$(php -r 'echo password_hash("Temporary-Pass-2026", PASSWORD_DEFAULT);')
sqlite3 canvascore.sqlite "UPDATE admin SET password_hash='$HASH', must_change_pw=1, session_gen=session_gen+1 WHERE username='yourname';"
```

Replace `yourname` with the actual username (`session_gen` signs out any open session). Sign in with the temporary password and choose a new one.

---

### 6.6 Review and per-collection access

**Review.** An author finishes a page or an item and clicks **Submit for review** (with an optional note; the page is saved first). It is
then *waiting for review*: the author cannot change it (they can withdraw it). Reviewers, editors and admins see it under **Reviews**; an
author's own page of the same name is **My submissions**. The reviewer opens it (and may edit it), then either

- **Approve & publish**: the reviewer's Publish button; it approves the submission and publishes it (a reviewer's Publish only works on a
  submitted page or item; editors and admins can publish anything and keep their normal Publish button), or
- **Send back…** with a note: the author sees the note on the page and in My submissions, changes it, and clicks **Submit again**.

The review state belongs to the page (to its draft copy, for a published page being changed) or item and is cleared when it is published; the
person who approved it is kept. Everything goes through the same server checks as before: a role's limits are enforced by the server, not
only hidden in the editor. Published **items** are edited in place (they have no draft copy), so an author cannot change one: an editor does.
Pages made before 0.23.0 keep their author as creator; items made before it have no recorded creator, so only editors and admins change them
and authors do not see them.

**Who can work in a collection.** In Collections › *Who can work here* an admin limits a collection to **selected people** (admins always have
access). Anyone else, whatever their role, does not see the collection, its items or its categories and tags, cannot save items in it, and bulk
actions skip it. The published site is not affected: this is about who edits.

## 7. Publishing

CanvasCore stores everything in the database; visitors only ever see the static HTML files
produced by publishing.

- **Publish** (in the page editor) saves the page as published **and then rebuilds the whole
  site**.
- **Publish Site** (sidebar) rebuilds the whole site from what is currently published. Saving
  Global Options or the menu, or restoring a backup, also triggers it.
- **Save Draft** never changes the live site. Editing a published page keeps the live version
  online until you publish again.

### 7.1 What a publish writes

| Output | Path |
|---|---|
| Home page | `index.html` in the web root (the page marked Home; without one, a page with slug `index` or `home`) |
| Every other published page | `<slug>/index.html` |
| Every published collection item | `<collection-slug>/<item-slug>/index.html` |
| RSS feeds | `<collection-slug>/feed.xml` for each collection with published, non-archived items (newest 50); only when the site address is set (section 7.5) |
| Redirect pages | `<old-address>/index.html` for each redirect (section 7.4) |
| Site search data | `search-index.json` in the web root (section 7.5) |
| Sitemap | `sitemap.xml` (published pages and items, except pages hidden from search engines; absolute URLs if the site address is set) |
| Robots | `robots.txt` (`Allow: /` or `Disallow: /` per Global Options, plus the `Sitemap:` line if the site address is set) |
| Not-found page | `404.html` |
| Apache rules | `.htaccess` in the web root: created with the 404 rule if it does not exist; its "CanvasCore redirects" block rewritten every time (section 4.1) |
| Form registry | `forms.json` in the data directory |
| Manifest | `published_files.json` in the data directory |

Every page and item also gets, in its HTML:

- a **canonical link** (`<link rel="canonical">`) to its own address, when the site address is
  set;
- `<meta name="robots" content="noindex">` for pages marked **Hide this page from search
  engines** (Page Settings). Those pages are also left out of `sitemap.xml` and of the site
  search; the 404 page is always `noindex`;
- the links announcing the RSS feeds;
- the **cookie banner**, when it is turned on (section 7.6);
- for uploaded images, a `srcset` of the optimized copies, lazy loading and async decoding
  (section 7.7).

A URL can belong to only one live page or collection: publishing a page on a URL already in use
is refused with a message. CanvasCore's own folders are **reserved**: `canvascore-admin` (and the
admin folder's actual name), `uploads`, `canvascore-data` and `data` can't be used by a page (not
even a draft), a collection or a redirect. Publishing never writes into or deletes from them; a
page or collection that has such an address anyway (for example from an old database) is skipped
with a warning.

Every page, feed and data file the publisher writes stays inside the site folder, with a plain
name (`.html`, `.xml`, `.json` or `.txt`); anything else counts as a file that could not be
written.

The Google Fonts link on every page loads the site font and each font chosen for a text style (Global Options › Text styles). Visitors' browsers therefore need access to `fonts.googleapis.com`, as before.

Items of a collection with a **design** (Collections › Design) are built from that design, so publishing the site also
publishes the design. Each collection also publishes its **listing** (`/<collection>/`, paginated), its **year and month
archives**, its **filter archives** (one per choice of a choice field), its **sorted listings** and the pages of its **categories
and tags** (`/<collection>/<taxonomy>/<term>/`), all in the sitemap; the archives are switched on and sized in Collections › Listing & archives. An item page of a collection with **structured data** carries a `<script type="application/ld+json">`
block (schema.org Product, Event or Person) built from the item's values.

### 7.2 Removal of stale pages

After a fully successful publish, CanvasCore compares the files it just wrote with the
manifest of the previous publish (`published_files.json`) and deletes the `index.html` of pages
that are no longer published (deleted, unpublished, renamed, deleted collection items, removed
redirects) and the `feed.xml` of collections that no longer have a feed, plus the folders left
empty. It only ever deletes files that a previous publish wrote, and never the root
`index.html`. Files you placed in the web root yourself are never touched.

If any file could not be written, nothing is removed and the manifest is not updated, so the
next successful publish cleans up.

**Deleted collections and items go offline at once.** Deleting a published collection item, or
a whole collection, removes its pages (and the collection's `feed.xml`) immediately, without
waiting for a publish, together with the folders left empty. Only files listed in the manifest
(plus the item's own `index.html` or the collection's `feed.xml`) are removed, and they are
dropped from the manifest. An item's page is kept if another published item of the collection
owns the same address. Lists, the site search and the sitemap still change only at the next
publish.

### 7.3 Results and errors

- Success: `Build successful: N pages published.` (plus `N old page(s) removed.` when relevant).
  A trailing `Warning: Feeds: …`, `Collections: …` or `Redirects: …` means that part of the
  build failed while the rest was published; the details are in the message.
- `Publish incomplete: N file(s) could not be written (check the folder permissions on the server), e.g. about/index.html.`
  This also covers `sitemap.xml`, `robots.txt`, `404.html`, feeds, `search-index.json` and
  `forms.json`. See section 11.
- `Not published: "Title" uses the reserved address /uploads/` (or a collection) and
  `Skipped an invalid redirect.` appear among the warnings (sections 7.1 and 7.4).
- `Publishing failed because of a server error. Details are in the server error log.` /
  `Database not found.` / `master.html missing!`: see section 11.

Publishing only accepts a POST with the session's security token: a link or another website
cannot trigger it.

### 7.4 Redirects

When a **published** page or collection item gets a new address (slug), CanvasCore records a
redirect from the old address to the new one (the same happens for every published item when
an admin changes a collection's address, and for published items moved to another
collection), so links and search results keep working. Links
to it inside pages, items, header/footer, masters and the menu are also updated. Admins see the
list in **Global Options › Redirects** ("automatic" or "added by hand") and can add their own
(old address such as `/old-page/`, new address such as `/new-page/` or a full `https://…`) or
remove one.

- Chains collapse (A → B then B → C becomes A → C) and loops are avoided. The home page and
  CanvasCore's reserved folders (section 7.1) cannot be redirected. A full address must be
  `http(s)://…` without spaces, line breaks or backslashes.
- Redirects are checked again at every publish (an invalid one is skipped with a warning) and
  when a backup is restored (invalid ones are dropped).
- Publishing a page or item at an old address cancels its redirect.
- Redirects take effect at the next publish. Each one becomes:
  - a small **redirect page** at the old address (`old-page/index.html`), which works on every
    host: it forwards the browser at once (keeping `?query` and `#anchor`), is marked `noindex`
    and points search engines to the new address with a canonical link;
  - on **Apache**, a real **`301`** in the marked block of the root `.htaccess` (section 4.1),
    which answers before the redirect page is reached;
  - on **Nginx**, add the 301s by hand if you want them (section 4.2).
- Removing a redirect deletes its redirect page at the next publish; the old address then
  answers "not found".

Redirects are included in site backups (section 8.1).

### 7.5 RSS feeds and site search

- **RSS**: each collection with published, non-archived items gets
  `https://example.com/<collection-slug>/feed.xml` (RSS 2.0, newest 50 items, with excerpt and
  cover image), announced in the head of every page. Feeds need absolute addresses, so they are
  written **only when Global Options › Site address is set**.
- **Site search**: the Site Search block reads `search-index.json` in the web root, rebuilt at
  every publish with the titles, descriptions and text of published pages and non-archived
  items (pages hidden from search engines are left out). It reflects the site as of the last
  publish.

### 7.6 Cookie banner and consent

Global Options › **Cookie banner**: turn it on and set the text, the Accept/Decline labels, an
optional link to the privacy policy page and the position (bottom centered, bottom left, bottom
right). It is added to every published page (and to `404.html`) at the next publish. The
visitor's choice is stored in their browser (`localStorage`, key `cc_consent`) and the banner
is not shown again.

The banner does not block anything by itself: scripts and embeds that need consent must be
written so that they wait for it. An admin can do this in a Custom HTML block:

```html
<!-- runs only after the visitor clicks Accept (and on later visits once accepted) -->
<script type="text/plain" data-cc-consent>
  /* tracking or marketing code */
</script>
<script type="text/plain" data-cc-consent src="https://analytics.example/tag.js"></script>

<!-- the embed loads only after Accept -->
<iframe data-cc-consent-src="https://www.youtube-nocookie.com/embed/VIDEO_ID"></iframe>

<!-- any element with this attribute shows the banner again, e.g. in the footer -->
<a href="#" data-cc-consent-open>Cookie settings</a>
```

Pages also get `window.ccConsent` (`"granted"`, `"denied"` or `null`) and a `cc-consent` event
on `document` for scripts of your own. Whether your site needs a banner, and what it must say,
depends on the law that applies to you; CanvasCore only provides the mechanism.

### 7.7 Images

- **On upload**, every JPG, PNG and WebP photo gets smaller **WebP copies** 480, 960 and
  1600 px wide (never wider than the original; phone photos turned upright when `exif` is
  available) in `uploads/_cc/`, made with PHP's GD. The original file is never changed. The
  size in pixels, the file size and the description (alt text) are recorded in `media.json` in
  the data directory; the Media page shows an "Optimized" badge.
- **On publish**, every image from `uploads/` that has copies gets a `srcset` of them, so
  phones download a fraction of the size. Images load lazily, except the first one on the page,
  which loads with priority.
- **Optimize older images**: images uploaded before this feature have no copies. In **Media**,
  click **Optimize N older images**: the copies are made in batches of about 20 seconds per
  request until none are left. Publish afterwards.
- **Limits**: without GD with WebP support, images are used as they are (no copies, no
  `srcset`; everything else works). An image too large for PHP's `memory_limit` (about 5 bytes
  per pixel are needed) is skipped and used as it is. GIF, AVIF, SVG, ICO and BMP files and
  images 480 px wide or less get no copies. In all these cases the image still counts as
  processed (section 11, "Images are not optimized").
- Deleting an image in Media also deletes its copies and its metadata. Before deleting, Media
  lists where the image is still used (pages and drafts, items, header/footer, masters, Global
  Options, menu).
- **Folders** in the Media library are labels stored in `media.json` (`folder`) and
  `media-folders.json`: files always stay directly in `uploads/`, so moving an image to a folder,
  or renaming or deleting a folder, never changes an image address. Deleting a folder deletes no
  file.
- **Image tools** (0.23.0): **Crop** (JPEG, PNG and WebP, with GD) saves a new image or replaces the original; **Replace file** swaps the
  content of a file under the same name (it must be the same kind of image, and passes the upload checks); the **focal point** is stored in
  `media.json` (`focal`: percent across and down) and offered when the image is chosen for an Image block. A replaced or cropped original
  gets its optimized copies made again and loses its focal point; pages that use it show the new file after the next publish.
- **From a web address**: the library can add an image by its address (the server downloads it, with the importer's rules: public addresses
  only, never a private network, no credentials, usual ports, redirects re-checked, 25 MB, the checks of an upload). It needs the PHP `curl`
  extension and is turned off in the demo.

### 7.8 Version history

Every Save Draft or Publish that changes a page or a collection item stores a version in the
`page_revisions` table (a save that changes nothing adds none). The **newest 40 versions per
page or item** are kept; older ones are deleted automatically. Users open them with the
**History** button in the editor and can restore one into the editor as an unsaved change.

**Deleting a page or an item also deletes its history.** Version history is in the database,
so it is included in server-level backups (section 8.3) and, if you tick the option, in site
backups made on the Backup page (section 8.1).

---

### 7.9 Scheduled publishing and cron

A page or a collection item can be given a time to go live (**Publish at**) and a time to come down (**Unpublish at**), as
explained in the [User Guide](USER-GUIDE.md#scheduled-publishing). The server makes each change at its time, then publishes the
site again. It does so in one of two ways:

- **On the next admin visit.** Any request to the admin after the time makes the due changes. This needs an administrator to
  sign in, so a site that nobody edits must use the second way.
- **From the server's scheduler (cron).** Run the publisher every few minutes from the command line:

  ```
  */5 * * * *  php /path/to/site/canvascore-admin/cron.php > /dev/null 2>&1
  ```

  `cron.php` only runs from the command line: a request from the web gets "not found". It prints what it changed, and the
  first lines of any skipped change (an address another live page uses, or a page with unpublished edits waiting).

Times are the **server's local time** (the `date.timezone` setting of PHP). Check it if the times look shifted. Test the
scheduler once: make a draft item, set its **Publish at** a few minutes ahead, then run `php cron.php` after that time and check
that it is published.

## 8. Backup and restore

There are two ways to back up a site: the **Backup** page in the admin (one ZIP file, made and
restored from the browser), and a **server-level backup** of the folders (section 8.3), which
also covers user accounts. Use both: the ZIP for everyday safety and for moving a site, the
server-level copy before updates and for disaster recovery.

### 8.1 Site backup from the Backup page (admins)

**Backup** in the sidebar (admins only) saves the whole site in one ZIP file. It needs the PHP
`zip` extension; without it the page says so and only old `.json` backups can be imported.

A backup contains:

- pages (live versions and their unpublished draft copies), collections and their items,
  templates, masters, the global header and footer, and redirects;
- Global Options (`settings.json`, including form emails and the session timeout), the menu,
  and the media library data (`media.json`: descriptions, sizes, folders; `media-folders.json`);
- every uploaded file in `uploads/` (images, audio and video), including the optimized copies in `uploads/_cc/`;
- optionally, **version history** ("Include the version history of pages and items") and
  **form messages** ("Include the messages received through forms"). Both are ticked by
  default;
- a `manifest.json` with the CanvasCore version, database and content schema, date, site name
  and counts.

It never contains **installed block packages** (section 12.1; pages that use their blocks are saved, the
blocks come back when you install the packages again, so keep the `.zip` files), the WordPress import
folders, user accounts or passwords, sessions, login/rate-limit state, `forms.json` or
`published_files.json` (both rebuilt by publishing), files in `uploads/` that are not images,
or the published HTML (regenerated by publishing).

Two buttons:

- **Download backup (.zip)**: the server makes the file, the browser downloads it as
  `<site-name>-backup-YYYY-MM-DD-HHMMSS.zip`, and the server's temporary copy is deleted once
  sent (or after an hour if the download never starts).
- **Keep a copy on the server**: the file is stored in `backups/` in the data directory
  (outside the public site when the data directory is outside the web root; protected by a
  deny-all `.htaccess` otherwise, see section 4.2 for Nginx), named
  `backup-YYYYMMDD-HHMMSS-<32 random hex characters>.zip`. The random part (128 bits) makes the
  name impossible to guess; copies with the shorter names of older versions are still listed.

**Backups on the server** lists the saved copies and the safety copies (section 8.2) with date,
site name, number of pages, items and image files, size and version. Each can be downloaded,
restored or deleted. Copies on the server are lost if the server is: download backups and keep
them elsewhere too. Saved copies are never deleted automatically, so delete old ones to save
disk space.

A backup contains form messages (if ticked), Global Options with the form email addresses, and
all images: store downloaded backups as carefully as the site itself.

### 8.2 Restore from a site backup

On the Backup page, restore either a backup saved on the server (**Restore** on its row) or a
file from your computer (**Restore from a file › Choose a backup file…**). The file can come
from this site or from another CanvasCore installation, so this is also how you move a site.
CanvasCore asks you to confirm first.

What happens:

1. **Upload in pieces.** A ZIP from your computer is sent in pieces (up to 8 MB each, smaller
   when PHP's upload limit is lower), so its size does not depend on `upload_max_filesize` /
   `post_max_size`. The page shows the progress; keep it open until the restore has finished.
   Unfinished uploads are cleaned up after an hour.
2. **Checks, before anything changes.** The file must be a CanvasCore backup; it may only
   contain the known content tables, the known data files and images (the allowed upload
   extensions, with plain file names and no path that leaves the folders). Anything else
   refuses the whole file. A backup made by a **newer** CanvasCore (newer backup format or
   database schema) is refused: update this site first. Older backups restore normally
   (unknown columns are ignored). There must be enough free disk space. Only one restore runs at
   a time.
3. **Safety copy.** The current site is saved as `before-restore-YYYYMMDD-HHMMSS-<random>.zip` in
   `backups/` (with history and form messages). Only the **newest 5** safety copies are kept.
   If the safety copy cannot be made, nothing is restored. To undo a restore, restore its safety
   copy.
4. **Images.** The backup's images are unpacked into a temporary folder next to `uploads/`
   (`.cc-restore-…`), checked like uploads (SVGs with active content and files that aren't real
   images are left out and listed in the result), and then swapped with the current `uploads/`
   folder.
5. **Content, in one transaction.** Pages, collections and items, templates, masters,
   header/footer and redirects are replaced (redirects that are not well formed are dropped).
   Version history and form messages are replaced only if the backup contains them; otherwise
   the current ones stay. Restored rich text is cleaned like a new save (section 10). If anything fails, the
   transaction is rolled back and the old `uploads/` folder is put back: nothing changes.
6. **Options.** Global Options, the menu and the media library data are replaced by the
   backup's. **Trusted proxy addresses** are kept from this server (they describe the server,
   not the site). User accounts, sessions and login state are never touched.
7. **Republish.** The editor then republishes the whole site. If that publish reports a
   problem, click **Publish Site**.

**Old `.json` backups** (made by the Backup page before 0.14) can still be imported with the
same button. They contain only pages, masters, templates, the menu, Global Options and the
header/footer: those are replaced; collections, images, redirects and submissions are left as
they are; accounts are kept. The `.json` file is sent in one request, so it is limited by
`upload_max_filesize` / `post_max_size`. No safety copy is made for a `.json` import: make a
ZIP backup first.

### 8.3 Server-level backup

A complete backup of the server side is three folders:

1. **The data directory** (`canvascore-data/` or `canvascore-admin/data/`): the database with
   everything including collections, **accounts**, submissions, version history and redirects,
   plus settings, menu, `media.json` and `media-folders.json`. You can exclude `backups/` if
   you keep those ZIPs elsewhere.
2. **`uploads/`**: all images. Backing up the `uploads/_cc/` sub-folder (optimized copies) is
   optional: the copies can be regenerated from the originals (section 8.4).
3. **The site files** (optional, they can be regenerated by publishing): the web root without
   `uploads/` and `canvascore-admin/`.

Example nightly backup with a consistent SQLite copy:

```bash
#!/bin/sh
SITE=/var/www/example.com
DEST=/backups/example.com/$(date +%F)
mkdir -p "$DEST"
sqlite3 "$SITE/canvascore-data/canvascore.sqlite" ".backup '$DEST/canvascore.sqlite'"
tar czf "$DEST/data.tgz" -C "$SITE" --exclude=canvascore-data/sessions --exclude=canvascore-data/backups canvascore-data
tar czf "$DEST/uploads.tgz" -C "$SITE/public" uploads   # add --exclude=uploads/_cc to skip the copies
```

Keep copies off the server. `sqlite3 .backup` is safe while the site is in use; copying the
`.sqlite` file directly is fine when nobody is editing.

### 8.4 Restore from a server-level backup

1. Put the release's `canvascore-admin/` in place (section 3.2), without running the installer.
2. Restore the data directory and `uploads/`; make sure the PHP user owns them and can write.
3. If `uploads/_cc/` was not backed up, pages still work (publishing leaves missing copies out of
   the `srcset` and uses the originals), but phones lose the smaller files. To make the copies
   again, clear the "optimized" marks in the data directory (descriptions are kept):
   ```bash
   php -r '$f="media.json"; $m=json_decode(file_get_contents($f), true);
     foreach ($m as &$e) { unset($e["optimized"], $e["variants"]); }
     file_put_contents($f, json_encode($m, JSON_UNESCAPED_UNICODE));'
   ```
   then sign in and click **Optimize N older images** in Media.
4. Click **Publish Site** to regenerate all pages.

---

## 9. Forms and email

### 9.1 Recipients and sender

- **Per-form recipient**: the Form block's own receiving email (set by an admin; editors
  don't see the field, and their saves keep the admin's value).
- **Default recipient**: Global Options → Form emails → *Default receiving email (To)*, used by
  forms without their own address.
- **From** address: *Sender email (From)*; if empty, `noreply@<your domain>`. It is also used as
  Reply-To. Use an address on your own domain, or many mail servers will reject or junk the
  message.
- **Subject**: *Default subject*, otherwise "New submission from your website".
- **Newsletter Signup** and **Multi-step Form** blocks follow the same rules as the Form block: their receiving
  email is set by an admin, editors can't see or change it (their saves keep the admin's value), and the default
  recipient applies when it is empty.

Recipients are never sent to the browser: on publish, CanvasCore writes `forms.json` in the
data directory (form id → recipient, the labels of the form's fields and its success message)
and `submit_form.php` reads it. **After changing a form's recipient, fields or success message,
publish the site** so the registry is updated.

If no valid recipient is found, the submission is still stored and the visitor sees a generic
"Thank you: your message was received.": check **Submissions** after setting up a form.

### 9.2 Sending

Email is sent with PHP's `mail()`, as plain text. It needs a working mail setup on the server
(sendmail/postfix, or the host's mail service). If `mail()` is disabled or fails, the
submission is still saved in the database, the visitor sees the generic "Thank you: your message
was received." (never server details) and the failure is logged in the server error log
(`CanvasCore form: mail() failed for form …`).

### 9.3 Submissions

Every accepted submission is stored before the email is attempted, up to **20,000** stored
submissions: beyond that, new ones are only emailed until you delete old ones. Admins see them in
**Submissions** (the latest 1000 in the list), can search, delete one or clear all, and
export **CSV** (all submissions, one column per field label). In the CSV, values starting with
`=`, `+`, `-`, `@`, tab or carriage return (column names included) are prefixed with `'` so that
spreadsheets do not run them as formulas.

### 9.4 Spam protection

- **Honeypot**: a hidden field that people never fill in. If it is filled, the visitor sees the
  success message but nothing is stored or sent.
- **Rate limit**: at most **8 submissions every 10 minutes per IP address**; beyond that the
  visitor gets "Too many messages sent in a short time." (HTTP 429). Behind a reverse proxy or
  CDN, set the trusted proxy addresses (section 4.4), or all visitors share one limit.
- **Unknown forms refused**: a submission naming a form that is not in the published registry,
  or arriving before the site has been published with a form, is rejected ("This form is no
  longer available.").
- **Only the form's own fields**: only the fields the form defines are stored and mailed, with
  the labels set on the site; anything else a visitor sends is ignored. The success message also
  comes from the form's settings, never from the visitor.
- **Limits**: only `POST` is accepted; at most 64 KB per submission ("The message is too long."),
  5,000 characters per field and 50 fields; an empty form is refused.
- The form endpoint starts no session, sends no `X-Mailer` header and never shows server errors
  to visitors.

---

## 10. Security

What CanvasCore does for you:

- **Installation**: there is no default account. The installer asks for a setup key written to
  the data folder (proof of access to the server's files), runs under a lock, requires `dom`, and
  refuses to install when the data folder can be downloaded from the web (section 3.3).
- **Data outside the web root**: database, settings and sessions live in `canvascore-data/`
  outside the web root whenever PHP can write there (also for sites in a sub-folder of the web
  root); otherwise in `canvascore-admin/data/` with a deny-all `.htaccess` (Apache only; on Nginx
  add the rules from section 4.2).
- **Admin folder**: security headers that keep the editor out of other sites' frames
  (clickjacking) and stop MIME sniffing and referrer leaks; the library files and JSON files
  can't be opened directly (section 4). The editor also refuses to run inside a frame.
- **Roles**: four roles (section 6). The role is read from the database on every request. Authors and reviewers cannot use the site-wide
  actions (settings, menu, templates, masters, media management, bulk actions, scheduling), an author sees and changes only their own pages
  and items and cannot publish, a reviewer publishes only what was submitted, and a collection can be limited to chosen people: all of it is
  checked by the server on every request, whatever the editor shows. Authors cannot publish the site (`rebuild_all.php` refuses them).
- **Updates**: only admins can check for or install an update. A package is installed only if its
  Ed25519 signature matches a public key in `canvascore-admin/update-keys.php` (so a changed or
  forged package, or a hijacked download, is refused); it is downloaded over HTTPS from GitHub's
  addresses only, within a size limit, and unpacked only after every file name has been checked (nothing outside
  `canvascore-admin/`, no `..`, no links, nothing for the data folder). Versions that are not newer
  are never installed. A backup is taken first and a failure after the swap is rolled back
  (section 5.1). The private key that signs releases is never part of the code or of a site.
- **Block packages and the importer**: both are admin-only, and the demo refuses them. A package is checked in full before it is installed
  (no scripts, no code fields, scoped CSS, safe images, hostile-value test, size and name limits) and again whenever it is loaded; the images
  are served from `canvascore-blocks/` with the same no-script rules as `uploads/`. The importer reads the export without XML entities or network
  access, cleans everything it imports, and downloads pictures only from public addresses (private, loopback and link-local networks are refused,
  the connection is pinned to the checked address, redirects are re-checked, 25 MB and a real-image check each) (section 12).
- **Sessions**: cookie `CCSESSID`, `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS; no
  session is created for visitors who aren't signing in; the session ID is regenerated at login;
  session files are stored in the data directory (`sessions/`), isolated from other apps.
  Sessions expire after **30 minutes of inactivity** by default, adjustable by an admin from
  **5 to 720 minutes** (Global Options → Security), and at the latest **7 days** after signing
  in. The editor warns about 2 minutes before expiry and keeps unsaved work when you sign in
  again. Deleting an account, or resetting or changing its password, ends its other sessions at
  once; the role is read from the database on every request.
- **CSRF**: every state-changing request needs the session's token in the `X-CSRF-Token` header
  and must come from the site itself (`Origin` / `Sec-Fetch-Site` are checked); otherwise the
  server answers 403 ("Invalid CSRF token. Reload the page."). The token is kept only in the
  editor's memory, never in a cookie. Sign-in accepts only JSON requests from the site itself,
  so another site can't sign you in to an account of its choosing.
- **Login throttling**: every attempt is counted before the password is checked. **5 wrong
  passwords in 15 minutes** for one account from one IP address, **20 in 15 minutes** from one
  address (any accounts), or **100 in an hour** for one account (any addresses) lock that pair,
  address or account for **15 minutes**. An unknown username takes as long to answer as a wrong
  password. Behind a reverse proxy or CDN the visitor's real address is used once the proxy is
  listed in Trusted proxy addresses (section 4.4); `X-Forwarded-For` and `X-Forwarded-Proto` are
  never trusted from other addresses.
- **Passwords**: at least 8 characters everywhere (installer, new accounts, resets, own
  changes). New accounts and reset passwords must be changed at first sign-in, and the server
  allows nothing else until then; any later change of your own password requires the current
  one. The last admin can't be deleted.
- **Rich text**: filtered through an allow-list when it is **saved** (pages, items,
  header/footer, masters, templates, version history; after a restore or import; and once for
  existing content when updating to 0.14.1) and again when it is published, whatever the role.
  It removes scripts, iframes, forms, `on*` event handlers and `javascript:`/`vbscript:`/`data:`
  links (only `data:image` is allowed in image sources); inline styles keep only plain typography
  and box properties (no positioning, `url()` or expressions); links opening a new tab get
  `rel="noopener noreferrer"`.
- **Other content**: active addresses (`javascript:`, `data:text/…` and the like) are blanked in
  every block field when saved, except an admin's Custom HTML and custom CSS/JS. Block style
  values can't contain `;`, `{`, `}`, `<`, `>`, `\` or script addresses; page background colors
  and widths, and Hero/Gallery image addresses, are validated. Editors don't receive a Form
  block's own receiving email from the server. Templates and masters must be a single block.
- **Editor**: the built editor runs under a strict Content Security Policy (scripts only from
  its own files), and everything it shows as HTML (canvas, version history, rich text fields)
  is cleaned again in the browser with DOMPurify. The Menu Builder's live preview runs in a
  separate sandboxed page (`menu-preview.html`).
- **Reserved addresses**: `canvascore-admin`, `uploads`, `canvascore-data` and `data` can't be
  used by pages, collections or redirects, and publishing never writes into or deletes from
  them (section 7.1).
- **Uploads**: only `jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`, `svg`, `ico`, `bmp`; raster
  files must be real images. Audio (`mp3`, `m4a`, `ogg`, `wav`) and video (`mp4`, `webm`) files must start the way their type says, and are size-capped. SVGs are accepted only when every element and attribute is on an
  allow-list of plain drawing features: no scripts, event handlers, animations of links,
  embedded HTML or MathML, external references or style sheets (`@import`), or processing
  instructions. File names are sanitized and prefixed with a timestamp, and an upload never
  overwrites an existing file. The uploads folder cannot run scripts, and SVGs opened directly
  get a restrictive Content Security Policy (Apache `.htaccess`, or the Nginx rules in
  section 4.2).
- **Errors**: never displayed to users or visitors; database, publish, install and form errors
  show a generic message and the details go to the server error log.
- **Editors' limits**: see section 6 (no code, no form recipients, no security settings, no
  redirects, no accounts, backups or submissions).
- **Cookie consent**: scripts and embeds marked for consent run only after Accept
  (section 7.6).
- **Backups**: the Backup page and every backup action are admin-only. Saved backups live in
  `backups/` inside the data directory (deny-all `.htaccess` as well), with names containing 128
  random bits, and are only sent through the API to a signed-in admin; their names are checked,
  so no other file can be requested. Backups never contain accounts or passwords. A backup to
  restore is checked before anything changes (only known tables, data files and images; no
  paths leaving the folders), images in it go through the same checks as uploads, its redirects
  and rich text are validated like new ones, and a safety copy is made first (section 8.2).
- **Before sign-in**: the only data the admin shows before sign-in is the site name and the
  favicon address (`api.php?action=branding`), both already public on the site. The CanvasCore
  version is shown only to signed-in users and is not written into published pages.
- **Publishing and forms**: publishing requires POST + token, and redirects are validated again
  at every publish; form recipients, fields and success messages are only read from the
  server-side registry (no open mail relay, section 9.4).

Recommended hardening:

1. Use HTTPS everywhere and redirect HTTP.
2. Make sure the data directory is outside the web root; test that
   `https://example.com/canvascore-admin/data/canvascore.sqlite` and
   `https://example.com/canvascore-admin/version.json` return 403/404.
3. Delete `install.php` after installing and after every update.
4. Give accounts the Editor role unless they need admin rights; remove accounts that are no
   longer used.
5. On Nginx, add the deny rules and headers from section 4.2 (the app cannot do it for you).
6. Optionally restrict `/canvascore-admin/` by IP or with HTTP basic auth at the web server, if
   your editors work from known locations (on Apache, in your own `canvascore-admin/.htaccess` that
   keeps CanvasCore's rules, see section 4.1). Leave `/canvascore-admin/submit_form.php` reachable,
   or the site's forms stop working.
7. Behind a reverse proxy or CDN, list its addresses in Trusted proxy addresses (section 4.4).
8. Keep PHP up to date and keep regular off-server backups (sections 8.1 and 8.3). Delete old
   backup ZIPs you no longer need from the Backup page, and keep downloaded ones somewhere safe:
   they contain the site's options and, if included, its form messages.

---

## 11. Troubleshooting

**"CanvasCore is not set up yet" on the sign-in screen**
The setup wizard has not run on this database (or, after updating to 0.14.1, the site only had
the old default `admin`/`admin` account). Open `install.php` and complete it with the setup key
(section 3.3); upload `install.php` again if you deleted it.

**The installer doesn't accept the setup key, or says install-key.txt could not be written**
Paste the whole content of `install-key.txt` from the data folder shown on the page (dashes and
case don't matter). The key changes only if the file is deleted or damaged, so reload the page
after editing the file by hand. If the file cannot be written, give PHP write access to the data
folder.

**The installer says the data folder is "DOWNLOADABLE by anyone"**
The data folder is inside the web root and the server sends its files to anyone. Make the folder
next to the web root writable by PHP (the message names it; CanvasCore then uses it), or deny
web access to the data folder: on Nginx with the rules of section 4.2, on Apache by allowing
`.htaccess` files (`AllowOverride All`).

**"Choose a new password first."**
The account has a temporary password (new account or reset): the server refuses everything else
until a new one is chosen. Reload the editor: it then asks for the new password.

**Signed out unexpectedly**
A session ends when its account's password is changed or reset in another browser, when the
account is deleted, after the inactivity timeout and at the latest 7 days after signing in.
After updating to 0.14.1 everyone signs in again once.

**"For your security, the CanvasCore editor can only be opened in its own browser tab."**
The editor was opened inside a frame of another page. Open its address directly in a tab.

**"Publish incomplete: N file(s) could not be written"**
PHP cannot write in the web root or in a page folder. Give the PHP user write access to the web
root and its sub-folders (for example `chown -R www-data:www-data /var/www/example.com/public`,
or fix ownership in your hosting panel), then publish again. Stale pages are only cleaned up
after a complete publish.

**"Publishing failed because of a server error" or "Database not found." when publishing**
The details of a server error are in the server error log (prefix `CanvasCore publish:`, see
"Where are the PHP errors?" below). "Database not found" means the data directory moved or
became unreadable: check that `canvascore-data/` (or `canvascore-admin/data/`) exists and is
writable. "master.html missing!" means the upload of `canvascore-admin/` was incomplete.

**Uploads fail or images return HTTP 500**
- On Apache, a 500 on files in `uploads/` usually means the server refuses a directive in
  `uploads/.htaccess`. Check the Apache error log, and allow overrides for the site directory
  (`AllowOverride All`).
- "File type not allowed" / "The file is not a valid image": only the image types in section 10
  are accepted, and a renamed non-image is refused.
- "This SVG contains scripts or other active content…": the check accepts only plain drawing
  elements and attributes (section 10), so animations, embedded HTML, external references or
  style sheets are refused too. Export the SVG again as a plain SVG, or as PNG. SVGs are
  refused altogether when the PHP `dom` extension is missing.
- An SVG that worked before updating to 0.14.1 is gone: it failed the new check and was moved to
  `quarantine/` in the data directory (see the server error log). Export it again and upload it.
- "No file received or upload error": the file is larger than `upload_max_filesize` /
  `post_max_size` (Apache/PHP) or `client_max_body_size` (Nginx).
- "Cannot move the uploaded file": `uploads/` is not writable by PHP.

**Form emails are not received**
1. Check the installer report or ask your host whether `mail()` is enabled.
2. Check the recipient (Form block or Global Options) and **publish** after changing it.
3. Set a From address on your own domain and configure SPF/DKIM for it; check spam folders.
4. Look in **Submissions**: if the message is there, the form works and the problem is mail
   delivery. Visitors always see a thank-you message, even when no recipient is set or `mail()`
   fails; a failed `mail()` is logged in the server error log (`CanvasCore form:`).

**Session keeps expiring**
The default is 30 minutes without activity. An admin can raise it (up to 720 minutes) in Global
Options → Security. If sessions expire much sooner than configured, check that the data
directory's `sessions/` folder is writable (otherwise PHP's default session folder is used and
other applications' cleanup may delete CanvasCore sessions).

**"Too many failed attempts. Try again in N minute(s)."**
Five wrong passwords for that account from that address (or 20 from that address for any
accounts, or 100 in an hour for that account from anywhere). Wait 15 minutes. To unlock at once,
delete `login_attempts.json` from the data directory (this resets the counters for everyone).
If the user forgot the password, an admin can reset it (section 6.3). If accounts get locked
although their owners typed nothing wrong, or forms answer "Too many messages" to everyone, the
site is probably behind a proxy or CDN: set the trusted proxy addresses (section 4.4).

**"Invalid CSRF token. Reload the page."**
The editor tab is older than the current session (for example after a sign-in in another tab
or an update), or the request didn't come from the site itself (for example the editor opened
through a different address or proxy than the one the browser reports as its origin). Reload the
page.

**Deleted or renamed pages are still online**
Deleted pages, collections and collection items are removed at once; unpublished pages and items
are removed on the next successful **Publish Site**. A renamed
page's old address is meant to stay: it now holds a redirect page (section 7.4); remove the
redirect in Global Options › Redirects if you don't want it. Files created by an old version
before the manifest existed, or files you added by hand, are never deleted automatically:
remove them by FTP/SSH.

**Redirects don't work, or answer 200 instead of 301**
- Publish after renaming or adding a redirect: redirects take effect at the next publish.
- Nginx: the redirect pages forward visitors, but the `.htaccess` 301s are ignored. Add
  `location = /old/ { return 301 /new/; }` lines to the server block (section 4.2).
- Apache: check that the root `.htaccess` contains the `# BEGIN CanvasCore redirects` block,
  that PHP can write that file, that `AllowOverride` allows it and that `mod_alias` is enabled
  (the rules are inside `<IfModule mod_alias.c>`).
- An old address that is used again by a published page loses its redirect, by design.

**RSS feeds are missing**
Feeds are written only when **Global Options › Site address** is set, and only for collections
with at least one published, non-archived item. Set the address and publish again; check
`https://example.com/<collection-slug>/feed.xml`. A publish message ending in
`Warning: Feeds: …` gives the reason.

**Images are not optimized (no "Optimized" copies, no `srcset`)**
- GD without WebP: check `php -r 'var_dump(function_exists("imagewebp"));'` with the site's PHP
  and enable/upgrade the `gd` extension (with WebP support), or ask your host.
- Memory: images that need more than the free `memory_limit` (about 5 bytes per pixel) are
  skipped. Raise `memory_limit` (for example to 256M) or upload smaller images.
- `uploads/_cc/` not writable by PHP.
- Images that couldn't be processed (GD/WebP missing, memory too low) stay "not optimized":
  after fixing the cause, click **Optimize N older images** again (Media says how many were
  skipped), then publish.
- Only JPG, PNG and WebP wider than 480 px get copies; pages need a publish to get the `srcset`.

**Site search shows old or missing results**
`search-index.json` is rebuilt only when the site is published: click **Publish Site**. Pages
marked "Hide this page from search engines" and archived items are never in the results. If the
search finds nothing at all, check that `https://example.com/search-index.json` loads (a CDN or
a server rule may block or cache it).

**Backup page: "The PHP zip extension is not available on this server"**
Ask your host to enable the `zip` extension (`ZipArchive`), or install it (`php8.x-zip` on
Debian/Ubuntu) and restart PHP. The installer shows it as a warning. Until then only old `.json`
backups can be imported; use a server-level backup (section 8.3).

**Restoring a backup fails**
- "This backup was made by a newer version of CanvasCore": update this site to that version (or
  newer) first, then restore.
- "This ZIP is not a CanvasCore backup" / "The backup contains a file that is not allowed": the
  file was not made by the Backup page, or was changed afterwards. Use an unmodified backup.
- "Not enough free disk space…": the images are unpacked next to `uploads/` before the old ones
  are removed, so the server needs room for both for a moment. Free some space (old backups in
  `backups/` too).
- "A piece of the file did not arrive (larger than this server accepts)": a limit in front of PHP
  is smaller than PHP's own upload limit. On Nginx, raise `client_max_body_size` to at least 8m
  (section 4.2).
- "Another restore is running": wait for it to finish; only one restore runs at a time.
- "Could not save a safety copy of the current site first": nothing was restored. Check the free
  disk space and that PHP can write to the data directory's `backups/` folder.
- "The uploads folder could not be replaced": PHP must be able to rename `uploads/` and create
  folders in the web root. Nothing was changed.
- If the connection drops during a restore, the server finishes it anyway. Wait a minute, reload
  the Backup page and check the site: the safety copy of the previous site is listed there if you
  need to go back. Then click **Publish Site**, because the automatic republish is started by the
  browser after the restore.

**Updates page: "This server can't update itself"**
One of the requirements listed on the page is missing: the PHP `sodium`, `zip` or `curl` extension
(ask your host, or install `php8.x-sodium`, `php8.x-zip` and `php8.x-curl` on Debian/Ubuntu), write
access to the admin folder and to the web root (the update renames the admin folder, so PHP needs
to be able to create and rename folders next to it), or free disk space. Until then, update by hand
(section 5.2).

**Updates page: "Could not check for updates"**
The server could not reach GitHub, or GitHub answered with an error. Check that the server can open
HTTPS connections to `api.github.com` (a firewall or a hosting restriction can block them) and try
again later: GitHub limits how often one address can ask.

**An update was refused or rolled back**
The page shows each step and the reason: a signature that is not valid (the package was not signed
with the CanvasCore release key: do not install it), a package with a file that is not allowed, a
file the new version could not be read from, or a new version that did not start. After a rollback
the previous version and its database are back; nothing else is needed. The history on the Updates
page keeps the message. If the same update fails again, update by hand (section 5.2).

**A package is refused with a list of problems**
Each line names the file and the rule it broke (for example a script in a template, a `url()` outside the package, or a test that failed).
Fix them and install again: the check `php canvascore-frontend/scripts/block-package.php check <folder>` finds the same problems on your computer.

**A package's images do not show**
Check that `canvascore-blocks/<package>/` exists in the site and that the server answers for it (on Nginx the `canvascore-blocks` block of section 4.2
must not send everything to a 404 handler). Reinstalling the package copies the images again.

**The WordPress import says the file could not be read or is too big**
The message names the reason: not an export file, broken XML, more than 200 MB or 50,000 entries, or larger than `upload_max_filesize` / `post_max_size`
(raise them, or export Posts and Pages separately). A file that declares an XML document type is refused on purpose.

**Imported pictures are still on the old site**
The old site could not be reached from your server (a firewall, a login in front of it, a private network), the file was larger than 25 MB, it was not a
real image, or the server has no PHP `curl` extension. The report lists the pictures. Make the old site's `wp-content/uploads` public for the import, or add
the pictures to the Media library by hand.

**An author or a reviewer cannot do something an editor can**
That is by design (section 6): authors and reviewers cannot change the menu, Global Options, templates or masters, manage the media library, or publish
on their own. Give the account the *editor* role if it should (Accounts › the role menu). A reviewer who cannot publish a page: the page was not
submitted; an author must **Submit for review** first.

**"This page is waiting for review"**
The author submitted it, so it is locked for them until a reviewer sends it back or the author withdraws it. A reviewer, an editor or an admin can still edit it.

**Someone does not see a collection**
The collection is limited to chosen people (Collections › Who can work here). Add them there, or choose *Everyone*. An author also sees only the items they made.

**Version mismatch warning in the sidebar**
`Editor vX / server vY: reload the page after updating`: reload the tab (hard refresh). If it
persists, upload the new `dist/` contents into `canvascore-admin/` and make sure no cache or CDN
serves an old `canvascore-admin/index.html`.

**404 page not shown**
On Apache, check that the root `.htaccess` contains `ErrorDocument 404 /404.html` (CanvasCore
creates it only when the file does not exist). On Nginx, add `error_page 404 /404.html;`.

**Where are the PHP errors?**
CanvasCore never displays PHP errors (to editors or to visitors); errors go to the PHP error
log, and the screen shows only a generic message. Its location depends on the server: typically `/var/log/apache2/error.log`,
`/var/log/nginx/error.log` or `/var/log/php8.x-fpm.log`, or the "Error log" section of your
hosting panel. `php -i | grep error_log` shows the configured file. CanvasCore's messages start
with `CanvasCore install:`, `CanvasCore database error:`, `CanvasCore publish:`,
`CanvasCore form:` / `CanvasCore form storage:` or `CanvasCore: unsafe SVG moved to quarantine:`.

---

## 12. Block packages and the WordPress importer

Both are in the **Administration** group of the sidebar and are for admins only. Both are turned off in the demo.

### 12.1 Block packages (Administration › Block packages)

A block package is a `.zip` that adds blocks to the editor: block definitions (settings, template, panel), an optional style
sheet and images. Its blocks appear in the Add tab under **Block packages**. A package **holds no code that runs**: no scripts,
no code fields, no custom panel widgets, and the CSS is limited to the package's own blocks. It is still content on your public
site, so install packages only from people you trust.

- **Install**: choose the `.zip` (5 MB at most). Before anything is installed the server checks the layout and file names,
  the manifest, every definition, the HTML written in the templates, the style sheet, every image (SVG files through the SVG
  check) and the package's own tests, and types hostile values into every setting to see that no script, event attribute or
  active address can come out. The page lists **every problem** found and installs nothing if there is one. A package needs
  the PHP `zip` extension.
- **Versions**: a newer version of an installed package replaces it; the same or an older version is refused. A package may
  require a minimum CanvasCore version.
- **On / Off**: switch a package off to take its blocks out of the Add tab and off the published pages; the blocks stay saved
  in the pages and come back when it is switched on.
- **Remove**: the page tells you how many saved pages, items or templates use its blocks. They stay saved but disappear from
  the pages until the package is installed again.
- **Where it lives**: `packages/<id>/` in the data folder (the files and the list `index.json`); the images are copied to
  `canvascore-blocks/<id>/` in the site, a reserved address that no page can take. Apache gets its rules automatically; on
  **Nginx add the `canvascore-blocks` block of section 4.2**. Without it package images still work, but nothing stops a script
  placed there, so add it.
- **A faulty block** (one that fails after an update, say) is left out of a published page instead of stopping the publish.
  A package can never replace a core block.
- **Backups do not contain packages** (section 8.1). Keep the `.zip` files; after restoring a backup on a new server install them
  again, and the blocks reappear in the pages that use them.

Writing a package is described in the Developer Guide (section 8.3, "As a package"), with an example in
`docs/examples/block-packages/pull-quote`.

### 12.2 Import from WordPress (Administration › Import from WordPress)

Brings **pages, posts, categories, tags and pictures** over from a WordPress site. In WordPress choose **Tools › Export › All
content** and download the `.xml` file, then:

1. **Choose the file.** It is only read and summarised: how many pages, posts, pictures, categories and tags it holds, and what
   will be left out (password-protected entries, the trash, menus and other WordPress entries). Nothing in your site changes yet.
   The file may be up to 200 MB and 50,000 entries; it must also fit the server's `upload_max_filesize` and `post_max_size` (the
   page shows the limit). For a bigger site export **Posts** and **Pages** separately and import them one after the other.
2. **Choose what to bring over**: pages, posts (into a new collection, or an existing one), pictures. By default everything is imported
   as **drafts**, so you can look at it before it goes online. You can import published entries as published instead, and forward
   their old addresses to the new ones.
3. **Watch it run.** The server works in slices of a few seconds and the page asks for the next slice until it is done; you can
   leave the page open. A step can be repeated safely. A report lists what was added and what deserves a look.

What happens to the content:

- Posts become items with their date, excerpt, featured picture (cover image), SEO title and description (Yoast SEO and Rank Math) and their
  categories and tags, which are added to the collection's **Categories** and **Tags** (category nesting is flattened). Pages become pages
  (page hierarchy is flattened and menus are not imported: build the menu in Menu). Every address is made unique: a page that would take an
  address you already use gets a number (`about-us-2`). Nothing is deleted or replaced.
- Text, headings, lists, quotes and tables become Text blocks, pictures Image blocks (a `[gallery]` becomes its pictures), YouTube and Vimeo
  links and embeds Video blocks, `<pre>` code blocks Code Snippet blocks, rules Dividers. Scripts, forms, other embeds and shortcodes are left
  out and reported. Everything is cleaned like a normal save. Links between imported pages and posts are rewritten to the new addresses.
- **Pictures** are downloaded from the old site into the Media library (25 MB each, images only; audio and video are not imported). The
  server only downloads from public web addresses: never from a private or internal network, with no user name in the address, only on the
  usual ports, and a redirect is checked again at every step. Every file passes the checks of a normal upload (a real image, a safe SVG). If
  the server has no PHP `curl` extension, or a picture cannot be reached, it stays on the old site (a link to the old address) and the
  report says so. Untick *Pictures* to keep all of them on the old site.
- **Old addresses** are forwarded (Global Options › Redirects, section 7.4) only for entries imported as published, and never from an address
  one of your live pages already uses.
- Published entries go online at your next **Publish Site**; drafts stay drafts.

The import keeps a working folder in `imports/` of the data folder (the converted content, deleted when you discard the import or finish and click
*Import another file*, and after 7 days). The file you upload is read as a stream with XML entities and network access off, and a file that
declares a document type is refused. The importer needs the PHP `xml` and `dom` extensions.

---

## 13. License

CanvasCore is free software, licensed under the GNU Affero General Public License, version 3 or
later (AGPL-3.0-or-later); the full text is in [LICENSE](../../LICENSE). In practice, for site
operators (this is a summary, not legal advice):

- **Running CanvasCore unmodified**, for your own sites or for clients, commercial or not, needs
  nothing more from you.
- **If you modify CanvasCore** and let other people use the modified admin over a network (for
  example, you host the editor for clients), AGPL section 13 requires you to offer those users
  the source code of your modified version, under the same license.
- **Your published sites and content are your own.** The README grants an additional permission
  under AGPL section 7: the HTML, CSS and JavaScript that CanvasCore writes into a published site
  (page markup, `effects.css`, the scripts of blocks in published pages) may be used, modified and
  distributed as part of that site under any terms. The editor and the `canvascore-admin/`
  backend are not covered by that permission. See the License section of the
  [README](../../README.md#license).
