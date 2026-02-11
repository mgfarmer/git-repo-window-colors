import Color from 'color';
import { AdvancedProfile } from './types/advancedModeTypes';
import { extractProfileName } from './colorResolvers';

/**
 * Repository configuration structure
 */
export type RepoConfig = {
    repoQualifier: string;
    primaryColor: string;
    profileName?: string;
    enabled?: boolean;
    branchTableName?: string;
    branchRules?: Array<{ pattern: string; color: string; enabled?: boolean }>;
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
    color: string;
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
            const repoConfig: RepoConfig = {
                repoQualifier: setting.repoQualifier || '',
                primaryColor: setting.primaryColor || '',
                profileName: setting.profileName,
                enabled: setting.enabled !== undefined ? setting.enabled : true,
                branchTableName: setting.branchTableName,
                branchRules: setting.branchRules,
            };

            // Validate if needed
            if (validate && validationContext.isActive) {
                let errorMsg = '';
                if (!repoConfig.repoQualifier || !repoConfig.primaryColor) {
                    errorMsg = 'Repository rule missing required fields (repoQualifier or primaryColor)';
                    errors.set(result.length, errorMsg);
                    logger?.log(errorMsg);
                    result.push(repoConfig);
                    continue;
                }

                // Check if this is a local folder rule (starts with !)
                const isLocalFolder = repoConfig.repoQualifier.startsWith('!');
                if (isLocalFolder && repoConfig.branchTableName && repoConfig.branchTableName !== '__none__') {
                    errorMsg = `Local folder rules do not support branch tables (${repoConfig.repoQualifier})`;
                    errors.set(result.length, errorMsg);
                    logger?.log(errorMsg);
                    result.push(repoConfig);
                    continue;
                }

                // Validate colors if not profile names and not special 'none' value
                const primaryIsProfile = advancedProfiles[repoConfig.primaryColor];
                const isSpecialNone = repoConfig.primaryColor === 'none';
                if (!primaryIsProfile && !isSpecialNone) {
                    try {
                        Color(repoConfig.primaryColor);
                    } catch (error) {
                        errorMsg = `Invalid primary color: ${repoConfig.primaryColor}`;
                        errors.set(result.length, errorMsg);
                        logger?.log(errorMsg);
                        result.push(repoConfig);
                        continue;
                    }
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
): { rules: Map<string, string>; errors: Map<number, string> } {
    const branchConfigObj = configProvider.getBranchConfigurationList();
    const json = JSON.parse(JSON.stringify(branchConfigObj));
    const result = new Map<string, string>();
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
                // Validate if needed
                if (validate) {
                    const profileName = extractProfileName(setting.color, advancedProfiles);
                    const isSpecialNone = setting.color === 'none';
                    if (!profileName && !isSpecialNone) {
                        try {
                            Color(setting.color);
                        } catch (error) {
                            const msg = `Invalid color in branch rule (${setting.pattern}): ${setting.color}`;
                            errors.set(currentIndex, msg);
                            logger?.log(msg);
                            currentIndex++;
                            continue;
                        }
                    }
                }

                result.set(setting.pattern, setting.color);
            }
            currentIndex++;
        }
    }

    return { rules: result, errors };
}
