import { expect } from 'chai';
import Color from 'color';
import { createRepoProfile, createBranchProfile, ProfileFactorySettings } from '../../profileFactory';

describe('profileFactory', () => {
    describe('createRepoProfile', () => {
        const baseSettings: ProfileFactorySettings = {
            colorInactiveTitlebar: true,
            colorEditorTabs: true,
            colorStatusBar: true,
            activityBarColorKnob: 0,
            isDarkTheme: true,
        };

        it('should create profile with title bar colors', () => {
            const color = Color('#ff0000');
            const profile = createRepoProfile(color, baseSettings);

            expect(profile).to.have.property('palette');
            expect(profile).to.have.property('mappings');
            expect(profile.virtual).to.be.true;
            expect(profile.palette).to.have.property('titleBarActiveBg');
            expect(profile.palette).to.have.property('titleBarActiveFg');
            expect(profile.mappings).to.have.property('titleBar.activeBackground');
            expect(profile.mappings['titleBar.activeBackground']).to.equal('titleBarActiveBg');
        });

        it('should include inactive title bar when colorInactiveTitlebar is true', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorInactiveTitlebar: true };
            const profile = createRepoProfile(color, settings);

            expect(profile.palette).to.have.property('titleBarInactiveBg');
            expect(profile.palette).to.have.property('titleBarInactiveFg');
            expect(profile.mappings).to.have.property('titleBar.inactiveBackground');
            expect(profile.mappings).to.have.property('titleBar.inactiveForeground');
        });

        it('should exclude inactive title bar when colorInactiveTitlebar is false', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorInactiveTitlebar: false };
            const profile = createRepoProfile(color, settings);

            expect(profile.mappings).to.not.have.property('titleBar.inactiveBackground');
            expect(profile.mappings).to.not.have.property('titleBar.inactiveForeground');
        });

        it('should include tab colors when colorEditorTabs is true', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorEditorTabs: true };
            const profile = createRepoProfile(color, settings);

            expect(profile.palette).to.have.property('tabInactiveBg');
            expect(profile.palette).to.have.property('tabActiveBg');
            expect(profile.mappings).to.have.property('tab.inactiveBackground');
            expect(profile.mappings).to.have.property('tab.activeBackground');
            expect(profile.mappings).to.have.property('editorGroupHeader.tabsBackground');
        });

        it('should exclude tab colors when colorEditorTabs is false', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorEditorTabs: false };
            const profile = createRepoProfile(color, settings);

            expect(profile.palette).to.not.have.property('tabInactiveBg');
            expect(profile.palette).to.not.have.property('tabActiveBg');
            expect(profile.mappings).to.not.have.property('tab.inactiveBackground');
        });

        it('should include status bar when colorStatusBar is true and tabs disabled', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorEditorTabs: false, colorStatusBar: true };
            const profile = createRepoProfile(color, settings);

            expect(profile.palette).to.have.property('statusBarBg');
            expect(profile.mappings).to.have.property('statusBar.background');
            expect(profile.mappings['statusBar.background']).to.equal('statusBarBg');
        });

        it('should map status bar to tabInactiveBg when both tabs and status bar enabled', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, colorEditorTabs: true, colorStatusBar: true };
            const profile = createRepoProfile(color, settings);

            expect(profile.mappings).to.have.property('statusBar.background');
            expect(profile.mappings['statusBar.background']).to.equal('tabInactiveBg');
        });

        it('should handle zero color knob (no adjustment)', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, activityBarColorKnob: 0 };
            const profile = createRepoProfile(color, settings);

            // With zero knob, tab colors should not have darken/lighten modifiers
            expect(profile.palette.tabInactiveBg).to.deep.equal({ source: 'repoColor' });
            expect(profile.palette.tabActiveBg).to.deep.equal({ source: 'repoColor' });
        });

        it('should apply darkening when color knob is negative', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, activityBarColorKnob: -40 }; // -40/20 = -2
            const profile = createRepoProfile(color, settings);

            // Negative knob should add darken modifier
            expect(profile.palette.tabInactiveBg).to.have.property('darken');
            expect(profile.palette.tabActiveBg).to.have.property('darken');
        });

        it('should apply lightening when color knob is positive', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, activityBarColorKnob: 40 }; // 40/20 = 2
            const profile = createRepoProfile(color, settings);

            // Positive knob should add lighten modifier
            expect(profile.palette.tabInactiveBg).to.have.property('lighten');
            expect(profile.palette.tabActiveBg).to.have.property('lighten');
        });

        it('should use lighten modifier for light theme', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, isDarkTheme: false };
            const profile = createRepoProfile(color, settings);

            // Light theme should use lighten for inactive background
            expect(profile.palette.titleBarInactiveBg).to.have.property('lighten');
            expect(profile.palette.titleBarInactiveBg).to.not.have.property('darken');
        });

        it('should use darken modifier for dark theme', () => {
            const color = Color('#ff0000');
            const settings = { ...baseSettings, isDarkTheme: true };
            const profile = createRepoProfile(color, settings);

            // Dark theme should use darken for inactive background
            expect(profile.palette.titleBarInactiveBg).to.have.property('darken');
            expect(profile.palette.titleBarInactiveBg).to.not.have.property('lighten');
        });

        it('should handle high contrast correctly', () => {
            const color = Color('#ff0000');
            const profile = createRepoProfile(color, baseSettings);

            // Foreground colors should have highContrast: true
            expect(profile.palette.titleBarActiveFg).to.have.property('highContrast', true);
            expect(profile.palette.titleBarInactiveFg).to.have.property('highContrast', true);
        });

        it('should accept optional logger without throwing', () => {
            const color = Color('#ff0000');
            const logs: string[] = [];
            const logger = { log: (msg: string) => logs.push(msg) };

            const profile = createRepoProfile(color, baseSettings, logger);

            expect(profile).to.exist;
            expect(logs.length).to.be.greaterThan(0);
            expect(logs.some((log) => log.includes('[Repo Temp Profile]'))).to.be.true;
        });

        it('should work without logger', () => {
            const color = Color('#ff0000');
            const profile = createRepoProfile(color, baseSettings);

            expect(profile).to.exist;
            expect(profile.virtual).to.be.true;
        });

        it('should return fallback profile on error', () => {
            // Pass invalid color to trigger error path
            const invalidColor = null as any;
            const profile = createRepoProfile(invalidColor, baseSettings);

            // Should return minimal fallback profile
            expect(profile).to.exist;
            expect(profile.virtual).to.be.true;
            expect(profile.mappings).to.have.property('titleBar.activeBackground');
        });
    });

    describe('createBranchProfile', () => {
        const baseSettings: ProfileFactorySettings = {
            colorInactiveTitlebar: false,
            colorEditorTabs: false,
            colorStatusBar: false,
            activityBarColorKnob: 0,
            isDarkTheme: true,
        };

        it('should create profile with activity bar colors only', () => {
            const color = Color('#00ff00');
            const profile = createBranchProfile(color, baseSettings);

            expect(profile).to.have.property('palette');
            expect(profile).to.have.property('mappings');
            expect(profile.virtual).to.be.true;
            expect(profile.palette).to.have.property('activityBarBg');
            expect(profile.palette).to.have.property('activityBarFg');
            expect(profile.mappings).to.have.property('activityBar.background');
            expect(profile.mappings).to.have.property('activityBar.foreground');
        });

        it('should not include title bar colors', () => {
            const color = Color('#00ff00');
            const profile = createBranchProfile(color, baseSettings);

            expect(profile.palette).to.not.have.property('titleBarActiveBg');
            expect(profile.mappings).to.not.have.property('titleBar.activeBackground');
        });

        it('should not include tab colors', () => {
            const color = Color('#00ff00');
            const profile = createBranchProfile(color, baseSettings);

            expect(profile.palette).to.not.have.property('tabInactiveBg');
            expect(profile.mappings).to.not.have.property('tab.inactiveBackground');
        });

        it('should handle zero color knob', () => {
            const color = Color('#00ff00');
            const settings = { ...baseSettings, activityBarColorKnob: 0 };
            const profile = createBranchProfile(color, settings);

            expect(profile.palette.activityBarBg).to.deep.equal({ source: 'branchColor' });
        });

        it('should normalize color knob by dividing by 50', () => {
            const color = Color('#00ff00');
            const logs: string[] = [];
            const logger = { log: (msg: string) => logs.push(msg) };

            // Note: knob value is normalized inside function, but not exposed in palette
            // This test verifies the profile is created successfully with various knob values
            const settings1 = { ...baseSettings, activityBarColorKnob: 25 };
            const profile1 = createBranchProfile(color, settings1, logger);
            expect(profile1).to.exist;

            const settings2 = { ...baseSettings, activityBarColorKnob: 50 };
            const profile2 = createBranchProfile(color, settings2, logger);
            expect(profile2).to.exist;
        });

        it('should accept optional logger', () => {
            const color = Color('#00ff00');
            const logs: string[] = [];
            const logger = { log: (msg: string) => logs.push(msg) };

            const profile = createBranchProfile(color, baseSettings, logger);

            expect(profile).to.exist;
            expect(logs.length).to.be.greaterThan(0);
            expect(logs.some((log) => log.includes('[Branch Temp Profile]'))).to.be.true;
        });

        it('should work without logger', () => {
            const color = Color('#00ff00');
            const profile = createBranchProfile(color, baseSettings);

            expect(profile).to.exist;
            expect(profile.virtual).to.be.true;
        });

        it('should return fallback profile on error', () => {
            // Pass invalid color to trigger error path
            const invalidColor = null as any;
            const profile = createBranchProfile(invalidColor, baseSettings);

            // Should return minimal fallback profile
            expect(profile).to.exist;
            expect(profile.virtual).to.be.true;
            expect(profile.mappings).to.have.property('activityBar.background');
        });

        it('should handle high contrast for foreground', () => {
            const color = Color('#00ff00');
            const profile = createBranchProfile(color, baseSettings);

            expect(profile.palette.activityBarFg).to.have.property('highContrast', true);
        });
    });
});
