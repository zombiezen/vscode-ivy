// Copyright 2021 Ross Light
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//		 https://www.apache.org/licenses/LICENSE-2.0
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

import { NotebookController } from './notebook_controller';

export function activate(context: vscode.ExtensionContext) {
	const ivy = new Ivy(context.extensionUri);
	context.subscriptions.push(ivy);
	const controller = new NotebookController(ivy);
	context.subscriptions.push(controller);
}

export function deactivate() {}
