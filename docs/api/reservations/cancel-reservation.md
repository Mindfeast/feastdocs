---
title: "Cancel a reservation"
description: "Cancellation is permanent. A cancelled reservation stays readable."
sidebar_label: "Cancel a reservation"
sidebar_position: 4
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

<div class="fd-api-endpoint" data-method="DELETE"><span class="fd-api-endpoint__method">DELETE</span><code class="fd-api-endpoint__route">/reservations/{id}</code></div>

Cancellation is permanent. A cancelled reservation stays readable.

## Path parameters

<fd-api-field name="id" type="string" required>
  Reservation identifier.
</fd-api-field>

## Responses

| Status | Description |
| --- | --- |
| `204` | Cancelled. |

## Try it

```bash
curl -X DELETE "https://api.example.com/v1/reservations/{id}" \
  -H "Authorization: Bearer $TOKEN"
```
