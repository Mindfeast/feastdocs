import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, isDevMode, signal } from '@angular/core';
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

/** A staged, not-yet-committed change (GitHub mode). `null` content = delete. */
interface Pending {
  readonly kind: 'edit' | 'create' | 'delete';
  readonly content: string | null;
}

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

  /** Staged changes awaiting one batched commit (GitHub mode only). */
  protected readonly pending = signal<ReadonlyMap<string, Pending>>(new Map());
  protected readonly commitMessage = signal('');

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
    void this.start();

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
      scope: 'repo',
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
        message: 'Read-only: your GitHub account has no write access to this repository.',
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
        message: 'Read-only: your GitHub account has no write access to this repository.',
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

  /** Publishes every staged change as one commit, authored by the signed-in user. */
  protected async commitAll(): Promise<void> {
    if (this.pendingCount() === 0 || this.readOnly()) return;
    this.status.set({ kind: 'saving' });
    try {
      const changes = [...this.pending()].map(([path, change]) => ({
        path,
        content: change.content,
      }));
      const fallback = `docs: update ${changes.length} file${changes.length === 1 ? '' : 's'}`;
      await this.github.commitBatch(
        this.content.site.docsDir,
        changes,
        this.commitMessage().trim() || fallback,
      );
      const count = changes.length;
      this.pending.set(new Map());
      this.commitMessage.set('');
      await this.refreshFiles();
      const login = this.github.user()?.login ?? 'you';
      this.status.set({
        kind: 'saved',
        detail: `Committed ${count} change${count === 1 ? '' : 's'} to ${this.github.branch} as ${login} — live after the next deploy`,
      });
    } catch (error) {
      this.status.set({ kind: 'error', message: describe(error, 'Commit failed') });
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
    if (this.visibleFiles().includes(path) && this.pendingKind(path) !== 'delete') {
      this.status.set({ kind: 'error', message: `${path} already exists.` });
      return;
    }

    const title = humanize(path.split('/').pop()!.replace(/\.[^.]+$/, ''));
    const template = `---\ntitle: ${title}\ndescription: \nsidebar_position: 10\n---\n\n# ${title}\n\nStart writing here.\n`;

    try {
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
