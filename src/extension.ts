import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
import { getOrCreateFile, TestHandler } from './test-handler';

export function activate(context: vscode.ExtensionContext) {
  OUTPUT_CHANNEL.appendLine('Activated the extension.');

  OUTPUT_CHANNEL.appendLine('Start discovering Unit test cases under: tests/unit/**/*.js');
  const unitCtrl = new TestHandler(context, 'tests/unit/**/*.js', 'Unit').setupRunProfile();

  OUTPUT_CHANNEL.appendLine('Start discovering Integration test cases under: tests/integration/**/*.js');
  const integrationCtrl = new TestHandler(context, 'tests/integration/**/*.js', 'Integration').setupRunProfile();

  OUTPUT_CHANNEL.appendLine('Start discovering Acceptance test cases under: tests/acceptance/**/*.js');
  const acceptanceCtrl = new TestHandler(context, 'tests/acceptance/**/*.js', 'Acceptance').setupRunProfile();

  function updateNodeForDocument(e: vscode.TextDocument) {
    if (e.uri.scheme !== 'file' || !e.uri.path.endsWith('.js')) {
      return;
    }

    if (e.uri.path.includes('tests/unit/')) {
      const { file, data } = getOrCreateFile(unitCtrl, e.uri);
      data.updateFromContents(unitCtrl, e.getText(), file);
    } else if (e.uri.path.includes('tests/integration/')) {
      const { file, data } = getOrCreateFile(integrationCtrl, e.uri);
      data.updateFromContents(integrationCtrl, e.getText(), file);
    } else if (e.uri.path.includes('tests/acceptance/')) {
      const { file, data } = getOrCreateFile(acceptanceCtrl, e.uri);
      data.updateFromContents(acceptanceCtrl, e.getText(), file);
    }
  }

  context.subscriptions.push(
    // vscode.workspace.onDidOpenTextDocument(updateNodeForDocument),
    vscode.workspace.onDidSaveTextDocument(e => updateNodeForDocument(e))
  );
}
