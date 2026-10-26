<?php
// scripts/release-package.php — the signed update package of a release (one-click updates).
//   php scripts/release-package.php --key=<secret-key-file> [--dist=<built editor folder>] [--out=<folder>] [--installers]
// Packs the tracked files of canvascore-admin/ and the built editor into canvascore-<version>.zip (every file under
// canvascore-admin/), and signs it: canvascore-<version>.zip.sig. Both are uploaded as assets of the GitHub release.
// --installers also makes the hosting-installer packages from it (scripts/installer-package.php: Softaculous and a neutral manifest).
// Without --dist the editor is built first (vite build into a temporary folder; version.json is not bumped).
if (PHP_SAPI !== 'cli') exit(1);
$opt = getopt('', ['key:', 'dist:', 'out:', 'installers']);
$root = realpath(__DIR__ . '/../..');
$front = $root . '/canvascore-frontend';
$fail = function ($m) { fwrite(STDERR, $m . "\n"); exit(1); };
if (empty($opt['key']) || !is_file($opt['key'])) $fail('Usage: php scripts/release-package.php --key=<secret-key-file> [--dist=<folder>] [--out=<folder>]');
$sk = base64_decode(trim((string)file_get_contents($opt['key'])), true);
if ($sk === false || strlen($sk) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) $fail('Not a secret key made by release-keygen.php.');

require $root . '/canvascore-admin/update.php';
$pub = sodium_crypto_sign_publickey_from_secretkey($sk);
if (!in_array($pub, cc_update_keys(), true)) $fail('This key is not listed in canvascore-admin/update-keys.php: sites would refuse the package.');
$ver = json_decode((string)file_get_contents($root . '/canvascore-admin/version.json'), true)['app'] ?? '';
if (cc_update_version($ver) !== $ver) $fail('version.json has no valid version.');

$dist = $opt['dist'] ?? '';
if ($dist === '') {
    $dist = sys_get_temp_dir() . '/cc-release-dist-' . getmypid();
    passthru('cd ' . escapeshellarg($front) . ' && npx vite build --outDir ' . escapeshellarg($dist) . ' --emptyOutDir', $rc);
    if ($rc !== 0) $fail('The editor build failed.');
}
if (!is_file($dist . '/index.html')) $fail("$dist has no index.html: not a built editor.");
$out = rtrim($opt['out'] ?? ($root . '/..'), '/');
$zipFile = "$out/canvascore-$ver.zip";

exec('git -C ' . escapeshellarg($root) . ' ls-files -z canvascore-admin', $lines, $rc);
if ($rc !== 0) $fail('git ls-files failed.');
$tracked = array_filter(explode("\0", implode("\n", $lines)));
$zip = new ZipArchive();
if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) $fail("Cannot write $zipFile.");
$n = 0;
foreach ($tracked as $rel) {
    $rel = trim($rel);
    if ($rel === '' || !is_file("$root/$rel") || is_link("$root/$rel")) continue;
    $zip->addFile("$root/$rel", $rel); $n++;
}
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dist, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    if ($f->isLink()) continue;
    $zip->addFile($f->getPathname(), 'canvascore-admin/' . str_replace('\\', '/', substr($f->getPathname(), strlen($dist) + 1))); $n++;
}
$zip->close();

// The same checks a site makes before installing it
$z = new ZipArchive(); $z->open($zipFile, ZipArchive::CHECKCONS);
try { cc_update_inspect($z, $ver); } catch (Throwable $e) { $fail('The package would be refused: ' . $e->getMessage()); }
$z->close();
$sig = base64_encode(sodium_crypto_sign_detached(cc_update_signed_message($zipFile), $sk));
file_put_contents($zipFile . '.sig', $sig . "\n");
if (!cc_update_verify($zipFile, $sig, cc_update_keys())) $fail('The signature does not verify.');
echo "$zipFile ($n files, " . round(filesize($zipFile) / 1048576, 2) . " MB)\n$zipFile.sig\nUpload both as assets of the GitHub release v$ver.\n";
if (isset($opt['installers'])) {
    passthru('php ' . escapeshellarg(__DIR__ . '/installer-package.php') . ' --archive=' . escapeshellarg($zipFile) . ' --out=' . escapeshellarg($out), $rc);
    if ($rc !== 0) $fail('The installer packages could not be made.');
}
