---
title: Inline
description: The inline snippets from the Insert menu — lead, callout, link, image.
sidebar_position: 5
---

# Inline

Small touches inserted at the cursor. The first two use the `{.class}`
attribute syntax — see [Styling](/guide/styling).

## Lead paragraph

Bigger, calmer opening text — meant for the first paragraph of a page.

```md
Opening paragraph.{.lead}
```

Opening paragraph.{.lead}

## Callout line

A one-line accent bar for the sentence that must not be missed.

```md
Important line.{.callout}
```

Important line.{.callout}

## Link

Relative links to other pages become client-side routes and are validated on
every build.

```md
[text](./index.md)
```

[text](./index.md)

## Image

Keep the image next to the page; the build copies it and rewrites the path.

```md
![alt text](./image.png)
```

*(rendered once the file exists next to the page)*
