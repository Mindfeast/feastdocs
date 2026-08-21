---
title: "Create a reservation"
description: "Books a room for a date range. The range is half-open — checkout is not counted."
sidebar_label: "Create a reservation"
sidebar_badge: "POST"
sidebar_position: 2
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="POST"><span class="fd-api-endpoint__method">POST</span><code class="fd-api-endpoint__route">/reservations</code></div>

Books a room for a date range. The range is half-open — checkout is not counted.

## Request body

**Required.** Content type `application/json`.

```json
{
  "guestName": "string",
  "checkIn": "2026-01-01",
  "checkOut": "2026-01-01",
  "roomType": "string"
}
```

## Responses

| Status | Description |
| --- | --- |
| `201` | Created. |
| `409` | No availability for that range. |

### Example response

```json
{
  "id": "res_8f21",
  "status": "confirmed",
  "guestName": "string",
  "checkIn": "2026-01-01",
  "checkOut": "2026-01-01",
  "total": 0
}
```

## Try it

```bash
curl -X POST "https://api.example.com/v1/reservations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ }'
```
