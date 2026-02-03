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
    /** Advanced profile name to use */
    profileName?: string;
    /** Whether this rule is enabled (default: true) */
    enabled?: boolean;
    /** Name of branch table to use from sharedBranchTables */
    branchTableName?: string;
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
 * Branch table structure containing rules and metadata
 */
export interface BranchTable {
    /** Array of branch rules in this table */
    rules: BranchConfigRule[];
}

/**
 * Collection of shared branch tables, keyed by table name
 */
export type SharedBranchTables = { [tableName: string]: BranchTable };

/**
 * Type that can be either a legacy string format or new JSON object format for repository rules
 */
export type RepoConfigItem = string | RepoConfigRule;

/**
 * Type that can be either a legacy string format or new JSON object format for branch rules
 */
export type BranchConfigItem = string | BranchConfigRule;
