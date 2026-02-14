/**
 * Test fixtures for extension configuration
 * Provides reusable test configurations for various scenarios
 */

import { createThemedColor } from '../../colorDerivation';

/**
 * Default extension configuration (matches package.json defaults)
 */
export const DEFAULT_CONFIG = {
    repoRules: [],
    branchConfigurationList: ['^(bug/|bug-.*):red', '^(feature/|feature-).*:green', '^(?!(main|master)$).*:purple'],
    sharedBranchTables: {
        'Default Rules': {
            rules: [],
        },
    },
    advancedProfiles: {},
    colorInactiveTitlebar: true,
    colorEditorTabs: false,
    colorStatusBar: false,
    activityBarColorKnob: 0,
    applyBranchColorToTabsAndStatusBar: false,
    removeManagedColors: true,
    showStatusIconWhenNoRuleMatches: true,
    askToColorizeRepoWhenOpened: true,
    previewSelectedRepoRule: false,
    configSchemaVersion: 1,
};

/**
 * Simple repo configuration examples
 */
export const REPO_CONFIGS = {
    github: {
        repoQualifier: 'github.com/testorg/testrepo',
        primaryColor: createThemedColor('#3B82F6', 'dark'),
        enabled: true,
    },
    gitlab: {
        repoQualifier: 'gitlab.com/mygroup/myproject',
        primaryColor: createThemedColor('#EF4444', 'dark'),
        enabled: true,
    },
    localFolder: {
        repoQualifier: '!/home/user/projects/local-repo',
        primaryColor: createThemedColor('#10B981', 'dark'),
        enabled: true,
    },
    disabled: {
        repoQualifier: 'github.com/disabled/repo',
        primaryColor: createThemedColor('#8B5CF6', 'dark'),
        enabled: false,
    },
    noneColor: {
        repoQualifier: 'github.com/none/repo',
        primaryColor: 'none',
        enabled: true,
    },
};

/**
 * Branch configuration examples
 */
export const BRANCH_CONFIGS = {
    feature: {
        pattern: '^feature/',
        color: createThemedColor('#10B981', 'dark'),
        enabled: true,
    },
    bugfix: {
        pattern: '^(bug/|bugfix/)',
        color: createThemedColor('#EF4444', 'dark'),
        enabled: true,
    },
    main: {
        pattern: '^(main|master)$',
        color: createThemedColor('#3B82F6', 'dark'),
        enabled: true,
    },
    disabled: {
        pattern: '^disabled/',
        color: createThemedColor('#8B5CF6', 'dark'),
        enabled: false,
    },
    noneColor: {
        pattern: '^none/',
        color: 'none',
        enabled: true,
    },
};

/**
 * Shared branch table examples
 */
export const BRANCH_TABLES = {
    default: {
        'Default Rules': {
            rules: [
                { pattern: '^feature/', color: createThemedColor('#10B981', 'dark'), enabled: true },
                { pattern: '^bug/', color: createThemedColor('#EF4444', 'dark'), enabled: true },
                { pattern: '^(main|master)$', color: createThemedColor('#3B82F6', 'dark'), enabled: true },
            ],
        },
    },
    multiTable: {
        Production: {
            rules: [
                { pattern: '^(main|master)$', color: createThemedColor('#DC2626', 'dark'), enabled: true },
                { pattern: '^release/', color: createThemedColor('#F59E0B', 'dark'), enabled: true },
            ],
        },
        Development: {
            rules: [
                { pattern: '^feature/', color: createThemedColor('#10B981', 'dark'), enabled: true },
                { pattern: '^dev', color: createThemedColor('#3B82F6', 'dark'), enabled: true },
            ],
        },
    },
};

/**
 * Advanced profile examples
 */
export const ADVANCED_PROFILES = {
    blueTheme: {
        name: 'Blue Theme',
        slots: {
            primaryActiveBg: { value: createThemedColor('#3B82F6', 'dark') },
            primaryActiveFg: { value: createThemedColor('#FFFFFF', 'dark') },
            secondaryActiveBg: { value: createThemedColor('#1D4ED8', 'dark') },
            secondaryActiveFg: { value: createThemedColor('#FFFFFF', 'dark') },
        },
        mappings: {
            'titleBar.activeBackground': 'primaryActiveBg',
            'titleBar.activeForeground': 'primaryActiveFg',
            'activityBar.background': 'secondaryActiveBg',
            'activityBar.foreground': 'secondaryActiveFg',
        },
    },
    withModifiers: {
        name: 'With Modifiers',
        slots: {
            base: {
                value: createThemedColor('#3B82F6', 'dark'),
            },
            lighter: {
                value: createThemedColor('#3B82F6', 'dark'),
                lighten: 0.2,
            },
            withOpacity: {
                value: createThemedColor('#3B82F6', 'dark'),
                opacity: 0.5,
            },
        },
        mappings: {
            'titleBar.activeBackground': 'base',
            'titleBar.inactiveBackground': 'lighter',
            'statusBar.background': { slot: 'withOpacity', opacity: 0.8 },
        },
    },
    generatedPalette: {
        name: 'Generated Palette',
        slots: {
            __palette__: {
                primaryColor: createThemedColor('#3B82F6', 'dark'),
                algorithm: 'balanced',
            },
        },
        mappings: {
            'titleBar.activeBackground': 'primaryActiveBg',
            'activityBar.background': 'secondaryActiveBg',
            'statusBar.background': 'tertiaryActiveBg',
            'panel.background': 'quaternaryActiveBg',
        },
    },
};

/**
 * Complete configuration scenarios
 */
export const SCENARIOS = {
    /** Simple mode with single repo, no branches */
    simpleRepoOnly: {
        ...DEFAULT_CONFIG,
        repoRules: [REPO_CONFIGS.github],
    },

    /** Simple mode with repo and branch rules */
    simpleWithBranches: {
        ...DEFAULT_CONFIG,
        repoRules: [REPO_CONFIGS.github],
        sharedBranchTables: BRANCH_TABLES.default,
    },

    /** Advanced mode with custom profile */
    advancedWithProfile: {
        ...DEFAULT_CONFIG,
        repoRules: [
            {
                repoQualifier: 'github.com/testorg/testrepo',
                profileName: 'Blue Theme',
                enabled: true,
            },
        ],
        advancedProfiles: {
            'Blue Theme': ADVANCED_PROFILES.blueTheme,
        },
    },

    /** Multiple repos with priorities */
    multipleRepos: {
        ...DEFAULT_CONFIG,
        repoRules: [
            {
                repoQualifier: 'github.com/org',
                primaryColor: createThemedColor('#3B82F6', 'dark'),
                enabled: true,
            },
            {
                repoQualifier: 'github.com/org/specific',
                primaryColor: createThemedColor('#EF4444', 'dark'),
                enabled: true,
            },
            { repoQualifier: 'gitlab.com', primaryColor: createThemedColor('#10B981', 'dark'), enabled: true },
        ],
    },

    /** Branch override scenario */
    branchOverride: {
        ...DEFAULT_CONFIG,
        repoRules: [
            {
                repoQualifier: 'github.com/testorg/testrepo',
                primaryColor: createThemedColor('#3B82F6', 'dark'),
                branchTableName: 'Default Rules',
                enabled: true,
            },
        ],
        sharedBranchTables: BRANCH_TABLES.default,
    },

    /** Mixed: some profiles, some colors */
    mixedMode: {
        ...DEFAULT_CONFIG,
        repoRules: [
            {
                repoQualifier: 'github.com/simple',
                primaryColor: createThemedColor('#3B82F6', 'dark'),
                enabled: true,
            },
            { repoQualifier: 'github.com/advanced', profileName: 'Blue Theme', enabled: true },
        ],
        advancedProfiles: {
            'Blue Theme': ADVANCED_PROFILES.blueTheme,
        },
    },
};

/**
 * Helper to create a minimal test configuration
 */
export function createTestConfig(overrides: Partial<typeof DEFAULT_CONFIG> = {}) {
    return {
        ...DEFAULT_CONFIG,
        ...overrides,
    };
}

/**
 * Helper to create a repo rule
 */
export function createRepoRule(repoQualifier: string, primaryColor: string, options: any = {}) {
    return {
        repoQualifier,
        primaryColor: primaryColor === 'none' ? 'none' : createThemedColor(primaryColor, 'dark'),
        enabled: true,
        ...options,
    };
}

/**
 * Helper to create a branch rule
 */
export function createBranchRule(pattern: string, color: string, enabled = true) {
    return {
        pattern,
        color: color === 'none' ? 'none' : createThemedColor(color, 'dark'),
        enabled,
    };
}
