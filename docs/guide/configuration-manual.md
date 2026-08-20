---
title: 'Configuration manual'
description: 'Every setting that needs a value, in the order it matters, with the check that proves it works.'
sidebar_position: 68
---

# Configuration manual

Everything lives in `feastdocs.config.mjs`, plus a small number of secrets that
belong in your host rather than the repository. This page walks the whole thing
in dependency order — each step names what to set, what it unlocks, and the
check that proves it took effect.

For the bare option table, see [configuration reference](../reference/configuration.md).
For a first-time clone, start at [use it for your own docs](./your-own-docs.md).

:::tip
Nothing here is required to run the site. `npm start` works on a fresh clone
with no configuration at all — every step below turns on a specific capability.
:::

## 1. Identity

```js
title: 'Acme Docs',
tagline: 'Everything about the Acme platform.',
logo: 'logo.svg',        // a file in public/, or null for text only
docsDir: 'docs',
```

`title` becomes the navbar brand and the browser-title suffix. `tagline` is the
fallback meta description for pages that declare none.

**Check:** `npm start` → the navbar shows your title and logo.

## 2. Public URL — required for SEO

```js
siteUrl: 'https://docs.acme.com',
```

This single value gates every SEO output: prerendered HTML per page, canonical
URLs, Open Graph tags, `sitemap.xml` and `robots.txt`. Leave it `null` for an
internal site and none of it is generated.

Use the address readers actually visit. If you have both a
`project.pages.dev` and a custom domain, name the custom domain — canonical URLs
pointing at the wrong host split your ranking between two copies.

**Check:** `npm run build` ends with `prerendered N pages, sitemap.xml, robots.txt`.
Then `curl https://your-site/sitemap.xml` and confirm your own host in the URLs.

## 3. Link previews

```js
socialImage: 'og-image.png',   // 1200×630 PNG or JPG in public/
```

Without it, a link shared on LinkedIn, Slack, X or WhatsApp renders as a bare
text card. SVG does not work on any of them.

**Check:** after deploying, `curl -s https://your-site/ | grep og:image`. To
refresh a preview those platforms already cached, use LinkedIn's
[Post Inspector](https://www.linkedin.com/post-inspector/).

## 4. Repository links and attribution

```js
github: {
  repo: 'acme/docs',
  branch: 'main',
},
editUrl: 'https://github.com/acme/docs/edit/main/',
showLastUpdated: true,
```

`github.repo` drives three separate things: the "Source on GitHub" links in the
footer and navbar, the commit links in changelogs, and web editing. `editUrl`
is the plain "Edit this page" link for people who prefer their own editor.

Attribution comes from `git log`, so it needs real history. A shallow clone
(`--depth 1`) leaves most pages without an author. The build deepens a shallow
checkout itself and falls back to the host API where it cannot, but a full
checkout in CI is still the cheapest path: `fetch-depth: 0` on GitHub Actions,
`fetchDepth: 0` on Azure Pipelines.

**Check:** any page footer reads "Last updated {date} by {author}".

## 5. Web editing

The content manager at `/_editor` works with no configuration — locally it
writes files through a dev-only API bound to `127.0.0.1`. Committing from the
deployed site needs OAuth:

<fd-steps>
  <div step="Register a GitHub OAuth app">

**Settings → Developer settings → OAuth Apps → New OAuth App**. Homepage is
your site; the callback URL is `https://your-site/_editor`.

  </div>
  <div step="Put the client id in the config">

```js
github: {
  repo: 'acme/docs',
  branch: 'main',
  oauthClientId: 'Ov23li…',
  oauthScope: 'public_repo',   // 'repo' for a private repository
},
```

A client id is public information and belongs in the committed config.

  </div>
  <div step="Put the client secret in the host">

The secret must never be committed. On Cloudflare Pages: **Settings →
Environment variables**, as encrypted `GITHUB_CLIENT_SECRET`, alongside
`GITHUB_CLIENT_ID`. The Pages Function exchanges the OAuth code for a token
server-side so the secret never reaches a browser.

  </div>
  <div step="Decide who can commit">

Nothing to configure — the editor reads the signed-in user's push permission on
the repository. Anyone can sign in, browse and experiment; only people with push
access see a working Commit button. That is what makes a public demo safe.

  </div>
</fd-steps>

```js
editor: {
  invite: 'Try it now',   // null for a quiet icon (the default)
},
```

Set `invite` only on a public demo, where visitors need a nudge towards the
editor. A team's own docs should leave it `null`.

**Check:** open `/_editor` on the deployed site and sign in. If the endpoint
returns `501 missing: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET`, the variables are
on a different project than the one serving the site.

## 6. Changelog

```js
changelog: {
  limit: 150,
  repos: [],   // other products — see the dedicated manual
},
```

`limit` bounds how many commits the build collects. The data is a lazy chunk, so
a larger number costs nothing on pages that do not use `<fd-changelog>`.

```js
changelog: {
  monthlyPages: true,
  monthlyPagesDir: 'changelog',
},
```

`monthlyPages` writes a page per month under a category per year, so the
sidebar reads Changelog → 2026 → August. The files are generated on every
build and hand edits are overwritten — see
[the component reference](../components/changelog.md#a-page-per-month).

For several products, or repositories on Azure DevOps, and for the tokens each
needs, see [changelogs for several products](./changelog-repos.md).

**Check:** the build logs `changelog: git history gave N commits`. If N is 1 on a
repository with real history, the checkout is shallow — the API fallback covers
it, and the log line tells you it happened.

## 7. Appearance and navigation

```js
theme: {
  defaultMode: 'dark',      // 'light' | 'dark' | 'system'
  accent: '#e26f1e',        // used in light mode
  accentDark: '#ff9d52',    // used in dark mode
},
sidebar: { autoCollapse: false },
navbar: { links: [] },      // extra links right of the section tabs
footer: {
  text: `© ${new Date().getFullYear()} Acme`,
  links: [{ label: 'Status', href: 'https://status.acme.com' }],
},
```

Sections are **not** configured here — they come from the top-level folders in
`docs/`. See [pages and navigation](./pages.md).

Two accents exist because one colour rarely has enough contrast on both a white
and a near-black background. Set both.

## 8. Secrets, all in one place

None of these belong in the repository:

| Variable | Needed for | Where it goes |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | Web editing OAuth | Host environment variable |
| `GITHUB_CLIENT_SECRET` | Web editing OAuth | Host **secret** |
| `GITHUB_TOKEN` | Private or rate-limited GitHub changelog sources | Host **secret** |
| `AZURE_DEVOPS_PAT` | Any Azure DevOps changelog source | Host **secret** |
| `CLOUDFLARE_API_TOKEN` | Deploying from CI | CI **secret** |

A rule that saves grief later: if a value would let someone act as you, it goes
in the host's secret store, is referenced by name in code, and is rotated when
someone leaves. Everything else can be committed.

## 9. Deployment

Covered in full by [use it for your own docs](./your-own-docs.md#4-deploy) —
Cloudflare Pages, Docker with nginx, IIS on Windows, and Azure Pipelines. Two
settings trip people up regardless of host:

- **Output directory** is `dist/feastdocs/browser`, not `dist/feastdocs`.
- **SPA fallback** must serve `index.html` for unknown paths, or a deep link
  reloads into a 404. The bundled `deploy/nginx.conf` and `deploy/web.config`
  already do it.

Note that an SPA fallback returns HTTP 200 for paths that do not exist, so
`curl -o /dev/null -w '%{http_code}'` is not a way to check whether a file
deployed. Grep the body for something only the new build contains.

## Verifying the whole thing

After a deploy, these four commands tell you almost everything:

```bash
curl -s https://your-site/sitemap.xml | head -5
```

```bash
curl -s https://your-site/ | grep -E 'canonical|og:image|og:title'
```

```bash
curl -s https://your-site/robots.txt
```

```bash
curl -s https://your-site/any/real/page | grep -c '<h1'
```

The last one matters most: a `1` proves prerendering works and that crawlers see
real content without running JavaScript.
