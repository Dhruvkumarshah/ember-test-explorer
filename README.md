# ember-test-explorer README

This is the ember-test-explorer vscode extension to help display & debug ember tests inside vscode.

## Features

This plugin help us to visualize the ember test cases.

![Feature Walk Through](./feature-walkthrough.gif)

## Requirements

Works for Ember project. Ember CLI is configured!
Ember serve should be started before initializing plugin.(buggy as of now)
Setup emberServer contributes property, default: (Updated in workspace settings.json file under .vscode folder)
Please check out Feature Contributions settings for this plugin to get list of settings.

To attach process to debugger, run in debug mode first weight for chrome to launch using 9222 port & then attach it to vscode using following setup in launch.json:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch local",
      "type": "chrome",
      "request": "attach",
      "url": "http://localhost:4200*", // Update with your host & port name
      "webRoot": "${workspaceFolder}",
      "port": 9222,
      "sourceMapPathOverrides": {
        "super-rental/*": "${workspaceRoot}/app/*", // Update module-prefix based on env.ts file
        "super-rental/tests/*": "${workspaceRoot}/tests/*" // Update module-prefix based on env.ts file
      }
    }
  ]
}
```

## Extension Settings

Extension is enabled when ember test cases detected.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release!
