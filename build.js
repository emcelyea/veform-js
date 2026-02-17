import * as esbuild from 'esbuild';

// Build browser IIFE bundle (for global usage)
await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'Veform',
  outfile: 'dist/veform.browser.js',
  platform: 'browser',
  target: ['es2020'],
  minify: false,
});


// Build minified version
await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'Veform',
  outfile: 'dist/veform.browser.min.js',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
});

