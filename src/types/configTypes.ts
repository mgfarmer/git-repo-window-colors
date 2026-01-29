/**
 * Type definitions for repository and branch configuration rules
 */

/**
 * Repository configuration rule (JSON object format)
 */
export interface RepoConfigRule {
    /** Repository identifier (matched against git remote URL) */
    repoQualifier: string;
    /** Primary color for title bar and activity bar (CSS color or profile name) */
    primaryColor: string;
    /** Default branch name (e.g., 'main', 'master') */
    defaultBranch?: string;
    /** Color when not on default branch (CSS color or profile name) */
    branchColor?: string;
    /** Advanced profile name to use */
    profileName?: string;
    /** Whether this rule is enabled (default: true) */
    enabled?: boolean;
    /** Local branch rules for this repository */
    branchRules?: BranchConfigRule[];
    /** Whether to use global branch rules (default: true) */
    useGlobalBranchRules?: boolean;
}

/**
 * Branch configuration rule (JSON object format)
 */
export interface BranchConfigRule {
    /** Regex pattern to match branch name */
    pattern: string;
    /** Branch color (CSS color or profile name) */
    color: string;
    /** Whether this rule is enabled (default: true) */
    enabled?: boolean;
}

/**
 * Type that can be either a legacy string format or new JSON object format for repository rules
 */
export type RepoConfigItem = string | RepoConfigRule;

/**
 * Type that can be either a legacy string format or new JSON object format for branch rules
 */
export type BranchConfigItem = string | BranchConfigRule;
