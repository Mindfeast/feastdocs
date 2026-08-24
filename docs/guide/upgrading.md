---
title: 'Upgrading a site'
description: 'Pull framework improvements into a site you started from the template, without touching your content.'
sidebar_position: 69
---

# Upgrading a site

A site started from the template is a **copy**, not a dependency. That is what
makes it yours — every file is editable, nothing is hidden in `node_modules` —
and it is also why improvements do not arrive on their own.

`npm run upgrade` closes that gap. It replaces the framework and nothing else.

## What moves, and what never does

|                   |                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Replaced**      | `src/`, `tools/`, `functions/`, `deploy/`, `angular.json`, the Dockerfile, CI workflows, `CLAUDE.md` |
| **Merged**        | `package.json` — upstream dependencies and scripts arrive; your name and your own additions stay     |
| **Never touched** | `docs/`, `feastdocs.config.mjs`, `public/`, `README.md`                                              |

That split is the whole design: everything that makes the site _yours_ is in the
second row.

## Running it

```bash
npm run upgrade
```

Shows what would change and writes nothing:

```text
  + .feastdocs-version
  ~ src/app/core/models.ts
  ~ tools/lib/config.mjs
  ~ package.json (+1 scripts)

! dry run — nothing written. Re-run with --apply to upgrade.
```

Then:

```bash
npm run upgrade -- --apply
npm install
npm run build
```

It refuses to run on a dirty working tree, because `git diff` is how you review
what arrived:

```bash
git diff
```

`.feastdocs-version` records the framework commit the site is on, so a second
run reports `already up to date` rather than rewriting the same files.

## Reviewing an upgrade

Framework files are the ones you are least likely to have edited, so the diff is
usually mechanical. Two places deserve a look:

- **`package.json`** — dependency bumps land here. Run the build before
  committing.
- **New config options.** Upgrades add options with safe defaults, so nothing
  breaks by staying silent, but `feastdocs.config.mjs` is never rewritten:
  new options only take effect once you add them. The
  [configuration reference](../reference/configuration.md) lists everything
  current.

If you _have_ customised the framework — a component you edited, a change to the
pipeline — your edit is overwritten. Keep such changes in files of your own
where you can (a new component rather than a modified one), and check the diff
when you cannot.

## Sites created before this existed

Early sites have no `tools/upgrade.mjs`. Fetch it once:

```bash
curl -o tools/upgrade.mjs https://raw.githubusercontent.com/Mindfeast/feastdocs-template/main/tools/upgrade.mjs
node tools/upgrade.mjs
```

The upgrade then brings the rest, including the `npm run upgrade` script.

## The alternative: tracking as a git remote

If you prefer git to do the merging:

```bash
git remote add upstream https://github.com/Mindfeast/feastdocs-template.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

This gives you real three-way merges and full history, at the cost of conflicts
in every file you replaced — starting with `docs/`, which you emptied on day
one. `npm run upgrade` exists because that trade is rarely worth it.

:::tip Upgrade on a branch

```bash
git switch -c upgrade-framework
npm run upgrade -- --apply && npm install && npm run build
```

If the build is unhappy, throw the branch away.
:::
