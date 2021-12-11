//@ts-check

'use strict';

const esbuild = require('esbuild');

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  sourcemap: true,
  outfile: 'out/extension.js',
  platform: 'node',
  target: 'node14.16',
  external: ['vscode'],
};
switch (process.argv[2]) {
  case 'prepublish':
    options.minify = true;
    break;
  case 'watch':
    options.watch = true;
    options.sourcemap = true;
    break;
  default:
    options.sourcemap = true;
    break;
}

esbuild.build(options).then(() => {
  if (options.watch) {
    console.log("message TS6042: Compilation complete. Watching for file changes.");
  }
});
