import { expect } from 'chai';
import { findMatchingRepoRule, findMatchingBranchRule, getBranchTableName, WorkspaceContext } from '../../ruleMatching';
import { RepoConfig } from '../../ruleParser';

describe('ruleMatching', () => {
    describe('findMatchingRepoRule', () => {
        it('should return undefined for empty rules array', () => {
            const context: WorkspaceContext = {
                repoUrl: 'github.com/owner/repo',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule([], context);

            expect(result).to.be.undefined;
        });

        it('should return undefined for undefined rules', () => {
            const context: WorkspaceContext = {
                repoUrl: 'github.com/owner/repo',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(undefined, context);

            expect(result).to.be.undefined;
        });

        it('should match git repo URL', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(rules, context);

            expect(result).to.exist;
            expect(result?.repoQualifier).to.equal('github.com/owner/repo');
        });

        it('should match partial repo URL', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'owner/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(rules, context);

            expect(result).to.exist;
            expect(result?.repoQualifier).to.equal('owner/repo');
        });

        it('should skip disabled rules', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner/repo',
                    primaryColor: '#ff0000',
                    enabled: false,
                },
                {
                    repoQualifier: 'github.com/owner',
                    primaryColor: '#00ff00',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(rules, context);

            // Should match the second rule (enabled one)
            expect(result).to.exist;
            expect(result?.primaryColor).to.equal('#00ff00');
        });

        it('should return first matching rule', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'github.com/owner',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
                {
                    repoQualifier: 'owner/repo',
                    primaryColor: '#00ff00',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'https://github.com/owner/repo.git',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(rules, context);

            // Should match first rule
            expect(result).to.exist;
            expect(result?.primaryColor).to.equal('#ff0000');
        });

        it('should match local folder pattern', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: '!/home/user/projects/*',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: '',
                workspaceFolder: '/home/user/projects/my-project',
            };

            const result = findMatchingRepoRule(rules, context);

            expect(result).to.exist;
            expect(result?.repoQualifier).to.equal('!/home/user/projects/*');
        });

        it('should not match non-matching local folder', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: '!/home/user/other-projects/*',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: '',
                workspaceFolder: '/home/user/projects/my-project',
            };

            const result = findMatchingRepoRule(rules, context);

            expect(result).to.be.undefined;
        });

        it('should return undefined when no rules match', () => {
            const rules: RepoConfig[] = [
                {
                    repoQualifier: 'gitlab.com/other/repo',
                    primaryColor: '#ff0000',
                    enabled: true,
                },
            ];
            const context: WorkspaceContext = {
                repoUrl: 'github.com/owner/repo',
                workspaceFolder: '/path/to/workspace',
            };

            const result = findMatchingRepoRule(rules, context);

            expect(result).to.be.undefined;
        });
    });

    describe('findMatchingBranchRule', () => {
        it('should return no match for undefined branch', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [{ pattern: 'main', color: '#ff0000', enabled: true }],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', undefined);

            expect(result.matched).to.be.false;
            expect(result.rule).to.be.undefined;
        });

        it('should return no match for empty branch tables', () => {
            const result = findMatchingBranchRule({}, 'Default Rules', 'main');

            expect(result.matched).to.be.false;
        });

        it('should match exact branch name', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [{ pattern: 'main', color: '#ff0000', enabled: true }],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'main');

            expect(result.matched).to.be.true;
            expect(result.rule).to.exist;
            expect(result.rule?.color).to.equal('#ff0000');
            expect(result.tableName).to.equal('Default Rules');
        });

        it('should match branch pattern with regex', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [{ pattern: 'feature/.*', color: '#00ff00', enabled: true }],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'feature/new-ui');

            expect(result.matched).to.be.true;
            expect(result.rule).to.exist;
            expect(result.rule?.color).to.equal('#00ff00');
        });

        it('should skip disabled rules', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [
                        { pattern: 'main', color: '#ff0000', enabled: false },
                        { pattern: 'main', color: '#00ff00', enabled: true },
                    ],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'main');

            // Should match second rule (enabled one)
            expect(result.matched).to.be.true;
            expect(result.rule?.color).to.equal('#00ff00');
        });

        it('should skip empty patterns', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [
                        { pattern: '', color: '#ff0000', enabled: true },
                        { pattern: 'main', color: '#00ff00', enabled: true },
                    ],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'main');

            expect(result.matched).to.be.true;
            expect(result.rule?.pattern).to.equal('main');
        });

        it('should return first matching rule', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [
                        { pattern: '.*', color: '#ff0000', enabled: true },
                        { pattern: 'main', color: '#00ff00', enabled: true },
                    ],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'main');

            // Should match first rule
            expect(result.matched).to.be.true;
            expect(result.rule?.color).to.equal('#ff0000');
        });

        it('should use specified table name', () => {
            const branchTables = {
                'Custom Table': {
                    rules: [{ pattern: 'main', color: '#ff00ff', enabled: true }],
                },
                'Default Rules': {
                    rules: [{ pattern: 'main', color: '#ff0000', enabled: true }],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Custom Table', 'main');

            expect(result.matched).to.be.true;
            expect(result.rule?.color).to.equal('#ff00ff');
            expect(result.tableName).to.equal('Custom Table');
        });

        it('should return no match when branch does not match', () => {
            const branchTables = {
                'Default Rules': {
                    rules: [{ pattern: 'develop', color: '#ff0000', enabled: true }],
                },
            };

            const result = findMatchingBranchRule(branchTables, 'Default Rules', 'main');

            expect(result.matched).to.be.false;
        });
    });

    describe('getBranchTableName', () => {
        it('should return Default Rules when no repo config', () => {
            const result = getBranchTableName(undefined);

            expect(result).to.equal('Default Rules');
        });

        it('should return undefined when branchTableName is __none__', () => {
            const repoConfig: RepoConfig = {
                repoQualifier: 'github.com/owner/repo',
                primaryColor: '#ff0000',
                branchTableName: '__none__',
            };

            const result = getBranchTableName(repoConfig);

            expect(result).to.be.undefined;
        });

        it('should return specified table name', () => {
            const repoConfig: RepoConfig = {
                repoQualifier: 'github.com/owner/repo',
                primaryColor: '#ff0000',
                branchTableName: 'Custom Table',
            };

            const result = getBranchTableName(repoConfig);

            expect(result).to.equal('Custom Table');
        });

        it('should return Default Rules when no table name specified', () => {
            const repoConfig: RepoConfig = {
                repoQualifier: 'github.com/owner/repo',
                primaryColor: '#ff0000',
            };

            const result = getBranchTableName(repoConfig);

            expect(result).to.equal('Default Rules');
        });
    });
});
