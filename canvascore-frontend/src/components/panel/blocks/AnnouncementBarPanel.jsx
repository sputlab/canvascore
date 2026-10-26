import React from 'react';
import { Megaphone } from 'lucide-react';
import { PanelAccordion } from '../fields';
import AnnouncementFields from '../AnnouncementFields';
import { __ } from '../../../i18n/index.js';

// Content panel: ANNOUNCEMENT_BAR (the site-wide bar of Global Options uses the same fields)
export default function AnnouncementBarPanel({ ctx }) {
  const { c, patchContent } = ctx;
  return (
    <PanelAccordion title={__("Announcement")} icon={Megaphone} defaultOpen={true}>
      <AnnouncementFields value={c} onChange={(next) => patchContent(next)} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0 0' }}>{__("This bar is part of this page. To show one at the top of every page, use Global Options › Announcement bar. A visitor who dismisses it doesn't see it again until the message changes.")}</p>
    </PanelAccordion>
  );
}
