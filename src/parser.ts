import * as vscode from 'vscode';
const parser = require('typescript-estree');

export const parseMarkdown = (
  text: string,
  events: {
    onTest(range: vscode.Range, modulename: string, name: string, assertionsRange: vscode.Range[]): void;
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
          const onTests: any[] = [];
          testCases?.forEach((testCase: any) => {
            const assertions = testCase.expression.arguments[1].body.body.filter(
              (body: any) =>
                body.expression?.callee?.object?.name === 'assert' ||
                body.expression?.callee?.object?.callee?.object?.name === 'assert'
            );

            const assertionsRange = assertions.map((res: any) => {
              const loc = res.expression.callee.object.callee?.object?.loc || res.expression.callee.object.loc;
              return new vscode.Range(
                new vscode.Position(loc.start.line - 1, 0),
                new vscode.Position(loc.start.line - 1, loc.end.column)
              );
            });

            const testCaseName = testCase.expression.arguments[0];

            for (let testCaseLineNo = 0; testCaseLineNo < lines.length; testCaseLineNo++) {
              const testCaseLine = lines[testCaseLineNo];
              let range;
              let _moduleName;
              let _testCaseName;
              if (
                testCaseLine.includes("test('" + testCaseName.value + "'") ||
                testCaseLine.includes('test("' + testCaseName.value + '"')
              ) {
                range = new vscode.Range(
                  new vscode.Position(testCaseLineNo, 0),
                  new vscode.Position(testCaseLineNo, testCaseLine.length)
                );
                _moduleName = moduleName.value;
                _testCaseName = testCaseName.value;
              }
              if (_testCaseName) {
                onTests.push({
                  range,
                  moduleName: _moduleName,
                  testCaseName: _testCaseName,
                  assertionsRange,
                });
              }
            }
          });

          onTests.forEach(test => {
            console.log(test.moduleName, test.testCaseName, test.assertionsRange);
            events.onTest(test.range, test.moduleName, test.testCaseName, test.assertionsRange);
          });
        }
      }
    });
  }
};
