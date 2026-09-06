import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'src', 'server.js');
const RELOAD_EXIT_CODE = 75;
let child = null;
let stopping = false;

function launch() {
  child = spawn(process.execPath, [serverFile], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });

  child.once('exit', (code, signal) => {
    child = null;
    if (stopping) return process.exit(0);
    if (code === RELOAD_EXIT_CODE) {
      console.log('[config] Saved. Reloading local engine...');
      return setTimeout(launch, 600);
    }
    if (signal) console.error(`[engine] Stopped by signal ${signal}.`);
    process.exit(code ?? 1);
  });
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  if (child) child.kill();
  else process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
launch();
