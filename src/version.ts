import { createRequire } from 'module';

/**
 * Package version — the single source of truth, read from package.json at load time.
 * Module-relative require: from dist/version.js, '../package.json' resolves to the
 * project root (rootDir `src` mirrors to outDir `dist`), so it works in both the
 * compiled build and under tsx/vitest.
 */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;
