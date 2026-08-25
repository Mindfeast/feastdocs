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
 * person who made the edit. No service account, nothing to keep in a vault, and
 * `git blame` names a human.
 *
 * The default branch is never written to. A publish creates a new branch and a
 * pull request, because that is the only route a protected branch allows.
 */
@Injectable({ providedIn: 'root' })
export class AzureDevOpsService {
  private readonly entra = inject(EntraService);
  private readonly config = SITE.azureDevOps;

  readonly isConfigured =
    this.config.baseUrl !== null && this.config.project !== null && this.config.repository !== null;

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
  async listFiles(docsDir: string, branch = this.defaultBranch): Promise<string[]> {
    const url =
      `${this.repoRoot}/items?scopePath=/${encodeURIComponent(docsDir)}` +
      `&recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(branch)}&api-version=7.1`;
    const result = await this.request<{ value: { path: string; isFolder?: boolean }[] }>(
      'GET',
      url,
    );
    const prefix = `/${docsDir}/`;
    return result.value
      .filter((item) => !item.isFolder && /\.(md|markdown|html|scss)$/i.test(item.path))
      .map((item) => item.path.slice(prefix.length))
      .sort();
  }

  async readFile(docsDir: string, path: string, branch = this.defaultBranch): Promise<string> {
    const url =
      `${this.repoRoot}/items?path=${encodeURIComponent(`/${docsDir}/${path}`)}` +
      `&includeContent=true&versionDescriptor.version=${encodeURIComponent(branch)}&api-version=7.1`;
    const result = await this.request<{ content?: string }>('GET', url);
    return result.content ?? '';
  }

  /** Every branch in the repository, default first, then alphabetical. */
  async listBranches(): Promise<string[]> {
    const url = `${this.repoRoot}/refs?filter=heads/&api-version=7.1`;
    const result = await this.request<{ value: { name: string }[] }>('GET', url);
    const names = result.value
      .map((ref) => ref.name.replace(/^refs\/heads\//, ''))
      .sort((a, b) => a.localeCompare(b));
    return [
      ...names.filter((name) => name === this.defaultBranch),
      ...names.filter((name) => name !== this.defaultBranch),
    ];
  }

  /** Head commit of a branch. Every push has to name the commit it builds on. */
  async branchHead(branch: string): Promise<string> {
    const url = `${this.repoRoot}/refs?filter=heads/${encodeURIComponent(branch)}&api-version=7.1`;
    const result = await this.request<{ value: { objectId: string; name: string }[] }>('GET', url);
    // `filter` is a prefix match, so `main` also returns `maintenance`.
    const exact = result.value.find((ref) => ref.name === `refs/heads/${branch}`);
    if (!exact) throw new Error(`Branch "${branch}" was not found in the repository.`);
    return exact.objectId;
  }

  /** An open pull request from this branch, so an existing one can be linked. */
  async activePullRequest(branch: string): Promise<{ id: number; url: string } | null> {
    const url =
      `${this.repoRoot}/pullrequests?searchCriteria.sourceRefName=${encodeURIComponent(`refs/heads/${branch}`)}` +
      `&searchCriteria.status=active&api-version=7.1`;
    const result = await this.request<{ value: { pullRequestId: number }[] }>('GET', url);
    const found = result.value[0];
    return found
      ? { id: found.pullRequestId, url: `${this.webRoot}/pullrequest/${found.pullRequestId}` }
      : null;
  }

  /** Recent commits on a branch, newest first. */
  async listCommits(
    branch = this.defaultBranch,
    limit = 8,
  ): Promise<Array<{ sha: string; subject: string; author: string; date: string }>> {
    const url =
      `${this.repoRoot}/commits?searchCriteria.itemVersion.version=${encodeURIComponent(branch)}` +
      `&searchCriteria.$top=${limit}&api-version=7.1`;
    const result = await this.request<{
      value: Array<{
        commitId: string;
        comment: string;
        author: { name: string; date: string };
      }>;
    }>('GET', url);
    return result.value.map((entry) => ({
      sha: entry.commitId.slice(0, 7),
      // Only the subject: a commit body in a one-line list is noise.
      subject: (entry.comment ?? '').split('\n')[0],
      author: entry.author?.name ?? '',
      date: entry.author?.date ?? '',
    }));
  }

  /**
   * Creates a branch at another branch's head, without a commit.
   *
   * A ref update from the all-zero object id is how Azure DevOps spells "create";
   * `publish` does it as part of a push, but a branch you intend to work on for a
   * while is worth making on its own.
   */
  async createBranch(name: string, from = this.defaultBranch): Promise<void> {
    const head = await this.branchHead(from);
    await this.request('POST', `${this.repoRoot}/refs?api-version=7.1`, [
      {
        name: `refs/heads/${name}`,
        oldObjectId: '0000000000000000000000000000000000000000',
        newObjectId: head,
      },
    ]);
  }
  /**
   * Turns changes into a commit, one of two ways.
   *
   * On the default branch there is nowhere legal to commit, so a new branch is
   * cut from its head and a pull request opened. On any other branch the commit
   * is added to that branch — which is how an edit reaches a pull request that is
   * already open, without a second branch or a duplicate request.
   *
   * A push is a ref update plus commits in one call, so a branch is never created
   * empty and a failed commit leaves no orphan behind.
   */
  async publish({
    docsDir,
    branch,
    message,
    changes,
    onto,
  }: {
    docsDir: string;
    branch: string;
    message: string;
    changes: readonly {
      path: string;
      content: string | null;
      kind: 'edit' | 'create' | 'delete';
    }[];
    /** The branch being edited. New-branch publish when this is the default. */
    onto: string;
  }): Promise<{
    branch: string;
    commitId: string;
    pullRequestUrl: string | null;
    pullRequestId: number | null;
    createdBranch: boolean;
  }> {
    if (changes.length === 0) throw new Error('Nothing to publish.');

    const createBranch = onto === this.defaultBranch;
    const target = createBranch ? branch : onto;
    if (target === this.defaultBranch) {
      throw new Error(`${this.defaultBranch} is protected — publish to a branch instead.`);
    }

    // A new branch builds on the default branch's head; an existing one builds on
    // its own, which is also how Azure DevOps detects that someone else pushed
    // first — the ref update is rejected rather than silently overwriting.
    const oldObjectId = await this.branchHead(createBranch ? this.defaultBranch : target);

    const push = await this.request<{ commits: { commitId: string }[] }>(
      'POST',
      `${this.repoRoot}/pushes?api-version=7.1`,
      {
        refUpdates: [{ name: `refs/heads/${target}`, oldObjectId }],
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
    const commitId = push.commits[0]?.commitId ?? '';

    if (!createBranch) {
      // Adding to an existing branch: link whatever request is already open for
      // it rather than opening a second one.
      const existing = await this.activePullRequest(target);
      return {
        branch: target,
        commitId,
        pullRequestId: existing?.id ?? null,
        pullRequestUrl: existing?.url ?? null,
        createdBranch: false,
      };
    }

    const pullRequest = await this.request<{ pullRequestId: number }>(
      'POST',
      `${this.repoRoot}/pullrequests?api-version=7.1`,
      {
        sourceRefName: `refs/heads/${target}`,
        targetRefName: `refs/heads/${this.defaultBranch}`,
        title: message.split('\n')[0],
        description:
          'Edited from the documentation site.\n\n' +
          changes.map((change) => `- ${change.kind}: ${change.path}`).join('\n'),
      },
    );

    return {
      branch: target,
      commitId,
      pullRequestId: pullRequest.pullRequestId,
      pullRequestUrl: `${this.webRoot}/pullrequest/${pullRequest.pullRequestId}`,
      createdBranch: true,
    };
  }
}
