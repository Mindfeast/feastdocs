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
}

export interface SidebarCategory {
  readonly type: 'category';
  readonly label: string;
  readonly position: number;
  readonly collapsed: boolean;
  /** Set when the folder has an index page, making the category itself clickable. */
  readonly slug: string | null;
  readonly items: readonly SidebarItem[];
}

export type SidebarItem = SidebarDoc | SidebarCategory;

/**
 * A top-level documentation section — one folder directly under docs/, one tab
 * in the navbar, one sidebar tree of its own.
 */
export interface DocSection {
  /** The folder name, which is also the slug prefix of every page inside. */
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly position: number;
  /** Landing page: the section's index.md, or its first page. */
  readonly slug: string;
  readonly items: readonly SidebarItem[];
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
  readonly sidebar: { readonly autoCollapse: boolean };
  readonly editUrl: string | null;
  readonly showLastUpdated: boolean;
  readonly github: {
    /** 'owner/name', or null when GitHub-backed editing is not configured. */
    readonly repo: string | null;
    readonly branch: string;
  };
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Breadcrumb {
  readonly label: string;
  readonly slug: string | null;
}

export interface SearchRecord {
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
