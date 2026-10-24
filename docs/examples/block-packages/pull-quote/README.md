# Pull Quote (an example block package)

A pull quote with an author, a role, an avatar and an optional source link. It shows what a package holds:

- `package.json`: the package's id, name, version and author.
- `blocks/pull-quote.json`: the block: its settings, its template, the sections of its panel, its defaults and its tests.
- `style.css`: the styles, confined to the package's blocks.
- `assets/quote.svg`: an image, used by the style sheet as `url(__ASSETS__/quote.svg)`.

Check it with `php canvascore-frontend/scripts/block-package.php check docs/examples/block-packages/pull-quote`, and make the ZIP
to install with `php canvascore-frontend/scripts/block-package.php pack docs/examples/block-packages/pull-quote`.
