/**
 * Tests for Palette Logic Utilities
 */

import { expect } from 'chai';
import { countActiveMappings, countTotalActiveMappings, resolveColorFromSlot } from '../../webview/paletteLogic';
import { AdvancedProfile } from '../../types/advancedModeTypes';
import { createThemedColor } from '../../colorDerivation';

describe('paletteLogic', () => {
    describe('countActiveMappings', () => {
        const createProfile = (mappings: any): AdvancedProfile => ({
            palette: {
                primaryActiveBg: { source: 'fixed', value: createThemedColor('#4A90E2', 'dark') },
                primaryActiveFg: { source: 'fixed', value: createThemedColor('#FFFFFF', 'dark') },
                primaryInactiveBg: { source: 'fixed', value: createThemedColor('#2E5C8A', 'dark') },
                primaryInactiveFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                secondaryActiveBg: { source: 'fixed', value: createThemedColor('#5FA3E8', 'dark') },
                secondaryActiveFg: { source: 'fixed', value: createThemedColor('#FFFFFF', 'dark') },
                secondaryInactiveBg: { source: 'fixed', value: createThemedColor('#4278B0', 'dark') },
                secondaryInactiveFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                tertiaryBg: { source: 'fixed', value: createThemedColor('#1E1E1E', 'dark') },
                tertiaryFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                quaternaryBg: { source: 'fixed', value: createThemedColor('#2D2D30', 'dark') },
                quaternaryFg: { source: 'fixed', value: createThemedColor('#D4D4D4', 'dark') },
            },
            mappings,
        });

        it('should count active mappings (string format)', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': 'primaryActiveFg',
                'titleBar.inactiveBackground': 'none',
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground', 'titleBar.inactiveBackground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(2); // Two non-'none' values
        });

        it('should count active mappings (object format)', () => {
            const profile = createProfile({
                'titleBar.activeBackground': { slot: 'primaryActiveBg' },
                'titleBar.activeForeground': { slot: 'primaryActiveFg' },
                'titleBar.inactiveBackground': { slot: 'none' },
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground', 'titleBar.inactiveBackground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(2);
        });

        it('should return 0 when all mappings are none', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'none',
                'titleBar.activeForeground': 'none',
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(0);
        });

        it('should return 0 for empty section keys', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
            });

            const count = countActiveMappings(profile, []);

            expect(count).to.equal(0);
        });

        it('should handle missing mappings', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
            });

            const keys = ['titleBar.activeBackground', 'nonexistent.key'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(1);
        });

        it('should handle undefined mapping values', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': undefined,
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(1);
        });

        it('should handle empty string as none', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': '',
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(1);
        });

        it('should handle object with empty slot', () => {
            const profile = createProfile({
                'titleBar.activeBackground': { slot: 'primaryActiveBg' },
                'titleBar.activeForeground': { slot: '' },
            });

            const keys = ['titleBar.activeBackground', 'titleBar.activeForeground'];
            const count = countActiveMappings(profile, keys);

            expect(count).to.equal(1);
        });
    });

    describe('countTotalActiveMappings', () => {
        const createProfile = (mappings: any): AdvancedProfile => ({
            palette: {
                primaryActiveBg: { source: 'fixed', value: createThemedColor('#4A90E2', 'dark') },
                primaryActiveFg: { source: 'fixed', value: createThemedColor('#FFFFFF', 'dark') },
                primaryInactiveBg: { source: 'fixed', value: createThemedColor('#2E5C8A', 'dark') },
                primaryInactiveFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                secondaryActiveBg: { source: 'fixed', value: createThemedColor('#5FA3E8', 'dark') },
                secondaryActiveFg: { source: 'fixed', value: createThemedColor('#FFFFFF', 'dark') },
                secondaryInactiveBg: { source: 'fixed', value: createThemedColor('#4278B0', 'dark') },
                secondaryInactiveFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                tertiaryBg: { source: 'fixed', value: createThemedColor('#1E1E1E', 'dark') },
                tertiaryFg: { source: 'fixed', value: createThemedColor('#CCCCCC', 'dark') },
                quaternaryBg: { source: 'fixed', value: createThemedColor('#2D2D30', 'dark') },
                quaternaryFg: { source: 'fixed', value: createThemedColor('#D4D4D4', 'dark') },
            },
            mappings,
        });

        it('should count all active mappings across entire profile', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': 'primaryActiveFg',
                'statusBar.background': 'secondaryActiveBg',
                'statusBar.foreground': 'none',
            });

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(3);
        });

        it('should count object format mappings', () => {
            const profile = createProfile({
                'titleBar.activeBackground': { slot: 'primaryActiveBg' },
                'titleBar.activeForeground': { slot: 'primaryActiveFg' },
                'statusBar.background': { slot: 'none' },
            });

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(2);
        });

        it('should return 0 when all mappings are none', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'none',
                'titleBar.activeForeground': 'none',
                'statusBar.background': 'none',
            });

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(0);
        });

        it('should return 0 for empty mappings object', () => {
            const profile = createProfile({});

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(0);
        });

        it('should handle mixed string and object formats', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': { slot: 'primaryActiveFg' },
                'statusBar.background': 'secondaryActiveBg',
            });

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(3);
        });

        it('should handle large number of mappings', () => {
            const mappings: any = {};
            for (let i = 0; i < 50; i++) {
                mappings[`key${i}`] = 'primaryActiveBg';
            }
            mappings['none1'] = 'none';
            mappings['none2'] = 'none';

            const profile = createProfile(mappings);
            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(50);
        });

        it('should handle undefined mappings', () => {
            const profile = createProfile({
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': undefined,
                'statusBar.background': null,
            });

            const count = countTotalActiveMappings(profile);

            expect(count).to.equal(1);
        });
    });

    describe('resolveColorFromSlot', () => {
        const rule = {
            primaryColor: '#ff0000',
            branchColor: '#00ff00',
        };

        describe('string slots', () => {
            it('should return direct color string', () => {
                const result = resolveColorFromSlot('#123456', rule);
                expect(result).to.equal('#123456');
            });

            it('should return named color string', () => {
                const result = resolveColorFromSlot('blue', rule);
                expect(result).to.equal('blue');
            });
        });

        describe('fixed source slots', () => {
            it('should resolve fixed source with value', () => {
                const slot = { source: 'fixed', value: '#abcdef' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#abcdef');
            });

            it('should return null for fixed source without value', () => {
                const slot = { source: 'fixed' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.be.null;
            });
        });

        describe('repoColor source slots', () => {
            it('should resolve repoColor to rule.primaryColor', () => {
                const slot = { source: 'repoColor' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#ff0000');
            });

            it('should return null if rule has no primaryColor', () => {
                const slot = { source: 'repoColor' };
                const ruleWithoutPrimary = { branchColor: '#00ff00' };
                const result = resolveColorFromSlot(slot, ruleWithoutPrimary);
                expect(result).to.be.null;
            });
        });

        describe('branchColor source slots', () => {
            it('should resolve branchColor to rule.branchColor', () => {
                const slot = { source: 'branchColor' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#00ff00');
            });

            it('should return null if rule has no branchColor', () => {
                const slot = { source: 'branchColor' };
                const ruleWithoutBranch = { primaryColor: '#ff0000' };
                const result = resolveColorFromSlot(slot, ruleWithoutBranch);
                expect(result).to.be.null;
            });
        });

        describe('color property slots', () => {
            it('should resolve direct color property', () => {
                const slot = { color: '#fedcba' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#fedcba');
            });

            it('should prioritize fixed source over color property', () => {
                const slot = { source: 'fixed', value: '#111111', color: '#222222' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#111111');
            });
        });

        describe('value property slots', () => {
            it('should resolve value property', () => {
                const slot = { value: '#abcdef' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#abcdef');
            });

            it('should prioritize color property over value property', () => {
                const slot = { color: '#111111', value: '#222222' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.equal('#111111');
            });
        });

        describe('edge cases', () => {
            it('should return null for null slot', () => {
                const result = resolveColorFromSlot(null, rule);
                expect(result).to.be.null;
            });

            it('should return null for undefined slot', () => {
                const result = resolveColorFromSlot(undefined, rule);
                expect(result).to.be.null;
            });

            it('should return null for empty object slot', () => {
                const result = resolveColorFromSlot({}, rule);
                expect(result).to.be.null;
            });

            it('should return null for slot with only modifiers', () => {
                const slot = { lighten: 10, opacity: 0.5 };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.be.null;
            });

            it('should handle slot with unknown source', () => {
                const slot = { source: 'unknown' };
                const result = resolveColorFromSlot(slot, rule);
                expect(result).to.be.null;
            });

            it('should handle empty string slots', () => {
                const result = resolveColorFromSlot('', rule);
                expect(result).to.equal('');
            });
        });

        describe('priority order', () => {
            it('should follow priority: fixed source > color > repoColor > value', () => {
                // Fixed source should win
                let slot: any = { source: 'fixed', value: '#111111', color: '#222222', value2: '#333333' };
                expect(resolveColorFromSlot(slot, rule)).to.equal('#111111');

                // Color should win over repoColor
                slot = { source: 'repoColor', color: '#222222' };
                expect(resolveColorFromSlot(slot, rule)).to.equal('#222222');

                // RepoColor should win over value
                slot = { source: 'repoColor', value: '#333333' };
                expect(resolveColorFromSlot(slot, rule)).to.equal('#ff0000');

                // Value should be used as fallback
                slot = { value: '#333333' };
                expect(resolveColorFromSlot(slot, rule)).to.equal('#333333');
            });
        });
    });
});
