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

async function git(args, { timeout = GIT_TIMEOUT } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', ROOT, ...args], {
    timeout,
    env: GIT_ENV,
    maxBuffer: 10_000_000,
  });
  return stdout.trim();
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

/** Files changed under the docs folder, staged or not, including new ones. */
async function changedDocs(docsPrefix) {
  const out = await gitQuiet(['status', '--porcelain', '--untracked-files=all', '--', docsPrefix]);
  if (!out.ok) return [];
  return out.out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim();
      // Renames read as `old -> new`; the new path is the one to stage.
      const file = line.slice(2).trim().split(' -> ').pop().replace(/^"|"$/g, '');
      return { status, file };
    });
}

export async function status({ docsRoot }) {
  const docsPrefix = path.relative(ROOT, docsRoot).split(path.sep).join('/') || '.';
  const inside = await gitQuiet(['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return { git: false };

  const [branch, remote, target] = await Promise.all([
    gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => (r.ok ? r.out : null)),
    gitQuiet(['remote', 'get-url', 'origin']).then((r) => (r.ok ? r.out : null)),
    defaultBranch(),
  ]);
  const changed = await changedDocs(docsPrefix);
  const initials = await authorInitials();

  return {
    git: true,
    branch,
    defaultBranch: target,
    // Publishing straight onto the protected branch is what this exists to avoid.
    onDefaultBranch: branch === target,
    remote,
    hasRemote: remote !== null,
    changed,
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
