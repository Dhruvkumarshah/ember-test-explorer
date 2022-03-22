import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
import { TestCase, TEST_DATA, TestFile } from './testTree';
import { getQunit } from './qunit-puppeteer';
const puppeteer = require('puppeteer-core');
const urlExists = require('url-exists');

const gatherTestItems = (collection: vscode.TestItemCollection) => {
  const items: vscode.TestItem[] = [];
  collection.forEach(item => items.push(item));
  return items;
};

export const getOrCreateFile = (controller: vscode.TestController, uri: vscode.Uri) => {
  const existing = controller.items.get(uri.toString());
  if (existing) {
    return { file: existing, data: TEST_DATA.get(existing) as TestFile };
  }

  const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
  controller.items.add(file);

  const data = new TestFile();
  TEST_DATA.set(file, data);

  file.canResolveChildren = true;
  return { file, data };
};

const startWatchingWorkspace = (filePath: string, controller: vscode.TestController) => {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }

  return vscode.workspace.workspaceFolders.map(workspaceFolder => {
    const pattern = new vscode.RelativePattern(workspaceFolder, filePath);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(uri => getOrCreateFile(controller, uri));
    watcher.onDidChange(uri => {
      const { file, data } = getOrCreateFile(controller, uri);
      if (data.didResolve) {
        data.updateFromDisk(controller, file);
      }
    });
    watcher.onDidDelete(uri => controller.items.delete(uri.toString()));

    vscode.workspace.findFiles(pattern).then(files => {
      for (const file of files) {
        getOrCreateFile(controller, file);
      }
    });

    return watcher;
  });
};

export class TestHandler {
  ctrl: vscode.TestController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly pathToTestFiles: string,
    private readonly controllerName: string
  ) {
    this.ctrl = vscode.tests.createTestController(`ember${controllerName}TestController`, controllerName);
    context.subscriptions.push(this.ctrl);
  }

  runHandlerForTests = (
    shouldDebug: boolean,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken
  ) => {
    const queue: { test: vscode.TestItem; data: TestCase }[] = [];
    const run = this.ctrl.createTestRun(request);

    const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
      for (const test of tests) {
        if (request.exclude?.includes(test)) {
          continue;
        }

        const data = TEST_DATA.get(test);
        if (data instanceof TestCase) {
          run.enqueued(test);
          queue.push({ test, data });
        } else {
          if (data instanceof TestFile && !data.didResolve) {
            await data.updateFromDisk(this.ctrl, test);
          }

          await discoverTests(gatherTestItems(test.children));
        }
      }
    };

    const runTestQueue = async () => {
      const emberTestUrl = `${vscode.workspace.getConfiguration('emberServer').get('host')}:${vscode.workspace
        .getConfiguration('emberServer')
        .get('port')}/tests/index.html`;
      await urlExists(emberTestUrl, async function (_: any, isEmberServerRunning: boolean) {
        if (isEmberServerRunning) {
          const qUnit: { modules: [{ name: string; moduleId: string }] } = await getQunit(emberTestUrl);
          for (const { test, data } of queue) {
            const moduleId: any = qUnit.modules.find(res => res.name === data.getModule())?.moduleId;
            run.appendOutput(`Running ${test.id}\r\n`);
            if (cancellation.isCancellationRequested) {
              run.skipped(test);
            } else {
              run.started(test);
              await data.run(test, run, moduleId, shouldDebug);
            }

            run.appendOutput(`Completed ${test.id}\r\n`);
          }
        } else {
          vscode.window.showErrorMessage(
            `Please start the ember server to execute tests or check provided host and port information: ${emberTestUrl}`
          );
          OUTPUT_CHANNEL.appendLine(
            `Please start the ember server to execute tests or check provided host and port information: ${emberTestUrl}\nCheck out Extension Feature contribution settings for customization.`
          );
          OUTPUT_CHANNEL.show(false);
        }
        run.end();
      });
    };

    discoverTests(request.include ?? gatherTestItems(this.ctrl.items)).then(runTestQueue);
  };

  setupRunProfile() {
    this.ctrl.createRunProfile(
      'Run Tests',
      vscode.TestRunProfileKind.Run,
      (request, token) => {
        this.runHandlerForTests(false, request, token);
      },
      true
    );

    this.ctrl.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => {
        this.runHandlerForTests(true, request, token);
      },
      false
    );
    this.ctrl.resolveHandler = async item => {
      if (!item) {
        this.context.subscriptions.push(...startWatchingWorkspace(this.pathToTestFiles, this.ctrl));
        return;
      }

      const data = TEST_DATA.get(item);
      if (data instanceof TestFile) {
        OUTPUT_CHANNEL.appendLine(`Discovered ${this.controllerName} test cases.`);
        await data.updateFromDisk(this.ctrl, item);
      }
    };
    return this.ctrl;
  }
}
