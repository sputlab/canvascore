<?php
// tests/installers.php — one-click installs (npm run test:installers): the unattended installer (command line and provisioning file) and
// the hosting-installer packages, run for real on copies of the site in a temporary folder and PHP's built-in server.
$fails = 0; $total = 0;
function check($name, $ok, $extra = '') { global $fails, $total; $total++; if ($ok) echo "  ✓ $name\n"; else { $fails++; echo "  ✗ $name" . ($extra !== '' ? "  → $extra" : '') . "\n"; } }
$ROOT = realpath(__DIR__ . '/../..');
$T = sys_get_temp_dir() . '/cc-installers-' . getmypid();
register_shutdown_function(function () use ($T) { exec('rm -rf ' . escapeshellarg($T)); });
@mkdir($T, 0777, true);

// A site: <T>/<n>/site/canvascore-admin (no database, no editor build needed beyond a stand-in index.html); its data goes to <T>/<n>/canvascore-data
function fresh_site($n) {
    global $T, $ROOT;
    $site = "$T/$n/site"; @mkdir($site, 0777, true);
    exec('cp -R ' . escapeshellarg("$ROOT/canvascore-admin") . ' ' . escapeshellarg($site . '/'));
    exec('rm -rf ' . escapeshellarg("$site/canvascore-admin/data") . ' ' . escapeshellarg("$T/$n/canvascore-data"));
    @mkdir("$site/canvascore-admin/data", 0777, true);
    if (!is_file("$site/canvascore-admin/index.html")) file_put_contents("$site/canvascore-admin/index.html", '<!doctype html>');
    return $site;
}
function cli($site, $args, $env = [], $stdin = null) {
    $cmd = 'php ' . escapeshellarg("$site/canvascore-admin/install-cli.php") . ' ' . $args . ' 2>&1';
    $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w']], $pipes, null, $env + ['PATH' => getenv('PATH')]);
    if ($stdin !== null) fwrite($pipes[0], $stdin); fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    return [proc_close($p), $out];
}
function db_of($site) { return new PDO('sqlite:' . dirname($site) . '/canvascore-data/canvascore.sqlite'); }
function installed($site) { return is_file(dirname($site) . '/canvascore-data/canvascore.sqlite') && (int)db_of($site)->query("SELECT COUNT(*) FROM admin")->fetchColumn() > 0; }
$port = 18700;
function serve($site) {
    global $port; $port++;
    $p = proc_open(['php', '-S', "127.0.0.1:$port", '-t', $site], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    for ($i = 0; $i < 50; $i++) { $s = @fsockopen('127.0.0.1', $port, $e, $m, 0.1); if ($s) { fclose($s); break; } usleep(100000); }
    return [$p, "http://127.0.0.1:$port"];
}
function http($url) {
    $ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 30]]);
    $b = @file_get_contents($url, false, $ctx);
    preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $m);
    return [(int)($m[1] ?? 0), (string)$b, json_decode((string)$b, true)];
}

echo "\nUNATTENDED INSTALL FROM THE COMMAND LINE\n";
$s = fresh_site('cli');
[$rc, $out] = cli($s, '--site-name="Acme" --admin-user=maria --admin-email=maria@example.com --site-url=https://acme.example/ --json', ['CC_ADMIN_PASS' => 'correct-horse-9']);
$j = json_decode($out, true);
check('it installs with the password taken from the environment', $rc === 0 && !empty($j['success']), $out);
$row = installed($s) ? db_of($s)->query("SELECT username, password_hash, role FROM admin")->fetch(PDO::FETCH_ASSOC) : null;
check('the account is an administrator, with a hashed password that verifies', $row && $row['username'] === 'maria' && $row['role'] === 'admin' && password_verify('correct-horse-9', $row['password_hash']));
$settings = json_decode((string)@file_get_contents(dirname($s) . '/canvascore-data/settings.json'), true);
check('the site name, address (no trailing slash) and email are saved', ($settings['siteName'] ?? '') === 'Acme' && ($settings['siteUrl'] ?? '') === 'https://acme.example' && ($settings['adminEmail'] ?? '') === 'maria@example.com');
check('the site counts as installed, and no setup key is left', !is_file(dirname($s) . '/canvascore-data/install-key.txt') && (string)db_of($s)->query("SELECT value FROM cc_meta WHERE key = 'installed_at'")->fetchColumn() !== '');
[$rc, $out] = cli($s, '--site-name=Again --admin-user=other', ['CC_ADMIN_PASS' => 'correct-horse-9']);
check('a second run is refused and changes nothing', $rc === 1 && strpos($out, 'already installed') !== false && (int)db_of($s)->query("SELECT COUNT(*) FROM admin")->fetchColumn() === 1);

foreach ([
    'a short password' => ['--site-name=A --admin-user=maria', ['CC_ADMIN_PASS' => 'short']],
    'the password "admin"' => ['--site-name=A --admin-user=maria', ['CC_ADMIN_PASS' => 'ADMIN']],
    'no password at all' => ['--site-name=A --admin-user=maria', []],
    'a password equal to the username' => ['--site-name=A --admin-user=mariamaria', ['CC_ADMIN_PASS' => 'mariamaria']],
    'an unusable username' => ['--site-name=A "--admin-user=ma ria"', ['CC_ADMIN_PASS' => 'correct-horse-9']],
    'no site name' => ['--admin-user=maria', ['CC_ADMIN_PASS' => 'correct-horse-9']],
    'a bad address' => ['--site-name=A --admin-user=maria ' . escapeshellarg('--site-url=javascript:alert(1)'), ['CC_ADMIN_PASS' => 'correct-horse-9']],
    'a bad email' => ['--site-name=A --admin-user=maria --admin-email=nope', ['CC_ADMIN_PASS' => 'correct-horse-9']],
    'an unknown starter' => ['--site-name=A --admin-user=maria --starter=nope', ['CC_ADMIN_PASS' => 'correct-horse-9']],
    'a hash that is not a hash' => ['--site-name=A --admin-user=maria --admin-pass-hash=plaintext', []],
] as $what => [$args, $env]) {
    $b = fresh_site('bad');
    [$rc, $out] = cli($b, $args, $env);
    check("$what is refused, nothing is installed", $rc === 1 && !installed($b), $out);
}
$b = fresh_site('stdin');
[$rc, $out] = cli($b, '--site-name=S --admin-user=maria --admin-pass-stdin --starter=' . (json_decode(file_get_contents("$ROOT/canvascore-admin/starters.json"), true)[0]['id'] ?? ''), [], "stdin-pass-123\n");
$pg = installed($b) ? (int)db_of($b)->query("SELECT COUNT(*) FROM pages WHERE is_home = 1 AND status = 'draft'")->fetchColumn() : -1;
check('the password can come from standard input, and a starter makes a draft homepage', $rc === 0 && $pg === 1, $out);
$b = fresh_site('hash');
[$rc, $out] = cli($b, '--site-name=S --admin-user=maria --admin-pass-hash=' . escapeshellarg(password_hash('hashed-pass-77', PASSWORD_DEFAULT)));
$row = installed($b) ? db_of($b)->query("SELECT password_hash FROM admin")->fetchColumn() : '';
check('a ready-made hash is stored as it is (the password never travels)', $rc === 0 && password_verify('hashed-pass-77', (string)$row), $out);
$b = fresh_site('del');
[$rc] = cli($b, '--site-name=S --admin-user=maria --delete-installer', ['CC_ADMIN_PASS' => 'correct-horse-9']);
check('--delete-installer removes install.php', $rc === 0 && !is_file("$b/canvascore-admin/install.php") && is_file("$b/canvascore-admin/installlib.php"));

echo "\nPROVISIONING FILE (HOSTING INSTALLERS)\n";
$s = fresh_site('prov');
[$srv, $base] = serve($s);
[$code, , $j] = http("$base/canvascore-admin/install.php?format=json");
check('with no answers left, a script is told so (409), and nothing is installed', $code === 409 && empty($j['success']) && !installed($s));
$prov = ['site_name' => 'Hosted', 'site_url' => $base, 'admin_user' => 'maria', 'admin_pass_hash' => password_hash('provision-pw-1', PASSWORD_DEFAULT), 'admin_email' => 'm@example.com', 'starter' => '', 'delete_installer' => true];
file_put_contents("$s/canvascore-admin/install-provision.json", json_encode($prov));
[$code, , $j] = http("$base/canvascore-admin/install.php?format=json");
check('the provisioning file installs the site', $code === 200 && !empty($j['success']), json_encode($j));
check('…the file with the answers is deleted', !is_file("$s/canvascore-admin/install-provision.json"));
check('…the account has the hashed password', installed($s) && password_verify('provision-pw-1', (string)db_of($s)->query("SELECT password_hash FROM admin")->fetchColumn()));
check('…and install.php was deleted (delete_installer)', !is_file("$s/canvascore-admin/install.php"));
proc_terminate($srv);

$s = fresh_site('prov2'); [$srv, $base] = serve($s);
file_put_contents("$s/canvascore-admin/install-provision.json", json_encode(['site_name' => '', 'admin_user' => 'x']));
[$code, , $j] = http("$base/canvascore-admin/install.php?format=json");
check('wrong answers are refused with the reasons, and the file is deleted anyway', $code === 409 && !empty($j['errors']) && !is_file("$s/canvascore-admin/install-provision.json") && !installed($s));
file_put_contents("$s/canvascore-admin/install-provision.json", '{not json');
[$code] = http("$base/canvascore-admin/install.php?format=json");
check('a broken file is refused and deleted', $code === 409 && !is_file("$s/canvascore-admin/install-provision.json"));
$prov['delete_installer'] = false;
file_put_contents("$s/canvascore-admin/install-provision.json", json_encode($prov));
$page = http("$base/canvascore-admin/install.php");
check('a browser visiting install.php finishes a provisioned install too', $page[0] === 200 && installed($s) && strpos($page[1], 'Already installed') !== false && !is_file("$s/canvascore-admin/install-provision.json"));
$prov['delete_installer'] = false;
file_put_contents("$s/canvascore-admin/install-provision.json", json_encode(['site_name' => 'Hijack', 'admin_user' => 'evil', 'admin_pass' => 'evil-pass-123']));
[$code, , $j] = http("$base/canvascore-admin/install.php?format=json");
check('on an installed site a provisioning file is deleted, and nothing changes', $code === 409 && !is_file("$s/canvascore-admin/install-provision.json") && (int)db_of($s)->query("SELECT COUNT(*) FROM admin WHERE username = 'evil'")->fetchColumn() === 0);
[$code, $body] = http("$base/canvascore-admin/install-cli.php");
check('the command-line installer is not reachable over the web', $code !== 200 || trim($body) === '');
proc_terminate($srv);

echo "\nHOSTING INSTALLER PACKAGES\n";
$src = fresh_site('pkgsrc');
$ver = json_decode(file_get_contents("$ROOT/canvascore-admin/version.json"), true)['app'];
$archive = "$T/canvascore-$ver.zip";
$z = new ZipArchive(); $z->open($archive, ZipArchive::CREATE | ZipArchive::OVERWRITE);
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$ROOT/canvascore-admin", FilesystemIterator::SKIP_DOTS)) as $f) {
    $rel = 'canvascore-admin/' . substr($f->getPathname(), strlen("$ROOT/canvascore-admin") + 1);
    if (strpos($rel, 'canvascore-admin/data/') === 0 || substr($rel, -7) === '.sqlite') continue;
    $z->addFile($f->getPathname(), $rel);
}
if (!is_file("$ROOT/canvascore-admin/index.html")) $z->addFromString('canvascore-admin/index.html', '<!doctype html>');
$z->close();
file_put_contents("$archive.sig", "c2lnbmF0dXJl\n");
$outd = "$T/out"; @mkdir($outd);
exec('php ' . escapeshellarg("$ROOT/canvascore-frontend/scripts/installer-package.php") . " --archive=" . escapeshellarg($archive) . ' --out=' . escapeshellarg($outd) . ' 2>&1', $o, $rc);
check('the package builder runs on the release archive', $rc === 0 && is_file("$outd/canvascore-$ver-softaculous.zip") && is_file("$outd/canvascore-$ver-installer.json"), implode(' ', $o));
exec('php ' . escapeshellarg("$ROOT/canvascore-frontend/scripts/installer-package.php") . ' --archive=' . escapeshellarg("$T/nope.zip") . ' 2>&1', $o2, $rc2);
check('it refuses without an archive', $rc2 === 1);
$bad = "$T/bad.zip"; $bz = new ZipArchive(); $bz->open($bad, ZipArchive::CREATE); $bz->addFromString('canvascore-admin/install.php', 'x'); $bz->close();
exec('php ' . escapeshellarg("$ROOT/canvascore-frontend/scripts/installer-package.php") . ' --archive=' . escapeshellarg($bad) . ' --out=' . escapeshellarg($outd) . ' 2>&1', $o3, $rc3);
check('…and an incomplete archive', $rc3 === 1 && stripos(implode(' ', $o3), 'installlib.php') !== false);

$sz = new ZipArchive(); $sz->open("$outd/canvascore-$ver-softaculous.zip");
$names = []; for ($i = 0; $i < $sz->numFiles; $i++) $names[] = $sz->getNameIndex($i);
check('the Softaculous package has the files Softaculous reads', !array_diff(['canvascore/info.xml', 'canvascore/install.xml', 'canvascore/install.php', 'canvascore/install.js', 'canvascore/fileindex.php', 'canvascore/canvascore.zip'], $names), implode(',', $names));
check('canvascore.zip inside is the release archive', hash('sha256', (string)$sz->getFromName('canvascore/canvascore.zip')) === hash_file('sha256', $archive));
$info = new DOMDocument(); $install = new DOMDocument();
check('info.xml and install.xml are well-formed, with this version and no placeholder left', @$info->loadXML((string)$sz->getFromName('canvascore/info.xml')) && @$install->loadXML((string)$sz->getFromName('canvascore/install.xml')) && trim($info->getElementsByTagName('version')->item(0)->textContent) === $ver && strpos($sz->getFromName('canvascore/info.xml') . $sz->getFromName('canvascore/install.xml'), '%') === false);
$names_in_form = []; foreach ((new DOMXPath($install))->query('//*[@name]') as $el) $names_in_form[] = $el->getAttribute('name');
check('the form asks for the site name, homepage, administrator username, password and email', !array_diff(['site_name', 'starter', 'admin_username', 'admin_pass', 'admin_email'], $names_in_form));
$opts = []; foreach ((new DOMXPath($install))->query('//*[local-name()="select"][@name="starter"]/*[local-name()="option"]') as $el) $opts[] = $el->getAttribute('value');
$ids = array_column(json_decode(file_get_contents("$ROOT/canvascore-admin/starters.json"), true), 'id');
check('the homepage choices are the starters of this release', $opts === array_merge(['none'], $ids), json_encode($opts));
$langs = []; foreach ($info->getElementsByTagName('languages')->item(0)->childNodes as $c) if ($c->nodeType === XML_ELEMENT_NODE) $langs[] = preg_replace('/^english-/', '', $c->nodeName);
preg_match_all('/\{\{(\w+)\}\}/', $sz->getFromName('canvascore/install.xml') . $sz->getFromName('canvascore/install.js') . $sz->getFromName('canvascore/install.php') . $sz->getFromName('canvascore/info.xml'), $mm);
$missing = array_diff(array_unique($mm[1]), $langs, ['err_wrongemail', 'err_ademail']);
check('every {{text}} the package uses has an English string in info.xml', !$missing, implode(',', $missing));
check('fileindex.php lists what to remove: the admin folder and the uploads', preg_split('/\R/', trim((string)$sz->getFromName('canvascore/fileindex.php'))) === ['canvascore-admin', 'uploads']);
$mf = json_decode((string)file_get_contents("$outd/canvascore-$ver-installer.json"), true);
check('the manifest has the checksum, the signature, the requirements and the questions', ($mf['archive']['sha256'] ?? '') === hash_file('sha256', $archive) && ($mf['archive']['signature'] ?? '') === 'c2lnbmF0dXJl' && $mf['version'] === $ver && ($mf['requirements']['php'] ?? '') === '8.0.0' && count($mf['install']['questions']) === 5);

// Softaculous's side, played for real: it unpacks canvascore.zip into the chosen folder, then calls __install() with the answers
$dest = fresh_site('soft'); exec('rm -rf ' . escapeshellarg("$dest/canvascore-admin"));
$ex = new ZipArchive(); file_put_contents("$T/inner.zip", $sz->getFromName('canvascore/canvascore.zip')); $ex->open("$T/inner.zip"); $ex->extractTo($dest); $ex->close();
@mkdir("$dest/canvascore-admin/data");
[$srv, $base] = serve($dest);
$sz->extractTo("$T/pkg");
$runner = "$T/runner.php";
file_put_contents($runner, '<?php
define("SOFTACULOUS", 1);
$error = []; $software = ["softname" => "canvascore"]; $globals = [];
$__settings = ["softpath" => $argv[1], "softurl" => $argv[2], "site_name" => "Soft Site", "starter" => $argv[3], "admin_username" => "carla", "admin_pass" => "softaculous-pw-1", "admin_email" => "carla@example.com"];
require $argv[4] . "/install.php";
__install();
echo json_encode(["error" => $error]);');
$run = function ($extra = []) use ($runner, $dest, $base, $T) {
    exec('php ' . escapeshellarg($runner) . ' ' . escapeshellarg($dest) . ' ' . escapeshellarg($base) . ' none ' . escapeshellarg("$T/pkg/canvascore") . ' 2>&1', $o);
    return json_decode(implode('', $o), true) ?? ['raw' => implode("\n", $o)];
};
$r = $run();
check('the package\'s __install() sets the site up through CanvasCore\'s own installer', $r['error'] === [] && installed($dest), json_encode($r));
check('…the administrator can sign in with the password from the form', installed($dest) && (string)db_of($dest)->query("SELECT username FROM admin")->fetchColumn() === 'carla' && password_verify('softaculous-pw-1', (string)db_of($dest)->query("SELECT password_hash FROM admin")->fetchColumn()));
check('…the site address is the one Softaculous chose, and no answers file or installer is left', json_decode((string)file_get_contents(dirname($dest) . '/canvascore-data/settings.json'), true)['siteUrl'] === $base && !is_file("$dest/canvascore-admin/install-provision.json") && !is_file("$dest/canvascore-admin/install.php"));
$r = $run();
check('installing again over an installed site reports an error (and leaves no answers file)', !empty($r['error']) && !is_file("$dest/canvascore-admin/install-provision.json"), json_encode($r));
proc_terminate($srv);

echo "\n" . ($total - $fails) . ' of ' . $total . " checks passed\n";
exit($fails ? 1 : 0);
