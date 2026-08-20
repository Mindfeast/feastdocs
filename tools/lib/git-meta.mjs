import { execFile } from 'node:child_process';
import path from 'node:path';

/**
 * Last-commit metadata per docs file, from git history.
 *
 * One `git log` over the docs folder covers every file: commits stream
 * newest-first with the files they touched, so the first time a file appears
 * is its most recent change. That gives author attribution for BOTH editing
 * strategies — web commits through the GitHub-backed content manager and
 * ordinary pushes from a code editor — because both end up as commits.
 *
 * Returns a Map of repo-relative-to-docsRoot path -> { author, date }.
 * Empty when git is missing or the folder is not inside a repository; the
 * build then falls back to filesystem timestamps with no author.
 */
export async function collectGitMeta(docsRoot) {
  const meta = new Map();

  let output;
  try {
    output = await run(
      'git',
      ['log', '--format=%x01%an%x09%aI', '--name-only', '--no-renames', '--', '.'],
      docsRoot,
    );
  } catch {
    return meta; // no git, not a repo, or no commits — all fine
  }

  // Paths in --name-only are relative to the repo root, not to docsRoot.
  let repoRoot;
  try {
    repoRoot = (await run('git', ['rev-parse', '--show-toplevel'], docsRoot)).trim();
  } catch {
    return meta;
  }
  const docsPrefix = path
    .relative(repoRoot, docsRoot)
    .split(path.sep)
    .join('/')
    .replace(/\/?$/, '/');

  let author = '';
  let date = '';
  for (const line of output.split('\n')) {
    if (line.startsWith('\x01')) {
      [author, date] = line.slice(1).split('\t');
      continue;
    }
    if (!line) continue;
    const file =
      docsPrefix === '/'
        ? line
        : line.startsWith(docsPrefix)
          ? line.slice(docsPrefix.length)
          : null;
    if (file && !meta.has(file)) {
      meta.set(file, { author, date });
    }
  }

  return meta;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
