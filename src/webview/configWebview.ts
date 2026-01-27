import * as vscode from 'vscode';
import { AdvancedProfile } from '../types/advancedModeTypes';
import { RepoRule, BranchRule, OtherSettings, WebviewMessage } from '../types/webviewTypes';
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
    private _disposables: vscode.Disposable[] = [];
    private _workspaceInfo: { repositoryUrl: string; currentBranch: string } = { repositoryUrl: '', currentBranch: '' };
    private currentConfig: any = null;
    private _configurationListener: vscode.Disposable | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;

        // Set up configuration listener once
        this._configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('windowColors')) {
                this._sendConfigurationToWebview();
            }
        });
        this._disposables.push(this._configurationListener);
    }

    public setWorkspaceInfo(repositoryUrl: string, currentBranch: string): void {
        this._workspaceInfo = { repositoryUrl, currentBranch };
        // Refresh the webview if it's open
        if (this._panel) {
            this._sendConfigurationToWebview();
        }
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
                await this._handleDeleteConfirmation(message.data.deleteData!);
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
        }
    }

    public _sendConfigurationToWebview(): void {
        if (!this._panel) {
            return;
        }

        const repoRules = this._getRepoRules();
        const branchRules = this._getBranchRules();
        const otherSettings = this._getOtherSettings();
        const advancedProfiles = this._getAdvancedProfiles();
        const workspaceInfo = this._getWorkspaceInfo();

        // Get currently applied color customizations
        const colorCustomizations = vscode.workspace.getConfiguration('workbench').get('colorCustomizations', {});

        // Calculate matching rule indexes using the same logic as the extension
        const matchingRepoRuleIndex = this._getMatchingRepoRuleIndex(repoRules, workspaceInfo.repositoryUrl);
        const matchingBranchRuleIndex = this._getMatchingBranchRuleIndex(branchRules, workspaceInfo.currentBranch);

        // console.log('[DEBUG] Sending matching indexes:', {
        //     repoRule: matchingRepoRuleIndex,
        //     branchRule: matchingBranchRuleIndex,
        // });

        this.currentConfig = {
            repoRules,
            branchRules,
            otherSettings,
            advancedProfiles,
        };

        const msgData = {
            ...this.currentConfig,
            workspaceInfo,
            colorCustomizations,
            matchingIndexes: {
                repoRule: matchingRepoRuleIndex,
                branchRule: matchingBranchRuleIndex,
            },
        };

        //console.log('[DEBUG] Sending configuration to webview: ', msgData);

        this._panel.webview.postMessage({
            command: 'configData',
            data: msgData,
        });
    }

    private _getRepoRules(): RepoRule[] {
        const config = vscode.workspace.getConfiguration('windowColors');
        const repoConfigList = config.get<string[]>('repoConfigurationList', []);

        return repoConfigList.map((rule) => this._parseRepoRule(rule)).filter((rule) => rule !== null) as RepoRule[];
    }

    private _parseRepoRule(ruleString: string): RepoRule | null {
        try {
            // Try parsing as JSON first (new format with enabled field)
            if (ruleString.trim().startsWith('{')) {
                const obj = JSON.parse(ruleString);
                return {
                    repoQualifier: obj.repoQualifier || '',
                    defaultBranch: obj.defaultBranch,
                    primaryColor: obj.primaryColor || '',
                    branchColor: obj.branchColor,
                    enabled: obj.enabled,
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

            // Parse repo section: repo-qualifier[|default-branch]
            const repoPipeIndex = repoSection.indexOf('|');
            const repoQualifier = repoPipeIndex === -1 ? repoSection : repoSection.substring(0, repoPipeIndex);
            const defaultBranch = repoPipeIndex === -1 ? undefined : repoSection.substring(repoPipeIndex + 1);

            // Parse color section: primary-color[|branch-color]
            const colorPipeIndex = colorSection.indexOf('|');
            const primaryColor = colorPipeIndex === -1 ? colorSection : colorSection.substring(0, colorPipeIndex);
            const branchColor = colorPipeIndex === -1 ? undefined : colorSection.substring(colorPipeIndex + 1);

            return {
                repoQualifier: repoQualifier.trim(),
                defaultBranch: defaultBranch ? defaultBranch.trim() : undefined,
                primaryColor: primaryColor.trim(),
                branchColor: branchColor ? branchColor.trim() : undefined,
            };
        } catch (error) {
            console.warn('Failed to parse repo rule:', ruleString, error);
            return null;
        }
    }

    private _getBranchRules(): BranchRule[] {
        const config = vscode.workspace.getConfiguration('windowColors');
        const branchConfigList = config.get<string[]>('branchConfigurationList', []);

        return branchConfigList
            .map((rule) => this._parseBranchRule(rule))
            .filter((rule) => rule !== null) as BranchRule[];
    }

    private _parseBranchRule(ruleString: string): BranchRule | null {
        try {
            // Try parsing as JSON first (new format with enabled field)
            if (ruleString.trim().startsWith('{')) {
                const obj = JSON.parse(ruleString);
                return {
                    pattern: obj.pattern || '',
                    color: obj.color || '',
                    enabled: obj.enabled,
                } as any;
            }

            // Otherwise parse legacy string format
            const parts = ruleString.split(':');
            if (parts.length < 2) {
                return null;
            }

            return {
                pattern: parts[0].trim(),
                color: parts[1].trim(),
            };
        } catch (error) {
            console.warn('Failed to parse branch rule:', ruleString, error);
            return null;
        }
    }

    private _getOtherSettings(): OtherSettings {
        const config = vscode.workspace.getConfiguration('windowColors');

        return {
            removeManagedColors: config.get<boolean>('removeManagedColors', true),
            invertBranchColorLogic: config.get<boolean>('invertBranchColorLogic', false),
            colorInactiveTitlebar: config.get<boolean>('colorInactiveTitlebar', true),
            colorEditorTabs: config.get<boolean>('colorEditorTabs', false),
            colorStatusBar: config.get<boolean>('colorStatusBar', false),
            applyBranchColorToTabsAndStatusBar: config.get<boolean>('applyBranchColorToTabsAndStatusBar', false),
            activityBarColorKnob: config.get<number>('activityBarColorKnob', 0),
            automaticBranchIndicatorColorKnob: config.get<number>('automaticBranchIndicatorColorKnob', 60),
            showBranchColumns: config.get<boolean>('showBranchColumns', true),
            showStatusIconWhenNoRuleMatches: config.get<boolean>('showStatusIconWhenNoRuleMatches', true),
            askToColorizeRepoWhenOpened: config.get<boolean>('askToColorizeRepoWhenOpened', true),
            enableProfilesAdvanced: config.get<boolean>('enableProfilesAdvanced', false),
        };
    }

    private _getAdvancedProfiles(): { [key: string]: AdvancedProfile } {
        const config = vscode.workspace.getConfiguration('windowColors');
        return config.get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
    }

    private _getWorkspaceInfo(): { repositoryUrl: string; currentBranch: string } {
        return this._workspaceInfo;
    }

    private _getMatchingRepoRuleIndex(repoRules: RepoRule[], repositoryUrl: string): number {
        if (!repoRules || !repositoryUrl) {
            return -1;
        }

        // console.log('[DEBUG] Matching repo rules:', {
        //     repoRules: repoRules.map((r, i) => `${i}: ${r.repoQualifier}`),
        //     repositoryUrl: repositoryUrl,
        // });

        for (let i = 0; i < repoRules.length; i++) {
            // Skip disabled rules
            if ((repoRules[i] as any).enabled === false) continue;

            // console.log(`[DEBUG] Testing repo rule ${i}: "${repoRules[i].repoQualifier}" against "${repositoryUrl}"`);
            if (repositoryUrl.includes(repoRules[i].repoQualifier)) {
                // console.log(`[DEBUG] Repo rule ${i} matched! Returning index ${i}`);
                return i;
            }
        }

        // console.log('[DEBUG] No repo rule matched, returning -1');
        return -1;
    }

    private _getMatchingBranchRuleIndex(branchRules: BranchRule[], currentBranch: string): number {
        if (!branchRules || !currentBranch) {
            return -1;
        }

        // console.log('[DEBUG] Matching branch rules:', {
        //     branchRules: branchRules.map((r, i) => `${i}: ${r.pattern}`),
        //     currentBranch: currentBranch,
        // });

        for (let i = 0; i < branchRules.length; i++) {
            // Skip disabled rules
            if ((branchRules[i] as any).enabled === false) continue;

            // outputChannel.appendLine(
            //     `[DEBUG] Testing branch rule ${i}: "${branchRules[i].pattern}" against "${currentBranch}"`,
            // );
            try {
                const regex = new RegExp(branchRules[i].pattern);
                if (regex.test(currentBranch)) {
                    // outputChannel.appendLine(`[DEBUG] Branch rule ${i} matched! Returning index ${i}`);
                    return i;
                }
            } catch (error) {
                // outputChannel.appendLine(`[DEBUG] Branch rule ${i} has invalid regex, skipping`);
                // Invalid regex, skip this rule
                continue;
            }
        }

        // console.log('[DEBUG] No branch rule matched, returning -1');
        return -1;
    }

    private async _updateConfiguration(data: any): Promise<void> {
        // console.log('[DEBUG] Backend _updateConfiguration called with:', data);

        if (!data) {
            vscode.window.showErrorMessage('No configuration data provided');
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('windowColors');
            // console.log('[DEBUG] Current settingsconfiguration:', config);
            // console.log('[DEBUG] New data to apply:', data);
            const updatePromises: Thenable<void>[] = [];

            // Update repository rules
            if (data.repoRules) {
                // console.log('[DEBUG] Updating repo rules:', data.repoRules);
                const repoRulesArray = data.repoRules.map((rule: RepoRule) => {
                    const formatted = this._formatRepoRule(rule);
                    // console.log('[DEBUG]   Formatted rule:', rule, '->', formatted);
                    return formatted;
                });
                updatePromises.push(config.update('repoConfigurationList', repoRulesArray, true));
            }

            // Update branch rules
            if (data.branchRules) {
                // console.log('[DEBUG] Updating branch rules:', data.branchRules);
                const branchRulesArray = data.branchRules.map((rule: BranchRule | any) => {
                    // console.log('[DEBUG]   branch rule:', rule);
                    // If enabled field is explicitly false, store as JSON object
                    if (rule.enabled === false) {
                        return JSON.stringify({
                            pattern: rule.pattern,
                            color: rule.color,
                            enabled: false,
                        });
                    }
                    // Otherwise use legacy string format
                    return `${rule.pattern}:${rule.color}`;
                });
                updatePromises.push(config.update('branchConfigurationList', branchRulesArray, true));
            }

            // Update advanced profiles
            if (data.advancedProfiles) {
                updatePromises.push(config.update('advancedProfiles', data.advancedProfiles, true));
            }

            // Update other settings
            if (data.otherSettings) {
                // console.log('[DEBUG] Updating other settings:', data.otherSettings);
                const settings = data.otherSettings as OtherSettings;
                Object.keys(settings).forEach((key) => {
                    updatePromises.push(config.update(key, settings[key as keyof OtherSettings], true));
                });
            }

            // console.log('[DEBUG] Waiting for', updatePromises.length, 'configuration updates to complete...');
            await Promise.all(updatePromises);
            // console.log('[DEBUG] All configuration updates completed results:', promiseResult);
        } catch (error) {
            console.error('Failed to update configuration:', error);
            vscode.window.showErrorMessage('Failed to update configuration: ' + (error as Error).message);
        }
    }

    private _formatRepoRule(rule: RepoRule | any): string {
        // If enabled field is explicitly false, store as JSON object
        if (rule.enabled === false) {
            return JSON.stringify({
                repoQualifier: rule.repoQualifier,
                defaultBranch: rule.defaultBranch,
                primaryColor: rule.primaryColor,
                branchColor: rule.branchColor,
                enabled: false,
            });
        }

        // Otherwise use legacy string format for backward compatibility
        let result = rule.repoQualifier;
        if (rule.defaultBranch) {
            result += `|${rule.defaultBranch}`;
        }
        result += `:${rule.primaryColor}`;
        if (rule.branchColor) {
            result += `|${rule.branchColor}`;
        }
        return result;
    }

    private async _handleDeleteConfirmation(deleteData: {
        ruleType: 'repo' | 'branch';
        index: number;
        ruleDescription: string;
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
            const branchRules = this._getBranchRules();

            if (ruleType === 'repo' && repoRules[index]) {
                repoRules.splice(index, 1);
                await this._updateConfiguration({ repoRules });
            } else if (ruleType === 'branch' && branchRules[index]) {
                branchRules.splice(index, 1);
                await this._updateConfiguration({ branchRules });
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

        // Get the JavaScript file URI
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'wvConfigWebview.js'),
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
                script-src 'nonce-${nonce}';">
            
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Git Repo Window Colors Configuration</title>
            <link href="${cssUri}" rel="stylesheet">
        </head>
        <body>
            <div class="tabs-header" role="tablist" aria-label="Configuration Sections">
                <button class="tab-button active" role="tab" aria-selected="true" aria-controls="rules-tab" id="tab-rules">Rules</button>
                <button class="tab-button" role="tab" aria-selected="false" aria-controls="profiles-tab" id="tab-profiles">Profiles (Advanced)</button>
                <button class="tab-button" role="tab" aria-selected="false" aria-controls="report-tab" id="tab-report">Color Report</button>
            </div>
            
            <div class="config-container" role="main" aria-label="Git Repository Window Colors Configuration">
                
                <div id="rules-tab" role="tabpanel" aria-labelledby="tab-rules" class="tab-content active">
                    <div class="top-panels">
                        <section class="repo-panel" aria-labelledby="repo-rules-heading">
                            <div class="panel-header">
                                <h2 id="repo-rules-heading">Repository Rules 
                                    <button class="tooltip panel-tooltip help-icon" 
                                            type="button"
                                            aria-label="Help for Repository Rules"
                                            aria-describedby="repo-rules-tooltip"
                                            tabindex="0">ℹ️
                                        <span class="tooltiptext" 
                                            id="repo-rules-tooltip" 
                                            role="tooltip" 
                                            aria-hidden="true">
                                            <strong>Repository Rules</strong><br>
                                            Configure colors for specific repositories. Rules are matched in order from top to bottom.<br><br>
                                            <strong>Repository Qualifier:</strong> Part of your repo URL (e.g., "myrepo", "github.com/user/repo")<br>
                                            <strong>Default Branch:</strong> Optional. Specify main branch name for branch-specific coloring<br>
                                            <strong>Primary Color:</strong> Main window color for this repository<br>
                                            <strong>Branch Color:</strong> Optional. Color used when not on the default branch<br><br>
                                            <strong>Note:</strong> Branch-related columns (Default Branch, Branch Color) can be hidden using the setting in Other Settings.
                                        </span>
                                    </button>
                                </h2>
                                <button type="button" 
                                        class="header-add-button tooltip panel-tooltip" 
                                        data-action="addRepoRule" 
                                        title="Add a new repository rule"
                                        aria-label="Add Repository Rule (Ctrl+Alt+R)">
                                    + Add
                                    <span class="tooltiptext" role="tooltip">
                                        Add a new repository rule. Rules are processed in order, with the first match being applied.
                                        <br><br><strong>Tip:</strong> Use Ctrl+Alt+R as a keyboard shortcut.
                                    </span>
                                </button>
                            </div>
                            <div class="section-help" aria-describedby="repo-rules-heading">
                                Define color rules for specific repositories. The <strong>FIRST MATCHING</strong> rule will be used. The qualifier is a simple substring match against the repository URL, not a regular expression.
                            </div>
                            <div id="repoRulesContent" role="region" aria-label="Repository rules table">
                                <div class="placeholder" aria-live="polite">Loading repository rules...</div>
                            </div>
                        </section>
                        <div class="right-column">
                            <section class="branch-panel" aria-labelledby="branch-rules-heading">
                                <div class="panel-header">
                                    <h2 id="branch-rules-heading">Branch Rules
                                        <button class="tooltip panel-tooltip help-icon" 
                                                type="button"
                                                aria-label="Help for Branch Rules"
                                                aria-describedby="branch-rules-tooltip"
                                                tabindex="0">ℹ️
                                            <span class="tooltiptext" 
                                                id="branch-rules-tooltip" 
                                                role="tooltip" 
                                                aria-hidden="true">
                                                <strong>Branch Rules</strong><br>
                                                Configure colors for branch name patterns across all repositories.<br><br>
                                                <strong>Pattern:</strong> Regular expression to match branch names<br>
                                                <strong>Examples:</strong><br>
                                                • <code>feature/.*</code> - All feature branches<br>
                                                • <code>main|master</code> - Main branches<br>
                                                • <code>release-.*</code> - Release branches<br>
                                                • <code>hotfix.*</code> - Hotfix branches
                                            </span>
                                        </button>
                                    </h2>
                                    <button type="button" 
                                            class="header-add-button tooltip panel-tooltip-left" 
                                            data-action="addBranchRule" 
                                            title="Add a new branch rule"
                                            aria-label="Add Branch Rule (Ctrl+Alt+B)">
                                        + Add
                                        <span class="tooltiptext" role="tooltip">
                                            Add a new branch rule. Branch rules override repository rules for matching branch patterns.
                                            <br><br><strong>Tip:</strong> Use Ctrl+Alt+B as a keyboard shortcut.
                                        </span>
                                    </button>
                                </div>
                                <div class="section-help">
                                    Define color rules based on branch name patterns. These override repository branch rules (if used). The configured color is applied to the Activity Bar when working on a matched branch.
                                </div>
                                <div id="branchRulesContent" role="region" aria-label="Branch rules table">
                                    <div class="placeholder" aria-live="polite">Loading branch rules...</div>
                                </div>
                            </section>
                            <section class="import-export-panel">
                                <div class="import-export-buttons">
                                    <button type="button" 
                                            class="import-export-button" 
                                            data-action="exportConfig" 
                                            title="Export current configuration to a JSON file"
                                            aria-label="Export Configuration">
                                        📤 Export Config
                                    </button>
                                    <button type="button" 
                                            class="import-export-button" 
                                            data-action="importConfig" 
                                            title="Import configuration from a JSON file"
                                            aria-label="Import Configuration">
                                        📥 Import Config
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                    <section class="bottom-panel" aria-labelledby="other-settings-heading">
                        <h2 id="other-settings-heading">Other Settings
                            <button class="tooltip bottom-panel-tooltip help-icon" 
                                    type="button"
                                    aria-label="Help for Other Settings"
                                    aria-describedby="other-settings-tooltip"
                                    tabindex="0">ℹ️
                                <span class="tooltiptext" 
                                    id="other-settings-tooltip" 
                                    role="tooltip" 
                                    aria-hidden="true">
                                    <strong>Other Settings</strong><br>
                                    Configure other behavior and appearance options.<br><br>
                                    <strong>* Simple Colors Only:</strong> Settings marked with an asterisk (*) only apply when using simple colors in your rules. When using Profiles, these color-related settings are controlled by the profile configuration.<br><br>
                                    <strong>Activity Bar Color Knob:</strong> Adjust brightness of non-title bar elements (-10 to +10)<br>
                                    <strong>Branch Hue Rotation:</strong> Automatic color shift for branch indicators (-179° to +179°)<br><br>
                                    Toggle various UI elements that should be colored by the extension.
                                </span>
                            </button>
                        </h2>
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
                                    <span class="tooltip right-tooltip help-icon" tabindex="0" role="button" aria-label="Profiles Help">ℹ️
                                        <span class="tooltiptext">
                                            <strong>Profiles</strong><br>
                                            Define reusable color schemes (profiles) that can be applied to repository rules.
                                        </span>
                                    </span>
                                </h2>
                                <button type="button" class="header-add-button" data-action="addProfile">+ Add</button>
                           </div>
                           <div id="profilesList" class="profiles-list"></div>
                        </section>
                        
                        <div class="profile-editor-top" id="profileEditorTop">
                            <div class="profile-header">
                                <input type="text" id="profileNameInput" placeholder="Profile Name">
                                <div class="profile-actions">
                                   <!-- actions like clone, delete -->
                                </div>
                            </div>
                            
                            <div class="palette-editor-section">
                                <h3>Reference Palette
                                    <span class="tooltip right-bottom-tooltip help-icon" tabindex="0" role="button" aria-label="Palette Help">ℹ️
                                        <span class="tooltiptext">
                                            <strong>Reference Palette (10 Slots)</strong><br>
                                            Define 10 referenced colors that can be used in the mappings.<br><br>
                                        </span>
                                    </span>
                                </h3>
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
                                    <span class="tooltip right-tooltip help-icon" tabindex="0" role="button" aria-label="Mappings Help">ℹ️
                                        <span class="tooltiptext">
                                            <strong>Section Mappings</strong><br>
                                            Map UI elements (like Title Bar, Status Bar) to one of the 10 palette slots defined above.
                                        </span>
                                    </span>
                                </h3>
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="syncFgBgCheckbox" checked style="cursor: pointer;">
                                        <span>Synchronize fg/bg selections</span>
                                        <span class="tooltip left-tooltip help-icon" tabindex="0" role="button" aria-label="Synchronize Help" style="margin-left: 0;">ℹ️
                                            <span class="tooltiptext">
                                                <strong>Synchronize Foreground/Background</strong><br>
                                                When enabled, selecting a foreground color automatically sets the corresponding background color (and vice versa).<br><br>
                                                For example, selecting "Primary Active Foreground" will automatically set "Primary Active Background" to its corresponding palette slot.
                                            </span>
                                        </span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="syncActiveInactiveCheckbox" checked style="cursor: pointer;">
                                        <span>Synchronize active/inactive selections</span>
                                        <span class="tooltip left-tooltip help-icon" tabindex="0" role="button" aria-label="Active/Inactive Sync Help" style="margin-left: 0;">ℹ️
                                            <span class="tooltiptext">
                                                <strong>Synchronize Active/Inactive</strong><br>
                                                When enabled, selecting an active element automatically sets the corresponding inactive element (and vice versa).<br><br>
                                                For example, selecting "Title Bar Active Foreground" will automatically set "Title Bar Inactive Foreground" to its corresponding palette slot.<br><br>
                                                <strong>Combined Effect:</strong> When both sync options are enabled, changing one element can automatically configure up to 4 related elements (active/inactive × foreground/background).
                                            </span>
                                        </span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                        <input type="checkbox" id="limitOptionsCheckbox" style="cursor: pointer;">
                                        <span>Limit options</span>
                                        <span class="tooltip left-tooltip help-icon" tabindex="0" role="button" aria-label="Limit Options Help" style="margin-left: 0;">ℹ️
                                            <span class="tooltiptext">
                                                <strong>Limit Dropdown Options</strong><br>
                                                When enabled, dropdown menus will only show palette slots that match the element's characteristics.<br><br>
                                                <strong>Examples:</strong><br>
                                                • Background elements only show background palette slots (e.g., Primary Active Bg, Secondary Inactive Bg)<br>
                                                • Foreground elements only show foreground palette slots<br>
                                                • Active elements prefer active palette slots<br>
                                                • Inactive elements prefer inactive palette slots<br><br>
                                                This helps avoid accidentally assigning mismatched color types and makes it easier to find the right palette slot.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                            <div id="mappingsEditor">
                                <!-- Tabbed sections for mappings -->
                            </div>
                        </div>
                     </div>
                </div>
                
                <div id="report-tab" role="tabpanel" aria-labelledby="tab-report" class="tab-content">
                    <section class="report-panel">
                        <div class="panel-header">
                            <h2>Color Report
                                <button class="tooltip panel-tooltip help-icon" 
                                        type="button"
                                        aria-label="Help for Color Report"
                                        tabindex="0">ℹ️
                                    <span class="tooltiptext" role="tooltip">
                                        <strong>Color Report</strong><br>
                                        Detailed report showing all theme elements that are currently being colored,
                                        the applied colors, and which rules or profiles are applying them.
                                    </span>
                                </button>
                            </h2>
                        </div>
                        <div id="reportContent" role="region" aria-label="Color report table">
                            <div class="placeholder">Loading color report...</div>
                        </div>
                    </section>
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

    private _onPanelDisposed(): void {
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
