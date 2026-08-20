---
title: Use it for your own docs
description: Clone FeastDocs, point it at your own repository, and publish.
sidebar_position: 7
---

# Use it for your own docs

FeastDocs is a template as much as a product: clone it, make the repository
yours, replace the content. Everything specific to a site lives in two places —
`feastdocs.config.mjs` and the `docs/` folder.

## 1. Make the repository yours

<fd-steps>
  <div step="Clone and detach">

```bash
git clone https://github.com/example-org/feastdocs my-docs
cd my-docs
```

Point the clone at your own repository (create an empty one on GitHub first):

```bash
git remote set-url origin https://github.com/your-org/my-docs.git
git push -u origin main
```

Prefer a clean history? Delete the `.git` folder and `git init` instead.

  </div>
  <div step="Install and run">

```bash
npm install
npm start
```

<http://localhost:4200> now serves the template's own documentation — which you
are reading. It doubles as your feature reference until you replace it.

  </div>
</fd-steps>

## 2. Configure the site

Everything is in [`feastdocs.config.mjs`](/reference/configuration):

```js title="feastdocs.config.mjs"
export default {
  title: 'My Product Docs',
  tagline: 'Everything about My Product.',

  theme: {
    defaultMode: 'dark',
    accent: '#2f6fdb',
    accentDark: '#6ba1f4',
  },

  // "Edit this page" links on every page:
  editUrl: 'https://github.com/your-org/my-docs/edit/main/docs/',

  // Web editing: lets the content manager commit to your repo:
  github: {
    repo: 'your-org/my-docs',
    branch: 'main',
  },
};
```

<fd-api-field name="github.repo" type="string" default="null">
  <code>owner/name</code> of your repository. Setting it enables the GitHub mode
  of the <a href="/reference/editor">content manager</a> — editing on the
  deployed site, committing as the signed-in GitHub user.
</fd-api-field>
<fd-api-field name="github.branch" type="string" default="main">
  Branch that web edits are committed to.
</fd-api-field>
<fd-api-field name="editUrl" type="string" default="null">
  Base URL for "Edit this page" links; the file's path inside <code>docs/</code>
  is appended.
</fd-api-field>

## 3. Replace the content

Delete the template's sections and write your own — every top-level folder in
`docs/` becomes a navbar tab ([Pages & sections](./pages.md)):

```text
docs/
├── index.md              your landing page
├── getting-started/
│   ├── _section.json     { "label": "Getting started", "position": 1 }
│   └── index.md
└── api/
    ├── _section.json     { "label": "API", "position": 2 }
    └── index.md
```

:::tip Keep one copy of the template docs
Before deleting, skim this Guide and Reference — or keep them around in a
`draft: true` state while your team learns the features.
:::

## 4. Deploy

`npm run build` produces plain static files in `dist/feastdocs/browser/` —
prerendered HTML per page, hashed assets, `sitemap.xml`, `robots.txt`. Any
static host serves them.

**One rule applies to every target:** requests that match no file must fall
back to `index.html`, because routing happens in the browser. Without it, deep
links work on first click and 404 on refresh. Every config below does that.

:::caution Full git history, everywhere
"Last updated by" is read from `git log` during the build. CI systems clone
shallowly by default, which blanks out most authors — pass `fetch-depth: 0`
(GitHub Actions) or `fetchDepth: 0` (Azure Pipelines), and keep `.git` in the
Docker build context.
:::

<fd-tabs>
  <div tab="Docker">

The repository ships a `Dockerfile` (multi-stage: Node builds, nginx serves)
and `deploy/nginx.conf`. Build and run:

```bash
docker build -t my-docs .
docker run -p 8080:80 my-docs
```

The site is on <http://localhost:8080>. This is the same image whether you run
it on your laptop, a Linux server, or a container platform — which makes it the
best choice for a company that already deploys front ends as containers.

To publish it:

```bash
docker tag my-docs registry.example.com/my-docs:1.0.0
docker push registry.example.com/my-docs:1.0.0
```

  </div>
  <div tab="Azure Pipelines">

`deploy/azure-pipelines.yml` is a working pipeline: it checks out with full
history, builds the Docker image and pushes it to a registry. Copy it to the
repository root as `azure-pipelines.yml`, then set two variables — the name of
your Docker Registry **service connection** and the image repository.

```yaml
variables:
  registryConnection: my-registry-connection
  imageRepository: feastdocs
```

The file also contains a commented **no-Docker** variant: build on the agent and
publish `dist/feastdocs/browser` as a pipeline artifact, for release stages that
copy files onto nginx or IIS directly.

:::tip Deploying the image
How the pushed image reaches your servers is your platform's business — Azure
Web App for Containers, AKS, or an SSH step running `docker pull && docker run`
all work, because the image is a self-contained static server.
:::

  </div>
  <div tab="nginx (Linux)">

No container needed: build, copy, reload.

```bash
npm ci
npm run build
sudo cp -r dist/feastdocs/browser/* /var/www/my-docs/
```

Use `deploy/nginx.conf` as the site config — point `root` at your directory:

```nginx
server {
  listen 80;
  server_name docs.example.com;
  root /var/www/my-docs;

  location / {
    try_files $uri $uri/index.html /index.html;
  }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The shipped config adds the parts worth having: a one-year immutable cache for
hashed assets, `no-cache` for HTML and the search index so a deploy is picked
up immediately, and gzip.

  </div>
  <div tab="Windows / IIS">

Windows Server hosts the same static output. Two steps beyond the copy:

<fd-steps>
  <div step="Install URL Rewrite">

IIS needs the [URL Rewrite module](https://www.iis.net/downloads/microsoft/url-rewrite)
to do the `index.html` fallback. Install it once per server.

  </div>
  <div step="Ship web.config with the files">

Copy `deploy/web.config` into the site root, next to `index.html`:

```powershell
npm ci
npm run build
Copy-Item deploy/web.config dist/feastdocs/browser/web.config
Copy-Item -Recurse -Force dist/feastdocs/browser/* C:/inetpub/my-docs/
```

It sets the rewrite rule, `index.html` as the default document, and the MIME
types IIS does not know by default (`.json`, `.woff2`, `.avif`).

  </div>
</fd-steps>

:::tip Just previewing on Windows?
You do not need IIS to look at a build. Any static server with SPA fallback
works — `npx serve -s dist/feastdocs/browser` is the shortest (`-s` does the
index.html fallback) — or run the Docker image, which needs nothing installed
but Docker Desktop.
:::

  </div>
  <div tab="Cloudflare Pages">

The repository's GitHub Actions workflow (`.github/workflows/ci.yml`) builds and
tests every push, and deploys to Cloudflare Pages on `main` once two repository
secrets exist (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → API tokens, with *Cloudflare Pages — Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages (right sidebar) |

Without the secrets the deploy job skips itself, so the workflow is safe to keep
even if you deploy elsewhere.

:::note SPA routing needs no configuration here
With no top-level `404.html` in the output, Cloudflare Pages serves
`index.html` for unmatched paths automatically.
:::

:::caution Prefer deploying from the workflow
Cloudflare's own Git-integration builder can clone shallowly, which blanks out
the "last updated by" authors. The workflow checks out with `fetch-depth: 0`.
:::

  </div>
</fd-tabs>

### Serving from a subpath

All of the above assume the docs sit at the root of a domain. To host them under
a path instead, build with a matching base href:

```bash
npx ng build --base-href /docs/
```

## 5. Optional: "Sign in with GitHub" for web editing

Web editing works out of the box with personal access tokens. For a real OAuth
login button, three steps (the exchange function already ships in `functions/`):

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps)
   with callback URL `https://your-site/_editor`.
2. Set `github.oauthClientId` in `feastdocs.config.mjs` to the app's client id.
3. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as **secrets** on the
   Cloudflare Pages project (Settings → Variables and secrets).

Editing rights are always the repository's collaborator permissions — GitHub
enforces them on every commit, whoever is signed in.

## 6. Choose how people edit

Both strategies work at the same time; see the
[content manager](/reference/editor) for the full picture:

| Strategy | Who it fits | How it commits |
| --- | --- | --- |
| **Git push** | People with a code editor and git | They edit `docs/`, commit, push — normal review flow |
| **Web editing** | People who live in the browser | The content manager commits to `github.repo` as their GitHub user |

Either way the history is git, so "last updated by" under every page stays
truthful — it is read from the commits at build time.
