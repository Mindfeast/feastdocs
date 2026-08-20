---
title: Hidden pages
description: Publishing a page without putting it in the navigation.
sidebar_position: 2
---

# Hidden pages

Set `hidden: true` in the front matter and the page keeps its URL and stays in
search, but leaves the sidebar and the navbar dropdown. Useful for pages that are
reached from inside another page — long appendices, changelogs, one-off guides
you link to directly.

```md
---
title: Migration appendix
hidden: true
---
```

For a page that should not exist at all yet, use `draft: true` instead — drafts
are excluded from the build entirely.
