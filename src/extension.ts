import * as Color from 'color';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ColorThemeKind, ExtensionContext, window, workspace } from 'vscode';
import { resolveProfile } from './profileResolver';
import { AdvancedProfile } from './types/advancedModeTypes';
import { ConfigWebviewProvider } from './webview/configWebview';

let currentBranch: undefined | string = undefined;

type RepoConfig = {
    repoQualifier: string;
    defaultBranch: string | undefined;
    primaryColor: string;
    branchColor: string | undefined;
    profileName?: string;
    branchProfileName?: string;
    enabled?: boolean;
    branchRules?: Array<{ pattern: string; color: string; enabled?: boolean }>;
    useGlobalBranchRules?: boolean;
};

/**
 * Extracts profile name from color string.
 * Returns the profile name if:
 * 1. It exists as a profile
 * 2. It's NOT a valid HTML color name (HTML colors take precedence)
 * Returns null otherwise
 */
function extractProfileName(colorString: string, advancedProfiles: { [key: string]: AdvancedProfile }): string | null {
    if (!colorString) return null;

    // Remove any trailing whitespace or artifacts
    const cleaned = colorString.trim();

    // Check if it exists as a profile
    if (advancedProfiles[cleaned]) {
        // It exists as a profile, but check if it's also an HTML color
        try {
            Color(cleaned);
            // It's a valid color, so don't treat as profile (HTML color takes precedence)
            return null;
        } catch {
            // Not a valid color, so it's a profile
            return cleaned;
        }
    }

    return null;
}

const managedColors = [
    // Title Bar
    'titleBar.activeBackground',
    'titleBar.activeForeground',
    'titleBar.inactiveBackground',
    'titleBar.inactiveForeground',
    'titleBar.border',
    // Activity Bar
    'activityBar.background',
    'activityBar.foreground',
    'activityBar.inactiveForeground',
    'activityBar.border',
    // Status Bar
    'statusBar.background',
    'statusBar.foreground',
    'statusBar.border',
    // Tabs & Breadcrumbs
    'tab.activeBackground',
    'tab.activeForeground',
    'tab.inactiveBackground',
    'tab.inactiveForeground',
    'tab.hoverBackground',
    'tab.unfocusedHoverBackground',
    'tab.activeBorder',
    'editorGroupHeader.tabsBackground',
    'breadcrumb.background',
    'breadcrumb.foreground',
    // Command Center
    'commandCenter.background',
    'commandCenter.foreground',
    'commandCenter.activeBackground',
    'commandCenter.activeForeground',
    // Terminal
    'terminal.background',
    'terminal.foreground',
    // Lists & Panels
    'panel.background',
    'panel.border',
    'panelTitle.activeForeground',
    'panelTitle.inactiveForeground',
    'panelTitle.activeBorder',
    'list.activeSelectionBackground',
    'list.activeSelectionForeground',
    'list.inactiveSelectionBackground',
    'list.inactiveSelectionForeground',
    'list.focusOutline',
    'list.hoverBackground',
    'list.hoverForeground',
    'badge.background',
    'badge.foreground',
    'panelTitleBadge.background',
    'panelTitleBadge.foreground',
    'input.background',
    'input.foreground',
    'input.border',
    'input.placeholderForeground',
    'focusBorder',
    // Side Bar
    'sideBar.background',
    'sideBar.foreground',
    'sideBar.border',
    'sideBarTitle.background',
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
    if (repoConfig.profileName && repoConfig.profileName !== repoConfig.primaryColor) {
        result += ':' + repoConfig.profileName;
    }
    return result;
}

export let outputChannel: vscode.OutputChannel;
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
    if (!gitRepoRemoteFetchUrl || gitRepoRemoteFetchUrl === '') {
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
        // Skip disabled rules
        if (rule.enabled === false) continue;

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
        // Skip disabled rules
        if (rule.enabled === false) continue;

        if (gitRepoRemoteFetchUrl.includes(rule.repoQualifier)) {
            return rule;
        }
    }
    return undefined;
}

/**
 * Migrate legacy string-based configuration to JSON object format
 */
async function migrateConfigurationToJson(context: ExtensionContext): Promise<void> {
    const migrated = context.globalState.get<boolean>('configMigratedToJson', false);

    // Skip if already migrated
    if (migrated) {
        outputChannel.appendLine('Configuration already migrated to JSON format.');
        return;
    }

    const config = workspace.getConfiguration('windowColors');

    outputChannel.appendLine('Starting configuration migration to JSON format...');

    try {
        // Get advanced profiles for validation
        const advancedProfiles = config.get('advancedProfiles', {}) as { [key: string]: any };

        // Migrate repoConfigurationList
        const repoConfigList = config.get('repoConfigurationList', []) as any[];
        const migratedRepoList: any[] = [];

        for (const item of repoConfigList) {
            // Skip if already JSON object
            if (typeof item === 'object' && item !== null) {
                migratedRepoList.push(item);
                continue;
            }

            // Parse legacy string format
            if (typeof item === 'string') {
                try {
                    const parts = item.split(':');
                    if (parts.length < 2) {
                        outputChannel.appendLine(`Skipping invalid repo rule: ${item}`);
                        continue;
                    }

                    const repoParts = parts[0].split(SEPARATOR);
                    const repoQualifier = repoParts[0].trim();
                    const defaultBranch = repoParts.length > 1 ? repoParts[1].trim() : undefined;

                    const colorParts = parts[1].split(SEPARATOR);
                    const primaryColor = colorParts[0].trim();
                    const branchColor = colorParts.length > 1 ? colorParts[1].trim() : undefined;

                    // Check for profile name in third part
                    let profileName: string | undefined = undefined;
                    if (advancedProfiles[primaryColor]) {
                        profileName = primaryColor;
                    } else if (parts.length > 2) {
                        const p2 = parts[2].trim();
                        if (advancedProfiles[p2]) {
                            profileName = p2;
                        }
                    }

                    const migratedRule: any = {
                        repoQualifier,
                        primaryColor,
                        enabled: true,
                    };

                    if (defaultBranch) {
                        migratedRule.defaultBranch = defaultBranch;
                    }
                    if (branchColor) {
                        migratedRule.branchColor = branchColor;
                    }
                    if (profileName) {
                        migratedRule.profileName = profileName;
                    }

                    migratedRepoList.push(migratedRule);
                    outputChannel.appendLine(`Migrated repo rule: ${item} -> JSON object`);
                } catch (err) {
                    outputChannel.appendLine(`Error migrating repo rule: ${item} - ${err}`);
                    // Keep original on error
                    migratedRepoList.push(item);
                }
            }
        }

        // Migrate branchConfigurationList
        const branchConfigList = config.get('branchConfigurationList', []) as any[];
        const migratedBranchList: any[] = [];

        for (const item of branchConfigList) {
            // Skip if already JSON object
            if (typeof item === 'object' && item !== null) {
                migratedBranchList.push(item);
                continue;
            }

            // Parse legacy string format
            if (typeof item === 'string') {
                try {
                    const parts = item.split(':');
                    if (parts.length < 2) {
                        outputChannel.appendLine(`Skipping invalid branch rule: ${item}`);
                        continue;
                    }

                    const pattern = parts[0].trim();
                    const color = parts[1].trim();

                    const migratedRule = {
                        pattern,
                        color,
                        enabled: true,
                    };

                    migratedBranchList.push(migratedRule);
                    outputChannel.appendLine(`Migrated branch rule: ${item} -> JSON object`);
                } catch (err) {
                    outputChannel.appendLine(`Error migrating branch rule: ${item} - ${err}`);
                    // Keep original on error
                    migratedBranchList.push(item);
                }
            }
        }

        // Write migrated configuration
        await config.update('repoConfigurationList', migratedRepoList, vscode.ConfigurationTarget.Global);
        await config.update('branchConfigurationList', migratedBranchList, vscode.ConfigurationTarget.Global);
        await context.globalState.update('configMigratedToJson', true);

        outputChannel.appendLine(
            `Configuration migration completed: ${migratedRepoList.length} repo rules, ${migratedBranchList.length} branch rules`,
        );
    } catch (error) {
        outputChannel.appendLine(`Error during migration: ${error}`);
        vscode.window.showErrorMessage(
            'Failed to migrate configuration to JSON format. Please check the output channel for details.',
        );
    }
}

async function checkConfigurationItem(itemName: string): Promise<boolean> {
    const config = workspace.getConfiguration('windowColors');
    const configInspect = config.inspect(itemName);
    // If the configuration item doesn't exist in the schema, all value fields will be undefined
    if (
        configInspect &&
        configInspect.defaultValue === undefined &&
        configInspect.globalValue === undefined &&
        configInspect.workspaceValue === undefined &&
        configInspect.workspaceFolderValue === undefined
    ) {
        return true; // Configuration item missing from schema
    }
    return false;
}

/**
 * Get all configuration property names from the extension's package.json.
 * This automatically discovers all windowColors.* settings without manual maintenance.
 */
function getAllConfigurationProperties(): string[] {
    const extension = vscode.extensions.getExtension('KevinMills.git-repo-window-colors');
    if (!extension?.packageJSON?.contributes?.configuration) {
        return [];
    }

    const properties: string[] = [];
    for (const config of extension.packageJSON.contributes.configuration) {
        if (config.properties) {
            for (const key of Object.keys(config.properties)) {
                // Extract the property name after 'windowColors.'
                if (key.startsWith('windowColors.')) {
                    properties.push(key.substring('windowColors.'.length));
                }
            }
        }
    }
    return properties;
}

async function checkConfiguration(context: ExtensionContext): Promise<boolean> {
    const extension = vscode.extensions.getExtension('KevinMills.git-repo-window-colors');
    const currentVersion = extension?.packageJSON?.version || '0.0.0';
    const lastCheckedVersion = context.globalState.get<string>('lastConfigCheckVersion', '');

    // Only check configuration if version has changed (or never checked before)
    if (lastCheckedVersion === currentVersion) {
        return false; // No need to check, same version
    }

    outputChannel.appendLine(
        `Version changed from ${lastCheckedVersion || 'initial'} to ${currentVersion}, checking configuration...`,
    );

    // Get all configuration properties automatically
    const allProperties = getAllConfigurationProperties();
    const missingProperties: string[] = [];

    // Check each property
    for (const prop of allProperties) {
        if (await checkConfigurationItem(prop)) {
            missingProperties.push(prop);
        }
    }

    if (missingProperties.length > 0) {
        outputChannel.appendLine(`Missing configuration properties: ${missingProperties.join(', ')}`);
        const selection = await vscode.window.showWarningMessage(
            `New configuration settings detected (${missingProperties.length} items). Please restart VS Code to enable new features.`,
            'Restart Now',
            'Later',
        );
        if (selection === 'Restart Now') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
        return true; // Stop activation until restart
    }

    // All configuration items are present, update the last checked version
    await context.globalState.update('lastConfigCheckVersion', currentVersion);
    outputChannel.appendLine('Configuration check passed.');
    return false;
}

export async function activate(context: ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Git Repo Window Colors');

    if (await checkConfiguration(context)) {
        outputChannel.appendLine('This extension is disabled until application restart.');
        return; // Stop activation until restart
    }

    // Migrate configuration to JSON format if needed
    await migrateConfigurationToJson(context);

    // Create status bar item
    createStatusBarItem(context);

    if (!isGitModelAvailable()) {
        outputChannel.appendLine('Git extension not available.');
        outputChannel.appendLine('Do you have git installed?');
        return;
    }

    gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) {
        outputChannel.appendLine('Git extension not available.');
        outputChannel.appendLine('Do you have git installed?');
        console.warn('Git extension not available');
        return '';
    }

    if (!workspace.workspaceFolders) {
        outputChannel.appendLine('No workspace folders.  Cannot color an empty workspace.');
        return;
    }

    gitApi = gitExt.isActive ? gitExt.exports.getAPI(1) : (await gitExt.activate()).getAPI(1);

    if (!gitApi) {
        outputChannel.appendLine('Git API not available.');
        return;
    }

    outputChannel.appendLine('Git extension is activated.');

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

            // Check if any rule (enabled or disabled) exists for this repo
            if (hasAnyMatchingRepoRule(configList)) {
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
                    workspace
                        .getConfiguration('windowColors')
                        .update('repoConfigurationList', newArray, true)
                        .then(() => {
                            undoColors();
                            // Update the configuration webview if it's open
                            if (configProvider) {
                                configProvider._sendConfigurationToWebview();
                            }
                        });
                });
        }),
    );

    // Register the configuration webview command
    configProvider = new ConfigWebviewProvider(context.extensionUri, context);
    context.subscriptions.push(configProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.openConfig', () => {
            configProvider.show(context.extensionUri);
        }),
    );

    // Register debug command to clear first-time flag
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.clearFirstTimeFlag', async () => {
            await context.globalState.update('grwc.hasShownGettingStarted', undefined);
            vscode.window.showInformationMessage('First-time flag cleared. Close and reopen the config panel to test.');
        }),
    );

    // Register export configuration command
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.exportConfig', async () => {
            await exportConfiguration();
        }),
    );

    // Register import configuration command
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.importConfig', async () => {
            await importConfiguration();
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

            // Check if any rule (enabled or disabled) exists for this repo
            if (hasAnyMatchingRepoRule(configList)) {
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
        if (gitRepository.state.remotes.length > 0) {
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

            // Check if we should ask to colorize this repo if no rules match
            await checkAndAskToColorizeRepo();
        } else {
            // No remotes available yet, poll for them
            outputChannel.appendLine('No git remotes found yet, waiting for remotes to be available...');
            const remoteCheckInterval = setInterval(async () => {
                try {
                    outputChannel.appendLine('Checking for remotes...');
                    gitRepository = getWorkspaceRepo();
                    if (gitRepository && gitRepository.state.remotes.length > 0) {
                        // Remote is now available, clear the interval and proceed
                        clearInterval(remoteCheckInterval);

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

                        // Check if we should ask to colorize this repo if no rules match
                        await checkAndAskToColorizeRepo();
                    }
                } catch (error) {
                    outputChannel.appendLine('Error checking for git remotes: ' + error);
                }
            }, 3000);
        }
    } else {
        outputChannel.appendLine('No git repository found for workspace.');
        updateStatusBarItem(); // Update status bar for non-git workspace
    }
}

async function checkAndAskToColorizeRepo(): Promise<void> {
    // Check if the setting is enabled
    const askToColorize = getBooleanSetting('askToColorizeRepoWhenOpened');
    if (!askToColorize) {
        return;
    }

    // Check if there are any existing rules that match this repo
    const repoConfigList = getRepoConfigList(false);
    const existingRule = await getMatchingRepoRule(repoConfigList);

    if (existingRule) {
        // A rule already matches this repo, don't ask
        return;
    }

    // No matching rule found, ask the user if they want to add one
    const repoName = extractRepoNameFromUrl(gitRepoRemoteFetchUrl);
    const response = await vscode.window.showInformationMessage(
        `Would you like to add color rules for the repository "${repoName}"?`,
        'Yes, open configuration',
        "No, don't ask again",
        'Not now',
    );

    switch (response) {
        case 'Yes, open configuration':
            // Open the configuration webview and auto-add a rule
            configProvider.showAndAddRepoRule(vscode.Uri.file(''), repoName);
            break;
        case "No, don't ask again":
            // Disable the setting
            await workspace.getConfiguration('windowColors').update('askToColorizeRepoWhenOpened', false, true);
            vscode.window.showInformationMessage('You can re-enable this in the Git Repo Window Colors configuration.');
            break;
        case 'Not now':
        default:
            // Do nothing
            break;
    }
}

function extractRepoNameFromUrl(url: string): string {
    // Extract a user-friendly repo name from the git URL
    try {
        const parts = url.split(':');
        if (parts.length > 1) {
            const pathPart = parts[1].split('/');
            if (pathPart.length > 1) {
                const lastPart = pathPart.slice(-2).join('/');
                return lastPart.replace('.git', '');
            }
        }

        // Fallback: extract from https URLs
        if (url.includes('github.com') || url.includes('gitlab.com') || url.includes('bitbucket.org')) {
            const match = url.match(/[\/:]([^\/]+\/[^\/]+?)(?:\.git)?$/);
            if (match) {
                return match[1];
            }
        }

        // Final fallback
        return url.split('/').pop()?.replace('.git', '') || 'repository';
    } catch (error) {
        return 'repository';
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

    // Get advanced profiles (get once before loop)
    const advancedProfiles =
        (workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as { [key: string]: any }) || {};

    for (const item in json) {
        let error = false;
        const setting = json[item];

        // PRIMARY: Handle JSON object format (new format)
        if (typeof setting === 'object' && setting !== null) {
            const repoConfig: RepoConfig = {
                repoQualifier: setting.repoQualifier || '',
                defaultBranch: setting.defaultBranch,
                primaryColor: setting.primaryColor || '',
                branchColor: setting.branchColor,
                profileName: setting.profileName,
                enabled: setting.enabled !== undefined ? setting.enabled : true,
                branchRules: setting.branchRules,
                useGlobalBranchRules: setting.useGlobalBranchRules,
            };

            // Validate if needed
            if (validate && isActive) {
                if (!repoConfig.repoQualifier || !repoConfig.primaryColor) {
                    const msg = 'Repository rule missing required fields (repoQualifier or primaryColor)';
                    vscode.window.showErrorMessage(msg);
                    outputChannel.appendLine(msg);
                    continue;
                }

                // Validate colors if not profile names
                const primaryIsProfile = advancedProfiles[repoConfig.primaryColor];
                if (!primaryIsProfile) {
                    try {
                        Color(repoConfig.primaryColor);
                    } catch (error) {
                        const msg = `Invalid primary color: ${repoConfig.primaryColor}`;
                        vscode.window.showErrorMessage(msg);
                        outputChannel.appendLine(msg);
                        continue;
                    }
                }

                if (repoConfig.branchColor) {
                    const branchIsProfile = advancedProfiles[repoConfig.branchColor];
                    if (!branchIsProfile) {
                        try {
                            Color(repoConfig.branchColor);
                        } catch (error) {
                            const msg = `Invalid branch color: ${repoConfig.branchColor}`;
                            vscode.window.showErrorMessage(msg);
                            outputChannel.appendLine(msg);
                            continue;
                        }
                    }
                }
            }

            result.push(repoConfig);
            continue;
        }

        // FALLBACK: Handle legacy string format
        if (typeof setting === 'string') {
            // Try parsing as JSON string first (for backward compatibility)
            if (setting.trim().startsWith('{')) {
                try {
                    const obj = JSON.parse(setting);
                    const repoConfig: RepoConfig = {
                        repoQualifier: obj.repoQualifier || '',
                        defaultBranch: obj.defaultBranch,
                        primaryColor: obj.primaryColor || '',
                        branchColor: obj.branchColor,
                        profileName: obj.profileName,
                        enabled: obj.enabled !== undefined ? obj.enabled : true,
                        branchRules: obj.branchRules,
                        useGlobalBranchRules: obj.useGlobalBranchRules,
                    };
                    result.push(repoConfig);
                    continue;
                } catch (err) {
                    // If JSON parsing fails, fall through to legacy parsing
                    outputChannel.appendLine(`Failed to parse JSON rule: ${setting}`);
                }
            }

            // Legacy string format parsing: repo[|branch]:color[|branchColor][:profile]
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

            let profileName: string | undefined = undefined;
            // Check if rColor is a profile name
            if (advancedProfiles[rColor]) {
                profileName = rColor;
            } else if (parts.length > 2) {
                // Check third part for profile name (format: repo:color:ProfileName)
                const p2 = parts[2].trim();
                if (advancedProfiles[p2]) {
                    profileName = p2;
                }
            }

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
            // Only validate rColor as a color if it's not being used as a profile name
            const rColorIsProfile = profileName === rColor;
            if (!rColorIsProfile) {
                try {
                    Color(rColor);
                } catch (error) {
                    colorMessage = '`' + rColor + '` is not a known color';
                }
            }

            // Check if bColor is a profile name
            const bColorIsProfile = bColor ? extractProfileName(bColor, advancedProfiles) !== null : false;
            if (bColor !== undefined && !bColorIsProfile) {
                try {
                    Color(bColor);
                } catch (error) {
                    if (colorMessage != '') {
                        colorMessage += ' and ';
                    }
                    colorMessage += '`' + bColor + '` is not a known color';
                }
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
                profileName: profileName,
            };

            if (!error) {
                result.push(repoConfig);
            }
        }
    }

    return result;
}

function getBranchData(validate: boolean = false): Map<string, string> {
    const branchConfigObj = getObjectSetting('branchConfigurationList');
    const json = JSON.parse(JSON.stringify(branchConfigObj));

    const result = new Map<string, string>();

    // Get advanced profiles once before the loop
    const advancedProfiles = workspace
        .getConfiguration('windowColors')
        .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});

    for (const item in json) {
        const setting = json[item];

        // PRIMARY: Handle JSON object format (new format)
        if (typeof setting === 'object' && setting !== null) {
            // Skip disabled rules
            if (setting.enabled === false) {
                continue;
            }

            // Validate and add enabled rules to the map
            if (setting.pattern && setting.color) {
                // Validate if needed
                if (validate) {
                    const profileName = extractProfileName(setting.color, advancedProfiles);
                    if (!profileName) {
                        try {
                            Color(setting.color);
                        } catch (error) {
                            const msg = `Invalid color in branch rule (${setting.pattern}): ${setting.color}`;
                            vscode.window.showErrorMessage(msg);
                            outputChannel.appendLine(msg);
                            continue;
                        }
                    }
                }

                result.set(setting.pattern, setting.color);
            }
            continue;
        }

        // FALLBACK: Handle legacy string format
        if (typeof setting === 'string') {
            // Try parsing as JSON string first (for backward compatibility)
            if (setting.trim().startsWith('{')) {
                try {
                    const obj = JSON.parse(setting);
                    // Skip disabled rules
                    if (obj.enabled === false) {
                        continue;
                    }
                    // Add enabled rules to the map
                    if (obj.pattern && obj.color) {
                        result.set(obj.pattern, obj.color);
                    }
                    continue;
                } catch (err) {
                    // If JSON parsing fails, fall through to legacy parsing
                    outputChannel.appendLine(`Failed to parse JSON branch rule: ${setting}`);
                }
            }

            // Legacy string format parsing: pattern:color
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

            const profileName = extractProfileName(branchColor, advancedProfiles);

            // Only validate as a color if it's not a profile name
            if (!profileName) {
                try {
                    Color(branchColor);
                } catch (error) {
                    colorMessage = '`' + branchColor + '` is not a known color';
                }
            }

            if (validate && colorMessage != '') {
                const msg = 'Setting `' + setting + '`: ' + colorMessage;
                vscode.window.showErrorMessage(msg);
                outputChannel.appendLine(msg);
            }

            result.set(branchName, branchColor);
        }
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
        // Skip disabled rules
        if (item.enabled === false) continue;

        if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
            repoConfig = item;
            break;
        }
    }

    return repoConfig;
}

function hasAnyMatchingRepoRule(repoConfigList: Array<RepoConfig> | undefined): boolean {
    if (repoConfigList === undefined) {
        return false;
    }

    for (const item of repoConfigList) {
        // Check for matching rule regardless of enabled state
        if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
            return true;
        }
    }

    return false;
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

    let repoColor: Color | undefined = undefined;
    let branchColor: Color | undefined = undefined;
    let defBranch = undefined;
    let matchedRepoConfig: RepoConfig | undefined = undefined;

    // Check for preview mode
    const previewIndex = configProvider?.getPreviewRepoRuleIndex();

    if (previewIndex !== null && previewIndex !== undefined && repoConfigList && repoConfigList[previewIndex]) {
        outputChannel.appendLine('  [PREVIEW MODE] Using rule at index ' + previewIndex);
        matchedRepoConfig = repoConfigList[previewIndex];
        outputChannel.appendLine('  [PREVIEW MODE] Rule: "' + matchedRepoConfig.repoQualifier + '"');

        // Set repoColor from preview rule
        if (matchedRepoConfig.profileName) {
            outputChannel.appendLine('  [PREVIEW MODE] Using profile: ' + matchedRepoConfig.profileName);
        } else if (matchedRepoConfig.primaryColor) {
            try {
                repoColor = Color(matchedRepoConfig.primaryColor);
                outputChannel.appendLine('  [PREVIEW MODE] Using color: ' + repoColor.hex());
            } catch (e) {
                outputChannel.appendLine('  [PREVIEW MODE] Error parsing color: ' + e);
            }
        }
    } else if (repoConfigList !== undefined) {
        let item: RepoConfig;
        for (item of repoConfigList) {
            // Skip disabled rules
            if (item.enabled === false) {
                continue;
            }

            if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
                matchedRepoConfig = item;

                // If profileName is explicitly set, use it and don't try to parse primaryColor as a color
                if (item.profileName) {
                    outputChannel.appendLine(
                        '  Repo rule matched: "' + item.repoQualifier + '", using Profile ' + item.profileName,
                    );
                } else if (item.primaryColor) {
                    // No explicit profile, try to parse primaryColor as a color
                    try {
                        repoColor = Color(item.primaryColor);
                        outputChannel.appendLine(
                            '  Repo rule matched: "' + item.repoQualifier + '", using ' + repoColor.hex(),
                        );
                    } catch (e) {
                        outputChannel.appendLine('  Error parsing primary color: ' + item.primaryColor);
                    }
                }

                if (item.defaultBranch !== undefined) {
                    defBranch = item.defaultBranch;
                    if (item.branchColor) {
                        // Check if the branch color is actually a profile name
                        const advancedProfiles = workspace
                            .getConfiguration('windowColors')
                            .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
                        const branchProfileName = extractProfileName(item.branchColor, advancedProfiles);

                        if (branchProfileName) {
                            // It's a profile - set it for later resolution
                            outputChannel.appendLine(`  Per-repo branch color is Profile: ${branchProfileName}`);
                            if (!matchedRepoConfig) {
                                matchedRepoConfig = item;
                            }
                            matchedRepoConfig.branchProfileName = branchProfileName;
                        } else {
                            // It's a regular color
                            branchColor = Color(item.branchColor);
                        }
                    }
                }

                break;
            }
        }

        if (!matchedRepoConfig) {
            outputChannel.appendLine('  No repo rule matched');
        }
    }

    // Handle matched repo config (whether from preview or normal matching)
    if (matchedRepoConfig && repoColor) {
        if (defBranch !== undefined) {
            if (
                (!invertBranchColorLogic && currentBranch != defBranch) ||
                (invertBranchColorLogic && currentBranch === defBranch)
            ) {
                // Not on the default branch
                if (branchColor === undefined) {
                    // No color specified, use modified repo color
                    branchColor = repoColor?.rotate(hueRotation);
                    outputChannel.appendLine('  Not on default branch, using rotated color (hue+' + hueRotation + '°)');
                }
            } else {
                // On the default branch
                branchColor = repoColor;
                outputChannel.appendLine('  On default branch, using repo color: ' + branchColor.hex());
            }
        } else {
            branchColor = repoColor;
            outputChannel.appendLine('  No default branch specified, using repo color for branch');
        }
    }

    // Now check branch rules - first check local repo rules, then global
    let branchMatch = false;
    let hasLocalBranchRulesConfigured = false;

    // Check for branch rule preview mode
    const previewBranchContext = configProvider?.getPreviewBranchRuleContext();

    if (previewBranchContext !== null && previewBranchContext !== undefined) {
        outputChannel.appendLine('  [PREVIEW MODE] Using branch rule at index ' + previewBranchContext.index);
        outputChannel.appendLine('  [PREVIEW MODE] Is global: ' + previewBranchContext.isGlobal);

        let previewRule: { pattern: string; color: string; enabled?: boolean } | undefined;

        if (previewBranchContext.isGlobal) {
            // Get global branch rule
            const branchRulesList = Array.from(branchMap.entries());
            if (branchRulesList[previewBranchContext.index]) {
                const [pattern, color] = branchRulesList[previewBranchContext.index];
                previewRule = { pattern, color };
            }
        } else {
            // Get local branch rule from specific repo
            if (
                previewBranchContext.repoIndex !== undefined &&
                repoConfigList &&
                repoConfigList[previewBranchContext.repoIndex]
            ) {
                const repo = repoConfigList[previewBranchContext.repoIndex];
                if (repo.branchRules && repo.branchRules[previewBranchContext.index]) {
                    previewRule = repo.branchRules[previewBranchContext.index];
                }
            }
        }

        if (previewRule) {
            outputChannel.appendLine('  [PREVIEW MODE] Branch rule: "' + previewRule.pattern + '"');

            // Check if this is a profile name
            const advancedProfiles = workspace
                .getConfiguration('windowColors')
                .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
            const profileName = extractProfileName(previewRule.color, advancedProfiles);

            if (profileName) {
                // It's a profile - resolve it
                outputChannel.appendLine('  [PREVIEW MODE] Using Profile: ' + profileName);
                if (!matchedRepoConfig) {
                    matchedRepoConfig = {
                        repoQualifier: '',
                        defaultBranch: undefined,
                        primaryColor: '',
                        branchColor: undefined,
                        branchProfileName: profileName,
                    };
                } else {
                    matchedRepoConfig.branchProfileName = profileName;
                }
            } else {
                // It's a color
                branchColor = Color(previewRule.color);
                outputChannel.appendLine('  [PREVIEW MODE] Using color: ' + branchColor.hex());
            }
            branchMatch = true;
        }
    }

    // Check if matched repo has local branch rules
    if (
        matchedRepoConfig &&
        matchedRepoConfig.useGlobalBranchRules === false &&
        matchedRepoConfig.branchRules &&
        matchedRepoConfig.branchRules.length > 0
    ) {
        hasLocalBranchRulesConfigured = true;
        outputChannel.appendLine(
            `  Checking local branch rules for repo (${matchedRepoConfig.branchRules.length} rules)`,
        );

        for (const rule of matchedRepoConfig.branchRules) {
            // Skip disabled rules
            if (rule.enabled === false) {
                continue;
            }

            if (rule.pattern === '') {
                continue;
            }

            if (currentBranch?.match(rule.pattern)) {
                // Check if this is a profile name
                const advancedProfiles = workspace
                    .getConfiguration('windowColors')
                    .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
                const profileName = extractProfileName(rule.color, advancedProfiles);

                if (profileName) {
                    // It's a profile - resolve it
                    outputChannel.appendLine(
                        '  Local branch rule matched: "' + rule.pattern + '" using Profile: ' + profileName,
                    );
                    matchedRepoConfig.branchProfileName = profileName;
                } else {
                    // It's a color
                    branchColor = Color(rule.color);
                    outputChannel.appendLine(
                        '  Local branch rule matched: "' + rule.pattern + '" with color: ' + branchColor.hex(),
                    );
                }
                branchMatch = true;
                break;
            }
        }
    } else if (matchedRepoConfig && matchedRepoConfig.useGlobalBranchRules === false) {
        // Repo is configured to use local rules, but the array is empty or undefined
        hasLocalBranchRulesConfigured = true;
        outputChannel.appendLine('  Repo configured for local branch rules, but none defined');
    }

    // Only check global branch rules if local rules are not configured
    if (!branchMatch && !hasLocalBranchRulesConfigured) {
        for (const [branch, colorOrProfile] of branchMap) {
            if (branch === '') {
                continue;
            }
            if (currentBranch?.match(branch)) {
                // Check if this is a profile name
                const advancedProfiles = workspace
                    .getConfiguration('windowColors')
                    .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
                const profileName = extractProfileName(colorOrProfile, advancedProfiles);

                if (profileName) {
                    // It's a profile - resolve it
                    outputChannel.appendLine('  Branch rule matched: "' + branch + '" using Profile: ' + profileName);
                    // Set the branch profile name so it gets resolved later
                    if (!matchedRepoConfig) {
                        matchedRepoConfig = {
                            repoQualifier: '',
                            defaultBranch: undefined,
                            primaryColor: '',
                            branchColor: undefined,
                            branchProfileName: profileName,
                        };
                    } else {
                        matchedRepoConfig.branchProfileName = profileName;
                    }
                } else {
                    // It's a color
                    branchColor = Color(colorOrProfile);
                    outputChannel.appendLine(
                        '  Branch rule matched: "' + branch + '" with color: ' + branchColor.hex(),
                    );
                }
                branchMatch = true;
                // if (repoColor === undefined) {
                //     outputChannel.appendLine('  No repo color specified, using branch color as repo color');
                //     // No repo config, so use the branch color as the repo color
                //     repoColor = branchColor;
                // }

                break;
            }
        }
    }

    if (!branchMatch) {
        if (repoColor === undefined) {
            outputChannel.appendLine('  No branch rule matched');
        } else {
            outputChannel.appendLine('  No branch rule matched, using repo color for branch color');
        }
    }

    if (
        (branchColor === undefined || repoColor === undefined) &&
        (!matchedRepoConfig || !matchedRepoConfig.profileName)
    ) {
        // No color specified, so do nothing
        outputChannel.appendLine('  No color configuration data specified for this repo or branch.');
        if (getBooleanSetting('removeManagedColors')) {
            undoColors();
        }
        return;
    }

    let newColors: any = {};
    const advancedProfiles =
        (workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as {
            [key: string]: AdvancedProfile;
        }) || {};

    outputChannel.appendLine(`  Available profiles: ${Object.keys(advancedProfiles).join(', ')}`);

    // Determine repo profile and branch profile separately
    let repoProfileName: string | null = null;
    let branchProfileName: string | null = null;

    if (matchedRepoConfig) {
        // Check for explicit profile name or profile from primaryColor
        repoProfileName =
            matchedRepoConfig.profileName || extractProfileName(matchedRepoConfig.primaryColor, advancedProfiles);
        if (repoProfileName) {
            outputChannel.appendLine(`  Repo profile: ${repoProfileName}`);
        }

        // Check for branch profile (from branch rule or branchColor)
        branchProfileName =
            matchedRepoConfig.branchProfileName ||
            (matchedRepoConfig.branchColor
                ? extractProfileName(matchedRepoConfig.branchColor, advancedProfiles)
                : null);
        if (branchProfileName) {
            outputChannel.appendLine(`  Branch profile: ${branchProfileName}`);
        }
    }

    // Apply profiles: repo profile first (if any), then branch profile overrides (if any)
    // If there's no repo profile but there IS a repo color, apply legacy mode first
    if (!repoProfileName && repoColor && branchColor) {
        // Legacy Mode - apply base colors from repo/branch
        outputChannel.appendLine(
            `  Applying legacy color mode (repo: ${repoColor.hex()}, branch: ${branchColor.hex()})`,
        );

        let titleBarTextColor: Color = Color('#ffffff');
        let titleBarColor: Color = Color('#ffffff');
        let titleInactiveBarColor: Color = Color('#ffffff');
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

            // Branch colors (which may be primary color too)
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

            // Branch colors (which may be primary color too)
            activityBarColor = branchColor.darken(activityBarColorKnob);
            inactiveTabColor = doApplyBranchColorExtra ? activityBarColor : titleBarColor.darken(activityBarColorKnob);
            activeTabColor = inactiveTabColor.darken(0.4);
        }

        newColors = {
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

        outputChannel.appendLine(
            `  Applied ${Object.keys(newColors).filter((k) => newColors[k] !== undefined).length} color mappings`,
        );
    } else if (repoProfileName && advancedProfiles[repoProfileName]) {
        // Apply repo profile
        outputChannel.appendLine(`  Applying repo profile "${repoProfileName}"`);
        const repoProfile = advancedProfiles[repoProfileName];
        newColors = resolveProfile(repoProfile, repoColor || Color('#000000'), branchColor || Color('#000000'));
        outputChannel.appendLine(`  Applied ${Object.keys(newColors).length} color mappings from profile`);
    } else if (repoProfileName && !advancedProfiles[repoProfileName]) {
        outputChannel.appendLine(`  ERROR: Repo profile "${repoProfileName}" not found!`);
        outputChannel.appendLine(`  Available profiles: ${Object.keys(advancedProfiles).join(', ')}`);
    } else {
        outputChannel.appendLine('  No repo profile or colors to apply');
    }

    if (branchProfileName && advancedProfiles[branchProfileName]) {
        // Apply branch profile (overrides repo profile)
        outputChannel.appendLine(`  Applying branch profile "${branchProfileName}" (overrides repo colors)`);
        const branchProfile = advancedProfiles[branchProfileName];
        const branchColors = resolveProfile(
            branchProfile,
            repoColor || Color('#000000'),
            branchColor || Color('#000000'),
        );

        // Merge: branch profile colors override repo profile colors, but only for defined values
        const definedBranchColors = Object.entries(branchColors).filter(([, value]) => value !== undefined).length;
        Object.entries(branchColors).forEach(([key, value]) => {
            if (value !== undefined) {
                newColors[key] = value;
            }
        });
        outputChannel.appendLine(
            `  Branch profile applied ${definedBranchColors} overrides, total: ${Object.keys(newColors).length} mappings`,
        );
    }

    // If branch color is specified (but no branch profile), override activity bar
    // Note: When using profiles, we don't apply the activityBarColorKnob
    if (branchColor && !branchProfileName && repoProfileName) {
        outputChannel.appendLine(`  Branch rule color overrides activity bar: ${branchColor.hex()}`);

        const theme: ColorThemeKind = window.activeColorTheme.kind;
        let titleBarTextColor: Color = Color('#ffffff');
        let activityBarColor: Color = Color('#ffffff');

        if (theme === ColorThemeKind.Dark) {
            activityBarColor = branchColor;
            if (branchColor.isDark()) {
                titleBarTextColor = getColorWithLuminosity(branchColor, 0.95, 1);
            } else {
                titleBarTextColor = getColorWithLuminosity(branchColor, 0, 0.01);
            }
        } else if (theme === ColorThemeKind.Light) {
            activityBarColor = branchColor;
            if (branchColor.isDark()) {
                titleBarTextColor = getColorWithLuminosity(branchColor, 0.95, 1);
            } else {
                titleBarTextColor = getColorWithLuminosity(branchColor, 0, 0.01);
            }
        }

        newColors['activityBar.background'] = activityBarColor.hex();
        newColors['activityBar.foreground'] = titleBarTextColor.hex();
    }

    // If we have any profile-based colors, show them
    if (repoProfileName || branchProfileName) {
        // Debug: Show what colors are being set
        Object.entries(newColors).forEach(([key, value]) => {
            if (value !== undefined) {
                outputChannel.appendLine(`    ${key} = ${value}`);
            }
        });
    }

    // Show final result message for legacy mode (when no profiles at all)
    if (!repoProfileName && !branchProfileName && repoColor && branchColor) {
        if (repoColor === branchColor) {
            outputChannel.appendLine(`  Applying color for this repo: ${repoColor.hex()}`);
        } else {
            outputChannel.appendLine(
                `  Applying colors for this repo: repo ${repoColor.hex()}, branch ${branchColor.hex()}`,
            );
        }
    }

    // Remove all managed colors from existing customizations to start clean
    const cleanedCC = { ...cc };
    for (const key of managedColors) {
        delete cleanedCC[key];
    }

    // Add newColors to the cleaned customizations
    // Only add defined color values (skip undefined to avoid setting them explicitly)
    const finalColors = { ...cleanedCC };
    for (const [key, value] of Object.entries(newColors)) {
        if (value !== undefined) {
            finalColors[key] = value;
        }
    }

    // Ensure any managed colors that should be "None" (not in newColors or undefined) are removed
    // This guarantees that profile settings with "None" don't leave stale colors in settings.json
    for (const key of managedColors) {
        if (newColors[key] === undefined && finalColors[key] !== undefined) {
            delete finalColors[key];
            outputChannel.appendLine(`  Removed stale color: ${key}`);
        }
    }

    outputChannel.appendLine(
        `  Setting ${Object.keys(newColors).filter((k) => newColors[k] !== undefined).length} color customizations`,
    );
    workspace.getConfiguration('workbench').update('colorCustomizations', finalColors, false);

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

// Export configuration to JSON file
async function exportConfiguration(): Promise<void> {
    try {
        // Get current configuration
        const config = workspace.getConfiguration('windowColors');
        const exportData = {
            repoConfigurationList: config.get('repoConfigurationList'),
            branchConfigurationList: config.get('branchConfigurationList'),
            removeManagedColors: config.get('removeManagedColors'),
            invertBranchColorLogic: config.get('invertBranchColorLogic'),
            colorInactiveTitlebar: config.get('colorInactiveTitlebar'),
            colorEditorTabs: config.get('colorEditorTabs'),
            colorStatusBar: config.get('colorStatusBar'),
            activityBarColorKnob: config.get('activityBarColorKnob'),
            applyBranchColorToTabsAndStatusBar: config.get('applyBranchColorToTabsAndStatusBar'),
            automaticBranchIndicatorColorKnob: config.get('automaticBranchIndicatorColorKnob'),
            showBranchColumns: config.get('showBranchColumns'),
            showStatusIconWhenNoRuleMatches: config.get('showStatusIconWhenNoRuleMatches'),
            askToColorizeRepoWhenOpened: config.get('askToColorizeRepoWhenOpened'),
            enableProfilesAdvanced: config.get('enableProfilesAdvanced'),
            advancedProfiles: config.get('advancedProfiles'),
            exportedAt: new Date().toISOString(),
            version: '1.5.0',
        };

        // Get last export path or default to home directory
        const lastExportPath = config.get<string>('lastExportPath') || os.homedir();

        // Create filename with YYMMDD datestamp
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2); // Get last 2 digits of year
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = now.getDate().toString().padStart(2, '0');
        const dateStamp = `${year}${month}${day}`;
        const defaultFilename = `git-repo-window-colors-config-${dateStamp}.json`;

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(lastExportPath, defaultFilename)),
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*'],
            },
            title: 'Export Git Repo Window Colors Configuration',
        });

        if (!saveUri) {
            return; // User cancelled
        }

        // Save the file
        await fs.writeFile(saveUri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');

        // Remember the directory for next time
        const exportDir = path.dirname(saveUri.fsPath);
        await config.update('lastExportPath', exportDir, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(`Configuration exported successfully to ${saveUri.fsPath}`);
        outputChannel.appendLine(`Configuration exported to: ${saveUri.fsPath}`);
    } catch (error) {
        const errorMessage = `Failed to export configuration: ${error}`;
        vscode.window.showErrorMessage(errorMessage);
        outputChannel.appendLine(errorMessage);
    }
}

// Import configuration from JSON file
async function importConfiguration(): Promise<void> {
    try {
        // Get last import path or default to home directory
        const config = workspace.getConfiguration('windowColors');
        const lastImportPath = config.get<string>('lastImportPath') || os.homedir();

        // Show open dialog
        const openUri = await vscode.window.showOpenDialog({
            defaultUri: vscode.Uri.file(lastImportPath),
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*'],
            },
            title: 'Import Git Repo Window Colors Configuration',
        });

        if (!openUri || openUri.length === 0) {
            return; // User cancelled
        }

        const importPath = openUri[0].fsPath;

        // Read and parse the file
        const fileContent = await fs.readFile(importPath, 'utf8');
        const importData = JSON.parse(fileContent);

        // Validate that this looks like a valid configuration file
        if (!importData.repoConfigurationList && !importData.branchConfigurationList) {
            vscode.window.showErrorMessage('Invalid configuration file: Missing required configuration data');
            return;
        }

        // Show confirmation dialog
        const action = await vscode.window.showWarningMessage(
            'This will replace your current Git Repo Window Colors configuration. Do you want to continue?',
            { modal: true },
            'Import and Replace',
            'Merge with Current',
            'Cancel',
        );

        if (action === 'Cancel' || !action) {
            return;
        }

        // Apply the configuration
        const configUpdates: Array<Thenable<void>> = [];

        if (action === 'Import and Replace') {
            // Replace all configuration
            if (importData.repoConfigurationList !== undefined) {
                configUpdates.push(
                    config.update(
                        'repoConfigurationList',
                        importData.repoConfigurationList,
                        vscode.ConfigurationTarget.Global,
                    ),
                );
            }
            if (importData.branchConfigurationList !== undefined) {
                configUpdates.push(
                    config.update(
                        'branchConfigurationList',
                        importData.branchConfigurationList,
                        vscode.ConfigurationTarget.Global,
                    ),
                );
            }
        } else if (action === 'Merge with Current') {
            // Merge configurations
            const currentRepoList = config.get<string[]>('repoConfigurationList') || [];
            const currentBranchList = config.get<string[]>('branchConfigurationList') || [];

            const importRepoList = importData.repoConfigurationList || [];
            const importBranchList = importData.branchConfigurationList || [];

            // Merge repo configurations (avoid duplicates based on repo qualifier)
            const mergedRepoList = [...currentRepoList];
            for (const importItem of importRepoList) {
                const repoQualifier = importItem.split(':')[0].split('|')[0].trim();
                const existingIndex = mergedRepoList.findIndex(
                    (item) => item.split(':')[0].split('|')[0].trim() === repoQualifier,
                );
                if (existingIndex >= 0) {
                    mergedRepoList[existingIndex] = importItem; // Replace existing
                } else {
                    mergedRepoList.push(importItem); // Add new
                }
            }

            // Merge branch configurations (avoid duplicates based on branch pattern)
            const mergedBranchList = [...currentBranchList];
            for (const importItem of importBranchList) {
                const branchPattern = importItem.split(':')[0].trim();
                const existingIndex = mergedBranchList.findIndex((item) => item.split(':')[0].trim() === branchPattern);
                if (existingIndex >= 0) {
                    mergedBranchList[existingIndex] = importItem; // Replace existing
                } else {
                    mergedBranchList.push(importItem); // Add new
                }
            }

            configUpdates.push(
                config.update('repoConfigurationList', mergedRepoList, vscode.ConfigurationTarget.Global),
            );
            configUpdates.push(
                config.update('branchConfigurationList', mergedBranchList, vscode.ConfigurationTarget.Global),
            );
        }

        // Apply other settings (always replace, not merge)
        if (importData.removeManagedColors !== undefined) {
            configUpdates.push(
                config.update('removeManagedColors', importData.removeManagedColors, vscode.ConfigurationTarget.Global),
            );
        }
        if (importData.invertBranchColorLogic !== undefined) {
            configUpdates.push(
                config.update(
                    'invertBranchColorLogic',
                    importData.invertBranchColorLogic,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.colorInactiveTitlebar !== undefined) {
            configUpdates.push(
                config.update(
                    'colorInactiveTitlebar',
                    importData.colorInactiveTitlebar,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.colorEditorTabs !== undefined) {
            configUpdates.push(
                config.update('colorEditorTabs', importData.colorEditorTabs, vscode.ConfigurationTarget.Global),
            );
        }
        if (importData.colorStatusBar !== undefined) {
            configUpdates.push(
                config.update('colorStatusBar', importData.colorStatusBar, vscode.ConfigurationTarget.Global),
            );
        }
        if (importData.activityBarColorKnob !== undefined) {
            configUpdates.push(
                config.update(
                    'activityBarColorKnob',
                    importData.activityBarColorKnob,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.applyBranchColorToTabsAndStatusBar !== undefined) {
            configUpdates.push(
                config.update(
                    'applyBranchColorToTabsAndStatusBar',
                    importData.applyBranchColorToTabsAndStatusBar,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.automaticBranchIndicatorColorKnob !== undefined) {
            configUpdates.push(
                config.update(
                    'automaticBranchIndicatorColorKnob',
                    importData.automaticBranchIndicatorColorKnob,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.showBranchColumns !== undefined) {
            configUpdates.push(
                config.update('showBranchColumns', importData.showBranchColumns, vscode.ConfigurationTarget.Global),
            );
        }
        if (importData.showStatusIconWhenNoRuleMatches !== undefined) {
            configUpdates.push(
                config.update(
                    'showStatusIconWhenNoRuleMatches',
                    importData.showStatusIconWhenNoRuleMatches,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.askToColorizeRepoWhenOpened !== undefined) {
            configUpdates.push(
                config.update(
                    'askToColorizeRepoWhenOpened',
                    importData.askToColorizeRepoWhenOpened,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.enableProfilesAdvanced !== undefined) {
            configUpdates.push(
                config.update(
                    'enableProfilesAdvanced',
                    importData.enableProfilesAdvanced,
                    vscode.ConfigurationTarget.Global,
                ),
            );
        }
        if (importData.advancedProfiles !== undefined) {
            configUpdates.push(
                config.update('advancedProfiles', importData.advancedProfiles, vscode.ConfigurationTarget.Global),
            );
        }

        // Wait for all updates to complete
        await Promise.all(configUpdates);

        // Remember the directory for next time
        const importDir = path.dirname(importPath);
        await config.update('lastImportPath', importDir, vscode.ConfigurationTarget.Global);

        // Refresh the configuration webview if it's open
        if (configProvider) {
            configProvider._sendConfigurationToWebview();
        }

        // Apply the new colors
        doit('configuration import');

        const successMessage = `Configuration imported successfully from ${importPath}`;
        vscode.window.showInformationMessage(successMessage);
        outputChannel.appendLine(successMessage);
    } catch (error) {
        const errorMessage = `Failed to import configuration: ${error}`;
        vscode.window.showErrorMessage(errorMessage);
        outputChannel.appendLine(errorMessage);
    }
}
