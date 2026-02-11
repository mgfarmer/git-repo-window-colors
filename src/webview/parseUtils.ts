/**
 * Parse Utility Functions
 *
 * Pure functions for parsing and escaping strings.
 * Extracted from wvConfigWebview.ts for testability.
 */

/**
 * Extract repository name from Git repository URL
 * @param repositoryUrl - Git URL in various formats (SSH, HTTPS, etc.)
 * @returns Repository name as "owner/repo" format, or empty string if parsing fails
 *
 * @example
 * extractRepoNameFromUrl('https://github.com/owner/repo.git') // => 'owner/repo'
 * extractRepoNameFromUrl('git@github.com:owner/repo.git') // => 'owner/repo'
 */
export function extractRepoNameFromUrl(repositoryUrl: string): string {
    if (!repositoryUrl) return '';

    // Extract a user-friendly repo name from the git URL
    try {
        const parts = repositoryUrl.split(':');
        if (parts.length > 1) {
            const pathPart = parts[1].split('/');
            if (pathPart.length > 1) {
                const lastPart = pathPart.slice(-2).join('/');
                return lastPart.replace('.git', '');
            }
        }

        // Fallback: extract from https URLs
        if (
            repositoryUrl.includes('github.com') ||
            repositoryUrl.includes('gitlab.com') ||
            repositoryUrl.includes('bitbucket.org')
        ) {
            const match = repositoryUrl.match(/[\/:]([^\/]+\/[^\/]+?)(?:\.git)?$/);
            if (match) {
                return match[1];
            }
        }

        // Final fallback
        return repositoryUrl.split('/').pop()?.replace('.git', '') || '';
    } catch (e) {
        console.warn('Error parsing repository URL:', e);
        return '';
    }
}

/**
 * Escape HTML special characters in text
 * @param text - Text to escape
 * @returns HTML-safe escaped text
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>') // => '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(text: string): string {
    const escapeMap: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}
