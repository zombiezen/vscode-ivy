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

let callbackCounter = 0;

/// Running instance of an Ivy evaluator.
export class Ivy implements vscode.Disposable {
  private readonly _wasmUri: vscode.Uri;
  private readonly _callbackName: string;
  private _namespacePromise: Promise<{ namespace: IvyNamespace, done: Promise<void> }> | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._wasmUri = vscode.Uri.joinPath(extensionUri, 'out/ivy.wasm');
    this._callbackName = '_ivyReady' + (callbackCounter++);
  }

  /// Evaluate an Ivy program.
  async run(input: string): Promise<IvyOutput> {
    const ivy = await this._getIvyModule();
    return new Promise((resolve) => {
      ivy.run(input, (stdout, stderr) => resolve({stdout, stderr}));
    });
  }

  private _getIvyModule(): Promise<IvyNamespace> {
    if (!this._namespacePromise) {
      const namespacePromise = new Promise<IvyNamespace>((resolve) => {
        _ivyCallbacks[this._callbackName] = (namespace: IvyNamespace) => {
          delete _ivyCallbacks[this._callbackName];
          resolve(namespace);
        };
      });
      const go = new Go();
      go.env['IVY_CALLBACK'] = this._callbackName;
      this._namespacePromise = Promise.resolve(vscode.workspace.fs.readFile(this._wasmUri)
        .then((wasmBytes) => WebAssembly.instantiate(wasmBytes, go.importObject))
        .then(async ({ instance }) => {
          const done = go.run(instance);
          return { namespace: await namespacePromise, done };
        }));
    }
    return this._namespacePromise.then(({ namespace }) => namespace);
  }

  dispose() {
    if (this._namespacePromise) {
      // TODO(maybe): Return this promise somewhere?
      this._namespacePromise.then(({ namespace, done }) => {
        namespace.exit();
        return done;
      });
    }
  }
}
