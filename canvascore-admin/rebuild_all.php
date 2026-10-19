<?php
// canvascore-admin/rebuild_all.php
// Generates the static HTML from the published pages. Requires login.
require_once __DIR__ . '/config.php';
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');
header('Cache-Control: no-store');
cc_security_headers();

if (!cc_session_is_logged_in()) cc_unauthorized('Unauthorized. Please login.');
// Publishing changes the site: POST with the CSRF token only (a link or another site can't trigger it)
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); die(json_encode(['success' => false, 'message' => 'Use POST.'])); }
cc_verify_csrf_or_die();

require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/compiler.php';
require_once __DIR__ . '/media.php';

$data_dir = cc_data_dir();
$db_file = $data_dir . '/canvascore.sqlite';
if (!file_exists($db_file)) die(json_encode(['success' => false, 'message' => 'Database not found.']));

try {
    $pdo = new PDO("sqlite:" . $db_file);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // The account must still exist unchanged, and not be waiting for a forced password change
    $account = cc_session_account($pdo);
    if (!$account) cc_unauthorized('Unauthorized. Please login.');
    if ((int)$account['must_change_pw'] === 1) { http_response_code(403); die(json_encode(['success' => false, 'code' => 'must_change_pw', 'message' => 'Choose a new password first.'])); }
    cc_session_touch();
    session_write_close(); // the rebuild can take a while: don't hold the other screens' requests

    $base_dir = dirname($_SERVER['SCRIPT_NAME'], 2);
    if ($base_dir === '\\' || $base_dir === '/') $base_dir = '';
    $base_url = $base_dir . '/';

    // Global settings: loaded first of all (menu and header/footer read them right below).
    $settings_file = $data_dir . '/settings.json';
    $settings = file_exists($settings_file) ? json_decode(file_get_contents($settings_file), true) : [];
    if (!is_array($settings)) $settings = [];

    $menu_file = $data_dir . '/menu.json';
    $menu_json = file_exists($menu_file) ? file_get_contents($menu_file) : '{"items":[], "settings":{}}';
    $menu_html = render_menu_html($menu_json, ['inheritTheme' => !empty($settings['menuInheritTheme'])]);

    // Global header/footer (blocks applied to every page)
    $header_html = '';
    $footer_html = '';
    try {
        foreach ($pdo->query("SELECT name, content_json FROM site_parts") as $part) {
            $pblocks = json_decode($part['content_json'] ?? '[]', true);
            $phtml = '';
            if (is_array($pblocks)) foreach ($pblocks as $pb) $phtml .= render_block($pb);
            if ($part['name'] === 'header') $header_html = $phtml;
            elseif ($part['name'] === 'footer') $footer_html = $phtml;
        }
    } catch (Exception $e) {}
    if (isset($settings['headerEnabled']) && empty($settings['headerEnabled'])) $header_html = '';
    if (isset($settings['footerEnabled']) && empty($settings['footerEnabled'])) $footer_html = '';

    // These go into <style> and <title>: only safe values (a color, a font name, escaped text)
    $palette = cc_palette($settings);
    $typo = cc_typography($settings);
    $brand_color = $palette[0]['value'];   // the primary global colour is the brand colour
    $font_family = preg_replace('/[^A-Za-z0-9 \-]/', '', (string)($settings['fontFamily'] ?? 'Inter'));
    if (trim($font_family) === '') $font_family = 'Inter';
    $site_suffix = htmlspecialchars(isset($settings['siteSuffix']) ? (string)$settings['siteSuffix'] : ' | My Site');
    $site_url     = rtrim(trim($settings['siteUrl'] ?? ''), '/');
    $site_name    = trim($settings['siteName'] ?? '');
    $favicon_url  = trim($settings['faviconUrl'] ?? '');
    $default_og   = trim($settings['defaultOgImage'] ?? '');
    $robots_allow = !isset($settings['robotsAllow']) || !empty($settings['robotsAllow']);
    if (cc_demo_on()) $robots_allow = false;   // a public demo is never indexed
    $abs = function ($u) use ($site_url) {
        $u = trim((string)$u);
        if ($u === '') return '';
        if (preg_match('~^https?://~i', $u)) return $u;
        return $site_url ? $site_url . '/' . ltrim($u, '/') : $u;
    };
    $sitemap_urls = [];

    // The site font, then the fonts of the text styles (one family parameter each)
    $families = array_values(array_unique(array_merge([$font_family], cc_type_fonts($typo))));
    $family_params = implode('&', array_map(function ($f) { return 'family=' . urlencode($f) . ':ital,wght@0,300;0,400;0,600;0,700;0,900;1,400'; }, $families));
    $google_fonts_link = "<link href=\"https://fonts.googleapis.com/css2?{$family_params}&display=swap\" rel=\"stylesheet\">";

    // Every file written by this build (relative to the site root), and the ones that could not be written
    $site_root = realpath(__DIR__ . '/..');
    $written = []; $failed = []; $warnings = [];
    $write = function ($fp, $content) use (&$written, &$failed, $site_root) {
        // Never outside the site folder, never into CanvasCore's own folders, never a server configuration or script file
        $rel = ltrim(str_replace('\\', '/', substr($fp, strlen(__DIR__ . '/../'))), '/');
        if (strpos($fp, __DIR__ . '/../') !== 0 || strpos($rel, '..') !== false || !preg_match('#^([A-Za-z0-9._-]+/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(html|xml|json|txt)$#', $rel)
            || cc_slug_reserved(explode('/', $rel)[0]) && strpos($rel, '/') !== false) { $failed[] = $fp; return; }
        $d = dirname($fp);
        if (!is_dir($d)) @mkdir($d, 0755, true);
        if (@file_put_contents($fp, $content) === false) { $failed[] = $fp; return; }
        $real = realpath($fp);
        if ($real && $site_root && strpos($real, $site_root . DIRECTORY_SEPARATOR) === 0) $written[] = str_replace(DIRECTORY_SEPARATOR, '/', substr($real, strlen($site_root) + 1));
    };

    $media_meta = cc_media_meta_existing(__DIR__ . '/../uploads');   // optimized image copies that exist (srcset)

    // RSS feeds: one per collection with published items, announced in every page's <head>
    // (feeds need absolute addresses, so they're made only when Global Options › Site address is set)
    $feeds = [];
    if ($site_url) {
        try {
            foreach ($pdo->query("SELECT c.id, c.name, c.slug FROM collections c WHERE EXISTS (SELECT 1 FROM collection_items i WHERE i.collection_id = c.id AND i.status = 'published' AND COALESCE(i.archived, 0) = 0)") as $fc) {
                $feeds[$fc['id']] = ['name' => (string)$fc['name'], 'slug' => cc_safe_slug($fc['slug']), 'items' => []];
            }
        } catch (Throwable $e) { error_log('CanvasCore publish (feeds): ' . $e->getMessage()); $warnings[] = 'Feeds could not be published (details in the server error log).'; }
    }
    $feed_links = '';
    foreach ($feeds as $fd) $feed_links .= '<link rel="alternate" type="application/rss+xml" title="' . htmlspecialchars($fd['name'] . ($site_name !== '' ? ' — ' . $site_name : '')) . '" href="' . htmlspecialchars($site_url . '/' . $fd['slug'] . '/feed.xml') . '">' . "\n";
    $cookie_html = cc_cookie_banner_html($settings['cookieBanner'] ?? null);
    // Global Options › Announcement bar: at the top of every page (nothing when it is off or has no text)
    $ann = $settings['announcement'] ?? null;
    $announce_html = (is_array($ann) && !empty($ann['enabled'])) ? cc_announcement_html($ann, 'cc-site-announce', '', '', true) : '';
    $search_index = [];
    // Plain text of a page for the site search (no tags, scripts or styles; collapsed spaces)
    $plain = function ($html) {
        $t = preg_replace('#<(script|style)\b[^>]*>.*?</\1>#is', ' ', (string)$html);
        $t = html_entity_decode(strip_tags(preg_replace('#<(br|/p|/h[1-6]|/li|/div)\b[^>]*>#i', ' ', $t)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return trim(preg_replace('/\s+/u', ' ', $t));
    };
    // Every published page and item gets the same finishing touches
    $finish = function ($html, $canonical, $noindex) use ($feed_links, $cookie_html, $announce_html, $base_url, &$media_meta) {
        $head = '';
        if ($canonical !== '') $head .= '<link rel="canonical" href="' . htmlspecialchars($canonical) . '">' . "\n";
        if ($noindex || cc_demo_on()) $head .= '<meta name="robots" content="noindex">' . "\n";
        $head .= $feed_links;
        if ($head !== '') $html = preg_replace('#</head>#i', $head . '</head>', $html, 1);
        if ($cookie_html !== '') $html = preg_replace('#</body>#i', str_replace('{{BASE_URL}}', $base_url, $cookie_html) . '</body>', $html, 1);
        // (a callback: the text may contain $1 or \\, which a replacement string would read as references)
        if ($announce_html !== '') $html = preg_replace_callback('#<body[^>]*>#i', function ($m) use ($announce_html, $base_url) { return $m[0] . "\n" . str_replace('{{BASE_URL}}', $base_url, $announce_html); }, $html, 1);
        return cc_optimize_images($html, $base_url . 'uploads/', $media_meta);
    };
    $master_file = __DIR__ . '/master.html';
    if (!file_exists($master_file)) die(json_encode(['success' => false, 'message' => 'Error: master.html missing!']));
    $template = file_get_contents($master_file);
    // Block effects and button hovers (shared with the editor canvas)
    $effects_file = __DIR__ . '/effects.css';
    $template = str_replace('{{COLOR_VARS}}', cc_palette_css($palette), $template);   // global colours, in :root
    // text styles (Global Options › Text styles) and button and field styles (Buttons & fields), as variables
    $template = str_replace('{{TYPE_CSS}}', cc_type_css($typo) . cc_kit_css(cc_kit($settings), ':root'), $template);
    $template = str_replace('{{EFFECTS_CSS}}', file_exists($effects_file) ? file_get_contents($effects_file) : '', $template);

    // Only published/modified pages (the live version is always the parent row).
    $stmt = $pdo->query("SELECT * FROM pages WHERE is_draft_copy = 0 AND status IN ('published', 'modified')");
    $pages = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $count = 0;

    // Is there an explicitly designated homepage?
    $homeExists = false;
    try {
        $homeExists = (int)$pdo->query("SELECT COUNT(*) FROM pages WHERE is_draft_copy = 0 AND is_home = 1 AND status IN ('published','modified')")->fetchColumn() > 0;
    } catch (Exception $e) { $homeExists = false; }

    foreach ($pages as $page) {
        $slug = cc_safe_slug($page['clean_slug'] ?? $page['slug'] ?? 'index');
        if (cc_slug_reserved($slug)) { $warnings[] = 'Not published: "' . ($page['title'] ?? '') . '" uses the reserved address /' . $slug . '/'; continue; }
        $title = htmlspecialchars($page['title'] ?? '');
        $seo_title = !empty($page['seo_title']) ? htmlspecialchars($page['seo_title']) : $title . $site_suffix;
        $seo_description = htmlspecialchars($page['seo_description'] ?? '');
        $page_layout = $page['layout'] ?? 'boxed';
        $page_bg = htmlspecialchars(cc_css_color($page['bg_color'] ?? '', '#ffffff'));
        $boxed_width = htmlspecialchars(cc_css_length($page['boxed_width'] ?? '', '1200px'));

        $is_home_pg = (int)($page['is_home'] ?? 0) === 1;
        $blocks = json_decode($page['content_json'] ?? '[]', true);
        $content_html = '';
        if (is_array($blocks)) {
            foreach ($blocks as $block) $content_html .= render_block($block);
        }

        $wrapper_style = $page_layout === 'boxed'
            ? "max-width: $boxed_width; margin: 0 auto; padding: 0 20px; overflow-x: clip;"
            : "overflow-x: clip;";
        $content_wrapped = $header_html . "<div style=\"$wrapper_style\">\n" . $content_html . "\n</div>" . $footer_html;
        $custom_bg_style = "<style>body { background-color: $page_bg !important; margin: 0; padding: 0; overflow-x: clip; }</style>";

        $html = str_replace('{{PAGE_TITLE}}', $seo_title, $template);
        $html = str_replace('{{META_DESCRIPTION}}', $seo_description, $html);
        $generator = '<meta name="generator" content="CanvasCore">';   // no version number: it would tell attackers which fixes a site lacks

        // Public path of the page (for og:url and sitemap)
        $page_path = ($slug === 'index' || $slug === 'home' || $is_home_pg) ? '/' : '/' . $slug . '/';
        $page_abs  = $site_url ? $site_url . $page_path : '';
        $og_image  = $abs(!empty($page['seo_image']) ? $page['seo_image'] : $default_og);

        $seo_head  = $favicon_url ? '<link rel="icon" href="' . htmlspecialchars($abs($favicon_url)) . '">' . "\n" : '';
        $seo_head .= '<meta property="og:type" content="website">' . "\n";
        $seo_head .= '<meta property="og:title" content="' . $seo_title . '">' . "\n";
        if ($seo_description !== '') $seo_head .= '<meta property="og:description" content="' . $seo_description . '">' . "\n";
        if ($site_name !== '') $seo_head .= '<meta property="og:site_name" content="' . htmlspecialchars($site_name) . '">' . "\n";
        if ($og_image !== '') $seo_head .= '<meta property="og:image" content="' . htmlspecialchars($og_image) . '">' . "\n";
        if ($page_abs !== '') $seo_head .= '<meta property="og:url" content="' . htmlspecialchars($page_abs) . '">' . "\n";
        $seo_head .= '<meta name="twitter:card" content="' . ($og_image !== '' ? 'summary_large_image' : 'summary') . '">' . "\n";

        $html = str_replace('</head>', $custom_bg_style . "\n" . $generator . "\n" . $seo_head . "</head>", $html);

        if ((int)($page['noindex'] ?? 0) !== 1) $sitemap_urls[] = $page_abs !== '' ? $page_abs : ($base_url . ltrim($page_path, '/'));
        $html = str_replace('{{MAIN_MENU}}', $menu_html, $html);
        $html = str_replace('{{GOOGLE_FONTS}}', $google_fonts_link, $html);
        $html = str_replace('{{BRAND_COLOR}}', $brand_color, $html);
        $html = str_replace('{{FONT_FAMILY}}', $font_family, $html);
        $html = str_replace('{{PAGE_CONTENT}}', $content_wrapped, $html);
        $html = str_replace('{{BASE_URL}}', $base_url, $html);

        // Smart homepage routing:
        // - the page with is_home=1 is written to the root (index.html)
        // - without an explicit flag, the index/home slug convention still applies
        // - every non-root page still gets its own /slug/index.html folder,
        //   so any form of internal link keeps working.
        $is_home = (int)($page['is_home'] ?? 0) === 1;
        $isRootSlug = ($slug === 'index' || $slug === 'home');
        $writeRoot = $is_home || (!$homeExists && $isRootSlug);

        $targets = [];
        if ($writeRoot) $targets[] = __DIR__ . '/../index.html';
        if (!$isRootSlug) $targets[] = __DIR__ . '/../' . $slug . '/index.html';
        if (empty($targets)) $targets[] = __DIR__ . '/../' . $slug . '/index.html'; // slug 'index'/'home' that is not home while another page is the home
        $noindex_pg = (int)($page['noindex'] ?? 0) === 1;
        $html = $finish($html, $page_abs, $noindex_pg);
        foreach ($targets as $fp) $write($fp, $html);
        if (!$noindex_pg) {
            $txt = $plain($content_html);
            $search_index[] = ['t' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'), 'u' => $base_url . ltrim($page_path, '/'),
                               'd' => (string)($page['seo_description'] ?? '') !== '' ? (string)$page['seo_description'] : mb_substr($txt, 0, 160), 'x' => mb_substr($txt, 0, 3000)];
        }
        $count++;
    }
    // --- Collection items: one static page per published item ---
    try {
        // Every item, for the references between items (a reference links to a published one)
        $item_index = [];
        foreach ($pdo->query("SELECT i.id, i.title, i.slug, i.status, i.archived, c.slug AS col_slug FROM collection_items i JOIN collections c ON c.id = i.collection_id")->fetchAll(PDO::FETCH_ASSOC) as $ii) {
            $item_index[$ii['id']] = ['title' => (string)$ii['title'], 'slug' => cc_safe_slug($ii['slug']), 'col_slug' => cc_safe_slug($ii['col_slug']),
                'live' => $ii['status'] === 'published' && (int)($ii['archived'] ?? 0) !== 1];
        }
        $cols = $pdo->query("SELECT id, slug, fields FROM collections")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cols as $col) {
            $col_slug = cc_safe_slug($col['slug']);
            if (cc_slug_reserved($col_slug)) { $warnings[] = 'Not published: a collection uses the reserved address /' . $col_slug . '/'; continue; }
            // The collection's custom fields, by id
            $defs_by_id = [];
            foreach (cc_field_defs(json_decode((string)($col['fields'] ?? '[]'), true), $pdo) as $fd) $defs_by_id[$fd['id']] = $fd;
            $its = $pdo->prepare("SELECT * FROM collection_items WHERE collection_id = ? AND status = 'published'");
            $its->execute([$col['id']]);
            foreach ($its->fetchAll(PDO::FETCH_ASSOC) as $it) {
                $it_slug = cc_safe_slug($it['slug']);
                $i_title = htmlspecialchars($it['title'] ?? '');
                $i_seo_title = !empty($it['seo_title']) ? htmlspecialchars($it['seo_title']) : $i_title . $site_suffix;
                $i_seo_desc = htmlspecialchars($it['seo_description'] ?? $it['excerpt'] ?? '');
                $i_blocks = json_decode($it['content_json'] ?? '[]', true);
                // The item's custom fields, cleaned again against the collection's current definitions
                $i_raw = json_decode((string)($it['field_values'] ?? '{}'), true);
                $i_values = [];
                foreach ($defs_by_id as $fid => $fd) $i_values[$fid] = cc_field_clean($fd, is_array($i_raw) ? ($i_raw[$fid] ?? null) : null, $pdo);
                cc_item_context(['defs' => $defs_by_id, 'values' => $i_values, 'items' => $item_index]);
                $i_content = '';
                if (is_array($i_blocks)) foreach ($i_blocks as $b) $i_content .= render_block($b);
                cc_item_context(null);
                $i_wrap = "<div style=\"max-width:1100px; margin:0 auto; padding:0 20px; overflow-x:clip;\">\n" . $i_content . "\n</div>";
                $i_full = $header_html . $i_wrap . $footer_html;

                $i_path = '/' . $col_slug . '/' . $it_slug . '/';
                $i_abs  = $site_url ? $site_url . $i_path : '';
                $og_image = $abs(!empty($it['cover_image']) ? $it['cover_image'] : $default_og);
                $i_seo_head  = $favicon_url ? '<link rel="icon" href="' . htmlspecialchars($abs($favicon_url)) . '">' . "\n" : '';
                $i_seo_head .= '<meta property="og:type" content="article">' . "\n";
                $i_seo_head .= '<meta property="og:title" content="' . $i_title . '">' . "\n";
                if ($i_seo_desc !== '') $i_seo_head .= '<meta property="og:description" content="' . $i_seo_desc . '">' . "\n";
                if ($site_name !== '') $i_seo_head .= '<meta property="og:site_name" content="' . htmlspecialchars($site_name) . '">' . "\n";
                if ($og_image !== '') $i_seo_head .= '<meta property="og:image" content="' . htmlspecialchars($og_image) . '">' . "\n";
                if ($i_abs !== '') $i_seo_head .= '<meta property="og:url" content="' . htmlspecialchars($i_abs) . '">' . "\n";
                $i_seo_head .= '<meta name="twitter:card" content="' . ($og_image !== '' ? 'summary_large_image' : 'summary') . '">' . "\n";

                $ihtml = str_replace('{{PAGE_TITLE}}', $i_seo_title, $template);
                $ihtml = str_replace('{{META_DESCRIPTION}}', $i_seo_desc, $ihtml);
                $ihtml = str_replace('</head>', '<style>body{background:#ffffff !important;margin:0;padding:0;overflow-x:clip;}</style>' . "\n" . $i_seo_head . "</head>", $ihtml);
                $ihtml = str_replace('{{MAIN_MENU}}', $menu_html, $ihtml);
                $ihtml = str_replace('{{GOOGLE_FONTS}}', $google_fonts_link, $ihtml);
                $ihtml = str_replace('{{BRAND_COLOR}}', $brand_color, $ihtml);
                $ihtml = str_replace('{{FONT_FAMILY}}', $font_family, $ihtml);
                $ihtml = str_replace('{{PAGE_CONTENT}}', $i_full, $ihtml);
                $ihtml = str_replace('{{BASE_URL}}', $base_url, $ihtml);

                $ihtml = $finish($ihtml, $i_abs, false);
                $write(__DIR__ . '/../' . $col_slug . '/' . $it_slug . '/index.html', $ihtml);
                if ((int)($it['archived'] ?? 0) !== 1) {
                    $itxt = $plain($i_content);
                    $search_index[] = ['t' => (string)($it['title'] ?? ''), 'u' => $base_url . $col_slug . '/' . $it_slug . '/',
                                       'd' => (string)($it['excerpt'] ?? '') !== '' ? (string)$it['excerpt'] : mb_substr($itxt, 0, 160), 'x' => mb_substr($itxt, 0, 3000)];
                    if (isset($feeds[$col['id']])) $feeds[$col['id']]['items'][] = $it;
                }
                $count++;
                $sitemap_urls[] = $i_abs !== '' ? $i_abs : ($base_url . $col_slug . '/' . $it_slug . '/');
            }
        }
    } catch (Throwable $e) { error_log('CanvasCore publish (collections): ' . $e->getMessage()); $warnings[] = 'Collections could not be published (details in the server error log).'; }

    // --- RSS feeds (newest 50 items each) ---
    foreach ($feeds as $fd) {
        usort($fd['items'], function ($a, $b) { return strcmp((string)($b['date'] ?: $b['updated_at']), (string)($a['date'] ?: $a['updated_at'])); });
        $rss = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' . "\n";
        $rss .= '<title>' . htmlspecialchars($fd['name'] . ($site_name !== '' ? ' — ' . $site_name : '')) . '</title>' . "\n";
        $rss .= '<link>' . htmlspecialchars($site_url . '/') . '</link>' . "\n";
        $rss .= '<description>' . htmlspecialchars($fd['name']) . '</description>' . "\n";
        $rss .= '<atom:link href="' . htmlspecialchars($site_url . '/' . $fd['slug'] . '/feed.xml') . '" rel="self" type="application/rss+xml"/>' . "\n";
        foreach (array_slice($fd['items'], 0, 50) as $it) {
            $link = $site_url . '/' . $fd['slug'] . '/' . cc_safe_slug($it['slug']) . '/';
            $ts = strtotime((string)($it['date'] ?: $it['updated_at'])) ?: time();
            $rss .= '<item><title>' . htmlspecialchars((string)$it['title']) . '</title><link>' . htmlspecialchars($link) . '</link><guid isPermaLink="true">' . htmlspecialchars($link) . '</guid>'
                  . '<pubDate>' . gmdate('D, d M Y H:i:s', $ts) . ' GMT</pubDate>'
                  . ((string)($it['excerpt'] ?? '') !== '' ? '<description>' . htmlspecialchars((string)$it['excerpt']) . '</description>' : '')
                  . (!empty($it['cover_image']) ? '<enclosure url="' . htmlspecialchars($abs($it['cover_image'])) . '" type="image/' . (preg_match('/\.png$/i', $it['cover_image']) ? 'png' : (preg_match('/\.webp$/i', $it['cover_image']) ? 'webp' : 'jpeg')) . '" length="0"/>' : '')
                  . '</item>' . "\n";
        }
        $rss .= '</channel></rss>' . "\n";
        $write(__DIR__ . '/../' . $fd['slug'] . '/feed.xml', $rss);
    }

    // --- Site search index (used by the Site Search block) ---
    $write(__DIR__ . '/../search-index.json', json_encode($search_index, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    // --- Redirects: a small page at each old address (any host), plus real 301s for Apache ---
    $apache_rules = [];
    try {
        $written_now = array_flip($written);
        foreach ($pdo->query("SELECT from_path, to_path FROM redirects ORDER BY from_path") as $rd) {
            // Only well-formed redirects (also those restored from a backup): a site path that stays inside the
            // site and isn't one of CanvasCore's folders, to a site path or an http(s) address without spaces
            $from_ok = cc_redirect_path($rd['from_path']); $to_ok = cc_redirect_target($rd['to_path']);
            if ($from_ok === null || $to_ok === null || $from_ok !== $rd['from_path']) { $warnings[] = 'Skipped an invalid redirect.'; continue; }
            $rd['to_path'] = $to_ok;
            $rel = trim($rd['from_path'], '/') . '/index.html';
            if (isset($written_now[$rel])) {   // a published page lives there now: the redirect is gone
                $pdo->prepare("DELETE FROM redirects WHERE from_path = ?")->execute([$rd['from_path']]);
                continue;
            }
            $to = (string)$rd['to_path'];
            $href = preg_match('~^https?://~i', $to) ? $to : $base_url . ltrim($to, '/');
            $write(__DIR__ . '/../' . $rel, cc_redirect_page_html($href));
            $apache_rules[] = [rtrim($base_url, '/') . $rd['from_path'], preg_match('~^https?://~i', $to) ? $to : rtrim($base_url, '/') . $to];
        }
    } catch (Throwable $e) { error_log('CanvasCore publish (redirects): ' . $e->getMessage()); $warnings[] = 'Redirects could not be published (details in the server error log).'; }

    // Form recipient registry (per form, server-side: no email addresses in the client)
    $forms = function_exists('cc_form_registry') ? cc_form_registry() : [];
    if (@file_put_contents($data_dir . '/forms.json', json_encode($forms, JSON_UNESCAPED_UNICODE)) === false) $failed[] = $data_dir . '/forms.json';

    // --- sitemap.xml ---
    $sm = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach (array_unique($sitemap_urls) as $u) $sm .= '  <url><loc>' . htmlspecialchars($u) . '</loc></url>' . "\n";
    $sm .= '</urlset>' . "\n";
    $write(__DIR__ . '/../sitemap.xml', $sm);

    // --- robots.txt ---
    $robots = "User-agent: *\n" . ($robots_allow ? "Allow: /\n" : "Disallow: /\n");
    if ($site_url) $robots .= "Sitemap: $site_url/sitemap.xml\n";
    $write(__DIR__ . '/../robots.txt', $robots);

    // --- 404.html ---
    $nf_content = '<div style="max-width:600px;margin:0 auto;padding:100px 20px;text-align:center;">'
        . '<h1 style="font-size:72px;margin:0;color:' . $brand_color . ';">404</h1>'
        . '<h2 style="margin:10px 0;">Page not found</h2>'
        . '<p style="color:#64748b;">The page you are looking for doesn\'t exist.</p>'
        . '<a href="' . $base_url . '" style="display:inline-block;margin-top:20px;padding:12px 24px;background:' . $brand_color . ';color:#fff;border-radius:8px;text-decoration:none;">Back to home</a>'
        . '</div>';
    $nf = str_replace('{{PAGE_TITLE}}', '404 - Not Found' . $site_suffix, $template);
    $nf = str_replace(['{{META_DESCRIPTION}}', '{{MAIN_MENU}}', '{{GOOGLE_FONTS}}', '{{BRAND_COLOR}}', '{{FONT_FAMILY}}', '{{PAGE_CONTENT}}', '{{BASE_URL}}'],
                      ['', $menu_html, $google_fonts_link, $brand_color, $font_family, $nf_content, $base_url], $nf);
    $nf = $finish($nf, '', true);
    $write(__DIR__ . '/../404.html', $nf);

    // ErrorDocument for Apache (best effort; on Nginx it must be configured by hand)
    $root_ht = __DIR__ . '/../.htaccess';
    $ht_old = file_exists($root_ht) ? (string)@file_get_contents($root_ht) : "ErrorDocument 404 " . $base_url . "404.html\n";
    $ht_new = cc_htaccess_with_redirects($ht_old, $apache_rules);
    if ($ht_new !== $ht_old || !file_exists($root_ht)) @file_put_contents($root_ht, $ht_new);

    // Pages no longer published (deleted, unpublished, renamed slug, deleted collection items) are removed:
    // only files a previous build wrote (manifest), never anything else, and never the root index.html.
    $manifest_file = $data_dir . '/published_files.json';
    $previous = file_exists($manifest_file) ? json_decode((string)@file_get_contents($manifest_file), true) : [];
    $removed = 0;
    if (is_array($previous) && !$failed) {
        $keep = array_flip($written);
        foreach ($previous as $rel) {
            if (!is_string($rel) || isset($keep[$rel]) || $rel === 'index.html') continue;
            if (!preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/(index\.html|feed\.xml)$#', $rel) || strpos($rel, '..') !== false) continue;
            if (cc_slug_reserved(explode('/', $rel)[0])) continue;   // CanvasCore's own folders are never touched
            $fp = __DIR__ . '/../' . $rel;
            if (is_file($fp) && @unlink($fp)) {
                $removed++;
                $d = dirname($fp);   // remove the emptied folders (item folder, then collection folder)
                for ($i = 0; $i < 2 && $d !== $site_root && @rmdir($d); $i++) $d = dirname($d);
            }
        }
    }
    if (!$failed) @file_put_contents($manifest_file, json_encode(array_values(array_unique($written))));

    if ($failed) {
        echo json_encode(['success' => false, 'message' => 'Publish incomplete: ' . count($failed) . ' file(s) could not be written (check the folder permissions on the server), e.g. ' . basename(dirname($failed[0])) . '/' . basename($failed[0]) . '.']);
    } else {
        $msg = "Build successful: $count pages published." . ($removed ? " $removed old page(s) removed." : '');
        if ($warnings) $msg .= ' Warning: ' . implode(' ', $warnings);
        echo json_encode(['success' => true, 'message' => $msg]);
    }
} catch (Throwable $e) {
    error_log('CanvasCore publish: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    echo json_encode(['success' => false, 'message' => 'Publishing failed because of a server error. Details are in the server error log.']);
}
