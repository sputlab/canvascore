<?php
// canvascore-admin/install-cli.php: installs CanvasCore from the command line, with no questions asked (scripts, hosting installers, containers).
//   php canvascore-admin/install-cli.php --site-name="My site" --admin-user=maria --admin-email=maria@example.com --site-url=https://www.example.com
// The password is read from the environment (CC_ADMIN_PASS) or from the first line of standard input (--admin-pass-stdin), never from an
// argument (the process list shows arguments to everyone on the server); --admin-pass-hash=<password_hash() output> works too.
// Other options: --starter=<id> (a homepage draft from starters.json), --delete-installer, --json (the result as JSON).
// Exit code: 0 installed, 1 not installed (the message says why). It works only from the command line: the web server never runs it.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/installlib.php';

$opt = getopt('', ['site-name:', 'site-url:', 'admin-user:', 'admin-email:', 'admin-pass-hash:', 'admin-pass-stdin', 'starter:', 'delete-installer', 'json', 'help']);
$json = isset($opt['json']);
$say = function ($ok, $msg, $errors = []) use ($json) {
    if ($json) echo json_encode(['success' => $ok, 'message' => $msg, 'errors' => $errors]) . "\n";
    else fwrite($ok ? STDOUT : STDERR, $msg . "\n");
    exit($ok ? 0 : 1);
};
if (isset($opt['help'])) { echo "Usage: php install-cli.php --site-name=NAME --admin-user=USER [--admin-email=EMAIL] [--site-url=URL] [--starter=ID] [--delete-installer] [--json]\nPassword: CC_ADMIN_PASS in the environment, or --admin-pass-stdin, or --admin-pass-hash=HASH.\n"; exit(0); }

$pass = '';
if (isset($opt['admin-pass-stdin'])) $pass = rtrim((string)fgets(STDIN), "\r\n");
elseif (getenv('CC_ADMIN_PASS') !== false) $pass = (string)getenv('CC_ADMIN_PASS');
$answers = [
    'site_name' => $opt['site-name'] ?? '', 'site_url' => $opt['site-url'] ?? '', 'admin_user' => $opt['admin-user'] ?? '',
    'admin_email' => $opt['admin-email'] ?? '', 'starter' => $opt['starter'] ?? '', 'admin_pass' => $pass,
    'admin_pass_hash' => $opt['admin-pass-hash'] ?? '', 'delete_installer' => isset($opt['delete-installer']),
];
$res = cc_install_unattended($answers);
$say($res['success'], $res['message'], $res['errors']);
