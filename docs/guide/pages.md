---
title: Pages & sections
description: How files and folders become routes, navbar tabs and sidebars.
sidebar_position: 3
---

# Pages & sections

There is no navigation to configure. The `docs/` folder *is* the navigation.

## Sections: the top navbar

Every folder directly under `docs/` is a **section** — a tab in the top navbar with
its own sidebar. This site has three: `guide/`, `reference/` and `components/`.

```text
docs/
├── index.md            ← landing page, no section, no sidebar
├── guide/              ← section "Guide"
│   ├── _section.json
│   ├── index.md        ← section landing (/guide)
│   └── installation.md
├── reference/          ← section "Reference"
└── components/         ← section "Components"
```

A `_section.json` names the tab:

```json title="docs/guide/_section.json"
{
  "label": "Guide",
  "description": "Install, write, and style your documentation.",
  "position": 1
}
```

<fd-api-field name="label" type="string" default="folder name">
  Tab label in the navbar and title above the sidebar.
</fd-api-field>
<fd-api-field name="description" type="string">
  One line shown under the sidebar title.
</fd-api-field>
<fd-api-field name="position" type="number" default="999">
  Order of the tabs, ascending.
</fd-api-field>

Without a `_section.json`, the folder still becomes a section — the label falls back
to the folder name, humanised.

## Pages: files inside a section

| File | Route | Sidebar |
| --- | --- | --- |
| `docs/guide/index.md` | `/guide` | Section landing, first in the sidebar |
| `docs/guide/installation.md` | `/guide/installation` | Item in the Guide sidebar |
| `docs/guide/advanced/hooks.md` | `/guide/advanced/hooks` | Inside an **Advanced** category |
| `docs/index.md` | `/` | No sidebar — root pages have no section |
| `docs/guide/_draft.md` | — | Files starting with `_` are never published |

Folders *inside* a section become collapsible sidebar categories. Give one a label
with a `_category.json`:

```json title="docs/guide/advanced/_category.json"
{ "label": "Advanced", "position": 20, "collapsed": true }
```

### Depth limit: 8 levels

A page can sit at most **eight folders deep** — a section plus up to seven
nested category levels:

```text
docs/guide/hello.md                     ✓  1 level
docs/guide/a/hello.md                   ✓  2 levels
docs/guide/a/b/c/d/hello.md             ✓  5 levels
docs/guide/a/b/c/d/e/f/g/hello.md       ✓  8 levels
docs/guide/a/b/c/d/e/f/g/h/hello.md     ✗  rejected
```

The content manager and `docs:new` refuse to create anything deeper, and the
build prints a warning if such a file appears by other means.

The limit is deliberately generous so a large product tree fits, but depth is
not free: every level is another click, and a reader eight levels down has lost
sight of where they are. Prefer another section before reaching for the last few
levels.

## Controlling what starts open

By default a category starts **collapsed**, and only the branch holding the page
you are on is open. A sidebar that opens everything is unreadable as soon as a
section has depth. Two flags let you say otherwise.

### Per section

`_section.json` decides how that section's categories start:

```json title="docs/components/_section.json"
{ "label": "Components", "expand": "all" }
```

| Value | Effect |
| --- | --- |
| `active` | Only the branch containing the current page. **The default** |
| `all` | Everything expanded |
| `none` | Everything collapsed, including around the current page |

`all` suits a short section a reader wants to see whole — the Components section
here uses it. `active` suits a deep or generated tree: the changelog section
shows its repositories on arrival and opens a month only when you go there.

`none` is literal — it will not open the branch you are reading either, which is
occasionally what an index-style sidebar wants and usually not.

Without the flag, a section follows `sidebar.expand` in
[the site config](../reference/configuration.md).

### Per category

`_category.json` overrides its section:

```json title="docs/guide/advanced/_category.json"
{ "label": "Advanced", "expand": "always" }
```

| Value | Effect |
| --- | --- |
| `"always"` | Pinned open. No toggle, and no stored state can close it |
| `true` | Starts open |
| `false` | Starts closed. `"collapsed": true` still works and means the same |

`"always"` is your "favourite" — the one branch that should never be hidden,
whatever the section default says and whatever the reader clicked last week. The
**Advanced** category in this Guide is pinned that way: it has no chevron,
because a control that cannot change anything is worse than none.

Everything else is remembered per reader: collapse a category and it stays
collapsed on the next visit, on that browser. Opening a page always reveals its
own branch, so a link never lands somewhere hidden.

## Category landing pages

A folder becomes a category in the sidebar. Give it an `index.md` and that page
becomes the category's own link — the reader can click the category itself, not
only the pages under it.

Without an `index.md`, the build generates that landing page for you: it lists
everything directly inside as cards, with each page's description, and a page
count for sub-categories. Nothing to configure, and a real `index.md` always
wins.

You can place the same cards on a page you wrote yourself:

```html
<!-- Everything inside the current category -->
<fd-category-index></fd-category-index>

<!-- Or a specific one -->
<fd-category-index for="guide/advanced"></fd-category-index>
```

Generated landing pages carry no "Edit this page" link, since there is no file
behind them.

## Ordering

Pages sort by `sidebar_position` (ascending), then alphabetically. Leave gaps of 10
so inserting a page later never means renumbering.

## Creating a page

Create the file, or use the generator:

```bash
npm run docs:new -- guide/deploying "Deploying" --scss
```

:::note The sidebar updates itself
Save the file and it appears in the right section's sidebar, positioned by its
front matter. There is no registry to edit.
:::
