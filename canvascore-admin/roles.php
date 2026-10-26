<?php
// canvascore-admin/roles.php
// Roles and review: what each role may do, ownership (an author works on their own pages and items), per-collection access, and the
// review flow (submit, send back, withdraw, the queue). The API (api.php) calls these before it touches content; the editor hides what
// the role cannot do, but the server is what decides.
//
//   admin     everything
//   editor    all content, publishes directly (as before roles existed)
//   reviewer  all content; approves what is waiting for review (approving = publishing it) or sends it back with a note;
//             creates nothing; no global changes (menu, settings, templates, masters, media management)
//   author    their own pages and items: creates, edits, saves drafts and submits for review; cannot publish; no global changes
//
// A page or an item carries: created_by, review_state ('' | 'pending' | 'changes'), review_note, review_by (who submitted),
// review_at, reviewed_by (who last approved). A collection can limit who works in it (access_json). Library file.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
require_once __DIR__ . '/config.php';

// Actions the author and reviewer roles may not use: site-wide things, and what changes or removes content that is not theirs
const CC_CONTRIBUTOR_DENIED = [
    'save_settings', 'save_menu', 'save_part', 'delete_part', 'save_template', 'delete_template', 'save_master', 'delete_master',
    'delete_media', 'media_folder_create', 'media_folder_rename', 'media_folder_delete', 'media_move', 'optimize_media', 'media_crop', 'media_replace',
    'bulk_items', 'set_schedule', 'save_redirect', 'delete_redirect', 'save_popup', 'delete_popup', 'save_languages',
];

function cc_is_contributor($role) { return $role === 'author' || $role === 'reviewer'; }
// Who can put things online: admins and editors directly, a reviewer only what is waiting for review (see cc_can_publish_row)
function cc_can_publish_directly($role) { return $role === 'admin' || $role === 'editor'; }
function cc_can_create($role) { return $role !== 'reviewer'; }
function cc_can_publish_site($role) { return $role !== 'author'; }
function cc_can_edit_any($role) { return $role !== 'author'; }

// ---- ownership and review state of a page or an item
// A draft copy of a page belongs to the page it is a copy of
function cc_owner_of_page($pdo, $row) {
    if (!$row) return '';
    if ((int)($row['is_draft_copy'] ?? 0) === 1 && !empty($row['parent_id'])) {
        $st = $pdo->prepare("SELECT created_by FROM pages WHERE id = ?"); $st->execute([$row['parent_id']]);
        $p = $st->fetchColumn();
        if ($p !== false && $p !== '') return (string)$p;
    }
    return (string)($row['created_by'] ?? '');
}
// The review state that applies to a page: its own, or the one of its draft copy (the copy is what the author edits)
function cc_page_review($pdo, $row) {
    if (!$row) return ['state' => '', 'by' => '', 'note' => ''];
    $rows = [$row];
    if ((int)($row['is_draft_copy'] ?? 0) === 0) {
        $st = $pdo->prepare("SELECT * FROM pages WHERE parent_id = ? AND is_draft_copy = 1 ORDER BY updated_at DESC LIMIT 1"); $st->execute([$row['id']]);
        if ($c = $st->fetch(PDO::FETCH_ASSOC)) array_unshift($rows, $c);
    }
    foreach ($rows as $r) if (($r['review_state'] ?? '') !== '') return ['state' => $r['review_state'], 'by' => (string)$r['review_by'], 'note' => (string)$r['review_note']];
    return ['state' => '', 'by' => '', 'note' => ''];
}

// May this account save this page the way the request wants? true, or ['code' => …, 'message' => …]
function cc_page_save_check($pdo, $role, $username, $existing, $publish) {
    if ($role === 'admin' || $role === 'editor') return true;
    if (!$existing) {
        if (!cc_can_create($role)) return ['code' => 'forbidden', 'message' => 'Reviewers cannot create pages. Ask an author or an editor.'];
        if ($publish) return ['code' => 'needs_review', 'message' => 'Authors cannot publish. Save the page as a draft and submit it for review.'];
        return true;
    }
    $review = cc_page_review($pdo, $existing);
    if ($role === 'author') {
        if (cc_owner_of_page($pdo, $existing) !== $username) return ['code' => 'forbidden', 'message' => 'This page belongs to someone else. You can only edit your own pages.'];
        if ($publish) return ['code' => 'needs_review', 'message' => 'Authors cannot publish. Save the page as a draft and submit it for review.'];
        if ($review['state'] === 'pending') return ['code' => 'in_review', 'message' => 'This page is waiting for review. Withdraw the submission to change it.'];
        return true;
    }
    // reviewer: may edit anything, and publish only what is waiting for review
    if ($publish && $review['state'] !== 'pending') return ['code' => 'needs_review', 'message' => 'Reviewers approve pages that were submitted for review. This page was not submitted.'];
    return true;
}
function cc_item_save_check($pdo, $role, $username, $existing, $wantsPublished) {
    if ($role === 'admin' || $role === 'editor') return true;
    if (!$existing) {
        if (!cc_can_create($role)) return ['code' => 'forbidden', 'message' => 'Reviewers cannot create items. Ask an author or an editor.'];
        if ($wantsPublished) return ['code' => 'needs_review', 'message' => 'Authors cannot publish. Save the item as a draft and submit it for review.'];
        return true;
    }
    $state = (string)($existing['review_state'] ?? '');
    if ($role === 'author') {
        if (($existing['created_by'] ?? '') !== $username || $username === '') return ['code' => 'forbidden', 'message' => 'This item belongs to someone else. You can only edit your own items.'];
        if (($existing['status'] ?? '') === 'published') return ['code' => 'published_locked', 'message' => 'Published items are changed by an editor: authors can only work on drafts.'];
        if ($wantsPublished) return ['code' => 'needs_review', 'message' => 'Authors cannot publish. Save the item as a draft and submit it for review.'];
        if ($state === 'pending') return ['code' => 'in_review', 'message' => 'This item is waiting for review. Withdraw the submission to change it.'];
        return true;
    }
    if ($wantsPublished && $state !== 'pending') return ['code' => 'needs_review', 'message' => 'Reviewers approve items that were submitted for review. This item was not submitted.'];
    return true;
}

// ---- collection access
function cc_collection_access_clean($raw) {
    $raw = is_array($raw) ? $raw : [];
    $users = [];
    foreach (is_array($raw['users'] ?? null) ? $raw['users'] : [] as $u) {
        $u = is_string($u) ? trim($u) : '';
        if (preg_match('/^[A-Za-z0-9._@-]{3,32}$/', $u) && !in_array($u, $users, true) && count($users) < 200) $users[] = $u;
    }
    return ['mode' => ($raw['mode'] ?? '') === 'selected' ? 'selected' : 'all', 'users' => $users];
}
// May this account work in the collection? Admins always; others unless it is limited to selected people who do not include them
function cc_collection_allowed($pdo, $cid, $role, $username) {
    if ($role === 'admin') return true;
    $st = $pdo->prepare("SELECT access_json FROM collections WHERE id = ?"); $st->execute([(string)$cid]);
    $raw = $st->fetchColumn();
    if ($raw === false) return true;   // not a collection: other checks report that
    $a = cc_collection_access_clean(json_decode((string)$raw, true));
    return $a['mode'] !== 'selected' || in_array($username, $a['users'], true);
}
// May this account read the version history of a page (owner = the page id) or of a collection item (owner = "item:<id>")?
// The same rule as reading the page or the item itself: authors only their own, nobody in a collection limited to other people.
function cc_can_read_owner($pdo, $owner, $role, $username) {
    if ($role === 'admin') return true;
    $owner = (string)$owner;
    if (strpos($owner, 'item:') === 0) {
        $st = $pdo->prepare("SELECT collection_id, created_by FROM collection_items WHERE id = ?"); $st->execute([substr($owner, 5)]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) return false;
        return cc_collection_allowed($pdo, $row['collection_id'], $role, $username) && ($role !== 'author' || $row['created_by'] === $username);
    }
    $st = $pdo->prepare("SELECT * FROM pages WHERE id = ?"); $st->execute([$owner]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return false;
    return $role !== 'author' || ($username !== '' && cc_owner_of_page($pdo, $row) === $username);
}
function cc_collections_denied_ids($pdo, $role, $username) {
    if ($role === 'admin') return [];
    $out = [];
    foreach ($pdo->query("SELECT id, access_json FROM collections")->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $a = cc_collection_access_clean(json_decode((string)$c['access_json'], true));
        if ($a['mode'] === 'selected' && !in_array($username, $a['users'], true)) $out[] = $c['id'];
    }
    return $out;
}

// ---- the review flow
function cc_review_row($pdo, $kind, $id) {
    $st = $pdo->prepare($kind === 'item' ? "SELECT * FROM collection_items WHERE id = ?" : "SELECT * FROM pages WHERE id = ?");
    $st->execute([(string)$id]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}
function cc_review_set($pdo, $kind, $id, $fields) {
    $t = $kind === 'item' ? 'collection_items' : 'pages';
    $sets = []; $vals = [];
    foreach ($fields as $k => $v) { if (in_array($k, ['review_state', 'review_note', 'review_by', 'review_at', 'reviewed_by'], true)) { $sets[] = "$k = ?"; $vals[] = $v; } }
    if (!$sets) return;
    $vals[] = (string)$id;
    $pdo->prepare("UPDATE $t SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
}
// What the review flow allows $role/$username to do to this row. Returns ['ok' => bool, 'message' => …] for $do = submit | back | withdraw
function cc_review_allowed($pdo, $do, $kind, $row, $role, $username) {
    if (!$row) return ['ok' => false, 'message' => 'Not found.'];
    $state = (string)($row['review_state'] ?? '');
    if ($kind === 'item') {
        if (!cc_collection_allowed($pdo, $row['collection_id'], $role, $username)) return ['ok' => false, 'message' => 'You do not have access to this collection.'];
        $mine = ($row['created_by'] ?? '') === $username && $username !== '';
        $live = ($row['status'] ?? '') === 'published';
    } else {
        $mine = cc_owner_of_page($pdo, $row) === $username && $username !== '';
        $live = (int)($row['is_draft_copy'] ?? 0) === 0 && ($row['status'] ?? '') === 'published';
    }
    if ($do === 'submit') {
        if ($role === 'author' && !$mine) return ['ok' => false, 'message' => 'You can only submit your own work.'];
        if ($role === 'reviewer') return ['ok' => false, 'message' => 'Reviewers approve work; they do not submit it.'];
        if ($live) return ['ok' => false, 'message' => 'Nothing to review: there are no unpublished changes.'];
        if ($state === 'pending') return ['ok' => false, 'message' => 'It is already waiting for review.'];
        return ['ok' => true];
    }
    if ($do === 'back') {
        if ($role === 'author') return ['ok' => false, 'message' => 'Only a reviewer or an editor can send work back.'];
        if ($state !== 'pending') return ['ok' => false, 'message' => 'It is not waiting for review.'];
        return ['ok' => true];
    }
    // withdraw: the person who submitted it, or anyone who can review
    if ($state !== 'pending') return ['ok' => false, 'message' => 'It is not waiting for review.'];
    if ($role === 'author' && ($row['review_by'] ?? '') !== $username) return ['ok' => false, 'message' => 'Only the person who submitted it can withdraw it.'];
    return ['ok' => true];
}
function cc_review_queue($pdo, $role, $username) {
    $out = [];
    $mineOnly = $role === 'author';
    $denied = cc_collections_denied_ids($pdo, $role, $username);
    foreach ($pdo->query("SELECT id, parent_id, is_draft_copy, title, slug, review_state, review_note, review_by, review_at, created_by FROM pages WHERE review_state != ''")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if ($mineOnly && cc_owner_of_page($pdo, $r) !== $username) continue;
        $out[] = ['kind' => 'page', 'id' => $r['id'], 'parent_id' => $r['parent_id'], 'title' => $r['title'], 'state' => $r['review_state'], 'note' => $r['review_note'], 'by' => $r['review_by'], 'at' => $r['review_at'], 'collection' => ''];
    }
    $q = $pdo->query("SELECT i.id, i.collection_id, i.title, i.review_state, i.review_note, i.review_by, i.review_at, i.created_by, c.name AS cname FROM collection_items i LEFT JOIN collections c ON c.id = i.collection_id WHERE i.review_state != ''");
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (in_array($r['collection_id'], $denied, true)) continue;
        if ($mineOnly && $r['created_by'] !== $username) continue;
        $out[] = ['kind' => 'item', 'id' => $r['id'], 'parent_id' => null, 'title' => $r['title'], 'state' => $r['review_state'], 'note' => $r['review_note'], 'by' => $r['review_by'], 'at' => $r['review_at'], 'collection' => (string)$r['cname'], 'collection_id' => $r['collection_id']];
    }
    usort($out, function ($a, $b) { return strcmp((string)$b['at'], (string)$a['at']); });
    return $out;
}
// A page or an item has just been published: the review is over. Who approved it is kept when it was waiting for review.
function cc_review_published($pdo, $kind, $id, $username, $wasPending) {
    $f = ['review_state' => '', 'review_note' => '', 'review_by' => '', 'review_at' => ''];
    if ($wasPending) $f['reviewed_by'] = $username;
    cc_review_set($pdo, $kind, $id, $f);
}
