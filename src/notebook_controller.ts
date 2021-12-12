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

import { Ivy } from './ivy';

export class NotebookController implements vscode.Disposable {
  private _executionNumber: number;
  private readonly _controller: vscode.NotebookController;
  private readonly _ivy: Ivy;

  constructor(ivy: Ivy) {
    this._controller = vscode.notebooks.createNotebookController(
      'zombiezen-ivy-controller',
      'markdown-notebook',
      'Ivy'
    );
    this._controller.supportedLanguages = ['ivy'];
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._execute.bind(this);

    this._ivy = ivy;
    this._executionNumber = 1;
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController,
  ): Promise<void> {
    for (const cell of cells) {
      await this._executeCell(cell);
    }
  }

  private async _executeCell(
    cell: vscode.NotebookCell,
  ): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = (this._executionNumber++);
    execution.start(Date.now());

    const { stdout, stderr } = await this._ivy.run(cell.document.getText());
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

  dispose() {
    // TODO(someday): Cancel/wait for any ongoing ivy subprocesses.
    this._controller.dispose();
  }
}
