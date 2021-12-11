import { spawn } from 'child_process';
import * as vscode from 'vscode';

export class NotebookController implements vscode.Disposable {
  private _executionNumber: number;
  private readonly _controller: vscode.NotebookController;

  constructor() {
    this._controller = vscode.notebooks.createNotebookController(
      'zombiezen-ivy-controller',
      'markdown-notebook',
      'Ivy'
    );
    this._controller.supportedLanguages = ['ivy'];
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._execute.bind(this);

    this._executionNumber = 1;
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('ivy', notebook.uri);
    for (const cell of cells) {
      await this._executeCell(config, cell);
    }
  }

  private async _executeCell(
    config: vscode.WorkspaceConfiguration,
    cell: vscode.NotebookCell,
  ): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = (this._executionNumber++);
    execution.start(Date.now());
    const output = new vscode.NotebookCellOutput([]);
    await execution.replaceOutput(output);

    const ivy = spawn(config.get('ivyPath', 'ivy'), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    ivy.stdout.on('data', (data) => {
      // TODO(soon): Synchronize?
      execution.appendOutputItems([vscode.NotebookCellOutputItem.stdout(data)], output);
    });
    ivy.stderr.on('data', (data) => {
      // TODO(soon): Synchronize?
      execution.appendOutputItems([vscode.NotebookCellOutputItem.stderr(data)], output);
    });
    const ivyPromise = new Promise((resolve) => {
      ivy.on('close', (code) => resolve(code));
    });

    // Write cell data to ivy stdin.
    const text = cell.document.getText();
    await new Promise<void>((resolve, reject) => {
      ivy.stdin.write(text, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    await new Promise<void>((resolve) => {
      ivy.stdin.end(resolve);
    });

    // Wait for ivy to complete and report status.
    const ivyExitCode = await ivyPromise;
    execution.end(ivyExitCode === 0, Date.now());
  }

  dispose() {
    // TODO(someday): Cancel/wait for any ongoing ivy subprocesses.
    this._controller.dispose();
  }
}
