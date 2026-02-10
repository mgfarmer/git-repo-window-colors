import Color from 'color';
import { AdvancedProfile } from './types/advancedModeTypes';

/**
 * Settings needed for profile factory functions
 */
export interface ProfileFactorySettings {
    colorInactiveTitlebar: boolean;
    colorEditorTabs: boolean;
    colorStatusBar: boolean;
    activityBarColorKnob: number; // Raw value (0-100 for repo, 0-50 for branch)
    isDarkTheme: boolean;
}

/**
 * Simple logger interface for profile factory
 */
export interface ProfileFactoryLogger {
    log(message: string): void;
}

/**
 * Creates a temporary AdvancedProfile for repo colors (title bar, tabs, status bar).
 * This handles simple mode repo rules by converting them to profiles.
 *
 * @param repoColor The base color for the repository
 * @param settings Configuration settings for profile generation
 * @param logger Optional logger for debug output
 * @returns An AdvancedProfile configured for the repo color
 */
export function createRepoProfile(
    repoColor: Color,
    settings: ProfileFactorySettings,
    logger?: ProfileFactoryLogger,
): AdvancedProfile {
    try {
        const { colorInactiveTitlebar, colorEditorTabs, colorStatusBar, isDarkTheme } = settings;

        // Normalize color knob (raw value 0-100 -> 0-5)
        let activityBarColorKnob = settings.activityBarColorKnob;
        if (activityBarColorKnob === undefined) {
            activityBarColorKnob = 0;
        }
        logger?.log(`    [Repo Temp Profile] Raw color knob value: ${activityBarColorKnob}`);
        activityBarColorKnob = activityBarColorKnob / 20;
        logger?.log(`    [Repo Temp Profile] Normalized color knob: ${activityBarColorKnob}`);

        // Calculate modifiers based on theme
        const titleInactiveBgModifier = isDarkTheme ? 0.5 : 0.15;
        const tabBrightnessModifier = isDarkTheme ? 0.5 : 0.4;

        // Activity bar modifier: negative values darken, positive values lighten
        const activityBarModifier = activityBarColorKnob;
        const absModifier = Math.abs(activityBarModifier);
        const shouldDarken = activityBarModifier < 0;
        const shouldLighten = activityBarModifier > 0;

        logger?.log(
            `    [Repo Temp Profile] Color knob application: shouldDarken=${shouldDarken}, shouldLighten=${shouldLighten}, absModifier=${absModifier}`,
        );

        // Build palette - title bar colors (always)
        const palette: any = {
            titleBarActiveBg: { source: 'repoColor' as const },
            titleBarActiveFg: {
                source: 'repoColor' as const,
                highContrast: true,
            },
            titleBarInactiveBg: {
                source: 'repoColor' as const,
                [isDarkTheme ? 'darken' : 'lighten']: titleInactiveBgModifier,
            },
            titleBarInactiveFg: {
                source: 'repoColor' as const,
                highContrast: true,
            },
        };

        // Add tab colors if enabled
        if (colorEditorTabs) {
            // Base modifier applies the knob value
            // Tab active is additionally brightened
            const tabInactiveDef: any = { source: 'repoColor' as const };
            const tabActiveDef: any = { source: 'repoColor' as const };

            if (activityBarColorKnob === 0) {
                // Zero knob - no adjustment, use raw color
                logger?.log(`    [Repo Temp Profile] Tabs: zero knob, no color adjustment (using raw repo color)`);
            } else if (shouldDarken) {
                tabInactiveDef.darken = absModifier;
                tabActiveDef.darken = Math.max(0, absModifier - tabBrightnessModifier);
                logger?.log(
                    `    [Repo Temp Profile] Tabs: darkening by ${absModifier} (inactive) and ${Math.max(0, absModifier - tabBrightnessModifier)} (active)`,
                );
            } else if (shouldLighten) {
                tabInactiveDef.lighten = absModifier;
                tabActiveDef.lighten = absModifier + tabBrightnessModifier;
                logger?.log(
                    `    [Repo Temp Profile] Tabs: lightening by ${absModifier} (inactive) and ${absModifier + tabBrightnessModifier} (active)`,
                );
            }

            palette.tabInactiveBg = tabInactiveDef;
            palette.tabActiveBg = tabActiveDef;
        }

        // Add status bar color (for when tabs are disabled but status bar is enabled)
        if (colorStatusBar && !colorEditorTabs) {
            const statusBarDef: any = { source: 'repoColor' as const };

            if (activityBarColorKnob === 0) {
                // Zero knob - no adjustment, use raw color
                logger?.log(
                    `    [Repo Temp Profile] Status bar: zero knob, no color adjustment (using raw repo color)`,
                );
            } else if (shouldDarken) {
                statusBarDef.darken = absModifier;
                logger?.log(`    [Repo Temp Profile] Status bar: darkening by ${absModifier}`);
            } else if (shouldLighten) {
                statusBarDef.lighten = absModifier;
                logger?.log(`    [Repo Temp Profile] Status bar: lightening by ${absModifier}`);
            }

            palette.statusBarBg = statusBarDef;
        }

        // Build mappings - title bar (always)
        const mappings: any = {
            'titleBar.activeBackground': 'titleBarActiveBg',
            'titleBar.activeForeground': 'titleBarActiveFg',
        };

        if (colorInactiveTitlebar) {
            mappings['titleBar.inactiveBackground'] = 'titleBarInactiveBg';
            mappings['titleBar.inactiveForeground'] = 'titleBarInactiveFg';
        }

        // Add tab mappings if enabled
        if (colorEditorTabs) {
            mappings['tab.inactiveBackground'] = 'tabInactiveBg';
            mappings['tab.activeBackground'] = 'tabActiveBg';
            mappings['tab.hoverBackground'] = 'tabActiveBg';
            mappings['tab.unfocusedHoverBackground'] = 'tabActiveBg';
            mappings['editorGroupHeader.tabsBackground'] = 'tabInactiveBg';
            mappings['titleBar.border'] = 'tabInactiveBg';
            mappings['sideBarTitle.background'] = 'tabInactiveBg';
        }

        // Add status bar mapping if enabled
        if (colorStatusBar) {
            mappings['statusBar.background'] = colorEditorTabs ? 'tabInactiveBg' : 'statusBarBg';
        }

        const profile: AdvancedProfile = {
            palette,
            mappings,
            virtual: true, // Mark as virtual - created for simple color rules
        };

        // Debug output
        logger?.log(
            `    [Repo Temp Profile] Created with ${Object.keys(palette).length} palette slots and ${Object.keys(mappings).length} mappings`,
        );
        logger?.log(`    [Repo Temp Profile] Mappings: ${Object.keys(mappings).join(', ')}`);

        return profile;
    } catch (error) {
        logger?.log(`ERROR creating repo temp profile: ${error}`);
        // Return minimal working profile
        return {
            palette: {
                primaryActiveBg: { source: 'repoColor' },
                primaryActiveFg: { source: 'repoColor', highContrast: true },
                primaryInactiveBg: { source: 'repoColor' },
                primaryInactiveFg: { source: 'repoColor', highContrast: true },
                secondaryActiveBg: { source: 'repoColor' },
                secondaryActiveFg: { source: 'repoColor', highContrast: true },
                secondaryInactiveBg: { source: 'repoColor' },
                secondaryInactiveFg: { source: 'repoColor', highContrast: true },
                tertiaryBg: { source: 'repoColor' },
                tertiaryFg: { source: 'repoColor', highContrast: true },
                quaternaryBg: { source: 'repoColor' },
                quaternaryFg: { source: 'repoColor', highContrast: true },
            },
            mappings: {
                'titleBar.activeBackground': 'primaryActiveBg',
                'titleBar.activeForeground': 'primaryActiveFg',
            },
            virtual: true, // Mark fallback profile as virtual
        };
    }
}

/**
 * Creates a temporary AdvancedProfile for branch colors (activity bar only).
 * This handles simple mode branch rules by converting them to profiles.
 *
 * @param branchColor The base color for the branch
 * @param settings Configuration settings for profile generation
 * @param logger Optional logger for debug output
 * @returns An AdvancedProfile configured for the branch color
 */
export function createBranchProfile(
    branchColor: Color,
    settings: ProfileFactorySettings,
    logger?: ProfileFactoryLogger,
): AdvancedProfile {
    try {
        // Normalize color knob (raw value 0-50 -> 0-1)
        let activityBarColorKnob = settings.activityBarColorKnob;
        if (activityBarColorKnob === undefined) {
            activityBarColorKnob = 0;
        }
        activityBarColorKnob = activityBarColorKnob / 50;

        // Build palette - activity bar only (use branch color directly, no knob adjustment)
        const palette: any = {
            activityBarBg: {
                source: 'branchColor' as const,
            },
            activityBarFg: {
                source: 'branchColor' as const,
                highContrast: true,
            },
        };

        // Build mappings - activity bar only
        const mappings: any = {
            'activityBar.background': 'activityBarBg',
            'activityBar.foreground': 'activityBarFg',
        };

        const profile: AdvancedProfile = {
            palette,
            mappings,
            virtual: true, // Mark as virtual - created for simple color rules
        };

        // Debug output
        logger?.log(
            `    [Branch Temp Profile] Created with ${Object.keys(palette).length} palette slots and ${Object.keys(mappings).length} mappings`,
        );
        logger?.log(`    [Branch Temp Profile] Mappings: ${Object.keys(mappings).join(', ')}`);
        logger?.log(`    [Branch Temp Profile] Branch color: ${branchColor.hex()}`);

        return profile;
    } catch (error) {
        logger?.log(`ERROR creating branch temp profile: ${error}`);
        // Return minimal working profile
        return {
            palette: {
                primaryActiveBg: { source: 'branchColor' },
                primaryActiveFg: { source: 'branchColor', highContrast: true },
                primaryInactiveBg: { source: 'branchColor' },
                primaryInactiveFg: { source: 'branchColor', highContrast: true },
                secondaryActiveBg: { source: 'branchColor' },
                secondaryActiveFg: { source: 'branchColor', highContrast: true },
                secondaryInactiveBg: { source: 'branchColor' },
                secondaryInactiveFg: { source: 'branchColor', highContrast: true },
                tertiaryBg: { source: 'branchColor' },
                tertiaryFg: { source: 'branchColor', highContrast: true },
                quaternaryBg: { source: 'branchColor' },
                quaternaryFg: { source: 'branchColor', highContrast: true },
            },
            mappings: {
                'activityBar.background': 'primaryActiveBg',
                'activityBar.foreground': 'primaryActiveFg',
            },
            virtual: true, // Mark fallback profile as virtual
        };
    }
}
