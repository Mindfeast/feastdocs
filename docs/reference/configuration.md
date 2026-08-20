---
title: Configuration
description: Every option in feastdocs.config.mjs.
sidebar_position: 2
---

# Configuration

One file configures the site: `feastdocs.config.mjs` at the project root. It is read
by the content build and emitted as a typed module the app imports, so both halves
of the framework always agree.

```js title="feastdocs.config.mjs"
export default {
  title: 'FeastDocs',
  tagline: 'Documentation that lives next to the code.',
  logo: null,
  docsDir: 'docs',
  navbar: {
    links: [{ label: 'Docs', to: '/intro' }],
  },
  footer: {
    text: '© 2026 FeastDocs',
    links: [],
  },
  theme: {
    defaultMode: 'system',
    accent: '#f0812c',
    accentDark: '#ff9d52',
  },
  sidebar: {
    autoCollapse: false,
  },
  editUrl: null,
  showLastUpdated: true,
};
```

## Site

| Option | Type | Effect |
| --- | --- | --- |
| `title` | string | Navbar brand and the suffix of every browser title |
| `siteUrl` | string \| null | Public origin (e.g. `https://docs.example.com`). Enables SEO output at build time: prerendered HTML per page, canonical/Open Graph tags, sitemap.xml, robots.txt |
| `tagline` | string | Fallback meta description for pages without one |
| `logo` | string \| null | Path to an image inside `public/`, shown before the title |
| `docsDir` | string | Where the content lives, relative to the project root |

## Navbar and footer

Links take either `to` for an internal route or `href` for an external URL. External
links open in a new tab and are marked as such.

`footer.text` and `footer.links` render in the site footer. When `github.repo` is
set, a **"Source on GitHub"** link is added for free — in the footer and as a
GitHub mark in the navbar — so readers can find the project and clone it.

```js
navbar: {
  links: [
    { label: 'Docs', to: '/intro' },
    { label: 'API', to: '/reference/configuration' },
    { label: 'Repository', href: 'https://dev.azure.com/example' },
  ],
}
```

## Theme

| Option | Type | Effect |
| --- | --- | --- |
| `defaultMode` | `'system'` \| `'light'` \| `'dark'` | What a first-time reader gets |
| `accent` | CSS colour | Accent in light mode |
| `accentDark` | CSS colour | Accent in dark mode |

Both accents are written to `:root` as custom properties at startup, so they are
available to every stylesheet — including [page-scoped SCSS](../guide/styling.md).

A reader's own choice is stored in `localStorage` and wins over `defaultMode` from
then on. A small inline script in `index.html` applies it before Angular boots, so
there is no white flash on load.

:::note System default and the first paint
The pre-boot script trusts a stored choice, and otherwise follows the operating
system. If you set `defaultMode: 'light'` while the reader's OS is dark, the very
first frame may be dark before the configured default takes over.
:::

## Editing and metadata

| Option | Type | Effect |
| --- | --- | --- |
| `editUrl` | string \| null | Base URL of a repo file view; the page's source path is appended |
| `showLastUpdated` | boolean | Show the source file's modification date in the page footer |

```js
editUrl: 'https://github.com/acme/docs/edit/main/',
```

:::info Where the date comes from
`showLastUpdated` reads the file's modification time on disk. In a fresh clone or a
clean CI checkout that is the checkout time, not the last edit — if the real
authoring date matters, drive it from your VCS instead.
:::

## GitHub

| Option | Type | Effect |
| --- | --- | --- |
| `github.repo` | string \| null | `owner/name`; enables the content manager's GitHub mode (web edits become commits) |
| `github.branch` | string | Branch that web edits are committed to (default `main`) |
| `github.oauthClientId` | string \| null | OAuth App client id; enables the "Sign in with GitHub" button |
| `github.oauthScope` | string | Scope requested at sign-in — `public_repo` for a public repo, `repo` if private (default `repo`) |

See [Use it for your own docs](../guide/your-own-docs.md) for a full setup
walk-through, including CI.

## Editor

| Option | Type | Effect |
| --- | --- | --- |
| `editor.invite` | string \| null | Label on the navbar's content-manager link, shown until a reader opens it once. `null` (the default) keeps a plain icon |

Teams running their own docs already know the editor is there, so the default is
a quiet icon. A **public demo** is the case for an invitation — set
`invite: 'Try it now'` (any wording, in any language) and first-time visitors
get a labelled link that retires itself after they use it.

## Changelog

| Option | Type | Effect |
| --- | --- | --- |
| `changelog.limit` | number | How many commits the build reads from `git log`. Default `150` |

The [`<fd-changelog>`](../components/changelog.md) component renders repository
history collected at build time. The limit bounds the generated data, so raising
it costs a slightly larger lazy chunk and nothing else. Attribution needs real
history, so CI must clone with full depth (`fetch-depth: 0`).

## Sidebar

`autoCollapse` is reserved for collapsing every category except the active one.
Collapse state is otherwise per-reader: expanding or collapsing a category is
remembered in `localStorage`, and the branch containing the current page is always
revealed.

## Layout and spacing

Layout is not configured here — it lives in the design tokens, because that is where
CSS belongs:

```scss title="src/styles/custom.scss"
:root {
  --fd-content-max: 940px;
  --fd-sidebar-width: 320px;
  --fd-toc-width: 240px;
}
```

See [Styling](../guide/styling.md) for the full token list.
