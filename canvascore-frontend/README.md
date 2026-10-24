# canvascore-frontend

CanvasCore visual editor (React 19, Vite, Zustand, dnd-kit).
See the [main README](../README.md) for structure, development and deploy.

| Command          | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `npm run dev`    | Vite development server                                           |
| `npm run build`  | Build into `dist/` (first increments the build in `version.json`) |
| `npm run lint`   | oxlint                                                            |
| `npm test`       | All tests (needs the PHP CLI for the JS↔PHP parity test)         |

The version and the block defaults are read from `../canvascore-admin/version.json` and
`../canvascore-admin/blocks.json` (see `vite.config.js`). The blocks that are described by a definition file
(`../canvascore-admin/blocks/*.json`) are imported by `src/render/blockDef.mjs`.

`scripts/release-keygen.php` and `scripts/release-package.php` make the signing key and the signed update package of a
release (see the Developer Guide, section 13).

`scripts/block-package.php` checks and packs a block package (`check <folder|zip>`, `pack <folder>`; see the Developer Guide, section 8.3).
