import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
import { ExtendPuppeteerQUnit } from './qunit-puppeteer-v2';
import { QUnitModule } from './qunit/qunit-test-module';
import { QUNIT_MODULES } from './qunit/util';
import { getOrCreateFile, TestHandler } from './test-handler';
const urlExists = require('url-exists');

export function activate(context: vscode.ExtensionContext) {
  const interval = setInterval(() => {
    urlExists(
      `${vscode.workspace.getConfiguration('emberServer').get('host')}:${vscode.workspace
        .getConfiguration('emberServer')
        .get('port')}/tests/index.html`,
      (_: Error, exists: boolean) => {
        if (exists) {
          clearInterval(interval);
          const extendPuppeteerQUnit = ExtendPuppeteerQUnit.getInstance(true);
          extendPuppeteerQUnit.configurePuppeteer();
          extendPuppeteerQUnit.loadTestModules().then((qunitModules: QUnitModule[]) => {
            QUNIT_MODULES.modules = [];
            QUNIT_MODULES.modules.push(...qunitModules);
            OUTPUT_CHANNEL.appendLine('Activated the extension.');

            OUTPUT_CHANNEL.appendLine('Start discovering Unit test cases under: tests/unit/**/*.js');
            const unitCtrl = new TestHandler(context, 'tests/unit/**/*.js', 'Unit').setupRunProfile();

            OUTPUT_CHANNEL.appendLine('Start discovering Integration test cases under: tests/integration/**/*.js');
            const integrationCtrl = new TestHandler(
              context,
              'tests/integration/**/*.js',
              'Integration'
            ).setupRunProfile();

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
          });
        }
      }
    );
  }, 5000);
}
