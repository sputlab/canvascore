# 5. Run a public demo

A demo lets people try the real editor without installing anything. CanvasCore has a **demo mode**: visitors sign in with a shared account, can create a few pages and items, and the site **puts itself back to its starting point every few minutes**. It needs no SSH and no cron job, so it works on ordinary shared hosting.

What demo mode does:

- shows the demo login on the sign-in screen, and a countdown to the next reset in the editor;
- locks password changes and uploads, stops form emails, and tells search engines not to index it;
- limits how many new pages and items a visitor can create, and (by default) does **not let visitors publish**, so nothing they type becomes public on your address;
- turns off updates, packages, the importer, integrations and the template library.

## 1. Install a separate copy

Use its own subdomain, for example `demo.your-domain`, with its own folder: install CanvasCore there as in [tutorial 1](01-install.md). Do **not** turn a real site into a demo.

## 2. Start from the ready-made demo (optional)

The repository has a finished demo site, *Lumen Studio*, in English and Italian: `demo/demo-baseline.zip`. In the demo's editor open **Administration › Backup**, choose **Choose a backup file…** and restore it. You get pages, a blog, a menu, a popup, two languages and pictures. Or build your own site, then continue at step 3.

(The file is made by `scripts/demo-build.php`; it runs on a development computer, not on the hosting.)

## 3. Turn demo mode on

With the file manager, create a file **`demo.json`** in the data folder (the one that holds `canvascore.sqlite`; the setup page told you where it is), with:

```json
{ "username": "demo", "password": "canvasdemo", "resetMinutes": 10, "maxNewPages": 5, "maxNewItems": 5 }
```

- `username` / `password`: the login shown to visitors (at least 8 characters).
- `resetMinutes`: how often the demo resets (1 to 60; 10 is good).
- `maxNewPages`, `maxNewItems`: how many pages and items a visitor can create between resets.
- `publish`: `true` lets visitors publish (off by default).
- `resetToken`: optional, see step 6.

Reload the editor: **Administration › Backup** now has a **Public demo** card.

## 4. Make the visitors' account and the starting point

In **Backup › Public demo**:

1. **Make the visitors' account** creates the editor account `demo` with the password from `demo.json`, already chosen (visitors cannot change it).
2. Prepare the site exactly as you want visitors to find it, then press **Keep this site as the starting point**. That saves a backup the demo is put back to.

## 5. It resets itself

From now on, the first visit of every period (for example the first one after each 10-minute mark) puts the site back to the starting point and publishes it again, whatever visitors did. The Public demo card shows the last reset, and **Reset now** forces one. You do not have to schedule anything.

To change the demo, turn it off by removing `demo.json` (or renaming it), edit as an administrator, save a new starting point, and turn it back on.

## 6. Optional: a reset even when nobody visits

A visitor-less demo does not need resetting, because nobody has changed it. If you still want it, set `"resetToken": "a-long-random-string-16-chars-or-more"` in `demo.json` and have a free cron service (or the panel's cron) call:

```
https://demo.your-domain/canvascore-admin/demo-reset.php?token=a-long-random-string-16-chars-or-more
```

Without a `resetToken` that address does not exist.

## Good to know

- The published pages of the demo are the visitors' *view of the site*, not of their edits: visitors preview their changes in the editor, and only you publish.
- Visitors can still type text and see it in the editor; keep `maxNewPages` small and the reset short.
- Put a link from your main site to the demo and say what it is: "Try the editor: demo / canvasdemo".
