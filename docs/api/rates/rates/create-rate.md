---
title: "Create a rate plan"
description: "POST /rates"
sidebar_label: "Create a rate plan"
sidebar_badge: "POST"
sidebar_position: 2
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="POST"><span class="fd-api-endpoint__method">POST</span><code class="fd-api-endpoint__route">/rates</code></div>

## Request body

**Required.** Content type `application/json`.

```json
{
  "id": "string",
  "name": "string",
  "amount": 0,
  "validFrom": "2026-01-01"
}
```

## Responses

| Status | Description |
| --- | --- |
| `201` | Created. |

### Example response

```json
{
  "id": "string",
  "name": "string",
  "amount": 0,
  "validFrom": "2026-01-01"
}
```

## Try it

```bash
curl -X POST "https://legacy.example.com/api/v1/rates" \
  -H "Content-Type: application/json" \
  -d '{ }'
```
