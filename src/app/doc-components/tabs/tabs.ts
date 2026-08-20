import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

interface TabPane {
  readonly label: string;
  readonly html: string;
}

/**
 * Tab group for Markdown. Authors write plain divs with a `tab` attribute:
 *
 *   <fd-tabs>
 *     <div tab="npm">…rendered markdown…</div>
 *     <div tab="pnpm">…</div>
 *   </fd-tabs>
 *
 * The panes are read from the projected DOM after upgrade, because content
 * arriving through innerHTML is not Angular content projection.
 */
@Component({
  selector: 'fd-tabs-internal',
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  // The panes carry markdown-rendered HTML styled by global .fd-markdown
  // rules, so emulated encapsulation would cut those styles off.
  encapsulation: ViewEncapsulation.None,
})
export class DocTabs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly panes = signal<readonly TabPane[]>([]);
  protected readonly active = signal(0);

  /** Pane HTML comes from the build's own markdown output — same trust as the page. */
  protected trust(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private readonly source = viewChild<ElementRef<HTMLElement>>('source');

  constructor() {
    // Microtask first: it fires even when no application render follows (the
    // editor preview recreates this element on every keystroke), with
    // afterNextRender as fallback. Extraction is idempotent via the guard.
    queueMicrotask(() => this.extractPanes());
    afterNextRender(() => this.extractPanes());
  }

  private extractPanes(): void {
    if (this.panes().length > 0) return;
    const container = this.source()?.nativeElement;
    if (!container) return;
    const panes: TabPane[] = [];
    for (const child of Array.from(container.querySelectorAll(':scope > [tab]'))) {
      panes.push({ label: child.getAttribute('tab') ?? '', html: child.innerHTML });
      child.remove();
    }
    if (panes.length > 0) this.panes.set(panes);
  }

  protected select(index: number): void {
    this.active.set(index);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const total = this.panes().length;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % total;
    if (event.key === 'ArrowLeft') next = (index - 1 + total) % total;
    if (next !== null) {
      event.preventDefault();
      this.active.set(next);
      const buttons = this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.fd-tabs__tab');
      buttons[next]?.focus();
    }
  }
}
