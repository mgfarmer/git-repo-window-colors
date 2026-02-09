import * as Color from 'color';
import { AdvancedProfile } from './types/advancedModeTypes';

/**
 * Extracts profile name from color string.
 * Returns the profile name if:
 * 1. It exists as a profile
 * 2. It's NOT a valid HTML color name (HTML colors take precedence)
 * Returns null otherwise
 */
export function extractProfileName(
    colorString: string,
    advancedProfiles: { [key: string]: AdvancedProfile },
): string | null {
    if (!colorString || !advancedProfiles) return null;

    // Remove any trailing whitespace or artifacts
    const cleaned = colorString.trim();

    // Check if it exists as a profile
    if (advancedProfiles[cleaned]) {
        // It exists as a profile, but check if it's also an HTML color
        try {
            Color(cleaned);
            // It's a valid color, so don't treat as profile (HTML color takes precedence)
            return null;
        } catch {
            // Not a valid color, so it's a profile
            return cleaned;
        }
    }

    return null;
}
