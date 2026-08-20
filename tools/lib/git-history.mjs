import { execFile } from 'node:child_process';

/**
 * Author attribution and the changelog both read `git log`, so both are only
 * as good as the checkout. Several hosts clone with `--depth 1` — Cloudflare
 * Pages does, and so does any CI step that forgets `fetch-depth: 0` — which
 * leaves the build with a single commit: every page attributed to whoever
 * pushed last, and a changelog with one entry.
 *
 * Deepening the clone in the build is the fix that needs no host
 * configuration. When that is not possible (no credentials in the checkout,
 * no network), the caller falls back to the GitHub API.
 */
export async function ensureFullHistory() {
  if (!(await isShallow())) return { shallow: false, deepened: false };

  try {
    // A build host is not interactive: without these, a checkout whose remote
    // needs credentials can sit on a prompt until the build times out. The
    // timeout is the backstop for anything that still blocks.
    await run('git', ['-c', 'credential.helper=', 'fetch', '--unshallow', '--quiet'], {
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
  } catch {
    // No remote, no credentials, or an offline build — nothing to do but
    // report it so the caller can pick another source.
    return { shallow: await isShallow(), deepened: false };
  }

  const shallow = await isShallow();
  return { shallow, deepened: !shallow };
}

export async function isShallow() {
  try {
    return (await run('git', ['rev-parse', '--is-shallow-repository'])).trim() === 'true';
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024, timeout: 20_000, ...options },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
