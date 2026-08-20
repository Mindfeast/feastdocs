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

:::warning
Attribution needs the real git history. A shallow clone gives the build one
commit, so CI must check out with full depth: `fetch-depth: 0` on GitHub
Actions, `fetchDepth: 0` on Azure Pipelines, and no `--depth` flag in a
Dockerfile clone. The bundled workflows already do this.
:::
