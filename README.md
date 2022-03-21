# ember-test-explorer README

This is the ember-test-explorer vscode extension to help display & debug ember tests inside vscode.

## Features

This plugin help us to visualize the ember test cases.

## Requirements

Works for Ember project. Ember CLI is configured!
Ember serve should be started before initializing plugin.(buggy as of now)
Setup emberServer contributes property, default: (Updated in workspace settings.json file under .vscode folder)

{
"emberServer.host": "localhost",
"emberServer.port": 4200,
"emberServer.puppeteerExecutablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
}

To attach process to debugger, run in debug mode first weight for chrome to launch using 9222 port & then attach it to vscode using following setup in launch.json:

{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch local",
      "type": "chrome",
      "request": "attach",
      "url": "http://localhost:4200*",
      "webRoot": "${workspaceFolder}",
      "port": 9222,
      "sourceMapPathOverrides": {
        "super-rental/*": "${workspaceRoot}/app/*",
        "super-rental/tests/*": "${workspaceRoot}/tests/*"
      }
    }
  ]
}

## Extension Settings

Extension is enabled when ember test cases detected.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release!
