// Minimal declarations for markdown-it plugins that ship without types.
// Only what the editor preview uses.

declare module 'markdown-it-container' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginWithParams;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginWithOptions<{ label?: boolean; labelAfter?: boolean }>;
  export default plugin;
}

declare module 'markdown-it-attrs' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginWithOptions<{
    allowedAttributes?: Array<string | RegExp>;
  }>;
  export default plugin;
}
