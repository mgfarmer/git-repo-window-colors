/**
 * Color Utility Functions
 *
 * Pure functions for color space conversions and palette generation.
 * Extracted from wvConfigWebview.ts for testability.
 *
 * All functions are pure (no DOM dependencies, no side effects).
 */

/**
 * Convert hex color to HSL components
 * @param hex - Hex color string (with or without #)
 * @returns Tuple of [hue (0-360), saturation (0-100), lightness (0-100)]
 */
export function hexToHsl(hex: string): [number, number, number] {
    // Remove # if present
    hex = hex.replace(/^#/, '');

    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL to hex color
 * @param h - Hue (0-360 degrees)
 * @param s - Saturation (0-100 percent)
 * @param l - Lightness (0-100 percent)
 * @returns Hex color string with # prefix
 */
export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360; // Normalize hue to 0-360
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
        g = 0,
        b = 0;

    if (h < 60) {
        r = c;
        g = x;
        b = 0;
    } else if (h < 120) {
        r = x;
        g = c;
        b = 0;
    } else if (h < 180) {
        r = 0;
        g = c;
        b = x;
    } else if (h < 240) {
        r = 0;
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }

    const toHex = (v: number) =>
        Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert hex color to rgba with opacity
 * @param hex - Hex color string (with or without #)
 * @param opacity - Opacity value (0-1)
 * @returns RGBA color string
 */
export function hexToRgba(hex: string, opacity: number): string {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse the hex values
    let r: number, g: number, b: number;

    if (hex.length === 3) {
        // Short form like #RGB
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        // Long form like #RRGGBB
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        // Invalid hex, return transparent
        return 'rgba(0, 0, 0, 0)';
    }

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Parse RGB string and convert to hex
 * @param rgb - RGB color string like "rgb(255, 0, 0)"
 * @returns Hex color string with # prefix, or null if parsing fails
 */
export function rgbToHex(rgb: string): string | null {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return null;

    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}

/**
 * Generate preview colors for a palette algorithm
 * @param primaryHex - Primary hex color as base
 * @param algorithm - Algorithm name (balanced, monochromatic, etc.)
 * @returns Array of 4 hex color strings
 */
export function generatePreviewColors(primaryHex: string, algorithm: string): string[] {
    const [h, s, l] = hexToHsl(primaryHex);

    switch (algorithm) {
        case 'balanced':
            return [
                primaryHex,
                hslToHex(h + 90, s * 0.9, l),
                hslToHex(h + 180, s * 0.85, l),
                hslToHex(h + 270, s * 0.95, l),
            ];
        case 'monochromatic':
            return [
                primaryHex,
                hslToHex(h, s * 0.8, Math.min(100, l + 8)),
                hslToHex(h, s * 0.6, Math.min(100, l + 16)),
                hslToHex(h, s * 0.4, Math.min(100, l + 24)),
            ];
        case 'bold-contrast':
            return [
                primaryHex,
                hslToHex(h + 120, Math.min(100, s * 1.3), l),
                hslToHex(h + 180, Math.min(100, s * 1.3), l),
                hslToHex(h + 240, Math.min(100, s * 1.3), l),
            ];
        case 'analogous':
            return [
                primaryHex,
                hslToHex(h + 30, s * 0.95, l),
                hslToHex(h + 60, s * 0.9, l),
                hslToHex(h - 30, s * 0.95, l),
            ];
        case 'analogous-minor-plus':
            return [
                primaryHex,
                hslToHex(h + 10, s * 0.95, l),
                hslToHex(h + 20, s * 0.9, l),
                hslToHex(h + 30, s * 0.85, l),
            ];
        case 'analogous-minor-minus':
            return [
                primaryHex,
                hslToHex(h - 10, s * 0.95, l),
                hslToHex(h - 20, s * 0.9, l),
                hslToHex(h - 30, s * 0.85, l),
            ];
        case 'split-complementary':
            return [primaryHex, hslToHex(h + 150, s, l), hslToHex(h + 180, s * 0.9, l), hslToHex(h + 210, s, l)];
        case 'triadic':
            return [primaryHex, hslToHex(h + 120, s, l), hslToHex(h + 240, s * 0.95, l), hslToHex(h + 60, s * 0.85, l)];
        case 'square':
            return [primaryHex, hslToHex(h + 90, s, l), hslToHex(h + 180, s, l), hslToHex(h + 270, s, l)];
        default:
            return [primaryHex, primaryHex, primaryHex, primaryHex];
    }
}

/**
 * Get contrasting text color (black or white) for a background color
 * @param color - Background color (hex string or named color)
 * @returns '#000000' for light backgrounds, '#ffffff' for dark backgrounds
 */
export function getContrastingTextColor(color: string): string {
    // For hex colors
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 155 ? '#000000' : '#ffffff';
    }
    // For named colors or rgb(), default to white text
    return '#ffffff';
}
