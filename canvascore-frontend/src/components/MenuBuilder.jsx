import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDraftSync } from '../session/hooks';
import { useStore } from '../store/useStore';
import { paletteCss } from '../editor/palette';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Save, Trash2, ListTree, Palette, Smartphone, LayoutPanelTop, Monitor, SwatchBook, Undo2, Check,
  ArrowUp, ArrowDown, IndentIncrease, IndentDecrease, Plus, GripVertical, Image as ImageIcon, Sparkles, Upload, Type
} from 'lucide-react';
import { Button, PageHeader } from '../ui/kit';
import { notify } from '../ui/notify';
import { DEFAULT_SETTINGS, BURGER_ICONS, EFFECT_GROUPS, THEMES, applyTheme, matchingTheme, normalizeSettings, toggleEffect, cleanEffects } from '../menu/menuThemes';
import { confirmDialog } from '../ui/dialog';
import { isMultilingual, langOf, langName, pageFile } from '../editor/languages';

// ---- tree utilities (immutable) ----
const clone = (t) => JSON.parse(JSON.stringify(t));
const newNode = () => ({ id: 'm_' + Date.now() + Math.floor(Math.random() * 1000), title: 'New Link', url: '', children: [] });

function locate(list, id, parent = null) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { list, index: i, parent };
    const r = locate(list[i].children || [], id, list[i]);
    if (r) return r;
  }
  return null;
}

// backward compat: converts a legacy flat format (parentId) into a tree
function flatToTree(list) {
  if (!list.length) return [];
  const nested = list.some(it => Object.prototype.hasOwnProperty.call(it, 'children'));
  if (nested) return list.map(it => ({ ...it, url: it.url === '#' ? '' : (it.url || ''), children: flatToTree(it.children || []) }));
  const map = {}; list.forEach(it => map[it.id] = { ...it, url: it.url === '#' ? '' : (it.url || ''), children: [] });
  const roots = [];
  list.forEach(it => { const n = map[it.id]; if (it.parentId && map[it.parentId]) map[it.parentId].children.push(n); else roots.push(n); });
  return roots;
}

export default function MenuBuilder() {
  const { pages, publishSiteAsync } = useStore();
  // Languages: the default language's menu, and the menus of the languages that have one of their own (code => tree; the others use the default's)
  const langs = useStore((st) => st.languages);
  const multi = isMultilingual(langs);
  const [defaultItems, setDefaultItems] = useState([]);
  const [langMenus, setLangMenus] = useState({});
  const [menuLang, setMenuLang] = useState('');
  const lang = multi && menuLang && langs.list.some((l) => l.code === menuLang) ? menuLang : '';
  const items = lang ? (langMenus[lang] || []) : defaultItems;      // the menu being edited
  const setItems = (v) => { if (lang) setLangMenus((m) => ({ ...m, [lang]: v })); else setDefaultItems(v); };
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  // Saving before the data arrives (or after it failed) would overwrite the site's data with defaults
  const [loadState, setLoadState] = useState('loading');
  // Local backup of unsaved work (see src/session/)
  const draftValue = useMemo(() => ({ items: defaultItems, langs: langMenus, settings }), [defaultItems, langMenus, settings]);
  const draft = useDraftSync('menu', draftValue);
  const [restoredAt, setRestoredAt] = useState(null);
  const [tab, setTab] = useState('structure');
  const [device, setDevice] = useState('desktop');
  const [themeUndo, setThemeUndo] = useState(null); // { name, settings } of the last theme applied
  const set = (patch) => setSettings(s => ({ ...s, ...patch }));
  const effectsOn = cleanEffects(settings.effects);
  const activeTheme = matchingTheme(settings);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const logoInputRef = useRef(null);

  // Up/down arrows to adjust the numeric radius
  // The pages a link of this menu can point to: the pages of its language
  const menuPages = pages.filter((p) => !Number(p.is_draft_copy) && (!multi || langOf(p, langs) === (lang || langs.default)));
  const radiusKey = (e) => {
    const m = String(settings.borderRadius || '').match(/^(\d+)(px|rem|em|%)?$/);
    if (!m) return;
    let n = parseInt(m[1], 10); const unit = m[2] || 'px';
    if (e.key === 'ArrowUp') { e.preventDefault(); n += 1; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); n = Math.max(0, n - 1); }
    else return;
    setSettings({ ...settings, borderRadius: n + unit });
  };

  // Upload the logo to the media manager; uses the returned URL
  const uploadLogo = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('api.php?action=upload_media', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.url) setSettings(s => ({ ...s, logoUrl: data.url }));
      else notify(data.message || 'Upload failed.', 'error');
    } catch { notify('Upload error.', 'error'); }
  };

  // Item border presets
  const BORDER_PRESETS = [
    { label: 'None', value: 'none' },
    { label: 'Thin solid', value: '1px solid #e2e8f0' },
    { label: 'Solid', value: '2px solid #cbd5e1' },
    { label: 'Dashed', value: '1px dashed #cbd5e1' },
    { label: 'Dotted', value: '2px dotted #cbd5e1' },
  ];
  const isCustomBorder = !BORDER_PRESETS.some(b => b.value === (settings.itemBorder || 'none'));

  useEffect(() => {
    fetch('api.php?action=get_menu')
      .then(res => res.json())
      .then(data => {
        let loaded = []; let loadedSettings = DEFAULT_SETTINGS;
        if (data && !Array.isArray(data)) { loaded = data.items || []; loadedSettings = normalizeSettings(data.settings); }
        else if (Array.isArray(data)) loaded = data;
        const loadedLangs = {};
        if (data && data.langs && typeof data.langs === 'object') for (const [c, m] of Object.entries(data.langs)) if (m && Array.isArray(m.items) && m.items.length) loadedLangs[c] = flatToTree(m.items);
        const server = { items: flatToTree(loaded), langs: loadedLangs, settings: loadedSettings };
        // If an unsaved local draft exists (expired session, refresh...) it is re-applied
        const pending = draft.loaded(server);
        const v = pending ? pending.value : server;
        setSettings(normalizeSettings(v.settings)); setDefaultItems(v.items); setLangMenus(v.langs || {});
        if (pending) setRestoredAt(pending.savedAt);
        setLoadState('ready');
      })
      .catch(() => { setLoadState('error'); notify('Could not load the menu from the server. Reload the page before saving.', 'error'); });
  }, [draft]);

  const saveMenu = async () => {
    if (loadState !== 'ready') return;
    setIsSaving(true);
    try {
      // (a language's own menu is saved only when it has items: an empty one means "use the default menu")
      const langsOut = {};
      for (const [c, tree] of Object.entries(langMenus)) if (tree && tree.length) langsOut[c] = { items: tree };
      const r = await fetch('api.php?action=save_menu', { method: 'POST', body: JSON.stringify({ items: defaultItems, settings, ...(multi ? { langs: langsOut } : {}) }) });
      const saved = await r.json();
      if (!saved || !saved.success) {
        notify('Menu NOT saved: ' + ((saved && saved.message) || 'unexpected response') + '\nYour changes are still here and backed up on this device.', 'error');
        setIsSaving(false);
        return;
      }
      draft.saved({ items: defaultItems, langs: langMenus, settings });
      setRestoredAt(null);
      const res = await publishSiteAsync();
      if (res && res.success) notify('Menu saved and site updated.');
      else notify('Menu saved, but auto-publish had an issue.', 'error');
    } catch { notify('Error saving menu. Your changes are still here and backed up on this device.', 'error'); }
    setIsSaving(false);
  };

  // ---- operations ----
  const addTop = () => setItems([...items, newNode()]);
  const addChild = (id) => { const t = clone(items); const l = locate(t, id); if (l) l.list[l.index].children.push(newNode()); setItems(t); };
  const removeItem = (id) => { const t = clone(items); const l = locate(t, id); if (l) l.list.splice(l.index, 1); setItems(t); };
  const updateItem = (id, field, value) => { const t = clone(items); const l = locate(t, id); if (l) l.list[l.index][field] = value; setItems(t); };

  const moveUpDown = (id, dir) => {
    const t = clone(items); const l = locate(t, id); if (!l) return;
    const j = dir === 'up' ? l.index - 1 : l.index + 1;
    if (j < 0 || j >= l.list.length) return;
    [l.list[l.index], l.list[j]] = [l.list[j], l.list[l.index]];
    setItems(t);
  };

  // indent: becomes a child of the previous sibling
  const indent = (id) => {
    const t = clone(items); const l = locate(t, id); if (!l || l.index === 0) return;
    const prev = l.list[l.index - 1];
    const [node] = l.list.splice(l.index, 1);
    prev.children = prev.children || []; prev.children.push(node);
    setItems(t);
  };

  // outdent: moves up to the parent's level, right after it
  const outdent = (id) => {
    const t = clone(items); const l = locate(t, id); if (!l || !l.parent) return;
    const [node] = l.list.splice(l.index, 1);
    const pl = locate(t, l.parent.id);
    pl.list.splice(pl.index + 1, 0, node);
    setItems(t);
  };

  // drag&drop: reorders among siblings at the same level
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const t = clone(items);
    const a = locate(t, active.id); const o = locate(t, over.id);
    if (!a || !o) return;
    if (a.list === o.list || a.parent?.id === o.parent?.id) {
      // same siblings: reorder
      const reordered = arrayMove(a.list, a.index, o.index);
      a.list.length = 0; a.list.push(...reordered);
      setItems(t);
    }
  };

  return (
    <div style={{ maxWidth: '960px', color: '#f8fafc', paddingBottom: '60px' }}>
      <PageHeader icon={ListTree} title="Menu Builder" description="The site's navigation bar: links, look and mobile behavior. Saving also republishes the site."
        actions={<Button variant="primary" icon={Save} onClick={saveMenu} disabled={isSaving || loadState !== 'ready'} title={loadState === 'loading' ? 'Loading…' : loadState === 'error' ? 'Not loaded: reload the page' : undefined}>{isSaving ? 'Saving…' : loadState === 'loading' ? 'Loading…' : 'Save & Publish'}</Button>} />

      {restoredAt && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: '#0c4a6e', border: '1px solid #0369a1', borderRadius: '10px', padding: '9px 13px', marginBottom: '14px', fontSize: '13px', color: '#e0f2fe' }}>
          <span><strong>Restored unsaved changes</strong> from {new Date(restoredAt).toLocaleString()}. They are <strong>not saved to the site yet</strong>: click Save &amp; Publish to keep them.</span>
          <button onClick={async () => {
            if (!(await confirmDialog({ title: 'Discard the restored changes?', message: 'The menu goes back to its last saved version.', confirmLabel: 'Discard changes', danger: true }))) return;
            const srv = draft.discard(); setDefaultItems(srv.items); setLangMenus(srv.langs || {}); setSettings(normalizeSettings(srv.settings)); setRestoredAt(null);
          }} style={{ background: 'transparent', color: '#bae6fd', border: '1px solid #0369a1', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '12px' }}>Discard</button>
        </div>
      )}

      <LivePreview items={items} settings={settings} device={device} onDevice={setDevice} />

      <div role="tablist" aria-label="Menu settings" style={tabBar}>
        {TABS.map(t => (
          <button key={t.id} role="tab" id={`menu-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="menu-tabpanel"
            onClick={() => setTab(t.id)} style={tab === t.id ? { ...tabBtn, ...tabBtnOn } : tabBtn}>
            <t.icon size={15} /> {t.label}
            {t.id === 'effects' && effectsOn.length > 0 && <span style={badge}>{effectsOn.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="menu-tabpanel" aria-labelledby={`menu-tab-${tab}`} style={card}>
        {tab === 'structure' && (
          <>
            <PanelIntro title="Navigation structure">
              Drag <GripVertical size={12} style={{ verticalAlign: 'middle' }} /> to reorder. Use ⇥ / ⇤ to nest or un-nest a submenu item.
              Leave the URL empty for a parent that only opens its submenu (no link).
            </PanelIntro>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              {multi && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px', padding: 10, border: '1px solid #334155', borderRadius: 8 }} data-testid="menu-language">
                  <label htmlFor="menu-lang" style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Menu for</label>
                  <select id="menu-lang" style={{ ...input, width: 'auto', cursor: 'pointer' }} value={lang} onChange={(e) => setMenuLang(e.target.value)}>
                    <option value="">{langName(langs.default, langs)} (default)</option>
                    {langs.list.filter((l) => l.code !== langs.default).map((l) => <option key={l.code} value={l.code}>{l.name}{langMenus[l.code] && langMenus[l.code].length ? '' : ' (uses the default menu)'}</option>)}
                  </select>
                  {lang && !(langMenus[lang] && langMenus[lang].length) && <Button size="sm" onClick={() => setLangMenus((m) => ({ ...m, [lang]: clone(defaultItems) }))}>Start from the default menu</Button>}
                  {lang && langMenus[lang] && langMenus[lang].length > 0 && <Button size="sm" variant="ghost" onClick={() => setLangMenus((m) => { const n = { ...m }; delete n[lang]; return n; })}>Use the default menu</Button>}
                  <span style={{ fontSize: 11.5, color: '#64748b', flexBasis: '100%' }}>The look of the menu (Style, Mobile, Effects) is shared by all languages. Without a menu of its own a language shows the default language&apos;s links.</span>
                </div>
              )}
              <MenuLevel items={items} depth={0} pages={menuPages} langs={langs}
                onUpdate={updateItem} onRemove={removeItem} onAddChild={addChild}
                onMove={moveUpDown} onIndent={indent} onOutdent={outdent} />
            </DndContext>
            <button onClick={addTop} style={addBtn}><Plus size={16} /> Add top-level item</button>
          </>
        )}

        {tab === 'themes' && (
          <>
            <PanelIntro title="Themes">
              A theme sets colors, item shape, typography and effects in one click. Your links, logo, alignment and
              mobile settings stay as they are, and you can fine-tune everything afterwards in Style and Effects.
            </PanelIntro>
            {themeUndo && (
              <div role="status" style={undoBar}>
                <span>Applied <strong>{themeUndo.name}</strong>.</span>
                <button onClick={() => { setSettings(themeUndo.settings); setThemeUndo(null); }} style={ghostBtn}><Undo2 size={13} /> Undo</button>
              </div>
            )}
            <div style={themeGrid}>
              {THEMES.map(t => {
                const current = !!activeTheme && activeTheme.id === t.id;
                return (
                  <button key={t.id} onClick={() => { if (!current) { setThemeUndo({ name: t.name, settings }); setSettings(applyTheme(settings, t)); } }}
                    aria-pressed={current} aria-label={`Apply the ${t.name} theme`} style={{ ...themeCard, ...(current ? themeCardOn : {}) }}>
                    <ThemeSwatch theme={t} />
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
                      {t.name}{current && <span style={{ ...badge, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Check size={11} /> In use</span>}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>{t.description}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === 'style' && (
          <>
            <SectionTitle icon={Palette} color="#38bdf8">Items</SectionTitle>
            <Grid>
              <Field label="ITEM STYLE"><select style={input} value={settings.styleType} onChange={e => set({ styleType: e.target.value })}>
                <option value="link">Classic Link</option><option value="pill">Pill (Rounded)</option><option value="box">Box</option></select></Field>
              <Field label="TEXT COLOR"><ColorInput value={settings.textColor} onChange={v => set({ textColor: v })} /></Field>
              <Field label="HOVER TEXT COLOR"><ColorInput value={settings.hoverTextColor} onChange={v => set({ hoverTextColor: v })} /></Field>
              <Field label="HOVER BACKGROUND"><ColorInput value={settings.hoverBgColor} onChange={v => set({ hoverBgColor: v })} allowTransparent /></Field>
              {settings.styleType !== 'link' && <Field label="BUTTON BACKGROUND"><ColorInput value={settings.bgColor} onChange={v => set({ bgColor: v })} /></Field>}
              {settings.styleType !== 'link' && <Field label="BUTTON TEXT"><ColorInput value={settings.buttonTextColor} onChange={v => set({ buttonTextColor: v })} /></Field>}
              <Field label="ITEM BORDER">
                <select style={input} value={isCustomBorder ? '__custom__' : (settings.itemBorder || 'none')} onChange={e => set({ itemBorder: e.target.value !== '__custom__' ? e.target.value : '1px solid #cccccc' })}>
                  {BORDER_PRESETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
                {isCustomBorder && <input style={{ ...input, marginTop: '6px' }} value={settings.itemBorder} onChange={e => set({ itemBorder: e.target.value })} placeholder="1px solid #ccc" />}
              </Field>
              <Field label="ITEM RADIUS (↑/↓)"><input style={input} value={settings.borderRadius} onChange={e => set({ borderRadius: e.target.value })} onKeyDown={radiusKey} placeholder="6px" /></Field>
              <Field label="CURRENT PAGE"><label style={checkRow}><input type="checkbox" checked={!!settings.highlightCurrent} onChange={e => set({ highlightCurrent: e.target.checked })} style={{ width: 18, height: 18 }} /> Highlight the current page</label></Field>
            </Grid>

            <SectionTitle icon={Type} color="#f472b6" border>Typography</SectionTitle>
            <Grid>
              <Field label="FONT SIZE"><input style={input} value={settings.fontSize} onChange={e => set({ fontSize: e.target.value })} placeholder="15px" /></Field>
              <Field label="FONT WEIGHT"><select style={input} value={settings.fontWeight} onChange={e => set({ fontWeight: e.target.value })}>
                <option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option>
                <option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></Field>
              <Field label="LETTER CASE"><select style={input} value={settings.textTransform} onChange={e => set({ textTransform: e.target.value })}>
                <option value="none">As typed</option><option value="uppercase">UPPERCASE</option><option value="capitalize">Capitalize Words</option></select></Field>
              <Field label="LETTER SPACING"><input style={input} value={settings.letterSpacing} onChange={e => set({ letterSpacing: e.target.value })} placeholder="0px" /></Field>
              <Field label="SPACING BETWEEN ITEMS"><input style={input} value={settings.itemGap} onChange={e => set({ itemGap: e.target.value })} placeholder="20px" /></Field>
            </Grid>

            <SectionTitle icon={LayoutPanelTop} color="#a78bfa" border>Bar</SectionTitle>
            <Grid>
              <Field label="BACKGROUND COLOR"><ColorInput value={settings.menuBgColor} onChange={v => set({ menuBgColor: v })} allowTransparent /></Field>
              <Field label={`BACKGROUND OPACITY (${settings.menuBgOpacity}%)`}>
                <input type="range" min="0" max="100" value={settings.menuBgOpacity} onChange={e => set({ menuBgOpacity: parseInt(e.target.value, 10) })} style={{ width: '100%' }} /></Field>
              <Field label="SHADOW"><select style={input} value={settings.shadow} onChange={e => set({ shadow: e.target.value })}>
                <option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="strong">Strong</option></select></Field>
              <Field label="BAR HEIGHT"><input style={input} value={settings.barHeight} onChange={e => set({ barHeight: e.target.value })} placeholder="64px" /></Field>
              <Field label="BAR PADDING"><input style={input} value={settings.barPadding} onChange={e => set({ barPadding: e.target.value })} placeholder="0 24px" /></Field>
            </Grid>
          </>
        )}

        {tab === 'effects' && (
          <>
            <PanelIntro title="Effects" action={effectsOn.length > 0 && <button onClick={() => set({ effects: [] })} style={ghostBtn}>Clear all</button>}>
              Combine as many as you like. Inside a group marked <em>pick one</em>, choosing an effect replaces the other one.
              Hover over the preview to try them.
            </PanelIntro>
            {EFFECT_GROUPS.map(g => (
              <fieldset key={g.id} style={fxGroup}>
                <legend style={{ padding: '0 6px', fontSize: '12px', fontWeight: 750, color: '#e2e8f0' }}>
                  {g.label} <span style={{ fontWeight: 500, color: '#64748b' }}>· {g.mode === 'single' ? 'pick one' : 'combine freely'}</span>
                </legend>
                <div style={{ fontSize: '11px', color: g.needsSticky && !settings.isSticky ? '#fbbf24' : '#94a3b8', marginBottom: '8px' }}>
                  {g.needsSticky && !settings.isSticky ? 'Turn on "Fixed on top" (Layout & Logo) for these to work.' : g.hint}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {g.effects.map(e => {
                    const on = effectsOn.includes(e.id);
                    return (
                      <button key={e.id} aria-pressed={on} title={e.hint} onClick={() => set({ effects: toggleEffect(settings.effects, e.id) })}
                        style={{ ...chip, ...(on ? chipOn : {}) }}>
                        {on && <Check size={12} />} {e.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </>
        )}

        {tab === 'layout' && (
          <>
            <SectionTitle icon={LayoutPanelTop} color="#a78bfa">Position</SectionTitle>
            <Grid>
              <Field label="BUTTONS ALIGNMENT"><select style={input} value={settings.align} onChange={e => set({ align: e.target.value })}>
                <option value="flex-start">Left</option><option value="center">Center</option><option value="flex-end">Right</option></select></Field>
              <Field label="STICKY"><label style={checkRow}><input type="checkbox" checked={!!settings.isSticky} onChange={e => set({ isSticky: e.target.checked })} style={{ width: 18, height: 18 }} /> Fixed on top</label></Field>
            </Grid>

            <SectionTitle icon={ImageIcon} color="#10b981" border>Logo</SectionTitle>
            <Grid>
              <Field label="LOGO IMAGE">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...input, flex: 1, minWidth: 0 }} value={settings.logoUrl} onChange={e => set({ logoUrl: e.target.value })} placeholder="/uploads/logo.png" />
                  <button onClick={() => logoInputRef.current && logoInputRef.current.click()} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}><Upload size={14} /> Upload</button>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { uploadLogo(e.target.files[0]); e.target.value = ''; }} />
                </div>
              </Field>
              <Field label="LOGO ALIGNMENT"><select style={input} value={settings.logoAlign} onChange={e => set({ logoAlign: e.target.value })}>
                <option value="left">Left</option><option value="right">Right</option></select></Field>
              <Field label="LOGO HEIGHT"><input style={input} value={settings.logoHeight} onChange={e => set({ logoHeight: e.target.value })} placeholder="40px" /></Field>
              <Field label="LOGO / BUTTONS GAP"><input style={input} value={settings.logoGap} onChange={e => set({ logoGap: e.target.value })} placeholder="24px" /></Field>
              <Field label="LOGO LINK"><select style={input} value={settings.logoLink} onChange={e => set({ logoLink: e.target.value })}>
                <option value="index.html">Homepage</option><option value="">No link</option>
                {pages.filter((p) => !Number(p.is_draft_copy)).map(p => <option key={p.id} value={pageFile(p, langs)}>{p.title}{multi ? ` (${langOf(p, langs).toUpperCase()})` : ''}</option>)}</select></Field>
            </Grid>
          </>
        )}

        {tab === 'mobile' && (
          <>
            <PanelIntro title="Mobile (hamburger)">
              Below the breakpoint the items collapse into a hamburger button that opens them as a list under the bar.
              Switch the preview to <em>Mobile</em> to check it.
            </PanelIntro>

            <SectionTitle icon={Smartphone} color="#10b981">Burger icon</SectionTitle>
            <div role="group" aria-label="Burger icon" style={burgerGrid}>
              {BURGER_ICONS.map(b => (
                <button key={b.id} onClick={() => set({ burgerStyle: b.id })} aria-pressed={settings.burgerStyle === b.id} title={b.label}
                  style={{ ...burgerTile, ...(settings.burgerStyle === b.id ? burgerTileOn : {}) }}>
                  <span style={{ width: 26, height: 26, display: 'block' }} dangerouslySetInnerHTML={{ __html: b.svg }} />
                  <span style={{ fontSize: '10px' }}>{b.label}</span>
                </button>
              ))}
              <button onClick={() => set({ burgerStyle: 'label' })} aria-pressed={settings.burgerStyle === 'label'} title="Icon + Menu"
                style={{ ...burgerTile, ...(settings.burgerStyle === 'label' ? burgerTileOn : {}) }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', height: 26 }}>
                  <span style={{ width: 20, height: 20, display: 'block' }} dangerouslySetInnerHTML={{ __html: BURGER_ICONS[0].svg }} />
                  <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px' }}>MENU</span>
                </span>
                <span style={{ fontSize: '10px' }}>Icon + Menu</span>
              </button>
              <button onClick={() => set({ burgerStyle: 'custom' })} aria-pressed={settings.burgerStyle === 'custom'} title="Custom character"
                style={{ ...burgerTile, ...(settings.burgerStyle === 'custom' ? burgerTileOn : {}) }}>
                <span style={{ fontSize: '20px', height: 26, lineHeight: '26px' }}>{settings.burgerIcon || '☰'}</span>
                <span style={{ fontSize: '10px' }}>Custom</span>
              </button>
            </div>
            {settings.burgerStyle === 'custom' && (
              <div style={{ maxWidth: '220px', marginTop: '12px' }}>
                <Field label="CUSTOM CHARACTER"><input style={input} value={settings.burgerIcon} onChange={e => set({ burgerIcon: e.target.value })} placeholder="☰" maxLength={8} /></Field>
              </div>
            )}
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '10px 0 0' }}>When the menu is open the icon turns into ✕. It uses the menu text color.</p>

            <SectionTitle icon={LayoutPanelTop} color="#a78bfa" border>Mobile bar</SectionTitle>
            <Grid>
              <Field label="BURGER POSITION">
                <div role="group" aria-label="Burger position" style={{ display: 'flex', gap: '6px' }}>
                  {[['left', 'Left'], ['right', 'Right']].map(([v, l]) => (
                    <button key={v} onClick={() => set({ mobileBurgerSide: v })} aria-pressed={settings.mobileBurgerSide === v}
                      style={{ ...chip, flex: 1, justifyContent: 'center', ...(settings.mobileBurgerSide === v ? chipOn : {}) }}>{l}</button>
                  ))}
                </div>
              </Field>
              <Field label="LOGO ON MOBILE">
                <label style={checkRow}><input type="checkbox" checked={settings.mobileShowLogo !== false} onChange={e => set({ mobileShowLogo: e.target.checked })} style={{ width: 18, height: 18 }} /> Show the logo</label>
              </Field>
              <Field label="MOBILE BREAKPOINT (px)"><input type="number" style={input} value={settings.mobileThreshold} onChange={e => set({ mobileThreshold: e.target.value })} /></Field>
            </Grid>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '10px 0 0' }}>
              {settings.logoUrl
                ? (settings.mobileShowLogo === false ? 'The logo is hidden on mobile.' : `The logo sits on the ${settings.mobileBurgerSide === 'left' ? 'right' : 'left'}, opposite the burger.`)
                : 'No logo set: add one in Layout & Logo.'}
              {' '}On mobile the bar always shows logo and burger at the two edges, whatever the desktop alignment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'structure', label: 'Structure', icon: ListTree },
  { id: 'themes', label: 'Themes', icon: SwatchBook },
  { id: 'style', label: 'Style', icon: Palette },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'layout', label: 'Layout & Logo', icon: LayoutPanelTop },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
];

function MenuLevel({ items, depth, pages, langs, onUpdate, onRemove, onAddChild, onMove, onIndent, onOutdent }) {
  return (
    <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
      {items.map((item, idx) => (
        <MenuRow key={item.id} item={item} index={idx} total={items.length} depth={depth} pages={pages} langs={langs}
          onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} onMove={onMove} onIndent={onIndent} onOutdent={onOutdent} />
      ))}
    </SortableContext>
  );
}

function MenuRow({ item, index, total, depth, pages, langs, onUpdate, onRemove, onAddChild, onMove, onIndent, onOutdent }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const noLink = !item.url || item.url === '#';
  return (
    <div ref={setNodeRef} style={{ ...style, marginLeft: depth * 28 }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: depth ? '#111c30' : '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155', borderLeft: depth ? '3px solid #38bdf8' : '1px solid #334155', marginBottom: '8px' }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#64748b', display: 'flex' }} title="Drag to reorder"><GripVertical size={16} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <button onClick={() => onMove(item.id, 'up')} disabled={index === 0} style={miniBtn}><ArrowUp size={12} /></button>
          <button onClick={() => onMove(item.id, 'down')} disabled={index === total - 1} style={miniBtn}><ArrowDown size={12} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <button onClick={() => onIndent(item.id)} disabled={index === 0} style={{ ...miniBtn, background: '#1e3a5f' }} title="Nest under previous"><IndentIncrease size={12} /></button>
          <button onClick={() => onOutdent(item.id)} disabled={depth === 0} style={{ ...miniBtn, background: '#1e3a5f' }} title="Un-nest"><IndentDecrease size={12} /></button>
        </div>
        <input style={{ ...input, flex: 1 }} value={item.title} onChange={e => onUpdate(item.id, 'title', e.target.value)} placeholder="Label" />
        <select style={{ ...input, flex: 1, cursor: 'pointer' }} value={pages.some(p => pageFile(p, langs) === item.url) ? item.url : (noLink ? '' : '__custom__')} onChange={e => { if (e.target.value !== '__custom__') onUpdate(item.id, 'url', e.target.value); }}>
          <option value="">— No link (opens submenu) —</option>
          <option value="__custom__">Custom URL…</option>
          {pages.map(p => <option key={p.id} value={pageFile(p, langs)}>{p.title}</option>)}
        </select>
        <input style={{ ...input, flex: 1 }} value={item.url} onChange={e => onUpdate(item.id, 'url', e.target.value)} placeholder="empty = no link" />
        <button onClick={() => onAddChild(item.id)} style={{ ...miniBtn, background: '#065f46', padding: '8px' }} title="Add submenu item"><Plus size={14} /></button>
        <button onClick={() => onRemove(item.id)} style={{ padding: '8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={14} /></button>
      </div>
      {item.children && item.children.length > 0 && (
        <MenuLevel items={item.children} depth={depth + 1} pages={pages} langs={langs}
          onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} onMove={onMove} onIndent={onIndent} onOutdent={onOutdent} />
      )}
    </div>
  );
}

// AUTHENTIC preview: uses the real compiler (preview_menu endpoint) in an isolated iframe, over a
// dummy page that scrolls, so "Fixed on top" and the scroll effects behave as on the site.
// Stays at the top while scrolling the settings; "Mobile" narrows the frame below the breakpoint.
function LivePreview({ items, settings, device, onDevice }) {
  const [html, setHtml] = useState('');
  // the global colours, so menu colours that point to them show as on the site
  const palette = useStore((st) => st.palette);
  const loadPalette = useStore((st) => st.loadPalette);
  useEffect(() => { if (!palette) loadPalette(); }, [palette, loadPalette]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('api.php?action=preview_menu', { method: 'POST', body: JSON.stringify({ items, settings }) });
        const data = await res.json();
        if (data && data.success) setHtml(data.html || '');
      } catch { /* noop */ }
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [items, settings]);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>:root{--brand-color:${palette && palette[0] ? palette[0].value : '#3b82f6'};${paletteCss(palette)}}html,body{margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}${DUMMY_CSS}</style>
    </head><body>${html}${DUMMY_PAGE}</body></html>`;
  const mobile = device === 'mobile';

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', background: '#0f172a', boxShadow: '0 10px 24px rgba(2,6,23,.45)' }}>
      <div style={{ fontSize: '10px', color: '#64748b', padding: '6px 12px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <span>Live preview (authentic — links are inert) · scroll it to try “Fixed on top”{loading && ' · updating…'}</span>
        <span role="group" aria-label="Preview size" style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => onDevice('desktop')} aria-pressed={!mobile} title="Desktop" style={{ ...deviceBtn, ...(!mobile ? deviceBtnOn : {}) }}><Monitor size={13} /> Desktop</button>
          <button onClick={() => onDevice('mobile')} aria-pressed={mobile} title="Mobile" style={{ ...deviceBtn, ...(mobile ? deviceBtnOn : {}) }}><Smartphone size={13} /> Mobile</button>
        </span>
      </div>
      <div style={{ background: '#1e293b', display: 'flex', justifyContent: 'center' }}>
        {/* The preview runs the menu's own scripts in a sandboxed page of its own (public/menu-preview.html): the
            editor's Content Security Policy allows no inline scripts. Reloaded for each change. */}
        <iframe key={doc} title="menu-preview" src="menu-preview.html" sandbox="allow-scripts"
          onLoad={(e) => { try { e.currentTarget.contentWindow.postMessage({ type: 'cc-menu-preview', html: doc }, '*'); } catch { /* noop */ } }}
          style={{ width: mobile ? '390px' : '100%', maxWidth: '100%', height: '300px', border: 'none', background: '#f1f5f9', display: 'block' }} />
      </div>
    </div>
  );
}

// Placeholder page under the preview menu: gray blocks only, so the menu stays the focus.
const DUMMY_CSS = '.dp{max-width:960px;margin:0 auto;padding:28px 20px 60px;color:#94a3b8}'
  + '.dp-hero{height:150px;border-radius:14px;background:linear-gradient(135deg,#e2e8f0,#cbd5e1);display:flex;align-items:center;justify-content:center;font-size:13px;color:#64748b;text-align:center;padding:0 16px}'
  + '.dp-l{height:12px;border-radius:6px;background:#e2e8f0;margin:14px 0}.dp-l.s{width:60%}'
  + '.dp-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:26px 0}.dp-c{height:110px;border-radius:12px;background:#e2e8f0}';
const DUMMY_PAGE = '<main class="dp" aria-hidden="true"><div class="dp-hero">Sample page · scroll to see how the menu behaves</div>'
  + [0, 1, 2].map(() => '<div class="dp-l"></div><div class="dp-l"></div><div class="dp-l s"></div><div class="dp-g"><div class="dp-c"></div><div class="dp-c"></div><div class="dp-c"></div></div>').join('')
  + '</main>';

// Miniature of a theme: its bar color, three items in its style and its hover color on the first one.
function ThemeSwatch({ theme }) {
  const s = theme.settings;
  const transparent = !s.menuBgColor || s.menuBgColor === 'transparent';
  const button = s.styleType !== 'link';
  const item = (label, hover) => (
    <span style={{
      fontSize: '9px', fontWeight: s.fontWeight, textTransform: s.textTransform, letterSpacing: s.letterSpacing, whiteSpace: 'nowrap',
      padding: button ? '3px 7px' : '3px 2px', borderRadius: s.styleType === 'pill' ? '20px' : s.borderRadius,
      border: s.itemBorder !== 'none' ? s.itemBorder : undefined,
      color: hover ? (button && s.hoverBgColor === 'transparent' ? s.buttonTextColor : s.hoverTextColor) : (button ? s.buttonTextColor : s.textColor),
      background: hover && s.hoverBgColor !== 'transparent' ? s.hoverBgColor : (button ? s.bgColor : 'transparent'),
      boxShadow: hover && !button && s.hoverBgColor === 'transparent' ? `inset 0 -2px 0 ${s.hoverTextColor}` : undefined,
    }}>{label}</span>
  );
  return (
    <span aria-hidden="true" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', height: '38px', padding: '0 10px', borderRadius: '8px', overflow: 'hidden',
      background: transparent ? 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 0 0 / 12px 12px' : s.menuBgColor,
      boxShadow: s.effects.includes('accent-line') ? `inset 0 -3px 0 ${s.hoverTextColor}` : undefined,
    }}>
      <span style={{ marginRight: 'auto', width: '16px', height: '16px', borderRadius: '4px', background: s.hoverTextColor, opacity: 0.9 }} />
      {item('Home', true)}{item('About')}{item('Contact')}
    </span>
  );
}

// ---- small UI components ----
const SectionTitle = ({ icon: Icon, color, border, children }) => (
  <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', ...(border ? { borderTop: '1px solid #334155', paddingTop: '20px', marginTop: '20px' } : {}) }}>
    <Icon size={16} color={color} /> {children}
  </h3>
);
const PanelIntro = ({ title, action, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
      <h3 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>{title}</h3>{action}
    </div>
    <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{children}</p>
  </div>
);
const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>{children}</div>;
const Field = ({ label, children }) => (
  <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#94a3b8', marginBottom: '5px' }}>{label}</label>{children}</div>
);
const ColorInput = ({ value, onChange, allowTransparent }) => (
  <div style={{ display: 'flex', gap: '8px' }}>
    <input type="color" value={value === 'transparent' || !value ? '#ffffff' : value} onChange={e => onChange(e.target.value)} style={{ width: 38, height: 38, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
    {allowTransparent && <button onClick={() => onChange('transparent')} style={{ padding: '6px 10px', fontSize: 11, background: value === 'transparent' ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>None</button>}
  </div>
);

const card = { background: '#1e293b', borderRadius: '0 0 12px 12px', border: '1px solid #334155', borderTop: 'none', padding: '22px', marginBottom: '20px' };
const input = { padding: '7px 9px', border: '1px solid #334155', borderRadius: '6px', fontSize: '13px', width: '100%', background: '#0f172a', color: '#fff', boxSizing: 'border-box' };
const miniBtn = { background: '#334155', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex' };
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', color: '#bae6fd', border: '1px solid #0369a1', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '12px' };
const addBtn = { width: '100%', padding: '15px', background: 'transparent', color: '#38bdf8', border: '2px dashed #334155', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' };
const checkRow = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#f8fafc', fontWeight: 'bold', height: '38px', cursor: 'pointer' };
const tabBar = { display: 'flex', flexWrap: 'wrap', gap: '2px', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px 12px 0 0', padding: '6px 6px 0' };
const tabBtn = { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', background: 'transparent', color: '#94a3b8', border: 'none', borderBottom: '2px solid transparent', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };
const tabBtnOn = { background: '#1e293b', color: '#f8fafc', borderBottom: '2px solid #38bdf8' };
const badge = { background: '#0369a1', color: '#e0f2fe', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 };
const undoBar = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: '#0c4a6e', border: '1px solid #0369a1', borderRadius: '10px', padding: '8px 12px', marginBottom: '14px', fontSize: '13px', color: '#e0f2fe' };
const themeGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' };
const themeCard = { display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', padding: '10px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' };
const themeCardOn = { border: '1px solid #38bdf8', boxShadow: '0 0 0 2px rgba(56,189,248,.25)' };
const fxGroup = { border: '1px solid #334155', borderRadius: '10px', padding: '10px 14px 14px', margin: '0 0 12px 0', minWidth: 0 };
const chip = { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: '#0f172a', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 };
const chipOn = { background: '#0c4a6e', color: '#f0f9ff', border: '1px solid #38bdf8' };
const deviceBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px' };
const burgerGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '8px' };
const burgerTile = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '10px 6px', background: '#f8fafc', color: '#334155', border: '2px solid transparent', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 };
const burgerTileOn = { border: '2px solid #38bdf8', boxShadow: '0 0 0 3px rgba(56,189,248,.25)' };
const deviceBtnOn = { background: '#334155', color: '#f8fafc' };
