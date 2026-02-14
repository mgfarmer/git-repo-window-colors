# Copilot Instructions for Git Repo Window Colors VS Code Extension

## Repository Overview

This is a Visual Studio Code extension called "Git Repo Window Colors" that customizes VS Code window colors (title bar, activity bar, tabs, status bar) based on the git repository name and current branch. The extension helps users visually differentiate between multiple VS Code windows when working on different repositories or branches.

**Latest Update**: The extension now features a comprehensive webview-based configuration interface with drag-and-drop rule management, built-in color pickers, comprehensive testing, and full accessibility support.

## Key Information

-   **Extension Name**: Git Repo Window Colors
-   **Publisher**: KevinMills
-   **Current Version**: 1.2.0
-   **Repository**: mgfarmer/git-repo-window-colors
-   **VS Code Engine**: ^1.90.0
-   **Language**: TypeScript
-   **Build System**: Webpack + TypeScript

## Project Structure

```
/
├── src/
│   └── extension.ts          # Main extension logic
├── img/
│   └── icon_602.png         # Extension icon
├── package.json             # Extension manifest and configuration
├── tsconfig.json            # TypeScript configuration
├── webpack.config.js        # Webpack build configuration
├── README.md                # Documentation
├── CHANGELOG.md             # Version history
├── LICENSE                  # MIT License
└── notes.txt                # Development notes
```

## Core Functionality

### Main Features

1. **Repository-based coloring**: Colors windows based on git repository URL matching
2. **Branch-based coloring**: Different colors for default vs non-default branches
3. **Pattern-based branch coloring**: Regex patterns for specific branch naming conventions
4. **Automatic color management**: Modifies `.vscode/settings.json` colorCustomizations
5. **Real-time updates**: Monitors branch changes and updates colors accordingly

### Commands

-   `windowColors.openConfig`: Opens the comprehensive webview configuration interface (NEW)
-   `windowColors.colorize`: Add/edit coloring rule for current repository
-   `windowColors.decolorize`: Remove coloring rule for current repository

### Configuration Settings

-   `windowColors.repoConfigurationList`: Array of repo-to-color mappings
-   `windowColors.branchConfigurationList`: Array of branch pattern-to-color mappings
-   `windowColors.removeManagedColors`: Auto-remove colors when no rules match
-   `windowColors.invertBranchColorLogic`: Invert branch color logic
-   `windowColors.colorInactiveTitlebar`: Apply colors to inactive titlebar
-   `windowColors.colorEditorTabs`: Apply colors to editor tabs
-   `windowColors.colorStatusBar`: Apply colors to status bar
-   `windowColors.activityBarColorKnob`: Lighten/darken adjustment (-10 to 10)
-   `windowColors.applyBranchColorToTabsAndStatusBar`: Extend branch colors to tabs/status bar
-   `windowColors.automaticBranchIndicatorColorKnob`: Hue rotation for automatic branch colors

## Technical Architecture

### Dependencies

-   **Runtime**: `color` (color manipulation), `fs-extra` (file operations)
-   **Development**: TypeScript, Webpack, VS Code types
-   **Extension Dependency**: `vscode.git` (for git integration)

### Key Components

1. **Activation**: Triggers on `onStartupFinished`
2. **Git Integration**: Uses VS Code Git API to access repository information
3. **Color Management**: Manipulates `workbench.colorCustomizations` settings
4. **Branch Monitoring**: Polls git HEAD every 1000ms for branch changes
5. **Configuration Parsing**: Handles complex rule parsing with validation

### Color Scheme Logic

-   **Repository Color**: Primary color for titlebar/activity bar
-   **Branch Color**: Secondary color for activity bar when on non-default branches
-   **Theme Adaptation**: Automatically adjusts for light/dark themes
-   **Color Calculation**: Uses luminosity and contrast calculations for text colors

## Development Guidelines

### Code Style

-   **Prettier Configuration**: Single quotes, 4-space tabs, 120 char width
-   **TypeScript**: Strict mode enabled
-   **ES Target**: ES2021

### Build Process

-   **Development**: `yarn run compile` or `yarn run watch`
-   **Production**: `yarn run vscode:prepublish`
-   **Packaging**: `yarn run package` (creates .vsix)
-   **Publishing**: `yarn run publish`

### Key Files to Understand

#### `src/extension.ts`

-   **Main logic**: ~700 lines of TypeScript
-   **Key functions**:
    -   `activate()`: Extension initialization
    -   `doit()`: Main color application logic
    -   `getMatchingRepoRule()`: Repository rule matching
    -   `getBranchData()`: Branch pattern processing
    -   Git API integration and branch polling

#### `package.json`

-   **Extension manifest**: Defines commands, settings, activation events
-   **Contribution points**: Commands and configuration schema
-   **Dependencies**: Both runtime and development dependencies

## Configuration Format

### Output Channel

Extension logs to "Git Repo Window Colors" output channel for debugging.

### Error Handling

-   Validates color values and shows error notifications
-   Handles git repository detection failures
-   Graceful degradation when git extension unavailable

## Best Practices for Contributors

1. **Color Validation**: Always validate color strings before applying
2. **Git State Management**: Handle cases where git repository isn't available
3. **Performance**: Be mindful of the 1-second polling interval for branch changes
4. **Settings Management**: Preserve existing colorCustomizations when possible
5. **User Experience**: Provide clear error messages and status reporting
6. **Theme Compatibility**: Test with both light and dark themes

## Common Extension Patterns

This extension demonstrates several common VS Code extension patterns:

-   **Configuration Management**: Complex nested settings with validation
-   **Git Integration**: Using VS Code's Git API
-   **Settings Manipulation**: Programmatically updating workspace settings
-   **Event Handling**: Responding to configuration and git state changes
-   **Background Processing**: Polling and real-time updates
-   **Command Registration**: Providing user-accessible commands

When working on this extension, focus on maintaining the balance between functionality and performance, especially regarding the git polling mechanism and color calculations.
