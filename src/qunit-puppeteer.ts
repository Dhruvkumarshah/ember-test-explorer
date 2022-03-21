import * as vscode from 'vscode';
import { OUTPUT_CHANNEL } from './error-output';
const puppeteer = require('puppeteer-core');

const DEFAULT_TIMEOUT = 30000;
const CALLBACKS_PREFIX = 'qunit_puppeteer_runner';
const MODULE_START_CB = `${CALLBACKS_PREFIX}_moduleStart`;
const MODULE_DONE_CB = `${CALLBACKS_PREFIX}_moduleDone`;
const TEST_START_CB = `${CALLBACKS_PREFIX}_testStart`;
const TEST_DONE_CB = `${CALLBACKS_PREFIX}_testDone`;
const LOG_CB = `${CALLBACKS_PREFIX}_log`;
const BEGIN_CB = `${CALLBACKS_PREFIX}_begin`;
const DONE_CB = `${CALLBACKS_PREFIX}_done`;

let qUnitBrowserInstance: any;
let _shouldDebug: boolean;

/**
 * Helper function that allows resolve promise externally
 */
function defer() {
  let deferred: any = {
    promise: null,
    resolve: null,
    reject: null,
  };

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
}

/**
 * Simple object cloning
 * @param {*} object Object to clone
 */
function deepClone(object: any) {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Exposes callback functions
 * @param {Page} page Puppeteer page
 * @returns {object} a deferred object (see defer) that will be resolved or rejected
 * when all tests are done. This object will receive a {QunitTestResult} parameter
 */
async function exposeCallbacks(page: any) {
  const result: any = {
    modules: {},
  };

  const deferred = defer();

  await page.exposeFunction(BEGIN_CB, (context: any) => {
    try {
      result.totalTests = context.totalTests;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(DONE_CB, (context: any) => {
    try {
      result.stats = deepClone(context);
      deferred.resolve(result);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(TEST_DONE_CB, (context: any) => {
    try {
      const test = deepClone(context);
      const module = result.modules[test.module];
      const currentTest = module.tests.find((t: any) => t.name === test.name);
      Object.assign(currentTest, test);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(MODULE_START_CB, (context: any) => {
    try {
      const module = deepClone(context);
      result.modules[module.name] = module;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(MODULE_DONE_CB, (context: any) => {
    try {
      const module = deepClone(context);
      const currentModule = result.modules[module.name];
      currentModule.failed = module.failed;
      currentModule.passed = module.passed;
      currentModule.runtime = module.runtime;
      currentModule.total = module.total;
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(TEST_START_CB, (context: any) => {
    try {
      const test = deepClone(context);
      const module = result.modules[test.module];
      const currentTest = module.tests.find((t: any) => t.name === test.name);
      Object.assign(currentTest, test);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  await page.exposeFunction(LOG_CB, (context: any) => {
    try {
      const record = deepClone(context);
      const module = result.modules[record.module];
      const currentTest = module.tests.find((t: any) => t.name === record.name);

      currentTest.log = currentTest.log || [];
      currentTest.log.push(record);
    } catch (ex) {
      deferred.reject(ex);
    }
  });

  return deferred;
}

/**
 * Runs Qunit tests using the specified `puppeteer.Page` instance.
 * @param {puppeteer.Page} page - Page instance to use for running tests
 * @param {QunitPuppeteerArgs} qunitPuppeteerArgs - Configuration for the test runner
 */
export async function runQunitWithPage(page: any, qunitPuppeteerArgs: any) {
  const timeout = qunitPuppeteerArgs.timeout || DEFAULT_TIMEOUT;

  // Prepare the callbacks that will be called by the page
  const deferred = await exposeCallbacks(page);

  // Run the timeout timer just in case
  const timeoutId = setTimeout(() => {
    deferred.reject(new Error(`Test run could not finish in ${timeout}ms`));
  }, timeout);

  // Configuration for the in-page script (will be passed via evaluate to the page script)
  const evaluateArgs = {
    testTimeout: timeout,
    callbacks: {
      begin: BEGIN_CB,
      done: DONE_CB,
      moduleStart: MODULE_START_CB,
      moduleDone: MODULE_DONE_CB,
      testStart: TEST_START_CB,
      testDone: TEST_DONE_CB,
      log: LOG_CB,
    },
  };

  // eslint-disable-next-line no-shadow
  await page.evaluateOnNewDocument((evaluateArgs: any) => {
    /* global window */
    // IMPORTANT: This script is executed in the context of the page
    // YOU CANNOT ACCESS ANY VARIABLE OUT OF THIS BLOCK SCOPE

    // Save these globals immediately in order to avoid
    // messing with in-page scripts that can redefine them
    const jsonParse = JSON.parse;
    const jsonStringify = JSON.stringify;
    const objectKeys = Object.keys;

    /**
     * Clones QUnit context object in a safe manner:
     * https://github.com/ameshkov/node-qunit-puppeteer/issues/16
     *
     * @param {*} object - object to clone in a safe manner
     */
    function safeCloneQUnitContext(object: any) {
      const clone: any = {};
      objectKeys(object).forEach(prop => {
        const propValue = object[prop];
        if (propValue === null || typeof propValue === 'undefined') {
          clone[prop] = propValue;
          return;
        }

        try {
          clone[prop] = jsonParse(jsonStringify(propValue));
        } catch (ex) {
          // Most likely this is a circular structure
          // In this case we just call toString on this value
          clone[prop] = propValue.toString();
        }
      });

      return clone;
    }

    /**
     * Changes QUnit so that their callbacks were passed to the main program.
     * We call previously exposed functions for every QUnit callback.
     *
     * @param {*} QUnit - qunit global object
     */
    function extendQUnit(QUnit: any) {
      try {
        // eslint-disable-next-line
        QUnit.config.testTimeout = evaluateArgs.testTimeout;

        // Pass our callback methods to QUnit
        const callbacks = Object.keys(evaluateArgs.callbacks);
        for (let i = 0; i < callbacks.length; i += 1) {
          const qunitName = callbacks[i];
          const callbackName = evaluateArgs.callbacks[qunitName];
          QUnit[qunitName]((context: any) => {
            //@ts-ignore
            window[callbackName](safeCloneQUnitContext(context));
          });
        }
      } catch (ex) {
        const Console = console;
        Console.error(`Error while executing the in-page script: ${ex}`);
      }
    }

    let qUnit: any;
    Object.defineProperty(window, 'QUnit', {
      get: () => qUnit,
      set: value => {
        qUnit = value;
        extendQUnit(qUnit);
      },
      configurable: true,
    });
  }, evaluateArgs);

  // Open the target page
  await page.goto(qunitPuppeteerArgs.targetUrl);

  // Wait for the test result
  const qunitTestResult = await deferred.promise;

  // All good, clear the timeout
  clearTimeout(timeoutId);

  return qunitTestResult;
}

/**
 * Runs Qunit tests using the specified `puppeteer.Page` instance.
 *
 * @param {puppeteer.Browser} browser - Puppeteer browser instance to use for running tests
 * @param {QunitPuppeteerArgs} qunitPuppeteerArgs - Configuration for the test runner
 */
async function runQunitWithBrowser(browser: any, qunitPuppeteerArgs: any) {
  // Opens a page where we'll run the tests
  const page = await browser.newPage();

  // Run the tests
  return runQunitWithPage(page, qunitPuppeteerArgs);
}

/**
 * Opens the specified HTML page in a Chromium puppeteer and captures results of a test run.
 * @param {QunitPuppeteerArgs} qunitPuppeteerArgs Configuration for the test runner
 */
export async function runQunitPuppeteer(qunitPuppeteerArgs: any, shouldDebug: boolean) {
  if (!qUnitBrowserInstance || _shouldDebug !== shouldDebug) {
    if (qUnitBrowserInstance) {
      qUnitBrowserInstance.close();
    }
    qUnitBrowserInstance = await setupPuppeteer(shouldDebug);
  }
  if (_shouldDebug) {
    const pages = await qUnitBrowserInstance.pages();
    if (pages?.length > 3) {
      for (let i = 0; i < pages.length - 2; i++) {
        pages[i]?.close();
      }
    }
  }
  _shouldDebug = shouldDebug;
  try {
    return await runQunitWithBrowser(qUnitBrowserInstance, qunitPuppeteerArgs);
  } catch (err) {
    OUTPUT_CHANNEL.appendLine('Error While running the tests with Browser!: ' + err);
  }
}

export async function setupPuppeteer(shouldDebug: boolean) {
  return puppeteer.launch({
    ignoreHTTPSErrors: true,
    args: [
      '--allow-file-access-from-files',
      '--remote-debugging-port=9222',
      '--remote-debugging-address=0.0.0.0',
      '--ignore-certificate-errors',
      '--allow-sandbox-debugging',
    ],
    headless: !shouldDebug,
    executablePath: vscode.workspace.getConfiguration('emberServer').get('puppeteerExecutablePath'),
  });
}
