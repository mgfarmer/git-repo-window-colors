/**
 * Mock VS Code API for integration/unit testing
 * Provides comprehensive mocks for configuration, git, workspace, etc.
 */

// ========== Configuration Store ==========
// In-memory configuration store: { section: { key: value } }
const configStore: { [section: string]: { [key: string]: any } } = {};

/**
 * Reset configuration store to initial state (for test cleanup)
 */
export function __resetMockConfiguration() {
    Object.keys(configStore).forEach((key) => delete configStore[key]);
}

/**
 * Get configuration value directly (test helper)
 */
export function __getMockConfigValue(section: string, key: string): any {
    return configStore[section]?.[key];
}

/**
 * Set configuration value directly (test helper)
 */
export function __setMockConfigValue(section: string, key: string, value: any) {
    if (!configStore[section]) {
        configStore[section] = {};
    }
    configStore[section][key] = value;
}

// ========== Configuration API ==========
class MockConfiguration {
    constructor(private section: string) {}

    get<T>(key: string, defaultValue?: T): T {
        const value = configStore[this.section]?.[key];
        return value !== undefined ? value : (defaultValue as T);
    }

    has(key: string): boolean {
        return configStore[this.section]?.[key] !== undefined;
    }

    inspect<T>(key: string) {
        const value = configStore[this.section]?.[key];
        return {
            key: `${this.section}.${key}`,
            defaultValue: undefined,
            globalValue: value,
            workspaceValue: value,
            workspaceFolderValue: undefined,
        };
    }

    update(key: string, value: any, configurationTarget?: boolean | number): Promise<void> {
        if (!configStore[this.section]) {
            configStore[this.section] = {};
        }
        if (value === undefined) {
            delete configStore[this.section][key];
        } else {
            configStore[this.section][key] = value;
        }
        return Promise.resolve();
    }
}

// ========== Git Mocking ==========
let mockGitRemoteUrl = '';
let mockGitCurrentBranch = 'main';
let mockGitState: 'uninitialized' | 'initialized' = 'initialized';

/**
 * Configure mock git state (test helper)
 */
export function __setMockGitState(
    remoteUrl: string,
    currentBranch: string,
    state: 'uninitialized' | 'initialized' = 'initialized',
) {
    mockGitRemoteUrl = remoteUrl;
    mockGitCurrentBranch = currentBranch;
    mockGitState = state;
}

/**
 * Reset mock git state (for test cleanup)
 */
export function __resetMockGitState() {
    mockGitRemoteUrl = '';
    mockGitCurrentBranch = 'main';
    mockGitState = 'initialized';
}

const mockGitRepository = {
    state: {
        get remotes() {
            return [{ fetchUrl: mockGitRemoteUrl, pushUrl: mockGitRemoteUrl }];
        },
        get HEAD() {
            return mockGitCurrentBranch ? { name: mockGitCurrentBranch } : undefined;
        },
    },
};

const mockGitAPI = {
    get state() {
        return mockGitState;
    },
    getRepository: (uri: any) => mockGitRepository,
    onDidChangeState: () => ({ dispose: () => {} }),
};

const mockGitExtension = {
    id: 'vscode.git',
    extensionUri: { fsPath: '/mock/git/extension' },
    extensionPath: '/mock/git/extension',
    isActive: true,
    packageJSON: {},
    exports: {
        getAPI: (version: number) => mockGitAPI,
    },
    activate: () => Promise.resolve(mockGitExtension.exports),
};

// ========== Theme Mocking ==========
let mockColorThemeKind = 2; // Default: Dark

/**
 * Set mock color theme (test helper)
 */
export function __setMockColorTheme(kind: ColorThemeKind) {
    mockColorThemeKind = kind;
}

/**
 * Reset mock color theme (for test cleanup)
 */
export function __resetMockColorTheme() {
    mockColorThemeKind = 2; // Dark
}

// ========== Event Emitters ==========
class MockEventEmitter<T> {
    private listeners: Array<(e: T) => any> = [];

    fire(data: T) {
        this.listeners.forEach((listener) => listener(data));
    }

    event = (listener: (e: T) => any) => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(listener);
                if (index >= 0) this.listeners.splice(index, 1);
            },
        };
    };
}

const configChangeEmitter = new MockEventEmitter<any>();

// ========== Workspace Folders ==========
let mockWorkspaceFolders: any[] = [
    {
        uri: { fsPath: '/test/workspace', toString: () => 'file:///test/workspace' },
        name: 'test-workspace',
        index: 0,
    },
];

/**
 * Set mock workspace folders (test helper)
 */
export function __setMockWorkspaceFolders(folders: any[]) {
    mockWorkspaceFolders = folders;
}

/**
 * Reset mock workspace folders (for test cleanup)
 */
export function __resetMockWorkspaceFolders() {
    mockWorkspaceFolders = [
        {
            uri: { fsPath: '/test/workspace', toString: () => 'file:///test/workspace' },
            name: 'test-workspace',
            index: 0,
        },
    ];
}

// ========== Full Mock Reset ==========
/**
 * Reset all mock state (call in test afterEach)
 */
export function __resetAllMocks() {
    __resetMockConfiguration();
    __resetMockGitState();
    __resetMockColorTheme();
    __resetMockWorkspaceFolders();
}

// ========== Exported VS Code APIs ==========

export enum ColorThemeKind {
    Light = 1,
    Dark = 2,
    HighContrast = 3,
}

export const window = {
    get activeColorTheme() {
        return { kind: mockColorThemeKind };
    },
    createOutputChannel: (name: string) => ({
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
    }),
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    createStatusBarItem: () => ({
        text: '',
        tooltip: '',
        show: () => {},
        hide: () => {},
        dispose: () => {},
    }),
    state: {
        focused: true,
    },
};

export const workspace = {
    getConfiguration: (section?: string) => new MockConfiguration(section || ''),
    get workspaceFolders() {
        return mockWorkspaceFolders;
    },
    onDidChangeConfiguration: configChangeEmitter.event,
};

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
};

export const commands = {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
};

export const extensions = {
    getExtension: (extensionId: string) => {
        if (extensionId === 'vscode.git') {
            return mockGitExtension;
        }
        return undefined;
    },
};

export const Uri = {
    file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
    parse: (uri: string) => ({ fsPath: uri, toString: () => uri }),
};

export const languages = {};

// Export types that extension code might use
export interface ExtensionContext {
    subscriptions: any[];
    workspaceState: any;
    globalState: any;
    extensionPath: string;
    storagePath?: string;
    globalStoragePath: string;
    logPath: string;
}

export interface OutputChannel {
    appendLine(value: string): void;
    append(value: string): void;
    clear(): void;
    show(): void;
    hide(): void;
    dispose(): void;
}

export interface StatusBarItem {
    text: string;
    tooltip?: string;
    show(): void;
    hide(): void;
    dispose(): void;
}
