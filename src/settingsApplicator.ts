/**
 * Settings Applicator Module
 *
 * Handles applying color profiles to VS Code workspace settings.
 * This module provides pure functions for merging, cleaning, and managing
 * color customizations in the workbench.colorCustomizations settings.
 */

/**
 * Logger interface for settings application operations
 */
export interface SettingsApplicatorLogger {
    appendLine(message: string): void;
}

/**
 * List of all color keys managed by the Git Repo Window Colors extension
 * These colors may be set, modified, or removed by the extension
 */
export const MANAGED_COLORS = [
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

/**
 * Result of applying colors to settings
 */
export interface ApplyColorsResult {
    /** The final color customizations to write to settings */
    finalColors: Record<string, string | undefined>;
    /** Number of color customizations that were set (non-undefined values) */
    setCount: number;
    /** Number of stale colors that were removed */
    removedCount: number;
    /** Activity bar color keys that were set */
    activityBarColors: Array<{ key: string; value: string }>;
}

/**
 * Apply new colors to existing settings while preserving non-managed colors.
 *
 * This function:
 * 1. Removes all managed colors from existing settings (clean slate)
 * 2. Merges in new colors (only defined values)
 * 3. Identifies and removes stale managed colors
 * 4. Preserves any non-managed colors from the original settings
 *
 * @param currentSettings - Current workbench.colorCustomizations object
 * @param newColors - New colors to apply (can include undefined for "unset")
 * @param logger - Optional logger for debug output
 * @returns Result containing final colors and statistics
 */
export function applyColors(
    currentSettings: Record<string, string> | undefined,
    newColors: Record<string, string | undefined>,
    logger?: SettingsApplicatorLogger,
): ApplyColorsResult {
    const current = currentSettings || {};

    // Step 1: Remove all managed colors from existing customizations to start clean
    const cleanedCC: Record<string, string> = {};
    for (const [key, value] of Object.entries(current)) {
        if (!MANAGED_COLORS.includes(key)) {
            cleanedCC[key] = value;
        }
    }

    // Step 2: Add newColors to the cleaned customizations
    // Only add defined color values (skip undefined to avoid setting them explicitly)
    const finalColors: Record<string, string | undefined> = { ...cleanedCC };
    for (const [key, value] of Object.entries(newColors)) {
        if (value !== undefined) {
            finalColors[key] = value;
        }
    }

    // Step 3: Track which managed colors were in current but are being removed
    // (either because they're not in newColors, or explicitly set to undefined)
    let removedCount = 0;
    for (const key of MANAGED_COLORS) {
        // If the color was in current settings but is not being set in newColors
        if (current[key] !== undefined && newColors[key] === undefined) {
            removedCount++;
            if (logger) {
                logger.appendLine(`  Removed stale color: ${key}`);
            }
        }
    }

    // Count how many colors are being set (non-undefined values in newColors)
    const setCount = Object.keys(newColors).filter((k) => newColors[k] !== undefined).length;

    // Log activity bar colors specifically for debugging
    const activityBarColors = Object.keys(finalColors)
        .filter((k) => k.startsWith('activityBar.') && finalColors[k] !== undefined)
        .map((k) => ({ key: k, value: finalColors[k] as string }));

    if (logger) {
        logger.appendLine(`  Setting ${setCount} color customizations`);

        if (activityBarColors.length > 0) {
            logger.appendLine(
                '  Activity bar colors: ' + activityBarColors.map((c) => `${c.key}=${c.value}`).join(', '),
            );
        } else {
            logger.appendLine('  WARNING: No activity bar colors being set');
        }
    }

    return {
        finalColors,
        setCount,
        removedCount,
        activityBarColors,
    };
}

/**
 * Remove all managed colors from settings.
 *
 * This function filters out all color keys that are managed by the extension,
 * preserving any non-managed colors the user may have set.
 *
 * @param currentSettings - Current workbench.colorCustomizations object
 * @returns New settings object with managed colors removed
 */
export function removeAllManagedColors(currentSettings: Record<string, string> | undefined): Record<string, string> {
    const current = currentSettings || {};
    const filtered: Record<string, string> = {};

    for (const [key, value] of Object.entries(current)) {
        if (!MANAGED_COLORS.includes(key)) {
            filtered[key] = value;
        }
    }

    return filtered;
}
