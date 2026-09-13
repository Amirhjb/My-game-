// Compila las pruebas con esbuild (ya viene con Vite) y las ejecuta en Node.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'ultimo-relato-test-'));
const outfile = join(dir, 'engine.test.mjs');
try {
  await build({
    entryPoints: ['tests/engine.test.ts'],
    bundle: true, platform: 'node', format: 'esm', target: 'node20',
    outfile, logLevel: 'error',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
