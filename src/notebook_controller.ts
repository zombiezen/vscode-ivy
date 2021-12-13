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

import { Ivy, IvyInstance, IvyOutput } from './ivy';

/// Glue between notebook UI and Ivy interpreters.
export class NotebookController implements vscode.Disposable {
  private readonly _controller: vscode.NotebookController;
  private readonly _ivy: Ivy;
  private readonly _documents: Map<vscode.NotebookDocument, Promise<IvyInstance>>;
  private readonly _notebookCloseListener: vscode.Disposable;

  constructor(ivy: Ivy) {
    this._ivy = ivy;

    this._controller = vscode.notebooks.createNotebookController(
      'zombiezen-ivy-controller',
      'markdown-notebook',
      'Ivy'
    );
    this._controller.supportedLanguages = ['ivy'];
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._execute.bind(this);

    this._documents = new Map();
    this._notebookCloseListener = vscode.workspace.onDidCloseNotebookDocument(
      this._notebookClosed.bind(this));
  }

  /// Stop the Ivy evaluator running for the given notebook.
  async stopKernel(notebook: vscode.NotebookDocument): Promise<void> {
    const promise = this._documents.get(notebook);
    if (!promise) {
      return;
    }
    this._documents.delete(notebook);
    const instance = await promise;
    instance.dispose();
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController,
  ): Promise<void> {
    for (const cell of cells) {
      await this._executeCell(notebook, cell);
    }
  }

  private async _executeCell(
    notebook: vscode.NotebookDocument,
    cell: vscode.NotebookCell,
  ): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    const instance = await this._getInstance(notebook);
    execution.executionOrder = instance.runCount + 1;
    execution.start(Date.now());

    let result: IvyOutput;
    try {
      result = await instance.run(cell.document.getText());
    } catch (e) {
      const endTime = Date.now();
      await execution.replaceOutput(new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.error(e instanceof Error ? e : new Error(e + '')),
      ]));
      execution.end(false, endTime);
      return;
    }
    const endTime = Date.now();

    const { stdout, stderr } = result;
    const outputs = [
      new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.stdout(stdout),
      ])
    ];
    if (stderr.length > 0) {
      outputs.push(new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.stderr(stderr),
      ]));
    }
    await execution.replaceOutput(outputs);
    execution.end(!stderr, endTime);
  }

  private _getInstance(notebook: vscode.NotebookDocument): Promise<IvyInstance> {
    // Not using async here because
    // I want to ensure promises are atomically available.

    const oldPromise = this._documents.get(notebook);
    let newPromise;
    if (oldPromise) {
      // Existing instance might not be alive anymore.
      // Replace if needed.
      newPromise = oldPromise.then((instance) => {
        if (!instance.isAlive) {
          instance.dispose();
          return this._ivy.newInstance();
        }
        return instance;
      });
    } else {
      // New document? New instance.
      newPromise = this._ivy.newInstance();
    }
    this._documents.set(notebook, newPromise);
    return newPromise;
  }

  private _notebookClosed(notebook: vscode.NotebookDocument): Promise<void> {
    const promise = this._documents.get(notebook);
    if (!promise) {
      return Promise.resolve();
    }
    this._documents.delete(notebook);
    return promise.then((instance) => instance.dispose());
  }

  dispose() {
    this._documents.forEach(async (instancePromise) => {
      const instance = await instancePromise;
      instance.dispose();
    });
    this._documents.clear();

    this._notebookCloseListener.dispose();
    this._controller.dispose();
  }
}
