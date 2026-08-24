/**
 * Checks the content manager's git layer against a throwaway repository that has a
 * real remote, so ahead/behind, push, sync and undo are verified for what they do
 * rather than for not throwing. Run it with `npm run verify:git`.
 *
 * Not a Vitest spec: `ng test` runs specs in a browser-like environment, and this
 * needs `child_process` and a filesystem.
 *
 * It works by cloning a bare repo, dropping `editor-git.mjs` into the clone
 * alongside a `config.mjs` that points ROOT at it, and importing it from there —
 * ROOT is read at import time, so that is the only way to aim the module at a
 * repository that is not this one. Nothing here touches the checkout it runs from.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'lib', 'editor-git.mjs');

// A fresh directory per run: git marks objects read-only on Windows, so a recursive
// delete can silently leave the previous repository in place — and a check that runs
// against stale state reports failures that are not real. Kept short, too: git
// cannot write objects when the path runs past the Windows limit.
const scratch = path.join(os.tmpdir(), `fd-git-${process.pid}`);

const bare = path.join(scratch, 'origin.git');
const work = path.join(scratch, 'work');
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A bare repo to push to, and a clone to work in.
fs.mkdirSync(bare);
git(bare, ['init', '--bare', '--initial-branch=main', '--quiet']);
git(scratch, ['clone', '--quiet', bare, 'work']);
git(work, ['config', 'user.email', 'probe@example.com']);
git(work, ['config', 'user.name', 'Probe Person']);
git(work, ['config', 'commit.gpgsign', 'false']);

// Minimal shape the module expects: a docs folder and a config.mjs exporting ROOT.
fs.mkdirSync(path.join(work, 'docs'), { recursive: true });
fs.mkdirSync(path.join(work, 'tools/lib'), { recursive: true });
fs.writeFileSync(path.join(work, 'docs/index.md'), 'one\n');
fs.writeFileSync(path.join(work, 'docs/keep.md'), 'keep\n');
fs.writeFileSync(path.join(work, 'outside.txt'), 'not docs\n');
fs.writeFileSync(
  path.join(work, 'tools/lib/config.mjs'),
  `export const ROOT = ${JSON.stringify(work)};\n`,
);
fs.copyFileSync(source, path.join(work, 'tools/lib/editor-git.mjs'));
git(work, ['add', '-A']);
git(work, ['commit', '--quiet', '-m', 'chore: initial']);
git(work, ['push', '--quiet', '-u', 'origin', 'main']);

const m = await import(
  'file:///' + path.join(work, 'tools/lib/editor-git.mjs').replace(/\\/g, '/')
);
const docsRoot = path.join(work, 'docs');
const results = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ pass, label, actual, expected });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) console.log(`        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
};

// ---- staged vs unstaged --------------------------------------------------
fs.appendFileSync(path.join(work, 'docs/index.md'), 'two\n'); // modified, unstaged
fs.writeFileSync(path.join(work, 'docs/new.md'), 'brand new\n'); // untracked
fs.appendFileSync(path.join(work, 'outside.txt'), 'ignored by us\n'); // outside docs

let st = await m.status({ docsRoot });
check('status sees only docs changes', st.changed.map((c) => c.file).sort(), [
  'docs/index.md',
  'docs/new.md',
]);
check('nothing staged yet', [st.stagedCount, st.unstagedCount], [0, 2]);
check('upstream distance is zero', [st.ahead, st.behind], [0, 0]);

await m.stage({ docsRoot, files: ['docs/index.md'] });
st = await m.status({ docsRoot });
check('after stage: one staged, one not', [st.stagedCount, st.unstagedCount], [1, 1]);
check(
  'the staged one is index.md',
  st.changed.filter((c) => c.staged).map((c) => c.file),
  ['docs/index.md'],
);

await m.unstage({ docsRoot, files: ['docs/index.md'] });
check('after unstage: nothing staged', (await m.status({ docsRoot })).stagedCount, 0);

// ---- guards -------------------------------------------------------------
check(
  'stage refuses traversal',
  (await m.stage({ docsRoot, files: ['docs/../secret'] })).error,
  'Invalid path.',
);
check(
  'stage refuses outside docs',
  (await m.stage({ docsRoot, files: ['outside.txt'] })).error,
  'Only files under docs can be changed.',
);
check('stage refuses an empty list', (await m.stage({ docsRoot, files: [] })).ok, false);

// ---- commit -------------------------------------------------------------
check(
  'commit refuses with nothing staged',
  (await m.commit({ docsRoot, message: 'docs: nothing' })).error,
  'Nothing is staged. Stage a change first, or use Stage all.',
);
check('commit refuses an empty message', (await m.commit({ docsRoot, message: '  ' })).ok, false);

const branched = await m.createBranch({ branch: 'docs/probe' });
check('createBranch moved onto it', [branched.ok, branched.branch], [true, 'docs/probe']);
check(
  'createBranch refuses a name that exists',
  (await m.createBranch({ branch: 'docs/probe' })).ok,
  false,
);
check('the edits came along', (await m.status({ docsRoot })).changed.length, 2);

const committed = await m.commit({ docsRoot, message: 'docs: probe change', stageAll: true });
check('commit staged all and committed', [committed.ok, committed.files], [true, 2]);
check('no protected-branch warning off main', committed.warning, null);
check('tree is clean afterwards', (await m.status({ docsRoot })).changed.length, 0);

// ---- ahead/behind, push, log -------------------------------------------
st = await m.status({ docsRoot });
check('no upstream yet on a new branch', [st.upstream, st.ahead], [null, 0]);

const logBefore = await m.log({ limit: 5 });
check('the local commit reads as unpushed', logBefore.commits[0].pushed, false);
check('subject survived the separator', logBefore.commits[0].subject, 'docs: probe change');

const pushed = await m.push();
check('push set the upstream', pushed.ok, true);
st = await m.status({ docsRoot });
check(
  'after push: level with upstream',
  [st.upstream, st.ahead, st.behind],
  ['origin/docs/probe', 0, 0],
);
check('and now it reads as pushed', (await m.log({ limit: 5 })).commits[0].pushed, true);

// ---- undo the last commit ---------------------------------------------
check(
  'undo refuses a commit the remote already has',
  (await m.undoLastCommit()).error,
  'The last commit is already on origin/docs/probe. Undoing it would rewrite history that everyone else has.',
);

fs.appendFileSync(path.join(work, 'docs/keep.md'), 'local only\n');
await m.commit({ docsRoot, message: 'docs: local only', stageAll: true });
const undone = await m.undoLastCommit();
check('undo returns the message to reuse', [undone.ok, undone.message], [true, 'docs: local only']);
check('and the change is staged again', (await m.status({ docsRoot })).stagedCount, 1);
await m.discardAll({ docsRoot, allowDelete: true });

// ---- sync --------------------------------------------------------------
check('sync with nothing to do', (await m.sync()).pulled, false);

// Someone else pushes to this branch, from a second clone.
const other = path.join(scratch, 'other');
git(scratch, ['clone', '--quiet', '--branch', 'docs/probe', bare, 'other']);
git(other, ['config', 'user.email', 'other@example.com']);
git(other, ['config', 'user.name', 'Other Person']);
fs.writeFileSync(path.join(other, 'docs/theirs.md'), 'from someone else\n');
git(other, ['add', '-A']);
git(other, ['commit', '--quiet', '-m', 'docs: theirs']);
git(other, ['push', '--quiet']);

const synced = await m.sync();
check('sync fast-forwarded', [synced.ok, synced.pulled, synced.behind], [true, true, 0]);
check('their file arrived', fs.existsSync(path.join(work, 'docs/theirs.md')), true);

// Diverge: a local commit plus a remote commit, which needs a human.
fs.writeFileSync(path.join(work, 'docs/mine.md'), 'mine\n');
await m.commit({ docsRoot, message: 'docs: mine', stageAll: true });
fs.writeFileSync(path.join(other, 'docs/theirs2.md'), 'also theirs\n');
git(other, ['add', '-A']);
git(other, ['commit', '--quiet', '-m', 'docs: theirs again']);
git(other, ['push', '--quiet']);

const diverged = await m.sync();
check(
  'diverged: fetched but not merged',
  [diverged.pulled, diverged.ahead, diverged.behind],
  [false, 1, 1],
);
check('and it says why', /both moved/.test(diverged.note ?? ''), true);

// ---- discardAll --------------------------------------------------------
fs.appendFileSync(path.join(work, 'docs/index.md'), 'unwanted\n');
fs.writeFileSync(path.join(work, 'docs/unwanted.md'), 'unwanted\n');
const refused = await m.discardAll({ docsRoot });
check(
  'discardAll refuses to delete without a yes',
  [refused.ok, refused.needsDelete],
  [false, true],
);
check('the files are still there', fs.existsSync(path.join(work, 'docs/unwanted.md')), true);

const wiped = await m.discardAll({ docsRoot, allowDelete: true });
check('discardAll restored and deleted', [wiped.restored, wiped.deleted], [1, 1]);
check('nothing left to show', (await m.status({ docsRoot })).changed.length, 0);
check('untracked file gone', fs.existsSync(path.join(work, 'docs/unwanted.md')), false);
check(
  'and the file outside docs was never touched',
  fs.readFileSync(path.join(work, 'outside.txt'), 'utf8'),
  'not docs\nignored by us\n',
);

// ---- committing on the default branch warns ----------------------------
git(work, ['switch', '--quiet', 'main']);
fs.appendFileSync(path.join(work, 'docs/keep.md'), 'on main\n');
const onMain = await m.commit({ docsRoot, message: 'docs: straight onto main', stageAll: true });
check(
  'commit on the default branch warns',
  /pull-request protected/.test(onMain.warning ?? ''),
  true,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length === 0) {
  // Only on success: a failure is much easier to look into with the repository
  // still on disk.
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
} else {
  console.log(`repository left at ${scratch} for inspection`);
}
process.exit(failed.length === 0 ? 0 : 1);
