---
title: Styling
description: Three levels of SCSS — design tokens, site-wide overrides, and styles scoped to a single page.
sidebar_position: 5
---

# Styling

Styling happens at three levels, and the right one is almost always the narrowest
that does the job.

## 1. Design tokens

Every colour, radius, font and layout width in the theme is a CSS custom property
declared in `src/styles/_tokens.scss`. Change one there and it changes everywhere,
in both light and dark mode.

```scss title="src/styles/_tokens.scss"
:root {
  --fd-content-max: 1080px;
  --fd-sidebar-width: 284px;
  --fd-toc-width: 240px;
  --fd-accent: var(--fd-accent-light);
}
```

### Layout widths

| Token                | What it sets               | Default  |
| -------------------- | -------------------------- | -------- |
| `--fd-content-max`   | The content column         | `1080px` |
| `--fd-toc-width`     | The on-this-page column    | `240px`  |
| `--fd-sidebar-width` | The section sidebar        | `284px`  |
| `--fd-prose-max`     | Optional cap on text width | `none`   |

A page with a table of contents is `--fd-content-max` plus `--fd-toc-width`
wide; one without is the content column alone. The sidebar sits outside both.

Text runs the full width of the column. If you prefer a narrower measure for
long prose — past roughly 90 characters a line the eye starts losing its place
returning to the left margin — set `--fd-prose-max`. Paragraphs, lists and
headings honour it while tables, code blocks, diagrams and card grids keep the
whole column:

```scss title="src/styles/custom.scss"
.fd-markdown {
  --fd-prose-max: 76ch;
}
```

### Two widths, on purpose

`--fd-content-max` is the width of the column. `--fd-prose-max` is the width of
the _text_ inside it, and it is deliberately narrower:

| Token              | Applies to                     | Default  |
| ------------------ | ------------------------------ | -------- |
| `--fd-content-max` | The whole content column       | `1010px` |
| `--fd-prose-max`   | Paragraphs, lists and headings | `76ch`   |

Tables, code blocks, diagrams and card grids want room. Prose does not: past
roughly 90 characters a line, the eye loses its place coming back to the left
margin. So the column is wide and the text within it is capped — a wide table
uses every pixel while a paragraph beside it stays readable.

Raise the measure if you disagree:

```scss title="src/styles/custom.scss"
.fd-markdown {
  --fd-prose-max: 90ch;
}
```

The accent colour is the exception: it comes from `feastdocs.config.mjs` and is
written to `:root` at runtime, so you can change your brand colour without touching
SCSS at all.

:::tip Prefer tokens
If you find yourself hard-coding a hex value in a page stylesheet, check whether a
token already exists. Using the token means the page follows dark mode for free.
:::

## 2. Built-in utility classes

Two classes ship globally and work on **any page**, attached with the
[`{.class}` attribute syntax](./markdown.md#attributes):

```md
The opening paragraph of a page.{.lead}

Ship it.{.callout}
```

The opening paragraph of a page.{.lead}

Ship it.{.callout}

## 3. Site-wide overrides

`src/styles/custom.scss` is loaded last, so anything in it wins. This is where
your own site-wide rules belong — including new utility classes for markup you
write inside Markdown:

```scss title="src/styles/custom.scss"
:root {
  --fd-content-max: 1140px;
}

.fd-markdown .highlight-box {
  padding: 1rem;
  border: 1px dashed var(--fd-accent);
}
```

## 4. Page-scoped SCSS

Put a `.scss` file next to a page and it belongs to that page alone. This page has a
`styling.scss` sitting beside it, and everything below is styled by it.

```scss title="docs/guide/styling.scss"
.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.6rem;
}
```

The build compiles it and wraps every rule in `[data-doc-slug="guide/styling"]`
before injecting it, which is why `.swatches` here cannot affect a `.swatches`
somewhere else. `@use` and `@forward` at the top of the file are hoisted out first,
so partials and mixins work normally.

<div class="swatches">
  <div class="swatch swatch--surface">surface</div>
  <div class="swatch swatch--sunken">sunken</div>
  <div class="swatch swatch--accent">accent</div>
  <div class="swatch swatch--border">border</div>
</div>

Page stylesheets combine with `{.class}` attributes the same way the built-in
utilities do — the only difference is the class exists on this page alone.

## Which level to use

| Situation                                | Level                             |
| ---------------------------------------- | --------------------------------- |
| Brand colour, content width, fonts       | Tokens                            |
| A quick emphasis or intro paragraph      | Built-in `{.lead}` / `{.callout}` |
| A class you use across many pages        | `custom.scss`                     |
| A layout that exists on exactly one page | Page `.scss`                      |

:::caution Scoping is not isolation
Page styles are scoped by selector, not by shadow DOM. A rule like
`p { color: red }` in a page stylesheet still hits every paragraph on _that_ page —
including ones the theme rendered. Prefer a class.
:::
