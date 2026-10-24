<?php
// scripts/block-package.php: the developer's tool for block packages (canvascore-admin/blockpkg.php).
//   php scripts/block-package.php check <folder or .zip>      the checks an install makes: layout, manifest, definitions, static
//                                                              HTML, style sheet, images, the package's own tests, hostile-value fuzz
//   php scripts/block-package.php pack <folder> [out.zip]     checks, then makes the ZIP to install (README, LICENSE, package.json,
//                                                              blocks/, style.css, assets/ only)
// Exit code 0 when the package is fine. The version check (minVersion) uses this checkout's version, or CC_PKG_APP_VERSION.
if (PHP_SAPI !== 'cli') exit(1);
if (getenv('CC_PKG_APP_VERSION')) $GLOBALS['CC_PKG_APP_VERSION'] = getenv('CC_PKG_APP_VERSION');   // check against another CanvasCore version
require __DIR__ . '/../../canvascore-admin/compiler.php';

$cmd = $argv[1] ?? ''; $src = $argv[2] ?? '';
if (!in_array($cmd, ['check', 'pack'], true) || $src === '' || !file_exists($src)) {
    fwrite(STDERR, "Usage: php scripts/block-package.php check <folder|zip>\n       php scripts/block-package.php pack <folder> [out.zip]\n");
    exit(2);
}
$p = cc_pkg_read($src);
$errs = $p['errors'];
if (!$errs) $errs = cc_pkg_run_checks($p['id'], $p['blocks']);
if ($errs) {
    fwrite(STDERR, "\nNot valid (" . count($errs) . "):\n");
    foreach ($errs as $e) fwrite(STDERR, "  ✗ $e\n");
    exit(1);
}
$tests = 0; foreach ($p['blocks'] as $b) $tests += count((array)($b['tests'] ?? []));
echo "✓ {$p['manifest']['name']} {$p['manifest']['version']} ({$p['id']}): " . count($p['blocks']) . ' block(s), ' . $tests . ' test(s), ' . count($p['assets']) . ' image(s), '
    . ($p['css'] !== null ? strlen($p['css']) . ' bytes of CSS' : 'no CSS') . ", hostile-value fuzz clean\n";
foreach ($p['blocks'] as $b) echo '  · ' . cc_pkg_type($p['id'], $b['name']) . ' (' . $b['catalog']['label'] . ")\n";
if ($cmd === 'check') exit(0);

if (!is_dir($src)) { fwrite(STDERR, "pack needs a folder.\n"); exit(2); }
$out = $argv[3] ?? (getcwd() . '/' . $p['id'] . '-' . $p['manifest']['version'] . '.zip');
@unlink($out);
$zip = new ZipArchive();
if ($zip->open($out, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) { fwrite(STDERR, "Cannot write $out.\n"); exit(1); }
$root = rtrim(realpath($src), '/');
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
$files = [];
foreach ($it as $f) if ($f->isFile() && !$f->isLink() && $f->getFilename()[0] !== '.') $files[] = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
sort($files);
foreach ($files as $rel) $zip->addFile("$root/$rel", $rel);
$zip->close();
// the same read an install makes
$again = cc_pkg_read($out);
if ($again['errors']) { fwrite(STDERR, "The ZIP would not install: " . $again['errors'][0] . "\n"); exit(1); }
echo "→ $out (" . round(filesize($out) / 1024, 1) . " KB, " . count($files) . " files)\n";
