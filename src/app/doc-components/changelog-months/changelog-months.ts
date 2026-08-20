import { Component, Input, ViewEncapsulation, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../generated/site-config';
import type { ChangelogEntry } from '../../core/models';

interface MonthLink {
  readonly label: string;
  readonly count: number;
  readonly route: string | null;
}

interface YearGroup {
  readonly year: string;
  readonly total: number;
  readonly months: readonly MonthLink[];
}

interface RepoGroup {
  /** Empty when pages are not grouped per repository — one unlabelled group. */
  readonly title: string;
  readonly years: readonly YearGroup[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Reserved id for the repository the docs live in. Matches the build. */
const SELF_ID = 'self';

/**
 * An index of the generated changelog pages — repository, year, month:
 *
 *   <fd-changelog-months></fd-changelog-months>
 *
 * A section's landing page should help a reader find a month, not repeat the
 * commits those pages already list: one history rendered three times is worse
 * for a reader than once, and near-duplicate pages compete with each other in
 * search results.
 *
 * Reads the same lazily-imported history as <fd-changelog>, so it costs nothing
 * on pages that use neither.
 */
@Component({
  selector: 'fd-changelog-months-internal',
  imports: [RouterLink],
  templateUrl: './changelog-months.html',
  styleUrl: './changelog-months.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocChangelogMonths {
  /**
   * Limit the index to one source, as 'self' or a `changelog.repos` id. The
   * generated per-repository pages use it; unset lists every source.
   */
  @Input() repo: string | null = null;

  protected readonly repos = signal<readonly RepoGroup[]>([]);
  protected readonly loaded = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const { CHANGELOG, CHANGELOG_BY_REPO, CHANGELOG_SOURCES } =
      await import('../../generated/changelog');

    const { monthlyPages, monthlyPagesDir, groupByRepo } = SITE.changelog;
    const datasets: Array<{ id: string; commits: readonly ChangelogEntry[] }> = [
      { id: SELF_ID, commits: CHANGELOG },
      ...Object.entries(CHANGELOG_BY_REPO).map(([id, commits]) => ({ id, commits })),
    ]
      .filter((dataset) => dataset.commits.length > 0)
      .filter((dataset) => this.repo === null || dataset.id === this.repo);

    // Mirrors the build's decision, so the links match the pages that exist.
    const grouped = groupByRepo === 'auto' ? datasets.length > 1 : Boolean(groupByRepo);

    this.repos.set(
      datasets.map((dataset) => {
        const source = CHANGELOG_SOURCES[dataset.id];
        const base = !monthlyPages
          ? null
          : grouped
            ? `/${monthlyPagesDir}/${source?.slug ?? dataset.id}`
            : `/${monthlyPagesDir}`;
        return {
          title: grouped && this.repo === null ? (source?.title ?? dataset.id) : '',
          years: this.years(dataset.commits, base),
        };
      }),
    );
    this.loaded.set(true);
  }

  private years(commits: readonly ChangelogEntry[], base: string | null): readonly YearGroup[] {
    // Slice the ISO date rather than parsing it, exactly as the build does when
    // deciding which month page a commit belongs to. Parsing would apply the
    // reader's timezone and could disagree with the page itself.
    const counts = new Map<string, number>();
    for (const entry of commits) {
      const month = entry.date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }

    const grouped = new Map<string, MonthLink[]>();
    for (const month of [...counts.keys()].sort().reverse()) {
      const year = month.slice(0, 4);
      const name = MONTHS[Number(month.slice(5, 7)) - 1];
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year)!.push({
        label: name,
        count: counts.get(month) ?? 0,
        // Without generated pages there is nothing to link to, and the same
        // list still reads as a summary.
        route: base === null ? null : `${base}/${year}/${name.toLowerCase()}`,
      });
    }

    return [...grouped].map(([year, months]) => ({
      year,
      total: months.reduce((sum, month) => sum + month.count, 0),
      months,
    }));
  }
}
