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
