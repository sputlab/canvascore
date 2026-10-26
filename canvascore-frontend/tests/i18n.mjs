// tests/i18n.mjs — the translated admin interface (npm run test:i18n): every text of the source has its translation in every locale file,
// the {values} of a text survive in its translation, the runtime fills them and falls back to English, and the server's messages are translated
// as they arrive.
import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (ok) console.log('  ✓ ' + name); else { fails++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

console.log('\nLOCALE FILES');
let out = '', ok = true;
try { out = execFileSync('node', ['scripts/i18n.mjs'], { cwd: root, encoding: 'utf8' }); } catch (e) { ok = false; out = String(e.stdout || e.message); }
check('every text of the interface has a translation, none is left over, the {values} match', ok, out.split('\n').slice(0, 6).join(' | '));
console.log('  ' + out.trim().split('\n')[0]);

const i18n = await import('../src/i18n/index.js');
const { translatePayload, withTranslatedMessages } = await import('../src/i18n/apiMessages.js');

console.log('\nRUNTIME');
check('English is the default and the key is the text', i18n.getLocale() === 'en' && i18n.__('Save') === 'Save');
check('values are filled in', i18n.__('Delete {0}?', 'x') === 'Delete x?' && i18n.__('{0} of {1}', 1, 2) === '1 of 2');
check('a count with its noun', i18n._n(1, 'page', 'pages') === '1 page' && i18n._n(3, 'page', 'pages') === '3 pages');
check('a non-text passes through', i18n.__(undefined) === undefined && i18n.__(null) === null);
i18n.setLocale('it', false);
const it = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales/it.json'), 'utf8'));
check('Italian is selected', i18n.getLocale() === 'it' && i18n.__('Save') === it['Save'] && it['Save'] !== 'Save');
check('values are filled in the translation', i18n.__('Delete {0}?', 'x') === it['Delete {0}?'].replace('{0}', 'x'));
check('a text with no translation stays in English', i18n.__('A text nobody translated') === 'A text nobody translated');
check('counts use the translated noun', i18n._n(3, 'page', 'pages') === '3 ' + it['pages'] && i18n._n(1, 'page', 'pages') === '1 ' + it['page']);

console.log('\nSERVER MESSAGES');
const p = translatePayload({ success: false, message: 'Invalid action.', errors: ['Invalid action.'], title: 'Invalid action.', nested: { warnings: ['Invalid action.'], name: 'Invalid action.' } });
check('message, errors and warnings are translated, the other fields are not', p.message === it['Invalid action.'] && p.errors[0] === it['Invalid action.'] && p.nested.warnings[0] === it['Invalid action.'] && p.title === 'Invalid action.' && p.nested.name === 'Invalid action.', JSON.stringify(p));
const fakeFetch = async () => new Response(JSON.stringify({ success: false, message: 'Invalid action.' }), { status: 400, headers: { 'content-type': 'application/json' } });
const tf = withTranslatedMessages(fakeFetch);
const r = await tf('api.php?action=x');
const blocks = translatePayload({ success: true, header: [{ id: 'b', type: 'SHARE_BAR', content: { message: 'Invalid action.' } }], blocks: [{ type: 'X', content: { message: 'Invalid action.', notes: ['Invalid action.'] } }] });
check('the content of the site that an answer carries (blocks with a "message" of their own) comes back as stored', blocks.header[0].content.message === 'Invalid action.' && blocks.blocks[0].content.message === 'Invalid action.' && blocks.blocks[0].content.notes[0] === 'Invalid action.');
const nested = translatePayload({ success: true, results: [{ ok: false, message: 'Invalid action.' }], result: { warnings: ['Invalid action.'] } });
check('…while the messages of a list of results, or of a "result", are translated', nested.results[0].message === it['Invalid action.'] && nested.result.warnings[0] === it['Invalid action.']);
check('fetch answers of the API come back translated, with their status', r.status === 400 && (await r.json()).message === it['Invalid action.']);
const r2 = await tf('https://example.com/data.json');
check('other addresses are left alone', (await r2.json()).message === 'Invalid action.');
i18n.setLocale('en', false);
const r3 = await withTranslatedMessages(fakeFetch)('api.php?action=x');
check('in English nothing is touched', (await r3.json()).message === 'Invalid action.');

console.log('\n' + (fails ? 'I18N FAILED (' + fails + ' of ' + total + ')' : 'I18N OK (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
