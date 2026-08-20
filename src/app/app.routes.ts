import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Content manager: create and edit docs with a live preview (dev only —
    // it needs the local file API that `npm start` runs).
    path: '_editor',
    loadComponent: () => import('./pages/editor/editor').then((m) => m.Editor),
  },
  {
    // Every other URL maps to a document. The page component resolves the slug
    // itself and renders a not-found state when nothing in the generated
    // registry matches.
    path: '**',
    loadComponent: () => import('./pages/doc-page/doc-page').then((m) => m.DocPage),
  },
];
