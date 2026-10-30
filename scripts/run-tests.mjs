/** Bundles the TypeScript suite through esbuild and runs it on node. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wldd-'));
for (const entry of ['tests/search.test.mts', 'tests/revive.mts']) {
  const out = path.join(tmp, `${path.basename(entry, path.extname(entry))}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true, platform: 'node', format: 'esm',
    outfile: out, logLevel: 'error',
  });
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
}
fs.rmSync(tmp, { recursive: true, force: true });

// Plain JS, so it runs directly rather than through the bundler.
execFileSync(process.execPath, ['tests/ingest-stability.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/report-link.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/session.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/gate.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/extract.mjs'], { stdio: 'inherit' });
