import {
  Component,
  Input,
  ViewEncapsulation,
  booleanAttribute,
  numberAttribute,
  signal,
} from '@angular/core';
import { SITE } from '../../generated/site-config';
import type { ChangelogEntry } from '../../core/models';

/** Reserved id for the repository the docs live in. Matches the build. */
const SELF_ID = 'self';

interface Month {
  readonly label: string;
  readonly entries: readonly ChangelogEntry[];
}

/**
 * Repository history, grouped by month:
 *
 *   <fd-changelog limit="40" docs-only></fd-changelog>
 *
 * The commit data is collected at build time (tools/lib/changelog.mjs) and
 * imported lazily, so a page without a changelog never downloads it.
 */
@Component({
  selector: 'fd-changelog-internal',
  templateUrl: './changelog.html',
  styleUrl: './changelog.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocChangelog {
  /** Cap the number of commits shown; 0 or unset means all of them. */
  @Input({ transform: numberAttribute }) limit = 0;
  /** Only commits that touched the docs folder — content updates, not code. */
  @Input({ alias: 'docs-only', transform: booleanAttribute }) docsOnly = false;
  /**
   * Another repository's history, as 'owner/name'. It must be listed in
   * `changelog.repos` so the build collects it. Unset means this repository.
   */
  @Input() repo: string | null = null;
  /**
   * A single month, as 'YYYY-MM'. The generated month pages use this; grouping
   * headings are dropped since the page heading already names the month.
   */
  @Input() month: string | null = null;

  protected readonly months = signal<readonly Month[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly commitUrlBase = signal<string | null>(
    SITE.github.repo === null ? null : `https://github.com/${SITE.github.repo}/commit/`,
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const { CHANGELOG, CHANGELOG_BY_REPO, CHANGELOG_SOURCES } =
      await import('../../generated/changelog');

    let source: readonly ChangelogEntry[];
    // 'self' is the reserved id for the repository the docs live in; the
    // generated pages use it so every page states its source explicitly.
    if (this.repo === null || this.repo === SELF_ID) {
      source = CHANGELOG;
      this.commitUrlBase.set(CHANGELOG_SOURCES[SELF_ID]?.commitUrl ?? this.commitUrlBase());
    } else {
      const collected = CHANGELOG_BY_REPO[this.repo];
      // Each source knows its own host, so Azure DevOps commits link to Azure.
      this.commitUrlBase.set(CHANGELOG_SOURCES[this.repo]?.commitUrl ?? null);
      if (collected === undefined) {
        // An authoring mistake, not a runtime failure — say which repo and how
        // to fix it rather than rendering an empty page.
        this.error.set(
          `No history collected for "${this.repo}". Add it to changelog.repos in the site config.`,
        );
        this.loaded.set(true);
        return;
      }
      source = collected;
    }

    let entries: readonly ChangelogEntry[] = this.docsOnly
      ? source.filter((entry) => entry.touchesDocs !== false)
      : source;
    if (this.month !== null) {
      // Compare the ISO prefix rather than parsing: a Date would reinterpret
      // the commit's own offset in the reader's timezone and could move a
      // commit into a neighbouring month. The build slices it the same way.
      const prefix = this.month;
      entries = entries.filter((entry) => entry.date.startsWith(prefix));
    }
    if (this.limit > 0) entries = entries.slice(0, this.limit);

    const formatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
    const grouped = new Map<string, ChangelogEntry[]>();
    for (const entry of entries) {
      const label = formatter.format(new Date(entry.date));
      const bucket = grouped.get(label);
      if (bucket) bucket.push(entry);
      else grouped.set(label, [entry]);
    }

    this.months.set(
      this.month === null
        ? [...grouped].map(([label, list]) => ({ label, entries: list }))
        : [{ label: '', entries }],
    );
    this.loaded.set(true);
  }

  protected day(date: string): string {
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(date));
  }

  protected commitUrl(hash: string): string | null {
    const base = this.commitUrlBase();
    return base === null ? null : `${base}${hash}`;
  }
}
