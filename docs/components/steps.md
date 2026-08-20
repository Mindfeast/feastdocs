---
title: Steps
description: Numbered tutorial steps with a connector line.
sidebar_position: 3
---

# Steps

`<fd-steps>` turns its children into a numbered sequence. Each step is a `div` with
a `step` attribute carrying its title.

## Example

```html
<fd-steps>
  <div step="Create the file">

  Markdown works inside a step — blank lines around it, as always.

  </div>
  <div step="Save">

  The watcher re-renders and the browser reloads.

  </div>
</fd-steps>
```

Renders as:

<fd-steps>
  <div step="Create the file">

Markdown works inside a step — blank lines around it, as always. Code too:

```bash
npm run docs:new -- guide/deploying "Deploying"
```

  </div>
  <div step="Save">

The watcher re-renders and the browser reloads.

  </div>
  <div step="Ship it">

:::tip
Steps can contain admonitions and other doc components — the component decorates
the authored DOM in place instead of re-rendering it.
:::

  </div>
</fd-steps>
