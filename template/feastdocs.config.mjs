// -----------------------------------------------------------------------------
// Site configuration
//
// The single place this site is configured. Read at build time by the content
// pipeline (tools/) and emitted as a typed module the app imports.
//
// Every option is documented at https://feastdocs.feast-labs.com/reference/configuration
// -----------------------------------------------------------------------------

export default {
  /** Shown in the navbar and used as the browser title suffix. */
  title: 'My Docs',

  /** Short description, used on the home page and as the default meta description. */
  tagline: 'Documentation that lives next to the code.',

  /**
   * Public origin of the deployed site, e.g. 'https://docs.example.com'.
   * Setting it turns on the SEO output: prerendered HTML per page, canonical
   * and Open Graph tags, sitemap.xml and robots.txt. null skips all of it,
   * which is the right choice for an internal site.
   */
  siteUrl: null,

  /** Path to a logo inside `public/`, or null for a text-only navbar. */
  logo: null,

  /** 1200x630 PNG or JPG in `public/`, used as the link-preview image. */
  socialImage: null,

  /** Folder holding your documentation sources, relative to the project root. */
  docsDir: 'docs',

  /**
   * Extra navbar links, right of the section tabs. Sections themselves come
   * from the top-level folders in docs/ and are not configured here.
   */
  navbar: {
    links: [],
  },

  footer: {
    text: `© ${new Date().getFullYear()} My Project`,
    links: [],
  },

  theme: {
    /** 'system' | 'light' | 'dark' — what a first-time visitor gets. */
    defaultMode: 'system',
    /** Accent colour per mode. Any CSS colour. */
    accent: '#2f6feb',
    accentDark: '#6ea8ff',
  },

  sidebar: {
    /** Collapse every category except the one containing the current page. */
    autoCollapse: false,
  },

  /**
   * Base URL of a repo file view; the page's source path is appended to build
   * the "Edit this page" link. null hides it.
   * e.g. 'https://github.com/acme/docs/edit/main/'
   */
  editUrl: null,

  /** Show "Last updated {date} by {author}" in page footers, read from git. */
  showLastUpdated: true,

  github: {
    /** 'owner/name' — enables source links, commit links and web editing. */
    repo: null,
    branch: 'main',
    /** OAuth App client id, for signing in to edit from the deployed site. */
    oauthClientId: null,
    /** 'public_repo' is enough for a public repository; 'repo' for a private one. */
    oauthScope: 'public_repo',
  },

  /** Repository shown by the navbar and footer source links. Defaults to github.repo. */
  sourceRepo: null,

  editor: {
    /** Label on the content-manager link. null keeps a quiet icon. */
    invite: null,
  },

  changelog: {
    /** How many commits <fd-changelog> reads. */
    limit: 150,
    /** Branch to read history from; null uses the checked-out branch. */
    branch: null,
    /** Other repositories to collect, on GitHub or Azure DevOps. */
    repos: [],
    /** Generate a page per month under a category per year. */
    monthlyPages: false,
    monthlyPagesDir: 'changelog',
    groupByRepo: true,
    selfLabel: null,
  },
};
