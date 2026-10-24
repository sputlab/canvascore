<?php
// scripts/release-keygen.php — makes the Ed25519 key pair that signs the update packages (one-click updates).
//   php scripts/release-keygen.php <secret-key-file>
// The secret key is written to <secret-key-file> (mode 600): keep it OUTSIDE the repository and back it up; whoever
// has it can sign updates that every CanvasCore site installs. The public key is printed: it goes into
// canvascore-admin/update-keys.php (keep the old key there too while sites still run releases that trust only it).
if (PHP_SAPI !== 'cli') exit(1);
$file = $argv[1] ?? '';
if ($file === '') { fwrite(STDERR, "Usage: php scripts/release-keygen.php <secret-key-file>\n"); exit(1); }
if (file_exists($file)) { fwrite(STDERR, "$file already exists: not overwritten.\n"); exit(1); }
$repo = realpath(__DIR__ . '/../..');
$dir = realpath(dirname($file));
if ($dir === false) { fwrite(STDERR, "The folder of $file does not exist.\n"); exit(1); }
if ($repo && strpos($dir . '/', $repo . '/') === 0) { fwrite(STDERR, "Refused: the secret key must not be stored inside the repository.\n"); exit(1); }
$pair = sodium_crypto_sign_keypair();
$old = umask(0077);
file_put_contents($file, base64_encode(sodium_crypto_sign_secretkey($pair)) . "\n");
umask($old);
chmod($file, 0600);
echo "Secret key written to $file (back it up, never commit it).\n";
echo "Public key (add it to canvascore-admin/update-keys.php):\n" . base64_encode(sodium_crypto_sign_publickey($pair)) . "\n";
