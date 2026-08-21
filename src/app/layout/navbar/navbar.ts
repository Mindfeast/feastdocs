import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { ThemeService } from '../../core/theme.service';
import { UiStateService } from '../../core/ui-state.service';
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
  protected readonly sections = this.content.sections;

  private readonly currentSlug = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.content.toSlug(this.router.url)),
      startWith(this.content.toSlug(this.router.url)),
    ),
    { initialValue: '' },
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
