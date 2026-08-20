---
title: "Documentation changes"
description: "Commits that touched the docs folder — content updates without the framework noise."
sidebar_position: 20
---

# Documentation changes

The same history, filtered to commits that touched at least one file under
`docs/`. Useful when readers care about what the documentation says, not about
changes to the framework around it.

<fd-changelog docs-only></fd-changelog>

:::tip
`<fd-changelog>` takes two optional attributes: `limit="20"` caps how many
commits are shown, and `docs-only` filters to documentation changes. Drop it on
any page you like — the history is loaded lazily, so pages without it stay
small.
:::
