/**
 * Pause State Module
 *
 * Pure helpers for temporarily pausing window coloring.
 * A pause is represented by a "pauseUntil" value:
 *   - undefined: not paused
 *   - PAUSE_INDEFINITE: paused until manually restored
 *   - otherwise: epoch milliseconds at which the pause ends
 */

export const PAUSE_INDEFINITE = -1;

/**
 * Compute when a pause started at `now` should end.
 * A duration of 0 (or less) means the pause lasts until manually restored.
 */
export function computePauseUntil(durationMinutes: number, now: number): number {
    if (!(durationMinutes > 0)) {
        return PAUSE_INDEFINITE;
    }
    return now + durationMinutes * 60_000;
}

export function isPaused(pauseUntil: number | undefined, now: number): boolean {
    if (pauseUntil === undefined) {
        return false;
    }
    return pauseUntil === PAUSE_INDEFINITE || pauseUntil > now;
}

export function getPauseMenuLabel(durationMinutes: number): string {
    if (!(durationMinutes > 0)) {
        return 'Pause coloring until restored';
    }
    return `Pause coloring for ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;
}

export function getPauseTooltip(pauseUntil: number): string {
    const base = 'Git Repo Window Colors - Coloring paused';
    if (pauseUntil === PAUSE_INDEFINITE) {
        return `${base} until restored`;
    }
    const time = new Date(pauseUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${base} until ${time}`;
}
