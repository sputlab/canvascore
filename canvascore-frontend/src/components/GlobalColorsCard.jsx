// Global Options › Global colours: the site's palette. Built-in colours (Primary = the brand colour, Secondary,
// Accent, Text, Background) can be renamed and changed; custom ones can also be added and removed. Every colour
// field of the editor offers them as swatches, and blocks that use one follow it when it changes here.
import React from 'react';
import { Droplets, Plus, Trash2 } from 'lucide-react';
import { Card, Button } from '../ui/kit';
import { confirmDialog } from '../ui/dialog';
import { normalizePalette, newColorId, paletteHex, BUILT_IN_IDS } from '../editor/palette';
import { __ } from '../i18n/index.js';

export default function GlobalColorsCard({ settings, set }) {
  const palette = normalizePalette(settings);
  // the edited palette; the primary colour is also the brand colour (brandColor) used by older blocks and the menu
  const update = (list) => set({ colors: list, brandColor: list[0].value });
  const patch = (id, p) => update(palette.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = () => update([...palette, { id: newColorId('colour', palette), name: __("Colour {0}", palette.length - BUILT_IN_IDS.length + 1), value: '#64748b' }]);
  const remove = async (c) => {
    if (!(await confirmDialog({ title: __("Delete \"{0}\"?", c.name), message: __("Blocks that use it keep the colour it had when they chose it, but no longer follow the palette."), confirmLabel: __("Delete colour"), danger: true }))) return;
    update(palette.filter((x) => x.id !== c.id));
  };
  return (
    <Card title={__("Global colours")} icon={Droplets} description={__("The site's palette. Every colour field offers these as swatches; change one here and every block that uses it follows. Primary is the brand colour.")}>
      <ul className="cc-palette" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {palette.map((c) => {
          const builtIn = BUILT_IN_IDS.includes(c.id);
          return (
            <li key={c.id} className="cc-palette__row" style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) 120px 34px', gap: 8, alignItems: 'center' }}>
              <input type="color" aria-label={__("Pick the {0} colour", c.name)} value={/^#[0-9a-f]{6}$/.test(c.value) ? c.value : '#000000'} onChange={(e) => patch(c.id, { value: e.target.value })}
                style={{ width: 38, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'none' }} />
              <input className="ui-input" aria-label={__("Colour name")} value={c.name} maxLength={40} onChange={(e) => patch(c.id, { name: e.target.value })} />
              <input className="ui-input" aria-label={__("{0} value", c.name)} defaultValue={c.value} key={c.value} placeholder="#3b82f6"
                onBlur={(e) => { const h = paletteHex(e.target.value); if (h) patch(c.id, { value: h }); else e.target.value = c.value; }} />
              {builtIn
                ? <span title={__("Built-in colour")} style={{ fontSize: 10, color: '#64748b', textAlign: 'center' }}>{c.id === 'primary' ? 'brand' : ''}</span>
                : <Button variant="ghost" size="sm" icon={Trash2} aria-label={__("Delete {0}", c.name)} title={__("Delete {0}", c.name)} onClick={() => remove(c)} />}
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 10 }}>
        <Button size="sm" icon={Plus} onClick={add} disabled={palette.length >= 40}>{__("Add colour")}</Button>
      </div>
    </Card>
  );
}
