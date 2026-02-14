/**
 * Theme kind enum matching VS Code's ColorThemeKind
 */
export type ThemeKind = 'dark' | 'light' | 'highContrast';

/**
 * A single color value for a specific theme
 */
export interface ThemedColorValue {
    /** The color value (hex string or CSS color name) */
    value?: string;
    /** If true, this color was auto-derived and will update when the source theme changes */
    auto: boolean;
}

/**
 * A color value that adapts to different theme types
 */
export interface ThemedColor {
    /** Color for dark themes */
    dark: ThemedColorValue;
    /** Color for light themes */
    light: ThemedColorValue;
    /** Color for high contrast themes */
    highContrast: ThemedColorValue;
}

export type PaletteSlotSource = 'fixed' | 'repoColor' | 'branchColor' | 'transparent';

export interface PaletteSlotDefinition {
    source: PaletteSlotSource;
    value?: ThemedColor; // Themed color for 'fixed'
    opacity?: number; // 0-1
    lighten?: number; // 0-1
    darken?: number; // 0-1
    highContrast?: boolean; // If true, calculates readable text color (black/white) against the source
}

export interface Palette {
    primaryActiveBg: PaletteSlotDefinition;
    primaryActiveFg: PaletteSlotDefinition;
    primaryInactiveBg: PaletteSlotDefinition;
    primaryInactiveFg: PaletteSlotDefinition;

    secondaryActiveBg: PaletteSlotDefinition;
    secondaryActiveFg: PaletteSlotDefinition;
    secondaryInactiveBg: PaletteSlotDefinition;
    secondaryInactiveFg: PaletteSlotDefinition;

    tertiaryBg: PaletteSlotDefinition;
    tertiaryFg: PaletteSlotDefinition;

    quaternaryBg: PaletteSlotDefinition;
    quaternaryFg: PaletteSlotDefinition;

    // Allow other custom slots if needed in future, but these are the standard ones
    [key: string]: PaletteSlotDefinition;
}

export interface MappingValue {
    slot: string; // Maps to a key in Palette (e.g. "primaryActiveBg") or "none" or "__fixed__"
    opacity?: number; // Optional opacity override (0-1)
    fixedColor?: string; // Fixed hex color when slot is "__fixed__"
}

export interface SectionMappings {
    [vscodeKey: string]: string | MappingValue; // Backwards compatible: can be string or object
}

export interface AdvancedProfile {
    palette: Palette;
    mappings: SectionMappings;
    virtual?: boolean; // True for temporary profiles created for simple color rules
}

export type AdvancedProfileMap = {
    [profileName: string]: AdvancedProfile;
};
