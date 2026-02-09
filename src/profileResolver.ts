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
        for (const [uiKey, mappingValue] of Object.entries(profile.mappings)) {
            // Handle both string (legacy) and object (new with opacity) formats
            let slotName: string;
            let mappingOpacity: number | undefined;
            let fixedColor: string | undefined;

            if (typeof mappingValue === 'string') {
                slotName = mappingValue;
            } else {
                slotName = mappingValue.slot;
                mappingOpacity = mappingValue.opacity;
                fixedColor = mappingValue.fixedColor;
            }

            if (!slotName || slotName === 'none' || slotName === 'transparent') {
                // Keep 'transparent' check for backwards compatibility
                finalColors[uiKey] = undefined;
            } else if (slotName === '__fixed__' && fixedColor) {
                // Handle fixed color directly from mapping
                try {
                    let c = Color(fixedColor);

                    // Apply mapping-level opacity if specified
                    if (mappingOpacity !== undefined && mappingOpacity >= 0 && mappingOpacity <= 1) {
                        c = c.alpha(mappingOpacity);
                    }

                    if (c.alpha() < 1) {
                        // Use #RRGGBBAA format for colors with alpha channel
                        const hex = c.hex().toUpperCase();
                        const alpha = Math.round(c.alpha() * 255)
                            .toString(16)
                            .toUpperCase()
                            .padStart(2, '0');
                        finalColors[uiKey] = hex + alpha;
                    } else {
                        finalColors[uiKey] = c.hex().toUpperCase();
                    }
                } catch (e) {
                    console.warn(`[AdvancedMode] Error parsing fixed color for ${uiKey}:`, e);
                }
            } else if (paletteResults[slotName]) {
                let c = paletteResults[slotName];

                // Apply mapping-level opacity if specified
                if (mappingOpacity !== undefined && mappingOpacity >= 0 && mappingOpacity <= 1) {
                    c = c.alpha(mappingOpacity);
                }

                if (c.alpha() < 1) {
                    // Use #RRGGBBAA format for colors with alpha channel
                    const hex = c.hex().toUpperCase();
                    const alpha = Math.round(c.alpha() * 255)
                        .toString(16)
                        .toUpperCase()
                        .padStart(2, '0');
                    finalColors[uiKey] = hex + alpha;
                } else {
                    finalColors[uiKey] = c.hex().toUpperCase();
                }
            }
        }
    }

    return finalColors;
}
