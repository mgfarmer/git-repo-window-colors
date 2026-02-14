import { expect } from 'chai';
import { resolveProfile } from '../../profileResolver';
import { AdvancedProfile } from '../../types/advancedModeTypes';
import Color from 'color';
import { createThemedColor } from '../../colorDerivation';

describe('ProfileResolver', () => {
    describe('resolveProfile', () => {
        it('should resolve a fixed color slot', () => {
            // Arrange: Create a simple profile with one fixed color slot
            const profile: AdvancedProfile = {
                palette: {
                    primaryActiveBg: {
                        source: 'fixed',
                        value: createThemedColor('#ff0000', 'dark'),
                    },
                    primaryActiveFg: { source: 'transparent' },
                    primaryInactiveBg: { source: 'transparent' },
                    primaryInactiveFg: { source: 'transparent' },
                    secondaryActiveBg: { source: 'transparent' },
                    secondaryActiveFg: { source: 'transparent' },
                    secondaryInactiveBg: { source: 'transparent' },
                    secondaryInactiveFg: { source: 'transparent' },
                    tertiaryBg: { source: 'transparent' },
                    tertiaryFg: { source: 'transparent' },
                    quaternaryBg: { source: 'transparent' },
                    quaternaryFg: { source: 'transparent' },
                },
                mappings: {
                    'titleBar.activeBackground': 'primaryActiveBg',
                },
            };

            const repoColor = Color('#0000ff'); // Blue (not used)
            const branchColor = Color('#00ff00'); // Green (not used)

            // Act: Resolve the profile
            const result = resolveProfile(profile, repoColor, branchColor);

            // Assert: Fixed color should be returned
            expect(result).to.be.an('object');
            expect(result['titleBar.activeBackground']).to.equal('#FF0000');
        });

        it('should resolve a repoColor slot', () => {
            // Arrange
            const profile: AdvancedProfile = {
                palette: {
                    primaryActiveBg: {
                        source: 'repoColor',
                    },
                    primaryActiveFg: { source: 'transparent' },
                    primaryInactiveBg: { source: 'transparent' },
                    primaryInactiveFg: { source: 'transparent' },
                    secondaryActiveBg: { source: 'transparent' },
                    secondaryActiveFg: { source: 'transparent' },
                    secondaryInactiveBg: { source: 'transparent' },
                    secondaryInactiveFg: { source: 'transparent' },
                    tertiaryBg: { source: 'transparent' },
                    tertiaryFg: { source: 'transparent' },
                    quaternaryBg: { source: 'transparent' },
                    quaternaryFg: { source: 'transparent' },
                },
                mappings: {
                    'titleBar.activeBackground': 'primaryActiveBg',
                },
            };

            const repoColor = Color('#3b82f6'); // Blue
            const branchColor = Color('#10b981'); // Green

            // Act
            const result = resolveProfile(profile, repoColor, branchColor);

            // Assert: Should use repo color
            expect(result['titleBar.activeBackground']).to.equal('#3B82F6');
        });

        it('should resolve a branchColor slot', () => {
            // Arrange
            const profile: AdvancedProfile = {
                palette: {
                    primaryActiveBg: { source: 'transparent' },
                    primaryActiveFg: { source: 'transparent' },
                    primaryInactiveBg: { source: 'transparent' },
                    primaryInactiveFg: { source: 'transparent' },
                    secondaryActiveBg: {
                        source: 'branchColor',
                    },
                    secondaryActiveFg: { source: 'transparent' },
                    secondaryInactiveBg: { source: 'transparent' },
                    secondaryInactiveFg: { source: 'transparent' },
                    tertiaryBg: { source: 'transparent' },
                    tertiaryFg: { source: 'transparent' },
                    quaternaryBg: { source: 'transparent' },
                    quaternaryFg: { source: 'transparent' },
                },
                mappings: {
                    'statusBarItem.prominentBackground': 'secondaryActiveBg',
                },
            };

            const repoColor = Color('#3b82f6');
            const branchColor = Color('#10b981');

            // Act
            const result = resolveProfile(profile, repoColor, branchColor);

            // Assert: Should use branch color
            expect(result['statusBarItem.prominentBackground']).to.equal('#10B981');
        });

        it('should return undefined for unmapped keys', () => {
            // Arrange
            const profile: AdvancedProfile = {
                palette: {
                    primaryActiveBg: { source: 'transparent' },
                    primaryActiveFg: { source: 'transparent' },
                    primaryInactiveBg: { source: 'transparent' },
                    primaryInactiveFg: { source: 'transparent' },
                    secondaryActiveBg: { source: 'transparent' },
                    secondaryActiveFg: { source: 'transparent' },
                    secondaryInactiveBg: { source: 'transparent' },
                    secondaryInactiveFg: { source: 'transparent' },
                    tertiaryBg: { source: 'transparent' },
                    tertiaryFg: { source: 'transparent' },
                    quaternaryBg: { source: 'transparent' },
                    quaternaryFg: { source: 'transparent' },
                },
                mappings: {},
            };

            // Act
            const result = resolveProfile(profile, Color('#fff'), Color('#000'));

            // Assert: Should be empty object or have undefined values
            expect(result['titleBar.activeBackground']).to.be.undefined;
        });
    });
});
