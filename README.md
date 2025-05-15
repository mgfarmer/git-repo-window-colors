# Git Repo Window Colors

Color your VSCode Windows based on which git repo you are working in.

If you find this extension useful you can <a href="https://www.buymeacoffee.com/KevinMills" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## What it does

This extension allow you to give your VSCode window a custom color "frame" based on the name of the git repository opened as your worksapce. It does this by immediately writing color settings in `.vscode/settings.json` file.

If you are like me and have multiple vscode windows opened all the time, working on different repositories, you know it can be hard to differentiate the windows visually. By assigning custom colors to the title and activity bars, this plugin aims to alleviate this problem. This also helps when viewing the thumbnail previews displayed by most docks (Windows Taskbar, Ubuntu Dock, etc...)

This plugin works best with these two settings also set:

```json
"workbench.colorCustomizations": {
    "window.customTitleBarVisibility": "auto",
    "window.titleBarStyle": "custom"
}
```

## Usage

LET IT BE KNOWN: Any custom color settings managed by this plugin that you may have defined previously in a workspace .vscode/settings.json will be overwritten by this extension.

This extension creates the following commands, accessible from the Command Palatte:

- "Colorize this repo" Use this command to add a coloring rule for the repo in you current workspace. If a rule already matches this repo, this command will fill in the values for the current rule, allowing you to modify the rule.
- "Decolorize this repo" Use this command to remove the rule (if any) that currently applies to your workspace.

Advanced configuration can be done via User Settings UI or directly in the User Settings JSON file.

### Status Reporting

Status reporting for this extension can be found in the 'Git Repo Window Colors" output channel. Go there if things are not working as you expect.  Maybe there will be enough information to help you (or me) out.  Please include the output in this channel in any bug reports.

### Repo Configuration Setting

This is optional.  This section defines settings that match repo urls and applies colors for the matched repo.

This setting is a configurable list of string entries. Each string has this format schema:

`<repo-qualifier>[|<default-branch>] : <primary-color>[|<branch-color>]`

Where:

- `<repo-qualifier>`: This is required. The repository qualifier is a simple string. If this string is found in the repository fetch URL (what you'd get with `git config --get remote.origin.url`), then a match is made. The first match found will be used.
- `<default-branch>`: This is optional. and represents the default GitHub branch for the repository. If the `default-branch` is specified then the activity bar will be shown in a different color when you are not working on the default branch. This other color is specified either by the `branch-color` setting, if provided, or automatically determined using the `Automatic Branch Indicator Color Knob` in settings. You can invert the branch coloring logic in the settings as well.

- `<primary-color>`: This is required. The primary color is the color associated with the repository. This color will be used to color the window title bar and activity bar (when not using branch colors).

- `<branch-color>`: This is a color that will be used for the activity bar when working on a non-default branch, or on the default branch, depending on the `Invert Branch Color Logic` setting.

The color value can be any color string code recognized by javascript `Color()`.

When editing the settings, the VSCode window will respond immediately to your edits. Any errors (broken json, unknown color codes, etc...) are reported via VSCode notifiaction messages. Any entry with an error is ignored.

If your workspace folder is not a git repo, then no coloring will happen.

### Branch Configuration Setting

The Repo Configuration describe above can do basic branch indications like "I'm working on the default branch" (one color) or "I'm working on a non-default branch" (another color). The Branch Configuration section takes this to the NEXT LEVEL. Using this section is completely optional, but you may find it hard to resist the power it offers.

Using this setting you can assign custom colors to specific branch names or branch patterns. Say you are using a bug tracker like Jira where you have FEATURE and BUG type issues. Your flow mandates that you create branch names like `FEATURE-23-My-Awsome-Feature`, or `BUG-1-My-Nightmare-Bug`. You can use this section to configure one color to identify all feature branch work, and another color for bug fix branches. You can even assign a color to that one special feature you're working on, but haven't told anyone about.

Each entry in this section is a simple `<branch-pattern>:<color>` string. The `<branch-patter>` is a regular expression, or a simple string. If a branch-pattern in this table is matched against the current working branch of any repo your are working on, then this setting will override any branch coloring from the repo configuration list above, and be applied. The first match found is used. Branches defined in this list are not tied to a repo, meaning that if you are working on any repo who's working branch matches the pattern the coloring will be applied. So if you have 3 vscode windows open on three repositories all working on the same feature or bug branch, you'll know right away which windows you should focus on.

The settings in this section apply to any opened repo, regarless of the per-repo color settings.  This means you do not need to have a repo rule matched in order to use branch colors.  If you do have a matched repo rule then the repo color will be applied.  If a branch rule does not match the activity bar will take on the repo color, and if a branch rule matches the activity bar will take on the branch color.  If a repo rule does not match and a branch rule does match, then the branch color will be applied everywhere (like a repo color).

### Setting Sync

If you use Settings Sync then these color configuraiton will apply everywhere you use vscode. It's pretty cool to change a color setting in one instance and see it updated in other instance.

## Notes

This extension works best when you have .vscode/settings.jon in your .gitignore file (either locally or globally). It will work without this, but you may end up committing your custom colors to your repo which might be problematic to other people working in the repo that do not have this SUPER COOL extension installed. I highly recommend you just tell them to install it.

Workspaces containing multiple root folders may not behave predictably. The current behavior for multi-folder workspaces is that the workspace color settings will be set by the first folder opened.

When opening new vscode windows, you might see the relevant theme colors change as they are updated to the new workspace. This is normal.
