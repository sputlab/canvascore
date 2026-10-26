<?php
// canvascore-admin/demo-reset.php: puts a public demo site back to its baseline now (see demo.php). The demo does this by itself, on the first
// request of every time slot; this address is for a cron service (or a command line) that should reset a demo nobody is visiting:
//   https://demo.example.com/canvascore-admin/demo-reset.php?token=<resetToken of demo.json>      or      php demo-reset.php <token>
// Without "resetToken" in demo.json the address does not exist for the web (a command line may always run it). Answers JSON.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/demo.php';
header('Content-Type: application/json');
header('Cache-Control: no-store');
if (PHP_SAPI !== 'cli') cc_security_headers();
$demo = cc_demo_config();
$sent = PHP_SAPI === 'cli' ? (string)($argv[1] ?? '') : (string)($_GET['token'] ?? '');
$cli = PHP_SAPI === 'cli';
if (!$demo || (!$cli && ($demo['resetToken'] === '' || !hash_equals($demo['resetToken'], $sent)))) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Not found.']); exit; }
ini_set('display_errors', '0');
try {
    $pdo = new PDO('sqlite:' . cc_data_dir() . '/canvascore.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo json_encode(cc_demo_reset($pdo));
} catch (Throwable $e) {
    error_log('CanvasCore demo reset: ' . $e->getMessage());
    http_response_code(500); echo json_encode(['success' => false, 'message' => 'The reset failed (see the server error log).']);
}
