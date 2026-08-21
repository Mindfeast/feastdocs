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

````markdown
```mermaid
flowchart TD
  A[Markdown in docs/] --> B{Build}
  B --> C[Generated modules]
  B --> D[Prerendered HTML]
  C --> E[Angular app]
  D --> E
```
````

Renders as:

```mermaid
flowchart TD
  A[Markdown in docs/] --> B{Build}
  B --> C[Generated modules]
  B --> D[Prerendered HTML]
  C --> E[Angular app]
  D --> E
```

## Sequence

````markdown
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
````

Renders as:

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

````markdown
```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: open a pull request
  Review --> Draft: changes requested
  Review --> Published: merged
  Published --> [*]
```
````

Renders as:

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: open a pull request
  Review --> Draft: changes requested
  Review --> Published: merged
  Published --> [*]
```

## Class

````markdown
```mermaid
classDiagram
  class Page {
    +string title
    +string slug
    +render()
  }
  class Section {
    +string label
    +number position
  }
  Section "1" --> "*" Page : contains
```
````

Renders as:

```mermaid
classDiagram
  class Page {
    +string title
    +string slug
    +render()
  }
  class Section {
    +string label
    +number position
  }
  Section "1" --> "*" Page : contains
```

## Entity relationship

````markdown
```mermaid
erDiagram
  SECTION ||--o{ PAGE : contains
  PAGE ||--o{ HEADING : has
  PAGE {
    string slug
    string title
    date lastUpdated
  }
```
````

Renders as:

```mermaid
erDiagram
  SECTION ||--o{ PAGE : contains
  PAGE ||--o{ HEADING : has
  PAGE {
    string slug
    string title
    date lastUpdated
  }
```

## Gantt

````markdown
```mermaid
gantt
  title Release plan
  dateFormat YYYY-MM-DD
  section Build
  Draft docs   :a1, 2026-01-06, 5d
  Review       :after a1, 3d
  section Ship
  Publish      :2026-01-20, 2d
```
````

Renders as:

```mermaid
gantt
  title Release plan
  dateFormat YYYY-MM-DD
  section Build
  Draft docs   :a1, 2026-01-06, 5d
  Review       :after a1, 3d
  section Ship
  Publish      :2026-01-20, 2d
```

## Pie

````markdown
```mermaid
pie title Where the time goes
  "Writing" : 45
  "Reviewing" : 30
  "Publishing" : 25
```
````

Renders as:

```mermaid
pie title Where the time goes
  "Writing" : 45
  "Reviewing" : 30
  "Publishing" : 25
```

## When a diagram will not parse

Mermaid is strict. Rather than breaking the page or vanishing, a diagram it
cannot read shows your source and its complaint:

````markdown
```mermaid
flowchart TD
  A --> B
  this line is not valid mermaid
```
````

Renders as:

```mermaid
flowchart TD
  A --> B
  this line is not valid mermaid
```

:::note
The library is loaded only by pages that contain a diagram, and the source stays
in the page until it renders — so a diagram with a syntax error shows what you
wrote and what Mermaid objected to, instead of disappearing.
:::
