---
title: Installation
description: Install, run, and build.
sidebar_position: 2
---

# Installation

## Requirements

Node 22.12 or newer. Nothing else — no global CLI, no database.

```bash
npm install
npm start
```

`npm start` does three things at once: it renders `docs/` into
`src/app/generated/`, starts the Angular dev server, and starts the local
editor API used by the [content manager](/reference/editor). Open
<http://localhost:4200>.

:::tip Editing while it runs
Every save in `docs/` re-renders only what changed and hot-reloads the browser.
You can write in your editor of choice, or in the built-in
[content manager](/reference/editor) at `/_editor`.
:::

## Building for production

```bash
npm run build
```

The output in `dist/feastdocs/browser/` is a static bundle. Serve it from any web
server, with one requirement: unknown paths must fall back to `index.html`, because
routing happens in the browser.

:::info nginx

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

:::

Serving from a subpath? Build with `ng build --base-href /docs/`.
