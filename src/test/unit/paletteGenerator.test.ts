import { expect } from 'chai';
import { generatePalette, PALETTE_ALGORITHMS } from '../../paletteGenerator';
import Color from 'color';
import chroma from 'chroma-js';

describe('PaletteGenerator', () => {
    describe('generatePalette', () => {
        it('should generate a complete palette with all required keys', () => {
            const result = generatePalette('#3b82f6', 'balanced');

            // Check all required palette keys exist
            expect(result).to.have.all.keys(
                'primaryActiveBg',
                'primaryActiveFg',
                'primaryInactiveBg',
                'primaryInactiveFg',
                'secondaryActiveBg',
                'secondaryActiveFg',
                'secondaryInactiveBg',
                'secondaryInactiveFg',
                'tertiaryActiveBg',
                'tertiaryActiveFg',
                'tertiaryInactiveBg',
                'tertiaryInactiveFg',
                'quaternaryActiveBg',
                'quaternaryActiveFg',
                'quaternaryInactiveBg',
                'quaternaryInactiveFg',
            );

            // All values should be hex color strings
            Object.values(result).forEach((value) => {
                expect(value).to.match(/^#[0-9A-Fa-f]{6}$/);
            });
        });

        it('should use the provided color as primaryActiveBg', () => {
            const primaryColor = '#FF5733';
            const result = generatePalette(primaryColor, 'balanced');

            // Primary active background should match input (case-insensitive)
            expect(result.primaryActiveBg.toLowerCase()).to.equal(primaryColor.toLowerCase());
        });

        describe('Algorithm Variations', () => {
            PALETTE_ALGORITHMS.forEach((algorithm) => {
                it(`should generate valid palette for ${algorithm} algorithm`, () => {
                    const result = generatePalette('#3b82f6', algorithm);

                    // Should have all keys
                    expect(Object.keys(result)).to.have.length(16);

                    // All should be valid colors
                    Object.entries(result).forEach(([key, value]) => {
                        expect(value, `${key} should be valid hex color`).to.match(/^#[0-9A-Fa-f]{6}$/);
                    });
                });
            });
        });

        describe('Inactive Background Generation', () => {
            it('should generate darker inactive backgrounds than active', () => {
                const result = generatePalette('#3b82f6', 'balanced');

                // Primary inactive should be darker than primary active
                const primaryActive = Color(result.primaryActiveBg);
                const primaryInactive = Color(result.primaryInactiveBg);
                expect(primaryInactive.lightness()).to.be.lessThan(primaryActive.lightness());

                // Secondary inactive should be darker than secondary active
                const secondaryActive = Color(result.secondaryActiveBg);
                const secondaryInactive = Color(result.secondaryInactiveBg);
                expect(secondaryInactive.lightness()).to.be.lessThan(secondaryActive.lightness());

                // Tertiary inactive should be darker than tertiary active
                const tertiaryActive = Color(result.tertiaryActiveBg);
                const tertiaryInactive = Color(result.tertiaryInactiveBg);
                expect(tertiaryInactive.lightness()).to.be.lessThan(tertiaryActive.lightness());

                // Quaternary inactive should be darker than quaternary active
                const quaternaryActive = Color(result.quaternaryActiveBg);
                const quaternaryInactive = Color(result.quaternaryInactiveBg);
                expect(quaternaryInactive.lightness()).to.be.lessThan(quaternaryActive.lightness());
            });
        });

        describe('Foreground Color Contrast', () => {
            it('should generate readable foreground colors for dark backgrounds', () => {
                const darkBlue = '#1e3a5f'; // Dark blue
                const result = generatePalette(darkBlue, 'balanced');

                // Foreground on dark background should be light
                const fg = Color(result.primaryActiveFg);
                expect(fg.lightness()).to.be.greaterThan(50); // Should be lighter than middle gray
            });

            it('should generate readable foreground colors for light backgrounds', () => {
                const lightBlue = '#87CEEB'; // Sky blue (light)
                const result = generatePalette(lightBlue, 'balanced');

                // Foreground on light background should be dark
                const fg = Color(result.primaryActiveFg);
                expect(fg.lightness()).to.be.lessThan(50); // Should be darker than middle gray
            });

            it('should provide sufficient contrast for all foreground/background pairs', () => {
                const result = generatePalette('#3b82f6', 'balanced');

                // Helper to calculate contrast ratio
                const getContrast = (fg: string, bg: string): number => {
                    const fgColor = Color(fg);
                    const bgColor = Color(bg);
                    const fgLum = fgColor.luminosity();
                    const bgLum = bgColor.luminosity();
                    const lighter = Math.max(fgLum, bgLum);
                    const darker = Math.min(fgLum, bgLum);
                    return (lighter + 0.05) / (darker + 0.05);
                };

                // Check all active pairs have decent contrast (at least 3:1 for UI)
                const minContrast = 3;
                expect(getContrast(result.primaryActiveFg, result.primaryActiveBg)).to.be.at.least(minContrast);
                expect(getContrast(result.secondaryActiveFg, result.secondaryActiveBg)).to.be.at.least(minContrast);
                expect(getContrast(result.tertiaryActiveFg, result.tertiaryActiveBg)).to.be.at.least(minContrast);
                expect(getContrast(result.quaternaryActiveFg, result.quaternaryActiveBg)).to.be.at.least(minContrast);
            });
        });

        describe('Algorithm-Specific Behavior', () => {
            it('monochromatic should generate similar hues', () => {
                const result = generatePalette('#3b82f6', 'monochromatic');

                // All backgrounds should have similar hue (within 30 degrees)
                const primaryHue = Color(result.primaryActiveBg).hue();
                const secondaryHue = Color(result.secondaryActiveBg).hue();
                const tertiaryHue = Color(result.tertiaryActiveBg).hue();

                const hueDiff1 = Math.abs(primaryHue - secondaryHue);
                const hueDiff2 = Math.abs(primaryHue - tertiaryHue);

                expect(hueDiff1).to.be.lessThan(30);
                expect(hueDiff2).to.be.lessThan(30);
            });

            it('bold-contrast should generate complementary colors', () => {
                const result = generatePalette('#3b82f6', 'bold-contrast');

                const primaryHue = Color(result.primaryActiveBg).hue();
                const secondaryHue = Color(result.secondaryActiveBg).hue();

                // Complementary colors are ~180 degrees apart
                const hueDiff = Math.abs(primaryHue - secondaryHue);
                expect(hueDiff).to.be.within(150, 210); // Allow some tolerance
            });

            it('triadic should space colors ~120 degrees apart', () => {
                const result = generatePalette('#3b82f6', 'triadic');

                // Use LCH hue to match algorithm implementation
                const primaryHue = chroma(result.primaryActiveBg).lch()[2];
                const secondaryHue = chroma(result.secondaryActiveBg).lch()[2];
                const tertiaryHue = chroma(result.tertiaryActiveBg).lch()[2];

                // Calculate normalized differences
                const diff1 = Math.abs((secondaryHue - primaryHue + 360) % 360);
                const diff2 = Math.abs((tertiaryHue - primaryHue + 360) % 360);

                // Should be roughly 120 and 240 degrees apart
                expect(diff1).to.be.within(90, 150);
                expect(diff2).to.be.within(210, 270);
            });

            it('square should space colors ~90 degrees apart', () => {
                const result = generatePalette('#3b82f6', 'square');

                // Use LCH hue to match algorithm implementation
                const primaryHue = chroma(result.primaryActiveBg).lch()[2];
                const secondaryHue = chroma(result.secondaryActiveBg).lch()[2];
                const tertiaryHue = chroma(result.tertiaryActiveBg).lch()[2];
                const quaternaryHue = chroma(result.quaternaryActiveBg).lch()[2];

                // Calculate differences
                const diff1 = Math.abs((secondaryHue - primaryHue + 360) % 360);
                const diff2 = Math.abs((tertiaryHue - primaryHue + 360) % 360);
                const diff3 = Math.abs((quaternaryHue - primaryHue + 360) % 360);

                // Should be roughly 90, 180, and 270 degrees apart
                expect(diff1).to.be.within(60, 120);
                expect(diff2).to.be.within(150, 210);
                expect(diff3).to.be.within(240, 300);
            });
        });

        describe('Input Validation', () => {
            it('should handle named CSS colors', () => {
                const result = generatePalette('blue', 'balanced');
                expect(result.primaryActiveBg).to.exist;
                expect(result.primaryActiveBg).to.match(/^#[0-9A-Fa-f]{6}$/);
            });

            it('should handle RGB format', () => {
                const result = generatePalette('rgb(59, 130, 246)', 'balanced');
                expect(result.primaryActiveBg).to.exist;
            });

            it('should handle HSL format', () => {
                const result = generatePalette('hsl(217, 91%, 60%)', 'balanced');
                expect(result.primaryActiveBg).to.exist;
            });

            it('should default to balanced algorithm when not specified', () => {
                const result1 = generatePalette('#3b82f6');
                const result2 = generatePalette('#3b82f6', 'balanced');

                // Should produce same results
                expect(result1.primaryActiveBg).to.equal(result2.primaryActiveBg);
                expect(result1.secondaryActiveBg).to.equal(result2.secondaryActiveBg);
            });
        });

        describe('Color Consistency', () => {
            it('should produce deterministic results for same input', () => {
                const result1 = generatePalette('#3b82f6', 'balanced');
                const result2 = generatePalette('#3b82f6', 'balanced');

                // Should be identical
                expect(result1).to.deep.equal(result2);
            });

            it('should produce different results for different algorithms', () => {
                const balanced = generatePalette('#3b82f6', 'balanced');
                const monochrome = generatePalette('#3b82f6', 'monochromatic');

                // Secondary colors should differ between algorithms
                expect(balanced.secondaryActiveBg).to.not.equal(monochrome.secondaryActiveBg);
            });
        });

        describe('Edge Cases', () => {
            it('should handle pure black input', () => {
                const result = generatePalette('#000000', 'balanced');
                expect(result.primaryActiveBg).to.equal('#000000');
                expect(result.primaryActiveFg).to.exist;
            });

            it('should handle pure white input', () => {
                const result = generatePalette('#FFFFFF', 'balanced');
                expect(result.primaryActiveBg).to.equal('#FFFFFF');
                expect(result.primaryActiveFg).to.exist;
            });

            it('should handle grayscale colors', () => {
                const result = generatePalette('#808080', 'balanced');
                expect(result.primaryActiveBg).to.equal('#808080');
                // Should still generate colorful secondary/tertiary
                expect(result.secondaryActiveBg).to.exist;
            });

            it('should handle very saturated colors', () => {
                const result = generatePalette('#FF0000', 'balanced'); // Pure red
                expect(result.primaryActiveBg).to.equal('#FF0000');
                expect(result).to.have.all.keys(
                    'primaryActiveBg',
                    'primaryActiveFg',
                    'primaryInactiveBg',
                    'primaryInactiveFg',
                    'secondaryActiveBg',
                    'secondaryActiveFg',
                    'secondaryInactiveBg',
                    'secondaryInactiveFg',
                    'tertiaryActiveBg',
                    'tertiaryActiveFg',
                    'tertiaryInactiveBg',
                    'tertiaryInactiveFg',
                    'quaternaryActiveBg',
                    'quaternaryActiveFg',
                    'quaternaryInactiveBg',
                    'quaternaryInactiveFg',
                );
            });
        });
    });
});
