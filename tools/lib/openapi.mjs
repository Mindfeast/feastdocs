import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { paths } from './config.mjs';
import { dim, yellow } from './log.mjs';

/**
 * Turns an OpenAPI document into documentation pages — one per operation,
 * grouped into a category per tag.
 *
 * The pages are ordinary Markdown written into the docs folder, exactly like
 * the changelog's. That is the whole trick: the sidebar, search, prev/next,
 * prerendering and the sitemap need no special cases, and a reader can search
 * for an endpoint by name and land on it.
 *
 * Regenerated on every build and pruned when the spec changes, so an endpoint
 * removed from the API stops being documented.
 */
const MARKER = '<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

export async function writeOpenApiPages(config) {
  const specs = config.openapi ?? [];
  if (specs.length === 0) return;

  for (const entry of specs) {
    const spec = typeof entry === 'string' ? { spec: entry } : entry;
    if (!spec.spec || !spec.outDir) {
      console.warn(
        `  ${yellow('!')} openapi: an entry needs both ${dim('spec')} and ${dim('outDir')} — skipped`,
      );
      continue;
    }
    await generate(config, spec);
  }
}

async function generate(config, { spec: specPath, outDir, label }) {
  const source = path.isAbsolute(specPath) ? specPath : path.join(paths.root, specPath);

  let document;
  try {
    const raw = await fs.readFile(source, 'utf8');
    document = /\.ya?ml$/i.test(source) ? YAML.parse(raw) : JSON.parse(raw);
  } catch (error) {
    // A missing or broken spec must not fail the build: the rest of the docs
    // are still publishable, and the warning says exactly what to fix.
    console.warn(`  ${yellow('!')} openapi ${specPath}: ${error.message}`);
    return;
  }

  // A Swagger 2.0 document describes the same API in a different shape. Convert
  // once, here, so nothing downstream has to know which version it came from.
  if (String(document.swagger ?? '').startsWith('2')) document = fromSwagger2(document);

  const root = path.join(paths.docs(config), outDir);
  const operations = collectOperations(document);
  if (operations.length === 0) {
    console.warn(`  ${yellow('!')} openapi ${specPath}: no operations found`);
    return;
  }

  const expected = new Set();
  let written = 0;

  // A tag becomes a category; operations without one share a default.
  const byTag = new Map();
  for (const operation of operations) {
    const tag = operation.tag;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(operation);
  }

  await fs.mkdir(root, { recursive: true });

  // Without this the folder names itself — "Api" rather than whatever the
  // document calls itself. Which sidecar depends on depth: a top-level outDir
  // is a section, a nested one is a category, and only the matching file is
  // read. Nesting several specs under one folder is how a site groups APIs.
  const title = label ?? document.info?.title ?? 'API';
  const nested = outDir.includes('/');
  written += await write(
    path.join(root, nested ? '_category.json' : '_section.json'),
    expected,
    `${JSON.stringify(
      {
        label: title,
        description: oneLine(document.info?.description),
        position: 50,
        generated: true,
      },
      null,
      2,
    )}
`,
  );

  written += await write(
    path.join(root, 'index.md'),
    expected,
    overviewPage(document, title, operations),
  );

  const tagOrder = tagPositions(document, [...byTag.keys()]);
  for (const [tag, group] of byTag) {
    const dir = path.join(root, slug(tag));
    await fs.mkdir(dir, { recursive: true });

    written += await write(
      path.join(dir, '_category.json'),
      expected,
      `${JSON.stringify(
        {
          label: tag,
          position: tagOrder.get(tag) ?? 999,
          generated: true,
        },
        null,
        2,
      )}\n`,
    );

    for (const [index, operation] of group.entries()) {
      const file = path.join(dir, `${slug(operation.id)}.md`);
      written += await write(file, expected, operationPage(operation, document, index));
    }
  }

  const pruned = await prune(root, expected);
  console.log(
    `  ${dim(`openapi ${path.basename(specPath)}: ${operations.length} operations, ${written} written, ${pruned} removed`)}`,
  );
}

/**
 * Rewrites a Swagger 2.0 document into the OpenAPI 3 shape this generator
 * reads. Only the parts that actually differ are touched:
 *
 *   host + basePath + schemes  ->  servers
 *   parameter with in: body    ->  requestBody
 *   type/format on a parameter ->  parameter.schema
 *   response.schema            ->  response.content[type].schema
 *
 * `definitions` is left where it is: local $refs are resolved by walking the
 * pointer, so `#/definitions/Rate` needs no rewriting.
 */
function fromSwagger2(document) {
  const out = { ...document };

  if (!out.servers && document.host) {
    const schemes = document.schemes?.length ? document.schemes : ['https'];
    out.servers = schemes.map((scheme) => ({
      url: `${scheme}://${document.host}${document.basePath ?? ''}`,
    }));
  }

  const consumes = document.consumes?.[0] ?? 'application/json';
  const produces = document.produces?.[0] ?? 'application/json';

  out.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).map(([route, item]) => {
      if (item === null || typeof item !== 'object') return [route, item];
      const converted = { ...item };

      for (const method of METHODS) {
        const operation = item[method];
        if (!operation || typeof operation !== 'object') continue;

        const parameters = [];
        let requestBody = operation.requestBody;

        for (const parameter of operation.parameters ?? []) {
          if (parameter?.in === 'body') {
            requestBody = {
              required: parameter.required === true,
              description: parameter.description,
              content: { [consumes]: { schema: parameter.schema } },
            };
            continue;
          }
          if (parameter?.in === 'formData') {
            const existing = requestBody?.content?.['application/x-www-form-urlencoded']
              ?.schema ?? {
              type: 'object',
              properties: {},
            };
            existing.properties[parameter.name] = pickSchema(parameter);
            if (parameter.required)
              existing.required = [...(existing.required ?? []), parameter.name];
            requestBody = {
              required: true,
              content: { 'application/x-www-form-urlencoded': { schema: existing } },
            };
            continue;
          }
          parameters.push(
            parameter?.schema ? parameter : { ...parameter, schema: pickSchema(parameter) },
          );
        }

        converted[method] = {
          ...operation,
          parameters,
          ...(requestBody ? { requestBody } : {}),
          responses: Object.fromEntries(
            Object.entries(operation.responses ?? {}).map(([code, response]) => [
              code,
              response?.schema
                ? { ...response, content: { [produces]: { schema: response.schema } } }
                : response,
            ]),
          ),
        };
      }

      return [route, converted];
    }),
  );

  return out;
}

/** The schema fields Swagger 2.0 puts directly on a parameter. */
function pickSchema(parameter) {
  const schema = {};
  for (const key of [
    'type',
    'format',
    'enum',
    'default',
    'items',
    'minimum',
    'maximum',
    'pattern',
  ]) {
    if (parameter?.[key] !== undefined) schema[key] = parameter[key];
  }
  return Object.keys(schema).length > 0 ? schema : { type: 'string' };
}

/** Flattens paths × methods into a list, resolving shared path parameters. */
function collectOperations(document) {
  const operations = [];
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    if (item === null || typeof item !== 'object') continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];

    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== 'object') continue;

      operations.push({
        route,
        method: method.toUpperCase(),
        tag: operation.tags?.[0] ?? 'Endpoints',
        id: operation.operationId ?? `${method}-${route}`,
        summary: operation.summary ?? `${method.toUpperCase()} ${route}`,
        description: operation.description ?? '',
        deprecated: operation.deprecated === true,
        parameters: [...shared, ...(operation.parameters ?? [])].map((p) => resolve(p, document)),
        requestBody: resolve(operation.requestBody, document),
        responses: operation.responses ?? {},
        security: operation.security ?? document.security ?? [],
      });
    }
  }
  return operations;
}

/** Follows a local $ref one level; remote refs are left alone. */
function resolve(node, document) {
  if (!node || typeof node !== 'object') return node;
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;

  let current = document;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !(key in current)) return node;
    current = current[key];
  }
  return current;
}

function overviewPage(document, label, operations) {
  const info = document.info ?? {};
  const servers = (document.servers ?? []).map(
    (s) => `- \`${s.url}\`${s.description ? ` — ${s.description}` : ''}`,
  );

  return (
    frontMatter({
      title: label,
      description: oneLine(info.description) || `${operations.length} endpoints.`,
      sidebar_label: 'Overview',
    }) +
    `${MARKER}\n\n` +
    (info.description ? `${info.description}\n\n` : '') +
    (info.version ? `**Version ${info.version}**\n\n` : '') +
    (servers.length > 0 ? `## Servers\n\n${servers.join('\n')}\n\n` : '') +
    `## Endpoints\n\n` +
    `| | Endpoint | |\n| --- | --- | --- |\n` +
    operations
      .map(
        (o) =>
          `| \`${o.method}\` | \`${o.route}\` | ${o.summary}${o.deprecated ? ' _(deprecated)_' : ''} |`,
      )
      .join('\n') +
    '\n'
  );
}

function operationPage(operation, document, index) {
  const sections = [];

  if (operation.deprecated) {
    sections.push(
      ':::warning Deprecated\nThis endpoint may be removed in a future version.\n:::\n',
    );
  }

  sections.push(
    `<div class="fd-api-endpoint" data-method="${operation.method}">` +
      `<span class="fd-api-endpoint__method">${operation.method}</span>` +
      `<code class="fd-api-endpoint__route">${escapeHtml(operation.route)}</code>` +
      `</div>\n`,
  );

  if (operation.description) sections.push(`${operation.description}\n`);

  const params = operation.parameters.filter(Boolean);
  for (const where of ['path', 'query', 'header', 'cookie']) {
    const group = params.filter((p) => p.in === where);
    if (group.length === 0) continue;
    sections.push(
      `## ${where[0].toUpperCase()}${where.slice(1)} parameters\n\n` +
        group
          .map(
            (p) =>
              `<fd-api-field name="${escapeAttr(p.name)}" type="${escapeAttr(typeOf(p.schema))}"` +
              `${p.required ? ' required' : ''}` +
              `${p.schema?.default !== undefined ? ` default="${escapeAttr(String(p.schema.default))}"` : ''}>\n` +
              `  ${escapeHtml(oneLine(p.description) || '—')}\n` +
              `</fd-api-field>`,
          )
          .join('\n') +
        '\n',
    );
  }

  const body = operation.requestBody;
  if (body?.content) {
    const [type, media] = Object.entries(body.content)[0] ?? [];
    const schema = resolve(media?.schema, document);
    sections.push(
      `## Request body\n\n` +
        `${body.required ? '**Required.** ' : ''}Content type \`${type}\`.\n\n` +
        fenced('json', sample(schema, document)),
    );
  }

  const responses = Object.entries(operation.responses);
  if (responses.length > 0) {
    sections.push(
      `## Responses\n\n| Status | Description |\n| --- | --- |\n` +
        responses
          .map(([code, response]) => {
            const resolved = resolve(response, document);
            return `| \`${code}\` | ${oneLine(resolved?.description) || '—'} |`;
          })
          .join('\n') +
        '\n',
    );

    const success = responses.find(([code]) => code.startsWith('2'));
    const media = success && Object.values(resolve(success[1], document)?.content ?? {})[0];
    if (media?.schema) {
      sections.push(
        `### Example response\n\n` +
          fenced('json', sample(resolve(media.schema, document), document)),
      );
    }
  }

  const server = document.servers?.[0]?.url ?? 'https://api.example.com';
  sections.push(
    `## Try it\n\n` +
      fenced(
        'bash',
        `curl -X ${operation.method} "${server}${operation.route}"` +
          (operation.security.length > 0 ? ` \\\n  -H "Authorization: Bearer $TOKEN"` : '') +
          (body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '{ }'` : ''),
      ),
  );

  return (
    frontMatter({
      title: operation.summary,
      description: oneLine(operation.description) || `${operation.method} ${operation.route}`,
      sidebar_label: operation.summary,
      // The method in the sidebar makes an API section scannable: a reader
      // looking for the delete endpoint spots it without reading labels.
      sidebar_badge: operation.method,
      sidebar_position: index + 1,
    }) +
    `${MARKER}\n\n` +
    sections.join('\n')
  );
}

/** A small, readable example built from a schema — not a validator. */
function sample(schema, document, depth = 0) {
  const node = resolve(schema, document);
  if (!node || typeof node !== 'object' || depth > 4) return '{}';
  return JSON.stringify(build(node, document, depth), null, 2);
}

function build(schema, document, depth) {
  const node = resolve(schema, document);
  if (!node || typeof node !== 'object' || depth > 4) return null;
  if (node.example !== undefined) return node.example;
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];

  const type = node.type ?? (node.properties ? 'object' : undefined);
  switch (type) {
    case 'object': {
      const out = {};
      for (const [key, value] of Object.entries(node.properties ?? {})) {
        out[key] = build(value, document, depth + 1);
      }
      return out;
    }
    case 'array':
      return [build(node.items, document, depth + 1)];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      // A sample is only useful if it looks like the real thing, and `format`
      // is where a spec says what the real thing looks like.
      return (
        {
          'date-time': '2026-01-01T00:00:00Z',
          date: '2026-01-01',
          email: 'name@example.com',
          uuid: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
          uri: 'https://example.com',
          password: '••••••••',
        }[node.format] ?? 'string'
      );
    default:
      return null;
  }
}

function typeOf(schema) {
  if (!schema || typeof schema !== 'object') return 'string';
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`;
  return schema.format ? `${schema.type} (${schema.format})` : (schema.type ?? 'object');
}

/** Tags declared on the document keep their order; the rest fall in behind. */
function tagPositions(document, used) {
  const positions = new Map();
  (document.tags ?? []).forEach((tag, index) => {
    if (tag?.name) positions.set(tag.name, index + 1);
  });
  used.forEach((tag) => {
    if (!positions.has(tag)) positions.set(tag, 500 + used.indexOf(tag));
  });
  return positions;
}

function frontMatter(fields) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) =>
      typeof value === 'number' ? `${key}: ${value}` : `${key}: ${JSON.stringify(String(value))}`,
    );
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function fenced(lang, body) {
  const tick = String.fromCharCode(96).repeat(3);
  return `${tick}${lang}\n${body}\n${tick}\n`;
}

function oneLine(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return (
    String(value)
      .replace(/\{([^}]*)\}/g, 'by-$1')
      // operationIds are conventionally camelCase; a route reads far better as
      // check-availability than checkavailability.
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  );
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

async function write(file, expected, contents) {
  expected.add(file);
  const existing = await fs.readFile(file, 'utf8').catch(() => null);
  if (existing === contents) return 0;
  await fs.writeFile(file, contents, 'utf8');
  return 1;
}

/** Removes generated pages this run did not produce; leaves anything else. */
async function prune(root, expected) {
  let pruned = 0;
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        const left = await fs.readdir(full).catch(() => ['keep']);
        if (left.length === 0) await fs.rmdir(full).catch(() => {});
        continue;
      }
      if (expected.has(full)) continue;

      const raw = await fs.readFile(full, 'utf8').catch(() => '');
      const ours = entry.name === '_category.json' ? isGenerated(raw) : raw.includes(MARKER);
      if (!ours) continue;
      await fs.rm(full, { force: true });
      pruned += 1;
    }
  };
  await walk(root);
  return pruned;
}

function isGenerated(raw) {
  try {
    return JSON.parse(raw || '{}').generated === true;
  } catch {
    return false;
  }
}
