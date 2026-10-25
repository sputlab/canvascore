<?php
// canvascore-admin/submit_form.php
// Receives forms from the public site and sends the email.
// SECURITY: the recipient is NEVER taken from the client (no open relay): it comes from the registry written by
// the build (the form's own email, or the global one in Global Options). The registry also lists each form's
// fields and success message: only those fields are stored and mailed, only that message is shown.
require_once __DIR__ . '/config.php';
error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
cc_security_headers();
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

const CC_FORM_MAX_BYTES = 65536;    // a whole submission
const CC_FORM_MAX_VALUE = 5000;     // one field
const CC_FORM_MAX_ROWS = 20000;     // stored submissions (older ones are still in the email inbox)

// Work to do AFTER the visitor has been answered (webhooks, newsletter services): set by the submission, run by cc_finish()
$CC_AFTER = null;
function cc_finish($message, $code = 200) {
    global $CC_AFTER;
    http_response_code($code);
    $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    ob_start();
    echo "<!doctype html><meta charset='utf-8'><meta name='robots' content='noindex'><title>Form</title>";
    echo "<div style=\"font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;text-align:center;\">";
    echo "<p style=\"font-size:16px;color:#0f172a;\">{$safe}</p>";
    echo "<p style=\"margin-top:15px;color:#64748b;font-size:14px;\">Use your browser's Back button to return to the site.</p>";
    echo "</div>";
    $out = ob_get_clean();
    // The answer goes out first (and the connection closes); integrations then run without keeping the visitor waiting
    ignore_user_abort(true);
    header('Content-Length: ' . strlen($out)); header('Connection: close');
    echo $out;
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_flush(); flush(); }
    if (is_callable($CC_AFTER)) { try { @set_time_limit(60); $CC_AFTER(); } catch (Throwable $e) { error_log('CanvasCore integrations: ' . $e->getMessage()); } }
    exit;
}
// Every value as text: a crafted field such as field_0[]=x must not crash the script
function cc_str($v) { return is_array($v) ? implode(', ', array_map('cc_str', $v)) : trim((string)$v); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cc_finish('Use the form on the site.', 405);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > CC_FORM_MAX_BYTES) cc_finish('The message is too long.', 413);

$data_dir = cc_data_dir();
$settings_file = $data_dir . '/settings.json';
$settings = file_exists($settings_file) ? json_decode((string)file_get_contents($settings_file), true) : [];
if (!is_array($settings)) $settings = [];

// Per-form registry (written by the build). Older builds stored only the recipient (a string).
$forms_file = $data_dir . '/forms.json';
$forms = file_exists($forms_file) ? json_decode((string)file_get_contents($forms_file), true) : null;
$form_id = cc_str($_POST['_form'] ?? '');
if (!is_array($forms) || $form_id === '' || !array_key_exists($form_id, $forms)) cc_finish('This form is no longer available. Reload the page and try again.', 400);
$entry = is_array($forms[$form_id]) ? $forms[$form_id] : ['to' => (string)$forms[$form_id]];
$form_to = filter_var($entry['to'] ?? '', FILTER_VALIDATE_EMAIL) ? $entry['to'] : '';
$successMsg = trim((string)($entry['success'] ?? '')) !== '' ? (string)$entry['success'] : 'Message sent successfully!';

// Honeypot anti-spam: bots fill in the hidden field -> pretend success and stop
if (!empty($_POST['_hp'])) cc_finish($successMsg);

// At most 8 submissions every 10 minutes from the same address (stops floods of spam and database filling)
if (!cc_rate_allow('forms', cc_client_ip(), 8, 600)) cc_finish('Too many messages sent in a short time. Please try again in a few minutes.', 429);

// The fields: the form's own (field_0 … field_N-1, labelled as on the site); anything else is ignored
$labels = isset($entry['labels']) && is_array($entry['labels']) ? array_values($entry['labels']) : null;
$fields = []; $byIndex = [];
foreach ($_POST as $k => $v) {
    if (!is_string($k) || !preg_match('/^field_(\d{1,3})$/', $k, $m)) continue;
    $i = (int)$m[1];
    if ($labels !== null && !array_key_exists($i, $labels)) continue;
    $label = $labels !== null ? (string)$labels[$i] : cc_str($_POST['_label_' . $k] ?? '');
    $label = mb_substr(str_replace(["\r", "\n"], ' ', $label), 0, 200);
    if ($label === '') $label = 'Field ' . ($i + 1);
    while (isset($fields[$label])) $label .= ' ';
    $fields[$label] = mb_substr(cc_str($v), 0, CC_FORM_MAX_VALUE);
    $byIndex[$i] = $fields[$label];
    if (count($fields) >= 50) break;
}
if (!$fields || implode('', $fields) === '') cc_finish('The form is empty.', 400);

// Store the submission in the database (regardless of the email outcome)
$subId = 0; $pdo = null;
try {
    $db = $data_dir . '/canvascore.sqlite';
    if (file_exists($db)) {
        $pdo = new PDO("sqlite:$db");
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("CREATE TABLE IF NOT EXISTS form_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, form_id TEXT, page TEXT, data_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        if ((int)$pdo->query("SELECT COUNT(*) FROM form_submissions")->fetchColumn() < CC_FORM_MAX_ROWS) {
            $page_ref = mb_substr((string)($_SERVER['HTTP_REFERER'] ?? ''), 0, 500);
            $pdo->prepare("INSERT INTO form_submissions (form_id, page, data_json) VALUES (?,?,?)")
                ->execute([$form_id, $page_ref, json_encode($fields, JSON_UNESCAPED_UNICODE)]);
            $subId = (int)$pdo->lastInsertId();
        }
    }
} catch (Exception $e) { error_log('CanvasCore form storage: ' . $e->getMessage()); }

// Integrations (Administration › Integrations): webhooks and newsletter services run after the answer. Nothing here changes what the
// visitor sees, and a demo site never calls out.
if ($pdo && !cc_demo_on() && is_file($data_dir . '/integrations.json')) {
    $CC_AFTER = function () use ($pdo, $form_id, $entry, $byIndex, $fields, $subId) {
        require_once __DIR__ . '/integrations.php';
        $host = preg_replace('/[^a-zA-Z0-9.:\-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
        $base = dirname($_SERVER['SCRIPT_NAME'] ?? '/canvascore-admin/submit_form.php', 2);
        $site = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . $host . ($base === '/' || $base === '\\' || $base === '.' ? '' : $base) . '/';
        cc_int_dispatch($pdo, ['id' => $form_id, 'type' => (string)($entry['type'] ?? 'form'), 'meta' => is_array($entry['meta'] ?? null) ? $entry['meta'] : []], $byIndex, $fields, $subId, mb_substr((string)($_SERVER['HTTP_REFERER'] ?? ''), 0, 500), $site);
    };
}

// Priority: form-specific recipient (registry) -> global email from the settings.
$to = $form_to !== '' ? $form_to : trim((string)($settings['adminEmail'] ?? ''));
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    error_log('CanvasCore form: no valid receiving email for form ' . $form_id . ' (set one in Global Options): the message was only stored.');
    cc_finish('Thank you: your message was received.');
}

$host = preg_replace('/[^a-zA-Z0-9.\-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
$from = trim((string)($settings['emailFrom'] ?? '')) ?: 'noreply@' . $host;
if (!filter_var($from, FILTER_VALIDATE_EMAIL)) $from = 'noreply@localhost';
$subject = trim((string)($settings['emailSubject'] ?? '')) ?: 'New submission from your website';
$subject = mb_substr(str_replace(["\r", "\n"], ' ', $subject), 0, 200);   // no header injection

$body  = "You have received a new message from your website:\n";
$body .= "------------------------------------------------------\n\n";
foreach ($fields as $label => $value) {
    $body .= strtoupper(trim($label)) . ":\n" . $value . "\n\n";
}
$body .= "------------------------------------------------------\n";
$body .= "Powered by CanvasCore";

$headers  = "From: $from\r\n";
$headers .= "Reply-To: $from\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

// Demo mode: the submission is stored, but a public demo never sends mail
if (cc_demo_on()) cc_finish($successMsg);

if (@mail($to, $subject, $body, $headers)) {
    cc_finish($successMsg);
} else {
    error_log('CanvasCore form: mail() failed for form ' . $form_id);
    cc_finish('Thank you: your message was received.');
}
