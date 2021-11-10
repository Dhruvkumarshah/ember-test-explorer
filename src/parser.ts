import * as vscode from 'vscode';
const parser = require('typescript-estree');

export const parseMarkdown = (
  text: string,
  events: {
    onTest(range: vscode.Range, modulename: string, name: string): void;
    onHeading(range: vscode.Range, name: string, depth: number): void;
  }
) => {
  const lines = text.split('\n');
  const ast = parser.parse(text);

  const moduleExpressions = ast?.body?.filter(
    (statement: any) => statement?.type === 'ExpressionStatement' && statement.expression?.callee?.name === 'module'
  );

  if (moduleExpressions) {
    moduleExpressions.forEach((module: any) => {
      const moduleName = module.expression.arguments[0];
      const testSuite = module.expression.arguments[1]?.body?.body;
      for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo];

        if (line.includes("module('" + moduleName.value + "'") || line.includes('module("' + moduleName.value + '"')) {
          const testCases = testSuite?.filter((testCase: any) => testCase.expression?.callee?.name === 'test');
          events.onHeading(
            new vscode.Range(new vscode.Position(lineNo, 0), new vscode.Position(lineNo, line.length)),
            moduleName.value,
            1
          );
          testCases?.forEach((testCase: any) => {
            const testCaseName = testCase.expression.arguments[0];

            for (let testCaseLineNo = 0; testCaseLineNo < lines.length; testCaseLineNo++) {
              const testCaseLine = lines[testCaseLineNo];
              if (
                testCaseLine.includes("test('" + testCaseName.value + "'") ||
                testCaseLine.includes('test("' + testCaseName.value + '"')
              ) {
                events.onTest(
                  new vscode.Range(
                    new vscode.Position(testCaseLineNo, 0),
                    new vscode.Position(testCaseLineNo, testCaseLine.length)
                  ),
                  moduleName.value,
                  testCaseName.value
                );
              }
            }
          });
        }
      }
    });
  }
};
