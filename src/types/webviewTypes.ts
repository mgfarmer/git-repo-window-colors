import { AdvancedProfileMap } from './advancedModeTypes';

export interface RepoRule {
    repoQualifier: string;
    primaryColor: string;
    profileName?: string;
    enabled?: boolean;
    branchRules?: BranchRule[];
    useGlobalBranchRules?: boolean;
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
    enableProfilesAdvanced: boolean;
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
        | 'generatePalette'
        | 'toggleStarredKey';
    data: {
        repoRules?: RepoRule[];
        branchRules?: BranchRule[];
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
        mappingKey?: string;
    };
}
