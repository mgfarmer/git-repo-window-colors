/**
 * Tests for Color Utility Functions
 *
 * Pure function tests for color space conversions and palette generation.
 * Zero mocks needed - just math and string manipulation.
 */

import { expect } from 'chai';
import {
    hexToHsl,
    hslToHex,
    hexToRgba,
    rgbToHex,
    generatePreviewColors,
    getContrastingTextColor,
} from '../../webview/colorUtils';

describe('colorUtils', () => {
    describe('hexToHsl', () => {
        it('should convert red (#ff0000) to HSL', () => {
            const [h, s, l] = hexToHsl('#ff0000');
            expect(h).to.be.closeTo(0, 1);
            expect(s).to.be.closeTo(100, 1);
            expect(l).to.be.closeTo(50, 1);
        });

        it('should convert green (#00ff00) to HSL', () => {
            const [h, s, l] = hexToHsl('#00ff00');
            expect(h).to.be.closeTo(120, 1);
            expect(s).to.be.closeTo(100, 1);
            expect(l).to.be.closeTo(50, 1);
        });

        it('should convert blue (#0000ff) to HSL', () => {
            const [h, s, l] = hexToHsl('#0000ff');
            expect(h).to.be.closeTo(240, 1);
            expect(s).to.be.closeTo(100, 1);
            expect(l).to.be.closeTo(50, 1);
        });

        it('should handle hex without # prefix', () => {
            const [h, s, l] = hexToHsl('ff0000');
            expect(h).to.be.closeTo(0, 1);
            expect(s).to.be.closeTo(100, 1);
            expect(l).to.be.closeTo(50, 1);
        });

        it('should convert black (#000000) to HSL', () => {
            const [h, s, l] = hexToHsl('#000000');
            expect(h).to.equal(0);
            expect(s).to.equal(0);
            expect(l).to.equal(0);
        });

        it('should convert white (#ffffff) to HSL', () => {
            const [h, s, l] = hexToHsl('#ffffff');
            expect(h).to.equal(0);
            expect(s).to.equal(0);
            expect(l).to.equal(100);
        });

        it('should convert gray (#808080) to HSL', () => {
            const [h, s, l] = hexToHsl('#808080');
            expect(h).to.equal(0);
            expect(s).to.be.closeTo(0, 1);
            expect(l).to.be.closeTo(50.2, 1);
        });

        it('should convert orange (#ffa500) to HSL', () => {
            const [h, s, l] = hexToHsl('#ffa500');
            expect(h).to.be.closeTo(38.8, 1);
            expect(s).to.be.closeTo(100, 1);
            expect(l).to.be.closeTo(50, 1);
        });
    });

    describe('hslToHex', () => {
        it('should convert HSL(0, 100, 50) to red', () => {
            const result = hslToHex(0, 100, 50);
            expect(result).to.equal('#ff0000');
        });

        it('should convert HSL(120, 100, 50) to green', () => {
            const result = hslToHex(120, 100, 50);
            expect(result).to.equal('#00ff00');
        });

        it('should convert HSL(240, 100, 50) to blue', () => {
            const result = hslToHex(240, 100, 50);
            expect(result).to.equal('#0000ff');
        });

        it('should normalize hue > 360 degrees', () => {
            const result1 = hslToHex(370, 100, 50);
            const result2 = hslToHex(10, 100, 50);
            expect(result1).to.equal(result2);
        });

        it('should normalize negative hue', () => {
            const result1 = hslToHex(-10, 100, 50);
            const result2 = hslToHex(350, 100, 50);
            expect(result1).to.equal(result2);
        });

        it('should clamp saturation > 100', () => {
            const result = hslToHex(0, 150, 50);
            // Should clamp to 100 saturation
            expect(result).to.equal('#ff0000');
        });

        it('should clamp lightness > 100', () => {
            const result = hslToHex(0, 100, 150);
            // Should clamp to 100 lightness (white)
            expect(result).to.equal('#ffffff');
        });

        it('should convert HSL(0, 0, 0) to black', () => {
            const result = hslToHex(0, 0, 0);
            expect(result).to.equal('#000000');
        });

        it('should convert HSL(0, 0, 100) to white', () => {
            const result = hslToHex(0, 0, 100);
            expect(result).to.equal('#ffffff');
        });

        it('should round-trip with hexToHsl', () => {
            const original = '#ff5733';
            const [h, s, l] = hexToHsl(original);
            const converted = hslToHex(h, s, l);
            // Should be very close (allow for minor rounding differences)
            expect(converted.toLowerCase()).to.equal(original.toLowerCase());
        });
    });

    describe('hexToRgba', () => {
        it('should convert 6-char hex to rgba with full opacity', () => {
            const result = hexToRgba('#ff0000', 1);
            expect(result).to.equal('rgba(255, 0, 0, 1)');
        });

        it('should convert 6-char hex to rgba with half opacity', () => {
            const result = hexToRgba('#00ff00', 0.5);
            expect(result).to.equal('rgba(0, 255, 0, 0.5)');
        });

        it('should convert 3-char hex to rgba', () => {
            const result = hexToRgba('#f00', 0.8);
            expect(result).to.equal('rgba(255, 0, 0, 0.8)');
        });

        it('should handle hex without # prefix', () => {
            const result = hexToRgba('0000ff', 0.3);
            expect(result).to.equal('rgba(0, 0, 255, 0.3)');
        });

        it('should return transparent for invalid hex length', () => {
            const result = hexToRgba('#ff', 1);
            expect(result).to.equal('rgba(0, 0, 0, 0)');
        });

        it('should handle zero opacity', () => {
            const result = hexToRgba('#ffffff', 0);
            expect(result).to.equal('rgba(255, 255, 255, 0)');
        });
    });

    describe('rgbToHex', () => {
        it('should convert rgb(255, 0, 0) to hex', () => {
            const result = rgbToHex('rgb(255, 0, 0)');
            expect(result).to.equal('#ff0000');
        });

        it('should convert rgb(0, 255, 0) to hex', () => {
            const result = rgbToHex('rgb(0, 255, 0)');
            expect(result).to.equal('#00ff00');
        });

        it('should handle rgb with extra spaces', () => {
            const result = rgbToHex('rgb(255,  0,  0)');
            expect(result).to.equal('#ff0000');
        });

        it('should handle rgb with no spaces', () => {
            const result = rgbToHex('rgb(128,64,192)');
            expect(result).to.equal('#8040c0');
        });

        it('should return null for invalid rgb string', () => {
            const result = rgbToHex('not-a-color');
            expect(result).to.be.null;
        });

        it('should return null for rgba string', () => {
            const result = rgbToHex('rgba(255, 0, 0, 0.5)');
            expect(result).to.be.null;
        });

        it('should pad single-digit hex values', () => {
            const result = rgbToHex('rgb(1, 2, 3)');
            expect(result).to.equal('#010203');
        });
    });

    describe('generatePreviewColors', () => {
        const primaryColor = '#4a9cd6';

        it('should generate balanced palette (4 colors 90° apart)', () => {
            const colors = generatePreviewColors(primaryColor, 'balanced');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
            // Other colors should be distinct from primary
            expect(colors[1]).to.not.equal(primaryColor);
            expect(colors[2]).to.not.equal(primaryColor);
            expect(colors[3]).to.not.equal(primaryColor);
        });

        it('should generate monochromatic palette (same hue, varying lightness)', () => {
            const colors = generatePreviewColors(primaryColor, 'monochromatic');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
            // Check that all colors are valid hex
            colors.forEach((color) => {
                expect(color).to.match(/^#[0-9a-f]{6}$/i);
            });
        });

        it('should generate bold-contrast palette', () => {
            const colors = generatePreviewColors(primaryColor, 'bold-contrast');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate analogous palette', () => {
            const colors = generatePreviewColors(primaryColor, 'analogous');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate analogous-minor-plus palette', () => {
            const colors = generatePreviewColors(primaryColor, 'analogous-minor-plus');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate analogous-minor-minus palette', () => {
            const colors = generatePreviewColors(primaryColor, 'analogous-minor-minus');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate split-complementary palette', () => {
            const colors = generatePreviewColors(primaryColor, 'split-complementary');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate triadic palette', () => {
            const colors = generatePreviewColors(primaryColor, 'triadic');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should generate square palette', () => {
            const colors = generatePreviewColors(primaryColor, 'square');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
        });

        it('should return 4 copies of primary for unknown algorithm', () => {
            const colors = generatePreviewColors(primaryColor, 'unknown-algorithm');
            expect(colors).to.have.length(4);
            expect(colors[0]).to.equal(primaryColor);
            expect(colors[1]).to.equal(primaryColor);
            expect(colors[2]).to.equal(primaryColor);
            expect(colors[3]).to.equal(primaryColor);
        });
    });

    describe('getContrastingTextColor', () => {
        it('should return black for light backgrounds', () => {
            const result = getContrastingTextColor('#ffffff');
            expect(result).to.equal('#000000');
        });

        it('should return white for dark backgrounds', () => {
            const result = getContrastingTextColor('#000000');
            expect(result).to.equal('#ffffff');
        });

        it('should return black for bright yellow (light background)', () => {
            const result = getContrastingTextColor('#ffff00');
            expect(result).to.equal('#000000');
        });

        it('should return white for dark blue', () => {
            const result = getContrastingTextColor('#000080');
            expect(result).to.equal('#ffffff');
        });

        it('should handle medium gray appropriately', () => {
            const result = getContrastingTextColor('#808080');
            // Gray should get white text (brightness ~128, threshold is 155)
            expect(result).to.equal('#ffffff');
        });

        it('should return white for named colors (default behavior)', () => {
            const result = getContrastingTextColor('blue');
            expect(result).to.equal('#ffffff');
        });

        it('should return white for rgb colors (default behavior)', () => {
            const result = getContrastingTextColor('rgb(255, 0, 0)');
            expect(result).to.equal('#ffffff');
        });
    });

    describe('color conversion round trips', () => {
        it('should round-trip hex -> HSL -> hex for red', () => {
            const original = '#ff0000';
            const [h, s, l] = hexToHsl(original);
            const result = hslToHex(h, s, l);
            expect(result.toLowerCase()).to.equal(original.toLowerCase());
        });

        it('should round-trip hex -> HSL -> hex for complex color', () => {
            const original = '#4a9cd6';
            const [h, s, l] = hexToHsl(original);
            const result = hslToHex(h, s, l);
            expect(result.toLowerCase()).to.equal(original.toLowerCase());
        });

        it('should convert hex -> rgba -> maintain color values', () => {
            const hex = '#ff5500';
            const rgba = hexToRgba(hex, 1);
            expect(rgba).to.equal('rgba(255, 85, 0, 1)');
            // Verify the RGB values are correct
            const match = rgba.match(/rgba\((\d+), (\d+), (\d+), [\d.]+\)/);
            expect(match).to.not.be.null;
            if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                expect(r).to.equal(255);
                expect(g).to.equal(85);
                expect(b).to.equal(0);
            }
        });
    });
});
