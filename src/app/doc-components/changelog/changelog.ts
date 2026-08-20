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

  protected readonly months = signal<readonly Month[]>([]);
  protected readonly loaded = signal(false);
  protected readonly repoUrl =
    SITE.github.repo === null ? null : `https://github.com/${SITE.github.repo}`;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const { CHANGELOG } = await import('../../generated/changelog');
    let entries: readonly ChangelogEntry[] = this.docsOnly
      ? CHANGELOG.filter((entry) => entry.touchesDocs)
      : CHANGELOG;
    if (this.limit > 0) entries = entries.slice(0, this.limit);

    const formatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
    const grouped = new Map<string, ChangelogEntry[]>();
    for (const entry of entries) {
      const label = formatter.format(new Date(entry.date));
      const bucket = grouped.get(label);
      if (bucket) bucket.push(entry);
      else grouped.set(label, [entry]);
    }

    this.months.set([...grouped].map(([label, list]) => ({ label, entries: list })));
    this.loaded.set(true);
  }

  protected day(date: string): string {
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(date));
  }

  protected commitUrl(hash: string): string | null {
    return this.repoUrl === null ? null : `${this.repoUrl}/commit/${hash}`;
  }
}
