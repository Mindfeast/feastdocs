---
title: 'API reference from OpenAPI'
description: 'Point the build at an OpenAPI document and get a page per endpoint, kept in step with the spec.'
sidebar_position: 67
---

# API reference from OpenAPI

Point the build at an OpenAPI document and it writes a page per operation,
grouped into a category per tag. The [Bookings API](/api) section on this site is
generated that way — nothing in it is written by hand.

```js title="feastdocs.config.mjs"
openapi: [
  { spec: 'examples/petstore.yaml', outDir: 'api', label: 'Bookings API' },
],
```

| Field | Meaning |
| --- | --- |
| `spec` | Path to the document, relative to the project root. JSON or YAML |
| `outDir` | Folder under `docsDir` to write into. A top-level folder becomes a section |
| `label` | Section name. Defaults to `info.title` from the document |

## Several APIs in one section

Give each spec a **nested** `outDir` and every API becomes a category inside one
section, rather than a top-level tab of its own:

```js title="feastdocs.config.mjs"
openapi: [
  { spec: 'examples/petstore.yaml', outDir: 'api/bookings', label: 'Bookings API' },
  { spec: 'examples/rates-api.json', outDir: 'api/rates', label: 'Rates API' },
],
```

```text
APIs                        ← docs/api/, one section
├── Overview                ← docs/api/index.md, yours
├── Bookings API            ← generated category
│   ├── Reservations
│   └── Availability
└── Rates API               ← generated category
    └── Rates
```

The depth decides the sidecar: a top-level `outDir` gets a `_section.json`, a
nested one gets a `_category.json`, each labelled from the document's title.

Two files are yours to write, and only because they carry your words:

```json title="docs/api/_section.json"
{ "label": "APIs", "description": "Reference for every API.", "position": 50 }
```

```markdown title="docs/api/index.md"
---
title: APIs
sidebar_label: Overview
---

# APIs

<fd-category-index></fd-category-index>
```

`<fd-category-index>` lists the APIs as cards with a page count each, so the
landing page keeps itself up to date as specs are added. Skip it and the section
tab simply opens the first API instead.

The [APIs section](/api) on this site is exactly this: two documents — one
OpenAPI 3, one Swagger 2.0 — under one tab.

## Swagger 2.0 and OpenAPI 3

Both work. A Swagger 2.0 document (`"swagger": "2.0"`, as older .NET and Java
tooling emits) is converted to the OpenAPI 3 shape in memory before anything
reads it, so you do not have to migrate a spec to document it:

| Swagger 2.0 | Becomes |
| --- | --- |
| `host` + `basePath` + `schemes` | `servers`, so the `curl` line has the real host |
| a parameter with `in: body` | the request body, with its schema and example |
| a parameter with `in: formData` | a form-encoded request body |
| `type` / `format` / `enum` on a parameter | that parameter's schema |
| `response.schema` | the response content, so examples are generated |
| `definitions` | resolved in place — `$ref: '#/definitions/X'` needs no rewriting |

## What it generates

```text
docs/api/
├── _section.json                 label, from info.title
├── index.md                      description, servers, endpoint table
├── reservations/                 one folder per tag
│   ├── _category.json
│   ├── list-reservations.md
│   └── create-reservation.md
└── availability/
    └── check-availability.md
```

Each operation page carries the method and route, the description, parameters
grouped by location, the request body with a generated example, a response
table, an example success payload, and a `curl` command.

Because these are ordinary Markdown pages, everything else works on them without
knowing they are special: the sidebar, prev/next, prerendering, the sitemap, and
**search** — a reader can type an endpoint name in the search box and land on it.

## Keeping it in step

The pages are regenerated on every build and pruned when the spec changes.
Remove an endpoint and its page goes:

```text
openapi petstore.yaml: 5 operations, 1 written, 1 removed
```

Only generated files are touched. A page you write inside those folders survives,
as does a `_category.json` you wrote yourself.

:::warning Do not edit generated pages
Every operation page is overwritten on the next build. Prose that belongs with an
endpoint belongs in the spec's `description`, which is where it will also help
anyone reading the API from code.
:::

## What is supported

<fd-columns>
  <div>

**Read from the document**

- `info` — title, version, description
- `servers`
- `tags`, including their order and descriptions
- Path- and operation-level parameters
- Request bodies and response schemas
- Local `$ref` to `components`
- `deprecated`, shown as a warning
- `enum`, `default`, `format`, `example`

  </div>
  <div>

**Not yet**

- Remote `$ref` to another file or URL
- `oneOf` / `anyOf` / `allOf` composition
- Webhooks and callbacks
- Multiple content types per body — the first is used
- An interactive "try it" console; the `curl` command stands in

  </div>
</fd-columns>

Example values follow `format`, so a `date` field shows `2026-01-01` rather than
`string`.

## Generating from a live API

The spec does not have to be committed. Fetch it before the build:

```json title="package.json"
{
  "scripts": {
    "prebuild": "curl -sfo examples/api.yaml https://api.example.com/openapi.yaml"
  }
}
```

A build that cannot read the spec warns and carries on — the rest of the
documentation still publishes.
