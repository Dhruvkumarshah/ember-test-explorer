import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { parseMarkdown } from './parser';
import { QUNIT_MODULES } from './qunit/util';

const textDecoder = new TextDecoder('utf-8');

export type MarkdownTestData = TestFile | TestHeading | TestCase;

export const TEST_DATA = new WeakMap<vscode.TestItem, MarkdownTestData>();

let generationCounter = 0;

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
        const module = QUNIT_MODULES.modules.find(mod => mod.name === modulename);
        const test = module?.tests.find(t => t.name === name);
        if (module && test) {
          const data = new TestCase(name, test.testId, modulename, assertionsRange);
          const tcase = controller.createTestItem(test.testId, name, item.uri);
          tcase.tags = [new vscode.TestTag('TEST')];
          TEST_DATA.set(tcase, data);
          tcase.range = range;
          parent.children.push(tcase);
        }
      },

      onHeading: (range: vscode.Range, name: string, depth: number) => {
        ascend(depth);
        const parent = ancestors[ancestors.length - 1];
        const module = QUNIT_MODULES.modules.find(mod => mod.name === name);
        if (module) {
          const thead = controller.createTestItem(module.moduleId, name, item.uri);
          thead.tags = [new vscode.TestTag('MODULE')];
          thead.range = range;
          TEST_DATA.set(thead, new TestHeading(thisGeneration));
          parent.children.push(thead);
          ancestors.push({ item: thead, children: [] });
        }
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
    private readonly testId: string,
    private readonly module: string,
    private readonly assertionsRange: vscode.Range[]
  ) {}

  getLabel() {
    return this.name;
  }

  getModule() {
    return this.module;
  }

  getTestId() {
    return this.testId;
  }

  getAssertionsRange() {
    return this.assertionsRange;
  }
}
