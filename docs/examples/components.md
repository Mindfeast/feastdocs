---
title: Components
description: The Angular doc components the Insert menu can drop into a page, live.
sidebar_position: 4
---

# Components

These are live Angular components — the [Components](/components) section
documents each in depth; here is exactly what the Insert menu gives you.

## Tabs

The blank lines around pane content are load-bearing: without them Markdown
inside the panes stays literal text.

```html
<fd-tabs>
  <div tab="First">

Content (keep the blank lines).

  </div>
  <div tab="Second">

Content.

  </div>
</fd-tabs>
```

<fd-tabs>
  <div tab="First">

Content (keep the blank lines).

  </div>
  <div tab="Second">

Content.

  </div>
</fd-tabs>

## Steps

```html
<fd-steps>
  <div step="First step">

What to do.

  </div>
  <div step="Second step">

What comes next.

  </div>
</fd-steps>
```

<fd-steps>
  <div step="First step">

What to do.

  </div>
  <div step="Second step">

What comes next.

  </div>
</fd-steps>

## API field

```html
<fd-api-field name="option" type="string" default="value">
  What it does.
</fd-api-field>
```

<fd-api-field name="option" type="string" default="value">
  What it does.
</fd-api-field>

## Counter

A minimal proof of live state — click it.

```html
<fd-counter start="0" step="1"></fd-counter>
```

<fd-counter start="0" step="1"></fd-counter>
