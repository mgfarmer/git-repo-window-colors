# Git Repo Window Colors

Color your VSCode Windows based on which git repo you are working in.

## What it does

This extension allow you to give your VSCode window a custom color based on the repository name of the git repository opened as your worksapce.  It does this by immediately writing the following settings in `.vscode/settings.json`:

```json
  "workbench.colorCustomizations": {
    "activityBar.background": "#XXXXXX",
    "activityBar.foreground": "#XXXXXX",
    "titleBar.activeBackground": "#XXXXXX",
    "titleBar.activeForeground": "#XXXXXX",
    "titleBar.inactiveBackground": "#XXXXXX",
    "titleBar.inactiveForeground": "#XXXXXX"
  }
```
This plugin works best with these two settings also set:

```json
"workbench.colorCustomizations": {
    "window.customTitleBarVisibility": "auto",
    "window.titleBarStyle": "custom"
}
```


If you are like me and have multiple vscode windows opened all the time, working on different repositories, you know it can be hard to differentiate the windows visually.  By assigning custom colors to the title and activity bars, this plugin aims to alleviate this problem.  This also helps when viewing the thumbnail previews displayed by most docks (Windows Taskbar, Ubuntu Dock, etc...)

## Usage

Any custom color settings managed by this plugin that you may have defined previously in a workspace settings.json will be overwritten by this extension.

To configure this extenstion, open the Settings UI and update the `Window Colors: Repo Configuration List.`  

This setting is a configurable list of string entries.  Each string has this format schema:

`<repo-qualifier>[/<default-branch>] : <primary-color>[/<branch-color>]`

Where:
- `<repo-qualifier>`: This is required. The repository qualifier is a simple string. If this string is found in the repository URL as given by `git config --get remote.origin.url`, then a match is made.  The first match found  will be used.
- `<default-branch>`: This is optional. and represents the default GitHub branch for the repository. If the `default-branch` is specified then the activity bar will be shown in a different color when you are not working on the default branch. This other color is specified either by the `branch-color` setting, if provided, or automatically determined using the `Automatic Branch Indicator Color Knob` in settings. You can invert the branch coloring logic in the settings as well.
- `<primary-color>`: This is required.  The primary color is the color associated with the repository.  This color will be used to color the window title bar and activity bar (when not using branch colors).
- `<branch-color>`: This is a color that will be used for the activity bar when working on a non-default branch, or on the default branch, depending on the `Invert Branch Color Logic` setting.

The color value can be any color string code recognized by javascript `Color()`.  

When editing the settings, the VSCode window will respond immediately to your edits.  Any errors (broken json, unknown color codes, etc...) are reported via VSCode notifiaction messages.

If your workspace folder is not a git repo, then no coloring will happen.

If you use VSCode Settings Sync then these color configuraiton will apply everywhere you use vscode.

## Notes

Workspaces containing multiple root folders are not currently supported by this extension.  The current behavior for multi-folder workspaces is that the workspace color settings will be set by the first window opened, and can be saved in the workspace's `<workspace-name>.code-workspace` configuration file.

When opening new VSCode windows, you might see the relevant theme colors change as they are updated to the new workspace.  This is normal

## Credits

This projects was inspired by and forked from https://github.com/stuartcrobinson/unique-window-colors.

