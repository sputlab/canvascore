import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Single source of truth: canvascore-admin/version.json and blocks.json (PHP side).
function readJson(rel, fallback) {
  try { return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')) }
  catch { return fallback }
}
const version = readJson('../canvascore-admin/version.json', { app: '0.0.0', build: 0 })
const blockDefs = readJson('../canvascore-admin/blocks.json', { _baseStyles: {}, types: {} })
// Block effects CSS (same file the published pages inline), for the editor canvas
let effectsCss = ''
let popupsCss = ''
try { popupsCss = readFileSync(fileURLToPath(new URL('../canvascore-admin/popups.css', import.meta.url)), 'utf-8') } catch { /* optional */ }
try { effectsCss = readFileSync(fileURLToPath(new URL('../canvascore-admin/effects.css', import.meta.url)), 'utf-8') } catch { /* optional */ }

// Content Security Policy of the built editor (index.html): scripts only from the editor's own files, so nothing
// that ends up in the page as HTML (block previews, rich text) can ever run code, not even an event handler.
// Only in the build: the dev server needs inline scripts for hot reload.
const EDITOR_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' data: blob: https: http:",
  "frame-src 'self' https:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')
const editorCsp = {
  name: 'canvascore-editor-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${EDITOR_CSP}" />\n    <meta name="referrer" content="same-origin" />\n    <meta name="robots" content="noindex, nofollow" />`),
}

export default defineConfig({
  plugins: [react(), editorCsp],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version.app || '0.0.0'),
    __APP_BUILD__: JSON.stringify(version.build || 0),
    __BLOCK_DEFS__: JSON.stringify(blockDefs),
    __EFFECTS_CSS__: JSON.stringify(effectsCss),
    __POPUPS_CSS__: JSON.stringify(popupsCss),
  },
})
