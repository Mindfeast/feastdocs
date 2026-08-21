import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, ROOT } from './lib/config.mjs';
import { cyan, dim, green, red, yellow } from './lib/log.mjs';

// Usage: npm run docs:new -- guides/deploying "Deploying to production" [--scss]
const [target, explicitTitle, ...flags] = process.argv.slice(2);

if (!target) {
  console.error(`${red('✗')} usage: npm run docs:new -- <path> ["Title"] [--scss]`);
  console.error(dim('   e.g. npm run docs:new -- guides/deploying "Deploying to production"'));
  process.exit(1);
}

const config = await loadConfig();
const relative = target.replace(/^\/+/, '').replace(/\.md$/i, '');

// Deepest allowed nesting: a section plus four category levels.
const MAX_FOLDER_DEPTH = 8;
const depth = relative.split('/').length - 1;
if (depth > MAX_FOLDER_DEPTH) {
  console.error(
    `${red('✗')} too deep: ${depth} folders. The maximum is ${MAX_FOLDER_DEPTH} levels (a section plus seven category levels).`,
  );
  process.exit(1);
}

const file = path.join(ROOT, config.docsDir, `${relative}.md`);
const title = explicitTitle?.trim() || humanize(path.basename(relative));

if (await exists(file)) {
  console.error(`${red('✗')} ${path.relative(ROOT, file)} already exists`);
  process.exit(1);
}

await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(
  file,
  `---\ntitle: ${title}\ndescription: \nsidebar_position: 10\n---\n\n# ${title}\n\nStart writing here.\n`,
  'utf8',
);
console.log(`${green('✓')} created ${cyan(path.relative(ROOT, file))}`);

if (flags.includes('--scss')) {
  const stylesheet = file.replace(/\.md$/, '.scss');
  await fs.writeFile(
    stylesheet,
    `// Styles for ${title}. Automatically scoped to this page only.\n\n.example {\n  color: var(--fd-accent);\n}\n`,
    'utf8',
  );
  console.log(`${green('✓')} created ${cyan(path.relative(ROOT, stylesheet))}`);
}

const dir = path.dirname(relative);
if (dir !== '.' && !(await exists(path.join(ROOT, config.docsDir, dir, '_category.json')))) {
  console.log(
    `${yellow('!')} ${dim(`no _category.json in docs/${dir} — the sidebar label falls back to the folder name`)}`,
  );
}

async function exists(target) {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

function humanize(value) {
  return value
    .replace(/^\d+[-_. ]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
