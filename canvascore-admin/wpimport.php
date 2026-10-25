<?php
// canvascore-admin/wpimport.php
// WordPress importer: pages, posts, categories, tags and images from a WordPress export file (WXR, "Tools > Export").
//  - analyze:  the file is read once as a stream (no entities, no network) and split into small files in a job folder
//              (<data>/imports/<job>/): pages, posts, images and a summary. Nothing is changed in the site yet.
//  - start:    the collection for the posts, its Categories and Tags, and the new address of every page and post
//              (so links between imported pages can be rewritten) are decided.
//  - step:     a slice of work (images first, then pages, then posts), repeated by the editor until it is finished.
//              A step can be repeated safely: progress is saved after every item.
// Content is converted to blocks: paragraphs, headings, lists, quotes and tables become Text blocks; pictures Image blocks;
// YouTube / Vimeo links Video blocks; <pre> Code Snippet blocks; rules Dividers. Everything passes cc_sanitize_blocks like
// a normal save. Images are downloaded only from public web addresses (cc_wp_url_check) and pass the same checks as an upload.
// Library file: included by the endpoints, never opened directly
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/media.php';

const CC_WP_MAX_FILE = 209715200;    // 200 MB of export file
const CC_WP_MAX_ITEMS = 50000;
const CC_WP_MAX_IMAGE = 26214400;    // 25 MB per downloaded image
const CC_WP_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'];
const CC_WP_WARN_MAX = 60;

function cc_wp_dir() { return $GLOBALS['CC_WP_DIR'] ?? (cc_data_dir() . '/imports'); }   // overridable for tests
function cc_wp_job_id($id) { return is_string($id) && preg_match('/^[a-f0-9]{16}$/', $id) ? $id : ''; }
function cc_wp_job_path($id, $file = '') {
    $id = cc_wp_job_id($id);
    return $id === '' ? '' : cc_wp_dir() . '/' . $id . ($file !== '' ? '/' . $file : '');
}
function cc_wp_rrmdir($dir) {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $f) { if ($f === '.' || $f === '..') continue; $p = "$dir/$f"; is_dir($p) && !is_link($p) ? cc_wp_rrmdir($p) : @unlink($p); }
    @rmdir($dir);
}
function cc_wp_read_json($path, $default = []) {
    $raw = is_file($path) ? file_get_contents($path) : false;
    $v = $raw === false ? null : json_decode($raw, true);
    return is_array($v) ? $v : $default;
}
function cc_wp_write_json($path, $v) {
    $tmp = $path . '.tmp';
    file_put_contents($tmp, json_encode($v, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES));
    rename($tmp, $path);
}
function cc_wp_put_line($fh, $row) { fwrite($fh, json_encode($row, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES) . "\n"); }
// Lines of a .jsonl file from a byte offset: [rows, newOffset]; stops after $max rows
function cc_wp_read_lines($path, $offset, $max) {
    $rows = [];
    $fh = @fopen($path, 'rb');
    if (!$fh) return [[], $offset];
    fseek($fh, $offset);
    while (count($rows) < $max && ($line = fgets($fh)) !== false) {
        if (substr($line, -1) !== "\n") break;
        $offset += strlen($line);
        $r = json_decode($line, true);
        if (is_array($r)) $rows[] = $r;
    }
    fclose($fh);
    return [$rows, $offset];
}
function cc_wp_count_lines($path) {
    $n = 0; $fh = @fopen($path, 'rb');
    if (!$fh) return 0;
    while (fgets($fh) !== false) $n++;
    fclose($fh);
    return $n;
}

// ---------------------------------------------------------------------------
// Reading the export file
// ---------------------------------------------------------------------------
function cc_wp_text($v, $max = 100000) { return mb_substr(trim((string)$v), 0, $max); }
// The children of an element by their tag name ("wp:post_id", "content:encoded"): the text, or for repeated ones a list
function cc_wp_kids($el) {
    $out = ['category' => [], 'wp:postmeta' => []];
    foreach ($el->childNodes as $c) {
        if (!($c instanceof DOMElement)) continue;
        $n = $c->nodeName;
        if ($n === 'category') $out['category'][] = ['domain' => $c->getAttribute('domain'), 'nicename' => $c->getAttribute('nicename'), 'name' => $c->textContent];
        elseif ($n === 'wp:postmeta') {
            $k = ''; $v = '';
            foreach ($c->childNodes as $m) { if ($m->nodeName === 'wp:meta_key') $k = $m->textContent; elseif ($m->nodeName === 'wp:meta_value') $v = $m->textContent; }
            if ($k !== '') $out['wp:postmeta'][$k] = $v;
        } elseif (!isset($out[$n])) $out[$n] = $c->textContent;
    }
    return $out;
}
function cc_wp_pathkey($url) {
    // the part of an uploads address that identifies the file, without the host or a "-300x200" size suffix
    $p = (string)parse_url(html_entity_decode((string)$url), PHP_URL_PATH);
    if (preg_match('#/uploads/(.+)$#i', $p, $m)) $p = $m[1]; else $p = ltrim($p, '/');
    $p = rawurldecode($p);
    $p = preg_replace('/-(?:scaled|e\d{10,})(?=\.[a-z0-9]+$)/i', '', $p);
    $p = preg_replace('/-\d{1,5}x\d{1,5}(?=\.[a-z0-9]+$)/i', '', $p);
    return strtolower($p);
}
function cc_wp_seo($meta) {
    $clean = function ($v) { $v = cc_wp_text(strip_tags((string)$v), 1000); return $v === '' || preg_match('/%[a-z_]+%|%%/i', $v) ? '' : $v; };
    return [
        'title' => $clean($meta['_yoast_wpseo_title'] ?? ($meta['rank_math_title'] ?? '')),
        'desc'  => $clean($meta['_yoast_wpseo_metadesc'] ?? ($meta['rank_math_description'] ?? '')),
    ];
}

// Reads the export and writes the job folder. Returns ['job' => id, 'summary' => [...]] or ['error' => message]
function cc_wp_analyze($file) {
    if (!is_file($file) || filesize($file) < 50) return ['error' => 'That file is empty.'];
    if (filesize($file) > CC_WP_MAX_FILE) return ['error' => 'The file is larger than ' . round(CC_WP_MAX_FILE / 1048576) . ' MB. Export your content in parts (Tools > Export > Posts, then Pages) and import them one after the other.'];
    if (!class_exists('XMLReader') || !class_exists('DOMDocument')) return ['error' => 'This server has no XML support (the PHP xml extension). Ask your host to enable it.'];
    $head = (string)file_get_contents($file, false, null, 0, 8192);
    if (stripos($head, '<!DOCTYPE') !== false || stripos($head, '<!ENTITY') !== false) return ['error' => 'This is not a WordPress export file (it declares a document type).'];
    if (stripos($head, '<rss') === false && stripos($head, '<channel') === false) return ['error' => 'This does not look like a WordPress export file. In WordPress choose Tools > Export > All content and upload the .xml file you get.'];

    cc_wp_cleanup_old();
    $job = bin2hex(random_bytes(8));
    $dir = cc_wp_job_path($job);
    if (!@mkdir($dir, 0700, true) && !is_dir($dir)) return ['error' => 'The import folder cannot be created. Check that the data folder is writable.'];
    @file_put_contents(cc_wp_dir() . '/.htaccess', "Require all denied\n");
    @file_put_contents(cc_wp_dir() . '/index.html', '');

    $fp = fopen("$dir/pages.jsonl", 'wb'); $fo = fopen("$dir/posts.jsonl", 'wb'); $fa = fopen("$dir/media.jsonl", 'wb');
    $meta = ['site' => ['title' => '', 'url' => ''], 'categories' => [], 'tags' => [], 'counts' => ['pages' => 0, 'posts' => 0, 'media' => 0, 'categories' => 0, 'tags' => 0],
             'skipped' => [], 'created' => gmdate('c')];
    $prev = libxml_use_internal_errors(true);
    $r = new XMLReader();
    $ok = $r->open($file, 'UTF-8', LIBXML_NONET | LIBXML_COMPACT);
    $items = 0; $broken = false;
    $skip = function ($why) use (&$meta) { $meta['skipped'][$why] = ($meta['skipped'][$why] ?? 0) + 1; };
    if ($ok) {
        $doc = new DOMDocument();
        while (@$r->read()) {
            if ($r->nodeType !== XMLReader::ELEMENT) continue;
            $name = $r->name;
            if ($r->depth === 2 && $name === 'item') {
                if (++$items > CC_WP_MAX_ITEMS) { $broken = 'The file holds more than ' . CC_WP_MAX_ITEMS . ' entries. Export it in parts.'; break; }
                $node = @$r->expand($doc);
                if (!$node) continue;
                $k = cc_wp_kids($node);
                $type = $k['wp:post_type'] ?? '';
                $status = $k['wp:status'] ?? '';
                $id = (int)($k['wp:post_id'] ?? 0);
                if ($type === 'attachment') {
                    $url = cc_wp_text($k['wp:attachment_url'] ?? '', 2000);
                    if ($url === '') { $skip('attachments without a file'); continue; }
                    cc_wp_put_line($fa, ['id' => $id, 'url' => $url, 'title' => cc_wp_text($k['title'] ?? '', 300), 'alt' => cc_wp_text($k['wp:postmeta']['_wp_attachment_image_alt'] ?? '', 500)]);
                    $meta['counts']['media']++;
                } elseif ($type === 'page' || $type === 'post') {
                    if (in_array($status, ['trash', 'auto-draft', 'inherit'], true)) { $skip("$type in the trash"); continue; }
                    if (cc_wp_text($k['wp:post_password'] ?? '') !== '') { $skip('password-protected ' . $type . 's'); continue; }
                    $cats = []; $tags = [];
                    foreach ($k['category'] as $c) {
                        $slug = cc_tax_slug($c['nicename'] !== '' ? $c['nicename'] : $c['name']);
                        if ($slug === '') continue;
                        if ($c['domain'] === 'category') { $cats[] = $slug; $meta['categories'][$slug] = $meta['categories'][$slug] ?? ['slug' => $slug, 'name' => cc_wp_text($c['name'], 80), 'description' => '']; }
                        elseif ($c['domain'] === 'post_tag') { $tags[] = $slug; $meta['tags'][$slug] = $meta['tags'][$slug] ?? ['slug' => $slug, 'name' => cc_wp_text($c['name'], 80), 'description' => '']; }
                    }
                    $date = cc_wp_text($k['wp:post_date'] ?? '');
                    $row = ['id' => $id, 'type' => $type, 'title' => cc_wp_text($k['title'] ?? '', 300), 'slug' => cc_wp_text($k['wp:post_name'] ?? '', 200),
                            'link' => cc_wp_text($k['link'] ?? '', 2000), 'date' => preg_match('/^\d{4}-\d{2}-\d{2}/', $date) ? substr($date, 0, 10) : '',
                            'status' => $status === 'publish' ? 'published' : 'draft', 'wp_status' => $status,
                            'content' => (string)($k['content:encoded'] ?? ''), 'excerpt' => cc_wp_text($k['excerpt:encoded'] ?? '', 4000),
                            'cats' => array_values(array_unique($cats)), 'tags' => array_values(array_unique($tags)),
                            'thumb' => (int)($k['wp:postmeta']['_thumbnail_id'] ?? 0), 'seo' => cc_wp_seo($k['wp:postmeta'])];
                    if ($type === 'page') { cc_wp_put_line($fp, $row); $meta['counts']['pages']++; }
                    else { cc_wp_put_line($fo, $row); $meta['counts']['posts']++; }
                } else {
                    $skip($type === '' ? 'other entries' : "$type entries");
                }
            } elseif ($r->depth === 2 && ($name === 'wp:category' || $name === 'wp:tag')) {
                $node = @$r->expand($doc);
                if (!$node) continue;
                $isCat = $name === 'wp:category';
                $slug = $name = '';
                $desc = '';
                foreach ($node->childNodes as $c) {
                    if ($c->nodeName === ($isCat ? 'wp:category_nicename' : 'wp:tag_slug')) $slug = $c->textContent;
                    elseif ($c->nodeName === ($isCat ? 'wp:cat_name' : 'wp:tag_name')) $name = $c->textContent;
                    elseif ($c->nodeName === ($isCat ? 'wp:category_description' : 'wp:tag_description')) $desc = $c->textContent;
                }
                $slug = cc_tax_slug($slug !== '' ? $slug : $name);
                if ($slug !== '') $meta[$isCat ? 'categories' : 'tags'][$slug] = ['slug' => $slug, 'name' => cc_wp_text($name !== '' ? $name : $slug, 80), 'description' => cc_wp_text(strip_tags($desc), 500)];
            } elseif ($r->depth === 2 && $name === 'wp:base_site_url') { $meta['site']['url'] = cc_wp_text($r->readString(), 500); }
            elseif ($r->depth === 2 && $name === 'title' && $meta['site']['title'] === '') { $meta['site']['title'] = cc_wp_text($r->readString(), 200); }
            elseif ($r->depth === 2 && $name === 'link' && $meta['site']['url'] === '') { $meta['site']['url'] = cc_wp_text($r->readString(), 500); }
        }
        $r->close();
    }
    $xmlErr = libxml_get_last_error();
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    fclose($fp); fclose($fo); fclose($fa);
    if (!$ok || $broken !== false || ($items === 0 && $xmlErr)) {
        cc_wp_rrmdir($dir);
        return ['error' => $broken !== false ? $broken : 'The file could not be read as a WordPress export' . ($xmlErr ? ' (' . trim($xmlErr->message) . ')' : '') . '.'];
    }
    if (!array_sum([$meta['counts']['pages'], $meta['counts']['posts'], $meta['counts']['media']])) {
        cc_wp_rrmdir($dir);
        return ['error' => 'The file holds no pages, posts or images. Export "All content" in WordPress (Tools > Export).'];
    }
    $meta['categories'] = array_values($meta['categories']); $meta['tags'] = array_values($meta['tags']);
    $meta['counts']['categories'] = count($meta['categories']); $meta['counts']['tags'] = count($meta['tags']);
    cc_wp_write_json("$dir/meta.json", $meta);
    cc_wp_write_json("$dir/state.json", ['phase' => 'analyzed']);
    return ['job' => $job, 'summary' => cc_wp_summary($meta, $dir)];
}
function cc_wp_summary($meta, $dir) {
    $titles = function ($file) { [$rows] = cc_wp_read_lines($file, 0, 5); return array_map(function ($r) { return $r['title'] !== '' ? $r['title'] : '(no title)'; }, $rows); };
    return ['site' => $meta['site'], 'counts' => $meta['counts'], 'skipped' => $meta['skipped'],
            'sample_pages' => $titles("$dir/pages.jsonl"), 'sample_posts' => $titles("$dir/posts.jsonl")];
}
function cc_wp_cleanup_old() {
    foreach (glob(cc_wp_dir() . '/*', GLOB_ONLYDIR) ?: [] as $d) if (filemtime($d) < time() - 7 * 86400) cc_wp_rrmdir($d);
}
function cc_wp_discard($job) {
    $d = cc_wp_job_path($job);
    if ($d === '' || !is_dir($d)) return false;
    cc_wp_rrmdir($d);
    return true;
}

// ---------------------------------------------------------------------------
// Downloading images (public web addresses only)
// ---------------------------------------------------------------------------
// [true, ip] when the address may be fetched; [false, reason] otherwise. Only http(s) on the usual ports, no credentials in
// the address, and every address the host name resolves to must be public (no loopback, private, link-local or reserved).
function cc_wp_url_check($url) {
    $u = parse_url((string)$url);
    if (!$u || !isset($u['scheme'], $u['host'])) return [false, 'not a web address'];
    if (!in_array(strtolower($u['scheme']), ['http', 'https'], true)) return [false, 'not an http(s) address'];
    if (isset($u['user']) || isset($u['pass'])) return [false, 'the address has a user name or password'];
    $port = $u['port'] ?? (strtolower($u['scheme']) === 'https' ? 443 : 80);
    if (!in_array($port, [80, 443, 8080, 8443], true)) return [false, 'unusual port'];
    $host = trim(strtolower($u['host']), '[]');
    if (preg_match('/[\x00-\x20\x7f]/', $host)) return [false, 'bad host name'];
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
    elseif (isset($GLOBALS['CC_WP_RESOLVE']) && is_callable($GLOBALS['CC_WP_RESOLVE'])) $ips = (array)$GLOBALS['CC_WP_RESOLVE']($host);   // tests
    else $ips = gethostbynamel($host) ?: [];
    if (!$ips) return [false, 'the host name does not resolve'];
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return [false, 'the address points to a private or reserved network'];
        $n = ip2long($ip);
        if ($n !== false && ($n & 0xFFC00000) === 0x64400000) return [false, 'the address points to a private or reserved network'];   // 100.64.0.0/10 (shared address space)
    }
    return [true, $ips[0]];
}
// Downloads a public image address into a temporary file: [path, error]. Redirects are followed by hand (3 at most) and every
// hop is checked again; the connection is pinned to the checked IP address. Overridable for tests: $GLOBALS['CC_WP_FETCH'].
function cc_wp_fetch($url, $maxBytes = CC_WP_MAX_IMAGE) {
    if (isset($GLOBALS['CC_WP_FETCH']) && is_callable($GLOBALS['CC_WP_FETCH'])) return $GLOBALS['CC_WP_FETCH']($url, $maxBytes);
    if (!function_exists('curl_init')) return [null, 'this server has no PHP curl extension'];
    for ($hop = 0; $hop < 4; $hop++) {
        [$ok, $ip] = cc_wp_url_check($url);
        if (!$ok) return [null, $ip];
        $u = parse_url($url);
        $port = $u['port'] ?? (strtolower($u['scheme']) === 'https' ? 443 : 80);
        $tmp = tempnam(sys_get_temp_dir(), 'ccwp');
        $fh = fopen($tmp, 'wb');
        $got = 0; $headers = [];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 25, CURLOPT_USERAGENT => 'CanvasCore importer',
            CURLOPT_RESOLVE => [strtolower($u['host']) . ':' . $port . ':' . $ip],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$headers) { $p = explode(':', $h, 2); if (count($p) === 2) $headers[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); },
            CURLOPT_WRITEFUNCTION => function ($c, $d) use ($fh, &$got, $maxBytes) { $got += strlen($d); if ($got > $maxBytes) return 0; return fwrite($fh, $d); },
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch);
        curl_close($ch); fclose($fh);
        if ($code >= 300 && $code < 400 && !empty($headers['location'])) {
            @unlink($tmp);
            $loc = $headers['location'];
            if (!preg_match('#^https?://#i', $loc)) {   // a relative redirect
                $base = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
                $loc = $base . ($loc[0] === '/' ? '' : '/') . $loc;
            }
            $url = $loc;
            continue;
        }
        if ($got > $maxBytes) { @unlink($tmp); return [null, 'the file is larger than ' . round($maxBytes / 1048576) . ' MB']; }
        if ($code !== 200) { @unlink($tmp); return [null, $err !== '' ? $err : "the server answered $code"]; }
        return [$tmp, ''];
    }
    return [null, 'too many redirects'];
}
// Puts a downloaded image into the uploads folder after the checks an upload makes. [url, error]
function cc_wp_store_image($tmp, $sourceUrl, $uploadsDir, $baseDir) {
    $orig = rawurldecode(basename((string)parse_url($sourceUrl, PHP_URL_PATH)));
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if ($ext === 'svg') {
        if (!cc_svg_is_safe($tmp)) return [null, 'the SVG contains scripts or other active content'];
    } else {
        // the file's own type decides the extension (an address often has none, or a wrong one)
        $info = @getimagesize($tmp);
        if ($info === false) return [null, 'the file is not a valid image'];
        $real = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp', IMAGETYPE_BMP => 'bmp'][$info[2]] ?? (defined('IMAGETYPE_AVIF') && $info[2] === IMAGETYPE_AVIF ? 'avif' : '');
        if ($real === '') return [null, 'not an image type CanvasCore accepts'];
        if (!($ext === $real || ($ext === 'jpeg' && $real === 'jpg'))) { $orig = pathinfo($orig, PATHINFO_FILENAME) . '.' . $real; $ext = $real; }
    }
    if (!is_dir($uploadsDir)) @mkdir($uploadsDir, 0755, true);
    if (isset($GLOBALS['CC_HT_UPLOADS'])) ensure_htaccess($uploadsDir, $GLOBALS['CC_HT_UPLOADS']);
    $safe = ltrim(preg_replace('/[^a-zA-Z0-9._-]/', '', $orig), '.-');
    if ($safe === '' || strtolower(pathinfo($safe, PATHINFO_EXTENSION)) !== $ext) $safe = 'image.' . $ext;
    $fname = time() . '_' . $safe;
    if (file_exists("$uploadsDir/$fname")) $fname = time() . '_' . bin2hex(random_bytes(3)) . '_' . $safe;
    if (!@copy($tmp, "$uploadsDir/$fname")) return [null, 'the file could not be saved'];
    @cc_media_process($uploadsDir, $fname);
    return [$baseDir . '/uploads/' . $fname, ''];
}

// ---------------------------------------------------------------------------
// Content: WordPress HTML -> blocks
// ---------------------------------------------------------------------------
function cc_wp_block_defaults($type) {
    static $defs = null;
    if ($defs === null) $defs = (cc_wp_read_json(__DIR__ . '/blocks.json')['types'] ?? []);
    return $defs[$type] ?? ['content' => [], 'styles' => []];
}
function cc_wp_block($type, $content) {
    static $n = 0;
    $d = cc_wp_block_defaults($type);
    return ['id' => 'block-' . base_convert((string)time(), 10, 36) . '-' . base_convert((string)(++$n), 10, 36) . bin2hex(random_bytes(3)), 'type' => $type,
            'content' => array_merge((array)($d['content'] ?? []), $content), 'styles' => (object)($d['styles'] ?? [])];
}
function cc_wp_video_url($src) {
    $src = html_entity_decode(trim((string)$src));
    if (preg_match('#^(?:https?:)?//(?:www\.|m\.)?youtube(?:-nocookie)?\.com/(?:embed/|watch\?(?:[^\s"<>]*&)?v=)([A-Za-z0-9_-]{6,15})#i', $src, $m)) return 'https://www.youtube.com/watch?v=' . $m[1];
    if (preg_match('#^(?:https?:)?//youtu\.be/([A-Za-z0-9_-]{6,15})#i', $src, $m)) return 'https://www.youtube.com/watch?v=' . $m[1];
    if (preg_match('#^(?:https?:)?//(?:www\.)?vimeo\.com/(\d{5,12})#i', $src, $m) || preg_match('#^(?:https?:)?//player\.vimeo\.com/video/(\d{5,12})#i', $src, $m)) return 'https://vimeo.com/' . $m[1];
    return '';
}
function cc_wp_code_language($class) {
    if (!preg_match('/(?:language|lang)-([a-z0-9+#-]+)/i', (string)$class, $m)) return 'text';
    $map = ['html' => 'html', 'xml' => 'html', 'css' => 'css', 'js' => 'js', 'javascript' => 'js', 'json' => 'json', 'php' => 'php', 'bash' => 'shell', 'sh' => 'shell', 'shell' => 'shell', 'zsh' => 'shell'];
    return $map[strtolower($m[1])] ?? 'text';
}

// $ctx: 'media' => fn(url): local url or null; 'media_id' => fn(id): [url, alt] or null; 'link' => fn(href): new href or null;
//       'warn' => fn(message)
function cc_wp_blocks($html, $ctx) {
    $warn = $ctx['warn'] ?? function () {};
    $html = (string)$html;
    $html = preg_replace('/<!--.*?-->/s', '', $html);
    // [caption]...[/caption] -> a figure; [gallery ids="1,2"] -> its images; other shortcodes are dropped
    // old posts have no paragraph tags: blank lines separate paragraphs
    if (!preg_match('/<(p|div|h[1-6]|ul|ol|blockquote|pre|figure|table|hr)\b/i', $html)) {
        $paras = preg_split('/\R\s*\R/', trim($html));
        $html = implode('', array_map(function ($p) { return '<p>' . nl2br(trim($p)) . '</p>'; }, array_filter($paras, function ($p) { return trim($p) !== ''; })));
    }
    $html = preg_replace('/(?:<p>\s*)?\[caption[^\]]*\](.*?)\[\/caption\](?:\s*<\/p>)?/is', '<figure>$1</figure>', $html);
    $html = preg_replace_callback('/(?:<p>\s*)?\[gallery[^\]]*\bids="([0-9, ]+)"[^\]]*\](?:\s*<\/p>)?/i', function ($m) use ($ctx) {
        $out = '';
        foreach (preg_split('/\s*,\s*/', trim($m[1])) as $id) {
            $img = isset($ctx['media_id']) ? $ctx['media_id']((int)$id) : null;
            if ($img) $out .= '<figure><img src="' . htmlspecialchars($img[0], ENT_QUOTES) . '" alt="' . htmlspecialchars($img[1], ENT_QUOTES) . '"></figure>';
        }
        return $out;
    }, $html);
    $html = preg_replace_callback('/\[\/?([a-z][a-z0-9_-]*)(?:\s[^\]]*)?\]/i', function ($m) use ($warn) { $warn('shortcode [' . $m[1] . '] was left out'); return ''; }, $html);
    if (trim($html) === '') return [];
    $prev = libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    @$dom->loadHTML('<?xml encoding="utf-8"?><body>' . $html . '</body>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body) return [];

    // addresses and attributes first: pictures and links point into the new site, WordPress classes are dropped
    foreach (iterator_to_array($dom->getElementsByTagName('*')) as $el) {
        if ($el->nodeName !== 'pre' && $el->nodeName !== 'code') $el->removeAttribute('class');
        foreach (['id', 'srcset', 'sizes', 'loading', 'decoding', 'data-id', 'data-link', 'data-type'] as $a) $el->removeAttribute($a);
        foreach (iterator_to_array($el->attributes) as $at) if (strpos($at->name, 'data-') === 0 || strpos($at->name, 'aria-') === 0) $el->removeAttribute($at->name);
        if ($el->nodeName === 'img') {
            $src = html_entity_decode($el->getAttribute('src'));
            $local = isset($ctx['media']) ? $ctx['media']($src) : null;
            if ($local) $el->setAttribute('src', $local);
            elseif (preg_match('#^https?://#i', $src)) $warn('a picture stays on the old site (' . parse_url($src, PHP_URL_HOST) . ')');
        } elseif ($el->nodeName === 'a' && $el->hasAttribute('href')) {
            $new = isset($ctx['link']) ? $ctx['link'](html_entity_decode($el->getAttribute('href'))) : null;
            if ($new) $el->setAttribute('href', str_replace('{{BASE_URL}}', '@@CCBASE@@', $new));   // the DOM would percent-encode the braces
        }
    }

    $blocks = []; $buf = '';
    $flush = function () use (&$buf, &$blocks) {
        $plain = trim(html_entity_decode(strip_tags($buf, '<img><hr>'), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\xC2\xA0");
        if ($plain !== '') $blocks[] = cc_wp_block('TEXT', ['text' => str_replace(['@@CCBASE@@', '%40%40CCBASE%40%40'], '{{BASE_URL}}', trim($buf))]);
        $buf = '';
    };
    $outer = function (DOMNode $n) use ($dom) { return $dom->saveHTML($n); };
    $imgOf = function (DOMNode $n) {
        if (!($n instanceof DOMElement)) return null;
        $i = $n->nodeName === 'img' ? $n : ($n->getElementsByTagName('img')->item(0));
        return $i instanceof DOMElement && $i->getAttribute('src') !== '' ? $i : null;
    };
    $imageBlock = function (DOMElement $img) use (&$blocks) {
        $blocks[] = cc_wp_block('IMAGE', ['src' => $img->getAttribute('src'), 'alt' => $img->getAttribute('alt')]);
    };
    $handle = null;
    $handle = function (DOMNode $n) use (&$handle, &$buf, &$blocks, $flush, $outer, $imgOf, $imageBlock, $warn, $dom) {
        if ($n instanceof DOMText) {
            if (trim($n->textContent) !== '') $buf .= '<p>' . htmlspecialchars(trim($n->textContent)) . '</p>';
            return;
        }
        if (!($n instanceof DOMElement)) return;
        $t = strtolower($n->nodeName);
        switch ($t) {
            case 'script': case 'style': case 'noscript': case 'form': case 'object': case 'embed': case 'link': case 'meta':
                $warn($t === 'script' || $t === 'form' || $t === 'object' || $t === 'embed' ? "a $t element was left out" : 'a style element was left out');
                return;
            case 'img':
                $flush(); if ($imgOf($n)) $imageBlock($n); return;
            case 'figure':
                $img = $imgOf($n);
                if ($img) {
                    $flush(); $imageBlock($img);
                    $cap = $n->getElementsByTagName('figcaption')->item(0);
                    $capText = $cap ? trim($cap->textContent) : '';
                    if ($capText === '') foreach ($n->childNodes as $c) if ($c instanceof DOMText && trim($c->textContent) !== '') $capText = trim($c->textContent);
                    if ($capText !== '') $buf .= '<p><em>' . htmlspecialchars($capText) . '</em></p>';
                    return;
                }
                foreach (iterator_to_array($n->childNodes) as $c) $handle($c);
                return;
            case 'iframe':
                $v = cc_wp_video_url($n->getAttribute('src'));
                if ($v !== '') { $flush(); $blocks[] = cc_wp_block('VIDEO', ['url' => $v]); } else $warn('embedded content (' . (parse_url($n->getAttribute('src'), PHP_URL_HOST) ?: 'iframe') . ') was left out');
                return;
            case 'video': case 'audio':
                $warn("a $t file was left out (add it with the Audio Player or Video block)"); return;
            case 'hr':
                $flush(); $blocks[] = cc_wp_block('DIVIDER', []); return;
            case 'pre':
                $flush();
                $code = $n->getElementsByTagName('code')->item(0);
                $blocks[] = cc_wp_block('CODE_SNIPPET', ['code' => rtrim($n->textContent), 'language' => cc_wp_code_language(($code ? $code->getAttribute('class') : '') . ' ' . $n->getAttribute('class'))]);
                return;
            case 'p':
                $only = null; $text = '';
                foreach ($n->childNodes as $c) {
                    if ($c instanceof DOMText) { $text .= $c->textContent; continue; }
                    if ($c instanceof DOMElement && ($c->nodeName === 'img' || ($c->nodeName === 'a' && $imgOf($c) && trim($c->textContent) === ''))) { if ($only) { $only = false; break; } $only = $c; continue; }
                    $only = false; break;
                }
                if ($only && trim($text) === '' && ($img = $imgOf($only))) { $flush(); $imageBlock($img); return; }
                $plain = trim($n->textContent);
                if ($n->childNodes->length <= 2 && preg_match('#^https?://\S+$#', $plain) && ($v = cc_wp_video_url($plain)) !== '') { $flush(); $blocks[] = cc_wp_block('VIDEO', ['url' => $v]); return; }
                if ($n->getElementsByTagName('iframe')->length || $n->getElementsByTagName('script')->length) { foreach (iterator_to_array($n->childNodes) as $c) $handle($c); return; }
                $buf .= $outer($n); return;
            case 'a':
                if ($imgOf($n) && trim($n->textContent) === '') { $flush(); $imageBlock($imgOf($n)); return; }
                $buf .= $outer($n); return;
            case 'div': case 'section': case 'article': case 'main': case 'aside': case 'header': case 'footer':
                foreach (iterator_to_array($n->childNodes) as $c) $handle($c); return;
            default:
                if ($n->getElementsByTagName('iframe')->length || $n->getElementsByTagName('script')->length) { foreach (iterator_to_array($n->childNodes) as $c) $handle($c); return; }
                $buf .= $outer($n);
        }
    };
    foreach (iterator_to_array($body->childNodes) as $c) $handle($c);
    $flush();
    return $blocks;
}

// ---------------------------------------------------------------------------
// The import itself
// ---------------------------------------------------------------------------
function cc_wp_options($raw) {
    $raw = is_array($raw) ? $raw : [];
    return [
        'pages'       => !array_key_exists('pages', $raw) || !empty($raw['pages']),
        'posts'       => !array_key_exists('posts', $raw) || !empty($raw['posts']),
        'media'       => !array_key_exists('media', $raw) || !empty($raw['media']),
        'drafts'      => !array_key_exists('drafts', $raw) || !empty($raw['drafts']),
        'redirects'   => !array_key_exists('redirects', $raw) || !empty($raw['redirects']),
        'collection'  => is_string($raw['collection'] ?? null) ? mb_substr($raw['collection'], 0, 80) : '',          // an existing collection id
        'collection_name' => cc_field_text($raw['collection_name'] ?? 'Blog', 120) ?: 'Blog',
    ];
}
function cc_wp_unique_slug($base, $taken) {
    $base = cc_safe_slug($base) ?: 'untitled';
    $slug = $base; $n = 2;
    while (isset($taken[$slug]) || cc_slug_reserved($slug)) $slug = $base . '-' . $n++;
    return $slug;
}
function cc_wp_old_path($link, $siteUrl) {
    $p = parse_url($link);
    if (!$p || empty($p['path'])) return '';
    $sp = rtrim((string)parse_url($siteUrl, PHP_URL_PATH), '/');
    $path = $p['path'];
    if ($sp !== '' && strpos($path, $sp . '/') === 0) $path = substr($path, strlen($sp));
    return trim($path, '/');
}

// First stage after the options are chosen: the collection and its categories and tags, and the address of every item.
// Returns ['error' => ...] or ['ok' => true]
function cc_wp_start($pdo, $job, $optsRaw) {
    $dir = cc_wp_job_path($job);
    if ($dir === '' || !is_file("$dir/meta.json")) return ['error' => 'This import is no longer there. Upload the file again.'];
    $state = cc_wp_read_json("$dir/state.json");
    if (($state['phase'] ?? '') !== 'analyzed') return ['error' => 'This import was already started.'];
    $meta = cc_wp_read_json("$dir/meta.json");
    $opts = cc_wp_options($optsRaw);
    if (!$opts['pages'] && !$opts['posts'] && !$opts['media']) return ['error' => 'Choose something to import.'];
    $st = ['phase' => 'media', 'opts' => $opts, 'offsets' => ['media' => 0, 'pages' => 0, 'posts' => 0], 'done' => ['media' => 0, 'pages' => 0, 'posts' => 0],
           'totals' => ['media' => $opts['media'] ? (int)$meta['counts']['media'] : 0, 'pages' => $opts['pages'] ? (int)$meta['counts']['pages'] : 0, 'posts' => $opts['posts'] ? (int)$meta['counts']['posts'] : 0],
           'created' => ['pages' => 0, 'posts' => 0, 'media' => 0, 'terms' => 0, 'redirects' => 0], 'failed' => ['media' => 0, 'pages' => 0, 'posts' => 0],
           'warnings' => [], 'warn_counts' => [], 'collection' => ['id' => '', 'slug' => '', 'name' => ''], 'published' => 0];

    $pdo->beginTransaction();
    try {
        $terms = ['cats' => [], 'tags' => []];
        if ($opts['posts'] && $st['totals']['posts'] > 0) {
            // collection
            $cid = '';
            if ($opts['collection'] !== '') {
                $q = $pdo->prepare("SELECT id, name, slug FROM collections WHERE id = ?"); $q->execute([$opts['collection']]);
                if ($row = $q->fetch(PDO::FETCH_ASSOC)) { $st['collection'] = $row; $cid = $row['id']; }
                else throw new RuntimeException('The collection you chose no longer exists.');
            }
            if ($cid === '') {
                $slug = cc_safe_slug($opts['collection_name']) ?: 'blog'; $base = $slug; $n = 2;
                while (cc_slug_reserved($slug) || cc_wp_slug_in_use($pdo, $slug)) $slug = $base . '-' . $n++;
                $cid = 'col_' . uniqid();
                $pdo->prepare("INSERT INTO collections (id, name, slug, fields, schema_json, archive_json) VALUES (?,?,?,?,?,?)")->execute([$cid, $opts['collection_name'], $slug, '[]', '{}', '{}']);
                $st['collection'] = ['id' => $cid, 'name' => $opts['collection_name'], 'slug' => $slug];
            }
            // categories and tags: the terms are added to the collection's own taxonomies (found by their address, or made)
            foreach (['cats' => ['Categories', 'categories', 'categories'], 'tags' => ['Tags', 'tags', 'tags']] as $k => [$label, $tslug, $metaKey]) {
                $list = $meta[$metaKey] ?? [];
                if (!$list) continue;
                $q = $pdo->prepare("SELECT id FROM collection_taxonomies WHERE collection_id = ? AND slug = ?"); $q->execute([$cid, $tslug]);
                $tid = $q->fetchColumn();
                if ($tid === false) {
                    $pos = (int)$pdo->query("SELECT COUNT(*) FROM collection_taxonomies WHERE collection_id = " . $pdo->quote($cid))->fetchColumn();
                    if ($pos >= CC_TAX_MAX) { cc_wp_warn_into($st, "the $label could not be imported: the collection has too many taxonomies"); continue; }
                    $tid = cc_tax_free_id($pdo, 'collection_taxonomies', cc_tax_id(''), $cid);
                    $pdo->prepare("INSERT INTO collection_taxonomies (id, collection_id, name, slug, multiple, position) VALUES (?,?,?,?,1,?)")->execute([$tid, $cid, $label, $tslug, $pos]);
                }
                $q = $pdo->prepare("SELECT slug, id FROM collection_terms WHERE taxonomy_id = ?"); $q->execute([$tid]);
                $have = $q->fetchAll(PDO::FETCH_KEY_PAIR);
                $count = count($have);
                foreach ($list as $t) {
                    $s = cc_tax_slug($t['slug']);
                    if ($s === '') continue;
                    if (isset($have[$s])) { $terms[$k][$s] = $have[$s]; continue; }
                    if ($count >= CC_TERM_MAX) { cc_wp_warn_into($st, "some $label were left out: a taxonomy holds " . CC_TERM_MAX . ' terms at most'); break; }
                    $mid = cc_tax_free_id($pdo, 'collection_terms', cc_tax_id(''), $cid);
                    $pdo->prepare("INSERT INTO collection_terms (id, taxonomy_id, collection_id, name, slug, description, position) VALUES (?,?,?,?,?,?,?)")
                        ->execute([$mid, $tid, $cid, cc_field_text($t['name'], 80) ?: $s, $s, cc_field_text(strip_tags((string)($t['description'] ?? '')), 500), $count]);
                    $terms[$k][$s] = $mid; $have[$s] = $mid; $count++; $st['created']['terms']++;
                }
                $terms[$k . '_tax'] = $tid;
            }
        }
        // the new address of every page and post
        $slugs = ['pages' => [], 'posts' => [], 'urls' => []];
        $siteUrl = (string)($meta['site']['url'] ?? '');
        $takenPages = array_fill_keys($pdo->query("SELECT clean_slug FROM pages WHERE is_draft_copy = 0")->fetchAll(PDO::FETCH_COLUMN), true);
        foreach ($pdo->query("SELECT slug FROM collections")->fetchAll(PDO::FETCH_COLUMN) as $s) $takenPages[$s] = true;
        if ($opts['pages']) {
            $off = 0;
            do {
                [$rows, $off] = cc_wp_read_lines("$dir/pages.jsonl", $off, 500);
                foreach ($rows as $r) {
                    $slug = cc_wp_unique_slug($r['slug'] !== '' ? $r['slug'] : $r['title'], $takenPages);
                    $takenPages[$slug] = true;
                    $slugs['pages'][$r['id']] = $slug;
                    $old = cc_wp_old_path($r['link'], $siteUrl);
                    if ($old !== '') $slugs['urls'][$old] = $slug . '/';
                    $slugs['urls']['?page_id=' . $r['id']] = $slug . '/';
                }
            } while ($rows);
        }
        if ($opts['posts'] && $st['collection']['id'] !== '') {
            $q = $pdo->prepare("SELECT slug FROM collection_items WHERE collection_id = ?"); $q->execute([$st['collection']['id']]);
            $takenItems = array_fill_keys($q->fetchAll(PDO::FETCH_COLUMN), true);
            $off = 0;
            do {
                [$rows, $off] = cc_wp_read_lines("$dir/posts.jsonl", $off, 500);
                foreach ($rows as $r) {
                    $slug = cc_wp_unique_slug($r['slug'] !== '' ? $r['slug'] : $r['title'], $takenItems);
                    $takenItems[$slug] = true;
                    $slugs['posts'][$r['id']] = $slug;
                    $old = cc_wp_old_path($r['link'], $siteUrl);
                    if ($old !== '') $slugs['urls'][$old] = $st['collection']['slug'] . '/' . $slug . '/';
                    $slugs['urls']['?p=' . $r['id']] = $st['collection']['slug'] . '/' . $slug . '/';
                }
            } while ($rows);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['error' => $e instanceof RuntimeException ? $e->getMessage() : 'The import could not start: ' . $e->getMessage()];
    }
    cc_wp_write_json("$dir/slugs.json", $slugs);
    cc_wp_write_json("$dir/terms.json", $terms);
    cc_wp_write_json("$dir/mediamap.json", ['byId' => (object)[], 'byKey' => (object)[]]);
    cc_wp_write_json("$dir/state.json", $st);
    return ['ok' => true];
}
function cc_wp_slug_in_use($pdo, $slug) {
    $q = $pdo->prepare("SELECT 1 FROM pages WHERE clean_slug = ? AND is_draft_copy = 0 UNION SELECT 1 FROM collections WHERE slug = ?"); $q->execute([$slug, $slug]);
    return (bool)$q->fetchColumn();
}
function cc_wp_warn_into(&$st, $msg) {
    $msg = mb_substr($msg, 0, 300);
    if (!isset($st['warn_counts'][$msg]) && count($st['warnings']) >= CC_WP_WARN_MAX) $msg = 'more problems that are not listed here';
    $st['warn_counts'][$msg] = ($st['warn_counts'][$msg] ?? 0) + 1;
    if ($st['warn_counts'][$msg] === 1) $st['warnings'][] = $msg;
}

function cc_wp_progress($st) {
    $out = ['phase' => $st['phase'], 'finished' => $st['phase'] === 'done', 'totals' => $st['totals'], 'done' => $st['done'], 'created' => $st['created'], 'failed' => $st['failed']];
    if ($st['phase'] === 'done') {
        $w = [];
        foreach ($st['warnings'] as $m) { $c = $st['warn_counts'][$m] ?? 1; $w[] = $c > 1 ? "$m ($c times)" : $m; }
        $out['warnings'] = $w; $out['collection'] = $st['collection']; $out['published'] = $st['published'];
    }
    return $out;
}

// One slice of work (about $budget seconds). The caller holds the job lock. Returns progress, or ['error' => ...]
function cc_wp_step($pdo, $job, $budget = 15) {
    $dir = cc_wp_job_path($job);
    $st = $dir === '' ? [] : cc_wp_read_json("$dir/state.json");
    if (!$st || !isset($st['opts'])) return ['error' => 'This import has not been started or is no longer there.'];
    if ($st['phase'] === 'done') return cc_wp_progress($st);
    $until = microtime(true) + $budget;
    $opts = $st['opts'];
    $meta = cc_wp_read_json("$dir/meta.json");
    $siteUrl = (string)($meta['site']['url'] ?? '');
    $baseDir = $GLOBALS['CC_WP_BASE_DIR'] ?? (function () { $b = dirname($_SERVER['SCRIPT_NAME'] ?? '/x/y', 2); return $b === '\\' || $b === '/' || $b === '.' ? '' : $b; })();
    $uploads = $GLOBALS['CC_WP_UPLOADS'] ?? (__DIR__ . '/../uploads');

    if ($st['phase'] === 'media' && !$opts['media']) $st['phase'] = 'pages';
    if ($st['phase'] === 'media') {
        $map = cc_wp_read_json("$dir/mediamap.json", ['byId' => [], 'byKey' => []]);
        while (microtime(true) < $until) {
            [$rows, $off] = cc_wp_read_lines("$dir/media.jsonl", $st['offsets']['media'], 1);
            if (!$rows) { $st['phase'] = 'pages'; break; }
            $r = $rows[0];
            if (count($map['byKey']) < 100000) {
                $key = cc_wp_pathkey($r['url']);
                if (isset($map['byKey'][$key])) { $map['byId'][(string)$r['id']] = ['url' => $map['byKey'][$key], 'alt' => $r['alt']]; }
                else {
                    [$tmp, $err] = cc_wp_fetch($r['url']);
                    $local = null;
                    if ($tmp) { [$local, $err] = cc_wp_store_image($tmp, $r['url'], $uploads, $baseDir); @unlink($tmp); }
                    if ($local) {
                        $map['byKey'][$key] = $local; $map['byId'][(string)$r['id']] = ['url' => $local, 'alt' => $r['alt']];
                        $st['created']['media']++;
                    } else {
                        $st['failed']['media']++;
                        cc_wp_warn_into($st, 'an image could not be copied (' . ($err ?: 'unknown reason') . '): ' . basename((string)parse_url($r['url'], PHP_URL_PATH)));
                    }
                }
            }
            $st['offsets']['media'] = $off; $st['done']['media']++;
        }
        cc_wp_write_json("$dir/mediamap.json", $map);
        if ($st['phase'] === 'media' || microtime(true) >= $until) { cc_wp_write_json("$dir/state.json", $st); return cc_wp_progress($st); }
    }

    if (in_array($st['phase'], ['pages', 'posts'], true)) {
        $map = cc_wp_read_json("$dir/mediamap.json", ['byId' => [], 'byKey' => []]);
        $slugs = cc_wp_read_json("$dir/slugs.json", ['pages' => [], 'posts' => [], 'urls' => []]);
        $terms = cc_wp_read_json("$dir/terms.json", []);
        $user = $_SESSION['username'] ?? 'admin';
        $cschema = cc_version()['content_schema'];
        $siteHost = strtolower((string)parse_url($siteUrl, PHP_URL_HOST));
        $newPaths = array_flip(array_values($slugs['urls']));
        $warnItem = function ($m) use (&$st) { cc_wp_warn_into($st, $m); };
        $ctx = [
            'warn' => $warnItem,
            'media' => function ($src) use ($map) { $k = cc_wp_pathkey($src); return $map['byKey'][$k] ?? null; },
            'media_id' => function ($id) use ($map) { $m = $map['byId'][(string)$id] ?? null; return $m ? [$m['url'], $m['alt'] ?? ''] : null; },
            'link' => function ($href) use ($slugs, $siteHost) {
                $h = parse_url($href);
                if (!$h) return null;
                if (isset($h['host']) && strtolower($h['host']) !== $siteHost && strtolower($h['host']) !== 'www.' . $siteHost && 'www.' . strtolower($h['host']) !== $siteHost) return null;
                if (!empty($h['query']) && preg_match('/(?:^|&)(p|page_id)=(\d+)/', $h['query'], $m)) { $t = $slugs['urls']['?' . $m[1] . '=' . $m[2]] ?? null; return $t ? '{{BASE_URL}}' . $t . (!empty($h['fragment']) ? '#' . $h['fragment'] : '') : null; }
                $p = trim((string)($h['path'] ?? ''), '/');
                $t = $slugs['urls'][$p] ?? null;
                return $t ? '{{BASE_URL}}' . $t . (!empty($h['fragment']) ? '#' . $h['fragment'] : '') : null;
            },
        ];
        while (microtime(true) < $until) {
            $kind = $st['phase'];   // pages, then posts
            if ($st['totals'][$kind] === 0) { $st['phase'] = $kind === 'pages' ? 'posts' : 'done'; if ($st['phase'] === 'done') break; continue; }
            [$rows, $off] = cc_wp_read_lines("$dir/$kind.jsonl", $st['offsets'][$kind], 1);
            if (!$rows) { $st['phase'] = $kind === 'pages' ? 'posts' : 'done'; if ($st['phase'] === 'done') break; continue; }
            $r = $rows[0];
            try {
                $pdo->beginTransaction();
                $blocks = cc_wp_blocks($r['content'], $ctx);
                cc_sanitize_blocks($blocks);
                $content = json_encode($blocks);
                $title = $r['title'] !== '' ? $r['title'] : 'Untitled';
                $publish = !$opts['drafts'] && $r['status'] === 'published';
                $now = date('Y-m-d H:i:s');
                if ($kind === 'pages') {
                    $slug = $slugs['pages'][$r['id']] ?? cc_safe_slug($title);
                    $id = 'page_' . uniqid();
                    $pdo->prepare("INSERT INTO pages (id, parent_id, title, slug, clean_slug, seo_title, seo_description, layout, content_json, status, is_draft_copy, content_schema, author, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                        ->execute([$id, null, $title, $slug, $slug, $r['seo']['title'], $r['seo']['desc'], 'boxed', $content, $publish ? 'published' : 'draft', 0, $cschema, $user, $user, $now]);
                    cc_add_revision($pdo, $id, $title, $content, $publish ? 'published' : 'draft');
                    $new = $slug . '/'; $st['created']['pages']++;
                } else {
                    $cid = $st['collection']['id'];
                    $slug = $slugs['posts'][$r['id']] ?? cc_safe_slug($title);
                    $id = 'item_' . uniqid();
                    $picked = [];
                    foreach (['cats' => 'cats', 'tags' => 'tags'] as $k => $rk) {
                        if (empty($terms[$k . '_tax'])) continue;
                        $ids = [];
                        foreach ($r[$rk] as $s) if (isset($terms[$k][$s])) $ids[] = $terms[$k][$s];
                        if ($ids) $picked[$terms[$k . '_tax']] = array_values(array_unique($ids));
                    }
                    $cover = ($r['thumb'] > 0 && isset($map['byId'][(string)$r['thumb']])) ? $map['byId'][(string)$r['thumb']]['url'] : '';
                    $exc = cc_wp_text(html_entity_decode(strip_tags($r['excerpt']), ENT_QUOTES | ENT_HTML5, 'UTF-8'), 2000);
                    $pdo->prepare("INSERT INTO collection_items (id, collection_id, title, slug, excerpt, cover_image, date, status, archived, seo_title, seo_description, content_json, content_schema, field_values, terms_json, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                        ->execute([$id, $cid, mb_substr($title, 0, 300), $slug, $exc, $cover, $r['date'], $publish ? 'published' : 'draft', 0, $r['seo']['title'], $r['seo']['desc'], $content, $cschema, '{}', json_encode((object)$picked), $now, $user]);
                    cc_add_revision($pdo, 'item:' . $id, $title, $content, $publish ? 'published' : 'draft');
                    $new = $st['collection']['slug'] . '/' . $slug . '/'; $st['created']['posts']++;
                }
                if ($publish) {
                    $st['published']++;
                    $old = cc_wp_old_path($r['link'], $siteUrl);
                    if ($opts['redirects'] && $old !== '' && $old . '/' !== $new) {
                        // never from an address something answers to: a live page of the site, or another imported address
                        if (strpos($old, '/') === false && cc_wp_slug_in_use($pdo, $old) || isset($newPaths[$old . '/'])) cc_wp_warn_into($st, 'no redirect was made from an address a page of the site already uses: /' . $old . '/');
                        elseif (cc_add_redirect($pdo, '/' . $old . '/', '/' . $new)) $st['created']['redirects']++;
                    }
                }
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $st['failed'][$kind]++;
                cc_wp_warn_into($st, 'a ' . ($kind === 'pages' ? 'page' : 'post') . ' could not be imported (' . $e->getMessage() . '): ' . ($r['title'] ?: '(no title)'));
            }
            $st['offsets'][$kind] = $off; $st['done'][$kind]++;
        }
        if ($st['phase'] !== 'done' && microtime(true) >= $until) { cc_wp_write_json("$dir/state.json", $st); return cc_wp_progress($st); }
    }
    if ($st['phase'] === 'done') {
        // content of the job is not needed any more; the state stays for the report
        foreach (['pages.jsonl', 'posts.jsonl', 'media.jsonl', 'mediamap.json'] as $f) @unlink("$dir/$f");
    }
    cc_wp_write_json("$dir/state.json", $st);
    return cc_wp_progress($st);
}
