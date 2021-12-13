// Copyright 2021 Ross Light
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

import './wasm_exec';
_ivyCallbacks = {};

/// Interface exposed by ivy-wasm Go program.
interface IvyNamespace {
  run(input: string, callback: (stdout: string, stderr: string) => void): void;
  exit(): void;
}

/// Output from an invocation of Ivy.
export interface IvyOutput {
  stdout: string;
  stderr: string;
}

/// Ivy manages a running instance of the ivy-wasm Go program.
export class Ivy implements vscode.Disposable {
  private static _callbackCounter = 0;

  private readonly _wasmUri: vscode.Uri;
  private _modulePromise: Promise<WebAssembly.Module> | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._wasmUri = vscode.Uri.joinPath(extensionUri, 'out/ivy.wasm');
  }

  /// Start a new evaluator.
  async newInstance(): Promise<IvyInstance> {
    const module = await this._getIvyModule();
    const callbackName = '_ivyReady' + (Ivy._callbackCounter++);
    const go = new Go();
    go.env['IVY_CALLBACK'] = callbackName;
    const instance = await WebAssembly.instantiate(module, go.importObject);
    const namespacePromise = new Promise<IvyNamespace>((resolve) => {
      _ivyCallbacks[callbackName] = (namespace: IvyNamespace) => {
        delete _ivyCallbacks[callbackName];
        resolve(namespace);
      };
    });
    const done = go.run(instance);
    return new IvyInstanceImpl(await namespacePromise, done);
  }

  private _getIvyModule(): Promise<WebAssembly.Module> {
    if (!this._modulePromise) {
      this._modulePromise = Promise.resolve(vscode.workspace.fs.readFile(this._wasmUri)
        .then((wasmBytes) => WebAssembly.compile(wasmBytes)));
    }
    return this._modulePromise;
  }

  dispose() {
    // TODO(maybe): Remove dispose method?
  }
}

/// Running instance of an Ivy evaluator.
export interface IvyInstance extends vscode.Disposable {
  /// Whether the instance is still running.
  readonly isAlive: boolean;

  /// Evaluate an Ivy program.
  run(input: string): Promise<IvyOutput>;

  /// How many times run has been called.
  readonly runCount: number;
}

class IvyInstanceImpl implements IvyInstance {
  private readonly _api: IvyNamespace;
  private readonly _instanceExitPromise: Promise<null>;
  private _alive: boolean;
  private _prevCall: Promise<any>;
  private _runCount: number;

  constructor(api: IvyNamespace, terminated: Promise<void>) {
    this._api = api;
    this._alive = true;
    this._runCount = 0;

    this._prevCall = Promise.resolve(undefined);
    this._instanceExitPromise = terminated.finally(() => {
      this._alive = false;
    }).then(() => null);
  }

  dispose() {
    if (this._alive) {
      this._api.exit();
    }
    // TODO(maybe): Wait on _instanceExitPromise?
  }

  get isAlive(): boolean {
    return this._alive;
  }

  get runCount(): number {
    return this._runCount;
  }

  async run(input: string): Promise<IvyOutput> {
    if (!this._alive) {
      throw new Error('interpreter no longer running');
    }
    this._runCount++;
    const resultPromise = this._prevCall
      .then(() => {
        return new Promise<IvyOutput>((resolve) => {
          this._api.run(input, (stdout, stderr) => resolve({stdout, stderr}));
        });
      })
      .catch((e) => {
        this._alive = false;
        throw e;
      });
    const promise = Promise.race([
      resultPromise,
      this._instanceExitPromise,
    ]);
    this._prevCall = promise.catch(() => {});

    const result = await promise;
    if (!result) {
      throw new Error('interpreter crashed');
    }
    return result;
  }
}
