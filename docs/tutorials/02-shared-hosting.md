# 2. Deploy on shared hosting

This is the path for a typical cPanel / Plesk account with FTP or a file manager and no SSH.

## Before you upload

1. **Domain and HTTPS.** Point your domain (or a subdomain such as `www`, `demo`) at a folder, and turn on the free certificate (Let's Encrypt / AutoSSL). CanvasCore warns on the setup page if you are not on HTTPS.
2. **PHP version.** In the panel (*MultiPHP Manager*, *Select PHP version*) choose **8.2 or 8.3** for that domain, and tick the extensions `pdo_sqlite`, `dom`, `zip`, `sodium`, `gd`, `curl`, `mbstring` if the panel lists them.
3. **A folder per site.** Use one folder per CanvasCore site. A site in a sub-folder (`example.com/site/`) works too.

## Upload and install

Upload the release ZIP, extract it in the site's folder and run the wizard ([tutorial 1](01-install.md)). Everything CanvasCore publishes (your pages) goes next to `canvascore-admin/`, in the same folder.

## Where the data lives

The database and the settings are in a **data folder**. CanvasCore puts it **outside the web root** when it can (a folder called `canvascore-data` next to your web root), which is the safest place. If the host does not allow that, it falls back to `canvascore-admin/data/`, protected by rules in a `.htaccess` file. The setup page tells which one it uses, and even tests that the folder cannot be downloaded.

> Back up the data folder and `uploads/` with your hosting backup too (the Backup page makes a full ZIP, section 4 of [tutorial 4](04-manage.md)).

## Email from forms

Contact forms use PHP `mail()`. If your host disables it, messages are still stored in **Administration › Submissions**; ask your host for SMTP-less `mail()` or use a form service through **Integrations** (webhooks).

## Scheduled publishing without cron

A page or blog post can go live at a set time. CanvasCore makes the change on the first request after that time, so a site with visitors needs nothing. If you want it exact on a quiet site, add a cron job (cPanel *Cron Jobs*) that runs `php /path/to/canvascore-admin/cron.php` every few minutes.

## Updating

**Administration › Updates › Check for updates**, then **Update to X**. The package is signed and checked, a backup is made first, and the update rolls back by itself if the new version fails its health check. Nothing to upload.

## If something does not work

- *The setup page says a folder is not writable*: set the permissions of the site folder and `uploads/` to be writable by PHP (755 or 775 depending on the host).
- *A white page or a 500 error*: the PHP error log (the panel's *Errors* page) says why. The most common cause is a PHP version below 8.0.
- *Pages are published but the address shows "not found"*: the site address in **Global Options** is empty or wrong, or the web server does not serve `index.html` folders (rare).
- *Nginx*: add the rules of the [Administrator Guide](../manuals/ADMIN-GUIDE.md#42-nginx), section 4.2.

**Next:** [build your first site](03-first-site.md).
