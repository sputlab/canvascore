<?php
// canvascore-admin/integrations.php
// Integrations: webhooks for form submissions, newsletter services (Mailchimp, Brevo), analytics (Google Analytics 4, Plausible, Matomo)
// and Stripe payment links. One file in the data folder (integrations.json, never in settings.json, never sent to the editor except
// masked) holds the keys and choices; Administration › Integrations (admins) changes them.
//
//  - Webhooks: a signed JSON POST to your own address for every submission of the forms you choose (all, or some).
//        X-CanvasCore-Signature: sha256=HMAC-SHA256(secret, "<timestamp>.<body>"), X-CanvasCore-Timestamp, X-CanvasCore-Event, X-CanvasCore-Delivery.
//  - Newsletter services: the email (and name) of a submission is added to a Mailchimp audience or a Brevo list, only with the visitor's consent
//        (a consent field that is ticked; a Newsletter block with no consent text is itself the consent).
//  - Analytics: a snippet in the head of every published page; it waits for the cookie banner when the site has one (and the provider uses cookies).
//  - Stripe: payment links made with the Stripe API (a restricted key) and kept in a list the Payment Button block picks from.
// Deliveries run after the visitor has been answered; each is logged (integration_log, newest 300) and a failed one can be sent again.
// Calls go only to public addresses (webhooks) or to the services' own hosts, with the connection pinned to the checked address. Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/wpimport.php';

const CC_INT_MAX_WEBHOOKS = 10;
const CC_INT_LOG_KEEP = 300;
const CC_INT_TIMEOUT = 6;
const CC_INT_MAX_RESPONSE = 65536;
const CC_INT_PROVIDERS = ['none', 'ga4', 'plausible', 'matomo'];
const CC_INT_CURRENCIES = ['usd', 'eur', 'gbp', 'chf', 'cad', 'aud', 'sek', 'nok', 'dkk', 'pln', 'jpy'];

function cc_int_file() { return $GLOBALS['CC_INT_FILE'] ?? (cc_data_dir() . '/integrations.json'); }   // overridable for tests
// Developer / mirror settings (integrations-source.php in the admin folder, not part of a release): the services' base addresses, and
// allow_private (lets webhooks reach a private address: for a test server only)
function cc_int_source() {
    $s = ['mailchimp' => 'https://{dc}.api.mailchimp.com/3.0', 'brevo' => 'https://api.brevo.com/v3', 'stripe' => 'https://api.stripe.com/v1', 'allow_private' => false];
    $f = __DIR__ . '/integrations-source.php';
    if (is_file($f)) { $o = include $f; if (is_array($o)) $s = array_merge($s, $o); }
    return $s;
}
function cc_int_defaults() {
    return [
        'webhooks' => [],
        'mailchimp' => ['enabled' => false, 'api_key' => '', 'list_id' => '', 'double_optin' => false, 'forms' => 'newsletter'],
        'brevo' => ['enabled' => false, 'api_key' => '', 'list_id' => '', 'forms' => 'newsletter'],
        'analytics' => ['provider' => 'none', 'ga4_id' => '', 'plausible_domain' => '', 'plausible_host' => '', 'matomo_url' => '', 'matomo_site' => '', 'consent' => true],
        'stripe' => ['api_key' => '', 'links' => []],
    ];
}
function cc_int_load() {
    $d = cc_int_defaults();
    $raw = is_file(cc_int_file()) ? json_decode((string)file_get_contents(cc_int_file()), true) : null;
    if (!is_array($raw)) return $d;
    foreach (['mailchimp', 'brevo', 'analytics', 'stripe'] as $k) if (is_array($raw[$k] ?? null)) $d[$k] = array_merge($d[$k], $raw[$k]);
    if (is_array($raw['webhooks'] ?? null)) $d['webhooks'] = array_values($raw['webhooks']);
    return $d;
}
function cc_int_save($cfg) {
    $f = cc_int_file(); $tmp = $f . '.tmp';
    $old = umask(0077);
    $ok = @file_put_contents($tmp, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, $f);
    umask($old);
    @chmod($f, 0600);
    return $ok;
}
function cc_int_mask($k) { $k = (string)$k; return $k === '' ? '' : '••••' . substr($k, -4); }

// ---------------------------------------------------------------------------------------------- cleaning what the admin sends
function cc_int_text($v, $max) { return mb_substr(trim(preg_replace('/[\x00-\x1f\x7f]/u', ' ', strip_tags(is_scalar($v) ? (string)$v : ''))), 0, $max); }
function cc_int_forms_choice($v) {
    if ($v === 'all' || $v === 'newsletter') return $v;
    if (is_array($v)) { $ids = []; foreach ($v as $x) if (is_string($x) && preg_match('/^f_[A-Za-z0-9_-]{1,60}$/', $x) && !in_array($x, $ids, true) && count($ids) < 100) $ids[] = $x; return $ids; }
    return 'newsletter';
}
// A webhook address: https, a public host; returns the address or ''
function cc_int_webhook_url($u) {
    $u = trim((string)$u);
    if (strlen($u) > 500 || !preg_match(cc_int_source()['allow_private'] ? '#^https?://#i' : '#^https://#i', $u)) return '';
    if (!cc_int_source()['allow_private'] && !cc_wp_url_check($u)[0]) return '';
    return $u;
}
function cc_int_clean_webhook($in, $old = null) {
    $in = is_array($in) ? $in : [];
    $url = cc_int_webhook_url($in['url'] ?? '');
    $id = is_string($in['id'] ?? null) && preg_match('/^wh_[a-f0-9]{8,16}$/', $in['id']) ? $in['id'] : 'wh_' . bin2hex(random_bytes(5));
    return [
        'id' => $id, 'name' => cc_int_text($in['name'] ?? '', 60) ?: 'Webhook', 'url' => $url, 'enabled' => !empty($in['enabled']),
        'forms' => cc_int_forms_choice($in['forms'] ?? 'all'),
        'secret' => $old['secret'] ?? bin2hex(random_bytes(16)),
    ];
}
function cc_int_clean_mailchimp($in, $old) {
    $in = is_array($in) ? $in : [];
    $key = trim((string)($in['api_key'] ?? ''));
    if ($key === '' || strpos($key, '••••') === 0) $key = (string)$old['api_key'];
    if (!empty($in['clear_key'])) $key = '';
    if ($key !== '' && !preg_match('/^[a-f0-9]{32}-[a-z]{2,4}[0-9]{1,3}$/', $key)) $key = '';
    $list = trim((string)($in['list_id'] ?? ''));
    return ['enabled' => !empty($in['enabled']) && $key !== '', 'api_key' => $key, 'list_id' => preg_match('/^[a-f0-9]{6,20}$/', $list) ? $list : '', 'double_optin' => !empty($in['double_optin']), 'forms' => cc_int_forms_choice($in['forms'] ?? 'newsletter')];
}
function cc_int_clean_brevo($in, $old) {
    $in = is_array($in) ? $in : [];
    $key = trim((string)($in['api_key'] ?? ''));
    if ($key === '' || strpos($key, '••••') === 0) $key = (string)$old['api_key'];
    if (!empty($in['clear_key'])) $key = '';
    if ($key !== '' && !preg_match('/^xkeysib-[A-Za-z0-9-]{20,100}$/', $key)) $key = '';
    $list = trim((string)($in['list_id'] ?? ''));
    return ['enabled' => !empty($in['enabled']) && $key !== '', 'api_key' => $key, 'list_id' => preg_match('/^\d{1,9}$/', $list) ? $list : '', 'forms' => cc_int_forms_choice($in['forms'] ?? 'newsletter')];
}
function cc_int_clean_analytics($in) {
    $in = is_array($in) ? $in : [];
    $p = in_array($in['provider'] ?? '', CC_INT_PROVIDERS, true) ? $in['provider'] : 'none';
    $ga = strtoupper(trim((string)($in['ga4_id'] ?? '')));
    $pd = strtolower(trim((string)($in['plausible_domain'] ?? '')));
    $ph = strtolower(trim((string)($in['plausible_host'] ?? '')));
    $mu = trim((string)($in['matomo_url'] ?? ''));
    $ms = trim((string)($in['matomo_site'] ?? ''));
    return [
        'provider' => $p,
        'ga4_id' => preg_match('/^G-[A-Z0-9]{4,14}$/', $ga) ? $ga : '',
        'plausible_domain' => preg_match('/^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$/', $pd) ? $pd : '',
        'plausible_host' => preg_match('/^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$/', $ph) ? $ph : '',
        'matomo_url' => preg_match('#^https://[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?(:\d{2,5})?(/[A-Za-z0-9._~/-]{0,100})?$#i', $mu) ? rtrim($mu, '/') . '/' : '',
        'matomo_site' => preg_match('/^\d{1,9}$/', $ms) ? $ms : '',
        'consent' => !array_key_exists('consent', $in) || !empty($in['consent']),
    ];
}
function cc_int_clean_stripe_key($in, $old) {
    $key = trim((string)($in ?? ''));
    if ($key === '' || strpos($key, '••••') === 0) return (string)$old;
    return preg_match('/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,200}$/', $key) ? $key : (string)$old;
}
// What the editor may see: keys masked, secrets only as a hint; never the stored key
function cc_int_public($cfg) {
    $wh = [];
    foreach ($cfg['webhooks'] as $w) $wh[] = ['id' => $w['id'], 'name' => $w['name'], 'url' => $w['url'], 'enabled' => (bool)$w['enabled'], 'forms' => $w['forms'], 'secret_hint' => cc_int_mask($w['secret'] ?? '')];
    $mc = $cfg['mailchimp']; $bv = $cfg['brevo'];
    $out = ['webhooks' => $wh, 'analytics' => $cfg['analytics'],
        'mailchimp' => ['enabled' => (bool)$mc['enabled'], 'key_hint' => cc_int_mask($mc['api_key']), 'has_key' => $mc['api_key'] !== '', 'list_id' => $mc['list_id'], 'double_optin' => (bool)$mc['double_optin'], 'forms' => $mc['forms']],
        'brevo' => ['enabled' => (bool)$bv['enabled'], 'key_hint' => cc_int_mask($bv['api_key']), 'has_key' => $bv['api_key'] !== '', 'list_id' => $bv['list_id'], 'forms' => $bv['forms']],
        'stripe' => ['key_hint' => cc_int_mask($cfg['stripe']['api_key']), 'has_key' => $cfg['stripe']['api_key'] !== '', 'mode' => preg_match('/_(test|live)_/', $cfg['stripe']['api_key'], $m) ? $m[1] : '', 'links' => array_values($cfg['stripe']['links'])]];
    return $out;
}

// ---------------------------------------------------------------------------------------------- calling out
// One HTTP call. $o: public (the address must be a public one: webhooks), hosts (the only hosts allowed), headers, timeout.
// Returns ['code' => int, 'body' => string, 'error' => string]. Redirects are never followed. Test stub: $GLOBALS['CC_INT_HTTP']
function cc_int_http($method, $url, $body = null, array $o = []) {
    if (isset($GLOBALS['CC_INT_HTTP']) && is_callable($GLOBALS['CC_INT_HTTP'])) return $GLOBALS['CC_INT_HTTP']($method, $url, $body, $o);
    $p = parse_url((string)$url);
    if (!$p || empty($p['host']) || strtolower($p['scheme'] ?? '') !== 'https' && !(cc_int_source()['allow_private'] && strtolower($p['scheme'] ?? '') === 'http') || isset($p['user']) || isset($p['pass'])) return ['code' => 0, 'body' => '', 'error' => 'the address is not an https address'];
    $host = strtolower($p['host']);
    if (!empty($o['hosts']) && !in_array($host, array_map('strtolower', $o['hosts']), true) && !cc_int_source()['allow_private']) return ['code' => 0, 'body' => '', 'error' => 'the host is not allowed'];
    if (!function_exists('curl_init')) return ['code' => 0, 'body' => '', 'error' => 'this server has no PHP curl extension'];
    $port = $p['port'] ?? (strtolower($p['scheme']) === 'https' ? 443 : 80);
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => $o['timeout'] ?? CC_INT_TIMEOUT,
             CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_USERAGENT => 'CanvasCore/' . cc_version()['app'] . ' (integrations)', CURLOPT_HTTPHEADER => $o['headers'] ?? []];
    if (!empty($o['public']) && !cc_int_source()['allow_private']) {
        [$ok, $ip] = cc_wp_url_check($url);
        if (!$ok) return ['code' => 0, 'body' => '', 'error' => 'the address is not public (' . $ip . ')'];
        $opts[CURLOPT_RESOLVE] = [$host . ':' . $port . ':' . $ip];   // the connection goes to the address that was checked
    }
    if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
    if (!empty($o['userpwd'])) $opts[CURLOPT_USERPWD] = $o['userpwd'];
    $got = '';
    $opts[CURLOPT_RETURNTRANSFER] = false;
    $opts[CURLOPT_WRITEFUNCTION] = function ($c, $d) use (&$got) { if (strlen($got) < CC_INT_MAX_RESPONSE) $got .= $d; return strlen($d); };
    $ch = curl_init($url);
    curl_setopt_array($ch, $opts);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch);
    if (PHP_VERSION_ID < 80000) curl_close($ch);   // a no-op since PHP 8.0, deprecated in 8.5
    return ['code' => $code, 'body' => $got, 'error' => $code === 0 ? ($err !== '' ? $err : 'no answer') : ''];
}

// ---------------------------------------------------------------------------------------------- the log
function cc_int_log_table($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS integration_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target TEXT, event TEXT, status TEXT, code INTEGER DEFAULT 0, detail TEXT DEFAULT '', payload_json TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
}
// $payload is kept only for what failed (to send it again)
function cc_int_log($pdo, $kind, $target, $event, $ok, $code, $detail, $payload = null) {
    try {
        cc_int_log_table($pdo);
        $pdo->prepare("INSERT INTO integration_log (kind, target, event, status, code, detail, payload_json, created_at) VALUES (?,?,?,?,?,?,?,?)")
            ->execute([$kind, mb_substr((string)$target, 0, 120), $event, $ok ? 'ok' : 'failed', (int)$code, mb_substr((string)$detail, 0, 300), $ok || $payload === null ? '' : json_encode($payload, JSON_UNESCAPED_UNICODE), date('Y-m-d H:i:s')]);
        $pdo->exec("DELETE FROM integration_log WHERE id NOT IN (SELECT id FROM integration_log ORDER BY id DESC LIMIT " . (int)CC_INT_LOG_KEEP . ")");
        return (int)$pdo->lastInsertId();
    } catch (Throwable $e) { error_log('CanvasCore integrations log: ' . $e->getMessage()); return 0; }
}

// ---------------------------------------------------------------------------------------------- webhooks
function cc_int_webhook_body($event, $site, $form, $fields, $subId, $page) {
    return json_encode(['event' => $event, 'id' => 'evt_' . bin2hex(random_bytes(8)), 'created' => gmdate('c'), 'site' => $site,
        'form' => ['id' => (string)($form['id'] ?? ''), 'type' => (string)($form['type'] ?? 'form')],
        'submission' => ['id' => (int)$subId, 'page' => (string)$page, 'fields' => (object)$fields]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}
function cc_int_sign($secret, $timestamp, $body) { return 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $body, $secret); }
// Sends one webhook. Returns [ok, code, detail]
function cc_int_send_webhook(array $w, $body, $event) {
    $ts = (string)time();
    $r = cc_int_http('POST', $w['url'], $body, ['public' => true, 'headers' => [
        'Content-Type: application/json', 'X-CanvasCore-Event: ' . $event, 'X-CanvasCore-Delivery: ' . bin2hex(random_bytes(8)),
        'X-CanvasCore-Timestamp: ' . $ts, 'X-CanvasCore-Signature: ' . cc_int_sign($w['secret'], $ts, $body)]]);
    $ok = $r['code'] >= 200 && $r['code'] < 300;
    return [$ok, $r['code'], $ok ? 'HTTP ' . $r['code'] : ($r['error'] !== '' ? $r['error'] : 'HTTP ' . $r['code'])];
}
function cc_int_forms_match($choice, $form) {
    if ($choice === 'all') return true;
    if ($choice === 'newsletter') return ($form['type'] ?? '') === 'newsletter';
    return is_array($choice) && in_array((string)($form['id'] ?? ''), $choice, true);
}

// ---------------------------------------------------------------------------------------------- newsletter services
// The email, name and consent of a submission, from the form's field positions: [email, name, consent] (consent: true/false/null = no consent field)
function cc_int_contact($form, array $byIndex) {
    $m = is_array($form['meta'] ?? null) ? $form['meta'] : [];
    $email = isset($m['email'], $byIndex[$m['email']]) ? trim((string)$byIndex[$m['email']]) : '';
    $name = isset($m['name'], $byIndex[$m['name']]) ? trim((string)$byIndex[$m['name']]) : '';
    $consent = null;
    if (isset($m['consent'])) { $v = strtolower(trim((string)($byIndex[$m['consent']] ?? ''))); $consent = $v !== '' && !in_array($v, ['no', '0', 'false', 'off'], true); }
    return [filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '', mb_substr(preg_replace('/[\x00-\x1f\x7f<>]/u', ' ', $name), 0, 100), $consent];
}
// May this person be added? Only with consent: a ticked consent field, or a Newsletter block that asks for none (the form is the signup)
function cc_int_may_subscribe($form, $consent) {
    if ($consent === true) return true;
    if ($consent === false) return false;
    return ($form['type'] ?? '') === 'newsletter';
}
function cc_int_mailchimp_base($key) {
    if (!preg_match('/-([a-z]{2,4}[0-9]{1,3})$/', $key, $m)) return null;
    return str_replace('{dc}', $m[1], cc_int_source()['mailchimp']);
}
function cc_int_mailchimp_host($key) { $b = cc_int_mailchimp_base($key); return $b ? strtolower((string)parse_url($b, PHP_URL_HOST)) : ''; }
function cc_int_mailchimp_call($cfg, $method, $path, $body = null) {
    $base = cc_int_mailchimp_base($cfg['api_key']);
    if (!$base) return ['code' => 0, 'body' => '', 'error' => 'the API key is not a Mailchimp key'];
    return cc_int_http($method, $base . $path, $body === null ? null : json_encode($body), ['hosts' => [cc_int_mailchimp_host($cfg['api_key'])], 'userpwd' => 'canvascore:' . $cfg['api_key'], 'headers' => ['Content-Type: application/json']]);
}
function cc_int_mailchimp_subscribe($cfg, $email, $name) {
    $body = ['email_address' => $email, 'status_if_new' => !empty($cfg['double_optin']) ? 'pending' : 'subscribed'];
    if ($name !== '') { $parts = preg_split('/\s+/', $name, 2); $body['merge_fields'] = ['FNAME' => $parts[0], 'LNAME' => $parts[1] ?? '']; }
    $r = cc_int_mailchimp_call($cfg, 'PUT', '/lists/' . $cfg['list_id'] . '/members/' . md5(strtolower($email)), $body);
    $ok = $r['code'] >= 200 && $r['code'] < 300;
    $detail = $ok ? 'HTTP ' . $r['code'] : cc_int_api_error($r);
    return [$ok, $r['code'], $detail];
}
function cc_int_api_error($r) {
    if ($r['error'] !== '') return $r['error'];
    $j = json_decode((string)$r['body'], true);
    $msg = is_array($j) ? ($j['detail'] ?? $j['message'] ?? $j['title'] ?? ($j['error']['message'] ?? '')) : '';
    return 'HTTP ' . $r['code'] . ($msg !== '' ? ': ' . cc_int_text($msg, 200) : '');
}
function cc_int_brevo_call($cfg, $method, $path, $body = null) {
    return cc_int_http($method, cc_int_source()['brevo'] . $path, $body === null ? null : json_encode($body), ['hosts' => ['api.brevo.com'], 'headers' => ['Content-Type: application/json', 'Accept: application/json', 'api-key: ' . $cfg['api_key']]]);
}
function cc_int_brevo_subscribe($cfg, $email, $name) {
    $body = ['email' => $email, 'listIds' => [(int)$cfg['list_id']], 'updateEnabled' => true];
    if ($name !== '') { $parts = preg_split('/\s+/', $name, 2); $body['attributes'] = ['FIRSTNAME' => $parts[0], 'LASTNAME' => $parts[1] ?? '']; }
    $r = cc_int_brevo_call($cfg, 'POST', '/contacts', $body);
    $ok = $r['code'] >= 200 && $r['code'] < 300;
    return [$ok, $r['code'], $ok ? 'HTTP ' . $r['code'] : cc_int_api_error($r)];
}
// "Test the connection": the name of the list, or the reason it failed. Returns [ok, message]
function cc_int_test_service($service, $cfg) {
    if ($cfg['api_key'] === '' || $cfg['list_id'] === '') return [false, 'Enter the API key and the list first.'];
    if ($service === 'mailchimp') {
        $r = cc_int_mailchimp_call($cfg, 'GET', '/lists/' . $cfg['list_id'] . '?fields=name,stats.member_count');
        $j = json_decode((string)$r['body'], true);
        return $r['code'] === 200 && is_array($j) ? [true, 'Connected to the audience “' . cc_int_text($j['name'] ?? '', 80) . '”.'] : [false, 'Mailchimp: ' . cc_int_api_error($r)];
    }
    $r = cc_int_brevo_call($cfg, 'GET', '/contacts/lists/' . (int)$cfg['list_id']);
    $j = json_decode((string)$r['body'], true);
    return $r['code'] === 200 && is_array($j) ? [true, 'Connected to the list “' . cc_int_text($j['name'] ?? '', 80) . '”.'] : [false, 'Brevo: ' . cc_int_api_error($r)];
}

// ---------------------------------------------------------------------------------------------- a submission: webhooks and newsletter services
// $form: ['id', 'type' (form|newsletter|wizard), 'meta' => ['email' => i, 'name' => j, 'consent' => k]]; $byIndex: field position => value;
// $fields: label => value. Everything is logged; nothing here can stop the visitor's answer.
function cc_int_dispatch($pdo, array $form, array $byIndex, array $fields, $subId, $page, $site) {
    $cfg = cc_int_load();
    foreach ($cfg['webhooks'] as $w) {
        if (empty($w['enabled']) || $w['url'] === '' || !cc_int_forms_match($w['forms'], $form)) continue;
        $body = cc_int_webhook_body('form.submitted', $site, $form, $fields, $subId, $page);
        [$ok, $code, $detail] = cc_int_send_webhook($w, $body, 'form.submitted');
        cc_int_log($pdo, 'webhook', $w['name'] . ' (' . $w['id'] . ')', 'form.submitted', $ok, $code, $detail, ['webhook' => $w['id'], 'body' => $body]);
    }
    [$email, $name, $consent] = cc_int_contact($form, $byIndex);
    if ($email === '' || !cc_int_may_subscribe($form, $consent)) return;
    foreach (['mailchimp' => 'Mailchimp', 'brevo' => 'Brevo'] as $svc => $label) {
        $c = $cfg[$svc];
        if (empty($c['enabled']) || $c['api_key'] === '' || $c['list_id'] === '' || !cc_int_forms_match($c['forms'], $form)) continue;
        [$ok, $code, $detail] = $svc === 'mailchimp' ? cc_int_mailchimp_subscribe($c, $email, $name) : cc_int_brevo_subscribe($c, $email, $name);
        cc_int_log($pdo, 'newsletter', $label, 'subscribe', $ok, $code, $detail, ['service' => $svc, 'email' => $email, 'name' => $name]);
    }
}
// Sends a logged failure again (a webhook body, or a newsletter subscription). Returns [ok, message]
function cc_int_resend($pdo, $logId) {
    cc_int_log_table($pdo);
    $st = $pdo->prepare("SELECT * FROM integration_log WHERE id = ?"); $st->execute([(int)$logId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['status'] !== 'failed' || $row['payload_json'] === '') return [false, 'There is nothing to send again.'];
    $p = json_decode($row['payload_json'], true);
    if (!is_array($p)) return [false, 'There is nothing to send again.'];
    $cfg = cc_int_load();
    if ($row['kind'] === 'webhook') {
        $w = null; foreach ($cfg['webhooks'] as $x) if ($x['id'] === ($p['webhook'] ?? '')) $w = $x;
        if (!$w || $w['url'] === '') return [false, 'That webhook no longer exists.'];
        [$ok, $code, $detail] = cc_int_send_webhook($w, (string)$p['body'], 'form.submitted');
        cc_int_log($pdo, 'webhook', $w['name'] . ' (' . $w['id'] . ')', 'form.submitted (again)', $ok, $code, $detail, $ok ? null : $p);
    } else {
        $svc = ($p['service'] ?? '') === 'brevo' ? 'brevo' : 'mailchimp';
        $c = $cfg[$svc];
        if ($c['api_key'] === '' || $c['list_id'] === '') return [false, 'That service is not set up.'];
        [$ok, $code, $detail] = $svc === 'mailchimp' ? cc_int_mailchimp_subscribe($c, (string)$p['email'], (string)($p['name'] ?? '')) : cc_int_brevo_subscribe($c, (string)$p['email'], (string)($p['name'] ?? ''));
        cc_int_log($pdo, 'newsletter', ucfirst($svc), 'subscribe (again)', $ok, $code, $detail, $ok ? null : $p);
    }
    if ($ok) $pdo->prepare("UPDATE integration_log SET payload_json = '', detail = detail || ' (sent again)' WHERE id = ?")->execute([(int)$logId]);
    return [$ok, $ok ? 'Sent.' : 'It failed again: ' . $detail];
}

// ---------------------------------------------------------------------------------------------- analytics
// The snippet for the head of every page, or ''. $banner: the site has a cookie banner (a snippet that sets cookies then waits for it).
function cc_int_analytics_html($a, $banner) {
    $a = is_array($a) ? cc_int_clean_analytics($a) : cc_int_clean_analytics([]);
    $gate = function ($attrs, $inline, $cookies) use ($a, $banner) {
        $wait = $banner && $cookies && $a['consent'];
        return '<script' . ($wait ? ' type="text/plain" data-cc-consent' : '') . $attrs . '>' . $inline . '</script>';
    };
    switch ($a['provider']) {
        case 'ga4':
            if ($a['ga4_id'] === '') return '';
            $id = $a['ga4_id'];
            return "\n<!-- Google Analytics -->\n" . $gate(' async src="https://www.googletagmanager.com/gtag/js?id=' . $id . '"', '', true) . "\n"
                . $gate('', "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','" . $id . "');", true) . "\n";
        case 'plausible':
            if ($a['plausible_domain'] === '') return '';
            $host = $a['plausible_host'] !== '' ? $a['plausible_host'] : 'plausible.io';
            return "\n<!-- Plausible Analytics -->\n" . $gate(' defer data-domain="' . $a['plausible_domain'] . '" src="https://' . $host . '/js/script.js"', '', false) . "\n";
        case 'matomo':
            if ($a['matomo_url'] === '' || $a['matomo_site'] === '') return '';
            $u = $a['matomo_url']; $s = $a['matomo_site'];
            $js = "var _paq=window._paq=window._paq||[];_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function(){var u=" . json_encode($u) . ";_paq.push(['setTrackerUrl',u+'matomo.php']);_paq.push(['setSiteId'," . json_encode($s) . "]);var d=document,g=d.createElement('script'),s=d.getElementsByTagName('script')[0];g.async=true;g.src=u+'matomo.js';s.parentNode.insertBefore(g,s);})();";
            return "\n<!-- Matomo -->\n" . $gate('', $js, true) . "\n";
    }
    return '';
}

// ---------------------------------------------------------------------------------------------- Stripe payment links
function cc_int_stripe_call($key, $method, $path, array $form = []) {
    $body = $form ? http_build_query($form) : null;
    return cc_int_http($method, cc_int_source()['stripe'] . $path, $body, ['hosts' => ['api.stripe.com'], 'headers' => ['Content-Type: application/x-www-form-urlencoded', 'Authorization: Bearer ' . $key, 'Stripe-Version: 2024-06-20']]);
}
// "https://buy.stripe.com/…" and "https://donate.stripe.com/…" only: where a Payment Link lives
function cc_int_stripe_link_ok($u) { return (bool)preg_match('#^https://(buy|donate)\.stripe\.com/[A-Za-z0-9_/-]{4,120}(\?[A-Za-z0-9_=&%.-]{0,200})?$#', (string)$u); }
// Makes a product, a price and a payment link. $in: name, amount (the price as typed, e.g. "19.90"), currency. Returns [link|null, message]
function cc_int_stripe_create_link($key, $in) {
    $name = cc_int_text($in['name'] ?? '', 100);
    $cur = strtolower(trim((string)($in['currency'] ?? '')));
    $amount = str_replace(',', '.', trim((string)($in['amount'] ?? '')));
    if ($name === '') return [null, 'Give the product a name.'];
    if (!in_array($cur, CC_INT_CURRENCIES, true)) return [null, 'Choose a currency.'];
    if (!preg_match('/^\d{1,7}(\.\d{1,2})?$/', $amount) || (float)$amount <= 0) return [null, 'Enter a price such as 19.90.'];
    $minor = $cur === 'jpy' ? (int)round((float)$amount) : (int)round((float)$amount * 100);
    if ($minor < 50 && $cur !== 'jpy') return [null, 'Stripe needs a price of at least 0.50.'];
    $r = cc_int_stripe_call($key, 'POST', '/products', ['name' => $name]);
    $j = json_decode((string)$r['body'], true);
    if ($r['code'] !== 200 || empty($j['id'])) return [null, 'Stripe: ' . cc_int_api_error($r)];
    $r = cc_int_stripe_call($key, 'POST', '/prices', ['product' => $j['id'], 'unit_amount' => $minor, 'currency' => $cur]);
    $pj = json_decode((string)$r['body'], true);
    if ($r['code'] !== 200 || empty($pj['id'])) return [null, 'Stripe: ' . cc_int_api_error($r)];
    $form = ['line_items[0][price]' => $pj['id'], 'line_items[0][quantity]' => 1];
    if (!empty($in['adjustable'])) { $form['line_items[0][adjustable_quantity][enabled]'] = 'true'; $form['line_items[0][adjustable_quantity][minimum]'] = 1; $form['line_items[0][adjustable_quantity][maximum]'] = 99; }
    $r = cc_int_stripe_call($key, 'POST', '/payment_links', $form);
    $lj = json_decode((string)$r['body'], true);
    if ($r['code'] !== 200 || empty($lj['id']) || !cc_int_stripe_link_ok($lj['url'] ?? '')) return [null, 'Stripe: ' . cc_int_api_error($r)];
    return [['id' => 'sl_' . bin2hex(random_bytes(4)), 'name' => $name, 'amount' => $amount, 'currency' => $cur, 'url' => $lj['url'], 'stripe_id' => (string)$lj['id'], 'created' => gmdate('Y-m-d H:i:s'), 'active' => true], 'Payment link created.'];
}
function cc_int_stripe_set_active($key, $stripeId, $active) {
    if (!preg_match('/^plink_[A-Za-z0-9]{8,60}$/', (string)$stripeId)) return [false, 'Not a payment link.'];
    $r = cc_int_stripe_call($key, 'POST', '/payment_links/' . $stripeId, ['active' => $active ? 'true' : 'false']);
    return $r['code'] === 200 ? [true, $active ? 'The link is active again.' : 'The link no longer takes payments.'] : [false, 'Stripe: ' . cc_int_api_error($r)];
}

// The forms the site has (from the registry written by the last publish): [{ id, type, labels }], for choosing which forms a webhook or a service gets
function cc_int_known_forms($dataDir) {
    $f = $dataDir . '/forms.json';
    $reg = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    $out = [];
    foreach (is_array($reg) ? $reg : [] as $id => $e) {
        if (!is_string($id) || !is_array($e)) continue;
        $out[] = ['id' => $id, 'type' => (string)($e['type'] ?? 'form'), 'labels' => array_slice(array_map('strval', (array)($e['labels'] ?? [])), 0, 6)];
    }
    return $out;
}
