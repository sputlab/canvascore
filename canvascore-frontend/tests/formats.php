<?php
// tests/formats.php — the stable formats of the 1.x line (npm run test:formats).
// From 1.0 a minor or patch release may ADD to a format but never remove or rename what is in it: sites, backups, kits and packages made
// by an earlier 1.x keep working. This test holds that line:
//   - the database schema: every table and column of tests/fixtures/formats.json still exists, a database made at ANY earlier schema step
//     upgrades to the same schema as a new one, and upgrading twice changes nothing;
//   - a backup made by 1.0 (tests/fixtures/backup-1.0.zip) still opens and restores;
//   - the manifest of a backup, version.json and the content schema;
//   - every API action of 1.0 still exists, every block type and every content key a block keeps in a page.
// To record the formats after a deliberate ADDITION run `php tests/formats.php --update` (it only adds; removing needs a 2.0).
require_once __DIR__ . '/../../canvascore-admin/compiler.php';
require_once __DIR__ . '/../../canvascore-admin/migrations.php';
require_once __DIR__ . '/../../canvascore-admin/backup.php';
$update = in_array('--update', $argv ?? [], true);
$fails = 0; $total = 0;
function check($name, $ok, $extra = '') { global $fails, $total; $total++; if ($ok) echo "  ✓ $name\n"; else { $fails++; echo "  ✗ $name" . ($extra !== '' ? "  → $extra" : '') . "\n"; } }
$admin = realpath(__DIR__ . '/../../canvascore-admin');
$fixtureFile = __DIR__ . '/fixtures/formats.json';
$fix = is_file($fixtureFile) ? json_decode(file_get_contents($fixtureFile), true) : [];

function mem() { $p = new PDO('sqlite::memory:'); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); return $p; }
function schema_of(PDO $p) {
    $out = [];
    foreach ($p->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $cols = array_column($p->query('PRAGMA table_info("' . $t . '")')->fetchAll(PDO::FETCH_ASSOC), 'name');
        sort($cols); $out[$t] = $cols;
    }
    return $out;
}
// the migrations up to $v, as cc_migrate() runs them
function migrate_to(PDO $p, $v) {
    $p->exec("CREATE TABLE IF NOT EXISTS cc_meta (key TEXT PRIMARY KEY, value TEXT)");
    $m = cc_db_migrations(); ksort($m);
    foreach ($m as $n => $fn) { if ($n > $v) break; $p->beginTransaction(); $fn($p); cc_meta_set($p, 'db_schema', $n); $p->commit(); }
}

echo "\nVERSIONS\n";
$ver = json_decode(file_get_contents("$admin/version.json"), true);
$mig = cc_db_migrations(); $keys = array_keys($mig); sort($keys);
check('version.json has the app version, the database schema, the content schema and the build', isset($ver['app'], $ver['db_schema'], $ver['content_schema'], $ver['build']) && preg_match('/^\d+\.\d+\.\d+$/', $ver['app']));
check('the migrations are numbered 1…N with no gap, and N is the schema of version.json', $keys === range(1, count($keys)) && (int)$ver['db_schema'] === count($keys), json_encode($keys));
check('the content schema is 1 (blocks saved in pages keep their format)', (int)$ver['content_schema'] === 1);

echo "\nDATABASE SCHEMA\n";
$fresh = mem(); cc_migrate($fresh); $freshSchema = schema_of($fresh);
if ($update) { $old = $fix['schema'] ?? []; foreach ($freshSchema as $t => $c) $old[$t] = array_values(array_unique(array_merge($old[$t] ?? [], $c))); ksort($old); foreach ($old as &$c) sort($c); unset($c); $fix['schema'] = $old; }
$missing = [];
foreach (($fix['schema'] ?? []) as $t => $cols) { if (!isset($freshSchema[$t])) { $missing[] = $t; continue; } foreach ($cols as $c) if (!in_array($c, $freshSchema[$t], true)) $missing[] = "$t.$c"; }
check('every table and column of 1.0 is still there', $fix && !$missing && count($fix['schema']) >= 14, implode(', ', $missing));
$bad = [];
for ($v = 1; $v < count($keys); $v++) {
    $p = mem(); migrate_to($p, $v);
    try { cc_migrate($p); } catch (Throwable $e) { $bad[] = "from $v: " . $e->getMessage(); continue; }
    if (schema_of($p) !== $freshSchema) $bad[] = "from $v: a different schema";
    if ((int)cc_meta_get($p, 'db_schema') !== count($keys)) $bad[] = "from $v: not recorded";
}
check('a database at any earlier schema step (1…' . (count($keys) - 1) . ') upgrades to exactly the schema of a new one', !$bad, implode('; ', $bad));
$before = schema_of($fresh); cc_migrate($fresh); cc_migrate($fresh);
check('upgrading again changes nothing', schema_of($fresh) === $before);
$p = mem(); migrate_to($p, 1);
$p->exec("INSERT INTO pages (id, title, slug, clean_slug, content_json, status) VALUES ('keep', 'Kept', 'kept', 'kept', '[{\"type\":\"TEXT\",\"content\":{\"text\":\"<p>x</p>\"}}]', 'published')");
cc_migrate($p); cc_migrate_content($p);
check('the pages of an old database survive the upgrade', (string)$p->query("SELECT title FROM pages WHERE id = 'keep'")->fetchColumn() === 'Kept' && strpos((string)$p->query("SELECT content_json FROM pages WHERE id = 'keep'")->fetchColumn(), 'TEXT') !== false);

echo "\nBACKUP FORMAT\n";
check('the backup format is 1, and a backup lists what the 1.0 restore reads', CC_BACKUP_FORMAT === 1 && !array_diff(['pages', 'templates', 'master_components', 'site_parts', 'collections', 'collection_items', 'redirects'], CC_BACKUP_TABLES) && !array_diff(['settings.json', 'menu.json', 'media.json', 'media-folders.json'], CC_BACKUP_DATA_FILES));
$tmp = sys_get_temp_dir() . '/cc_fmt_' . getmypid();
cc_backup_rrmdir($tmp); @mkdir("$tmp/data", 0755, true); @mkdir("$tmp/site/uploads", 0755, true);
$GLOBALS['CC_BACKUP_DATA_DIR'] = "$tmp/data"; $GLOBALS['CC_UPLOADS_DIR'] = "$tmp/site/uploads";
$GLOBALS['CC_MEDIA_META_FILE'] = "$tmp/data/media.json"; $GLOBALS['CC_MEDIA_FOLDERS_FILE'] = "$tmp/data/media-folders.json";
$goldFile = __DIR__ . '/fixtures/backup-1.0.zip';
if ($update && !is_file($goldFile)) {
    $db = mem(); cc_migrate($db);
    $db->exec("INSERT INTO pages (id, title, slug, clean_slug, content_json, status, is_home) VALUES ('p1', 'Home', 'index', 'index', '[{\"id\":\"b1\",\"type\":\"TEXT\",\"styles\":{},\"content\":{\"text\":\"<p>Hello</p>\"}}]', 'published', 1), ('p2', 'About', 'about', 'about', '[]', 'draft', 0)");
    $db->exec("INSERT INTO collections (id, name, slug) VALUES ('c1', 'Blog', 'blog')");
    $db->exec("INSERT INTO collection_items (id, collection_id, title, slug, status) VALUES ('i1', 'c1', 'First post', 'first-post', 'published')");
    $db->exec("INSERT INTO redirects (from_path, to_path) VALUES ('/old/', '/about/')");
    file_put_contents("$tmp/data/settings.json", json_encode(['siteName' => 'Golden']));
    file_put_contents("$tmp/data/menu.json", json_encode(['items' => []]));
    file_put_contents("$tmp/data/media.json", '{}'); file_put_contents("$tmp/data/media-folders.json", '[]');
    cc_backup_create($db, $goldFile, ['history' => false, 'submissions' => false]);
}
$ins = cc_backup_inspect($goldFile);
check('a backup made by 1.0 still opens, and says what it is', is_file($goldFile) && !empty($ins['ok']) && ($ins['manifest']['format'] ?? '') === 'canvascore-backup' && (int)($ins['manifest']['format_version'] ?? 0) === 1, json_encode($ins['message'] ?? ''));
$rdb = mem(); cc_migrate($rdb);
$r = is_file($goldFile) ? cc_backup_restore($rdb, $goldFile) : ['success' => false];
check('…and restores: its pages, collection, item and redirect, and its settings', !empty($r['success']) && (int)$rdb->query("SELECT COUNT(*) FROM pages")->fetchColumn() === 2 && (string)$rdb->query("SELECT title FROM collection_items WHERE id = 'i1'")->fetchColumn() === 'First post' && (int)$rdb->query("SELECT COUNT(*) FROM redirects")->fetchColumn() === 1 && (json_decode(file_get_contents("$tmp/data/settings.json"), true)['siteName'] ?? '') === 'Golden', json_encode($r));
$man = $ins['manifest'] ?? [];
$need = ['canvascore', 'format', 'format_version', 'app', 'build', 'db_schema', 'content_schema', 'created_at', 'kind', 'site_name', 'includes', 'counts', 'uploads'];
check('the manifest of a backup has every field of 1.0', !array_diff($need, array_keys($man)), implode(',', array_diff($need, array_keys($man))));
$db2 = mem(); cc_migrate($db2);
$new = cc_backup_create($db2, "$tmp/new.zip");
check('a backup made today has them too', !array_diff($need, array_keys($new)));
// the demo site that ships with the product restores on a new site, in its two languages
$demoZip = __DIR__ . '/../../demo/demo-baseline.zip';
cc_backup_rrmdir($tmp); @mkdir("$tmp/data", 0755, true); @mkdir("$tmp/site/uploads", 0755, true);
file_put_contents("$tmp/data/settings.json", json_encode(['siteUrl' => 'https://this-demo.example']));
$ddb = mem(); cc_migrate($ddb);
$r = is_file($demoZip) ? cc_backup_restore($ddb, $demoZip) : ['success' => false, 'message' => 'no demo/demo-baseline.zip'];
$dset = json_decode((string)@file_get_contents("$tmp/data/settings.json"), true) ?: [];
check('demo/demo-baseline.zip (the ready-made demo site) restores: its pages in two languages, a blog, a popup, a menu per language and its pictures', !empty($r['success']) && (int)$ddb->query("SELECT COUNT(*) FROM pages WHERE is_draft_copy = 0 AND status = 'published'")->fetchColumn() === 9 && (int)$ddb->query("SELECT COUNT(*) FROM pages WHERE lang = 'it'")->fetchColumn() === 3 && (int)$ddb->query("SELECT COUNT(*) FROM collection_items")->fetchColumn() === 3 && (int)$ddb->query("SELECT COUNT(*) FROM popups WHERE status = 'published'")->fetchColumn() === 1 && !empty($dset['languages']['enabled']) && count(glob("$tmp/site/uploads/lumen-*.jpg") ?: glob("$tmp/site/uploads/*lumen-*.jpg")) === 3 && !empty(json_decode((string)@file_get_contents("$tmp/data/menu.json"), true)['langs']['it']['items']), json_encode($r['message'] ?? ''));
check('…and keeps the address of the site it is restored on', ($dset['siteUrl'] ?? '') === 'https://this-demo.example');
cc_backup_rrmdir($tmp);

echo "\nAPI AND BLOCKS\n";
function api_actions($admin) {
    $src = file_get_contents("$admin/api.php") . file_get_contents("$admin/rebuild_all.php") . file_get_contents("$admin/submit_form.php");
    $a = [];
    preg_match_all('/\$action\s*===\s*\'([a-z_0-9]+)\'/', $src, $m); $a = array_merge($a, $m[1]);
    preg_match_all('/in_array\(\$action,\s*\[([^\]]*)\]/', $src, $m); foreach ($m[1] as $list) { preg_match_all('/\'([a-z_0-9]+)\'/', $list, $mm); $a = array_merge($a, $mm[1]); }
    $a = array_values(array_unique($a)); sort($a); return $a;
}
$actions = api_actions($admin);
if ($update) $fix['actions'] = array_values(array_unique(array_merge($fix['actions'] ?? [], $actions))); sort($fix['actions']);
$gone = array_values(array_diff($fix['actions'] ?? [], $actions));
check('every API action of 1.0 is still there (' . count($fix['actions'] ?? []) . ')', count($fix['actions'] ?? []) >= 100 && !$gone, implode(', ', $gone));
$defs = json_decode(file_get_contents("$admin/blocks.json"), true)['types'] ?? [];
$contentKeys = []; foreach ($defs as $type => $d) { $k = array_keys($d['content'] ?? []); sort($k); $contentKeys[$type] = $k; }
if ($update) { $old = $fix['blocks'] ?? []; foreach ($contentKeys as $t => $k) $old[$t] = array_values(array_unique(array_merge($old[$t] ?? [], $k))); ksort($old); foreach ($old as &$k) sort($k); unset($k); $fix['blocks'] = $old; }
$lost = [];
foreach (($fix['blocks'] ?? []) as $t => $keysOf) { if (!isset($contentKeys[$t])) { $lost[] = $t; continue; } foreach ($keysOf as $k) if (!in_array($k, $contentKeys[$t], true)) $lost[] = "$t.$k"; }
check('every block type of 1.0 and the content keys it keeps in a page are still there (' . count($fix['blocks'] ?? []) . ' types)', count($fix['blocks'] ?? []) >= 50 && !$lost, implode(', ', array_slice($lost, 0, 10)));
$render = [];
foreach (array_keys($fix['blocks'] ?? []) as $t) { $out = render_block(['type' => $t, 'id' => 'x', 'content' => [], 'styles' => []]); if (!is_string($out)) $render[] = $t; }
check('every block type of 1.0 still renders from an empty block', !$render, implode(',', $render));

if ($update) { $fix['recorded'] = $ver['app']; file_put_contents($fixtureFile, json_encode($fix, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"); echo "\nFormats recorded in tests/fixtures/formats.json\n"; }
echo "\n" . ($total - $fails) . ' of ' . $total . " checks passed\n";
exit($fails ? 1 : 0);
