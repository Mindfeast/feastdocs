---
title: 'Changelogs for several products'
description: 'Track commits from more than one repository on one docs site, on GitHub and Azure DevOps, public or private.'
sidebar_position: 65
---

# Changelogs for several products

One docs site often covers several products, each living in its own repository.
[`<fd-changelog>`](../components/changelog.md) can read any of them, so a
reader gets a per-product history without leaving the documentation.

There are two kinds of source:

<fd-api-field name="this repository" type="git log">
  The repository the docs live in. Read from the local checkout, so entries
  carry a file count and can be filtered to documentation changes.
</fd-api-field>
<fd-api-field name="another repository" type="host API">
  Any GitHub or Azure DevOps repository listed in <code>changelog.repos</code>.
  Read at build time over HTTPS.
</fd-api-field>

## 1. List the repositories

Every source goes in `changelog.repos` in `feastdocs.config.mjs`:

```js
changelog: {
  limit: 150,
  repos: [
    // GitHub, shorthand — the branch defaults to main
    'acme/checkout-api',

    // GitHub, explicit branch
    { repo: 'acme/mobile-app', branch: 'release' },

    // Azure DevOps
    {
      provider: 'azure',
      org: 'contoso',
      project: 'Payments Platform',
      repo: 'payments-api',
      branch: 'main',
      id: 'payments',
    },
  ],
},
```

`id` is optional and only exists to give a source a short name. Without it the
id is the GitHub `owner/name`, or `azure:org/project/repo` for Azure — correct
but tedious to type into a page.

## 2. Point a page at one

```html
<fd-changelog repo="acme/checkout-api"></fd-changelog>
<fd-changelog repo="payments" limit="30"></fd-changelog>
```

A page per product, each with its own `<fd-changelog>`, is usually what you
want — one page listing everything mixes unrelated products and loses the
grouping that makes a changelog readable.

A `repo` that is not in `changelog.repos` renders a notice naming it, so a typo
is obvious rather than silently producing an empty page.

## 3. Give the build a token

The local repository needs no credentials. Every other source is fetched from
its host, and that is where tokens come in.

<fd-tabs>
  <div tab="GitHub">

**Public repository:** nothing required. Anonymous requests work, but they are
limited to 60 per hour per IP — shared with every other build on the same host,
so a token is still worth setting.

**Private repository:** required. Create a fine-grained personal access token
with **Contents: Read-only** on the repositories you list (or a classic token
with the `repo` scope), and put it in the build environment as `GITHUB_TOKEN`.
`GH_TOKEN` is also accepted.

  </div>
  <div tab="Azure DevOps">

**Always required**, public project or not. In Azure DevOps: **User settings →
Personal access tokens → New Token**, scope **Code (Read)**, scoped to the
organisation holding the repositories.

Put it in the build environment as `AZURE_DEVOPS_PAT` (or
`AZURE_DEVOPS_TOKEN`). The build sends it as HTTP Basic with an empty username,
which is the scheme Azure documents.

  </div>
</fd-tabs>

### Where the token goes

Never in `feastdocs.config.mjs` — that file is committed. It belongs in the
build host's secret store:

<fd-tabs>
  <div tab="Cloudflare Pages">

**Settings → Environment variables → Add variable**, type **Secret** (encrypted),
for the Production and Preview environments you build. Name it `GITHUB_TOKEN`
or `AZURE_DEVOPS_PAT`.

  </div>
  <div tab="GitHub Actions">

Store it as a repository secret and pass it to the build step:

```yaml
- run: npm run build
  env:
    GITHUB_TOKEN: ${{ secrets.CHANGELOG_TOKEN }}
    AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
```

Do not reuse the automatic `secrets.GITHUB_TOKEN` for repositories other than
the one running the workflow — it has no access to them.

  </div>
  <div tab="Azure Pipelines">

Add it as a **secret variable** on the pipeline (or from a variable group backed
by Key Vault), then map it into the step — secret variables are not exposed as
environment variables automatically:

```yaml
- script: npm run build
  env:
    AZURE_DEVOPS_PAT: $(azureDevOpsPat)
    GITHUB_TOKEN: $(githubToken)
```

  </div>
  <div tab="Docker">

Pass it as a build argument or, better, a build secret so it does not persist
in an image layer:

```dockerfile
RUN --mount=type=secret,id=azpat \
    AZURE_DEVOPS_PAT="$(cat /run/secrets/azpat)" npm run build
```

  </div>
</fd-tabs>

:::warning Collected history becomes public
The commits are baked into the deployed page. Subjects, bodies and author names
are readable by anyone who can open the site, even when the repository itself
stays private. Only list repositories whose commit messages you would publish —
and remember that internal commit messages often name customers, incidents and
unreleased work.
:::

## What differs between sources

|                    | This repository | GitHub API                          | Azure DevOps API                      |
| ------------------ | --------------- | ----------------------------------- | ------------------------------------- |
| File count         | yes             | no                                  | yes (`changeCounts`)                  |
| `docs-only` filter | yes             | keeps everything it cannot rule out | same                                  |
| Merge commits      | skipped         | skipped                             | kept — a squashed PR is the change    |
| Commit body        | full            | full                                | may be truncated by Azure, marked `…` |
| Commit links       | repository host | GitHub                              | Azure DevOps                          |

Azure squash merges arrive as `Merged PR 482: fix: …`. That prefix is stripped
so the conventional-commit type inside still becomes a badge.

## Checking it worked

The build prints one line per source:

```text
changelog: git history gave 46 commits
changelog acme/checkout-api: 120 commits from the GitHub API
changelog Payments Platform/payments-api: 150 commits from Azure DevOps
```

Read that in your deploy log first — it says exactly what each source produced.
Nothing here fails a build: a source that cannot be read logs a warning and
renders an empty history, because a changelog is not worth blocking a deploy.

| Log line                                       | Cause                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GitHub API 404`                               | Private repository without a token, or a branch that does not exist                                    |
| `GitHub API 403`                               | Rate limited — set `GITHUB_TOKEN`                                                                      |
| `Azure DevOps 401` or `203`                    | Missing or expired PAT, or no **Code (Read)** scope                                                    |
| `no AZURE_DEVOPS_PAT in the build environment` | The variable never reached the build — on Azure Pipelines, secret variables must be mapped into `env:` |
| `git history gave 1 commit`                    | The checkout is shallow; the build falls back to the API for this repository                           |
