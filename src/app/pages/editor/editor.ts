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

  /** Closes the template submenu on any click outside it. */
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.templateMenuOpen()) return;
    if (!(event.target as HTMLElement | null)?.closest('.fd-editor__tpl')) {
      this.templateMenuOpen.set(false);
    }
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
      const conflicted = await this.findConflicts();
      if (conflicted.length > 0) {
        this.conflicts.set(conflicted);
        this.status.set({
          kind: 'error',
          message: `Someone changed ${conflicted.length} of your staged file${conflicted.length === 1 ? '' : 's'} in the meantime — resolve below, then commit again.`,
        });
        return;
      }
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
      this.conflicts.set([]);
      await this.refreshFiles();
      const login = this.github.user()?.login ?? 'you';
      this.status.set({
        kind: 'saved',
        detail: `Committed ${count} change${count === 1 ? '' : 's'} to ${this.github.branch} as ${login} — live after the next deploy`,
      });
    } catch (error) {
      // The branch moved between our conflict check and the ref update — a
      // narrow race. Nothing was written; checking again is all it takes.
      if ((error as { status?: number })?.status === 422) {
        this.status.set({
          kind: 'error',
          message: 'The branch moved while committing — nothing was written. Press Commit again.',
        });
        return;
      }
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
