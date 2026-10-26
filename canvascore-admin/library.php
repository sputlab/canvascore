<?php
// canvascore-admin/library.php
// The online template library: starter pages, sections and full-site kits shared by the community, installed from the admin.
//
//   The library is an INDEX (index.json + index.json.sig) kept by the CanvasCore maintainers, listing kits: ZIP files that
//   anybody can propose. The index is signed (Ed25519, the release keys of update-keys.php), so a site lists only kits the
//   maintainers published; each entry carries the sha256 of its ZIP, which is checked after the download. A kit can also be
//   installed from a file an admin chooses (the admin vouches for it). Either way a kit is UNTRUSTED CONTENT and goes through the
//   same cleaning as an editor's save: custom code is dropped (HTML blocks are emptied, form emails and custom CSS/JS removed),
//   rich text is sanitized, images must be real images (SVG without script), and the kit may only use blocks this site has.
//
//   kit.json       id, name, version, type (page | section | site), author, description, license, tags, minVersion, homepage
//   content.json   page:    { page: { title, slug, layout, bg_color, boxed_width, seo_title, seo_description }, blocks: [...] }
//                  section: { sections: [ { name, block: {...} } ] }                      (each becomes an entry of "My templates")
//                  site:    { pages: [ { title, slug, home, layout, ..., blocks } ], header: [...], footer: [...],
//                             menu: { items: [ { label, url, children } ] }, design: { brandColor, fontFamily, colors, typography, buttonStyles, fieldStyle } }
//   assets/<file>  images (png, jpg, gif, webp, avif, svg); content refers to them as "kit:assets/<file>"
//   preview.<ext>  optional picture of the kit (png, jpg, webp; 300 KB at most)
//   README.md, LICENSE   allowed, ignored
//
// Pages arrive as DRAFTS with free addresses and nothing is replaced. A site kit's design (header, footer, menu, colours) is applied only
// when the admin ticks it, after a safety copy that can be put back. Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/media.php';
require_once __DIR__ . '/update.php';

const CC_LIB_MAX_ZIP = 8 * 1048576;
const CC_LIB_MAX_FILE = 3 * 1048576;
const CC_LIB_MAX_UNPACKED = 20 * 1048576;
const CC_LIB_MAX_ENTRIES = 300;
const CC_LIB_MAX_PAGES = 30;
const CC_LIB_MAX_SECTIONS = 40;
const CC_LIB_MAX_BLOCKS = 3000;
const CC_LIB_MAX_DEPTH = 14;
const CC_LIB_MAX_PREVIEW = 307200;
const CC_LIB_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'];
const CC_LIB_TYPES = ['page', 'section', 'site'];
const CC_LIB_CACHE_SECONDS = 3600;
const CC_LIB_INDEX_MAX = 1048576;

function cc_lib_dir() { return $GLOBALS['CC_LIB_DIR'] ?? (cc_data_dir() . '/library'); }   // overridable for tests
function cc_lib_data_dir() { return $GLOBALS['CC_LIB_DATA_DIR'] ?? cc_data_dir(); }        // where menu.json and settings.json are (tests)
function cc_lib_keys() { return $GLOBALS['CC_LIB_KEYS'] ?? cc_update_keys(); }
function cc_lib_uploads_dir() { return $GLOBALS['CC_LIB_UPLOADS'] ?? (__DIR__ . '/../uploads'); }
function cc_lib_rrmdir($dir) {
    if (!is_dir($dir) || is_link($dir)) { if (file_exists($dir) || is_link($dir)) @unlink($dir); return; }
    foreach (array_diff(scandir($dir) ?: [], ['.', '..']) as $f) cc_lib_rrmdir($dir . '/' . $f);
    @rmdir($dir);
}
function cc_lib_read_json($path, $default = []) {
    $raw = is_file($path) ? file_get_contents($path) : false;
    $v = $raw === false ? null : json_decode($raw, true);
    return is_array($v) ? $v : $default;
}
function cc_lib_write_json($path, $v) {
    @mkdir(dirname($path), 0700, true);
    $tmp = $path . '.tmp';
    file_put_contents($tmp, json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
    rename($tmp, $path);
}
function cc_lib_text($v, $max) { return mb_substr(trim(preg_replace('/[\x00-\x1f\x7f<>]/u', ' ', strip_tags(is_scalar($v) ? (string)$v : ''))), 0, $max); }

// ---------------------------------------------------------------------------------------------- the feed
function cc_lib_source() {
    $s = ['index' => 'https://raw.githubusercontent.com/sputlab/canvascore-library/main/index.json',
          'sig' => 'https://raw.githubusercontent.com/sputlab/canvascore-library/main/index.json.sig',
          'hosts' => ['raw.githubusercontent.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'],
          'https' => true];
    $f = __DIR__ . '/library-source.php';
    if (is_file($f)) { $o = include $f; if (is_array($o)) $s = array_merge($s, $o); }
    $s['hosts'] = array_map('strtolower', (array)$s['hosts']);
    return $s;
}
function cc_lib_signed_message($bytes) { return "canvascore-library-v1\n" . hash('sha256', $bytes); }
function cc_lib_verify($bytes, $sigB64, array $keys) {
    if (!function_exists('sodium_crypto_sign_verify_detached')) throw new RuntimeException('The library is signed, and checking it needs the PHP sodium extension, which this server does not have.');
    $sig = base64_decode(trim((string)$sigB64), true);
    if ($sig === false || strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES) return false;
    foreach ($keys as $k) if (is_string($k) && strlen($k) === SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES && sodium_crypto_sign_verify_detached($sig, cc_lib_signed_message($bytes), $k)) return true;
    return false;
}
// A download from the library's hosts (https, a listed host on every hop). Test stub: $GLOBALS['CC_LIB_FETCH'](url, max) => bytes
function cc_lib_get($url, $to = null, $max = CC_LIB_INDEX_MAX) {
    if (isset($GLOBALS['CC_LIB_FETCH']) && is_callable($GLOBALS['CC_LIB_FETCH'])) {
        $b = $GLOBALS['CC_LIB_FETCH']($url, $max);
        if (!is_string($b)) throw new RuntimeException('The library could not be reached.');
        if (strlen($b) > $max) throw new RuntimeException('The download is too large.');
        if ($to !== null) { file_put_contents($to, $b); return ''; }
        return $b;
    }
    $src = cc_lib_source();
    for ($hop = 0; $hop < 6; $hop++) {
        if (!cc_update_url_ok($url, $src)) throw new RuntimeException('The library address is not allowed: ' . (parse_url((string)$url, PHP_URL_HOST) ?: $url) . '.');
        $r = cc_update_fetch($url, $to, $max);
        if ($r['code'] >= 300 && $r['code'] < 400 && $r['location'] !== '') {
            $loc = $r['location'];
            if (strpos($loc, '//') === 0) $loc = parse_url($url, PHP_URL_SCHEME) . ':' . $loc;
            elseif (!preg_match('~^https?://~i', $loc)) { $p = parse_url($url); $loc = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . ($loc[0] === '/' ? '' : '/') . $loc; }
            $url = $loc; continue;
        }
        if ($r['code'] !== 200) throw new RuntimeException('The library answered with an error (' . $r['code'] . ').');
        return $r['body'];
    }
    throw new RuntimeException('The library redirected too many times.');
}
// One entry of the index, cleaned; null when it is not usable
function cc_lib_entry_clean($e, array $src) {
    if (!is_array($e)) return null;
    $id = strtolower(trim((string)($e['id'] ?? '')));
    $type = (string)($e['type'] ?? '');
    $url = (string)($e['url'] ?? '');
    $sha = strtolower((string)($e['sha256'] ?? ''));
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,40}$/', $id) || !in_array($type, CC_LIB_TYPES, true) || !preg_match('/^[0-9a-f]{64}$/', $sha) || !cc_update_url_ok($url, $src)) return null;
    $ver = (string)($e['version'] ?? '');
    $preview = (string)($e['preview'] ?? '');
    return [
        'id' => $id, 'name' => cc_lib_text($e['name'] ?? $id, 80) ?: $id, 'type' => $type, 'version' => preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', $ver) ? $ver : '1.0.0',
        'author' => cc_lib_text($e['author'] ?? '', 80), 'description' => cc_lib_text($e['description'] ?? '', 400), 'license' => cc_lib_text($e['license'] ?? '', 40),
        'tags' => array_slice(array_values(array_filter(array_map(function ($t) { return cc_lib_text($t, 24); }, is_array($e['tags'] ?? null) ? $e['tags'] : []))), 0, 8),
        'pages' => max(0, min(CC_LIB_MAX_PAGES, (int)($e['pages'] ?? 0))), 'size' => max(0, min(CC_LIB_MAX_ZIP, (int)($e['size'] ?? 0))),
        'minVersion' => preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', (string)($e['minVersion'] ?? '')) ? (string)$e['minVersion'] : '',
        'sha256' => $sha, 'url' => $url, 'preview' => $preview !== '' && cc_update_url_ok($preview, $src) ? $preview : '',
    ];
}
// The index: from the cache (an hour) or the library; the signature is checked before anything in it is believed.
// Returns ['kits' => [...], 'fetched' => unix time]; throws RuntimeException with a sentence for the admin
function cc_lib_index($force = false) {
    $cache = cc_lib_dir() . '/index.json';
    $src = cc_lib_source();
    $meta = cc_lib_read_json($cache);
    if (!$force && $meta && isset($meta['fetched'], $meta['kits']) && time() - (int)$meta['fetched'] < CC_LIB_CACHE_SECONDS) return $meta;
    try {
        $bytes = cc_lib_get($src['index'], null, CC_LIB_INDEX_MAX);
        $sig = cc_lib_get($src['sig'], null, 4096);
    } catch (RuntimeException $e) {
        if ($meta && isset($meta['kits'])) return $meta + ['stale' => true, 'error' => $e->getMessage()];   // the last good copy, marked
        throw $e;
    }
    if (!cc_lib_verify($bytes, $sig, cc_lib_keys())) throw new RuntimeException('The library index is not signed by the CanvasCore key, so it was not used.');
    $d = json_decode($bytes, true);
    if (!is_array($d) || !is_array($d['kits'] ?? null)) throw new RuntimeException('The library index is not valid.');
    $kits = [];
    foreach (array_slice($d['kits'], 0, 500) as $e) { $c = cc_lib_entry_clean($e, $src); if ($c) $kits[$c['id']] = $c; }
    $out = ['kits' => array_values($kits), 'fetched' => time(), 'updated' => cc_lib_text($d['updated'] ?? '', 40)];
    cc_lib_write_json($cache, $out);
    return $out;
}
// The kit of an index entry, downloaded and checked against the sha256 of the index. Returns the path of a temporary ZIP
function cc_lib_download($entry) {
    $tmp = tempnam(sys_get_temp_dir(), 'cclib');
    try {
        cc_lib_get($entry['url'], $tmp, CC_LIB_MAX_ZIP);
        if (!is_file($tmp) || filesize($tmp) > CC_LIB_MAX_ZIP) throw new RuntimeException('The kit is larger than ' . (CC_LIB_MAX_ZIP / 1048576) . ' MB.');
        if (!hash_equals($entry['sha256'], hash_file('sha256', $tmp))) throw new RuntimeException('The download does not match the library index (its checksum differs), so it was not used.');
    } catch (Throwable $e) { @unlink($tmp); throw $e instanceof RuntimeException ? $e : new RuntimeException('The kit could not be downloaded.'); }
    return $tmp;
}
// The preview picture of an entry, cached in the data folder: [bytes, mime] or null
function cc_lib_preview($entry) {
    if (empty($entry['preview'])) return null;
    $dir = cc_lib_dir() . '/previews';
    $key = $entry['id'] . '-' . substr($entry['sha256'], 0, 12);
    foreach (['png', 'jpg', 'webp'] as $ext) if (is_file("$dir/$key.$ext")) return [file_get_contents("$dir/$key.$ext"), ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'][$ext]];
    try { $b = cc_lib_get($entry['preview'], null, CC_LIB_MAX_PREVIEW); } catch (Throwable $e) { return null; }
    $tmp = tempnam(sys_get_temp_dir(), 'ccpv'); file_put_contents($tmp, $b);
    $info = @getimagesize($tmp); @unlink($tmp);
    $ext = $info ? [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'][$info[2]] ?? '' : '';
    if ($ext === '') return null;
    @mkdir($dir, 0700, true);
    file_put_contents("$dir/$key.$ext", $b);
    return [$b, ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'][$ext]];
}

// ---------------------------------------------------------------------------------------------- reading and checking a kit
function cc_lib_known_block_types() {
    static $core = null;
    if ($core === null) $core = array_keys((cc_lib_read_json(__DIR__ . '/blocks.json')['types'] ?? []));
    $types = array_flip($core);
    if (function_exists('cc_block_defs')) foreach (array_keys(cc_block_defs()) as $t) $types[$t] = true;
    return $types;
}
function cc_lib_check_manifest($m, &$errs) {
    if (!is_array($m)) { $errs[] = 'kit.json is not valid JSON'; return null; }
    $id = (string)($m['id'] ?? '');
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,40}$/', $id)) $errs[] = 'kit.json: "id" must be 2–41 lower case letters, digits or dashes';
    if (cc_lib_text($m['name'] ?? '', 80) === '') $errs[] = 'kit.json: "name" is missing';
    if (!preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', (string)($m['version'] ?? ''))) $errs[] = 'kit.json: "version" must look like 1.0.0';
    if (!in_array($m['type'] ?? '', CC_LIB_TYPES, true)) $errs[] = 'kit.json: "type" must be page, section or site';
    if (isset($m['minVersion'])) {
        if (!preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', (string)$m['minVersion'])) $errs[] = 'kit.json: "minVersion" must look like 0.24.0';
        else { $app = $GLOBALS['CC_LIB_APP_VERSION'] ?? cc_version()['app']; if (version_compare($app, $m['minVersion'], '<')) $errs[] = 'this kit needs CanvasCore ' . $m['minVersion'] . ' or newer (this site runs ' . $app . ')'; }
    }
    return preg_match('/^[a-z0-9][a-z0-9-]{1,40}$/', $id) ? $id : null;
}
// Walks a block list: counts blocks, depth, unknown types, and the assets it refers to. Strings are not trusted here, only counted.
function cc_lib_walk_blocks($list, $depth, &$count, &$unknown, &$refs, &$errs, $where) {
    if (!is_array($list)) { $errs[] = "$where: blocks must be a list"; return; }
    if ($depth > CC_LIB_MAX_DEPTH) { $errs[] = "$where: blocks are nested too deeply"; return; }
    $known = cc_lib_known_block_types();
    foreach ($list as $b) {
        if (!is_array($b) || !isset($b['type']) || !is_string($b['type'])) { $errs[] = "$where: a block has no type"; continue; }
        if (++$count > CC_LIB_MAX_BLOCKS) { $errs[] = 'the kit holds too many blocks'; return; }
        if (!isset($known[$b['type']])) $unknown[$b['type']] = true;
        $json = json_encode($b['content'] ?? null, JSON_UNESCAPED_SLASHES) . json_encode($b['styles'] ?? null, JSON_UNESCAPED_SLASHES);
        if (preg_match_all('~kit:assets/([A-Za-z0-9._-]+)~', $json, $m)) foreach ($m[1] as $r) $refs[$r] = true;
        if (isset($b['children'])) cc_lib_walk_blocks($b['children'], $depth + 1, $count, $unknown, $refs, $errs, $where);
    }
}
function cc_lib_check_content($type, $c, &$errs) {
    $refs = []; $unknown = []; $count = 0; $pages = 0;
    if (!is_array($c)) { $errs[] = 'content.json is not valid JSON'; return [0, []]; }
    if ($type === 'page') {
        if (!is_array($c['page'] ?? null) && isset($c['page'])) $errs[] = 'content.json: "page" must be an object';
        cc_lib_walk_blocks($c['blocks'] ?? null, 0, $count, $unknown, $refs, $errs, 'content.json');
        if (!$count) $errs[] = 'content.json: the page has no blocks';
        $pages = 1;
    } elseif ($type === 'section') {
        $secs = $c['sections'] ?? null;
        if (!is_array($secs) || !$secs) $errs[] = 'content.json: a section kit needs "sections"';
        elseif (count($secs) > CC_LIB_MAX_SECTIONS) $errs[] = 'content.json: at most ' . CC_LIB_MAX_SECTIONS . ' sections';
        else foreach ($secs as $i => $s) {
            if (!is_array($s) || !is_array($s['block'] ?? null) || !isset($s['block']['type'])) { $errs[] = 'content.json: section ' . ($i + 1) . ' needs a "block"'; continue; }
            cc_lib_walk_blocks([$s['block']], 0, $count, $unknown, $refs, $errs, 'content.json section ' . ($i + 1));
        }
    } else {
        $ps = $c['pages'] ?? null;
        if (!is_array($ps) || !$ps) $errs[] = 'content.json: a site kit needs "pages"';
        elseif (count($ps) > CC_LIB_MAX_PAGES) $errs[] = 'content.json: at most ' . CC_LIB_MAX_PAGES . ' pages';
        else foreach ($ps as $i => $p) {
            if (!is_array($p)) { $errs[] = 'content.json: page ' . ($i + 1) . ' is not an object'; continue; }
            cc_lib_walk_blocks($p['blocks'] ?? [], 0, $count, $unknown, $refs, $errs, 'content.json page ' . ($i + 1));
            $pages++;
        }
        foreach (['header', 'footer'] as $part) if (isset($c[$part])) cc_lib_walk_blocks($c[$part], 0, $count, $unknown, $refs, $errs, "content.json $part");
        if (isset($c['menu']) && !is_array($c['menu'])) $errs[] = 'content.json: "menu" must be an object';
        if (isset($c['design']) && !is_array($c['design'])) $errs[] = 'content.json: "design" must be an object';
        $refs += array_fill_keys(cc_lib_string_refs(['menu' => $c['menu'] ?? null, 'design' => $c['design'] ?? null]), true);
    }
    if ($unknown) $errs[] = 'it uses blocks this site does not have: ' . implode(', ', array_slice(array_keys($unknown), 0, 6)) . ' (a newer CanvasCore, or a block package, is needed)';
    return [$pages, array_keys($refs)];
}
function cc_lib_string_refs($v) {
    $out = [];
    $w = function ($x) use (&$w, &$out) { if (is_array($x)) foreach ($x as $y) $w($y); elseif (is_string($x) && preg_match_all('~kit:assets/([A-Za-z0-9._-]+)~', $x, $m)) foreach ($m[1] as $r) $out[] = $r; };
    $w($v);
    return $out;
}

// Reads a ZIP or a folder: ['manifest','id','type','content','assets' => name => bytes,'preview' => [bytes, ext]|null,'pages','errors']
function cc_lib_read($source) {
    $errs = []; $files = [];
    if (is_dir($source)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->isLink()) { $errs[] = 'a link: ' . $f->getFilename(); continue; }
            if ($f->isFile()) $files[str_replace('\\', '/', substr($f->getPathname(), strlen(rtrim($source, '/')) + 1))] = ['size' => $f->getSize(), 'read' => function () use ($f) { return file_get_contents($f->getPathname()); }];
        }
    } else {
        if (!class_exists('ZipArchive')) return ['errors' => ['The PHP zip extension is not available on this server.']];
        if (!is_file($source) || filesize($source) > CC_LIB_MAX_ZIP) return ['errors' => ['The kit is larger than ' . (CC_LIB_MAX_ZIP / 1048576) . ' MB.']];
        $zip = new ZipArchive();
        if ($zip->open($source, ZipArchive::CHECKCONS) !== true) return ['errors' => ['This is not a valid ZIP file.']];
        if ($zip->numFiles < 2 || $zip->numFiles > CC_LIB_MAX_ENTRIES) { $zip->close(); return ['errors' => ['The kit has an unexpected number of files.']]; }
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $st = $zip->statIndex($i); $n = (string)$st['name'];
            if (substr($n, -1) === '/') continue;
            if ($zip->getExternalAttributesIndex($i, $os, $attr) && $os === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000) { $errs[] = "a link: $n"; continue; }
            $files[$n] = ['size' => (int)$st['size'], 'read' => function () use ($zip, $n) { return $zip->getFromName($n); }];
        }
    }
    foreach ($files as $n => &$ref) {   // the size a ZIP declares is not trusted: what a file really unpacks to is checked too
        $reader = $ref['read'];
        $ref['read'] = function () use ($reader) { $d = $reader(); return is_string($d) && strlen($d) <= CC_LIB_MAX_FILE ? $d : ''; };
    }
    unset($ref);
    $total = 0; $manifestRaw = null; $contentRaw = null; $assets = []; $preview = null;
    foreach ($files as $n => $f) {
        if (!preg_match('~^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,2}$~', $n) || preg_match('~(^|/)\.\.?(/|$)~', $n) || $n[0] === '.') { $errs[] = 'a file name that is not allowed: ' . mb_substr(preg_replace('/[^\x20-\x7e]/', '?', $n), 0, 60); continue; }
        $total += $f['size'];
        if ($f['size'] > CC_LIB_MAX_FILE) { $errs[] = "$n is larger than " . (CC_LIB_MAX_FILE / 1048576) . ' MB'; continue; }
        if ($n === 'kit.json') $manifestRaw = $f['read']();
        elseif ($n === 'content.json') $contentRaw = $f['read']();
        elseif (preg_match('~^assets/([A-Za-z0-9._-]+)$~', $n, $m) && in_array(strtolower(pathinfo($n, PATHINFO_EXTENSION)), CC_LIB_IMAGE_EXT, true)) $assets[$m[1]] = $f['read']();
        elseif (preg_match('~^preview\.(png|jpg|jpeg|webp)$~i', $n, $m)) { $b = $f['read'](); if (strlen($b) > CC_LIB_MAX_PREVIEW) $errs[] = "$n is larger than " . round(CC_LIB_MAX_PREVIEW / 1024) . ' KB'; else $preview = [$b, strtolower($m[1])]; }
        elseif (in_array($n, ['README.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md'], true)) continue;
        else $errs[] = "$n: a kit holds kit.json, content.json, preview.png/jpg/webp, README.md, LICENSE and images in assets/ (nothing else)";
    }
    if ($total > CC_LIB_MAX_UNPACKED) $errs[] = 'the kit is larger than ' . (CC_LIB_MAX_UNPACKED / 1048576) . ' MB unpacked';
    if ($manifestRaw === null) $errs[] = 'kit.json is missing';
    if ($contentRaw === null) $errs[] = 'content.json is missing';
    $manifest = $manifestRaw !== null ? json_decode($manifestRaw, true) : null;
    $content = $contentRaw !== null ? json_decode($contentRaw, true) : null;
    $id = $manifestRaw !== null ? cc_lib_check_manifest($manifest, $errs) : null;
    $type = is_array($manifest) && in_array($manifest['type'] ?? '', CC_LIB_TYPES, true) ? $manifest['type'] : null;
    $pages = 0;
    if ($type && $contentRaw !== null) {
        [$pages, $refs] = cc_lib_check_content($type, $content, $errs);
        foreach ($refs as $r) if (!isset($assets[$r])) $errs[] = "content.json refers to assets/$r, which is not in the kit";
    }
    foreach ($assets as $name => $bytes) {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $tmp = tempnam(sys_get_temp_dir(), 'cclk'); file_put_contents($tmp, $bytes);
        $ok = $ext === 'svg' ? cc_svg_is_safe($tmp) : (@getimagesize($tmp) !== false);
        @unlink($tmp);
        if (!$ok) $errs[] = "assets/$name is not a " . ($ext === 'svg' ? 'safe SVG' : 'valid image');
    }
    if ($preview) {
        $tmp = tempnam(sys_get_temp_dir(), 'cclp'); file_put_contents($tmp, $preview[0]); $ok = @getimagesize($tmp) !== false; @unlink($tmp);
        if (!$ok) { $errs[] = 'the preview is not a valid image'; $preview = null; }
    }
    return ['manifest' => is_array($manifest) ? $manifest : null, 'id' => $id, 'type' => $type, 'content' => is_array($content) ? $content : null, 'assets' => $assets, 'preview' => $preview, 'pages' => $pages, 'errors' => $errs];
}

// ---------------------------------------------------------------------------------------------- cleaning what a kit brings
function cc_lib_fresh_ids(&$blocks) {
    static $n = 0;
    foreach ($blocks as &$b) {
        if (!is_array($b)) continue;
        $b['id'] = 'block-' . base_convert((string)time(), 10, 36) . '-' . base_convert((string)(++$n), 10, 36) . bin2hex(random_bytes(3));
        if (isset($b['children']) && is_array($b['children'])) cc_lib_fresh_ids($b['children']);
    }
}
// What a kit's blocks become before they are stored: the cleaning of an editor's save (no code: Custom HTML emptied, form emails and custom
// CSS/JS removed; rich text sanitized), the addresses of the kit's images, and ids of their own
function cc_lib_prepare_blocks($blocks, array $assetUrls, &$dropped = 0) {
    $blocks = array_values(is_array($blocks) ? $blocks : []);
    $swap = function ($v) use (&$swap, $assetUrls) {
        if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = $swap($x); return $v; }
        if (is_string($v) && strpos($v, 'kit:assets/') !== false) return preg_replace_callback('~kit:assets/([A-Za-z0-9._-]+)~', function ($m) use ($assetUrls) { return $assetUrls[$m[1]] ?? ''; }, $v);
        return $v;
    };
    $blocks = $swap($blocks);
    $count = function ($list) use (&$count) { $n = 0; foreach ((array)$list as $b) { if (is_array($b) && ($b['type'] ?? '') === 'HTML' && trim((string)($b['content']['code'] ?? '')) !== '') $n++; if (!empty($b['children'])) $n += $count($b['children']); } return $n; };
    $dropped += $count($blocks);
    cc_keep_code_surfaces($blocks, []);
    cc_sanitize_blocks($blocks);
    cc_lib_fresh_ids($blocks);
    return $blocks;
}
function cc_lib_page_fields($p) {
    $p = is_array($p) ? $p : [];
    return [
        'title' => cc_lib_text($p['title'] ?? '', 300) ?: 'Untitled',
        'slug' => cc_safe_slug($p['slug'] ?? '') ?: cc_safe_slug($p['title'] ?? '') ?: 'page',
        'layout' => ($p['layout'] ?? 'boxed') === 'full' ? 'full' : 'boxed',
        'bg_color' => cc_css_color($p['bg_color'] ?? '', '#ffffff'),
        'boxed_width' => cc_css_length($p['boxed_width'] ?? '', '1200px'),
        'seo_title' => cc_lib_text($p['seo_title'] ?? '', 300), 'seo_description' => cc_lib_text($p['seo_description'] ?? '', 1000),
    ];
}
function cc_lib_unique_slug($pdo, $base) {
    $base = cc_safe_slug($base) ?: 'page';
    $taken = array_fill_keys($pdo->query("SELECT clean_slug FROM pages WHERE is_draft_copy = 0")->fetchAll(PDO::FETCH_COLUMN), true);
    foreach ($pdo->query("SELECT slug FROM collections")->fetchAll(PDO::FETCH_COLUMN) as $s) $taken[$s] = true;
    $slug = $base; $n = 2;
    while (isset($taken[$slug]) || cc_slug_reserved($slug)) $slug = $base . '-' . $n++;
    return $slug;
}
// A menu from a kit: only labels, plain addresses and nesting (3 levels, 40 items per level)
function cc_lib_menu_clean($m, $depth = 0) {
    $items = is_array($m['items'] ?? null) ? $m['items'] : [];
    $out = [];
    foreach (array_slice($items, 0, 40) as $it) {
        if (!is_array($it)) continue;
        $label = cc_lib_text($it['label'] ?? '', 60);
        $url = trim((string)($it['url'] ?? ''));
        if ($label === '') continue;
        if ($url !== '' && !preg_match('~^(#[A-Za-z0-9_-]*|/[^\s"<>\\\\]*|[A-Za-z0-9._/-]+/?|https?://[^\s"<>\\\\]+|mailto:[^\s"<>\\\\]+|tel:[+0-9 ()-]+)$~', $url)) $url = '';
        $row = ['id' => 'menu-' . bin2hex(random_bytes(4)), 'label' => $label, 'url' => $url];
        if ($depth < 2 && !empty($it['children'])) { $kids = cc_lib_menu_clean(['items' => $it['children']], $depth + 1); if ($kids) $row['children'] = $kids; }
        $out[] = $row;
    }
    return $out;
}
// The design a site kit may change: the colours, text styles, button styles and brand colour, with the cleaners of Global Options
function cc_lib_design_clean($d) {
    $d = is_array($d) ? $d : [];
    $out = [];
    if (isset($d['typography'])) $out['typography'] = cc_typography(['typography' => $d['typography']]);
    if (isset($d['buttonStyles']) || isset($d['fieldStyle'])) { $kit = cc_kit($d); $out['buttonStyles'] = (object)$kit['buttons']; $out['fieldStyle'] = (object)$kit['field']; }
    if (isset($d['colors'])) { $out['colors'] = cc_palette(['colors' => $d['colors'], 'brandColor' => $d['brandColor'] ?? '']); $out['brandColor'] = $out['colors'][0]['value']; }
    elseif (isset($d['brandColor']) && preg_match('/^#[0-9a-fA-F]{3,8}$/', (string)$d['brandColor'])) $out['brandColor'] = (string)$d['brandColor'];
    if (isset($d['fontFamily']) && is_string($d['fontFamily']) && preg_match('/^[A-Za-z0-9 ,\'"-]{1,80}$/', $d['fontFamily'])) $out['fontFamily'] = $d['fontFamily'];
    return $out;
}

// ---------------------------------------------------------------------------------------------- installing
function cc_lib_installed() { return cc_lib_read_json(cc_lib_dir() . '/installed.json', []); }
// Copies the kit's images into the media library (folder "Library/<name>"); returns name => address
function cc_lib_copy_assets(array $kit, $baseDir) {
    $dir = cc_lib_uploads_dir();
    if (!$kit['assets']) return [];
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (isset($GLOBALS['CC_HT_UPLOADS'])) ensure_htaccess($dir, $GLOBALS['CC_HT_UPLOADS']);
    $folder = cc_media_folder_path('Library/' . cc_lib_text($kit['manifest']['name'] ?? $kit['id'], 40));
    $urls = []; $made = [];
    foreach ($kit['assets'] as $name => $bytes) {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $base = str_replace('.', '-', preg_replace('/[^a-zA-Z0-9._-]/', '', pathinfo($name, PATHINFO_FILENAME))) ?: 'image';
        $fname = time() . '_' . $kit['id'] . '-' . $base . '.' . $ext;
        if (file_exists("$dir/$fname")) $fname = time() . '_' . bin2hex(random_bytes(3)) . '_' . $kit['id'] . '-' . $base . '.' . $ext;
        file_put_contents("$dir/$fname", $bytes);
        @cc_media_process($dir, $fname);
        $urls[$name] = $baseDir . '/uploads/' . $fname; $made[] = $fname;
    }
    if ($folder) cc_media_move($made, $folder);
    return $urls;
}
// Installs a read, valid kit. $opts: design (apply a site kit's header, footer, menu and colours). Returns ['success', 'message', 'result']
function cc_lib_install($pdo, array $kit, array $opts, $user, $baseDir) {
    if ($kit['errors']) return ['success' => false, 'message' => 'The kit was not installed.', 'errors' => $kit['errors']];
    $urls = cc_lib_copy_assets($kit, $baseDir);
    $dropped = 0; $now = date('Y-m-d H:i:s'); $cschema = cc_version()['content_schema'];
    $res = ['pages' => [], 'templates' => 0, 'design' => false, 'images' => count($urls), 'dropped_code' => 0];
    $c = $kit['content']; $name = cc_lib_text($kit['manifest']['name'] ?? $kit['id'], 80);
    $addPage = function ($p, $blocks, $isHome) use ($pdo, $user, $now, $cschema, &$res, &$dropped, $urls) {
        $f = cc_lib_page_fields($p);
        $f['slug'] = cc_lib_unique_slug($pdo, $f['slug']);
        $b = cc_lib_prepare_blocks($blocks, $urls, $dropped);
        $content = json_encode($b);
        $id = 'page_' . uniqid();
        $pdo->prepare("INSERT INTO pages (id, parent_id, title, slug, clean_slug, seo_title, seo_description, layout, bg_color, boxed_width, content_json, status, is_draft_copy, content_schema, author, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            ->execute([$id, null, $f['title'], $f['slug'], $f['slug'], $f['seo_title'], $f['seo_description'], $f['layout'], $f['bg_color'], $f['boxed_width'], $content, 'draft', 0, $cschema, $user, $user, $now]);
        cc_add_revision($pdo, $id, $f['title'], $content, 'draft');
        $res['pages'][] = ['id' => $id, 'title' => $f['title'], 'slug' => $f['slug'], 'home' => (bool)$isHome];
    };
    $pdo->beginTransaction();
    try {
        if ($kit['type'] === 'page') {
            $addPage($c['page'] ?? ['title' => $name], $c['blocks'] ?? [], false);
        } elseif ($kit['type'] === 'section') {
            foreach ($c['sections'] as $s) {
                $one = cc_lib_prepare_blocks([$s['block']], $urls, $dropped);
                if (!$one) continue;
                $pdo->prepare("INSERT INTO templates (id, name, content_json) VALUES (?, ?, ?)")->execute([uniqid('tpl_'), mb_substr($name . ': ' . (cc_lib_text($s['name'] ?? '', 60) ?: 'Section'), 0, 120), json_encode($one[0])]);
                $res['templates']++;
            }
        } else {
            foreach ($c['pages'] as $p) $addPage($p, $p['blocks'] ?? [], !empty($p['home']));
            if (!empty($opts['design'])) $res['design'] = cc_lib_apply_design($pdo, $kit, $urls, $dropped, $user);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => 'The kit could not be installed: ' . $e->getMessage(), 'errors' => []];
    }
    $res['dropped_code'] = $dropped;
    $log = cc_lib_installed();
    $install = ['install_id' => bin2hex(random_bytes(6)), 'id' => $kit['id'], 'name' => $name, 'version' => (string)($kit['manifest']['version'] ?? ''), 'type' => $kit['type'], 'at' => $now, 'user' => $user,
                'pages' => array_column($res['pages'], 'id'), 'templates' => $res['templates'], 'design' => is_array($res['design']) ? true : false, 'undo' => is_array($res['design']) ? $res['design']['undo'] : ''];
    array_unshift($log, $install);
    cc_lib_write_json(cc_lib_dir() . '/installed.json', array_slice($log, 0, 100));
    if (is_array($res['design'])) { $res['design'] = true; }
    $res['install_id'] = $install['install_id'];
    $what = $kit['type'] === 'page' ? 'a draft page' : ($kit['type'] === 'section' ? $res['templates'] . ' section' . ($res['templates'] === 1 ? '' : 's') . ' in Add › My templates' : count($res['pages']) . ' draft page' . (count($res['pages']) === 1 ? '' : 's') . ($res['design'] ? ', the header, footer, menu and colours' : ''));
    return ['success' => true, 'message' => "\"$name\" is installed: $what.", 'result' => $res];
}
// A site kit's header, footer, menu and colours. The previous ones are kept in a safety copy first (library/undo-<id>.json)
function cc_lib_apply_design($pdo, array $kit, array $urls, &$dropped, $user) {
    $c = $kit['content'];
    $dataDir = cc_lib_data_dir();
    $snap = ['header' => null, 'footer' => null, 'menu' => null, 'settings' => null, 'at' => date('c')];
    foreach (['header', 'footer'] as $part) {
        $st = $pdo->prepare("SELECT content_json FROM site_parts WHERE name = ?"); $st->execute([$part]);
        $v = $st->fetchColumn(); $snap[$part] = $v === false ? null : (string)$v;
    }
    $snap['menu'] = is_file("$dataDir/menu.json") ? file_get_contents("$dataDir/menu.json") : null;
    $snap['settings'] = is_file("$dataDir/settings.json") ? file_get_contents("$dataDir/settings.json") : null;
    $undoFile = 'undo-' . bin2hex(random_bytes(6)) . '.json';
    cc_lib_write_json(cc_lib_dir() . '/' . $undoFile, $snap);
    foreach (['header', 'footer'] as $part) {
        if (!array_key_exists($part, $c)) continue;
        $blocks = cc_lib_prepare_blocks($c[$part], $urls, $dropped);
        $pdo->prepare("INSERT INTO site_parts (name, content_json, content_schema) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET content_json = excluded.content_json, content_schema = excluded.content_schema")
            ->execute([$part, json_encode($blocks), cc_version()['content_schema']]);
    }
    if (isset($c['menu']) && is_array($c['menu'])) {
        $cur = $snap['menu'] !== null ? (json_decode($snap['menu'], true) ?: []) : [];
        $cur['items'] = cc_lib_menu_clean($c['menu']);
        cc_write_file("$dataDir/menu.json", json_encode($cur, JSON_UNESCAPED_UNICODE));
    }
    $design = cc_lib_design_clean(cc_lib_prepare_strings($c['design'] ?? [], $urls));
    if ($design) {
        $cur = $snap['settings'] !== null ? (json_decode($snap['settings'], true) ?: []) : [];
        cc_write_file("$dataDir/settings.json", json_encode(array_merge($cur, $design), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    return ['undo' => $undoFile];
}
function cc_lib_prepare_strings($v, array $urls) {
    if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = cc_lib_prepare_strings($x, $urls); return $v; }
    return is_string($v) && strpos($v, 'kit:assets/') !== false ? preg_replace_callback('~kit:assets/([A-Za-z0-9._-]+)~', function ($m) use ($urls) { return $urls[$m[1]] ?? ''; }, $v) : $v;
}
// Puts back the header, footer, menu and settings an install replaced. Returns [ok, message]
function cc_lib_undo($pdo, $installId) {
    $log = cc_lib_installed();
    foreach ($log as $i => $row) {
        if (($row['install_id'] ?? '') !== $installId) continue;
        if (empty($row['undo']) || !preg_match('/^undo-[0-9a-f]{12}\.json$/', $row['undo']) || !is_file(cc_lib_dir() . '/' . $row['undo'])) return [false, 'There is nothing to restore for this install.'];
        $snap = cc_lib_read_json(cc_lib_dir() . '/' . $row['undo']);
        $dataDir = cc_lib_data_dir();
        foreach (['header', 'footer'] as $part) {
            if (($snap[$part] ?? null) === null) $pdo->prepare("DELETE FROM site_parts WHERE name = ?")->execute([$part]);
            else $pdo->prepare("INSERT INTO site_parts (name, content_json, content_schema) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET content_json = excluded.content_json, content_schema = excluded.content_schema")->execute([$part, (string)$snap[$part], cc_version()['content_schema']]);
        }
        foreach (['menu' => 'menu.json', 'settings' => 'settings.json'] as $k => $file) {
            if (($snap[$k] ?? null) === null) @unlink("$dataDir/$file"); else cc_write_file("$dataDir/$file", $snap[$k]);
        }
        @unlink(cc_lib_dir() . '/' . $row['undo']);
        $log[$i]['undo'] = ''; $log[$i]['restored'] = date('Y-m-d H:i:s');
        cc_lib_write_json(cc_lib_dir() . '/installed.json', $log);
        return [true, 'The header, footer, menu and colours from before the install are back.'];
    }
    return [false, 'That install was not found.'];
}
