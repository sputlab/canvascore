import React from 'react';
import { Languages } from 'lucide-react';
import { useStore } from '../../../store/useStore';
import { isMultilingual } from '../../../editor/languages';
import { PanelAccordion, SelF, ChkF } from '../fields';

// Content panel: LANGUAGE_SWITCHER (links to the translations of the page, built when the site is published)
export default function LanguageSwitcherPanel({ ctx }) {
  const { c, set } = ctx;
  const langs = useStore((s) => s.languages);
  return (
    <PanelAccordion title="Language switcher" icon={Languages} defaultOpen={true}>
      <SelF label="Look" value={c.style === 'dropdown' ? 'dropdown' : 'list'} onChange={(v) => set('style', v)} options={[['list', 'A row of links'], ['dropdown', 'A drop-down list']]} />
      <SelF label="Show" value={c.labels === 'code' ? 'code' : 'name'} onChange={(v) => set('labels', v)} options={[['name', 'The name (Italiano)'], ['code', 'The code (IT)']]} />
      <ChkF label="Show the current language too" checked={c.showCurrent !== false} onChange={(v) => set('showCurrent', v)} />
      <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
        Each link goes to the translation of the page being viewed; a language the page has no translation in sends to that language&apos;s home page (and is left out when it has none).
        {isMultilingual(langs) ? '' : ' Nothing is shown until at least two languages are added in Administration › Languages.'}
        {' '}Put it in the global header to have it on every page. The editor shows a preview.
      </p>
    </PanelAccordion>
  );
}
