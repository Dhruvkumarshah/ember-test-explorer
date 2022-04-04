import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
import * as puppeteer from 'puppeteer-core';
import { Browser, Page } from 'puppeteer-core';
import { QUnitCallbackEvents } from './qunit/callback-events';
import { QUnitDetails } from './qunit/test-details';
import { QUnitModule, QUnitTestCase } from './qunit/qunit-test-module';
import { QUNIT_SUBJECT } from './qunit/listener';

const qUnitCallbackEvents: QUnitCallbackEvents = {
  begin: 'QUNIT_CALLBACK_BEGIN',
  log: 'QUNIT_CALLBACK_LOG',
  done: 'QUNIT_CALLBACK_DONE',
  moduleDone: 'QUNIT_CALLBACK_MODULE_DONE',
  moduleStart: 'QUNIT_CALLBACK_MODULE_START',
  testDone: 'QUNIT_CALLBACK_TEST_DONE',
  testStart: 'QUNIT_CALLBACK_TEST_START',
};

export class ExtendPuppeteerQUnit {
  private static instance: ExtendPuppeteerQUnit;

  browserInstance!: Promise<Browser>;
  pageInstance!: Promise<Page>;
  canDebug: boolean = false;
  testModules: QUnitModule[] = [];

  get isDebugging() {
    return this.canDebug;
  }

  get browser() {
    return this.browserInstance;
  }

  get page() {
    return this.pageInstance;
  }

  get modules() {
    return this.testModules;
  }

  public static getInstance(canDebug: boolean = false): ExtendPuppeteerQUnit {
    if (!ExtendPuppeteerQUnit.instance) {
      ExtendPuppeteerQUnit.instance = new ExtendPuppeteerQUnit();
      ExtendPuppeteerQUnit.instance.browserInstance = puppeteer.launch({
        defaultViewport: null,
        ignoreHTTPSErrors: true,
        args: [
          '--allow-file-access-from-files',
          '--remote-debugging-port=9222',
          '--remote-debugging-address=0.0.0.0',
          '--ignore-certificate-errors',
          '--allow-sandbox-debugging',
        ],
        headless: !canDebug,
        executablePath: vscode.workspace.getConfiguration('emberServer').get('puppeteerExecutablePath'),
        devtools: canDebug,
      });
    }

    return ExtendPuppeteerQUnit.instance;
  }

  async configurePuppeteer(index: number = 0) {
    this.pageInstance = (await this.browserInstance).newPage();
    (await this.pageInstance).on('console', msg => OUTPUT_CHANNEL.appendLine(msg.text()));
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_BEGIN_${index}`, (details: QUnitDetails) => {
      QUNIT_SUBJECT.next({
        name: `QUNIT_CALLBACK_BEGIN_${index}`,
        details,
      });
      OUTPUT_CHANNEL.appendLine(`Test amount: ${details.totalTests}`);
    });
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_LOG_${index}`, (details: QUnitDetails) => {
      QUNIT_SUBJECT.next({
        name: `QUNIT_CALLBACK_LOG_${index}`,
        details,
      });
      OUTPUT_CHANNEL.appendLine(`Log: ${details.result}, ${details.message}`);
    });
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_MODULE_START_${index}`, (details: QUnitDetails) =>
      OUTPUT_CHANNEL.appendLine(`Now running: ${details.name}`)
    );
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_MODULE_DONE_${index}`, (details: QUnitDetails) =>
      OUTPUT_CHANNEL.appendLine(`Finished running: ${details.name} Failed/total: ${details.failed}/${details.total}`)
    );

    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_TEST_START_${index}`, (details: QUnitDetails) => {
      OUTPUT_CHANNEL.appendLine(`Now running: ${details.module} ${details.name}`);
    });
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_TEST_DONE_${index}`, (details: QUnitDetails) => {
      QUNIT_SUBJECT.next({
        name: `QUNIT_CALLBACK_TEST_DONE_${index}`,
        details: JSON.parse(JSON.stringify(details)),
      });

      OUTPUT_CHANNEL.appendLine(JSON.stringify(details, null, 2));
    });
    await (
      await this.pageInstance
    ).exposeFunction(`QUNIT_CALLBACK_DONE_${index}`, (details: QUnitDetails) => {
      QUNIT_SUBJECT.next({
        name: `QUNIT_CALLBACK_DONE_${index}`,
        details: JSON.parse(JSON.stringify(details)),
      });
      QUNIT_SUBJECT.reset();
      OUTPUT_CHANNEL.appendLine(
        `Total: ${details.total} Failed: ${details.failed} ` + `Passed: ${details.passed} Runtime: ${details.runtime}`
      );
    });

    await (await this.pageInstance).setCacheEnabled(true);
    await (
      await this.pageInstance
    ).evaluateOnNewDocument(
      (evaluateArgs: QUnitCallbackEvents, i: number) => {
        let qUnit: any;
        Object.defineProperty(window, 'QUnit', {
          get: () => qUnit,
          set: qUnitValue => {
            qUnit = qUnitValue;

            for (const [key, value] of Object.entries(evaluateArgs)) {
              qUnit[key]((window as any)[`${value}_${i}`]);
            }
          },
          configurable: true,
        });
      },
      qUnitCallbackEvents,
      index
    );
    return this.pageInstance;
  }

  async loadTestModules() {
    const page = await (await this.browserInstance).newPage();
    await page.goto(
      `${vscode.workspace.getConfiguration('emberServer').get('host')}:${vscode.workspace
        .getConfiguration('emberServer')
        .get('port')}/tests/index.html?testId=0`
    );
    this.testModules = await page.evaluate(() =>
      (window as any).QUnit.config.modules.map((module: QUnitModule) => {
        return {
          name: module.name,
          moduleId: module.moduleId,
          tests: module.tests.map((test: QUnitTestCase) => {
            return {
              name: test.name,
              testId: test.testId,
            };
          }),
        };
      })
    );
    await page.close();
    return this.testModules;
  }

  public static async resetInstance(canDebug: boolean): Promise<ExtendPuppeteerQUnit> {
    if (ExtendPuppeteerQUnit.instance) {
      (await ExtendPuppeteerQUnit.instance.browser).close();
    }
    ExtendPuppeteerQUnit.instance = new ExtendPuppeteerQUnit();
    ExtendPuppeteerQUnit.instance.browserInstance = puppeteer.launch({
      defaultViewport: null,
      ignoreHTTPSErrors: true,
      args: [
        '--allow-file-access-from-files',
        '--remote-debugging-port=9222',
        '--remote-debugging-address=0.0.0.0',
        '--ignore-certificate-errors',
        '--allow-sandbox-debugging',
      ],
      headless: !canDebug,
      executablePath: vscode.workspace.getConfiguration('emberServer').get('puppeteerExecutablePath'),
      devtools: false,
    });

    return ExtendPuppeteerQUnit.instance;
  }
}
