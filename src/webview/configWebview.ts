import * as vscode from 'vscode';
import { AdvancedProfile } from '../types/advancedModeTypes';
import { RepoRule, BranchRule, OtherSettings, WebviewMessage } from '../types/webviewTypes';
import { generatePalette, PaletteAlgorithm } from '../paletteGenerator';
import {
    getRepoRuleErrors,
    getBranchRuleErrors,
    validateRules,
    simplifyPath,
    validateLocalFolderPath,
    expandEnvVars,
} from '../extension';
//import { outputChannel } from '../extension';

// Build-time configuration for color picker type
// Set to false to use VS Code's input dialog, true to use native HTML color picker
const USE_NATIVE_COLOR_PICKER = true;

// Development mode configuration
// Set to true to show the Run Tests button for debugging/development
const DEVELOPMENT_MODE = false;

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class ConfigWebviewProvider implements vscode.Disposable {
    private _panel: vscode.WebviewPanel | undefined;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _workspaceInfo: { repositoryUrl: string; currentBranch: string; isGitRepo?: boolean } = {
        repositoryUrl: '',
        currentBranch: '',
        isGitRepo: true,
    };
    private currentConfig: any = null;
    private _configurationListener: vscode.Disposable | undefined;
    private _previewRepoRuleIndex: number | null = null;
    private _previewBranchRuleContext: { index: number; tableName: string } | null = null;
    private _previewModeEnabled: boolean = false;

    constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;

        // Set up configuration listener once
        this._configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('windowColors')) {
                this._sendConfigurationToWebview();
            }
        });
        this._disposables.push(this._configurationListener);
    }

    public setWorkspaceInfo(repositoryUrl: string, currentBranch: string, isGitRepo: boolean = true): void {
        this._workspaceInfo = { repositoryUrl, currentBranch, isGitRepo };
        // Refresh the webview if it's open
        if (this._panel) {
            this._sendConfigurationToWebview();
        }
    }

    public getPreviewRepoRuleIndex(): number | null {
        return this._previewRepoRuleIndex;
    }

    public getPreviewBranchRuleContext(): { index: number; tableName: string } | null {
        return this._previewBranchRuleContext;
    }

    public isPreviewModeEnabled(): boolean {
        return this._previewModeEnabled;
    }

    private async _waitForColorCustomizationsUpdate(): Promise<void> {
        return new Promise<void>((resolve) => {
            const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('workbench.colorCustomizations')) {
                    disposable.dispose();
                    resolve();
                }
            });
            // Timeout after 1 second in case the event doesn't fire
            setTimeout(() => {
                disposable.dispose();
                resolve();
            }, 1000);
        });
    }

    public showAndAddRepoRule(extensionUri: vscode.Uri, repoQualifier: string, primaryColor: string = ''): void {
        // First, show the webview
        this.show(extensionUri);

        // Send a message to the webview to add a new repo rule
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'addRepoRule',
                data: {
                    repoQualifier: repoQualifier,
                    primaryColor: primaryColor,
                },
            });
        }
    }

    public show(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        // Create new panel
        this._panel = vscode.window.createWebviewPanel(
            'grwcConfig', // Identifies the type of the webview
            'Git Repo Window Colors Configuration', // Title of the panel displayed to the user
            column || vscode.ViewColumn.One, // Editor column to show the new webview panel in
            {
                // Enable javascript in the webview
                enableScripts: true,
                // And restrict the webview to only loading content from our extension's directory
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
                    vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
                ],
                // Persist the webview state when hidden
                retainContextWhenHidden: true,
            },
        );

        // Set the HTML content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => await this._handleMessage(message),
            undefined,
            this._disposables,
        );

        // Handle when the panel is disposed
        this._panel.onDidDispose(() => this._onPanelDisposed(), null, this._disposables);

        // Send initial configuration to webview
        this._sendConfigurationToWebview();

        // Apply colors for the selected rule when opening the configurator
        // This ensures preview mode actually shows colors, and for matched rules
        // it's essentially a no-op reapplication
        const usePreview = this._previewModeEnabled;
        vscode.commands.executeCommand('_grwc.internal.applyColors', 'config panel opened', usePreview);

        // Check if this is the first time showing the webview
        this._checkAndShowGettingStarted();
    }

    private async _handleMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'requestConfig':
                this._sendConfigurationToWebview();
                break;
            case 'updateConfig':
                await this._updateConfiguration(message.data);
                break;
            case 'openColorPicker':
                this._openColorPicker(message.data.colorPickerData!);
                break;
            case 'confirmDelete':
                if (message.data && (message.data as any).type === 'profile') {
                    await this._handleProfileDeleteConfirmation((message.data as any).name);
                } else if (message.data && message.data.deleteData) {
                    await this._handleDeleteConfirmation(message.data.deleteData);
                }
                break;
            case 'exportConfig':
                await vscode.commands.executeCommand('windowColors.exportConfig');
                break;
            case 'importConfig':
                await vscode.commands.executeCommand('windowColors.importConfig');
                break;
            case 'updateAdvancedProfiles':
                await this._updateConfiguration({ advancedProfiles: message.data.advancedProfiles });
                break;
            case 'requestHelp':
                await this._sendHelpContent(message.data.helpType || 'getting-started');
                break;
            case 'previewRepoRule':
                this._previewRepoRuleIndex = (message.data as any).index;
                this._previewModeEnabled = (message.data as any).previewEnabled ?? true;
                // Clear branch preview if requested (avoids double doit() call)
                if ((message.data as any).clearBranchPreview) {
                    this._previewBranchRuleContext = null;
                }

                // Pass preview mode as true
                await vscode.commands.executeCommand('_grwc.internal.applyColors', 'preview mode', true);
                // Wait for colorCustomizations to update before refreshing
                await this._waitForColorCustomizationsUpdate();
                this._sendConfigurationToWebview();
                break;
            case 'previewBranchRule':
                this._previewBranchRuleContext = {
                    index: (message.data as any).index,
                    tableName: (message.data as any).tableName || 'Default Rules',
                };
                this._previewRepoRuleIndex = (message.data as any).repoIndex ?? null;
                this._previewModeEnabled = (message.data as any).previewEnabled ?? true;
                // Pass preview mode as true
                await vscode.commands.executeCommand('_grwc.internal.applyColors', 'preview mode', true);
                // Wait for colorCustomizations to update before refreshing
                await this._waitForColorCustomizationsUpdate();
                this._sendConfigurationToWebview();
                break;
            case 'clearPreview':
                this._previewModeEnabled = (message.data as any)?.previewEnabled ?? false;
                // Pass preview mode as false to use matching rules
                await vscode.commands.executeCommand('_grwc.internal.applyColors', 'cleared preview', false);
                // Wait for colorCustomizations to update before refreshing
                await this._waitForColorCustomizationsUpdate();
                this._sendConfigurationToWebview();
                break;
            case 'clearBranchPreview':
                // Clear branch preview context while keeping repo preview active
                this._previewBranchRuleContext = null;
                // Reapply colors with the current repo preview but no branch preview
                await vscode.commands.executeCommand('_grwc.internal.applyColors', 'cleared branch preview', true);
                // Wait for colorCustomizations to update before refreshing
                await this._waitForColorCustomizationsUpdate();
                this._sendConfigurationToWebview();
                break;
            case 'generatePalette':
                await this._handlePaletteGeneration(message.data.paletteData!);
                break;
            case 'toggleStarredKey':
                await this._handleToggleStarredKey(message.data.mappingKey!);
                break;
            case 'createBranchTable':
                await this._handleCreateBranchTable(message.data.tableName!, message.data.repoRuleIndex);
                break;
            case 'deleteBranchTable':
                await this._handleDeleteBranchTable(message.data.tableName!);
                break;
            case 'renameBranchTable':
                await this._handleRenameBranchTable(message.data.oldTableName!, message.data.newTableName!);
                break;
            case 'simplifyPath':
                await this._handleSimplifyPath(message.data.path!);
                break;
            case 'simplifyPathForPreview':
                await this._handleSimplifyPathForPreview(message.data.path!);
                break;
        }
    }

    public _sendConfigurationToWebview(): void {
        if (!this._panel) {
            return;
        }

        const repoRules = this._getRepoRules();
        const sharedBranchTables = this._getSharedBranchTables();
        const otherSettings = this._getOtherSettings();
        const advancedProfiles = this._getAdvancedProfiles();
        const workspaceInfo = this._getWorkspaceInfo();
        const starredKeys = this._getStarredKeys();

        // Trigger validation to populate error maps
        validateRules();

        // Get validation errors from extension
        const repoRuleErrors = getRepoRuleErrors();
        const branchRuleErrors = getBranchRuleErrors();

        // Convert error maps to plain objects for JSON serialization
        const repoRuleErrorsObj: { [index: number]: string } = {};
        repoRuleErrors.forEach((msg, index) => {
            repoRuleErrorsObj[index] = msg;
        });

        const branchRuleErrorsObj: { [index: number]: string } = {};
        branchRuleErrors.forEach((msg, index) => {
            branchRuleErrorsObj[index] = msg;
        });

        // Get currently applied color customizations
        const colorCustomizations = vscode.workspace.getConfiguration('workbench').get('colorCustomizations', {});

        // Validate local folder paths and expand environment variables for tooltips
        const localFolderPathValidation: { [index: number]: boolean | undefined } = {};
        const expandedPaths: { [index: number]: string } = {};
        repoRules.forEach((rule, index) => {
            if (rule.repoQualifier && rule.repoQualifier.startsWith('!')) {
                const validationResult = validateLocalFolderPath(rule.repoQualifier);
                // Only store validation result if it's not undefined (i.e., not a glob pattern)
                if (validationResult !== undefined) {
                    localFolderPathValidation[index] = validationResult;
                }
                // Expand the path for tooltip display (remove ! prefix first)
                const pattern = rule.repoQualifier.substring(1);
                expandedPaths[index] = expandEnvVars(pattern);
            }
        });

        // Calculate matching rule indexes using the same logic as the extension
        const matchingRepoRuleIndex = this._getMatchingRepoRuleIndex(repoRules, workspaceInfo.repositoryUrl);

        // Get the actual branch rules from the shared table assigned to the matched repo rule
        let actualBranchRules: BranchRule[] = [];
        let repoIndexForBranchRule = -1; // Always -1 since we only use shared tables

        if (matchingRepoRuleIndex >= 0 && matchingRepoRuleIndex < repoRules.length) {
            const matchedRepoRule = repoRules[matchingRepoRuleIndex];
            if (matchedRepoRule.branchTableName && sharedBranchTables[matchedRepoRule.branchTableName]) {
                actualBranchRules = sharedBranchTables[matchedRepoRule.branchTableName].rules;
            }
        }

        // Now match against the actual branch rules
        const matchingBranchRuleIndex = this._getMatchingBranchRuleIndex(
            actualBranchRules,
            workspaceInfo.currentBranch,
        );

        this.currentConfig = {
            repoRules,
            sharedBranchTables,
            otherSettings,
            advancedProfiles,
        };

        // If preview indexes are not set, initialize them to the matching indexes
        if (this._previewRepoRuleIndex === null && matchingRepoRuleIndex >= 0) {
            this._previewRepoRuleIndex = matchingRepoRuleIndex;
        }

        if (this._previewBranchRuleContext === null && matchingBranchRuleIndex >= 0) {
            // Get the table name from the matched repo rule
            let tableName = 'Default Rules';
            if (matchingRepoRuleIndex >= 0 && repoRules[matchingRepoRuleIndex]) {
                tableName = repoRules[matchingRepoRuleIndex].branchTableName || 'Default Rules';
            }

            this._previewBranchRuleContext = {
                index: matchingBranchRuleIndex,
                tableName,
            };
        }

        const msgData = {
            ...this.currentConfig,
            workspaceInfo,
            colorCustomizations,
            starredKeys,
            validationErrors: {
                repoRules: repoRuleErrorsObj,
                branchRules: branchRuleErrorsObj,
            },
            localFolderPathValidation,
            expandedPaths,
            matchingIndexes: {
                repoRule: matchingRepoRuleIndex,
                branchRule: matchingBranchRuleIndex,
                repoIndexForBranchRule,
            },
            previewRepoRuleIndex: this._previewRepoRuleIndex,
            previewBranchRuleContext: this._previewBranchRuleContext,
        };

        this._panel.webview.postMessage({
            command: 'configData',
            data: msgData,
        });
    }

    private _getRepoRules(): RepoRule[] {
        const config = vscode.workspace.getConfiguration('windowColors');
        const repoConfigList = config.get<string[]>('repoConfigurationList', []);
        const advancedProfiles = this._getAdvancedProfiles();

        const rules = repoConfigList
            .map((rule) => this._parseRepoRule(rule))
            .filter((rule) => rule !== null) as RepoRule[];

        // Migrate old configs: if primaryColor matches a profile but profileName is not set, set it
        for (const rule of rules) {
            if (rule.primaryColor && !rule.profileName && advancedProfiles[rule.primaryColor]) {
                rule.profileName = rule.primaryColor;
            }
        }

        return rules;
    }

    private _parseRepoRule(rule: string | any): RepoRule | null {
        try {
            // Handle JSON object format (new format)
            if (typeof rule === 'object' && rule !== null) {
                return {
                    repoQualifier: rule.repoQualifier || '',
                    defaultBranch: rule.defaultBranch,
                    primaryColor: rule.primaryColor || '',
                    branchColor: rule.branchColor,
                    profileName: rule.profileName,
                    enabled: rule.enabled !== undefined ? rule.enabled : true,
                    branchTableName: rule.branchTableName,
                } as any;
            }

            // Handle string formats
            if (typeof rule !== 'string') {
                return null;
            }

            const ruleString = rule;

            // Try parsing as JSON string (for backward compatibility)
            if (ruleString.trim().startsWith('{')) {
                const obj = JSON.parse(ruleString);
                return {
                    repoQualifier: obj.repoQualifier || '',
                    defaultBranch: obj.defaultBranch,
                    primaryColor: obj.primaryColor || '',
                    branchColor: obj.branchColor,
                    profileName: obj.profileName,
                    enabled: obj.enabled !== undefined ? obj.enabled : true,
                    branchTableName: obj.branchTableName,
                } as any;
            }

            // Otherwise parse legacy string format
            // Format: <repo-qualifier>[|<default-branch>]:<primary-color>[|<branch-color>]
            // Example: "myrepo|main:blue|green" or "myrepo:blue"
            const colonIndex = ruleString.indexOf(':');
            if (colonIndex === -1) {
                return null;
            }

            const repoSection = ruleString.substring(0, colonIndex).trim();
            const colorSection = ruleString.substring(colonIndex + 1).trim();

            if (!repoSection || !colorSection) {
                return null;
            }

            // Parse repo section: repo-qualifier
            const repoQualifier = repoSection.trim();

            // Parse color section: primary-color
            const primaryColor = colorSection.trim();

            return {
                repoQualifier: repoQualifier.trim(),
                primaryColor: primaryColor,
                enabled: true,
            };
        } catch (error) {
            console.warn('Failed to parse repo rule:', rule, error);
            return null;
        }
    }

    private _getOtherSettings(): OtherSettings {
        const config = vscode.workspace.getConfiguration('windowColors');

        return {
            removeManagedColors: config.get<boolean>('removeManagedColors', true),
            colorInactiveTitlebar: config.get<boolean>('colorInactiveTitlebar', true),
            colorEditorTabs: config.get<boolean>('colorEditorTabs', false),
            colorStatusBar: config.get<boolean>('colorStatusBar', false),
            applyBranchColorToTabsAndStatusBar: config.get<boolean>('applyBranchColorToTabsAndStatusBar', false),
            activityBarColorKnob: config.get<number>('activityBarColorKnob', 0),
            showStatusIconWhenNoRuleMatches: config.get<boolean>('showStatusIconWhenNoRuleMatches', true),
            askToColorizeRepoWhenOpened: config.get<boolean>('askToColorizeRepoWhenOpened', true),
            previewSelectedRepoRule: config.get<boolean>('previewSelectedRepoRule', false),
        };
    }

    private _getAdvancedProfiles(): { [key: string]: AdvancedProfile } {
        const config = vscode.workspace.getConfiguration('windowColors');
        return config.get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
    }

    private _getStarredKeys(): string[] {
        return this._context.globalState.get<string[]>('grwc.starredKeys', []);
    }

    private _getSharedBranchTables(): { [key: string]: { rules: BranchRule[] } } {
        const config = vscode.workspace.getConfiguration('windowColors');
        const sharedTables = config.get<{ [key: string]: { rules: BranchRule[] } } | undefined>('sharedBranchTables');

        // If sharedBranchTables doesn't exist, initialize with empty Default Rules table
        if (!sharedTables || Object.keys(sharedTables).length === 0) {
            return {
                'Default Rules': { rules: [] },
            };
        }

        return sharedTables;
    }

    private async _handleToggleStarredKey(mappingKey: string): Promise<void> {
        const starredKeys = this._getStarredKeys();
        const index = starredKeys.indexOf(mappingKey);

        if (index > -1) {
            // Key is already starred, unstar it
            starredKeys.splice(index, 1);
        } else {
            // Key is not starred, star it
            starredKeys.push(mappingKey);
        }

        await this._context.globalState.update('grwc.starredKeys', starredKeys);

        // Send updated starred keys back to webview
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'starredKeysUpdated',
                data: { starredKeys },
            });
        }
    }

    private async _handleCreateBranchTable(tableName: string, repoRuleIndex?: number): Promise<void> {
        console.log('[Backend] _handleCreateBranchTable called with:', tableName, 'repoRuleIndex:', repoRuleIndex);
        const result = await vscode.commands.executeCommand('_grwc.internal.createBranchTable', tableName);
        console.log('[Backend] _handleCreateBranchTable result:', result);
        if (result) {
            // If repoRuleIndex provided, update that repo rule to use the new table
            if (repoRuleIndex !== undefined) {
                console.log('[Backend] Updating repo rule', repoRuleIndex, 'to use table:', tableName);
                const config = vscode.workspace.getConfiguration('windowColors');
                const repoRules = this._getRepoRules();

                if (repoRules[repoRuleIndex]) {
                    repoRules[repoRuleIndex].branchTableName = tableName;
                    const formattedRules = repoRules.map((rule) => this._formatRepoRule(rule));
                    await config.update('repoConfigurationList', formattedRules, vscode.ConfigurationTarget.Global);
                    console.log('[Backend] Repo rule updated successfully');
                }
            }

            // Refresh webview with updated config
            console.log('[Backend] Sending updated config to webview');
            this._sendConfigurationToWebview();
        } else {
            vscode.window.showErrorMessage(`Failed to create branch table "${tableName}". Name may already exist.`);
        }
    }

    private async _handleDeleteBranchTable(tableName: string): Promise<void> {
        // Get usage count to show in confirmation
        const usageCount = (await vscode.commands.executeCommand(
            '_grwc.internal.getBranchTableUsageCount',
            tableName,
        )) as number;

        if (usageCount > 0) {
            const answer = await vscode.window.showWarningMessage(
                `Delete branch table "${tableName}"? ${usageCount} repository ${usageCount === 1 ? 'rule' : 'rules'} will be migrated to "Default Rules".`,
                { modal: true },
                'Delete',
                'Cancel',
            );

            if (answer !== 'Delete') {
                return;
            }
        }

        const result = await vscode.commands.executeCommand('_grwc.internal.deleteBranchTable', tableName);
        if (result) {
            // Refresh webview with updated config
            this._sendConfigurationToWebview();
        } else {
            vscode.window.showErrorMessage(`Failed to delete branch table "${tableName}".`);
        }
    }

    private async _handleRenameBranchTable(oldName: string, newName: string): Promise<void> {
        const result = await vscode.commands.executeCommand('_grwc.internal.renameBranchTable', oldName, newName);
        if (result) {
            // Refresh webview with updated config
            this._sendConfigurationToWebview();
        } else {
            vscode.window.showErrorMessage(
                `Failed to rename branch table from "${oldName}" to "${newName}". New name may already exist or table may be fixed.`,
            );
        }
    }

    private async _handleSimplifyPath(path: string): Promise<void> {
        const simplifiedPath = simplifyPath(path);

        // Send simplified path back to webview
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'pathSimplified',
                data: { simplifiedPath },
            });
        }
    }

    private async _handleSimplifyPathForPreview(path: string): Promise<void> {
        const simplifiedPath = simplifyPath(path);

        // Send simplified path back to webview
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'pathSimplifiedForPreview',
                data: { simplifiedPath },
            });
        }
    }

    private _getWorkspaceInfo(): { repositoryUrl: string; currentBranch: string; hasWorkspace: boolean } {
        return {
            ...this._workspaceInfo,
            hasWorkspace:
                vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0,
        };
    }

    private _getMatchingRepoRuleIndex(repoRules: RepoRule[], repositoryUrl: string): number {
        if (!repoRules || !repositoryUrl) {
            return -1;
        }

        for (let i = 0; i < repoRules.length; i++) {
            // Skip disabled rules
            if ((repoRules[i] as any).enabled === false) continue;

            const repoQualifier = repoRules[i].repoQualifier;

            // Check if this is a local folder pattern (starts with !)
            if (repoQualifier.startsWith('!')) {
                // For local folder patterns, use glob matching
                // Import minimatch dynamically
                const { minimatch } = require('minimatch');

                // Remove ! prefix and expand environment variables
                const cleanPattern = repoQualifier.substring(1);
                const expandedPattern = this._expandEnvVars(cleanPattern);

                // Normalize paths for comparison
                const normalizedUrl = this._normalizePath(repositoryUrl);
                const normalizedPattern = this._normalizePath(expandedPattern);

                // Use minimatch for glob pattern matching
                if (minimatch(normalizedUrl, normalizedPattern, { nocase: true })) {
                    return i;
                }
            } else {
                // Standard git repo matching - check if URL includes qualifier
                if (repositoryUrl.includes(repoQualifier)) {
                    return i;
                }
            }
        }

        return -1;
    }

    private _normalizePath(filePath: string): string {
        const path = require('path');
        return path.normalize(filePath).toLowerCase().replace(/\\/g, '/');
    }

    private _expandEnvVars(pattern: string): string {
        const os = require('os');
        let expanded = pattern;

        // Replace ~/ or ~\ or ~ at start (handle both Unix and Windows path separators)
        if (expanded.startsWith('~/') || expanded.startsWith('~\\') || expanded === '~') {
            expanded = expanded.replace(/^~/, os.homedir());
        }

        // List of supported environment variables
        const envVars = [
            { name: 'HOME', value: os.homedir() },
            { name: 'USERPROFILE', value: os.homedir() },
            { name: 'APPDATA', value: process.env.APPDATA || '' },
            { name: 'LOCALAPPDATA', value: process.env.LOCALAPPDATA || '' },
            { name: 'USER', value: process.env.USER || process.env.USERNAME || '' },
        ];

        // Replace $VAR or %VAR% style variables
        for (const envVar of envVars) {
            if (!envVar.value) continue;

            // Unix style: $VAR
            expanded = expanded.replace(new RegExp(`\\$${envVar.name}`, 'gi'), envVar.value);

            // Windows style: %VAR%
            expanded = expanded.replace(new RegExp(`%${envVar.name}%`, 'gi'), envVar.value);
        }

        return expanded;
    }

    private _getMatchingBranchRuleIndex(branchRules: BranchRule[], currentBranch: string): number {
        if (!branchRules || !currentBranch) {
            return -1;
        }

        for (let i = 0; i < branchRules.length; i++) {
            // Skip disabled rules
            if ((branchRules[i] as any).enabled === false) continue;

            try {
                const regex = new RegExp(branchRules[i].pattern);
                if (regex.test(currentBranch)) {
                    return i;
                }
            } catch (error) {
                // Invalid regex, skip this rule
                continue;
            }
        }

        return -1;
    }

    private async _updateConfiguration(data: any): Promise<void> {
        if (!data) {
            vscode.window.showErrorMessage('No configuration data provided');
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('windowColors');
            const updatePromises: Thenable<void>[] = [];

            // Update repository rules
            if (data.repoRules) {
                const repoRulesArray = data.repoRules.map((rule: RepoRule) => {
                    const formatted = this._formatRepoRule(rule);
                    return formatted;
                });
                updatePromises.push(config.update('repoConfigurationList', repoRulesArray, true));
            }

            // Update branch rules
            if (data.branchRules) {
                const branchRulesArray = data.branchRules.map((rule: BranchRule | any) => {
                    // Always return JSON object format
                    return {
                        pattern: rule.pattern,
                        color: rule.color,
                        enabled: rule.enabled !== undefined ? rule.enabled : true,
                    };
                });
                updatePromises.push(config.update('branchConfigurationList', branchRulesArray, true));
            }

            // Update shared branch tables
            if (data.sharedBranchTables) {
                updatePromises.push(config.update('sharedBranchTables', data.sharedBranchTables, true));
            }

            // Update advanced profiles
            if (data.advancedProfiles) {
                updatePromises.push(config.update('advancedProfiles', data.advancedProfiles, true));
            }

            // Update other settings
            if (data.otherSettings) {
                const settings = data.otherSettings as OtherSettings;
                Object.keys(settings).forEach((key) => {
                    updatePromises.push(config.update(key, settings[key as keyof OtherSettings], true));
                });
            }

            await Promise.all(updatePromises);
            console.log('[GRWC] Configuration saved, waiting 100ms for propagation...');

            // Wait a bit for VS Code to propagate the configuration changes
            // The onDidChangeConfiguration event will automatically call doit() to apply colors
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Refresh the webview to recalculate matching indexes
            this._sendConfigurationToWebview();
        } catch (error) {
            console.error('Failed to update configuration:', error);
            vscode.window.showErrorMessage('Failed to update configuration: ' + (error as Error).message);
        }
    }

    private _formatRepoRule(rule: RepoRule | any): any {
        // Always return JSON object format
        const result: any = {
            repoQualifier: rule.repoQualifier,
            primaryColor: rule.primaryColor,
            enabled: rule.enabled !== undefined ? rule.enabled : true,
        };

        // branchTableName is required - default to '__none__' if not set
        result.branchTableName = rule.branchTableName || '__none__';

        if (rule.defaultBranch) {
            result.defaultBranch = rule.defaultBranch;
        }
        if (rule.branchColor) {
            result.branchColor = rule.branchColor;
        }
        if (rule.profileName) {
            result.profileName = rule.profileName;
        }

        return result;
    }

    private async _handleDeleteConfirmation(deleteData: {
        ruleType: 'repo' | 'branch';
        index: number;
        ruleDescription: string;
        tableName?: string;
    }): Promise<void> {
        const { ruleType, index, ruleDescription } = deleteData;

        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the ${ruleType} rule ${ruleDescription}?`,
            { modal: true },
            'Delete',
        );

        if (result === 'Delete') {
            // Perform the deletion
            const repoRules = this._getRepoRules();

            if (ruleType === 'repo' && repoRules[index]) {
                repoRules.splice(index, 1);
                await this._updateConfiguration({ repoRules });

                // Recompute and apply colors after repo rule deletion
                await vscode.commands.executeCommand('_grwc.internal.applyColors', 'repo rule deleted', false);
            } else if (ruleType === 'branch') {
                // Delete from shared branch table
                const tableName = (deleteData as any).tableName;
                if (tableName && tableName !== '__none__') {
                    const sharedBranchTables = this._getSharedBranchTables();
                    if (sharedBranchTables[tableName]?.rules?.[index]) {
                        // Create a deep copy to ensure VS Code detects the change
                        const updatedTables = JSON.parse(JSON.stringify(sharedBranchTables));
                        updatedTables[tableName].rules.splice(index, 1);
                        await this._updateConfiguration({ sharedBranchTables: updatedTables });

                        // Recompute and apply colors after branch rule deletion
                        await vscode.commands.executeCommand(
                            '_grwc.internal.applyColors',
                            'branch rule deleted',
                            false,
                        );
                    }
                }
            }

            // Send confirmation back to webview
            if (this._panel) {
                this._panel.webview.postMessage({
                    command: 'deleteConfirmed',
                    data: { success: true },
                });
            }
        } else {
            // Send cancellation back to webview
            if (this._panel) {
                this._panel.webview.postMessage({
                    command: 'deleteConfirmed',
                    data: { success: false },
                });
            }
        }
    }

    private async _handleProfileDeleteConfirmation(profileName: string): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the profile "${profileName}"?`,
            { modal: true },
            'Delete',
        );

        if (result === 'Delete') {
            // Send confirmation back to webview to perform the deletion
            if (this._panel) {
                this._panel.webview.postMessage({
                    command: 'confirmDeleteProfile',
                    data: { profileName },
                });
            }
        }
    }

    private async _sendGettingStartedHelpContent(): Promise<void> {
        if (!this._panel) {
            return;
        }

        try {
            const helpFilePath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'getting-started-help.html');
            const helpContent = await vscode.workspace.fs.readFile(helpFilePath);
            let contentString = Buffer.from(helpContent).toString('utf8');

            // Extract only the body content
            const bodyMatch = contentString.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                contentString = bodyMatch[1];
            }

            this._panel.webview.postMessage({
                command: 'gettingStartedHelpContent',
                data: { content: contentString },
            });
        } catch (error) {
            console.error('Failed to load getting started help content:', error);
            vscode.window.showErrorMessage('Failed to load help content');
        }
    }

    private async _sendHelpContent(helpType: string): Promise<void> {
        if (!this._panel) {
            return;
        }

        try {
            const helpFilePath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', `${helpType}-help.html`);
            const helpContent = await vscode.workspace.fs.readFile(helpFilePath);
            let contentString = Buffer.from(helpContent).toString('utf8');

            // Extract only the body content
            const bodyMatch = contentString.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                contentString = bodyMatch[1];
            }

            this._panel.webview.postMessage({
                command: 'helpContent',
                data: { helpType, content: contentString },
            });
        } catch (error) {
            console.error(`Failed to load ${helpType} help content:`, error);
            vscode.window.showErrorMessage('Failed to load help content');
        }
    }

    private async _handlePaletteGeneration(paletteData: {
        profileName: string;
        primaryBg: string;
        algorithm: string;
    }): Promise<void> {
        if (!this._panel) {
            return;
        }

        try {
            const { profileName, primaryBg, algorithm } = paletteData;

            // Generate the palette using the palette generator
            const generatedPalette = generatePalette(primaryBg, algorithm as PaletteAlgorithm);

            // Get the current profiles
            const profiles = this._getAdvancedProfiles();
            const profile = profiles[profileName];

            if (!profile) {
                vscode.window.showErrorMessage(`Profile "${profileName}" not found`);
                return;
            }

            // Update the profile's palette with the generated colors
            profile.palette.primaryActiveBg = { source: 'fixed', value: generatedPalette.primaryActiveBg, opacity: 1 };
            profile.palette.primaryActiveFg = { source: 'fixed', value: generatedPalette.primaryActiveFg, opacity: 1 };
            profile.palette.primaryInactiveBg = {
                source: 'fixed',
                value: generatedPalette.primaryInactiveBg,
                opacity: 1,
            };
            profile.palette.primaryInactiveFg = { source: 'fixed', value: generatedPalette.primaryInactiveFg };

            profile.palette.secondaryActiveBg = {
                source: 'fixed',
                value: generatedPalette.secondaryActiveBg,
                opacity: 1,
            };
            profile.palette.secondaryActiveFg = {
                source: 'fixed',
                value: generatedPalette.secondaryActiveFg,
                opacity: 1,
            };
            profile.palette.secondaryInactiveBg = {
                source: 'fixed',
                value: generatedPalette.secondaryInactiveBg,
                opacity: 1,
            };
            profile.palette.secondaryInactiveFg = { source: 'fixed', value: generatedPalette.secondaryInactiveFg };

            profile.palette.tertiaryBg = { source: 'fixed', value: generatedPalette.tertiaryActiveBg, opacity: 1 };
            profile.palette.tertiaryFg = { source: 'fixed', value: generatedPalette.tertiaryActiveFg, opacity: 1 };

            profile.palette.quaternaryBg = { source: 'fixed', value: generatedPalette.quaternaryActiveBg, opacity: 1 };
            profile.palette.quaternaryFg = { source: 'fixed', value: generatedPalette.quaternaryActiveFg, opacity: 1 };

            // Save the updated profiles
            profiles[profileName] = profile;
            await this._updateConfiguration({ advancedProfiles: profiles });

            // Send the updated profile back to the webview with generated palette for toast styling
            this._panel.webview.postMessage({
                command: 'paletteGenerated',
                data: {
                    advancedProfiles: profiles,
                    generatedPalette: generatedPalette,
                    profileName: profileName,
                },
            });
        } catch (error) {
            console.error('Failed to generate palette:', error);
            vscode.window.showErrorMessage(`Failed to generate palette: ${error}`);
        }
    }

    private _openColorPicker(colorPickerData: any): void {
        // Skip VS Code color picker if using native HTML color picker
        if (USE_NATIVE_COLOR_PICKER) {
            // Native color picker handles color selection directly in the webview
            return;
        }

        if (!colorPickerData) {
            vscode.window.showErrorMessage('Invalid color picker data');
            return;
        }

        const { ruleType, ruleIndex, colorType } = colorPickerData;

        // Get current color
        let currentColor = '#0066cc'; // default
        if (ruleType === 'repo' && this.currentConfig?.repoRules?.[ruleIndex]) {
            const rule = this.currentConfig.repoRules[ruleIndex];
            currentColor = colorType === 'primary' ? rule.primaryColor : rule.branchColor || '#0066cc';
        } else if (ruleType === 'branch' && this.currentConfig?.branchRules?.[ruleIndex]) {
            currentColor = this.currentConfig.branchRules[ruleIndex].color;
        }

        // Use VS Code input dialog for color selection
        vscode.window
            .showInputBox({
                prompt: `Enter a color for ${ruleType} rule ${ruleIndex + 1} (${colorType})`,
                value: currentColor,
                placeHolder: 'e.g., blue, #FF0000, rgb(255,0,0)',
            })
            .then((color) => {
                if (color !== undefined) {
                    // Send the new color back to webview
                    if (this._panel) {
                        this._panel.webview.postMessage({
                            command: 'colorPicked',
                            data: {
                                ruleType,
                                ruleIndex,
                                colorType,
                                color,
                            },
                        });
                    }
                }
            });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the CSS file URI
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'configWebview.css'),
        );

        // Get the help CSS file URI
        const helpCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'help.css'));

        // Get the JavaScript file URI
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'wvConfigWebview.js'),
        );

        // Get the Codicon font URI (copied by webpack to out/webview)
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'codicon.css'),
        );

        // Generate nonce for CSP
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            
            <!--
            Use a content security policy to only allow loading images from https or from our extension directory,
            and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" 
                content="default-src 'none'; 
                font-src ${webview.cspSource}; 
                img-src ${webview.cspSource}; 
                style-src 'unsafe-inline' ${webview.cspSource}; 
                script-src 'nonce-${nonce}'; 
                connect-src ${webview.cspSource};">
            
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Git Repo Window Colors Configuration</title>
            <link href="${codiconUri}" rel="stylesheet">
            <link href="${cssUri}" rel="stylesheet">
            <link href="${helpCssUri}" rel="stylesheet">
        </head>
        <body>
            <!-- Preview Mode Toast -->
            <div id="preview-toast" class="preview-toast" role="status" aria-live="polite" data-tooltip="You are viewing a preview of colors that would be applied to the selected rule, but the selected rule is not associated with the current workspace. Press [reset] to reselect the rules for this workspace.">
                <span class="preview-toast-text">PREVIEW MODE</span>
                <button class="preview-toast-reset-btn" data-action="resetToMatchingRules">reset</button>
            </div>
            
            <div class="tabs-header" role="tablist" aria-label="Configuration Sections">
                <button class="tab-button active" role="tab" aria-selected="true" aria-controls="rules-tab" id="tab-rules">Rules</button>
                <button class="tab-button" role="tab" aria-selected="false" aria-controls="branch-tables-tab" id="tab-branch-tables">Branch Tables</button>
                <button class="tab-button" role="tab" aria-selected="false" aria-controls="profiles-tab" id="tab-profiles">Profiles</button>
                <button class="tab-button" role="tab" aria-selected="false" aria-controls="report-tab" id="tab-report">Color Report</button>
                <button type="button" class="help-button-global" data-action="openContextualHelp" data-tooltip="Open Help" aria-label="Open Help"><span class="codicon codicon-question"></span></button>
            </div>
            
            <div class="config-container" role="main" aria-label="Git Repository Window Colors Configuration">
                
                <div id="rules-tab" role="tabpanel" aria-labelledby="tab-rules" class="tab-content active">
                    <div class="top-panels">
                        <section class="repo-panel" aria-labelledby="repo-rules-heading">
                            <div class="panel-header">
                                <h2 id="repo-rules-heading">Repository Rules 
                                    <button class="help-icon" 
                                            type="button"
                                            aria-label="Help for Repository Rules"
                                            tabindex="0"
                                            data-tooltip-html="<strong>Repository Rules</strong><br>Configure colors for specific repositories. Rules are matched in order from top to bottom.<br><br><strong>Repository Qualifier:</strong> Part of your repo URL (e.g., &quot;myrepo&quot;, &quot;github.com/user/repo&quot;)<br><strong>Primary Color:</strong> Main window color for this repository<br><strong>Branch Mode:</strong> Choose between Global or Local branch rules for this repository"
                                            data-tooltip-max-width="400"><span class="codicon codicon-info"></span></button>
                                </h2>
                                <button type="button" 
                                        class="header-add-button" 
                                        data-action="addRepoRule" 
                                        data-tooltip-html="Add a new repository rule. Rules are processed in order, with the first match being applied.<br><br><strong>Tip:</strong> Use Ctrl+Alt+R as a keyboard shortcut."
                                        data-tooltip-max-width="350"
                                        aria-label="Add Repository Rule (Ctrl+Alt+R)">
                                    + Add
                                </button>
                            </div>
                            <div class="section-help" aria-describedby="repo-rules-heading">
                                Define coloring rules for repositories. Rules are processed from top to bottom. The <strong>FIRST MATCHING</strong> rule will be used. The qualifier is a simple substring match against the repository URL, not a regular expression.
                            </div>
                            <div id="repoRulesContent" role="region" aria-label="Repository rules table">
                                <div class="placeholder" aria-live="polite">Loading repository rules...</div>
                            </div>
                        </section>
                        <div class="right-column">
                            <section class="branch-panel" aria-labelledby="branch-rules-heading">
                                <button class="branch-collapse-btn" 
                                        type="button"
                                        aria-label="Collapse Branch Rules Table"
                                        aria-expanded="true"
                                        data-tooltip="Collapse section">
                                    <span class="codicon codicon-chevron-right"></span>
                                </button>
                                <button class="branch-expand-btn" 
                                        type="button"
                                        aria-label="Expand Branch Rules Table"
                                        data-tooltip="Expand section"
                                        style="display: none;">
                                    <span class="codicon codicon-chevron-left"></span>
                                </button>
                                <div class="panel-header">
                                    <h2 id="branch-rules-heading">Branch Rules Table
                                        <button class="help-icon" 
                                                type="button"
                                                aria-label="Help for Branch Rules Table"
                                                tabindex="0"
                                                data-tooltip-html="<strong>Branch Rules Table</strong><br>Configure colors for branch name patterns across all repositories.<br><br><strong>Pattern:</strong> Regular expression to match branch names<br><strong>Examples:</strong><br>• <code>feature/.*</code> - All feature branches<br>• <code>main|master</code> - Main branches<br>• <code>release-.*</code> - Release branches<br>• <code>hotfix.*</code> - Hotfix branches"
                                                data-tooltip-max-width="400"><span class="codicon codicon-info"></span></button>
                                    </h2>
                                    <button type="button" 
                                            class="header-add-button branch-add-button" 
                                            data-action="addBranchRule" 
                                            data-tooltip-html="Add a new branch rule. Branch rules override repository rules for matching branch patterns.<br><br><strong>Tip:</strong> Use Ctrl+Alt+B as a keyboard shortcut."
                                            data-tooltip-max-width="350"
                                            aria-label="Add Branch Rule (Ctrl+Alt+B)">
                                        + Add
                                    </button>
                                </div>
                                <div class="section-help">
                                    Define rules based on branch name patterns. Rules are processed from top to bottom. The first match applies. A simple color is applied to the Activity Bar when working on a matched branch. A profile is applied to all configured elements.
                                </div>
                                <div id="branchRulesContent" role="region" aria-label="Branch rules table">
                                    <div class="placeholder" aria-live="polite">Loading branch rules...</div>
                                </div>
                            </section>
                        </div>
                    </div>
                    <section class="bottom-panel" aria-labelledby="other-settings-heading">
                        <button class="settings-collapse-btn" 
                                type="button"
                                aria-label="Collapse Other Settings"
                                aria-expanded="true"
                                data-tooltip="Collapse section">
                            <span class="codicon codicon-chevron-down"></span>
                        </button>
                        <button class="settings-expand-btn" 
                                type="button"
                                aria-label="Expand Other Settings"
                                data-tooltip="Expand section"
                                style="display: none;">
                            <span class="codicon codicon-chevron-up"></span>
                        </button>
                        <div class="panel-header">
                            <h2 id="other-settings-heading">Other Settings
                                <button class="help-icon" 
                                    type="button"
                                    aria-label="Help for Other Settings"
                                    tabindex="0"
                                    data-tooltip-html="<strong>Other Settings</strong><br>Configure other behavior and appearance options.<br><br><strong>* Simple Colors Only:</strong> Settings marked with an asterisk (*) only apply when using simple colors in your rules. When using Profiles, these color-related settings are controlled by the profile configuration.<br><br><strong>Activity Bar Color Knob:</strong> Adjust brightness of non-title bar elements (-10 to +10)<br><strong>Branch Hue Rotation:</strong> Automatic color shift for branch indicators (-179° to +179°)<br><br>Toggle various UI elements that should be colored by the extension."
                                    data-tooltip-max-width="450"><span class="codicon codicon-info"></span></button>
                            </h2>
                            <div class="import-export-buttons">
                                <button type="button" 
                                        class="import-export-button" 
                                        data-action="exportConfig" 
                                        data-tooltip="Export current configuration to a JSON file"
                                        aria-label="Export Configuration">
                                    📤 Export Config
                                </button>
                                <button type="button" 
                                        class="import-export-button" 
                                        data-action="importConfig" 
                                        data-tooltip="Import configuration from a JSON file"
                                        aria-label="Import Configuration">
                                    📥 Import Config
                                </button>
                            </div>
                        </div>
                        <div id="otherSettingsContent" role="region" aria-label="Other settings controls">
                            <div class="placeholder" aria-live="polite">Loading other settings...</div>
                        </div>
                    </section>
                </div>
                
                <div id="profiles-tab" role="tabpanel" aria-labelledby="tab-profiles" class="tab-content">
                     <!-- Top section: Profiles List + Palette Editor side by side -->
                     <div class="profiles-top-section">
                        <section class="profiles-list-section">
                           <div class="panel-header">
                                <h2>Profiles
                                    <span class="help-icon" tabindex="0" role="button" aria-label="Profiles Help"
                                          data-tooltip-html="<strong>Profiles</strong><br>Define reusable color schemes (profiles) that can be applied to repository rules."
                                          data-tooltip-max-width="350"><span class="codicon codicon-info"></span></span>
                                </h2>
                                <button type="button" class="header-add-button" data-action="addProfile" data-tooltip="Add a new color profile">+ Add</button>
                           </div>
                           <div id="profilesList" class="profiles-list"></div>
                        </section>
                        
                        <div class="profile-editor-top" id="profileEditorTop">
                            <div class="profile-header">
                                <input type="text" id="profileNameInput" placeholder="Profile Name">
                                <div class="profile-actions">
                                   <button type="button" class="profile-action-btn" data-action="duplicateProfile" data-tooltip="Duplicate Profile" aria-label="Duplicate Profile"><span class="codicon codicon-copy"></span></button>
                                   <button type="button" class="profile-action-btn" data-action="deleteProfile" data-tooltip="Delete Profile" aria-label="Delete Profile"><span class="codicon codicon-trash"></span></button>
                                </div>
                            </div>
                            
                            <div class="palette-editor-section">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                    <h3 style="margin: 0;">Reference Palette
                                        <span class="help-icon" tabindex="0" role="button" aria-label="Palette Help"
                                              data-tooltip-html="<strong>Reference Palette</strong><br>Define reference colors that can be used in the mappings."
                                              data-tooltip-max-width="350"><span class="codicon codicon-info"></span></span>
                                    </h3>
                                    <div class="palette-generator-container">
                                        <div id="paletteToast" class="palette-toast" style="display: none;">
                                            <span class="palette-toast-message">Palette generated</span>
                                            <div class="palette-toast-actions">
                                                <button type="button" class="palette-toast-btn palette-toast-accept" id="paletteToastAccept">Accept</button>
                                                <button type="button" class="palette-toast-btn palette-toast-undo" id="paletteToastUndo">Undo</button>
                                            </div>
                                        </div>
                                        <button type="button" class="palette-generator-btn" id="paletteGeneratorBtn" data-tooltip="Generate palette colors from Primary Active Background using color theory algorithms" data-tooltip-position="top" aria-label="Generate Pleasing Palette from Primary Active Background">
                                            <span class="codicon codicon-wand"></span>
                                            <span class="codicon codicon-chevron-down"></span>
                                        </button>
                                        <div class="palette-generator-dropdown" id="paletteGeneratorDropdown" style="display: none;">
                                            <button type="button" class="palette-algorithm-option" data-algorithm="balanced">Balanced Tetradic</button>
                                            <button type="button" class="palette-algorithm-option" data-algorithm="monochromatic">Monochromatic</button>
                                            <button type="button" class="palette-algorithm-option" data-algorithm="bold-contrast">Bold Contrast</button>
                                        </div>
                                    </div>
                                </div>
                                <div id="paletteEditor" class="palette-grid">
                                    <!-- Grid of palette slots -->
                                </div>
                            </div>
                        </div>
                     </div>
                     
                     <!-- Bottom section: Mappings Editor full width -->
                     <div class="profiles-bottom-section" id="profileEditorBottom">
                        <div class="mappings-editor-section">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                <h3 style="margin: 0;">
                                    Mappings
                                    <span class="help-icon" tabindex="0" role="button" aria-label="Mappings Help"
                                          data-tooltip-html="<strong>Section Mappings</strong><br>Map UI elements (like Title Bar, Status Bar) to one of the palette slots defined above."
                                          data-tooltip-max-width="350"><span class="codicon codicon-info"></span></span>
                                </h3>
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="syncFgBgCheckbox" checked style="cursor: pointer;">
                                        <span>Synchronize fg/bg selections</span>
                                        <span class="help-icon" tabindex="0" role="button" aria-label="Synchronize Help" style="margin-left: 0;"
                                              data-tooltip-html="<strong>Synchronize Foreground/Background</strong><br>When enabled, selecting a foreground color automatically sets the corresponding background color (and vice versa).<br><br>For example, selecting &quot;Primary Active Foreground&quot; will automatically set &quot;Primary Active Background&quot; to its corresponding palette slot."
                                              data-tooltip-max-width="400"><span class="codicon codicon-info"></span></span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="syncActiveInactiveCheckbox" checked style="cursor: pointer;">
                                        <span>Synchronize active/inactive selections</span>
                                        <span class="help-icon" tabindex="0" role="button" aria-label="Active/Inactive Sync Help" style="margin-left: 0;"
                                              data-tooltip-html="<strong>Synchronize Active/Inactive</strong><br>When enabled, selecting an active element automatically sets the corresponding inactive element (and vice versa).<br><br>For example, selecting &quot;Title Bar Active Foreground&quot; will automatically set &quot;Title Bar Inactive Foreground&quot; to its corresponding palette slot.<br><br><strong>Combined Effect:</strong> When both sync options are enabled, changing one element can automatically configure up to 4 related elements (active/inactive × foreground/background)."
                                              data-tooltip-max-width="450"><span class="codicon codicon-info"></span></span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="limitOptionsCheckbox" style="cursor: pointer;">
                                        <span>Limit options</span>
                                        <span class="help-icon" tabindex="0" role="button" aria-label="Limit Options Help" style="margin-left: 0;"
                                              data-tooltip-html="<strong>Limit Dropdown Options</strong><br>When enabled, dropdown menus will only show palette slots that match the element's characteristics.<br><br><strong>Examples:</strong><br>• Background elements only show background palette slots (e.g., Primary Active Bg, Secondary Inactive Bg)<br>• Foreground elements only show foreground palette slots<br>• Active elements prefer active palette slots<br>• Inactive elements prefer inactive palette slots<br><br>This helps avoid accidentally assigning mismatched color types and makes it easier to find the right palette slot."
                                              data-tooltip-max-width="450"><span class="codicon codicon-info"></span></span>
                                    </label>
                                </div>
                            </div>
                            <div id="mappingsEditor">
                                <!-- Tabbed sections for mappings -->
                            </div>
                        </div>
                     </div>
                </div>
                
                <div id="branch-tables-tab" role="tabpanel" aria-labelledby="tab-branch-tables" class="tab-content">
                    <section class="branch-tables-panel">
                        <div class="panel-header">
                            <h2>Branch Tables</h2>
                        </div>
                        <p style="margin: 0 0 1em 0; color: var(--vscode-descriptionForeground);">
                            Manage shared branch rule tables that can be used across multiple repository rules. 
                            Create new tables using "Create New Table" in the Branch Table dropdown on the Rules page. 
                            Tables that are currently in use cannot be deleted.
                        </p>
                        <div id="branch-tables-content">
                            <!-- Populated by renderBranchTablesTab() -->
                        </div>
                    </section>
                </div>
                
                <div id="report-tab" role="tabpanel" aria-labelledby="tab-report" class="tab-content">
                    <section class="report-panel">
                        <div class="panel-header">
                            <h2>Color Report
                                <button class="help-icon" 
                                        type="button"
                                        aria-label="Help for Color Report"
                                        tabindex="0"
                                        data-tooltip-html="<strong>Color Report</strong><br>Detailed report showing all theme elements that are currently being colored, the applied colors, and which rules or profiles are applying them."
                                        data-tooltip-max-width="400"><span class="codicon codicon-info"></span></button>
                            </h2>
                        </div>
                        <div id="reportContent" role="region" aria-label="Color report table">
                            <div class="placeholder">Loading color report...</div>
                        </div>
                    </section>
                </div>
            
            </div>
            
            <!-- Help Panel (Unified) -->
            <div class="help-panel-overlay" id="helpPanelOverlay" data-action="closeHelp"></div>
            <div class="help-panel" id="helpPanel">
                <div class="help-panel-header">
                    <h2 class="help-panel-title" id="helpPanelTitle">Help</h2>
                    <button type="button" class="help-panel-close" data-action="closeHelp" aria-label="Close help panel"><span class="codicon codicon-close"></span></button>
                </div>
                <div class="help-panel-content" id="helpPanelContent">
                    <!-- Help content will be loaded here -->
                </div>
            </div>
            
            <script nonce="${nonce}">
                // Inject development mode flag
                window.DEVELOPMENT_MODE = ${DEVELOPMENT_MODE};
            </script>
            <script nonce="${nonce}" src="${jsUri}"></script>
        </body>
        </html>`;
    }

    private async _checkAndShowGettingStarted(): Promise<void> {
        const hasShownGettingStarted = this._context.globalState.get<boolean>('grwc.hasShownGettingStarted', false);

        if (!hasShownGettingStarted) {
            // Mark as shown
            await this._context.globalState.update('grwc.hasShownGettingStarted', true);

            // Wait a bit for the webview to be fully loaded
            setTimeout(async () => {
                await this._sendGettingStartedHelpContent();

                // Send a message to open the help panel
                if (this._panel) {
                    this._panel.webview.postMessage({
                        command: 'openGettingStartedHelp',
                    });
                }
            }, 500);
        }
    }

    private _onPanelDisposed(): void {
        // When closing the configurator, we need to handle colors appropriately:
        // 1. If there's a matching rule → apply it (replace preview colors with actual colors)
        // 2. If no matching rule or not a git repo → clear preview colors

        const workspaceInfo = this._getWorkspaceInfo();
        const hasGitRepo = workspaceInfo && workspaceInfo.repositoryUrl && workspaceInfo.repositoryUrl.length > 0;

        if (hasGitRepo) {
            const repoRules = this._getRepoRules();
            const matchingIndex = this._getMatchingRepoRuleIndex(repoRules, workspaceInfo.repositoryUrl);

            if (matchingIndex >= 0) {
                // Has a matching rule - apply its colors (not preview)
                vscode.commands.executeCommand('_grwc.internal.applyColors', 'config panel closed', false);
            } else {
                // Git repo but no matching rule - clear preview colors
                vscode.commands.executeCommand('_grwc.internal.clearPreviewColors');
            }
        } else {
            // Not a git repo - clear any preview colors
            vscode.commands.executeCommand('_grwc.internal.clearPreviewColors');
        }

        this._panel = undefined;
    }

    public dispose(): void {
        this._onPanelDisposed();

        // Dispose configuration listener explicitly
        if (this._configurationListener) {
            this._configurationListener.dispose();
            this._configurationListener = undefined;
        }

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
