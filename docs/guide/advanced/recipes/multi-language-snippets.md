---
title: Multi-language snippets
description: One example, several languages, using fd-tabs.
sidebar_position: 1
---

# Multi-language snippets

When a doc serves readers across languages or tools, put the variants in
[`<fd-tabs>`](/components/tabs) instead of stacking code blocks:

<fd-tabs>
  <div tab="TypeScript">

```ts
const response = await fetch('/api/rates', { method: 'GET' });
```

  </div>
  <div tab="C#">

```csharp
var response = await httpClient.GetAsync("/api/rates");
```

  </div>
  <div tab="curl">

```bash
curl -s https://example.test/api/rates
```

  </div>
</fd-tabs>

The reader picks once and stays oriented; the page stays short.
