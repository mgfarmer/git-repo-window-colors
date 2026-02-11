/**
 * Extracts a user-friendly repo name from a git URL.
 *
 * Examples:
 * - "git@github.com:owner/repo.git" => "owner/repo"
 * - "https://github.com/owner/repo.git" => "owner/repo"
 * - "https://gitlab.com/group/project" => "group/project"
 *
 * @param url The git repository URL
 * @returns A user-friendly repository name
 */
export function extractRepoNameFromUrl(url: string): string {
    // Extract a user-friendly repo name from the git URL
    try {
        const parts = url.split(':');
        if (parts.length > 1) {
            const pathPart = parts[1].split('/');
            if (pathPart.length > 1) {
                const lastPart = pathPart.slice(-2).join('/');
                return lastPart.replace('.git', '');
            }
        }

        // Fallback: extract from https URLs
        if (url.includes('github.com') || url.includes('gitlab.com') || url.includes('bitbucket.org')) {
            const match = url.match(/[\/:]([^\/]+\/[^\/]+?)(?:\.git)?$/);
            if (match) {
                return match[1];
            }
        }

        // Final fallback
        return url.split('/').pop()?.replace('.git', '') || 'repository';
    } catch (error) {
        return 'repository';
    }
}
