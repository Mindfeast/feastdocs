// -----------------------------------------------------------------------------
// FeastDocs site configuration
//
// This is the single place you configure the site. It is read at build time by
// the content pipeline (tools/) and emitted as a typed module the Angular app
// imports, so everything here is available to both sides.
// -----------------------------------------------------------------------------

export default {
  /** Shown in the navbar and used as the browser title suffix. */
  title: 'FeastDocs',

  /** Short description, used on the home page and as the default meta description. */
  tagline: 'Documentation that lives next to the code.',

  /** Path to a logo inside `public/`, or null for a text-only navbar. */
  logo: null,

  /** Folder holding your documentation sources, relative to the project root. */
  docsDir: 'docs',

  /**
   * Extra navbar links, shown to the right of the section tabs.
   * Sections themselves come from the top-level folders in docs/ — they are
   * not configured here. `to` = internal doc route, `href` = external URL.
   */
  navbar: {
    links: [],
  },

  footer: {
    text: `© ${new Date().getFullYear()} FeastDocs`,
    links: [{ label: 'Architecture', to: '/reference/architecture' }],
  },

  theme: {
    /** 'system' | 'light' | 'dark' — what a first-time visitor gets. */
    defaultMode: 'dark',
    /** Drives the --fd-accent custom property. Any CSS color. */
    accent: '#e26f1e',
    accentDark: '#ff9d52',
  },

  sidebar: {
    /** Collapse every category except the one containing the current page. */
    autoCollapse: false,
  },

  /**
   * Base URL of a repo file view. The doc's source path is appended to it to
   * build the "Edit this page" link. Set to null to hide the link.
   * e.g. 'https://github.com/acme/docs/edit/main/'
   */
  editUrl: 'https://github.com/Mindfeast/feastdocs/edit/main/docs/',

  /** Show the source file's last change (date and author) in the page footer. */
  showLastUpdated: true,

  /**
   * GitHub-backed editing for the content manager (/_editor). With `repo` set,
   * the editor can commit changes straight to the repository as the connected
   * GitHub user — the strategy for editing on the deployed site. Local file
   * editing during `npm start` is unaffected.
   * e.g. repo: 'omnibees/feastdocs'
   */
  github: {
    repo: 'Mindfeast/feastdocs',
    branch: 'main',
    /**
     * Client id of a GitHub OAuth App — enables "Sign in with GitHub" on the
     * deployed site (the secret half lives in Cloudflare, never here; see
     * functions/api/oauth/token.js). null falls back to pasting a token.
     */
    oauthClientId: null,
  },
};
