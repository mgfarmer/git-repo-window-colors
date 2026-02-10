/**
 * Palette Logic Utilities
 *
 * Pure functions for analyzing and manipulating palette configurations.
 * Extracted from wvConfigWebview.ts for testability.
 */

import { AdvancedProfile, MappingValue } from '../types/advancedModeTypes';

/**
 * Count how many mappings in a section have non-'none' values
 * @param profile - Advanced profile with palette and mappings
 * @param sectionKeys - Array of mapping keys to check
 * @returns Count of active (non-'none') mappings in the section
 */
export function countActiveMappings(profile: AdvancedProfile, sectionKeys: string[]): number {
    let count = 0;
    sectionKeys.forEach((key: string) => {
        const mappingValue = profile.mappings[key];
        let slot: string;

        if (typeof mappingValue === 'string') {
            slot = mappingValue || 'none';
        } else if (mappingValue) {
            slot = (mappingValue as MappingValue).slot || 'none';
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
 * @param profile - Advanced profile with palette and mappings
 * @returns Total count of active (non-'none') mappings
 */
export function countTotalActiveMappings(profile: AdvancedProfile): number {
    let total = 0;
    Object.keys(profile.mappings || {}).forEach((key: string) => {
        const mappingValue = profile.mappings[key];
        let slot: string;

        if (typeof mappingValue === 'string') {
            slot = mappingValue || 'none';
        } else if (mappingValue) {
            slot = (mappingValue as MappingValue).slot || 'none';
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
 * Resolve color value from a palette slot definition
 * @param slot - Slot definition (string, object with source/value, etc.)
 * @param rule - Rule object with primaryColor and branchColor
 * @returns Resolved color string, or null if cannot be resolved
 *
 * Handles multiple slot formats:
 * - Direct color string: "#ff0000"
 * - Fixed source: { source: 'fixed', value: '#ff0000' }
 * - Repo color: { source: 'repoColor' } - resolves to rule.primaryColor
 * - Branch color: { source: 'branchColor' } - resolves to rule.branchColor
 * - Direct color property: { color: '#ff0000' }
 * - Value property: { value: '#ff0000' }
 */
export function resolveColorFromSlot(slot: any, rule: any): string | null {
    if (slot === null || slot === undefined) return null;

    // If slot is a direct color string
    if (typeof slot === 'string') {
        return slot;
    }

    // If slot is an object
    if (typeof slot === 'object') {
        // Check for fixed source with value
        if (slot.source === 'fixed' && slot.value) {
            return slot.value;
        }

        // Check for direct color property
        if (slot.color) {
            return slot.color;
        }

        // Check for source-based definitions
        if (slot.source === 'repoColor' && rule.primaryColor) {
            return rule.primaryColor;
        }
        if (slot.source === 'branchColor' && rule.branchColor) {
            return rule.branchColor;
        }

        // If has value property (alternative format)
        if (slot.value) {
            return slot.value;
        }

        // If no source but has modifiers, might need base color
        // For now, we can't resolve these without the full palette generator
    }

    return null;
}
