import { Component, forwardRef, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';
import type { SidebarItem } from '../../core/models';

/**
 * One level of the navbar dropdown, rendering itself recursively for nested
 * categories — submenus inside submenus, to any depth the docs folder has.
 * Open/close is pure CSS (:hover / :focus-within), so keyboard users get the
 * same flyouts as mouse users with no JS state to break.
 */
@Component({
  selector: 'app-nav-menu',
  // The component renders itself for nested levels; forwardRef breaks the
  // self-reference cycle at decorator-evaluation time.
  imports: [RouterLink, forwardRef(() => NavMenu)],
  templateUrl: './nav-menu.html',
  styleUrl: './nav-menu.scss',
})
export class NavMenu {
  readonly items = input.required<readonly SidebarItem[]>();
  /** Nested levels fly out to the side instead of dropping down. */
  readonly nested = input(false);

  private readonly content = inject(ContentService);

  protected prefetch(slug: string | null): void {
    if (slug !== null) this.content.prefetch(slug);
  }
}
