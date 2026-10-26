<?php
// canvascore-admin/installlib.php
// The installation itself, shared by the setup wizard (install.php), the command line (install-cli.php) and the hosting installers
// (Softaculous and the like) that hand over the answers in a provisioning file: the state of the site, the checks of the answers,
// the creation of the database, the first account and the first settings. No page is drawn here.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';

// ---------------------------------------------------------------------------
// Installation state
// ---------------------------------------------------------------------------
function cc_install_state($db_file) {
    if (!file_exists($db_file)) return 'fresh';
    try {
        $pdo = new PDO('sqlite:' . $db_file);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
        if (in_array('cc_meta', $tables, true) && cc_meta_get($pdo, 'installed_at')) return 'installed';
        if (in_array('admin', $tables, true)) {
            foreach ($pdo->query("SELECT username, password_hash FROM admin") as $u) {
                if (!cc_is_default_admin($u)) return 'installed';
            }
        }
    } catch (Exception $e) {
        return 'error';
    }
    return 'fresh';
}

function cc_load_starters() {
    $file = __DIR__ . '/starters.json';
    $list = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    return is_array($list) ? $list : [];
}

// Regenerate block ids (like Templates.jsx) to avoid collisions between pages.
function cc_regen_block_ids(array $blocks) {
    static $seq = 0;
    foreach ($blocks as &$b) {
        if (!is_array($b)) continue;
        $b['id'] = 'block-' . (int)(microtime(true) * 1000) . '-' . ($seq++);
        if (isset($b['children']) && is_array($b['children'])) $b['children'] = cc_regen_block_ids($b['children']);
    }
    unset($b);
    return $blocks;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------
// The wizard: the answers plus the setup key of install-key.txt
function cc_install_validate($in, $starters, $key) {
    $err = cc_install_validate_fields($in, $starters);
    $sent = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $in['setup_key']));
    if ($key === null || $sent === '' || !hash_equals(str_replace('-', '', $key), $sent)) $err['setup_key'] = 'This is not the setup key in install-key.txt.';
    return $err;
}

// The answers themselves. The password is either typed (admin_pass, repeated in admin_pass2 when the form has it) or already hashed by
// whoever hands the answers over (admin_pass_hash: a hosting installer never has to leave a password lying in a file).
function cc_install_validate_fields($in, $starters) {
    $err = [];
    if ($in['site_name'] === '') $err['site_name'] = 'Enter the site name.';
    elseif (mb_strlen($in['site_name']) > 120) $err['site_name'] = 'Use at most 120 characters.';

    if ($in['site_url'] !== '' && !preg_match('#^https?://[^\s/$.?\#].[^\s]*$#i', $in['site_url'])) {
        $err['site_url'] = 'Enter a full address such as https://www.example.com, or leave it empty.';
    }

    if (!preg_match('/^[A-Za-z0-9._@-]{3,32}$/', $in['admin_user'])) {
        $err['admin_user'] = '3–32 characters: letters, numbers, dot, dash, underscore or @.';
    }

    $hash = (string)($in['admin_pass_hash'] ?? '');
    if ($hash !== '') {
        if ((password_get_info($hash)['algo'] ?? null) === null) $err['admin_pass'] = 'The password hash is not one PHP can verify (password_hash).';
    } elseif (strlen($in['admin_pass']) < 8) $err['admin_pass'] = 'Use at least 8 characters.';
    elseif (strtolower($in['admin_pass']) === 'admin' || $in['admin_pass'] === $in['admin_user']) $err['admin_pass'] = 'Choose a less guessable password.';
    elseif (isset($in['admin_pass2']) && !hash_equals($in['admin_pass'], $in['admin_pass2'])) $err['admin_pass2'] = 'The passwords do not match.';

    if ($in['admin_email'] !== '' && !filter_var($in['admin_email'], FILTER_VALIDATE_EMAIL)) {
        $err['admin_email'] = 'Enter a valid email address, or leave it empty.';
    }

    $ids = array_column($starters, 'id');
    if ($in['starter'] !== '' && !in_array($in['starter'], $ids, true)) $err['starter'] = 'Unknown starter.';
    return $err;
}

function cc_run_install($db_file, $data_dir, $in, $starters) {
    $pdo = new PDO('sqlite:' . $db_file);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    cc_migrate($pdo);           // create the schema
    cc_migrate_content($pdo);

    $pdo->beginTransaction();
    try {
        // Remove the old default admin/admin, if an earlier version created it: the only account allowed at this point.
        $del = $pdo->prepare("DELETE FROM admin WHERE id = ?");
        foreach ($pdo->query("SELECT id, username, password_hash FROM admin")->fetchAll(PDO::FETCH_ASSOC) as $u) {
            if (cc_is_default_admin($u)) $del->execute([$u['id']]);
        }
        $pdo->prepare("INSERT INTO admin (username, password_hash, role, must_change_pw, session_gen) VALUES (?, ?, 'admin', 0, 0)")
            ->execute([$in['admin_user'], (string)($in['admin_pass_hash'] ?? '') !== '' ? $in['admin_pass_hash'] : password_hash($in['admin_pass'], PASSWORD_DEFAULT)]);

        // Homepage (draft) from the chosen starter, only if the site has no pages yet.
        $page_created = false;
        if ($in['starter'] !== '' && (int)$pdo->query("SELECT COUNT(*) FROM pages")->fetchColumn() === 0) {
            foreach ($starters as $s) {
                if (($s['id'] ?? '') !== $in['starter']) continue;
                $blocks = cc_regen_block_ids(is_array($s['blocks'] ?? null) ? $s['blocks'] : []);
                $pdo->prepare("INSERT INTO pages (id, parent_id, title, slug, clean_slug, content_json, status, is_draft_copy, is_home, content_schema, author, updated_at)
                               VALUES (?, NULL, 'Home', 'home', 'home', ?, 'draft', 0, 1, ?, ?, ?)")
                    ->execute(['page-' . (int)(microtime(true) * 1000), json_encode($blocks), cc_version()['content_schema'], $in['admin_user'], date('Y-m-d H:i:s')]);
                $page_created = true;
            }
        }

        // Settings (merged with any existing ones): written before the commit, so an error rolls everything back.
        $file = $data_dir . '/settings.json';
        $settings = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
        if (!is_array($settings)) $settings = [];
        $settings['siteName'] = $in['site_name'];
        $settings['siteUrl'] = rtrim($in['site_url'], '/');
        if (!isset($settings['siteSuffix'])) $settings['siteSuffix'] = ' | ' . $in['site_name'];
        if ($in['admin_email'] !== '') $settings['adminEmail'] = $in['admin_email'];
        if (file_put_contents($file, json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new RuntimeException('Could not write settings.json');
        }

        cc_meta_set($pdo, 'installed_at', gmdate('c'));
        cc_meta_set($pdo, 'installed_version', cc_version()['app']);
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return $page_created;
}

// Is the data folder reachable over HTTP? A random test file is written there and requested from this same server
// (by its own address, never another host). 'exposed', 'protected' or 'unknown'.
function cc_install_probe_data($data_dir, $docroot) {
    $real = realpath($data_dir);
    if (!$docroot || !$real || !cc_path_inside($real, $docroot) || !ini_get('allow_url_fopen')) return 'unknown';
    $name = 'cc-probe-' . bin2hex(random_bytes(8)) . '.txt'; $secret = bin2hex(random_bytes(16));
    if (@file_put_contents($real . '/' . $name, $secret) === false) return 'unknown';
    $path = str_replace('%2F', '/', rawurlencode(str_replace('\\', '/', substr($real, strlen($docroot))))) . '/' . $name;
    $https = cc_is_https();
    $ip = (string)($_SERVER['SERVER_ADDR'] ?? '127.0.0.1'); if ($ip === '' || $ip === '0.0.0.0' || $ip === '::') $ip = '127.0.0.1';
    $port = (int)($_SERVER['SERVER_PORT'] ?? ($https ? 443 : 80));
    $host = preg_replace('/[^A-Za-z0-9.:\[\]-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $url = ($https ? 'https' : 'http') . '://' . (strpos($ip, ':') !== false ? '[' . $ip . ']' : $ip) . ':' . $port . $path;
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => 'Host: ' . $host . "\r\n", 'timeout' => 4, 'follow_location' => 0, 'ignore_errors' => true],
                                  'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'peer_name' => preg_replace('/:\d+$/', '', $host)]]);
    $body = @file_get_contents($url, false, $ctx, 0, 256);
    @unlink($real . '/' . $name);
    if ($body === false) return 'unknown';
    return trim($body) === $secret ? 'exposed' : 'protected';
}

// ---------------------------------------------------------------------------
// Unattended installation (command line, hosting installers)
// ---------------------------------------------------------------------------
const CC_PROVISION_FILE = 'install-provision.json';

// The answers a hosting installer left for the site: canvascore-admin/install-provision.json, written by someone who can write to the
// server's files (so the setup key's proof is already given). Deleted as soon as it has been used. null when there is none.
function cc_provision_path() { return __DIR__ . '/' . CC_PROVISION_FILE; }
function cc_provision_read() {
    $f = cc_provision_path();
    if (!is_file($f)) return null;
    $d = json_decode((string)@file_get_contents($f), true);
    return is_array($d) ? $d : [];
}

// Installs with the given answers: site_name, site_url, admin_user, admin_pass or admin_pass_hash, admin_email, starter, delete_installer.
// Returns ['success' => bool, 'message' => string, 'errors' => [field => message]]. It never signs anyone in and never prints.
function cc_install_unattended(array $raw) {
    $in = ['site_name' => '', 'site_url' => '', 'admin_user' => '', 'admin_pass' => '', 'admin_pass_hash' => '', 'admin_email' => '', 'starter' => ''];
    foreach ($in as $k => $_) $in[$k] = is_string($raw[$k] ?? null) ? trim($raw[$k]) : '';
    if ($in['site_url'] !== '') $in['site_url'] = rtrim($in['site_url'], '/');
    $fail = function ($msg, $errors = []) { return ['success' => false, 'message' => $msg, 'errors' => $errors]; };

    $data_dir = cc_data_dir();
    $db_file = $data_dir . '/canvascore.sqlite';
    $state = cc_install_state($db_file);
    if ($state === 'installed') return $fail('CanvasCore is already installed on this server.');
    if ($state === 'error') return $fail('A database exists in the data folder but it could not be opened.');
    if (!cc_can_write($data_dir)) return $fail('The data folder is not writable: ' . $data_dir);
    // the same refusal as the wizard's server check: a data folder inside the web root that anyone can download would publish the database
    $docroot = cc_doc_root();
    if ($docroot && cc_path_inside($data_dir, $docroot) && cc_install_probe_data($data_dir, $docroot) === 'exposed') return $fail('The data folder is inside the web root and can be downloaded by anyone (' . $data_dir . '): the database and passwords would be public. Make canvascore-data next to the web root writable, or deny web access to the folder.');
    $starters = cc_load_starters();
    $errors = cc_install_validate_fields($in, $starters);
    if ($errors) return $fail('The answers are not valid: ' . implode(' ', $errors), $errors);

    $lock = @fopen($data_dir . '/.install.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return $fail('Another installation is running.');
    try {
        if (cc_install_state($db_file) !== 'fresh') return $fail('CanvasCore is already installed on this server.');
        $page = cc_run_install($db_file, $data_dir, $in, $starters);
        @unlink($data_dir . '/install-key.txt');
    } catch (Throwable $e) {
        error_log('CanvasCore install: ' . $e->getMessage());
        return $fail('Installation failed because of a server error. Details are in the server error log.');
    } finally { flock($lock, LOCK_UN); fclose($lock); }
    $removed = false;
    if (!empty($raw['delete_installer']) && $raw['delete_installer'] !== 'false') $removed = @unlink(__DIR__ . '/install.php');
    return ['success' => true, 'message' => 'CanvasCore is installed.' . ($page ? ' A draft homepage was created.' : '') . ($removed ? ' install.php was deleted.' : ''), 'errors' => []];
}

// install.php, on a site that is not installed yet: uses the provisioning file, if there is one, and deletes it either way (a file with
// answers is never left behind). null when there was none, else cc_install_unattended()'s result.
function cc_install_from_provision() {
    $d = cc_provision_read();
    if ($d === null) return null;
    @unlink(cc_provision_path());
    return cc_install_unattended($d);
}
