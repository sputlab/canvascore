<?php
// tests/server.php — server-side helpers checked through the real PHP code (npm run test:server):
// code kept on editors' saves, re-linking after a slug change, client address behind a proxy,
// SVG upload check, sanitizer, numbers, slider arrows and empty-text fallbacks.
require __DIR__ . '/../../canvascore-admin/compiler.php';
require_once __DIR__ . '/../../canvascore-admin/publish.php';
$fails = 0; $total = 0;
function check($name, $ok, $extra = '') { global $fails, $total; $total++; if ($ok) echo "  ✓ $name\n"; else { $fails++; echo "  ✗ $name" . ($extra !== '' ? "  → $extra" : '') . "\n"; } }

echo "\nEDITORS' SAVES KEEP ADMIN CODE\n";
$prev = [['id' => 'h1', 'type' => 'HTML', 'content' => ['code' => '<script>admin()</script>', 'customCss' => '__THIS__{color:red}']],
         ['id' => 'f1', 'type' => 'FORM', 'content' => ['email' => 'sales@site.com']],
         ['id' => 's1', 'type' => 'SECTION', 'content' => [], 'children' => [['id' => 'h2', 'type' => 'HTML', 'content' => ['code' => '<b>nested</b>']]]]];
$sent = [['id' => 'h1', 'type' => 'HTML', 'content' => ['code' => '<script>evil()</script>', 'customCss' => 'body{display:none}']],
         ['id' => 'f1', 'type' => 'FORM', 'content' => ['email' => 'attacker@evil.com']],
         ['id' => 'new', 'type' => 'HTML', 'content' => ['code' => '<script>new()</script>']],
         ['id' => 's1', 'type' => 'SECTION', 'content' => [], 'children' => [['id' => 'h2', 'type' => 'HTML', 'content' => ['code' => 'changed']]]]];
cc_keep_code_surfaces($sent, json_encode($prev));
check('an existing Custom HTML block keeps the admin code (not wiped, not replaced)', $sent[0]['content']['code'] === '<script>admin()</script>');
check('…and its custom CSS', $sent[0]['content']['customCss'] === '__THIS__{color:red}');
check('a form keeps the receiving email set by an admin', $sent[1]['content']['email'] === 'sales@site.com');
check('code in a NEW block from an editor is not accepted', $sent[2]['content']['code'] === '');
check('nested blocks too', $sent[3]['children'][0]['content']['code'] === '<b>nested</b>');

echo "\nRE-LINKING AFTER A SLUG CHANGE\n";
$tree = [['type' => 'BUTTON', 'content' => ['url' => 'about/index.html']],
         ['type' => 'HERO', 'content' => ['buttons' => [['url' => 'about/index.html'], ['url' => 'about-us/index.html']]]],
         ['type' => 'TEXT', 'content' => ['text' => '<a href="{{BASE_URL}}about/">x</a> <a href="{{BASE_URL}}about-us/">y</a>']]];
$changed = cc_relink_node($tree, 'about/index.html', 'company/index.html', '{{BASE_URL}}about/', '{{BASE_URL}}company/');
check('button and hero links follow the new address', $changed && $tree[0]['content']['url'] === 'company/index.html' && $tree[1]['content']['buttons'][0]['url'] === 'company/index.html');
check('links typed in text follow too', strpos($tree[2]['content']['text'], '{{BASE_URL}}company/') !== false);
check('similar addresses are left alone (about-us)', $tree[1]['content']['buttons'][1]['url'] === 'about-us/index.html' && strpos($tree[2]['content']['text'], '{{BASE_URL}}about-us/') !== false);

echo "\nCLIENT ADDRESS BEHIND A PROXY\n";
$_SERVER['REMOTE_ADDR'] = '10.0.0.2'; $_SERVER['HTTP_X_FORWARDED_FOR'] = '1.2.3.4, 10.0.0.9';
check('without trusted proxies the connecting address is used', cc_client_ip([]) === '10.0.0.2');
check('from a trusted proxy, the nearest untrusted forwarded address is used', cc_client_ip(['10.0.0.2', '10.0.0.9']) === '1.2.3.4');
$_SERVER['REMOTE_ADDR'] = '5.6.7.8';
check('a client can\'t fake its address with the header', cc_client_ip(['10.0.0.2']) === '5.6.7.8');

echo "\nUPLOADS AND SANITIZER\n";
$tmp = sys_get_temp_dir() . '/cc_svg_test_' . getmypid() . '.svg';
file_put_contents($tmp, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>');
check('a plain SVG is accepted', cc_svg_is_safe($tmp));
file_put_contents($tmp, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
check('an SVG with an event handler is refused', !cc_svg_is_safe($tmp));
@unlink($tmp);
check('javascript: hidden behind a control character is removed', strpos(cc_sanitize_html("<a href=\"\x1fjavascript:alert(1)\">x</a>"), 'javascript') === false);

echo "\nSECURITY HELPERS\n";
check('rich text styles keep typography, drop positioning, url() and expressions', cc_sanitize_style('color:red; position:fixed; background:url(x); width:expression(1); text-align:center') === 'color: red; text-align: center');
check('rich text: a link to a new tab gets rel=noopener', strpos(cc_sanitize_html('<a href="https://x.com" target="_blank">x</a>'), 'rel="noopener noreferrer"') !== false);
check('rich text: event handlers, scripts and svg are gone', cc_sanitize_html('<p onclick="x()">a</p><script>x()</script><svg onload=x()></svg>') === '<p>a</p>');
$b = [['type' => 'TEXT', 'content' => ['text' => '<img src=x onerror=alert(1)>']], ['type' => 'SECTION', 'content' => [], 'children' => [['type' => 'TABS', 'content' => ['items' => [['content' => '<b onmouseover=x>t</b>']]]]]],
      ['type' => 'BUTTON', 'content' => ['url' => " java\tscript:alert(1)"]], ['type' => 'HTML', 'content' => ['code' => '<a href="javascript:void(0)">admin</a>']]];
cc_sanitize_blocks($b);
check('saved blocks: rich text cleaned, nested too', strpos(json_encode($b), 'onerror') === false && strpos(json_encode($b), 'onmouseover') === false);
$arr = [['type' => 'TEXT', 'content' => ['text' => ['<img src=x onerror=1>']]], ['type' => 'TABS', 'content' => ['items' => [['content' => ['<b onclick=1>x</b>']]]]]];
cc_sanitize_blocks($arr);
check('saved blocks: a rich-text field sent as an array instead of text is dropped (never stored unchecked)', $arr[0]['content']['text'] === '' && $arr[1]['content']['items'][0]['content'] === '');
check('saved blocks: active URLs blanked, an admin\'s Custom HTML untouched', $b[2]['content']['url'] === '' && $b[3]['content']['code'] === '<a href="javascript:void(0)">admin</a>');
check('reserved folders: no page, collection or redirect there', cc_slug_reserved('canvascore-admin') && cc_slug_reserved('Uploads') && cc_redirect_path('/canvascore-admin/') === null && cc_redirect_path('/blog/x/') === '/blog/x/');
check('redirect targets: no spaces, line breaks or backslashes', cc_redirect_target("https://e.com/a\nb") === null && cc_redirect_target('https://e.com/a b') === null && cc_redirect_target('https://e.com/a') === 'https://e.com/a');
check('CSS values: colors and lengths only', cc_css_color('red;}x{', '#fff') === '#fff' && cc_css_color('#123abc', '#fff') === '#123abc' && cc_css_length('1200px', 'x') === '1200px' && cc_css_length('1px;}', 'd') === 'd');
check('image URLs: javascript: and data:text are dropped, http(s), paths and raster data kept', cc_img_url(" JAVA\tSCRIPT:x") === '' && cc_img_url('data:text/html,x') === '' && cc_img_url('/uploads/a.png') === '/uploads/a.png' && cc_img_url('data:image/png;base64,AA') !== '');
check('inline styles of blocks: one value per property', build_inline_style(['color' => 'red; position:fixed', 'marginTop' => '4px']) === 'margin-top: 4px; ');

echo "\nGLOBAL COLOURS\n";
$pal = cc_palette(['brandColor' => '#ff0000', 'colors' => [['id' => 'accent', 'name' => 'Gold', 'value' => '#FFD700'], ['id' => 'sale', 'name' => '<b>Sale</b>', 'value' => '#e11d48'],
    ['id' => 'Bad Id', 'value' => '#000'], ['id' => 'x', 'value' => 'red;}body{'], ['id' => 'accent', 'value' => '#111111']]]);
check('palette: the five built-in colours first (primary = the brand colour), then valid custom ones', implode(',', array_column($pal, 'id')) === 'primary,secondary,accent,text,background,sale' && $pal[0]['value'] === '#ff0000' && $pal[2]['name'] === 'Gold' && $pal[2]['value'] === '#ffd700', json_encode($pal));
check('…names lose markup, values are hex only, a duplicate id is ignored', $pal[5]['name'] === 'bSale/b' && !strpos(json_encode($pal), 'red;'));
check('…as CSS variables for :root', strpos(cc_palette_css($pal), '--cc-color-accent: #ffd700;') !== false && strpos(cc_palette_css($pal), '--cc-color-sale: #e11d48;') !== false);
check('colour references are accepted where colours are validated', cc_css_color('var(--cc-color-accent, #ffd700)', 'x') === 'var(--cc-color-accent, #ffd700)' && cc_css_color('var(--cc-color-accent, red;})', 'x') === 'x' && cc_is_color_ref('var(--brand-color, #3b82f6)') && !cc_is_color_ref('var(--evil)'));
check('rich text keeps the site colour and global colours, never another var()', cc_sanitize_html('<p><span style="color: var(--brand-color, #3b82f6)">a</span><span style="color: var(--cc-color-accent, #ffd700); background: var(--evil)">b</span></p>') === '<p><span style="color: var(--brand-color, #3b82f6)">a</span><span style="color: var(--cc-color-accent, #ffd700)">b</span></p>');

echo "\nTEXT STYLES\n";
$typo = cc_typography(['typography' => ['h1' => ['font' => 'Poppins', 'size' => '3rem', 'weight' => '700', 'lineHeight' => '1.1', 'tablet' => ['size' => '2.4rem'], 'mobile' => ['size' => 'bogus', 'font' => 'Comic Sans']],
    'body' => ['font' => 'Comic Sans', 'size' => '17px'], 'unknown' => ['size' => '9px']]]);
// the same literal as the JavaScript test (ui-shell.mjs), so the two agree on what is kept
check('text styles: only known presets, fonts and values are kept; tablet and phone are overrides', json_encode($typo) === '{"h1":{"font":"Poppins","size":"3rem","weight":"700","lineHeight":"1.1","tablet":{"size":"2.4rem"}},"body":{"size":"17px"}}', json_encode($typo));
$tcss = cc_type_css($typo);
check('text styles as CSS: variables on :root, the elements use them, tablet overrides in a media query', strpos($tcss, ':root{--cc-type-h1-font: \'Poppins\', sans-serif;') === 0
    && strpos($tcss, 'h1{font-family: var(--cc-type-h1-font); font-size: var(--cc-type-h1-size);') !== false && strpos($tcss, '@media(max-width:1024px){:root{--cc-type-h1-size: 2.4rem; }h1{font-size: var(--cc-type-h1-size); }}') !== false
    && strpos($tcss, 'body{font-size: var(--cc-type-body-size); }') !== false, $tcss);
check('text styles: a preset that is not set makes no CSS', cc_type_css([]) === '');
$blk = cc_with_text_preset(['textPreset' => 'h2', 'fontSize' => '', 'color' => 'red']);
check('a block with a text preset gets the preset variables; its own values win, emptied ones fall back', json_encode($blk) === '{"fontFamily":"var(--cc-type-h2-font)","fontSize":"var(--cc-type-h2-size)","fontWeight":"var(--cc-type-h2-weight)","lineHeight":"var(--cc-type-h2-line)","color":"red"}', json_encode($blk));
check('…an unknown text preset is ignored (and never printed as a CSS property)', cc_with_text_preset(['textPreset' => 'nope', 'color' => 'red']) === ['color' => 'red']);

echo "\nBUTTON AND FIELD STYLES\n";
$kit = cc_kit(['buttonStyles' => ['primary' => ['bg' => '#112233', 'text' => 'red;}body{', 'radius' => '999px'], 'outline' => ['border' => 'var(--cc-color-accent, #f59e0b)', 'bg' => 'transparent'], 'nope' => ['bg' => '#000']],
    'fieldStyle' => ['bg' => '#fafafa', 'border' => 'javascript:x', 'radius' => '4px;']]);
// the same literals as the JavaScript test (ui-shell.mjs)
check('button presets and field style: only valid values are kept, in a fixed order', json_encode($kit) === '{"buttons":{"primary":{"bg":"#112233","radius":"999px"},"outline":{"bg":"transparent","border":"var(--cc-color-accent, #f59e0b)"}},"field":{"bg":"#fafafa"}}', json_encode($kit));
check('a button that picks a preset gets its variables, with the built-in look as fallback', cc_button_preset_css('primary') === "background: var(--cc-btn-primary-bg, var(--brand-color, #3b82f6)); color: var(--cc-btn-primary-text, #ffffff); border: 2px solid var(--cc-btn-primary-border, transparent); border-radius: var(--cc-btn-primary-radius, 6px); " && cc_button_preset_css('nope') === '');
check('the site\'s button presets and field style as CSS variables (only the values that are set)', cc_kit_css($kit, ':root') === ':root{--cc-btn-primary-bg: #112233; --cc-btn-primary-radius: 999px; --cc-btn-outline-bg: transparent; --cc-btn-outline-border: var(--cc-color-accent, #f59e0b); --cc-field-bg: #fafafa;}' && cc_kit_css(cc_kit([]), ':root') === '');

echo "\nCUSTOM FIELDS\n";
$fpdo = new PDO('sqlite::memory:');
$fpdo->exec("CREATE TABLE collections (id TEXT, name TEXT, slug TEXT, fields TEXT)");
$fpdo->exec("CREATE TABLE collection_items (id TEXT, collection_id TEXT, title TEXT, slug TEXT, status TEXT, archived INTEGER, field_values TEXT)");
$fpdo->exec("INSERT INTO collections VALUES ('team','Team','team','[]')");
$fpdo->exec("INSERT INTO collection_items VALUES ('ada','team','Ada','ada','published',0,'{}')");
$fdefs = cc_field_defs([
    ['id' => 't1', 'key' => 'name', 'label' => 'Name', 'type' => 'text', 'required' => true],
    ['id' => 'r1', 'key' => 'body', 'label' => 'Body', 'type' => 'richtext'],
    ['id' => 'n1', 'key' => 'price', 'label' => 'Price', 'type' => 'number'],
    ['id' => 'd1', 'key' => 'when', 'label' => 'When', 'type' => 'date'],
    ['id' => 'g1', 'key' => 'pic', 'label' => 'Pic', 'type' => 'image'],
    ['id' => 'g2', 'key' => 'gal', 'label' => 'Gallery', 'type' => 'gallery'],
    ['id' => 'l1', 'key' => 'site', 'label' => 'Site', 'type' => 'link'],
    ['id' => 'c1', 'key' => 'tier', 'label' => 'Tier', 'type' => 'choice', 'multiple' => true, 'options' => [['value' => 'gold', 'label' => 'Gold'], ['value' => 'silver', 'label' => 'Silver']]],
    ['id' => 'x1', 'key' => 'lead', 'label' => 'Lead', 'type' => 'reference', 'target' => 'team'],
], $fpdo);
check('custom fields: all nine types are kept, in order', implode(',', array_column($fdefs, 'type')) === 'text,richtext,number,date,image,gallery,link,choice,reference', implode(',', array_column($fdefs, 'type')));
check('custom fields: a bad id, key or type, a duplicate key and a choice without a valid value are dropped', count(cc_field_defs([
    ['id' => 'BAD ID', 'key' => 'ok', 'type' => 'text'], ['id' => 'a', 'key' => 'Bad Key', 'type' => 'text'], ['id' => 'b', 'key' => 'ok', 'type' => 'script'],
    ['id' => 'c', 'key' => 'dup', 'type' => 'text'], ['id' => 'd', 'key' => 'dup', 'type' => 'text'],
    ['id' => 'e', 'key' => 'opts', 'type' => 'choice', 'options' => [['value' => 'Not Valid', 'label' => 'x'], ['value' => 'ok-one', 'label' => 'One']]],
], $fpdo)) === 2);
check('custom fields: a reference to a collection that does not exist loses its target', cc_field_defs([['id' => 'r', 'key' => 'r', 'type' => 'reference', 'target' => 'nope']], $fpdo)[0]['target'] === '');
$fraw = ['t1' => '  <b>Ada</b>  ', 'r1' => '<p>ok</p><script>x()</script>', 'n1' => '12.5', 'd1' => '2026-02-30', 'g1' => 'javascript:alert(1)',
    'g2' => ['a.jpg', 'javascript:x', 'b.png'], 'l1' => ['url' => 'javascript:alert(1)', 'text' => 'Bad'], 'c1' => ['gold', 'bronze'], 'x1' => 'ada'];
[$fvals, $fmiss] = cc_field_values($fdefs, $fraw, $fpdo, false);
check('custom field values: rich text loses its script, a bad date and a javascript image are emptied', strpos($fvals['r1'], 'script') === false && $fvals['d1'] === '' && $fvals['g1'] === '' && $fvals['n1'] === 12.5, json_encode([$fvals['r1'], $fvals['d1'], $fvals['g1']]));
check('custom field values: a gallery keeps its valid images; a link keeps no javascript address; a choice keeps only its options', $fvals['g2'] === ['a.jpg', 'b.png'] && $fvals['l1']['url'] === '' && $fvals['l1']['text'] === 'Bad' && $fvals['c1'] === ['gold'], json_encode([$fvals['g2'], $fvals['l1'], $fvals['c1']]));
check('custom field values: a reference keeps an item of its collection', $fvals['x1'] === 'ada');
[, $fmiss2] = cc_field_values($fdefs, ['t1' => ''], $fpdo, true);
check('a required field left empty blocks a publish (named), but not a draft', $fmiss2 === ['Name'] && $fmiss === []);
check('a link is only kept as a web address, mail, phone or a path of this site', cc_field_link('https://example.com/a') === 'https://example.com/a' && cc_field_link('mailto:a@b.c') === 'mailto:a@b.c' && cc_field_link('chi-siamo/index.html') === 'chi-siamo/index.html' && cc_field_link('data:text/html,x') === '' && cc_field_link('java script:x') === '');
// The Item Field block: the value of the item being published, escaped; nothing without an item
$fitems = ['ada' => ['title' => 'Ada <Lovelace>', 'slug' => 'ada', 'col_slug' => 'team', 'live' => true]];
cc_item_context(['defs' => array_combine(array_column($fdefs, 'id'), $fdefs), 'values' => array_merge($fvals, ['t1' => '"><img onerror=x>']), 'items' => $fitems]);
$fpage = cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 'n1', 'showLabel' => true, 'decimals' => 2]]);
check('the Item Field block shows its field with the label, rounded as asked', strpos($fpage, 'cc-field-label">Price<') !== false && strpos($fpage, '12.50') !== false, $fpage);
$fesc = cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 't1']]);
check('…and escapes a value (no markup from a visitor-facing text)', strpos($fesc, '<img onerror') === false && strpos($fesc, '&quot;&gt;&lt;img') !== false, $fesc);
$fref = cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 'x1']]);
check('…a reference links to the item it points to, on the published site', strpos($fref, 'href="{{BASE_URL}}team/ada/"') !== false && strpos($fref, 'Ada &lt;Lovelace&gt;') !== false, $fref);
check('…and a field that is empty or unknown shows nothing', cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 'g1']]) === '' && cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 'zzz']]) === '');
cc_item_context(null);
check('…and on a page that is not a collection item it shows nothing', cc_render_item_field(['type' => 'ITEM_FIELD', 'content' => ['field' => 't1']]) === '');

echo "\nLISTS, SORT AND FILTER, STRUCTURED DATA\n";
$ldefs = ['p' => ['id' => 'p', 'key' => 'price', 'label' => 'Price', 'type' => 'number'], 'tier' => ['id' => 'tier', 'key' => 'tier', 'label' => 'Tier', 'type' => 'choice', 'multiple' => false,
    'options' => [['value' => 'gold', 'label' => 'Gold'], ['value' => 'silver', 'label' => 'Silver']]]];
$litems = [['title' => 'B', 'date' => '2026-01-02', 'vals' => ['p' => '30', 'tier' => 'gold']], ['title' => 'a', 'date' => '', 'vals' => []], ['title' => 'C', 'date' => '2026-01-01', 'vals' => ['p' => '5', 'tier' => 'silver']]];
$names = function ($xs) { return implode(',', array_column($xs, 'title')); };
check('sort by a number: ascending and descending, with the items that have no value last', $names(cc_sort_items($litems, 'p', false, $ldefs)) === 'C,B,a' && $names(cc_sort_items($litems, 'p', true, $ldefs)) === 'B,C,a', $names(cc_sort_items($litems, 'p', false, $ldefs)));
check('sort by title (any case) and by date; no sort keeps the order given', $names(cc_sort_items($litems, 'title', false, $ldefs)) === 'a,B,C' && $names(cc_sort_items($litems, 'date', false, $ldefs)) === 'C,B,a' && $names(cc_sort_items($litems, '', false, $ldefs)) === 'B,a,C');
$lopts = cc_list_options(['showCover' => false, 'cardFields' => ['p', 'nope'], 'showDate' => false], $ldefs, ['items' => []], 'grid', 'tier');
$lcards = cc_list_cards([$litems[0]], 'team', $lopts);
check('a card shows its chosen fields (label and value), and carries its choices for the filter', strpos($lcards, '>Price</span>') !== false && strpos($lcards, '>30</div>') !== false && strpos($lcards, 'data-cc-filter="gold"') !== false, $lcards);
check('a card without the filter has no filter attribute, and an unknown card field shows nothing', strpos(cc_list_cards([$litems[0]], 'team', cc_list_options([], $ldefs, ['items' => []], 'grid', '')), 'data-cc-filter') === false && strpos(cc_list_cards([$litems[0]], 'team', cc_list_options(['cardFields' => ['zzz']], $ldefs, ['items' => []], 'grid', '')), 'cc-cl-field') === false);
$lui = cc_list_filter_ui('lst1', $ldefs['tier']);
check('the filter gives an All button and one per choice, and a script that hides the cards that do not match', strpos($lui, 'data-cc-filter-value="silver"') !== false && strpos($lui, 'data-cc-filter-value=""') !== false && strpos($lui, '<script>') !== false && strpos($lui, "getElementById('lst1')") !== false);
check('no filter for a field that is not a choice', cc_list_filter_ui('x', $ldefs['p']) === '');
$schema_defs = [['id' => 'ph', 'key' => 'photo', 'label' => 'Photo', 'type' => 'image'], ['id' => 'pr', 'key' => 'price', 'label' => 'Price', 'type' => 'number'], ['id' => 'de', 'key' => 'de', 'label' => 'D', 'type' => 'richtext']];
$sc = cc_schema_clean(['type' => 'Product', 'map' => ['image' => 'ph', 'price' => 'de', 'description' => 'de', 'sku' => 'pr', 'nope' => 'ph'], 'currency' => 'eur'], $schema_defs);
check('structured data: a property takes only a field of its type, and the currency is an ISO code (lower case is accepted)', $sc === ['type' => 'Product', 'map' => ['image' => 'ph', 'description' => 'de'], 'currency' => 'EUR'] && cc_schema_clean(['type' => 'Product', 'currency' => 'EU'], $schema_defs)['currency'] === '', json_encode($sc));
check('structured data: an unknown type is no structured data', cc_schema_clean(['type' => 'Recipe'], $schema_defs)['type'] === '');
$pscope = cc_item_jsonld(['type' => 'Product', 'map' => ['image' => 'ph', 'price' => 'pr', 'description' => 'de'], 'currency' => 'EUR'], [],
    ['ph' => 'https://x.test/a.jpg', 'pr' => 12.5, 'de' => '<p>Fine &amp; <b>warm</b></p></script><script>alert(1)</script>'], 'Tea </script> cup', 'https://x.test/tea/', function ($u) { return $u; });
preg_match('#<script type="application/ld\+json">(.*)</script>#s', $pscope, $pm);
$pld = json_decode($pm[1] ?? '', true);
check('a Product page gets JSON-LD with its name, image, price and currency, and the script tag is never closed early', $pld && $pld['@type'] === 'Product' && $pld['name'] === 'Tea </script> cup' && $pld['offers']['price'] === 12.5 && $pld['offers']['priceCurrency'] === 'EUR' && $pld['image'] === 'https://x.test/a.jpg' && substr_count($pscope, '</script>') === 1, $pscope);
check('…the description is text, not markup', $pld && $pld['description'] === 'Fine & warm alert(1)' || ($pld && strpos($pld['description'], '<') === false), json_encode($pld['description'] ?? null));
$escope = cc_item_jsonld(['type' => 'Event', 'map' => ['startDate' => 'sd', 'location' => 'lo'], 'currency' => ''], [], ['sd' => '2026-11-03', 'lo' => 'Milan Hall'], 'Talk', '', function ($u) { return $u; });
check('an Event page gets its start date and location; no offers', strpos($escope, '"startDate":"2026-11-03"') !== false && strpos($escope, '"@type":"Place"') !== false && strpos($escope, 'offers') === false, $escope);
check('an item without a schema gets no JSON-LD', cc_item_jsonld([], [], [], 'x', '', 'strval') === '');

echo "\nDYNAMIC VALUES\n";
$bdefs = [['id' => 't1', 'key' => 'name', 'type' => 'text', 'label' => 'Name'], ['id' => 'n1', 'key' => 'price', 'type' => 'number', 'label' => 'Price'],
    ['id' => 'd1', 'key' => 'when', 'type' => 'date', 'label' => 'When'], ['id' => 'l1', 'key' => 'site', 'type' => 'link', 'label' => 'Site'],
    ['id' => 'c1', 'key' => 'tier', 'type' => 'choice', 'label' => 'Tier', 'multiple' => true, 'options' => [['value' => 'gold', 'label' => 'Gold'], ['value' => 'silver', 'label' => 'Silver']]],
    ['id' => 'x1', 'key' => 'lead', 'type' => 'reference', 'label' => 'Lead', 'target' => 'c2']];
$bctx = ['defs' => $bdefs, 'values' => ['t1' => '<b>Ada</b> & co', 'n1' => 12.5, 'd1' => '2026-10-19', 'l1' => ['url' => 'chi-siamo/index.html', 'text' => 'About'], 'c1' => ['gold', 'silver'], 'x1' => 'i9'],
    'items' => ['i9' => ['title' => 'Ada L.', 'slug' => 'ada', 'col_slug' => 'team', 'live' => true]], 'item' => 'i1',
    'page' => ['title' => 'Ada "L"', 'excerpt' => '', 'date' => '2026-10-19', 'url' => '{{BASE_URL}}team/ada/']];
$btpl = 'Hi {{field:name}}, {{field:price}} on {{field:when}}. {{field:site}} / {{field:site.text}} / {{field:tier}} / {{field:lead}} {{field:lead.url}} | {{item:title}} {{item:date}} {{field:missing}} {{item:url}}';
// the same literal as the JavaScript test (ui-shell.mjs)
check('dynamic values: fields, item and reference tokens become the item\'s values, escaped', cc_bind_deep($btpl, $bctx) === 'Hi &lt;b&gt;Ada&lt;/b&gt; &amp; co, 12.5 on October 19, 2026. {{BASE_URL}}chi-siamo/ / About / Gold, Silver / Ada L. {{BASE_URL}}team/ada/ | Ada &quot;L&quot; October 19, 2026  {{BASE_URL}}team/ada/', cc_bind_deep($btpl, $bctx));
check('dynamic values: outside an item they are removed (a visitor never sees a placeholder)', cc_bind_deep($btpl, null) === 'Hi ,  on .  /  /  /   |    ');
check('dynamic values: every string of a block\'s content is bound, keys kept', json_encode(cc_bind_deep(['text' => '{{field:price}}', 'nested' => ['a' => '{{item:title}}'], 'n' => 3], $bctx)) === '{"text":"12.5","nested":{"a":"Ada &quot;L&quot;"},"n":3}');
check('dynamic values: a page without tokens is left as it is', cc_bind_deep('plain text', $bctx) === 'plain text');

echo "\nCATEGORIES AND TAGS\n";
$tax = cc_taxonomies_clean([
    ['id' => 'cat', 'name' => 'Category', 'slug' => 'Category', 'multiple' => false, 'terms' => [['id' => 'news', 'name' => 'News', 'slug' => '', 'description' => '<b>x</b>'], ['id' => 'news2', 'name' => 'News!', 'slug' => 'news'], ['id' => 'feed', 'name' => 'Feed', 'slug' => 'feed']]],
    ['name' => 'Tags', 'terms' => [['id' => 'red', 'name' => 'Red']]],
    ['name' => 'Feed', 'slug' => 'feed'],
    ['name' => 'category', 'slug' => 'category'],
]);
check('taxonomies: names and addresses are tidy and unique; a reserved address is refused; several terms are the default', count($tax) === 2 && $tax[0]['slug'] === 'category' && $tax[1]['multiple'] === true && $tax[0]['multiple'] === false, json_encode($tax));
check('taxonomies: a term keeps its name; its address is made from the name when it is left out; a duplicate address is dropped', $tax[0]['terms'][0]['slug'] === 'news' && count($tax[0]['terms']) === 1 && $tax[0]['terms'][0]['description'] === 'x', json_encode($tax[0]['terms']));
check('taxonomies: a term with a bad id gets a new one, and the term id is kept when it is good', $tax[0]['terms'][0]['id'] === 'news' && strlen($tax[1]['terms'][0]['id']) >= 1, json_encode($tax[1]['terms']));
$tpdo = new PDO('sqlite::memory:');
$tpdo->exec("CREATE TABLE collection_taxonomies (id TEXT PRIMARY KEY, collection_id TEXT, name TEXT, slug TEXT, multiple INTEGER, position INTEGER)");
$tpdo->exec("CREATE TABLE collection_terms (id TEXT PRIMARY KEY, taxonomy_id TEXT, collection_id TEXT, name TEXT, slug TEXT, description TEXT, position INTEGER)");
$tpdo->exec("INSERT INTO collection_taxonomies VALUES ('cat','blog','Category','category',0,0),('tags','blog','Tags','tags',1,1)");
$tpdo->exec("INSERT INTO collection_terms VALUES ('news','cat','blog','News','news','',0),('tech','cat','blog','Tech','tech','',1),('red','tags','blog','Red','red','',0),('other','cat','shop','Other','other','',0)");
check('item terms: only terms of its own collection, one term for a single-term taxonomy, and several for a multiple one', json_encode(cc_terms_clean(['cat' => ['news', 'tech'], 'tags' => ['red', 'other'], 'nope' => ['x']], $tpdo, 'blog')) === '{"cat":["news"],"tags":["red"]}', json_encode(cc_terms_clean(['cat' => ['news', 'tech'], 'tags' => ['red', 'other']], $tpdo, 'blog')));
$tterms = ['news' => ['name' => 'News', 'slug' => 'news', 'tax_id' => 'cat', 'tax_name' => 'Category', 'tax_slug' => 'category', 'col_slug' => 'blog']];
$tctx = ['item_terms' => ['cat' => ['news']], 'terms' => $tterms, 'item_archived' => false];
cc_item_context($tctx);
$tblock = cc_render_item_terms(['type' => 'ITEM_TERMS', 'content' => ['taxonomy' => '', 'separator' => ' | ']]);
check('the Categories & tags block links each term to its listing page, with the taxonomy named', strpos($tblock, 'href="{{BASE_URL}}blog/category/news/"') !== false && strpos($tblock, 'Category: ') !== false, $tblock);
cc_item_context(array_merge($tctx, ['item_archived' => true]));
check('…an archived item shows its terms without links', strpos(cc_render_item_terms(['type' => 'ITEM_TERMS', 'content' => []]), '<a') === false);
cc_item_context(null);
check('…and nothing outside an item', cc_render_item_terms(['type' => 'ITEM_TERMS', 'content' => []]) === '');
$tcard = cc_term_page_inner('Category', 'News <b>', 'About news', '<a>card</a>');
check('a term page names its taxonomy and term (escaped) and holds the cards', strpos($tcard, 'News &lt;b&gt;') !== false && strpos($tcard, '<a>card</a>') !== false && strpos($tcard, '<b>') === false);
check('a taxonomy page lists its terms with their counts', strpos(cc_taxonomy_index_inner('Category', [['name' => 'News', 'description' => '', 'count' => 3, 'href' => '/blog/category/news/']]), '(3)') !== false);

echo "\nLISTING AND ARCHIVE SETTINGS\n";
check('archive settings: the page size is kept within 3 to 50, and every archive is on by default', cc_archive_clean([]) === ['perPage' => 12, 'years' => true, 'filters' => true, 'sorts' => true]
    && cc_archive_clean(['perPage' => 1])['perPage'] === 3 && cc_archive_clean(['perPage' => 999])['perPage'] === 50 && cc_archive_clean(['perPage' => 'x'])['perPage'] === 12);
check('archive settings: an archive that is switched off stays off', cc_archive_clean(['years' => false, 'sorts' => 0])['years'] === false && cc_archive_clean(['years' => false, 'sorts' => 0])['sorts'] === false && cc_archive_clean(['filters' => false])['filters'] === false);
check('pagination: the first page is the address, the next ones are in page/N/; the links go to the page before and after', cc_archive_nav('blog/', 1, 1) === '' && strpos(cc_archive_nav('blog/', 2, 3), 'href="{{BASE_URL}}blog/"') !== false && strpos(cc_archive_nav('blog/', 2, 3), 'href="{{BASE_URL}}blog/page/3/"') !== false && strpos(cc_archive_nav('blog/', 2, 3), 'Page 2 of 3') !== false);
check('the browse links group the sorts, years and filters, and nothing is empty', strpos(cc_archive_browse_html([['Years', [['2026', 'blog/2026/']]], ['Sort', []]]), 'blog/2026/') !== false && strpos(cc_archive_browse_html([['Sort', []]]), 'cc-archive-browse') === false);
check('an archive page carries its kind, title and description (escaped), and its cards', strpos(cc_archive_page_inner('Year', 'A <b>', 'Desc', '<a>card</a>', '', ''), 'A &lt;b&gt;') !== false && strpos(cc_archive_page_inner('Year', 'T', '', '<a>card</a>', '', ''), '<a>card</a>') !== false);

echo "\nSCHEDULED PUBLISHING: TIMES\n";
check('a schedule time takes the editor\'s value, or a stored one, and nothing else', cc_schedule_clean('2026-11-03T09:30') === '2026-11-03 09:30' && cc_schedule_clean('2026-11-03 09:30') === '2026-11-03 09:30' && cc_schedule_clean('') === '');
check('…an impossible date or time is refused', cc_schedule_clean('2026-02-30T10:00') === false && cc_schedule_clean('2026-11-03T25:00') === false && cc_schedule_clean('tomorrow') === false && cc_schedule_clean('2026-11-03T09:60') === false);

echo "\nUPDATING AN EXISTING SITE (migration 8)\n";
require_once __DIR__ . '/../../canvascore-admin/migrations.php';
$mf = sys_get_temp_dir() . '/cc_mig_' . getmypid() . '.sqlite'; @unlink($mf);
$mdb = new PDO('sqlite:' . $mf); $mdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
cc_migrate($mdb);
$mdb->exec("DROP INDEX IF EXISTS idx_admin_username"); $mdb->exec("DELETE FROM cc_meta WHERE key = 'installed_at'"); cc_meta_set($mdb, 'db_schema', 7);
$mdb->prepare("INSERT INTO admin (username, password_hash, role, must_change_pw) VALUES ('admin', ?, 'admin', 1), ('owner', ?, 'admin', 0)")->execute([password_hash('admin', PASSWORD_DEFAULT), password_hash('Owner-pass-1', PASSWORD_DEFAULT)]);
$mdb->exec("INSERT INTO pages (id, title, slug, clean_slug, content_json, status) VALUES ('p', 'P', 'p', 'p', '[{\"type\":\"TEXT\",\"content\":{\"text\":\"<img src=x onerror=alert(1)>ok\"}}]', 'draft')");
cc_migrate($mdb);
check('the old default admin/admin account is removed once a real account exists', $mdb->query("SELECT group_concat(username) FROM admin")->fetchColumn() === 'owner');
check('a site set up before the wizard counts as installed', (bool)cc_is_installed($mdb));
check('rich text already stored is cleaned', strpos((string)$mdb->query("SELECT content_json FROM pages WHERE id = 'p'")->fetchColumn(), 'onerror') === false);
check('accounts get a session generation, and user names become unique', cc_col_exists($mdb, 'admin', 'session_gen') && (bool)$mdb->query("SELECT 1 FROM sqlite_master WHERE name = 'idx_admin_username'")->fetchColumn());
$mdb = null; @unlink($mf);

echo "\nBLOCK OUTPUT\n";
check('whole numbers like parseInt', cc_int('7px', 2, 1, 12) === 7 && cc_int('abc', 2, 1, 12) === 2 && cc_int(99, 2, 1, 12) === 12);
$sl = render_block(['id' => 'sl', 'type' => 'SLIDER', 'styles' => [], 'content' => ['effect' => 'fade', 'autoplay' => false, 'images' => [['src' => 'a.jpg'], ['src' => 'b.jpg']]]]);
check('a slider with 2+ images has previous/next arrows (fade without autoplay can be browsed)', strpos($sl, 'aria-label="Previous slide"') !== false && strpos($sl, 'aria-label="Next slide"') !== false);
check('…and its script respects reduced motion', strpos($sl, 'prefers-reduced-motion') !== false);
$one = render_block(['id' => 'sl1', 'type' => 'SLIDER', 'styles' => [], 'content' => ['images' => [['src' => 'a.jpg']]]]);
check('one image: no arrows', strpos($one, 'cc-slider-prev') === false);
$f = render_block(['id' => 'f', 'type' => 'FORM', 'styles' => [], 'content' => ['btnText' => '', 'successMsg' => '', 'fields' => [['label' => 'Phone', 'type' => 'tel']]]]);
check('an emptied button text falls back to "Send Message", the message to "Sent!"', strpos($f, '>Send Message</button>') !== false && strpos($f, 'value="Sent!"') !== false);
check('phone fields are real tel inputs', strpos($f, 'type="tel"') !== false);

echo "\nREVISION HISTORY\n";
$_SESSION['username'] = 'ann';
$db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
require_once __DIR__ . '/../../canvascore-admin/migrations.php';
foreach (cc_db_migrations() as $v => $m) if ($v === 6) $m($db);
cc_add_revision($db, 'p1', 'Home', '[1]', 'draft');
cc_add_revision($db, 'p1', 'Home', '[1]', 'draft');
check('a save without changes adds no version', (int)$db->query("SELECT COUNT(*) FROM page_revisions")->fetchColumn() === 1);
for ($i = 2; $i <= 45; $i++) cc_add_revision($db, 'p1', 'Home', "[$i]", $i % 2 ? 'draft' : 'published');
check('only the newest 40 versions are kept', (int)$db->query("SELECT COUNT(*) FROM page_revisions WHERE owner='p1'")->fetchColumn() === 40);
$newest = $db->query("SELECT content_json, author FROM page_revisions ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('…the latest one included, with its author', $newest['content_json'] === '[45]' && $newest['author'] === 'ann');

echo "\nIMAGES\n";
require_once __DIR__ . '/../../canvascore-admin/media.php';
$up = sys_get_temp_dir() . '/cc_up_' . getmypid(); @mkdir($up);
$GLOBALS['CC_MEDIA_META_FILE'] = $up . '/media-meta.json';
$im = imagecreatetruecolor(2000, 1000); imagefilledrectangle($im, 0, 0, 1999, 999, imagecolorallocate($im, 30, 120, 200));
imagejpeg($im, $up . '/photo.jpg', 85);
$small = imagecreatetruecolor(300, 200); imagepng($small, $up . '/icon.png');
$meta = cc_media_process($up, 'photo.jpg');
check('a large photo gets WebP copies at 480, 960 and 1600 px', $meta['variants'] === [480, 960, 1600] && is_file("$up/_cc/photo-960.webp"), json_encode($meta['variants']));
$v = getimagesize("$up/_cc/photo-480.webp");
check('…with the right proportions', $v && $v[0] === 480 && $v[1] === 240);
$m2 = cc_media_process($up, 'icon.png');
file_put_contents($up . '/broken.jpg', 'not really a jpeg');
check('a photo GD can\'t open stays "not optimized" (retried later)', cc_media_process($up, 'broken.jpg')['optimized'] === false);
check('a small image is never enlarged (no copies) but is marked as processed', $m2['variants'] === [] && $m2['optimized'] === true && $m2['w'] === 300);
cc_media_meta_update(function (&$all) { $all['photo.jpg']['alt'] = 'Blue sky'; });
$meta2 = cc_media_process($up, 'photo.jpg');
check('processing again keeps the alt text', cc_media_meta_all()['photo.jpg']['alt'] === 'Blue sky');
$page = '<img src="/uploads/photo.jpg" alt="a" loading="lazy"><p>x</p><img src="/uploads/icon.png" alt="b"><img src="https://ext.com/x.jpg" alt="c" loading="eager">';
$out = cc_optimize_images($page, '/uploads/');
check('published pages get a srcset of the copies (and the original at its width)', strpos($out, 'srcset="/uploads/_cc/photo-480.webp 480w, /uploads/_cc/photo-960.webp 960w, /uploads/_cc/photo-1600.webp 1600w, /uploads/photo.jpg 2000w"') !== false, $out);
check('the first image loads with priority (even if a block marked it lazy), the next ones lazily', preg_match('#<img[^>]*fetchpriority="high"[^>]*src="/uploads/photo.jpg"#', $out) && !preg_match('#src="/uploads/photo.jpg"[^>]*loading="lazy"#', $out) && preg_match('#<img[^>]*loading="lazy"[^>]*src="/uploads/icon.png"#', $out));
check('an image that already says how to load keeps it; others decode async', strpos($out, 'loading="eager"') !== false && substr_count($out, 'decoding="async"') === 3);
@unlink("$up/_cc/photo-1600.webp");
$mx = cc_media_meta_existing($up);
check('a missing copy is left out of srcset (restored site without uploads/_cc)', $mx['photo.jpg']['variants'] === [480, 960]);
cc_media_forget($up, 'photo.jpg');
check('deleting an image removes its copies and its description', !is_file("$up/_cc/photo-480.webp") && !isset(cc_media_meta_all()['photo.jpg']));
array_map('unlink', glob("$up/_cc/*") ?: []); @rmdir("$up/_cc"); array_map('unlink', glob("$up/*") ?: []); @rmdir($up);

echo "\nREDIRECTS, COOKIE BANNER, SEARCH\n";
check('redirect paths are normalized and validated', cc_redirect_path('old-page') === null && cc_redirect_path('/Old-Page') === '/old-page/' && cc_redirect_path('/') === null && cc_redirect_path('/a b/') === null && cc_redirect_target('https://x.com/a') === 'https://x.com/a');
$rdb = new PDO('sqlite::memory:'); $rdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$rdb->exec("CREATE TABLE pages (id TEXT)"); foreach (cc_db_migrations() as $v => $m) if ($v === 7) $m($rdb);
cc_add_redirect($rdb, '/a/', '/b/'); cc_add_redirect($rdb, '/b/', '/c/');
$rows = $rdb->query("SELECT from_path, to_path FROM redirects ORDER BY from_path")->fetchAll(PDO::FETCH_KEY_PAIR);
check('renaming twice: both old addresses go straight to the newest (no chains)', $rows === ['/a/' => '/c/', '/b/' => '/c/'], json_encode($rows));
cc_add_redirect($rdb, '/c/', '/a/');
$rows = $rdb->query("SELECT from_path, to_path FROM redirects ORDER BY from_path")->fetchAll(PDO::FETCH_KEY_PAIR);
check('renaming back never makes a loop (the page\'s own address is not redirected)', !isset($rows['/a/']) && ($rows['/c/'] ?? '') === '/a/' && ($rows['/b/'] ?? '') === '/a/', json_encode($rows));
$ht = cc_htaccess_with_redirects("ErrorDocument 404 /404.html\n", [['/old/', '/new/']]);
$ht2 = cc_htaccess_with_redirects($ht, [['/x/', 'https://e.com/']]);
check('.htaccess gets a marked block of 301s, replaced (not duplicated) on the next publish, the rest kept', strpos($ht2, 'ErrorDocument 404') === 0 && substr_count($ht2, '# BEGIN CanvasCore redirects') === 1 && strpos($ht2, 'Redirect 301 /x/ https://e.com/') !== false && strpos($ht2, '/old/') === false);
check('…and removed when there are none', strpos(cc_htaccess_with_redirects($ht2, []), 'CanvasCore redirects') === false);
$rp = cc_redirect_page_html('/new/');
check('the page at the old address forwards (refresh + script), is noindex and canonical to the new one', strpos($rp, 'http-equiv="refresh" content="0; url=/new/"') !== false && strpos($rp, 'noindex') !== false && strpos($rp, 'rel="canonical" href="/new/"') !== false);
check('cookie banner: off unless enabled', cc_cookie_banner_html(['enabled' => false]) === '' && cc_cookie_banner_html(null) === '');
$cb = cc_cookie_banner_html(['enabled' => true, 'text' => 'Cookies <b>!</b>', 'privacyUrl' => 'privacy/index.html', 'position' => 'bottom-left']);
check('cookie banner: escaped text, privacy link, Accept/Decline, consent gating script', strpos($cb, 'Cookies &lt;b&gt;!&lt;/b&gt;') !== false && strpos($cb, 'href="{{BASE_URL}}privacy/"') !== false && strpos($cb, 'data-cc-consent-choice="granted"') !== false && strpos($cb, 'data-cc-consent-src') !== false);
$sb = render_block(['id' => 'sr', 'type' => 'SEARCH', 'styles' => [], 'content' => ['placeholder' => 'Find "it"', 'limit' => 999]]);
check('Site Search block: escaped placeholder, index address, limit capped at 50, its script', strpos($sb, 'placeholder="Find &quot;it&quot;"') !== false && strpos($sb, 'data-index="{{BASE_URL}}search-index.json"') !== false && strpos($sb, 'data-limit="50"') !== false && strpos($sb, "getElementById('sr')") !== false);

echo "\nSITE BRANDING\n";
$br = cc_public_branding(['siteName' => '  Acme Bakery ', 'faviconUrl' => '/uploads/fav.png', 'adminEmail' => 'x@y.z', 'trustedProxies' => '10.0.0.1']);
check('public branding: only the site name and favicon', $br === ['siteName' => 'Acme Bakery', 'faviconUrl' => '/uploads/fav.png']);
check('public branding: unsafe favicon addresses are dropped', cc_public_branding(['faviconUrl' => 'javascript:alert(1)'])['faviconUrl'] === '' && cc_public_branding(['faviconUrl' => '//evil.test/x.png'])['faviconUrl'] === ''
    && cc_public_branding(['faviconUrl' => 'uploads/f.ico'])['faviconUrl'] === 'uploads/f.ico' && cc_public_branding(['faviconUrl' => 'https://cdn.test/f.png'])['faviconUrl'] === 'https://cdn.test/f.png');
check('public branding: empty settings → empty values', cc_public_branding([]) === ['siteName' => '', 'faviconUrl' => '']);

echo "\nMEDIA FOLDERS\n";
$mf = sys_get_temp_dir() . '/cc_mf_' . getmypid();
$GLOBALS['CC_MEDIA_META_FILE'] = $mf . '-meta.json'; $GLOBALS['CC_MEDIA_FOLDERS_FILE'] = $mf . '-folders.json';
@unlink($GLOBALS['CC_MEDIA_META_FILE']); @unlink($GLOBALS['CC_MEDIA_FOLDERS_FILE']);
check('folder names are cleaned and validated', cc_media_folder_path(' Products / Shoes ') === 'Products/Shoes' && cc_media_folder_path('a/../b') === null && cc_media_folder_path('x<y') === null && cc_media_folder_path('') === '' && cc_media_folder_path('Città') === 'Città');
cc_media_folder_create('Products/Shoes');
check('creating a sub-folder also lists its parent', cc_media_folders() === ['Products', 'Products/Shoes']);
cc_media_move(['a.jpg', 'b.jpg'], 'Products/Shoes'); cc_media_move(['c.jpg'], 'Products');
$fm = cc_media_meta_all();
check('moving sets the images\' folder (files stay where they are)', $fm['a.jpg']['folder'] === 'Products/Shoes' && $fm['c.jpg']['folder'] === 'Products');
check('renaming a folder moves its sub-folders and images along', cc_media_folder_rename('Products', 'Catalog') && cc_media_folders() === ['Catalog', 'Catalog/Shoes'] && cc_media_meta_all()['a.jpg']['folder'] === 'Catalog/Shoes');
check('a folder can\'t be renamed into itself or onto an existing one', !cc_media_folder_rename('Catalog', 'Catalog/Shoes/X') && !cc_media_folder_rename('Catalog/Shoes', 'Catalog'));
cc_media_folder_delete('Catalog');
$fm = cc_media_meta_all();
check('deleting a folder deletes no image: they go to the parent (here: no folder)', cc_media_folders() === [] && $fm['a.jpg']['folder'] === '' && $fm['c.jpg']['folder'] === '');
$udb = new PDO('sqlite::memory:'); $udb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$udb->exec("CREATE TABLE pages (id TEXT, title TEXT, content_json TEXT, seo_image TEXT, is_draft_copy INT, parent_id TEXT)");
$udb->exec("CREATE TABLE collection_items (title TEXT, content_json TEXT, cover_image TEXT)");
$udb->prepare("INSERT INTO pages VALUES ('p1','Home',?,'',0,NULL)")->execute([json_encode([['type' => 'IMAGE', 'content' => ['src' => '/uploads/a.jpg']]])]);
$udb->prepare("INSERT INTO collection_items VALUES ('Post', '[]', '/uploads/c.jpg')")->execute();
$u = cc_media_usage($udb, ['a.jpg', 'b.jpg', 'c.jpg']);
check('usage: where each image is used (pages, item covers…) before deleting', $u['a.jpg'] === ['Page: Home'] && $u['b.jpg'] === [] && $u['c.jpg'] === ['Item: Post'], json_encode($u));
@unlink($GLOBALS['CC_MEDIA_META_FILE']); @unlink($GLOBALS['CC_MEDIA_FOLDERS_FILE']);

echo "\nBACKUP & RESTORE\n";
require_once __DIR__ . '/../../canvascore-admin/backup.php';
$bk = sys_get_temp_dir() . '/cc_bk_' . getmypid();
cc_backup_rrmdir($bk); @mkdir($bk . '/data', 0755, true); @mkdir($bk . '/site/uploads/_cc', 0755, true);
$GLOBALS['CC_BACKUP_DATA_DIR'] = $bk . '/data'; $GLOBALS['CC_UPLOADS_DIR'] = $bk . '/site/uploads';
$GLOBALS['CC_MEDIA_META_FILE'] = $bk . '/data/media.json'; $GLOBALS['CC_MEDIA_FOLDERS_FILE'] = $bk . '/data/media-folders.json';
$bdb = new PDO('sqlite::memory:'); $bdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
cc_migrate($bdb);
$bdb->exec("INSERT INTO pages (id, title, slug, clean_slug, content_json, status, is_home) VALUES ('p1', 'Home', 'index', 'index', '[]', 'published', 1), ('p2', 'About', 'about', 'about', '[]', 'draft', 0)");
$bdb->exec("INSERT INTO pages (id, parent_id, title, slug, clean_slug, content_json, status, is_draft_copy) VALUES ('p1-draft', 'p1', 'Home', 'index', 'index', '[1]', 'draft', 1)");
$bdb->exec("INSERT INTO collections (id, name, slug) VALUES ('c1', 'Blog', 'blog')");
$bdb->exec("INSERT INTO collection_items (id, collection_id, title, slug, cover_image) VALUES ('i1', 'c1', 'First post', 'first-post', '/uploads/photo.png')");
$bdb->exec("INSERT INTO redirects (from_path, to_path) VALUES ('/old/', '/about/')");
$bdb->exec("INSERT INTO page_revisions (owner, title, content_json, kind, author) VALUES ('p1', 'Home', '[]', 'draft', 'ann')");
$bdb->exec("INSERT INTO form_submissions (form_id, page, data_json) VALUES ('f1', 'Home', '{\"name\":\"Bob\"}')");
$adminsBefore = (int)$bdb->query("SELECT COUNT(*) FROM admin")->fetchColumn();
file_put_contents($bk . '/data/settings.json', json_encode(['siteName' => 'Acme', 'trustedProxies' => '']));
file_put_contents($bk . '/data/menu.json', json_encode(['items' => [['label' => 'Home']]]));
file_put_contents($bk . '/data/media.json', json_encode(['photo.png' => ['alt' => 'A photo', 'folder' => 'Shop']]));
file_put_contents($bk . '/data/media-folders.json', json_encode(['Shop']));
$img = imagecreatetruecolor(40, 30); imagepng($img, $bk . '/site/uploads/photo.png'); imagewebp($img, $bk . '/site/uploads/_cc/photo-480.webp');
file_put_contents($bk . '/site/uploads/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
file_put_contents($bk . '/site/uploads/.htaccess', 'x'); file_put_contents($bk . '/site/uploads/notes.txt', 'not an image');
$zf = $bk . '/full.zip';
$man = cc_backup_create($bdb, $zf);
$z = new ZipArchive(); $z->open($zf); $names = []; for ($i = 0; $i < $z->numFiles; $i++) $names[] = $z->getNameIndex($i); $z->close();
check('backup ZIP: manifest, every content table, options, menu, media data and images (with optimized copies)', !array_diff(['manifest.json', 'db/pages.json', 'db/collections.json', 'db/collection_items.json', 'db/redirects.json', 'db/page_revisions.json', 'db/form_submissions.json', 'data/settings.json', 'data/menu.json', 'data/media.json', 'data/media-folders.json', 'uploads/photo.png', 'uploads/_cc/photo-480.webp', 'uploads/logo.svg'], $names), implode(',', $names));
check('…never the accounts, the .htaccess or files that aren\'t images', !preg_grep('~admin|\.htaccess|notes\.txt|cc_meta~', $names));
check('…manifest with versions, site name and counts', $man['format'] === 'canvascore-backup' && $man['site_name'] === 'Acme' && $man['counts']['pages'] === 2 && $man['counts']['collection_items'] === 1 && $man['uploads']['files'] === 3 && $man['db_schema'] === cc_backup_db_schema());
$zl = $bk . '/light.zip';
cc_backup_create($bdb, $zl, ['history' => false, 'submissions' => false]);
$z->open($zl); check('version history and form messages can be left out', $z->locateName('db/page_revisions.json') === false && $z->locateName('db/form_submissions.json') === false && $z->locateName('db/pages.json') !== false); $z->close();

// the site changes after the backup…
$bdb->exec("DELETE FROM pages WHERE id = 'p2'"); $bdb->exec("INSERT INTO pages (id, title, slug, clean_slug) VALUES ('p9', 'New', 'new', 'new')");
$bdb->exec("DELETE FROM collection_items"); $bdb->exec("DELETE FROM redirects"); $bdb->exec("UPDATE admin SET role = role");
$bdb->exec("INSERT INTO page_revisions (owner, title, content_json, kind, author) VALUES ('p9', 'New', '[]', 'draft', 'ann')");
file_put_contents($bk . '/data/settings.json', json_encode(['siteName' => 'Changed', 'trustedProxies' => '10.0.0.2']));
file_put_contents($bk . '/data/media.json', json_encode(['new.png' => ['alt' => 'new one']]));
unlink($bk . '/site/uploads/photo.png'); imagepng($img, $bk . '/site/uploads/new.png');
// …restoring the light backup keeps the current history and form messages (not in that file)
$r = cc_backup_restore($bdb, $zl);
check('restoring a backup without history keeps the current versions', $r['success'] && (int)$bdb->query("SELECT COUNT(*) FROM page_revisions WHERE owner = 'p9'")->fetchColumn() === 1, json_encode($r));
$bdb->exec("DELETE FROM pages WHERE id = 'p2'"); $bdb->exec("INSERT OR REPLACE INTO pages (id, title, slug, clean_slug) VALUES ('p9', 'New', 'new', 'new')");
file_put_contents($bk . '/data/settings.json', json_encode(['siteName' => 'Changed', 'trustedProxies' => '10.0.0.2']));
imagepng($img, $bk . '/site/uploads/new.png');
$r = cc_backup_restore($bdb, $zf);
$ids = $bdb->query("SELECT id FROM pages ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
check('restore: pages and their unpublished drafts back as they were (pages made later are gone)', $r['success'] && $ids === ['p1', 'p1-draft', 'p2'] && $r['counts']['pages'] === 2, json_encode($ids) . ' ' . ($r['message'] ?? ''));
check('restore: collections, items, redirects, versions and form messages back', (int)$bdb->query("SELECT COUNT(*) FROM collection_items")->fetchColumn() === 1 && (int)$bdb->query("SELECT COUNT(*) FROM redirects")->fetchColumn() === 1
    && (int)$bdb->query("SELECT COUNT(*) FROM page_revisions")->fetchColumn() === 1 && (int)$bdb->query("SELECT COUNT(*) FROM form_submissions")->fetchColumn() === 1);
check('restore: accounts untouched', (int)$bdb->query("SELECT COUNT(*) FROM admin")->fetchColumn() === $adminsBefore);
$set = json_decode(file_get_contents($bk . '/data/settings.json'), true);
check('restore: options and menu back, this server\'s trusted proxies kept', $set['siteName'] === 'Acme' && $set['trustedProxies'] === '10.0.0.2' && json_decode(file_get_contents($bk . '/data/menu.json'), true)['items'][0]['label'] === 'Home');
check('restore: the images are exactly the backup\'s (with descriptions and folders), uploads protected again',
    is_file($bk . '/site/uploads/photo.png') && is_file($bk . '/site/uploads/_cc/photo-480.webp') && !is_file($bk . '/site/uploads/new.png') && is_file($bk . '/site/uploads/.htaccess')
    && cc_media_meta_all()['photo.png']['alt'] === 'A photo' && cc_media_folders() === ['Shop'] && $r['counts']['images'] === 3);
check('restore: no temporary folders left behind', !glob($bk . '/site/.cc-*'));

// files that must be refused
$mk = function ($name, $entries, $manifest = null) use ($bk) {
    $f = $bk . '/' . $name; $z = new ZipArchive(); $z->open($f, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    if ($manifest !== false) $z->addFromString('manifest.json', json_encode($manifest ?? ['canvascore' => true, 'format' => 'canvascore-backup', 'format_version' => 1, 'db_schema' => 1, 'app' => '0.1']));
    $z->addFromString('db/pages.json', '[{"id":"z1","title":"Zed","slug":"zed","clean_slug":"zed","ghost_column":"ignored"}]');
    foreach ($entries as $n => $c) $z->addFromString($n, $c);
    $z->close(); return $f;
};
check('refused: a ZIP that is not a CanvasCore backup', !cc_backup_inspect($mk('a.zip', [], false))['ok']);
check('refused: paths that climb out ("../")', !cc_backup_inspect($mk('b.zip', ['uploads/../../evil.php' => '<?php']))['ok']);
check('refused: scripts among the images', !cc_backup_inspect($mk('c.zip', ['uploads/shell.php' => '<?php']))['ok'] && !cc_backup_inspect($mk('c2.zip', ['uploads/x.phtml' => '<?php']))['ok']);
check('accepted: audio and video files in the library (MP3, M4A, OGG, WAV, MP4, WebM)', cc_backup_inspect($mk('c3.zip', ['uploads/ep.mp3' => 'x', 'uploads/a.m4a' => 'x', 'uploads/a.ogg' => 'x', 'uploads/a.wav' => 'x', 'uploads/clip.mp4' => 'x', 'uploads/a.webm' => 'x']))['ok']);
check('still refused: a script, program or page dressed as media (x.mp4.php, x.exe, x.html) and types the library does not take (x.flv)', !cc_backup_inspect($mk('c4.zip', ['uploads/x.mp4.php' => '<?php']))['ok'] && !cc_backup_inspect($mk('c5.zip', ['uploads/x.exe' => 'MZ']))['ok'] && !cc_backup_inspect($mk('c6.zip', ['uploads/x.html' => '<script>']))['ok'] && !cc_backup_inspect($mk('c7.zip', ['uploads/x.flv' => 'x']))['ok']);
check('refused: unknown tables or data files (e.g. accounts)', !cc_backup_inspect($mk('d.zip', ['db/admin.json' => '[]']))['ok'] && !cc_backup_inspect($mk('d2.zip', ['data/login_attempts.json' => '{}']))['ok']);
$newer = cc_backup_inspect($mk('e.zip', [], ['canvascore' => true, 'format' => 'canvascore-backup', 'format_version' => 1, 'db_schema' => 999, 'app' => '9.0']));
check('refused: a backup from a newer CanvasCore, with a clear message', !$newer['ok'] && stripos($newer['message'], 'newer') !== false);
$r = cc_backup_restore($bdb, $mk('f.zip', ['uploads/bad.svg' => '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'uploads/fake.png' => 'not a png']));
check('an older backup restores (unknown columns ignored); unsafe SVGs and fake images are left out', $r['success'] && $bdb->query("SELECT title FROM pages")->fetchAll(PDO::FETCH_COLUMN) === ['Zed']
    && !is_file($bk . '/site/uploads/bad.svg') && !is_file($bk . '/site/uploads/fake.png') && in_array('bad.svg', $r['skipped'], true) && in_array('fake.png', $r['skipped'], true), json_encode($r));
$r = cc_backup_restore($bdb, $mk('g.zip', ['uploads/ep.mp3' => "ID3\x03\x00\x00\x00\x00\x00\x00" . str_repeat("\x00", 40), 'uploads/clip.mp4' => "\x00\x00\x00\x18ftypmp42" . str_repeat("\x00", 40), 'uploads/fake.webm' => '<html><script>alert(1)</script></html>', 'uploads/fake2.mp3' => 'MZ not audio']));
check('restoring a library with media keeps real audio and video and leaves out files that do not start like their type', $r['success'] && is_file($bk . '/site/uploads/ep.mp3') && is_file($bk . '/site/uploads/clip.mp4') && !is_file($bk . '/site/uploads/fake.webm') && !is_file($bk . '/site/uploads/fake2.mp3') && in_array('fake.webm', $r['skipped'], true) && in_array('fake2.mp3', $r['skipped'], true), json_encode($r));
check('download file name from the site name', cc_backup_slug('Acme Bakery & Café') === 'acme-bakery-cafe' && cc_backup_slug('') === 'site' && cc_backup_slug('***') === 'site');
check('saved backup names are checked (no paths)', cc_backup_name_ok('backup-20261013-101500-ab12.zip') && cc_backup_name_ok('before-restore-20261013-101500-ab12.zip') && !cc_backup_name_ok('../backup-20261013-101500.zip') && !cc_backup_name_ok('x.zip'));
for ($i = 0; $i < 7; $i++) cc_backup_safety_copy($bdb);
check('only the newest ' . CC_BACKUP_KEEP_SAFETY . ' safety copies are kept', count(array_filter(cc_backup_list(), function ($b) { return $b['kind'] === 'safety'; })) === CC_BACKUP_KEEP_SAFETY);
check('the list shows what each saved backup contains', ($l = cc_backup_list()) && $l[0]['counts']['pages'] === 1 && $l[0]['site_name'] === 'Acme');
cc_backup_rrmdir($bk);
unset($GLOBALS['CC_BACKUP_DATA_DIR'], $GLOBALS['CC_UPLOADS_DIR'], $GLOBALS['CC_MEDIA_META_FILE'], $GLOBALS['CC_MEDIA_FOLDERS_FILE']);

echo "\nDELETED COLLECTIONS AND ITEMS GO OFFLINE\n";
$sr = sys_get_temp_dir() . '/cc_site_' . getmypid();
$GLOBALS['CC_SITE_ROOT'] = $sr;
$put = function ($rel, $txt = 'x') use ($sr) { @mkdir(dirname($sr . '/' . $rel), 0755, true); file_put_contents($sr . '/' . $rel, $txt); };
foreach (['blog/a/index.html', 'blog/b/index.html', 'blog/feed.xml', 'blog/notes.txt', 'news/a/index.html', 'about/index.html', 'index.html'] as $f) $put($f);
file_put_contents($sr . '/published_files.json', json_encode(['blog/a/index.html', 'blog/b/index.html', 'blog/feed.xml', 'news/a/index.html', 'about/index.html', 'index.html']));
$udb2 = new PDO('sqlite::memory:');
$udb2->exec("CREATE TABLE collections (id TEXT, name TEXT, slug TEXT)");
$udb2->exec("CREATE TABLE collection_items (id TEXT, collection_id TEXT, title TEXT, slug TEXT, status TEXT)");
$udb2->exec("INSERT INTO collections VALUES ('c1', 'Blog', 'blog'), ('c2', 'News', 'news')");
$udb2->exec("INSERT INTO collection_items VALUES ('d1', 'c1', 'Draft A', 'a', 'draft'), ('p1', 'c1', 'Live A', 'a', 'published')");
check('a deleted draft never takes down the live page that shares its address', cc_unpublish_item($udb2, $sr, ['id' => 'd1', 'collection_id' => 'c1', 'slug' => 'a', 'status' => 'draft']) === 0 && is_file($sr . '/blog/a/index.html'));
$udb2->exec("DELETE FROM collection_items WHERE id = 'p1'");
$n = cc_unpublish_item($udb2, $sr, ['id' => 'p1', 'collection_id' => 'c1', 'slug' => 'a', 'status' => 'published']);
check('a deleted published item: its page and folder are removed at once', $n === 1 && !is_dir($sr . '/blog/a') && is_file($sr . '/blog/b/index.html') && is_file($sr . '/news/a/index.html'));
check('…and the publish manifest forgets it', !in_array('blog/a/index.html', json_decode(file_get_contents($sr . '/published_files.json'), true), true));
$n = cc_unpublish_files($sr, 'blog/', ['blog/feed.xml']);
check('a deleted collection: its pages and feed are removed, files it did not publish are kept', $n === 2 && !is_file($sr . '/blog/feed.xml') && !is_dir($sr . '/blog/b') && is_file($sr . '/blog/notes.txt'));
check('other collections, pages and the home page are untouched', is_file($sr . '/news/a/index.html') && is_file($sr . '/about/index.html') && is_file($sr . '/index.html'));
check('unsafe prefixes and paths are refused', cc_unpublish_files($sr, '../', []) === 0 && cc_unpublish_files($sr, '', ['index.html']) === 0 && cc_unpublish_files($sr, 'gone/', ['gone/../index.html']) === 0 && is_file($sr . '/index.html') && is_file($sr . '/news/a/index.html'));
unset($GLOBALS['CC_SITE_ROOT']);
cc_backup_rrmdir($sr);

echo "\n" . ($fails === 0 ? 'SERVER OK' : "$fails checks failed") . " ($total checks)\n";
exit($fails === 0 ? 0 : 1);
