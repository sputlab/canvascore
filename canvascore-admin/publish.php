<?php
// canvascore-admin/publish.php
// Publishing the whole site: the static pages, collection items, archives, feeds, search index, redirects, sitemap, robots,
// 404 page and .htaccess. Used by the "Publish Site" button (rebuild_all.php) and by the scheduled publishing (cron.php and
// the first admin request after a scheduled time). Needs no login: callers check who may publish.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/compiler.php';
require_once __DIR__ . '/media.php';

// Publishes the site. Returns ['success' => bool, 'message' => string] (the message says what was published or what failed).
function cc_publish_site(PDO $pdo, string $data_dir, string $base_dir): array {
    try {
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
        // Administration › Integrations › Analytics: the snippet in the head of every page; it waits for the cookie banner (when there is one)
        $analytics_html = '';
        try {
            if (is_file(cc_data_dir() . '/integrations.json')) { require_once __DIR__ . '/integrations.php'; $analytics_html = cc_int_analytics_html(cc_int_load()['analytics'], $cookie_html !== ''); }
        } catch (Throwable $e) { error_log('CanvasCore publish (analytics): ' . $e->getMessage()); }
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
        $finish = function ($html, $canonical, $noindex) use ($feed_links, $cookie_html, $announce_html, $analytics_html, $base_url, &$media_meta) {
            $head = '';
            if ($canonical !== '') $head .= '<link rel="canonical" href="' . htmlspecialchars($canonical) . '">' . "\n";
            if ($noindex || cc_demo_on()) $head .= '<meta name="robots" content="noindex">' . "\n";
            $head .= $feed_links;
            if ($analytics_html !== '' && !cc_demo_on()) $head .= $analytics_html;   // a demo site is not counted
            // (a callback: the snippet may contain $ or \\, which a replacement string would read as references)
            if ($head !== '') $html = preg_replace_callback('#</head>#i', function ($m) use ($head) { return $head . $m[0]; }, $html, 1);
            if ($cookie_html !== '') $html = preg_replace('#</body>#i', str_replace('{{BASE_URL}}', $base_url, $cookie_html) . '</body>', $html, 1);
            // (a callback: the text may contain $1 or \\, which a replacement string would read as references)
            if ($announce_html !== '') $html = preg_replace_callback('#<body[^>]*>#i', function ($m) use ($announce_html, $base_url) { return $m[0] . "\n" . str_replace('{{BASE_URL}}', $base_url, $announce_html); }, $html, 1);
            return cc_optimize_images($html, $base_url . 'uploads/', $media_meta);
        };
        $master_file = __DIR__ . '/master.html';
        if (!file_exists($master_file)) return ['success' => false, 'message' => 'Error: master.html missing!'];
        $template = file_get_contents($master_file);
        // Block effects and button hovers (shared with the editor canvas)
        $effects_file = __DIR__ . '/effects.css';
        $template = str_replace('{{COLOR_VARS}}', cc_palette_css($palette), $template);   // global colours, in :root
        // text styles (Global Options › Text styles) and button and field styles (Buttons & fields), as variables
        $template = str_replace('{{TYPE_CSS}}', cc_type_css($typo) . cc_kit_css(cc_kit($settings), ':root'), $template);
        $template = str_replace('{{EFFECTS_CSS}}', file_exists($effects_file) ? file_get_contents($effects_file) : '', $template);
        $template = str_replace('{{PACKAGE_CSS}}', function_exists('cc_pkg_css') ? cc_pkg_css() : '', $template);   // the style sheets of the block packages, each confined to its own blocks

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
                // f: the facets of the entry (the collection, and the terms of each taxonomy); fl: their labels
                $search_index[] = ['t' => html_entity_decode($title, ENT_QUOTES, 'UTF-8'), 'u' => $base_url . ltrim($page_path, '/'),
                                   'd' => (string)($page['seo_description'] ?? '') !== '' ? (string)$page['seo_description'] : mb_substr($txt, 0, 160), 'x' => mb_substr($txt, 0, 3000),
                                   'f' => ['collection' => 'Pages'], 'fl' => ['collection' => 'Collection']];
            }
            $count++;
        }
        // --- Collection items: one static page per published item ---
        try {
            // Categories and tags: the taxonomies of every collection and their terms (for the item pages and the taxonomy pages)
            $term_index = []; $taxes_by_col = []; $archive_by_col = [];
            foreach ($pdo->query("SELECT id, slug FROM collections")->fetchAll(PDO::FETCH_ASSOC) as $tc) {
                $tcs = cc_safe_slug($tc['slug']);
                $taxes_by_col[$tc['id']] = ['slug' => $tcs, 'taxes' => cc_taxonomies_load($pdo, $tc['id'])];
                foreach ($taxes_by_col[$tc['id']]['taxes'] as $tx) {
                    foreach ($tx['terms'] as $tm) {
                        $term_index[$tm['id']] = ['name' => $tm['name'], 'slug' => cc_tax_slug($tm['slug']), 'tax_id' => $tx['id'], 'tax_name' => $tx['name'], 'tax_slug' => cc_tax_slug($tx['slug']), 'col_slug' => $tcs];
                    }
                }
            }
            $term_items = [];   // term id => its published, live items (for the term pages)
            $item_slugs = [];   // collection id => the addresses its items use (a taxonomy may not take one)
            // Every item, for the references between items (a reference links to a published one)
            $item_index = [];
            foreach ($pdo->query("SELECT i.id, i.title, i.slug, i.status, i.archived, c.slug AS col_slug FROM collection_items i JOIN collections c ON c.id = i.collection_id")->fetchAll(PDO::FETCH_ASSOC) as $ii) {
                $item_index[$ii['id']] = ['title' => (string)$ii['title'], 'slug' => cc_safe_slug($ii['slug']), 'col_slug' => cc_safe_slug($ii['col_slug']),
                    'live' => $ii['status'] === 'published' && (int)($ii['archived'] ?? 0) !== 1];
            }
            $cols = $pdo->query("SELECT id, name, slug, fields, schema_json, design_json, archive_json FROM collections")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cols as $col) {
                $col_slug = cc_safe_slug($col['slug']);
                if (cc_slug_reserved($col_slug)) { $warnings[] = 'Not published: a collection uses the reserved address /' . $col_slug . '/'; continue; }
                // The collection's custom fields, by id
                $defs_by_id = [];
                foreach (cc_field_defs(json_decode((string)($col['fields'] ?? '[]'), true), $pdo) as $fd) $defs_by_id[$fd['id']] = $fd;
                // Structured data of the items (schema.org), from the collection's schema
                $col_schema = cc_schema_clean(json_decode((string)($col['schema_json'] ?? '{}'), true), array_values($defs_by_id));
                // Listing and archive pages: how many items a page holds, and which archives are published
                $archive_by_col[$col['id']] = cc_archive_clean(json_decode((string)($col['archive_json'] ?? '{}'), true));
                $its = $pdo->prepare("SELECT * FROM collection_items WHERE collection_id = ? AND status = 'published'");
                $its->execute([$col['id']]);
                foreach ($its->fetchAll(PDO::FETCH_ASSOC) as $it) {
                    $it_slug = cc_safe_slug($it['slug']);
                    $i_title = htmlspecialchars($it['title'] ?? '');
                    $i_seo_title = !empty($it['seo_title']) ? htmlspecialchars($it['seo_title']) : $i_title . $site_suffix;
                    $i_seo_desc = htmlspecialchars($it['seo_description'] ?? $it['excerpt'] ?? '');
                    // One design per collection: when it has blocks, every item page is built from them (the item's own
                    // blocks are kept, and used again if the design is removed)
                    $col_design = json_decode((string)($col['design_json'] ?? '[]'), true);
                    $i_blocks = (is_array($col_design) && $col_design) ? $col_design : json_decode($it['content_json'] ?? '[]', true);
                    // The item's custom fields, cleaned again against the collection's current definitions
                    $i_raw = json_decode((string)($it['field_values'] ?? '{}'), true);
                    $i_values = [];
                    foreach ($defs_by_id as $fid => $fd) $i_values[$fid] = cc_field_clean($fd, is_array($i_raw) ? ($i_raw[$fid] ?? null) : null, $pdo);
                    // Categories and tags of the item, cleaned against its collection (set before the item's blocks render)
                    $i_terms = cc_terms_clean(json_decode((string)($it['terms_json'] ?? '{}'), true), $pdo, $col['id']);
                    cc_item_context(['defs' => $defs_by_id, 'values' => $i_values, 'items' => $item_index, 'item' => (string)$it['id'], 'collection_id' => (string)$col['id'],
                        'item_terms' => $i_terms, 'terms' => $term_index, 'item_archived' => (int)($it['archived'] ?? 0) === 1,
                        'page' => ['title' => (string)$it['title'], 'excerpt' => (string)($it['excerpt'] ?? ''), 'date' => (string)($it['date'] ?? ''), 'url' => '{{BASE_URL}}' . $col_slug . '/' . $it_slug . '/']]);
                    // Categories and tags of the item, cleaned against its collection; the term pages list the live items
                    $item_slugs[$col['id']][$it_slug] = true;
                    if ((int)($it['archived'] ?? 0) !== 1) foreach ($i_terms as $i_mids) foreach ($i_mids as $i_mid) $term_items[$i_mid][] = $it;
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
                    // structured data for search engines (the collection's schema), with the item's own values
                    $i_seo_head .= cc_item_jsonld($col_schema, $defs_by_id, $i_values, (string)$it['title'], $i_abs, $abs);

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
                        // facets: the collection, and the terms of the item in each taxonomy
                        $sf = ['collection' => (string)($col['name'] ?? '')]; $sfl = ['collection' => 'Collection'];
                        foreach ($i_terms as $i_tid => $i_mids) {
                            $tnames = [];
                            foreach ($i_mids as $i_mid) if (isset($term_index[$i_mid])) { $tnames[] = $term_index[$i_mid]['name']; $sfl['tax:' . $i_tid] = $term_index[$i_mid]['tax_name']; }
                            if ($tnames) $sf['tax:' . $i_tid] = $tnames;
                        }
                        $search_index[] = ['t' => (string)($it['title'] ?? ''), 'u' => $base_url . $col_slug . '/' . $it_slug . '/',
                                           'd' => (string)($it['excerpt'] ?? '') !== '' ? (string)$it['excerpt'] : mb_substr($itxt, 0, 160), 'x' => mb_substr($itxt, 0, 3000),
                                           'f' => $sf, 'fl' => $sfl];
                        if (isset($feeds[$col['id']])) $feeds[$col['id']]['items'][] = $it;
                    }
                    $count++;
                    $sitemap_urls[] = $i_abs !== '' ? $i_abs : ($base_url . $col_slug . '/' . $it_slug . '/');
                }
            }
        } catch (Throwable $e) { error_log('CanvasCore publish (collections): ' . $e->getMessage()); $warnings[] = 'Collections could not be published (details in the server error log).'; }

        // --- Listing, archive and taxonomy pages. One layout for all of them, paginated (cc_archive_nav), built from the
        // live items of each collection: the listing (/<col>/, /<col>/page/N/), its sorts (/<col>/sort/title/, /<col>/sort/oldest/),
        // its years and months (/<col>/<yyyy>/, /<col>/<yyyy>/<mm>/), the filters of its choice fields
        // (/<col>/filter/<field>/<value>/), and the taxonomies: their pages (/<col>/<tax>/) and their terms (/<col>/<tax>/<term>/).
        // An address that an item already uses is never written over.
        try {
            $render_page = function ($path, $title, $desc, $inner) use (&$sitemap_urls, $template, $menu_html, $google_fonts_link, $brand_color, $font_family, $header_html, $footer_html, $site_suffix, $base_url, $site_url, $finish, $write) {
                $tt = htmlspecialchars($title);
                $tdesc = htmlspecialchars(mb_substr(trim(preg_replace('/\s+/u', ' ', $desc !== '' ? $desc : $title)), 0, 300));
                $abs = $site_url ? $site_url . '/' . $path : '';
                $page = str_replace(['{{PAGE_TITLE}}', '{{META_DESCRIPTION}}'], [$tt . $site_suffix, $tdesc], $template);
                $page = str_replace('</head>', '<style>body{background:#ffffff !important;margin:0;padding:0;overflow-x:clip;}</style>' . "\n" . '<meta property="og:title" content="' . $tt . '">' . "\n</head>", $page);
                $page = str_replace(['{{MAIN_MENU}}', '{{GOOGLE_FONTS}}', '{{BRAND_COLOR}}', '{{FONT_FAMILY}}', '{{PAGE_CONTENT}}'],
                    [$menu_html, $google_fonts_link, $brand_color, $font_family, $header_html . '<div style="max-width:1100px; margin:0 auto; padding:0 20px; overflow-x:clip;">' . $inner . '</div>' . $footer_html], $page);
                $page = str_replace('{{BASE_URL}}', $base_url, $page);
                $write(__DIR__ . '/../' . $path . 'index.html', $finish($page, $abs, false));
                $sitemap_urls[] = $abs !== '' ? $abs : ($base_url . $path);
            };
            // One archive: its items in pages of $per (the browse links go on its first page)
            $archive = function ($dir, $kind, $title, $desc, $items, $cs, $per, $browse) use ($render_page) {
                $total = max(1, (int)ceil(count($items) / $per));
                for ($p = 1; $p <= $total; $p++) {
                    $path = $dir . ($p > 1 ? 'page/' . $p . '/' : '');
                    $cards = cc_list_cards(array_slice($items, ($p - 1) * $per, $per), $cs, cc_list_options(['columns' => 3], [], ['items' => []], 'grid', ''));
                    $inner = cc_archive_page_inner($kind, $title, $desc, $cards, cc_archive_nav($dir, $p, $total), $p === 1 ? $browse : '');
                    $render_page($path, $title . ($p > 1 ? ' · page ' . $p : ''), $desc, $inner);
                }
            };
            $cdata = cc_collections_data();
            foreach ($cdata['by_id'] as $cid => $cc) {
                $cs = cc_safe_slug($cc['slug']);
                if (cc_slug_reserved($cs) || !isset($archive_by_col[$cid])) continue;
                $cfg = $archive_by_col[$cid];
                $per = $cfg['perPage'];
                $taken = $item_slugs[$cid] ?? [];
                $live = array_values(array_filter($cc['items'], function ($it) { return empty($it['archived']); }));
                $newest = cc_sort_items($live, 'date', true, []);

                // 1. the taxonomies: the page of each one (its terms with their counts), and the page of each term (its items)
                $tax_pages = [];
                foreach (($taxes_by_col[$cid]['taxes'] ?? []) as $tx) {
                    $tts = cc_tax_slug($tx['slug']);
                    if ($tts === '') continue;
                    if (!empty($taken[$tts])) { $warnings[] = 'Taxonomy pages not published: an item of the collection "' . $cs . '" uses the address /' . $cs . '/' . $tts . '/.'; continue; }
                    $tax_terms = [];
                    foreach ($tx['terms'] as $tm) {
                        $tms = cc_tax_slug($tm['slug']);
                        $its = $term_items[$tm['id']] ?? [];
                        if ($tms === '' || !$its) continue;
                        usort($its, function ($a, $b) {
                            $c = strcmp((string)($b['date'] ?: ''), (string)($a['date'] ?: ''));
                            return $c !== 0 ? $c : strcmp((string)$a['title'], (string)$b['title']);
                        });
                        $archive($cs . '/' . $tts . '/' . $tms . '/', $tx['name'], $tm['name'], (string)$tm['description'], $its, $cs, $per, '');
                        $tax_terms[] = ['name' => $tm['name'], 'description' => (string)$tm['description'], 'count' => count($its), 'href' => $base_url . $cs . '/' . $tts . '/' . $tms . '/'];
                    }
                    if (!$tax_terms) continue;
                    $ipath = $cs . '/' . $tts . '/';
                    $render_page($ipath, $tx['name'], $tx['name'], cc_taxonomy_index_inner($tx['name'], $tax_terms));
                    $tax_pages[] = [$tx['name'], $ipath];
                }

                // 2. the browse links of the first listing page
                $groups = [];
                if ($cfg['sorts'] && empty($taken['sort'])) $groups[] = ['Sort', [['Newest first', $cs . '/'], ['Oldest first', $cs . '/sort/oldest/'], ['Title A–Z', $cs . '/sort/title/']]];
                $years = []; $months = [];
                foreach ($live as $it) {
                    if (preg_match('/^(\d{4})-(\d{2})/', (string)($it['date'] ?? ''), $ym)) { $years[$ym[1]][] = $it; $months[$ym[1] . '-' . $ym[2]][] = $it; }
                }
                krsort($years); krsort($months);
                $year_links = [];
                foreach (array_keys($years) as $y) if (empty($taken[$y])) $year_links[] = [$y, $cs . '/' . $y . '/'];
                if ($cfg['years'] && $year_links) $groups[] = ['Years', $year_links];
                if ($cfg['filters'] && empty($taken['filter'])) {
                    foreach ($cc['defsById'] as $fd) {
                        if ($fd['type'] !== 'choice') continue;
                        $links = [];
                        foreach ($fd['options'] ?? [] as $o) $links[] = [$o['label'], $cs . '/filter/' . $fd['key'] . '/' . $o['value'] . '/'];
                        if ($links) $groups[] = [$fd['label'], $links];
                    }
                }
                if ($tax_pages) $groups[] = ['Categories & tags', array_map(function ($t) { return [$t[0], $t[1]]; }, $tax_pages)];
                $browse = cc_archive_browse_html($groups);

                // 3. the listing and its sorts
                $archive($cs . '/', 'Collection', $cc['name'], '', $newest, $cs, $per, $browse);
                if ($cfg['sorts'] && empty($taken['sort'])) {
                    $archive($cs . '/sort/oldest/', 'Sorted', $cc['name'] . ' · oldest first', '', cc_sort_items($live, 'date', false, []), $cs, $per, '');
                    $archive($cs . '/sort/title/', 'Sorted', $cc['name'] . ' · A–Z', '', cc_sort_items($live, 'title', false, []), $cs, $per, '');
                }

                // 4. the years and their months
                if ($cfg['years']) {
                    foreach ($years as $y => $ys) {
                        if (!empty($taken[$y])) continue;
                        $archive($cs . '/' . $y . '/', 'Year', $y, '', $ys, $cs, $per, '');
                    }
                    foreach ($months as $ym => $ms) {
                        [$my, $mm] = explode('-', $ym);
                        if (!empty($taken[$my])) continue;
                        $archive($cs . '/' . $my . '/' . $mm . '/', 'Month', date('F Y', mktime(0, 0, 0, (int)$mm, 1, (int)$my)), '', $ms, $cs, $per, '');
                    }
                }

                // 5. the filters of the choice fields: one archive per choice, with the items that have it
                if ($cfg['filters'] && empty($taken['filter'])) {
                    foreach ($cc['defsById'] as $fd) {
                        if ($fd['type'] !== 'choice') continue;
                        foreach ($fd['options'] ?? [] as $o) {
                            $matches = array_values(array_filter($live, function ($it) use ($fd, $o) {
                                $v = cc_field_clean($fd, $it['vals'][$fd['id']] ?? null, null);
                                return in_array($o['value'], (array)$v, true);
                            }));
                            if (!$matches) continue;
                            $archive($cs . '/filter/' . $fd['key'] . '/' . $o['value'] . '/', $fd['label'], $o['label'], '', $matches, $cs, $per, '');
                        }
                    }
                }
            }
        } catch (Throwable $e) { error_log('CanvasCore publish (archives): ' . $e->getMessage()); $warnings[] = 'Listing and archive pages could not be published (details in the server error log).'; }

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
            return ['success' => false, 'message' => 'Publish incomplete: ' . count($failed) . ' file(s) could not be written (check the folder permissions on the server), e.g. ' . basename(dirname($failed[0])) . '/' . basename($failed[0]) . '.'];
        } else {
            $msg = "Build successful: $count pages published." . ($removed ? " $removed old page(s) removed." : '');
            if ($warnings) $msg .= ' Warning: ' . implode(' ', $warnings);
            return ['success' => true, 'message' => $msg];
        }
    } catch (Throwable $e) {
        error_log('CanvasCore publish: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
        return ['success' => false, 'message' => 'Publishing failed because of a server error. Details are in the server error log.'];
    }
}

// ---------------------------------------------------------------------------
// Scheduled publishing. A page or an item can go live at a time (publish_at) and come down at a time (unpublish_at), in
// the server's local time. Each change is made once, then its time is cleared, so it cannot repeat. The site is published
// again after the changes. A page with unpublished edits waiting (status "modified") is left alone: publish it by hand.
// An address that another live page or item already uses is skipped and reported.
// ---------------------------------------------------------------------------
// A time as the schedule stores it ("YYYY-MM-DD HH:MM"), from the editor's value ("YYYY-MM-DDTHH:MM") or '' for none; false if invalid
function cc_schedule_clean($raw) {
    $s = trim(is_scalar($raw) ? (string)$raw : '');
    if ($s === '') return '';
    $s = str_replace('T', ' ', $s);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/', $s, $m)) return false;
    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[4] > 23 || (int)$m[5] > 59) return false;
    return $s;
}
// Is anything due? (cheap: run on each admin request)
function cc_schedules_pending(PDO $pdo) {
    $now = date('Y-m-d H:i');
    $st = $pdo->prepare("SELECT (SELECT COUNT(*) FROM collection_items WHERE (publish_at <> '' AND publish_at <= :n AND status = 'draft') OR (unpublish_at <> '' AND unpublish_at <= :n)) + (SELECT COUNT(*) FROM pages WHERE is_draft_copy = 0 AND ((publish_at <> '' AND publish_at <= :n AND status = 'draft') OR (unpublish_at <> '' AND unpublish_at <= :n)))");
    $st->execute([':n' => $now]);
    return (int)$st->fetchColumn() > 0;
}
// Makes the due changes, then publishes the site if anything changed. Returns what was done.
function cc_run_schedules(PDO $pdo, string $data_dir): array {
    $now = date('Y-m-d H:i');
    $changed = 0; $skipped = [];
    // items: go live (unless another live item has the address), then come down
    $due = $pdo->prepare("SELECT id, collection_id, slug, title FROM collection_items WHERE status = 'draft' AND publish_at <> '' AND publish_at <= ?");
    $due->execute([$now]);
    foreach ($due->fetchAll(PDO::FETCH_ASSOC) as $it) {
        $taken = $pdo->prepare("SELECT 1 FROM collection_items WHERE collection_id = ? AND status = 'published' AND slug = ? AND id <> ?");
        $taken->execute([$it['collection_id'], $it['slug'], $it['id']]);
        if ($taken->fetchColumn()) { $skipped[] = '"' . $it['title'] . '": another published item uses its address'; continue; }
        $pdo->prepare("UPDATE collection_items SET status = 'published', publish_at = '' WHERE id = ?")->execute([$it['id']]);
        $changed++;
    }
    $n = $pdo->prepare("UPDATE collection_items SET status = 'draft', unpublish_at = '' WHERE status = 'published' AND unpublish_at <> '' AND unpublish_at <= ?");
    $n->execute([$now]); $changed += $n->rowCount();
    $pdo->prepare("UPDATE collection_items SET unpublish_at = '' WHERE status = 'draft' AND unpublish_at <> '' AND unpublish_at <= ?")->execute([$now]);
    // pages: the same, for pages that have no unpublished edits waiting
    $due = $pdo->prepare("SELECT id, title, clean_slug FROM pages WHERE is_draft_copy = 0 AND status = 'draft' AND publish_at <> '' AND publish_at <= ?");
    $due->execute([$now]);
    foreach ($due->fetchAll(PDO::FETCH_ASSOC) as $pg) {
        $taken = $pdo->prepare("SELECT 1 FROM pages WHERE is_draft_copy = 0 AND status IN ('published', 'modified') AND clean_slug = ? AND id <> ?");
        $taken->execute([$pg['clean_slug'], $pg['id']]);
        if ($taken->fetchColumn()) { $skipped[] = 'page "' . $pg['title'] . '": another published page uses its address'; continue; }
        $pdo->prepare("UPDATE pages SET status = 'published', publish_at = '' WHERE id = ?")->execute([$pg['id']]);
        $changed++;
    }
    $n = $pdo->prepare("UPDATE pages SET status = 'draft', unpublish_at = '' WHERE is_draft_copy = 0 AND status = 'published' AND unpublish_at <> '' AND unpublish_at <= ?");
    $n->execute([$now]); $changed += $n->rowCount();
    $pdo->prepare("UPDATE pages SET unpublish_at = '' WHERE is_draft_copy = 0 AND status = 'draft' AND unpublish_at <> '' AND unpublish_at <= ?")->execute([$now]);
    $out = ['changed' => $changed, 'skipped' => $skipped, 'published' => null];
    if ($changed > 0) {
        $out['published'] = cc_publish_site($pdo, $data_dir, (string)cc_meta_get($pdo, 'site_base_dir', ''));
    }
    return $out;
}
