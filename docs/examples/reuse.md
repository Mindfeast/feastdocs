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

A snippet is a piece of content written **once** and included in several pages,
so the pages cannot drift apart.

The problem it solves is ordinary: some things have to be said in more than one
place. A prerequisite. A warning about a footgun. The support address. Who to ask
for access. Copy them and they are correct on the day you write them — a year
later, one has been updated three times and the others are quietly wrong.

**This site had exactly that.** The warning about shallow clones belonged on the
changelog page, the attribution section and the configuration manual, and it was
written out three times in three slightly different wordings. It is now one file,
`_snippets/shallow-clone.md`, included in each. This is that file:

{{ snippet:shallow-clone }}

The [configuration manual](../guide/configuration-manual.md#4-repository-links-and-attribution)
shows the same block, from the same source. Change the file and both pages change.

### Writing one

Put a Markdown file in `docs/_snippets/`, then include it by name:

```markdown
{{ snippet:shallow-clone }}
```

A snippet is ordinary Markdown — admonitions, components and code all work — and
may use variables or include other snippets. Subfolders work too:
`_snippets/api/auth.md` is `{{ snippet:api/auth }}`.

### When to reach for one

<fd-columns>
  <div>

**Worth a snippet**

- A prerequisite repeated across a section
- A deprecation or migration notice
- Auth steps shared by every API page
- Support contacts, SLAs, environment URLs

  </div>
  <div>

**Not worth it**

- Text that appears once
- Something two pages happen to share today but for unrelated reasons
- Anything a reader should see spelled out in place

  </div>

</fd-columns>

A snippet used in one place is indirection with no payoff: the reader has to open
another file to see what the page says.

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
  <div>**Left column** — markdown, with blank lines.</div>
  <div>**Right column.**</div>
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
