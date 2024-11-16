# Git Repo Window Colors

Color your VSCode Windows based on which git repo you are working in.

## What it does

This extension gives your VSCode window a unique color based on the repository name of the git repository opened as your worksapce.  It does this by immediately writing three colors to the following settings in `.vscode/settings.json`:

```javascript
  "workbench.colorCustomizations": {
    "activityBar.background": "#13332E",
    "titleBar.activeBackground": "#19423B",
    "titleBar.activeForeground": "#F6FBFB"
  }
```

## Usage with Git

To avoid checking `.vscode/settings.json` in to your remote repository without modifying `.gitignore`, you can either:

1. **locally:** add `.vscode/settings.json` to your project's `.git/info/exclude` file

    _or_

2.  **globally:** create and use a global `.gitignore_global` file like so:

    ```git config --global core.excludesfile ~/.gitignore_global```

## Usage

Any custom colors you may have defined previously in a workspace settings.json will be overwritten by this extension.

To configure this extenstion, open the Settings UI, head to the extension settings and update the `Window Colors: Configuration.`  This setting is a json array of objects of this form:

```json
[ 
  { "name": "repo-name-1", "color" : "blue" },
  { "name": "repo-name-2", "color" : "green" } 
]
```

The color value can be any color string code recognized by javascript Color().

When editing the settings, the VSCode window will respond immediately to your edits.  Any errors (broken json, unknown color codes, etc...) are reported via VSCode notifiaction messages.

If your workspace folder is a git repo, then the repository name is extracted using `git config --get remote.origin.url`. If the 'name' value is found in the output of that command (simple sting search), then a match is made and the 'color' from that match is applied to the window.  The first match found is used.

If you use VSCode Settings Sync then these color configuraiton will apply everywhere you use vscode.

## Notes

Workspaces containing multiple root folders are not currently supported by this extension.  The current behavior for multi-folder workspaces is that the workspace color settings will be set by the first window opened, and can be saved in the workspace's `<workspace-name>.code-workspace` configuration file.

When opening new VSCode windows, you might see the relevant theme colors change as they are updated to the new workspace.  This is normal

## Credits

This projects was inspired by and forked from https://github.com/stuartcrobinson/unique-window-colors

