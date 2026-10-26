# Contributing to CanvasCore

Thanks for your interest! CanvasCore is stable (1.x, long-term support): bug reports, ideas, translations and pull requests are
welcome. Trying it on your hosting and telling us what went wrong is the most useful thing you can do.

## Ways to help

- **Report a bug**: open a [GitHub issue](https://github.com/sputlab/CanvasCore/issues) with the CanvasCore version
  (sidebar footer), your PHP version and web server, the browser, steps to reproduce, and what you expected.
  For **security problems** follow [SECURITY.md](SECURITY.md) instead: never report them in public.
- **Suggest a feature**: open an issue describing the problem it solves, or talk about it on
  [Discord](https://discord.gg/sD8KMc2kN) first.
- **Improve the docs**: the manuals are in [`docs/manuals/`](docs/manuals/), the step-by-step tutorials in [`docs/tutorials/`](docs/tutorials/) (English and Italian).
- **Translate the editor**: the interface is one file per language, [`canvascore-frontend/src/i18n/locales/`](canvascore-frontend/src/i18n/locales/) (see section 15 of the Developer Guide). Copy `it.json`, translate the values, keep the `{0}` placeholders.
- **Try it on your hosting**: install it, build a small site and tell us where it was hard (an *Installation or hosting* issue).
- **Send code**: see below. For anything bigger than a small fix, open an issue first so we can agree on the
  approach before you spend time on it.

## Development setup

Everything you need (architecture, local setup with the PHP dev server, how rendering and JS↔PHP parity work,
adding a block, conventions) is in the [Developer Guide](docs/manuals/DEVELOPER-GUIDE.md).

```bash
cd canvascore-frontend
npm install
npm run dev     # editor (needs a PHP server for api.php: see the Developer Guide)
npm run lint    # must pass with zero warnings
npm test        # all suites must pass (needs the PHP CLI)
```

Don't run `npm run build` just to check your work: it bumps the build number in `canvascore-admin/version.json`.
Use `npx vite build --outDir /tmp/cc-dist` instead, and leave `version.json` out of your pull request.

## Pull requests

1. Fork the repository and create a branch from `main` with a descriptive name.
2. Keep each pull request focused on one change. Match the style of the surrounding code (see `.editorconfig`).
3. **Formats are stable from 1.0** (the database, page content, backups, API actions; Developer Guide section 14): add, never remove or rename. `npm run test:formats` holds the line.
4. **Visible text goes through `__("…")`** and needs its Italian translation (`node scripts/i18n.mjs` lists what is missing).
5. **Blocks render twice**: in the editor (`src/render/renderBlock.mjs`) and on the published site
   (`canvascore-admin/compiler.php`). Any change to a block's output must be made in both, and `npm run test:parity`
   must stay green.
6. Add or update tests for what you change, and add a line under `[Unreleased]` in
   [docs/CHANGELOG.md](docs/CHANGELOG.md).
7. Database changes go through a numbered migration in `canvascore-admin/migrations.php` (see the Developer Guide).
8. Describe what you changed and how you tested it in the pull request.

## License of contributions

CanvasCore is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). By submitting a
contribution you agree that it is licensed under the same terms, and you confirm that you have the right to submit
it (it is your own work, or you are allowed to contribute it under this license).

Please sign off your commits (`git commit -s`), certifying the
[Developer Certificate of Origin](https://developercertificate.org/).

## Code of conduct

Be respectful and constructive. Harassment or personal attacks are not tolerated in issues, pull requests or on
Discord.
