import { Component, Input, ViewEncapsulation, booleanAttribute } from '@angular/core';

/**
 * Collapsible content — an FAQ answer, a long example, a detour:
 *
 *   <fd-expandable title="Why does this happen?">
 *
 *   Markdown, surrounded by blank lines.
 *
 *   </fd-expandable>
 *
 * Built on native <details>, so it opens without JavaScript, is keyboard
 * operable, and the browser's find-in-page can open it to reveal a match.
 */
@Component({
  selector: 'fd-expandable-internal',
  template: `
    <details class="fd-expandable" [open]="open">
      <summary class="fd-expandable__summary">{{ title }}</summary>
      <div class="fd-expandable__body"><ng-content /></div>
    </details>
  `,
  styleUrl: './expandable.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocExpandable {
  /** The always-visible line. */
  @Input() title = 'Details';
  /** Start expanded. */
  @Input({ transform: booleanAttribute }) open = false;
}
