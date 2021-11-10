import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { parseMarkdown } from './parser';

const textDecoder = new TextDecoder('utf-8');

export type MarkdownTestData = TestFile | TestHeading | TestCase;

export const testData = new WeakMap<vscode.TestItem, MarkdownTestData>();

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
      //   item.error = err['stack'];
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
      onTest: (range: vscode.Range, modulename: string, name: string) => {
        const parent = ancestors[ancestors.length - 1];
        const data = new TestCase(`${item.uri}/name`);
        const id = `${item.uri}/${modulename}/${name}`;
        const tcase = controller.createTestItem(id, name, item.uri);
        testData.set(tcase, data);
        tcase.range = range;
        parent.children.push(tcase);
      },

      onHeading: (range: vscode.Range, name: string, depth: number) => {
        ascend(depth);
        const parent = ancestors[ancestors.length - 1];
        const id = `${item.uri}/${name}`;

        const thead = controller.createTestItem(id, name, item.uri);
        thead.range = range;
        testData.set(thead, new TestHeading(thisGeneration));
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
  constructor(private readonly name: string) {}

  getLabel() {
    return `${this.name}`;
  }

  async run(item: vscode.TestItem, options: vscode.TestRun): Promise<void> {}
}
