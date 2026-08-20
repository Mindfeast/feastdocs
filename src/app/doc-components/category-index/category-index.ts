import { Component, Input, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DOC_INDEX, SECTIONS } from '../../generated/registry';
import type { DocSection, SidebarItem } from '../../core/models';

interface Card {
  readonly label: string;
  readonly description: string;
  readonly route: string | null;
  /** Number of pages inside, for a card that stands for a sub-category. */
  readonly pages: number | null;
}

/**
 * Cards for everything inside a category:
 *
 *   <fd-category-index></fd-category-index>
 *   <fd-category-index for="guide/advanced"></fd-category-index>
 *
 * The build puts this on any category that has no index.md of its own, which
 * would otherwise be a sidebar entry a reader cannot open. Authors can also
 * place it on their own index page to list the siblings below it.
 *
 * Without `for`, the current route is used — so a hand-written index.md needs
 * no argument.
 */
@Component({
  selector: 'fd-category-index-internal',
  imports: [RouterLink],
  templateUrl: './category-index.html',
  styleUrl: './category-index.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocCategoryIndex {
  /** Category path, e.g. 'guide/advanced'. Defaults to the current route. */
  @Input({ alias: 'for' }) path: string | null = null;

  private readonly router = inject(Router);
  private readonly current = signal<string | null>(null);

  protected readonly cards = computed<readonly Card[]>(() => {
    const target = this.path ?? this.current();
    if (target === null) return [];

    const items = findCategory(SECTIONS, target);
    if (items === null) return [];

    return items.map((item) => {
      if (item.type === 'doc') {
        return {
          label: item.label,
          description: DOC_INDEX.find((doc) => doc.slug === item.slug)?.description ?? '',
          route: `/${item.slug}`,
          pages: null,
        };
      }
      return {
        label: item.label,
        description: '',
        route: item.slug === null ? null : `/${item.slug}`,
        pages: countPages(item.items),
      };
    });
  });

  constructor() {
    // The path is stable for the life of the element: a navigation destroys the
    // page and the custom element with it.
    this.current.set(this.router.url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, ''));
  }
}

/** Depth-first search for the category owning `slug`. */
function findCategory(
  sections: readonly DocSection[],
  slug: string,
): readonly SidebarItem[] | null {
  const walk = (items: readonly SidebarItem[]): readonly SidebarItem[] | null => {
    for (const item of items) {
      if (item.type !== 'category') continue;
      if (item.slug === slug) return item.items;
      const found = walk(item.items);
      if (found !== null) return found;
    }
    return null;
  };

  for (const section of sections) {
    const found = walk(section.items);
    if (found !== null) return found;
  }
  return null;
}

function countPages(items: readonly SidebarItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.type === 'doc') total += 1;
    else total += countPages(item.items);
  }
  return total;
}
