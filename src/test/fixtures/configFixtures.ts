/**
 * Test fixtures for extension configuration
 * Provides reusable test configurations for various scenarios
 */

/**
 * Default extension configuration (matches package.json defaults)
 */
export const DEFAULT_CONFIG = {
    repoConfigurationList: [],
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
        primaryColor: '#3B82F6',
        enabled: true,
    },
    gitlab: {
        repoQualifier: 'gitlab.com/mygroup/myproject',
        primaryColor: '#EF4444',
        enabled: true,
    },
    localFolder: {
        repoQualifier: '!/home/user/projects/local-repo',
        primaryColor: '#10B981',
        enabled: true,
    },
    disabled: {
        repoQualifier: 'github.com/disabled/repo',
        primaryColor: '#8B5CF6',
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
        color: '#10B981',
        enabled: true,
    },
    bugfix: {
        pattern: '^(bug/|bugfix/)',
        color: '#EF4444',
        enabled: true,
    },
    main: {
        pattern: '^(main|master)$',
        color: '#3B82F6',
        enabled: true,
    },
    disabled: {
        pattern: '^disabled/',
        color: '#8B5CF6',
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
                { pattern: '^feature/', color: '#10B981', enabled: true },
                { pattern: '^bug/', color: '#EF4444', enabled: true },
                { pattern: '^(main|master)$', color: '#3B82F6', enabled: true },
            ],
        },
    },
    multiTable: {
        Production: {
            rules: [
                { pattern: '^(main|master)$', color: '#DC2626', enabled: true },
                { pattern: '^release/', color: '#F59E0B', enabled: true },
            ],
        },
        Development: {
            rules: [
                { pattern: '^feature/', color: '#10B981', enabled: true },
                { pattern: '^dev', color: '#3B82F6', enabled: true },
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
            primaryActiveBg: { value: '#3B82F6' },
            primaryActiveFg: { value: '#FFFFFF' },
            secondaryActiveBg: { value: '#1D4ED8' },
            secondaryActiveFg: { value: '#FFFFFF' },
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
                value: '#3B82F6',
            },
            lighter: {
                value: '#3B82F6',
                lighten: 0.2,
            },
            withOpacity: {
                value: '#3B82F6',
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
                primaryColor: '#3B82F6',
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
        repoConfigurationList: [REPO_CONFIGS.github],
    },

    /** Simple mode with repo and branch rules */
    simpleWithBranches: {
        ...DEFAULT_CONFIG,
        repoConfigurationList: [REPO_CONFIGS.github],
        sharedBranchTables: BRANCH_TABLES.default,
    },

    /** Advanced mode with custom profile */
    advancedWithProfile: {
        ...DEFAULT_CONFIG,
        repoConfigurationList: [
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
        repoConfigurationList: [
            { repoQualifier: 'github.com/org', primaryColor: '#3B82F6', enabled: true },
            { repoQualifier: 'github.com/org/specific', primaryColor: '#EF4444', enabled: true },
            { repoQualifier: 'gitlab.com', primaryColor: '#10B981', enabled: true },
        ],
    },

    /** Branch override scenario */
    branchOverride: {
        ...DEFAULT_CONFIG,
        repoConfigurationList: [
            {
                repoQualifier: 'github.com/testorg/testrepo',
                primaryColor: '#3B82F6',
                branchTableName: 'Default Rules',
                enabled: true,
            },
        ],
        sharedBranchTables: BRANCH_TABLES.default,
    },

    /** Mixed: some profiles, some colors */
    mixedMode: {
        ...DEFAULT_CONFIG,
        repoConfigurationList: [
            { repoQualifier: 'github.com/simple', primaryColor: '#3B82F6', enabled: true },
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
        primaryColor,
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
        color,
        enabled,
    };
}
