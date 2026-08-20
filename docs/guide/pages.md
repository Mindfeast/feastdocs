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

### Depth limit: 5 levels

A page can sit at most **five folders deep** — a section plus up to four nested
category levels:

```text
docs/guide/hello.md                     ✓  1 level
docs/guide/a/hello.md                   ✓  2 levels
docs/guide/a/b/hello.md                 ✓  3 levels
docs/guide/a/b/c/hello.md               ✓  4 levels
docs/guide/a/b/c/d/hello.md             ✓  5 levels
docs/guide/a/b/c/d/e/hello.md           ✗  rejected
```

The content manager and `docs:new` refuse to create anything deeper, and the
build prints a warning if such a file appears by other means. Even five levels
is a lot of clicking — prefer splitting into another section before reaching
for the last one.

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
