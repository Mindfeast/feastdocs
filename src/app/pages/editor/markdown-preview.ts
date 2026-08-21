import MarkdownIt from 'markdown-it';
// The plugins ship no type definitions; see src/types/markdown-plugins.d.ts.
import container from 'markdown-it-container';
import taskLists from 'markdown-it-task-lists';
import attrs from 'markdown-it-attrs';

const ADMONITIONS = ['note', 'info', 'tip', 'success', 'warning', 'caution', 'danger'] as const;

/**
 * Client-side preview renderer for the content manager.
 *
 * This intentionally approximates the build pipeline rather than duplicating
 * it: same admonitions, tables, task lists and attributes, but no Shiki
 * highlighting (code renders as plain monospace) and no link/asset rewriting.
 * The authoritative render is still the build — the preview is for writing.
 */
export function createPreviewRenderer(): (source: string) => string {
  const md = new MarkdownIt({ html: true, linkify: true });
  md.use(attrs);
  md.use(taskLists, { label: true });

  for (const name of ADMONITIONS) {
    md.use(container, name, {
      render(tokens: { nesting: number; info: string }[], idx: number) {
        const token = tokens[idx];
        if (token.nesting !== 1) return '</div></div>\n';
        const custom = token.info.trim().slice(name.length).trim();
        const title = escapeHtml(custom || name[0].toUpperCase() + name.slice(1));
        return (
          `<div class="fd-admonition fd-admonition--${name}" role="note">` +
          `<p class="fd-admonition__title"><span>${title}</span></p>` +
          `<div class="fd-admonition__body">`
        );
      },
    });
  }

  md.renderer.rules['fence'] = (tokens, idx) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/, 1)[0] ?? '';
    // Same handling as the build renderer, so the preview shows the diagram an
    // author will actually publish rather than its source.
    if (lang === 'mermaid') {
      return (
        `<fd-mermaid><pre class="fd-mermaid__source">` +
        `${escapeHtml(token.content.replace(/\n$/, ''))}</pre></fd-mermaid>\n`
      );
    }
    const title = /title=(?:"([^"]*)"|'([^']*)')/.exec(token.info);
    const header = title
      ? `<div class="fd-code__title">${escapeHtml(title[1] ?? title[2])}</div>`
      : '';
    return (
      `<div class="fd-code" data-lang="${escapeHtml(lang || 'text')}">${header}` +
      `<pre class="shiki fd-code__plain"><code>${escapeHtml(token.content.replace(/\n$/, ''))}</code></pre></div>\n`
    );
  };

  md.renderer.rules['table_open'] = () => '<div class="fd-table-wrap"><table>';
  md.renderer.rules['table_close'] = () => '</table></div>';

  return (source) => md.render(stripFrontmatter(source));
}

/** The preview renders the body only; front matter stays visible in the editor. */
export function stripFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
