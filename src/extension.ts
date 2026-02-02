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

type RepoConfig = {
    repoQualifier: string;
    primaryColor: string;
    profileName?: string;
    enabled?: boolean;
    branchTableName?: string; // Name of the shared branch table to use
    // Legacy properties - will be migrated
    branchRules?: Array<{ pattern: string; color: string; enabled?: boolean }>;
    // Transient properties set during matching and profile resolution
    branchProfileName?: string; // Profile name from branch rule matching
    profile?: AdvancedProfile; // Resolved profile (real or temporary from simple mode)
    branchProfile?: AdvancedProfile; // Resolved branch profile (real or temporary)
    isSimpleMode?: boolean; // True if repo rule used simple color (not profile)
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
 */
function createRepoTempProfile(repoColor: Color): AdvancedProfile {
    try {
        const theme = window.activeColorTheme.kind;
        const isDark = theme === ColorThemeKind.Dark;

        // Read settings from windowColors namespace
        const settings = workspace.getConfiguration('windowColors');
        const doColorInactiveTitlebar = settings.get<boolean>('colorInactiveTitlebar', true);
        const doColorEditorTabs = settings.get<boolean>('colorEditorTabs', true);
        const doColorStatusBar = settings.get<boolean>('colorStatusBar', true);

        // Color knob
        let activityBarColorKnob = settings.get<number>('activityBarColorKnob', 0);
        if (activityBarColorKnob === undefined) {
            activityBarColorKnob = 0;
        }
        outputChannel.appendLine(`    [Repo Temp Profile] Raw color knob value: ${activityBarColorKnob}`);
        activityBarColorKnob = activityBarColorKnob / 50;
        outputChannel.appendLine(`    [Repo Temp Profile] Normalized color knob: ${activityBarColorKnob}`);

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

        // Calculate modifiers based on theme
        const titleInactiveBgModifier = isDark ? 0.5 : 0.15;
        const tabBrightnessModifier = isDark ? 0.5 : 0.4;

        // Activity bar modifier: negative values darken, positive values lighten
        const activityBarModifier = activityBarColorKnob;
        const absModifier = Math.abs(activityBarModifier);
        const shouldDarken = activityBarModifier < 0;
        const shouldLighten = activityBarModifier > 0;

        outputChannel.appendLine(
            `    [Repo Temp Profile] Color knob application: shouldDarken=${shouldDarken}, shouldLighten=${shouldLighten}, absModifier=${absModifier}`,
        );

        // Build palette - title bar colors (always)
        const palette: any = {
            titleBarActiveBg: { source: 'repoColor' as const },
            titleBarActiveFg: {
                source: 'repoColor' as const,
                highContrast: true,
            },
            titleBarInactiveBg: {
                source: 'repoColor' as const,
                [isDark ? 'darken' : 'lighten']: titleInactiveBgModifier,
            },
            titleBarInactiveFg: {
                source: 'repoColor' as const,
                highContrast: true,
            },
        };

        // Add tab colors if enabled
        if (doColorEditorTabs) {
            // Base modifier applies the knob value
            // Tab active is additionally brightened
            const tabInactiveDef: any = { source: 'repoColor' as const };
            const tabActiveDef: any = { source: 'repoColor' as const };

            if (activityBarColorKnob === 0) {
                // Zero knob - no adjustment, use raw color
                outputChannel.appendLine(
                    `    [Repo Temp Profile] Tabs: zero knob, no color adjustment (using raw repo color)`,
                );
            } else if (shouldDarken) {
                tabInactiveDef.darken = absModifier;
                tabActiveDef.darken = Math.max(0, absModifier - tabBrightnessModifier);
                outputChannel.appendLine(
                    `    [Repo Temp Profile] Tabs: darkening by ${absModifier} (inactive) and ${Math.max(0, absModifier - tabBrightnessModifier)} (active)`,
                );
            } else if (shouldLighten) {
                tabInactiveDef.lighten = absModifier;
                tabActiveDef.lighten = absModifier + tabBrightnessModifier;
                outputChannel.appendLine(
                    `    [Repo Temp Profile] Tabs: lightening by ${absModifier} (inactive) and ${absModifier + tabBrightnessModifier} (active)`,
                );
            }

            palette.tabInactiveBg = tabInactiveDef;
            palette.tabActiveBg = tabActiveDef;
        }

        // Add status bar color (for when tabs are disabled but status bar is enabled)
        if (doColorStatusBar && !doColorEditorTabs) {
            const statusBarDef: any = { source: 'repoColor' as const };

            if (activityBarColorKnob === 0) {
                // Zero knob - no adjustment, use raw color
                outputChannel.appendLine(
                    `    [Repo Temp Profile] Status bar: zero knob, no color adjustment (using raw repo color)`,
                );
            } else if (shouldDarken) {
                statusBarDef.darken = absModifier;
                outputChannel.appendLine(`    [Repo Temp Profile] Status bar: darkening by ${absModifier}`);
            } else if (shouldLighten) {
                statusBarDef.lighten = absModifier;
                outputChannel.appendLine(`    [Repo Temp Profile] Status bar: lightening by ${absModifier}`);
            }

            palette.statusBarBg = statusBarDef;
        }

        // Build mappings - title bar (always)
        const mappings: any = {
            'titleBar.activeBackground': 'titleBarActiveBg',
            'titleBar.activeForeground': 'titleBarActiveFg',
        };

        if (doColorInactiveTitlebar) {
            mappings['titleBar.inactiveBackground'] = 'titleBarInactiveBg';
            mappings['titleBar.inactiveForeground'] = 'titleBarInactiveFg';
        }

        // Add tab mappings if enabled
        if (doColorEditorTabs) {
            mappings['tab.inactiveBackground'] = 'tabInactiveBg';
            mappings['tab.activeBackground'] = 'tabActiveBg';
            mappings['tab.hoverBackground'] = 'tabActiveBg';
            mappings['tab.unfocusedHoverBackground'] = 'tabActiveBg';
            mappings['editorGroupHeader.tabsBackground'] = 'tabInactiveBg';
            mappings['titleBar.border'] = 'tabInactiveBg';
            mappings['sideBarTitle.background'] = 'tabInactiveBg';
        }

        // Add status bar mapping if enabled
        if (doColorStatusBar) {
            mappings['statusBar.background'] = doColorEditorTabs ? 'tabInactiveBg' : 'statusBarBg';
        }

        const profile: AdvancedProfile = {
            palette,
            mappings,
            virtual: true, // Mark as virtual - created for simple color rules
        };

        // Cache it
        simpleModeProfileCache.set(cacheKey, profile);

        // Debug output
        outputChannel.appendLine(
            `    [Repo Temp Profile] Created with ${Object.keys(palette).length} palette slots and ${Object.keys(mappings).length} mappings`,
        );
        outputChannel.appendLine(`    [Repo Temp Profile] Mappings: ${Object.keys(mappings).join(', ')}`);

        return profile;
    } catch (error) {
        outputChannel.appendLine(`ERROR creating repo temp profile: ${error}`);
        // Return minimal working profile
        return {
            palette: {
                primaryActiveBg: { source: 'repoColor' },
                primaryActiveFg: { source: 'repoColor', highContrast: true },
                primaryInactiveBg: { source: 'repoColor' },
                primaryInactiveFg: { source: 'repoColor', highContrast: true },
                secondaryActiveBg: { source: 'repoColor' },
                secondaryActiveFg: { source: 'repoColor', highContrast: true },
                secondaryInactiveBg: { source: 'repoColor' },
                secondaryInactiveFg: { source: 'repoColor', highContrast: true },
                tertiaryBg: { source: 'repoColor' },
                tertiaryFg: { source: 'repoColor', highContrast: true },
                quaternaryBg: { source: 'repoColor' },
                quaternaryFg: { source: 'repoColor', highContrast: true },
            },
            mappings: {
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': 'primaryActiveFg',
            },
            virtual: true, // Mark fallback profile as virtual
        };
    }
}

/**
 * Creates a temporary AdvancedProfile for branch colors (activity bar only).
 * This handles simple mode branch rules by converting them to profiles.
 */
function createBranchTempProfile(branchColor: Color): AdvancedProfile {
    try {
        const theme = window.activeColorTheme.kind;

        // Read settings - color knob is in windowColors namespace
        const windowSettings = workspace.getConfiguration('windowColors');
        let activityBarColorKnob = windowSettings.get<number>('activityBarColorKnob', 0);
        if (activityBarColorKnob === undefined) {
            activityBarColorKnob = 0;
        }
        activityBarColorKnob = activityBarColorKnob / 50;

        // Create cache key
        const cacheKey = ['branch', branchColor.hex(), theme.toString(), activityBarColorKnob.toString()].join('|');

        // Check cache
        if (simpleModeProfileCache.has(cacheKey)) {
            return simpleModeProfileCache.get(cacheKey)!;
        }

        // Build palette - activity bar only (use branch color directly, no knob adjustment)
        const palette: any = {
            activityBarBg: {
                source: 'branchColor' as const,
            },
            activityBarFg: {
                source: 'branchColor' as const,
                highContrast: true,
            },
        };

        // Build mappings - activity bar only
        const mappings: any = {
            'activityBar.background': 'activityBarBg',
            'activityBar.foreground': 'activityBarFg',
        };

        const profile: AdvancedProfile = {
            palette,
            mappings,
            virtual: true, // Mark as virtual - created for simple color rules
        };

        // Cache it
        simpleModeProfileCache.set(cacheKey, profile);

        // Debug output
        outputChannel.appendLine(
            `    [Branch Temp Profile] Created with ${Object.keys(palette).length} palette slots and ${Object.keys(mappings).length} mappings`,
        );
        outputChannel.appendLine(`    [Branch Temp Profile] Mappings: ${Object.keys(mappings).join(', ')}`);

        return profile;
    } catch (error) {
        outputChannel.appendLine(`ERROR creating branch temp profile: ${error}`);
        // Return minimal working profile
        return {
            palette: {
                primaryActiveBg: { source: 'branchColor' },
                primaryActiveFg: { source: 'branchColor', highContrast: true },
                primaryInactiveBg: { source: 'branchColor' },
                primaryInactiveFg: { source: 'branchColor', highContrast: true },
                secondaryActiveBg: { source: 'branchColor' },
                secondaryActiveFg: { source: 'branchColor', highContrast: true },
                secondaryInactiveBg: { source: 'branchColor' },
                secondaryInactiveFg: { source: 'branchColor', highContrast: true },
                tertiaryBg: { source: 'branchColor' },
                tertiaryFg: { source: 'branchColor', highContrast: true },
                quaternaryBg: { source: 'branchColor' },
                quaternaryFg: { source: 'branchColor', highContrast: true },
            },
            mappings: {
                'activityBar.background': 'primaryActiveBg',
                'activityBar.foreground': 'primaryActiveFg',
            },
            virtual: true, // Mark fallback profile as virtual
        };
    }
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
 * Migrate legacy defaultBranch/branchColor to Local Branch Rules
 * Returns true if migration occurred
 */
function migrateLegacyBranchRule(
    rule: any,
    invertBranchColorLogic: boolean,
    hueRotation: number,
    outputChannel: vscode.OutputChannel,
): boolean {
    // Only migrate if defaultBranch is set and no existing local branch rules
    if (!rule.defaultBranch || (rule.branchRules && rule.branchRules.length > 0)) {
        return false;
    }

    const defaultBranch = rule.defaultBranch;
    const primaryColor = rule.primaryColor;
    let branchColor = rule.branchColor;

    // If branchColor is not set, calculate hue-rotated color
    if (!branchColor) {
        try {
            const parsedColor = Color(primaryColor);
            branchColor = parsedColor.rotate(hueRotation).hex();
        } catch (err) {
            outputChannel.appendLine(
                `  Warning: Could not calculate branch color for "${defaultBranch}", skipping migration`,
            );
            return false;
        }
    }

    // Escape special regex characters in branch name
    const escapedBranch = defaultBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create local branch rule based on invertBranchColorLogic
    const branchRules: any[] = [];

    if (!invertBranchColorLogic) {
        // Normal mode: On default branch → use primaryColor
        // Off default branch → use branchColor (falls through)
        branchRules.push({
            pattern: `^${escapedBranch}$`,
            color: primaryColor,
            enabled: true,
        });
    } else {
        // Inverted mode: On default branch → use branchColor (falls through)
        // Off default branch → use primaryColor
        branchRules.push({
            pattern: `^(?!${escapedBranch}$).*`,
            color: primaryColor,
            enabled: true,
        });
    }

    // Update the rule
    rule.branchRules = branchRules;

    // Remove legacy fields
    delete rule.defaultBranch;
    delete rule.branchColor;

    outputChannel.appendLine(
        `  Migrated legacy branch rule: defaultBranch="${defaultBranch}" → Local Branch Rule (pattern: "${branchRules[0].pattern}")`,
    );

    return true;
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
        const invertBranchColorLogic = config.get('invertBranchColorLogic', false) as boolean;
        const hueRotation = config.get('automaticBranchIndicatorColorKnob', 60) as number;
        let legacyBranchRulesMigrated = 0;

        for (const item of repoConfigList) {
            // Skip if already JSON object
            if (typeof item === 'object' && item !== null) {
                // Migrate legacy branch rules in existing JSON objects
                if (item.defaultBranch) {
                    const migrated = migrateLegacyBranchRule(item, invertBranchColorLogic, hueRotation, outputChannel);
                    if (migrated) {
                        legacyBranchRulesMigrated++;
                    }
                }
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

                    // Migrate legacy branch rule to local branch rules
                    if (defaultBranch) {
                        const migrated = migrateLegacyBranchRule(
                            migratedRule,
                            invertBranchColorLogic,
                            hueRotation,
                            outputChannel,
                        );
                        if (migrated) {
                            legacyBranchRulesMigrated++;
                        }
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

        // Initialize sharedBranchTables if it doesn't exist
        const existingSharedBranchTables = config.get('sharedBranchTables', null);
        const sharedBranchTables: { [key: string]: { rules: any[] } } = existingSharedBranchTables || {};

        // Create "Default Rules" table from branchConfigurationList if it doesn't exist
        if (!sharedBranchTables['Default Rules'] && !sharedBranchTables['Global']) {
            sharedBranchTables['Default Rules'] = {
                rules: migratedBranchList,
            };
            outputChannel.appendLine(
                `Created "Default Rules" table from branchConfigurationList with ${migratedBranchList.length} rules`,
            );
        }

        // Second migration pass: Convert legacy branchRules to branchTableName
        // Migrate repos without branchTableName to use Default Rules
        let branchTablesMigrated = 0;
        for (const repoRule of migratedRepoList) {
            // Check if already migrated (has branchTableName)
            if (repoRule.branchTableName !== undefined) {
                continue;
            }

            // No branch table specified, use Default Rules by default
            repoRule.branchTableName = 'Default Rules';
            branchTablesMigrated++;
        }

        if (!existingSharedBranchTables) {
            await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);
            outputChannel.appendLine(
                `Initialized sharedBranchTables with ${Object.keys(sharedBranchTables).length} tables`,
            );
        } else if (branchTablesMigrated > 0) {
            await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);
            outputChannel.appendLine(
                `Updated sharedBranchTables with ${Object.keys(sharedBranchTables).length} tables`,
            );
        }

        // Migration: Rename "Global" table to "Default Rules" if it exists
        if (sharedBranchTables['Global']) {
            sharedBranchTables['Default Rules'] = sharedBranchTables['Global'];
            delete sharedBranchTables['Global'];

            // Update all repo rules that reference "Global" to use "Default Rules"
            for (const repoRule of migratedRepoList) {
                if (repoRule.branchTableName === 'Global') {
                    repoRule.branchTableName = 'Default Rules';
                }
            }

            await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);
            outputChannel.appendLine('Migrated "Global" table to "Default Rules"');
        }

        // Write migrated configuration
        await config.update('repoConfigurationList', migratedRepoList, vscode.ConfigurationTarget.Global);
        await config.update('branchConfigurationList', migratedBranchList, vscode.ConfigurationTarget.Global);
        await context.globalState.update('configMigratedToJson', true);

        outputChannel.appendLine(
            `Configuration migration completed: ${migratedRepoList.length} repo rules, ${migratedBranchList.length} branch rules, ${branchTablesMigrated} repo rules migrated to use branch tables`,
        );

        // Show notification if legacy branch rules were migrated
        if (legacyBranchRulesMigrated > 0) {
            vscode.window
                .showInformationMessage(
                    `Legacy branch rules have been automatically converted to Local Branch Rules. Please review your Repository Rules configuration.`,
                    'Open Settings',
                )
                .then((selection) => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('windowColors.openConfigWebview');
                    }
                });
        }
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
        vscode.commands.registerCommand(
            '_grwc.internal.applyColors',
            (reason: string, usePreviewMode: boolean = false) => {
                doit(reason || 'internal command', usePreviewMode);
            },
        ),
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
            if (
                e.affectsConfiguration('windowColors') ||
                e.affectsConfiguration('window.titleBarStyle') ||
                e.affectsConfiguration('window.customTitleBarVisibility') ||
                e.affectsConfiguration('workbench.colorTheme')
            ) {
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
                // Check if we should use preview mode - use the tracked checkbox state
                const usePreview = configProvider?.isPreviewModeEnabled() ?? false;
                doit('settings change', usePreview);
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

    // Clear previous repo rule errors
    repoRuleErrors.clear();

    // Get advanced profiles (get once before loop)
    const advancedProfiles =
        (workspace.getConfiguration('windowColors').get('advancedProfiles', {}) as { [key: string]: any }) || {};

    for (const item in json) {
        const setting = json[item];

        // PRIMARY: Handle JSON object format (new format)
        if (typeof setting === 'object' && setting !== null) {
            const repoConfig: RepoConfig = {
                repoQualifier: setting.repoQualifier || '',
                primaryColor: setting.primaryColor || '',
                profileName: setting.profileName,
                enabled: setting.enabled !== undefined ? setting.enabled : true,
                branchTableName: setting.branchTableName,
                branchRules: setting.branchRules,
            };

            // Validate if needed
            if (validate && isActive) {
                let errorMsg = '';
                if (!repoConfig.repoQualifier || !repoConfig.primaryColor) {
                    errorMsg = 'Repository rule missing required fields (repoQualifier or primaryColor)';
                    repoRuleErrors.set(result.length, errorMsg);
                    outputChannel.appendLine(errorMsg);
                    // Add to result anyway so it can be displayed in UI with error indication
                    result.push(repoConfig);
                    continue;
                }

                // Validate colors if not profile names
                const primaryIsProfile = advancedProfiles[repoConfig.primaryColor];
                if (!primaryIsProfile) {
                    try {
                        Color(repoConfig.primaryColor);
                    } catch (error) {
                        errorMsg = `Invalid primary color: ${repoConfig.primaryColor}`;
                        repoRuleErrors.set(result.length, errorMsg);
                        outputChannel.appendLine(errorMsg);
                        // Add to result anyway so it can be displayed in UI with error indication
                        result.push(repoConfig);
                        continue;
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
                        primaryColor: obj.primaryColor || '',
                        profileName: obj.profileName,
                        enabled: obj.enabled !== undefined ? obj.enabled : true,
                        branchRules: obj.branchRules,
                        branchTableName: obj.branchTableName,
                    };
                    result.push(repoConfig);
                    continue;
                } catch (err) {
                    // If JSON parsing fails, log error and skip
                    outputChannel.appendLine(`Failed to parse JSON rule: ${setting}`);
                }
            }
        }
    }

    return result;
}

function getBranchData(validate: boolean = false): Map<string, string> {
    const branchConfigObj = getObjectSetting('branchConfigurationList');
    const json = JSON.parse(JSON.stringify(branchConfigObj));

    const result = new Map<string, string>();

    // Clear previous branch rule errors
    branchRuleErrors.clear();

    // Track current index for error mapping
    let currentIndex = 0;

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
                currentIndex++;
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
                            branchRuleErrors.set(currentIndex, msg);
                            outputChannel.appendLine(msg);
                            currentIndex++;
                            continue;
                        }
                    }
                }

                result.set(setting.pattern, setting.color);
            }
            currentIndex++;
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
                branchRuleErrors.set(currentIndex, msg);
                outputChannel.appendLine(msg);
                currentIndex++;
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
                branchRuleErrors.set(currentIndex, msg);
                outputChannel.appendLine(msg);
            }

            result.set(branchName, branchColor);
            currentIndex++;
        } else {
            currentIndex++;
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

// ========== Branch Table Management Functions ==========

/**
 * Get usage count for a branch table (number of repo rules using it)
 */
function getBranchTableUsageCount(tableName: string): number {
    const config = workspace.getConfiguration('windowColors');
    const repoRules = config.get<any[]>('repoConfigurationList', []);

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
    const repoRules = config.get<any[]>('repoConfigurationList', []);
    let migratedCount = 0;

    for (const rule of repoRules) {
        if (rule.branchTableName === tableName) {
            rule.branchTableName = 'Default Rules';
            migratedCount++;
        }
    }

    if (migratedCount > 0) {
        await config.update('repoConfigurationList', repoRules, vscode.ConfigurationTarget.Global);
        outputChannel.appendLine(`Migrated ${migratedCount} repo rules from "${tableName}" to "Default Rules"`);
    }

    // Delete the table
    delete sharedBranchTables[tableName];
    await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);
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
    const repoRules = config.get<any[]>('repoConfigurationList', []);
    let updatedCount = 0;

    for (const rule of repoRules) {
        if (rule.branchTableName === oldName) {
            rule.branchTableName = newName;
            updatedCount++;
        }
    }

    // Rename the table
    sharedBranchTables[newName] = sharedBranchTables[oldName];
    delete sharedBranchTables[oldName];

    await config.update('sharedBranchTables', sharedBranchTables, vscode.ConfigurationTarget.Global);

    if (updatedCount > 0) {
        await config.update('repoConfigurationList', repoRules, vscode.ConfigurationTarget.Global);
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
    const repoRules = config.get<any[]>('repoConfigurationList', []);
    
    if (selectedRepoRuleIndex < repoRules.length) {
        const selectedRule = repoRules[selectedRepoRuleIndex];
        return selectedRule.branchTableName || 'Default Rules';
    }
    
    return 'Default Rules';
}
*/

// ========== End Branch Table Management Functions ==========

async function doit(reason: string, usePreviewMode: boolean = false) {
    stopBranchPoll();
    outputChannel.appendLine('\nColorizer triggered by ' + reason);
    outputChannel.appendLine('  Preview mode enabled: ' + usePreviewMode);

    const repoConfigList = getRepoConfigList(true);
    if (repoConfigList === undefined) {
        outputChannel.appendLine('  No repo settings found.  Using branch mode only.');
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
        // Use matching index - find the rule that matches the current repo
        if (repoConfigList !== undefined) {
            let ruleIndex = 0;
            for (const item of repoConfigList) {
                // Skip disabled rules
                if (item.enabled === false) {
                    ruleIndex++;
                    continue;
                }
                if (gitRepoRemoteFetchUrl.includes(item.repoQualifier)) {
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

        // If no valid profile was set, check primaryColor
        if (!matchedRepoConfig.profile && matchedRepoConfig.primaryColor) {
            const profileName = extractProfileName(matchedRepoConfig.primaryColor, advancedProfiles);
            if (profileName && advancedProfiles[profileName]) {
                // It's a profile reference in primaryColor
                outputChannel.appendLine('  Using profile from primaryColor: ' + profileName);
                matchedRepoConfig.profile = advancedProfiles[profileName];
                matchedRepoConfig.isSimpleMode = false;
            } else {
                // It's a simple color - create temporary repo profile
                try {
                    repoColor = Color(matchedRepoConfig.primaryColor);
                    outputChannel.appendLine('  Using simple color: ' + repoColor.hex());

                    matchedRepoConfig.profile = createRepoTempProfile(repoColor);
                    matchedRepoConfig.isSimpleMode = true;
                } catch (e) {
                    outputChannel.appendLine('  Error parsing color: ' + e);
                }
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
            outputChannel.appendLine(
                '  [PREVIEW MODE] Using selected branch rule at index ' + selectedBranchContext.index,
            );

            const sharedBranchTables = workspace
                .getConfiguration('windowColors')
                .get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

            const tableName = selectedBranchContext.tableName;
            outputChannel.appendLine(`  [PREVIEW MODE] Using branch table: "${tableName}"`);

            const branchTable = sharedBranchTables[tableName];
            let selectedRule: { pattern: string; color: string; enabled?: boolean } | undefined;

            if (branchTable && branchTable.rules && branchTable.rules[selectedBranchContext.index]) {
                selectedRule = branchTable.rules[selectedBranchContext.index];
            }

            if (selectedRule) {
                outputChannel.appendLine('  [PREVIEW MODE] Branch rule: "' + selectedRule.pattern + '"');

                // Check if this is a profile name
                const advancedProfiles = workspace
                    .getConfiguration('windowColors')
                    .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
                const profileName = extractProfileName(selectedRule.color, advancedProfiles);

                if (profileName && advancedProfiles[profileName]) {
                    // It's a profile - store it
                    outputChannel.appendLine('  [PREVIEW MODE] Using Branch Profile: ' + profileName);
                    if (!matchedRepoConfig) {
                        matchedRepoConfig = {
                            repoQualifier: '',
                            primaryColor: '',
                        };
                    }
                    matchedRepoConfig.branchProfile = advancedProfiles[profileName];
                } else {
                    // It's a simple color - create temporary branch profile
                    branchColor = Color(selectedRule.color);
                    outputChannel.appendLine('  [PREVIEW MODE] Using simple branch color: ' + branchColor.hex());

                    if (!matchedRepoConfig) {
                        matchedRepoConfig = {
                            repoQualifier: '',
                            primaryColor: '',
                        };
                    }
                    matchedRepoConfig.branchProfile = createBranchTempProfile(branchColor);
                }
                branchMatch = true;
            }
        }
    } else {
        // Use matching branch rules - lookup from shared branch tables
        const sharedBranchTables = workspace
            .getConfiguration('windowColors')
            .get<{ [key: string]: { rules: any[] } }>('sharedBranchTables', {});

        // Skip branch rule checking if branchTableName is '__none__'
        if (matchedRepoConfig && matchedRepoConfig.branchTableName === '__none__') {
            outputChannel.appendLine('  No branch table specified for this repository - skipping branch rules');
        } else {
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
                        // Check if this is a profile name
                        const advancedProfiles = workspace
                            .getConfiguration('windowColors')
                            .get<{ [key: string]: AdvancedProfile }>('advancedProfiles', {});
                        const profileName = extractProfileName(rule.color, advancedProfiles);

                        if (profileName && advancedProfiles[profileName]) {
                            // It's a profile - store it
                            outputChannel.appendLine(
                                `  Branch rule matched in "${tableName}": "${rule.pattern}" using Profile: ${profileName}`,
                            );
                            if (!matchedRepoConfig) {
                                matchedRepoConfig = {
                                    repoQualifier: '',
                                    primaryColor: '',
                                };
                            }
                            matchedRepoConfig.branchProfile = advancedProfiles[profileName];
                        } else {
                            // It's a simple color - create temporary branch profile
                            branchColor = Color(rule.color);
                            outputChannel.appendLine(
                                `  Branch rule matched in "${tableName}": "${rule.pattern}" with simple color: ${branchColor.hex()}`,
                            );

                            if (!matchedRepoConfig) {
                                matchedRepoConfig = {
                                    repoQualifier: '',
                                    primaryColor: '',
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
            repoConfigurationList: config.get('repoConfigurationList'),
            branchConfigurationList: config.get('branchConfigurationList'),
            removeManagedColors: config.get('removeManagedColors'),
            colorInactiveTitlebar: config.get('colorInactiveTitlebar'),
            colorEditorTabs: config.get('colorEditorTabs'),
            colorStatusBar: config.get('colorStatusBar'),
            activityBarColorKnob: config.get('activityBarColorKnob'),
            applyBranchColorToTabsAndStatusBar: config.get('applyBranchColorToTabsAndStatusBar'),
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
