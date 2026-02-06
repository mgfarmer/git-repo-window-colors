import { AdvancedProfileMap } from './advancedModeTypes';

export interface BranchTable {
    fixed: boolean;
    rules: BranchRule[];
}

export interface SharedBranchTables {
    [tableName: string]: BranchTable;
}

export interface RepoRule {
    repoQualifier: string;
    primaryColor: string;
    profileName?: string;
    enabled?: boolean;
    branchTableName?: string;
    // Legacy properties - kept for backward compatibility during migration
    branchRules?: BranchRule[];
}

export interface BranchRule {
    pattern: string;
    color: string;
    profileName?: string;
    enabled?: boolean;
}

export interface OtherSettings {
    removeManagedColors: boolean;
    colorInactiveTitlebar: boolean;
    colorEditorTabs: boolean;
    colorStatusBar: boolean;
    applyBranchColorToTabsAndStatusBar: boolean;
    activityBarColorKnob: number;
    showStatusIconWhenNoRuleMatches: boolean;
    askToColorizeRepoWhenOpened: boolean;
    previewSelectedRepoRule: boolean;
}

export interface WebviewMessage {
    command:
        | 'updateConfig'
        | 'requestConfig'
        | 'openColorPicker'
        | 'addRepoRule'
        | 'confirmDelete'
        | 'exportConfig'
        | 'importConfig'
        | 'updateAdvancedProfiles'
        | 'requestHelp'
        | 'previewRepoRule'
        | 'previewBranchRule'
        | 'clearPreview'
        | 'clearBranchPreview'
        | 'generatePalette'
        | 'requestPalettePreviews'
        | 'toggleStarredKey'
        | 'createBranchTable'
        | 'deleteBranchTable'
        | 'renameBranchTable'
        | 'simplifyPath'
        | 'simplifyPathForPreview';
    data: {
        repoRules?: RepoRule[];
        branchRules?: BranchRule[];
        sharedBranchTables?: SharedBranchTables;
        otherSettings?: OtherSettings;
        advancedProfiles?: AdvancedProfileMap;
        workspaceInfo?: {
            repositoryUrl: string;
            currentBranch: string;
        };
        colorPickerData?: {
            ruleType: 'repo' | 'branch';
            ruleIndex: number;
            colorType: 'primary' | 'branch';
        };
        repoQualifier?: string;
        primaryColor?: string;
        deleteData?: {
            ruleType: 'repo' | 'branch';
            index: number;
            ruleDescription: string;
        };
        helpType?: string;
        content?: string;
        paletteData?: {
            profileName: string;
            primaryBg: string;
            algorithm: string;
        };
        // Palette preview request
        primaryBg?: string;
        mappingKey?: string;
        // Branch table management data
        tableName?: string;
        repoRuleIndex?: number;
        newTableName?: string;
        oldTableName?: string;
        // Preview mode properties
        index?: number;
        previewEnabled?: boolean;
        clearBranchPreview?: boolean;
        // Local folder path simplification
        path?: string;
    };
}
