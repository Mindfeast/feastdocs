import { Injectable } from '@angular/core';
import { DOC_INDEX, DOC_LOADERS, SECTIONS } from '../generated/registry';
import { SITE } from '../generated/site-config';
import type { Breadcrumb, DocContent, DocSection, DocSummary, SidebarItem } from './models';

/**
 * Single entry point to the generated content: page lookup, lazy loading,
 * section resolution, breadcrumbs and reading order.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  readonly site = SITE;
  readonly sections = SECTIONS;
  readonly pages = DOC_INDEX;

  private readonly summaries = new Map<string, DocSummary>(
    DOC_INDEX.map((page) => [page.slug, page]),
  );
  private readonly sectionById = new Map<string, DocSection>(
    SECTIONS.map((section) => [section.id, section]),
  );
  private readonly loaded = new Map<string, DocContent>();
  private readonly inFlight = new Map<string, Promise<DocContent | null>>();
  private readonly trails = new Map<string, readonly Breadcrumb[]>();
  private readonly sectionOfSlug = new Map<string, string>();

  constructor() {
    for (const section of SECTIONS) {
      this.indexTrails(section, section.items, []);
    }
  }

  /** Normalises a URL path into a slug: strips slashes, decodes escapes. */
  toSlug(path: string): string {
    const clean = path.split(/[?#]/, 1)[0];
    return decodeURIComponent(clean).replace(/^\/+|\/+$/g, '');
  }

  exists(slug: string): boolean {
    return Object.hasOwn(DOC_LOADERS, slug);
  }

  summary(slug: string): DocSummary | undefined {
    return this.summaries.get(slug);
  }

  /** The section a page belongs to, resolved through the sidebar trees. */
  sectionOf(slug: string): DocSection | undefined {
    const id = this.sectionOfSlug.get(slug) ?? this.summaries.get(slug)?.section ?? undefined;
    return id == null ? undefined : this.sectionById.get(id);
  }

  breadcrumbs(slug: string): readonly Breadcrumb[] {
    return this.trails.get(slug) ?? [];
  }

  /** Where a bare `/` should land when there is no docs/index.md. */
  firstSlug(): string | null {
    return this.sections[0]?.slug ?? this.pages[0]?.slug ?? null;
  }

  /** Loads a page, memoising both the result and any request already running. */
  async load(slug: string): Promise<DocContent | null> {
    const cached = this.loaded.get(slug);
    if (cached) return cached;

    const pending = this.inFlight.get(slug);
    if (pending) return pending;

    const loader = Object.hasOwn(DOC_LOADERS, slug) ? DOC_LOADERS[slug] : undefined;
    if (!loader) return null;

    const request = loader()
      .then((module) => {
        this.loaded.set(slug, module.default);
        return module.default;
      })
      .finally(() => this.inFlight.delete(slug));

    this.inFlight.set(slug, request);
    return request;
  }

  /** Warms the chunk for a page without blocking — used on sidebar hover. */
  prefetch(slug: string): void {
    if (this.loaded.has(slug) || this.inFlight.has(slug)) return;
    // A failed warm-up is not an event: if the chunk is truly unreachable the
    // real navigation will find out and recover. Hovering must never error.
    void this.load(slug).catch(() => {});
  }

  private indexTrails(
    section: DocSection,
    items: readonly SidebarItem[],
    trail: readonly Breadcrumb[],
  ): void {
    for (const item of items) {
      if (item.type === 'doc') {
        this.trails.set(item.slug, trail);
        this.sectionOfSlug.set(item.slug, section.id);
        continue;
      }

      const crumb: Breadcrumb = { label: item.label, slug: item.slug };
      if (item.slug != null) {
        this.trails.set(item.slug, trail);
        this.sectionOfSlug.set(item.slug, section.id);
      }
      this.indexTrails(section, item.items, [...trail, crumb]);
    }
  }
}
