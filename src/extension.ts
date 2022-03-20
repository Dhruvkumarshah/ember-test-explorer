import * as vscode from 'vscode';
import { getOrCreateFile, TestHandler } from './test-handler';

export function activate(context: vscode.ExtensionContext) {
  const unitCtrl = new TestHandler(context, 'tests/unit/**/*.js', 'Unit').setupRunProfile();
  const integrationCtrl = new TestHandler(context, 'tests/integration/**/*.js', 'Integration').setupRunProfile();
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
    vscode.workspace.onDidOpenTextDocument(updateNodeForDocument),
    vscode.workspace.onDidChangeTextDocument(e => updateNodeForDocument(e.document))
  );
}
