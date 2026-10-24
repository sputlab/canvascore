<?php
// canvascore-admin/blockpkg.php
// Block packages: third-party blocks installed from a ZIP, by an admin. A package is DECLARATIVE: it holds block
// definitions (settings, template, panel: the format of blocks/*.json, see blockdef.php), optionally a style sheet
// and images. It holds no code that runs on the server or in the page, so what it can do is limited by construction:
//
//   package.json     id, name, version, author, description, homepage, license, minVersion
//   blocks/<n>.json  one block: name, catalog (label, icon, keywords, color), defaults (content, styles), settings,
//                    template, panel, rootStyleOmit, renderIf, tests
//   style.css        optional; every rule is confined to the package's blocks (nested under .cc-pkg-<id>)
//   assets/…         images (png, jpg, gif, webp, avif, svg), published to canvascore-blocks/<id>/
//   README.md, LICENSE   allowed, not installed
//
// An install is refused unless: the layout, sizes and file names are safe; the manifest and every block definition
// are valid (no `code` settings, no scripts, no widgets, only known transforms); the static HTML of every template
// has no script, frame, form, style, event attribute or active URL; the style sheet has no @import, escape or external
// url(); every image is an image; the package's own tests pass; and a fuzz of hostile values through every setting
// produces no script, event attribute or active URL in the rendered page. Installed files live in the data folder
// (packages/<id>/), the images are copied to <site>/canvascore-blocks/<id>/. Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/blockdef.php';

const CC_PKG_MAX_ZIP = 5 * 1048576;
const CC_PKG_MAX_FILE = 2 * 1048576;
const CC_PKG_MAX_UNPACKED = 10 * 1048576;
const CC_PKG_MAX_ENTRIES = 200;
const CC_PKG_MAX_BLOCKS = 12;
const CC_PKG_MAX_CSS = 40960;
const CC_PKG_MAX_DEF = 65536;
const CC_PKG_MAX_TESTS = 20;
const CC_PKG_SETTING_TYPES = ['text', 'richtext', 'number', 'bool', 'enum', 'color', 'image', 'list', 'object', 'choices', 'calc', 'flag'];
const CC_PKG_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'];
const CC_PKG_BLOCK_KEYS = ['name', 'catalog', 'defaults', 'settings', 'template', 'panel', 'rootStyleOmit', 'renderIf', 'tests'];
const CC_PKG_BUILTINS = ['_id', '_classes', '_style', '_field', '_script', '_lb', '_rb', '_base', '_editing', '_assets'];

// ---------------------------------------------------------------------------------------------- places
function cc_pkg_dir() { $d = $GLOBALS['CC_PACKAGES_DIR'] ?? (cc_data_dir() . '/packages'); return $d; }
function cc_pkg_site_dir() { return rtrim((string)($GLOBALS['CC_SITE_ROOT'] ?? (__DIR__ . '/..')), '/') . '/canvascore-blocks'; }
function cc_pkg_type($id, $name) { return 'X_' . strtoupper(str_replace('-', '_', $id)) . '__' . strtoupper(str_replace('-', '_', $name)); }
function cc_pkg_rrmdir($dir) {
    if (!is_dir($dir) || is_link($dir)) { if (file_exists($dir) || is_link($dir)) @unlink($dir); return; }
    foreach (array_diff(scandir($dir) ?: [], ['.', '..']) as $f) cc_pkg_rrmdir($dir . '/' . $f);
    @rmdir($dir);
}

// ---------------------------------------------------------------------------------------------- static checks
// A problem with HTML that is written in a package (template text, option data): returns a sentence, or null
function cc_pkg_html_problem($html) {
    $s = preg_replace('/\{\{\{?[^}]*\}?\}\}/', "\x01", (string)$html);   // template tags are values, checked when rendered
    $decoded = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    foreach ([$s, $decoded] as $t) {
        if (preg_match('/<\s*(script|style|iframe|frame|frameset|object|embed|applet|link|meta|base|form|math|template|portal|noscript|xml|title)\b/i', $t, $m)) return 'it uses <' . strtolower($m[1]) . '> (scripts, styles, frames and forms are not allowed in a package: put CSS in style.css)';
        if (preg_match('/[\s"\'\/\x01]on[a-z]{2,}\s*=/i', $t)) return 'it has an event attribute (onclick, onerror…)';
        if (preg_match('/\b(srcdoc|formaction)\s*=/i', $t)) return 'it uses srcdoc or formaction';
        if (preg_match('/(-moz-binding|behavior\s*:|expression\s*\()/i', $t)) return 'it has active CSS (expression, behavior, -moz-binding)';
        if (preg_match('/@import/i', $t)) return 'it uses @import';
    }
    $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', $decoded));
    foreach (['javascript:', 'vbscript:', 'livescript:', 'data:text', 'data:application', 'data:image/svg'] as $bad) {
        if (strpos($probe, $bad) !== false) return 'it has an active address (' . $bad . ')';
    }
    return null;
}
// One selector of the package's CSS, as written inside the package's nesting rule `.cc-pkg-<id>{ … }`. Without `&` it is a
// descendant of the block (`.title` means `.cc-pkg-x .title`); `&` is the block's own element. To stay inside the block, `&`
// may only begin a selector (so `html:has(&)`, `body &` and `:not(&)` are out), and a selector that starts with `&` or a
// sibling combinator may not go to the block's siblings (`& + .x`, `&.a ~ .b`, `+ .x`).
function cc_pkg_selector_problem($sel) {
    $sel = trim($sel);
    if ($sel === '') return 'an empty selector';
    if ($sel[0] === '+' || $sel[0] === '~') return 'a selector that starts with + or ~ (it would reach the block\'s neighbours)';
    if (strpos($sel, '&') === false) return null;
    if ($sel[0] !== '&' || substr_count($sel, '&') > 1) return 'a selector with & anywhere but at its start (& is the block itself: write &.class, or & .child)';
    $depth = 0; $n = strlen($sel);
    for ($i = 1; $i < $n; $i++) {
        $c = $sel[$i];
        if ($c === '(' || $c === '[') $depth++;
        elseif ($c === ')' || $c === ']') $depth--;
        elseif ($depth === 0 && ($c === '+' || $c === '~')) return 'a selector that goes from the block to its siblings (& + .x, &.a ~ .b)';
        elseif ($depth === 0 && ($c === '>' || ctype_space($c))) break;   // the first combinator decides: a child or a descendant stays inside
    }
    if (preg_match('/^&[^\s>]*\s*[+~]/', $sel)) return 'a selector that goes from the block to its siblings (& + .x, &.a ~ .b)';
    return null;
}
// Every rule prelude of a style sheet (at any depth) must be a safe selector list (or an allowed at-rule, checked apart)
function cc_pkg_css_selectors_problem($plain) {
    $t = preg_replace('/url\([^)]*\)/i', 'url()', $plain);
    $t = preg_replace('/"[^"]*"|\'[^\']*\'/', '""', $t);
    $prelude = '';
    for ($i = 0, $n = strlen($t); $i < $n; $i++) {
        $c = $t[$i];
        if ($c === '{') {
            $pre = trim($prelude);
            if ($pre !== '' && $pre[0] !== '@') {
                $depth = 0; $cur = ''; $list = [];
                for ($j = 0, $m = strlen($pre); $j < $m; $j++) {
                    $d = $pre[$j];
                    if ($d === '(' || $d === '[') $depth++; elseif ($d === ')' || $d === ']') $depth--;
                    if ($d === ',' && $depth === 0) { $list[] = $cur; $cur = ''; } else $cur .= $d;
                }
                $list[] = $cur;
                foreach ($list as $one) if ($p = cc_pkg_selector_problem($one)) return 'style.css has ' . $p . ': ' . mb_substr(trim($one), 0, 60);
            }
            $prelude = '';
        } elseif ($c === '}' || $c === ';') $prelude = '';
        else $prelude .= $c;
    }
    return null;
}
// A problem with the package's style sheet: a sentence, or null
function cc_pkg_css_problem($css) {
    if (strlen($css) > CC_PKG_MAX_CSS) return 'style.css is larger than ' . (CC_PKG_MAX_CSS / 1024) . ' KB';
    if (!preg_match('//u', $css)) return 'style.css is not UTF-8';
    if (strpos($css, '<') !== false || strpos($css, "\0") !== false) return 'style.css has a "<" or a NUL character';
    if (strpos($css, '\\') !== false) return 'style.css has a backslash (CSS escapes are not allowed)';
    $plain = preg_replace('~/\*.*?\*/~s', '', $css);
    if (substr_count($plain, '{') !== substr_count($plain, '}')) return 'style.css has unbalanced braces';
    if (preg_match('/(expression\s*\(|-moz-binding|behavior\s*:|javascript\s*:|vbscript\s*:)/i', $plain)) return 'style.css has active CSS or an active address';
    if ($p = cc_pkg_css_selectors_problem($plain)) return $p;
    if (preg_match_all('/@([a-z-]+)/i', $plain, $m)) {
        foreach ($m[1] as $at) if (!in_array(strtolower($at), ['media', 'supports', 'container'], true)) return "style.css uses @$at: only @media, @supports and @container are allowed (rules are nested under the package's class)";
    }
    if (preg_match_all('/url\(\s*([^)]*)\)/i', $plain, $m)) {
        foreach ($m[1] as $u) {
            $u = trim($u, " \t\n\r\"'");
            if (!preg_match('~^(__ASSETS__/[A-Za-z0-9._/-]+|data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$~', $u)) return 'style.css has a url() that is not an image of the package (write url(__ASSETS__/file.png))';
        }
    }
    return null;
}

// ---------------------------------------------------------------------------------------------- definition checks
function cc_pkg_check_regex($p) {
    if (!is_string($p) || $p === '' || strlen($p) > 200) return false;
    if (preg_match('/(\+|\*|\{\d+,?\d*\})\s*\)\s*(\+|\*|\{)/', $p)) return false;   // nested quantifiers (catastrophic backtracking)
    return @preg_match('~' . str_replace('~', '\~', $p) . '~u', '') !== false;
}
// Problems with one setting (recursive); appends sentences to $errs
function cc_pkg_check_setting($name, $s, $where, array &$errs, $depth = 0) {
    $w = "$where.$name";
    if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,40}$/', (string)$name)) { $errs[] = "$w: a setting name is a letter followed by letters, digits or _"; return; }
    if (!is_array($s) || !is_string($s['type'] ?? null) || !in_array($s['type'], CC_PKG_SETTING_TYPES, true)) {
        $errs[] = "$w: type must be one of " . implode(', ', CC_PKG_SETTING_TYPES) . ' (a code setting is not allowed in a package)'; return;
    }
    if ($depth > 3) { $errs[] = "$w: settings are nested too deep"; return; }
    foreach (['key'] as $k) if (isset($s[$k]) && !preg_match('/^[A-Za-z][A-Za-z0-9_]{0,40}$/', (string)$s[$k])) $errs[] = "$w: bad $k";
    if (isset($s['from']) && $s['from'] !== 'styles') $errs[] = "$w: from can only be \"styles\"";
    if (isset($s['control']) && (!is_string($s['control']) || strpos($s['control'], 'widget:') === 0)) $errs[] = "$w: widgets are not available to packages";
    foreach ((array)($s['transform'] ?? []) as $tf) {
        if (!is_string($tf) || !isset(CC_TPL_TRANSFORMS[$tf])) $errs[] = "$w: unknown transform " . json_encode($tf);
    }
    if (isset($s['pattern']) && !cc_pkg_check_regex($s['pattern'])) $errs[] = "$w: the pattern is not a short, safe regular expression";
    if (isset($s['options'])) {
        if (!is_array($s['options']) || count($s['options']) > 50) { $errs[] = "$w: options must be a list of at most 50"; }
        else foreach ($s['options'] as $o) {
            if (!is_array($o) || !is_string($o['value'] ?? null)) { $errs[] = "$w: every option needs a text value"; continue; }
            foreach ((array)($o['data'] ?? []) as $dv) {
                if (!is_string($dv)) { $errs[] = "$w: option data must be text"; continue; }
                if ($p = cc_pkg_html_problem($dv)) $errs[] = "$w: option data: $p";
            }
        }
    }
    if (isset($s['item'])) {
        if (!is_array($s['item'])) $errs[] = "$w: item must be an object of settings";
        else foreach ($s['item'] as $n => $sub) cc_pkg_check_setting($n, $sub, $w . '.item', $errs, $depth + 1);
    }
    if (isset($s['of'])) cc_pkg_check_setting('of', $s['of'], $w, $errs, $depth + 1);
    // every string of the setting that could reach the page unescaped (a repeat transform's text, option data)
    array_walk_recursive($s, function ($v, $k) use ($w, &$errs) {
        if (is_string($v) && ($p = cc_pkg_html_problem($v))) $errs[] = "$w: $p";
    });
}
// A block file → problems. $b: the decoded file
function cc_pkg_check_block($b, $file, array &$errs) {
    $w = $file;
    if (!is_array($b)) { $errs[] = "$w: not a JSON object"; return null; }
    foreach (array_keys($b) as $k) if (!in_array($k, CC_PKG_BLOCK_KEYS, true)) $errs[] = "$w: unknown key \"$k\"" . ($k === 'script' || $k === 'type' ? ' (a package block has no script, and its type is made from the package and block names)' : '');
    $name = $b['name'] ?? '';
    if (!is_string($name) || !preg_match('/^[a-z][a-z0-9-]{1,30}$/', $name)) { $errs[] = "$w: name must be lowercase letters, digits and dashes (2–31 characters)"; return null; }
    if (strlen(json_encode($b)) > CC_PKG_MAX_DEF) $errs[] = "$w: the definition is larger than " . (CC_PKG_MAX_DEF / 1024) . ' KB';
    $cat = $b['catalog'] ?? null;
    if (!is_array($cat) || !is_string($cat['label'] ?? null) || trim($cat['label']) === '' || mb_strlen($cat['label']) > 40) $errs[] = "$w: catalog.label is required (at most 40 characters)";
    if (is_array($cat)) {
        if (isset($cat['icon']) && !preg_match('/^[A-Za-z0-9]{1,30}$/', (string)$cat['icon'])) $errs[] = "$w: catalog.icon is the name of an icon";
        if (isset($cat['keywords']) && (!is_string($cat['keywords']) || mb_strlen($cat['keywords']) > 120)) $errs[] = "$w: catalog.keywords is text of at most 120 characters";
        if (isset($cat['color']) && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$cat['color'])) $errs[] = "$w: catalog.color is a #rrggbb colour";
    }
    $defs = $b['defaults'] ?? [];
    if (!is_array($defs) || strlen(json_encode($defs)) > 16384) $errs[] = "$w: defaults must be an object of at most 16 KB";
    foreach (['content', 'styles'] as $k) if (isset($defs[$k]) && !is_array($defs[$k])) $errs[] = "$w: defaults.$k must be an object";
    $settings = $b['settings'] ?? null;
    if (!is_array($settings)) $errs[] = "$w: settings must be an object";
    else foreach ($settings as $n => $s) cc_pkg_check_setting($n, $s, $w . '.settings', $errs);
    $tpl = $b['template'] ?? null;
    $text = is_array($tpl) ? implode('', array_map('strval', $tpl)) : (is_string($tpl) ? $tpl : null);
    if ($text === null) { $errs[] = "$w: template is required (a text, or a list of texts)"; return $name; }
    if (strlen($text) > CC_PKG_MAX_DEF) $errs[] = "$w: the template is larger than " . (CC_PKG_MAX_DEF / 1024) . ' KB';
    try { cc_tpl_parse($text); } catch (Throwable $e) { $errs[] = "$w: template: " . $e->getMessage(); }
    foreach (['{{_id}}', '{{_classes}}'] as $must) if (strpos($text, $must) === false) $errs[] = "$w: the template must use $must (on its root element: the block's id and its classes)";
    if (preg_match('/\{\{\{?\s*_script/', $text)) $errs[] = "$w: a package block has no script";
    if ($p = cc_pkg_html_problem($text)) $errs[] = "$w: template: $p";
    if (isset($b['renderIf']) && !isset($settings[$b['renderIf']])) $errs[] = "$w: renderIf names no setting";
    foreach ((array)($b['rootStyleOmit'] ?? []) as $k) if (!is_string($k) || !preg_match('/^[A-Za-z]{1,40}$/', $k)) $errs[] = "$w: rootStyleOmit is a list of style names";
    if (isset($b['panel'])) {
        if (!is_array($b['panel'])) $errs[] = "$w: panel must be a list of sections";
        else foreach ($b['panel'] as $g) {
            if (!is_array($g) || !is_string($g['title'] ?? null)) { $errs[] = "$w: every panel section needs a title"; continue; }
            if (isset($g['widget'])) $errs[] = "$w: panel widgets are not available to packages";
            foreach ((array)($g['keys'] ?? []) as $k) if (!is_array($settings) || !isset($settings[$k])) $errs[] = "$w: panel section \"{$g['title']}\" shows \"$k\", which is not a setting";
        }
    }
    $tests = $b['tests'] ?? [];
    if (!is_array($tests) || count($tests) > CC_PKG_MAX_TESTS) $errs[] = "$w: tests is a list of at most " . CC_PKG_MAX_TESTS;
    return $name;
}
function cc_pkg_check_manifest($m, array &$errs) {
    if (!is_array($m)) { $errs[] = 'package.json: not a JSON object'; return null; }
    $id = $m['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-z][a-z0-9-]{1,30}$/', $id)) $errs[] = 'package.json: id must be lowercase letters, digits and dashes (2–31 characters)';
    if (!is_string($m['name'] ?? null) || trim($m['name']) === '' || mb_strlen($m['name']) > 80) $errs[] = 'package.json: name is required (at most 80 characters)';
    if (!is_string($m['version'] ?? null) || !preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', $m['version'])) $errs[] = 'package.json: version must look like 1.2.3';
    foreach (['author' => 80, 'description' => 300, 'license' => 40] as $k => $max) if (isset($m[$k]) && (!is_string($m[$k]) || mb_strlen($m[$k]) > $max)) $errs[] = "package.json: $k is text of at most $max characters";
    if (isset($m['homepage']) && (!is_string($m['homepage']) || !preg_match('~^https://[^\s"<>]{3,190}$~i', $m['homepage']))) $errs[] = 'package.json: homepage must be an https:// address';
    if (isset($m['minVersion'])) {
        if (!is_string($m['minVersion']) || !preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', $m['minVersion'])) $errs[] = 'package.json: minVersion must look like 0.22.0';
        else { $app = $GLOBALS['CC_PKG_APP_VERSION'] ?? cc_version()['app'];   // overridable for tests
            if (version_compare($app, $m['minVersion'], '<')) $errs[] = 'This package needs CanvasCore ' . $m['minVersion'] . ' or newer (this is ' . $app . ').'; }
    }
    return is_string($id) ? $id : null;
}

// ---------------------------------------------------------------------------------------------- the package as a whole
// A definition as the engines read it: type, the block's own keys and the package id
function cc_pkg_def($pkgId, array $b) {
    $def = ['type' => cc_pkg_type($pkgId, $b['name']), 'settings' => $b['settings'], 'template' => $b['template'], 'panel' => $b['panel'] ?? [], '_pkg' => $pkgId];
    foreach (['rootStyleOmit', 'renderIf'] as $k) if (isset($b[$k])) $def[$k] = $b[$k];
    return $def;
}
// Reads a package ZIP (or an unpacked folder, for the developer tool) without installing: returns
// ['manifest', 'blocks' => [decoded block files], 'css', 'assets' => [path => bytes], 'errors' => [...]]
function cc_pkg_read($source) {
    $errs = []; $files = [];
    if (is_dir($source)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->isLink()) { $errs[] = 'a link: ' . $f->getFilename(); continue; }
            if ($f->isFile()) $files[str_replace('\\', '/', substr($f->getPathname(), strlen(rtrim($source, '/')) + 1))] = ['size' => $f->getSize(), 'read' => function () use ($f) { return file_get_contents($f->getPathname()); }];
        }
    } else {
        if (!class_exists('ZipArchive')) return ['errors' => ['The PHP zip extension is not available on this server.']];
        if (!is_file($source) || filesize($source) > CC_PKG_MAX_ZIP) return ['errors' => ['The package is larger than ' . (CC_PKG_MAX_ZIP / 1048576) . ' MB.']];
        $zip = new ZipArchive();
        if ($zip->open($source, ZipArchive::CHECKCONS) !== true) return ['errors' => ['This is not a valid ZIP file.']];
        if ($zip->numFiles < 1 || $zip->numFiles > CC_PKG_MAX_ENTRIES) { $zip->close(); return ['errors' => ['The package has an unexpected number of files.']]; }
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $st = $zip->statIndex($i); $n = (string)$st['name'];
            if (substr($n, -1) === '/') continue;
            if ($zip->getExternalAttributesIndex($i, $os, $attr) && $os === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000) { $errs[] = "a link: $n"; continue; }
            $files[$n] = ['size' => (int)$st['size'], 'read' => function () use ($zip, $n) { return $zip->getFromName($n); }];
        }
    }
    $total = 0; $manifestRaw = null; $blocksRaw = []; $css = null; $assets = [];
    // the size a ZIP declares is not trusted: what a file really unpacks to is checked too
    foreach ($files as $n => &$fileRef) {
        $reader = $fileRef['read'];
        $fileRef['read'] = function () use ($reader) { $d = $reader(); return is_string($d) && strlen($d) <= CC_PKG_MAX_FILE ? $d : ''; };
    }
    unset($fileRef);
    foreach ($files as $n => $f) {
        if (!preg_match('~^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,3}$~', $n) || preg_match('~(^|/)\.\.?(/|$)~', $n) || $n[0] === '.') { $errs[] = 'a file name that is not allowed: ' . mb_substr(preg_replace('/[^\x20-\x7e]/', '?', $n), 0, 80); continue; }
        $total += $f['size'];
        if ($f['size'] > CC_PKG_MAX_FILE) { $errs[] = "$n is larger than " . (CC_PKG_MAX_FILE / 1048576) . ' MB'; continue; }
        if ($n === 'package.json') $manifestRaw = $f['read']();
        elseif (preg_match('~^blocks/([A-Za-z0-9._-]+)\.json$~', $n)) $blocksRaw[$n] = $f['read']();
        elseif ($n === 'style.css') $css = $f['read']();
        elseif (preg_match('~^assets/(.+)$~', $n, $m) && in_array(strtolower(pathinfo($n, PATHINFO_EXTENSION)), CC_PKG_IMAGE_EXT, true)) $assets[$m[1]] = $f['read']();
        elseif (in_array($n, ['README.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md'], true)) continue;
        else $errs[] = "$n: a package holds package.json, blocks/*.json, style.css, README.md, LICENSE and images in assets/ (nothing else)";
    }
    if ($total > CC_PKG_MAX_UNPACKED) $errs[] = 'the package is larger than ' . (CC_PKG_MAX_UNPACKED / 1048576) . ' MB unpacked';
    $manifest = $manifestRaw === null ? null : json_decode($manifestRaw, true);
    if ($manifestRaw === null) $errs[] = 'package.json is missing';
    elseif (!is_array($manifest)) { $errs[] = 'package.json is not valid JSON'; $manifest = null; }
    $id = $manifest !== null ? cc_pkg_check_manifest($manifest, $errs) : null;
    $blocks = [];
    if (!$blocksRaw) $errs[] = 'the package has no block (blocks/<name>.json)';
    if (count($blocksRaw) > CC_PKG_MAX_BLOCKS) $errs[] = 'a package has at most ' . CC_PKG_MAX_BLOCKS . ' blocks';
    ksort($blocksRaw);
    $names = [];
    foreach ($blocksRaw as $n => $raw) {
        $b = json_decode((string)$raw, true);
        if (!is_array($b)) { $errs[] = "$n: not valid JSON"; continue; }
        $name = cc_pkg_check_block($b, $n, $errs);
        if ($name !== null) { if (isset($names[$name])) $errs[] = "$n: the block name \"$name\" is used twice"; $names[$name] = true; if (basename($n, '.json') !== $name) $errs[] = "$n: the file must be called $name.json"; }
        $blocks[] = $b;
    }
    if ($css !== null && ($p = cc_pkg_css_problem($css))) $errs[] = $p;
    foreach ($assets as $path => $bytes) {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $tmp = tempnam(sys_get_temp_dir(), 'ccpk');
        file_put_contents($tmp, $bytes);
        $ok = $ext === 'svg' ? cc_svg_is_safe($tmp) : (@getimagesize($tmp) !== false);
        @unlink($tmp);
        if (!$ok) $errs[] = "assets/$path is not a " . ($ext === 'svg' ? 'safe SVG' : 'valid image');
    }
    return ['manifest' => $manifest, 'id' => $id, 'blocks' => $blocks, 'css' => $css, 'assets' => $assets, 'errors' => $errs];
}

// ---------------------------------------------------------------------------------------------- tests and the fuzz
function cc_pkg_render($def, array $block) {
    $def['_ast'] = cc_tpl_parse($def['template']);
    $h = cc_render_def_block($def, $block, 'b1');
    return $h === null ? '' : $h;
}
// Everything a hostile page author could get through: element and attribute names that run code, and active addresses
function cc_pkg_html_hazards($html) {
    if (!class_exists('DOMDocument')) return [];
    $out = [];
    $d = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $d->loadHTML('<?xml encoding="utf-8"?><div>' . $html . '</div>', LIBXML_NONET);
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    $bad = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'math', 'style'];
    foreach ($d->getElementsByTagName('*') as $el) {
        $tag = strtolower($el->nodeName);
        if (in_array($tag, $bad, true)) $out[] = "a <$tag> element appeared";
        foreach ($el->attributes as $a) {
            $n = strtolower($a->nodeName);
            if (strpos($n, 'on') === 0) $out[] = "an $n attribute appeared on <$tag>";
            $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', (string)$a->nodeValue));
            if (in_array($n, ['href', 'src', 'action', 'formaction', 'poster', 'background', 'xlink:href', 'data', 'srcset'], true) && preg_match('/^(javascript|vbscript|livescript|data:text|data:application|data:image\/svg)/', $probe)) $out[] = "a value ended up as a $n address that runs code on <$tag>";
        }
    }
    return array_values(array_unique($out));
}
function cc_pkg_hostile_content(array $settings, $v, $depth = 0) {
    $out = [];
    foreach ($settings as $k => $s) {
        $key = $s['key'] ?? $k;
        if (($s['from'] ?? '') === 'styles') continue;
        switch ($s['type'] ?? '') {
            case 'list':
                $item = isset($s['item']) ? cc_pkg_hostile_content($s['item'], $v, $depth + 1) : $v;
                $out[$key] = $depth > 2 ? [] : [$item, $item, 'junk', null, $v];
                break;
            case 'object': $out[$key] = $depth > 2 ? [] : cc_pkg_hostile_content($s['item'] ?? [], $v, $depth + 1); break;
            case 'choices': $out[$key] = [$v, 'x']; break;
            default: $out[$key] = $v;
        }
    }
    return $out;
}
// Runs the author's tests and the fuzz: returns problems (sentences)
function cc_pkg_run_checks($id, array $blocks) {
    $errs = [];
    $hostile = ['"><script>alert(1)</script>', 'javascript:alert(1)', "' onmouseover='alert(1)", '<img src=x onerror=alert(1)>', "\x00\x01\u{202e}", str_repeat('A', 4000), ['arr', 'ay'], ['k' => 'v'], 9.9e99, -1, true, '  javascript:alert(1)  ', '&#x6a;avascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4='];
    foreach ($blocks as $b) {
        $def = cc_pkg_def($id, $b); $w = $b['name'];
        try {
            $block = fn ($content, $styles = []) => ['id' => 'b1', 'type' => $def['type'], 'content' => $content, 'styles' => $styles];
            cc_pkg_render($def, $block($b['defaults']['content'] ?? [], $b['defaults']['styles'] ?? []));
            cc_pkg_render($def, $block([]));
            foreach ((array)($b['tests'] ?? []) as $i => $t) {
                if (!is_array($t)) { $errs[] = "$w: test " . ($i + 1) . ' is not an object'; continue; }
                $label = $w . ': test "' . (is_string($t['name'] ?? null) ? $t['name'] : ($i + 1)) . '"';
                $html = cc_pkg_render($def, $block(is_array($t['content'] ?? null) ? $t['content'] : [], is_array($t['styles'] ?? null) ? $t['styles'] : []));
                foreach ((array)($t['contains'] ?? []) as $needle) if (!is_string($needle) || strpos($html, $needle) === false) $errs[] = "$label: the output should contain " . json_encode($needle);
                foreach ((array)($t['notContains'] ?? []) as $needle) if (!is_string($needle) || strpos($html, $needle) !== false) $errs[] = "$label: the output should not contain " . json_encode($needle);
            }
            $seen = [];
            foreach ($hostile as $v) {
                $content = cc_pkg_hostile_content($def['settings'], $v);
                $content += ['customClass' => '"><script>alert(1)</script>', 'customId' => '"><script>'];
                foreach (cc_pkg_html_hazards(cc_pkg_render($def, $block($content, ['color' => 'red;}</style><script>', 'textAlign' => '"><script>']))) as $hz) {
                    if (isset($seen[$hz])) continue;
                    $seen[$hz] = true;
                    $errs[] = "$w: with hostile values in its settings, $hz. A value must not reach the page unchecked: use a setting type that checks it (image, color, number, enum) or a transform (blockUrl, extUrl, mailto…) for addresses.";
                }
            }
        } catch (Throwable $e) { $errs[] = "$w: rendering failed: " . $e->getMessage(); }
    }
    return $errs;
}

// ---------------------------------------------------------------------------------------------- installed packages
function cc_pkg_registry() {
    $r = json_decode((string)@file_get_contents(cc_pkg_dir() . '/index.json'), true);
    return is_array($r) ? $r : [];
}
function cc_pkg_registry_save(array $r) {
    $d = cc_pkg_dir();
    if (!is_dir($d) && !@mkdir($d, 0755, true)) throw new RuntimeException('The packages folder could not be created in the data folder.');
    ensure_htaccess($d, $GLOBALS['CC_HT_DENY']);
    if (@file_put_contents($d . '/index.json', json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) throw new RuntimeException('The package list could not be saved.');
}
// One installed package as stored: ['manifest', 'blocks', 'css'], or null when it can't be read or fails the checks again
function cc_pkg_load($id) {
    if (!preg_match('/^[a-z][a-z0-9-]{1,30}$/', (string)$id)) return null;
    $dir = cc_pkg_dir() . '/' . $id;
    $m = json_decode((string)@file_get_contents($dir . '/package.json'), true);
    if (!is_array($m)) return null;
    $errs = [];
    if (($m['id'] ?? '') !== $id) return null;
    $blocks = [];
    foreach (glob($dir . '/blocks/*.json') ?: [] as $f) {
        $b = json_decode((string)file_get_contents($f), true);
        if (!is_array($b)) return null;
        cc_pkg_check_block($b, basename($f), $errs);
        $blocks[] = $b;
    }
    $css = is_file($dir . '/style.css') ? (string)file_get_contents($dir . '/style.css') : '';
    if ($errs || ($css !== '' && cc_pkg_css_problem($css))) { error_log('CanvasCore: block package ' . $id . ' is not valid and is skipped: ' . ($errs[0] ?? 'style.css')); return null; }
    return ['manifest' => $m, 'blocks' => $blocks, 'css' => $css];
}
// The definitions of the enabled packages, by type (with their parsed template), for the engines
function cc_pkg_defs() {
    $out = [];
    foreach (cc_pkg_registry() as $id => $meta) {
        if (empty($meta['enabled'])) continue;
        $p = cc_pkg_load($id);
        if (!$p) continue;
        foreach ($p['blocks'] as $b) {
            $def = cc_pkg_def($id, $b);
            try { $def['_ast'] = cc_tpl_parse($def['template']); } catch (Throwable $e) { continue; }
            $out[$def['type']] = $def;
        }
    }
    return $out;
}
// The rich text fields of a package block, in the notation of CC_RICH_FIELDS (so they are also cleaned when saved)
function cc_pkg_rich_fields($type) {
    $def = cc_block_defs()[$type] ?? null;
    if (!$def || !isset($def['_pkg'])) return [];
    $out = [];
    foreach ($def['settings'] as $k => $s) {
        $key = $s['key'] ?? $k;
        if (($s['from'] ?? '') === 'styles') continue;
        if (($s['type'] ?? '') === 'richtext') $out[] = $key;
        elseif (($s['type'] ?? '') === 'list') {
            if (isset($s['of']) && ($s['of']['type'] ?? '') === 'richtext') $out[] = $key . '[]';
            foreach (($s['item'] ?? []) as $ik => $is) if (($is['type'] ?? '') === 'richtext') $out[] = $key . '[].' . ($is['key'] ?? $ik);
        }
    }
    return $out;
}
// The scoped style sheet of every enabled package: each package's CSS nested under its own class, so a rule can only
// reach the package's blocks and what is inside them. __ASSETS__/ becomes the package's image folder.
function cc_pkg_css() {
    $out = '';
    foreach (cc_pkg_registry() as $id => $meta) {
        if (empty($meta['enabled'])) continue;
        $p = cc_pkg_load($id);
        if (!$p || trim($p['css']) === '') continue;
        $css = str_replace('__ASSETS__/', '{{BASE_URL}}canvascore-blocks/' . $id . '/', $p['css']);
        $out .= '.cc-pkg-' . $id . '{' . trim(preg_replace('~/\*.*?\*/~s', '', $css)) . "}\n";
    }
    return $out;
}
// What the editor needs: the enabled packages with their blocks, catalog entries and defaults, and the style sheet
function cc_pkg_editor_payload() {
    $packages = [];
    foreach (cc_pkg_registry() as $id => $meta) {
        if (empty($meta['enabled'])) continue;
        $p = cc_pkg_load($id);
        if (!$p) continue;
        $blocks = [];
        foreach ($p['blocks'] as $b) {
            $def = cc_pkg_def($id, $b);
            $blocks[] = ['type' => $def['type'], 'definition' => $def, 'catalog' => $b['catalog'], 'defaults' => $b['defaults'] ?? new stdClass()];
        }
        $packages[] = ['id' => $id, 'name' => $p['manifest']['name'], 'version' => $p['manifest']['version'], 'blocks' => $blocks];
    }
    return ['packages' => $packages, 'css' => cc_pkg_css()];
}
// Installed packages for the admin: manifest, status, blocks and where they are used
function cc_pkg_info(?PDO $pdo = null) {
    $rows = [];
    foreach (cc_pkg_registry() as $id => $meta) {
        $p = cc_pkg_load($id);
        $types = [];
        if ($p) foreach ($p['blocks'] as $b) $types[] = ['type' => cc_pkg_type($id, $b['name']), 'name' => $b['name'], 'label' => $b['catalog']['label'] ?? $b['name']];
        $rows[] = ['id' => $id, 'name' => $p ? $p['manifest']['name'] : $id, 'version' => $meta['version'] ?? '', 'author' => $p ? ($p['manifest']['author'] ?? '') : '',
            'description' => $p ? ($p['manifest']['description'] ?? '') : '', 'homepage' => $p ? ($p['manifest']['homepage'] ?? '') : '', 'license' => $p ? ($p['manifest']['license'] ?? '') : '',
            'enabled' => !empty($meta['enabled']), 'valid' => (bool)$p, 'installed_at' => $meta['installed_at'] ?? 0, 'installed_by' => $meta['installed_by'] ?? '',
            'blocks' => $types, 'used' => $pdo ? cc_pkg_usage($pdo, array_column($types, 'type')) : 0];
    }
    usort($rows, function ($a, $b) { return strcasecmp($a['name'], $b['name']); });
    return $rows;
}
// How many saved items (pages and their drafts, templates, masters, header/footer, collection items and designs) hold a block of these types
function cc_pkg_usage(PDO $pdo, array $types) {
    if (!$types) return 0;
    $n = 0;
    foreach ([['pages', 'content_json'], ['templates', 'content_json'], ['master_components', 'content_json'], ['site_parts', 'content_json'], ['collection_items', 'content_json'], ['collections', 'design_json']] as [$t, $col]) {
        try {
            foreach ($types as $type) {
                $st = $pdo->prepare("SELECT COUNT(*) FROM $t WHERE instr($col, ?) > 0");
                $st->execute(['"type":"' . $type . '"']);
                $n += (int)$st->fetchColumn();
            }
        } catch (Throwable $e) { /* a table the site does not have */ }
    }
    return $n;
}

// ---------------------------------------------------------------------------------------------- install, enable, remove
function cc_pkg_copy_assets($id, array $assets) {
    $base = cc_pkg_site_dir();
    if (!is_dir($base) && !@mkdir($base, 0755, true)) throw new RuntimeException('The folder canvascore-blocks could not be created in the site folder.');
    ensure_htaccess($base, $GLOBALS['CC_HT_UPLOADS']);
    cc_pkg_rrmdir("$base/$id");
    foreach ($assets as $path => $bytes) {
        $dest = "$base/$id/$path";
        if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0755, true)) throw new RuntimeException('An image of the package could not be copied.');
        if (@file_put_contents($dest, $bytes) === false) throw new RuntimeException('An image of the package could not be copied.');
    }
}
// Installs a package ZIP (or folder): returns ['success' => bool, 'message', 'errors' => [...], 'package' => [...]]
function cc_pkg_install($source, $user = '') {
    @set_time_limit(120);
    $p = cc_pkg_read($source);
    $errs = $p['errors'];
    if (!$errs) {
        $id = $p['id'];
        $reg = cc_pkg_registry();
        if (isset($reg[$id]) && version_compare($p['manifest']['version'], (string)($reg[$id]['version'] ?? '0'), '<=')) {
            $errs[] = 'Version ' . ($reg[$id]['version'] ?? '?') . ' of "' . $id . '" is already installed: upload a newer version, or remove it first.';
        }
        if (!$errs) { try { $errs = cc_pkg_run_checks($id, $p['blocks']); } catch (Throwable $e) { $errs[] = 'The package could not be checked: ' . $e->getMessage(); } }
    }
    if ($errs) return ['success' => false, 'message' => 'The package was not installed.', 'errors' => array_slice($errs, 0, 40)];
    $id = $p['id'];
    $tmp = cc_pkg_dir() . '/.new-' . bin2hex(random_bytes(4));
    try {
        if (!is_dir(cc_pkg_dir()) && !@mkdir(cc_pkg_dir(), 0755, true)) throw new RuntimeException('The packages folder could not be created in the data folder.');
        ensure_htaccess(cc_pkg_dir(), $GLOBALS['CC_HT_DENY']);
        if (!@mkdir($tmp . '/blocks', 0755, true)) throw new RuntimeException('The packages folder is not writable.');
        $manifest = array_intersect_key($p['manifest'], array_flip(['id', 'name', 'version', 'author', 'description', 'homepage', 'license', 'minVersion']));
        file_put_contents("$tmp/package.json", json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        foreach ($p['blocks'] as $b) {
            $b = array_intersect_key($b, array_flip(CC_PKG_BLOCK_KEYS));
            file_put_contents("$tmp/blocks/{$b['name']}.json", json_encode($b, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        if ($p['css'] !== null) file_put_contents("$tmp/style.css", $p['css']);
        cc_pkg_copy_assets($id, $p['assets']);
        $final = cc_pkg_dir() . '/' . $id;
        cc_pkg_rrmdir($final);
        if (!@rename($tmp, $final)) throw new RuntimeException('The package could not be put in place.');
        $reg = cc_pkg_registry();
        $reg[$id] = ['version' => $manifest['version'], 'enabled' => $reg[$id]['enabled'] ?? true, 'installed_at' => time(), 'installed_by' => (string)$user];
        cc_pkg_registry_save($reg);
    } catch (Throwable $e) {
        cc_pkg_rrmdir($tmp);
        return ['success' => false, 'message' => 'The package was not installed: ' . $e->getMessage(), 'errors' => []];
    }
    $types = array_map(function ($b) use ($id) { return cc_pkg_type($id, $b['name']); }, $p['blocks']);
    return ['success' => true, 'message' => '"' . $p['manifest']['name'] . '" ' . $p['manifest']['version'] . ' is installed: ' . count($types) . ' block' . (count($types) === 1 ? '' : 's') . '.', 'errors' => [], 'id' => $id, 'types' => $types];
}
function cc_pkg_set_enabled($id, $enabled) {
    $reg = cc_pkg_registry();
    if (!isset($reg[$id])) return false;
    $reg[$id]['enabled'] = (bool)$enabled;
    cc_pkg_registry_save($reg);
    return true;
}
function cc_pkg_remove($id) {
    $reg = cc_pkg_registry();
    if (!isset($reg[$id]) || !preg_match('/^[a-z][a-z0-9-]{1,30}$/', (string)$id)) return false;
    unset($reg[$id]);
    cc_pkg_registry_save($reg);
    cc_pkg_rrmdir(cc_pkg_dir() . '/' . $id);
    cc_pkg_rrmdir(cc_pkg_site_dir() . '/' . $id);
    return true;
}
