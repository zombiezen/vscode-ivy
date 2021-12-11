import * as vscode from 'vscode';
import { NotebookController } from './notebook_controller';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "ivy" is now active!');

	context.subscriptions.push(new NotebookController());
}

export function deactivate() {}
