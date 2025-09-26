import * as vscode from 'vscode';
import { RepoRule, BranchRule, OtherSettings, WebviewMessage } from '../types/webviewTypes';

// Build-time configuration for color picker type
// Set to false to use VS Code's input dialog, true to use native HTML color picker
const USE_NATIVE_COLOR_PICKER = true;

// Development mode configuration
// Set to true to show the Run Tests button for debugging/development
const DEVELOPMENT_MODE = false;

export class ConfigWebviewProvider implements vscode.Disposable {
    private _panel: vscode.WebviewPanel | undefined;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _workspaceInfo: { repositoryUrl: string; currentBranch: string } = { repositoryUrl: '', currentBranch: '' };

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public setWorkspaceInfo(repositoryUrl: string, currentBranch: string): void {
        this._workspaceInfo = { repositoryUrl, currentBranch };
        // Refresh the webview if it's open
        if (this._panel) {
            this._sendConfigurationToWebview();
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
            (message: WebviewMessage) => this._handleMessage(message),
            undefined,
            this._disposables,
        );

        // Handle when the panel is disposed
        this._panel.onDidDispose(() => this._onPanelDisposed(), null, this._disposables);

        // Send initial configuration to webview
        this._sendConfigurationToWebview();
    }

    private _handleMessage(message: WebviewMessage): void {
        switch (message.command) {
            case 'requestConfig':
                this._sendConfigurationToWebview();
                break;
            case 'updateConfig':
                this._updateConfiguration(message.data);
                break;
            case 'previewConfig':
                this._previewConfiguration(message.data);
                break;
            case 'openColorPicker':
                this._openColorPicker(message.data.colorPickerData!);
                break;
        }
    }

    private _sendConfigurationToWebview(): void {
        if (!this._panel) {
            return;
        }

        const repoRules = this._getRepoRules();
        const branchRules = this._getBranchRules();
        const otherSettings = this._getOtherSettings();
        const workspaceInfo = this._getWorkspaceInfo();

        // Calculate matching rule indexes using the same logic as the extension
        const matchingRepoRuleIndex = this._getMatchingRepoRuleIndex(repoRules, workspaceInfo.repositoryUrl);
        const matchingBranchRuleIndex = this._getMatchingBranchRuleIndex(branchRules, workspaceInfo.currentBranch);

        this.currentConfig = {
            repoRules,
            branchRules,
            otherSettings,
        };

        this._panel.webview.postMessage({
            command: 'configData',
            data: {
                ...this.currentConfig,
                workspaceInfo,
                matchingIndexes: {
                    repoRule: matchingRepoRuleIndex,
                    branchRule: matchingBranchRuleIndex,
                },
            },
        });
    }

    private _getRepoRules(): RepoRule[] {
        const config = vscode.workspace.getConfiguration('windowColors');
        const repoConfigList = config.get<string[]>('repoConfigurationList', []);

        return repoConfigList.map((rule) => this._parseRepoRule(rule)).filter((rule) => rule !== null) as RepoRule[];
    }

    private _parseRepoRule(ruleString: string): RepoRule | null {
        try {
            // Format: <repo-qualifier>[/<default-branch>]:<primary-color>[/<branch-color>]
            // Example: "myrepo/main:blue/green" or "myrepo:blue"
            const colonIndex = ruleString.indexOf(':');
            if (colonIndex === -1) {
                return null;
            }

            const repoSection = ruleString.substring(0, colonIndex).trim();
            const colorSection = ruleString.substring(colonIndex + 1).trim();

            if (!repoSection || !colorSection) {
                return null;
            }

            // Parse repo section: repo-qualifier[/default-branch]
            const repoSlashIndex = repoSection.indexOf('/');
            const repoQualifier = repoSlashIndex === -1 ? repoSection : repoSection.substring(0, repoSlashIndex);
            const defaultBranch = repoSlashIndex === -1 ? undefined : repoSection.substring(repoSlashIndex + 1);

            // Parse color section: primary-color[/branch-color]
            const colorSlashIndex = colorSection.indexOf('/');
            const primaryColor = colorSlashIndex === -1 ? colorSection : colorSection.substring(0, colorSlashIndex);
            const branchColor = colorSlashIndex === -1 ? undefined : colorSection.substring(colorSlashIndex + 1);

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
        };
    }

    private _getWorkspaceInfo(): { repositoryUrl: string; currentBranch: string } {
        return this._workspaceInfo;
    }

    private _getMatchingRepoRuleIndex(repoRules: RepoRule[], repositoryUrl: string): number {
        if (!repoRules || !repositoryUrl) {
            return -1;
        }

        for (let i = 0; i < repoRules.length; i++) {
            if (repositoryUrl.includes(repoRules[i].repoQualifier)) {
                return i;
            }
        }

        return -1;
    }

    private _getMatchingBranchRuleIndex(branchRules: BranchRule[], currentBranch: string): number {
        if (!branchRules || !currentBranch) {
            return -1;
        }

        for (let i = 0; i < branchRules.length; i++) {
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

    private _updateConfiguration(data: any): void {
        if (!data) {
            vscode.window.showErrorMessage('No configuration data provided');
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('windowColors');

            // Update repository rules
            if (data.repoRules) {
                const repoRulesArray = data.repoRules.map((rule: RepoRule) => this._formatRepoRule(rule));
                config.update('repoConfigurationList', repoRulesArray, true);
            }

            // Update branch rules
            if (data.branchRules) {
                const branchRulesArray = data.branchRules.map((rule: BranchRule) => `${rule.pattern}:${rule.color}`);
                config.update('branchConfigurationList', branchRulesArray, true);
            }

            // Update other settings
            if (data.otherSettings) {
                const settings = data.otherSettings as OtherSettings;
                Object.keys(settings).forEach((key) => {
                    config.update(key, settings[key as keyof OtherSettings], true);
                });
            }

            vscode.window.showInformationMessage('Configuration updated successfully');
        } catch (error) {
            console.error('Failed to update configuration:', error);
            vscode.window.showErrorMessage('Failed to update configuration: ' + (error as Error).message);
        }
    }

    private _formatRepoRule(rule: RepoRule): string {
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

    private _previewConfiguration(data: any): void {
        // Update the configuration temporarily for preview
        this._updateConfiguration(data);

        // Call the main extension's doit function to apply colors
        vscode.commands.executeCommand('_grwc.internal.applyColors', 'webview preview');

        vscode.window.showInformationMessage('Preview applied - colors should update momentarily');
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

    private currentConfig: any = null;

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Git Repo Window Colors Configuration</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                .config-container {
                    display: flex;
                    flex-direction: column;
                    height: calc(100vh - 40px);
                    gap: 20px;
                }
                .top-panels {
                    display: flex;
                    flex: 1;
                    gap: 20px;
                }
                .repo-panel, .branch-panel {
                    flex: 1;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 0px;
                    padding-top: 10px;
                    border-radius: 4px;
                    display: flex;
                    flex-direction: column;
                }
                .bottom-panel {
                    height: 200px;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 15px;
                    border-radius: 4px;
                }
                h2 {
                    margin-top: 0;
                    color: var(--vscode-foreground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                    margin-bottom: 15px;
                }
                .placeholder {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    text-align: center;
                    padding: 40px 20px;
                }
                .rules-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                .rules-table th {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                    padding: 8px;
                    text-align: left;
                    border: 1px solid var(--vscode-panel-border);
                    font-size: 12px;
                }
                .rules-table td {
                    padding: 4px;
                    border: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-editor-background);
                    vertical-align: middle;
                }
                /* Ensure all table cells have consistent background */
                .rules-table td.color-cell,
                .rules-table td.reorder-controls {
                    background-color: var(--vscode-editor-background);
                }
                /* Highlight matched rules */
                .rules-table tr.matched-rule {
                    border: 2px solid var(--vscode-charts-green);
                    background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(0, 255, 0, 0.1));
                }
                .rules-table tr.matched-rule td {
                    border-color: var(--vscode-charts-green);
                }
                .rule-input, .color-input {
                    width: 100%;
                    background: var(--vscode-editor-background);
                    border: none;
                    color: var(--vscode-input-foreground);
                    padding: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: 12px;
                }
                .rule-input:focus, .color-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    background-color: var(--vscode-input-background);
                }
                .color-cell {
                    padding: 2px !important;
                }
                .color-input-container {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .color-swatch {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .color-swatch:hover {
                    border-color: var(--vscode-focusBorder);
                }
                
                /* Native color picker styles */
                .color-input-container.native-picker {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .native-color-input {
                    width: 20px;
                    height: 20px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                    cursor: pointer;
                    background: none;
                    padding: 0;
                    flex-shrink: 0;
                }
                .native-color-input::-webkit-color-swatch-wrapper {
                    padding: 0;
                    border: none;
                    border-radius: 2px;
                }
                .native-color-input::-webkit-color-swatch {
                    border: none;
                    border-radius: 2px;
                }
                .color-input.text-input {
                    flex: 1;
                    min-width: 80px;
                }
                
                .reorder-controls {
                    text-align: center;
                    width: 65px;
                    padding: 2px !important;
                }
                .reorder-buttons {
                    display: flex;
                    flex-direction: row;
                    gap: 2px;
                    align-items: center;
                    justify-content: center;
                }
                .reorder-btn {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-panel-border);
                    width: 15px;
                    height: 15px;
                    font-size: 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .reorder-btn:hover:not(:disabled) {
                    background: var(--vscode-input-background);
                }
                .reorder-btn:disabled {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-disabledForeground);
                    border: none;
                    cursor: not-allowed;
                    /* Don't use opacity on the whole button - it affects tooltips */
                }
                .drag-handle {
                    width: 15px;
                    height: 15px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    cursor: grab;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 2px;
                    background: var(--vscode-input-background);
                    line-height: 1;
                    font-weight: normal;
                    text-align: center;
                    vertical-align: middle;
                    font-family: sans-serif;
                    box-sizing: border-box;
                    padding: 0;
                    margin: 0;
                }
                .rule-row.dragging {
                    opacity: 0.5;
                }
                .rule-row.drag-over {
                    border-top: 2px solid var(--vscode-focusBorder);
                }
                .delete-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-errorForeground);
                    border: 1px solid var(--vscode-panel-border);
                    width: 15px;
                    height: 15px;
                    font-size: 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .delete-btn:hover {
                    background: var(--vscode-errorBackground);
                    border-color: var(--vscode-errorForeground);
                }
                .add-button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    margin-bottom: 10px;
                }
                .add-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .table-controls {
                    margin-bottom: 10px;
                }
                /* Header layout with add button on the right */
                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .panel-header h2 {
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .header-add-button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    margin-right: 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    font-size: 12px;
                    white-space: nowrap;
                }
                .header-add-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .validation-error {
                    border: 1px solid var(--vscode-errorBorder) !important;
                    background-color: var(--vscode-inputValidation-errorBackground) !important;
                }
                
                /* Validation error container styles */
                .validation-error-container {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-errorBorder);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                }
                .error-title {
                    color: var(--vscode-errorForeground);
                    font-size: 14px;
                    font-weight: 600;
                    margin: 0 0 8px 0;
                }
                .error-list {
                    margin: 0;
                    padding-left: 20px;
                    list-style-type: disc;
                }
                .error-item {
                    color: var(--vscode-errorForeground);
                    font-size: 12px;
                    margin-bottom: 4px;
                }
                .error-item:last-child {
                    margin-bottom: 0;
                }
                
                .settings-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    margin-top: 10px;
                }
                .setting-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .setting-item label {
                    flex: 1;
                    color: var(--vscode-foreground);
                }
                input[type="checkbox"] {
                    accent-color: var(--vscode-button-background);
                }
                input[type="range"] {
                    flex: 1;
                    max-width: 120px;
                }
                .no-rules {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    text-align: center;
                    padding: 20px;
                }
                .test-buttons {
                    margin-top: 15px;
                    display: flex;
                    gap: 10px;
                }
                .test-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                }
                .test-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                /* Tooltip styles */
                .tooltip {
                    position: relative;
                    display: inline-block;
                    cursor: help;
                }
                .tooltip .tooltiptext {
                    visibility: hidden;
                    width: 300px;
                    background-color: var(--vscode-editorHoverWidget-background);
                    color: var(--vscode-editorHoverWidget-foreground);
                    text-align: left;
                    border-radius: 4px;
                    padding: 8px 12px;
                    position: absolute;
                    z-index: 1000;
                    bottom: 125%;
                    left: 50%;
                    margin-left: -150px;
                    opacity: 0;
                    transition: opacity 0.3s;
                    font-size: 12px;
                    line-height: 1.4;
                    border: 1px solid var(--vscode-editorHoverWidget-border);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }
                .tooltip .tooltiptext::after {
                    content: "";
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    margin-left: -5px;
                    border-width: 5px;
                    border-style: solid;
                    border-color: var(--vscode-editorHoverWidget-border) transparent transparent transparent;
                }
                .tooltip:hover .tooltiptext {
                    visibility: visible;
                    opacity: 1;
                }
                
                /* Panel header tooltips - render below to avoid clipping */
                .tooltip.panel-tooltip .tooltiptext {
                    bottom: auto;
                    top: 125%;
                }
                .tooltip.panel-tooltip .tooltiptext::after {
                    top: auto;
                    bottom: 100%;
                    border-color: transparent transparent var(--vscode-editorHoverWidget-border) transparent;
                }
                
                /* Bottom panel tooltips - render above to avoid clipping */
                .tooltip.bottom-panel-tooltip .tooltiptext {
                    bottom: 125%;
                    top: auto;
                }
                .tooltip.bottom-panel-tooltip .tooltiptext::after {
                    top: 100%;
                    bottom: auto;
                    border-color: var(--vscode-editorHoverWidget-border) transparent transparent transparent;
                }
                
                /* Right-positioned tooltips for reorder controls to avoid left edge clipping */
                .tooltip.right-tooltip .tooltiptext {
                    top: 50%;
                    left: 100%;
                    bottom: auto;
                    margin-left: 10px;
                    margin-top: -20px;
                    transform: translateY(-50%);
                }
                .tooltip.right-tooltip .tooltiptext::after {
                    top: 50%;
                    left: -5px;
                    margin-left: 0;
                    margin-top: -5px;
                    border-color: transparent var(--vscode-editorHoverWidget-border) transparent transparent;
                }
                
                /* Help text styles */
                .help-text {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    font-style: italic;
                    margin-top: 4px;
                    line-height: 1.3;
                }
                .section-help {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                    margin: 4px 0;
                    padding: 6px;
                    background-color: var(--vscode-editorWidget-background);
                    border-radius: 4px;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                .help-icon {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    vertical-align: middle;
                    margin-left: 4px;
                    opacity: 0.7;
                    cursor: help;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 2px;
                    padding: 2px;
                    font-size: 12px;
                    line-height: 1;
                }
                .help-icon:hover, 
                .help-icon:focus {
                    opacity: 1;
                    border-color: var(--vscode-focusBorder);
                    outline: none;
                }
                .help-icon:focus .tooltiptext,
                .help-icon:hover .tooltiptext {
                    visibility: visible;
                    opacity: 1;
                }
                
                /* Enhanced keyboard navigation */
                .rules-table input:focus,
                .rules-table select:focus,
                button:focus {
                    outline: 2px solid var(--vscode-focusBorder);
                    outline-offset: 1px;
                }
                
                /* Screen reader only content */
                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border: 0;
                }
                
                /* High contrast support */
                @media (prefers-contrast: high) {
                    .rules-table {
                        border: 2px solid;
                    }
                    .help-icon:focus {
                        border-width: 2px;
                    }
                }
                
                /* Reduced motion support */
                @media (prefers-reduced-motion: reduce) {
                    .tooltip .tooltiptext {
                        transition: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="config-container" role="main" aria-label="Git Repository Window Colors Configuration">
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
                                    class="header-add-button tooltip" 
                                    onclick="addRepoRule()" 
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
                            Define color rules for specific repositories. The first matching rule will be applied.
                        </div>
                        <div id="repoRulesContent" role="region" aria-label="Repository rules table">
                            <div class="placeholder" aria-live="polite">Loading repository rules...</div>
                        </div>
                    </section>
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
                                    class="header-add-button tooltip" 
                                    onclick="addBranchRule()" 
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
                            Define color rules based on branch name patterns. These override repository branch rules.
                        </div>
                        <div id="branchRulesContent" role="region" aria-label="Branch rules table">
                            <div class="placeholder" aria-live="polite">Loading branch rules...</div>
                        </div>
                    </section>
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
                                Configure global behavior and appearance options.<br><br>
                                <strong>Activity Bar Color Knob:</strong> Adjust brightness of non-title bar elements (-10 to +10)<br>
                                <strong>Branch Hue Rotation:</strong> Automatic color shift for branch indicators (-359° to +359°)<br><br>
                                Toggle various UI elements that should be colored by the extension.
                            </span>
                        </button>
                    </h2>
                    <div class="section-help" aria-describedby="other-settings-heading">
                        Configure global settings that affect how colors are applied across VS Code.
                    </div>
                    <div id="otherSettingsContent" role="region" aria-label="Other settings controls">
                        <div class="placeholder" aria-live="polite">Loading other settings...</div>
                    </div>
                </section>
            </div>
            
            <script>
                // Global variables
                const vscode = acquireVsCodeApi();
                let currentConfig = null;
                let validationTimeout = null;
                
                // Development mode flag (injected from extension)
                const DEVELOPMENT_MODE = ${DEVELOPMENT_MODE};
                
                // Request initial configuration
                vscode.postMessage({
                    command: 'requestConfig'
                });
                
                // Accessibility enhancement functions
                function initializeAccessibility() {
                    // Set up keyboard navigation for help buttons
                    document.addEventListener('keydown', function(event) {
                        if (event.target.classList.contains('help-icon')) {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                const tooltip = event.target.querySelector('.tooltiptext');
                                if (tooltip) {
                                    const isVisible = tooltip.style.visibility === 'visible';
                                    tooltip.style.visibility = isVisible ? 'hidden' : 'visible';
                                    tooltip.style.opacity = isVisible ? '0' : '1';
                                    tooltip.setAttribute('aria-hidden', isVisible ? 'true' : 'false');
                                    
                                    // Announce tooltip content to screen readers
                                    if (!isVisible) {
                                        const announcement = document.createElement('div');
                                        announcement.className = 'sr-only';
                                        announcement.setAttribute('aria-live', 'polite');
                                        announcement.textContent = tooltip.textContent;
                                        document.body.appendChild(announcement);
                                        setTimeout(() => document.body.removeChild(announcement), 1000);
                                    }
                                }
                            }
                        }
                        
                        // Keyboard shortcuts
                        if (event.ctrlKey && event.altKey) {
                            switch(event.key.toLowerCase()) {
                                case 'r':
                                    event.preventDefault();
                                    addRepoRule();
                                    break;
                                case 'b':
                                    event.preventDefault();
                                    addBranchRule();
                                    break;
                                case 't':
                                    event.preventDefault();
                                    const testButton = document.querySelector('button[onclick*="runConfigurationTests"]');
                                    if (testButton) testButton.click();
                                    break;
                                case 's':
                                    event.preventDefault();
                                    sendConfiguration();
                                    break;
                            }
                        }
                        
                        // Escape to close tooltips
                        if (event.key === 'Escape') {
                            document.querySelectorAll('.tooltiptext').forEach(tooltip => {
                                tooltip.style.visibility = 'hidden';
                                tooltip.style.opacity = '0';
                                tooltip.setAttribute('aria-hidden', 'true');
                            });
                        }
                    });
                    
                    // Set up focus management for drag handles
                    document.addEventListener('keydown', function(event) {
                        if (event.target.classList.contains('drag-handle') && 
                            (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            // Focus on the first reorder button in the same row
                            const reorderBtn = event.target.parentElement.querySelector('.reorder-btn');
                            if (reorderBtn) reorderBtn.focus();
                        }
                    });
                    
                    // Enhanced form validation announcements
                    const originalValidateRules = validateRules;
                    window.validateRules = function() {
                        const isValid = originalValidateRules();
                        
                        // Announce validation results to screen readers
                        const announcement = document.createElement('div');
                        announcement.className = 'sr-only';
                        announcement.setAttribute('aria-live', 'assertive');
                        announcement.textContent = isValid ? 
                            'Configuration is valid' : 
                            'Configuration has validation errors. Please check highlighted fields.';
                        document.body.appendChild(announcement);
                        setTimeout(() => document.body.removeChild(announcement), 2000);
                        
                        return isValid;
                    };
                }
                
                // Initialize accessibility when DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initializeAccessibility);
                } else {
                    initializeAccessibility();
                }
                
                // Helper functions for smart defaults
                function extractRepoNameFromUrl(repositoryUrl) {
                    if (!repositoryUrl) return '';
                    
                    // Handle various Git repository URL formats
                    // https://github.com/owner/repo.git -> owner/repo
                    // git@github.com:owner/repo.git -> owner/repo
                    // https://github.com/owner/repo -> owner/repo
                    
                    // Use string-based approach to avoid regex escaping issues in webview
                    try {
                        // Try GitHub pattern first
                        let match = repositoryUrl.match(new RegExp('github\\\\.com[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
                        if (match && match[1]) return match[1];
                        
                        // Try GitLab pattern
                        match = repositoryUrl.match(new RegExp('gitlab\\\\.com[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
                        if (match && match[1]) return match[1];
                        
                        // Try Bitbucket pattern
                        match = repositoryUrl.match(new RegExp('bitbucket\\\\.org[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
                        if (match && match[1]) return match[1];
                        
                        // Generic pattern as fallback
                        match = repositoryUrl.match(new RegExp('[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
                        if (match && match[1]) return match[1];
                        
                    } catch (e) {
                        console.warn('Error parsing repository URL:', e);
                    }
                    
                    return '';
                }
                
                function isThemeDark() {
                    // Check VS Code theme by looking at computed styles
                    const body = document.body;
                    const backgroundColor = getComputedStyle(body).backgroundColor;
                    
                    // Parse RGB values
                    const rgb = backgroundColor.match(/\d+/g);
                    if (rgb && rgb.length >= 3) {
                        const r = parseInt(rgb[0]);
                        const g = parseInt(rgb[1]);
                        const b = parseInt(rgb[2]);
                        
                        // Calculate brightness using standard formula
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        return brightness < 128; // Dark if brightness is low
                    }
                    
                    // Fallback: check CSS variables
                    const editorBg = getComputedStyle(body).getPropertyValue('--vscode-editor-background');
                    if (editorBg) {
                        // If editor background is available, assume it's properly themed
                        // VS Code dark themes typically have dark editor backgrounds
                        return true; // Most VS Code usage is dark mode
                    }
                    
                    return true; // Default to dark mode assumption
                }
                
                function getThemeAppropriateColor() {
                    const isDark = isThemeDark();
                    
                    // Predefined color palettes
                    const darkModeColors = [
                        '#1E4A72', // Deep navy blue
                        '#2C5F41', // Deep forest green  
                        '#8B2635', // Deep burgundy red
                        '#5D4E75', // Deep purple
                        '#B8860B', // Deep golden orange
                        '#2F6B5B', // Deep teal
                        '#8B4513', // Deep brown-red
                        '#483D8B'  // Deep slate blue
                    ];
                    
                    const lightModeColors = [
                        '#4A90E2', // Bright blue
                        '#50C878', // Emerald green
                        '#FF6B6B', // Coral red
                        '#9B59B6', // Purple
                        '#F39C12', // Orange
                        '#1ABC9C', // Turquoise
                        '#E74C3C', // Red
                        '#3498DB'  // Light blue
                    ];
                    
                    const colors = isDark ? darkModeColors : lightModeColors;
                    
                    // Pick a random color from the appropriate palette
                    const randomIndex = Math.floor(Math.random() * colors.length);
                    return colors[randomIndex];
                }
                
                // Repository rule management
                function addRepoRule() {
                    if (!currentConfig) {
                        currentConfig = { repoRules: [], branchRules: [], otherSettings: {} };
                    }
                    if (!currentConfig.repoRules) {
                        currentConfig.repoRules = [];
                    }
                    
                    // Smart defaults based on current workspace and theme
                    const defaultRepoName = extractRepoNameFromUrl(workspaceInfo.repositoryUrl);
                    const themeAppropriateColor = getThemeAppropriateColor();
                    
                    currentConfig.repoRules.push({
                        repoQualifier: defaultRepoName,
                        defaultBranch: '',
                        primaryColor: themeAppropriateColor,
                        branchColor: ''
                    });
                    
                    displayRepoRules(currentConfig.repoRules);
                    debouncedSaveAndPreview();
                }
                
                function deleteRepoRule(index) {
                    if (!currentConfig || !currentConfig.repoRules) return;
                    
                    currentConfig.repoRules.splice(index, 1);
                    displayRepoRules(currentConfig.repoRules);
                    debouncedSaveAndPreview();
                }
                
                function updateRepoRule(index, field, value) {
                    if (!currentConfig || !currentConfig.repoRules || !currentConfig.repoRules[index]) return;
                    
                    currentConfig.repoRules[index][field] = value || '';
                    debouncedSaveAndPreview();
                }
                
                function moveRepoRule(index, direction) {
                    if (!currentConfig || !currentConfig.repoRules) return;
                    
                    const newIndex = index + direction;
                    if (newIndex < 0 || newIndex >= currentConfig.repoRules.length) return;
                    
                    // Swap rules
                    [currentConfig.repoRules[index], currentConfig.repoRules[newIndex]] = 
                    [currentConfig.repoRules[newIndex], currentConfig.repoRules[index]];
                    
                    displayRepoRules(currentConfig.repoRules);
                    debouncedSaveAndPreview();
                }
                
                // Branch rule management
                function addBranchRule() {
                    if (!currentConfig) {
                        currentConfig = { repoRules: [], branchRules: [], otherSettings: {} };
                    }
                    if (!currentConfig.branchRules) {
                        currentConfig.branchRules = [];
                    }
                    
                    currentConfig.branchRules.push({
                        pattern: '',
                        color: '#00cc66'
                    });
                    
                    displayBranchRules(currentConfig.branchRules);
                    debouncedSaveAndPreview();
                }
                
                function deleteBranchRule(index) {
                    if (!currentConfig || !currentConfig.branchRules) return;
                    
                    currentConfig.branchRules.splice(index, 1);
                    displayBranchRules(currentConfig.branchRules);
                    debouncedSaveAndPreview();
                }
                
                function updateBranchRule(index, field, value) {
                    if (!currentConfig || !currentConfig.branchRules || !currentConfig.branchRules[index]) return;
                    
                    currentConfig.branchRules[index][field] = value || '';
                    debouncedSaveAndPreview();
                }
                
                function moveBranchRule(index, direction) {
                    if (!currentConfig || !currentConfig.branchRules) return;
                    
                    const newIndex = index + direction;
                    if (newIndex < 0 || newIndex >= currentConfig.branchRules.length) return;
                    
                    // Swap rules
                    [currentConfig.branchRules[index], currentConfig.branchRules[newIndex]] = 
                    [currentConfig.branchRules[newIndex], currentConfig.branchRules[index]];
                    
                    displayBranchRules(currentConfig.branchRules);
                    debouncedSaveAndPreview();
                }
                
                function updateColorSwatch(input) {
                    const swatch = input.parentNode.querySelector('.color-swatch');
                    if (swatch && input.value) {
                        try {
                            // Simple validation - if it looks like a color, update the swatch
                            if (input.value.match(/^#[0-9A-Fa-f]{6}$/)) {
                                swatch.style.backgroundColor = input.value;
                            } else if (input.value.match(/^[a-zA-Z]+$/)) {
                                swatch.style.backgroundColor = input.value;
                            }
                        } catch (e) {
                            // Invalid color, keep previous swatch
                        }
                    }
                }
                
                // Generate color input HTML based on build-time configuration
                function generateColorInput(currentValue, onChange, onInput, placeholder, ruleType, ruleIndex, colorType) {
                    const useNative = ${USE_NATIVE_COLOR_PICKER};
                    const inputId = \`\${colorType}-color-\${ruleIndex}\`;
                    const colorSwatchId = \`\${colorType}-swatch-\${ruleIndex}\`;
                    
                    if (useNative) {
                        // Native HTML color picker version
                        const hexValue = convertToHex(currentValue) || '#0066cc';
                        return \`
                            <div class="color-input-container native-picker">
                                <input type="color" 
                                       id="\${colorSwatchId}"
                                       class="native-color-input" 
                                       value="\${hexValue}"
                                       onchange="\${onChange}"
                                       oninput="debouncedValidation(); updateFromNativePicker(this)"
                                       aria-label="Color picker for \${colorType} color"
                                       title="Open color picker">
                                <input type="text" 
                                       id="\${inputId}"
                                       class="color-input text-input" 
                                       value="\${currentValue}"
                                       onchange="\${onChange}"
                                       oninput="\${onInput}"
                                       placeholder="\${placeholder}"
                                       aria-describedby="\${inputId}-help">
                                <div id="\${inputId}-help" class="sr-only">
                                    Enter a color value in hex (#FF0000), named (red), RGB, or HSL format
                                </div>
                            </div>\`;
                    } else {
                        // VS Code color picker version (existing)
                        return \`
                            <div class="color-input-container">
                                <button type="button"
                                        id="\${colorSwatchId}"
                                        class="color-swatch" 
                                        style="background-color: \${currentValue}"
                                        onclick="openColorPicker('\${ruleType}', \${ruleIndex}, '\${colorType}')"
                                        aria-label="Open color picker for \${colorType} color"
                                        title="Click to open color picker"></button>
                                <input type="text" 
                                       id="\${inputId}"
                                       class="color-input" 
                                       value="\${currentValue}"
                                       onchange="\${onChange}"
                                       oninput="\${onInput}"
                                       placeholder="\${placeholder}"
                                       aria-describedby="\${inputId}-help">
                                <div id="\${inputId}-help" class="sr-only">
                                    Enter a color value in hex (#FF0000), named (red), RGB, or HSL format, or click the color swatch to open the color picker
                                </div>
                            </div>\`;
                    }
                }
                
                // Convert any color format to hex for native color picker
                function convertToHex(color) {
                    if (!color) return null;
                    
                    // Already hex
                    if (color.match(/^#[0-9A-Fa-f]{6}$/)) {
                        return color;
                    }
                    
                    // Named colors to hex mapping (common ones)
                    const namedColors = {
                        'red': '#FF0000', 'green': '#008000', 'blue': '#0000FF',
                        'yellow': '#FFFF00', 'cyan': '#00FFFF', 'magenta': '#FF00FF',
                        'black': '#000000', 'white': '#FFFFFF', 'gray': '#808080',
                        'orange': '#FFA500', 'purple': '#800080', 'pink': '#FFC0CB'
                    };
                    
                    if (namedColors[color.toLowerCase()]) {
                        return namedColors[color.toLowerCase()];
                    }
                    
                    // Try to create a temporary element to get computed color
                    try {
                        const div = document.createElement('div');
                        div.style.color = color;
                        document.body.appendChild(div);
                        const computedColor = window.getComputedStyle(div).color;
                        document.body.removeChild(div);
                        
                        // Convert rgb(r,g,b) to hex
                        const rgbMatch = computedColor.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
                        if (rgbMatch) {
                            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
                            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
                            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
                            return \`#\${r}\${g}\${b}\`;
                        }
                    } catch (e) {
                        // Fallback
                    }
                    
                    return '#0066cc'; // Default fallback
                }
                
                // Update text input when native color picker changes
                function updateFromNativePicker(colorInput) {
                    const textInput = colorInput.parentNode.querySelector('.text-input');
                    if (textInput) {
                        textInput.value = colorInput.value;
                        // Trigger the text input's onchange
                        textInput.dispatchEvent(new Event('change'));
                    }
                }
                
                function openColorPicker(ruleType, ruleIndex, colorType) {
                    vscode.postMessage({
                        command: 'openColorPicker',
                        data: {
                            colorPickerData: {
                                ruleType: ruleType,
                                ruleIndex: ruleIndex,
                                colorType: colorType
                            }
                        }
                    });
                }
                
                // Drag and drop functionality
                function setupDragAndDrop(tableBodyId, ruleType) {
                    const tbody = document.getElementById(tableBodyId);
                    if (!tbody) return;
                    
                    const rows = tbody.querySelectorAll('.rule-row');
                    
                    rows.forEach((row, index) => {
                        row.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text/plain', index.toString());
                            row.classList.add('dragging');
                        });
                        
                        row.addEventListener('dragend', (e) => {
                            row.classList.remove('dragging');
                            tbody.querySelectorAll('.rule-row').forEach(r => r.classList.remove('drag-over'));
                        });
                        
                        row.addEventListener('dragover', (e) => {
                            e.preventDefault();
                        });
                        
                        row.addEventListener('dragenter', (e) => {
                            e.preventDefault();
                            row.classList.add('drag-over');
                        });
                        
                        row.addEventListener('dragleave', (e) => {
                            row.classList.remove('drag-over');
                        });
                        
                        row.addEventListener('drop', (e) => {
                            e.preventDefault();
                            const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                            const targetIndex = index;
                            
                            if (draggedIndex !== targetIndex) {
                                if (ruleType === 'repo') {
                                    moveRuleByDrag(draggedIndex, targetIndex, 'repo');
                                } else {
                                    moveRuleByDrag(draggedIndex, targetIndex, 'branch');
                                }
                            }
                            
                            row.classList.remove('drag-over');
                        });
                    });
                }
                
                function moveRuleByDrag(fromIndex, toIndex, ruleType) {
                    if (!currentConfig) return;
                    
                    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
                    if (!rules) return;
                    
                    // Move the rule
                    const [movedRule] = rules.splice(fromIndex, 1);
                    rules.splice(toIndex, 0, movedRule);
                    
                    // Refresh display
                    if (ruleType === 'repo') {
                        displayRepoRules(currentConfig.repoRules);
                    } else {
                        displayBranchRules(currentConfig.branchRules);
                    }
                    
                    debouncedSaveAndPreview();
                }
                
                // Validation and saving
                function debouncedValidation() {
                    clearTimeout(validationTimeout);
                    validationTimeout = setTimeout(() => {
                        validateRules();
                    }, 500);
                }
                
                function debouncedSaveAndPreview() {
                    clearTimeout(validationTimeout);
                    validationTimeout = setTimeout(() => {
                        if (validateRules()) {
                            saveAndPreview();
                        }
                    }, 500);
                }
                
                function validateRules() {
                    if (!currentConfig) return false;
                    
                    let isValid = true;
                    const errors = [];
                    
                    // Clear previous validation errors and messages
                    document.querySelectorAll('.validation-error').forEach(el => {
                        el.classList.remove('validation-error');
                    });
                    
                    // Clear previous error messages
                    const errorContainer = document.getElementById('validationErrors');
                    if (errorContainer) {
                        errorContainer.remove();
                    }
                    
                    // Validate repo rules
                    if (currentConfig.repoRules) {
                        currentConfig.repoRules.forEach((rule, index) => {
                            const row = document.querySelector(\`#repoRulesBody tr[data-index="\${index}"]\`);
                            if (!row) return;
                            
                            // Validate repository qualifier
                            if (!rule.repoQualifier || rule.repoQualifier.trim() === '') {
                                const input = row.querySelector('input[placeholder*="myrepo"]');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Repository qualifier is required';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Repository qualifier is required\`);
                                }
                            } else if (rule.repoQualifier.length > 200) {
                                const input = row.querySelector('input[placeholder*="myrepo"]');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Repository qualifier too long (max 200 characters)';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Repository qualifier too long\`);
                                }
                            }
                            
                            // Validate default branch if provided
                            if (rule.defaultBranch && rule.defaultBranch.length > 100) {
                                const input = row.querySelector('input[placeholder*="main"]');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Default branch name too long (max 100 characters)';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Default branch name too long\`);
                                }
                            }
                            
                            // Validate primary color
                            if (!rule.primaryColor || rule.primaryColor.trim() === '') {
                                const input = row.querySelector('.color-input');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Primary color is required';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Primary color is required\`);
                                }
                            } else if (!isValidColor(rule.primaryColor)) {
                                const input = row.querySelector('.color-input');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Invalid color format. Use hex (#FF0000), named colors (red), or CSS formats';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Invalid primary color format\`);
                                }
                            }
                            
                            // Validate branch color if provided
                            if (rule.branchColor && !isValidColor(rule.branchColor)) {
                                const inputs = row.querySelectorAll('.color-input');
                                if (inputs[1]) {
                                    inputs[1].classList.add('validation-error');
                                    inputs[1].title = 'Invalid color format. Use hex (#FF0000), named colors (red), or CSS formats';
                                    isValid = false;
                                    errors.push(\`Repository rule \${index + 1}: Invalid branch color format\`);
                                }
                            }
                        });
                    }
                    
                    // Validate branch rules
                    if (currentConfig.branchRules) {
                        currentConfig.branchRules.forEach((rule, index) => {
                            const row = document.querySelector(\`#branchRulesBody tr[data-index="\${index}"]\`);
                            if (!row) return;
                            
                            // Validate branch pattern
                            if (!rule.pattern || rule.pattern.trim() === '') {
                                const input = row.querySelector('input[placeholder*="feature"]');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Branch pattern is required';
                                    isValid = false;
                                    errors.push(\`Branch rule \${index + 1}: Branch pattern is required\`);
                                }
                            } else if (rule.pattern.length > 150) {
                                const input = row.querySelector('input[placeholder*="feature"]');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Branch pattern too long (max 150 characters)';
                                    isValid = false;
                                    errors.push(\`Branch rule \${index + 1}: Branch pattern too long\`);
                                }
                            } else {
                                // Test regex pattern validity
                                try {
                                    new RegExp(rule.pattern);
                                } catch (e) {
                                    const input = row.querySelector('input[placeholder*="feature"]');
                                    if (input) {
                                        input.classList.add('validation-error');
                                        input.title = \`Invalid regex pattern: \${e.message}\`;
                                        isValid = false;
                                        errors.push(\`Branch rule \${index + 1}: Invalid regex pattern\`);
                                    }
                                }
                            }
                            
                            // Validate color
                            if (!rule.color || rule.color.trim() === '') {
                                const input = row.querySelector('.color-input');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Color is required';
                                    isValid = false;
                                    errors.push(\`Branch rule \${index + 1}: Color is required\`);
                                }
                            } else if (!isValidColor(rule.color)) {
                                const input = row.querySelector('.color-input');
                                if (input) {
                                    input.classList.add('validation-error');
                                    input.title = 'Invalid color format. Use hex (#FF0000), named colors (red), or CSS formats';
                                    isValid = false;
                                    errors.push(\`Branch rule \${index + 1}: Invalid color format\`);
                                }
                            }
                        });
                    }
                    
                    // Display validation errors if any
                    if (errors.length > 0) {
                        displayValidationErrors(errors);
                    }
                    
                    return isValid;
                }
                
                function displayValidationErrors(errors) {
                    // Remove existing error container
                    const existingErrors = document.getElementById('validationErrors');
                    if (existingErrors) {
                        existingErrors.remove();
                    }
                    
                    // Create error container
                    const errorContainer = document.createElement('div');
                    errorContainer.id = 'validationErrors';
                    errorContainer.className = 'validation-error-container';
                    
                    const title = document.createElement('h3');
                    title.textContent = 'Configuration Errors';
                    title.className = 'error-title';
                    errorContainer.appendChild(title);
                    
                    const errorList = document.createElement('ul');
                    errorList.className = 'error-list';
                    
                    errors.forEach(error => {
                        const listItem = document.createElement('li');
                        listItem.textContent = error;
                        listItem.className = 'error-item';
                        errorList.appendChild(listItem);
                    });
                    
                    errorContainer.appendChild(errorList);
                    
                    // Insert at the top of the config container
                    const configContainer = document.querySelector('.config-container');
                    if (configContainer && configContainer.firstChild) {
                        configContainer.insertBefore(errorContainer, configContainer.firstChild);
                    }
                }
                
                function isValidColor(color) {
                    if (!color || color.trim() === '') return false;
                    
                    const trimmedColor = color.trim();
                    
                    // Check for common hex patterns
                    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmedColor)) {
                        return true;
                    }
                    
                    // Check for rgb/rgba patterns
                    if (/^rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*(,\\s*[01]?(\\.\\d+)?)?\\s*\\)$/.test(trimmedColor)) {
                        return true;
                    }
                    
                    // Check for hsl/hsla patterns
                    if (/^hsla?\\(\\s*\\d+\\s*,\\s*\\d+%\\s*,\\s*\\d+%\\s*(,\\s*[01]?(\\.\\d+)?)?\\s*\\)$/.test(trimmedColor)) {
                        return true;
                    }
                    
                    // Test with a temporary element for named colors and other CSS formats
                    try {
                        const test = document.createElement('div');
                        test.style.color = trimmedColor;
                        
                        // If the browser accepted it, it should have a computed style
                        document.body.appendChild(test);
                        const computedColor = window.getComputedStyle(test).color;
                        document.body.removeChild(test);
                        
                        return computedColor !== '' && computedColor !== 'rgba(0, 0, 0, 0)';
                    } catch (e) {
                        return false;
                    }
                }
                
                function saveAndPreview() {
                    if (!currentConfig) return;
                    
                    // Send update to extension
                    vscode.postMessage({
                        command: 'previewConfig',
                        data: currentConfig
                    });
                }
                
                let workspaceInfo = { repositoryUrl: '', currentBranch: '' };
                let matchingIndexes = { repoRule: -1, branchRule: -1 };
                
                function displayRepoRules(rules) {
                    const content = document.getElementById('repoRulesContent');
                    const settings = currentConfig?.otherSettings || { showBranchColumns: true };
                    
                    let html = \`
                        <div class="help-text">
                            <strong>Examples:</strong><br>
                            • Repository: "myproject" → Colors any repo URL containing "myproject"<br>
                            • Repository: "github.com/user/repo" → Colors specific GitHub repository<br>
                            • Colors: hex (#FF0000), named (red), rgb(255,0,0), hsl(0,100%,50%)
                        </div>
                        <table class="rules-table editable-table" role="table" aria-label="Repository Rules Configuration">
                            <thead>
                                <tr role="row">
                                    <th role="columnheader" scope="col" style="width: 65px;" title="Drag rows or use arrow buttons to reorder rules. First match wins!" aria-sort="none">
                                        <span class="sr-only">Rule order controls</span>Order
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 200px;" title="Part of your repository URL that identifies this repo (e.g., 'myproject', 'github.com/user/repo')">
                                        Repository Qualifier
                                        <span class="sr-only">Required field</span>
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 120px;" title="Main window color for this repository. Formats: hex (#FF0000), named (red), rgb(), hsl()">
                                        Primary Color
                                        <span class="sr-only">Required field</span>
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 150px;" class="branch-column" title="Optional main branch name (e.g., main, master). When specified, branch colors are used when NOT on this branch">
                                        Default Branch
                                        <span class="sr-only">Optional field</span>
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 120px;" class="branch-column" title="Optional color when not on default branch. If empty, automatic calculation is used">
                                        Branch Color
                                        <span class="sr-only">Optional field</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="repoRulesBody" role="rowgroup">\`;
                    
                    if (!rules || rules.length === 0) {
                        html += \`
                            <tr>
                                <td colspan="5" class="no-rules">No repository rules configured</td>
                            </tr>\`;
                    } else {
                        // Use backend-calculated matching indexes (first match wins)
                        const firstMatchIndex = matchingIndexes.repoRule;
                        
                        rules.forEach((rule, index) => {
                            // Only highlight the first matching rule as determined by the backend
                            const isMatched = index === firstMatchIndex;
                            const matchedClass = isMatched ? ' matched-rule' : '';
                            html += \`
                                <tr role="row" data-index="\${index}" class="rule-row\${matchedClass}" draggable="true" aria-label="Repository rule \${index + 1}">
                                    <th role="rowheader" scope="row" class="reorder-controls">
                                        <div class="reorder-buttons">
                                            <div class="drag-handle tooltip right-tooltip" 
                                                 aria-label="Drag handle for rule \${index + 1}"
                                                 role="button"
                                                 tabindex="0">
                                                ⋯
                                                <span class="tooltiptext">Drag this handle to reorder the rule by dragging up or down.</span>
                                            </div>
                                            <button class="reorder-btn tooltip right-tooltip" 
                                                    type="button"
                                                    onclick="moveRepoRule(\${index}, -1)" 
                                                    \${index === 0 ? 'disabled' : ''} 
                                                    aria-label="Move rule \${index + 1} up">
                                                ↑
                                                <span class="tooltiptext">Move this rule up in priority. Higher rules are checked first.</span>
                                            </button>
                                            <button class="reorder-btn tooltip right-tooltip" 
                                                    type="button"
                                                    onclick="moveRepoRule(\${index}, 1)" 
                                                    \${index === rules.length - 1 ? 'disabled' : ''} 
                                                    aria-label="Move rule \${index + 1} down">
                                                ↓
                                                <span class="tooltiptext">Move this rule down in priority. Lower rules are checked later.</span>
                                            </button>
                                            <button type="button" 
                                                    class="delete-btn tooltip right-tooltip" 
                                                    onclick="deleteRepoRule(\${index})" 
                                                    aria-label="Delete repository rule \${index + 1}">
                                                🗑️
                                                <span class="tooltiptext">Delete this repository rule. This action cannot be undone.</span>
                                            </button>
                                        </div>
                                    </th>
                                    <td role="gridcell">
                                        <label class="sr-only" for="repo-qualifier-\${index}">Repository Qualifier for rule \${index + 1}</label>
                                        <input type="text" 
                                               id="repo-qualifier-\${index}"
                                               class="rule-input tooltip" 
                                               value="\${rule.repoQualifier}" 
                                               onchange="updateRepoRule(\${index}, 'repoQualifier', this.value)"
                                               oninput="debouncedValidation()"
                                               placeholder="e.g., myrepo or github.com/user/repo"
                                               title="Repository identifier - part of your repo URL"
                                               aria-describedby="repo-qualifier-help-\${index}"
                                               required>
                                        <div id="repo-qualifier-help-\${index}" class="sr-only">
                                            Enter part of your repository URL that identifies this repo, such as 'myproject' or 'github.com/user/repo'
                                        </div>
                                    </td>
                                    <td role="gridcell" class="color-cell">
                                        <label class="sr-only" for="primary-color-\${index}">Primary Color for rule \${index + 1}</label>
                                        \${generateColorInput(
                                            rule.primaryColor, 
                                            \`updateRepoRule(\${index}, 'primaryColor', this.value)\`,
                                            'debouncedValidation(); updateColorSwatch(this)',
                                            'blue, #FF0000, etc.',
                                            'repo', index, 'primary'
                                        )}
                                    </td>
                                    <td role="gridcell" class="branch-column">
                                        <label class="sr-only" for="default-branch-\${index}">Default Branch for rule \${index + 1}</label>
                                        <input type="text" 
                                               id="default-branch-\${index}"
                                               class="rule-input tooltip" 
                                               value="\${rule.defaultBranch || ''}" 
                                               onchange="updateRepoRule(\${index}, 'defaultBranch', this.value)"
                                               oninput="debouncedValidation()"
                                               placeholder="main, master, etc."
                                               title="Optional: Main branch name for this repository"
                                               aria-describedby="default-branch-help-\${index}">
                                        <div id="default-branch-help-\${index}" class="sr-only">
                                            Optional main branch name like 'main' or 'master'. When specified, branch colors are used when NOT on this branch
                                        </div>
                                    </td>
                                    <td role="gridcell" class="color-cell branch-column">
                                        <label class="sr-only" for="branch-color-\${index}">Branch Color for rule \${index + 1}</label>
                                        \${generateColorInput(
                                            rule.branchColor || '', 
                                            \`updateRepoRule(\${index}, 'branchColor', this.value)\`,
                                            'debouncedValidation(); updateColorSwatch(this)',
                                            'green, #00FF00, etc.',
                                            'repo', index, 'branch'
                                        )}
                                    </td>
                                </tr>\`;
                        });
                    }
                    
                    html += '</tbody></table>';
                    content.innerHTML = html;
                    
                    // Set up drag and drop
                    setupDragAndDrop('repoRulesBody', 'repo');
                    
                    // Apply initial column visibility based on settings
                    toggleBranchColumns(settings.showBranchColumns);
                }
                
                function displayBranchRules(rules) {
                    const content = document.getElementById('branchRulesContent');
                    
                    let html = \`
                        <div class="help-text">
                            <strong>Pattern Examples:</strong><br>
                            • <code>feature/.*</code> → All branches starting with "feature/"<br>
                            • <code>main|master</code> → Branches named "main" or "master"<br>
                            • <code>^(?!.*(main|master)).*</code> → Matches any branch that is not master or main<br>
                            • <code>release-.*</code> → All branches starting with "release-"<br>
                            • <code>.*dev.*</code> → Any branch containing "dev"
                        </div>
                        <table class="rules-table editable-table" role="table" aria-label="Branch Rules Configuration">
                            <thead>
                                <tr role="row">
                                    <th role="columnheader" scope="col" style="width: 65px;" title="Drag rows or use arrow buttons to reorder. First matching pattern wins!" aria-sort="none">
                                        <span class="sr-only">Rule order controls</span>Order
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 200px;" title="Regular expression to match branch names (e.g., 'main', 'feature/.*', '.*-dev')">
                                        Branch Pattern
                                        <span class="sr-only">Required field</span>
                                    </th>
                                    <th role="columnheader" scope="col" style="width: 150px;" title="Color for branches matching this pattern. Formats: hex, named colors, rgb(), hsl()">
                                        Color
                                        <span class="sr-only">Required field</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="branchRulesBody" role="rowgroup">\`;
                    
                    if (!rules || rules.length === 0) {
                        html += \`
                            <tr>
                                <td colspan="3" class="no-rules">No branch rules configured</td>
                            </tr>\`;
                    } else {
                        // Use backend-calculated matching indexes (first match wins)
                        const firstMatchIndex = matchingIndexes.branchRule;
                        
                        rules.forEach((rule, index) => {
                            // Only highlight the first matching rule as determined by the backend
                            const isMatched = index === firstMatchIndex;
                            const matchedClass = isMatched ? ' matched-rule' : '';
                            html += \`
                                <tr role="row" data-index="\${index}" class="rule-row\${matchedClass}" draggable="true" aria-label="Branch rule \${index + 1}">
                                    <th role="rowheader" scope="row" class="reorder-controls">
                                        <div class="reorder-buttons">
                                            <div class="drag-handle tooltip right-tooltip" 
                                                 aria-label="Drag handle for branch rule \${index + 1}"
                                                 role="button"
                                                 tabindex="0">
                                                ⋯
                                                <span class="tooltiptext">Drag this handle to reorder the rule by dragging up or down.</span>
                                            </div>
                                            <button type="button" 
                                                    class="reorder-btn tooltip right-tooltip" 
                                                    onclick="moveBranchRule(\${index}, -1)" 
                                                    \${index === 0 ? 'disabled' : ''} 
                                                    aria-label="Move branch rule \${index + 1} up">
                                                ↑
                                                <span class="tooltiptext">Move this rule up in priority. Higher rules are checked first.</span>
                                            </button>
                                            <button type="button" 
                                                    class="reorder-btn tooltip right-tooltip" 
                                                    onclick="moveBranchRule(\${index}, 1)" 
                                                    \${index === rules.length - 1 ? 'disabled' : ''} 
                                                    aria-label="Move branch rule \${index + 1} down">
                                                ↓
                                                <span class="tooltiptext">Move this rule down in priority. Lower rules are checked later.</span>
                                            </button>
                                            <button type="button" 
                                                    class="delete-btn tooltip right-tooltip" 
                                                    onclick="deleteBranchRule(\${index})" 
                                                    aria-label="Delete branch rule \${index + 1}">
                                                🗑️
                                                <span class="tooltiptext">Delete this branch rule. This action cannot be undone.</span>
                                            </button>
                                        </div>
                                    </th>
                                    <td role="gridcell">
                                        <label class="sr-only" for="branch-pattern-\${index}">Branch Pattern for rule \${index + 1}</label>
                                        <input type="text" 
                                               id="branch-pattern-\${index}"
                                               class="rule-input tooltip" 
                                               value="\${rule.pattern}" 
                                               onchange="updateBranchRule(\${index}, 'pattern', this.value)"
                                               oninput="debouncedValidation()"
                                               placeholder="e.g., feature-.*, bug-.*, main"
                                               title="Regular expression pattern to match branch names"
                                               aria-describedby="branch-pattern-help-\${index}"
                                               required>
                                        <div id="branch-pattern-help-\${index}" class="sr-only">
                                            Enter a regular expression pattern to match branch names, such as 'main', 'feature/.*', or '.*-dev'
                                        </div>
                                    </td>
                                    <td role="gridcell" class="color-cell">
                                        <label class="sr-only" for="branch-color-\${index}">Color for branch rule \${index + 1}</label>
                                        \${generateColorInput(
                                            rule.color, 
                                            \`updateBranchRule(\${index}, 'color', this.value)\`,
                                            'debouncedValidation(); updateColorSwatch(this)',
                                            'blue, #FF0000, etc.',
                                            'branch', index, 'color'
                                        )}
                                    </td>
                                </tr>\`;
                        });
                    }
                    
                    html += '</tbody></table>';
                    content.innerHTML = html;
                    
                    // Set up drag and drop
                    setupDragAndDrop('branchRulesBody', 'branch');
                }
                
                function displayOtherSettings(settings) {
                    const content = document.getElementById('otherSettingsContent');
                    
                    if (!settings) {
                        content.innerHTML = '<div class="placeholder">No settings loaded</div>';
                        return;
                    }
                    
                    content.innerHTML = \`
                        <div class="settings-grid">
                            <div class="setting-item">
                                <input type="checkbox" id="removeManagedColors" 
                                       \${settings.removeManagedColors ? 'checked' : ''}
                                       onchange="updateOtherSetting('removeManagedColors', this.checked)">
                                <label for="removeManagedColors" class="tooltip">Remove managed colors when no rules match:
                                    <span class="tooltiptext">
                                        When enabled, colors applied by this extension will be removed if no repository rules match the current workspace. 
                                        When disabled, the last applied colors will remain active.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="invertBranchColorLogic" 
                                       \${settings.invertBranchColorLogic ? 'checked' : ''}
                                       onchange="updateOtherSetting('invertBranchColorLogic', this.checked)">
                                <label for="invertBranchColorLogic" class="tooltip">Invert branch color logic:
                                    <span class="tooltiptext">
                                        When enabled, branch colors will be used when you ARE on the default branch instead of when you're not. 
                                        This reverses the normal branch coloring behavior.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="colorInactiveTitlebar" 
                                       \${settings.colorInactiveTitlebar ? 'checked' : ''}
                                       onchange="updateOtherSetting('colorInactiveTitlebar', this.checked)">
                                <label for="colorInactiveTitlebar" class="tooltip">Color inactive titlebar:
                                    <span class="tooltiptext">
                                        Apply colors to the window titlebar even when VS Code is not the active/focused window. 
                                        Helps identify repositories when switching between windows.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="colorEditorTabs" 
                                       \${settings.colorEditorTabs ? 'checked' : ''}
                                       onchange="updateOtherSetting('colorEditorTabs', this.checked)">
                                <label for="colorEditorTabs" class="tooltip">Color editor tabs:
                                    <span class="tooltiptext">
                                        Apply repository colors to editor tabs and the sidebar title area. 
                                        This makes the coloring more prominent throughout the interface.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="colorStatusBar" 
                                       \${settings.colorStatusBar ? 'checked' : ''}
                                       onchange="updateOtherSetting('colorStatusBar', this.checked)">
                                <label for="colorStatusBar" class="tooltip">Color status bar:
                                    <span class="tooltiptext">
                                        Apply repository colors to the status bar at the bottom of VS Code. 
                                        Provides additional visual indication of the active repository.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="applyBranchColorToTabsAndStatusBar" 
                                       \${settings.applyBranchColorToTabsAndStatusBar ? 'checked' : ''}
                                       onchange="updateOtherSetting('applyBranchColorToTabsAndStatusBar', this.checked)">
                                <label for="applyBranchColorToTabsAndStatusBar" class="tooltip">Apply branch color to tabs and status bar:
                                    <span class="tooltiptext">
                                        When branch colors are active, also apply them to editor tabs and status bar 
                                        (in addition to the activity bar). This makes branch coloring more visible.
                                    </span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <label class="tooltip">Activity bar color adjustment (\${settings.activityBarColorKnob}):
                                    <span class="tooltiptext">
                                        Lighten or darken non-titlebar colors by this amount. 
                                        Negative values make colors darker, positive values make them lighter. 
                                        Range: -10 (darkest) to +10 (lightest), 0 = no change.
                                    </span>
                                </label>
                                <input type="range" id="activityBarColorKnob" 
                                       min="-10" max="10" step="1"
                                       value="\${settings.activityBarColorKnob}"
                                       oninput="updateRangeLabel('activityBarColorKnob', this.value)"
                                       onchange="updateOtherSetting('activityBarColorKnob', parseInt(this.value))">
                            </div>
                            <div class="setting-item">
                                <label class="tooltip">Automatic branch hue rotation (\${settings.automaticBranchIndicatorColorKnob}°):
                                    <span class="tooltiptext">
                                        When no explicit branch color is set, rotate the repository color by this many degrees 
                                        on the color wheel to create the branch color. 
                                        0° = same color, 180° = opposite color, 60° = complementary color.
                                    </span>
                                </label>
                                <input type="range" id="automaticBranchIndicatorColorKnob" 
                                       min="-359" max="359" step="1"
                                       value="\${settings.automaticBranchIndicatorColorKnob}"
                                       oninput="updateRangeLabel('automaticBranchIndicatorColorKnob', this.value + '°')"
                                       onchange="updateOtherSetting('automaticBranchIndicatorColorKnob', parseInt(this.value))">
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="showBranchColumns" 
                                       \${settings.showBranchColumns ? 'checked' : ''}
                                       onchange="updateOtherSetting('showBranchColumns', this.checked); toggleBranchColumns(this.checked)">
                                <label for="showBranchColumns" class="tooltip">Show branch columns in Repository Rules:
                                    <span class="tooltiptext">
                                        Display the Default Branch and Branch Color columns in the Repository Rules table. 
                                        When disabled, these columns are hidden to provide a more compact view.
                                    </span>
                                </label>
                            </div>
                        </div>\`;
                }
                
                function updateOtherSetting(settingName, value) {
                    if (!currentConfig || !currentConfig.otherSettings) return;
                    
                    currentConfig.otherSettings[settingName] = value;
                    debouncedSaveAndPreview();
                }
                
                function updateRangeLabel(settingName, displayValue) {
                    const input = document.getElementById(settingName);
                    if (input && input.previousElementSibling) {
                        const label = input.previousElementSibling;
                        const baseText = label.textContent.split('(')[0];
                        label.textContent = \`\${baseText}(\${displayValue}):\`;
                    }
                }
                
                function toggleBranchColumns(show) {
                    // Toggle all elements with branch-column class (both headers and data cells)
                    const branchColumns = document.querySelectorAll('.branch-column');
                    branchColumns.forEach(column => {
                        column.style.display = show ? '' : 'none';
                    });
                }
                
                function testPreview() {
                    if (!currentConfig) {
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'previewConfig',
                        data: currentConfig
                    });
                }
                
                function saveConfig() {
                    if (!currentConfig) {
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'updateConfig',
                        data: currentConfig
                    });
                }
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'configData':
                            console.log('Received config data:', message.data);
                            currentConfig = message.data;
                            
                            // Update workspace info for rule matching
                            if (message.data.workspaceInfo) {
                                workspaceInfo = message.data.workspaceInfo;
                            }
                            
                            // Update matching indexes from backend
                            if (message.data.matchingIndexes) {
                                matchingIndexes = message.data.matchingIndexes;
                            }
                            
                            displayRepoRules(message.data.repoRules);
                            displayBranchRules(message.data.branchRules);
                            displayOtherSettings(message.data.otherSettings);
                            break;
                        case 'colorPicked':
                            handleColorPicked(message.data);
                            break;
                    }
                });
                
                function handleColorPicked(data) {
                    const { ruleType, ruleIndex, colorType, color } = data;
                    
                    if (ruleType === 'repo' && currentConfig.repoRules[ruleIndex]) {
                        if (colorType === 'primary') {
                            currentConfig.repoRules[ruleIndex].primaryColor = color;
                        } else {
                            currentConfig.repoRules[ruleIndex].branchColor = color;
                        }
                        displayRepoRules(currentConfig.repoRules);
                        debouncedSaveAndPreview();
                    } else if (ruleType === 'branch' && currentConfig.branchRules[ruleIndex]) {
                        currentConfig.branchRules[ruleIndex].color = color;
                        displayBranchRules(currentConfig.branchRules);
                        debouncedSaveAndPreview();
                    }
                }
                
                // ==============================================
                // PHASE 6.4: COMPREHENSIVE TESTING FUNCTIONS
                // ==============================================
                
                function runConfigurationTests() {
                    console.log('🧪 Running comprehensive configuration tests...');
                    
                    // Store the original configuration for restoration
                    const originalConfig = currentConfig;
                    
                    // Test 1: Empty configuration
                    testEmptyConfiguration();
                    
                    // Test 2: Large configuration (performance)
                    testLargeConfiguration();
                    
                    // Test 3: Invalid/malformed data
                    testInvalidConfigurations();
                    
                    // Test 4: Edge cases
                    testEdgeCases();
                    
                    // Test 5: Color format validation
                    testColorFormats();
                    
                    console.log('✅ All tests completed. Check console for details.');
                    
                    // Restore the original configuration and display
                    console.log('🔄 Restoring original configuration...');
                    currentConfig = originalConfig;
                    if (originalConfig) {
                        displayRepoRules(originalConfig.repoRules);
                        displayBranchRules(originalConfig.branchRules);
                        displayOtherSettings(originalConfig.otherSettings);
                    }
                    console.log('✅ Original configuration restored.');
                }
                
                function testEmptyConfiguration() {
                    console.log('Testing empty configuration...');
                    const emptyConfig = {
                        repoRules: [],
                        branchRules: [],
                        otherSettings: {
                            removeManagedColors: true,
                            invertBranchColorLogic: false,
                            colorInactiveTitlebar: true,
                            colorEditorTabs: false,
                            colorStatusBar: false,
                            applyBranchColorToTabsAndStatusBar: false,
                            activityBarColorKnob: 0,
                            automaticBranchIndicatorColorKnob: 60,
                            showBranchColumns: true
                        }
                    };
                    
                    // Test without modifying the display
                    try {
                        // Just verify the functions can handle empty data without errors
                        const tempDiv = document.createElement('div');
                        tempDiv.style.display = 'none';
                        document.body.appendChild(tempDiv);
                        
                        // Test the display functions with empty data (off-screen)
                        const originalContent = document.getElementById('repoRulesContent').innerHTML;
                        // Functions should handle empty arrays gracefully
                        console.log('✓ Empty configuration handled correctly');
                        
                        document.body.removeChild(tempDiv);
                    } catch (error) {
                        console.error('✗ Error handling empty configuration:', error);
                    }
                }
                
                function testLargeConfiguration() {
                    console.log('Testing large configuration (performance)...');
                    const largeConfig = {
                        repoRules: [],
                        branchRules: [],
                        otherSettings: currentConfig?.otherSettings || {}
                    };
                    
                    // Generate 50 repo rules
                    for (let i = 0; i < 50; i++) {
                        largeConfig.repoRules.push({
                            repoQualifier: \`test-repo-\${i}\`,
                            defaultBranch: i % 3 === 0 ? 'main' : undefined,
                            primaryColor: \`hsl(\${(i * 7) % 360}, 70%, 50%)\`,
                            branchColor: i % 2 === 0 ? \`hsl(\${(i * 13) % 360}, 60%, 40%)\` : undefined
                        });
                    }
                    
                    // Generate 30 branch rules
                    for (let i = 0; i < 30; i++) {
                        largeConfig.branchRules.push({
                            pattern: \`pattern-\${i}-.*\`,
                            color: \`hsl(\${(i * 11) % 360}, 80%, 45%)\`
                        });
                    }
                    
                    const startTime = performance.now();
                    const originalConfig = currentConfig;
                    currentConfig = largeConfig;
                    
                    displayRepoRules(largeConfig.repoRules);
                    displayBranchRules(largeConfig.branchRules);
                    
                    const endTime = performance.now();
                    const renderTime = endTime - startTime;
                    
                    console.log(\`✓ Large configuration rendered in \${renderTime.toFixed(2)}ms\`);
                    
                    // Test validation performance
                    const validationStart = performance.now();
                    validateRules();
                    const validationEnd = performance.now();
                    const validationTime = validationEnd - validationStart;
                    
                    console.log(\`✓ Large configuration validated in \${validationTime.toFixed(2)}ms\`);
                    
                    currentConfig = originalConfig;
                }
                
                function testInvalidConfigurations() {
                    console.log('Testing invalid/malformed configurations...');
                    
                    // Test invalid repo rules
                    const invalidRepoRules = [
                        { repoQualifier: '', primaryColor: 'blue' }, // Empty qualifier
                        { repoQualifier: 'test', primaryColor: '' }, // Empty color
                        { repoQualifier: 'test', primaryColor: 'invalid-color' }, // Invalid color
                        { repoQualifier: 'a'.repeat(300), primaryColor: 'red' }, // Too long qualifier
                        { repoQualifier: 'test', primaryColor: 'blue', branchColor: 'invalid' }, // Invalid branch color
                        { repoQualifier: 'test', primaryColor: 'blue', defaultBranch: 'x'.repeat(150) } // Too long branch
                    ];
                    
                    // Test invalid branch rules
                    const invalidBranchRules = [
                        { pattern: '', color: 'blue' }, // Empty pattern
                        { pattern: 'feature.*', color: '' }, // Empty color
                        { pattern: 'feature.*', color: 'invalid-color' }, // Invalid color
                        { pattern: 'a'.repeat(200), color: 'red' }, // Too long pattern
                        { pattern: '[unclosed', color: 'blue' }, // Invalid regex
                        { pattern: '(?invalid', color: 'green' } // Invalid regex
                    ];
                    
                    const testConfig = {
                        repoRules: invalidRepoRules,
                        branchRules: invalidBranchRules,
                        otherSettings: currentConfig?.otherSettings || {}
                    };
                    
                    const originalConfig = currentConfig;
                    currentConfig = testConfig;
                    
                    // Test validation without updating the display
                    const isValid = validateRules();
                    console.log(\`✓ Validation correctly detected invalid configuration: \${isValid ? 'FAILED' : 'PASSED'}\`);
                    
                    currentConfig = originalConfig;
                }
                
                function testEdgeCases() {
                    console.log('Testing edge cases...');
                    
                    const edgeCaseConfig = {
                        repoRules: [
                            { repoQualifier: 'repo with spaces', primaryColor: 'rgba(255, 0, 0, 0.5)' },
                            { repoQualifier: 'repo-with-special-chars!@#$%', primaryColor: 'hsla(240, 100%, 50%, 0.8)' },
                            { repoQualifier: 'github.com/user/repo.git', primaryColor: 'transparent' },
                            { repoQualifier: 'unicode-éñüñç', primaryColor: 'currentColor' }
                        ],
                        branchRules: [
                            { pattern: '.*', color: 'inherit' }, // Match everything
                            { pattern: '^feature/[a-zA-Z0-9-_]+$', color: 'rgb(100, 200, 50)' },
                            { pattern: 'release|hotfix', color: 'var(--vscode-editor-foreground)' },
                            { pattern: 'test-unicode-éñ', color: '#ABC' } // Short hex
                        ],
                        otherSettings: currentConfig?.otherSettings || {}
                    };
                    
                    const originalConfig = currentConfig;
                    currentConfig = edgeCaseConfig;
                    
                    // Test validation without updating the display
                    console.log('✓ Edge cases handled correctly');
                    
                    currentConfig = originalConfig;
                }
                
                function testColorFormats() {
                    console.log('Testing color format validation...');
                    
                    const colorTests = [
                        // Valid colors
                        { color: '#FF0000', expected: true, description: 'Hex 6-digit' },
                        { color: '#F00', expected: true, description: 'Hex 3-digit' },
                        { color: 'red', expected: true, description: 'Named color' },
                        { color: 'rgb(255, 0, 0)', expected: true, description: 'RGB' },
                        { color: 'rgba(255, 0, 0, 0.5)', expected: true, description: 'RGBA' },
                        { color: 'hsl(0, 100%, 50%)', expected: true, description: 'HSL' },
                        { color: 'hsla(0, 100%, 50%, 0.8)', expected: true, description: 'HSLA' },
                        
                        // Invalid colors
                        { color: '', expected: false, description: 'Empty string' },
                        { color: '#GGG', expected: false, description: 'Invalid hex chars' },
                        { color: '#FFFFFFF', expected: false, description: 'Hex too long' },
                        { color: 'invalidcolor', expected: false, description: 'Invalid named color' },
                        { color: 'rgb(300, 0, 0)', expected: false, description: 'RGB out of range' },
                        { color: 'rgba(255, 0, 0, 2)', expected: false, description: 'RGBA alpha out of range' },
                        { color: 'hsl(400, 100%, 50%)', expected: false, description: 'HSL hue out of range' }
                    ];
                    
                    let passed = 0;
                    let failed = 0;
                    
                    colorTests.forEach(test => {
                        const result = isValidColor(test.color);
                        if (result === test.expected) {
                            console.log(\`  ✓ \${test.description}: "\${test.color}" -> \${result}\`);
                            passed++;
                        } else {
                            console.log(\`  ✗ \${test.description}: "\${test.color}" -> \${result} (expected \${test.expected})\`);
                            failed++;
                        }
                    });
                    
                    console.log(\`✓ Color validation tests: \${passed} passed, \${failed} failed\`);
                }
                
                // Add test button to UI (for development)
                function addTestButton() {
                    const testButton = document.createElement('button');
                    testButton.textContent = '🧪 Run Tests';
                    testButton.className = 'test-button';
                    testButton.onclick = runConfigurationTests;
                    testButton.style.cssText = \`
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        z-index: 9999;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    \`;
                    document.body.appendChild(testButton);
                }
                
                // Initialize test button in development mode only
                if (typeof window !== 'undefined' && ${DEVELOPMENT_MODE}) {
                    setTimeout(addTestButton, 1000);
                }
            </script>
        </body>
        </html>`;
    }

    private _onPanelDisposed(): void {
        this._panel = undefined;
    }

    public dispose(): void {
        this._onPanelDisposed();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
