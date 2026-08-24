---
title: Commands
description: Every npm script, and what it actually runs.
sidebar_position: 4
---

# Commands

## Daily use

```bash title="Development"
npm start
```

Renders `docs/`, starts the Angular dev server, and watches for changes. Editing a
`.md`, `.html`, `.scss` or asset file re-renders only what is needed; editing
`feastdocs.config.mjs` is picked up too, without restarting.

```bash title="Production build"
npm run build
```

Runs the content build, then `ng build`. Output lands in `dist/feastdocs/browser/`.

## Individual steps

| Command                                | What it does                                                          |
| -------------------------------------- | --------------------------------------------------------------------- |
| `npm run docs:build`                   | Renders content once, without starting a server                       |
| `npm run serve`                        | Angular dev server alone, against whatever content was last generated |
| `npm run docs:new -- <path> ["Title"]` | Creates a page from a template                                        |
| `npm test`                             | Renders content, then runs the unit tests                             |
| `npm run format`                       | Prettier over the whole project                                       |

## Creating a page

```bash
npm run docs:new -- guides/deploying "Deploying to production"
```

Creates `docs/guides/deploying.md` with front matter filled in. Add `--scss` to get a
scoped stylesheet next to it:

```bash
npm run docs:new -- guides/deploying "Deploying to production" --scss
```

:::note The `--` matters
`npm run` needs `--` before arguments, otherwise npm swallows them instead of passing
them to the script.
:::

## Build warnings

The content build never fails on a content problem — it reports and carries on, so a
typo cannot block a deploy. Warnings you should act on:

| Warning                                        | Cause                                                                                                                                                                            | Fix                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `link to "/x" does not match any document`     | A relative link points at a file that does not exist, or a page was renamed                                                                                                      | Update the link, or restore the page               |
| `Duplicate route "/x": a.md and b.md`          | Two files resolve to the same slug — usually a `slug:` override colliding with a real file, or `page.md` next to `page/index.md`. The **first file wins; the second is dropped** | Rename one of them, or change the `slug:` override |
| `nested N folders deep — the maximum is 8`     | A page sits deeper than a section plus seven category levels                                                                                                                     | Flatten the tree or split into another section     |
| `relative link "x" has no .md/.html extension` | The link was treated as an asset — add the extension if it is a page                                                                                                             | Link to the file, not the route                    |
| `<file>.scss: <sass error>`                    | A page stylesheet failed to compile; the page renders unstyled                                                                                                                   | Fix the SCSS — the error names the line            |
| `Language "x" was not pre-loaded`              | A code fence uses a language Shiki doesn't know; it renders as plain text                                                                                                        | Check the fence's language tag                     |

### How duplicate routes happen

Every file maps to a route derived from its path, and `slug:` in the front matter
can override it — so two files can land on the same URL:

```text
docs/guide/setup.md            → /guide/setup
docs/guide/setup/index.md      → /guide/setup     ← duplicate
docs/api.md  (slug: guide/setup) → /guide/setup   ← duplicate
```

The build keeps the first file it finds (alphabetical order), drops the rest, and
prints a warning naming both files so the collision is never silent. See
[Pages & sections](../guide/pages.md) for the full path-to-route rules.

A broken page stylesheet is the one case worth watching in CI, since the page still
publishes without its styles.

## Deploying

The build output is static files, with one server requirement: unknown paths must
fall back to `index.html`, because the router runs in the browser.

```nginx title="nginx"
location / {
  try_files $uri $uri/ /index.html;
}
```

If you serve the docs from a subpath rather than a domain root, set the base href at
build time:

```bash
ng build --base-href /docs/
```
