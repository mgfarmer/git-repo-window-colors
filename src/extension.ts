import * as Color from 'color';
//import * as fs from "fs-extra";
//import * as os from "os";
//import * as path from 'path';
import * as vscode from 'vscode';
import { ColorThemeKind, ExtensionContext, window, workspace } from 'vscode';

let currentBranch: undefined | string = undefined;

type RepoConfig = {
    repoQualifier: string;
    defaultBranch: string | undefined;
    primaryColor: string;
    branchColor: string | undefined;
};

const managedColors = [
    'activityBar.background',
    'activityBar.foreground',
    'titleBar.activeBackground',
    'titleBar.activeForeground',
    'titleBar.inactiveBackground',
    'titleBar.inactiveForeground',
    'tab.inactiveBackground',
    'tab.activeBackground',
    'tab.hoverBackground',
    'tab.unfocusedHoverBackground',
    'editorGroupHeader.tabsBackground',
    'titleBar.border',
    'sideBarTitle.background',
    'statusBar.background',
];

const SEPARATOR = '|';

// Function to test if the vscode git model exsists
function isGitModelAvailable(): boolean {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
        console.warn('Git extension not available');
        return false;
    }
    if (!extension.isActive) {
        console.warn('Git extension not active');
        return false;
    }
    return true;
}

function repoConfigAsString(repoConfig: RepoConfig): string {
    let result = repoConfig.repoQualifier;
    if (repoConfig.defaultBranch !== undefined) {
        result += SEPARATOR + repoConfig.defaultBranch;
    }
    result += ': ' + repoConfig.primaryColor;
    if (repoConfig.branchColor !== undefined) {
        result += SEPARATOR + repoConfig.branchColor;
    }
    return result;
}

let outputChannel: vscode.OutputChannel;
let currentConfig: Array<RepoConfig> | undefined = undefined;

export function activate(context: ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Git Repo Window Colors');

    if (!isGitModelAvailable()) {
        outputChannel.appendLine('Git extension not available.');
        outputChannel.appendLine('Do you have git installed?');
        return;
    }

    currentConfig = getRepoConfigList();

    if (!workspace.workspaceFolders) {
        outputChannel.appendLine('No workspace folders.  Cannot color an empty workspace.');
        return;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.colorize', async () => {
            // Find matching rules for the current repo, or none if no match
            const repoName = getCurrentGitRemoteFetchUrl();
            if (repoName === undefined || repoName === '') {
                vscode.window.showErrorMessage('This workspace is not a git repository.');
                return;
            }

            let configList = getRepoConfigList(false);
            if (configList === undefined) {
                configList = new Array<RepoConfig>();
            }

            let isNewConfig: boolean = false;
            let repoConfig = getMatchingRepoRule(configList);

            if (repoConfig === undefined) {
                isNewConfig = true;
                // Create a fresh new rule
                // git@github.com:mgfarmer/git-repo-window-colors.git
                // https://github.com/mgfarmer/git-repo-window-colors.git
                const p1 = repoName.split(':');
                let repoQualifier = '';
                if (p1.length > 1) {
                    const parts = p1[1].split('/');
                    if (parts.length > 1) {
                        const lastPart = parts.slice(-2).join('/');
                        if (lastPart !== undefined) {
                            repoQualifier = lastPart.replace('.git', '');
                        }
                    }
                }

                repoConfig = {
                    repoQualifier: repoQualifier,
                    defaultBranch: undefined,
                    primaryColor: '',
                    branchColor: undefined,
                };
            }

            // Let user change the repo qualifier, if desired
            const newQualifier = await vscode.window.showInputBox({
                prompt: 'Accept or edit the qualifier for this this repository',
                value: repoConfig.repoQualifier,
            });
            if (newQualifier === undefined) {
                return;
            }
            repoConfig.repoQualifier = newQualifier;

            // Let the user enter a color for this rule
            const newColor = await vscode.window.showInputBox({
                prompt: 'Enter a color for this repository',
                value: repoConfig.primaryColor,
            });
            if (newColor === undefined || newColor === '') {
                return;
            }
            repoConfig.primaryColor = newColor;

            // Add repoConfig to the list of rules
            if (isNewConfig) {
                configList.push(repoConfig);
            }
            const configArray = configList.map((item) => repoConfigAsString(item));
            workspace.getConfiguration('windowColors').update('repoConfigurationList', configArray, true);
            currentConfig = getRepoConfigList();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.decolorize', async () => {
            // Find matching rules for the current repo, or none if no match
            const repoName = getCurrentGitRemoteFetchUrl();
            if (repoName === undefined || repoName === '') {
                vscode.window.showErrorMessage('This workspace is not a git repository.');
                return;
            }

            let repoConfig = getMatchingRepoRule(getRepoConfigList(true));
            if (repoConfig === undefined) {
                vscode.window.showErrorMessage(
                    'No rules match this git repository. If this window is colored, you may need to manually edit .vscode/settings.json',
                );
                return;
            }

            vscode.window
                .showInformationMessage('Remove rule: ' + repoConfigAsString(repoConfig), 'Yes', 'No')
                .then((answer: any) => {
                    if (answer === 'No') {
                        return;
                    }

                    const repoConfigList = getRepoConfigList();
                    if (repoConfigList === undefined) {
                        return;
                    }

                    // Remove the specified rule from the list
                    const newRepoConfigList = repoConfigList.filter(
                        (item) => item.repoQualifier !== repoConfig.repoQualifier,
                    );
                    const newArray = newRepoConfigList.map((item) => repoConfigAsString(item));
                    workspace.getConfiguration('windowColors').update('repoConfigurationList', newArray, true);
                    currentConfig = getRepoConfigList();
                    undoColors();
                });
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (
                e.affectsConfiguration('windowColors') ||
                e.affectsConfiguration('window.titleBarStyle') ||
                e.affectsConfiguration('window.customTitleBarVisibility') ||
                e.affectsConfiguration('workbench.colorTheme')
            ) {
                outputChannel.appendLine('\nConfiguration change detected...');
                doit();
            }
        }),
    );

    currentBranch = getCurrentGitBranch();

    const style = workspace.getConfiguration('window').get('titleBarStyle') as string;
    let message = '';
    let restart = false;
    if (style !== 'custom') {
        message += "window.titleBarStyle='custom'";
        restart = true;
    }

    const visibility = workspace.getConfiguration('window').get('customTitleBarVisibility') as string;
    if (visibility !== 'auto') {
        if (message !== '') {
            message += ' and ';
        }
        message += "window.customTitleBarVisibility='auto'";
    }

    if (message !== '') {
        message = 'This plugin works best with ' + message;
        if (restart) {
            message += ' Changing titleBarStyle requires vscode to be restarted.';
        }
        vscode.window.showInformationMessage(message, 'Yes', 'No').then((answer: any) => {
            if (answer === 'No') {
                return;
            }
            workspace.getConfiguration('window').update('customTitleBarVisibility', 'auto', true);
            workspace.getConfiguration('window').update('titleBarStyle', 'custom', true);
        });
    }

    doit();
}

function getRepoConfigList(validate: boolean = false): Array<RepoConfig> | undefined {
    const repoConfigObj = getObjectSetting('repoConfigurationList');
    if (repoConfigObj === undefined || Object.keys(repoConfigObj).length === 0) {
        outputChannel.appendLine('No settings found. Weird!  You should add some...');
        return undefined;
    }

    const json = JSON.parse(JSON.stringify(repoConfigObj));

    const result = new Array<RepoConfig>();
    const isActive = vscode.window.state.active;
    for (const item in json) {
        let error = false;
        const setting = json[item];
        const parts = setting.split(':');
        if (validate && isActive && parts.length < 2) {
            // Invalid entry
            const msg = 'Setting `' + setting + "': missing a color specifier";
            vscode.window.showErrorMessage(msg);
            outputChannel.appendLine(msg);
            error = true;
            continue;
        }

        const repoParts = parts[0].split(SEPARATOR);
        let defBranch: string | undefined = undefined;
        const branchQualifier = repoParts[0].trim();

        if (repoParts.length > 1) {
            defBranch = repoParts[1].trim();
        }

        const colorParts = parts[1].split(SEPARATOR);
        const rColor = colorParts[0].trim();
        let bColor = undefined;
        if (colorParts.length > 1) {
            bColor = colorParts[1].trim();
            if (validate && isActive && defBranch === undefined) {
                const msg = 'Setting `' + setting + "': specifies a branch color, but not a default branch.";
                vscode.window.showErrorMessage(msg);
                outputChannel.appendLine(msg);
                error = true;
            }
        }

        // Test all the colors to ensure they are parseable
        let colorMessage = '';
        try {
            Color(rColor);
        } catch (error) {
            colorMessage = '`' + rColor + '` is not a known color';
        }
        try {
            if (bColor !== undefined) {
                Color(bColor);
            }
        } catch (error) {
            if (colorMessage != '') {
                colorMessage += ' and ';
            }
            colorMessage += '`' + bColor + '` is not a known color';
        }
        if (validate && isActive && colorMessage != '') {
            const msg = 'Setting `' + setting + '`: ' + colorMessage;
            vscode.window.showErrorMessage(msg);
            outputChannel.appendLine(msg);
            error = true;
        }

        const repoConfig: RepoConfig = {
            repoQualifier: branchQualifier,
            defaultBranch: defBranch,
            primaryColor: rColor,
            branchColor: bColor,
        };

        if (!error) {
            result.push(repoConfig);
        }
    }

    return result;
}

function getBranchData(validate: boolean = false): Map<string, string> {
    const branchConfigObj = getObjectSetting('branchConfigurationList');
    const json = JSON.parse(JSON.stringify(branchConfigObj));

    const result = new Map<string, string>();

    for (const item in json) {
        const setting = json[item];
        const parts = setting.split(':');
        if (validate && parts.length < 2) {
            // Invalid entry
            const msg = 'Setting `' + setting + "': missing a color specifier";
            vscode.window.showErrorMessage(msg);
            outputChannel.appendLine(msg);
            continue;
        }

        const branchName = parts[0].trim();
        const branchColor = parts[1].trim();

        // Test all the colors to ensure they are parseable
        let colorMessage = '';
        try {
            Color(branchColor);
        } catch (error) {
            colorMessage = '`' + branchColor + '` is not a known color';
        }
        if (validate && colorMessage != '') {
            const msg = 'Setting `' + setting + '`: ' + colorMessage;
            vscode.window.showErrorMessage(msg);
            outputChannel.appendLine(msg);
        }

        result.set(branchName, branchColor);
    }

    return result;
}

function getBooleanSetting(setting: string): boolean | undefined {
    return workspace.getConfiguration('windowColors').get<boolean>(setting);
}

function getNumberSetting(setting: string): number | undefined {
    return workspace.getConfiguration('windowColors').get<number>(setting);
}

function getObjectSetting(setting: string): object | undefined {
    return workspace.getConfiguration('windowColors').get<object>(setting);
}

function getMatchingRepoRule(repoConfigList: Array<RepoConfig> | undefined): RepoConfig | undefined {
    if (workspace.workspaceFolders === undefined) {
        return undefined;
    }

    const repoName = getCurrentGitRemoteFetchUrl();
    if (repoName === undefined || repoName === '') {
        return undefined;
    }

    if (repoConfigList === undefined) {
        return undefined;
    }

    let repoConfig: RepoConfig | undefined = undefined;
    let item: RepoConfig;
    for (item of repoConfigList) {
        if (repoName.includes(item.repoQualifier)) {
            repoConfig = item;
            break;
        }
    }

    return repoConfig;
}

function undoColors() {
    const settings = JSON.parse(JSON.stringify(workspace.getConfiguration('workbench').get('colorCustomizations')));
    // Filter settings by removing managedColors
    for (const key in settings) {
        if (managedColors.includes(key)) {
            delete settings[key];
        }
    }
    workspace.getConfiguration('workbench').update('colorCustomizations', settings, false);
}

function doit() {
    stopBranchPoll();
    outputChannel.appendLine('Color update triggered...');

    if (workspace.workspaceFolders === undefined) {
        outputChannel.appendLine('Empty workspace folders. Cannot do anything.');
        return;
    }

    const repoConfigList = getRepoConfigList(true);
    if (repoConfigList === undefined) {
        outputChannel.appendLine('No settings found. Weird!  You should add some...');
        return;
    }

    const branchMap = getBranchData(true);

    const doColorInactiveTitlebar = getBooleanSetting('colorInactiveTitlebar');
    const invertBranchColorLogic = getBooleanSetting('invertBranchColorLogic');
    const doColorEditorTabs = getBooleanSetting('colorEditorTabs');
    const doColorStatusBar = getBooleanSetting('colorStatusBar');
    const doApplyBranchColorExtra = getBooleanSetting('applyBranchColorToTabsAndStatusBar');

    let hueRotation = getNumberSetting('automaticBranchIndicatorColorKnob');
    if (hueRotation === undefined) {
        hueRotation = 60;
    }

    let activityBarColorKnob = getNumberSetting('activityBarColorKnob');
    if (activityBarColorKnob === undefined) {
        activityBarColorKnob = 3;
    }
    activityBarColorKnob = activityBarColorKnob / 10;

    /** retain initial unrelated colorCustomizations*/
    const cc = JSON.parse(JSON.stringify(workspace.getConfiguration('workbench').get('colorCustomizations')));

    let repoName = '';
    try {
        repoName = getCurrentGitRemoteFetchUrl();
    } catch (error) {
        outputChannel.appendLine('Error fetching git url: ' + error);
        console.error('Error: ', error);
        return;
    }
    if (repoName === undefined || repoName === '') {
        outputChannel.appendLine('No git repo found for this workspace.');
        return;
    }

    let repoColor = undefined;
    let branchColor = undefined;
    let defBranch = undefined;

    let item: RepoConfig;
    for (item of repoConfigList) {
        if (repoName.includes(item.repoQualifier)) {
            repoColor = Color(item.primaryColor);
            if (item.defaultBranch !== undefined) {
                branchColor = Color(item.branchColor);
            }

            break;
        }
    }

    if (repoColor === undefined) {
        outputChannel.appendLine('No rules match this repo: ' + repoName);
        // See if this is a freshly removed rule
        const repoRule = getMatchingRepoRule(currentConfig);
        if (repoRule !== undefined) {
            outputChannel.appendLine('Removing managed color for this workspace.');
            undoColors();
            currentConfig = getRepoConfigList();
            return;
        }
        return;
    }

    outputChannel.appendLine('Found configuration for: ' + repoName);

    if (defBranch !== undefined) {
        if (
            (!invertBranchColorLogic && currentBranch != defBranch) ||
            (invertBranchColorLogic && currentBranch === defBranch)
        ) {
            // Not on the default branch
            if (branchColor === undefined) {
                // No color specified, use modified repo color
                branchColor = repoColor.rotate(hueRotation);
                outputChannel.appendLine('No branch name rule, using rotated color for this repo: ' + repoName);
            }
        } else {
            // On the default branch
            outputChannel.appendLine('Using default branch color for this repo: ' + repoName);
            branchColor = repoColor;
        }
        startBranchPoll();
    } else {
        outputChannel.appendLine('Using repo color, because no default branch is specified for this repo: ' + repoName);
        branchColor = repoColor;
    }

    // Now check the branch map to see if any apply
    for (const [branch, color] of branchMap) {
        if (currentBranch?.match(branch)) {
            branchColor = Color(color);
            outputChannel.appendLine('Branch rule matched: ' + branch);
            break;
        }
    }

    let titleBarTextColor: Color = Color('#ffffff');
    let titleBarColor: Color = Color('#ffffff');
    let titleInactiveBarColor: Color = Color('#ffffff');
    //let titleBarBorderColor: Color = Color("red");
    let activityBarColor: Color = Color('#ffffff');
    let inactiveTabColor: Color = Color('#ffffff');
    let activeTabColor: Color = Color('#ffffff');

    const theme: ColorThemeKind = window.activeColorTheme.kind;

    if (theme === ColorThemeKind.Dark) {
        // Primary colors
        titleBarColor = repoColor;
        if (repoColor.isDark()) {
            titleBarTextColor = getColorWithLuminosity(titleBarColor, 0.95, 1);
        } else {
            titleBarTextColor = getColorWithLuminosity(repoColor, 0, 0.01);
        }
        titleInactiveBarColor = titleBarColor.darken(0.5);

        // Branch colors (which my be primary color too)
        activityBarColor = branchColor.lighten(activityBarColorKnob);
        inactiveTabColor = doApplyBranchColorExtra ? activityBarColor : titleBarColor.lighten(activityBarColorKnob);
        activeTabColor = inactiveTabColor.lighten(0.5);
    } else if (theme === ColorThemeKind.Light) {
        // Primary colors
        titleBarColor = repoColor;
        titleInactiveBarColor = titleBarColor.lighten(0.15);
        if (repoColor.isDark()) {
            titleBarTextColor = getColorWithLuminosity(repoColor, 0.95, 1);
        } else {
            titleBarTextColor = getColorWithLuminosity(repoColor, 0, 0.01);
        }

        // Branch colors (which my be primary color too)
        activityBarColor = branchColor.darken(activityBarColorKnob);
        inactiveTabColor = doApplyBranchColorExtra ? activityBarColor : titleBarColor.darken(activityBarColorKnob);
        activeTabColor = inactiveTabColor.darken(0.4);
    }

    const newColors = {
        //"titleBar.border": titleBarBorderColor.hex(),
        'activityBar.background': activityBarColor.hex(),
        'activityBar.foreground': titleBarTextColor.hex(),
        'titleBar.activeBackground': titleBarColor.hex(),
        'titleBar.activeForeground': titleBarTextColor.hex(),
        'titleBar.inactiveBackground': doColorInactiveTitlebar ? titleInactiveBarColor.hex() : undefined,
        'titleBar.inactiveForeground': doColorInactiveTitlebar ? titleBarTextColor.hex() : undefined,
        'tab.inactiveBackground': doColorEditorTabs ? inactiveTabColor.hex() : undefined,
        'tab.activeBackground': doColorEditorTabs ? activeTabColor.hex() : undefined,
        'tab.hoverBackground': doColorEditorTabs ? activeTabColor.hex() : undefined,
        'tab.unfocusedHoverBackground': doColorEditorTabs ? activeTabColor.hex() : undefined,
        'editorGroupHeader.tabsBackground': doColorEditorTabs ? inactiveTabColor.hex() : undefined,
        'titleBar.border': doColorEditorTabs ? inactiveTabColor.hex() : undefined,
        'sideBarTitle.background': doColorEditorTabs ? inactiveTabColor.hex() : undefined,
        'statusBar.background': doColorStatusBar ? inactiveTabColor.hex() : undefined,
    };
    outputChannel.appendLine('Applying colors for this repo: ' + 'repoName');
    workspace.getConfiguration('workbench').update('colorCustomizations', { ...cc, ...newColors }, false);
}

function getCurrentGitRemoteFetchUrl(): string {
    if (workspace.workspaceFolders === undefined) {
        return '';
    }
    let workspaceRoot: vscode.Uri = workspace.workspaceFolders[0].uri;

    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
        console.warn('Git extension not available');
        return '';
    }
    if (!extension.isActive) {
        console.warn('Git extension not active');
        return '';
    }

    // "1" == "Get version 1 of the API". Version one seems to be the latest when I
    // type this.
    const git = extension.exports.getAPI(1);
    const repository = git.getRepository(workspaceRoot);

    if (!repository) {
        return '';
    }

    if (repository.state.remotes === undefined || repository.state.remotes.length < 1) {
        return '';
    }

    return repository.state.remotes[0]['fetchUrl'];
}

function getCurrentGitBranch(): string {
    if (workspace.workspaceFolders === undefined) {
        return '';
    }
    let workspaceRoot: vscode.Uri = workspace.workspaceFolders[0].uri;

    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
        console.warn('Git extension not available');
        return '';
    }
    if (!extension.isActive) {
        console.warn('Git extension not active');
        return '';
    }

    // "1" == "Get version 1 of the API". Version one seems to be the latest when I
    // type this.
    const git = extension.exports.getAPI(1);
    const repository = git.getRepository(workspaceRoot);
    if (!repository) {
        return '';
    }

    const currentBranch = repository.state.HEAD;
    if (!currentBranch) {
        //console.warn('No HEAD branch for current document', docUri);
        return '';
    }

    const branchName = currentBranch.name;
    if (!branchName) {
        //console.warn('Current branch has no name', docUri, currentBranch);
        return '';
    }

    return branchName;
}

let intervalId: NodeJS.Timeout | undefined = undefined;

function stopBranchPoll() {
    clearInterval(intervalId);
}

function startBranchPoll() {
    intervalId = setInterval(function () {
        let branch = '';
        try {
            if (workspace.workspaceFolders === undefined) {
                return;
            }
            branch = getCurrentGitBranch();
            if (currentBranch != branch) {
                currentBranch = branch;
                outputChannel.appendLine('Change to branch: ' + branch);
                doit();
            }
        } catch (error) {
            outputChannel.appendLine('Branch Poll Error: ' + error);
            console.error('Error: ', error);
            return;
        }
    }, 1000);
}

const getColorWithLuminosity = (color: Color, min: number, max: number): Color => {
    let c: Color = Color(color.hex());
    let iter = 0;
    while (c.luminosity() > max && iter < 10000) {
        c = c.darken(0.01);
        iter++;
    }
    iter = 0;
    while (c.luminosity() < min && iter < 10000) {
        c = c.lighten(0.01);
        iter++;
    }
    return c;
};
