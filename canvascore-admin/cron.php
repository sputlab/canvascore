<?php
// canvascore-admin/cron.php: makes the scheduled changes (pages and items that go live or come down) and publishes the site
// when there were any. Run it from the server's scheduler every few minutes, for example:
//   */5 * * * *  php /path/to/site/canvascore-admin/cron.php > /dev/null 2>&1
// It only runs from the command line. The admin also does the same on its first request after a scheduled time.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/publish.php';

$db_file = cc_data_dir() . '/canvascore.sqlite';
if (!file_exists($db_file)) { fwrite(STDERR, "CanvasCore: no database yet.\n"); exit(1); }
$pdo = new PDO('sqlite:' . $db_file);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
try {
    $r = cc_run_schedules($pdo, cc_data_dir());
    echo date('Y-m-d H:i') . ' changes: ' . $r['changed'];
    if ($r['published']) echo ' — ' . $r['published']['message'];
    foreach ($r['skipped'] as $s) echo "\nskipped: " . $s;
    echo "\n";
    exit($r['published'] && empty($r['published']['success']) ? 1 : 0);
} catch (Throwable $e) {
    error_log('CanvasCore cron: ' . $e->getMessage());
    fwrite(STDERR, "CanvasCore: scheduled publishing failed (see the server error log).\n");
    exit(1);
}
