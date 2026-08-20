import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

const DEFAULTS = {
  title: 'FeastDocs',
  tagline: '',
  logo: null,
  docsDir: 'docs',
  navbar: { links: [] },
  footer: { text: '', links: [] },
  theme: { defaultMode: 'system', accent: '#f0812c', accentDark: '#ff9d52' },
  sidebar: { autoCollapse: false },
  editUrl: null,
  showLastUpdated: true,
  github: { repo: null, branch: 'main' },
};

/**
 * Loads feastdocs.config.mjs and merges it over the defaults.
 * `bust` forces a re-read in watch mode, where the module would otherwise be
 * served from Node's ESM cache.
 */
export async function loadConfig({ bust = false } = {}) {
  const file = path.join(ROOT, 'feastdocs.config.mjs');
  const url = pathToFileURL(file).href + (bust ? `?t=${Date.now()}` : '');
  const mod = await import(url);
  const user = mod.default ?? {};

  return {
    ...DEFAULTS,
    ...user,
    navbar: { ...DEFAULTS.navbar, ...user.navbar },
    footer: { ...DEFAULTS.footer, ...user.footer },
    theme: { ...DEFAULTS.theme, ...user.theme },
    sidebar: { ...DEFAULTS.sidebar, ...user.sidebar },
    github: { ...DEFAULTS.github, ...user.github },
  };
}

export const paths = {
  root: ROOT,
  docs: (config) => path.join(ROOT, config.docsDir),
  generated: path.join(ROOT, 'src', 'app', 'generated'),
  generatedDocs: path.join(ROOT, 'src', 'app', 'generated', 'docs'),
  public: path.join(ROOT, 'public'),
  publicAssets: path.join(ROOT, 'public', 'docs-assets'),
};
