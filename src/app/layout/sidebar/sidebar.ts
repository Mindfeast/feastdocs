import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { UiStateService } from '../../core/ui-state.service';
import type { SidebarItem } from '../../core/models';

const STORAGE_KEY = 'feastdocs:sidebar-collapsed';

/** One rendered line in the sidebar. The tree is flattened for rendering. */
interface Row {
  readonly key: string;
  readonly kind: 'doc' | 'category';
  readonly label: string;
  readonly slug: string | null;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly badge?: string;
  /** Pinned open by configuration: rendered without a toggle. */
  readonly locked?: boolean;
}

/**
 * The left sidebar. It shows the tree of the section the reader is currently
 * in — switching sections through the navbar tabs swaps the whole tree,
 * exactly like Docusaurus sidebars.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  protected readonly content = inject(ContentService);
  protected readonly ui = inject(UiStateService);
  private readonly router = inject(Router);

  protected readonly filterText = signal('');
  /** Categories pinned open by `expand: 'always'`; filled by readCollapsed. */
  private readonly locked = new Set<string>();
  private readonly collapsed = signal<ReadonlySet<string>>(this.readCollapsed());

  /** Ancestor category keys for each page, so the tree can reveal the active page. */
  private readonly ancestors = new Map<string, readonly string[]>();

  private readonly currentSlug = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.content.toSlug(this.router.url)),
      startWith(this.content.toSlug(this.router.url)),
    ),
    { initialValue: '' },
  );

  protected readonly section = computed(() => this.content.sectionOf(this.currentSlug()));

  /**
   * Sections for the mobile drawer, scoped to the version being read — the
   * drawer is the only navigation on a narrow screen, so listing another
   * version's sections there would be a trapdoor out of v1.
   */
  protected readonly visibleSections = computed(() =>
    this.content.sectionsFor(this.content.versionOf(this.currentSlug())),
  );

  protected readonly rows = computed<readonly Row[]>(() => {
    const section = this.section();
    if (!section) return [];
    const needle = this.filterText().trim().toLowerCase();
    return needle ? this.filteredRows(section.items, needle) : this.treeRows(section.items);
  });

  protected readonly hasResults = computed(() => this.rows().length > 0);

  constructor() {
    for (const section of this.content.sections) {
      this.indexAncestors(section.items, '', []);
    }

    // Reveal the active page's branch, without fighting a manual collapse of a
    // branch the reader isn't currently in.
    effect(() => {
      const slug = this.currentSlug();
      const trail = this.ancestors.get(slug);
      if (!trail?.length) return;
      this.collapsed.update((current) => {
        if (!trail.some((key) => current.has(key))) return current;
        const next = new Set(current);
        for (const key of trail) next.delete(key);
        this.persist(next);
        return next;
      });
    });
  }

  protected isActive(slug: string | null): boolean {
    return slug !== null && slug === this.currentSlug();
  }

  protected toggle(key: string): void {
    if (this.locked.has(key)) return;
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.persist(next);
      return next;
    });
  }

  protected prefetch(slug: string | null): void {
    if (slug !== null) this.content.prefetch(slug);
  }

  /** Normal mode: respects collapse state, hides children of collapsed nodes. */
  private treeRows(items: readonly SidebarItem[]): readonly Row[] {
    const collapsed = this.collapsed();
    const rows: Row[] = [];

    const walk = (list: readonly SidebarItem[], depth: number, parentKey: string): void => {
      for (const item of list) {
        if (item.type === 'doc') {
          rows.push({
            key: `${parentKey}/${item.slug}`,
            kind: 'doc',
            label: item.label,
            slug: item.slug,
            depth,
            expandable: false,
            expanded: false,
            badge: item.badge,
          });
          continue;
        }

        const key = `${parentKey}/${item.label}`;
        const locked = item.expand === 'always';
        const isCollapsed = !locked && collapsed.has(key);
        rows.push({
          key,
          kind: 'category',
          label: item.label,
          slug: item.slug,
          depth,
          expandable: !locked,
          expanded: !isCollapsed,
          locked,
        });
        if (!isCollapsed) walk(item.items, depth + 1, key);
      }
    };

    walk(items, 0, '');
    return rows;
  }

  /** Filter mode: flat list of matching pages, collapse state ignored. */
  private filteredRows(items: readonly SidebarItem[], needle: string): readonly Row[] {
    const rows: Row[] = [];

    const walk = (list: readonly SidebarItem[], trail: readonly string[]): void => {
      for (const item of list) {
        if (item.type === 'doc') {
          if (matches(item.label, trail, needle)) rows.push(flatRow(item.slug, item.label));
          continue;
        }
        if (item.slug !== null && matches(item.label, trail, needle)) {
          rows.push(flatRow(item.slug, item.label));
        }
        walk(item.items, [...trail, item.label]);
      }
    };

    walk(items, []);
    return rows;

    function flatRow(slug: string, label: string): Row {
      return { key: slug, kind: 'doc', label, slug, depth: 0, expandable: false, expanded: false };
    }
  }

  /** Keys must be built exactly as `treeRows` builds them, or expansion misses. */
  private indexAncestors(
    items: readonly SidebarItem[],
    parentKey: string,
    trail: readonly string[],
  ): void {
    for (const item of items) {
      if (item.type === 'doc') {
        this.ancestors.set(item.slug, trail);
        continue;
      }
      const key = `${parentKey}/${item.label}`;
      const nested = [...trail, key];
      if (item.slug !== null) this.ancestors.set(item.slug, nested);
      this.indexAncestors(item.items, key, nested);
    }
  }

  /**
   * Which categories start collapsed.
   *
   * Precedence, narrowest first: a category's own `expand`, then its legacy
   * `collapsed`, then the section's `expand`, then `sidebar.expand`.
   * A category pinned with `expand: 'always'` is never in this set and is
   * recorded in `locked` instead, so no stored state can close it.
   */
  private readCollapsed(): ReadonlySet<string> {
    const fromConfig = new Set<string>();

    for (const section of this.content.sections) {
      const mode = section.expand ?? this.content.site.sidebar.expand;

      const walk = (items: readonly SidebarItem[], parentKey: string): void => {
        for (const item of items) {
          if (item.type !== 'category') continue;
          const key = `${parentKey}/${item.label}`;

          if (item.expand === 'always') this.locked.add(key);
          else if (item.expand === true) {
            /* explicitly open */
          } else if (item.expand === false || item.collapsed) fromConfig.add(key);
          else if (mode !== 'all') fromConfig.add(key);

          walk(item.items, key);
        }
      };
      walk(section.items, '');
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const set = new Set<string>(JSON.parse(stored) as string[]);
        // A reader's own choices win, except over a pinned category.
        for (const key of this.locked) set.delete(key);
        return set;
      }
    } catch {
      // Unreadable or unparseable — fall back to the configured defaults.
    }
    return fromConfig;
  }

  private persist(keys: ReadonlySet<string>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
    } catch {
      // Collapse state is a convenience; losing it is not worth surfacing.
    }
  }
}

function matches(label: string, trail: readonly string[], needle: string): boolean {
  return [label, ...trail].join(' ').toLowerCase().includes(needle);
}
