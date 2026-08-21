import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadConfig } from './lib/config.mjs';
import { collectDocs } from './lib/collect.mjs';
import { emit } from './lib/emit.mjs';
import { ensureFullHistory } from './lib/git-history.mjs';
import { collectAllChangelogs } from './lib/changelog.mjs';
import { writeChangelogPages } from './lib/changelog-pages.mjs';
import { writeOpenApiPages } from './lib/openapi.mjs';
import { dim, green, red, yellow } from './lib/log.mjs';

/**
 * Reads docs/, renders it, and writes the generated modules the Angular app
 * imports. Safe to call repeatedly — used by both the one-shot build and the
 * dev watcher.
 */
export async function buildContent({ bust = false, label = 'docs' } = {}) {
  const started = performance.now();
  const config = await loadConfig({ bust });
  // Author attribution and the changelog both read git history, so deepen a
  // shallow checkout before anything asks for it. No-op on a normal clone.
  await ensureFullHistory();

  // History first: the month pages are generated from it and must exist on
  // disk before the docs folder is scanned.
  const changelog = await collectAllChangelogs(config);
  await writeChangelogPages(config, changelog);

  // Endpoint pages are generated the same way, and for the same reason:
  // once they are real files, everything downstream treats them as pages.
  await writeOpenApiPages(config);

  const { docs, sections, assets, warnings, versions } = await collectDocs(config);
  await emit({ config, docs, sections, assets, changelog, versions });

  const elapsed = Math.round(performance.now() - started);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  console.log(
    `${green('✓')} ${label}: ${plural(docs.length, 'page')}, ` +
      `${plural(assets.length, 'asset')} ${dim(`(${elapsed}ms)`)}`,
  );
  for (const warning of warnings) console.log(`  ${yellow('!')} ${warning}`);

  return { config, docs, sections, warnings };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    await buildContent();
  } catch (error) {
    console.error(`${red('✗')} content build failed`);
    console.error(error);
    process.exitCode = 1;
  }
}
