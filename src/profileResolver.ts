import * as Color from 'color';
import { AdvancedProfile } from './types/advancedModeTypes';

export function resolveProfile(
    profile: AdvancedProfile,
    repoColor: Color,
    branchColor: Color,
): { [key: string]: string | undefined } {
    const paletteResults: { [key: string]: Color } = {};

    // 1. Resolve Palette
    if (profile.palette) {
        for (const [slotName, def] of Object.entries(profile.palette)) {
            let baseColor: Color;

            try {
                if (def.source === 'fixed' && def.value) {
                    baseColor = Color(def.value);
                } else if (def.source === 'repoColor') {
                    baseColor = repoColor;
                } else if (def.source === 'branchColor') {
                    baseColor = branchColor;
                } else {
                    // source is transparent or invalid
                    continue;
                }
            } catch (e) {
                console.warn(`[AdvancedMode] Error parsing color for slot ${slotName}:`, e);
                continue;
            }

            // Apply Modifiers
            if (def.highContrast) {
                if (baseColor.isDark()) {
                    baseColor = Color('#ffffff');
                } else {
                    baseColor = Color('#000000');
                }
            } else {
                if (def.lighten !== undefined) {
                    baseColor = baseColor.lighten(def.lighten);
                }
                if (def.darken !== undefined) {
                    baseColor = baseColor.darken(def.darken);
                }
                if (def.opacity !== undefined) {
                    baseColor = baseColor.alpha(def.opacity);
                }
            }

            paletteResults[slotName] = baseColor;
        }
    }

    // 2. Resolve Mappings
    const finalColors: { [key: string]: string | undefined } = {};
    if (profile.mappings) {
        for (const [uiKey, slotName] of Object.entries(profile.mappings)) {
            if (!slotName || slotName === 'none' || slotName === 'transparent') {
                finalColors[uiKey] = undefined;
            } else if (paletteResults[slotName]) {
                const c = paletteResults[slotName];
                if (c.alpha() < 1) {
                    // Use rgba string for transparency support
                    finalColors[uiKey] = c.rgb().string();
                } else {
                    finalColors[uiKey] = c.hex();
                }
            }
        }
    }

    return finalColors;
}
