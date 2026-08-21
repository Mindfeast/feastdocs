# FeastDocs — working notes for Claude

A documentation framework: Markdown, HTML and SCSS in `docs/` become a fast
Angular site, with live Angular components usable inside the Markdown. Think
Docusaurus, built on Angular.

Read this before changing anything. Most of it is scar tissue — things that look
reasonable and are wrong here.

## Commands

| Command              | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `npm start`          | Dev server: content build, `ng serve`, editor API, watchers. **Use this, not `ng serve`** |
| `npm run build`      | `docs:build` → `ng build` → `prerender.mjs`. Full production output                       |
| `npm run docs:build` | Content pipeline only — fastest way to check the build reads your change                  |
| `npm test`           | Content build, then Vitest                                                                |
| `npm run docs:new`   | Scaffold a page with correct front matter                                                 |
| `npm run format`     | Prettier over everything                                                                  |

Before saying a change works: `npm run build && npm test`, then look at it in a
browser. The pipeline fails soft in many places by design, so a silent wrong
result is more likely than a crash.

## How a page becomes a page

```
docs/**.md ──┐
             ├─► tools/  (Node, build time) ──► src/app/generated/*.ts ──► Angular ──► dist/
config ──────┘                                  (gitignored)                    │
                                                                                └─► prerender.mjs
                                                                                    static HTML + sitemap
```

1. **`tools/build-content.mjs`** — the entry point. Deepens shallow git history,
   collects changelog data, writes changelog pages into `docs/`, then scans.
2. **`tools/lib/collect.mjs`** — reads every file, renders Markdown (markdown-it
   - Shiki), computes slugs, builds the section/sidebar tree, validates links,
     compiles per-page SCSS, and synthesises category landing pages.
3. **`tools/lib/emit.mjs`** — writes `src/app/generated/`: one module per page,
   `registry.ts` (loaders, index, sections, page order), `site-config.ts`,
   `changelog.ts`, and the search index.
4. **Angular** lazy-loads one chunk per page and injects the pre-rendered HTML.
5. **`tools/prerender.mjs`** — after `ng build`, writes a static `index.html`
   per route with meta tags, plus `sitemap.xml` and `robots.txt`. Gated on
   `siteUrl`.

## Rules that are not obvious

**Never edit `src/app/generated/`.** Gitignored, rewritten on every build. If
something there is wrong, fix the emitter.

**Doc components must contain `<ng-content />`** if they accept content.
`@angular/elements` silently drops light-DOM children without a projection slot
— the component renders empty and nothing warns you. Use
`ViewEncapsulation.None` when the component styles Markdown passed into it.

**Generated files inside `docs/`.** Changelog month pages are _real files_
(`docs/changelog/**`), rewritten every build; hand edits are lost. They carry an
`AUTO-GENERATED` marker comment, and their `_category.json` carries
`"generated": true` — that is how pruning knows what it may delete. Category
landing pages are the opposite: synthesised in memory, never written to disk.

**A body `# H1` after anything else is not stripped.** `stripMarkdownH1` only
removes a leading H1 that is the first content in the file. Put a comment before
it and the page renders its title twice. Generated pages therefore have no body
heading at all — the template renders the front-matter title.

**Dates: slice ISO strings, never parse them.** `new Date(commit.date)` applies
the local timezone and can move a commit into a neighbouring month, so the build
and the component would disagree about which page it belongs on. Everywhere that
groups by month uses `date.slice(0, 7)`.

**Nothing in the build may hang.** A deploy that hangs looks like a deploy that
is slow, and Cloudflare builds serially — one stuck build blocks every later
one. Every git call has a timeout, `git fetch` runs with `GIT_TERMINAL_PROMPT=0`
and an empty credential helper, and every `fetch()` carries an
`AbortSignal.timeout`. Remote history collection shares a 90s budget. Keep it
that way: fail soft, log, move on.

**Mermaid must stay lazy.** It is ~500kB. The component imports it with a
dynamic `import('mermaid')`, so it lands in its own chunk and pages without a
diagram never pay for it. Importing it statically anywhere would put it in the
initial bundle. It also bakes colours into the SVG, so a theme change requires
a re-render rather than a restyle.

**`writeIfChanged` everywhere in the emitter.** Rewriting an identical file
retriggers the dev server, which retriggers the build.

**Shallow clones.** Cloudflare Pages checks out one commit and does _not_ report
itself as shallow, so `git rev-parse --is-shallow-repository` cannot be trusted.
The build judges by the result: one commit plus a configured repo means read the
history from the host API instead.

## Trust boundary — read before touching rendering

Rendered page HTML is injected with `bypassSecurityTrustHtml`. That is safe only
because `docs/` is authored and code-reviewed by people with repository access.
**Never reuse that path for Markdown from anywhere else** — user submissions,
issue bodies, an API. That would be stored XSS.

Related: the local editor API (`tools/editor-api.mjs`) writes files, and is
dev-only, bound to `127.0.0.1`, and path-confined to `docs/`. Production builds
must never call it.

## Secrets

Never in `feastdocs.config.mjs` — it is committed. A GitHub OAuth **client id**
is public and belongs there; everything below belongs in the host's secret
store:

| Variable               | Needed for                                       |
| ---------------------- | ------------------------------------------------ |
| `GITHUB_CLIENT_SECRET` | OAuth code exchange (Pages Function)             |
| `GITHUB_TOKEN`         | Private or rate-limited GitHub changelog sources |
| `AZURE_DEVOPS_PAT`     | Any Azure DevOps changelog source                |
| `CLOUDFLARE_API_TOKEN` | Deploying from CI                                |

Who can commit from the web editor is not configured: the editor reads the
signed-in user's push permission. Anyone may sign in and experiment; only people
with push access get a working Commit button.

## Where things live

```
docs/                     content — the folder IS the navigation
feastdocs.config.mjs      the only site configuration
tools/                    build-time pipeline (Node ESM, no TypeScript)
  lib/collect.mjs         scan, render, slugs, sidebar tree, category indexes
  lib/emit.mjs            writes src/app/generated/
  lib/changelog*.mjs      git/GitHub/Azure history, and the pages made from it
  prerender.mjs           static HTML, meta tags, sitemap, robots
  dev.mjs                 dev orchestration (content builds run in a child
                          process, so editing tools/ needs no restart)
src/app/
  core/                   models, content/search/theme/github services
  doc-components/         custom elements usable in Markdown (registry.ts)
  layout/                 navbar, sidebar, toc, search, footer
  pages/doc-page/         renders a page
  pages/editor/           the content manager (/_editor)
  generated/              build output — do not edit
functions/api/            Cloudflare Pages Functions (OAuth exchange)
deploy/                   nginx, IIS, Azure Pipelines
```

## Adding things

**A doc component:** build a standalone component under `src/app/doc-components/`,
add one line to `registry.ts`, use `<fd-your-tag>` in any page. Remember
`<ng-content />` and `ViewEncapsulation.None`.

**A config option:** add it to `DEFAULTS` in `tools/lib/config.mjs` (nested
blocks are spread-merged in `loadConfig`), consume it in `tools/`, and — only if
the browser needs it — add it to the `writeSiteConfig` payload in `emit.mjs` and
to `SiteConfig` in `src/app/core/models.ts`. Document it in
`docs/reference/configuration.md` and the README.

**A section:** a top-level folder in `docs/`. `_section.json` sets its label and
order; `_category.json` does the same for nested folders. Max depth 8.

## The starter template

`Mindfeast/feastdocs-template` is generated from this repo by
`tools/sync-template.mjs`, and CI pushes it on every commit to `main`. Do not
edit that repository by hand — a change there is overwritten by the next sync.

What it contains: every tracked file except this site's `docs/`, its branding
(`logo.svg`, `og-image.png`, favicons) and its `README.md` and
`feastdocs.config.mjs`, which come from `template/` instead. `docs/_templates/`
is re-included by name, since the page templates are a feature. `CLAUDE.md`
syncs verbatim — it documents the framework, not this site.

So: a new component, tool or config option needs nothing extra. A new _starter
page_ or a change to the starter's defaults goes in `template/`.

## Conventions

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:` …). The changelog
  turns the prefix into a badge and strips it from the headline, so the subject
  should read as a sentence without it.
- Commit messages here explain _why_, and name what was verified. Match that.
- **Do not add `Co-Authored-By` trailers.** The owner had them stripped from the
  whole history deliberately; re-adding one puts it back.
- Prettier formats everything — run `npm run format` before committing.
- Comments explain intent, not mechanics. If a line looks wrong but is right,
  say why; otherwise leave it alone.

## Environment

Angular 21, pinned: Angular 22 needs Node ≥ 22.22.3 and this machine runs
22.12. Zoneless, signals, standalone components, Vitest. No SSR — prerendering
covers SEO instead.

Cloudflare Pages output directory is **`dist/feastdocs/browser`**, not
`dist/feastdocs`. Any host needs an SPA fallback to `index.html`; note that such
a fallback returns HTTP 200 for paths that do not exist, so checking a status
code proves nothing about whether a file deployed — grep the body instead.
