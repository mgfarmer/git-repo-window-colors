import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    deriveThemeVariant,
    createThemedColor,
    updateThemedColor,
    isThemedColor,
    resolveThemedColor,
} from '../../colorDerivation';
import { ThemedColor, ThemeKind } from '../../types/advancedModeTypes';

describe('Color Derivation', () => {
    describe('deriveThemeVariant', () => {
        it('should return same color when fromTheme === toTheme', () => {
            const color = '#3b82f6';
            const result = deriveThemeVariant(color, 'dark', 'dark');
            assert.strictEqual(result, color);
        });

        it('should derive a lighter color when going from dark to light', () => {
            const darkBlue = '#1e40af'; // Dark blue
            const result = deriveThemeVariant(darkBlue, 'dark', 'light');

            // Result should be a valid hex color
            assert.match(result, /^#[0-9a-f]{6}$/i);
            // Result should be different from input
            assert.notStrictEqual(result.toLowerCase(), darkBlue.toLowerCase());
        });

        it('should derive a darker color when going from light to dark', () => {
            const lightBlue = '#93c5fd'; // Light blue
            const result = deriveThemeVariant(lightBlue, 'light', 'dark');

            // Result should be a valid hex color
            assert.match(result, /^#[0-9a-f]{6}$/i);
            // Result should be different from input
            assert.notStrictEqual(result.toLowerCase(), lightBlue.toLowerCase());
        });

        it('should handle grayscale colors', () => {
            const gray = '#808080';
            const result = deriveThemeVariant(gray, 'dark', 'light');

            // Should return a valid hex color
            assert.match(result, /^#[0-9a-f]{6}$/i);
        });

        it('should return original color on parse error', () => {
            const invalidColor = 'not-a-color';
            const result = deriveThemeVariant(invalidColor, 'dark', 'light');
            assert.strictEqual(result, invalidColor);
        });
    });

    describe('createThemedColor', () => {
        it('should create ThemedColor with explicit value for current theme', () => {
            const color = '#3b82f6';
            const result = createThemedColor(color, 'dark');

            assert.strictEqual(result.dark.value, color);
            assert.strictEqual(result.dark.auto, false);
            assert.strictEqual(result.light.auto, true);
            assert.strictEqual(result.highContrast.auto, true);
        });

        it('should derive colors for other themes', () => {
            const color = '#3b82f6';
            const result = createThemedColor(color, 'dark');

            // Light and highContrast should have derived values
            assert.ok(result.light.value);
            assert.ok(result.highContrast.value);
            assert.match(result.light.value!, /^#[0-9a-f]{6}$/i);
            assert.match(result.highContrast.value!, /^#[0-9a-f]{6}$/i);
        });

        it('should work for all theme kinds', () => {
            const color = '#3b82f6';
            const themes: ThemeKind[] = ['dark', 'light', 'highContrast'];

            for (const theme of themes) {
                const result = createThemedColor(color, theme);
                assert.strictEqual(result[theme].value, color);
                assert.strictEqual(result[theme].auto, false);
            }
        });
    });

    describe('updateThemedColor', () => {
        it('should update target theme and mark as non-auto', () => {
            const themedColor = createThemedColor('#3b82f6', 'dark');
            const newColor = '#ef4444'; // Red
            const result = updateThemedColor(themedColor, newColor, 'light');

            assert.strictEqual(result.light.value, newColor);
            assert.strictEqual(result.light.auto, false);
        });

        it('should preserve explicit values in other themes', () => {
            let themedColor = createThemedColor('#3b82f6', 'dark');
            // Make both dark and light explicit
            themedColor = updateThemedColor(themedColor, '#10b981', 'light');

            const darkValue = themedColor.dark.value;
            const lightValue = themedColor.light.value;

            // Update high contrast
            const result = updateThemedColor(themedColor, '#f59e0b', 'highContrast');

            // Dark and light should be unchanged
            assert.strictEqual(result.dark.value, darkValue);
            assert.strictEqual(result.light.value, lightValue);
            assert.strictEqual(result.dark.auto, false);
            assert.strictEqual(result.light.auto, false);
        });

        it('should re-derive auto values from new explicit value', () => {
            const themedColor = createThemedColor('#3b82f6', 'dark');
            const newDarkColor = '#ef4444';
            const result = updateThemedColor(themedColor, newDarkColor, 'dark');

            // Dark should have new value
            assert.strictEqual(result.dark.value, newDarkColor);
            assert.strictEqual(result.dark.auto, false);

            // Light and highContrast should be re-derived from new dark color
            assert.strictEqual(result.light.auto, true);
            assert.strictEqual(result.highContrast.auto, true);
            assert.ok(result.light.value);
            assert.ok(result.highContrast.value);
        });
    });

    describe('isThemedColor', () => {
        it('should return true for valid ThemedColor object', () => {
            const themedColor = createThemedColor('#3b82f6', 'dark');
            assert.strictEqual(isThemedColor(themedColor), true);
        });

        it('should return false for string', () => {
            assert.strictEqual(isThemedColor('#3b82f6'), false);
        });

        it('should return false for null/undefined', () => {
            assert.strictEqual(isThemedColor(null), false);
            assert.strictEqual(isThemedColor(undefined), false);
        });

        it('should return false for incomplete object', () => {
            const incomplete = { dark: { value: '#000', auto: false } };
            assert.strictEqual(isThemedColor(incomplete), false);
        });

        it('should return false for object with wrong structure', () => {
            const wrong = {
                dark: '#000',
                light: '#fff',
                highContrast: '#888',
            };
            assert.strictEqual(isThemedColor(wrong), false);
        });
    });

    describe('resolveThemedColor', () => {
        it('should return color for current theme', () => {
            const themedColor = createThemedColor('#3b82f6', 'dark');
            const result = resolveThemedColor(themedColor, 'dark');
            assert.strictEqual(result, themedColor.dark.value);
        });

        it('should fall back to first defined value if current theme has no value', () => {
            const themedColor: ThemedColor = {
                dark: { value: undefined, auto: true },
                light: { value: '#3b82f6', auto: false },
                highContrast: { value: undefined, auto: true },
            };
            const result = resolveThemedColor(themedColor, 'dark');
            assert.strictEqual(result, '#3b82f6');
        });

        it('should return undefined if no values are defined', () => {
            const themedColor: ThemedColor = {
                dark: { value: undefined, auto: true },
                light: { value: undefined, auto: true },
                highContrast: { value: undefined, auto: true },
            };
            const result = resolveThemedColor(themedColor, 'dark');
            assert.strictEqual(result, undefined);
        });

        it('should handle all theme kinds correctly', () => {
            const themedColor = createThemedColor('#3b82f6', 'dark');

            assert.strictEqual(resolveThemedColor(themedColor, 'dark'), themedColor.dark.value);
            assert.strictEqual(resolveThemedColor(themedColor, 'light'), themedColor.light.value);
            assert.strictEqual(resolveThemedColor(themedColor, 'highContrast'), themedColor.highContrast.value);
        });
    });
});
