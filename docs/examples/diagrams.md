---
title: Diagrams
description: Mermaid diagrams in Markdown, for projects migrating from other documentation tools.
sidebar_position: 60
---

# Diagrams

Fenced ```` ```mermaid ```` blocks render as diagrams — the same syntax GitHub,
Docusaurus and most other tools use, so an existing project keeps its diagrams
as they are.

## Flowchart

```mermaid
graph TD
  A[Markdown in docs/] --> B{Build}
  B --> C[Generated modules]
  B --> D[Prerendered HTML]
  C --> E[Angular app]
  D --> E
```

## Sequence

```mermaid
sequenceDiagram
  participant Author
  participant Editor as Content manager
  participant GitHub
  Author->>Editor: Edit a page
  Editor->>GitHub: Commit as the signed-in user
  GitHub-->>Editor: New blob SHA
  Editor-->>Author: Published
```

## State

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: open a pull request
  Review --> Draft: changes requested
  Review --> Published: merged
  Published --> [*]
```

:::note
The library is loaded only by pages that contain a diagram, and the source stays
in the page until it renders — so a diagram with a syntax error shows what you
wrote and what Mermaid objected to, instead of disappearing.
:::
