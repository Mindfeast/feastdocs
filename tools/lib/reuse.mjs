import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

/**
 * Reusable content, applied to every page before it is rendered.
 *
 * Two things a docs set of any size ends up needing:
 *
 *   {{ product }}                 a value defined once in the config
 *   {{ snippet:install-steps }}   a file in docs/_snippets, included here
 *
 * Both are resolved at build time, so what ships is ordinary HTML — no runtime
 * substitution, nothing for a reader to wait for, and the search index sees the
 * real text rather than the placeholder.
 */
const SNIPPET_DIR = '_snippets';

/** `{{ snippet:name }}`, alone or inline. */
const SNIPPET = /\{\{\s*snippet:([A-Za-z0-9._/-]+)\s*\}\}/g;

/** `{{ name }}` or `{{ a.b }}` — never `{{ snippet:… }}`, matched above. */
const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

/** How deep a snippet may include another before we call it a loop. */
const MAX_DEPTH = 5;

export async function loadSnippets(docsRoot) {
  const dir = path.join(docsRoot, SNIPPET_DIR);
  const files = await fg(['**/*.{md,markdown,html}'], { cwd: dir, dot: false }).catch(() => []);

  const snippets = new Map();
  for (const file of files) {
    const name = file
      .replace(/\.[^.]+$/, '')
      .split(path.sep)
      .join('/');
    snippets.set(name, await fs.readFile(path.join(dir, file), 'utf8'));
  }
  return snippets;
}

/**
 * Expands snippets, then variables. Order matters: a snippet may itself use
 * variables, and a variable value is never re-scanned for snippets — a value
 * from the config is data, not a template.
 */
export function applyReuse(source, { snippets, variables, onWarning, where }) {
  return outsideCode(source, (text) => {
    const expanded = expandSnippets(text, snippets, onWarning, where, 0);
    return expandVariables(expanded, variables, onWarning, where);
  });
}

/** A backtick, built rather than typed: this file is full of nested quoting. */
const TICK = String.fromCharCode(96);

/**
 * Applies a transform to prose only, leaving code exactly as written.
 *
 * Code is full of other people's braces — `${{ secrets.TOKEN }}` in a GitHub
 * Actions sample, `{{ title }}` in a page template this project documents,
 * Angular and Jinja in anything about templating. Substituting there would
 * corrupt examples and warn about variables nobody meant to define.
 */
function outsideCode(source, transform) {
  // Fenced blocks first: they can hold anything, including braces that only
  // look like ours.
  const fence = new RegExp(
    String.raw`^([ \t]*)(` + TICK + String.raw`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$`,
    'gm',
  );
  const inlineCode = new RegExp(TICK + String.raw`[^` + TICK + String.raw`\n]*` + TICK, 'g');
  return splitOn(source, fence, (text) => splitOn(text, inlineCode, transform));
}

/** Runs `transform` over the parts of `text` that `pattern` does not match. */
function splitOn(text, pattern, transform) {
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    out += transform(text.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  return out + transform(text.slice(cursor));
}

function expandSnippets(source, snippets, onWarning, where, depth) {
  if (depth > MAX_DEPTH) {
    onWarning(
      `${where}: snippet nesting deeper than ${MAX_DEPTH} — is a snippet including itself?`,
    );
    return source;
  }
  if (!SNIPPET.test(source)) return source;
  SNIPPET.lastIndex = 0;

  return source.replace(SNIPPET, (match, name) => {
    const body = snippets.get(name);
    if (body === undefined) {
      onWarning(`${where}: no snippet named "${name}" in ${SNIPPET_DIR}/`);
      return match;
    }
    return expandSnippets(body, snippets, onWarning, `${SNIPPET_DIR}/${name}`, depth + 1);
  });
}

function expandVariables(source, variables, onWarning, where) {
  const missing = new Set();

  const out = source.replace(VARIABLE, (match, key) => {
    const value = lookup(variables, key);
    if (value === undefined) {
      missing.add(key);
      // Left as written: a visible {{ typo }} beats silently deleting text.
      return match;
    }
    return String(value);
  });

  if (missing.size > 0) {
    onWarning(
      `${where}: undefined variable${missing.size === 1 ? '' : 's'} ` +
        `${[...missing].map((key) => `{{ ${key} }}`).join(', ')} — add ${missing.size === 1 ? 'it' : 'them'} to \`variables\` in the config`,
    );
  }
  return out;
}

function lookup(variables, key) {
  let current = variables;
  for (const part of key.split('.')) {
    if (current === null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return typeof current === 'object' ? undefined : current;
}
