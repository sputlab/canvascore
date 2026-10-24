// Block packages in the editor: the server sends the enabled packages (api.php?action=pkg_list); their blocks are
// registered here, at run time, in the same places the core blocks are: the definition engine (blockDef.mjs), the catalog
// (blockCatalog.js, group "Block packages") and the panels (generated from the definition, blocks/index.js). The packages'
// style sheet (each package's rules are already nested under its own class by the server) is kept for the canvas.
import { registerPackageDefs } from '../render/blockDef.mjs';
import { registerPackageCatalog } from './blockCatalog';
import { useStore } from '../store/useStore';

let css = '';
export const packageCss = () => css;

// payload: { packages: [{ id, name, version, blocks: [{ type, definition, catalog, defaults }] }], css }
export function registerPackages(payload) {
  const list = payload && Array.isArray(payload.packages) ? payload.packages : [];
  const defs = [];
  const entries = [];
  for (const pkg of list) {
    for (const b of pkg.blocks || []) {
      if (!b || typeof b.type !== 'string' || !b.definition || typeof b.definition !== 'object') continue;
      const d = b.defaults && typeof b.defaults === 'object' && !Array.isArray(b.defaults) ? b.defaults : {};
      defs.push({ ...b.definition, type: b.type, _pkg: pkg.id, _defaults: { content: d.content && !Array.isArray(d.content) ? d.content : {}, styles: d.styles && !Array.isArray(d.styles) ? d.styles : {} } });
      entries.push({ ...(b.catalog || {}), type: b.type, package: pkg.name });
    }
  }
  registerPackageDefs(defs);
  registerPackageCatalog(entries);
  css = payload && typeof payload.css === 'string' ? payload.css : '';
  useStore.setState((s) => ({ packagesVersion: (s.packagesVersion || 0) + 1 }));
}

export async function loadBlockPackages() {
  try {
    const data = await (await fetch('api.php?action=pkg_list')).json();
    if (data && data.success) registerPackages(data);
  } catch { /* offline: the core blocks still work */ }
}
