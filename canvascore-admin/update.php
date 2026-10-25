<?php
// canvascore-admin/update.php
// One-click updates (Administration › Updates). An admin checks the latest CanvasCore release on GitHub; installing it:
//
//   1. downloads the release package (canvascore-<version>.zip) and its signature (.zip.sig), from allowed hosts only
//   2. checks the Ed25519 signature against the trusted keys in update-keys.php (a package nobody signed is refused)
//   3. checks the package: every file inside canvascore-admin/, no "..", no links, its version.json is the release's
//   4. takes a backup: a safety copy of the content (listed in Backup), a copy of the database and of the current code
//   5. unpacks it next to the admin folder, checks the PHP files can be parsed, then swaps the two folders
//      (the data folder, when it is inside the admin folder, and the admin's own .htaccess move to the new one)
//   6. calls the new version once (a one-time token): it opens the database, runs its migrations and answers
//   7. if any check after the swap fails, the old folder and the database copy are put back (rollback)
//
// The update source (update-source.php, not shipped) can point to another release feed: tests use it. Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/backup.php';

const CC_UPDATE_MAX_BYTES = 150 * 1048576;          // the release package
const CC_UPDATE_MAX_UNPACKED = 400 * 1048576;       // its files, unpacked
const CC_UPDATE_MAX_ENTRIES = 20000;
const CC_UPDATE_SIG_CONTEXT = "canvascore-update-v1\n";
const CC_UPDATE_KEEP_COPIES = 3;                    // database and code copies kept in the data folder
const CC_UPDATE_REQUIRED = ['api.php', 'config.php', 'compiler.php', 'migrations.php', 'publish.php', 'backup.php', 'media.php',
    'install.php', 'update.php', 'update-keys.php', 'version.json', 'blocks.json', 'blockdef.php', 'blockpkg.php', 'wpimport.php', 'roles.php', 'library.php', 'integrations.php', 'blocks/text.json', 'index.html'];
// What belongs to this site, not to the release: moved or copied into the new admin folder
const CC_UPDATE_KEEP_FILES = ['.htaccess', 'update-source.php', 'library-source.php', 'integrations-source.php'];

// ---------------------------------------------------------------------------
// Source, keys, working folder
// ---------------------------------------------------------------------------
function cc_update_source() {
    $s = ['latest' => 'https://api.github.com/repos/sputlab/CanvasCore/releases/latest',
          'hosts' => ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'],
          'https' => true];
    $f = __DIR__ . '/update-source.php';
    if (is_file($f)) { $o = include $f; if (is_array($o)) $s = array_merge($s, $o); }
    $s['hosts'] = array_map('strtolower', (array)$s['hosts']);
    return $s;
}
// The trusted public keys (raw 32 bytes each). A release is installed only when one of them signed it.
function cc_update_keys() {
    $f = __DIR__ . '/update-keys.php';
    $list = is_file($f) ? include $f : [];
    $out = [];
    foreach (is_array($list) ? $list : [] as $k) {
        $raw = base64_decode(trim((string)$k), true);
        if ($raw !== false && strlen($raw) === 32) $out[] = $raw;
    }
    return $out;
}
function cc_update_dir() {
    $d = $GLOBALS['CC_UPDATE_DIR'] ?? (cc_data_dir() . '/updates');
    if (!is_dir($d)) @mkdir($d, 0755, true);
    ensure_htaccess($d, $GLOBALS['CC_HT_DENY']);
    return $d;
}
function cc_update_version($tag) {
    $t = preg_replace('/^v/i', '', trim((string)$tag));
    return preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', $t) ? $t : null;
}

// ---------------------------------------------------------------------------
// Downloads: HTTPS from an allowed host; redirects are followed one by one, so every hop's host is checked
// ---------------------------------------------------------------------------
function cc_update_url_ok($url, array $src) {
    $p = parse_url((string)$url);
    $scheme = strtolower((string)($p['scheme'] ?? ''));
    if (!$p || empty($p['host']) || isset($p['user']) || isset($p['pass'])) return false;
    if ($scheme !== 'https' && !($scheme === 'http' && empty($src['https']))) return false;
    return in_array(strtolower($p['host']), $src['hosts'], true);
}
// GET $url. $to: a file to write into (else the body is returned). Over $max bytes the download stops.
function cc_update_get($url, $to = null, $max = 1048576) {
    $src = cc_update_source();
    for ($hop = 0; $hop < 6; $hop++) {
        if (!cc_update_url_ok($url, $src)) throw new RuntimeException('The update server address is not allowed: ' . (parse_url((string)$url, PHP_URL_HOST) ?: $url) . '.');
        $r = cc_update_fetch($url, $to, $max);
        if ($r['code'] >= 300 && $r['code'] < 400 && $r['location'] !== '') {
            $loc = $r['location'];
            if (strpos($loc, '//') === 0) $loc = parse_url($url, PHP_URL_SCHEME) . ':' . $loc;
            elseif (!preg_match('~^https?://~i', $loc)) { $p = parse_url($url); $loc = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . ($loc[0] === '/' ? '' : '/') . $loc; }
            $url = $loc; continue;
        }
        if ($r['code'] !== 200) throw new RuntimeException('The update server answered with an error (' . $r['code'] . ').');
        return $r['body'];
    }
    throw new RuntimeException('The update server redirected too many times.');
}
function cc_update_fetch($url, $to, $max) {
    $fh = $to !== null ? @fopen($to, 'wb') : null;
    if ($to !== null && !$fh) throw new RuntimeException('The download could not be saved in the data folder.');
    $body = ''; $size = 0; $over = false; $location = '';
    $ua = 'CanvasCore/' . cc_version()['app'] . ' (updates)';
    $accept = 'Accept: application/vnd.github+json, application/octet-stream;q=0.9, */*;q=0.5';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 600, CURLOPT_USERAGENT => $ua, CURLOPT_HTTPHEADER => [$accept],
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HEADERFUNCTION => function ($ch, $h) use (&$location) { if (stripos($h, 'location:') === 0) $location = trim(substr($h, 9)); return strlen($h); },
            CURLOPT_WRITEFUNCTION => function ($ch, $d) use (&$body, &$size, &$over, $fh, $max) {
                $size += strlen($d);
                if ($size > $max) { $over = true; return 0; }
                if ($fh) fwrite($fh, $d); else $body .= $d;
                return strlen($d);
            },
        ]);
        if (defined('CURLOPT_PROTOCOLS')) curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS | CURLPROTO_HTTP);
        $ok = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch);
        unset($ch);
        if ($fh) fclose($fh);
        if ($over) throw new RuntimeException('The download is larger than expected, so it was stopped.');
        if ($ok === false) throw new RuntimeException('The update server could not be reached (' . $err . ').');
        return ['code' => $code, 'location' => $location, 'body' => $body];
    }
    if (!ini_get('allow_url_fopen')) throw new RuntimeException('This server can\'t download files: ask your host to enable the PHP curl extension.');
    $ctx = stream_context_create(['http' => ['follow_location' => 0, 'ignore_errors' => true, 'timeout' => 60, 'user_agent' => $ua, 'header' => $accept],
                                  'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $in = @fopen($url, 'rb', false, $ctx);
    if (!$in) { if ($fh) fclose($fh); throw new RuntimeException('The update server could not be reached.'); }
    $code = 0;
    foreach ((array)(stream_get_meta_data($in)['wrapper_data'] ?? []) as $h) {
        if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) { $code = (int)$m[1]; $location = ''; }
        elseif (stripos($h, 'location:') === 0) $location = trim(substr($h, 9));
    }
    while (!feof($in)) {
        $d = (string)fread($in, 65536); $size += strlen($d);
        if ($size > $max) { $over = true; break; }
        if ($fh) fwrite($fh, $d); else $body .= $d;
    }
    fclose($in); if ($fh) fclose($fh);
    if ($over) throw new RuntimeException('The download is larger than expected, so it was stopped.');
    return ['code' => $code, 'location' => $location, 'body' => $body];
}

// ---------------------------------------------------------------------------
// The latest release
// ---------------------------------------------------------------------------
// ['current', 'latest', 'available', 'name', 'notes', 'published_at', 'url', 'size', 'package'] + the package addresses (kept server side)
function cc_update_latest() {
    $rel = json_decode((string)cc_update_get(cc_update_source()['latest'], null, 2 * 1048576), true);
    if (!is_array($rel)) throw new RuntimeException('The update server did not send a release.');
    $ver = cc_update_version($rel['tag_name'] ?? '');
    if ($ver === null) throw new RuntimeException('The latest release has no version number CanvasCore understands.');
    $zip = $sig = null;
    foreach ((array)($rel['assets'] ?? []) as $a) {
        $n = (string)($a['name'] ?? '');
        if ($n === "canvascore-$ver.zip") $zip = $a;
        elseif ($n === "canvascore-$ver.zip.sig") $sig = $a;
    }
    $cur = cc_version()['app'];
    $page = (string)($rel['html_url'] ?? '');
    return [
        'current' => $cur, 'latest' => $ver, 'available' => version_compare($ver, $cur, '>'),
        'name' => mb_substr((string)($rel['name'] ?? ''), 0, 200), 'notes' => mb_substr((string)($rel['body'] ?? ''), 0, 20000),
        'published_at' => (string)($rel['published_at'] ?? ''), 'url' => preg_match('~^https://~i', $page) ? $page : '',
        'package' => $zip !== null && $sig !== null, 'size' => $zip ? (int)($zip['size'] ?? 0) : 0,
        'zip_url' => $zip ? (string)($zip['browser_download_url'] ?? '') : '', 'sig_url' => $sig ? (string)($sig['browser_download_url'] ?? '') : '',
    ];
}
// The check as the admin sees it (no download addresses); the last one is remembered
function cc_update_check() {
    $l = cc_update_latest();
    unset($l['zip_url'], $l['sig_url']);
    $l['checked_at'] = time();
    @file_put_contents(cc_update_dir() . '/last-check.json', json_encode($l), LOCK_EX);
    return $l;
}
function cc_update_last_check() {
    $l = json_decode((string)@file_get_contents(cc_update_dir() . '/last-check.json'), true);
    if (!is_array($l)) return null;
    $l['current'] = cc_version()['app'];
    $l['available'] = isset($l['latest']) && version_compare((string)$l['latest'], $l['current'], '>');
    return $l;
}

// What the server needs for an update; each ['id', 'label', 'ok']
function cc_update_requirements() {
    $admin = __DIR__; $parent = dirname($admin);
    $free = @disk_free_space($parent);
    return [
        ['id' => 'sodium', 'label' => 'Signature check (PHP sodium extension)', 'ok' => function_exists('sodium_crypto_sign_verify_detached')],
        ['id' => 'zip', 'label' => 'ZIP packages (PHP zip extension)', 'ok' => class_exists('ZipArchive')],
        ['id' => 'download', 'label' => 'Downloads (PHP curl extension)', 'ok' => function_exists('curl_init') || (bool)ini_get('allow_url_fopen')],
        ['id' => 'keys', 'label' => 'Trusted release keys (update-keys.php)', 'ok' => count(cc_update_keys()) > 0],
        ['id' => 'write', 'label' => 'The admin folder and the site folder can be written', 'ok' => cc_can_write($admin) && cc_can_write($parent)],
        ['id' => 'space', 'label' => 'Free disk space (at least 300 MB)', 'ok' => $free === false || $free > 300 * 1048576],
    ];
}

// ---------------------------------------------------------------------------
// Checks on the package
// ---------------------------------------------------------------------------
// The signature covers the package's SHA-256: Ed25519 over CC_UPDATE_SIG_CONTEXT . sha256(zip)
function cc_update_signed_message($file) { return CC_UPDATE_SIG_CONTEXT . hash_file('sha256', $file, true); }
function cc_update_verify($file, $sig_b64, array $keys) {
    if (!function_exists('sodium_crypto_sign_verify_detached') || !$keys) return false;
    $sig = base64_decode(trim((string)$sig_b64), true);
    if ($sig === false || strlen($sig) !== 64) return false;
    $msg = cc_update_signed_message($file);
    foreach ($keys as $k) { try { if (sodium_crypto_sign_verify_detached($sig, $msg, $k)) return true; } catch (Throwable $e) {} }
    return false;
}
// Every entry: a plain file or folder inside canvascore-admin/, with a safe relative name, not the data folder,
// not a link; within the size limits; with the required files and a version.json of the release's version.
// Returns the list of [entry index, path inside the admin folder] of the files to unpack.
function cc_update_inspect(ZipArchive $zip, $version) {
    $n = $zip->numFiles;
    if ($n < 1 || $n > CC_UPDATE_MAX_ENTRIES) throw new RuntimeException('The package has an unexpected number of files.');
    $files = []; $total = 0;
    for ($i = 0; $i < $n; $i++) {
        $st = $zip->statIndex($i);
        $name = (string)($st['name'] ?? '');
        if ($name === 'canvascore-admin/') continue;
        if (strpos($name, 'canvascore-admin/') !== 0 || strpos($name, '\\') !== false || strpos($name, "\0") !== false || preg_match('~(^|/)\.\.?(/|$)|//~', $name))
            throw new RuntimeException('The package contains a file outside the admin folder: ' . mb_substr($name, 0, 120));
        $rel = substr($name, strlen('canvascore-admin/'));
        $top = explode('/', $rel)[0];
        if ($top === 'data' || in_array($top, CC_UPDATE_KEEP_FILES, true)) throw new RuntimeException('The package contains a file that belongs to the site, not to CanvasCore: ' . mb_substr($rel, 0, 120));
        if ($zip->getExternalAttributesIndex($i, $os, $attr) && $os === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000)
            throw new RuntimeException('The package contains a link: ' . mb_substr($rel, 0, 120));
        if (substr($name, -1) === '/') continue;
        $total += (int)$st['size'];
        if ($total > CC_UPDATE_MAX_UNPACKED) throw new RuntimeException('The package is too large once unpacked.');
        $files[$rel] = $i;
    }
    foreach (CC_UPDATE_REQUIRED as $f) if (!isset($files[$f])) throw new RuntimeException('The package is incomplete: ' . $f . ' is missing.');
    $v = json_decode((string)$zip->getFromIndex($files['version.json']), true);
    if (!is_array($v) || (string)($v['app'] ?? '') !== $version) throw new RuntimeException('The package is not version ' . $version . ' (its version.json says ' . (is_array($v) ? (string)($v['app'] ?? '?') : '?') . ').');
    return $files;
}
// Unpacks the checked files into $dir (a new folder)
function cc_update_unpack(ZipArchive $zip, array $files, $dir) {
    if (!@mkdir($dir, 0755)) throw new RuntimeException('Could not create the folder for the new version.');
    foreach ($files as $rel => $i) {
        $dest = $dir . '/' . $rel;
        if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0755, true)) throw new RuntimeException('Could not unpack ' . $rel . '.');
        $in = $zip->getStream($zip->getNameIndex($i));
        $out = @fopen($dest, 'wb');
        if (!$in || !$out) throw new RuntimeException('Could not unpack ' . $rel . '.');
        stream_copy_to_stream($in, $out); fclose($in); fclose($out);
    }
}
// The PHP files of a folder can be parsed (a broken file would stop the whole admin): returns the first broken one or null
function cc_update_syntax_error($dir) {
    if (!function_exists('token_get_all') || !defined('TOKEN_PARSE')) return null;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (strtolower($f->getExtension()) !== 'php') continue;
        try { token_get_all((string)file_get_contents($f->getPathname()), TOKEN_PARSE); }
        catch (Throwable $e) { return substr($f->getPathname(), strlen($dir) + 1) . ' (line ' . $e->getLine() . ': ' . $e->getMessage() . ')'; }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------
// The database as one file (VACUUM INTO gives a consistent copy; a plain copy where SQLite is too old)
function cc_update_copy_db(PDO $pdo, $db_file, $dest) {
    try { $pdo->exec('VACUUM INTO ' . $pdo->quote($dest)); if (is_file($dest)) return; } catch (Throwable $e) {}
    if (!@copy($db_file, $dest)) throw new RuntimeException('Could not copy the database.');
}
// The current code (the admin folder without its data folder) as one ZIP
function cc_update_copy_code($admin, $dest) {
    $zip = new ZipArchive();
    if ($zip->open($dest, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Could not save a copy of the current version.');
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($admin, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $f) {
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($admin) + 1));
        if ($rel === 'data' || strpos($rel, 'data/') === 0 || $f->isLink()) continue;
        if ($f->isDir()) $zip->addEmptyDir('canvascore-admin/' . $rel);
        else $zip->addFile($f->getPathname(), 'canvascore-admin/' . $rel);
    }
    if (!$zip->close()) throw new RuntimeException('Could not save a copy of the current version.');
}
function cc_update_prune($pattern, $keep) {
    $list = glob(cc_update_dir() . '/' . $pattern) ?: [];
    usort($list, function ($a, $b) { return filemtime($b) <=> filemtime($a) ?: strcmp($b, $a); });
    foreach (array_slice($list, $keep) as $f) @unlink($f);
}

// ---------------------------------------------------------------------------
// The swap, and its undo
// ---------------------------------------------------------------------------
// The new folder takes the admin folder's place; the old one is kept at $old (outside the way) until the checks pass.
// The data folder (when it is inside the admin folder) and the site's own files go into the new folder.
function cc_update_swap($admin, $stage, $old) {
    foreach (CC_UPDATE_KEEP_FILES as $f) if (is_file("$admin/$f") && !@copy("$admin/$f", "$stage/$f")) throw new RuntimeException('Could not keep ' . $f . '.');
    if (!@rename($admin, $old)) throw new RuntimeException('Could not move the current version aside (check the folder permissions).');
    if (!@rename($stage, $admin)) { @rename($old, $admin); throw new RuntimeException('Could not put the new version in place, so the current one was kept.'); }
    if (is_dir("$old/data") && !@rename("$old/data", "$admin/data")) { cc_update_unswap($admin, $old, $stage); throw new RuntimeException('Could not move the data folder into the new version, so the current one was kept.'); }
    cc_update_opcache();
}
// Puts the old folder back ($failed: where the new one goes, deleted after)
function cc_update_unswap($admin, $old, $failed) {
    $ok = @rename($admin, $failed);
    if (!$ok) return false;
    if (!@rename($old, $admin)) { @rename($failed, $admin); return false; }
    if (is_dir("$failed/data") && !is_dir("$admin/data")) @rename("$failed/data", "$admin/data");
    cc_backup_rrmdir($failed);
    cc_update_opcache();
    return true;
}
function cc_update_opcache() {
    if (function_exists('opcache_reset')) @opcache_reset();
    clearstatcache(true);
}

// ---------------------------------------------------------------------------
// The new version's first answer (a one-time token, valid for two minutes)
// ---------------------------------------------------------------------------
function cc_update_health_token() {
    $t = bin2hex(random_bytes(24));
    file_put_contents(cc_update_dir() . '/health.json', json_encode(['hash' => hash('sha256', $t), 'expires' => time() + 120]), LOCK_EX);
    return $t;
}
// api.php?action=update_health, called by the update itself: by now api.php has opened the database and run the migrations
function cc_update_health_answer(PDO $pdo) {
    $f = cc_update_dir() . '/health.json';
    $rec = json_decode((string)@file_get_contents($f), true);
    $given = (string)($_SERVER['HTTP_X_CC_UPDATE_TOKEN'] ?? '');
    if (!is_array($rec) || $given === '' || ($rec['expires'] ?? 0) < time() || !hash_equals((string)($rec['hash'] ?? ''), hash('sha256', $given))) {
        http_response_code(404); echo json_encode(['success' => false]); exit;
    }
    @unlink($f);
    $v = cc_version();
    echo json_encode(['success' => true, 'app' => $v['app'], 'db_schema' => $v['db_schema'], 'db_schema_applied' => (int)cc_meta_get($pdo, 'db_schema', 0)]); exit;
}
// This server's own api.php address (from the request that runs the update)
function cc_update_self_url() {
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (!preg_match('/^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9a-fA-F:.]+\](:\d{1,5})?$/', $host)) return null;
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/canvascore-admin/api.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $dir . '/api.php?action=update_health';
}
// ['state' => 'ok' | 'skipped' | 'failed', 'message' => …, 'answer' => [...]]. "skipped": this server can't call itself
// (no connection, or the admin folder is behind a password): the new version then finishes on the next request.
function cc_update_health_check($version) {
    $url = cc_update_self_url();
    if ($url === null || !function_exists('curl_init')) return ['state' => 'skipped', 'message' => 'This server can\'t call itself.'];
    $token = cc_update_health_token();
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['X-CC-Update-Token: ' . $token, 'Accept: application/json'],
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 120, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_USERAGENT => 'CanvasCore update check']);
    if (defined('CURLOPT_REDIR_PROTOCOLS')) curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS | CURLPROTO_HTTP);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch);
    unset($ch);
    @unlink(cc_update_dir() . '/health.json');
    if ($body === false || $code === 0) return ['state' => 'skipped', 'message' => 'This server can\'t call itself (' . $err . ').'];
    if (in_array($code, [401, 403, 404], true)) return ['state' => 'skipped', 'message' => 'The server answered ' . $code . ' to its own check.'];
    $j = json_decode((string)$body, true);
    if ($code !== 200 || !is_array($j) || empty($j['success'])) return ['state' => 'failed', 'message' => 'The new version did not start (the server answered ' . $code . ').'];
    if ((string)($j['app'] ?? '') !== $version) return ['state' => 'failed', 'message' => 'The server still runs version ' . (string)($j['app'] ?? '?') . '.'];
    if ((int)($j['db_schema_applied'] ?? 0) < (int)($j['db_schema'] ?? 0)) return ['state' => 'failed', 'message' => 'The database could not be brought up to date.'];
    return ['state' => 'ok', 'message' => '', 'answer' => $j];
}

// ---------------------------------------------------------------------------
// The update
// ---------------------------------------------------------------------------
function cc_update_history($entry = null) {
    $f = cc_update_dir() . '/history.json';
    $list = json_decode((string)@file_get_contents($f), true);
    if (!is_array($list)) $list = [];
    if ($entry !== null) { array_unshift($list, $entry); $list = array_slice($list, 0, 20); @file_put_contents($f, json_encode($list), LOCK_EX); }
    return $list;
}

// Installs release $want (the version the admin was shown). Returns ['success', 'message', 'steps' => [[text, ok]], 'from', 'to', 'rolled_back']
// $health: replaces the call to the new version (tests).
function cc_update_install(PDO $pdo, $want, $user = '', $health = null) {
    @set_time_limit(0);
    ignore_user_abort(true);
    $admin = __DIR__; $parent = dirname($admin);
    $from = cc_version()['app'];
    $steps = []; $rolled_back = false; $done = false;
    $step = function ($text, $ok = true) use (&$steps) { $steps[] = [$text, $ok]; };
    $dir = cc_update_dir();
    $lock = @fopen($dir . '/.update.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['success' => false, 'message' => 'Another update is running. Wait for it to finish.', 'steps' => [], 'from' => $from, 'to' => $want, 'rolled_back' => false];
    $tag = bin2hex(random_bytes(6));
    $pkg = $dir . '/package-' . $tag . '.zip';
    $stage = $parent . '/.cc-update-new-' . $tag; $old = $parent . '/.cc-update-old-' . $tag;
    $db_file = cc_data_dir() . '/canvascore.sqlite';
    $db_copy = null; $swapped = false;
    try {
        foreach (cc_update_requirements() as $r) if (!$r['ok']) throw new RuntimeException('This server can\'t update itself: ' . $r['label'] . ' is missing.');
        $l = cc_update_latest();
        if ($l['latest'] !== (string)$want) throw new RuntimeException('The latest release is now ' . $l['latest'] . ', not ' . $want . '. Check again.');
        if (!$l['available']) throw new RuntimeException('Version ' . $want . ' is not newer than the installed ' . $from . '.');
        if (!$l['package']) throw new RuntimeException('Release ' . $want . ' has no signed update package.');
        $step('Found release ' . $want . '.');

        cc_update_get($l['zip_url'], $pkg, min(CC_UPDATE_MAX_BYTES, $l['size'] > 0 ? $l['size'] + 1024 : CC_UPDATE_MAX_BYTES));
        $sig = cc_update_get($l['sig_url'], null, 4096);
        $step('Downloaded the package (' . round(filesize($pkg) / 1048576, 1) . ' MB).');

        if (!cc_update_verify($pkg, $sig, cc_update_keys())) throw new RuntimeException('The package signature is not valid: it was not signed with a trusted CanvasCore key, so it was not installed.');
        $step('Signature verified.');

        $zip = new ZipArchive();
        if ($zip->open($pkg, ZipArchive::CHECKCONS) !== true) throw new RuntimeException('The package is not a valid ZIP file.');
        $files = cc_update_inspect($zip, $want);
        $step('Package checked (' . count($files) . ' files).');

        $safety = cc_backup_safety_copy($pdo);
        $stamp = date('Ymd-His');
        $db_copy = $dir . '/db-' . $from . '-' . $stamp . '-' . $tag . '.sqlite';
        cc_update_copy_db($pdo, $db_file, $db_copy);
        cc_update_copy_code($admin, $dir . '/code-' . $from . '-' . $stamp . '-' . $tag . '.zip');
        cc_update_prune('db-*.sqlite', CC_UPDATE_KEEP_COPIES);
        cc_update_prune('code-*.zip', CC_UPDATE_KEEP_COPIES);
        $step('Backup taken (content: ' . $safety . '; database and code copies in the data folder).');

        cc_update_unpack($zip, $files, $stage);
        $zip->close();
        if ($bad = cc_update_syntax_error($stage)) throw new RuntimeException('A file of the new version can\'t be read by PHP: ' . $bad . '.');
        $step('New version unpacked and checked.');

        cc_update_swap($admin, $stage, $old);
        $swapped = true;
        $step('New version in place.');

        $h = $health ? $health($want) : cc_update_health_check($want);
        if ($h['state'] === 'failed') throw new RuntimeException($h['message']);
        $step($h['state'] === 'ok' ? 'The new version started and the database is up to date.' : 'The new version finishes on the next page load (' . $h['message'] . ').');

        cc_backup_rrmdir($old);
        $done = true;
        $msg = 'CanvasCore was updated from ' . $from . ' to ' . $want . '. Reload the editor.';
    } catch (Throwable $e) {
        $msg = $e->getMessage();
        $step($msg, false);
        if (isset($zip) && $zip instanceof ZipArchive) { try { @$zip->close(); } catch (Throwable $e2) {} }
        if ($swapped) {
            $rolled_back = cc_update_unswap($admin, $old, $parent . '/.cc-update-failed-' . $tag);
            // the new version may have migrated the database: it is put back as it was before the update
            if ($rolled_back && $db_copy && is_file($db_copy)) {
                $tmp = $db_file . '.restore-' . $tag;
                if (@copy($db_copy, $tmp)) @rename($tmp, $db_file);
            }
            $step($rolled_back ? 'Rolled back: the previous version ' . $from . ' and its database are back in place.' : 'The rollback failed: restore the copy of the code saved in the data folder (updates/).', $rolled_back);
            $msg = $rolled_back ? 'The update was rolled back, nothing changed: ' . $msg : 'The update failed and could not be rolled back: ' . $msg;
        }
    } finally {
        @unlink($pkg);
        if (is_dir($stage)) cc_backup_rrmdir($stage);
        flock($lock, LOCK_UN); fclose($lock);
    }
    cc_update_history(['at' => time(), 'from' => $from, 'to' => (string)$want, 'by' => (string)$user,
        'result' => $done ? 'updated' : ($rolled_back ? 'rolled_back' : 'failed'), 'message' => $msg]);
    return ['success' => $done, 'message' => $msg, 'steps' => $steps, 'from' => $from, 'to' => (string)$want, 'rolled_back' => $rolled_back];
}
