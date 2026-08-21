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

More than one API? Add more entries, each with its own `outDir`.

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
