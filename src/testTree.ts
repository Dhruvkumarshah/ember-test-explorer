import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { parseMarkdown } from './parser';
import { runQunitPuppeteer } from './qunit-puppeteer';

const textDecoder = new TextDecoder('utf-8');

export type MarkdownTestData = TestFile | TestHeading | TestCase;

export const TEST_DATA = new WeakMap<vscode.TestItem, MarkdownTestData>();

let generationCounter = 0;

const host = vscode.workspace.getConfiguration('emberServer').get('host');
const port = vscode.workspace.getConfiguration('emberServer').get('port');

export const getContentFromFilesystem = async (uri: vscode.Uri) => {
  try {
    const rawContent = await vscode.workspace.fs.readFile(uri);
    return textDecoder.decode(rawContent);
  } catch (e) {
    console.warn(`Error providing tests for ${uri.fsPath}`, e);
    return '';
  }
};

export class TestFile {
  public didResolve = false;

  public async updateFromDisk(controller: vscode.TestController, item: vscode.TestItem) {
    try {
      const content = await getContentFromFilesystem(item.uri!);
      item.error = undefined;
      this.updateFromContents(controller, content, item);
    } catch (err) {
      //@ts-ignore
      item.error = err['stack'];
    }
  }

  /**
   * Parses the tests from the input text, and updates the tests contained
   * by this file to be those from the text,
   */
  public updateFromContents(controller: vscode.TestController, content: string, item: vscode.TestItem) {
    const ancestors = [{ item, children: [] as vscode.TestItem[] }];
    const thisGeneration = generationCounter++;
    this.didResolve = true;

    const ascend = (depth: number) => {
      while (ancestors.length > depth) {
        const finished = ancestors.pop()!;
        finished.item.children.replace(finished.children);
      }
    };

    parseMarkdown(content, {
      onTest: (range: vscode.Range, modulename: string, name: string, assertionsRange: vscode.Range[]) => {
        const parent = ancestors[ancestors.length - 1];
        const data = new TestCase(`${name}`, modulename, assertionsRange);
        const id = `${item.uri}/${modulename}/${name}`;
        const tcase = controller.createTestItem(id, name, item.uri);
        TEST_DATA.set(tcase, data);
        tcase.range = range;
        parent.children.push(tcase);
      },

      onHeading: (range: vscode.Range, name: string, depth: number) => {
        ascend(depth);
        const parent = ancestors[ancestors.length - 1];
        const id = `${item.uri}/${name}`;

        const thead = controller.createTestItem(id, name, item.uri);
        thead.range = range;
        TEST_DATA.set(thead, new TestHeading(thisGeneration));
        parent.children.push(thead);
        ancestors.push({ item: thead, children: [] });
      },
    });

    ascend(0); // finish and assign children for all remaining items
  }
}

export class TestHeading {
  constructor(public generation: number) {}
}

export class TestCase {
  constructor(
    private readonly name: string,
    private readonly module: string,
    private readonly assertionsRange: vscode.Range[]
  ) {}

  getLabel() {
    return `${this.name}`;
  }

  getModule() {
    return `${this.module}`;
  }

  async run(item: vscode.TestItem, options: vscode.TestRun, moduleId: string, shouldDebug: boolean): Promise<void> {
    const result = await runQunitPuppeteer(
      {
        // Path to qunit tests suite
        targetUrl: `${host}:${port}/tests/index.html?moduleId=${moduleId}&filter=${encodeURIComponent(
          item.label
        )}&devmode`,
        // (optional, 30000 by default) global timeout for the tests suite
        timeout: 1000000000,
        // (optional, false by default) should the browser console be redirected or not
        redirectConsole: true,
        // (optional, ['--allow-file-access-from-files'] by default) Chrome command-line arguments
        puppeteerArgs: [
          '--allow-file-access-from-files',
          '--remote-debugging-port=9222',
          '--remote-debugging-address=0.0.0.0',
        ],
      },
      shouldDebug
    );

    if (result.stats.failed === 0) {
      options.passed(item);
    } else {
      const logs = result.modules[this.getModule()]?.tests.find(
        (res: { name: string }) => res.name === this.getLabel()
      )?.log;
      const messages: vscode.TestMessage[] = [];

      logs.forEach(
        (log: { result: any; expected: string; actual: string; message: string; source: string }, index: number) => {
          if (!log.result && item.uri) {
            if (log.actual) {
              messages.push({
                ...vscode.TestMessage.diff(`Expected ${log.expected}`, log.expected, log.actual),
                location: new vscode.Location(item.uri, this.assertionsRange[index]),
                message: new vscode.MarkdownString(log.message),
              });
            } else {
              messages.push({
                ...new vscode.TestMessage(`Message: ${log.message}\nSource: ${log.source}`),
                //@ts-ignore
                location: new vscode.Location(item.uri, item.range),
              });
            }
          }
        }
      );

      options.failed(item, messages);
    }
  }
}
