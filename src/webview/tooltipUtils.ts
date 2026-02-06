/// <reference lib="dom" />

// Tooltip utility for webview - uses position:fixed to avoid clipping by overflow:hidden containers

let currentTooltip: HTMLDivElement | null = null;
let showTimeoutId: number | null = null;
let hideTimeoutId: number | null = null;

const TOOLTIP_DELAY_MS = 400; // Delay before showing tooltip
const TOOLTIP_HIDE_DELAY_MS = 100; // Small delay before hiding to allow moving to adjacent elements

export interface TooltipOptions {
    /** The tooltip text content (plain text) */
    text?: string;
    /** The tooltip HTML content (rich formatting) - takes precedence over text */
    html?: string;
    /** Optional: preferred position relative to target element */
    position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    /** Optional: max width in pixels (default: 300) */
    maxWidth?: number;
    /** Optional: delay before showing in ms (default: 400) */
    delay?: number;
}

/**
 * Shows a tooltip near the specified target element.
 * Uses position:fixed to ensure tooltip is not clipped by overflow:hidden containers.
 */
export function showTooltip(target: HTMLElement, options: TooltipOptions | string): void {
    // Normalize options
    const opts: TooltipOptions = typeof options === 'string' ? { text: options } : options;

    const content = opts.html || opts.text || '';
    if (!content || content.trim() === '') {
        return;
    }

    // Clear any pending hide
    if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
    }

    // Clear any pending show
    if (showTimeoutId !== null) {
        clearTimeout(showTimeoutId);
        showTimeoutId = null;
    }

    const delay = opts.delay ?? TOOLTIP_DELAY_MS;

    showTimeoutId = window.setTimeout(() => {
        showTimeoutId = null;
        _createAndPositionTooltip(target, opts);
    }, delay);
}

/**
 * Hides the current tooltip.
 */
export function hideTooltip(): void {
    // Clear any pending show
    if (showTimeoutId !== null) {
        clearTimeout(showTimeoutId);
        showTimeoutId = null;
    }

    // Clear any pending hide and set a new one
    if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
    }

    hideTimeoutId = window.setTimeout(() => {
        hideTimeoutId = null;
        _removeTooltip();
    }, TOOLTIP_HIDE_DELAY_MS);
}

/**
 * Immediately hides the tooltip without delay.
 */
export function hideTooltipImmediate(): void {
    if (showTimeoutId !== null) {
        clearTimeout(showTimeoutId);
        showTimeoutId = null;
    }
    if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
    }
    _removeTooltip();
}

function _removeTooltip(): void {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

function _createAndPositionTooltip(target: HTMLElement, opts: TooltipOptions): void {
    // Remove any existing tooltip
    _removeTooltip();

    const maxWidth = opts.maxWidth ?? 300;
    const position = opts.position ?? 'auto';

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'grwc-tooltip';
    // Use innerHTML if html option is provided, otherwise textContent for plain text
    if (opts.html) {
        tooltip.innerHTML = opts.html;
    } else {
        tooltip.textContent = opts.text || '';
    }
    tooltip.style.position = 'fixed';
    tooltip.style.zIndex = '10001'; // Above dialogs
    tooltip.style.maxWidth = `${maxWidth}px`;
    tooltip.style.padding = '6px 10px';
    // Use completely opaque solid colors for readability
    tooltip.style.background = '#1e1e1e'; // Solid dark background
    tooltip.style.backgroundColor = '#1e1e1e';
    tooltip.style.color = '#e0e0e0';
    tooltip.style.border = '1px solid #555555';
    tooltip.style.borderRadius = '3px';
    tooltip.style.fontSize = '12px';
    tooltip.style.lineHeight = '1.4';
    tooltip.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.8)';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.whiteSpace = 'pre-wrap';
    tooltip.style.wordWrap = 'break-word';
    tooltip.style.opacity = '0';
    tooltip.style.transition = 'opacity 0.15s ease-in-out';

    // Add to body to measure
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;

    // Get dimensions
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8; // Minimum distance from viewport edges

    // Calculate best position (resolve 'auto' to a concrete position)
    let finalPosition: 'top' | 'bottom' | 'left' | 'right';
    if (position === 'auto') {
        finalPosition = _calculateBestPosition(targetRect, tooltipRect, viewportWidth, viewportHeight, padding);
    } else {
        finalPosition = position;
    }

    // Position the tooltip
    const pos = _calculatePosition(targetRect, tooltipRect, viewportWidth, viewportHeight, padding, finalPosition);
    tooltip.style.left = `${pos.left}px`;
    tooltip.style.top = `${pos.top}px`;

    // Fade in
    requestAnimationFrame(() => {
        if (currentTooltip === tooltip) {
            tooltip.style.opacity = '1';
        }
    });
}

function _calculateBestPosition(
    targetRect: DOMRect,
    tooltipRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
): 'top' | 'bottom' | 'left' | 'right' {
    const spaceAbove = targetRect.top;
    const spaceBelow = viewportHeight - targetRect.bottom;
    const spaceLeft = targetRect.left;
    const spaceRight = viewportWidth - targetRect.right;

    // Prefer bottom, then top, then right, then left
    if (spaceBelow >= tooltipRect.height + padding) {
        return 'bottom';
    }
    if (spaceAbove >= tooltipRect.height + padding) {
        return 'top';
    }
    if (spaceRight >= tooltipRect.width + padding) {
        return 'right';
    }
    if (spaceLeft >= tooltipRect.width + padding) {
        return 'left';
    }

    // Default to bottom if nothing fits perfectly
    return 'bottom';
}

function _calculatePosition(
    targetRect: DOMRect,
    tooltipRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
    position: 'top' | 'bottom' | 'left' | 'right',
): { left: number; top: number } {
    let left: number;
    let top: number;
    const gap = 6; // Gap between target and tooltip

    switch (position) {
        case 'top':
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
            top = targetRect.top - tooltipRect.height - gap;
            break;
        case 'bottom':
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
            top = targetRect.bottom + gap;
            break;
        case 'left':
            left = targetRect.left - tooltipRect.width - gap;
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
            break;
        case 'right':
            left = targetRect.right + gap;
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
            break;
    }

    // Clamp to viewport
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));

    return { left, top };
}

/**
 * Attaches tooltip behavior to an element.
 * This removes any existing title attribute and adds mouse event listeners.
 * @param element The element to attach tooltip to
 * @param options Tooltip text or options
 * @returns A cleanup function to remove the tooltip behavior
 */
export function attachTooltip(element: HTMLElement, options: TooltipOptions | string): () => void {
    // Remove native title to prevent double tooltip
    const originalTitle = element.getAttribute('title');
    if (originalTitle) {
        element.removeAttribute('title');
    }

    const handleMouseEnter = () => showTooltip(element, options);
    const handleMouseLeave = () => hideTooltip();
    const handleFocus = () => showTooltip(element, options);
    const handleBlur = () => hideTooltip();

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    // Return cleanup function
    return () => {
        element.removeEventListener('mouseenter', handleMouseEnter);
        element.removeEventListener('mouseleave', handleMouseLeave);
        element.removeEventListener('focus', handleFocus);
        element.removeEventListener('blur', handleBlur);
        hideTooltipImmediate();

        // Restore original title if it existed
        if (originalTitle) {
            element.setAttribute('title', originalTitle);
        }
    };
}

/**
 * Sets up delegated tooltip handling for a container.
 * Elements with data-tooltip attribute will show tooltips.
 * @param container The container element to attach delegated handlers to
 * @returns A cleanup function
 */
export function setupDelegatedTooltips(container: HTMLElement): () => void {
    let activeElement: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
        // Check for data-tooltip-html first (HTML content), then data-tooltip (plain text)
        let target = (e.target as HTMLElement).closest('[data-tooltip-html]') as HTMLElement | null;
        let isHtml = true;
        if (!target) {
            target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
            isHtml = false;
        }

        if (target && target !== activeElement) {
            activeElement = target;
            const content = isHtml
                ? target.getAttribute('data-tooltip-html') || ''
                : target.getAttribute('data-tooltip') || '';
            const position = (target.getAttribute('data-tooltip-position') as TooltipOptions['position']) || 'auto';
            const maxWidthAttr = target.getAttribute('data-tooltip-max-width');
            const maxWidth = maxWidthAttr ? parseInt(maxWidthAttr, 10) : undefined;

            if (isHtml) {
                showTooltip(target, { html: content, position, maxWidth });
            } else {
                showTooltip(target, { text: content, position, maxWidth });
            }
        }
    };

    const handleMouseOut = (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('[data-tooltip-html], [data-tooltip]') as HTMLElement | null;
        if (target === activeElement) {
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            const newTooltipTarget = relatedTarget?.closest('[data-tooltip]') as HTMLElement | null;

            if (newTooltipTarget !== activeElement) {
                activeElement = null;
                hideTooltip();
            }
        }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
        container.removeEventListener('mouseover', handleMouseOver);
        container.removeEventListener('mouseout', handleMouseOut);
        hideTooltipImmediate();
    };
}
