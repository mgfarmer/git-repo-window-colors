// This script runs within the webview context
// It cannot access the main VS Code APIs directly.

// Global variables
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // This will be injected by the extension

const vscode = acquireVsCodeApi();
let currentConfig: any = null;
let validationTimeout: any = null;

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
    // Check VS Code theme by looking at computed styles
    const body = document.body;
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

    // Fallback: check CSS variables
    const editorBg = getComputedStyle(body).getPropertyValue('--vscode-editor-background');
    if (editorBg) {
        // If editor background is available, assume it's properly themed
        // VS Code dark themes typically have dark editor backgrounds
        return true; // Most VS Code usage is dark mode
    }

    return true; // Default to dark mode assumption
}

function getThemeAppropriateColor(): string {
    const isDark = isThemeDark();

    // Predefined color palettes
    const darkModeColors = [
        '#1E4A72', // Deep navy blue
        '#2C5F41', // Deep forest green
        '#8B2635', // Deep burgundy red
        '#5D4E75', // Deep purple
        '#B8860B', // Deep golden orange
        '#2F6B5B', // Deep teal
        '#8B4513', // Deep brown-red
        '#483D8B', // Deep slate blue
    ];

    const lightModeColors = [
        '#4A90E2', // Bright blue
        '#50C878', // Emerald green
        '#E74C3C', // Bright red
        '#9B59B6', // Bright purple
        '#F39C12', // Orange
        '#1ABC9C', // Turquoise
        '#E67E22', // Dark orange
        '#3498DB', // Light blue
    ];

    const colors = isDark ? darkModeColors : lightModeColors;
    return colors[Math.floor(Math.random() * colors.length)];
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
        case 'previewResult':
            handlePreviewResult(message.data);
            break;
        case 'colorPickerResult':
            handleColorPickerResult(message.data);
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

function handlePreviewResult(data: any) {
    console.log('Preview applied:', data);
}

function handleColorPickerResult(data: any) {
    if (data.colorPickerData && data.selectedColor) {
        const { ruleType, ruleIndex, field } = data.colorPickerData;
        updateColorInUI(ruleType, ruleIndex, field, data.selectedColor);
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
    document.removeEventListener('dragstart', handleDocumentDragStart);
    document.removeEventListener('dragover', handleDocumentDragOver);
    document.removeEventListener('drop', handleDocumentDrop);

    // Add new event listeners using event delegation
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('change', handleDocumentChange);
    document.addEventListener('input', handleDocumentInput);
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
            deleteRepoRule(parseInt(repoMatch[1]));
        } else if (branchMatch) {
            deleteBranchRule(parseInt(branchMatch[1]));
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

    const action = target.getAttribute('data-input-action');
    if (!action) return;

    const match = action.match(/syncColorInputs\('(\w+)', (\d+), '(\w+)', this\.value\)/);
    if (match) {
        const [, ruleType, index, field] = match;
        syncColorInputs(ruleType, parseInt(index), field, target.value);
    }
}

function handleDocumentDragStart(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (target?.classList.contains('drag-handle')) {
        const index = target.getAttribute('data-drag-index');
        const ruleType = target.getAttribute('data-drag-type');
        if (index && ruleType) {
            handleDragStart(event, parseInt(index), ruleType);
        }
    }
}

function handleDocumentDragOver(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (target?.classList.contains('drag-handle')) {
        handleDragOver(event);
    }
}

function handleDocumentDrop(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (target?.classList.contains('drag-handle')) {
        const index = target.getAttribute('data-drag-index');
        const ruleType = target.getAttribute('data-drag-type');
        if (index && ruleType) {
            handleDrop(event, parseInt(index), ruleType);
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
        <th scope="col" class="branch-column">Default Branch</th>
        <th scope="col">Primary Color</th>
        <th scope="col" class="branch-column">Branch Color</th>
    `;

    // Create body
    const tbody = table.createTBody();
    rules.forEach((rule, index) => {
        const row = tbody.insertRow();
        row.className = 'rule-row';

        // Highlight matched rule
        if (matchingIndex !== undefined && index === matchingIndex) {
            console.log('[DEBUG] Applying matched-rule class to index:', index, 'rule:', rule.repoQualifier);
            row.classList.add('matched-rule');
        }

        row.innerHTML = createRepoRuleRowHTML(rule, index);
        setupRepoRuleRowEvents(row, index);
    });

    container.innerHTML = '';
    container.appendChild(table);

    // Update branch column visibility
    updateBranchColumnVisibility();
}

function createRepoRuleRowHTML(rule: any, index: number): string {
    return `
        <td class="reorder-controls">
            ${createReorderControlsHTML(index, 'repo')}
        </td>
        <td>
            <input type="text" 
                   class="rule-input" 
                   id="repo-qualifier-${index}"
                   value="${escapeHtml(rule.repoQualifier || '')}" 
                   placeholder="e.g., myrepo or github.com/user/repo"
                   aria-label="Repository qualifier for rule ${index + 1}"
                   data-action="updateRepoRule(${index}, 'repoQualifier', this.value)">
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
        <td class="color-cell">
            ${createColorInputHTML(rule.primaryColor || '', 'repo', index, 'primaryColor')}
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

        row.innerHTML = createBranchRuleRowHTML(rule, index);
        setupBranchRuleRowEvents(row, index);
    });

    container.innerHTML = '';
    container.appendChild(table);
}

function createBranchRuleRowHTML(rule: any, index: number): string {
    return `
        <td class="reorder-controls">
            ${createReorderControlsHTML(index, 'branch')}
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

function createReorderControlsHTML(index: number, ruleType: string): string {
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
                    aria-label="Move rule ${index + 1} down">▼</button>
            <button class="delete-btn" 
                    data-action="delete${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}Rule(${index})"
                    title="Delete this rule"
                    aria-label="Delete ${ruleType} rule ${index + 1}">×</button>
        </div>
    `;
}

function renderOtherSettings(settings: any) {
    const container = document.getElementById('otherSettingsContent');
    if (!container) return;

    container.innerHTML = `
        <div class="settings-grid">
            <div class="setting-item">
                <label for="activity-bar-knob">Activity Bar Color Knob:</label>
                <input type="range" 
                       id="activity-bar-knob" 
                       min="-10" 
                       max="10" 
                       value="${settings.activityBarColorKnob || 0}"
                       data-action="updateOtherSetting('activityBarColorKnob', parseInt(this.value))"
                       aria-label="Activity bar color adjustment from -10 to +10">
                <span id="activity-bar-knob-value">${settings.activityBarColorKnob || 0}</span>
            </div>
            <div class="setting-item">
                <label for="branch-hue-rotation">Branch Hue Rotation:</label>
                <input type="range" 
                       id="branch-hue-rotation" 
                       min="-359" 
                       max="359" 
                       value="${settings.automaticBranchIndicatorColorKnob || 60}"
                       data-action="updateOtherSetting('automaticBranchIndicatorColorKnob', parseInt(this.value))"
                       aria-label="Branch hue rotation from -359 to +359 degrees">
                <span id="branch-hue-rotation-value">${settings.automaticBranchIndicatorColorKnob || 60}°</span>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" 
                           id="color-status-bar"
                           ${settings.colorStatusBar ? 'checked' : ''}
                           data-action="updateOtherSetting('colorStatusBar', this.checked)">
                    Color Status Bar
                </label>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" 
                           id="color-editor-tabs"
                           ${settings.colorEditorTabs ? 'checked' : ''}
                           data-action="updateOtherSetting('colorEditorTabs', this.checked)">
                    Color Editor Tabs
                </label>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" 
                           id="color-inactive-titlebar"
                           ${settings.colorInactiveTitlebar ? 'checked' : ''}
                           data-action="updateOtherSetting('colorInactiveTitlebar', this.checked)">
                    Color Inactive Title Bar
                </label>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" 
                           id="show-branch-columns"
                           ${settings.showBranchColumns ? 'checked' : ''}
                           data-action="updateOtherSetting('showBranchColumns', this.checked)"
                           data-extra-action="updateBranchColumnVisibility">
                    Show Branch Columns in Repository Rules
                </label>
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

    const newRule = {
        repoQualifier: extractRepoNameFromUrl(currentConfig.workspaceInfo?.repositoryUrl || ''),
        defaultBranch: '',
        primaryColor: getThemeAppropriateColor(),
        branchColor: '',
    };

    currentConfig.repoRules.push(newRule);
    //renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
    sendConfiguration();
}

function addBranchRule() {
    if (!currentConfig) return;

    const newRule = {
        pattern: '',
        color: getThemeAppropriateColor(),
    };

    currentConfig.branchRules.push(newRule);
    //renderBranchRules(currentConfig.branchRules, currentConfig.matchingIndexes?.branchRule);
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
    console.log(
        `[DEBUG] updateColorSwatch called with: ruleType="${ruleType}", index=${index}, field="${field}", value="${value}"`,
    );

    const colorInput = document.getElementById(`${ruleType}-${field}-${index}`) as HTMLInputElement;
    if (colorInput && colorInput.type === 'color') {
        // Convert any color format to hex for the native color input
        const hexColor = convertColorToHex(value);
        colorInput.value = hexColor;
        console.log(`[DEBUG] Updated native color input to: "${hexColor}"`);
    }

    // Update the swatch background for non-native color picker (only if swatch exists)
    const swatch = colorInput?.parentElement?.querySelector('.color-swatch') as HTMLElement;
    console.log(`[DEBUG] Found swatch element:`, swatch);

    if (swatch) {
        // For named colors and other formats, try to convert to a valid CSS color
        const displayColor = convertColorToValidCSS(value) || '#4A90E2';
        console.log(`[DEBUG] Setting swatch backgroundColor to: "${displayColor}"`);
        swatch.style.backgroundColor = displayColor;
    } else {
        console.log(`[DEBUG] No swatch element found - using native color picker`);
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

function deleteRepoRule(index: number) {
    if (!currentConfig?.repoRules) return;

    currentConfig.repoRules.splice(index, 1);
    //renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
    sendConfiguration();
}

function deleteBranchRule(index: number) {
    if (!currentConfig?.branchRules) return;

    currentConfig.branchRules.splice(index, 1);
    //renderBranchRules(currentConfig.branchRules, currentConfig.matchingIndexes?.branchRule);
    sendConfiguration();
}

function moveRule(index: number, ruleType: string, direction: number) {
    console.log('[DEBUG] moveRule called:', { index, ruleType, direction });
    console.log('[DEBUG] currentConfig exists:', !!currentConfig);

    if (!currentConfig) return;

    const rules = ruleType === 'repo' ? currentConfig.repoRules : currentConfig.branchRules;
    console.log('[DEBUG] Rules array exists:', !!rules, 'length:', rules?.length);

    if (!rules) return;

    console.log(
        '[DEBUG] Rules before move:',
        rules.map((r) => (ruleType === 'repo' ? r.repoQualifier : r.pattern)),
    );

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rules.length) {
        console.log('[DEBUG] Move cancelled - out of bounds:', { newIndex, length: rules.length });
        return;
    }

    // Swap rules
    const temp = rules[index];
    rules[index] = rules[newIndex];
    rules[newIndex] = temp;

    console.log(
        '[DEBUG] Rules after move:',
        rules.map((r) => (ruleType === 'repo' ? r.repoQualifier : r.pattern)),
    );
    console.log('[DEBUG] About to call sendConfiguration with currentConfig:', !!currentConfig);

    // Send updated configuration - backend will recalculate matching indexes and send back proper update
    // This will trigger a complete table refresh with correct highlighting
    sendConfiguration();
}

function updateOtherSetting(setting: string, value: any) {
    if (!currentConfig?.otherSettings) return;

    console.log(`[DEBUG] updateOtherSetting: ${setting} = ${value}`);
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

    // Insert at the target position
    const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    rules.splice(insertIndex, 0, draggedItem);

    // Re-render
    // if (targetType === 'repo') {
    //     renderRepoRules(currentConfig.repoRules, currentConfig.matchingIndexes?.repoRule);
    // } else {
    //     renderBranchRules(currentConfig.branchRules, currentConfig.matchingIndexes?.branchRule);
    // }

    sendConfiguration();

    // Reset drag state
    draggedIndex = -1;
    draggedType = '';

    // Remove dragging class from all rows
    document.querySelectorAll('.rule-row').forEach((row) => {
        row.classList.remove('dragging');
    });
}

function setupRepoRuleRowEvents(row: HTMLTableRowElement, index: number) {
    // Set up drag and drop events
    const dragHandle = row.querySelector('.drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });
    }
}

function setupBranchRuleRowEvents(row: HTMLTableRowElement, index: number) {
    // Set up drag and drop events
    const dragHandle = row.querySelector('.drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('dragend', () => {
            row.classList.remove('dragging');
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
    console.log('[DEBUG] Sending configuration to extension:', currentConfig);
    vscode.postMessage({
        command: 'updateConfig',
        data: currentConfig,
    });
}

function previewConfiguration() {
    if (!currentConfig) return;

    vscode.postMessage({
        command: 'previewConfig',
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

    console.log(`[DEBUG] Testing color: "${color}"`);

    // If it's already a valid hex color, return it
    if (/^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)) {
        console.log(`[DEBUG] "${color}" is hex, returning as-is`);
        return color;
    }

    // If it's an RGB color, return it as-is
    if (/^rgba?\(/.test(color)) {
        console.log(`[DEBUG] "${color}" is RGB, returning as-is`);
        return color;
    }

    // If it's a named color or other format, test it by creating a temporary element
    try {
        const tempDiv = document.createElement('div');
        tempDiv.style.backgroundColor = color; // Test as background color, not text color
        document.body.appendChild(tempDiv);
        const computedColor = getComputedStyle(tempDiv).backgroundColor;
        document.body.removeChild(tempDiv);

        console.log(`[DEBUG] "${color}" computed to: "${computedColor}"`);

        // If the browser recognized the color, return the original value
        if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') {
            console.log(`[DEBUG] "${color}" is valid, returning original`);
            return color; // Return the original named color since CSS understands it
        }

        console.log(`[DEBUG] "${color}" failed validation, using fallback`);
    } catch (e) {
        console.log(`[DEBUG] Error testing "${color}":`, e);
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

function addTestButton() {
    if (!DEVELOPMENT_MODE) return;

    const existingButton = document.querySelector('[data-action="runConfigurationTests"]');
    if (existingButton) return; // Already added

    const container = document.querySelector('.test-buttons');
    if (container && container.children.length === 0) {
        container.innerHTML = `
            <button class="test-button" data-action="runConfigurationTests">
                Run Tests (Dev Mode)
            </button>
            <button class="test-button" data-action="previewConfiguration">
                Preview Changes
            </button>
        `;
    }
}

// Initialize test button in development mode only
if (typeof window !== 'undefined' && DEVELOPMENT_MODE) {
    setTimeout(addTestButton, 1000);
}
