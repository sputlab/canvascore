// Rich text editor: toolbars, formats and the commands behind the buttons (shared by RichText.jsx).
import { useCallback, useRef } from 'react';
import { cleanPastedHtml, textToHtml, TABLE_STYLE, CELL_STYLE } from './cleanHtml';
import { safeHtml } from '../utils/safeHtml';
import { __ } from '../i18n/index.js';

// Toolbars: 'basic' for titles and short texts, 'full' for body text.
export const TOOLSETS = {
  basic: ['block', '|', 'bold', 'italic', 'underline', '|', 'color', 'highlight', '|', 'align', '|', 'link', 'clear', '|', 'undo', 'redo', 'source'],
  full: ['block', 'font', 'size', '|', 'bold', 'italic', 'underline', 'strike', 'sub', 'sup', '|', 'color', 'highlight', '|', 'align',
    'ul', 'ol', 'quote', 'hr', '|', 'link', 'image', 'table', '|', 'clear', 'undo', 'redo', 'source'],
};

export const BLOCK_FORMATS = {
  basic: [['p', __("Paragraph")], ['h1', __("Heading 1")], ['h2', __("Heading 2")], ['h3', __("Heading 3")], ['h4', __("Heading 4")]],
  full: [['p', __("Paragraph")], ['h1', __("Heading 1")], ['h2', __("Heading 2")], ['h3', __("Heading 3")], ['h4', __("Heading 4")], ['blockquote', __("Quote")], ['pre', __("Code block")]],
};
export const FONTS = [
  ['', __("Theme font")],
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'Sans serif'],
  ['Georgia, "Times New Roman", serif', 'Serif'],
  ['ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', 'Monospace'],
];
// Relative sizes: they scale with the theme instead of fixing pixels
export const SIZES = [['', __("Normal")], ['0.875em', __("Small")], ['1.25em', __("Large")], ['1.5em', __("Extra large")], ['2em', __("Huge")]];
export const TEXT_COLORS = ['#0f172a', '#334155', '#64748b', '#94a3b8', '#ffffff', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
export const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff', '#e2e8f0'];
// The site color follows the brand color set in Global Settings, also if it changes later
export const SITE_COLOR = 'var(--brand-color, #3b82f6)';

// ---------------------------------------------------------------- commands

export const exec = (cmd, value = null) => { try { return document.execCommand(cmd, false, value); } catch { return false; } };

// Inserts HTML at the caret; falls back to a Range insert where the browser refuses insertHTML
export function insertHtml(html) {
  html = safeHtml(html);
  if (exec('insertHTML', html)) return true;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const last = tpl.content.lastChild;
  range.insertNode(tpl.content);
  if (last) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
  return true;
}

// Applies an inline CSS property to the selection (or removes it with value ''):
// marks the selection with a temporary <font face>, then turns it into a styled <span>.
export function applyInlineStyle(region, prop, value) {
  exec('styleWithCSS', false);
  if (!exec('fontName', 'cc-mark')) return;
  for (const f of [...region.querySelectorAll('font[face="cc-mark"]')]) {
    f.querySelectorAll('span').forEach((s) => { s.style.removeProperty(prop); if (!s.getAttribute('style')) s.removeAttribute('style'); });
    if (value) {
      const span = document.createElement('span');
      span.style.setProperty(prop, value);
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    } else {
      while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f);
      f.remove();
    }
  }
  // a parent span carrying the same property would still color the text when removing it
  if (!value) {
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    while (n && n !== region) {
      if (n.nodeType === 1 && n.tagName === 'SPAN' && n.style.getPropertyValue(prop) && sel.containsNode(n, true)) {
        n.style.removeProperty(prop);
        if (!n.getAttribute('style')) n.removeAttribute('style');
      }
      n = n.parentNode;
    }
  }
}

export const closestIn = (region, node, selector) => {
  let n = node && (node.nodeType === 1 ? node : node.parentNode);
  while (n && n !== region) { if (n.matches && n.matches(selector)) return n; n = n.parentNode; }
  return null;
};
export const selectionNode = () => { const s = window.getSelection(); return s && s.rangeCount ? s.anchorNode : null; };

const caretInto = (el) => {
  if (!el) return;
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
};

// Table operations on the cell that holds the caret
export function tableOp(region, op) {
  const cell = closestIn(region, selectionNode(), 'td, th');
  const table = cell && closestIn(region, cell, 'table');
  if (!table) return false;
  const row = cell.parentNode;
  const index = [...row.children].indexOf(cell);
  const rows = [...table.querySelectorAll('tr')];
  const newCell = (tag) => { const c = document.createElement(tag); c.setAttribute('style', CELL_STYLE); c.innerHTML = '<br>'; return c; };
  if (op === 'row-above' || op === 'row-below') {
    const tr = document.createElement('tr');
    [...row.children].forEach(() => tr.appendChild(newCell('td')));
    row.parentNode.insertBefore(tr, op === 'row-above' ? row : row.nextSibling);
  } else if (op === 'col-left' || op === 'col-right') {
    rows.forEach((r) => {
      const ref = r.children[index];
      const c = newCell(ref && ref.tagName === 'TH' ? 'th' : 'td');
      r.insertBefore(c, op === 'col-left' ? ref || null : (ref ? ref.nextSibling : null));
    });
  } else if (op === 'del-row') {
    if (rows.length <= 1) table.remove();
    else {
      const next = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
      row.remove();
      caretInto(next.children[Math.min(index, next.children.length - 1)]);
    }
  } else if (op === 'del-col') {
    if (row.children.length <= 1) table.remove();
    else {
      rows.forEach((r) => r.children[index] && r.children[index].remove());
      caretInto(row.children[Math.min(index, row.children.length - 1)]);
    }
  } else if (op === 'del-table') {
    table.remove();
  } else if (op === 'header') {
    const first = rows[0];
    const toTh = ![...first.children].every((c) => c.tagName === 'TH');
    [...first.children].forEach((c) => {
      const n = document.createElement(toTh ? 'th' : 'td');
      for (const a of [...c.attributes]) n.setAttribute(a.name, a.value);
      while (c.firstChild) n.appendChild(c.firstChild);
      c.replaceWith(n);
    });
  }
  return true;
}

export function tableHtml(rows, cols, header) {
  const cell = (tag) => `<${tag} style="${CELL_STYLE}"><br></${tag}>`;
  let html = `<table style="${TABLE_STYLE}"><tbody>`;
  for (let r = 0; r < rows; r++) html += '<tr>' + Array.from({ length: cols }, () => cell(header && r === 0 ? 'th' : 'td')).join('') + '</tr>';
  return html + '</tbody></table><p><br></p>';
}

// Replaces the edited text (HTML source dialog)
export function setRegionHtml(region, html) { if (region) region.innerHTML = safeHtml(html); }

export const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ---------------------------------------------------------------- editable region behavior

// Paste / drop: cleaned HTML (or plain text with Ctrl/Cmd+Shift+V) inserted at the caret.
// `variant` can be a function (the canvas edits fields with different toolbars).
export function useRegionHandlers(variant) {
  const plainNext = useRef(false);
  const onKeyDown = useCallback((e) => {
    e.stopPropagation(); // the editor's global shortcuts (undo of the page...) must not fire while typing
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) plainNext.current = true;
  }, []);
  const insertFrom = useCallback((data) => {
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    const plain = plainNext.current; plainNext.current = false;
    const v = typeof variant === 'function' ? variant() : variant;
    let out = html && !plain ? cleanPastedHtml(html) : textToHtml(text, { inline: v === 'basic' });
    // a single paragraph goes into the current line instead of nesting a <p> inside it
    const one = out.match(/^<p>([\s\S]*)<\/p>$/);
    if (one && !one[1].includes('<p')) out = one[1];
    if (out) insertHtml(out);
  }, [variant]);
  const onPaste = useCallback((e) => {
    if (!e.clipboardData) return;
    e.preventDefault();
    insertFrom(e.clipboardData);
  }, [insertFrom]);
  const onDrop = useCallback((e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    e.preventDefault();
    if (dt.files && dt.files.length) return; // images go through the media library
    const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); }
    insertFrom(dt);
  }, [insertFrom]);
  return { onKeyDown, onPaste, onDrop };
}

export const TB_ATTR = { 'data-cc-rte-toolbar': '' };
export const isInToolbar = (node) => !!(node && node.closest && node.closest('[data-cc-rte-toolbar]'));

