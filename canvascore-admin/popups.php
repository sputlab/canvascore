<?php
// canvascore-admin/popups.php
// Popups: blocks shown over the site when a trigger fires, with the rules that decide where, to whom and how often. A popup is built in the
// page editor like a page (its blocks) and has settings: how it looks, what makes it appear (time, scroll, exit intent, a click on a link to it)
// and the display rules. Published popups are written into the pages they apply to at publish time:
//   where (pages, collections)   decided here, when the site is published (a popup is simply absent from the other pages);
//   devices, visitor, schedule, frequency, the triggers   decided in the visitor's browser by popups.js (canvascore-admin/popups.js).
// Only the popups that apply to a page add anything to it (a style sheet, the popup, a JSON list and the runtime). Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';

const CC_POP_MAX = 30;
const CC_POP_POSITIONS = ['center', 'bottom-right', 'bottom-left', 'top-bar', 'bottom-bar'];
const CC_POP_ANIMS = ['fade', 'slide', 'zoom', 'none'];
const CC_POP_FREQ = ['always', 'session', 'days', 'once'];

function cc_popup_id($raw) { return is_string($raw) && preg_match('/^pop_[a-f0-9]{8,16}$/', $raw) ? $raw : ''; }
function cc_popup_new_id() { return 'pop_' . bin2hex(random_bytes(5)); }
function cc_popup_int($v, $min, $max, $default) { return is_numeric($v) ? max($min, min($max, (int)round((float)$v))) : $default; }
function cc_popup_date($v) { $v = trim((string)$v); return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $v : ''; }
function cc_popup_ids($v, $max) {
    $out = [];
    foreach (is_array($v) ? $v : [] as $x) if (is_string($x) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $x) && !in_array($x, $out, true) && count($out) < $max) $out[] = $x;
    return $out;
}
function cc_popup_defaults() {
    return [
        'look' => ['position' => 'center', 'width' => 520, 'animation' => 'fade', 'overlay' => true, 'overlayColor' => '#0f172a', 'overlayOpacity' => 60, 'background' => '#ffffff',
                   'radius' => 16, 'padding' => 28, 'closeButton' => true, 'closeOverlay' => true, 'closeEsc' => true],
        'triggers' => ['time' => ['on' => true, 'seconds' => 5], 'scroll' => ['on' => false, 'percent' => 50], 'exit' => ['on' => false], 'click' => true],
        'rules' => ['where' => ['mode' => 'all', 'pages' => [], 'collections' => []], 'devices' => ['desktop' => true, 'tablet' => true, 'mobile' => true], 'visitor' => 'all',
                    'frequency' => ['mode' => 'days', 'days' => 7], 'schedule' => ['from' => '', 'to' => ''], 'language' => '', 'priority' => 10],
    ];
}
// What a save keeps of the settings: every value is checked, anything else is dropped
function cc_popup_settings_clean($in) {
    $d = cc_popup_defaults();
    $in = is_array($in) ? $in : [];
    $l = is_array($in['look'] ?? null) ? $in['look'] : []; $t = is_array($in['triggers'] ?? null) ? $in['triggers'] : []; $r = is_array($in['rules'] ?? null) ? $in['rules'] : [];
    $flag = function ($a, $k, $def) { return array_key_exists($k, $a) ? !empty($a[$k]) : $def; };
    $oc = cc_palette_hex($l['overlayColor'] ?? '');
    $look = [
        'position' => in_array($l['position'] ?? '', CC_POP_POSITIONS, true) ? $l['position'] : $d['look']['position'],
        'width' => cc_popup_int($l['width'] ?? null, 280, 1100, $d['look']['width']),
        'animation' => in_array($l['animation'] ?? '', CC_POP_ANIMS, true) ? $l['animation'] : $d['look']['animation'],
        'overlay' => $flag($l, 'overlay', true),
        'overlayColor' => $oc !== null && strlen($oc) === 7 ? $oc : $d['look']['overlayColor'],
        'overlayOpacity' => cc_popup_int($l['overlayOpacity'] ?? null, 0, 90, $d['look']['overlayOpacity']),
        'background' => cc_css_color($l['background'] ?? '', $d['look']['background']),
        'radius' => cc_popup_int($l['radius'] ?? null, 0, 40, $d['look']['radius']),
        'padding' => cc_popup_int($l['padding'] ?? null, 0, 80, $d['look']['padding']),
        'closeButton' => $flag($l, 'closeButton', true), 'closeOverlay' => $flag($l, 'closeOverlay', true), 'closeEsc' => $flag($l, 'closeEsc', true),
    ];
    $tm = is_array($t['time'] ?? null) ? $t['time'] : []; $sc = is_array($t['scroll'] ?? null) ? $t['scroll'] : []; $ex = is_array($t['exit'] ?? null) ? $t['exit'] : [];
    $triggers = [
        'time' => ['on' => $flag($tm, 'on', true), 'seconds' => cc_popup_int($tm['seconds'] ?? null, 0, 600, 5)],
        'scroll' => ['on' => $flag($sc, 'on', false), 'percent' => cc_popup_int($sc['percent'] ?? null, 5, 100, 50)],
        'exit' => ['on' => $flag($ex, 'on', false)],
        'click' => !array_key_exists('click', $t) || !empty($t['click']),
    ];
    $w = is_array($r['where'] ?? null) ? $r['where'] : []; $dv = is_array($r['devices'] ?? null) ? $r['devices'] : []; $fq = is_array($r['frequency'] ?? null) ? $r['frequency'] : []; $sd = is_array($r['schedule'] ?? null) ? $r['schedule'] : [];
    $rules = [
        'where' => ['mode' => in_array($w['mode'] ?? '', ['all', 'include', 'exclude'], true) ? $w['mode'] : 'all', 'pages' => cc_popup_ids($w['pages'] ?? [], 100), 'collections' => cc_popup_ids($w['collections'] ?? [], 50)],
        'devices' => ['desktop' => $flag($dv, 'desktop', true), 'tablet' => $flag($dv, 'tablet', true), 'mobile' => $flag($dv, 'mobile', true)],
        'visitor' => in_array($r['visitor'] ?? '', ['all', 'new', 'returning'], true) ? $r['visitor'] : 'all',
        'frequency' => ['mode' => in_array($fq['mode'] ?? '', CC_POP_FREQ, true) ? $fq['mode'] : 'days', 'days' => cc_popup_int($fq['days'] ?? null, 1, 365, 7)],
        'schedule' => ['from' => cc_popup_date($sd['from'] ?? ''), 'to' => cc_popup_date($sd['to'] ?? '')],
        // the language of the pages it appears on ('' = every language; see languages.php)
        'language' => function_exists('cc_lang_code') ? cc_lang_code($r['language'] ?? '') : '',
        'priority' => cc_popup_int($r['priority'] ?? null, 1, 99, 10),
    ];
    if ($rules['schedule']['from'] !== '' && $rules['schedule']['to'] !== '' && $rules['schedule']['to'] < $rules['schedule']['from']) $rules['schedule']['to'] = $rules['schedule']['from'];
    return ['look' => $look, 'triggers' => $triggers, 'rules' => $rules];
}
function cc_popup_row_settings($row) { return cc_popup_settings_clean(json_decode((string)($row['settings_json'] ?? '{}'), true)); }

// Does the popup show on this page? $ctx: kind (page | item | archive | 404), id (the page), collection (the item's or the archive's collection)
function cc_popup_applies($settings, array $ctx) {
    $kind = $ctx['kind'] ?? '';
    if (!in_array($kind, ['page', 'item', 'archive'], true)) return false;      // not on the "not found" page
    // A popup written for one language appears on the pages of that language only (a site that is not multilingual has no language: no limit)
    $pl = (string)($settings['rules']['language'] ?? '');
    if ($pl !== '' && (string)($ctx['lang'] ?? '') !== '' && $ctx['lang'] !== $pl) return false;
    $w = $settings['rules']['where'];
    if ($w['mode'] === 'all') return true;
    $hit = ($kind === 'page' && in_array((string)($ctx['id'] ?? ''), $w['pages'], true))
        || ($kind !== 'page' && (string)($ctx['collection'] ?? '') !== '' && in_array((string)$ctx['collection'], $w['collections'], true));
    return $w['mode'] === 'include' ? $hit : !$hit;
}
function cc_popups_published($pdo) {
    try { $rows = $pdo->query("SELECT * FROM popups WHERE status = 'published' ORDER BY created_at, id LIMIT " . (int)CC_POP_MAX)->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $e) { return []; }
    $out = [];
    foreach ($rows as $r) {
        $blocks = json_decode((string)$r['content_json'], true);
        if (!is_array($blocks) || !$blocks) continue;
        $out[] = ['id' => $r['id'], 'name' => (string)$r['name'], 'blocks' => $blocks, 'settings' => cc_popup_row_settings($r)];
    }
    return $out;
}
function cc_popup_overlay_rgba($hex, $opacity) {
    $h = ltrim($hex, '#');
    return 'rgba(' . hexdec(substr($h, 0, 2)) . ',' . hexdec(substr($h, 2, 2)) . ',' . hexdec(substr($h, 4, 2)) . ',' . round($opacity / 100, 2) . ')';
}
// The popup's element (hidden until the runtime shows it). Its blocks are rendered once and kept for the other pages.
function cc_popup_element(array $p) {
    static $cache = [];
    if (isset($cache[$p['id']])) return $cache[$p['id']];
    $s = $p['settings']['look'];
    $inner = '';
    foreach ($p['blocks'] as $b) $inner .= render_block($b);
    $center = $s['position'] === 'center';
    $style = '--cc-pop-w:' . (int)$s['width'] . 'px;--cc-pop-bg:' . $s['background'] . ';--cc-pop-radius:' . (int)$s['radius'] . 'px;--cc-pop-pad:' . (int)$s['padding'] . 'px;--cc-pop-ov:' . cc_popup_overlay_rgba($s['overlayColor'], $s['overlayOpacity']) . ';';
    $html = '<div class="cc-popup cc-popup--' . $s['position'] . ' cc-popup--' . $s['animation'] . '" id="cc-popup-' . $p['id'] . '" data-cc-popup="' . $p['id'] . '" role="dialog" aria-modal="' . ($center ? 'true' : 'false') . '" aria-label="' . htmlspecialchars($p['name'] !== '' ? $p['name'] : 'Popup', ENT_QUOTES) . '" hidden style="' . htmlspecialchars($style, ENT_QUOTES) . '">'
        . ($center && $s['overlay'] ? '<div class="cc-popup__overlay"' . ($s['closeOverlay'] ? ' data-cc-popup-close' : '') . '></div>' : '')
        . '<div class="cc-popup__box" tabindex="-1">'
        . ($s['closeButton'] ? '<button type="button" class="cc-popup__close" aria-label="Close" data-cc-popup-close>&times;</button>' : '')
        . '<div class="cc-popup__content">' . $inner . '</div></div></div>';
    return $cache[$p['id']] = $html;
}
function cc_popup_runtime_config(array $p) {
    $s = $p['settings'];
    return ['id' => $p['id'], 'pos' => $s['look']['position'], 'anim' => $s['look']['animation'], 'esc' => $s['look']['closeEsc'], 'prio' => $s['rules']['priority'],
            'triggers' => ['time' => $s['triggers']['time'], 'scroll' => $s['triggers']['scroll'], 'exit' => $s['triggers']['exit'], 'click' => $s['triggers']['click']],
            'devices' => $s['rules']['devices'], 'visitor' => $s['rules']['visitor'], 'freq' => $s['rules']['frequency'], 'schedule' => $s['rules']['schedule']];
}
// Everything a page needs for its popups (before </body>), or '' when none applies
function cc_popups_html(array $popups, array $ctx) {
    static $css = null, $js = null;
    $mine = array_values(array_filter($popups, function ($p) use ($ctx) { return cc_popup_applies($p['settings'], $ctx); }));
    if (!$mine) return '';
    if ($css === null) { $css = (string)@file_get_contents(__DIR__ . '/popups.css'); $js = (string)@file_get_contents(__DIR__ . '/popups.js'); }
    $cfg = array_map('cc_popup_runtime_config', $mine);
    $json = json_encode($cfg, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
    $out = "\n<style id=\"cc-popups-css\">" . $css . "</style>\n";
    foreach ($mine as $p) $out .= cc_popup_element($p) . "\n";
    return $out . '<script type="application/json" id="cc-popups-data">' . $json . "</script>\n<script>" . str_replace('</script', '<\/script', $js) . "</script>\n";
}
