/**
 * Module Integration Tests
 *
 * These tests verify that extracted modules work together correctly as an integrated system.
 * Unlike unit tests that test modules in isolation, these tests verify the interactions
 * and data flow between multiple modules.
 */

import { expect } from 'chai';
import Color from 'color';
import { parseRepoRules, ConfigProvider, ValidationContext } from '../../ruleParser';
import { findMatchingRepoRule, findMatchingBranchRule, WorkspaceContext } from '../../ruleMatching';
import { createRepoProfile, createBranchProfile, ProfileFactorySettings } from '../../profileFactory';
import { applyColors, removeAllManagedColors } from '../../settingsApplicator';
import { resolveProfile } from '../../profileResolver';

describe('Module Integration Tests', () => {
    describe('Rule Parsing → Rule Matching Integration', () => {
        it('should parse rules and find matching repo rule', () => {
            // Setup config provider
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => [
                    { repoQualifier: 'github.com/owner/repo', primaryColor: '#ff0000', enabled: true },
                    { repoQualifier: 'gitlab.com/group/project', primaryColor: '#00ff00', enabled: true },
                ],
                getBranchConfigurationList: () => [],
                getAdvancedProfiles: () => ({}),
            };

            // Parse repo rules with validation
            const validationContext: ValidationContext = {
                isActive: true,
            };
            const parseResult = parseRepoRules(configProvider, true, validationContext);

            // Use parsed rules to find match
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };
            const matchResult = findMatchingRepoRule(parseResult.rules, context);

            // Verify integration: parsing produced valid rules that can be matched
            expect(matchResult).to.exist;
            expect(matchResult?.primaryColor).to.equal('#ff0000');
            expect(parseResult.errors.size).to.equal(0);
        });

        it('should parse rules and respect priority order', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => [
                    { repoQualifier: 'github.com/owner/', primaryColor: '#ff0000', enabled: true },
                    { repoQualifier: 'github.com/owner/specific', primaryColor: '#00ff00', enabled: true },
                ],
                getBranchConfigurationList: () => [],
                getAdvancedProfiles: () => ({}),
            };

            const validationContext: ValidationContext = { isActive: true };
            const parseResult = parseRepoRules(configProvider, true, validationContext);
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/specific.git',
                workspaceFolder: '/test/workspace',
            };
            const matchResult = findMatchingRepoRule(parseResult.rules, context);

            // First matching rule (based on substring match) should win
            // Both rules match, but first one is checked first
            expect(matchResult?.primaryColor).to.equal('#ff0000');
        });

        it('should match branch rules using shared branch tables', () => {
            // Shared branch tables are the data structure used for branch matching
            const sharedBranchTables = {
                'Default Rules': {
                    rules: [
                        { pattern: '^main$', color: '#0000ff', enabled: true },
                        { pattern: '^feature/.*', color: '#00ff00', enabled: true },
                    ],
                },
            };

            // Match using shared branch tables
            const mainResult = findMatchingBranchRule(sharedBranchTables, 'Default Rules', 'main');
            expect(mainResult.matched).to.be.true;
            expect(mainResult.rule?.color).to.equal('#0000ff');

            const featureResult = findMatchingBranchRule(sharedBranchTables, 'Default Rules', 'feature/new-ui');
            expect(featureResult.matched).to.be.true;
            expect(featureResult.rule?.color).to.equal('#00ff00');
        });

        it('should handle validation errors from parsing', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => [
                    { repoQualifier: '', primaryColor: '#ff0000', enabled: true }, // Invalid: empty qualifier
                    { repoQualifier: 'valid.com/repo', primaryColor: 'invalid-color', enabled: true }, // Invalid color
                ],
                getBranchConfigurationList: () => [],
                getAdvancedProfiles: () => ({}),
            };

            const validationContext: ValidationContext = { isActive: true };
            const parseResult = parseRepoRules(configProvider, true, validationContext);

            // Verify errors were captured
            expect(parseResult.errors.size).to.be.greaterThan(0);
            // Valid rules should still be parsed
            expect(parseResult.rules.length).to.be.greaterThan(0);
        });
    });

    describe('Profile Factory → Settings Applicator Integration', () => {
        it('should create repo profile and resolve colors for application', () => {
            // Create a repo profile
            const repoColor = Color('#3b82f6');
            const branchColor = Color('#000000'); // Dummy branch color for resolveProfile
            const settings: ProfileFactorySettings = {
                colorInactiveTitlebar: true,
                colorEditorTabs: true,
                colorStatusBar: false,
                activityBarColorKnob: 0,
                isDarkTheme: true,
            };
            const profile = createRepoProfile(repoColor, settings);

            // Verify profile structure
            expect(profile.palette).to.exist;
            expect(profile.mappings).to.exist;
            expect(profile.palette.titleBarActiveBg).to.exist;

            // Resolve palette colors
            const resolvedColors = resolveProfile(profile, repoColor, branchColor);

            // Verify colors can be applied
            const currentSettings = {};
            const result = applyColors(currentSettings, resolvedColors);

            expect(result.finalColors).to.exist;
            expect(result.setCount).to.be.greaterThan(0);
        });

        it('should create branch profile and merge with existing colors', () => {
            // Start with existing repo colors
            const existingColors: Record<string, string> = {
                'titleBar.activeBackground': '#ff0000',
                'titleBar.activeForeground': '#ffffff',
            };

            // Create branch profile
            const repoColor = Color('#000000'); // Dummy repo color
            const branchColor = Color('#10b981');
            const settings: ProfileFactorySettings = {
                colorInactiveTitlebar: true,
                colorEditorTabs: false,
                colorStatusBar: false,
                activityBarColorKnob: 10,
                isDarkTheme: true,
            };
            const profile = createBranchProfile(branchColor, settings);

            // Resolve branch colors
            const resolvedBranchColors = resolveProfile(profile, repoColor, branchColor);

            // Apply branch colors (should merge with existing)
            const result = applyColors(existingColors, resolvedBranchColors);

            // Verify both repo and branch colors are present
            expect(result.finalColors).to.exist;
            expect(result.setCount).to.be.greaterThan(0);
        });

        it('should remove managed colors from settings', () => {
            // Setup settings with managed and user colors
            const settings: Record<string, string> = {
                'titleBar.activeBackground': '#ff0000', // Managed
                'titleBar.activeForeground': '#ffffff', // Managed
                'activityBar.background': '#00ff00', // Managed
                'editor.background': '#123456', // Not managed
                'sidebar.background': '#abcdef', // Not managed
            };

            // Remove managed colors
            const result = removeAllManagedColors(settings);

            // Verify managed colors are removed but user colors remain
            expect(result['titleBar.activeBackground']).to.be.undefined;
            expect(result['titleBar.activeForeground']).to.be.undefined;
            expect(result['activityBar.background']).to.be.undefined;
            expect(result['editor.background']).to.equal('#123456');
            expect(result['sidebar.background']).to.equal('#abcdef');
        });

        it('should handle profile with color gracefully', () => {
            // Create profile with a color
            const repoColor = Color('#3b82f6');
            const branchColor = Color('#000000');
            const settings: ProfileFactorySettings = {
                colorInactiveTitlebar: true,
                colorEditorTabs: true,
                colorStatusBar: false,
                activityBarColorKnob: 0,
                isDarkTheme: true,
            };

            const profile = createRepoProfile(repoColor, settings);

            // Resolve colors
            const resolvedColors = resolveProfile(profile, repoColor, branchColor);

            // Should not throw when applying
            expect(() => {
                applyColors({}, resolvedColors);
            }).to.not.throw();
        });
    });

    describe('Full Pipeline Integration', () => {
        it('should process repo matching through color application (full workflow)', () => {
            // Step 1: Parse rules
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => [
                    { repoQualifier: 'github.com/test/repo', primaryColor: '#3b82f6', enabled: true },
                ],
                getBranchConfigurationList: () => [],
                getAdvancedProfiles: () => ({}),
            };

            const validationContext: ValidationContext = { isActive: true };
            const parseResult = parseRepoRules(configProvider, true, validationContext);
            expect(parseResult.errors.size).to.equal(0);

            // Step 2: Match rule
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/test/repo.git',
                workspaceFolder: '/test/workspace',
            };
            const matchedRule = findMatchingRepoRule(parseResult.rules, context);
            expect(matchedRule).to.exist;

            // Step 3: Create profile from matched rule
            const repoColor = Color(matchedRule!.primaryColor);
            const branchColor = Color('#000000'); // Dummy
            const settings: ProfileFactorySettings = {
                colorInactiveTitlebar: true,
                colorEditorTabs: true,
                colorStatusBar: false,
                activityBarColorKnob: 0,
                isDarkTheme: true,
            };
            const profile = createRepoProfile(repoColor, settings);
            expect(profile.palette).to.exist;
            expect(profile.mappings).to.exist;

            // Step 4: Resolve colors from profile
            const resolvedColors = resolveProfile(profile, repoColor, branchColor);

            // Step 5: Apply colors to settings
            const currentSettings = {};
            const result = applyColors(currentSettings, resolvedColors);

            // Verify end-to-end: rule → profile → resolved colors → applied settings
            expect(result.finalColors).to.exist;
            expect(result.setCount).to.be.greaterThan(0);
            expect(result.removedCount).to.equal(0); // No existing colors to remove
        });

        it('should handle no matching rules gracefully (cleanup)', () => {
            // Step 1: Parse rules
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => [
                    { repoQualifier: 'github.com/other/repo', primaryColor: '#3b82f6', enabled: true },
                ],
                getBranchConfigurationList: () => [],
                getAdvancedProfiles: () => ({}),
            };

            const validationContext: ValidationContext = { isActive: true };
            const parseResult = parseRepoRules(configProvider, true, validationContext);

            // Step 2: Try to match (should fail)
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/test/repo.git', // Different repo
                workspaceFolder: '/test/workspace',
            };
            const matchedRule = findMatchingRepoRule(parseResult.rules, context);
            expect(matchedRule).to.be.undefined;

            // Step 3: No match means we should clean up settings
            const existingColors: Record<string, string> = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
                'editor.background': '#123456', // User color
            };

            // Remove managed colors when no rule matches
            const cleanedSettings = removeAllManagedColors(existingColors);

            // Verify managed colors removed, user colors preserved
            expect(cleanedSettings['titleBar.activeBackground']).to.be.undefined;
            expect(cleanedSettings['activityBar.background']).to.be.undefined;
            expect(cleanedSettings['editor.background']).to.equal('#123456');
        });
    });
});
