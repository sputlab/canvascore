// The settings of a popup (shown instead of Page Settings while a popup is open in the editor): its name and status, how it looks, what makes it
// appear, and the rules that decide where, to whom and how often. The server checks every value again when the popup is saved (popups.php).
import React, { useEffect, useMemo, useState } from 'react';
import { AppWindow, Eye, Palette, MousePointerClick, ListFilter, Copy } from 'lucide-react';
import { PanelAccordion, ColorF } from './fields';
import { labelStyle, inputStyle } from './helpers';
import { withDefaults, POSITIONS, ANIMATIONS, FREQUENCIES, triggerSummary, rulesSummary } from '../../editor/popups';
import PopupPreview from '../PopupPreview';
import { notify } from '../../ui/notify';

const row = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer', margin: '8px 0' };
const hint = { fontSize: 11, color: '#94a3b8', margin: '4px 0 8px', lineHeight: 1.5 };

function Check({ label, checked, onChange }) {
  return <label style={row}><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}
function Num({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <label style={labelStyle}>{label}</label>
      <input type="number" aria-label={label} style={inputStyle} min={min} max={max} step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    </div>
  );
}
function Pick({ label, value, onChange, options }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <label style={labelStyle}>{label}</label>
      <select aria-label={label} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}
// A list of things to tick: the pages, or the collections
function Ticks({ label, items, chosen, onChange, empty }) {
  const [q, setQ] = useState('');
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div role="group" aria-label={label} style={{ margin: '8px 0' }}>
      <label style={labelStyle}>{label}</label>
      {items.length > 8 && <input aria-label={`Search ${label.toLowerCase()}`} style={{ ...inputStyle, marginBottom: 6 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />}
      <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px' }}>
        {items.length === 0 ? <p style={hint}>{empty}</p> : shown.map((i) => (
          <label key={i.id} style={{ ...row, margin: '4px 0' }}><input type="checkbox" checked={chosen.includes(i.id)} onChange={(e) => onChange(e.target.checked ? [...chosen, i.id] : chosen.filter((x) => x !== i.id))} /> {i.name}</label>
        ))}
      </div>
    </div>
  );
}

export default function PopupSettings({ ctx }) {
  const { activePage, updateActivePage, pages } = ctx;
  const s = useMemo(() => withDefaults(activePage.settings), [activePage.settings]);
  const [collections, setCollections] = useState([]);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('api.php?action=get_collections').then((r) => r.json()).then((d) => { if (alive && Array.isArray(d)) setCollections(d.map((c) => ({ id: c.id, name: c.name }))); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(s));
    let o = next; const keys = path.split('.');
    keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys[keys.length - 1]] = value;
    updateActivePage({ settings: next });
  };
  const livePages = (pages || []).filter((p) => !Number(p.is_draft_copy) && p.title).map((p) => ({ id: p.id, name: p.title }));
  const where = s.rules.where;
  const link = `#popup-${activePage.id}`;

  return (
    <div style={{ paddingBottom: 40, color: '#f8fafc' }}>
      <div style={{ padding: '15px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a', position: 'sticky', top: 0, zIndex: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', color: '#38bdf8' }}><AppWindow size={16} /> Popup settings</h3>
      </div>
      <div style={{ padding: 12 }}>
        <PanelAccordion title="Popup" icon={AppWindow} defaultOpen>
          <label style={labelStyle}>Name (only you see it)</label>
          <input aria-label="Popup name" style={inputStyle} value={activePage.title || ''} onChange={(e) => updateActivePage({ title: e.target.value })} />
          <Pick label="Status" value={activePage.status === 'published' ? 'published' : 'draft'} onChange={(v) => updateActivePage({ status: v })} options={[['draft', 'Draft (not on the site)'], ['published', 'Published (on the site at the next publish)']]} />
          <p style={hint} data-testid="popup-summary">{triggerSummary(s)} — {rulesSummary(s)}</p>
          <button type="button" onClick={() => setPreview(true)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}><Eye size={14} aria-hidden="true" /> Preview the popup</button>
        </PanelAccordion>

        <PanelAccordion title="Look" icon={Palette}>
          <Pick label="Where it appears" value={s.look.position} onChange={(v) => set('look.position', v)} options={POSITIONS} />
          <Num label="Width (px)" value={s.look.width} min={280} max={1100} step={10} onChange={(v) => set('look.width', v)} />
          <Pick label="Animation" value={s.look.animation} onChange={(v) => set('look.animation', v)} options={ANIMATIONS} />
          {s.look.position === 'center' && (
            <>
              <Check label="Dim the page behind it (overlay)" checked={s.look.overlay} onChange={(v) => set('look.overlay', v)} />
              {s.look.overlay && (
                <>
                  <ColorF label="Overlay color" value={s.look.overlayColor} allowTransparent={false} onChange={(v) => set('look.overlayColor', v)} />
                  <Num label="Overlay strength (%)" value={s.look.overlayOpacity} min={0} max={90} onChange={(v) => set('look.overlayOpacity', v)} />
                </>
              )}
            </>
          )}
          <ColorF label="Background" value={s.look.background} onChange={(v) => set('look.background', v)} />
          <Num label="Rounded corners (px)" value={s.look.radius} min={0} max={40} onChange={(v) => set('look.radius', v)} />
          <Num label="Space inside (px)" value={s.look.padding} min={0} max={80} onChange={(v) => set('look.padding', v)} />
          <Check label="Show the close button (×)" checked={s.look.closeButton} onChange={(v) => set('look.closeButton', v)} />
          {s.look.position === 'center' && s.look.overlay && <Check label="Close it when the visitor clicks outside" checked={s.look.closeOverlay} onChange={(v) => set('look.closeOverlay', v)} />}
          <Check label="Close it with the Esc key" checked={s.look.closeEsc} onChange={(v) => set('look.closeEsc', v)} />
        </PanelAccordion>

        <PanelAccordion title="What makes it appear" icon={MousePointerClick} defaultOpen>
          <p style={hint}>The first of these to happen shows it (if the rules below allow). One popup at a time.</p>
          <Check label="After some time on the page" checked={s.triggers.time.on} onChange={(v) => set('triggers.time.on', v)} />
          {s.triggers.time.on && <Num label="Seconds after the page opens" value={s.triggers.time.seconds} min={0} max={600} onChange={(v) => set('triggers.time.seconds', v)} />}
          <Check label="When the visitor has scrolled far enough" checked={s.triggers.scroll.on} onChange={(v) => set('triggers.scroll.on', v)} />
          {s.triggers.scroll.on && <Num label="Scrolled (% of the page)" value={s.triggers.scroll.percent} min={5} max={100} onChange={(v) => set('triggers.scroll.percent', v)} />}
          <Check label="When the visitor is about to leave (exit intent)" checked={s.triggers.exit.on} onChange={(v) => set('triggers.exit.on', v)} />
          {s.triggers.exit.on && <p style={hint}>The mouse leaves through the top of the window. This works with a mouse only: on phones and tablets use time or scroll as well.</p>}
          <Check label="When the visitor clicks a link to it" checked={s.triggers.click} onChange={(v) => set('triggers.click', v)} />
          {s.triggers.click && (
            <p style={hint}>Make a link or a button with the address <code data-testid="popup-link">{link}</code>
              {' '}<button type="button" aria-label="Copy the popup link" onClick={() => navigator.clipboard && navigator.clipboard.writeText(link).then(() => notify('Copied.'))} style={{ background: 'none', border: 0, color: '#38bdf8', cursor: 'pointer', padding: 0 }}><Copy size={12} aria-hidden="true" /></button>.
              It opens whatever the rules say.</p>
          )}
        </PanelAccordion>

        <PanelAccordion title="Display rules" icon={ListFilter} defaultOpen>
          <Pick label="Where" value={where.mode} onChange={(v) => set('rules.where.mode', v)} options={[['all', 'Everywhere'], ['include', 'Only on the pages and collections I choose'], ['exclude', 'Everywhere except the ones I choose']]} />
          {where.mode !== 'all' && (
            <>
              <Ticks label="Pages" items={livePages} chosen={where.pages} onChange={(v) => set('rules.where.pages', v)} empty="No pages yet." />
              <Ticks label="Collections (their items and listing pages)" items={collections} chosen={where.collections} onChange={(v) => set('rules.where.collections', v)} empty="No collections yet." />
            </>
          )}
          <label style={labelStyle}>Devices</label>
          <Check label="Computers" checked={s.rules.devices.desktop} onChange={(v) => set('rules.devices.desktop', v)} />
          <Check label="Tablets (768–1024 px wide)" checked={s.rules.devices.tablet} onChange={(v) => set('rules.devices.tablet', v)} />
          <Check label="Phones (up to 767 px wide)" checked={s.rules.devices.mobile} onChange={(v) => set('rules.devices.mobile', v)} />
          <Pick label="Visitors" value={s.rules.visitor} onChange={(v) => set('rules.visitor', v)} options={[['all', 'Everyone'], ['new', 'New visitors (first visit)'], ['returning', 'Returning visitors']]} />
          <Pick label="How often" value={s.rules.frequency.mode} onChange={(v) => set('rules.frequency.mode', v)} options={FREQUENCIES} />
          {s.rules.frequency.mode === 'days' && <Num label="Days before it can come back" value={s.rules.frequency.days} min={1} max={365} onChange={(v) => set('rules.frequency.days', v)} />}
          <p style={hint}>A popup the visitor answered (they sent a form in it) does not come back, unless it is set to every time. What it remembers stays in the visitor's own browser.</p>
          <label style={labelStyle}>Only between these dates (optional)</label>
          <input type="date" aria-label="Show from" style={{ ...inputStyle, marginBottom: 6 }} value={s.rules.schedule.from} onChange={(e) => set('rules.schedule.from', e.target.value)} />
          <input type="date" aria-label="Show until" style={inputStyle} value={s.rules.schedule.to} onChange={(e) => set('rules.schedule.to', e.target.value)} />
          <Num label="Priority (1 comes first)" value={s.rules.priority} min={1} max={99} onChange={(v) => set('rules.priority', v)} />
          <p style={hint}>When two popups are due together, the one with the lower number shows. Pages and collections are decided when you publish the site.</p>
        </PanelAccordion>
      </div>
      {preview && <PopupPreview blocks={ctx.blocks} settings={s} name={activePage.title} onClose={() => setPreview(false)} />}
    </div>
  );
}
