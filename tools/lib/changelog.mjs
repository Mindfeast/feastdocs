import { execFile } from 'node:child_process';
import path from 'node:path';

/** Field and record separators that cannot appear in commit text. */
const RECORD = String.fromCharCode(0);
const FIELD = String.fromCharCode(31);

/**
 * Recent commits, for the site's own changelog.
 *
 * Merge commits are skipped: they carry no content of their own and would
 * double every entry. Each commit reports whether it touched the docs folder,
 * so readers can tell a content update from a framework change.
 *
 * Returns [] when git is unavailable or the folder is not a repository — the
 * changelog component then simply renders nothing.
 */
export async function collectChangelog(docsDir, limit) {
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
      // Conventional-commit prefixes become a badge; the rest is the headline.
      type: /^(\w+)(?:\([^)]*\))?!?:/.exec(subject)?.[1]?.toLowerCase() ?? null,
      subject: subject.replace(/^\w+(?:\([^)]*\))?!?:\s*/, ''),
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
