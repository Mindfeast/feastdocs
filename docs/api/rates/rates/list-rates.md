---
title: "List rate plans"
description: "GET /rates"
sidebar_label: "List rate plans"
sidebar_badge: "GET"
sidebar_position: 1
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="GET"><span class="fd-api-endpoint__method">GET</span><code class="fd-api-endpoint__route">/rates</code></div>

## Query parameters

<fd-api-field name="propertyId" type="string" required>
  Property to query.
</fd-api-field>

## Responses

| Status | Description |
| --- | --- |
| `200` | Rate plans. |

### Example response

```json
[
  {
    "id": "string",
    "name": "string",
    "amount": 0,
    "validFrom": "2026-01-01"
  }
]
```

## Try it

```bash
curl -X GET "https://legacy.example.com/api/v1/rates"
```
