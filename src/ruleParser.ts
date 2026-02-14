import Color from 'color';
import { AdvancedProfile, ThemedColor } from './types/advancedModeTypes';
import { isThemedColor } from './colorDerivation';
import { extractProfileName } from './colorResolvers';

const THEME_KINDS: Array<keyof ThemedColor> = ['dark', 'light', 'highContrast'];

type PrimaryColorValue = string | ThemedColor;

function normalizeColorInput(value: any): PrimaryColorValue | undefined {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (isThemedColor(value)) {
        return value;
    }

    return undefined;
}

function formatColorForError(value: any): string {
    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function validateThemedColor(themedColor: ThemedColor): string | undefined {
    let hasValue = false;

    for (const theme of THEME_KINDS) {
        const candidate = themedColor[theme]?.value;

        if (typeof candidate === 'string' && candidate.trim() !== '') {
            hasValue = true;

            try {
                Color(candidate);
            } catch (error) {
                return `${theme} value "${candidate}" is not a valid color`;
            }
        }
    }

    if (!hasValue) {
        return 'no color values were provided for any theme';
    }

    return undefined;
}

/**
 * Repository configuration structure
 */
export type RepoConfig = {
    repoQualifier: string;
    primaryColor: PrimaryColorValue;
    profileName?: string;
    enabled?: boolean;
    branchTableName?: string;
    branchRules?: Array<{ pattern: string; color: PrimaryColorValue; enabled?: boolean }>;
    // Transient properties set during matching and profile resolution
    branchProfileName?: string;
    profile?: AdvancedProfile;
    branchProfile?: AdvancedProfile;
    isSimpleMode?: boolean;
};

/**
 * Branch rule structure
 */
export type BranchRule = {
    pattern: string;
    color: PrimaryColorValue;
    enabled?: boolean;
};

/**
 * Configuration provider interface for accessing VS Code settings
 */
export interface ConfigProvider {
    getRepoConfigurationList(): any;
    getBranchConfigurationList(): any;
    getAdvancedProfiles(): { [key: string]: AdvancedProfile };
}

/**
 * Logger interface for rule parsing
 */
export interface RuleParserLogger {
    log(message: string): void;
}

/**
 * Validation context for rule parsing
 */
export interface ValidationContext {
    isActive: boolean;
}

/**
 * Parse repository rules from configuration.
 *
 * @param configProvider Interface to access configuration
 * @param validate Whether to validate colors and patterns
 * @param validationContext Context information for validation
 * @param logger Optional logger for debug output
 * @returns Array of parsed repo rules and any validation errors
 */
export function parseRepoRules(
    configProvider: ConfigProvider,
    validate: boolean = false,
    validationContext: ValidationContext,
    logger?: RuleParserLogger,
): { rules: Array<RepoConfig>; errors: Map<number, string> } {
    const repoConfigObj = configProvider.getRepoConfigurationList();
    const errors = new Map<number, string>();

    if (repoConfigObj === undefined || Object.keys(repoConfigObj).length === 0) {
        logger?.log('No settings found. Weird!  You should add some...');
        return { rules: [], errors };
    }

    const json = JSON.parse(JSON.stringify(repoConfigObj));
    const result = new Array<RepoConfig>();
    const advancedProfiles = configProvider.getAdvancedProfiles();

    for (const item in json) {
        const setting = json[item];

        // Handle JSON object format
        if (typeof setting === 'object' && setting !== null) {
            const rawPrimaryColor = setting.primaryColor;
            const normalizedPrimaryColor = normalizeColorInput(rawPrimaryColor);

            const repoConfig: RepoConfig = {
                repoQualifier: setting.repoQualifier || '',
                primaryColor: normalizedPrimaryColor ?? '',
                profileName: setting.profileName,
                enabled: setting.enabled !== undefined ? setting.enabled : true,
                branchTableName: setting.branchTableName,
                branchRules: setting.branchRules,
            };

            // Validate if needed
            if (validate && validationContext.isActive) {
                let errorMsg = '';

                const hasPrimaryColorInput = rawPrimaryColor !== undefined && rawPrimaryColor !== null;

                if (!repoConfig.repoQualifier) {
                    errorMsg = 'Repository rule missing required fields (repoQualifier or primaryColor)';
                } else if (normalizedPrimaryColor === undefined) {
                    errorMsg = hasPrimaryColorInput
                        ? `Invalid primary color: ${formatColorForError(rawPrimaryColor)}`
                        : 'Repository rule missing required fields (repoQualifier or primaryColor)';
                } else if (typeof normalizedPrimaryColor === 'string' && normalizedPrimaryColor === '') {
                    errorMsg = 'Repository rule missing required fields (repoQualifier or primaryColor)';
                }

                if (!errorMsg) {
                    const isLocalFolder = repoConfig.repoQualifier.startsWith('!');
                    if (isLocalFolder && repoConfig.branchTableName && repoConfig.branchTableName !== '__none__') {
                        errorMsg = `Local folder rules do not support branch tables (${repoConfig.repoQualifier})`;
                    }
                }

                if (!errorMsg && normalizedPrimaryColor !== undefined) {
                    const isSpecialNone =
                        typeof normalizedPrimaryColor === 'string' && normalizedPrimaryColor === 'none';
                    const primaryIsProfile =
                        typeof normalizedPrimaryColor === 'string'
                            ? advancedProfiles[normalizedPrimaryColor]
                            : undefined;

                    if (!primaryIsProfile && !isSpecialNone) {
                        if (typeof normalizedPrimaryColor === 'string') {
                            try {
                                Color(normalizedPrimaryColor);
                            } catch (error) {
                                errorMsg = `Invalid primary color: ${normalizedPrimaryColor}`;
                            }
                        } else {
                            const themedError = validateThemedColor(normalizedPrimaryColor);
                            if (themedError) {
                                errorMsg = `Invalid primary color: ${themedError}`;
                            }
                        }
                    }
                }

                if (errorMsg) {
                    errors.set(result.length, errorMsg);
                    logger?.log(errorMsg);
                    result.push(repoConfig);
                    continue;
                }
            }

            result.push(repoConfig);
        }
    }

    return { rules: result, errors };
}

/**
 * Parse branch rules from configuration.
 *
 * @param configProvider Interface to access configuration
 * @param validate Whether to validate colors
 * @param logger Optional logger for debug output
 * @returns Map of branch patterns to colors and any validation errors
 */
export function parseBranchRules(
    configProvider: ConfigProvider,
    validate: boolean = false,
    logger?: RuleParserLogger,
): { rules: Map<string, PrimaryColorValue>; errors: Map<number, string> } {
    const branchConfigObj = configProvider.getBranchConfigurationList();
    const json = JSON.parse(JSON.stringify(branchConfigObj));
    const result = new Map<string, PrimaryColorValue>();
    const errors = new Map<number, string>();

    let currentIndex = 0;
    const advancedProfiles = configProvider.getAdvancedProfiles();

    for (const item in json) {
        const setting = json[item];

        // Handle JSON object format
        if (typeof setting === 'object' && setting !== null) {
            // Skip disabled rules
            if (setting.enabled === false) {
                currentIndex++;
                continue;
            }

            // Validate and add enabled rules to the map
            if (setting.pattern && setting.color) {
                const rawColor = setting.color;
                const normalizedColor = normalizeColorInput(rawColor);
                // Validate if needed
                if (validate) {
                    let errorMsg = '';

                    if (normalizedColor === undefined) {
                        errorMsg = `Invalid color in branch rule (${setting.pattern}): ${formatColorForError(rawColor)}`;
                    } else if (typeof normalizedColor === 'string' && normalizedColor === '') {
                        errorMsg = `Invalid color in branch rule (${setting.pattern}): value is empty`;
                    } else {
                        const profileName =
                            typeof normalizedColor === 'string'
                                ? extractProfileName(normalizedColor, advancedProfiles)
                                : null;
                        const isSpecialNone = typeof normalizedColor === 'string' && normalizedColor === 'none';

                        if (!profileName && !isSpecialNone) {
                            if (typeof normalizedColor === 'string') {
                                try {
                                    Color(normalizedColor);
                                } catch (error) {
                                    errorMsg = `Invalid color in branch rule (${setting.pattern}): ${normalizedColor}`;
                                }
                            } else {
                                const themedError = validateThemedColor(normalizedColor);
                                if (themedError) {
                                    errorMsg = `Invalid color in branch rule (${setting.pattern}): ${themedError}`;
                                }
                            }
                        }
                    }

                    if (errorMsg) {
                        errors.set(currentIndex, errorMsg);
                        logger?.log(errorMsg);
                        currentIndex++;
                        continue;
                    }
                }

                if (normalizedColor !== undefined && !(typeof normalizedColor === 'string' && normalizedColor === '')) {
                    result.set(setting.pattern, normalizedColor);
                }
            }
            currentIndex++;
        }
    }

    return { rules: result, errors };
}
