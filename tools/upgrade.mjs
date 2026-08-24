import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './lib/config.mjs';
import { dim, green, red, yellow } from './lib/log.mjs';

/**
 * Upgrades a site to the current framework.
 *
 * A site started from the template is a copy, and copies drift. This replaces
 * the framework — the app, the build pipeline, the deployment configs — while
 * leaving everything that makes the site *yours* untouched: docs/, the config,
 * your branding in public/, your README.
 *
 *   npm run upgrade              show what would change
 *   npm run upgrade -- --apply   write it
 *
 * package.json is merged rather than replaced, so upstream dependencies and
 * scripts arrive without losing the site's own name or anything it added.
 */
const TEMPLATE =
  process.env.FEASTDOCS_TEMPLATE ?? 'https://github.com/Mindfeast/feastdocs-template.git';

/** Yours. Never touched by an upgrade. */
const OWNED = [
  'docs/',
  'feastdocs.config.mjs',
  'public/',
  'README.md',
  // The override slot. The framework ships it empty and its own header calls it
  // "your styles", so replacing it with upstream's empty copy silently deletes
  // every override the site has — the one file here most likely to be edited.
  'src/styles/custom.scss',
  '.git/',
  'node_modules/',
  'dist/',
  '.angular/',
];

/** Yours, but the framework adds to it — merged field by field. */
const MERGED = ['package.json'];

async function main() {
  const apply = process.argv.includes('--apply');

  if (apply && (await dirty())) {
    console.error(
      `${red('✗')} working tree has uncommitted changes.\n` +
        `  Commit or stash first — an upgrade rewrites files, and git is how you review it.`,
    );
    process.exit(1);
  }

  const current = await readVersion();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'feastdocs-upgrade-'));

  try {
    console.log(`  ${dim(`fetching ${TEMPLATE}`)}`);
    await run('git', ['clone', '--quiet', '--depth', '1', TEMPLATE, temp]);

    const latest =
      (await readVersion(temp)) ?? (await run('git', ['rev-parse', 'HEAD'], temp)).trim();
    if (current && latest && current === latest) {
      console.log(`${green('✓')} already up to date ${dim(`(${current.slice(0, 7)})`)}`);
      return;
    }

    const files = (await run('git', ['ls-files'], temp))
      .split('\n')
      .filter(Boolean)
      .filter((file) => !OWNED.some((prefix) => file.startsWith(prefix)))
      .filter((file) => !MERGED.includes(file));

    const changes = [];
    for (const file of files) {
      const from = path.join(temp, file);
      const to = path.join(ROOT, file);
      const [incoming, existing] = await Promise.all([
        fs.readFile(from),
        fs.readFile(to).catch(() => null),
      ]);
      if (existing !== null && existing.equals(incoming)) continue;
      changes.push({ file, from, to, added: existing === null });
    }

    const merge = await mergePackageJson(temp);

    if (changes.length === 0 && !merge.changed) {
      console.log(`${green('✓')} no framework changes to apply`);
      return;
    }

    console.log('');
    for (const change of changes.slice(0, 40)) {
      console.log(`  ${change.added ? green('+') : yellow('~')} ${change.file}`);
    }
    if (changes.length > 40) console.log(`  ${dim(`…and ${changes.length - 40} more`)}`);
    if (merge.changed) {
      console.log(`  ${yellow('~')} package.json ${dim(`(${merge.summary})`)}`);
    }
    console.log('');

    if (!apply) {
      console.log(
        `${yellow('!')} dry run — nothing written. ${dim('Re-run with --apply to upgrade.')}`,
      );
      console.log(`  ${dim('Your docs/, config, public/ and README are never touched.')}`);
      return;
    }

    for (const change of changes) {
      await fs.mkdir(path.dirname(change.to), { recursive: true });
      await fs.copyFile(change.from, change.to);
    }
    if (merge.changed) {
      await fs.writeFile(path.join(ROOT, 'package.json'), merge.contents, 'utf8');
    }
    if (latest) {
      await fs.writeFile(path.join(ROOT, '.feastdocs-version'), `${latest}\n`, 'utf8');
    }

    console.log(
      `${green('✓')} upgraded ${dim(`${current?.slice(0, 7) ?? 'unknown'} → ${latest.slice(0, 7)}`)}`,
    );
    console.log(`  ${dim('next: npm install && npm run build, then review with git diff')}`);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

/**
 * Takes upstream's dependencies and scripts, keeps this site's identity and
 * anything it added of its own. Replacing the file wholesale would rename the
 * project and drop every dependency the site installed itself.
 */
async function mergePackageJson(temp) {
  const [mine, theirs] = await Promise.all([
    readJson(path.join(ROOT, 'package.json')),
    readJson(path.join(temp, 'package.json')),
  ]);
  if (!mine || !theirs) return { changed: false };

  const before = JSON.stringify(mine);
  const notes = [];

  for (const field of ['dependencies', 'devDependencies', 'scripts']) {
    const merged = { ...(mine[field] ?? {}), ...(theirs[field] ?? {}) };
    const added = Object.keys(theirs[field] ?? {}).filter((key) => !(key in (mine[field] ?? {})));
    const bumped = Object.keys(theirs[field] ?? {}).filter(
      (key) => key in (mine[field] ?? {}) && mine[field][key] !== theirs[field][key],
    );
    if (added.length) notes.push(`+${added.length} ${field}`);
    if (bumped.length) notes.push(`${bumped.length} ${field} updated`);
    mine[field] = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  }

  const contents = `${JSON.stringify(mine, null, 2)}\n`;
  return {
    changed: JSON.stringify(mine) !== before,
    contents,
    summary: notes.join(', ') || 'no dependency changes',
  };
}

async function readVersion(dir = ROOT) {
  const raw = await fs.readFile(path.join(dir, '.feastdocs-version'), 'utf8').catch(() => null);
  return raw === null ? null : raw.trim();
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function dirty() {
  const status = await run('git', ['status', '--porcelain'], ROOT).catch(() => '');
  return status.trim().length > 0;
}

function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

await main();
