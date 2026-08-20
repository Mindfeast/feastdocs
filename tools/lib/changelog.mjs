import { execFile } from 'node:child_process';
import path from 'node:path';
import { ensureFullHistory } from './git-history.mjs';
import { paths } from './config.mjs';
import { dim, yellow } from './log.mjs';

/** Conventional-commit prefix: becomes a badge and leaves the headline. */
const TYPE_PREFIX = /^(\w+)(?:\([^)]*\))?!?:/;
const TYPE_STRIP = /^\w+(?:\([^)]*\))?!?:\s*/;

/** Azure DevOps prefixes a squashed pull request with "Merged PR 482: ". */
const AZURE_PR_PREFIX = /^Merged PR \d+:\s*/;

/** Field and record separators that cannot appear in commit text. */
const RECORD = String.fromCharCode(0);
const FIELD = String.fromCharCode(31);
const NEWLINE = String.fromCharCode(10);
const LINE_BREAK = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));

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
export async function collectChangelog(docsDir, limit, github = {}, branch = null) {
  // Deepen a marked shallow clone. Harmless on a full one.
  await ensureFullHistory();

  const commits = await collectFromGit(docsDir, limit, branch);
  console.log(`  ${dim(`changelog: git history gave ${plural(commits.length, 'commit')}`)}`);

  // Hosts truncate history in ways `--is-shallow-repository` does not always
  // report — Cloudflare Pages among them. So judge by the result, not by the
  // flag: a single commit from a repository that has a real history means the
  // checkout is not the source to trust.
  if (commits.length > 1 || !github.repo) return commits;

  // The API needs a branch name; fall back to the repository's default.
  const fromApi = await collectRepoChangelog(github.repo, branch ?? github.branch, limit);
  return fromApi.length > commits.length ? fromApi : commits;
}

/**
 * Every changelog source for one build: this repository plus each entry in
 * `changelog.repos`. Collected once and reused, because the month pages are
 * generated from the same data the component renders.
 */
export async function collectAllChangelogs(config) {
  const { limit, repos } = config.changelog;

  startRemoteBudget(Date.now());

  const parsed = (repos ?? []).map(normaliseSource);
  const valid = parsed.filter(Boolean);
  const invalid = parsed.length - valid.length;
  if (invalid > 0) {
    console.warn(
      `  ${yellow('!')} changelog: ${invalid} entr${invalid === 1 ? 'y' : 'ies'} in changelog.repos ` +
        `${dim('ignored — a GitHub entry needs repo, an Azure entry needs org, project and repo')}`,
    );
  }

  const collected = await Promise.all(
    valid.map(async (source) => [source, await collectSourceChangelog(source, limit)]),
  );

  const commits = await collectChangelog(
    paths.docs(config),
    limit,
    config.github,
    config.changelog.branch,
  );

  const selfTitle =
    config.changelog.selfLabel ?? config.github.repo?.split('/').pop() ?? 'This repository';
  const sources = {
    [SELF_ID]: {
      title: selfTitle,
      slug: slugify(selfTitle),
      commitUrl:
        config.github.repo === null ? null : `https://github.com/${config.github.repo}/commit/`,
    },
  };

  const byRepo = {};
  for (const [source, entries] of collected) {
    byRepo[source.id] = entries;
    sources[source.id] = {
      title: source.title,
      slug: source.slug,
      commitUrl: source.commitUrl,
    };
  }

  return { commits, byRepo, sources };
}

/**
 * One entry from `changelog.repos`, normalised. Accepts the GitHub shorthand
 * ('owner/name'), an object, and an explicit `id` so a page can refer to a
 * long Azure DevOps path by a short name.
 */
export function normaliseSource(entry) {
  const spec = typeof entry === 'string' ? { repo: entry } : { ...entry };
  const provider = (spec.provider ?? 'github').toLowerCase();

  if (provider === 'azure' || provider === 'azure-devops') {
    const { org, project, repo, branch = 'main' } = spec;
    if (!org || !project || !repo) return null;
    const title = spec.title ?? repo;
    return {
      id: spec.id ?? `azure:${org}/${project}/${repo}`,
      provider: 'azure',
      title,
      slug: slugify(spec.slug ?? title),
      // Fully qualified in build logs, where org and project matter.
      label: `${project}/${repo}`,
      commitUrl: `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${repo}/commit/`,
      org,
      project,
      repo,
      branch,
    };
  }

  if (!spec.repo) return null;
  const title = spec.title ?? String(spec.repo).split('/').pop();
  return {
    id: spec.id ?? spec.repo,
    provider: 'github',
    title,
    slug: slugify(spec.slug ?? title),
    label: spec.repo,
    commitUrl: `https://github.com/${spec.repo}/commit/`,
    repo: spec.repo,
    branch: spec.branch ?? 'main',
  };
}

/** Folder- and URL-safe name for a source. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reserved id for the repository the docs live in. */
export const SELF_ID = 'self';

/**
 * Total wall-clock budget for reading remote history. Deploy time is not worth
 * more than this: a slow or unreachable host stops paginating and the page
 * shows whatever arrived.
 */
const REMOTE_BUDGET_MS = 90_000;
let deadline = null;

/** Starts the shared budget. Called once per build, before any source. */
export function startRemoteBudget(now) {
  deadline = now + REMOTE_BUDGET_MS;
}

function outOfTime(now) {
  return deadline !== null && now > deadline;
}

/** Dispatches one normalised source to the right provider. */
export async function collectSourceChangelog(source, limit) {
  return source.provider === 'azure'
    ? collectFromAzure(source, limit)
    : collectRepoChangelog(source.repo, source.branch, limit);
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
    if (outOfTime(Date.now())) {
      console.warn(
        `  ${yellow('!')} changelog ${repo}: out of time ${dim(`— ${plural(commits.length, 'commit')} collected`)}`,
      );
      break;
    }
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

/**
 * Commits for an Azure DevOps repository.
 *
 * Azure reports `changeCounts` per commit, so file counts survive — unlike the
 * GitHub commits endpoint. It does not report parents, so merge commits cannot
 * be filtered out; in Azure that is usually welcome, since a squashed pull
 * request lands as "Merged PR 123: …" and is the change worth showing.
 *
 * Auth is a personal access token with **Code (Read)**, sent as HTTP Basic
 * with an empty username — the scheme Azure documents. Read from
 * AZURE_DEVOPS_PAT or AZURE_DEVOPS_TOKEN in the build environment.
 */
async function collectFromAzure({ org, project, repo, branch, label }, limit) {
  const pat = process.env.AZURE_DEVOPS_PAT ?? process.env.AZURE_DEVOPS_TOKEN;
  if (!pat) {
    console.warn(
      `  ${yellow('!')} changelog ${label}: ` +
        dim('no AZURE_DEVOPS_PAT in the build environment — history unavailable'),
    );
    return [];
  }

  const headers = {
    accept: 'application/json',
    // Azure expects Basic with an empty user and the PAT as the password.
    authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
  };

  const commits = [];
  for (let skip = 0; commits.length < limit && skip < 1000; skip += 100) {
    if (outOfTime(Date.now())) {
      console.warn(
        `  ${yellow('!')} changelog ${label}: out of time ${dim(`— ${plural(commits.length, 'commit')} collected`)}`,
      );
      break;
    }
    const top = Math.min(100, limit - commits.length);
    const url =
      `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories/` +
      `${encodeURIComponent(repo)}/commits?api-version=7.1` +
      `&searchCriteria.itemVersion.version=${encodeURIComponent(branch)}` +
      `&searchCriteria.$top=${top}&searchCriteria.$skip=${skip}`;

    let payload;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        console.warn(
          `  ${yellow('!')} changelog ${label}: Azure DevOps ${response.status} ` +
            dim(
              response.status === 401 || response.status === 203
                ? '— check the PAT and its Code (Read) scope'
                : `— ${plural(commits.length, 'commit')} collected`,
            ),
        );
        break;
      }
      payload = await response.json();
    } catch (error) {
      console.warn(`  ${yellow('!')} changelog ${label}: ${error.message}`);
      break;
    }

    const batch = Array.isArray(payload?.value) ? payload.value : [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const message = String(item.comment ?? '');
      const [rawSubject, ...rest] = message.split(LINE_BREAK);
      // A squashed pull request lands as "Merged PR 482: fix: …". Drop that
      // prefix so the conventional-commit type inside it still becomes a badge;
      // the commit link leads to the pull request anyway.
      const subject = rawSubject.replace(AZURE_PR_PREFIX, '');
      const counts = item.changeCounts ?? {};
      const files = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);

      // `comment` is capped by Azure; commentTruncated says the rest was cut.
      const body = cleanBody(rest.join(NEWLINE));

      commits.push({
        hash: String(item.commitId ?? '').slice(0, 7),
        author: item.author?.name ?? '',
        date: item.author?.date ?? '',
        type: TYPE_PREFIX.exec(subject)?.[1]?.toLowerCase() ?? null,
        subject: subject.replace(TYPE_STRIP, ''),
        body: body && item.commentTruncated ? `${body} …` : body,
        files: files > 0 ? files : null,
        touchesDocs: null,
      });
      if (commits.length >= limit) break;
    }

    if (batch.length < top) break;
  }

  if (commits.length > 0) {
    console.log(
      `  ${dim(`changelog ${label}: ${plural(commits.length, 'commit')} from Azure DevOps`)}`,
    );
  }
  return commits;
}

async function collectFromGit(docsDir, limit, branch) {
  const ref = await resolveRef(branch);

  let output;
  try {
    output = await run('git', [
      'log',
      '--no-merges',
      `-n${limit}`,
      '--format=%x00%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1f',
      '--name-only',
      // Without a ref this reads HEAD, which is what a normal build wants.
      ...(ref === null ? [] : [ref]),
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
 * Turns a configured branch name into a ref this checkout actually has. A CI
 * clone often holds only the branch it built, so 'main' may exist solely as
 * origin/main — and on a detached checkout, not at all. Falling back to HEAD
 * beats failing a build over a changelog.
 */
async function resolveRef(branch) {
  if (!branch) return null;

  for (const candidate of [branch, `origin/${branch}`]) {
    try {
      await run('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  console.warn(
    `  ${yellow('!')} changelog: branch '${branch}' is not in this checkout ` +
      dim('— reading the checked-out branch instead'),
  );
  return null;
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
