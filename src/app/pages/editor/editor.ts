import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, Title, type SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { GithubService } from '../../core/github.service';
import { createPreviewRenderer } from './markdown-preview';

const LOCAL_API = 'http://127.0.0.1:4271/api';

type Mode = 'local' | 'github';

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; detail: string }
  | { kind: 'error'; message: string };

/**
 * The content manager (/_editor): browse the docs tree, edit Markdown with a
 * live preview, save, and create pages — without leaving the site.
 *
 * Two backends, matching the two publishing strategies:
 *
 * - **local** — the file API that `npm start` runs. Saves write to disk; the
 *   author commits and pushes from their own editor/terminal, already
 *   authenticated with git.
 * - **github** — the GitHub contents API, for editing on the deployed site.
 *   Every save is a commit on the configured branch, authored by the
 *   connected GitHub user, so attribution flows into the "last updated by"
 *   footer on the next build.
 */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
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
  protected readonly tokenInput = signal('');
  protected readonly connecting = signal(false);

  /** Blob SHA of the opened file — the contents API needs it to update. */
  private currentSha: string | null = null;

  protected readonly dirty = computed(() => this.contentText() !== this.savedContent());

  protected readonly visibleFiles = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const files = this.files();
    return needle ? files.filter((file) => file.toLowerCase().includes(needle)) : files;
  });

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

  constructor() {
    inject(Title).setTitle('Content manager · FeastDocs');
    void this.start();

    // Warn about unsaved work when leaving the tab or closing the window.
    effect((onCleanup) => {
      const dirty = this.dirty();
      const handler = (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
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
    try {
      await firstValueFrom(this.http.get(`${LOCAL_API}/health`));
      this.localAvailable.set(true);
      this.mode.set('local');
    } catch {
      this.localAvailable.set(false);
      if (this.github.isConfigured) this.mode.set('github');
    }
    await this.refreshFiles();
  }

  /** Manual switch between the two strategies when both are usable. */
  protected async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode()) return;
    if (this.dirty() && !confirm('Discard unsaved changes?')) return;
    this.mode.set(mode);
    this.selected.set(null);
    this.contentText.set('');
    this.savedContent.set('');
    this.currentSha = null;
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
  }

  protected async refreshFiles(): Promise<void> {
    try {
      if (this.mode() === 'local' && this.localAvailable()) {
        const result = await firstValueFrom(
          this.http.get<{ files: string[] }>(`${LOCAL_API}/files`),
        );
        this.files.set(result.files);
      } else if (this.mode() === 'github' && this.github.isConnected()) {
        this.files.set(await this.github.listFiles(this.content.site.docsDir));
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
    if (this.dirty() && !confirm('Discard unsaved changes?')) return;
    try {
      if (this.mode() === 'local') {
        const result = await firstValueFrom(
          this.http.get<{ content: string }>(`${LOCAL_API}/file`, { params: { path } }),
        );
        this.currentSha = null;
        this.applyOpened(path, result.content);
      } else {
        const file = await this.github.readFile(this.content.site.docsDir, path);
        this.currentSha = file.sha;
        this.applyOpened(path, file.content);
      }
    } catch {
      this.status.set({ kind: 'error', message: `Could not open ${path}.` });
    }
  }

  protected async save(): Promise<void> {
    const path = this.selected();
    if (!path || !this.dirty()) return;
    if (this.readOnly()) {
      this.status.set({
        kind: 'error',
        message: 'Read-only: your GitHub account has no write access to this repository.',
      });
      return;
    }
    this.status.set({ kind: 'saving' });
    try {
      if (this.mode() === 'local') {
        await firstValueFrom(
          this.http.put(`${LOCAL_API}/file`, { path, content: this.contentText() }),
        );
        this.savedContent.set(this.contentText());
        this.status.set({ kind: 'saved', detail: 'Saved — the site rebuilds in a moment' });
      } else {
        this.currentSha = await this.github.writeFile(
          this.content.site.docsDir,
          path,
          this.contentText(),
          { sha: this.currentSha ?? undefined },
        );
        this.savedContent.set(this.contentText());
        const login = this.github.user()?.login ?? 'you';
        this.status.set({
          kind: 'saved',
          detail: `Committed to ${this.github.branch} as ${login} — live after the next deploy`,
        });
      }
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'Save failed') });
    }
  }

  protected async create(): Promise<void> {
    if (this.readOnly()) {
      this.status.set({
        kind: 'error',
        message: 'Read-only: your GitHub account has no write access to this repository.',
      });
      return;
    }
    const raw = this.newPath().trim().replace(/^\/+/, '');
    if (!raw) return;
    const path = /\.(md|markdown|html|scss)$/i.test(raw) ? raw : `${raw}.md`;

    // Deepest allowed nesting: section / category / sub-category. The local
    // API enforces the same limit; checking here answers without a request.
    const depth = path.split('/').length - 1;
    if (depth > 3) {
      this.status.set({
        kind: 'error',
        message: `Too deep: ${depth} folders. The maximum is 3 levels (section/category/sub-category).`,
      });
      return;
    }

    const title = humanize(path.split('/').pop()!.replace(/\.[^.]+$/, ''));
    const template = `---\ntitle: ${title}\ndescription: \nsidebar_position: 10\n---\n\n# ${title}\n\nStart writing here.\n`;

    try {
      if (this.mode() === 'local') {
        await firstValueFrom(
          this.http.put(`${LOCAL_API}/file`, { path, content: template, ifMissing: true }),
        );
      } else {
        if (this.files().includes(path)) {
          this.status.set({ kind: 'error', message: `${path} already exists.` });
          return;
        }
        await this.github.writeFile(this.content.site.docsDir, path, template, {
          message: `docs: add ${path}`,
        });
      }
      this.creating.set(false);
      this.newPath.set('');
      this.selected.set(null);
      await this.refreshFiles();
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

  private applyOpened(path: string, content: string): void {
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
