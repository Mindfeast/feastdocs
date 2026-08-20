import { Component, Input, ViewEncapsulation, numberAttribute, signal } from '@angular/core';

/**
 * Deliberately small interactive component that proves live Angular state
 * works inside a Markdown page:
 *
 *   <fd-counter start="10" step="5"></fd-counter>
 *
 * Attributes map to inputs automatically through @angular/elements.
 */
@Component({
  selector: 'fd-counter-internal',
  templateUrl: './counter.html',
  styleUrl: './counter.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocCounter {
  protected readonly value = signal(0);

  @Input({ transform: numberAttribute })
  set start(value: number) {
    if (Number.isFinite(value)) this.value.set(value);
  }

  @Input({ transform: numberAttribute }) step = 1;

  protected add(direction: 1 | -1): void {
    const step = Number.isFinite(this.step) ? this.step : 1;
    this.value.update((current) => current + direction * step);
  }
}
