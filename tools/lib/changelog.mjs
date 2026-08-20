import { execFile } from 'node:child_process';
import path from 'node:path';
import { ensureFullHistory } from './git-history.mjs';
import { dim, yellow } from './log.mjs';

/** Conventional-commit prefix: becomes a badge and leaves the headline. */
const TYPE_PREFIX = /^(\w+)(?:\([^)]*\))?!?:/;
const TYPE_STRIP = /^\w+(?:\([^)]*\))?!?:\s*/;

/** Field and record separators that cannot appear in commit text. */
const RECORD = String.fromCharCode(0);
const FIELD = String.fromCharCode(31);
const NEWLINE = String.fromCharCode(10);

/**
 * Commits for this repository, for the site's own changelog.
 *
 * Merge commits are skipped: they carry no content of their own and would
 * double every entry. Each commit reports whether it touched the docs folder,
 * so readers can tell a content update from a framework change.
 *
 * Read from `git log` when the checkout has real history, and from the GitHub
 * API when it does not — see collectFromApi. Returns [] when neither source is
 * available; the component then renders a short notice instead.
 */
export async function collectChangelog(docsDir, limit, github = {}) {
  // Deepen a marked shallow clone. Harmless on a full one.
  await ensureFullHistory();

  const commits = await collectFromGit(docsDir, limit);
  console.log(`  ${dim(`changelog: git history gave ${plural(commits.length, 'commit')}`)}`);

  // Hosts truncate history in ways `--is-shallow-repository` does not always
  // report — Cloudflare Pages among them. So judge by the result, not by the
  // flag: a single commit from a repository that has a real history means the
  // checkout is not the source to trust.
  if (commits.length > 1 || !github.repo) return commits;

  const fromApi = await collectRepoChangelog(github.repo, github.branch, limit);
  return fromApi.length > commits.length ? fromApi : commits;
}

/**
 * Commits for any repository, read from the GitHub API. This is how a docs
 * site covers products that live in other repositories, and the fallback when
 * the local checkout has no usable history.
 *
 * The commits endpoint carries no file list, so `files` and `touchesDocs` come
 * back null — the component hides the file count and the docs-only view keeps
 * entries it cannot rule out.
 *
 * One request per 100 commits, unauthenticated unless GITHUB_TOKEN (or
 * GH_TOKEN) is set — required for private repositories, and worth setting
 * anyway to lift the 60-requests-per-hour anonymous limit. Any failure returns
 * what was collected so far: a changelog is never worth failing a build over.
 */
export async function collectRepoChangelog(repo, branch, limit) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'feastdocs-build',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const commits = [];
  for (let page = 1; commits.length < limit && page <= 10; page += 1) {
    const url =
      `https://api.github.com/repos/${repo}/commits` +
      `?sha=${encodeURIComponent(branch ?? 'main')}&per_page=100&page=${page}`;

    let batch;
    try {
      // A build must never hang on a network that silently drops the request.
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        console.warn(
          `  ${yellow('!')} changelog ${repo}: GitHub API ${response.status} ` +
            dim(
              response.status === 404
                ? '— private repository or wrong branch? set GITHUB_TOKEN'
                : `— ${plural(commits.length, 'commit')} collected`,
            ),
        );
        break;
      }
      batch = await response.json();
    } catch (error) {
      console.warn(`  ${yellow('!')} changelog ${repo}: ${error.message}`);
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const item of batch) {
      // Merge commits carry no content of their own, same as the git path.
      if ((item.parents?.length ?? 0) > 1) continue;
      const [subject, ...rest] = String(item.commit?.message ?? '').split(/\r?\n/);
      commits.push({
        hash: String(item.sha).slice(0, 7),
        author: item.commit?.author?.name ?? item.author?.login ?? '',
        date: item.commit?.author?.date ?? '',
        type: TYPE_PREFIX.exec(subject)?.[1]?.toLowerCase() ?? null,
        subject: subject.replace(TYPE_STRIP, ''),
        body: cleanBody(rest.join(NEWLINE)),
        files: null,
        touchesDocs: null,
      });
      if (commits.length >= limit) break;
    }

    if (batch.length < 100) break;
  }

  if (commits.length > 0) {
    console.log(
      `  ${dim(`changelog ${repo}: ${plural(commits.length, 'commit')} from the GitHub API`)}`,
    );
  }
  return commits;
}

async function collectFromGit(docsDir, limit) {
  let output;
  try {
    output = await run('git', [
      'log',
      '--no-merges',
      `-n${limit}`,
      '--format=%x00%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1f',
      '--name-only',
    ]);
  } catch {
    return [];
  }

  let repoRoot;
  try {
    repoRoot = (await run('git', ['rev-parse', '--show-toplevel'])).trim();
  } catch {
    return [];
  }
  const docsPrefix = path.relative(repoRoot, docsDir).split(path.sep).join('/');

  const commits = [];
  for (const record of output.split(RECORD)) {
    if (!record.trim()) continue;
    const [hash, author, date, subject, body, files = ''] = record.split(FIELD);
    if (!hash) continue;

    const touched = files
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    commits.push({
      hash,
      author,
      date,
      type: TYPE_PREFIX.exec(subject)?.[1]?.toLowerCase() ?? null,
      subject: subject.replace(TYPE_STRIP, ''),
      body: cleanBody(body),
      files: touched.length,
      touchesDocs: touched.some((file) => file.startsWith(`${docsPrefix}/`)),
    });
  }

  return commits;
}

/**
 * Commit trailers (Co-Authored-By, Signed-off-by, Reviewed-by…) are metadata,
 * not prose — they belong in the commit, not on a changelog page. Only a
 * trailing block of them is removed, so a body that happens to contain a
 * "Note: …" line mid-paragraph is left alone.
 */
const TRAILER = /^[A-Za-z][A-Za-z-]*:\s/;

function cleanBody(body) {
  const lines = body.trimEnd().split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || TRAILER.test(last)) lines.pop();
    else break;
  }
  return lines.join('\n').trim();
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
