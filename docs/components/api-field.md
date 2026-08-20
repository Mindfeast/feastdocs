---
title: API field
description: Documented options and parameters for API reference pages.
sidebar_position: 4
---

# API field

`<fd-api-field>` documents one option, parameter or property. The description is
the element's content, so inline code and links work inside it.

## Example

```html
<fd-api-field name="sidebar_position" type="number" default="999">
  Sort order among sibling pages, ascending.
</fd-api-field>
<fd-api-field name="slug" type="string">
  Replaces the derived route. See <a href="./index.md">the overview</a>.
</fd-api-field>
<fd-api-field name="title" type="string" required>
  Page heading and browser title.
</fd-api-field>
```

Renders as:

<fd-api-field name="sidebar_position" type="number" default="999">
  Sort order among sibling pages, ascending.
</fd-api-field>
<fd-api-field name="slug" type="string">
  Replaces the derived route. See <a href="./index.md">the overview</a>.
</fd-api-field>
<fd-api-field name="title" type="string" required>
  Page heading and browser title.
</fd-api-field>

## Attributes

<fd-api-field name="name" type="string" required>
  The option's name, shown as code.
</fd-api-field>
<fd-api-field name="type" type="string">
  Type annotation shown next to the name.
</fd-api-field>
<fd-api-field name="default" type="string">
  Default value, shown as <code>default: value</code>.
</fd-api-field>
<fd-api-field name="required" type="boolean" default="false">
  Adds a required badge. Present-as-attribute means true.
</fd-api-field>
