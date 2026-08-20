import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import { startEditorApi } from './editor-api.mjs';
import { loadConfig, ROOT } from './lib/config.mjs';
import { cyan, dim, red } from './lib/log.mjs';

const config = await loadConfig();
const docsDir = path.join(ROOT, config.docsDir);
const buildScript = fileURLToPath(new URL('./build-content.mjs', import.meta.url));

console.log(`${cyan('FeastDocs')} watching ${dim(path.relative(ROOT, docsDir) || '.')}`);

/**
 * Content builds run in a child process on purpose: Node caches this process's
 * modules for its lifetime, so an in-process build would keep using stale
 * pipeline code after anything under tools/ changes. A child process reads the
 * code from disk every time — slower per rebuild, but never silently wrong.
 */
function runContentBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [buildScript], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', (error) => {
      console.error(`${red('✗')} could not start the content build`);
      console.error(error);
      resolve(false);
    });
  });
}

if (!(await runContentBuild())) {
  console.error(`${red('✗')} initial content build failed`);
  process.exit(1);
}

// Local file API for the in-app content manager (/_editor). Dev only.
const editorApi = startEditorApi({ docsRoot: docsDir });

// The Angular dev server picks up the generated modules through its own watcher,
// so all this process has to do is keep them in sync with docs/.
const server = spawn('npx', ['ng', 'serve'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});

server.on('exit', (code) => process.exit(code ?? 0));

let pending = null;
let running = false;
let queued = false;

const rebuild = async () => {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const ok = await runContentBuild();
    if (!ok) {
      console.error(`${red('✗')} content build failed — keeping the previous output`);
    }
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void rebuild();
    }
  }
};

const schedule = () => {
  clearTimeout(pending);
  pending = setTimeout(() => void rebuild(), 120);
};

// Content, config, and the pipeline's own code all trigger a rebuild — the
// child process guarantees each build runs whatever is on disk right now.
chokidar
  .watch([docsDir, path.join(ROOT, 'feastdocs.config.mjs'), path.join(ROOT, 'tools')], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  })
  .on('all', schedule);

const shutdown = () => {
  try {
    editorApi.close();
  } catch {
    // Closing a server that never got to listen is not worth reporting.
  }
  server.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
