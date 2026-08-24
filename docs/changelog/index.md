---
title: 'Changelog'
description: 'Every change made to this repository, taken from its git history at build time.'
sidebar_position: 10
---

# Changelog

Every change is taken from the repository's own git history when the site is
built. There is no changelog file maintained by hand, and nothing to remember
after a release — a commit that lands on the deployed branch appears here on the
next build.

## How to read it

Commit messages following the [Conventional Commits](https://www.conventionalcommits.org)
style get a badge naming the kind of change:

- **feat** — new behaviour
- **fix** — a defect corrected
- **docs** — documentation only
- **chore**, **ci**, **build**, **test**, **refactor** — housekeeping, shown
  muted so it does not compete with the rest

Anything not following that style is listed as written. Every entry shows its
author, the number of files touched, and links to the commit itself.

## Browse by product

Each repository has its own pages, split by year and month:

<fd-changelog-repos></fd-changelog-repos>

:::tip Want this in your own docs?
The whole section is generated — see
[how the changelog pages work](../guide/changelog-pages.md) for the setup, and
[changelogs for several products](../guide/changelog-repos.md) to cover more
than one repository, on GitHub or Azure DevOps.
:::
