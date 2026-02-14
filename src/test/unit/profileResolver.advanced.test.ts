import { expect } from 'chai';
import { resolveProfile } from '../../profileResolver';
import { AdvancedProfile } from '../../types/advancedModeTypes';
import Color from 'color';
import { createThemedColor } from '../../colorDerivation';

describe('ProfileResolver - Advanced Features', () => {
    // Helper to create minimal valid palette
    const createMinimalPalette = () => ({
        primaryActiveBg: { source: 'transparent' as const },
        primaryActiveFg: { source: 'transparent' as const },
        primaryInactiveBg: { source: 'transparent' as const },
        primaryInactiveFg: { source: 'transparent' as const },
        secondaryActiveBg: { source: 'transparent' as const },
        secondaryActiveFg: { source: 'transparent' as const },
        secondaryInactiveBg: { source: 'transparent' as const },
        secondaryInactiveFg: { source: 'transparent' as const },
        tertiaryBg: { source: 'transparent' as const },
        tertiaryFg: { source: 'transparent' as const },
        quaternaryBg: { source: 'transparent' as const },
        quaternaryFg: { source: 'transparent' as const },
    });

    describe('Color Modifiers', () => {
        it('should apply lighten modifier', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    customSlot: {
                        source: 'fixed',
                        value: createThemedColor('#800000', 'dark'), // Dark red
                        lighten: 0.2,
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'customSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Result should be lighter than the original dark red
            expect(result['titleBar.activeBackground']).to.exist;
            const resultColor = Color(result['titleBar.activeBackground']!);
            const originalColor = Color('#800000');
            expect(resultColor.lightness()).to.be.greaterThan(originalColor.lightness());
        });

        it('should apply darken modifier', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    customSlot: {
                        source: 'fixed',
                        value: createThemedColor('#FF6B6B', 'dark'), // Light red
                        darken: 0.2,
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'customSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Result should be darker than the original light red
            expect(result['titleBar.activeBackground']).to.exist;
            const resultColor = Color(result['titleBar.activeBackground']!);
            const originalColor = Color('#FF6B6B');
            expect(resultColor.lightness()).to.be.lessThan(originalColor.lightness());
        });

        it('should apply opacity at slot level', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    customSlot: {
                        source: 'fixed',
                        value: createThemedColor('#FF0000', 'dark'),
                        opacity: 0.5,
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'customSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should have alpha channel in format #RRGGBBAA
            expect(result['titleBar.activeBackground']).to.match(/^#[0-9A-F]{8}$/);
            expect(result['titleBar.activeBackground']).to.include('80'); // 0.5 * 255 = 127.5 ≈ 0x80
        });

        it('should combine lighten and opacity modifiers', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    customSlot: {
                        source: 'fixed',
                        value: createThemedColor('#0000FF', 'dark'), // Blue
                        lighten: 0.3,
                        opacity: 0.7,
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'customSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should have alpha channel (8 char hex)
            expect(result['titleBar.activeBackground']).to.match(/^#[0-9A-F]{8}$/);

            // Should be lighter than original
            const resultColor = Color(result['titleBar.activeBackground']!);
            expect(resultColor.lightness()).to.be.greaterThan(Color('#0000FF').lightness());
        });
    });

    describe('High Contrast Mode', () => {
        it('should use white foreground for dark background', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    darkSlot: {
                        source: 'fixed',
                        value: createThemedColor('#1a1a1a', 'dark'), // Very dark
                        highContrast: true,
                    },
                },
                mappings: {
                    'titleBar.activeForeground': 'darkSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // High contrast on dark background should give white
            expect(result['titleBar.activeForeground']).to.equal('#FFFFFF');
        });

        it('should use black foreground for light background', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    lightSlot: {
                        source: 'fixed',
                        value: createThemedColor('#f0f0f0', 'dark'), // Very light
                        highContrast: true,
                    },
                },
                mappings: {
                    'titleBar.activeForeground': 'lightSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // High contrast on light background should give black
            expect(result['titleBar.activeForeground']).to.equal('#000000');
        });

        it('should ignore other modifiers when highContrast is true', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    contrastSlot: {
                        source: 'fixed',
                        value: createThemedColor('#1a1a1a', 'dark'),
                        highContrast: true,
                        lighten: 0.5, // Should be ignored
                        opacity: 0.3, // Should be ignored
                    },
                },
                mappings: {
                    'titleBar.activeForeground': 'contrastSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should be pure white (no opacity or lightness applied)
            expect(result['titleBar.activeForeground']).to.equal('#FFFFFF');
        });
    });

    describe('Mapping-Level Opacity', () => {
        it('should apply opacity from mapping object', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    solidSlot: {
                        source: 'fixed',
                        value: createThemedColor('#00FF00', 'dark'), // Green
                    },
                },
                mappings: {
                    'titleBar.activeBackground': {
                        slot: 'solidSlot',
                        opacity: 0.6,
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should have alpha channel
            expect(result['titleBar.activeBackground']).to.match(/^#[0-9A-F]{8}$/);
        });

        it('should override slot-level opacity with mapping-level opacity', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    opaqueSlot: {
                        source: 'fixed',
                        value: createThemedColor('#FF0000', 'dark'),
                        opacity: 0.3, // Slot level
                    },
                },
                mappings: {
                    'titleBar.activeBackground': {
                        slot: 'opaqueSlot',
                        opacity: 0.8, // Mapping level - should override
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should use mapping-level opacity (0.8, not 0.3)
            const alphaHex = result['titleBar.activeBackground']!.slice(-2);
            const alphaValue = parseInt(alphaHex, 16) / 255;
            expect(alphaValue).to.be.closeTo(0.8, 0.02);
        });
    });

    describe('Fixed Color Slot (__fixed__)', () => {
        it('should resolve __fixed__ slot with fixedColor', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': {
                        slot: '__fixed__',
                        fixedColor: '#FF00FF', // Magenta
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            expect(result['titleBar.activeBackground']).to.equal('#FF00FF');
        });

        it('should apply opacity to __fixed__ slot', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': {
                        slot: '__fixed__',
                        fixedColor: '#FFFF00', // Yellow
                        opacity: 0.5,
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should have alpha channel
            expect(result['titleBar.activeBackground']).to.match(/^#[0-9A-F]{8}$/);
        });
    });

    describe('Special Slot Values', () => {
        it('should return undefined for "none" slot', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': 'none',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            expect(result['titleBar.activeBackground']).to.be.undefined;
        });

        it('should return undefined for "transparent" slot', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': 'transparent',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            expect(result['titleBar.activeBackground']).to.be.undefined;
        });

        it('should return undefined for mapping with "none" in object form', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': {
                        slot: 'none',
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            expect(result['titleBar.activeBackground']).to.be.undefined;
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing palette slot gracefully', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': 'nonExistentSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should not throw, and result should not have the key or be undefined
            expect(result['titleBar.activeBackground']).to.be.undefined;
        });

        it('should handle invalid fixed color gracefully', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    badSlot: {
                        source: 'fixed',
                        value: createThemedColor('not-a-color', 'dark'),
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'badSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should not throw, slot just won't be resolved
            expect(result['titleBar.activeBackground']).to.be.undefined;
        });

        it('should handle out-of-range opacity values', () => {
            const profile: AdvancedProfile = {
                palette: createMinimalPalette(),
                mappings: {
                    'titleBar.activeBackground': {
                        slot: 'primaryActiveBg',
                        opacity: 1.5, // Invalid (> 1)
                    },
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Should not crash - implementation should handle this
            expect(result).to.exist;
        });

        it('should handle transparent source correctly', () => {
            const profile: AdvancedProfile = {
                palette: {
                    ...createMinimalPalette(),
                    transparentSlot: {
                        source: 'transparent',
                    },
                },
                mappings: {
                    'titleBar.activeBackground': 'transparentSlot',
                },
            };

            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Transparent source should not be included in results
            expect(result['titleBar.activeBackground']).to.be.undefined;
        });
    });
});
