import {
  ApplicationConfig,
  inject,
  Injector,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { registerDocElements } from './doc-components/registry';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Scrolling is deliberately left to the page component. The router cannot
    // know when the markdown for a page has actually been written to the DOM,
    // and its own scroll handling would race the anchor jump.
    provideRouter(routes),
    // Doc components (<fd-tabs>, <fd-counter>, …) are custom elements so the
    // browser upgrades them anywhere they appear — including inside the
    // innerHTML that rendered Markdown produces.
    provideAppInitializer(() => {
      registerDocElements(inject(Injector));
    }),
  ],
};
