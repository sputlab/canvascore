<?php
// canvascore-admin/install.php
// Setup wizard: requirements check, DB creation (same migrations as api.php),
// administrator account replacing the default admin/admin, basic site settings and
// optional homepage from a starter. Once installation is complete it locks itself and offers to delete itself.
//
// The site counts as "installed" when:
//   - cc_meta contains installed_at (installation done by this wizard), or
//   - at least one account other than the old default admin/admin exists (pre-existing installation).
// Proof of server access: the form asks for the setup key written to install-key.txt in the data folder, so only
// someone who can open the server's files can install (nobody can take over a freshly uploaded site first).
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/installlib.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
ini_set('display_errors', '0');
cc_session_start();

const CC_INSTALL_MIN_PHP = '8.0.0';

$data_dir = cc_data_dir();
$db_file  = $data_dir . '/canvascore.sqlite';
$site_dir = dirname(__DIR__);
ensure_admin_htaccess(__DIR__);

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }



// ---------------------------------------------------------------------------
// Requirements: [label, 'ok'|'warn'|'fail', detail]
// ---------------------------------------------------------------------------
function cc_dir_writable_or_creatable($dir) {
    if (is_dir($dir)) return cc_can_write($dir);
    $parent = dirname($dir);
    return is_dir($parent) && cc_can_write($parent);
}

function cc_install_requirements($data_dir, $site_dir) {
    $r = [];

    $php_ok = version_compare(PHP_VERSION, CC_INSTALL_MIN_PHP, '>=');
    $r[] = ['PHP version', $php_ok ? 'ok' : 'fail', PHP_VERSION . ($php_ok ? '' : ' — ' . CC_INSTALL_MIN_PHP . ' or newer is required')];

    $sqlite = extension_loaded('pdo_sqlite');
    $r[] = ['SQLite (pdo_sqlite)', $sqlite ? 'ok' : 'fail', $sqlite ? 'Available' : 'Enable the pdo_sqlite extension'];

    foreach (['json' => 'JSON', 'session' => 'Sessions'] as $ext => $label) {
        $ok = extension_loaded($ext);
        $r[] = [$label, $ok ? 'ok' : 'fail', $ok ? 'Available' : "Enable the $ext extension"];
    }

    $zip = class_exists('ZipArchive');
    $r[] = ['ZIP extension', $zip ? 'ok' : 'warn', $zip ? 'Available' : 'Missing: whole-site backups (Backup page) cannot be made or restored'];

    $dom = class_exists('DOMDocument');
    $r[] = ['DOM extension', $dom ? 'ok' : 'fail', $dom ? 'Available' : 'Enable the dom extension (php-xml): rich text and SVG images are checked with it'];

    $data_ok = cc_can_write($data_dir);
    $docroot = cc_doc_root();
    $inside = $docroot ? cc_path_inside($data_dir, $docroot) : cc_path_inside($data_dir, $site_dir);
    if (!$data_ok) {
        $r[] = ['Data folder', 'fail', 'Not writable: ' . $data_dir];
    } elseif (!$inside) {
        $r[] = ['Data folder', 'ok', 'Outside the web root: ' . $data_dir];
    } else {
        // Inside the web root: it must not be downloadable. Checked for real with a test file.
        $probe = cc_install_probe_data($data_dir, $docroot);
        $fix = 'Make ' . ($docroot ? dirname($docroot) : dirname($site_dir)) . '/canvascore-data writable (CanvasCore then uses it), or deny web access to ' . $data_dir . ' (Nginx: see the Administrator Guide).';
        if ($probe === 'exposed') $r[] = ['Data folder', 'fail', 'Inside the web root and DOWNLOADABLE by anyone (' . $data_dir . '): the database and passwords would be public. ' . $fix];
        elseif ($probe === 'protected') $r[] = ['Data folder', 'warn', 'Inside the web root (' . $data_dir . '), protected by the server right now. Safer: ' . $fix];
        else $r[] = ['Data folder', 'warn', 'Inside the web root (' . $data_dir . ') and it could not be checked whether it is protected. ' . $fix];
    }

    $site_ok = cc_can_write($site_dir);
    $r[] = ['Site folder (published pages)', $site_ok ? 'ok' : 'fail', $site_ok ? $site_dir : 'Not writable: ' . $site_dir . ' — pages cannot be published'];

    $up_ok = cc_dir_writable_or_creatable($site_dir . '/uploads');
    $r[] = ['Uploads folder', $up_ok ? 'ok' : 'warn', $up_ok ? $site_dir . '/uploads' : 'Not writable: ' . $site_dir . '/uploads — media uploads will fail'];

    $upload_on = (bool)ini_get('file_uploads');
    $r[] = ['File uploads', $upload_on ? 'ok' : 'warn', $upload_on ? 'Max file size ' . ini_get('upload_max_filesize') . ', max post ' . ini_get('post_max_size') : 'Disabled in php.ini (file_uploads)'];

    $editor = file_exists(__DIR__ . '/index.html');
    $r[] = ['Editor build', $editor ? 'ok' : 'warn', $editor ? 'index.html found' : 'index.html missing: copy the contents of canvascore-frontend/dist/ into this folder'];

    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    $mail = function_exists('mail') && !in_array('mail', $disabled, true);
    $r[] = ['mail()', $mail ? 'ok' : 'warn', $mail ? 'Available (form notifications)' : 'Unavailable: form submissions are stored but no email is sent'];

    $https = cc_is_https();
    $r[] = ['HTTPS', $https ? 'ok' : 'warn', $https ? 'Secure connection' : 'Not using HTTPS: passwords and session cookies travel unencrypted'];

    return $r;
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

// The setup key (install-key.txt in the data folder), created on first use
function cc_install_key($data_dir) {
    $f = $data_dir . '/install-key.txt';
    $k = is_file($f) ? trim((string)@file_get_contents($f)) : '';
    if (!preg_match('/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/', $k)) {
        $alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $k = '';
        for ($i = 0; $i < 20; $i++) $k .= ($i && $i % 4 === 0 ? '-' : '') . $alpha[random_int(0, strlen($alpha) - 1)];
        if (@file_put_contents($f, $k . "\n", LOCK_EX) === false) return null;
        @chmod($f, 0600);
    }
    return $k;
}

function cc_has_failures($reqs) {
    foreach ($reqs as $q) if ($q[1] === 'fail') return true;
    return false;
}


function cc_default_site_url() {
    $scheme = cc_is_https() ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/', 2)), '/');
    return $scheme . '://' . $host . $base;
}


// Automatic sign-in with the new account (same session as api.php?action=login).
function cc_install_login($db_file, $username) {
    $pdo = new PDO('sqlite:' . $db_file);
    $st = $pdo->prepare("SELECT id, username, role, session_gen FROM admin WHERE username = ?"); $st->execute([$username]);
    $u = $st->fetch(PDO::FETCH_ASSOC);
    if ($u) cc_session_login($u);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
if (empty($_SESSION['install_csrf'])) $_SESSION['install_csrf'] = bin2hex(random_bytes(32));
$csrf = $_SESSION['install_csrf'];

// Answers left by a hosting installer (Softaculous…): used once, then the file is deleted. ?format=json answers a script instead of drawing the page.
$prov = cc_install_from_provision();
if (($_GET['format'] ?? '') === 'json') {
    header('Content-Type: application/json; charset=utf-8');
    $res = $prov ?? ['success' => false, 'message' => 'There are no answers to install with (install-provision.json).', 'errors' => []];
    if (!$res['success']) http_response_code(409);
    echo json_encode($res); exit;
}
$state     = cc_install_state($db_file);
$reqs      = cc_install_requirements($data_dir, $site_dir);
$starters  = cc_load_starters();
$errors    = [];
$view      = $state === 'installed' ? 'installed' : ($state === 'error' ? 'error' : 'form');
$notice    = $prov && !$prov['success'] ? $prov['message'] : '';
$page_created = false;
$in = [
    'site_name' => '', 'site_url' => cc_default_site_url(), 'admin_user' => '',
    'admin_pass' => '', 'admin_pass2' => '', 'admin_email' => '', 'starter' => '', 'setup_key' => '',
];
$setup_key = $state === 'fresh' ? cc_install_key($data_dir) : null;
if ($setup_key === null && $state === 'fresh') $reqs[] = ['Setup key', 'fail', 'install-key.txt could not be written in the data folder: ' . $data_dir];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $sent = (string)($_POST['csrf'] ?? '');
    if ($sent === '' || !hash_equals($csrf, $sent)) {
        http_response_code(403);
        $view = $state === 'installed' ? 'installed' : 'form';
        $notice = 'Your session expired. Please submit the form again.';
    } elseif (($_POST['action'] ?? '') === 'delete_installer') {
        // Allowed only once installation is complete: removes this file from the server.
        if ($state === 'installed') {
            $view = @unlink(__FILE__) ? 'deleted' : 'installed';
            if ($view !== 'deleted') $notice = 'install.php could not be deleted automatically. Remove it from the server manually.';
        }
    } elseif ($state === 'fresh') {
        foreach (array_keys($in) as $k) $in[$k] = is_string($_POST[$k] ?? null) ? $_POST[$k] : '';
        foreach (['site_name', 'site_url', 'admin_user', 'admin_email', 'starter', 'setup_key'] as $k) $in[$k] = trim($in[$k]);

        if (cc_has_failures($reqs)) {
            $notice = 'Fix the failed requirements before installing.';
        } else {
            $errors = cc_install_validate($in, $starters, $setup_key);
            if (!$errors) {
                // One installation at a time: the state is checked again under a lock
                $lock = @fopen($data_dir . '/.install.lock', 'c');
                if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
                    $notice = 'Another installation is running. Reload this page in a moment.';
                } elseif (cc_install_state($db_file) !== 'fresh') {
                    $view = 'installed';
                } else {
                    try {
                        $page_created = cc_run_install($db_file, $data_dir, $in, $starters);
                        @unlink($data_dir . '/install-key.txt');
                        cc_install_login($db_file, $in['admin_user']);
                        $view = 'done';
                    } catch (Exception $e) {
                        error_log('CanvasCore install: ' . $e->getMessage());
                        $notice = 'Installation failed because of a server error. Details are in the server error log.';
                    }
                }
                if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
            }
        }
    }
}

// Passwords and the setup key are never sent back to the browser.
$in['admin_pass'] = $in['admin_pass2'] = $in['setup_key'] = '';
$version = cc_version()['app'];
$has_failures = cc_has_failures($reqs);
$editor_exists = file_exists(__DIR__ . '/index.html');

$field = function ($name, $label, $type = 'text', $attrs = '', $hint = '') use ($in, $errors) {
    $e = $errors[$name] ?? '';
    $val = $type === 'password' ? '' : $in[$name];
    return '<label class="field' . ($e ? ' has-error' : '') . '"><span>' . h($label) . '</span>'
        . '<input type="' . h($type) . '" name="' . h($name) . '" value="' . h($val) . '" ' . $attrs
        . ($e ? ' aria-invalid="true"' : '') . '>'
        . ($e ? '<small class="error">' . h($e) . '</small>' : ($hint ? '<small>' . h($hint) . '</small>' : ''))
        . '</label>';
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>CanvasCore setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0f172a; color: #e2e8f0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 40px 16px; }
  .wrap { max-width: 640px; margin: 0 auto; }
  .brand { display: flex; align-items: baseline; gap: 10px; margin-bottom: 24px; }
  .brand h1 { margin: 0; font-size: 24px; color: #fff; }
  .brand span { color: #64748b; font-size: 13px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  .card h2 { margin: 0 0 4px; font-size: 17px; color: #fff; }
  .card > p { margin: 0 0 16px; color: #94a3b8; font-size: 14px; }
  .req { list-style: none; margin: 0; padding: 0; }
  .req li { display: grid; grid-template-columns: 22px 1fr; gap: 2px 10px; padding: 9px 0; border-top: 1px solid #334155; }
  .req li:first-child { border-top: 0; }
  .req b { font-weight: 600; color: #e2e8f0; }
  .req small { grid-column: 2; color: #94a3b8; overflow-wrap: anywhere; }
  .dot { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .ok .dot { background: #4ade80; } .warn .dot { background: #fbbf24; } .fail .dot { background: #f87171; }
  .field { display: block; margin-bottom: 14px; }
  .field span { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #cbd5e1; }
  .field input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; font: inherit; }
  .field input:focus { outline: 2px solid #3b82f6; outline-offset: 1px; border-color: #3b82f6; }
  .field small { display: block; margin-top: 5px; color: #94a3b8; font-size: 12px; }
  .field.has-error input { border-color: #f87171; }
  .field small.error { color: #fca5a5; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
  .starters { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .starter { display: block; position: relative; border: 1px solid #475569; border-radius: 10px; padding: 12px; cursor: pointer; background: #0f172a; }
  .starter input { position: absolute; opacity: 0; }
  .starter strong { display: block; color: #fff; font-size: 14px; }
  .starter small { color: #94a3b8; font-size: 12px; }
  .starter:has(input:checked) { border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
  .starter:has(input:focus-visible) { outline: 2px solid #3b82f6; outline-offset: 2px; }
  .btn { display: inline-block; padding: 12px 20px; border-radius: 8px; border: 0; background: #3b82f6; color: #fff; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; }
  .btn:hover { background: #2563eb; }
  .btn[disabled] { background: #334155; color: #64748b; cursor: not-allowed; }
  .btn.secondary { background: transparent; border: 1px solid #475569; color: #e2e8f0; }
  .btn.danger { background: #b91c1c; } .btn.danger:hover { background: #991b1b; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .notice { padding: 12px 14px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; background: #451a03; border: 1px solid #b45309; color: #fde68a; }
  .notice.ok { background: #052e16; border-color: #15803d; color: #bbf7d0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  code { background: #0f172a; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
  ol.steps { margin: 0; padding-left: 20px; color: #cbd5e1; } ol.steps li { margin-bottom: 6px; }
</style>
</head>
<body>
<main class="wrap">
  <div class="brand"><h1>CanvasCore</h1><span>Setup · v<?= h($version) ?></span></div>

  <?php if ($notice): ?><div class="notice" role="alert"><?= h($notice) ?></div><?php endif; ?>

  <?php if ($view === 'done'): ?>
    <div class="notice ok" role="status">CanvasCore is installed and you are signed in as <strong><?= h($in['admin_user']) ?></strong>.</div>
    <section class="card">
      <h2>Next steps</h2>
      <ol class="steps">
        <?php if ($page_created): ?><li>Open <strong>Home</strong> in the page list and press <strong>Publish</strong> to put it online.</li><?php else: ?><li>Create your first page and press <strong>Publish</strong>.</li><?php endif; ?>
        <li>Review the remaining options under <strong>Settings</strong> (brand color, fonts, form email).</li>
        <li>Delete this installer from the server.</li>
      </ol>
    </section>
    <form method="post" class="actions">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="delete_installer">
      <?php if ($editor_exists): ?><a class="btn" href="index.html">Open the editor</a><?php endif; ?>
      <button class="btn danger" type="submit">Delete install.php</button>
    </form>

  <?php elseif ($view === 'deleted'): ?>
    <div class="notice ok" role="status">install.php has been deleted.</div>
    <?php if ($editor_exists): ?><a class="btn" href="index.html">Open the editor</a><?php endif; ?>

  <?php elseif ($view === 'installed'): ?>
    <section class="card">
      <h2>Already installed</h2>
      <p>CanvasCore is already set up on this server, so the installer is locked. For safety, delete <code>install.php</code>.</p>
      <form method="post" class="actions">
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
        <input type="hidden" name="action" value="delete_installer">
        <?php if ($editor_exists): ?><a class="btn secondary" href="index.html">Open the editor</a><?php endif; ?>
        <button class="btn danger" type="submit">Delete install.php</button>
      </form>
    </section>

  <?php elseif ($view === 'error'): ?>
    <section class="card">
      <h2>Database unreadable</h2>
      <p>A database exists in the data folder but it could not be opened. Check its permissions, or move <code>canvascore.sqlite</code> away to start a fresh installation.</p>
    </section>

  <?php else: ?>
    <section class="card">
      <h2>Server check</h2>
      <p><?= $has_failures ? 'Fix the items marked in red, then reload this page.' : 'Your server can run CanvasCore. Items in yellow are worth a look but do not block the installation.' ?></p>
      <ul class="req">
        <?php foreach ($reqs as [$label, $status, $detail]): ?>
          <li class="<?= h($status) ?>"><span class="dot" aria-hidden="true"><?= $status === 'ok' ? '✓' : ($status === 'warn' ? '!' : '✕') ?></span>
            <b><?= h($label) ?><span class="sr"> — <?= h($status) ?></span></b><small><?= h($detail) ?></small></li>
        <?php endforeach; ?>
      </ul>
    </section>

    <form method="post" novalidate>
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <section class="card">
        <h2>1. Setup key</h2>
        <p>To prove this is your server, open the file <code>install-key.txt</code> in the data folder
          (<code><?= h($data_dir) ?></code>) with your hosting file manager or FTP, and paste its content here.
          It is deleted when the installation is complete.</p>
        <?= $field('setup_key', 'Setup key', 'text', 'required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"') ?>
      </section>
      <section class="card">
        <h2>2. Your site</h2>
        <p>You can change these later in Settings.</p>
        <?= $field('site_name', 'Site name', 'text', 'required maxlength="120" autocomplete="organization"') ?>
        <?= $field('site_url', 'Site address', 'url', 'placeholder="https://www.example.com" inputmode="url"', 'Used for the sitemap and social previews. Detected from this request.') ?>
      </section>

      <section class="card">
        <h2>3. Administrator account</h2>
        <p>The first account. Choose a username that is hard to guess (not <code>admin</code>) and a strong password.</p>
        <?= $field('admin_user', 'Username', 'text', 'required minlength="3" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false"') ?>
        <div class="row">
          <?= $field('admin_pass', 'Password', 'password', 'required minlength="8" autocomplete="new-password"', 'At least 8 characters.') ?>
          <?= $field('admin_pass2', 'Repeat password', 'password', 'required minlength="8" autocomplete="new-password"') ?>
        </div>
        <?= $field('admin_email', 'Email for form submissions (optional)', 'email', 'autocomplete="email"', 'Where contact form messages are sent.') ?>
      </section>

      <?php if ($starters): ?>
      <section class="card">
        <h2>4. Homepage</h2>
        <p>Optionally start with a ready-made homepage. It is created as a draft for you to edit and publish.</p>
        <?php if (!empty($errors['starter'])): ?><div class="notice" role="alert"><?= h($errors['starter']) ?></div><?php endif; ?>
        <div class="starters">
          <label class="starter"><input type="radio" name="starter" value="" <?= $in['starter'] === '' ? 'checked' : '' ?>><strong>No page</strong><small>Start with an empty site.</small></label>
          <?php foreach ($starters as $s): if (!isset($s['id'])) continue; ?>
            <label class="starter"><input type="radio" name="starter" value="<?= h($s['id']) ?>" <?= $in['starter'] === $s['id'] ? 'checked' : '' ?>><strong><?= h($s['name'] ?? $s['id']) ?></strong><small><?= h($s['description'] ?? '') ?></small></label>
          <?php endforeach; ?>
        </div>
      </section>
      <?php endif; ?>

      <div class="actions">
        <button class="btn" type="submit" <?= $has_failures ? 'disabled' : '' ?>>Install CanvasCore</button>
      </div>
    </form>
  <?php endif; ?>
</main>
</body>
</html>
