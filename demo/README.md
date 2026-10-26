# The demo site

`demo-baseline.zip` is a finished demo site, **Lumen Studio**, in English and Italian: eight pages from the starters, a blog with three posts, a menu per language, the language switcher in the header, a newsletter popup, a cookie banner and pictures made for it. Restore it on a demo installation (Administration › Backup › Choose a backup file…) and follow [tutorial 5](../docs/tutorials/05-public-demo.md) to turn the installation into a self-resetting public demo.

`demo.json` is an example of the file that turns demo mode on (it goes in the data folder).

To rebuild the baseline after a change of the product:

```bash
cd canvascore-frontend
php scripts/demo-build.php --site=/tmp/lumen --baseline=../demo/demo-baseline.zip
```

The same site is used for the screenshots (`node scripts/screenshots.mjs`).
