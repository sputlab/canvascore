<?php
// canvascore-admin/demo.php — a public demo site that puts itself back (loaded when demo mode is on, see cc_demo_config() in config.php).
// Every <resetMinutes> the site is restored from its baseline, a backup kept in the data folder (demo-baseline.zip), and published again.
// The reset needs no scheduled task: the first request of each time slot does it (the editor, its sign-in screen). A cron service can also call
// demo-reset.php with the token of demo.json, to reset a demo nobody is using.
const CC_DEMO_BASELINE = 'demo-baseline.zip';

function cc_demo_dir() { return $GLOBALS['CC_DEMO_DIR'] ?? cc_data_dir(); }   // overridable for tests
// The time slot a moment is in: "2026102614:2" = the third 10-minute slot of the 14 o'clock hour. The same slots cc_demo_next_reset() counts down to.
function cc_demo_slot($now = null) {
    $now = $now ?? time();
    $m = cc_demo_config()['resetMinutes'] ?? 10;
    return date('YmdH', $now) . ':' . intdiv((int)date('i', $now), $m);
}
function cc_demo_baseline_file() { return cc_demo_dir() . '/' . CC_DEMO_BASELINE; }
function cc_demo_state() {
    $s = @json_decode((string)@file_get_contents(cc_demo_dir() . '/demo-reset.json'), true);
    return is_array($s) ? $s : [];
}
function cc_demo_state_write(array $s) { return cc_write_file(cc_demo_dir() . '/demo-reset.json', json_encode($s)); }
// Is the demo due for its reset? (demo mode on, a baseline kept, and the last reset was in an earlier slot)
function cc_demo_due($now = null) {
    if (!cc_demo_on()) return false;
    $st = cc_demo_state();
    return ($st['slot'] ?? '') !== cc_demo_slot($now);
}

// Restores the baseline and publishes the site again. Returns ['success' => bool, 'message' => string]. Never signs anyone out: the accounts are not in a
// backup. Two resets never run at once (the second one just returns).
function cc_demo_reset(PDO $pdo, $now = null) {
    if (!cc_demo_on()) return ['success' => false, 'message' => 'This site is not a demo.'];
    $lock = @fopen(cc_demo_dir() . '/demo-reset.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if ($lock) fclose($lock); return ['success' => true, 'message' => 'A reset is running.']; }
    try {
        $slot = cc_demo_slot($now);
        $res = ['success' => true, 'message' => ''];
        $base = cc_demo_baseline_file();
        if (!is_file($base)) {
            $res = ['success' => false, 'message' => 'There is no baseline yet: in Backup › Public demo, use "Keep this site as the starting point".'];
        } else {
            require_once __DIR__ . '/backup.php';
            if (!function_exists('cc_publish_site')) require_once __DIR__ . '/publish.php';
            $r = cc_backup_restore($pdo, $base);
            if (empty($r['success'])) $res = ['success' => false, 'message' => 'The baseline could not be restored: ' . ($r['message'] ?? '')];
            else {
                @unlink(cc_demo_dir() . '/demo-usage.json');   // visitors get their new pages and items back
                try { cc_publish_site($pdo, cc_demo_dir(), (string)cc_meta_get($pdo, 'site_base_dir', '')); } catch (Throwable $e) { error_log('CanvasCore demo reset (publish): ' . $e->getMessage()); }
                $res['message'] = 'The demo was put back as it was.';
            }
        }
        // recorded either way: a missing baseline is reported, not retried on every request
        cc_demo_state_write(['slot' => $slot, 'at' => date('c', $now ?? time()), 'ok' => $res['success'], 'message' => $res['message']]);
        return $res;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
// The first request of a slot resets the demo (a failure never stops the request)
function cc_demo_maybe_reset(PDO $pdo) {
    try {
        if (!cc_demo_due()) return;
        // the first time there is nothing to compare with: the site as it is counts as this slot's, so a freshly built demo is not wiped
        if (!is_file(cc_demo_dir() . '/demo-reset.json') && is_file(cc_demo_baseline_file())) { cc_demo_state_write(['slot' => cc_demo_slot(), 'at' => date('c'), 'ok' => true, 'message' => 'Started.']); return; }
        cc_demo_reset($pdo);
    } catch (Throwable $e) { error_log('CanvasCore demo reset: ' . $e->getMessage()); }
}

// What Backup › Public demo shows (admins)
function cc_demo_status(PDO $pdo) {
    $d = cc_demo_config(); $st = cc_demo_state(); $b = cc_demo_baseline_file();
    $u = $pdo->prepare("SELECT role, must_change_pw FROM admin WHERE username = ?"); $u->execute([$d['username']]); $acc = $u->fetch(PDO::FETCH_ASSOC);
    return ['demo' => true, 'username' => $d['username'], 'resetMinutes' => $d['resetMinutes'], 'publish' => $d['publish'], 'token' => $d['resetToken'] !== '',
        'baseline' => is_file($b) ? ['at' => date('c', filemtime($b)), 'size' => filesize($b)] : null,
        'last' => $st ?: null, 'nextResetIn' => cc_demo_next_reset(),
        'account' => $acc ? ['role' => $acc['role'], 'ready' => (int)$acc['must_change_pw'] === 0 && $acc['role'] === 'editor'] : null];
}
// The demo's visitors' account: an editor with the password of demo.json, already chosen (visitors cannot change passwords in a demo)
function cc_demo_account(PDO $pdo) {
    $d = cc_demo_config();
    if (strlen($d['password']) < 8) return ['success' => false, 'message' => 'The demo password in demo.json needs at least 8 characters.'];
    $hash = password_hash($d['password'], PASSWORD_DEFAULT);
    $st = $pdo->prepare("SELECT id, role FROM admin WHERE username = ?"); $st->execute([$d['username']]); $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row && $row['role'] === 'admin') return ['success' => false, 'message' => 'The account "' . $d['username'] . '" is an administrator: use another name in demo.json for the visitors.'];
    if ($row) $pdo->prepare("UPDATE admin SET password_hash = ?, role = 'editor', must_change_pw = 0, session_gen = COALESCE(session_gen, 0) + 1 WHERE id = ?")->execute([$hash, $row['id']]);
    else $pdo->prepare("INSERT INTO admin (username, password_hash, role, must_change_pw, session_gen) VALUES (?, ?, 'editor', 0, 0)")->execute([$d['username'], $hash]);
    return ['success' => true, 'message' => 'The demo account is ready: ' . $d['username'] . ' (editor).'];
}
// The site as it is now becomes the demo's starting point
function cc_demo_baseline(PDO $pdo) {
    require_once __DIR__ . '/backup.php';
    if (!class_exists('ZipArchive')) return ['success' => false, 'message' => 'The PHP zip extension is needed.'];
    $tmp = cc_demo_baseline_file() . '.tmp';
    try { cc_backup_create($pdo, $tmp, ['history' => false, 'submissions' => false, 'kind' => 'demo']); }
    catch (Throwable $e) { @unlink($tmp); return ['success' => false, 'message' => $e->getMessage()]; }
    if (!@rename($tmp, cc_demo_baseline_file())) { @unlink($tmp); return ['success' => false, 'message' => 'The baseline could not be saved in the data folder.']; }
    cc_demo_state_write(['slot' => cc_demo_slot(), 'at' => date('c'), 'ok' => true, 'message' => 'Baseline saved.']);
    return ['success' => true, 'message' => 'Saved: the demo is put back to this every ' . cc_demo_config()['resetMinutes'] . ' minutes.'];
}
