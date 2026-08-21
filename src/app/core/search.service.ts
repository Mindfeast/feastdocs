import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SearchHit, SearchRecord } from './models';

const MAX_RESULTS = 30;
const SNIPPET_RADIUS = 90;

/** Field weights — a heading match should beat a body match comfortably. */
const WEIGHT = { heading: 6, page: 3, text: 1 } as const;

/**
 * Client-side search over the build-time index. The index is one request,
 * fetched the first time the dialog opens and then kept in memory.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly isLoading = signal(false);
  readonly failed = signal(false);

  private readonly records = signal<readonly SearchRecord[] | null>(null);
  private request: Promise<void> | null = null;

  /**
   * Which version to search. Set by the shell as the reader moves around; on an
   * unversioned site it stays '' and matches every record.
   */
  readonly version = signal('');

  readonly results = computed<readonly SearchHit[]>(() => {
    const all = this.records();
    const terms = tokenize(this.query());
    if (!all || terms.length === 0) return [];
    // Results from another version would send a v1 reader into v2 without
    // saying so, which is worse than finding nothing.
    const version = this.version();
    const records = all.filter((record) => (record.version ?? '') === version);
    return rank(records, terms, this.query().trim().toLowerCase());
  });

  readonly isEmpty = computed(
    () => this.query().trim().length > 0 && !this.isLoading() && this.results().length === 0,
  );

  open(): void {
    this.isOpen.set(true);
    void this.loadIndex();
  }

  close(): void {
    this.isOpen.set(false);
    this.query.set('');
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  /** Fetches the index once; concurrent callers share the same request. */
  private loadIndex(): Promise<void> {
    if (this.records() !== null) return Promise.resolve();
    if (this.request) return this.request;

    this.isLoading.set(true);
    this.failed.set(false);
    this.request = firstValueFrom(this.http.get<SearchRecord[]>('search-index.json'))
      .then((records) => this.records.set(records))
      .catch(() => this.failed.set(true))
      .finally(() => {
        this.isLoading.set(false);
        this.request = null;
      });
    return this.request;
  }
}

function tokenize(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 1);
}

function rank(
  records: readonly SearchRecord[],
  terms: readonly string[],
  phrase: string,
): readonly SearchHit[] {
  const hits: SearchHit[] = [];

  for (const record of records) {
    const heading = record.heading.toLowerCase();
    const page = record.page.toLowerCase();
    const text = record.text.toLowerCase();

    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const termScore =
        fieldScore(heading, term) * WEIGHT.heading +
        fieldScore(page, term) * WEIGHT.page +
        fieldScore(text, term) * WEIGHT.text;
      if (termScore === 0) {
        matchedAll = false;
        break;
      }
      score += termScore;
    }
    if (!matchedAll) continue;

    // Reward an exact phrase so multi-word queries surface the right section.
    if (phrase.length > 2) {
      if (heading.includes(phrase)) score += 12;
      else if (text.includes(phrase)) score += 6;
    }

    hits.push({
      slug: record.slug,
      anchor: record.anchor,
      section: record.section,
      page: record.page,
      heading: record.heading,
      score,
      snippet: buildSnippet(record.text, terms),
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

/** 0 = no match, 1 = substring, 2 = starts a word — cheap relevance signal. */
function fieldScore(haystack: string, term: string): number {
  const index = haystack.indexOf(term);
  if (index === -1) return 0;
  const before = index === 0 ? '' : haystack[index - 1];
  return before === '' || /[^\p{L}\p{N}]/u.test(before) ? 2 : 1;
}

function buildSnippet(text: string, terms: readonly string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const first = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  const start = first === undefined ? 0 : Math.max(0, first - SNIPPET_RADIUS);
  const end = Math.min(text.length, start + SNIPPET_RADIUS * 2);
  const slice = text.slice(start, end);
  const escaped = escapeHtml(slice);
  const highlighted = terms.reduce(
    (acc, term) => acc.replace(new RegExp(escapeRegExp(escapeHtml(term)), 'gi'), '<mark>$&</mark>'),
    escaped,
  );

  return `${start > 0 ? '…' : ''}${highlighted}${end < text.length ? '…' : ''}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
