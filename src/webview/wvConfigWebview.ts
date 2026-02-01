// This script runs within the webview context
// It cannot access the main VS Code APIs directly.

// Import shared types
import {
    PaletteSlotSource,
    PaletteSlotDefinition,
    Palette,
    MappingValue,
    SectionMappings,
    AdvancedProfile,
    AdvancedProfileMap,
} from '../types/advancedModeTypes';

// Global variables
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // This will be injected by the extension

const vscode = acquireVsCodeApi();
let currentConfig: any = null;
let starredKeys: string[] = [];
let validationTimeout: any = null;
let regexValidationTimeout: any = null;
let validationErrors: { repoRules: { [index: number]: string }; branchRules: { [index: number]: string } } = {
    repoRules: {},
    branchRules: {},
};
let selectedMappingTab: string | null = null; // Track which mapping tab is active
let selectedRepoRuleIndex: number = -1; // Track which repo rule is selected for branch rules display
let selectedBranchRuleIndex: number = -1; // Track which branch rule is selected for preview
let previewMode: boolean = false; // Track if preview mode is enabled

// Load checkbox states from localStorage with defaults
let syncFgBgEnabled = localStorage.getItem('syncFgBgEnabled') !== 'false'; // Default to true
let syncActiveInactiveEnabled = localStorage.getItem('syncActiveInactiveEnabled') !== 'false'; // Default to true
let limitOptionsEnabled = localStorage.getItem('limitOptionsEnabled') !== 'false'; // Default to true

// Tab Switching
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const tabId = target.getAttribute('aria-controls');
            if (!tabId) return;

            document.querySelectorAll('.tab-button').forEach((b) => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-content').forEach((c) => {
                c.classList.remove('active');
            });

            target.classList.add('active');
            target.setAttribute('aria-selected', 'true');
            const content = document.getElementById(tabId);
            if (content) content.classList.add('active');
        });
    });
}
initTabs();

// HTML Color Names for auto-complete
const HTML_COLOR_NAMES = [
    'aliceblue',
    'antiquewhite',
    'aqua',
    'aquamarine',
    'azure',
    'beige',
    'bisque',
    'black',
    'blanchedalmond',
    'blue',
    'blueviolet',
    'brown',
    'burlywood',
    'cadetblue',
    'chartreuse',
    'chocolate',
    'coral',
    'cornflowerblue',
    'cornsilk',
    'crimson',
    'cyan',
    'darkblue',
    'darkcyan',
    'darkgoldenrod',
    'darkgray',
    'darkgreen',
    'darkkhaki',
    'darkmagenta',
    'darkolivegreen',
    'darkorange',
    'darkorchid',
    'darkred',
    'darksalmon',
    'darkseagreen',
    'darkslateblue',
    'darkslategray',
    'darkturquoise',
    'darkviolet',
    'deeppink',
    'deepskyblue',
    'dimgray',
    'dodgerblue',
    'firebrick',
    'floralwhite',
    'forestgreen',
    'fuchsia',
    'gainsboro',
    'ghostwhite',
    'gold',
    'goldenrod',
    'gray',
    'green',
    'greenyellow',
    'honeydew',
    'hotpink',
    'indianred',
    'indigo',
    'ivory',
    'khaki',
    'lavender',
    'lavenderblush',
    'lawngreen',
    'lemonchiffon',
    'lightblue',
    'lightcoral',
    'lightcyan',
    'lightgoldenrodyellow',
    'lightgray',
    'lightgreen',
    'lightpink',
    'lightsalmon',
    'lightseagreen',
    'lightskyblue',
    'lightslategray',
    'lightsteelblue',
    'lightyellow',
    'lime',
    'limegreen',
    'linen',
    'magenta',
    'maroon',
    'mediumaquamarine',
    'mediumblue',
    'mediumorchid',
    'mediumpurple',
    'mediumseagreen',
    'mediumslateblue',
    'mediumspringgreen',
    'mediumturquoise',
    'mediumvioletred',
    'midnightblue',
    'mintcream',
    'mistyrose',
    'moccasin',
    'navajowhite',
    'navy',
    'oldlace',
    'olive',
    'olivedrab',
    'orange',
    'orangered',
    'orchid',
    'palegoldenrod',
    'palegreen',
    'paleturquoise',
    'palevioletred',
    'papayawhip',
    'peachpuff',
    'peru',
    'pink',
    'plum',
    'powderblue',
    'purple',
    'red',
    'rosybrown',
    'royalblue',
    'saddlebrown',
    'salmon',
    'sandybrown',
    'seagreen',
    'seashell',
    'sienna',
    'silver',
    'skyblue',
    'slateblue',
    'slategray',
    'snow',
    'springgreen',
    'steelblue',
    'tan',
    'teal',
    'thistle',
    'tomato',
    'turquoise',
    'violet',
    'wheat',
    'white',
    'whitesmoke',
    'yellow',
    'yellowgreen',
];

// Example branch patterns for auto-complete
const EXAMPLE_BRANCH_PATTERNS = [
    '^(?!.*(main|master)).*',
    '^(bug/|bug-).*',
    '^(feature/|feature-).*',
    'feature/.*',
    'bugfix/.*',
    'main',
    'master',
    'develop',
    'dev',
    'release.*',
    'hotfix.*',
    'fix/.*',
    'docs/.*',
    'test/.*',
    'refactor/.*',
    'style/.*',
    'perf/.*',
];

// Auto-complete state
let activeAutoCompleteInput: HTMLInputElement | null = null;
let autoCompleteDropdown: HTMLElement | null = null;
let selectedSuggestionIndex: number = -1;
let branchPatternFilterTimeout: any = null;

// Input original value tracking for escape key restoration
const originalInputValues = new Map<HTMLInputElement, string>();

// Request initial configuration
vscode.postMessage({
    command: 'requestConfig',
});

// Accessibility enhancement functions
function initializeAccessibility() {
    // Set up keyboard navigation for help buttons
    document.addEventListener('keydown', function (event) {
        if ((event.target as HTMLElement)?.classList?.contains('help-icon')) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const tooltip = (event.target as Element).querySelector('.tooltiptext') as HTMLElement;
                if (tooltip) {
                    const isVisible = tooltip.style.visibility === 'visible';
                    tooltip.style.visibility = isVisible ? 'hidden' : 'visible';
                    tooltip.style.opacity = isVisible ? '0' : '1';
                    tooltip.setAttribute('aria-hidden', isVisible ? 'true' : 'false');

                    // Announce tooltip content to screen readers
                    if (!isVisible) {
                        const announcement = document.createElement('div');
                        announcement.className = 'sr-only';
                        announcement.setAttribute('aria-live', 'polite');
                        announcement.textContent = tooltip.textContent || '';
                        document.body.appendChild(announcement);
                        setTimeout(() => document.body.removeChild(announcement), 1000);
                    }
                }
            }
        }

        // Keyboard shortcuts
        if (event.ctrlKey && event.altKey) {
            switch (event.key.toLowerCase()) {
                case 'r':
                    event.preventDefault();
                    addRepoRule();
                    break;
                case 'b':
                    event.preventDefault();
                    addBranchRule();
                    break;
                case 't':
                    event.preventDefault();
                    const testButton = document.querySelector(
                        'button[onclick*="runConfigurationTests"]',
                    ) as HTMLButtonElement;
                    if (testButton) testButton.click();
                    break;
                case 's':
                    event.preventDefault();
                    sendConfiguration();
                    break;
            }
        }

        // Escape to close tooltips
        if (event.key === 'Escape') {
            document.querySelectorAll('.tooltiptext').forEach((tooltip) => {
                (tooltip as HTMLElement).style.visibility = 'hidden';
                (tooltip as HTMLElement).style.opacity = '0';
                tooltip.setAttribute('aria-hidden', 'true');
            });
        }
    });

    // Set up focus management for drag handles
    document.addEventListener('keydown', function (event) {
        if (
            (event.target as HTMLElement)?.classList?.contains('drag-handle') &&
            (event.key === 'Enter' || event.key === ' ')
        ) {
            event.preventDefault();
            // Focus on the first reorder button in the same row
            const reorderBtn = (event.target as Element).parentElement?.querySelector('.reorder-btn') as HTMLElement;
            if (reorderBtn) reorderBtn.focus();
        }
    });

    // Enhanced form validation announcements
    const originalValidateRules = (window as any).validateRules;
    (window as any).validateRules = function () {
        const isValid = originalValidateRules();

        // Announce validation results to screen readers
        const announcement = document.createElement('div');
        announcement.className = 'sr-only';
        announcement.setAttribute('aria-live', 'assertive');
        announcement.textContent = isValid
            ? 'Configuration is valid'
            : 'Configuration has validation errors. Please check highlighted fields.';
        document.body.appendChild(announcement);
        setTimeout(() => document.body.removeChild(announcement), 2000);

        return isValid;
    };
}

// Initialize accessibility when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAccessibility);
} else {
    initializeAccessibility();
}

// Helper functions for smart defaults
function extractRepoNameFromUrl(repositoryUrl: string): string {
    if (!repositoryUrl) return '';

    // Handle various Git repository URL formats
    // https://github.com/owner/repo.git -> owner/repo
    // git@github.com:owner/repo.git -> owner/repo
    // https://github.com/owner/repo -> owner/repo

    // Use string-based approach to avoid regex escaping issues in webview
    try {
        // Try GitHub pattern first
        let match = repositoryUrl.match(new RegExp('github\\\\.com[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
        if (match && match[1]) return match[1];

        // Try GitLab pattern
        match = repositoryUrl.match(new RegExp('gitlab\\\\.com[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
        if (match && match[1]) return match[1];

        // Try Bitbucket pattern
        match = repositoryUrl.match(new RegExp('bitbucket\\\\.org[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
        if (match && match[1]) return match[1];

        // Generic pattern as fallback
        match = repositoryUrl.match(new RegExp('[/:]([^/]+/[^/]+?)(?:\\\\.git)?(?:/|$)'));
        if (match && match[1]) return match[1];
    } catch (e) {
        console.warn('Error parsing repository URL:', e);
    }

    return '';
}

function isThemeDark(): boolean {
    const body = document.getElementsByTagName('body')[0] as HTMLElement;
    if (body.classList.contains('vscode-dark')) {
        return true;
    }

    // Check VS Code theme by looking at computed styles
    const backgroundColor = getComputedStyle(body).backgroundColor;

    // Parse RGB values
    const rgb = backgroundColor.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
        const r = parseInt(rgb[0]);
        const g = parseInt(rgb[1]);
        const b = parseInt(rgb[2]);

        // Calculate brightness using standard formula
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128; // Dark if brightness is low
    }

    return true; // Default to dark mode assumption
}

// Count how many profiles are in use and check if any are used
function getProfileUsageInfo(): {
    inUse: boolean;
    count: number;
    profileNames: Set<string>;
    repoRuleCount: number;
    branchRuleCount: number;
} {
    const result = {
        inUse: false,
        count: 0,
        profileNames: new Set<string>(),
        repoRuleCount: 0,
        branchRuleCount: 0,
    };

    if (!currentConfig) return result;

    const advancedProfiles = currentConfig.advancedProfiles || {};
    const allProfileNames = Object.keys(advancedProfiles);

    if (allProfileNames.length === 0) return result;

    // Check repo rules
    if (currentConfig.repoRules) {
        for (const rule of currentConfig.repoRules) {
            let ruleUsesProfile = false;

            // Check explicit profileName field
            if (rule.profileName && advancedProfiles[rule.profileName]) {
                result.profileNames.add(rule.profileName);
                ruleUsesProfile = true;
            }
            // Check if primaryColor is actually a profile name
            if (rule.primaryColor && advancedProfiles[rule.primaryColor]) {
                result.profileNames.add(rule.primaryColor);
                ruleUsesProfile = true;
            }
            // Check if branchColor is actually a profile name
            if (rule.branchColor && advancedProfiles[rule.branchColor]) {
                result.profileNames.add(rule.branchColor);
                ruleUsesProfile = true;
            }
            // Check local branch rules
            if (rule.branchRules) {
                for (const branchRule of rule.branchRules) {
                    if (branchRule.profileName && advancedProfiles[branchRule.profileName]) {
                        result.profileNames.add(branchRule.profileName);
                        ruleUsesProfile = true;
                    }
                    if (branchRule.color && advancedProfiles[branchRule.color]) {
                        result.profileNames.add(branchRule.color);
                        ruleUsesProfile = true;
                    }
                }
            }

            if (ruleUsesProfile) {
                result.repoRuleCount++;
            }
        }
    }

    // Check global branch rules
    if (currentConfig.branchRules) {
        for (const rule of currentConfig.branchRules) {
            let ruleUsesProfile = false;

            if (rule.profileName && advancedProfiles[rule.profileName]) {
                result.profileNames.add(rule.profileName);
                ruleUsesProfile = true;
            }
            if (rule.color && advancedProfiles[rule.color]) {
                result.profileNames.add(rule.color);
                ruleUsesProfile = true;
            }

            if (ruleUsesProfile) {
                result.branchRuleCount++;
            }
        }
    }

    result.count = result.profileNames.size;
    result.inUse = result.count > 0;
    return result;
}

function getThemeAppropriateColor(): string {
    const isDark = isThemeDark();

    const body = document.getElementsByTagName('body')[0] as HTMLElement;
    const titleBarInactiveForeground =
        getComputedStyle(body).getPropertyValue('--vscode-titleBar-inactiveForeground') || '#cccccc';
    const asColor = convertColorToHex(titleBarInactiveForeground);

    // Generate a random color with good visual contrast against asColor
    function generateContrastColor(baseColor: string): string {
        // Convert hex to RGB
        const hex = baseColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Calculate relative luminance using human vision sensitivity
        // Human eyes are most sensitive to green, less to red, least to blue
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Generate random hue (0-360 degrees), avoiding yellow range (30-90 degrees)
        let hue: number;
        do {
            hue = Math.floor(Math.random() * 360);
        } while (hue >= 30 && hue <= 90); // Avoid yellow hues within 30 degrees of 60

        // Use high saturation for vibrant colors
        let saturation;

        // Choose lightness based on base color luminance for maximum contrast
        // For dark themes: make result 20% darker; for light themes: make result 20% brighter
        let lightness: number;
        if (isDark) {
            // Base is dark (dark theme)
            lightness = 0.2 + Math.random() * 0.2; // 36-72% (was 60-90%)
            saturation = 0.8 + Math.random() * 0.2; // 80-100%
        } else {
            // Base is light (light theme)
            lightness = 0.5 + Math.random() * 0.2; // 24-60% (was 20-50%)
            saturation = 0.2 + Math.random() * 0.3; // 40-60%
        }

        // Convert HSL to RGB
        const hslToRgb = (h: number, s: number, l: number) => {
            h /= 360;
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            const hue2rgb = (t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const red = Math.round(hue2rgb(h + 1 / 3) * 255);
            const green = Math.round(hue2rgb(h) * 255);
            const blue = Math.round(hue2rgb(h - 1 / 3) * 255);

            return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
        };

        //console.log('[DEBUG] generateContrastColor HSL:', hue, saturation, lightness);
        return hslToRgb(hue, saturation, lightness);
    }

    const contrastColor = generateContrastColor(asColor);

    return contrastColor;
}

function getSmartBranchDefaults(): string {
    const isDark = isThemeDark();

    const suggestions = [
        `feature/.*:${isDark ? '#2C5F41' : '#50C878'}`, // Green for features
        `bugfix/.*:${isDark ? '#8B2635' : '#E74C3C'}`, // Red for bugfixes
        `main|master:${isDark ? '#1E4A72' : '#4A90E2'}`, // Blue for main branches
        `develop|dev:${isDark ? '#5D4E75' : '#9B59B6'}`, // Purple for develop
        `release.*:${isDark ? '#B8860B' : '#F39C12'}`, // Orange for releases
        `hotfix.*:${isDark ? '#8B4513' : '#E67E22'}`, // Dark orange for hotfixes
    ];

    return suggestions.join('\\n');
}

function collectUniqueBranchPatterns(): string[] {
    const patterns = new Set<string>();

    if (!currentConfig) return [];

    // Collect from global branch rules
    if (currentConfig.branchRules) {
        for (const rule of currentConfig.branchRules) {
            if (rule.pattern && rule.pattern.trim()) {
                patterns.add(rule.pattern.trim());
            }
        }
    }

    // Collect from local branch rules in repo rules
    if (currentConfig.repoRules) {
        for (const repoRule of currentConfig.repoRules) {
            if (repoRule.branchRules) {
                for (const branchRule of repoRule.branchRules) {
                    if (branchRule.pattern && branchRule.pattern.trim()) {
                        patterns.add(branchRule.pattern.trim());
                    }
                }
            }
        }
    }

    return Array.from(patterns).sort();
}

// Message handler for extension communication
window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('[Message Listener] Received message:', message.command);

    switch (message.command) {
        case 'configData':
            handleConfigurationData(message.data);
            break;
        case 'colorPickerResult':
            handleColorPickerResult(message.data);
            break;
        case 'addRepoRule':
            handleAddRepoRule(message.data);
            break;
        case 'deleteConfirmed':
            handleDeleteConfirmed(message.data);
            break;
        case 'openGettingStartedHelp':
            // Auto-open Getting Started help on first webview launch
            openHelp('getting-started');
            break;
        case 'gettingStartedHelpContent':
            handleGettingStartedHelpContent(message.data);
            break;
        case 'helpContent':
            handleHelpContent(message.data);
            break;
        case 'confirmDeleteProfile':
            if (message.data && message.data.profileName) {
                confirmDeleteProfile(message.data.profileName);
            }
            break;
        case 'paletteGenerated':
            handlePaletteGenerated(message.data);
            break;
        case 'starredKeysUpdated':
            if (message.data && message.data.starredKeys) {
                starredKeys = message.data.starredKeys;
                // Re-render profile editor to update star icons
                const selectedProfileName = (document.getElementById('profileNameInput') as HTMLInputElement)?.value;
                if (selectedProfileName && currentConfig?.advancedProfiles?.[selectedProfileName]) {
                    renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
                }
            }
            break;
    }
});

// Track pending configuration changes to avoid race conditions
function handleConfigurationData(data: any) {
    // Always use backend data to ensure rule order and matching indexes are consistent
    // The backend data represents the confirmed, persisted state
    currentConfig = data;

    // Extract starred keys if present
    if (data.starredKeys) {
        starredKeys = data.starredKeys;
    }

    // Store validation errors if present
    if (data.validationErrors) {
        validationErrors = data.validationErrors;
    } else {
        validationErrors = { repoRules: {}, branchRules: {} };
    }

    // Synchronize profileName fields for backward compatibility
    // If primaryColor/branchColor/color matches a profile but profileName is not set, set it
    if (currentConfig?.advancedProfiles && currentConfig?.repoRules) {
        let needsUpdate = false;

        for (const rule of currentConfig.repoRules) {
            // Check primaryColor
            if (rule.primaryColor && !rule.profileName && currentConfig.advancedProfiles[rule.primaryColor]) {
                rule.profileName = rule.primaryColor;
                needsUpdate = true;
            }

            // Check local branch rules
            if (rule.branchRules) {
                for (const branchRule of rule.branchRules) {
                    if (
                        branchRule.color &&
                        !branchRule.profileName &&
                        currentConfig.advancedProfiles[branchRule.color]
                    ) {
                        branchRule.profileName = branchRule.color;
                        needsUpdate = true;
                    }
                }
            }
        }

        // Check global branch rules
        if (currentConfig.branchRules) {
            for (const branchRule of currentConfig.branchRules) {
                if (branchRule.color && !branchRule.profileName && currentConfig.advancedProfiles[branchRule.color]) {
                    branchRule.profileName = branchRule.color;
                    needsUpdate = true;
                }
            }
        }

        // If we made changes, save the updated config
        if (needsUpdate) {
            debounceValidateAndSend();
        }
    }

    renderConfiguration(currentConfig);
}

function handleColorPickerResult(data: any) {
    if (data.colorPickerData && data.selectedColor) {
        const { ruleType, ruleIndex, field } = data.colorPickerData;
        updateColorInUI(ruleType, ruleIndex, field, data.selectedColor);
    }
}

function handleAddRepoRule(data: any) {
    // Add a new repository rule with the provided data
    if (data.repoQualifier) {
        // Call the existing addRepoRule function to add a new rule
        addRepoRule();

        // After the rule is added, populate it with the provided data
        setTimeout(() => {
            const repoRows = document.querySelectorAll('#repoRulesContent .rule-row');
            if (repoRows.length > 0) {
                const lastRow = repoRows[repoRows.length - 1] as HTMLElement;
                const qualifierInput = lastRow.querySelector('[data-field="repoQualifier"]') as HTMLInputElement;
                const colorInput = lastRow.querySelector('[data-field="primaryColor"]') as HTMLInputElement;

                if (qualifierInput) {
                    qualifierInput.value = data.repoQualifier;
                    qualifierInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                if (colorInput && data.primaryColor) {
                    colorInput.value = data.primaryColor;
                    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Focus on the color input so user can start typing
                if (colorInput) {
                    colorInput.focus();
                }
            }
        }, 100);
    }
}

function handleDeleteConfirmed(data: any) {
    // The deletion has already been handled by the backend
    // The configuration will be refreshed via the normal config update flow
    // We don't need to do anything here as the UI will be updated automatically
    if (data.success) {
        console.log('Rule deleted successfully');
    } else {
        console.log('Rule deletion was cancelled');
    }
}

function toggleStarredKey(mappingKey: string): void {
    vscode.postMessage({
        command: 'toggleStarredKey',
        data: { mappingKey },
    });
}

function handleGettingStartedHelpContent(data: { content: string }) {
    console.log('[TOC Navigation] handleGettingStartedHelpContent called, content length:', data.content?.length);
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;
        console.log('[TOC Navigation] Getting started help content loaded');
    }
}

function handleProfileHelpContent(data: { content: string }) {
    console.log('[TOC Navigation] handleProfileHelpContent called, content length:', data.content?.length);
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;
        console.log('[TOC Navigation] Profile help content loaded');
    }
}

function handleHelpContent(data: { helpType: string; content: string }) {
    console.log(
        `[TOC Navigation] handleHelpContent called for ${data.helpType}, content length:`,
        data.content?.length,
    );
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;
        console.log(`[TOC Navigation] ${data.helpType} help content loaded`);
    }
}

function handleSwitchHelp(target: string) {
    console.log('[TOC Navigation] handleSwitchHelp called with target:', target);

    // Set the panel title
    const titleElement = document.getElementById('helpPanelTitle');
    if (titleElement) {
        if (target === 'getting-started') {
            titleElement.textContent = 'Getting Started';
        } else if (target === 'profile') {
            titleElement.textContent = 'Profiles Guide';
        } else if (target === 'rules') {
            titleElement.textContent = 'Rules Guide';
        } else if (target === 'branch-modes') {
            titleElement.textContent = 'Branch Modes Guide';
        } else if (target === 'report') {
            titleElement.textContent = 'Color Report Guide';
        }
        console.log('[TOC Navigation] Updated panel title to:', titleElement.textContent);
    }

    // Request the new content
    if (target === 'getting-started') {
        console.log('[TOC Navigation] Requesting getting started help from extension');
        console.log(`[TOC Navigation] Requesting ${target} help from extension`);
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'profile') {
        console.log(`[TOC Navigation] Requesting ${target} help from extension`);
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'rules') {
        console.log(`[TOC Navigation] Requesting ${target} help from extension`);
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'branch-modes') {
        console.log(`[TOC Navigation] Requesting ${target} help from extension`);
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'report') {
        console.log(`[TOC Navigation] Requesting ${target} help from extension`);
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    }
}

function openHelp(helpType: string) {
    // Set the panel title
    const titleElement = document.getElementById('helpPanelTitle');
    if (titleElement) {
        if (helpType === 'getting-started') {
            titleElement.textContent = 'Getting Started';
        } else if (helpType === 'profile') {
            titleElement.textContent = 'Profiles Guide';
        } else if (helpType === 'rules') {
            titleElement.textContent = 'Rules Guide';
        } else if (helpType === 'branch-modes') {
            titleElement.textContent = 'Branch Modes Guide';
        } else if (helpType === 'report') {
            titleElement.textContent = 'Color Report Guide';
        }
    }

    // Request help content from backend
    console.log(`[Help] Requesting ${helpType} help content from extension`);
    vscode.postMessage({ command: 'requestHelp', data: { helpType } });

    // Show the help panel
    const overlay = document.getElementById('helpPanelOverlay');
    const panel = document.getElementById('helpPanel');
    if (overlay && panel) {
        overlay.classList.add('active');
        panel.classList.add('active');
    }
}

function closeHelp() {
    const overlay = document.getElementById('helpPanelOverlay');
    const panel = document.getElementById('helpPanel');
    if (overlay && panel) {
        overlay.classList.remove('active');
        panel.classList.remove('active');
    }
}

function renderConfiguration(config: any) {
    console.log('[DEBUG] renderConfiguration ', config);
    // Clear validation errors on new data
    clearValidationErrors();

    // Sync preview mode with configuration
    previewMode = config.otherSettings?.previewSelectedRepoRule ?? false;

    renderRepoRules(config.repoRules, config.matchingIndexes?.repoRule);
    renderBranchRulesForSelectedRepo();
    renderOtherSettings(config.otherSettings);
    renderProfiles(config.advancedProfiles);
    renderWorkspaceInfo(config.workspaceInfo);
    renderColorReport(config);

    // Update profiles tab visibility based on settings
    updateProfilesTabVisibility();

    // Attach event listeners after DOM is updated
    attachEventListeners();
}

// Store reference to help panel handler so we can remove it
let handleHelpPanelLinks: ((event: Event) => void) | null = null;

function attachEventListeners() {
    // Remove old event listeners to prevent duplicates
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('change', handleDocumentChange);
    document.removeEventListener('input', handleDocumentInput);
    document.removeEventListener('keydown', handleDocumentKeydown);
    document.removeEventListener('focusin', handleDocumentFocusIn);
    document.removeEventListener('focusout', handleDocumentFocusOut);
    document.removeEventListener('dragstart', handleDocumentDragStart);
    document.removeEventListener('dragover', handleDocumentDragOver);
    document.removeEventListener('drop', handleDocumentDrop);
    if (handleHelpPanelLinks) {
        document.removeEventListener('click', handleHelpPanelLinks);
    }

    // Add new event listeners using event delegation
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('change', handleDocumentChange);
    document.addEventListener('input', handleDocumentInput);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('focusin', handleDocumentFocusIn);
    document.addEventListener('focusout', handleDocumentFocusOut);
    document.addEventListener('dragstart', handleDocumentDragStart);
    document.addEventListener('dragover', handleDocumentDragOver);
    document.addEventListener('drop', handleDocumentDrop);

    // Add event delegation for help panel TOC links
    handleHelpPanelLinks = (event: Event) => {
        const target = event.target as HTMLElement;
        const link = target.closest('[data-switch-help]');
        if (link) {
            event.preventDefault();
            const helpTarget = link.getAttribute('data-switch-help');
            if (helpTarget) {
                handleSwitchHelp(helpTarget);
            }
        }
    };
    document.addEventListener('click', handleHelpPanelLinks);
}

function handleDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target) return;

    // Handle delete buttons
    const deleteBtn = target.closest('.delete-btn') as HTMLElement;
    if (deleteBtn) {
        const repoMatch = deleteBtn.getAttribute('data-action')?.match(/deleteRepoRule\((\d+)\)/);
        const branchMatch = deleteBtn.getAttribute('data-action')?.match(/deleteBranchRule\((\d+)\)/);

        if (repoMatch) {
            const index = parseInt(repoMatch[1]);
            const rule = currentConfig?.repoRules?.[index];
            const ruleDescription = rule ? `"${rule.repoQualifier}" -> ${rule.primaryColor}` : `#${index + 1}`;

            // Send delete confirmation request to backend
            vscode.postMessage({
                command: 'confirmDelete',
                data: {
                    deleteData: {
                        ruleType: 'repo',
                        index: index,
                        ruleDescription: ruleDescription,
                    },
                },
            });
        } else if (branchMatch) {
            const index = parseInt(branchMatch[1]);

            // Check if we're deleting a local branch rule or a global one
            const isLocalRule =
                selectedRepoRuleIndex >= 0 &&
                currentConfig?.repoRules?.[selectedRepoRuleIndex]?.useGlobalBranchRules === false;

            let rule, ruleDescription;
            if (isLocalRule) {
                rule = currentConfig?.repoRules?.[selectedRepoRuleIndex]?.branchRules?.[index];
                ruleDescription = rule ? `"${rule.pattern}" -> ${rule.color}` : `#${index + 1}`;
            } else {
                rule = currentConfig?.branchRules?.[index];
                ruleDescription = rule ? `"${rule.pattern}" -> ${rule.color}` : `#${index + 1}`;
            }

            // Send delete confirmation request to backend
            vscode.postMessage({
                command: 'confirmDelete',
                data: {
                    deleteData: {
                        ruleType: 'branch',
                        index: index,
                        ruleDescription: ruleDescription,
                        repoIndex: isLocalRule ? selectedRepoRuleIndex : undefined,
                    },
                },
            });
        }
        return;
    }

    // Handle move buttons
    if (target.classList.contains('reorder-btn')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/moveRule\((\d+), '(\w+)', (-?\d+)\)/);
        if (match) {
            const [, index, ruleType, direction] = match;
            moveRule(parseInt(index), ruleType, parseInt(direction));
        }
        return;
    }

    // Handle eye button (toggle enabled/disabled)
    const eyeBtn = target.closest('.eye-btn') as HTMLElement;
    if (eyeBtn) {
        const action = eyeBtn.getAttribute('data-action');
        const match = action?.match(/toggleRule\((\d+), '(\w+)'\)/);
        if (match) {
            const [, index, ruleType] = match;
            toggleRule(parseInt(index), ruleType);
        }
        return;
    }

    // Handle repo rule selection radio button
    if (target.classList.contains('repo-select-radio')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/selectRepoRule\((\d+)\)/);
        if (match) {
            const index = parseInt(match[1]);
            selectRepoRule(index);
        }
        return;
    }

    // Handle branch rule selection radio button
    if (target.classList.contains('branch-select-radio')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/selectBranchRule\((\d+)\)/);
        if (match) {
            const index = parseInt(match[1]);
            selectBranchRule(index);
        }
        return;
    }

    // Handle color swatches
    if (target.classList.contains('color-swatch')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/openColorPicker\('(\w+)', (\d+), '(\w+)'\)/);
        if (match) {
            const [, ruleType, index, field] = match;
            openColorPicker(ruleType, parseInt(index), field);
        }
        return;
    }

    // Handle random color buttons
    if (target.classList.contains('random-color-btn')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/generateRandomColor\('(\w+)', (\d+), '(\w+)'\)/);
        if (match) {
            const [, ruleType, index, field] = match;
            generateRandomColor(ruleType, parseInt(index), field);
        }
        return;
    }

    // Handle Add buttons
    if (target.getAttribute('data-action') === 'addRepoRule') {
        addRepoRule();
        return;
    }

    if (target.getAttribute('data-action') === 'addBranchRule') {
        addBranchRule();
        return;
    }

    // Handle contextual help button (opens help based on active tab)
    if (target.closest('[data-action="openContextualHelp"]')) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab?.id === 'rules-tab') {
            openHelp('rules');
        } else if (activeTab?.id === 'profiles-tab') {
            openHelp('profile');
        } else if (activeTab?.id === 'report-tab') {
            openHelp('report');
        }
        return;
    }

    // Handle help panel close buttons
    if (target.closest('[data-action="closeHelp"]')) {
        closeHelp();
        return;
    }

    // Handle Import/Export buttons
    if (target.getAttribute('data-action') === 'exportConfig') {
        vscode.postMessage({ command: 'exportConfig', data: {} });
        return;
    }

    if (target.getAttribute('data-action') === 'importConfig') {
        vscode.postMessage({ command: 'importConfig', data: {} });
        return;
    }

    // Handle move/reorder buttons
    const reorderBtn = target.closest('.reorder-btn') as HTMLElement;
    if (reorderBtn) {
        const action = reorderBtn.getAttribute('data-action');
        const match = action?.match(/moveRule\((\d+), '(\w+)', (-?\d+)\)/);
        if (match) {
            const [, index, ruleType, direction] = match;
            moveRule(parseInt(index), ruleType, parseInt(direction));
        }
        return;
    }

    // Handle goto buttons in Color Report
    if (target.classList.contains('goto-btn') || target.classList.contains('goto-link')) {
        const gotoData = target.getAttribute('data-goto');
        if (gotoData) {
            // Store target in global for handleGotoSource to access
            (window as any)._gotoTarget = target;
            handleGotoSource(gotoData, target.textContent || '');
        }
        return;
    }
}

function handleDocumentChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    const action = target.getAttribute('data-action');
    if (!action) return;

    // Handle repo rule updates
    const repoMatch = action.match(/updateRepoRule\((\d+), '(\w+)', this\.value\)/);
    if (repoMatch) {
        const [, index, field] = repoMatch;
        updateRepoRule(parseInt(index), field, target.value);
        return;
    }

    // Handle branch rule updates
    const branchMatch = action.match(/updateBranchRule\((\d+), '(\w+)', this\.value\)/);
    if (branchMatch) {
        const [, index, field] = branchMatch;
        updateBranchRule(parseInt(index), field, target.value);
        return;
    }

    // Handle branch mode change
    const branchModeMatch = action.match(/changeBranchMode\((\d+), this\.value\)/);
    if (branchModeMatch) {
        const index = parseInt(branchModeMatch[1]);
        changeBranchMode(index, target.value === 'true');
        return;
    }

    // Handle color rule updates
    const colorMatch = action.match(/updateColorRule\('(\w+)', (\d+), '(\w+)', this\.value\)/);
    if (colorMatch) {
        const [, ruleType, index, field] = colorMatch;
        updateColorRule(ruleType, parseInt(index), field, target.value);
        return;
    }

    // Handle other settings
    const settingMatch = action.match(/updateOtherSetting\('(\w+)', (.*)\)/);
    if (settingMatch) {
        const [, setting, valueExpr] = settingMatch;
        let value: any;

        if (target.type === 'checkbox') {
            value = target.checked;
        } else if (valueExpr.includes('parseInt')) {
            value = parseInt(target.value);
        } else {
            value = target.value;
        }

        updateOtherSetting(setting, value);

        // Handle extra actions
        const extraAction = target.getAttribute('data-extra-action');
        if (extraAction === 'handlePreviewModeChange') {
            handlePreviewModeChange();
        }

        return;
    }
}

function handleDocumentInput(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    // Handle color input auto-complete
    if (target.classList.contains('color-input') && target.classList.contains('text-input')) {
        handleColorInputAutoComplete(target);
    }

    // Handle branch pattern auto-complete with debouncing
    if (target.id && target.id.startsWith('branch-pattern-')) {
        // Clear existing timeout for autocomplete
        clearTimeout(branchPatternFilterTimeout);
        branchPatternFilterTimeout = setTimeout(() => {
            filterBranchPatternAutoComplete(target);
        }, 150); // Debounce autocomplete filtering

        // Regex validation on separate timeout
        clearTimeout(regexValidationTimeout);
        regexValidationTimeout = setTimeout(() => {
            validateRegexPattern(target.value, target.id);
        }, 256);
    }

    const action = target.getAttribute('data-input-action');
    if (!action) return;

    const match = action.match(/syncColorInputs\('(\w+)', (\d+), '(\w+)', this\.value\)/);
    if (match) {
        const [, ruleType, index, field] = match;
        syncColorInputs(ruleType, parseInt(index), field, target.value);
    }
}

function handleDocumentKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    // Handle escape key for input restoration (both color inputs and rule inputs)
    if (
        event.key === 'Escape' &&
        (target.classList.contains('rule-input') ||
            (target.classList.contains('color-input') && target.classList.contains('text-input')))
    ) {
        const originalValue = originalInputValues.get(target);
        if (originalValue !== undefined) {
            target.value = originalValue;

            // Trigger change events to update the configuration
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));

            // Clear the stored original value
            originalInputValues.delete(target);

            // Hide autocomplete if it's open
            hideAutoCompleteDropdown();

            // Blur the input to signal that editing is complete
            target.blur();
        }
        return;
    }
}

function handleDocumentFocusIn(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    // Store original value when user starts editing any rule input
    if (
        target.classList.contains('rule-input') ||
        (target.classList.contains('color-input') && target.classList.contains('text-input'))
    ) {
        if (!originalInputValues.has(target)) {
            originalInputValues.set(target, target.value);
        }
    }

    // Show autocomplete dropdown immediately when focusing color input
    if (target.classList.contains('color-input') && target.classList.contains('text-input')) {
        handleColorInputAutoComplete(target);
    }

    // Show autocomplete dropdown immediately when focusing branch pattern input
    if (target.id && target.id.startsWith('branch-pattern-')) {
        filterBranchPatternAutoComplete(target);
    }
}

function handleDocumentFocusOut(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    // Clear stored original value when user finishes editing (commits the change)
    if (
        target.classList.contains('rule-input') ||
        (target.classList.contains('color-input') && target.classList.contains('text-input'))
    ) {
        // Small delay to allow for potential escape key handling
        setTimeout(() => {
            originalInputValues.delete(target);
        }, 50);
    }
}

function handleDocumentDragStart(event: DragEvent) {
    const target = event.target as HTMLElement;
    const dragHandle = target.classList.contains('drag-handle')
        ? target
        : (target.closest('.drag-handle') as HTMLElement);
    if (dragHandle) {
        const index = dragHandle.getAttribute('data-drag-index');
        const ruleType = dragHandle.getAttribute('data-drag-type');
        if (index && ruleType) {
            handleDragStart(event, parseInt(index), ruleType);
        }
    }
}

function handleDocumentDragOver(event: DragEvent) {
    const target = event.target as HTMLElement;
    // Allow drag over any part of a rule row, not just the drag handle
    const ruleRow = target.closest('.rule-row');
    if (ruleRow) {
        handleDragOver(event);
    }
}

function handleDocumentDrop(event: DragEvent) {
    const target = event.target as HTMLElement;
    const ruleRow = target.closest('.rule-row') as HTMLElement;
    if (ruleRow) {
        // Get the drag handle within the row to extract index and type
        const dragHandle = ruleRow.querySelector('.drag-handle') as HTMLElement;
        if (dragHandle) {
            const index = dragHandle.getAttribute('data-drag-index');
            const ruleType = dragHandle.getAttribute('data-drag-type');
            if (index && ruleType) {
                let targetIndex = parseInt(index);

                // Check if we're dropping in the bottom half of the last row
                // If so, treat it as "insert after this row" (i.e., at the very bottom)
                const rules = ruleType === 'repo' ? currentConfig?.repoRules : currentConfig?.branchRules;
                if (rules && targetIndex === rules.length - 1) {
                    const rect = ruleRow.getBoundingClientRect();
                    const mouseY = event.clientY;
                    const rowMiddle = rect.top + rect.height / 2;

                    // If dropping in the bottom half of the last row, insert after it
                    if (mouseY > rowMiddle) {
                        targetIndex = rules.length; // Insert at the very end
                    }
                }

                handleDrop(event, targetIndex, ruleType);
            }
        }
    }
}

// Rule rendering functions

function renderRepoRules(rules: any[], matchingIndex?: number) {
    //console.log('[DEBUG] renderRepoRules called with matchingIndex:', rules, matchingIndex);
    const container = document.getElementById('repoRulesContent');
    if (!container) return;

    if (!rules || rules.length === 0) {
        container.innerHTML =
            '<div class="no-rules">No repository rules defined. Click "Add" to create your first rule.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'rules-table';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Repository color rules');

    // Create header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;
    const colorSuffix = profilesEnabled ? ' or Profile' : '';
    headerRow.innerHTML = `
        <th scope="col" class="select-column">Select</th>
        <th scope="col">Actions</th>
        <th scope="col">Repository Qualifier</th>
        <th scope="col">Primary Color${colorSuffix}</th>
        <th scope="col" class="branch-mode-column">Branch Mode</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

        // Add error class if this rule has a validation error
        if (validationErrors.repoRules[index]) {
            row.classList.add('has-error');
            row.title = `Error: ${validationErrors.repoRules[index]}`;
        }

        // Add selected class if this is the selected rule
        if (selectedRepoRuleIndex === index) {
            row.classList.add('selected-rule');
        }

        // Add preview-active class if preview mode is on and this is the selected rule
        if (previewMode && selectedRepoRuleIndex === index) {
            row.classList.add('preview-active');
        }

        // Highlight matched rule
        if (matchingIndex !== undefined && index === matchingIndex) {
            // console.log('[DEBUG] Applying matched-rule class to index:', index, 'rule:', rule.repoQualifier);
            row.classList.add('matched-rule');
        }

        // Add disabled class if rule is disabled
        if (rule.enabled === false) {
            row.classList.add('disabled-rule');
        }

        row.innerHTML = createRepoRuleRowHTML(rule, index, rules.length);
        setupRepoRuleRowEvents(row, index);
    });

    container.innerHTML = '';
    container.appendChild(table);

    // Initialize selection if needed
    if (selectedRepoRuleIndex === -1 && rules.length > 0) {
        // Prefer matched workspace rule, then first enabled rule, then first rule
        if (
            matchingIndex !== undefined &&
            matchingIndex !== null &&
            matchingIndex >= 0 &&
            matchingIndex < rules.length
        ) {
            selectedRepoRuleIndex = matchingIndex;
        } else {
            const firstEnabledIndex = rules.findIndex((r: any) => r.enabled !== false);
            selectedRepoRuleIndex = firstEnabledIndex !== -1 ? firstEnabledIndex : 0;
        }
        renderBranchRulesForSelectedRepo();
    }
}

function createRepoRuleRowHTML(rule: any, index: number, totalCount: number): string {
    const isSelected = selectedRepoRuleIndex === index;
    const useGlobal = rule.useGlobalBranchRules !== false; // Default to true

    return `
        <td class="select-cell">
            <input type="radio" 
                   name="selected-repo-rule" 
                   class="repo-select-radio" 
                   id="repo-select-${index}"
                   ${isSelected ? 'checked' : ''}
                   data-action="selectRepoRule(${index})"
                   aria-label="Select ${escapeHtml(rule.repoQualifier || 'rule ' + (index + 1))} for branch rules configuration">
        </td>
        <td class="reorder-controls">
            ${createReorderControlsHTML(index, 'repo', totalCount, rule)}
        </td>
        <td class="repo-rule-cell">
            <input type="text" 
                   class="rule-input" 
                   id="repo-qualifier-${index}"
                   value="${escapeHtml(rule.repoQualifier || '')}" 
                   placeholder="e.g., myrepo or github.com/user/repo"
                   aria-label="Repository qualifier for rule ${index + 1}"
                   data-action="updateRepoRule(${index}, 'repoQualifier', this.value)">
        </td>
        <td class="color-cell">
            ${createColorInputHTML(rule.primaryColor || '', 'repo', index, 'primaryColor')}
        </td>
        <td class="branch-mode-cell">
            <select class="branch-mode-select" 
                    id="branch-mode-${index}"
                    data-action="changeBranchMode(${index}, this.value)"
                    aria-label="Branch rule mode for ${escapeHtml(rule.repoQualifier || 'rule ' + (index + 1))}">
                <option value="true" ${useGlobal ? 'selected' : ''}>Global</option>
                <option value="false" ${!useGlobal ? 'selected' : ''}>Local</option>
            </select>
        </td>
    `;
}

function renderBranchRules(rules: any[], matchingIndex?: number, isGlobalMode: boolean = true, repoRuleIndex?: number) {
    const container = document.getElementById('branchRulesContent');
    if (!container) return;

    if (!rules || rules.length === 0) {
        const selectedRule = repoRuleIndex !== undefined ? currentConfig?.repoRules?.[repoRuleIndex] : null;
        const emptyMessage = !isGlobalMode
            ? `<div class="no-rules">No local branch rules defined for "${escapeHtml(selectedRule?.repoQualifier || 'this repository')}". Click "Add" to create a rule or use "Copy From..." to import rules.</div>`
            : '<div class="no-rules">No branch rules defined. Click "Add" to create your first rule.</div>';
        container.innerHTML = emptyMessage;
        return;
    }

    const table = document.createElement('table');
    table.className = 'rules-table';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Branch color rules');

    // Create header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;
    const colorSuffix = profilesEnabled ? ' or Profile' : '';
    headerRow.innerHTML = `
        <th scope="col" class="select-column">Select</th>
        <th scope="col">Actions</th>
        <th scope="col">Branch Pattern</th>
        <th scope="col">Color${colorSuffix}</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

        // Add error class if this rule has a validation error (for global branch rules)
        if (isGlobalMode && validationErrors.branchRules[index]) {
            row.classList.add('has-error');
            row.title = `Error: ${validationErrors.branchRules[index]}`;
        }

        // Add selected class if this is the selected rule
        if (selectedBranchRuleIndex === index) {
            row.classList.add('selected-rule');
        }

        // Add preview-active class if preview mode is on and this is the selected rule
        if (previewMode && selectedBranchRuleIndex === index) {
            row.classList.add('preview-active');
        }

        // Highlight matched rule
        if (matchingIndex !== undefined && index === matchingIndex) {
            row.classList.add('matched-rule');
        }

        // Add disabled class if rule is disabled
        if (rule.enabled === false) {
            row.classList.add('disabled-rule');
        }

        row.innerHTML = createBranchRuleRowHTML(rule, index, rules.length);
        setupBranchRuleRowEvents(row, index);
    });

    container.innerHTML = '';
    container.appendChild(table);

    // Initialize selection if needed (only for the first render or when switching repos)
    // Check if we need to initialize selectedBranchRuleIndex
    if (selectedBranchRuleIndex === -1 && rules.length > 0) {
        // Prefer matched branch rule, then first enabled rule, then first rule
        if (
            matchingIndex !== undefined &&
            matchingIndex !== null &&
            matchingIndex >= 0 &&
            matchingIndex < rules.length
        ) {
            selectedBranchRuleIndex = matchingIndex;
        } else {
            const firstEnabledIndex = rules.findIndex((r: any) => r.enabled !== false);
            selectedBranchRuleIndex = firstEnabledIndex !== -1 ? firstEnabledIndex : 0;
        }

        // Trigger re-render to show the selection
        if (currentConfig && selectedRepoRuleIndex >= 0) {
            renderBranchRulesForSelectedRepo();
        }
    }
}

function createBranchRuleRowHTML(rule: any, index: number, totalCount: number): string {
    const isSelected = selectedBranchRuleIndex === index;

    return `
        <td class="select-cell">
            <input type="radio" 
                   name="selected-branch-rule" 
                   class="branch-select-radio" 
                   id="branch-select-${index}"
                   ${isSelected ? 'checked' : ''}
                   data-action="selectBranchRule(${index})"
                   aria-label="Select branch rule ${index + 1} for preview">
        </td>
        <td class="reorder-controls">
            ${createReorderControlsHTML(index, 'branch', totalCount, rule)}
        </td>
        <td>
            <input type="text" 
                   class="rule-input" 
                   id="branch-pattern-${index}"
                   value="${escapeHtml(rule.pattern || '')}" 
                   placeholder="e.g., feature/.*, main|master"
                   aria-label="Branch pattern for rule ${index + 1}"
                   data-action="updateBranchRule(${index}, 'pattern', this.value)">
        </td>
        <td class="color-cell">
            ${createColorInputHTML(rule.color || '', 'branch', index, 'color')}
        </td>
    `;
}

function createColorInputHTML(color: string, ruleType: string, index: number, field: string): string {
    const USE_NATIVE_COLOR_PICKER = true; // This should match the build-time config
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;
    const placeholder = profilesEnabled ? 'e.g., blue, #4A90E2, MyProfile' : 'e.g., blue, #4A90E2';

    if (USE_NATIVE_COLOR_PICKER) {
        const hexColor = convertColorToHex(color);
        return `
            <div class="color-input-container native-picker">
                <input type="color" 
                       class="native-color-input" 
                       id="${ruleType}-${field}-${index}"
                       value="${hexColor}" 
                       data-action="updateColorRule('${ruleType}', ${index}, '${field}', this.value)"
                       aria-label="Color for ${ruleType} rule ${index + 1} ${field}">
                <button class="random-color-btn" 
                        data-action="generateRandomColor('${ruleType}', ${index}, '${field}')"
                        title="Generate random color"
                        aria-label="Generate random color for ${ruleType} rule ${index + 1} ${field}">🎲</button>
                <input type="text" 
                       class="color-input text-input" 
                       value="${color || ''}" 
                       placeholder="${placeholder}"
                       data-action="updateColorRule('${ruleType}', ${index}, '${field}', this.value)"
                       data-input-action="syncColorInputs('${ruleType}', ${index}, '${field}', this.value)"
                       aria-label="Color text for ${ruleType} rule ${index + 1} ${field}">
            </div>
        `;
    } else {
        return `
            <div class="color-input-container">
                <div class="color-swatch" 
                     style="background-color: ${convertColorToValidCSS(color) || '#4A90E2'}"
                     data-action="openColorPicker('${ruleType}', ${index}, '${field}')"
                     title="Click to choose color"></div>
                <button class="random-color-btn" 
                        data-action="generateRandomColor('${ruleType}', ${index}, '${field}')"
                        title="Generate random color"
                        aria-label="Generate random color for ${ruleType} rule ${index + 1} ${field}">🎲</button>
                <input type="text" 
                       class="color-input" 
                       id="${ruleType}-${field}-${index}"
                       value="${color || ''}" 
                       placeholder="${placeholder}"
                       data-action="updateColorRule('${ruleType}', ${index}, '${field}', this.value)"
                       aria-label="Color for ${ruleType} rule ${index + 1} ${field}">
            </div>
        `;
    }
}

function createReorderControlsHTML(index: number, ruleType: string, totalCount: number, rule: any): string {
    const isEnabled = rule.enabled !== false;
    const eyeIcon = isEnabled
        ? '<span class="codicon codicon-eye"></span>'
        : '<span class="codicon codicon-eye-closed"></span>';
    const eyeTitle = isEnabled ? 'Disable this rule' : 'Enable this rule';

    // Disable drag handle when there's only one entry
    const isDragDisabled = totalCount <= 1;

    return `
        <div class="reorder-buttons">
            <div class="drag-handle tooltip right-tooltip${isDragDisabled ? ' disabled' : ''}" 
                 ${isDragDisabled ? '' : 'draggable="true"'} 
                 data-drag-index="${index}"
                 data-drag-type="${ruleType}"
                 title="${isDragDisabled ? 'Cannot reorder single entry' : 'Drag to reorder'}"
                 tabindex="${isDragDisabled ? '-1' : '0'}"
                 role="button"
                 aria-label="Drag handle for rule ${index + 1}"
                 ${isDragDisabled ? 'aria-disabled="true"' : ''}><span class="codicon codicon-gripper"></span>
                <span class="tooltiptext" role="tooltip">
                    ${isDragDisabled ? 'Cannot reorder when only one rule exists' : 'Drag this handle to reorder rules. Rules are processed from top to bottom.'}
                </span>
            </div>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', -1)" 
                    title="Move up"
                    aria-label="Move rule ${index + 1} up"
                    ${index === 0 ? 'disabled' : ''}><span class="codicon codicon-triangle-up"></span></button>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', 1)" 
                    title="Move down"
                    aria-label="Move rule ${index + 1} down"
                    ${index === totalCount - 1 ? 'disabled' : ''}><span class="codicon codicon-triangle-down"></span></button>
            <button class="eye-btn" 
                    data-action="toggleRule(${index}, '${ruleType}')"
                    title="${eyeTitle}"
                    aria-label="Toggle ${ruleType} rule ${index + 1}">${eyeIcon}</button>
            <button class="delete-btn" 
                    data-action="delete${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}Rule(${index})"
                    title="Delete this rule"
                    aria-label="Delete ${ruleType} rule ${index + 1}"><span class="codicon codicon-trash"></span></button>
        </div>
    `;
}

function renderOtherSettings(settings: any) {
    const container = document.getElementById('otherSettingsContent');
    if (!container) return;

    // Check if the selected repo rule is using a non-virtual profile
    const selectedRule = currentConfig?.repoRules?.[selectedRepoRuleIndex];
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;

    // Only disable controls if using an actual user-defined profile (not a virtual one)
    // Virtual profiles are temporary profiles created for simple color rules
    let isProfileRule = false;
    if (profilesEnabled && selectedRule?.profileName) {
        const profile = currentConfig?.advancedProfiles?.[selectedRule.profileName];
        isProfileRule = profile && !profile.virtual;
    } else if (profilesEnabled && selectedRule?.primaryColor) {
        const profile = currentConfig?.advancedProfiles?.[selectedRule.primaryColor];
        isProfileRule = profile && !profile.virtual;
    }

    const disabledAttr = isProfileRule ? 'disabled' : '';
    const disabledClass = isProfileRule ? 'disabled' : '';
    const profileNote = isProfileRule ? ' <strong>The currently selected rule is using a profile.</strong>' : '';

    console.log(
        '[renderOtherSettings] selectedRepoRuleIndex:',
        selectedRepoRuleIndex,
        'selectedRule:',
        selectedRule,
        'profilesEnabled:',
        profilesEnabled,
        'isProfileRule:',
        isProfileRule,
        'primaryColor:',
        selectedRule?.primaryColor,
        'profileName:',
        selectedRule?.profileName,
        'advancedProfiles:',
        Object.keys(currentConfig?.advancedProfiles || {}),
    );

    container.innerHTML = `
        <div class="settings-sections">
            <div class="settings-section">
                <h3>Color Options</h3>
                <div class="section-help" style="margin-bottom: 10px;">
                    <strong>Note:</strong> These settings only apply when using simple colors. When using Profiles, these color-related settings are controlled by the profile configuration.${profileNote}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="settings-grid">
                        <div class="setting-item tooltip ${disabledClass}">
                            <label>
                                <input type="checkbox" 
                                       id="color-status-bar"
                                       ${settings.colorStatusBar ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorStatusBar', this.checked)">
                                Color Status Bar
                            </label>
                            <span class="tooltiptext" role="tooltip">
                                Apply repository colors to the status bar at the bottom of the VS Code window. 
                                This give the repository color more prominence.
                            </span>
                        </div>
                        <div class="setting-item tooltip ${disabledClass}">
                            <label>
                                <input type="checkbox" 
                                       id="color-editor-tabs"
                                       ${settings.colorEditorTabs ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorEditorTabs', this.checked)">
                                Color Editor Tabs
                            </label>
                            <span class="tooltiptext" role="tooltip">
                                Apply repository colors to editor tabs. This give the repository color more prominence.
                            </span>
                        </div>
                        <div class="setting-item tooltip ${disabledClass}">
                            <label>
                                <input type="checkbox" 
                                       id="color-inactive-titlebar"
                                       ${settings.colorInactiveTitlebar ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorInactiveTitlebar', this.checked)">
                                Color Inactive Title Bar
                            </label>
                            <span class="tooltiptext" role="tooltip">
                                Apply colors to the title bar even when the VS Code window is not focused. 
                                This maintains visual identification when switching between applications.
                            </span>
                        </div>
                    </div>
                    <div class="settings-grid">
                        <div class="setting-item range-slider tooltip ${disabledClass}">
                            <label for="activity-bar-knob">Color Knob:</label>
                            <div class="range-controls">
                                <input type="range" 
                                       id="activity-bar-knob" 
                                       min="-10" 
                                       max="10" 
                                       value="${settings.activityBarColorKnob || 0}"
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('activityBarColorKnob', parseInt(this.value))"
                                       aria-label="Color adjustment from -10 to +10">
                                <span id="activity-bar-knob-value" class="value-display">${settings.activityBarColorKnob || 0}</span>
                            </div>
                            <span class="tooltiptext" role="tooltip">
                                Adjust the brightness of non-title bar elements (activity bar, editor tabs, and status bar). 
                                Negative values make colors darker, positive values make them lighter. Zero means no adjustment. 
                                Provided for fine-tuning the look and feel.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3>Other Options</h3>
                <div class="settings-grid">
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="preview-selected-repo-rule"
                                   ${settings.previewSelectedRepoRule ? 'checked' : ''}
                                   data-action="updateOtherSetting('previewSelectedRepoRule', this.checked)"
                                   data-extra-action="handlePreviewModeChange">
                            Preview Selected Repository Rule
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            When enabled, selecting any repository rule will preview its colors in the workspace, 
                            regardless of whether the repository URL matches. This is useful for testing how different 
                            rules look before applying them to a specific repository.
                        </span>
                    </div>
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="ask-to-colorize-repo-when-opened"
                                   ${settings.askToColorizeRepoWhenOpened ? 'checked' : ''}
                                   data-action="updateOtherSetting('askToColorizeRepoWhenOpened', this.checked)">
                            Ask to colorize repo when opened
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            When enabled, the extension will ask if you'd like to colorize a repository when opening a workspace folder on a repository that doesn't match any existing rules. When disabled, no prompt will be shown.
                        </span>
                    </div>
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="enable-profiles-advanced"
                                   ${settings.enableProfilesAdvanced ? 'checked' : ''}
                                   ${getProfileUsageInfo().inUse ? 'disabled' : ''}
                                   data-action="updateOtherSetting('enableProfilesAdvanced', this.checked)"
                                   data-extra-action="updateProfilesTabVisibility">
                            Enable Profiles ${(() => {
                                const info = getProfileUsageInfo();
                                if (info.count === 0) return '';
                                const parts = [];
                                if (info.repoRuleCount > 0)
                                    parts.push(`${info.repoRuleCount} repo rule${info.repoRuleCount !== 1 ? 's' : ''}`);
                                if (info.branchRuleCount > 0)
                                    parts.push(
                                        `${info.branchRuleCount} branch rule${info.branchRuleCount !== 1 ? 's' : ''}`,
                                    );
                                return `<i>(${info.count} profile${info.count !== 1 ? 's' : ''} used in ${parts.join(' and ')})</i>`;
                            })()}
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            ${
                                getProfileUsageInfo().inUse
                                    ? 'Profiles are currently in use by one or more rules. Remove all profile references from your repository and branch rules to disable this feature.'
                                    : 'Enable the advanced Profiles feature, which allows you to define reusable color palettes and map them to specific UI elements. When enabled, the Profiles tab will appear in the main navigation.'
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Set up range input value updates
    setupRangeInputUpdates();
}

// Store references to handlers so we can remove them
let activityBarKnobHandler: ((this: HTMLInputElement, ev: Event) => any) | null = null;

function setupRangeInputUpdates() {
    const activityBarKnob = document.getElementById('activity-bar-knob') as HTMLInputElement;

    if (activityBarKnob) {
        // Remove old listener if exists
        if (activityBarKnobHandler) {
            activityBarKnob.removeEventListener('input', activityBarKnobHandler);
        }
        // Create and add new listener
        activityBarKnobHandler = function () {
            const valueSpan = document.getElementById('activity-bar-knob-value');
            if (valueSpan) valueSpan.textContent = this.value;
        };
        activityBarKnob.addEventListener('input', activityBarKnobHandler);
    }
}

function renderWorkspaceInfo(workspaceInfo: any) {
    // This function could be used to display current workspace info
    // For now, it's handled by the extension itself
}

function renderColorReport(config: any) {
    const container = document.getElementById('reportContent');
    if (!container) {
        console.log('[DEBUG] reportContent container not found');
        return;
    }

    console.log('[DEBUG] renderColorReport called with config:', config);
    console.log('[DEBUG] colorCustomizations:', config.colorCustomizations);

    const colorCustomizations = config.colorCustomizations || {};
    const managedColors = [
        'titleBar.activeBackground',
        'titleBar.activeForeground',
        'titleBar.inactiveBackground',
        'titleBar.inactiveForeground',
        'activityBar.background',
        'activityBar.foreground',
        'activityBar.inactiveForeground',
        'activityBar.activeBorder',
        'tab.activeBackground',
        'tab.activeForeground',
        'tab.inactiveBackground',
        'tab.inactiveForeground',
        'tab.activeBorder',
        'statusBar.background',
        'statusBar.foreground',
    ];

    // Use preview indexes (which are always set - they match the matching indexes when not actively previewing)
    const repoRuleIndex = config.previewRepoRuleIndex ?? -1;
    const matchedRepoRule = repoRuleIndex >= 0 ? config.repoRules?.[repoRuleIndex] : null;

    // Determine which branch rule to use from preview context
    let branchRuleIndex = -1;
    let isLocalBranchRule = false;
    let repoIndexForBranchRule = -1;

    if (config.previewBranchRuleContext) {
        branchRuleIndex = config.previewBranchRuleContext.index;
        isLocalBranchRule = !config.previewBranchRuleContext.isGlobal;
        repoIndexForBranchRule = config.previewBranchRuleContext.repoIndex ?? -1;
    }

    let matchedBranchRule = null;
    if (isLocalBranchRule && repoIndexForBranchRule >= 0) {
        // Use local branch rule from the specified repo
        const repoForBranchRule = config.repoRules?.[repoIndexForBranchRule];
        if (repoForBranchRule?.branchRules && branchRuleIndex >= 0) {
            matchedBranchRule = repoForBranchRule.branchRules[branchRuleIndex];
        }
    } else if (branchRuleIndex >= 0) {
        // Use global branch rule
        matchedBranchRule = config.branchRules?.[branchRuleIndex];
    }

    // Helper function to determine source for each theme key
    const getSourceForKey = (key: string): { description: string; gotoData: string } => {
        // Activity bar colors typically come from branch rules when a branch rule is matched
        // Otherwise they come from repo rules
        const isActivityBarKey = key.startsWith('activityBar.');

        if (isActivityBarKey && matchedBranchRule) {
            const pattern = escapeHtml(matchedBranchRule.pattern);
            // Include repo index if this is a local branch rule
            const ruleTypeLabel = isLocalBranchRule ? 'Local Branch Rule' : 'Global Branch Rule';
            const gotoData = isLocalBranchRule
                ? `branch:${branchRuleIndex}:${repoIndexForBranchRule}`
                : `branch:${branchRuleIndex}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `${ruleTypeLabel}: "<span class="goto-link" data-goto="${gotoData}">${escapeHtml(pattern)}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const color = escapeHtml(matchedBranchRule.color);
            return {
                description: `${ruleTypeLabel}: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
                gotoData: gotoData,
            };
        }

        if (matchedRepoRule) {
            const qualifier = escapeHtml(matchedRepoRule.repoQualifier);
            const gotoData = `repo:${repoRuleIndex}`;
            // For repo rules, check if using a profile
            if (matchedRepoRule.profileName) {
                const profileName = matchedRepoRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `Repository Rule: "<span class="goto-link" data-goto="${gotoData}">${qualifier}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }
            const primaryColor = escapeHtml(matchedRepoRule.primaryColor);
            return {
                description: `Repository Rule: "<span class="goto-link" data-goto="${gotoData}">${qualifier}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${primaryColor}</span>)`,
                gotoData: gotoData,
            };
        }

        if (matchedBranchRule) {
            const pattern = escapeHtml(matchedBranchRule.pattern);
            // Include repo index if this is a local branch rule
            const ruleTypeLabel = isLocalBranchRule ? 'Local Branch Rule' : 'Global Branch Rule';
            const gotoData = isLocalBranchRule
                ? `branch:${branchRuleIndex}:${repoIndexForBranchRule}`
                : `branch:${branchRuleIndex}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `${ruleTypeLabel}: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const color = escapeHtml(matchedBranchRule.color);
            return {
                description: `${ruleTypeLabel}: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
                gotoData: gotoData,
            };
        }

        return { description: 'None', gotoData: '' };
    };

    const rows: string[] = [];

    managedColors.forEach((key) => {
        const color = colorCustomizations[key];
        if (color) {
            const sourceInfo = getSourceForKey(key);
            const isActivityBarKey = key.startsWith('activityBar.');

            // Determine goto target
            let gotoTarget = '';
            if (isActivityBarKey && matchedBranchRule) {
                // Check if branch rule uses a profile
                const branchProfileName =
                    matchedBranchRule.profileName ||
                    (matchedBranchRule.color && currentConfig?.advancedProfiles?.[matchedBranchRule.color]
                        ? matchedBranchRule.color
                        : null);
                if (branchProfileName) {
                    gotoTarget = `data-goto="profile" data-profile-name="${escapeHtml(branchProfileName)}" data-theme-key="${escapeHtml(key)}"`;
                } else {
                    // Include repo index if this is a local branch rule
                    const isLocalRule = config.matchingIndexes?.repoIndexForBranchRule >= 0;
                    const gotoData = isLocalRule
                        ? `branch:${config.matchingIndexes.branchRule}:${config.matchingIndexes.repoIndexForBranchRule}`
                        : `branch:${config.matchingIndexes.branchRule}`;
                    gotoTarget = `data-goto="${gotoData}"`;
                }
            } else if (matchedRepoRule) {
                // Check if repo rule uses a profile (can be in profileName or primaryColor field)
                const repoProfileName =
                    matchedRepoRule.profileName ||
                    (matchedRepoRule.primaryColor && currentConfig?.advancedProfiles?.[matchedRepoRule.primaryColor]
                        ? matchedRepoRule.primaryColor
                        : null);
                if (repoProfileName) {
                    gotoTarget = `data-goto="profile" data-profile-name="${escapeHtml(repoProfileName)}" data-theme-key="${escapeHtml(key)}"`;
                } else {
                    gotoTarget = `data-goto="repo:${config.matchingIndexes.repoRule}"`;
                }
            } else if (matchedBranchRule) {
                // Check if branch rule uses a profile
                const branchProfileName =
                    matchedBranchRule.profileName ||
                    (matchedBranchRule.color && currentConfig?.advancedProfiles?.[matchedBranchRule.color]
                        ? matchedBranchRule.color
                        : null);
                if (branchProfileName) {
                    gotoTarget = `data-goto="profile" data-profile-name="${escapeHtml(branchProfileName)}" data-theme-key="${escapeHtml(key)}"`;
                } else {
                    // Include repo index if this is a local branch rule
                    const isLocalRule = config.matchingIndexes?.repoIndexForBranchRule >= 0;
                    const gotoData = isLocalRule
                        ? `branch:${config.matchingIndexes.branchRule}:${config.matchingIndexes.repoIndexForBranchRule}`
                        : `branch:${config.matchingIndexes.branchRule}`;
                    gotoTarget = `data-goto="${gotoData}"`;
                }
            }

            rows.push(`
                <tr>
                    <td class="theme-key"><code><span class="goto-link" ${gotoTarget}>${escapeHtml(key)}</span></code></td>
                    <td class="color-value">
                        <div class="color-display">
                            <span class="report-swatch" style="background-color: ${escapeHtml(color)};"></span>
                            <span class="color-text">${escapeHtml(color)}</span>
                        </div>
                    </td>
                    <td class="source-rule">${sourceInfo.description}</td>
                </tr>
            `);
        }
    });

    console.log('[DEBUG] Generated rows:', rows.length);

    if (rows.length === 0) {
        container.innerHTML =
            '<div class="no-rules">No colors are currently applied. Create and apply a repository or branch rule to see the color report.</div>';
        return;
    }

    // Add preview indicator if preview mode checkbox is checked
    let previewIndicator = '';

    if (previewMode) {
        const previewParts: string[] = [];

        // Show the selected repo rule
        if (
            config.previewRepoRuleIndex !== null &&
            config.previewRepoRuleIndex !== undefined &&
            config.repoRules?.[config.previewRepoRuleIndex]
        ) {
            const repoRule = config.repoRules[config.previewRepoRuleIndex];
            previewParts.push(`Repository rule: "<strong>${escapeHtml(repoRule.repoQualifier)}</strong>"`);
        }

        // Show the selected branch rule
        if (config.previewBranchRuleContext) {
            // Determine if it's a global or local branch rule
            const branchContext = config.previewBranchRuleContext;
            const branchRules = branchContext.isGlobal
                ? config.branchRules
                : config.repoRules?.[branchContext.repoIndex || 0]?.branchRules || [];
            const branchRule = branchRules?.[branchContext.index];

            if (branchRule) {
                const ruleSource = branchContext.isGlobal
                    ? 'Global'
                    : `Local (${escapeHtml(config.repoRules?.[branchContext.repoIndex || 0]?.repoQualifier || 'repo')})`;
                previewParts.push(
                    `<strong>${ruleSource}</strong> branch rule: "<strong>${escapeHtml(branchRule.pattern)}</strong>"`,
                );
            }
        }

        // Generate preview indicator if we have any preview parts
        if (previewParts.length > 0) {
            previewIndicator = `<div class="preview-indicator" style="background-color: var(--vscode-editorInfo-background); border-left: 4px solid var(--vscode-editorInfo-foreground); padding: 12px; margin-bottom: 16px; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="codicon codicon-preview" style="font-size: 16px; color: var(--vscode-editorInfo-foreground);"></span>
                    <strong>PREVIEW MODE</strong>
                </div>
                <div style="margin-top: 8px; font-size: 12px;">
                    Showing colors from ${previewParts.join(' and ')}
                </div>
            </div>`;
        }
    }

    const tableHTML = `
        ${previewIndicator}
        <table class="report-table" role="table" aria-label="Applied colors report">
            <thead>
                <tr>
                    <th scope="col">Theme Key</th>
                    <th scope="col">Applied Color</th>
                    <th scope="col">Applied By</th>
                </tr>
            </thead>
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>
        <div class="report-footer">
            <p><strong>Note:</strong> This report shows colors managed by Git Repo Window Colors. Other color customizations from your VS Code settings or theme are not shown.</p>
        </div>
    `;

    console.log('[DEBUG] About to set innerHTML, container:', container);
    console.log('[DEBUG] Table HTML length:', tableHTML.length);
    container.innerHTML = tableHTML;
    console.log('[DEBUG] innerHTML set, container.children.length:', container.children.length);
}

function updateProfilesTabVisibility() {
    const enableProfiles = (document.getElementById('enable-profiles-advanced') as HTMLInputElement)?.checked ?? false;
    const profilesTab = document.getElementById('tab-profiles');
    const profilesTabContent = document.getElementById('profiles-tab');

    if (profilesTab) {
        profilesTab.style.display = enableProfiles ? '' : 'none';
    }
    if (profilesTabContent && !enableProfiles && profilesTabContent.classList.contains('active')) {
        // If profiles tab is currently active and we're hiding it, switch to rules tab
        const rulesTab = document.getElementById('tab-rules');
        if (rulesTab) {
            (rulesTab as HTMLElement).click();
        }
    }
}

function handlePreviewModeChange() {
    const checkbox = document.getElementById('preview-selected-repo-rule') as HTMLInputElement;
    if (!checkbox) return;

    previewMode = checkbox.checked;

    if (previewMode) {
        // If enabling preview and a rule is selected, send preview message
        // Prioritize branch rule if selected, otherwise use repo rule
        if (selectedBranchRuleIndex !== null && selectedBranchRuleIndex !== -1) {
            const selectedRule = currentConfig?.repoRules?.[selectedRepoRuleIndex];
            const useGlobal = selectedRule?.useGlobalBranchRules !== false;

            vscode.postMessage({
                command: 'previewBranchRule',
                data: {
                    index: selectedBranchRuleIndex,
                    isGlobal: useGlobal,
                    repoIndex: useGlobal ? undefined : selectedRepoRuleIndex,
                    previewEnabled: true,
                },
            });
        } else if (selectedRepoRuleIndex !== null && selectedRepoRuleIndex !== -1) {
            vscode.postMessage({
                command: 'previewRepoRule',
                data: {
                    index: selectedRepoRuleIndex,
                    previewEnabled: true,
                },
            });
        }
    } else {
        // If disabling preview, send clear message with preview disabled flag
        vscode.postMessage({
            command: 'clearPreview',
            data: {
                previewEnabled: false,
            },
        });
    }

    // Re-render both repo and branch rules to update visual feedback
    if (currentConfig) {
        renderRepoRules(currentConfig.repoRules);
        renderBranchRulesForSelectedRepo();
    }
}

// Rule management functions
function addRepoRule() {
    if (!currentConfig) return;

    // If current repo is already matched by an existing rule, don't pre-fill it
    const currentRepoName = extractRepoNameFromUrl(currentConfig.workspaceInfo?.repositoryUrl || '');
    const isCurrentRepoAlreadyMatched =
        currentConfig.matchingIndexes?.repoRule !== null &&
        currentConfig.matchingIndexes?.repoRule !== undefined &&
        currentConfig.matchingIndexes?.repoRule >= 0;

    const newRule = {
        repoQualifier: currentRepoName,
        primaryColor: getThemeAppropriateColor(),
    };

    // Always append new rules to the end for predictable behavior
    currentConfig.repoRules.push(newRule);
    sendConfiguration();
}

const humorousDefectNames: string[] = [
    'Unintended-Feature',
    'Heisenbug',
    'Gremlin',
    'A-Case-of-the-Mondays',
    'Schroedinbug',
    'Ghost-in-the-Machine',
    'Caffeination-Anomaly',
    'Syntax-Sasquatch',
    'Wobbly-Bit',
    'Surprise-Functionality',
    'The-Funk',
    'Percussive-Maintenance-Candidate',
    'Spontaneous-Self-Awareness',
    'Reality-Incompatibility',
];

function addBranchRule() {
    if (!currentConfig) return;

    // Get a random humorous defect name for the default pattern
    const randomDefectName = humorousDefectNames[Math.floor(Math.random() * humorousDefectNames.length)];
    const newRule = {
        pattern: randomDefectName,
        color: getThemeAppropriateColor(),
        enabled: true,
    };

    // Determine if we're in global or local mode
    if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        const useGlobal = selectedRule.useGlobalBranchRules !== false;

        if (useGlobal) {
            // Add to global branch rules
            currentConfig.branchRules.push(newRule);
        } else {
            // Add to local branch rules for this repo
            if (!selectedRule.branchRules) {
                selectedRule.branchRules = [];
            }
            selectedRule.branchRules.push(newRule);
        }
    } else {
        // Fallback to global
        currentConfig.branchRules.push(newRule);
    }

    sendConfiguration();
}

function updateRepoRule(index: number, field: string, value: string) {
    if (!currentConfig?.repoRules?.[index]) return;

    currentConfig.repoRules[index][field] = value;
    debounceValidateAndSend();
}

function updateBranchRule(index: number, field: string, value: string) {
    // Determine if we're updating global or local branch rules
    if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        const useGlobal = selectedRule.useGlobalBranchRules !== false;

        if (useGlobal) {
            // Update global branch rules
            if (!currentConfig?.branchRules?.[index]) return;
            currentConfig.branchRules[index][field] = value;
        } else {
            // Update local branch rules
            if (!selectedRule.branchRules?.[index]) return;
            selectedRule.branchRules[index][field] = value;
        }
    } else {
        // Fallback to global
        if (!currentConfig?.branchRules?.[index]) return;
        currentConfig.branchRules[index][field] = value;
    }

    debounceValidateAndSend();
}

function selectRepoRule(index: number) {
    if (!currentConfig?.repoRules?.[index]) return;

    console.log('[selectRepoRule] Selecting repo rule index:', index, 'rule:', currentConfig.repoRules[index]);

    selectedRepoRuleIndex = index;

    // Reset branch rule selection when switching repos so it reinitializes
    selectedBranchRuleIndex = -1;

    // Send preview command only if preview mode is enabled
    if (previewMode) {
        vscode.postMessage({
            command: 'previewRepoRule',
            data: { index, previewEnabled: true },
        });
    }

    // Re-render repo rules to update selected state and preview styling
    renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);

    // Re-render other settings to update disabled state of color options
    renderOtherSettings(currentConfig.otherSettings);

    // Render branch rules for the selected repo
    renderBranchRulesForSelectedRepo();
}

function selectBranchRule(index: number) {
    // Determine if we're selecting from global or local branch rules
    const selectedRule = currentConfig?.repoRules?.[selectedRepoRuleIndex];
    const useGlobal = selectedRule?.useGlobalBranchRules !== false;
    const branchRules = useGlobal ? currentConfig?.branchRules : selectedRule?.branchRules || [];

    if (!branchRules?.[index]) return;

    selectedBranchRuleIndex = index;

    // Send preview command only if preview mode is enabled
    if (previewMode) {
        vscode.postMessage({
            command: 'previewBranchRule',
            data: {
                index,
                isGlobal: useGlobal,
                repoIndex: useGlobal ? undefined : selectedRepoRuleIndex,
            },
        });
    }

    // Re-render branch rules to update selected state and preview styling
    renderBranchRulesForSelectedRepo();
}

function changeBranchMode(index: number, useGlobal: boolean) {
    if (!currentConfig?.repoRules?.[index]) return;

    currentConfig.repoRules[index].useGlobalBranchRules = useGlobal;

    // Initialize local branch rules array if switching to local mode
    if (!useGlobal && !currentConfig.repoRules[index].branchRules) {
        currentConfig.repoRules[index].branchRules = [];
    }

    // Reset branch rule selection when changing modes so it reinitializes
    if (selectedRepoRuleIndex === index) {
        selectedBranchRuleIndex = -1;
    }

    // Re-render repo rules to update the dropdown display
    renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);

    // If this is the selected rule, re-render branch rules
    if (selectedRepoRuleIndex === index) {
        renderBranchRulesForSelectedRepo();
    }

    sendConfiguration();
}

function renderBranchRulesForSelectedRepo() {
    if (!currentConfig || selectedRepoRuleIndex === -1) return;

    const selectedRule = currentConfig.repoRules?.[selectedRepoRuleIndex];
    if (!selectedRule) return;

    const useGlobal = selectedRule.useGlobalBranchRules !== false;
    const branchRules = useGlobal ? currentConfig.branchRules : selectedRule.branchRules || [];
    const ruleSource = useGlobal ? 'Global' : selectedRule.repoQualifier || 'Local';

    // Update section header
    const header = document.querySelector('#branch-rules-heading');
    if (header) {
        const count = branchRules?.length || 0;
        header.textContent = `Branch Rules - ${ruleSource} (${count})`;
    }

    // Show/hide Copy From button based on mode
    updateCopyFromButton(!useGlobal);

    renderBranchRules(branchRules, currentConfig.matchingIndexes?.branchRule, useGlobal, selectedRepoRuleIndex);
}

function updateCopyFromButton(showButton: boolean) {
    const panelHeader = document.querySelector('.branch-panel .panel-header');
    if (!panelHeader) return;

    // Get or create button container
    let buttonContainer = panelHeader.querySelector('.panel-header-buttons');
    const addBtn = panelHeader.querySelector('.branch-add-button');

    if (!buttonContainer && addBtn) {
        // Wrap the Add button in a container if it doesn't exist
        buttonContainer = document.createElement('div');
        buttonContainer.className = 'panel-header-buttons';
        panelHeader.insertBefore(buttonContainer, addBtn);
        buttonContainer.appendChild(addBtn);
    }

    if (!buttonContainer) return;

    // Remove existing copy button if present
    const existingBtn = buttonContainer.querySelector('.copy-from-button');
    if (existingBtn) existingBtn.remove();

    if (!showButton) return;

    // Create Copy From button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-from-button';
    copyBtn.textContent = '📋 Copy From...';
    copyBtn.title = 'Copy branch rules from global or another repository';
    copyBtn.setAttribute('aria-label', 'Copy branch rules from another source');

    // Insert before the Add button in the container
    if (addBtn) {
        buttonContainer.insertBefore(copyBtn, addBtn);
    }

    // Add click handler to show dropdown
    copyBtn.addEventListener('click', showCopyFromMenu);
}

function showCopyFromMenu(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    // Remove any existing menu
    const existingMenu = document.querySelector('.copy-from-menu');
    if (existingMenu) existingMenu.remove();

    // Build menu options
    const menu = document.createElement('div');
    menu.className = 'copy-from-menu';
    menu.setAttribute('role', 'menu');

    // Add Global option if there are global rules
    if (currentConfig?.branchRules && currentConfig.branchRules.length > 0) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'copy-from-option';
        option.textContent = `Global Rules (${currentConfig.branchRules.length})`;
        option.setAttribute('role', 'menuitem');
        option.setAttribute('data-source-type', 'global');
        menu.appendChild(option);
    }

    // Add options for other repos with local rules
    if (currentConfig?.repoRules) {
        currentConfig.repoRules.forEach((rule, index) => {
            if (index === selectedRepoRuleIndex) return; // Skip current repo
            if (rule.useGlobalBranchRules !== false) return; // Skip repos using global
            if (!rule.branchRules || rule.branchRules.length === 0) return; // Skip empty

            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'copy-from-option';
            option.textContent = `${rule.repoQualifier} (${rule.branchRules.length})`;
            option.setAttribute('role', 'menuitem');
            option.setAttribute('data-source-type', 'repo');
            option.setAttribute('data-source-index', String(index));
            menu.appendChild(option);
        });
    }

    // If no options, show message
    if (menu.children.length === 0) {
        const noOptions = document.createElement('div');
        noOptions.className = 'copy-from-no-options';
        noOptions.textContent = 'No rules available to copy';
        menu.appendChild(noOptions);
    }

    // Position menu below button
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(menu);

    // Add event handlers
    menu.addEventListener('click', handleCopyFromSelection);

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node) && e.target !== button) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function handleCopyFromSelection(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('copy-from-option')) return;

    event.preventDefault();
    event.stopPropagation();

    const sourceType = target.getAttribute('data-source-type');
    const sourceIndex = target.getAttribute('data-source-index');

    if (sourceType === 'global') {
        copyBranchRulesFrom('global', -1);
    } else if (sourceType === 'repo' && sourceIndex !== null) {
        copyBranchRulesFrom('repo', parseInt(sourceIndex, 10));
    }

    // Remove menu
    const menu = document.querySelector('.copy-from-menu');
    if (menu) menu.remove();
}

function copyBranchRulesFrom(sourceType: 'global' | 'repo', sourceIndex: number) {
    if (!currentConfig || selectedRepoRuleIndex === -1) return;

    const selectedRule = currentConfig.repoRules?.[selectedRepoRuleIndex];
    if (!selectedRule) return;

    // Get source rules
    let sourceRules: any[] = [];
    if (sourceType === 'global') {
        sourceRules = currentConfig.branchRules || [];
    } else if (sourceType === 'repo') {
        const sourceRepo = currentConfig.repoRules?.[sourceIndex];
        if (sourceRepo) {
            sourceRules = sourceRepo.branchRules || [];
        }
    }

    if (sourceRules.length === 0) return;

    // Initialize local branchRules if needed
    if (!selectedRule.branchRules) {
        selectedRule.branchRules = [];
    }

    // Deep clone and append rules (not replace!)
    sourceRules.forEach((rule) => {
        const clonedRule = {
            pattern: rule.pattern,
            color: rule.color,
            enabled: rule.enabled !== false, // Default to true
        };
        selectedRule.branchRules!.push(clonedRule);
    });

    // Re-render
    renderBranchRulesForSelectedRepo();
    debounceValidateAndSend();
}

function updateColorRule(ruleType: string, index: number, field: string, value: string) {
    if (!currentConfig) return;

    console.log(
        '[updateColorRule] ruleType:',
        ruleType,
        'index:',
        index,
        'field:',
        field,
        'value:',
        value,
        'selectedRepoRuleIndex:',
        selectedRepoRuleIndex,
    );

    if (ruleType === 'repo') {
        const rules = currentConfig.repoRules;
        if (!rules?.[index]) return;
        rules[index][field] = value;

        // If updating primaryColor or branchColor with a profile name, also set the profileName field
        if (field === 'primaryColor' && value && currentConfig.advancedProfiles?.[value]) {
            rules[index].profileName = value;
        } else if (field === 'primaryColor') {
            // If primaryColor is not a profile, clear profileName
            delete rules[index].profileName;
        }
    } else if (ruleType === 'branch') {
        // Determine if we're updating global or local branch rules
        if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const useGlobal = selectedRule.useGlobalBranchRules !== false;

            if (useGlobal) {
                // Update global branch rules
                if (!currentConfig?.branchRules?.[index]) return;
                currentConfig.branchRules[index][field] = value;

                // If updating color with a profile name, also set the profileName field
                if (field === 'color' && value && currentConfig.advancedProfiles?.[value]) {
                    currentConfig.branchRules[index].profileName = value;
                } else if (field === 'color') {
                    delete currentConfig.branchRules[index].profileName;
                }
            } else {
                // Update local branch rules
                if (!selectedRule.branchRules?.[index]) return;
                selectedRule.branchRules[index][field] = value;

                // If updating color with a profile name, also set the profileName field
                if (field === 'color' && value && currentConfig.advancedProfiles?.[value]) {
                    selectedRule.branchRules[index].profileName = value;
                } else if (field === 'color') {
                    delete selectedRule.branchRules[index].profileName;
                }
            }
        } else {
            // Fallback to global
            if (!currentConfig?.branchRules?.[index]) return;
            currentConfig.branchRules[index][field] = value;

            // If updating color with a profile name, also set the profileName field
            if (field === 'color' && value && currentConfig.advancedProfiles?.[value]) {
                currentConfig.branchRules[index].profileName = value;
            } else if (field === 'color') {
                delete currentConfig.branchRules[index].profileName;
            }
        }
    }

    // Update color swatch if present
    updateColorSwatch(ruleType, index, field, value);

    // If we updated a repo rule's primary color, re-render other settings to update disabled state
    if (ruleType === 'repo' && field === 'primaryColor' && index === selectedRepoRuleIndex) {
        renderOtherSettings(currentConfig.otherSettings);
    }

    debounceValidateAndSend();
}

function updateColorSwatch(ruleType: string, index: number, field: string, value: string) {
    // console.log(
    //     `[DEBUG] updateColorSwatch called with: ruleType="${ruleType}", index=${index}, field="${field}", value="${value}"`,
    // );

    const colorInput = document.getElementById(`${ruleType}-${field}-${index}`) as HTMLInputElement;
    if (colorInput && colorInput.type === 'color') {
        // Convert any color format to hex for the native color input
        const hexColor = convertColorToHex(value);
        colorInput.value = hexColor;
        // console.log(`[DEBUG] Updated native color input to: "${hexColor}"`);
    }

    // Update the swatch background for non-native color picker (only if swatch exists)
    const swatch = colorInput?.parentElement?.querySelector('.color-swatch') as HTMLElement;
    // console.log(`[DEBUG] Found swatch element:`, swatch);

    if (swatch) {
        // For named colors and other formats, try to convert to a valid CSS color
        const displayColor = convertColorToValidCSS(value) || '#4A90E2';
        // console.log(`[DEBUG] Setting swatch backgroundColor to: "${displayColor}"`);
        swatch.style.backgroundColor = displayColor;
    } else {
        // console.log(`[DEBUG] No swatch element found - using native color picker`);
    }
}

function syncColorInputs(ruleType: string, index: number, field: string, value: string) {
    const colorInput = document.getElementById(`${ruleType}-${field}-${index}`) as HTMLInputElement;
    const textInput = colorInput?.parentElement?.querySelector('.text-input') as HTMLInputElement;

    if (colorInput?.type === 'color' && textInput && textInput !== event?.target) {
        // Sync from color picker to text input
        if (event?.target === colorInput) {
            textInput.value = value;
        }
        // Sync from text input to color picker
        else if (event?.target === textInput) {
            updateColorSwatch(ruleType, index, field, value);
        }
    }
}

function generateRandomColor(ruleType: string, index: number, field: string) {
    if (!currentConfig) return;

    // Generate a new random color using the existing theme-appropriate function
    const randomColor = getThemeAppropriateColor();

    // Update the config
    if (ruleType === 'repo') {
        const rules = currentConfig.repoRules;
        if (!rules?.[index]) return;
        rules[index][field] = randomColor;

        // Clear profile fields when generating a random color
        if (field === 'primaryColor') {
            delete rules[index].profileName;
        }
    } else if (ruleType === 'branch') {
        // Determine if we're updating global or local branch rules
        if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const useGlobal = selectedRule.useGlobalBranchRules !== false;

            if (useGlobal) {
                // Update global branch rules
                if (!currentConfig?.branchRules?.[index]) return;
                currentConfig.branchRules[index][field] = randomColor;
                // Clear profileName when generating a random color
                delete currentConfig.branchRules[index].profileName;
            } else {
                // Update local branch rules
                if (!selectedRule.branchRules?.[index]) return;
                selectedRule.branchRules[index][field] = randomColor;
                // Clear profileName when generating a random color
                delete selectedRule.branchRules[index].profileName;
            }
        } else {
            // Fallback to global
            if (!currentConfig?.branchRules?.[index]) return;
            currentConfig.branchRules[index][field] = randomColor;
            // Clear profileName when generating a random color
            delete currentConfig.branchRules[index].profileName;
        }
    }

    // Update the UI elements
    updateColorSwatch(ruleType, index, field, randomColor);

    // Update the text input
    const textInput = document
        .querySelector(`#${ruleType}-${field}-${index}`)
        ?.parentElement?.querySelector('.text-input') as HTMLInputElement;
    if (textInput) {
        textInput.value = randomColor;
    } else {
        // For non-native picker, update the main input
        const input = document.getElementById(`${ruleType}-${field}-${index}`) as HTMLInputElement;
        if (input) {
            input.value = randomColor;
        }
    }

    // Send updated configuration to backend
    debounceValidateAndSend();
}

function moveRule(index: number, ruleType: string, direction: number) {
    // console.log('[DEBUG] moveRule called:', { index, ruleType, direction });
    // console.log('[DEBUG] currentConfig exists:', !!currentConfig);

    if (!currentConfig) return;

    let rules;
    if (ruleType === 'repo') {
        rules = currentConfig.repoRules;
    } else {
        // For branch rules, check if we're in local mode
        if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const useGlobal = selectedRule.useGlobalBranchRules !== false;
            rules = useGlobal ? currentConfig.branchRules : selectedRule.branchRules;
        } else {
            rules = currentConfig.branchRules;
        }
    }

    // console.log('[DEBUG] Rules array exists:', !!rules, 'length:', rules?.length);

    if (!rules) return;

    // console.log(
    //     '[DEBUG] Rules before move:',
    //     rules.map((r) => (ruleType === 'repo' ? r.repoQualifier : r.pattern)),
    // );

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rules.length) {
        // console.log('[DEBUG] Move cancelled - out of bounds:', { newIndex, length: rules.length });
        return;
    }

    // Swap rules
    const temp = rules[index];
    rules[index] = rules[newIndex];
    rules[newIndex] = temp;

    // Update selection if we moved a repo rule
    if (ruleType === 'repo' && selectedRepoRuleIndex === index) {
        selectedRepoRuleIndex = newIndex;
    } else if (ruleType === 'repo' && selectedRepoRuleIndex === newIndex) {
        selectedRepoRuleIndex = index;
    }

    // console.log(
    //     '[DEBUG] Rules after move:',
    //     rules.map((r) => (ruleType === 'repo' ? r.repoQualifier : r.pattern)),
    // );
    // console.log('[DEBUG] About to call sendConfiguration with currentConfig:', !!currentConfig);

    // Send updated configuration - backend will recalculate matching indexes and send back proper update
    // This will trigger a complete table refresh with correct highlighting
    sendConfiguration();
}

function toggleRule(index: number, ruleType: string) {
    if (!currentConfig) return;

    let rules;
    if (ruleType === 'repo') {
        rules = currentConfig.repoRules;
    } else {
        // For branch rules, check if we're in local mode
        if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const useGlobal = selectedRule.useGlobalBranchRules !== false;
            rules = useGlobal ? currentConfig.branchRules : selectedRule.branchRules;
        } else {
            rules = currentConfig.branchRules;
        }
    }

    if (!rules || !rules[index]) return;

    // Toggle the enabled state (default to true if not set)
    rules[index].enabled = rules[index].enabled === false ? true : false;

    // Send updated configuration
    sendConfiguration();
}

function handleGotoSource(gotoData: string, linkText: string = '') {
    // Check if this is a click event with data attributes
    const targetElement = (window as any)._gotoTarget as HTMLElement;

    if (targetElement) {
        const profileName = targetElement.getAttribute('data-profile-name');
        const themeKey = targetElement.getAttribute('data-theme-key');

        if (profileName && gotoData === 'profile') {
            // Navigate to Profiles tab
            const profilesTab = document.getElementById('tab-profiles') as HTMLElement;
            if (profilesTab) {
                profilesTab.click();
            }

            // Select the profile and highlight the mapping
            setTimeout(() => {
                const profileItems = document.querySelectorAll('.profile-item');
                profileItems.forEach((item) => {
                    if ((item as HTMLElement).dataset.profileName === profileName) {
                        (item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                        (item as HTMLElement).click();

                        // Apply highlight to profile after re-render
                        setTimeout(() => {
                            const updatedProfileItems = document.querySelectorAll('.profile-item');
                            updatedProfileItems.forEach((updatedItem) => {
                                if ((updatedItem as HTMLElement).dataset.profileName === profileName) {
                                    (updatedItem as HTMLElement).classList.add('highlight-fadeout');
                                    setTimeout(() => {
                                        (updatedItem as HTMLElement).classList.remove('highlight-fadeout');
                                    }, 2500);
                                }
                            });
                        }, 100);

                        // Highlight the mapping row for the theme key
                        if (themeKey) {
                            // Find which tab contains this theme key
                            let tabName: string | null = null;
                            for (const [sectionName, keys] of Object.entries(SECTION_DEFINITIONS)) {
                                if (keys.includes(themeKey)) {
                                    tabName = sectionName;
                                    break;
                                }
                            }

                            if (tabName) {
                                // Click the correct tab
                                setTimeout(() => {
                                    const tabBtns = document.querySelectorAll('.mapping-tab-btn');
                                    tabBtns.forEach((btn) => {
                                        if ((btn as HTMLElement).textContent?.includes(tabName!)) {
                                            (btn as HTMLElement).click();
                                        }
                                    });

                                    // Now try to find and highlight the mapping row
                                    setTimeout(() => {
                                        const contentId = 'mapping-section-' + tabName!.replace(/\s+/g, '-');
                                        const content = document.getElementById(contentId);

                                        if (content) {
                                            // Look for the grid container first, then its direct children
                                            const gridContainer = content.querySelector('div[style*="grid"]');
                                            if (gridContainer) {
                                                // Only look at direct children of the grid (the actual mapping rows)
                                                const rows = Array.from(gridContainer.children).filter((child) =>
                                                    child.querySelector('label'),
                                                );

                                                rows.forEach((row) => {
                                                    const label = row.querySelector('label');
                                                    if (label) {
                                                        const labelText = label.textContent?.trim();
                                                        if (labelText === themeKey) {
                                                            (row as HTMLElement).scrollIntoView({
                                                                behavior: 'smooth',
                                                                block: 'center',
                                                            });
                                                            (row as HTMLElement).classList.add('highlight-fadeout');
                                                            setTimeout(() => {
                                                                (row as HTMLElement).classList.remove(
                                                                    'highlight-fadeout',
                                                                );
                                                            }, 2500);
                                                        }
                                                    }
                                                });
                                            }
                                        }
                                    }, 200);
                                }, 300);
                            }
                        }
                    }
                });
            }, 200);
            return;
        }
    }

    // First check if the link text is a known profile name
    if (linkText && currentConfig?.advancedProfiles && linkText in currentConfig.advancedProfiles) {
        // Navigate to Profiles tab
        const profilesTab = document.getElementById('tab-profiles') as HTMLElement;
        if (profilesTab) {
            profilesTab.click();
        }

        // Select the profile in the list
        setTimeout(() => {
            const profileItems = document.querySelectorAll('.profile-item');

            profileItems.forEach((item) => {
                const itemProfileName = (item as HTMLElement).dataset.profileName;

                if (itemProfileName === linkText) {
                    (item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (item as HTMLElement).click();

                    // Apply highlight after the re-render from click
                    setTimeout(() => {
                        // Re-query the profile items after re-render
                        const updatedProfileItems = document.querySelectorAll('.profile-item');
                        updatedProfileItems.forEach((updatedItem) => {
                            if ((updatedItem as HTMLElement).dataset.profileName === linkText) {
                                (updatedItem as HTMLElement).classList.add('highlight-fadeout');

                                setTimeout(() => {
                                    (updatedItem as HTMLElement).classList.remove('highlight-fadeout');
                                }, 2500);
                            }
                        });
                    }, 100);
                }
            });
        }, 200);
        return;
    }

    const parts = gotoData.split(':');
    const type = parts[0];

    if (type === 'repo' || type === 'branch') {
        // Navigate to Rules tab
        const rulesTab = document.getElementById('tab-rules') as HTMLElement;
        if (rulesTab) {
            rulesTab.click();
        }

        // Find and highlight the rule
        setTimeout(() => {
            const index = parseInt(parts[1]);

            // If this is a branch rule with a repo index (local branch rule), select the repo first
            if (type === 'branch' && parts.length >= 3) {
                const repoIndex = parseInt(parts[2]);
                console.log(`[Navigation] Local branch rule detected, selecting repo ${repoIndex} first`);

                // Select the repo rule to show its local branch rules
                const repoContainer = document.getElementById('repoRulesContent');
                if (repoContainer) {
                    const repoRows = repoContainer.querySelectorAll('.rule-row');
                    if (repoRows[repoIndex]) {
                        const repoRadio = repoRows[repoIndex].querySelector('input[type="radio"]') as HTMLInputElement;
                        if (repoRadio) {
                            repoRadio.click();
                            console.log(`[Navigation] Selected repo ${repoIndex}`);
                        }
                    }
                }

                // Wait for the branch rules to re-render, then highlight the branch rule
                setTimeout(() => {
                    const branchContainer = document.getElementById('branchRulesContent');
                    if (branchContainer) {
                        const branchRows = branchContainer.querySelectorAll('.rule-row');
                        if (branchRows[index]) {
                            const targetRow = branchRows[index] as HTMLElement;
                            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            targetRow.classList.add('highlight-fadeout');
                            setTimeout(() => {
                                targetRow.classList.remove('highlight-fadeout');
                            }, 2000);
                        }
                    }
                }, 300);
            } else {
                // Regular repo or global branch rule navigation
                const container =
                    type === 'repo'
                        ? document.getElementById('repoRulesContent')
                        : document.getElementById('branchRulesContent');
                if (container) {
                    const rows = container.querySelectorAll('.rule-row');
                    if (rows[index]) {
                        const targetRow = rows[index] as HTMLElement;
                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetRow.classList.add('highlight-fadeout');
                        setTimeout(() => {
                            targetRow.classList.remove('highlight-fadeout');
                        }, 2000);
                    }
                }
            }
        }, 100);
    } else if (type === 'profile') {
        // Navigate to Profiles tab
        const profilesTab = document.getElementById('tab-profiles') as HTMLElement;
        if (profilesTab) {
            profilesTab.click();
        }

        // Highlight the profile and mapping
        setTimeout(() => {
            const profileName = parts[1];
            const themeKey = parts[2]; // May be undefined

            // Select the profile in the list
            const profileItems = document.querySelectorAll('.profile-item');
            profileItems.forEach((item) => {
                if ((item as HTMLElement).dataset.profileName === profileName) {
                    (item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (item as HTMLElement).click();

                    // Apply highlight after re-render
                    setTimeout(() => {
                        const updatedProfileItems = document.querySelectorAll('.profile-item');
                        updatedProfileItems.forEach((updatedItem) => {
                            if ((updatedItem as HTMLElement).dataset.profileName === profileName) {
                                (updatedItem as HTMLElement).classList.add('highlight-fadeout');
                                setTimeout(() => {
                                    (updatedItem as HTMLElement).classList.remove('highlight-fadeout');
                                }, 2500);
                            }
                        });
                    }, 100);
                }
            });

            // Highlight the mapping row for this theme key (if provided)
            if (themeKey) {
                setTimeout(() => {
                    const mappingRows = document.querySelectorAll('.mapping-row');
                    mappingRows.forEach((row) => {
                        const label = row.querySelector('.mapping-label');
                        if (label && label.textContent?.includes(themeKey)) {
                            (row as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                            (row as HTMLElement).classList.add('highlight-fadeout');
                            setTimeout(() => {
                                (row as HTMLElement).classList.remove('highlight-fadeout');
                            }, 2500);
                        }
                    });
                }, 300);
            }
        }, 100);
    }
}

function updateOtherSetting(setting: string, value: any) {
    if (!currentConfig?.otherSettings) return;

    // console.log(`[DEBUG] updateOtherSetting: ${setting} = ${value}`);
    currentConfig.otherSettings[setting] = value;
    // Send immediately for settings changes (no validation needed)
    sendConfiguration();
}

// Drag and drop functionality
let draggedIndex: number = -1;
let draggedType: string = '';

function handleDragStart(event: DragEvent, index: number, ruleType: string) {
    draggedIndex = index;
    draggedType = ruleType;

    if (event.target) {
        (event.target as HTMLElement).closest('.rule-row')?.classList.add('dragging');
    }

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
    }
}

function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }

    // Add visual indicator
    const targetRow = (event.target as Element).closest('.rule-row') as HTMLTableRowElement;
    if (targetRow && !targetRow.classList.contains('dragging')) {
        // Remove drag-over classes from all rows
        document.querySelectorAll('.rule-row').forEach((row) => {
            row.classList.remove('drag-over', 'drag-over-bottom');
        });

        // Determine if we're targeting the bottom position
        const dragHandle = targetRow.querySelector('.drag-handle') as HTMLElement;
        if (dragHandle) {
            const ruleType = dragHandle.getAttribute('data-drag-type');
            const targetIndex = parseInt(dragHandle.getAttribute('data-drag-index') || '0');
            const rules = ruleType === 'repo' ? currentConfig?.repoRules : currentConfig?.branchRules;

            // Check if this is the last row and we're in the bottom half
            if (rules && targetIndex === rules.length - 1) {
                const rect = targetRow.getBoundingClientRect();
                const mouseY = event.clientY;
                const rowMiddle = rect.top + rect.height / 2;

                if (mouseY > rowMiddle) {
                    // Bottom half of last row - show drop indicator below
                    targetRow.classList.add('drag-over-bottom');
                } else {
                    // Top half of last row - show drop indicator above
                    targetRow.classList.add('drag-over');
                }
            } else {
                // Not the last row - always show drop indicator above
                targetRow.classList.add('drag-over');
            }
        }
    }
}

function handleDrop(event: DragEvent, targetIndex: number, targetType: string) {
    event.preventDefault();

    if (draggedIndex === -1 || draggedType !== targetType || draggedIndex === targetIndex) {
        return;
    }

    if (!currentConfig) return;

    const rules = targetType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
    if (!rules) return;

    // Remove the dragged item
    const draggedItem = rules.splice(draggedIndex, 1)[0];

    // Calculate the correct insert position
    let insertIndex = targetIndex;

    // If we removed an item before the target position, adjust the insert index
    if (draggedIndex < targetIndex) {
        insertIndex = targetIndex - 1;
    }

    // Handle the special case where targetIndex is rules.length (insert at the very end)
    if (targetIndex >= rules.length) {
        insertIndex = rules.length;
    }

    rules.splice(insertIndex, 0, draggedItem);

    sendConfiguration();

    // Reset drag state
    draggedIndex = -1;
    draggedType = '';

    // Remove dragging class from all rows
    document.querySelectorAll('.rule-row').forEach((row) => {
        row.classList.remove('dragging');
        row.classList.remove('drag-over');
        row.classList.remove('drag-over-bottom');
    });
}

function setupRepoRuleRowEvents(row: HTMLTableRowElement, index: number) {
    // Set up drag and drop events
    const dragHandle = row.querySelector('.drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            // Remove drag-over class from all rows when drag ends
            document.querySelectorAll('.rule-row').forEach((r) => {
                r.classList.remove('drag-over');
                r.classList.remove('drag-over-bottom');
            });
        });
    }

    // Set up click events for rule and color controls to select the rule
    const selectableControls = row.querySelectorAll('input[type="text"], input[type="color"], select');
    selectableControls.forEach((control) => {
        control.addEventListener('click', (e) => {
            // Don't interfere with the control's normal function, just also select the rule
            if (selectedRepoRuleIndex !== index) {
                selectRepoRule(index);
            }
        });

        // Also handle focus events (keyboard navigation)
        control.addEventListener('focus', (e) => {
            if (selectedRepoRuleIndex !== index) {
                selectRepoRule(index);
            }
        });
    });
}

function setupBranchRuleRowEvents(row: HTMLTableRowElement, index: number) {
    // Set up drag and drop events
    const dragHandle = row.querySelector('.drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            // Remove drag-over class from all rows when drag ends
            document.querySelectorAll('.rule-row').forEach((r) => {
                r.classList.remove('drag-over');
                r.classList.remove('drag-over-bottom');
            });
        });
    }

    // Set up click events for rule and color controls to select the rule
    const selectableControls = row.querySelectorAll('input[type="text"], input[type="color"], select');
    selectableControls.forEach((control) => {
        control.addEventListener('click', (e) => {
            // Don't interfere with the control's normal function, just also select the rule
            if (selectedBranchRuleIndex !== index) {
                selectBranchRule(index);
            }
        });

        // Also handle focus events (keyboard navigation)
        control.addEventListener('focus', (e) => {
            if (selectedBranchRuleIndex !== index) {
                selectBranchRule(index);
            }
        });
    });
}

// Validation functions
function debounceValidateAndSend() {
    if (validationTimeout) {
        clearTimeout(validationTimeout);
    }

    validationTimeout = setTimeout(() => {
        if (validateRules()) {
            sendConfiguration();
        }
    }, 500);
}

function validateRules(): boolean {
    clearValidationErrors();

    const errors: string[] = [];

    // Validate repo rules
    if (currentConfig?.repoRules) {
        currentConfig.repoRules.forEach((rule: any, index: number) => {
            if (!rule.repoQualifier?.trim()) {
                errors.push(`Repository rule ${index + 1}: Repository qualifier is required`);
                markFieldAsError('repo-qualifier-' + index);
            }

            if (!rule.primaryColor?.trim()) {
                errors.push(`Repository rule ${index + 1}: Primary color is required`);
                markFieldAsError('repo-primaryColor-' + index);
            }
        });
    }

    // Validate branch rules
    if (currentConfig?.branchRules) {
        currentConfig.branchRules.forEach((rule: any, index: number) => {
            if (!rule.pattern?.trim()) {
                errors.push(`Branch rule ${index + 1}: Branch pattern is required`);
                markFieldAsError('branch-pattern-' + index);
            }

            if (!rule.color?.trim()) {
                errors.push(`Branch rule ${index + 1}: Color is required`);
                markFieldAsError('branch-color-' + index);
            }
        });
    }

    if (errors.length > 0) {
        displayValidationErrors(errors);
        return false;
    }

    return true;
}

function clearValidationErrors() {
    // Remove error styling from all inputs
    document.querySelectorAll('.validation-error').forEach((element) => {
        element.classList.remove('validation-error');
    });

    // Remove error container
    const errorContainer = document.querySelector('.validation-error-container');
    if (errorContainer) {
        errorContainer.remove();
    }
}

function markFieldAsError(fieldId: string) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('validation-error');
    }
}

function displayValidationErrors(errors: string[]) {
    // Create error container
    const errorContainer = document.createElement('div');
    errorContainer.className = 'validation-error-container';
    errorContainer.setAttribute('role', 'alert');
    errorContainer.setAttribute('aria-live', 'assertive');

    const errorTitle = document.createElement('h3');
    errorTitle.className = 'error-title';
    errorTitle.textContent = 'Configuration Errors';
    errorContainer.appendChild(errorTitle);

    const errorList = document.createElement('ul');
    errorList.className = 'error-list';

    errors.forEach((error) => {
        const errorItem = document.createElement('li');
        errorItem.className = 'error-item';
        errorItem.textContent = error;
        errorList.appendChild(errorItem);
    });

    errorContainer.appendChild(errorList);

    // Insert at the top of the config container
    const configContainer = document.querySelector('.config-container');
    if (configContainer) {
        configContainer.insertBefore(errorContainer, configContainer.firstChild);
    }
}

// Communication functions
function sendConfiguration() {
    // console.log('[DEBUG] Sending configuration to extension:', currentConfig);
    vscode.postMessage({
        command: 'updateConfig',
        data: currentConfig,
    });
}

function openColorPicker(ruleType: string, index: number, field: string) {
    vscode.postMessage({
        command: 'openColorPicker',
        data: {
            colorPickerData: { ruleType, index, field },
        },
    });
}

function updateColorInUI(ruleType: string, ruleIndex: number, field: string, color: string) {
    const rules = ruleType === 'repo' ? currentConfig?.repoRules : currentConfig?.branchRules;
    if (!rules?.[ruleIndex]) return;

    rules[ruleIndex][field] = color;

    // Update the UI element
    const input = document.getElementById(`${ruleType}-${field}-${ruleIndex}`) as HTMLInputElement;
    if (input) {
        input.value = color;
        updateColorSwatch(ruleType, ruleIndex, field, color);
    }

    sendConfiguration();
}

// Utility functions
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isValidColorName(color: string): boolean {
    // Instead of maintaining a hardcoded list, test the color with the browser
    try {
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);

        // If the browser computed a valid color (not the default), it's valid
        // Default computed color is usually 'rgb(0, 0, 0)' or 'rgba(0, 0, 0, 0)'
        return computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent';
    } catch (e) {
        return false;
    }
}

function rgbToHex(rgb: string): string | null {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return null;

    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}

function convertColorToValidCSS(color: string): string {
    if (!color) return '#4A90E2';

    // console.log(`[DEBUG] Testing color: "${color}"`);

    // If it's already a valid hex color, return it
    if (/^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)) {
        // console.log(`[DEBUG] "${color}" is hex, returning as-is`);
        return color;
    }

    // If it's an RGB color, return it as-is
    if (/^rgba?\(/.test(color)) {
        // console.log(`[DEBUG] "${color}" is RGB, returning as-is`);
        return color;
    }

    // If it's a named color or other format, test it by creating a temporary element
    try {
        const tempDiv = document.createElement('div');
        tempDiv.style.backgroundColor = color; // Test as background color, not text color
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).backgroundColor;
        document.body.removeChild(tempDiv);

        // console.log(`[DEBUG] "${color}" computed to: "${computedColor}"`);

        // If the browser recognized the color, return the original value
        if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') {
            // console.log(`[DEBUG] "${color}" is valid, returning original`);
            return color; // Return the original named color since CSS understands it
        }

        // console.log(`[DEBUG] "${color}" failed validation, using fallback`);
    } catch (e) {
        // console.log(`[DEBUG] Error testing "${color}":`, e);
        // If there's an error, fall back to default
    }

    return '#4A90E2'; // Default fallback
}

function convertColorToHex(color: string): string {
    if (!color) return '#4A90E2'; // Default blue

    //console.log(`[DEBUG] convertColorToHex called with: "${color}"`);

    // Check if it's a profile name (exists in current config)
    if (currentConfig?.advancedProfiles && currentConfig.advancedProfiles[color]) {
        // It's a profile, return a representative color from the profile
        const profile = currentConfig.advancedProfiles[color];
        if (profile.palette?.primaryActiveBg?.value) {
            return convertColorToHex(profile.palette.primaryActiveBg.value);
        }
        // Fallback to a distinct color to indicate it's a profile
        return '#9B59B6'; // Purple to indicate profile
    }

    // If it's already a hex color, return it
    if (color.startsWith('#')) {
        // console.log(`[DEBUG] "${color}" is already hex`);
        return color;
    }

    // If it's a named color, convert it using browser's color computation
    if (isValidColorName(color)) {
        // console.log(`[DEBUG] "${color}" is a valid color name, converting...`);
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);

        // console.log(`[DEBUG] "${color}" computed to RGB: "${computedColor}"`);

        // Convert RGB to hex
        const hexColor = rgbToHex(computedColor);
        if (hexColor) {
            // console.log(`[DEBUG] "${color}" converted to hex: "${hexColor}"`);
            return hexColor;
        }
    }

    // console.log(`[DEBUG] "${color}" conversion failed, using default`);
    // If conversion failed or it's an unknown format, return default
    return '#4A90E2';
}

/**
 * Convert hex color to rgba with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse the hex values
    let r: number, g: number, b: number;

    if (hex.length === 3) {
        // Short form like #RGB
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        // Long form like #RRGGBB
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        // Invalid hex, return transparent
        return 'rgba(0, 0, 0, 0)';
    }

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function runConfigurationTests() {
    console.log('Running configuration tests...');

    // Test color validation
    console.log('Testing color validation...');

    // Test rule parsing
    console.log('Testing rule parsing...');

    // Test smart defaults
    console.log('Testing smart defaults...');
    console.log('Theme is dark:', isThemeDark());
    console.log('Suggested color:', getThemeAppropriateColor());
    console.log('Smart branch defaults:', getSmartBranchDefaults());

    alert('Configuration tests completed. Check console for details.');
}

// Regex validation functions
function validateRegexPattern(pattern: string, inputId: string) {
    // Clear any existing error for this input
    clearRegexValidationError();

    // Don't validate empty patterns
    if (!pattern.trim()) {
        return;
    }

    try {
        // Try to create a RegExp with the pattern
        new RegExp(pattern);
        // If successful, ensure no error is shown
        clearRegexValidationError();
    } catch (error) {
        // If failed, show the validation error
        showRegexValidationError(pattern, error.message, inputId);
    }
}

function showRegexValidationError(pattern: string, errorMessage: string, inputId: string) {
    // Find the branch panel container
    const branchPanel = document.querySelector('.branch-panel');
    if (!branchPanel) return;

    // Create or update the error container
    let errorContainer = document.getElementById('regex-validation-error');
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = 'regex-validation-error';
        errorContainer.className = 'regex-error-container';
        errorContainer.setAttribute('role', 'alert');
        errorContainer.setAttribute('aria-live', 'polite');
        branchPanel.appendChild(errorContainer);
    }

    errorContainer.innerHTML = `
        <div class="regex-error-content">
            <strong>Invalid Regular Expression:</strong> "${escapeHtml(pattern)}"
            <br>
            <span class="error-message">${escapeHtml(errorMessage)}</span>
        </div>
    `;

    errorContainer.style.display = 'block';

    // Add error styling to the input
    const input = document.getElementById(inputId);
    if (input) {
        input.classList.add('regex-error');
    }
}

function clearRegexValidationError() {
    const errorContainer = document.getElementById('regex-validation-error');
    if (errorContainer) {
        errorContainer.style.display = 'none';
    }

    // Remove error styling from all branch pattern inputs
    const branchInputs = document.querySelectorAll('[id^="branch-pattern-"]');
    branchInputs.forEach((input) => {
        input.classList.remove('regex-error');
    });
}

// Color Auto-complete Functions
function handleColorInputAutoComplete(input: HTMLInputElement) {
    const value = input.value.toLowerCase().trim();

    const matches: string[] = [];
    const profileMatches: string[] = [];
    const colorMatches: string[] = [];

    // Check if this is a palette slot input (should not show profiles)
    const isPaletteSlot = input.hasAttribute('data-palette-slot');

    // Check if profiles are enabled
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;

    // 1. Add profile section (only for non-palette inputs and when profiles are enabled)
    if (!isPaletteSlot && profilesEnabled) {
        matches.push('__PROFILES_HEADER__'); // Special marker for "Profiles" header

        if (currentConfig?.advancedProfiles) {
            const profileNames = Object.keys(currentConfig.advancedProfiles);
            profileNames.forEach((name) => {
                if (value.length === 0 || name.toLowerCase().includes(value)) {
                    profileMatches.push(name);
                }
            });

            if (profileMatches.length > 0) {
                matches.push(...profileMatches);
            } else if (profileNames.length === 0 && value.length === 0) {
                // No profiles defined at all and filter is empty
                matches.push('__NO_PROFILES__'); // Special marker for "none defined"
            } else if (value.length > 0) {
                // Profiles exist but none match the filter
                matches.push('__NO_MATCHES__'); // Special marker for "no matches"
            }
        } else if (value.length === 0) {
            // Profiles are enabled but none are defined and filter is empty
            matches.push('__NO_PROFILES__'); // Special marker for "none defined"
        }
    }

    // 2. Add matching color names
    if (value.length === 0) {
        // Show all color names when field is empty
        colorMatches.push(...HTML_COLOR_NAMES);
    } else {
        // Filter color names based on input
        colorMatches.push(...HTML_COLOR_NAMES.filter((colorName) => colorName.toLowerCase().includes(value)));
    }

    // Add color separator and colors
    if (matches.length > 0 && colorMatches.length > 0) {
        matches.push('__COLORS_SEPARATOR__'); // Special marker for "Colors" separator
    }
    matches.push(...colorMatches);

    if (matches.length === 0 || (matches.length === 1 && matches[0] === '__SEPARATOR__')) {
        hideAutoCompleteDropdown();
        return;
    }

    showAutoCompleteDropdown(input, matches.slice(0, 50)); // Show max 50 suggestions (more room with all profiles)
}

function showAutoCompleteDropdown(input: HTMLInputElement, suggestions: string[]) {
    hideAutoCompleteDropdown(); // Hide any existing dropdown

    const dropdown = document.createElement('div');
    dropdown.className = 'color-autocomplete-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Color name suggestions');

    let selectableIndex = 0; // Track actual selectable items (excluding separator)
    suggestions.forEach((suggestion, index) => {
        // Handle Profiles header
        if (suggestion === '__PROFILES_HEADER__') {
            const header = document.createElement('div');
            header.className = 'color-autocomplete-separator';
            header.textContent = 'Profiles';
            dropdown.appendChild(header);
            return; // Don't increment selectableIndex
        }

        // Handle "no profiles defined" placeholder
        if (suggestion === '__NO_PROFILES__') {
            const placeholder = document.createElement('div');
            placeholder.className = 'color-autocomplete-placeholder';
            placeholder.textContent = 'none defined';
            dropdown.appendChild(placeholder);
            return; // Don't increment selectableIndex
        }

        // Handle "no matches" placeholder
        if (suggestion === '__NO_MATCHES__') {
            const placeholder = document.createElement('div');
            placeholder.className = 'color-autocomplete-placeholder';
            placeholder.textContent = 'no matches';
            dropdown.appendChild(placeholder);
            return; // Don't increment selectableIndex
        }

        // Handle Colors separator
        if (suggestion === '__COLORS_SEPARATOR__') {
            const separator = document.createElement('div');
            separator.className = 'color-autocomplete-separator';
            separator.textContent = 'Colors';
            dropdown.appendChild(separator);
            return; // Don't increment selectableIndex
        }

        const item = document.createElement('div');
        item.className = 'color-autocomplete-item';
        item.setAttribute('role', 'option');
        item.textContent = suggestion;
        item.dataset.index = selectableIndex.toString();
        item.dataset.value = suggestion; // Store original value

        // Add color preview (only for actual color names, not profile references)
        const isProfile = currentConfig?.advancedProfiles && currentConfig.advancedProfiles[suggestion];
        if (!isProfile) {
            const preview = document.createElement('span');
            preview.className = 'color-preview';
            preview.style.backgroundColor = suggestion;
            item.appendChild(preview);
        } else {
            // Add profile indicator
            const indicator = document.createElement('span');
            indicator.className = 'profile-indicator';
            indicator.textContent = ' ⚙';
            indicator.title = 'Advanced Profile';
            item.appendChild(indicator);
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent input from losing focus
            selectAutoCompleteSuggestion(input, suggestion);
        });

        item.addEventListener('mouseenter', () => {
            selectedSuggestionIndex = selectableIndex;
            updateAutoCompleteSelection();
        });

        dropdown.appendChild(item);
        selectableIndex++;
    });

    // Position dropdown below input
    const inputRect = input.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = inputRect.bottom + window.scrollY + 'px';
    dropdown.style.left = inputRect.left + window.scrollX + 'px';
    dropdown.style.width = Math.max(inputRect.width, 200) + 'px';
    dropdown.style.zIndex = '1000';

    document.body.appendChild(dropdown);

    activeAutoCompleteInput = input;
    autoCompleteDropdown = dropdown;
    selectedSuggestionIndex = -1;

    // Add keyboard navigation
    input.addEventListener('keydown', handleAutoCompleteKeydown);
}

function hideAutoCompleteDropdown() {
    if (autoCompleteDropdown) {
        document.body.removeChild(autoCompleteDropdown);
        autoCompleteDropdown = null;
    }

    if (activeAutoCompleteInput) {
        activeAutoCompleteInput.removeEventListener('keydown', handleAutoCompleteKeydown);
        activeAutoCompleteInput = null;
    }

    selectedSuggestionIndex = -1;
}

function handleAutoCompleteKeydown(event: KeyboardEvent) {
    if (!autoCompleteDropdown) return;

    const items = autoCompleteDropdown.querySelectorAll('.color-autocomplete-item');

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
            updateAutoCompleteSelection();
            break;

        case 'ArrowUp':
            event.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            updateAutoCompleteSelection();
            break;

        case 'Enter':
            if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
                event.preventDefault();
                const selectedItem = items[selectedSuggestionIndex] as HTMLElement;
                const colorName = selectedItem.dataset.value || '';
                selectAutoCompleteSuggestion(activeAutoCompleteInput!, colorName);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAutoCompleteDropdown();
            break;
    }
}

function updateAutoCompleteSelection() {
    if (!autoCompleteDropdown) return;

    const items = autoCompleteDropdown.querySelectorAll('.color-autocomplete-item');
    items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
            item.setAttribute('aria-selected', 'true');

            // Scroll to keep selected item visible
            scrollToSelectedItem(item as HTMLElement, autoCompleteDropdown);
        } else {
            item.classList.remove('selected');
            item.setAttribute('aria-selected', 'false');
        }
    });
}

function scrollToSelectedItem(selectedItem: HTMLElement, dropdown: HTMLElement) {
    const dropdownRect = dropdown.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();

    // Calculate relative position within the dropdown
    const itemTop = selectedItem.offsetTop;
    const itemBottom = itemTop + selectedItem.offsetHeight;
    const dropdownScrollTop = dropdown.scrollTop;
    const dropdownHeight = dropdown.clientHeight;

    // Check if item is above the visible area
    if (itemTop < dropdownScrollTop) {
        dropdown.scrollTop = itemTop;
    }
    // Check if item is below the visible area
    else if (itemBottom > dropdownScrollTop + dropdownHeight) {
        dropdown.scrollTop = itemBottom - dropdownHeight;
    }
}

function selectAutoCompleteSuggestion(input: HTMLInputElement, colorName: string) {
    input.value = colorName;

    // Trigger the input event to update the configuration
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    hideAutoCompleteDropdown();
    input.focus();
}

function filterBranchPatternAutoComplete(input: HTMLInputElement) {
    const value = input.value.toLowerCase().trim();

    // Collect unique patterns from all rules
    const existingPatterns = collectUniqueBranchPatterns();

    let matches: string[] = [];

    if (value.length === 0) {
        // Show all existing patterns when field is empty
        matches = existingPatterns;
    } else {
        // Filter existing patterns - startsWith first, then includes
        const startsWithMatches = existingPatterns.filter((pattern) => pattern.toLowerCase().startsWith(value));
        const includesMatches = existingPatterns.filter(
            (pattern) => !pattern.toLowerCase().startsWith(value) && pattern.toLowerCase().includes(value),
        );
        matches = [...startsWithMatches, ...includesMatches];
    }

    // Add Examples section
    if (matches.length > 0) {
        matches.push('__EXAMPLES_SEPARATOR__');
    }

    // Filter examples using same logic
    if (value.length === 0) {
        matches.push(...EXAMPLE_BRANCH_PATTERNS);
    } else {
        const exampleStartsWith = EXAMPLE_BRANCH_PATTERNS.filter((pattern) => pattern.toLowerCase().startsWith(value));
        const exampleIncludes = EXAMPLE_BRANCH_PATTERNS.filter(
            (pattern) => !pattern.toLowerCase().startsWith(value) && pattern.toLowerCase().includes(value),
        );
        matches.push(...exampleStartsWith, ...exampleIncludes);
    }

    if (matches.length === 0 || (matches.length === 1 && matches[0] === '__EXAMPLES_SEPARATOR__')) {
        hideAutoCompleteDropdown();
        return;
    }

    showBranchPatternAutoCompleteDropdown(input, matches.slice(0, 50));
}

function showBranchPatternAutoCompleteDropdown(input: HTMLInputElement, suggestions: string[]) {
    hideAutoCompleteDropdown(); // Hide any existing dropdown

    const dropdown = document.createElement('div');
    dropdown.className = 'color-autocomplete-dropdown'; // Reuse existing styles
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Branch pattern suggestions');

    let selectableIndex = 0;
    suggestions.forEach((suggestion, index) => {
        // Handle Examples separator
        if (suggestion === '__EXAMPLES_SEPARATOR__') {
            const separator = document.createElement('div');
            separator.className = 'color-autocomplete-separator';
            separator.textContent = 'Examples';
            dropdown.appendChild(separator);
            return;
        }

        const item = document.createElement('div');
        item.className = 'color-autocomplete-item';
        item.textContent = suggestion;
        item.dataset.value = suggestion;
        item.dataset.index = selectableIndex.toString();
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');

        item.addEventListener('click', () => {
            selectBranchPatternSuggestion(input, suggestion);
        });

        item.addEventListener('mouseenter', () => {
            selectedSuggestionIndex = selectableIndex;
            updateAutoCompleteSelection();
        });

        dropdown.appendChild(item);
        selectableIndex++;
    });

    document.body.appendChild(dropdown);

    // Position the dropdown below the input
    const rect = input.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 'px';
    dropdown.style.minWidth = rect.width + 'px';

    autoCompleteDropdown = dropdown;
    activeAutoCompleteInput = input;
    selectedSuggestionIndex = -1;

    // Set up keyboard navigation
    input.addEventListener('keydown', handleAutoCompleteKeydown);
}

function selectBranchPatternSuggestion(input: HTMLInputElement, pattern: string) {
    input.value = pattern;

    // Trigger the input event to update the configuration
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    hideAutoCompleteDropdown();
    input.focus();
}

// Close auto-complete when clicking outside
document.addEventListener('click', (event) => {
    if (
        autoCompleteDropdown &&
        !autoCompleteDropdown.contains(event.target as Node) &&
        event.target !== activeAutoCompleteInput
    ) {
        hideAutoCompleteDropdown();
    }
});

// Close auto-complete when input loses focus (with delay to allow for clicks on dropdown)
document.addEventListener('focusout', (event) => {
    if (event.target === activeAutoCompleteInput) {
        setTimeout(() => {
            if (autoCompleteDropdown && document.activeElement !== activeAutoCompleteInput) {
                hideAutoCompleteDropdown();
            }
        }, 150);
    }
});

// --- Advanced Profiles Implementation ---

// Friendly display names for palette slots
const PALETTE_SLOT_LABELS: Record<string, string> = {
    primaryActiveBg: 'Primary Active Background',
    primaryActiveFg: 'Primary Active Foreground',
    primaryInactiveBg: 'Primary Inactive Background',
    primaryInactiveFg: 'Primary Inactive Foreground',
    secondaryActiveBg: 'Secondary Active Background',
    secondaryActiveFg: 'Secondary Active Foreground',
    secondaryInactiveBg: 'Secondary Inactive Background',
    secondaryInactiveFg: 'Secondary Inactive Foreground',
    tertiaryBg: 'Tertiary Background',
    tertiaryFg: 'Tertiary Foreground',
    quaternaryBg: 'Quaternary Background',
    quaternaryFg: 'Quaternary Foreground',
};

/**
 * Human-readable labels for VS Code theme color keys
 */
const THEME_KEY_LABELS: Record<string, string> = {
    // Title Bar
    'titleBar.activeBackground': 'Title Bar: Active Background',
    'titleBar.activeForeground': 'Title Bar: Active Foreground',
    'titleBar.inactiveBackground': 'Title Bar: Inactive Background',
    'titleBar.inactiveForeground': 'Title Bar: Inactive Foreground',
    'titleBar.border': 'Title Bar: Border',

    // Activity Bar
    'activityBar.background': 'Activity Bar: Background',
    'activityBar.foreground': 'Activity Bar: Foreground',
    'activityBar.inactiveForeground': 'Activity Bar: Inactive Foreground',
    'activityBar.border': 'Activity Bar: Border',

    // Status Bar
    'statusBar.background': 'Status Bar: Background',
    'statusBar.foreground': 'Status Bar: Foreground',
    'statusBar.border': 'Status Bar: Border',

    // Tabs & Breadcrumbs
    'tab.activeBackground': 'Tab: Active Background',
    'tab.activeForeground': 'Tab: Active Foreground',
    'tab.inactiveBackground': 'Tab: Inactive Background',
    'tab.inactiveForeground': 'Tab: Inactive Foreground',
    'tab.hoverBackground': 'Tab: Hover Background',
    'tab.unfocusedHoverBackground': 'Tab: Unfocused Hover Background',
    'tab.activeBorder': 'Tab: Active Border',
    'editorGroupHeader.tabsBackground': 'Editor Group Header: Tabs Background',
    'breadcrumb.background': 'Breadcrumb: Background',
    'breadcrumb.foreground': 'Breadcrumb: Foreground',

    // Command Center
    'commandCenter.background': 'Command Center: Background',
    'commandCenter.foreground': 'Command Center: Foreground',
    'commandCenter.activeBackground': 'Command Center: Active Background',
    'commandCenter.activeForeground': 'Command Center: Active Foreground',

    // Terminal
    'terminal.background': 'Terminal: Background',
    'terminal.foreground': 'Terminal: Foreground',

    // Lists & Panels
    'panel.background': 'Panel: Background',
    'panel.border': 'Panel: Border',
    'panelTitle.activeForeground': 'Panel Title: Active Foreground',
    'panelTitle.inactiveForeground': 'Panel Title: Inactive Foreground',
    'panelTitle.activeBorder': 'Panel Title: Active Border',
    'list.activeSelectionBackground': 'List: Active Selection Background',
    'list.activeSelectionForeground': 'List: Active Selection Foreground',
    'list.inactiveSelectionBackground': 'List: Inactive Selection Background',
    'list.inactiveSelectionForeground': 'List: Inactive Selection Foreground',
    'list.focusOutline': 'List: Focus Outline',
    'list.hoverBackground': 'List: Hover Background',
    'list.hoverForeground': 'List: Hover Foreground',
    'badge.background': 'Badge: Background',
    'badge.foreground': 'Badge: Foreground',
    'panelTitleBadge.background': 'Panel Title Badge: Background',
    'panelTitleBadge.foreground': 'Panel Title Badge: Foreground',
    'input.background': 'Input: Background',
    'input.foreground': 'Input: Foreground',
    'input.border': 'Input: Border',
    'input.placeholderForeground': 'Input: Placeholder Foreground',
    focusBorder: 'Focus Border',

    // Side Bar
    'sideBar.background': 'Side Bar: Background',
    'sideBar.foreground': 'Side Bar: Foreground',
    'sideBar.border': 'Side Bar: Border',
};

// Explicit ordering for palette slots to ensure consistent display order
// Order: Primary (Active Fg, Active Bg, Inactive Fg, Inactive Bg),
//        Secondary (same pattern), Tertiary (Fg, Bg), Quaternary (Fg, Bg)
const PALETTE_SLOT_ORDER: string[] = [
    'primaryActiveFg',
    'primaryActiveBg',
    'primaryInactiveFg',
    'primaryInactiveBg',
    'secondaryActiveFg',
    'secondaryActiveBg',
    'secondaryInactiveFg',
    'secondaryInactiveBg',
    'tertiaryFg',
    'tertiaryBg',
    'quaternaryFg',
    'quaternaryBg',
];

const DEFAULT_PALETTE: Palette = {
    primaryActiveBg: { source: 'fixed', value: '#4A90E2' },
    primaryActiveFg: { source: 'fixed', value: '#FFFFFF' },
    primaryInactiveBg: { source: 'fixed', value: '#2E5C8A' },
    primaryInactiveFg: { source: 'fixed', value: '#CCCCCC' },
    secondaryActiveBg: { source: 'fixed', value: '#5FA3E8' },
    secondaryActiveFg: { source: 'fixed', value: '#FFFFFF' },
    secondaryInactiveBg: { source: 'fixed', value: '#4278B0' },
    secondaryInactiveFg: { source: 'fixed', value: '#CCCCCC' },
    tertiaryBg: { source: 'fixed', value: '#1E1E1E' },
    tertiaryFg: { source: 'fixed', value: '#CCCCCC' },
    quaternaryBg: { source: 'fixed', value: '#2D2D30' },
    quaternaryFg: { source: 'fixed', value: '#D4D4D4' },
};

const DEFAULT_MAPPINGS: SectionMappings = {
    'activityBar.background': 'primaryActiveBg',
    'activityBar.foreground': 'primaryActiveFg',
    'activityBar.inactiveForeground': 'primaryInactiveFg',
    'statusBar.background': 'secondaryActiveBg',
    'statusBar.foreground': 'secondaryActiveFg',
    'titleBar.activeBackground': 'primaryActiveBg',
    'titleBar.activeForeground': 'primaryActiveFg',
    'titleBar.inactiveBackground': 'primaryInactiveBg',
    'titleBar.inactiveForeground': 'primaryInactiveFg',
};

const SECTION_DEFINITIONS: { [name: string]: string[] } = {
    'Title Bar': [
        'titleBar.activeBackground',
        'titleBar.activeForeground',
        'titleBar.inactiveBackground',
        'titleBar.inactiveForeground',
        'titleBar.border',
    ],
    'Activity Bar': [
        'activityBar.background',
        'activityBar.foreground',
        'activityBar.inactiveForeground',
        'activityBar.border',
    ],
    'Status Bar': ['statusBar.background', 'statusBar.foreground', 'statusBar.border'],
    'Tabs & Breadcrumbs': [
        'tab.activeBackground',
        'tab.activeForeground',
        'tab.inactiveBackground',
        'tab.inactiveForeground',
        'tab.hoverBackground',
        'tab.unfocusedHoverBackground',
        'tab.activeBorder',
        'editorGroupHeader.tabsBackground',
        'breadcrumb.background',
        'breadcrumb.foreground',
    ],
    'Command Center': [
        'commandCenter.background',
        'commandCenter.foreground',
        'commandCenter.activeBackground',
        'commandCenter.activeForeground',
    ],
    Terminal: ['terminal.background', 'terminal.foreground'],
    'Lists & Panels': [
        'panel.background',
        'panel.border',
        'panelTitle.activeForeground',
        'panelTitle.inactiveForeground',
        'panelTitle.activeBorder',
        'list.activeSelectionBackground',
        'list.activeSelectionForeground',
        'list.inactiveSelectionBackground',
        'list.inactiveSelectionForeground',
        'list.focusOutline',
        'list.hoverBackground',
        'list.hoverForeground',
        'badge.background',
        'badge.foreground',
        'panelTitleBadge.background',
        'panelTitleBadge.foreground',
        'input.background',
        'input.foreground',
        'input.border',
        'input.placeholderForeground',
        'focusBorder',
    ],
    'Side Bar': ['sideBar.background', 'sideBar.foreground', 'sideBar.border'],
};

let selectedProfileName: string | null = (() => {
    try {
        return localStorage.getItem('selectedProfileName');
    } catch {
        return null;
    }
})();

// selectedMappingTab and syncFgBgEnabled are declared at the top of the file

/**
 * Definitive mapping of foreground/background pairs
 * Maps each foreground key to its background counterpart (and implicitly vice versa)
 */
const FG_BG_PAIRS: { [key: string]: string } = {
    // Title Bar
    'titleBar.activeForeground': 'titleBar.activeBackground',
    'titleBar.activeBackground': 'titleBar.activeForeground',
    'titleBar.inactiveForeground': 'titleBar.inactiveBackground',
    'titleBar.inactiveBackground': 'titleBar.inactiveForeground',

    // Activity Bar
    'activityBar.foreground': 'activityBar.background',
    'activityBar.background': 'activityBar.foreground',
    'activityBar.inactiveForeground': 'activityBar.background',

    // Status Bar
    'statusBar.foreground': 'statusBar.background',
    'statusBar.background': 'statusBar.foreground',

    // Tabs
    'tab.activeForeground': 'tab.activeBackground',
    'tab.activeBackground': 'tab.activeForeground',
    'tab.inactiveForeground': 'tab.inactiveBackground',
    'tab.inactiveBackground': 'tab.inactiveForeground',

    // Breadcrumbs
    'breadcrumb.foreground': 'breadcrumb.background',
    'breadcrumb.background': 'breadcrumb.foreground',

    // Command Center
    'commandCenter.foreground': 'commandCenter.background',
    'commandCenter.background': 'commandCenter.foreground',
    'commandCenter.activeForeground': 'commandCenter.activeBackground',
    'commandCenter.activeBackground': 'commandCenter.activeForeground',

    // Terminal
    'terminal.foreground': 'terminal.background',
    'terminal.background': 'terminal.foreground',

    // Panels
    'panelTitle.activeForeground': 'panel.background',
    'panelTitle.inactiveForeground': 'panel.background',

    // Lists
    'list.activeSelectionForeground': 'list.activeSelectionBackground',
    'list.activeSelectionBackground': 'list.activeSelectionForeground',
    'list.inactiveSelectionForeground': 'list.inactiveSelectionBackground',
    'list.inactiveSelectionBackground': 'list.inactiveSelectionForeground',
    'list.hoverForeground': 'list.hoverBackground',
    'list.hoverBackground': 'list.hoverForeground',

    // Badges
    'badge.foreground': 'badge.background',
    'badge.background': 'badge.foreground',
    'panelTitleBadge.foreground': 'panelTitleBadge.background',
    'panelTitleBadge.background': 'panelTitleBadge.foreground',

    // Input
    'input.foreground': 'input.background',
    'input.background': 'input.foreground',
    'input.placeholderForeground': 'input.background',

    // Side Bar
    'sideBar.foreground': 'sideBar.background',
    'sideBar.background': 'sideBar.foreground',
};

/**
 * Definitive mapping of active/inactive pairs
 * Maps each active key to its inactive counterpart (and implicitly vice versa)
 */
const ACTIVE_INACTIVE_PAIRS: { [key: string]: string } = {
    // Title Bar
    'titleBar.activeBackground': 'titleBar.inactiveBackground',
    'titleBar.inactiveBackground': 'titleBar.activeBackground',
    'titleBar.activeForeground': 'titleBar.inactiveForeground',
    'titleBar.inactiveForeground': 'titleBar.activeForeground',

    // Activity Bar (note: activity bar uses different naming)
    'activityBar.foreground': 'activityBar.inactiveForeground',
    'activityBar.inactiveForeground': 'activityBar.foreground',

    // Tabs
    'tab.activeBackground': 'tab.inactiveBackground',
    'tab.inactiveBackground': 'tab.activeBackground',
    'tab.activeForeground': 'tab.inactiveForeground',
    'tab.inactiveForeground': 'tab.activeForeground',

    // Command Center
    'commandCenter.background': 'commandCenter.activeBackground',
    'commandCenter.activeBackground': 'commandCenter.background',
    'commandCenter.foreground': 'commandCenter.activeForeground',
    'commandCenter.activeForeground': 'commandCenter.foreground',

    // Panel titles
    'panelTitle.activeForeground': 'panelTitle.inactiveForeground',
    'panelTitle.inactiveForeground': 'panelTitle.activeForeground',

    // Lists
    'list.activeSelectionBackground': 'list.inactiveSelectionBackground',
    'list.inactiveSelectionBackground': 'list.activeSelectionBackground',
    'list.activeSelectionForeground': 'list.inactiveSelectionForeground',
    'list.inactiveSelectionForeground': 'list.activeSelectionForeground',
};

/**
 * Find the corresponding foreground or background element key using definitive mapping
 */
function findCorrespondingFgBg(key: string): string | null {
    return FG_BG_PAIRS[key] || null;
}

/**
 * Get the corresponding palette slot for a given slot
 * e.g., 'primaryActiveFg' <-> 'primaryActiveBg'
 */
function getCorrespondingPaletteSlot(slotName: string): string | null {
    if (slotName === 'none') return null;

    if (slotName.endsWith('Fg')) {
        return slotName.replace('Fg', 'Bg');
    } else if (slotName.endsWith('Bg')) {
        return slotName.replace('Bg', 'Fg');
    }
    return null;
}

/**
 * Find the corresponding active or inactive element key using definitive mapping
 */
function findCorrespondingActiveInactive(key: string): string | null {
    return ACTIVE_INACTIVE_PAIRS[key] || null;
}

/**
 * Get the corresponding active/inactive palette slot
 * e.g., 'primaryActiveFg' <-> 'primaryInactiveFg'
 */
function getCorrespondingActiveInactiveSlot(slotName: string): string | null {
    if (slotName === 'none') return null;

    if (slotName.includes('Active')) {
        return slotName.replace('Active', 'Inactive');
    } else if (slotName.includes('Inactive')) {
        return slotName.replace('Inactive', 'Active');
    }
    return null;
}

/**
 * Determine if an element key is for a background color
 */
function isBackgroundElement(key: string): boolean {
    return key.toLowerCase().includes('background') || key.toLowerCase().endsWith('bg');
}

/**
 * Determine if an element key is for a foreground color
 */
function isForegroundElement(key: string): boolean {
    return key.toLowerCase().includes('foreground') || key.toLowerCase().endsWith('fg');
}

/**
 * Determine if an element key is for an active state
 */
function isActiveElement(key: string): boolean {
    // Check for 'active' in the key but not 'inactive'
    const keyLower = key.toLowerCase();
    return keyLower.includes('active') && !keyLower.includes('inactive');
}

/**
 * Determine if an element key is for an inactive state
 */
function isInactiveElement(key: string): boolean {
    return key.toLowerCase().includes('inactive');
}

/**
 * Determine if an element key is for neither active nor inactive (neutral)
 */
function isNeutralElement(key: string): boolean {
    const keyLower = key.toLowerCase();
    return !keyLower.includes('active') && !keyLower.includes('inactive');
}

/**
 * Check if a palette slot is compatible with a mapping key for drag-and-drop
 * Returns true if the slot can logically be assigned to this key
 */
function isSlotCompatibleWithKey(slotName: string, mappingKey: string): boolean {
    const keyIsBg = isBackgroundElement(mappingKey);
    const keyIsFg = isForegroundElement(mappingKey);
    const keyIsActive = isActiveElement(mappingKey);
    const keyIsInactive = isInactiveElement(mappingKey);
    const keyIsNeutral = isNeutralElement(mappingKey);

    const slotIsBg = slotName.endsWith('Bg');
    const slotIsFg = slotName.endsWith('Fg');
    const slotIsActive = slotName.includes('Active') && !slotName.includes('Inactive');
    const slotIsInactive = slotName.includes('Inactive');
    const slotIsNeutral = !slotName.includes('Active') && !slotName.includes('Inactive');

    // Neutral keys are compatible with everything
    if (keyIsNeutral && !keyIsBg && !keyIsFg && !keyIsActive && !keyIsInactive) {
        return true;
    }

    // Check Bg/Fg compatibility
    if (keyIsBg && !slotIsBg) return false;
    if (keyIsFg && !slotIsFg) return false;

    // Check Active/Inactive compatibility
    // Active keys can use active or neutral slots
    if (keyIsActive && !(slotIsActive || slotIsNeutral)) return false;
    // Inactive keys can use inactive or neutral slots
    if (keyIsInactive && !(slotIsInactive || slotIsNeutral)) return false;
    // Neutral keys with bg/fg context can use neutral slots or matching state
    if (keyIsNeutral && !slotIsNeutral) return false;

    return true;
}

/**
 * Highlight or unhighlight compatible drop zones during drag
 */
function highlightCompatibleDropZones(slotName: string, highlight: boolean) {
    const allDropdowns = document.querySelectorAll('.custom-dropdown');
    allDropdowns.forEach((dropdown) => {
        const dropdownEl = dropdown as HTMLElement;
        const mappingKey = dropdownEl.getAttribute('data-mapping-key');

        if (highlight && mappingKey) {
            const isCompatible = isSlotCompatibleWithKey(slotName, mappingKey);
            if (isCompatible) {
                dropdownEl.classList.add('drag-compatible');
            }
        } else {
            dropdownEl.classList.remove('drag-compatible');
            dropdownEl.classList.remove('drag-hover');
        }
    });
}

/**
 * Check if a palette slot is congruous with a theme key for Fg/Bg
 * Returns true if the slot type matches the key type (both Fg or both Bg)
 */
function isSlotCongruousFgBg(key: string, slot: string): boolean {
    if (slot === 'none' || slot === '__fixed__') return true; // Special cases are always congruous

    const keyIsBg = isBackgroundElement(key);
    const keyIsFg = isForegroundElement(key);
    const slotIsBg = slot.endsWith('Bg');
    const slotIsFg = slot.endsWith('Fg');

    // Congruous if both are Bg or both are Fg
    return (keyIsBg && slotIsBg) || (keyIsFg && slotIsFg);
}

/**
 * Check if a palette slot is congruous with a theme key for Active/Inactive
 * Returns true if the slot state matches the key state (both Active, both Inactive, or both Neutral)
 */
function isSlotCongruousActiveInactive(key: string, slot: string): boolean {
    if (slot === 'none' || slot === '__fixed__') return true; // Special cases are always congruous

    const keyIsActive = isActiveElement(key);
    const keyIsInactive = isInactiveElement(key);
    const keyIsNeutral = isNeutralElement(key);
    const slotIsActive = slot.includes('Active') && !slot.includes('Inactive');
    const slotIsInactive = slot.includes('Inactive');
    const slotIsNeutral = !slot.includes('Active') && !slot.includes('Inactive');

    // Congruous if states match
    return (keyIsActive && slotIsActive) || (keyIsInactive && slotIsInactive) || (keyIsNeutral && slotIsNeutral);
}

/**
 * Filter palette slots to only show related options based on element characteristics
 */
function getFilteredPaletteOptions(elementKey: string, allSlots: string[], currentSlot?: string): string[] {
    if (!limitOptionsEnabled) {
        // Even when not filtering, return in proper order
        const sorted = allSlots
            .filter((s) => s !== 'none')
            .sort((a, b) => {
                const indexA = PALETTE_SLOT_ORDER.indexOf(a);
                const indexB = PALETTE_SLOT_ORDER.indexOf(b);
                if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        return sorted;
    }

    const isBg = isBackgroundElement(elementKey);
    const isFg = isForegroundElement(elementKey);
    const isActive = isActiveElement(elementKey);
    const isInactive = isInactiveElement(elementKey);
    const isNeutral = isNeutralElement(elementKey);

    // If element is neutral (no fg/bg or active/inactive context), don't filter - show all slots
    if (isNeutral && !isBg && !isFg && !isActive && !isInactive) {
        const sorted = allSlots
            .filter((s) => s !== 'none')
            .sort((a, b) => {
                const indexA = PALETTE_SLOT_ORDER.indexOf(a);
                const indexB = PALETTE_SLOT_ORDER.indexOf(b);
                if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        // Include current slot if specified
        if (currentSlot && currentSlot !== 'none' && currentSlot !== '__fixed__' && !sorted.includes(currentSlot)) {
            sorted.push(currentSlot);
        }
        return sorted;
    }

    const filtered = allSlots.filter((slot) => {
        if (slot === 'none') return false; // Will be added manually in dropdown

        const slotLower = slot.toLowerCase();

        // Check bg/fg match
        const slotIsBg = slotLower.endsWith('bg');
        const slotIsFg = slotLower.endsWith('fg');

        // For elements that are clearly bg or fg, filter by that
        if (isBg && !slotIsBg) return false;
        if (isFg && !slotIsFg) return false;

        // Check active/inactive match
        const slotIsActive = slotLower.includes('active') && !slotLower.includes('inactive');
        const slotIsInactive = slotLower.includes('inactive');
        const slotIsNeutral = !slotLower.includes('active') && !slotLower.includes('inactive');

        // For elements with active/inactive state, filter accordingly
        if (isActive && !(slotIsActive || slotIsNeutral)) return false;
        if (isInactive && !(slotIsInactive || slotIsNeutral)) return false;

        return true;
    });

    // Always include the current slot if it's set and not already in the filtered list
    if (currentSlot && currentSlot !== 'none' && currentSlot !== '__fixed__' && !filtered.includes(currentSlot)) {
        filtered.push(currentSlot);
    }

    // Sort according to PALETTE_SLOT_ORDER
    filtered.sort((a, b) => {
        const indexA = PALETTE_SLOT_ORDER.indexOf(a);
        const indexB = PALETTE_SLOT_ORDER.indexOf(b);

        // If both are in the order array, sort by their index
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }

        // If only one is in the order array, it comes first
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // If neither is in the order array, sort alphabetically
        return a.localeCompare(b);
    });

    return filtered;
}

function renderProfiles(profiles: AdvancedProfileMap | undefined) {
    const listContainer = document.getElementById('profilesList');
    const editorTop = document.getElementById('profileEditorTop');
    const editorBottom = document.getElementById('profileEditorBottom');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Restore last selected profile if it still exists
    if (selectedProfileName && profiles && !profiles[selectedProfileName]) {
        selectedProfileName = null;
        try {
            localStorage.removeItem('selectedProfileName');
        } catch {}
    }

    // Auto-select first profile if none selected but profiles exist
    if (!selectedProfileName && profiles && Object.keys(profiles).length > 0) {
        selectedProfileName = Object.keys(profiles)[0];
        try {
            localStorage.setItem('selectedProfileName', selectedProfileName);
        } catch {}
    }

    // Hide editor sections by default, show only when selection exists
    if (editorTop) {
        editorTop.style.visibility = selectedProfileName ? 'visible' : 'hidden';
        editorTop.style.opacity = selectedProfileName ? '1' : '0';
    }
    if (editorBottom) {
        editorBottom.style.visibility = selectedProfileName ? 'visible' : 'hidden';
        editorBottom.style.opacity = selectedProfileName ? '1' : '0';
    }

    if (!profiles || Object.keys(profiles).length === 0) {
        // Initialize default if empty just for UI or display empty
        listContainer.innerHTML =
            '<div style="padding:10px; color:var(--vscode-descriptionForeground); font-style:italic;">No profiles defined. Click "+ Add" to create one.</div>';
        // Ensure selection is cleared if no profiles exist
        selectedProfileName = null;
        if (editorTop) {
            editorTop.style.visibility = 'hidden';
            editorTop.style.opacity = '0';
        }
        if (editorBottom) {
            editorBottom.style.visibility = 'hidden';
            editorBottom.style.opacity = '0';
        }
    } else {
        // Get currently applied profiles from matching rules
        const matchedRepoRule =
            currentConfig?.matchingIndexes?.repoRule >= 0
                ? currentConfig.repoRules?.[currentConfig.matchingIndexes.repoRule]
                : null;
        const matchedBranchRule =
            currentConfig?.matchingIndexes?.branchRule >= 0
                ? currentConfig.branchRules?.[currentConfig.matchingIndexes.branchRule]
                : null;

        // Extract profile names from matched rules
        const repoProfileName =
            matchedRepoRule?.profileName ||
            (matchedRepoRule?.primaryColor && currentConfig?.advancedProfiles?.[matchedRepoRule.primaryColor]
                ? matchedRepoRule.primaryColor
                : null);
        const branchProfileName =
            matchedBranchRule?.profileName ||
            (matchedBranchRule?.color && currentConfig?.advancedProfiles?.[matchedBranchRule.color]
                ? matchedBranchRule.color
                : null);

        console.log('[Profile Indicators] matchingIndexes:', currentConfig?.matchingIndexes);
        console.log('[Profile Indicators] matchedRepoRule:', matchedRepoRule);
        console.log('[Profile Indicators] matchedBranchRule:', matchedBranchRule);
        console.log('[Profile Indicators] repoProfileName:', repoProfileName);
        console.log('[Profile Indicators] branchProfileName:', branchProfileName);

        Object.keys(profiles).forEach((name) => {
            const el = document.createElement('div');
            el.className = 'profile-item';
            el.dataset.profileName = name;
            if (name === selectedProfileName) el.classList.add('selected');

            // Create name span with badge
            const nameContainer = document.createElement('div');
            nameContainer.className = 'profile-name-container';

            // Add indicators for currently applied profiles (on the left)
            const isRepoProfile = name === repoProfileName;
            const isBranchProfile = name === branchProfileName;

            console.log(
                `[Profile Indicators] Checking profile "${name}": isRepo=${isRepoProfile}, isBranch=${isBranchProfile}`,
            );

            // Create indicator container (even if empty, to maintain alignment)
            const indicatorContainer = document.createElement('span');
            indicatorContainer.className = 'profile-indicators';

            if (isRepoProfile || isBranchProfile) {
                console.log(`[Profile Indicators] Adding indicators for "${name}"`);

                if (isRepoProfile) {
                    const repoIcon = document.createElement('span');
                    repoIcon.className = 'codicon codicon-repo profile-indicator-icon';
                    repoIcon.title = 'Applied to repository rule for this workspace';
                    indicatorContainer.appendChild(repoIcon);
                    console.log(`[Profile Indicators] Added repo icon for "${name}"`);
                }

                if (isBranchProfile) {
                    const branchIcon = document.createElement('span');
                    branchIcon.className = 'codicon codicon-git-branch profile-indicator-icon';
                    branchIcon.title = 'Applied to branch rule for this workspace';
                    indicatorContainer.appendChild(branchIcon);
                    console.log(`[Profile Indicators] Added branch icon for "${name}"`);
                }
            }

            nameContainer.appendChild(indicatorContainer);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'profile-name';
            nameSpan.textContent = name;
            nameContainer.appendChild(nameSpan);

            // Count total active mappings for badge
            const profile = profiles[name];
            const totalActive = countTotalActiveMappings(profile);

            const badge = document.createElement('span');
            badge.className = 'profile-count-badge';
            badge.textContent = totalActive.toString();
            badge.title = `${totalActive} elements being colored`;
            nameContainer.appendChild(badge);

            // Create color swatch
            const swatch = document.createElement('div');
            swatch.className = 'profile-color-swatch';

            // Get the profile colors
            let bgColor = '#4A90E2'; // Default
            let fgColor = '#FFFFFF'; // Default

            if (profile?.palette?.primaryActiveBg?.value) {
                bgColor = convertColorToHex(profile.palette.primaryActiveBg.value);
            }
            if (profile?.palette?.primaryActiveFg?.value) {
                fgColor = convertColorToHex(profile.palette.primaryActiveFg.value);
            }

            swatch.style.backgroundColor = bgColor;
            swatch.style.color = fgColor;
            swatch.textContent = 'Sample';

            el.appendChild(nameContainer);
            el.appendChild(swatch);
            el.onclick = () => selectProfile(name);
            listContainer.appendChild(el);
        });
    }

    // Attach Add Handler
    const addBtn = document.querySelector('[data-action="addProfile"]');
    if (addBtn) {
        (addBtn as HTMLElement).onclick = () => addNewProfile();
    }

    // Render the selected profile if one exists
    if (selectedProfileName && profiles && profiles[selectedProfileName]) {
        renderProfileEditor(selectedProfileName, profiles[selectedProfileName]);
        initializeProfileEditorCheckboxListeners();
    }
}

function selectProfile(name: string) {
    selectedProfileName = name;
    try {
        localStorage.setItem('selectedProfileName', name);
    } catch {}
    renderProfiles(currentConfig.advancedProfiles); // Re-render list to update selection

    // Explicitly show editor sections
    const editorTop = document.getElementById('profileEditorTop');
    const editorBottom = document.getElementById('profileEditorBottom');
    if (editorTop) {
        editorTop.style.visibility = 'visible';
        editorTop.style.opacity = '1';
    }
    if (editorBottom) {
        editorBottom.style.visibility = 'visible';
        editorBottom.style.opacity = '1';
    }

    const profile = currentConfig.advancedProfiles[name];
    renderProfileEditor(name, profile);
    initializeProfileEditorCheckboxListeners();
}

/**
 * Checks if a string is a valid HTML color name.
 * Returns true if it's a color, false otherwise.
 */
function isHtmlColor(str: string): boolean {
    if (!str) return false;
    const s = new Option().style;
    s.color = str;
    return s.color !== '';
}

function addNewProfile() {
    let name = 'Profile ' + (Object.keys(currentConfig.advancedProfiles || {}).length + 1);

    // Ensure the generated name is not a valid HTML color
    let counter = Object.keys(currentConfig.advancedProfiles || {}).length + 1;
    while (isHtmlColor(name)) {
        counter++;
        name = 'Profile ' + counter;
    }

    if (!currentConfig.advancedProfiles) currentConfig.advancedProfiles = {};

    currentConfig.advancedProfiles[name] = {
        palette: JSON.parse(JSON.stringify(DEFAULT_PALETTE)),
        mappings: JSON.parse(JSON.stringify(DEFAULT_MAPPINGS)),
    };

    saveProfiles();
    selectProfile(name);
}

/**
 * Count how many mappings in a section have non-None values
 */
function countActiveMappings(profile: AdvancedProfile, sectionKeys: string[]): number {
    let count = 0;
    sectionKeys.forEach((key: string) => {
        const mappingValue = profile.mappings[key];
        let slot: string;

        if (typeof mappingValue === 'string') {
            slot = mappingValue || 'none';
        } else if (mappingValue) {
            slot = mappingValue.slot || 'none';
        } else {
            slot = 'none';
        }

        if (slot !== 'none') {
            count++;
        }
    });
    return count;
}

/**
 * Count total active mappings across all sections in a profile
 */
function countTotalActiveMappings(profile: AdvancedProfile): number {
    let total = 0;
    Object.keys(profile.mappings || {}).forEach((key: string) => {
        const mappingValue = profile.mappings[key];
        let slot: string;

        if (typeof mappingValue === 'string') {
            slot = mappingValue || 'none';
        } else if (mappingValue) {
            slot = mappingValue.slot || 'none';
        } else {
            slot = 'none';
        }

        if (slot !== 'none') {
            total++;
        }
    });
    return total;
}

/**
 * Sets up the palette generator wand button and dropdown menu
 */
function setupPaletteGenerator() {
    const generatorBtn = document.getElementById('paletteGeneratorBtn');
    const dropdown = document.getElementById('paletteGeneratorDropdown');

    if (!generatorBtn || !dropdown) return;

    // Toggle dropdown on button click
    generatorBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display !== 'none';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!generatorBtn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.style.display = 'none';
        }
    });

    // Handle algorithm selection
    const algorithmOptions = dropdown.querySelectorAll('.palette-algorithm-option');
    algorithmOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
            const algorithm = (e.target as HTMLElement).getAttribute('data-algorithm');
            if (algorithm && selectedProfileName) {
                generatePalette(algorithm);
                dropdown.style.display = 'none';
            }
        });
    });
}

// Store previous palette for undo functionality
let previousPalette: any = null;

/**
 * Generates a pleasing color palette and updates the current profile
 */
function generatePalette(algorithm: string) {
    if (!selectedProfileName || !currentConfig.advancedProfiles[selectedProfileName]) {
        return;
    }

    const profile = currentConfig.advancedProfiles[selectedProfileName];
    const primaryBg = profile.palette.primaryActiveBg?.value;

    if (!primaryBg) {
        console.warn('Cannot generate palette: No primary background color defined');
        return;
    }

    // Store current palette for undo
    previousPalette = JSON.parse(JSON.stringify(profile.palette));

    // Send message to extension to generate palette
    vscode.postMessage({
        command: 'generatePalette',
        data: {
            paletteData: {
                profileName: selectedProfileName,
                primaryBg: primaryBg,
                algorithm: algorithm,
            },
        },
    });
}

/**
 * Handles the paletteGenerated message from the extension
 */
function handlePaletteGenerated(data: { advancedProfiles: any; generatedPalette: any; profileName: string }) {
    // Update current config with the new profiles
    currentConfig.advancedProfiles = data.advancedProfiles;

    // Show the toast with generated palette styling
    showPaletteToast(data.generatedPalette);

    // Re-render the profile editor to show the new palette
    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
        renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
    }
}

/**
 * Shows the palette toast notification with styling from generated palette
 */
function showPaletteToast(generatedPalette: any) {
    const toast = document.getElementById('paletteToast');
    const acceptBtn = document.getElementById('paletteToastAccept');
    const undoBtn = document.getElementById('paletteToastUndo');

    if (!toast || !acceptBtn || !undoBtn) {
        return;
    }

    // Style the toast border with tertiary background
    toast.style.borderColor = generatedPalette.tertiaryActiveBg;

    // Style Accept button with primary colors
    acceptBtn.style.backgroundColor = generatedPalette.primaryActiveBg;
    acceptBtn.style.color = generatedPalette.primaryActiveFg;

    // Style Undo button with secondary colors
    undoBtn.style.backgroundColor = generatedPalette.secondaryActiveBg;
    undoBtn.style.color = generatedPalette.secondaryActiveFg;

    // Show the toast
    toast.style.display = 'flex';
}

/**
 * Hides the palette toast notification
 */
function hidePaletteToast() {
    const toast = document.getElementById('paletteToast');
    if (toast) {
        toast.style.display = 'none';
    }
}

/**
 * Sets up the palette toast event handlers
 */
function setupPaletteToast() {
    const acceptBtn = document.getElementById('paletteToastAccept');
    const undoBtn = document.getElementById('paletteToastUndo');

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            // Accept the changes - just hide the toast
            hidePaletteToast();
            previousPalette = null;
        });
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            // Restore the previous palette
            if (previousPalette && selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                currentConfig.advancedProfiles[selectedProfileName].palette = previousPalette;
                saveProfiles();
                renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
                previousPalette = null;
            }
            hidePaletteToast();
        });
    }
}

function renderProfileEditor(name: string, profile: AdvancedProfile) {
    // Name Input
    const nameInput = document.getElementById('profileNameInput') as HTMLInputElement;
    if (nameInput) {
        nameInput.value = name;
        // Handle name change
        nameInput.onchange = (e) => renameProfile(name, (e.target as HTMLInputElement).value);
    }

    // Wire up action buttons
    const deleteBtn = document.querySelector('[data-action="deleteProfile"]') as HTMLElement;
    if (deleteBtn) {
        deleteBtn.onclick = () => deleteProfile(name);
    }

    const duplicateBtn = document.querySelector('[data-action="duplicateProfile"]') as HTMLElement;
    if (duplicateBtn) {
        duplicateBtn.onclick = () => duplicateProfile(name);
    }

    // Wire up palette generator
    setupPaletteGenerator();
    setupPaletteToast();

    // Palette Editor
    const paletteGrid = document.getElementById('paletteEditor');
    if (paletteGrid) {
        paletteGrid.innerHTML = '';

        // Migrate old terminalBg/terminalFg to tertiaryBg/tertiaryFg
        if ((profile.palette as any).terminalBg && !profile.palette.tertiaryBg) {
            profile.palette.tertiaryBg = (profile.palette as any).terminalBg;
            delete (profile.palette as any).terminalBg;
        }
        if ((profile.palette as any).terminalFg && !profile.palette.tertiaryFg) {
            profile.palette.tertiaryFg = (profile.palette as any).terminalFg;
            delete (profile.palette as any).terminalFg;
        }

        // Ensure all palette slots exist (migration for older profiles)
        if (!profile.palette.tertiaryBg) {
            profile.palette.tertiaryBg = DEFAULT_PALETTE.tertiaryBg;
        }
        if (!profile.palette.tertiaryFg) {
            profile.palette.tertiaryFg = DEFAULT_PALETTE.tertiaryFg;
        }
        if (!profile.palette.quaternaryBg) {
            profile.palette.quaternaryBg = DEFAULT_PALETTE.quaternaryBg;
        }
        if (!profile.palette.quaternaryFg) {
            profile.palette.quaternaryFg = DEFAULT_PALETTE.quaternaryFg;
        }

        // Define groups with their respective pairs
        const paletteGroups = [
            {
                name: 'Primary',
                slots: ['primaryActiveBg', 'primaryActiveFg', 'primaryInactiveBg', 'primaryInactiveFg'],
            },
            {
                name: 'Secondary',
                slots: ['secondaryActiveBg', 'secondaryActiveFg', 'secondaryInactiveBg', 'secondaryInactiveFg'],
            },
            { name: 'Tertiary', slots: ['tertiaryBg', 'tertiaryFg'] },
            { name: 'Quaternary', slots: ['quaternaryBg', 'quaternaryFg'] },
        ];

        // Render each group with a border
        paletteGroups.forEach((group) => {
            // Create group container
            const groupContainer = document.createElement('div');
            groupContainer.className = 'palette-group';

            // Create grid for this group's pairs
            const groupGrid = document.createElement('div');
            groupGrid.className = 'palette-group-grid';

            // Process pairs within this group
            for (let i = 0; i < group.slots.length; i += 2) {
                const bgKey = group.slots[i];
                const fgKey = group.slots[i + 1];

                if (!bgKey || !fgKey) continue;

                const bgDef = profile.palette[bgKey];
                const fgDef = profile.palette[fgKey];

                if (!bgDef || !fgDef) continue;

                // Create combined swatch showing Bg + Fg together
                const swatch = document.createElement('div');
                swatch.className = 'palette-pair-swatch';
                updatePairSwatch(swatch, bgDef.value || '#000000', fgDef.value || '#FFFFFF');

                // Create wrapper for Bg+Fg pair
                const pairWrapper = document.createElement('div');
                pairWrapper.className = 'palette-pair-wrapper';

                // Create Bg slot element
                const bgEl = createPaletteSlotElement(bgKey, bgDef, (newDef) => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        currentConfig.advancedProfiles[selectedProfileName].palette[bgKey] = newDef;
                        saveProfiles();
                        // Update the combined swatch
                        updatePairSwatch(swatch, newDef.value || '#000000', fgDef.value || '#FFFFFF');
                    }
                });

                // Create Fg slot element
                const fgEl = createPaletteSlotElement(fgKey, fgDef, (newDef) => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        currentConfig.advancedProfiles[selectedProfileName].palette[fgKey] = newDef;
                        saveProfiles();
                        // Update the combined swatch
                        updatePairSwatch(swatch, bgDef.value || '#000000', newDef.value || '#FFFFFF');
                    }
                });

                pairWrapper.appendChild(bgEl);
                pairWrapper.appendChild(fgEl);

                // Append to group grid: wrapper (col 1-2) | swatch (col 3)
                groupGrid.appendChild(pairWrapper);
                groupGrid.appendChild(swatch);
            }

            groupContainer.appendChild(groupGrid);
            paletteGrid.appendChild(groupContainer);
        });
    }

    // Mappings Editor (Tabbed)
    const mappingsContainer = document.getElementById('mappingsEditor');
    if (mappingsContainer) {
        mappingsContainer.innerHTML = '';

        // 1. Create Tab Headers
        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'mapping-tabs-header';
        tabsHeader.style.display = 'flex';
        tabsHeader.style.gap = '5px';
        tabsHeader.style.marginBottom = '10px';
        tabsHeader.style.overflowX = 'auto';
        tabsHeader.style.borderBottom = '1px solid var(--vscode-panel-border)';

        const tabsContent = document.createElement('div');
        tabsContent.className = 'mapping-tabs-content';

        let firstTab = true;
        let tabToActivate: HTMLButtonElement | null = null;

        // Helper function to build the "Colored" tab content
        const buildColoredTabContent = (): string[] => {
            const coloredKeys: string[] = [];
            if (selectedProfileName && currentConfig?.advancedProfiles?.[selectedProfileName]) {
                const mappings = currentConfig.advancedProfiles[selectedProfileName].mappings;
                // Gather all keys from all sections that have a mapping defined (including 'none')
                // The Colored tab should show all elements the user has explicitly configured
                Object.keys(SECTION_DEFINITIONS).forEach((sectionName) => {
                    const sectionKeys = SECTION_DEFINITIONS[sectionName];
                    sectionKeys.forEach((key) => {
                        const mappingValue = mappings[key];
                        // Include any key that has a defined mapping (even if it's 'none')
                        if (mappingValue !== undefined) {
                            coloredKeys.push(key);
                        }
                    });
                });
            }
            return coloredKeys;
        };

        // Helper function to build the "Starred" tab content
        const buildStarredTabContent = (): string[] => {
            return starredKeys;
        };

        // Create array of all tabs (regular sections + Colored + Starred)
        const allTabs = [...Object.keys(SECTION_DEFINITIONS), 'Colored', 'Starred'];

        allTabs.forEach((sectionName) => {
            // Determine keys for this tab
            const keys =
                sectionName === 'Colored'
                    ? buildColoredTabContent()
                    : sectionName === 'Starred'
                      ? buildStarredTabContent()
                      : SECTION_DEFINITIONS[sectionName];

            // Count active mappings in this section
            const activeCount = countActiveMappings(profile, keys);

            // Tab Button
            const tabBtn = document.createElement('button');
            tabBtn.className = 'mapping-tab-btn';

            // Tab text
            const tabText = document.createElement('span');
            if (sectionName === 'Colored') {
                tabText.textContent = '\u26a1 ' + sectionName;
                tabText.style.fontStyle = 'italic';
            } else if (sectionName === 'Starred') {
                tabText.textContent = '\u2605 ' + sectionName; // ★ star symbol
                tabText.style.fontStyle = 'italic';
            } else {
                tabText.textContent = sectionName;
            }
            tabBtn.appendChild(tabText);

            // Badge with count (only show if > 0)
            if (activeCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'mapping-tab-badge';

                // For Starred tab, make badge yellow if any starred keys are not colored
                let isStarredWithUncolored = false;
                if (sectionName === 'Starred') {
                    const uncoloredCount = keys.length - activeCount;
                    if (uncoloredCount > 0) {
                        isStarredWithUncolored = true;
                        badge.style.backgroundColor = '#ccaa00'; // Yellow
                        badge.style.color = '#000000'; // Black text for contrast
                        badge.title = `${activeCount} colored, ${uncoloredCount} not colored`;

                        // Add warning icon
                        const warningIcon = document.createElement('span');
                        warningIcon.className = 'codicon codicon-warning';
                        warningIcon.style.marginRight = '4px';
                        badge.appendChild(warningIcon);

                        // Show "colored/uncolored" format
                        const badgeText = document.createTextNode(`${activeCount}/${uncoloredCount}`);
                        badge.appendChild(badgeText);
                    } else {
                        // All starred keys are colored
                        badge.title = `${activeCount} colored`;
                    }
                } else {
                    // Tooltip for regular tabs
                    badge.title = `${activeCount} element${activeCount === 1 ? '' : 's'} colored`;
                }

                // Add normal badge text if not a starred tab with uncolored items
                if (!isStarredWithUncolored) {
                    const badgeText = document.createTextNode(activeCount.toString());
                    badge.appendChild(badgeText);
                }

                tabBtn.appendChild(badge);
            }
            tabBtn.style.padding = '5px 10px';
            tabBtn.style.background = 'transparent';
            tabBtn.style.border = 'none';
            tabBtn.style.color = 'var(--vscode-foreground)';
            tabBtn.style.cursor = 'pointer';
            tabBtn.style.borderBottom = '2px solid transparent';

            // Check if this tab should be active (either it was selected before, or it's the first tab)
            const shouldActivate = selectedMappingTab === sectionName || (firstTab && !selectedMappingTab);
            if (shouldActivate) {
                tabToActivate = tabBtn;
                if (!selectedMappingTab) selectedMappingTab = sectionName; // Set initial tab
            }

            tabBtn.onclick = () => {
                // Track the selected tab
                selectedMappingTab = sectionName;

                // Special handling for Colored and Starred tabs - rebuild content
                if (sectionName === 'Colored' || sectionName === 'Starred') {
                    // For Colored tab, clean up mappings that are explicitly set to 'none'
                    if (
                        sectionName === 'Colored' &&
                        selectedProfileName &&
                        currentConfig?.advancedProfiles?.[selectedProfileName]
                    ) {
                        const mappings = currentConfig.advancedProfiles[selectedProfileName].mappings;
                        Object.keys(mappings).forEach((key) => {
                            const value = mappings[key];
                            const slot = typeof value === 'string' ? value : value?.slot;
                            if (slot === 'none') {
                                delete mappings[key];
                            }
                        });
                        saveProfiles();
                    }

                    // Deactivate all
                    Array.from(tabsHeader.children).forEach((c: any) => {
                        c.style.borderBottomColor = 'transparent';
                        c.style.fontWeight = 'normal';
                    });
                    Array.from(tabsContent.children).forEach((c: any) => (c.style.display = 'none'));

                    // Activate self
                    tabBtn.style.borderBottomColor = 'var(--vscode-panelTitle-activeBorder)';
                    tabBtn.style.fontWeight = 'bold';

                    // Trigger re-render to rebuild tab content
                    if (selectedProfileName && currentConfig?.advancedProfiles?.[selectedProfileName]) {
                        renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
                    }
                } else {
                    // Regular tab behavior
                    // Deactivate all
                    Array.from(tabsHeader.children).forEach((c: any) => {
                        c.style.borderBottomColor = 'transparent';
                        c.style.fontWeight = 'normal';
                    });
                    Array.from(tabsContent.children).forEach((c: any) => (c.style.display = 'none'));

                    // Activate self
                    tabBtn.style.borderBottomColor = 'var(--vscode-panelTitle-activeBorder)';
                    tabBtn.style.fontWeight = 'bold';

                    const content = document.getElementById('mapping-section-' + sectionName.replace(/\s+/g, '-'));
                    if (content) content.style.display = 'block';
                }
            };

            tabsHeader.appendChild(tabBtn);

            // Tab Content
            const contentDiv = document.createElement('div');
            contentDiv.id = 'mapping-section-' + sectionName.replace(/\s+/g, '-');
            const shouldShow = selectedMappingTab === sectionName || (firstTab && !selectedMappingTab);
            contentDiv.style.display = shouldShow ? 'block' : 'none';
            firstTab = false;

            // Use 2-column grid layout
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr 1px 1fr';
            grid.style.gap = '8px 20px';
            grid.style.padding = '10px 10px';

            // Special handling for empty Colored tab
            if (sectionName === 'Colored' && keys.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = 'No color mappings yet. Assign colors in other tabs to see them here.';
                emptyMsg.style.gridColumn = '1 / -1';
                emptyMsg.style.padding = '20px';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = 'var(--vscode-descriptionForeground)';
                emptyMsg.style.fontStyle = 'italic';
                grid.appendChild(emptyMsg);
            }

            // Special handling for empty Starred tab
            if (sectionName === 'Starred' && keys.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent =
                    'No starred keys yet. Click the star icon next to any mapping key to add it here.';
                emptyMsg.style.gridColumn = '1 / -1';
                emptyMsg.style.padding = '20px';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = 'var(--vscode-descriptionForeground)';
                emptyMsg.style.fontStyle = 'italic';
                grid.appendChild(emptyMsg);
            }

            keys.forEach((key: string) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';

                // Add star icon
                const starIcon = document.createElement('span');
                const isStarred = starredKeys.includes(key);
                starIcon.className = `codicon ${isStarred ? 'codicon-star-full' : 'codicon-star-empty'}`;
                starIcon.style.cursor = 'pointer';
                starIcon.style.color = isStarred
                    ? 'var(--vscode-icon-foreground)'
                    : 'var(--vscode-descriptionForeground)';
                starIcon.title = isStarred ? 'Unstar this key' : 'Star this key';
                starIcon.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleStarredKey(key);
                };

                const label = document.createElement('label');
                label.textContent = THEME_KEY_LABELS[key] || key;
                label.style.fontSize = '12px';
                label.style.color = 'var(--vscode-foreground)';
                label.style.minWidth = '200px';
                label.style.flexShrink = '0';

                // Get current mapping value (handle both string and object formats)
                const mappingValue = profile.mappings[key];
                let currentSlot: string;
                let currentOpacity: number | undefined;
                let currentFixedColor: string | undefined;

                if (typeof mappingValue === 'string') {
                    currentSlot = mappingValue || 'none';
                    currentOpacity = undefined;
                    currentFixedColor = undefined;
                } else if (mappingValue) {
                    currentSlot = mappingValue.slot || 'none';
                    currentOpacity = mappingValue.opacity;
                    currentFixedColor = mappingValue.fixedColor;
                } else {
                    currentSlot = 'none';
                    currentOpacity = undefined;
                    currentFixedColor = undefined;
                }

                // Debug: Check what slot was determined
                if (currentSlot !== 'none') {
                    console.log(`[Mapping Debug] ${key}: currentSlot = ${currentSlot}`);
                }

                // Container for dropdown (and potentially fixed color picker)
                const dropdownContainer = document.createElement('div');
                dropdownContainer.style.flex = '1';
                dropdownContainer.style.display = 'flex';
                dropdownContainer.style.gap = '8px';
                dropdownContainer.style.alignItems = 'center';

                // Create custom dropdown with color swatches
                const select = document.createElement('div');
                select.className = 'custom-dropdown';
                select.title = `Select palette color for ${key}`;
                select.setAttribute('data-value', currentSlot);
                select.setAttribute('data-mapping-key', key);
                select.setAttribute('tabindex', '0');
                select.setAttribute('role', 'combobox');
                select.setAttribute('aria-expanded', 'false');
                select.style.flex = '1';
                select.style.minWidth = '200px';
                select.style.position = 'relative';
                select.style.cursor = 'pointer';

                // Add drop event handlers
                select.addEventListener('dragover', (e: DragEvent) => {
                    e.preventDefault();
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'copy';
                    }
                    select.classList.add('drag-hover');
                });

                select.addEventListener('dragleave', () => {
                    select.classList.remove('drag-hover');
                });

                select.addEventListener('drop', (e: DragEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    select.classList.remove('drag-hover');

                    if (!e.dataTransfer) return;

                    const slotName =
                        e.dataTransfer.getData('application/x-palette-slot') || e.dataTransfer.getData('text/plain');
                    if (!slotName) return;

                    // Set the dropdown value
                    select.setAttribute('data-value', slotName);
                    (select as any).value = slotName;

                    // Trigger change event to update mapping
                    const changeEvent = new Event('change', { bubbles: true });
                    select.dispatchEvent(changeEvent);
                });

                // Selected value display
                const selectedDisplay = document.createElement('div');
                selectedDisplay.className = 'dropdown-selected';
                selectedDisplay.style.background = 'var(--vscode-dropdown-background)';
                selectedDisplay.style.color = 'var(--vscode-dropdown-foreground)';
                selectedDisplay.style.border = '1px solid var(--vscode-dropdown-border)';
                selectedDisplay.style.padding = '4px 20px 4px 4px';
                selectedDisplay.style.fontSize = '12px';
                selectedDisplay.style.display = 'flex';
                selectedDisplay.style.alignItems = 'center';
                selectedDisplay.style.gap = '6px';
                selectedDisplay.style.position = 'relative';

                // Arrow indicator
                const arrow = document.createElement('span');
                arrow.textContent = '▼';
                arrow.style.position = 'absolute';
                arrow.style.right = '4px';
                arrow.style.fontSize = '8px';
                arrow.style.pointerEvents = 'none';
                selectedDisplay.appendChild(arrow);

                // Dropdown options container
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'dropdown-options';
                optionsContainer.style.display = 'none';
                optionsContainer.style.position = 'absolute';
                optionsContainer.style.top = '100%';
                optionsContainer.style.left = '0';
                optionsContainer.style.right = '0';
                optionsContainer.style.background = 'var(--vscode-dropdown-background)';
                optionsContainer.style.border = '1px solid var(--vscode-dropdown-border)';
                optionsContainer.style.maxHeight = '200px';
                optionsContainer.style.overflowY = 'auto';
                optionsContainer.style.zIndex = '1000';
                optionsContainer.style.marginTop = '2px';

                // Build options
                type DropdownOption = { value: string; label: string; color?: string; isSeparator?: boolean };
                const options: DropdownOption[] = [];

                // Basic section
                options.push({ value: '', label: 'Basic', isSeparator: true });

                // Add 'none' option
                options.push({ value: 'none', label: 'None' });

                // Add 'Fixed Color' option
                options.push({ value: '__fixed__', label: 'Fixed Color' });

                // Palette Colors section
                options.push({ value: '', label: 'Palette Colors', isSeparator: true });

                // Add palette slot options (filtered)
                const allPaletteOptions = Object.keys(profile.palette);
                const filteredPaletteOptions = getFilteredPaletteOptions(key, allPaletteOptions, currentSlot);

                // Debug: Check if current slot is in the filtered options
                if (currentSlot !== 'none' && currentSlot !== '__fixed__') {
                    const isInFiltered = filteredPaletteOptions.includes(currentSlot);
                    console.log(
                        `[Mapping Debug] ${key}: currentSlot "${currentSlot}" in filtered options?`,
                        isInFiltered,
                    );
                    if (!isInFiltered) {
                        console.log(`[Mapping Debug] ${key}: filtered options =`, filteredPaletteOptions);
                        console.log(`[Mapping Debug] ${key}: all options =`, allPaletteOptions);
                    }
                }

                filteredPaletteOptions.forEach((opt) => {
                    const label = PALETTE_SLOT_LABELS[opt] || opt.charAt(0).toUpperCase() + opt.slice(1);
                    const slotDef = profile.palette[opt];
                    const color = slotDef && slotDef.value ? convertColorToHex(slotDef.value) : undefined;
                    options.push({ value: opt, label, color });

                    if (opt === currentSlot) {
                        console.log(`[Mapping Debug] ${key}: Selected option "${opt}"`);
                    }
                });

                // Helper to create option element
                const createOptionElement = (opt: DropdownOption, isSelected: boolean, index: number) => {
                    if (opt.isSeparator) {
                        const separatorDiv = document.createElement('div');
                        separatorDiv.textContent = opt.label;
                        separatorDiv.className = 'dropdown-separator';
                        separatorDiv.style.padding = '4px 8px';
                        separatorDiv.style.fontWeight = 'bold';
                        separatorDiv.style.fontSize = '11px';
                        // Use picker group colors for better visibility/theming
                        separatorDiv.style.color = 'var(--vscode-pickerGroup-foreground)';
                        separatorDiv.style.borderBottom = '1px solid var(--vscode-pickerGroup-border)';

                        // Add margin for separation (except first item)
                        separatorDiv.style.marginTop = index > 0 ? '8px' : '2px';
                        separatorDiv.style.marginBottom = '2px';

                        separatorDiv.style.textTransform = 'uppercase';
                        separatorDiv.style.pointerEvents = 'none'; // Make unclickable
                        return separatorDiv;
                    }

                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'dropdown-option';
                    optionDiv.setAttribute('data-value', opt.value);
                    optionDiv.style.padding = '4px 8px';
                    optionDiv.style.cursor = 'pointer';
                    optionDiv.style.display = 'flex';
                    optionDiv.style.alignItems = 'center';
                    optionDiv.style.gap = '8px';
                    optionDiv.style.fontSize = '12px';
                    optionDiv.style.whiteSpace = 'nowrap';

                    if (isSelected) {
                        optionDiv.style.background = 'var(--vscode-list-activeSelectionBackground)';
                        optionDiv.style.color = 'var(--vscode-list-activeSelectionForeground)';
                    }

                    // Add color swatch if available
                    if (opt.color) {
                        const swatch = document.createElement('div');
                        swatch.style.width = '16px';
                        swatch.style.height = '16px';
                        swatch.style.background = opt.color;
                        swatch.style.border = '1px solid var(--vscode-panel-border)';
                        swatch.style.borderRadius = '2px';
                        swatch.style.flexShrink = '0';
                        optionDiv.appendChild(swatch);
                    }

                    const text = document.createElement('span');
                    text.textContent = opt.label;
                    text.style.whiteSpace = 'nowrap';
                    optionDiv.appendChild(text);

                    // Hover effect
                    optionDiv.addEventListener('mouseenter', () => {
                        if (!isSelected) {
                            optionDiv.style.background = 'var(--vscode-list-hoverBackground)';
                        }
                    });
                    optionDiv.addEventListener('mouseleave', () => {
                        if (!isSelected) {
                            optionDiv.style.background = '';
                        }
                    });

                    return optionDiv;
                };

                // Update selected display
                const updateSelectedDisplay = (value: string) => {
                    const opt = options.find((o) => o.value === value);
                    if (!opt) return;

                    // Clear current content (except arrow)
                    while (selectedDisplay.firstChild && selectedDisplay.firstChild !== arrow) {
                        selectedDisplay.removeChild(selectedDisplay.firstChild);
                    }

                    // Add color swatch if available
                    if (opt.color) {
                        const swatch = document.createElement('div');
                        swatch.style.width = '16px';
                        swatch.style.height = '16px';
                        swatch.style.background = opt.color;
                        swatch.style.border = '1px solid var(--vscode-panel-border)';
                        swatch.style.borderRadius = '2px';
                        swatch.style.flexShrink = '0';
                        selectedDisplay.insertBefore(swatch, arrow);
                    }

                    // Add text
                    const text = document.createElement('span');
                    text.textContent = opt.label;
                    selectedDisplay.insertBefore(text, arrow);
                };

                // Populate options container
                options.forEach((opt, index) => {
                    const optionElement = createOptionElement(opt, opt.value === currentSlot, index);
                    if (!opt.isSeparator) {
                        optionElement.addEventListener('click', (e) => {
                            e.stopPropagation();
                            select.setAttribute('data-value', opt.value);
                            updateSelectedDisplay(opt.value);
                            optionsContainer.style.display = 'none';
                            select.setAttribute('aria-expanded', 'false');

                            // Trigger change event
                            const changeEvent = new Event('change', { bubbles: true });
                            select.dispatchEvent(changeEvent);
                        });
                    }
                    optionsContainer.appendChild(optionElement);
                });

                // Close on outside click handler
                let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

                // Toggle dropdown
                selectedDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = optionsContainer.style.display === 'block';

                    if (isOpen) {
                        optionsContainer.style.display = 'none';
                        select.setAttribute('aria-expanded', 'false');
                        // Remove outside click handler when closing
                        if (outsideClickHandler) {
                            document.removeEventListener('click', outsideClickHandler);
                            outsideClickHandler = null;
                        }
                    } else {
                        optionsContainer.style.display = 'block';
                        select.setAttribute('aria-expanded', 'true');
                        // Add outside click handler when opening
                        outsideClickHandler = (e: MouseEvent) => {
                            if (!select.contains(e.target as Node)) {
                                optionsContainer.style.display = 'none';
                                select.setAttribute('aria-expanded', 'false');
                                if (outsideClickHandler) {
                                    document.removeEventListener('click', outsideClickHandler);
                                    outsideClickHandler = null;
                                }
                            }
                        };
                        // Use setTimeout to avoid immediate triggering
                        setTimeout(() => {
                            if (outsideClickHandler) {
                                document.addEventListener('click', outsideClickHandler);
                            }
                        }, 0);
                    }
                });

                // Keyboard support
                select.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectedDisplay.click();
                    }
                });

                // Initialize display
                updateSelectedDisplay(currentSlot);

                select.appendChild(selectedDisplay);
                select.appendChild(optionsContainer);

                // Helper to get value like a select element
                (select as any).value = currentSlot;
                Object.defineProperty(select, 'value', {
                    get() {
                        return this.getAttribute('data-value');
                    },
                    set(val) {
                        this.setAttribute('data-value', val);
                        updateSelectedDisplay(val);
                    },
                });

                // Create fixed color picker (hidden by default)
                const fixedColorPicker = document.createElement('div');
                fixedColorPicker.style.display = currentSlot === '__fixed__' ? 'flex' : 'none';
                fixedColorPicker.style.alignItems = 'center';
                fixedColorPicker.style.gap = '5px';
                fixedColorPicker.style.flex = '1';

                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.className = 'native-color-input';
                colorInput.value = convertColorToHex(currentFixedColor || '#4A90E2');
                colorInput.title = 'Select color';

                const randomBtn = document.createElement('button');
                randomBtn.className = 'random-color-btn';
                randomBtn.textContent = '🎲';
                randomBtn.title = 'Generate random color';
                randomBtn.style.flexShrink = '0';

                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.className = 'color-input text-input';
                textInput.value = currentFixedColor || '#4A90E2';
                textInput.placeholder = 'e.g., blue, #4A90E2';
                textInput.style.flex = '1';
                textInput.style.minWidth = '50px';
                textInput.style.maxWidth = '90px';

                fixedColorPicker.appendChild(randomBtn);
                fixedColorPicker.appendChild(colorInput);
                fixedColorPicker.appendChild(textInput);

                // Update select width when fixed color is shown/hidden
                const updateSelectWidth = () => {
                    if (select.getAttribute('data-value') === '__fixed__') {
                        select.style.flex = '0 0 95px';
                        select.style.width = '95px';
                        fixedColorPicker.style.display = 'flex';
                    } else {
                        select.style.flex = '1';
                        select.style.minWidth = 'auto';
                        fixedColorPicker.style.display = 'none';
                    }
                };
                updateSelectWidth();

                dropdownContainer.appendChild(select);
                dropdownContainer.appendChild(fixedColorPicker);

                // Opacity control
                const opacityContainer = document.createElement('div');
                opacityContainer.style.display = 'flex';
                opacityContainer.style.alignItems = 'center';
                opacityContainer.style.gap = '6px';
                opacityContainer.style.minWidth = '140px';

                const opacityLabel = document.createElement('span');
                opacityLabel.textContent = 'α:';
                opacityLabel.style.fontSize = '11px';
                opacityLabel.style.color = 'var(--vscode-descriptionForeground)';

                const opacitySlider = document.createElement('input');
                opacitySlider.type = 'range';
                opacitySlider.className = 'opacity-slider';
                opacitySlider.min = '0';
                opacitySlider.max = '100';
                opacitySlider.step = '5';
                const initialOpacity = currentOpacity !== undefined ? currentOpacity : 1;
                opacitySlider.value = Math.round(initialOpacity * 100).toString();
                opacitySlider.style.flex = '1';
                opacitySlider.style.minWidth = '70px';

                // Get the color from the selected palette slot to create gradient
                const updateSliderGradient = () => {
                    const slotName = select.getAttribute('data-value') || 'none';
                    if (slotName === 'none') {
                        // Disable and gray out opacity controls when 'none' is selected
                        opacitySlider.disabled = true;
                        opacitySlider.style.opacity = '0.4';
                        opacitySlider.style.cursor = 'not-allowed';
                        opacitySlider.style.setProperty('--slider-color', '#808080');
                        opacityValue.style.opacity = '0.4';
                        opacityLabel.style.opacity = '0.4';
                    } else {
                        // Enable opacity controls
                        opacitySlider.disabled = false;
                        opacitySlider.style.opacity = '1';
                        opacitySlider.style.cursor = 'pointer';
                        opacityValue.style.opacity = '1';
                        opacityLabel.style.opacity = '1';

                        if (slotName === '__fixed__') {
                            // Use the fixed color
                            const color = convertColorToHex(textInput.value);
                            opacitySlider.style.setProperty('--slider-color', color);
                        } else if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                            const profile = currentConfig.advancedProfiles[selectedProfileName];
                            const slotDef = profile.palette[slotName];
                            if (slotDef && slotDef.value) {
                                const color = convertColorToHex(slotDef.value);
                                opacitySlider.style.setProperty('--slider-color', color);
                            }
                        }
                    }
                };

                const opacityValue = document.createElement('span');
                opacityValue.textContent = Math.round(initialOpacity * 100) + '%';
                opacityValue.style.fontSize = '11px';
                opacityValue.style.minWidth = '35px';
                opacityValue.style.color = 'var(--vscode-descriptionForeground)';

                // Call after all elements are created
                updateSliderGradient();

                opacityContainer.appendChild(opacityLabel);
                opacityContainer.appendChild(opacitySlider);
                opacityContainer.appendChild(opacityValue);

                // Update function for both select and opacity
                const updateMapping = () => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        const newSlot = select.getAttribute('data-value') || 'none';
                        const newOpacity = parseInt(opacitySlider.value) / 100;

                        if (newSlot === 'none') {
                            // Store 'none' explicitly to keep it in the Colored tab
                            currentConfig.advancedProfiles[selectedProfileName].mappings[key] = 'none';
                        } else if (newSlot === '__fixed__') {
                            // Store fixed color
                            const mappingData: MappingValue = {
                                slot: '__fixed__',
                                fixedColor: textInput.value,
                            };
                            if (newOpacity < 1 && newOpacity >= 0) {
                                mappingData.opacity = newOpacity;
                            }
                            currentConfig.advancedProfiles[selectedProfileName].mappings[key] = mappingData;
                        } else {
                            // Only store opacity if it's not 1.0 (default)
                            if (newOpacity < 1 && newOpacity >= 0) {
                                currentConfig.advancedProfiles[selectedProfileName].mappings[key] = {
                                    slot: newSlot,
                                    opacity: newOpacity,
                                };
                            } else {
                                // Store as simple string for backwards compatibility when opacity is 1.0
                                currentConfig.advancedProfiles[selectedProfileName].mappings[key] = newSlot;
                            }
                        }
                        saveProfiles();
                    }
                };

                // Update display value when slider changes
                opacitySlider.oninput = () => {
                    opacityValue.textContent = opacitySlider.value + '%';
                };

                // Fixed color picker event handlers
                colorInput.onchange = () => {
                    textInput.value = colorInput.value;
                    updateMapping();
                    updateSliderGradient();
                };

                randomBtn.onclick = () => {
                    const randomColor = getThemeAppropriateColor();
                    textInput.value = randomColor;
                    colorInput.value = convertColorToHex(randomColor);
                    updateMapping();
                    updateSliderGradient();
                };

                textInput.oninput = () => {
                    const hexColor = convertColorToHex(textInput.value);
                    if (hexColor) {
                        colorInput.value = hexColor;
                    }
                };

                textInput.onchange = () => {
                    updateMapping();
                    updateSliderGradient();
                };

                select.onchange = () => {
                    updateSelectWidth();
                    updateMapping();
                    updateSliderGradient();

                    const newSlot = select.getAttribute('data-value') || 'none';
                    const keysToSync: string[] = [];

                    // Only sync if the selected slot is congruous with the current key
                    // This prevents syncing when user intentionally selects incongruous mappings
                    const isFgBgCongruous = isSlotCongruousFgBg(key, newSlot);
                    const isActiveInactiveCongruous = isSlotCongruousActiveInactive(key, newSlot);

                    // Collect all keys to sync based on enabled options and congruity
                    if (syncFgBgEnabled && isFgBgCongruous) {
                        const fgBgKey = findCorrespondingFgBg(key);
                        if (fgBgKey) keysToSync.push(fgBgKey);
                    }

                    if (syncActiveInactiveEnabled && isActiveInactiveCongruous) {
                        const activeInactiveKey = findCorrespondingActiveInactive(key);
                        if (activeInactiveKey) keysToSync.push(activeInactiveKey);
                    }

                    // If both syncs are enabled and slot is congruous for both, also sync the diagonal (e.g., activeFg -> inactiveBg)
                    if (syncFgBgEnabled && syncActiveInactiveEnabled && isFgBgCongruous && isActiveInactiveCongruous) {
                        const fgBgKey = findCorrespondingFgBg(key);
                        if (fgBgKey) {
                            const diagonalKey = findCorrespondingActiveInactive(fgBgKey);
                            if (diagonalKey && !keysToSync.includes(diagonalKey)) {
                                keysToSync.push(diagonalKey);
                            }
                        }
                    }

                    // Update all corresponding elements
                    keysToSync.forEach((correspondingKey) => {
                        let correspondingSlot = newSlot;

                        // Map the slot appropriately based on the transformation
                        if (correspondingSlot !== 'none' && correspondingSlot !== '__fixed__') {
                            // Determine what transformation(s) are needed
                            const isFgBgPair = findCorrespondingFgBg(key) === correspondingKey;
                            const isActiveInactivePair = findCorrespondingActiveInactive(key) === correspondingKey;
                            const isDiagonal = !isFgBgPair && !isActiveInactivePair; // The diagonal needs BOTH transformations

                            // Apply fg/bg transformation if this is an fg/bg pair OR part of diagonal
                            if (isFgBgPair || isDiagonal) {
                                const fgBgSlot = getCorrespondingPaletteSlot(correspondingSlot);
                                if (fgBgSlot) correspondingSlot = fgBgSlot;
                            }

                            // Apply active/inactive transformation if this is an active/inactive pair OR part of diagonal
                            if (isActiveInactivePair || isDiagonal) {
                                const activeInactiveSlot = getCorrespondingActiveInactiveSlot(correspondingSlot);
                                if (activeInactiveSlot) correspondingSlot = activeInactiveSlot;
                            }
                        }

                        // Find and update the corresponding select element
                        const allSelects = document.querySelectorAll('.custom-dropdown');
                        allSelects.forEach((otherSelect: any) => {
                            if (otherSelect.title === `Select palette color for ${correspondingKey}`) {
                                otherSelect.setAttribute('data-value', correspondingSlot);
                                // Update display using the value property setter
                                if (otherSelect.value !== undefined) {
                                    otherSelect.value = correspondingSlot;
                                }
                                // Trigger change event to update the mapping (but prevent recursive syncing)
                                const tempFgBg = syncFgBgEnabled;
                                const tempActiveInactive = syncActiveInactiveEnabled;
                                syncFgBgEnabled = false;
                                syncActiveInactiveEnabled = false;
                                otherSelect.dispatchEvent(new Event('change'));
                                syncFgBgEnabled = tempFgBg;
                                syncActiveInactiveEnabled = tempActiveInactive;
                            }
                        });
                    });
                };
                opacitySlider.onchange = updateMapping;

                row.appendChild(starIcon);
                row.appendChild(label);
                row.appendChild(dropdownContainer);
                row.appendChild(opacityContainer);
                grid.appendChild(row);

                // Add separator after every odd-indexed item (after first column items)
                const index = keys.indexOf(key);
                if (index % 2 === 0 && index < keys.length - 1) {
                    const separator = document.createElement('div');
                    separator.style.gridRow = `${Math.floor(index / 2) + 1} / span 1`;
                    separator.style.gridColumn = '2';
                    separator.style.background = 'var(--vscode-panel-border)';
                    separator.style.width = '1px';
                    separator.style.height = '100%';
                    separator.style.marginLeft = '10px';
                    separator.style.marginRight = '10px';
                    grid.appendChild(separator);
                }
            });
            contentDiv.appendChild(grid);
            tabsContent.appendChild(contentDiv);
        });

        mappingsContainer.appendChild(tabsHeader);
        mappingsContainer.appendChild(tabsContent);

        // Activate the selected tab
        if (tabToActivate) {
            tabToActivate.style.borderBottomColor = 'var(--vscode-panelTitle-activeBorder)';
            tabToActivate.style.fontWeight = 'bold';
        }

        // Update checkbox states (but don't re-add event listeners)
        updateProfileEditorCheckboxStates();
    }
}

function updateProfileEditorCheckboxStates() {
    const syncFgBgCheckbox = document.getElementById('syncFgBgCheckbox') as HTMLInputElement;
    if (syncFgBgCheckbox) {
        syncFgBgCheckbox.checked = syncFgBgEnabled;
    }

    const syncActiveInactiveCheckbox = document.getElementById('syncActiveInactiveCheckbox') as HTMLInputElement;
    if (syncActiveInactiveCheckbox) {
        syncActiveInactiveCheckbox.checked = syncActiveInactiveEnabled;
    }

    const limitOptionsCheckbox = document.getElementById('limitOptionsCheckbox') as HTMLInputElement;
    if (limitOptionsCheckbox) {
        limitOptionsCheckbox.checked = limitOptionsEnabled;
    }
}

function initializeProfileEditorCheckboxListeners() {
    // Set up sync checkbox event listeners (only called once during initialization)
    const syncFgBgCheckbox = document.getElementById('syncFgBgCheckbox') as HTMLInputElement;
    if (syncFgBgCheckbox && !syncFgBgCheckbox.dataset.listenerAttached) {
        syncFgBgCheckbox.dataset.listenerAttached = 'true';
        syncFgBgCheckbox.addEventListener('change', () => {
            syncFgBgEnabled = syncFgBgCheckbox.checked;
            localStorage.setItem('syncFgBgEnabled', syncFgBgEnabled.toString());
        });
    }

    const syncActiveInactiveCheckbox = document.getElementById('syncActiveInactiveCheckbox') as HTMLInputElement;
    if (syncActiveInactiveCheckbox && !syncActiveInactiveCheckbox.dataset.listenerAttached) {
        syncActiveInactiveCheckbox.dataset.listenerAttached = 'true';
        syncActiveInactiveCheckbox.addEventListener('change', () => {
            syncActiveInactiveEnabled = syncActiveInactiveCheckbox.checked;
            localStorage.setItem('syncActiveInactiveEnabled', syncActiveInactiveEnabled.toString());
        });
    }

    const limitOptionsCheckbox = document.getElementById('limitOptionsCheckbox') as HTMLInputElement;
    if (limitOptionsCheckbox && !limitOptionsCheckbox.dataset.listenerAttached) {
        limitOptionsCheckbox.dataset.listenerAttached = 'true';
        limitOptionsCheckbox.addEventListener('change', () => {
            limitOptionsEnabled = limitOptionsCheckbox.checked;
            localStorage.setItem('limitOptionsEnabled', limitOptionsEnabled.toString());
            // Re-render the profile editor to update all dropdowns
            if (selectedProfileName && currentConfig?.advancedProfiles?.[selectedProfileName]) {
                renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
            }
        });
    }
}

function createPaletteSlotElement(
    key: string,
    def: PaletteSlotDefinition,
    onChange: (d: PaletteSlotDefinition) => void,
): HTMLElement {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '2px';
    el.className = 'palette-slot-draggable';
    el.setAttribute('draggable', 'true');
    el.setAttribute('data-slot-name', key);
    el.style.cursor = 'grab';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '5px';

    const title = document.createElement('span');
    title.textContent = (PALETTE_SLOT_LABELS[key] || key) + ':';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '12px';
    row.appendChild(title);

    // Add drag event handlers
    el.addEventListener('dragstart', (e: DragEvent) => {
        if (!e.dataTransfer) return;

        el.style.opacity = '0.5';
        el.style.cursor = 'grabbing';

        // Store slot name and color
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.setData('application/x-palette-slot', key);
        e.dataTransfer.setData('application/x-palette-color', convertColorToHex(def.value || '#000000'));

        // Create drag preview
        const dragPreview = document.createElement('div');
        dragPreview.style.position = 'absolute';
        dragPreview.style.left = '-1000px';
        dragPreview.style.padding = '8px 12px';
        dragPreview.style.background = 'var(--vscode-editor-background)';
        dragPreview.style.border = '2px solid var(--vscode-focusBorder)';
        dragPreview.style.borderRadius = '4px';
        dragPreview.style.display = 'flex';
        dragPreview.style.alignItems = 'center';
        dragPreview.style.gap = '8px';
        dragPreview.style.fontSize = '12px';

        const colorBox = document.createElement('div');
        colorBox.style.width = '20px';
        colorBox.style.height = '20px';
        colorBox.style.backgroundColor = convertColorToHex(def.value || '#000000');
        colorBox.style.border = '1px solid var(--vscode-panel-border)';
        colorBox.style.borderRadius = '2px';

        const label = document.createElement('span');
        label.textContent = PALETTE_SLOT_LABELS[key] || key;
        label.style.color = 'var(--vscode-foreground)';

        dragPreview.appendChild(colorBox);
        dragPreview.appendChild(label);
        document.body.appendChild(dragPreview);
        e.dataTransfer.setDragImage(dragPreview, 0, 0);

        // Clean up drag preview after drag starts
        setTimeout(() => dragPreview.remove(), 0);

        // Highlight compatible drop zones
        highlightCompatibleDropZones(key, true);
    });

    el.addEventListener('dragend', () => {
        el.style.opacity = '1';
        el.style.cursor = 'grab';
        highlightCompatibleDropZones('', false);
    });

    // Color input controls (matching the Rules tab)
    const colorContainer = document.createElement('div');
    colorContainer.className = 'color-input-container native-picker';
    colorContainer.style.display = 'flex';
    colorContainer.style.alignItems = 'center';
    colorContainer.style.gap = '5px';
    colorContainer.style.justifyContent = 'flex-end';
    colorContainer.style.flex = '1';

    // Native color picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'native-color-input';
    colorPicker.value = convertColorToHex(def.value || '#000000');
    colorPicker.title = 'Select color';
    colorPicker.onchange = () => {
        def.value = colorPicker.value;
        def.source = 'fixed';
        textInput.value = colorPicker.value;
        onChange(def);
    };

    // Random color button
    const randomBtn = document.createElement('button');
    randomBtn.className = 'random-color-btn';
    randomBtn.textContent = '🎲';
    randomBtn.title = 'Generate random color';
    randomBtn.onclick = () => {
        const randomColor = getThemeAppropriateColor();
        def.value = randomColor;
        def.source = 'fixed';
        colorPicker.value = convertColorToHex(randomColor);
        textInput.value = randomColor;
        onChange(def);
    };

    // Text input
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'color-input text-input';
    textInput.value = def.value || '#000000';
    textInput.placeholder = 'e.g., blue, #4A90E2'; // No profile example here - palette slots are color definitions
    textInput.style.maxWidth = '90px';
    textInput.setAttribute('data-palette-slot', 'true'); // Mark as palette slot input

    textInput.oninput = () => {
        const hexColor = convertColorToHex(textInput.value);
        if (hexColor) {
            colorPicker.value = hexColor;
        }
    };

    textInput.onchange = () => {
        def.value = textInput.value;
        def.source = 'fixed';
        onChange(def);
    };

    colorContainer.appendChild(colorPicker);
    colorContainer.appendChild(randomBtn);
    colorContainer.appendChild(textInput);

    row.appendChild(colorContainer);
    el.appendChild(row);

    return el;
}

// Helper function to update a combined pair swatch
function updatePairSwatch(swatch: HTMLElement, bgColor: string, fgColor: string) {
    const bgHex = convertColorToHex(bgColor);
    const fgHex = convertColorToHex(fgColor);

    swatch.style.backgroundColor = bgHex;
    swatch.style.color = fgHex;
    swatch.textContent = 'Sample';
}

// Helper function to get contrasting text color (black or white)
function getContrastingColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black for light colors, white for dark colors
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

function renameProfile(oldName: string, newName: string) {
    if (oldName === newName) return;
    if (!newName) return;

    // Check if new name is a valid HTML color
    if (isHtmlColor(newName)) {
        vscode.postMessage({
            command: 'showError',
            data: { message: 'Profile name cannot be a valid HTML color name (e.g., "red", "blue", "#fff", etc.)' },
        });
        // Reset the input to old name
        const nameInput = document.getElementById('profileNameInput') as HTMLInputElement;
        if (nameInput) nameInput.value = oldName;
        return;
    }

    if (currentConfig.advancedProfiles[newName]) {
        vscode.postMessage({
            command: 'showError',
            data: { message: 'A profile with this name already exists.' },
        });
        // Reset the input to old name
        const nameInput = document.getElementById('profileNameInput') as HTMLInputElement;
        if (nameInput) nameInput.value = oldName;
        return;
    }

    currentConfig.advancedProfiles[newName] = currentConfig.advancedProfiles[oldName];
    delete currentConfig.advancedProfiles[oldName];
    selectedProfileName = newName;
    saveProfiles();
    renderProfiles(currentConfig.advancedProfiles);
    selectProfile(newName);
}

function deleteProfile(profileName: string) {
    if (!profileName || !currentConfig.advancedProfiles[profileName]) return;

    // Confirm deletion
    vscode.postMessage({
        command: 'confirmDelete',
        data: {
            type: 'profile',
            name: profileName,
        },
    });
}

function duplicateProfile(profileName: string) {
    if (!profileName || !currentConfig.advancedProfiles[profileName]) return;

    // Create a new profile name
    let newName = profileName + ' (copy)';
    let counter = 1;
    while (currentConfig.advancedProfiles[newName]) {
        counter++;
        newName = profileName + ' (copy ' + counter + ')';
    }

    // Deep clone the profile
    const originalProfile = currentConfig.advancedProfiles[profileName];
    currentConfig.advancedProfiles[newName] = JSON.parse(JSON.stringify(originalProfile));

    selectedProfileName = newName;
    saveProfiles();
    renderProfiles(currentConfig.advancedProfiles);
    selectProfile(newName);
}

function confirmDeleteProfile(profileName: string) {
    if (!profileName || !currentConfig.advancedProfiles[profileName]) return;

    delete currentConfig.advancedProfiles[profileName];

    // Select another profile if available
    const remainingProfiles = Object.keys(currentConfig.advancedProfiles);
    if (remainingProfiles.length > 0) {
        selectedProfileName = remainingProfiles[0];
    } else {
        selectedProfileName = null;
    }

    saveProfiles();
    renderProfiles(currentConfig.advancedProfiles);
    if (selectedProfileName) {
        selectProfile(selectedProfileName);
    }
}

function saveProfiles() {
    vscode.postMessage({
        command: 'updateAdvancedProfiles',
        data: {
            advancedProfiles: currentConfig.advancedProfiles,
        },
    });
}
