import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (ESM + CJS + types)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    target: 'es2020',
    splitting: false,
  },
  // Bookmarklet build — single IIFE, minified
  {
    entry: { bookmarklet: 'src/bookmarklet.ts' },
    format: ['iife'],
    minify: true,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    target: 'es2020',
    globalName: 'PretextDevtools',
    outExtension: () => ({ js: '.min.js' }),
  },
]);
