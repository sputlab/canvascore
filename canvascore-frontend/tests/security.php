<?php
// tests/security.php — security regression tests (npm run test:security). A fresh copy of canvascore-admin is
// installed in a temporary folder and served by PHP's built-in server; every attack found in the 0.14.0 security
// review is replayed over HTTP and must fail. Needs the PHP CLI with pdo_sqlite, dom, zip and curl.
$fails = 0; $total = 0;
function check($name, $ok, $extra = '') { global $fails, $total; $total++; if ($ok) echo "  ✓ $name\n"; else { $fails++; echo "  ✗ $name" . ($extra !== '' ? "  → $extra" : '') . "\n"; } }

// ---------------------------------------------------------------- server
$T = sys_get_temp_dir() . '/cc_sec_' . getmypid() . '_' . bin2hex(random_bytes(3));
$web = $T . '/web'; $admin = $web . '/canvascore-admin'; $data = $T . '/canvascore-data';
@mkdir($admin, 0755, true);
$src = realpath(__DIR__ . '/../../canvascore-admin');
foreach (scandir($src) as $f) { if (is_file("$src/$f") && $f[0] !== '.') copy("$src/$f", "$admin/$f"); }
file_put_contents($admin . '/index.html', '<!doctype html><title>editor</title>');
// an SVG uploaded by an older version that the new check refuses (it must be moved away on the first request)
@mkdir($web . '/uploads', 0755, true);
file_put_contents($web . '/uploads/old-evil.svg', '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="x;javascript:alert(1)"/></a></svg>');
file_put_contents($web . '/uploads/old-ok.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
$sock = stream_socket_server('tcp://127.0.0.1:0'); $port = (int)explode(':', stream_socket_get_name($sock, false))[1]; fclose($sock);
$BASE = "http://127.0.0.1:$port";
$proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $web], [0 => ['pipe', 'r'], 1 => ['file', $T . '/server.log', 'a'], 2 => ['file', $T . '/server.log', 'a']], $pipes, $T, ['PHP_CLI_SERVER_WORKERS' => '4'] + getenv());
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);
register_shutdown_function(function () use ($proc, $T) {
    proc_terminate($proc); proc_close($proc);
    $rm = function ($d) use (&$rm) { foreach (array_diff(scandir($d) ?: [], ['.', '..']) as $f) { is_dir("$d/$f") && !is_link("$d/$f") ? $rm("$d/$f") : @unlink("$d/$f"); } @rmdir($d); };
    $rm($T);
});

// ---------------------------------------------------------------- HTTP client (cookie jar per client)
class Client {
    public $jar; public $csrf = '';
    function __construct() { $this->jar = tempnam(sys_get_temp_dir(), 'ccjar'); }
    function req($method, $path, $body = null, array $headers = [], $json = true) {
        global $BASE;
        $ch = curl_init($BASE . $path);
        $h = $headers;
        if ($this->csrf !== '' && !array_filter($h, function ($x) { return stripos($x, 'X-CSRF-Token:') === 0; })) $h[] = 'X-CSRF-Token: ' . $this->csrf;
        if (is_array($body) && $json) { $body = json_encode($body); if (!array_filter($h, function ($x) { return stripos($x, 'Content-Type:') === 0; })) $h[] = 'Content-Type: application/json'; }
        curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 30]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $raw = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $head = substr((string)$raw, 0, $hs); $text = substr((string)$raw, $hs);
        return ['code' => $code, 'head' => $head, 'body' => $text, 'json' => json_decode($text, true)];
    }
    function api($action, $body = null, array $headers = []) { return $this->req($body === null ? 'GET' : 'POST', '/canvascore-admin/api.php?action=' . $action, $body, $headers); }
    function login($u, $p) { $r = $this->api('login', ['username' => $u, 'password' => $p]); if (!empty($r['json']['csrf'])) $this->csrf = $r['json']['csrf']; return $r; }
}
function db() { global $data; $p = new PDO('sqlite:' . $data . '/canvascore.sqlite'); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); return $p; }

echo "\nBEFORE INSTALLATION\n";
$anon = new Client();
$r = $anon->api('version');
check('the API answers "not installed" until the setup wizard has run', $r['code'] === 503 && ($r['json']['code'] ?? '') === 'not_installed', $r['code'] . ' ' . $r['body']);
$r = $anon->login('admin', 'admin');
check('unsafe SVGs uploaded by older versions are moved out of the site (safe ones stay)', !is_file($web . '/uploads/old-evil.svg') && is_file($data . '/quarantine/old-evil.svg') && is_file($web . '/uploads/old-ok.svg'));
check('there is no default admin/admin account to sign in with', $r['code'] === 503 && empty($r['json']['success']));
check('…and none was created in the database', (int)db()->query("SELECT COUNT(*) FROM admin")->fetchColumn() === 0);
$r = $anon->api('check_auth');
check('check_auth tells the sign-in screen the site is not installed', ($r['json']['installed'] ?? null) === false && ($r['json']['authenticated'] ?? null) === false);

echo "\nINSTALLER\n";
$inst = new Client();
$page = $inst->req('GET', '/canvascore-admin/install.php');
preg_match('/name="csrf" value="([a-f0-9]+)"/', $page['body'], $m); $icsrf = $m[1] ?? '';
check('the installer asks for the setup key and writes it into the data folder only', strpos($page['body'], 'name="setup_key"') !== false && is_file($data . '/install-key.txt') && strpos($page['body'], trim((string)@file_get_contents($data . '/install-key.txt'))) === false);
$form = ['csrf' => $icsrf, 'site_name' => 'Test', 'site_url' => '', 'admin_user' => 'owner', 'admin_pass' => 'Correct-Horse-9', 'admin_pass2' => 'Correct-Horse-9', 'admin_email' => '', 'starter' => ''];
$r = $inst->req('POST', '/canvascore-admin/install.php', http_build_query($form + ['setup_key' => 'AAAA-BBBB-CCCC-DDDD-EEEE']), ['Content-Type: application/x-www-form-urlencoded'], false);
check('without the right setup key nobody can install (no takeover of a freshly uploaded site)', strpos($r['body'], 'This is not the setup key') !== false && (int)db()->query("SELECT COUNT(*) FROM admin")->fetchColumn() === 0);
$key = trim((string)file_get_contents($data . '/install-key.txt'));
$r = $inst->req('POST', '/canvascore-admin/install.php', http_build_query($form + ['setup_key' => strtolower($key)]), ['Content-Type: application/x-www-form-urlencoded'], false);
check('with the key from the server the installation completes', strpos($r['body'], 'CanvasCore is installed') !== false, substr(strip_tags($r['body']), 0, 300));
check('…and the key file is deleted', !is_file($data . '/install-key.txt'));
$r = (new Client())->req('GET', '/canvascore-admin/install.php');
check('a second visit finds the installer locked', strpos($r['body'], 'Already installed') !== false);
check('the admin folder gets its .htaccess (security headers, no direct access to library files)', strpos((string)@file_get_contents($admin . '/.htaccess'), 'X-Frame-Options') !== false);

echo "\nSESSIONS, SIGN-IN AND CSRF\n";
$r = (new Client())->req('GET', '/canvascore-admin/api.php?action=branding');
check('anonymous requests get no session cookie (no session files for visitors)', stripos($r['head'], 'Set-Cookie') === false);
check('API answers carry anti-framing and no-sniff headers', stripos($r['head'], 'X-Frame-Options: DENY') !== false && stripos($r['head'], "frame-ancestors 'none'") !== false && stripos($r['head'], 'X-Content-Type-Options: nosniff') !== false);
foreach (['config.php', 'compiler.php', 'migrations.php', 'media.php', 'backup.php'] as $lib) {
    $r = (new Client())->req('GET', '/canvascore-admin/' . $lib);
    if ($r['code'] !== 404) break;
}
check('library files answer 404 when opened directly', $r['code'] === 404);
$x = new Client();
$r = $x->api('login', json_encode(['username' => 'owner', 'password' => 'Correct-Horse-9']), ['Content-Type: text/plain']);
check('sign-in from a cross-site form (text/plain body) is refused: no login CSRF', $r['code'] === 403 && empty($r['json']['success']));
$r = $x->api('login', ['username' => 'owner', 'password' => 'Correct-Horse-9'], ['Origin: https://evil.example']);
check('sign-in with a foreign Origin is refused', $r['code'] === 403);
$r = $x->api('login', ['username' => 'owner', 'password' => 'Correct-Horse-9'], ['Sec-Fetch-Site: cross-site']);
check('sign-in marked cross-site by the browser is refused', $r['code'] === 403);
$own = new Client(); $r = $own->login('owner', 'Correct-Horse-9');
check('the installed account signs in normally', !empty($r['json']['success']) && ($r['json']['role'] ?? '') === 'admin');
check('…with a hardened session cookie (HttpOnly, SameSite) and no script-readable token cookie', preg_match('/Set-Cookie: CCSESSID=[^\r\n]*HttpOnly[^\r\n]*SameSite=Lax/i', $r['head']) && stripos($r['head'], 'cc_csrf=') === false);
$r = $own->api('save_menu', ['items' => []], ['X-CSRF-Token: wrong']);
check('a POST with a wrong CSRF token is refused', $r['code'] === 403);
// the real session cookie plus a cc_csrf cookie and header chosen by the attacker (sent without touching the jar)
preg_match('/CCSESSID\t(\S+)/', (string)file_get_contents($own->jar), $sm);
$ch = curl_init($BASE . '/canvascore-admin/api.php?action=save_menu');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{"items":[]}', CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIE => 'CCSESSID=' . ($sm[1] ?? '') . '; cc_csrf=attacker',
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-CSRF-Token: attacker']]);
curl_exec($ch);
check('a token chosen by an attacker (old double-submit cookie) is refused', curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 403);
$r = $own->api('save_menu', ['items' => []], ['Origin: https://evil.example']);
check('a POST from a foreign Origin is refused even with the token', $r['code'] === 403);
$r = $own->api('save_menu', ['items' => []]);
check('the editor\'s own requests work', !empty($r['json']['success']), $r['code'] . ' ' . $r['body']);

echo "\nLOGIN THROTTLING\n";
$t = new Client(); $codes = [];
for ($i = 0; $i < 6; $i++) $codes[] = $t->login('owner', 'wrong-' . $i)['code'];
check('5 wrong passwords, then the account waits (from this address)', $codes === [200, 200, 200, 200, 200, 429], json_encode($codes));
check('…even the right password is refused while waiting', $t->login('owner', 'Correct-Horse-9')['code'] === 429);
@unlink($data . '/login_attempts.json');
// parallel attempts can't slip past the limit
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 15; $i++) {
    $ch = curl_init($BASE . '/canvascore-admin/api.php?action=login');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['username' => 'owner', 'password' => 'bad' . $i]), CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true]);
    curl_multi_add_handle($mh, $ch); $hs[] = $ch;
}
do { curl_multi_exec($mh, $running); curl_multi_select($mh); } while ($running);
$tried = 0; foreach ($hs as $ch) { if (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200) $tried++; }
check('15 parallel wrong passwords: at most 5 are checked', $tried <= 5, "$tried checked");
@unlink($data . '/login_attempts.json');
$t0 = microtime(true); (new Client())->login('nobody-' . bin2hex(random_bytes(3)), 'whatever1'); $tu = microtime(true) - $t0;
$t0 = microtime(true); (new Client())->login('owner', 'whatever1'); $tk = microtime(true) - $t0;
check('an unknown username takes as long as a wrong password (no account discovery by timing)', $tu > $tk * 0.5, sprintf('%.3fs vs %.3fs', $tu, $tk));
@unlink($data . '/login_attempts.json');

echo "\nGLOBAL COLOURS\n";
$r = $own->api('save_settings', ['siteName' => 'Test', 'colors' => [['id' => 'primary', 'name' => 'Brand', 'value' => '#112233'], ['id' => 'evil', 'name' => '</style><script>x()</script>', 'value' => 'red;}body{display:none'], ['id' => 'ok', 'name' => '<img onerror=x>', 'value' => '#abcdef']]]);
$saved = json_decode((string)file_get_contents($data . '/settings.json'), true);
check('saved global colours are cleaned: hex values only, no markup in names; the primary colour is the brand colour', !empty($r['json']['success']) && $saved['brandColor'] === '#112233'
    && !strpos(json_encode($saved['colors']), 'script') && !strpos(json_encode($saved['colors']), 'display:none') && !strpos(json_encode($saved['colors']), '<img') && in_array('ok', array_column($saved['colors'], 'id'), true) && !in_array('evil', array_column($saved['colors'], 'id'), true), json_encode($saved['colors'] ?? null));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$home = (string)@file_get_contents($web . '/404.html');
check('published pages define the palette as CSS variables', strpos($home, '--cc-color-primary: #112233;') !== false && strpos($home, '--cc-color-ok: #abcdef;') !== false && strpos($home, '--brand-color: #112233') !== false);

echo "\nTEXT STYLES\n";
$r = $own->api('save_settings', ['siteName' => 'Test', 'typography' => ['h1' => ['font' => 'Lato', 'size' => '3rem;}body{display:none}', 'tablet' => ['size' => '2.4rem']], 'h2' => ['size' => '2rem']]]);
$saved = json_decode((string)file_get_contents($data . '/settings.json'), true);
check('saved text styles: a size with CSS in it is dropped; only valid values stored', !empty($r['json']['success']) && !isset($saved['typography']['h1']['size']) && $saved['typography']['h1']['font'] === 'Lato'
    && strpos(json_encode($saved['typography'] ?? []), 'display') === false, json_encode($saved['typography'] ?? null));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$home = (string)@file_get_contents($web . '/404.html');
check('published pages: text styles as CSS, and the font of a text style is loaded from Google Fonts', strpos($home, '--cc-type-h2-size: 2rem;') !== false && strpos($home, 'h2{font-size: var(--cc-type-h2-size);') !== false
    && strpos($home, 'family=Lato') !== false, substr($home, 0, 0));

echo "\nBUTTON AND FIELD STYLES\n";
$r = $own->api('save_settings', ['siteName' => 'Test', 'buttonStyles' => ['primary' => ['bg' => '#112233', 'text' => 'red;}body{']], 'fieldStyle' => ['bg' => '#fafafa', 'radius' => '4px;']]);
$saved = json_decode((string)file_get_contents($data . '/settings.json'), true);
check('saved button presets and field style: CSS in a value is dropped', !empty($r['json']['success']) && json_encode($saved['buttonStyles'] ?? null) === '{"primary":{"bg":"#112233"}}'
    && json_encode($saved['fieldStyle'] ?? null) === '{"bg":"#fafafa"}', json_encode([$saved['buttonStyles'] ?? null, $saved['fieldStyle'] ?? null]));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$home = (string)@file_get_contents($web . '/404.html');
check('published pages: the button preset and the field style as variables', strpos($home, '--cc-btn-primary-bg: #112233;') !== false && strpos($home, '--cc-field-bg: #fafafa;') !== false);

echo "\nCUSTOM FIELDS\n";
$r = $own->api('save_collection', ['id' => 'col_team', 'name' => 'Team', 'slug' => 'team-members', 'fields' => [
    ['id' => 'name', 'key' => 'name', 'label' => 'Name', 'type' => 'text', 'required' => true],
    ['id' => 'price', 'key' => 'price', 'label' => 'Price', 'type' => 'number'],
    ['id' => 'site', 'key' => 'site', 'label' => 'Site', 'type' => 'link'],
    ['id' => 'pic', 'key' => 'pic', 'label' => 'Photo', 'type' => 'image']]]);
$cols = $own->api('get_collections');
$team = array_values(array_filter($cols['json'] ?? [], function ($c) { return $c['id'] === 'col_team'; }))[0] ?? [];
check('an admin defines the custom fields of a collection, and the list gives them back', !empty($r['json']['success']) && count($team['fields'] ?? []) === 4 && $team['fields'][0]['type'] === 'text', json_encode($r['json'] ?? null));
$blocks = [['id' => 'tf1', 'type' => 'ITEM_FIELD', 'styles' => [], 'content' => ['field' => 'price', 'showLabel' => false, 'decimals' => 0]],
    ['id' => 'tf2', 'type' => 'ITEM_FIELD', 'styles' => [], 'content' => ['field' => 'name', 'showLabel' => false]]];
$r = $own->api('save_item', ['id' => 'ti1', 'collection_id' => 'col_team', 'title' => 'Ada', 'slug' => 'ada', 'status' => 'draft', 'blocks' => $blocks,
    'field_values' => ['name' => '', 'price' => '12', 'site' => ['url' => 'javascript:x', 'text' => ''], 'pic' => 'https://x.test/a.jpg']]);
check('a draft item can leave a required field empty', !empty($r['json']['success']), $r['code']);
$r = $own->api('save_item', ['id' => 'ti1', 'collection_id' => 'col_team', 'title' => 'Ada', 'slug' => 'ada', 'status' => 'published', 'blocks' => $blocks,
    'field_values' => ['name' => '  ', 'price' => '12']]);
check('publishing with a required field empty is refused, and the message names the field', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'required' && strpos($r['json']['message'] ?? '', 'Name') !== false, json_encode($r['json'] ?? null));
$r = $own->api('save_item', ['id' => 'ti1', 'collection_id' => 'col_team', 'title' => 'Ada', 'slug' => 'ada', 'status' => 'published', 'blocks' => $blocks,
    'field_values' => ['name' => 'Ada Lovelace', 'price' => '12', 'site' => ['url' => 'javascript:x', 'text' => ''], 'pic' => 'https://x.test/a.jpg']]);
check('with the required field filled in, the item is published', !empty($r['json']['success']), json_encode($r['json'] ?? null));
$got = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=ti1');
$stored = json_decode((string)($got['json']['field_values'] ?? '{}'), true) ?: [];
check('the item keeps its values, cleaned (the javascript link is emptied)', ($stored['name'] ?? '') === 'Ada Lovelace' && ($stored['site']['url'] ?? 'x') === '', json_encode($stored));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$item_page = (string)@file_get_contents($web . '/team-members/ada/index.html');
check('the published item page shows its field values', strpos($item_page, 'Ada Lovelace') !== false && strpos($item_page, 'cc-field-value">12</div>') !== false);

echo "\nRELATED ITEMS AND STRUCTURED DATA (published)\n";
$own->api('save_collection', ['id' => 'col_dept', 'name' => 'Departments', 'slug' => 'departments', 'fields' => []]);
$r = $own->api('save_collection', ['id' => 'col_staff', 'name' => 'Staff', 'slug' => 'staff', 'fields' => [
    ['id' => 'dept', 'key' => 'dept', 'label' => 'Department', 'type' => 'reference', 'target' => 'col_dept']]]);
check('a reference field can point to another collection', !empty($r['json']['success']));
$r = $own->api('save_collection', ['id' => 'col_shop', 'name' => 'Shop', 'slug' => 'shop', 'fields' => [
    ['id' => 'photo', 'key' => 'photo', 'label' => 'Photo', 'type' => 'image'],
    ['id' => 'price', 'key' => 'price', 'label' => 'Price', 'type' => 'number']],
    'schema' => ['type' => 'Product', 'map' => ['image' => 'photo', 'price' => 'price'], 'currency' => 'EUR']]);
$cols = $own->api('get_collections');
$shop = array_values(array_filter($cols['json'] ?? [], function ($c) { return $c['id'] === 'col_shop'; }))[0] ?? [];
check('the structured data of a collection is saved and given back', !empty($r['json']['success']) && ($shop['schema']['type'] ?? '') === 'Product' && ($shop['schema']['map']['price'] ?? '') === 'price' && ($shop['schema']['currency'] ?? '') === 'EUR', json_encode($shop['schema'] ?? null));
$own->api('save_item', ['id' => 'dep1', 'collection_id' => 'col_dept', 'title' => 'Design', 'slug' => 'design', 'status' => 'published',
    'blocks' => [['id' => 'rl1', 'type' => 'RELATED', 'styles' => [], 'content' => ['collectionId' => 'col_staff', 'fieldId' => 'dept', 'limit' => 5, 'title' => 'Our people', 'columns' => 2]]]]);
$own->api('save_item', ['id' => 'st1', 'collection_id' => 'col_staff', 'title' => 'Ana Rossi', 'slug' => 'ana-rossi', 'status' => 'published', 'blocks' => [], 'field_values' => ['dept' => 'dep1']]);
$own->api('save_item', ['id' => 'st2', 'collection_id' => 'col_staff', 'title' => 'Luca Bianchi', 'slug' => 'luca-bianchi', 'status' => 'published', 'blocks' => [], 'field_values' => ['dept' => '']]);
$own->api('save_item', ['id' => 'sh1', 'collection_id' => 'col_shop', 'title' => 'Green Tea', 'slug' => 'green-tea', 'status' => 'published',
    'blocks' => [['id' => 'sf1', 'type' => 'ITEM_FIELD', 'styles' => [], 'content' => ['field' => 'price']]],
    'field_values' => ['photo' => 'https://x.test/tea.jpg', 'price' => 12]]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$dept_page = (string)@file_get_contents($web . '/departments/design/index.html');
check('a department page lists the people who point to it (and not the others)', strpos($dept_page, 'Ana Rossi') !== false && strpos($dept_page, 'Our people') !== false && strpos($dept_page, 'Luca Bianchi') === false, substr($dept_page, 0, 0));
$shop_page = (string)@file_get_contents($web . '/shop/green-tea/index.html');
preg_match('#<script type="application/ld\+json">(.*?)</script>#s', $shop_page, $sm);
$sld = json_decode($sm[1] ?? '', true);
check('an item page of a Product collection carries its structured data (name, photo, price in EUR)', ($sld['@type'] ?? '') === 'Product' && ($sld['name'] ?? '') === 'Green Tea' && ($sld['image'] ?? '') === 'https://x.test/tea.jpg' && ($sld['offers']['priceCurrency'] ?? '') === 'EUR' && ($sld['offers']['price'] ?? 0) == 12, json_encode($sld));
check('…and a page without structured data has no JSON-LD', strpos((string)@file_get_contents($web . '/departments/design/index.html'), 'application/ld+json') === false);

echo "\nITEM DESIGN\n";
$own->api('save_collection', ['id' => 'col_books', 'name' => 'Books', 'slug' => 'books', 'fields' => [['id' => 'name', 'key' => 'name', 'label' => 'Name', 'type' => 'text']]]);
$r = $own->api('save_collection_design', ['collection_id' => 'col_books', 'blocks' => [
    ['id' => 'dz1', 'type' => 'TEXT', 'styles' => [], 'content' => ['text' => '<h1>{{field:name}}</h1><p>{{item:title}}</p>']]]]);
check('an admin saves the design of a collection', !empty($r['json']['success']) && ($r['json']['blocks'] ?? 0) === 1, json_encode($r['json'] ?? null));
$got = $own->req('GET', '/canvascore-admin/api.php?action=get_collection_design&collection=col_books');
check('the design is given back', count($got['json']['blocks'] ?? []) === 1 && $got['json']['blocks'][0]['id'] === 'dz1');
$own->api('save_item', ['id' => 'bk1', 'collection_id' => 'col_books', 'title' => 'Dune', 'slug' => 'dune', 'status' => 'published', 'blocks' => null, 'field_values' => ['name' => 'Frank Herbert']]);
$own->api('save_item', ['id' => 'bk2', 'collection_id' => 'col_books', 'title' => 'Emma', 'slug' => 'emma', 'status' => 'published', 'blocks' => [['id' => 'own1', 'type' => 'TEXT', 'styles' => [], 'content' => ['text' => 'OWN BLOCK']]], 'field_values' => ['name' => 'Jane Austen']]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$p1 = (string)@file_get_contents($web . '/books/dune/index.html');
$p2 = (string)@file_get_contents($web . '/books/emma/index.html');
check('every item page is built from the design, with its own values', strpos($p1, '<h1>Frank Herbert</h1>') !== false && strpos($p1, '<p>Dune</p>') !== false && strpos($p2, '<h1>Jane Austen</h1>') !== false, substr($p1, 0, 0));
check('an item\'s own blocks are not shown when the collection has a design', strpos($p2, 'OWN BLOCK') === false);
$own->api('save_item', ['id' => 'bk2', 'collection_id' => 'col_books', 'title' => 'Emma', 'slug' => 'emma', 'status' => 'published', 'blocks' => null, 'field_values' => ['name' => 'Jane A.']]);
$kept = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=bk2');
check('saving an item built from the design keeps its own stored blocks (nothing is lost)', strpos((string)($kept['json']['content_json'] ?? ''), 'OWN BLOCK') !== false);
$own->api('save_collection', ['id' => 'col_plain', 'name' => 'Plain', 'slug' => 'plain', 'fields' => []]);
$own->api('save_item', ['id' => 'pl1', 'collection_id' => 'col_plain', 'title' => 'Old one', 'slug' => 'old-one', 'status' => 'published', 'blocks' => [['id' => 'pl1b', 'type' => 'TEXT', 'styles' => [], 'content' => ['text' => 'LEGACY BLOCK']]]]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('a collection with no design keeps its items\' own blocks', strpos((string)@file_get_contents($web . '/plain/old-one/index.html'), 'LEGACY BLOCK') !== false);
$own->api('save_collection_design', ['collection_id' => 'col_books', 'blocks' => []]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('without blocks in the design, the items go back to their own blocks', strpos((string)@file_get_contents($web . '/books/emma/index.html'), 'OWN BLOCK') !== false);

echo "\nCATEGORIES AND TAGS (published)\n";
$own->api('save_collection', ['id' => 'col_news', 'name' => 'News', 'slug' => 'news-desk', 'fields' => []]);
$r = $own->api('save_taxonomies', ['collection_id' => 'col_news', 'taxonomies' => [
    ['id' => 'cat', 'name' => 'Category', 'multiple' => false, 'terms' => [['id' => 'c-news', 'name' => 'World news', 'description' => 'Around the world']]],
    ['id' => 'tags', 'name' => 'Tags', 'multiple' => true, 'terms' => [['id' => 'tg-red', 'name' => 'Red'], ['id' => 'tg-blue', 'name' => 'Blue']]]]]);
check('an admin saves the categories and tags of a collection', !empty($r['json']['success']) && count($r['json']['taxonomies'] ?? []) === 2, json_encode($r['json'] ?? null));
$got = $own->req('GET', '/canvascore-admin/api.php?action=get_taxonomies&collection=col_news');
check('the categories and tags are given back, in order, with their terms', ($got['json'][0]['name'] ?? '') === 'Category' && ($got['json'][1]['terms'][1]['name'] ?? '') === 'Blue', json_encode($got['json'] ?? null));
$own->api('save_item', ['id' => 'nw1', 'collection_id' => 'col_news', 'title' => 'Storm hits coast', 'slug' => 'storm', 'status' => 'published', 'date' => '2026-10-20',
    'blocks' => [['id' => 'nwb', 'type' => 'ITEM_TERMS', 'styles' => [], 'content' => ['taxonomy' => '']]], 'terms' => ['cat' => ['c-news'], 'tags' => ['tg-red', 'tg-blue']]]);
$own->api('save_item', ['id' => 'nw2', 'collection_id' => 'col_news', 'title' => 'Quiet day', 'slug' => 'quiet', 'status' => 'published', 'date' => '2026-10-19', 'blocks' => [], 'terms' => ['tags' => ['tg-red']]]);
$own->api('save_item', ['id' => 'nw3', 'collection_id' => 'col_news', 'title' => 'Old story', 'slug' => 'old', 'status' => 'published', 'archived' => 1, 'date' => '2026-01-01', 'blocks' => [], 'terms' => ['tags' => ['tg-red']]]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$term_page = (string)@file_get_contents($web . '/news-desk/category/world-news/index.html');
check('a term has its own page with its items (newest first), and not the archived ones', strpos($term_page, 'Storm hits coast') !== false && strpos($term_page, 'Quiet day') === false && strpos($term_page, 'Old story') === false, substr($term_page, 0, 0));
check('the term page carries the term\'s name, description and taxonomy', strpos($term_page, 'World news') !== false && strpos($term_page, 'Around the world') !== false && strpos($term_page, 'Category') !== false);
$tag_page = (string)@file_get_contents($web . '/news-desk/tags/red/index.html');
check('a multiple-term taxonomy gets pages for its terms too', strpos($tag_page, 'Storm hits coast') !== false && strpos($tag_page, 'Quiet day') !== false);
$tax_page = (string)@file_get_contents($web . '/news-desk/tags/index.html');
check('a taxonomy has an index page listing its terms with their counts', strpos($tax_page, 'Red') !== false && strpos($tax_page, '(2)') !== false, substr($tax_page, 0, 0));
$storm = (string)@file_get_contents($web . '/news-desk/storm/index.html');
check('an item page shows its categories and tags as links to their pages', strpos($storm, 'news-desk/tags/red/') !== false);
$own->api('save_taxonomies', ['collection_id' => 'col_news', 'taxonomies' => [['id' => 'cat', 'name' => 'Category', 'multiple' => false, 'terms' => [['id' => 'c-news', 'name' => 'World news']]]]]);
$after = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=nw1');
check('removing a taxonomy drops its terms from the items that had them', json_encode(json_decode((string)($after['json']['terms_json'] ?? '{}'), true)) === '{"cat":["c-news"]}', (string)($after['json']['terms_json'] ?? ''));

echo "\nLISTING AND ARCHIVE PAGES (published)\n";
$own->api('save_collection', ['id' => 'col_journal', 'name' => 'Journal', 'slug' => 'journal', 'fields' => [
    ['id' => 'tier', 'key' => 'tier', 'label' => 'Tier', 'type' => 'choice', 'options' => [['value' => 'gold', 'label' => 'Gold'], ['value' => 'silver', 'label' => 'Silver']]]]]);
$r = $own->api('save_collection', ['id' => 'col_journal', 'name' => 'Journal', 'slug' => 'journal', 'archive' => ['perPage' => 500, 'years' => true, 'filters' => true, 'sorts' => true]]);
$jc = $own->api('get_collections');
$jrow = array_values(array_filter($jc['json'] ?? [], function ($c) { return $c['id'] === 'col_journal'; }))[0] ?? [];
check('the listing settings are saved, and the page size is kept within 3 to 50', !empty($r['json']['success']) && ($jrow['archive']['perPage'] ?? 0) === 50 && ($jrow['archive']['years'] ?? false) === true, json_encode($jrow['archive'] ?? null));
$own->api('save_collection', ['id' => 'col_journal', 'name' => 'Journal', 'slug' => 'journal', 'archive' => ['perPage' => 5, 'years' => true, 'filters' => true, 'sorts' => true]]);
for ($i = 1; $i <= 14; $i++) {
    $title = chr(64 + $i) . ' item';   // A item .. N item
    $date = $i <= 8 ? sprintf('2026-10-%02d', $i + 10) : sprintf('2025-03-%02d', $i - 8);
    $own->api('save_item', ['id' => 'jn' . $i, 'collection_id' => 'col_journal', 'title' => $title, 'slug' => 'post-' . $i, 'status' => 'published', 'date' => $date,
        'blocks' => [], 'field_values' => ['tier' => $i % 2 ? 'gold' : 'silver']]);
}
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$lst1 = (string)@file_get_contents($web . '/journal/index.html');
$lst2 = (string)@file_get_contents($web . '/journal/page/2/index.html');
$lst3 = (string)@file_get_contents($web . '/journal/page/3/index.html');
check('the listing is paginated, newest first: page 1 holds the 5 newest items', strpos($lst1, 'H item') !== false && strpos($lst1, 'D item') !== false && strpos($lst1, 'C item') === false, substr($lst1, 0, 0));
check('…page 2 and page 3 hold the next items, and the page links go from one to the next', strpos($lst2, 'C item') !== false && strpos($lst2, 'M item') !== false && strpos($lst3, 'I item') !== false && strpos($lst3, 'Page 3 of 3') !== false && strpos($lst1, 'journal/page/2/') !== false);
check('the first listing page links to its sorts, years, filters and taxonomies', strpos($lst1, 'journal/sort/title/') !== false && strpos($lst1, 'journal/2025/') !== false && strpos($lst1, 'journal/filter/tier/gold/') !== false);
$y2025 = (string)@file_get_contents($web . '/journal/2025/index.html');
check('a year archive holds its items only, paginated', strpos($y2025, 'N item') !== false && strpos($y2025, 'H item') === false && is_file($web . '/journal/2025/page/2/index.html'));
$m = (string)@file_get_contents($web . '/journal/2026/10/index.html');
check('a month archive holds the items of that month', strpos($m, 'H item') !== false && strpos($m, 'N item') === false && strpos($m, 'October 2026') !== false);
$st = (string)@file_get_contents($web . '/journal/sort/title/index.html');
check('the title sort lists the items A to Z', strpos($st, 'A item') !== false && strpos($st, 'A item') < strpos($st, 'B item'));
$so = (string)@file_get_contents($web . '/journal/sort/oldest/index.html');
check('the oldest-first listing starts with the oldest items (I item first; the newest are not on that page)', strpos($so, 'I item') !== false && strpos($so, 'A item') === false && strpos($so, 'I item') < strpos($so, 'M item'), substr($so, 0, 0));
$gold = (string)@file_get_contents($web . '/journal/filter/tier/gold/index.html');
check('a filter archive holds the items that have that choice (and not the others)', strpos($gold, 'A item') !== false && strpos($gold, 'C item') !== false && strpos($gold, 'B item') === false && is_file($web . '/journal/filter/tier/gold/page/2/index.html'));
// an item whose address is a year keeps its page: the year archive does not replace it
$own->api('save_item', ['id' => 'jn2026', 'collection_id' => 'col_journal', 'title' => 'The year item', 'slug' => '2026', 'status' => 'published', 'blocks' => [], 'field_values' => []]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('an item whose address is a year keeps that address (no year archive is written over it)', strpos((string)@file_get_contents($web . '/journal/2026/index.html'), 'The year item') !== false);

echo "\nSCHEDULED PUBLISHING\n";
$own->api('save_collection', ['id' => 'col_sched', 'name' => 'Sched', 'slug' => 'sched', 'fields' => []]);
$own->api('save_item', ['id' => 'sc1', 'collection_id' => 'col_sched', 'title' => 'Due item', 'slug' => 'due', 'status' => 'draft', 'blocks' => []]);
$own->api('save_item', ['id' => 'sc2', 'collection_id' => 'col_sched', 'title' => 'Later item', 'slug' => 'later', 'status' => 'draft', 'blocks' => []]);
$own->api('save_item', ['id' => 'sc3', 'collection_id' => 'col_sched', 'title' => 'Ending item', 'slug' => 'ending', 'status' => 'published', 'blocks' => []]);
$bad = $own->api('set_schedule', ['kind' => 'item', 'id' => 'sc1', 'publish_at' => '2026-13-45 10:00']);
check('a schedule needs a real date and time', empty($bad['json']['success']) && strpos($bad['json']['message'] ?? '', 'date and a time') !== false, json_encode($bad['json'] ?? null));
$order = $own->api('set_schedule', ['kind' => 'item', 'id' => 'sc3', 'publish_at' => '2026-05-01T10:00', 'unpublish_at' => '2026-04-01T10:00']);
check('the unpublish time must come after the publish time', empty($order['json']['success']), json_encode($order['json'] ?? null));
$due = $own->api('set_schedule', ['kind' => 'item', 'id' => 'sc1', 'publish_at' => '2020-01-01T10:00']);
$own->api('set_schedule', ['kind' => 'item', 'id' => 'sc2', 'publish_at' => '2999-01-01T10:00']);
$own->api('set_schedule', ['kind' => 'item', 'id' => 'sc3', 'unpublish_at' => '2020-06-01T09:00']);
check('a schedule is saved as "YYYY-MM-DD HH:MM"', !empty($due['json']['success']) && ($due['json']['publish_at'] ?? '') === '2020-01-01 10:00');
// any admin request makes the due changes (here, a list of items)
$own->req('GET', '/canvascore-admin/api.php?action=get_items&collection=col_sched');
$g1 = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=sc1');
check('the due item goes live on the next admin request, and its schedule is cleared', ($g1['json']['status'] ?? '') === 'published' && ($g1['json']['publish_at'] ?? 'x') === '', json_encode([$g1['json']['status'] ?? null, $g1['json']['publish_at'] ?? null]));
$g2 = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=sc2');
check('an item scheduled for later stays as it is', ($g2['json']['status'] ?? '') === 'draft' && ($g2['json']['publish_at'] ?? '') === '2999-01-01 10:00');
$g3 = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=sc3');
check('an item whose unpublish time has come goes back to draft', ($g3['json']['status'] ?? '') === 'draft' && ($g3['json']['unpublish_at'] ?? 'x') === '');
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('the site is published again after the change: the due item has its page, the ended one none', is_file($web . '/sched/due/index.html') && !is_file($web . '/sched/ending/index.html'));
// cron.php does the same on a server with no admin: here a page whose publish time has come
$own->api('save_item', ['id' => 'sc4', 'collection_id' => 'col_sched', 'title' => 'Cron item', 'slug' => 'cron', 'status' => 'draft', 'blocks' => []]);
$own->api('set_schedule', ['kind' => 'item', 'id' => 'sc4', 'publish_at' => '2020-02-02T10:00']);
$out = [];
exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($admin . '/cron.php') . ' 2>&1', $out, $code);
$g4 = $own->req('GET', '/canvascore-admin/api.php?action=get_item&id=sc4');
check('cron.php makes the due changes from the command line, and refuses to run from the web', $code === 0 && ($g4['json']['status'] ?? '') === 'published' && is_file($web . '/sched/cron/index.html') && implode(' ', $out) !== '', implode(' | ', $out));
$webrun = $anon->req('GET', '/canvascore-admin/cron.php');
check('cron.php is not served to the web', $webrun['code'] === 404 || $webrun['code'] === 403 || strpos((string)$webrun['body'], 'changes') === false);

echo "\nRELATED BY TAG AND THE SEARCH FACETS (published)\n";
$own->api('save_collection', ['id' => 'col_rec', 'name' => 'Recipes', 'slug' => 'recipes', 'fields' => []]);
$own->api('save_taxonomies', ['collection_id' => 'col_rec', 'taxonomies' => [
    ['id' => 'cuisine', 'name' => 'Cuisine', 'multiple' => false, 'terms' => [['id' => 'it', 'name' => 'Italian'], ['id' => 'gr', 'name' => 'Greek']]],
    ['id' => 'mood', 'name' => 'Mood', 'multiple' => true, 'terms' => [['id' => 'quick', 'name' => 'Quick'], ['id' => 'cosy', 'name' => 'Cosy']]]]]);
$tagged = ['pasta' => ['cuisine' => ['it'], 'mood' => ['quick', 'cosy']], 'pizza' => ['cuisine' => ['it'], 'mood' => ['quick']], 'salad' => ['cuisine' => ['gr']], 'risotto' => ['cuisine' => ['it'], 'mood' => ['cosy']]];
foreach ($tagged as $slug => $tm) {
    $own->api('save_item', ['id' => 'rc-' . $slug, 'collection_id' => 'col_rec', 'title' => ucfirst($slug), 'slug' => $slug, 'status' => 'published', 'date' => '2026-10-20',
        'blocks' => $slug === 'pasta' ? [['id' => 'rel1', 'type' => 'RELATED', 'styles' => [], 'content' => ['mode' => 'tags', 'taxonomy' => '', 'limit' => 5, 'title' => 'More like this']]] : [],
        'terms' => $tm]);
}
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$pasta = (string)@file_get_contents($web . '/recipes/pasta/index.html');
check('an item lists the other items that share tags with it, the most shared first, and not the others', strpos($pasta, 'More like this') !== false && strpos($pasta, 'Pizza') !== false && strpos($pasta, 'Risotto') !== false && strpos($pasta, 'Salad') === false
    && strpos($pasta, 'Pizza') < strpos($pasta, 'Risotto'), substr($pasta, strpos($pasta, 'cc-related') ?: 0, 200));
$idx = json_decode((string)@file_get_contents($web . '/search-index.json'), true) ?: [];
$pz = array_values(array_filter($idx, function ($e) { return ($e['t'] ?? '') === 'Pizza'; }))[0] ?? [];
check('the search index carries each item\'s facets: its collection and the terms of each taxonomy', ($pz['f']['collection'] ?? '') === 'Recipes' && ($pz['f']['tax:cuisine'] ?? []) === ['Italian'] && ($pz['f']['tax:mood'] ?? []) === ['Quick'] && ($pz['fl']['tax:cuisine'] ?? '') === 'Cuisine', json_encode($pz));
$pg = array_values(array_filter($idx, function ($e) { return ($e['f']['collection'] ?? '') === 'Pages'; }));
check('pages are in the index under the "Pages" facet', is_array($pg));

echo "\nACCOUNTS\n";
$r = $own->api('add_user', ['username' => 'eddie', 'password' => 'Editor-pass-1', 'role' => 'editor']);
check('an admin adds an editor', !empty($r['json']['success']), $r['code'] . ' ' . $r['body']);
$r = $own->api('add_user', ['username' => 'EDDIE', 'password' => 'Editor-pass-1', 'role' => 'editor']);
check('user names are unique regardless of case', empty($r['json']['success']));
$r = $own->api('add_user', ['username' => '<b>x</b>', 'password' => 'Editor-pass-1', 'role' => 'editor']);
check('user names are checked like in the installer', empty($r['json']['success']));
$ed = new Client(); $ed->login('eddie', 'Editor-pass-1');
$r = $ed->api('get_pages');
check('a forced password change comes first: the server refuses everything else', $r['code'] === 403 && ($r['json']['code'] ?? '') === 'must_change_pw');
$r = $ed->api('change_own_password', ['password' => 'Editor-pass-2']);
if (!empty($r['json']['csrf'])) $ed->csrf = $r['json']['csrf'];
check('…the editor chooses a new password', !empty($r['json']['success']));
check('…then works normally', $ed->api('get_pages')['code'] === 200);
$edId = (int)db()->query("SELECT id FROM admin WHERE username = 'eddie'")->fetchColumn();
$ownerId = (int)db()->query("SELECT id FROM admin WHERE username = 'owner'")->fetchColumn();
$r = $ed->api('add_user', ['username' => 'evil', 'password' => 'Editor-pass-1', 'role' => 'admin']);
check('an editor can\'t add accounts', empty($r['json']['success']) && (int)db()->query("SELECT COUNT(*) FROM admin WHERE username = 'evil'")->fetchColumn() === 0);
$r = $own->api('delete_user', ['id' => $ownerId]);
check('nobody can delete their own account (and the last admin stays)', empty($r['json']['success']));

echo "\nSTORED XSS (editor → admin)\n";
$payload = '<p>Hi</p><img src=x onerror="fetch(1)"><a href="javascript:alert(1)">x</a><svg onload=alert(1)></svg><p style="position:fixed;color:red">t</p>';
$blocks = [['id' => 'b1', 'type' => 'TEXT', 'content' => ['text' => $payload], 'styles' => []],
           ['id' => 'b2', 'type' => 'HERO', 'content' => ['title' => '<h1 onmouseover=x()>T</h1>', 'subtitle' => '<script>x()</script>s', 'bgImage' => "javascript:alert(1)')"], 'styles' => []],
           ['id' => 'b3', 'type' => 'ACCORDION', 'content' => ['items' => [['title' => 'q', 'content' => '<iframe src=//evil></iframe>a']]], 'styles' => []],
           ['id' => 'b4', 'type' => 'GALLERY', 'content' => ['lightbox' => true, 'images' => [['src' => 'javascript:alert(1)']]], 'styles' => []]];
$r = $ed->api('save_page', ['id' => 'p-xss', 'title' => 'X', 'slug' => 'x', 'blocks' => $blocks]);
$stored = (string)db()->query("SELECT content_json FROM pages WHERE id = 'p-xss'")->fetchColumn();
check('an editor\'s rich text is cleaned when SAVED (no handlers, scripts, javascript: links, iframes, positioning)', !empty($r['json']['success']) && !preg_match('/onerror|onload|onmouseover|<script|javascript:alert|<iframe|<svg|position/i', $stored), $stored);
check('…the harmless text stays', strpos($stored, 'Hi') !== false && strpos($stored, 'color: red') !== false);
foreach (['save_item' => ['id' => 'i1', 'collection_id' => 'c', 'title' => 'i', 'blocks' => $blocks],
          'save_part' => ['name' => 'header', 'blocks' => $blocks],
          'save_master' => ['id' => 'm1', 'name' => 'M', 'content_json' => json_encode($blocks[0])],
          'save_template' => ['name' => 'T', 'content_json' => json_encode($blocks[0])]] as $act => $body) $ed->api($act, $body);
$all = '';
foreach (['collection_items', 'site_parts', 'master_components', 'templates', 'page_revisions'] as $tb) foreach (db()->query("SELECT content_json FROM $tb") as $row) $all .= $row['content_json'];
check('…in items, header/footer, masters, templates and the version history too', $all !== '' && !preg_match('/onerror|<script|javascript:alert/i', $all));
$r = $ed->api('save_master', ['id' => 'm2', 'name' => 'M', 'content_json' => json_encode($blocks)]);
check('a master must be one block (a list is refused)', empty($r['json']['success']));
$r = $ed->api('save_page', ['id' => 'p-css', 'title' => 'C', 'slug' => 'c', 'bg_color' => 'red;}body{display:none', 'boxed_width' => '1px;}x{', 'blocks' => [['id' => 's', 'type' => 'TEXT', 'content' => ['text' => 'a'], 'styles' => ['color' => 'red; position:fixed']]]]);
$row = db()->query("SELECT bg_color, boxed_width FROM pages WHERE id = 'p-css'")->fetch(PDO::FETCH_ASSOC);
check('page colors and widths are validated (no CSS breakout)', $row['bg_color'] === '#ffffff' && $row['boxed_width'] === '1200px', json_encode($row));

echo "\nRESERVED ADDRESSES (editor can't replace the admin)\n";
$r = $ed->api('save_page', ['id' => 'p-adm', 'title' => 'Session expired', 'slug' => 'canvascore-admin', 'blocks' => []]);
check('a page can\'t use the admin\'s address, not even as a draft', empty($r['json']['success']) && !db()->query("SELECT 1 FROM pages WHERE id = 'p-adm'")->fetchColumn());
$r = $ed->api('save_page', ['id' => 'p-up', 'title' => 'U', 'slug' => 'uploads', 'blocks' => []]);
check('…nor the uploads folder', empty($r['json']['success']));
$ed->api('save_page', ['id' => 'p-draft', 'title' => 'D', 'slug' => 'draft-only', 'blocks' => []]);
$ed->api('discard_draft', ['id' => 'p-draft']);
check('"discard draft" never publishes a page that was not published', db()->query("SELECT status FROM pages WHERE id = 'p-draft'")->fetchColumn() === 'draft');
// a row planted directly (e.g. by an old version or a crafted restore) is still never published there
db()->exec("INSERT INTO pages (id, title, slug, clean_slug, content_json, status, is_draft_copy) VALUES ('p-planted', 'P', 'canvascore-admin', 'canvascore-admin', '[]', 'published', 0)");
$before = md5_file($admin . '/index.html');
$r = $own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('publishing skips a page with a reserved address (the admin\'s index.html is untouched)', md5_file($admin . '/index.html') === $before && !empty($r['json']['success']), $r['body']);
$own->api('delete_page', ['id' => 'p-planted']);
check('…and deleting such a page doesn\'t delete the admin', is_file($admin . '/index.html'));
db()->exec("INSERT INTO redirects (from_path, to_path) VALUES ('/canvascore-admin/', '/x/'), ('/../escape/', '/x/'), ('/ok/', 'https://e.com/\nAddType application/x-httpd-php .html')");
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$ht = (string)@file_get_contents($web . '/.htaccess');
check('invalid redirects (reserved folder, ../, line breaks) are never written to .htaccess or disk', strpos($ht, 'canvascore-admin') === false && strpos($ht, 'AddType') === false && !is_dir($T . '/escape'), $ht);

echo "\nFORM RECIPIENTS ARE ADMIN-ONLY\n";
$own->api('save_page', ['id' => 'p-form', 'title' => 'F', 'slug' => 'contact', 'publish' => true, 'blocks' => [['id' => 'f1', 'type' => 'FORM', 'content' => ['email' => 'secret-inbox@corp.example', 'fields' => [['label' => 'Name', 'type' => 'text']]], 'styles' => []]]]);
$r = $ed->api('get_pages');
check('editors don\'t receive a form\'s own email address', strpos($r['body'], 'secret-inbox') === false && strpos($r['body'], 'p-form') !== false);
check('…admins do', strpos($own->api('get_pages')['body'], 'secret-inbox') !== false);

echo "\nMULTI-STEP FORM RECIPIENTS ARE ADMIN-ONLY TOO\n";
$wiz = function ($id, $email) { return ['id' => $id, 'type' => 'WIZARD', 'content' => ['email' => $email, 'steps' => [['title' => 'A', 'fields' => [['label' => 'Name', 'type' => 'text']]]]], 'styles' => []]; };
$own->api('save_page', ['id' => 'p-wiz', 'title' => 'W', 'slug' => 'wizard', 'publish' => true, 'blocks' => [$wiz('w1', 'wizard-secret@corp.example')]]);
$r = $ed->api('get_pages');
check('editors don\'t receive a multi-step form\'s own email address', strpos($r['body'], 'wizard-secret') === false && strpos($r['body'], 'p-wiz') !== false);
check('…admins do', strpos($own->api('get_pages')['body'], 'wizard-secret') !== false);
$ed->api('save_page', ['id' => 'p-wiz', 'title' => 'W again', 'slug' => 'wizard', 'publish' => true, 'blocks' => [$wiz('w1', 'hacker@evil.example')]]);
$stored = (string)db()->query("SELECT content_json FROM pages WHERE id = 'p-wiz'")->fetchColumn();
check('an editor can\'t change it: the admin\'s address stays on save, theirs is not stored', strpos($stored, 'wizard-secret@corp.example') !== false && strpos($stored, 'hacker@evil.example') === false, $stored);
$ed->api('save_page', ['id' => 'p-wiz2', 'title' => 'W3', 'slug' => 'wizard-two', 'publish' => true, 'blocks' => [$wiz('w2', 'hacker2@evil.example')]]);
$stored2 = (string)db()->query("SELECT content_json FROM pages WHERE id = 'p-wiz2'")->fetchColumn();
check('a multi-step form made by an editor has no recipient of its own (the global one is used)', $stored2 !== '' && strpos($stored2, 'hacker2@evil.example') === false, $stored2);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$regJson = (string)@file_get_contents($data . '/forms.json');
check('the published registry holds the admin\'s address for that form and none of the editors\'', strpos($regJson, 'wizard-secret@corp.example') !== false && strpos($regJson, 'hacker') === false, $regJson);

echo "\nNEWSLETTER RECIPIENTS ARE ADMIN-ONLY TOO\n";
$nlb = function ($id, $email) { return ['id' => $id, 'type' => 'NEWSLETTER', 'content' => ['email' => $email], 'styles' => []]; };
$own->api('save_page', ['id' => 'p-nl', 'title' => 'N', 'slug' => 'news', 'publish' => true, 'blocks' => [$nlb('n1', 'news-secret@corp.example')]]);
$r = $ed->api('get_pages');
check('editors don\'t receive a newsletter block\'s own email address', strpos($r['body'], 'news-secret') === false && strpos($r['body'], 'p-nl') !== false);
check('…admins do', strpos($own->api('get_pages')['body'], 'news-secret') !== false);
$ed->api('save_page', ['id' => 'p-nl', 'title' => 'N again', 'slug' => 'news', 'publish' => true, 'blocks' => [$nlb('n1', 'hacker-news@evil.example')]]);
$storedN = (string)db()->query("SELECT content_json FROM pages WHERE id = 'p-nl'")->fetchColumn();
check('an editor can\'t change it: the admin\'s address stays on save, theirs is not stored', strpos($storedN, 'news-secret@corp.example') !== false && strpos($storedN, 'hacker-news@evil.example') === false, $storedN);
$ed->api('save_page', ['id' => 'p-nl2', 'title' => 'N3', 'slug' => 'news-two', 'publish' => true, 'blocks' => [$nlb('n2', 'hacker-news2@evil.example')]]);
check('a newsletter made by an editor has no recipient of its own', strpos((string)db()->query("SELECT content_json FROM pages WHERE id = 'p-nl2'")->fetchColumn(), 'hacker-news2') === false);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$regJson = (string)@file_get_contents($data . '/forms.json');
check('the published registry holds the admin\'s address for it and none of the editors\'', strpos($regJson, 'news-secret@corp.example') !== false && strpos($regJson, 'hacker-news') === false, $regJson);

echo "\nSITE-WIDE ANNOUNCEMENT BAR\n";
$cur = $own->api('get_settings')['json']; if (!is_array($cur)) $cur = [];
$own->api('save_settings', array_merge($cur, ['announcement' => ['enabled' => true, 'text' => 'Sale $1 \\1 <b>x</b> "q"', 'linkText' => 'Go', 'linkUrl' => 'contact/index.html', 'preset' => 'promo', 'sticky' => true]]));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$pg = (string)@file_get_contents($web . '/contact/index.html');
check('every published page gets the bar right after <body>, before the menu', (bool)preg_match('~<body[^>]*>\s*<div id="cc-site-announce"~', $pg), substr($pg, strpos($pg, '<body'), 200));
check('its text is escaped and keeps "$1" and backslashes as typed (a replacement string would have read them as references)', strpos($pg, 'Sale $1 \\1 &lt;b&gt;x&lt;/b&gt; &quot;q&quot;') !== false);
check('the link points at the page under the site\'s address, and sticky is on', strpos($pg, 'href="/contact/"') !== false && strpos($pg, 'position:sticky; top:0') !== false);
check('it carries its dismiss script and key (so a changed message shows again)', strpos($pg, 'ccAnnounceInit') !== false && (bool)preg_match('/data-key="[0-9a-f]{8}"/', $pg));
$cur2 = $ed->api('get_settings')['json'];
$ed->api('save_settings', array_merge(is_array($cur2) ? $cur2 : [], ['announcement' => ['enabled' => true, 'text' => '<script>alert(1)</script>', 'linkText' => 'x', 'linkUrl' => 'javascript:alert(2)', 'bg' => 'red;}x{']]));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$pg = (string)@file_get_contents($web . '/contact/index.html');
check('an editor can change it, but nothing in it can run: text is escaped, no javascript: link, an unsafe color is replaced', strpos($pg, '&lt;script&gt;alert(1)') !== false && strpos($pg, '<script>alert(1)') === false && stripos($pg, 'href="javascript:') === false && strpos($pg, 'red;}x{') === false);
$cur3 = $own->api('get_settings')['json'];
$own->api('save_settings', array_merge(is_array($cur3) ? $cur3 : [], ['announcement' => ['enabled' => false, 'text' => 'Gone']]));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('turned off (or with no text) the bar disappears from the next publish', strpos((string)@file_get_contents($web . '/contact/index.html'), 'cc-site-announce') === false);

echo "\nSESSIONS END WITH THE ACCOUNT\n";
$ed2 = new Client(); $ed2->login('eddie', 'Editor-pass-2');
$own->api('force_password', ['id' => $edId, 'password' => 'Reset-pass-123']);
check('resetting a password signs the account out everywhere', $ed2->api('get_pages')['code'] === 401);
$ed3 = new Client(); $ed3->login('eddie', 'Reset-pass-123');
$own->api('delete_user', ['id' => $edId]);
check('deleting an account ends its open sessions at once', $ed3->api('get_pages')['code'] === 401 && $ed3->api('save_menu', ['items' => []])['code'] === 401);

echo "\nUPLOADS\n";
$up = function ($name, $content) use ($own) {
    $f = tempnam(sys_get_temp_dir(), 'up'); file_put_contents($f, $content);
    $r = $own->req('POST', '/canvascore-admin/api.php?action=upload_media', ['file' => new CURLFile($f, 'image/svg+xml', $name)], [], false);
    @unlink($f); return !empty($r['json']['success']);
};
check('a plain SVG is accepted', $up('ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="url(#g)"/><defs><linearGradient id="g"/></defs></svg>'));
check('SVG: a link animated to javascript: is refused', !$up('a.svg', '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="x;javascript:alert(1)"/><text>x</text></a></svg>'));
check('SVG: embedded HTML (form, button formaction) is refused', !$up('b.svg', '<svg xmlns="http://www.w3.org/2000/svg"><foo xmlns="http://www.w3.org/1999/xhtml"><form action="x"><button>b</button></form></foo></svg>'));
check('SVG: <use> of an external or data: document is refused', !$up('c.svg', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="data:image/svg+xml;base64,PHN2Zy8+#x"/></svg>'));
check('SVG: style sheets that load or import are refused', !$up('d.svg', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(//evil/x.css);</style></svg>'));
check('SVG: <set> and processing instructions are refused', !$up('e.svg', '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="x"/></svg>') && !$up('f.svg', '<?xml-stylesheet href="x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"/>'));

echo "\nAUDIO AND VIDEO UPLOADS\n";
$upm = function ($name, $content) use ($own) {
    $f = tempnam(sys_get_temp_dir(), 'up'); file_put_contents($f, $content);
    $r = $own->req('POST', '/canvascore-admin/api.php?action=upload_media', ['file' => new CURLFile($f, 'application/octet-stream', $name)], [], false);
    @unlink($f); return $r['json'] ?? [];
};
$mp3 = "ID3\x03\x00\x00\x00\x00\x00\x00" . str_repeat("\x00", 64);
$mp3raw = "\xFF\xFB\x90\x00" . str_repeat("\x00", 64);
$mp4 = "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" . str_repeat("\x00", 64);
$webm = "\x1A\x45\xDF\xA3\x9F\x42\x86\x81\x01" . str_repeat("\x00", 64);
$ogg = "OggS\x00\x02" . str_repeat("\x00", 64);
$wav = "RIFF\x24\x00\x00\x00WAVEfmt " . str_repeat("\x00", 32);
$r = $upm('song.mp3', $mp3);
check('a real MP3 (ID3 tag) is accepted, listed as audio, and kept with its extension', !empty($r['success']) && ($r['kind'] ?? '') === 'audio' && substr($r['filename'] ?? '', -9) === '_song.mp3' && is_file($web . '/uploads/' . $r['filename']), json_encode($r));
check('…an MP3 without a tag (frame sync) too', !empty($upm('raw.mp3', $mp3raw)['success']));
$r = $upm('clip.mp4', $mp4);
check('a real MP4 is accepted and listed as video', !empty($r['success']) && ($r['kind'] ?? '') === 'video', json_encode($r));
check('…and WebM, OGG and WAV', !empty($upm('a.webm', $webm)['success']) && !empty($upm('a.ogg', $ogg)['success']) && !empty($upm('a.wav', $wav)['success']));
check('the media list says what each file is (image, audio or video)', (function () use ($own) {
    $kinds = []; foreach ($own->api('get_media')['json'] as $m) $kinds[pathinfo($m['name'], PATHINFO_EXTENSION)] = $m['kind'];
    return ($kinds['mp3'] ?? '') === 'audio' && ($kinds['mp4'] ?? '') === 'video' && ($kinds['svg'] ?? '') === 'image';
})());
check('a script, page or text renamed to .mp3 / .mp4 / .webm / .ogg / .wav is refused', array_reduce(['evil.mp3', 'evil.mp4', 'evil.webm', 'evil.ogg', 'evil.wav', 'evil.m4a'], function ($ok, $n) use ($upm) { return $ok && empty($upm($n, "<?php system(\$_GET['c']); ?>")['success']) && empty($upm($n, '<html><script>alert(1)</script></html>')['success']); }, true));
check('a real MP4 header does not make a .php / .phtml / .html file acceptable, and a double extension ends as the last one', empty($upm('x.php', $mp4)['success']) && empty($upm('x.phtml', $mp4)['success']) && empty($upm('x.html', $mp4)['success']) && empty($upm('x.mp4.php', $mp4)['success']));
check('an MP3 header named .mp4 is refused (the header must match the type)', empty($upm('x.mp4', $mp3)['success']) && empty($upm('x.webm', $mp4)['success']));
check('an empty file named .mp3 is refused', empty($upm('empty.mp3', '')['success']));
$r = $upm('../../evil.mp3', $mp3);
check('a path in the file name is dropped: the file stays inside uploads', !empty($r['success']) && strpos($r['filename'], '/') === false && strpos($r['filename'], '..') === false && is_file($web . '/uploads/' . $r['filename']), json_encode($r));
$names = array_filter(scandir($web . '/uploads'), function ($f) { return preg_match('/\.(php|phtml|html)$/i', $f); });
check('nothing executable ended up in the uploads folder', !$names, implode(',', $names));

echo "\nPUBLIC FORM ENDPOINT\n";
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$reg = json_decode((string)@file_get_contents($data . '/forms.json'), true) ?: [];
$fid = array_key_first($reg);
$post = function ($fields, $headers = []) { $c = new Client(); return $c->req('POST', '/canvascore-admin/submit_form.php', http_build_query($fields), array_merge(['Content-Type: application/x-www-form-urlencoded'], $headers), false); };
$r = $post(['_form' => $fid, 'field_0' => 'Ann', 'field_7' => str_repeat('x', 3000), 'evil' => 'y', '_label_field_0' => '=HYPERLINK("x")', '_success' => 'Call 555-SCAM now']);
$sub = (string)db()->query("SELECT data_json FROM form_submissions ORDER BY id DESC LIMIT 1")->fetchColumn();
check('only the form\'s own fields are stored, with the labels from the site', $sub === json_encode(['Name' => 'Ann'], JSON_UNESCAPED_UNICODE), $sub);
check('the reply shows the site\'s message, never one sent by the visitor', strpos($r['body'], 'Call 555-SCAM') === false);
check('the form page sets no session cookie', stripos($r['head'], 'Set-Cookie') === false);
$r = $post(['_form' => $fid, 'field_0' => str_repeat('A', 70000)]);
check('an oversized submission is refused', $r['code'] === 413);
$r = $post(['_form' => 'f_unknown', 'field_0' => 'x']);
check('an unknown form is refused', $r['code'] === 400);

echo "\nCSV EXPORT\n";
db()->exec("INSERT INTO form_submissions (form_id, page, data_json) VALUES ('f', '', '{\"=cmd|x\":\"+1\"}')");
$csv = (string)($own->api('export_submissions')['json']['csv'] ?? '');
check('formula characters are neutralized in column names too', strpos($csv, "'=cmd") !== false && strpos($csv, "'+1") !== false, $csv);

echo "\nDEMO MODE\n";
$r = (new Client())->api('branding');
check('without demo.json the sign-in screen gets no demo login and pages may be indexed', !isset($r['json']['demo']) && stripos($r['head'], 'X-Robots-Tag') === false, $r['body']);
// the visitors' account (an editor that already chose its password) and a collection, made before demo mode is on
$own->api('add_user', ['username' => 'visitor', 'password' => 'Visitor-pass-1', 'role' => 'editor']);
$vis = new Client(); $vis->login('visitor', 'Visitor-pass-1');
$r = $vis->api('change_own_password', ['password' => 'Visitor-pass-2']); if (!empty($r['json']['csrf'])) $vis->csrf = $r['json']['csrf'];
$own->api('save_collection', ['id' => 'col_demo', 'name' => 'Demo news', 'slug' => 'demo-news']);
file_put_contents($data . '/demo.json', json_encode(['username' => 'demo', 'password' => 'canvasdemo', 'resetMinutes' => 10, 'maxNewPages' => 2, 'maxNewItems' => 2]));
$r = (new Client())->api('branding');
$d = $r['json']['demo'] ?? [];
check('with demo.json the sign-in screen gets the demo login, the reset interval and the limits', ($d['username'] ?? '') === 'demo' && ($d['password'] ?? '') === 'canvasdemo' && ($d['resetMinutes'] ?? 0) === 10 && ($d['maxNewPages'] ?? 0) === 2 && ($d['maxNewItems'] ?? 0) === 2, $r['body']);
check('…and the seconds until the next reset, for the countdown', is_int($d['nextResetIn'] ?? null) && $d['nextResetIn'] > 0 && $d['nextResetIn'] <= 600, $r['body']);
check('…and search engines are told not to index the demo', stripos($r['head'], 'X-Robots-Tag: noindex') !== false);
$hash = (string)db()->query("SELECT password_hash FROM admin WHERE username = 'owner'")->fetchColumn();
$r = $own->api('change_own_password', ['current' => 'Correct-Horse-9', 'password' => 'Another-pass-99']);
check('a visitor can\'t change the shared password', empty($r['json']['success']) && (string)db()->query("SELECT password_hash FROM admin WHERE username = 'owner'")->fetchColumn() === $hash, $r['body']);
check('…nor reset another account\'s', empty($own->api('force_password', ['id' => 1, 'password' => 'Another-pass-99'])['json']['success']));
check('uploads are refused', !$up('demo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>') && !is_file($web . '/uploads/demo.svg'));
$before = (int)db()->query("SELECT COUNT(*) FROM form_submissions")->fetchColumn();
$r = $post(['_form' => $fid, 'field_0' => 'Demo visitor']);
check('form submissions are still stored and answered (only the mail is skipped)', $r['code'] === 200 && (int)db()->query("SELECT COUNT(*) FROM form_submissions")->fetchColumn() === $before + 1, $r['code'] . ' ' . strip_tags($r['body']));
$page = function ($id) use ($vis) { return !empty($vis->api('save_page', ['id' => $id, 'title' => $id, 'slug' => $id, 'blocks' => []])['json']['success']); };
check('visitors can create the allowed number of new pages', $page('demo-p1') && $page('demo-p2'));
$r = $vis->api('save_page', ['id' => 'demo-p3', 'title' => 'p3', 'slug' => 'demo-p3', 'blocks' => []]);
check('…and no more, with a message saying why', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), '2 new pages') !== false && !db()->query("SELECT id FROM pages WHERE id = 'demo-p3'")->fetch(), $r['body']);
check('…while saving an existing page still works', $page('demo-p1'));
check('…and admins are not limited', !empty($own->api('save_page', ['id' => 'demo-own', 'title' => 'o', 'slug' => 'demo-own', 'blocks' => []])['json']['success']));
$item = function ($id) use ($vis) { return !empty($vis->api('save_item', ['id' => $id, 'collection_id' => 'col_demo', 'title' => $id, 'slug' => $id])['json']['success']); };
check('visitors can create the allowed number of collection items', $item('demo-i1') && $item('demo-i2'));
$r = $vis->api('save_item', ['id' => 'demo-i3', 'collection_id' => 'col_demo', 'title' => 'i3', 'slug' => 'demo-i3']);
check('…and no more, with a message saying why', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), '2 new collection items') !== false && !db()->query("SELECT id FROM collection_items WHERE id = 'demo-i3'")->fetch(), $r['body']);
check('…while saving an existing item still works', $item('demo-i1'));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('published pages of the demo carry a noindex tag', strpos((string)@file_get_contents($web . '/contact/index.html'), '<meta name="robots" content="noindex">') !== false);
check('…and robots.txt keeps every crawler out', strpos((string)@file_get_contents($web . '/robots.txt'), 'Disallow: /') !== false);
unlink($data . '/demo.json');
check('removing demo.json turns demo mode off', !isset((new Client())->api('branding')['json']['demo']));
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('…and the next publish lets search engines in again', strpos((string)@file_get_contents($web . '/contact/index.html'), 'name="robots"') === false && strpos((string)@file_get_contents($web . '/robots.txt'), 'Allow: /') !== false);

echo "\n" . ($fails ? "$fails checks failed" : 'SECURITY OK') . " ($total checks)\n";
exit($fails ? 1 : 0);
