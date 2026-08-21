---
title: "List reservations"
description: "Returns reservations for the authenticated property, newest first."
sidebar_label: "List reservations"
sidebar_position: 1
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="GET"><span class="fd-api-endpoint__method">GET</span><code class="fd-api-endpoint__route">/reservations</code></div>

Returns reservations for the authenticated property, newest first.

## Query parameters

<fd-api-field name="status" type="string">
  Only reservations in this state.
</fd-api-field>
<fd-api-field name="limit" type="integer" default="25">
  How many to return.
</fd-api-field>

## Responses

| Status | Description |
| --- | --- |
| `200` | A page of reservations. |
| `401` | Missing or invalid token. |

### Example response

```json
{
  "data": [
    {
      "id": "res_8f21",
      "status": "confirmed",
      "guestName": "string",
      "checkIn": "2026-01-01",
      "checkOut": "2026-01-01",
      "total": 0
    }
  ],
  "total": 0
}
```

## Try it

```bash
curl -X GET "https://api.example.com/v1/reservations" \
  -H "Authorization: Bearer $TOKEN"
```
