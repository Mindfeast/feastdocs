/** Shapes shared between the build-time content pipeline and the app. */

export interface DocHeading {
  readonly id: string;
  readonly text: string;
  readonly level: number;
}

/** A fully rendered page. Loaded on demand — one lazy chunk per document. */
export interface DocContent {
  readonly slug: string;
  /** Top-level folder the page lives in, or null for root-level pages. */
  readonly section: string | null;
  readonly title: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly lastUpdated: string;
  /** From git history — the last person who committed a change to the file. */
  readonly lastAuthor: string | null;
  readonly showToc: boolean;
  readonly showSidebar: boolean;
  readonly tags: readonly string[];
  readonly headings: readonly DocHeading[];
  readonly prev: string | null;
  readonly next: string | null;
  /** Page-scoped CSS compiled from a sibling .scss file. */
  readonly css: string;
  readonly html: string;
  /** Version this page belongs to; empty when the site is unversioned. */
  readonly version?: string;
  /** Absolute edit URL, when a version supplies its own. */
  readonly editUrl?: string | null;
}

/** Metadata for every page, small enough to keep in the initial bundle. */
export interface DocSummary {
  readonly slug: string;
  readonly section: string | null;
  readonly title: string;
  readonly sidebarLabel: string;
  readonly description: string;
}

export interface SidebarDoc {
  readonly type: 'doc';
  readonly slug: string;
  readonly label: string;
  readonly position: number;
  /** Short marker shown before the label, e.g. an HTTP method. */
  readonly badge?: string;
}

export interface SidebarCategory {
  readonly type: 'category';
  readonly label: string;
  readonly position: number;
  readonly collapsed: boolean;
  /** Set when the folder has an index page, making the category itself clickable. */
  readonly slug: string | null;
  readonly items: readonly SidebarItem[];
  /**
   * 'always' keeps the category open and removes its toggle; true or false
   * set only the starting state. Unset follows the section.
   */
  readonly expand?: 'always' | boolean;
}

export type SidebarItem = SidebarDoc | SidebarCategory;

/**
 * A top-level documentation section — one folder directly under docs/, one tab
 * in the navbar, one sidebar tree of its own.
 */
/** One documented version of the site. */
export interface DocVersion {
  /** Stable id, e.g. 'v1'. Empty on an unversioned site. */
  readonly id: string;
  /** What the version switcher shows. */
  readonly label: string;
  /** Route prefix; empty for the default version, which owns the bare routes. */
  readonly prefix: string;
  readonly isDefault: boolean;
}

export interface DocSection {
  /** The folder name, which is also the slug prefix of every page inside. */
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly position: number;
  /** Landing page: the section's index.md, or its first page. */
  readonly slug: string;
  readonly items: readonly SidebarItem[];
  /** Version this section belongs to; empty when the site is unversioned. */
  readonly version?: string;
  /**
   * How this section's categories start: 'all' expanded, 'active' only the
   * branch holding the current page, 'none' collapsed. Unset follows
   * sidebar.autoCollapse.
   */
  readonly expand?: 'all' | 'active' | 'none';
}

export interface NavLink {
  readonly label: string;
  readonly to?: string;
  readonly href?: string;
}

export interface SiteConfig {
  readonly title: string;
  readonly tagline: string;
  /** Docs folder inside the repository — the GitHub backend prefixes paths with it. */
  readonly docsDir: string;
  readonly logo: string | null;
  readonly navbar: { readonly links: readonly NavLink[] };
  readonly footer: { readonly text: string; readonly links: readonly NavLink[] };
  readonly theme: {
    readonly defaultMode: ThemeMode;
    readonly accent: string;
    readonly accentDark: string;
  };
  readonly sidebar: {
    /** How a section's categories start when it does not say for itself. */
    readonly expand: 'all' | 'active' | 'none';
  };
  readonly editUrl: string | null;
  readonly showLastUpdated: boolean;
  /** Azure DevOps repository, for editing the deployed site in the browser. */
  readonly azureDevOps: {
    readonly baseUrl: string | null;
    readonly project: string | null;
    readonly repository: string | null;
    readonly branch: string;
  };
  /** Microsoft Entra ID sign-in. A null clientId means no sign-in is offered. */
  readonly entra: {
    readonly tenantId: string | null;
    readonly clientId: string | null;
    readonly devOpsScope: string | null;
  };
  readonly github: {
    /** 'owner/name', or null when GitHub-backed editing is not configured. */
    readonly repo: string | null;
    readonly branch: string;
    /** OAuth App client id for "Sign in with GitHub"; null = token paste only. */
    readonly oauthClientId: string | null;
    /**
     * OAuth scope requested at sign-in. 'public_repo' is enough for a public
     * repository and asks for far less on the consent screen; 'repo' is
     * required if the docs repository is private.
     */
    readonly oauthScope: string;
  };
  /**
   * Repository the navbar and footer source links point at, as 'owner/name'.
   * Defaults to github.repo. Set it when the code people should clone lives
   * somewhere other than the repository this site is edited and built from.
   */
  readonly sourceRepo: string | null;
  /**
   * Wording of the footer's source link. Defaults to "Source on GitHub", which
   * stops being accurate when sourceRepo points somewhere other than this
   * site's own code.
   */
  readonly sourceLabel: string | null;
  readonly editor: {
    /**
     * Label for the navbar's content-manager link, shown until a reader has
     * opened it once. null (the default) keeps a plain icon — teams running
     * their own docs already know the editor is there. Set it on a public
     * demo site, where visitors need the invitation.
     */
    readonly invite: string | null;
  };
  readonly changelog: {
    /** Whether the build generates a page per month under a category per year. */
    readonly monthlyPages: boolean;
    /** Folder holding those pages, relative to docsDir — also their route base. */
    readonly monthlyPagesDir: string;
    /** Whether pages are grouped under a category per repository. */
    readonly groupByRepo: boolean | 'auto';
  };
}

export type ThemeMode = 'light' | 'dark' | 'system';

/** Where one changelog source lives, so commit links work per host. */
export interface ChangelogSource {
  /** Display name — the category label for this repository's pages. */
  readonly title: string;
  /** Folder and route segment derived from the title. */
  readonly slug: string;
  /** Commit URL prefix — the hash is appended. null when unknown. */
  readonly commitUrl: string | null;
}

/** One repository commit, as shown by the <fd-changelog> component. */
export interface ChangelogEntry {
  readonly hash: string;
  readonly author: string;
  /** ISO date of the commit. */
  readonly date: string;
  /** Conventional-commit type (feat, fix, docs…) or null. */
  readonly type: string | null;
  /** Subject with any conventional-commit prefix removed. */
  readonly subject: string;
  readonly body: string;
  /** Files the commit touched, or null when the history came from the API. */
  readonly files: number | null;
  /** null when unknown — the GitHub commits endpoint carries no file list. */
  readonly touchesDocs: boolean | null;
}

export interface Breadcrumb {
  readonly label: string;
  readonly slug: string | null;
}

export interface SearchRecord {
  /** Version the page belongs to; empty on an unversioned site. */
  readonly version?: string;
  readonly slug: string;
  readonly section: string;
  readonly page: string;
  readonly anchor: string;
  readonly heading: string;
  readonly text: string;
}

export interface SearchHit {
  readonly slug: string;
  readonly anchor: string;
  readonly section: string;
  readonly page: string;
  readonly heading: string;
  readonly score: number;
  /** Pre-highlighted excerpt; already HTML-escaped by the search service. */
  readonly snippet: string;
}
