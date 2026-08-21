---
title: "Check availability"
description: "Rooms bookable for a date range, with nightly rates."
sidebar_label: "Check availability"
sidebar_badge: "GET"
sidebar_position: 1
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="GET"><span class="fd-api-endpoint__method">GET</span><code class="fd-api-endpoint__route">/availability</code></div>

Rooms bookable for a date range, with nightly rates.

## Query parameters

<fd-api-field name="from" type="string (date)" required>
  First night.
</fd-api-field>
<fd-api-field name="to" type="string (date)" required>
  Checkout date.
</fd-api-field>

## Responses

| Status | Description |
| --- | --- |
| `200` | Available rooms. |

### Example response

```json
[
  {
    "roomType": "string",
    "available": 0,
    "nightlyRate": 0
  }
]
```

## Try it

```bash
curl -X GET "https://api.example.com/v1/availability" \
  -H "Authorization: Bearer $TOKEN"
```
