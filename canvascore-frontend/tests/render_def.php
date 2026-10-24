<?php
// Renders ad-hoc block definitions (JSON list of {def, block} on stdin) with the PHP engine: a parse error gives "ERROR".
require __DIR__ . '/../../canvascore-admin/compiler.php';
$out = [];
foreach (json_decode(stream_get_contents(STDIN), true) as $t) {
    try { $def = $t['def']; $def['_ast'] = cc_tpl_parse($def['template'] ?? ''); $out[] = cc_render_def_block($def, $t['block'], 'b1'); }
    catch (Throwable $e) { $out[] = 'ERROR'; }
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
