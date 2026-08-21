import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ContentService } from './core/content.service';
import { SearchService } from './core/search.service';
import { ThemeService } from './core/theme.service';
import { UiStateService } from './core/ui-state.service';
import { Navbar } from './layout/navbar/navbar';
import { Sidebar } from './layout/sidebar/sidebar';
import { Footer } from './layout/footer/footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Sidebar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly content = inject(ContentService);
  protected readonly ui = inject(UiStateService);

  // Instantiated for its side effect: it paints the theme on the root element.
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly search = inject(SearchService);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.ui.closeSidebar();
        // Search follows the reader between versions, so a v1 query never
        // returns v2 pages.
        this.search.version.set(this.content.versionOf(this.content.toSlug(this.router.url)).id);
      });

    // The first page load never fires NavigationEnd before this runs.
    this.search.version.set(this.content.versionOf(this.content.toSlug(this.router.url)).id);
  }
}
