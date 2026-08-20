---
title: Changelog
description: Repository history on a page, generated from the git log at build time.
sidebar_position: 40
---

# Changelog

`<fd-changelog>` lists the repository's commits, newest first and grouped by
month. The data comes from `git log` during `npm run docs:build`, so there is no
changelog file to keep up to date — write good commit messages and the page
writes itself.

Commit subjects that follow the [Conventional Commits](https://www.conventionalcommits.org)
convention (`feat:`, `fix:`, `docs:` …) get a badge and lose the prefix from the
headline. Anything else is shown verbatim. Each hash links to the commit on
GitHub when `github.repo` is configured.

## Example

```html
<fd-changelog limit="5"></fd-changelog>
```

Renders as:

<fd-changelog limit="5"></fd-changelog>

## Attributes

<fd-api-field name="limit" type="number" default="0">
  Maximum number of commits to show. <code>0</code> shows every commit the build
  collected.
</fd-api-field>
<fd-api-field name="docs-only" type="boolean" default="false">
  Only commits that touched a file under the docs folder — content changes
  without the framework noise. Present-as-attribute means true.
</fd-api-field>
<fd-api-field name="repo" type="string">
  Another repository, as <code>owner/name</code>. It must be listed in
  <code>changelog.repos</code>. Unset means this repository.
</fd-api-field>
<fd-api-field name="month" type="string">
  A single month, as <code>YYYY-MM</code>. Grouping headings are dropped, since
  the page heading already names the month. Used by the generated month pages.
</fd-api-field>

## Cards for each repository

`<fd-changelog-repos>` renders one card per repository — name, total changes and
the latest month — linking to that repository's own overview. It belongs on the
section's landing page, so that page stays a way in rather than a copy of every
listing:

```html
<fd-changelog-repos></fd-changelog-repos>
```

Renders nothing when the pages are not grouped per repository, since there is
then only one changelog and nothing to choose between.

## An index of the pages

`<fd-changelog-months>` lists what exists — repository, year, month, with a
count each — and links to the generated pages. It is what belongs on a section
landing page: repeating the commits there would mean the same history rendered
twice, which is worse for a reader and splits the two pages in search results.

```html
<fd-changelog-months></fd-changelog-months>
```

Add `repo` to scope it to one source — `<fd-changelog-months repo="self">` for
this repository, or a `changelog.repos` id. The generated per-repository pages
use exactly that.

It reads the same lazily-loaded history, so it costs nothing on pages that use
neither component. With `monthlyPages` off it still renders, as a plain summary
without links.

## A page per month

Set `changelog.monthlyPages` and the build writes a page per month, grouped
under a category per year:

```text
Changelog
├── Changelog            (your own overview page)
├── Documentation changes
└── 2026
    ├── August
    └── July
```

```js
// feastdocs.config.mjs
changelog: {
  monthlyPages: true,
  monthlyPagesDir: 'changelog',   // relative to docsDir
},
```

They are ordinary Markdown files, so the sidebar, search, prev/next links,
prerendering and the sitemap treat them like any other page. Each holds only a
filter — `<fd-changelog month="2026-08">` — never the commits, so **a new commit
changes no file and a new month adds one**.

Two consequences worth knowing:

- The files are **overwritten on every build**. Edit them and the change is
  lost; put anything hand-written on your own page in the section instead.
- Months that drop out of `changelog.limit` have their pages removed. Only
  generated files are touched: a page you wrote in a year folder survives, and
  so does a `_category.json` you wrote yourself.

## Other repositories

One docs site often covers several products, each with its own repository. List
them in `changelog.repos` — GitHub and Azure DevOps are both supported:

```js
// feastdocs.config.mjs
changelog: {
  limit: 150,
  repos: [
    'acme/checkout-api',
    { repo: 'acme/mobile-app', branch: 'release' },
    { provider: 'azure', org: 'contoso', project: 'Payments', repo: 'payments-api', id: 'payments' },
  ],
},
```

Then point a page at one:

```html
<fd-changelog repo="acme/checkout-api" limit="30"></fd-changelog>
<fd-changelog repo="payments"></fd-changelog>
```

Commit links follow the source, so Azure entries link to Azure DevOps. A
repository that is not in `changelog.repos` renders a notice naming it, rather
than an empty page.

Full walk-through, including tokens per host and how to read the build log:
[changelogs for several products](../guide/changelog-repos.md).

### Private repositories

They work the same way, with a token in the **build environment** — see the
[manual](../guide/changelog-repos.md#3-give-the-build-a-token) for each host:

<fd-steps>
  <div step="Create a token">

A fine-grained personal access token with **Contents: Read-only** on the
repositories you list, or a classic token with the `repo` scope.

  </div>
  <div step="Store it as a secret">

Cloudflare Pages → Settings → Environment variables, as an **encrypted**
variable named `GITHUB_TOKEN` (`GH_TOKEN` also works). On GitHub Actions, a
repository secret passed as `env:`. Never put it in `feastdocs.config.mjs` —
that file is committed.

  </div>
  <div step="Build">

The token is read at build time only. It is not shipped to the browser and does
not appear in the generated bundle.

  </div>
</fd-steps>

:::warning Private history becomes public
The commits are baked into the deployed page. Everything collected — subjects,
bodies and author names — is readable by anyone who can open the site, even
though the repository itself stays private. Only list private repositories
whose commit messages you would publish.
:::

Setting a token is worth it for public repositories too: anonymous GitHub API
calls are limited to 60 per hour per IP, shared with every other build on the
same host.

## How much history

The build reads `changelog.limit` commits (default `150`) — see
[configuration](../reference/configuration.md). The history lands in its own
generated module and is imported lazily, so pages without the component never
download it.

:::info Shallow checkouts are handled for you
The changelog needs real history, and several hosts clone with `--depth 1` —
Cloudflare Pages does, and so does any CI step missing `fetch-depth: 0`. That
would leave a one-entry changelog and blank author attribution.

The build handles it: it deepens a shallow checkout (`git fetch --unshallow`)
before reading anything. If deepening is impossible — no credentials in the
checkout, or an offline build — it reads the history from the GitHub API
instead, using `github.repo` and `github.branch`. Set `GITHUB_TOKEN` in the
build environment if the repository is private.

The API path carries no file list, so entries show no file count and the
`docs-only` view keeps everything it cannot rule out. Setting `fetch-depth: 0`
in your own pipeline still gives the best result, and the bundled workflows do.
:::
