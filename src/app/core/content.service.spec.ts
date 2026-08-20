import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';

describe('ContentService', () => {
  let content: ContentService;

  beforeEach(() => {
    content = TestBed.configureTestingModule({}).inject(ContentService);
  });

  describe('toSlug', () => {
    it('strips the leading slash, query and fragment', () => {
      expect(content.toSlug('/guide/markdown')).toBe('guide/markdown');
      expect(content.toSlug('/guide/markdown#tables')).toBe('guide/markdown');
      expect(content.toSlug('/guide/markdown?x=1')).toBe('guide/markdown');
      expect(content.toSlug('/guide/markdown/')).toBe('guide/markdown');
    });

    it('maps the root URL to the empty slug', () => {
      expect(content.toSlug('/')).toBe('');
    });

    it('decodes percent-escapes so a URL-encoded path still resolves', () => {
      expect(content.toSlug('/guide/html%2Dpages')).toBe('guide/html-pages');
    });
  });

  describe('generated registry', () => {
    it('knows which routes exist', () => {
      expect(content.exists('guide/installation')).toBe(true);
      expect(content.exists('nope/missing')).toBe(false);
    });

    it('does not mistake inherited object properties for pages', () => {
      expect(content.exists('constructor')).toBe(false);
      expect(content.exists('toString')).toBe(false);
    });

    it('loads a page and caches it', async () => {
      const first = await content.load('guide/installation');
      const second = await content.load('guide/installation');

      expect(first?.slug).toBe('guide/installation');
      expect(first?.html.length).toBeGreaterThan(0);
      expect(second).toBe(first);
    });

    it('resolves to null for an unknown slug rather than throwing', async () => {
      await expect(content.load('nope/missing')).resolves.toBeNull();
    });
  });

  describe('sections', () => {
    it('derives sections from top-level folders, positioned ones first in order', () => {
      const ids = content.sections.map((s) => s.id);
      // The built-in sections have explicit positions 1..3; anything an author
      // adds without a _section.json sorts after them. Assert the invariant,
      // not the exact folder list.
      expect(ids.indexOf('guide')).toBe(0);
      expect(ids.indexOf('reference')).toBe(1);
      expect(ids.indexOf('components')).toBe(2);
    });

    it('resolves the section of a page', () => {
      expect(content.sectionOf('guide/markdown')?.label).toBe('Guide');
      expect(content.sectionOf('reference/cli')?.label).toBe('Reference');
    });

    it('gives root-level pages no section', () => {
      expect(content.sectionOf('')).toBeUndefined();
    });
  });

  describe('breadcrumbs', () => {
    it('is empty for a page at the root of its section', () => {
      expect(content.breadcrumbs('guide/markdown')).toEqual([]);
    });
  });
});
