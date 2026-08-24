import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { ThemeService } from '../../core/theme.service';
import { UiStateService } from '../../core/ui-state.service';
import type { SidebarItem } from '../../core/models';
import { NavMenu } from '../nav-menu/nav-menu';
import { SearchBox } from '../search-box/search-box';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, NavMenu, SearchBox],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  protected readonly content = inject(ContentService);
  protected readonly ui = inject(UiStateService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly site = this.content.site;

  /**
   * Repository the source link points at: sourceRepo when set, otherwise the
   * one the site is built from. Null hides the link.
   */
  protected readonly repoUrl = (() => {
    const repo = this.content.site.sourceRepo ?? this.content.site.github.repo;
    return repo === null ? null : `https://github.com/${repo}`;
  })();
  /** Only the current version's sections — a v1 reader sees v1's tabs. */
  protected readonly sections = computed(() =>
    this.content.sectionsFor(this.content.versionOf(this.currentSlug())),
  );

  protected readonly versions = this.content.versions;
  protected readonly versioned = this.content.versioned;
  protected readonly currentVersion = computed(() => this.content.versionOf(this.currentSlug()));

  /**
   * Switching version keeps the reader on the same page when the other version
   * has it, and lands on that version's first section when it does not.
   */
  protected onVersionChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const target = this.content.versions.find((version) => version.id === id);
    if (!target) return;
    void this.router.navigateByUrl(`/${this.content.translate(this.currentSlug(), target)}`);
  }

  private readonly currentSlug = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.content.toSlug(this.router.url)),
      startWith(this.content.toSlug(this.router.url)),
    ),
    { initialValue: '' },
  );

  // --- Overflowing section tabs ----------------------------------------------

  /**
   * How many tabs fit, and the rest behind a "More" menu. A site with a dozen
   * sections needs more width than a laptop has, and the strip has nowhere to
   * go: it would either push the search box off the row or clip the last tabs
   * where nothing can reach them.
   */
  private readonly sectionsNav = viewChild<ElementRef<HTMLElement>>('sectionsNav');

  /** Room the strip actually has, tracked by a ResizeObserver. */
  private readonly available = signal(Number.POSITIVE_INFINITY);

  /**
   * Each tab's own width, measured once while they are all on screen — once
   * some are in the menu they are no longer in the DOM to measure. Keyed by the
   * section list so switching version re-measures.
   */
  private readonly tabWidths = signal<readonly number[]>([]);
  private measuredFor: string | null = null;

  /** Width of the More tab, measured when it is up; the default is close. */
  private readonly moreWidth = signal(76);

  /** The gap between tabs, from the stylesheet. */
  private static readonly GAP = 4;

  protected readonly visibleCount = computed(() => {
    const widths = this.tabWidths();
    const room = this.available();
    const total = this.sections().length;
    // Before the first measurement every tab is rendered — that is what makes
    // the measurement possible.
    if (widths.length !== total || room === Number.POSITIVE_INFINITY) return total;

    const span = (n: number) =>
      widths.slice(0, n).reduce((sum, width) => sum + width + Navbar.GAP, 0);

    if (span(total) <= room) return total;

    // One of them has to become the More tab's room, so count down until both
    // the tabs and the button fit.
    let n = total - 1;
    while (n > 0 && span(n) + this.moreWidth() + Navbar.GAP > room) n--;
    return n;
  });

  /**
   * True until the tabs have been measured. The strip clips while it is, so a
   * full set cannot spill over the search box; afterwards it must not clip, or
   * it would cut off the menu that hangs below it.
   */
  protected readonly measuring = computed(() => this.tabWidths().length === 0);

  protected readonly visibleSections = computed(() =>
    this.sections().slice(0, this.visibleCount()),
  );
  protected readonly overflowSections = computed(() => this.sections().slice(this.visibleCount()));

  /**
   * The overflow, shaped as menu items so it can use the same component every
   * other tab uses. A section becomes a branch when it has a tree to fly out
   * and a plain link when it does not — a branch with nothing behind it would
   * show a chevron pointing at an empty panel.
   */
  protected readonly overflowMenu = computed<readonly SidebarItem[]>(() =>
    this.overflowSections().map((section) =>
      section.items.length > 0
        ? {
            type: 'category' as const,
            label: section.label,
            position: section.position,
            collapsed: false,
            slug: section.slug,
            items: section.items,
          }
        : {
            type: 'doc' as const,
            label: section.label,
            position: section.position,
            slug: section.slug,
          },
    ),
  );

  /** The More tab carries the active mark when the active section is inside it. */
  protected readonly activeInOverflow = computed(() =>
    this.overflowSections().some((section) => section.id === this.activeSection()),
  );

  /** Which section tab is active, resolved from the current page. */
  protected readonly activeSection = computed(
    () => this.content.sectionOf(this.currentSlug())?.id ?? null,
  );

  /**
   * Dropdown being force-closed after a click. Opening is pure CSS
   * (:hover/:focus-within), but closing needs help twice over: a clicked link
   * keeps focus (pinning :focus-within), and the pointer is still over the
   * panel (pinning :hover). Clicking blurs the link and suppresses the tab's
   * dropdown until the pointer leaves it.
   */
  protected readonly suppressedTab = signal<string | null>(null);

  constructor() {
    // Watch the strip, not the window: it is the leftover space between the
    // brand and the actions that decides how many tabs fit, and that changes
    // when the search box or the version select does, not only on resize.
    effect((onCleanup) => {
      const nav = this.sectionsNav()?.nativeElement;
      // Absent under the test renderer, which has no layout to observe anyway.
      // The width read during rendering still gives the strip a real number.
      if (!nav || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        this.available.set(entry.contentRect.width);
      });
      observer.observe(nav);
      onCleanup(() => observer.disconnect());
    });

    afterRenderEffect(() => {
      const sections = this.sections();
      const nav = this.sectionsNav()?.nativeElement;
      // Sections arrive with the first navigation; measuring an empty strip
      // would cache an empty answer.
      if (!nav || sections.length === 0) return;

      // Seed the width here rather than waiting on the observer. Its first
      // delivery is asynchronous, and until it lands the strip believes it has
      // unlimited room and draws every tab — which is the state the reader sees
      // on load, when it matters most.
      this.available.set(nav.clientWidth);

      const more = nav.querySelector<HTMLElement>('.fd-navbar__tab--more');
      if (more) this.moreWidth.set(more.getBoundingClientRect().width);

      // Read before any early return: this is what makes the effect depend on
      // the widths, and so run again on the pass that clears them. Returning
      // first would drop the dependency and nothing would ever measure.
      const widths = this.tabWidths();

      const key = sections.map((section) => section.id).join('|');
      if (key !== this.measuredFor) {
        this.measuredFor = key;
        // Clearing puts every tab back on screen; the render that causes is the
        // one with a full set to measure.
        if (widths.length > 0) {
          this.tabWidths.set([]);
          return;
        }
      }
      if (widths.length === sections.length) return;

      const tabs = nav.querySelectorAll<HTMLElement>('.fd-navbar__tab:not(.fd-navbar__tab--more)');
      // Only trustworthy while every tab is up; any other moment is a partial
      // render that would measure the wrong set.
      if (tabs.length !== sections.length) return;
      this.tabWidths.set([...tabs].map((tab) => tab.getBoundingClientRect().width));
    });
  }

  protected onTabClick(event: MouseEvent, sectionId: string): void {
    const link = (event.target as HTMLElement | null)?.closest('a');
    if (!link) return;
    link.blur();
    this.suppressedTab.set(sectionId);
  }

  /**
   * The content-manager invitation: only when a site asks for one, and only
   * until this reader has actually opened the editor.
   */
  protected readonly showEditorInvite = computed(
    () => this.site.editor.invite !== null && !this.ui.editorVisited(),
  );

  protected readonly themeLabel = computed(() =>
    this.theme.resolved() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
}
