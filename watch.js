import * as esbuild from 'esbuild';

const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'Veform',
  outfile: 'dist/veform.browser.js',
  platform: 'browser',
  target: ['es2020'],
  minify: false,
});

await ctx.watch();
console.log('Watching src/ for changes...');
