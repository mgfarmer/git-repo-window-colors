// This script runs within the webview context
// It cannot access the main VS Code APIs directly.

// Global variables
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // This will be injected by the extension

const vscode = acquireVsCodeApi();
let currentConfig: any = null;
let validationTimeout: any = null;
let regexValidationTimeout: any = null;

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
    renderWorkspaceInfo(config.workspaceInfo);

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

    // Handle move/reorder buttons
    const moveMatch = target.getAttribute('data-action')?.match(/moveRule\((\d+), '(\w+)', (-?\d+)\)/);
    if (moveMatch) {
        const [, index, ruleType, direction] = moveMatch;
        moveRule(parseInt(index), ruleType, parseInt(direction));
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
            ${createReorderControlsHTML(index, 'repo', totalCount)}
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

        row.innerHTML = createBranchRuleRowHTML(rule, index, rules.length);
        setupBranchRuleRowEvents(row, index);
    });

    container.innerHTML = '';
    container.appendChild(table);
}

function createBranchRuleRowHTML(rule: any, index: number, totalCount: number): string {
    return `
        <td class="reorder-controls">
            ${createReorderControlsHTML(index, 'branch', totalCount)}
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

function createReorderControlsHTML(index: number, ruleType: string, totalCount: number): string {
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
                           id="ask-to-colorize-repo-when-opened"
                           ${settings.askToColorizeRepoWhenOpened ? 'checked' : ''}
                           data-action="updateOtherSetting('askToColorizeRepoWhenOpened', this.checked)">
                    Ask to colorize repo when opened
                </label>
                <span class="tooltiptext" role="tooltip">
                    When enabled, the extension will ask if you'd like to colorize a repository when opening a workspace folder on a repository that doesn't match any existing rules. When disabled, no prompt will be shown.
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
            <div class="setting-item tooltip">
                <label>
                    <input type="checkbox" 
                           id="show-status-icon-when-no-rule-matches"
                           ${settings.showStatusIconWhenNoRuleMatches ? 'checked' : ''}
                           data-action="updateOtherSetting('showStatusIconWhenNoRuleMatches', this.checked)">
                    Show Status Icon Only When No Rule Matches
                </label>
                <span class="tooltiptext" role="tooltip">
                    When enabled, the status bar icon will only appear when no repository rule matches the current workspace. 
                    When disabled, the status bar icon is always visible for Git repositories.
                </span>
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

function updateBranchColumnVisibility() {
    const showBranchColumns = (document.getElementById('show-branch-columns') as HTMLInputElement)?.checked ?? true;
    const branchColumns = document.querySelectorAll('.branch-column');

    branchColumns.forEach((column) => {
        (column as HTMLElement).style.display = showBranchColumns ? '' : 'none';
    });
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
        repoQualifier: isCurrentRepoAlreadyMatched ? 'enter-repo-qualifier' : currentRepoName,
        defaultBranch: '',
        primaryColor: getThemeAppropriateColor(),
        branchColor: '',
    };

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

    // Filter color names that start with the input value
    const matches = HTML_COLOR_NAMES.filter(
        (colorName) => colorName.toLowerCase().includes(value), // && colorName.toLowerCase() !== value,
    );

    if (matches.length === 0) {
        hideAutoCompleteDropdown();
        return;
    }

    showAutoCompleteDropdown(input, matches.slice(0, 20)); // Show max 10 suggestions
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

        // Add color preview
        const preview = document.createElement('span');
        preview.className = 'color-preview';
        preview.style.backgroundColor = suggestion;
        item.appendChild(preview);

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
                const selectedItem = items[selectedSuggestionIndex];
                const colorName = selectedItem.textContent?.replace(/\s+$/, '') || ''; // Remove trailing spaces from preview
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
