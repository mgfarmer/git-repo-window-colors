import { expect } from 'chai';
import { extractProfileName } from '../../colorResolvers';
import { AdvancedProfile } from '../../types/advancedModeTypes';

describe('colorResolvers', () => {
    describe('extractProfileName', () => {
        // Create a minimal valid profile structure
        const createMockProfile = (): AdvancedProfile => ({
            palette: {
                primaryActiveBg: { source: 'repoColor' },
                primaryActiveFg: { source: 'repoColor', highContrast: true },
                primaryInactiveBg: { source: 'repoColor' },
                primaryInactiveFg: { source: 'repoColor', highContrast: true },
                secondaryActiveBg: { source: 'repoColor' },
                secondaryActiveFg: { source: 'repoColor', highContrast: true },
                secondaryInactiveBg: { source: 'repoColor' },
                secondaryInactiveFg: { source: 'repoColor', highContrast: true },
                tertiaryBg: { source: 'repoColor' },
                tertiaryFg: { source: 'repoColor', highContrast: true },
                quaternaryBg: { source: 'repoColor' },
                quaternaryFg: { source: 'repoColor', highContrast: true },
            },
            mappings: { 'titleBar.activeBackground': 'primaryActiveBg' },
        });

        const mockProfiles: { [key: string]: AdvancedProfile } = {
            blueTheme: createMockProfile(),
            redTheme: createMockProfile(),
            // 'red' is also a valid HTML color, so it should take precedence
        };

        it('should return null for empty string', () => {
            const result = extractProfileName('', mockProfiles);
            expect(result).to.be.null;
        });

        it('should return null for undefined profiles object', () => {
            const result = extractProfileName('blueTheme', null as any);
            expect(result).to.be.null;
        });

        it('should return profile name when it exists and is not an HTML color', () => {
            const result = extractProfileName('blueTheme', mockProfiles);
            expect(result).to.equal('blueTheme');
        });

        it('should return null when profile name is also a valid HTML color', () => {
            // 'red' is both a profile and a valid HTML color
            const profilesWithRed = {
                ...mockProfiles,
                red: createMockProfile(),
            };
            const result = extractProfileName('red', profilesWithRed);
            // HTML color takes precedence, so should return null
            expect(result).to.be.null;
        });

        it('should trim whitespace from color string', () => {
            const result = extractProfileName('  blueTheme  ', mockProfiles);
            expect(result).to.equal('blueTheme');
        });

        it('should return null for non-existent profile name', () => {
            const result = extractProfileName('nonExistentProfile', mockProfiles);
            expect(result).to.be.null;
        });

        it('should return null for valid HTML color that is not a profile', () => {
            const result = extractProfileName('#ff0000', mockProfiles);
            expect(result).to.be.null;
        });

        it('should handle profile names with special characters', () => {
            const specialProfiles = {
                'my-profile-123': createMockProfile(),
            };
            const result = extractProfileName('my-profile-123', specialProfiles);
            expect(result).to.equal('my-profile-123');
        });

        it('should return null for color names like "blue" when not in profiles', () => {
            // 'blue' is a valid color but not in our profiles
            const result = extractProfileName('blue', mockProfiles);
            expect(result).to.be.null;
        });

        it('should return profile name for "blue" when it exists in profiles', () => {
            const profilesWithBlue = {
                ...mockProfiles,
                blue: createMockProfile(),
            };
            // 'blue' is both a profile and HTML color, so HTML color takes precedence
            const result = extractProfileName('blue', profilesWithBlue);
            expect(result).to.be.null; // HTML color wins
        });

        it('should handle case-sensitive profile names', () => {
            const result = extractProfileName('BlueTheme', mockProfiles);
            expect(result).to.be.null; // 'BlueTheme' !== 'blueTheme'
        });
    });
});
