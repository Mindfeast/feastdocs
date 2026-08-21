import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import attrs from 'markdown-it-attrs';
import container from 'markdown-it-container';
import taskLists from 'markdown-it-task-lists';
import GithubSlugger from 'github-slugger';
import { createHighlighter, bundledLanguages } from 'shiki';

const ADMONITIONS = {
  note: { label: 'Note', icon: 'info' },
  info: { label: 'Info', icon: 'info' },
  tip: { label: 'Tip', icon: 'tip' },
  success: { label: 'Success', icon: 'check' },
  warning: { label: 'Warning', icon: 'warning' },
  caution: { label: 'Caution', icon: 'warning' },
  danger: { label: 'Danger', icon: 'danger' },
};

const ICONS = {
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 110 2 1 1 0 010-2zm1 8H7V7h2z"/></svg>',
  tip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a5 5 0 00-3 9v2a1 1 0 001 1h4a1 1 0 001-1v-2a5 5 0 00-3-9zM6 14h4v1H6z"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5.2l-4 4.3-2.6-2.4 1-1.1 1.5 1.4 3-3.2z"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l6.5 12H1.5L8 1.5zm-1 4v4h2v-4zm0 5.5v1.5h2V11z"/></svg>',
  danger:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-1 3h2v5H7zm0 6.5h2V12H7z"/></svg>',
};

const DOC_EXTENSIONS = /\.(md|markdown|html)$/i;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ```ts title="src/main.ts" -> { lang: 'ts', title: 'src/main.ts' } */
function parseFenceInfo(info) {
  const trimmed = info.trim();
  if (!trimmed) return { lang: '', title: '' };
  const [lang, ...rest] = trimmed.split(/\s+/);
  const meta = rest.join(' ');
  const title = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  return { lang: lang.toLowerCase(), title: title ? (title[1] ?? title[2] ?? title[3]) : '' };
}

/** Collects every fenced-code language used across the docs, so Shiki only loads those grammars. */
export function collectFenceLanguages(sources) {
  const found = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([A-Za-z0-9_+#.-]+)/gm)) {
      const lang = match[1].toLowerCase();
      if (lang in bundledLanguages) found.add(lang);
    }
  }
  return [...found];
}

/**
 * Builds the markdown renderer.
 *
 * Rendering is stateful by design: `render()` sets the active document context
 * (used to resolve relative links and asset paths) before delegating to
 * markdown-it, and returns the collected headings alongside the HTML.
 */
export async function createRenderer({ langs = [], onWarning = () => {} } = {}) {
  const highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs,
  });
  const loaded = new Set(highlighter.getLoadedLanguages());

  /** @type {{ slug: string, dirSlug: string, sourcePath: string, headings: Array<object>, slugger: GithubSlugger }} */
  let ctx = null;

  const md = new MarkdownIt({
    html: true, // raw HTML in markdown is a first-class feature here
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.use(attrs, { allowedAttributes: ['id', 'class', 'style', 'target', /^data-.*$/] });
  md.use(taskLists, { label: true, labelAfter: true });
  md.use(anchor, {
    level: [1, 2, 3, 4],
    slugify: (title) => ctx.slugger.slug(title),
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '<span aria-hidden="true">#</span>',
      placement: 'after',
      class: 'fd-heading-anchor',
      ariaHidden: false,
    }),
    callback(token, info) {
      const level = Number(token.tag.slice(1));
      // `## Title {data-toc="false"}` keeps the anchor but leaves the sidebar TOC alone.
      if (level >= 2 && level <= 3 && token.attrGet('data-toc') !== 'false') {
        ctx.headings.push({ id: info.slug, text: info.title, level });
      }
    },
  });

  for (const [name, meta] of Object.entries(ADMONITIONS)) {
    md.use(container, name, {
      validate: (params) => params.trim().split(/\s+/, 1)[0] === name,
      render(tokens, idx) {
        const token = tokens[idx];
        if (token.nesting !== 1) return '</div></div>\n';
        const custom = token.info.trim().slice(name.length).trim();
        const title = escapeHtml(custom || meta.label);
        return (
          `<div class="fd-admonition fd-admonition--${name}" role="note">` +
          `<p class="fd-admonition__title">${ICONS[meta.icon]}<span>${title}</span></p>` +
          `<div class="fd-admonition__body">`
        );
      },
    });
  }

  // --- Code fences: highlighted at build time, zero client-side JS ------------
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const { lang, title } = parseFenceInfo(token.info);
    const code = token.content.replace(/\n$/, '');

    // ```mermaid is the convention every other docs tool uses, so diagrams
    // migrate without being rewritten. The source travels inside the element:
    // the component renders it in the browser, and it stays readable as text
    // for crawlers and anyone without JavaScript.
    if (lang === 'mermaid') {
      return `<fd-mermaid><pre class="fd-mermaid__source">${escapeHtml(code)}</pre></fd-mermaid>\n`;
    }

    let resolved = lang;
    if (resolved && !loaded.has(resolved)) {
      if (resolved in bundledLanguages) {
        // createHighlighter pre-loaded every language it found; anything left
        // here came from raw HTML or a late edit, so fall back rather than
        // block the render on an async load.
        onWarning(`Language "${resolved}" was not pre-loaded; rendering as plain text.`);
      }
      resolved = '';
    }

    const highlighted = resolved
      ? highlighter.codeToHtml(code, {
          lang: resolved,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: 'light',
        })
      : `<pre class="shiki fd-code__plain"><code>${escapeHtml(code)}</code></pre>`;

    const header = title ? `<div class="fd-code__title">${escapeHtml(title)}</div>` : '';
    // The copy button ships in the HTML; the app handles clicks by delegation,
    // so it works even when a component re-renders this markup via innerHTML
    // (e.g. fd-tabs panes).
    const copy =
      '<button type="button" class="fd-code__copy" aria-label="Copy code to clipboard">Copy</button>';
    return (
      `<div class="fd-code" data-lang="${escapeHtml(lang || 'text')}">` +
      `${header}${highlighted}${copy}</div>\n`
    );
  };

  // --- Tables get their own scroll container ---------------------------------
  md.renderer.rules.table_open = () => '<div class="fd-table-wrap"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  // --- Links: rewrite relative doc links into app routes ---------------------
  const renderToken = (tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options);
  const defaultLinkOpen = md.renderer.rules.link_open ?? renderToken;

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') ?? '';
    const kind = classifyHref(href);

    if (kind === 'external') {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
      token.attrJoin('class', 'fd-link fd-link--external');
    } else if (kind === 'internal') {
      token.attrSet('href', resolveDocHref(href, ctx, onWarning));
      token.attrJoin('class', 'fd-link');
    } else {
      token.attrJoin('class', 'fd-link');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // --- Images: rewrite relative sources to the copied asset folder -----------
  const defaultImage = md.renderer.rules.image ?? renderToken;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    if (classifyHref(src) === 'internal') {
      token.attrSet('src', resolveAssetHref(src, ctx));
    }
    token.attrSet('loading', 'lazy');
    token.attrJoin('class', 'fd-image');
    return defaultImage(tokens, idx, options, env, self);
  };

  return {
    /**
     * @param {string} source raw markdown
     * @param {{ slug: string, dirSlug: string, sourcePath: string }} doc
     * @returns {{ html: string, headings: Array<{id:string,text:string,level:number}> }}
     */
    render(source, doc) {
      ctx = { ...doc, headings: [], slugger: new GithubSlugger() };
      const html = md.render(source);
      return { html, headings: ctx.headings };
    },

    /** Raw .html pages still get link/asset rewriting, but no markdown parsing. */
    renderHtml(source, doc) {
      ctx = { ...doc, headings: [], slugger: new GithubSlugger() };
      const headings = [];
      const slugger = new GithubSlugger();
      const html = source
        .replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, level, rawAttrs, inner) => {
          const existing = /id=["']([^"']+)["']/.exec(rawAttrs);
          const text = inner.replace(/<[^>]+>/g, '').trim();
          const id = existing ? existing[1] : slugger.slug(text);
          // data-toc="false" keeps the anchor but leaves it out of the TOC —
          // useful for headings that belong to a card or a nested layout.
          if (!/data-toc=["']false["']/i.test(rawAttrs)) {
            headings.push({ id, text, level: Number(level) });
          }
          const withoutId = rawAttrs.replace(/\s*id=["'][^"']*["']/i, '');
          return `<h${level}${withoutId} id="${escapeHtml(id)}">${inner}</h${level}>`;
        })
        .replace(
          /(<(?:a|img|source)\b[^>]*\b(?:href|src)=)["']([^"']+)["']/gi,
          (full, prefix, value) => {
            if (classifyHref(value) !== 'internal') return full;
            const rewritten = DOC_EXTENSIONS.test(value.split('#')[0])
              ? resolveDocHref(value, ctx, onWarning)
              : resolveAssetHref(value, ctx);
            return `${prefix}"${rewritten}"`;
          },
        );
      return { html, headings };
    },
  };
}

function classifyHref(href) {
  if (!href) return 'other';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'other';
  if (href.startsWith('/')) return 'other'; // already an app route or public asset
  return 'internal';
}

/** `./setup.md#step-2` in `guides/index.md` -> `/guides/setup#step-2` */
function resolveDocHref(href, ctx, onWarning) {
  const [rawPath, hash] = splitHash(href);
  if (!rawPath) return href;

  if (!DOC_EXTENSIONS.test(rawPath)) {
    onWarning(
      `${ctx.sourcePath}: relative link "${href}" has no .md/.html extension; treated as an asset.`,
    );
    return resolveAssetHref(href, ctx);
  }

  const joined = joinSlug(ctx.dirSlug, rawPath);
  let slug = joined.replace(DOC_EXTENSIONS, '');
  slug = slug.replace(/(^|\/)index$/i, '');
  return `/${slug}${hash}`;
}

/** `./img/flow.png` in `guides/index.md` -> `/docs-assets/guides/img/flow.png` */
function resolveAssetHref(src, ctx) {
  const [rawPath, hash] = splitHash(src);
  const joined = joinSlug(ctx.dirSlug, rawPath);
  return `/docs-assets/${joined}${hash}`;
}

function splitHash(value) {
  const i = value.indexOf('#');
  return i === -1 ? [value, ''] : [value.slice(0, i), value.slice(i)];
}

/** Resolves `../x` / `./x` against a slug-style directory path. */
function joinSlug(dirSlug, relative) {
  const segments = dirSlug ? dirSlug.split('/') : [];
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}
