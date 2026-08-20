---
title: Tabs
description: Tabbed content for package managers, languages, or platforms.
sidebar_position: 2
---

# Tabs

`<fd-tabs>` renders its children as a tab group. Each pane is a `div` with a `tab`
attribute naming its label.
  
## Example

```html
<fd-tabs>
  <div tab="npm">

  ```bash
  npm install feastdocs
  ```

  </div>
  <div tab="pnpm">

  ```bash
  pnpm add feastdocs
  ```

  </div>
  <div tab="yarn">

  ```bash
  yarn add feastdocs
  ```

  </div>
</fd-tabs>
```

Renders as:

<fd-tabs>
  <div tab="npm">

```bash
npm install feastdocs
```

  </div>
  <div tab="pnpm">

```bash
pnpm add feastdocs
```

  </div>
  <div tab="yarn">

```bash
yarn add feastdocs
```

  </div>
</fd-tabs>

The blank lines around the fenced blocks are what makes Markdown render inside the
HTML panes — without them the content stays literal.

## Behaviour

- Arrow keys move between tabs; the panels follow WAI-ARIA tab semantics.
- Panes can contain anything a page can: code blocks, admonitions, images, other
  doc components.
- Tab state is per-instance and resets on navigation.
