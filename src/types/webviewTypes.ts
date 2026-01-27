import { AdvancedProfileMap } from './advancedModeTypes';

export interface RepoRule {
    repoQualifier: string;
    defaultBranch?: string;
    primaryColor: string;
    branchColor?: string;
}

export interface BranchRule {
    pattern: string;
    color: string;
}

export interface OtherSettings {
    removeManagedColors: boolean;
    invertBranchColorLogic: boolean;
    colorInactiveTitlebar: boolean;
    colorEditorTabs: boolean;
    colorStatusBar: boolean;
    applyBranchColorToTabsAndStatusBar: boolean;
    activityBarColorKnob: number;
    automaticBranchIndicatorColorKnob: number;
    showBranchColumns: boolean;
    showStatusIconWhenNoRuleMatches: boolean;
    askToColorizeRepoWhenOpened: boolean;
    enableProfilesAdvanced: boolean;
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
        | 'requestProfileHelp'
        | 'requestRulesHelp'
        | 'requestReportHelp';
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
    };
}
