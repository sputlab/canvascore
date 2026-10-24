<?php
// canvascore-admin/update-keys.php
// The public keys (Ed25519, base64) of the CanvasCore releases: one-click updates install a package only when one of
// these keys signed it. Made with canvascore-frontend/scripts/release-keygen.php; the secret key is never in the repository.
// Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
return [
    'hz6KVARQjIFWA2rr8Lzp5oDx4HTKwMUYNfKD/Y+bC9A=',
];
