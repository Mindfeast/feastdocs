---
title: Architecture
description: What each part of the framework does, and where to change things.
sidebar_position: 3
---

# Architecture

Two halves, one handoff. The content pipeline writes generated modules; the Angular
app imports them. Nothing else crosses the boundary.

## The pipeline

```text
docs/**/*.md            tools/build-content.mjs          src/app/generated/
docs/**/*.html    ──▶   ├── collect.mjs   scan, parse    ├── docs/<page>.ts
docs/**/*.scss          ├── markdown.mjs  render         ├── registry.ts
feastdocs.config.mjs    └── emit.mjs      write          └── site-config.ts
                                                          public/search-index.json
                                                          public/docs-assets/**
```

| File | Responsibility |
| --- | --- |
| `tools/lib/config.mjs` | Loads `feastdocs.config.mjs` and applies defaults |
| `tools/lib/collect.mjs` | Scans `docs/`, resolves slugs and titles, builds one sidebar tree per section, compiles page SCSS, validates links |
| `tools/lib/markdown.mjs` | markdown-it setup: admonitions, code fences, link and asset rewriting, heading collection |
| `tools/lib/emit.mjs` | Writes the generated modules, the search index, and the copied assets |
| `tools/dev.mjs` | Watches `docs/`, rebuilds, runs the Angular dev server and the editor API |
| `tools/editor-api.mjs` | Local file API behind the [content manager](./editor.md) |
| `tools/new-doc.mjs` | Scaffolds a new page |

Two details worth knowing when editing the pipeline:

- **Nothing is written unless it changed.** `writeIfChanged` compares content first,
  which is what stops a rebuild from retriggering the dev server in a loop.
- **Every language is loaded up front.** Fence languages are collected across all
  files before rendering starts, because markdown-it's highlight hook is synchronous
  and Shiki's grammar loading is not.

## The app

| Path | Responsibility |
| --- | --- |
| `src/app/core/content.service.ts` | Page lookup, lazy loading, breadcrumbs, reading order |
| `src/app/core/search.service.ts` | Fetches the index once, ranks results |
| `src/app/core/theme.service.ts` | Light/dark/system, persisted per reader |
| `src/app/pages/doc-page/` | Renders a page and everything around it |
| `src/app/layout/` | Navbar, sidebar, table of contents, search dialog |
| `src/styles/` | Tokens, base styles, and the global styles Markdown output needs |

## One route, many pages

There is a single wildcard route. The page component reads the URL, looks the slug up
in the generated registry, and imports that page's chunk:

```ts title="src/app/app.routes.ts"
export const routes: Routes = [
  { path: '**', loadComponent: () => import('./pages/doc-page/doc-page').then((m) => m.DocPage) },
];
```

Adding pages therefore never touches routing, and the initial bundle does not grow
with the size of the docs set — only `registry.ts`, which holds titles and the
section trees, is loaded up front.

## Why the rendered HTML is trusted

Page HTML is injected with `bypassSecurityTrustHtml`. That is deliberate: the HTML
was produced by this project's own build from files in this repository, and
sanitising it would strip exactly the SVG, `style` and `class` markup that authors
are invited to write.

:::danger This assumes the docs folder is trusted
The safety boundary is code review of `docs/`, the same as for any other source file.
If you ever render Markdown submitted from outside the repository, do not reuse this
path — sanitise it instead.
:::

## Progressive enhancement

Three things are added to a page after it renders, rather than being baked into the
generated HTML:

- **Copy buttons** on code blocks
- **Scroll tracking** for the table of contents, via `IntersectionObserver`
- **Link interception**, so a relative link inside Markdown navigates through the
  router instead of reloading the app

They live in `doc-page.ts` in an `afterRenderEffect`, which re-runs whenever the
document changes and cleans up the observer behind it.

## Where things are cached

| What | Where | Lifetime |
| --- | --- | --- |
| Rendered page chunks | `ContentService` map | The session |
| Search index | `SearchService` signal | First search onwards |
| Theme choice | `localStorage` | Until changed |
| Collapsed categories | `localStorage` | Until changed |
