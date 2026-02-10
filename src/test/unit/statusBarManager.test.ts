/**
 * Tests for Status Bar Manager Module
 */

import { expect } from 'chai';
import { shouldShowStatusBar, getStatusBarTooltip, getStatusBarState, StatusBarConfig } from '../../statusBarManager';
import { RepoConfig } from '../../ruleParser';
import { WorkspaceContext } from '../../ruleMatching';

describe('statusBarManager', () => {
    describe('shouldShowStatusBar', () => {
        const showWhenNoMatchConfig: StatusBarConfig = {
            showOnlyWhenNoMatch: true,
        };

        const alwaysShowConfig: StatusBarConfig = {
            showOnlyWhenNoMatch: false,
        };

        it('should hide when no workspace context', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext | undefined = undefined;

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.false;
        });

        it('should hide when context has no repo URL or workspace folder', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext = {
                repoUrl: '',
                workspaceFolder: '',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.false;
        });

        it('should show when alwaysShow config and has git repo', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, alwaysShowConfig);

            expect(result).to.be.true;
        });

        it('should show when alwaysShow config and has workspace folder', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext = {
                repoUrl: '',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, alwaysShowConfig);

            expect(result).to.be.true;
        });

        it('should show when showOnlyWhenNoMatch and no rules configured', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.true;
        });

        it('should show when showOnlyWhenNoMatch and rules array is undefined', () => {
            const rules: RepoConfig[] | undefined = undefined;
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.true;
        });

        it('should hide when showOnlyWhenNoMatch and a rule matches', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.false;
        });

        it('should show when showOnlyWhenNoMatch and no rule matches', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/other/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            expect(result).to.be.true;
        });

        it('should skip disabled rules when checking matches', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: false, // Disabled
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            // Should show because the matching rule is disabled
            expect(result).to.be.true;
        });

        it('should handle local folder patterns', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: '!/test/workspace',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: '',
                workspaceFolder: '/test/workspace',
            };

            const result = shouldShowStatusBar(rules, context, showWhenNoMatchConfig);

            // Should hide because local folder rule matches
            expect(result).to.be.false;
        });
    });

    describe('getStatusBarTooltip', () => {
        it('should return generic tooltip when no context', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext | undefined = undefined;

            const result = getStatusBarTooltip(rules, context);

            expect(result).to.equal('Git Repo Window Colors - Click to configure');
        });

        it('should return "add rules" tooltip when no rules configured', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = getStatusBarTooltip(rules, context);

            expect(result).to.equal('Git Repo Window Colors - Click to add color rules for this repository');
        });

        it('should return "has rules" tooltip when a rule matches', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = getStatusBarTooltip(rules, context);

            expect(result).to.equal('Git Repo Window Colors - Repository has color rules configured');
        });

        it('should return "add rules" tooltip when no rule matches', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/other/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = getStatusBarTooltip(rules, context);

            expect(result).to.equal('Git Repo Window Colors - Click to add color rules for this repository');
        });

        it('should handle disabled rules correctly', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: false, // Disabled
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };

            const result = getStatusBarTooltip(rules, context);

            // Should return "add rules" tooltip because disabled rule doesn't count as match
            expect(result).to.equal('Git Repo Window Colors - Click to add color rules for this repository');
        });
    });

    describe('getStatusBarState', () => {
        it('should return complete state with visibility and tooltip', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };
            const config: StatusBarConfig = {
                showOnlyWhenNoMatch: true,
            };

            const result = getStatusBarState(rules, context, config);

            expect(result.visible).to.be.false; // Hidden because rule matches
            expect(result.tooltip).to.equal('Git Repo Window Colors - Repository has color rules configured');
        });

        it('should return state for no matching rules', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/other/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };
            const config: StatusBarConfig = {
                showOnlyWhenNoMatch: true,
            };

            const result = getStatusBarState(rules, context, config);

            expect(result.visible).to.be.true; // Shown because no rule matches
            expect(result.tooltip).to.equal('Git Repo Window Colors - Click to add color rules for this repository');
        });

        it('should return state for alwaysShow config', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/test/workspace',
            };
            const config: StatusBarConfig = {
                showOnlyWhenNoMatch: false, // Always show
            };

            const result = getStatusBarState(rules, context, config);

            expect(result.visible).to.be.true; // Always shown
            expect(result.tooltip).to.equal('Git Repo Window Colors - Repository has color rules configured');
        });

        it('should handle no context', () => {
            const rules: RepoConfig[] = [];
            const context: WorkspaceContext | undefined = undefined;
            const config: StatusBarConfig = {
                showOnlyWhenNoMatch: true,
            };

            const result = getStatusBarState(rules, context, config);

            expect(result.visible).to.be.false;
            expect(result.tooltip).to.equal('Git Repo Window Colors - Click to configure');
        });
    });
});
