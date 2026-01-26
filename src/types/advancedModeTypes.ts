export type PaletteSlotSource = 'fixed' | 'repoColor' | 'branchColor' | 'transparent';

export interface PaletteSlotDefinition {
    source: PaletteSlotSource;
    value?: string; // Hex color for 'fixed'
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

    terminalBg: PaletteSlotDefinition;
    terminalFg: PaletteSlotDefinition;

    // Allow other custom slots if needed in future, but these are the standard 10
    [key: string]: PaletteSlotDefinition;
}

export interface SectionMappings {
    [vscodeKey: string]: string; // Maps to a key in Palette (e.g. "primaryActiveBg") or "none"/"transparent"
}

export interface AdvancedProfile {
    palette: Palette;
    mappings: SectionMappings;
}

export type AdvancedProfileMap = {
    [profileName: string]: AdvancedProfile;
};
