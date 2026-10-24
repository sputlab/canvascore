<?php
// canvascore-admin/config.php
// Shared module: hardened session, CSRF, data dir outside the web root, HTML sanitizer, protections.
// Included by api.php, rebuild_all.php, submit_form.php.
// Library file: included by the endpoints, never opened directly
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

if (defined('CC_CONFIG_LOADED')) return;
define('CC_CONFIG_LOADED', true);

// Errors go to the server log, never into a page or a JSON answer (they could reveal paths and internals)
if (PHP_SAPI !== 'cli') { ini_set('display_errors', '0'); ini_set('log_errors', '1'); }

// Hosts without the mbstring extension: UTF-8 safe fallbacks for the two functions used
if (!function_exists('mb_substr')) {
    function mb_substr($s, $start, $length = null) {
        preg_match_all('/./us', (string)$s, $m);
        return implode('', array_slice($m[0], $start, $length));
    }
}
if (!function_exists('mb_strlen')) {
    function mb_strlen($s) { return (int)preg_match_all('/./us', (string)$s); }
}

// ---------------------------------------------------------------------------
// Hardened session (HttpOnly cookie, SameSite=Lax, Secure over HTTPS)
// ---------------------------------------------------------------------------
function cc_is_https() {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    // A proxy's word about the original scheme counts only when the request comes from a trusted proxy
    if (!in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), cc_trusted_proxies(), true)) return false;
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https'
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '')) === 'on';
}
// Global Options › Security › Trusted proxy addresses (a list of IPs). $override: the list to use (tests).
function cc_trusted_proxies($override = null) {
    static $trusted = null;
    if ($override !== null) $trusted = array_values($override);
    if ($trusted === null) {
        $s = @json_decode((string)@file_get_contents(cc_data_dir() . '/settings.json'), true);
        $trusted = array_values(array_filter(array_map('trim', explode(',', (string)($s['trustedProxies'] ?? ''))), function ($ip) { return filter_var($ip, FILTER_VALIDATE_IP); }));
    }
    return $trusted;
}

// Session start (with inactivity timeout) is in cc_boot_session(), called at the end of the file.

// ---------------------------------------------------------------------------
// .htaccess (Apache) — robust and FPM-safe
// ---------------------------------------------------------------------------
$GLOBALS['CC_HT_DENY'] =
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n";

$GLOBALS['CC_HT_UPLOADS'] =
    "<FilesMatch \"\\.(?i:php|phtml|phar|php3|php4|php5|php7|phps|pht|cgi|pl|py|sh)$\">\n" .
    "  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>\n" .
    "  <IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n  </IfModule>\n" .
    "</FilesMatch>\n" .
    // php_flag (php_admin_flag is refused in .htaccess and would make the whole folder answer 500)
    "<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n" .
    "<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n" .
    // SVG files opened directly can't run scripts (defense in depth, besides the upload check)
    "<FilesMatch \"\\.(?i:svg)$\">\n  <IfModule mod_headers.c>\n    Header set Content-Security-Policy \"default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; sandbox\"\n  </IfModule>\n</FilesMatch>\n" .
    "<IfModule mod_headers.c>\n  Header set X-Content-Type-Options nosniff\n</IfModule>\n";

// Security headers for every response of the admin's PHP files: never framed by another site (clickjacking),
// no MIME sniffing, no referrer leaks. The editor's static index.html gets the same from canvascore-admin/.htaccess
// (Apache) or the server configuration (Nginx: see the Administrator Guide).
function cc_security_headers() {
    if (headers_sent()) return;
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('Cross-Origin-Opener-Policy: same-origin');
    header_remove('X-Powered-By');
    if (cc_demo_on()) header('X-Robots-Tag: noindex, nofollow');
}

// The admin folder itself (Apache): security headers for the editor page too (it is a static file, so PHP can't
// send them), and no direct access to the library files and JSON data. Written by api.php and install.php.
$GLOBALS['CC_HT_ADMIN'] =
    "# CanvasCore: written automatically (security headers and access rules). Nginx: see the Administrator Guide.\n" .
    "<IfModule mod_headers.c>\n" .
    "  Header always set X-Frame-Options \"DENY\"\n" .
    "  Header always set Content-Security-Policy \"frame-ancestors 'none'; base-uri 'self'; object-src 'none'\"\n" .
    "  Header always set X-Content-Type-Options \"nosniff\"\n" .
    "  Header always set Referrer-Policy \"same-origin\"\n" .
    "  Header always set Cross-Origin-Opener-Policy \"same-origin\"\n" .
    "</IfModule>\n" .
    "<FilesMatch \"^(config|compiler|migrations|media|backup|publish|blockdef|blockpkg|wpimport|update|update-keys|update-source)\\.php$|\\.(?i:json|md|sqlite|log|zip|part|lock)$\">\n" .
    "  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>\n" .
    "  <IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n  </IfModule>\n" .
    "</FilesMatch>\n" .
    // the Menu Builder's sandboxed live preview is the one page the editor itself frames
    "<FilesMatch \"^menu-preview\\.html$\">\n  <IfModule mod_headers.c>\n" .
    "    Header always set X-Frame-Options \"SAMEORIGIN\"\n" .
    "    Header always set Content-Security-Policy \"frame-ancestors 'self'; base-uri 'none'; object-src 'none'\"\n" .
    "  </IfModule>\n</FilesMatch>\n";

// The admin folder's .htaccess is rewritten only while it is CanvasCore's own (starts with its marker line):
// an administrator who replaces it with their own rules (basic auth…) keeps them.
function ensure_admin_htaccess($dir) {
    $f = $dir . '/.htaccess';
    if (is_file($f) && strpos((string)@file_get_contents($f, false, null, 0, 64), '# CanvasCore: written automatically') !== 0) return;
    ensure_htaccess($dir, $GLOBALS['CC_HT_ADMIN']);
}

function ensure_htaccess($dir, $contents) {
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    // Rewritten only when different (repairs old installations without a write on every request)
    $f = $dir . '/.htaccess';
    if (!is_file($f) || @file_get_contents($f) !== $contents) @file_put_contents($f, $contents, LOCK_EX);
}

// ---------------------------------------------------------------------------
// Data dir: outside the web root when possible (automatic migration)
// ---------------------------------------------------------------------------
function cc_can_write($dir) {
    if (!is_dir($dir)) return false;
    $t = $dir . '/.cc_wtest_' . getmypid();
    if (@file_put_contents($t, '1') === false) return false;
    @unlink($t);
    return true;
}

// The web server's document root (null in the CLI or when unknown)
function cc_doc_root() {
    $d = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
    $r = $d !== '' ? realpath($d) : false;
    return $r ?: null;
}
// Is $path (existing or not) inside $root? Resolves the nearest existing ancestor, so symlinks are followed.
function cc_path_inside($path, $root) {
    if (!$root) return false;
    $p = rtrim(str_replace('\\', '/', $path), '/'); $tail = '';
    while ($p !== '' && !file_exists($p)) { $tail = '/' . basename($p) . $tail; $nd = dirname($p); if ($nd === $p) break; $p = $nd; }
    $real = realpath($p === '' ? '/' : $p);
    if ($real === false) return false;
    $full = rtrim(str_replace('\\', '/', $real), '/') . $tail . '/';
    return strpos($full, rtrim(str_replace('\\', '/', $root), '/') . '/') === 0;
}

function cc_data_dir() {
    static $dir = null;
    if ($dir !== null) return $dir;

    $legacy  = __DIR__ . '/data';                        // inside the web root
    $outside = dirname(__DIR__, 2) . '/canvascore-data'; // next to the site folder (outside the web root when the site IS the web root)
    // A site installed in a sub-folder of the web root (example.com/site/): the folder next to it is still inside
    // the web root, so a new installation goes next to the web root itself.
    $docroot = cc_doc_root();
    // One folder per site (canvascore-data-<sub-folder>), so two sites in different sub-folders never share data.
    $above = null;
    if ($docroot && cc_path_inside($outside, $docroot)) {
        $site = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
        $rel = trim(str_replace('\\', '/', substr($site, strlen($docroot))), '/');
        $above = dirname($docroot) . '/canvascore-data' . ($rel !== '' ? '-' . trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($rel)), '-') : '');
    }
    $candidates = array_values(array_filter([$above, $outside, $legacy]));

    // An existing database stays where it is
    foreach ($candidates as $c) { if (is_file($c . '/canvascore.sqlite')) { $dir = $c; break; } }
    if ($dir === null) {
        foreach ($candidates as $c) { if (!is_dir($c)) @mkdir($c, 0755, true); }
        foreach ($candidates as $c) { if (cc_can_write($c) && !cc_path_inside($c, $docroot)) { $dir = $c; break; } }
        if ($dir === null) foreach ($candidates as $c) { if (cc_can_write($c)) { $dir = $c; break; } }
        if ($dir === null) $dir = $legacy;
    } elseif ($dir === $legacy) {
        // Data in the legacy folder inside the web root: moved out as soon as a folder outside it can be written
        foreach ([$above, $outside] as $c) {
            if (!$c || cc_path_inside($c, $docroot)) continue;
            if (!is_dir($c)) @mkdir($c, 0755, true);
            if (!cc_can_write($c)) continue;
            foreach (['canvascore.sqlite', 'settings.json', 'menu.json', 'forms.json'] as $f) {
                if (file_exists($legacy . '/' . $f)) @copy($legacy . '/' . $f, $c . '/' . $f);
            }
            if (file_exists($c . '/canvascore.sqlite')) { @unlink($legacy . '/canvascore.sqlite'); $dir = $c; }
            break;
        }
    }

    ensure_htaccess($dir, $GLOBALS['CC_HT_DENY']);
    if (is_dir($legacy)) ensure_htaccess($legacy, $GLOBALS['CC_HT_DENY']);

    return $dir;
}

// ---------------------------------------------------------------------------
// Version (single source of truth: version.json)
// ---------------------------------------------------------------------------
function cc_version() {
    static $v = null;
    if ($v !== null) return $v;
    $file = __DIR__ . '/version.json';
    $data = file_exists($file) ? json_decode(file_get_contents($file), true) : null;
    $v = [
        'app' => $data['app'] ?? '0.0.0',
        'db_schema' => (int)($data['db_schema'] ?? 1),
        'content_schema' => (int)($data['content_schema'] ?? 1),
        'build' => (int)($data['build'] ?? 0),
        'built' => $data['built'] ?? null,
    ];
    return $v;
}

// Block defaults (single source of truth, shared with the editor).
function cc_block_defaults() {
    static $d = null;
    if ($d !== null) return $d;
    $file = __DIR__ . '/blocks.json';
    $d = file_exists($file) ? (json_decode(file_get_contents($file), true) ?: ['_baseStyles' => [], 'types' => []]) : ['_baseStyles' => [], 'types' => []];
    return $d;
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------
function cc_safe_slug($raw) {
    $s = strtolower(trim((string)$raw));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    $s = trim($s, '-');
    return $s === '' ? 'index' : $s;
}
if (!function_exists('sanitize_slug')) {
    function sanitize_slug($raw) { return cc_safe_slug($raw); }
}
// Values that go into CSS: a color (hex, rgb()/rgba(), a color name) or a length; anything else -> $default
function cc_css_color($v, $default) {
    $v = trim((string)$v);
    if (cc_is_color_ref($v)) return $v;
    return preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/', $v) ? $v : $default;
}
function cc_css_length($v, $default) {
    $v = trim((string)$v);
    return preg_match('/^\d{1,5}(\.\d+)?(px|%|rem|em|vw)?$/', $v) ? $v : $default;
}
// ---------------------------------------------------------------------------
// Global colours (Global Options): a named palette in settings.json ("colors": [{id, name, value}]). Each colour is
// a CSS variable (--cc-color-<id>) on published pages and in the editor; blocks that use one store a reference,
// var(--cc-color-<id>, <its value when chosen>), so changing the palette changes the whole site. "primary" is the
// brand colour (brandColor, --brand-color). Mirrors src/editor/palette.js.
// ---------------------------------------------------------------------------
const CC_DEFAULT_COLORS = [['primary', 'Primary', '#3b82f6'], ['secondary', 'Secondary', '#0f172a'], ['accent', 'Accent', '#f59e0b'],
    ['text', 'Text', '#0f172a'], ['background', 'Background', '#ffffff']];
const CC_COLOR_REF = '/^var\(--(?:brand-color|cc-color-[a-z][a-z0-9-]{0,31})(?:\s*,\s*(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}))?\)$/';
function cc_is_color_ref($v) { return is_string($v) && preg_match(CC_COLOR_REF, trim($v)) === 1; }
function cc_palette_hex($v) { $v = trim((string)$v); return preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $v) ? strtolower($v) : null; }
// The site's palette: the built-in colours (in this order, names editable) then the custom ones; bad entries dropped
function cc_palette($settings) {
    $settings = is_array($settings) ? $settings : [];
    $saved = [];
    foreach ((is_array($settings['colors'] ?? null) ? $settings['colors'] : []) as $c) {
        if (!is_array($c)) continue;
        $id = strtolower(trim((string)($c['id'] ?? '')));
        $val = cc_palette_hex($c['value'] ?? '');
        if (!preg_match('/^[a-z][a-z0-9-]{0,31}$/', $id) || $val === null || isset($saved[$id]) || count($saved) >= 40) continue;
        $name = trim(preg_replace('/[\x00-\x1f\x7f<>]/', '', (string)($c['name'] ?? '')));
        $saved[$id] = ['id' => $id, 'name' => mb_substr($name, 0, 40), 'value' => $val];
    }
    $out = [];
    foreach (CC_DEFAULT_COLORS as [$id, $name, $value]) {
        $c = $saved[$id] ?? ['id' => $id, 'name' => $name, 'value' => $value];
        if ($id === 'primary' && !isset($saved['primary']) && ($b = cc_palette_hex($settings['brandColor'] ?? ''))) $c['value'] = $b;
        if ($c['name'] === '') $c['name'] = $name;
        $out[] = $c; unset($saved[$id]);
    }
    foreach ($saved as $c) { if ($c['name'] === '') $c['name'] = ucfirst($c['id']); $out[] = $c; }
    return $out;
}
// The palette as CSS custom properties (inside :root)
function cc_palette_css($palette) {
    $css = '';
    foreach ($palette as $c) $css .= '--cc-color-' . $c['id'] . ': ' . $c['value'] . '; ';
    return $css;
}

// ---------------------------------------------------------------------------
// Text styles (Global Options › Text styles): named presets for H1–H6, body, small text and buttons, each with a font,
// size, weight and line height; tablet and phone values override the desktop ones. Every value is a CSS variable
// (--cc-type-<preset>-<prop>): the site's own elements are styled by cc_type_css(), and a block that picks a preset
// (styles.textPreset) gets the variables through cc_with_text_preset(). Mirrors src/render/typography.mjs.
// ---------------------------------------------------------------------------
const CC_TYPE_PRESETS = ['h1' => 'h1', 'h2' => 'h2', 'h3' => 'h3', 'h4' => 'h4', 'h5' => 'h5', 'h6' => 'h6', 'body' => 'body', 'small' => 'small', 'button' => '.cc-btn'];
const CC_TYPE_PROPS = ['font' => 'font-family', 'size' => 'font-size', 'weight' => 'font-weight', 'lineHeight' => 'line-height'];
const CC_TYPE_SHORT = ['font' => 'font', 'size' => 'size', 'weight' => 'weight', 'lineHeight' => 'line'];
const CC_TYPE_FONTS = ['Inter', 'Roboto', 'Poppins', 'Open Sans', 'Montserrat', 'Lato', 'Oswald', 'Playfair Display', 'Raleway', 'Ubuntu', 'Lora'];
const CC_TYPE_WEIGHTS = ['300', '400', '600', '700', '900'];
const CC_TYPE_TABLET_MAX = 1024;
const CC_TYPE_MOBILE_MAX = 767;
// One value of one property, or '' when it is not valid
function cc_type_clean($prop, $v) {
    $s = trim(is_scalar($v) ? (string)$v : '');
    if ($prop === 'font') return in_array($s, CC_TYPE_FONTS, true) ? $s : '';
    if ($prop === 'weight') return in_array($s, CC_TYPE_WEIGHTS, true) ? $s : '';
    if ($prop === 'size') return preg_match('/^\d{1,5}(\.\d+)?(px|%|rem|em|vw)?$/', $s) ? $s : '';
    return preg_match('/^\d{1,2}(\.\d{1,2})?(px|rem|em)?$/', $s) ? $s : '';
}
function cc_type_pick($src) {
    $o = [];
    foreach (array_keys(CC_TYPE_PROPS) as $k) { $v = cc_type_clean($k, is_array($src) ? ($src[$k] ?? '') : ''); if ($v !== '') $o[$k] = $v; }
    return $o;
}
// The tidy form of settings.typography: only the presets and values that are set
function cc_typography($settings) {
    $raw = is_array($settings['typography'] ?? null) ? $settings['typography'] : [];
    $out = [];
    foreach (array_keys(CC_TYPE_PRESETS) as $id) {
        $p = is_array($raw[$id] ?? null) ? $raw[$id] : [];
        $base = cc_type_pick($p);
        foreach (['tablet', 'mobile'] as $d) { $o = cc_type_pick($p[$d] ?? null); if ($o) $base[$d] = $o; }
        if ($base) $out[$id] = $base;
    }
    return $out;
}
// The Google Fonts the text styles use (the site font is added by the caller)
function cc_type_fonts($typo) {
    $out = [];
    foreach (array_keys(CC_TYPE_PRESETS) as $id) { $f = $typo[$id]['font'] ?? ''; if ($f !== '' && !in_array($f, $out, true)) $out[] = $f; }
    return $out;
}
// The site's text styles as CSS: the variables on :root, and the rules that use them, for the desktop, then the tablet
// and phone overrides inside their media queries
function cc_type_css($typo) {
    $out = '';
    $scopes = [['desktop', ''], ['tablet', '@media(max-width:' . CC_TYPE_TABLET_MAX . 'px)'], ['mobile', '@media(max-width:' . CC_TYPE_MOBILE_MAX . 'px)']];
    foreach ($scopes as [$dev, $wrap]) {
        $vars = ''; $rules = '';
        foreach (CC_TYPE_PRESETS as $id => $target) {
            $p = $typo[$id] ?? [];
            $own = $dev === 'desktop' ? cc_type_pick($p) : cc_type_pick($p[$dev] ?? null);
            $decl = '';
            foreach (CC_TYPE_PROPS as $k => $cssProp) {
                if (!isset($own[$k])) continue;
                $var = '--cc-type-' . $id . '-' . CC_TYPE_SHORT[$k];
                $value = $k === 'font' ? "'" . $own[$k] . "', sans-serif" : $own[$k];
                $vars .= $var . ': ' . $value . '; ';
                $decl .= $cssProp . ': var(' . $var . '); ';
            }
            if ($decl !== '') $rules .= $target . '{' . $decl . '}';
        }
        if ($vars === '') continue;
        $block = ':root{' . $vars . '}' . $rules;
        $out .= $wrap === '' ? $block : $wrap . '{' . $block . '}';
    }
    return $out;
}
// A block's styles with its text preset applied: the preset's properties as variables, under the block's own values
// (a value the block sets, or a tablet/phone override, wins; an emptied field falls back to the preset)
function cc_with_text_preset($styles) {
    $styles = is_array($styles) ? $styles : [];
    $id = $styles['textPreset'] ?? null;
    unset($styles['textPreset']);
    if (!is_string($id) || !isset(CC_TYPE_PRESETS[$id])) return $styles;
    $ref = [
        'fontFamily' => 'var(--cc-type-' . $id . '-font)',
        'fontSize' => 'var(--cc-type-' . $id . '-size)',
        'fontWeight' => 'var(--cc-type-' . $id . '-weight)',
        'lineHeight' => 'var(--cc-type-' . $id . '-line)',
    ];
    $out = $ref;
    foreach ($styles as $k => $v) {
        if (array_key_exists($k, $ref) && ($v === '' || $v === null)) continue;
        $out[$k] = $v;
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Button and field styles (Global Options › Buttons & fields), reused across blocks: button presets (primary,
// secondary, outline) as CSS variables (--cc-btn-<id>-<prop>), and the field style (--cc-field-<prop>) of the form
// inputs. Mirrors src/render/kit.mjs.
// ---------------------------------------------------------------------------
const CC_BTN_PRESETS = ['primary', 'secondary', 'outline'];
const CC_BTN_PROPS = ['bg', 'text', 'border', 'radius'];
const CC_FIELD_PROPS = ['bg', 'border', 'radius'];
// The built-in look of each preset: background, text, border, radius
const CC_BTN_DEFAULTS = [
    'primary' => ['var(--brand-color, #3b82f6)', '#ffffff', 'transparent', '6px'],
    'secondary' => ['#0f172a', '#ffffff', 'transparent', '6px'],
    'outline' => ['transparent', 'var(--brand-color, #3b82f6)', 'var(--brand-color, #3b82f6)', '6px'],
];
// One value of one property, or '' when it is not valid
function cc_kit_clean($prop, $v) {
    $s = trim(is_scalar($v) ? (string)$v : '');
    if ($prop === 'radius') return preg_match('/^\d{1,3}(\.\d{1,2})?(px|rem|em|%)?$/', $s) ? $s : '';
    if ($s === 'transparent') return $s;
    if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $s)) return strtolower($s);
    return preg_match(CC_COLOR_REF, $s) ? $s : '';
}
// The tidy form of the saved styles: ['buttons' => [id => [bg, text, border, radius]], 'field' => [bg, border, radius]]
function cc_kit($settings) {
    $settings = is_array($settings) ? $settings : [];
    $raw = is_array($settings['buttonStyles'] ?? null) ? $settings['buttonStyles'] : [];
    $pick = function ($src, $props) {
        $o = [];
        if (is_array($src)) foreach ($props as $k) { $v = cc_kit_clean($k, $src[$k] ?? ''); if ($v !== '') $o[$k] = $v; }
        return $o;
    };
    $buttons = [];
    foreach (CC_BTN_PRESETS as $id) { $o = $pick($raw[$id] ?? null, CC_BTN_PROPS); if ($o) $buttons[$id] = $o; }
    return ['buttons' => $buttons, 'field' => $pick($settings['fieldStyle'] ?? null, CC_FIELD_PROPS)];
}
// The declarations of a button that picks a preset ('' for an unknown one)
function cc_button_preset_css($id) {
    if (!in_array($id, CC_BTN_PRESETS, true)) return '';
    [$bg, $text, $border, $radius] = CC_BTN_DEFAULTS[$id];
    return "background: var(--cc-btn-{$id}-bg, {$bg}); color: var(--cc-btn-{$id}-text, {$text}); "
        . "border: 2px solid var(--cc-btn-{$id}-border, {$border}); border-radius: var(--cc-btn-{$id}-radius, {$radius}); ";
}
// The variables for a scope (':root' on published pages, '.cc-canvas' in the editor): only the values that are set
function cc_kit_css($kit, $scope) {
    $vars = [];
    foreach (CC_BTN_PRESETS as $id) foreach (CC_BTN_PROPS as $p) { $v = $kit['buttons'][$id][$p] ?? ''; if ($v !== '') $vars[] = "--cc-btn-{$id}-{$p}: {$v};"; }
    foreach (CC_FIELD_PROPS as $p) { $v = $kit['field'][$p] ?? ''; if ($v !== '') $vars[] = "--cc-field-{$p}: {$v};"; }
    return $vars ? $scope . '{' . implode(' ', $vars) . '}' : '';
}

// ---------------------------------------------------------------------------
// Custom fields of a collection (Collections › Fields). The definitions are on the collection (collections.fields: a
// list of {id, key, label, type, required, options, multiple, target}); each item keeps its values (collection_items.
// field_values: an object keyed by the field's id). Nine types. Every definition and every value is cleaned here, so
// nothing that is not a text, a rich text, a number, a date, an image, a link, a choice or an item reaches the page.
// ---------------------------------------------------------------------------
const CC_FIELD_TYPES = ['text', 'richtext', 'number', 'date', 'image', 'gallery', 'link', 'choice', 'reference'];
const CC_FIELD_MAX = 50;
const CC_FIELD_OPTIONS_MAX = 100;
const CC_GALLERY_MAX = 60;
// A text: no control characters, trimmed, at most $max characters
function cc_field_text($v, $max) {
    $s = trim(preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', '', is_scalar($v) ? (string)$v : ''));
    return mb_substr($s, 0, $max);
}
// A link: http(s), mailto or tel, or an address on this site (a path or a page); never another scheme (no javascript:)
function cc_field_link($u) {
    $u = trim(is_scalar($u) ? (string)$u : '');
    if ($u === '' || strlen($u) > 2000 || preg_match('/[\x00-\x20\x7f<>"\'`\\\\]/', $u)) return '';
    if (preg_match('~^(?:https?://|mailto:|tel:)~i', $u)) return $u;
    if (preg_match('/^[A-Za-z0-9\/#?][A-Za-z0-9\/._~?=&%#+-]*$/', $u)) return $u;
    return '';
}
// An image address: a web address, a path on the site or an embedded raster image; any other scheme is refused.
// The same rule as cc_img_url() in compiler.php (this file is loaded by the API without the renderer)
function cc_field_image($u) {
    $u = trim(is_scalar($u) ? (string)$u : '');
    $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', $u));
    if (preg_match('/^[a-z][a-z0-9+.-]*:/', $probe) && !preg_match('#^(https?:|data:image/(png|jpe?g|gif|webp|avif);)#', $probe)) return '';
    return $u;
}
function cc_collection_exists($pdo, $id) {
    $st = $pdo->prepare("SELECT 1 FROM collections WHERE id = ?");
    $st->execute([$id]);
    return (bool)$st->fetchColumn();
}
// The tidy field definitions of a collection: valid ids and keys (unique), known types, choices with unique values,
// a reference to a collection that exists. Anything else is dropped.
function cc_field_defs($raw, $pdo) {
    if (!is_array($raw)) return [];
    $out = []; $ids = []; $keys = [];
    foreach ($raw as $f) {
        if (count($out) >= CC_FIELD_MAX) break;
        if (!is_array($f)) continue;
        $id = strtolower(trim(is_scalar($f['id'] ?? null) ? (string)$f['id'] : ''));
        $key = strtolower(trim(is_scalar($f['key'] ?? null) ? (string)$f['key'] : ''));
        $type = is_string($f['type'] ?? null) ? $f['type'] : '';
        if (!preg_match('/^[a-z0-9_]{1,40}$/', $id) || isset($ids[$id])) continue;
        if (!preg_match('/^[a-z][a-z0-9_]{0,39}$/', $key) || isset($keys[$key])) continue;
        if (!in_array($type, CC_FIELD_TYPES, true)) continue;
        $label = cc_field_text($f['label'] ?? '', 80);
        $def = ['id' => $id, 'key' => $key, 'label' => $label !== '' ? $label : $key, 'type' => $type, 'required' => !empty($f['required'])];
        if ($type === 'choice') {
            $opts = []; $vals = [];
            foreach ((is_array($f['options'] ?? null) ? $f['options'] : []) as $o) {
                if (count($opts) >= CC_FIELD_OPTIONS_MAX) break;
                if (!is_array($o)) continue;
                $ov = strtolower(trim(is_scalar($o['value'] ?? null) ? (string)$o['value'] : ''));
                if (!preg_match('/^[a-z0-9_-]{1,40}$/', $ov) || isset($vals[$ov])) continue;
                $vals[$ov] = true;
                $ol = cc_field_text($o['label'] ?? '', 80);
                $opts[] = ['value' => $ov, 'label' => $ol !== '' ? $ol : $ov];
            }
            $def['options'] = $opts;
            $def['multiple'] = !empty($f['multiple']);
        }
        if ($type === 'reference') {
            $target = is_scalar($f['target'] ?? null) ? (string)$f['target'] : '';
            $def['target'] = ($target !== '' && $pdo && cc_collection_exists($pdo, $target)) ? $target : '';
        }
        $ids[$id] = true; $keys[$key] = true;
        $out[] = $def;
    }
    return $out;
}
// One value, cleaned for its field's type. Empty is '' (text, date, reference), null (number), [] (gallery, multiple
// choice) or a link with an empty url and text.
function cc_field_clean($d, $v, $pdo) {
    switch ($d['type']) {
        case 'text': return cc_field_text($v, 500);
        case 'richtext': return is_string($v) ? cc_sanitize_html(mb_substr($v, 0, 20000)) : '';
        case 'number':
            if ($v === '' || $v === null || !is_scalar($v) || !is_numeric($v)) return null;
            return is_finite((float)$v) ? (float)$v : null;
        case 'date':
            $s = is_string($v) ? trim($v) : '';
            if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return '';
            return $s;
        case 'image': return cc_field_image(cc_field_text($v, 2000));
        case 'gallery':
            $out = [];
            foreach ((is_array($v) ? $v : []) as $u) {
                if (count($out) >= CC_GALLERY_MAX) break;
                $c = cc_field_image(cc_field_text($u, 2000));
                if ($c !== '') $out[] = $c;
            }
            return $out;
        case 'link':
            $a = is_array($v) ? $v : [];
            return ['url' => cc_field_link($a['url'] ?? ''), 'text' => cc_field_text($a['text'] ?? '', 200)];
        case 'choice':
            $values = array_column($d['options'] ?? [], 'value');
            if (!empty($d['multiple'])) {
                $out = [];
                foreach ((is_array($v) ? $v : []) as $x) {
                    $x = strtolower(trim(is_scalar($x) ? (string)$x : ''));
                    if (in_array($x, $values, true) && !in_array($x, $out, true)) $out[] = $x;
                }
                return $out;
            }
            $x = strtolower(trim(is_scalar($v) ? (string)$v : ''));
            return in_array($x, $values, true) ? $x : '';
        case 'reference':
            $x = is_scalar($v) ? trim((string)$v) : '';
            if ($x === '' || $d['target'] === '' || !$pdo) return '';
            $st = $pdo->prepare("SELECT 1 FROM collection_items WHERE id = ? AND collection_id = ?");
            $st->execute([$x, $d['target']]);
            return $st->fetchColumn() ? $x : '';
    }
    return null;
}
function cc_field_empty($c) {
    if ($c === null || $c === '' || $c === []) return true;
    if (is_array($c) && array_key_exists('url', $c)) return $c['url'] === '' && $c['text'] === '';
    return false;
}
// The values of an item, cleaned against its collection's fields, keyed by field id. $missing lists the labels of the
// required fields left empty; it counts only when the item is being published.
function cc_field_values($defs, $raw, $pdo, $publishing) {
    $raw = is_array($raw) ? $raw : [];
    $vals = []; $missing = [];
    foreach ($defs as $d) {
        $c = cc_field_clean($d, $raw[$d['id']] ?? null, $pdo);
        $vals[$d['id']] = $c;
        if ($d['required'] && $publishing && cc_field_empty($c)) $missing[] = $d['label'];
    }
    return [$vals, $missing];
}

// ---------------------------------------------------------------------------
// Structured data for search engines (schema.org, JSON-LD on the item pages of a collection). A collection picks a type
// and the field that gives each property; the property accepts only fields of the right type.
// ---------------------------------------------------------------------------
const CC_SCHEMA_TYPES = [
    'Product' => ['image' => ['image', 'gallery'], 'description' => ['text', 'richtext'], 'price' => ['number'], 'sku' => ['text']],
    'Event' => ['startDate' => ['date'], 'location' => ['text'], 'image' => ['image', 'gallery'], 'description' => ['text', 'richtext']],
    'Person' => ['jobTitle' => ['text', 'choice'], 'image' => ['image', 'gallery'], 'description' => ['text', 'richtext']],
];
// The tidy schema of a collection: {type, map: {property: field id}, currency (ISO 4217, for a Product's price)}
function cc_schema_clean($raw, $defs) {
    $raw = is_array($raw) ? $raw : [];
    $type = is_string($raw['type'] ?? null) ? $raw['type'] : '';
    if (!isset(CC_SCHEMA_TYPES[$type])) return ['type' => '', 'map' => [], 'currency' => ''];
    $byId = [];
    foreach ($defs as $d) $byId[$d['id']] = $d;
    $sent = is_array($raw['map'] ?? null) ? $raw['map'] : [];
    $map = [];
    foreach (CC_SCHEMA_TYPES[$type] as $prop => $allowed) {
        $fid = is_string($sent[$prop] ?? null) ? $sent[$prop] : '';
        if ($fid !== '' && isset($byId[$fid]) && in_array($byId[$fid]['type'], $allowed, true)) $map[$prop] = $fid;
    }
    $cur = strtoupper(is_string($raw['currency'] ?? null) ? trim($raw['currency']) : '');
    if (!preg_match('/^[A-Z]{3}$/', $cur)) $cur = '';
    return ['type' => $type, 'map' => $map, 'currency' => $cur];
}

// ---------------------------------------------------------------------------
// Categories and tags (taxonomies per collection). A collection has taxonomies (collection_taxonomies: a name, an address
// part and whether an item may have several of its terms); each taxonomy has terms (collection_terms). An item keeps its
// terms as collection_items.terms_json: {taxonomy id: [term ids]}. Every taxonomy and term is cleaned here.
// ---------------------------------------------------------------------------
const CC_TAX_MAX = 20;
const CC_TERM_MAX = 200;
// A slug part that can be a folder of its own (no reserved word of the site)
function cc_tax_slug($raw) {
    $s = cc_safe_slug($raw);
    return in_array($s, ['index', 'feed', 'feed-xml', 'search', 'uploads'], true) ? '' : $s;
}
function cc_tax_id($raw) {
    $id = strtolower(trim(is_scalar($raw) ? (string)$raw : ''));
    return preg_match('/^[a-z0-9_-]{1,40}$/', $id) ? $id : 't' . bin2hex(random_bytes(6));
}
// The tidy taxonomies of a collection: [{id, name, slug, multiple, terms: [{id, name, slug, description}]}]. Names and
// addresses are unique within the collection; a term without a usable name or address is dropped.
function cc_taxonomies_clean($raw) {
    if (!is_array($raw)) return [];
    $out = []; $tax_slugs = []; $tax_ids = [];
    foreach ($raw as $t) {
        if (count($out) >= CC_TAX_MAX) break;
        if (!is_array($t)) continue;
        $name = cc_field_text($t['name'] ?? '', 80);
        $slug = cc_tax_slug($t['slug'] ?? '') ?: cc_tax_slug($name);
        if ($name === '' || $slug === '' || isset($tax_slugs[$slug])) continue;
        $id = cc_tax_id($t['id'] ?? '');
        if (isset($tax_ids[$id])) $id = cc_tax_id('');
        $terms = []; $term_slugs = []; $term_ids = [];
        foreach ((is_array($t['terms'] ?? null) ? $t['terms'] : []) as $m) {
            if (count($terms) >= CC_TERM_MAX) break;
            if (!is_array($m)) continue;
            $tname = cc_field_text($m['name'] ?? '', 80);
            $tslug = cc_tax_slug($m['slug'] ?? '') ?: cc_tax_slug($tname);
            if ($tname === '' || $tslug === '' || isset($term_slugs[$tslug])) continue;
            $tid = cc_tax_id($m['id'] ?? '');
            if (isset($term_ids[$tid])) $tid = cc_tax_id('');
            $term_ids[$tid] = true; $term_slugs[$tslug] = true;
            $terms[] = ['id' => $tid, 'name' => $tname, 'slug' => $tslug, 'description' => cc_field_text(strip_tags(is_scalar($m['description'] ?? null) ? (string)$m['description'] : ''), 500)];
        }
        $tax_ids[$id] = true; $tax_slugs[$slug] = true;
        $out[] = ['id' => $id, 'name' => $name, 'slug' => $slug, 'multiple' => !array_key_exists('multiple', $t) || !empty($t['multiple']), 'terms' => $terms];
    }
    return $out;
}
// The taxonomies of a collection as stored (taxonomies in order, each with its terms in order)
function cc_taxonomies_load($pdo, $cid) {
    $out = [];
    $st = $pdo->prepare("SELECT id, name, slug, multiple FROM collection_taxonomies WHERE collection_id = ? ORDER BY position, name");
    $st->execute([$cid]);
    $mt = $pdo->prepare("SELECT id, name, slug, description FROM collection_terms WHERE taxonomy_id = ? ORDER BY position, name");
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $mt->execute([$t['id']]);
        $out[] = ['id' => $t['id'], 'name' => $t['name'], 'slug' => $t['slug'], 'multiple' => (int)$t['multiple'] === 1, 'terms' => $mt->fetchAll(PDO::FETCH_ASSOC)];
    }
    return $out;
}
// An id for a taxonomy or term of this collection: the id sent when nothing else uses it, a new one otherwise
function cc_tax_free_id($pdo, $table, $id, $cid) {
    $st = $pdo->prepare("SELECT collection_id FROM $table WHERE id = ?");
    $st->execute([$id]);
    $owner = $st->fetchColumn();
    return ($owner === false || $owner === $cid) ? $id : cc_tax_id('');
}
// An item's terms, cleaned against its collection: only terms of its taxonomies; one term at most for a taxonomy
// that does not take several
function cc_terms_clean($raw, $pdo, $cid) {
    $raw = is_array($raw) ? $raw : [];
    $st = $pdo->prepare("SELECT t.id AS tid, t.multiple, m.id AS mid FROM collection_taxonomies t LEFT JOIN collection_terms m ON m.taxonomy_id = t.id WHERE t.collection_id = ?");
    $st->execute([$cid]);
    $allowed = []; $multi = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $multi[$r['tid']] = (int)$r['multiple'] === 1;
        if ($r['mid'] !== null) $allowed[$r['tid']][$r['mid']] = true;
    }
    $out = [];
    foreach ($raw as $tid => $list) {
        if (!isset($allowed[$tid]) || !is_array($list)) continue;
        $picked = [];
        foreach ($list as $mid) {
            $mid = is_scalar($mid) ? (string)$mid : '';
            if (isset($allowed[$tid][$mid]) && !in_array($mid, $picked, true)) $picked[] = $mid;
        }
        if (!$multi[$tid]) $picked = array_slice($picked, 0, 1);
        if ($picked) $out[$tid] = $picked;
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Listing and archive pages of a collection: how many items a page holds, and which archives are published (the years,
// the filters of its choice fields, the sorts). The layout is the same for every archive.
// ---------------------------------------------------------------------------
const CC_ARCHIVE_DEFAULT_PER_PAGE = 12;
function cc_archive_clean($raw) {
    $raw = is_array($raw) ? $raw : [];
    $per = is_numeric($raw['perPage'] ?? null) ? (int)$raw['perPage'] : CC_ARCHIVE_DEFAULT_PER_PAGE;
    return [
        'perPage' => max(3, min(50, $per)),
        'years' => !array_key_exists('years', $raw) || !empty($raw['years']),
        'filters' => !array_key_exists('filters', $raw) || !empty($raw['filters']),
        'sorts' => !array_key_exists('sorts', $raw) || !empty($raw['sorts']),
    ];
}

// Top-level folders of the site that belong to CanvasCore itself: no page, collection or redirect may use them
// (a page published there would replace or redirect the admin, the images or the data).
function cc_reserved_slugs() {
    return array_values(array_unique([cc_safe_slug(basename(__DIR__)), 'canvascore-admin', 'uploads', 'canvascore-data', 'canvascore-blocks', 'data']));
}
function cc_slug_reserved($slug) { return in_array(cc_safe_slug($slug), cc_reserved_slugs(), true); }

// ---------------------------------------------------------------------------
// CSRF: a per-session token, sent back by the editor in the X-CSRF-Token header (a custom header can't be added
// by another site without CORS, which is never allowed), plus an Origin / Fetch-Metadata check.
// ---------------------------------------------------------------------------
function cc_issue_csrf() {
    if (session_status() !== PHP_SESSION_ACTIVE) return '';
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    // The token used to be mirrored in a script-readable cookie: removed (only the session copy counts)
    if (isset($_COOKIE['cc_csrf']) && !headers_sent()) {
        @setcookie('cc_csrf', '', ['expires' => time() - 3600, 'path' => '/', 'samesite' => 'Lax', 'secure' => cc_is_https(), 'httponly' => true]);
        unset($_COOKIE['cc_csrf']);
    }
    return $_SESSION['csrf'];
}
// A request that a browser marks as coming from another site, or whose Origin is not this host, is refused.
function cc_same_origin_request() {
    $site = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site === 'cross-site' || $site === 'same-site') return false;
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '' || $origin === 'null') return $origin === '';
    $oh = strtolower((string)parse_url($origin, PHP_URL_HOST)); $op = parse_url($origin, PHP_URL_PORT);
    if ($oh === '') return false;
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $hh = preg_replace('/:\d+$/', '', $host); $hp = preg_match('/:(\d+)$/', $host, $m) ? (int)$m[1] : null;
    if ($oh === $hh && ($op === null || $hp === null || (int)$op === $hp)) return true;
    // Behind a trusted reverse proxy that rewrites Host, the public host it forwards counts too
    if (in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), cc_trusted_proxies(), true)) {
        $fh = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''))[0]));
        if ($fh !== '' && $oh === preg_replace('/:\d+$/', '', $fh)) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Login throttling, in the data dir (login_attempts.json, under a file lock). Every attempt is counted BEFORE the
// password is checked, in the same locked step that checks the limits, so parallel requests can't slip past them:
//  - 5 wrong passwords in 15 minutes for one account from one address -> that pair waits 15 minutes;
//  - 20 wrong passwords in 15 minutes from one address (any accounts) -> that address waits 15 minutes;
//  - 100 wrong passwords in an hour for one account (any addresses) -> that account waits 15 minutes.
// The file holds at most CC_LOGIN_MAX_KEYS entries (the oldest go first), so it can't grow without limit.
// ---------------------------------------------------------------------------
const CC_LOGIN_MAX_KEYS = 5000;
function cc_login_attempts_update($fn) {
    $file = cc_data_dir() . '/login_attempts.json';
    $fh = @fopen($file, 'c+');
    if (!$fh) return $fn([])[1] ?? null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh, 4 * 1048576);
    $all = strlen((string)$raw) < 4 * 1048576 ? json_decode($raw ?: '{}', true) : [];   // a damaged or huge file starts over
    if (!is_array($all)) $all = [];
    $now = time();
    foreach ($all as $k => $v) { if (!is_array($v) || (($v['until'] ?? 0) < $now && ($v['first'] ?? 0) < $now - (int)($v['win'] ?? 900))) unset($all[$k]); }
    [$all, $result] = $fn($all);
    if (count($all) > CC_LOGIN_MAX_KEYS) {
        uasort($all, function ($a, $b) { return max($b['first'] ?? 0, $b['until'] ?? 0) <=> max($a['first'] ?? 0, $a['until'] ?? 0); });
        $all = array_slice($all, 0, CC_LOGIN_MAX_KEYS, true);
    }
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all));
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return $result;
}
// The visitor's address. Behind a reverse proxy / CDN every request comes from the proxy: when the
// connecting address is listed in Global Options › Security › Trusted proxy addresses, the client
// address the proxy reports (X-Forwarded-For, nearest untrusted hop) is used instead.
function cc_client_ip($trustedOverride = null) {   // $trustedOverride: list of proxy IPs (tests)
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $trusted = cc_trusted_proxies($trustedOverride);
    if (!$trusted || !in_array($remote, $trusted, true)) return $remote;
    $chain = array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')));
    for ($i = count($chain) - 1; $i >= 0; $i--) {
        $ip = $chain[$i];
        if (filter_var($ip, FILTER_VALIDATE_IP) && !in_array($ip, $trusted, true)) return $ip;
    }
    return $remote;
}
// The throttling keys of an attempt: [key, limit, window seconds]
function cc_login_keys($username) {
    $ip = cc_client_ip(); $u = strtolower($username);
    return [['a:' . sha1($ip . '|' . $u), 5, 900], ['i:' . sha1($ip), 20, 900], ['u:' . sha1($u), 100, 3600]];
}
// Starts a login attempt: seconds to wait (> 0: refused), or 0 when the attempt may go ahead. The attempt is
// counted as a failure right away; cc_login_result(…, true) clears the account's counters after a success.
function cc_login_begin($username) {
    $keys = cc_login_keys($username);
    return (int) cc_login_attempts_update(function ($all) use ($keys) {
        $now = time(); $wait = 0;
        foreach ($keys as [$k]) $wait = max($wait, (int)($all[$k]['until'] ?? 0) - $now);
        if ($wait > 0) return [$all, $wait];
        $locked = false;
        foreach ($keys as [$k, $max, $win]) {
            $e = $all[$k] ?? null;
            if (!$e || ($e['first'] ?? 0) < $now - $win) $e = ['count' => 0, 'first' => $now, 'until' => 0, 'win' => $win];
            $e['count']++;
            if ($e['count'] > $max) { $e['until'] = $now + 900; $e['count'] = 0; $e['first'] = $now; $locked = true; }
            $all[$k] = $e;
        }
        return [$all, $locked ? 900 : 0];
    });
}
// Seconds to wait before trying again (0 = allowed). Read-only.
function cc_login_wait($username) {
    $keys = cc_login_keys($username);
    return (int) cc_login_attempts_update(function ($all) use ($keys) {
        $wait = 0;
        foreach ($keys as [$k]) $wait = max($wait, (int)($all[$k]['until'] ?? 0) - time());
        return [$all, $wait];
    });
}
function cc_login_result($username, $ok) {
    if (!$ok) return;   // already counted by cc_login_begin()
    $keys = cc_login_keys($username);
    cc_login_attempts_update(function ($all) use ($keys) {
        unset($all[$keys[0][0]]);   // this account from this address starts over
        foreach ([$keys[1][0], $keys[2][0]] as $k) { if (isset($all[$k]) && ($all[$k]['count'] ?? 0) > 0) $all[$k]['count']--; }   // a success is not a failure
        return [$all, null];
    });
}

// Simple rate limit: true while `key` stayed under `max` hits in the last `window` seconds (records the hit).
function cc_rate_allow($bucket, $key, $max, $window) {
    $file = cc_data_dir() . '/rate_' . preg_replace('/[^a-z0-9_]/', '', $bucket) . '.json';
    $fh = @fopen($file, 'c+');
    if (!$fh) return true;
    flock($fh, LOCK_EX);
    $all = json_decode(stream_get_contents($fh) ?: '{}', true);
    if (!is_array($all)) $all = [];
    $now = time();
    foreach ($all as $k => $hits) { $all[$k] = array_values(array_filter((array)$hits, function ($t) use ($now, $window) { return $t > $now - $window; })); if (!$all[$k]) unset($all[$k]); }
    $k = sha1($key);
    $ok = count($all[$k] ?? []) < $max;
    if ($ok) $all[$k][] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all));
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return $ok;
}

// Re-linking after a slug change (used by relink_slug_change in api.php). Works on the decoded data, so the JSON
// formatting (escaped slashes) doesn't matter. Two link forms: "old/index.html" in link fields
// (buttons, menu) and "{{BASE_URL}}old/" inside rich text.
function cc_relink_node(&$node, $oldUrl, $newUrl, $oldBase, $newBase) {
    if (!is_array($node)) return false;
    $changed = false;
    foreach ($node as $k => &$v) {
        if (is_array($v)) {
            if (cc_relink_node($v, $oldUrl, $newUrl, $oldBase, $newBase)) $changed = true;
        } elseif (is_string($v)) {
            if ($v === $oldUrl && in_array($k, ['url', 'btnUrl', 'buttonUrl', 'href', 'link'], true)) { $v = $newUrl; $changed = true; }
            elseif (strpos($v, $oldBase) !== false) { $v = str_replace($oldBase, $newBase, $v); $changed = true; }
        }
    }
    unset($v);
    return $changed;
}

// Revision history: one row per save (draft or publish) whose content differs from the last one;
// the newest CC_REVISIONS_KEEP per page/item are kept. $owner = live page id, or "item:<id>".
const CC_REVISIONS_KEEP = 40;
function cc_add_revision($pdo, $owner, $title, $content_json, $kind) {
    if (!$owner) return;
    try {
        $last = $pdo->prepare("SELECT content_json, title FROM page_revisions WHERE owner = ? ORDER BY id DESC LIMIT 1");
        $last->execute([$owner]);
        $l = $last->fetch(PDO::FETCH_ASSOC);
        if ($l && $l['content_json'] === $content_json && $l['title'] === $title) return;   // nothing changed
        $pdo->prepare("INSERT INTO page_revisions (owner, title, content_json, kind, author, created_at) VALUES (?,?,?,?,?,?)")
            ->execute([$owner, $title, $content_json, $kind, $_SESSION['username'] ?? '', date('Y-m-d H:i:s')]);
        $pdo->prepare("DELETE FROM page_revisions WHERE owner = ? AND id NOT IN (SELECT id FROM page_revisions WHERE owner = ? ORDER BY id DESC LIMIT " . (int)CC_REVISIONS_KEEP . ")")
            ->execute([$owner, $owner]);
    } catch (Exception $e) { /* history must never block a save */ }
}

// ---------------------------------------------------------------------------
// Redirects: old addresses of renamed pages/items (and ones added by hand) keep working.
// Paths are site paths like "/old-page/" or "/blog/old-post/" (no domain, with the trailing slash).
// ---------------------------------------------------------------------------
function cc_redirect_path($p) {
    $p = trim((string)$p);
    if ($p === '' || $p[0] !== '/') return null;
    $p = '/' . trim($p, '/') . '/';
    if ($p === '//') return null;                                   // the home page can't be redirected
    if (!preg_match('#^(/[a-z0-9][a-z0-9._-]*)+/$#i', $p) || strpos($p, '..') !== false) return null;
    $p = strtolower($p);
    if (cc_slug_reserved(explode('/', $p)[1])) return null;         // CanvasCore's own folders are never redirected
    return $p;
}
// Target: a site path, or a full http(s) address
function cc_redirect_target($t) {
    $t = trim((string)$t);
    if (preg_match('#^https?://[^\s"<>\\\\]+$#i', $t) && !preg_match('/[\x00-\x1f\x7f]/', $t)) return $t;
    if ($t === '/') return '/';
    return cc_redirect_path($t);
}
function cc_add_redirect($pdo, $from, $to, $auto = 1) {
    $from = cc_redirect_path($from); $to = cc_redirect_target($to);
    if (!$from || !$to || $from === $to) return false;
    $pdo->prepare("UPDATE redirects SET to_path = ? WHERE to_path = ?")->execute([$to, $from]);   // chains: A→B, B→C ⇒ A→C
    $pdo->prepare("DELETE FROM redirects WHERE from_path = ?")->execute([$to]);                   // something lives at $to now
    $pdo->prepare("DELETE FROM redirects WHERE from_path = to_path")->execute();
    $pdo->prepare("INSERT INTO redirects (from_path, to_path, auto, created_at) VALUES (?,?,?,?)
                   ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, auto = excluded.auto, created_at = excluded.created_at")
        ->execute([$from, $to, $auto ? 1 : 0, date('Y-m-d H:i:s')]);
    return true;
}
// A published page now owns this address: a redirect from it would hide the page
function cc_drop_redirect_from($pdo, $path) {
    $path = cc_redirect_path($path);
    if ($path) $pdo->prepare("DELETE FROM redirects WHERE from_path = ?")->execute([$path]);
}
// Take generated files offline at once (a deleted collection or item): the HTML a previous build wrote
// under $prefix ("blog/" or "blog/post/") is removed, plus the emptied folders. Only files listed in the
// publish manifest (or the item's own index.html / the collection's feed.xml) are touched, nothing else.
function cc_unpublish_files($data_dir, $prefix, $extra = []) {
    if (!preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/$#', $prefix) || strpos($prefix, '..') !== false) return 0;
    if (cc_slug_reserved(explode('/', $prefix)[0])) return 0;   // CanvasCore's own folders are never touched
    $root = realpath($GLOBALS['CC_SITE_ROOT'] ?? (__DIR__ . '/..'));   // overridable for tests
    if (!$root) return 0;
    $mfile = $data_dir . '/published_files.json';
    $manifest = file_exists($mfile) ? json_decode((string)@file_get_contents($mfile), true) : null;
    $list = is_array($manifest) ? $manifest : [];
    $targets = [];
    foreach (array_merge($list, $extra) as $rel) {
        if (!is_string($rel) || strpos($rel, $prefix) !== 0 || strpos($rel, '..') !== false) continue;
        if (!preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/(index\.html|feed\.xml)$#', $rel)) continue;
        $targets[$rel] = true;
    }
    $removed = 0;
    foreach (array_keys($targets) as $rel) {
        $fp = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        if (is_file($fp) && @unlink($fp)) {
            $removed++;
            $d = dirname($fp);   // the emptied folders: item folder, then collection folder
            for ($i = 0; $i < 2 && $d !== $root && @rmdir($d); $i++) $d = dirname($d);
        }
    }
    if (is_array($manifest) && $targets) {
        $left = array_values(array_filter($manifest, function ($rel) use ($targets) { return !isset($targets[$rel]); }));
        @file_put_contents($mfile, json_encode($left));
    }
    return $removed;
}
// A deleted item: its page goes offline, unless another published item of the collection owns the same address
function cc_unpublish_item($pdo, $data_dir, $item) {
    if (!$item || ($item['status'] ?? '') !== 'published') return 0;
    $cs = $pdo->prepare("SELECT slug FROM collections WHERE id = ?"); $cs->execute([$item['collection_id']]);
    $col_slug = cc_safe_slug((string)$cs->fetchColumn());
    $it_slug = cc_safe_slug((string)$item['slug']);
    if ($col_slug === '' || $it_slug === '') return 0;
    $other = $pdo->prepare("SELECT 1 FROM collection_items WHERE collection_id = ? AND status = 'published' AND slug = ? AND id <> ?");
    $other->execute([$item['collection_id'], $item['slug'], $item['id']]);
    if ($other->fetchColumn()) return 0;
    return cc_unpublish_files($data_dir, $col_slug . '/' . $it_slug . '/', [$col_slug . '/' . $it_slug . '/index.html']);
}

// Static redirect page written at the old address (works on any host); $href = where to go
function cc_redirect_page_html($href) {
    $h = htmlspecialchars($href, ENT_QUOTES);
    $j = json_encode($href, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    return "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"><title>Moved</title>"
         . "<meta name=\"robots\" content=\"noindex\"><link rel=\"canonical\" href=\"$h\">"
         . "<meta http-equiv=\"refresh\" content=\"0; url=$h\">"
         . "<script>location.replace($j + location.search + location.hash);</script></head>"
         . "<body><p>This page has moved: <a href=\"$h\">$h</a></p></body></html>\n";
}
// Apache: the redirects as real 301s, in a marked block of the site's .htaccess (the rest is left as it is)
function cc_htaccess_with_redirects($existing, $rules) {
    $begin = '# BEGIN CanvasCore redirects'; $end = '# END CanvasCore redirects';
    $existing = preg_replace('#\n?' . preg_quote($begin, '#') . '.*?' . preg_quote($end, '#') . '\n?#s', "\n", (string)$existing);
    $existing = rtrim($existing) . "\n";
    if (!$rules) return ltrim($existing);
    $block = $begin . "\n<IfModule mod_alias.c>\n";
    foreach ($rules as [$from, $to]) $block .= 'Redirect 301 ' . $from . ' ' . $to . "\n";
    $block .= "</IfModule>\n" . $end . "\n";
    return ltrim($existing . $block);
}

// An uploaded SVG is a document that can carry scripts: it is accepted only when everything in it is on an
// allowlist of plain drawing elements and attributes (no scripts, event handlers, animations of links, embedded
// HTML or MathML, external entities or style sheets, links other than to its own parts).
const CC_SVG_NS = 'http://www.w3.org/2000/svg';
const CC_SVG_ELEMENTS = ['svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata', 'path', 'rect', 'circle', 'ellipse',
    'line', 'polyline', 'polygon', 'text', 'tspan', 'textpath', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask',
    'pattern', 'marker', 'image', 'switch', 'style', 'filter', 'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix',
    'fecomponenttransfer', 'fefunca', 'fefuncr', 'fefuncg', 'fefuncb', 'fecomposite', 'feflood', 'femerge', 'femergenode',
    'femorphology', 'fedropshadow', 'feturbulence', 'fedisplacementmap', 'fetile', 'feimage', 'feconvolvematrix',
    'fediffuselighting', 'fespecularlighting', 'fedistantlight', 'fepointlight', 'fespotlight', 'animatetransform'];
// Editor metadata (Inkscape, Sodipodi, Illustrator, RDF/Dublin Core): inert in browsers, allowed
const CC_SVG_INERT_NS = ['http://www.inkscape.org/namespaces/inkscape', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'http://creativecommons.org/ns#', 'http://purl.org/dc/elements/1.1/',
    'http://ns.adobe.com/AdobeIllustrator/10.0/', 'http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/', 'http://ns.adobe.com/Extensibility/1.0/',
    'http://ns.adobe.com/Flows/1.0/', 'http://ns.adobe.com/ImageReplacement/1.0/', 'http://ns.adobe.com/GenericCustomNamespace/1.0/',
    'http://ns.adobe.com/XPath/1.0/', 'http://ns.adobe.com/SaveForWeb/1.0/', 'http://ns.adobe.com/Variables/1.0/',
    'http://ns.adobe.com/xap/1.0/', 'http://www.bohemiancoding.com/sketch/ns', 'http://www.figma.com/figma/ns'];
function cc_svg_url_ok($v, $allowImages) {
    $v = preg_replace('/[\x00-\x20\x7f]+/', '', $v);
    if ($v === '' || $v[0] === '#') return true;
    return $allowImages && (preg_match('#^data:image/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$#i', $v) || preg_match('#^https?://#i', $v));
}
function cc_svg_css_ok($css) {
    $p = strtolower(preg_replace('/[\x00-\x20\x7f]+|\/\*.*?\*\//s', '', html_entity_decode($css, ENT_QUOTES | ENT_HTML5)));
    if (strpos($p, '\\') !== false || strpos($p, '@import') !== false || strpos($p, 'expression(') !== false
        || strpos($p, 'javascript:') !== false || strpos($p, '-moz-binding') !== false || strpos($p, 'behavior:') !== false) return false;
    // url(...) only to the drawing's own parts: url(#id)
    return !preg_match('/url\((?![\'"]?#)/', $p);
}
function cc_svg_is_safe($path) {
    $svg = @file_get_contents($path);
    if ($svg === false || $svg === '' || strlen($svg) > 10 * 1048576) return false;
    if (preg_match('/<!ENTITY|<!DOCTYPE[^>]*\[/i', $svg)) return false;
    $probe = preg_replace('/[\x00-\x20\x7f]+/', '', strtolower($svg));
    foreach (['javascript:', 'vbscript:', 'livescript:', '<script', 'data:text', 'data:application', 'data:image/svg', '<?xml-stylesheet'] as $bad) {
        if (strpos($probe, $bad) !== false) return false;
    }
    if (!class_exists('DOMDocument')) return false;   // can't be checked properly without the DOM extension
    $dom = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $dom->loadXML($svg, LIBXML_NONET);
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    if (!$ok || !$dom->documentElement || $dom->documentElement->namespaceURI !== CC_SVG_NS || strtolower($dom->documentElement->localName) !== 'svg') return false;
    $xp = new DOMXPath($dom);
    // processing instructions (style sheets, XSLT) are not drawings
    if ($xp->query('//processing-instruction()')->length > 0) return false;
    foreach ($xp->query('//*') as $el) {
        $ns = (string)$el->namespaceURI; $name = strtolower($el->localName);
        if ($ns === CC_SVG_NS) {
            if (!in_array($name, CC_SVG_ELEMENTS, true)) return false;
            if ($name === 'style' && !cc_svg_css_ok($el->textContent)) return false;
        } elseif (in_array($ns, CC_SVG_INERT_NS, true)) {
            // metadata: its content is never rendered, but must not hide SVG or HTML elements
            foreach ($el->getElementsByTagName('*') as $sub) { if (!in_array((string)$sub->namespaceURI, CC_SVG_INERT_NS, true)) return false; }
        } else {
            return false;   // HTML, MathML or any other vocabulary
        }
        foreach ($el->attributes as $a) {
            $an = strtolower($a->localName); $ans = (string)$a->namespaceURI; $v = (string)$a->value;
            if (strpos($an, 'on') === 0) return false;                                   // event handlers
            if ($ans === 'http://www.w3.org/XML/1998/namespace' && $an === 'base') return false;
            if ($an === 'href' || $an === 'src') { if (!cc_svg_url_ok($v, in_array($name, ['image', 'feimage'], true))) return false; continue; }
            if (in_array($an, ['attributename', 'values', 'from', 'to', 'by', 'begin', 'end'], true) && $name !== 'animatetransform') return false;
            if ($an === 'style' && !cc_svg_css_ok($v)) return false;
            if (preg_match('/url\(/i', $v) && !cc_svg_css_ok($v)) return false;            // fill="url(#g)" only
        }
    }
    return true;
}

function cc_verify_csrf_or_die() {
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $sess = (string)($_SESSION['csrf'] ?? '');
    if ($sent !== '' && $sess !== '' && hash_equals($sess, $sent) && cc_same_origin_request()) return;
    http_response_code(403);
    die(json_encode(['success' => false, 'message' => 'Invalid CSRF token. Reload the page.']));
}

// ---------------------------------------------------------------------------
// Removal of "code" surfaces for non-admin users (server-side defense)
// ---------------------------------------------------------------------------
function cc_strip_code_surfaces(&$blocks) {
    if (!is_array($blocks)) return;
    foreach ($blocks as &$b) {
        if (!is_array($b)) continue;
        if (($b['type'] ?? '') === 'HTML') {
            if (isset($b['content']) && is_array($b['content'])) $b['content']['code'] = '';
        }
        if (isset($b['content']) && is_array($b['content'])) {
            unset($b['content']['customCss']);
            unset($b['content']['customJs']);
        }
        if (isset($b['children']) && is_array($b['children'])) {
            cc_strip_code_surfaces($b['children']);
        }
    }
    unset($b);
}

// Blocks that send what visitors write to an email address: that address is an admin setting (see cc_keep_code_surfaces,
// cc_redact_blocks)
const CC_FORM_BLOCKS = ['FORM', 'WIZARD', 'NEWSLETTER'];
// Non-admin save: the code an admin put in (Custom HTML blocks, custom CSS/JS, a form's receiving email) is KEPT as it was saved,
// matched by block id, instead of being wiped; an editor can't add or change code, only move or delete
// those blocks. $previous = the blocks currently stored (array or JSON string).
function cc_keep_code_surfaces(&$blocks, $previous) {
    if (is_string($previous)) $previous = json_decode($previous, true);
    $saved = [];
    $collect = function ($list) use (&$collect, &$saved) {
        if (!is_array($list)) return;
        foreach ($list as $b) {
            if (!is_array($b)) continue;
            if (isset($b['id']) && is_scalar($b['id'])) {
                $c = is_array($b['content'] ?? null) ? $b['content'] : [];
                $saved[(string)$b['id']] = ['type' => $b['type'] ?? '', 'code' => $c['code'] ?? null, 'customCss' => $c['customCss'] ?? null, 'customJs' => $c['customJs'] ?? null, 'email' => $c['email'] ?? null];
            }
            if (isset($b['children'])) $collect($b['children']);
        }
    };
    $collect(is_array($previous) ? $previous : []);
    $apply = function (&$list) use (&$apply, $saved) {
        if (!is_array($list)) return;
        foreach ($list as &$b) {
            if (!is_array($b)) continue;
            if (!isset($b['content']) || !is_array($b['content'])) $b['content'] = [];
            $old = (isset($b['id']) && is_scalar($b['id'])) ? ($saved[(string)$b['id']] ?? null) : null;
            if (($b['type'] ?? '') === 'HTML') {
                $b['content']['code'] = ($old && $old['type'] === 'HTML' && is_string($old['code'])) ? $old['code'] : '';
            }
            // A form's own receiving email is an admin setting too (where the site's messages go): Form and Multi-step Form
            if (in_array($b['type'] ?? '', CC_FORM_BLOCKS, true)) {
                $b['content']['email'] = ($old && $old['type'] === $b['type'] && is_string($old['email'])) ? $old['email'] : '';
            }
            foreach (['customCss', 'customJs'] as $k) {
                if ($old && is_string($old[$k]) && $old[$k] !== '') $b['content'][$k] = $old[$k]; else unset($b['content'][$k]);
            }
            if (isset($b['children'])) $apply($b['children']);
        }
        unset($b);
    };
    $apply($blocks);
}

// ---------------------------------------------------------------------------
// HTML sanitizer (allowlist) for rich-text content
// ---------------------------------------------------------------------------
// Inline styles in rich text: only plain typography and box properties (no positioning, no url(), no
// expressions or escapes), so text can't cover the page or load anything.
const CC_STYLE_PROPS = ['color', 'background-color', 'background', 'font-size', 'font-weight', 'font-style', 'font-family',
    'font-variant', 'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
    'text-transform', 'text-indent', 'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'vertical-align',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color',
    'border-style', 'border-width', 'border-radius', 'border-collapse', 'border-spacing', 'width', 'max-width', 'min-width',
    'height', 'max-height', 'min-height', 'display', 'float', 'clear', 'list-style', 'list-style-type', 'list-style-position',
    'opacity', 'box-shadow', 'table-layout', 'overflow-wrap', 'word-break', 'direction', 'unicode-bidi'];
function cc_sanitize_style($css) {
    $out = [];
    foreach (explode(';', html_entity_decode((string)$css, ENT_QUOTES | ENT_HTML5, 'UTF-8')) as $decl) {
        if (strpos($decl, ':') === false) continue;
        [$prop, $val] = array_map('trim', explode(':', $decl, 2));
        $prop = strtolower($prop);
        if (!in_array($prop, CC_STYLE_PROPS, true) || $val === '') continue;
        if (in_array($prop, ['color', 'background-color', 'background', 'border-color', 'text-decoration-color'], true) && cc_is_color_ref($val)) { $out[] = $prop . ': ' . trim($val); continue; }
        $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', $val));
        if (preg_match('/[\\\\<>@{}"`]|url\(|expression|javascript|vbscript|-moz-binding|behavior|image-set|var\(|env\(|attr\(/', $probe)) continue;
        if ($prop === 'display' && !in_array($probe, ['block', 'inline', 'inline-block', 'none', 'table', 'table-cell', 'table-row', 'list-item', 'flex', 'inline-flex'], true)) continue;
        $out[] = $prop . ': ' . preg_replace('/[\x00-\x1f\x7f]+/', '', $val);
    }
    return implode('; ', $out);
}

function cc_sanitize_html($html) {
    $html = (string)$html;
    if (trim($html) === '') return '';

    if (!class_exists('DOMDocument')) {
        // Without the DOM extension rich text can't be cleaned safely: only plain formatting tags survive, with
        // every attribute removed (links and images are lost until the extension is enabled; the installer requires it).
        $html = preg_replace('#<\s*(script|style|iframe|object|embed|noscript|template|textarea|title|xmp|svg|math)\b.*?<\s*/\s*\1\s*>#is', '', $html);
        $html = strip_tags($html, '<p><br><hr><b><strong><i><em><u><s><sub><sup><mark><small><ul><ol><li><blockquote><h1><h2><h3><h4><h5><h6><table><thead><tbody><tr><td><th><pre><code>');
        return preg_replace('#<(/?)([a-z0-9]+)\b[^>]*>#i', '<$1$2>', $html);
    }

    $allowedTags = array_flip([
        'p','br','hr','b','strong','i','em','u','s','strike','del','ins','mark','small','sub','sup',
        'ul','ol','li','a','span','div','section','article','blockquote','q','cite','abbr','code','pre','kbd','samp',
        'h1','h2','h3','h4','h5','h6','img','figure','figcaption','table','thead','tbody','tfoot','tr','td','th','caption','colgroup','col'
    ]);
    $allowedAttrs = array_flip([
        'href','src','alt','title','style','class','id','target','rel','colspan','rowspan','width','height','align','dir','lang','loading'
    ]);
    $dangerous = array_flip(['script','style','iframe','object','embed','link','meta','base','form','input','button','textarea','select','noscript','svg','math']);

    $dom = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $wrapped = '<?xml encoding="utf-8"?><div id="cc-root">' . $html . '</div>';
    $dom->loadHTML($wrapped, LIBXML_NOERROR | LIBXML_NONET | LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();

    $xp = new DOMXPath($dom);
    $root = $xp->query('//*[@id="cc-root"]')->item(0);
    if (!$root) return '';

    $clean = function ($node) use (&$clean, $allowedTags, $allowedAttrs, $dangerous, $dom) {
        $children = iterator_to_array($node->childNodes);
        foreach ($children as $child) {
            if ($child->nodeType === XML_ELEMENT_NODE) {
                $tag = strtolower($child->tagName);
                if (!isset($allowedTags[$tag])) {
                    if (isset($dangerous[$tag])) {
                        $node->removeChild($child); // remove tag and content
                    } else {
                        // tag not allowed but harmless: reduce it to its text
                        $node->replaceChild($dom->createTextNode($child->textContent), $child);
                    }
                    continue;
                }
                // attribute cleanup
                foreach (iterator_to_array($child->attributes) as $attr) {
                    $an = strtolower($attr->name);
                    $av = $attr->value;
                    $ok = isset($allowedAttrs[$an]);
                    if ($ok && ($an === 'href' || $an === 'src')) {
                        // Browsers ignore control characters, spaces, tabs and newlines inside a URL scheme
                        // ("\x1fjava\tscript:"): check the value without them, and store it without them too.
                        $probe = preg_replace('/[\x00-\x20\x7f]+/', '', $av);
                        if (preg_match('#^(javascript|vbscript|data|livescript)\s*:#i', $probe)) {
                            $ok = ($an === 'src' && preg_match('#^data:image/#i', $probe)); // allow only data:image in src
                        }
                        if ($ok) { $child->setAttribute($attr->name, trim(preg_replace('/[\x00-\x1f\x7f]+/', '', $av))); continue; }
                    }
                    if ($ok && $an === 'style') {
                        $av = cc_sanitize_style($av);
                        if ($av === '') $child->removeAttribute($attr->name); else $child->setAttribute('style', $av);
                        continue;
                    }
                    if ($ok && $an === 'target') { $ok = in_array(strtolower($av), ['_blank', '_self'], true); }
                    if ($ok && $an === 'id') { $ok = (bool)preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/', $av) && $av !== 'cc-root'; }
                    if (!$ok) $child->removeAttribute($attr->name);
                }
                // A link opened in a new tab can't reach back to this page
                if ($tag === 'a' && strtolower($child->getAttribute('target')) === '_blank') $child->setAttribute('rel', 'noopener noreferrer');
                $clean($child);
            } elseif ($child->nodeType === XML_COMMENT_NODE) {
                $node->removeChild($child);
            }
        }
    };
    $clean($root);

    $out = '';
    foreach ($root->childNodes as $c) $out .= $dom->saveHTML($c);
    // libxml percent-encodes the braces of an address ("{{BASE_URL}}about/", what the link dialog inserts): restore the placeholder
    return str_replace('%7B%7BBASE_URL%7D%7D', '{{BASE_URL}}', $out);
}


// Rich-text fields of each block type (the same ones the compiler sanitizes). Cleaned when content is SAVED too,
// not only when it is published: the editor shows saved content as HTML, so it must never hold active code.
const CC_RICH_FIELDS = ['TEXT' => ['text'], 'HERO' => ['title', 'subtitle'], 'IMAGE_TEXT' => ['text'], 'FORM' => ['title'],
    'CALLOUT' => ['text'], 'GRID' => ['items[]'], 'CARDS' => ['items[]'], 'ACCORDION' => ['items[].content'], 'TABS' => ['items[].content']];
function cc_sanitize_blocks(&$blocks) {
    if (!is_array($blocks)) return;
    // a single block (masters, templates) or a list of blocks
    if (isset($blocks['type']) && is_string($blocks['type'])) { $one = [&$blocks]; cc_sanitize_blocks($one); return; }
    foreach ($blocks as &$b) {
        if (!is_array($b)) continue;
        $fields = CC_RICH_FIELDS[$b['type'] ?? ''] ?? (function_exists('cc_pkg_rich_fields') ? cc_pkg_rich_fields((string)($b['type'] ?? '')) : []);
        if ($fields && isset($b['content']) && is_array($b['content'])) {
            // A rich-text value is text: anything else (an array, an object) is dropped, never stored unchecked
            $rich = function ($v) { return is_string($v) ? cc_sanitize_html($v) : (is_int($v) || is_float($v) ? (string)$v : ''); };
            foreach ($fields as $f) {
                if (substr($f, -2) === '[]') {
                    $k = substr($f, 0, -2);
                    if (!array_key_exists($k, $b['content'])) continue;
                    if (!is_array($b['content'][$k])) { $b['content'][$k] = []; continue; }
                    foreach ($b['content'][$k] as &$it) $it = $rich($it);
                    unset($it);
                } elseif (strpos($f, '[].') !== false) {
                    [$k, $sub] = explode('[].', $f, 2);
                    if (!array_key_exists($k, $b['content'])) continue;
                    if (!is_array($b['content'][$k])) { $b['content'][$k] = []; continue; }
                    foreach ($b['content'][$k] as &$it) { if (!is_array($it)) { $it = []; continue; } if (array_key_exists($sub, $it)) $it[$sub] = $rich($it[$sub]); }
                    unset($it);
                } elseif (array_key_exists($f, $b['content'])) {
                    $b['content'][$f] = $rich($b['content'][$f]);
                }
            }
        }
        // Any other value that is an active URL (javascript:, vbscript:, data:text…) is blanked: link and image fields
        // are checked again when rendered, this keeps them out of storage too. Admin code fields are left alone.
        if (isset($b['content']) && is_array($b['content'])) cc_scrub_urls($b['content']);
        if (isset($b['children']) && is_array($b['children'])) cc_sanitize_blocks($b['children']);
    }
    unset($b);
}
function cc_scrub_urls(array &$node) {
    foreach ($node as $k => &$v) {
        if (in_array($k, ['code', 'customCss', 'customJs'], true)) continue;
        if (is_array($v)) { cc_scrub_urls($v); continue; }
        if (!is_string($v) || $v === '') continue;
        $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        if (preg_match('/^(javascript|vbscript|livescript|data:(text|application)|data:image\/svg)/', $probe)) $v = '';
    }
    unset($v);
}
// The same for a stored content_json (JSON text): returns the cleaned JSON, or the input when it isn't JSON
function cc_sanitize_content_json($json) {
    $data = json_decode((string)$json, true);
    if (!is_array($data)) return $json;
    cc_sanitize_blocks($data);
    return json_encode($data);
}
// Every stored content (after a restore or an import, and once on update): pages, items, header/footer, masters,
// templates and the version history.
function cc_sanitize_all_content($pdo) {
    foreach ([['pages', 'id'], ['collection_items', 'id'], ['site_parts', 'name'], ['master_components', 'id'], ['templates', 'id'], ['page_revisions', 'id']] as [$table, $key]) {
        try { $rows = $pdo->query("SELECT $key AS k, content_json FROM $table")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) { continue; }
        $up = $pdo->prepare("UPDATE $table SET content_json = ? WHERE $key = ?");
        foreach ($rows as $r) {
            $clean = cc_sanitize_content_json($r['content_json']);
            if ($clean !== $r['content_json'] && json_decode((string)$clean, true) != json_decode((string)$r['content_json'], true)) $up->execute([$clean, $r['k']]);
        }
    }
}
// What an editor may read of stored content: a form's own receiving email is an admin setting (kept on save by
// cc_keep_code_surfaces), so it is blanked in what editors receive.
function cc_redact_blocks(&$blocks) {
    if (!is_array($blocks)) return;
    if (isset($blocks['type']) && is_string($blocks['type'])) { $one = [&$blocks]; cc_redact_blocks($one); return; }
    foreach ($blocks as &$b) {
        if (!is_array($b)) continue;
        if (in_array($b['type'] ?? '', CC_FORM_BLOCKS, true) && isset($b['content']) && is_array($b['content']) && array_key_exists('email', $b['content'])) $b['content']['email'] = '';
        if (isset($b['children']) && is_array($b['children'])) cc_redact_blocks($b['children']);
    }
    unset($b);
}
function cc_redact_content_json($json) {
    $data = json_decode((string)$json, true);
    if (!is_array($data)) return $json;
    cc_redact_blocks($data);
    return json_encode($data);
}

// ---------------------------------------------------------------------------
// Session: deterministic INACTIVITY timeout (the server is the only authority)
// ---------------------------------------------------------------------------
// Expiry used to depend on PHP's garbage collector (probabilistic, ~24 min):
// unpredictable for the user and the client. Now every authenticated request updates
// $_SESSION['last_seen'] and the session expires exactly after N minutes without activity.
define('CC_SESSION_DEFAULT_MINUTES', 30);

function cc_session_limit() {
    static $limit = null;
    if ($limit !== null) return $limit;
    $min = CC_SESSION_DEFAULT_MINUTES;
    $f = cc_data_dir() . '/settings.json';
    if (is_readable($f)) {
        $st = json_decode(@file_get_contents($f), true);
        if (is_array($st) && isset($st['sessionTimeoutMinutes']) && is_numeric($st['sessionTimeoutMinutes'])) {
            $min = (int)$st['sessionTimeoutMinutes'];
        }
    }
    $min = max(5, min(720, $min));   // 5 minutes .. 12 hours
    return $limit = $min * 60;
}

function cc_session_is_logged_in() {
    return !empty($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
}

// Record user activity: extends the session.
function cc_session_touch() {
    $_SESSION['last_seen'] = time();
}

// Seconds left before expiry (null if not logged in). Does NOT modify the session.
function cc_session_expires_in() {
    if (!cc_session_is_logged_in()) return null;
    $last = (int)($_SESSION['last_seen'] ?? time());
    return max(0, cc_session_limit() - (time() - $last));
}

// Uniform 401 response for unauthenticated or expired requests.
function cc_unauthorized($message = 'Unauthorized.') {
    http_response_code(401);
    header('Content-Type: application/json');
    die(json_encode([
        'success' => false,
        'message' => $message,
        'code' => !empty($GLOBALS['CC_SESSION_EXPIRED']) ? 'session_expired' : 'auth_required',
    ]));
}

function cc_session_configure() {
    static $done = false;
    if ($done) return; $done = true;
    $limit = cc_session_limit();
    // Dedicated session folder (inside the data dir, protected): isolated from the server's other
    // applications, whose GC could otherwise delete our sessions too early.
    // If it is not writable, fall back to PHP's default path.
    $dir = cc_data_dir() . '/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && cc_can_write($dir)) session_save_path($dir);

    ini_set('session.gc_maxlifetime', (string)max(86400, $limit * 2)); // the GC must never get ahead of our own check
    ini_set('session.gc_probability', '1');                            // active cleanup even where the system GC is turned off
    ini_set('session.gc_divisor', '50');
    ini_set('session.use_strict_mode', '1');                           // do not adopt unknown session IDs
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    session_name('CCSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => cc_is_https(),
    ]);
}
// Starts the session (sign-in, installer). Requests without a session cookie don't create one: a visitor, a form
// on the site or the sign-in screen never leave a session file behind.
function cc_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    cc_session_configure();
    @session_start();
}

function cc_boot_session() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (PHP_SAPI === 'cli') return;
    cc_session_configure();
    if (empty($_COOKIE[session_name()])) return;   // no session yet: nothing to resume
    $limit = cc_session_limit();
    @session_start();

    $GLOBALS['CC_SESSION_EXPIRED'] = false;
    if (cc_session_is_logged_in()) {
        if (!isset($_SESSION['last_seen'])) {
            $_SESSION['last_seen'] = time();             // session created before this update
        } elseif (time() - (int)$_SESSION['last_seen'] > $limit) {
            $_SESSION = [];                              // expired due to inactivity
            @session_regenerate_id(true);
            $GLOBALS['CC_SESSION_EXPIRED'] = true;
        } elseif (time() - (int)($_SESSION['started'] ?? time()) > 7 * 86400) {
            $_SESSION = [];                              // absolute limit: a week after signing in
            @session_regenerate_id(true);
            $GLOBALS['CC_SESSION_EXPIRED'] = true;
        }
    }
}

// Signs the user in on this session (api.php login, installer)
function cc_session_login(array $user) {
    cc_session_start();
    session_regenerate_id(true);                         // session fixation mitigation
    $_SESSION = [];
    $_SESSION['logged_in'] = true;
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['username'] = (string)$user['username'];
    $_SESSION['role'] = $user['role'] === 'admin' ? 'admin' : 'editor';
    $_SESSION['gen'] = (int)($user['session_gen'] ?? 0);
    $_SESSION['started'] = time();
    $_SESSION['last_seen'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function cc_session_logout() {
    if (session_status() !== PHP_SESSION_ACTIVE) return;
    $_SESSION = [];
    if (!headers_sent()) {
        $p = session_get_cookie_params();
        @setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'samesite' => 'Lax', 'secure' => $p['secure'], 'httponly' => true]);
    }
    @session_destroy();
}
// The signed-in account must still exist, unchanged: a deleted account, a password reset or a password change
// elsewhere ends its other sessions at once. The role always comes from the database. Returns the account row
// (id, username, role, must_change_pw), or null after logging the session out.
function cc_session_account($pdo) {
    if (!cc_session_is_logged_in()) return null;
    try {
        if (!empty($_SESSION['user_id'])) {
            $st = $pdo->prepare("SELECT id, username, role, must_change_pw, session_gen FROM admin WHERE id = ?");
            $st->execute([(int)$_SESSION['user_id']]);
        } else {   // a session from before this update: matched by name once
            $st = $pdo->prepare("SELECT id, username, role, must_change_pw, session_gen FROM admin WHERE username = ?");
            $st->execute([(string)($_SESSION['username'] ?? '')]);
        }
        $u = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) { $u = false; }
    if (!$u || $u['username'] !== ($_SESSION['username'] ?? null) || (!empty($_SESSION['user_id']) && (int)$u['session_gen'] !== (int)($_SESSION['gen'] ?? -1))) {
        cc_session_logout();
        return null;
    }
    $_SESSION['user_id'] = (int)$u['id'];
    $_SESSION['gen'] = (int)$u['session_gen'];
    $_SESSION['role'] = $u['role'] === 'admin' ? 'admin' : 'editor';
    return $u;
}

cc_boot_session();

// What the sign-in screen may know about the site before login (api.php?action=branding): the site name and
// the favicon address, nothing else. A favicon that is not an http(s), root or plain relative address is dropped.
function cc_public_branding(array $settings) {
    $fav = trim((string)($settings['faviconUrl'] ?? ''));
    if ($fav !== '' && !preg_match('~^(https?://|/(?!/)|[A-Za-z0-9._-][A-Za-z0-9._/-]*$)~i', $fav)) $fav = '';
    return ['siteName' => mb_substr(trim((string)($settings['siteName'] ?? '')), 0, 120), 'faviconUrl' => $fav];
}

// Demo mode: on only when <data dir>/demo.json exists (never in a normal installation). The file holds the public
// demo login, the reset interval shown on the sign-in screen and in the editor, and how many pages and collection
// items visitors may create; while on, passwords and uploads are locked, form mails are not sent and the site is
// not indexed. $override: the config to use (tests); null reads the file.
function cc_demo_config($override = null) {
    static $demo = false;
    if ($override !== null) $demo = $override ?: null;
    if ($demo === false) {
        $raw = @json_decode((string)@file_get_contents(cc_data_dir() . '/demo.json'), true);
        $demo = is_array($raw) && trim((string)($raw['username'] ?? '')) !== ''
            ? ['username' => (string)$raw['username'], 'password' => (string)($raw['password'] ?? ''), 'resetMinutes' => max(1, min(60, (int)($raw['resetMinutes'] ?? 10))),
               'maxNewPages' => max(0, (int)($raw['maxNewPages'] ?? 5)), 'maxNewItems' => max(0, (int)($raw['maxNewItems'] ?? 5))]
            : null;
    }
    return $demo;
}
function cc_demo_on() { return cc_demo_config() !== null; }

// Seconds until the next reset, for a scheduled task with the crontab line "*/<resetMinutes> * * * *" on this server
function cc_demo_next_reset($now = null) {
    $m = cc_demo_config()['resetMinutes'] ?? 10;
    $now = $now ?? time();
    $into = (int)date('i', $now) * 60 + (int)date('s', $now);
    return min((intdiv((int)date('i', $now), $m) + 1) * $m * 60, 3600) - $into;
}

// Demo mode: takes one of the new pages ('pages') or collection items ('items') visitors may create until the next
// reset. False when none is left. The count is kept in <data dir>/demo-usage.json, which the reset wipes.
function cc_demo_take($kind) {
    $demo = cc_demo_config();
    if (!$demo) return true;
    $limit = $kind === 'pages' ? $demo['maxNewPages'] : $demo['maxNewItems'];
    $h = @fopen(cc_data_dir() . '/demo-usage.json', 'c+');
    if (!$h) return false;
    flock($h, LOCK_EX);
    $used = json_decode((string)stream_get_contents($h), true);
    if (!is_array($used)) $used = [];
    $ok = (int)($used[$kind] ?? 0) < $limit;
    if ($ok) {
        $used[$kind] = (int)($used[$kind] ?? 0) + 1;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode($used)); fflush($h);
    }
    flock($h, LOCK_UN); fclose($h);
    return $ok;
}

