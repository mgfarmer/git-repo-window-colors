import { RepoConfig, BranchRule } from './ruleParser';
import { matchesLocalFolderPattern } from './pathUtils';

/**
 * Workspace context for rule matching
 */
export interface WorkspaceContext {
    repoUrl: string;
    workspaceFolder: string;
    currentBranch?: string;
}

/**
 * Shared branch table structure
 */
export interface SharedBranchTable {
    rules: BranchRule[];
}

/**
 * Result of branch rule matching
 */
export interface BranchMatchResult {
    matched: boolean;
    rule?: BranchRule;
    tableName?: string;
}

/**
 * Find the first matching repository rule for the current context.
 * Rules are checked in order and the first match wins.
 *
 * @param rules Array of repository rules to check
 * @param context Current workspace context (repo URL, folder path)
 * @returns The first matching rule, or undefined if no match
 */
export function findMatchingRepoRule(
    rules: Array<RepoConfig> | undefined,
    context: WorkspaceContext,
): RepoConfig | undefined {
    if (!rules) {
        return undefined;
    }

    for (const rule of rules) {
        // Skip disabled rules
        if (rule.enabled === false) {
            continue;
        }

        // Check if this is a local folder pattern (starts with !)
        if (rule.repoQualifier.startsWith('!')) {
            if (context.workspaceFolder && matchesLocalFolderPattern(context.workspaceFolder, rule.repoQualifier)) {
                return rule;
            }
        } else {
            // Standard git repo matching
            if (context.repoUrl && context.repoUrl.includes(rule.repoQualifier)) {
                return rule;
            }
        }
    }

    return undefined;
}

/**
 * Find the first matching branch rule for the current branch.
 *
 * @param branchTables All available branch tables
 * @param tableName Name of the table to use (or 'Default Rules')
 * @param currentBranch The current git branch name
 * @returns Match result with the matched rule if found
 */
export function findMatchingBranchRule(
    branchTables: { [key: string]: SharedBranchTable },
    tableName: string,
    currentBranch?: string,
): BranchMatchResult {
    if (!currentBranch) {
        return { matched: false };
    }

    const branchTable = branchTables[tableName];
    if (!branchTable || !branchTable.rules || branchTable.rules.length === 0) {
        return { matched: false };
    }

    for (const rule of branchTable.rules) {
        // Skip disabled rules
        if (rule.enabled === false) {
            continue;
        }

        // Skip empty patterns
        if (rule.pattern === '') {
            continue;
        }

        // Check if branch matches the pattern
        if (currentBranch.match(rule.pattern)) {
            return {
                matched: true,
                rule: rule,
                tableName: tableName,
            };
        }
    }

    return { matched: false };
}

/**
 * Get the branch table name to use for a given repo config.
 *
 * @param repoConfig The matched repository config
 * @returns The table name to use, or undefined if branch rules are disabled
 */
export function getBranchTableName(repoConfig: RepoConfig | undefined): string | undefined {
    // If no repo config, use default
    if (!repoConfig) {
        return 'Default Rules';
    }

    // Check if explicitly disabled
    if (repoConfig.branchTableName === '__none__') {
        return undefined;
    }

    // Use specified table or default
    return repoConfig.branchTableName || 'Default Rules';
}
