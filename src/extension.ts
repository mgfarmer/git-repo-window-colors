import Color from 'color';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ColorThemeKind, ExtensionContext, window, workspace } from 'vscode';
import { resolveProfile } from './profileResolver';
import { AdvancedProfile, ThemeKind, ThemedColor } from './types/advancedModeTypes';
import { resolveThemedColor, createThemedColor } from './colorDerivation';
import { BranchRule } from './types/webviewTypes';
import { ConfigWebviewProvider } from './webview/configWebview';
import { matchesLocalFolderPattern } from './pathUtils';
import { extractRepoNameFromUrl as extractRepoNameFromUrlCore } from './repoUrlParser';
import { createRepoProfile, createBranchProfile, ProfileFactorySettings, ProfileFactoryLogger } from './profileFactory';
import {
    parseRepoRules,
    parseBranchRules,
    ConfigProvider as RuleConfigProvider,
    RuleParserLogger,
    ValidationContext,
    RepoConfig,
} from './ruleParser';
import { findMatchingRepoRule, WorkspaceContext } from './ruleMatching';
import { applyColors, removeAllManagedColors, SettingsApplicatorLogger } from './settingsApplicator';
import { getStatusBarState, StatusBarConfig } from './statusBarManager';
import {
    isGitExtensionAvailable,
    getWorkspaceRepository,
    getCurrentBranch,
    getRemoteUrl,
    GitExtension,
    GitRepository,
    WorkspaceInfo,
    GitOperationsLogger,
} from './gitOperations';

let currentBranch: undefined | string = undefined;

// Flag to track that migration ran and changed configuration
// When true, init() should skip calling doit() because the config change event will handle it
let migrationDidRun = false;

// Track validation errors for rules (index -> error message)
let repoRuleErrors: Map<number, string> = new Map();
let branchRuleErrors: Map<number, string> = new Map();

/**
 * Get current repo rule validation errors
 */
export function getRepoRuleErrors(): Map<number, string> {
    return new Map(repoRuleErrors);
}

/**
 * Get current branch rule validation errors
 */
export function getBranchRuleErrors(): Map<number, string> {
    return new Map(branchRuleErrors);
}

/**
 * Trigger validation of rules to populate error maps
 */
export function validateRules(): void {
    getRepoConfigList(true);
    getBranchData(true);
}

/**
 * TEST ONLY: Reset all module-level state for test isolation
 * This function should only be called by tests to ensure clean state between test runs
 */
export function __resetModuleStateForTesting(): void {
    currentBranch = undefined;
    migrationDidRun = false;
    repoRuleErrors.clear();
    branchRuleErrors.clear();
    gitRepoRemoteFetchUrl = '';
    simpleModeProfileCache.clear();
    // Note: gitExt, gitApi, gitRepository, outputChannel, statusBarItem, configProvider
    // are set during activation and should be mocked by tests as needed
}

/**
 * TEST ONLY: Initialize module state for testing
 * Sets up the minimal state needed for doit() to function
 */
export function __initializeModuleForTesting(
    mockOutputChannel: vscode.OutputChannel,
    mockGitRepository: any,
    mockConfigProvider?: ConfigWebviewProvider,
): void {
    outputChannel = mockOutputChannel;
    gitRepository = mockGitRepository;
    gitRepoRemoteFetchUrl = mockGitRepository?.state?.remotes?.[0]?.fetchUrl || '';
    currentBranch = mockGitRepository?.state?.HEAD?.name || undefined;
    configProvider = mockConfigProvider as any;
    gitApi = {
        getRepository: () => mockGitRepository,
    };
}

/**
 * TEST ONLY: Export doit function for integration testing
 * This allows tests to directly invoke the main coloring logic
 */
export async function __doitForTesting(reason: string, usePreviewMode: boolean = false): Promise<void> {
    return doit(reason, usePreviewMode);
}

// RepoConfig type is now exported from ruleParser.ts

// ========== Local Folder Path Utilities ==========
// Path utilities are now in pathUtils.ts and imported above

// Export path utilities for use in webview and other modules
export { expandEnvVars, simplifyPath, validateLocalFolderPath } from './pathUtils';

/**
 * Converts VS Code's ColorThemeKind to our ThemeKind type
 */
function getThemeKind(colorThemeKind: ColorThemeKind): ThemeKind {
    switch (colorThemeKind) {
        case ColorThemeKind.Light:
            return 'light';
        case ColorThemeKind.Dark:
            return 'dark';
        case ColorThemeKind.HighContrast:
            return 'highContrast';
        default:
            return 'dark';
    }
}

/**
 * Clears the temporary profile cache (called when settings change)
 */
function clearSimpleModeProfileCache(): void {
    simpleModeProfileCache.clear();
    outputChannel.appendLine('[Cache] Cleared simple mode profile cache');
}

/**
 * Creates a temporary AdvancedProfile for repo colors (title bar, tabs, status bar).
 * This handles simple mode repo rules by converting them to profiles.
 *
 * Note: This wrapper handles caching and delegates to profileFactory module.
 */
function createRepoTempProfile(repoColor: Color): AdvancedProfile {
    const theme = window.activeColorTheme.kind;
    const isDark = theme === ColorThemeKind.Dark || theme === ColorThemeKind.HighContrast;

    // Read settings from windowColors namespace
    const settings = workspace.getConfiguration('windowColors');
    const doColorInactiveTitlebar = settings.get<boolean>('colorInactiveTitlebar', true);
    const doColorEditorTabs = settings.get<boolean>('colorEditorTabs', true);
    const doColorStatusBar = settings.get<boolean>('colorStatusBar', true);
    const activityBarColorKnob = settings.get<number>('activityBarColorKnob', 0);

    // Create cache key
    const cacheKey = [
        'repo',
        repoColor.hex(),
        theme.toString(),
        doColorInactiveTitlebar.toString(),
        doColorEditorTabs.toString(),
        doColorStatusBar.toString(),
        activityBarColorKnob.toString(),
    ].join('|');

    // Check cache
    if (simpleModeProfileCache.has(cacheKey)) {
        return simpleModeProfileCache.get(cacheKey)!;
    }

    // Create profile using extracted module
    const profileSettings: ProfileFactorySettings = {
        colorInactiveTitlebar: doColorInactiveTitlebar,
        colorEditorTabs: doColorEditorTabs,
        colorStatusBar: doColorStatusBar,
        activityBarColorKnob: activityBarColorKnob,
        isDarkTheme: isDark,
    };

    const logger: ProfileFactoryLogger = {
        log: (message: string) => outputChannel.appendLine(message),
    };

    const profile = createRepoProfile(repoColor, profileSettings, logger);

    // Cache it
    simpleModeProfileCache.set(cacheKey, profile);

    return profile;
}

/**
 * Creates a temporary AdvancedProfile for branch colors (activity bar only).
 * This handles simple mode branch rules by converting them to profiles.
 *
 * Note: This wrapper handles caching and delegates to profileFactory module.
 */
function createBranchTempProfile(branchColor: Color): AdvancedProfile {
    const theme = window.activeColorTheme.kind;
    const isDark = theme === ColorThemeKind.Dark || theme === ColorThemeKind.HighContrast;

    // Read settings - color knob is in windowColors namespace
    const windowSettings = workspace.getConfiguration('windowColors');
    const activityBarColorKnob = windowSettings.get<number>('activityBarColorKnob', 0);

    // Create cache key
    const cacheKey = ['branch', branchColor.hex(), theme.toString(), activityBarColorKnob.toString()].join('|');

    // Check cache
    if (simpleModeProfileCache.has(cacheKey)) {
        return simpleModeProfileCache.get(cacheKey)!;
    }

    // Create profile using extracted module
    const profileSettings: ProfileFactorySettings = {
        colorInactiveTitlebar: false, // Not used for branch profiles
        colorEditorTabs: false, // Not used for branch profiles
        colorStatusBar: false, // Not used for branch profiles
        activityBarColorKnob: activityBarColorKnob,
        isDarkTheme: isDark,
    };

    const logger: ProfileFactoryLogger = {
        log: (message: string) => outputChannel.appendLine(message),
    };

    const profile = createBranchProfile(branchColor, profileSettings, logger);

    // Cache it
    simpleModeProfileCache.set(cacheKey, profile);

    return profile;
}

// Function to test if the vscode git model exists
// This is a wrapper around the extracted gitOperations module
function isGitModelAvailable(): boolean {
    const extension = vscode.extensions.getExtension('vscode.git') as GitExtension | undefined;
    const logger: GitOperationsLogger = {
        warn: (message: string) => console.warn(message),
    };
    return isGitExtensionAvailable(extension, logger);
}

function repoConfigAsString(repoConfig: RepoConfig): string {
    let result = repoConfig.repoQualifier;
    result += ': ' + repoConfig.primaryColor;
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

// Cache for temporary profiles generated from simple mode colors
let simpleModeProfileCache: Map<string, AdvancedProfile> = new Map();

// Helper functions for status bar
function createStatusBarItem(context: ExtensionContext): void {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'windowColors.statusBarClick';
    statusBarItem.text = '$(symbol-color)';
    statusBarItem.tooltip = 'Git Repo Window Colors - Click to configure';
    context.subscriptions.push(statusBarItem);
}

function updateStatusBarItem(): void {
    if (!statusBarItem) return;

    // Get current workspace context
    const context: WorkspaceContext | undefined = getWorkspaceContextForStatusBar();

    // Get rules
    const rules = getRepoConfigList(false);

    // Get configuration
    const showOnlyWhenNoMatch = getBooleanSetting('showStatusIconWhenNoRuleMatches') ?? true;
    const config: StatusBarConfig = {
        showOnlyWhenNoMatch,
    };

    // Get status bar state from extracted module
    const state = getStatusBarState(rules, context, config);

    // Apply state to VS Code status bar item
    statusBarItem.tooltip = state.tooltip;
    if (state.visible) {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

/**
 * Helper to get workspace context for status bar calculations.
 * This bridges the gap between VS Code APIs and the pure statusBarManager module.
 */
function getWorkspaceContextForStatusBar(): WorkspaceContext | undefined {
    const repoUrl = gitRepoRemoteFetchUrl || '';
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Return undefined if no context available
    if (!repoUrl && !workspaceFolder) {
        return undefined;
    }

    return {
        repoUrl,
        workspaceFolder,
    };
}

/**
 * Get the current configuration schema version from package.json
 */
function getCurrentConfigSchemaVersion(): number {
    const extension = vscode.extensions.getExtension('KevinMills.git-repo-window-colors');
    if (!extension?.packageJSON) {
        outputChannel.appendLine('Warning: Could not read extension package.json, using default schema version 1');
        return 1;
    }

    // Read schema version from package.json configuration
    const configs = extension.packageJSON.contributes?.configuration;
    if (Array.isArray(configs)) {
        for (const config of configs) {
            const schemaVersion = config.properties?.['windowColors.configSchemaVersion']?.default;
            if (typeof schemaVersion === 'number') {
                return schemaVersion;
            }
        }
    }

    outputChannel.appendLine('Warning: configSchemaVersion not found in package.json, using default schema version 1');
    return 1;
}

/**
 * Migrate configuration based on schema version
 *
 * Version history:
 * - Version 0 (legacy): String-based repoConfigurationList and branchConfigurationList
 * - Version 1: Introduction of JSON objects, shared branch tables model
 *
 * This migration handles the original legacy format:
 * - repoConfigurationList: ["reponame:color"] -> RepoConfigRule with branchTableName="Default Rules"
 * - branchConfigurationList: ["pattern:color"] -> "Default Rules" shared table
 *
 * All repo rules reference the "Default Rules" shared branch table.
 */
async function migrateConfigurationToJson(context: ExtensionContext): Promise<void> {
    const CURRENT_CONFIG_SCHEMA_VERSION = getCurrentConfigSchemaVersion();
    const lastMigratedVersion = context.globalState.get<number>('configSchemaVersion', 0);

    // Skip if already on current version
    if (lastMigratedVersion >= CURRENT_CONFIG_SCHEMA_VERSION) {
        outputChannel.appendLine(`Configuration schema is current (v${lastMigratedVersion})`);
        return;
    }

    outputChannel.appendLine(
        `Migrating configuration from v${lastMigratedVersion} to v${CURRENT_CONFIG_SCHEMA_VERSION}...`,
    );

    const config = workspace.getConfiguration('windowColors');

    try {
        // Get advanced profiles for validation
        const advancedProfiles = config.get('advancedProfiles', {}) as { [key: string]: any };

        // ========== Migration from v0 to v1+ ==========
        if (lastMigratedVersion < 1) {
            outputChannel.appendLine(
                'Running v0 -> v1 migration: Converting to JSON objects and shared branch tables...',
            );

            // ===== STEP 1: Migrate repoConfigurationList =====
            const repoConfigList = config.get('repoConfigurationList', []) as any[];
            const migratedRepoList: any[] = [];
            let repoRulesMigrated = 0;

            for (const item of repoConfigList) {
                // Skip if already JSON object - just ensure it has branchTableName
                if (typeof item === 'object' && item !== null) {
                    // Ensure branchTableName is set
                    if (!item.branchTableName) {
                        item.branchTableName = 'Default Rules';
                    }

                    // Clean up legacy fields from old branch rule models
                    delete item.defaultBranch;
                    delete item.branchColor;
                    delete item.branchRules;
                    delete item.useGlobalBranchRules;

                    migratedRepoList.push(item);
                    continue;
                }

                // Parse legacy string format: "repoQualifier:primaryColor"
                if (typeof item === 'string') {
                    try {
                        const parts = item.split(':');
                        if (parts.length < 2) {
                            outputChannel.appendLine(`Skipping invalid repo rule: ${item}`);
                            continue;
                        }

                        const repoQualifier = parts[0].trim();
                        const primaryColorString = parts[1].trim();

                        // Check if primaryColor is an advanced profile name
                        let profileName: string | undefined = undefined;
                        if (advancedProfiles[primaryColorString]) {
                            profileName = primaryColorString;
                        }

                        // Create ThemedColor with auto-derivation for migrated colors
                        const primaryColor = createThemedColor(
                            primaryColorString,
                            getThemeKind(window.activeColorTheme.kind),
                        );

                        const migratedRule: any = {
                            repoQualifier,
                            primaryColor,
                            enabled: true,
                            branchTableName: 'Default Rules', // All repo rules use Default Rules table
                        };

                        if (profileName) {
                            migratedRule.profileName = profileName;
                        }

                        migratedRepoList.push(migratedRule);
                        repoRulesMigrated++;
                        outputChannel.appendLine(
                            `Migrated repo rule: "${item}" -> RepoConfigRule with ThemedColor (auto-derived from ${primaryColorString})`,
                        );
                    } catch (err) {
                        outputChannel.appendLine(`Error migrating repo rule: ${item} - ${err}`);
                        // Skip invalid entries
                    }
                }
            }

            // ===== STEP 2: Migrate branchConfigurationList =====
            const branchConfigList = config.get('branchConfigurationList', []) as any[];
            const migratedBranchList: any[] = [];
            let branchRulesMigrated = 0;

            for (const item of branchConfigList) {
                // Skip if already JSON object
                if (typeof item === 'object' && item !== null) {
                    migratedBranchList.push(item);
                    continue;
                }

                // Parse legacy string format: "pattern:color"
                if (typeof item === 'string') {
                    try {
                        const parts = item.split(':');
                        if (parts.length < 2) {
                            outputChannel.appendLine(`Skipping invalid branch rule: ${item}`);
                            continue;
                        }

                        const pattern = parts[0].trim();
                        const colorString = parts[1].trim();

                        // Create ThemedColor with auto-derivation for migrated colors
                        const color = createThemedColor(colorString, getThemeKind(window.activeColorTheme.kind));

                        const migratedRule = {
                            pattern,
                            color,
                            enabled: true,
                        };

                        migratedBranchList.push(migratedRule);
                        branchRulesMigrated++;
                        outputChannel.appendLine(
                            `Migrated branch rule: "${item}" -> BranchConfigRule with ThemedColor (auto-derived from ${colorString})`,
                        );
                    } catch (err) {
                        outputChannel.appendLine(`Error migrating branch rule: ${item} - ${err}`);
                        // Skip invalid entries
                    }
                }
            }

            // ===== STEP 3: Create/Update sharedBranchTables =====
            const existingSharedBranchTables = config.get('sharedBranchTables', null);
            const sharedBranchTables: { [key: string]: { rules: any[] } } = existingSharedBranchTables || {};

            // Create or update "Default Rules" table with migrated branch rules
            if (!sharedBranchTables['Default Rules']) {
                sharedBranchTables['Default Rules'] = {
                    rules: migratedBranchList,
                };
                outputChannel.appendLine(
                    `Created "Default Rules" shared table with ${migratedBranchList.length} branch rules`,
                );
            } else if (branchRulesMigrated > 0) {
                // Merge migrated rules into existing Default Rules table
                sharedBranchTables['Default Rules'].rules = migratedBranchList;
                outputChannel.appendLine(
                    `Updated "Default Rules" shared table with ${migratedBranchList.length} branch rules`,
                );
            }

            // Migration: Rename "Global" table to "Default Rules" if it exists
            if (sharedBranchTables['Global']) {
                // Only rename if Default Rules doesn't already exist
                if (!sharedBranchTables['Default Rules']) {
                    sharedBranchTables['Default Rules'] = sharedBranchTables['Global'];
                    outputChannel.appendLine('Renamed "Global" table to "Default Rules"');
                } else {
                    outputChannel.appendLine('Both "Global" and "Default Rules" exist - keeping both for manual merge');
                }
                delete sharedBranchTables['Global'];

                // Update all repo rules that reference "Global" to use "Default Rules"
                for (const repoRule of migratedRepoList) {
                    if (repoRule.branchTableName === 'Global') {
                        repoRule.branchTableName = 'Default Rules';
                    }
                }
            }

            // ===== STEP 4: Write migrated configuration =====
            await config.update('repoRules', migratedRepoList, vscode.ConfigurationTarget.Global);
            await config.update('branchConfigurationList', migratedBranchList, vscode.ConfigurationTarget.Global);
            await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);

            // Signal that migration wrote configuration - init() should wait for config change event
            migrationDidRun = true;

            outputChannel.appendLine(`v0 -> v1 migration completed:`);
            outputChannel.appendLine(
                `  - Repo rules: ${migratedRepoList.length} (${repoRulesMigrated} migrated from string format)`,
            );
            outputChannel.appendLine(
                `  - Branch rules: ${migratedBranchList.length} (${branchRulesMigrated} migrated from string format)`,
            );
            outputChannel.appendLine(`  - Shared tables: ${Object.keys(sharedBranchTables).length}`);
            outputChannel.appendLine(`  - All repo rules configured to use "Default Rules" table`);
        }

        // ========== Future migrations go here ==========
        // if (lastMigratedVersion < 2) {
        //     outputChannel.appendLine('Running v1 -> v2 migration...');
        //     // Add v2 migration logic here
        // }

        // Update schema version in global state
        await context.globalState.update('configSchemaVersion', CURRENT_CONFIG_SCHEMA_VERSION);
        outputChannel.appendLine(`Configuration schema updated to v${CURRENT_CONFIG_SCHEMA_VERSION}`);
    } catch (error) {
        outputChannel.appendLine(`Error during migration: ${error}`);
        vscode.window.showErrorMessage(
            'Failed to migrate configuration. Please check the Window Colors output channel for details.',
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

    return false;
}

export async function activate(context: ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Git Repo Window Colors');

    if (await checkConfiguration(context)) {
        outputChannel.appendLine('This extension is disabled until application restart.');
        return; // Stop activation until restart
    }

    // Create status bar item
    createStatusBarItem(context);

    // Register the configuration webview provider early so it's available regardless of workspace state
    configProvider = new ConfigWebviewProvider(context.extensionUri, context);
    context.subscriptions.push(configProvider);

    // Register openConfig command early so it works even without a workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.openConfig', () => {
            configProvider.show(context.extensionUri);
        }),
    );

    // Register export/import commands early (they work without workspace)
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.exportConfig', async () => {
            await exportConfiguration();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.importConfig', async () => {
            await importConfiguration();
        }),
    );

    // Register command to reset all hint flags (for debugging/testing)
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.resetHintFlags', async () => {
            await configProvider.resetHintFlags();
            vscode.window.showInformationMessage('All hint flags have been reset. Hints will show again.');
        }),
    );

    // Register tour command that shows a quick pick of available tours
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.startTour', async () => {
            // Dismiss the tour link so it won't show again
            await context.globalState.update('grwc.tourLinkDismissed', true);

            // Always ensure the configurator is open first
            configProvider.show(context.extensionUri);

            let tours = configProvider.getRegisteredTours();

            if (tours.length === 0) {
                // No tours registered yet - wait a moment for tours to register
                await new Promise((resolve) => setTimeout(resolve, 500));
                tours = configProvider.getRegisteredTours();
                if (tours.length === 0) {
                    vscode.window.showInformationMessage('No tours available.');
                    return;
                }
            }

            // If only one tour, start it directly
            if (tours.length === 1) {
                configProvider.startTour(tours[0].tourId);
                return;
            }

            // Show quick pick with available tours
            const items = tours.map((t) => ({
                label: t.commandTitle,
                tourId: t.tourId,
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a tour to start',
            });
            if (selected) {
                configProvider.startTour(selected.tourId);
            }
        }),
    );

    // Register internal command for webview to trigger color updates
    // Silently ignore if no workspace - the webview shows its own toast
    context.subscriptions.push(
        vscode.commands.registerCommand(
            '_grwc.internal.applyColors',
            (reason: string, usePreviewMode: boolean = false) => {
                if (!workspace.workspaceFolders) {
                    return;
                }
                doit(reason || 'internal command', usePreviewMode);
            },
        ),
    );

    // Register internal command to clear preview colors
    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.clearPreviewColors', () => {
            if (workspace.workspaceFolders) {
                undoColors();
            }
        }),
    );

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

            // Open the configuration editor (preview mode will show if no rule matches)
            configProvider.show(context.extensionUri);
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
                        .update('repoRules', newArray, true)
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

    // Register debug command to clear first-time flag
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.clearFirstTimeFlag', async () => {
            await context.globalState.update('grwc.hasShownGettingStarted', undefined);
            vscode.window.showInformationMessage('First-time flag cleared. Close and reopen the config panel to test.');
        }),
    );

    // Register status bar click command with smart behavior
    context.subscriptions.push(
        vscode.commands.registerCommand('windowColors.statusBarClick', async () => {
            let configList = getRepoConfigList(false);
            if (configList === undefined) {
                configList = new Array<RepoConfig>();
            }

            // Open the configuration editor (preview mode will show if no rule matches)
            configProvider.show(context.extensionUri);
        }),
    );

    // Register internal commands for branch table management
    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.createBranchTable', (tableName: string) => {
            return createBranchTable(tableName);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.deleteBranchTable', (tableName: string) => {
            return deleteBranchTable(tableName);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.renameBranchTable', (oldName: string, newName: string) => {
            return renameBranchTable(oldName, newName);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('_grwc.internal.getBranchTableUsageCount', (tableName: string) => {
            return getBranchTableUsageCount(tableName);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            console.log('[GRWC] onDidChangeConfiguration fired');
            if (
                e.affectsConfiguration('windowColors') ||
                e.affectsConfiguration('window.titleBarStyle') ||
                e.affectsConfiguration('window.customTitleBarVisibility') ||
                e.affectsConfiguration('workbench.colorTheme')
            ) {
                console.log('[GRWC] Configuration affects windowColors or theme');
                // Clear simple mode profile cache when color settings change
                if (
                    e.affectsConfiguration('windowColors.colorEditorTabs') ||
                    e.affectsConfiguration('windowColors.colorStatusBar') ||
                    e.affectsConfiguration('windowColors.colorInactiveTitlebar') ||
                    e.affectsConfiguration('windowColors.applyBranchColorToTabsAndStatusBar') ||
                    e.affectsConfiguration('windowColors.activityBarColorKnob') ||
                    e.affectsConfiguration('workbench.colorTheme')
                ) {
                    clearSimpleModeProfileCache();
                }
                // Only call doit() if git is initialized and we have repo info
                // This handles the post-migration case where config changes fire before init()
                if (gitRepository && gitRepoRemoteFetchUrl) {
                    console.log('[GRWC] Git ready, calling doit()');
                    // Check if we should use preview mode - use the tracked checkbox state
                    const usePreview = configProvider?.isPreviewModeEnabled() ?? false;
                    doit('settings change', usePreview);
                    migrationDidRun = false; // Clear flag so init() won't call doit() again
                    updateStatusBarItem(); // Update status bar when configuration changes
                } else {
                    console.log('[GRWC] Git not ready yet, skipping doit() - init() will handle it');
                }
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

    // Migrate configuration to JSON format if needed
    // Sets migrationDidRun=true if migration actually changed settings
    await migrateConfigurationToJson(context);

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
        gitRepoRemoteFetchUrl = getRemoteUrl(gitRepository);
        if (gitRepoRemoteFetchUrl) {
            outputChannel.appendLine('Git repository: ' + gitRepoRemoteFetchUrl);
            currentBranch = getCurrentGitBranch();
            if (currentBranch === undefined) {
                outputChannel.appendLine('Could not determine current branch.');
                return;
            }
            outputChannel.appendLine('Current branch: ' + currentBranch);

            // Update workspace info for the configuration webview
            if (configProvider) {
                outputChannel.appendLine('[Extension] Calling setWorkspaceInfo for GIT REPO:');
                outputChannel.appendLine('  URL: ' + gitRepoRemoteFetchUrl);
                outputChannel.appendLine('  Branch: ' + currentBranch);
                outputChannel.appendLine('  isGitRepo: true (implicit)');
                configProvider.setWorkspaceInfo(gitRepoRemoteFetchUrl, currentBranch);
            }

            // If migration ran, the config change events have already fired by now,
            // so the configuration is fresh. We can safely call doit().
            if (migrationDidRun) {
                outputChannel.appendLine('Migration ran - config is now fresh, calling colorizer');
                migrationDidRun = false; // Reset flag
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
                    if (gitRepository) {
                        gitRepoRemoteFetchUrl = getRemoteUrl(gitRepository);
                        if (gitRepoRemoteFetchUrl) {
                            // Remote is now available, clear the interval and proceed
                            clearInterval(remoteCheckInterval);

                            outputChannel.appendLine('Git repository: ' + gitRepoRemoteFetchUrl);
                            currentBranch = getCurrentGitBranch();
                            if (currentBranch === undefined) {
                                outputChannel.appendLine('Could not determine current branch.');
                                return;
                            }
                            outputChannel.appendLine('Current branch: ' + currentBranch);

                            // Update workspace info for the configuration webview
                            if (configProvider) {
                                outputChannel.appendLine(
                                    '[Extension] Calling setWorkspaceInfo for GIT REPO (delayed):',
                                );
                                outputChannel.appendLine('  URL: ' + gitRepoRemoteFetchUrl);
                                outputChannel.appendLine('  Branch: ' + currentBranch);
                                outputChannel.appendLine('  isGitRepo: true (implicit)');
                                configProvider.setWorkspaceInfo(gitRepoRemoteFetchUrl, currentBranch);
                            }

                            doit('initial activation');
                            updateStatusBarItem(); // Update status bar after initialization

                            // Check if we should ask to colorize this repo if no rules match
                            await checkAndAskToColorizeRepo();
                        }
                    }
                } catch (error) {
                    outputChannel.appendLine('Error checking for git remotes: ' + error);
                }
            }, 3000);
        }
    } else {
        outputChannel.appendLine('No git repository found for workspace.');

        // For non-git workspaces, set workspace info with folder path
        if (configProvider && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
            outputChannel.appendLine('Workspace folder: ' + workspaceFolder);
            outputChannel.appendLine('[Extension] Calling setWorkspaceInfo for LOCAL FOLDER:');
            outputChannel.appendLine('  Path: ' + workspaceFolder);
            outputChannel.appendLine('  Branch: (empty)');
            outputChannel.appendLine('  isGitRepo: false (explicit)');
            configProvider.setWorkspaceInfo(workspaceFolder, '', false); // false = not a git repo

            // Apply colors if there's a matching local folder rule
            doit('initial activation - local folder');
        }

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
            // Open the configuration webview (preview mode will show toast with add button)
            configProvider.show(vscode.Uri.file(''));
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

/**
 * Extracts a user-friendly repo name from a git URL.
 *
 * Note: This is a wrapper around the extracted repoUrlParser module.
 */
function extractRepoNameFromUrl(url: string): string {
    return extractRepoNameFromUrlCore(url);
}

/**
 * Gets repository configuration list from settings.
 * This is a wrapper around the extracted ruleParser module.
 */
function getRepoConfigList(validate: boolean = false): Array<RepoConfig> | undefined {
    const configProvider: RuleConfigProvider = {
        getRepoConfigurationList: () => getObjectSetting('repoRules'),
        getBranchConfigurationList: () => getObjectSetting('branchConfigurationList'),
        getAdvancedProfiles: () =>
            (workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as { [key: string]: any }) || {},
    };

    const validationContext: ValidationContext = {
        isActive: vscode.window.state.active,
    };

    const logger: RuleParserLogger = {
        log: (message: string) => outputChannel.appendLine(message),
    };

    const result = parseRepoRules(configProvider, validate, validationContext, logger);

    // Update module-level error map
    repoRuleErrors = result.errors;

    return result.rules.length > 0 ? result.rules : undefined;
}

/**
 * Gets branch configuration rules from settings.
 * This is a wrapper around the extracted ruleParser module.
 */
function getBranchData(validate: boolean = false): Map<string, string | ThemedColor> {
    const configProvider: RuleConfigProvider = {
        getRepoConfigurationList: () => getObjectSetting('repoRules'),
        getBranchConfigurationList: () => getObjectSetting('branchConfigurationList'),
        getAdvancedProfiles: () =>
            workspace.getConfiguration('windowColors').get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {}),
    };

    const logger: RuleParserLogger = {
        log: (message: string) => outputChannel.appendLine(message),
    };

    const result = parseBranchRules(configProvider, validate, logger);

    // Update module-level error map
    branchRuleErrors = result.errors;

    return result.rules;
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

/**
 * Finds the first matching repository rule for the current context.
 * This is a wrapper around the extracted ruleMatching module.
 */
async function getMatchingRepoRule(repoConfigList: Array<RepoConfig> | undefined): Promise<RepoConfig | undefined> {
    // Get current workspace folder path for local folder matching
    let workspaceFolderPath = '';
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        workspaceFolderPath = workspace.workspaceFolders[0].uri.fsPath;
    }

    const context: WorkspaceContext = {
        repoUrl: gitRepoRemoteFetchUrl,
        workspaceFolder: workspaceFolderPath,
        currentBranch: currentBranch,
    };

    return findMatchingRepoRule(repoConfigList, context);
}

function undoColors() {
    outputChannel.appendLine('Removing managed color for this workspace.');
    const currentSettings = workspace.getConfiguration('workbench').get('colorCustomizations') as
        | Record<string, string>
        | undefined;
    const cleanedSettings = removeAllManagedColors(currentSettings);
    workspace.getConfiguration('workbench').update('colorCustomizations', cleanedSettings, false);
}

// ========== Branch Table Management Functions ==========

/**
 * Get usage count for a branch table (number of repo rules using it)
 */
function getBranchTableUsageCount(tableName: string): number {
    const config = workspace.getConfiguration('windowColors');
    const repoRules = config.get<any[]>('repoRules', []);

    let count = 0;
    for (const rule of repoRules) {
        if (rule.branchTableName === tableName) {
            count++;
        }
    }
    return count;
}

/**
 * Create a new branch table with the given name
 * Returns true if created successfully, false if name already exists
 */
async function createBranchTable(tableName: string): Promise<boolean> {
    const config = workspace.getConfiguration('windowColors');
    const sharedBranchTables = config.get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

    if (sharedBranchTables[tableName]) {
        outputChannel.appendLine(`Cannot create table "${tableName}" - already exists`);
        return false;
    }

    sharedBranchTables[tableName] = {
        rules: [],
    };

    await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);
    outputChannel.appendLine(`Created new branch table: "${tableName}"`);
    return true;
}

/**
 * Delete a branch table and migrate all repo rules using it to Global
 * Returns true if deleted successfully, false if table is fixed or doesn't exist
 */
async function deleteBranchTable(tableName: string): Promise<boolean> {
    const config = workspace.getConfiguration('windowColors');
    const sharedBranchTables = config.get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

    if (!sharedBranchTables[tableName]) {
        outputChannel.appendLine(`Cannot delete table "${tableName}" - does not exist`);
        return false;
    }

    // Migrate all repo rules using this table to Default Rules
    const repoRules = config.get<any[]>('repoRules', []);
    let migratedCount = 0;

    for (const rule of repoRules) {
        if (rule.branchTableName === tableName) {
            rule.branchTableName = 'Default Rules';
            migratedCount++;
        }
    }

    if (migratedCount > 0) {
        await config.update('repoRules', repoRules, vscode.ConfigurationTarget.Global);
        outputChannel.appendLine(`Migrated ${migratedCount} repo rules from "${tableName}" to "Default Rules"`);
    }

    // Create a deep copy to ensure VS Code detects the change
    const updatedTables = JSON.parse(JSON.stringify(sharedBranchTables));
    delete updatedTables[tableName];
    await config.update('sharedBranchTables', updatedTables, vscode.ConfigurationTarget.Global);
    outputChannel.appendLine(`Deleted branch table: "${tableName}"`);

    return true;
}

/**
 * Rename a branch table and update all repo rules using it
 * Returns true if renamed successfully, false if table is fixed, doesn't exist, or newName already exists
 */
async function renameBranchTable(oldName: string, newName: string): Promise<boolean> {
    const config = workspace.getConfiguration('windowColors');
    const sharedBranchTables = config.get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

    if (!sharedBranchTables[oldName]) {
        outputChannel.appendLine(`Cannot rename table "${oldName}" - does not exist`);
        return false;
    }

    if (sharedBranchTables[newName]) {
        outputChannel.appendLine(`Cannot rename table to "${newName}" - name already exists`);
        return false;
    }

    // Update all repo rules using this table
    const repoRules = config.get<any[]>('repoRules', []);
    let updatedCount = 0;

    for (const rule of repoRules) {
        if (rule.branchTableName === oldName) {
            rule.branchTableName = newName;
            updatedCount++;
        }
    }

    // Rename the table - create deep copy to ensure VS Code detects the change
    const updatedTables = JSON.parse(JSON.stringify(sharedBranchTables));
    updatedTables[newName] = updatedTables[oldName];
    delete updatedTables[oldName];

    await config.update('sharedBranchTables', updatedTables, vscode.ConfigurationTarget.Global);

    if (updatedCount > 0) {
        await config.update('repoRules', repoRules, vscode.ConfigurationTarget.Global);
    }

    outputChannel.appendLine(
        `Renamed branch table from "${oldName}" to "${newName}" (${updatedCount} repo rules updated)`,
    );
    return true;
}

/**
 * Find the best branch table for a new repo rule
 * Returns the table name of a selected repo rule if one exists, otherwise returns 'Default Rules'
 */
// Helper function for finding the best table to use for a new repo rule
// Currently unused but kept for future feature enhancement
/*
function findBestTableForNewRepoRule(selectedRepoRuleIndex: number | undefined): string {
    if (selectedRepoRuleIndex === undefined || selectedRepoRuleIndex < 0) {
        return 'Default Rules';
    }
    
    const config = workspace.getConfiguration('windowColors');
    const repoRules = config.get<any[]>('repoRules', []);
    
    if (selectedRepoRuleIndex < repoRules.length) {
        const selectedRule = repoRules[selectedRepoRuleIndex];
        return selectedRule.branchTableName || 'Default Rules';
    }
    
    return 'Default Rules';
}
*/

// ========== End Branch Table Management Functions ==========

async function doit(reason: string, usePreviewMode: boolean = false) {
    if (intervalId) {
        stopBranchPoll();
    }
    outputChannel.appendLine('\nColorizer triggered by ' + reason);
    outputChannel.appendLine('  Preview mode enabled: ' + usePreviewMode);

    const repoConfigList = getRepoConfigList(true);
    if (repoConfigList === undefined) {
        outputChannel.appendLine('  No repo settings found.  Using branch mode only.');
    } else {
        outputChannel.appendLine(`  Loaded ${repoConfigList.length} repo rules`);
        if (repoConfigList.length > 0) {
            outputChannel.appendLine(`  First rule: ${JSON.stringify(repoConfigList[0])}`);
        }
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
    let matchedRepoConfig: RepoConfig | undefined = undefined;

    // Determine which repo rule to use based on preview mode parameter
    let repoRuleIndex: number | undefined = undefined;

    if (usePreviewMode) {
        // Use selected index from config provider
        const selectedIndex = configProvider?.getPreviewRepoRuleIndex();
        outputChannel.appendLine('  Selected repo rule index: ' + selectedIndex);
        if (selectedIndex !== null && selectedIndex !== undefined) {
            repoRuleIndex = selectedIndex;
            outputChannel.appendLine('  [PREVIEW MODE] Using selected rule at index ' + repoRuleIndex);
        }
    } else {
        // Use matching index - find the rule that matches the current repo or local folder
        if (repoConfigList !== undefined) {
            // Get current workspace folder path for local folder matching
            let workspaceFolderPath = '';
            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                workspaceFolderPath = workspace.workspaceFolders[0].uri.fsPath;
            }

            outputChannel.appendLine(`  Matching against URL: ${gitRepoRemoteFetchUrl}`);

            let ruleIndex = 0;
            for (const item of repoConfigList) {
                // Skip disabled rules
                if (item.enabled === false) {
                    ruleIndex++;
                    continue;
                }

                // Check if this is a local folder pattern (starts with !)
                let isMatch = false;
                if (item.repoQualifier.startsWith('!')) {
                    if (workspaceFolderPath && matchesLocalFolderPattern(workspaceFolderPath, item.repoQualifier)) {
                        isMatch = true;
                    }
                } else {
                    // Standard git repo matching
                    if (gitRepoRemoteFetchUrl && gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    repoRuleIndex = ruleIndex;
                    outputChannel.appendLine('  Repo rule matched at index ' + repoRuleIndex);
                    break;
                }
                ruleIndex++;
            }
        }
    }

    // Apply the repo rule if we have an index
    if (repoRuleIndex !== undefined && repoConfigList && repoConfigList[repoRuleIndex]) {
        matchedRepoConfig = repoConfigList[repoRuleIndex];
        outputChannel.appendLine('  Rule: "' + matchedRepoConfig.repoQualifier + '"');

        // Check if this rule explicitly excludes from coloring
        if (matchedRepoConfig.primaryColor === 'none') {
            outputChannel.appendLine('  Rule specifies "none" - excluding from coloring');
            undoColors();
            return;
        }

        // Check if this rule has an error (only show for non-preview mode)
        if (!usePreviewMode && repoRuleErrors.has(repoRuleIndex)) {
            const errorMsg = repoRuleErrors.get(repoRuleIndex);
            outputChannel.appendLine(`  ERROR: Matched repo rule has validation error: ${errorMsg}`);
            vscode.window.showErrorMessage(
                `Git Repo Window Colors: The matched repository rule has an error: ${errorMsg}`,
            );
        }

        // Get advanced profiles for profile name extraction
        const advancedProfiles = workspace
            .getConfiguration('windowColors')
            .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});

        // Check if using a profile or simple color
        if (matchedRepoConfig.profileName && advancedProfiles[matchedRepoConfig.profileName]) {
            // Valid profile name found
            outputChannel.appendLine('  Using profile: ' + matchedRepoConfig.profileName);
            matchedRepoConfig.profile = advancedProfiles[matchedRepoConfig.profileName];
            matchedRepoConfig.isSimpleMode = false;
        } else if (matchedRepoConfig.profileName && !advancedProfiles[matchedRepoConfig.profileName]) {
            // Invalid profile name - log error but continue to check primaryColor
            outputChannel.appendLine('  WARNING: Profile not found: ' + matchedRepoConfig.profileName);
            // Fall through to check primaryColor
        }

        // If no valid profile was set, use primaryColor as a themed color
        if (!matchedRepoConfig.profile && matchedRepoConfig.primaryColor && matchedRepoConfig.primaryColor !== 'none') {
            // It's a themed color - create temporary repo profile
            try {
                const theme = window.activeColorTheme.kind;
                const themeKind = getThemeKind(theme);
                const themedColor = matchedRepoConfig.primaryColor as unknown as ThemedColor;
                const colorValue = resolveThemedColor(themedColor, themeKind);
                if (!colorValue) {
                    throw new Error('No color value resolved for theme');
                }
                repoColor = Color(colorValue);
                outputChannel.appendLine('  Using simple color: ' + repoColor.hex());

                matchedRepoConfig.profile = createRepoTempProfile(repoColor);
                matchedRepoConfig.isSimpleMode = true;
            } catch (e) {
                outputChannel.appendLine('  Error parsing color: ' + e);
            }
        }
    } else if (!usePreviewMode) {
        outputChannel.appendLine('  No repo rule matched');
    }

    // Handle branch rules - determine which branch rule to use based on preview mode
    let branchMatch = false;

    if (usePreviewMode) {
        // Use selected branch rule from config provider
        const selectedBranchContext = configProvider?.getPreviewBranchRuleContext();

        if (selectedBranchContext !== null && selectedBranchContext !== undefined) {
            // Check if this is a profile-only preview (index === -1, tableName is profile name)
            const repoIndex = configProvider?.getPreviewRepoRuleIndex();
            if (repoIndex === -1 && selectedBranchContext.index === -1) {
                // This is a profile preview - apply the profile directly
                const profileName = selectedBranchContext.tableName;
                outputChannel.appendLine('  [PROFILE PREVIEW MODE] Using profile: ' + profileName);

                const advancedProfiles = workspace
                    .getConfiguration('windowColors')
                    .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});

                if (advancedProfiles[profileName]) {
                    if (!matchedRepoConfig) {
                        matchedRepoConfig = {
                            repoQualifier: '',
                            primaryColor: 'none',
                        };
                    }
                    matchedRepoConfig.profile = advancedProfiles[profileName];
                    outputChannel.appendLine('  [PROFILE PREVIEW MODE] Applied profile: ' + profileName);
                } else {
                    outputChannel.appendLine('  [PROFILE PREVIEW MODE] ERROR: Profile not found: ' + profileName);
                }
            } else {
                outputChannel.appendLine(
                    '  [PREVIEW MODE] Using selected branch rule at index ' + selectedBranchContext.index,
                );

                const sharedBranchTables = workspace
                    .getConfiguration('windowColors')
                    .get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

                const tableName = selectedBranchContext.tableName;
                outputChannel.appendLine(`  [PREVIEW MODE] Using branch table: "${tableName}"`);

                const branchTable = sharedBranchTables[tableName];
                let selectedRule: BranchRule | undefined;

                if (branchTable && branchTable.rules && branchTable.rules[selectedBranchContext.index]) {
                    selectedRule = branchTable.rules[selectedBranchContext.index];
                }

                if (selectedRule) {
                    outputChannel.appendLine('  [PREVIEW MODE] Branch rule: "' + selectedRule.pattern + '"');
                    outputChannel.appendLine('  [PREVIEW MODE] Branch rule color type: ' + typeof selectedRule.color);
                    outputChannel.appendLine(
                        '  [PREVIEW MODE] Branch rule color value: ' + JSON.stringify(selectedRule.color),
                    );

                    // Check if this is a profile name
                    const advancedProfiles = workspace
                        .getConfiguration('windowColors')
                        .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});

                    // Check if rule has a profile name
                    if (selectedRule.profileName && advancedProfiles[selectedRule.profileName]) {
                        // It's a profile - store it
                        outputChannel.appendLine('  [PREVIEW MODE] Using Branch Profile: ' + selectedRule.profileName);
                        if (!matchedRepoConfig) {
                            matchedRepoConfig = {
                                repoQualifier: '',
                                primaryColor: 'none',
                            };
                        }
                        matchedRepoConfig.branchProfile = advancedProfiles[selectedRule.profileName];
                    } else if (selectedRule.color === 'none') {
                        // Special 'none' value - skip branch coloring
                        outputChannel.appendLine(
                            '  [PREVIEW MODE] Branch rule specifies "none" - skipping branch color',
                        );
                        // Don't set branchProfile or branchColor
                    } else {
                        // It's a themed color - create temporary branch profile
                        const theme = window.activeColorTheme.kind;
                        const themeKind = getThemeKind(theme);
                        const themedColor = selectedRule.color as ThemedColor;
                        const colorValue = resolveThemedColor(themedColor, themeKind);
                        if (!colorValue) {
                            outputChannel.appendLine('  [PREVIEW MODE] ERROR: Could not resolve themed color');
                            throw new Error('No color value resolved for theme');
                        }
                        branchColor = Color(colorValue);
                        outputChannel.appendLine('  [PREVIEW MODE] Using simple branch color: ' + branchColor.hex());

                        if (!matchedRepoConfig) {
                            matchedRepoConfig = {
                                repoQualifier: '',
                                primaryColor: 'none',
                            };
                        }
                        matchedRepoConfig.branchProfile = createBranchTempProfile(branchColor);
                    }
                    branchMatch = true;
                }
            }
        }
    } else {
        // Use matching branch rules - lookup from shared branch tables
        // Only check branch rules if we have a matched repo rule
        if (!matchedRepoConfig) {
            outputChannel.appendLine('  No repo rule matched - skipping branch rules');
        } else if (matchedRepoConfig.branchTableName === '__none__') {
            outputChannel.appendLine('  No branch table specified for this repository - skipping branch rules');
        } else {
            // Get shared branch tables
            const sharedBranchTables = workspace
                .getConfiguration('windowColors')
                .get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

            // Determine which table to use
            let tableName = 'Default Rules'; // Default
            if (matchedRepoConfig && matchedRepoConfig.branchTableName) {
                tableName = matchedRepoConfig.branchTableName;
            }

            const branchTable = sharedBranchTables[tableName];
            if (branchTable && branchTable.rules && branchTable.rules.length > 0) {
                outputChannel.appendLine(
                    `  Checking branch rules from table "${tableName}" (${branchTable.rules.length} rules)`,
                );

                for (const rule of branchTable.rules) {
                    // Skip disabled rules
                    if (rule.enabled === false) {
                        continue;
                    }

                    if (rule.pattern === '') {
                        continue;
                    }

                    if (currentBranch?.match(rule.pattern)) {
                        // Log the matched rule for debugging
                        outputChannel.appendLine(
                            `  Matched branch rule: pattern="${rule.pattern}", color="${JSON.stringify(rule.color)}", profileName="${rule.profileName || 'not set'}"`,
                        );

                        // Check if this rule specifies a profile name
                        const advancedProfiles = workspace
                            .getConfiguration('windowColors')
                            .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});

                        if (rule.profileName && advancedProfiles[rule.profileName]) {
                            // It's a profile - store it
                            outputChannel.appendLine(
                                `  Branch rule matched in "${tableName}": "${rule.pattern}" using Profile: ${rule.profileName}`,
                            );
                            if (!matchedRepoConfig) {
                                matchedRepoConfig = {
                                    repoQualifier: '',
                                    primaryColor: 'none',
                                };
                            }
                            matchedRepoConfig.branchProfile = advancedProfiles[rule.profileName];
                        } else if (rule.color === 'none') {
                            // Special 'none' value - skip branch coloring
                            outputChannel.appendLine(
                                `  Branch rule matched in "${tableName}": "${rule.pattern}" specifies "none" - skipping branch color`,
                            );
                            // Don't set branchProfile or branchColor, but still count as a match
                        } else {
                            // It's a simple color - create temporary branch profile
                            const theme = window.activeColorTheme.kind;
                            const themeKind = getThemeKind(theme);
                            const colorValue = resolveThemedColor(rule.color, themeKind);
                            if (!colorValue) {
                                throw new Error('No color value resolved for theme');
                            }
                            branchColor = Color(colorValue);
                            outputChannel.appendLine(
                                `  Branch rule matched in "${tableName}": "${rule.pattern}" with simple color: ${branchColor.hex()}`,
                            );

                            if (!matchedRepoConfig) {
                                matchedRepoConfig = {
                                    repoQualifier: '',
                                    primaryColor: 'none',
                                };
                            }
                            matchedRepoConfig.branchProfile = createBranchTempProfile(branchColor);
                        }
                        branchMatch = true;
                        break;
                    }
                }
            }
        }
    }

    if (!branchMatch) {
        if (repoColor === undefined && (!matchedRepoConfig || !matchedRepoConfig.profile)) {
            outputChannel.appendLine('  No branch rule matched');
        } else {
            outputChannel.appendLine('  No branch rule matched, using repo color for branch color');
            branchColor = repoColor;

            // In simple mode, create a default branch profile for activity bar coloring
            if (matchedRepoConfig && matchedRepoConfig.isSimpleMode && branchColor) {
                outputChannel.appendLine('  Creating default branch profile for activity bar in simple mode');
                matchedRepoConfig.branchProfile = createBranchTempProfile(branchColor);
            }
        }
    }

    // Debug output
    outputChannel.appendLine(`  Debug: matchedRepoConfig exists: ${!!matchedRepoConfig}`);
    if (matchedRepoConfig) {
        outputChannel.appendLine(`  Debug: isSimpleMode: ${matchedRepoConfig.isSimpleMode}`);
        outputChannel.appendLine(`  Debug: repoColor: ${repoColor?.hex()}, branchColor: ${branchColor?.hex()}`);
        outputChannel.appendLine(
            `  Debug: existing profile: ${!!matchedRepoConfig.profile}, existing branchProfile: ${!!matchedRepoConfig.branchProfile}`,
        );
    }

    // Check if we have any configuration to apply
    if (!matchedRepoConfig || (!matchedRepoConfig.profile && !matchedRepoConfig.branchProfile)) {
        // No color specified, so do nothing
        outputChannel.appendLine('  No color configuration data specified for this repo or branch.');
        if (getBooleanSetting('removeManagedColors')) {
            undoColors();
        }
        return;
    }

    let newColors: any = {};

    // Get current theme for color resolution
    const theme = window.activeColorTheme.kind;
    const themeKind = getThemeKind(theme);

    // Unified profile resolution: apply repo profile, then merge branch profile overrides
    if (matchedRepoConfig.profile) {
        if (matchedRepoConfig.isSimpleMode) {
            outputChannel.appendLine(
                `  Applying simple color mode (repo: ${repoColor?.hex()}, branch: ${branchColor?.hex()})`,
            );
        } else {
            const advancedProfiles = workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as {
                [key: string]: AdvancedProfile;
            };
            const profileName =
                matchedRepoConfig.profileName ||
                Object.entries(advancedProfiles).find(([_, prof]) => prof === matchedRepoConfig.profile)?.[0];
            outputChannel.appendLine(`  Applying repo profile "${profileName || 'unknown'}"`);
        }

        newColors = resolveProfile(
            matchedRepoConfig.profile,
            repoColor || Color('#000000'),
            branchColor || Color('#000000'),
            themeKind,
        );
        outputChannel.appendLine(`  Applied ${Object.keys(newColors).length} color mappings from repo profile`);
    }

    if (matchedRepoConfig.branchProfile) {
        const advancedProfiles = workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as {
            [key: string]: AdvancedProfile;
        };
        const profileName = Object.entries(advancedProfiles).find(
            ([_, prof]) => prof === matchedRepoConfig.branchProfile,
        )?.[0];
        if (profileName) {
            outputChannel.appendLine(`  Applying branch profile "${profileName}" (overrides repo colors)`);
        } else {
            outputChannel.appendLine(`  Applying simple branch color overrides: ${branchColor?.hex()}`);
        }

        const branchColors = resolveProfile(
            matchedRepoConfig.branchProfile,
            repoColor || Color('#000000'),
            branchColor || Color('#000000'),
            themeKind,
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

    // Show applied colors in debug output
    if (matchedRepoConfig.profile || matchedRepoConfig.branchProfile) {
        Object.entries(newColors).forEach(([key, value]) => {
            if (value !== undefined) {
                outputChannel.appendLine(`    ${key} = ${value}`);
            }
        });
    }

    // Show final result message
    if (matchedRepoConfig.isSimpleMode && !matchedRepoConfig.branchProfile) {
        if (repoColor && branchColor && repoColor.hex() === branchColor.hex()) {
            outputChannel.appendLine(`  Applying color for this repo: ${repoColor.hex()}`);
        } else if (repoColor && branchColor) {
            outputChannel.appendLine(
                `  Applying colors for this repo: repo ${repoColor.hex()}, branch ${branchColor.hex()}`,
            );
        }
    }

    // Apply colors using settingsApplicator module
    const logger: SettingsApplicatorLogger = {
        appendLine: (message: string) => outputChannel.appendLine(message),
    };

    const result = applyColors(cc, newColors, logger);
    workspace.getConfiguration('workbench').update('colorCustomizations', result.finalColors, false);

    outputChannel.appendLine('\nLoving this extension? https://www.buymeacoffee.com/KevinMills');
    outputChannel.appendLine(
        'If you have any issues or suggestions, please file them at\n  https://github.com/mgfarmer/git-repo-window-colors/issues',
    );

    // Only start branch polling if we have a git repository
    if (gitRepository) {
        startBranchPoll();
    }
    updateStatusBarItem(); // Update status bar after applying colors
}

// Get the git repository for the current workspace
// This is a wrapper around the extracted gitOperations module
function getWorkspaceRepo(): GitRepository | null {
    const workspaceInfo: WorkspaceInfo = {
        activeEditorUri: vscode.window.activeTextEditor?.document.uri,
        workspaceFolders: workspace.workspaceFolders ? [...workspace.workspaceFolders] : undefined,
        getWorkspaceFolder: (uri) => vscode.workspace.getWorkspaceFolder(uri),
    };
    return getWorkspaceRepository(gitApi, workspaceInfo);
}

// Get the current git branch name
// This is a wrapper around the extracted gitOperations module
function getCurrentGitBranch(): string | undefined {
    const logger: GitOperationsLogger = {
        warn: (message: string) => console.warn(message),
    };
    return getCurrentBranch(gitRepository, logger);
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

// Unused - kept for reference in case needed in future
// const getColorWithLuminosity = (color: Color, min: number, max: number): Color => {
//     let c: Color = Color(color.hex());
//     let iter = 0;
//     while (c.luminosity() > max && iter < 10000) {
//         c = c.darken(0.01);
//         iter++;
//     }
//     iter = 0;
//     while (c.luminosity() < min && iter < 10000) {
//         c = c.lighten(0.01);
//         iter++;
//     }
//     return c;
// };

// Export configuration to JSON file
async function exportConfiguration(): Promise<void> {
    try {
        // Get current configuration
        const config = workspace.getConfiguration('windowColors');
        const exportData = {
            repoRules: config.get('repoRules'),
            repoConfigurationList: config.get('repoConfigurationList'), // For backward compatibility
            branchConfigurationList: config.get('branchConfigurationList'),
            sharedBranchTables: config.get('sharedBranchTables'),
            removeManagedColors: config.get('removeManagedColors'),
            colorInactiveTitlebar: config.get('colorInactiveTitlebar'),
            colorEditorTabs: config.get('colorEditorTabs'),
            colorStatusBar: config.get('colorStatusBar'),
            activityBarColorKnob: config.get('activityBarColorKnob'),
            applyBranchColorToTabsAndStatusBar: config.get('applyBranchColorToTabsAndStatusBar'),
            showStatusIconWhenNoRuleMatches: config.get('showStatusIconWhenNoRuleMatches'),
            askToColorizeRepoWhenOpened: config.get('askToColorizeRepoWhenOpened'),
            advancedProfiles: config.get('advancedProfiles'),
            exportedAt: new Date().toISOString(),
            version: '1.5.21',
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
        if (!importData.repoRules && !importData.repoConfigurationList && !importData.branchConfigurationList) {
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
        const configUpdates: Promise<void>[] = [];

        if (action === 'Import and Replace') {
            // Replace all configuration
            // Prefer repoRules over repoConfig urationList for imports
            if (importData.repoRules !== undefined) {
                configUpdates.push(
                    Promise.resolve(
                        config.update('repoRules', importData.repoRules, vscode.ConfigurationTarget.Global),
                    ),
                );
            } else if (importData.repoConfigurationList !== undefined) {
                // Handle old exports - convert to repoRules if they're JSON objects
                const repoList = importData.repoConfigurationList;
                const hasJsonObjects = repoList.some((item: any) => typeof item === 'object');
                if (hasJsonObjects) {
                    configUpdates.push(
                        Promise.resolve(
                            config.update(
                                'repoRules',
                                repoList.filter((item: any) => typeof item === 'object'),
                                vscode.ConfigurationTarget.Global,
                            ),
                        ),
                    );
                }
                // Keep strings in repoConfigurationList for migration
                const strings = repoList.filter((item: any) => typeof item === 'string');
                if (strings.length > 0) {
                    configUpdates.push(
                        Promise.resolve(
                            config.update('repoConfigurationList', strings, vscode.ConfigurationTarget.Global),
                        ),
                    );
                }
            }
            if (importData.sharedBranchTables !== undefined) {
                configUpdates.push(
                    Promise.resolve(
                        config.update(
                            'sharedBranchTables',
                            importData.sharedBranchTables,
                            vscode.ConfigurationTarget.Global,
                        ),
                    ),
                );
            }
            if (importData.branchConfigurationList !== undefined) {
                configUpdates.push(
                    Promise.resolve(
                        config.update(
                            'branchConfigurationList',
                            importData.branchConfigurationList,
                            vscode.ConfigurationTarget.Global,
                        ),
                    ),
                );
            }
        } else if (action === 'Merge with Current') {
            // Merge configurations
            const currentRepoList = config.get<any[]>('repoRules') || [];
            const currentBranchList = config.get<string[]>('branchConfigurationList') || [];

            const importRepoList = importData.repoRules || importData.repoConfigurationList || [];
            const importBranchList = importData.branchConfigurationList || [];

            // Merge repo configurations (avoid duplicates based on repo qualifier)
            const mergedRepoList = [...currentRepoList];
            for (const importItem of importRepoList) {
                if (typeof importItem === 'string') continue; // Skip strings - they should be migrated
                const repoQualifier = importItem.repoQualifier;
                const existingIndex = mergedRepoList.findIndex((item: any) => item.repoQualifier === repoQualifier);
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
                Promise.resolve(config.update('repoRules', mergedRepoList, vscode.ConfigurationTarget.Global)),
            );
            configUpdates.push(
                Promise.resolve(
                    config.update('branchConfigurationList', mergedBranchList, vscode.ConfigurationTarget.Global),
                ),
            );
        }

        // Apply other settings (always replace, not merge)
        // Helper to coerce boolean values (handle string "true"/"false")
        const toBool = (value: any): boolean => {
            if (typeof value === 'string') {
                return value === 'true';
            }
            return Boolean(value);
        };

        // Helper to coerce number values
        const toNum = (value: any): number => {
            if (typeof value === 'string') {
                return parseInt(value, 10);
            }
            return Number(value);
        };

        if (importData.removeManagedColors !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'removeManagedColors',
                        toBool(importData.removeManagedColors),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.colorInactiveTitlebar !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'colorInactiveTitlebar',
                        toBool(importData.colorInactiveTitlebar),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.colorEditorTabs !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'colorEditorTabs',
                        toBool(importData.colorEditorTabs),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.colorStatusBar !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'colorStatusBar',
                        toBool(importData.colorStatusBar),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.activityBarColorKnob !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'activityBarColorKnob',
                        toNum(importData.activityBarColorKnob),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.applyBranchColorToTabsAndStatusBar !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'applyBranchColorToTabsAndStatusBar',
                        toBool(importData.applyBranchColorToTabsAndStatusBar),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.showStatusIconWhenNoRuleMatches !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'showStatusIconWhenNoRuleMatches',
                        toBool(importData.showStatusIconWhenNoRuleMatches),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.askToColorizeRepoWhenOpened !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update(
                        'askToColorizeRepoWhenOpened',
                        toBool(importData.askToColorizeRepoWhenOpened),
                        vscode.ConfigurationTarget.Global,
                    ),
                ),
            );
        }
        if (importData.advancedProfiles !== undefined) {
            configUpdates.push(
                Promise.resolve(
                    config.update('advancedProfiles', importData.advancedProfiles, vscode.ConfigurationTarget.Global),
                ),
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
