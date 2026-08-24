import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, Title, type SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { GithubService } from '../../core/github.service';
import { UiStateService } from '../../core/ui-state.service';
import { PAGE_ORDER } from '../../generated/registry';
import { createPreviewRenderer } from './markdown-preview';
import { diffLines, type DiffHunk } from './line-diff';

const LOCAL_API = 'http://127.0.0.1:4271/api';

type Mode = 'local' | 'github';

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; detail: string }
  | { kind: 'error'; message: string };

/** A staged, not-yet-committed change (GitHub mode). `null` content = delete. */
interface Pending {
  readonly kind: 'edit' | 'create' | 'delete';
  readonly content: string | null;
}

/** One hunk in the merge resolver, carrying the author's choice. */
interface ResolveHunk extends DiffHunk {
  choice: 'theirs' | 'mine' | 'both' | null;
}

/** One rendered line of the file tree — a folder or a file. */
interface TreeRow {
  readonly kind: 'folder' | 'file';
  /** Display name: the folder or file name, not the whole path. */
  readonly name: string;
  /** Full path for files; the folder path for folders. */
  readonly path: string;
  readonly depth: number;
  readonly expanded: boolean;
  /** Files that are pages can be dragged to reorder; others cannot. */
  readonly draggable: boolean;
}

// Holds the folders the reader has opened, not the ones they closed: a fresh
// tree should start shut, and an empty set is the only honest way to say that
// before the tree has been walked and the folder paths are even known. The key
// is distinct from the old one so a stored list of *closed* folders from a
// previous version is not read back as a list of open ones.
const FOLDERS_KEY = 'feastdocs:editor-folders-open';
/** Positions are rewritten in tens, leaving room to insert by hand later. */
const POSITION_STEP = 10;

/** Snippets the Insert menu can drop at the cursor. */
const INSERT_SNIPPETS: ReadonlyArray<{ label: string; group: string; text: string }> = [
  { label: 'Note', group: 'Admonitions', text: '\n:::note\nText.\n:::\n' },
  { label: 'Tip', group: 'Admonitions', text: '\n:::tip\nText.\n:::\n' },
  { label: 'Warning', group: 'Admonitions', text: '\n:::warning\nText.\n:::\n' },
  { label: 'Danger', group: 'Admonitions', text: '\n:::danger\nText.\n:::\n' },
  {
    label: 'Code block',
    group: 'Blocks',
    text: '\n```ts title="file.ts"\n// code\n```\n',
  },
  {
    label: 'Table',
    group: 'Blocks',
    text: '\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n',
  },
  {
    label: 'Tabs',
    group: 'Components',
    text: '\n<fd-tabs>\n  <div tab="First">\n\nContent (keep the blank lines).\n\n  </div>\n  <div tab="Second">\n\nContent.\n\n  </div>\n</fd-tabs>\n',
  },
  {
    label: 'Steps',
    group: 'Components',
    text: '\n<fd-steps>\n  <div step="First step">\n\nWhat to do.\n\n  </div>\n  <div step="Second step">\n\nWhat comes next.\n\n  </div>\n</fd-steps>\n',
  },
  {
    label: 'API field',
    group: 'Components',
    text: '\n<fd-api-field name="option" type="string" default="value">\n  What it does.\n</fd-api-field>\n',
  },
  { label: 'Counter', group: 'Components', text: '\n<fd-counter start="0" step="1"></fd-counter>\n' },
  {
    label: 'Expandable',
    group: 'Components',
    text: '\n<fd-expandable title="More detail">\n\nHidden until opened.\n\n</fd-expandable>\n',
  },
  {
    label: 'Columns',
    group: 'Components',
    text: '\n<fd-columns>\n  <div>\n\nLeft.\n\n  </div>\n  <div>\n\nRight.\n\n  </div>\n</fd-columns>\n',
  },
  { label: 'Snippet', group: 'Inline', text: '{{ snippet:name }}' },
  {
    label: 'Changelog',
    group: 'Components',
    text: '\n<fd-changelog limit="20"></fd-changelog>\n',
  },
  {
    label: 'Flowchart',
    group: 'Diagrams',
    text: '\n```mermaid\nflowchart TD\n  A[Start] --> B{Decision}\n  B -->|yes| C[Done]\n  B -->|no| A\n```\n',
  },
  {
    label: 'Sequence',
    group: 'Diagrams',
    text: '\n```mermaid\nsequenceDiagram\n  participant Client\n  participant API\n  Client->>API: Request\n  API-->>Client: Response\n```\n',
  },
  {
    label: 'State machine',
    group: 'Diagrams',
    text: '\n```mermaid\nstateDiagram-v2\n  [*] --> Draft\n  Draft --> Review: submit\n  Review --> Draft: changes requested\n  Review --> Published: approve\n  Published --> [*]\n```\n',
  },
  {
    label: 'Class',
    group: 'Diagrams',
    text: '\n```mermaid\nclassDiagram\n  class Page {\n    +string title\n    +string slug\n    +render()\n  }\n  class Section\n  Section "1" --> "*" Page\n```\n',
  },
  {
    label: 'Entity relationship',
    group: 'Diagrams',
    text: '\n```mermaid\nerDiagram\n  SECTION ||--o{ PAGE : contains\n  PAGE ||--o{ HEADING : has\n  PAGE {\n    string slug\n    string title\n  }\n```\n',
  },
  {
    label: 'Gantt',
    group: 'Diagrams',
    text: '\n```mermaid\ngantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Draft docs   :a1, 2026-01-06, 5d\n  Review       :after a1, 3d\n  section Ship\n  Publish      :2026-01-20, 2d\n```\n',
  },
  {
    label: 'Pie',
    group: 'Diagrams',
    text: '\n```mermaid\npie title Where time goes\n  "Writing" : 45\n  "Reviewing" : 30\n  "Publishing" : 25\n```\n',
  },
  { label: 'Lead paragraph', group: 'Inline', text: '\nOpening paragraph.{.lead}\n' },
  { label: 'Callout line', group: 'Inline', text: '\nImportant line.{.callout}\n' },
  { label: 'Link', group: 'Inline', text: '[text](./page.md)' },
  { label: 'Image', group: 'Inline', text: '![alt text](./image.png)' },
];

/**
 * The content manager (/_editor): browse the docs tree, edit Markdown with a
 * live preview, and publish — without leaving the site.
 *
 * Two backends, matching the two publishing strategies:
 *
 * - **local** — the file API that `npm start` runs (development builds only).
 *   Saves and deletes hit the disk immediately; the author commits and pushes
 *   from their own editor, already authenticated with git.
 * - **github** — for the deployed site. Changes are STAGED locally — edit any
 *   number of files, create and delete — and then published together as ONE
 *   commit on the configured branch, authored by the connected GitHub user.
 */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Editor {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly render = createPreviewRenderer();
  private readonly content = inject(ContentService);
  protected readonly github = inject(GithubService);

  protected readonly localAvailable = signal<boolean | null>(null);
  protected readonly mode = signal<Mode>('local');
  protected readonly files = signal<readonly string[]>([]);
  protected readonly filter = signal('');
  protected readonly selected = signal<string | null>(null);
  protected readonly contentText = signal('');
  protected readonly savedContent = signal('');
  protected readonly status = signal<Status>({ kind: 'idle' });
  protected readonly creating = signal(false);
  protected readonly newPath = signal('');
  /** Path of the chosen template inside _templates/, or '' for a blank page. */
  protected readonly newTemplate = signal('');
  /** The "From template ▾" submenu. */
  protected readonly templateMenuOpen = signal(false);
  protected readonly tokenInput = signal('');
  protected readonly connecting = signal(false);

  /** Staged changes awaiting one batched commit (GitHub mode only). */
  protected readonly pending = signal<ReadonlyMap<string, Pending>>(new Map());
  protected readonly commitMessage = signal('');

  /**
   * Blob SHA each file had when this session last read it — the baseline for
   * conflict detection. Refreshed wholesale on refreshFiles, per file on open.
   */
  private baseShas = new Map<string, string>();
  /** Branch tree from the last conflict check, for "keep mine" resolutions. */
  private latestShas = new Map<string, string>();

  /** Files someone else changed between our read and our commit attempt. */
  protected readonly conflicts = signal<readonly string[]>([]);

  /** The merge resolver, open for one conflicted file at a time. */
  protected readonly resolving = signal<{ path: string; hunks: ResolveHunk[] } | null>(null);
  protected readonly resolveRemaining = computed(
    () => this.resolving()?.hunks.filter((h) => h.kind === 'conflict' && h.choice === null).length ?? 0,
  );

  /** The Insert helper menu. */
  protected readonly insertMenuOpen = signal(false);
  protected readonly insertSnippets = INSERT_SNIPPETS;
  protected readonly insertGroups = [...new Set(INSERT_SNIPPETS.map((s) => s.group))];

  /**
   * Notion-style inline affordance: when the caret rests on an EMPTY line, a
   * small + appears beside it; typing on a non-empty line hides it. `top` is
   * the caret line's offset inside the source pane.
   */
  protected readonly inlineInsertTop = signal<number | null>(null);
  /** Where the open insert menu is anchored: the toolbar or the caret line. */
  protected readonly insertAnchor = signal<'toolbar' | 'inline'>('toolbar');

  private readonly fileList = viewChild<ElementRef<HTMLElement>>('fileList');
  private readonly sourceArea = viewChild<ElementRef<HTMLTextAreaElement>>('source');
  private readonly previewPane = viewChild<ElementRef<HTMLElement>>('previewPane');

  /**
   * Echo guard: setting the follower's scrollTop fires its own scroll event,
   * which must not sync back. The follower is remembered briefly; its next
   * event inside the window is the echo and gets swallowed. Time-based rather
   * than rAF-based on purpose — rAF never fires in hidden tabs.
   */
  private scrollSyncTarget: HTMLElement | null = null;
  private scrollSyncAt = 0;

  /**
   * Keeps source and preview aligned proportionally: scrolling 40% into one
   * pane scrolls 40% into the other. Proportional is an approximation — the
   * rendered page is taller or shorter than its markdown — but it keeps the
   * same region of the document in view on both sides.
   */
  protected syncScroll(from: 'source' | 'preview'): void {
    const source = this.sourceArea()?.nativeElement;
    const preview = this.previewPane()?.nativeElement;
    if (!source || !preview) return;

    const [leader, follower] = from === 'source' ? [source, preview] : [preview, source];

    if (this.scrollSyncTarget === leader && performance.now() - this.scrollSyncAt < 150) {
      return; // the echo of our own programmatic scroll
    }

    const leaderMax = leader.scrollHeight - leader.clientHeight;
    if (leaderMax <= 0) return;

    this.scrollSyncTarget = follower;
    this.scrollSyncAt = performance.now();
    follower.scrollTop =
      (leader.scrollTop / leaderMax) * (follower.scrollHeight - follower.clientHeight);
  }

  /** Recomputes the inline + position from the caret. Cheap; runs per event. */
  protected updateInlineInsert(): void {
    const area = this.sourceArea()?.nativeElement;
    if (!area) return;

    const start = area.selectionStart;
    if (start === null || area.selectionStart !== area.selectionEnd) {
      this.inlineInsertTop.set(null);
      return;
    }

    const before = area.value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = area.value.indexOf('\n', start);
    const line = area.value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (line.trim() !== '') {
      this.inlineInsertTop.set(null);
      if (this.insertAnchor() === 'inline') this.insertMenuOpen.set(false);
      return;
    }

    const style = getComputedStyle(area);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const lineIndex = before.split('\n').length - 1;
    const top = area.offsetTop + paddingTop + lineIndex * lineHeight - area.scrollTop;

    // Hide when the caret line is scrolled out of the visible pane.
    if (top < area.offsetTop - 4 || top > area.offsetTop + area.clientHeight - lineHeight) {
      this.inlineInsertTop.set(null);
      return;
    }
    this.inlineInsertTop.set(Math.round(top));
  }

  /** The inline + opens the same insert menu, anchored at the caret line. */
  protected openInlineInsert(event: Event): void {
    event.preventDefault(); // keep the textarea focused and the caret in place
    this.insertAnchor.set('inline');
    this.insertMenuOpen.set(!this.insertMenuOpen());
  }

  protected openToolbarInsert(): void {
    this.insertAnchor.set('toolbar');
    this.insertMenuOpen.set(!this.insertMenuOpen());
  }

  protected readonly pendingCount = computed(() => this.pending().size);

  protected readonly dirty = computed(() => this.contentText() !== this.savedContent());

  /** Backend files plus staged creations; staged deletions stay listed, struck through. */
  protected readonly visibleFiles = computed(() => {
    const staged = this.pending();
    const all = new Set(this.files());
    for (const [path, change] of staged) {
      if (change.kind === 'create') all.add(path);
    }
    const list = [...all].sort();
    const needle = this.filter().trim().toLowerCase();
    return needle ? list.filter((file) => file.toLowerCase().includes(needle)) : list;
  });

  protected pendingKind(path: string): Pending['kind'] | null {
    return this.pending().get(path)?.kind ?? null;
  }

  // --- File tree -------------------------------------------------------------

  /** Folders the reader has opened, persisted. Everything else stays shut. */
  private readonly expandedFolders = signal<ReadonlySet<string>>(this.readExpandedFolders());
  /** Base order: how the sidebar sorted pages at the last build. */
  private readonly baseOrder = new Map(PAGE_ORDER.map((path, index) => [path, index]));
  /**
   * Order applied by a drag this session. The tree must show the new order
   * immediately, before the rebuild that would refresh PAGE_ORDER.
   */
  private readonly orderOverride = signal<ReadonlyMap<string, number>>(new Map());

  /** Drag state: what is moving, and where it would land. */
  protected readonly dragPath = signal<string | null>(null);
  protected readonly dropTarget = signal<{ path: string; after: boolean } | null>(null);

  /**
   * The file list as a tree. A filter matches the whole path, so typing a
   * folder name keeps everything inside it — and while a filter is on, every
   * folder is drawn open, or the tree would hide the very rows you searched
   * for behind branches you happen to have closed.
   */
  protected readonly tree = computed<readonly TreeRow[]>(() => {
    const files = this.visibleFiles();
    const filtering = this.filter().trim().length > 0;

    interface Node {
      folders: Map<string, Node>;
      files: string[];
    }
    const root: Node = { folders: new Map(), files: [] };
    for (const path of files) {
      const parts = path.split('/');
      let node = root;
      for (const folder of parts.slice(0, -1)) {
        let child = node.folders.get(folder);
        if (!child) {
          child = { folders: new Map(), files: [] };
          node.folders.set(folder, child);
        }
        node = child;
      }
      node.files.push(path);
    }

    const expanded = this.expandedFolders();
    const rows: TreeRow[] = [];
    const walk = (node: Node, prefix: string, depth: number): void => {
      for (const name of [...node.folders.keys()].sort()) {
        const path = prefix ? `${prefix}/${name}` : name;
        const isExpanded = filtering || expanded.has(path);
        rows.push({ kind: 'folder', name, path, depth, expanded: isExpanded, draggable: false });
        if (isExpanded) walk(node.folders.get(name)!, path, depth + 1);
      }
      for (const path of this.sortSiblings(node.files)) {
        rows.push({
          kind: 'file',
          name: path.slice(path.lastIndexOf('/') + 1),
          path,
          depth,
          expanded: false,
          // Dragging reorders siblings, which only means anything against the
          // full list — a filtered tree is showing a subset of them.
          draggable: !filtering && this.isReorderable(path),
        });
      }
    };
    walk(root, '', 0);
    return rows;
  });

  protected toggleFolder(path: string): void {
    this.expandedFolders.update((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      this.persistFolders(next);
      return next;
    });
  }

  /** Sidebar order, with any reorder from this session applied on top. */
  private sortSiblings(paths: readonly string[]): readonly string[] {
    const override = this.orderOverride();
    const rank = (path: string) => override.get(path) ?? this.baseOrder.get(path) ?? Number.MAX_SAFE_INTEGER;
    return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  /**
   * Only pages carry a sidebar position. Stylesheets, templates and a folder's
   * own index page (always first in its sidebar) are not draggable.
   */
  private isReorderable(path: string): boolean {
    if (path.startsWith('_') || !/\.(md|markdown|html)$/i.test(path)) return false;
    return !/(^|\/)index\.[^.]+$/i.test(path);
  }

  private persistFolders(folders: ReadonlySet<string>): void {
    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify([...folders]));
    } catch {
      // Expansion state is a convenience; losing it is not worth surfacing.
    }
  }

  private readExpandedFolders(): ReadonlySet<string> {
    try {
      const stored = localStorage.getItem(FOLDERS_KEY);
      if (stored) return new Set<string>(JSON.parse(stored) as string[]);
    } catch {
      // Unreadable — start fully collapsed, same as a first visit.
    }
    return new Set();
  }

  // --- Drag to reorder -------------------------------------------------------

  protected onDragStart(path: string, event: DragEvent): void {
    this.dragPath.set(path);
    event.dataTransfer?.setData('text/plain', path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onDragOver(path: string, event: DragEvent): void {
    const dragged = this.dragPath();
    if (!dragged || dragged === path || !this.isReorderable(path)) return;
    // Reordering is within one folder; a cross-folder drag would be a move,
    // which also has to rewrite every link to the page.
    if (parentFolder(dragged) !== parentFolder(path)) return;

    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropTarget.set({ path, after: event.clientY > box.top + box.height / 2 });
  }

  protected onDragEnd(): void {
    this.dragPath.set(null);
    this.dropTarget.set(null);
  }

  protected dropHint(path: string): 'before' | 'after' | null {
    const target = this.dropTarget();
    if (!target || target.path !== path) return null;
    return target.after ? 'after' : 'before';
  }

  /**
   * Renumbers the folder's pages in tens and writes `sidebar_position` into
   * each changed page's front matter. Local mode saves them; GitHub mode
   * stages them, so a whole reshuffle lands as one commit.
   */
  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const dragged = this.dragPath();
    const target = this.dropTarget();
    this.onDragEnd();
    if (!dragged || !target) return;

    const folder = parentFolder(dragged);
    const siblings = this.sortSiblings(
      this.visibleFiles().filter((path) => parentFolder(path) === folder && this.isReorderable(path)),
    );

    const next = siblings.filter((path) => path !== dragged);
    const anchor = next.indexOf(target.path);
    if (anchor === -1) return;
    next.splice(target.after ? anchor + 1 : anchor, 0, dragged);
    if (next.join('\n') === siblings.join('\n')) return;

    this.status.set({ kind: 'saving' });
    try {
      // Show the new order at once; the rebuild refreshes PAGE_ORDER later.
      this.orderOverride.update((current) => {
        const map = new Map(current);
        next.forEach((path, index) => map.set(path, index));
        return map;
      });

      let changed = 0;
      for (const [index, path] of next.entries()) {
        const position = (index + 1) * POSITION_STEP;
        const before = await this.readForEdit(path);
        const after = setSidebarPosition(before, position);
        if (after === before) continue;
        changed += 1;

        if (this.mode() === 'local') {
          await firstValueFrom(this.http.put(`${LOCAL_API}/file`, { path, content: after }));
        } else {
          this.stage(path, { kind: 'edit', content: after });
        }
        // Keep the open file in sync, or saving it would undo the reorder.
        if (this.selected() === path) this.applyOpened(path, after);
      }

      if (this.mode() === 'local') {
        await this.refreshFiles();
        this.status.set({
          kind: 'saved',
          detail: `Reordered ${changed} page${changed === 1 ? '' : 's'} — the site rebuilds in a moment`,
        });
      } else {
        this.status.set({
          kind: 'saved',
          detail: `Reordered ${changed} page${changed === 1 ? '' : 's'} — staged, ${this.pendingCount()} change${this.pendingCount() === 1 ? '' : 's'} ready to commit`,
        });
      }
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'Could not reorder the pages') });
    }
  }

  /** Current content of a file: the staged version if any, else the backend. */
  private async readForEdit(path: string): Promise<string> {
    const staged = this.pending().get(path);
    if (staged?.content != null) return staged.content;
    if (this.mode() === 'local') {
      const result = await firstValueFrom(
        this.http.get<{ content: string }>(`${LOCAL_API}/file`, { params: { path } }),
      );
      return result.content;
    }
    const file = await this.github.readFile(this.content.site.docsDir, path);
    this.baseShas.set(path, file.sha); // reading here also refreshes the conflict baseline
    return file.content;
  }

  /**
   * Markdown files inside docs/_templates/ — a single flat folder. Underscore
   * paths never publish, so templates are versioned, editable right here in
   * the editor, and available identically on both backends.
   */
  protected readonly templates = computed(() =>
    this.files().filter(
      (file) => file.startsWith('_templates/') && /\.(md|markdown|html)$/i.test(file),
    ),
  );

  protected templateLabel(path: string): string {
    return humanize(path.slice('_templates/'.length).replace(/\.[^.]+$/, ''));
  }

  /** "+ New": a blank page — the default, no template involved. */
  protected startBlank(): void {
    this.templateMenuOpen.set(false);
    if (this.creating() && !this.newTemplate()) {
      this.creating.set(false);
      return;
    }
    this.newTemplate.set('');
    this.creating.set(true);
  }

  /** A pick in the "From template" submenu opens the create form pre-armed. */
  protected startFromTemplate(template: string): void {
    this.newTemplate.set(template);
    this.templateMenuOpen.set(false);
    this.creating.set(true);
  }

  /** Closes the template and insert submenus on any click outside them. */
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.templateMenuOpen() && !target?.closest('.fd-editor__tpl')) {
      this.templateMenuOpen.set(false);
    }
    // The inline + and its menu count as "inside" — otherwise the click that
    // follows the opening mousedown would close the menu in the same gesture.
    if (
      this.insertMenuOpen() &&
      !target?.closest('.fd-editor__insert, .fd-editor__inlineplus, .fd-editor__insertmenu--inline')
    ) {
      this.insertMenuOpen.set(false);
    }
  }

  /** Drops a snippet at the caret and puts the caret after it. */
  protected insert(snippet: { text: string }): void {
    this.insertMenuOpen.set(false);
    const area = this.sourceArea()?.nativeElement;
    if (!area) return;
    const start = area.selectionStart ?? this.contentText().length;
    const end = area.selectionEnd ?? start;
    const before = this.contentText().slice(0, start);
    const after = this.contentText().slice(end);

    // Block snippets bring their own newlines; avoid piling up blank lines
    // when the caret already sits at a line boundary.
    let text = snippet.text;
    if (text.startsWith('\n') && (before === '' || before.endsWith('\n'))) text = text.slice(1);

    this.contentText.set(before + text + after);
    queueMicrotask(() => {
      area.focus();
      const caret = start + text.length;
      area.setSelectionRange(caret, caret);
      this.updateInlineInsert();
    });
  }

  /** Live preview only makes sense for markdown; other files get a notice. */
  protected readonly isMarkdown = computed(() => /\.(md|markdown)$/i.test(this.selected() ?? ''));

  protected readonly preview = computed<SafeHtml>(() => {
    if (!this.isMarkdown()) return '';
    // The preview shows the author's own file — same trust as the page.
    return this.sanitizer.bypassSecurityTrustHtml(this.render(this.contentText()));
  });

  /** Neither backend reachable/configured — explain instead of a dead UI. */
  protected readonly unavailable = computed(
    () => this.localAvailable() === false && !this.github.isConfigured,
  );

  protected readonly needsConnect = computed(
    () => this.mode() === 'github' && !this.github.isConnected(),
  );

  /**
   * GitHub enforces repo permissions on every API call regardless — this flag
   * only exists so a visitor without write access sees "read-only" up front
   * instead of a failed commit. Local mode is always writable.
   */
  protected readonly readOnly = computed(
    () => this.mode() === 'github' && this.github.canWrite() === false,
  );

  /** True when the site is configured for a real "Sign in with GitHub". */
  protected readonly oauthConfigured = this.content.site.github.oauthClientId !== null;

  constructor() {
    inject(Title).setTitle('Content manager · FeastDocs');
    // Reaching this page retires the navbar's invitation for good.
    inject(UiStateService).markEditorVisited();
    void this.start();

    // Bring the open file into view. Folders start closed and a filter can
    // hide the row entirely, so opening a file has to reveal where it lives —
    // otherwise the tree and the editor disagree about what you are editing.
    // Guarded on the path so a re-render does not fight the reader's scrolling.
    afterRenderEffect(() => {
      const path = this.selected();
      // Read the tree so this re-runs once the row for `path` actually exists.
      this.tree();
      if (path === null || path === this.revealed) return;
      const row = this.fileList()?.nativeElement.querySelector('.fd-editor__file--active');
      if (!row) return;
      this.revealed = path;
      row.scrollIntoView({ block: 'nearest' });
    });

    // Warn about unsaved or uncommitted work when leaving the tab.
    effect((onCleanup) => {
      const risky = this.dirty() || this.pendingCount() > 0;
      const handler = (event: BeforeUnloadEvent) => {
        if (risky) event.preventDefault();
      };
      window.addEventListener('beforeunload', handler);
      onCleanup(() => window.removeEventListener('beforeunload', handler));
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save();
    }
  }

  private async start(): Promise<void> {
    await this.github.restore();
    await this.finishOAuthRedirect();

    // The local file API is a development tool. A production build never
    // probes it — a visitor to the deployed site may well have their own dev
    // server running on 127.0.0.1, and "saving" to their local disk from the
    // live site is exactly the confusion this guard prevents.
    if (isDevMode()) {
      try {
        await firstValueFrom(this.http.get(`${LOCAL_API}/health`));
        this.localAvailable.set(true);
        this.mode.set('local');
      } catch {
        this.localAvailable.set(false);
      }
    } else {
      this.localAvailable.set(false);
    }
    if (!this.localAvailable() && this.github.isConfigured) this.mode.set('github');
    await this.refreshFiles();
  }

  /** Kicks off the OAuth authorization redirect. */
  protected signIn(): void {
    const clientId = this.content.site.github.oauthClientId;
    if (!clientId) return;
    const state = crypto.randomUUID();
    try {
      sessionStorage.setItem('feastdocs:oauth-state', state);
    } catch {
      // Without storage the state check is skipped on return.
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${location.origin}/_editor`,
      scope: this.content.site.github.oauthScope,
      state,
    });
    location.assign(`https://github.com/login/oauth/authorize?${params}`);
  }

  /**
   * Completes the flow when GitHub redirects back with ?code=…&state=…:
   * exchanges the code through the same-origin Pages Function, connects, and
   * cleans the query string so a reload doesn't retry a spent code.
   */
  private async finishOAuthRedirect(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return;

    let expected: string | null = null;
    try {
      expected = sessionStorage.getItem('feastdocs:oauth-state');
      sessionStorage.removeItem('feastdocs:oauth-state');
    } catch {
      // No storage — accept the redirect without the CSRF check.
    }
    history.replaceState(null, '', '/_editor');
    if (expected !== null && params.get('state') !== expected) {
      this.status.set({ kind: 'error', message: 'Sign-in was rejected: state mismatch.' });
      return;
    }

    this.connecting.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<{ token: string }>('/api/oauth/token', { code }),
      );
      await this.github.connect(result.token);
      this.mode.set('github');
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'GitHub sign-in failed.') });
    } finally {
      this.connecting.set(false);
    }
  }

  /** Manual switch between the two strategies when both are usable. */
  protected async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode()) return;
    if (
      (this.dirty() || this.pendingCount() > 0) &&
      !confirm('Discard unsaved and staged changes?')
    ) {
      return;
    }
    this.mode.set(mode);
    this.selected.set(null);
    this.contentText.set('');
    this.savedContent.set('');
    this.pending.set(new Map());
    this.status.set({ kind: 'idle' });
    await this.refreshFiles();
  }

  protected async connect(): Promise<void> {
    const token = this.tokenInput().trim();
    if (!token) return;
    this.connecting.set(true);
    try {
      await this.github.connect(token);
      this.tokenInput.set('');
      await this.refreshFiles();
    } catch {
      this.status.set({
        kind: 'error',
        message: 'GitHub rejected the token. It needs contents read/write on the docs repository.',
      });
    } finally {
      this.connecting.set(false);
    }
  }

  protected disconnect(): void {
    this.github.disconnect();
    this.files.set([]);
    this.selected.set(null);
    this.pending.set(new Map());
  }

  protected async refreshFiles(): Promise<void> {
    try {
      if (this.mode() === 'local' && this.localAvailable()) {
        const result = await firstValueFrom(
          this.http.get<{ files: string[] }>(`${LOCAL_API}/files`),
        );
        this.files.set(result.files);
      } else if (this.mode() === 'github' && this.github.isConnected()) {
        const tree = await this.github.listTree(this.content.site.docsDir);
        this.baseShas = tree;
        this.files.set([...tree.keys()].sort());
      } else {
        return;
      }
      if (!this.selected() && this.files().length > 0) {
        const first = this.files().find((file) => /\.md$/i.test(file)) ?? this.files()[0];
        await this.open(first);
      }
    } catch {
      this.status.set({ kind: 'error', message: 'Could not list the documentation files.' });
    }
  }

  protected async open(path: string): Promise<void> {
    if (this.dirty() && !confirm('Discard unsaved changes in the current file?')) return;

    // A staged edit/creation is the newest version — keep editing it.
    const staged = this.pending().get(path);
    if (staged && staged.content !== null) {
      this.applyOpened(path, staged.content);
      return;
    }

    try {
      if (this.mode() === 'local') {
        const result = await firstValueFrom(
          this.http.get<{ content: string }>(`${LOCAL_API}/file`, { params: { path } }),
        );
        this.applyOpened(path, result.content);
      } else {
        const file = await this.github.readFile(this.content.site.docsDir, path);
        // Opening refreshes the conflict baseline: whatever we just read IS
        // the version our eventual commit is based on.
        this.baseShas.set(path, file.sha);
        this.applyOpened(path, file.content);
      }
    } catch {
      this.status.set({ kind: 'error', message: `Could not open ${path}.` });
    }
  }

  /**
   * Ctrl+S. Local mode writes to disk immediately (the dev loop rebuilds).
   * GitHub mode STAGES the change — nothing is pushed until "Commit".
   */
  protected async save(): Promise<void> {
    const path = this.selected();
    if (!path || !this.dirty()) return;

    if (this.mode() === 'local') {
      this.status.set({ kind: 'saving' });
      try {
        await firstValueFrom(
          this.http.put(`${LOCAL_API}/file`, { path, content: this.contentText() }),
        );
        this.savedContent.set(this.contentText());
        this.status.set({ kind: 'saved', detail: 'Saved — the site rebuilds in a moment' });
      } catch (error) {
        this.status.set({ kind: 'error', message: describe(error, 'Save failed') });
      }
      return;
    }

    if (this.readOnly()) {
      this.status.set({
        kind: 'error',
        message:
          'Sandbox mode — your edits stay in this browser. Publishing needs write access to the repository.',
      });
      return;
    }

    const existing = this.pending().get(path);
    const kind = existing?.kind === 'create' || !this.files().includes(path) ? 'create' : 'edit';
    this.stage(path, { kind, content: this.contentText() });
    this.savedContent.set(this.contentText());
    this.status.set({
      kind: 'saved',
      detail: `Staged — ${this.pendingCount()} change${this.pendingCount() === 1 ? '' : 's'} ready to commit`,
    });
  }

  /** Deletes a file: immediately in local mode, staged in GitHub mode. */
  protected async remove(path: string, event?: Event): Promise<void> {
    event?.stopPropagation();

    if (this.mode() === 'local') {
      if (!confirm(`Delete ${path}?`)) return;
      try {
        await firstValueFrom(this.http.delete(`${LOCAL_API}/file`, { params: { path } }));
        if (this.selected() === path) {
          this.selected.set(null);
          this.contentText.set('');
          this.savedContent.set('');
        }
        await this.refreshFiles();
        this.status.set({ kind: 'saved', detail: `Deleted ${path}` });
      } catch (error) {
        this.status.set({ kind: 'error', message: describe(error, 'Delete failed') });
      }
      return;
    }

    if (this.readOnly()) {
      this.status.set({
        kind: 'error',
        message:
          'Sandbox mode — your edits stay in this browser. Publishing needs write access to the repository.',
      });
      return;
    }

    // Deleting a staged creation just unstages it; deleting a real file stages
    // the deletion for the next commit.
    const staged = this.pending().get(path);
    if (staged?.kind === 'create') {
      this.unstage(path);
    } else {
      this.stage(path, { kind: 'delete', content: null });
    }
    if (this.selected() === path) {
      this.selected.set(null);
      this.contentText.set('');
      this.savedContent.set('');
    }
    this.status.set({
      kind: 'saved',
      detail: `Staged — ${this.pendingCount()} change${this.pendingCount() === 1 ? '' : 's'} ready to commit`,
    });
  }

  /** Takes a staged change back out of the batch. */
  protected unstage(path: string, event?: Event): void {
    event?.stopPropagation();
    const next = new Map(this.pending());
    next.delete(path);
    this.pending.set(next);
  }

  /**
   * Compares every staged change against the branch as it is NOW. A file whose
   * blob SHA moved since we read it was changed by someone else — committing
   * blindly would overwrite their work (the classic lost update).
   */
  private async findConflicts(): Promise<readonly string[]> {
    this.latestShas = await this.github.listTree(this.content.site.docsDir);
    const conflicted: string[] = [];
    for (const [path, change] of this.pending()) {
      const now = this.latestShas.get(path);
      if (change.kind === 'create') {
        // Someone created the same file first.
        if (now !== undefined) conflicted.push(path);
      } else {
        const base = this.baseShas.get(path);
        // Changed upstream (different SHA) or deleted upstream (missing).
        if (now !== base) conflicted.push(path);
      }
    }
    return conflicted;
  }

  /** "Use theirs": drop the staged change and adopt the upstream version. */
  protected async resolveTheirs(path: string): Promise<void> {
    this.unstage(path);
    this.conflicts.set(this.conflicts().filter((c) => c !== path));
    try {
      const file = await this.github.readFile(this.content.site.docsDir, path);
      this.baseShas.set(path, file.sha);
      if (this.selected() === path) this.applyOpened(path, file.content);
    } catch {
      // Deleted upstream: nothing to adopt.
      this.baseShas.delete(path);
      if (this.selected() === path) {
        this.selected.set(null);
        this.contentText.set('');
        this.savedContent.set('');
      }
    }
    await this.refreshFiles();
  }

  /**
   * "Merge…": opens the hunk-by-hunk resolver — theirs and mine diffed line
   * by line, each conflicting hunk resolved as theirs, mine, or both.
   */
  protected async openResolve(path: string): Promise<void> {
    const change = this.pending().get(path);
    const mine = change?.content ?? '';
    let theirs = '';
    try {
      const file = await this.github.readFile(this.content.site.docsDir, path);
      theirs = file.content;
      this.latestShas.set(path, file.sha);
    } catch {
      // Deleted upstream — merging against an empty file still makes sense.
    }
    const hunks: ResolveHunk[] = diffLines(theirs, mine).map((hunk) => ({
      ...hunk,
      choice: null,
    }));
    this.resolving.set({ path, hunks });
  }

  protected chooseHunk(index: number, choice: 'theirs' | 'mine' | 'both'): void {
    const current = this.resolving();
    if (!current) return;
    const hunks = current.hunks.map((hunk, i) => (i === index ? { ...hunk, choice } : hunk));
    this.resolving.set({ ...current, hunks });
  }

  /** Builds the merged file from the choices and stages it as the resolution. */
  protected applyResolve(): void {
    const current = this.resolving();
    if (!current || this.resolveRemaining() > 0) return;

    const pieces: string[] = [];
    for (const hunk of current.hunks) {
      if (hunk.kind === 'same') {
        pieces.push(hunk.same);
        continue;
      }
      const chosen =
        hunk.choice === 'both'
          ? [hunk.theirs, hunk.mine].filter((part) => part !== '').join('\n')
          : hunk.choice === 'theirs'
            ? hunk.theirs
            : hunk.mine;
      if (chosen !== '') pieces.push(chosen);
    }
    const merged = pieces.join('\n');

    const path = current.path;
    const wasCreate = this.pending().get(path)?.kind === 'create';
    const existsUpstream = this.latestShas.get(path) !== undefined;
    this.stage(path, { kind: wasCreate && !existsUpstream ? 'create' : 'edit', content: merged });
    const now = this.latestShas.get(path);
    if (now !== undefined) this.baseShas.set(path, now);
    else this.baseShas.delete(path);
    this.conflicts.set(this.conflicts().filter((c) => c !== path));
    if (this.selected() === path) this.applyOpened(path, merged);
    else this.status.set({ kind: 'saved', detail: `Merged ${path} — staged, ready to commit` });
    this.resolving.set(null);
  }

  protected cancelResolve(): void {
    this.resolving.set(null);
  }

  /** "Keep mine": explicitly overwrite the upstream version with the staged one. */
  protected resolveMine(path: string): void {
    const now = this.latestShas.get(path);
    const change = this.pending().get(path);
    if (change?.kind === 'create' && now !== undefined) {
      // The file exists upstream now — keeping ours means overwriting it.
      this.stage(path, { kind: 'edit', content: change.content });
    }
    if (now !== undefined) this.baseShas.set(path, now);
    else this.baseShas.delete(path);
    this.conflicts.set(this.conflicts().filter((c) => c !== path));
  }

  /** Publishes every staged change as one commit, authored by the signed-in user. */
  protected async commitAll(): Promise<void> {
    if (this.pendingCount() === 0 || this.readOnly()) return;
    this.status.set({ kind: 'saving' });
    try {
      // The branch can move under us at any point; instead of bouncing that
      // back to the user, re-check and rebuild on the new head, a few times.
      for (let attempt = 1; attempt <= 3; attempt++) {
        const conflicted = await this.findConflicts();
        if (conflicted.length > 0) {
          this.conflicts.set(conflicted);
          this.status.set({
            kind: 'error',
            message: `Someone changed ${conflicted.length} of your staged file${conflicted.length === 1 ? '' : 's'} in the meantime — resolve below, then commit again.`,
          });
          return;
        }

        // A staged deletion of a file that is already gone upstream is a
        // no-op — and the tree API rejects the whole commit over it (422).
        // Drop such entries instead of sending them.
        for (const [path, change] of this.pending()) {
          if (change.kind === 'delete' && !this.latestShas.has(path)) this.unstage(path);
        }
        if (this.pendingCount() === 0) {
          this.status.set({
            kind: 'saved',
            detail: 'Nothing left to commit — the staged deletions were already gone upstream.',
          });
          return;
        }

        const changes = [...this.pending()].map(([path, change]) => ({
          path,
          content: change.content,
        }));
        const fallback = `docs: update ${changes.length} file${changes.length === 1 ? '' : 's'}`;

        try {
          await this.github.commitBatch(
            this.content.site.docsDir,
            changes,
            this.commitMessage().trim() || fallback,
          );
        } catch (error) {
          if ((error as { refMoved?: boolean })?.refMoved && attempt < 3) {
            continue; // head moved mid-commit; loop re-checks against the new head
          }
          throw error;
        }

        const count = changes.length;
        this.pending.set(new Map());
        this.commitMessage.set('');
        this.conflicts.set([]);
        await this.refreshFiles();
        const login = this.github.user()?.login ?? 'you';
        this.status.set({
          kind: 'saved',
          detail: `Committed ${count} change${count === 1 ? '' : 's'} to ${this.github.branch} as ${login} — live after the next deploy`,
        });
        return;
      }
      this.status.set({
        kind: 'error',
        message: 'The branch kept moving during three attempts — wait a moment and press Commit again.',
      });
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'Commit failed') });
    }
  }

  protected async create(): Promise<void> {
    if (this.readOnly()) {
      this.status.set({
        kind: 'error',
        message:
          'Sandbox mode — your edits stay in this browser. Publishing needs write access to the repository.',
      });
      return;
    }
    const raw = this.newPath().trim().replace(/^\/+/, '');
    if (!raw) return;
    const path = /\.(md|markdown|html|scss)$/i.test(raw) ? raw : `${raw}.md`;

    // Deepest allowed nesting: a section plus four category levels. The local
    // API enforces the same limit; checking here answers without a request.
    const depth = path.split('/').length - 1;
    if (depth > 5) {
      this.status.set({
        kind: 'error',
        message: `Too deep: ${depth} folders. The maximum is 5 levels (a section plus four category levels).`,
      });
      return;
    }
    if (this.visibleFiles().includes(path) && this.pendingKind(path) !== 'delete') {
      this.status.set({ kind: 'error', message: `${path} already exists.` });
      return;
    }

    const title = humanize(path.split('/').pop()!.replace(/\.[^.]+$/, ''));
    let template = `---\ntitle: ${title}\ndescription: \nsidebar_position: 10\n---\n\n# ${title}\n\nStart writing here.\n`;

    try {
      // "New from template": the chosen _templates/ file becomes the starting
      // content, with {{title}} and {{date}} tokens filled in.
      const from = this.newTemplate();
      if (from) {
        const source =
          this.mode() === 'local'
            ? (
                await firstValueFrom(
                  this.http.get<{ content: string }>(`${LOCAL_API}/file`, {
                    params: { path: from },
                  }),
                )
              ).content
            : (await this.github.readFile(this.content.site.docsDir, from)).content;
        template = source
          .replace(/\{\{\s*title\s*\}\}/g, title)
          .replace(/\{\{\s*date\s*\}\}/g, new Date().toISOString().slice(0, 10));

        // Every page needs its front matter; a template that forgot it still
        // produces a well-formed document.
        if (!template.trimStart().startsWith('---')) {
          template = `---\ntitle: "${title}"\ndescription: \nsidebar_position: 10\n---\n\n${template}`;
        }
      }

      if (this.mode() === 'local') {
        await firstValueFrom(
          this.http.put(`${LOCAL_API}/file`, { path, content: template, ifMissing: true }),
        );
        await this.refreshFiles();
      } else {
        this.stage(path, { kind: 'create', content: template });
      }
      this.creating.set(false);
      this.newPath.set('');
      this.newTemplate.set('');
      await this.open(path);
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'Could not create the file') });
    }
  }

  /** Route of the page being edited, for the "view page" link. */
  protected pageRoute(): string | null {
    const path = this.selected();
    if (!path || !/\.(md|markdown|html)$/i.test(path)) return null;
    const slug = path
      .replace(/\.[^.]+$/, '')
      .replace(/(^|\/)index$/i, '')
      .replace(/\/+$/, '');
    return `/${slug}`;
  }

  private stage(path: string, change: Pending): void {
    const next = new Map(this.pending());
    next.set(path, change);
    this.pending.set(next);
  }

  /** The path the tree was last scrolled to. */
  private revealed: string | null = null;

  /** Opens every folder on the way to a file, so its row is actually drawn. */
  private revealFolders(path: string): void {
    const parts = path.split('/').slice(0, -1);
    if (parts.length === 0) return;
    this.expandedFolders.update((current) => {
      const next = new Set(current);
      let prefix = '';
      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        next.add(prefix);
      }
      if (next.size === current.size) return current;
      this.persistFolders(next);
      return next;
    });
  }

  private applyOpened(path: string, content: string): void {
    this.revealFolders(path);
    this.selected.set(path);
    this.contentText.set(content);
    this.savedContent.set(content);
    this.status.set({ kind: 'idle' });
  }
}

function describe(error: unknown, fallback: string): string {
  const payload = (error as { error?: { error?: string; message?: string } })?.error;
  return payload?.error || payload?.message || fallback;
}

function humanize(value: string): string {
  return value
    .replace(/^\d+[-_. ]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** '' for a file at the docs root, otherwise the folder holding it. */
function parentFolder(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}

/**
 * Rewrites (or inserts) `sidebar_position` in a page's front matter, leaving
 * the rest of the file byte-identical. A page without front matter gets one.
 */
function setSidebarPosition(content: string, position: number): string {
  const line = `sidebar_position: ${position}`;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return `---\n${line}\n---\n\n${content}`;

  const front = match[1];
  const updated = /^sidebar_position\s*:/m.test(front)
    ? front.replace(/^sidebar_position\s*:.*$/m, line)
    : `${front}\n${line}`;
  if (updated === front) return content;
  return `---\n${updated}\n---\n${content.slice(match[0].length)}`;
}
