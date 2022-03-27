import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
import { TestCase, TEST_DATA, TestFile } from './testTree';
import { ExtendPuppeteerQUnit } from './qunit-puppeteer-v2';
import { QUNIT_SUBJECT_OBSERVABLE } from './qunit/listener';

const host = vscode.workspace.getConfiguration('emberServer').get('host');
const port = vscode.workspace.getConfiguration('emberServer').get('port');

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
      await runTestCases(run, queue);
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

    this.ctrl.refreshHandler = cancellation => {};
    return this.ctrl;
  }
}

async function runTestCases(
  run: vscode.TestRun,
  queue: {
    test: vscode.TestItem;
    data: TestCase;
  }[]
): Promise<void> {
  const testItem: { [id: string]: { item: vscode.TestItem; data: TestCase } } = {};
  let query = queue
    .map(que => {
      testItem[que.test.id] = {
        item: que.test,
        data: que.data,
      };
      return `testId=${que.test.id}`;
    })
    .join('&');

  const extendPuppeteerQUnit = ExtendPuppeteerQUnit.getInstance(true);
  let messages: vscode.TestMessage[] = [];
  let assertCounter = 0;
  const myPromise = new Promise((resolve, _) => {
    QUNIT_SUBJECT_OBSERVABLE.subscribe(res => {
      const details = res.details;
      const testInstance = testItem[details.testId];
      if (res.name === 'QUNIT_CALLBACK_TEST_START') {
        run.started(testInstance.item);
      }
      if (res.name === 'QUNIT_CALLBACK_LOG') {
        if (!details.result && details.actual && testInstance.item.uri) {
          messages.push({
            ...vscode.TestMessage.diff(`Actual: ${details.actual}`, details.expected, details.actual),
            location: new vscode.Location(testInstance.item.uri, testInstance.data.getAssertionsRange()[assertCounter]),
          });
        } else if (!details.result && testInstance.item.uri && testInstance.item.range) {
          messages.push({
            ...new vscode.TestMessage(`Message: ${details.message}\nSource: ${details.source}`),
            location: new vscode.Location(testInstance.item.uri, testInstance.item.range),
          });
        }
        assertCounter++;
      } else if (res.name === 'QUNIT_CALLBACK_TEST_DONE') {
        if (details.failed > 0) {
          run.failed(
            testInstance.item,
            messages.length
              ? messages
              : new vscode.TestMessage(`Message: ${details.message}\nSource: ${details.source}`)
          );
        } else {
          run.passed(testInstance.item);
        }
        messages = [];
        assertCounter = 0;
      } else if (res.name === 'QUNIT_CALLBACK_DONE') {
        resolve(1);
      }
    });
  });

  (await extendPuppeteerQUnit.page).goto(`${host}:${port}/tests/index.html?${query}`);
  await myPromise;
  run.end();
}
