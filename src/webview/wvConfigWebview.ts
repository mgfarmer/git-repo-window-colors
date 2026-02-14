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

// Import dialog utilities
import { showInputDialog, showMessageDialog } from './dialogUtils';

// Import tooltip utilities
import { showTooltip, hideTooltip, hideTooltipImmediate, attachTooltip, setupDelegatedTooltips } from './tooltipUtils';

// Import hint utilities
import { Hint, hintManager, Tour, tourManager } from './hintUtils';

// Import tour configurations
import { gettingStartedTour, profilesTour } from './tourSteps';

// Import color utility functions
import { hexToHsl, hslToHex, hexToRgba, rgbToHex, generatePreviewColors, getContrastingTextColor } from './colorUtils';

// Import palette logic utilities
import { countActiveMappings, countTotalActiveMappings, resolveColorFromSlot } from './paletteLogic';

// Import element classification utilities
import {
    PALETTE_SLOT_ORDER,
    FG_BG_PAIRS,
    ACTIVE_INACTIVE_PAIRS,
    isBackgroundElement,
    isForegroundElement,
    isActiveElement,
    isInactiveElement,
    isNeutralElement,
    findCorrespondingFgBg,
    getCorrespondingPaletteSlot,
    findCorrespondingActiveInactive,
    getCorrespondingActiveInactiveSlot,
    isSlotCompatibleWithKey,
    isSlotCongruousFgBg,
    isSlotCongruousActiveInactive,
    getFilteredPaletteOptions,
} from './elementClassifiers';

// Import parsing utilities
import { extractRepoNameFromUrl, escapeHtml } from './parseUtils';

// Global variables
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // This will be injected by the extension

const vscode = acquireVsCodeApi();
// Store vscode on window for other modules (e.g., hintUtils.ts) to access
(window as any).vscode = vscode;
let currentConfig: any = null;
let currentThemeKind: 'dark' | 'light' | 'highContrast' = 'dark'; // Track current VS Code theme
let starredKeys: string[] = [];
let validationTimeout: any = null;
let regexValidationTimeout: any = null;
let validationErrors: { repoRules: { [index: number]: string }; branchRules: { [index: number]: string } } = {
    repoRules: {},
    branchRules: {},
};
let localFolderPathValidation: { [index: number]: boolean } = {}; // Track which local folder paths exist
let expandedPaths: { [index: number]: string } = {}; // Track expanded paths for local folder rules
let selectedMappingTab: string | null = null; // Track which mapping tab is active
let selectedRepoRuleIndex: number = -1; // Track which repo rule is selected for branch rules display
let selectedBranchRuleIndex: number = -1; // Track which branch rule is selected for preview
let previewMode: boolean = false; // Track if preview mode is enabled
let profilePreviewMode: boolean = false; // Track if profile preview mode is enabled
let profileAddMenuButton: HTMLElement | null = null;
let profileAddDropdown: HTMLElement | null = null;

// Load checkbox states from localStorage with defaults
let syncFgBgEnabled = localStorage.getItem('syncFgBgEnabled') !== 'false'; // Default to true
let syncActiveInactiveEnabled = localStorage.getItem('syncActiveInactiveEnabled') !== 'false'; // Default to true
let limitOptionsEnabled = localStorage.getItem('limitOptionsEnabled') !== 'false'; // Default to true

document.addEventListener('click', (event) => {
    if (!profileAddDropdown || !profileAddMenuButton) {
        return;
    }
    const target = event.target as Node;
    if (profileAddDropdown.contains(target) || profileAddMenuButton.contains(target)) {
        return;
    }
    hideProfileAddMenu();
});

// Help panel resize state
const HELP_PANEL_MIN_WIDTH = 600;
let helpPanelWidth = HELP_PANEL_MIN_WIDTH;

// Tab Switching
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const tabId = target.getAttribute('aria-controls');
            if (!tabId) return;

            // Close any open branch table dropdowns when switching tabs
            closeAllBranchTableDropdowns();

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

// Helper function to close all branch table dropdowns
function closeAllBranchTableDropdowns() {
    document.querySelectorAll('.dropdown-options.branch-table-options').forEach((dropdown) => {
        (dropdown as HTMLElement).style.display = 'none';
    });
    document.querySelectorAll('.branch-table-dropdown').forEach((dropdown) => {
        dropdown.setAttribute('aria-expanded', 'false');
    });
}

// Close branch table dropdowns when clicking outside
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Don't close if clicking inside a branch table dropdown or its options
    if (!target.closest('.branch-table-dropdown') && !target.closest('.dropdown-options.branch-table-options')) {
        closeAllBranchTableDropdowns();
    }
});

// Close branch table dropdowns when scrolling (they use position:fixed so would become orphaned)
document.addEventListener(
    'scroll',
    () => {
        closeAllBranchTableDropdowns();
    },
    true,
); // Use capture to catch scroll events on all scrollable containers

// Close branch table dropdowns when window is resized
window.addEventListener('resize', () => {
    closeAllBranchTableDropdowns();
});

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
const EXAMPLE_BRANCH_PATTERNS: { pattern: string; description: string }[] = [
    { pattern: '^(?!.*(main|master)).*', description: 'All except main/master' },
    { pattern: '^(bug/|bug-).*', description: 'Bug fix branches with bug IDs' },
    { pattern: '^(feature/|feature-).*', description: 'Feature branches with feature IDs' },
    { pattern: 'feature/.*', description: 'Feature branches (prefix)' },
    { pattern: 'bugfix/.*', description: 'Bugfix branches (prefix)' },
    { pattern: 'dev', description: 'Dev branch only' },
    { pattern: 'hotfix.*', description: 'Hotfix branches' },
    { pattern: 'fix/.*', description: 'Fix branches (prefix)' },
    { pattern: 'docs/.*', description: 'Documentation branches' },
    { pattern: 'test/.*', description: 'Test branches' },
    { pattern: 'refactor/.*', description: 'Refactor branches' },
    { pattern: 'style/.*', description: 'Style/formatting branches' },
    { pattern: 'perf/.*', description: 'Performance branches' },
];

// Auto-complete state
let activeAutoCompleteInput: HTMLInputElement | null = null;
let autoCompleteDropdown: HTMLElement | null = null;
let selectedSuggestionIndex: number = -1;
let branchPatternFilterTimeout: any = null;

// Input original value tracking for escape key restoration
const originalInputValues = new Map<HTMLInputElement, string>();

// Register all hints with the hint manager
function registerHints() {
    hintManager.register(
        new Hint({
            id: 'paletteGenerator',
            html: `<strong>Palette Generator</strong><br>
               Use the palette generator to automatically create harmonious colors 
               based on your primary background selection. Click the wand button to 
               explore different color theory algorithms.`,
            position: 'bottom',
            maxWidth: 300,
        }),
    );

    hintManager.register(
        new Hint({
            id: 'previewSelectedRule',
            html: `<strong>Preview Colors</strong><br>
               Check this checkbox to preview rules that do not match the current workspace.`,
            position: 'left',
            maxWidth: 300,
        }),
    );

    hintManager.register(
        new Hint({
            id: 'dragDropMapping',
            html: `<strong>Drag &amp; Drop</strong><br>
               You can also drag palette swatches directly onto mapping cells 
               for faster color assignment.`,
            position: 'top',
            maxWidth: 280,
        }),
    );

    hintManager.register(
        new Hint({
            id: 'addFirstRule',
            html: `<strong>Get Started</strong><br>
               Click here to add your first repository color rule.`,
            position: 'bottom',
            maxWidth: 280,
        }),
    );

    hintManager.register(
        new Hint({
            id: 'copyFromButton',
            html: `<strong>Copy Rules</strong><br>
               Use this button to copy rules from other tables. You can copy 
               an entire table at once or select individual rules to import.`,
            position: 'left',
            maxWidth: 300,
        }),
    );
}

// Register all tours with the tour manager
// Register all tours with the tour manager
function registerTours() {
    tourManager.register(new Tour(gettingStartedTour));
    tourManager.register(new Tour(profilesTour));
}

// Initialize hints
registerHints();

// Initialize tours
registerTours();

// Request initial configuration
vscode.postMessage({
    command: 'requestConfig',
});

// Accessibility enhancement functions
function initializeAccessibility() {
    // Set up delegated tooltip handling for the entire document
    // Tooltips using data-tooltip attributes will be handled automatically
    setupDelegatedTooltips(document.body);

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

/**
 * Helper function to check if a value is a ThemedColor object
 */
function isThemedColor(value: any): boolean {
    return value && typeof value === 'object' && 'dark' in value && 'light' in value && 'highContrast' in value;
}

/**
 * Extracts the appropriate color string from a ThemedColor object
 * @param colorValue - ThemedColor object
 * @returns The color string for the current theme
 */
function extractColorForTheme(colorValue: any): string {
    //console.log('[extractColorForTheme] Input:', colorValue, 'currentTheme:', currentThemeKind);

    if (typeof colorValue === 'string') {
        //console.log('[extractColorForTheme] Returning string as-is:', colorValue);
        return colorValue;
    }

    if (isThemedColor(colorValue)) {
        const themeValue = colorValue[currentThemeKind];
        if (themeValue && themeValue.value) {
            //console.log('[extractColorForTheme] Extracted for', currentThemeKind, ':', themeValue.value);
            return themeValue.value;
        }

        // Fallback: return first defined color
        for (const theme of ['dark', 'light', 'highContrast'] as const) {
            if (colorValue[theme] && colorValue[theme].value) {
                //console.log('[extractColorForTheme] Fallback to', theme, ':', colorValue[theme].value);
                return colorValue[theme].value;
            }
        }
    }

    //console.log('[extractColorForTheme] No color found, returning empty string');
    return ''; // Return empty string if no color found
}

const THEME_KINDS: Array<'dark' | 'light' | 'highContrast'> = ['dark', 'light', 'highContrast'];

function deriveThemeVariantForWebview(
    baseColor: string,
    fromTheme: 'dark' | 'light' | 'highContrast',
    toTheme: 'dark' | 'light' | 'highContrast',
): string {
    const baseHex = convertColorToHex(baseColor || '#4A90E2');
    const [h, sPercent, lPercent] = hexToHsl(baseHex);
    let normalizedLightness = lPercent / 100;

    if (toTheme === 'light' && (fromTheme === 'dark' || fromTheme === 'highContrast')) {
        normalizedLightness = 1 - normalizedLightness;
        if (normalizedLightness > 0.85) {
            normalizedLightness = 0.35 + (normalizedLightness - 0.85) * 0.5;
        }
    } else if (toTheme === 'dark' && fromTheme === 'light') {
        normalizedLightness = 1 - normalizedLightness;
        if (normalizedLightness > 0.75) {
            normalizedLightness = 0.6 + (normalizedLightness - 0.75) * 0.3;
        }
    } else if (toTheme === 'highContrast') {
        if (fromTheme === 'light') {
            normalizedLightness = 1 - normalizedLightness;
        } else {
            normalizedLightness = Math.min(0.7, normalizedLightness + 0.1);
        }
    }

    normalizedLightness = Math.max(0.1, Math.min(0.9, normalizedLightness));

    return hslToHex(h, sPercent, normalizedLightness * 100).toUpperCase();
}

/**
 * Creates a ThemedColor object from a single color string
 * Derives colors for other themes using lightness inversion
 * This is a simplified version for the webview context
 */
function createThemedColorInWebview(color: string): any {
    if (color === 'none') {
        return 'none';
    }

    const themedColor: Record<'dark' | 'light' | 'highContrast', { value: string | undefined; auto: boolean }> = {
        dark: { value: undefined, auto: true },
        light: { value: undefined, auto: true },
        highContrast: { value: undefined, auto: true },
    };

    themedColor[currentThemeKind] = { value: color, auto: false };

    for (const theme of THEME_KINDS) {
        if (theme === currentThemeKind) {
            continue;
        }
        const derived = deriveThemeVariantForWebview(color, currentThemeKind, theme);
        themedColor[theme] = { value: derived, auto: true };
    }

    return themedColor;
}

/**
 * Handles theme change notifications from the extension
 */
function handleThemeChanged(data: any) {
    if (data && data.themeKind) {
        currentThemeKind = data.themeKind;
        //  Refresh the UI to show colors for the new theme by re-rendering config
        // This will extract colors from ThemedColor objects for the new theme
        if (currentConfig) {
            // Update the stored config's themeKind to prevent it from being overwritten
            currentConfig.themeKind = data.themeKind;
            handleConfigurationData(currentConfig);
        }
    }
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
            if (typeof rule.primaryColor === 'string' && advancedProfiles[rule.primaryColor]) {
                result.profileNames.add(rule.primaryColor);
                ruleUsesProfile = true;
            }
            // Check if branchColor is actually a profile name
            if (typeof rule.branchColor === 'string' && advancedProfiles[rule.branchColor]) {
                result.profileNames.add(rule.branchColor);
                ruleUsesProfile = true;
            }
            // Local branch rules have been removed - all branch rules are now in shared tables

            if (ruleUsesProfile) {
                result.repoRuleCount++;
            }
        }
    }

    // Check shared branch tables
    if (currentConfig.sharedBranchTables) {
        for (const tableName in currentConfig.sharedBranchTables) {
            const table = currentConfig.sharedBranchTables[tableName];
            if (table && table.rules) {
                for (const rule of table.rules) {
                    let ruleUsesProfile = false;

                    if (rule.profileName && advancedProfiles[rule.profileName]) {
                        result.profileNames.add(rule.profileName);
                        ruleUsesProfile = true;
                    }
                    if (typeof rule.color === 'string' && advancedProfiles[rule.color]) {
                        result.profileNames.add(rule.color);
                        ruleUsesProfile = true;
                    }

                    if (ruleUsesProfile) {
                        result.branchRuleCount++;
                    }
                }
            }
        }
    }

    result.count = result.profileNames.size;
    result.inUse = result.count > 0;
    return result;
}

// Check if a specific profile is referenced in any rules
function isProfileInUse(profileName: string): { inUse: boolean; repoRules: number; branchRules: number } {
    const result = { inUse: false, repoRules: 0, branchRules: 0 };

    if (!currentConfig || !profileName) return result;

    const advancedProfiles = currentConfig.advancedProfiles || {};
    if (!advancedProfiles[profileName]) return result;

    // Check repo rules
    if (currentConfig.repoRules) {
        for (const rule of currentConfig.repoRules) {
            let ruleUsesProfile = false;

            // Check explicit profileName field
            if (rule.profileName === profileName) {
                ruleUsesProfile = true;
            }
            // Check if primaryColor is the profile name
            if (typeof rule.primaryColor === 'string' && rule.primaryColor === profileName) {
                ruleUsesProfile = true;
            }
            // Check if branchColor is the profile name
            if (typeof rule.branchColor === 'string' && rule.branchColor === profileName) {
                ruleUsesProfile = true;
            }

            if (ruleUsesProfile) {
                result.repoRules++;
            }
        }
    }

    // Check shared branch tables
    if (currentConfig.sharedBranchTables) {
        for (const tableName in currentConfig.sharedBranchTables) {
            const table = currentConfig.sharedBranchTables[tableName];
            if (table && table.rules) {
                for (const rule of table.rules) {
                    let ruleUsesProfile = false;

                    if (rule.profileName === profileName) {
                        ruleUsesProfile = true;
                    }
                    if (typeof rule.color === 'string' && rule.color === profileName) {
                        ruleUsesProfile = true;
                    }

                    if (ruleUsesProfile) {
                        result.branchRules++;
                    }
                }
            }
        }
    }

    result.inUse = result.repoRules > 0 || result.branchRules > 0;
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
        // For dark themes: use deeper colors; for light themes: use brighter colors
        let lightness: number;
        if (isDark) {
            // Base is dark (dark theme) - use deeper, richer colors
            lightness = 0.15 + Math.random() * 0.15; // 15-30%
            saturation = 0.8 + Math.random() * 0.2; // 80-100%
        } else {
            // Base is light (light theme)
            lightness = 0.5 + Math.random() * 0.2; // 50-70%
            saturation = 0.4 + Math.random() * 0.2; // 40-60%
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

    // Collect from shared branch tables
    if (currentConfig.sharedBranchTables) {
        for (const tableName in currentConfig.sharedBranchTables) {
            const table = currentConfig.sharedBranchTables[tableName];
            if (table && table.rules) {
                for (const rule of table.rules) {
                    if (rule.pattern && rule.pattern.trim()) {
                        patterns.add(rule.pattern.trim());
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

    switch (message.command) {
        case 'configData':
            handleConfigurationData(message.data);
            break;
        case 'themeChanged':
            handleThemeChanged(message.data);
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
        case 'palettePreviews':
            handlePalettePreviews(message.data);
            break;
        case 'starredKeysUpdated':
            if (message.data && message.data.starredKeys) {
                starredKeys = message.data.starredKeys;
                refreshProfileAddMenuOptions();
                // Re-render profile editor to update star icons
                const selectedProfileName = (document.getElementById('profileNameInput') as HTMLInputElement)?.value;
                if (selectedProfileName && currentConfig?.advancedProfiles?.[selectedProfileName]) {
                    renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
                }
            }
            break;
        case 'pathSimplified':
            handlePathSimplified(message.data);
            break;
        case 'pathSimplifiedForPreview':
            handlePathSimplifiedForPreview(message.data);
            break;
        case 'startTour':
            if (message.data?.tourId) {
                tourManager.forceStartTour(message.data.tourId);
            }
            break;
        case 'hintFlagsReset':
            // Reset local hint state so hints can show again
            hintManager.resetAllFlags();
            // Also show the tour link again
            const tourLinkContainer = document.getElementById('tourLinkContainer');
            if (tourLinkContainer) {
                tourLinkContainer.style.display = 'flex';
            }
            break;
    }
});

// Track pending configuration changes to avoid race conditions
function handleConfigurationData(data: any) {
    // if (data?.repoRules) {
    //     console.log('[handleConfigurationData] repoRules count:', data.repoRules.length);
    //     data.repoRules.forEach((rule: any, index: number) => {
    //         console.log(`[handleConfigurationData] Repo rule ${index}: branchTableName="${rule.branchTableName}"`);
    //     });
    // }

    // LOG: Check if workspaceInfo is being received correctly

    // LOG: Check repo rules with detailed color info
    if (data.repoRules) {
        data.repoRules.forEach((rule: any, index: number) => {});
    }

    // LOG: Check branch tables
    if (data.sharedBranchTables && data.sharedBranchTables['My Branches']) {
        data.sharedBranchTables['My Branches'].rules.forEach((rule: any, index: number) => {});
    }

    // LOG: All shared branch tables
    if (data.sharedBranchTables) {
        Object.keys(data.sharedBranchTables).forEach((tableName) => {
            const table = data.sharedBranchTables[tableName];
            table.rules?.forEach((rule: any, index: number) => {});
        });
    }

    // Always use backend data to ensure rule order and matching indexes are consistent
    // The backend data represents the confirmed, persisted state
    currentConfig = data;

    // Extract theme kind if present
    if (data.themeKind) {
        currentThemeKind = data.themeKind;
    }

    // Extract starred keys if present
    if (data.starredKeys) {
        starredKeys = data.starredKeys;
    }

    // Update hint manager with hint flags from extension
    if (data.hintFlags) {
        hintManager.updateState(data.hintFlags);
    }

    // Update tour manager with tour flags from extension
    if (data.tourFlags) {
        tourManager.updateState(data.tourFlags);
    }

    // Store validation errors if present
    if (data.validationErrors) {
        validationErrors = data.validationErrors;
    } else {
        validationErrors = { repoRules: {}, branchRules: {} };
    }

    // Store local folder path validation if present
    if (data.localFolderPathValidation) {
        localFolderPathValidation = data.localFolderPathValidation;
    } else {
        localFolderPathValidation = {};
    }

    // Store expanded paths if present
    if (data.expandedPaths) {
        expandedPaths = data.expandedPaths;
    } else {
        expandedPaths = {};
    }

    // Initialize help panel width from config
    if (data.helpPanelWidth && data.helpPanelWidth >= HELP_PANEL_MIN_WIDTH) {
        helpPanelWidth = data.helpPanelWidth;
        applyHelpPanelWidth();
    }

    // Show/hide tour link based on whether it was dismissed
    const tourLinkContainer = document.getElementById('tourLinkContainer');
    if (tourLinkContainer) {
        tourLinkContainer.style.display = data.tourLinkDismissed ? 'none' : 'flex';
    }

    // Synchronize profileName fields for backward compatibility
    // If primaryColor/branchColor/color matches a profile but profileName is not set, set it
    if (currentConfig?.advancedProfiles && currentConfig?.repoRules) {
        let needsUpdate = false;

        for (const rule of currentConfig.repoRules) {
            // Check primaryColor
            if (
                typeof rule.primaryColor === 'string' &&
                !rule.profileName &&
                currentConfig.advancedProfiles[rule.primaryColor]
            ) {
                rule.profileName = rule.primaryColor;
                needsUpdate = true;
            }

            // Local branch rules have been removed - all branch rules are now in shared tables
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
    } else {
    }
}

function handlePathSimplified(data: any) {
    // Received simplified path from backend, complete addRepoRule action
    if (!currentConfig || !data.simplifiedPath) return;

    const randomColor = getThemeAppropriateColor();
    const newRule = {
        repoQualifier: '!' + data.simplifiedPath, // Add ! prefix for local folder
        primaryColor: createThemedColorInWebview(randomColor),
    };

    currentConfig.repoRules.push(newRule);
    sendConfiguration();
}

function handlePathSimplifiedForPreview(data: any) {
    // Received simplified path from backend, complete addRepoRuleFromPreview action
    if (!currentConfig || !data.simplifiedPath) return;

    const randomColor = getThemeAppropriateColor();
    const newRule = {
        repoQualifier: '!' + data.simplifiedPath, // Add ! prefix for local folder
        primaryColor: createThemedColorInWebview(randomColor),
    };

    currentConfig.repoRules.push(newRule);

    // Select the newly created rule
    const newRuleIndex = currentConfig.repoRules.length - 1;
    selectedRepoRuleIndex = newRuleIndex;

    // Send configuration update
    sendConfiguration();

    // Hide the preview toast
    hidePreviewToast();

    // Switch to rules tab to show the new rule
    const rulesTab = document.getElementById('tab-rules');
    if (rulesTab) {
        (rulesTab as HTMLElement).click();
    }
}

function toggleStarredKey(mappingKey: string): void {
    vscode.postMessage({
        command: 'toggleStarredKey',
        data: { mappingKey },
    });
}

function handleGettingStartedHelpContent(data: { content: string }) {
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;
    }
}

function handleProfileHelpContent(data: { content: string }) {
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;
    }
}

function handleHelpContent(data: { helpType: string; content: string }) {
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv && data.content) {
        contentDiv.innerHTML = data.content;

        // Update current help type to what was just loaded
        currentHelpType = data.helpType;

        // Restore scroll position after DOM has updated
        requestAnimationFrame(() => {
            restoreHelpScrollPosition(data.helpType);
        });
    }
}

function handleSwitchHelp(target: string) {
    // Save scroll position of current help before switching
    saveCurrentHelpScrollPosition();

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
        } else if (target === 'starred') {
            titleElement.textContent = 'Starred Keys Guide';
        } else if (target === 'colored') {
            titleElement.textContent = 'Colored Keys Guide';
        }
    }

    // Request the new content
    if (target === 'getting-started') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'profile') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'rules') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'branch-modes') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'report') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'starred') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    } else if (target === 'colored') {
        vscode.postMessage({ command: 'requestHelp', data: { helpType: target } });
    }
}

// Store scroll positions per help document
const helpScrollPositions: { [helpType: string]: number } = {};
let currentHelpType: string | null = null;

function saveCurrentHelpScrollPosition() {
    if (currentHelpType) {
        const contentDiv = document.getElementById('helpPanelContent');
        if (contentDiv) {
            helpScrollPositions[currentHelpType] = contentDiv.scrollTop;
        }
    }
}

function restoreHelpScrollPosition(helpType: string) {
    const contentDiv = document.getElementById('helpPanelContent');
    if (contentDiv) {
        const savedPosition = helpScrollPositions[helpType];
        if (savedPosition !== undefined) {
            contentDiv.scrollTop = savedPosition;
        } else {
            // No saved position, reset to top
            contentDiv.scrollTop = 0;
        }
    }
}

function openHelp(helpType: string) {
    // Save scroll position of current help before switching
    saveCurrentHelpScrollPosition();

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
        } else if (helpType === 'starred') {
            titleElement.textContent = 'Starred Keys Guide';
        } else if (helpType === 'colored') {
            titleElement.textContent = 'Colored Keys Guide';
        }
    }

    // Request help content from backend
    currentHelpType = helpType;
    vscode.postMessage({ command: 'requestHelp', data: { helpType } });

    // Show the help panel
    const overlay = document.getElementById('helpPanelOverlay');
    const panel = document.getElementById('helpPanel');
    if (overlay && panel) {
        // Apply current width before showing
        panel.style.width = `${helpPanelWidth}px`;
        overlay.classList.add('active');
        panel.classList.add('active');
    }
}

function closeHelp() {
    // Save scroll position before closing
    saveCurrentHelpScrollPosition();

    const overlay = document.getElementById('helpPanelOverlay');
    const panel = document.getElementById('helpPanel');
    if (overlay && panel) {
        overlay.classList.remove('active');
        panel.classList.remove('active');
    }
}

// Help panel resize functionality
function applyHelpPanelWidth() {
    const panel = document.getElementById('helpPanel');
    if (panel) {
        panel.style.width = `${helpPanelWidth}px`;
    }
}

function initHelpPanelResize() {
    const panel = document.getElementById('helpPanel');
    const handle = document.getElementById('helpPanelResizeHandle');
    if (!panel || !handle) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let overlay: HTMLDivElement | null = null;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startWidth = helpPanelWidth;

        // Create overlay to capture mouse events during drag
        overlay = document.createElement('div');
        overlay.className = 'help-panel-resize-overlay';
        document.body.appendChild(overlay);

        panel.classList.add('resizing');
        handle.classList.add('dragging');

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e: MouseEvent) {
        if (!isDragging) return;

        // Calculate new width (dragging left increases width since panel is on the right)
        const deltaX = startX - e.clientX;
        let newWidth = startWidth + deltaX;

        // Enforce minimum and maximum widths
        newWidth = Math.max(HELP_PANEL_MIN_WIDTH, newWidth);
        newWidth = Math.min(window.innerWidth * 0.9, newWidth); // Max 90% of viewport

        helpPanelWidth = newWidth;
        panel!.style.width = `${newWidth}px`;
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;

        // Remove overlay
        if (overlay) {
            overlay.remove();
            overlay = null;
        }

        panel!.classList.remove('resizing');
        handle!.classList.remove('dragging');

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save the new width to global state
        vscode.postMessage({
            command: 'saveHelpPanelWidth',
            data: { width: helpPanelWidth },
        });
    }
}

// Initialize help panel resize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initHelpPanelResize();
});

function renderConfiguration(config: any) {
    // Clear validation errors on new data
    clearValidationErrors();

    // Sync preview mode with configuration
    previewMode = config.otherSettings?.previewSelectedRepoRule ?? false;

    renderRepoRules(config.repoRules, config.matchingIndexes?.repoRule);
    renderBranchRulesForSelectedRepo();
    renderOtherSettings(config.otherSettings);
    renderProfiles(config.advancedProfiles);
    renderWorkspaceInfo(config.workspaceInfo);
    renderBranchTablesTab(config);
    renderColorReport(config);

    // Show/hide preview toast based on preview mode and whether we're previewing a different rule
    // Also show "no workspace" toast if preview mode is on but there's no workspace open
    const hasWorkspace = config.workspaceInfo?.hasWorkspace ?? true;
    const matchingRepoIndex = config.matchingIndexes?.repoRule ?? -1;
    const matchingBranchIndex = config.matchingIndexes?.branchRule ?? -1;
    const isPreviewingDifferentRule =
        selectedRepoRuleIndex !== matchingRepoIndex || selectedBranchRuleIndex !== matchingBranchIndex;

    if (previewMode && (!hasWorkspace || isPreviewingDifferentRule)) {
        showPreviewToast();
    } else {
        hidePreviewToast();
    }

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
    document.addEventListener('click', handleColorInputClick); // Shift-click handler for random colors
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

    // Initialize branch panel collapse state
    initBranchPanelState();
    initSettingsPanelState();
}

function toggleBranchPanelCollapse(collapse: boolean) {
    const branchPanel = document.querySelector('.branch-panel');
    const rightColumn = document.querySelector('.right-column');
    const collapseBtn = document.querySelector('.branch-collapse-btn') as HTMLElement;
    const expandBtn = document.querySelector('.branch-expand-btn') as HTMLElement;

    if (!branchPanel || !rightColumn || !collapseBtn || !expandBtn) return;

    if (collapse) {
        branchPanel.classList.add('collapsed');
        rightColumn.classList.add('collapsed');
        collapseBtn.setAttribute('aria-expanded', 'false');
        localStorage.setItem('branchPanelCollapsed', 'true');
    } else {
        branchPanel.classList.remove('collapsed');
        rightColumn.classList.remove('collapsed');
        collapseBtn.setAttribute('aria-expanded', 'true');
        localStorage.setItem('branchPanelCollapsed', 'false');
    }
}

function initBranchPanelState() {
    const isCollapsed = localStorage.getItem('branchPanelCollapsed') === 'true';
    if (isCollapsed) {
        toggleBranchPanelCollapse(true);
    }
}

function toggleSettingsPanelCollapse(collapse: boolean) {
    const settingsPanel = document.querySelector('.bottom-panel');
    const collapseBtn = document.querySelector('.settings-collapse-btn') as HTMLElement;
    const expandBtn = document.querySelector('.settings-expand-btn') as HTMLElement;

    if (!settingsPanel || !collapseBtn || !expandBtn) return;

    if (collapse) {
        settingsPanel.classList.add('collapsed');
        collapseBtn.setAttribute('aria-expanded', 'false');
        localStorage.setItem('settingsPanelCollapsed', 'true');
    } else {
        settingsPanel.classList.remove('collapsed');
        collapseBtn.setAttribute('aria-expanded', 'true');
        localStorage.setItem('settingsPanelCollapsed', 'false');
    }
}

function initSettingsPanelState() {
    const isCollapsed = localStorage.getItem('settingsPanelCollapsed') === 'true';
    if (isCollapsed) {
        toggleSettingsPanelCollapse(true);
    }
}

function handleDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target) return;

    // Handle branch panel collapse/expand buttons
    const collapseBtn = target.closest('.branch-collapse-btn') as HTMLElement;
    if (collapseBtn) {
        toggleBranchPanelCollapse(true);
        return;
    }

    const expandBtn = target.closest('.branch-expand-btn') as HTMLElement;
    if (expandBtn) {
        toggleBranchPanelCollapse(false);
        return;
    }

    // Handle settings panel collapse/expand buttons
    const settingsCollapseBtn = target.closest('.settings-collapse-btn') as HTMLElement;
    if (settingsCollapseBtn) {
        toggleSettingsPanelCollapse(true);
        return;
    }

    const settingsExpandBtn = target.closest('.settings-expand-btn') as HTMLElement;
    if (settingsExpandBtn) {
        toggleSettingsPanelCollapse(false);
        return;
    }

    // Handle repo rule navigation links
    const repoLink = target.closest('.repo-link') as HTMLElement;
    if (repoLink) {
        event.preventDefault();
        const index = parseInt(repoLink.getAttribute('data-repo-index') || '-1');
        if (index >= 0) {
            navigateToRepoRule(index);
        }
        return;
    }

    // Handle delete buttons
    const deleteBtn = target.closest('.delete-btn') as HTMLElement;
    if (deleteBtn) {
        const repoMatch = deleteBtn.getAttribute('data-action')?.match(/deleteRepoRule\((\d+)\)/);
        const branchMatch = deleteBtn.getAttribute('data-action')?.match(/deleteBranchRule\((\d+)\)/);

        if (repoMatch) {
            const index = parseInt(repoMatch[1]);
            const rule = currentConfig?.repoRules?.[index];
            const colorDisplay = rule ? rule.profileName || extractColorForTheme(rule.primaryColor) || '' : '';
            const ruleDescription = rule
                ? `"${rule.repoQualifier}" -> ${colorDisplay || '(no color)'}`
                : `#${index + 1}`;

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

            // Get the table name from the selected repo rule
            let tableName = '__none__';
            if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
                tableName = currentConfig.repoRules[selectedRepoRuleIndex].branchTableName || '__none__';
            }

            // Get the rule from the shared table
            let rule, ruleDescription;
            if (tableName !== '__none__' && currentConfig?.sharedBranchTables?.[tableName]?.rules?.[index]) {
                rule = currentConfig.sharedBranchTables[tableName].rules[index];
                ruleDescription = rule ? `"${rule.pattern}" -> ${rule.color}` : `#${index + 1}`;
            } else {
                ruleDescription = `#${index + 1}`;
            }

            // Send delete confirmation request to backend
            vscode.postMessage({
                command: 'confirmDelete',
                data: {
                    deleteData: {
                        ruleType: 'branch',
                        index: index,
                        ruleDescription: ruleDescription,
                        tableName: tableName,
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

    // Handle random color buttons - REMOVED, now using shift-click on color input
    if (target.classList.contains('random-color-btn')) {
        // Deprecated: dice buttons have been removed
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

    // Handle Create Table button
    const createTableBtn = target.closest('.create-table-button') as HTMLElement;
    if (createTableBtn) {
        const action = createTableBtn.getAttribute('data-action');
        const match = action?.match(/showCreateTableDialog\((\d+)\)/);
        if (match) {
            const repoRuleIndex = parseInt(match[1]);
            showCreateTableDialog(repoRuleIndex);
        }
        return;
    }

    // Handle Branch Tables management buttons
    if (target.getAttribute('onclick')?.includes('viewBranchTable')) {
        const match = target.getAttribute('onclick')?.match(/viewBranchTable\('([^']+)'\)/);
        if (match) {
            viewBranchTable(match[1]);
        }
        return;
    }

    if (target.getAttribute('onclick')?.includes('renameBranchTableFromMgmt')) {
        const match = target.getAttribute('onclick')?.match(/renameBranchTableFromMgmt\('([^']+)'\)/);
        if (match) {
            renameBranchTableFromMgmt(match[1].replace(/\\'/g, "'"));
        }
        return;
    }

    if (target.getAttribute('onclick')?.includes('deleteBranchTableFromMgmt')) {
        const match = target.getAttribute('onclick')?.match(/deleteBranchTableFromMgmt\('([^']+)'\)/);
        if (match) {
            deleteBranchTableFromMgmt(match[1].replace(/\\'/g, "'"));
        }
        return;
    }

    // Handle preview toast reset button
    if (target.getAttribute('data-action') === 'resetToMatchingRules') {
        resetToMatchingRules();
        return;
    }

    // Handle preview toast add button
    if (target.getAttribute('data-action') === 'addRepoRuleFromPreview') {
        addRepoRuleFromPreview();
        return;
    }

    // Handle contextual help button (opens help based on active tab)
    if (target.closest('[data-action="openContextualHelp"]')) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab?.id === 'rules-tab') {
            openHelp('rules');
        } else if (activeTab?.id === 'profiles-tab') {
            // Check if we're in the Starred or Colored mapping tab within Profiles
            const activeMapTab = document.querySelector(
                '.mapping-tab-btn[style*="border-bottom-color: var(--vscode-panelTitle-activeBorder)"]',
            );
            const tabText = activeMapTab?.textContent?.trim();
            if (tabText?.includes('★ Starred')) {
                openHelp('starred');
            } else if (tabText?.includes('⚡ Colored')) {
                openHelp('colored');
            } else {
                openHelp('profile');
            }
        } else if (activeTab?.id === 'branch-tables-tab') {
            openHelp('branch-modes');
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

    // Handle tour link actions
    if (target.getAttribute('data-action') === 'startTour') {
        // Hide the tour link immediately
        const tourLinkContainer = document.getElementById('tourLinkContainer');
        if (tourLinkContainer) {
            tourLinkContainer.style.display = 'none';
        }
        // Dismiss the tour link and start the Getting Started tour directly
        vscode.postMessage({ command: 'dismissTourLink', data: {} });
        tourManager.forceStartTour('getting-started');
        return;
    }

    if (target.getAttribute('data-action') === 'dismissTourLink') {
        // Hide the tour link immediately
        const tourLinkContainer = document.getElementById('tourLinkContainer');
        if (tourLinkContainer) {
            tourLinkContainer.style.display = 'none';
        }
        // Send message to persist the dismissal
        vscode.postMessage({ command: 'dismissTourLink', data: {} });
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

    // Handle branch table change
    const branchTableMatch = action.match(/changeBranchTable\((\d+), this\.value\)/);
    if (branchTableMatch) {
        const index = parseInt(branchTableMatch[1]);
        changeBranchTable(index, target.value);
        return;
    }

    // Handle branch mode change (legacy - kept for backward compatibility during migration)
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

    // Handle escape key to close branch table dropdowns
    if (event.key === 'Escape') {
        const openDropdowns = document.querySelectorAll('.dropdown-options.branch-table-options');
        let closedAny = false;
        openDropdowns.forEach((dropdown) => {
            if ((dropdown as HTMLElement).style.display === 'block') {
                (dropdown as HTMLElement).style.display = 'none';
                closedAny = true;
            }
        });
        if (closedAny) {
            document.querySelectorAll('.branch-table-dropdown').forEach((dropdown) => {
                dropdown.setAttribute('aria-expanded', 'false');
            });
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

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

                // Ignore drops between repo/branch tables
                if (draggedType && draggedType !== ruleType) {
                    return;
                }

                // Check if we're dropping in the bottom half of the last row
                // If so, treat it as "insert after this row" (i.e., at the very bottom)
                const rules = getRulesForDrag(ruleType);
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
    const container = document.getElementById('repoRulesContent');
    if (!container) return;

    // Show hint for the Add button when there are no rules (after layout fully completes)
    // Use double requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const addButton = document.querySelector('[data-action="addRepoRule"]') as HTMLElement;
            if (addButton) {
                // Only show hint if button is visible and has dimensions
                const rect = addButton.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    hintManager.tryShow('addFirstRule', addButton, () => !rules || rules.length === 0);
                }
            }
        });
    });

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
    headerRow.innerHTML = `
        <th scope="col" class="select-column">Sel</th>
        <th scope="col">Actions</th>
        <th scope="col">Repository Qualifier</th>
        <th scope="col">Color or Profile</th>
        <th scope="col" class="branch-table-column">Branch Table</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';
        row.setAttribute('data-index', String(index));

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
            row.classList.add('matched-rule');
        }

        // Add disabled class if rule is disabled
        if (rule.enabled === false) {
            row.classList.add('disabled-rule');
        }

        // Add warning class if this is a local folder rule with invalid path
        if (rule.repoQualifier && rule.repoQualifier.startsWith('!')) {
            if (localFolderPathValidation[index] === false) {
                row.classList.add('invalid-path');
            }
        }

        row.innerHTML = createRepoRuleRowHTML(rule, index, rules.length);
        setupRepoRuleRowEvents(row, index);

        // Insert custom branch table dropdown
        // '__none__' = explicitly No Branch Table, missing/undefined defaults to '__none__'
        const tableName = rule.branchTableName || '__none__';
        const cell = row.querySelector(`#branch-table-cell-${index}`);
        if (cell) {
            // Determine status tooltip
            let statusTooltip = '';
            if (matchingIndex !== undefined && index === matchingIndex) {
                statusTooltip = 'This rule matches the current workspace';
            } else if (
                rule.repoQualifier &&
                rule.repoQualifier.startsWith('!') &&
                localFolderPathValidation[index] === false
            ) {
                statusTooltip = 'Warning: This path does not exist on the local system';
            }

            if (statusTooltip) {
                cell.setAttribute('title', statusTooltip);
            }

            const dropdownContainer = createBranchTableDropdown(tableName, index, statusTooltip);
            cell.appendChild(dropdownContainer);
        }
    });

    container.innerHTML = '';
    container.appendChild(table);

    // Initialize selection if needed - only select if there's a matching rule
    if (selectedRepoRuleIndex === -1 && rules.length > 0) {
        // Only select if there's a matched workspace rule
        if (
            matchingIndex !== undefined &&
            matchingIndex !== null &&
            matchingIndex >= 0 &&
            matchingIndex < rules.length
        ) {
            selectedRepoRuleIndex = matchingIndex;
            renderBranchRulesForSelectedRepo();
        }
        // Don't auto-select the first rule when there's no match

        // If preview mode is enabled, trigger preview for the initially selected rule
        if (previewMode && selectedRepoRuleIndex >= 0) {
            const selectedRule = rules[selectedRepoRuleIndex];
            const tableName = selectedRule.branchTableName || '__none__';
            const branchTable = currentConfig?.sharedBranchTables?.[tableName];
            const hasBranchRules = tableName !== '__none__' && branchTable?.rules && branchTable.rules.length > 0;

            vscode.postMessage({
                command: 'previewRepoRule',
                data: {
                    index: selectedRepoRuleIndex,
                    previewEnabled: true,
                    clearBranchPreview: !hasBranchRules,
                },
            });
        }
    }
}

function createBranchTableDropdown(
    selectedTableName: string | null,
    repoRuleIndex: number,
    statusTooltip?: string,
): HTMLElement {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '4px';
    container.style.alignItems = 'center';

    // Check if this is a local folder rule (starts with !)
    const repoRules = currentConfig?.repoRules || [];
    const rule = repoRules[repoRuleIndex];
    if (rule && rule.repoQualifier && rule.repoQualifier.startsWith('!')) {
        // Local folder rule - show static text with icon
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-folder';
        icon.style.marginRight = '4px';
        container.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = 'Local Folder';
        container.appendChild(text);

        container.style.color = 'var(--vscode-descriptionForeground)';
        container.style.fontStyle = 'italic';
        container.style.fontSize = '12px';
        container.style.padding = '2px 4px';
        container.style.background = 'transparent';
        // Only set default tooltip if there's no status tooltip
        if (!statusTooltip) {
            container.setAttribute('title', 'Local folder rules do not support branch rules');
        }
        return container;
    }

    // Check if primaryColor is 'none' (excluded from coloring)
    if (rule && typeof rule.primaryColor === 'string' && rule.primaryColor === 'none') {
        const icon = document.createElement('span');
        icon.textContent = '⊘';
        icon.style.marginRight = '4px';
        icon.style.opacity = '0.7';
        container.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = 'n/a';
        container.appendChild(text);

        container.style.color = 'var(--vscode-descriptionForeground)';
        container.style.fontStyle = 'italic';
        container.style.fontSize = '12px';
        container.style.padding = '2px 4px';
        container.style.background = 'transparent';
        container.setAttribute('title', 'Branch rules are not applicable when color is set to "none"');
        return container;
    }

    // For dropdown, allow flex to expand
    container.style.flex = '1';

    if (!currentConfig?.sharedBranchTables) {
        // Fallback to simple text
        container.textContent = selectedTableName || 'No Branch Table';
        return container;
    }

    const tables = currentConfig.sharedBranchTables;

    // Calculate usage counts and track which repos use each table
    const usageCounts: { [tableName: string]: number } = {};
    const tableUsageMap: { [tableName: string]: string[] } = {};
    for (const tableName in tables) {
        usageCounts[tableName] = 0;
        tableUsageMap[tableName] = [];
    }
    for (const rule of repoRules) {
        const tableName = rule.branchTableName;
        // Skip undefined (No Branch Table)
        if (tableName && usageCounts[tableName] !== undefined) {
            usageCounts[tableName]++;
            tableUsageMap[tableName].push(rule.repoQualifier || 'Unknown');
        }
    }

    // Create custom dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'branch-table-dropdown';
    dropdown.setAttribute('data-repo-index', String(repoRuleIndex));
    dropdown.setAttribute('data-value', selectedTableName || '');
    dropdown.setAttribute('tabindex', '0');
    dropdown.setAttribute('role', 'combobox');
    dropdown.setAttribute('aria-expanded', 'false');
    dropdown.style.flex = '1';
    dropdown.style.position = 'relative';
    dropdown.style.cursor = 'pointer';
    dropdown.style.minWidth = '120px';

    // Selected value display
    const selectedDisplay = document.createElement('div');
    selectedDisplay.className = 'dropdown-selected';
    selectedDisplay.style.background = 'var(--vscode-dropdown-background)';
    selectedDisplay.style.color = 'var(--vscode-dropdown-foreground)';
    selectedDisplay.style.border = '1px solid var(--vscode-dropdown-border)';
    selectedDisplay.style.padding = '4px 8px';
    selectedDisplay.style.fontSize = '12px';
    selectedDisplay.style.display = 'flex';
    selectedDisplay.style.alignItems = 'center';
    selectedDisplay.style.gap = '6px';
    selectedDisplay.style.position = 'relative';
    selectedDisplay.style.maxWidth = '150px';
    selectedDisplay.style.overflow = 'hidden';

    // Arrow indicator
    const arrow = document.createElement('span');
    arrow.className = 'codicon codicon-chevron-down';
    arrow.style.position = 'absolute';
    arrow.style.right = '6px';
    arrow.style.fontSize = '12px';
    arrow.style.pointerEvents = 'none';
    selectedDisplay.appendChild(arrow);

    // Dropdown options container
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'dropdown-options branch-table-options';
    optionsContainer.setAttribute('data-repo-index', String(repoRuleIndex));
    optionsContainer.style.display = 'none';
    optionsContainer.style.position = 'fixed';
    optionsContainer.style.width = 'max-content';
    optionsContainer.style.background = 'var(--vscode-dropdown-background)';
    optionsContainer.style.border = '1px solid var(--vscode-dropdown-border)';
    optionsContainer.style.maxHeight = '250px';
    optionsContainer.style.overflowY = 'auto';
    optionsContainer.style.zIndex = '10000';

    // Build sorted list of table names
    const tableNames = Object.keys(tables).sort((a, b) => {
        if (a === 'Default Rules') return -1;
        if (b === 'Default Rules') return 1;
        return a.localeCompare(b);
    });

    // Add "No Branch Table" option first
    const noBranchOption = document.createElement('div');
    noBranchOption.className = 'dropdown-option';
    noBranchOption.setAttribute('data-value', '__none__');
    noBranchOption.style.padding = '6px 8px';
    noBranchOption.style.cursor = 'pointer';
    noBranchOption.style.display = 'flex';
    noBranchOption.style.alignItems = 'center';
    noBranchOption.style.gap = '8px';
    noBranchOption.style.fontSize = '12px';

    if (selectedTableName === '__none__') {
        noBranchOption.style.background = 'var(--vscode-list-activeSelectionBackground)';
        noBranchOption.style.color = 'var(--vscode-list-activeSelectionForeground)';
    }

    const noBranchIcon = document.createElement('span');
    noBranchIcon.className = 'codicon codicon-circle-slash';
    noBranchOption.appendChild(noBranchIcon);

    const noBranchText = document.createElement('span');
    noBranchText.textContent = 'No Branch Table';
    noBranchOption.appendChild(noBranchText);

    // Hover effect
    noBranchOption.addEventListener('mouseenter', () => {
        if (selectedTableName !== '__none__') {
            noBranchOption.style.background = 'var(--vscode-list-hoverBackground)';
        }
    });
    noBranchOption.addEventListener('mouseleave', () => {
        if (selectedTableName !== '__none__') {
            noBranchOption.style.background = '';
        }
    });

    // Click handler
    noBranchOption.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.setAttribute('data-value', '__none__');
        updateSelectedDisplay('__none__');
        optionsContainer.style.display = 'none';
        dropdown.setAttribute('aria-expanded', 'false');

        // Trigger the branch table change to __none__
        changeBranchTable(repoRuleIndex, '__none__');
    });

    optionsContainer.appendChild(noBranchOption);

    // Add separator after No Branch Table
    const separatorTop = document.createElement('div');
    separatorTop.style.borderTop = '1px solid var(--vscode-menu-separatorBackground)';
    separatorTop.style.margin = '4px 0';
    optionsContainer.appendChild(separatorTop);

    // Update selected display
    const updateSelectedDisplay = (tableName: string) => {
        const icon = document.createElement('span');
        icon.style.flexShrink = '0';

        if (tableName === '__none__') {
            icon.className = 'codicon codicon-circle-slash';
            const text = document.createElement('span');
            text.textContent = 'No Branch Table';
            text.style.overflow = 'hidden';
            text.style.textOverflow = 'ellipsis';
            text.style.whiteSpace = 'nowrap';
            text.style.paddingRight = '24px';
            text.style.maxWidth = '150px';
            text.style.minWidth = '0';
            text.style.flex = '1';
            text.title = 'No Branch Table';

            selectedDisplay.innerHTML = '';
            selectedDisplay.appendChild(icon);
            selectedDisplay.appendChild(text);
            selectedDisplay.appendChild(arrow);
        } else {
            icon.className = 'codicon codicon-git-branch';
            const text = document.createElement('span');
            const count = usageCounts[tableName] || 0;
            const badge = count > 0 ? ` [${count}]` : '';
            text.textContent = tableName + badge;
            text.style.overflow = 'hidden';
            text.style.textOverflow = 'ellipsis';
            text.style.whiteSpace = 'nowrap';
            text.style.paddingRight = '24px';
            text.style.maxWidth = '150px';
            text.style.minWidth = '0';
            text.style.flex = '1';
            text.title = tableName + badge;

            selectedDisplay.innerHTML = '';
            selectedDisplay.appendChild(icon);
            selectedDisplay.appendChild(text);
            selectedDisplay.appendChild(arrow);
        }
    };

    // Create option elements
    tableNames.forEach((tableName) => {
        const isSelected = tableName === selectedTableName;
        const usageCount = usageCounts[tableName] || 0;
        const reposUsingTable = tableUsageMap[tableName] || [];

        const optionDiv = document.createElement('div');
        optionDiv.className = 'dropdown-option';
        optionDiv.setAttribute('data-value', tableName);
        optionDiv.style.padding = '6px 8px';
        optionDiv.style.cursor = 'pointer';
        optionDiv.style.display = 'flex';
        optionDiv.style.alignItems = 'center';
        optionDiv.style.gap = '8px';
        optionDiv.style.fontSize = '12px';

        // Add tooltip showing which repos use this table
        if (usageCount > 0) {
            const maxReposToShow = 5;
            const repoList = reposUsingTable.slice(0, maxReposToShow).join(', ');
            const remaining = reposUsingTable.length - maxReposToShow;
            const tooltipText = remaining > 0 ? `Used by: ${repoList}...and ${remaining} more` : `Used by: ${repoList}`;
            optionDiv.setAttribute('data-tooltip', tooltipText);
        } else {
            optionDiv.setAttribute('data-tooltip', 'Not used by any repository rules');
        }

        if (isSelected) {
            optionDiv.style.background = 'var(--vscode-list-activeSelectionBackground)';
            optionDiv.style.color = 'var(--vscode-list-activeSelectionForeground)';
        }

        // Add icon
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-branch';
        optionDiv.appendChild(icon);

        // Add text
        const text = document.createElement('span');
        text.textContent = tableName;
        optionDiv.appendChild(text);

        // Add usage badge if any
        if (usageCount > 0) {
            const badge = document.createElement('span');
            badge.textContent = `[${usageCount}]`;
            badge.style.color = 'var(--vscode-descriptionForeground)';
            badge.style.fontSize = '11px';
            optionDiv.appendChild(badge);
        }

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

        // Click handler
        optionDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.setAttribute('data-value', tableName);
            updateSelectedDisplay(tableName);
            optionsContainer.style.display = 'none';
            dropdown.setAttribute('aria-expanded', 'false');

            // Trigger the branch table change
            changeBranchTable(repoRuleIndex, tableName);
        });

        optionsContainer.appendChild(optionDiv);
    });

    // Add separator before "Create New Table..."
    const separator = document.createElement('div');
    separator.style.borderTop = '1px solid var(--vscode-menu-separatorBackground)';
    separator.style.margin = '4px 0';
    optionsContainer.appendChild(separator);

    // Add "Create New Table..." option
    const createOption = document.createElement('div');
    createOption.className = 'dropdown-option';
    createOption.style.padding = '6px 8px';
    createOption.style.cursor = 'pointer';
    createOption.style.display = 'flex';
    createOption.style.alignItems = 'center';
    createOption.style.gap = '8px';
    createOption.style.fontSize = '12px';
    createOption.style.fontStyle = 'italic';
    createOption.style.color = 'var(--vscode-textLink-foreground)';

    const createIcon = document.createElement('span');
    createIcon.className = 'codicon codicon-git-branch-staged-changes';
    createOption.appendChild(createIcon);

    const createText = document.createElement('span');
    createText.textContent = 'Create New Table...';
    createOption.appendChild(createText);

    // Hover effect for create option
    createOption.addEventListener('mouseenter', () => {
        createOption.style.background = 'var(--vscode-list-hoverBackground)';
    });
    createOption.addEventListener('mouseleave', () => {
        createOption.style.background = '';
    });

    // Click handler for create option
    createOption.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsContainer.style.display = 'none';
        dropdown.setAttribute('aria-expanded', 'false');
        showCreateTableDialog(repoRuleIndex);
    });

    optionsContainer.appendChild(createOption);

    // Toggle dropdown on click
    selectedDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = optionsContainer.style.display === 'block';

        // Close all other dropdowns first
        document.querySelectorAll('.dropdown-options.branch-table-options').forEach((other) => {
            if (other !== optionsContainer) {
                (other as HTMLElement).style.display = 'none';
            }
        });
        document.querySelectorAll('.branch-table-dropdown').forEach((dd) => {
            if (dd !== dropdown) {
                dd.setAttribute('aria-expanded', 'false');
            }
        });

        if (!isOpen) {
            // Position dropdown relative to the trigger element
            const triggerRect = selectedDisplay.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;
            const dropdownHeight = 250; // maxHeight of options

            // Position at the trigger element
            optionsContainer.style.left = triggerRect.left + 'px';
            optionsContainer.style.minWidth = triggerRect.width + 'px';

            // If not enough space below but enough above, flip it upward
            if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                optionsContainer.style.top = triggerRect.top - dropdownHeight + 'px';
                optionsContainer.style.bottom = 'auto';
            } else {
                // Normal downward position
                optionsContainer.style.top = triggerRect.bottom + 2 + 'px';
                optionsContainer.style.bottom = 'auto';
            }
        }

        optionsContainer.style.display = isOpen ? 'none' : 'block';
        dropdown.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close dropdown when it loses focus (with a small delay to allow clicking options)
    dropdown.addEventListener('focusout', (e) => {
        const relatedTarget = (e as FocusEvent).relatedTarget as HTMLElement;
        // Don't close if focus moved to an option within this dropdown's options
        if (relatedTarget && (optionsContainer.contains(relatedTarget) || dropdown.contains(relatedTarget))) {
            return;
        }
        // Small delay to allow click events to process first
        setTimeout(() => {
            if (!dropdown.contains(document.activeElement) && !optionsContainer.contains(document.activeElement)) {
                optionsContainer.style.display = 'none';
                dropdown.setAttribute('aria-expanded', 'false');
            }
        }, 150);
    });

    // Initialize selected display
    updateSelectedDisplay(selectedTableName || '');

    dropdown.appendChild(selectedDisplay);
    container.appendChild(dropdown);

    // Append options to body for proper z-index stacking
    document.body.appendChild(optionsContainer);

    return container;
}

function createRepoRuleRowHTML(rule: any, index: number, totalCount: number): string {
    const isSelected = selectedRepoRuleIndex === index;

    // For local folder rules, create a tooltip showing the expanded path
    let tooltipAttr = '';
    if (rule.repoQualifier && rule.repoQualifier.startsWith('!')) {
        const expandedPath = expandedPaths[index];
        if (expandedPath) {
            tooltipAttr = ` data-tooltip="Resolved path: ${escapeHtml(expandedPath)}"`;
        }
    }

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
                   aria-label="Repository qualifier for rule ${index + 1}"${tooltipAttr}
                   data-action="updateRepoRule(${index}, 'repoQualifier', this.value)">
        </td>
        <td class="color-cell">
            ${createColorInputHTML(extractColorForTheme(rule.primaryColor) || '', 'repo', index, 'primaryColor')}
        </td>
        <td class="branch-table-cell" id="branch-table-cell-${index}">
            <!-- Custom dropdown will be inserted here -->
        </td>
    `;
}

function renderBranchRules(rules: any[], matchingIndex?: number, repoRuleIndex?: number) {
    const container = document.getElementById('branchRulesContent');
    if (!container) return;

    if (!rules || rules.length === 0) {
        const selectedRule = repoRuleIndex !== undefined ? currentConfig?.repoRules?.[repoRuleIndex] : null;
        const tableName = selectedRule?.branchTableName || '__none__';
        let emptyMessage: string;
        if (tableName === '__none__') {
            emptyMessage = `<div class="no-rules">No branch table selected for this repository. Select a table from the dropdown to add branch rules.</div>`;
        } else {
            emptyMessage = `<div class="no-rules">No branch rules defined in table "${escapeHtml(tableName)}". Click "Add" to create a rule or use "Copy From..." to import rules.</div>`;
        }
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
    headerRow.innerHTML = `
        <th scope="col" class="select-column">Sel</th>
        <th scope="col">Actions</th>
        <th scope="col">Branch Pattern</th>
        <th scope="col">Color or Profile</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

        // Note: Validation errors are currently stored per global branchRules array
        // This may need updating for table-based validation in the future
        if (validationErrors.branchRules[index]) {
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
        // Only select if there's a matched branch rule
        if (
            matchingIndex !== undefined &&
            matchingIndex !== null &&
            matchingIndex >= 0 &&
            matchingIndex < rules.length
        ) {
            selectedBranchRuleIndex = matchingIndex;

            // Trigger re-render to show the selection
            if (currentConfig && selectedRepoRuleIndex >= 0) {
                renderBranchRulesForSelectedRepo();
            }
        }
        // Don't auto-select the first rule when there's no match
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
            ${createColorInputHTML(rule.profileName || extractColorForTheme(rule.color) || '', 'branch', index, 'color')}
        </td>
    `;
}

function createColorInputHTML(color: string, ruleType: string, index: number, field: string): string {
    const USE_NATIVE_COLOR_PICKER = true; // This should match the build-time config
    const placeholder = 'e.g., blue, #4A90E2, MyProfile';

    // Handle special 'none' value - show indicator instead of color picker
    const isSpecialNone = color === 'none';

    if (USE_NATIVE_COLOR_PICKER) {
        const hexColor = isSpecialNone ? '#808080' : getRepresentativeColor(color);
        const colorPickerDisplay = isSpecialNone ? 'style="display: none;"' : '';
        const noneIndicator = isSpecialNone
            ? '<span class="none-indicator" data-tooltip="Excluded from coloring">⊘</span>'
            : '';
        return `
            <div class="color-input-container native-picker${isSpecialNone ? ' is-none' : ''}">
                ${noneIndicator}
                <input type="color" 
                       class="native-color-input" 
                       id="${ruleType}-${field}-${index}"
                       value="${hexColor}" 
                       ${colorPickerDisplay}
                       data-tooltip="Click to use a color picker, shift-click to choose a random color"
                       data-action="updateColorRule('${ruleType}', ${index}, '${field}', this.value)"
                       aria-label="Color for ${ruleType} rule ${index + 1} ${field}">
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
        // For non-native picker, resolve profile names to colors
        const resolvedColor = isSpecialNone ? 'transparent' : getRepresentativeColor(color);
        const swatchStyle = isSpecialNone
            ? 'background-color: transparent; display: flex; align-items: center; justify-content: center;'
            : `background-color: ${convertColorToValidCSS(resolvedColor) || '#4A90E2'}`;
        const swatchContent = isSpecialNone ? '⊘' : '';
        return `
            <div class="color-input-container${isSpecialNone ? ' is-none' : ''}">
                <div class="color-swatch" 
                     style="${swatchStyle}"
                     data-action="openColorPicker('${ruleType}', ${index}, '${field}')"
                     data-tooltip="${isSpecialNone ? 'Excluded from coloring' : 'Click to use a color picker, shift-click to choose a random color'}">${swatchContent}</div>
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
    const dragTooltip = isDragDisabled
        ? 'Cannot reorder when only one rule exists'
        : 'Drag this handle to reorder rules. Rules are processed from top to bottom.';

    return `
        <div class="reorder-buttons">
            <div class="drag-handle${isDragDisabled ? ' disabled' : ''}" 
                 ${isDragDisabled ? '' : 'draggable="true"'} 
                 data-drag-index="${index}"
                 data-drag-type="${ruleType}"
                 data-tooltip="${escapeHtml(dragTooltip)}"
                 data-tooltip-position="right"
                 tabindex="${isDragDisabled ? '-1' : '0'}"
                 role="button"
                 aria-label="Drag handle for rule ${index + 1}"
                 ${isDragDisabled ? 'aria-disabled="true"' : ''}><span class="codicon codicon-gripper"></span></div>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', -1)" 
                    data-tooltip="Move up"
                    aria-label="Move rule ${index + 1} up"
                    ${index === 0 ? 'disabled' : ''}><span class="codicon codicon-triangle-up"></span></button>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', 1)" 
                    data-tooltip="Move down"
                    aria-label="Move rule ${index + 1} down"
                    ${index === totalCount - 1 ? 'disabled' : ''}><span class="codicon codicon-triangle-down"></span></button>
            <button class="eye-btn" 
                    data-action="toggleRule(${index}, '${ruleType}')"
                    data-tooltip="${eyeTitle}"
                    aria-label="Toggle ${ruleType} rule ${index + 1}">${eyeIcon}</button>
            <button class="delete-btn" 
                    data-action="delete${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}Rule(${index})"
                    data-tooltip="Delete this rule"
                    aria-label="Delete ${ruleType} rule ${index + 1}"><span class="codicon codicon-trash"></span></button>
        </div>
    `;
}

function renderOtherSettings(settings: any) {
    const container = document.getElementById('otherSettingsContent');
    if (!container) return;

    // Check if the selected repo rule is using a non-virtual profile
    const selectedRule = currentConfig?.repoRules?.[selectedRepoRuleIndex];

    // Only disable controls if using an actual user-defined profile (not a virtual one)
    // Virtual profiles are temporary profiles created for simple color rules
    let isProfileRule = false;
    if (selectedRule?.profileName) {
        const profile = currentConfig?.advancedProfiles?.[selectedRule.profileName];
        isProfileRule = profile && !profile.virtual;
    } else if (typeof selectedRule?.primaryColor === 'string') {
        const profile = currentConfig?.advancedProfiles?.[selectedRule.primaryColor];
        isProfileRule = profile && !profile.virtual;
    }

    const disabledAttr = isProfileRule ? 'disabled' : '';
    const disabledClass = isProfileRule ? 'disabled' : '';
    const profileNote = isProfileRule ? ' <strong>The currently selected rule is using a profile.</strong>' : '';

    container.innerHTML = `
        <div class="settings-sections">
            <div class="settings-section color-options-section">
                <h3>Color Options</h3>
                <div class="section-help" style="margin-bottom: 10px;">
                    <strong>Note:</strong> These settings only apply when using simple colors. When using Profiles, these color-related settings are controlled by the profile configuration.${profileNote}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="settings-grid">
                        <div class="setting-item ${disabledClass}"
                             data-tooltip="Apply repository colors to the status bar at the bottom of the VS Code window. This gives the repository color more prominence."
                             data-tooltip-position="top">
                            <label>
                                <input type="checkbox" 
                                       id="color-status-bar"
                                       ${settings.colorStatusBar ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorStatusBar', this.checked)">
                                Color Status Bar
                            </label>
                        </div>
                        <div class="setting-item ${disabledClass}"
                             data-tooltip="Apply repository colors to editor tabs. This gives the repository color more prominence."
                             data-tooltip-position="top">
                            <label>
                                <input type="checkbox" 
                                       id="color-editor-tabs"
                                       ${settings.colorEditorTabs ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorEditorTabs', this.checked)">
                                Color Editor Tabs
                            </label>
                        </div>
                        <div class="setting-item ${disabledClass}"
                             data-tooltip="Apply colors to the title bar even when the VS Code window is not focused. This maintains visual identification when switching between applications."
                             data-tooltip-position="top">
                            <label>
                                <input type="checkbox" 
                                       id="color-inactive-titlebar"
                                       ${settings.colorInactiveTitlebar ? 'checked' : ''}
                                       ${disabledAttr}
                                       data-action="updateOtherSetting('colorInactiveTitlebar', this.checked)">
                                Color Inactive Title Bar
                            </label>
                        </div>
                    </div>
                    <div class="settings-grid">
                        <div class="setting-item range-slider ${disabledClass}"
                             data-tooltip="Adjust the brightness of non-title bar elements (activity bar, editor tabs, and status bar). Negative values make colors darker, positive values make them lighter. Zero means no adjustment."
                             data-tooltip-position="top">
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
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-section other-options-section">
                <h3>Other Options</h3>
                <div class="settings-grid">
                    <div class="setting-item"
                         data-tooltip="When enabled, selecting any repository rule will preview its colors in the workspace without loading a workspace that matches the previewed rule. This is useful for testing how different rules look without having to open every repository."
                         data-tooltip-position="top">
                        <label>
                            <input type="checkbox" 
                                   id="preview-selected-repo-rule"
                                   ${settings.previewSelectedRepoRule ? 'checked' : ''}
                                   data-action="updateOtherSetting('previewSelectedRepoRule', this.checked)"
                                   data-extra-action="handlePreviewModeChange">
                            Preview Selected Rules
                        </label>
                    </div>
                    <div class="setting-item"
                         data-tooltip="When enabled, the extension will ask if you'd like to colorize a repository when opening a workspace folder on a repository that doesn't match any existing rules. When disabled, no prompt will be shown."
                         data-tooltip-position="top">
                        <label>
                            <input type="checkbox" 
                                   id="ask-to-colorize-repo-when-opened"
                                   ${settings.askToColorizeRepoWhenOpened ? 'checked' : ''}
                                   data-action="updateOtherSetting('askToColorizeRepoWhenOpened', this.checked)">
                            Ask to colorize repository when opened
                        </label>
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

function renderBranchTablesTab(config: any) {
    const container = document.getElementById('branch-tables-content');
    if (!container) {
        return;
    }

    const sharedTables = config.sharedBranchTables || { 'Default Rules': { rules: [] } };
    const repoRules = config.repoRules || [];

    // Calculate usage counts and track which repos use each table
    const usageCounts: { [tableName: string]: number } = {};
    const usedByRepos: { [tableName: string]: Array<{ qualifier: string; index: number }> } = {};
    for (const tableName in sharedTables) {
        usageCounts[tableName] = 0;
        usedByRepos[tableName] = [];
    }
    for (let i = 0; i < repoRules.length; i++) {
        const repo = repoRules[i];
        const tableName = repo.branchTableName;
        // Skip undefined (No Branch Table)
        if (tableName && usageCounts[tableName] !== undefined) {
            usageCounts[tableName]++;
            usedByRepos[tableName].push({ qualifier: repo.repoQualifier, index: i });
        }
    }

    let html = '<div class="branch-tables-list">';

    const tableNames = Object.keys(sharedTables).sort((a, b) => {
        if (a === 'Default Rules') return -1;
        if (b === 'Default Rules') return 1;
        return a.localeCompare(b);
    });

    for (const tableName of tableNames) {
        const table = sharedTables[tableName];
        const usageCount = usageCounts[tableName] || 0;
        const ruleCount = table.rules ? table.rules.length : 0;
        const repoList = usedByRepos[tableName] || [];

        // Build the repo list HTML with bullets and clickable links
        let repoListHtml = '';
        if (repoList.length > 0) {
            repoListHtml = repoList
                .map((repoInfo, index) => {
                    const bullet =
                        index > 0
                            ? '<span class="codicon codicon-circle-small-filled" style="font-size: 6px; vertical-align: middle; margin: 0 4px;"></span>'
                            : '';
                    return `${bullet}<a href="#" class="repo-link" data-repo-index="${repoInfo.index}" style="font-style: italic; color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer;">${escapeHtml(repoInfo.qualifier)}</a>`;
                })
                .join('');
        }

        html += `
            <div class="branch-table-item">
                <div class="branch-table-grid">
                    <div class="branch-table-name">
                        <span class="codicon codicon-git-branch"></span>
                        <span>${escapeHtml(tableName)}</span>
                    </div>
                    <div class="branch-table-rule-count">
                        ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}
                    </div>
                    <div class="branch-table-references">
                        ${usageCount} repo rule${usageCount !== 1 ? 's' : ''}
                    </div>
                    <div class="branch-table-repo-list">
                        ${repoListHtml}
                    </div>
                </div>
                <div class="branch-table-actions">
                    <button type="button" 
                            class="vscode-button secondary"
                            onclick="deleteBranchTableFromMgmt('${escapeHtml(tableName).replace(/'/g, "\\'")}')"
                            ${usageCount > 0 ? 'disabled' : ''}
                            data-tooltip="${usageCount > 0 ? 'Table is in use by ' + usageCount + ' repo rule' + (usageCount !== 1 ? 's' : '') : 'Delete this table'}">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderColorReport(config: any) {
    const container = document.getElementById('reportContent');
    if (!container) {
        return;
    }

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
    let branchTableName = '';

    if (config.previewBranchRuleContext) {
        branchRuleIndex = config.previewBranchRuleContext.index;
        branchTableName = config.previewBranchRuleContext.tableName || '';
    }

    let matchedBranchRule = null;
    if (branchRuleIndex >= 0 && branchTableName && config.sharedBranchTables?.[branchTableName]) {
        // Get branch rule from shared table
        matchedBranchRule = config.sharedBranchTables[branchTableName].rules[branchRuleIndex];
    }

    // Helper function to determine source for each theme key
    const getSourceForKey = (key: string): { description: string; gotoData: string } => {
        // Activity bar colors typically come from branch rules when a branch rule is matched
        // Otherwise they come from repo rules
        const isActivityBarKey = key.startsWith('activityBar.');

        if (isActivityBarKey && matchedBranchRule) {
            const pattern = escapeHtml(matchedBranchRule.pattern);
            const gotoData = `branch:${branchRuleIndex}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `Branch Rule from "${escapeHtml(branchTableName)}": "<span class="goto-link" data-goto="${gotoData}">${escapeHtml(pattern)}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const branchColorDisplay = extractColorForTheme(matchedBranchRule.color);
            const color = escapeHtml(branchColorDisplay || '(no color)');
            return {
                description: `Branch Rule from "${escapeHtml(branchTableName)}": "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
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
            const repoColorDisplay = extractColorForTheme(matchedRepoRule.primaryColor);
            const primaryColor = escapeHtml(repoColorDisplay || '(no color)');
            return {
                description: `Repository Rule: "<span class="goto-link" data-goto="${gotoData}">${qualifier}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${primaryColor}</span>)`,
                gotoData: gotoData,
            };
        }

        if (matchedBranchRule) {
            const pattern = escapeHtml(matchedBranchRule.pattern);
            const gotoData = `branch:${branchRuleIndex}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `Branch Rule from "${escapeHtml(branchTableName)}": "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const color = escapeHtml(matchedBranchRule.color);
            return {
                description: `Branch Rule from "${escapeHtml(branchTableName)}": "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
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
                const branchColorName =
                    typeof matchedBranchRule.color === 'string' ? matchedBranchRule.color : undefined;
                const branchProfileName =
                    matchedBranchRule.profileName ||
                    (branchColorName && currentConfig?.advancedProfiles?.[branchColorName] ? branchColorName : null);
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
                const repoPrimaryColorName =
                    typeof matchedRepoRule.primaryColor === 'string' ? matchedRepoRule.primaryColor : undefined;
                const repoProfileName =
                    matchedRepoRule.profileName ||
                    (repoPrimaryColorName && currentConfig?.advancedProfiles?.[repoPrimaryColorName]
                        ? repoPrimaryColorName
                        : null);
                if (repoProfileName) {
                    gotoTarget = `data-goto="profile" data-profile-name="${escapeHtml(repoProfileName)}" data-theme-key="${escapeHtml(key)}"`;
                } else {
                    gotoTarget = `data-goto="repo:${config.matchingIndexes.repoRule}"`;
                }
            } else if (matchedBranchRule) {
                // Check if branch rule uses a profile
                const branchColorName =
                    typeof matchedBranchRule.color === 'string' ? matchedBranchRule.color : undefined;
                const branchProfileName =
                    matchedBranchRule.profileName ||
                    (branchColorName && currentConfig?.advancedProfiles?.[branchColorName] ? branchColorName : null);
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
            const branchContext = config.previewBranchRuleContext;
            const tableName = branchContext.tableName || '';
            const branchRules = config.sharedBranchTables?.[tableName]?.rules || [];
            const branchRule = branchRules?.[branchContext.index];

            if (branchRule) {
                previewParts.push(
                    `<strong>Branch Rule from "${escapeHtml(tableName)}"</strong>: "<strong>${escapeHtml(branchRule.pattern)}</strong>"`,
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

    container.innerHTML = tableHTML;
}

function updateProfilesTabVisibility() {
    // Profiles are always enabled, so always show the tab
    const profilesTab = document.getElementById('tab-profiles');
    if (profilesTab) {
        profilesTab.style.display = '';
    }
}

function handlePreviewModeChange() {
    const checkbox = document.getElementById('preview-selected-repo-rule') as HTMLInputElement;
    if (!checkbox) return;

    previewMode = checkbox.checked;

    // Mark hint as shown if user manually enables preview
    if (previewMode) {
        hintManager.markShown('previewSelectedRule');
    }

    if (previewMode) {
        // If enabling preview and a rule is selected, send preview message
        // Prioritize branch rule if selected, otherwise use repo rule
        if (selectedBranchRuleIndex !== null && selectedBranchRuleIndex !== -1) {
            // Determine which table we're using
            let tableName = '__none__';
            if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
                const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
                tableName = selectedRule.branchTableName || '__none__';
            }

            vscode.postMessage({
                command: 'previewBranchRule',
                data: {
                    index: selectedBranchRuleIndex,
                    tableName,
                    repoIndex: selectedRepoRuleIndex,
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

        // Show preview toast
        showPreviewToast();
    } else {
        // If disabling preview, send clear message with preview disabled flag
        vscode.postMessage({
            command: 'clearPreview',
            data: {
                previewEnabled: false,
            },
        });

        // Hide preview toast
        hidePreviewToast();
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

    // LOG: Trace where the flow is going

    // Check if workspace is a git repo or local folder
    const isGitRepo = currentConfig.workspaceInfo?.isGitRepo !== false;
    let repoQualifier = '';

    if (isGitRepo) {
        // Git repository - extract repo name from URL
        repoQualifier = extractRepoNameFromUrl(currentConfig.workspaceInfo?.repositoryUrl || '');
    } else {
        // Local folder - create pattern with ! prefix and env var substitution
        const folderPath = currentConfig.workspaceInfo?.repositoryUrl || '';
        if (folderPath) {
            // Send message to backend to simplify path
            vscode.postMessage({
                command: 'simplifyPath',
                data: { path: folderPath },
            });
            // Will receive response via 'pathSimplified' message
            return; // Exit early, will complete in message handler
        }
    }

    const randomColor = getThemeAppropriateColor();
    const newRule = {
        repoQualifier: repoQualifier,
        primaryColor: createThemedColorInWebview(randomColor),
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
    const randomColor = getThemeAppropriateColor();
    const newRule = {
        pattern: randomDefectName,
        color: createThemedColorInWebview(randomColor),
        enabled: true,
    };

    // Determine which table to add to
    let tableName = '__none__'; // Default
    if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        tableName = selectedRule.branchTableName || '__none__';
    }

    // Don't allow adding if no table is selected
    if (tableName === '__none__') {
        showMessageDialog({
            title: 'Cannot Add Rule',
            message:
                'Cannot add branch rule: No branch table selected for this repository. Please select a table first.',
        });
        return;
    }

    // Add to the table
    if (currentConfig.sharedBranchTables && currentConfig.sharedBranchTables[tableName]) {
        currentConfig.sharedBranchTables[tableName].rules.push(newRule);
    } else {
        showMessageDialog({
            title: 'Table Not Found',
            message: 'Selected table does not exist. Please select an existing table.',
        });
        return;
    }

    sendConfiguration();
}

function updateRepoRule(index: number, field: string, value: string) {
    if (!currentConfig?.repoRules?.[index]) return;

    currentConfig.repoRules[index][field] = value;
    debounceValidateAndSend();
}

function updateBranchRule(index: number, field: string, value: string) {
    // Determine which table to update
    let tableName = '__none__'; // Default
    if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        tableName = selectedRule.branchTableName || '__none__';
    }

    // Can't update if no table selected
    if (tableName === '__none__') {
        return;
    }

    // Update the rule in the table
    if (currentConfig?.sharedBranchTables?.[tableName]?.rules?.[index]) {
        currentConfig.sharedBranchTables[tableName].rules[index][field] = value;
    }

    debounceValidateAndSend();
}

function selectRepoRule(index: number) {
    if (!currentConfig?.repoRules?.[index]) {
        return;
    }

    // Toggle: if clicking the already-selected rule, deselect it
    if (selectedRepoRuleIndex === index) {
        selectedRepoRuleIndex = -1;
        selectedBranchRuleIndex = -1;

        // Clear preview when deselecting
        if (previewMode) {
            vscode.postMessage({
                command: 'clearPreview',
                data: {
                    previewEnabled: true,
                },
            });
        }

        // Re-render to show deselected state
        renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
        renderBranchRulesForSelectedRepo();
        hidePreviewToast();
        return;
    }

    selectedRepoRuleIndex = index;

    // Reset branch rule selection when switching repos so it reinitializes
    selectedBranchRuleIndex = -1;

    // Clear any regex validation errors when switching rules
    clearRegexValidationError();

    // Send preview command only if preview mode is enabled
    if (previewMode) {
        // Check if this repo has no branch table or empty branch table
        // If so, include clearBranchPreview flag to avoid double doit() calls
        const selectedRule = currentConfig.repoRules[index];
        const tableName = selectedRule.branchTableName || '__none__';
        const branchTable = currentConfig.sharedBranchTables?.[tableName];
        const hasBranchRules = tableName !== '__none__' && branchTable?.rules && branchTable.rules.length > 0;

        vscode.postMessage({
            command: 'previewRepoRule',
            data: {
                index,
                previewEnabled: true,
                clearBranchPreview: !hasBranchRules,
            },
        });
    }

    // Re-render repo rules to update selected state and preview styling
    renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);

    // Re-render other settings to update disabled state of color options
    renderOtherSettings(currentConfig.otherSettings);

    // Update toast if preview mode is enabled
    // Show toast only if the selected rule is different from the matching rule
    const matchingRuleIndex = currentConfig.matchingIndexes?.repoRule ?? -1;
    const isPreviewingDifferentRule = selectedRepoRuleIndex !== matchingRuleIndex;
    if (previewMode && isPreviewingDifferentRule) {
        showPreviewToast();
    } else {
        hidePreviewToast();
    }

    // Show preview hint when selecting a non-matching rule (if preview mode is not already enabled)
    const previewCheckbox = document.getElementById('preview-selected-repo-rule');
    hintManager.tryShow('previewSelectedRule', previewCheckbox, () => !previewMode && isPreviewingDifferentRule);

    // Render branch rules for the selected repo
    renderBranchRulesForSelectedRepo();
}

function navigateToRepoRule(index: number) {
    // Switch to the Rules tab
    const rulesTab = document.getElementById('tab-rules');
    if (rulesTab) {
        rulesTab.click();
    }

    // Select the repo rule
    selectRepoRule(index);
}

function selectBranchRule(index: number) {
    // Determine which table we're selecting from
    let tableName = '__none__'; // Default
    if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        tableName = selectedRule.branchTableName || '__none__';
    }

    // Can't select if no table selected
    if (tableName === '__none__') {
        return;
    }

    const branchRules = currentConfig?.sharedBranchTables?.[tableName]?.rules || [];

    if (!branchRules?.[index]) {
        return;
    }

    // Toggle: if clicking the already-selected rule, deselect it
    if (selectedBranchRuleIndex === index) {
        selectedBranchRuleIndex = -1;

        // Clear branch preview when deselecting
        if (previewMode) {
            // Revert to just repo rule preview
            vscode.postMessage({
                command: 'previewRepoRule',
                data: {
                    index: selectedRepoRuleIndex,
                    previewEnabled: true,
                    clearBranchPreview: true,
                },
            });

            // Update toast - still showing preview if repo rule differs from matching
            const matchingRepoIndex = currentConfig?.matchingIndexes?.repoRule ?? -1;
            const isPreviewingDifferentRepoRule = selectedRepoRuleIndex !== matchingRepoIndex;

            if (isPreviewingDifferentRepoRule) {
                showPreviewToast();
            } else {
                hidePreviewToast();
            }
        }

        // Re-render to show deselected state
        renderBranchRulesForSelectedRepo();
        return;
    }

    selectedBranchRuleIndex = index;

    // Clear any regex validation errors when switching rules
    clearRegexValidationError();

    // Send preview command only if preview mode is enabled
    if (previewMode) {
        vscode.postMessage({
            command: 'previewBranchRule',
            data: {
                index,
                tableName,
                repoIndex: selectedRepoRuleIndex,
            },
        });
    } else {
    }

    // Update toast if preview mode is enabled
    // Show toast only if the selected rules differ from the matching rules
    const matchingRepoIndex = currentConfig?.matchingIndexes?.repoRule ?? -1;
    const matchingBranchIndex = currentConfig?.matchingIndexes?.branchRule ?? -1;
    const isPreviewingDifferentRule =
        selectedRepoRuleIndex !== matchingRepoIndex || selectedBranchRuleIndex !== matchingBranchIndex;

    if (previewMode && isPreviewingDifferentRule) {
        showPreviewToast();
    } else {
        hidePreviewToast();
    }

    // Re-render branch rules to update selected state and preview styling
    renderBranchRulesForSelectedRepo();
}

function changeBranchMode(index: number, useGlobal: boolean) {
    if (!currentConfig?.repoRules?.[index]) return;

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

function changeBranchTable(index: number, tableName: string) {
    if (!currentConfig?.repoRules?.[index]) return;

    // Store '__none__' for No Branch Table, table name string for specific table
    currentConfig.repoRules[index].branchTableName = tableName;

    // Reset branch rule selection when changing tables so it reinitializes
    if (selectedRepoRuleIndex === index) {
        selectedBranchRuleIndex = -1;

        // Re-render branch rules for this repo only
        renderBranchRulesForSelectedRepo();
    }

    // Use debounced send like other update functions to prevent race conditions
    debounceValidateAndSend();
}

async function showCreateTableDialog(repoRuleIndex: number) {
    const tableName = await showInputDialog({
        title: 'Create New Branch Table',
        inputLabel: 'Table Name:',
        inputPlaceholder: 'Enter table name',
        confirmText: 'Create',
        cancelText: 'Cancel',
        validateInput: (value: string) => {
            const trimmedName = value.trim();
            if (!trimmedName) {
                return 'Table name cannot be empty';
            }
            if (currentConfig?.sharedBranchTables?.[trimmedName]) {
                return `A table named "${trimmedName}" already exists`;
            }
            return null; // Valid
        },
    });

    if (!tableName) {
        return; // User cancelled
    }

    // Name is already validated by the dialog
    const trimmedName = tableName.trim();

    // Create the new table via backend command
    vscode.postMessage({
        command: 'createBranchTable',
        data: {
            tableName: trimmedName,
            repoRuleIndex: repoRuleIndex,
        },
    });

    // The backend will send updated config back, which will trigger a refresh
    // For now, optimistically update the UI
    if (currentConfig && currentConfig.sharedBranchTables) {
        currentConfig.sharedBranchTables[trimmedName] = {
            rules: [],
        };

        // Check if this is the second table (first user-created table)
        // and show the Copy From hint
        const tableCount = Object.keys(currentConfig.sharedBranchTables).length;
        if (tableCount === 2) {
            // Delay showing the hint until after the UI updates
            setTimeout(() => {
                const copyFromBtn = document.querySelector('.copy-from-button');
                if (copyFromBtn) {
                    hintManager.tryShow('copyFromButton', copyFromBtn as HTMLElement);
                }
            }, 500);
        }

        // Update the repo rule to use the new table
        if (currentConfig.repoRules?.[repoRuleIndex]) {
            currentConfig.repoRules[repoRuleIndex].branchTableName = trimmedName;
        }

        // Select this repo rule so the Branch Rules section shows the new table
        selectedRepoRuleIndex = repoRuleIndex;

        // Backend will update the repo rule and send back updated config
        // No need to call debounceValidateAndSend here - backend handles it atomically
    }
}

function viewBranchTable(tableName: string) {
    // Switch to Rules tab and filter to show only repos using this table
    const rulesTab = document.getElementById('tab-rules') as HTMLButtonElement;
    if (rulesTab) {
        rulesTab.click();
    }

    // TODO: Could add filtering/highlighting here to show only repos using this table
    // For now, just switch to the Rules tab where users can see table assignments
}

async function renameBranchTableFromMgmt(tableName: string) {
    const table = currentConfig?.sharedBranchTables?.[tableName];
    if (!table) return;

    const newName = await showInputDialog({
        title: 'Rename Branch Table',
        inputLabel: `Rename "${tableName}" to:`,
        inputValue: tableName,
        confirmText: 'Rename',
        cancelText: 'Cancel',
        validateInput: (value: string) => {
            const trimmedName = value.trim();
            if (!trimmedName) {
                return 'Table name cannot be empty';
            }
            if (trimmedName !== tableName && currentConfig?.sharedBranchTables?.[trimmedName]) {
                return `A table named "${trimmedName}" already exists`;
            }
            return null; // Valid
        },
    });

    if (!newName || newName === tableName) {
        return; // User cancelled or no change
    }

    // Name is already validated by the dialog
    const trimmedName = newName.trim();

    // Send rename command to backend
    vscode.postMessage({
        command: 'renameBranchTable',
        data: { oldName: tableName, newName: trimmedName },
    });
}

async function deleteBranchTableFromMgmt(tableName: string) {
    const table = currentConfig?.sharedBranchTables?.[tableName];
    if (!table) return;

    // Check usage count
    const repos = currentConfig?.repoRules || [];
    const usageCount = repos.filter((r: any) => r.branchTableName === tableName).length;

    if (usageCount > 0) {
        await showMessageDialog({
            title: 'Cannot Delete Table',
            message: `Cannot delete table "${tableName}" because it is being used by ${usageCount} repo rule${usageCount !== 1 ? 's' : ''}. Please reassign those repos to different tables first.`,
        });
        return;
    }

    const ruleCount = table.rules ? table.rules.length : 0;
    const confirmMsg =
        ruleCount > 0
            ? `Delete table "${tableName}"? This will permanently delete ${ruleCount} branch rule(s).`
            : `Delete table "${tableName}"?`;

    const confirmed = await showMessageDialog({
        title: 'Confirm Deletion',
        message: confirmMsg,
        confirmText: 'Delete',
        cancelText: 'Cancel',
    });
    if (!confirmed) {
        return;
    }

    // Send delete command to backend
    vscode.postMessage({
        command: 'deleteBranchTable',
        data: { tableName },
    });
}

function renderBranchRulesForSelectedRepo() {
    if (!currentConfig || selectedRepoRuleIndex === -1) {
        return;
    }

    const selectedRule = currentConfig.repoRules?.[selectedRepoRuleIndex];
    if (!selectedRule) {
        return;
    }

    // Check if this is a local folder rule
    const isLocalFolderRule = selectedRule.repoQualifier && selectedRule.repoQualifier.startsWith('!');

    if (isLocalFolderRule) {
        // Local folder rules don't support branch rules
        const header = document.querySelector('#branch-rules-heading');
        if (header) {
            header.innerHTML = `<span class="codicon codicon-folder"></span> Local Folder Rule`;
        }

        // Hide the section help text
        const sectionHelp = document.querySelector('.branch-panel .section-help');
        if (sectionHelp) {
            (sectionHelp as HTMLElement).style.display = 'none';
        }

        // Hide the Copy From and Add buttons for local folder rules
        updateCopyFromButton(false);
        updateBranchAddButton(false);

        // Show a message explaining local folder rules don't support branch tables
        const container = document.getElementById('branchRulesContent');
        if (container) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                    <div style="font-size: 48px; margin-bottom: 16px;">
                        <span class="codicon codicon-folder"></span>
                    </div>
                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">
                        Local Folder Rules
                    </div>
                    <div style="font-size: 12px; line-height: 1.6; max-width: 400px; margin: 0 auto;">
                        Branch rules are not supported for local folder rules. 
                        Local folders are not git repositories and don't have branches.
                    </div>
                </div>
            `;
        }
        return;
    }

    // Show the section help text for non-local-folder rules
    const sectionHelp = document.querySelector('.branch-panel .section-help');
    if (sectionHelp) {
        (sectionHelp as HTMLElement).style.display = '';
    }

    // Get table name - default to '__none__' if not set
    const tableName = selectedRule.branchTableName || '__none__';

    // If no table selected, show empty message
    if (!tableName || tableName === '__none__') {
        const header = document.querySelector('#branch-rules-heading');
        if (header) {
            header.innerHTML = `<span class="codicon codicon-circle-slash"></span> No Branch Table`;
        }
        // Hide the Copy From and Add buttons when no table is selected
        updateCopyFromButton(false);
        updateBranchAddButton(false);
        renderBranchRules([], undefined, selectedRepoRuleIndex);
        return;
    }

    const branchTable = currentConfig.sharedBranchTables?.[tableName];
    const branchRules = branchTable?.rules || [];

    // Update section header with editable table name
    const header = document.querySelector('#branch-rules-heading');
    if (header) {
        renderBranchRulesHeader(tableName);
    }

    // Show/hide Copy From button (show for all tables)
    updateCopyFromButton(true);
    updateBranchAddButton(true);

    renderBranchRules(branchRules, currentConfig.matchingIndexes?.branchRule, selectedRepoRuleIndex);
}

function renderBranchRulesHeader(tableName: string) {
    const header = document.querySelector('#branch-rules-heading');
    if (!header) return;

    header.innerHTML = '';

    // Create icon
    const icon = document.createElement('span');
    icon.className = 'codicon codicon-git-branch';
    icon.style.marginRight = '0px';
    header.appendChild(icon);

    // Create "Branch Rules" text
    const prefixText = document.createElement('span');
    prefixText.textContent = 'Branch Rules Table: ';
    header.appendChild(prefixText);

    // Create a wrapper for input and edit icon
    const inputWrapper = document.createElement('span');
    inputWrapper.style.position = 'relative';
    inputWrapper.style.display = 'inline-block';
    inputWrapper.style.cursor = 'pointer';
    inputWrapper.title = 'Click to rename table';
    header.appendChild(inputWrapper);

    // Create table name text
    const nameText = document.createElement('span');
    nameText.textContent = tableName;
    nameText.style.color = 'inherit';
    nameText.style.fontSize = 'inherit';
    nameText.style.fontWeight = 'inherit';
    nameText.style.padding = '2px 4px';
    nameText.style.paddingRight = '20px'; // Make room for edit icon
    inputWrapper.appendChild(nameText);

    // Create small edit icon
    const editIcon = document.createElement('span');
    editIcon.className = 'codicon codicon-edit';
    editIcon.style.position = 'absolute';
    editIcon.style.right = '4px';
    editIcon.style.top = '50%';
    editIcon.style.transform = 'translateY(-50%)';
    editIcon.style.fontSize = '11px';
    editIcon.style.opacity = '0.6';
    inputWrapper.appendChild(editIcon);

    // Click handler to open rename dialog
    inputWrapper.addEventListener('click', async () => {
        await renameBranchTableFromMgmt(tableName);
    });
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
    copyBtn.setAttribute('data-tooltip', 'Copy branch rules from another branch table.');
    copyBtn.setAttribute('data-tooltip-position', 'left');
    copyBtn.setAttribute('aria-label', 'Copy branch rules from another branch table.');

    // Insert before the Add button in the container
    if (addBtn) {
        buttonContainer.insertBefore(copyBtn, addBtn);
    }

    // Add click handler to show dropdown
    copyBtn.addEventListener('click', showCopyFromMenu);
}

function updateBranchAddButton(enableButton: boolean) {
    const addBtn = document.querySelector('.branch-add-button') as HTMLButtonElement;
    if (!addBtn) return;

    if (enableButton) {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.title = 'Add a new branch rule';
    } else {
        addBtn.disabled = true;
        addBtn.style.opacity = '0.5';
        addBtn.title = 'Select a branch table to add rules';
    }
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

    // Get the current table name (the one we're copying TO)
    const currentTableName =
        selectedRepoRuleIndex >= 0
            ? currentConfig?.repoRules?.[selectedRepoRuleIndex]?.branchTableName || '__none__'
            : '__none__';

    // Add options for shared branch tables (excluding the current table)
    if (currentConfig?.sharedBranchTables) {
        for (const tableName in currentConfig.sharedBranchTables) {
            if (tableName === currentTableName) continue; // Skip current table
            const table = currentConfig.sharedBranchTables[tableName];
            if (!table.rules || table.rules.length === 0) continue; // Skip empty

            // Table header - copies all rules
            const tableHeader = document.createElement('button');
            tableHeader.type = 'button';
            tableHeader.className = 'copy-from-option copy-from-table-header';
            tableHeader.innerHTML = `<span class="codicon codicon-table"></span> ${tableName} <span class="copy-from-count">(all ${table.rules.length})</span>`;
            tableHeader.setAttribute('role', 'menuitem');
            tableHeader.setAttribute('data-source-type', 'table');
            tableHeader.setAttribute('data-source-table', tableName);
            menu.appendChild(tableHeader);

            // Individual rules from this table
            table.rules.forEach((rule: any, ruleIndex: number) => {
                const ruleOption = document.createElement('button');
                ruleOption.type = 'button';
                ruleOption.className = 'copy-from-option copy-from-rule';
                const patternDisplay = rule.pattern.length > 25 ? rule.pattern.substring(0, 22) + '...' : rule.pattern;
                ruleOption.innerHTML = `<span class="copy-from-rule-color" style="background-color: ${rule.color || '#888'};"></span> ${patternDisplay}`;
                ruleOption.setAttribute('role', 'menuitem');
                ruleOption.setAttribute('data-source-type', 'table-rule');
                ruleOption.setAttribute('data-source-table', tableName);
                ruleOption.setAttribute('data-source-rule-index', String(ruleIndex));
                ruleOption.title = rule.pattern; // Full pattern in tooltip
                menu.appendChild(ruleOption);
            });
        }
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
    // Find the button element (might click on inner span)
    let target = event.target as HTMLElement;
    while (target && !target.classList.contains('copy-from-option')) {
        target = target.parentElement as HTMLElement;
    }
    if (!target || !target.classList.contains('copy-from-option')) return;

    event.preventDefault();
    event.stopPropagation();

    const sourceType = target.getAttribute('data-source-type');
    const sourceIndex = target.getAttribute('data-source-index');
    const sourceTable = target.getAttribute('data-source-table');
    const sourceRuleIndex = target.getAttribute('data-source-rule-index');

    if (sourceType === 'table' && sourceTable) {
        copyBranchRulesFrom('table', -1, sourceTable);
    } else if (sourceType === 'table-rule' && sourceTable && sourceRuleIndex !== null) {
        copyBranchRulesFrom('table-rule', parseInt(sourceRuleIndex, 10), sourceTable);
    } else if (sourceType === 'global') {
        copyBranchRulesFrom('global', -1);
    } else if (sourceType === 'global-rule' && sourceRuleIndex !== null) {
        copyBranchRulesFrom('global-rule', parseInt(sourceRuleIndex, 10));
    } else if (sourceType === 'repo' && sourceIndex !== null) {
        copyBranchRulesFrom('repo', parseInt(sourceIndex, 10));
    } else if (sourceType === 'repo-rule' && sourceIndex !== null && sourceRuleIndex !== null) {
        copyBranchRulesFrom('repo-rule', parseInt(sourceIndex, 10), undefined, parseInt(sourceRuleIndex, 10));
    }

    // Remove menu
    const menu = document.querySelector('.copy-from-menu');
    if (menu) menu.remove();
}

function copyBranchRulesFrom(
    sourceType: 'global' | 'repo' | 'table' | 'table-rule' | 'global-rule' | 'repo-rule',
    sourceIndex: number,
    sourceTableName?: string,
    sourceRuleIndex?: number,
) {
    if (!currentConfig || selectedRepoRuleIndex === -1) return;

    const selectedRule = currentConfig.repoRules?.[selectedRepoRuleIndex];
    if (!selectedRule) return;

    // Get source rules
    let sourceRules: any[] = [];
    if (sourceType === 'table' && sourceTableName) {
        const sourceTable = currentConfig.sharedBranchTables?.[sourceTableName];
        if (sourceTable) {
            sourceRules = sourceTable.rules || [];
        }
    } else if (sourceType === 'table-rule' && sourceTableName) {
        // Copy a single rule from a table
        const sourceTable = currentConfig.sharedBranchTables?.[sourceTableName];
        if (sourceTable?.rules?.[sourceIndex]) {
            sourceRules = [sourceTable.rules[sourceIndex]];
        }
    } else if (sourceType === 'repo') {
        const sourceRepo = currentConfig.repoRules?.[sourceIndex];
        if (sourceRepo) {
            sourceRules = sourceRepo.branchRules || [];
        }
    } else if (sourceType === 'repo-rule' && sourceRuleIndex !== undefined) {
        // Copy a single rule from a repo
        const sourceRepo = currentConfig.repoRules?.[sourceIndex];
        if (sourceRepo?.branchRules?.[sourceRuleIndex]) {
            sourceRules = [sourceRepo.branchRules[sourceRuleIndex]];
        }
    }

    if (sourceRules.length === 0) return;

    // Determine the target: shared branch table or local rules
    const targetTableName = selectedRule.branchTableName;

    if (targetTableName && targetTableName !== '__none__' && currentConfig.sharedBranchTables?.[targetTableName]) {
        // Copy to shared branch table
        const targetTable = currentConfig.sharedBranchTables[targetTableName];
        if (!targetTable.rules) {
            targetTable.rules = [];
        }

        // Deep clone and append rules
        sourceRules.forEach((rule) => {
            const clonedRule = {
                pattern: rule.pattern,
                color: rule.color,
                enabled: rule.enabled !== false, // Default to true
            };
            targetTable.rules.push(clonedRule);
        });
    } else {
        // Fallback: copy to local branchRules (legacy behavior)
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
    }

    // Re-render
    renderBranchRulesForSelectedRepo();
    debounceValidateAndSend();
}

function updateColorRule(ruleType: string, index: number, field: string, value: string) {
    if (!currentConfig) return;

    // For color fields (primaryColor or color), send themed color update to extension
    if ((field === 'primaryColor' || field === 'color') && value && !currentConfig.advancedProfiles?.[value]) {
        //Send themed color update message
        const messageData: any = {
            type: ruleType,
            index: index,
            color: value,
        };

        let clearProfileName = false;
        // For branch rules in shared tables, include table name
        if (ruleType === 'branch' && selectedRepoRuleIndex >= 0) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            if (selectedRule?.branchTableName) {
                messageData.tableName = selectedRule.branchTableName;
            } else {
                console.error('[updateColorRule] Branch rule but no branchTableName!', selectedRule);
            }
            const tableName = selectedRule.branchTableName;
            if (tableName && currentConfig.sharedBranchTables?.[tableName]?.rules?.[index]) {
                const branchRule = currentConfig.sharedBranchTables[tableName].rules[index];
                branchRule[field] = value;
                if (field === 'color' && branchRule.profileName) {
                    delete branchRule.profileName;
                    clearProfileName = true;
                }
            }
        } else if (ruleType === 'repo') {
            const rules = currentConfig.repoRules;
            if (rules?.[index]) {
                const repoRule = rules[index];
                repoRule[field] = value;
                if (field === 'primaryColor' && repoRule.profileName) {
                    delete repoRule.profileName;
                    clearProfileName = true;
                }
            }
        }

        if (clearProfileName) {
            messageData.clearProfileName = true;
        }

        vscode.postMessage({
            command: 'updateThemedColor',
            data: messageData,
        });

        // Update color swatch
        updateColorSwatch(ruleType, index, field, value);
        return;
    }

    // For non-color fields or profile references, use existing logic
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
        // Branch rules are now in shared tables
        if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const tableName = selectedRule.branchTableName;

            if (tableName && currentConfig.sharedBranchTables?.[tableName]?.rules?.[index]) {
                currentConfig.sharedBranchTables[tableName].rules[index][field] = value;

                // If updating color with a profile name, also set the profileName field
                if (field === 'color' && value && currentConfig.advancedProfiles?.[value]) {
                    currentConfig.sharedBranchTables[tableName].rules[index].profileName = value;
                } else if (field === 'color') {
                    delete currentConfig.sharedBranchTables[tableName].rules[index].profileName;
                }
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
    const colorInput = document.getElementById(`${ruleType}-${field}-${index}`) as HTMLInputElement;
    if (colorInput && colorInput.type === 'color') {
        // Convert any color format to hex for the native color input (handles profile names)
        const hexColor = getRepresentativeColor(value);
        colorInput.value = hexColor;
    }

    // Update the swatch background for non-native color picker (only if swatch exists)
    const swatch = colorInput?.parentElement?.querySelector('.color-swatch') as HTMLElement;

    if (swatch) {
        // For named colors and other formats, resolve profile names then convert to valid CSS color
        const resolvedColor = getRepresentativeColor(value);
        const displayColor = convertColorToValidCSS(resolvedColor) || '#4A90E2';
        swatch.style.backgroundColor = displayColor;
    } else {
        // No swatch element found - using native color picker`);
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

// Handle shift-click on color inputs to generate random colors
function handleColorInputClick(event: MouseEvent) {
    const target = event.target as HTMLInputElement;
    if (!target.classList.contains('native-color-input') && !target.classList.contains('color-swatch')) {
        return;
    }

    // Check for regular click on repo rule color input to navigate to profile
    if (!event.shiftKey && target.classList.contains('native-color-input')) {
        const dataAction = target.getAttribute('data-action');
        if (dataAction) {
            const match = dataAction.match(/updateColorRule\('(\w+)', (\d+), '(\w+)',/);
            if (match) {
                const [, ruleType, index] = match;
                if (ruleType === 'repo') {
                    const rules = currentConfig?.repoRules;
                    const rule = rules?.[parseInt(index)];
                    if (rule) {
                        // Check if this rule uses a profile
                        const primaryColorName = typeof rule.primaryColor === 'string' ? rule.primaryColor : undefined;
                        const colorValue = rule.profileName || primaryColorName;
                        const advancedProfiles = currentConfig?.advancedProfiles || {};

                        // If the color value is a profile name, navigate to Profiles tab
                        if (colorValue && advancedProfiles[colorValue]) {
                            event.preventDefault();
                            const profilesTab = document.getElementById('tab-profiles') as HTMLElement;
                            if (profilesTab) {
                                profilesTab.click();
                            }
                            selectProfile(colorValue);
                            return;
                        }
                    }
                }
            }
        }
    }

    if (event.shiftKey) {
        event.preventDefault();

        // For repository/branch rules tables
        const dataAction = target.getAttribute('data-action');
        if (dataAction) {
            const match = dataAction.match(/updateColorRule\('(\w+)', (\d+), '(\w+)',/);
            if (match) {
                const [, ruleType, index, field] = match;
                generateRandomColor(ruleType, parseInt(index), field);
                return;
            }
        }

        // For palette editor and mappings - generate random color directly
        const randomColor = getThemeAppropriateColor();
        if (target.type === 'color') {
            target.value = convertColorToHex(randomColor);
            // Trigger change event to update associated text input
            target.dispatchEvent(new Event('change', { bubbles: true }));
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
        // Determine which table to update
        let tableName = '__none__';
        if (selectedRepoRuleIndex >= 0 && currentConfig?.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            tableName = selectedRule.branchTableName || '__none__';
        }

        // Can't update if no table selected
        if (tableName === '__none__') return;

        // Update the rule in the shared branch table
        if (!currentConfig?.sharedBranchTables?.[tableName]?.rules?.[index]) return;
        currentConfig.sharedBranchTables[tableName].rules[index][field] = randomColor;
        // Clear profileName when generating a random color
        delete currentConfig.sharedBranchTables[tableName].rules[index].profileName;
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
    if (!currentConfig) return;

    let rules;
    if (ruleType === 'repo') {
        rules = currentConfig.repoRules;
    } else {
        // For branch rules, get from the selected table
        if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const tableName = selectedRule.branchTableName || '__none__';

            if (tableName !== '__none__' && currentConfig.sharedBranchTables?.[tableName]) {
                rules = currentConfig.sharedBranchTables[tableName].rules;
            }
        }
    }

    if (!rules) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rules.length) {
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
        // For branch rules, get from the selected table
        if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
            const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
            const tableName = selectedRule.branchTableName || '__none__';

            if (tableName !== '__none__' && currentConfig.sharedBranchTables?.[tableName]) {
                rules = currentConfig.sharedBranchTables[tableName].rules;
            }
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

                // Select the repo rule to show its local branch rules
                const repoContainer = document.getElementById('repoRulesContent');
                if (repoContainer) {
                    const repoRows = repoContainer.querySelectorAll('.rule-row');
                    if (repoRows[repoIndex]) {
                        const repoRadio = repoRows[repoIndex].querySelector('input[type="radio"]') as HTMLInputElement;
                        if (repoRadio) {
                            repoRadio.click();
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

    currentConfig.otherSettings[setting] = value;
    // Send immediately for settings changes (no validation needed)
    sendConfiguration();
}

// Drag and drop functionality
let draggedIndex: number = -1;
let draggedType: string = '';

function getRulesForDrag(ruleType: string) {
    if (!currentConfig) return null;

    if (ruleType === 'repo') {
        return currentConfig.repoRules || null;
    }

    // Legacy single branch rules array
    if (currentConfig.branchRules) {
        return currentConfig.branchRules;
    }

    // Branch table rules scoped to the selected repo rule
    if (selectedRepoRuleIndex >= 0 && currentConfig.repoRules?.[selectedRepoRuleIndex]) {
        const selectedRule = currentConfig.repoRules[selectedRepoRuleIndex];
        const tableName = selectedRule.branchTableName || '__none__';

        if (tableName !== '__none__' && currentConfig.sharedBranchTables?.[tableName]) {
            return currentConfig.sharedBranchTables[tableName].rules;
        }
    }

    return null;
}

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
            if (!ruleType || (draggedType && draggedType !== ruleType)) {
                return;
            }

            const targetIndex = parseInt(dragHandle.getAttribute('data-drag-index') || '0');
            const rules = getRulesForDrag(ruleType);

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

    const rules = getRulesForDrag(targetType);
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

            const primaryColorValue = extractColorForTheme(rule.primaryColor);
            if (!primaryColorValue || !primaryColorValue.trim()) {
                errors.push(`Repository rule ${index + 1}: Primary color is required`);
                markFieldAsError('repo-primaryColor-' + index);
            }
        });
    }

    // Validate branch rules in shared tables
    if (currentConfig?.sharedBranchTables) {
        Object.keys(currentConfig.sharedBranchTables).forEach((tableName) => {
            const table = currentConfig.sharedBranchTables[tableName];
            if (table?.rules) {
                table.rules.forEach((rule: any, index: number) => {
                    if (!rule.pattern?.trim()) {
                        errors.push(`Branch rule ${index + 1} in table "${tableName}": Branch pattern is required`);
                        markFieldAsError('branch-pattern-' + index);
                    }

                    const branchColorValue = extractColorForTheme(rule.color);
                    if (!branchColorValue || !branchColorValue.trim()) {
                        errors.push(`Branch rule ${index + 1} in table "${tableName}": Color is required`);
                        markFieldAsError('branch-color-' + index);
                    }
                });
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
    vscode.postMessage({
        command: 'updateConfig',
        data: currentConfig,
    });
}

function openColorPicker(ruleType: string, index: number, field: string) {
    // Check if this is a profile-based repo rule
    if (ruleType === 'repo' && field === 'primaryColor') {
        const rules = currentConfig?.repoRules;
        const rule = rules?.[index];
        if (rule) {
            // Check if this rule uses a profile
            const primaryColorName = typeof rule.primaryColor === 'string' ? rule.primaryColor : undefined;
            const colorValue = rule.profileName || primaryColorName;
            const advancedProfiles = currentConfig?.advancedProfiles || {};

            // If the color value is a profile name, navigate to Profiles tab
            if (colorValue && advancedProfiles[colorValue]) {
                const profilesTab = document.getElementById('tab-profiles') as HTMLElement;
                if (profilesTab) {
                    profilesTab.click();
                }
                selectProfile(colorValue);
                return;
            }
        }
    }

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
/**
 * Expand environment variables in a path for display in tooltips
 */
function expandEnvVarsForTooltip(pattern: string): string {
    // Get user home directory
    const userHome = (window as any).userInfo?.homeDir || '~';

    let expanded = pattern;

    // Replace ~/ or ~\ or ~ at start
    if (expanded.startsWith('~/') || expanded.startsWith('~\\') || expanded === '~') {
        expanded = expanded.replace(/^~/, userHome);
    }

    // Replace %USERPROFILE%, %APPDATA%, etc. with placeholder text
    // Since we're in the webview, we don't have access to process.env
    // Just show what would be expanded
    expanded = expanded.replace(/%USERPROFILE%/gi, userHome);
    expanded = expanded.replace(/%APPDATA%/gi, userHome + '\\AppData\\Roaming');
    expanded = expanded.replace(/%LOCALAPPDATA%/gi, userHome + '\\AppData\\Local');
    expanded = expanded.replace(/\$HOME/gi, userHome);

    return expanded;
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
        return Boolean(computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent');
    } catch (e) {
        return false;
    }
}

function convertColorToValidCSS(color: string): string {
    if (!color) return '#4A90E2';

    // If it's already a valid hex color, return it
    if (/^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)) {
        return color;
    }

    // If it's an RGB color, return it as-is
    if (/^rgba?\(/.test(color)) {
        return color;
    }

    // If it's a named color or other format, test it by creating a temporary element
    try {
        const tempDiv = document.createElement('div');
        tempDiv.style.backgroundColor = color; // Test as background color, not text color
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).backgroundColor;
        document.body.removeChild(tempDiv);

        // If the browser recognized the color, return the original value
        if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') {
            return color; // Return the original named color since CSS understands it
        }
    } catch (e) {
        // If there's an error, fall back to default
    }

    return '#4A90E2'; // Default fallback
}

/**
 * Pure color format conversion utility - converts color strings to hex format.
 * Does NOT handle profile name resolution.
 * @param color - Color string (hex, named color, or rgb)
 * @returns Hex color string
 */
function convertColorToHex(color: string): string {
    if (!color) return '#4A90E2'; // Default blue

    // If it's already a hex color, return it
    if (color.startsWith('#')) {
        return color;
    }

    // If it's a named color, convert it using browser's color computation
    if (isValidColorName(color)) {
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);

        // Convert RGB to hex
        const hexColor = rgbToHex(computedColor);
        if (hexColor) {
            return hexColor;
        }
    }

    // If conversion failed or it's an unknown format, return default
    return '#4A90E2';
}

/**
 * Resolves profile names to representative colors and converts to hex.
 * For repo/branch rule color swatches that may reference profile names.
 * Uses the profile's primaryActiveBg slot as the representative color.
 * @param value - Color string or profile name
 * @returns Hex color string
 */
function getRepresentativeColor(value: string): string {
    if (!value) return '#4A90E2';

    // Check if it's a profile name (exists in current config)
    if (currentConfig?.advancedProfiles && currentConfig.advancedProfiles[value]) {
        // It's a profile, return a representative color from the profile
        const profile = currentConfig.advancedProfiles[value];
        if (profile.palette?.primaryActiveBg?.value) {
            // Extract the color string for the current theme before converting to hex
            const colorValue = extractColorForTheme(profile.palette.primaryActiveBg.value);
            return convertColorToHex(colorValue);
        }
        // Fallback to a distinct color to indicate it's a profile
        return '#9B59B6'; // Purple to indicate profile
    }

    // Not a profile, just convert the color
    return convertColorToHex(value);
}

function runConfigurationTests() {
    // Test color validation

    // Test rule parsing

    // Test smart defaults

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
        showRegexValidationError(pattern, error instanceof Error ? error.message : String(error), inputId);
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

// Preview Toast Functions
function showPreviewToast() {
    const toast = document.getElementById('preview-toast');
    const resetBtn = toast?.querySelector('.preview-toast-reset-btn') as HTMLElement;
    const toastText = toast?.querySelector('.preview-toast-text') as HTMLElement;
    if (!toast) {
        return;
    }

    // Check if there's no open workspace
    const hasWorkspace = currentConfig?.workspaceInfo?.hasWorkspace ?? true;
    if (!hasWorkspace) {
        // Show special message for no workspace
        if (toastText) {
            toastText.textContent = 'Previews require an open workspace folder';
        }
        if (resetBtn) {
            resetBtn.style.display = 'none';
        }
        toast.setAttribute(
            'data-tooltip',
            'Color preview requires an open workspace. Open a folder or workspace to preview colors.',
        );
        toast.classList.add('visible');
        return;
    }

    // Reset toast text to PREVIEW MODE (in case it was changed to NO WORKSPACE)
    if (toastText) {
        toastText.textContent = 'PREVIEW MODE';
    }

    // Check if we're in "no matching rule" scenario
    const noMatchingRule =
        currentConfig?.matchingIndexes?.repoRule === undefined || currentConfig?.matchingIndexes?.repoRule < 0;
    const isGitRepo =
        currentConfig?.workspaceInfo?.repositoryUrl && currentConfig.workspaceInfo.repositoryUrl.length > 0;

    // Update button and tooltip based on scenario
    if (resetBtn) {
        if (noMatchingRule) {
            if (isGitRepo) {
                // Show "add" button for git repos with no matching rule
                resetBtn.textContent = 'add';
                resetBtn.setAttribute('data-action', 'addRepoRuleFromPreview');
                resetBtn.style.display = '';
                toast.setAttribute(
                    'data-tooltip',
                    'This workspace has no matching rule. Use the [add] button to add a rule for this workspace.',
                );
            } else {
                // Hide button for non-git workspaces
                resetBtn.style.display = 'none';
                toast.setAttribute('data-tooltip', 'Preview mode: The current workspace is not a git repository.');
            }
        } else {
            // Show "reset" button for normal preview mode
            resetBtn.textContent = 'reset';
            resetBtn.setAttribute('data-action', 'resetToMatchingRules');
            resetBtn.style.display = '';
            toast.setAttribute(
                'data-tooltip',
                'You are viewing a preview of colors that would be applied to the selected rule, but the selected rule is not associated with the current workspace. Press [reset] to reselect the rules for this workspace.',
            );
        }
    }

    // Get the selected repo rule
    const selectedRule = currentConfig?.repoRules?.[selectedRepoRuleIndex];
    if (!selectedRule) {
        return;
    }

    // Check if this rule uses a profile (not virtual)
    const fallbackProfileName = typeof selectedRule.primaryColor === 'string' ? selectedRule.primaryColor : undefined;
    const profileName = selectedRule.profileName || fallbackProfileName;
    const profile = profileName ? currentConfig?.advancedProfiles?.[profileName] : undefined;

    let primaryColor: string | undefined = undefined;
    let secondaryBgColor: string | null = null;
    let secondaryFgColor: string | null = null;

    if (profile && !profile.virtual && profile.palette) {
        // Resolve primary color from palette
        const primaryActiveBg = profile.palette.primaryActiveBg;
        if (primaryActiveBg) {
            const resolvedPrimary = resolveColorFromSlot(primaryActiveBg, selectedRule);
            if (resolvedPrimary) {
                // resolveColorFromSlot might return a string or ThemedColor - extract if needed
                primaryColor =
                    typeof resolvedPrimary === 'string' ? resolvedPrimary : extractColorForTheme(resolvedPrimary);
            }
        }

        // Try to find secondary colors in the palette
        const secondaryActiveBg = profile.palette.secondaryActiveBg;
        const secondaryActiveFg = profile.palette.secondaryActiveFg;

        if (secondaryActiveBg) {
            const resolved = resolveColorFromSlot(secondaryActiveBg, selectedRule);
            secondaryBgColor = resolved
                ? typeof resolved === 'string'
                    ? resolved
                    : extractColorForTheme(resolved)
                : null;
        }
        if (secondaryActiveFg) {
            const resolved = resolveColorFromSlot(secondaryActiveFg, selectedRule);
            secondaryFgColor = resolved
                ? typeof resolved === 'string'
                    ? resolved
                    : extractColorForTheme(resolved)
                : null;
        }
    } else {
        // Not using a profile, use the primaryColor directly
        primaryColor = extractColorForTheme(selectedRule.primaryColor) || undefined;
    }

    // Apply the primary color to toast
    if (primaryColor && typeof primaryColor === 'string') {
        toast.style.backgroundColor = primaryColor;
        toast.style.borderColor = primaryColor;
        toast.style.color = getContrastingTextColor(primaryColor);
    } else {
    }

    // Apply secondary colors to reset button if available
    if (resetBtn) {
        if (
            secondaryBgColor &&
            secondaryFgColor &&
            typeof secondaryBgColor === 'string' &&
            typeof secondaryFgColor === 'string'
        ) {
            resetBtn.style.backgroundColor = secondaryBgColor;
            resetBtn.style.color = secondaryFgColor;
            resetBtn.style.borderColor = secondaryFgColor;
        } else {
            // Fallback to default semi-transparent styling
            resetBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            resetBtn.style.color = 'inherit';
            resetBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }
    }

    toast.classList.add('visible');
}

function hidePreviewToast() {
    const toast = document.getElementById('preview-toast');
    if (!toast) {
        return;
    }
    toast.classList.remove('visible');
}

function resetToMatchingRules() {
    // Turn off preview mode
    const checkbox = document.getElementById('preview-selected-repo-rule') as HTMLInputElement;
    if (checkbox) {
        checkbox.checked = false;
    }
    previewMode = false;

    // Select the matching repo rule if available
    if (currentConfig?.matchingIndexes?.repoRule !== undefined && currentConfig?.matchingIndexes?.repoRule >= 0) {
        selectRepoRule(currentConfig.matchingIndexes.repoRule);
    }

    // Select the matching branch rule if available
    if (currentConfig?.matchingIndexes?.branchRule !== undefined && currentConfig?.matchingIndexes?.branchRule >= 0) {
        selectedBranchRuleIndex = currentConfig.matchingIndexes.branchRule;
    }

    // Send clear preview message
    vscode.postMessage({
        command: 'clearPreview',
        data: {
            previewEnabled: false,
        },
    });

    // Hide toast
    hidePreviewToast();

    // Re-render
    if (currentConfig) {
        renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
        renderBranchRulesForSelectedRepo();
    }
}

function addRepoRuleFromPreview() {
    if (!currentConfig) return;

    // Turn off preview mode
    const checkbox = document.getElementById('preview-selected-repo-rule') as HTMLInputElement;
    if (checkbox) {
        checkbox.checked = false;
    }
    previewMode = false;

    // Check if workspace is a git repo or local folder
    const isGitRepo = currentConfig.workspaceInfo?.isGitRepo !== false;
    let repoQualifier = '';

    if (isGitRepo) {
        // Git repository - extract repo name from URL
        repoQualifier = extractRepoNameFromUrl(currentConfig.workspaceInfo?.repositoryUrl || '');
    } else {
        // Local folder - create pattern with ! prefix and env var substitution
        const folderPath = currentConfig.workspaceInfo?.repositoryUrl || '';
        if (folderPath) {
            // Send message to backend to simplify path, then complete action
            vscode.postMessage({
                command: 'simplifyPathForPreview',
                data: { path: folderPath },
            });
            // Will receive response via 'pathSimplifiedForPreview' message
            return; // Exit early, will complete in message handler
        }
    }

    const newRule = {
        repoQualifier: repoQualifier,
        primaryColor: getThemeAppropriateColor(),
    };

    currentConfig.repoRules.push(newRule);

    // Select the newly created rule
    const newRuleIndex = currentConfig.repoRules.length - 1;
    selectedRepoRuleIndex = newRuleIndex;

    // Send configuration update
    sendConfiguration();

    // Hide the preview toast
    hidePreviewToast();

    // Switch to rules tab to show the new rule
    const rulesTab = document.getElementById('tab-rules');
    if (rulesTab) {
        (rulesTab as HTMLElement).click();
    }
}

// Color Auto-complete Functions
function handleColorInputAutoComplete(input: HTMLInputElement) {
    const value = input.value.toLowerCase().trim();

    const matches: string[] = [];
    const profileMatches: string[] = [];
    const colorMatches: string[] = [];

    // Check if this is a palette slot input (should not show profiles or special values)
    const isPaletteSlot = input.hasAttribute('data-palette-slot');

    // 1. Add Special section (only for non-palette inputs)
    if (!isPaletteSlot) {
        // Check if 'none' matches the filter
        if (value.length === 0 || 'none'.includes(value)) {
            matches.push('__SPECIAL_HEADER__'); // Special marker for "Special" header
            matches.push('none'); // Special value to exclude from coloring
        }
    }

    // 2. Add profile section (only for non-palette inputs)
    if (!isPaletteSlot) {
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
            // No profiles defined and filter is empty
            matches.push('__NO_PROFILES__'); // Special marker for "none defined"
        }
    }

    // 3. Add matching color names
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
        // Handle Special header
        if (suggestion === '__SPECIAL_HEADER__') {
            const header = document.createElement('div');
            header.className = 'color-autocomplete-separator';
            header.textContent = 'Special';
            dropdown.appendChild(header);
            return; // Don't increment selectableIndex
        }

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

        // Add color preview or special indicator
        const isProfile = currentConfig?.advancedProfiles && currentConfig.advancedProfiles[suggestion];
        const isSpecialNone = suggestion === 'none';
        if (isSpecialNone) {
            // Add special indicator for 'none'
            const indicator = document.createElement('span');
            indicator.className = 'special-indicator';
            indicator.textContent = ' ⊘';
            indicator.title = 'Exclude from coloring';
            item.appendChild(indicator);
        } else if (!isProfile) {
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
            // Restore original value before hiding dropdown
            if (activeAutoCompleteInput) {
                const originalValue = originalInputValues.get(activeAutoCompleteInput);
                if (originalValue !== undefined) {
                    activeAutoCompleteInput.value = originalValue;
                    // Trigger change events to update the configuration
                    activeAutoCompleteInput.dispatchEvent(new Event('input', { bubbles: true }));
                    activeAutoCompleteInput.dispatchEvent(new Event('change', { bubbles: true }));
                    originalInputValues.delete(activeAutoCompleteInput);
                }
                const inputToBlur = activeAutoCompleteInput;
                hideAutoCompleteDropdown();
                inputToBlur.blur();
            } else {
                hideAutoCompleteDropdown();
            }
            event.stopPropagation(); // Prevent document handler from running again
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
            scrollToSelectedItem(item as HTMLElement, autoCompleteDropdown!);
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
        matches.push(...EXAMPLE_BRANCH_PATTERNS.map((e) => `${e.pattern}|__DESC__|${e.description}`));
    } else {
        const exampleStartsWith = EXAMPLE_BRANCH_PATTERNS.filter((e) => e.pattern.toLowerCase().startsWith(value));
        const exampleIncludes = EXAMPLE_BRANCH_PATTERNS.filter(
            (e) => !e.pattern.toLowerCase().startsWith(value) && e.pattern.toLowerCase().includes(value),
        );
        matches.push(
            ...exampleStartsWith.map((e) => `${e.pattern}|__DESC__|${e.description}`),
            ...exampleIncludes.map((e) => `${e.pattern}|__DESC__|${e.description}`),
        );
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

        // Check if suggestion has a description (format: pattern|__DESC__|description)
        if (suggestion.includes('|__DESC__|')) {
            const [pattern, description] = suggestion.split('|__DESC__|');
            const patternSpan = document.createElement('span');
            patternSpan.textContent = pattern;
            item.appendChild(patternSpan);

            const descSpan = document.createElement('span');
            descSpan.textContent = ` (${description})`;
            descSpan.style.fontStyle = 'italic';
            descSpan.style.opacity = '0.65';
            descSpan.style.marginLeft = '4px';
            item.appendChild(descSpan);

            item.dataset.value = pattern;
        } else {
            item.textContent = suggestion;
            item.dataset.value = suggestion;
        }

        item.dataset.index = selectableIndex.toString();
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');

        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent input from losing focus
            selectBranchPatternSuggestion(input, item.dataset.value!);
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
    dropdown.style.minWidth = Math.max(rect.width, 350) + 'px';

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
    'sideBarTitle.background': 'Sidebar Title: Background',
    'sideBarTitle.foreground': 'Sidebar Title: Foreground',

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

const DEFAULT_PALETTE: Palette = {
    primaryActiveBg: { source: 'fixed', value: createThemedColorInWebview('#4A90E2') },
    primaryActiveFg: { source: 'fixed', value: createThemedColorInWebview('#FFFFFF') },
    primaryInactiveBg: { source: 'fixed', value: createThemedColorInWebview('#2E5C8A') },
    primaryInactiveFg: { source: 'fixed', value: createThemedColorInWebview('#CCCCCC') },
    secondaryActiveBg: { source: 'fixed', value: createThemedColorInWebview('#5FA3E8') },
    secondaryActiveFg: { source: 'fixed', value: createThemedColorInWebview('#FFFFFF') },
    secondaryInactiveBg: { source: 'fixed', value: createThemedColorInWebview('#4278B0') },
    secondaryInactiveFg: { source: 'fixed', value: createThemedColorInWebview('#CCCCCC') },
    tertiaryBg: { source: 'fixed', value: createThemedColorInWebview('#1E1E1E') },
    tertiaryFg: { source: 'fixed', value: createThemedColorInWebview('#CCCCCC') },
    quaternaryBg: { source: 'fixed', value: createThemedColorInWebview('#2D2D30') },
    quaternaryFg: { source: 'fixed', value: createThemedColorInWebview('#D4D4D4') },
};

const DEFAULT_MAPPINGS: SectionMappings = {
    'activityBar.background': { slot: 'primaryActiveBg', opacity: 0.7 },
    'activityBar.foreground': 'primaryActiveFg',
    'activityBar.inactiveForeground': { slot: 'primaryInactiveFg', opacity: 0.8 },
    'statusBar.background': 'primaryActiveBg',
    'statusBar.foreground': 'secondaryActiveFg',
    'titleBar.activeBackground': 'primaryActiveBg',
    'titleBar.activeForeground': 'primaryActiveFg',
    'titleBar.inactiveBackground': { slot: 'primaryInactiveBg', opacity: 0.85 },
    'titleBar.inactiveForeground': { slot: 'primaryInactiveFg', opacity: 0.7 },
    'sideBarTitle.background': { slot: 'primaryActiveBg', opacity: 0.5 },
    'sideBarTitle.foreground': { slot: 'primaryActiveFg', opacity: 1 },
    'tab.inactiveBackground': { slot: 'primaryActiveBg', opacity: 0.5 },
    'tab.activeBackground': 'primaryActiveBg',
    'tab.activeForeground': 'primaryActiveFg',
    'tab.inactiveForeground': { slot: 'primaryActiveFg', opacity: 0.75 },
    'editorGroupHeader.tabsBackground': { slot: 'primaryActiveBg', opacity: 0.3 },
};

const DEFAULT_BRANCH_MAPPINGS: SectionMappings = {
    'activityBar.background': { slot: 'primaryActiveBg', opacity: 0.7 },
    'activityBar.foreground': 'primaryActiveFg',
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
        'sideBarTitle.background',
        'sideBarTitle.foreground',
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
    'Side Bar': [
        'sideBar.background',
        'sideBar.foreground',
        'sideBar.border',
        'sideBarTitle.background',
        'sideBarTitle.foreground',
    ],
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

        // Get matched branch rule from shared table
        let matchedBranchRule = null;
        if (currentConfig?.matchingIndexes?.branchRule >= 0 && matchedRepoRule?.branchTableName) {
            const branchTableName = matchedRepoRule.branchTableName;
            const branchRuleIndex = currentConfig.matchingIndexes.branchRule;
            if (currentConfig.sharedBranchTables?.[branchTableName]) {
                matchedBranchRule = currentConfig.sharedBranchTables[branchTableName].rules[branchRuleIndex];
            }
        }

        // Extract profile names from matched rules
        const matchedRepoPrimaryColor =
            typeof matchedRepoRule?.primaryColor === 'string' ? matchedRepoRule.primaryColor : undefined;
        const repoProfileName =
            matchedRepoRule?.profileName ||
            (matchedRepoPrimaryColor && currentConfig?.advancedProfiles?.[matchedRepoPrimaryColor]
                ? matchedRepoPrimaryColor
                : null);
        const matchedBranchColor = typeof matchedBranchRule?.color === 'string' ? matchedBranchRule.color : undefined;
        const branchProfileName =
            matchedBranchRule?.profileName ||
            (matchedBranchColor && currentConfig?.advancedProfiles?.[matchedBranchColor] ? matchedBranchColor : null);

        // console.log('[Profile Indicators] matchingIndexes:', currentConfig?.matchingIndexes);
        // console.log('[Profile Indicators] matchedRepoRule:', matchedRepoRule);
        // console.log('[Profile Indicators] matchedBranchRule:', matchedBranchRule);
        // console.log('[Profile Indicators] repoProfileName:', repoProfileName);
        // console.log('[Profile Indicators] branchProfileName:', branchProfileName);

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

            const nameSpan = document.createElement('span');
            nameSpan.className = 'profile-name';
            nameSpan.textContent = name;
            nameContainer.appendChild(nameSpan);

            // Count total active mappings for badge
            const profile = profiles[name];
            const usageCounts = isProfileInUse(name);
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
                bgColor = convertColorToHex(extractColorForTheme(profile.palette.primaryActiveBg.value));
            }
            if (profile?.palette?.primaryActiveFg?.value) {
                fgColor = convertColorToHex(extractColorForTheme(profile.palette.primaryActiveFg.value));
            }

            swatch.style.backgroundColor = bgColor;
            swatch.style.color = fgColor;
            swatch.textContent = 'Sample';

            const referenceIndicator = document.createElement('div');
            referenceIndicator.className = 'profile-reference-count';
            const totalReferences = usageCounts.repoRules + usageCounts.branchRules;
            referenceIndicator.textContent = totalReferences.toString();

            if (totalReferences === 0) {
                referenceIndicator.title = 'No repository or branch rules reference this profile yet.';
            } else {
                const detailParts: string[] = [];
                if (usageCounts.repoRules > 0) {
                    detailParts.push(`${usageCounts.repoRules} repo ${usageCounts.repoRules === 1 ? 'rule' : 'rules'}`);
                }
                if (usageCounts.branchRules > 0) {
                    detailParts.push(
                        `${usageCounts.branchRules} branch ${usageCounts.branchRules === 1 ? 'rule' : 'rules'}`,
                    );
                }

                const details = detailParts.join(', ');
                const hasMixedUsage = usageCounts.repoRules > 0 && usageCounts.branchRules > 0;
                if (hasMixedUsage) {
                    referenceIndicator.classList.add('profile-reference-count-warning');

                    const warningIcon = document.createElement('span');
                    warningIcon.className = 'codicon codicon-warning';
                    warningIcon.setAttribute('aria-hidden', 'true');

                    const countText = document.createElement('span');
                    countText.textContent = totalReferences.toString();

                    referenceIndicator.textContent = '';
                    referenceIndicator.appendChild(warningIcon);
                    referenceIndicator.appendChild(countText);

                    referenceIndicator.title = `Referenced by ${totalReferences} ${
                        totalReferences === 1 ? 'rule' : 'rules'
                    } (${details}). Repo and branch references detected.`;
                } else {
                    referenceIndicator.title = `Referenced by ${totalReferences} ${
                        totalReferences === 1 ? 'rule' : 'rules'
                    } (${details}).`;
                }
            }

            referenceIndicator.setAttribute('aria-label', referenceIndicator.title);

            // Create usage indicators column (right side)
            const usageContainer = document.createElement('div');
            usageContainer.className = 'profile-usage-indicators';

            if (name === repoProfileName) {
                const repoIcon = document.createElement('span');
                repoIcon.className = 'codicon codicon-repo profile-usage-icon';
                repoIcon.title = 'Matches workspace repository rule';
                usageContainer.appendChild(repoIcon);
            }

            if (name === branchProfileName) {
                const branchIcon = document.createElement('span');
                branchIcon.className = 'codicon codicon-git-branch profile-usage-icon';
                branchIcon.title = 'Matches workspace branch rule';
                usageContainer.appendChild(branchIcon);
            }

            el.appendChild(nameContainer);
            el.appendChild(swatch);
            el.appendChild(referenceIndicator);
            el.appendChild(usageContainer);
            el.onclick = () => selectProfile(name);
            listContainer.appendChild(el);
        });
    }

    initializeProfileAddMenu();

    // Attach Profile Preview Checkbox Handler
    const profilePreviewCheckbox = document.getElementById('preview-selected-profile') as HTMLInputElement;
    if (profilePreviewCheckbox) {
        profilePreviewCheckbox.checked = profilePreviewMode;
        profilePreviewCheckbox.onchange = handleProfilePreviewModeChange;
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

    // If profile preview mode is enabled, apply the preview
    if (profilePreviewMode) {
        applyProfilePreview(name);
    }
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

type AddProfileTemplate = 'empty' | 'defaultRepo' | 'defaultBranch' | 'starred';

function addNewProfile(template: AddProfileTemplate = 'defaultRepo') {
    if (!currentConfig) return;

    hideProfileAddMenu();

    if (!currentConfig.advancedProfiles) {
        currentConfig.advancedProfiles = {};
    }

    if (template === 'starred' && starredKeys.length === 0) {
        return;
    }

    const templateMeta: Record<AddProfileTemplate, { prefix: string; continueSequence?: boolean }> = {
        empty: { prefix: 'Empty Profile', continueSequence: true },
        defaultRepo: { prefix: 'Repo Profile', continueSequence: true },
        defaultBranch: { prefix: 'Branch Profile', continueSequence: true },
        starred: { prefix: 'Starred Profile', continueSequence: true },
    };

    const { prefix, continueSequence } = templateMeta[template];
    const profileName = generateProfileName(prefix, Boolean(continueSequence));

    const newProfile: AdvancedProfile = {
        palette: createProfilePalette(),
        mappings: getMappingsForTemplate(template),
    };

    currentConfig.advancedProfiles[profileName] = newProfile;

    saveProfiles(profileName, 'monochromatic', true);
    selectProfile(profileName);
}

function generateProfileName(prefix: string, continueSequence: boolean): string {
    const profiles = currentConfig?.advancedProfiles ?? {};

    const trimmedPrefix = prefix.trim();
    if (!continueSequence) {
        if (trimmedPrefix && !isHtmlColor(trimmedPrefix) && !profiles[trimmedPrefix]) {
            return trimmedPrefix;
        }
    }

    const existingProfiles = Object.keys(profiles);
    let counter = continueSequence ? existingProfiles.length + 1 : 1;
    let candidate = `${trimmedPrefix} ${counter}`.trim();

    while (isHtmlColor(candidate) || profiles[candidate]) {
        counter++;
        candidate = `${trimmedPrefix} ${counter}`.trim();
    }

    return candidate;
}

function createProfilePalette(): Palette {
    const randomColor = getThemeAppropriateColor();
    const newPalette = JSON.parse(JSON.stringify(DEFAULT_PALETTE)) as Palette;
    newPalette.primaryActiveBg.value = createThemedColorInWebview(randomColor);
    return newPalette;
}

function getMappingsForTemplate(template: AddProfileTemplate): SectionMappings {
    switch (template) {
        case 'empty':
            return {};
        case 'defaultBranch':
            return JSON.parse(JSON.stringify(DEFAULT_BRANCH_MAPPINGS));
        case 'starred':
            return buildStarredProfileMappings();
        case 'defaultRepo':
        default:
            return JSON.parse(JSON.stringify(DEFAULT_MAPPINGS));
    }
}

function buildStarredProfileMappings(): SectionMappings {
    const mappings: SectionMappings = {};

    if (!starredKeys || starredKeys.length === 0) {
        return mappings;
    }

    starredKeys.forEach((key) => {
        const slot = chooseSlotForStarredKey(key);
        if (!slot) {
            return;
        }
        mappings[key] = slot;
    });

    return mappings;
}

function chooseSlotForStarredKey(key: string): string | undefined {
    const filteredSlots = getFilteredPaletteOptions(key, PALETTE_SLOT_ORDER, undefined, true);

    if (isInactiveElement(key)) {
        const inactiveSlot = filteredSlots.find((slot) => slot.includes('Inactive'));
        if (inactiveSlot) {
            return inactiveSlot;
        }
    }

    if (isActiveElement(key)) {
        const activeSlot = filteredSlots.find((slot) => slot.includes('Active') && !slot.includes('Inactive'));
        if (activeSlot) {
            return activeSlot;
        }
    }

    if (isForegroundElement(key)) {
        const fgSlot = filteredSlots.find((slot) => slot.endsWith('Fg'));
        if (fgSlot) {
            return fgSlot;
        }
    }

    if (isBackgroundElement(key)) {
        const bgSlot = filteredSlots.find((slot) => slot.endsWith('Bg'));
        if (bgSlot) {
            return bgSlot;
        }
    }

    if (filteredSlots.length > 0) {
        return filteredSlots[0];
    }

    return determineFallbackSlot(key);
}

function determineFallbackSlot(key: string): string {
    if (isForegroundElement(key)) {
        return isInactiveElement(key) ? 'primaryInactiveFg' : 'primaryActiveFg';
    }

    if (isBackgroundElement(key)) {
        return isInactiveElement(key) ? 'primaryInactiveBg' : 'primaryActiveBg';
    }

    if (isInactiveElement(key)) {
        return 'secondaryInactiveBg';
    }

    if (isActiveElement(key)) {
        return 'secondaryActiveBg';
    }

    return 'tertiaryBg';
}

function initializeProfileAddMenu() {
    profileAddMenuButton = document.getElementById('profileAddMenuButton') as HTMLElement | null;
    profileAddDropdown = document.getElementById('profileAddMenuDropdown') as HTMLElement | null;

    if (!profileAddMenuButton || !profileAddDropdown) {
        return;
    }

    if (profileAddMenuButton.dataset.initialized !== 'true') {
        profileAddMenuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleProfileAddMenu();
        });
        profileAddMenuButton.addEventListener('keydown', handleProfileAddButtonKeydown);
        profileAddMenuButton.dataset.initialized = 'true';
    }

    if (profileAddDropdown.dataset.initialized !== 'true') {
        profileAddDropdown.addEventListener('keydown', handleProfileAddDropdownKeydown);
        profileAddDropdown.dataset.initialized = 'true';
    }

    refreshProfileAddMenuOptions();
    hideProfileAddMenu();
}

function refreshProfileAddMenuOptions() {
    if (!profileAddDropdown) {
        return;
    }

    profileAddDropdown.innerHTML = '';

    const options: Array<{ template: AddProfileTemplate; label: string; description: string }> = [
        {
            template: 'empty',
            label: 'Add empty profile',
            description: 'Add an empty profile with no assigned mappings.',
        },
        {
            template: 'defaultRepo',
            label: 'Add default repository profile',
            description: 'Add a profile with default repository mappings assigned.',
        },
        {
            template: 'defaultBranch',
            label: 'Add default branch profile',
            description: 'Add a profile with default branch mappings assigned.',
        },
    ];

    if (starredKeys.length > 0) {
        options.push({
            template: 'starred',
            label: 'Add starred profile',
            description: 'Add a profile with starred key mappings assigned.',
        });
    }

    options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'profile-add-option';
        button.setAttribute('role', 'menuitem');
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            hideProfileAddMenu();
            addNewProfile(option.template);
        });
        button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                hideProfileAddMenu();
                addNewProfile(option.template);
            }
        });

        const label = document.createElement('div');
        label.className = 'profile-add-option-label';
        label.textContent = option.label;
        button.appendChild(label);

        const description = document.createElement('div');
        description.className = 'profile-add-option-description';
        description.textContent = option.description;
        button.appendChild(description);

        profileAddDropdown?.appendChild(button);
    });

    profileAddDropdown?.setAttribute(
        'aria-hidden',
        profileAddDropdown.classList.contains('visible') ? 'false' : 'true',
    );
}

function toggleProfileAddMenu() {
    if (!profileAddDropdown) {
        return;
    }

    if (profileAddDropdown.classList.contains('visible')) {
        hideProfileAddMenu();
    } else {
        showProfileAddMenu();
    }
}

function showProfileAddMenu() {
    if (!profileAddDropdown || !profileAddMenuButton) {
        return;
    }

    refreshProfileAddMenuOptions();

    if (!profileAddDropdown.children.length) {
        return;
    }

    profileAddDropdown.classList.add('visible');
    profileAddDropdown.setAttribute('aria-hidden', 'false');
    profileAddMenuButton.setAttribute('aria-expanded', 'true');

    const firstOption = profileAddDropdown.querySelector('.profile-add-option') as HTMLElement | null;
    if (firstOption) {
        firstOption.focus();
    }
}

function hideProfileAddMenu() {
    if (!profileAddDropdown || !profileAddMenuButton) {
        return;
    }

    profileAddDropdown.classList.remove('visible');
    profileAddDropdown.setAttribute('aria-hidden', 'true');
    profileAddMenuButton.setAttribute('aria-expanded', 'false');
}

function handleProfileAddButtonKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showProfileAddMenu();
    } else if (event.key === 'Escape') {
        hideProfileAddMenu();
    }
}

function handleProfileAddDropdownKeydown(event: KeyboardEvent) {
    if (!profileAddDropdown) {
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        hideProfileAddMenu();
        profileAddMenuButton?.focus();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusNextProfileAddOption(1);
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusNextProfileAddOption(-1);
        return;
    }

    if (event.key === 'Tab') {
        hideProfileAddMenu();
    }
}

function focusNextProfileAddOption(direction: number) {
    if (!profileAddDropdown) {
        return;
    }

    const options = Array.from(profileAddDropdown.querySelectorAll('.profile-add-option')) as HTMLElement[];
    if (!options.length) {
        return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const currentIndex = activeElement ? options.indexOf(activeElement) : -1;

    let nextIndex = currentIndex + direction;

    if (nextIndex < 0) {
        nextIndex = options.length - 1;
    } else if (nextIndex >= options.length) {
        nextIndex = 0;
    }

    options[nextIndex].focus();
}

let paletteGeneratorInitialized = false;

// Algorithm definitions with metadata
const PALETTE_ALGORITHMS = [
    {
        id: 'balanced',
        name: 'Balanced Tetradic',
        description: 'Colors evenly spaced 90° apart on the color wheel. Professional and versatile.',
    },
    {
        id: 'monochromatic',
        name: 'Monochromatic',
        description: 'Same hue with varying lightness and saturation. Cohesive and elegant.',
    },
    {
        id: 'bold-contrast',
        name: 'Bold Contrast',
        description: 'High saturation with complementary colors. Vibrant and eye-catching.',
    },
    {
        id: 'analogous',
        name: 'Analogous',
        description: 'Adjacent hues (±30°). Harmonious and serene with subtle variation.',
    },
    {
        id: 'analogous-minor-plus',
        name: 'Analogous Minor+',
        description: 'Small positive hue steps (+10°). Very subtle, gentle color progression.',
    },
    {
        id: 'analogous-minor-minus',
        name: 'Analogous Minor-',
        description: 'Small negative hue steps (-10°). Very subtle progression in opposite direction.',
    },
    {
        id: 'split-complementary',
        name: 'Split-Complementary',
        description: 'Base color plus two colors adjacent to its complement. Balanced contrast.',
    },
    {
        id: 'triadic',
        name: 'Triadic',
        description: 'Three colors 120° apart. Vibrant and balanced with strong visual interest.',
    },
    { id: 'square', name: 'Square', description: 'Four colors 90° apart with uniform saturation. Bold and dynamic.' },
];

/**
 * Build the algorithm cards in the dropdown
 */
function buildPaletteAlgorithmCards(dropdown: HTMLElement, primaryColor: string | undefined) {
    dropdown.innerHTML = '';

    const defaultColor = '#4a9cd6'; // Fallback blue if no primary set
    const baseColor = primaryColor || defaultColor;

    PALETTE_ALGORITHMS.forEach((algo) => {
        const colors = generatePreviewColors(baseColor, algo.id);

        const card = document.createElement('div');
        card.className = 'palette-algorithm-card';
        card.setAttribute('data-algorithm', algo.id);

        card.innerHTML = `
            <div class="card-title">${algo.name}</div>
            <div class="card-description">${algo.description}</div>
            <div class="card-swatches">
                <div class="swatch" style="background-color: ${colors[0]}"></div>
                <div class="swatch" style="background-color: ${colors[1]}"></div>
                <div class="swatch" style="background-color: ${colors[2]}"></div>
                <div class="swatch" style="background-color: ${colors[3]}"></div>
            </div>
        `;

        card.addEventListener('click', () => {
            if (selectedProfileName) {
                generatePalette(algo.id);
                hidePaletteGeneratorDropdown();
            }
        });

        dropdown.appendChild(card);
    });
}

// Store reference to the dropdown element
let paletteGeneratorDropdown: HTMLElement | null = null;

/**
 * Hide the palette generator dropdown
 */
function hidePaletteGeneratorDropdown() {
    if (paletteGeneratorDropdown) {
        paletteGeneratorDropdown.style.display = 'none';
    }
}

/**
 * Sets up the palette generator wand button and dropdown menu
 */
function setupPaletteGenerator() {
    // Only initialize once to prevent duplicate event listeners
    if (paletteGeneratorInitialized) {
        return;
    }

    const generatorBtn = document.getElementById('paletteGeneratorBtn');
    if (!generatorBtn) return;

    // Create dropdown and append to body for proper z-index stacking
    paletteGeneratorDropdown = document.createElement('div');
    paletteGeneratorDropdown.className = 'palette-generator-dropdown';
    paletteGeneratorDropdown.id = 'paletteGeneratorDropdown';
    document.body.appendChild(paletteGeneratorDropdown);

    // Toggle dropdown on button click
    generatorBtn.onclick = (e) => {
        e.stopPropagation();
        hideTooltipImmediate(); // Hide tooltip when dropdown opens

        if (!paletteGeneratorDropdown) return;

        const isVisible = paletteGeneratorDropdown.style.display !== 'none';

        if (!isVisible) {
            // Build/update cards with current primary color before showing
            let primaryColor: string | undefined;
            if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                const colorValue = currentConfig.advancedProfiles[selectedProfileName].palette.primaryActiveBg?.value;
                // Extract string color from ThemedColor object
                primaryColor = extractColorForTheme(colorValue);
            }
            buildPaletteAlgorithmCards(paletteGeneratorDropdown, primaryColor);

            // Request accurate previews from the extension (will update swatches when received)
            if (primaryColor) {
                vscode.postMessage({
                    command: 'requestPalettePreviews',
                    data: {
                        primaryBg: primaryColor,
                    },
                });
            }

            // Position dropdown relative to the button
            const btnRect = generatorBtn.getBoundingClientRect();
            const dropdownHeight = 500; // Approximate max height
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - btnRect.bottom;

            // Position aligned to right edge of button
            paletteGeneratorDropdown.style.right = window.innerWidth - btnRect.right + 'px';
            paletteGeneratorDropdown.style.left = 'auto';

            // If not enough space below, flip upward
            if (spaceBelow < dropdownHeight && btnRect.top > spaceBelow) {
                paletteGeneratorDropdown.style.bottom = viewportHeight - btnRect.top + 4 + 'px';
                paletteGeneratorDropdown.style.top = 'auto';
            } else {
                paletteGeneratorDropdown.style.top = btnRect.bottom + 4 + 'px';
                paletteGeneratorDropdown.style.bottom = 'auto';
            }
        }

        paletteGeneratorDropdown.style.display = isVisible ? 'none' : 'block';
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (
            paletteGeneratorDropdown &&
            !generatorBtn.contains(e.target as Node) &&
            !paletteGeneratorDropdown.contains(e.target as Node)
        ) {
            paletteGeneratorDropdown.style.display = 'none';
        }
    });

    paletteGeneratorInitialized = true;
}

// Store previous palette for undo functionality
let previousPalette: any = null;

/**
 * Generates a pleasing color palette and updates the current profile
 * @param algorithm The palette generation algorithm to use
 * @param profileName Optional profile name to generate palette for (defaults to currently selected profile)
 */
function generatePalette(algorithm: string, profileName?: string) {
    const targetProfileName = profileName || selectedProfileName;

    if (!targetProfileName || !currentConfig.advancedProfiles[targetProfileName]) {
        return;
    }

    const profile = currentConfig.advancedProfiles[targetProfileName];
    const primaryBgValue = profile.palette.primaryActiveBg?.value;
    // Extract string color from ThemedColor object for current theme
    const primaryBg = extractColorForTheme(primaryBgValue);

    if (!primaryBg) {
        console.warn('Cannot generate palette: No primary background color defined');
        return;
    }

    // Store current palette for undo (only if not already stored - preserves original state)
    if (!previousPalette) {
        previousPalette = JSON.parse(JSON.stringify(profile.palette));
    }

    // Send message to extension to generate palette
    vscode.postMessage({
        command: 'generatePalette',
        data: {
            paletteData: {
                profileName: targetProfileName,
                primaryBg: primaryBg,
                algorithm: algorithm,
            },
        },
    });
}

/**
 * Handles the paletteGenerated message from the extension
 */
function handlePaletteGenerated(data: {
    advancedProfiles: any;
    generatedPalette: any;
    profileName: string;
    skipToast?: boolean;
}) {
    // Update current config with the new profiles
    currentConfig.advancedProfiles = data.advancedProfiles;

    // Re-render the profile editor to show the new palette
    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
        renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
    }

    // Show the toast after the layout has stabilized (unless skipToast is true)
    if (!data.skipToast) {
        requestAnimationFrame(() => {
            showPaletteToast(data.generatedPalette);
        });
    }
}

/**
 * Handles palette previews from the extension - updates dropdown swatches with accurate colors
 */
function handlePalettePreviews(data: {
    previews: Array<{ algorithm: string; colors: [string, string, string, string] }>;
}) {
    if (!paletteGeneratorDropdown || paletteGeneratorDropdown.style.display === 'none') {
        return; // Don't update if dropdown is hidden
    }

    const previews = data.previews;
    if (!previews || !Array.isArray(previews)) {
        return;
    }

    // Update each card's swatches with the accurate server-generated colors
    previews.forEach((preview) => {
        const card = paletteGeneratorDropdown?.querySelector(`[data-algorithm="${preview.algorithm}"]`);
        if (card) {
            const swatches = card.querySelectorAll('.swatch');
            swatches.forEach((swatch, index) => {
                if (preview.colors[index]) {
                    (swatch as HTMLElement).style.backgroundColor = preview.colors[index];
                }
            });
        }
    });
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

// Store references to event handlers so they can be removed
let paletteAcceptHandler: ((e: Event) => void) | null = null;
let paletteUndoHandler: ((e: Event) => void) | null = null;
let paletteToastInitialized = false;

/**
 * Sets up the palette toast event handlers (called only once)
 */
function setupPaletteToast() {
    // Only initialize once
    if (paletteToastInitialized) {
        return;
    }

    const acceptBtn = document.getElementById('paletteToastAccept');
    const undoBtn = document.getElementById('paletteToastUndo');

    // Create new handlers
    paletteAcceptHandler = () => {
        // Accept the changes - just hide the toast
        hidePaletteToast();
        previousPalette = null;
    };

    paletteUndoHandler = () => {
        // Restore the previous palette
        if (previousPalette && selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
            currentConfig.advancedProfiles[selectedProfileName].palette = previousPalette;
            saveProfiles();
            renderProfileEditor(selectedProfileName, currentConfig.advancedProfiles[selectedProfileName]);
            previousPalette = null;
        }
        hidePaletteToast();
    };

    // Add new event listeners
    if (acceptBtn) {
        acceptBtn.addEventListener('click', paletteAcceptHandler);
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', paletteUndoHandler);
    }

    paletteToastInitialized = true;
}

function renderProfileEditor(name: string, profile: AdvancedProfile) {
    // Clean up any orphaned mapping dropdown options from previous render
    document.querySelectorAll('.dropdown-options.mapping-dropdown-options').forEach((el) => el.remove());

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
        // Check if profile is in use
        const usage = isProfileInUse(name);

        if (usage.inUse) {
            // Disable button and show tooltip explaining why
            deleteBtn.classList.add('disabled');
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.cursor = 'not-allowed';

            const parts = [];
            if (usage.repoRules > 0) {
                parts.push(`${usage.repoRules} repo ${usage.repoRules === 1 ? 'rule' : 'rules'}`);
            }
            if (usage.branchRules > 0) {
                parts.push(`${usage.branchRules} branch ${usage.branchRules === 1 ? 'rule' : 'rules'}`);
            }
            deleteBtn.setAttribute('data-tooltip', `Cannot delete: Profile is used by ${parts.join(' and ')}`);
            deleteBtn.removeAttribute('title');

            deleteBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
            };
        } else {
            // Enable button with normal behavior
            deleteBtn.classList.remove('disabled');
            deleteBtn.style.opacity = '1';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.setAttribute('data-tooltip', 'Delete profile');
            deleteBtn.removeAttribute('title');
            deleteBtn.onclick = () => deleteProfile(name);
        }
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
                updatePairSwatch(
                    swatch,
                    extractColorForTheme(bgDef.value) || '#000000',
                    extractColorForTheme(fgDef.value) || '#FFFFFF',
                );

                // Create wrapper for Bg+Fg pair
                const pairWrapper = document.createElement('div');
                pairWrapper.className = 'palette-pair-wrapper';

                // Create Bg slot element
                const bgEl = createPaletteSlotElement(bgKey, bgDef, (newDef) => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        currentConfig.advancedProfiles[selectedProfileName].palette[bgKey] = newDef;
                        saveProfiles();
                        // Update the combined swatch
                        updatePairSwatch(
                            swatch,
                            extractColorForTheme(newDef.value) || '#000000',
                            extractColorForTheme(fgDef.value) || '#FFFFFF',
                        );

                        // Show palette generator hint when user manually sets primary background
                        const generatorBtn = document.getElementById('paletteGeneratorBtn');
                        hintManager.tryShow('paletteGenerator', generatorBtn, () => bgKey === 'primaryActiveBg');
                    }
                });

                // Create Fg slot element
                const fgEl = createPaletteSlotElement(fgKey, fgDef, (newDef) => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        currentConfig.advancedProfiles[selectedProfileName].palette[fgKey] = newDef;
                        saveProfiles();
                        // Update the combined swatch
                        updatePairSwatch(
                            swatch,
                            extractColorForTheme(bgDef.value) || '#000000',
                            extractColorForTheme(newDef.value) || '#FFFFFF',
                        );
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

            // Add ID for special tabs (Colored, Starred) for tour targeting
            if (sectionName === 'Colored') {
                tabBtn.id = 'mapping-tab-colored';
            } else if (sectionName === 'Starred') {
                tabBtn.id = 'mapping-tab-starred';
            } else if (sectionName === 'Tabs & Breadcrumbs') {
                tabBtn.id = 'mapping-tab-tabs-breadcrumbs';
            }

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
                label.style.minWidth = '220px';
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
                // if (currentSlot !== 'none') {
                //     console.log(`[Mapping Debug] ${key}: currentSlot = ${currentSlot}`);
                // }

                // Create warning indicator for uncolored keys in Starred tab
                const warningIndicator = document.createElement('span');
                const isUncolored = currentSlot === 'none';
                const isStarredTab = sectionName === 'Starred';
                if (isStarredTab && isUncolored) {
                    warningIndicator.className = 'codicon codicon-warning';
                    warningIndicator.style.color = 'var(--vscode-notificationsWarningIcon-foreground)';
                    warningIndicator.style.fontSize = '14px';
                    warningIndicator.title = 'No color assigned';
                }

                // Container for dropdown (and potentially fixed color picker)
                const dropdownContainer = document.createElement('div');
                dropdownContainer.className = 'mapping-dropdown-container';

                // Create custom dropdown with color swatches
                const select = document.createElement('div');
                select.className = 'custom-dropdown';
                select.title = `Select palette color for ${key}`;
                select.setAttribute('data-value', currentSlot);
                select.setAttribute('data-mapping-key', key);
                select.setAttribute('tabindex', '0');
                select.setAttribute('role', 'combobox');
                select.setAttribute('aria-expanded', 'false');

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

                    // User successfully performed drag & drop, so dismiss the hint
                    // (they obviously know about this feature now)
                    hintManager.markShown('dragDropMapping');

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

                // Arrow indicator
                const arrow = document.createElement('span');
                arrow.className = 'dropdown-arrow';
                arrow.textContent = '▼';
                selectedDisplay.appendChild(arrow);

                // Dropdown options container (appended to body for proper z-index stacking)
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'dropdown-options mapping-dropdown-options';

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

                filteredPaletteOptions.forEach((opt) => {
                    const label = PALETTE_SLOT_LABELS[opt] || opt.charAt(0).toUpperCase() + opt.slice(1);
                    const slotDef = profile.palette[opt];
                    const color =
                        slotDef && slotDef.value ? convertColorToHex(extractColorForTheme(slotDef.value)) : undefined;
                    options.push({ value: opt, label, color });
                });

                // Helper to create option element
                const createOptionElement = (opt: DropdownOption, isSelected: boolean, index: number) => {
                    if (opt.isSeparator) {
                        const separatorDiv = document.createElement('div');
                        separatorDiv.textContent = opt.label;
                        separatorDiv.className = 'dropdown-separator';
                        if (index === 0) {
                            separatorDiv.style.marginTop = '2px';
                        }
                        return separatorDiv;
                    }

                    const optionDiv = document.createElement('div');
                    optionDiv.className = isSelected ? 'dropdown-option selected' : 'dropdown-option';
                    optionDiv.setAttribute('data-value', opt.value);

                    // Add color swatch if available
                    if (opt.color) {
                        const swatch = document.createElement('div');
                        swatch.className = 'dropdown-color-swatch';
                        swatch.style.background = opt.color;
                        optionDiv.appendChild(swatch);
                    }

                    const text = document.createElement('span');
                    text.textContent = opt.label;
                    optionDiv.appendChild(text);

                    return optionDiv;
                };

                // Update selected display
                const updateSelectedDisplay = (value: string) => {
                    let opt = options.find((o) => o.value === value);

                    // Fallback: if option not found, use a placeholder to prevent empty display
                    if (!opt) {
                        opt = { value: value || 'none', label: value || 'None' };
                    }

                    // Clear current content (except arrow)
                    while (selectedDisplay.firstChild && selectedDisplay.firstChild !== arrow) {
                        selectedDisplay.removeChild(selectedDisplay.firstChild);
                    }

                    // Add color swatch if available
                    if (opt.color) {
                        const swatch = document.createElement('div');
                        swatch.className = 'dropdown-color-swatch';
                        swatch.style.background = opt.color;
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

                    // Close all other mapping dropdowns first
                    document.querySelectorAll('.dropdown-options.mapping-dropdown-options').forEach((other) => {
                        if (other !== optionsContainer) {
                            (other as HTMLElement).style.display = 'none';
                        }
                    });

                    if (isOpen) {
                        optionsContainer.style.display = 'none';
                        select.setAttribute('aria-expanded', 'false');
                        // Remove outside click handler when closing
                        if (outsideClickHandler) {
                            document.removeEventListener('click', outsideClickHandler);
                            outsideClickHandler = null;
                        }
                    } else {
                        // Position dropdown using fixed coordinates
                        const triggerRect = selectedDisplay.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const spaceBelow = viewportHeight - triggerRect.bottom;
                        const dropdownHeight = 200; // maxHeight of options

                        optionsContainer.style.left = triggerRect.left + 'px';
                        optionsContainer.style.minWidth = triggerRect.width + 'px';

                        // If not enough space below, flip it upward
                        if (spaceBelow < dropdownHeight && triggerRect.top > spaceBelow) {
                            optionsContainer.style.top = 'auto';
                            optionsContainer.style.bottom = viewportHeight - triggerRect.top + 'px';
                        } else {
                            optionsContainer.style.top = triggerRect.bottom + 2 + 'px';
                            optionsContainer.style.bottom = 'auto';
                        }

                        optionsContainer.style.display = 'block';
                        select.setAttribute('aria-expanded', 'true');
                        // Add outside click handler when opening
                        outsideClickHandler = (e: MouseEvent) => {
                            if (!select.contains(e.target as Node) && !optionsContainer.contains(e.target as Node)) {
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
                // Append options to body for proper z-index stacking
                document.body.appendChild(optionsContainer);

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
                fixedColorPicker.className =
                    currentSlot === '__fixed__' ? 'fixed-color-picker visible' : 'fixed-color-picker';

                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.className = 'native-color-input';
                colorInput.value = convertColorToHex(currentFixedColor || '#4A90E2');
                colorInput.title = 'Click to use a color picker, shift-click to choose a random color';

                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.className = 'color-input text-input';
                textInput.value = currentFixedColor || '#4A90E2';
                textInput.placeholder = 'e.g., blue, #4A90E2';

                fixedColorPicker.appendChild(colorInput);
                fixedColorPicker.appendChild(textInput);

                // Update select width when fixed color is shown/hidden
                const updateSelectWidth = () => {
                    if (select.getAttribute('data-value') === '__fixed__') {
                        select.classList.add('fixed-width');
                        fixedColorPicker.classList.add('visible');
                    } else {
                        select.classList.remove('fixed-width');
                        fixedColorPicker.classList.remove('visible');
                    }
                };
                updateSelectWidth();

                // Create close icon to clear the mapping
                const clearIcon = document.createElement('span');
                clearIcon.className = 'codicon codicon-close mapping-clear-icon';
                clearIcon.title = 'Clear mapping (set to None)';
                clearIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.setAttribute('data-value', 'none');
                    (select as any).value = 'none';
                    const changeEvent = new Event('change', { bubbles: true });
                    select.dispatchEvent(changeEvent);
                });

                dropdownContainer.appendChild(clearIcon);
                dropdownContainer.appendChild(select);
                dropdownContainer.appendChild(fixedColorPicker);

                // Opacity control
                const opacityContainer = document.createElement('div');
                opacityContainer.className = 'opacity-controls';

                const opacityLabel = document.createElement('span');
                opacityLabel.className = 'opacity-label';
                opacityLabel.textContent = 'α:';

                const opacitySlider = document.createElement('input');
                opacitySlider.type = 'range';
                opacitySlider.className = 'opacity-slider';
                opacitySlider.min = '0';
                opacitySlider.max = '100';
                opacitySlider.step = '5';
                const initialOpacity = currentOpacity !== undefined ? currentOpacity : 1;
                opacitySlider.value = Math.round(initialOpacity * 100).toString();

                // Get the color from the selected palette slot to create gradient
                const updateSliderGradient = () => {
                    const slotName = select.getAttribute('data-value') || 'none';
                    if (slotName === 'none') {
                        // Disable and gray out opacity controls when 'none' is selected
                        opacitySlider.disabled = true;
                        opacitySlider.style.setProperty('--slider-color', '#808080');
                        opacityValue.classList.add('disabled');
                        opacityLabel.classList.add('disabled');
                    } else {
                        // Enable opacity controls
                        opacitySlider.disabled = false;
                        opacityValue.classList.remove('disabled');
                        opacityLabel.classList.remove('disabled');

                        if (slotName === '__fixed__') {
                            // Use the fixed color - extract it first if it's a ThemedColor
                            const colorValue = extractColorForTheme(textInput.value);
                            const color = convertColorToHex(colorValue);
                            opacitySlider.style.setProperty('--slider-color', color);
                        } else if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                            const profile = currentConfig.advancedProfiles[selectedProfileName];
                            const slotDef = profile.palette[slotName];
                            if (slotDef && slotDef.value) {
                                // Extract the color string for the current theme before converting to hex
                                const colorValue = extractColorForTheme(slotDef.value);
                                const color = convertColorToHex(colorValue);
                                opacitySlider.style.setProperty('--slider-color', color);
                            }
                        }
                    }
                };

                const opacityValue = document.createElement('span');
                opacityValue.className = 'opacity-value';
                opacityValue.textContent = Math.round(initialOpacity * 100) + '%';

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

                    // Update warning indicator visibility
                    const newSlot = select.getAttribute('data-value') || 'none';

                    // Show drag-drop hint when user selects a color from dropdown
                    // Find the palette swatch for the selected slot
                    const paletteSlotEl = newSlot
                        ? document.querySelector(`.palette-slot-draggable[data-slot-name="${newSlot}"]`)
                        : null;
                    if (paletteSlotEl) {
                        // Target the native color input (swatch) within the slot, not the whole container
                        const swatchEl = paletteSlotEl.querySelector('.native-color-input') as HTMLElement;
                        hintManager.tryShow(
                            'dragDropMapping',
                            swatchEl || (paletteSlotEl as HTMLElement),
                            () => newSlot !== 'none' && newSlot !== '__fixed__',
                        );
                    }

                    if (isStarredTab) {
                        if (newSlot === 'none') {
                            warningIndicator.className = 'codicon codicon-warning';
                            warningIndicator.style.color = 'var(--vscode-notificationsWarningIcon-foreground)';
                            warningIndicator.style.fontSize = '14px';
                            warningIndicator.title = 'No color assigned';
                            if (!row.contains(warningIndicator)) {
                                row.insertBefore(warningIndicator, dropdownContainer);
                            }
                        } else {
                            if (row.contains(warningIndicator)) {
                                row.removeChild(warningIndicator);
                            }
                        }
                    }

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
                if (isStarredTab && isUncolored) {
                    row.appendChild(warningIndicator);
                }
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
        if (tabToActivate !== null) {
            (tabToActivate as HTMLButtonElement).style.borderBottomColor = 'var(--vscode-panelTitle-activeBorder)';
            (tabToActivate as HTMLButtonElement).style.fontWeight = 'bold';
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
        e.dataTransfer.setData(
            'application/x-palette-color',
            convertColorToHex(extractColorForTheme(def.value) || '#000000'),
        );

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
        colorBox.style.backgroundColor = convertColorToHex(extractColorForTheme(def.value) || '#000000');
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
    colorPicker.value = convertColorToHex(extractColorForTheme(def.value) || '#000000');
    colorPicker.title = 'Click to use a color picker, shift-click to choose a random color';
    colorPicker.onchange = () => {
        def.value = createThemedColorInWebview(colorPicker.value);
        def.source = 'fixed';
        textInput.value = colorPicker.value;
        onChange(def);
    };

    // Text input
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'color-input text-input';
    textInput.value = extractColorForTheme(def.value) || '#000000';
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
        def.value = createThemedColorInWebview(textInput.value);
        def.source = 'fixed';
        onChange(def);
    };

    colorContainer.appendChild(colorPicker);
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

    // Update all references to the old profile name in repo rules
    if (currentConfig.repoRules) {
        currentConfig.repoRules.forEach((rule: any) => {
            if (rule.profileName === oldName) {
                rule.profileName = newName;
            }
            if (rule.primaryColor === oldName) {
                rule.primaryColor = newName;
            }
            if (rule.branchColor === oldName) {
                rule.branchColor = newName;
            }
        });
    }

    // Update all references in shared branch tables
    if (currentConfig.sharedBranchTables) {
        for (const tableName in currentConfig.sharedBranchTables) {
            const table = currentConfig.sharedBranchTables[tableName];
            if (table && table.rules) {
                table.rules.forEach((rule: any) => {
                    if (rule.profileName === oldName) {
                        rule.profileName = newName;
                    }
                    if (rule.color === oldName) {
                        rule.color = newName;
                    }
                });
            }
        }
    }

    saveProfiles();
    sendConfiguration();
    renderProfiles(currentConfig.advancedProfiles);
    selectProfile(newName);

    // Re-render rules to update any references to the renamed profile
    if (currentConfig.repoRules) {
        renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
    }
    renderBranchRulesForSelectedRepo();
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

function saveProfiles(profileName?: string, algorithm?: string, skipToast?: boolean) {
    vscode.postMessage({
        command: 'updateAdvancedProfiles',
        data: {
            advancedProfiles: currentConfig.advancedProfiles,
            profileName: profileName,
            algorithm: algorithm,
            skipToast: skipToast,
        },
    });
}
/**
 * Handles changes to the profile preview mode checkbox
 */
function handleProfilePreviewModeChange() {
    const checkbox = document.getElementById('preview-selected-profile') as HTMLInputElement;
    if (!checkbox) return;

    profilePreviewMode = checkbox.checked;

    if (profilePreviewMode && selectedProfileName) {
        // Enable preview and apply selected profile
        applyProfilePreview(selectedProfileName);
    } else {
        // Disable preview and revert to workspace colors
        clearProfilePreview();
    }
}

/**
 * Applies a profile preview by sending a message to the extension
 */
function applyProfilePreview(profileName: string) {
    vscode.postMessage({
        command: 'previewProfile',
        data: {
            profileName,
            previewEnabled: true,
        },
    });
}

/**
 * Clears the profile preview and reverts to workspace colors
 */
function clearProfilePreview() {
    vscode.postMessage({
        command: 'clearProfilePreview',
        data: {
            previewEnabled: false,
        },
    });
}
