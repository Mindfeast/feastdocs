---
title: Use it for your own docs
description: Clone FeastDocs, point it at your own repository, and publish.
sidebar_position: 7
---

# Use it for your own docs

FeastDocs is a template as much as a product: clone it, make the repository
yours, replace the content. Everything specific to a site lives in two places —
`feastdocs.config.mjs` and the `docs/` folder.

## 1. Make the repository yours

<fd-steps>
  <div step="Clone and detach">

```bash
git clone https://github.com/example-org/feastdocs my-docs
cd my-docs
```

Point the clone at your own repository (create an empty one on GitHub first):

```bash
git remote set-url origin https://github.com/your-org/my-docs.git
git push -u origin main
```

Prefer a clean history? Delete the `.git` folder and `git init` instead.

  </div>
  <div step="Install and run">

```bash
npm install
npm start
```

<http://localhost:4200> now serves the template's own documentation — which you
are reading. It doubles as your feature reference until you replace it.

  </div>
</fd-steps>

## 2. Configure the site

Everything is in [`feastdocs.config.mjs`](/reference/configuration):

```js title="feastdocs.config.mjs"
export default {
  title: 'My Product Docs',
  tagline: 'Everything about My Product.',

  theme: {
    defaultMode: 'dark',
    accent: '#2f6fdb',
    accentDark: '#6ba1f4',
  },

  // "Edit this page" links on every page:
  editUrl: 'https://github.com/your-org/my-docs/edit/main/docs/',

  // Web editing: lets the content manager commit to your repo:
  github: {
    repo: 'your-org/my-docs',
    branch: 'main',
  },
};
```

<fd-api-field name="github.repo" type="string" default="null">
  <code>owner/name</code> of your repository. Setting it enables the GitHub mode
  of the <a href="/reference/editor">content manager</a> — editing on the
  deployed site, committing as the signed-in GitHub user.
</fd-api-field>
<fd-api-field name="github.branch" type="string" default="main">
  Branch that web edits are committed to.
</fd-api-field>
<fd-api-field name="editUrl" type="string" default="null">
  Base URL for "Edit this page" links; the file's path inside <code>docs/</code>
  is appended.
</fd-api-field>

## 3. Replace the content

Delete the template's sections and write your own — every top-level folder in
`docs/` becomes a navbar tab ([Pages & sections](./pages.md)):

```text
docs/
├── index.md              your landing page
├── getting-started/
│   ├── _section.json     { "label": "Getting started", "position": 1 }
│   └── index.md
└── api/
    ├── _section.json     { "label": "API", "position": 2 }
    └── index.md
```

:::tip Keep one copy of the template docs
Before deleting, skim this Guide and Reference — or keep them around in a
`draft: true` state while your team learns the features.
:::

## 4. Deploy

`npm run build` produces static files in `dist/feastdocs/browser/`. Any static
host works; the one rule is that unknown paths must fall back to `index.html`.

A minimal GitHub Actions workflow that builds on every push to `main`:

```yaml title=".github/workflows/docs.yml"
name: docs
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Full history, not a shallow clone — the build reads git log to show
          # "last updated by" on every page. Depth 1 would lose the authors.
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      # Hand dist/feastdocs/browser to your host of choice:
      # GitHub Pages, nginx, S3+CloudFront, Azure Static Web Apps…
```

:::caution fetch-depth matters
The author shown under each page comes from `git log`. CI checkouts are shallow
by default (one commit), which would blank out most authors — set
`fetch-depth: 0` as above.
:::

## 5. Choose how people edit

Both strategies work at the same time; see the
[content manager](/reference/editor) for the full picture:

| Strategy | Who it fits | How it commits |
| --- | --- | --- |
| **Git push** | People with a code editor and git | They edit `docs/`, commit, push — normal review flow |
| **Web editing** | People who live in the browser | The content manager commits to `github.repo` as their GitHub user |

Either way the history is git, so "last updated by" under every page stays
truthful — it is read from the commits at build time.
