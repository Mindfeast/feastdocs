import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { cyan, dim, yellow } from './lib/log.mjs';
import {
  status as gitStatus,
  publish as gitPublish,
  discard as gitDiscard,
  discardAll as gitDiscardAll,
  diff as gitDiff,
  switchBranch as gitSwitchBranch,
  listBranches as gitListBranches,
  createBranch as gitCreateBranch,
  stage as gitStage,
  unstage as gitUnstage,
  commit as gitCommit,
  push as gitPush,
  sync as gitSync,
  log as gitLog,
  undoLastCommit as gitUndoLastCommit,
} from './lib/editor-git.mjs';

export const EDITOR_API_PORT = 4271;

/** Deepest allowed nesting: a section plus four category levels. */
const MAX_FOLDER_DEPTH = 8;

/**
 * Tiny local file API for the in-app content manager (/_editor). Development
 * only: started by `npm start`, bound to 127.0.0.1, and scoped to the docs
 * folder — the app can list, read, write and create documentation files, and
 * the existing watcher picks every change up like any other edit.
 */
export function startEditorApi({ docsRoot, port = EDITOR_API_PORT }) {
  const server = http.createServer(async (req, res) => {
    // The app runs on a different port (4200), so answer CORS preflights.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/files' && req.method === 'GET') {
        return json(res, 200, await listFiles(docsRoot));
      }
      if (url.pathname === '/api/file' && req.method === 'GET') {
        const file = resolveSafe(docsRoot, url.searchParams.get('path'));
        const content = await fs.readFile(file, 'utf8');
        return json(res, 200, { path: url.searchParams.get('path'), content });
      }
      if (url.pathname === '/api/file' && req.method === 'DELETE') {
        const relative = url.searchParams.get('path') ?? '';
        const file = resolveSafe(docsRoot, relative);
        if (!/\.(md|markdown|html|scss)$/i.test(file)) {
          return json(res, 400, { error: 'Only .md, .html and .scss files can be deleted.' });
        }
        await fs.rm(file);
        return json(res, 200, { deleted: relative });
      }
      if (url.pathname === '/api/file' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        const relative = String(body.path ?? '');
        const file = resolveSafe(docsRoot, relative);
        if (!/\.(md|markdown|html|scss)$/i.test(file)) {
          return json(res, 400, { error: 'Only .md, .html and .scss files can be written.' });
        }
        const depth = relative.replace(/\\/g, '/').split('/').length - 1;
        if (depth > MAX_FOLDER_DEPTH) {
          return json(res, 400, {
            error: `Too deep: ${depth} folders. The maximum is ${MAX_FOLDER_DEPTH} levels (a section plus seven category levels).`,
          });
        }
        if (body.ifMissing === true && (await exists(file))) {
          return json(res, 409, { error: `${relative} already exists.` });
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, String(body.content ?? ''), 'utf8');
        return json(res, 200, { saved: relative });
      }
      if (url.pathname === '/api/git/status' && req.method === 'GET') {
        return json(res, 200, await gitStatus({ docsRoot }));
      }
      /**
       * One call, because the sequence is the point: branch off an up-to-date
       * default branch, commit, push. `main` is pull-request protected, so a
       * commit that lands anywhere else is a commit that has to be redone.
       */
      if (url.pathname === '/api/git/publish' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitPublish({
          docsRoot,
          branch: body.branch,
          message: body.message,
          push: body.push !== false,
        });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/branches' && req.method === 'GET') {
        return json(res, 200, { branches: await gitListBranches() });
      }
      if (url.pathname === '/api/git/diff' && req.method === 'GET') {
        return json(res, 200, await gitDiff({ docsRoot, file: url.searchParams.get('file') }));
      }
      // Discarding a new file means deleting it, so the caller has to ask for
      // that specifically rather than have it happen behind the word "discard".
      if (url.pathname === '/api/git/discard' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitDiscard({
          docsRoot,
          file: body.file,
          allowDelete: body.allowDelete === true,
        });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/switch' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitSwitchBranch({ docsRoot, branch: body.branch });
        return json(res, result.ok ? 200 : 400, result);
      }
      /*
       * The rest of a version-control panel, one step per endpoint. `publish`
       * above stays as it is — it is the shortcut, and most edits want it — but
       * staging half of what changed, or adding a commit to a branch that already
       * has a pull request open, needs the steps taken separately.
       */
      if (url.pathname === '/api/git/stage' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitStage({ docsRoot, files: body.files });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/unstage' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitUnstage({ docsRoot, files: body.files });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/discard-all' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitDiscardAll({ docsRoot, allowDelete: body.allowDelete === true });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/commit' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitCommit({
          docsRoot,
          message: body.message,
          stageAll: body.stageAll === true,
        });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/push' && req.method === 'POST') {
        const result = await gitPush();
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/sync' && req.method === 'POST') {
        const result = await gitSync();
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/create-branch' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const result = await gitCreateBranch({
          branch: body.branch,
          fromDefault: body.fromDefault !== false,
        });
        return json(res, result.ok ? 200 : 400, result);
      }
      if (url.pathname === '/api/git/log' && req.method === 'GET') {
        return json(res, 200, await gitLog({ limit: url.searchParams.get('limit') ?? 12 }));
      }
      // Undoing a commit the remote already has would rewrite shared history, so
      // the module refuses that case rather than leaving it to the caller.
      if (url.pathname === '/api/git/undo' && req.method === 'POST') {
        const result = await gitUndoLastCommit();
        return json(res, result.ok ? 200 : 400, result);
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : (error?.status ?? 500);
      json(res, status, { error: error?.message ?? 'Internal error' });
    }
  });

  // Never let the API take the whole dev process down. The usual cause of a
  // failure here is a second `npm start` (or a zombie from a previous one)
  // already holding the port — the site itself works fine without the API,
  // only the content manager's saves need it.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(
        `${yellow('!')} port ${port} is already in use — another FeastDocs dev process ` +
          `is probably running. The content manager will use that one; everything else is unaffected.`,
      );
      return;
    }
    console.log(`${yellow('!')} content manager API failed to start: ${error.message}`);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`${cyan('editor')} content manager API on ${dim(`http://127.0.0.1:${port}`)}`);
  });
  return server;
}

async function listFiles(docsRoot) {
  const files = await fg(['**/*.{md,markdown,html,scss}'], {
    cwd: docsRoot,
    ignore: ['**/node_modules/**'],
    dot: false,
  });
  return { files: files.map((f) => f.split(path.sep).join('/')).sort() };
}

/** Confines every path to the docs folder — no traversal, no absolute paths. */
function resolveSafe(docsRoot, relative) {
  if (!relative) throw Object.assign(new Error('Missing path'), { status: 400 });
  const clean = String(relative).replace(/\\/g, '/');
  const resolved = path.resolve(docsRoot, clean);
  if (resolved !== docsRoot && !resolved.startsWith(docsRoot + path.sep)) {
    throw Object.assign(new Error('Path escapes the docs folder'), { status: 400 });
  }
  return resolved;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000)
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function exists(file) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}
