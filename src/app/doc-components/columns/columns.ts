import {
  Component,
  ElementRef,
  Input,
  ViewEncapsulation,
  afterNextRender,
  inject,
  numberAttribute,
} from '@angular/core';

/**
 * Side-by-side content — a comparison, a before/after, two short lists:
 *
 *   <fd-columns>
 *     <div column>
 *
 *     Left, as Markdown.
 *
 *     </div>
 *     <div column>
 *
 *     Right.
 *
 *     </div>
 *   </fd-columns>
 *
 * Columns collapse to a single stack on narrow screens, so nothing is ever
 * squeezed into an unreadable width on a phone.
 */
@Component({
  selector: 'fd-columns-internal',
  template: '<ng-content />',
  styleUrl: './columns.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocColumns {
  /** Minimum column width before wrapping, in rem. Default 14. */
  @Input({ transform: numberAttribute }) min = 14;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  constructor() {
    afterNextRender(() => {
      this.host.style.setProperty('--fd-columns-min', `${this.min}rem`);
      // An author who forgets the attribute still gets columns rather than a
      // single stack: treat every element child as one.
      for (const child of Array.from(this.host.children)) {
        child.classList.add('fd-columns__col');
      }
    });
  }
}
