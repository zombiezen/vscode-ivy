//@ts-check

'use strict';

const child_process = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const esbuild = require('esbuild');

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
const goBuild = (...args) => {
  const proc = child_process.spawn('go', ['build', ...args], {
    stdio: ['ignore', process.stderr, 'inherit'],
    env: {
      ...process.env,
      GOOS: 'js',
      GOARCH: 'wasm',
    },
  });
  return procPromise(proc);
};

/**
 * @param {string} destDir
 * @returns {Promise<void>}
 */
const copyWasmExec = async (destDir) => {
  const goProc = child_process.spawn('go', ['env', 'GOROOT'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let stdoutBuffer = Buffer.alloc(0);
  goProc.stdout.on('data', (newData) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, newData]);
  });
  await procPromise(goProc);
  const stdout = stdoutBuffer.toString();
  const goroot = (stdout.endsWith('\n') ?
    stdout.substr(0, stdout.length - 1) :
    stdout);

  await fs.copyFile(
    path.join(goroot, 'misc', 'wasm', 'wasm_exec.js'),
    path.join(destDir, 'wasm_exec.js'),
  );
};

/**
 * @param {child_process.ChildProcessByStdio} proc
 * @returns {Promise<void>}
 */
const procPromise = (proc) => new Promise((resolve, reject) => {
  proc.on('close', (exitCode) => {
    if (exitCode === 0) {
      resolve();
    } else {
      reject(new Error('subprocess exited with code ' + exitCode));
    }
  });
});

(async () => {
  await goBuild('-o', 'out/ivy.wasm', './ivy-wasm');
  if (process.argv[2] === 'wasm') {
    return;
  }

  await copyWasmExec('src');

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
})();
