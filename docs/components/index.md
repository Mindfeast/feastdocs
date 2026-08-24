---
title: Angular components in Markdown
description: Doc components are real Angular components, registered as custom elements — usable in any page.
sidebar_label: Overview
---

# Angular components in Markdown

Every component in this section is a **real Angular component running live on this
page**. They are registered as [custom elements](https://angular.dev/guide/elements)
at startup, so the browser upgrades them wherever they appear — including inside the
HTML that compiled Markdown produces.

## Using one

Write the tag directly in any `.md` or `.html` page:

```html
<fd-counter start="10" step="5"></fd-counter>
```

And it renders — with working state, right here:

<fd-counter start="10" step="5"></fd-counter>

:::note Blank lines matter
Markdown treats a block-level HTML tag as an HTML block. Inside it, put a **blank
line around any Markdown content** you want rendered (see the tabs example on the
next page) — otherwise it stays literal text.
:::

## The built-in components

| Tag                     | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `<fd-tabs>`             | Tabbed content — package managers, languages, platforms               |
| `<fd-steps>`            | Numbered tutorial steps with a connector line                         |
| `<fd-counter>`          | Minimal interactive demo of live Angular state                        |
| `<fd-api-field>`        | One documented option/parameter, for API references                   |
| `<fd-mermaid>`          | A [Mermaid diagram](./mermaid.md) — written as a ` ```mermaid ` fence |
| `<fd-changelog>`        | [Repository history](./changelog.md) read from git at build time      |
| `<fd-changelog-months>` | An index of the generated changelog pages                             |
| `<fd-changelog-repos>`  | Cards linking to each repository's changelog                          |
| `<fd-category-index>`   | Cards for everything inside a category                                |

Each has its own page in this section, with the source Markdown shown next to the
live result.

Diagrams are the one component you never write as a tag: a fenced
` ```mermaid ` block becomes one, so diagrams from another documentation
tool work unchanged. See [Diagrams](./mermaid.md).

## Adding your own

<fd-steps>
  <div step="Build a normal standalone component">

Put it under `src/app/doc-components/`. Use `ViewEncapsulation.None` if it should
style Markdown content passed into it.

  </div>
  <div step="Register the tag">

Add one line to `src/app/doc-components/registry.ts`:

```ts
{ tag: 'fd-chart', component: DocChart },
```

  </div>
  <div step="Use it in any page">

```html
<fd-chart data="1,4,2,8"></fd-chart>
```

Attributes map to `@Input()`s automatically. Use `numberAttribute` /
`booleanAttribute` transforms for non-string inputs.

  </div>
</fd-steps>

## How content reaches a component

Content inside your tag arrives as ordinary light DOM, not Angular content
projection — `innerHTML` has no `<ng-content>` path. The built-ins show the three
ways to handle it:

- **Read and re-render** (`fd-tabs`): read the authored children after upgrade,
  render your own UI from them.
- **Decorate in place** (`fd-steps`): leave the authored DOM alone and add
  classes/markers around it — nested components keep working.
- **Move into the template** (`fd-api-field`): relocate the authored nodes into a
  slot of your template.
