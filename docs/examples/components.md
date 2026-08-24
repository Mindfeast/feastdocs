---
title: Components
description: Every Angular doc component, live on one page, with the markup that produced it.
sidebar_position: 4
---

# Components

Every doc component, live on this page. The [Components](/components) section
documents each in depth; this is the gallery — what it looks like, and the markup
that produced it. The first four are also on the content manager's Insert menu.

## Tabs

The blank lines around pane content are load-bearing: without them Markdown
inside the panes stays literal text.

```html
<fd-tabs>
  <div tab="First">Content (keep the blank lines).</div>
  <div tab="Second">Content.</div>
</fd-tabs>
```

<fd-tabs>
  <div tab="First">

Content (keep the blank lines).

  </div>
  <div tab="Second">

Content.

  </div>
</fd-tabs>

## Steps

```html
<fd-steps>
  <div step="First step">What to do.</div>
  <div step="Second step">What comes next.</div>
</fd-steps>
```

<fd-steps>
  <div step="First step">

What to do.

  </div>
  <div step="Second step">

What comes next.

  </div>
</fd-steps>

## API field

```html
<fd-api-field name="option" type="string" default="value"> What it does. </fd-api-field>
```

<fd-api-field name="option" type="string" default="value">
  What it does.
</fd-api-field>

## Counter

A minimal proof of live state — click it.

```html
<fd-counter start="0" step="1"></fd-counter>
```

<fd-counter start="0" step="1"></fd-counter>

## Changelog

Repository history, read from `git log` at build time and grouped by month.
`limit` caps the number of commits; `docs-only` keeps just the ones that touched
the docs folder.

```html
<fd-changelog limit="5"></fd-changelog>
```

<fd-changelog limit="5"></fd-changelog>

## Columns

Side-by-side content that collapses to one column when there is no room for two.
`min` is the narrowest a column may get, in `rem` — the count follows from it,
so there is no breakpoint to maintain.

```html
<fd-columns min="16">
  <div>Left.</div>
  <div>Right.</div>
</fd-columns>
```

<fd-columns min="16">
  <div>

**Left.** Each child becomes a column.

  </div>
  <div>

**Right.** Markdown inside needs the blank lines, as always.

  </div>
</fd-columns>

## Expandable

Long content most readers can skip. `open` starts it expanded.

```html
<fd-expandable title="Advanced options">Hidden until asked for.</fd-expandable>
```

<fd-expandable title="Advanced options">

Hidden until asked for — and it prints expanded, which plain `<details>` does not.

</fd-expandable>

## Category index

The cards that list a folder's pages. The build puts this on any category with no
`index.md` of its own, so a sidebar entry is never a dead end; on a hand-written
index page, add it to list the siblings underneath. Without `for` it uses the
current route.

```html
<fd-category-index for="guide/advanced"></fd-category-index>
```

<fd-category-index for="guide/advanced"></fd-category-index>

## Mermaid

Diagrams come from fenced ` ```mermaid ` blocks — see [Diagrams](/examples/diagrams)
for the range of them, error handling included. In Markdown the fence is the whole
API, and the only thing you should reach for.

The fence compiles to `<fd-mermaid>`, and the element can be written by hand in an
`.html` page, where there is no fence to write. Its source goes in a
`<pre class="fd-mermaid__source">` child — text placed directly inside the element
is ignored, because the child is the shape the fence produces:

```html
<fd-mermaid>
  <pre class="fd-mermaid__source">graph LR; A[Write] --> B[Build]</pre>
</fd-mermaid>
```

:::caution That markup is for `.html` pages, not Markdown
Written into a Markdown page it renders empty, and the reason is worth knowing.
Markdown wraps the element in a paragraph; `<pre>` cannot live inside `<p>`, so the
browser lifts it out of the element before the component can read it. The diagram
then reports "no diagram type detected" — accurately, because it received nothing.
Use the fence in Markdown and this cannot happen.
:::

## Changelog by month

The month pages for one repository, as a list. It reads the changelog data the
build collected, so it renders where changelog pages exist and stays silent
elsewhere — which is why the example below is markup rather than a live render.
See it working on the [Changelog](/changelog) section.

```html
<fd-changelog-months repo="feastdocs"></fd-changelog-months>
```

## Changelog repositories

One card per repository, for a Changelog section that covers several. Each card
leads to that repository's own overview rather than repeating its months here.
Like the component above, it renders nothing when the changelog is not grouped
per repository.

```html
<fd-changelog-repos></fd-changelog-repos>
```
