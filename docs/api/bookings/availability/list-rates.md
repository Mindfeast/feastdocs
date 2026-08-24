---
title: 'List rate plans'
description: 'Superseded by `/availability`, which returns rates inline.'
sidebar_label: 'List rate plans'
sidebar_badge: 'GET'
sidebar_position: 2
---

<!-- AUTO-GENERATED from an OpenAPI document — edits are overwritten. -->

:::warning Deprecated
This endpoint may be removed in a future version.
:::

<div class="fd-api-endpoint" data-method="GET"><span class="fd-api-endpoint__method">GET</span><code class="fd-api-endpoint__route">/rates</code></div>

Superseded by `/availability`, which returns rates inline.

## Responses

| Status | Description |
| ------ | ----------- |
| `200`  | Rate plans. |

## Try it

```bash
curl -X GET "https://api.example.com/v1/rates" \
  -H "Authorization: Bearer $TOKEN"
```
