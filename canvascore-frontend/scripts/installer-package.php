<?php
// scripts/installer-package.php — the packages for hosting installers (one-click installs), made from the release's update package.
//   php scripts/installer-package.php --archive=<canvascore-X.zip> [--out=<folder>]
// Writes, next to each other:
//   canvascore-<version>-softaculous.zip   a Softaculous script package (info.xml, install.xml, install.php, install.js, fileindex.php and canvascore.zip)
//   canvascore-<version>-installer.json    a neutral manifest for other installers (Installatron, Plesk, DirectAdmin, scripts): requirements,
//                                          the archive with its checksum and signature, the questions, and how to run the unattended setup
// The archive is the signed update package of the release (every file under canvascore-admin/): unpacked in the web root it is the whole site.
if (PHP_SAPI !== 'cli') exit(1);
$opt = getopt('', ['archive:', 'out:']);
$root = realpath(__DIR__ . '/../..');
$fail = function ($m) { fwrite(STDERR, $m . "\n"); exit(1); };
$ver = json_decode((string)file_get_contents($root . '/canvascore-admin/version.json'), true)['app'] ?? '';
if (!preg_match('/^\d+\.\d+\.\d+$/', $ver)) $fail('version.json has no valid version.');
$archive = $opt['archive'] ?? '';
if ($archive === '' || !is_file($archive)) $fail('Usage: php scripts/installer-package.php --archive=<canvascore-' . $ver . '.zip> [--out=<folder>]');
$out = rtrim($opt['out'] ?? dirname($archive), '/');

// The archive must be this version's, and complete
$z = new ZipArchive();
if ($z->open($archive, ZipArchive::CHECKCONS) !== true) $fail('The archive is not a valid ZIP.');
$names = []; $size = 0;
for ($i = 0; $i < $z->numFiles; $i++) { $st = $z->statIndex($i); $names[$st['name']] = true; $size += $st['size']; }
foreach (['canvascore-admin/install.php', 'canvascore-admin/installlib.php', 'canvascore-admin/install-cli.php', 'canvascore-admin/index.html', 'canvascore-admin/version.json'] as $need) {
    if (!isset($names[$need])) $fail("The archive has no $need: build it with scripts/release-package.php from this version.");
}
$v = json_decode((string)$z->getFromName('canvascore-admin/version.json'), true);
if (($v['app'] ?? '') !== $ver) $fail('The archive is version ' . ($v['app'] ?? '?') . ', not ' . $ver . '.');
$z->close();

$src = $root . '/installers/softaculous';
$starters = json_decode((string)file_get_contents($root . '/canvascore-admin/starters.json'), true) ?: [];
$esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES | ENT_XML1, 'UTF-8');
$opts = "\t\t\t\t\t<option value=\"none\">No page (empty site)</option>";
foreach ($starters as $s) if (!empty($s['id'])) $opts .= "\n\t\t\t\t\t<option value=\"" . $esc($s['id']) . "\">" . $esc($s['name'] ?? $s['id']) . "</option>";
$fill = fn($t) => str_replace(['%VERSION%', '%SPACE%', '%STARTER_OPTIONS%'], [$ver, (string)(int)ceil($size / 1024), $opts], $t);

$pkg = "$out/canvascore-$ver-softaculous.zip";
$p = new ZipArchive();
if ($p->open($pkg, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) $fail("Cannot write $pkg.");
foreach (['info.xml', 'install.xml', 'install.php', 'install.js', 'fileindex.php'] as $f) {
    $t = (string)file_get_contents("$src/$f");
    $p->addFromString("canvascore/$f", in_array($f, ['info.xml', 'install.xml'], true) ? $fill($t) : $t);
}
$p->addFile($archive, 'canvascore/canvascore.zip');
$p->close();
foreach (['info.xml', 'install.xml'] as $f) {
    $x = new DOMDocument();
    if (!@$x->loadXML($fill((string)file_get_contents("$src/$f")))) $fail("$f is not well-formed XML.");
}
$lint = function ($f) use ($fail) { exec('php -l ' . escapeshellarg($f) . ' 2>&1', $o, $rc); if ($rc !== 0) $fail("$f: " . implode(' ', $o)); };
$lint("$src/install.php"); $lint("$src/fileindex.php");

$sigFile = $archive . '.sig';
$manifest = [
    'name' => 'CanvasCore', 'version' => $ver, 'homepage' => 'https://github.com/sputlab/canvascore',
    'requirements' => ['php' => '8.0.0', 'extensions' => ['pdo_sqlite', 'dom', 'json', 'session'], 'recommended_extensions' => ['zip', 'sodium'], 'database' => 'none (SQLite in a data folder CanvasCore creates itself)'],
    'archive' => ['file' => "canvascore-$ver.zip", 'sha256' => hash_file('sha256', $archive), 'signature' => is_file($sigFile) ? trim((string)file_get_contents($sigFile)) : null,
        'unpack_into' => 'the web root of the site, or a sub-folder of it', 'contains' => 'canvascore-admin/ (the editor, the publisher and the installer)'],
    'install' => [
        'questions' => [
            ['name' => 'site_name', 'type' => 'text', 'required' => true],
            ['name' => 'admin_user', 'type' => 'text', 'required' => true, 'pattern' => '^[A-Za-z0-9._@-]{3,32}$'],
            ['name' => 'admin_pass', 'type' => 'password', 'required' => true, 'min_length' => 8],
            ['name' => 'admin_email', 'type' => 'email', 'required' => false],
            ['name' => 'starter', 'type' => 'select', 'required' => false, 'options' => array_values(array_filter(array_column($starters, 'id')))],
        ],
        'command' => 'CC_ADMIN_PASS=… php canvascore-admin/install-cli.php --site-name=… --admin-user=… --admin-email=… --site-url=… [--starter=…] --delete-installer --json',
        'provisioning_file' => ['path' => 'canvascore-admin/install-provision.json', 'fields' => ['site_name', 'site_url', 'admin_user', 'admin_pass_hash', 'admin_email', 'starter', 'delete_installer'],
            'then' => 'GET <site>/canvascore-admin/install.php?format=json: installs with it, deletes the file, answers {"success":true|false,"message":…}'],
        'writable' => ['canvascore-admin/', 'the site folder (published pages)', 'uploads/'],
        'url_after' => '/canvascore-admin/',
    ],
    'upgrade' => 'In the editor (Administration › Updates): signed packages, backup first, rollback if a check fails. The installer need not touch an installed site.',
    'uninstall' => ['remove' => ['canvascore-admin/', 'uploads/', 'the published pages'], 'data_folder' => 'canvascore-data next to the web root (or canvascore-admin/data): database and settings'],
];
$mf = "$out/canvascore-$ver-installer.json";
file_put_contents($mf, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
echo "$pkg (" . round(filesize($pkg) / 1048576, 2) . " MB)\n$mf\nUpload both as assets of the GitHub release v$ver.\n";
