---
title: Content manager
description: Create and edit pages with a live preview, inside the site itself.
sidebar_position: 5
---

# Content manager

The content manager lives at [`/_editor`](/_editor) — the pencil icon in the
navbar. It shows the `docs/` tree on the left, the file's source in the middle,
and a live Markdown preview on the right.

## What it can do

- **Edit** any `.md`, `.html` or `.scss` file under `docs/`, with
  <kbd>Ctrl</kbd>+<kbd>S</kbd> to save
- **Create** pages — type a path like `guide/deploying.md` and it is scaffolded
  with front matter, in the right section
- **Preview while typing** — the right pane re-renders on every keystroke
- **Jump to the real page** — the “View page” link opens the route the file
  publishes to

Saving writes the file to disk, which means the normal pipeline takes over: the
watcher re-renders the content, the dev server hot-reloads, and the change shows
up in the real site seconds later.

## Two backends, two strategies

The editor picks its backend by where it is running:

| Backend | When | What Save does |
| --- | --- | --- |
| **Local** | `npm start` is running (the file API on `127.0.0.1:4271`) | Writes the file to disk; you commit and push from your own editor or terminal, already authenticated with git |
| **GitHub** | `github.repo` is set in `feastdocs.config.mjs` — the mode for the deployed site | Commits to the configured branch through the GitHub API, **authored by the connected GitHub user** |

In development with both available, a Local/GitHub switch appears above the file
list. Without either, the page explains what to set up instead of failing.

### Connecting GitHub

The GitHub mode asks once for a **fine-grained personal access token** with
*contents read and write* on the docs repository. The token stays in the
browser's localStorage and is sent only to `api.github.com`.

:::info Why a token and not an OAuth popup
A full "Sign in with GitHub" needs a server-side step — exchanging the OAuth
code for a token requires the app's client secret, which cannot ship inside a
static site. The connect screen is built as the seam for that: add a small
exchange endpoint (a serverless function is enough) and swap the token input
for the OAuth redirect without touching the rest of the editor.
:::

### Author attribution

Every page's footer shows **when it last changed and by whom**. That comes from
`git log` at build time — not from the editor — so it is correct for both
strategies: a web commit and a pushed commit look identical in history. After a
web edit, the deployed site shows the new author once CI rebuilds.

:::note The preview is an approximation
The live preview renders admonitions, tables, task lists and attributes exactly
like the real build — including the built-in `{.lead}` and `{.callout}` utility
classes. What it does not do: syntax-highlight code blocks, rewrite relative
links, or apply **page-scoped SCSS** (classes from a sibling `.scss` file only
style the real page). The saved page — rendered by the actual pipeline — is
always the source of truth, one hot-reload away.
:::

## Working with a repository

The content manager writes **plain files into `docs/`** on your machine — nothing
else. Git sees those files like any other change:

<fd-steps>
  <div step="Write">

Create and edit pages in the content manager (or any editor). Every save lands in
`docs/` as an ordinary file change — `git status` shows it immediately.

  </div>
  <div step="Review">

```bash
git add docs/
git commit -m "docs: add deployment guide"
```

Docs changes diff and review like code, because they are code. Open a pull
request if your team reviews content.

  </div>
  <div step="Push and build">

```bash
git push
```

CI (or you) runs `npm run build`; the static output in `dist/feastdocs/browser/`
is what gets deployed. Generated files (`src/app/generated/`, `public/docs-assets/`)
are git-ignored — they are rebuilt from `docs/` every time, so they never need
committing.

  </div>
</fd-steps>

:::info Nothing writes in production
The deployed site is static and the file API only exists on `127.0.0.1` during
`npm start`. Publishing a change always goes through the repository — which is
the point.
:::

## Why files, still

The content manager is a convenience layer, not a CMS. Files stay the source of
truth: they diff, review and version like the rest of the repository, and
everything the editor does can also be done in any text editor.
