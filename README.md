<p align="center"><img src="public/logo.svg" width="120" alt="FeastDocs"></p>

# FeastDocs

A documentation framework built on Angular 21. Write **Markdown, HTML and SCSS**
in `docs/`; get a fast, searchable documentation app — sections in the top navbar
with nested dropdown menus, one sidebar per section, live Angular components
inside Markdown, a built-in content manager with two publishing strategies, and
git-based author attribution. Dark mode by default.

```bash
npm install
npm start          # http://localhost:4200
```

> **This file is the complete feature reference.** The site's own `docs/` content
> covers the same ground with live examples — but you will replace it with your
> own docs, and this README is what remains. Keep it.

---

## Table of contents

- [How it works](#how-it-works)
- [Commands](#commands)
- [Pages, sections and navigation](#pages-sections-and-navigation)
- [Front matter reference](#front-matter-reference)
- [Markdown features](#markdown-features)
- [Angular components in Markdown](#angular-components-in-markdown)
- [Styling](#styling)
- [Search](#search)
- [Theming](#theming)
- [Content manager and editing strategies](#content-manager-and-editing-strategies)
- [Author attribution](#author-attribution)
- [Configuration reference](#configuration-reference)
- [Build warnings](#build-warnings)
- [Deploying](#deploying)
- [Using this template for your own docs](#using-this-template-for-your-own-docs)
- [Where things live](#where-things-live)

---

## How it works

Two halves that meet at a generated folder:

```
docs/**/*.md                                              src/app/generated/
docs/**/*.html    ──▶  tools/build-content.mjs  ──▶       ├── docs/<page>.ts
docs/**/*.scss                                            ├── registry.ts
feastdocs.config.mjs                                      └── site-config.ts
                                                          public/search-index.json
                                                          public/docs-assets/**
```

The content pipeline renders everything at build time — Markdown, syntax
highlighting (Shiki, both themes in one pass), page-scoped SCSS, the navigation
trees, the search index, and git-based author metadata. The Angular app imports
the result lazily, **one chunk per page**, so the initial bundle does not grow
with the size of the docs set.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Content watcher + Angular dev server + the local editor API |
| `npm run build` | Render content, then build the static site to `dist/feastdocs/browser/` |
| `npm run docs:build` | Render content once, no server |
| `npm run docs:new -- <path> ["Title"] [--scss]` | Scaffold a page (front matter filled in; `--scss` adds a scoped stylesheet) |
| `npm test` | Unit tests |
| `npm run format` | Prettier over the project |

During `npm start`, edits to `docs/`, `feastdocs.config.mjs`, **and the
pipeline's own code under `tools/`** all trigger a rebuild (builds run in a
child process, so they always use the code on disk).

## Pages, sections and navigation

The `docs/` folder **is** the navigation — nothing is registered by hand.

```
docs/
├── index.md              → /            landing page (no sidebar)
├── index.scss              page-scoped styles for the landing page
├── guide/                → section "Guide": a navbar tab + its own sidebar
│   ├── _section.json       { "label": "Guide", "description": "…", "position": 1 }
│   ├── index.md          → /guide       section landing, first in its sidebar
│   ├── installation.md   → /guide/installation
│   └── advanced/           a category inside the section
│       ├── _category.json  { "label": "Advanced", "position": 20, "collapsed": true }
│       ├── index.md      → /guide/advanced   makes the category clickable
│       └── recipes/        a sub-category (deepest allowed level)
│           └── tips.md   → /guide/advanced/recipes/tips
└── _drafts/                files/folders starting with _ are never published
```

- **Sections** (top-level folders) become navbar tabs. Each tab opens a
  **dropdown of the section's tree**, with nested categories as flyout submenus.
- **Categories** (nested folders) become collapsible sidebar groups; collapse
  state persists per reader, and the active page's branch auto-reveals.
- **Depth limit: 3 folders** (section / category / sub-category). The editor and
  `docs:new` refuse deeper paths; the build warns if one appears anyway.
- **Prev/next** links follow sidebar order and never cross a section boundary.
- **Breadcrumbs** and the **"On this page"** table of contents (`h2`/`h3`, with
  scroll tracking) are derived automatically.
- The **hamburger** is always visible: on desktop it collapses/expands the
  docked sidebar (persisted); on mobile it opens a drawer that lists all
  sections plus the current section's tree.
- Ordering: `sidebar_position` ascending, then alphabetical. Leave gaps of 10.

## Front matter reference

All fields optional, YAML between `---` lines at the top of a page:

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `title` | string | first `#` heading, else filename | Page heading, browser title, search label |
| `description` | string | empty | Subtitle under the heading; meta description |
| `sidebar_label` | string | `title` | Shorter label for the sidebar |
| `sidebar_position` | number | `999` | Sort order among siblings |
| `slug` | string | derived from path | Overrides the route (collisions are a build warning) |
| `toc` | boolean | `true` | `false` hides the "On this page" panel |
| `hidden` | boolean | `false` | Keeps the URL and search entry, hides from navigation |
| `draft` | boolean | `false` | Excluded from the build entirely |
| `tags` / `keywords` | string[] | `[]` | Stored on the page / extra search terms |

`sidebarLabel` / `sidebarPosition` work as camelCase aliases.

## Markdown features

CommonMark plus:

- **Admonitions** — seven types, optional custom title:

  ```md
  :::tip
  Advice that saves time.
  :::

  :::warning Deprecated in v3
  Use `renderPage()` instead.
  :::
  ```

  Types: `note`, `info`, `tip`, `success`, `warning`, `caution`, `danger`.

- **Code blocks** — highlighted at build time (no highlighter in the browser),
  light and dark themes baked in, hover **copy button** included. Add a title:

  ````md
  ```ts title="src/main.ts"
  bootstrap();
  ```
  ````

  Unknown languages fall back to plain monospace (with a build warning).

- **Tables** — wrapped in a horizontal scroll container automatically.

- **Task lists** — `- [x] done` / `- [ ] todo`.

- **Attributes** — attach classes/ids to any element: `Text.{.callout}` or
  `## Heading {#custom-id}`. `{data-toc="false"}` keeps a heading out of the TOC.

- **Utility classes** (global, work everywhere including the editor preview):
  `{.lead}` for a larger intro paragraph, `{.callout}` for an accent-bar
  emphasis line.

- **Links** — relative `.md`/`.html` links become client-side routes and are
  **validated on every build** (broken links print a warning naming both files).
  External links open in a new tab.

- **Images/assets** — any non-doc file in `docs/` is copied to the site and
  relative references are rewritten. Keep assets next to the page.

- **Heading anchors** — every heading gets a permanent `#` link; `##`/`###`
  feed the table of contents.

- **Raw HTML** — passes through untouched inside `.md`. A standalone `.html`
  file in `docs/` is a full page too (front matter, TOC, link rewriting, search
  — everything except the Markdown parsing). Inside block-level HTML, wrap
  Markdown content in blank lines or it stays literal.

## Angular components in Markdown

Doc components are real Angular components registered as **custom elements**
([`src/app/doc-components/registry.ts`](src/app/doc-components/registry.ts)),
so they run live inside any page — state and all.

Built-ins:

```html
<!-- Tabbed content; panes are divs with a `tab` attribute -->
<fd-tabs>
  <div tab="npm">

  (markdown here, surrounded by blank lines)

  </div>
  <div tab="pnpm">…</div>
</fd-tabs>

<!-- Numbered tutorial steps with a connector line -->
<fd-steps>
  <div step="Install">…markdown…</div>
  <div step="Configure">…</div>
</fd-steps>

<!-- Live-state demo: attributes map to inputs -->
<fd-counter start="10" step="5"></fd-counter>

<!-- API reference row; the description is the element's content -->
<fd-api-field name="sidebar_position" type="number" default="999" required>
  Sort order among siblings.
</fd-api-field>
```

Adding your own: build a standalone component under `src/app/doc-components/`,
add one line to `registry.ts` (`{ tag: 'fd-chart', component: DocChart }`), use
`<fd-chart …>` in any page. Two rules learned the hard way:

- The template **must contain `<ng-content />`** if the component accepts
  content — `@angular/elements` silently drops light-DOM children without a
  projection slot.
- Use `ViewEncapsulation.None` when the component styles Markdown passed into it.

## Styling

Four levels, narrowest wins:

1. **Design tokens** — every colour, radius, font and layout width is a CSS
   custom property in [`src/styles/_tokens.scss`](src/styles/_tokens.scss),
   defined for light on `:root` and redefined under `[data-theme='dark']`.
   Layout knobs: `--fd-content-max`, `--fd-sidebar-width`, `--fd-toc-width`,
   `--fd-navbar-height`.
2. **Built-in utilities** — `{.lead}`, `{.callout}` (see Markdown features).
3. **Site-wide overrides** — [`src/styles/custom.scss`](src/styles/custom.scss)
   loads last; put your own utility classes and token overrides there
   (`.fd-markdown .my-class { … }`).
4. **Page-scoped SCSS** — a `.scss` file next to a page compiles at build time
   and is wrapped in `[data-doc-slug="…"]`, so it cannot leak to other pages.
   `@use`/`@import` lines are hoisted correctly. Scoping is by selector, not
   shadow DOM — prefer classes over bare element selectors.

## Search

Inline in the navbar — no modal. Type and results drop down beneath the input;
<kbd>Ctrl</kbd>+<kbd>K</kbd> (or `/`) focuses it from anywhere; arrows + Enter
navigate; results deep-link to the matched heading with `Section › Page` crumbs
and highlighted snippets. The index is built at build time
(`public/search-index.json`), split per heading section, fetched once on first
use, ranked client-side (heading > title > body, word-start and exact-phrase
boosts). The sidebar has its own filter box scoped to the current section.

## Theming

- **Dark by default** (configurable). A pre-boot script in `index.html` applies
  the theme before Angular loads — no flash of the wrong mode.
- The navbar button flips light↔dark; the choice persists per reader.
- Accent colours come from the config (`theme.accent` / `theme.accentDark`) and
  are written to `:root` at runtime — no SCSS edit needed for branding.
- Code blocks switch themes with pure CSS (Shiki emits both palettes).

## Content manager and editing strategies

`/_editor` (the pencil icon in the navbar): file tree, editor with
<kbd>Ctrl</kbd>+<kbd>S</kbd>, page creation with front-matter scaffolding, live
Markdown preview, and a "View page" link. Two backends, matching two publishing
strategies:

| Backend | When | What Save does |
| --- | --- | --- |
| **Local** | `npm start` running (file API on `127.0.0.1:4271`, scoped to `docs/`) | Writes to disk; you commit and push from your own editor — the normal git flow |
| **GitHub** | `github.repo` set in the config — the mode for the deployed site | **Commits to the configured branch via the GitHub API, authored by the connected user** |

The GitHub mode asks once for a fine-grained personal access token (contents
read/write on the docs repo); it stays in that browser's localStorage and is
sent only to `api.github.com`. A full OAuth sign-in requires a small
server-side code-for-token exchange (the client secret cannot ship in a static
site) — the connect screen is the seam where that plugs in.

The preview approximates the real build: admonitions, tables, task lists,
attributes and utility classes render exactly; code highlighting, link
rewriting and page-scoped SCSS only appear on the real page.

Nothing can write files in production except through GitHub — the local API
exists only on localhost during development.

## Author attribution

Every page footer shows **"Last updated {date} by {author}"**, read from
`git log` at build time. Both editing strategies end as commits, so attribution
is always truthful and updates on the next build. Fallback: not a git repo (or
uncommitted file) → file date, no author. **In CI, check out with
`fetch-depth: 0`** — a shallow clone has one commit of history and blanks out
most authors.

## Configuration reference

Everything lives in [`feastdocs.config.mjs`](feastdocs.config.mjs):

| Option | Type | Effect |
| --- | --- | --- |
| `title` | string | Navbar brand + browser-title suffix |
| `tagline` | string | Fallback meta description |
| `logo` | string or null | Image in `public/`, shown before the title |
| `docsDir` | string | Content folder (default `docs`) |
| `navbar.links` | array | Extra `{label, to}` or `{label, href}` links right of the section tabs |
| `footer.text` / `footer.links` | string / array | Footer content |
| `theme.defaultMode` | `'dark'`, `'light'`, `'system'` | First-visit theme |
| `theme.accent` / `theme.accentDark` | CSS colour | Accent per mode |
| `editUrl` | string or null | Base URL for "Edit this page" links |
| `showLastUpdated` | boolean | Show date + author in page footers |
| `github.repo` | string or null | `owner/name` — enables web editing |
| `github.branch` | string | Branch web edits commit to (default `main`) |

## Build warnings

The content build **never fails on a content problem** — it warns and carries
on, so a typo cannot block a deploy:

| Warning | Cause | Fix |
| --- | --- | --- |
| `link to "/x" does not match any document` | Broken or renamed link | Update the link |
| `Duplicate route "/x": a.md and b.md` | Two files resolve to one slug (`slug:` collision, or `page.md` + `page/index.md`); first wins | Rename one |
| `nested N folders deep — the maximum is 3` | Page too deep | Flatten or split into a section |
| `relative link "x" has no .md/.html extension` | Treated as an asset | Link the file, not the route |
| `<file>.scss: <error>` | Page stylesheet failed; page renders unstyled | Fix the SCSS |
| `Language "x" was not pre-loaded` | Unknown fence language; renders plain | Fix the language tag |

## Deploying

`npm run build` → static files in `dist/feastdocs/browser/`. One server rule:
unknown paths must fall back to `index.html` (routing happens in the browser).

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Subpath hosting: `ng build --base-href /docs/`.

A ready CI workflow ships at [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
build + test on every push and PR, and an optional **Cloudflare Pages** deploy on
`main` that activates once the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
repository secrets exist. It checks out with `fetch-depth: 0` so author
attribution survives (Cloudflare's own Git-integration builder may clone
shallowly — deploying from the workflow avoids that). Cloudflare Pages serves
`index.html` for unmatched paths automatically when no `404.html` is present, so
SPA routing needs no extra config.

The app self-heals after redeploys: if a browser tab from an older build hits a
renamed chunk, it reloads itself once and resyncs.

## Using this template for your own docs

1. Clone, then point the remote at your own repository (or delete `.git` and
   `git init` for a clean history).
2. Edit `feastdocs.config.mjs` — title, tagline, accents, `editUrl`,
   `github.repo`.
3. Replace the content of `docs/` with your own sections. The template's own
   docs (Guide / Reference / Components) are a living demo of every feature on
   this page — skim them before deleting.
4. Add the CI workflow above and deploy.

Requirements: Node **22.12+**. Angular is pinned to **21** on purpose (22 needs
a newer Node); upgrade Node before upgrading Angular.

## Where things live

| Path | Purpose |
| --- | --- |
| `docs/` | Your content — each top-level folder is a section. The only folder most people touch |
| `feastdocs.config.mjs` | All site configuration |
| `src/styles/_tokens.scss` | Design tokens (colours, sizes, fonts) for both themes |
| `src/styles/custom.scss` | Your site-wide overrides; loaded last |
| `src/app/doc-components/` | Angular components usable inside Markdown + their registry |
| `src/app/` | The application: layout, search, theming, page rendering, editor |
| `tools/` | The content pipeline (collect → render → emit), dev watcher, editor API, git metadata |
| `src/app/generated/` | Build output — regenerated, git-ignored, never edited |
| `public/` | Static assets; also receives `search-index.json` and `docs-assets/` |

## License

[MIT](LICENSE). Editing rights on a deployed site are simply your repository's
collaborator permissions: the web editor commits with each visitor's own GitHub
identity, and GitHub rejects writes from anyone without push access — a public
site or a public repo changes nothing about who can edit.
