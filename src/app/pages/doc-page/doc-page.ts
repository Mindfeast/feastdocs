import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { Toc } from '../../layout/toc/toc';
import type { DocContent } from '../../core/models';

/** Keeps the highlighted heading below the sticky navbar rather than under it. */
const SPY_TOP_OFFSET = 72;

@Component({
  selector: 'app-doc-page',
  imports: [RouterLink, DatePipe, Toc],
  templateUrl: './doc-page.html',
  styleUrl: './doc-page.scss',
})
export class DocPage {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);

  protected readonly content = inject(ContentService);
  protected readonly site = this.content.site;

  private readonly article = viewChild<ElementRef<HTMLElement>>('article');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly slug = computed(() => this.content.toSlug(this.url()));
  private readonly fragment = computed(() => {
    const index = this.url().indexOf('#');
    return index === -1 ? null : decodeURIComponent(this.url().slice(index + 1));
  });

  protected readonly doc = signal<DocContent | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
  protected readonly activeHeading = signal<string | null>(null);

  protected readonly html = computed(() => {
    const doc = this.doc();
    // The HTML is produced by our own build from local files, so it is trusted
    // on purpose — sanitising it would strip the SVG, style and class markup
    // that authors are explicitly allowed to write.
    return doc ? this.sanitizer.bypassSecurityTrustHtml(doc.html) : null;
  });

  protected readonly breadcrumbs = computed(() => this.content.breadcrumbs(this.slug()));
  protected readonly prev = computed(() => {
    const target = this.doc()?.prev;
    return target ? this.content.summary(target) : undefined;
  });
  protected readonly next = computed(() => {
    const target = this.doc()?.next;
    return target ? this.content.summary(target) : undefined;
  });

  protected readonly editLink = computed(() => {
    const doc = this.doc();
    // A generated page (a category index with no index.md) has no source file
    // to edit, and reports an empty path.
    if (!doc || !this.site.editUrl || !doc.sourcePath) return null;
    return `${this.site.editUrl.replace(/\/?$/, '/')}${doc.sourcePath}`;
  });

  /** Guards against an older chunk resolving after a newer navigation. */
  private requestId = 0;
  private styleElement: HTMLStyleElement | null = null;
  /** `slug#fragment` already scrolled to, so the jump happens exactly once. */
  private scrolledTo: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.applyPageStyles(''));

    effect(() => {
      const slug = this.slug();
      const id = ++this.requestId;
      this.state.set('loading');

      void this.content
        .load(slug)
        .catch(() => {
          if (id !== this.requestId) return null;
          // A dynamic import failing almost always means this tab was loaded
          // from an older build and the hashed chunk names have moved on —
          // routine in dev, guaranteed in production after a redeploy. One
          // full reload resyncs the app; the guard stops a reload loop when
          // the chunk is genuinely unreachable.
          const window = this.document.defaultView;
          const RETRY_KEY = 'feastdocs:chunk-retry';
          try {
            if (window && window.sessionStorage.getItem(RETRY_KEY) !== slug) {
              window.sessionStorage.setItem(RETRY_KEY, slug);
              window.location.reload();
              return null;
            }
          } catch {
            // Storage unavailable — fall through to the not-found state.
          }
          return null;
        })
        .then((doc) => {
          if (id !== this.requestId) return;

          if (!doc) {
            // A bare `/` with no docs/index.md lands on the first real page.
            const fallback = slug === '' ? this.content.firstSlug() : null;
            if (fallback) {
              void this.router.navigate(['/' + fallback], { replaceUrl: true });
              return;
            }
            this.doc.set(null);
            this.applyPageStyles('');
            this.state.set('missing');
            this.titleService.setTitle(`Not found · ${this.site.title}`);
            return;
          }

          // A page loaded, so the app and its chunks are in sync again — the
          // stale-build retry (see the catch above) may fire afresh next time.
          try {
            this.document.defaultView?.sessionStorage.removeItem('feastdocs:chunk-retry');
          } catch {
            // Storage unavailable — the guard simply stays conservative.
          }

          this.doc.set(doc);
          this.activeHeading.set(doc.headings[0]?.id ?? null);
          this.applyPageStyles(doc.css);
          this.state.set('ready');
          // The landing page is usually titled after the site itself; avoid
          // "FeastDocs · FeastDocs".
          this.titleService.setTitle(
            doc.title === this.site.title ? this.site.title : `${doc.title} · ${this.site.title}`,
          );
          this.metaService.updateTag({
            name: 'description',
            content: doc.description || this.site.tagline,
          });
        });
    });

    // Progressive enhancement of the rendered markdown. Re-runs whenever the
    // document or the target anchor changes, because the previous DOM is thrown
    // away with it.
    //
    // Every signal is read before the first early return on purpose: bailing out
    // early would narrow the tracked dependencies and the effect would stop
    // re-running when the others change.
    afterRenderEffect((onCleanup) => {
      const doc = this.doc();
      const fragment = this.fragment();
      const host = this.article()?.nativeElement;
      if (!doc || !host) return;

      // Position the page once per URL: at the requested heading if there is
      // one, at the top otherwise. Guarded so a later re-render never yanks the
      // reader away from where they scrolled to.
      const target = `${doc.slug}#${fragment ?? ''}`;
      if (this.scrolledTo !== target) {
        this.scrolledTo = target;
        if (fragment) {
          this.document
            .getElementById(fragment)
            ?.scrollIntoView({ block: 'start', behavior: 'instant' });
        } else {
          this.document.defaultView?.scrollTo({ top: 0, behavior: 'instant' });
        }
      }

      const observer = this.watchHeadings(host);
      onCleanup(() => observer?.disconnect());
    });
  }

  /**
   * Routes clicks on generated links instead of letting the browser reload the
   * app, and handles in-page anchors directly.
   */
  protected onContentClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;

    // Copy buttons are handled by delegation so they keep working inside
    // components that re-render markdown through innerHTML (e.g. fd-tabs).
    const copy = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.fd-code__copy');
    if (copy) {
      void this.copyCode(copy);
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!anchor || !href) return;
    if (anchor.target === '_blank') return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return;
    // Downloads and images live outside the router.
    if (href.startsWith('/docs-assets/')) return;

    if (href.startsWith('#')) {
      event.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.document.defaultView?.history.replaceState(null, '', `#${id}`);
      return;
    }

    event.preventDefault();
    const [path, hash] = href.split('#');
    void this.router.navigate([path], { fragment: hash || undefined });
  }

  /** Page-scoped CSS from a sibling .scss file, swapped in as one <style> tag. */
  private applyPageStyles(css: string): void {
    if (!css) {
      this.styleElement?.remove();
      this.styleElement = null;
      return;
    }
    if (!this.styleElement) {
      this.styleElement = this.document.createElement('style');
      this.styleElement.dataset['feastdocsPage'] = '';
      this.document.head.appendChild(this.styleElement);
    }
    this.styleElement.textContent = css;
  }

  private async copyCode(button: HTMLButtonElement): Promise<void> {
    const code = button.closest('.fd-code')?.querySelector('code')?.textContent ?? '';
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
    } catch {
      // Clipboard access can be denied (insecure origin, permissions).
      button.textContent = 'Failed';
    }
    this.document.defaultView?.setTimeout(() => (button.textContent = 'Copy'), 1600);
  }

  private watchHeadings(host: HTMLElement): IntersectionObserver | null {
    const headings = host.querySelectorAll<HTMLElement>('h2[id], h3[id]');
    if (headings.length === 0) return null;

    const view = this.document.defaultView;
    if (!view || typeof view.IntersectionObserver !== 'function') return null;

    const observer = new view.IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topmost) this.activeHeading.set(topmost.target.id);
      },
      { rootMargin: `-${SPY_TOP_OFFSET}px 0px -65% 0px`, threshold: 0 },
    );

    headings.forEach((heading) => observer.observe(heading));
    return observer;
  }
}
