import { Component, ViewEncapsulation, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../../generated/site-config';

interface RepoCard {
  readonly title: string;
  readonly total: number;
  readonly latest: string | null;
  readonly route: string | null;
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
 * Cards linking to each repository's changelog:
 *
 *   <fd-changelog-repos></fd-changelog-repos>
 *
 * Belongs on the section's landing page when several products share one
 * Changelog section. Each card leads to that repository's own overview, which
 * is where its months live — so the section index stays a way in rather than a
 * second copy of every listing.
 *
 * Renders nothing when the pages are not grouped per repository, since there is
 * then only one changelog and nothing to choose between.
 */
@Component({
  selector: 'fd-changelog-repos-internal',
  imports: [RouterLink],
  templateUrl: './changelog-repos.html',
  styleUrl: './changelog-repos.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocChangelogRepos {
  protected readonly cards = signal<readonly RepoCard[]>([]);
  protected readonly loaded = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const { CHANGELOG, CHANGELOG_BY_REPO, CHANGELOG_SOURCES } =
      await import('../../generated/changelog');

    const { monthlyPages, monthlyPagesDir, groupByRepo } = SITE.changelog;
    const datasets = [
      { id: SELF_ID, commits: CHANGELOG },
      ...Object.entries(CHANGELOG_BY_REPO).map(([id, commits]) => ({ id, commits })),
    ].filter((dataset) => dataset.commits.length > 0);

    // Mirrors the build's decision, so a card never links to a page that the
    // build did not write.
    const grouped = groupByRepo === 'auto' ? datasets.length > 1 : Boolean(groupByRepo);
    if (!monthlyPages || !grouped) {
      this.loaded.set(true);
      return;
    }

    this.cards.set(
      datasets.map((dataset) => {
        const source = CHANGELOG_SOURCES[dataset.id];
        // Commits arrive newest first from both git log and the host APIs.
        const newest = dataset.commits[0]?.date ?? '';
        const month = newest.slice(0, 7);
        return {
          title: source?.title ?? dataset.id,
          total: dataset.commits.length,
          latest: /^\d{4}-\d{2}$/.test(month)
            ? `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
            : null,
          route: `/${monthlyPagesDir}/${source?.slug ?? dataset.id}`,
        };
      }),
    );
    this.loaded.set(true);
  }
}
