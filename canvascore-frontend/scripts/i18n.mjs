// The texts of the admin interface that need a translation (npm run i18n:check, part of the tests).
//   node scripts/i18n.mjs            checks every locale file against the texts found in the source: nothing missing, nothing left over,
//                                    the {0} values of a text kept in its translation
//   node scripts/i18n.mjs --list     prints the texts (JSON): { "text": ["where it is used", …] }
//   node scripts/i18n.mjs --add      adds the missing texts to each locale file with an empty translation (to be filled in)
// Where the texts come from: __("…") and _n(n, "one", "other") in src/, the settings panels in canvascore-admin/blocks/*.json, and the
// messages of the server's answers ('message' => '…' and the lists of errors in canvascore-admin/*.php).
import { parseAst } from 'rolldown/parseAst';
import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const adminDir = path.resolve(root, '../canvascore-admin');
const LOCALES_DIR = path.join(root, 'src/i18n/locales');

export function collect() {
  const keys = new Map(); // text -> Set(where)
  const put = (k, where) => { if (typeof k !== 'string' || !/[A-Za-zÀ-ɏ]{2}/.test(k.replace(/\{\w+\}/g, ''))) return; if (!keys.has(k)) keys.set(k, new Set()); keys.get(k).add(where); };

  const files = [];
  (function w(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { w(p); } else if (/\.(jsx|js|mjs)$/.test(f.name) && !p.endsWith(path.join('i18n', 'index.js'))) files.push(p); } })(path.join(root, 'src'));
  for (const file of files) {
    const rel = path.relative(root, file);
    const code = fs.readFileSync(file, 'utf8');
    if (!code.includes('__(') && !code.includes('_n(')) continue;
    const ast = parseAst(code, { lang: file.endsWith('.jsx') ? 'jsx' : 'js' });
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
        const a = n.arguments;
        if (n.callee.name === '__' && a[0]) {
          if (a[0].type === 'Literal' && typeof a[0].value === 'string') put(a[0].value, rel);
          else if (a[0].type === 'LogicalExpression' || a[0].type === 'ConditionalExpression') { /* the parts are literals wrapped on their own */ }
        }
        if (n.callee.name === '_n' && a[1] && a[2]) { for (const x of [a[1], a[2]]) if (x.type === 'Literal') put(x.value, rel); }
      }
      for (const k in n) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k]);
    })(ast.body);
  }

  // the settings panels of the blocks
  const TEXT = new Set(['label', 'title', 'placeholder', 'hint', 'addLabel', 'itemTitle', 'valueLabel', 'boxTitle', 'checkMessage', 'adminOnlyMessage', 'editorLabel', 'subhead']);
  const blocksDir = path.join(adminDir, 'blocks');
  for (const f of fs.readdirSync(blocksDir).filter((x) => x.endsWith('.json'))) {
    const where = 'canvascore-admin/blocks/' + f;
    (function walk(o, key) {
      if (Array.isArray(o)) {
        if (key === 'choices') o.forEach((p) => { if (Array.isArray(p) && typeof p[1] === 'string') put(p[1], where); });
        o.forEach((x) => walk(x, key)); return;
      }
      if (o && typeof o === 'object') { for (const k of Object.keys(o)) { if (k === 'newItem' || k === 'data' || k === 'defaults') continue; walk(o[k], k); } return; }
      if (typeof o === 'string' && TEXT.has(key)) put(o, where);
      if (typeof o === 'string' && key === 'hint') put(o, where);
    })(JSON.parse(fs.readFileSync(path.join(blocksDir, f), 'utf8')), '');
    // "hint": [..] lists
    (function walk(o) { if (o && typeof o === 'object') { if (Array.isArray(o.hint)) o.hint.forEach((h) => put(h, where)); Object.values(o).forEach(walk); } })(JSON.parse(fs.readFileSync(path.join(blocksDir, f), 'utf8')));
  }

  // the server's messages
  for (const f of fs.readdirSync(adminDir).filter((x) => x.endsWith('.php'))) {
    const where = 'canvascore-admin/' + f;
    const code = fs.readFileSync(path.join(adminDir, f), 'utf8');
    for (const m of code.matchAll(/'message'\s*=>\s*'((?:[^'\\]|\\.)*)'\s*(?=[,\]})]|$)/gm)) put(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'), where);
    for (const m of code.matchAll(/'message'\s*=>\s*"((?:[^"\\$]|\\.)*)"\s*(?=[,\]})])/gm)) put(m[1], where);
  }
  return keys;
}

const load = (code) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, code + '.json'), 'utf8'));
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const keys = collect();
  if (process.argv.includes('--list')) { console.log(JSON.stringify(Object.fromEntries([...keys].map(([k, v]) => [k, [...v]])), null, 1)); process.exit(0); }
  const codes = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  let bad = 0;
  for (const code of codes) {
    const dict = load(code);
    const missing = [...keys.keys()].filter((k) => !(typeof dict[k] === 'string' && dict[k] !== ''));
    const extra = Object.keys(dict).filter((k) => !keys.has(k));
    const broken = Object.keys(dict).filter((k) => keys.has(k) && typeof dict[k] === 'string' && dict[k] !== '' && placeholders(k) !== placeholders(dict[k]));
    if (process.argv.includes('--add')) {
      for (const k of missing) if (!(k in dict)) dict[k] = '';
      const sorted = Object.fromEntries(Object.keys(dict).sort((a, b) => a.localeCompare(b)).map((k) => [k, dict[k]]));
      fs.writeFileSync(path.join(LOCALES_DIR, code + '.json'), JSON.stringify(sorted, null, 1) + '\n');
      console.log(`${code}: added ${missing.filter((k) => !(k in load(code))).length}`);
      continue;
    }
    console.log(`${code}: ${keys.size - missing.length} of ${keys.size} texts translated` + (extra.length ? `, ${extra.length} left over` : '') + (broken.length ? `, ${broken.length} with different {values}` : ''));
    if (missing.length) { console.log('  missing: ' + missing.slice(0, 15).map((k) => JSON.stringify(k)).join(', ') + (missing.length > 15 ? ` … (+${missing.length - 15})` : '')); bad++; }
    if (extra.length) { console.log('  left over: ' + extra.slice(0, 15).map((k) => JSON.stringify(k)).join(', ')); bad++; }
    if (broken.length) { console.log('  values differ: ' + broken.slice(0, 10).map((k) => JSON.stringify(k)).join(', ')); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
