<?php
// canvascore-admin/rebuild_all.php
// Generates the static HTML from the published pages. Requires login.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/publish.php';
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');
header('Cache-Control: no-store');
cc_security_headers();

if (!cc_session_is_logged_in()) cc_unauthorized('Unauthorized. Please login.');
// Publishing changes the site: POST with the CSRF token only (a link or another site can't trigger it)
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); die(json_encode(['success' => false, 'message' => 'Use POST.'])); }
cc_verify_csrf_or_die();

require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/compiler.php';
require_once __DIR__ . '/media.php';

$data_dir = cc_data_dir();
$db_file = $data_dir . '/canvascore.sqlite';
if (!file_exists($db_file)) die(json_encode(['success' => false, 'message' => 'Database not found.']));

try {
    $pdo = new PDO("sqlite:" . $db_file);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // The account must still exist unchanged, and not be waiting for a forced password change
    $account = cc_session_account($pdo);
    if (!$account) cc_unauthorized('Unauthorized. Please login.');
    if ((int)$account['must_change_pw'] === 1) { http_response_code(403); die(json_encode(['success' => false, 'code' => 'must_change_pw', 'message' => 'Choose a new password first.'])); }
    if (!function_exists('cc_can_publish_site')) require_once __DIR__ . '/roles.php';
    if (!cc_can_publish_site(cc_role_clean($account['role']))) { http_response_code(403); die(json_encode(['success' => false, 'code' => 'forbidden', 'message' => 'Authors cannot publish the site. Submit your work for review.'])); }
    cc_session_touch();
    session_write_close(); // the rebuild can take a while: don't hold the other screens' requests

    $base_dir = dirname($_SERVER['SCRIPT_NAME'], 2);
    if ($base_dir === '\\' || $base_dir === '/') $base_dir = '';
    // remembered for the scheduled publishing, which runs without a request
    cc_meta_set($pdo, 'site_base_dir', $base_dir);
    echo json_encode(cc_publish_site($pdo, $data_dir, $base_dir));
} catch (Throwable $e) {
    error_log('CanvasCore publish: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    echo json_encode(['success' => false, 'message' => 'Publishing failed because of a server error. Details are in the server error log.']);
}
