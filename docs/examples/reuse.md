---
title: Reuse and layout
description: Variables, snippets, expandable sections and columns — the pieces that keep a large docs set consistent.
sidebar_position: 70
---

# Reuse and layout

## Variables

Values defined once in `feastdocs.config.mjs` and written as `{{ name }}`:

```js title="feastdocs.config.mjs"
variables: {
  framework: 'FeastDocs',
  minNode: '20.19',
  angular: '21',
},
```

> {{ framework }} runs on Angular {{ angular }} and needs Node {{ minNode }} or
> newer.

That sentence is written with placeholders and resolved at build time, so the
search index and the page a crawler reads both contain the real values.

Nested values work too — `{{ support.email }}` reads `support: { email: … }`.

:::note Code is never substituted
Braces are common in code: `${{ secrets.TOKEN }}` in a GitHub Actions file,
`{{ title }}` in a page template. Anything inside a code fence or backticks is
left exactly as written, so examples stay correct.
:::

## Snippets

A file in `docs/_snippets/` included wherever it is needed. This is
`_snippets/install.md`, written once:

{{ snippet:install }}

Change that file and every page including it changes with it. Snippets may use
variables, and may include other snippets.

## Expandable

For an answer that most readers do not need open:

```html
<fd-expandable title="Why is the build so fast?">

Markdown here, surrounded by blank lines.

</fd-expandable>
```

<fd-expandable title="Why does the build read git history?">

Author attribution and `<fd-changelog>` both come from `git log`, so the build
needs real history. A shallow clone gives it one commit — see
[upgrading](../guide/upgrading.md) and the changelog manuals for how that is
handled.

</fd-expandable>

<fd-expandable title="Can I open one by default?" open>

Yes — add the `open` attribute, as this one has.

</fd-expandable>

Built on the browser's own `<details>`, so it works without JavaScript, responds
to the keyboard, and find-in-page can open it to reveal a match.

## Columns

For a comparison, or two short lists that read better side by side:

```html
<fd-columns>
  <div>

  **Left column** — markdown, with blank lines.

  </div>
  <div>

  **Right column.**

  </div>
</fd-columns>
```

<fd-columns>
  <div>

**Markdown files**

- Editable by anyone with the repository
- Reviewed like code
- Diffable, blamable, revertable

  </div>
  <div>

**A database-backed CMS**

- Editable in a browser
- Reviewed in its own workflow
- History depends on the product

  </div>
</fd-columns>

Columns collapse into one stack on a narrow screen, so nothing is squeezed on a
phone. `min="20"` raises the width at which that happens.
