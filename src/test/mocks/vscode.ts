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

// ========== Output Channel ==========
class MockOutputChannel {
    private _output: string[] = [];

    appendLine(value: string): void {
        this._output.push(value);
    }

    append(value: string): void {
        if (this._output.length === 0) {
            this._output.push(value);
        } else {
            this._output[this._output.length - 1] += value;
        }
    }

    clear(): void {
        this._output = [];
    }

    show(): void {}
    hide(): void {}
    dispose(): void {}

    // Test helper to get output
    getOutput(): string[] {
        return [...this._output];
    }

    // Test helper to get full output as string
    getOutputText(): string {
        return this._output.join('\\n');
    }
}

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
    __resetMockOutputChannels();
}

// ========== Exported VS Code APIs ==========

export enum ColorThemeKind {
    Light = 1,
    Dark = 2,
    HighContrast = 3,
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

// Thenable type alias for compatibility
export type Thenable<T> = Promise<T>;

// Store output channels for test access
const outputChannels: Map<string, MockOutputChannel> = new Map();

/**
 * Get a mock output channel for testing (test helper)
 */
export function __getMockOutputChannel(name: string): MockOutputChannel | undefined {
    return outputChannels.get(name);
}

/**
 * Reset output channels (for test cleanup)
 */
export function __resetMockOutputChannels() {
    outputChannels.clear();
}

export const window = {
    get activeColorTheme() {
        return { kind: mockColorThemeKind };
    },
    createOutputChannel: (name: string): MockOutputChannel => {
        const channel = new MockOutputChannel();
        outputChannels.set(name, channel);
        return channel;
    },
    showInformationMessage: (...args: any[]): any => Promise.resolve(undefined),
    showErrorMessage: (...args: any[]): any => Promise.resolve(undefined),
    showWarningMessage: (...args: any[]): any => Promise.resolve(undefined),
    showQuickPick: (...args: any[]): any => Promise.resolve(undefined),
    showSaveDialog: (...args: any[]): any => Promise.resolve(undefined),
    showOpenDialog: (...args: any[]): any => Promise.resolve(undefined),
    showInputBox: (...args: any[]): any => Promise.resolve(undefined),
    createWebviewPanel: (...args: any[]): any => ({
        webview: {
            html: '',
            cspSource: "'self'",
            asWebviewUri: (uri: any) => uri,
            postMessage: () => Promise.resolve(true),
            onDidReceiveMessage: (callback: any) => {
                // Store and can call later
                return { dispose: () => {} };
            },
        },
        reveal: (...args: any[]) => {},
        dispose: () => {},
        onDidDispose: (callback: any) => {
            // Store and can call later
            return { dispose: () => {} };
        },
        visible: true,
    }),
    createStatusBarItem: (...args: any[]) => ({
        text: '',
        tooltip: '',
        command: '',
        alignment: undefined,
        priority: undefined,
        show: () => {},
        hide: () => {},
        dispose: () => {},
    }),
    get activeTextEditor(): any {
        return undefined; // Can be mocked if needed
    },
    state: {
        focused: true,
        active: true,
    },
};

export const workspace = {
    getConfiguration: (section?: string) => new MockConfiguration(section || ''),
    get workspaceFolders() {
        return mockWorkspaceFolders;
    },
    getWorkspaceFolder: (uri: any) => mockWorkspaceFolders[0],
    onDidChangeConfiguration: configChangeEmitter.event,
    fs: {
        readFile: (uri: any) => Promise.resolve(new Uint8Array()),
        writeFile: (uri: any, content: any) => Promise.resolve(),
    },
};

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
};

export const commands = {
    registerCommand: (...args: any[]) => ({ dispose: () => {} }),
    executeCommand: (...args: any[]): any => Promise.resolve(true),
};

export const extensions = {
    getExtension: (extensionId: string): any => {
        if (extensionId === 'vscode.git') {
            return mockGitExtension;
        }
        if (extensionId === 'kmills.git-repo-window-colors') {
            return {
                isActive: true,
                packageJSON: {
                    contributes: {
                        configuration: [],
                    },
                },
                exports: {},
            };
        }
        return undefined;
    },
};

export const Uri = {
    file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
    parse: (uri: string) => ({ fsPath: uri, toString: () => uri }),
    joinPath: (...args: any[]) => ({ fsPath: '/mock/path', toString: () => '/mock/path' }),
};

export type Uri = ReturnType<typeof Uri.file>;

export const languages = {};

// Export types that extension code might use
export interface ExtensionContext {
    subscriptions: any[];
    workspaceState: {
        get<T>(key: string): T | undefined;
        get<T>(key: string, defaultValue: T): T;
        update(key: string, value: any): Promise<void>;
    };
    globalState: {
        get<T>(key: string): T | undefined;
        get<T>(key: string, defaultValue: T): T;
        update(key: string, value: any): Promise<void>;
    };
    extensionPath: string;
    extensionUri: any;
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
    command?: string;
    alignment?: StatusBarAlignment;
    priority?: number;
    show(): void;
    hide(): void;
    dispose(): void;
}

export interface Disposable {
    dispose(): void;
}

export interface Webview {
    html: string;
    cspSource: string;
    asWebviewUri(uri: any): any;
    postMessage(message: any): Promise<boolean>;
    onDidReceiveMessage: any;
}

export interface WebviewPanel {
    webview: Webview;
    reveal(...args: any[]): void;
    dispose(): void;
    onDidDispose: any;
    visible: boolean;
}

export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3,
}
