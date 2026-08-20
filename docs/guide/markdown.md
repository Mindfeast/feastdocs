---
title: Markdown features
description: Everything the Markdown renderer supports, with the output shown next to the source.
sidebar_position: 4
---

# Markdown features

Standard CommonMark, plus tables, footnote-free simplicity, and the extensions below.
Each section shows the source and the result it produces on this very page.

## Code blocks

Fences are highlighted at build time. The language is optional; an unknown language
falls back to plain monospace rather than failing the build.

````md
```ts
export function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}
```
````

```ts
export function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}
```

### Titled blocks

Add `title="..."` after the language to label a block with its file path.

````md
```scss title="src/styles/custom.scss"
:root {
  --fd-content-max: 940px;
}
```
````

```scss title="src/styles/custom.scss"
:root {
  --fd-content-max: 940px;
}
```

:::tip Copy button
Hover any code block and a copy button appears in the corner. It is part of the
generated HTML, so it also works inside components that re-render markdown — the
app only listens for the clicks.
:::

## Admonitions

Seven types, each with an optional custom title after the type name.

```md
:::note
The default type, for asides that are worth reading but not urgent.
:::

:::warning Deprecated in v3
Use `renderPage()` instead.
:::
```

:::note
The default type, for asides that are worth reading but not urgent.
:::

:::tip
For advice that saves the reader time.
:::

:::info
For context and background.
:::

:::success
For confirming that something worked.
:::

:::warning Deprecated in v3
Use `renderPage()` instead.
:::

:::caution
For a step that is easy to get wrong.
:::

:::danger Destructive
This drops the table.
:::

## Tables

Pipe tables, wrapped in a horizontal scroll container so wide tables never break
the page layout.

```md
| Field | Type | Default |
| --- | --- | --- |
| `title` | string | file name |
| `toc` | boolean | `true` |
```

| Field | Type | Default |
| --- | --- | --- |
| `title` | string | file name |
| `toc` | boolean | `true` |
| `sidebar_position` | number | `999` |

## Task lists

```md
- [x] Render Markdown
- [x] Highlight code
- [ ] Print to PDF
```

- [x] Render Markdown
- [x] Highlight code
- [ ] Print to PDF

## Attributes

Attach a class, id, or `data-` attribute to any element with `{...}` — the hook for
[page-scoped styling](./styling.md).

```md
This paragraph carries a class.{.lead}
```

## Links

Relative links are resolved at build time and turned into app routes, so navigation
stays client-side and nothing reloads.

| You write | Becomes |
| --- | --- |
| `[Setup](./setup.md)` | a route in the same folder |
| `[Home](../index.md)` | a route one level up |
| `[Anchor](./setup.md#step-2)` | route plus a heading anchor |
| `[Angular](https://angular.dev)` | external link, opens in a new tab |

If a relative link points at a file that does not exist, the content build prints a
warning naming both the source file and the broken target. Links are checked on
every build, so a rename cannot quietly break navigation.

## Headings and the table of contents

`##` and `###` headings are collected into the table of contents on the right, get
permanent anchor links, and drive the scroll indicator. `####` and deeper still get
anchors but stay out of the table of contents to keep it readable.

Opt out per page with `toc: false` in the front matter.

## Images and files

Anything in `docs/` that is not a `.md`, `.html` or `.scss` file is copied to the
built site, and relative references to it are rewritten:

```md
![Request flow](./img/request-flow.png)
[The signed contract](./files/contract.pdf)
```

Keep assets next to the page that uses them; the folder layout is preserved.
