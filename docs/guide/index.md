---
title: Introduction
description: What FeastDocs is, and the model behind it.
sidebar_label: Introduction
---

# Introduction

FeastDocs is a documentation framework built on Angular. You write **Markdown, HTML
and SCSS** in the `docs/` folder; it gives you a fast, searchable app with sections,
sidebars and theming — none of which you maintain by hand.

## The model

Three ideas carry the whole framework:

1. **Folders are navigation.** Every top-level folder in `docs/` is a _section_ — a
   tab in the navbar with its own sidebar. Folders inside a section are sidebar
   categories. Files are pages.
2. **Content is compiled.** Markdown rendering, syntax highlighting, SCSS
   compilation and the search index all happen at build time. The browser receives
   finished HTML, one lazy chunk per page.
3. **Components are elements.** Angular components are registered as custom
   elements, so `<fd-tabs>` or `<fd-counter>` work inside any Markdown file — live,
   with real state. See the [Components](/components) section.

## The layout you get

```text
┌───────────────────────────────────────────────────┐
│  Brand   Guide  Reference  Components    🔍  🌓   │  ← sections as tabs
├──────────────┬─────────────────────────┬──────────┤
│  Sidebar of  │       Page content      │ On this  │
│  the current │   (compiled Markdown)   │  page    │
│  section     │                         │          │
└──────────────┴─────────────────────────┴──────────┘
```

## Where to go next

<fd-steps>
  <div step="Install and run">

[Installation](./installation.md) — clone, `npm install`, `npm start`.

  </div>
  <div step="Create pages and sections">

[Pages & sections](./pages.md) — how files map to routes, tabs and sidebars.

  </div>
  <div step="Learn the Markdown extras">

[Markdown features](./markdown.md) — admonitions, code titles, attributes, links.

  </div>
  <div step="Style it">

[Styling](./styling.md) — design tokens, site overrides, page-scoped SCSS.

  </div>
</fd-steps>
