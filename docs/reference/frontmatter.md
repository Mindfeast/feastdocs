---
title: Front matter
description: Every field a page can declare, and what the build does with it.
sidebar_position: 1
---

# Front matter

Front matter is the YAML block at the top of a page, between two `---` lines. Every
field is optional.

```md
---
title: Rate limits
description: How request quotas are applied per API key.
sidebar_label: Rate limits
sidebar_position: 30
tags: [api, limits]
toc: true
---
```

## Fields

| Field              | Type     | Default                               | Effect                                                               |
| ------------------ | -------- | ------------------------------------- | -------------------------------------------------------------------- |
| `title`            | string   | first `#` heading, else the file name | Page heading, browser title, search result label                     |
| `description`      | string   | empty                                 | Shown under the heading and used as the meta description             |
| `sidebar_label`    | string   | `title`                               | Overrides the label in the sidebar when the title is too long for it |
| `sidebar_position` | number   | `999`                                 | Sort order among siblings, ascending                                 |
| `sidebar_badge`    | string   | empty                                 | Short marker before the sidebar label. HTTP methods are colour-coded |
| `slug`             | string   | derived from the path                 | Replaces the route entirely                                          |
| `toc`              | boolean  | `true`                                | Set `false` to hide the table of contents                            |
| `hidden`           | boolean  | `false`                               | Reachable by URL and search, but absent from the sidebar             |
| `draft`            | boolean  | `false`                               | Excluded from the build completely                                   |
| `tags`             | string[] | `[]`                                  | Stored on the page for your own use                                  |
| `keywords`         | string[] | `[]`                                  | Extra terms, available to the search index                           |

`sidebarLabel` and `sidebarPosition` are accepted as camelCase aliases.

## Titles

The title is resolved in this order:

1. `title` in the front matter
2. The first `#` heading in the body — which is then removed, so it is not rendered twice
3. The file name, humanised (`getting-started.md` becomes "Getting Started")

Keeping the `#` heading in the file is the friendlier option: the page still reads
well in a plain text editor or a diff.

## Slugs

By default the route mirrors the file path. `slug` overrides it, which is what you
want when a page moves but the old URL is already shared around:

```md
---
title: Rate limits
slug: api/limits
---
```

:::caution One route per page
Two pages resolving to the same route is a build warning, and the second one is
dropped. The warning names both files — see
[Build warnings](./cli.md#build-warnings) for how collisions happen and how to
fix them.
:::

## Hidden versus draft

`hidden: true` keeps the page published — anyone with the link reaches it, and it
appears in search — but removes it from the sidebar. Use it for pages reached from
inside another page.

`draft: true` removes the page from the build. No route, no chunk, no search entry.

## Category files

A folder becomes a sidebar category. To control how, add a `_category.json`:

```json title="docs/guides/_category.json"
{
  "label": "Guides",
  "position": 2,
  "collapsed": false
}
```

| Field       | Default                                       | Effect                                |
| ----------- | --------------------------------------------- | ------------------------------------- |
| `label`     | folder name, humanised                        | Category label                        |
| `position`  | `999`, or the index page's `sidebar_position` | Sort order among siblings             |
| `collapsed` | `false`                                       | Whether the category starts collapsed |

If the folder has an `index.md`, that page becomes the category's own link — clicking
the category label opens it instead of only expanding the group.
