# Security policy

## Supported versions

CanvasCore is in public preview (`0.x`). Security fixes go into the **latest release** only; please update to it
before reporting.

| Version | Supported |
| --- | --- |
| Latest 0.x release | ✅ |
| Older releases | ❌ |

## Releases and updates

From 0.21.0, a site can update itself from the Updates page. Every update package is signed (Ed25519) with the CanvasCore
release key, and a site installs a package only when the signature matches a public key listed in
`canvascore-admin/update-keys.php`. The private key is kept off the repository and off every site. If you ever see a
release, a package or an update that is **not** signed with that key, or a way around the signature or the package checks,
treat it as a vulnerability and report it as described below.

## Block packages and the WordPress importer

From 0.22.0, admins can install **block packages** and import from a **WordPress export**. A package is declarative (no code that
runs) and is checked before it is installed; the importer reads the export without XML entities or network access and downloads
pictures only from public addresses. A package that gets script, an event attribute or an active address into a published page,
CSS that reaches outside its own blocks, a file written outside its folders, an import that reads a local file or reaches a private
network, or a way to use either feature without being an admin, is a vulnerability: report it as described below.

## Reporting a vulnerability

**Please do not open a public issue, pull request or Discord message for security problems.**

Report them privately, either way:

- through GitHub: **Security › Report a vulnerability** on the
  [CanvasCore repository](https://github.com/sputlab/CanvasCore/security/advisories/new);
- by email to **bug@sputlab.com** with "SECURITY" in the subject.

Include what you can:

- the CanvasCore version (sidebar footer, or `canvascore-admin/version.json`);
- PHP version and web server (Apache, Nginx…);
- steps to reproduce, or a proof of concept;
- the impact as you see it (who can do what, signed in or not).

## What happens next

- We aim to confirm receipt within **3 working days** and to give a first assessment within **10 working days**.
- We will keep you informed while we work on a fix, and agree with you on when to publish details.
- Fixed issues are listed under **Security** in [docs/CHANGELOG.md](docs/CHANGELOG.md) and in the GitHub release
  notes. If you wish, you will be credited.

CanvasCore is maintained in spare time by a small team: there is no bug bounty.

## Scope

In scope: the code in this repository: the PHP backend in `canvascore-admin/` (editor API, compiler, publishing,
media, form submissions, backups, installer) and the editor in `canvascore-frontend/`.

Out of scope: problems that need an already compromised server or administrator account, the configuration of your
own hosting (see the [Administrator Guide](docs/manuals/ADMIN-GUIDE.md) for the recommended setup), and
third-party dependencies (report those upstream, though we are glad to hear about ones that affect CanvasCore).

## Hardening your installation

The [Administrator Guide](docs/manuals/ADMIN-GUIDE.md) covers it. The short version: delete `install.php` after
setup, keep the data folder outside the web root (or deny access to it on Nginx), use HTTPS, give editors the
Editor role rather than Admin, and keep CanvasCore up to date.
