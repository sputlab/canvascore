/* canvascore-admin/popups.js: the popup runtime (ES5), inlined once on published pages that have a popup.
   Reads the list in the JSON script element #cc-popups-data and, for each popup, decides when it may show and what makes it show:
     triggers  time (seconds after the page opens), scroll (percent of the page), exit (the mouse leaves through the top: mouse devices only),
               click (a link to #popup-ID or an element with data-cc-popup-open="ID": opens it whatever the rules say)
     rules     devices (desktop > 1024 px, tablet 768-1024, mobile <= 767), visitor (new / returning), schedule (from / to, inclusive, the visitor's date),
               frequency (always | session | days N | once). Where it shows (pages, collections) is decided when the site is published.
   One popup at a time per page view; the lowest priority number wins when two are due together. A popup holds back while the cookie banner is on screen.
   What it remembers is in the visitor's browser (localStorage: cc_visited, cc_popup_<id>; sessionStorage for "session") and nowhere else. */
(function () {
  var data = document.getElementById('cc-popups-data');
  if (!data) return;
  var list;
  try { list = JSON.parse(data.textContent); } catch (e) { return; }
  if (!list || !list.length) return;

  var win = window, doc = document;
  var now = Date.now();
  function lget(k) { try { return win.localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { win.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function sget(k) { try { return win.sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { win.sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  var returning = lget('cc_visited') !== null;
  lset('cc_visited', String(now));

  function device() {
    var w = win.innerWidth || doc.documentElement.clientWidth || 1024;
    return w <= 767 ? 'mobile' : (w <= 1024 ? 'tablet' : 'desktop');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(now); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function record(id) { var v = lget('cc_popup_' + id); if (!v) return null; try { return JSON.parse(v); } catch (e) { return { t: now }; } }

  // May this popup show now? (the rules; a click on its link skips them)
  function allowed(p) {
    var dv = p.devices || {};
    if (dv[device()] === false) return false;
    if (p.visitor === 'new' && returning) return false;
    if (p.visitor === 'returning' && !returning) return false;
    var s = p.schedule || {}, t = today();
    if (s.from && t < s.from) return false;
    if (s.to && t > s.to) return false;
    var f = p.freq || {}, mode = f.mode || 'always', rec = record(p.id);
    if (mode === 'always') return true;
    if (rec && rec.c) return false;                      // it was answered (a form in it was sent)
    if (mode === 'once') return !rec;
    if (mode === 'days') return !rec || now - rec.t >= (f.days || 7) * 86400000;
    if (mode === 'session') return !sget('cc_popup_' + p.id);
    return true;
  }

  var shown = null, lastFocus = null, prevOverflow = null, byId = {};
  function el(p) { return doc.getElementById('cc-popup-' + p.id); }
  function focusables(root) {
    var all = root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    var out = [];
    for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null || all[i] === doc.activeElement || all[i].getClientRects().length) out.push(all[i]);
    return out;
  }
  function cookieBannerUp() { var b = doc.getElementById('cc-consent'); return !!(b && !b.hidden); }

  function open(p, manual) {
    if (shown) return false;
    var node = el(p);
    if (!node) return false;
    if (!manual && !allowed(p)) return false;
    shown = p;
    lastFocus = doc.activeElement;
    node.hidden = false;
    if (p.pos === 'center') { prevOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; }
    win.setTimeout(function () { node.className += ' is-open'; }, 20);   // after it is in the page, so the animation runs
    var box = node.querySelector('.cc-popup__box');
    if (box) win.setTimeout(function () { try { box.focus(); } catch (e) { /* nothing */ } }, 40);
    // remembered when it is shown
    lset('cc_popup_' + p.id, JSON.stringify({ t: now }));
    sset('cc_popup_' + p.id, '1');
    return true;
  }
  function close() {
    var p = shown;
    if (!p) return;
    var node = el(p);
    shown = null;
    if (node) {
      node.className = node.className.replace(/\s*\bis-open\b/g, '');
      win.setTimeout(function () { if (!shown || shown.id !== p.id) node.hidden = true; }, p.anim === 'none' ? 0 : 260);
    }
    if (p.pos === 'center') doc.body.style.overflow = prevOverflow || '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* nothing */ } }
  }

  // a trigger fired: show the popup if nothing else is up (and the cookie banner is not in the way)
  function fire(p, tries) {
    if (shown || !allowed(p)) return;
    if (cookieBannerUp() && (tries || 0) < 40) { win.setTimeout(function () { fire(p, (tries || 0) + 1); }, 500); return; }
    open(p, false);
  }

  list.sort(function (a, b) { return (a.prio || 10) - (b.prio || 10); });
  var scrollers = [], exiters = [];
  for (var i = 0; i < list.length; i++) {
    (function (p) {
      byId[p.id] = p;
      var t = p.triggers || {};
      if (t.time && t.time.on) win.setTimeout(function () { fire(p); }, Math.max(0, (t.time.seconds || 0)) * 1000);
      if (t.scroll && t.scroll.on) scrollers.push(p);
      if (t.exit && t.exit.on) exiters.push(p);
    })(list[i]);
  }

  if (scrollers.length) {
    var onScroll = function () {
      var h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0) - (win.innerHeight || 0);
      var y = win.pageYOffset || doc.documentElement.scrollTop || 0;
      var pct = h > 0 ? (y / h) * 100 : 0;
      for (var k = 0; k < scrollers.length; k++) if (pct >= (scrollers[k].triggers.scroll.percent || 50)) fire(scrollers[k]);
    };
    win.addEventListener('scroll', onScroll, { passive: true });
  }
  var touch = win.matchMedia ? win.matchMedia('(pointer: coarse)').matches : ('ontouchstart' in win);   // the main pointer: a finger (a touch laptop with a mouse still has exit intent)
  if (exiters.length && !touch) {
    var armed = false;
    win.setTimeout(function () { armed = true; }, 2000);    // not in the first seconds: a mouse that is already out of the window does not count
    doc.addEventListener('mouseout', function (e) {
      if (!armed || e.relatedTarget || e.toElement) return;
      if (e.clientY > 0) return;                             // only through the top edge: where the tabs and the address bar are
      for (var k = 0; k < exiters.length; k++) fire(exiters[k]);
    });
  }

  // clicks: close, and links that open a popup by hand
  doc.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== doc) {
      if (t.getAttribute) {
        if (t.hasAttribute('data-cc-popup-close')) { e.preventDefault(); close(); return; }
        var href = t.getAttribute('href') || '', m = /^#popup-([A-Za-z0-9_-]+)$/.exec(href), id = m ? m[1] : t.getAttribute('data-cc-popup-open');
        if (id && byId[id]) { var pp = byId[id]; if ((pp.triggers || {}).click !== false) { e.preventDefault(); open(pp, true); } return; }
      }
      t = t.parentNode;
    }
  });
  doc.addEventListener('keydown', function (e) {
    if (!shown) return;
    if (e.key === 'Escape' || e.keyCode === 27) { if (shown.esc !== false) { e.preventDefault(); close(); } return; }
    if ((e.key === 'Tab' || e.keyCode === 9) && shown.pos === 'center') {   // keep the focus inside the dialog
      var node = el(shown), f = focusables(node.querySelector('.cc-popup__box') || node);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1], active = doc.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !node.contains(active))) { e.preventDefault(); first.focus(); }
    }
  });
  // a form sent from inside a popup: it was answered, it does not come back
  doc.addEventListener('submit', function (e) {
    var t = e.target;
    while (t && t !== doc) {
      if (t.getAttribute && t.getAttribute('data-cc-popup')) {
        var id = t.getAttribute('data-cc-popup');
        lset('cc_popup_' + id, JSON.stringify({ t: Date.now(), c: 1 }));
        return;
      }
      t = t.parentNode;
    }
  }, true);
})();
