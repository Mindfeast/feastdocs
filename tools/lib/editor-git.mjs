import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from './config.mjs';

const execFileAsync = promisify(execFile);

/**
 * Git operations for the content manager, so an author can publish an edit
 * without leaving the browser.
 *
 * `main` is pull-request protected on Azure DevOps, so committing where the
 * author happens to be standing is not an option: every edit has to land on a
 * fresh branch taken from an up-to-date `main`, be pushed, and become a pull
 * request. That is what `publish()` does, in one step, because doing it in four
 * is how people end up committing to the wrong branch.
 *
 * Everything here runs in the dev process, on loopback, as the person at the
 * keyboard — so commits carry their own identity and pushes use their own
 * credentials. No service account, no token stored anywhere.
 */

/** Nothing in the dev server may hang; a stuck git call would freeze the editor. */
const GIT_TIMEOUT = 30_000;

/**
 * Credential prompts are disabled deliberately. A push that needs interactive
 * input would otherwise block forever with no output — failing fast with the
 * stderr is far more useful than a spinner that never stops.
 */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
};

/**
 * `raw` keeps leading whitespace. Porcelain status is column-positional and its
 * first column is often a space, so trimming the output moves a working-tree flag
 * into the index column — which reads as "already staged" for the first file in
 * the list and nowhere else. Everything that parses columns asks for raw.
 */
async function git(args, { timeout = GIT_TIMEOUT, raw = false } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', ROOT, ...args], {
    timeout,
    env: GIT_ENV,
    maxBuffer: 10_000_000,
  });
  return raw ? stdout.replace(/\s+$/, '') : stdout.trim();
}

async function gitQuiet(args, options) {
  try {
    return { ok: true, out: await git(args, options) };
  } catch (error) {
    return { ok: false, out: '', error: (error.stderr || error.message || '').trim() };
  }
}

/**
 * A branch name that git will accept and that cannot be mistaken for a flag.
 * Args go to execFile as an array so there is no shell to inject into, but git
 * has its own rules and a leading `-` would still be read as an option.
 */
export function validateBranchName(name) {
  const value = String(name ?? '').trim();
  if (value === '') return { ok: false, error: 'Branch name is required.' };
  if (value.length > 200) return { ok: false, error: 'Branch name is too long.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) {
    return {
      ok: false,
      error:
        'Use letters, numbers, dots, dashes, underscores and slashes; start with a letter or number.',
    };
  }
  if (
    value.includes('..') ||
    value.includes('//') ||
    value.endsWith('/') ||
    value.endsWith('.lock')
  ) {
    return { ok: false, error: `"${value}" is not a valid git branch name.` };
  }
  return { ok: true, value };
}

/**
 * Turns the `origin` remote into a URL that opens a pre-filled pull request.
 *
 * Host-specific, because there is no common form: GitHub compares two refs in a
 * path, Azure DevOps takes them as query parameters. An unrecognised host returns
 * null and the caller simply omits the link — the push still happened, and the
 * branch is findable by hand.
 */
export function pullRequestUrl(remote, branch, target) {
  if (!remote) return null;
  const clean = remote.replace(/\.git$/, '').replace(/\/+$/, '');

  // GitHub, both remote spellings: `https://github.com/<owner>/<repo>` and
  // `git@github.com:<owner>/<repo>`.
  const github = clean.match(/^(?:https?:\/\/[^/]*github\.com\/|git@github\.com:)(.+)$/i);
  if (github) {
    // Refs go in the path here, and the only character encodeURIComponent would
    // touch in a name validateBranchName accepts is `/` — which GitHub needs
    // literal. Encoding it gives a 404.
    return `https://github.com/${github[1]}/compare/${target}...${branch}?expand=1`;
  }

  // Azure DevOps, both shapes: on-prem
  // `https://host/tfs/<collection>/<project>/_git/<repo>` and Services
  // `https://dev.azure.com/<org>/<project>/_git/<repo>`.
  if (/\/_git\/[^/]+$/.test(clean)) {
    const query = `sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(target)}`;
    return `${clean}/pullrequestcreate?${query}`;
  }

  return null;
}

/** Default branch of `origin`, falling back to main/master as they exist. */
async function defaultBranch() {
  const head = await gitQuiet(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (head.ok && head.out) return head.out.replace('refs/remotes/origin/', '');
  for (const candidate of ['main', 'master']) {
    const found = await gitQuiet([
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/remotes/origin/${candidate}`,
    ]);
    if (found.ok && found.out) return candidate;
  }
  const local = await gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']);
  return local.ok ? local.out : 'main';
}

/** Initials of the configured committer, for the branch-name suggestion. */
async function authorInitials() {
  const name = await gitQuiet(['config', 'user.name']);
  if (!name.ok || !name.out) return 'me';
  const initials = name.out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toLowerCase();
  return /^[a-z0-9]+$/.test(initials) && initials.length > 0 ? initials : 'me';
}

/**
 * Files changed under the docs folder, staged or not, including new ones.
 *
 * Porcelain v1 is column-positional: X is the index, Y the working tree. This
 * used to trim the pair together, which reads fine and quietly loses which side
 * a change is on — and that difference *is* the staged/unstaged distinction a
 * source-control panel is built on.
 */
async function changedDocs(docsPrefix) {
  const out = await gitQuiet(['status', '--porcelain', '--untracked-files=all', '--', docsPrefix], {
    raw: true,
  });
  if (!out.ok) return [];
  return out.out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const index = line[0] ?? ' ';
      const worktree = line[1] ?? ' ';
      // Renames read as `old -> new`; the new path is the one to act on.
      const file = line.slice(2).trim().split(' -> ').pop().replace(/^"|"$/g, '');
      const untracked = index === '?';
      return {
        index,
        worktree,
        status: (index + worktree).trim(),
        file,
        staged: !untracked && index !== ' ',
        unstaged: untracked || worktree !== ' ',
      };
    });
}

/**
 * How far the branch has drifted from its upstream — the ↑/↓ counters.
 *
 * `--left-right --count upstream...HEAD` prints the two exclusive counts in that
 * order, so the left number is what the remote has and this branch does not.
 */
async function aheadBehind() {
  const upstream = await gitQuiet([
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  if (!upstream.ok || !upstream.out) return { upstream: null, ahead: 0, behind: 0 };
  const counts = await gitQuiet(['rev-list', '--left-right', '--count', `${upstream.out}...HEAD`]);
  if (!counts.ok) return { upstream: upstream.out, ahead: 0, behind: 0 };
  const [behind, ahead] = counts.out.split(/\s+/).map((value) => Number(value) || 0);
  return { upstream: upstream.out, ahead, behind };
}

/** Confines a file operation to the docs folder, the way the file API does. */
function docsRelative(docsPrefix, file) {
  const relative = String(file ?? '').replace(/\\/g, '/');
  if (relative === '' || relative.includes('..')) return { ok: false, error: 'Invalid path.' };
  if (!relative.startsWith(`${docsPrefix}/`)) {
    return { ok: false, error: `Only files under ${docsPrefix} can be changed.` };
  }
  return { ok: true, value: relative };
}

export async function status({ docsRoot }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const inside = await gitQuiet(['rev-parse', '--is-inside-work-tree']);
  // Two very different things answer false here: a folder that is not a
  // repository, and a git that could not be run at all. The caller only needs to
  // know there is nothing to show, but whoever is debugging needs the reason.
  if (!inside.ok) return { git: false, reason: inside.error || 'git could not be run' };

  const [branch, remote, target] = await Promise.all([
    gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => (r.ok ? r.out : null)),
    gitQuiet(['remote', 'get-url', 'origin']).then((r) => (r.ok ? r.out : null)),
    defaultBranch(),
  ]);
  const changed = await changedDocs(docsPrefix);
  const initials = await authorInitials();
  const distance = await aheadBehind();

  return {
    git: true,
    branch,
    defaultBranch: target,
    // Publishing straight onto the protected branch is what this exists to avoid.
    onDefaultBranch: branch === target,
    remote,
    hasRemote: remote !== null,
    changed,
    stagedCount: changed.filter((entry) => entry.staged).length,
    unstagedCount: changed.filter((entry) => entry.unstaged).length,
    ...distance,
    suggestedBranch: `docs/${initials}/`,
  };
}

/**
 * Branch from an up-to-date default branch, commit the docs changes, push, and
 * hand back the URL that opens the pull request.
 *
 * Ordered so that nothing is committed until the new branch exists: if the fetch
 * or the branch creation fails, the working tree is untouched and the author can
 * retry without having to undo anything.
 */
export async function publish({ docsRoot, branch, message, push = true }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';

  const valid = validateBranchName(branch);
  if (!valid.ok) return { ok: false, error: valid.error };
  const name = valid.value;

  const text = String(message ?? '').trim();
  if (text === '') return { ok: false, error: 'A commit message is required.' };

  const target = await defaultBranch();
  if (name === target) {
    return {
      ok: false,
      error: `${target} is pull-request protected — publish to a new branch instead.`,
    };
  }

  const changed = await changedDocs(docsPrefix);
  if (changed.length === 0)
    return { ok: false, error: 'Nothing to publish: no changes under the docs folder.' };

  const exists = await gitQuiet(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
  if (exists.ok && exists.out) {
    return { ok: false, error: `Branch "${name}" already exists locally. Pick another name.` };
  }

  const steps = [];
  const remote = await gitQuiet(['remote', 'get-url', 'origin']).then((r) => (r.ok ? r.out : null));

  // Take the branch from the *remote* default branch, so an author who has not
  // pulled in a week still branches from current main.
  let base = `refs/remotes/origin/${target}`;
  if (remote) {
    const fetched = await gitQuiet(['fetch', 'origin', target, '--quiet'], { timeout: 60_000 });
    steps.push({
      step: 'fetch',
      ok: fetched.ok,
      detail: fetched.ok ? `origin/${target}` : fetched.error,
    });
    if (!fetched.ok) base = 'HEAD';
  } else {
    steps.push({ step: 'fetch', ok: false, detail: 'no origin configured — branching from HEAD' });
    base = 'HEAD';
  }

  const baseExists = await gitQuiet(['rev-parse', '--verify', '--quiet', base]);
  if (!baseExists.ok || !baseExists.out) base = 'HEAD';

  // `switch -c` carries the uncommitted edits onto the new branch, which is
  // exactly what is wanted here — the author's work moves with them.
  const switched = await gitQuiet(['switch', '--create', name, base]);
  if (!switched.ok) {
    return {
      ok: false,
      error: `Could not branch from ${base}: ${switched.error}`,
      hint: 'Usually this means your edits conflict with what has landed on the default branch. Pull, resolve, then publish again.',
      steps,
    };
  }
  // Branching from origin/<default> would otherwise leave that as the upstream;
  // the push below sets the right one, and if the push fails the branch is left
  // with none rather than pointed at the default branch.
  await gitQuiet(['branch', '--unset-upstream']);
  steps.push({
    step: 'branch',
    ok: true,
    detail: `${name} from ${base.replace('refs/remotes/', '')}`,
  });

  // Only the docs folder, never `-A`: the working tree may hold unrelated work.
  const added = await gitQuiet(['add', '--', docsPrefix]);
  if (!added.ok)
    return { ok: false, error: `Could not stage the changes: ${added.error}`, branch: name, steps };
  steps.push({ step: 'stage', ok: true, detail: `${changed.length} file(s) under ${docsPrefix}` });

  const committed = await gitQuiet(['commit', '--message', text, '--', docsPrefix]);
  if (!committed.ok) {
    return { ok: false, error: `Commit failed: ${committed.error}`, branch: name, steps };
  }
  const sha = await gitQuiet(['rev-parse', '--short', 'HEAD']).then((r) => (r.ok ? r.out : null));
  steps.push({ step: 'commit', ok: true, detail: sha });

  if (!push || !remote) {
    return {
      ok: true,
      branch: name,
      commit: sha,
      pushed: false,
      pullRequestUrl: null,
      steps,
      note: remote
        ? 'Committed locally; not pushed.'
        : 'Committed locally. No origin is configured, so nothing was pushed.',
    };
  }

  const pushed = await gitQuiet(['push', '--set-upstream', 'origin', name], { timeout: 120_000 });
  steps.push({ step: 'push', ok: pushed.ok, detail: pushed.ok ? `origin/${name}` : pushed.error });
  if (!pushed.ok) {
    return {
      ok: true,
      branch: name,
      commit: sha,
      pushed: false,
      pullRequestUrl: null,
      steps,
      note: `The commit is on ${name} locally, but the push failed: ${pushed.error}`,
    };
  }

  return {
    ok: true,
    branch: name,
    commit: sha,
    pushed: true,
    pullRequestUrl: pullRequestUrl(remote, name, target),
    steps,
  };
}

/**
 * Throws away a saved change, the way "Discard Changes" does in an editor.
 *
 * A tracked file is restored from HEAD. An untracked one has no version to go
 * back to, so discarding means deleting it — which is why the caller has to say
 * so explicitly rather than have a delete happen behind a word like "revert".
 */
export async function discard({ docsRoot, file, allowDelete = false }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const relative = String(file ?? '').replace(/\\/g, '/');
  if (relative === '' || relative.includes('..')) {
    return { ok: false, error: 'Invalid path.' };
  }
  if (!relative.startsWith(`${docsPrefix}/`)) {
    return { ok: false, error: `Only files under ${docsPrefix} can be discarded.` };
  }

  const tracked = await gitQuiet(['ls-files', '--error-unmatch', '--', relative]);
  if (tracked.ok && tracked.out) {
    const restored = await gitQuiet(['checkout', 'HEAD', '--', relative]);
    if (!restored.ok) return { ok: false, error: restored.error };
    return { ok: true, file: relative, action: 'restored' };
  }

  if (!allowDelete) {
    return {
      ok: false,
      error: `${relative} is new — discarding it deletes the file.`,
      needsDelete: true,
    };
  }
  const removed = await gitQuiet(['clean', '--force', '--', relative]);
  if (!removed.ok) return { ok: false, error: removed.error };
  return { ok: true, file: relative, action: 'deleted' };
}

/** Diff of one file against HEAD, so a change can be read before it is published. */
export async function diff({ docsRoot, file }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const relative = String(file ?? '').replace(/\\/g, '/');
  if (!relative.startsWith(`${docsPrefix}/`) || relative.includes('..')) {
    return { ok: false, error: 'Invalid path.' };
  }
  const tracked = await gitQuiet(['ls-files', '--error-unmatch', '--', relative]);
  // A new file has nothing to diff against; the whole thing is the change.
  const args =
    tracked.ok && tracked.out
      ? ['diff', '--no-color', 'HEAD', '--', relative]
      : ['diff', '--no-color', '--no-index', '/dev/null', relative];
  const result = await gitQuiet(args);
  return { ok: true, file: relative, patch: result.out, untracked: !(tracked.ok && tracked.out) };
}

/**
 * Checks out an existing branch, so an edit can be added to a branch that
 * already has a pull request open.
 *
 * Refuses while anything under the docs folder is modified: git would either
 * carry the changes across or refuse mid-way, and neither is something to
 * discover after the fact.
 */
export async function switchBranch({ docsRoot, branch }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const valid = validateBranchName(branch);
  if (!valid.ok) return { ok: false, error: valid.error };

  const dirty = await changedDocs(docsPrefix);
  if (dirty.length > 0) {
    return {
      ok: false,
      error: `${dirty.length} file(s) under ${docsPrefix} have changes. Publish or discard them first.`,
    };
  }

  const local = await gitQuiet(['rev-parse', '--verify', '--quiet', `refs/heads/${valid.value}`]);
  if (local.ok && local.out) {
    const switched = await gitQuiet(['switch', valid.value]);
    return switched.ok ? { ok: true, branch: valid.value } : { ok: false, error: switched.error };
  }

  // Not local yet: track the remote one, which is the usual case for a branch
  // somebody else pushed.
  const fetched = await gitQuiet(['fetch', 'origin', valid.value, '--quiet'], { timeout: 60_000 });
  const created = await gitQuiet([
    'switch',
    '--create',
    valid.value,
    '--track',
    `origin/${valid.value}`,
  ]);
  if (!created.ok) {
    return {
      ok: false,
      error: fetched.ok ? created.error : `${created.error} (fetch also failed: ${fetched.error})`,
    };
  }
  return { ok: true, branch: valid.value, tracked: true };
}

/** Local and remote branches, for the picker. */
export async function listBranches() {
  const result = await gitQuiet([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads',
    'refs/remotes/origin',
  ]);
  if (!result.ok) return [];
  const names = new Set();
  for (const line of result.out.split('\n')) {
    const name = line.trim().replace(/^origin\//, '');
    if (name && name !== 'HEAD') names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* ---- source control: the operations a version-control panel offers -------
 *
 * `publish()` above is the one-step route: branch, commit, push, pull request.
 * These are the same steps taken one at a time, for when the shape of the work
 * does not match the shortcut — staging half of what changed, adding a commit to
 * a branch that already has a pull request open, pushing later. Everything is
 * confined to the docs folder: the working tree may hold unrelated work, and a
 * source-control panel inside a documentation site has no business touching it.
 */

/** Resolves a list of file arguments, refusing anything outside the docs folder. */
function docsPaths(docsPrefix, files) {
  const list = (Array.isArray(files) ? files : [files]).filter(
    (entry) => entry !== undefined && entry !== null,
  );
  if (list.length === 0) return { ok: false, error: 'No files given.' };
  const paths = [];
  for (const file of list) {
    const resolved = docsRelative(docsPrefix, file);
    if (!resolved.ok) return resolved;
    paths.push(resolved.value);
  }
  return { ok: true, value: paths };
}

/** Stages files — the + on a row. */
export async function stage({ docsRoot, files }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const resolved = docsPaths(docsPrefix, files);
  if (!resolved.ok) return resolved;
  const added = await gitQuiet(['add', '--', ...resolved.value]);
  return added.ok ? { ok: true, files: resolved.value } : { ok: false, error: added.error };
}

/**
 * Unstages files — the − on a row.
 *
 * `restore --staged` leaves the file itself alone, so a newly added file goes back
 * to being untracked rather than disappearing.
 */
export async function unstage({ docsRoot, files }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const resolved = docsPaths(docsPrefix, files);
  if (!resolved.ok) return resolved;
  const restored = await gitQuiet(['restore', '--staged', '--', ...resolved.value]);
  return restored.ok ? { ok: true, files: resolved.value } : { ok: false, error: restored.error };
}

/**
 * Throws away every change under the docs folder.
 *
 * New files have no version to go back to, so they can only be deleted. Rather
 * than half-do the job, this reports what deleting would cost and waits to be
 * told — the same contract as discarding a single file.
 */
export async function discardAll({ docsRoot, allowDelete = false }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const changed = await changedDocs(docsPrefix);
  if (changed.length === 0) return { ok: true, restored: 0, deleted: 0 };

  const untracked = changed.filter((entry) => entry.index === '?');
  if (untracked.length > 0 && !allowDelete) {
    return {
      ok: false,
      needsDelete: true,
      error: `${untracked.length} of these are new files — discarding them deletes them.`,
      files: untracked.map((entry) => entry.file),
    };
  }

  // Unstage first: `checkout HEAD` restores the working tree but leaves a staged
  // deletion staged, which would show as a change that refuses to go away.
  await gitQuiet(['restore', '--staged', '--', docsPrefix]);
  const tracked = changed.filter((entry) => entry.index !== '?');
  if (tracked.length > 0) {
    const restored = await gitQuiet(['checkout', 'HEAD', '--', docsPrefix]);
    if (!restored.ok) return { ok: false, error: restored.error };
  }
  if (untracked.length > 0) {
    const cleaned = await gitQuiet(['clean', '--force', '--', docsPrefix]);
    if (!cleaned.ok) return { ok: false, error: cleaned.error };
  }
  return { ok: true, restored: tracked.length, deleted: untracked.length };
}

/**
 * Commits what is staged, without pushing.
 *
 * Committing onto a protected branch is legal locally and only fails at the push,
 * which is a confusing place to find out — so this says so up front and commits
 * anyway. Whether the branch really is protected is the host's business, not a
 * guess worth blocking on.
 */
export async function commit({ docsRoot, message, stageAll = false }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const text = String(message ?? '').trim();
  if (text === '') return { ok: false, error: 'A commit message is required.' };

  if (stageAll) {
    const added = await gitQuiet(['add', '--', docsPrefix]);
    if (!added.ok) return { ok: false, error: `Could not stage the changes: ${added.error}` };
  }

  const staged = await gitQuiet(['diff', '--cached', '--name-only', '--', docsPrefix]);
  if (!staged.ok || staged.out === '') {
    return { ok: false, error: 'Nothing is staged. Stage a change first, or use Stage all.' };
  }

  const committed = await gitQuiet(['commit', '--message', text, '--', docsPrefix]);
  if (!committed.ok) return { ok: false, error: `Commit failed: ${committed.error}` };

  const [sha, branch, target] = await Promise.all([
    gitQuiet(['rev-parse', '--short', 'HEAD']).then((r) => (r.ok ? r.out : null)),
    gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => (r.ok ? r.out : null)),
    defaultBranch(),
  ]);
  return {
    ok: true,
    commit: sha,
    branch,
    files: staged.out.split('\n').filter(Boolean).length,
    warning:
      branch === target
        ? `This commit is on ${target}. If that branch is pull-request protected, the push will be rejected — branch first.`
        : null,
  };
}

/** Pushes the current branch, setting the upstream the first time. */
export async function push() {
  const branch = await gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok || branch.out === 'HEAD') {
    return { ok: false, error: 'Not on a branch — nothing to push.' };
  }
  const remote = await gitQuiet(['remote', 'get-url', 'origin']).then((r) => (r.ok ? r.out : null));
  if (!remote) {
    return { ok: false, error: 'No origin is configured, so there is nowhere to push.' };
  }

  const upstream = await gitQuiet([
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const args =
    upstream.ok && upstream.out
      ? ['push', 'origin', branch.out]
      : ['push', '--set-upstream', 'origin', branch.out];
  const pushed = await gitQuiet(args, { timeout: 120_000 });
  if (!pushed.ok) return { ok: false, error: pushed.error };

  const target = await defaultBranch();
  return {
    ok: true,
    branch: branch.out,
    pullRequestUrl: branch.out === target ? null : pullRequestUrl(remote, branch.out, target),
  };
}

/**
 * Fetches, and fast-forwards when that is all it takes.
 *
 * A branch that has moved both locally and on the remote needs a merge or a
 * rebase, and choosing between them from a documentation site would be a decision
 * made in the wrong place. Diverged means: fetched, reported, stopped.
 */
export async function sync() {
  const remote = await gitQuiet(['remote', 'get-url', 'origin']).then((r) => (r.ok ? r.out : null));
  if (!remote) {
    return { ok: false, error: 'No origin is configured, so there is nothing to sync.' };
  }

  const fetched = await gitQuiet(['fetch', 'origin', '--prune', '--quiet'], { timeout: 120_000 });
  if (!fetched.ok) return { ok: false, error: fetched.error };

  const before = await aheadBehind();
  if (before.upstream === null) {
    return {
      ok: true,
      fetched: true,
      pulled: false,
      ...before,
      note: 'This branch has no upstream yet — push it to create one.',
    };
  }
  if (before.behind === 0) return { ok: true, fetched: true, pulled: false, ...before };
  if (before.ahead > 0) {
    return {
      ok: true,
      fetched: true,
      pulled: false,
      ...before,
      note: `This branch and ${before.upstream} have both moved. Merge or rebase from your terminal — that choice should not be made for you.`,
    };
  }

  const pulled = await gitQuiet(['merge', '--ff-only', before.upstream], { timeout: 120_000 });
  if (!pulled.ok) return { ok: false, error: pulled.error, fetched: true, ...before };
  return { ok: true, fetched: true, pulled: true, ...(await aheadBehind()) };
}

/**
 * Creates a branch and moves onto it, carrying the uncommitted work along.
 *
 * Taken from the *remote* default branch, so an author who has not pulled in a
 * week still starts from what everyone else has.
 */
export async function createBranch({ branch, fromDefault = true }) {
  const valid = validateBranchName(branch);
  if (!valid.ok) return { ok: false, error: valid.error };
  const name = valid.value;

  const exists = await gitQuiet(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
  if (exists.ok && exists.out) {
    return { ok: false, error: `Branch "${name}" already exists. Switch to it instead.` };
  }

  let base = 'HEAD';
  if (fromDefault) {
    const target = await defaultBranch();
    await gitQuiet(['fetch', 'origin', target, '--quiet'], { timeout: 60_000 });
    const remoteRef = `refs/remotes/origin/${target}`;
    const found = await gitQuiet(['rev-parse', '--verify', '--quiet', remoteRef]);
    if (found.ok && found.out) base = remoteRef;
  }

  const created = await gitQuiet(['switch', '--create', name, base]);
  if (!created.ok) return { ok: false, error: created.error };
  // Branching from a remote-tracking ref makes git adopt it as the upstream, so a
  // fresh feature branch would read as one commit ahead of origin/main and stay
  // that way after being pushed — and a fast-forward sync would pull main into
  // it. A new branch has no upstream until it is pushed, which is the truth.
  // (`switch -c --no-track` is not valid syntax; this is the way to say it.)
  await gitQuiet(['branch', '--unset-upstream']);
  return { ok: true, branch: name, base: base.replace('refs/remotes/', '') };
}

/**
 * Recent commits, newest first, each marked as pushed or not.
 *
 * `ahead` counts the commits the upstream has not seen and they are the newest
 * ones, so the first `ahead` entries are the unpushed ones — no need to ask git
 * about each commit separately.
 *
 * A branch that has never been pushed has no upstream, and `ahead` is 0 there,
 * which would mark every commit as pushed — the opposite of the truth. So the
 * comparison falls back to the remote default branch: what this branch has and
 * the default branch does not is precisely what nobody else can see yet.
 */
export async function log({ limit = 12 } = {}) {
  // Git writes the separator itself, so no field can contain the delimiter.
  const UNIT = String.fromCharCode(31);
  const result = await gitQuiet([
    'log',
    `--max-count=${Math.min(Math.max(Number(limit) || 12, 1), 50)}`,
    '--format=%h%x1f%s%x1f%an%x1f%cI',
  ]);
  if (!result.ok || result.out === '') return { ok: true, commits: [] };
  const lines = result.out.split('\n');
  const { upstream, ahead } = await aheadBehind();
  let unpushed = ahead;
  if (upstream === null) {
    const target = await defaultBranch();
    const counted = await gitQuiet(['rev-list', '--count', `refs/remotes/origin/${target}..HEAD`]);
    unpushed = counted.ok && counted.out !== '' ? Number(counted.out) || 0 : lines.length;
  }
  const commits = lines.map((line, position) => {
    const [sha, subject, author, date] = line.split(UNIT);
    return { sha, subject, author, date, pushed: position >= unpushed };
  });
  return { ok: true, commits };
}

/**
 * Puts the last commit back into the staging area, message and all.
 *
 * Only ever a local commit: rewriting one the remote already has would ask
 * everyone else to rewrite too, and a documentation editor is not the place to
 * start that.
 */
export async function undoLastCommit() {
  const parent = await gitQuiet(['rev-parse', '--verify', '--quiet', 'HEAD~1']);
  if (!parent.ok || !parent.out) {
    return { ok: false, error: 'There is only one commit — nothing to undo.' };
  }
  const { upstream, ahead } = await aheadBehind();
  if (upstream !== null && ahead === 0) {
    return {
      ok: false,
      error: `The last commit is already on ${upstream}. Undoing it would rewrite history that everyone else has.`,
    };
  }
  const message = await gitQuiet(['log', '--max-count=1', '--format=%B']);
  const reset = await gitQuiet(['reset', '--soft', 'HEAD~1']);
  if (!reset.ok) return { ok: false, error: reset.error };
  return { ok: true, message: message.ok ? message.out : '' };
}
