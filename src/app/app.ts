import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ContentService } from './core/content.service';
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

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.ui.closeSidebar());
  }

}

