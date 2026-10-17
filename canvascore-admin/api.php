<?php
// canvascore-admin/api.php
// CanvasCore — API backend (Phase 1: CSRF, hardened session, data outside the web root, hardening)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/media.php';
require_once __DIR__ . '/backup.php';
header('Content-Type: application/json');
header('Cache-Control: no-store');
cc_security_headers();
// PHP notices/warnings must never be printed into a JSON answer (the client could not read it): log them
ini_set('display_errors', '0');
ini_set('log_errors', '1');

$data_dir = cc_data_dir();
$db_file = $data_dir . '/canvascore.sqlite';
ensure_admin_htaccess(__DIR__);
if (is_dir(__DIR__ . '/../uploads')) ensure_htaccess(__DIR__ . '/../uploads', $GLOBALS['CC_HT_UPLOADS']);   // kept up to date after updates

try {
    $pdo = new PDO("sqlite:" . $db_file);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Versioned schema migrations (new and existing installs) + content migrations.
    cc_migrate($pdo);
    cc_migrate_content($pdo);
} catch (Exception $e) {
    error_log('CanvasCore database error: ' . $e->getMessage());
    http_response_code(500);
    die(json_encode(['success' => false, 'message' => 'The database could not be opened. Check the server error log.']));
}


// Once, after updating to 0.14.1: SVG images uploaded before the stricter check are checked again; the ones that
// fail are moved out of the site into the data folder (quarantine/), so they can no longer be opened.
if (!cc_meta_get($pdo, 'svg_recheck_v1')) {
    $updir = __DIR__ . '/../uploads';
    foreach (is_dir($updir) ? (glob($updir . '/*.[sS][vV][gG]') ?: []) : [] as $svgf) {
        if (cc_svg_is_safe($svgf)) continue;
        @mkdir($data_dir . '/quarantine', 0700, true);
        if (@rename($svgf, $data_dir . '/quarantine/' . basename($svgf))) error_log('CanvasCore: unsafe SVG moved to quarantine: ' . basename($svgf));
    }
    try { cc_meta_set($pdo, 'svg_recheck_v1', gmdate('c')); } catch (Exception $e) {}
}

$action = (string)($_GET['action'] ?? '');

// Until the setup wizard has run there are no accounts: everything except the public answers points to install.php
if (!cc_is_installed($pdo) && !in_array($action, ['branding', 'session_status', 'check_auth'], true)) {
    http_response_code(503);
    die(json_encode(['success' => false, 'code' => 'not_installed', 'message' => 'CanvasCore is not set up yet: open install.php in this folder to create the administrator account.']));
}

// A POST without a valid session is "unauthenticated" (401), NOT "bad CSRF" (403): this way the client
// can always tell an expired session from a token that needs refreshing.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action !== 'login' && $action !== 'logout' && !cc_session_is_logged_in()) {
    cc_unauthorized();
}

// CSRF + same-origin on every state-changing POST, except login.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action !== 'login') {
    cc_verify_csrf_or_die();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// Public branding for the sign-in screen and the admin shell: only the site name and the favicon address
// (both already public on the published site). Nothing else from the settings is exposed here.
if ($action === 'branding') {
    session_write_close();
    $s = @json_decode((string)@file_get_contents($data_dir . '/settings.json'), true);
    $out = cc_public_branding(is_array($s) ? $s : []);
    // Demo mode: the public demo login is shown on the sign-in screen (never the password of a real account)
    if ($demo = cc_demo_config()) $out['demo'] = ['username' => $demo['username'], 'password' => $demo['password'], 'resetMinutes' => $demo['resetMinutes'],
        'nextResetIn' => cc_demo_next_reset(), 'maxNewPages' => $demo['maxNewPages'], 'maxNewItems' => $demo['maxNewItems']];
    echo json_encode($out); exit;
}

// READ-ONLY session status: does not extend the session (background polling must not
// keep it from expiring due to inactivity). Releases the session lock immediately.
if ($action === 'session_status') {
    $acc = cc_session_account($pdo);
    $out = [
        'authenticated' => (bool)$acc,
        'username' => $acc ? $acc['username'] : null,
        'role' => $acc ? $_SESSION['role'] : null,
        'expires_in' => cc_session_expires_in(),
        'timeout' => cc_session_limit(),
        'expired' => !empty($GLOBALS['CC_SESSION_EXPIRED']),
    ];
    session_write_close();
    echo json_encode($out); exit;
}

if ($action === 'check_auth') {
    $acc = cc_session_account($pdo);
    $out = ['authenticated' => (bool)$acc, 'installed' => cc_is_installed($pdo), 'role' => $acc ? ($acc['role'] === 'admin' ? 'admin' : 'editor') : null,
            'username' => $acc ? $acc['username'] : null, 'must_change_pw' => $acc ? (int)$acc['must_change_pw'] : 0];
    if ($acc) $out += ['csrf' => cc_issue_csrf(), 'expires_in' => cc_session_expires_in(), 'timeout' => cc_session_limit()];
    echo json_encode($out);
    exit;
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    // JSON only (a form on another site can't send it without CORS), from this site only: no login CSRF
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0 || !cc_same_origin_request()) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Sign in from the CanvasCore sign-in screen.']); exit;
    }
    $data = json_decode(file_get_contents('php://input'), true);
    $username = mb_substr(trim((string)($data['username'] ?? '')), 0, 64);
    $password = (string)($data['password'] ?? '');
    if ($username === '' || $password === '' || strlen($password) > 4096) { echo json_encode(['success' => false, 'message' => 'Invalid credentials.']); exit; }
    // Brute force protection (counted before the check, see cc_login_begin)
    $wait = cc_login_begin($username);
    if ($wait > 0) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Too many failed attempts. Try again in ' . max(1, (int)ceil($wait / 60)) . ' minute(s).']); exit;
    }
    $stmt = $pdo->prepare("SELECT id, username, password_hash, role, must_change_pw, session_gen FROM admin WHERE username = ? COLLATE NOCASE");
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    // An unknown name takes as long as a wrong password (no way to tell which accounts exist)
    $dummy = cc_meta_get($pdo, 'dummy_hash');
    if (!$dummy) { $dummy = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT); cc_meta_set($pdo, 'dummy_hash', $dummy); }
    $ok = password_verify($password, $user ? (string)$user['password_hash'] : $dummy);
    // The old default account (admin/admin) is never accepted: install.php creates the first real account
    if ($ok && $user && !cc_is_default_admin($user)) {
        cc_login_result($username, true);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) $pdo->prepare("UPDATE admin SET password_hash = ? WHERE id = ?")->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        cc_session_login($user);
        echo json_encode(['success' => true, 'role' => $_SESSION['role'], 'username' => $user['username'], 'csrf' => cc_issue_csrf(), 'must_change_pw' => (int)($user['must_change_pw'] ?? 0), 'expires_in' => cc_session_expires_in(), 'timeout' => cc_session_limit()]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid credentials.']);
    }
    exit;
}

if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    cc_session_logout();
    echo json_encode(['success' => true]); exit;
}

// Gate: everything below requires login, with an account that still exists unchanged (see cc_session_account)
$account = cc_session_account($pdo);
if (!$account) {
    cc_unauthorized();
}
// A forced password change comes first: until then the account can only change its password or sign out
if ((int)$account['must_change_pw'] === 1 && !in_array($action, ['change_own_password', 'keepalive', 'version'], true)) {
    http_response_code(403);
    die(json_encode(['success' => false, 'code' => 'must_change_pw', 'message' => 'Choose a new password first.']));
}
// From here on it is user activity: extend the session.
cc_session_touch();

if ($action === 'version') {
    session_write_close();
    $v = cc_version();
    $v['db_schema_applied'] = (int) cc_meta_get($pdo, 'db_schema', 0);
    echo json_encode($v); exit;
}

// ---------------------------------------------------------------------------
// Account management (admin only)
// ---------------------------------------------------------------------------
$is_admin = $account['role'] === 'admin';

// Read-only requests release the session lock right away: PHP keeps one request per session at a time,
// so a slow request (publish, big page list) would otherwise hold every other screen's data back.
if ($_SERVER['REQUEST_METHOD'] === 'GET') session_write_close();

// Keepalive: the client calls it (rate-limited) while the user is active in the interface.
// The touch already happened in the gate.
if ($action === 'keepalive') {
    echo json_encode(['success' => true, 'expires_in' => cc_session_expires_in(), 'timeout' => cc_session_limit()]); exit;
}
if (in_array($action, ['get_users', 'add_user', 'delete_user', 'force_password', 'export_site', 'import_site', 'backup_info', 'backup_download', 'backup_create', 'backup_delete', 'backup_restore', 'backup_restore_saved', 'backup_upload_chunk', 'get_submissions', 'export_submissions', 'delete_submission', 'clear_submissions']) && !$is_admin) {
    echo json_encode(['success' => false, 'message' => 'Only admins can do this.']); exit;
}

if ($action === 'get_users') {
    echo json_encode($pdo->query("SELECT id, username, role FROM admin")->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if ($action === 'add_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    if ($username === '' || $password === '') { echo json_encode(['success' => false, 'message' => 'Username and password required.']); exit; }
    if (!preg_match('/^[A-Za-z0-9._@-]{3,32}$/', $username)) { echo json_encode(['success' => false, 'message' => 'Usernames have 3–32 characters: letters, numbers, dot, dash, underscore or @.']); exit; }
    if (strlen($password) < 8 || strlen($password) > 4096) { echo json_encode(['success' => false, 'message' => 'The password must be at least 8 characters.']); exit; }
    $chk = $pdo->prepare("SELECT COUNT(*) FROM admin WHERE username = ? COLLATE NOCASE"); $chk->execute([$username]);
    if ($chk->fetchColumn() > 0) { echo json_encode(['success' => false, 'message' => 'Username already exists.']); exit; }
    $role = ($data['role'] ?? '') === 'admin' ? 'admin' : 'editor';
    try {
        $pdo->prepare("INSERT INTO admin (username, password_hash, role, must_change_pw, session_gen) VALUES (?, ?, ?, 1, 0)")
            ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role]);
    } catch (Exception $e) { echo json_encode(['success' => false, 'message' => 'Username already exists.']); exit; }
    echo json_encode(['success' => true, 'message' => 'User added successfully!']); exit;
}
if ($action === 'delete_user' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $uid = (int)($data['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT id, role FROM admin WHERE id = ?"); $stmt->execute([$uid]);
    $victim = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$victim) { echo json_encode(['success' => false, 'message' => 'Account not found.']); exit; }
    if ((int)$victim['id'] === (int)$account['id']) { echo json_encode(['success' => false, 'message' => 'You cannot delete yourself.']); exit; }
    if ($victim['role'] === 'admin' && (int)$pdo->query("SELECT COUNT(*) FROM admin WHERE role = 'admin'")->fetchColumn() <= 1) { echo json_encode(['success' => false, 'message' => 'The last administrator cannot be deleted.']); exit; }
    // its open sessions end at their next request (cc_session_account finds no account)
    $pdo->prepare("DELETE FROM admin WHERE id = ?")->execute([$uid]);
    echo json_encode(['success' => true, 'message' => 'User deleted.']); exit;
}
// Demo mode: the shared demo login keeps its password, and visitors can't put files on the server
if (cc_demo_on() && in_array($action, ['force_password', 'change_own_password', 'upload_media'], true)) {
    echo json_encode(['success' => false, 'message' => 'Not available in the demo.']); exit;
}
if ($action === 'force_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $pwd = (string)($data['password'] ?? '');
    if (strlen($pwd) < 8 || strlen($pwd) > 4096) { echo json_encode(['success' => false, 'message' => 'Password too short (at least 8 characters).']); exit; }
    if ((int)($data['id'] ?? 0) === (int)$account['id']) { echo json_encode(['success' => false, 'message' => 'Use "Change password" for your own account.']); exit; }
    // A reset signs the account out everywhere (session_gen) and asks for a new password at the next sign-in
    $st = $pdo->prepare("UPDATE admin SET password_hash = ?, must_change_pw = 1, session_gen = COALESCE(session_gen, 0) + 1 WHERE id = ?");
    $st->execute([password_hash($pwd, PASSWORD_DEFAULT), (int)($data['id'] ?? 0)]);
    if ($st->rowCount() === 0) { echo json_encode(['success' => false, 'message' => 'Account not found.']); exit; }
    echo json_encode(['success' => true, 'message' => 'Password updated.']); exit;
}

// Change the password of one's OWN account (any role) + clear the must_change_pw flag
if ($action === 'change_own_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $pwd = (string)($data['password'] ?? '');
    $me = $pdo->prepare("SELECT id, password_hash, must_change_pw FROM admin WHERE id = ?"); $me->execute([(int)$account['id']]);
    $meRow = $me->fetch(PDO::FETCH_ASSOC);
    if (!$meRow) { echo json_encode(['success' => false, 'message' => 'Account not found.']); exit; }
    // A voluntary change needs the current password (the forced change comes right after signing in, which just
    // checked it). Wrong current passwords count like wrong sign-ins.
    if ((int)$meRow['must_change_pw'] !== 1) {
        if (cc_login_begin($account['username']) > 0) { http_response_code(429); echo json_encode(['success' => false, 'message' => 'Too many failed attempts. Try again later.']); exit; }
        if (!password_verify((string)($data['current'] ?? ''), $meRow['password_hash'])) { echo json_encode(['success' => false, 'message' => 'The current password is not correct.']); exit; }
        cc_login_result($account['username'], true);
    }
    if (strlen($pwd) < 8 || strlen($pwd) > 4096) { echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters.']); exit; }
    if (strtolower($pwd) === 'admin' || strtolower($pwd) === strtolower($account['username'])) { echo json_encode(['success' => false, 'message' => 'Please choose a different password.']); exit; }
    if (password_verify($pwd, $meRow['password_hash'])) { echo json_encode(['success' => false, 'message' => 'Choose a password different from the current one.']); exit; }
    // Other sessions of this account end; this one carries on with the new generation
    $pdo->prepare("UPDATE admin SET password_hash = ?, must_change_pw = 0, session_gen = COALESCE(session_gen, 0) + 1 WHERE id = ?")
        ->execute([password_hash($pwd, PASSWORD_DEFAULT), (int)$meRow['id']]);
    $_SESSION['gen'] = (int)$pdo->query("SELECT session_gen FROM admin WHERE id = " . (int)$meRow['id'])->fetchColumn();
    session_regenerate_id(true);
    echo json_encode(['success' => true, 'message' => 'Password changed.', 'csrf' => cc_issue_csrf()]); exit;
}

// ---------------------------------------------------------------------------
// Media (upload with whitelist + execution protection)
// ---------------------------------------------------------------------------
$uploads_dir = __DIR__ . '/../uploads';
if ($action === 'upload_media' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($uploads_dir)) mkdir($uploads_dir, 0755, true);
    // Block PHP execution in the uploads folder (Apache)
    ensure_htaccess($uploads_dir, $GLOBALS['CC_HT_UPLOADS']);

    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $orig = basename($_FILES['file']['name']);
        $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
        $allowed = array_merge(['jpg','jpeg','png','gif','webp','avif','svg','ico','bmp'], CC_MEDIA_AUDIO, CC_MEDIA_VIDEO);
        if (!in_array($ext, $allowed, true)) {
            echo json_encode(['success' => false, 'message' => 'File type not allowed. Accepted: images, MP3 / M4A / OGG / WAV audio and MP4 / WebM video.']); exit;
        }
        $kind = cc_media_kind($ext);
        if ($kind !== 'image') {
            // audio / video: it must start like its type says, and stay within the size limit
            if (!cc_media_sniff($_FILES['file']['tmp_name'], $ext)) {
                echo json_encode(['success' => false, 'message' => 'The file is not a valid ' . strtoupper($ext) . ' ' . $kind . ' file.']); exit;
            }
            if ((int)$_FILES['file']['size'] > ($kind === 'video' ? CC_MEDIA_MAX_VIDEO : CC_MEDIA_MAX_AUDIO)) {
                echo json_encode(['success' => false, 'message' => 'This ' . $kind . ' file is too large (' . round(($kind === 'video' ? CC_MEDIA_MAX_VIDEO : CC_MEDIA_MAX_AUDIO) / 1048576) . ' MB at most). Host it elsewhere and paste its address instead.']); exit;
            }
        }
        if ($ext === 'svg' && !cc_svg_is_safe($_FILES['file']['tmp_name'])) {
            echo json_encode(['success' => false, 'message' => 'This SVG contains scripts or other active content and was not accepted. Export it again as a plain SVG (or as PNG).']); exit;
        }
        // For raster formats, check that it really is an image
        if ($kind === 'image' && !in_array($ext, ['svg','ico'], true)) {
            if (@getimagesize($_FILES['file']['tmp_name']) === false) {
                echo json_encode(['success' => false, 'message' => 'The file is not a valid image.']); exit;
            }
        }
        $safe = ltrim(preg_replace('/[^a-zA-Z0-9._-]/', '', $orig), '.-');
        if ($safe === '' || strtolower(pathinfo($safe, PATHINFO_EXTENSION)) !== $ext) $safe = ($kind === 'image' ? 'image.' : $kind . '.') . $ext;
        $fname = time() . '_' . $safe;
        if (file_exists($uploads_dir . '/' . $fname)) $fname = time() . '_' . bin2hex(random_bytes(3)) . '_' . $safe;   // never overwrite
        $target = $uploads_dir . '/' . $fname;
        if (move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
            $base_dir = dirname($_SERVER['SCRIPT_NAME'], 2);
            if ($base_dir === '\\' || $base_dir === '/') $base_dir = '';
            $meta = cc_media_process($uploads_dir, $fname);   // smaller WebP copies + size info
            $upFolder = cc_media_folder_path($_POST['folder'] ?? '');
            if ($upFolder) { cc_media_move([$fname], $upFolder); $meta['folder'] = $upFolder; }
            echo json_encode(['success' => true, 'message' => 'Uploaded successfully.', 'url' => $base_dir . '/uploads/' . $fname, 'filename' => $fname, 'kind' => $kind, 'meta' => $meta]);
        } else { echo json_encode(['success' => false, 'message' => 'Cannot move the uploaded file.']); }
    } else {
        // A file over the server's limit arrives as an error code (or, over post_max_size, as nothing at all)
        $err = (int)($_FILES['file']['error'] ?? 0);
        $tooBig = in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || (empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0);
        echo json_encode(['success' => false, 'message' => $tooBig
            ? 'The file is larger than your server accepts (upload_max_filesize ' . ini_get('upload_max_filesize') . ', post_max_size ' . ini_get('post_max_size') . '). Use a smaller file, or host it elsewhere and paste its address.'
            : 'No file received or upload error.']);
    }
    exit;
}
if ($action === 'get_media') {
    if (!is_dir($uploads_dir)) mkdir($uploads_dir, 0755, true);
    $base_dir = dirname($_SERVER['SCRIPT_NAME'], 2);
    if ($base_dir === '\\' || $base_dir === '/') $base_dir = '';
    $base_url = $base_dir . '/uploads/';
    $files = array_diff(scandir($uploads_dir), array('.', '..', '.htaccess'));
    $meta = cc_media_meta_all();
    $media = [];
    foreach ($files as $f) {
        if (!is_file($uploads_dir . '/' . $f)) continue;   // the _cc folder of optimized copies is not listed
        $m = is_array($meta[$f] ?? null) ? $meta[$f] : [];
        $media[] = ['name' => $f, 'kind' => cc_media_kind(pathinfo($f, PATHINFO_EXTENSION)), 'url' => $base_url . $f, 'folder' => (string)($m['folder'] ?? ''), 'mtime' => (int)@filemtime($uploads_dir . '/' . $f),
                    'alt' => (string)($m['alt'] ?? ''), 'w' => (int)($m['w'] ?? 0), 'h' => (int)($m['h'] ?? 0),
                    'bytes' => (int)($m['bytes'] ?? @filesize($uploads_dir . '/' . $f)), 'optimized' => !empty($m['optimized']), 'variants' => array_values($m['variants'] ?? [])];
    }
    echo json_encode($media); exit;
}
// Alt text of a library image: offered automatically when the image is picked for a block
if ($action === 'save_media_meta' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $name = basename((string)($data['name'] ?? ''));
    if ($name === '' || !is_file($uploads_dir . '/' . $name)) { echo json_encode(['success' => false, 'message' => 'Image not found.']); exit; }
    $alt = trim(mb_substr((string)($data['alt'] ?? ''), 0, 300));
    cc_media_meta_update(function (&$all) use ($name, $alt) { $all[$name] = array_merge(is_array($all[$name] ?? null) ? $all[$name] : [], ['alt' => $alt]); });
    echo json_encode(['success' => true]); exit;
}
// Makes the optimized copies of images uploaded before (a batch at a time: call again while "remaining" > 0)
if ($action === 'optimize_media' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    @set_time_limit(60);
    $start = microtime(true);
    $meta = cc_media_meta_all();
    $todo = [];
    foreach (array_diff(scandir($uploads_dir) ?: [], ['.', '..', '.htaccess']) as $f) {
        if (is_file($uploads_dir . '/' . $f) && empty($meta[$f]['optimized']) && cc_media_kind(pathinfo($f, PATHINFO_EXTENSION)) === 'image') $todo[] = $f;
    }
    $done = 0; $tried = 0; $skipped = [];
    foreach ($todo as $f) {
        if (microtime(true) - $start > 20) break;   // keep each request short
        $tried++;
        $m = cc_media_process($uploads_dir, $f);
        if (!empty($m['optimized'])) $done++; else $skipped[] = $f;   // e.g. GD without WebP, or too big for the memory limit
    }
    echo json_encode(['success' => true, 'done' => $done, 'remaining' => count($todo) - $tried, 'skipped' => $skipped]); exit;
}
if ($action === 'delete_media' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    // One file ("name") or several ("names")
    $names = isset($data['names']) && is_array($data['names']) ? $data['names'] : [$data['name'] ?? ''];
    $deleted = 0;
    foreach ($names as $n) {
        $filename = basename((string)$n);
        if ($filename && $filename !== '.htaccess' && is_file($uploads_dir . '/' . $filename)) {
            unlink($uploads_dir . '/' . $filename);
            cc_media_forget($uploads_dir, $filename);   // its optimized copies and alt text
            $deleted++;
        }
    }
    echo json_encode(['success' => true, 'deleted' => $deleted, 'message' => $deleted === 1 ? 'Image deleted.' : "$deleted images deleted."]); exit;
}
// Folders (labels: files never move on disk, addresses don't change)
if ($action === 'get_media_folders') {
    echo json_encode(cc_media_folders()); exit;
}
if (in_array($action, ['media_folder_create', 'media_folder_rename', 'media_folder_delete', 'media_move'], true) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d = json_decode(file_get_contents('php://input'), true);
    if (!is_array($d)) $d = [];
    $bad = ['success' => false, 'message' => 'Folder names can use letters, numbers, spaces and - _ . ( ) & (up to 50 characters, 5 levels).'];
    if ($action === 'media_folder_create') {
        if (!cc_media_folder_path($d['path'] ?? '')) { echo json_encode($bad); exit; }
        cc_media_folder_create($d['path']);
    } elseif ($action === 'media_folder_rename') {
        if (!cc_media_folder_path($d['to'] ?? '')) { echo json_encode($bad); exit; }
        if (!cc_media_folder_rename($d['from'] ?? '', $d['to'] ?? '')) { echo json_encode(['success' => false, 'message' => 'A folder with that name already exists there (or it would go inside itself).']); exit; }
    } elseif ($action === 'media_folder_delete') {
        cc_media_folder_delete($d['path'] ?? '');
    } else {
        $names = array_values(array_filter((array)($d['names'] ?? []), function ($n) use ($uploads_dir) { return is_file($uploads_dir . '/' . basename((string)$n)); }));
        if (cc_media_folder_path($d['folder'] ?? '') === null) { echo json_encode($bad); exit; }
        cc_media_move($names, $d['folder'] ?? '');
        echo json_encode(['success' => true, 'moved' => count($names), 'folders' => cc_media_folders()]); exit;
    }
    echo json_encode(['success' => true, 'folders' => cc_media_folders()]); exit;
}
// Where the given images are used (warning before deleting)
if ($action === 'media_usage' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d = json_decode(file_get_contents('php://input'), true);
    echo json_encode(['success' => true, 'usage' => cc_media_usage($pdo, (array)($d['names'] ?? []))]); exit;
}

// ---------------------------------------------------------------------------
// Settings (validated JSON)
// ---------------------------------------------------------------------------
if ($action === 'get_settings') {
    $file = $data_dir . '/settings.json';
    $s = file_exists($file) ? json_decode((string)file_get_contents($file), true) : [];
    if (!is_array($s)) $s = [];
    // Email addresses and security options are for admins only
    if (!$is_admin) foreach (['adminEmail', 'emailFrom', 'emailSubject', 'sessionTimeoutMinutes', 'trustedProxies'] as $k) unset($s[$k]);
    echo json_encode($s ? $s : new stdClass()); exit;
}
if ($action === 'save_settings' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) { echo json_encode(['success' => false, 'message' => 'Invalid settings payload.']); exit; }
    // Where form submissions are mailed and how long sessions last are admin decisions: an editor's save
    // keeps the current values of those fields.
    if (!$is_admin) {
        $current = @json_decode(@file_get_contents($data_dir . '/settings.json'), true);
        if (!is_array($current)) $current = [];
        foreach (['adminEmail', 'emailFrom', 'emailSubject', 'sessionTimeoutMinutes', 'trustedProxies'] as $k) {
            if (array_key_exists($k, $current)) $decoded[$k] = $current[$k]; else unset($decoded[$k]);
        }
    }
    if (isset($decoded['trustedProxies'])) {   // comma separated IP addresses only
        $decoded['trustedProxies'] = implode(', ', array_filter(array_map('trim', explode(',', (string)$decoded['trustedProxies'])), function ($ip) { return filter_var($ip, FILTER_VALIDATE_IP); }));
    }
    // Global colours: only valid entries are kept; the primary colour is the brand colour
    // Text styles: only valid presets and values are kept
    if (isset($decoded['typography'])) $decoded['typography'] = cc_typography(['typography' => $decoded['typography']]);
    // Button presets and field style: only valid values are kept
    if (isset($decoded['buttonStyles']) || isset($decoded['fieldStyle'])) {
        $kit = cc_kit($decoded);
        $decoded['buttonStyles'] = (object)$kit['buttons'];
        $decoded['fieldStyle'] = (object)$kit['field'];
    }
    if (isset($decoded['colors'])) {
        $decoded['colors'] = cc_palette(['colors' => $decoded['colors'], 'brandColor' => $decoded['brandColor'] ?? '']);
        $decoded['brandColor'] = $decoded['colors'][0]['value'];
    }
    if (isset($decoded['brandColor']) && !preg_match('/^#[0-9a-fA-F]{3,8}$/', (string)$decoded['brandColor'])) {
        echo json_encode(['success' => false, 'message' => 'The brand color must be a hex color such as #3b82f6.']); exit;
    }
    if (isset($decoded['sessionTimeoutMinutes'])) {
        $decoded['sessionTimeoutMinutes'] = max(5, min(720, (int)$decoded['sessionTimeoutMinutes']));
    }
    file_put_contents($data_dir . '/settings.json', json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'message' => 'Settings saved!']); exit;
}

// ---------------------------------------------------------------------------
// Pages — draft/published model
// ---------------------------------------------------------------------------
// Slugs are URLs: each top-level path has a single owner site-wide (a live page, a collection or a
// system folder). Drafts don't own a URL until they are published. Returns a description of the
// current owner, or null if the slug is free.
function cc_slug_owner($pdo, $slug, $except_page = null, $except_collection = null) {
    if (cc_slug_reserved($slug)) return 'a system folder';
    $st = $pdo->prepare("SELECT title FROM pages WHERE is_draft_copy = 0 AND status IN ('published', 'modified') AND clean_slug = ? AND id IS NOT ?");
    $st->execute([$slug, $except_page]);
    if (($t = $st->fetchColumn()) !== false) return 'the page "' . $t . '"';
    $st = $pdo->prepare("SELECT name FROM collections WHERE slug = ? AND id IS NOT ?");
    $st->execute([$slug, $except_collection]);
    if (($n = $st->fetchColumn()) !== false) return 'the collection "' . $n . '"';
    return null;
}

// Set the homepage exclusively (only one page can be home).
function apply_home($pdo, $primaryId, $val) {
    if (!$primaryId) return;
    if ($val) {
        $pdo->exec("UPDATE pages SET is_home = 0 WHERE is_draft_copy = 0");
        $pdo->prepare("UPDATE pages SET is_home = 1 WHERE id = ?")->execute([$primaryId]);
    } else {
        $pdo->prepare("UPDATE pages SET is_home = 0 WHERE id = ?")->execute([$primaryId]);
    }
}

// Update internal links when the slug of a published page changes.
// A page's address changed: links pointing to it are updated everywhere they can be stored
// (pages, collection items, header/footer, masters, menu), see cc_relink_node() in config.php.
function relink_slug_change($pdo, $data_dir, $old_slug, $new_slug) {
    // The page is published at /new/ now: no redirect may hide it
    if ($new_slug && !in_array($new_slug, ['index', 'home'], true)) { try { cc_drop_redirect_from($pdo, '/' . $new_slug . '/'); } catch (Exception $e) {} }
    if (!$old_slug || $old_slug === $new_slug) return;
    // The old address keeps working: it forwards to the new one
    if (!in_array($old_slug, ['index', 'home'], true)) {
        try { cc_add_redirect($pdo, '/' . $old_slug . '/', in_array($new_slug, ['index', 'home'], true) ? '/' : '/' . $new_slug . '/'); } catch (Exception $e) {}
    }
    $args = [$old_slug . '/index.html', $new_slug . '/index.html', '{{BASE_URL}}' . $old_slug . '/', '{{BASE_URL}}' . $new_slug . '/'];
    foreach ([['pages', 'id'], ['collection_items', 'id'], ['site_parts', 'name'], ['master_components', 'id']] as [$table, $key]) {
        try {
            $rows = $pdo->query("SELECT $key AS k, content_json FROM $table")->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) { continue; }
        $up = $pdo->prepare("UPDATE $table SET content_json = ? WHERE $key = ?");
        foreach ($rows as $r) {
            $data = json_decode((string)$r['content_json'], true);
            if (is_array($data) && cc_relink_node($data, ...$args)) $up->execute([json_encode($data), $r['k']]);
        }
    }
    $menu_file = $data_dir . '/menu.json';
    if (file_exists($menu_file)) {
        $menu = json_decode((string)file_get_contents($menu_file), true);
        if (is_array($menu) && cc_relink_node($menu, ...$args)) file_put_contents($menu_file, json_encode($menu, JSON_UNESCAPED_UNICODE));
    }
}

// Revision history: cc_add_revision() in config.php records each save.
if ($action === 'get_revisions') {
    // A draft copy's history is its live page's history
    $owner = (string)($_GET['owner'] ?? '');
    if (strpos($owner, 'item:') !== 0) {
        $r = $pdo->prepare("SELECT parent_id, is_draft_copy FROM pages WHERE id = ?"); $r->execute([$owner]);
        $row = $r->fetch(PDO::FETCH_ASSOC);
        if ($row && (int)$row['is_draft_copy'] === 1 && $row['parent_id']) $owner = $row['parent_id'];
    }
    $st = $pdo->prepare("SELECT id, title, kind, author, created_at, length(content_json) AS size FROM page_revisions WHERE owner = ? ORDER BY id DESC");
    $st->execute([$owner]);
    echo json_encode($st->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if ($action === 'get_revision') {
    $st = $pdo->prepare("SELECT id, owner, title, kind, author, created_at, content_json FROM page_revisions WHERE id = ?");
    $st->execute([(int)($_GET['id'] ?? 0)]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row && !$is_admin) $row['content_json'] = cc_redact_content_json($row['content_json']);
    echo json_encode($row ?: ['success' => false, 'message' => 'Version not found.']); exit;
}

// Redirects (Global Options › Redirects). Everyone can see them, admins change them.
if ($action === 'get_redirects') {
    echo json_encode($pdo->query("SELECT from_path, to_path, auto, created_at FROM redirects ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if (($action === 'save_redirect' || $action === 'delete_redirect') && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$is_admin) { echo json_encode(['success' => false, 'message' => 'Only admins can change redirects.']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    if ($action === 'delete_redirect') {
        $pdo->prepare("DELETE FROM redirects WHERE from_path = ?")->execute([(string)($d['from'] ?? '')]);
        echo json_encode(['success' => true]); exit;
    }
    $from = cc_redirect_path($d['from'] ?? ''); $to = cc_redirect_target($d['to'] ?? '');
    if (!$from) { echo json_encode(['success' => false, 'message' => 'The old address must look like /old-page/ (letters, numbers, dashes).']); exit; }
    if (!$to) { echo json_encode(['success' => false, 'message' => 'The new address must be a path like /new-page/ or a full https:// address.']); exit; }
    if ($from === $to) { echo json_encode(['success' => false, 'message' => 'The two addresses are the same.']); exit; }
    cc_add_redirect($pdo, $from, $to, 0);
    echo json_encode(['success' => true, 'message' => 'Redirect saved. It takes effect when you publish the site.']); exit;
}

if ($action === 'get_pages') {
    $rows = $pdo->query("SELECT * FROM pages WHERE is_draft_copy = 0 ORDER BY updated_at DESC")->fetchAll(PDO::FETCH_ASSOC);
    $copyStmt = $pdo->prepare("SELECT * FROM pages WHERE parent_id = ? AND is_draft_copy = 1 ORDER BY updated_at DESC LIMIT 1");
    foreach ($rows as &$r) {
        if (($r['status'] ?? '') === 'modified') {
            $copyStmt->execute([$r['id']]);
            $copy = $copyStmt->fetch(PDO::FETCH_ASSOC);
            if ($copy) { $copy['is_home'] = $r['is_home']; if (!$is_admin) $copy['content_json'] = cc_redact_content_json($copy['content_json']); $r['draft_copy'] = $copy; }
        }
        if (!$is_admin) $r['content_json'] = cc_redact_content_json($r['content_json']);
    }
    unset($r);
    echo json_encode($rows); exit;
}

if ($action === 'save_page' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data) || !isset($data['id']) || !is_scalar($data['id']) || (string)$data['id'] === '') { echo json_encode(['success' => false, 'message' => 'Invalid page.']); exit; }
    $id          = (string)$data['id'];
    $title       = mb_substr((string)($data['title'] ?? 'Untitled'), 0, 300);
    $clean       = sanitize_slug($data['slug'] ?? '');
    // CanvasCore's own folders can't be page addresses, not even for a draft (see cc_reserved_slugs)
    if (cc_slug_reserved($clean)) { echo json_encode(['success' => false, 'code' => 'slug_taken', 'message' => "The URL /$clean/ is reserved for CanvasCore. Choose a different slug in Page Info."]); exit; }
    $seo_title   = mb_substr((string)($data['seo_title'] ?? ''), 0, 300);
    $seo_desc    = mb_substr((string)($data['seo_description'] ?? ''), 0, 1000);
    $seo_image   = mb_substr((string)($data['seo_image'] ?? ''), 0, 2000);
    $layout      = ($data['layout'] ?? 'boxed') === 'full' ? 'full' : 'boxed';
    // These two go into the page's <style>: a color and a length only
    $bg_color    = cc_css_color($data['bg_color'] ?? '', '#ffffff');
    $boxed_width = cc_css_length($data['boxed_width'] ?? '', '1200px');
    $blocks_in   = isset($data['blocks']) && is_array($data['blocks']) ? array_values($data['blocks']) : [];
    // Non-admin users cannot save "code" surfaces (HTML block / custom CSS).
    if (!$is_admin) {
        $prevRow = $pdo->prepare("SELECT content_json FROM pages WHERE id = ?"); $prevRow->execute([$id]);
        cc_keep_code_surfaces($blocks_in, $prevRow->fetchColumn() ?: '[]');
    }
    cc_sanitize_blocks($blocks_in);   // rich text never holds active code, for any role
    $content     = json_encode($blocks_in);
    $publish     = !empty($data['publish']);
    $is_home     = !empty($data['is_home']) ? 1 : 0;
    // Only touch the homepage flag when the client sends it (a save without it keeps the current home)
    $has_home    = is_array($data) && array_key_exists('is_home', $data);
    $author      = $_SESSION['username'] ?? 'admin';
    $now         = date('Y-m-d H:i:s');

    $cur = $pdo->prepare("SELECT * FROM pages WHERE id = ?"); $cur->execute([$id]);
    $existing = $cur->fetch(PDO::FETCH_ASSOC);

    $cschema = cc_version()['content_schema'];
    $has_noindex = is_array($data) && array_key_exists('noindex', $data);
    $noindex = !empty($data['noindex']) ? 1 : 0;
    $writeRow = function ($targetId, $status, $isCopy, $parentId) use ($pdo, $title, $clean, $seo_title, $seo_desc, $seo_image, $layout, $bg_color, $boxed_width, $content, $author, $now, $cschema, $has_noindex, $noindex, $is_admin) {
        $chk = $pdo->prepare("SELECT id FROM pages WHERE id = ?"); $chk->execute([$targetId]);
        if ($chk->fetch()) {
            $pdo->prepare("UPDATE pages SET parent_id=?, title=?, slug=?, clean_slug=?, seo_title=?, seo_description=?, seo_image=?, layout=?, bg_color=?, boxed_width=?, content_json=?, status=?, is_draft_copy=?, content_schema=?, author=?, updated_at=? WHERE id=?")
                ->execute([$parentId, $title, $clean, $clean, $seo_title, $seo_desc, $seo_image, $layout, $bg_color, $boxed_width, $content, $status, $isCopy, $cschema, $author, $now, $targetId]);
        } else {
            // Demo mode: a new page (not the hidden draft copy of an existing one) uses up one of the visitors' pages
            if (!$is_admin && !$isCopy && !cc_demo_take('pages')) { echo json_encode(['success' => false, 'message' => 'The demo allows ' . cc_demo_config()['maxNewPages'] . ' new pages until the next reset. Edit an existing page instead.']); exit; }
            $pdo->prepare("INSERT INTO pages (id, parent_id, title, slug, clean_slug, seo_title, seo_description, seo_image, layout, bg_color, boxed_width, content_json, status, is_draft_copy, content_schema, author, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                ->execute([$targetId, $parentId, $title, $clean, $clean, $seo_title, $seo_desc, $seo_image, $layout, $bg_color, $boxed_width, $content, $status, $isCopy, $cschema, $author, $now]);
        }
        if ($has_noindex) $pdo->prepare("UPDATE pages SET noindex = ? WHERE id = ?")->execute([$noindex, $targetId]);   // "Hide from search engines"
    };

    if ($publish) {
        $owner_id = ($existing && (int)($existing['is_draft_copy'] ?? 0) === 1) ? $existing['parent_id'] : $id;
        if ($owner = cc_slug_owner($pdo, $clean, $owner_id)) {
            echo json_encode(['success' => false, 'code' => 'slug_taken', 'message' => "The URL /$clean/ is already used by $owner. Change the slug in Page Info and publish again."]); exit;
        }
        if ($existing && (int)($existing['is_draft_copy'] ?? 0) === 1) {
            // Promote the draft copy onto the published parent page
            $parentId = $existing['parent_id'];
            $parentRow = $pdo->prepare("SELECT clean_slug FROM pages WHERE id = ?"); $parentRow->execute([$parentId]);
            $old = $parentRow->fetch(PDO::FETCH_ASSOC);
            $writeRow($parentId, 'published', 0, null);
            if ($old) relink_slug_change($pdo, $data_dir, $old['clean_slug'] ?? null, $clean);
            $pdo->prepare("DELETE FROM pages WHERE id = ?")->execute([$id]); // remove the copy
            if ($has_home) apply_home($pdo, $parentId, $is_home);
            cc_add_revision($pdo, $parentId, $title, $content, 'published');
            echo json_encode(['success' => true, 'message' => 'Page published!', 'new_id' => $parentId]); exit;
        } else {
            $oldClean = $existing['clean_slug'] ?? null;
            $writeRow($id, 'published', 0, null);
            relink_slug_change($pdo, $data_dir, $oldClean, $clean);
            if ($has_home) apply_home($pdo, $id, $is_home);
            cc_add_revision($pdo, $id, $title, $content, 'published');
            echo json_encode(['success' => true, 'message' => 'Page published!', 'new_id' => $id]); exit;
        }
    }

    // --- Save draft ---
    if (!$existing) {
        // New page: stays a draft with its own id
        $writeRow($id, 'draft', 0, null);
        if ($has_home) apply_home($pdo, $id, $is_home);
        cc_add_revision($pdo, $id, $title, $content, 'draft');
        echo json_encode(['success' => true, 'message' => 'Draft saved!', 'new_id' => $id]); exit;
    }
    if ((int)($existing['is_draft_copy'] ?? 0) === 1) {
        // Already editing a draft copy: update in place
        $writeRow($id, 'draft', 1, $existing['parent_id']);
        if ($has_home) apply_home($pdo, $existing['parent_id'], $is_home);
        cc_add_revision($pdo, $existing['parent_id'], $title, $content, 'draft');
        echo json_encode(['success' => true, 'message' => 'Draft saved!', 'new_id' => $id]); exit;
    }
    if (($existing['status'] ?? '') === 'published') {
        // Modified live page: create a hidden draft copy, the live one stays intact
        $copyId = 'draft-' . uniqid();
        $writeRow($copyId, 'draft', 1, $id);
        $pdo->prepare("UPDATE pages SET status='modified', updated_at=? WHERE id=?")->execute([$now, $id]);
        if ($has_home) apply_home($pdo, $id, $is_home);
        cc_add_revision($pdo, $id, $title, $content, 'draft');
        echo json_encode(['success' => true, 'message' => 'Draft saved!', 'new_id' => $copyId]); exit;
    }
    // Primary draft / draft_new: update in place
    $writeRow($id, 'draft', 0, null);
    if ($has_home) apply_home($pdo, $id, $is_home);
    cc_add_revision($pdo, $id, $title, $content, 'draft');
    echo json_encode(['success' => true, 'message' => 'Draft saved!', 'new_id' => $id]); exit;
}

if ($action === 'discard_draft' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $parentId = json_decode(file_get_contents('php://input'), true)['id'] ?? null;
    // Only a live page with unpublished changes goes back to its published version; anything else is left alone
    // (this must never publish a page that was not published).
    $st = $pdo->prepare("SELECT status, is_draft_copy, clean_slug FROM pages WHERE id = ?"); $st->execute([(string)$parentId]);
    $pg = $st->fetch(PDO::FETCH_ASSOC);
    if ($pg && (int)$pg['is_draft_copy'] === 0 && in_array($pg['status'], ['modified', 'published'], true)) {
        $pdo->prepare("DELETE FROM pages WHERE parent_id = ? AND is_draft_copy = 1")->execute([(string)$parentId]);
        if ($pg['status'] === 'modified') $pdo->prepare("UPDATE pages SET status='published' WHERE id = ?")->execute([(string)$parentId]);
    }
    echo json_encode(['success' => true]); exit;
}

if ($action === 'delete_page' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = json_decode(file_get_contents('php://input'), true)['id'] ?? null;
    if ($id) {
        $row = $pdo->prepare("SELECT clean_slug, is_draft_copy, status, is_home FROM pages WHERE id = ?"); $row->execute([$id]);
        $p = $row->fetch(PDO::FETCH_ASSOC);
        if ($p && (int)$p['is_draft_copy'] === 0) {
            // Remove the generated HTML from disk, only if this page is the one online
            // (a draft never published may share a slug with a live page and must not delete its file)
            if (in_array($p['status'] ?? '', ['published', 'modified'], true) && !cc_slug_reserved($p['clean_slug'] ?? '')) {
                $slug = sanitize_slug($p['clean_slug'] ?? 'index');
                if ((int)($p['is_home'] ?? 0) === 1 || $slug === 'index' || $slug === 'home') {
                    @unlink(__DIR__ . '/../index.html');
                }
                if ($slug !== 'index' && $slug !== 'home') {
                    @unlink(__DIR__ . '/../' . $slug . '/index.html');
                    @rmdir(__DIR__ . '/../' . $slug);
                }
            }
            $pdo->prepare("DELETE FROM pages WHERE parent_id = ?")->execute([$id]); // delete the copies
        }
        $pdo->prepare("DELETE FROM pages WHERE id = ?")->execute([$id]);
        try { $pdo->prepare("DELETE FROM page_revisions WHERE owner = ?")->execute([$id]); } catch (Exception $e) {}
    }
    echo json_encode(['success' => true]); exit;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
if ($action === 'preview_menu' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once __DIR__ . '/compiler.php';
    $payload = file_get_contents('php://input');
    $sfile = $data_dir . '/settings.json';
    $gset = file_exists($sfile) ? json_decode(file_get_contents($sfile), true) : [];
    $html = render_menu_html($payload, ['preview' => true, 'inheritTheme' => !empty($gset['menuInheritTheme'])]);
    $html = str_replace('{{BASE_URL}}', '#', $html); // inert links in the preview
    echo json_encode(['success' => true, 'html' => $html]); exit;
}

if ($action === 'get_menu') {
    $menu_file = $data_dir . '/menu.json';
    echo file_exists($menu_file) ? file_get_contents($menu_file) : json_encode(['items' => [], 'settings' => new stdClass()]); exit;
}
if ($action === 'save_menu' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if ($decoded === null) { echo json_encode(['success' => false, 'message' => 'Invalid menu payload.']); exit; }
    file_put_contents($data_dir . '/menu.json', json_encode($decoded, JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'message' => 'Saved!']); exit;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
if ($action === 'get_submissions') {
    $rows = $pdo->query("SELECT id, form_id, page, data_json, created_at FROM form_submissions ORDER BY id DESC LIMIT 1000")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) { $r['data'] = json_decode($r['data_json'], true) ?: []; unset($r['data_json']); }
    echo json_encode($rows); exit;
}

if ($action === 'export_submissions') {
    $rows = $pdo->query("SELECT form_id, page, data_json, created_at FROM form_submissions ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
    // columns = union of the field labels
    $labels = [];
    foreach ($rows as $r) { $d = json_decode($r['data_json'], true) ?: []; foreach (array_keys($d) as $k) $labels[$k] = true; }
    $labels = array_keys($labels);
    $cols = array_merge(['created_at', 'form_id', 'page'], $labels);
    $out = fopen('php://temp', 'r+');
    // A value starting with = + - @ would run as a formula in Excel/Sheets: prefix it with ' (column names too:
    // the field labels come from the site's visitors)
    $csvSafe = function ($v) { $v = (string)$v; return ($v !== '' && strpbrk($v[0], "=+-@\t\r") !== false) ? "'" . $v : $v; };
    fputcsv($out, array_map($csvSafe, $cols));
    foreach ($rows as $r) {
        $d = json_decode($r['data_json'], true) ?: [];
        $line = [$r['created_at'], $r['form_id'], $r['page']];
        foreach ($labels as $l) $line[] = is_array($d[$l] ?? '') ? implode(', ', $d[$l]) : (string)($d[$l] ?? '');
        $line = array_map($csvSafe, $line);
        fputcsv($out, $line);
    }
    rewind($out); $csv = stream_get_contents($out); fclose($out);
    echo json_encode(['success' => true, 'csv' => $csv]); exit;
}

if ($action === 'delete_submission' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = json_decode(file_get_contents('php://input'), true)['id'] ?? null;
    if ($id) $pdo->prepare("DELETE FROM form_submissions WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true]); exit;
}

if ($action === 'clear_submissions' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo->exec("DELETE FROM form_submissions");
    echo json_encode(['success' => true]); exit;
}

// ---- Collections (management: admin) ----
if ($action === 'get_collections') {
    echo json_encode($pdo->query("SELECT id, name, slug, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count FROM collections c ORDER BY name")->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if ($action === 'save_collection' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$is_admin) { echo json_encode(['success' => false, 'message' => 'Only admins can manage collections.']); exit; }
    $d = json_decode(file_get_contents('php://input'), true);
    $id = $d['id'] ?? ('col_' . uniqid());
    $name = trim((string)($d['name'] ?? ''));
    if ($name === '') { echo json_encode(['success' => false, 'message' => 'The collection needs a name.']); exit; }
    $name = mb_substr($name, 0, 120);
    $chk = $pdo->prepare("SELECT id, slug FROM collections WHERE id = ?"); $chk->execute([$id]);
    $existing = $chk->fetch(PDO::FETCH_ASSOC);
    // Renaming keeps the address unless a new slug is sent explicitly
    $slug = cc_safe_slug(isset($d['slug']) && trim((string)$d['slug']) !== '' ? $d['slug'] : ($existing ? $existing['slug'] : $name));
    if ($owner = cc_slug_owner($pdo, $slug, null, $id)) {
        echo json_encode(['success' => false, 'code' => 'slug_taken', 'message' => "The URL /$slug/ is already used by $owner. Choose a different slug."]); exit;
    }
    if ($existing) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE collections SET name=?, slug=? WHERE id=?")->execute([$name, $slug, $id]);
            // New address: every published item forwards from its old URL (the files move at the next publish)
            if ($existing['slug'] !== $slug) {
                $its = $pdo->prepare("SELECT slug FROM collection_items WHERE collection_id = ? AND status = 'published'"); $its->execute([$id]);
                foreach ($its->fetchAll(PDO::FETCH_COLUMN) as $is) {
                    $is = cc_safe_slug($is);
                    cc_add_redirect($pdo, '/' . $existing['slug'] . '/' . $is . '/', '/' . $slug . '/' . $is . '/');
                }
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Could not rename the collection: ' . $e->getMessage()]); exit;
        }
    } else {
        $pdo->prepare("INSERT INTO collections (id, name, slug) VALUES (?,?,?)")->execute([$id, $name, $slug]);
    }
    echo json_encode(['success' => true, 'id' => $id, 'name' => $name, 'slug' => $slug, 'moved' => $existing && $existing['slug'] !== $slug]); exit;
}
if ($action === 'delete_collection' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$is_admin) { echo json_encode(['success' => false, 'message' => 'Only admins can manage collections.']); exit; }
    $id = json_decode(file_get_contents('php://input'), true)['id'] ?? '';
    $chk = $pdo->prepare("SELECT slug FROM collections WHERE id = ?"); $chk->execute([$id]);
    $col_slug = $chk->fetchColumn();
    $ids = $pdo->prepare("SELECT id FROM collection_items WHERE collection_id = ?"); $ids->execute([$id]);
    $item_ids = $ids->fetchAll(PDO::FETCH_COLUMN);
    $pdo->prepare("DELETE FROM collection_items WHERE collection_id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM collections WHERE id = ?")->execute([$id]);
    try { $rv = $pdo->prepare("DELETE FROM page_revisions WHERE owner = ?"); foreach ($item_ids as $iid) $rv->execute(['item:' . $iid]); } catch (Exception $e) {}
    // Its pages and feed go offline now (the folder is the collection's own: slugs are unique site-wide)
    $removed = 0;
    if ($col_slug !== false && ($cs = cc_safe_slug($col_slug)) !== '' && !cc_slug_owner($pdo, $cs)) {
        $removed = cc_unpublish_files($data_dir, $cs . '/', [$cs . '/feed.xml']);
    }
    echo json_encode(['success' => true, 'removed_files' => $removed]); exit;
}

// ---- Collection items (content: any logged-in user) ----
if ($action === 'get_items') {
    $cid = $_GET['collection'] ?? '';
    $st = $pdo->prepare("SELECT id, collection_id, title, slug, excerpt, cover_image, date, status, archived, updated_at FROM collection_items WHERE collection_id = ? ORDER BY (date = '') ASC, date DESC, updated_at DESC");
    $st->execute([$cid]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) { $r['archived'] = (int)($r['archived'] ?? 0); }
    unset($r);
    echo json_encode($rows); exit;
}
if ($action === 'get_item') {
    $st = $pdo->prepare("SELECT * FROM collection_items WHERE id = ?");
    $st->execute([$_GET['id'] ?? '']);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) $row['archived'] = (int)($row['archived'] ?? 0);
    if ($row && !$is_admin) $row['content_json'] = cc_redact_content_json($row['content_json']);
    echo json_encode($row ?: null); exit;
}
if ($action === 'save_item' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d = json_decode(file_get_contents('php://input'), true);
    $id = $d['id'] ?? ('item_' . uniqid());
    $cid = $d['collection_id'] ?? '';
    $title = trim($d['title'] ?? 'Untitled');
    $slug = cc_safe_slug($d['slug'] ?? $title);
    $excerpt = $d['excerpt'] ?? '';
    $cover = $d['cover_image'] ?? '';
    $date = $d['date'] ?? '';
    $status = ($d['status'] ?? 'draft') === 'published' ? 'published' : 'draft';
    $archived_sent = array_key_exists('archived', $d);
    $archived = (!empty($d['archived']) && $d['archived'] !== '0') ? 1 : 0;
    $seo_t = $d['seo_title'] ?? '';
    $seo_d = $d['seo_description'] ?? '';
    $blocks = isset($d['blocks']) && is_array($d['blocks']) ? array_values($d['blocks']) : null;
    if ($blocks !== null) cc_sanitize_blocks($blocks);   // rich text never holds active code, for any role
    $title = mb_substr($title, 0, 300); $excerpt = mb_substr((string)$excerpt, 0, 2000); $cover = mb_substr((string)$cover, 0, 2000);
    $date = preg_match('/^[0-9TZ:+. -]{0,40}$/', (string)$date) ? (string)$date : '';
    $cschema = cc_version()['content_schema'];
    $now = date('Y-m-d H:i:s');

    if ($status === 'published') {
        $dup = $pdo->prepare("SELECT title FROM collection_items WHERE collection_id = ? AND status = 'published' AND slug = ? AND id IS NOT ?");
        $dup->execute([$cid, $slug, $id]);
        if (($t = $dup->fetchColumn()) !== false) {
            echo json_encode(['success' => false, 'code' => 'slug_taken', 'message' => "The URL slug \"$slug\" is already used by \"$t\" in this collection. Change it and publish again."]); exit;
        }
    }
    $chk = $pdo->prepare("SELECT id, archived, content_json, slug, status, collection_id FROM collection_items WHERE id = ?"); $chk->execute([$id]);
    $existing_item = $chk->fetch(PDO::FETCH_ASSOC);
    if ($existing_item) {
        // A client that does not send the flag must never reset it: the saved value is kept
        if (!$archived_sent) $archived = (int)($existing_item['archived'] ?? 0);
        if ($blocks !== null) {
            if (!$is_admin) cc_keep_code_surfaces($blocks, $existing_item['content_json'] ?? '[]');
            $pdo->prepare("UPDATE collection_items SET collection_id=?, title=?, slug=?, excerpt=?, cover_image=?, date=?, status=?, archived=?, seo_title=?, seo_description=?, content_json=?, content_schema=?, updated_at=? WHERE id=?")
                ->execute([$cid, $title, $slug, $excerpt, $cover, $date, $status, $archived, $seo_t, $seo_d, json_encode($blocks), $cschema, $now, $id]);
        } else {
            $pdo->prepare("UPDATE collection_items SET collection_id=?, title=?, slug=?, excerpt=?, cover_image=?, date=?, status=?, archived=?, seo_title=?, seo_description=?, updated_at=? WHERE id=?")
                ->execute([$cid, $title, $slug, $excerpt, $cover, $date, $status, $archived, $seo_t, $seo_d, $now, $id]);
        }
    } else {
        $b = $blocks ?? [];
        if (!$is_admin) cc_keep_code_surfaces($b, []);
        // Demo mode: a new item uses up one of the visitors' items
        if (!$is_admin && !cc_demo_take('items')) { echo json_encode(['success' => false, 'message' => 'The demo allows ' . cc_demo_config()['maxNewItems'] . ' new collection items until the next reset. Edit an existing item instead.']); exit; }
        $pdo->prepare("INSERT INTO collection_items (id, collection_id, title, slug, excerpt, cover_image, date, status, archived, seo_title, seo_description, content_json, content_schema, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            ->execute([$id, $cid, $title, $slug, $excerpt, $cover, $date, $status, $archived, $seo_t, $seo_d, json_encode($b), $cschema, $now]);
    }
    // A published item that changed its address: the old one forwards to the new one
    if ($status === 'published') {
        try {
            $colSlug = $pdo->prepare("SELECT slug FROM collections WHERE id = ?"); $colSlug->execute([$cid]);
            $cs = (string)$colSlug->fetchColumn();
            if ($cs !== '') {
                cc_drop_redirect_from($pdo, '/' . $cs . '/' . $slug . '/');
                if ($existing_item && ($existing_item['status'] ?? '') === 'published' && ($existing_item['slug'] ?? '') !== '' && $existing_item['slug'] !== $slug && ($existing_item['collection_id'] ?? '') === $cid) {
                    cc_add_redirect($pdo, '/' . $cs . '/' . $existing_item['slug'] . '/', '/' . $cs . '/' . $slug . '/');
                }
            }
        } catch (Exception $e) {}
    }
    if ($blocks !== null || !$existing_item) {
        $stored = $pdo->prepare("SELECT content_json FROM collection_items WHERE id = ?"); $stored->execute([$id]);
        cc_add_revision($pdo, 'item:' . $id, $title, (string)$stored->fetchColumn(), $status === 'published' ? 'published' : 'draft');
    }
    echo json_encode(['success' => true, 'id' => $id]); exit;
}
if ($action === 'delete_item' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = json_decode(file_get_contents('php://input'), true)['id'] ?? '';
    $st = $pdo->prepare("SELECT id, collection_id, slug, status FROM collection_items WHERE id = ?"); $st->execute([$id]);
    $item = $st->fetch(PDO::FETCH_ASSOC);
    $pdo->prepare("DELETE FROM collection_items WHERE id = ?")->execute([$id]);
    try { $pdo->prepare("DELETE FROM page_revisions WHERE owner = ?")->execute(['item:' . $id]); } catch (Exception $e) {}
    $removed = cc_unpublish_item($pdo, $data_dir, $item);
    echo json_encode(['success' => true, 'removed_files' => $removed]); exit;
}
// Several items at once: move to another collection, archive, unarchive or delete.
// Answers what was done and, item by item, what was skipped and why.
if ($action === 'bulk_items' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $d = json_decode(file_get_contents('php://input'), true);
    $op = $d['op'] ?? '';
    $ids = array_values(array_unique(array_filter(is_array($d['ids'] ?? null) ? $d['ids'] : [], 'is_string')));
    if (!in_array($op, ['move', 'archive', 'unarchive', 'delete'], true) || !$ids) { echo json_encode(['success' => false, 'message' => 'Nothing to do.']); exit; }
    if (count($ids) > 1000) { echo json_encode(['success' => false, 'message' => 'Too many items at once (max 1000).']); exit; }
    $target = null;
    if ($op === 'move') {
        $tc = $pdo->prepare("SELECT id, name, slug FROM collections WHERE id = ?"); $tc->execute([(string)($d['collection_id'] ?? '')]);
        $target = $tc->fetch(PDO::FETCH_ASSOC);
        if (!$target) { echo json_encode(['success' => false, 'message' => 'The destination collection no longer exists.']); exit; }
    }
    $get = $pdo->prepare("SELECT i.id, i.collection_id, i.title, i.slug, i.status, c.slug AS col_slug FROM collection_items i LEFT JOIN collections c ON c.id = i.collection_id WHERE i.id = ?");
    $now = date('Y-m-d H:i:s');
    $done = 0; $skipped = []; $removed = 0;
    foreach ($ids as $iid) {
        $get->execute([$iid]);
        $it = $get->fetch(PDO::FETCH_ASSOC);
        if (!$it) { $skipped[] = ['id' => $iid, 'title' => '', 'reason' => 'it no longer exists']; continue; }
        if ($op === 'archive' || $op === 'unarchive') {
            $pdo->prepare("UPDATE collection_items SET archived = ?, updated_at = ? WHERE id = ?")->execute([$op === 'archive' ? 1 : 0, $now, $iid]);
        } elseif ($op === 'delete') {
            $pdo->prepare("DELETE FROM collection_items WHERE id = ?")->execute([$iid]);
            try { $pdo->prepare("DELETE FROM page_revisions WHERE owner = ?")->execute(['item:' . $iid]); } catch (Exception $e) {}
            $removed += cc_unpublish_item($pdo, $data_dir, $it);
        } else { // move
            if ($it['collection_id'] === $target['id']) { $skipped[] = ['id' => $iid, 'title' => $it['title'], 'reason' => 'it is already there']; continue; }
            if ($it['status'] === 'published') {
                $dup = $pdo->prepare("SELECT title FROM collection_items WHERE collection_id = ? AND status = 'published' AND slug = ? AND id <> ?");
                $dup->execute([$target['id'], $it['slug'], $iid]);
                if (($t = $dup->fetchColumn()) !== false) { $skipped[] = ['id' => $iid, 'title' => $it['title'], 'reason' => 'the URL slug "' . $it['slug'] . '" is already used there by "' . $t . '"']; continue; }
            }
            $pdo->prepare("UPDATE collection_items SET collection_id = ?, updated_at = ? WHERE id = ?")->execute([$target['id'], $now, $iid]);
            // A published item forwards from its old address (the page moves at the next publish)
            if ($it['status'] === 'published' && (string)$it['col_slug'] !== '') {
                $is = cc_safe_slug($it['slug']);
                try {
                    cc_drop_redirect_from($pdo, '/' . $target['slug'] . '/' . $is . '/');
                    cc_add_redirect($pdo, '/' . cc_safe_slug($it['col_slug']) . '/' . $is . '/', '/' . $target['slug'] . '/' . $is . '/');
                } catch (Exception $e) {}
            }
        }
        $done++;
    }
    echo json_encode(['success' => true, 'done' => $done, 'skipped' => $skipped, 'removed_files' => $removed]); exit;
}

if ($action === 'get_parts') {
    $out = ['header' => [], 'footer' => []];
    try {
        foreach ($pdo->query("SELECT name, content_json FROM site_parts") as $row) {
            $out[$row['name']] = json_decode($is_admin ? $row['content_json'] : cc_redact_content_json($row['content_json']), true) ?: [];
        }
    } catch (Exception $e) {}
    echo json_encode($out); exit;
}

if ($action === 'save_part' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $name = ($data['name'] ?? '') === 'footer' ? 'footer' : 'header';
    $blocks = isset($data['blocks']) && is_array($data['blocks']) ? array_values($data['blocks']) : [];
    cc_sanitize_blocks($blocks);
    if (!$is_admin) {   // editor: keeps the admin's code as saved, can't add new code
        $prevPart = $pdo->prepare("SELECT content_json FROM site_parts WHERE name = ?"); $prevPart->execute([$name]);
        cc_keep_code_surfaces($blocks, $prevPart->fetchColumn() ?: '[]');
    }
    $pdo->prepare("INSERT INTO site_parts (name, content_json, content_schema) VALUES (?, ?, ?)
                   ON CONFLICT(name) DO UPDATE SET content_json = excluded.content_json, content_schema = excluded.content_schema")
        ->execute([$name, json_encode($blocks), cc_version()['content_schema']]);
    echo json_encode(['success' => true, 'message' => ucfirst($name) . ' saved!']); exit;
}

if ($action === 'delete_part' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = json_decode(file_get_contents('php://input'), true)['name'] ?? '';
    if (in_array($name, ['header', 'footer'], true)) {
        $pdo->prepare("DELETE FROM site_parts WHERE name = ?")->execute([$name]);
    }
    echo json_encode(['success' => true]); exit;
}

if ($action === 'get_starters') {
    $file = __DIR__ . '/starters.json';
    echo file_exists($file) ? file_get_contents($file) : json_encode([]);
    exit;
}

// ---------------------------------------------------------------------------
// Backup (admin): whole site as a ZIP (content, options, images), saved copies on the server, restore
// ---------------------------------------------------------------------------
if ($action === 'backup_info') {
    if (class_exists('ZipArchive')) cc_backup_cleanup();
    echo json_encode(['success' => true, 'zip' => class_exists('ZipArchive'), 'max_upload' => cc_backup_max_upload(), 'backups' => class_exists('ZipArchive') ? cc_backup_list() : []]); exit;
}
// Makes a backup: kept on the server ({temp: false}), or made for one download ({temp: true}: then
// backup_download&name=… sends it and deletes it). Errors come back here as JSON, before any download starts.
if ($action === 'backup_create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    session_write_close();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    cc_backup_cleanup();
    try {
        $temp = !empty($data['temp']);
        $name = cc_backup_new_name($temp ? 'download' : 'backup');
        cc_backup_create($pdo, cc_backup_dir() . '/' . $name, ['history' => !isset($data['history']) || !empty($data['history']), 'submissions' => !isset($data['submissions']) || !empty($data['submissions']), 'kind' => $temp ? 'download' : 'saved']);
        echo json_encode(['success' => true, 'message' => $temp ? 'Backup ready.' : 'Backup saved on the server.', 'name' => $name, 'backups' => cc_backup_list()]);
    } catch (Exception $e) { echo json_encode(['success' => false, 'message' => $e->getMessage()]); }
    exit;
}
// Sends a backup file (a saved one, or a one-time "download-" one, which is then deleted)
if ($action === 'backup_download') {
    $name = (string)($_GET['name'] ?? '');
    $file = cc_backup_dir() . '/' . $name;
    if (!cc_backup_name_ok($name, true) || !is_file($file)) { http_response_code(404); header('Content-Type: text/plain'); echo 'Backup not found. Go back and make it again.'; exit; }
    $dl = $name;
    if (strpos($name, 'download-') === 0) {
        register_shutdown_function(function () use ($file) { @unlink($file); });
        $dl = cc_backup_slug(json_decode((string)@file_get_contents($data_dir . '/settings.json'), true)['siteName'] ?? '') . '-backup-' . date('Y-m-d-His') . '.zip';
    }
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $dl . '"');
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
}
if ($action === 'backup_delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $name = $data['name'] ?? '';
    if (!cc_backup_name_ok($name) || !is_file(cc_backup_dir() . '/' . $name)) { echo json_encode(['success' => false, 'message' => 'Backup not found.']); exit; }
    @unlink(cc_backup_dir() . '/' . $name);
    echo json_encode(['success' => true, 'message' => 'Backup deleted.', 'backups' => cc_backup_list()]); exit;
}
// A backup file to restore is uploaded in pieces (any size, whatever the server's upload limit):
// backup_upload_chunk (multipart: id, index, chunk) appends each piece to backups/upload-<id>.part.
if ($action === 'backup_upload_chunk' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    session_write_close();
    $id = (string)($_POST['id'] ?? ''); $index = (int)($_POST['index'] ?? -1);
    if (!preg_match('/^[a-f0-9]{16}$/', $id) || $index < 0) { echo json_encode(['success' => false, 'message' => 'Invalid upload.']); exit; }
    if (empty($_FILES['chunk']) || ($_FILES['chunk']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'A piece of the file did not arrive' . (in_array($_FILES['chunk']['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || empty($_FILES) ? ' (larger than this server accepts)' : '') . '. Try again.']); exit;
    }
    if ($index === 0) cc_backup_cleanup();
    $part = cc_backup_dir() . '/upload-' . $id . '.part';
    if ($index > 0 && !is_file($part)) { echo json_encode(['success' => false, 'message' => 'The upload expired. Try again.']); exit; }
    $free = @disk_free_space(cc_backup_dir());
    if ($free !== false && $free < 2 * (int)$_FILES['chunk']['size'] + 50 * 1048576) { echo json_encode(['success' => false, 'message' => 'Not enough free disk space on the server.']); exit; }
    $in = fopen($_FILES['chunk']['tmp_name'], 'rb'); $out = fopen($part, $index === 0 ? 'wb' : 'ab');
    if (!$in || !$out) { echo json_encode(['success' => false, 'message' => 'The file could not be saved on the server.']); exit; }
    stream_copy_to_stream($in, $out); fclose($in); fclose($out);
    echo json_encode(['success' => true, 'received' => filesize($part)]); exit;
}
// Restore from an uploaded file ({upload: id}, after backup_upload_chunk) or from a copy saved on the server
// ({name}). A safety copy of the current site is saved first; one restore at a time.
if (($action === 'backup_restore' || $action === 'backup_restore_saved') && $_SERVER['REQUEST_METHOD'] === 'POST') {
    session_write_close();   // a long restore must not hold back the other requests of this session
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $lock = @fopen(cc_backup_dir() . '/.restore.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { echo json_encode(['success' => false, 'message' => 'Another restore is running. Wait for it to finish.']); exit; }
    if ($action === 'backup_restore') {
        $id = (string)($data['upload'] ?? '');
        $part = cc_backup_dir() . '/upload-' . $id . '.part';
        if (!preg_match('/^[a-f0-9]{16}$/', $id) || !is_file($part)) { echo json_encode(['success' => false, 'message' => 'The uploaded file was not found. Upload it again.']); exit; }
        if (isset($data['size']) && (int)$data['size'] !== filesize($part)) { @unlink($part); echo json_encode(['success' => false, 'message' => 'The file did not arrive complete. Upload it again.']); exit; }
        register_shutdown_function(function () use ($part) { @unlink($part); });
        $src = $part;
    } else {
        $name = $data['name'] ?? '';
        if (!cc_backup_name_ok($name) || !is_file(cc_backup_dir() . '/' . $name)) { echo json_encode(['success' => false, 'message' => 'Backup not found.']); exit; }
        $src = cc_backup_dir() . '/' . $name;
    }
    $check = cc_backup_inspect($src);
    if (!$check['ok']) { echo json_encode(['success' => false, 'message' => $check['message']]); exit; }
    $check['zip']->close();
    try { $safety = cc_backup_safety_copy($pdo); }
    catch (Exception $e) { echo json_encode(['success' => false, 'message' => 'Could not save a safety copy of the current site first, so nothing was restored: ' . $e->getMessage()]); exit; }
    $res = cc_backup_restore($pdo, $src);
    $res['safety'] = $safety;
    $res['backups'] = cc_backup_list();
    echo json_encode($res); exit;
}

if ($action === 'export_site') {
    $pages = $pdo->query("SELECT id, parent_id, title, slug, clean_slug, seo_title, seo_description, seo_image, layout, bg_color, boxed_width, content_json, status, is_home, content_schema, author, updated_at FROM pages WHERE is_draft_copy = 0")->fetchAll(PDO::FETCH_ASSOC);
    $masters = $pdo->query("SELECT id, name, content_json FROM master_components")->fetchAll(PDO::FETCH_ASSOC);
    $templates = $pdo->query("SELECT id, name, content_json FROM templates")->fetchAll(PDO::FETCH_ASSOC);
    $parts = [];
    try { foreach ($pdo->query("SELECT name, content_json FROM site_parts") as $r) $parts[$r['name']] = json_decode($r['content_json'], true) ?: []; } catch (Exception $e) {}
    $menu = file_exists($data_dir . '/menu.json') ? json_decode(file_get_contents($data_dir . '/menu.json'), true) : new stdClass();
    $settings = file_exists($data_dir . '/settings.json') ? json_decode(file_get_contents($data_dir . '/settings.json'), true) : new stdClass();
    $media = [];
    $updir = __DIR__ . '/../uploads';
    if (is_dir($updir)) foreach (array_diff(scandir($updir), ['.', '..', '.htaccess']) as $f) if (is_file($updir . '/' . $f)) $media[] = $f;
    $v = cc_version();
    echo json_encode([
        'canvascore' => true, 'app' => $v['app'], 'content_schema' => $v['content_schema'], 'exported_at' => date('c'),
        'pages' => $pages, 'masters' => $masters, 'templates' => $templates, 'menu' => $menu, 'settings' => $settings, 'parts' => $parts, 'media_manifest' => $media,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($action === 'import_site' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $bundle = json_decode(file_get_contents('php://input'), true);
    if (!is_array($bundle) || empty($bundle['canvascore'])) {
        echo json_encode(['success' => false, 'message' => 'Not a valid CanvasCore export file.']); exit;
    }
    try {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM pages");
        $pdo->exec("DELETE FROM master_components");
        $pdo->exec("DELETE FROM templates");
        $cschema = cc_version()['content_schema'];
        $pins = $pdo->prepare("INSERT INTO pages (id, parent_id, title, slug, clean_slug, seo_title, seo_description, seo_image, layout, bg_color, boxed_width, content_json, status, is_draft_copy, is_home, content_schema, author, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)");
        foreach (($bundle['pages'] ?? []) as $pg) {
            $cj = is_string($pg['content_json'] ?? '[]') ? ($pg['content_json'] ?? '[]') : json_encode($pg['content_json']);
            $slug = cc_safe_slug($pg['clean_slug'] ?? $pg['slug'] ?? 'index');
            $pins->execute([$pg['id'] ?? ('page-' . uniqid()), null, $pg['title'] ?? 'Untitled', $slug, $slug, $pg['seo_title'] ?? '', $pg['seo_description'] ?? '', $pg['seo_image'] ?? '', $pg['layout'] ?? 'boxed', $pg['bg_color'] ?? '#ffffff', $pg['boxed_width'] ?? '1200px', $cj, $pg['status'] ?? 'published', (int)($pg['is_home'] ?? 0), (int)($pg['content_schema'] ?? $cschema), $pg['author'] ?? 'admin', date('Y-m-d H:i:s')]);
        }
        $mins = $pdo->prepare("INSERT INTO master_components (id, name, content_json) VALUES (?,?,?)");
        foreach (($bundle['masters'] ?? []) as $m) $mins->execute([$m['id'] ?? uniqid('master-'), htmlspecialchars($m['name'] ?? 'Master'), is_string($m['content_json'] ?? '{}') ? $m['content_json'] : json_encode($m['content_json'])]);
        $tins = $pdo->prepare("INSERT INTO templates (id, name, content_json) VALUES (?,?,?)");
        foreach (($bundle['templates'] ?? []) as $t) $tins->execute([$t['id'] ?? uniqid('tpl_'), htmlspecialchars($t['name'] ?? 'Template'), is_string($t['content_json'] ?? '{}') ? $t['content_json'] : json_encode($t['content_json'])]);
        if (isset($bundle['parts']) && is_array($bundle['parts'])) {
            $pp = $pdo->prepare("INSERT INTO site_parts (name, content_json, content_schema) VALUES (?, ?, 1) ON CONFLICT(name) DO UPDATE SET content_json = excluded.content_json");
            foreach (['header', 'footer'] as $pn) { if (isset($bundle['parts'][$pn])) $pp->execute([$pn, json_encode($bundle['parts'][$pn])]); }
        }
        if (isset($bundle['menu'])) file_put_contents($data_dir . '/menu.json', json_encode($bundle['menu'], JSON_UNESCAPED_UNICODE));
        if (isset($bundle['settings'])) file_put_contents($data_dir . '/settings.json', json_encode($bundle['settings'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $pdo->commit();
        cc_migrate_content($pdo);
        cc_sanitize_all_content($pdo);
        echo json_encode(['success' => true, 'message' => 'Site imported.']);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Import failed: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'get_templates') {
    $rows = $pdo->query("SELECT * FROM templates ORDER BY rowid DESC")->fetchAll(PDO::FETCH_ASSOC);
    if (!$is_admin) foreach ($rows as &$r) $r['content_json'] = cc_redact_content_json($r['content_json']);
    unset($r);
    echo json_encode($rows); exit;
}
if ($action === 'save_template' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    // A template is one block (an object with a type), nothing else
    $tmp = json_decode((string)($data['content_json'] ?? ''), true);
    if (!is_array($tmp) || !isset($tmp['type']) || !is_string($tmp['type'])) { echo json_encode(['success' => false, 'message' => 'Invalid template.']); exit; }
    $wrap = [$tmp];
    if (!$is_admin) cc_keep_code_surfaces($wrap, []);   // an editor's template carries no code
    cc_sanitize_blocks($wrap);
    $tplJson = json_encode($wrap[0]);
    // Names are stored as typed (the interface escapes them when it shows them)
    $tplName = trim(mb_substr((string)($data['name'] ?? 'Template'), 0, 120)) ?: 'Template';
    $pdo->prepare("INSERT INTO templates (id, name, content_json) VALUES (?, ?, ?)")
        ->execute([uniqid('tpl_'), $tplName, $tplJson]);
    echo json_encode(['success' => true, 'message' => 'Saved!']); exit;
}
if ($action === 'delete_template' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo->prepare("DELETE FROM templates WHERE id = ?")->execute([json_decode(file_get_contents('php://input'), true)['id']]);
    echo json_encode(['success' => true]); exit;
}

// ---------------------------------------------------------------------------
// Master Components
// ---------------------------------------------------------------------------
if ($action === 'get_masters') {
    $rows = $pdo->query("SELECT * FROM master_components ORDER BY updated_at DESC")->fetchAll(PDO::FETCH_ASSOC);
    if (!$is_admin) foreach ($rows as &$r) $r['content_json'] = cc_redact_content_json($r['content_json']);
    unset($r);
    echo json_encode($rows); exit;
}
if ($action === 'save_master' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (string)($data['id'] ?? '');
    $name = trim(mb_substr((string)($data['name'] ?? 'Master'), 0, 120)) ?: 'Master';
    // A master is one block (an object with a type), nothing else
    $tmp = is_string($data['content_json'] ?? null) ? json_decode($data['content_json'], true) : null;
    if ($id === '' || !is_array($tmp) || !isset($tmp['type']) || !is_string($tmp['type'])) { echo json_encode(['success' => false, 'message' => 'Invalid master component.']); exit; }
    $wrap = [$tmp];
    if (!$is_admin) {
        $prevM = $pdo->prepare("SELECT content_json FROM master_components WHERE id = ?"); $prevM->execute([$id]);
        $prevBlock = json_decode($prevM->fetchColumn() ?: 'null', true);
        cc_keep_code_surfaces($wrap, is_array($prevBlock) ? [$prevBlock] : []);
    }
    cc_sanitize_blocks($wrap);
    $content_json = json_encode($wrap[0]);

    $stmt = $pdo->prepare("SELECT id FROM master_components WHERE id = ?");
    $stmt->execute([$id]);
    if ($stmt->fetch()) {
        $pdo->prepare("UPDATE master_components SET name=?, content_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$name, $content_json, $id]);
    } else {
        $pdo->prepare("INSERT INTO master_components (id, name, content_json) VALUES (?, ?, ?)")->execute([$id, $name, $content_json]);
    }
    echo json_encode(['success' => true, 'message' => 'Master Component Saved!']); exit;
}

function purge_master_from_blocks(&$blocks, $masterId) {
    $purged = false;
    foreach ($blocks as $k => $b) {
        if (($b['type'] ?? '') === 'MASTER' && ($b['content']['masterId'] ?? '') === $masterId) {
            unset($blocks[$k]);
            $purged = true;
        } elseif (isset($b['children']) && is_array($b['children'])) {
            if (purge_master_from_blocks($blocks[$k]['children'], $masterId)) {
                $blocks[$k]['children'] = array_values($blocks[$k]['children']);
                $purged = true;
            }
        }
    }
    if ($purged) $blocks = array_values($blocks);
    return $purged;
}

if ($action === 'delete_master' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $masterId = json_decode(file_get_contents('php://input'), true)['id'];
    $pdo->prepare("DELETE FROM master_components WHERE id = ?")->execute([$masterId]);

    // Removed wherever it was placed: pages, collection items, header/footer
    foreach ([['pages', 'id'], ['collection_items', 'id'], ['site_parts', 'name']] as [$table, $key]) {
        try { $rows = $pdo->query("SELECT $key AS k, content_json FROM $table")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) { continue; }
        $updateStmt = $pdo->prepare("UPDATE $table SET content_json = ? WHERE $key = ?");
        foreach ($rows as $row) {
            $blocks = json_decode((string)$row['content_json'], true);
            if (is_array($blocks) && purge_master_from_blocks($blocks, $masterId)) $updateStmt->execute([json_encode($blocks), $row['k']]);
        }
    }
    echo json_encode(['success' => true]); exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action.']);
