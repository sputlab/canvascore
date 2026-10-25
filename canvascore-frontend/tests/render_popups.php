<?php
// tests/render_popups.php: reads {"popups": [{id, name, blocks, settings}], "ctx": {...}} on stdin and prints what a published page gets for its popups
// (cc_popups_html of the real compiler and popups.php): the test of the runtime (tests/popups.mjs) runs that output in jsdom.
require __DIR__ . '/../../canvascore-admin/compiler.php';
require __DIR__ . '/../../canvascore-admin/popups.php';
$in = json_decode(stream_get_contents(STDIN), true);
$popups = [];
foreach ($in['popups'] as $p) $popups[] = ['id' => $p['id'], 'name' => $p['name'] ?? '', 'blocks' => $p['blocks'], 'settings' => cc_popup_settings_clean($p['settings'] ?? [])];
echo cc_popups_html($popups, $in['ctx'] ?? ['kind' => 'page', 'id' => 'p1']);
