---
title: "Get a reservation"
description: "GET /reservations/{id}"
sidebar_label: "Get a reservation"
sidebar_badge: "GET"
sidebar_position: 3
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="GET"><span class="fd-api-endpoint__method">GET</span><code class="fd-api-endpoint__route">/reservations/{id}</code></div>

## Path parameters

<fd-api-field name="id" type="string" required>
  Reservation identifier.
</fd-api-field>

## Responses

| Status | Description |
| --- | --- |
| `200` | The reservation. |
| `404` | No such reservation. |

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
curl -X GET "https://api.example.com/v1/reservations/{id}" \
  -H "Authorization: Bearer $TOKEN"
```
