import { Component, ElementRef, ViewEncapsulation, afterNextRender, inject } from '@angular/core';

/**
 * Numbered step list for tutorials:
 *
 *   <fd-steps>
 *     <div step="Install the CLI">…markdown…</div>
 *     <div step="Configure">…</div>
 *   </fd-steps>
 *
 * The component decorates the authored DOM in place instead of re-rendering
 * it, so everything inside the steps (code blocks, admonitions, nested
 * custom elements) keeps working untouched.
 */
@Component({
  selector: 'fd-steps-internal',
  // <ng-content> is required: @angular/elements extracts the element's
  // light-DOM children as projectable nodes on upgrade, and without a
  // projection slot they are dropped.
  template: '<ng-content />',
  styleUrl: './steps.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocSteps {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private decorated = false;

  constructor() {
    // Decorate on a microtask: at upgrade time the light-DOM children already
    // exist, and a microtask fires even when no application render follows —
    // which is the case in the editor's live preview, where innerHTML
    // recreates the element on every keystroke. afterNextRender stays as a
    // fallback for any environment where the microtask is somehow too early;
    // decoration is idempotent, so running both costs nothing.
    queueMicrotask(() => this.decorate());
    afterNextRender(() => this.decorate());
  }

  private decorate(): void {
    if (this.decorated) return;
    const document = this.host.nativeElement.ownerDocument;
    const steps = Array.from(this.host.nativeElement.querySelectorAll(':scope > [step]'));
    if (steps.length === 0) return;
    this.decorated = true;

    steps.forEach((step, index) => {
      step.classList.add('fd-steps__item');

      const header = document.createElement('div');
      header.className = 'fd-steps__header';

      const marker = document.createElement('span');
      marker.className = 'fd-steps__marker';
      marker.textContent = String(index + 1);

      const title = document.createElement('span');
      title.className = 'fd-steps__title';
      title.textContent = step.getAttribute('step') ?? '';

      header.append(marker, title);
      step.prepend(header);
    });

    this.host.nativeElement.classList.add('fd-steps');
  }
}
