import * as Color from 'color';
//import * as fs from "fs-extra";
//import * as os from "os";
//import * as path from 'path';
import * as vscode from 'vscode';
import { ColorThemeKind, ExtensionContext, window, workspace } from 'vscode';
import { ConfigWebviewProvider } from './webview/configWebview';

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
let gitExt;
let gitApi: any;
let gitRepository: any;
let gitRepoRemoteFetchUrl: string = '';
let configProvider: ConfigWebviewProvider;
let statusBarItem: vscode.StatusBarItem;

// Helper functions for status bar
function createStatusBarItem(context: ExtensionContext): void {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'windowColors.statusBarClick';
    statusBarItem.text = '$(symbol-color)';
    statusBarItem.tooltip = 'Git Repo Window Colors - Click to configure';
    context.subscriptions.push(statusBarItem);
}

function shouldShowStatusBarItem(): boolean {
    // Never show if not a git repository
    if (!gitRepoRemoteFetchUrl) {
        return false;
    }

    const showOnlyWhenNoMatch = getBooleanSetting('showStatusIconWhenNoRuleMatches') ?? true;

    if (!showOnlyWhenNoMatch) {
        // Always show when it's a git repo
        return true;
    }

    // Show only when no rule matches
    const repoConfigList = getRepoConfigList(false);
    if (!repoConfigList) {
        return true; // No rules configured, so show
    }

    // Check if any rule matches current repo
    for (const rule of repoConfigList) {
        if (gitRepoRemoteFetchUrl.includes(rule.repoQualifier)) {
            return false; // Rule matches, so don't show
        }
    }

    return true; // No rule matches, so show
}

function updateStatusBarItem(): void {
    if (!statusBarItem) return;

    if (shouldShowStatusBarItem()) {
        const hasMatchingRule = getCurrentMatchingRule() !== undefined;
        if (hasMatchingRule) {
            statusBarItem.tooltip = 'Git Repo Window Colors - Repository has color rules configured';
        } else {
            statusBarItem.tooltip = 'Git Repo Window Colors - Click to add color rules for this repository';
        }
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

function getCurrentMatchingRule(): RepoConfig | undefined {
    if (!gitRepoRemoteFetchUrl) return undefined;

    const repoConfigList = getRepoConfigList(false);
    if (!repoConfigList) return undefined;

    for (const rule of repoConfigList) {
        if (gitRepoRemoteFetchUrl.includes(rule.repoQualifier)) {
            return rule;
        }
    }
    return undefined;
}

export async function activate(context: ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Git Repo Window Colors');

    // Create status bar item
    createStatusBarItem(context);

    if (!isGitModelAvailable()) {
        outputChannel.appendLine('Git extension not available.');
        outputChannel.appendLine('Do you have git installed?');
        return;
    }

    gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) {
        console.warn('Git extension not available');
        return '';
    }
    if (!gitExt.isActive) {
        await gitExt.activate();
        return '';
    }

    gitApi = gitExt.exports.getAPI(1);

    if (!workspace.workspaceFolders) {
        outputChannel.appendLine('No workspace folders.  Cannot color an empty workspace.');
        return;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.colorize', async () => {
            if (gitRepoRemoteFetchUrl === undefined || gitRepoRemoteFetchUrl === '') {
                vscode.window.showErrorMessage('This workspace is not a git repository.');
                return;
            }

            let configList = getRepoConfigList(false);
            if (configList === undefined) {
                configList = new Array<RepoConfig>();
            }

            let repoConfig = await getMatchingRepoRule(configList);

            if (repoConfig !== undefined) {
                // Rule already exists, just open the configuration editor
                configProvider.show(context.extensionUri);
                return;
            }

            // No rule exists, open editor and auto-add rule
            // Create a new rule suggestion
            const p1 = gitRepoRemoteFetchUrl.split(':');
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

            // Open the configuration webview and automatically add a new rule
            configProvider.showAndAddRepoRule(context.extensionUri, repoQualifier);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.decolorize', async () => {
            if (gitRepoRemoteFetchUrl === undefined || gitRepoRemoteFetchUrl === '') {
                vscode.window.showErrorMessage('This workspace is not a git repository.');
                return;
            }

            let repoConfig = await getMatchingRepoRule(getRepoConfigList(true));
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
                    undoColors();
                });
        }),
    );

    // Register the configuration webview command
    configProvider = new ConfigWebviewProvider(context.extensionUri);
    context.subscriptions.push(configProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.openConfig', () => {
            configProvider.show(context.extensionUri);
        }),
    );

    // Register status bar click command with smart behavior
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.statusBarClick', async () => {
            if (gitRepoRemoteFetchUrl === undefined || gitRepoRemoteFetchUrl === '') {
                vscode.window.showErrorMessage('This workspace is not a git repository.');
                return;
            }

            let configList = getRepoConfigList(false);
            if (configList === undefined) {
                configList = new Array<RepoConfig>();
            }

            let repoConfig = await getMatchingRepoRule(configList);

            if (repoConfig !== undefined) {
                // Rule already exists, just open the configuration editor
                configProvider.show(context.extensionUri);
                return;
            }

            // No rule exists, open editor and auto-add rule
            // Create a new rule suggestion
            const p1 = gitRepoRemoteFetchUrl.split(':');
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

            // Open the configuration webview and automatically add a new rule
            configProvider.showAndAddRepoRule(context.extensionUri, repoQualifier);
        }),
    );

    // Register internal command for webview to trigger color updates
    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.applyColors', (reason: string) => {
            doit(reason || 'internal command');
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
                doit('settings change');
                updateStatusBarItem(); // Update status bar when configuration changes
            }
        }),
    );

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

    if (gitApi.state === 'initialized') {
        await init();
    } else {
        outputChannel.appendLine('Git extension not initialized. Waiting for it to initialize...');
        gitApi.onDidChangeState(async (newState: string) => {
            outputChannel.appendLine(`Git extension state changed to: ${newState}`);
            if (newState === 'initialized') {
                await init();
                updateStatusBarItem(); // Update status bar when git becomes available
            }
        });
    }
}

async function init() {
    gitRepository = getWorkspaceRepo();
    if (gitRepository) {
        gitRepoRemoteFetchUrl = gitRepository.state.remotes[0]['fetchUrl'];
        outputChannel.appendLine('Git repository: ' + gitRepoRemoteFetchUrl);
        currentBranch = getCurrentGitBranch();
        if (currentBranch === undefined) {
            outputChannel.appendLine('Could not determine current branch.');
            return;
        }
        outputChannel.appendLine('Current branch: ' + currentBranch);

        // Update workspace info for the configuration webview
        if (configProvider) {
            configProvider.setWorkspaceInfo(gitRepoRemoteFetchUrl, currentBranch);
        }

        doit('initial activation');
        updateStatusBarItem(); // Update status bar after initialization
    } else {
        outputChannel.appendLine('No git repository found for workspace.');
        updateStatusBarItem(); // Update status bar for non-git workspace
    }
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

async function getMatchingRepoRule(repoConfigList: Array<RepoConfig> | undefined): Promise<RepoConfig | undefined> {
    if (repoConfigList === undefined) {
        return undefined;
    }

    let repoConfig: RepoConfig | undefined = undefined;
    let item: RepoConfig;
    for (item of repoConfigList) {
        if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
            repoConfig = item;
            break;
        }
    }

    return repoConfig;
}

function undoColors() {
    outputChannel.appendLine('Removing managed color for this workspace.');
    const settings = JSON.parse(JSON.stringify(workspace.getConfiguration('workbench').get('colorCustomizations')));
    // Filter settings by removing managedColors
    for (const key in settings) {
        if (managedColors.includes(key)) {
            delete settings[key];
        }
    }
    workspace.getConfiguration('workbench').update('colorCustomizations', settings, false);
}

async function doit(reason: string) {
    stopBranchPoll();
    outputChannel.appendLine('\nColorizer triggered by ' + reason);

    const repoConfigList = getRepoConfigList(true);
    if (repoConfigList === undefined) {
        outputChannel.appendLine('  No repo settings found.  Using branch mode only.');
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

    let repoColor = undefined;
    let branchColor = undefined;
    let defBranch = undefined;

    if (repoConfigList !== undefined) {
        let item: RepoConfig;
        for (item of repoConfigList) {
            if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
                repoColor = Color(item.primaryColor);
                outputChannel.appendLine('  Repo rule matched: "' + item.repoQualifier + '", using ' + repoColor.hex());
                if (item.defaultBranch !== undefined) {
                    branchColor = Color(item.branchColor);
                }

                break;
            }
        }

        if (repoColor === undefined) {
            outputChannel.appendLine('  No repo rule matched');
        } else {
            if (defBranch !== undefined) {
                if (
                    (!invertBranchColorLogic && currentBranch != defBranch) ||
                    (invertBranchColorLogic && currentBranch === defBranch)
                ) {
                    // Not on the default branch
                    if (branchColor === undefined) {
                        // No color specified, use modified repo color
                        branchColor = repoColor?.rotate(hueRotation);
                        outputChannel.appendLine('  No branch name rule, using rotated color for this repo');
                    }
                } else {
                    // On the default branch
                    branchColor = repoColor;
                    outputChannel.appendLine('  Using default branch color for this repo: ' + branchColor.hex());
                }
            } else {
                outputChannel.appendLine('  No default branch specified, initializing branch color to repo color');
                branchColor = repoColor;
            }
        }
    }

    // Now check the branch map to see if any apply
    let branchMatch = false;
    for (const [branch, color] of branchMap) {
        if (currentBranch?.match(branch)) {
            branchColor = Color(color);
            outputChannel.appendLine('  Branch rule matched: "' + branch + '" with color: ' + branchColor.hex());
            branchMatch = true;
            // if (repoColor === undefined) {
            //     outputChannel.appendLine('  No repo color specified, using branch color as repo color');
            //     // No repo config, so use the branch color as the repo color
            //     repoColor = branchColor;
            // }

            break;
        }
    }

    if (!branchMatch) {
        if (repoColor === undefined) {
            outputChannel.appendLine('  No branch rule matched');
        } else {
            outputChannel.appendLine('  No branch rule matched, using repo color for branch color');
        }
    }

    if (branchColor === undefined || repoColor === undefined) {
        // No color specified, so do nothing
        outputChannel.appendLine('  No color configuration data specified for this repo or branch.');
        if (getBooleanSetting('removeManagedColors')) {
            undoColors();
        }
        return;
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

    if (repoColor === branchColor) {
        // If the repo color and branch color are the same, remove the branch color
        outputChannel.appendLine(`  Applying color for this repo: ${repoColor.hex()}`);
    } else {
        outputChannel.appendLine(
            `  Applying colors for this repo: repo ${repoColor.hex()}, branch ${branchColor.hex()}`,
        );
    }
    workspace.getConfiguration('workbench').update('colorCustomizations', { ...cc, ...newColors }, false);

    outputChannel.appendLine('\nLoving this extension? https://www.buymeacoffee.com/KevinMills');
    outputChannel.appendLine(
        'If you have any issues or suggestions, please file them at\n  https://github.com/mgfarmer/git-repo-window-colors/issues',
    );
    startBranchPoll();
    updateStatusBarItem(); // Update status bar after applying colors
}

function getWorkspaceRepo() {
    let workspaceRoot: vscode.Uri | undefined = undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri) {
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (folder) {
            workspaceRoot = folder.uri;
        }
    }
    // Fallback to the first workspace folder
    if (!workspaceRoot && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        workspaceRoot = workspace.workspaceFolders[0].uri;
    }
    if (!workspaceRoot) {
        return '';
    }

    // Find the repository that matches the workspaceRoot
    return gitApi.getRepository(workspaceRoot);
}

function getCurrentGitBranch(): string | undefined {
    const head = gitRepository.state.HEAD;
    if (!head) {
        console.warn('No HEAD found for repository.');
        return undefined;
    }

    if (!head.name) {
        // Detached HEAD state
        console.warn('Repository is in a detached HEAD state.');
        return undefined;
    }

    return head.name;
}

let intervalId: NodeJS.Timeout | undefined = undefined;

function stopBranchPoll() {
    clearInterval(intervalId);
}

function startBranchPoll() {
    intervalId = setInterval(function () {
        let branch: string | undefined = undefined;
        try {
            branch = getCurrentGitBranch();
            if (branch === undefined) {
                return;
            }
            if (currentBranch != branch) {
                const reason = `branch change '${currentBranch}' ==> '${branch}'`;
                currentBranch = branch;

                // Update workspace info for the configuration webview
                if (configProvider) {
                    configProvider.setWorkspaceInfo(gitRepoRemoteFetchUrl, currentBranch);
                }

                doit(reason);
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
