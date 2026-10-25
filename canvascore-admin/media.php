<?php
// canvascore-admin/media.php
// Image optimization and the media library's metadata.
//  - Smaller WebP copies of every uploaded photo (480 / 960 / 1600 px wide, never larger than the original),
//    in uploads/_cc/, made with GD on upload or with "Optimize existing images". Phone photos are turned
//    the right way up (EXIF orientation). The original file is never changed.
//  - Metadata per file in the data dir (media.json): alt text, size in pixels and bytes, available copies.
//  - On publish, cc_optimize_images() gives every uploaded <img> of a page a srcset of those copies
//    (phones download a small file), lazy loading and async decoding (except the first image, likely on screen).
// Library file: included by the endpoints, never opened directly
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';

const CC_IMG_WIDTHS = [480, 960, 1600];

// Audio and video files (Audio Player, Video Hero). Images are everything else in the library.
const CC_MEDIA_AUDIO = ['mp3', 'm4a', 'ogg', 'wav'];
const CC_MEDIA_VIDEO = ['mp4', 'webm'];
const CC_MEDIA_MAX_AUDIO = 40 * 1048576;    // the server's own upload limit usually applies first
const CC_MEDIA_MAX_VIDEO = 200 * 1048576;
function cc_media_kind($ext) {
    $ext = strtolower((string)$ext);
    return in_array($ext, CC_MEDIA_AUDIO, true) ? 'audio' : (in_array($ext, CC_MEDIA_VIDEO, true) ? 'video' : 'image');
}
// Does the file start the way its type says? A script, page or document renamed to .mp3 / .mp4 is refused.
function cc_media_sniff($path, $ext) {
    $h = @fopen($path, 'rb');
    if (!$h) return false;
    $b = (string)fread($h, 16);
    fclose($h);
    switch (strtolower((string)$ext)) {
        case 'mp3': return substr($b, 0, 3) === 'ID3' || (strlen($b) >= 2 && ord($b[0]) === 0xFF && (ord($b[1]) & 0xE0) === 0xE0);
        case 'm4a': case 'mp4': return strlen($b) >= 12 && substr($b, 4, 4) === 'ftyp';
        case 'webm': return substr($b, 0, 4) === "\x1A\x45\xDF\xA3";
        case 'ogg': return substr($b, 0, 4) === 'OggS';
        case 'wav': return strlen($b) >= 12 && substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WAVE';
    }
    return false;
}
const CC_IMG_VARIANT_DIR = '_cc';

function cc_media_meta_file() { return $GLOBALS['CC_MEDIA_META_FILE'] ?? (cc_data_dir() . '/media.json'); }   // overridable for tests
function cc_media_meta_all() {
    $m = @json_decode((string)@file_get_contents(cc_media_meta_file()), true);
    return is_array($m) ? $m : [];
}
// Changes the metadata under a lock: $fn receives the whole array (by reference)
function cc_media_meta_update($fn) {
    $fh = @fopen(cc_media_meta_file(), 'c+');
    if (!$fh) return false;
    flock($fh, LOCK_EX);
    $all = json_decode(stream_get_contents($fh) ?: '{}', true);
    if (!is_array($all)) $all = [];
    $fn($all);
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all, JSON_UNESCAPED_UNICODE));
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return true;
}

function cc_variant_name($name, $w) { return pathinfo($name, PATHINFO_FILENAME) . '-' . (int)$w . '.webp'; }

// Loads an image with GD, upright. null when the format or the memory don't allow it.
function cc_img_load($path, $ext) {
    if (!function_exists('imagecreatetruecolor')) return null;
    $info = @getimagesize($path);
    if (!$info) return null;
    // ~5 bytes per pixel while resampling: skip images the memory limit can't hold
    $limit = cc_php_bytes(ini_get('memory_limit'));
    if ($limit > 0 && $info[0] * $info[1] * 5 > $limit - memory_get_usage() - 8 * 1024 * 1024) return null;
    switch ($ext) {
        case 'jpg': case 'jpeg': $im = function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($path) : null; break;
        case 'png': $im = function_exists('imagecreatefrompng') ? @imagecreatefrompng($path) : null; break;
        case 'webp': $im = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : null; break;
        default: $im = null;
    }
    if (!$im) return null;
    if (($ext === 'jpg' || $ext === 'jpeg') && function_exists('exif_read_data')) {
        $exif = @exif_read_data($path);
        $o = (int)($exif['Orientation'] ?? 1);
        $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($rot) { $r = imagerotate($im, $rot, 0); if ($r) { $im = $r; } }
    }
    return $im;
}
function cc_php_bytes($v) {
    $v = trim((string)$v);
    if ($v === '' || $v === '-1') return -1;
    $n = (int)$v; $u = strtolower(substr($v, -1));
    return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
}

// Makes the copies of one uploaded file and records its metadata. Returns the metadata.
function cc_media_process($uploads_dir, $name) {
    $path = $uploads_dir . '/' . $name;
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $meta = ['bytes' => @filesize($path) ?: 0, 'variants' => []];
    $info = @getimagesize($path);
    if ($info) { $meta['w'] = (int)$info[0]; $meta['h'] = (int)$info[1]; }
    $canWebp = function_exists('imagewebp');
    $raster = in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true);
    $processed = !$raster;   // SVG, GIF, ICO…: nothing to make
    if ($canWebp && $raster) {
        $im = cc_img_load($path, $ext);
        if ($im) {
            $processed = true;
            $w = imagesx($im); $h = imagesy($im);
            $meta['w'] = $w; $meta['h'] = $h;   // upright size
            $dir = $uploads_dir . '/' . CC_IMG_VARIANT_DIR;
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            foreach (CC_IMG_WIDTHS as $tw) {
                if ($tw >= $w) continue;      // never enlarge
                $th = max(1, (int)round($h * $tw / $w));
                $dst = imagecreatetruecolor($tw, $th);
                imagealphablending($dst, false); imagesavealpha($dst, true);
                imagecopyresampled($dst, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
                if (@imagewebp($dst, $dir . '/' . cc_variant_name($name, $tw), 80)) $meta['variants'][] = $tw;
                unset($dst);
            }
            unset($im);
        }
    }
    // Done = processed, or nothing to make (SVG, GIF…). A photo GD couldn't open (no WebP support, too big for
    // the memory limit) stays "not optimized", so "Optimize older images" tries it again later.
    $meta['optimized'] = $processed;
    cc_media_meta_update(function (&$all) use ($name, $meta) {
        $old = is_array($all[$name] ?? null) ? $all[$name] : [];
        $all[$name] = array_merge($old, $meta);
    });
    return $meta;
}

// ---------------------------------------------------------------------------
// Image tools: focal point, crop, replace. All keep the file's address working.
// ---------------------------------------------------------------------------
const CC_MEDIA_EDITABLE = ['jpg', 'jpeg', 'png', 'webp'];   // formats GD can crop and write back

// The focal point of an image: where the subject is, in percent of its width and height, or null
function cc_media_focal_clean($f) {
    if (!is_array($f) || !isset($f['x'], $f['y']) || !is_numeric($f['x']) || !is_numeric($f['y'])) return null;
    return ['x' => round(max(0, min(100, (float)$f['x'])), 1), 'y' => round(max(0, min(100, (float)$f['y'])), 1)];
}
// "30% 70%" for an object-position, from a stored focal point
function cc_media_focal_css($f) { $f = cc_media_focal_clean($f); return $f ? ($f['x'] + 0) . '% ' . ($f['y'] + 0) . '%' : ''; }

// Writes a GD image in the format of $ext
function cc_img_save($im, $path, $ext) {
    switch ($ext) {
        case 'jpg': case 'jpeg': return @imagejpeg($im, $path, 90);
        case 'png': imagesavealpha($im, true); return @imagepng($im, $path, 6);
        case 'webp': imagesavealpha($im, true); return function_exists('imagewebp') && @imagewebp($im, $path, 90);
    }
    return false;
}

// Crops an image (x, y, w, h in pixels of the upright image). $mode 'copy' saves a new file and leaves the original alone,
// 'replace' overwrites the original (the same address, so every page that uses it shows the cropped image).
// Returns [name, error]
function cc_media_crop($uploads_dir, $name, $x, $y, $w, $h, $mode) {
    $name = basename((string)$name);
    $path = $uploads_dir . '/' . $name;
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($name === '' || !is_file($path)) return [null, 'Image not found.'];
    if (!in_array($ext, CC_MEDIA_EDITABLE, true)) return [null, 'Only JPEG, PNG and WebP images can be cropped.'];
    foreach ([$x, $y, $w, $h] as $v) if (!is_numeric($v)) return [null, 'The crop area is not valid.'];
    [$x, $y, $w, $h] = [(int)round($x), (int)round($y), (int)round($w), (int)round($h)];
    $im = cc_img_load($path, $ext);
    if (!$im) return [null, 'This image cannot be opened here (the server may lack the memory or the image library).'];
    $sw = imagesx($im); $sh = imagesy($im);
    if ($w < 1 || $h < 1 || $x < 0 || $y < 0 || $x + $w > $sw || $y + $h > $sh) return [null, 'The crop area is outside the image.'];
    $out = imagecreatetruecolor($w, $h);
    imagealphablending($out, false); imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
    imagecopy($out, $im, 0, 0, $x, $y, $w, $h);
    unset($im);
    if ($mode === 'replace') {
        $tmp = $path . '.tmp.' . $ext;
        if (!cc_img_save($out, $tmp, $ext)) { @unlink($tmp); return [null, 'The cropped image could not be saved.']; }
        if (!@rename($tmp, $path)) { @unlink($tmp); return [null, 'The original could not be replaced.']; }
        foreach (CC_IMG_WIDTHS as $vw) @unlink($uploads_dir . '/' . CC_IMG_VARIANT_DIR . '/' . cc_variant_name($name, $vw));
        cc_media_process($uploads_dir, $name);
        cc_media_meta_update(function (&$all) use ($name) { if (isset($all[$name])) unset($all[$name]['focal']); });   // the subject moved
        return [$name, ''];
    }
    $base = preg_replace('/^\d+_/', '', pathinfo($name, PATHINFO_FILENAME));
    $base = preg_replace('/-crop(-[0-9a-f]{6})?$/', '', $base);
    $new = time() . '_' . $base . '-crop.' . $ext;
    if (file_exists($uploads_dir . '/' . $new)) $new = time() . '_' . $base . '-crop-' . bin2hex(random_bytes(3)) . '.' . $ext;
    if (!cc_img_save($out, $uploads_dir . '/' . $new, $ext)) { @unlink($uploads_dir . '/' . $new); return [null, 'The cropped image could not be saved.']; }
    $old = cc_media_meta_all()[$name] ?? [];
    cc_media_process($uploads_dir, $new);
    cc_media_meta_update(function (&$all) use ($new, $old) {
        $all[$new] = array_merge(is_array($all[$new] ?? null) ? $all[$new] : [], array_filter(['alt' => $old['alt'] ?? '', 'folder' => $old['folder'] ?? ''], function ($v) { return $v !== ''; }));
    });
    return [$new, ''];
}

// Does an uploaded file hold what its extension says? Returns an error sentence or null.
function cc_media_check_file($tmp, $ext, $size) {
    $kind = cc_media_kind($ext);
    if ($kind !== 'image') {
        if (!cc_media_sniff($tmp, $ext)) return 'The file is not a valid ' . strtoupper($ext) . ' ' . $kind . ' file.';
        if ($size > ($kind === 'video' ? CC_MEDIA_MAX_VIDEO : CC_MEDIA_MAX_AUDIO)) return 'This ' . $kind . ' file is too large.';
        return null;
    }
    if ($ext === 'svg') return cc_svg_is_safe($tmp) ? null : 'This SVG contains scripts or other active content.';
    $info = @getimagesize($tmp);
    if ($info === false) return 'The file is not a valid image.';
    $types = ['jpg' => [IMAGETYPE_JPEG], 'jpeg' => [IMAGETYPE_JPEG], 'png' => [IMAGETYPE_PNG], 'gif' => [IMAGETYPE_GIF], 'webp' => [IMAGETYPE_WEBP], 'bmp' => [IMAGETYPE_BMP], 'ico' => [IMAGETYPE_ICO]];
    if (defined('IMAGETYPE_AVIF')) $types['avif'] = [IMAGETYPE_AVIF];
    if (!isset($types[$ext]) || !in_array($info[2], $types[$ext], true)) return 'The new file must be the same kind of image (.' . $ext . ') so that every page keeps working.';
    return null;
}

// Replaces the content of a library file, keeping its name (so every page that uses it shows the new file), its description and its
// folder. Its optimized copies are made again and its focal point is cleared. Returns [meta, error]
function cc_media_replace($uploads_dir, $name, $tmp, $size) {
    $name = basename((string)$name);
    $path = $uploads_dir . '/' . $name;
    if ($name === '' || $name === '.htaccess' || !is_file($path)) return [null, 'File not found.'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($err = cc_media_check_file($tmp, $ext, $size)) return [null, $err];
    $stage = $path . '.tmp.' . $ext;
    if (!@copy($tmp, $stage) || !@rename($stage, $path)) { @unlink($stage); return [null, 'The file could not be replaced.']; }
    foreach (CC_IMG_WIDTHS as $vw) @unlink($uploads_dir . '/' . CC_IMG_VARIANT_DIR . '/' . cc_variant_name($name, $vw));
    $meta = cc_media_process($uploads_dir, $name);
    cc_media_meta_update(function (&$all) use ($name) { if (isset($all[$name])) unset($all[$name]['focal']); });
    return [$meta, ''];
}

// Deletes a file's copies and metadata
function cc_media_forget($uploads_dir, $name) {
    foreach (CC_IMG_WIDTHS as $w) @unlink($uploads_dir . '/' . CC_IMG_VARIANT_DIR . '/' . cc_variant_name($name, $w));
    cc_media_meta_update(function (&$all) use ($name) { unset($all[$name]); });
}

// The metadata, keeping only copies that really exist in uploads/_cc/ (e.g. a site restored without
// that folder falls back to the originals instead of pointing at missing files)
function cc_media_meta_existing($uploads_dir) {
    $meta = cc_media_meta_all();
    foreach ($meta as $n => $info) {
        if (!empty($info['variants'])) {
            $meta[$n]['variants'] = array_values(array_filter($info['variants'], function ($w) use ($uploads_dir, $n) {
                return is_file($uploads_dir . '/' . CC_IMG_VARIANT_DIR . '/' . cc_variant_name($n, $w));
            }));
        }
    }
    return $meta;
}

// Published page HTML: srcset for uploaded images that have copies, lazy loading, async decoding.
// $uploads_url = the public address of the uploads folder (e.g. "/uploads/").
function cc_optimize_images($html, $uploads_url, $meta = null) {
    if ($meta === null) $meta = cc_media_meta_all();
    $first = true;
    return preg_replace_callback('#<img\b[^>]*>#i', function ($m) use (&$first, $meta, $uploads_url) {
        $tag = $m[0];
        $isFirst = $first; $first = false;
        if (preg_match('#\ssrc="([^"]+)"#i', $tag, $sm)) {
            $src = html_entity_decode($sm[1], ENT_QUOTES);
            $pos = strpos($src, $uploads_url);
            $name = $pos !== false ? substr($src, $pos + strlen($uploads_url)) : '';
            $info = ($name !== '' && strpos($name, '/') === false) ? ($meta[$name] ?? null) : null;
            if ($info && !empty($info['variants']) && stripos($tag, 'srcset=') === false) {
                $prefix = substr($src, 0, $pos + strlen($uploads_url));
                $set = [];
                foreach ($info['variants'] as $w) $set[] = $prefix . CC_IMG_VARIANT_DIR . '/' . rawurlencode(cc_variant_name($name, $w)) . ' ' . (int)$w . 'w';
                if (!empty($info['w'])) $set[] = $prefix . rawurlencode($name) . ' ' . (int)$info['w'] . 'w';
                $tag = preg_replace('#^<img\b#i', '<img srcset="' . htmlspecialchars(implode(', ', $set)) . '" sizes="100vw"', $tag);
            }
        }
        if ($isFirst) {
            // The first image is most likely on screen right away: never lazy, fetched with priority
            $tag = preg_replace('#\sloading="lazy"#i', '', $tag);
            if (stripos($tag, 'fetchpriority=') === false) $tag = preg_replace('#^<img\b#i', '<img fetchpriority="high"', $tag);
        } elseif (stripos($tag, ' loading=') === false) {
            $tag = preg_replace('#^<img\b#i', '<img loading="lazy"', $tag);
        }
        if (stripos($tag, ' decoding=') === false) $tag = preg_replace('#^<img\b#i', '<img decoding="async"', $tag);
        return $tag;
    }, $html);
}

// ---------------------------------------------------------------------------
// Folders of the media library. They are labels in the metadata ("folder" => "Products/Shoes"): the files
// stay in uploads/, so their addresses never change and moving an image can't break a page that uses it.
// The folder list (including empty folders) is kept in the data dir (media-folders.json).
// ---------------------------------------------------------------------------
function cc_media_folders_file() { return $GLOBALS['CC_MEDIA_FOLDERS_FILE'] ?? (cc_data_dir() . '/media-folders.json'); }   // overridable for tests

// "Products/ Shoes " → "Products/Shoes"; null when not valid. "" = no folder (the library's top level).
function cc_media_folder_path($p) {
    $p = trim(str_replace('\\', '/', (string)$p), " /");
    if ($p === '') return '';
    $parts = array_map('trim', explode('/', $p));
    if (count($parts) > 5) return null;
    foreach ($parts as $seg) if (!preg_match('/^[\p{L}\p{N} _.()&-]{1,50}$/u', $seg) || $seg === '.' || $seg === '..') return null;
    return implode('/', $parts);
}
function cc_media_folders() {
    $f = @json_decode((string)@file_get_contents(cc_media_folders_file()), true);
    $list = is_array($f) ? array_values(array_filter($f, 'is_string')) : [];
    foreach (cc_media_meta_all() as $m) if (!empty($m['folder'])) $list[] = $m['folder'];   // folders that hold files
    $all = [];
    foreach ($list as $p) {   // every parent of a folder is a folder too
        $acc = '';
        foreach (explode('/', $p) as $seg) { $acc = $acc === '' ? $seg : "$acc/$seg"; $all[$acc] = true; }
    }
    $all = array_keys($all);
    sort($all, SORT_NATURAL | SORT_FLAG_CASE);
    return $all;
}
function cc_media_folders_save($list) {
    $list = array_values(array_unique(array_filter($list, function ($p) { return is_string($p) && $p !== ''; })));
    return @file_put_contents(cc_media_folders_file(), json_encode($list, JSON_UNESCAPED_UNICODE), LOCK_EX) !== false;
}
// $p is $folder itself or inside it
function cc_in_folder($p, $folder) { return $p === $folder || strpos($p, $folder . '/') === 0; }

function cc_media_folder_create($path) {
    $path = cc_media_folder_path($path);
    if (!$path) return false;
    $list = cc_media_folders(); $list[] = $path;
    return cc_media_folders_save($list);
}
// Rename or move a folder (and everything in it); false when the new place is taken or invalid
function cc_media_folder_rename($from, $to) {
    $from = cc_media_folder_path($from); $to = cc_media_folder_path($to);
    if (!$from || !$to || $from === $to || cc_in_folder($to, $from)) return false;
    $list = cc_media_folders();
    if (in_array($to, $list, true)) return false;
    $mapped = array_map(function ($p) use ($from, $to) { return cc_in_folder($p, $from) ? $to . substr($p, strlen($from)) : $p; }, $list);
    cc_media_meta_update(function (&$all) use ($from, $to) {
        foreach ($all as &$m) if (is_array($m) && !empty($m['folder']) && cc_in_folder($m['folder'], $from)) $m['folder'] = $to . substr($m['folder'], strlen($from));
        unset($m);
    });
    return cc_media_folders_save($mapped);
}
// Delete a folder: its images (and its sub-folders' images) go to the parent folder; nothing is deleted from disk
function cc_media_folder_delete($path) {
    $path = cc_media_folder_path($path);
    if (!$path) return false;
    $parent = strpos($path, '/') !== false ? substr($path, 0, strrpos($path, '/')) : '';
    cc_media_meta_update(function (&$all) use ($path, $parent) {
        foreach ($all as &$m) if (is_array($m) && !empty($m['folder']) && cc_in_folder($m['folder'], $path)) $m['folder'] = $parent;
        unset($m);
    });
    return cc_media_folders_save(array_filter(cc_media_folders(), function ($p) use ($path) { return !cc_in_folder($p, $path); }));
}
function cc_media_move($names, $folder) {
    $folder = cc_media_folder_path($folder);
    if ($folder === null) return false;
    if ($folder !== '') cc_media_folder_create($folder);
    $names = array_values(array_filter(array_map('basename', (array)$names)));
    cc_media_meta_update(function (&$all) use ($names, $folder) {
        foreach ($names as $n) $all[$n] = array_merge(is_array($all[$n] ?? null) ? $all[$n] : [], ['folder' => $folder]);
    });
    return true;
}

// Where images are used: name => list of "Page title" / "Item title" / "Header"… (stored content, published or not)
function cc_media_usage($pdo, $names) {
    $out = [];
    $names = array_values(array_filter(array_map('basename', (array)$names)));
    foreach ($names as $n) $out[$n] = [];
    if (!$names) return $out;
    $sources = [
        ["SELECT title AS label, content_json, seo_image AS extra FROM pages WHERE is_draft_copy = 0", 'Page'],
        ["SELECT p.title AS label, d.content_json, d.seo_image AS extra FROM pages d JOIN pages p ON p.id = d.parent_id WHERE d.is_draft_copy = 1", 'Page draft'],
        ["SELECT title AS label, content_json, cover_image AS extra FROM collection_items", 'Item'],
        ["SELECT name AS label, content_json, '' AS extra FROM site_parts", 'Global'],
        ["SELECT name AS label, content_json, '' AS extra FROM master_components", 'Master'],
    ];
    foreach ($sources as [$sql, $kind]) {
        try { $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) { continue; }
        foreach ($rows as $r) {
            // stored JSON escapes slashes: look for the bare file name in both the content and the share image
            $hay = (string)$r['content_json'] . ' ' . (string)$r['extra'];
            foreach ($names as $n) {
                if (strpos($hay, $n) !== false) {
                    $label = $kind . ': ' . (string)$r['label'];
                    if (!in_array($label, $out[$n], true)) $out[$n][] = $label;
                }
            }
        }
    }
    foreach (['settings.json' => 'Global Options', 'menu.json' => 'Menu'] as $file => $label) {
        $hay = (string)@file_get_contents(cc_data_dir() . '/' . $file);
        foreach ($names as $n) if ($hay !== '' && strpos($hay, $n) !== false && !in_array($label, $out[$n], true)) $out[$n][] = $label;
    }
    return $out;
}
