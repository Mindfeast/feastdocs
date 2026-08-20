import { Component, Input, ViewEncapsulation, booleanAttribute } from '@angular/core';

/**
 * API reference row for documenting options and parameters:
 *
 *   <fd-api-field name="sidebar_position" type="number" default="999">
 *     Sort order among sibling pages.
 *   </fd-api-field>
 *
 * The description is the element's own content, projected into the body slot —
 * it can carry markdown output (inline code, links) untouched.
 */
@Component({
  selector: 'fd-api-field-internal',
  templateUrl: './api-field.html',
  styleUrl: './api-field.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocApiField {
  @Input() name = '';
  @Input() type = '';
  @Input() default = '';
  @Input({ transform: booleanAttribute }) required = false;
}
