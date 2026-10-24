<?php
// Renders a list of blocks (JSON list on stdin) through the real compiler, in one process: prints a JSON list of the
// HTML, or "PHP ERROR: …" for a block that throws (tests/parity.mjs).
require __DIR__ . '/../../canvascore-admin/compiler.php';
$out = [];
foreach (json_decode(stream_get_contents(STDIN), true) as $block) {
    try { $out[] = render_block($block); } catch (Throwable $e) { $out[] = 'PHP ERROR: ' . $e->getMessage(); }
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
