<?php
// tests/server.php — server-side helpers checked through the real PHP code (npm run test:server):
// code kept on editors' saves, re-linking after a slug change, client address behind a proxy,
// SVG upload check, sanitizer, numbers, slider arrows and empty-text fallbacks.
require __DIR__ . '/../../canvascore-admin/compiler.php';
require_once __DIR__ . '/../../canvascore-admin/publish.php';
require_once __DIR__ . '/../../canvascore-admin/update.php';
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

echo "\nFACETED SEARCH AND RELATED BY TAG (renderer)\n";
$sh = render_block(['type' => 'SEARCH', 'id' => 'sr1', 'content' => ['facets' => ['collection', 'tax:cat-1', 'tax:<script>', 'nope']]]);
check('the search block offers the facets it is given, and drops anything that is not a facet', strpos($sh, ' data-facets="[&quot;collection&quot;,&quot;tax:cat-1&quot;]"') !== false, substr($sh, 0, 300));
check('…and without facets the search block is as it was (no facets attribute)', strpos(render_block(['type' => 'SEARCH', 'id' => 'sr2', 'content' => []]), ' data-facets="') === false);

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

echo "\nDATA FILES, SLUGS AND COPIES\n";
$wf = sys_get_temp_dir() . '/cc_wf_' . getmypid(); @mkdir($wf);
check('a data file is written whole, and no temporary file is left', cc_write_file($wf . '/a.json', '{"a":1}') && file_get_contents($wf . '/a.json') === '{"a":1}' && cc_write_file($wf . '/a.json', '{"a":2}') && file_get_contents($wf . '/a.json') === '{"a":2}' && count(glob($wf . '/*')) === 1);
check('…and a file that cannot be written says so', cc_write_file($wf . '/no/such/folder/a.json', 'x') === false);
check('a slug is cut to a folder name the file system accepts', strlen(cc_safe_slug(str_repeat('abc ', 200))) <= 100 && substr(cc_safe_slug(str_repeat('abc ', 200)), -1) !== '-' && cc_safe_slug(str_repeat('x', 300)) === str_repeat('x', 100));
@mkdir($wf . '/from/sub', 0755, true); file_put_contents($wf . '/from/a.txt', 'A'); file_put_contents($wf . '/from/sub/b.txt', 'B'); @mkdir($wf . '/from/sessions'); file_put_contents($wf . '/from/sessions/s', 'S');
check('moving the data folder copies everything in it (not the sessions) and says when a copy failed', cc_copy_tree($wf . '/from', $wf . '/to', ['sessions']) && file_get_contents($wf . '/to/sub/b.txt') === 'B' && !file_exists($wf . '/to/sessions') && cc_copy_tree($wf . '/from', '/proc/nope/cc') === false);
$sq = new PDO('sqlite:' . $wf . '/x.sqlite'); $sq->exec('CREATE TABLE t (a)'); $sq = null; copy($wf . '/x.sqlite', $wf . '/y.sqlite');
check('a copy of the database counts only when it is whole', cc_sqlite_copy_ok($wf . '/x.sqlite', $wf . '/y.sqlite') && (file_put_contents($wf . '/z.sqlite', 'short') !== false) && !cc_sqlite_copy_ok($wf . '/x.sqlite', $wf . '/z.sqlite'));
cc_backup_rrmdir($wf);

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

echo "\nIMAGE TOOLS: FOCAL POINT, CROP, REPLACE\n";
$it = sys_get_temp_dir() . '/cc_it_' . getmypid(); @mkdir($it);
$GLOBALS['CC_MEDIA_META_FILE'] = $it . '/media-meta.json';
$mk = function ($file, $w, $h, $fmt = 'jpg') use ($it) {
    $g = imagecreatetruecolor($w, $h); imagefilledrectangle($g, 0, 0, $w - 1, $h - 1, imagecolorallocate($g, 200, 40, 40));
    imagefilledrectangle($g, 0, 0, intdiv($w, 2) - 1, $h - 1, imagecolorallocate($g, 40, 40, 200));   // left half blue, right half red
    $fmt === 'png' ? imagepng($g, "$it/$file") : imagejpeg($g, "$it/$file", 95);
};
$mk('1_big.jpg', 1000, 500); $mk('2_pic.png', 400, 300, 'png');
cc_media_process($it, '1_big.jpg'); cc_media_process($it, '2_pic.png');
cc_media_meta_update(function (&$all) { $all['1_big.jpg']['alt'] = 'Two halves'; $all['1_big.jpg']['folder'] = 'Shots'; });
check('a focal point is cleaned: percentages kept inside 0–100, one decimal; anything else is none', cc_media_focal_clean(['x' => '33.33', 'y' => 120]) === ['x' => 33.3, 'y' => 100.0] && cc_media_focal_clean(['x' => -5, 'y' => 'a']) === null && cc_media_focal_clean('x') === null && cc_media_focal_clean(null) === null);
check('…and becomes an object-position', cc_media_focal_css(['x' => 30, 'y' => 70.5]) === '30% 70.5%' && cc_media_focal_css(null) === '');
[$n, $e] = cc_media_crop($it, '1_big.jpg', 500, 0, 500, 500, 'copy');
$ci = $n ? getimagesize("$it/$n") : null;
check('a crop saved as a copy is a new file of the cropped size; the original is untouched', $n && preg_match('/^\d+_big-crop\.jpg$/', $n) && $ci && $ci[0] === 500 && $ci[1] === 500 && getimagesize("$it/1_big.jpg")[0] === 1000, "$n $e");
$px = $n ? imagecolorat(imagecreatefromjpeg("$it/$n"), 250, 250) : 0;
check('…it holds the chosen part (the right, red half)', (($px >> 16) & 255) > 150 && ($px & 255) < 100);
$mm = cc_media_meta_all();
check('…it keeps the description and the folder, and gets its own optimized state', $mm[$n]['alt'] === 'Two halves' && $mm[$n]['folder'] === 'Shots' && $mm[$n]['w'] === 500);
cc_media_meta_update(function (&$all) { $all['1_big.jpg']['focal'] = ['x' => 20, 'y' => 20]; });
[$n2, $e2] = cc_media_crop($it, '1_big.jpg', 0, 0, 600, 300, 'replace');
$r = getimagesize("$it/1_big.jpg");
check('a crop that replaces the original keeps the name and the address', $n2 === '1_big.jpg' && $r[0] === 600 && $r[1] === 300, "$n2 $e2");
check('…its optimized copies are made again for the new size and the focal point is cleared; description and folder stay', cc_media_meta_all()['1_big.jpg']['w'] === 600 && !isset(cc_media_meta_all()['1_big.jpg']['focal']) && cc_media_meta_all()['1_big.jpg']['alt'] === 'Two halves' && is_file("$it/_cc/1_big-480.webp") && !is_file("$it/_cc/1_big-960.webp"));
check('a crop outside the image, empty, or not numeric is refused', cc_media_crop($it, '2_pic.png', 300, 0, 200, 100, 'copy')[0] === null && cc_media_crop($it, '2_pic.png', 0, 0, 0, 10, 'copy')[0] === null && cc_media_crop($it, '2_pic.png', -1, 0, 10, 10, 'copy')[0] === null && cc_media_crop($it, '2_pic.png', 'a', 0, 10, 10, 'copy')[0] === null);
file_put_contents("$it/3_anim.gif", base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')); file_put_contents("$it/4_pic.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
check('formats that cannot be cropped (GIF, SVG), unknown files and path tricks are refused', cc_media_crop($it, '3_anim.gif', 0, 0, 1, 1, 'copy')[0] === null && cc_media_crop($it, '4_pic.svg', 0, 0, 1, 1, 'copy')[0] === null && cc_media_crop($it, 'nope.jpg', 0, 0, 1, 1, 'copy')[0] === null && cc_media_crop($it, '../../etc/passwd', 0, 0, 1, 1, 'copy')[0] === null);
[$n3] = cc_media_crop($it, '2_pic.png', 10, 10, 100, 100, 'copy');
check('a PNG is cropped as a PNG', $n3 && getimagesize("$it/$n3")[2] === IMAGETYPE_PNG && getimagesize("$it/$n3")[0] === 100);
// replace
$new = sys_get_temp_dir() . '/cc_new_' . getmypid() . '.jpg'; $g = imagecreatetruecolor(800, 400); imagejpeg($g, $new);
[$meta, $err] = cc_media_replace($it, '1_big.jpg', $new, filesize($new));
check('replacing keeps the name, makes new copies and records the new size; description and folder stay', $meta && $meta['w'] === 800 && getimagesize("$it/1_big.jpg")[0] === 800 && cc_media_meta_all()['1_big.jpg']['alt'] === 'Two halves' && cc_media_meta_all()['1_big.jpg']['folder'] === 'Shots', $err);
$png = sys_get_temp_dir() . '/cc_new_' . getmypid() . '.png'; imagepng($g, $png);
check('a file of another kind of image would break the address: refused (a PNG for a .jpg)', cc_media_replace($it, '1_big.jpg', $png, filesize($png))[0] === null && getimagesize("$it/1_big.jpg")[2] === IMAGETYPE_JPEG);
file_put_contents($new, '<?php system($_GET[1]);');
check('a script renamed as an image, an unsafe SVG and a missing file are refused', cc_media_replace($it, '1_big.jpg', $new, filesize($new))[0] === null && cc_media_replace($it, '4_pic.svg', $new, filesize($new))[0] === null && cc_media_replace($it, 'nope.jpg', $png, 10)[0] === null && cc_media_replace($it, '../x.jpg', $png, 10)[0] === null);
file_put_contents($new, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
check('…an SVG with a script too', cc_media_replace($it, '4_pic.svg', $new, filesize($new))[0] === null);
file_put_contents($new, '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
check('…a plain SVG replaces an SVG', cc_media_replace($it, '4_pic.svg', $new, filesize($new))[0] !== null && strpos(file_get_contents("$it/4_pic.svg"), 'width="2"') !== false);
check('no temporary files are left behind', !glob("$it/*.tmp.*"));
// addresses without an extension, or with a wrong one: the file's own type decides
require_once __DIR__ . '/../../canvascore-admin/wpimport.php';
$pngf = sys_get_temp_dir() . '/cc_dl_' . getmypid(); copy($png, $pngf);
[$u1, $e1] = cc_wp_store_image($pngf, 'https://a.example/image?id=3', $it, '');
[$u2] = cc_wp_store_image($pngf, 'https://a.example/photo.jpg', $it, '');
[$u3] = cc_wp_store_image($pngf, 'https://a.example/photo.png', $it, '/site');
check('an image address without an extension is stored with the right one (from the file itself), and a wrong extension is corrected', preg_match('#^/uploads/\d+_image\.png$#', (string)$u1) && preg_match('#^/uploads/\d+_(?:[0-9a-f]{6}_)?photo\.png$#', (string)$u2) && preg_match('#^/site/uploads/\d+_(?:[0-9a-f]{6}_)?photo\.png$#', (string)$u3), json_encode([$u1, $u2, $u3, $e1]));
@unlink($pngf); @unlink($new); @unlink($png);
array_map('unlink', array_filter(array_merge(glob("$it/_cc/*") ?: [], glob("$it/*") ?: []), 'is_file')); @rmdir("$it/_cc"); @rmdir($it);
unset($GLOBALS['CC_MEDIA_META_FILE']);

echo "\nROLES: HELPERS\n";
require_once __DIR__ . '/../../canvascore-admin/roles.php';
check('a role is one of admin, editor, reviewer, author; anything else counts as editor', cc_role_clean('author') === 'author' && cc_role_clean('reviewer') === 'reviewer' && cc_role_clean('admin') === 'admin' && cc_role_clean('root') === 'editor' && cc_role_clean(null) === 'editor' && cc_role_clean(['admin']) === 'editor');
check('what each role may do', cc_can_create('author') && !cc_can_create('reviewer') && cc_can_publish_directly('editor') && !cc_can_publish_directly('reviewer') && !cc_can_publish_directly('author') && !cc_can_publish_site('author') && cc_can_publish_site('reviewer') && !cc_can_edit_any('author') && cc_is_contributor('author') && cc_is_contributor('reviewer') && !cc_is_contributor('editor'));
check('the actions closed to authors and reviewers are site-wide ones', in_array('save_settings', CC_CONTRIBUTOR_DENIED, true) && in_array('delete_media', CC_CONTRIBUTOR_DENIED, true) && in_array('bulk_items', CC_CONTRIBUTOR_DENIED, true) && !in_array('save_page', CC_CONTRIBUTOR_DENIED, true) && !in_array('upload_media', CC_CONTRIBUTOR_DENIED, true));
check('collection access is cleaned: a mode, and a list of valid, distinct names', cc_collection_access_clean(['mode' => 'selected', 'users' => ['ann', 'ann', 'a b', 'x', str_repeat('z', 40), 'bob.smith', 7]]) === ['mode' => 'selected', 'users' => ['ann', 'bob.smith']] && cc_collection_access_clean('x') === ['mode' => 'all', 'users' => []] && cc_collection_access_clean(['mode' => 'weird'])['mode'] === 'all');
$rdb = new PDO('sqlite::memory:'); $rdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
foreach (cc_db_migrations() as $mig) $mig($rdb);
$rdb->exec("INSERT INTO collections (id, name, slug, access_json) VALUES ('open', 'Open', 'open', '{}'), ('shut', 'Shut', 'shut', '{\"mode\":\"selected\",\"users\":[\"ann\"]}')");
check('a collection with no list is open to all; one limited to people only to them; admins always', cc_collection_allowed($rdb, 'open', 'author', 'zed') && !cc_collection_allowed($rdb, 'shut', 'editor', 'zed') && cc_collection_allowed($rdb, 'shut', 'author', 'ann') && cc_collection_allowed($rdb, 'shut', 'admin', 'zed') && cc_collections_denied_ids($rdb, 'author', 'zed') === ['shut'] && cc_collections_denied_ids($rdb, 'admin', 'zed') === []);
$rdb->exec("INSERT INTO pages (id, title, created_by, is_draft_copy, status) VALUES ('pg', 'P', 'ann', 0, 'published'), ('cp', 'P', 'zed', 1, 'draft')");
$rdb->exec("UPDATE pages SET parent_id = 'pg' WHERE id = 'cp'");
check('a draft copy belongs to the page it is a copy of', cc_owner_of_page($rdb, ['id' => 'cp', 'parent_id' => 'pg', 'is_draft_copy' => 1, 'created_by' => 'zed']) === 'ann' && cc_owner_of_page($rdb, ['id' => 'pg', 'created_by' => 'ann', 'is_draft_copy' => 0]) === 'ann');
check('the migration added the review and ownership columns to pages and items, and the access to collections', (function ($db) { foreach (['pages', 'collection_items'] as $t) { $cols = array_column($db->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name'); foreach (['created_by', 'review_state', 'review_note', 'review_by', 'review_at', 'reviewed_by'] as $c) if (!in_array($c, $cols, true)) return false; } return in_array('access_json', array_column($db->query("PRAGMA table_info(collections)")->fetchAll(PDO::FETCH_ASSOC), 'name'), true); })($rdb));
check('existing pages get their author as creator', (function () { $d = new PDO('sqlite::memory:'); $ms = cc_db_migrations(); ksort($ms); foreach ($ms as $v => $m) { if ($v === 15) { $d->exec("INSERT INTO pages (id, title, author) VALUES ('old', 'Old', 'sam')"); } $m($d); } return $d->query("SELECT created_by FROM pages WHERE id = 'old'")->fetchColumn() === 'sam'; })());

echo "\nTEMPLATE LIBRARY\n";
require_once __DIR__ . '/../../canvascore-admin/library.php';
$lt = sys_get_temp_dir() . '/cc_lib_' . getmypid(); @mkdir($lt . '/data', 0755, true); @mkdir($lt . '/uploads', 0755, true);
$GLOBALS['CC_LIB_DIR'] = $lt . '/lib'; $GLOBALS['CC_LIB_DATA_DIR'] = $lt . '/data'; $GLOBALS['CC_LIB_UPLOADS'] = $lt . '/uploads'; $GLOBALS['CC_MEDIA_META_FILE'] = $lt . '/media.json'; $GLOBALS['CC_MEDIA_FOLDERS_FILE'] = $lt . '/folders.json';
$GLOBALS['CC_LIB_APP_VERSION'] = '0.24.0';
$kitsDir = realpath(__DIR__ . '/../../docs/examples/library-kits');
$cp = function ($from, $to) use (&$cp) { @mkdir($to, 0755, true); foreach (array_diff(scandir($from), ['.', '..']) as $f) is_dir("$from/$f") ? $cp("$from/$f", "$to/$f") : copy("$from/$f", "$to/$f"); };
$kitN = 0;
// a kit folder made from an example, changed by $edit(dir)
$mk = function ($example, $edit = null) use ($kitsDir, $lt, $cp, &$kitN) { $d = $lt . '/k' . (++$kitN); $cp("$kitsDir/$example", $d); if ($edit) $edit($d); return $d; };
$jr = function ($f) { return json_decode(file_get_contents($f), true); };
$jw = function ($f, $v) { file_put_contents($f, json_encode($v)); };
$pk = cc_lib_read($kitsDir . '/coming-soon-page'); $sk = cc_lib_read($kitsDir . '/landing-sections'); $ik = cc_lib_read($kitsDir . '/bistro-site');
check('the three example kits (page, section, site) are valid', !$pk['errors'] && !$sk['errors'] && !$ik['errors'] && $pk['type'] === 'page' && $sk['type'] === 'section' && $ik['type'] === 'site', json_encode([$pk['errors'], $sk['errors'], $ik['errors']]));
check('…with their pages, images and preview counted', $pk['pages'] === 1 && count($pk['assets']) === 1 && !empty($pk['preview']) && $ik['pages'] === 3 && count($sk['content']['sections']) === 3);
$bad = function ($edit, $example = 'coming-soon-page') use ($mk) { $k = cc_lib_read($mk($example, $edit)); return $k['errors']; };
check('a kit needs kit.json and content.json', count($bad(function ($d) { unlink("$d/kit.json"); })) > 0 && count($bad(function ($d) { unlink("$d/content.json"); })) > 0);
check('an id, a version and a type are checked', count($bad(function ($d) use ($jr, $jw) { $m = $jr("$d/kit.json"); $m['id'] = 'Bad Id!'; $jw("$d/kit.json", $m); })) > 0 && count($bad(function ($d) use ($jr, $jw) { $m = $jr("$d/kit.json"); $m['version'] = 'x'; $jw("$d/kit.json", $m); })) > 0 && count($bad(function ($d) use ($jr, $jw) { $m = $jr("$d/kit.json"); $m['type'] = 'plugin'; $jw("$d/kit.json", $m); })) > 0);
$e = $bad(function ($d) use ($jr, $jw) { $m = $jr("$d/kit.json"); $m['minVersion'] = '9.0.0'; $jw("$d/kit.json", $m); });
check('a kit that needs a newer CanvasCore is refused, saying which', count($e) === 1 && strpos($e[0], '9.0.0') !== false, json_encode($e));
check('files a kit may not hold (a script, a hidden file) are refused', count($bad(function ($d) { file_put_contents("$d/evil.php", '<?php echo 1;'); })) > 0 && count($bad(function ($d) { file_put_contents("$d/.htaccess", 'x'); })) > 0 && count($bad(function ($d) { mkdir("$d/assets/sub"); file_put_contents("$d/assets/sub/a.png", 'x'); })) > 0);
$e = $bad(function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $c['blocks'][] = ['type' => 'NOT_A_BLOCK', 'content' => []]; $jw("$d/content.json", $c); });
check('a block this site does not have is refused, by name', count($e) === 1 && strpos($e[0], 'NOT_A_BLOCK') !== false, json_encode($e));
$e = $bad(function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $c['blocks'][0]['content']['src'] = 'kit:assets/missing.png'; $jw("$d/content.json", $c); });
check('an image the content points to must be in the kit', count($e) === 1 && strpos($e[0], 'missing.png') !== false, json_encode($e));
check('an SVG with a script and a file that is not an image are refused', count($bad(function ($d) { file_put_contents("$d/assets/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'); })) > 0 && count($bad(function ($d) { file_put_contents("$d/assets/photo.png", 'not a png'); })) > 0);
check('a preview that is too big or not an image is refused', count($bad(function ($d) { file_put_contents("$d/preview.png", str_repeat('x', 400000)); })) > 0 && count($bad(function ($d) { file_put_contents("$d/preview.png", 'nope'); })) > 0);
check('a page kit with no blocks, a site kit with no pages, a section kit with no sections are refused', count($bad(function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $c['blocks'] = []; $jw("$d/content.json", $c); })) > 0 && count($bad(function ($d) use ($jw) { $jw("$d/content.json", ['pages' => []]); }, 'bistro-site')) > 0 && count($bad(function ($d) use ($jw) { $jw("$d/content.json", ['sections' => []]); }, 'landing-sections')) > 0);
check('too many pages and too deep nesting are refused', count($bad(function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $c['pages'] = array_fill(0, CC_LIB_MAX_PAGES + 1, $c['pages'][0]); $jw("$d/content.json", $c); }, 'bistro-site')) > 0 && count($bad(function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $b = ['type' => 'TEXT', 'content' => ['text' => 'x']]; for ($i = 0; $i < 20; $i++) $b = ['type' => 'SECTION', 'content' => [], 'children' => [$b]]; $c['blocks'] = [$b]; $jw("$d/content.json", $c); })) > 0);
// ZIPs: layout and real sizes
$zipOf = function ($names) use ($lt, &$kitN) { $zf = $lt . '/z' . (++$kitN) . '.zip'; $z = new ZipArchive(); $z->open($zf, ZipArchive::CREATE); foreach ($names as $n => $c) $z->addFromString($n, $c); $z->close(); return $zf; };
$good = ['kit.json' => json_encode(['id' => 'tiny', 'name' => 'Tiny', 'version' => '1.0.0', 'type' => 'page']), 'content.json' => json_encode(['blocks' => [['type' => 'TEXT', 'content' => ['text' => '<p>x</p>']]]])];
check('a ZIP kit is read', !cc_lib_read($zipOf($good))['errors']);
check('a ZIP with a path outside the kit (../) or an absolute path is refused', count(cc_lib_read($zipOf($good + ['../evil.json' => '{}']))['errors']) > 0 && count(cc_lib_read($zipOf($good + ['/etc/x.json' => '{}']))['errors']) > 0);
check('a file that unpacks larger than it should is refused (the declared size is not trusted)', count(cc_lib_read($zipOf(['kit.json' => $good['kit.json'], 'content.json' => json_encode(['blocks' => [['type' => 'TEXT', 'content' => ['text' => str_repeat('a', CC_LIB_MAX_FILE + 10)]]]])]))['errors']) > 0);
check('something that is not a ZIP is refused', count(cc_lib_read(__FILE__)['errors']) > 0);

// what a kit's blocks become
$hostile = [['id' => 'x1', 'type' => 'HTML', 'content' => ['code' => '<script>steal()</script>', 'customCss' => 'body{display:none}']],
            ['id' => 'x2', 'type' => 'FORM', 'content' => ['email' => 'attacker@evil.com', 'title' => '<img src=x onerror=alert(1)>']],
            ['id' => 'x3', 'type' => 'TEXT', 'content' => ['text' => '<p onclick="x()">Hi<script>bad()</script></p>', 'customJs' => 'alert(1)']],
            ['id' => 'x4', 'type' => 'SECTION', 'content' => [], 'children' => [['id' => 'x5', 'type' => 'IMAGE', 'content' => ['src' => 'kit:assets/p.png']], ['id' => 'x6', 'type' => 'HTML', 'content' => ['code' => '<b>nested</b>']]]]];
$dropped = 0; $prep = cc_lib_prepare_blocks($hostile, ['p.png' => '/uploads/1_p.png'], $dropped); $pj = json_encode($prep);
check('code a kit carries is dropped: Custom HTML is emptied (also nested), form emails and custom CSS/JS removed', $prep[0]['content']['code'] === '' && !isset($prep[0]['content']['customCss']) && $prep[1]['content']['email'] === '' && !isset($prep[2]['content']['customJs']) && $prep[3]['children'][1]['content']['code'] === '' && $dropped === 2, $pj);
check('…rich text is sanitized, and the kit\'s image addresses become library addresses', strpos($pj, 'onerror') === false && strpos($pj, 'onclick') === false && strpos($pj, '<script') === false && strpos($pj, 'kit:assets') === false && $prep[3]['children'][0]['content']['src'] === '/uploads/1_p.png');
check('every block gets an id of its own', !in_array('x1', array_column($prep, 'id'), true) && count(array_unique(array_merge(array_column($prep, 'id'), [$prep[3]['children'][0]['id']]))) === 5);
$mn = cc_lib_menu_clean(['items' => [['label' => '<b>Home</b>', 'url' => ''], ['label' => 'Bad', 'url' => 'javascript:alert(1)'], ['label' => 'Docs', 'url' => 'docs/', 'children' => [['label' => 'A', 'url' => 'https://example.com/a', 'children' => [['label' => 'B', 'url' => '/b', 'children' => [['label' => 'C', 'url' => '/c']]]]]]], ['label' => '', 'url' => '/x']]]);
check('a menu from a kit keeps labels and plain addresses only (no javascript:, no markup), three levels at most', count($mn) === 3 && $mn[0]['label'] === 'Home' && $mn[1]['url'] === '' && $mn[2]['url'] === 'docs/' && $mn[2]['children'][0]['children'][0]['label'] === 'B' && !isset($mn[2]['children'][0]['children'][0]['children']), json_encode($mn));
$ds = cc_lib_design_clean(['brandColor' => 'red;}', 'fontFamily' => 'Georgia; background:url(x)', 'colors' => [['id' => 'primary', 'name' => 'Main', 'value' => '#112233'], ['id' => 'bad id', 'value' => 'red']], 'unknown' => 1, 'typography' => 'x']);
check('a kit\'s design keeps valid colours only; a font family with code in it, and unknown settings, are dropped', ($ds['brandColor'] ?? '') === '#112233' && !isset($ds['fontFamily']) && !isset($ds['unknown']) && strpos(json_encode($ds), 'url(') === false, json_encode($ds));
check('a font family and a plain brand colour pass', cc_lib_design_clean(['fontFamily' => "Georgia, 'Times New Roman', serif", 'brandColor' => '#b45309'])['fontFamily'] === "Georgia, 'Times New Roman', serif" && cc_lib_design_clean(['brandColor' => '#b45309'])['brandColor'] === '#b45309');

// installing
$ldb = new PDO('sqlite:' . $lt . '/t.sqlite'); $ldb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
require_once __DIR__ . '/../../canvascore-admin/migrations.php'; cc_migrate($ldb);
$ldb->exec("INSERT INTO pages (id, title, slug, clean_slug, status, is_draft_copy, is_home) VALUES ('old', 'Coming', 'coming-soon', 'coming-soon', 'published', 0, 1)");
$ldb->exec("INSERT INTO site_parts (name, content_json) VALUES ('header', '[{\"id\":\"h\",\"type\":\"TEXT\",\"content\":{\"text\":\"<p>Old header</p>\"}}]')");
file_put_contents($lt . '/data/menu.json', json_encode(['items' => [['id' => 'm', 'label' => 'Old', 'url' => 'old/']], 'settings' => ['theme' => 'dark']]));
file_put_contents($lt . '/data/settings.json', json_encode(['siteName' => 'Mine', 'brandColor' => '#111111']));
$r = cc_lib_install($ldb, cc_lib_read($kitsDir . '/coming-soon-page'), [], 'ann', '/site');
$pg = $ldb->query("SELECT * FROM pages WHERE id != 'old'")->fetch(PDO::FETCH_ASSOC);
check('a page kit installs as a DRAFT page with a free address, made by the installer; its image is in the library', !empty($r['success']) && $pg['status'] === 'draft' && $pg['clean_slug'] === 'coming-soon-2' && $pg['created_by'] === 'ann' && $pg['title'] === 'Coming Soon' && $pg['layout'] === 'full' && preg_match('#"/site/uploads/\d+_coming-soon-page-logo\.svg"|\\\\/site\\\\/uploads\\\\/\d+_coming-soon-page-logo\.svg#', $pg['content_json']) && count(glob($lt . '/uploads/*logo.svg')) === 1, json_encode($r));
check('…the image goes into the Media folder Library/<kit>, and the page has a first version in its history', (cc_media_meta_all()[basename(glob($lt . '/uploads/*logo.svg')[0])]['folder'] ?? '') === 'Library/Coming Soon' && (int)$ldb->query("SELECT COUNT(*) FROM page_revisions WHERE owner = '" . $pg['id'] . "'")->fetchColumn() === 1);
check('the home page was not touched', (int)$ldb->query("SELECT is_home FROM pages WHERE id = 'old'")->fetchColumn() === 1 && (int)$ldb->query("SELECT COUNT(*) FROM pages WHERE is_home = 1")->fetchColumn() === 1);
$r = cc_lib_install($ldb, cc_lib_read($kitsDir . '/landing-sections'), [], 'ann', '');
check('a section kit adds its sections to My templates, one entry each', !empty($r['success']) && $r['result']['templates'] === 3 && (int)$ldb->query("SELECT COUNT(*) FROM templates WHERE name LIKE 'Landing sections: %'")->fetchColumn() === 3 && json_decode($ldb->query("SELECT content_json FROM templates WHERE name = 'Landing sections: Hero'")->fetchColumn(), true)['type'] === 'SECTION');
$r = cc_lib_install($ldb, cc_lib_read($kitsDir . '/bistro-site'), [], 'ann', '');
check('a site kit without its design adds its pages as drafts and changes nothing else', !empty($r['success']) && count($r['result']['pages']) === 3 && !$r['result']['design'] && (int)$ldb->query("SELECT COUNT(*) FROM pages WHERE created_by = 'ann' AND status = 'draft'")->fetchColumn() === 4 && strpos((string)$ldb->query("SELECT content_json FROM site_parts WHERE name = 'header'")->fetchColumn(), 'Old header') !== false && strpos(file_get_contents($lt . '/data/menu.json'), 'Old') !== false);
check('…its home page is a draft that is not the Home page (the admin chooses)', (int)$ldb->query("SELECT COUNT(*) FROM pages WHERE is_home = 1")->fetchColumn() === 1 && $r['result']['pages'][0]['home'] === true);
$r = cc_lib_install($ldb, cc_lib_read($kitsDir . '/bistro-site'), ['design' => true], 'ann', '');
$hdr = (string)$ldb->query("SELECT content_json FROM site_parts WHERE name = 'header'")->fetchColumn();
$menu = json_decode(file_get_contents($lt . '/data/menu.json'), true); $set = json_decode(file_get_contents($lt . '/data/settings.json'), true);
check('with its design: header, footer, menu items and colours are replaced (a second copy of the pages gets numbered addresses)', !empty($r['result']['design']) && strpos($hdr, 'Bistro') !== false && (int)$ldb->query("SELECT COUNT(*) FROM site_parts WHERE name = 'footer'")->fetchColumn() === 1 && $menu['items'][1]['label'] === 'About' && ($menu['settings']['theme'] ?? '') === 'dark' && $set['brandColor'] === '#b45309' && $set['siteName'] === 'Mine' && (int)$ldb->query("SELECT COUNT(*) FROM pages WHERE clean_slug = 'home-3' OR clean_slug = 'home-2'")->fetchColumn() >= 1, json_encode([$menu, $set]));
$inst = cc_lib_installed();
check('every install is logged, newest first, with the pages it made and how to undo the design', count($inst) === 4 && $inst[0]['id'] === 'bistro-site' && $inst[0]['design'] === true && preg_match('/^undo-[0-9a-f]{12}\.json$/', $inst[0]['undo']) && count($inst[0]['pages']) === 3 && $inst[1]['design'] === false);
[$ok, $msg] = cc_lib_undo($ldb, $inst[0]['install_id']);
$menu2 = json_decode(file_get_contents($lt . '/data/menu.json'), true); $set2 = json_decode(file_get_contents($lt . '/data/settings.json'), true);
check('undo puts back the previous header, no footer, the old menu and the old colours', $ok && strpos((string)$ldb->query("SELECT content_json FROM site_parts WHERE name = 'header'")->fetchColumn(), 'Old header') !== false && (int)$ldb->query("SELECT COUNT(*) FROM site_parts WHERE name = 'footer'")->fetchColumn() === 0 && $menu2['items'][0]['label'] === 'Old' && $set2['brandColor'] === '#111111' && !is_file($lt . '/lib/' . $inst[0]['undo']), $msg);
check('…and cannot be done twice, nor for an install that did not change the design, nor with a made-up id', !cc_lib_undo($ldb, $inst[0]['install_id'])[0] && !cc_lib_undo($ldb, $inst[1]['install_id'])[0] && !cc_lib_undo($ldb, '../../x')[0]);
$r = cc_lib_install($ldb, cc_lib_read($mk('coming-soon-page', function ($d) { unlink("$d/kit.json"); })), [], 'ann', '');
check('an invalid kit is not installed and nothing is added', empty($r['success']) && !empty($r['errors']) && (int)$ldb->query("SELECT COUNT(*) FROM pages")->fetchColumn() === 8);
$r = cc_lib_install($ldb, cc_lib_read($mk('coming-soon-page', function ($d) use ($jr, $jw) { $c = $jr("$d/content.json"); $c['blocks'][] = ['type' => 'HTML', 'content' => ['code' => '<script>alert(1)</script>']]; $jw("$d/content.json", $c); })), [], 'ann', '');
$last = (string)$ldb->query("SELECT content_json FROM pages ORDER BY rowid DESC LIMIT 1")->fetchColumn();
check('a kit with Custom HTML installs without the code, and says so', !empty($r['success']) && $r['result']['dropped_code'] === 1 && strpos($last, 'alert(1)') === false);

// the signed index
$pair = sodium_crypto_sign_keypair(); $GLOBALS['CC_LIB_KEYS'] = [sodium_crypto_sign_publickey($pair)];
$zipK = $lt . '/index-kit.zip'; $z = new ZipArchive(); $z->open($zipK, ZipArchive::CREATE); foreach ($good as $n => $c) $z->addFromString($n, $c); $z->close();
$sha = hash_file('sha256', $zipK);
$entry = ['id' => 'tiny', 'name' => 'Tiny <b>kit</b>', 'type' => 'page', 'version' => '1.0.0', 'author' => 'Ann', 'description' => 'A tiny kit', 'tags' => ['a', 'b'], 'sha256' => $sha, 'url' => 'https://raw.githubusercontent.com/sputlab/canvascore-library/main/tiny.zip', 'size' => filesize($zipK), 'pages' => 1];
$indexBytes = json_encode(['version' => 1, 'kits' => [$entry, ['id' => 'evil-host', 'type' => 'page', 'sha256' => $sha, 'url' => 'https://evil.example/x.zip'], ['id' => 'no-sha', 'type' => 'page', 'url' => 'https://github.com/x.zip'], ['id' => 'bad type', 'type' => 'plugin', 'sha256' => $sha, 'url' => 'https://github.com/x.zip']]]);
$signed = base64_encode(sodium_crypto_sign_detached(cc_lib_signed_message($indexBytes), sodium_crypto_sign_secretkey($pair)));
$fetches = 0; $serve = ['index' => $indexBytes, 'sig' => $signed, 'zip' => file_get_contents($zipK)];
$GLOBALS['CC_LIB_FETCH'] = function ($u, $max) use (&$fetches, &$serve) { $fetches++; if (substr($u, -10) === 'index.json') return $serve['index']; if (substr($u, -4) === '.sig') return $serve['sig']; if (substr($u, -8) === 'tiny.zip') return $serve['zip']; return null; };
$ix = cc_lib_index(true);
check('a library index signed with a trusted key is accepted; entries from another host, without a checksum or with a bad type are dropped', count($ix['kits']) === 1 && $ix['kits'][0]['id'] === 'tiny' && $ix['kits'][0]['sha256'] === $sha, json_encode($ix));
check('…its text is cleaned (no markup in a name)', strpos($ix['kits'][0]['name'], '<') === false);
$f0 = $fetches; cc_lib_index(false);
check('the index is kept for an hour: no new download', $fetches === $f0);
$serve['index'] = $indexBytes . ' ';
$thrown = ''; try { cc_lib_index(true); } catch (RuntimeException $e) { $thrown = $e->getMessage(); }
check('an index that was changed after signing is refused (the last good copy is not replaced)', strpos($thrown, 'not signed') !== false && cc_lib_read_json($lt . '/lib/index.json')['kits'][0]['id'] === 'tiny');
$other = sodium_crypto_sign_keypair(); $serve['index'] = $indexBytes; $serve['sig'] = base64_encode(sodium_crypto_sign_detached(cc_lib_signed_message($indexBytes), sodium_crypto_sign_secretkey($other)));
$thrown = ''; try { cc_lib_index(true); } catch (RuntimeException $e) { $thrown = $e->getMessage(); }
check('…and so is one signed with another key; garbage as a signature too', strpos($thrown, 'not signed') !== false);
$serve['sig'] = 'xx'; $thrown = ''; try { cc_lib_index(true); } catch (RuntimeException $e) { $thrown = $e->getMessage(); }
check('…garbage as a signature', strpos($thrown, 'not signed') !== false);
$GLOBALS['CC_LIB_FETCH'] = function () { return null; };
$st = cc_lib_index(true);
check('when the library cannot be reached the last good copy is shown, marked as stale', !empty($st['stale']) && $st['kits'][0]['id'] === 'tiny' && !empty($st['error']));
@unlink($lt . '/lib/index.json'); $thrown = ''; try { cc_lib_index(true); } catch (RuntimeException $e) { $thrown = $e->getMessage(); }
check('…and with no copy at all it says so', $thrown !== '');
$GLOBALS['CC_LIB_FETCH'] = function ($u, $max) use (&$serve) { return substr($u, -8) === 'tiny.zip' ? $serve['zip'] : null; };
$tmpZip = cc_lib_download($entry);
check('a downloaded kit matching the index checksum is used', is_file($tmpZip) && !cc_lib_read($tmpZip)['errors']); @unlink($tmpZip);
$serve['zip'] .= 'x'; $thrown = ''; try { cc_lib_download($entry); } catch (RuntimeException $e) { $thrown = $e->getMessage(); }
check('a download that differs from the index is refused', strpos($thrown, 'checksum') !== false);
check('addresses are limited to the library\'s hosts, over https', cc_update_url_ok('https://raw.githubusercontent.com/a/b', cc_lib_source()) && !cc_update_url_ok('http://raw.githubusercontent.com/a/b', cc_lib_source()) && !cc_update_url_ok('https://evil.example/a', cc_lib_source()) && !cc_update_url_ok('https://user:pw@github.com/a', cc_lib_source()));
unset($GLOBALS['CC_LIB_FETCH'], $GLOBALS['CC_LIB_KEYS'], $GLOBALS['CC_LIB_DIR'], $GLOBALS['CC_LIB_DATA_DIR'], $GLOBALS['CC_LIB_UPLOADS'], $GLOBALS['CC_MEDIA_META_FILE'], $GLOBALS['CC_MEDIA_FOLDERS_FILE'], $GLOBALS['CC_LIB_APP_VERSION']);
cc_backup_rrmdir($lt);

echo "\nINTEGRATIONS\n";
require_once __DIR__ . '/../../canvascore-admin/integrations.php';
$it = sys_get_temp_dir() . '/cc_int_' . getmypid(); @mkdir($it, 0755, true);
$GLOBALS['CC_INT_FILE'] = $it . '/integrations.json';
check('a webhook address must be https and public: private, loopback, link-local, http and odd addresses are refused', cc_int_webhook_url('https://8.8.8.8/hook') === 'https://8.8.8.8/hook' && cc_int_webhook_url('http://8.8.8.8/hook') === '' && cc_int_webhook_url('https://127.0.0.1/x') === '' && cc_int_webhook_url('https://10.0.0.5/x') === '' && cc_int_webhook_url('https://169.254.169.254/latest') === '' && cc_int_webhook_url('https://localhost/x') === '' && cc_int_webhook_url('ftp://8.8.8.8/x') === '' && cc_int_webhook_url('https://user:pw@8.8.8.8/x') === '' && cc_int_webhook_url(str_repeat('a', 600)) === '');
$wh = cc_int_clean_webhook(['name' => '<b>Zap</b>', 'url' => 'https://8.8.8.8/hook', 'enabled' => 1, 'forms' => ['f_a', 'bad id', 'f_b', 'f_a']]);
check('a webhook is cleaned: a name without markup, valid form ids only, a secret of its own', $wh['name'] === 'Zap' && $wh['forms'] === ['f_a', 'f_b'] && preg_match('/^wh_[a-f0-9]{10}$/', $wh['id']) && strlen($wh['secret']) === 32 && $wh['enabled'] === true);
check('editing a webhook keeps its secret', cc_int_clean_webhook(['id' => $wh['id'], 'url' => 'https://8.8.8.8/other'], $wh)['secret'] === $wh['secret']);
$mcOld = cc_int_defaults()['mailchimp']; $bvOld = cc_int_defaults()['brevo'];
$mcKey = str_repeat('a1', 16) . '-us21';
$mc = cc_int_clean_mailchimp(['enabled' => true, 'api_key' => $mcKey, 'list_id' => 'ab12cd34ef', 'double_optin' => 1, 'forms' => 'all'], $mcOld);
check('a Mailchimp key, audience id and choice are validated; a bad key or id switches it off', $mc['enabled'] && $mc['api_key'] === $mcKey && $mc['list_id'] === 'ab12cd34ef' && $mc['double_optin'] === true && $mc['forms'] === 'all' && !cc_int_clean_mailchimp(['enabled' => true, 'api_key' => 'nope', 'list_id' => 'ab12cd34ef'], $mcOld)['enabled'] && cc_int_clean_mailchimp(['api_key' => $mcKey, 'list_id' => 'X Y'], $mcOld)['list_id'] === '');
check('a saved key is kept when the form sends it masked or empty, and cleared on request', cc_int_clean_mailchimp(['api_key' => '••••us21', 'list_id' => 'ab12cd34ef', 'enabled' => true], $mc)['api_key'] === $mcKey && cc_int_clean_mailchimp(['api_key' => '', 'list_id' => 'ab12cd34ef'], $mc)['api_key'] === $mcKey && cc_int_clean_mailchimp(['clear_key' => true, 'list_id' => 'ab12cd34ef', 'enabled' => true], $mc)['api_key'] === '');
$bvKey = 'xkeysib-' . str_repeat('ab', 20);
$bv = cc_int_clean_brevo(['enabled' => true, 'api_key' => $bvKey, 'list_id' => '7', 'forms' => ['f_x']], $bvOld);
check('a Brevo key and list are validated the same way', $bv['enabled'] && $bv['list_id'] === '7' && $bv['forms'] === ['f_x'] && !cc_int_clean_brevo(['enabled' => true, 'api_key' => 'sk-123', 'list_id' => '7'], $bvOld)['enabled'] && cc_int_clean_brevo(['api_key' => $bvKey, 'list_id' => '7; drop'], $bvOld)['list_id'] === '');
$sk = 'sk_test_' . str_repeat('A1', 20);
check('a Stripe key must be sk_ or rk_ (test or live); anything else changes nothing; masked or empty keeps it', cc_int_clean_stripe_key($sk, '') === $sk && cc_int_clean_stripe_key('pk_test_abc', '') === '' && cc_int_clean_stripe_key('', $sk) === $sk && cc_int_clean_stripe_key('••••AAAA', $sk) === $sk && cc_int_clean_stripe_key('rk_live_' . str_repeat('z', 30), '') !== '');
$cfg = cc_int_defaults(); $cfg['webhooks'] = [$wh]; $cfg['mailchimp'] = $mc; $cfg['brevo'] = $bv; $cfg['stripe']['api_key'] = $sk;
$pub = json_encode(cc_int_public($cfg), JSON_UNESCAPED_UNICODE);
check('what the editor may see has no key and no secret, only hints', strpos($pub, $mcKey) === false && strpos($pub, $bvKey) === false && strpos($pub, $sk) === false && strpos($pub, $wh['secret']) === false && strpos($pub, '••••us21') !== false && strpos($pub, '"mode":"test"') !== false);
check('the file with the keys is saved readable by the web user only (0600)', cc_int_save($cfg) && (fileperms(cc_int_file()) & 0777) === 0600 && cc_int_load()['mailchimp']['api_key'] === $mcKey);
// signing
check('a webhook is signed over "<timestamp>.<body>" with its secret (HMAC-SHA256)', cc_int_sign('s3cret', '1700000000', '{"a":1}') === 'sha256=' . hash_hmac('sha256', '1700000000.{"a":1}', 's3cret') && cc_int_sign('s3cret', '1700000001', '{"a":1}') !== cc_int_sign('s3cret', '1700000000', '{"a":1}'));
// the real caller refuses what it must (no network is used)
$ph = function ($m, $u, $o = []) { return cc_int_http($m, $u, null, $o); };
check('a call to a plain http address, to a private address (public-only calls), to a host that is not the service\'s, or with credentials is refused before any connection', $ph('POST', 'http://8.8.8.8/x', ['public' => true])['code'] === 0 && $ph('POST', 'https://127.0.0.1/x', ['public' => true])['code'] === 0 && $ph('GET', 'https://evil.example/x', ['hosts' => ['api.brevo.com']])['code'] === 0 && $ph('GET', 'https://u:p@api.brevo.com/x', ['hosts' => ['api.brevo.com']])['code'] === 0);
// dispatch with a stubbed network
$idb = new PDO('sqlite::memory:'); $idb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$calls = []; $reply = ['code' => 200, 'body' => '{}', 'error' => ''];
$GLOBALS['CC_INT_HTTP'] = function ($m, $u, $b, $o) use (&$calls, &$reply) { $calls[] = ['m' => $m, 'u' => $u, 'b' => $b, 'o' => $o]; return is_callable($reply) ? $reply($m, $u) : $reply; };
$cfg['webhooks'][0]['forms'] = 'all'; cc_int_save($cfg);
$formA = ['id' => 'f_contact', 'type' => 'form', 'meta' => ['email' => 1, 'name' => 0]];
cc_int_dispatch($idb, $formA, [0 => 'Ann Lee', 1 => 'ann@example.com', 2 => 'Hi'], ['Name' => 'Ann Lee', 'Email' => 'ann@example.com', 'Message' => 'Hi'], 41, 'https://x.test/contact/', 'https://x.test/');
$c0 = $calls[0] ?? null; $body = json_decode($c0['b'] ?? '', true); $hdrs = implode("\n", $c0['o']['headers'] ?? []);
check('a submission is posted to the webhook as JSON: event, form, fields, page and site', count($calls) === 1 && $c0['m'] === 'POST' && $c0['u'] === 'https://8.8.8.8/hook' && $body['event'] === 'form.submitted' && $body['form']['id'] === 'f_contact' && $body['submission']['fields']['Email'] === 'ann@example.com' && $body['submission']['id'] === 41 && $body['site'] === 'https://x.test/' && !empty($c0['o']['public']), json_encode($calls));
preg_match('/X-CanvasCore-Timestamp: (\d+)/', $hdrs, $tm); preg_match('/X-CanvasCore-Signature: (sha256=[a-f0-9]{64})/', $hdrs, $sg);
check('…with the event, a delivery id, a timestamp and a signature the receiver can check', strpos($hdrs, 'X-CanvasCore-Event: form.submitted') !== false && strpos($hdrs, 'X-CanvasCore-Delivery: ') !== false && !empty($tm[1]) && ($sg[1] ?? '') === cc_int_sign($wh['secret'], $tm[1], $c0['b']) && strpos($hdrs, 'Content-Type: application/json') !== false);
$log = $idb->query("SELECT * FROM integration_log")->fetchAll(PDO::FETCH_ASSOC);
check('…and it is logged as sent, without keeping the payload', count($log) === 1 && $log[0]['kind'] === 'webhook' && $log[0]['status'] === 'ok' && (int)$log[0]['code'] === 200 && $log[0]['payload_json'] === '');
check('a form that was not subscribed to a service is not sent anywhere (Mailchimp and Brevo want "newsletter" forms by default)', count($calls) === 1);
$calls = []; $reply = ['code' => 500, 'body' => '', 'error' => ''];
cc_int_dispatch($idb, $formA, [0 => 'Ann', 1 => 'ann@example.com'], ['Name' => 'Ann', 'Email' => 'ann@example.com'], 42, '', 'https://x.test/');
$fail = $idb->query("SELECT * FROM integration_log ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('a webhook that fails is logged as failed, with what to send again', $fail['status'] === 'failed' && (int)$fail['code'] === 500 && strpos($fail['detail'], '500') !== false && json_decode($fail['payload_json'], true)['webhook'] === $wh['id']);
$calls = []; $reply = ['code' => 204, 'body' => '', 'error' => ''];
[$ok, $msg] = cc_int_resend($idb, $fail['id']);
check('"send again" posts the same body again, and when it works the stored payload is dropped', $ok && count($calls) === 1 && json_decode($calls[0]['b'], true)['submission']['id'] === 42 && $idb->query("SELECT payload_json FROM integration_log WHERE id = " . (int)$fail['id'])->fetchColumn() === '' && !cc_int_resend($idb, $fail['id'])[0] && !cc_int_resend($idb, 99999)[0]);
$cfg['webhooks'][0]['forms'] = ['f_other']; cc_int_save($cfg); $calls = [];
cc_int_dispatch($idb, $formA, [1 => 'ann@example.com'], ['Email' => 'ann@example.com'], 43, '', 'https://x.test/');
check('a webhook for chosen forms ignores the others', count($calls) === 0);
$cfg['webhooks'][0]['forms'] = 'all'; $cfg['webhooks'][0]['enabled'] = false; cc_int_save($cfg);
cc_int_dispatch($idb, $formA, [1 => 'ann@example.com'], ['Email' => 'ann@example.com'], 44, '', 'https://x.test/');
check('…and a webhook that is switched off sends nothing', count($calls) === 0);
// newsletter services
$cfg['webhooks'] = []; $cfg['mailchimp']['forms'] = 'newsletter'; $cfg['mailchimp']['double_optin'] = false; $cfg['brevo']['forms'] = 'newsletter'; cc_int_save($cfg);
$nl = ['id' => 'f_news', 'type' => 'newsletter', 'meta' => ['name' => 0, 'email' => 1]];
$calls = []; $reply = ['code' => 200, 'body' => '{}', 'error' => ''];
cc_int_dispatch($idb, $nl, [0 => 'Ann Lee', 1 => 'Ann@Example.com'], ['Name' => 'Ann Lee', 'Email' => 'Ann@Example.com'], 50, '', 'https://x.test/');
$mcCall = $calls[0] ?? []; $bvCall = $calls[1] ?? [];
check('a Newsletter block with no consent text subscribes the email to Mailchimp: a PUT of the member (md5 of the lower-case address), subscribed, with the name', ($mcCall['m'] ?? '') === 'PUT' && ($mcCall['u'] ?? '') === 'https://us21.api.mailchimp.com/3.0/lists/ab12cd34ef/members/' . md5('ann@example.com') && json_decode($mcCall['b'], true)['status_if_new'] === 'subscribed' && json_decode($mcCall['b'], true)['email_address'] === 'Ann@Example.com' && json_decode($mcCall['b'], true)['merge_fields'] === ['FNAME' => 'Ann', 'LNAME' => 'Lee'] && ($mcCall['o']['userpwd'] ?? '') === 'canvascore:' . $mcKey && $mcCall['o']['hosts'] === ['us21.api.mailchimp.com'], json_encode($mcCall));
check('…and to Brevo: a POST of the contact into its list, updating an existing one, with the API key header', ($bvCall['m'] ?? '') === 'POST' && ($bvCall['u'] ?? '') === 'https://api.brevo.com/v3/contacts' && json_decode($bvCall['b'], true) === ['email' => 'Ann@Example.com', 'listIds' => [7], 'updateEnabled' => true, 'attributes' => ['FIRSTNAME' => 'Ann', 'LASTNAME' => 'Lee']] && in_array('api-key: ' . $bvKey, $bvCall['o']['headers'], true));
$cfg['mailchimp']['double_optin'] = true; cc_int_save($cfg); $calls = [];
cc_int_dispatch($idb, $nl, [0 => '', 1 => 'bo@example.com'], ['Email' => 'bo@example.com'], 51, '', 'https://x.test/');
check('with double opt-in the member is "pending" (Mailchimp asks for confirmation); no name sends no merge fields', json_decode($calls[0]['b'], true)['status_if_new'] === 'pending' && !isset(json_decode($calls[0]['b'], true)['merge_fields']));
$calls = [];
cc_int_dispatch($idb, ['id' => 'f_news2', 'type' => 'newsletter', 'meta' => ['email' => 0, 'consent' => 1]], [0 => 'cy@example.com', 1 => ''], ['Email' => 'cy@example.com'], 52, '', 'https://x.test/');
check('consent: a Newsletter block with a consent field that is NOT ticked subscribes nobody', count($calls) === 0);
cc_int_dispatch($idb, ['id' => 'f_news2', 'type' => 'newsletter', 'meta' => ['email' => 0, 'consent' => 1]], [0 => 'cy@example.com', 1 => 'Yes'], ['Email' => 'cy@example.com'], 53, '', 'https://x.test/');
check('…and one that is ticked does', count($calls) === 2);
$calls = [];
cc_int_dispatch($idb, ['id' => 'f_contact', 'type' => 'form', 'meta' => ['email' => 1]], [1 => 'dee@example.com'], ['Email' => 'dee@example.com'], 54, '', 'https://x.test/');
check('a plain contact form is not a signup: with no consent field nobody is subscribed, even if the service is set to "all forms"', count($calls) === 0 && (function () use (&$cfg, &$calls, $idb) { $cfg['mailchimp']['forms'] = 'all'; cc_int_save($cfg); cc_int_dispatch($idb, ['id' => 'f_contact', 'type' => 'form', 'meta' => ['email' => 1]], [1 => 'dee@example.com'], ['Email' => 'dee@example.com'], 55, '', 'https://x.test/'); return count($calls) === 0; })());
cc_int_dispatch($idb, ['id' => 'f_contact', 'type' => 'form', 'meta' => ['email' => 1, 'consent' => 2]], [1 => 'dee@example.com', 2 => 'Yes'], ['Email' => 'dee@example.com'], 56, '', 'https://x.test/');
check('…but a form with a ticked consent field is, when the service takes "all forms" (and Brevo, still on newsletter forms only, is not called)', count($calls) === 1 && strpos($calls[0]['u'], 'mailchimp.com') !== false);
$calls = [];
cc_int_dispatch($idb, ['id' => 'f_news', 'type' => 'newsletter', 'meta' => ['email' => 0]], [0 => 'not-an-email'], ['Email' => 'not-an-email'], 57, '', 'https://x.test/');
check('an address that is not an email is never sent', count($calls) === 0);
$cfg['mailchimp']['forms'] = ['f_only']; cc_int_save($cfg); $calls = [];
cc_int_dispatch($idb, $nl, [0 => 'A', 1 => 'ann@example.com'], ['Email' => 'ann@example.com'], 58, '', 'https://x.test/');
check('a service limited to chosen forms ignores the others (Brevo still takes the newsletter forms)', count($calls) === 1 && strpos($calls[0]['u'], 'brevo') !== false);
$reply = ['code' => 400, 'body' => json_encode(['title' => 'Member Exists', 'detail' => 'ann@example.com is already a list member <b>x</b>']), 'error' => ''];
$cfg['mailchimp']['forms'] = 'newsletter'; cc_int_save($cfg);
cc_int_dispatch($idb, $nl, [0 => 'A', 1 => 'ann@example.com'], ['Email' => 'ann@example.com'], 59, '', 'https://x.test/');
$ff = $idb->query("SELECT * FROM integration_log WHERE kind = 'newsletter' AND status = 'failed' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('a refusal by the service is logged with its reason (no markup) and can be sent again', $ff && strpos($ff['detail'], 'already a list member') !== false && strpos($ff['detail'], '<b>') === false && json_decode($ff['payload_json'], true)['email'] === 'ann@example.com');
$reply = ['code' => 200, 'body' => json_encode(['name' => 'Customers <i>VIP</i>']), 'error' => ''];
check('"test the connection" says which list it reached (Mailchimp and Brevo), without markup', cc_int_test_service('mailchimp', $cfg['mailchimp'])[1] === 'Connected to the audience “Customers VIP”.' && cc_int_test_service('brevo', $cfg['brevo'])[1] === 'Connected to the list “Customers VIP”.' && !cc_int_test_service('brevo', ['api_key' => '', 'list_id' => ''])[0]);
$reply = ['code' => 401, 'body' => json_encode(['message' => 'Key not found']), 'error' => ''];
check('…or why it could not', strpos(cc_int_test_service('brevo', $cfg['brevo'])[1], 'Key not found') !== false && !cc_int_test_service('mailchimp', $cfg['mailchimp'])[0]);
check('the log keeps the newest entries only', (function ($db) { for ($i = 0; $i < CC_INT_LOG_KEEP + 20; $i++) cc_int_log($db, 'webhook', 't', 'e', true, 200, ''); return (int)$db->query("SELECT COUNT(*) FROM integration_log")->fetchColumn() === CC_INT_LOG_KEEP; })($idb));
// the form registry: where the email, name and consent fields are
$GLOBALS['__reg'] = cc_form_registry();
$rb = function ($b) { render_block($b); $r = cc_form_registry(); return end($r); };
$e1 = $rb(['id' => 'nl1', 'type' => 'NEWSLETTER', 'content' => ['askName' => true, 'consentText' => 'I agree']]);
$e2 = $rb(['id' => 'nl2', 'type' => 'NEWSLETTER', 'content' => []]);
$e3 = $rb(['id' => 'fm1', 'type' => 'FORM', 'content' => ['fields' => [['label' => 'Full name', 'type' => 'text'], ['label' => 'Email', 'type' => 'email'], ['label' => 'Message', 'type' => 'textarea']]]]);
$e4 = $rb(['id' => 'wz1', 'type' => 'WIZARD', 'content' => ['steps' => [['title' => 'A', 'fields' => [['label' => 'Your name', 'type' => 'text'], ['label' => 'E-mail', 'type' => 'email']]], ['title' => 'B', 'fields' => [['label' => 'OK?', 'type' => 'consent']]]]]]);
check('the registry says what each form is and where its email, name and consent are: Newsletter (with and without name and consent)', ($e1['type'] ?? '') === 'newsletter' && $e1['meta'] === ['name' => 0, 'email' => 1, 'consent' => 2] && $e2['meta'] === ['email' => 0], json_encode([$e1, $e2]));
check('…Form (by field type and a "name" label) and Multi-step Form (across its steps)', ($e3['type'] ?? '') === 'form' && $e3['meta'] === ['name' => 0, 'email' => 1] && ($e4['type'] ?? '') === 'wizard' && $e4['meta'] === ['name' => 0, 'email' => 1, 'consent' => 2], json_encode([$e3, $e4]));
// analytics
$ga = cc_int_analytics_html(['provider' => 'ga4', 'ga4_id' => 'g-abcd1234', 'consent' => true], true);
check('Google Analytics: the loader and the config, both held back until the visitor accepts cookies when the site has a banner', strpos($ga, 'type="text/plain" data-cc-consent async src="https://www.googletagmanager.com/gtag/js?id=G-ABCD1234"') !== false && strpos($ga, "gtag('config','G-ABCD1234')") !== false && substr_count($ga, 'data-cc-consent') === 2);
$ga2 = cc_int_analytics_html(['provider' => 'ga4', 'ga4_id' => 'G-ABCD1234', 'consent' => true], false);
check('…and plain scripts when there is no banner, or when waiting is switched off', strpos($ga2, 'data-cc-consent') === false && strpos($ga2, '<script async src=') !== false && strpos(cc_int_analytics_html(['provider' => 'ga4', 'ga4_id' => 'G-ABCD1234', 'consent' => false], true), 'data-cc-consent') === false);
$pl = cc_int_analytics_html(['provider' => 'plausible', 'plausible_domain' => 'Example.com'], true);
check('Plausible (no cookies) never waits; a custom host is used when set', strpos($pl, 'data-cc-consent') === false && strpos($pl, 'data-domain="example.com" src="https://plausible.io/js/script.js"') !== false && strpos(cc_int_analytics_html(['provider' => 'plausible', 'plausible_domain' => 'a.com', 'plausible_host' => 'stats.a.com'], false), 'src="https://stats.a.com/js/script.js"') !== false);
$mt = cc_int_analytics_html(['provider' => 'matomo', 'matomo_url' => 'https://m.example.com/analytics', 'matomo_site' => '3'], true);
check('Matomo: its tracker address and site id, held back for the banner', strpos($mt, 'data-cc-consent') !== false && strpos($mt, '"https:\/\/m.example.com\/analytics\/"') !== false && strpos($mt, '"3"') !== false);
check('an id with code in it, a http Matomo address, or a missing id gives no snippet at all', cc_int_analytics_html(['provider' => 'ga4', 'ga4_id' => "G-AAAA'); alert(1);//"], false) === '' && cc_int_analytics_html(['provider' => 'matomo', 'matomo_url' => 'http://m.example.com/', 'matomo_site' => '3'], false) === '' && cc_int_analytics_html(['provider' => 'matomo', 'matomo_url' => 'https://m.example.com/', 'matomo_site' => '3);alert(1'], false) === '' && cc_int_analytics_html(['provider' => 'plausible', 'plausible_domain' => 'x.com"><script>'], false) === '' && cc_int_analytics_html(['provider' => 'none'], false) === '' && cc_int_analytics_html(['provider' => 'ga4'], false) === '');
// Stripe
check('only Stripe payment links are accepted as such', cc_int_stripe_link_ok('https://buy.stripe.com/test_abc123XYZ') && cc_int_stripe_link_ok('https://donate.stripe.com/abcd1234?prefilled_amount=500') && !cc_int_stripe_link_ok('http://buy.stripe.com/abcd1234') && !cc_int_stripe_link_ok('https://evil.example/buy.stripe.com/abcd1234') && !cc_int_stripe_link_ok('https://buy.stripe.com.evil.com/abcd1234') && !cc_int_stripe_link_ok('javascript:alert(1)') && !cc_int_stripe_link_ok('https://buy.stripe.com/ab'));
$calls = [];
$reply = function ($m, $u) { if (substr($u, -9) === '/products') return ['code' => 200, 'body' => json_encode(['id' => 'prod_123']), 'error' => '']; if (substr($u, -7) === '/prices') return ['code' => 200, 'body' => json_encode(['id' => 'price_123']), 'error' => '']; return ['code' => 200, 'body' => json_encode(['id' => 'plink_abcdefgh12', 'url' => 'https://buy.stripe.com/test_xyz789']), 'error' => '']; };
[$link, $msg] = cc_int_stripe_create_link($sk, ['name' => 'Course <b>1</b>', 'amount' => '19,90', 'currency' => 'EUR', 'adjustable' => true]);
parse_str($calls[1]['b'] ?? '', $priceForm); parse_str($calls[2]['b'] ?? '', $linkForm);
check('a payment link is made with three Stripe calls: product, price in the smallest unit, link (with the quantity the buyer can change)', $link && $link['url'] === 'https://buy.stripe.com/test_xyz789' && $link['name'] === 'Course 1' && $link['currency'] === 'eur' && $link['stripe_id'] === 'plink_abcdefgh12' && count($calls) === 3 && $priceForm['unit_amount'] === '1990' && $priceForm['currency'] === 'eur' && $priceForm['product'] === 'prod_123' && $linkForm['line_items']['0']['price'] === 'price_123' && ($linkForm['line_items']['0']['adjustable_quantity']['enabled'] ?? '') === 'true' && in_array('Authorization: Bearer ' . $sk, $calls[0]['o']['headers'], true) && $calls[0]['o']['hosts'] === ['api.stripe.com'], json_encode($calls));
$calls = []; [$jp] = cc_int_stripe_create_link($sk, ['name' => 'Ticket', 'amount' => '500', 'currency' => 'jpy']); parse_str($calls[1]['b'] ?? '', $jpForm);
check('a currency with no decimals (yen) is sent as it is', $jp && $jpForm['unit_amount'] === '500');
check('a name, a price at least 0.50, a known currency are required before Stripe is called', cc_int_stripe_create_link($sk, ['name' => '', 'amount' => '5', 'currency' => 'eur'])[0] === null && cc_int_stripe_create_link($sk, ['name' => 'X', 'amount' => '0.10', 'currency' => 'eur'])[0] === null && cc_int_stripe_create_link($sk, ['name' => 'X', 'amount' => '-3', 'currency' => 'eur'])[0] === null && cc_int_stripe_create_link($sk, ['name' => 'X', 'amount' => 'abc', 'currency' => 'eur'])[0] === null && cc_int_stripe_create_link($sk, ['name' => 'X', 'amount' => '5', 'currency' => 'xyz'])[0] === null);
$reply = ['code' => 401, 'body' => json_encode(['error' => ['message' => 'Invalid API Key provided']]), 'error' => ''];
[$no, $m2] = cc_int_stripe_create_link($sk, ['name' => 'X', 'amount' => '5', 'currency' => 'eur']);
check('a Stripe refusal is reported with its reason, and no link is made', $no === null && strpos($m2, 'Invalid API Key') !== false);
$reply = ['code' => 200, 'body' => json_encode(['id' => 'plink_abcdefgh12', 'active' => false]), 'error' => '']; $calls = [];
check('a link can be switched off at Stripe (a plink_ id only), and the active flag is sent', cc_int_stripe_set_active($sk, 'plink_abcdefgh12', false)[0] && strpos($calls[0]['u'], '/payment_links/plink_abcdefgh12') !== false && strpos($calls[0]['b'], 'active=false') !== false && !cc_int_stripe_set_active($sk, '../prices', false)[0]);
unset($GLOBALS['CC_INT_HTTP'], $GLOBALS['CC_INT_FILE']);
cc_backup_rrmdir($it);

echo "\nPOPUPS\n";
require_once __DIR__ . '/../../canvascore-admin/popups.php';
$def = cc_popup_settings_clean(null);
check('with nothing set a popup is a centred modal that shows after 5 seconds, once a week, everywhere', $def['look']['position'] === 'center' && $def['look']['overlay'] === true && $def['triggers']['time'] === ['on' => true, 'seconds' => 5] && $def['triggers']['scroll']['on'] === false && $def['triggers']['exit']['on'] === false && $def['triggers']['click'] === true && $def['rules']['where']['mode'] === 'all' && $def['rules']['frequency'] === ['mode' => 'days', 'days' => 7] && $def['rules']['visitor'] === 'all' && $def['rules']['devices'] === ['desktop' => true, 'tablet' => true, 'mobile' => true] && $def['rules']['priority'] === 10);
$c = cc_popup_settings_clean(['look' => ['position' => 'sideways', 'width' => 99999, 'animation' => '<b>', 'overlayColor' => 'red;}', 'overlayOpacity' => 500, 'background' => 'url(javascript:x)', 'radius' => -5, 'padding' => 'abc', 'closeEsc' => 0],
    'triggers' => ['time' => ['on' => 1, 'seconds' => -3], 'scroll' => ['on' => true, 'percent' => 0], 'exit' => 'yes'],
    'rules' => ['where' => ['mode' => 'nowhere', 'pages' => ['p1', 'p 2', '../x', str_repeat('a', 70), 'p1'], 'collections' => 'x'], 'devices' => ['mobile' => 0], 'visitor' => 'vip', 'frequency' => ['mode' => 'weekly', 'days' => 9999],
              'schedule' => ['from' => '2026-12-31', 'to' => '2026-01-01'], 'priority' => 0]]);
check('every setting is checked: unknown choices fall back, numbers are held inside their range, colours and ids with anything else in them are dropped', $c['look']['position'] === 'center' && $c['look']['width'] === 1100 && $c['look']['animation'] === 'fade' && $c['look']['overlayColor'] === '#0f172a' && $c['look']['overlayOpacity'] === 90 && $c['look']['radius'] === 0 && $c['look']['padding'] === 28 && $c['look']['closeEsc'] === false && strpos($c['look']['background'], 'javascript') === false && $c['triggers']['time']['seconds'] === 0 && $c['triggers']['scroll']['percent'] === 5 && $c['triggers']['exit']['on'] === false && $c['rules']['where']['mode'] === 'all' && $c['rules']['where']['pages'] === ['p1'] && $c['rules']['where']['collections'] === [] && $c['rules']['devices']['mobile'] === false && $c['rules']['visitor'] === 'all' && $c['rules']['frequency'] === ['mode' => 'days', 'days' => 365] && $c['rules']['priority'] === 1, json_encode($c));
check('a schedule that ends before it starts ends on its first day; dates that are not dates are dropped', $c['rules']['schedule'] === ['from' => '2026-12-31', 'to' => '2026-12-31'] && cc_popup_settings_clean(['rules' => ['schedule' => ['from' => '2026-13-45', 'to' => 'soon']]])['rules']['schedule'] === ['from' => '', 'to' => ''] && cc_popup_settings_clean(['rules' => ['schedule' => ['from' => '2026-02-30']]])['rules']['schedule']['from'] === '' && cc_popup_settings_clean(['rules' => ['schedule' => ['from' => '2028-02-29']]])['rules']['schedule']['from'] === '2028-02-29');
check('popup ids look like pop_ and hex only', cc_popup_id('pop_0123456789') === 'pop_0123456789' && cc_popup_id('pop_../../x') === '' && cc_popup_id('page_1') === '' && cc_popup_id(null) === '' && preg_match('/^pop_[a-f0-9]{10}$/', cc_popup_new_id()));
$where = function ($mode, $pages = [], $cols = []) { return cc_popup_settings_clean(['rules' => ['where' => ['mode' => $mode, 'pages' => $pages, 'collections' => $cols]]]); };
$pg = ['kind' => 'page', 'id' => 'p1']; $it = ['kind' => 'item', 'id' => 'i1', 'collection' => 'c1']; $ar = ['kind' => 'archive', 'collection' => 'c1']; $nf = ['kind' => '404'];
check('where "everywhere": every page, item and archive page, but not the "not found" page', cc_popup_applies($where('all'), $pg) && cc_popup_applies($where('all'), $it) && cc_popup_applies($where('all'), $ar) && !cc_popup_applies($where('all'), $nf));
check('where "only": the chosen pages, and the items and archive pages of the chosen collections', cc_popup_applies($where('include', ['p1']), $pg) && !cc_popup_applies($where('include', ['p2']), $pg) && cc_popup_applies($where('include', [], ['c1']), $it) && cc_popup_applies($where('include', [], ['c1']), $ar) && !cc_popup_applies($where('include', [], ['c2']), $it) && !cc_popup_applies($where('include', ['p1']), $it) && !cc_popup_applies($where('include'), $pg));
check('where "everywhere except": the opposite', !cc_popup_applies($where('exclude', ['p1']), $pg) && cc_popup_applies($where('exclude', ['p2']), $pg) && !cc_popup_applies($where('exclude', [], ['c1']), $it) && cc_popup_applies($where('exclude', [], ['c2']), $it) && cc_popup_applies($where('exclude'), $pg) && !cc_popup_applies($where('exclude'), $nf));
$mk = function ($id, $set = [], $name = 'Offer') { return ['id' => $id, 'name' => $name, 'blocks' => [['id' => 'b', 'type' => 'TEXT', 'content' => ['text' => '<p>Hello</p>']]], 'settings' => cc_popup_settings_clean($set)]; };
$el = cc_popup_element($mk('pop_aaaaaaaa11', ['look' => ['width' => 640, 'radius' => 8, 'background' => '#fafafa']], 'Win <b>"big"</b> & more'));
check('a popup is a hidden dialog with an overlay (that closes it), a close button and its blocks', strpos($el, 'id="cc-popup-pop_aaaaaaaa11"') !== false && strpos($el, ' hidden ') !== false && strpos($el, 'role="dialog" aria-modal="true"') !== false && strpos($el, 'class="cc-popup__overlay" data-cc-popup-close') !== false && strpos($el, 'class="cc-popup__close"') !== false && strpos($el, '<p>Hello</p>') !== false && strpos($el, '--cc-pop-w:640px') !== false && strpos($el, '--cc-pop-bg:#fafafa') !== false && strpos($el, '--cc-pop-radius:8px') !== false && strpos($el, '--cc-pop-ov:rgba(15,23,42,0.6)') !== false);
check('…its name is only ever text (an aria-label, escaped)', strpos($el, 'aria-label="Win &lt;b&gt;&quot;big&quot;&lt;/b&gt; &amp; more"') !== false && strpos($el, '<b>"big"') === false);
$el2 = cc_popup_element($mk('pop_bbbbbbbb22', ['look' => ['position' => 'bottom-right', 'overlay' => true, 'closeButton' => false, 'closeOverlay' => false]]));
check('a slide-in has no overlay and no modal behaviour; the close button can be left out', strpos($el2, 'cc-popup--bottom-right') !== false && strpos($el2, 'cc-popup__overlay') === false && strpos($el2, 'aria-modal="false"') !== false && strpos($el2, 'cc-popup__close') === false);
$el3 = cc_popup_element($mk('pop_cccccccc33', ['look' => ['closeOverlay' => false]]));
check('a modal can keep its overlay without closing on a click', strpos($el3, 'class="cc-popup__overlay"></div>') !== false && strpos($el3, 'data-cc-popup-close></div>') === false);
$pop = $mk('pop_dddddddd44', ['triggers' => ['time' => ['on' => true, 'seconds' => 3]]], 'Evil </script><script>alert(1)</script>');
$out = cc_popups_html([$pop, $mk('pop_eeeeeeee55', ['rules' => ['where' => ['mode' => 'include', 'pages' => ['other']]]])], ['kind' => 'page', 'id' => 'p1']);
preg_match('#<script type="application/json" id="cc-popups-data">(.*?)</script>#s', $out, $jm); $list = json_decode($jm[1] ?? '', true);
check('a page gets the popups that apply to it: the style sheet, the popup, the list for the runtime (as JSON) and the runtime; the others are absent', strpos($out, '<style id="cc-popups-css">') !== false && strpos($out, 'id="cc-popup-pop_dddddddd44"') !== false && strpos($out, 'cc-popup-pop_eeeeeeee55') === false && count($list) === 1 && $list[0]['id'] === 'pop_dddddddd44' && $list[0]['triggers']['time'] === ['on' => true, 'seconds' => 3] && strpos($out, 'cc-popups-data') !== false && strpos($out, 'cc_popup_') !== false);
check('…the list for the runtime holds no text of the popup, and nothing in the page can end the script early', !isset($list[0]['name']) && substr_count($out, '</script>') === 2 && strpos($jm[1], '<') === false);
check('a page no popup applies to gets nothing at all', cc_popups_html([$mk('pop_ffffffff66', ['rules' => ['where' => ['mode' => 'include', 'pages' => ['x']]]])], ['kind' => 'page', 'id' => 'p1']) === '' && cc_popups_html([$pop], ['kind' => '404']) === '' && cc_popups_html([], $pg) === '');
$pdb = new PDO('sqlite::memory:'); $pdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
foreach (cc_db_migrations() as $mig) $mig($pdb);
$ins = $pdb->prepare("INSERT INTO popups (id, name, status, content_json, settings_json, created_at) VALUES (?,?,?,?,?,?)");
$ins->execute(['pop_1111111111', 'Live', 'published', json_encode([['id' => 'b', 'type' => 'TEXT', 'content' => ['text' => 'x']]]), '{"triggers":{"time":{"seconds":9999}}}', '2026-10-01']);
$ins->execute(['pop_2222222222', 'Draft', 'draft', json_encode([['id' => 'b', 'type' => 'TEXT', 'content' => ['text' => 'x']]]), '{}', '2026-10-02']);
$ins->execute(['pop_3333333333', 'Empty', 'published', '[]', '{}', '2026-10-03']);
$ins->execute(['pop_4444444444', 'Broken', 'published', 'not json', 'not json', '2026-10-04']);
$pub = cc_popups_published($pdb);
check('the migration makes the popups table; only published popups with content are written to the site, and bad stored settings are cleaned', count($pub) === 1 && $pub[0]['id'] === 'pop_1111111111' && $pub[0]['settings']['triggers']['time']['seconds'] === 600);
$reg0 = cc_form_registry();
cc_popup_element(['id' => 'pop_5555555555', 'name' => 'Form', 'settings' => cc_popup_settings_clean([]), 'blocks' => [['id' => 'pf', 'type' => 'FORM', 'content' => ['customId' => 'in-popup', 'fields' => [['label' => 'Email', 'type' => 'email']]]]]]);
check('a form in a popup is registered like any form (it can be answered, mailed, sent to a webhook)', isset(cc_form_registry()['f_in-popup']) && cc_form_registry()['f_in-popup']['meta'] === ['email' => 0]);
check('popups are in a site backup and a contributor cannot change them', in_array('popups', CC_BACKUP_TABLES, true) && in_array('save_popup', CC_CONTRIBUTOR_DENIED, true) && in_array('delete_popup', CC_CONTRIBUTOR_DENIED, true));

echo "\nLANGUAGES\n";
require_once __DIR__ . '/../../canvascore-admin/languages.php';
check('a language code is two or three letters and an optional region, lowercased; the rest is not a code', cc_lang_code(' IT ') === 'it' && cc_lang_code('pt-BR') === 'pt-br' && cc_lang_code('zh-hans') === 'zh-hans' && cc_lang_code('../x') === '' && cc_lang_code('a') === '' && cc_lang_code('english') === '' && cc_lang_code(['it']) === '' && cc_lang_code(null) === '');
check('…and is written the way browsers and search engines write it', cc_lang_tag('pt-br') === 'pt-BR' && cc_lang_tag('it') === 'it' && cc_lang_tag('zh-hans') === 'zh-hans' && cc_lang_tag('x') === '');
$cc = cc_lang_config_clean(['enabled' => 1, 'default' => 'xx', 'list' => [['code' => 'EN', 'name' => " English\n<b> "], ['code' => 'it', 'name' => ''], ['code' => 'it', 'name' => 'dup'], ['code' => 'bad_code', 'name' => 'x'], 'junk', ['code' => 'de', 'name' => str_repeat('é', 80)]],
    'strings' => ['it' => ['announcement' => ['text' => 'Ciao', 'linkText' => '', 'junk' => 'x'], 'cookie' => ['acceptLabel' => 'Accetta']], 'en' => ['cookie' => ['text' => 'no']], 'fr' => ['cookie' => ['text' => 'no']], 'de' => ['announcement' => [], 'cookie' => []]]]);
check('the languages are cleaned: valid unique codes, names as one line of text (40 characters), an unknown default is the first language, texts only for the other languages and only the ones filled in', $cc['enabled'] === true && array_column($cc['list'], 'code') === ['en', 'it', 'de'] && $cc['default'] === 'en' && $cc['list'][0]['name'] === 'English <b>' && $cc['list'][1]['name'] === 'IT' && mb_strlen($cc['list'][2]['name']) === 40 && array_keys($cc['strings']) === ['it'] && $cc['strings']['it']['announcement'] === ['text' => 'Ciao'] && $cc['strings']['it']['cookie'] === ['acceptLabel' => 'Accetta'], json_encode($cc));
$many = []; for ($i = 0; $i < 20; $i++) $many[] = ['code' => 'a' . chr(97 + $i), 'name' => "L$i"];
check('a site has at most 12 languages; nothing in the settings gives an empty, switched-off configuration', count(cc_lang_config_clean(['enabled' => true, 'list' => $many])['list']) === CC_LANG_MAX && cc_lang_config_clean(null) === ['enabled' => false, 'default' => '', 'list' => [], 'strings' => []] && cc_lang_config_clean('x')['list'] === []);
$c2 = cc_lang_config_clean(['enabled' => true, 'default' => 'en', 'list' => [['code' => 'en', 'name' => 'English'], ['code' => 'it', 'name' => 'Italiano']]]);
check('multilingual: switched on and two languages at least', cc_lang_active($c2) && !cc_lang_active(array_merge($c2, ['enabled' => false])) && !cc_lang_active(cc_lang_config_clean(['enabled' => true, 'list' => [['code' => 'en', 'name' => 'E']]])));
check('the language of a page for the site: the default is "", another language its code; unknown codes are not published; a site that is not multilingual has one language', cc_lang_norm('it', $c2) === 'it' && cc_lang_norm('en', $c2) === '' && cc_lang_norm('', $c2) === '' && cc_lang_norm('xx', $c2) === '' && cc_lang_norm('it', array_merge($c2, ['enabled' => false])) === '' && cc_lang_known('it', $c2) && cc_lang_known('', $c2) && !cc_lang_known('xx', $c2) && !cc_lang_known('it', array_merge($c2, ['enabled' => false])) && cc_lang_known('en', array_merge($c2, ['enabled' => false])));
check('the folder of a language: none for the default', cc_lang_prefix('it', $c2) === 'it/' && cc_lang_prefix('en', $c2) === '' && cc_lang_prefix('', $c2) === '' && cc_lang_prefix('it', array_merge($c2, ['enabled' => false])) === '' && cc_lang_of('', $c2) === 'en' && cc_lang_of('it', $c2) === 'it' && cc_lang_name('it', $c2) === 'Italiano' && cc_lang_name('xx', $c2) === 'XX');
check('a language folder is not an address any page or collection may take (except in its own language)', cc_lang_folder_taken('it', $c2) && !cc_lang_folder_taken('en', $c2) && !cc_lang_folder_taken('about', $c2) && !cc_lang_folder_taken('it', array_merge($c2, ['enabled' => false])));
$h = cc_hreflang_html(['en' => 'https://x.test/about/', 'pt-br' => 'https://x.test/pt-br/sobre/?a=1&b=2'], 'en');
check('hreflang links: one per language (written as "pt-BR"), the default one also as x-default, addresses escaped; none for a page that has no translation', substr_count($h, 'rel="alternate"') === 3 && strpos($h, 'hreflang="pt-BR" href="https://x.test/pt-br/sobre/?a=1&amp;b=2"') !== false && strpos($h, 'hreflang="x-default" href="https://x.test/about/"') !== false && cc_hreflang_html(['en' => 'https://x.test/'], 'en') === '' && cc_hreflang_html([], 'en') === '');
$swb = function ($c = []) { return ['id' => 'sw1', 'type' => 'LANGUAGE_SWITCHER', 'styles' => ['padding' => '4px'], 'content' => $c]; };
check('the Language Switcher shows nothing outside a build, and nothing on a one-language site', cc_render_language_switcher($swb()) === '' && render_block($swb()) === '');
$alts = ['en' => '{{BASE_URL}}about/', 'it' => '{{BASE_URL}}it/chi-siamo/'];
cc_lang_context(['lang' => 'it', 'self' => 'it', 'alternates' => $alts, 'cfg' => $c2]);
$sw = render_block($swb());
check('as a list: a link to each other language\'s version, the current one as plain text marked current, with lang and hreflang', strpos($sw, '<nav class="cc-lang-switch cc-lang-list"') !== false && strpos($sw, 'href="{{BASE_URL}}about/" hreflang="en" lang="en"') !== false && strpos($sw, '<span class="cc-lang-current" aria-current="true" lang="it"') !== false && strpos($sw, 'it/chi-siamo') === false && strpos($sw, '>English<') !== false && strpos($sw, '>Italiano<') !== false && strpos($sw, 'padding') !== false);
$sw = render_block($swb(['style' => 'dropdown', 'labels' => 'code', 'showCurrent' => false]));
check('as a drop-down of codes without the current language; choosing goes to the address', strpos($sw, '<select aria-label="Language"') !== false && strpos($sw, '<option value="{{BASE_URL}}about/" lang="en">EN</option>') !== false && strpos($sw, 'IT</option>') === false && strpos($sw, 'location.href=this.value') !== false);
cc_lang_context(['lang' => '', 'self' => 'en', 'alternates' => ['it' => '{{BASE_URL}}it/'], 'cfg' => array_merge($c2, ['list' => array_merge($c2['list'], [['code' => 'de', 'name' => 'Deutsch']])])]);
$sw = render_block($swb());
check('a language the page has no translation in and that has no home page is left out; one with a home is offered the home', strpos($sw, 'hreflang="it"') !== false && strpos($sw, 'hreflang="de"') === false && strpos($sw, '<span class="cc-lang-current"') !== false);
check('a button or a menu link to the home page goes to the home page of the language being published', cc_block_url('index.html') === '{{BASE_URL}}' && (cc_lang_context(['lang' => 'it', 'self' => 'it', 'alternates' => [], 'cfg' => $c2]) || true) && cc_block_url('index.html') === '{{BASE_URL}}it/' && cc_block_url('home/index.html') === '{{BASE_URL}}it/' && cc_menu_url('index.html') === '{{BASE_URL}}it/' && cc_block_url('about/index.html') === '{{BASE_URL}}about/' && cc_block_url('/') === '{{BASE_URL}}');
$li = [['id' => 'a', 'lang' => ''], ['id' => 'b', 'lang' => 'it'], ['id' => 'c', 'lang' => 'en'], ['id' => 'd', 'lang' => 'xx']];
check('a list on a page shows the items in the language of the page (the unmarked ones are the default language; unknown languages are never shown)', implode(',', array_column(cc_lang_filter_items($li), 'id')) === 'b');
cc_lang_context(['lang' => '', 'self' => 'en', 'alternates' => [], 'cfg' => $c2]);
check('…the default language\'s page shows the unmarked and the default\'s own', implode(',', array_column(cc_lang_filter_items($li), 'id')) === 'a,c');
cc_lang_context(null);
check('…and everything when no language is being published (the editor, a site that is not multilingual)', count(cc_lang_filter_items($li)) === 4);
$pl = cc_popup_settings_clean(['rules' => ['language' => 'IT']]); $plx = cc_popup_settings_clean(['rules' => ['language' => '../x']]);
check('a popup can be written for one language: the code is checked, none means every language', $pl['rules']['language'] === 'it' && $plx['rules']['language'] === '' && cc_popup_settings_clean(null)['rules']['language'] === '');
check('…it appears on the pages, items and listings of that language only; with no language on the page (a site that is not multilingual) there is no limit', cc_popup_applies($pl, ['kind' => 'page', 'id' => 'p1', 'lang' => 'it']) && !cc_popup_applies($pl, ['kind' => 'page', 'id' => 'p1', 'lang' => 'en']) && !cc_popup_applies($pl, ['kind' => 'item', 'id' => 'i', 'collection' => 'c', 'lang' => 'en']) && cc_popup_applies($pl, ['kind' => 'archive', 'collection' => 'c', 'lang' => 'it']) && cc_popup_applies($pl, ['kind' => 'page', 'id' => 'p1', 'lang' => '']) && cc_popup_applies($pl, ['kind' => 'page', 'id' => 'p1']) && cc_popup_applies($def, ['kind' => 'page', 'id' => 'p1', 'lang' => 'de']));
check('the texts of a language replace the site\'s, only where filled in', cc_lang_override(['text' => 'We use cookies', 'acceptLabel' => 'Accept'], ['text' => 'Usiamo i cookie', 'acceptLabel' => '', 'x' => 5]) === ['text' => 'Usiamo i cookie', 'acceptLabel' => 'Accept'] && cc_lang_override(null, ['text' => 'a']) === ['text' => 'a'] && cc_lang_override(['text' => 'a'], null) === ['text' => 'a']);
$ldb = new PDO('sqlite::memory:'); $ldb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
foreach (cc_db_migrations() as $mig) $mig($ldb);
$cols = function ($t) use ($ldb) { return array_column($ldb->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name'); };
check('the migration gives pages and collection items a language and a translation group (both empty for what exists)', in_array('lang', $cols('pages'), true) && in_array('trans_group', $cols('pages'), true) && in_array('lang', $cols('collection_items'), true) && in_array('trans_group', $cols('collection_items'), true));
check('the language library file and the language settings are protected like the other library files', strpos(file_get_contents(__DIR__ . '/../../canvascore-admin/config.php'), '|languages|') !== false && in_array('languages.php', CC_UPDATE_REQUIRED, true) && in_array('save_languages', CC_CONTRIBUTOR_DENIED, true));

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
$udb2->exec("CREATE TABLE collection_items (id TEXT, collection_id TEXT, title TEXT, slug TEXT, status TEXT, lang TEXT DEFAULT '')");
$udb2->exec("INSERT INTO collections VALUES ('c1', 'Blog', 'blog'), ('c2', 'News', 'news')");
$udb2->exec("INSERT INTO collection_items (id, collection_id, title, slug, status) VALUES ('d1', 'c1', 'Draft A', 'a', 'draft'), ('p1', 'c1', 'Live A', 'a', 'published')");
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

echo "\nONE-CLICK UPDATES\n";
check('release tags are read as versions (v0.21.0 → 0.21.0), anything else is refused', cc_update_version('v0.21.0') === '0.21.0' && cc_update_version('1.2.3') === '1.2.3' && cc_update_version('latest') === null && cc_update_version('1.2.3-beta') === null);
$gh = cc_update_source();
check('downloads only over HTTPS from GitHub\'s hosts', cc_update_url_ok('https://api.github.com/repos/x/y', $gh) && cc_update_url_ok('https://objects.githubusercontent.com/a', $gh)
    && !cc_update_url_ok('http://api.github.com/repos/x/y', $gh) && !cc_update_url_ok('https://evil.example/x.zip', $gh) && !cc_update_url_ok('https://user:pw@github.com/x', $gh) && !cc_update_url_ok('file:///etc/passwd', $gh));
check('the shipped release key is a valid Ed25519 public key', count(cc_update_keys()) >= 1);
$ut = sys_get_temp_dir() . '/cc_upd_' . getmypid(); @mkdir($ut);
$kp = sodium_crypto_sign_keypair(); $pk = sodium_crypto_sign_publickey($kp); $sk = sodium_crypto_sign_secretkey($kp);
$pkg = function ($entries, $name = 'p.zip') use ($ut) {
    $f = "$ut/$name"; @unlink($f);
    $z = new ZipArchive(); $z->open($f, ZipArchive::CREATE);
    foreach ($entries as $n => $c) { if (is_array($c)) { $z->addFromString($n, $c[0]); $z->setExternalAttributesName($n, ZipArchive::OPSYS_UNIX, $c[1] << 16); } else $z->addFromString($n, $c); }
    $z->close(); return $f;
};
$good = ['canvascore-admin/version.json' => '{"app":"9.0.0"}', 'canvascore-admin/assets/app.js' => 'x'];
foreach (CC_UPDATE_REQUIRED as $f) if ($f !== 'version.json') $good["canvascore-admin/$f"] = substr($f, -5) === '.json' ? '{}' : "<?php // $f\n";
$f = $pkg($good);
$sig = base64_encode(sodium_crypto_sign_detached(cc_update_signed_message($f), $sk));
check('a package signed with a trusted key verifies', cc_update_verify($f, $sig, [$pk]));
$other = sodium_crypto_sign_keypair();
check('…signed with another key it is refused', !cc_update_verify($f, base64_encode(sodium_crypto_sign_detached(cc_update_signed_message($f), sodium_crypto_sign_secretkey($other))), [$pk]));
check('…and so is a garbled or empty signature, or no trusted key', !cc_update_verify($f, 'AAAA', [$pk]) && !cc_update_verify($f, '', [$pk]) && !cc_update_verify($f, $sig, []));
file_put_contents($f, 'x', FILE_APPEND);
check('a package changed after signing is refused', !cc_update_verify($f, $sig, [$pk]));
$inspect = function ($entries, $ver = '9.0.0') use ($pkg) {
    $z = new ZipArchive(); $z->open($pkg($entries));
    try { $files = cc_update_inspect($z, $ver); $z->close(); return $files; } catch (Throwable $e) { $z->close(); return $e->getMessage(); }
};
$r = $inspect($good);
check('a complete package passes the checks, with every file listed', is_array($r) && isset($r['assets/app.js'], $r['api.php']) && count($r) === count($good), is_string($r) ? $r : '');
check('a file outside the admin folder is refused', is_string($inspect($good + ['canvascore-admin/../evil.php' => 'x'])) && is_string($inspect($good + ['other/evil.php' => 'x'])) && is_string($inspect($good + ['canvascore-admin/a\\..\\b.php' => 'x'])));
check('…and so is a file for the site\'s data folder or .htaccess', strpos((string)$inspect($good + ['canvascore-admin/data/canvascore.sqlite' => 'x']), 'belongs to the site') !== false && is_string($inspect($good + ['canvascore-admin/.htaccess' => 'x'])));
check('…and a link', strpos((string)$inspect($good + ['canvascore-admin/link' => ['/etc/passwd', 0120777]]), 'link') !== false);
$missing = $good; unset($missing['canvascore-admin/update-keys.php']);
check('…and an incomplete package', strpos((string)$inspect($missing), 'update-keys.php is missing') !== false);
check('…and one whose version.json is not the release\'s version', strpos((string)$inspect($good, '9.0.1'), 'not version 9.0.1') !== false);
// the swap keeps the data folder (when inside the admin folder) and the site's .htaccess; the undo puts everything back
$adm = "$ut/site/canvascore-admin"; @mkdir("$adm/data", 0755, true);
file_put_contents("$adm/api.php", 'old'); file_put_contents("$adm/data/canvascore.sqlite", 'db'); file_put_contents("$adm/.htaccess", 'mine');
$z = new ZipArchive(); $z->open($pkg($good)); cc_update_unpack($z, cc_update_inspect($z, '9.0.0'), "$ut/site/.new"); $z->close();
check('the package unpacks into the new folder', is_file("$ut/site/.new/assets/app.js") && strpos(file_get_contents("$ut/site/.new/api.php"), 'api.php') !== false);
check('a PHP file that can\'t be parsed is found before the swap', cc_update_syntax_error("$ut/site/.new") === null && (file_put_contents("$ut/site/.new/assets/bad.php", '<?php function (') || true) && strpos((string)cc_update_syntax_error("$ut/site/.new"), 'assets/bad.php') === 0);
unlink("$ut/site/.new/assets/bad.php");
cc_update_swap($adm, "$ut/site/.new", "$ut/site/.old");
check('swap: the new version takes the admin folder\'s place', strpos(file_get_contents("$adm/api.php"), 'api.php') !== false && !is_dir("$ut/site/.new"));
check('…the data folder inside it moves along, and the site\'s .htaccess is kept', file_get_contents("$adm/data/canvascore.sqlite") === 'db' && file_get_contents("$adm/.htaccess") === 'mine' && !is_dir("$ut/site/.old/data"));
check('rollback: the old version and its data folder are back', cc_update_unswap($adm, "$ut/site/.old", "$ut/site/.failed") && file_get_contents("$adm/api.php") === 'old' && file_get_contents("$adm/data/canvascore.sqlite") === 'db' && !is_dir("$ut/site/.old") && !is_dir("$ut/site/.failed"));
cc_backup_rrmdir($ut);

echo "\nSHARED BLOCK DEFINITIONS\n";
$defs = cc_block_defs();
check('every definition in blocks/ loads', count($defs) === count(glob(__DIR__ . '/../../canvascore-admin/blocks/*.json')) && isset($defs['TEXT'], $defs['CALLOUT']));
$unsafe = [];
foreach ($defs as $t => $d) foreach ($d['settings'] ?? [] as $k => $s) {
    if (($s['type'] ?? '') === 'richtext' && !in_array($k, CC_RICH_FIELDS[$t] ?? [], true)) $unsafe[] = "$t.$k";
    foreach (($s['type'] ?? '') === 'list' ? ($s['item'] ?? []) : [] as $ik => $is) if (($is['type'] ?? '') === 'richtext' && !in_array("{$k}[].$ik", CC_RICH_FIELDS[$t] ?? [], true)) $unsafe[] = "$t.{$k}[].$ik";
}
check('every rich-text setting is also cleaned when it is saved (CC_RICH_FIELDS)', !$unsafe, implode(', ', $unsafe));
$h = render_block(['id' => 'x1', 'type' => 'CALLOUT', 'content' => ['text' => '<p>ok</p><img src=x onerror=alert(1)><script>bad()</script>', 'title' => '<b>t</b>']]);
check('rich text from a definition is sanitized on the site, plain text escaped', strpos($h, '<p>ok</p>') !== false && strpos($h, 'onerror') === false && strpos($h, 'bad()') === false && strpos($h, '&lt;b&gt;t&lt;/b&gt;') !== false);
$p = function ($c) { return render_block(['id' => 'pg', 'type' => 'PROGRESS', 'content' => $c]); };
check('a behaviour script comes from the definition, only when it is needed', strpos($p(['items' => [['value' => 5]]]), "getElementById('pg')") !== false && strpos($p(['items' => [['value' => 5]], 'animate' => false]), '<script>') === false && strpos($p(['items' => []]), '<script>') === false);
check('content of the wrong type never stops a publish (it gets the defaults)', strpos(render_block(['id' => 'w', 'type' => 'TIMELINE', 'content' => ['items' => [['title' => ['x'], 'date' => ['y']]], 'layout' => ['z']]]), 'cc-timeline-left') !== false);
check('a definition with a broken template is refused', (function () { try { cc_tpl_parse('{{#a}}x'); return false; } catch (Throwable $e) { return true; } })());

echo "\nBLOCK PACKAGES\n";
$GLOBALS['CC_PKG_APP_VERSION'] = '0.22.0';
$pt = sys_get_temp_dir() . '/cc_pkg_' . getmypid(); @mkdir($pt . '/site', 0755, true); @mkdir($pt . '/data', 0755, true);
$GLOBALS['CC_PACKAGES_DIR'] = $pt . '/data/packages'; $GLOBALS['CC_SITE_ROOT'] = $pt . '/site';
$example = realpath(__DIR__ . '/../../docs/examples/block-packages/pull-quote');
$pkgZip = function (array $files, $name = 'p.zip') use ($pt) {
    $f = "$pt/$name"; @unlink($f);
    $z = new ZipArchive(); $z->open($f, ZipArchive::CREATE);
    foreach ($files as $n => $c) $z->addFromString($n, $c);
    $z->close(); return $f;
};
$exFiles = function () use ($example) {
    $out = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($example, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) $out[str_replace('\\', '/', substr($f->getPathname(), strlen($example) + 1))] = file_get_contents($f->getPathname());
    return $out;
};
// the example with one change: $edit gets the files and the decoded block, and returns them changed
$mutant = function ($edit) use ($exFiles, $pkgZip) {
    $files = $exFiles(); $b = json_decode($files['blocks/pull-quote.json'], true);
    $m = json_decode($files['package.json'], true);
    [$files, $b, $m] = $edit($files, $b, $m);
    $files['blocks/pull-quote.json'] = json_encode($b); $files['package.json'] = json_encode($m);
    return $pkgZip($files, 'mut.zip');
};
$refused = function ($zip, $needle) { $r = cc_pkg_install($zip); $all = implode(' | ', $r['errors']) . ' ' . $r['message']; return empty($r['success']) && stripos($all, $needle) !== false ? true : $all; };

$ex = cc_pkg_read($example);
check('the example package reads without problems', !$ex['errors'] && $ex['id'] === 'pull-quote' && count($ex['blocks']) === 1 && count($ex['assets']) === 1, json_encode($ex['errors']));
check('its own tests and the hostile-value fuzz pass', cc_pkg_run_checks($ex['id'], $ex['blocks']) === [], json_encode(cc_pkg_run_checks($ex['id'], $ex['blocks'])));
check('a block type is made from the package and block names, and cannot clash with a core type', cc_pkg_type('pull-quote', 'pull-quote') === 'X_PULL_QUOTE__PULL_QUOTE' && !isset(cc_block_defs()['X_PULL_QUOTE__PULL_QUOTE']));
$zip1 = $pkgZip($exFiles(), 'ex.zip');
$r = cc_pkg_install($zip1, 'ann');
check('a valid package installs: files in the data folder, images in the site, registered and enabled', !empty($r['success']) && is_file($pt . '/data/packages/pull-quote/blocks/pull-quote.json') && is_file($pt . '/site/canvascore-blocks/pull-quote/quote.svg')
    && (cc_pkg_registry()['pull-quote']['enabled'] ?? false) === true && (cc_pkg_registry()['pull-quote']['installed_by'] ?? '') === 'ann', json_encode($r));
check('…the folder of images is closed to scripts (its own .htaccess)', strpos((string)@file_get_contents($pt . '/site/canvascore-blocks/.htaccess'), 'php') !== false);
cc_block_defs(true);
$T = 'X_PULL_QUOTE__PULL_QUOTE';
$h = render_block(['id' => 'q1', 'type' => $T, 'content' => ['quote' => 'Hi <b>x</b>', 'author' => 'Ann', 'link' => 'javascript:alert(1)', 'linkText' => 'src'], 'styles' => ['padding' => '5px']]);
check('its block is rendered by the site, escaped, with the package class for its CSS', strpos($h, 'class="pq cc-pkg-pull-quote"') !== false && strpos($h, 'Hi &lt;b&gt;x&lt;/b&gt;') !== false && strpos($h, 'href="javascript:') === false && strpos($h, 'padding: 5px;') !== false, $h);
check('…and a type nobody installed is still "Unknown element"', strpos(render_block(['id' => 'z', 'type' => 'X_NOPE__NOPE', 'content' => []]), 'Unknown element') !== false);
$css = cc_pkg_css();
check('the package CSS is nested under its own class, with its image address, and nothing else is added', strpos($css, '.cc-pkg-pull-quote{') === 0 && strpos($css, '{{BASE_URL}}canvascore-blocks/pull-quote/quote.svg') !== false && strpos($css, '__ASSETS__') === false && substr_count($css, '.cc-pkg-') === 1 && substr($css, -2) === "}\n" && strpos($css, '{&.pq {') !== false, json_encode($css));
$pl = cc_pkg_editor_payload();
check('the editor gets the enabled packages: definition, catalog, defaults and the style sheet', count($pl['packages']) === 1 && $pl['packages'][0]['blocks'][0]['type'] === $T && $pl['packages'][0]['blocks'][0]['catalog']['label'] === 'Pull Quote'
    && ($pl['packages'][0]['blocks'][0]['defaults']['content']['author'] ?? '') === 'Steve Jobs' && $pl['css'] === $css && !isset($pl['packages'][0]['blocks'][0]['definition']['_ast']));
$r = cc_pkg_install($zip1);
check('the same version again is refused (upload a newer one, or remove it first)', empty($r['success']) && stripos(implode(' ', $r['errors']), 'already installed') !== false);
$up = $mutant(function ($f, $b, $m) { $m['version'] = '1.1.0'; $b['catalog']['label'] = 'Pull Quote 2'; return [$f, $b, $m]; });
$r = cc_pkg_install($up);
check('a newer version replaces it (and keeps it enabled)', !empty($r['success']) && (cc_pkg_registry()['pull-quote']['version'] ?? '') === '1.1.0' && (cc_pkg_load('pull-quote')['blocks'][0]['catalog']['label'] ?? '') === 'Pull Quote 2');
cc_pkg_set_enabled('pull-quote', false); cc_block_defs(true);
check('switched off, its blocks are not published and its CSS is left out', strpos(render_block(['id' => 'q1', 'type' => $T, 'content' => []]), 'Unknown element') !== false && cc_pkg_css() === '' && cc_pkg_editor_payload()['packages'] === []);
cc_pkg_set_enabled('pull-quote', true); cc_block_defs(true);
$mem = new PDO('sqlite::memory:'); $mem->exec("CREATE TABLE pages (id TEXT, content_json TEXT)");
$mem->prepare("INSERT INTO pages VALUES ('p1', ?)")->execute([json_encode([['id' => 'a', 'type' => $T, 'content' => []]])]);
check('the admin sees where a package is used', cc_pkg_info($mem)[0]['used'] === 1 && cc_pkg_info($mem)[0]['blocks'][0]['type'] === $T);
cc_pkg_remove('pull-quote'); cc_block_defs(true);
check('removing it deletes its files and its images and takes its blocks off', !is_dir($pt . '/data/packages/pull-quote') && !is_dir($pt . '/site/canvascore-blocks/pull-quote') && cc_pkg_registry() === [] && strpos(render_block(['id' => 'q1', 'type' => $T, 'content' => []]), 'Unknown element') !== false);

echo "\nBLOCK PACKAGES: WHAT IS REFUSED\n";
$tpl = function ($mut) use ($mutant) { return $mutant(function ($f, $b, $m) use ($mut) { $b['template'] = $mut($b['template']); return [$f, $b, $m]; }); };
check('a <script> in a template', $refused($tpl(function ($t) { $t[] = '<script>alert(1)</script>'; return $t; }), '<script>') === true);
check('a <style> in a template (CSS goes in style.css)', $refused($tpl(function ($t) { $t[] = '<style>body{display:none}</style>'; return $t; }), '<style>') === true);
check('an event attribute written in a template', $refused($tpl(function ($t) { $t[0] = str_replace('<figure ', '<figure onclick="x()" ', $t[0]); return $t; }), 'event attribute') === true);
check('an active address written in a template', $refused($tpl(function ($t) { $t[] = '<a href="java&#115;cript:alert(1)">x</a>'; return $t; }), 'active address') === true);
check('an <iframe> or a <form>', $refused($tpl(function ($t) { $t[] = '<iframe src="https://x.example"></iframe>'; return $t; }), '<iframe>') === true && $refused($tpl(function ($t) { $t[] = '<form action="https://x.example"></form>'; return $t; }), '<form>') === true);
check('a template without {{_id}} and {{_classes}}', $refused($tpl(function ($t) { return ['<div>{{quote}}</div>']; }), '{{_id}}') === true);
check('a template that does not parse', $refused($tpl(function ($t) { $t[] = '{{#open}}'; return $t; }), 'not closed') === true);
check('a script for the block', $refused($mutant(function ($f, $b, $m) { $b['script'] = 'progress'; return [$f, $b, $m]; }), 'no script') === true);
$set = function ($key, $v) use ($mutant) { return $mutant(function ($f, $b, $m) use ($key, $v) { $b['settings'][$key] = $v; return [$f, $b, $m]; }); };
check('a code setting (raw HTML)', $refused($set('x', ['type' => 'code']), 'code setting') === true);
check('a panel widget', $refused($set('x', ['type' => 'text', 'control' => 'widget:hotspotPins']), 'widgets are not available') === true);
check('an unknown transform', $refused($set('x', ['type' => 'text', 'transform' => 'evil']), 'unknown transform') === true);
check('a regular expression that could take forever', $refused($set('x', ['type' => 'text', 'pattern' => '^(a+)+$']), 'safe regular expression') === true);
check('a repeat text that carries a script', $refused($set('x', ['type' => 'number', 'transform' => 'repeat', 'text' => '<script>x</script>']), '<script>') === true);
check('option data that carries an event attribute', $refused($set('x', ['type' => 'enum', 'default' => 'a', 'options' => [['value' => 'a', 'data' => ['h' => '<i onclick=x()>']]]]), 'event attribute') === true);
$leak = $mutant(function ($f, $b, $m) { $b['settings']['page'] = ['type' => 'text', 'default' => '', 'label' => 'Page']; $b['template'][] = '<a href="{{page}}">go</a>'; unset($b['tests']); return [$f, $b, $m]; });
check('a text that ends up in an address unchecked (found by the hostile-value fuzz)', $refused($leak, 'runs code') === true);
$leak2 = $mutant(function ($f, $b, $m) { $b['settings']['u'] = ['type' => 'text', 'default' => '']; $b['template'][] = '<div {{u}}>x</div>'; unset($b['tests']); return [$f, $b, $m]; });
check('a text placed inside a tag (an event attribute can be added)', $refused($leak2, 'onmouseover attribute') === true, (string)$refused($leak2, 'onmouseover attribute'));
check('a failing test of the author', $refused($mutant(function ($f, $b, $m) { $b['tests'][] = ['name' => 'nope', 'content' => [], 'contains' => ['never there']]; return [$f, $b, $m]; }), 'never there') === true);
$css2 = function ($css) use ($exFiles, $pkgZip) { $f = $exFiles(); $f['style.css'] = $css; return $pkgZip($f, 'css.zip'); };
check('CSS with @import', $refused($css2('@import url(https://evil.example/x.css);'), '@import') === true || $refused($css2('@import url(https://evil.example/x.css);'), 'import') === true);
check('CSS with an external image', $refused($css2('.a{background:url(https://evil.example/t.png)}'), 'url()') === true);
check('CSS with an escape or an at-rule that cannot be nested', $refused($css2('.a{color:\\72 ed}'), 'backslash') === true && $refused($css2('@keyframes x{from{opacity:0}to{opacity:1}}'), '@keyframes') === true);
check('CSS that would reach outside the block: & in the middle, & + sibling, a leading +, :has(&)', $refused($css2('html:has(&){display:none}'), '& anywhere but at its start') === true && $refused($css2('body &{color:red}'), '& anywhere') === true
    && $refused($css2('& + .x{color:red}'), 'siblings') === true && $refused($css2('&.a ~ .b{color:red}'), 'siblings') === true && $refused($css2('+ .x{color:red}'), 'neighbours') === true && $refused($css2('.a:not(&){color:red}'), '& anywhere') === true
    && $refused($css2('@media (min-width:1px){html:has(&){display:none}}'), '& anywhere') === true);
check('CSS rules that stay inside are accepted: &, &.class, & .child, & > .child, child + sibling, pseudo-elements, @media', ($r = cc_pkg_css_problem("&{color:red} &.pq:hover::before{content:'x'} & .a{color:red} & > .b{color:red} .c + .d{color:red} .e:has(~ .f){color:red} @media (max-width:600px){&.pq{color:red} .g{color:red}}")) === null, (string)$r);
check('CSS with active content', $refused($css2('.a{width:expression(alert(1))}'), 'active') === true);
$files = function ($extra) use ($exFiles, $pkgZip) { return $pkgZip($extra($exFiles()), 'f.zip'); };
check('a file that is not part of a package', $refused($files(function ($f) { $f['evil.php'] = '<?php echo 1;'; return $f; }), 'evil.php') === true);
check('a path that climbs out of the package', $refused($files(function ($f) { $f['assets/../../evil.png'] = 'x'; return $f; }), 'not allowed') === true);
check('an image that is not an image', $refused($files(function ($f) { $f['assets/fake.png'] = '<?php echo 1;'; return $f; }), 'valid image') === true);
check('an SVG with a script', $refused($files(function ($f) { $f['assets/bad.svg'] = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'; return $f; }), 'safe SVG') === true);
check('a package that is not a ZIP', ($r = cc_pkg_install(__FILE__)) && empty($r['success']) && stripos(implode(' ', $r['errors']), 'ZIP') !== false);
check('a package for a newer CanvasCore', $refused($mutant(function ($f, $b, $m) { $m['minVersion'] = '9.0.0'; return [$f, $b, $m]; }), 'needs CanvasCore 9.0.0') === true);
check('a bad package id', $refused($mutant(function ($f, $b, $m) { $m['id'] = '../x'; return [$f, $b, $m]; }), 'id must') === true);
check('nothing was installed by all those refusals', cc_pkg_registry() === [] && !is_dir($pt . '/data/packages/pull-quote') && !is_dir($pt . '/site/canvascore-blocks/pull-quote'));

echo "\nBLOCK PACKAGES: RICH TEXT IS CLEANED WHEN SAVED\n";
$rich = $pkgZip([
    'package.json' => json_encode(['id' => 'rt', 'name' => 'Rich', 'version' => '1.0.0']),
    'blocks/note.json' => json_encode(['name' => 'note', 'catalog' => ['label' => 'Note'],
        'settings' => ['body' => ['type' => 'richtext', 'default' => ''], 'rows' => ['type' => 'list', 'item' => ['cell' => ['type' => 'richtext', 'default' => '']]], 'tips' => ['type' => 'list', 'of' => ['type' => 'richtext']]],
        'template' => ['<div id="{{_id}}" class="n{{_classes}}">{{{body}}}{{#rows}}<p>{{{cell}}}</p>{{/rows}}{{#tips}}<i>{{{.}}}</i>{{/tips}}</div>']]),
], 'rich.zip');
check('a package with rich text installs', !empty(cc_pkg_install($rich)['success'])); cc_block_defs(true);
$blocks = [['id' => 'n', 'type' => 'X_RT__NOTE', 'content' => ['body' => '<p onclick="x()">Hi<script>bad()</script></p>', 'rows' => [['cell' => '<img src=x onerror=a()>'], 'junk'], 'tips' => ['<b onmouseover=x>t</b>', ['arr']]]]];
cc_sanitize_blocks($blocks);
$j = json_encode($blocks);
check('its rich text settings are cleaned when saved (a field, a list field, a list of texts)', strpos($j, 'onclick') === false && strpos($j, 'script') === false && strpos($j, 'onerror') === false && strpos($j, 'onmouseover') === false && strpos($j, 'Hi') !== false, $j);
check('…and when rendered', ($o = render_block(['id' => 'n', 'type' => 'X_RT__NOTE', 'content' => ['body' => '<p onclick="x()">Hi</p><script>bad()</script>']])) && strpos($o, 'onclick') === false && strpos($o, '<script') === false && strpos($o, 'Hi') !== false);
unset($GLOBALS['CC_PACKAGES_DIR'], $GLOBALS['CC_SITE_ROOT'], $GLOBALS['CC_PKG_APP_VERSION']); cc_block_defs(true);
cc_backup_rrmdir($pt);

echo "\nWORDPRESS IMPORT\n";
require_once __DIR__ . '/../../canvascore-admin/wpimport.php';
require_once __DIR__ . '/../../canvascore-admin/migrations.php';
$wd = sys_get_temp_dir() . '/cc_wp_' . getmypid();
@mkdir($wd, 0755, true);
$GLOBALS['CC_WP_DIR'] = $wd . '/imports'; $GLOBALS['CC_WP_UPLOADS'] = $wd . '/uploads'; $GLOBALS['CC_WP_BASE_DIR'] = '';
$wpdb = new PDO('sqlite:' . $wd . '/t.sqlite'); $wpdb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
cc_migrate($wpdb);
$wpdb->exec("INSERT INTO pages (id, title, slug, clean_slug, status, is_draft_copy) VALUES ('p0', 'Old about', 'about-us', 'about-us', 'published', 0)");
$fx = __DIR__ . '/fixtures/wordpress.xml';
$wpFetched = [];
$GLOBALS['CC_WP_FETCH'] = function ($u) use (&$wpFetched) {
    $wpFetched[] = $u; $t = tempnam(sys_get_temp_dir(), 'x');
    file_put_contents($t, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    return [$t, ''];
};
$an = cc_wp_analyze($fx);
check('the export is read: pages, posts, images, categories and tags are counted', isset($an['job']) && $an['summary']['counts'] === ['pages' => 1, 'posts' => 2, 'media' => 2, 'categories' => 2, 'tags' => 1], json_encode($an));
check('…password-protected and trashed entries and menu items are named as skipped, not imported', isset($an['summary']['skipped']['password-protected posts']) && isset($an['summary']['skipped']['post in the trash']) && isset($an['summary']['skipped']['nav_menu_item entries']));
check('…the site address is read', $an['summary']['site']['url'] === 'https://old.example.com' && $an['summary']['site']['title'] === 'Old Shop');
$job = $an['job'];
check('nothing is changed in the site by reading the file', (int)$wpdb->query("SELECT COUNT(*) FROM collection_items")->fetchColumn() === 0 && (int)$wpdb->query("SELECT COUNT(*) FROM pages")->fetchColumn() === 1);
check('a step before the start is refused', isset(cc_wp_step($wpdb, $job)['error']));
$st = cc_wp_start($wpdb, $job, ['drafts' => false, 'collection_name' => 'Journal']);
check('the import starts', !empty($st['ok']), json_encode($st));
check('…and cannot be started twice', isset(cc_wp_start($wpdb, $job, [])['error']));
$n = 0; do { $pg = cc_wp_step($wpdb, $job, 5); $n++; } while (empty($pg['finished']) && $n < 50);
check('the import finishes', !empty($pg['finished']) && $pg['created']['pages'] === 1 && $pg['created']['posts'] === 2 && $pg['created']['media'] === 2 && $pg['failed'] === ['media' => 0, 'pages' => 0, 'posts' => 0], json_encode($pg));
$col = $wpdb->query("SELECT * FROM collections")->fetch(PDO::FETCH_ASSOC);
check('the posts go to a new collection with the chosen name', $col && $col['name'] === 'Journal' && $col['slug'] === 'journal');
$tx = $wpdb->query("SELECT slug FROM collection_taxonomies ORDER BY position")->fetchAll(PDO::FETCH_COLUMN);
$tm = $wpdb->query("SELECT slug FROM collection_terms ORDER BY slug")->fetchAll(PDO::FETCH_COLUMN);
check('Categories and Tags are made with their terms', $tx === ['categories', 'tags'] && $tm === ['diy', 'guides', 'news'], json_encode([$tx, $tm]));
$pageRows = $wpdb->query("SELECT * FROM pages WHERE id != 'p0'")->fetchAll(PDO::FETCH_ASSOC);
check('the page is added; its address does not clash with the page that was already there', count($pageRows) === 1 && $pageRows[0]['clean_slug'] === 'about-us-2' && $pageRows[0]['status'] === 'published');
check('…its SEO title and description come from Yoast', $pageRows[0]['seo_title'] === 'About - Old Shop' && $pageRows[0]['seo_description'] === 'Who we are');
$pb = json_decode($pageRows[0]['content_json'], true);
$types = array_column($pb, 'type');
check('page content: text, picture, text, divider, video and code become blocks', $types === ['TEXT', 'IMAGE', 'TEXT', 'DIVIDER', 'VIDEO', 'CODE_SNIPPET'], json_encode($types));
check('…the picture was copied into the uploads folder and the page points to it', preg_match('#^/uploads/\d+_team\.png$#', $pb[1]['content']['src']) && is_file($wd . '/uploads/' . basename($pb[1]['content']['src'])) && $pb[1]['content']['alt'] === 'The team');
check('…the caption stays as text, headings are kept', strpos($pb[2]['content']['text'], '<em>Our team</em>') !== false && strpos($pb[2]['content']['text'], '<h2>Our story</h2>') !== false);
check('…the video is a YouTube link and the code block knows its language', $pb[4]['content']['url'] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' && $pb[5]['content']['language'] === 'php' && $pb[5]['content']['code'] === 'echo "hi";');
$all = json_encode($pb);
check('…scripts, other iframes and shortcodes are left out and reported', strpos($all, 'alert(1)') === false && strpos($all, 'evil.example') === false && strpos($all, 'contact-form') === false && in_array('shortcode [contact-form-7] was left out', $pg['warnings'], true));
check('…a link to another imported post points to its new address, other links stay', strpos($pb[0]['content']['text'], 'href="{{BASE_URL}}journal/hello-world/"') !== false && strpos($pb[0]['content']['text'], 'href="https://elsewhere.org/x"') !== false, $pb[0]['content']['text']);
$items = $wpdb->query("SELECT * FROM collection_items ORDER BY date")->fetchAll(PDO::FETCH_ASSOC);
check('the posts are items, in their order, with the date, the excerpt without tags and the status', count($items) === 2 && $items[0]['slug'] === 'hello-world' && $items[0]['date'] === '2023-05-04' && $items[0]['excerpt'] === 'A short intro' && $items[0]['status'] === 'published' && $items[1]['status'] === 'draft' && $items[1]['slug'] === 'draft-thoughts');
check('the featured picture is the cover image', preg_match('#^/uploads/\d+_team\.png$#', $items[0]['cover_image']) === 1);
$tj = json_decode($items[0]['terms_json'], true);
check('categories and tags are set on the item (one term each, in their own taxonomy)', count($tj) === 2 && count(array_merge(...array_values($tj))) === 2);
$ib = json_decode($items[0]['content_json'], true);
check('a post without paragraph tags is split at blank lines; the gallery becomes pictures', array_column($ib, 'type') === ['TEXT', 'IMAGE', 'IMAGE'] && substr_count($ib[0]['content']['text'], '<p>') === 2 && strpos($ib[0]['content']['text'], 'href="{{BASE_URL}}about-us-2/"') !== false, json_encode($ib[0]));
check('a link to the imported page uses its new address', strpos($ib[0]['content']['text'], '{{BASE_URL}}about-us-2/') !== false);
check('the old address of a published post redirects to the new one', $wpdb->query("SELECT to_path FROM redirects WHERE from_path = '/2023/05/hello-world/'")->fetchColumn() === '/journal/hello-world/' && $pg['created']['redirects'] === 1);
check('…but never from an address a live page already uses (the new page took another address, the old one must keep showing the page that was there)', (int)$wpdb->query("SELECT COUNT(*) FROM redirects WHERE from_path = '/about-us/'")->fetchColumn() === 0 && count(array_filter($pg['warnings'], function ($w) { return strpos($w, 'no redirect was made') === 0; })) === 1, json_encode($pg['warnings']));
check('revisions are kept for what was imported', (int)$wpdb->query("SELECT COUNT(*) FROM page_revisions")->fetchColumn() === 3);
check('the content files of a finished job are removed', !is_file(cc_wp_job_path($job, 'posts.jsonl')) && cc_wp_discard($job) && !is_dir(cc_wp_job_path($job)));

// as drafts, into an existing collection, without downloading images
$an2 = cc_wp_analyze($fx); $wpFetched = [];
$st = cc_wp_start($wpdb, $an2['job'], ['drafts' => true, 'media' => false, 'pages' => false, 'collection' => $col['id']]);
$n = 0; do { $pg2 = cc_wp_step($wpdb, $an2['job'], 5); $n++; } while (empty($pg2['finished']) && $n < 50);
$items2 = $wpdb->query("SELECT slug, status, cover_image, content_json FROM collection_items WHERE collection_id = '" . $col['id'] . "' ORDER BY updated_at, slug")->fetchAll(PDO::FETCH_ASSOC);
check('into an existing collection, as drafts, without images, without pages', count($items2) === 4 && $wpFetched === [] && (int)$wpdb->query("SELECT COUNT(*) FROM pages")->fetchColumn() === 2 && $pg2['created']['posts'] === 2 && $pg2['published'] === 0);
check('…addresses that exist in the collection get a number', (int)$wpdb->query("SELECT COUNT(*) FROM collection_items WHERE slug = 'hello-world-2'")->fetchColumn() === 1);
cc_wp_discard($an2['job']);

// what is refused
$bad = function ($xml) { $f = tempnam(sys_get_temp_dir(), 'wx'); file_put_contents($f, $xml); $r = cc_wp_analyze($f); @unlink($f); return $r; };
check('a file with a document type (XML entity tricks) is refused', isset($bad('<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title></item></channel></rss>')['error']));
check('something that is not an export is refused', isset($bad('<html><body>' . str_repeat('x', 100) . '</body></html>')['error']) && isset($bad('{"a": 1}' . str_repeat(' ', 80))['error']));
check('broken XML is refused with a message', isset($bad('<?xml version="1.0"?><rss><channel><title>x</title><item><title>a</wp:b></item>' . str_repeat(' ', 80))['error']));
check('an export without content is refused', isset($bad('<?xml version="1.0"?><rss xmlns:wp="http://wordpress.org/export/1.2/"><channel><title>Empty</title><link>https://a.example</link></channel></rss>' . str_repeat(' ', 40))['error']));
check('job ids are checked (no path tricks)', cc_wp_job_id('../../etc') === '' && cc_wp_job_id('0123456789abcdef') === '0123456789abcdef' && cc_wp_job_path('../x') === '');
foreach (['http://127.0.0.1/a.jpg', 'http://localhost/a.jpg', 'http://10.0.0.5/a.jpg', 'http://192.168.1.1/a.jpg', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/a.jpg', 'ftp://example.com/a.jpg', 'file:///etc/passwd', 'http://user:pw@8.8.8.8/a.jpg', 'http://8.8.8.8:22/a.jpg', 'gopher://8.8.8.8/x', 'javascript:alert(1)', '//8.8.8.8/a.jpg', 'http://0.0.0.0/a.jpg', 'http://100.64.0.1/a.jpg'] as $u) {
    check("images are not downloaded from $u", cc_wp_url_check($u)[0] === false);
}
$GLOBALS['CC_WP_RESOLVE'] = function ($h) { return $h === 'rebind.example' ? ['127.0.0.1'] : ['93.184.216.34']; };
check('a name that resolves to a private address is refused; a public one passes', cc_wp_url_check('https://rebind.example/a.jpg')[0] === false && cc_wp_url_check('https://cdn.example/a.jpg') === [true, '93.184.216.34']);
unset($GLOBALS['CC_WP_RESOLVE']);
$tmpf = tempnam(sys_get_temp_dir(), 'im');
file_put_contents($tmpf, '<?php echo 1;');
check('a download that is not an image is not stored (PHP renamed to .jpg)', cc_wp_store_image($tmpf, 'https://a.example/x.jpg', $wd . '/uploads', '')[0] === null);
check('…nor a file of a type the library refuses (.php, .html)', cc_wp_store_image($tmpf, 'https://a.example/x.php', $wd . '/uploads', '')[0] === null && cc_wp_store_image($tmpf, 'https://a.example/x.html', $wd . '/uploads', '')[0] === null);
file_put_contents($tmpf, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
check('…nor an SVG with a script', cc_wp_store_image($tmpf, 'https://a.example/x.svg', $wd . '/uploads', '')[0] === null);
file_put_contents($tmpf, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>');
check('…a plain SVG is fine', preg_match('#^/uploads/\d+_x\.svg$#', cc_wp_store_image($tmpf, 'https://a.example/x.svg', $wd . '/uploads', '')[0]) === 1);
@unlink($tmpf);
// content conversion on its own
$cv = function ($h) { return cc_wp_blocks($h, ['media' => function ($u) { return null; }, 'link' => function ($u) { return null; }, 'warn' => function () {}]); };
$b = $cv('<p>One</p><p><img src="https://a.example/p.jpg" alt="x"></p><ul><li>a</li></ul><blockquote>q</blockquote><table><tr><td>c</td></tr></table>');
check('lists, quotes and tables stay in the text; a picture alone in a paragraph is an Image block', array_column($b, 'type') === ['TEXT', 'IMAGE', 'TEXT'] && strpos($b[2]['content']['text'], '<ul>') !== false && strpos($b[2]['content']['text'], '<table>') !== false);
$b = $cv('<div class="wp-block-group"><div><p>Deep</p></div></div>');
check('wrapper divs of layout blocks are unwrapped', count($b) === 1 && $b[0]['content']['text'] === '<p>Deep</p>');
$b = $cv('<p onclick="x()">Hi <img src=x onerror=alert(1)></p><a href="javascript:alert(1)">bad</a>');
cc_sanitize_blocks($b);
check('imported content is cleaned like a normal save (event attributes, javascript: links)', strpos(json_encode($b), 'onclick') === false && strpos(json_encode($b), 'onerror') === false && strpos(json_encode($b), 'javascript:') === false, json_encode($b));
check('empty content gives no blocks', $cv('') === [] && $cv('<p>&nbsp;</p>') === [] && $cv('<!-- wp:more --><!--more-->') === []);
check('a YouTube address alone in a paragraph, and a Vimeo iframe, become Video blocks', ($v = $cv('<p>https://youtu.be/abcDEF12345</p><iframe src="https://player.vimeo.com/video/123456789"></iframe>')) && $v[0]['content']['url'] === 'https://www.youtube.com/watch?v=abcDEF12345' && $v[1]['content']['url'] === 'https://vimeo.com/123456789');
check('a link in rich text to a page keeps its placeholder through the sanitizer', cc_sanitize_html('<p><a href="{{BASE_URL}}about/">x</a></p>') === '<p><a href="{{BASE_URL}}about/">x</a></p>');
check('the image address key ignores the host and the size suffix', cc_wp_pathkey('https://old.example.com/wp-content/uploads/2023/01/team-300x200.jpg') === cc_wp_pathkey('http://cdn.other.net/wp-content/uploads/2023/01/Team.jpg') && cc_wp_pathkey('https://x/wp-content/uploads/a/b-scaled.png') === 'a/b.png');
cc_backup_rrmdir($wd);
unset($GLOBALS['CC_WP_DIR'], $GLOBALS['CC_WP_UPLOADS'], $GLOBALS['CC_WP_BASE_DIR'], $GLOBALS['CC_WP_FETCH']);

echo "\n" . ($fails === 0 ? 'SERVER OK' : "$fails checks failed") . " ($total checks)\n";
exit($fails === 0 ? 0 : 1);
