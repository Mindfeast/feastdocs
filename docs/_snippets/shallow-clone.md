:::info Shallow checkouts are handled for you
Author attribution and `<fd-changelog>` both read `git log`, so they need real
history. Several hosts clone with `--depth 1` — Cloudflare Pages does, and so
does any CI step missing `fetch-depth: 0`.

The build handles it: it deepens a shallow checkout before reading anything, and
where that is impossible — no credentials in the checkout, an offline build — it
reads the history from the host's API instead. Set `GITHUB_TOKEN` (or
`AZURE_DEVOPS_PAT`) in the build environment for a private repository.

Checking out with full depth in your own pipeline is still the cheapest path:
`fetch-depth: 0` on GitHub Actions, `fetchDepth: 0` on Azure Pipelines.
:::
 