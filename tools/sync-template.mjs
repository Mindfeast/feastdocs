import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './lib/config.mjs';
import { dim, green, red, yellow } from './lib/log.mjs';

/**
 * Builds the starter template from this repository.
 *
 * The template is a *derived artifact*, never a hand-maintained copy: a second
 * repository edited by hand goes stale the first time a feature lands here and
 * nobody remembers to port it. Everything except content and branding is taken
 * from this repo as-is, so a new component, tool or config option is in the
 * template the next time this runs.
 *
 *   node tools/sync-template.mjs <output-dir>            build the tree
 *   node tools/sync-template.mjs <output-dir> --commit   ...and commit it
 *   node tools/sync-template.mjs <output-dir> --push     ...and push it
 *
 * The output directory may be an existing clone of the template repository, in
 * which case its .git is preserved and only the working tree is replaced.
 */

/** Paths never copied: this site's content, its branding, and local editor state. */
const EXCLUDE = [
  'docs/', // replaced by the overlay's starter pages
  'public/logo.svg',
  'public/og-image.png',
  'public/favicon.ico',
  'public/favicon.svg', // replaced by a neutral one
  '.claude/',
  '.vscode/',
  'template/', // the overlay itself
  'README.md', // replaced by the overlay
  'feastdocs.config.mjs', // replaced by the overlay
  // CLAUDE.md is deliberately NOT excluded: it documents the framework, not
  // this site, so the template should always carry the current version.
];

/**
 * Exceptions to EXCLUDE. The page templates behind `npm run docs:new` and the
 * editor's "New from template" button are a feature, not content, so they ship
 * with the starter and stay in step with this repo.
 */
const KEEP_ANYWAY = ['docs/_templates/'];

/** Files the template needs that this repo does not carry verbatim. */
const OVERLAY = 'template';

async function main() {
  const [target, ...flags] = process.argv.slice(2);
  if (!target) {
    console.error(
      `${red('✗')} usage: node tools/sync-template.mjs <output-dir> [--commit] [--push]`,
    );
    process.exit(1);
  }

  const out = path.resolve(target);
  const commit = flags.includes('--commit') || flags.includes('--push');
  const push = flags.includes('--push');

  const tracked = (await git(['ls-files'], ROOT)).split('\n').filter(Boolean);
  const keep = tracked.filter(
    (file) =>
      KEEP_ANYWAY.some((prefix) => file.startsWith(prefix)) ||
      !EXCLUDE.some((prefix) => file.startsWith(prefix)),
  );

  // Replace the working tree but keep .git, so an existing clone stays a clone.
  // Local, regenerable directories are left alone: they are gitignored, so
  // deleting them accomplishes nothing except a reinstall — and on Windows it
  // fails outright when a binary inside node_modules is held open by a running
  // process, which aborts the whole sync.
  const PRESERVE = new Set(['.git', 'node_modules', '.angular', 'dist']);
  await fs.mkdir(out, { recursive: true });
  for (const entry of await fs.readdir(out)) {
    if (PRESERVE.has(entry)) continue;
    await fs.rm(path.join(out, entry), { recursive: true, force: true });
  }

  for (const file of keep) {
    const to = path.join(out, file);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(path.join(ROOT, file), to);
  }

  const overlaid = await copyTree(path.join(ROOT, OVERLAY), out);

  // A site needs to know what it is running before it can be told an upgrade
  // exists. Written last so it always matches the files just copied.
  const stamp = (await git(['rev-parse', 'HEAD'], ROOT)).trim();
  await fs.writeFile(
    path.join(out, '.feastdocs-version'),
    `${stamp}
`,
    'utf8',
  );

  console.log(
    `${green('✓')} template: ${keep.length} framework files, ${overlaid} from ${OVERLAY}/ ` +
      dim(`→ ${out}`),
  );

  const missing = tracked.length - keep.length;
  console.log(`  ${dim(`${missing} excluded (this site's content and branding)`)}`);

  if (!commit) return;

  const isRepo = await git(['rev-parse', '--is-inside-work-tree'], out).catch(() => null);
  if (isRepo === null) {
    console.warn(`${yellow('!')} ${out} is not a git repository — skipping commit`);
    return;
  }

  await git(['add', '-A'], out);
  const status = await git(['status', '--porcelain'], out);
  if (!status.trim()) {
    console.log(`  ${dim('no changes to commit')}`);
    return;
  }

  const source = (await git(['rev-parse', '--short', 'HEAD'], ROOT)).trim();
  await git(['commit', '-m', `chore: sync template from feastdocs@${source}`], out);
  console.log(`${green('✓')} committed ${dim(`(source ${source})`)}`);

  if (push) {
    await git(['push'], out);
    console.log(`${green('✓')} pushed`);
  }
}

/** Copies a directory tree, returning how many files were written. */
async function copyTree(from, to) {
  let count = 0;
  const entries = await fs.readdir(from, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(target, { recursive: true });
      count += await copyTree(source, target);
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      count += 1;
    }
  }
  return count;
}

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

await main();
