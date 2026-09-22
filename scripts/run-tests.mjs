/** Bundles the TypeScript suite through esbuild and runs it on node. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-')), 'suite.mjs');
await build({
  entryPoints: ['tests/search.test.mts'],
  bundle: true, platform: 'node', format: 'esm',
  outfile: out, logLevel: 'error',
});
try {
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
} finally {
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
}

// Plain JS, so it runs directly rather than through the bundler.
execFileSync(process.execPath, ['tests/ingest-stability.mjs'], { stdio: 'inherit' });
