import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, ROOT } from './lib/config.mjs';
import { collectDocs } from './lib/collect.mjs';
import { dim, green, red, yellow } from './lib/log.mjs';

/**
 * Post-build prerender: writes one static index.html per page into the build
 * output, with the article HTML baked in and full SEO metadata (title,
 * description, canonical, Open Graph, Twitter card), plus sitemap.xml and
 * robots.txt.
 *
 * No SSR involved — the SPA shell is reused as-is and the content is placed
 * inside <app-root>, so crawlers and no-JS readers get the real page while
 * Angular replaces it with the interactive app the moment it boots.
 *
 * Runs as part of `npm run build`, after `ng build`.
 */
const DIST = path.join(ROOT, 'dist', 'feastdocs', 'browser');

const config = await loadConfig();
const shellPath = path.join(DIST, 'index.html');

let shell;
try {
  shell = await fs.readFile(shellPath, 'utf8');
} catch {
  console.error(`${red('✗')} prerender: ${path.relative(ROOT, shellPath)} not found — run ng build first.`);
  process.exit(1);
}

if (!config.siteUrl) {
  console.log(
    `${yellow('!')} prerender skipped: set ${dim('siteUrl')} in feastdocs.config.mjs ` +
      `(e.g. 'https://docs.example.com') to enable SEO output.`,
  );
  process.exit(0);
}

const siteUrl = config.siteUrl.replace(/\/+$/, '');
const { docs } = await collectDocs(config);

let pages = 0;
for (const doc of docs) {
  const html = renderPage(shell, doc, config, siteUrl);
  const target =
    doc.slug === '' ? shellPath : path.join(DIST, ...doc.slug.split('/'), 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html, 'utf8');
  pages += 1;
}

// Sitemap: public, navigable pages only — hidden pages stay reachable but unlisted.
const sitemapEntries = docs
  .filter((doc) => !doc.hidden)
  .map(
    (doc) =>
      `  <url><loc>${escapeXml(doc.slug === '' ? `${siteUrl}/` : `${siteUrl}/${doc.slug}`)}</loc>` +
      `<lastmod>${doc.lastUpdated.slice(0, 10)}</lastmod></url>`,
  )
  .join('\n');
await fs.writeFile(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`,
  'utf8',
);

await fs.writeFile(
  path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /_editor\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  'utf8',
);

console.log(`${green('✓')} prerendered ${pages} pages, sitemap.xml, robots.txt ${dim(`→ ${path.relative(ROOT, DIST)}`)}`);

function renderPage(shell, doc, config, siteUrl) {
  const title = doc.slug === '' ? config.title : `${doc.title} · ${config.title}`;
  const description = doc.description || config.tagline;
  const url = doc.slug === '' ? `${siteUrl}/` : `${siteUrl}/${doc.slug}`;

  const meta = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:site_name" content="${escapeAttr(config.title)}" />`,
  ];

  // Without an image, a shared link renders as a bare text card on LinkedIn,
  // Slack and X. With one, the large-summary layout applies.
  if (config.socialImage) {
    const image = `${siteUrl}/${String(config.socialImage).replace(/^\/+/, '')}`;
    meta.push(
      `<meta property="og:image" content="${escapeAttr(image)}" />`,
      `<meta property="og:image:alt" content="${escapeAttr(config.title)}" />`,
      `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
  } else {
    meta.push(`<meta name="twitter:card" content="summary" />`);
  }

  const metaTags = meta.join('\n    ');

  // The static article inherits the shipped stylesheet (fd-markdown etc.), so
  // even the no-JS rendering is presentable. Angular clears it on bootstrap.
  const article =
    `<main class="fd-prerender" style="max-width:820px;margin:0 auto;padding:2rem 1.5rem">` +
    `<article class="fd-doc"><h1>${escapeHtml(doc.title)}</h1>` +
    (doc.description ? `<p>${escapeHtml(doc.description)}</p>` : '') +
    `<div class="fd-markdown">${doc.html}</div></article></main>`;

  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta name="description"[^>]*\/?>/,
      `<meta name="description" content="${escapeAttr(description)}" />`,
    )
    .replace('</head>', `    ${metaTags}\n  </head>`)
    .replace(/<app-root><\/app-root>/, `<app-root>${article}</app-root>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeAttr(value).replace(/'/g, '&apos;');
}
