import { DOCUMENT, Component, inject, input } from '@angular/core';
import type { DocHeading } from '../../core/models';

@Component({
  selector: 'app-toc',
  templateUrl: './toc.html',
  styleUrl: './toc.scss',
})
export class Toc {
  readonly headings = input.required<readonly DocHeading[]>();
  /** Heading currently in view, tracked by the page component's scroll spy. */
  readonly activeId = input<string | null>(null);

  private readonly document = inject(DOCUMENT);

  /**
   * Scrolls without a router navigation: the target already exists in the DOM,
   * and going through the router would re-run the page resolution for nothing.
   */
  protected jumpTo(event: Event, id: string): void {
    event.preventDefault();
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.document.defaultView?.history.replaceState(null, '', `#${id}`);
  }
}
