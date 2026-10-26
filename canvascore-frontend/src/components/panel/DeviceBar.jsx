// Top of the Style tab: which device the styles are edited for. It is the editor's preview size, so switching here
// also switches the canvas (and the other way round). Tablet and phone values are overrides of the desktop ones.
import React from 'react';
import { Monitor, Tablet, Smartphone, RotateCcw } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Segmented } from '../../ui/kit';
import { deviceOverrides, resetDevicePatch } from '../../editor/deviceStyles';
import { TABLET_MAX, MOBILE_MAX } from '../../render/renderBlock.mjs';
import { __ } from '../../i18n/index.js';

export default function DeviceBar({ block }) {
  const viewport = useStore((s) => s.viewport);
  const setViewport = useStore((s) => s.setViewport);
  const updateBlock = useStore((s) => s.updateBlock);
  const changed = deviceOverrides(block, viewport);
  const note = viewport === 'tablet' ? __("Tablet styles (screens up to {0}px). Not changed here: the desktop value.", TABLET_MAX)
    : viewport === 'mobile' ? __("Phone styles (screens up to {0}px). Not changed here: the tablet value.", MOBILE_MAX)
    : __("Desktop styles: tablets and phones use them too, unless you change them there.");
  return (
    <div className="cc-device-bar" style={{ padding: '10px 12px', borderRadius: 10, background: '#0b1220', border: '1px solid #1e293b', marginBottom: 6 }}>
      <Segmented block label={__("Edit styles for")} value={viewport} onChange={setViewport} options={[
        ['desktop', __("Desktop"), Monitor, __("Desktop styles")], ['tablet', __("Tablet"), Tablet, __("Tablet styles")], ['mobile', __("Phone"), Smartphone, __("Phone styles")],
      ]} />
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.45 }}>{note}</p>
      {changed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#38bdf8' }}>{changed.length === 1 ? __("1 setting changed for this device") : __("{0} settings changed for this device", changed.length)}</span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => updateBlock(block.id, resetDevicePatch(block, viewport))}
            title={viewport === 'tablet' ? __("Use the desktop styles on tablets again") : __("Use the tablet styles on phones again")}>
            <RotateCcw size={13} aria-hidden="true" />{__("Reset")}
          </button>
        </div>
      )}
    </div>
  );
}
