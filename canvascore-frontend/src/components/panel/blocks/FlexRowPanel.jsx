import React from 'react';
import { Columns3 } from 'lucide-react';
import { PanelAccordion, SelF, TxtF } from '../fields';
import { __ } from '../../../i18n/index.js';

// Content panel: FLEX_ROW. A row of blocks side by side: its layout lives in the block's styles.
export default function FlexRowPanel({ ctx }) {
  const { selectedBlock, handleStyleChange } = ctx;
  const st = selectedBlock.styles || {};
  return (
    <PanelAccordion title={__("Row Layout")} icon={Columns3} defaultOpen={true}>
      <SelF label={__("Direction")} value={st.flexDirection || 'row'} onChange={v => handleStyleChange('flexDirection', v)}
        options={[['row', __("Side by side (left → right)")], ['row-reverse', __("Side by side (right → left)")], ['column', __("Stacked (top → bottom)")]]} />
      <TxtF label={__("Space between blocks")} value={st.gap ?? ''} onChange={v => handleStyleChange('gap', v)} placeholder={__("e.g. 20px")} />
      <SelF label={__("Horizontal alignment")} value={st.justifyContent || 'flex-start'} onChange={v => handleStyleChange('justifyContent', v)}
        options={[['flex-start', __("Start")], ['center', __("Center")], ['flex-end', __("End")], ['space-between', __("Spread out (space between)")], ['space-around', __("Spread out (space around)")], ['space-evenly', __("Spread out evenly")]]} />
      <SelF label={__("Vertical alignment")} value={st.alignItems || 'stretch'} onChange={v => handleStyleChange('alignItems', v)}
        options={[['stretch', __("Same height (stretch)")], ['flex-start', __("Top")], ['center', __("Middle")], ['flex-end', __("Bottom")]]} />
      <SelF label={__("When there is not enough room")} value={st.flexWrap || 'nowrap'} onChange={v => handleStyleChange('flexWrap', v)}
        options={[['wrap', __("Wrap to a new line")], ['nowrap', __("Keep on one line")]]} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>{__("Give the blocks inside a width in their Style tab (e.g. 50%) to control how much room each one takes.")}</p>
    </PanelAccordion>
  );
}
