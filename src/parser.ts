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

      events.onHeading(
        new vscode.Range(
          new vscode.Position(module.loc.start.line === 0 ? 0 : module.loc.start.line - 1, module.loc.start.column),
          new vscode.Position(module.loc.end.line, module.loc.end.column)
        ),
        moduleName.value,
        1
      );

      testSuite.forEach((test: any) => {
        const testCallee = test?.expression?.callee;
        if (testCallee?.name === 'test') {
          const assertions = test.expression.arguments[1].body.body.filter(
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

          events.onTest(
            new vscode.Range(
              new vscode.Position(
                testCallee.loc.start.line === 0 ? 0 : testCallee.loc.start.line - 1,
                testCallee.loc.start.column
              ),
              new vscode.Position(testCallee.loc.end.line, testCallee.loc.end.column)
            ),
            moduleName.value,
            test.expression?.arguments[0].value,
            assertionsRange
          );
        }
      });
    });
  }
};
