---
title: Content manager
description: Create and edit pages with a live preview, inside the site itself.
sidebar_position: 5
---

# Content manager

The content manager lives at [`/_editor`](/_editor) — the pencil icon in the
navbar (optionally labelled, see
[`editor.invite`](/reference/configuration#editor)). It shows the `docs/` tree on the left, the file's source in the middle,
and a live Markdown preview on the right.

## What it can do

- **Browse as a folder tree** — collapsible folders (expansion is remembered),
  files listed by name, in **sidebar order** rather than alphabetically, so the
  tree mirrors what readers see. Typing in the filter flattens it to matches.
- **Reorder pages by dragging** them within their folder. The drop indicator
  shows where the page will land; releasing renumbers that folder's
  `sidebar_position` values in tens and writes them into front matter. Online
  the rewrites are _staged_, so a whole reshuffle commits once.
  A folder's own `index.md` stays pinned first and templates are not
  draggable.
- **Edit** any `.md`, `.html` or `.scss` file under `docs/`, with
  <kbd>Ctrl</kbd>+<kbd>S</kbd> to save (local) or stage (online)
- **Create** pages — type a path like `guide/deploying.md` and it is scaffolded
  with front matter, in the right section
- **New from template** — a dedicated button with a submenu of everything in
  `docs/_templates/`; `{{title}}` and `{{date}}` tokens are filled in from the
  new file's name and today's date. Plain **+ New** stays a one-click blank page
- **Delete** files — the ✕ on each file row (deletes immediately in local mode,
  stages the deletion online)
- **Batch commits** — online, every save, creation and deletion is _staged_
  (`M`/`A`/`D` badges in the file list, ↺ to undo one, click to diff it against
  the branch); the commit bar publishes **all staged changes as a single
  commit**, with an optional message
- **Insert helper** — two ways in: the “+ Insert” menu on the toolbar, and an
  inline **+** that appears beside the caret whenever it rests on an empty
  line (and stays out of the way while you type). Both drop admonitions, code
  blocks, tables, doc components (`<fd-tabs>`, `<fd-steps>`, `<fd-api-field>`,
  `<fd-counter>`) and inline extras at the cursor
- **Preview while typing** — the right pane re-renders on every keystroke
- **Jump to the real page** — the “View page” link opens the route the file
  publishes to
- **Choose a branch, undo a change** — pick the branch you are editing, read
  each pending change as a diff, and discard the ones you do not want, in every
  mode. See [source control](#source-control) and
  [committing online](#committing-and-pull-requests-online)

Saving writes the file to disk, which means the normal pipeline takes over: the
watcher re-renders the content, the dev server hot-reloads, and the change shows
up in the real site seconds later.

## Three backends, three strategies

The editor offers every backend that is reachable, and it picks the first one:

| Backend          | When                                                      | What Save does                                                                                                     |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Local**        | `npm start` is running (the file API on `127.0.0.1:4271`) | Writes the file to disk. Commit and push from the site itself, or from your own terminal — whichever you prefer    |
| **Azure DevOps** | `azureDevOps` and `entra` are both configured             | Stages the change; **Publish** pushes it and opens a pull request, **authored by the signed-in Entra user**        |
| **GitHub**       | `github.repo` is set in `feastdocs.config.mjs`            | Stages the change; **Commit** publishes everything staged as one commit, **authored by the connected GitHub user** |

Whenever more than one is available a switch appears above the file list — not
only when a dev server is up, so a deployed site with both hosts configured
reaches either. Without any of them, the page explains what to set up instead of
failing.

### Source control

**Source control** in the toolbar opens one panel that works in every mode. What
changes between them is where the answers come from, not what you can ask.

In local mode a save is a file on disk, so git sees it immediately and the panel
shows what git sees, split the way git splits it. It is the same repository your
terminal is looking at; `git status` and this panel never disagree.

Online there is no working copy — a save _is_ a staged change, held in the browser
until you commit — so there is a **Staged changes** group and nothing else to
stage. Everything around it is the same: which branch you are on, what is about to
be committed, what it changes, and how it becomes a pull request.

**Staged changes** and **Changes** list the files under `docs/`, each labelled the
way an author would say it (_edited_, _new_, _deleted_, _renamed_):

- **+ stages a file**, **− unstages it**, and **Stage all** / **Unstage all** do
  the group. Unstaging a newly added file leaves the file alone — it goes back to
  being untracked rather than disappearing.
- **Click a file** to read its `git diff`, coloured by line. It is the patch
  itself, so `+`/`-` are part of what you are reading.
- **✕ discards the change** — a tracked file is restored from `HEAD`. A file git
  has never seen has no version to go back to, so discarding it means deleting it,
  and that asks a second time before it happens. **Discard all** works the same
  way, and says how many new files it would delete.

Above the lists sits the branch: its name, whether it is the default branch, and
how far it has drifted from its upstream (`↑` yours, `↓` theirs) — or _not pushed_
when it has no upstream yet.

- **The picker** checks out an existing branch, tracking `origin/<name>` when it is
  not local yet. It refuses while `docs/` is modified, because git would either
  carry your changes across or stop half-way.
- **Create** cuts a new branch from the _remote_ default branch — so an author who
  has not pulled in a week still starts from what everyone else has — and carries
  the uncommitted work onto it.
- **Sync** fetches, and fast-forwards when that is all it takes. A branch that has
  moved on both sides needs a merge or a rebase, and the panel deliberately will
  not choose one for you: it fetches, says so, and stops.
- **Commit staged** / **Commit all** commit without pushing; **Push** sets the
  upstream the first time and links a pre-filled pull request afterwards (GitHub
  and Azure DevOps remotes are both recognised).
- **Undo last commit** puts it back into staging with its message, so the message
  can be fixed and reused. It refuses once the commit is on the remote — undoing
  that would rewrite history other people already have.

**Publish** is still there next to it, and it is still the shortcut most edits
want: branch from an up-to-date default branch, commit, push, open the pull
request, in one press. The panel is for the edits that do not fit the shortcut.

:::note Only ever the docs folder
Every operation is confined to `docs/` and rejects paths that try to leave it. The
working tree may hold unrelated work, and a source-control panel inside a
documentation site has no business staging, committing or discarding it.

`npm run verify:git` checks all of it — the confinement, the staged/unstaged
split, push, sync, and the refusal to undo a pushed commit — against a throwaway
repository with a real remote.
:::

### Signing in with Microsoft Entra ID

Set [`entra`](/reference/configuration#entra) and
[`azureDevOps`](/reference/configuration#azuredevops) and the editor offers
Microsoft sign-in. The person at the keyboard gets a card, signs in, and lands
back in the editor.

What makes this worth the setup is attribution: the browser calls the Azure
DevOps REST API with **that person's own token**, so the commit carries their
name and the site holds no shared credential. Two scopes are requested at
different times — signing in asks only for identity, and repository access is
requested when something is about to be published, so a reader who never edits
is never asked to consent to it.

There is no backend to deploy. Azure DevOps answers a CORS preflight with
`Access-Control-Allow-Origin: *` and permits the `authorization` header, so the
page talks to it directly. Nothing here is secret: a public client has no secret
to keep, which is why both configuration values are safe to commit.

:::caution Register the editor route, not the origin
The redirect URI must be `<origin>/_editor`. MSAL only completes a sign-in on a
page that initialises it, and the editor is lazy-loaded so that MSAL stays out of
every reader's first download — returning to `/` would leave the sign-in
half-done.
:::

### Committing and pull requests, online

The branch you are editing decides what committing does:

- On the **default branch**, publishing cuts a new branch and opens a pull
  request. Protected default branches are the norm, so this is the only route
  that works everywhere — and it is why the panel asks for a branch name only
  here.
- On **any other branch**, the commit is added to that branch, which is how a
  review comment gets addressed without opening a second pull request for the
  same work. If a request is already open for it, the panel links it.

Each staged change can be read before it is sent: clicking it diffs the staged
version against the branch, hunk by hunk. ↺ discards one and puts the branch's
version back.

The two hosts divide the work differently, and the panel follows rather than
pretending otherwise. Azure DevOps models a push as a ref update plus commits, so
branch, commit, push and pull request happen in one call — one button. GitHub
commits to a branch and stops, so **Open a pull request** is a separate step,
offered once you are on a branch that is not the default.

:::note Undo is local-only
Every commit the panel lists in an online mode is already on the remote — that is
where it was read from. Taking one back would rewrite history other people have,
so **Undo last commit** appears only in local mode, where a commit can still be
private.
:::

### Connecting GitHub

Two ways in, on the same connect screen:

- **Sign in with GitHub** — a real OAuth login. It appears once
  `github.oauthClientId` is set; the code-for-token exchange runs in a
  Cloudflare Pages Function shipped with the project (`functions/api/oauth/token.js`),
  so the OAuth client secret never touches the static bundle.
- **Personal access token** — always available as a fallback: a fine-grained
  token with _contents read and write_ on the docs repository. Either way the
  token stays in the browser's localStorage and is sent only to `api.github.com`.

To enable the sign-in button:

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
   Homepage URL: your site. **Authorization callback URL:**
   `https://your-site/_editor`.
2. Put the app's **Client ID** in `feastdocs.config.mjs` as
   `github.oauthClientId` (client ids are public).
3. On the Cloudflare Pages project (Settings → Variables and secrets), add two
   **secrets**: `GITHUB_CLIENT_ID` (same value) and `GITHUB_CLIENT_SECRET`
   (the app's secret — it lives only there).

:::caution Access is still the repository's
Signing in proves who the visitor is; **what they may do is decided by GitHub**.
Every write is rejected server-side by GitHub regardless of what the UI allows.
:::

### Sandbox mode for everyone else

Signing in and having write access are separate things, and that is useful: a
visitor with a GitHub account but no push rights gets the whole editor in
**sandbox mode** — browse the tree, open any page, type, watch the live
preview, try the components — with Stage, Commit, Create and Delete disabled.
Their edits live in the browser tab and never go anywhere.

That makes the editor a safe place to explore for people you have not given
repository access to, while your collaborator list stays the only thing that
decides who can publish. Grant someone write access on GitHub and the same
screen becomes fully functional, no deploy needed.

The scope requested at sign-in is `github.oauthScope`. For a public docs
repository `public_repo` is enough to commit and keeps the consent screen
modest — worth doing if you invite people to sign in just to look. A private
repository needs `repo`.

### Production never touches local files

The local file API is probed only in development builds. On a deployed site only
the online backends exist — a visitor's own `npm start` on their machine is
invisible to it, so "saving" can never silently land on someone's local disk.

### Concurrent editing and conflicts

Several people can edit at the same time; what happens depends on the path:

- **Git pushes** conflict the way git always has — the second push is rejected
  and the author merges locally. Nothing new to learn.
- **Web commits are checked before they publish.** The editor remembers each
  file's blob SHA from when you read it. At commit time it compares every
  staged file against the branch as it is _now_ — if someone changed (or
  created, or deleted) one of your files in the meantime, the commit is
  blocked and a panel lists each conflicted file with three choices:
  **Merge…** opens a hunk-by-hunk resolver — both versions diffed line by
  line, each conflicting hunk resolved as _theirs_, _mine_ or _both_, with
  shared lines shown as context; **Use theirs** drops your staged change and
  loads their version; **Keep mine** explicitly overwrites theirs. Nothing is
  ever overwritten silently.
- **The final ref update is atomic and self-healing.** If the branch moves in
  the instant between the check and the write, GitHub rejects the commit
  (nothing half-written) and the editor automatically re-checks against the
  new head and retries — up to three times before asking you to try again.
  Staged deletions of files someone else already deleted are recognised as
  no-ops rather than failing the commit.

### Author attribution

Every page's footer shows **when it last changed and by whom**. That comes from
`git log` at build time — not from the editor — so it is correct for both
strategies: a web commit and a pushed commit look identical in history. After a
web edit, the deployed site shows the new author once CI rebuilds.

:::note The preview is an approximation
The live preview renders admonitions, tables, task lists and attributes exactly
like the real build — including the built-in `{.lead}` and `{.callout}` utility
classes. What it does not do: syntax-highlight code blocks, rewrite relative
links, or apply **page-scoped SCSS** (classes from a sibling `.scss` file only
style the real page). The saved page — rendered by the actual pipeline — is
always the source of truth, one hot-reload away.
:::

## Working with a repository

The content manager writes **plain files into `docs/`** on your machine — nothing
else. Git sees those files like any other change:

<fd-steps>
  <div step="Write">

Create and edit pages in the content manager (or any editor). Every save lands in
`docs/` as an ordinary file change — `git status` shows it immediately.

  </div>
  <div step="Review">

```bash
git add docs/
git commit -m "docs: add deployment guide"
```

Docs changes diff and review like code, because they are code. Open a pull
request if your team reviews content.

  </div>
  <div step="Push and build">

```bash
git push
```

CI (or you) runs `npm run build`; the static output in `dist/feastdocs/browser/`
is what gets deployed. Generated files (`src/app/generated/`, `public/docs-assets/`)
are git-ignored — they are rebuilt from `docs/` every time, so they never need
committing.

  </div>
</fd-steps>

:::info Nothing writes in production
The deployed site is static and the file API only exists on `127.0.0.1` during
`npm start`. Publishing a change always goes through the repository — which is
the point.
:::

## Why files, still

The content manager is a convenience layer, not a CMS. Files stay the source of
truth: they diff, review and version like the rest of the repository, and
everything the editor does can also be done in any text editor.

## Templates

`docs/_templates/` is one flat folder of starter pages. Anything in it shows up
in the "From template" submenu next to the + New button, and — because underscore paths never
publish — templates are versioned with the repo and editable right here in the
editor, without ever appearing on the site.

Two tokens are substituted at creation time:

| Token       | Becomes                                                           |
| ----------- | ----------------------------------------------------------------- |
| `{{title}}` | The new file's name, humanised (`release-2-1.md` → "Release 2 1") |
| `{{date}}`  | Today's date, `YYYY-MM-DD`                                        |

Every created page — blank or templated — is guaranteed to start with the
`title` / `description` / `sidebar_position` front matter, so nothing shippable
is ever missing it.

The project ships four starters — guide page, tutorial (with `<fd-steps>`), API
reference (with `<fd-api-field>`), and release notes. Add your own by dropping a
file in the folder, or by creating one in the editor at `_templates/name.md`.
