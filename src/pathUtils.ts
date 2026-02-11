import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Normalize a file path for cross-platform comparison
 */
export function normalizePath(filePath: string): string {
    return path.normalize(filePath).toLowerCase().replace(/\\/g, '/');
}

/**
 * Expand environment variables in a path pattern
 * Supports:
 * - Tilde expansion: ~, ~/, ~\
 * - Unix style: $HOME, $USERPROFILE, $APPDATA, $LOCALAPPDATA, $USER
 * - Windows style: %HOME%, %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, %USER%
 */
export function expandEnvVars(pattern: string): string {
    // List of supported environment variables
    const envVars = [
        { name: 'HOME', value: os.homedir() },
        { name: 'USERPROFILE', value: os.homedir() },
        { name: 'APPDATA', value: process.env.APPDATA || '' },
        { name: 'LOCALAPPDATA', value: process.env.LOCALAPPDATA || '' },
        { name: 'USER', value: process.env.USER || process.env.USERNAME || '' },
    ];

    let expanded = pattern;

    // Replace ~/ or ~\ or ~ at start (handle both Unix and Windows path separators)
    if (expanded.startsWith('~/') || expanded.startsWith('~\\') || expanded === '~') {
        // Use path.join to properly normalize the path separator after tilde
        const remainder = expanded.substring(2); // Everything after ~/ or ~\
        if (expanded === '~') {
            expanded = os.homedir();
        } else {
            expanded = path.join(os.homedir(), remainder);
        }
    }

    // Replace $VAR or %VAR% style variables
    for (const envVar of envVars) {
        if (!envVar.value) continue;

        // Unix style: $VAR
        expanded = expanded.replace(new RegExp(`\\$${envVar.name}`, 'gi'), envVar.value);

        // Windows style: %VAR%
        expanded = expanded.replace(new RegExp(`%${envVar.name}%`, 'gi'), envVar.value);
    }

    return expanded;
}

/**
 * Simplify a path by replacing common prefixes with environment variables
 * Replaces home directory with ~, and on Windows also replaces %LOCALAPPDATA% and %APPDATA%
 */
export function simplifyPath(filePath: string): string {
    const homeDir = os.homedir();
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';

    // Normalize for comparison (case-insensitive on Windows)
    const normalizedPath = path.normalize(filePath);
    const normalizedHome = path.normalize(homeDir);

    // For comparison on Windows, use lowercase
    const isWindows = process.platform === 'win32';
    const comparePath = isWindows ? normalizedPath.toLowerCase() : normalizedPath;
    const compareHome = isWindows ? normalizedHome.toLowerCase() : normalizedHome;
    const compareLocalAppData =
        isWindows && localAppData ? path.normalize(localAppData).toLowerCase() : path.normalize(localAppData);
    const compareAppData = isWindows && appData ? path.normalize(appData).toLowerCase() : path.normalize(appData);

    // Try to replace with environment variables (longest match first)
    if (localAppData && comparePath.startsWith(compareLocalAppData)) {
        const relativePath = normalizedPath.substring(path.normalize(localAppData).length);
        return '%LOCALAPPDATA%' + relativePath;
    }

    if (appData && comparePath.startsWith(compareAppData)) {
        const relativePath = normalizedPath.substring(path.normalize(appData).length);
        return '%APPDATA%' + relativePath;
    }

    if (comparePath.startsWith(compareHome)) {
        // Use ~ for home directory (works cross-platform and is shorter)
        const relativePath = normalizedPath.substring(normalizedHome.length);
        return '~' + relativePath;
    }

    return filePath;
}

/**
 * Check if a local folder path matches a pattern (with ! prefix)
 */
export function matchesLocalFolderPattern(folderPath: string, pattern: string): boolean {
    // Pattern must start with !
    if (!pattern.startsWith('!')) {
        return false;
    }

    // Remove ! prefix and expand environment variables
    const cleanPattern = pattern.substring(1);
    const expandedPattern = expandEnvVars(cleanPattern);

    // Normalize both paths for comparison
    const normalizedFolder = normalizePath(folderPath);
    const normalizedPattern = normalizePath(expandedPattern);

    // Use minimatch for glob pattern matching
    return minimatch(normalizedFolder, normalizedPattern, { nocase: true });
}

/**
 * Check if a pattern contains glob characters
 */
export function isGlobPattern(pattern: string): boolean {
    // Check for common glob pattern characters
    return /[*?[\]{}]/.test(pattern);
}

/**
 * Validate if a local folder pattern resolves to an existing path
 * @param pattern The pattern to validate (with or without ! prefix)
 * @returns true if the path exists, false otherwise, or undefined if it's a glob pattern (not validatable)
 */
export function validateLocalFolderPath(pattern: string): boolean | undefined {
    // Remove ! prefix if present
    const cleanPattern = pattern.startsWith('!') ? pattern.substring(1) : pattern;

    // If it's a glob pattern, we can't validate it (return undefined to indicate "not applicable")
    if (isGlobPattern(cleanPattern)) {
        return undefined;
    }

    // Expand environment variables
    const expandedPath = expandEnvVars(cleanPattern);

    // Normalize the path
    const normalizedPath = path.normalize(expandedPath);

    try {
        return fs.existsSync(normalizedPath);
    } catch (error) {
        return false;
    }
}
