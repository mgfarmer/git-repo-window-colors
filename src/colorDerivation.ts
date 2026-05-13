/**
 * Color derivation utilities for theme-aware colors
 *
 * This module provides functions to derive color variants for different themes
 * (dark, light, high contrast) and manage the auto-derivation state.
 */

import chroma from 'chroma-js';
import { ThemedColor, ThemeKind } from './types/advancedModeTypes';

/**
 * Strategy function type for deriving colors between themes
 */
export type ColorDerivationStrategy = (baseColor: string, fromTheme: ThemeKind, toTheme: ThemeKind) => string;

/**
 * Default color derivation strategy using lightness inversion
 *
 * This strategy inverts the lightness while preserving hue and saturation.
 * For example, a dark blue becomes a light blue and vice versa.
 */
export const lightnessInversionStrategy: ColorDerivationStrategy = (
    baseColor: string,
    fromTheme: ThemeKind,
    toTheme: ThemeKind,
): string => {
    try {
        const color = chroma(baseColor);
        const [h, s, l] = color.hsl();

        // Determine target lightness based on theme transition
        let targetLightness: number;

        if (toTheme === 'light' && (fromTheme === 'dark' || fromTheme === 'highContrast')) {
            // Dark to light: invert lightness (flip around 0.5)
            targetLightness = 1 - l;
            // Ensure minimum lightness for visibility on light backgrounds
            if (targetLightness > 0.85) {
                targetLightness = 0.35 + (targetLightness - 0.85) * 0.5;
            }
        } else if (toTheme === 'dark' && fromTheme === 'light') {
            // Light to dark: invert lightness
            targetLightness = 1 - l;
            // Ensure colors aren't too bright on dark backgrounds
            if (targetLightness > 0.75) {
                targetLightness = 0.6 + (targetLightness - 0.75) * 0.3;
            }
        } else if (toTheme === 'highContrast') {
            // To high contrast: similar to dark but with more saturation
            if (fromTheme === 'light') {
                targetLightness = 1 - l;
            } else {
                // Keep similar lightness but boost
                targetLightness = Math.min(0.7, l + 0.1);
            }
        } else {
            // Same theme or high contrast to dark - keep similar lightness
            targetLightness = l;
        }

        // Clamp to valid range
        targetLightness = Math.max(0.1, Math.min(0.9, targetLightness));

        return chroma.hsl(h, s, targetLightness).hex();
    } catch (error) {
        // If color parsing fails, return original
        return baseColor;
    }
};

// Default strategy to use
let currentStrategy: ColorDerivationStrategy = lightnessInversionStrategy;

/**
 * Sets the color derivation strategy to use
 *
 * @param strategy - The strategy function to use for deriving colors
 */
export function setColorDerivationStrategy(strategy: ColorDerivationStrategy): void {
    currentStrategy = strategy;
}

/**
 * Derives a color variant for a different theme
 *
 * @param baseColor - The base color (hex string or CSS color name)
 * @param fromTheme - The theme the base color is designed for
 * @param toTheme - The target theme to derive for
 * @returns The derived color as a hex string
 */
export function deriveThemeVariant(baseColor: string, fromTheme: ThemeKind, toTheme: ThemeKind): string {
    if (fromTheme === toTheme) {
        return baseColor;
    }
    return currentStrategy(baseColor, fromTheme, toTheme);
}

/**
 * Creates a full ThemedColor object from a single color value
 *
 * The provided color is set as explicit (auto=false) for the current theme,
 * and derived colors (auto=true) are generated for the other themes.
 *
 * @param color - The explicit color value
 * @param currentTheme - The theme the color is being set for
 * @returns A complete ThemedColor object
 */
export function createThemedColor(color: string, currentTheme: ThemeKind): ThemedColor {
    const themedColor: ThemedColor = {
        dark: { value: undefined, auto: true },
        light: { value: undefined, auto: true },
        highContrast: { value: undefined, auto: true },
    };

    // Set the explicit color for current theme
    themedColor[currentTheme] = { value: color, auto: false };

    // Derive colors for other themes
    const themes: ThemeKind[] = ['dark', 'light', 'highContrast'];
    for (const theme of themes) {
        if (theme !== currentTheme) {
            themedColor[theme] = {
                value: deriveThemeVariant(color, currentTheme, theme),
                auto: true,
            };
        }
    }

    return themedColor;
}

/**
 * Updates a ThemedColor object with a new color for a specific theme
 *
 * This function:
 * - Sets the target theme's value and marks it as explicit (auto=false)
 * - Re-derives colors for other themes that still have auto=true
 * - Preserves explicit colors (auto=false) in other themes
 *
 * @param themedColor - The existing ThemedColor object
 * @param newColor - The new color value
 * @param themeKind - The theme being updated
 * @returns A new ThemedColor object with updated values
 */
export function updateThemedColor(themedColor: ThemedColor, newColor: string, themeKind: ThemeKind): ThemedColor {
    // Create a copy
    const updated: ThemedColor = {
        dark: { ...themedColor.dark },
        light: { ...themedColor.light },
        highContrast: { ...themedColor.highContrast },
    };

    // Update the target theme (explicit choice)
    updated[themeKind] = { value: newColor, auto: false };

    // Re-derive auto colors from the new explicit value
    const themes: ThemeKind[] = ['dark', 'light', 'highContrast'];
    for (const theme of themes) {
        if (theme !== themeKind && updated[theme].auto) {
            updated[theme] = {
                value: deriveThemeVariant(newColor, themeKind, theme),
                auto: true,
            };
        }
    }

    return updated;
}

/**
 * Checks if a value is a ThemedColor object
 *
 * @param value - Value to check
 * @returns True if value is a ThemedColor object
 */
export function isThemedColor(value: any): value is ThemedColor {
    return Boolean(
        value &&
            typeof value === 'object' &&
            'dark' in value &&
            'light' in value &&
            'highContrast' in value &&
            typeof value.dark === 'object' &&
            typeof value.light === 'object' &&
            typeof value.highContrast === 'object' &&
            'auto' in value.dark &&
            'auto' in value.light &&
            'auto' in value.highContrast,
    );
}

/**
 * Extracts the appropriate color value from a ThemedColor for the current theme
 *
 * @param themedColor - ThemedColor object or 'none' for no coloring
 * @param currentTheme - The current theme kind
 * @returns The color string for the current theme, or undefined if 'none'
 */
export function resolveThemedColor(themedColor: ThemedColor | 'none', currentTheme: ThemeKind): string | undefined {
    if (themedColor === 'none') {
        return undefined;
    }

    if (isThemedColor(themedColor)) {
        const themeValue = themedColor[currentTheme];
        if (themeValue.value) {
            return themeValue.value;
        }

        // Fallback: try to find any defined value
        for (const theme of ['dark', 'light', 'highContrast'] as ThemeKind[]) {
            if (themedColor[theme].value) {
                return themedColor[theme].value;
            }
        }
    }

    return undefined;
}

/**
 * Generate a random color that is visually dissimilar to a set of existing colors.
 *
 * Uses HSL hue-gap strategy: finds the largest angular gap among existing hues
 * on the color wheel and places the new hue in the center of that gap.
 *
 * @param existingHexColors - Array of hex color strings already in use
 * @returns Hex color string (e.g. "#3a7f5c")
 */
export function generateDissimilarColor(existingHexColors: string[], baseColorHex?: string): string {
    let saturation = 65; // moderate saturation, vivid but not neon
    let lightness = 45; // works well on dark title bars

    // If a base color is provided, derive S and L from it
    if (baseColorHex) {
        try {
            const [, s, l] = chroma(baseColorHex).hsl();
            if (!isNaN(s) && !isNaN(l)) {
                saturation = s * 100;
                lightness = l * 100;
            }
        } catch {
            // fall back to defaults
        }
    }

    // Extract hues from existing colors, filtering out achromatic colors
    const hues: number[] = [];
    for (const hex of existingHexColors) {
        try {
            const [h, s] = chroma(hex).hsl();
            // Only consider chromatic colors (saturation > 5%)
            if (s > 0.05 && !isNaN(h)) {
                hues.push(h);
            }
        } catch {
            // skip invalid colors
        }
    }

    let newHue: number;

    if (hues.length === 0) {
        // No existing colors — pick a random hue
        newHue = Math.random() * 360;
    } else {
        // Sort hues and find the largest angular gap
        hues.sort((a, b) => a - b);

        let maxGap = 0;
        let gapStart = 0;

        for (let i = 0; i < hues.length - 1; i++) {
            const gap = hues[i + 1] - hues[i];
            if (gap > maxGap) {
                maxGap = gap;
                gapStart = hues[i];
            }
        }

        // Check wrap-around gap (last hue to first hue + 360)
        const wrapGap = 360 - hues[hues.length - 1] + hues[0];
        if (wrapGap > maxGap) {
            maxGap = wrapGap;
            gapStart = hues[hues.length - 1];
        }

        // Place new hue in the middle of the largest gap
        newHue = (gapStart + maxGap / 2) % 360;
    }

    return chroma.hsl(newHue, saturation / 100, lightness / 100).hex();
}
