/**
 * Settings verification utilities for integration tests
 * Helpers to assert color settings and workspace configuration
 */

import { expect } from 'chai';
import Color from 'color';

/**
 * List of all managed color keys (from extension.ts)
 */
export const MANAGED_COLORS = [
    'titleBar.activeBackground',
    'titleBar.activeForeground',
    'titleBar.inactiveBackground',
    'titleBar.inactiveForeground',
    'titleBar.border',
    'activityBar.background',
    'activityBar.foreground',
    'activityBar.inactiveForeground',
    'activityBar.border',
    'activityBar.activeBorder',
    'activityBar.dropBorder',
    'activityBar.activeBackground',
    'activityBarBadge.background',
    'activityBarBadge.foreground',
    'statusBar.background',
    'statusBar.foreground',
    'statusBar.border',
    'statusBar.debuggingBackground',
    'statusBar.debuggingForeground',
    'statusBar.debuggingBorder',
    'statusBar.noFolderBackground',
    'statusBar.noFolderForeground',
    'statusBar.noFolderBorder',
    'statusBarItem.activeBackground',
    'statusBarItem.hoverBackground',
    'statusBarItem.prominentBackground',
    'statusBarItem.prominentForeground',
    'statusBarItem.prominentHoverBackground',
    'statusBarItem.errorBackground',
    'statusBarItem.errorForeground',
    'statusBarItem.warningBackground',
    'statusBarItem.warningForeground',
    'tab.activeBackground',
    'tab.activeForeground',
    'tab.inactiveBackground',
    'tab.inactiveForeground',
    'tab.activeBorder',
    'tab.activeBorderTop',
    'tab.activeModifiedBorder',
    'tab.inactiveModifiedBorder',
    'editorGroupHeader.tabsBackground',
    'editorGroupHeader.tabsBorder',
    'editorGroupHeader.noTabsBackground',
    'editorGroupHeader.border',
    'panel.background',
    'panel.border',
];

/**
 * Normalize color to uppercase hex for comparison
 */
function normalizeColor(color: string): string {
    try {
        const parsed = Color(color);
        if (parsed.alpha() < 1) {
            // Include alpha channel
            const hex = parsed.hex().toUpperCase();
            const alpha = Math.round(parsed.alpha() * 255)
                .toString(16)
                .toUpperCase()
                .padStart(2, '0');
            return hex + alpha;
        }
        return parsed.hex().toUpperCase();
    } catch (e) {
        // If parsing fails, return as-is
        return color;
    }
}

/**
 * Verify a specific color is set in workspace settings
 */
export function expectColorSet(workspaceConfig: any, key: string, expectedColor: string, message?: string) {
    const actualColor = workspaceConfig?.['workbench']?.['colorCustomizations']?.[key];
    expect(actualColor, message || `Color ${key} should be set`).to.exist;

    const normalized = normalizeColor(actualColor);
    const expectedNormalized = normalizeColor(expectedColor);

    expect(normalized, message || `Color ${key} should match expected value`).to.equal(expectedNormalized);
}

/**
 * Verify a specific color is NOT set (undefined) in workspace settings
 */
export function expectColorUnset(workspaceConfig: any, key: string, message?: string) {
    const actualColor = workspaceConfig?.['workbench']?.['colorCustomizations']?.[key];
    expect(actualColor, message || `Color ${key} should be undefined`).to.be.undefined;
}

/**
 * Verify a color is within expected HSL ranges
 */
export function expectColorInRange(
    workspaceConfig: any,
    key: string,
    hueRange?: [number, number],
    saturationRange?: [number, number],
    lightnessRange?: [number, number],
) {
    const actualColor = workspaceConfig?.['workbench']?.['colorCustomizations']?.[key];
    expect(actualColor, `Color ${key} should be set`).to.exist;

    const color = Color(actualColor);

    if (hueRange) {
        const hue = color.hue();
        expect(hue, `Hue of ${key} should be in range`).to.be.within(hueRange[0], hueRange[1]);
    }

    if (saturationRange) {
        const saturation = color.saturationl();
        expect(saturation, `Saturation of ${key} should be in range`).to.be.within(
            saturationRange[0],
            saturationRange[1],
        );
    }

    if (lightnessRange) {
        const lightness = color.lightness();
        expect(lightness, `Lightness of ${key} should be in range`).to.be.within(lightnessRange[0], lightnessRange[1]);
    }
}

/**
 * Verify that managed colors are either set or explicitly undefined
 */
export function expectManagedColorsValid(workspaceConfig: any) {
    const colorCustomizations = workspaceConfig?.['workbench']?.['colorCustomizations'];
    expect(colorCustomizations, 'colorCustomizations should exist').to.exist;

    // All values should be strings (hex colors) or undefined
    for (const key of Object.keys(colorCustomizations)) {
        const value = colorCustomizations[key];
        expect(value === undefined || typeof value === 'string', `Color ${key} should be string or undefined`).to.be
            .true;
    }
}

/**
 * Verify no unmanaged colors were written by the extension
 */
export function expectOnlyManagedColors(workspaceConfig: any, preservedKeys: string[] = []) {
    const colorCustomizations = workspaceConfig?.['workbench']?.['colorCustomizations'];
    if (!colorCustomizations) return; // No colors set, that's fine

    const allKeys = Object.keys(colorCustomizations);
    const allowedKeys = [...MANAGED_COLORS, ...preservedKeys];

    for (const key of allKeys) {
        expect(allowedKeys.includes(key), `Unexpected color key: ${key} (not in managed colors list)`).to.be.true;
    }
}

/**
 * Verify that specific keys are preserved from original config
 */
export function expectColorsPreserved(workspaceConfig: any, originalConfig: any, keysToCheck: string[]) {
    const currentColors = workspaceConfig?.['workbench']?.['colorCustomizations'] || {};
    const originalColors = originalConfig?.['workbench']?.['colorCustomizations'] || {};

    for (const key of keysToCheck) {
        expect(currentColors[key], `Color ${key} should be preserved`).to.equal(originalColors[key]);
    }
}

/**
 * Get color customizations from mock workspace config
 */
export function getColorCustomizations(workspaceConfig: any): Record<string, string> {
    return workspaceConfig?.['workbench']?.['colorCustomizations'] || {};
}

/**
 * Count how many managed colors are currently set
 */
export function countSetColors(workspaceConfig: any): number {
    const colorCustomizations = getColorCustomizations(workspaceConfig);
    return Object.keys(colorCustomizations).filter(
        (key) => MANAGED_COLORS.includes(key) && colorCustomizations[key] !== undefined,
    ).length;
}

/**
 * Verify that two colors are similar (within tolerance)
 */
export function expectColorsSimilar(
    workspaceConfig: any,
    key1: string,
    key2: string,
    hueTolerance = 10,
    saturationTolerance = 10,
    lightnessTolerance = 10,
) {
    const colorCustomizations = getColorCustomizations(workspaceConfig);
    const color1 = Color(colorCustomizations[key1]);
    const color2 = Color(colorCustomizations[key2]);

    const hueDiff = Math.abs(color1.hue() - color2.hue());
    const satDiff = Math.abs(color1.saturationl() - color2.saturationl());
    const lightDiff = Math.abs(color1.lightness() - color2.lightness());

    expect(hueDiff, `Hue difference between ${key1} and ${key2}`).to.be.lessThan(hueTolerance);
    expect(satDiff, `Saturation difference between ${key1} and ${key2}`).to.be.lessThan(saturationTolerance);
    expect(lightDiff, `Lightness difference between ${key1} and ${key2}`).to.be.lessThan(lightnessTolerance);
}

/**
 * Verify that one color is darker than another
 */
export function expectColorDarker(workspaceConfig: any, darkerKey: string, lighterKey: string) {
    const colorCustomizations = getColorCustomizations(workspaceConfig);
    const darker = Color(colorCustomizations[darkerKey]);
    const lighter = Color(colorCustomizations[lighterKey]);

    expect(darker.lightness(), `${darkerKey} should be darker than ${lighterKey}`).to.be.lessThan(lighter.lightness());
}

/**
 * Verify that one color is lighter than another
 */
export function expectColorLighter(workspaceConfig: any, lighterKey: string, darkerKey: string) {
    const colorCustomizations = getColorCustomizations(workspaceConfig);
    const lighter = Color(colorCustomizations[lighterKey]);
    const darker = Color(colorCustomizations[darkerKey]);

    expect(lighter.lightness(), `${lighterKey} should be lighter than ${darkerKey}`).to.be.greaterThan(
        darker.lightness(),
    );
}
