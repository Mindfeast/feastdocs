---
title: 'Versioning'
description: 'Publish v1 and v2 of the same documentation side by side, each with its own sidebar and search.'
sidebar_position: 70
---

# Versioning

Documentation for a product with releases needs to answer "how did this work in
the version I am running?" — so old pages have to stay readable without
pretending to be current.

Each version is a folder. Declare them and the build publishes all of them:

```js title="feastdocs.config.mjs"
versions: [
  { id: 'v2', label: 'v2 (current)', docsDir: 'docs', default: true },
  { id: 'v1', label: 'v1 (archived)', docsDir: 'versioned_docs/v1' },
],
```

| Field     | Meaning                                                     |
| --------- | ----------------------------------------------------------- |
| `id`      | Stable identifier, used in routes                           |
| `label`   | What the version switcher shows                             |
| `docsDir` | Folder holding that version's pages                         |
| `default` | The version that owns the bare routes. First entry if unset |
| `slug`    | Route prefix, if it should differ from `id`                 |
| `editUrl` | Edit-link base for this version. Omitted means no edit link |

Leave `versions` out entirely and the site is unversioned — which is what most
sites are, and nothing about them changes.

## What a version owns

The default version keeps the bare routes; the rest live under a prefix:

```text
/guide/installation          v2, the default
/v1/guide/installation       v1
```

Everything else follows the reader:

<fd-columns>
  <div>

**Scoped to the version**

- Navbar section tabs
- Sidebar, including the mobile drawer
- Prev/next reading order
- Search results
- Internal links between pages

  </div>
  <div>

**Shared across versions**

- Theme, logo, footer
- The navbar's own links
- Components and styling
- The changelog

  </div>

</fd-columns>

Try it: this site publishes an archived [v1](/v1) alongside the current pages.
Switch with the control in the navbar, then search for "configuration" in each —
the results never cross.

## The switcher

Changing version keeps the reader on the same page when the other version has an
equivalent, and lands on that version's first section when it does not. Landing
somewhere sensible matters more than landing nowhere.

## Creating a new version

Copy the current docs to a version folder and keep writing in `docs/`:

```bash
cp -r docs versioned_docs/v1
```

Then declare `v1` in the config with `docsDir: 'versioned_docs/v1'`. From that
point `docs/` is the next release and `versioned_docs/v1` is frozen.

:::tip Tell readers where they are
An archived version should say so on its home page — a `:::warning` admonition
costs one line and saves a support ticket. The v1 pages on this site do it.
:::

## Edit links

A version's pages live in a different folder, so the site-wide `editUrl` would
point at the wrong file. Give a version its own:

```js
{ id: 'v1', label: 'v1', docsDir: 'versioned_docs/v1',
  editUrl: 'https://github.com/acme/docs/edit/main/versioned_docs/v1/' }
```

Without it, pages in that version simply have no edit link — a missing link
being better than one that 404s.

## What this costs

Every version is built, prerendered and included in the sitemap, so ten versions
is ten times the pages. Archive aggressively: most projects need the current
release and one before it.
