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
@mkdir($admin . '/blocks'); foreach (glob($src . '/blocks/*.json') as $f) copy($f, $admin . '/blocks/' . basename($f));   // the shared block definitions
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
    if (function_exists('exec')) @exec('pkill -f -- ' . escapeshellarg('-t ' . $GLOBALS['web']) . ' 2>/dev/null');   // the server's worker processes too
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
foreach (['config.php', 'compiler.php', 'migrations.php', 'media.php', 'backup.php', 'update.php', 'update-keys.php'] as $lib) {
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

echo "\nBLOCK PACKAGES (over HTTP)\n";
$exDir = realpath(__DIR__ . '/../../docs/examples/block-packages/pull-quote'); $PT = 'X_PULL_QUOTE__PULL_QUOTE'; $pkgN = 0;
// a package ZIP made from the example (without its minVersion: this server runs the version being tested), changed by $edit(files, block)
$mkPkg = function ($edit = null) use ($exDir, $T, &$pkgN) {
    $files = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($exDir, FilesystemIterator::SKIP_DOTS)) as $f) $files[str_replace('\\', '/', substr($f->getPathname(), strlen($exDir) + 1))] = file_get_contents($f->getPathname());
    $m = json_decode($files['package.json'], true); unset($m['minVersion']); $files['package.json'] = json_encode($m);
    $b = json_decode($files['blocks/pull-quote.json'], true);
    if ($edit) [$files, $b] = $edit($files, $b);
    $files['blocks/pull-quote.json'] = json_encode($b);
    $zf = $T . '/pkg-' . (++$pkgN) . '.zip'; $z = new ZipArchive(); $z->open($zf, ZipArchive::CREATE);
    foreach ($files as $n => $c) $z->addFromString($n, $c);
    $z->close(); return $zf;
};
$upload = function ($client, $zf) { return $client->req('POST', '/canvascore-admin/api.php?action=pkg_install', ['package' => new CURLFile($zf, 'application/zip', 'p.zip')], [], false); };
$good = $mkPkg();
// an editor of its own for this section (the earlier editor's session may have ended)
$own->api('add_user', ['username' => 'pkged', 'password' => 'Editor-pass-1', 'role' => 'editor']);
$ed = new Client(); $ed->login('pkged', 'Editor-pass-1');
$r = $ed->api('change_own_password', ['password' => 'Editor-pass-2']); if (!empty($r['json']['csrf'])) $ed->csrf = $r['json']['csrf'];

check('nobody signed out can list or install packages', (new Client())->api('pkg_list')['code'] === 401 && $upload(new Client(), $good)['code'] === 401);
$r = $upload($ed, $good);
check('an editor can\'t install a package', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), 'Only admins') !== false && !is_dir($web . '/canvascore-blocks/pull-quote'), $r['body']);
check('…nor list, switch or remove them', strpos((string)($ed->api('pkg_info')['json']['message'] ?? ''), 'Only admins') !== false && empty($ed->api('pkg_set_enabled', ['id' => 'pull-quote', 'enabled' => false])['json']['success']) && empty($ed->api('pkg_remove', ['id' => 'pull-quote'])['json']['success']));
$r = $upload($own, $good);
check('an admin installs a package by uploading its ZIP', !empty($r['json']['success']) && ($r['json']['types'][0] ?? '') === $PT && is_file($data . '/packages/pull-quote/blocks/pull-quote.json'), $r['body']);
$asset = $own->req('GET', '/canvascore-blocks/pull-quote/quote.svg');
check('its images are copied to the site, and served', $asset['code'] === 200 && strpos($asset['body'], '<svg') !== false && strpos((string)@file_get_contents($web . '/canvascore-blocks/.htaccess'), 'php') !== false);
$pl = $ed->api('pkg_list')['json'] ?? [];
check('editors receive the enabled packages (their blocks and the scoped CSS) for the editor', ($pl['packages'][0]['blocks'][0]['type'] ?? '') === $PT && strpos((string)($pl['css'] ?? ''), '.cc-pkg-pull-quote{') === 0);
$info = $own->api('pkg_info')['json'] ?? [];
check('the admin sees the package, its blocks and where it is used', ($info['packages'][0]['id'] ?? '') === 'pull-quote' && ($info['packages'][0]['enabled'] ?? null) === true && ($info['packages'][0]['used'] ?? -1) === 0 && !empty($info['zip']));
$blk = ['id' => 'q1', 'type' => $PT, 'styles' => ['padding' => '8px'], 'content' => ['quote' => 'Hello <script>alert(1)</script>', 'author' => 'Ann', 'link' => 'javascript:alert(1)', 'linkText' => 'src']];
$r = $ed->api('save_page', ['id' => 'p-pq', 'title' => 'PQ', 'slug' => 'pq', 'publish' => true, 'blocks' => [$blk]]);
check('an editor can use the block on a page', !empty($r['json']['success']), $r['body']);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$pq = (string)@file_get_contents($web . '/pq/index.html');
check('the published page has the block, escaped, with no active address and no script of its own', strpos($pq, '<figure id="q1" class="pq cc-pkg-pull-quote"') !== false && strpos($pq, 'Hello &lt;script&gt;alert(1)&lt;/script&gt;') !== false && strpos($pq, 'href="javascript:') === false && strpos($pq, 'alert(1)</script>') === false, substr($pq, 0, 0));
check('…and its CSS, confined to the package\'s class and pointing at the images of the site', strpos($pq, '.cc-pkg-pull-quote{&.pq {') !== false && strpos($pq, '/canvascore-blocks/pull-quote/quote.svg') !== false && strpos($pq, '{{BASE_URL}}') === false && strpos($pq, '{{PACKAGE_CSS}}') === false);
$r = $own->api('save_page', ['id' => 'p-res', 'title' => 'R', 'slug' => 'canvascore-blocks', 'blocks' => []]);
check('canvascore-blocks is a reserved address: no page can be published there', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'slug_taken', $r['body']);
$before = json_encode(glob($data . '/packages/*'));
$evil = $upload($own, $mkPkg(function ($f, $b) { $b['template'][] = '<script>alert(1)</script>'; $f['evil.php'] = '<?php echo 1;'; return [$f, $b]; }));
check('a hostile package is refused with the reasons, and nothing is installed or copied', empty($evil['json']['success']) && count($evil['json']['errors'] ?? []) >= 2 && json_encode(glob($data . '/packages/*')) === $before && !is_file($web . '/evil.php'), $evil['body']);
$r = $upload($own, __FILE__);
check('something that is not a ZIP is refused cleanly (no server error)', $r['code'] === 200 && empty($r['json']['success']) && !empty($r['json']['errors']), $r['body']);
$big = $T . '/big.zip'; file_put_contents($big, random_bytes(3 * 1048576)); $r = $upload($own, $big);
check('a file that is too large is refused cleanly', $r['code'] === 200 && empty($r['json']['success']), substr($r['body'], 0, 200));
$r = $upload($own, $good);
check('the same version again is refused', empty($r['json']['success']) && stripos(implode(' ', $r['json']['errors'] ?? []), 'already installed') !== false);
$r = $own->api('pkg_set_enabled', ['id' => 'pull-quote', 'enabled' => false]);
$own->req('POST', '/canvascore-admin/rebuild_all.php', '');
$pq = (string)@file_get_contents($web . '/pq/index.html');
check('switched off, the page no longer shows the block (it stays saved) and the CSS is gone', !empty($r['json']['success']) && strpos($pq, 'cc-pkg-pull-quote') === false && strpos($pq, 'Unknown element') !== false && (($ed->api('pkg_list')['json']['packages'] ?? ['x']) === []));
check('…the saved page still holds the block', strpos((string)db()->query("SELECT content_json FROM pages WHERE id = 'p-pq'")->fetchColumn(), $PT) !== false && (($own->api('pkg_info')['json']['packages'][0]['used'] ?? 0) >= 1));
$own->api('pkg_set_enabled', ['id' => 'pull-quote', 'enabled' => true]);
$r = $own->api('pkg_remove', ['id' => 'pull-quote']);
check('an admin removes it: its files and its images go', !empty($r['json']['success']) && !is_dir($data . '/packages/pull-quote') && !is_dir($web . '/canvascore-blocks/pull-quote') && $own->req('GET', '/canvascore-blocks/pull-quote/quote.svg')['code'] === 404 && ($own->api('pkg_info')['json']['packages'] ?? ['x']) === []);
$own->api('delete_page', ['id' => 'p-pq']); $own->req('POST', '/canvascore-admin/rebuild_all.php', '');

echo "\nWORDPRESS IMPORT (over HTTP)\n";
$wpx = __DIR__ . '/fixtures/wordpress.xml';
$wpUp = function ($client, $file) { return $client->req('POST', '/canvascore-admin/api.php?action=wp_analyze', ['file' => new CURLFile($file, 'text/xml', 'export.xml')], [], false); };
check('nobody signed out can use the importer', (new Client())->api('wp_info')['code'] === 401 && $wpUp(new Client(), $wpx)['code'] === 401);
$r = $wpUp($ed, $wpx);
check('an editor can\'t import', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), 'Only admins') !== false, $r['body']);
check('…nor start or step an import', strpos((string)($ed->api('wp_start', ['job' => '0123456789abcdef'])['json']['message'] ?? ''), 'Only admins') !== false && strpos((string)($ed->api('wp_step', ['job' => '0123456789abcdef'])['json']['message'] ?? ''), 'Only admins') !== false);
$evil = $T . '/evil.xml';
file_put_contents($evil, '<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title></item></channel></rss>' . str_repeat(' ', 60));
$r = $wpUp($own, $evil);
check('a file that declares an XML entity is refused, and nothing is stored', empty($r['json']['success']) && !glob($data . '/imports/*/pages.jsonl'), $r['body']);
$r = $own->api('wp_start', ['job' => '../../../etc']);
check('a job id with path tricks is refused', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), 'no longer there') !== false, $r['body']);
$r = $wpUp($own, $wpx);
$wj = $r['json']['job'] ?? '';
check('an admin uploads the export: it is read and summarised, the site is unchanged', !empty($r['json']['success']) && preg_match('/^[a-f0-9]{16}$/', $wj) && ($r['json']['summary']['counts']['posts'] ?? 0) === 2 && !glob($web . '/uploads/*team*'), $r['body']);
check('the job lives in the data folder, which the web server does not serve', is_dir($data . '/imports/' . $wj) && !is_dir($web . '/imports') && $own->req('GET', '/canvascore-data/imports/' . $wj . '/meta.json', null, [], false)['code'] === 404);
$r = $own->api('wp_start', ['job' => $wj, 'options' => ['media' => false, 'drafts' => true, 'collection_name' => 'Imported news']]);
check('the import starts with the chosen options', !empty($r['json']['success']) && isset($r['json']['phase']), $r['body']);
$n = 0; while (empty($r['json']['finished']) && $n++ < 60) $r = $own->api('wp_step', ['job' => $wj]);
check('steps run until the import is finished', !empty($r['json']['finished']) && ($r['json']['created']['pages'] ?? 0) === 1 && ($r['json']['created']['posts'] ?? 0) === 2 && ($r['json']['created']['terms'] ?? 0) === 3, $r['body']);
$pgs = $own->api('get_pages')['json'] ?? [];
$imp = array_values(array_filter($pgs, function ($p) { return ($p['title'] ?? '') === 'About us'; }));
check('the page is there, as a draft', count($imp) === 1 && ($imp[0]['status'] ?? '') === 'draft');
$cols = $own->api('get_collections')['json'] ?? [];
$ic = array_values(array_filter($cols, function ($c) { return ($c['name'] ?? '') === 'Imported news'; }));
$its = $ic ? ($own->api('get_items&collection=' . $ic[0]['id'])['json'] ?? []) : [];
check('the posts are items of the new collection, as drafts', $ic && count($its) === 2 && array_unique(array_column($its, 'status')) === ['draft'], json_encode($its));
$tx = $ic ? ($own->api('get_taxonomies&collection=' . $ic[0]['id'])['json'] ?? []) : [];
check('its categories and tags are there', is_array($tx) && count($tx) === 2 && array_sum(array_map(function ($t) { return count($t['terms'] ?? []); }, $tx)) === 3, json_encode($tx));
$pg1 = $imp ? ($own->api('get_pages')['json'] ?? []) : [];
$row = null; foreach ($pg1 as $p) if (($p['title'] ?? '') === 'About us') $row = $p;
$full = $row ? $ed->api('get_pages')['json'] : [];
check('an imported page keeps no script from the file', strpos(json_encode($full), '<script') === false && strpos(json_encode($full), 'alert(1)') === false);
$rd = $own->api('wp_discard', ['job' => $wj]);
clearstatcache();
check('a finished import can be discarded', !empty($rd['json']['success']) && !is_dir($data . '/imports/' . $wj), $rd['body']);
$rs = $own->api('wp_step', ['job' => $wj]);
check('…and a discarded one is gone', empty($rs['json']['success']) && strpos((string)($rs['json']['message'] ?? ''), 'no longer there') !== false, $rs['code'] . ' ' . $rs['body']);
$r = $own->api('wp_info');
check('the importer tells the editor what the server can do', !empty($r['json']['success']) && array_key_exists('curl', $r['json']) && !empty($r['json']['xml']) && is_array($r['json']['collections']), $r['body']);

echo "\nIMAGE TOOLS (over HTTP)\n";
$imgf = $T . '/tool.jpg'; $g = imagecreatetruecolor(400, 200); imagefilledrectangle($g, 0, 0, 399, 199, imagecolorallocate($g, 10, 120, 200)); imagejpeg($g, $imgf, 90);
$pngf2 = $T . '/tool.png'; imagepng($g, $pngf2);
$up = $own->req('POST', '/canvascore-admin/api.php?action=upload_media', ['file' => new CURLFile($imgf, 'image/jpeg', 'tool.jpg')], [], false);
$tn = $up['json']['filename'] ?? '';
check('(setup) an image is uploaded', !empty($up['json']['success']) && $tn !== '', $up['body']);
check('nobody signed out can crop, replace, import or set a focal point', (new Client())->api('media_crop', ['name' => $tn])['code'] === 401 && (new Client())->api('media_import_url', ['url' => 'https://example.com/a.png'])['code'] === 401);
$r = $ed->api('save_media_meta', ['name' => $tn, 'focal' => ['x' => 140, 'y' => 'abc']]);
$lib = array_values(array_filter($own->api('get_media')['json'] ?? [], function ($m) use ($tn) { return $m['name'] === $tn; }));
check('a focal point is stored cleaned (an editor may set it; nonsense is refused) and listed with the image', !empty($r['json']['success']) && array_key_exists('focal', $lib[0]) && $lib[0]['focal'] === null);
$own->api('save_media_meta', ['name' => $tn, 'focal' => ['x' => 33.33, 'y' => 66]]);
$lib = array_values(array_filter($own->api('get_media')['json'] ?? [], function ($m) use ($tn) { return $m['name'] === $tn; }));
check('…a good one is kept (percent, one decimal), and the description is not touched when only the focal point is sent', ($lib[0]['focal'] ?? null) === ['x' => 33.3, 'y' => 66] || ($lib[0]['focal'] ?? null) === ['x' => 33.3, 'y' => 66.0], json_encode($lib[0] ?? null));
$r = $own->api('media_crop', ['name' => $tn, 'x' => 0, 'y' => 0, 'w' => 200, 'h' => 200, 'mode' => 'copy']);
$cn = $r['json']['name'] ?? '';
check('a crop saved as a copy gives a new file of the right size; the original stays', !empty($r['json']['success']) && $cn !== $tn && is_file($web . '/uploads/' . $cn) && getimagesize($web . '/uploads/' . $cn)[0] === 200 && getimagesize($web . '/uploads/' . $tn)[0] === 400, $r['body']);
check('a crop outside the image, with nonsense numbers, or on a path outside uploads is refused', empty($own->api('media_crop', ['name' => $tn, 'x' => 300, 'y' => 0, 'w' => 200, 'h' => 100])['json']['success']) && empty($own->api('media_crop', ['name' => $tn, 'x' => 'a', 'y' => 0, 'w' => 10, 'h' => 10])['json']['success']) && empty($own->api('media_crop', ['name' => '../api.php', 'x' => 0, 'y' => 0, 'w' => 10, 'h' => 10])['json']['success']));
$rep = function ($client, $name, $file, $mime = 'image/jpeg') { return $client->req('POST', '/canvascore-admin/api.php?action=media_replace', ['name' => $name, 'file' => new CURLFile($file, $mime, 'new.jpg')], [], false); };
$r = $rep($own, $tn, $pngf2, 'image/jpeg');
check('replacing a .jpg with a PNG is refused (the address must keep working)', empty($r['json']['success']) && getimagesize($web . '/uploads/' . $tn)[2] === IMAGETYPE_JPEG, $r['body']);
$evil = $T . '/evil.jpg'; file_put_contents($evil, '<?php system($_GET["c"]); ?>');
$r = $rep($own, $tn, $evil);
check('a script sent as a replacement is refused', empty($r['json']['success']) && strpos((string)file_get_contents($web . '/uploads/' . $tn), '<?php') === false, $r['body']);
$r = $rep($own, '../canvascore-admin/api.php', $imgf);
check('…and a replacement cannot target a file outside uploads', empty($r['json']['success']));
$img2 = $T . '/tool2.jpg'; $g2 = imagecreatetruecolor(800, 600); imagejpeg($g2, $img2);
$r = $rep($own, $tn, $img2);
$info = getimagesize($web . '/uploads/' . $tn);
check('a real JPEG replaces the file under the same name', !empty($r['json']['success']) && $info[0] === 800, $r['body']);
$lib = array_values(array_filter($own->api('get_media')['json'] ?? [], function ($m) use ($tn) { return $m['name'] === $tn; }));
check('…the focal point is cleared (the subject moved) and the new size is recorded', array_key_exists('focal', $lib[0]) && $lib[0]['focal'] === null && ($lib[0]['w'] ?? 0) === 800);
foreach (['http://127.0.0.1/a.png', 'http://localhost/a.png', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/a.png', 'file:///etc/passwd', 'ftp://example.com/a.png', 'javascript:alert(1)', 'http://user:pw@8.8.8.8/a.png', 'http://[::1]/a.png'] as $u) {
    $r = $own->api('media_import_url', ['url' => $u]);
    check("an image is not fetched from $u", empty($r['json']['success']) && !glob($web . '/uploads/*_a.png'), $r['body']);
}
$r = $ed->api('media_import_url', ['url' => 'http://127.0.0.1:' . '80' . '/a.png']);
check('an editor gets the same checks', empty($r['json']['success']));
$r = $own->api('media_import_url', ['url' => str_repeat('a', 2100)]);
check('an address that is far too long is refused', empty($r['json']['success']));

echo "\nROLES AND REVIEW (over HTTP)\n";
$mkUser = function ($name, $role) use ($own) {
    $own->api('add_user', ['username' => $name, 'password' => 'Temp-pass-1', 'role' => $role]);
    $c = new Client(); $c->login($name, 'Temp-pass-1');
    $r = $c->api('change_own_password', ['current' => 'Temp-pass-1', 'password' => 'Real-pass-22']); if (!empty($r['json']['csrf'])) $c->csrf = $r['json']['csrf'];
    return $c;
};
$au1 = $mkUser('rolauth1', 'author'); $au2 = $mkUser('rolauth2', 'author'); $rv = $mkUser('rolrev', 'reviewer'); $ed2 = $mkUser('roledit', 'editor');
$lg = (new Client())->login('rolauth1', 'Real-pass-22');
check('the sign-in answer reports the role (author, not "editor")', ($lg['json']['role'] ?? '') === 'author', $lg['body']);
$users = $own->api('get_users')['json'] ?? [];
$roles = []; foreach ($users as $u) $roles[$u['username']] = $u['role'];
check('accounts can be added as author, reviewer or editor', ($roles['rolauth1'] ?? '') === 'author' && ($roles['rolrev'] ?? '') === 'reviewer' && ($roles['roledit'] ?? '') === 'editor');
$own->api('add_user', ['username' => 'rolweird', 'password' => 'Temp-pass-1', 'role' => 'superuser']);
$roles = []; foreach (($own->api('get_users')['json'] ?? []) as $u) $roles[$u['username']] = $u['role'] . '#' . $u['id'];
check('an unknown role becomes editor (never more than that)', strpos($roles['rolweird'] ?? '', 'editor#') === 0);
$uid = function ($n) use ($roles) { return (int)explode('#', $roles[$n] ?? '0#0')[1]; };
check('they report their role when signed in', ($au1->api('check_auth')['json']['role'] ?? '') === 'author' && ($rv->api('check_auth')['json']['role'] ?? '') === 'reviewer');
check('only an admin changes roles', empty($ed2->api('set_role', ['id' => $uid('rolauth2'), 'role' => 'admin'])['json']['success']) && empty($au1->api('set_role', ['id' => $uid('rolauth1'), 'role' => 'admin'])['json']['success']));
$r = $own->api('set_role', ['id' => $uid('rolweird'), 'role' => 'reviewer']);
check('an admin can change a role; a nonsense role is refused', !empty($r['json']['success']) && empty($own->api('set_role', ['id' => $uid('rolweird'), 'role' => 'god'])['json']['success']));
$myId = 0; foreach (($own->api('get_users')['json'] ?? []) as $u) if ($u['role'] === 'admin') $myId = (int)$u['id'];
check('the last admin cannot be demoted', empty($own->api('set_role', ['id' => $myId, 'role' => 'editor'])['json']['success']));

// pages: ownership and publishing
$page = function ($id, $title, $extra = []) { return array_merge(['id' => $id, 'title' => $title, 'slug' => $id, 'blocks' => [['id' => 'b1', 'type' => 'TEXT', 'content' => ['text' => '<p>' . $title . '</p>']]]], $extra); };
$own->api('save_page', $page('role-admin-page', 'Admin page', ['publish' => true]));
$r = $au1->api('save_page', $page('role-a1', 'Author one page'));
check('an author creates a page (a draft)', !empty($r['json']['success']), $r['body']);
$r = $au1->api('save_page', $page('role-a1', 'Author one page', ['publish' => true]));
check('…but cannot publish it: they are told to submit it for review', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'needs_review', $r['body']);
$r = $au1->api('save_page', $page('role-admin-page', 'Taken over'));
check('…nor save over a page that is not theirs', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'forbidden', $r['body']);
$titles = array_column($au1->api('get_pages')['json'] ?? [], 'title');
check('an author sees only their own pages', $titles === ['Author one page'], json_encode($titles));
$au2->api('save_page', $page('role-a2', 'Author two page'));
check('…another author does not see them', array_column($au2->api('get_pages')['json'] ?? [], 'title') === ['Author two page']);
check('an editor, a reviewer and an admin see every page', count($rv->api('get_pages')['json'] ?? []) >= 3 && count($ed2->api('get_pages')['json'] ?? []) >= 3);
check('an author cannot delete or discard what is not theirs', empty($au1->api('delete_page', ['id' => 'role-a2'])['json']['success']) && empty($au1->api('discard_draft', ['id' => 'role-a2'])['json']['success']));
foreach (['save_settings' => ['siteName' => 'x'], 'save_menu' => ['items' => []], 'save_template' => ['name' => 't', 'blocks' => []], 'save_master' => ['name' => 'm', 'blocks' => []], 'save_part' => ['name' => 'header', 'blocks' => []], 'delete_media' => ['name' => 'x.png'], 'media_folder_create' => ['path' => 'Nope'], 'bulk_items' => ['op' => 'delete', 'ids' => ['x']], 'set_schedule' => ['kind' => 'page', 'id' => 'role-a1']] as $act => $body) {
    foreach (['author' => $au1, 'reviewer' => $rv] as $who => $cl) {
        $r = $cl->api($act, $body);
        check("a $who cannot use $act", empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'forbidden', $r['body']);
    }
}
$r = $au1->req('POST', '/canvascore-admin/rebuild_all.php', '');
check('an author cannot publish the site', $r['code'] === 403, $r['code'] . ' ' . $r['body']);
$r = $au1->req('POST', '/canvascore-admin/api.php?action=upload_media', ['file' => new CURLFile($T . '/tool.jpg', 'image/jpeg', 'author.jpg')], [], false);
check('…but can upload images', !empty($r['json']['success']), $r['body']);

// the review flow
$r = $au1->api('review_submit', ['kind' => 'page', 'id' => 'role-a2']);
check('an author cannot submit someone else\'s page', empty($r['json']['success']));
$r = $au1->api('review_submit', ['kind' => 'page', 'id' => 'role-a1', 'note' => 'Please check the tone']);
check('an author submits their page for review, with a note', !empty($r['json']['success']) && ($r['json']['review']['review_state'] ?? '') === 'pending' && ($r['json']['review']['review_by'] ?? '') === 'rolauth1', $r['body']);
$r = $au1->api('save_page', $page('role-a1', 'Author one page v2'));
check('while it waits, the author cannot change it', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'in_review', $r['body']);
$q = $rv->api('review_queue')['json'] ?? [];
check('the reviewer finds it in the queue, with who sent it and the note', count($q['items'] ?? []) === 1 && $q['items'][0]['id'] === 'role-a1' && $q['items'][0]['by'] === 'rolauth1' && $q['items'][0]['note'] === 'Please check the tone' && $q['items'][0]['state'] === 'pending', json_encode($q));
check('the author\'s own list shows their submission; another author sees nothing', count($au1->api('review_queue')['json']['items'] ?? []) === 1 && count($au2->api('review_queue')['json']['items'] ?? []) === 0);
check('another author cannot withdraw it; the one who sent it can', empty($au2->api('review_withdraw', ['kind' => 'page', 'id' => 'role-a1'])['json']['success']));
$r = $rv->api('save_page', $page('role-admin-page', 'Admin page', ['publish' => true]));
check('a reviewer cannot publish a page that was not submitted', empty($r['json']['success']) && ($r['json']['code'] ?? '') === 'needs_review', $r['body']);
check('a reviewer cannot create a page', empty($rv->api('save_page', $page('role-r1', 'By reviewer'))['json']['success']));
check('sending back needs a note, and an author cannot send back', empty($rv->api('review_back', ['kind' => 'page', 'id' => 'role-a1'])['json']['success']) && empty($au1->api('review_back', ['kind' => 'page', 'id' => 'role-a1', 'note' => 'x'])['json']['success']));
$r = $rv->api('review_back', ['kind' => 'page', 'id' => 'role-a1', 'note' => 'Shorter intro please']);
check('the reviewer sends it back with a note', !empty($r['json']['success']) && ($r['json']['review']['review_state'] ?? '') === 'changes', $r['body']);
$mine = array_values(array_filter($au1->api('get_pages')['json'] ?? [], function ($p) { return $p['id'] === 'role-a1'; }));
check('the author sees the note on their page and can edit again', ($mine[0]['review_state'] ?? '') === 'changes' && ($mine[0]['review_note'] ?? '') === 'Shorter intro please' && !empty($au1->api('save_page', $page('role-a1', 'Author one page v2'))['json']['success']));
$r = $au1->api('review_submit', ['kind' => 'page', 'id' => 'role-a1']);
check('…and submits it again', !empty($r['json']['success']));
$r = $rv->api('save_page', $page('role-a1', 'Author one page v2', ['publish' => true]));
check('the reviewer approves it by publishing it', !empty($r['json']['success']), $r['body']);
$mine = array_values(array_filter($au1->api('get_pages')['json'] ?? [], function ($p) { return $p['id'] === 'role-a1'; }));
check('it is published, the review is over and the approver is recorded', ($mine[0]['status'] ?? '') === 'published' && ($mine[0]['review_state'] ?? 'x') === '' && ($mine[0]['reviewed_by'] ?? '') === 'rolrev', json_encode($mine[0] ?? null));
check('the queue is empty again', count($rv->api('review_queue')['json']['items'] ?? []) === 0);
$r = $au1->api('save_page', $page('role-a1', 'Author one page v3'));
$copy = $r['json']['new_id'] ?? '';
check('an author can keep working on their published page: the changes are a draft copy', !empty($r['json']['success']) && $copy !== '' && $copy !== 'role-a1', $r['body']);
$r = $au1->api('review_submit', ['kind' => 'page', 'id' => $copy, 'note' => 'v3']);
check('…which they submit like any draft', !empty($r['json']['success']), $r['body']);
check('…and then cannot edit the page either until it is withdrawn', ($au1->api('save_page', $page($copy, 'again', ['slug' => 'role-a1']))['json']['code'] ?? '') === 'in_review');
check('the person who sent it can withdraw it', !empty($au1->api('review_withdraw', ['kind' => 'page', 'id' => $copy])['json']['success']) && !empty($au1->api('save_page', $page($copy, 'again', ['slug' => 'role-a1']))['json']['success']));
$rd1 = $au2->api('delete_page', ['id' => 'role-a2']); $rd2 = $au1->api('delete_page', ['id' => 'role-a1']);
check('an author deletes their own never-published page, not a published one', !empty($rd1['json']['success']) && empty($rd2['json']['success']), $rd1['body'] . ' | ' . $rd2['body']);
check('a reviewer deletes nothing', empty($rv->api('delete_page', ['id' => 'role-a1'])['json']['success']));
$r = $ed2->api('save_page', $page('role-ed', 'Editor page', ['publish' => true]));
check('an editor still publishes directly', !empty($r['json']['success']), $r['body']);

// collections: items, review and per-collection access
$col = $own->api('save_collection', ['name' => 'Roles blog'])['json'] ?? [];
$cid = $col['id'] ?? '';
$item = function ($id, $title, $status = 'draft', $extra = []) use ($cid) { return array_merge(['id' => $id, 'collection_id' => $cid, 'title' => $title, 'slug' => $id, 'status' => $status, 'blocks' => [['id' => 'i1', 'type' => 'TEXT', 'content' => ['text' => '<p>x</p>']]]], $extra); };
check('(setup) a collection exists', $cid !== '');
$r = $au1->api('save_item', $item('role-i1', 'Author item'));
check('an author creates an item (a draft)', !empty($r['json']['success']), $r['body']);
check('…cannot publish it, nor create it as published', ($au1->api('save_item', $item('role-i1', 'Author item', 'published'))['json']['code'] ?? '') === 'needs_review' && ($au1->api('save_item', $item('role-i2', 'Another', 'published'))['json']['code'] ?? '') === 'needs_review');
check('an author sees their own items only', count($au1->api('get_items&collection=' . $cid)['json'] ?? []) === 1 && count($au2->api('get_items&collection=' . $cid)['json'] ?? []) === 0 && count($rv->api('get_items&collection=' . $cid)['json'] ?? []) === 1);
check('…and cannot open or change another author\'s item', $au2->api('get_item&id=role-i1')['json'] === null && ($au2->api('save_item', $item('role-i1', 'Hijack'))['json']['code'] ?? '') === 'forbidden');
check('a reviewer cannot create an item', ($rv->api('save_item', $item('role-i3', 'By reviewer'))['json']['code'] ?? '') === 'forbidden');
check('an author submits their item; it is then locked for them', !empty($au1->api('review_submit', ['kind' => 'item', 'id' => 'role-i1', 'note' => 'ok?'])['json']['success']) && ($au1->api('save_item', $item('role-i1', 'Author item v2'))['json']['code'] ?? '') === 'in_review');
$qi = array_values(array_filter($rv->api('review_queue')['json']['items'] ?? [], function ($x) { return $x['kind'] === 'item'; }));
check('the reviewer sees it in the queue with its collection', count($qi) === 1 && $qi[0]['collection'] === 'Roles blog' && $qi[0]['note'] === 'ok?');
$r = $rv->api('save_item', $item('role-i1', 'Author item', 'published'));
check('the reviewer approves it by publishing it; the review is over', !empty($r['json']['success']) && count($rv->api('review_queue')['json']['items'] ?? []) === 0, $r['body']);
check('the author cannot change it once it is published (an editor does)', ($au1->api('save_item', $item('role-i1', 'Author item', 'published', ['title' => 'Edited']))['json']['code'] ?? '') === 'published_locked');
check('an author deletes their own draft items, not published ones; a reviewer deletes none', !empty($au1->api('save_item', $item('role-i4', 'Throwaway'))['json']['success']) && !empty($au1->api('delete_item', ['id' => 'role-i4'])['json']['success']) && empty($au1->api('delete_item', ['id' => 'role-i1'])['json']['success']) && empty($rv->api('delete_item', ['id' => 'role-i1'])['json']['success']));

$r = $own->api('save_collection', ['id' => $cid, 'name' => 'Roles blog', 'access' => ['mode' => 'selected', 'users' => ['rolauth1', 'rolrev', 'bad name!']]]);
check('an admin limits a collection to selected people', !empty($r['success'] ?? $r['json']['success'] ?? null) || !empty($r['json']['success']), $r['body']);
$names = function ($cl) { return array_column($cl->api('get_collections')['json'] ?? [], 'name'); };
check('those people see it; the others (even an editor) do not, and cannot work in it', in_array('Roles blog', $names($au1), true) && in_array('Roles blog', $names($rv), true) && !in_array('Roles blog', $names($au2), true) && !in_array('Roles blog', $names($ed2), true) && in_array('Roles blog', $names($own), true));
check('…no items, no saves, no taxonomies for them', ($ed2->api('get_items&collection=' . $cid)['json'] ?? 'x') === [] && ($ed2->api('save_item', $item('role-i5', 'Sneaky'))['json']['code'] ?? '') === 'forbidden' && ($au2->api('save_item', $item('role-i6', 'Sneaky'))['json']['code'] ?? '') === 'forbidden' && $ed2->api('get_item&id=role-i1')['json'] === null);
$acc = array_values(array_filter($own->api('get_collections')['json'] ?? [], function ($c) { return $c['name'] === 'Roles blog'; }))[0]['access'] ?? null;
check('the admin sees the access list, cleaned (a bad name is dropped); others are not told', ($acc['mode'] ?? '') === 'selected' && ($acc['users'] ?? []) === ['rolauth1', 'rolrev'] && array_key_exists('access', $au1->api('get_collections')['json'][0]) && $au1->api('get_collections')['json'][0]['access'] === null);
check('a member of the collection still works in it (an author, as before)', !empty($au1->api('save_item', $item('role-i7', 'Member draft'))['json']['success']));
check('an editor cannot change who has access', empty($ed2->api('save_collection', ['id' => $cid, 'name' => 'Roles blog', 'access' => ['mode' => 'all']])['json']['success']));
$own->api('save_collection', ['id' => $cid, 'name' => 'Roles blog', 'access' => ['mode' => 'all']]);
check('"everyone" opens it again', in_array('Roles blog', $names($ed2), true));
check('a role never gives access to the admin-only areas', empty($au1->api('get_users')['json']['success'] ?? null) && strpos((string)($au1->api('get_users')['json']['message'] ?? ''), 'Only admins') !== false && empty($rv->api('backup_info')['json']['success']) && empty($au1->api('pkg_info')['json']['success']) && empty($au1->api('wp_info')['json']['success']));

echo "\nTEMPLATE LIBRARY (over HTTP)\n";
$lkp = sodium_crypto_sign_keypair(); $lsk = sodium_crypto_sign_secretkey($lkp);
file_put_contents($admin . '/update-keys.php', "<?php\nreturn ['" . base64_encode(sodium_crypto_sign_publickey($lkp)) . "'];\n");
file_put_contents($admin . '/library-source.php', "<?php\nreturn ['index' => 'http://127.0.0.1:$port/libfeed/index.json', 'sig' => 'http://127.0.0.1:$port/libfeed/index.json.sig', 'hosts' => ['127.0.0.1'], 'https' => false];\n");
@mkdir($web . '/libfeed');
$exDir = realpath(__DIR__ . '/../../docs/examples/library-kits');
$kitZip = function ($example, $id, $edit = null) use ($exDir, $web) {
    $files = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$exDir/$example", FilesystemIterator::SKIP_DOTS)) as $f) $files[str_replace('\\', '/', substr($f->getPathname(), strlen("$exDir/$example") + 1))] = file_get_contents($f->getPathname());
    $m = json_decode($files['kit.json'], true); $m['id'] = $id; unset($m['minVersion']); $files['kit.json'] = json_encode($m);
    if ($edit) $files = $edit($files);
    $zf = "$web/libfeed/$id.zip"; @unlink($zf); $z = new ZipArchive(); $z->open($zf, ZipArchive::CREATE);
    foreach ($files as $n => $c) $z->addFromString($n, $c);
    $z->close();
    return $zf;
};
$publish = function (array $kits, $tamperSha = []) use ($web, $port, $lsk, $exDir) {
    $entries = [];
    foreach ($kits as $id => [$zf, $type, $name]) {
        $e = ['id' => $id, 'name' => $name, 'type' => $type, 'version' => '1.0.0', 'author' => 'Test', 'description' => "The $name kit", 'tags' => ['t'], 'pages' => 1, 'size' => filesize($zf),
              'sha256' => $tamperSha[$id] ?? hash_file('sha256', $zf), 'url' => "http://127.0.0.1:$port/libfeed/$id.zip", 'preview' => "http://127.0.0.1:$port/libfeed/preview.png"];
        $entries[] = $e;
    }
    copy("$exDir/coming-soon-page/preview.png", "$web/libfeed/preview.png");
    $bytes = json_encode(['version' => 1, 'kits' => $entries]);
    file_put_contents("$web/libfeed/index.json", $bytes);
    file_put_contents("$web/libfeed/index.json.sig", base64_encode(sodium_crypto_sign_detached("canvascore-library-v1\n" . hash('sha256', $bytes), $lsk)));
    return $bytes;
};
$kPage = $kitZip('coming-soon-page', 'lib-page'); $kSite = $kitZip('bistro-site', 'lib-site'); $kSec = $kitZip('landing-sections', 'lib-sections');
$kEvil = $kitZip('coming-soon-page', 'lib-evil', function ($f) {
    $c = json_decode($f['content.json'], true);
    $c['blocks'][] = ['type' => 'HTML', 'content' => ['code' => '<script>steal()</script>', 'customCss' => 'body{display:none}']];
    $c['blocks'][] = ['type' => 'FORM', 'content' => ['email' => 'attacker@evil.com']];
    $c['blocks'][] = ['type' => 'TEXT', 'content' => ['text' => '<p onclick="x()">Hello<script>bad()</script></p>']];
    $f['content.json'] = json_encode($c); return $f;
});
$bytes = $publish(['lib-page' => [$kPage, 'page', 'Coming Soon'], 'lib-site' => [$kSite, 'site', 'Bistro'], 'lib-sections' => [$kSec, 'section', 'Landing sections'], 'lib-evil' => [$kEvil, 'page', 'Evil']]);

check('nobody signed out can use the library', (new Client())->api('library_index')['code'] === 401);
check('an editor cannot browse, install or undo', strpos((string)($ed->api('library_index')['json']['message'] ?? ''), 'Only admins') !== false && strpos((string)($ed->api('library_install', ['id' => 'lib-page'])['json']['message'] ?? ''), 'Only admins') !== false && strpos((string)($ed->api('library_undo', ['install_id' => 'x'])['json']['message'] ?? ''), 'Only admins') !== false);
$r = $own->api('library_index&refresh=1');
$ids = array_column($r['json']['kits'] ?? [], 'id');
check('an admin sees the kits of the signed index, without their download addresses or checksums', !empty($r['json']['success']) && count($ids) === 4 && in_array('lib-site', $ids, true) && strpos($r['body'], '/libfeed/') === false && strpos($r['body'], 'sha256') === false && ($r['json']['kits'][0]['preview'] ?? null) === true, $r['body']);
$pv = $own->req('GET', '/canvascore-admin/api.php?action=library_preview&id=lib-page', null, [], false);
check('a kit\'s preview is served from the site itself, as an image, with no sniffing', $pv['code'] === 200 && stripos($pv['head'], 'content-type: image/png') !== false && stripos($pv['head'], 'x-content-type-options: nosniff') !== false && substr($pv['body'], 1, 3) === 'PNG');
check('…and an unknown kit has none', $own->req('GET', '/canvascore-admin/api.php?action=library_preview&id=nope', null, [], false)['code'] === 404 && $ed->req('GET', '/canvascore-admin/api.php?action=library_preview&id=lib-page', null, [], false)['json']['success'] === false);
$before = (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn();
$r = $own->api('library_install', ['id' => 'lib-page']);
$np = db()->query("SELECT * FROM pages ORDER BY rowid DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('installing a page kit adds a draft page made by the admin, and says what it did', !empty($r['json']['success']) && (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn() === $before + 1 && $np['status'] === 'draft' && $np['title'] === 'Coming Soon' && $np['created_by'] !== '' && count($r['json']['result']['pages'] ?? []) === 1, $r['body']);
check('…its image is in the Media library (folder Library/…)', count(glob($web . '/uploads/*lib-page-logo.svg')) === 1);
check('a kit that is not in the library cannot be installed', empty($own->api('library_install', ['id' => 'nope'])['json']['success']) && empty($own->api('library_install', ['id' => '../../x'])['json']['success']));
$r = $own->api('library_install', ['id' => 'lib-sections']);
check('a section kit adds its sections to My templates', !empty($r['json']['success']) && ($r['json']['result']['templates'] ?? 0) === 3 && count(array_filter($own->api('get_templates')['json'] ?? [], function ($t) { return strpos($t['name'], 'Landing sections: ') === 0; })) === 3, $r['body']);
$brandBefore = $own->api('get_settings')['json']['brandColor'] ?? '';
$r = $own->api('library_install', ['id' => 'lib-site', 'options' => ['design' => true]]);
$iid = $r['json']['result']['install_id'] ?? '';
check('a site kit adds its pages as drafts and, when asked, its header, footer, menu and colours', !empty($r['json']['success']) && count($r['json']['result']['pages'] ?? []) === 3 && !empty($r['json']['result']['design']) && ($own->api('get_settings')['json']['brandColor'] ?? '') === '#b45309' && (($own->api('get_menu')['json']['items'] ?? [])[1]['label'] ?? '') === 'About' && strpos(json_encode($own->api('get_parts')['json'] ?? []), 'Bistro') !== false, $r['body']);
$inst = $own->api('library_index')['json']['installed'] ?? [];
check('the install is listed, and installed kits are marked in the library', ($inst[0]['id'] ?? '') === 'lib-site' && !empty($inst[0]['design']) && count($inst) === 3 && count(array_filter($own->api('library_index')['json']['kits'], function ($k) { return $k['id'] === 'lib-site' && $k['installed'] === '1.0.0'; })) === 1);
$r = $own->api('library_undo', ['install_id' => $iid]);
check('undo puts back the colours, the menu, the header and the footer from before', !empty($r['json']['success']) && ($own->api('get_settings')['json']['brandColor'] ?? '') === $brandBefore && (($own->api('get_menu')['json']['items'] ?? [])[1]['label'] ?? '') !== 'About' && strpos(json_encode($own->api('get_parts')['json'] ?? []), 'Bistro') === false, $r['body']);
check('…once only', empty($own->api('library_undo', ['install_id' => $iid])['json']['success']));
$r = $own->api('library_install', ['id' => 'lib-evil']);
$all = json_encode($own->api('get_pages')['json'] ?? []);
check('a kit with code in it installs WITHOUT the code: no script, no handler, no form email, no custom CSS', !empty($r['json']['success']) && ($r['json']['result']['dropped_code'] ?? 0) === 1 && strpos($all, 'steal()') === false && strpos($all, 'bad()') === false && strpos($all, 'onclick') === false && strpos($all, 'attacker@evil.com') === false && strpos($all, 'display:none') === false, $r['body']);
$pagesNow = (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn();
$bytes = $publish(['lib-page' => [$kPage, 'page', 'Coming Soon']], ['lib-page' => str_repeat('0', 64)]);
$own->api('library_index&refresh=1');
$r = $own->api('library_install', ['id' => 'lib-page']);
check('a kit whose download differs from the index checksum is refused, and nothing is added', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), 'checksum') !== false && (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn() === $pagesNow, $r['body']);
$bytes = $publish(['lib-page' => [$kPage, 'page', 'Coming Soon']]);
file_put_contents($web . '/libfeed/index.json', $bytes . ' ');
$r = $own->api('library_index&refresh=1');
check('an index changed after it was signed is refused; the last good list stays', strpos((string)($r['json']['error'] ?? '') . (string)($r['json']['warning'] ?? ''), 'not signed') !== false, $r['body']);
file_put_contents($web . '/libfeed/index.json', $bytes);
$ru = function ($client, $zf, $opts = []) { return $client->req('POST', '/canvascore-admin/api.php?action=library_install_file', ['kit' => new CURLFile($zf, 'application/zip', 'kit.zip'), 'options' => json_encode($opts)], [], false); };
check('only an admin can install a kit from a file', strpos((string)($ru($ed, $kPage)['json']['message'] ?? ''), 'Only admins') !== false && $ru(new Client(), $kPage)['code'] === 401);
$trav = $web . '/libfeed/trav.zip'; $z = new ZipArchive(); $z->open($trav, ZipArchive::CREATE); $z->addFromString('kit.json', json_encode(['id' => 'trav', 'name' => 'T', 'version' => '1.0.0', 'type' => 'page'])); $z->addFromString('content.json', json_encode(['blocks' => [['type' => 'TEXT', 'content' => ['text' => 'x']]]])); $z->addFromString('../../evil.php', '<?php echo 1;'); $z->close();
$r = $ru($own, $trav);
check('a kit file with a path outside the kit, or a script in it, is refused with the reasons, and nothing is installed or written', empty($r['json']['success']) && !empty($r['json']['errors']) && !is_file($web . '/../evil.php') && !is_file($web . '/evil.php'), $r['body']);
$countBefore = (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn();
$r = $ru($own, $kPage);
check('a good kit file installs like one from the library', !empty($r['json']['success']) && (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn() === $countBefore + 1, $r['body']);
check('the library code answers 404 when opened directly', $own->req('GET', '/canvascore-admin/library.php', null, [], false)['code'] === 404);

echo "\nONE-CLICK UPDATES\n";
// A release feed served by the test server; the temporary install trusts a test key (its own update-keys.php)
$kp = sodium_crypto_sign_keypair(); $tsk = sodium_crypto_sign_secretkey($kp);
file_put_contents($admin . '/update-keys.php', "<?php\nreturn ['" . base64_encode(sodium_crypto_sign_publickey($kp)) . "'];\n");
file_put_contents($admin . '/update-source.php', "<?php\nreturn ['latest' => 'http://127.0.0.1:$port/feed/latest.json', 'hosts' => ['127.0.0.1'], 'https' => false];\n");
@mkdir($web . '/feed');
$cur = json_decode(file_get_contents($admin . '/version.json'), true)['app'];
// writes release $ver: the package (the repository's admin files, $edit changing some), its signature (test key unless $key) and the feed
$release = function ($ver, array $edit = [], $key = null, array $extra = []) use ($src, $web, $port, $tsk) {
    $zf = "$web/feed/canvascore-$ver.zip"; @unlink($zf);
    $z = new ZipArchive(); $z->open($zf, ZipArchive::CREATE);
    foreach (scandir($src) as $f) {
        if (!is_file("$src/$f") || $f[0] === '.') continue;
        $c = file_get_contents("$src/$f");
        if ($f === 'version.json') { $v = json_decode($c, true); $v['app'] = $edit['version'] ?? $ver; $c = json_encode($v); }
        if (isset($edit[$f])) $c = $edit[$f]($c);
        $z->addFromString("canvascore-admin/$f", $c);
    }
    $z->addFromString('canvascore-admin/index.html', "<!doctype html><title>editor $ver</title>");
    foreach (glob($src . '/blocks/*.json') as $f) $z->addFromString('canvascore-admin/blocks/' . basename($f), file_get_contents($f));
    foreach ($extra as $n => $c) $z->addFromString($n, $c);
    $z->close();
    file_put_contents("$zf.sig", base64_encode(sodium_crypto_sign_detached("canvascore-update-v1\n" . hash_file('sha256', $zf, true), $key ?: $tsk)));
    $u = "http://127.0.0.1:$port/feed/canvascore-$ver.zip";
    file_put_contents("$web/feed/latest.json", json_encode(['tag_name' => "v$ver", 'name' => "CanvasCore $ver", 'body' => "Notes for $ver", 'published_at' => '2026-10-24T10:00:00Z',
        'html_url' => "https://github.com/sputlab/CanvasCore/releases/tag/v$ver", 'assets' => [
        ['name' => "canvascore-$ver.zip", 'size' => filesize($zf), 'browser_download_url' => $u], ['name' => "canvascore-$ver.zip.sig", 'size' => 90, 'browser_download_url' => "$u.sig"]]]));
};
$leftovers = function () use ($web) { return glob($web . '/.cc-update-*', GLOB_ONLYDIR) ?: []; };
$apiHash = hash_file('sha256', $admin . '/api.php');
$unchanged = function () use ($own, $cur, $admin, $apiHash, $leftovers) {
    return ($own->api('version')['json']['app'] ?? '') === $cur && hash_file('sha256', $admin . '/api.php') === $apiHash && !$leftovers();
};
$pagesBefore = (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn();

$r = $vis->api('update_check');
check('editors can\'t check for updates', empty($r['json']['success']) && strpos((string)($r['json']['message'] ?? ''), 'Only admins') !== false, $r['body']);
check('…nor install one', empty($vis->api('update_install', ['version' => '9.9.9'])['json']['success']));
$r = (new Client())->req('GET', '/canvascore-admin/api.php?action=update_health', null, ['X-CC-Update-Token: guess']);
check('the new version\'s health check answers nothing without its one-time token', $r['code'] === 404 && empty($r['json']['success']));
$r = $own->api('update_info');
check('the admin sees the installed version and the server requirements (all met here)', ($r['json']['current'] ?? '') === $cur && count($r['json']['requirements'] ?? []) >= 5 && !array_filter($r['json']['requirements'], function ($q) { return !$q['ok']; }), $r['body']);

$release('9.9.9');
$r = $own->api('update_check');
$rel = $r['json']['release'] ?? [];
check('checking finds the newer release, with its notes and size', !empty($r['json']['success']) && $rel['latest'] === '9.9.9' && $rel['available'] === true && $rel['package'] === true && $rel['notes'] === 'Notes for 9.9.9' && $rel['size'] > 0, $r['body']);
check('…without handing the download addresses to the browser', strpos($r['body'], 'feed/canvascore') === false);
$r = $own->api('update_install', ['version' => '9.9.8']);
check('installing a version other than the latest one is refused', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'latest release is now 9.9.9') !== false && $unchanged(), $r['body']);

$release('9.9.9', [], sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair()));
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a package signed with an untrusted key is refused, nothing changes', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'signature is not valid') !== false && $unchanged(), $r['body']);
$release('9.9.9');
file_put_contents("$web/feed/canvascore-9.9.9.zip", 'tampered', FILE_APPEND);
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a package changed after signing is refused', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'signature is not valid') !== false && $unchanged(), $r['body']);
$release('9.9.9', [], null, ['canvascore-admin/../evil.php' => '<?php echo "pwned";']);
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a signed package with a file outside the admin folder is refused, and nothing is written there', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'outside the admin folder') !== false && !is_file($web . '/evil.php') && $unchanged(), $r['body']);
$release('9.9.9', ['version' => '9.9.7']);
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a package whose version.json is not the release\'s version is refused', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'not version 9.9.9') !== false && $unchanged(), $r['body']);
$release('9.9.9', ['compiler.php' => function ($c) { return preg_replace('/^<\?php\n/', "<?php\nfunction broken( {\n", $c, 1); }]);
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a new version with a PHP file that can\'t be parsed is stopped before the swap', empty($r['json']['success']) && strpos((string)$r['json']['message'], 'compiler.php') !== false && empty($r['json']['rolled_back']) && $unchanged(), $r['body']);

// the new version installs but does not start: everything is put back
$release('9.9.9', ['api.php' => function ($c) { return preg_replace('/^<\?php\n/', "<?php\nif ((\$_GET['action'] ?? '') === 'update_health') { http_response_code(500); exit; }\n", $c, 1); }]);
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a new version that fails its first check is rolled back', empty($r['json']['success']) && !empty($r['json']['rolled_back']) && strpos((string)$r['json']['message'], 'rolled back') !== false, $r['body']);
check('…the previous version is back in place, with no leftover folders in the site', $unchanged(), json_encode($leftovers()));
check('…the site and its content still work', (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn() === $pagesBefore && !empty($own->api('get_pages')['json']) && is_file($admin . '/update-source.php'));
check('…and a backup was taken first (a safety copy of the content, copies of the database and of the code)', count(glob($data . '/updates/db-*.sqlite') ?: []) >= 1 && count(glob($data . '/updates/code-' . $cur . '-*.zip') ?: []) >= 1
    && array_filter($own->api('backup_info')['json']['backups'] ?? [], function ($b) { return $b['kind'] === 'safety'; }));
$h = $own->api('update_info')['json']['history'] ?? [];
check('…and the history records the rollback', ($h[0]['result'] ?? '') === 'rolled_back' && ($h[0]['to'] ?? '') === '9.9.9');

$release('0.0.1');
$r = $own->api('update_check');
check('an older release is not offered (no downgrade)', ($r['json']['release']['available'] ?? null) === false);
check('…nor installed', empty($own->api('update_install', ['version' => '0.0.1'])['json']['success']) && $unchanged());

$release('9.9.9');
$r = $own->api('update_install', ['version' => '9.9.9']);
check('a signed release installs: downloaded, verified, backed up, swapped and checked', !empty($r['json']['success']) && ($r['json']['to'] ?? '') === '9.9.9' && count($r['json']['steps'] ?? []) >= 7, $r['body']);
check('…the server now runs the new version, and the session goes on', ($own->api('version')['json']['app'] ?? '') === '9.9.9' && strpos((string)file_get_contents($admin . '/index.html'), 'editor 9.9.9') !== false);
check('…the content is untouched and the old folder is gone from the site', (int)db()->query("SELECT COUNT(*) FROM pages")->fetchColumn() === $pagesBefore && !$leftovers());
check('…the site\'s own files in the admin folder are kept (update-source.php and library-source.php)', is_file($admin . '/update-source.php') && is_file($admin . '/library-source.php') && strpos((string)file_get_contents($admin . '/.htaccess'), 'CanvasCore') !== false);
check('…the history records it', ($own->api('update_info')['json']['history'][0]['result'] ?? '') === 'updated');
check('…and checking again finds nothing newer', ($own->api('update_check')['json']['release']['available'] ?? null) === false);

echo "\n" . ($fails ? "$fails checks failed" : 'SECURITY OK') . " ($total checks)\n";
exit($fails ? 1 : 0);
