import { expect } from 'chai';
import { parseRepoRules, parseBranchRules, ConfigProvider, ValidationContext } from '../../ruleParser';
import { AdvancedProfile } from '../../types/advancedModeTypes';

describe('ruleParser', () => {
    // Create minimal valid profile for testing
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

    describe('parseRepoRules', () => {
        it('should return empty rules for empty configuration', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, false, validationContext);

            expect(result.rules).to.be.an('array').that.is.empty;
            expect(result.errors.size).to.equal(0);
        });

        it('should parse valid repo rule with simple color', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: '#ff0000',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, false, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.rules[0].repoQualifier).to.equal('github.com/owner/repo');
            expect(result.rules[0].primaryColor).to.equal('#ff0000');
            expect(result.rules[0].enabled).to.be.true;
            expect(result.errors.size).to.equal(0);
        });

        it('should parse repo rule with profile name', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: '#ff0000',
                        profileName: 'blueTheme',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({ blueTheme: createMockProfile() }),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, false, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.rules[0].profileName).to.equal('blueTheme');
        });

        it('should parse repo rule with branch table name', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: '#ff0000',
                        branchTableName: 'CustomTable',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, false, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.rules[0].branchTableName).to.equal('CustomTable');
        });

        it('should validate missing repoQualifier', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: '',
                        primaryColor: '#ff0000',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(1);
            expect(result.errors.get(0)).to.include('missing required fields');
        });

        it('should validate missing primaryColor', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: '',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(1);
            expect(result.errors.get(0)).to.include('missing required fields');
        });

        it('should validate invalid color', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: 'not-a-color',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(1);
            expect(result.errors.get(0)).to.include('Invalid primary color');
        });

        it('should allow "none" as special color value', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo',
                        primaryColor: 'none',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(0);
            expect(result.rules[0].primaryColor).to.equal('none');
        });

        it('should validate local folder rule cannot have branch table', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: '!~/projects/my-repo',
                        primaryColor: '#ff0000',
                        branchTableName: 'CustomTable',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(1);
            expect(result.errors.get(0)).to.include('do not support branch tables');
        });

        it('should allow local folder rule with __none__ branch table', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: '!~/projects/my-repo',
                        primaryColor: '#ff0000',
                        branchTableName: '__none__',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, true, validationContext);

            expect(result.rules).to.have.lengthOf(1);
            expect(result.errors.size).to.equal(0);
        });

        it('should parse multiple repo rules', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: 'github.com/owner/repo1',
                        primaryColor: '#ff0000',
                        enabled: true,
                    },
                    1: {
                        repoQualifier: 'github.com/owner/repo2',
                        primaryColor: '#00ff00',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: true };

            const result = parseRepoRules(configProvider, false, validationContext);

            expect(result.rules).to.have.lengthOf(2);
            expect(result.rules[0].primaryColor).to.equal('#ff0000');
            expect(result.rules[1].primaryColor).to.equal('#00ff00');
        });

        it('should not validate when isActive is false', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({
                    0: {
                        repoQualifier: '',
                        primaryColor: 'invalid',
                        enabled: true,
                    },
                }),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };
            const validationContext: ValidationContext = { isActive: false };

            const result = parseRepoRules(configProvider, true, validationContext);

            // Validation should be skipped when not active
            expect(result.errors.size).to.equal(0);
        });
    });

    describe('parseBranchRules', () => {
        it('should return empty rules for empty configuration', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({}),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, false);

            expect(result.rules.size).to.equal(0);
            expect(result.errors.size).to.equal(0);
        });

        it('should parse valid branch rule', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: '#ff0000',
                        enabled: true,
                    },
                }),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, false);

            expect(result.rules.size).to.equal(1);
            expect(result.rules.get('main')).to.equal('#ff0000');
        });

        it('should skip disabled branch rules', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: '#ff0000',
                        enabled: false,
                    },
                }),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, false);

            expect(result.rules.size).to.equal(0);
        });

        it('should validate invalid color in branch rule', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: 'not-a-color',
                        enabled: true,
                    },
                }),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, true);

            expect(result.rules.size).to.equal(0);
            expect(result.errors.size).to.equal(1);
            expect(result.errors.get(0)).to.include('Invalid color');
        });

        it('should allow profile names as colors', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: 'blueTheme',
                        enabled: true,
                    },
                }),
                getAdvancedProfiles: () => ({ blueTheme: createMockProfile() }),
            };

            const result = parseBranchRules(configProvider, true);

            expect(result.rules.size).to.equal(1);
            expect(result.rules.get('main')).to.equal('blueTheme');
            expect(result.errors.size).to.equal(0);
        });

        it('should allow "none" as special color value', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: 'none',
                        enabled: true,
                    },
                }),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, true);

            expect(result.rules.size).to.equal(1);
            expect(result.rules.get('main')).to.equal('none');
            expect(result.errors.size).to.equal(0);
        });

        it('should parse multiple branch rules', () => {
            const configProvider: ConfigProvider = {
                getRepoConfigurationList: () => ({}),
                getBranchConfigurationList: () => ({
                    0: {
                        pattern: 'main',
                        color: '#ff0000',
                        enabled: true,
                    },
                    1: {
                        pattern: 'feature/.*',
                        color: '#00ff00',
                        enabled: true,
                    },
                }),
                getAdvancedProfiles: () => ({}),
            };

            const result = parseBranchRules(configProvider, false);

            expect(result.rules.size).to.equal(2);
            expect(result.rules.get('main')).to.equal('#ff0000');
            expect(result.rules.get('feature/.*')).to.equal('#00ff00');
        });
    });
});
