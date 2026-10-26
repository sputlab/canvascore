# One-click installers

CanvasCore needs no MySQL database and no build step on the server, so a hosting installer only has to copy the files and hand over four answers
(site name, administrator username, password and email). Every release publishes, next to `canvascore-X.zip` (the signed update package, which is
also the whole site), two files made by `canvascore-frontend/scripts/installer-package.php` (`release-package.php --installers` runs it):

| File | For |
|---|---|
| `canvascore-X-softaculous.zip` | Softaculous: a script package (`info.xml`, `install.xml`, `install.php`, `install.js`, `fileindex.php`, `canvascore.zip`). The sources are in `installers/softaculous/`. |
| `canvascore-X-installer.json` | Any other installer (Installatron, Plesk, DirectAdmin, Ansible, a shell script…): requirements, the archive with its SHA-256 and signature, the questions, and how to run the setup. |

## How the setup is handed over

1. **Command line**: `CC_ADMIN_PASS=… php canvascore-admin/install-cli.php --site-name=… --admin-user=… --admin-email=… --site-url=… [--starter=…] [--delete-installer] [--json]`.
   The password comes from `CC_ADMIN_PASS` or standard input (`--admin-pass-stdin`), or as a ready hash (`--admin-pass-hash`), never as a plain argument.
2. **Provisioning file** (when the installer can only write files): `canvascore-admin/install-provision.json` with `site_name`, `site_url`, `admin_user`,
   `admin_pass_hash` (`password_hash()` output; `admin_pass` works too), `admin_email`, `starter`, `delete_installer`. Then request
   `canvascore-admin/install.php?format=json`: it installs, deletes the file and answers `{"success":true|false,"message":…}`. If the server cannot call
   itself, the first visit to `install.php` does the same. The file is deleted whether or not it worked, and never used on an installed site.

Both use the same checks as the setup wizard (`canvascore-admin/installlib.php`). Updates after the installation are CanvasCore's own (Administration › Updates).

## Before listing it with a hosting company

The packages are tested here (`npm run test:installers`: the installers, the package contents, and Softaculous's `__install()` called against a real copy of the site),
but not inside a Softaculous server: Softaculous reviews and signs the scripts it lists, so submit the package to them (or load it in your own Softaculous
with *Admin › Add Custom Script*) and check the install form, an install, and a removal there.
