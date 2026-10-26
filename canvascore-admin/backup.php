<?php
// canvascore-admin/backup.php
// Whole-site backup as one ZIP file, and its restore.
//
//   manifest.json            what the file is: app/db/content versions, date, site name, counts, options
//   db/<table>.json          every row of each content table (accounts are never included)
//   data/<file>.json         Global Options, menu, media descriptions and folders
//   uploads/...              every uploaded file, with the optimized copies (uploads/_cc/)
//
// Restoring replaces the site's content, images and options with the backup's; user accounts, sessions and
// server-specific options (trusted proxies) are kept. Before a restore a safety copy of the current site is
// saved on the server (data dir /backups), so a restore can always be undone.
// Library file: included by the endpoints, never opened directly
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/media.php';   // cc_media_kind(), cc_media_sniff()

const CC_BACKUP_FORMAT = 1;
// Always replaced on restore (the site's content)
const CC_BACKUP_TABLES = ['pages', 'templates', 'master_components', 'site_parts', 'collections', 'collection_items', 'redirects', 'collection_taxonomies', 'collection_terms', 'popups'];
// Optional: replaced only when the backup contains them
const CC_BACKUP_OPTIONAL_TABLES = ['page_revisions' => 'history', 'form_submissions' => 'submissions'];
const CC_BACKUP_DATA_FILES = ['settings.json', 'menu.json', 'media.json', 'media-folders.json'];
// the library's file types: images, audio and video (the same as CC_MEDIA_AUDIO / CC_MEDIA_VIDEO in media.php)
const CC_BACKUP_UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'mp3', 'm4a', 'ogg', 'wav', 'mp4', 'webm'];
const CC_BACKUP_KEEP_SAFETY = 5;   // safety copies made before a restore that are kept

function cc_backup_data_dir() { return $GLOBALS['CC_BACKUP_DATA_DIR'] ?? cc_data_dir(); }                         // overridable for tests
function cc_backup_uploads_dir() { return $GLOBALS['CC_UPLOADS_DIR'] ?? (dirname(__DIR__) . '/uploads'); }   // overridable for tests
function cc_backup_dir() {
    $d = $GLOBALS['CC_BACKUP_DIR'] ?? (cc_backup_data_dir() . '/backups');
    if (!is_dir($d)) @mkdir($d, 0755, true);
    ensure_htaccess($d, $GLOBALS['CC_HT_DENY']);
    return $d;
}
function cc_backup_db_schema() { $m = cc_db_migrations(); return (int) max(array_keys($m)); }

function cc_backup_rrmdir($dir) {
    if (!is_dir($dir) || is_link($dir)) { if (file_exists($dir) || is_link($dir)) @unlink($dir); return; }
    foreach (array_diff(scandir($dir), ['.', '..']) as $f) cc_backup_rrmdir($dir . '/' . $f);
    @rmdir($dir);
}
function cc_backup_copy_dir($from, $to) {
    if (!is_dir($to) && !@mkdir($to, 0755, true)) return false;
    foreach (array_diff(scandir($from), ['.', '..']) as $f) {
        $a = $from . '/' . $f; $b = $to . '/' . $f;
        if (is_link($a)) continue;
        if (is_dir($a)) { if (!cc_backup_copy_dir($a, $b)) return false; }
        elseif (!@copy($a, $b)) return false;
    }
    return true;
}
// rename() fails between file systems (data dir and web root can be on different disks): copy instead
function cc_backup_move_dir($from, $to) {
    if (@rename($from, $to)) return true;
    if (!cc_backup_copy_dir($from, $to)) { cc_backup_rrmdir($to); return false; }
    cc_backup_rrmdir($from);
    return true;
}
function cc_backup_table_exists($pdo, $t) {
    $st = $pdo->prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
    $st->execute([$t]);
    return (bool) $st->fetchColumn();
}
function cc_backup_columns($pdo, $t) {
    $cols = [];
    foreach ($pdo->query('PRAGMA table_info(' . $t . ')') as $c) $cols[] = $c['name'];
    return $cols;
}

// Creates the backup ZIP at $dest. $opts: history (version history), submissions (form messages), kind.
// Returns the manifest, or throws.
function cc_backup_create($pdo, $dest, array $opts = []) {
    if (!class_exists('ZipArchive')) throw new RuntimeException('The PHP zip extension is not available on this server, so backups cannot be made. Ask your host to enable it.');
    @set_time_limit(0);
    $opts += ['history' => true, 'submissions' => true, 'kind' => 'download'];
    $zip = new ZipArchive();
    if ($zip->open($dest, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Cannot create the backup file.');

    $counts = [];
    $tables = CC_BACKUP_TABLES;
    foreach (CC_BACKUP_OPTIONAL_TABLES as $t => $opt) if (!empty($opts[$opt])) $tables[] = $t;
    foreach ($tables as $t) {
        if (!cc_backup_table_exists($pdo, $t)) continue;
        $rows = $pdo->query('SELECT * FROM ' . $t)->fetchAll(PDO::FETCH_ASSOC);
        // pages: the site's pages, not their unpublished draft copies
        $counts[$t] = $t === 'pages' ? count(array_filter($rows, function ($r) { return empty($r['is_draft_copy']); })) : count($rows);
        $zip->addFromString('db/' . $t . '.json', json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    $data_dir = cc_backup_data_dir();
    foreach (CC_BACKUP_DATA_FILES as $f) {
        $src = ($f === 'media.json' && function_exists('cc_media_meta_file')) ? cc_media_meta_file()
             : (($f === 'media-folders.json' && function_exists('cc_media_folders_file')) ? cc_media_folders_file() : $data_dir . '/' . $f);
        if (is_file($src)) $zip->addFile($src, 'data/' . $f);
    }
    $up = cc_backup_uploads_dir();
    $files = 0; $bytes = 0;
    if (is_dir($up)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($up, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile() || $file->isLink()) continue;
            $rel = str_replace('\\', '/', substr($file->getPathname(), strlen($up) + 1));
            if ($file->getFilename() === '.htaccess' || !cc_backup_upload_path_ok($rel)) continue;
            $zip->addFile($file->getPathname(), 'uploads/' . $rel);
            $zip->setCompressionName('uploads/' . $rel, ZipArchive::CM_STORE);   // images are already compressed
            $files++; $bytes += $file->getSize();
        }
    }
    $settings = @json_decode((string)@file_get_contents($data_dir . '/settings.json'), true);
    $v = cc_version();
    $manifest = [
        'canvascore' => true, 'format' => 'canvascore-backup', 'format_version' => CC_BACKUP_FORMAT,
        'app' => $v['app'], 'build' => $v['build'] ?? 0, 'db_schema' => cc_backup_db_schema(), 'content_schema' => $v['content_schema'] ?? 1,
        'created_at' => date('c'), 'kind' => (string)$opts['kind'],
        'site_name' => is_array($settings) ? (string)($settings['siteName'] ?? '') : '',
        'includes' => ['history' => !empty($opts['history']), 'submissions' => !empty($opts['submissions'])],
        'counts' => $counts, 'uploads' => ['files' => $files, 'bytes' => $bytes],
    ];
    $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    if (!$zip->close()) { @unlink($dest); throw new RuntimeException('Writing the backup file failed (is the disk full?).'); }
    return $manifest;
}

// A path inside uploads/ that a backup may contain: plain names, no "..", library file types only (never a script)
function cc_backup_upload_path_ok($rel) {
    if ($rel === '' || strlen($rel) > 400) return false;
    $parts = explode('/', $rel);
    foreach ($parts as $p) if ($p === '' || $p === '.' || $p === '..' || !preg_match('/^[A-Za-z0-9._ ()@+-]{1,200}$/', $p) || $p[0] === '.') return false;
    return in_array(strtolower(pathinfo($rel, PATHINFO_EXTENSION)), CC_BACKUP_UPLOAD_EXT, true);
}

// Opens and checks a backup ZIP without changing anything. Returns ['ok' => bool, 'message', 'manifest', 'zip'].
function cc_backup_inspect($path) {
    $fail = function ($m) { return ['ok' => false, 'message' => $m]; };
    if (!class_exists('ZipArchive')) return $fail('The PHP zip extension is not available on this server, so backups cannot be restored. Ask your host to enable it.');
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return $fail('This is not a ZIP file, or it is damaged.');
    $manifest = json_decode((string)$zip->getFromName('manifest.json'), true);
    if (!is_array($manifest) || empty($manifest['canvascore']) || ($manifest['format'] ?? '') !== 'canvascore-backup') { $zip->close(); return $fail('This ZIP is not a CanvasCore backup.'); }
    if ((int)($manifest['format_version'] ?? 0) > CC_BACKUP_FORMAT || (int)($manifest['db_schema'] ?? 0) > cc_backup_db_schema()) {
        $zip->close(); return $fail('This backup was made by a newer version of CanvasCore (' . ($manifest['app'] ?? '?') . '). Update this site first, then restore it.');
    }
    $tables = array_merge(CC_BACKUP_TABLES, array_keys(CC_BACKUP_OPTIONAL_TABLES));
    $total = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $n = $st['name'];
        $total += (int)$st['size'];
        if ($n === 'manifest.json') continue;
        if (substr($n, -1) === '/') {   // folder entries
            if ($n === 'db/' || $n === 'data/' || $n === 'uploads/' || (strpos($n, 'uploads/') === 0 && cc_backup_upload_path_ok(rtrim(substr($n, 8), '/') . '/x.png'))) continue;
            $zip->close(); return $fail('The backup contains an unexpected folder: ' . $n);
        }
        if (preg_match('~^db/([a-z_]+)\.json$~', $n, $m) && in_array($m[1], $tables, true)) continue;
        if (preg_match('~^data/([a-z-]+\.json)$~', $n, $m) && in_array($m[1], CC_BACKUP_DATA_FILES, true)) continue;
        if (strpos($n, 'uploads/') === 0 && cc_backup_upload_path_ok(substr($n, 8))) continue;
        $zip->close(); return $fail('The backup contains a file that is not allowed: ' . $n);
    }
    // Room on the disk for the images (the old ones are kept until the restore has finished)
    $free = @disk_free_space(dirname(cc_backup_uploads_dir()));
    if ($free !== false && $total > $free * 0.9) { $zip->close(); return $fail('Not enough free disk space to restore this backup (' . round($total / 1048576) . ' MB needed).'); }
    return ['ok' => true, 'message' => '', 'manifest' => $manifest, 'zip' => $zip];
}

// Restores a backup ZIP. Returns ['success', 'message', 'counts', 'skipped' => [files left out]].
function cc_backup_restore($pdo, $path) {
    @set_time_limit(0);
    ignore_user_abort(true);
    $in = cc_backup_inspect($path);
    if (!$in['ok']) return ['success' => false, 'message' => $in['message']];
    $zip = $in['zip']; $manifest = $in['manifest'];

    // 1. read and check every table before touching anything
    $rowsByTable = [];
    foreach (array_merge(CC_BACKUP_TABLES, array_keys(CC_BACKUP_OPTIONAL_TABLES)) as $t) {
        $raw = $zip->getFromName('db/' . $t . '.json');
        if ($raw === false) continue;
        $rows = json_decode($raw, true);
        if (!is_array($rows)) { $zip->close(); return ['success' => false, 'message' => "The backup is damaged ($t could not be read)."]; }
        $rowsByTable[$t] = $rows;
    }
    if (!isset($rowsByTable['pages'])) { $zip->close(); return ['success' => false, 'message' => 'The backup has no pages: nothing was changed.']; }
    // Redirects end up in the site's .htaccess and as pages at their old address: only well-formed ones are restored
    if (isset($rowsByTable['redirects'])) {
        $rowsByTable['redirects'] = array_values(array_filter(array_map(function ($r) {
            if (!is_array($r)) return null;
            $from = cc_redirect_path($r['from_path'] ?? ''); $to = cc_redirect_target($r['to_path'] ?? '');
            return ($from && $to && $from === ($r['from_path'] ?? null)) ? array_merge($r, ['from_path' => $from, 'to_path' => $to]) : null;
        }, $rowsByTable['redirects'])));
    }
    $dataFiles = [];
    foreach (CC_BACKUP_DATA_FILES as $f) {
        $raw = $zip->getFromName('data/' . $f);
        if ($raw === false) continue;
        $d = json_decode($raw, true);
        if (!is_array($d)) { $zip->close(); return ['success' => false, 'message' => "The backup is damaged ($f could not be read)."]; }
        $dataFiles[$f] = $d;
    }

    // 2. unpack the images next to the current uploads folder (same disk: the swap is a quick rename)
    $up = cc_backup_uploads_dir();
    $stage = dirname($up) . '/.cc-restore-' . bin2hex(random_bytes(4));
    $names = [];
    for ($i = 0; $i < $zip->numFiles; $i++) { $n = $zip->getNameIndex($i); if (strpos($n, 'uploads/') === 0 && substr($n, -1) !== '/') $names[] = $n; }
    @mkdir($stage, 0755, true);
    if ($names && !$zip->extractTo($stage, $names)) { $zip->close(); cc_backup_rrmdir($stage); return ['success' => false, 'message' => 'The images could not be unpacked (disk full or folder not writable). Nothing was changed.']; }
    $zip->close();
    if (!is_dir($stage . '/uploads')) @mkdir($stage . '/uploads', 0755, true);
    // the same checks as an upload: no active SVG, raster files must really be images, audio and video must start like their type
    $skipped = [];
    foreach ($names as $n) {
        $f = $stage . '/' . $n; $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION));
        $bad = $ext === 'svg' ? !cc_svg_is_safe($f) : (cc_media_kind($ext) !== 'image' ? !cc_media_sniff($f, $ext) : (!in_array($ext, ['ico'], true) && @getimagesize($f) === false));
        if ($bad) { @unlink($f); $skipped[] = substr($n, 8); }
    }

    // 3. swap the uploads folder, then replace the content in one transaction (undo the swap if it fails)
    $old = dirname($up) . '/.cc-old-uploads-' . bin2hex(random_bytes(4));
    $hadUploads = is_dir($up);
    if ($hadUploads && !@rename($up, $old)) { cc_backup_rrmdir($stage); return ['success' => false, 'message' => 'The uploads folder could not be replaced (check its permissions). Nothing was changed.']; }
    if (!@rename($stage . '/uploads', $up)) {
        if ($hadUploads) @rename($old, $up);
        cc_backup_rrmdir($stage);
        return ['success' => false, 'message' => 'The restored images could not be put in place. Nothing was changed.'];
    }
    cc_backup_rrmdir($stage);
    ensure_htaccess($up, $GLOBALS['CC_HT_UPLOADS']);

    $counts = [];
    try {
        $pdo->beginTransaction();
        foreach (array_merge(CC_BACKUP_TABLES, array_keys(CC_BACKUP_OPTIONAL_TABLES)) as $t) {
            $optional = isset(CC_BACKUP_OPTIONAL_TABLES[$t]);
            if (!cc_backup_table_exists($pdo, $t)) continue;
            if ($optional && !isset($rowsByTable[$t])) continue;   // not in the backup: the current ones stay
            $pdo->exec('DELETE FROM ' . $t);
            $rows = $rowsByTable[$t] ?? [];
            $cols = cc_backup_columns($pdo, $t);
            $counts[$t] = 0;
            foreach ($rows as $row) {
                if (!is_array($row)) continue;
                $use = array_values(array_intersect($cols, array_keys($row)));
                if (!$use) continue;
                $vals = array_map(function ($c) use ($row) { $v = $row[$c]; return is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v; }, $use);
                $pdo->prepare('INSERT INTO ' . $t . ' (' . implode(', ', $use) . ') VALUES (' . implode(', ', array_fill(0, count($use), '?')) . ')')->execute($vals);
                if ($t !== 'pages' || empty($row['is_draft_copy'])) $counts[$t]++;
            }
        }
        // a backup from before roles (0.15) has no creator on its pages: the author is it, as when the site itself was upgraded
        if (cc_backup_table_exists($pdo, 'pages') && in_array('created_by', cc_backup_columns($pdo, 'pages'), true) && in_array('author', cc_backup_columns($pdo, 'pages'), true)) $pdo->exec("UPDATE pages SET created_by = author WHERE (created_by = '' OR created_by IS NULL) AND author IS NOT NULL");
        cc_sanitize_all_content($pdo);   // restored rich text is cleaned like a new save
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        cc_backup_rrmdir($up);
        if ($hadUploads) @rename($old, $up);
        return ['success' => false, 'message' => 'Restore failed, nothing was changed: ' . $e->getMessage()];
    }
    cc_backup_rrmdir($old);

    // 4. options, menu and media descriptions. Trusted proxies and the site address describe THIS server (a backup may come from another one,
    //    or from a demo's builder): the current ones are kept; a site with no address yet takes the backup's.
    $data_dir = cc_backup_data_dir();
    if (isset($dataFiles['settings.json'])) {
        $cur = @json_decode((string)@file_get_contents($data_dir . '/settings.json'), true);
        $s = $dataFiles['settings.json'];
        if (is_array($cur) && array_key_exists('trustedProxies', $cur)) $s['trustedProxies'] = $cur['trustedProxies']; else unset($s['trustedProxies']);
        if (is_array($cur) && trim((string)($cur['siteUrl'] ?? '')) !== '') $s['siteUrl'] = $cur['siteUrl'];
        cc_write_file($data_dir . '/settings.json', json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    if (isset($dataFiles['menu.json'])) cc_write_file($data_dir . '/menu.json', json_encode($dataFiles['menu.json'], JSON_UNESCAPED_UNICODE));
    $metaFile = function_exists('cc_media_meta_file') ? cc_media_meta_file() : $data_dir . '/media.json';
    $foldFile = function_exists('cc_media_folders_file') ? cc_media_folders_file() : $data_dir . '/media-folders.json';
    // descriptions/folders of the OLD images must not stick to the restored ones
    cc_write_file($metaFile, json_encode($dataFiles['media.json'] ?? new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    cc_write_file($foldFile, json_encode($dataFiles['media-folders.json'] ?? [], JSON_UNESCAPED_UNICODE));

    cc_migrate_content($pdo);
    $counts['images'] = count($names) - count($skipped);
    $site = trim((string)($manifest['site_name'] ?? ''));
    return ['success' => true, 'message' => 'Backup restored' . ($site !== '' ? ' (' . $site . ')' : '') . '.', 'counts' => $counts, 'skipped' => $skipped, 'manifest' => $manifest];
}

// Backups saved on the server: "backup-…zip" (saved by hand) and "before-restore-…zip" (safety copies).
// "download-…zip" is made for one download and deleted once sent (or after an hour, see cc_backup_cleanup).
function cc_backup_name_ok($name, $download = false) { return is_string($name) && preg_match('/^(backup|before-restore' . ($download ? '|download' : '') . ')-\d{8}-\d{6}(-[a-f0-9]{4}|-[a-f0-9]{32})?\.zip$/', $name); }
function cc_backup_cleanup() {
    foreach (array_merge(glob(cc_backup_dir() . '/download-*.zip') ?: [], glob(cc_backup_dir() . '/upload-*.part') ?: []) as $f) if (filemtime($f) < time() - 3600) @unlink($f);
}
// The random part makes a backup's name impossible to guess (128 bits), should the data folder ever be reachable
function cc_backup_new_name($prefix) { return $prefix . '-' . date('Ymd-His') . '-' . bin2hex(random_bytes(16)) . '.zip'; }
function cc_backup_list() {
    $dir = cc_backup_dir(); $out = [];
    foreach (glob($dir . '/*.zip') ?: [] as $f) {
        $name = basename($f);
        if (!cc_backup_name_ok($name)) continue;
        $m = null;
        if (class_exists('ZipArchive')) { $z = new ZipArchive(); if ($z->open($f) === true) { $m = json_decode((string)$z->getFromName('manifest.json'), true); $z->close(); } }
        $out[] = ['name' => $name, 'kind' => strpos($name, 'before-restore') === 0 ? 'safety' : 'saved', 'bytes' => (int)filesize($f), 'created' => (int)filemtime($f),
                  'site_name' => is_array($m) ? (string)($m['site_name'] ?? '') : '', 'app' => is_array($m) ? (string)($m['app'] ?? '') : '',
                  'counts' => is_array($m) ? ($m['counts'] ?? []) : [], 'uploads' => is_array($m) ? ($m['uploads'] ?? []) : []];
    }
    usort($out, function ($a, $b) { return ($b['created'] <=> $a['created']) ?: strcmp(preg_match('/\d{8}-\d{6}/', $b['name'], $mb) ? $mb[0] : '', preg_match('/\d{8}-\d{6}/', $a['name'], $ma) ? $ma[0] : ''); });
    return $out;
}
// Safety copy of the current site, kept on the server; only the newest CC_BACKUP_KEEP_SAFETY are kept
function cc_backup_safety_copy($pdo) {
    $name = cc_backup_new_name('before-restore');
    cc_backup_create($pdo, cc_backup_dir() . '/' . $name, ['kind' => 'safety']);
    $safety = array_values(array_filter(cc_backup_list(), function ($b) { return $b['kind'] === 'safety'; }));
    foreach (array_slice($safety, CC_BACKUP_KEEP_SAFETY) as $b) @unlink(cc_backup_dir() . '/' . $b['name']);
    return $name;
}
// The smaller of upload_max_filesize and post_max_size, in bytes (0 = no limit)
function cc_backup_max_upload() {
    $b = function ($v) { $v = trim((string)$v); if ($v === '') return 0; $n = (float)$v; switch (strtolower(substr($v, -1))) { case 'g': $n *= 1024; case 'm': $n *= 1024; case 'k': $n *= 1024; } return (int)$n; };
    $lims = array_filter([$b(ini_get('upload_max_filesize')), $b(ini_get('post_max_size'))]);
    return $lims ? min($lims) : 0;
}

// File name part from the site name: "Acme Bakery & Café" → "acme-bakery-cafe"
function cc_backup_slug($name) {
    $n = (string)$name;
    if (function_exists('iconv')) { $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $n); if ($t !== false) $n = str_replace(["'", '"', '`', '^', '~'], '', $t); }   // some iconv write é as 'e
    $n = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($n)), '-');
    return $n !== '' ? substr($n, 0, 60) : 'site';
}

