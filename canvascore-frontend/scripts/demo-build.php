<?php
// scripts/demo-build.php — builds the demo site ("Lumen Studio", English and Italian) on a scratch copy and saves it as a baseline backup.
//   php scripts/demo-build.php --site=<new folder> [--baseline=<file.zip>] [--port=8190] [--keep]
// It installs a copy of canvascore-admin/ in <folder>/web, starts PHP's built-in server, fills the site through the real API (pages from the
// starters, a blog, a menu, a header with the language switcher, a popup, two languages, pictures made here), publishes it, and makes the backup.
// The backup is what a demo site restores every few minutes (demo/README.md). The screenshots of the README are taken from the same site.
if (PHP_SAPI !== 'cli') exit(1);
$opt = getopt('', ['site:', 'baseline:', 'port:', 'keep']);
$root = realpath(__DIR__ . '/../..');
$site = $opt['site'] ?? '';
if ($site === '') { fwrite(STDERR, "Usage: php scripts/demo-build.php --site=<new folder> [--baseline=<file.zip>] [--port=8190] [--keep]\n"); exit(1); }
if (file_exists($site) && count(array_diff(scandir($site), ['.', '..']))) { fwrite(STDERR, "$site is not empty.\n"); exit(1); }
@mkdir("$site/web", 0755, true);
$site = realpath($site); $web = "$site/web"; $port = (int)($opt['port'] ?? 8190); $BASE = "http://127.0.0.1:$port";
function rcopy($a, $b) { @mkdir($b, 0755, true); foreach (array_diff(scandir($a), ['.', '..']) as $f) { is_dir("$a/$f") ? rcopy("$a/$f", "$b/$f") : copy("$a/$f", "$b/$f"); } }
rcopy("$root/canvascore-admin", "$web/canvascore-admin");
foreach (glob("$web/canvascore-admin/data/*") ?: [] as $f) is_dir($f) ? null : @unlink($f);
$pass = 'demo-build-' . bin2hex(random_bytes(6));
putenv('CC_ADMIN_PASS=' . $pass);
exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg("$web/canvascore-admin/install-cli.php") . ' --site-name="Lumen Studio" --admin-user=builder --site-url=' . escapeshellarg($BASE) . ' --json 2>&1', $o, $rc);
if ($rc !== 0) { fwrite(STDERR, "Install failed: " . implode("\n", $o) . "\n"); exit(1); }
$srv = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $web], [0 => ['pipe', 'r'], 1 => ['file', "$site/server.log", 'a'], 2 => ['file', "$site/server.log", 'a']], $pipes, $site, ['PHP_CLI_SERVER_WORKERS' => '4'] + getenv());
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);
$stopped = false;
$stop = function () use ($srv, $web, &$stopped) { if ($stopped) return; $stopped = true; proc_terminate($srv); proc_close($srv); @exec('pkill -f -- ' . escapeshellarg('-t ' . $web) . ' 2>/dev/null'); };
register_shutdown_function($stop);

class Client {
    public $jar; public $csrf = '';
    function __construct() { $this->jar = tempnam(sys_get_temp_dir(), 'ccjar'); }
    function req($method, $path, $body = null, $json = true) {
        global $BASE;
        $ch = curl_init($BASE . $path); $h = $this->csrf !== '' ? ['X-CSRF-Token: ' . $this->csrf] : [];
        if (is_array($body) && $json) { $body = json_encode($body); $h[] = 'Content-Type: application/json'; }
        curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 120, CURLOPT_HTTPHEADER => array_merge($h, ['Origin: ' . $BASE])]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $text = (string)curl_exec($ch);
        return ['body' => $text, 'json' => json_decode($text, true)];
    }
    function api($a, $b = null) { return $this->req($b === null ? 'GET' : 'POST', '/canvascore-admin/api.php?action=' . $a, $b); }
}
$c = new Client();
$r = $c->api('login', ['username' => 'builder', 'password' => $pass]); $c->csrf = $r['json']['csrf'] ?? '';
if (empty($r['json']['success'])) { fwrite(STDERR, "Sign-in failed: {$r['body']}\n"); exit(1); }
$must = function ($r, $what) { if (empty($r['json']['success'])) { fwrite(STDERR, "Could not $what: " . substr($r['body'], 0, 300) . "\n"); exit(1); } return $r['json']; };

// ---- pictures (made here: no files to license)
@mkdir("$site/img");
$pictures = [['sunrise', [255, 140, 90], [99, 102, 241]], ['studio', [16, 185, 129], [30, 64, 175]], ['paper', [244, 114, 182], [251, 191, 36]]];
$urls = [];
foreach ($pictures as [$name, $a, $b]) {
    $im = imagecreatetruecolor(1200, 630);
    for ($y = 0; $y < 630; $y++) { $t = $y / 630; imagefilledrectangle($im, 0, $y, 1199, $y, imagecolorallocate($im, (int)($a[0] + ($b[0] - $a[0]) * $t), (int)($a[1] + ($b[1] - $a[1]) * $t), (int)($a[2] + ($b[2] - $a[2]) * $t))); }
    for ($k = 0; $k < 5; $k++) { $col = imagecolorallocatealpha($im, 255, 255, 255, 105 + $k * 4); imagefilledellipse($im, 200 + $k * 220, 120 + (($k * 97) % 330), 200 + $k * 40, 200 + $k * 40, $col); }
    imagejpeg($im, "$site/img/$name.jpg", 88);
    $up = $c->req('POST', '/canvascore-admin/api.php?action=upload_media', ['file' => new CURLFile("$site/img/$name.jpg", 'image/jpeg', "lumen-$name.jpg")], false);
    $urls[$name] = $must($up, "upload $name")['url'];
}

// ---- site settings, languages, header, footer
$must($c->api('save_languages', ['enabled' => true, 'default' => 'en', 'list' => [['code' => 'en', 'name' => 'English'], ['code' => 'it', 'name' => 'Italiano']], 'strings' => ['it' => ['cookie' => ['text' => 'Usiamo alcuni cookie per far funzionare questa demo.', 'acceptLabel' => 'Accetta', 'declineLabel' => 'Rifiuta']]]]), 'save the languages');
$st = $c->api('get_settings')['json'] ?? [];
$must($c->api('save_settings', array_merge($st, ['siteName' => 'Lumen Studio', 'siteSuffix' => ' | Lumen Studio', 'siteUrl' => $BASE, 'brandColor' => '#4f46e5', 'adminEmail' => '', 'cookieBanner' => ['enabled' => true, 'text' => 'We use a few cookies to make this demo work.', 'acceptLabel' => 'Accept', 'declineLabel' => 'Decline', 'position' => 'bottom'], 'headerEnabled' => true, 'footerEnabled' => true])), 'save the settings');
$defs = json_decode(file_get_contents("$root/canvascore-admin/blocks.json"), true)['types'];
$mk = function ($type, array $content = [], ?array $children = null) use ($defs) {
    static $n = 0; $b = ['id' => 'demo-b' . (++$n), 'type' => $type, 'styles' => $defs[$type]['styles'] ?? [], 'content' => array_merge($defs[$type]['content'] ?? [], $content)];
    if ($children !== null) $b['children'] = $children; return $b;
};
$sw = $mk('LANGUAGE_SWITCHER', ['style' => 'list', 'labels' => 'name']); $sw['styles'] = array_merge($sw['styles'], ['padding' => '10px 28px 0', 'textAlign' => 'right', 'justifyContent' => 'flex-end']);
$must($c->api('save_part', ['name' => 'header', 'blocks' => [$sw]]), 'save the header');
$must($c->api('save_part', ['name' => 'footer', 'blocks' => [$mk('TEXT', ['text' => '<p style="text-align:center;color:#64748b">© Lumen Studio · a demo site made with CanvasCore</p>'])]]), 'save the footer');

// ---- pages from the starters
$starters = []; foreach (json_decode(file_get_contents("$root/canvascore-admin/starters.json"), true) as $s) $starters[$s['id']] = $s['blocks'];
$pages = [['home', 'Home', 'home', 'agency', true], ['services', 'Services', 'services', 'services', false], ['pricing', 'Pricing', 'pricing', 'pricing', false], ['faq', 'FAQ', 'faq', 'faq', false], ['about', 'About us', 'about', 'about', false], ['contact', 'Contact', 'contact', 'contact', false]];
$ids = [];
foreach ($pages as [$key, $title, $slug, $starter, $home]) {
    $ids[$key] = 'demo-page-' . $key;
    $must($c->api('save_page', ['id' => $ids[$key], 'title' => $title, 'slug' => $slug, 'blocks' => $starters[$starter], 'publish' => true, 'is_home' => $home, 'lang' => 'en', 'seo_description' => $title . ' — Lumen Studio, a demo site made with CanvasCore.']), "save the page $title");
}
// ---- Italian: the home, about and contact pages, each linked to its English page
$it = [
    'home' => ['Benvenuti', 'home', [$mk('HERO', ['title' => '<h1>Progettiamo marchi e siti che crescono</h1>', 'subtitle' => '<p>Un piccolo studio per aziende ambiziose: strategia, design e sviluppo sotto lo stesso tetto.</p>', 'buttons' => [['text' => 'Chi siamo', 'url' => 'it/chi-siamo/index.html', 'bgColor' => '#4f46e5', 'textColor' => '#ffffff', 'borderRadius' => '8px']]]), $mk('SECTION', [], [$mk('TEXT', ['text' => '<h2 style="text-align:center">Cosa facciamo</h2><p style="text-align:center"><strong>Identità</strong> · logo, colori e voce del marchio<br><strong>Siti web</strong> · veloci, chiari, facili da aggiornare<br><strong>Contenuti</strong> · testi e immagini che raccontano il tuo lavoro</p><p style="text-align:center;color:#64748b">Questo è un sito dimostrativo realizzato con CanvasCore: ogni elemento si può modificare nell\'editor.</p>'])])]],
    'about' => ['Chi siamo', 'chi-siamo', [$mk('SECTION', [], [$mk('TEXT', ['text' => '<h1>Chi siamo</h1><p>Siamo un gruppo di designer e sviluppatori che ama le cose semplici: pagine veloci, testi chiari, strumenti che non si mettono in mezzo.</p><p>Lumen Studio è un nome di fantasia: ogni cosa che vedi qui si può cambiare, duplicare o cancellare nell\'editor.</p>'])])]],
    'contact' => ['Contatti', 'contatti', [$mk('SECTION', [], [$mk('TEXT', ['text' => '<h1>Contatti</h1><p>Scrivici: rispondiamo entro un giorno lavorativo. (In questa demo il modulo non invia messaggi.)</p>'])])]],
];
foreach ($it as $key => [$title, $slug, $blocks]) {
    $t = $must($c->api('translate_page', ['id' => $ids[$key], 'lang' => 'it']), "translate $key");
    $must($c->api('save_page', ['id' => $t['page']['id'], 'title' => $title, 'slug' => $slug, 'blocks' => $blocks, 'publish' => true, 'lang' => 'it', 'seo_description' => $title . ' — Lumen Studio.']), "save the Italian page $title");
}

// ---- blog
$must($c->api('save_collection', ['id' => 'demo-blog', 'name' => 'Blog', 'slug' => 'blog', 'fields' => []]), 'make the blog');
$posts = [['Why we build with blocks', 'why-we-build-with-blocks', 'sunrise', '2026-09-12', 'Pages made of blocks are easier to change, to translate and to keep consistent. Here is how we work.'],
          ['A faster site in an afternoon', 'a-faster-site-in-an-afternoon', 'studio', '2026-09-28', 'Static pages, optimised images and no database to wait for: what changed when we moved a client site.'],
          ['Writing for more than one language', 'writing-for-more-than-one-language', 'paper', '2026-10-10', 'Translations are pages of their own, linked together. A short guide for editors.']];
foreach ($posts as $i => [$title, $slug, $img, $date, $excerpt]) {
    $blocks = [$mk('SECTION', [], [$mk('TEXT', ['text' => "<h1>$title</h1><p><em>$excerpt</em></p><p>This is a sample post of the demo site. Change the text, add images, a table of contents or a sign-up box from the Add panel, then press Publish.</p><h2>The short version</h2><p>Keep things simple, say one thing per page, and let the tools do the boring parts.</p>"])])];
    $must($c->api('save_item', ['id' => 'demo-post-' . ($i + 1), 'collection_id' => 'demo-blog', 'title' => $title, 'slug' => $slug, 'excerpt' => $excerpt, 'cover_image' => $urls[$img], 'date' => $date, 'status' => 'published', 'blocks' => $blocks, 'lang' => 'en']), "save the post $title");
}

// ---- menu (one per language), popup
$mi = function ($id, $title, $url) { return ['id' => $id, 'title' => $title, 'url' => $url, 'children' => []]; };
$must($c->api('save_menu', ['items' => [$mi('m1', 'Home', 'index.html'), $mi('m2', 'Services', 'services/index.html'), $mi('m3', 'Pricing', 'pricing/index.html'), $mi('m4', 'Blog', 'blog/index.html'), $mi('m5', 'About', 'about/index.html'), $mi('m6', 'Contact', 'contact/index.html')],
    'settings' => (object)[], 'langs' => ['it' => ['items' => [$mi('i1', 'Home', 'it/index.html'), $mi('i2', 'Chi siamo', 'it/chi-siamo/index.html'), $mi('i3', 'Contatti', 'it/contatti/index.html')]]]]), 'save the menu');
$must($c->api('save_popup', ['name' => 'Newsletter', 'status' => 'published', 'blocks' => [$mk('TEXT', ['text' => '<h2 style="text-align:center">Stay in the loop</h2><p style="text-align:center">One short email when there is something new.</p>']), $mk('NEWSLETTER', ['title' => '', 'text' => '', 'layout' => 'plain', 'formLayout' => 'stacked'])], 'settings' => []]), 'save the popup');

$r = $c->req('POST', '/canvascore-admin/rebuild_all.php', '');
$must($r, 'publish the site');
echo "Published: " . ($r['json']['message'] ?? '') . "\n";

// ---- the baseline
if (!empty($opt['baseline'])) {
    // the address of this scratch server must not travel in the baseline: a restore keeps the address of the site it is restored on
    $st2 = $c->api('get_settings')['json'] ?? [];
    $must($c->api('save_settings', array_merge($st2, ['siteUrl' => ''])), 'clear the scratch address');
    $b = $must($c->api('backup_create', ['temp' => true, 'history' => false, 'submissions' => false]), 'make the backup');
    $dl = $c->req('GET', '/canvascore-admin/api.php?action=backup_download&name=' . rawurlencode($b['name']), null);
    if (strncmp($dl['body'], "PK", 2) !== 0) { fwrite(STDERR, "The backup could not be downloaded.\n"); exit(1); }
    file_put_contents($opt['baseline'], $dl['body']);
    echo "Baseline: {$opt['baseline']} (" . round(strlen($dl['body']) / 1024) . " KB)\n";
}
if (isset($opt['keep'])) { echo "Site kept in $site (web/ and canvascore-data/); sign in as builder / $pass\nThe server stays up: press Ctrl+C to stop.\n"; while (true) sleep(3600); }
$stop();
$rm = function ($d) use (&$rm) { foreach (array_diff(scandir($d) ?: [], ['.', '..']) as $f) { is_dir("$d/$f") && !is_link("$d/$f") ? $rm("$d/$f") : @unlink("$d/$f"); } @rmdir($d); };
$rm($site);
