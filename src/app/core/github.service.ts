import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SITE } from '../generated/site-config';

const TOKEN_KEY = 'feastdocs:github-token';
const API = 'https://api.github.com';

export interface GithubUser {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string;
}

export interface GithubFile {
  readonly content: string;
  /** Blob SHA — required by the contents API to update an existing file. */
  readonly sha: string;
}

/** One staged change inside a batched commit. `content: null` = delete. */
export interface BatchChange {
  readonly path: string;
  readonly content: string | null;
}

/**
 * GitHub backend for the content manager: commits straight to the configured
 * repository as the connected user, so authorship lands in git history — the
 * same place the build reads "last updated by" from.
 *
 * The token is user-provided (a fine-grained PAT with contents read/write on
 * the docs repo) and lives in localStorage. A full OAuth login needs a tiny
 * server-side code-for-token exchange — the client secret cannot ship in a
 * static bundle — and can replace `connect()`'s input without touching
 * anything else here.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly http = inject(HttpClient);

  readonly repo = SITE.github.repo;
  readonly branch = SITE.github.branch;
  readonly isConfigured = this.repo !== null;

  readonly user = signal<GithubUser | null>(null);
  readonly isConnected = computed(() => this.user() !== null);

  /**
   * Whether the connected user can push to the repo. GitHub enforces this
   * server-side on every commit regardless — the flag exists so the editor can
   * say "read-only" up front instead of failing at commit time. null = unknown.
   */
  readonly canWrite = signal<boolean | null>(null);

  private token: string | null = this.readStoredToken();

  /** Restores a stored session, quietly dropping a token that stopped working. */
  async restore(): Promise<void> {
    if (!this.token || this.user()) return;
    try {
      this.user.set(await this.fetchUser());
      this.canWrite.set(await this.fetchWriteAccess());
    } catch {
      this.token = null;
      this.clearStoredToken();
    }
  }

  /** Validates the token against /user before keeping it. */
  async connect(token: string): Promise<GithubUser> {
    this.token = token.trim();
    try {
      const user = await this.fetchUser();
      this.user.set(user);
      this.canWrite.set(await this.fetchWriteAccess());
      try {
        localStorage.setItem(TOKEN_KEY, this.token);
      } catch {
        // Session-only connection when storage is unavailable.
      }
      return user;
    } catch (error) {
      this.token = null;
      throw error;
    }
  }

  disconnect(): void {
    this.token = null;
    this.user.set(null);
    this.canWrite.set(null);
    this.clearStoredToken();
  }

  /** Every doc-ish file under docsDir on the configured branch. */
  async listFiles(docsDir: string): Promise<string[]> {
    return [...(await this.listTree(docsDir)).keys()].sort();
  }

  /**
   * Path -> blob SHA for every doc file on the branch. The SHAs are the basis
   * of conflict detection: a file whose SHA changed since it was read has been
   * edited by someone else in the meantime.
   */
  async listTree(docsDir: string): Promise<Map<string, string>> {
    const tree = await this.get<{ tree: Array<{ path: string; type: string; sha: string }> }>(
      `/repos/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
    );
    const prefix = `${docsDir}/`;
    const map = new Map<string, string>();
    for (const entry of tree.tree) {
      if (entry.type !== 'blob' || !entry.path.startsWith(prefix)) continue;
      const path = entry.path.slice(prefix.length);
      if (/\.(md|markdown|html|scss)$/i.test(path)) map.set(path, entry.sha);
    }
    return map;
  }

  async readFile(docsDir: string, path: string): Promise<GithubFile> {
    const result = await this.get<{ content: string; sha: string }>(
      `/repos/${this.repo}/contents/${encodePath(`${docsDir}/${path}`)}?ref=${encodeURIComponent(this.branch)}`,
    );
    return { content: decodeBase64(result.content), sha: result.sha };
  }

  /**
   * Creates or updates a file as one commit on the branch. GitHub records the
   * token's user as author and committer — attribution comes with the token.
   * Returns the new blob SHA for follow-up saves.
   */
  async writeFile(
    docsDir: string,
    path: string,
    content: string,
    options: { sha?: string; message?: string },
  ): Promise<string> {
    const result = await firstValueFrom(
      this.http.put<{ content: { sha: string } }>(
        `${API}/repos/${this.repo}/contents/${encodePath(`${docsDir}/${path}`)}`,
        {
          message: options.message || `docs: update ${path}`,
          content: encodeBase64(content),
          branch: this.branch,
          ...(options.sha ? { sha: options.sha } : {}),
        },
        { headers: this.headers() },
      ),
    );
    return result.content.sha;
  }

  /**
   * Commits any number of file changes — edits, creations, deletions — as ONE
   * commit on the branch, via the Git Data API: build a tree on top of the
   * current head, wrap it in a commit, advance the ref. The token's user is
   * recorded as author, exactly like the single-file path.
   */
  async commitBatch(docsDir: string, changes: readonly BatchChange[], message: string): Promise<void> {
    const ref = await this.get<{ object: { sha: string } }>(
      `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`,
    );
    const headSha = ref.object.sha;
    const head = await this.get<{ tree: { sha: string } }>(
      `/repos/${this.repo}/git/commits/${headSha}`,
    );

    const tree = await this.send<{ sha: string }>('POST', `/repos/${this.repo}/git/trees`, {
      base_tree: head.tree.sha,
      tree: changes.map((change) =>
        change.content === null
          ? { path: `${docsDir}/${change.path}`, mode: '100644', type: 'blob', sha: null }
          : { path: `${docsDir}/${change.path}`, mode: '100644', type: 'blob', content: change.content },
      ),
    });

    const commit = await this.send<{ sha: string }>('POST', `/repos/${this.repo}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [headSha],
    });

    try {
      await this.send('PATCH', `/repos/${this.repo}/git/refs/heads/${encodeURIComponent(this.branch)}`, {
        sha: commit.sha,
      });
    } catch (error) {
      // Only the ref update can race another writer; tag it so callers can
      // distinguish "head moved, rebuild and retry" from every other 422
      // (e.g. an invalid tree entry, which retrying would never fix).
      if ((error as { status?: number })?.status === 422) {
        throw Object.assign(new Error('The branch moved during the commit.'), { refMoved: true });
      }
      throw error;
    }
  }

  /**
   * The repo endpoint reports the caller's own permissions. A 404 means the
   * token cannot even see the repository (fine-grained tokens scope reads
   * too) — treated as no access rather than an error.
   */
  private async fetchWriteAccess(): Promise<boolean> {
    try {
      const repo = await this.get<{ permissions?: { push?: boolean } }>(`/repos/${this.repo}`);
      return repo.permissions?.push === true;
    } catch {
      return false;
    }
  }

  private async fetchUser(): Promise<GithubUser> {
    const user = await this.get<{ login: string; name: string | null; avatar_url: string }>(
      '/user',
    );
    return { login: user.login, name: user.name, avatarUrl: user.avatar_url };
  }

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${API}${path}`, { headers: this.headers() }));
  }

  private send<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.request<T>(method, `${API}${path}`, { body, headers: this.headers() }),
    );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  }

  private readStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private clearStoredToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored to clear.
    }
  }
}

/** Encode each segment, keep the slashes — the contents API wants a path. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
