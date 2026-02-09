import * as chroma from 'chroma-js';
import { window } from 'vscode';

export type PaletteAlgorithm =
    | 'balanced'
    | 'monochromatic'
    | 'bold-contrast'
    | 'analogous'
    | 'analogous-minor-plus'
    | 'analogous-minor-minus'
    | 'split-complementary'
    | 'triadic'
    | 'square';

export const PALETTE_ALGORITHMS: PaletteAlgorithm[] = [
    'balanced',
    'monochromatic',
    'bold-contrast',
    'analogous',
    'analogous-minor-plus',
    'analogous-minor-minus',
    'split-complementary',
    'triadic',
    'square',
];

export interface PalettePreview {
    algorithm: PaletteAlgorithm;
    colors: [string, string, string, string]; // primary, secondary, tertiary, quaternary background colors
}

export interface GeneratedPalette {
    primaryActiveBg: string;
    primaryActiveFg: string;
    primaryInactiveBg: string;
    primaryInactiveFg: string;
    secondaryActiveBg: string;
    secondaryActiveFg: string;
    secondaryInactiveBg: string;
    secondaryInactiveFg: string;
    tertiaryActiveBg: string;
    tertiaryActiveFg: string;
    tertiaryInactiveBg: string;
    tertiaryInactiveFg: string;
    quaternaryActiveBg: string;
    quaternaryActiveFg: string;
    quaternaryInactiveBg: string;
    quaternaryInactiveFg: string;
}

/**
 * Determines if the current VS Code theme is dark or light
 */
function isThemeDark(): boolean {
    const theme = window.activeColorTheme.kind;
    // 1 = Light, 2 = Dark, 3 = High Contrast
    return theme === 2 || theme === 3;
}

/**
 * Generates an inactive background by reducing lightness by 40%
 */
function getInactiveBackground(activeBackground: any): string {
    const [l, c, h] = chroma(activeBackground).lch();
    // Reduce lightness by 40% to create a dimmed effect
    const inactiveLightness = l * 0.6;
    return chroma.lch(inactiveLightness, c, h).hex().toUpperCase();
}

/**
 * Calculates the optimal foreground color for a given background
 * to ensure WCAG AA contrast ratio of at least 4.5:1
 * Uses soft black/white instead of pure #000000/#ffffff for better UI aesthetics
 */
function getOptimalForeground(background: any): string {
    const softWhite = '#f5f5f5'; // Slightly off-white for reduced eye strain
    const softBlack = '#1a1a1a'; // Very dark gray instead of pure black

    const whiteContrast = chroma.contrast(background, softWhite);
    const blackContrast = chroma.contrast(background, softBlack);

    // Prefer soft white for better readability in VS Code, but use soft black if contrast is better
    if (whiteContrast >= 4.5) {
        return softWhite;
    } else if (blackContrast >= 4.5) {
        return softBlack;
    } else {
        // If neither meets WCAG AA, choose the one with better contrast
        return whiteContrast > blackContrast ? softWhite : softBlack;
    }
}

/**
 * Generates a visually pleasing color palette from a primary background color
 *
 * @param primaryBg - The primary background color (hex, rgb, or any valid CSS color)
 * @param algorithm - The algorithm to use for palette generation
 * @returns A complete palette with all background and foreground colors
 */
export function generatePalette(primaryBg: string, algorithm: PaletteAlgorithm = 'balanced'): GeneratedPalette {
    const isDark = isThemeDark();
    const base = chroma(primaryBg);

    let backgrounds: chroma.Color[];

    switch (algorithm) {
        case 'balanced':
            // Tetradic palette (90° hue rotations) in LCH space for perceptual uniformity
            backgrounds = generateBalancedPalette(base, isDark);
            break;

        case 'monochromatic':
            // Same hue, varied lightness and saturation
            backgrounds = generateMonochromaticPalette(base, isDark);
            break;

        case 'bold-contrast':
            // High saturation complementary colors
            backgrounds = generateBoldContrastPalette(base, isDark);
            break;

        case 'analogous':
            // Adjacent hues (±30°) for a harmonious, serene palette
            backgrounds = generateAnalogousPalette(base, isDark);
            break;

        case 'analogous-minor-plus':
            // Small positive hue steps (+10°) for subtle variation
            backgrounds = generateAnalogousMinorPlusPalette(base, isDark);
            break;

        case 'analogous-minor-minus':
            // Small negative hue steps (-10°) for subtle variation
            backgrounds = generateAnalogousMinorMinusPalette(base, isDark);
            break;

        case 'split-complementary':
            // Base + two colors adjacent to complement for balanced contrast
            backgrounds = generateSplitComplementaryPalette(base, isDark);
            break;

        case 'triadic':
            // Three colors 120° apart for vibrant but balanced results
            backgrounds = generateTriadicPalette(base, isDark);
            break;

        case 'square':
            // Four colors 90° apart with consistent saturation
            backgrounds = generateSquarePalette(base, isDark);
            break;

        default:
            backgrounds = generateBalancedPalette(base, isDark);
    }

    // Generate foregrounds with optimal contrast
    // Note: Inactive foregrounds use the same color as active foregrounds (no opacity reduction)
    // for maximum readability against the dimmed inactive backgrounds.
    const foregrounds = backgrounds.map((bg) => getOptimalForeground(bg));

    // Generate inactive backgrounds by reducing lightness by 40%
    const inactiveBackgrounds = backgrounds.map((bg) => getInactiveBackground(bg));

    return {
        primaryActiveBg: backgrounds[0].hex().toUpperCase(),
        primaryActiveFg: foregrounds[0],
        primaryInactiveBg: inactiveBackgrounds[0],
        primaryInactiveFg: foregrounds[0], // Same as active for readability
        secondaryActiveBg: backgrounds[1].hex().toUpperCase(),
        secondaryActiveFg: foregrounds[1],
        secondaryInactiveBg: inactiveBackgrounds[1],
        secondaryInactiveFg: foregrounds[1], // Same as active for readability
        tertiaryActiveBg: backgrounds[2].hex().toUpperCase(),
        tertiaryActiveFg: foregrounds[2],
        tertiaryInactiveBg: inactiveBackgrounds[2],
        tertiaryInactiveFg: foregrounds[2], // Same as active for readability
        quaternaryActiveBg: backgrounds[3].hex().toUpperCase(),
        quaternaryActiveFg: foregrounds[3],
        quaternaryInactiveBg: inactiveBackgrounds[3],
        quaternaryInactiveFg: foregrounds[3], // Same as active for readability
    };
}

/**
 * Generates preview colors for all palette algorithms
 * Returns the 4 active background colors for each algorithm
 *
 * @param primaryBg - The primary background color to base previews on
 * @returns Array of preview objects with algorithm name and 4 background colors
 */
export function generateAllPalettePreviews(primaryBg: string): PalettePreview[] {
    const isDark = isThemeDark();
    const base = chroma(primaryBg);

    return PALETTE_ALGORITHMS.map((algorithm) => {
        let backgrounds: chroma.Color[];

        switch (algorithm) {
            case 'balanced':
                backgrounds = generateBalancedPalette(base, isDark);
                break;
            case 'monochromatic':
                backgrounds = generateMonochromaticPalette(base, isDark);
                break;
            case 'bold-contrast':
                backgrounds = generateBoldContrastPalette(base, isDark);
                break;
            case 'analogous':
                backgrounds = generateAnalogousPalette(base, isDark);
                break;
            case 'analogous-minor-plus':
                backgrounds = generateAnalogousMinorPlusPalette(base, isDark);
                break;
            case 'analogous-minor-minus':
                backgrounds = generateAnalogousMinorMinusPalette(base, isDark);
                break;
            case 'split-complementary':
                backgrounds = generateSplitComplementaryPalette(base, isDark);
                break;
            case 'triadic':
                backgrounds = generateTriadicPalette(base, isDark);
                break;
            case 'square':
                backgrounds = generateSquarePalette(base, isDark);
                break;
            default:
                backgrounds = generateBalancedPalette(base, isDark);
        }

        return {
            algorithm,
            colors: [
                backgrounds[0].hex().toUpperCase(),
                backgrounds[1].hex().toUpperCase(),
                backgrounds[2].hex().toUpperCase(),
                backgrounds[3].hex().toUpperCase(),
            ] as [string, string, string, string],
        };
    });
}

/**
 * Balanced Tetradic - Colors evenly spaced on the color wheel (90° apart)
 * Adjusts lightness based on theme to ensure visibility
 */
function generateBalancedPalette(base: any, isDark: boolean): any[] {
    // Get base in LCH for perceptually uniform modifications
    const [l, c, h] = base.lch();

    // Target lightness based on theme
    // Dark themes: lighter backgrounds (60-75)
    // Light themes: keep original or darken slightly (30-50)
    const targetLightness = isDark ? Math.max(l, 60) : Math.min(l, 50);

    // Target chroma (saturation) - slightly reduce for professional look
    const targetChroma = Math.min(c, 50);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, targetChroma * 0.9, (h + 90) % 360), // Secondary (+90°)
        chroma.lch(targetLightness, targetChroma * 0.85, (h + 180) % 360), // Tertiary (+180°)
        chroma.lch(targetLightness, targetChroma * 0.95, (h + 270) % 360), // Quaternary (+270°)
    ];
}

/**
 * Monochromatic - Same hue with varying lightness and saturation
 */
function generateMonochromaticPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    if (isDark) {
        // Dark theme: Progress from darker to lighter
        return [base, chroma.lch(l + 5, c * 0.8, h), chroma.lch(l + 10, c * 0.6, h), chroma.lch(l + 15, c * 0.4, h)];
    } else {
        // Light theme: Progress from lighter to darker
        return [base, chroma.lch(l - 5, c * 0.8, h), chroma.lch(l - 10, c * 0.6, h), chroma.lch(l - 15, c * 0.4, h)];
    }
}

/**
 * Bold Contrast - High saturation with complementary and triadic colors
 */
function generateBoldContrastPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    // Boost saturation for bold look
    const boldChroma = Math.min(c * 1.3, 100);
    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, boldChroma, (h + 120) % 360), // Triadic 1
        chroma.lch(targetLightness, boldChroma, (h + 180) % 360), // Complementary
        chroma.lch(targetLightness, boldChroma, (h + 240) % 360), // Triadic 2
    ];
}

/**
 * Analogous - Adjacent hues (±30°) for harmonious, serene palettes
 */
function generateAnalogousPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 60);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, targetChroma * 0.95, (h + 30) % 360), // +30°
        chroma.lch(targetLightness, targetChroma * 0.9, (h + 60) % 360), // +60°
        chroma.lch(targetLightness, targetChroma * 0.95, (h - 30 + 360) % 360), // -30°
    ];
}

/**
 * Analogous Minor+ - Small positive hue steps (+10°) for very subtle variation
 * Creates a gentle progression through the color wheel
 */
function generateAnalogousMinorPlusPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 60);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, targetChroma * 0.95, (h + 10) % 360), // +10°
        chroma.lch(targetLightness, targetChroma * 0.9, (h + 20) % 360), // +20°
        chroma.lch(targetLightness, targetChroma * 0.85, (h + 30) % 360), // +30°
    ];
}

/**
 * Analogous Minor- - Small negative hue steps (-10°) for very subtle variation
 * Creates a gentle progression through the color wheel in the opposite direction
 */
function generateAnalogousMinorMinusPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 60);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, targetChroma * 0.95, (h - 10 + 360) % 360), // -10°
        chroma.lch(targetLightness, targetChroma * 0.9, (h - 20 + 360) % 360), // -20°
        chroma.lch(targetLightness, targetChroma * 0.85, (h - 30 + 360) % 360), // -30°
    ];
}

/**
 * Split-Complementary - Base + two colors adjacent to the complement
 * Provides contrast without the tension of direct complementary colors
 */
function generateSplitComplementaryPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 55);

    return [
        base, // Primary (unchanged)
        chroma.lch(targetLightness, targetChroma, (h + 150) % 360), // Complement -30°
        chroma.lch(targetLightness, targetChroma * 0.9, (h + 180) % 360), // Direct complement (subtle)
        chroma.lch(targetLightness, targetChroma, (h + 210) % 360), // Complement +30°
    ];
}

/**
 * Triadic - Three colors 120° apart for vibrant but balanced palettes
 */
function generateTriadicPalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 60);

    return [
        chroma.lch(l, c, h), // Primary (reconstructed from LCH for consistency)
        chroma.lch(targetLightness, targetChroma, (h + 120) % 360), // +120°
        chroma.lch(targetLightness, targetChroma * 0.95, (h + 240) % 360), // +240°
        chroma.lch(targetLightness, targetChroma * 0.85, (h + 60) % 360), // +60° (mid-point accent)
    ];
}

/**
 * Square - Four colors 90° apart with uniform saturation
 * Similar to balanced but maintains consistent chroma for bolder effect
 */
function generateSquarePalette(base: any, isDark: boolean): any[] {
    const [l, c, h] = base.lch();

    const targetLightness = isDark ? Math.max(l, 55) : Math.min(l, 55);
    const targetChroma = Math.min(c, 65); // Slightly higher chroma for bold look

    return [
        chroma.lch(l, c, h), // Primary (reconstructed from LCH for consistency)
        chroma.lch(targetLightness, targetChroma, (h + 90) % 360), // +90°
        chroma.lch(targetLightness, targetChroma, (h + 180) % 360), // +180°
        chroma.lch(targetLightness, targetChroma, (h + 270) % 360), // +270°
    ];
}
