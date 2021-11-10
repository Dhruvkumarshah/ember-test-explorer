import * as vscode from 'vscode';
import { TestCase, testData, TestFile } from './testTree';

export function activate(context: vscode.ExtensionContext) {
  const unitCtrl = vscode.tests.createTestController('emberUnitTestController', 'Unit');
  context.subscriptions.push(unitCtrl);

  const integrationCtrl = vscode.tests.createTestController('emberIntegrationTestController', 'Integration');
  context.subscriptions.push(integrationCtrl);

  const acceptanceCtrl = vscode.tests.createTestController('emberAcceptanceTestController', 'Acceptance');
  context.subscriptions.push(acceptanceCtrl);

  const runHandlerForUnitTests = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
    const queue: { test: vscode.TestItem; data: TestCase }[] = [];
    const run = unitCtrl.createTestRun(request);

    const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
      for (const test of tests) {
        if (request.exclude?.includes(test)) {
          continue;
        }

        const data = testData.get(test);
        if (data instanceof TestCase) {
          run.enqueued(test);
          queue.push({ test, data });
        } else {
          if (data instanceof TestFile && !data.didResolve) {
            await data.updateFromDisk(unitCtrl, test);
          }

          await discoverTests(gatherTestItems(test.children));
        }
      }
    };

    const runTestQueue = async () => {
      for (const { test, data } of queue) {
        run.appendOutput(`Running ${test.id}\r\n`);
        if (cancellation.isCancellationRequested) {
          run.skipped(test);
        } else {
          run.started(test);

          run.passed(test);
        }

        run.appendOutput(`Completed ${test.id}\r\n`);
      }

      run.end();
    };

    discoverTests(request.include ?? gatherTestItems(unitCtrl.items)).then(runTestQueue);
  };

  const runHandlerForIntegrationTests = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
    const queue: { test: vscode.TestItem; data: TestCase }[] = [];
    const run = integrationCtrl.createTestRun(request);

    const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
      for (const test of tests) {
        if (request.exclude?.includes(test)) {
          continue;
        }

        const data = testData.get(test);
        if (data instanceof TestCase) {
          run.enqueued(test);
          queue.push({ test, data });
        } else {
          if (data instanceof TestFile && !data.didResolve) {
            await data.updateFromDisk(integrationCtrl, test);
          }

          await discoverTests(gatherTestItems(test.children));
        }
      }
    };

    const runTestQueue = async () => {
      for (const { test, data } of queue) {
        run.appendOutput(`Running ${test.id}\r\n`);
        if (cancellation.isCancellationRequested) {
          run.skipped(test);
        } else {
          run.started(test);

          run.passed(test);
        }

        // const lineNo = test.range!.start.line;
        // const fileCoverage = coveredLines.get(test.uri!.toString());
        // if (fileCoverage) {
        //   fileCoverage[lineNo]!.executionCount++;
        // }

        run.appendOutput(`Completed ${test.id}\r\n`);
      }

      run.end();
    };

    discoverTests(request.include ?? gatherTestItems(integrationCtrl.items)).then(runTestQueue);
  };

  const runHandlerForAcceptanceTests = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
    const queue: { test: vscode.TestItem; data: TestCase }[] = [];
    const run = acceptanceCtrl.createTestRun(request);

    const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
      for (const test of tests) {
        if (request.exclude?.includes(test)) {
          continue;
        }

        const data = testData.get(test);
        if (data instanceof TestCase) {
          run.enqueued(test);
          queue.push({ test, data });
        } else {
          if (data instanceof TestFile && !data.didResolve) {
            await data.updateFromDisk(acceptanceCtrl, test);
          }

          await discoverTests(gatherTestItems(test.children));
        }
      }
    };

    const runTestQueue = async () => {
      for (const { test, data } of queue) {
        run.appendOutput(`Running ${test.id}\r\n`);
        if (cancellation.isCancellationRequested) {
          run.skipped(test);
        } else {
          run.started(test);

          run.passed(test);
        }

        run.appendOutput(`Completed ${test.id}\r\n`);
      }

      run.end();
    };

    discoverTests(request.include ?? gatherTestItems(acceptanceCtrl.items)).then(runTestQueue);
  };

  unitCtrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandlerForUnitTests, true);
  integrationCtrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandlerForIntegrationTests, true);
  acceptanceCtrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandlerForAcceptanceTests, true);

  unitCtrl.resolveHandler = async item => {
    if (!item) {
      context.subscriptions.push(...startWatchingWorkspace('tests/unit/**/*.js', unitCtrl));
      return;
    }

    const data = testData.get(item);
    if (data instanceof TestFile) {
      await data.updateFromDisk(unitCtrl, item);
    }
  };

  integrationCtrl.resolveHandler = async item => {
    if (!item) {
      context.subscriptions.push(...startWatchingWorkspace('tests/integration/**/*.js', integrationCtrl));
      return;
    }

    const data = testData.get(item);
    if (data instanceof TestFile) {
      await data.updateFromDisk(integrationCtrl, item);
    }
  };

  acceptanceCtrl.resolveHandler = async item => {
    if (!item) {
      context.subscriptions.push(...startWatchingWorkspace('tests/acceptance/**/*.js', acceptanceCtrl));
      return;
    }

    const data = testData.get(item);
    if (data instanceof TestFile) {
      await data.updateFromDisk(acceptanceCtrl, item);
    }
  };

  function updateNodeForDocument(e: vscode.TextDocument) {
    if (e.uri.scheme !== 'file') {
      return;
    }

    if (!e.uri.path.endsWith('.js')) {
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

  for (const document of vscode.workspace.textDocuments) {
    updateNodeForDocument(document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateNodeForDocument),
    vscode.workspace.onDidChangeTextDocument(e => updateNodeForDocument(e.document))
  );
}

function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
  const existing = controller.items.get(uri.toString());
  if (existing) {
    return { file: existing, data: testData.get(existing) as TestFile };
  }

  const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
  controller.items.add(file);

  const data = new TestFile();
  testData.set(file, data);

  file.canResolveChildren = true;
  return { file, data };
}

function gatherTestItems(collection: vscode.TestItemCollection) {
  const items: vscode.TestItem[] = [];
  collection.forEach(item => items.push(item));
  return items;
}

function startWatchingWorkspace(filePath: string, controller: vscode.TestController) {
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
}
