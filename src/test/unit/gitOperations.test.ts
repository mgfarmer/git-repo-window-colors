import { expect } from 'chai';
import {
    isGitExtensionAvailable,
    getWorkspaceRepository,
    getCurrentBranch,
    getRemoteUrl,
    initializeGitAPI,
    GitExtension,
    GitAPI,
    GitRepository,
    WorkspaceInfo,
} from '../../gitOperations';

describe('gitOperations', () => {
    describe('isGitExtensionAvailable', () => {
        it('should return false when extension is undefined', () => {
            const result = isGitExtensionAvailable(undefined);
            expect(result).to.be.false;
        });

        it('should log warning when extension is undefined', () => {
            const logs: string[] = [];
            const logger = { warn: (msg: string) => logs.push(msg) };

            isGitExtensionAvailable(undefined, logger);

            expect(logs).to.include('Git extension not available');
        });

        it('should return false when extension is not active', () => {
            const extension: GitExtension = {
                isActive: false,
                exports: { getAPI: () => ({}) as any },
                activate: async () => ({ getAPI: () => ({}) as any }),
            };

            const result = isGitExtensionAvailable(extension);

            expect(result).to.be.false;
        });

        it('should log warning when extension is not active', () => {
            const logs: string[] = [];
            const logger = { warn: (msg: string) => logs.push(msg) };
            const extension: GitExtension = {
                isActive: false,
                exports: { getAPI: () => ({}) as any },
                activate: async () => ({ getAPI: () => ({}) as any }),
            };

            isGitExtensionAvailable(extension, logger);

            expect(logs).to.include('Git extension not active');
        });

        it('should return true when extension is active', () => {
            const extension: GitExtension = {
                isActive: true,
                exports: { getAPI: () => ({}) as any },
                activate: async () => ({ getAPI: () => ({}) as any }),
            };

            const result = isGitExtensionAvailable(extension);

            expect(result).to.be.true;
        });

        it('should not log anything when extension is available', () => {
            const logs: string[] = [];
            const logger = { warn: (msg: string) => logs.push(msg) };
            const extension: GitExtension = {
                isActive: true,
                exports: { getAPI: () => ({}) as any },
                activate: async () => ({ getAPI: () => ({}) as any }),
            };

            isGitExtensionAvailable(extension, logger);

            expect(logs).to.have.lengthOf(0);
        });
    });

    describe('getWorkspaceRepository', () => {
        const mockGitAPI: GitAPI = {
            state: 'initialized',
            getRepository: (uri: any) => null,
            onDidChangeState: () => ({ dispose: () => {} }),
        };

        it('should return null when no workspace root is found', () => {
            const workspace: WorkspaceInfo = {
                workspaceFolders: undefined,
                getWorkspaceFolder: () => undefined,
            };

            const result = getWorkspaceRepository(mockGitAPI, workspace);

            expect(result).to.be.null;
        });

        it('should use active editor URI to find workspace', () => {
            const mockRepo: GitRepository = {
                state: {
                    remotes: [{ fetchUrl: 'https://github.com/test/repo' }],
                    HEAD: { name: 'main' },
                },
            };

            const editorUri = { fsPath: '/test/editor/file.ts' };
            const folderUri = { fsPath: '/test/workspace' };

            const gitAPI: GitAPI = {
                state: 'initialized',
                getRepository: (uri: any) => {
                    if (uri === folderUri) return mockRepo;
                    return null;
                },
                onDidChangeState: () => ({ dispose: () => {} }),
            };

            const workspace: WorkspaceInfo = {
                activeEditorUri: editorUri,
                workspaceFolders: [{ uri: folderUri }],
                getWorkspaceFolder: (uri: any) => {
                    if (uri === editorUri) return { uri: folderUri };
                    return undefined;
                },
            };

            const result = getWorkspaceRepository(gitAPI, workspace);

            expect(result).to.equal(mockRepo);
        });

        it('should fallback to first workspace folder when no active editor', () => {
            const mockRepo: GitRepository = {
                state: {
                    remotes: [{ fetchUrl: 'https://github.com/test/repo' }],
                    HEAD: { name: 'main' },
                },
            };

            const folderUri = { fsPath: '/test/workspace' };

            const gitAPI: GitAPI = {
                state: 'initialized',
                getRepository: (uri: any) => {
                    if (uri === folderUri) return mockRepo;
                    return null;
                },
                onDidChangeState: () => ({ dispose: () => {} }),
            };

            const workspace: WorkspaceInfo = {
                workspaceFolders: [{ uri: folderUri }],
                getWorkspaceFolder: () => undefined,
            };

            const result = getWorkspaceRepository(gitAPI, workspace);

            expect(result).to.equal(mockRepo);
        });

        it('should return null when repository not found', () => {
            const gitAPI: GitAPI = {
                state: 'initialized',
                getRepository: () => null,
                onDidChangeState: () => ({ dispose: () => {} }),
            };

            const workspace: WorkspaceInfo = {
                workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
                getWorkspaceFolder: () => undefined,
            };

            const result = getWorkspaceRepository(gitAPI, workspace);

            expect(result).to.be.null;
        });
    });

    describe('getCurrentBranch', () => {
        it('should return undefined when repository is null', () => {
            const result = getCurrentBranch(null);
            expect(result).to.be.undefined;
        });

        it('should return undefined when HEAD is not present', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: undefined,
                },
            };

            const result = getCurrentBranch(repo);

            expect(result).to.be.undefined;
        });

        it('should log warning when HEAD is not present', () => {
            const logs: string[] = [];
            const logger = { warn: (msg: string) => logs.push(msg) };
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: undefined,
                },
            };

            getCurrentBranch(repo, logger);

            expect(logs).to.include('No HEAD found for repository.');
        });

        it('should return undefined when HEAD name is not present (detached HEAD)', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: {},
                },
            };

            const result = getCurrentBranch(repo);

            expect(result).to.be.undefined;
        });

        it('should log warning for detached HEAD state', () => {
            const logs: string[] = [];
            const logger = { warn: (msg: string) => logs.push(msg) };
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: {},
                },
            };

            getCurrentBranch(repo, logger);

            expect(logs).to.include('Repository is in a detached HEAD state.');
        });

        it('should return branch name when available', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: { name: 'main' },
                },
            };

            const result = getCurrentBranch(repo);

            expect(result).to.equal('main');
        });

        it('should return feature branch name', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: { name: 'feature/new-feature' },
                },
            };

            const result = getCurrentBranch(repo);

            expect(result).to.equal('feature/new-feature');
        });
    });

    describe('getRemoteUrl', () => {
        it('should return empty string when repository is null', () => {
            const result = getRemoteUrl(null);
            expect(result).to.equal('');
        });

        it('should return empty string when no remotes', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [],
                    HEAD: { name: 'main' },
                },
            };

            const result = getRemoteUrl(repo);

            expect(result).to.equal('');
        });

        it('should return first remote fetch URL', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [{ fetchUrl: 'https://github.com/owner/repo.git' }],
                    HEAD: { name: 'main' },
                },
            };

            const result = getRemoteUrl(repo);

            expect(result).to.equal('https://github.com/owner/repo.git');
        });

        it('should return first remote when multiple remotes exist', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [
                        { fetchUrl: 'https://github.com/owner/repo1.git' },
                        { fetchUrl: 'https://github.com/owner/repo2.git' },
                    ],
                    HEAD: { name: 'main' },
                },
            };

            const result = getRemoteUrl(repo);

            expect(result).to.equal('https://github.com/owner/repo1.git');
        });

        it('should return empty string if fetchUrl is empty', () => {
            const repo: GitRepository = {
                state: {
                    remotes: [{ fetchUrl: '' }],
                    HEAD: { name: 'main' },
                },
            };

            const result = getRemoteUrl(repo);

            expect(result).to.equal('');
        });
    });

    describe('initializeGitAPI', () => {
        it('should return API when extension is already active', async () => {
            const mockAPI: GitAPI = {
                state: 'initialized',
                getRepository: () => null,
                onDidChangeState: () => ({ dispose: () => {} }),
            };

            const extension: GitExtension = {
                isActive: true,
                exports: { getAPI: () => mockAPI },
                activate: async () => ({ getAPI: () => mockAPI }),
            };

            const result = await initializeGitAPI(extension);

            expect(result.api).to.equal(mockAPI);
            expect(result.error).to.be.undefined;
        });

        it('should activate extension and return API when not active', async () => {
            const mockAPI: GitAPI = {
                state: 'initialized',
                getRepository: () => null,
                onDidChangeState: () => ({ dispose: () => {} }),
            };

            let activated = false;

            const extension: GitExtension = {
                isActive: false,
                exports: { getAPI: () => mockAPI },
                activate: async () => {
                    activated = true;
                    return { getAPI: () => mockAPI };
                },
            };

            const result = await initializeGitAPI(extension);

            expect(activated).to.be.true;
            expect(result.api).to.equal(mockAPI);
            expect(result.error).to.be.undefined;
        });

        it('should return error when API is not available', async () => {
            const extension: GitExtension = {
                isActive: true,
                exports: { getAPI: () => null as any },
                activate: async () => ({ getAPI: () => null as any }),
            };

            const result = await initializeGitAPI(extension);

            expect(result.api).to.be.null;
            expect(result.error).to.equal('Git API not available.');
        });

        it('should handle activation errors', async () => {
            const extension: GitExtension = {
                isActive: false,
                exports: { getAPI: () => ({}) as any },
                activate: async () => {
                    throw new Error('Activation failed');
                },
            };

            const result = await initializeGitAPI(extension);

            expect(result.api).to.be.null;
            expect(result.error).to.include('Failed to initialize Git API');
            expect(result.error).to.include('Activation failed');
        });
    });
});
