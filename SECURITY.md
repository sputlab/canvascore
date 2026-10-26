# Security policy

## Supported versions

From 1.0, the **1.x line is the long-term support (LTS) line**: it never breaks formats, so updating within it is always safe, and
that is where security fixes go. Security fixes are released as a new 1.x version (a patch release) and are available from
**Administration › Updates**; please update to the latest 1.x before reporting. The full policy is in the
[Stability and support policy](docs/manuals/DEVELOPER-GUIDE.md#14-stability-and-support-policy-1x-lts).

| Version | Supported |
| --- | --- |
| Latest 1.x release | ✅ security and bug fixes |
| Earlier 1.x releases | ⚠️ update to the latest 1.x (it is always compatible) |
| 0.x (before 1.0) | ❌ update to 1.x; every 0.x database upgrades |

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

## Roles and review

From 0.23.0 there are four roles (admin, editor, reviewer, author) and collections can be limited to chosen people. The server enforces them on every
request. A way for an author or a reviewer to publish what they should not, to see or change another author's work, to use a site-wide action,
or for someone to use a collection they were not given, is a vulnerability: report it as described below.

## Template library

From 0.24.0, admins can install kits from a library whose index is signed with the release key. A kit is untrusted content: a way to get code (script, a handler,
Custom HTML, a form address, custom CSS or JavaScript) into a site through a kit, to write outside the kit's folders, to install a kit that is not in the signed
index or whose checksum differs, to accept an index with a bad signature, or to use the library without being an admin, is a vulnerability: report it as described below.

## Integrations

From 0.24.0, admins can connect webhooks, Mailchimp, Brevo, analytics and Stripe. A way to read or change an integration key or secret without being an admin, to have the site call a private or internal address
through a webhook, to forge or replay a signed delivery, to add someone to a newsletter without their consent, to inject script through an analytics id or a payment link, or to send a payment button anywhere but to Stripe,
is a vulnerability: report it as described below.

## Popups

From 0.25.0, editors and admins can build popups that are written into published pages. A way to get script or any code into a page through a popup (its name, its settings, its blocks), to publish
a popup that is not published, to change popups as an author or a reviewer, or to make the popup runtime do anything but show and hide the popup, is a vulnerability: report it as described below.

## Languages and installers

From 0.26.0 a site can be multilingual (language folders, translations, hreflang links) and CanvasCore can be installed without a browser (`install-cli.php`, a provisioning file used by hosting installers). A way to change the languages as anyone but an admin,
to take over another language's folder or address, to put script into a page through a language name or code, to run the unattended installer from the web or on a site that is already installed, to make it use or leave behind a password in clear text,
or to install a site without access to the server's files, is a vulnerability: report it as described below.

## Public demo mode

From 1.1.0 a demo site (`demo.json`) puts itself back to a saved starting point, and its visitors are editors with limits. A way for a demo's visitor to publish when `publish` is not set, to change the shared password or upload files, to run `demo-reset.php` without the token or on a site that is not a demo, or to reach another site through the reset, is a vulnerability: report it as described below.

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
