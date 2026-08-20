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

  /**
   * Public origin of the deployed site. Enables SEO output at build time:
   * prerendered HTML per page, canonical/Open Graph tags, sitemap.xml and
   * robots.txt. null skips all of it (fine for internal sites).
   */
  siteUrl: 'https://feastdocs.feast-labs.com',

  /** Short description, used on the home page and as the default meta description. */
  tagline: 'Documentation that lives next to the code.',

  /** Path to a logo inside `public/`, or null for a text-only navbar. */
  logo: 'logo.svg',

  /**
   * Preview image for link shares (LinkedIn, Slack, X, WhatsApp). A file in
   * `public/`, 1200×630, PNG or JPG — SVG is not supported by any of them.
   * null falls back to a text-only card.
   */
  socialImage: 'og-image.png',

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
    oauthClientId: 'Ov23lirZ0YGPoFFlFRP3',
    /**
     * Scope asked for at sign-in. This repository is public, so 'public_repo'
     * is enough to commit — and the consent screen stays modest, which matters
     * when you invite people to sign in just to look around. Use 'repo' if
     * your docs repository is private.
     */
    oauthScope: 'public_repo',
  },

  editor: {
    /**
     * Label on the navbar's content-manager link, shown until a reader opens
     * it once. This site is a public demo, so visitors get an invitation;
     * leave it null (the default) for a team's own docs, where everyone
     * already knows the editor exists.
     */
    invite: 'Try it now',
  },

  changelog: {
    /**
     * How many commits the build reads for <fd-changelog>. The data is a lazy
     * chunk, so a larger number costs nothing on pages that do not use the
     * component.
     */
    limit: 150,

    /**
     * Which branch the history comes from. null reads the checked-out branch,
     * which is what a normal deploy wants. Name one when previews build from
     * feature branches but the changelog should track the release line.
     */
    branch: null,

    /**
     * Other repositories to collect history for, so one docs site can carry a
     * changelog per product. Read at build time and used as
     * `<fd-changelog repo="…">`.
     *
     *   'owner/name'                                     GitHub, branch main
     *   { repo: 'owner/name', branch: 'release' }         GitHub
     *   { provider: 'azure', org, project, repo, id }     Azure DevOps
     *
     * Tokens go in the build environment, never in this file: GITHUB_TOKEN for
     * private or rate-limited GitHub sources, AZURE_DEVOPS_PAT for every Azure
     * source. See docs/guide/changelog-repos.md.
     *
     * Whatever is listed here ends up publicly readable on the deployed page,
     * including commit messages and author names.
     */
    repos: [],

    /**
     * Generate a page per month, grouped under a category per year, inside
     * `monthlyPagesDir` (relative to docsDir). The files are written by the
     * build and hold only a filter, never the commits — a new commit changes
     * no file, a new month adds one. Hand edits are overwritten.
     */
    monthlyPages: true,
    monthlyPagesDir: 'changelog',

    /**
     * Group the generated pages under a category per repository, so several
     * products can share one Changelog section. 'auto' collapses that level
     * while there is only one source.
     */
    groupByRepo: true,

    /** Category label for this repository. Defaults to the repo name. */
    selfLabel: 'FeastDocs',
  },
};
