import { Injectable, inject } from '@angular/core';
import { EntraService } from './entra.service';
import { SITE } from '../generated/site-config';

/**
 * Reads and writes the documentation through the Azure DevOps REST API, from the
 * browser, with the signed-in user's own token.
 *
 * There is no server in between. Azure DevOps answers a CORS preflight with
 * `Access-Control-Allow-Origin: *` and permits the `authorization` header, so the
 * page can call it directly — which means every commit is authenticated as the
 * person who made the edit. No service account, no shared token, and `git blame`
 * names a human.
 *
 * The default branch is never written to. A publish creates a new branch and a
 * pull request, because that is the only route a protected branch allows.
 */
@Injectable({ providedIn: 'root' })
export class AzureDevOpsService {
  private readonly entra = inject(EntraService);
  private readonly config = SITE.azureDevOps;

  readonly isConfigured =
    this.config.baseUrl !== null &&
    this.config.project !== null &&
    this.config.repository !== null;

  /** Pull requests target this; nothing commits to it. */
  readonly defaultBranch = this.config.branch;

  private get repoRoot(): string {
    const base = this.config.baseUrl!.replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(this.config.project!)}/_apis/git/repositories/${encodeURIComponent(this.config.repository!)}`;
  }

  /** Web URL of the repository, for the pull-request link. */
  private get webRoot(): string {
    const base = this.config.baseUrl!.replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(this.config.project!)}/_git/${encodeURIComponent(this.config.repository!)}`;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = await this.entra.devOpsToken();
    if (!token) throw new Error('Not signed in, or consent is still pending.');

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      // Azure DevOps puts the useful part in `message`; the status alone is not
      // actionable ("400" tells an author nothing).
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload?.message) detail = payload.message;
      } catch {
        /* not JSON — keep the status line */
      }
      throw new Error(detail);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  /** Every editable file under the docs folder, as repo-relative paths. */
  async listFiles(docsDir: string): Promise<string[]> {
    const url =
      `${this.repoRoot}/items?scopePath=/${encodeURIComponent(docsDir)}` +
      `&recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(this.defaultBranch)}&api-version=7.1`;
    const result = await this.request<{ value: { path: string; isFolder?: boolean }[] }>('GET', url);
    const prefix = `/${docsDir}/`;
    return result.value
      .filter((item) => !item.isFolder && /\.(md|markdown|html|scss)$/i.test(item.path))
      .map((item) => item.path.slice(prefix.length))
      .sort();
  }

  async readFile(docsDir: string, path: string): Promise<string> {
    const url =
      `${this.repoRoot}/items?path=${encodeURIComponent(`/${docsDir}/${path}`)}` +
      `&includeContent=true&versionDescriptor.version=${encodeURIComponent(this.defaultBranch)}&api-version=7.1`;
    const result = await this.request<{ content?: string }>('GET', url);
    return result.content ?? '';
  }

  /** Head commit of the default branch — the base every new branch is cut from. */
  private async baseCommit(): Promise<string> {
    const url = `${this.repoRoot}/refs?filter=heads/${encodeURIComponent(this.defaultBranch)}&api-version=7.1`;
    const result = await this.request<{ value: { objectId: string }[] }>('GET', url);
    const objectId = result.value[0]?.objectId;
    if (!objectId) throw new Error(`Branch "${this.defaultBranch}" was not found in the repository.`);
    return objectId;
  }

  /**
   * Creates the branch and its commit in a single push, then opens the pull
   * request. One call does branch-and-commit because Azure DevOps models it that
   * way: a push is a ref update plus commits, so there is no window in which the
   * branch exists but is empty.
   */
  async publish({
    docsDir,
    branch,
    message,
    changes,
  }: {
    docsDir: string;
    branch: string;
    message: string;
    changes: readonly { path: string; content: string | null; kind: 'edit' | 'create' | 'delete' }[];
  }): Promise<{ branch: string; commitId: string; pullRequestUrl: string; pullRequestId: number }> {
    if (changes.length === 0) throw new Error('Nothing to publish.');
    if (branch === this.defaultBranch) {
      throw new Error(`${this.defaultBranch} is protected — publish to a new branch instead.`);
    }

    const oldObjectId = await this.baseCommit();

    const push = await this.request<{ commits: { commitId: string }[] }>(
      'POST',
      `${this.repoRoot}/pushes?api-version=7.1`,
      {
        refUpdates: [{ name: `refs/heads/${branch}`, oldObjectId }],
        commits: [
          {
            comment: message,
            changes: changes.map((change) => ({
              changeType: change.kind === 'create' ? 'add' : change.kind,
              item: { path: `/${docsDir}/${change.path}` },
              ...(change.kind === 'delete'
                ? {}
                : { newContent: { content: change.content ?? '', contentType: 'rawtext' } }),
            })),
          },
        ],
      },
    );

    const pullRequest = await this.request<{ pullRequestId: number }>(
      'POST',
      `${this.repoRoot}/pullrequests?api-version=7.1`,
      {
        sourceRefName: `refs/heads/${branch}`,
        targetRefName: `refs/heads/${this.defaultBranch}`,
        title: message.split('\n')[0],
        description: `Edited from the documentation site.\n\n${changes
          .map((change) => `- ${change.kind}: ${change.path}`)
          .join('\n')}`,
      },
    );

    return {
      branch,
      commitId: push.commits[0]?.commitId ?? '',
      pullRequestId: pullRequest.pullRequestId,
      pullRequestUrl: `${this.webRoot}/pullrequest/${pullRequest.pullRequestId}`,
    };
  }
}
