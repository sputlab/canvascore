<?php
// scripts/library-kit.php: the developer's tool for template library kits (canvascore-admin/library.php).
//   php scripts/library-kit.php check <folder or .zip>      the checks an install makes: layout, kit.json, content.json, block types, images
//   php scripts/library-kit.php pack <folder> [out.zip]     checks, then makes the ZIP (kit.json, content.json, preview, assets, README, LICENSE only)
// Exit code 0 when the kit is fine. The version check (minVersion) uses this checkout's version, or CC_LIB_APP_VERSION.
if (PHP_SAPI !== 'cli') exit(1);
if (getenv('CC_LIB_APP_VERSION')) $GLOBALS['CC_LIB_APP_VERSION'] = getenv('CC_LIB_APP_VERSION');
require __DIR__ . '/../../canvascore-admin/compiler.php';
require __DIR__ . '/../../canvascore-admin/library.php';

$cmd = $argv[1] ?? ''; $src = $argv[2] ?? '';
if (!in_array($cmd, ['check', 'pack'], true) || $src === '' || !file_exists($src)) {
    fwrite(STDERR, "Usage: php scripts/library-kit.php check <folder|zip>\n       php scripts/library-kit.php pack <folder> [out.zip]\n");
    exit(2);
}
$k = cc_lib_read($src);
if ($k['errors']) {
    fwrite(STDERR, "\nNot valid (" . count($k['errors']) . "):\n");
    foreach ($k['errors'] as $e) fwrite(STDERR, "  ✗ $e\n");
    exit(1);
}
echo "✓ {$k['manifest']['name']} {$k['manifest']['version']} ({$k['id']}, {$k['type']}): " . ($k['type'] === 'section' ? count($k['content']['sections']) . ' section(s)' : $k['pages'] . ' page(s)')
    . ', ' . count($k['assets']) . ' image(s)' . ($k['preview'] ? ', a preview' : ', no preview') . "\n";
if ($cmd === 'check') exit(0);

if (!is_dir($src)) { fwrite(STDERR, "pack needs a folder.\n"); exit(2); }
$out = $argv[3] ?? (getcwd() . '/' . $k['id'] . '-' . $k['manifest']['version'] . '.zip');
@unlink($out);
$zip = new ZipArchive();
if ($zip->open($out, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) { fwrite(STDERR, "Cannot write $out.\n"); exit(1); }
$root = rtrim(realpath($src), '/');
$files = [];
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)) as $f) if ($f->isFile() && !$f->isLink() && $f->getFilename()[0] !== '.') $files[] = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
sort($files);
foreach ($files as $rel) $zip->addFile("$root/$rel", $rel);
$zip->close();
$again = cc_lib_read($out);
if ($again['errors']) { fwrite(STDERR, "The ZIP would not install: " . $again['errors'][0] . "\n"); exit(1); }
echo "→ $out (" . round(filesize($out) / 1024, 1) . " KB, " . count($files) . " files)\n";
