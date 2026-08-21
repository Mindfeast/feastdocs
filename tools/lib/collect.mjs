import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import * as sass from 'sass';
import { paths } from './config.mjs';
import { createRenderer, collectFenceLanguages } from './markdown.mjs';
import { collectGitMeta } from './git-meta.mjs';
import { applyReuse, loadSnippets } from './reuse.mjs';

const DOC_GLOB = ['**/*.md', '**/*.markdown', '**/*.html'];
/** Deepest allowed nesting: a section plus four category levels. */
export const MAX_FOLDER_DEPTH = 8;
/** Files and folders starting with `_` are partials: never pages, but importable. */
const IGNORE = ['**/_*/**', '**/_*.*', '**/node_modules/**'];
const NON_ASSET = /\.(md|markdown|html|scss|sass|css)$/i;

/**
 * Reads the docs folder and turns it into the data the Angular app needs.
 *
 * The shape mirrors the navigation: every top-level folder under `docs/` is a
 * **section** with its own sidebar, and folders nested inside a section are
 * **categories** within that sidebar. Files at the root of `docs/` belong to no
 * section and render without a sidebar — that is how the landing page works.
 */
export async function collectDocs(config) {
  const versions = normaliseVersions(config);

  // The common case is one unversioned docs folder, and it must stay exactly
  // as it was: same slugs, same section ids, no prefixes anywhere.
  const collected = [];
  for (const version of versions) {
    collected.push(await collectVersion(config, version));
  }

  // Links are checked once, after every version is in: a link from one version
  // to another is legitimate, and checking per version would call it broken.
  const allDocs = collected.flatMap((one) => one.docs);
  const allWarnings = collected.flatMap((one) => one.warnings);
  validateLinks(allDocs, new Map(allDocs.map((doc) => [doc.slug, doc])), (message) =>
    allWarnings.push(message),
  );

  return {
    docs: allDocs,
    sections: collected.flatMap((one) => one.sections),
    assets: [...new Set(collected.flatMap((one) => one.assets))],
    warnings: allWarnings,
    versions: versions.map(({ id, label, prefix, isDefault }) => ({
      id,
      label,
      prefix,
      isDefault,
    })),
  };
}

/**
 * One entry per documented version, newest first, with the default version
 * carrying no route prefix. An empty `versions` config yields a single
 * unversioned entry, which is what most sites are.
 */
export function normaliseVersions(config) {
  const declared = config.versions ?? [];
  if (declared.length === 0) {
    return [
      { id: '', label: '', prefix: '', docsDir: config.docsDir, isDefault: true, editUrl: null },
    ];
  }

  const defaultIndex = Math.max(
    0,
    declared.findIndex((version) => version.default === true),
  );

  return declared.map((version, index) => {
    const isDefault = index === defaultIndex;
    return {
      id: String(version.id),
      label: String(version.label ?? version.id),
      // The default version owns the bare routes; the rest are namespaced.
      prefix: isDefault ? '' : String(version.slug ?? version.id),
      docsDir: version.docsDir ?? config.docsDir,
      isDefault,
      editUrl: version.editUrl ?? null,
    };
  });
}

async function collectVersion(config, version) {
  const docsRoot = path.join(paths.root, version.docsDir);
  const warnings = [];
  const warn = (message) => warnings.push(message);

  const entries = (
    await fg(DOC_GLOB, { cwd: docsRoot, ignore: IGNORE, dot: false, onlyFiles: true })
  ).sort();

  if (entries.length === 0) {
    return {
      docs: [],
      sections: [],
      assets: [],
      warnings: [`No documents found in ${docsRoot}`],
    };
  }

  const files = await Promise.all(
    entries.map(async (relative) => {
      const absolute = path.join(docsRoot, relative);
      const [raw, stat] = await Promise.all([fs.readFile(absolute, 'utf8'), fs.stat(absolute)]);
      return { relative: relative.split(path.sep).join('/'), absolute, raw, stat };
    }),
  );

  const [snippets, [renderer, gitMeta]] = await Promise.all([
    loadSnippets(docsRoot),
    Promise.all([
      createRenderer({
        langs: collectFenceLanguages(files.map((f) => f.raw)),
        onWarning: warn,
      }),
      collectGitMeta(docsRoot),
    ]),
  ]);

  const reuse = { snippets, variables: config.variables ?? {}, onWarning: warn };

  const docs = [];
  for (const file of files) {
    const depth = file.relative.split('/').length - 1;
    if (depth > MAX_FOLDER_DEPTH) {
      warn(
        `${file.relative}: nested ${depth} folders deep — the maximum is ${MAX_FOLDER_DEPTH} ` +
          `(a section plus seven category levels). The page still renders, but flatten it.`,
      );
    }
    docs.push(await buildDoc(file, { renderer, docsRoot, warn, gitMeta, reuse }));
  }

  const bySlug = new Map();
  for (const doc of docs) {
    const existing = bySlug.get(doc.slug);
    if (existing) {
      warn(`Duplicate route "/${doc.slug}": ${existing.sourcePath} and ${doc.sourcePath}`);
      continue;
    }
    bySlug.set(doc.slug, doc);
  }

  const pages = [...bySlug.values()].filter((doc) => !doc.draft);

  const [categories, sectionMeta] = await Promise.all([
    readJsonSidecars(docsRoot, '**/_category.json'),
    readJsonSidecars(docsRoot, '*/_section.json'),
  ]);

  const generatedIndexes = [];
  const sections = buildSections(pages, categories, sectionMeta, generatedIndexes);

  for (const category of generatedIndexes) {
    // A real index.md always wins; this only fills the gap.
    if (bySlug.has(category.slug)) continue;
    const page = buildCategoryIndex(category, pages);
    pages.push(page);
    bySlug.set(page.slug, page);
  }

  linkNeighbours(pages, sections);

  const assets = await fg(['**/*'], {
    cwd: docsRoot,
    ignore: IGNORE,
    onlyFiles: true,
  }).then((all) => all.filter((f) => !NON_ASSET.test(f)).map((f) => f.split(path.sep).join('/')));

  if (version.prefix !== '') applyPrefix(pages, sections, version);
  for (const doc of pages) doc.version = version.id;
  for (const section of sections) section.version = version.id;

  return { docs: pages, sections, assets, warnings };
}

/**
 * Namespaces a non-default version under its own route prefix. Slugs, section
 * ids and the links between pages all move together, so a v1 page never links
 * into v2 by accident.
 */
function applyPrefix(pages, sections, version) {
  const prefix = version.prefix;
  const move = (slug) => (slug == null ? slug : `${prefix}/${slug}`.replace(/\/+$/, ''));

  for (const doc of pages) {
    doc.slug = move(doc.slug);
    doc.section = doc.section === null ? null : `${prefix}--${doc.section}`;
    doc.prev = move(doc.prev);
    doc.next = move(doc.next);
    // An edit link must point at the file that was actually read.
    doc.editUrl =
      version.editUrl === null ? null : `${version.editUrl.replace(/\/?$/, '/')}${doc.sourcePath}`;
    if (version.editUrl === null) doc.sourcePath = '';
    doc.html = doc.html.replace(/(href=")\/(?!\/)/g, (match, head) => `${head}/${prefix}/`);
  }

  const walk = (items) => {
    for (const item of items) {
      if (item.slug != null) item.slug = move(item.slug);
      if (item.items) walk(item.items);
    }
  };
  for (const section of sections) {
    section.id = `${prefix}--${section.id}`;
    section.slug = move(section.slug);
    walk(section.items);
  }
}

/**
 * Landing page for a category that has no index.md, listing what is inside as
 * cards. Rendering is left to <fd-category-index>, which reads the generated
 * sidebar tree at runtime — so the cards stay correct as pages are added
 * without this page needing to know anything about them.
 *
 * `sourcePath` is empty on purpose: there is no file to edit, so the page
 * footer's edit link is suppressed and the content manager's tree skips it.
 */
function buildCategoryIndex(category, pages) {
  const prefix = `${category.slug}/`;
  const children = pages.filter((doc) => doc.slug.startsWith(prefix));
  // Newest child change stands in for the category's own date.
  const lastUpdated = children
    .map((doc) => doc.lastUpdated)
    .sort()
    .at(-1);

  return {
    slug: category.slug,
    section: category.slug.split('/')[0],
    title: category.label,
    description: '',
    sidebarLabel: category.label,
    sidebarPosition: 999,
    hasExplicitPosition: false,
    hidden: false,
    draft: false,
    showSidebar: true,
    tags: [],
    keywords: [],
    sourcePath: '',
    lastUpdated: lastUpdated ?? new Date(0).toISOString(),
    lastAuthor: null,
    showToc: false,
    headings: [],
    html: `<fd-category-index for="${category.slug}"></fd-category-index>`,
    css: '',
    prev: null,
    next: null,
  };
}

async function buildDoc(file, { renderer, docsRoot, warn, gitMeta, reuse }) {
  const { relative, raw, stat } = file;
  const isHtml = /\.html$/i.test(relative);
  const parsed = matter(raw);
  const data = parsed.data ?? {};

  const { slug, dirSlug } = computeSlug(relative, data.slug);

  // Snippets and variables resolve before anything reads the content, so the
  // rendered HTML, the headings and the search index all see the real text.
  const content = applyReuse(parsed.content, { ...reuse, where: relative });
  const stripped = isHtml ? stripHtmlH1(content) : stripMarkdownH1(content);

  const title =
    data.title?.toString().trim() ||
    stripped.title ||
    humanize(path.basename(relative).replace(/\.[^.]+$/, ''));

  const context = { slug, dirSlug, sourcePath: relative };
  const rendered = isHtml
    ? renderer.renderHtml(stripped.content, context)
    : renderer.render(stripped.content, context);

  const css = await compilePageStyles(file, { slug, docsRoot, warn });
  const rawPosition = data.sidebar_position ?? data.sidebarPosition;

  // Git history is the source of truth for "who touched this last" — it covers
  // web commits and ordinary pushes alike. Uncommitted files fall back to the
  // filesystem date with no author.
  const git = gitMeta.get(relative);

  return {
    slug,
    section: relative.includes('/') ? relative.split('/')[0] : null,
    title,
    description: (data.description ?? '').toString(),
    sidebarLabel: (data.sidebar_label ?? data.sidebarLabel ?? title).toString(),
    sidebarPosition: toNumber(rawPosition, 999),
    // A short marker beside the label — an HTTP method, a status, anything
    // worth scanning for. Generated API pages set it to their method.
    sidebarBadge: (data.sidebar_badge ?? data.sidebarBadge ?? '').toString(),
    hasExplicitPosition: rawPosition != null,
    hidden: data.hidden === true,
    draft: data.draft === true,
    showSidebar: data.sidebar !== false,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    sourcePath: relative,
    lastUpdated: git?.date ?? stat.mtime.toISOString(),
    lastAuthor: git?.author ?? null,
    showToc: data.toc !== false,
    headings: rendered.headings,
    html: rendered.html,
    css,
    prev: null,
    next: null,
  };
}

/**
 * Compiles a `.scss` file sitting next to the document and scopes every rule to
 * that page, so page styles can never leak into the rest of the site.
 */
async function compilePageStyles(file, { slug, docsRoot, warn }) {
  const scssPath = file.absolute.replace(/\.[^.]+$/, '.scss');
  let source;
  try {
    source = await fs.readFile(scssPath, 'utf8');
  } catch {
    return '';
  }

  const selector = `[data-doc-slug="${slug}"]`;
  try {
    const result = sass.compileString(scopeScss(source, selector), {
      syntax: 'scss',
      style: 'compressed',
      loadPaths: [path.dirname(scssPath), docsRoot, path.join(paths.root, 'src', 'styles')],
      silenceDeprecations: ['import'],
    });
    return result.css.toString().trim();
  } catch (error) {
    warn(`${path.relative(docsRoot, scssPath)}: ${error.message.split('\n')[0]}`);
    return '';
  }
}

/**
 * Nests a stylesheet inside `selector`. `@use`/`@forward`/`@import` must stay at
 * the top level, so they are hoisted out before wrapping the rest.
 */
function scopeScss(source, selector) {
  const hoisted = [];
  const body = source.replace(/^[ \t]*@(?:use|forward|import)\b[^;]*;[ \t]*$/gm, (line) => {
    hoisted.push(line.trim());
    return '';
  });
  return `${hoisted.join('\n')}\n${selector} {\n${body}\n}\n`;
}

/**
 * docs/index.md          -> ''            (home, no section)
 * docs/start/index.md    -> 'start'       (section landing)
 * docs/start/install.md  -> 'start/install'
 */
function computeSlug(relative, override) {
  const withoutExt = relative.replace(/\.[^.]+$/, '');
  const segments = withoutExt.split('/');
  const dirSlug = segments.slice(0, -1).join('/');
  const isIndex = /^index$/i.test(segments[segments.length - 1]);
  const natural = isIndex ? dirSlug : segments.join('/');

  if (override != null) {
    return { slug: String(override).replace(/^\/+|\/+$/g, ''), dirSlug };
  }
  return { slug: natural, dirSlug };
}

function stripMarkdownH1(content) {
  const match = /^\s*#\s+(.+?)[ \t]*$/m.exec(content);
  if (!match || content.slice(0, match.index).trim() !== '') return { title: '', content };
  return {
    title: match[1].trim(),
    content: content.slice(0, match.index) + content.slice(match.index + match[0].length),
  };
}

function stripHtmlH1(content) {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(content);
  if (!match) return { title: '', content };
  return {
    title: match[1].replace(/<[^>]+>/g, '').trim(),
    content: content.slice(0, match.index) + content.slice(match.index + match[0].length),
  };
}

/** Reads `_category.json` / `_section.json` sidecars, keyed by their folder. */
async function readJsonSidecars(docsRoot, glob) {
  const files = await fg([glob], { cwd: docsRoot, dot: false });
  const map = new Map();
  for (const file of files) {
    const normalised = file.split(path.sep).join('/');
    const dir = path.posix.dirname(normalised);
    try {
      const json = JSON.parse(await fs.readFile(path.join(docsRoot, file), 'utf8'));
      map.set(dir === '.' ? '' : dir, json);
    } catch {
      // A malformed sidecar falls back to conventions rather than failing the build.
    }
  }
  return map;
}

/** One section per top-level folder, each with its own sidebar tree. */
function buildSections(docs, categories, sectionMeta, generatedIndexes = []) {
  const byFolder = new Map();
  for (const doc of docs) {
    if (doc.section === null) continue;
    if (!byFolder.has(doc.section)) byFolder.set(doc.section, []);
    byFolder.get(doc.section).push(doc);
  }

  const sections = [];
  for (const [folder, members] of byFolder) {
    const meta = sectionMeta.get(folder) ?? {};
    const items = buildTree(members, categories, folder, generatedIndexes);
    const order = flattenSidebar(items);
    // The section's own index page is its landing; without one, the first page is.
    const landing = members.find((doc) => doc.slug === folder)?.slug ?? order[0];
    if (landing === undefined) continue;

    sections.push({
      id: folder,
      label: String(meta.label ?? humanize(folder)),
      description: String(meta.description ?? ''),
      position: toNumber(meta.position, 999),
      slug: landing,
      items,
    });
  }

  return sections.sort(
    (a, b) =>
      a.position - b.position || a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** Turns one section's pages into its nested sidebar tree. */
function buildTree(docs, categories, sectionFolder, generatedIndexes = []) {
  const root = { items: [], children: new Map(), indexDoc: null };
  const prefix = `${sectionFolder}/`;

  for (const doc of docs) {
    if (doc.hidden) continue;

    const relative = doc.sourcePath.slice(prefix.length);
    const parts = relative.split('/');
    const segments = parts.slice(0, -1);
    const isIndex = /^index\.[^.]+$/i.test(parts[parts.length - 1]);

    // An index inside a nested folder becomes that category's own link.
    if (isIndex && segments.length > 0) {
      descend(root, segments).indexDoc = doc;
      continue;
    }

    descend(root, segments).items.push({
      type: 'doc',
      slug: doc.slug,
      label: doc.sidebarLabel,
      badge: doc.sidebarBadge || undefined,
      // The section landing sits at the top unless it asks for another spot.
      position: isIndex && !doc.hasExplicitPosition ? -1 : doc.sidebarPosition,
    });
  }

  return serialize(root, sectionFolder);

  function descend(node, segments) {
    let current = node;
    for (const segment of segments) {
      if (!current.children.has(segment)) {
        current.children.set(segment, { items: [], children: new Map(), indexDoc: null });
      }
      current = current.children.get(segment);
    }
    return current;
  }

  function serialize(node, dirPath) {
    const items = [...node.items];

    for (const [segment, child] of node.children) {
      const childPath = `${dirPath}/${segment}`;
      const meta = categories.get(childPath) ?? {};
      const label = (meta.label ?? child.indexDoc?.sidebarLabel ?? humanize(segment)).toString();
      const items_ = serialize(child, childPath);

      // A category with no index.md has nothing to land on: clicking it only
      // expands the sidebar. Claim its folder route and note it, so the caller
      // can give it a page listing what is inside.
      if (child.indexDoc === null && items_.length > 0) {
        generatedIndexes.push({ slug: childPath, label, count: items_.length });
      }

      items.push({
        type: 'category',
        label,
        position: toNumber(meta.position ?? child.indexDoc?.sidebarPosition, 999),
        collapsed: meta.collapsed === true,
        slug: child.indexDoc ? child.indexDoc.slug : childPath,
        items: items_,
      });
    }

    return items.sort(
      (a, b) =>
        a.position - b.position || a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  }
}

/** Depth-first slug order — drives prev/next and keyboard navigation. */
function flattenSidebar(items) {
  const out = [];
  const walk = (list) => {
    for (const item of list) {
      if (item.type === 'doc') out.push(item.slug);
      else {
        if (item.slug != null) out.push(item.slug);
        walk(item.items);
      }
    }
  };
  walk(items);
  return out;
}

/** Prev/next follow sidebar order and never cross a section boundary. */
function linkNeighbours(docs, sections) {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));

  for (const section of sections) {
    const order = flattenSidebar(section.items);
    order.forEach((slug, index) => {
      const doc = bySlug.get(slug);
      if (!doc) return;
      doc.prev = index > 0 ? order[index - 1] : null;
      doc.next = index < order.length - 1 ? order[index + 1] : null;
    });
  }
}

function validateLinks(docs, bySlug, warn) {
  for (const doc of docs) {
    for (const match of doc.html.matchAll(/href="\/([^"#?]*)/g)) {
      const target = match[1].replace(/\/$/, '');
      if (target.startsWith('docs-assets/')) continue;
      // App-owned routes (the content manager, future tools) start with `_`.
      if (target.startsWith('_')) continue;
      if (!bySlug.has(target)) {
        warn(`${doc.sourcePath}: link to "/${target}" does not match any document.`);
      }
    }
  }
}

function humanize(value) {
  return value
    .replace(/^\d+[-_. ]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
