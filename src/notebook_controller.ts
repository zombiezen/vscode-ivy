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

import { Ivy, IvyInstance } from './ivy';

class IvyDocument {
  private _instance: IvyInstance;
  private _executionNumber: number;

  constructor(instance: IvyInstance) {
    this._instance = instance;
    this._executionNumber = 1;
  }

  get instance() {
    return this._instance;
  }

  nextExecutionNumber() {
    return this._executionNumber++;
  }

  reset(instance: IvyInstance) {
    this._instance = instance;
    this._executionNumber = 1;
  }
}

/// Glue between notebook UI and Ivy interpreters.
export class NotebookController implements vscode.Disposable {
  private readonly _controller: vscode.NotebookController;
  private readonly _ivy: Ivy;
  private readonly _documents: Map<vscode.NotebookDocument, IvyDocument>;
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

  /// Stop any Ivy evaluator running for the given notebook.
  async restartKernel(notebook: vscode.NotebookDocument): Promise<void> {
    const doc = this._documents.get(notebook);
    if (!doc) {
      return;
    }
    doc.reset(await this._ivy.newInstance());
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController,
  ): Promise<void> {
    let doc = this._documents.get(notebook);
    if (!doc) {
      // TODO(soon): This could start multiple instances.
      // Keep a placeholder.
      doc = new IvyDocument(await this._ivy.newInstance());
      this._documents.set(notebook, doc);
    }
    for (const cell of cells) {
      await this._executeCell(doc, cell);
    }
  }

  private async _executeCell(
    doc: IvyDocument,
    cell: vscode.NotebookCell,
  ): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = doc.nextExecutionNumber();
    execution.start(Date.now());

    const { stdout, stderr } = await doc.instance.run(cell.document.getText());
    const endTime = Date.now();

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

  private async _notebookClosed(notebook: vscode.NotebookDocument) {
    const doc = this._documents.get(notebook);
    if (doc) {
      doc.instance.dispose();
    }
    this._documents.delete(notebook);
  }

  dispose() {
    // TODO(someday): Cancel/wait for any ongoing ivy subprocesses.

    this._documents.forEach((doc) => doc.instance.dispose());
    this._documents.clear();

    this._notebookCloseListener.dispose();
    this._controller.dispose();
  }
}
