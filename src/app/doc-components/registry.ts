import { createCustomElement } from '@angular/elements';
import type { Injector, Type } from '@angular/core';
import { DocTabs } from './tabs/tabs';
import { DocSteps } from './steps/steps';
import { DocCounter } from './counter/counter';
import { DocApiField } from './api-field/api-field';

/**
 * Angular components that documentation authors can use directly in Markdown
 * or HTML pages. Each is registered as a custom element at bootstrap, so the
 * browser upgrades it wherever it appears — including inside the innerHTML
 * that rendered Markdown produces.
 *
 * To add one: build a normal standalone component, give it a tag here, and it
 * is immediately usable in every page as `<fd-your-tag>`.
 */
const DOC_ELEMENTS: ReadonlyArray<{ tag: string; component: Type<unknown> }> = [
  { tag: 'fd-tabs', component: DocTabs },
  { tag: 'fd-steps', component: DocSteps },
  { tag: 'fd-counter', component: DocCounter },
  { tag: 'fd-api-field', component: DocApiField },
];

/** Idempotent: registering the same tag twice throws, so check first. */
export function registerDocElements(injector: Injector): void {
  for (const { tag, component } of DOC_ELEMENTS) {
    if (!customElements.get(tag)) {
      customElements.define(tag, createCustomElement(component, { injector }));
    }
  }
}
