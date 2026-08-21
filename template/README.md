# Documentation

A documentation site built with [FeastDocs](https://feastdocs.feast-labs.com) —
Markdown, HTML and SCSS in, a fast searchable site out, with live Angular
components usable inside the Markdown.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:4200. Editing anything under `docs/` reloads the
page.

## Write

Put Markdown files in `docs/`. The folder _is_ the navigation:

```text
docs/
├── index.md              → /
└── guide/                → a section in the navbar
    ├── _section.json     → its label and position
    └── index.md          → /guide
```

Each page starts with front matter:

```yaml
---
title: Page title
description: Shown in search results and link previews.
sidebar_position: 1
---
```

Create one with the right front matter already in place:

```bash
npm run docs:new
```

## Configure

Everything lives in `feastdocs.config.mjs` — site name, theme colours, navbar
and footer links, the repository behind "Edit this page", and whether the site
generates SEO output. Set `siteUrl` to your public address to turn on
prerendering, canonical tags, Open Graph, `sitemap.xml` and `robots.txt`.

## Build and deploy

```bash
npm run build
```

The output is `dist/feastdocs/browser` — static files, deployable anywhere.
Configs for nginx, Docker, IIS, GitHub Actions and Azure Pipelines are in
`deploy/` and the repository root.

```bash
docker compose up --build
```

serves the production image on http://localhost:8080.

## Commands

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm start`        | Dev server with live reload and the content manager |
| `npm run build`    | Production build, prerendered, with sitemap         |
| `npm test`         | Run the tests                                       |
| `npm run docs:new` | Create a page from a template                       |
| `npm run format`   | Prettier                                            |

## Documentation

Everything the framework can do — components, theming, search, the in-browser
content manager, changelogs from git history, diagrams, deployment — is
documented at **[feastdocs.feast-labs.com](https://feastdocs.feast-labs.com)**.

`CLAUDE.md` in this repository explains the internals, so an AI assistant can
work on it without rediscovering how the pipeline fits together.

## Licence

MIT. See [LICENSE](LICENSE).
