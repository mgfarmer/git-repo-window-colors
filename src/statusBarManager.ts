/**
 * Status Bar Manager Module
 *
 * Handles the logic for determining when to show the status bar icon
 * and what tooltip text to display based on repository matching rules.
 */

import { RepoConfig } from './ruleParser';
import { WorkspaceContext, findMatchingRepoRule } from './ruleMatching';

/**
 * Configuration for status bar visibility
 */
export interface StatusBarConfig {
    /** Whether to show the status bar icon only when no rule matches */
    showOnlyWhenNoMatch: boolean;
}

/**
 * Status bar display state
 */
export interface StatusBarState {
    /** Whether the status bar should be visible */
    visible: boolean;
    /** Tooltip text to display */
    tooltip: string;
}

/**
 * Determine if the status bar should be shown based on current context and rules.
 *
 * Logic:
 * - If showOnlyWhenNoMatch is false: Always show when there's a workspace
 * - If showOnlyWhenNoMatch is true: Show only when no rule matches
 * - Hide if there's no workspace context (no git repo and no folder)
 *
 * @param rules Array of repository rules
 * @param context Current workspace context
 * @param config Status bar configuration
 * @returns True if status bar should be visible
 */
export function shouldShowStatusBar(
    rules: RepoConfig[] | undefined,
    context: WorkspaceContext | undefined,
    config: StatusBarConfig,
): boolean {
    // No workspace context - always hide
    if (!context || (!context.repoUrl && !context.workspaceFolder)) {
        return false;
    }

    // If configured to always show (when we have context)
    if (!config.showOnlyWhenNoMatch) {
        return true;
    }

    // Show only when no match: check if any rule matches

    // No rules configured - show status bar
    if (!rules || rules.length === 0) {
        return true;
    }

    // Check if any rule matches
    const matchedRule = findMatchingRepoRule(rules, context);

    // Show status bar only if no rule matches
    return matchedRule === undefined;
}

/**
 * Determine the tooltip text for the status bar based on matching rules.
 *
 * @param rules Array of repository rules
 * @param context Current workspace context
 * @returns Appropriate tooltip text
 */
export function getStatusBarTooltip(rules: RepoConfig[] | undefined, context: WorkspaceContext | undefined): string {
    const baseTooltip = 'Git Repo Window Colors';

    // No context - use generic tooltip
    if (!context || (!context.repoUrl && !context.workspaceFolder)) {
        return `${baseTooltip} - Click to configure`;
    }

    // Check if a rule matches
    if (!rules || rules.length === 0) {
        return `${baseTooltip} - Click to add color rules for this repository`;
    }

    const matchedRule = findMatchingRepoRule(rules, context);

    if (matchedRule) {
        return `${baseTooltip} - Repository has color rules configured`;
    } else {
        return `${baseTooltip} - Click to add color rules for this repository`;
    }
}

/**
 * Get the complete status bar state (visibility and tooltip).
 *
 * @param rules Array of repository rules
 * @param context Current workspace context
 * @param config Status bar configuration
 * @returns Status bar state with visibility and tooltip
 */
export function getStatusBarState(
    rules: RepoConfig[] | undefined,
    context: WorkspaceContext | undefined,
    config: StatusBarConfig,
): StatusBarState {
    const visible = shouldShowStatusBar(rules, context, config);
    const tooltip = getStatusBarTooltip(rules, context);

    return {
        visible,
        tooltip,
    };
}
