/**
 * Git Operations Module
 *
 * Provides abstracted git operations that can be tested without
 * requiring the VS Code git extension API. This module defines
 * interfaces for git-related dependencies and pure functions that
 * work with those interfaces.
 */

/**
 * Represents a git repository's state
 */
export interface GitRepository {
    state: {
        remotes: Array<{ fetchUrl: string }>;
        HEAD?: {
            name?: string;
        };
    };
}

/**
 * Represents the VS Code Git API
 */
export interface GitAPI {
    state: string;
    getRepository(uri: any): GitRepository | null;
    onDidChangeState(listener: (state: string) => void): { dispose: () => void };
}

/**
 * Represents a VS Code extension (specifically the git extension)
 */
export interface GitExtension {
    isActive: boolean;
    exports: {
        getAPI(version: number): GitAPI;
    };
    activate(): Promise<{ getAPI(version: number): GitAPI }>;
}

/**
 * Workspace information needed for finding repositories
 */
export interface WorkspaceInfo {
    /** Current active editor's document URI, if any */
    activeEditorUri?: any;
    /** List of workspace folders */
    workspaceFolders?: Array<{ uri: any }>;
    /** Function to get workspace folder for a given URI */
    getWorkspaceFolder(uri: any): { uri: any } | undefined;
}

/**
 * Logger interface for git operations
 */
export interface GitOperationsLogger {
    warn(message: string): void;
}

/**
 * Check if the git extension is available and active.
 *
 * @param extension - The git extension object (or undefined if not found)
 * @param logger - Optional logger for warnings
 * @returns true if git extension is available and active
 */
export function isGitExtensionAvailable(extension: GitExtension | undefined, logger?: GitOperationsLogger): boolean {
    if (!extension) {
        if (logger) {
            logger.warn('Git extension not available');
        }
        return false;
    }
    if (!extension.isActive) {
        if (logger) {
            logger.warn('Git extension not active');
        }
        return false;
    }
    return true;
}

/**
 * Get the git repository for the current workspace.
 *
 * This function tries to find the repository for the active editor first,
 * falling back to the first workspace folder if needed.
 *
 * @param gitAPI - The VS Code Git API
 * @param workspace - Workspace information
 * @returns The git repository, or null if not found
 */
export function getWorkspaceRepository(gitAPI: GitAPI, workspace: WorkspaceInfo): GitRepository | null {
    let workspaceRoot: any | undefined = undefined;

    // Try to get workspace root from active editor
    if (workspace.activeEditorUri) {
        const folder = workspace.getWorkspaceFolder(workspace.activeEditorUri);
        if (folder) {
            workspaceRoot = folder.uri;
        }
    }

    // Fallback to the first workspace folder
    if (!workspaceRoot && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        workspaceRoot = workspace.workspaceFolders[0].uri;
    }

    if (!workspaceRoot) {
        return null;
    }

    // Find the repository that matches the workspaceRoot
    return gitAPI.getRepository(workspaceRoot);
}

/**
 * Get the current branch name from a git repository.
 *
 * @param repository - The git repository (or null for non-git workspaces)
 * @param logger - Optional logger for warnings
 * @returns The branch name, or undefined if not available
 */
export function getCurrentBranch(repository: GitRepository | null, logger?: GitOperationsLogger): string | undefined {
    // If gitRepository is undefined (local folder workspace), return undefined
    if (!repository) {
        return undefined;
    }

    const head = repository.state.HEAD;
    if (!head) {
        if (logger) {
            logger.warn('No HEAD found for repository.');
        }
        return undefined;
    }

    if (!head.name) {
        // Detached HEAD state
        if (logger) {
            logger.warn('Repository is in a detached HEAD state.');
        }
        return undefined;
    }

    return head.name;
}

/**
 * Get the remote fetch URL from a git repository.
 *
 * @param repository - The git repository (or null for non-git workspaces)
 * @returns The remote fetch URL, or empty string if not available
 */
export function getRemoteUrl(repository: GitRepository | null): string {
    if (!repository) {
        return '';
    }

    const remotes = repository.state.remotes;
    if (!remotes || remotes.length === 0) {
        return '';
    }

    return remotes[0].fetchUrl || '';
}

/**
 * Result of initializing git API from extension
 */
export interface GitAPIInitResult {
    api: GitAPI | null;
    error?: string;
}

/**
 * Initialize the Git API from the git extension.
 *
 * @param extension - The git extension
 * @returns Result containing the API or error message
 */
export async function initializeGitAPI(extension: GitExtension): Promise<GitAPIInitResult> {
    try {
        const api = extension.isActive ? extension.exports.getAPI(1) : (await extension.activate()).getAPI(1);

        if (!api) {
            return { api: null, error: 'Git API not available.' };
        }

        return { api, error: undefined };
    } catch (error) {
        return { api: null, error: `Failed to initialize Git API: ${error}` };
    }
}
