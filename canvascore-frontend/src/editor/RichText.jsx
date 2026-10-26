// CanvasCore rich text editor: one toolbar and one set of commands for every rich text field.
//  - On the canvas the block's own HTML is made editable in place (InlineRichText regions are
//    marked with data-cc-field by renderBlock): the text keeps exactly the size, spacing and
//    margins it has on the published page, and the toolbar floats above it without taking space.
//  - In the property panel, RichTextField is the same editor in a box with the toolbar on top.
// Commands use document.execCommand (contentEditable), so native undo/redo keeps working.
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript, Baseline, Highlighter, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, List, ListOrdered, Quote, Minus, Link, Unlink, Image as ImageIcon, Table, RemoveFormatting, Undo2, Redo2, Code,
  X, Check, Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import MediaPickerModal from '../components/MediaPickerModal';
import { tidyHtml } from './cleanHtml';
import { colorRef } from './palette';
import { pageLink } from './languages';
import { safeHtml } from '../utils/safeHtml';
import {
  TOOLSETS, BLOCK_FORMATS, FONTS, SIZES, TEXT_COLORS, HIGHLIGHTS, SITE_COLOR, TB_ATTR,
  exec, insertHtml, applyInlineStyle, setRegionHtml, closestIn, selectionNode, tableOp, tableHtml, escAttr, isInToolbar, useRegionHandlers,
} from './commands';
import { __ } from '../i18n/index.js';

let brandPromise = null;
function useBrandColor() {
  const [brand, setBrand] = useState('#3b82f6');
  useEffect(() => {
    let alive = true;
    if (!brandPromise) {
      brandPromise = fetch('api.php?action=get_settings').then((r) => r.json()).then((d) => (d && d.brandColor) || '#3b82f6').catch(() => '#3b82f6');
    }
    brandPromise.then((c) => { if (alive && typeof c === 'string') setBrand(c); });
    return () => { alive = false; };
  }, []);
  return brand;
}

// ---------------------------------------------------------------- toolbar

export function RichToolbar({ region, variant = 'full', floating = false, onCommit, onDone }) {
  const tools = TOOLSETS[variant] || TOOLSETS.full;
  const brand = useBrandColor();
  const pages = useStore((s) => s.pages) || [];
  const [state, setState] = useState({});
  const [open, setOpen] = useState(null);          // which popover is open
  const [pos, setPos] = useState(null);            // floating position
  const [picker, setPicker] = useState(false);     // media library for the image dialog
  const savedRange = useRef(null);
  const barRef = useRef(null);

  const saveRange = useCallback(() => {
    const s = window.getSelection();
    if (region && s && s.rangeCount && region.contains(s.anchorNode)) savedRange.current = s.getRangeAt(0).cloneRange();
  }, [region]);
  const restore = () => {
    if (!region) return;
    region.focus({ preventScroll: true });
    if (savedRange.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange.current); }
  };
  const run = (fn) => { restore(); fn(); refresh(); };

  // Active formats for the buttons
  const refresh = useCallback(() => {
    if (!region) return;
    const node = selectionNode();
    if (!node || !region.contains(node)) return;
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const block = closestIn(region, node, 'p, h1, h2, h3, h4, h5, h6, blockquote, pre');
    const link = closestIn(region, node, 'a');
    setState({
      bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), sub: q('subscript'), sup: q('superscript'),
      ul: q('insertUnorderedList'), ol: q('insertOrderedList'),
      left: q('justifyLeft'), center: q('justifyCenter'), right: q('justifyRight'), justify: q('justifyFull'),
      block: block ? block.tagName.toLowerCase() : 'p', link: !!link, table: !!closestIn(region, node, 'table'),
    });
    saveRange();
  }, [region, saveRange]);

  useEffect(() => {
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, [refresh]);

  // Floating placement: above the edited text, below it when there is no room, inside the viewport
  useEffect(() => {
    if (!floating || !region) return undefined;
    const place = () => {
      const r = region.getBoundingClientRect();
      const h = (barRef.current && barRef.current.offsetHeight) || 44;
      const w = (barRef.current && barRef.current.offsetWidth) || 600;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const vh = window.innerHeight || document.documentElement.clientHeight || 768;
      let top = r.top - h - 8;
      if (top < 8) top = r.bottom + 8 + h < vh ? r.bottom + 8 : 8;
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
      setPos({ top, left });
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro) ro.observe(region);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    region.addEventListener('input', place);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); region.removeEventListener('input', place); };
  }, [floating, region]);

  // Focus leaving both the toolbar and the text (e.g. after a dialog) ends the editing
  const onBlurCapture = (e) => {
    const to = e.relatedTarget;
    if (to && (isInToolbar(to) || (region && region.contains(to)))) return;
    if (picker) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (a && (isInToolbar(a) || (region && region.contains(a)))) return;
      setOpen(null);
      if (onDone) onDone();
    }, 0);
  };

  const keep = (e) => { if (!(e.target.closest('input, select, textarea, label'))) e.preventDefault(); }; // keeps the text selection
  const toggle = (name) => { saveRange(); setOpen((o) => (o === name ? null : name)); };

  const btn = (key, Icon, title, onClick, active) => (
    <button key={key} type="button" title={title} aria-label={title} aria-pressed={active ? 'true' : undefined} onClick={onClick}
      style={{ ...tbBtn, ...(active ? tbBtnOn : {}) }}><Icon size={15} /></button>
  );

  const items = [];
  tools.forEach((t, i) => { // eslint-disable-line react/refs -- builds handlers, refs are read only when clicked
    switch (t) {
      case '|': items.push(<span key={'sep' + i} style={sep} />); break;
      case 'block':
        items.push(
          <select key="block" title={__("Text style")} aria-label={__("Text style")} value={state.block || 'p'} style={tbSelect}
            onFocus={saveRange} onChange={(e) => { const v = e.target.value; run(() => exec('formatBlock', v === 'p' ? 'p' : v)); }}>
            {BLOCK_FORMATS[variant === 'basic' ? 'basic' : 'full'].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {!BLOCK_FORMATS.full.some(([v]) => v === state.block) && <option value={state.block}>{state.block}</option>}
          </select>,
        );
        break;
      case 'font':
        items.push(
          <select key="font" title={__("Font")} aria-label={__("Font")} value="" style={{ ...tbSelect, width: 96 }} onFocus={saveRange}
            onChange={(e) => { const v = e.target.value; run(() => applyInlineStyle(region, 'font-family', v)); e.target.value = ''; }}>
            <option value="" disabled hidden>{__("Font")}</option>
            {FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>,
        );
        break;
      case 'size':
        items.push(
          <select key="size" title={__("Text size")} aria-label={__("Text size")} value="" style={{ ...tbSelect, width: 84 }} onFocus={saveRange}
            onChange={(e) => { const v = e.target.value; run(() => applyInlineStyle(region, 'font-size', v)); e.target.value = ''; }}>
            <option value="" disabled hidden>{__("Size")}</option>
            {SIZES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>,
        );
        break;
      case 'bold': items.push(btn(t, Bold, __("Bold (Ctrl+B)"), () => run(() => exec('bold')), state.bold)); break;
      case 'italic': items.push(btn(t, Italic, __("Italic (Ctrl+I)"), () => run(() => exec('italic')), state.italic)); break;
      case 'underline': items.push(btn(t, Underline, __("Underline (Ctrl+U)"), () => run(() => exec('underline')), state.underline)); break;
      case 'strike': items.push(btn(t, Strikethrough, __("Strikethrough"), () => run(() => exec('strikeThrough')), state.strike)); break;
      case 'sub': items.push(btn(t, Subscript, __("Subscript"), () => run(() => exec('subscript')), state.sub)); break;
      case 'sup': items.push(btn(t, Superscript, __("Superscript"), () => run(() => exec('superscript')), state.sup)); break;
      case 'color': items.push(btn(t, Baseline, __("Text color"), () => toggle('color'), open === 'color')); break;
      case 'highlight': items.push(btn(t, Highlighter, __("Highlight"), () => toggle('highlight'), open === 'highlight')); break;
      case 'align':
        items.push(btn('al', AlignLeft, __("Align left"), () => run(() => exec('justifyLeft')), state.left && !state.center && !state.right && !state.justify));
        items.push(btn('ac', AlignCenter, __("Center"), () => run(() => exec('justifyCenter')), state.center));
        items.push(btn('ar', AlignRight, __("Align right"), () => run(() => exec('justifyRight')), state.right));
        if (variant !== 'basic') items.push(btn('aj', AlignJustify, __("Justify"), () => run(() => exec('justifyFull')), state.justify));
        break;
      case 'ul': items.push(btn(t, List, __("Bulleted list"), () => run(() => exec('insertUnorderedList')), state.ul)); break;
      case 'ol': items.push(btn(t, ListOrdered, __("Numbered list"), () => run(() => exec('insertOrderedList')), state.ol)); break;
      case 'quote': items.push(btn(t, Quote, __("Quote"), () => run(() => exec('formatBlock', state.block === 'blockquote' ? 'p' : 'blockquote')), state.block === 'blockquote')); break;
      case 'hr': items.push(btn(t, Minus, __("Horizontal line"), () => run(() => exec('insertHorizontalRule')))); break;
      case 'link': items.push(btn(t, Link, __("Link (Ctrl+K)"), () => toggle('link'), open === 'link' || state.link)); break;
      case 'image': items.push(btn(t, ImageIcon, __("Image"), () => toggle('image'), open === 'image')); break;
      case 'table': items.push(btn(t, Table, __("Table"), () => toggle('table'), open === 'table' || state.table)); break;
      case 'clear': items.push(btn(t, RemoveFormatting, __("Clear formatting"), () => run(() => { exec('removeFormat'); exec('unlink'); if (state.block !== 'p') exec('formatBlock', 'p'); }))); break;
      case 'undo': items.push(btn(t, Undo2, __("Undo (Ctrl+Z)"), () => run(() => exec('undo')))); break;
      case 'redo': items.push(btn(t, Redo2, __("Redo (Ctrl+Shift+Z)"), () => run(() => exec('redo')))); break;
      case 'source': items.push(btn(t, Code, __("Edit HTML"), () => toggle('source'), open === 'source')); break;
      default: break;
    }
  });

  // Ctrl/Cmd+K opens the link dialog from the text
  useEffect(() => {
    if (!region || !tools.includes('link')) return undefined;
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); saveRange(); setOpen('link'); } };
    region.addEventListener('keydown', k);
    return () => region.removeEventListener('keydown', k);
  });

  const close = () => { setOpen(null); restore(); };
  const popover = open && (
    <div style={popStyle} role="dialog" aria-label={POP_LABEL[open]}>
      {open === 'color' && <ColorPop brand={brand} colors={TEXT_COLORS} label={__("Text color")}
        onPick={(c) => { run(() => applyInlineStyle(region, 'color', c)); setOpen(null); }} />}
      {open === 'highlight' && <ColorPop brand={brand} colors={HIGHLIGHTS} label={__("Highlight")} highlight
        onPick={(c) => { run(() => applyInlineStyle(region, 'background-color', c)); setOpen(null); }} />}
      {open === 'link' && <LinkPop region={region} pages={pages} savedRange={savedRange} onClose={close}
        onApply={(fn) => { run(fn); setOpen(null); }} />}
      {open === 'image' && <ImagePop onPickLibrary={() => setPicker(true)} onClose={close}
        onInsert={(src, alt) => { run(() => insertHtml(`<img src="${escAttr(src)}" alt="${escAttr(alt)}" style="max-width:100%; height:auto;">`)); setOpen(null); }}
      />}
      {open === 'table' && <TablePop inTable={state.table} onClose={close}
        onInsert={(r, c, h) => { run(() => insertHtml(tableHtml(r, c, h))); setOpen(null); }}
        onOp={(op) => { run(() => tableOp(region, op)); if (op === 'del-table') setOpen(null); }} />}
      {open === 'source' && <SourcePop html={tidyHtml(region ? region.innerHTML : '')} onClose={close}
        onApply={(html) => { setRegionHtml(region, html); setOpen(null); if (onCommit) onCommit(); }} />}
    </div>
  );

  const bar = (
    <div ref={barRef} {...TB_ATTR} onMouseDown={keep} onBlurCapture={onBlurCapture} role="toolbar" aria-label={__("Text formatting")}
      style={floating ? { ...barStyle, position: 'fixed', top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, zIndex: 100000, maxWidth: 'calc(100vw - 16px)' } : { ...barStyle, position: 'relative', borderRadius: '6px 6px 0 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px' }}>{items}</div>
      {popover}
      {picker && (
        <MediaPickerModal onClose={() => setPicker(false)} onSelect={(url, alt) => {
          setPicker(false);
          setOpen(null);
          run(() => insertHtml(`<img src="${escAttr(url)}" alt="${escAttr(alt || '')}" style="max-width:100%; height:auto;">`));
        }} />
      )}
    </div>
  );
  return floating ? createPortal(bar, document.body) : bar;
}

const POP_LABEL = { color: __("Text color"), highlight: __("Highlight"), link: __("Link"), image: __("Image"), table: __("Table"), source: __("Edit HTML") };

function ColorPop({ brand, colors, label, highlight, onPick }) {
  const [custom, setCustom] = useState(highlight ? '#fef08a' : '#0f172a');
  // the global colours (Global Options): the text follows them when the palette changes
  const palette = useStore((s) => s.palette);
  const loadPalette = useStore((s) => s.loadPalette);
  useEffect(() => { if (!palette) loadPalette(); }, [palette, loadPalette]);
  return (
    <div>
      <div style={popTitle}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: 236 }}>
        <button type="button" title={__("Site color (follows the brand color)")} aria-label={__("Site color")} onClick={() => onPick(SITE_COLOR)}
          style={{ ...swatch, background: brand, width: 'auto', padding: '0 8px', color: '#fff', fontSize: 11, fontWeight: 700 }}>{__("Site")}</button>
        {colors.map((c) => <button key={c} type="button" title={c} aria-label={c} onClick={() => onPick(c)} style={{ ...swatch, background: c }} />)}
      </div>
      {palette && palette.length > 0 && (
        <div className="cc-rte-palette" role="group" aria-label={__("Global colours")} style={{ marginTop: 8 }}>
          <div style={{ ...popTitle, marginBottom: 4 }}>{__("Global colours")}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: 236 }}>
            {palette.map((c) => <button key={c.id} type="button" title={__("{0} (follows Global Options)", c.name)} aria-label={__("{0} (global colour)", c.name)} onClick={() => onPick(colorRef(c))} style={{ ...swatch, background: c.value }} />)}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: 8 }}>
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={__("Custom color")} style={{ width: 30, height: 26, padding: 0, border: 'none', background: 'none' }} />
        <button type="button" onClick={() => onPick(custom)} style={popBtn}>{__("Apply")}</button>
        <button type="button" onClick={() => onPick('')} style={{ ...popBtn, background: '#fff', color: '#334155', border: '1px solid #cbd5e1' }}>{highlight ? __("None") : __("Default")}</button>
      </div>
    </div>
  );
}

const pageUrl = (p, langs) => pageLink(p, langs);

function LinkPop({ region, pages, savedRange, onApply, onClose }) {
  // The link under the caret (if any), read once when the dialog opens
  const [start] = useState(() => {
    const r = savedRange.current;
    const a = r ? closestIn(region, r.startContainer, 'a') : null;
    return {
      a, href: a ? a.getAttribute('href') || '' : '', blank: a ? a.getAttribute('target') === '_blank' : false,
      nofollow: a ? /\bnofollow\b/.test(a.getAttribute('rel') || '') : false, text: r ? r.toString() : '',
    };
  });
  const [href, setHref] = useState(start.href);
  const [blank, setBlank] = useState(start.blank);
  const [nofollow, setNofollow] = useState(start.nofollow);
  const [text, setText] = useState(start.text);
  const live = pages.filter((p) => !Number(p.is_draft_copy));
  const langs = useStore((s) => s.languages);

  const apply = () => {
    const url = href.trim();
    if (!url || /^(javascript|vbscript|data):/i.test(url)) return;
    onApply(() => {
      let a = start.a;
      if (!a) {
        const sel = window.getSelection();
        if (sel.isCollapsed) insertHtml(`<a href="${escAttr(url)}">${escAttr(text || url)}</a>`);
        else exec('createLink', url);
        const n = window.getSelection().anchorNode;
        a = closestIn(region, n, 'a') || [...region.querySelectorAll('a')].find((x) => x.getAttribute('href') === url);
      }
      if (!a) return;
      a.setAttribute('href', url);
      const rel = [];
      if (blank) { a.setAttribute('target', '_blank'); rel.push('noopener'); } else a.removeAttribute('target');
      if (nofollow) rel.push('nofollow');
      if (rel.length) a.setAttribute('rel', rel.join(' ')); else a.removeAttribute('rel');
    });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); apply(); }} style={{ width: 280 }}>
      <div style={popTitle}>{__("Link")}</div>
      <label style={popLabel}>{__("Address")}</label>
      <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder={__("https://… or choose a page")} style={popInput} aria-label={__("Link address")} />
      {live.length > 0 && (
        <select value="" onChange={(e) => { if (e.target.value) setHref(e.target.value); }} style={{ ...popInput, marginTop: 6 }} aria-label={__("Link to a page")}>
          <option value="">{__("Link to a page…")}</option>
          {live.map((p) => <option key={p.id} value={pageUrl(p, langs)}>{p.title || p.slug}{langs && langs.enabled && p.lang ? ` (${p.lang.toUpperCase()})` : ''}</option>)}
        </select>
      )}
      {!start.a && !start.text && (
        <>
          <label style={popLabel}>{__("Text")}</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={__("Shown text (default: the address)")} style={popInput} aria-label={__("Link text")} />
        </>
      )}
      <label style={popCheck}><input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} /> {__("Open in a new tab")}</label>
      <label style={popCheck}><input type="checkbox" checked={nofollow} onChange={(e) => setNofollow(e.target.checked)} /> {__("Nofollow (search engines ignore it)")}</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="submit" style={popBtn}><Check size={13} /> {__("Apply")}</button>
        {start.a && <button type="button" onClick={() => onApply(() => { const a = start.a; const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(a); sel.removeAllRanges(); sel.addRange(r); exec('unlink'); })}
          style={{ ...popBtn, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' }}><Unlink size={13} /> {__("Remove")}</button>}
        <button type="button" onClick={onClose} style={{ ...popBtn, background: 'transparent', color: '#64748b', marginLeft: 'auto' }}>{__("Cancel")}</button>
      </div>
    </form>
  );
}

function ImagePop({ onPickLibrary, onInsert, onClose }) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (src.trim()) onInsert(src.trim(), alt); }} style={{ width: 280 }}>
      <div style={popTitle}>{__("Image")}</div>
      <button type="button" onClick={onPickLibrary} style={{ ...popBtn, width: '100%', justifyContent: 'center', padding: '8px' }}><ImageIcon size={14} /> {__("Choose from the media library")}</button>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', margin: '8px 0' }}>{__("or use an address")}</div>
      <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder={__("https://…/photo.jpg")} style={popInput} aria-label={__("Image address")} />
      <label style={popLabel}>{__("Description (alt text)")}</label>
      <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={__("What the image shows")} style={popInput} aria-label={__("Image description")} />
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="submit" disabled={!src.trim()} style={popBtn}>{__("Insert")}</button>
        <button type="button" onClick={onClose} style={{ ...popBtn, background: 'transparent', color: '#64748b', marginLeft: 'auto' }}>{__("Cancel")}</button>
      </div>
    </form>
  );
}

function TablePop({ inTable, onInsert, onOp, onClose }) {
  const [hover, setHover] = useState([3, 3]);
  const [header, setHeader] = useState(true);
  if (inTable) {
    const ops = [['row-above', __("Row above")], ['row-below', __("Row below")], ['col-left', __("Column left")], ['col-right', __("Column right")],
      ['header', __("Toggle header row")], ['del-row', __("Delete row")], ['del-col', __("Delete column")]];
    return (
      <div style={{ width: 230 }}>
        <div style={popTitle}>{__("Table")}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {ops.map(([op, l]) => <button key={op} type="button" onClick={() => onOp(op)} style={{ ...popBtn, background: op.startsWith('del') ? '#fff' : '#f1f5f9', color: op.startsWith('del') ? '#b91c1c' : '#0f172a', border: '1px solid ' + (op.startsWith('del') ? '#fecaca' : '#e2e8f0'), justifyContent: 'center' }}>{l}</button>)}
          <button type="button" onClick={() => onOp('del-table')} style={{ ...popBtn, gridColumn: '1 / -1', justifyContent: 'center', background: '#b91c1c' }}><Trash2 size={13} /> {__("Delete table")}</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={popTitle}>{__("Insert table ·")} {hover[0]} × {hover[1]}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 18px)', gap: 3 }} onMouseLeave={() => {}}>
        {Array.from({ length: 36 }, (_, i) => {
          const r = Math.floor(i / 6) + 1, c = (i % 6) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return <button key={i} type="button" aria-label={__("{0} by {1}", r, c)} onMouseEnter={() => setHover([r, c])} onFocus={() => setHover([r, c])} onClick={() => onInsert(r, c, header)}
            style={{ width: 18, height: 18, padding: 0, border: '1px solid ' + (on ? '#2563eb' : '#cbd5e1'), background: on ? '#bfdbfe' : '#fff', borderRadius: 3, cursor: 'pointer' }} />;
        })}
      </div>
      <label style={popCheck}><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> {__("First row is a header")}</label>
      <button type="button" onClick={onClose} style={{ ...popBtn, background: 'transparent', color: '#64748b' }}><X size={13} /> {__("Cancel")}</button>
    </div>
  );
}

function SourcePop({ html, onApply, onClose }) {
  const [code, setCode] = useState(html);
  return (
    <div style={{ width: 'min(560px, calc(100vw - 48px))' }}>
      <div style={popTitle}>{__("Edit HTML")}</div>
      <textarea autoFocus value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label={__("HTML source")}
        style={{ width: '100%', minHeight: 180, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" onClick={() => onApply(code)} style={popBtn}><Check size={13} /> {__("Apply")}</button>
        <button type="button" onClick={onClose} style={{ ...popBtn, background: 'transparent', color: '#64748b', marginLeft: 'auto' }}>{__("Cancel")}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panel field

// The same editor in a box (property panel). Saves on blur, like the canvas.
export function RichTextField({ value, onChange, variant = 'full', label, minHeight = 70 }) {
  const ref = useRef(null);
  const [el, setEl] = useState(null);
  const [active, setActive] = useState(false);
  const handlers = useRegionHandlers(variant);
  const last = useRef(value || '');

  // External changes (canvas edits, undo of the page) refresh the box when it is not being edited.
  // Layout effect: the content is in place before the first paint (no empty flash).
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (document.activeElement !== node && node.innerHTML !== (value || '')) node.innerHTML = safeHtml(value || '');
    last.current = value || '';
  }, [value]);
  useEffect(() => { setEl(ref.current); }, []);

  const commit = () => {
    const node = ref.current;
    if (!node) return;
    const html = tidyHtml(node.innerHTML);
    if (html !== last.current) { last.current = html; onChange(html); }
  };

  return (
    <div style={{ marginBottom: 10 }} onFocus={() => setActive(true)}
      onBlur={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setActive(false); commit(); }}>
      {active && <RichToolbar region={el} variant={variant} onCommit={commit} onDone={() => { setActive(false); commit(); }} />}
      <div ref={ref} className="cc-rte-field" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        {...handlers}
        style={{ minHeight, padding: '8px 10px', background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: active ? '0 0 6px 6px' : 6, fontSize: 14, lineHeight: 1.5, outline: 'none', overflowWrap: 'anywhere', cursor: 'text' }} />
    </div>
  );
}

// ---------------------------------------------------------------- canvas regions

// The block's canonical HTML with its text fields editable in place (data-cc-field + contenteditable,
// see renderBlock(block, { fields: true })). `variants` maps field → toolbar; `onCommit(field, html)`
// runs when a field loses focus with changed content. `initialPoint` puts the caret where the user
// clicked to select the block.
export function InlineRegions({ html, variants, onCommit, initialPoint, style }) {
  const ref = useRef(null);
  const [active, setActive] = useState(null);       // { el, field }
  const activeRef = useRef(null);
  const start = useRef('');
  const handlers = useRegionHandlers(() => (activeRef.current ? variants[activeRef.current.field] : 'full'));

  const finish = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    activeRef.current = null;
    setActive(null);
    const out = tidyHtml(a.el.innerHTML);
    if (out !== start.current) onCommit(a.field, out);
  }, [onCommit]);

  const onFocus = (e) => {
    const el = e.target.closest && e.target.closest('[data-cc-field]');
    if (!el || !ref.current.contains(el)) return;
    if (activeRef.current && activeRef.current.el === el) return;
    if (activeRef.current) finish();
    start.current = tidyHtml(el.innerHTML);
    moving.current = false;
    activeRef.current = { el, field: el.getAttribute('data-cc-field') };
    setActive(activeRef.current);
  };
  const moving = useRef(false);                      // focus is moving to another field of this block
  const onBlur = (e) => {
    const el = e.target.closest && e.target.closest('[data-cc-field]');
    if (!el || !activeRef.current || activeRef.current.el !== el) return;
    if (isInToolbar(e.relatedTarget)) return;            // moving into the toolbar or one of its dialogs
    const next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-cc-field]');
    moving.current = !!(next && ref.current && ref.current.contains(next));
    finish();
  };

  // The HTML is put in by hand, not with dangerouslySetInnerHTML: committing one field (e.g. the Hero title)
  // while the caret already moved to another (the subtitle) must not rebuild the DOM under the caret.
  // The DOM already shows a committed edit; it is refreshed once nothing is being edited.
  const shown = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current || html === shown.current) return;
    if (shown.current !== null && (activeRef.current || moving.current)) return;   // refreshed when editing stops
    ref.current.innerHTML = safeHtml(html);
    shown.current = html;
  }, [html, active]);

  // Caret at the point of the click that selected the block
  useLayoutEffect(() => {
    if (!initialPoint || !ref.current) return;
    const { x, y } = initialPoint;
    const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y)
      : (document.caretPositionFromPoint ? (() => { const p = document.caretPositionFromPoint(x, y); if (!p) return null; const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; })() : null);
    const node = range && range.startContainer;
    const field = node && (node.nodeType === 1 ? node : node.parentNode).closest && (node.nodeType === 1 ? node : node.parentNode).closest('[data-cc-field]');
    if (!field || !ref.current.contains(field)) return;
    field.focus({ preventScroll: true });
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }, [initialPoint]);

  // Leaving the block (deselect, page change) while typing still saves
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; }, [finish]);
  useEffect(() => () => finishRef.current(), []);

  return (
    <>
      <div ref={ref} className="cc-rte-host" style={style} onFocus={onFocus} onBlur={onBlur} {...handlers}
        onClick={(e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }} />
      {active && <RichToolbar floating region={active.el} variant={variants[active.field] || 'full'} onCommit={finish} onDone={finish} />}
    </>
  );
}

// ---------------------------------------------------------------- styles

const barStyle = { background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(15,23,42,.18)', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box' };
const tbBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', color: '#334155', borderRadius: 5, cursor: 'pointer' };
const tbBtnOn = { background: '#dbeafe', color: '#1d4ed8' };
const tbSelect = { height: 28, fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', color: '#0f172a', padding: '0 4px', cursor: 'pointer', width: 108 };
const sep = { width: 1, height: 20, background: '#e2e8f0', margin: '0 3px' };
const popStyle = { position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, boxShadow: '0 12px 30px rgba(15,23,42,.22)', zIndex: 2, fontSize: 12 };
const popTitle = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748b', marginBottom: 8 };
const popLabel = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', margin: '8px 0 4px' };
const popInput = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 5, color: '#0f172a', background: '#fff' };
const popCheck = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 8, color: '#334155', cursor: 'pointer' };
const popBtn = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 5, background: '#2563eb', color: '#fff', cursor: 'pointer' };
const swatch = { width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(15,23,42,.15)', cursor: 'pointer', padding: 0 };

