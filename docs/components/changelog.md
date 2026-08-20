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

## Other repositories

One docs site often covers several products, each with its own repository. List
them in `changelog.repos` and the build collects each one from the GitHub API:

```js
// feastdocs.config.mjs
changelog: {
  limit: 150,
  repos: ['acme/checkout-api', { repo: 'acme/mobile-app', branch: 'release' }],
},
```

Then point a page at one:

```html
<fd-changelog repo="acme/checkout-api" limit="30"></fd-changelog>
```

A repository that is not in `changelog.repos` renders a notice naming it,
rather than an empty page.

### Private repositories

They work the same way, with a token in the **build environment**:

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
