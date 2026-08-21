import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

const DEFAULTS = {
  title: 'FeastDocs',
  siteUrl: null,
  tagline: '',
  logo: null,
  docsDir: 'docs',
  navbar: { links: [] },
  footer: { text: '', links: [] },
  theme: { defaultMode: 'system', accent: '#f0812c', accentDark: '#ff9d52' },
  sidebar: { autoCollapse: false },
  socialImage: null,
  sourceRepo: null,
  sourceLabel: null,
  editUrl: null,
  showLastUpdated: true,
  github: { repo: null, branch: 'main', oauthClientId: null, oauthScope: 'repo' },
  editor: { invite: null },
  changelog: {
    limit: 150,
    branch: null,
    repos: [],
    monthlyPages: false,
    monthlyPagesDir: 'changelog',
    groupByRepo: true,
    selfLabel: null,
  },
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
    editor: { ...DEFAULTS.editor, ...user.editor },
    changelog: { ...DEFAULTS.changelog, ...user.changelog },
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
