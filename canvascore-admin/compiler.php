<?php
// canvascore-admin/compiler.php
// Library file: included by the endpoints, never opened directly
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/blockdef.php';

// Registry of the forms collected during the build (formId => recipient email)
function &cc_form_registry() { static $r = []; return $r; }

// An image address: http(s), a relative or root path, or an inline raster image; any other scheme (javascript:,
// data:text/html…) -> ''. Mirrors ccImgUrl() in renderBlock.mjs.
function cc_img_url($u) {
    $u = trim((string)$u);
    $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', $u));
    if (preg_match('/^[a-z][a-z0-9+.-]*:/', $probe) && !preg_match('#^(https?:|data:image/(png|jpe?g|gif|webp|avif);)#', $probe)) return '';
    return $u;
}
// The same, for use inside CSS url('…'): quotes, parentheses, backslashes and line breaks are percent-encoded
function cc_css_url($u) {
    return str_replace(["'", '"', '\\', '(', ')', "\n", "\r", '<', '>'], ['%27', '%22', '%5C', '%28', '%29', '', '', '%3C', '%3E'], cc_img_url($u));
}

// URL for block links (same logic as BUTTON, with mailto:/tel: left intact)
function cc_block_url($url) {
    $url = trim((string)$url);
    if ($url === '') return '#';
    if ($url === '#' || preg_match('~^(?:f|ht)tps?://~i', $url) || preg_match('~^(?:mailto|tel):~i', $url)) return $url;
    if (in_array($url, ['index.html', 'index/index.html', 'home/index.html', '/'], true)) return '{{BASE_URL}}';
    $clean = str_replace(['index/index.html', 'index.html'], '', $url);
    return '{{BASE_URL}}' . ltrim($clean, '/');
}

// ---------------------------------------------------------------------------
// Helpers shared by the "content" blocks (Divider, Callout, Steps, Counters, ...).
// Each helper has an identical twin in src/render/renderBlock.mjs.
// ---------------------------------------------------------------------------
// Colors: they end up inside style="" and <style>, so only "safe" CSS values (no ; { } url() ...).
function cc_color($v, $default) {
    $v = trim((string)$v);
    if ($v === '') return $default;
    if (preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s\/]+\)|var\(--[a-zA-Z0-9-]+(?:,\s*[#0-9a-zA-Z.,%()\s-]+)?\))$/', $v)) return $v;
    return $default;
}
function cc_num($v, $min, $max, $default) {
    return is_numeric($v) ? max($min, min($max, (float)$v)) : $default;
}
function cc_fmt_num($v, $dec) {
    // EXPLICIT rounding (identical in JS): neither number_format() nor toFixed() agree on cases like 2.675,
    // and the behavior of round() changes between PHP versions.
    $dec = (int)$dec;
    $v = (float)$v;
    $m = pow(10, $dec);
    $r = floor(abs($v) * $m + 0.5 + 1e-9) / $m;
    if ($v < 0) $r = -$r;
    if ($r == 0) $r = 0.0;
    return number_format($r, $dec, '.', ',');
}
// External link (social, website): always http(s). "linkedin.com/in/x" becomes "https://linkedin.com/in/x".
function cc_ext_url($v) {
    $v = trim((string)$v);
    if ($v === '') return '';
    if (preg_match('~^https?://~i', $v)) return $v;
    return 'https://' . ltrim($v, '/');
}
function cc_lines($s) {
    $out = [];
    foreach (preg_split('/\r\n|\r|\n/', (string)$s) as $l) { $l = trim($l); if ($l !== '') $out[] = $l; }
    return $out;
}
// A content value as text: scalars cast as PHP does, arrays/objects/null -> ''. Twin: ccStr()/ccEsc() in renderBlock.mjs.
function cc_str($v) { return is_scalar($v) ? (string)$v : ''; }
function cc_esc($v) { return htmlspecialchars(cc_str($v)); }
// Text with line breaks -> lines separated by <br>, everything escaped.
function cc_br($s) {
    return implode('<br>', array_map('htmlspecialchars', cc_lines($s)));
}
function cc_initials($name) {
    // No mbstring (not always installed): first Unicode character via PCRE; CSS does the uppercasing.
    $parts = preg_split('/\s+/', trim((string)$name), -1, PREG_SPLIT_NO_EMPTY);
    $out = '';
    foreach (array_slice($parts, 0, 2) as $p) {
        $out .= (preg_match('/^./us', $p, $m) === 1) ? $m[0] : substr($p, 0, 1);
    }
    return $out;
}
// Google Maps query (rawurlencode == encodeURIComponent + !'()* encoded)
function cc_enc($s) { return rawurlencode((string)$s); }

// Block scripts (nowdoc: no interpolation/escaping). Placeholders __ID__ / __DUR__.
// Gallery: the lightbox (images open full size, arrows, swipe, keyboard)
function cc_script_gallery($id) {
    return "(function(){\n"
        . "var root=document.getElementById('" . $id . "'); if(!root) return;\n"
        . "var items=[].slice.call(root.querySelectorAll('a.cc-gal-item')); var box=root.querySelector('.cc-lightbox'); if(!box||!items.length) return;\n"
        . "document.body.appendChild(box);\n"
        . "var img=box.querySelector('.cc-lb-img'), cap=box.querySelector('.cc-lb-cap'), cur=0, last=null;\n"
        . "function show(i){cur=(i+items.length)%items.length; var a=items[cur]; img.src=a.getAttribute('href'); var t=a.querySelector('img'); img.alt=t?t.alt:''; cap.textContent=a.getAttribute('data-caption')||'';}\n"
        . "function open(i){last=document.activeElement; show(i); box.style.display='flex'; document.documentElement.style.overflow='hidden'; box.querySelector('.cc-lb-close').focus();}\n"
        . "function close(){box.style.display='none'; document.documentElement.style.overflow=''; if(last&&last.focus) last.focus();}\n"
        . "items.forEach(function(a,i){a.addEventListener('click',function(e){e.preventDefault(); open(i);});});\n"
        . "box.querySelector('.cc-lb-close').addEventListener('click',close);\n"
        . "box.querySelector('.cc-lb-prev').addEventListener('click',function(){show(cur-1);});\n"
        . "box.querySelector('.cc-lb-next').addEventListener('click',function(){show(cur+1);});\n"
        . "box.addEventListener('click',function(e){if(e.target===box) close();});\n"
        . "document.addEventListener('keydown',function(e){if(box.style.display==='none') return; if(e.key==='Escape') close(); else if(e.key==='ArrowLeft') show(cur-1); else if(e.key==='ArrowRight') show(cur+1);});\n"
        . "var sx=null; box.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});\n"
        . "box.addEventListener('touchend',function(e){if(sx===null) return; var dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>50) show(cur+(dx<0?1:-1)); sx=null;});\n"
        . "box.addEventListener('keydown',function(e){if(e.key!=='Tab') return; var f=box.querySelectorAll('button'); var a=f[0], z=f[f.length-1]; if(e.shiftKey&&document.activeElement===a){e.preventDefault(); z.focus();} else if(!e.shiftKey&&document.activeElement===z){e.preventDefault(); a.focus();}});\n"
        . "})();";
}
// Slider: arrows and autoplay (paused on hover, off for visitors who ask for less motion); the whole <script> element
function cc_script_slider($innerId, $auto, $fadeJs, $delayMs) {
    return "  <script>document.addEventListener('DOMContentLoaded',function(){var s=document.getElementById('$innerId');if(!s)return;var c=s.querySelector('.cc-slides'),sl=s.querySelectorAll('.cc-slide'),n=sl.length,cur=0,fade=$fadeJs,t=null;if(n<2)return;"
        . "function go(i){cur=(i+n)%n;if(fade){for(var k=0;k<n;k++)sl[k].style.opacity=k===cur?1:0;}else{c.scrollTo({left:sl[cur].offsetLeft,behavior:'smooth'});}}"
        . "if(!fade)c.addEventListener('scroll',function(){cur=Math.round(c.scrollLeft/(c.clientWidth||1));},{passive:true});"
        . "var auto=$auto&&!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);"
        . "function restart(){if(!auto)return;clearInterval(t);t=setInterval(function(){go(cur+1);},$delayMs);}"
        . "var p=s.querySelector('.cc-slider-prev'),x=s.querySelector('.cc-slider-next');if(p)p.addEventListener('click',function(){go(cur-1);restart();});if(x)x.addEventListener('click',function(){go(cur+1);restart();});"
        . "s.addEventListener('mouseenter',function(){clearInterval(t);});s.addEventListener('mouseleave',restart);restart();});</script>\n";
}
function cc_script_counters($id, $dur) {
    $js = <<<'JS'
(function(){var root=document.getElementById('__ID__'); if(!root) return;
var els=[].slice.call(root.querySelectorAll('.cc-counter-value'));
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduce||!('IntersectionObserver' in window)) return;
function fmt(v,d){var s=v.toFixed(d).split('.'); s[0]=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,','); return s.join('.');}
function show(el,v){el.textContent=(el.getAttribute('data-prefix')||'')+fmt(v,+el.getAttribute('data-decimals'))+(el.getAttribute('data-suffix')||'');}
els.forEach(function(el){el._final=el.textContent; show(el,0);});
var dur=__DUR__;
function run(el){var t=+el.getAttribute('data-target'),s=null;function step(ts){if(s===null)s=ts;var p=Math.min(1,(ts-s)/dur),e=1-Math.pow(1-p,3);show(el,t*e);if(p<1)requestAnimationFrame(step);else el.textContent=el._final;}requestAnimationFrame(step);}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);run(e.target);}});},{threshold:0.3});
els.forEach(function(el){io.observe(el);});
})();
JS;
    return str_replace(['__ID__', '__DUR__'], [$id, (string)(int)$dur], $js);
}
function cc_script_progress($id) {
    $js = <<<'JS'
(function(){var root=document.getElementById('__ID__'); if(!root) return;
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduce||!('IntersectionObserver' in window)) return;
[].slice.call(root.querySelectorAll('.cc-progress-fill')).forEach(function(f){f.style.width='0%'; f.style.transition='width 1s ease';});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);var f=e.target.querySelector('.cc-progress-fill'); requestAnimationFrame(function(){f.style.width=f.getAttribute('data-w')+'%';});}});},{threshold:0.3});
[].slice.call(root.querySelectorAll('.cc-progress-track')).forEach(function(t){io.observe(t);});
})();
JS;
    return str_replace('__ID__', $id, $js);
}
function cc_script_countdown($id) {
    $js = <<<'JS'
(function(){var root=document.getElementById('__ID__'); if(!root) return;
var target=new Date(root.getAttribute('data-target')).getTime(); if(isNaN(target)) return;
var end=root.getAttribute('data-end')||'message';
var nums={}; [].slice.call(root.querySelectorAll('.cc-cd-num')).forEach(function(n){nums[n.getAttribute('data-unit')]=n;});
var units=root.querySelector('.cc-cd-units'), done=root.querySelector('.cc-cd-done'), dateEl=root.querySelector('.cc-cd-date');
function pad(n){return n<10?'0'+n:''+n;}
function put(k,v){if(nums[k]) nums[k].textContent=pad(v);}
var timer=null;
function tick(){var d=target-new Date().getTime();
 if(d<=0){put('days',0);put('hours',0);put('minutes',0);put('seconds',0); if(timer) clearInterval(timer);
  if(end==='hide'){root.style.display='none';}
  else if(done&&done.textContent.replace(/\s+/g,'')!==''){if(units)units.style.display='none'; if(dateEl)dateEl.style.display='none'; done.hidden=false;}
  return;}
 var s=Math.floor(d/1000);
 put('days',Math.floor(s/86400)); put('hours',Math.floor(s%86400/3600)); put('minutes',Math.floor(s%3600/60)); put('seconds',s%60);
}
timer=setInterval(tick,1000); tick();
})();
JS;
    return str_replace('__ID__', $id, $js);
}
function cc_script_beforeafter($id) {
    $js = <<<'JS'
(function(){var root=document.getElementById('__ID__'); if(!root) return;
var r=root.querySelector('.cc-ba-range'); if(!r) return;
function set(){root.style.setProperty('--pos', r.value+'%');}
r.addEventListener('input', set); set();
})();
JS;
    return str_replace('__ID__', $id, $js);
}

// Cache of collections and published items (for the COLLECTION_LIST and RELATED blocks), made once per publish.
// Each collection: its custom fields by id (defsById) and its published items, with their values (vals). 'items' is an
// index of every item (title, address and whether it is live), for the references between items.
function cc_collections_data() {
    static $d = null;
    if ($d !== null) return $d;
    $d = ['by_id' => [], 'by_slug' => [], 'items' => []];
    try {
        $db = cc_data_dir() . '/canvascore.sqlite';
        if (!file_exists($db)) return $d;
        $pdo = new PDO("sqlite:$db");
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        foreach ($pdo->query("SELECT i.id, i.title, i.slug, i.status, i.archived, c.slug AS col_slug FROM collection_items i JOIN collections c ON c.id = i.collection_id") as $ii) {
            $d['items'][$ii['id']] = ['title' => (string)$ii['title'], 'slug' => cc_safe_slug($ii['slug']), 'col_slug' => cc_safe_slug($ii['col_slug']),
                'live' => $ii['status'] === 'published' && (int)($ii['archived'] ?? 0) !== 1];
        }
        $cols = $pdo->query("SELECT id, name, slug, fields FROM collections")->fetchAll(PDO::FETCH_ASSOC);
        $ist = $pdo->prepare("SELECT id, title, slug, excerpt, cover_image, date, archived, field_values, terms_json FROM collection_items WHERE collection_id = ? AND status = 'published' ORDER BY (date = '') ASC, date DESC, updated_at DESC");
        foreach ($cols as $c) {
            $defs = cc_field_defs(json_decode((string)($c['fields'] ?? '[]'), true), $pdo);
            $c['defsById'] = [];
            foreach ($defs as $df) $c['defsById'][$df['id']] = $df;
            $ist->execute([$c['id']]);
            $c['items'] = [];
            foreach ($ist->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $v = json_decode((string)($row['field_values'] ?? '{}'), true);
                $row['vals'] = is_array($v) ? $v : [];
                unset($row['field_values']);
                // categories and tags of the item: taxonomy id => term ids (for the related items by tag)
                $t = json_decode((string)($row['terms_json'] ?? '{}'), true);
                $row['terms'] = is_array($t) ? $t : [];
                unset($row['terms_json']);
                $c['items'][] = $row;
            }
            $d['by_id'][$c['id']] = $c;
            $d['by_slug'][$c['slug']] = $c;
        }
    } catch (Exception $e) {}
    return $d;
}

// The fields a card shows, in the order the block lists them: "Label  value" lines under the excerpt
function cc_list_card_fields($it, $o) {
    $out = '';
    foreach ($o['cardFields'] as $fid) {
        $d = $o['defs'][$fid] ?? null;
        if ($d === null) continue;
        $raw = $it['vals'][$fid] ?? null;
        $v = $d['type'] === 'reference' ? $raw : cc_field_clean($d, $raw, null);   // a reference is checked against the item index
        $inner = cc_field_html($d, $v, $o['content'], $o['ctx']);
        if ($inner === '') continue;
        $out .= '<div class="cc-cl-field" style="margin-top:8px; font-size:13px; color:#475569;"><span class="cc-cl-field-label" style="color:#64748b; margin-right:6px;">' . htmlspecialchars($d['label']) . '</span>' . $inner . '</div>';
    }
    return $out;
}
// The values a card carries for the filter (its data-cc-filter attribute): the choices it has
function cc_list_filter_attr($it, $o) {
    if ($o['filterId'] === '') return '';
    $raw = $it['vals'][$o['filterId']] ?? null;
    $vals = array_values(array_filter(array_map(function ($x) { return is_scalar($x) ? (string)$x : ''; }, (array)$raw), function ($x) { return $x !== ''; }));
    return ' data-cc-filter="' . htmlspecialchars(implode(' ', $vals)) . '"';
}
// The items sorted by a key: '' (as they are), 'title', 'date', or a field id (number, date, text or a single choice).
// Items with no value go last, whatever the direction.
function cc_sort_items($items, $sortBy, $desc, $defs) {
    if ($sortBy === '') return $items;
    $key = function ($it) use ($sortBy, $defs) {
        if ($sortBy === 'title') return mb_strtolower((string)$it['title']);
        if ($sortBy === 'date') return (string)($it['date'] ?? '') === '' ? null : (string)$it['date'];
        $d = $defs[$sortBy] ?? null;
        if ($d === null) return null;
        $v = cc_field_clean($d, $it['vals'][$sortBy] ?? null, null);
        if ($d['type'] === 'number') return $v === null ? null : (float)$v;
        if ($d['type'] === 'date' || $d['type'] === 'text') return (string)$v === '' ? null : mb_strtolower((string)$v);
        if ($d['type'] === 'choice' && empty($d['multiple'])) return (string)$v === '' ? null : (string)$v;
        return null;
    };
    $keyed = [];
    foreach ($items as $i => $it) $keyed[] = [$key($it), $i, $it];
    usort($keyed, function ($a, $b) use ($desc) {
        if ($a[0] === null || $b[0] === null) {
            if ($a[0] === null && $b[0] === null) return $a[1] <=> $b[1];
            return $a[0] === null ? 1 : -1;
        }
        $c = $a[0] <=> $b[0];
        if ($desc) $c = -$c;
        return $c !== 0 ? $c : $a[1] <=> $b[1];
    });
    return array_map(function ($k) { return $k[2]; }, $keyed);
}
// The cards of a list: the grid or the rows of the Collection List block, and of the Related block
function cc_list_cards($items, $cslug, $o) {
    $isList = $o['layout'] === 'list';
    $showCover = $o['showCover']; $showDate = $o['showDate']; $showExcerpt = $o['showExcerpt'];
    $cards = '';
    foreach ($items as $it) {
        $islug = cc_safe_slug($it['slug']);
        $href = '{{BASE_URL}}' . $cslug . '/' . $islug . '/';
        $title = htmlspecialchars($it['title']);
        $dateTxt = (!empty($it['date'])) ? htmlspecialchars($it['date']) : '';
        $excTxt = (!empty($it['excerpt'])) ? htmlspecialchars($it['excerpt']) : '';
        $fattr = cc_list_filter_attr($it, $o);
        $fx = cc_list_card_fields($it, $o);
        if ($isList) {
            $thumb = ($showCover && !empty($it['cover_image']))
                ? '<div style="flex:0 0 96px; width:96px; height:64px; border-radius:8px; overflow:hidden; background:#e2e8f0;"><img src="' . htmlspecialchars($it['cover_image']) . '" alt="' . $title . '" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;"></div>'
                : '';
            $date = ($showDate && $dateTxt !== '') ? '<span style="font-size:12px; color:#64748b; white-space:nowrap;">' . $dateTxt . '</span>' : '';
            $excerpt = ($showExcerpt && $excTxt !== '') ? '<p style="margin:3px 0 0 0; font-size:13px; color:#475569; line-height:1.4;">' . $excTxt . '</p>' : '';
            $excerpt .= $fx;
            $cards .= '<a href="' . htmlspecialchars($href) . '"' . $fattr . ' class="cc-cl-row" style="display:flex; align-items:center; gap:16px; text-decoration:none; color:inherit; padding:14px 4px; border-bottom:1px solid #e2e8f0;">'
                . $thumb
                . '<div style="flex:1; min-width:0;"><div style="display:flex; justify-content:space-between; gap:12px; align-items:baseline;"><h3 style="margin:0; font-size:16px; color:#0f172a;">' . $title . '</h3>' . $date . '</div>' . $excerpt . '</div>'
                . '</a>';
        } else {
            $cover = ($showCover && !empty($it['cover_image']))
                ? '<div style="aspect-ratio:16/9; overflow:hidden; background:#e2e8f0;"><img src="' . htmlspecialchars($it['cover_image']) . '" alt="' . $title . '" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;"></div>'
                : '';
            $date = ($showDate && $dateTxt !== '') ? '<div style="font-size:12px; color:#64748b; margin-bottom:6px;">' . $dateTxt . '</div>' : '';
            $excerpt = ($showExcerpt && $excTxt !== '') ? '<p style="margin:8px 0 0 0; font-size:14px; color:#475569; line-height:1.5;">' . $excTxt . '</p>' : '';
            $excerpt .= $fx;
            $cards .= '<a href="' . htmlspecialchars($href) . '"' . $fattr . ' class="cc-cl-card" style="display:block; text-decoration:none; color:inherit; background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.05);">'
                . $cover
                . '<div style="padding:18px;">' . $date . '<h3 style="margin:0; font-size:18px; color:#0f172a;">' . $title . '</h3>' . $excerpt . '</div>'
                . '</a>';
        }
    }
    return $cards;
}
// The filter buttons of a list (one per choice of the field) and their script; '' when there is no filter
function cc_list_filter_ui($innerId, $fdef) {
    if (!$fdef || $fdef['type'] !== 'choice' || empty($fdef['options'])) return '';
    $btn = 'border:1px solid #cbd5e1; background:#fff; color:#0f172a; border-radius:999px; padding:6px 14px; font:inherit; font-size:14px; cursor:pointer;';
    $btns = '<button type="button" class="cc-cl-filter" data-cc-filter-value="" aria-pressed="true" style="' . $btn . '">All</button>';
    foreach ($fdef['options'] as $o) {
        $btns .= '<button type="button" class="cc-cl-filter" data-cc-filter-value="' . htmlspecialchars($o['value']) . '" aria-pressed="false" style="' . $btn . '">' . htmlspecialchars($o['label']) . '</button>';
    }
    $js = "(function(){var root=document.getElementById('$innerId');if(!root)return;var btns=root.querySelectorAll('.cc-cl-filter');var cards=root.querySelectorAll('[data-cc-filter]');"
        . "btns.forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-cc-filter-value');"
        . "btns.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});"
        . "cards.forEach(function(c){var list=(c.getAttribute('data-cc-filter')||'').split(' ');c.hidden=!(v===''||list.indexOf(v)!==-1);});});});})();";
    return '<div class="cc-cl-filters" role="group" aria-label="Filter" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px;">' . $btns . '</div>'
        . '<style>#' . $innerId . ' [hidden]{display:none !important;}</style>'
        . "<script>$js</script>\n";
}
// The Related block: the items of a collection that point (through a reference field) to the item being published
// The JSON-LD of a collection item from its collection's schema (Product, Event or Person), as a script tag; '' when the
// collection has no structured data. Values come from the item's fields; the JSON never closes its script early.
function cc_item_jsonld($schema, $defsById, $values, $title, $url, $image_fn) {
    if (empty($schema['type'])) return '';
    $val = function ($prop) use ($schema, $values) {
        $fid = $schema['map'][$prop] ?? '';
        return $fid !== '' ? ($values[$fid] ?? null) : null;
    };
    $ld = ['@context' => 'https://schema.org', '@type' => $schema['type'], 'name' => $title];
    if ($url !== '') $ld['url'] = $url;
    $imgs = $val('image');
    $imgs = is_array($imgs) ? $imgs : ($imgs ? [$imgs] : []);
    $imgs = array_values(array_filter(array_map($image_fn, array_map('strval', $imgs)), function ($x) { return $x !== ''; }));
    if ($imgs) $ld['image'] = count($imgs) === 1 ? $imgs[0] : $imgs;
    $desc = $val('description');
    if (is_string($desc) && trim(strip_tags($desc)) !== '') $ld['description'] = mb_substr(trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($desc), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), 0, 300);
    if ($schema['type'] === 'Product') {
        $sku = $val('sku');
        if (is_string($sku) && $sku !== '') $ld['sku'] = $sku;
        $price = $val('price');
        if ($price !== null && $price !== '' && $schema['currency'] !== '') $ld['offers'] = ['@type' => 'Offer', 'price' => (float)$price, 'priceCurrency' => $schema['currency']];
    } elseif ($schema['type'] === 'Event') {
        $start = $val('startDate');
        if (is_string($start) && $start !== '') $ld['startDate'] = $start;
        $loc = $val('location');
        if (is_string($loc) && trim($loc) !== '') $ld['location'] = ['@type' => 'Place', 'name' => trim($loc)];
    } elseif ($schema['type'] === 'Person') {
        $job = $val('jobTitle');
        if (is_string($job) && $job !== '') $ld['jobTitle'] = $job;
    }
    $json = json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    return $json === false ? '' : '<script type="application/ld+json">' . $json . "</script>\n";
}
// Listing and archive pages (one layout). An archive's first page is its address; the next ones are in page/N/.
// The page links point to the archive's own pages: "← Newer" to the page before, "Older →" to the page after.
function cc_archive_nav($dir, $p, $total) {
    if ($total <= 1) return '';
    $href = function ($n) use ($dir) { return '{{BASE_URL}}' . $dir . ($n > 1 ? 'page/' . $n . '/' : ''); };
    $link = 'color:#0f172a; text-decoration:none; font-weight:600;';
    $prev = $p > 1 ? '<a href="' . htmlspecialchars($href($p - 1)) . '" rel="prev" style="' . $link . '">← Newer</a>' : '<span></span>';
    $next = $p < $total ? '<a href="' . htmlspecialchars($href($p + 1)) . '" rel="next" style="' . $link . '">Older →</a>' : '<span></span>';
    return '<nav class="cc-pagination" aria-label="Pages" style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0 48px; color:#475569; font-size:15px;">'
        . $prev . '<span>Page ' . (int)$p . ' of ' . (int)$total . '</span>' . $next . '</nav>';
}
// The "browse" part of the first listing page: the sorts, the years, the filters of the choice fields and the taxonomies
// $groups: [[label, [[text, dir], ...]], ...]
function cc_archive_browse_html($groups) {
    $html = '';
    foreach ($groups as [$label, $links]) {
        if (!$links) continue;
        $chips = '';
        foreach ($links as [$text, $dir]) {
            $chips .= '<a href="' . htmlspecialchars('{{BASE_URL}}' . $dir) . '" style="display:inline-block; border:1px solid #cbd5e1; border-radius:999px; padding:5px 12px; margin:0 6px 6px 0; color:#0f172a; text-decoration:none; font-size:14px;">' . htmlspecialchars($text) . '</a>';
        }
        $html .= '<div style="margin:0 0 12px;"><div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px;">' . htmlspecialchars($label) . '</div>' . $chips . '</div>';
    }
    return $html === '' ? '' : '<div class="cc-archive-browse" style="padding:8px 0 20px; border-bottom:1px solid #e2e8f0; margin-bottom:24px;">' . $html . '</div>';
}
// The body of an archive page: its kind, title and description, the browse links, the cards and the page links
function cc_archive_page_inner($kind, $title, $desc, $cards, $nav, $browse) {
    $d = $desc !== '' ? '<p style="margin:0; font-size:16px; color:#475569; line-height:1.6; max-width:720px;">' . htmlspecialchars($desc) . '</p>' : '';
    return '<section class="cc-archive-head" style="padding:48px 0 16px;"><div style="font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:.5px;">' . htmlspecialchars($kind) . '</div>'
        . '<h1 style="margin:6px 0 12px; font-size:40px; line-height:1.15; color:#0f172a;">' . htmlspecialchars($title) . '</h1>' . $d . '</section>'
        . $browse
        . '<style>@media(max-width:768px){ .cc-archive-grid { grid-template-columns:1fr !important; } }</style>'
        . '<div class="cc-archive-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; padding:8px 0 16px;">' . $cards . '</div>'
        . $nav;
}

// The page of one term: its taxonomy, its name and description, and the cards of its items
function cc_term_page_inner($tax_name, $term_name, $desc, $cards) {
    $d = $desc !== '' ? '<p style="margin:0; font-size:16px; color:#475569; line-height:1.6; max-width:720px;">' . htmlspecialchars($desc) . '</p>' : '';
    return '<section class="cc-term-head" style="padding:48px 0 16px;"><div style="font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:.5px;">' . htmlspecialchars($tax_name) . '</div>'
        . '<h1 style="margin:6px 0 12px; font-size:40px; line-height:1.15; color:#0f172a;">' . htmlspecialchars($term_name) . '</h1>' . $d . '</section>'
        . '<style>@media(max-width:768px){ .cc-term-grid { grid-template-columns:1fr !important; } }</style>'
        . '<div class="cc-term-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; padding:16px 0 48px;">' . $cards . '</div>';
}
// The page of a taxonomy: its name and the list of its terms, each with how many items it has
function cc_taxonomy_index_inner($tax_name, $terms) {
    $list = '';
    foreach ($terms as $t) {
        $list .= '<li style="padding:12px 0; border-bottom:1px solid #e2e8f0;"><a href="' . htmlspecialchars($t['href']) . '" style="color:#0f172a; text-decoration:none; font-size:18px;">' . htmlspecialchars($t['name']) . '</a>'
            . ' <span style="color:#94a3b8; font-size:14px;">(' . (int)$t['count'] . ')</span>'
            . ($t['description'] !== '' ? '<p style="margin:4px 0 0; color:#475569; font-size:14px;">' . htmlspecialchars($t['description']) . '</p>' : '') . '</li>';
    }
    return '<section style="padding:48px 0 16px;"><div style="font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:.5px;">' . htmlspecialchars($tax_name) . '</div>'
        . '<h1 style="margin:6px 0 12px; font-size:40px; line-height:1.15; color:#0f172a;">' . htmlspecialchars($tax_name) . '</h1></section>'
        . '<ul style="list-style:none; margin:0 0 48px; padding:0; max-width:760px;">' . $list . '</ul>';
}
// The terms of an item on its page (the Item Terms block): links to the term pages; names only for an archived item
function cc_render_item_terms($block) {
    $ctx = cc_item_context();
    if ($ctx === null || empty($ctx['item_terms'])) return '';
    $c = $block['content'] ?? [];
    $only = is_string($c['taxonomy'] ?? null) ? $c['taxonomy'] : '';
    $parts = [];
    foreach ($ctx['item_terms'] as $tid => $mids) {
        if ($only !== '' && $tid !== $only) continue;
        foreach ($mids as $mid) {
            $t = $ctx['terms'][$mid] ?? null;
            if ($t === null) continue;
            $label = htmlspecialchars($t['name']);
            $link = !empty($ctx['item_archived']) ? $label
                : '<a class="cc-item-term" href="' . htmlspecialchars('{{BASE_URL}}' . $t['col_slug'] . '/' . $t['tax_slug'] . '/' . $t['slug'] . '/') . '" style="color:inherit;">' . $label . '</a>';
            $parts[] = ($only === '' ? '<span class="cc-item-term-tax" style="color:#64748b;">' . htmlspecialchars($t['tax_name']) . ': </span>' : '') . $link;
        }
    }
    if (!$parts) return '';
    $sep = is_string($c['separator'] ?? null) ? htmlspecialchars($c['separator']) : ' · ';
    $style = build_inline_style($block['styles'] ?? []);
    return '<div class="cc-item-terms"' . ($style !== '' ? ' style="' . $style . '"' : '') . '>' . implode($sep, $parts) . "</div>\n";
}

// The wrapper of a Related block: its heading and its cards (the same for every mode)
function cc_related_html($block, $coll, $items, $data) {
    $c = $block['content'] ?? [];
    $cards = cc_list_cards($items, cc_safe_slug($coll['slug']), cc_list_options($c, $coll['defsById'], ['items' => $data['items']], 'grid', ''));
    $rid = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($block['id'] ?? 'related'));
    $cols = max(1, intval($c['columns'] ?? 3));
    $title = is_string($c['title'] ?? null) && trim($c['title']) !== '' ? '<h2 style="margin:0 0 18px 0; font-size:24px; color:#0f172a;">' . htmlspecialchars($c['title']) . '</h2>' : '';
    return "<div id=\"$rid\" class=\"cc-related\" style=\"margin:40px 0;\">\n<style>@media(max-width:768px){ #$rid .cc-cl-grid { grid-template-columns:1fr !important; } }</style>\n"
        . $title . "<div class=\"cc-cl-grid\" style=\"display:grid; grid-template-columns:repeat($cols, 1fr); gap:24px;\">$cards</div>\n</div>\n";
}
// Related items by tag: the live items of this item's collection that share its terms (in one taxonomy, or in all of them),
// the most shared first, then the newest
function cc_render_related_tags($block, $ctx) {
    $c = $block['content'] ?? [];
    $data = cc_collections_data();
    $coll = $data['by_id'][$ctx['collection_id']] ?? null;
    if ($coll === null) return '';
    $tax = is_string($c['taxonomy'] ?? null) ? $c['taxonomy'] : '';
    $mine = $ctx['item_terms'] ?? [];
    if ($tax !== '') $mine = isset($mine[$tax]) ? [$tax => $mine[$tax]] : [];
    $mine_ids = [];
    foreach ($mine as $mids) foreach ((array)$mids as $m) $mine_ids[$m] = true;   // term ids are unique across the site
    if (!$mine_ids) return '';
    $scored = [];
    foreach ($coll['items'] as $it) {
        if (!empty($it['archived']) || $it['id'] === $ctx['item']) continue;
        $shared = 0;
        foreach ((array)($it['terms'] ?? []) as $tid => $mids) {
            if ($tax !== '' && $tid !== $tax) continue;
            foreach ((array)$mids as $m) if (isset($mine_ids[$m])) $shared++;
        }
        if ($shared > 0) $scored[] = ['n' => $shared, 'it' => $it];
    }
    usort($scored, function ($a, $b) {
        if ($a['n'] !== $b['n']) return $b['n'] - $a['n'];
        return strcmp((string)($b['it']['date'] ?? ''), (string)($a['it']['date'] ?? ''));
    });
    $items = array_slice(array_map(function ($x) { return $x['it']; }, $scored), 0, max(1, intval($c['limit'] ?? 3)));
    if (!$items) return '';
    return cc_related_html($block, $coll, $items, $data);
}
function cc_render_related($block) {
    $ctx = cc_item_context();
    $c = $block['content'] ?? [];
    if ($ctx === null || empty($ctx['item']) || empty($ctx['collection_id'])) return '';
    if (($c['mode'] ?? '') === 'tags') return cc_render_related_tags($block, $ctx);
    $data = cc_collections_data();
    $cid = is_string($c['collectionId'] ?? null) ? $c['collectionId'] : '';
    $fid = is_string($c['fieldId'] ?? null) ? $c['fieldId'] : '';
    $coll = $data['by_id'][$cid] ?? null;
    $def = $coll['defsById'][$fid] ?? null;
    if ($coll === null || $def === null || $def['type'] !== 'reference' || $def['target'] !== $ctx['collection_id']) return '';
    $mine = array_values(array_filter($coll['items'], function ($it) use ($fid, $ctx) {
        return empty($it['archived']) && (($it['vals'][$fid] ?? null) === $ctx['item']);
    }));
    $mine = cc_sort_items($mine, is_string($c['sortBy'] ?? null) ? $c['sortBy'] : '', ($c['sortDir'] ?? 'asc') === 'desc', $coll['defsById']);
    $mine = array_slice($mine, 0, max(1, intval($c['limit'] ?? 3)));
    if (!$mine) return '';
    return cc_related_html($block, $coll, $mine, $data);
}
// The options of the cards, from a block's content (the fields it shows, its filter, the definitions and the item index)
function cc_list_options($c, $defsById, $ctx, $layout, $filterId) {
    $fields = [];
    foreach ((is_array($c['cardFields'] ?? null) ? $c['cardFields'] : []) as $f) {
        if (is_string($f) && isset($defsById[$f]) && !in_array($f, $fields, true)) $fields[] = $f;
    }
    return ['layout' => $layout, 'showCover' => ($c['showCover'] ?? true) !== false, 'showDate' => ($c['showDate'] ?? true) !== false,
        'showExcerpt' => ($c['showExcerpt'] ?? true) !== false, 'cardFields' => $fields, 'defs' => $defsById, 'content' => $c,
        'ctx' => $ctx, 'filterId' => $filterId];
}

// Block effects (Advanced tab) and button hovers: mirror of effectClasses()/buttonHover()
// in canvascore-frontend/src/render/effects.mjs. The CSS is effects.css (inlined by rebuild_all.php).
const CC_FX_REVEAL = ['fade-in', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'zoom-in', 'zoom-out', 'flip-up', 'flip-left', 'rotate-in', 'blur-in', 'bounce-in'];
const CC_FX_DUR = ['fast', 'slow', 'slower'];
const CC_FX_DELAY = ['100', '200', '300', '500', '800', '1000', '1500'];
const CC_FX_HOVER = ['lift', 'grow', 'shrink', 'shadow', 'glow', 'tilt', 'brighten', 'grayscale'];
const CC_FX_LOOP = ['float', 'pulse', 'bounce', 'swing', 'heartbeat', 'shake', 'spin'];
const CC_FX_BUTTON = ['lift', 'grow', 'press', 'shadow', 'glow', 'shine', 'ring', 'pulse'];

function cc_effect_classes($styles, $content) {
    $styles = is_array($styles) ? $styles : [];
    $content = is_array($content) ? $content : [];
    $c = '';
    $anim = $styles['animation'] ?? '';
    if (is_string($anim) && in_array($anim, CC_FX_REVEAL, true)) {
        $c .= " cc-reveal $anim";
        $dur = $content['animDuration'] ?? '';
        if (is_string($dur) && in_array($dur, CC_FX_DUR, true)) $c .= " cc-dur-$dur";
        $delay = (string)($content['animDelay'] ?? '');
        if (in_array($delay, CC_FX_DELAY, true)) $c .= " cc-delay-$delay";
    }
    $hover = $content['hoverEffect'] ?? '';
    if (is_string($hover) && in_array($hover, CC_FX_HOVER, true)) $c .= " cc-hover-$hover";
    $loop = $content['loopEffect'] ?? '';
    if (is_string($loop) && in_array($loop, CC_FX_LOOP, true)) $c .= " cc-loop-$loop";
    return $c;
}

// ['cls' => ' cc-hbg cc-bfx-lift…', 'vars' => '--cc-hover-bg:…; '] (vars already HTML-escaped)
function cc_button_hover($bg, $color, $border, $effect) {
    $cls = ''; $vars = '';
    $ok = function ($v) { return is_string($v) && trim($v) !== ''; };
    if ($ok($bg)) { $cls .= ' cc-hbg'; $vars .= '--cc-hover-bg:' . htmlspecialchars($bg) . '; '; }
    if ($ok($color)) { $cls .= ' cc-hcol'; $vars .= '--cc-hover-color:' . htmlspecialchars($color) . '; '; }
    if ($ok($border)) { $cls .= ' cc-hbd'; $vars .= '--cc-hover-border:' . htmlspecialchars($border) . '; '; }
    if (is_string($effect) && in_array($effect, CC_FX_BUTTON, true)) $cls .= " cc-bfx-$effect";
    return ['cls' => $cls, 'vars' => $vars];
}

// Whole number within [min, max] (default when missing or not a number). Mirrors ccInt() in renderBlock.mjs.
function cc_int($v, $def, $min, $max) {
    // Leading whole number, like JS parseInt ("7px" -> 7, "1e3" -> 1, "abc" -> default)
    if (!is_scalar($v) || is_bool($v) || !preg_match('/^\s*([+-]?\d+)/', (string)$v, $m)) return $def;
    return min($max, max($min, (int)$m[1]));
}
// Logo Cloud scrolling strip (LOGOS, layout "marquee"); %ID% = the block's id, %SPEED% = seconds per loop.
// Repeats the logos inside both sets until one set covers the strip (after the images load and on resize), so no
// gap opens before the second set comes in, and stretches the loop by the same factor to keep the visual speed.
// One group's width is measured on the original logos and measured again whenever one of them loads (extra
// copies are removed then); copies load their image at once (no lazy pop-in), and so does the whole strip once it
// comes near the viewport (lazy loading never loads the half of a moving strip that is out of view sideways).
// Twin of fillLogosMarquee() in src/render/logosMarquee.mjs (the editor canvas).
const CC_LOGOS_SCRIPT = <<<'CCJS'
(function(){var r=document.getElementById('%ID%');if(!r)return;var box=r.querySelector('.cc-logos-marquee'),track=r.querySelector('.cc-logos-track');if(!box||!track)return;
if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var sets=track.querySelectorAll('.cc-logos-set');if(sets.length<2)return;var base=[].slice.call(sets[0].children).filter(function(e){return !e.classList.contains('cc-logo-fill');}),n=base.length;if(!n)return;
var dur=%SPEED%,imgs=base.map(function(e){return e.querySelector('img');}).filter(Boolean);
function fill(){for(var i=0;i<imgs.length;i++){if(!imgs[i].complete)return;}
var cs=getComputedStyle(sets[0]),gap=parseFloat(cs.columnGap)||parseFloat(cs.gap)||0,unit=0;for(var u=0;u<n;u++)unit+=base[u].getBoundingClientRect().width+gap;if(!(unit>0))return;
var want=Math.min(20,Math.max(1,Math.ceil(box.clientWidth/unit)));
var have=Math.round(sets[0].children.length/n);
for(;have>want;have--){for(var s=0;s<sets.length;s++){for(var d=0;d<n&&sets[s].lastElementChild&&sets[s].lastElementChild.classList.contains('cc-logo-fill');d++)sets[s].removeChild(sets[s].lastElementChild);}}
for(;have<want;have++){for(var j=0;j<n;j++){var c=base[j].cloneNode(true);c.classList.add('cc-logo-fill');c.setAttribute('aria-hidden','true');if(c.tagName==='A')c.setAttribute('tabindex','-1');var im=c.querySelector('img');if(im){im.setAttribute('alt','');im.removeAttribute('loading');}sets[0].appendChild(c);sets[1].appendChild(c.cloneNode(true));}}
track.style.animationDuration=(dur*Math.round(sets[0].children.length/n))+'s';}
imgs.forEach(function(im){im.addEventListener('load',fill);im.addEventListener('error',fill);});
function eager(){[].forEach.call(track.querySelectorAll('img'),function(im){im.removeAttribute('loading');});}
if(window.IntersectionObserver){var io=new IntersectionObserver(function(es){if(es.some(function(e){return e.isIntersecting;})){eager();io.disconnect();}},{rootMargin:'200px'});io.observe(box);}else eager();
if(window.ResizeObserver)new ResizeObserver(fill).observe(box);else window.addEventListener('resize',fill);fill();})();
CCJS;

// Multi-step Form field types: the Form block's, plus choices. Twin of WIZARD_TYPES in src/render/renderBlock.mjs.
const CC_WIZARD_TYPES = ['text', 'email', 'textarea', 'number', 'tel', 'url', 'date', 'select', 'radio', 'checkboxes', 'consent'];
const CC_WZ_INPUT = 'width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 8px); font:inherit; background:var(--cc-field-bg, #fff); color:#0f172a; box-sizing:border-box;';
const CC_WZ_BTN = 'padding:12px 24px; border-radius:8px; font:700 15px/1 inherit; cursor:pointer;';
// A number as plain text: at most 4 decimals, no trailing zeros ("25", "0.5"). Twin of ccPlain() in blockRuntime.mjs.
function cc_plain($v) {
    $s = number_format((float)$v, 4, '.', '');
    if (strpos($s, '.') !== false) $s = rtrim(rtrim($s, '0'), '.');
    return $s === '-0' ? '0' : $s;
}
// An amount: rounded half up at $dec decimals, thousands separators, "1,234.56" or "1.234,56" (eu), the currency before
// or after (with a no-break space). Twin of ccMoney() in src/render/renderBlock.mjs and of money() in blockRuntime.mjs.
function cc_money($v, $dec, $eu, $cur, $after) {
    $s = cc_fmt_num($v, $dec);
    if ($eu) $s = strtr($s, [',' => '.', '.' => ',']);
    return $after ? $s . "\xC2\xA0" . $cur : $cur . $s;
}

// A media file address (audio, video): http(s) or a path on this site; any other scheme (javascript:, data:…) -> ''.
// Twin of ccMediaSrc() in src/render/renderBlock.mjs.
function cc_media_src($u) {
    $t = trim((string)$u);
    $probe = strtolower(preg_replace('/[\x00-\x20\x7f]+/', '', $t));
    if (preg_match('/^[a-z][a-z0-9+.-]*:/', $probe) && !preg_match('/^https?:/', $probe)) return '';
    return $t;
}
// The MIME type a file's extension says ('' when unknown). Twin of ccMediaMime().
function cc_media_mime($src) {
    static $map = ['mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'ogv' => 'video/ogg', 'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'wav' => 'audio/wav'];
    $path = preg_split('/[?#]/', (string)$src)[0];
    return preg_match('/\.([a-z0-9]+)$/i', $path, $m) && isset($map[strtolower($m[1])]) ? $map[strtolower($m[1])] : '';
}
// The Announcement Bar: the block, and the site-wide bar of Global Options (rebuild_all.php). $c: text, linkText, linkUrl,
// preset, bg, color, icon, sticky, dismissible, align. $requireText: nothing at all when the text is empty (site-wide).
// Twin of announcementHtml() in src/render/renderBlock.mjs.
const CC_ANN_PRESETS = ['info' => ['#0f172a', '#ffffff'], 'promo' => ['var(--brand-color, #3b82f6)', '#ffffff'], 'warning' => ['#fef3c7', '#78350f'], 'success' => ['#dcfce7', '#14532d']];
function cc_announcement_html($c, $id, $extra, $styleAttr, $requireText) {
    $c = is_array($c) ? $c : [];
    $text = mb_substr(trim(cc_str($c['text'] ?? '')), 0, 300);
    if ($requireText && $text === '') return '';
    $preset = (is_string($c['preset'] ?? null) && isset(CC_ANN_PRESETS[$c['preset']])) ? $c['preset'] : 'info';
    $bg = cc_color($c['bg'] ?? '', CC_ANN_PRESETS[$preset][0]);
    $fg = cc_color($c['color'] ?? '', CC_ANN_PRESETS[$preset][1]);
    $linkText = mb_substr(trim(cc_str($c['linkText'] ?? '')), 0, 60);
    $linkUrl = trim(cc_str($c['linkUrl'] ?? ''));
    $icon = mb_substr(trim(cc_str($c['icon'] ?? '')), 0, 4);
    $sticky = ($c['sticky'] ?? false) === true;
    $dismissible = ($c['dismissible'] ?? true) !== false;
    $left = ($c['align'] ?? '') === 'left';
    $key = sprintf('%08x', crc32($text . '|' . $linkText . '|' . $linkUrl) & 0xFFFFFFFF);
    return '<div id="' . $id . '" class="cc-announce cc-ann-' . $preset . $extra . '" role="region" aria-label="Announcement" data-key="' . $key . '" style="' . $styleAttr . ($sticky ? ' position:sticky; top:0; z-index:9000;' : '') . ' background:' . $bg . '; color:' . $fg . '; padding:10px 16px; font-size:14px; line-height:1.4;">'
        . '<div class="cc-ann-inner" style="display:flex; align-items:center; justify-content:' . ($left ? 'flex-start' : 'center') . '; flex-wrap:wrap; gap:4px 12px; max-width:1200px; margin:0 auto; position:relative; padding-right:' . ($dismissible ? '36px' : '0') . '; box-sizing:border-box;">'
        . ($icon !== '' ? '<span class="cc-ann-icon" aria-hidden="true">' . htmlspecialchars($icon) . '</span>' : '')
        . '<span class="cc-ann-text">' . htmlspecialchars($text) . '</span>'
        . ($linkText !== '' ? '<a class="cc-ann-link" href="' . htmlspecialchars(cc_block_url($linkUrl)) . '" style="color:inherit; font-weight:700; text-decoration:underline; white-space:nowrap;">' . htmlspecialchars($linkText) . ' &rarr;</a>' : '')
        . ($dismissible ? '<button type="button" class="cc-ann-close" hidden aria-label="Dismiss the announcement" style="position:absolute; right:0; top:50%; transform:translateY(-50%); width:28px; height:28px; padding:0; border:none; border-radius:50%; background:transparent; color:inherit; font-size:20px; line-height:1; cursor:pointer;">&times;</button>' : '')
        . '</div></div>' . "\n"
        . '<script>' . str_replace('%ID%', $id, CC_ANNOUNCE_SCRIPT) . "</script>\n";
}

// Scripts of the Code Snippet, Table of Contents and Share Bar blocks. The regions between the "cc-xxx:begin" and
// "cc-xxx:end" lines are VERBATIM copies from src/render/blockRuntime.mjs (the editor canvas runs the same text):
// edit both, tests/blocks-content.mjs compares them. %ID% = the block's id.
const CC_CODE_SCRIPT = <<<'CCJS'
// cc-hl:begin
function ccTokens(code, lang) {
  var STR = /"(?:\\[\s\S]|[^"\\\n])*(?:"|$)|'(?:\\[\s\S]|[^'\\\n])*(?:'|$)/y;
  var NUM = /\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y;
  var CSSNUM = /#[0-9a-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?|\.\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?/y;
  var BLOCK = /\/\*[\s\S]*?(?:\*\/|$)/y;
  var RULES = {
    js: [['c', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ['s', /`(?:\\[\s\S]|[^`\\])*(?:`|$)/y], ['s', STR], ['n', NUM],
      ['k', /\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|null|true|false|undefined)\b/y],
      ['f', /[A-Za-z_$][\w$]*(?=\()/y]],
    json: [['a', /"(?:\\[\s\S]|[^"\\\n])*"(?=\s*:)/y], ['s', STR], ['n', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y], ['k', /\b(?:true|false|null)\b/y]],
    css: [['c', BLOCK], ['s', STR], ['k', /@[\w-]+/y], ['n', CSSNUM], ['a', /[\w-]+(?=\s*:)/y]],
    html: [['c', /<[!]--[\s\S]*?(?:--[>]|$)/y], ['t', /<\/?[A-Za-z][\w:-]*/y], ['t', /\/?>/y], ['s', STR], ['a', /[\w:-]+(?==)/y]],
    php: [['c', /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ['k', /<\?php|<\?=|\?>/y], ['s', STR], ['v', /\$[A-Za-z_]\w*/y], ['n', NUM],
      ['k', /\b(?:abstract|and|array|as|break|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|extends|final|finally|fn|for|foreach|function|global|if|implements|include|include_once|instanceof|interface|isset|list|match|namespace|new|null|or|print|private|protected|public|require|require_once|return|static|switch|this|throw|trait|true|false|try|unset|use|var|while|yield)\b/y],
      ['f', /[A-Za-z_]\w*(?=\()/y]],
    shell: [['c', /#[^\n]*/y], ['s', STR], ['v', /\$\{[^}\n]*\}|\$[A-Za-z_]\w*/y], ['n', NUM],
      ['k', /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|return|exit|export|local|echo|cd|sudo)\b/y]]
  };
  var rules = RULES[lang], s = String(code), out = [], plain = '', pos = 0, n = s.length;
  if (!rules) return [[null, s]];
  while (pos < n) {
    var hit = null;
    for (var i = 0; i < rules.length; i++) {
      var re = rules[i][1];
      re.lastIndex = pos;
      var m = re.exec(s);
      if (m && m.index === pos && m[0].length > 0) { hit = [rules[i][0], m[0]]; break; }
    }
    if (hit) {
      if (plain) { out.push([null, plain]); plain = ''; }
      out.push(hit);
      pos += hit[1].length;
    } else { plain += s.charAt(pos); pos++; }
  }
  if (plain) out.push([null, plain]);
  return out;
}
// cc-hl:end
// cc-code:begin
function ccCodeInit(root) {
  var doc = root.ownerDocument, win = doc.defaultView, code = root.querySelector('.cc-code-code');
  if (!code) return;
  var text = code.textContent, toks = ccTokens(text, root.getAttribute('data-lang') || 'text'), frag = doc.createDocumentFragment();
  for (var i = 0; i < toks.length; i++) {
    if (toks[i][0]) { var sp = doc.createElement('span'); sp.className = 'cc-tk-' + toks[i][0]; sp.textContent = toks[i][1]; frag.appendChild(sp); }
    else frag.appendChild(doc.createTextNode(toks[i][1]));
  }
  code.textContent = '';
  code.appendChild(frag);
  var btn = root.querySelector('.cc-code-copy');
  if (!btn || btn.getAttribute('data-ready')) return;
  var label = btn.textContent;
  btn.setAttribute('data-ready', '1');
  btn.hidden = false;
  btn.addEventListener('click', function () {
    var done = function () { btn.textContent = 'Copied'; win.setTimeout(function () { btn.textContent = label; }, 1600); };
    if (win.navigator.clipboard && win.navigator.clipboard.writeText) { win.navigator.clipboard.writeText(code.textContent).then(done, function () {}); return; }
    var ta = doc.createElement('textarea');
    ta.value = code.textContent; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    try { if (doc.execCommand('copy')) done(); } catch { /* no clipboard access */ }
    doc.body.removeChild(ta);
  });
}
// cc-code:end
(function(){var r=document.getElementById('%ID%');if(r)ccCodeInit(r);})();
CCJS;
const CC_TOC_SCRIPT = <<<'CCJS'
// cc-toc:begin
function ccTocInit(root, editor) {
  var doc = root.ownerDocument, win = doc.defaultView, scope = root.closest('main') || root.closest('.cc-canvas') || doc.body;
  var list = root.querySelector('.cc-toc-list'), empty = root.querySelector('.cc-toc-empty');
  var all = scope.querySelectorAll(root.getAttribute('data-levels') === 'h2h3' ? 'h2, h3' : 'h2'), heads = [], i;
  // the author's own headings only: in rich text (Text, Image + Text, Hero, Custom HTML) and without a design class
  // of their own (that leaves out the titles inside Scrollytelling, Cards, Team, Collection List...)
  for (i = 0; i < all.length; i++) {
    if (!all[i].closest('.cc-toc') && all[i].closest('.cc-text, .cc-hero, .cc-img-text, .cc-html-block') && !/(^|\s)cc-/.test(all[i].className) && all[i].textContent.trim()) heads.push(all[i]);
  }
  var numbered = root.getAttribute('data-numbered') === '1', offset = parseInt(root.getAttribute('data-offset'), 10) || 0;
  var used = {}, n2 = 0, n3 = 0, links = [];
  list.textContent = '';
  for (i = 0; i < heads.length; i++) {
    var h = heads[i], text = h.textContent.trim().replace(/\s+/g, ' '), l3 = h.tagName === 'H3', id = h.id;
    if (!id && !editor) {
      var base = (text.normalize ? text.normalize('NFD').replace(/[̀-ͯ]/g, '') : text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section', k = 2;
      id = base;
      while (doc.getElementById(id) || used[id]) { id = base + '-' + k; k++; }
      h.id = id;
    }
    used[id] = 1;
    if (!editor) h.style.scrollMarginTop = offset + 'px';
    if (l3) { n3++; } else { n2++; n3 = 0; }
    var li = doc.createElement('li'), a = doc.createElement('a');
    li.className = 'cc-toc-item ' + (l3 ? 'cc-toc-l3' : 'cc-toc-l2');
    a.href = '#' + (editor ? '' : id);
    if (numbered) { var num = doc.createElement('span'); num.className = 'cc-toc-num'; num.textContent = (l3 ? n2 + '.' + n3 : n2) + '. '; a.appendChild(num); }
    a.appendChild(doc.createTextNode(text));
    li.appendChild(a); list.appendChild(li); links.push(a);
  }
  root.hidden = !heads.length && !editor;
  if (empty) empty.hidden = heads.length > 0;
  if (editor || !heads.length || root.getAttribute('data-highlight') !== '1' || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');
  var busy = false, mark = function () {
    busy = false;
    var cur = -1;
    for (var j = 0; j < heads.length; j++) { if (heads[j].getBoundingClientRect().top <= offset + 24) cur = j; }
    // at the very end of the page the last heading may never reach the top: it counts as the one being read
    if (win.pageYOffset > 0 && win.pageYOffset + win.innerHeight >= doc.documentElement.scrollHeight - 2) cur = heads.length - 1;
    for (j = 0; j < links.length; j++) {
      links[j].parentNode.className = links[j].parentNode.className.replace(' is-active', '') + (j === cur ? ' is-active' : '');
      if (j === cur) links[j].setAttribute('aria-current', 'true'); else links[j].removeAttribute('aria-current');
    }
  };
  win.addEventListener('scroll', function () { if (!busy) { busy = true; win.requestAnimationFrame(mark); } }, { passive: true });
  mark();
}
// cc-toc:end
(function(){var r=document.getElementById('%ID%');if(!r)return;var go=function(){ccTocInit(r,false);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();
CCJS;
const CC_SHARE_SCRIPT = <<<'CCJS'
// cc-share:begin
function ccShareInit(root, editor) {
  var doc = root.ownerDocument, win = doc.defaultView;
  root.hidden = false;
  if (editor) return;
  var url = win.location.href.split('#')[0], msg = root.getAttribute('data-msg') || doc.title, e = win.encodeURIComponent;
  var hrefs = {
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + e(url),
    x: 'https://twitter.com/intent/tweet?url=' + e(url) + '&text=' + e(msg),
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + e(url),
    whatsapp: 'https://wa.me/?text=' + e(msg + ' ' + url),
    telegram: 'https://t.me/share/url?url=' + e(url) + '&text=' + e(msg),
    email: 'mailto:?subject=' + e(msg) + '&body=' + e(url)
  };
  var nets = root.querySelectorAll('a[data-net]'), acts = root.querySelectorAll('[data-act]'), i;
  for (i = 0; i < nets.length; i++) { var net = nets[i].getAttribute('data-net'); if (hrefs[net]) nets[i].href = hrefs[net]; }
  var flash = function (btn, text) {
    var lab = btn.querySelector('.cc-share-label') || btn, old = lab.textContent;
    lab.textContent = text;
    win.setTimeout(function () { lab.textContent = old; }, 1600);
  };
  var copy = function (btn) {
    var done = function () { flash(btn, 'Copied'); };
    if (win.navigator.clipboard && win.navigator.clipboard.writeText) { win.navigator.clipboard.writeText(url).then(done, function () {}); return; }
    var ta = doc.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    try { if (doc.execCommand('copy')) done(); } catch { /* no clipboard access */ }
    doc.body.removeChild(ta);
  };
  var wire = function (btn) {
    var act = btn.getAttribute('data-act');
    if (act === 'share' && !win.navigator.share) { btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      if (act === 'copy') copy(btn);
      else if (act === 'print') win.print();
      else if (act === 'share') win.navigator.share({ title: msg, url: url }).catch(function () {});
    });
  };
  for (i = 0; i < acts.length; i++) wire(acts[i]);
}
// cc-share:end
(function(){var r=document.getElementById('%ID%');if(r)ccShareInit(r,false);})();
CCJS;
const CC_CALC_SCRIPT = <<<'CCJS'
// cc-calc:begin
function ccPlain(v) {
  var s = v.toFixed(4);
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
function ccCalcInit(root) {
  var dec = parseInt(root.getAttribute('data-dec'), 10) || 0, eu = root.getAttribute('data-fmt') === 'eu';
  var cur = root.getAttribute('data-cur') || '', after = root.getAttribute('data-pos') === 'after';
  var base = parseFloat(root.getAttribute('data-base')) || 0, disc = parseFloat(root.getAttribute('data-disc')) || 0;
  var perM = root.getAttribute('data-per-m') || '', perY = root.getAttribute('data-per-y') || '', saveTpl = root.getAttribute('data-save') || '';
  var ranges = root.querySelectorAll('.cc-calc-range'), addons = root.querySelectorAll('.cc-calc-addon'), radios = root.querySelectorAll('.cc-calc-billing input');
  var amount = root.querySelector('.cc-calc-amount'), per = root.querySelector('.cc-calc-per'), save = root.querySelector('.cc-calc-save'), i;
  var money = function (v) {
    var m = Math.pow(10, dec), r = Math.floor(Math.abs(v) * m + 0.5 + 1e-9) / m;
    if (v < 0) r = -r;
    if (r === 0) r = 0;
    var parts = r.toFixed(dec).split('.'), s;
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
    if (eu) s = s.replace(/[,.]/g, function (ch) { return ch === ',' ? '.' : ','; });
    return after ? s + ' ' + cur : cur + s;
  };
  var line = function (key, cost, f, show) {
    var li = root.querySelector('.cc-calc-line[data-line="' + key + '"]');
    if (!li) return;
    li.hidden = !show;
    li.querySelector('.cc-calc-line-amt').textContent = money(cost * f);
  };
  var update = function () {
    var yearly = false, total = base, f, k;
    for (k = 0; k < radios.length; k++) { if (radios[k].checked && radios[k].value === 'yearly') yearly = true; }
    f = yearly ? 12 * (1 - disc / 100) : 1;
    line('base', base, f, true);
    for (k = 0; k < ranges.length; k++) {
      var inp = ranges[k], val = parseFloat(inp.value) || 0, unit = inp.getAttribute('data-unit') || '';
      var cost = Math.max(0, val - (parseFloat(inp.getAttribute('data-incl')) || 0)) * (parseFloat(inp.getAttribute('data-price')) || 0);
      total += cost;
      var out = root.querySelector('.cc-calc-val[data-for="' + inp.id + '"]');
      if (out) out.textContent = ccPlain(val) + (unit ? ' ' + unit : '');
      line(inp.getAttribute('data-line'), cost, f, cost !== 0);
    }
    for (k = 0; k < addons.length; k++) {
      var price = parseFloat(addons[k].getAttribute('data-price')) || 0;
      if (addons[k].checked) total += price;
      line(addons[k].getAttribute('data-line'), price, f, addons[k].checked);
    }
    if (amount) amount.textContent = money(total * f);
    if (per) per.textContent = yearly ? perY : perM;
    if (save) {
      var saved = total * 12 - total * f;
      save.hidden = !(yearly && saved > 0);
      save.textContent = saveTpl.split('{amount}').join(money(saved));
    }
  };
  for (i = 0; i < ranges.length; i++) ranges[i].addEventListener('input', update);
  for (i = 0; i < addons.length; i++) addons[i].addEventListener('change', update);
  for (i = 0; i < radios.length; i++) radios[i].addEventListener('change', update);
  update();
}
// cc-calc:end
(function(){var r=document.getElementById('%ID%');if(r)ccCalcInit(r);})();
CCJS;
const CC_WIZARD_SCRIPT = <<<'CCJS'
// cc-wizard:begin
function ccWizardInit(root, editor) {
  var form = root.querySelector('.cc-wz-form');
  if (!form || root.getAttribute('data-ready')) return;
  var steps = root.querySelectorAll('.cc-wz-step'), n = steps.length, cur = 0, i;
  var back = root.querySelector('.cc-wz-back'), next = root.querySelector('.cc-wz-next'), submit = root.querySelector('.cc-wz-submit');
  var prog = root.querySelector('.cc-wz-progress'), fill = root.querySelector('.cc-wz-fill'), count = root.querySelector('.cc-wz-count');
  var dots = root.querySelectorAll('.cc-wz-dot'), tpl = root.getAttribute('data-step-label') || 'Step {n} of {total}';
  root.setAttribute('data-ready', '1');
  form.setAttribute('novalidate', '');
  var groups = root.querySelectorAll('.cc-wz-group[data-req="1"]');
  var clear = function (boxes) { return function () { boxes[0].setCustomValidity(''); }; };
  for (i = 0; i < groups.length; i++) {
    var boxes = groups[i].querySelectorAll('input[type="checkbox"]');
    for (var b = 0; b < boxes.length; b++) boxes[b].addEventListener('change', clear(boxes));
  }
  if (n < 2) return;
  var show = function (k, focus) {
    cur = k;
    for (i = 0; i < n; i++) steps[i].hidden = i !== k;
    back.hidden = k === 0;
    next.hidden = k === n - 1;
    submit.hidden = k !== n - 1;
    if (prog) prog.hidden = false;
    if (fill) fill.style.width = (((k + 1) / n) * 100).toFixed(1) + '%';
    if (count) count.textContent = tpl.split('{n}').join(String(k + 1)).split('{total}').join(String(n));
    for (i = 0; i < dots.length; i++) {
      dots[i].className = 'cc-wz-dot' + (i < k ? ' is-done' : '') + (i === k ? ' is-current' : '');
      if (i === k) dots[i].setAttribute('aria-current', 'step'); else dots[i].removeAttribute('aria-current');
    }
    // the step itself takes the focus (it is announced with its title): Firefox ignores focus() on a <legend> that has just become visible
    if (focus && !editor) steps[k].focus();
  };
  var firstInvalid = function (k) {
    var gs = steps[k].querySelectorAll('.cc-wz-group[data-req="1"]'), g, bx, any, j;
    for (g = 0; g < gs.length; g++) {
      bx = gs[g].querySelectorAll('input[type="checkbox"]');
      any = false;
      for (j = 0; j < bx.length; j++) { if (bx[j].checked) any = true; }
      if (bx.length) bx[0].setCustomValidity(any ? '' : 'Please choose at least one option.');
    }
    var els = steps[k].querySelectorAll('input, select, textarea');
    for (j = 0; j < els.length; j++) { if (!els[j].checkValidity()) return els[j]; }
    return null;
  };
  back.addEventListener('click', function () { show(cur - 1, true); });
  next.addEventListener('click', function () {
    var bad = editor ? null : firstInvalid(cur);
    if (bad) { bad.reportValidity(); return; }
    show(cur + 1, true);
  });
  form.addEventListener('submit', function (e) {
    if (editor) { e.preventDefault(); return; }
    var bad, k;
    if (cur < n - 1) {
      e.preventDefault();
      bad = firstInvalid(cur);
      if (bad) bad.reportValidity(); else show(cur + 1, true);
      return;
    }
    for (k = 0; k < n; k++) {
      bad = firstInvalid(k);
      if (bad) { e.preventDefault(); show(k, false); bad.reportValidity(); return; }
    }
  });
  show(0, false);
}
// cc-wizard:end
(function(){var r=document.getElementById('%ID%');if(r)ccWizardInit(r,false);})();
CCJS;
const CC_VIDEO_SCRIPT = <<<'CCJS'
// cc-video:begin
function ccVideoInit(root, editor) {
  var v = root.querySelector('.cc-vh-video'), btn = root.querySelector('.cc-vh-toggle');
  if (!v || root.getAttribute('data-ready')) return;
  var win = root.ownerDocument.defaultView, mq = function (q) { return !!(win.matchMedia && win.matchMedia(q).matches); };
  root.setAttribute('data-ready', '1');
  // the poster stays on the screen in the editor, and on phones unless the author chose video there
  if (editor || (root.getAttribute('data-mobile') !== '1' && mq('(max-width: 768px)'))) return;
  var pause = btn ? btn.querySelector('.cc-vh-i-pause') : null, play = btn ? btn.querySelector('.cc-vh-i-play') : null;
  var show = function (playing) {
    if (!btn) return;
    // (an SVG element ignores the hidden attribute, so the icons are shown and hidden with display)
    pause.style.display = playing ? '' : 'none';
    play.style.display = playing ? 'none' : '';
    btn.setAttribute('aria-label', playing ? 'Pause the background video' : 'Play the background video');
  };
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
    });
  }
  v.addEventListener('play', function () { show(true); });
  v.addEventListener('pause', function () { show(false); });
  show(false);
  // visitors who prefer reduced motion get the poster, and can start the video with the button
  if (mq('(prefers-reduced-motion: reduce)')) return;
  v.preload = 'auto';
  var started = v.play();
  if (started && started.catch) started.catch(function () {});
}
// cc-video:end
(function(){var r=document.getElementById('%ID%');if(r)ccVideoInit(r,false);})();
CCJS;
const CC_AUDIO_SCRIPT = <<<'CCJS'
// cc-audio:begin
function ccAudioInit(root) {
  var a = root.querySelector('.cc-au-el'), ui = root.querySelector('.cc-au-ui');
  if (!a || !ui || root.getAttribute('data-ready')) return;
  var doc = root.ownerDocument, playBtn = root.querySelector('.cc-au-play'), seek = root.querySelector('.cc-au-seek');
  var cur = root.querySelector('.cc-au-cur'), dur = root.querySelector('.cc-au-dur'), speedBtn = root.querySelector('.cc-au-speed');
  var back = root.querySelector('.cc-au-back'), fwd = root.querySelector('.cc-au-fwd'), step = parseInt(root.getAttribute('data-skip'), 10) || 15;
  var rates = [1, 1.25, 1.5, 2, 0.75], ri = 0, drag = false;
  root.setAttribute('data-ready', '1');
  a.removeAttribute('controls');
  ui.hidden = false;
  var fmt = function (t) {
    t = isFinite(t) && t > 0 ? Math.floor(t) : 0;
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : String(m)) + ':' + (s < 10 ? '0' : '') + s;
  };
  var paint = function () {
    var t = a.currentTime || 0, d = isFinite(a.duration) ? a.duration : 0;
    if (!drag) seek.value = String(t);
    cur.textContent = fmt(t);
    dur.textContent = fmt(d);
    seek.max = String(d || 0);
    seek.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(d));
  };
  var state = function () {
    var playing = !a.paused && !a.ended;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.querySelector('.cc-au-i-play').style.display = playing ? 'none' : '';   // (display: an SVG ignores hidden)
    playBtn.querySelector('.cc-au-i-pause').style.display = playing ? '' : 'none';
  };
  playBtn.addEventListener('click', function () {
    if (a.paused) { var p = a.play(); if (p && p.catch) p.catch(function () {}); } else a.pause();
  });
  if (back) back.addEventListener('click', function () { a.currentTime = Math.max(0, (a.currentTime || 0) - step); });
  if (fwd) fwd.addEventListener('click', function () { a.currentTime = Math.min(isFinite(a.duration) ? a.duration : 1e9, (a.currentTime || 0) + step); });
  if (speedBtn) speedBtn.addEventListener('click', function () {
    ri = (ri + 1) % rates.length;
    a.playbackRate = rates[ri];
    speedBtn.textContent = rates[ri] + '×';
  });
  seek.addEventListener('input', function () { drag = true; a.currentTime = parseFloat(seek.value) || 0; cur.textContent = fmt(a.currentTime); });
  seek.addEventListener('change', function () { drag = false; });
  a.addEventListener('timeupdate', paint);
  a.addEventListener('loadedmetadata', paint);
  a.addEventListener('durationchange', paint);
  a.addEventListener('play', function () {
    state();
    var all = doc.querySelectorAll('.cc-au-el');
    for (var i = 0; i < all.length; i++) { if (all[i] !== a && !all[i].paused) all[i].pause(); }
  });
  a.addEventListener('pause', state);
  a.addEventListener('ended', state);
  state();
  paint();
}
// cc-audio:end
(function(){var r=document.getElementById('%ID%');if(r)ccAudioInit(r);})();
CCJS;
const CC_ANNOUNCE_SCRIPT = <<<'CCJS'
// cc-announce:begin
function ccAnnounceInit(root, editor) {
  var btn = root.querySelector('.cc-ann-close'), win = root.ownerDocument.defaultView, key = 'cc_ann_' + (root.getAttribute('data-key') || '');
  if (root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');
  if (!editor) {
    var seen = false;
    try { seen = win.localStorage.getItem(key) === '1'; } catch { seen = false; }
    if (seen) { root.hidden = true; return; }
  }
  if (!editor) ccAnnounceBelowMenu(root);
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    if (editor) return;
    root.hidden = true;
    try { win.localStorage.setItem(key, '1'); } catch { /* it is not remembered */ }
  });
}
// A sticky bar stays UNDER a menu that is pinned to the top of the screen (position: fixed): it sticks at the menu's
// bottom edge and follows it when the menu shrinks or slides away. Without such a menu it sticks to the top.
function ccAnnounceBelowMenu(root) {
  var doc = root.ownerDocument, win = doc.defaultView;
  var setup = function () {
    var nav = doc.querySelector('.cc-navigation');
    if (!nav || win.getComputedStyle(root).position !== 'sticky') return;
    var follow = function () {
      var pinned = win.getComputedStyle(nav).position === 'fixed';
      root.style.top = (pinned ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 0) + 'px';
    };
    follow();
    win.addEventListener('scroll', follow, { passive: true });
    win.addEventListener('resize', follow);
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', setup); else setup();
}
// cc-announce:end
(function(){var r=document.getElementById('%ID%');if(r)ccAnnounceInit(r,false);})();
CCJS;
// Scrollytelling: the step in the middle of the screen decides which image shows ([data-active]); %ID% = the block's id
const CC_STORY_SCRIPT = <<<'CCJS'
(function(){var r=document.getElementById('%ID%');if(!r||!window.IntersectionObserver)return;var st=r.querySelectorAll('.cc-story-step');if(st.length<2)return;r.classList.add('cc-story-on');
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)r.setAttribute('data-active',e.target.getAttribute('data-i'));});},{rootMargin:'-45% 0px -45% 0px',threshold:0});
[].forEach.call(st,function(s){io.observe(s);});})();
CCJS;
// Product hotspots: a click or tap opens or closes a pin's text (hover and keyboard focus work without the script); %ID% = the block's id
const CC_HOTSPOTS_SCRIPT = <<<'CCJS'
(function(){var r=document.getElementById('%ID%');if(!r)return;var pins=[].slice.call(r.querySelectorAll('.cc-hs-pin'));
function close(keep){pins.forEach(function(p){if(p!==keep){p.classList.remove('is-open');p.querySelector('.cc-hs-btn').setAttribute('aria-expanded','false');}});}
pins.forEach(function(p){var b=p.querySelector('.cc-hs-btn');b.setAttribute('aria-expanded','false');b.addEventListener('click',function(e){e.stopPropagation();var open=p.classList.toggle('is-open');b.setAttribute('aria-expanded',open?'true':'false');close(p);});});
document.addEventListener('click',function(){close(null);});document.addEventListener('keydown',function(e){if(e.key==='Escape')close(null);});})();
CCJS;

// Site search script (SEARCH block); %ID% = the block's id
const CC_SEARCH_SCRIPT = <<<'CCJS'
(function(){var r=document.getElementById('%ID%');if(!r)return;var f=r.querySelector('form'),i=r.querySelector('input'),o=r.querySelector('.cc-search-results'),idx=null,lim=+r.getAttribute('data-limit')||10;
var keys=[];try{keys=JSON.parse(r.getAttribute('data-facets')||'[]');}catch(x){}
var sel={},fbox=null;
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function load(){if(idx)return Promise.resolve(idx);return fetch(r.getAttribute('data-index')).then(function(x){return x.json();}).then(function(d){idx=(Array.isArray(d)?d:[]).map(function(e){e._t=norm(e.t);e._a=norm(e.t+' '+(e.d||'')+' '+(e.x||''));return e;});return idx;});}
function vals(e,k){var v=e.f&&e.f[k];return v==null?[]:[].concat(v);}
function active(){return Object.keys(sel).some(function(k){return Object.keys(sel[k]).length>0;});}
function passes(e){for(var k in sel){var want=Object.keys(sel[k]);if(!want.length)continue;var have=vals(e,k);if(!want.some(function(v){return have.indexOf(v)>-1;}))return false;}return true;}
function buildFacets(d){if(!keys.length||fbox)return;fbox=document.createElement('div');fbox.className='cc-search-facets';fbox.setAttribute('style','display:grid; gap:10px; margin-top:14px');
keys.forEach(function(k){var seen={},label=k,list=[];d.forEach(function(e){if(e.fl&&e.fl[k])label=e.fl[k];vals(e,k).forEach(function(v){if(!seen[v]){seen[v]=0;list.push(v);}seen[v]++;});});
if(!list.length)return;sel[k]={};list.sort();
var g=document.createElement('fieldset');g.setAttribute('style','border:0; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center');
var lg=document.createElement('legend');lg.textContent=label;lg.setAttribute('style','font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; float:left; width:100%');g.appendChild(lg);
list.forEach(function(v){var lab=document.createElement('label');lab.setAttribute('style','display:flex; align-items:center; gap:6px; font-size:14px; color:#0f172a; cursor:pointer');var cb=document.createElement('input');cb.type='checkbox';
cb.addEventListener('change',function(){if(cb.checked)sel[k][v]=true;else delete sel[k][v];run(i.value);});lab.appendChild(cb);lab.appendChild(document.createTextNode(' '+v+' ('+seen[v]+')'));g.appendChild(lab);});
fbox.appendChild(g);});
if(fbox.childNodes.length)r.insertBefore(fbox,o);}
function run(q){var w=norm(q).split(/\s+/).filter(Boolean);if(!w.length&&!active()){o.innerHTML='';return;}
load().then(function(d){buildFacets(d);var res=d.filter(function(e){return passes(e)&&w.every(function(x){return e._a.indexOf(x)>-1;});});
if(w.length)res.sort(function(a,b){return (b._t.indexOf(w[0])>-1)-(a._t.indexOf(w[0])>-1);});res=res.slice(0,lim);
o.innerHTML=res.length?'<ul style="list-style:none;margin:0;padding:0">'+res.map(function(e){return '<li style="padding:12px 0;border-bottom:1px solid #e2e8f0"><a href="'+esc(e.u)+'" style="font-weight:600;font-size:17px;color:var(--brand-color,#3b82f6)">'+esc(e.t)+'</a>'+(e.d?'<p style="margin:4px 0 0;color:#475569">'+esc(e.d)+'</p>':'')+'</li>';}).join('')+'</ul>':'<p style="color:#64748b">'+esc(r.getAttribute('data-empty'))+(w.length?' “'+esc(q)+'”':'')+'</p>';}).catch(function(){o.textContent='Search is not available right now.';});}
f.addEventListener('submit',function(e){e.preventDefault();run(i.value);try{history.replaceState(null,'',location.pathname+(i.value?'?q='+encodeURIComponent(i.value):''));}catch(x){}});
var t;i.addEventListener('input',function(){clearTimeout(t);t=setTimeout(function(){run(i.value);},250);});
var q=new URLSearchParams(location.search).get('q');if(q){i.value=q;run(q);}
if(keys.length)load().then(buildFacets);})();
CCJS;

const CC_FORM_TYPES = ['text', 'email', 'textarea', 'number', 'tel', 'url', 'date'];

function build_inline_style($styles) {
    if (!$styles || !is_array($styles)) return '';
    $str = '';
    foreach($styles as $k => $v) {
        if ($v === '' || $v === null || $k === 'animation') continue;
        // Property names must look like CSS properties (a crafted key can't break out of the style attribute)
        if (!is_string($k) || !preg_match('/^[a-zA-Z][a-zA-Z0-9-]*$/', $k) || is_array($v) || is_object($v)) continue;
        // One value per property: no ; { } that would add declarations or rules, no escapes, no script URLs
        if (preg_match('/[;{}<>\\\\]|expression\s*\(|javascript:|vbscript:/i', (string)$v)) continue;
        $kebab_key = strtolower(preg_replace('/(?<!^)[A-Z]/', '-$0', $k));
        $str .= $kebab_key . ': ' . htmlspecialchars($v) . '; ';
    }
    return $str;
}

// ---------------------------------------------------------------------------
// MENU — nested tree model (children), backward compatible with the flat format
// ---------------------------------------------------------------------------
function cc_menu_url($url) {
    $url = trim((string)$url);
    if ($url === '' || $url === '#') return '';
    $u = htmlspecialchars($url);
    if (preg_match('~^(?:f|ht)tps?://~i', $u) || strpos($u, 'mailto:') === 0 || strpos($u, 'tel:') === 0) return $u;
    if ($u === 'index.html' || $u === 'index/index.html' || $u === 'home/index.html' || $u === '/') return '{{BASE_URL}}';
    $clean = str_replace(['index/index.html', 'index.html'], '', $u);
    return '{{BASE_URL}}' . ltrim($clean, '/');
}

function cc_menu_ensure_children($items) {
    $out = [];
    foreach ($items as $it) {
        $it['children'] = cc_menu_ensure_children($it['children'] ?? []);
        $out[] = $it;
    }
    return $out;
}

// Convert the old flat format (parentId) into a nested tree, preserving the order.
function cc_menu_flat_to_tree($items) {
    $nodes = [];
    foreach ($items as $it) {
        $id = $it['id'] ?? uniqid('m_');
        $nodes[$id] = ['id' => $id, 'title' => $it['title'] ?? '', 'url' => $it['url'] ?? '', 'children' => []];
    }
    $roots = [];
    foreach ($items as $it) {
        $id = $it['id'] ?? null;
        $pid = $it['parentId'] ?? null;
        if ($id === null || !isset($nodes[$id])) continue;
        if ($pid && isset($nodes[$pid])) $nodes[$pid]['children'][] = &$nodes[$id];
        else $roots[] = &$nodes[$id];
    }
    return json_decode(json_encode($roots), true); // resolve the references
}

function cc_menu_items($data) {
    $items = $data['items'] ?? (is_array($data) ? $data : []);
    if (empty($items)) return [];
    $nested = false;
    foreach ($items as $it) { if (array_key_exists('children', $it)) { $nested = true; break; } }
    return $nested ? cc_menu_ensure_children($items) : cc_menu_flat_to_tree($items);
}

function cc_hex_rgba($hex, $opacity) {
    $hex = ltrim((string)$hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    if (strlen($hex) !== 6 || !ctype_xdigit($hex)) return $hex;
    $r = hexdec(substr($hex, 0, 2)); $g = hexdec(substr($hex, 2, 2)); $b = hexdec(substr($hex, 4, 2));
    $a = max(0, min(100, (int)$opacity)) / 100;
    return "rgba($r, $g, $b, $a)";
}

function cc_render_menu_items($items) {
    $html = '';
    foreach ($items as $it) {
        $title = htmlspecialchars($it['title'] ?? 'Link');
        $children = $it['children'] ?? [];
        $hasKids = !empty($children);
        $href = cc_menu_url($it['url'] ?? '');
        $isLink = ($href !== '');
        $liClass = 'cc-item' . ($hasKids ? ' cc-has-dropdown' : '');
        $caret = $hasKids ? '<span class="cc-caret" aria-hidden="true">▾</span>' : '';
        $html .= "<li class=\"$liClass\">";
        if ($isLink) {
            $html .= "<a href=\"$href\" class=\"cc-menu-link\">$title$caret</a>";
        } else {
            // Item without a link: only opens the submenu (no href)
            $html .= "<button type=\"button\" class=\"cc-menu-link cc-menu-toggle\" aria-haspopup=\"true\" aria-expanded=\"false\">$title$caret</button>";
        }
        if ($hasKids) {
            $html .= "<ul class=\"cc-dropdown\">" . cc_render_menu_items($children) . "</ul>";
        }
        $html .= "</li>\n";
    }
    return $html;
}

function render_menu_html($menu_json_str, $opts = []) {
    $data = json_decode($menu_json_str, true);
    $items = cc_menu_items($data);
    $settings = is_array($data['settings'] ?? null) ? $data['settings'] : [];
    // Every menu setting ends up inside CSS (a <style> block or a style attribute): keep only characters
    // a CSS value needs, so a crafted value can't close the attribute, the rule or the <style> tag.
    $cssSafe = function ($v) use (&$cssSafe) {
        if (is_string($v)) return str_replace(['<', '>', '"', '{', '}', ';', '\\'], '', $v);
        if (is_array($v)) return array_map($cssSafe, $v);
        return is_scalar($v) || $v === null ? $v : null;
    };
    $settings = array_map($cssSafe, $settings);
    if (empty($items)) return '';
    $inheritTheme = !empty($opts['inheritTheme']);
    // $opts['preview'] (Menu Builder) renders exactly like the site: the preview page scrolls under a fixed bar.

    // --- Settings (with defaults) ---
    $align          = in_array($settings['align'] ?? '', ['flex-start', 'center', 'flex-end'], true) ? $settings['align'] : 'flex-end';
    $styleType      = $settings['styleType'] ?? 'link';                 // link|pill|box
    $textColor      = htmlspecialchars($settings['textColor'] ?? '#334155');
    $hoverTextColor = htmlspecialchars($settings['hoverTextColor'] ?? ($settings['textColor'] ?? '#3b82f6'));
    $hoverColorVal = $inheritTheme ? 'var(--brand-color)' : $hoverTextColor;
    $hoverBgColor   = $settings['hoverBgColor'] ?? 'transparent';
    $hoverBg        = ($hoverBgColor === 'transparent' || $hoverBgColor === '') ? 'transparent' : htmlspecialchars($hoverBgColor);
    $bgColor        = htmlspecialchars($settings['bgColor'] ?? '#3b82f6');
    $borderRadius   = htmlspecialchars($settings['borderRadius'] ?? '6px');
    $itemGap        = htmlspecialchars($settings['itemGap'] ?? '20px');
    $itemBorder     = htmlspecialchars($settings['itemBorder'] ?? 'none');
    $menuBgColorRaw = $settings['menuBgColor'] ?? 'transparent';
    $menuBgOpacity  = $settings['menuBgOpacity'] ?? 100;
    $menuBg         = ($menuBgColorRaw === 'transparent' || $menuBgColorRaw === '') ? 'transparent' : cc_hex_rgba($menuBgColorRaw, $menuBgOpacity);
    $barHeight      = htmlspecialchars($settings['barHeight'] ?? '64px');
    $barPadding     = htmlspecialchars($settings['barPadding'] ?? '0 24px');
    $isSticky       = !empty($settings['isSticky']);
    $shadow         = $settings['shadow'] ?? 'none';                    // none|soft|medium|strong
    $effects        = cc_menu_effects($settings);
    $fx             = function ($id) use ($effects) { return in_array($id, $effects, true); };
    $buttonText     = htmlspecialchars($settings['buttonTextColor'] ?? '#ffffff');
    $fontSize       = htmlspecialchars($settings['fontSize'] ?? '15px');
    $fontWeight     = (string)($settings['fontWeight'] ?? '600');
    $fontWeight     = in_array($fontWeight, ['300', '400', '500', '600', '700', '800'], true) ? $fontWeight : '600';
    $textTransform  = (string)($settings['textTransform'] ?? 'none');
    $textTransform  = in_array($textTransform, ['none', 'uppercase', 'capitalize'], true) ? $textTransform : 'none';
    $letterSpacing  = htmlspecialchars($settings['letterSpacing'] ?? '0px');
    $highlightCurrent = !empty($settings['highlightCurrent']);
    $logoUrl        = trim((string)($settings['logoUrl'] ?? ''));
    $logoAlign      = ($settings['logoAlign'] ?? 'left') === 'right' ? 'right' : 'left';
    $logoHeight     = htmlspecialchars($settings['logoHeight'] ?? '40px');
    $logoGap        = htmlspecialchars($settings['logoGap'] ?? '24px');
    $logoLink       = cc_menu_url($settings['logoLink'] ?? 'index.html');
    $mobileThreshold= (int)($settings['mobileThreshold'] ?? 768);
    $burgerIcon     = htmlspecialchars($settings['burgerIcon'] ?? '☰');
    $burgerStyle    = cc_menu_burger_style($settings);
    $burgerLeft     = ($settings['mobileBurgerSide'] ?? 'right') === 'left';
    $mobileLogo     = !array_key_exists('mobileShowLogo', $settings) || !empty($settings['mobileShowLogo']);

    $hasLogo = ($logoUrl !== '');
    $logoSrc = htmlspecialchars($logoUrl);

    // --- Shadow ---
    $shadowMap = [
        'none' => 'none',
        'soft' => '0 2px 8px rgba(0,0,0,0.06)',
        'medium' => '0 6px 20px rgba(0,0,0,0.12)',
        'strong' => '0 10px 30px rgba(0,0,0,0.22)',
    ];
    $boxShadow = $shadowMap[$shadow] ?? 'none';

    // --- Logo/buttons layout ---
    $buttonsSide = $align === 'flex-start' ? 'left' : ($align === 'center' ? 'center' : 'right');
    $innerExtra = ''; $logoStyle = "display:inline-flex; align-items:center; flex:0 0 auto;"; $menuWrapStyle = '';
    $justify = $align;
    if ($hasLogo) {
        if ($buttonsSide === 'center') {
            $justify = 'center';
            $innerExtra = 'position:relative;';
            $logoStyle .= 'position:absolute; top:50%; transform:translateY(-50%);' . ($logoAlign === 'right' ? "right:0;" : "left:0;");
        } elseif ($logoAlign === $buttonsSide) {
            // same side: logo and buttons together, logoGap apart
            $justify = $buttonsSide === 'left' ? 'flex-start' : 'flex-end';
            if ($buttonsSide === 'left') { $logoStyle .= "order:1;"; $menuWrapStyle .= "order:2; margin-left:$logoGap;"; }
            else { $menuWrapStyle .= "order:1;"; $logoStyle .= "order:2; margin-left:$logoGap;"; }
        } else {
            // opposite sides: at the edges
            $justify = 'space-between';
            if ($logoAlign === 'left') { $logoStyle .= "order:1;"; $menuWrapStyle .= "order:2;"; }
            else { $menuWrapStyle .= "order:1;"; $logoStyle .= "order:2;"; }
        }
    }

    $stickyCss = $isSticky ? "position:fixed; top:0; left:0; right:0; z-index:9999;" : "position:relative;";

    // --- HTML ---
    $logoHtml = '';
    if ($hasLogo) {
        $logoInner = "<img src=\"$logoSrc\" alt=\"Logo\" style=\"height:$logoHeight; width:auto; display:block;\">";
        $logoHtml = $logoLink !== ''
            ? "<a href=\"$logoLink\" class=\"cc-logo\" style=\"$logoStyle\">$logoInner</a>"
            : "<span class=\"cc-logo\" style=\"$logoStyle\">$logoInner</span>";
    }

    $navEffect = $fx('glass') ? "backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);" : '';
    $glareHtml = $fx('glare') ? "<span class=\"cc-glare\" aria-hidden=\"true\"></span>" : '';
    $html  = "<nav class=\"cc-navigation\" style=\"$stickyCss width:100%; padding:0; box-sizing:border-box; background:$menuBg; box-shadow:$boxShadow; $navEffect\">\n";
    $html .= "  $glareHtml\n";
    $html .= "  <div class=\"cc-nav-inner\" style=\"display:flex; align-items:center; min-height:$barHeight; padding:$barPadding; box-sizing:border-box; justify-content:$justify; position:relative; z-index:1; $innerExtra\">\n";
    $html .= "    $logoHtml\n";
    if ($burgerStyle === 'custom') $burgerHtml = "<span class=\"cc-burger-glyph\">$burgerIcon</span>";
    elseif ($burgerStyle === 'label') $burgerHtml = CC_MENU_BURGERS['lines'] . "<span class=\"cc-burger-label\">Menu</span>";
    else $burgerHtml = CC_MENU_BURGERS[$burgerStyle];
    $html .= "    <button type=\"button\" class=\"cc-mobile-toggle\" aria-label=\"Menu\" aria-expanded=\"false\" style=\"display:none; background:none; border:none; cursor:pointer; color:$textColor; order:3;\">"
        . "<span class=\"cc-burger-icon\">$burgerHtml</span><span class=\"cc-burger-close\">" . CC_MENU_BURGER_CLOSE . "</span></button>\n";
    $html .= "    <ul class=\"cc-main-menu\" style=\"display:flex; align-items:center; gap:$itemGap; list-style:none; margin:0; padding:0; flex-wrap:wrap; $menuWrapStyle\">\n";
    $html .= cc_render_menu_items($items);
    $html .= "    </ul>\n";
    $html .= "  </div>\n";

    // --- CSS ---
    $top = ".cc-navigation .cc-main-menu > .cc-item > .cc-menu-link";
    // Hovered top-level item; with "highlight current page" the current one looks hovered too
    $topOn = "$top:hover" . ($highlightCurrent ? ", $top.cc-current" : '');
    $pillBox = '';
    if ($styleType === 'pill' || $styleType === 'box') {
        $radius = $styleType === 'pill' ? '50px' : $borderRadius;
        $pillBox = "$top { color:$buttonText !important; background:$bgColor; padding:10px 18px; border-radius:$radius; }";
    }
    $dropdownBg = ($menuBgColorRaw === 'transparent' || $menuBgColorRaw === '') ? '#ffffff' : cc_hex_rgba($menuBgColorRaw, 100);
    $currentCss = $highlightCurrent
        ? ".cc-navigation .cc-menu-link.cc-current { color:$hoverColorVal !important;" . ($hoverBg !== 'transparent' ? " background:$hoverBg !important;" : "") . " }"
        : '';

    $effectCss = cc_menu_effects_css($effects, [
        'top' => $top, 'topOn' => $topOn, 'hover' => $hoverColorVal, 'accent' => $hoverColorVal,
        'barHeight' => $barHeight, 'logoHeight' => $logoHeight, 'mobile' => $mobileThreshold,
        'topCount' => count($items), 'sticky' => $isSticky,
    ]);

    $html .= "  <style>\n";
    $html .= "    .cc-navigation * { box-sizing:border-box; }\n";
    $html .= "    .cc-navigation .cc-menu-link { color:$textColor !important; text-decoration:none; font-weight:$fontWeight; font-size:$fontSize; text-transform:$textTransform; letter-spacing:$letterSpacing; display:inline-flex; align-items:center; gap:6px; padding:8px 10px; border:$itemBorder; border-radius:$borderRadius; background:transparent; cursor:pointer; font-family:inherit; transition:color .2s, background .2s, transform .2s, box-shadow .2s, text-shadow .2s; }\n";
    $html .= "    .cc-navigation .cc-caret { font-size:11px; opacity:0.7; }\n";
    $html .= "    $pillBox\n";
    $html .= "    .cc-navigation .cc-menu-link:hover { color:$hoverColorVal !important;" . ($hoverBg !== 'transparent' ? " background:$hoverBg !important;" : "") . " }\n";
    $html .= "    $currentCss\n";
    $html .= "    .cc-navigation .cc-item { position:relative; }\n";
    $html .= "    .cc-navigation .cc-dropdown { display:none; position:absolute; top:100%; left:0; min-width:210px; padding:8px 0; margin:0; list-style:none; border-radius:10px; z-index:1000; background:$dropdownBg; box-shadow:0 12px 30px rgba(0,0,0,0.12); }\n";
    $html .= "    .cc-navigation .cc-item:hover > .cc-dropdown, .cc-navigation .cc-item:focus-within > .cc-dropdown { display:block; }\n";
    $html .= "    .cc-navigation .cc-dropdown .cc-item { width:100%; }\n";
    $html .= "    .cc-navigation .cc-dropdown .cc-menu-link { color:$textColor !important; width:100%; padding:9px 18px; border-radius:0; border:none; background:transparent; }\n";
    $html .= "    .cc-navigation .cc-dropdown .cc-menu-link:hover { color:$hoverColorVal !important; background:" . ($hoverBg !== 'transparent' ? "$hoverBg" : "rgba(0,0,0,0.05)") . " !important; }\n";
    $html .= "    .cc-navigation .cc-dropdown .cc-dropdown { top:0; left:100%; }\n"; // sub-submenu to the side
    $html .= "    $effectCss\n";
    $html .= "    .cc-navigation .cc-mobile-toggle { align-items:center; gap:8px; padding:6px; line-height:1; font-family:inherit; }\n";
    $html .= "    .cc-navigation .cc-burger-icon, .cc-navigation .cc-burger-close { display:inline-flex; align-items:center; gap:8px; }\n";
    $html .= "    .cc-navigation .cc-burger-close, .cc-navigation .cc-mobile-toggle[aria-expanded=\"true\"] .cc-burger-icon { display:none; }\n";
    $html .= "    .cc-navigation .cc-mobile-toggle[aria-expanded=\"true\"] .cc-burger-close { display:inline-flex; }\n";
    $html .= "    .cc-navigation .cc-mobile-toggle svg { width:28px; height:28px; display:block; }\n";
    $html .= "    .cc-navigation .cc-burger-glyph { font-size:28px; }\n";
    $html .= "    .cc-navigation .cc-burger-label { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }\n";
    $html .= "    @media (max-width: {$mobileThreshold}px) {\n";
    // Mobile bar: [logo … burger] or, with the burger on the left, [burger … logo]; the open menu
    // wraps below as a full-width column. Overrides the desktop alignment (inline styles), which
    // would otherwise center the burger or float the logo over the open menu.
    $html .= "      .cc-navigation .cc-nav-inner { flex-wrap:wrap; justify-content:space-between !important; position:relative; }\n";
    $html .= "      .cc-navigation .cc-logo { position:static !important; transform:none !important; margin:0 !important; order:" . ($burgerLeft ? '2' : '1') . " !important;" . ($burgerLeft ? ' margin-left:auto !important;' : '') . ($mobileLogo ? '' : ' display:none !important;') . " }\n";
    $html .= "      .cc-navigation .cc-mobile-toggle { display:inline-flex !important; order:" . ($burgerLeft ? '1' : '2') . " !important; margin:0 !important; " . ($burgerLeft ? 'margin-right:auto !important;' : 'margin-left:auto !important;') . " }\n";
    $html .= "      .cc-navigation .cc-main-menu { display:none !important; order:3 !important; flex-direction:column; align-items:stretch !important; width:100%; margin:0 !important; gap:0 !important; padding:10px 0 !important; }\n";
    $html .= "      .cc-navigation .cc-main-menu.active { display:flex !important; }\n";
    $html .= "      .cc-dropdown { position:static !important; display:none; box-shadow:none !important; padding-left:18px !important; min-width:0; background:transparent; }\n";
    $html .= "      .cc-item.cc-open > .cc-dropdown { display:block !important; }\n";
    $html .= "      .cc-dropdown .cc-dropdown { left:0 !important; }\n";
    $html .= "      .cc-menu-link { width:100%; }\n";
    $html .= "    }\n";
    $html .= "    @media (prefers-reduced-motion: reduce) { .cc-navigation, .cc-navigation *, .cc-navigation *::before, .cc-navigation *::after { animation:none !important; transition:none !important; } }\n";
    $html .= "  </style>\n";

    // --- Script: burger + submenu expansion on mobile + current page + scroll effects + sticky padding ---
    $scrollFx = $isSticky && ($fx('shrink') || $fx('hide-on-scroll') || $fx('shadow-on-scroll'));
    $html .= "  <script>\n";
    $html .= "  (function(){\n";
    $html .= "    var nav = document.currentScript ? document.currentScript.closest('.cc-navigation') : document.querySelector('.cc-navigation');\n";
    $html .= "    if(!nav) return;\n";
    $html .= "    var toggle = nav.querySelector('.cc-mobile-toggle');\n";
    $html .= "    var menu = nav.querySelector('.cc-main-menu');\n";
    $html .= "    if(toggle && menu){ toggle.addEventListener('click', function(){ toggle.setAttribute('aria-expanded', menu.classList.toggle('active') ? 'true' : 'false'); }); }\n";
    $html .= "    nav.querySelectorAll('.cc-item.cc-has-dropdown > .cc-menu-toggle, .cc-item.cc-has-dropdown > .cc-menu-link').forEach(function(el){\n";
    $html .= "      el.addEventListener('click', function(e){\n";
    $html .= "        if(window.innerWidth <= {$mobileThreshold}){\n";
    $html .= "          var li = el.parentElement;\n";
    $html .= "          if(el.classList.contains('cc-menu-toggle') || li.classList.contains('cc-has-dropdown')){ e.preventDefault(); li.classList.toggle('cc-open'); }\n";
    $html .= "        }\n";
    $html .= "      });\n";
    $html .= "    });\n";
    // Marks the link to the page being viewed (aria-current) and its top-level parent
    $html .= "    var norm = function(p){ p = p.replace(/index\\.html\$/, ''); return p.charAt(p.length - 1) === '/' ? p : p + '/'; };\n";
    $html .= "    var here = norm(location.pathname);\n";
    $html .= "    nav.querySelectorAll('a.cc-menu-link').forEach(function(a){\n";
    $html .= "      if(a.host !== location.host || norm(a.pathname) !== here) return;\n";
    $html .= "      a.setAttribute('aria-current', 'page'); a.classList.add('cc-current');\n";
    $html .= "      var topItem = a.closest('.cc-main-menu > .cc-item'); var topLink = topItem && topItem.querySelector('.cc-menu-link');\n";
    $html .= "      if(topLink) topLink.classList.add('cc-current');\n";
    $html .= "    });\n";
    if ($scrollFx) {
        $html .= "    var lastY = window.scrollY;\n";
        $html .= "    var onScroll = function(){\n";
        $html .= "      var y = window.scrollY;\n";
        $html .= "      nav.classList.toggle('cc-scrolled', y > 30);\n";
        if ($fx('hide-on-scroll')) {
            $html .= "      var open = menu && menu.classList.contains('active');\n";
            $html .= "      if(y > lastY && y > nav.offsetHeight && !open) nav.classList.add('cc-nav-hidden');\n";
            $html .= "      else if(y < lastY || open) nav.classList.remove('cc-nav-hidden');\n";
        }
        $html .= "      lastY = y;\n";
        $html .= "    };\n";
        $html .= "    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();\n";
    }
    if ($isSticky) {
        $html .= "    document.body.style.paddingTop = nav.offsetHeight + 'px';\n";
    }
    $html .= "  })();\n";
    $html .= "  </script>\n";
    $html .= "</nav>\n";
    return $html;
}

// Burger icons for the mobile menu (SVG, drawn in the text color). 'label' adds the word "Menu"
// to the lines and 'custom' shows the burgerIcon text. Mirrors BURGER_ICONS in menuThemes.js.
const CC_MENU_SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">';
const CC_MENU_BURGERS = [
    'lines'     => CC_MENU_SVG_OPEN . '<path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    'staggered' => CC_MENU_SVG_OPEN . '<path d="M4 6h16M4 12h12M4 18h8"/></svg>',
    'two-lines' => CC_MENU_SVG_OPEN . '<path d="M4 9h16M4 15h16"/></svg>',
    'thin'      => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    'bold'      => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    'dots'      => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    'grid'      => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>',
    'boxed'     => CC_MENU_SVG_OPEN . '<rect x="2.5" y="2.5" width="19" height="19" rx="5"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h9"/></svg>',
];
const CC_MENU_BURGER_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// Burger style; menus saved before the picker existed keep a custom character, the default ☰ becomes 'lines'.
function cc_menu_burger_style($settings) {
    $s = $settings['burgerStyle'] ?? null;
    if ($s === 'custom' || $s === 'label' || isset(CC_MENU_BURGERS[$s ?? ''])) return $s;
    $icon = trim((string)($settings['burgerIcon'] ?? ''));
    return ($icon !== '' && $icon !== '☰') ? 'custom' : 'lines';
}

// Menu effects: id => group. In a 'single' group only one effect applies (they animate the same
// property); the others stack. Mirrors EFFECT_GROUPS in canvascore-frontend/src/menu/menuThemes.js.
const CC_MENU_EFFECTS = [
    'underline' => 'decor', 'underline-center' => 'decor', 'overline' => 'decor', 'highlight' => 'decor', 'dot' => 'decor',
    'lift' => 'motion', 'grow' => 'motion', 'pop' => 'motion',
    'glow' => 'glow', 'halo' => 'glow',
    'glass' => 'bar', 'glare' => 'bar', 'accent-line' => 'bar',
    'shrink' => 'scroll', 'hide-on-scroll' => 'scroll', 'shadow-on-scroll' => 'scroll',
    'dd-fade' => 'dropdown', 'dd-slide' => 'dropdown', 'dd-zoom' => 'dropdown',
    'enter-slide' => 'entrance', 'enter-fade' => 'entrance', 'enter-stagger' => 'entrance',
];
const CC_MENU_SINGLE_GROUPS = ['decor', 'motion', 'dropdown', 'entrance'];

// Valid effects of a menu: the `effects` list, or the legacy single `effect` string.
function cc_menu_effects($settings) {
    if (isset($settings['effects']) && is_array($settings['effects'])) $list = $settings['effects'];
    else $list = (!empty($settings['effect']) && $settings['effect'] !== 'none') ? [$settings['effect']] : [];
    $out = []; $taken = [];
    foreach ($list as $id) {
        if (!is_string($id) || !isset(CC_MENU_EFFECTS[$id]) || in_array($id, $out, true)) continue;
        $g = CC_MENU_EFFECTS[$id];
        if (in_array($g, CC_MENU_SINGLE_GROUPS, true)) { if (isset($taken[$g])) continue; $taken[$g] = true; }
        $out[] = $id;
    }
    return $out;
}

function cc_menu_effects_css($effects, $o) {
    $has = function ($id) use ($effects) { return in_array($id, $effects, true); };
    $top = $o['top']; $on = $o['topOn'];
    // selector list with a pseudo-element appended to each selector
    $pe = function ($sel, $pseudo) { return implode(', ', array_map(function ($s) use ($pseudo) { return trim($s) . $pseudo; }, explode(',', $sel))); };
    $css = [];

    // Hover indicator (one): drawn with ::after (::before for the highlight fill)
    $line = "content:''; position:absolute; left:0; width:100%; height:2px; background:currentColor; transition:transform .25s ease;";
    if ($has('underline') || $has('underline-center') || $has('overline')) {
        $pos = $has('overline') ? 'top:-4px;' : 'bottom:-4px;';
        $origin = $has('underline') ? 'left' : 'center';
        $css[] = "$top { position:relative; }";
        $css[] = "$top::after { $line $pos transform:scaleX(0); transform-origin:$origin; }";
        $css[] = $pe($on, '::after') . " { transform:scaleX(1); }";
    } elseif ($has('highlight')) {
        $css[] = "$top { position:relative; isolation:isolate; }";
        $css[] = "$top::before { content:''; position:absolute; inset:0; border-radius:inherit; background:currentColor; opacity:.14; z-index:-1; transform:scaleY(0); transform-origin:bottom; transition:transform .25s ease; }";
        $css[] = $pe($on, '::before') . " { transform:scaleY(1); }";
    } elseif ($has('dot')) {
        $css[] = "$top { position:relative; }";
        $css[] = "$top::after { content:''; position:absolute; left:50%; bottom:-3px; width:5px; height:5px; border-radius:50%; background:currentColor; transform:translateX(-50%) scale(0); transition:transform .2s ease; }";
        $css[] = $pe($on, '::after') . " { transform:translateX(-50%) scale(1); }";
    }

    // Hover motion (one)
    if ($has('lift')) $css[] = "$top:hover { transform:translateY(-2px); }";
    elseif ($has('grow')) $css[] = "$top:hover { transform:scale(1.06); }";
    elseif ($has('pop')) $css[] = "$top { transition-timing-function:cubic-bezier(.34,1.56,.64,1); } $top:hover { transform:scale(1.1); }";

    // Hover glow (stackable)
    if ($has('glow')) $css[] = "$top:hover { text-shadow:0 0 12px {$o['hover']}; }";
    if ($has('halo')) $css[] = "$top:hover { box-shadow:0 6px 18px rgba(0,0,0,.18); }";

    // Bar
    if ($has('glare')) {
        // Overlay clipped to the bar only: the sheen does not cut off the dropdowns
        $css[] = ".cc-navigation .cc-glare { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:2; }";
        $css[] = ".cc-navigation .cc-glare::before { content:''; position:absolute; top:0; left:-150%; width:60%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,0.35), transparent); transform:skewX(-20deg); animation: ccGlare 6s ease-in-out infinite; }";
        $css[] = "@keyframes ccGlare { 0%,60% { left:-150%; } 100% { left:150%; } }";
    }
    if ($has('accent-line')) {
        // z-index 0 like the glare: below .cc-nav-inner (z-index 1), which holds the open dropdowns
        $css[] = ".cc-navigation::after { content:''; position:absolute; left:0; right:0; bottom:0; height:3px; background:linear-gradient(90deg, {$o['accent']}, transparent); pointer-events:none; z-index:0; }";
    }

    // On scroll (sticky bar only; the script toggles .cc-scrolled / .cc-nav-hidden)
    if ($o['sticky']) {
        if ($has('shrink')) {
            $css[] = ".cc-navigation .cc-nav-inner { transition:min-height .25s ease; } .cc-navigation .cc-logo img { transition:height .25s ease; }";
            $css[] = ".cc-navigation.cc-scrolled .cc-nav-inner { min-height:calc({$o['barHeight']} * .75) !important; }";
            $css[] = ".cc-navigation.cc-scrolled .cc-logo img { height:calc({$o['logoHeight']} * .8) !important; }";
        }
        if ($has('hide-on-scroll')) $css[] = ".cc-navigation { transition:transform .3s ease; } .cc-navigation.cc-nav-hidden { transform:translateY(-100%); }";
        if ($has('shadow-on-scroll')) $css[] = ".cc-navigation.cc-scrolled { box-shadow:0 8px 24px rgba(0,0,0,.15) !important; }";
    }

    // Submenu opening (one, desktop only: on mobile the submenus expand in place)
    $dd = $has('dd-fade') ? 'none' : ($has('dd-slide') ? 'translateY(-8px)' : ($has('dd-zoom') ? 'scale(.96)' : null));
    if ($dd !== null) {
        $min = $o['mobile'] + 1;
        $css[] = "@media (min-width: {$min}px) {"
            . " .cc-navigation .cc-dropdown { display:block; visibility:hidden; opacity:0; pointer-events:none; transform:$dd; transform-origin:top left; transition:opacity .2s ease, transform .2s ease, visibility 0s linear .2s; }"
            . " .cc-navigation .cc-item:hover > .cc-dropdown, .cc-navigation .cc-item:focus-within > .cc-dropdown { visibility:visible; opacity:1; pointer-events:auto; transform:none; transition-delay:0s; }"
            . " }";
    }

    // Page load (one)
    if ($has('enter-slide')) $css[] = ".cc-navigation { animation:ccNavSlide .6s ease; } @keyframes ccNavSlide { from { transform:translateY(-100%); opacity:0; } }";
    elseif ($has('enter-fade')) $css[] = ".cc-navigation { animation:ccNavFade .8s ease; } @keyframes ccNavFade { from { opacity:0; } }";
    elseif ($has('enter-stagger')) {
        $css[] = ".cc-navigation .cc-main-menu > .cc-item { animation:ccItemIn .45s ease backwards; } @keyframes ccItemIn { from { opacity:0; transform:translateY(-8px); } }";
        for ($i = 1; $i <= $o['topCount']; $i++) $css[] = ".cc-navigation .cc-main-menu > .cc-item:nth-child($i) { animation-delay:" . round(0.07 * $i, 2) . "s; }";
    }

    return implode("\n    ", $css);
}

// ---------------------------------------------------------------------------
// Styles per device. block.responsive = { tablet: {styles}, mobile: {styles}, hide: ['desktop'|'tablet'|'mobile'] }:
// overrides of the block's own styles (desktop), written as media rules on the block's id. Phones inherit the
// tablet overrides, as in CSS. Mirrors deviceCss() in renderBlock.mjs (parity tests compare the two).
// ---------------------------------------------------------------------------
const CC_TABLET_MAX = 1024;
const CC_MOBILE_MAX = 767;
const CC_DEVICE_KEYS = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'padding', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'width', 'height', 'maxWidth', 'minWidth', 'minHeight', 'maxHeight', 'fontSize', 'lineHeight',
    'letterSpacing', 'fontWeight', 'textTransform', 'textAlign', 'color', 'backgroundColor', 'borderWidth', 'borderStyle', 'borderColor',
    'borderRadius', 'gap', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'order'];
function cc_device_decls($styles, $keys) {
    if (!is_array($styles)) return '';
    $out = '';
    foreach ($keys as $k) {
        if (!array_key_exists($k, $styles)) continue;
        $v = $styles[$k];
        if (!is_string($v) && !is_int($v) && !is_float($v)) continue;
        $v = trim((string)$v);
        if ($v === '' || preg_match('/[;{}<>\\\\]|expression\s*\(|javascript:|vbscript:|\/\*/i', $v)) continue;
        $out .= strtolower(preg_replace('/(?<!^)[A-Z]/', '-$0', $k)) . ':' . $v . ' !important;';
    }
    return $out;
}
function cc_device_css($block, $id) {
    $r = $block['responsive'] ?? null;
    if (!is_array($r) || $id === '') return '';
    // A Button's styles are on its link, except the spacing and alignment of its wrapper
    $outerKeys = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'textAlign'];
    $isBtn = ($block['type'] ?? '') === 'BUTTON';
    $rule = function ($styles) use ($id, $isBtn, $outerKeys) {
        if (!$isBtn) { $d = cc_device_decls($styles, CC_DEVICE_KEYS); return $d !== '' ? "#$id{" . $d . '}' : ''; }
        $o = cc_device_decls($styles, $outerKeys);
        $i = cc_device_decls($styles, array_values(array_diff(CC_DEVICE_KEYS, $outerKeys)));
        return ($o !== '' ? "#$id{" . $o . '}' : '') . ($i !== '' ? "#$id>.cc-btn{" . $i . '}' : '');
    };
    $css = '';
    $t = $rule($r['tablet'] ?? null);
    if ($t !== '') $css .= '@media(max-width:' . CC_TABLET_MAX . 'px){' . $t . '}';
    $m = $rule($r['mobile'] ?? null);
    if ($m !== '') $css .= '@media(max-width:' . CC_MOBILE_MAX . 'px){' . $m . '}';
    $hide = is_array($r['hide'] ?? null) ? $r['hide'] : [];
    $ranges = ['desktop' => '(min-width:' . (CC_TABLET_MAX + 1) . 'px)', 'tablet' => '(min-width:' . (CC_MOBILE_MAX + 1) . 'px) and (max-width:' . CC_TABLET_MAX . 'px)', 'mobile' => '(max-width:' . CC_MOBILE_MAX . 'px)'];
    foreach ($ranges as $dev => $q) { if (in_array($dev, $hide, true)) $css .= "@media$q{#$id{display:none !important;}}"; }
    return $css !== '' ? '<style data-cc-device>' . $css . "</style>\n" : '';
}

// The item being published: its cleaned field values (by field id), the definitions of its collection and the items a
// reference can point to. rebuild_all.php sets it around each item's blocks and clears it afterwards; on other pages it
// is null and the Item Field block shows nothing.
function cc_item_context($ctx = false) {
    static $current = null;
    if ($ctx !== false) $current = $ctx;
    return $current;
}
// ---------------------------------------------------------------------------
// Dynamic values: any text or value of a block may hold {{field:KEY}} (a field of the collection), {{field:KEY.part}}
// (a link's url or text, a reference's title or url) and {{item:title|excerpt|date|url}} (the item itself). On an item
// page they are replaced with the item's values, escaped (a rich-text field gives its cleaned HTML). On any other page
// they are removed, so no placeholder reaches a visitor. Twin: src/render/itemBinding.mjs.
// ---------------------------------------------------------------------------
const CC_TOKEN_RE = '/\{\{(field|item):([a-z][a-z0-9_]{0,39})(?:\.([a-z]{1,20}))?\}\}/';
// A date as the site writes it ("October 19, 2026"); '' when it is not a date
function cc_long_date($ymd) {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd) || !checkdate((int)substr($ymd, 5, 2), (int)substr($ymd, 8, 2), (int)substr($ymd, 0, 4))) return '';
    return date('F j, Y', strtotime($ymd . ' 12:00:00'));
}
// A number without trailing zeros (12.5 and 12 as "12.5" and "12")
function cc_plain_number($v) {
    $s = rtrim(rtrim(number_format((float)$v, 6, '.', ''), '0'), '.');
    return htmlspecialchars($s === '-0' ? '0' : $s);
}
function cc_bind_token($m, $ctx) {
    if ($ctx === null) return '';
    $kind = $m[1]; $name = $m[2]; $part = $m[3] ?? '';
    if ($kind === 'item') {
        $it = $ctx['page'] ?? [];   // the item's title, excerpt, date and address
        if ($name === 'date') return htmlspecialchars(cc_long_date((string)($it['date'] ?? '')));
        if (in_array($name, ['title', 'excerpt', 'url'], true)) return htmlspecialchars((string)($it[$name] ?? ''));
        return '';
    }
    $def = null;
    foreach ($ctx['defs'] ?? [] as $d) { if ($d['key'] === $name) { $def = $d; break; } }
    if ($def === null) return '';
    $v = $ctx['values'][$def['id']] ?? null;
    switch ($def['type']) {
        case 'text': case 'image':
            return htmlspecialchars((string)$v);
        case 'richtext':
            return (string)$v;   // cleaned when it was saved
        case 'number':
            return $v === null ? '' : cc_plain_number($v);
        case 'date':
            return htmlspecialchars(cc_long_date((string)$v));
        case 'link':
            $url = is_array($v) ? (string)($v['url'] ?? '') : '';
            if ($part === 'text') return htmlspecialchars(is_array($v) && $v['text'] !== '' ? (string)$v['text'] : $url);
            return $url === '' ? '' : htmlspecialchars(cc_block_url($url));
        case 'choice':
            $names = [];
            foreach ((array)$v as $x) { foreach ($def['options'] ?? [] as $o) { if ($o['value'] === $x) { $names[] = htmlspecialchars($o['label']); break; } } }
            return implode(', ', $names);
        case 'reference':
            $ref = is_string($v) && $v !== '' ? ($ctx['items'][$v] ?? null) : null;
            if ($ref === null) return '';
            if ($part === 'url') return $ref['live'] ? htmlspecialchars('{{BASE_URL}}' . $ref['col_slug'] . '/' . $ref['slug'] . '/') : '';
            return htmlspecialchars($ref['title']);
    }
    return '';
}
// Replaces the tokens of a string (or of every string in an array, keys kept) for the item being published
function cc_bind_deep($value, $ctx) {
    if (is_string($value)) {
        if (strpos($value, '{{') === false) return $value;
        return preg_replace_callback(CC_TOKEN_RE, function ($m) use ($ctx) { return cc_bind_token($m, $ctx); }, $value);
    }
    if (is_array($value)) {
        foreach ($value as $k => $v) $value[$k] = cc_bind_deep($v, $ctx);
    }
    return $value;
}

// The HTML of one field's value (no label), for its type. '' when the value is empty.
function cc_field_html($d, $v, $c, $ctx) {
    switch ($d['type']) {
        case 'text':
            return $v === '' || $v === null ? '' : '<div class="cc-field-value">' . nl2br(htmlspecialchars((string)$v)) . '</div>';
        case 'richtext':
            return (string)$v === '' ? '' : '<div class="cc-field-value">' . $v . '</div>';   // rich text is cleaned when it is saved
        case 'number':
            if ($v === null) return '';
            return '<div class="cc-field-value">' . htmlspecialchars(cc_fmt_num($v, cc_int($c['decimals'] ?? null, 0, 0, 4))) . '</div>';
        case 'date':
            if ($v === '' || $v === null) return '';
            $shown = ($c['dateFormat'] ?? 'long') === 'iso' ? (string)$v : date('F j, Y', strtotime($v . ' 12:00:00'));
            return '<div class="cc-field-value"><time datetime="' . htmlspecialchars((string)$v) . '">' . htmlspecialchars($shown) . '</time></div>';
        case 'image':
            if ($v === '' || $v === null) return '';
            return '<img class="cc-field-image" src="' . htmlspecialchars((string)$v) . '" alt="" loading="lazy" style="max-width:100%; height:auto; display:block;">';
        case 'gallery':
            if (!is_array($v) || !$v) return '';
            $imgs = '';
            foreach ($v as $u) $imgs .= '<img src="' . htmlspecialchars((string)$u) . '" alt="" loading="lazy" style="width:100%; height:auto; display:block; border-radius:8px;">';
            return '<div class="cc-field-gallery-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px;">' . $imgs . '</div>';
        case 'link':
            if (!is_array($v) || $v['url'] === '') return '';
            $text = $v['text'] !== '' ? $v['text'] : $v['url'];
            return '<a class="cc-field-link" href="' . htmlspecialchars(cc_block_url($v['url'])) . '">' . htmlspecialchars($text) . '</a>';
        case 'choice':
            $names = [];
            foreach ((array)$v as $x) {
                foreach ($d['options'] ?? [] as $o) { if ($o['value'] === $x) { $names[] = htmlspecialchars($o['label']); break; } }
            }
            return $names ? '<div class="cc-field-value">' . implode(', ', $names) . '</div>' : '';
        case 'reference':
            $it = is_string($v) && $v !== '' ? ($ctx['items'][$v] ?? null) : null;
            if (!$it) return '';
            $title = htmlspecialchars($it['title']);
            return $it['live']
                ? '<a class="cc-field-ref" href="{{BASE_URL}}' . htmlspecialchars($it['col_slug'] . '/' . $it['slug'] . '/') . '">' . $title . '</a>'
                : '<span class="cc-field-ref">' . $title . '</span>';
    }
    return '';
}
// The Item Field block: one field of the item being published, with its label when asked
function cc_render_item_field($block) {
    $ctx = cc_item_context();
    $c = $block['content'] ?? [];
    $fid = is_string($c['field'] ?? null) ? $c['field'] : '';
    if ($ctx === null || !isset($ctx['defs'][$fid])) return '';
    $d = $ctx['defs'][$fid];
    $inner = cc_field_html($d, $ctx['values'][$fid] ?? null, $c, $ctx);
    if ($inner === '') return '';
    $label = !empty($c['showLabel']) ? '<div class="cc-field-label">' . htmlspecialchars($d['label']) . '</div>' : '';
    $style = build_inline_style($block['styles'] ?? []);
    return '<div class="cc-field cc-field-' . $d['type'] . '" data-field="' . htmlspecialchars($d['key']) . '"' . ($style !== '' ? ' style="' . $style . '"' : '') . '>' . $label . $inner . "</div>\n";
}

function render_block($block) {
    if (!$block || !is_array($block)) return '';
    $html = cc_render_block_body($block);
    if (($block['type'] ?? '') === 'MASTER' || empty($block['responsive'])) return $html;
    $bid = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($block['id'] ?? ''));
    $id = !empty($block['content']['customId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$block['content']['customId']) : $bid;
    return cc_device_css($block, $id) . $html;
}

function cc_render_block_body($block) {
    // dynamic values: the item's fields and title, on an item page (removed elsewhere)
    if (isset($block['content']) && is_array($block['content'])) $block['content'] = cc_bind_deep($block['content'], cc_item_context());

    static $masters_cache = null;
    if ($masters_cache === null) {
        $masters_cache = [];
        // Same database as the API (data dir outside the web root when possible)
        $db_file = (function_exists('cc_data_dir') ? cc_data_dir() : __DIR__ . '/data') . '/canvascore.sqlite';
        if (file_exists($db_file)) {
            try {
                $temp_pdo = new PDO("sqlite:" . $db_file);
                $stmt = $temp_pdo->query("SELECT id, content_json FROM master_components");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $masters_cache[$row['id']] = json_decode($row['content_json'], true);
                }
            } catch (Exception $e) {}
        }
    }

    if ($block['type'] === 'MASTER') {
        static $master_stack = [];
        $masterId = $block['content']['masterId'] ?? null;
        if (!is_string($masterId) || !isset($masters_cache[$masterId])) return "<!-- Master not found -->\n";
        if (in_array($masterId, $master_stack, true)) return "<!-- Master skipped: it contains itself -->\n";
        $master_stack[] = $masterId;
        $inner = render_block($masters_cache[$masterId]);
        array_pop($master_stack);
        $mName = str_replace('--', '- -', htmlspecialchars((string)($block['content']['name'] ?? '')));
        return "<!-- Start Master: $mName -->\n" . $inner . "\n<!-- End Master -->\n";
    }

    $block['styles'] = cc_with_text_preset($block['styles'] ?? []);   // the block's text style, as variables
    $styleAttr = build_inline_style($block['styles'] ?? []);
    $styleString = $styleAttr ? " style=\"$styleAttr\"" : "";
    $animClass = cc_effect_classes($block['styles'] ?? [], $block['content'] ?? []);

    $blockId = isset($block['id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $block['id']) : uniqid('b_');
    $innerId = !empty($block['content']['customId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $block['content']['customId']) : $blockId;
    $innerClass = !empty($block['content']['customClass']) ? ' ' . htmlspecialchars($block['content']['customClass']) : '';

    $customCss = "";
    if (!empty($block['content']['customCss'])) {
        $cssCode = str_replace('__THIS__', '#' . $innerId, $block['content']['customCss']);
        $cssCode = preg_replace('#</\s*(style|script)#i', '', $cssCode); // prevent breaking out of the <style> tag
        $customCss = "<style>\n" . $cssCode . "\n</style>\n";
    }

    // A block with a shared definition (blocks/) is rendered from it, here and in the editor
    if ($def = cc_block_def($block['type'])) { $h = cc_render_def_block($def, $block, $innerId); return $h === null ? '' : $customCss . $h; }

    $childrenHtml = '';
    if (isset($block['children']) && is_array($block['children'])) {
        foreach ($block['children'] as $child) {
            $childrenHtml .= render_block($child);
        }
    }

    switch ($block['type']) {
        case 'ITEM_FIELD':
            // A field of the item being published (rebuild_all.php sets the item); nothing on any other page
            return $customCss . cc_render_item_field($block);
        case 'SECTION':
            $html = "<section id=\"$innerId\" class=\"cc-section$animClass$innerClass\"$styleString>\n$childrenHtml\n</section>\n";
            return $customCss . $html;

        case 'CONTAINER':
            $html = "<div id=\"$innerId\" class=\"cc-container$animClass$innerClass\"$styleString>\n$childrenHtml\n</div>\n";
            return $customCss . $html;

        case 'FLEX_ROW':
            $html = "<div id=\"$innerId\" class=\"cc-flex-row$animClass$innerClass\"$styleString>\n$childrenHtml\n</div>\n";
            return $customCss . $html;

        case 'CSS_GRID':
            $columns = cc_int($block['content']['columns'] ?? null, 2, 1, 12);
            $gap = htmlspecialchars((string)($block['content']['gap'] ?? '20px'));
            $html = "<style>@media(max-width: 768px){ #$innerId { grid-template-columns: 1fr !important; } }</style>";
            $html .= "<div id=\"$innerId\" class=\"cc-css-grid$animClass$innerClass\" style=\"$styleAttr; display:grid; grid-template-columns:repeat($columns, 1fr); gap:$gap; overflow:hidden;\">\n";
            $html .= $childrenHtml;
            $html .= "</div>\n";
            return $customCss . $html;
        case 'FORM':
            $raw_email = trim($block['content']['email'] ?? '');
            $btnText = htmlspecialchars((string)(($block['content']['btnText'] ?? '') !== '' ? $block['content']['btnText'] : 'Send Message'));
            $successMsg = htmlspecialchars((string)(($block['content']['successMsg'] ?? '') !== '' ? $block['content']['successMsg'] : 'Sent!'));
            $title = cc_sanitize_html($block['content']['title'] ?? '<h3>Contact Us</h3>');
            // Stable form ID + server-side recipient registration (no email addresses in the client)
            $form_id = !empty($block['content']['customId'])
                ? 'f_' . preg_replace('/[^a-zA-Z0-9_-]/', '', $block['content']['customId'])
                : 'f_' . substr(sha1(($block['id'] ?? '') . '|' . $raw_email), 0, 16);
            // The registry also holds the form's fields and message: submit_form.php accepts only those fields and
            // shows only this message (nothing a visitor sends decides either)
            $regLabels = [];
            foreach (($block['content']['fields'] ?? [['label' => 'Name'], ['label' => 'Email'], ['label' => 'Message']]) as $rf) $regLabels[] = mb_substr((string)($rf['label'] ?? ''), 0, 200);
            $reg =& cc_form_registry(); $reg[$form_id] = ['to' => $raw_email, 'labels' => $regLabels, 'success' => (string)(($block['content']['successMsg'] ?? '') !== '' ? $block['content']['successMsg'] : 'Sent!')];

            $html = "<div id=\"$innerId\" class=\"cc-form-block$animClass$innerClass\"$styleString>\n<div style=\"margin-bottom:20px;\">$title</div>\n<form id=\"$form_id\" action=\"{{BASE_URL}}canvascore-admin/submit_form.php\" method=\"POST\">\n<input type=\"hidden\" name=\"_form\" value=\"$form_id\">\n<input type=\"hidden\" name=\"_success\" value=\"$successMsg\">\n<input type=\"text\" name=\"_hp\" tabindex=\"-1\" autocomplete=\"off\" aria-hidden=\"true\" style=\"position:absolute; left:-9999px; width:0; height:0; opacity:0;\">\n";

            $fields = $block['content']['fields'] ?? [['label' => 'Name', 'type' => 'text', 'required' => true], ['label' => 'Email', 'type' => 'email', 'required' => true], ['label' => 'Message', 'type' => 'textarea', 'required' => true]];
            foreach($fields as $i => $f) {
                $fLabel = htmlspecialchars((string)($f['label'] ?? '')); $fType = in_array($f['type'] ?? '', CC_FORM_TYPES, true) ? $f['type'] : 'text'; $fReq = !empty($f['required']) ? 'required' : '';
                $name = "field_" . $i;
                $html .= "<input type=\"hidden\" name=\"_label_$name\" value=\"$fLabel\">\n";
                $html .= "<div style=\"margin-bottom:15px;\"><label style=\"display:block; margin-bottom:5px; font-weight:600;\">$fLabel</label>";
                if ($fType === 'textarea') {
                    $html .= "<textarea name=\"$name\" $fReq rows=\"4\" style=\"width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 6px); font-family:inherit; background:var(--cc-field-bg, #fff); box-sizing:border-box;\"></textarea>";
                } else {
                    $html .= "<input type=\"$fType\" name=\"$name\" $fReq style=\"width:100%; padding:12px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 6px); font-family:inherit; background:var(--cc-field-bg, #fff); box-sizing:border-box;\">";
                }
                $html .= "</div>\n";
            }
            $html .= "<button type=\"submit\" style=\"padding:12px 24px; background:var(--brand-color, #3b82f6); color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;\">$btnText</button>\n</form>\n</div>\n";
            return $customCss . $html;

        case 'COLLECTION_LIST': {
            $cid = $block['content']['collectionId'] ?? '';
            $cslugRaw = $block['content']['collectionSlug'] ?? '';
            $limit = max(1, intval($block['content']['limit'] ?? 6));
            $columns = max(1, intval($block['content']['columns'] ?? 3));
            $showCover = ($block['content']['showCover'] ?? true) !== false;
            $showExcerpt = ($block['content']['showExcerpt'] ?? true) !== false;
            $showDate = ($block['content']['showDate'] ?? true) !== false;
            $source = $block['content']['source'] ?? 'active';       // active|archived|all
            $layout = $block['content']['layout'] ?? 'grid';         // grid|list
            $showAll = !empty($block['content']['showAll']);

            $data = cc_collections_data();
            $coll = $data['by_id'][$cid] ?? ($data['by_slug'][$cslugRaw] ?? null);
            $cslug = $coll ? cc_safe_slug($coll['slug']) : cc_safe_slug($cslugRaw);
            $all = $coll ? $coll['items'] : [];
            // Filter by archive status
            $items = array_values(array_filter($all, function ($it) use ($source) {
                $arch = !empty($it['archived']);
                if ($source === 'archived') return $arch;
                if ($source === 'all') return true;
                return !$arch; // active
            }));
            // Sorted (before the limit), then the cards; a field chosen for the filter gives the buttons above the list
            $sortBy = is_string($block['content']['sortBy'] ?? null) ? $block['content']['sortBy'] : '';
            $defsById = $coll ? $coll['defsById'] : [];
            $items = cc_sort_items($items, $sortBy, ($block['content']['sortDir'] ?? 'asc') === 'desc', $defsById);
            if (!$showAll) $items = array_slice($items, 0, $limit);

            $isList = ($block['content']['layout'] ?? 'grid') === 'list';
            $filterId = is_string($block['content']['filterField'] ?? null) ? $block['content']['filterField'] : '';
            $filterDef = ($filterId !== '' && isset($defsById[$filterId])) ? $defsById[$filterId] : null;
            $cardOpts = cc_list_options($block['content'], $defsById, ['items' => $data['items']], $isList ? 'list' : 'grid', $filterDef ? $filterId : '');
            $cards = cc_list_cards($items, $cslug, $cardOpts);
            $filterUi = cc_list_filter_ui($innerId, $filterDef);
            if ($cards === '') $cards = '<div style="grid-column:1/-1; padding:30px; text-align:center; color:#94a3b8; border:1px dashed #cbd5e1; border-radius:12px;">No published items yet.</div>';

            $html = "<div id=\"$innerId\" class=\"cc-collection-list$animClass$innerClass\" style=\"$styleAttr\">\n";
            $html .= $filterUi;
            if ($layout === 'list') {
                $html .= "<div class=\"cc-cl-list\" style=\"display:flex; flex-direction:column; gap:0;\">$cards</div>\n";
            } else {
                $html  = "<style>@media(max-width:768px){ #$innerId .cc-cl-grid { grid-template-columns:1fr !important; } }</style>" . $html;
                $html .= "<div class=\"cc-cl-grid\" style=\"display:grid; grid-template-columns:repeat($columns, 1fr); gap:24px;\">$cards</div>\n";
            }
            $html .= "</div>\n";
            return $customCss . $html;
        }

        case 'RELATED':
            // the items that point to the item being published (rebuild_all.php); nothing on other pages
            return $customCss . cc_render_related($block);

        case 'ITEM_TERMS':
            // the categories and tags of the item being published; nothing on other pages
            return $customCss . cc_render_item_terms($block);

        case 'PRICE_CALCULATOR': {
            $c = $block['content'] ?? [];
            $objs = function ($v) { return array_values(array_filter(is_array($v) ? $v : [], 'is_array')); };
            $sliders = array_slice($objs($c['sliders'] ?? []), 0, 6);
            $addons = array_slice($objs($c['addons'] ?? []), 0, 8);
            $cur = mb_substr(trim(cc_str($c['currency'] ?? '')), 0, 6);
            $after = ($c['currencyPos'] ?? '') === 'after';
            $eu = ($c['numberFormat'] ?? '') === 'eu';
            $dec = cc_int($c['decimals'] ?? null, 0, 0, 2);
            $base = cc_num($c['basePrice'] ?? null, 0, 1e7, 0);
            $disc = cc_num($c['yearlyDiscount'] ?? null, 0, 90, 0);
            $toggle = ($c['billingToggle'] ?? false) === true;
            $yearly = $toggle && ($c['defaultBilling'] ?? '') === 'yearly';
            $f = $yearly ? 12 * (1 - $disc / 100) : 1;
            $word = function ($v, $d) { $t = trim(cc_str($v)); if ($t === '') $t = $d; return htmlspecialchars(mb_substr($t, 0, 30)); };
            $perM = ' / ' . $word($c['periodMonth'] ?? '', 'month');
            $perY = ' / ' . $word($c['periodYear'] ?? '', 'year');
            $st = trim(cc_str($c['saveText'] ?? '')); if ($st === '') $st = 'You save {amount} a year';
            $saveTpl = htmlspecialchars(mb_substr($st, 0, 80));
            $accent = cc_color($c['accent'] ?? '', 'var(--brand-color, #3b82f6)');
            $card = ($c['layout'] ?? '') !== 'plain';
            $title = cc_esc($c['title'] ?? '');
            $intro = cc_br(cc_str($c['intro'] ?? ''));
            $curHtml = htmlspecialchars($cur);   // the symbol goes into the page as text: escaped
            $money = function ($v) use ($dec, $eu, $curHtml, $after) { return cc_money($v, $dec, $eu, $curHtml, $after); };
            $total = $base; $controls = ''; $lines = '';
            $lineStyle = 'display:flex; justify-content:space-between; gap:12px; font-size:14px; color:#475569; padding:4px 0;';
            if ($base > 0) $lines .= '<li class="cc-calc-line" data-line="base" style="' . $lineStyle . '"><span class="cc-calc-line-label">' . $word($c['baseLabel'] ?? '', 'Base price') . '</span><span class="cc-calc-line-amt">' . $money($base * $f) . '</span></li>';
            foreach ($sliders as $i => $sl) {
                $min = cc_num($sl['min'] ?? null, -1e9, 1e9, 0);
                $max = cc_num($sl['max'] ?? null, -1e9, 1e9, 100);
                if ($max <= $min) $max = $min + 1;
                $step = cc_num($sl['step'] ?? null, 0.01, 1e6, 1);
                $val = min($max, max($min, cc_num($sl['value'] ?? null, -1e9, 1e9, $min)));
                $price = cc_num($sl['price'] ?? null, 0, 1e7, 0);
                $incl = cc_num($sl['included'] ?? null, 0, 1e9, 0);
                $unit = htmlspecialchars(mb_substr(trim(cc_str($sl['unit'] ?? '')), 0, 30));
                $label = cc_esc($sl['label'] ?? '');
                $cost = max(0, $val - $incl) * $price;
                $total += $cost;
                $sid = $innerId . '-s' . $i;
                $controls .= '<div class="cc-calc-row" style="margin-bottom:22px;"><div class="cc-calc-head" style="display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-weight:600; font-size:15px; color:#0f172a;"><label for="' . $sid . '">' . $label . '</label><output class="cc-calc-val" for="' . $sid . '" data-for="' . $sid . '">' . cc_plain($val) . ($unit !== '' ? ' ' . $unit : '') . '</output></div>'
                    . '<input type="range" class="cc-calc-range" id="' . $sid . '" min="' . cc_plain($min) . '" max="' . cc_plain($max) . '" step="' . cc_plain($step) . '" value="' . cc_plain($val) . '" data-price="' . cc_plain($price) . '" data-incl="' . cc_plain($incl) . '" data-unit="' . $unit . '" data-line="s' . $i . '" style="width:100%; accent-color:' . $accent . ';"></div>';
                $lines .= '<li class="cc-calc-line"' . ($cost != 0 ? '' : ' hidden') . ' data-line="s' . $i . '" style="' . $lineStyle . '"><span class="cc-calc-line-label">' . $label . '</span><span class="cc-calc-line-amt">' . $money($cost * $f) . '</span></li>';
            }
            foreach ($addons as $i => $ad) {
                $price = cc_num($ad['price'] ?? null, 0, 1e7, 0);
                $on = ($ad['checked'] ?? false) === true;
                $label = cc_esc($ad['label'] ?? '');
                if ($on) $total += $price;
                $controls .= '<label class="cc-calc-addon-row" style="display:flex; align-items:center; gap:10px; margin-bottom:12px; font-size:15px; color:#0f172a; cursor:pointer;"><input type="checkbox" class="cc-calc-addon" data-price="' . cc_plain($price) . '" data-line="a' . $i . '"' . ($on ? ' checked' : '') . ' style="width:18px; height:18px; accent-color:' . $accent . ';"><span class="cc-calc-addon-label" style="flex:1;">' . $label . '</span><span class="cc-calc-addon-price" style="color:#64748b; font-size:14px;">+ ' . $money($price) . $perM . '</span></label>';
                $lines .= '<li class="cc-calc-line"' . ($on ? '' : ' hidden') . ' data-line="a' . $i . '" style="' . $lineStyle . '"><span class="cc-calc-line-label">' . $label . '</span><span class="cc-calc-line-amt">' . $money($price * $f) . '</span></li>';
            }
            $saved = $total * 12 - $total * $f;
            $saveShown = $yearly && $saved > 0;
            $btnText = cc_esc($c['buttonText'] ?? '');
            $note = cc_br(cc_str($c['note'] ?? ''));
            $id = '#' . $innerId;
            $billing = $toggle
                ? '<div class="cc-calc-billing" role="radiogroup" aria-label="Billing period" style="display:inline-flex; padding:4px; background:#f1f5f9; border-radius:999px; margin-bottom:24px;">'
                    . '<label class="cc-calc-pill"><input type="radio" name="' . $innerId . '-billing" value="monthly"' . ($yearly ? '' : ' checked') . '><span>' . $word($c['monthlyLabel'] ?? '', 'Monthly') . '</span></label>'
                    . '<label class="cc-calc-pill"><input type="radio" name="' . $innerId . '-billing" value="yearly"' . ($yearly ? ' checked' : '') . '><span>' . $word($c['yearlyLabel'] ?? '', 'Yearly') . ($disc > 0 ? '<em class="cc-calc-badge"> -' . cc_plain($disc) . '%</em>' : '') . '</span></label></div>'
                : '';
            return $customCss . '<style>' . $id . '[hidden],' . $id . ' [hidden]{display:none !important}' . $id . ' .cc-calc-pill input{position:absolute;opacity:0;pointer-events:none}' . $id . ' .cc-calc-pill span{display:inline-block;padding:8px 18px;border-radius:999px;font-weight:600;font-size:14px;color:#475569;cursor:pointer}' . $id . ' .cc-calc-pill input:checked+span{background:#fff;color:#0f172a;box-shadow:0 1px 4px rgba(15,23,42,0.15)}' . $id . ' .cc-calc-pill input:focus-visible+span{outline:2px solid ' . $accent . ';outline-offset:2px}' . $id . ' .cc-calc-badge{font-style:normal;color:' . $accent . ';font-weight:700}' . $id . ' .cc-calc-btn:hover{filter:brightness(.92)}' . $id . ' input[type=range]:focus-visible,' . $id . ' .cc-calc-addon:focus-visible{outline:2px solid ' . $accent . ';outline-offset:2px}</style>'
                . '<div id="' . $innerId . '" class="cc-calc' . $animClass . $innerClass . '" data-base="' . cc_plain($base) . '" data-disc="' . cc_plain($disc) . '" data-dec="' . $dec . '" data-fmt="' . ($eu ? 'eu' : 'en') . '" data-cur="' . htmlspecialchars($cur) . '" data-pos="' . ($after ? 'after' : 'before') . '" data-per-m="' . $perM . '" data-per-y="' . $perY . '" data-save="' . $saveTpl . '" style="' . $styleAttr . '">' . "\n"
                . '<div class="cc-calc-card" style="' . ($card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;') . '">'
                . ($title !== '' ? '<div class="cc-calc-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">' . $title . '</div>' : '')
                . ($intro !== '' ? '<p class="cc-calc-intro" style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">' . $intro . '</p>' : '')
                . $billing
                . '<div class="cc-calc-controls">' . $controls . '</div>'
                . '<div class="cc-calc-summary" style="border-top:1px solid #e2e8f0; padding-top:18px; margin-top:8px;">'
                . ($lines !== '' ? '<ul class="cc-calc-lines" style="list-style:none; margin:0 0 12px 0; padding:0;">' . $lines . '</ul>' : '')
                . '<div class="cc-calc-total-row" role="status" aria-live="polite" aria-atomic="true" style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;"><span class="cc-calc-total-label" style="font-weight:700; font-size:15px; color:#0f172a;">' . $word($c['totalLabel'] ?? '', 'Estimated total') . '</span><span><strong class="cc-calc-amount" style="font-size:40px; font-weight:800; line-height:1.1; color:#0f172a;">' . $money($total * $f) . '</strong><span class="cc-calc-per" style="font-size:15px; color:#64748b;">' . ($yearly ? $perY : $perM) . '</span></span></div>'
                . '<div class="cc-calc-save"' . ($saveShown ? '' : ' hidden') . ' style="margin-top:6px; text-align:right; font-size:14px; font-weight:600; color:' . $accent . ';">' . ($saveShown ? str_replace('{amount}', $money($saved), $saveTpl) : '') . '</div>'
                . ($btnText !== '' ? '<a class="cc-calc-btn" href="' . htmlspecialchars(cc_block_url(cc_str($c['buttonUrl'] ?? ''))) . '" style="display:block; margin-top:20px; padding:14px 24px; text-align:center; border-radius:10px; background:' . $accent . '; color:#ffffff; font-weight:700; text-decoration:none;">' . $btnText . '</a>' : '')
                . ($note !== '' ? '<p class="cc-calc-note" style="margin:12px 0 0 0; font-size:13px; line-height:1.5; color:#64748b;">' . $note . '</p>' : '')
                . '</div></div>' . "\n</div>\n"
                . '<script>' . str_replace('%ID%', $innerId, CC_CALC_SCRIPT) . "</script>\n";
        }

        case 'WIZARD': {
            $c = $block['content'] ?? [];
            $objs = function ($v) { return array_values(array_filter(is_array($v) ? $v : [], 'is_array')); };
            $steps = array_slice($objs($c['steps'] ?? []), 0, 8);
            $n = count($steps);
            $accent = cc_color($c['accent'] ?? '', 'var(--brand-color, #3b82f6)');
            $dots = ($c['progress'] ?? '') === 'steps';
            $card = ($c['layout'] ?? '') !== 'plain';
            $text = function ($v, $d, $max) { $t = trim(cc_str($v)); if ($t === '') $t = $d; return htmlspecialchars(mb_substr($t, 0, $max)); };
            $title = cc_esc($c['title'] ?? '');
            $intro = cc_br(cc_str($c['intro'] ?? ''));
            $stepLabel = $text($c['stepLabel'] ?? '', 'Step {n} of {total}', 60);
            $successMsg = trim(cc_str($c['successMsg'] ?? '')); if ($successMsg === '') $successMsg = 'Thank you! We will be in touch.';
            $raw_email = trim(cc_str($c['email'] ?? ''));
            // Same registry as the Form block: submit_form.php accepts only these fields (in this order) and shows only this message
            $form_id = !empty($c['customId'])
                ? 'f_' . preg_replace('/[^a-zA-Z0-9_-]/', '', cc_str($c['customId']))
                : 'f_' . substr(sha1('w|' . ($block['id'] ?? '') . '|' . $raw_email), 0, 16);
            $fi = 0; $stepsHtml = ''; $dotsHtml = ''; $regLabels = [];
            foreach ($steps as $si => $st) {
                $fields = array_slice($objs($st['fields'] ?? []), 0, 12);
                $stTitle = cc_esc($st['title'] ?? '');
                $desc = cc_br(cc_str($st['description'] ?? ''));
                $inner = '';
                foreach ($fields as $f) {
                    if ($fi >= 40) break;
                    $name = 'field_' . $fi; $fid = $innerId . '-f' . $fi;
                    $labelRaw = cc_str($f['label'] ?? '');
                    $label = htmlspecialchars($labelRaw);
                    $type = in_array($f['type'] ?? '', CC_WIZARD_TYPES, true) ? $f['type'] : 'text';
                    $req = ($f['required'] ?? false) === true ? ' required' : '';
                    $opts = array_map(function ($o) { return mb_substr($o, 0, 100); }, array_slice(cc_lines(cc_str($f['options'] ?? '')), 0, 20));
                    $regLabels[] = mb_substr($labelRaw, 0, 200);
                    $fi++;
                    $inner .= '<input type="hidden" name="_label_' . $name . '" value="' . $label . '">' . "\n";
                    if ($type === 'radio' || $type === 'checkboxes') {
                        $radio = $type === 'radio';
                        $inner .= '<fieldset class="cc-wz-field cc-wz-group" data-req="' . (!$radio && $req !== '' ? '1' : '0') . '" style="border:0; margin:0 0 16px 0; padding:0; min-width:0;"><legend class="cc-wz-label" style="padding:0;">' . $label . '</legend>';
                        foreach ($opts as $o) $inner .= '<label class="cc-wz-opt" style="display:flex; align-items:center; gap:8px; margin:6px 0; font-size:15px; color:#0f172a;"><input type="' . ($radio ? 'radio' : 'checkbox') . '" name="' . $name . ($radio ? '' : '[]') . '" value="' . htmlspecialchars($o) . '"' . ($radio ? $req : '') . ' style="width:18px; height:18px; accent-color:' . $accent . ';"><span>' . htmlspecialchars($o) . '</span></label>';
                        $inner .= '</fieldset>' . "\n";
                    } elseif ($type === 'consent') {
                        $inner .= '<div class="cc-wz-field"><label class="cc-wz-opt" style="display:flex; align-items:flex-start; gap:8px; font-size:14px; color:#475569;"><input type="checkbox" id="' . $fid . '" name="' . $name . '" value="Yes"' . $req . ' style="width:18px; height:18px; margin-top:2px; accent-color:' . $accent . ';"><span>' . $label . '</span></label></div>' . "\n";
                    } elseif ($type === 'select') {
                        $inner .= '<div class="cc-wz-field"><label class="cc-wz-label" for="' . $fid . '">' . $label . '</label><select id="' . $fid . '" name="' . $name . '"' . $req . ' style="' . CC_WZ_INPUT . '"><option value="">' . $text($f['placeholder'] ?? '', 'Choose an option', 60) . '</option>';
                        foreach ($opts as $o) $inner .= '<option value="' . htmlspecialchars($o) . '">' . htmlspecialchars($o) . '</option>';
                        $inner .= '</select></div>' . "\n";
                    } elseif ($type === 'textarea') {
                        $inner .= '<div class="cc-wz-field"><label class="cc-wz-label" for="' . $fid . '">' . $label . '</label><textarea id="' . $fid . '" name="' . $name . '"' . $req . ' rows="4" style="' . CC_WZ_INPUT . '"></textarea></div>' . "\n";
                    } else {
                        $inner .= '<div class="cc-wz-field"><label class="cc-wz-label" for="' . $fid . '">' . $label . '</label><input type="' . $type . '" id="' . $fid . '" name="' . $name . '"' . $req . ' style="' . CC_WZ_INPUT . '"></div>' . "\n";
                    }
                }
                $stepsHtml .= '<fieldset class="cc-wz-step" data-i="' . $si . '" tabindex="-1" style="border:0; margin:0; padding:0; min-width:0;"><legend class="cc-wz-step-title" style="padding:0; font-size:20px; font-weight:700; color:#0f172a; margin-bottom:4px;">' . ($stTitle !== '' ? $stTitle : 'Step ' . ($si + 1)) . '</legend>'
                    . ($desc !== '' ? '<p class="cc-wz-step-desc" style="margin:0 0 16px 0; font-size:14px; color:#64748b;">' . $desc . '</p>' : '')
                    . $inner . '</fieldset>' . "\n";
                $dotsHtml .= '<li class="cc-wz-dot' . ($si === 0 ? ' is-current' : '') . '"' . ($si === 0 ? ' aria-current="step"' : '') . '><span class="cc-wz-dot-n">' . ($si + 1) . '</span><span class="cc-wz-dot-t">' . ($stTitle !== '' ? $stTitle : 'Step ' . ($si + 1)) . '</span></li>';
            }
            $reg =& cc_form_registry(); $reg[$form_id] = ['to' => $raw_email, 'labels' => $regLabels, 'success' => $successMsg];
            $pct = $n > 0 ? number_format(100 / $n, 1, '.', '') : '100.0';
            $progress = '<div class="cc-wz-progress" hidden style="margin-bottom:24px;">'
                . ($dots ? '<ol class="cc-wz-dots" style="list-style:none; display:flex; gap:8px; margin:0 0 10px 0; padding:0;">' . $dotsHtml . '</ol>' : '<div class="cc-wz-track" style="height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;"><div class="cc-wz-fill" style="height:100%; width:' . $pct . '%; background:' . $accent . '; border-radius:999px;"></div></div>')
                . '<div class="cc-wz-count" aria-live="polite" style="margin-top:8px; font-size:13px; color:#64748b;">' . str_replace(['{n}', '{total}'], ['1', (string)$n], $stepLabel) . '</div></div>';
            $id = '#' . $innerId;
            return $customCss . '<style>' . $id . ' .cc-wz-label{display:block;margin-bottom:6px;font-weight:600;font-size:14px;color:#0f172a}' . $id . ' .cc-wz-field{margin-bottom:16px}' . $id . ' input:focus-visible,' . $id . ' select:focus,' . $id . ' textarea:focus{outline:2px solid ' . $accent . ';outline-offset:1px}'
                . $id . ' .cc-wz-dot{display:flex;align-items:center;gap:8px;flex:1;font-size:13px;color:#94a3b8}' . $id . ' .cc-wz-dot-n{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#475569;font-weight:700;flex-shrink:0}'
                . $id . ' .cc-wz-dot.is-current .cc-wz-dot-n,' . $id . ' .cc-wz-dot.is-done .cc-wz-dot-n{background:' . $accent . ';color:#fff}' . $id . ' .cc-wz-dot.is-current{color:#0f172a;font-weight:600}' . $id . ' .cc-wz-fill{transition:width .3s ease}' . $id . ' .cc-wz-step:focus{outline:none}' . $id . ' button:hover{filter:brightness(.94)}'
                . '@media(max-width:600px){' . $id . ' .cc-wz-dot-t{display:none}' . $id . ' .cc-wz-card{padding:20px !important}}@media(prefers-reduced-motion:reduce){' . $id . ' .cc-wz-fill{transition:none}}</style>'
                . '<div id="' . $innerId . '" class="cc-wizard' . $animClass . $innerClass . '" data-step-label="' . $stepLabel . '" style="' . $styleAttr . '">' . "\n"
                . '<div class="cc-wz-card" style="' . ($card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;') . '">'
                . ($title !== '' ? '<div class="cc-wz-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">' . $title . '</div>' : '')
                . ($intro !== '' ? '<p class="cc-wz-intro" style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">' . $intro . '</p>' : '')
                . $progress
                . '<form id="' . $form_id . '" class="cc-wz-form" action="{{BASE_URL}}canvascore-admin/submit_form.php" method="POST">' . "\n" . '<input type="hidden" name="_form" value="' . $form_id . '">' . "\n" . '<input type="hidden" name="_success" value="' . htmlspecialchars($successMsg) . '">' . "\n" . '<input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute; left:-9999px; width:0; height:0; opacity:0;">' . "\n"
                . $stepsHtml
                . '<div class="cc-wz-nav" style="display:flex; align-items:center; gap:10px; margin-top:24px;"><button type="button" class="cc-wz-back" hidden style="' . CC_WZ_BTN . ' background:#ffffff; color:#0f172a; border:1px solid #cbd5e1;">' . $text($c['backText'] ?? '', 'Back', 30) . '</button><span style="flex:1;"></span>'
                . '<button type="button" class="cc-wz-next" hidden style="' . CC_WZ_BTN . ' background:' . $accent . '; color:#ffffff; border:none;">' . $text($c['nextText'] ?? '', 'Next', 30) . '</button>'
                . '<button type="submit" class="cc-wz-submit" style="' . CC_WZ_BTN . ' background:' . $accent . '; color:#ffffff; border:none;">' . $text($c['btnText'] ?? '', 'Send', 30) . '</button></div>' . "\n</form>\n</div>\n</div>\n"
                . '<script>' . str_replace('%ID%', $innerId, CC_WIZARD_SCRIPT) . "</script>\n";
        }

        case 'ANNOUNCEMENT_BAR':
            return $customCss . cc_announcement_html($block['content'] ?? [], $innerId, $animClass . $innerClass, $styleAttr, false);

        case 'NEWSLETTER': {
            $c = $block['content'] ?? [];
            $accent = cc_color($c['accent'] ?? '', 'var(--brand-color, #3b82f6)');
            $card = ($c['layout'] ?? '') !== 'plain';
            $inline = ($c['formLayout'] ?? '') !== 'stacked';
            $raw = function ($v, $d, $max) { $t = trim(cc_str($v)); if ($t === '') $t = $d; return mb_substr($t, 0, $max); };
            $text = function ($v, $d, $max) use ($raw) { return htmlspecialchars($raw($v, $d, $max)); };
            $title = cc_esc($c['title'] ?? '');
            $intro = cc_br(cc_str($c['text'] ?? ''));
            $emailLabel = $raw($c['emailLabel'] ?? '', 'Email', 100);
            $nameLabel = $raw($c['nameLabel'] ?? '', 'Name', 100);
            $consent = $raw($c['consentText'] ?? '', '', 300);
            $askName = ($c['askName'] ?? false) === true;
            $successMsg = trim(cc_str($c['successMsg'] ?? '')); if ($successMsg === '') $successMsg = 'Thank you for subscribing!';
            $raw_email = trim(cc_str($c['email'] ?? ''));
            // The same registry as the Form block: the recipient, the field labels (in order) and the message
            $form_id = !empty($c['customId'])
                ? 'f_' . preg_replace('/[^a-zA-Z0-9_-]/', '', cc_str($c['customId']))
                : 'f_' . substr(sha1('n|' . ($block['id'] ?? '') . '|' . $raw_email), 0, 16);
            $input = 'padding:12px 14px; border:1px solid var(--cc-field-border, #cbd5e1); border-radius:var(--cc-field-radius, 8px); font:inherit; background:var(--cc-field-bg, #fff); color:#0f172a; box-sizing:border-box; min-width:0; ' . ($inline ? 'flex:1 1 200px;' : 'width:100%;');
            $fi = 0; $fields = ''; $labels = [];
            if ($askName) { $fields .= '<input type="hidden" name="_label_field_' . $fi . '" value="' . htmlspecialchars($nameLabel) . '"><input type="text" name="field_' . $fi . '" required autocomplete="name" aria-label="' . htmlspecialchars($nameLabel) . '" placeholder="' . $text($c['namePlaceholder'] ?? '', $nameLabel, 100) . '" style="' . $input . '">'; $labels[] = $nameLabel; $fi++; }
            $fields .= '<input type="hidden" name="_label_field_' . $fi . '" value="' . htmlspecialchars($emailLabel) . '"><input type="email" name="field_' . $fi . '" required autocomplete="email" aria-label="' . htmlspecialchars($emailLabel) . '" placeholder="' . $text($c['placeholder'] ?? '', $emailLabel, 100) . '" style="' . $input . '">'; $labels[] = $emailLabel; $fi++;
            $button = '<button type="submit" class="cc-nl-submit" style="padding:12px 24px; border:none; border-radius:8px; background:' . $accent . '; color:#ffffff; font:700 15px/1 inherit; cursor:pointer; ' . ($inline ? '' : 'width:100%;') . '">' . $text($c['buttonText'] ?? '', 'Subscribe', 40) . '</button>';
            $consentHtml = '';
            if ($consent !== '') { $consentHtml = '<input type="hidden" name="_label_field_' . $fi . '" value="' . htmlspecialchars($consent) . '"><label class="cc-nl-consent" style="display:flex; align-items:flex-start; gap:8px; flex:1 1 100%; font-size:13px; line-height:1.5; color:#64748b;"><input type="checkbox" name="field_' . $fi . '" value="Yes" required style="width:18px; height:18px; margin-top:1px; accent-color:' . $accent . ';"><span>' . htmlspecialchars($consent) . '</span></label>'; $labels[] = $consent; }
            $reg =& cc_form_registry(); $reg[$form_id] = ['to' => $raw_email, 'labels' => $labels, 'success' => $successMsg];
            return $customCss . '<style>#' . $innerId . ' input:focus-visible,#' . $innerId . ' button:focus-visible{outline:2px solid ' . $accent . ';outline-offset:2px}#' . $innerId . ' .cc-nl-submit:hover{filter:brightness(.93)}@media(max-width:600px){#' . $innerId . ' .cc-nl-card{padding:20px !important}}</style>'
                . '<div id="' . $innerId . '" class="cc-newsletter' . $animClass . $innerClass . '" style="' . $styleAttr . '">' . "\n"
                . '<div class="cc-nl-card" style="' . ($card ? 'background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; box-shadow:0 4px 18px rgba(15,23,42,0.06);' : 'padding:0;') . '">'
                . ($title !== '' ? '<div class="cc-nl-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:6px;">' . $title . '</div>' : '')
                . ($intro !== '' ? '<p class="cc-nl-text" style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:#475569;">' . $intro . '</p>' : '')
                . '<form id="' . $form_id . '" class="cc-nl-form" action="{{BASE_URL}}canvascore-admin/submit_form.php" method="POST" style="display:flex; flex-wrap:wrap; gap:10px; ' . ($inline ? 'align-items:stretch;' : 'flex-direction:column; align-items:stretch;') . '">' . "\n"
                . '<input type="hidden" name="_form" value="' . $form_id . '"><input type="hidden" name="_success" value="' . htmlspecialchars($successMsg) . '"><input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute; left:-9999px; width:0; height:0; opacity:0;">' . "\n"
                . ($inline ? $fields . $button . $consentHtml : $fields . $consentHtml . $button)
                . "\n</form>\n</div>\n</div>\n";
        }

        default: return "<!-- Unknown element: " . preg_replace('/[^A-Za-z0-9_]/', '', (string)$block['type']) . " -->\n";
    }
}

// ---------------------------------------------------------------------------
// Cookie / privacy banner (Global Options › Cookie banner), added to every published page.
// The visitor's choice is remembered in localStorage ("cc_consent": granted | denied).
// Until they accept, scripts written as <script type="text/plain" data-cc-consent> and embeds
// written as <iframe data-cc-consent-src="…"> stay off; Accept turns them on. Any element with
// data-cc-consent-open (e.g. a "Cookie settings" link in the footer) shows the banner again.
// ---------------------------------------------------------------------------
function cc_cookie_banner_html($cfg) {
    if (!is_array($cfg) || empty($cfg['enabled'])) return '';
    $t = function ($k, $def) use ($cfg) { $v = trim((string)($cfg[$k] ?? '')); return htmlspecialchars($v !== '' ? $v : $def); };
    $text = $t('text', 'We use cookies to improve your experience and to understand how the site is used.');
    $accept = $t('acceptLabel', 'Accept');
    $decline = $t('declineLabel', 'Decline');
    $plabel = $t('privacyLabel', 'Privacy policy');
    $purl = trim((string)($cfg['privacyUrl'] ?? ''));
    $link = '';
    if ($purl !== '') {
        if (!preg_match('~^(https?://|/|#)~i', $purl)) $purl = '{{BASE_URL}}' . ltrim(str_replace(['index.html'], '', $purl), '/');
        $link = ' <a href="' . htmlspecialchars($purl) . '">' . $plabel . '</a>';
    }
    $pos = in_array($cfg['position'] ?? '', ['bottom-left', 'bottom-right'], true) ? $cfg['position'] : 'bottom';
    $place = $pos === 'bottom' ? 'left:16px; right:16px; bottom:16px; margin:0 auto; max-width:760px;' : ($pos === 'bottom-left' ? 'left:16px; bottom:16px; max-width:380px;' : 'right:16px; bottom:16px; max-width:380px;');
    return "\n<div id=\"cc-consent\" role=\"dialog\" aria-live=\"polite\" aria-label=\"Cookie consent\" hidden style=\"position:fixed; $place z-index:2147483000; background:#0f172a; color:#f1f5f9; border-radius:12px; padding:16px 18px; box-shadow:0 12px 32px rgba(0,0,0,.35); font:14px/1.5 var(--font-family, system-ui, sans-serif); display:flex; flex-wrap:wrap; gap:12px; align-items:center;\">"
        . "<p style=\"margin:0; flex:1 1 260px;\">$text$link</p>"
        . "<span style=\"display:flex; gap:8px; flex-wrap:wrap;\">"
        . "<button type=\"button\" data-cc-consent-choice=\"denied\" style=\"padding:9px 14px; border-radius:8px; border:1px solid #475569; background:transparent; color:#f1f5f9; font:inherit; cursor:pointer;\">$decline</button>"
        . "<button type=\"button\" data-cc-consent-choice=\"granted\" style=\"padding:9px 14px; border-radius:8px; border:none; background:var(--brand-color, #3b82f6); color:#fff; font:inherit; font-weight:600; cursor:pointer;\">$accept</button>"
        . "</span></div>\n"
        . "<style>#cc-consent a{color:inherit; text-decoration:underline} #cc-consent[hidden]{display:none !important}</style>\n"
        . "<script>(function(){var K='cc_consent',b=document.getElementById('cc-consent');if(!b)return;"
        . "function get(){try{return localStorage.getItem(K)}catch(e){return null}}"
        . "function on(){document.querySelectorAll('script[type=\"text/plain\"][data-cc-consent]').forEach(function(o){var s=document.createElement('script');for(var i=0;i<o.attributes.length;i++){var a=o.attributes[i];if(a.name!=='type'&&a.name!=='data-cc-consent')s.setAttribute(a.name,a.value);}s.text=o.text;o.parentNode.replaceChild(s,o);});"
        . "document.querySelectorAll('iframe[data-cc-consent-src]').forEach(function(f){f.src=f.getAttribute('data-cc-consent-src');f.removeAttribute('data-cc-consent-src');});}"
        . "function set(v){try{localStorage.setItem(K,v)}catch(e){}window.ccConsent=v;b.hidden=true;if(v==='granted')on();document.dispatchEvent(new CustomEvent('cc-consent',{detail:v}));}"
        . "b.addEventListener('click',function(e){var c=e.target.closest('[data-cc-consent-choice]');if(c)set(c.getAttribute('data-cc-consent-choice'));});"
        . "document.addEventListener('click',function(e){if(e.target.closest('[data-cc-consent-open]')){e.preventDefault();b.hidden=false;}});"
        . "var v=get();window.ccConsent=v;if(v==='granted')on();else if(!v)b.hidden=false;})();</script>\n";
}
?>
