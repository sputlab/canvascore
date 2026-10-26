<?php
// canvascore-admin/languages.php
// Multilingual sites. The languages of the site live in settings.json (key "languages"); a page or a collection item carries the
// language it is written in (`lang`) and the id it shares with its translations (`trans_group`). The default language is published
// at the site root (/about/), every other language under its own folder (/it/chi-siamo/). A page or item with no language ('') is
// in the default language. Each translation is a page or an item of its own: its own address, title, search texts and blocks.
//
//   settings.json "languages": { enabled, default, list: [{ code, name }], strings: { <code>: { announcement: {...}, cookie: {...} } } }
//
// Used by publish.php (language folders, <html lang>, hreflang, sitemap, menus, header and footer, search index), compiler.php (the
// Language Switcher block, item links, lists) and api.php (translations). Library file: no output of its own.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';

const CC_LANG_MAX = 12;   // languages on one site, the default included

// A language code as the site writes it: "it", "pt-br" (lowercase letters and digits). '' when it is not one.
function cc_lang_code($raw) {
    $c = strtolower(trim(is_scalar($raw) ? (string)$raw : ''));
    return preg_match('/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/', $c) ? $c : '';
}
// The code the way browsers and search engines write it ("pt-BR": language, then a two letter region in capitals)
function cc_lang_tag($code) {
    $c = cc_lang_code($code);
    if ($c === '') return '';
    $p = explode('-', $c, 2);
    if (isset($p[1])) $p[1] = strlen($p[1]) === 2 ? strtoupper($p[1]) : $p[1];
    return implode('-', $p);
}

// The settings as stored, cleaned: at most CC_LANG_MAX languages with unique codes, the default among them (the first when it is
// not), only known texts. A site with fewer than two languages is not multilingual (cc_lang_active).
function cc_lang_config_clean($raw) {
    $raw = is_array($raw) ? $raw : [];
    $list = []; $seen = [];
    foreach ((is_array($raw['list'] ?? null) ? $raw['list'] : []) as $l) {
        if (!is_array($l)) continue;
        $code = cc_lang_code($l['code'] ?? '');
        if ($code === '' || isset($seen[$code]) || count($list) >= CC_LANG_MAX) continue;
        $name = trim(preg_replace('/\s+/u', ' ', is_scalar($l['name'] ?? null) ? (string)$l['name'] : ''));
        $name = mb_substr($name, 0, 40);
        $list[] = ['code' => $code, 'name' => $name !== '' ? $name : strtoupper($code)];
        $seen[$code] = true;
    }
    $default = cc_lang_code($raw['default'] ?? '');
    if ($list && !isset($seen[$default])) $default = $list[0]['code'];
    $strings = [];
    $txt = function ($v, $max) { return mb_substr(trim(is_scalar($v) ? (string)$v : ''), 0, $max); };
    foreach ((is_array($raw['strings'] ?? null) ? $raw['strings'] : []) as $code => $s) {
        $code = cc_lang_code($code);
        if ($code === '' || $code === $default || !isset($seen[$code]) || !is_array($s)) continue;
        $a = is_array($s['announcement'] ?? null) ? $s['announcement'] : [];
        $c = is_array($s['cookie'] ?? null) ? $s['cookie'] : [];
        $out = [
            'announcement' => array_filter(['text' => $txt($a['text'] ?? '', 300), 'linkText' => $txt($a['linkText'] ?? '', 60), 'linkUrl' => $txt($a['linkUrl'] ?? '', 500)], function ($v) { return $v !== ''; }),
            'cookie' => array_filter(['text' => $txt($c['text'] ?? '', 500), 'acceptLabel' => $txt($c['acceptLabel'] ?? '', 40), 'declineLabel' => $txt($c['declineLabel'] ?? '', 40),
                'privacyLabel' => $txt($c['privacyLabel'] ?? '', 60), 'privacyUrl' => $txt($c['privacyUrl'] ?? '', 500)], function ($v) { return $v !== ''; }),
        ];
        if ($out['announcement'] || $out['cookie']) $strings[$code] = $out;
    }
    return ['enabled' => !empty($raw['enabled']), 'default' => $list ? $default : '', 'list' => $list, 'strings' => $strings];
}
// The languages of this site (from settings.json, or the given settings), cleaned
function cc_lang_config($settings = null) {
    if ($settings === null) {
        $f = cc_data_dir() . '/settings.json';
        $settings = is_file($f) ? json_decode((string)@file_get_contents($f), true) : [];
    }
    return cc_lang_config_clean(is_array($settings) ? ($settings['languages'] ?? null) : null);
}
// The same, remembered until settings.json changes (it is small: the check is a hash, and the languages are asked for by every item link)
function cc_lang_cfg() {
    static $key = null, $cfg = null;
    $f = cc_data_dir() . '/settings.json';
    $k = $f . '|' . (is_file($f) ? md5((string)@file_get_contents($f)) : '-');
    if ($key !== $k) { $key = $k; $cfg = cc_lang_config(); }
    return $cfg;
}
// Is the site multilingual? (switched on, with at least two languages)
function cc_lang_active($cfg) { return !empty($cfg['enabled']) && count($cfg['list'] ?? []) >= 2; }
function cc_lang_codes($cfg) { return array_map(function ($l) { return $l['code']; }, $cfg['list'] ?? []); }
// The language of a page or an item for the site: '' for the default language (and for any code the site does not have), else its code.
// A site that is not multilingual has one language: everything is ''.
function cc_lang_norm($lang, $cfg) {
    if (!cc_lang_active($cfg)) return '';
    $c = cc_lang_code($lang);
    return ($c !== '' && $c !== $cfg['default'] && in_array($c, cc_lang_codes($cfg), true)) ? $c : '';
}
// Does the site publish content written in this language? (no language: always; a code: it is one of the site's languages, or the default)
function cc_lang_known($lang, $cfg) {
    $c = cc_lang_code($lang);
    if ($c === '') return true;
    return cc_lang_active($cfg) ? in_array($c, cc_lang_codes($cfg), true) : $c === ($cfg['default'] ?? '');
}
// The home page of the language being published: '{{BASE_URL}}' (default language) or '{{BASE_URL}}it/'
function cc_lang_home() {
    $ctx = cc_lang_context();
    return '{{BASE_URL}}' . ($ctx ? cc_lang_prefix($ctx['lang'], $ctx['cfg']) : '');
}
// The folder of a language in the site ("it/"), '' for the default language
function cc_lang_prefix($lang, $cfg) {
    $l = cc_lang_norm($lang, $cfg);
    return $l === '' ? '' : $l . '/';
}
// Does this top-level address belong to a language folder? (no page or collection may use it: /it/ is the Italian site)
function cc_lang_folder_taken($slug, $cfg = null) {
    $cfg = $cfg ?: cc_lang_config();
    if (!cc_lang_active($cfg)) return false;
    $s = cc_safe_slug($slug);
    foreach (cc_lang_codes($cfg) as $c) if ($c !== $cfg['default'] && $c === $s) return true;
    return false;
}
// The name of a language ("Italiano"), the code in capitals when it is not on the site
function cc_lang_name($code, $cfg) {
    foreach ($cfg['list'] ?? [] as $l) if ($l['code'] === $code) return $l['name'];
    return strtoupper((string)$code);
}
// The default language's code, or the code of an unmarked page ('' means the default language)
function cc_lang_of($lang, $cfg) { $n = cc_lang_norm($lang, $cfg); return $n === '' ? ($cfg['default'] ?? '') : $n; }

// The language being published: set by publish.php around each page or item so blocks can read it. null elsewhere (the editor).
// ['lang' => code ('' default), 'alternates' => [code => '{{BASE_URL}}path/'], 'self' => code, 'cfg' => config]
function cc_lang_context($ctx = false) {
    static $current = null;
    if ($ctx !== false) $current = $ctx;
    return $current;
}
// Items shown on a page are those in the page's language (every item when the page has no language: the editor, or a single-language site)
function cc_lang_filter_items($items) {
    $ctx = cc_lang_context();
    if (!$ctx || !cc_lang_active($ctx['cfg'])) return $items;
    return array_values(array_filter($items, function ($it) use ($ctx) { return cc_lang_known($it['lang'] ?? '', $ctx['cfg']) && cc_lang_norm($it['lang'] ?? '', $ctx['cfg']) === $ctx['lang']; }));
}

// The alternate links of a page in the <head>: one per language it exists in (itself included) and x-default (the default language).
// $alts: language code => absolute address. Nothing unless the page has at least one translation.
function cc_hreflang_html($alts, $default) {
    if (count($alts) < 2) return '';
    $h = '';
    foreach ($alts as $code => $url) $h .= '<link rel="alternate" hreflang="' . htmlspecialchars(cc_lang_tag($code)) . '" href="' . htmlspecialchars($url) . '">' . "\n";
    if (isset($alts[$default])) $h .= '<link rel="alternate" hreflang="x-default" href="' . htmlspecialchars($alts[$default]) . '">' . "\n";
    return $h;
}

// The Language Switcher block. $content: style (list|dropdown), labels (name|code), showCurrent. The links go to the translation of the
// page being published, or to the home page of the other languages when the page has none.
function cc_render_language_switcher($block) {
    $ctx = cc_lang_context();
    $c = is_array($block['content'] ?? null) ? $block['content'] : [];
    if (!$ctx || !cc_lang_active($ctx['cfg'])) return '';
    $style = ($c['style'] ?? '') === 'dropdown' ? 'dropdown' : 'list';
    $labels = ($c['labels'] ?? '') === 'code' ? 'code' : 'name';
    $showCurrent = ($c['showCurrent'] ?? true) !== false;
    $self = $ctx['self'];
    $label = function ($l) use ($labels) { return htmlspecialchars($labels === 'code' ? strtoupper($l['code']) : $l['name']); };
    $inline = build_inline_style($block['styles'] ?? []);
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($block['id'] ?? ''));
    $attr = ($id !== '' ? ' id="' . $id . '"' : '') . ($inline !== '' ? ' style="' . $inline . '"' : '');
    $items = [];
    foreach ($ctx['cfg']['list'] as $l) {
        $isSelf = $l['code'] === $self;
        if ($isSelf && !$showCurrent) continue;
        $href = $ctx['alternates'][$l['code']] ?? '';
        if ($href === '' && !$isSelf) continue;   // a language the page has no translation in, and that has no home page, is not offered
        $items[] = [$l, $isSelf, $href];
    }
    if ($style === 'dropdown') {
        $o = '';
        foreach ($items as [$l, $isSelf, $href]) $o .= '<option value="' . htmlspecialchars($href) . '" lang="' . htmlspecialchars(cc_lang_tag($l['code'])) . '"' . ($isSelf ? ' selected' : '') . '>' . $label($l) . '</option>';
        return '<div class="cc-lang-switch cc-lang-dropdown"' . $attr . '><select aria-label="Language" onchange="if(this.value)location.href=this.value" style="font:inherit; padding:6px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#0f172a;">' . $o . "</select></div>\n";
    }
    $li = '';
    foreach ($items as [$l, $isSelf, $href]) {
        $li .= '<li style="margin:0;">' . ($isSelf
            ? '<span class="cc-lang-current" aria-current="true" lang="' . htmlspecialchars(cc_lang_tag($l['code'])) . '" style="font-weight:700;">' . $label($l) . '</span>'
            : '<a href="' . htmlspecialchars($href) . '" hreflang="' . htmlspecialchars(cc_lang_tag($l['code'])) . '" lang="' . htmlspecialchars(cc_lang_tag($l['code'])) . '" style="color:inherit; text-decoration:none;">' . $label($l) . '</a>') . '</li>';
    }
    return '<nav class="cc-lang-switch cc-lang-list" aria-label="Language"' . $attr . '><ul style="list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center;">' . $li . "</ul></nav>\n";
}

// The texts of a language over the site's own (Languages › Texts): the announcement and the cookie banner. $base: the site's settings
// value for that block, $over: what the language replaces; only the filled in fields count.
function cc_lang_override($base, $over) {
    $base = is_array($base) ? $base : [];
    foreach ((is_array($over) ? $over : []) as $k => $v) if (is_string($v) && $v !== '') $base[$k] = $v;
    return $base;
}
