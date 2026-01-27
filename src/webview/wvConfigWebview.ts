// This script runs within the webview context
// It cannot access the main VS Code APIs directly.

// Global variables
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // This will be injected by the extension

const vscode = acquireVsCodeApi();
let currentConfig: any = null;
let validationTimeout: any = null;
let regexValidationTimeout: any = null;
let selectedMappingTab: string | null = null; // Track which mapping tab is active

// Load checkbox states from localStorage with defaults
let syncFgBgEnabled = localStorage.getItem('syncFgBgEnabled') !== 'false'; // Default to true
let syncActiveInactiveEnabled = localStorage.getItem('syncActiveInactiveEnabled') !== 'false'; // Default to true
let limitOptionsEnabled = localStorage.getItem('limitOptionsEnabled') === 'true'; // Default to false

// Advanced Mode Types
type PaletteSlotSource = 'fixed' | 'repoColor' | 'branchColor' | 'transparent';

interface PaletteSlotDefinition {
    source: PaletteSlotSource;
    value?: string;
    opacity?: number;
    lighten?: number;
    darken?: number;
    highContrast?: boolean;
}

interface Palette {
    primaryActiveBg: PaletteSlotDefinition;
    primaryActiveFg: PaletteSlotDefinition;
    primaryInactiveBg: PaletteSlotDefinition;
    primaryInactiveFg: PaletteSlotDefinition;
    secondaryActiveBg: PaletteSlotDefinition;
    secondaryActiveFg: PaletteSlotDefinition;
    secondaryInactiveBg: PaletteSlotDefinition;
    secondaryInactiveFg: PaletteSlotDefinition;
    terminalBg: PaletteSlotDefinition;
    terminalFg: PaletteSlotDefinition;
    quaternaryBg: PaletteSlotDefinition;
    quaternaryFg: PaletteSlotDefinition;
    [key: string]: PaletteSlotDefinition;
}

interface MappingValue {
    slot: string;
    opacity?: number;
    fixedColor?: string; // For when slot is '__fixed__'
}

interface SectionMappings {
    [vscodeKey: string]: string | MappingValue;
}

interface AdvancedProfile {
    palette: Palette;
    mappings: SectionMappings;
}

type AdvancedProfileMap = {
    [profileName: string]: AdvancedProfile;
};

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

// Auto-complete state
let activeAutoCompleteInput: HTMLInputElement | null = null;
let autoCompleteDropdown: HTMLElement | null = null;
let selectedSuggestionIndex: number = -1;

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

// Message handler for extension communication
window.addEventListener('message', (event) => {
    const message = event.data;

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
    }
});

// Track pending configuration changes to avoid race conditions
function handleConfigurationData(data: any) {
    // Always use backend data to ensure rule order and matching indexes are consistent
    // The backend data represents the confirmed, persisted state
    currentConfig = data;
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

function renderConfiguration(config: any) {
    console.log('[DEBUG] renderConfiguration ', config);
    // Clear validation errors on new data
    clearValidationErrors();

    renderRepoRules(config.repoRules, config.matchingIndexes?.repoRule);
    renderBranchRules(config.branchRules, config.matchingIndexes?.branchRule);
    renderOtherSettings(config.otherSettings);
    renderProfiles(config.advancedProfiles);
    renderWorkspaceInfo(config.workspaceInfo);
    renderColorReport(config);

    // Update profiles tab visibility based on settings
    updateProfilesTabVisibility();

    // Attach event listeners after DOM is updated
    attachEventListeners();
}

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
}

function handleDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target) return;

    // Handle delete buttons
    if (target.classList.contains('delete-btn')) {
        const repoMatch = target.getAttribute('data-action')?.match(/deleteRepoRule\((\d+)\)/);
        const branchMatch = target.getAttribute('data-action')?.match(/deleteBranchRule\((\d+)\)/);

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
            const rule = currentConfig?.branchRules?.[index];
            const ruleDescription = rule ? `"${rule.pattern}" -> ${rule.color}` : `#${index + 1}`;

            // Send delete confirmation request to backend
            vscode.postMessage({
                command: 'confirmDelete',
                data: {
                    deleteData: {
                        ruleType: 'branch',
                        index: index,
                        ruleDescription: ruleDescription,
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
    if (target.classList.contains('eye-btn')) {
        const action = target.getAttribute('data-action');
        const match = action?.match(/toggleRule\((\d+), '(\w+)'\)/);
        if (match) {
            const [, index, ruleType] = match;
            toggleRule(parseInt(index), ruleType);
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
    const moveMatch = target.getAttribute('data-action')?.match(/moveRule\((\d+), '(\w+)', (-?\d+)\)/);
    if (moveMatch) {
        const [, index, ruleType, direction] = moveMatch;
        moveRule(parseInt(index), ruleType, parseInt(direction));
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
        if (extraAction === 'updateBranchColumnVisibility') {
            updateBranchColumnVisibility();
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

    // Handle regex validation for branch pattern inputs
    if (target.id && target.id.startsWith('branch-pattern-')) {
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
    headerRow.innerHTML = `
        <th scope="col">Actions</th>
        <th scope="col">Repository Qualifier</th>
        <th scope="col">Primary Color</th>
        <th scope="col" class="branch-column">Default Branch</th>
        <th scope="col" class="branch-column">Branch Color</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

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

    // Update branch column visibility
    updateBranchColumnVisibility();
}

function createRepoRuleRowHTML(rule: any, index: number, totalCount: number): string {
    return `
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
        <td class="branch-column">
            <input type="text" 
                   class="rule-input" 
                   id="repo-branch-${index}"
                   value="${escapeHtml(rule.defaultBranch || '')}" 
                   placeholder="e.g., main, master"
                   aria-label="Default branch for rule ${index + 1}"
                   data-action="updateRepoRule(${index}, 'defaultBranch', this.value)">
        </td>
        <td class="color-cell branch-column">
            ${createColorInputHTML(rule.branchColor || '', 'repo', index, 'branchColor')}
        </td>
    `;
}

function renderBranchRules(rules: any[], matchingIndex?: number) {
    const container = document.getElementById('branchRulesContent');
    if (!container) return;

    if (!rules || rules.length === 0) {
        container.innerHTML =
            '<div class="no-rules">No branch rules defined. Click "Add" to create your first rule.</div>';
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
        <th scope="col">Actions</th>
        <th scope="col">Branch Pattern</th>
        <th scope="col">Color</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

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
}

function createBranchRuleRowHTML(rule: any, index: number, totalCount: number): string {
    return `
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
                       placeholder="e.g., blue, #4A90E2"
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
                       placeholder="e.g., blue, #4A90E2"
                       data-action="updateColorRule('${ruleType}', ${index}, '${field}', this.value)"
                       aria-label="Color for ${ruleType} rule ${index + 1} ${field}">
            </div>
        `;
    }
}

function createReorderControlsHTML(index: number, ruleType: string, totalCount: number, rule: any): string {
    const isEnabled = rule.enabled !== false;
    const eyeIcon = isEnabled ? '👁️' : '⊗';
    const eyeTitle = isEnabled ? 'Disable this rule' : 'Enable this rule';

    return `
        <div class="reorder-buttons">
            <div class="drag-handle tooltip right-tooltip" 
                 draggable="true" 
                 data-drag-index="${index}"
                 data-drag-type="${ruleType}"
                 title="Drag to reorder"
                 tabindex="0"
                 role="button"
                 aria-label="Drag handle for rule ${index + 1}">⋮⋮
                <span class="tooltiptext" role="tooltip">
                    Drag this handle to reorder rules. Rules are processed from top to bottom.
                </span>
            </div>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', -1)" 
                    title="Move up"
                    aria-label="Move rule ${index + 1} up"
                    ${index === 0 ? 'disabled' : ''}>▲</button>
            <button class="reorder-btn" 
                    data-action="moveRule(${index}, '${ruleType}', 1)" 
                    title="Move down"
                    aria-label="Move rule ${index + 1} down"
                    ${index === totalCount - 1 ? 'disabled' : ''}>▼</button>
            <button class="eye-btn" 
                    data-action="toggleRule(${index}, '${ruleType}')"
                    title="${eyeTitle}"
                    aria-label="Toggle ${ruleType} rule ${index + 1}">${eyeIcon}</button>
            <button class="delete-btn" 
                    data-action="delete${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}Rule(${index})"
                    title="Delete this rule"
                    aria-label="Delete ${ruleType} rule ${index + 1}">🗙</button>
        </div>
    `;
}

function renderOtherSettings(settings: any) {
    const container = document.getElementById('otherSettingsContent');
    if (!container) return;

    container.innerHTML = `
        <div class="settings-sections">
            <div class="settings-section">
                <h3>Color Options</h3>
                <div class="section-help" style="margin-bottom: 10px;">
                    <strong>Note:</strong> These settings only apply when using simple colors. When using Profiles, these color-related settings are controlled by the profile configuration.
                </div>
                <div class="settings-grid">
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="color-status-bar"
                                   ${settings.colorStatusBar ? 'checked' : ''}
                                   data-action="updateOtherSetting('colorStatusBar', this.checked)">
                            Color Status Bar
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            Apply repository colors to the status bar at the bottom of the VS Code window. 
                            This give the repository color more prominence.
                        </span>
                    </div>
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="color-editor-tabs"
                                   ${settings.colorEditorTabs ? 'checked' : ''}
                                   data-action="updateOtherSetting('colorEditorTabs', this.checked)">
                            Color Editor Tabs
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            Apply repository colors to editor tabs. This give the repository color more prominence.
                        </span>
                    </div>
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="color-inactive-titlebar"
                                   ${settings.colorInactiveTitlebar ? 'checked' : ''}
                                   data-action="updateOtherSetting('colorInactiveTitlebar', this.checked)">
                            Color Inactive Title Bar
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            Apply colors to the title bar even when the VS Code window is not focused. 
                            This maintains visual identification when switching between applications.
                        </span>
                    </div>
                    <div class="setting-item range-slider tooltip">
                        <label for="activity-bar-knob">Color Knob:</label>
                        <div class="range-controls">
                            <input type="range" 
                                   id="activity-bar-knob" 
                                   min="-10" 
                                   max="10" 
                                   value="${settings.activityBarColorKnob || 0}"
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
                    <div class="setting-item range-slider tooltip">
                        <label for="branch-hue-rotation">Branch Hue Rotation:</label>
                        <div class="range-controls">
                            <input type="range" 
                                   id="branch-hue-rotation" 
                                   min="-179" 
                                   max="179" 
                                   value="${settings.automaticBranchIndicatorColorKnob || 60}"
                                   data-action="updateOtherSetting('automaticBranchIndicatorColorKnob', parseInt(this.value))"
                                   aria-label="Branch hue rotation from -179 to +179 degrees">
                            <span id="branch-hue-rotation-value" class="value-display">${settings.automaticBranchIndicatorColorKnob || 60}°</span>
                        </div>
                        <span class="tooltiptext" role="tooltip">
                            Automatically shift the hue of branch indicator colors. This creates visual variation 
                            for branch-specific coloring when a default branch is specified and no explicit branch color is defined. 
                            A value of 180 means
                            opposite colors, while 60 or -60 gives a nice complementary colors. Or use anything you like!
                            Note: This setting does not apply to discrete branch rules. 
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3>Other Options</h3>
                <div class="settings-grid">
                    <div class="setting-item tooltip">
                        <label>
                            <input type="checkbox" 
                                   id="show-branch-columns"
                                   ${settings.showBranchColumns ? 'checked' : ''}
                                   data-action="updateOtherSetting('showBranchColumns', this.checked)"
                                   data-extra-action="updateBranchColumnVisibility">
                            Show Branch Columns in Repository Rules
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            Show or hide the Default Branch and Branch Color columns in the Repository Rules table. 
                            Disable this to simplify the interface if you only use basic repository coloring, or want to
                            use separate branch rules instead.
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
                                   data-action="updateOtherSetting('enableProfilesAdvanced', this.checked)"
                                   data-extra-action="updateProfilesTabVisibility">
                            Enable Profiles (Advanced)
                        </label>
                        <span class="tooltiptext" role="tooltip">
                            Enable the advanced Profiles feature, which allows you to define reusable color palettes and map them to specific UI elements. 
                            When enabled, the Profiles tab will appear in the main navigation.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Set up range input value updates
    setupRangeInputUpdates();
}

function setupRangeInputUpdates() {
    const activityBarKnob = document.getElementById('activity-bar-knob') as HTMLInputElement;
    const branchHueRotation = document.getElementById('branch-hue-rotation') as HTMLInputElement;

    if (activityBarKnob) {
        activityBarKnob.addEventListener('input', function () {
            const valueSpan = document.getElementById('activity-bar-knob-value');
            if (valueSpan) valueSpan.textContent = this.value;
        });
    }

    if (branchHueRotation) {
        branchHueRotation.addEventListener('input', function () {
            const valueSpan = document.getElementById('branch-hue-rotation-value');
            if (valueSpan) valueSpan.textContent = this.value + '°';
        });
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

    // Get matching rules
    const matchedRepoRule =
        config.matchingIndexes?.repoRule >= 0 ? config.repoRules?.[config.matchingIndexes.repoRule] : null;
    const matchedBranchRule =
        config.matchingIndexes?.branchRule >= 0 ? config.branchRules?.[config.matchingIndexes.branchRule] : null;

    // Helper function to determine source for each theme key
    const getSourceForKey = (key: string): { description: string; gotoData: string } => {
        // Activity bar colors typically come from branch rules when a branch rule is matched
        // Otherwise they come from repo rules
        const isActivityBarKey = key.startsWith('activityBar.');

        if (isActivityBarKey && matchedBranchRule) {
            const pattern = escapeHtml(matchedBranchRule.pattern);
            const gotoData = `branch:${config.matchingIndexes.branchRule}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `Branch Rule: "<span class="goto-link" data-goto="${gotoData}">${escapeHtml(pattern)}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const color = escapeHtml(matchedBranchRule.color);
            return {
                description: `Branch Rule: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
                gotoData: gotoData,
            };
        }

        if (matchedRepoRule) {
            const qualifier = escapeHtml(matchedRepoRule.repoQualifier);
            const gotoData = `repo:${config.matchingIndexes.repoRule}`;
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
            const gotoData = `branch:${config.matchingIndexes.branchRule}`;

            // Check if using a profile
            if (matchedBranchRule.profileName) {
                const profileName = matchedBranchRule.profileName;
                const profileGotoData = `profile:${escapeHtml(profileName)}:${escapeHtml(key)}`;
                return {
                    description: `Branch Rule: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (using profile: <span class="goto-link" data-goto="${profileGotoData}">${escapeHtml(profileName)}</span>)`,
                    gotoData: profileGotoData,
                };
            }

            const color = escapeHtml(matchedBranchRule.color);
            return {
                description: `Branch Rule: "<span class="goto-link" data-goto="${gotoData}">${pattern}</span>" (base color: <span class="goto-link" data-goto="${gotoData}">${color}</span>)`,
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
                    gotoTarget = `data-goto="branch:${config.matchingIndexes.branchRule}"`;
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
                    gotoTarget = `data-goto="branch:${config.matchingIndexes.branchRule}"`;
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

    const tableHTML = `
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

function updateBranchColumnVisibility() {
    const showBranchColumns = (document.getElementById('show-branch-columns') as HTMLInputElement)?.checked ?? true;
    const branchColumns = document.querySelectorAll('.branch-column');

    branchColumns.forEach((column) => {
        (column as HTMLElement).style.display = showBranchColumns ? '' : 'none';
    });
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
        defaultBranch: '',
        primaryColor: getThemeAppropriateColor(),
        branchColor: '',
    };

    // Determine insertion index:
    // If current repository matches an existing rule, insert the new rule just ABOVE the first matching rule.
    // Otherwise append to the end.
    let insertIndex = currentConfig.repoRules.length; // default append

    if (isCurrentRepoAlreadyMatched) {
        // matchingIndexes.repoRule holds the FIRST matched rule index (as calculated by backend)
        const matchedIndex = currentConfig.matchingIndexes?.repoRule;
        if (matchedIndex !== undefined && matchedIndex !== null && matchedIndex >= 0) {
            insertIndex = matchedIndex; // insert above the matched rule
        }
    } else {
        // Fallback heuristic: try to locate first rule whose repoQualifier is a substring of the current repository URL
        const repoUrl = currentConfig.workspaceInfo?.repositoryUrl || '';
        for (let i = 0; i < currentConfig.repoRules.length; i++) {
            const qualifier = currentConfig.repoRules[i]?.repoQualifier;
            if (qualifier && repoUrl.includes(qualifier)) {
                insertIndex = i;
                break;
            }
        }
    }

    // Insert at computed index
    currentConfig.repoRules.splice(insertIndex, 0, newRule);
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
    };

    currentConfig.branchRules.push(newRule);
    sendConfiguration();
}

function updateRepoRule(index: number, field: string, value: string) {
    if (!currentConfig?.repoRules?.[index]) return;

    currentConfig.repoRules[index][field] = value;
    debounceValidateAndSend();
}

function updateBranchRule(index: number, field: string, value: string) {
    if (!currentConfig?.branchRules?.[index]) return;

    currentConfig.branchRules[index][field] = value;
    debounceValidateAndSend();
}

function updateColorRule(ruleType: string, index: number, field: string, value: string) {
    if (!currentConfig) return;

    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
    if (!rules?.[index]) return;

    rules[index][field] = value;

    // Update color swatch if present
    updateColorSwatch(ruleType, index, field, value);

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
    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
    if (!rules?.[index]) return;

    rules[index][field] = randomColor;

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

    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
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

    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
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

    if (value.length === 0) {
        hideAutoCompleteDropdown();
        return;
    }

    const matches: string[] = [];

    // Check if this is a palette slot input (should not show profiles)
    const isPaletteSlot = input.hasAttribute('data-palette-slot');

    // Check if profiles are enabled
    const profilesEnabled = currentConfig?.otherSettings?.enableProfilesAdvanced ?? false;

    // 1. Add matching profile names first (only for non-palette inputs and when profiles are enabled)
    if (!isPaletteSlot && profilesEnabled && currentConfig?.advancedProfiles) {
        const profileNames = Object.keys(currentConfig.advancedProfiles);
        profileNames.forEach((name) => {
            if (name.toLowerCase().includes(value)) {
                matches.push(name);
            }
        });
    }

    // 2. Add matching color names
    const colorMatches = HTML_COLOR_NAMES.filter((colorName) => colorName.toLowerCase().includes(value));
    matches.push(...colorMatches);

    if (matches.length === 0) {
        hideAutoCompleteDropdown();
        return;
    }

    showAutoCompleteDropdown(input, matches.slice(0, 20)); // Show max 20 suggestions
}

function showAutoCompleteDropdown(input: HTMLInputElement, suggestions: string[]) {
    hideAutoCompleteDropdown(); // Hide any existing dropdown

    const dropdown = document.createElement('div');
    dropdown.className = 'color-autocomplete-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Color name suggestions');

    suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'color-autocomplete-item';
        item.setAttribute('role', 'option');
        item.textContent = suggestion;
        item.dataset.index = index.toString();
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
            selectedSuggestionIndex = index;
            updateAutoCompleteSelection();
        });

        dropdown.appendChild(item);
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
    terminalBg: 'Tertiary Background',
    terminalFg: 'Tertiary Foreground',
    quaternaryBg: 'Quaternary Background',
    quaternaryFg: 'Quaternary Foreground',
};

// Explicit ordering for palette slots to ensure Bg/Fg pairs stay together
const PALETTE_SLOT_ORDER: string[] = [
    'primaryActiveBg',
    'primaryActiveFg',
    'primaryInactiveBg',
    'primaryInactiveFg',
    'secondaryActiveBg',
    'secondaryActiveFg',
    'secondaryInactiveBg',
    'secondaryInactiveFg',
    'terminalBg',
    'terminalFg',
    'quaternaryBg',
    'quaternaryFg',
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
    terminalBg: { source: 'fixed', value: '#1E1E1E' },
    terminalFg: { source: 'fixed', value: '#CCCCCC' },
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
 * Filter palette slots to only show related options based on element characteristics
 */
function getFilteredPaletteOptions(elementKey: string, allSlots: string[], currentSlot?: string): string[] {
    if (!limitOptionsEnabled) {
        return allSlots; // Return all if filtering is disabled
    }

    const isBg = isBackgroundElement(elementKey);
    const isFg = isForegroundElement(elementKey);
    const isActive = isActiveElement(elementKey);
    const isInactive = isInactiveElement(elementKey);
    const isNeutral = isNeutralElement(elementKey);

    const filtered = allSlots.filter((slot) => {
        if (slot === 'none') return true; // Always include 'none'

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
        if (isNeutral && !slotIsNeutral) return false;

        return true;
    });

    // Always include the current slot if it's set and not already in the filtered list
    if (currentSlot && currentSlot !== 'none' && currentSlot !== '__fixed__' && !filtered.includes(currentSlot)) {
        filtered.push(currentSlot);
    }

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
        Object.keys(profiles).forEach((name) => {
            const el = document.createElement('div');
            el.className = 'profile-item';
            el.dataset.profileName = name;
            if (name === selectedProfileName) el.classList.add('selected');

            // Create name span with badge
            const nameContainer = document.createElement('div');
            nameContainer.className = 'profile-name-container';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'profile-name';
            nameSpan.textContent = name;

            // Count total active mappings for badge
            const profile = profiles[name];
            const totalActive = countTotalActiveMappings(profile);

            const badge = document.createElement('span');
            badge.className = 'profile-count-badge';
            badge.textContent = totalActive.toString();
            badge.title = `${totalActive} elements being colored`;

            nameContainer.appendChild(nameSpan);
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
            swatch.textContent = 'sample';

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

function renderProfileEditor(name: string, profile: AdvancedProfile) {
    // Name Input
    const nameInput = document.getElementById('profileNameInput') as HTMLInputElement;
    if (nameInput) {
        nameInput.value = name;
        // Handle name change
        nameInput.onchange = (e) => renameProfile(name, (e.target as HTMLInputElement).value);
    }

    // Palette Editor
    const paletteGrid = document.getElementById('paletteEditor');
    if (paletteGrid) {
        paletteGrid.innerHTML = '';

        // Ensure all palette slots exist (migration for older profiles)
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
            { name: 'Tertiary', slots: ['terminalBg', 'terminalFg'] },
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

        Object.keys(SECTION_DEFINITIONS).forEach((sectionName) => {
            const keys = SECTION_DEFINITIONS[sectionName];

            // Count active mappings in this section
            const activeCount = countActiveMappings(profile, keys);

            // Tab Button
            const tabBtn = document.createElement('button');
            tabBtn.className = 'mapping-tab-btn';

            // Tab text
            const tabText = document.createElement('span');
            tabText.textContent = sectionName;
            tabBtn.appendChild(tabText);

            // Badge with count (only show if > 0)
            if (activeCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'mapping-tab-badge';
                badge.textContent = activeCount.toString();
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
            grid.style.padding = '10px 0';

            keys.forEach((key: string) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';

                const label = document.createElement('label');
                label.textContent = key;
                label.style.fontSize = '12px';
                label.style.color = 'var(--vscode-foreground)';
                label.style.minWidth = '200px';
                label.style.flexShrink = '0';

                // Get current mapping value (handle both string and object formats)
                const mappingValue = profile.mappings[key];
                let currentSlot: string;
                let currentOpacity: number | undefined;
                let currentFixedColor: string | undefined;

                // Debug: Check if mapping exists
                if (mappingValue !== undefined && mappingValue !== 'none') {
                    console.log(`[Mapping Debug] ${key}: mappingValue =`, mappingValue);
                }

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

                const select = document.createElement('select');
                select.title = `Select palette color for ${key}`;
                select.style.flex = '1';
                select.style.background = 'var(--vscode-dropdown-background)';
                select.style.color = 'var(--vscode-dropdown-foreground)';
                select.style.border = '1px solid var(--vscode-dropdown-border)';
                select.style.padding = '4px';
                select.style.fontSize = '12px';

                // Add 'none' option
                const noneOption = document.createElement('option');
                noneOption.value = 'none';
                noneOption.textContent = 'None';
                if (currentSlot === 'none') noneOption.selected = true;
                select.appendChild(noneOption);

                // Add 'Fixed Color' option (always included)
                const fixedOption = document.createElement('option');
                fixedOption.value = '__fixed__';
                fixedOption.textContent = 'Fixed Color';
                if (currentSlot === '__fixed__') fixedOption.selected = true;
                select.appendChild(fixedOption);

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
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = PALETTE_SLOT_LABELS[opt] || opt.charAt(0).toUpperCase() + opt.slice(1);
                    if (opt === currentSlot) {
                        option.selected = true;
                        console.log(`[Mapping Debug] ${key}: Selected option "${opt}"`);
                    }
                    select.appendChild(option);
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
                    if (select.value === '__fixed__') {
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
                    const slotName = select.value;
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

                // Create color swatch preview
                const colorSwatch = document.createElement('div');
                colorSwatch.style.width = '22px';
                colorSwatch.style.height = '22px';
                colorSwatch.style.border = '1px solid var(--vscode-panel-border)';
                colorSwatch.style.borderRadius = '2px';
                colorSwatch.style.flexShrink = '0';

                // Function to update the swatch color
                const updateSwatchColor = () => {
                    const slotName = select.value;
                    if (slotName === 'none') {
                        colorSwatch.style.background = 'transparent';
                    } else if (slotName === '__fixed__') {
                        const color = convertColorToHex(textInput.value);
                        const opacity = parseInt(opacitySlider.value) / 100;
                        const rgbaColor = hexToRgba(color, opacity);
                        colorSwatch.style.background = rgbaColor;
                    } else if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        const profile = currentConfig.advancedProfiles[selectedProfileName];
                        const slotDef = profile.palette[slotName];
                        if (slotDef && slotDef.value) {
                            const color = convertColorToHex(slotDef.value);
                            const opacity = parseInt(opacitySlider.value) / 100;
                            const rgbaColor = hexToRgba(color, opacity);
                            colorSwatch.style.background = rgbaColor;
                        } else {
                            colorSwatch.style.background = 'transparent';
                        }
                    }
                };

                // Initial swatch color
                updateSwatchColor();

                // Update function for both select and opacity
                const updateMapping = () => {
                    if (selectedProfileName && currentConfig.advancedProfiles[selectedProfileName]) {
                        const newSlot = select.value;
                        const newOpacity = parseInt(opacitySlider.value) / 100;

                        if (newSlot === 'none') {
                            delete currentConfig.advancedProfiles[selectedProfileName].mappings[key];
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
                    updateSwatchColor();
                };

                // Fixed color picker event handlers
                colorInput.onchange = () => {
                    textInput.value = colorInput.value;
                    updateMapping();
                    updateSliderGradient();
                    updateSwatchColor();
                };

                randomBtn.onclick = () => {
                    const randomColor = getThemeAppropriateColor();
                    textInput.value = randomColor;
                    colorInput.value = convertColorToHex(randomColor);
                    updateMapping();
                    updateSliderGradient();
                    updateSwatchColor();
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
                    updateSwatchColor();
                };

                select.onchange = () => {
                    updateSelectWidth();
                    updateMapping();
                    updateSliderGradient();
                    updateSwatchColor();

                    const newSlot = select.value;
                    const keysToSync: string[] = [];

                    // Collect all keys to sync based on enabled options
                    if (syncFgBgEnabled) {
                        const fgBgKey = findCorrespondingFgBg(key);
                        if (fgBgKey) keysToSync.push(fgBgKey);
                    }

                    if (syncActiveInactiveEnabled) {
                        const activeInactiveKey = findCorrespondingActiveInactive(key);
                        if (activeInactiveKey) keysToSync.push(activeInactiveKey);
                    }

                    // If both syncs are enabled, also sync the diagonal (e.g., activeFg -> inactiveBg)
                    if (syncFgBgEnabled && syncActiveInactiveEnabled) {
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
                        if (correspondingSlot !== 'none') {
                            // Apply fg/bg transformation if needed
                            if (
                                findCorrespondingFgBg(key) === correspondingKey ||
                                (syncFgBgEnabled &&
                                    syncActiveInactiveEnabled &&
                                    correspondingKey.includes(
                                        findCorrespondingFgBg(key)?.split('.')[1]?.substring(0, 6) || '',
                                    ))
                            ) {
                                const fgBgSlot = getCorrespondingPaletteSlot(correspondingSlot);
                                if (fgBgSlot) correspondingSlot = fgBgSlot;
                            }

                            // Apply active/inactive transformation if needed
                            if (
                                findCorrespondingActiveInactive(key) === correspondingKey ||
                                (syncFgBgEnabled &&
                                    syncActiveInactiveEnabled &&
                                    key !== correspondingKey &&
                                    findCorrespondingFgBg(key) !== correspondingKey)
                            ) {
                                const activeInactiveSlot = getCorrespondingActiveInactiveSlot(correspondingSlot);
                                if (activeInactiveSlot) correspondingSlot = activeInactiveSlot;
                            }
                        }

                        // Find and update the corresponding select element
                        const allSelects = document.querySelectorAll('select');
                        allSelects.forEach((otherSelect: any) => {
                            if (otherSelect.title === `Select palette color for ${correspondingKey}`) {
                                otherSelect.value = correspondingSlot;
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

                row.appendChild(label);
                row.appendChild(dropdownContainer);
                row.appendChild(colorSwatch);
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

        // Set up sync checkbox event listeners and restore their states
        const syncFgBgCheckbox = document.getElementById('syncFgBgCheckbox') as HTMLInputElement;
        if (syncFgBgCheckbox) {
            syncFgBgCheckbox.checked = syncFgBgEnabled;
            syncFgBgCheckbox.addEventListener('change', () => {
                syncFgBgEnabled = syncFgBgCheckbox.checked;
                localStorage.setItem('syncFgBgEnabled', syncFgBgEnabled.toString());
            });
        }

        const syncActiveInactiveCheckbox = document.getElementById('syncActiveInactiveCheckbox') as HTMLInputElement;
        if (syncActiveInactiveCheckbox) {
            syncActiveInactiveCheckbox.checked = syncActiveInactiveEnabled;
            syncActiveInactiveCheckbox.addEventListener('change', () => {
                syncActiveInactiveEnabled = syncActiveInactiveCheckbox.checked;
                localStorage.setItem('syncActiveInactiveEnabled', syncActiveInactiveEnabled.toString());
            });
        }

        const limitOptionsCheckbox = document.getElementById('limitOptionsCheckbox') as HTMLInputElement;
        if (limitOptionsCheckbox) {
            limitOptionsCheckbox.checked = limitOptionsEnabled;
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
    textInput.placeholder = 'e.g., blue, #4A90E2';
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

function saveProfiles() {
    vscode.postMessage({
        command: 'updateAdvancedProfiles',
        data: {
            advancedProfiles: currentConfig.advancedProfiles,
        },
    });
}
