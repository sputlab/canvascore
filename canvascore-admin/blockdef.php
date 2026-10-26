<?php
// canvascore-admin/blockdef.php
// Shared block definitions, server side: the twin of canvascore-frontend/src/render/blockDef.mjs (the format and the
// template language are described there). A block with a file in blocks/ is rendered from it by both engines.
// Library file: included by compiler.php.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

// PHP 8.0 (array_is_list() came in 8.1)
if (!function_exists('array_is_list')) {
    function array_is_list(array $a) { $i = 0; foreach ($a as $k => $_) { if ($k !== $i++) return false; } return true; }
}

// Trusted HTML: printed raw by {{{name}}} (sanitized rich text, definition data, the engine's own values)
final class CcTrusted { public $h; function __construct($h) { $this->h = (string)$h; } }

// Every definition in blocks/, by type. A file that can't be read or parsed is left out (and logged).
function cc_block_defs($reset = false) {
    static $defs = null;
    if ($reset) $defs = null;
    if ($defs !== null) return $defs;
    $defs = [];
    foreach (glob(__DIR__ . '/blocks/*.json') ?: [] as $f) {
        $d = json_decode((string)file_get_contents($f), true);
        if (!is_array($d) || !is_string($d['type'] ?? null)) { error_log('CanvasCore: block definition not readable: ' . basename($f)); continue; }
        try { $d['_ast'] = cc_tpl_parse($d['template'] ?? ''); }
        catch (Throwable $e) { error_log('CanvasCore: block definition ' . basename($f) . ': ' . $e->getMessage()); continue; }
        $defs[$d['type']] = $d;
    }
    // the blocks of the installed block packages (blockpkg.php); a core block is never replaced
    if (function_exists('cc_pkg_defs')) { try { $defs += cc_pkg_defs(); } catch (Throwable $e) { error_log('CanvasCore block packages: ' . $e->getMessage()); } }
    return $defs;
}
function cc_block_def($type) { $d = cc_block_defs(); return is_string($type) && isset($d[$type]) ? $d[$type] : null; }

// ---------------------------------------------------------------------------------------------- values
function cc_tpl_is_obj($v) { return is_array($v) && ($v === [] || !array_is_list($v)); }
function cc_tpl_str($v) { return is_scalar($v) ? (string)$v : ''; }
function cc_tpl_round($n, $dec) { $m = 10 ** $dec; $r = floor(abs($n) * $m + 0.5 + 1e-9) / $m; return $n < 0 ? -$r : $r; }
// A number as text: no exponent, no trailing zeros (the same as numText() in blockDef.mjs)
function cc_tpl_num_text($n) {
    if (is_int($n)) return (string)$n;
    if (floor($n) == $n && abs($n) < 9.0e15) return (string)(int)$n;
    $s = rtrim(rtrim(number_format($n, 10, '.', ''), '0'), '.');
    return $s === '' || $s === '-0' ? '0' : $s;
}
function cc_tpl_truthy($v) {
    if ($v instanceof CcTrusted) return $v->h !== '';
    if (is_array($v)) return $v !== [] || false;
    return !empty($v);
}
function cc_tpl_text($v) {
    if ($v instanceof CcTrusted) return $v->h;
    if (is_int($v) || is_float($v)) return cc_tpl_num_text($v);
    return cc_tpl_str($v);
}

// ---------------------------------------------------------------------------------------------- cleaning
function cc_tpl_clean_value(array $s, $raw, $missing) {
    $type = $s['type'] ?? '';
    $def = $s['default'] ?? null;
    switch ($type) {
        case 'text':
            $v = ($missing || (!empty($s['stringsOnly']) && !is_string($raw))) ? cc_tpl_str($def ?? '') : cc_tpl_str($raw);
            if (!empty($s['trim'])) $v = trim($v);
            if (!empty($s['fallbackWhenEmpty']) && $v === '') $v = cc_tpl_str($def ?? '');
            if (!empty($s['fallbackWhenBlank']) && trim($v) === '') $v = cc_tpl_str($def ?? '');
            if (!empty($s['pattern']) && !preg_match('~' . str_replace('~', '\\~', $s['pattern']) . '~u', $v)) $v = cc_tpl_str($def ?? '');
            if (!empty($s['maxLength'])) $v = mb_substr($v, 0, (int)$s['maxLength']);
            return $v;
        case 'richtext':
            return new CcTrusted(cc_sanitize_html($missing ? cc_tpl_str($def ?? '') : cc_tpl_str($raw)));
        case 'number':
            $d = $def ?? 0;
            if (($s['parse'] ?? '') === 'int') return $missing ? $d : cc_int($raw, $d, $s['min'] ?? PHP_INT_MIN, $s['max'] ?? PHP_INT_MAX);
            $n = (!$missing && is_numeric($raw)) ? max($s['min'] ?? -INF, min($s['max'] ?? INF, (float)$raw)) : $d;
            if (!empty($s['int'])) $n = (int)$n;
            elseif (isset($s['round'])) $n = cc_tpl_round((float)$n, (int)$s['round']);
            return $n;
        case 'bool':
            if (!empty($s['phpTruthy'])) return $missing ? (bool)($def ?? false) : !empty($raw);
            if (!empty($s['strict'])) return !$missing && $raw === true;
            return ($def === true) ? ($missing || $raw !== false) : !$missing && !empty($raw);
        case 'enum':
            $v = cc_tpl_str($raw);
            foreach ($s['options'] ?? [] as $o) if (!$missing && ($o['value'] ?? null) === $v) return $v;
            return cc_tpl_str($def ?? '');
        case 'color':
            return cc_color(cc_tpl_str($raw), $def ?? '');
        case 'image':
            return cc_img_url($missing ? ($def ?? '') : cc_tpl_str($raw));
        case 'code':
            return new CcTrusted($missing ? cc_tpl_str($def ?? '') : cc_tpl_str($raw));
        case 'list':
            $items = (is_array($raw) && array_is_list($raw)) ? $raw : [];
            if (!empty($s['skipNonObjects'])) $items = array_values(array_filter($items, 'is_array'));
            $out = [];
            if (isset($s['of'])) {   // a list of values: cleaned, then skipEmpty, unique, max
                $seen = [];
                foreach ($items as $it) {
                    $v = cc_tpl_clean_value($s['of'], $it, $it === null);
                    if (!empty($s['skipEmpty']) && trim(cc_tpl_text($v)) === '') continue;
                    if (!empty($s['unique'])) { $t = cc_tpl_text($v); if (isset($seen[$t])) continue; $seen[$t] = true; }
                    $out[] = $v;
                }
                return !empty($s['max']) ? array_slice($out, 0, (int)$s['max']) : $out;
            }
            if (!empty($s['max'])) $items = array_slice($items, 0, (int)$s['max']);
            foreach ($items as $i => $it) {
                $src = cc_tpl_is_obj($it) ? $it : [];
                foreach (($s['defaultsByIndex'] ?? []) as $dk => $dl) if (!isset($src[$dk])) $src[$dk] = $dl[$i] ?? '';
                $out[] = cc_tpl_clean_settings($s['item'] ?? [], $src, []);
            }
            if (!empty($s['keepIf'])) $out = array_values(array_filter($out, function ($it) use ($s) { return cc_tpl_cond($s['keepIf'], $it, false); }));
            if (!empty($s['share'])) {   // each item's share of the list's total, in % (0 when the total is 0)
                $of = $s['share']['of']; $num = function ($v) { return (is_int($v) || is_float($v)) ? $v : 0; };
                $sum = 0; foreach ($out as $it) $sum += $num($it[$of] ?? 0);
                foreach ($out as $i => $it) {
                    $pct = $sum > 0 ? $num($it[$of] ?? 0) / $sum * 100 : 0;
                    $out[$i][$s['share']['as']] = $pct;
                    foreach (($s['share']['format'] ?? []) as $k => $dec) $out[$i][$k] = cc_fmt_num($pct, $dec);
                }
            }
            return $out;
        case 'object':
            return cc_tpl_clean_settings($s['item'] ?? [], cc_tpl_is_obj($raw) ? $raw : [], []);
        case 'choices':
            $picked = is_array($raw) ? array_values(array_filter($raw, 'is_string')) : [];
            $out = [];
            foreach ($s['options'] ?? [] as $o) {
                if (!in_array($o['value'] ?? null, $picked, true)) continue;
                $it = ['value' => $o['value']];
                foreach (($o['data'] ?? []) as $dk => $dv) $it[$dk] = new CcTrusted($dv);
                $out[] = $it;
            }
            return $out;
        case 'calc':
        case 'flag':
            return 0;
    }
    return '';
}
function cc_tpl_clean_settings(array $settings, array $content, array $styles) {
    $out = []; $opt = [];
    foreach ($settings as $key => $s) {
        $src = (($s['from'] ?? '') === 'styles') ? $styles : $content;
        $k = $s['key'] ?? $key;
        $missing = !array_key_exists($k, $src) || $src[$k] === null;
        $out[$key] = cc_tpl_clean_value($s, $missing ? null : $src[$k], $missing);
        if (!empty($s['presentAs'])) $out[$s['presentAs']] = !$missing && is_array($src[$k]);   // whether the content has the list at all
        if (($s['type'] ?? '') === 'enum') {
            $data = [];
            foreach ($s['options'] ?? [] as $o) if (($o['value'] ?? null) === $out[$key]) foreach (($o['data'] ?? []) as $dk => $dv) $data[$dk] = new CcTrusted($dv);
            $opt[$key] = $data;
        }
        if (($s['type'] ?? '') === 'list' && !empty($s['count'])) $out[$s['count']['as']] = max($s['count']['min'] ?? 0, min($s['count']['max'] ?? PHP_INT_MAX, count($out[$key])));
    }
    if ($opt) $out['opt'] = $opt;
    // second pass: values computed from the clean ones
    foreach ($settings as $key => $s) {
        if (($s['type'] ?? '') === 'calc') { $b = (!empty($s['fallback']) && !cc_tpl_truthy($out[$s['of']] ?? null)) ? ($out[$s['fallback']] ?? 0) : ($out[$s['of']] ?? 0); $out[$key] = max($s['min'] ?? -INF, min($s['max'] ?? INF, ((is_int($b) || is_float($b)) ? $b : 0) / ($s['div'] ?? 1) * ($s['mul'] ?? 1) + ($s['add'] ?? 0))); }
        if (($s['type'] ?? '') === 'flag') $out[$key] = cc_tpl_cond($s['when'] ?? [], $out, !empty($s['any']));
        foreach ((array)($s['transform'] ?? []) as $tf) if (is_string($tf) && isset(CC_TPL_TRANSFORMS[$tf])) $out[$key] = (CC_TPL_TRANSFORMS[$tf])($out[$key], $s, $out);   // one transform or a chain
    }
    return $out;
}

// A flag's conditions (twin of condHolds() in blockDef.mjs)
function cc_tpl_cond(array $when, array $vals, $any) {
    $hits = 0;
    foreach ($when as $k => $want) {
        $v = $vals;
        foreach (explode('.', $k) as $part) $v = (is_array($v) && array_key_exists($part, $v)) ? $v[$part] : null;   // a dotted name reaches into objects
        if ($want === true || $want === false) $ok = cc_tpl_truthy($v) === $want;
        elseif (is_array($want) && array_is_list($want)) $ok = in_array(cc_tpl_text($v), $want, true);
        elseif (isset($want['gt']) || isset($want['lt'])) { $n = (is_int($v) || is_float($v)) ? $v : 0; $ok = (!isset($want['gt']) || $n > $want['gt']) && (!isset($want['lt']) || $n < $want['lt']); }
        else $ok = !in_array(cc_tpl_text($v), $want['not'] ?? [], true);
        if ($ok) $hits++;
        if ($any && $ok) return true;
        if (!$any && !$ok) return false;
    }
    return $any ? false : true;
}

// Value transforms: twins of TRANSFORMS in blockDef.mjs
const CC_TPL_TRANSFORMS = [
    'blockUrl' => 'cc_tpl_tf_block_url', 'cssUrl' => 'cc_tpl_tf_css_url', 'urlencode' => 'cc_tpl_tf_urlencode',
    'lines2br' => 'cc_tpl_tf_lines2br', 'videoEmbed' => 'cc_tpl_tf_video', 'fmtNum' => 'cc_tpl_tf_fmt_num',
    'extUrl' => 'cc_tpl_tf_ext_url', 'initials' => 'cc_tpl_tf_initials', 'mailto' => 'cc_tpl_tf_mailto',
    'contactUrl' => 'cc_tpl_tf_contact_url', 'br' => 'cc_tpl_tf_br', 'repeat' => 'cc_tpl_tf_repeat',
    'mediaSrc' => 'cc_tpl_tf_media_src', 'replace' => 'cc_tpl_tf_replace',
    'plain' => 'cc_tpl_tf_plain', 'mediaMime' => 'cc_tpl_tf_media_mime', 'json' => 'cc_tpl_tf_json', 'telDigits' => 'cc_tpl_tf_tel',
    'stripScheme' => 'cc_tpl_tf_strip_scheme', 'mapsUrl' => 'cc_tpl_tf_maps', 'code' => 'cc_tpl_tf_code', 'lineNumbers' => 'cc_tpl_tf_line_numbers',
    'tableData' => 'cc_tpl_tf_table', 'buttonPreset' => 'cc_tpl_tf_button_preset', 'buttonHover' => 'cc_tpl_tf_button_hover', 'legacyUrl' => 'cc_tpl_tf_legacy_url',
];
function cc_tpl_tf_button_preset($v) { return new CcTrusted(cc_button_preset_css(cc_tpl_text($v))); }
// unescaped (the template escapes); twin of buttonHover() in effects.mjs
function cc_tpl_tf_button_hover($v, $s, $sib) {
    $g = function ($k) use ($s, $sib) { $n = $s['hover'][$k] ?? null; return $n !== null ? cc_tpl_text($sib[$n] ?? '') : ''; };
    $cls = ''; $vars = '';
    foreach ([['bg', 'cc-hbg', '--cc-hover-bg'], ['color', 'cc-hcol', '--cc-hover-color'], ['border', 'cc-hbd', '--cc-hover-border']] as [$k, $c, $var]) {
        $x = $g($k);
        if (trim($x) !== '') { $cls .= ' ' . $c; $vars .= $var . ':' . $x . '; '; }
    }
    $e = $g('effect');
    if (in_array($e, CC_FX_BUTTON, true)) $cls .= ' cc-bfx-' . $e;
    return ['cls' => $cls, 'vars' => $vars];
}
function cc_tpl_tf_legacy_url($v) {
    $u = cc_tpl_text($v);
    if (preg_match('~^(?:f|ht)tps?://~i', $u) || $u === '#') return $u;
    if (in_array($u, ['index.html', 'index/index.html', 'home/index.html'], true)) return function_exists('cc_lang_home') ? cc_lang_home() : '{{BASE_URL}}';   // the home page of the page's language
    if ($u === '/') return '{{BASE_URL}}';
    return '{{BASE_URL}}' . ltrim(str_replace(['index/index.html', 'index.html'], '', $u), '/');
}
function cc_tpl_tf_plain($v) { return cc_plain((is_int($v) || is_float($v)) ? $v : 0); }
function cc_tpl_tf_media_mime($v) { return cc_media_mime(cc_media_src(cc_tpl_text($v))); }
function cc_tpl_tf_json($v) { return json_encode(is_array($v) ? array_map('cc_tpl_text', $v) : cc_tpl_text($v), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); }
function cc_tpl_tf_tel($v) { return preg_replace('/[^0-9+]/', '', cc_tpl_text($v)); }
function cc_tpl_tf_strip_scheme($v) { return preg_replace('~^https?://~i', '', cc_tpl_text($v)); }
function cc_tpl_tf_maps($v) { return 'https://www.google.com/maps/search/?api=1&query=' . cc_enc(implode(', ', cc_lines(cc_tpl_text($v)))); }
function cc_tpl_norm_code($t) { return mb_substr(rtrim(preg_replace('/\r\n?/', "\n", $t), "\n"), 0, 50000); }
function cc_tpl_tf_code($v) { return cc_tpl_norm_code(cc_tpl_text($v)); }
function cc_tpl_tf_line_numbers($v) { return implode("\n", range(1, substr_count(cc_tpl_norm_code(cc_tpl_text($v)), "\n") + 1)); }
function cc_tpl_tf_table($v, $s, $sib) {
    $rows = [];
    foreach (cc_lines(cc_tpl_text($v)) as $l) $rows[] = preg_split('/\s*\|\s*|\t/', $l);
    $head = (cc_tpl_truthy($sib[$s['headerFrom'] ?? ''] ?? null) && $rows) ? array_shift($rows) : null;
    $n = $head ? count($head) : 0;
    foreach ($rows as $r) $n = max($n, count($r));
    $pad = function ($r) use ($n) { $o = []; for ($i = 0; $i < $n; $i++) $o[] = $r[$i] ?? ''; return $o; };
    $out = [];
    foreach ($rows as $i => $r) $out[] = ['cells' => $pad($r), 'odd' => $i % 2 === 1];
    return ['ncols' => $n, 'head' => $head ? $pad($head) : [], 'rows' => $out];
}
function cc_tpl_tf_media_src($v) { return cc_media_src(cc_tpl_text($v)); }
function cc_tpl_tf_replace($v, $s) { return str_replace((string)($s['from'] ?? ''), (string)($s['to'] ?? ''), cc_tpl_text($v)); }
function cc_tpl_tf_contact_url($v) { $t = cc_tpl_text($v); return preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $t) ? 'mailto:' . $t : cc_ext_url($t); }
function cc_tpl_tf_br($v) { return new CcTrusted(cc_br(cc_tpl_text($v))); }
function cc_tpl_tf_repeat($v, $s) { return new CcTrusted(str_repeat((string)($s['text'] ?? ''), max(0, (int)((is_int($v) || is_float($v)) ? $v : 0)))); }
function cc_tpl_tf_ext_url($v) { return cc_ext_url(cc_tpl_text($v)); }
function cc_tpl_tf_initials($v) { return cc_initials(cc_tpl_text($v)); }
function cc_tpl_tf_mailto($v) { $t = cc_tpl_text($v); return preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $t) ? 'mailto:' . $t : ''; }
function cc_tpl_tf_block_url($v) { return cc_block_url(cc_tpl_text($v)); }
function cc_tpl_tf_css_url($v) { return cc_css_url(cc_tpl_text($v)); }
function cc_tpl_tf_urlencode($v) { return urlencode(cc_tpl_text($v)); }
function cc_tpl_tf_lines2br($v) { return new CcTrusted(nl2br(htmlspecialchars(cc_tpl_text($v)))); }
function cc_tpl_tf_video($v) {
    $u = cc_tpl_text($v);
    if (preg_match('%(?:youtube(?:-nocookie)?\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\.be/)([^"&?/\s]{11})%i', $u, $m)) return 'https://www.youtube.com/embed/' . $m[1];
    return preg_match('/vimeo\.com\/(?:video\/)?([0-9]+)/i', $u, $m) ? 'https://player.vimeo.com/video/' . $m[1] : '';
}
function cc_tpl_tf_fmt_num($v, $s, $sib) { return cc_fmt_num((is_int($v) || is_float($v)) ? $v : 0, isset($s['decimalsFrom']) ? ($sib[$s['decimalsFrom']] ?? 0) : ($s['decimals'] ?? 0)); }

// ---------------------------------------------------------------------------------------------- templates
function cc_tpl_parse($src) {
    $text = is_array($src) ? implode('', $src) : (string)$src;
    $root = []; $stack = [['body' => &$root, 'name' => null]];
    $last = 0;
    preg_match_all('/\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{([#^\/!]?)\s*([^}]*?)\s*\}\}/', $text, $ms, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
    foreach ($ms as $m) {
        $top = count($stack) - 1;
        if ($m[0][1] > $last) $stack[$top]['body'][] = substr($text, $last, $m[0][1] - $last);
        $last = $m[0][1] + strlen($m[0][0]);
        if (isset($m[1]) && $m[1][1] >= 0 && $m[1][0] !== '') {
            if (strpos($m[1][0], '{') === 0) throw new RuntimeException('Template: a literal { before {{{ (write {{{_lb}}}): ' . $m[1][0]);
            $stack[$top]['body'][] = ['v' => $m[1][0], 'raw' => true]; continue;
        }
        $sigil = $m[2][0]; $name = $m[3][0];
        if ($sigil === '!') continue;
        if ($sigil !== '!' && strpos($name, '{') === 0) throw new RuntimeException('Template: a literal { before {{ (write {{{_lb}}}): ' . $name);
        if ($sigil === '#' || $sigil === '^') {
            $node = ['s' => $name, 'inv' => $sigil === '^', 'body' => []];
            if (substr($name, -1) === '?') { $node['kind'] = 'test'; $node['path'] = substr($name, 0, -1); }
            elseif (strpos($name, '=') !== false) { $node['kind'] = 'eq'; $node['path'] = substr($name, 0, strpos($name, '=')); $node['eq'] = substr($name, strpos($name, '=') + 1); }
            else { $node['kind'] = 'each'; $node['path'] = $name; }
            $stack[$top]['body'][] = $node;
            $i = count($stack[$top]['body']) - 1;
            $stack[] = ['body' => &$stack[$top]['body'][$i]['body'], 'name' => $name];
            continue;
        }
        if ($sigil === '/') {
            if ($top < 1 || $stack[$top]['name'] !== $name) throw new RuntimeException('Template: {{/' . $name . '}} closes ' . ($stack[$top]['name'] !== null ? '{{#' . $stack[$top]['name'] . '}}' : 'nothing'));
            array_pop($stack);
            continue;
        }
        if ($name === '') throw new RuntimeException('Template: empty tag');
        $stack[$top]['body'][] = ['v' => $name, 'raw' => false];
    }
    if (count($stack) > 1) throw new RuntimeException('Template: {{#' . $stack[count($stack) - 1]['name'] . '}} is not closed');
    if ($last < strlen($text)) $root[] = substr($text, $last);
    return $root;
}

function cc_tpl_lookup(array $scopes, $path) {
    if ($path === '.') return end($scopes);
    $parts = explode('.', $path);
    $v = null;
    for ($i = count($scopes) - 1; $i >= 0; $i--) if (is_array($scopes[$i]) && array_key_exists($parts[0], $scopes[$i])) { $v = $scopes[$i][$parts[0]]; break; }
    for ($j = 1; $j < count($parts); $j++) $v = (is_array($v) && array_key_exists($parts[$j], $v)) ? $v[$parts[$j]] : null;
    return $v;
}
function cc_tpl_render(array $nodes, array $scopes) {
    $out = '';
    foreach ($nodes as $n) {
        if (is_string($n)) { $out .= $n; continue; }
        if (isset($n['v'])) {
            $v = cc_tpl_lookup($scopes, $n['v']);
            $out .= ($n['raw'] && $v instanceof CcTrusted) ? $v->h : htmlspecialchars(cc_tpl_text($v));
            continue;
        }
        $v = cc_tpl_lookup($scopes, $n['path']);
        if ($n['kind'] === 'eq') { if ((cc_tpl_text($v) === $n['eq']) !== $n['inv']) $out .= cc_tpl_render($n['body'], $scopes); continue; }
        if ($n['inv'] || $n['kind'] === 'test') { if (cc_tpl_truthy($v) !== $n['inv']) $out .= cc_tpl_render($n['body'], $scopes); continue; }
        if (is_array($v) && $v !== [] && array_is_list($v)) {
            $last = count($v) - 1;
            foreach ($v as $i => $it) $out .= cc_tpl_render($n['body'], array_merge($scopes, [['@index' => $i, '@number' => $i + 1, '@first' => $i === 0, '@last' => $i === $last], $it]));
        } elseif (cc_tpl_is_obj($v) && $v !== []) $out .= cc_tpl_render($n['body'], array_merge($scopes, [$v]));
        elseif (!is_array($v) && cc_tpl_truthy($v)) $out .= cc_tpl_render($n['body'], $scopes);
    }
    return $out;
}

// Behaviour scripts of the blocks (site only): the definition's "script" names one
// (each gets the block's id and its clean values, and gives the whole <script> element)
const CC_TPL_SCRIPTS = ['progress' => 'cc_tpl_script_progress', 'counters' => 'cc_tpl_script_counters', 'gallery' => 'cc_tpl_script_gallery', 'logos' => 'cc_tpl_script_logos',
    'slider' => 'cc_tpl_script_slider', 'countdown' => 'cc_tpl_script_countdown', 'beforeafter' => 'cc_tpl_script_beforeafter', 'toc' => 'cc_tpl_script_toc',
    'share' => 'cc_tpl_script_share', 'audio' => 'cc_tpl_script_audio', 'story' => 'cc_tpl_script_story', 'hotspots' => 'cc_tpl_script_hotspots',
    'video' => 'cc_tpl_script_video', 'code' => 'cc_tpl_script_code', 'search' => 'cc_tpl_script_search', 'business' => 'cc_tpl_script_business'];
function cc_tpl_script_progress($id, $v) { return "<script>\n" . cc_script_progress($id) . "\n</script>\n"; }
function cc_tpl_script_counters($id, $v) { return "<script>\n" . cc_script_counters($id, $v['duration'] ?? 1800) . "\n</script>\n"; }
function cc_tpl_script_gallery($id, $v) { return "<script>\n" . cc_script_gallery($id) . "\n</script>\n"; }
function cc_tpl_script_slider($id, $v) { return cc_script_slider($id, !empty($v['autoplay']) ? 'true' : 'false', ($v['effect'] ?? '') === 'fade' ? 'true' : 'false', max(500, (int)($v['delay'] ?? 3000))); }
function cc_tpl_script_countdown($id, $v) { return "<script>\n" . cc_script_countdown($id) . "\n</script>\n"; }
function cc_tpl_script_beforeafter($id, $v) { return "<script>\n" . cc_script_beforeafter($id) . "\n</script>\n"; }
function cc_tpl_script_toc($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_TOC_SCRIPT) . "</script>\n"; }
function cc_tpl_script_share($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_SHARE_SCRIPT) . "</script>\n"; }
function cc_tpl_script_audio($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_AUDIO_SCRIPT) . "</script>\n"; }
function cc_tpl_script_story($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_STORY_SCRIPT) . "</script>\n"; }
function cc_tpl_script_hotspots($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_HOTSPOTS_SCRIPT) . "</script>\n"; }
function cc_tpl_script_video($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_VIDEO_SCRIPT) . "</script>\n"; }
function cc_tpl_script_code($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_CODE_SCRIPT) . "</script>\n"; }
function cc_tpl_script_search($id, $v) { return '<script>' . str_replace('%ID%', $id, CC_SEARCH_SCRIPT) . "</script>\n"; }
// Business: its structured data (JSON-LD) for search engines, from the clean values
function cc_tpl_script_business($id, $v) {
    if (empty($v['jsonLd']) || ($v['name'] ?? '') === '') return '';
    $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    $lines = cc_lines($v['addressText'] ?? '');
    $ld = ['@context' => 'https://schema.org', '@type' => $v['businessType'], 'name' => $v['name']];
    if ($lines) $ld['address'] = ['@type' => 'PostalAddress', 'streetAddress' => implode(', ', $lines)];
    if (($v['tel'] ?? '') !== '') $ld['telephone'] = $v['tel'];
    if (($v['emailHref'] ?? '') !== '') $ld['email'] = $v['email'];
    if (($v['web'] ?? '') !== '') $ld['url'] = $v['web'];
    $specs = [];
    foreach ($v['hours'] ?? [] as $i => $h) if (!empty($h['isOpen'])) $specs[] = ['@type' => 'OpeningHoursSpecification', 'dayOfWeek' => $days[$i], 'opens' => $h['start'], 'closes' => $h['end']];
    if ($specs) $ld['openingHoursSpecification'] = $specs;
    return '<script type="application/ld+json">' . json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . "</script>\n";
}
function cc_tpl_script_logos($id, $v) { return '<script>' . str_replace(['%ID%', '%SPEED%'], [$id, (string)($v['speed'] ?? 30)], CC_LOGOS_SCRIPT) . "</script>\n"; }

// The HTML of a block that has a definition (cc_render_block_body adds the custom CSS, render_block the device rules)
function cc_render_def_block(array $def, array $block, $innerId) {
    $styles = is_array($block['styles'] ?? null) ? $block['styles'] : [];
    $content = is_array($block['content'] ?? null) ? $block['content'] : [];
    $values = cc_tpl_clean_settings($def['settings'] ?? [], $content, $styles);
    if (!empty($def['renderIf']) && !cc_tpl_truthy($values[$def['renderIf']] ?? null)) return null;   // nothing at all, not even the custom CSS
    $rootStyles = $styles;
    foreach ($def['rootStyleOmit'] ?? [] as $k) unset($rootStyles[$k]);
    $field = [];
    foreach ($def['settings'] ?? [] as $key => $s) if (!empty($s['inline'])) $field[$key] = new CcTrusted('');
    $custom = !empty($content['customClass']) ? cc_tpl_str($content['customClass']) : '';
    $script = '';
    $fn = CC_TPL_SCRIPTS[$def['script'] ?? ''] ?? null;
    if ($fn) $script = $fn($innerId, $values);
    $pkg = $def['_pkg'] ?? '';   // a block of a package: its own class scopes the package's CSS, its images have an address
    $builtIn = ['_id' => $innerId, '_classes' => cc_effect_classes($styles, $content) . ($custom !== '' ? ' ' . $custom : '') . ($pkg !== '' ? ' cc-pkg-' . $pkg : ''),
        '_style' => new CcTrusted(build_inline_style($rootStyles)), '_field' => $field, '_script' => new CcTrusted($script),
        '_lb' => new CcTrusted('{'), '_rb' => new CcTrusted('}'), '_base' => new CcTrusted('{{BASE_URL}}'), '_editing' => false,
        '_assets' => new CcTrusted($pkg !== '' ? '{{BASE_URL}}canvascore-blocks/' . $pkg . '/' : '')];
    return cc_tpl_render($def['_ast'], [$builtIn, $values]);
}
