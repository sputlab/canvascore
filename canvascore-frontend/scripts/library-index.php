<?php
// scripts/library-index.php: makes the signed index of the template library (the maintainers' step; see library.php).
//   php scripts/library-index.php --key=<secret-key-file> --kits=<folder of kit .zip files> --base-url=<where the files will be served> [--out=<folder>]
// Reads every kit (checking it like an install), writes <out>/index.json and <out>/index.json.sig (Ed25519, the same key as the releases),
// and copies each kit's preview next to the ZIPs as <id>-preview.<ext>. Publish the folder at <base-url> (the library repository).
if (PHP_SAPI !== 'cli') exit(1);
$opt = getopt('', ['key:', 'kits:', 'base-url:', 'out:']);
$fail = function ($m) { fwrite(STDERR, $m . "\n"); exit(1); };
if (empty($opt['key']) || empty($opt['kits']) || empty($opt['base-url']) || !is_file($opt['key']) || !is_dir($opt['kits'])) $fail('Usage: php scripts/library-index.php --key=<secret-key-file> --kits=<folder of .zip kits> --base-url=<https://…/> [--out=<folder>]');
$sk = base64_decode(trim((string)file_get_contents($opt['key'])), true);
if ($sk === false || strlen($sk) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) $fail('Not a secret key made by release-keygen.php.');
if (getenv('CC_LIB_APP_VERSION')) $GLOBALS['CC_LIB_APP_VERSION'] = getenv('CC_LIB_APP_VERSION');   // check kits against another CanvasCore version
require __DIR__ . '/../../canvascore-admin/compiler.php';
require __DIR__ . '/../../canvascore-admin/library.php';
if (!in_array(sodium_crypto_sign_publickey_from_secretkey($sk), cc_update_keys(), true)) $fail('This key is not listed in canvascore-admin/update-keys.php: sites would refuse the index.');
$base = rtrim($opt['base-url'], '/') . '/';
$out = rtrim($opt['out'] ?? $opt['kits'], '/');
if (!is_dir($out)) mkdir($out, 0755, true);
$kits = [];
foreach (glob($opt['kits'] . '/*.zip') ?: [] as $zipFile) {
    $k = cc_lib_read($zipFile);
    if ($k['errors']) $fail(basename($zipFile) . ' is not a valid kit: ' . $k['errors'][0]);
    $m = $k['manifest'];
    $e = ['id' => $k['id'], 'name' => $m['name'], 'type' => $k['type'], 'version' => $m['version'], 'author' => $m['author'] ?? '', 'description' => $m['description'] ?? '', 'license' => $m['license'] ?? '',
          'tags' => $m['tags'] ?? [], 'pages' => $k['pages'], 'size' => filesize($zipFile), 'sha256' => hash_file('sha256', $zipFile), 'url' => $base . basename($zipFile)];
    if (!empty($m['minVersion'])) $e['minVersion'] = $m['minVersion'];
    if ($k['preview']) { $pf = $k['id'] . '-preview.' . $k['preview'][1]; file_put_contents("$out/$pf", $k['preview'][0]); $e['preview'] = $base . $pf; }
    if (isset($kits[$k['id']])) $fail('The id ' . $k['id'] . ' is used by two kits.');
    $kits[$k['id']] = $e;
}
if (!$kits) $fail('No kit found in ' . $opt['kits']);
ksort($kits);
$bytes = json_encode(['version' => 1, 'updated' => gmdate('c'), 'kits' => array_values($kits)], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
file_put_contents("$out/index.json", $bytes);
$sig = base64_encode(sodium_crypto_sign_detached(cc_lib_signed_message($bytes), $sk));
file_put_contents("$out/index.json.sig", $sig . "\n");
if (!cc_lib_verify($bytes, $sig, cc_update_keys())) $fail('The signature does not verify.');
echo count($kits) . " kit(s): $out/index.json and index.json.sig (signed)\n";
