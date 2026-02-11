/**
 * Element Classification and Correspondence Utilities
 *
 * Pure functions for classifying theme elements and finding corresponding elements.
 * Extracted from wvConfigWebview.ts for testability.
 */

/**
 * Order for displaying palette slots in dropdowns
 */
export const PALETTE_SLOT_ORDER: string[] = [
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

/**
 * Definitive mapping of foreground/background pairs
 * Maps each foreground key to its background counterpart (and implicitly vice versa)
 */
export const FG_BG_PAIRS: { [key: string]: string } = {
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
    'tab.hoverForeground': 'tab.hoverBackground',
    'tab.hoverBackground': 'tab.hoverForeground',
    'tab.unfocusedHoverForeground': 'tab.unfocusedHoverBackground',
    'tab.unfocusedHoverBackground': 'tab.unfocusedHoverForeground',

    // Command Center
    'commandCenter.foreground': 'commandCenter.background',
    'commandCenter.background': 'commandCenter.foreground',
    'commandCenter.activeForeground': 'commandCenter.activeBackground',
    'commandCenter.activeBackground': 'commandCenter.activeForeground',

    // Breadcrumbs
    'breadcrumb.foreground': 'breadcrumb.background',
    'breadcrumb.background': 'breadcrumb.foreground',

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
export const ACTIVE_INACTIVE_PAIRS: { [key: string]: string } = {
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
 * Determine if an element key is for a background color
 */
export function isBackgroundElement(key: string): boolean {
    return key.toLowerCase().includes('background') || key.toLowerCase().endsWith('bg');
}

/**
 * Determine if an element key is for a foreground color
 */
export function isForegroundElement(key: string): boolean {
    return key.toLowerCase().includes('foreground') || key.toLowerCase().endsWith('fg');
}

/**
 * Determine if an element key is for an active state
 */
export function isActiveElement(key: string): boolean {
    // Check for 'active' in the key but not 'inactive'
    const keyLower = key.toLowerCase();
    return keyLower.includes('active') && !keyLower.includes('inactive');
}

/**
 * Determine if an element key is for an inactive state
 */
export function isInactiveElement(key: string): boolean {
    return key.toLowerCase().includes('inactive');
}

/**
 * Determine if an element key is for neither active nor inactive (neutral)
 */
export function isNeutralElement(key: string): boolean {
    const keyLower = key.toLowerCase();
    return !keyLower.includes('active') && !keyLower.includes('inactive');
}

/**
 * Find the corresponding foreground or background element key using definitive mapping
 */
export function findCorrespondingFgBg(key: string): string | null {
    return FG_BG_PAIRS[key] || null;
}

/**
 * Get the corresponding palette slot for a given slot
 * e.g., 'primaryActiveFg' <-> 'primaryActiveBg'
 */
export function getCorrespondingPaletteSlot(slotName: string): string | null {
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
export function findCorrespondingActiveInactive(key: string): string | null {
    return ACTIVE_INACTIVE_PAIRS[key] || null;
}

/**
 * Get the corresponding active/inactive palette slot
 * e.g., 'primaryActiveFg' <-> 'primaryInactiveFg'
 */
export function getCorrespondingActiveInactiveSlot(slotName: string): string | null {
    if (slotName === 'none') return null;

    if (slotName.includes('Active')) {
        return slotName.replace('Active', 'Inactive');
    } else if (slotName.includes('Inactive')) {
        return slotName.replace('Inactive', 'Active');
    }
    return null;
}

/**
 * Check if a palette slot is compatible with a mapping key for drag-and-drop
 * Returns true if the slot can logically be assigned to this key
 */
export function isSlotCompatibleWithKey(slotName: string, mappingKey: string): boolean {
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
 * Check if a palette slot is congruous with a theme key for Fg/Bg
 * Returns true if the slot type matches the key type (both Fg or both Bg)
 */
export function isSlotCongruousFgBg(key: string, slot: string): boolean {
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
export function isSlotCongruousActiveInactive(key: string, slot: string): boolean {
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
 * @param elementKey - The theme element key (e.g., 'titleBar.activeBackground')
 * @param allSlots - Array of all available palette slot names
 * @param currentSlot - Currently selected slot (will be included even if filtered out)
 * @param limitOptionsEnabled - Whether to apply filtering logic
 * @returns Filtered and sorted list of compatible slot names
 */
export function getFilteredPaletteOptions(
    elementKey: string,
    allSlots: string[],
    currentSlot?: string,
    limitOptionsEnabled: boolean = true,
): string[] {
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

        // If neither is in the order array, alphabetical sort
        return a.localeCompare(b);
    });

    return filtered;
}
