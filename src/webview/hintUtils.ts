/// <reference lib="dom" />

/**
 * Hint popup framework for first-time user guidance.
 * Each hint has its own global state flag and only shows once.
 */

/** Debug flag: Set to true to always show hints (ignores "already shown" state) */
export const DEBUG_ALWAYS_SHOW_HINTS = false;

// Declare VS Code API for messaging
declare const vscode: {
    postMessage(message: any): void;
};

export type HintPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

/** Prefix for all hint flag keys in global state */
export const HINT_FLAG_PREFIX = 'grwc.hints.';

/** Prefix for all tour flag keys in global state */
export const TOUR_FLAG_PREFIX = 'grwc.tours.';

/** Derive the global state flag key from a hint ID */
export function getHintFlagKey(id: string): string {
    return `${HINT_FLAG_PREFIX}${id}`;
}

/** Derive the global state flag key from a tour ID */
export function getTourFlagKey(id: string): string {
    return `${TOUR_FLAG_PREFIX}${id}`;
}

export interface HintConfig {
    /** Unique identifier for the hint (also used to derive the global state flag key) */
    id: string;
    /** HTML content for the hint popup */
    html: string;
    /** Preferred position relative to target element */
    position?: HintPosition;
    /** Maximum width in pixels (default: 320) */
    maxWidth?: number;
    /** Arrow position fine-tuning: percentage from start of edge (default: 50) */
    arrowOffset?: number;
}

/** Options for rendering a hint in tour mode */
export interface TourRenderOptions {
    stepNumber: number;
    totalSteps: number;
    onNext: () => void;
    onBack: () => void;
    onSkip: () => void;
    isFirstStep: boolean;
    isLastStep: boolean;
}

/**
 * Individual Hint instance
 */
export class Hint {
    readonly id: string;
    readonly flagKey: string;
    readonly html: string;
    readonly position: HintPosition;
    readonly maxWidth: number;
    readonly arrowOffset: number;

    private _element: HTMLDivElement | null = null;

    constructor(config: HintConfig) {
        this.id = config.id;
        this.flagKey = getHintFlagKey(config.id);
        this.html = config.html;
        this.position = config.position ?? 'auto';
        this.maxWidth = config.maxWidth ?? 320;
        this.arrowOffset = config.arrowOffset ?? 50;
    }

    /**
     * Render the hint popup near the target element
     * @param target Element to position hint near
     * @param onDismiss Callback when hint is dismissed
     * @param tourOptions Optional tour navigation options (for tour mode)
     */
    render(target: HTMLElement, onDismiss: () => void, tourOptions?: TourRenderOptions): void {
        // Remove any existing hint element
        this.hide();

        const targetRect = target.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 12;
        const gap = 12;

        // Create hint container
        const hint = document.createElement('div');
        hint.className = 'grwc-hint' + (tourOptions ? ' grwc-hint-tour' : '');
        hint.setAttribute('data-hint-id', this.id);
        hint.style.position = 'fixed';
        hint.style.zIndex = '10002';
        hint.style.maxWidth = `${this.maxWidth}px`;

        // Create content wrapper
        const content = document.createElement('div');
        content.className = 'grwc-hint-content';
        content.innerHTML = this.html;

        // Create arrow element
        const arrow = document.createElement('div');
        arrow.className = 'grwc-hint-arrow';

        if (tourOptions) {
            // Tour mode: add footer with navigation buttons
            const footer = document.createElement('div');
            footer.className = 'grwc-hint-tour-footer';

            // Progress indicator
            const progress = document.createElement('span');
            progress.className = 'grwc-hint-tour-progress';
            progress.textContent = `${tourOptions.stepNumber} of ${tourOptions.totalSteps}`;

            // Button container
            const buttons = document.createElement('div');
            buttons.className = 'grwc-hint-tour-buttons';

            // Skip button
            const skipBtn = document.createElement('button');
            skipBtn.className = 'grwc-hint-tour-btn grwc-hint-tour-btn-skip';
            skipBtn.textContent = 'Skip Tour';
            skipBtn.onclick = (e) => {
                e.stopPropagation();
                tourOptions.onSkip();
            };

            // Back button
            const backBtn = document.createElement('button');
            backBtn.className = 'grwc-hint-tour-btn grwc-hint-tour-btn-back';
            backBtn.textContent = 'Back';
            backBtn.disabled = tourOptions.isFirstStep;
            backBtn.onclick = (e) => {
                e.stopPropagation();
                tourOptions.onBack();
            };

            // Next/Finish button
            const nextBtn = document.createElement('button');
            nextBtn.className = 'grwc-hint-tour-btn grwc-hint-tour-btn-next';
            nextBtn.textContent = tourOptions.isLastStep ? 'Finish' : 'Next';
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                tourOptions.onNext();
            };

            buttons.appendChild(skipBtn);
            buttons.appendChild(backBtn);
            buttons.appendChild(nextBtn);

            footer.appendChild(progress);
            footer.appendChild(buttons);

            hint.appendChild(content);
            hint.appendChild(footer);
            hint.appendChild(arrow);
        } else {
            // Standalone hint mode: dismiss button
            const dismissBtn = document.createElement('button');
            dismissBtn.className = 'grwc-hint-dismiss';
            dismissBtn.innerHTML = '<span class="codicon codicon-close"></span>';
            dismissBtn.setAttribute('aria-label', 'Dismiss hint');
            dismissBtn.onclick = (e) => {
                e.stopPropagation();
                onDismiss();
            };

            hint.appendChild(dismissBtn);
            hint.appendChild(content);
            hint.appendChild(arrow);

            // Click outside to dismiss (only for standalone hints)
            const clickOutsideHandler = (e: MouseEvent) => {
                if (!hint.contains(e.target as Node)) {
                    document.removeEventListener('click', clickOutsideHandler);
                    onDismiss();
                }
            };
            // Delay adding click handler to avoid immediate dismiss
            setTimeout(() => {
                document.addEventListener('click', clickOutsideHandler);
            }, 100);
        }

        // Add to body to measure
        document.body.appendChild(hint);
        this._element = hint;

        // Measure and position
        const hintRect = hint.getBoundingClientRect();
        const finalPosition = this._calculateBestPosition(targetRect, hintRect, viewportWidth, viewportHeight, padding);
        const pos = this._calculatePosition(
            targetRect,
            hintRect,
            viewportWidth,
            viewportHeight,
            padding,
            gap,
            finalPosition,
        );

        hint.style.left = `${pos.left}px`;
        hint.style.top = `${pos.top}px`;

        // Set arrow position
        arrow.classList.add(`grwc-hint-arrow-${finalPosition}`);
        this._positionArrow(arrow, targetRect, hintRect, pos, finalPosition);

        // Fade in
        hint.style.opacity = '0';
        hint.style.transform = 'scale(0.95)';
        requestAnimationFrame(() => {
            hint.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
            hint.style.opacity = '1';
            hint.style.transform = 'scale(1)';

            // Add attention pulse after fade-in completes
            setTimeout(() => {
                hint.classList.add('grwc-hint-attention');
            }, 220);
        });
    }

    /**
     * Hide and remove the hint element
     */
    hide(): void {
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
    }

    private _calculateBestPosition(
        targetRect: DOMRect,
        hintRect: DOMRect,
        viewportWidth: number,
        viewportHeight: number,
        padding: number,
    ): 'top' | 'bottom' | 'left' | 'right' {
        if (this.position !== 'auto') {
            return this.position;
        }

        const spaceAbove = targetRect.top;
        const spaceBelow = viewportHeight - targetRect.bottom;
        const spaceLeft = targetRect.left;
        const spaceRight = viewportWidth - targetRect.right;

        // Prefer bottom, then right, then top, then left
        if (spaceBelow >= hintRect.height + padding) {
            return 'bottom';
        }
        if (spaceRight >= hintRect.width + padding) {
            return 'right';
        }
        if (spaceAbove >= hintRect.height + padding) {
            return 'top';
        }
        if (spaceLeft >= hintRect.width + padding) {
            return 'left';
        }

        return 'bottom';
    }

    private _calculatePosition(
        targetRect: DOMRect,
        hintRect: DOMRect,
        viewportWidth: number,
        viewportHeight: number,
        padding: number,
        gap: number,
        position: 'top' | 'bottom' | 'left' | 'right',
    ): { left: number; top: number } {
        let left: number;
        let top: number;

        switch (position) {
            case 'top':
                left = targetRect.left + (targetRect.width - hintRect.width) / 2;
                top = targetRect.top - hintRect.height - gap;
                break;
            case 'bottom':
                left = targetRect.left + (targetRect.width - hintRect.width) / 2;
                top = targetRect.bottom + gap;
                break;
            case 'left':
                left = targetRect.left - hintRect.width - gap;
                top = targetRect.top + (targetRect.height - hintRect.height) / 2;
                break;
            case 'right':
                left = targetRect.right + gap;
                top = targetRect.top + (targetRect.height - hintRect.height) / 2;
                break;
        }

        // Clamp to viewport
        left = Math.max(padding, Math.min(left, viewportWidth - hintRect.width - padding));
        top = Math.max(padding, Math.min(top, viewportHeight - hintRect.height - padding));

        return { left, top };
    }

    private _positionArrow(
        arrow: HTMLDivElement,
        targetRect: DOMRect,
        hintRect: DOMRect,
        hintPos: { left: number; top: number },
        position: 'top' | 'bottom' | 'left' | 'right',
    ): void {
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

        switch (position) {
            case 'top':
            case 'bottom':
                // Arrow on horizontal edge, position horizontally to point at target
                const arrowX = Math.max(16, Math.min(targetCenterX - hintPos.left, hintRect.width - 16));
                arrow.style.left = `${arrowX}px`;
                break;
            case 'left':
            case 'right':
                // Arrow on vertical edge, position vertically to point at target
                const arrowY = Math.max(16, Math.min(targetCenterY - hintPos.top, hintRect.height - 16));
                arrow.style.top = `${arrowY}px`;
                break;
        }
    }
}

/**
 * Singleton manager for all hints
 */
class HintManagerClass {
    private _hints: Map<string, Hint> = new Map();
    private _shownFlags: Record<string, boolean> = {};
    private _currentHint: Hint | null = null;

    /**
     * Register a hint for later use
     */
    register(hint: Hint): void {
        this._hints.set(hint.id, hint);
    }

    /**
     * Update shown flags from extension (called when configData arrives)
     */
    updateState(flags: Record<string, boolean>): void {
        this._shownFlags = { ...flags };
    }

    /**
     * Check if a hint has already been shown
     */
    isShown(id: string): boolean {
        if (DEBUG_ALWAYS_SHOW_HINTS) return false;
        const hint = this._hints.get(id);
        if (!hint) return true; // Unknown hint treated as shown
        return this._shownFlags[hint.flagKey] === true;
    }

    /**
     * Try to show a hint if it hasn't been shown yet
     * @param id The hint ID
     * @param target The element to attach the hint to
     * @param condition Optional callback that must return true for the hint to show.
     *                  If DEBUG_ALWAYS_SHOW_HINTS is true, this condition is bypassed.
     * @returns true if hint was shown, false if already shown or hint not found
     */
    tryShow(id: string, target: HTMLElement | null, condition?: () => boolean): boolean {
        if (!target) return false;

        const hint = this._hints.get(id);
        if (!hint) {
            console.warn(`[HintManager] Hint not found: ${id}`);
            return false;
        }

        // Check condition (bypassed if DEBUG_ALWAYS_SHOW_HINTS is true)
        if (condition && !DEBUG_ALWAYS_SHOW_HINTS && !condition()) {
            return false;
        }

        if (this.isShown(id)) {
            return false;
        }

        // Mark as shown immediately so hint only appears once
        this._shownFlags[hint.flagKey] = true;
        this._sendDismissMessage(hint.flagKey);

        // Hide any currently showing hint
        this._hideCurrentHint();

        // Show the new hint
        this._currentHint = hint;
        hint.render(target, () => this.dismiss(id));

        return true;
    }

    /**
     * Mark a hint as shown without displaying it
     * Use when user has already discovered the feature another way
     */
    markShown(id: string): void {
        const hint = this._hints.get(id);
        if (!hint) {
            console.warn(`[HintManager] Hint not found: ${id}`);
            return;
        }

        if (this._shownFlags[hint.flagKey]) {
            return; // Already marked
        }

        this._shownFlags[hint.flagKey] = true;
        this._sendDismissMessage(hint.flagKey);
    }

    /**
     * Dismiss the currently showing hint
     */
    dismiss(id: string): void {
        const hint = this._hints.get(id);
        if (!hint) return;

        hint.hide();
        if (this._currentHint === hint) {
            this._currentHint = null;
        }

        if (!this._shownFlags[hint.flagKey]) {
            this._shownFlags[hint.flagKey] = true;
            this._sendDismissMessage(hint.flagKey);
        }
    }

    /**
     * Hide any currently showing hint without marking as shown
     */
    private _hideCurrentHint(): void {
        if (this._currentHint) {
            this._currentHint.hide();
            this._currentHint = null;
        }
    }

    /**
     * Send message to extension to persist the shown flag
     */
    private _sendDismissMessage(flagKey: string): void {
        vscode.postMessage({
            command: 'dismissHint',
            data: { flagKey },
        });
    }

    /**
     * Get all registered hint flag keys (useful for extension to load initial state)
     */
    getRegisteredFlagKeys(): string[] {
        return Array.from(this._hints.values()).map((h) => h.flagKey);
    }

    /**
     * Reset all hint flags so hints can be shown again.
     * Called when the extension clears the persisted flags.
     */
    resetAllFlags(): void {
        this._shownFlags = {};
        // Hide any currently showing hint
        this._hideCurrentHint();
    }
}

// Export singleton instance
export const hintManager = new HintManagerClass();

// ===== Tab Switching Utility =====

/**
 * Switch to a specific tab by its content panel ID.
 * Finds the tab button with aria-controls matching the tabId and activates it.
 * @param tabId The ID of the tab-content element to switch to
 * @returns true if tab was switched, false if tab not found
 */
export function switchToTab(tabId: string): boolean {
    // Find the tab button that controls this content
    const tabButton = document.querySelector(`.tab-button[aria-controls="${tabId}"]`) as HTMLElement | null;
    if (!tabButton) {
        console.warn(`[switchToTab] Tab button not found for tabId: ${tabId}`);
        return false;
    }

    // Check if already active
    if (tabButton.classList.contains('active')) {
        return true;
    }

    // Deactivate all tabs
    document.querySelectorAll('.tab-button').forEach((btn) => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach((content) => {
        content.classList.remove('active');
    });

    // Activate the target tab
    tabButton.classList.add('active');
    tabButton.setAttribute('aria-selected', 'true');
    const content = document.getElementById(tabId);
    if (content) {
        content.classList.add('active');
    }

    return true;
}

// ===== Tour Framework =====

/** Configuration for a single tour step */
export interface TourStepConfig {
    /** CSS selector to find the target element */
    targetSelector: string;
    /** HTML content for the hint popup */
    html: string;
    /** Preferred position relative to target element */
    position?: HintPosition;
    /** Maximum width in pixels (default: 320) */
    maxWidth?: number;
    /** Optional: ID of the tab-content element this step's target is on */
    tabId?: string;
}

/** Configuration for a tour */
export interface TourConfig {
    /** Unique identifier for the tour (also used to derive the global state flag key) */
    id: string;
    /** Ordered list of tour steps */
    steps: TourStepConfig[];
    /** Optional: Title for the command palette entry (e.g., "Start Getting Started Tour"). If provided, a command will be registered. */
    commandTitle?: string;
}

/**
 * Product tour: a sequence of hints shown one after another
 */
export class Tour {
    readonly id: string;
    readonly flagKey: string;
    readonly steps: TourStepConfig[];
    readonly commandTitle?: string;

    private _currentStepIndex: number = 0;
    private _currentHint: Hint | null = null;
    private _isActive: boolean = false;

    constructor(config: TourConfig) {
        this.id = config.id;
        this.flagKey = getTourFlagKey(config.id);
        this.steps = config.steps;
        this.commandTitle = config.commandTitle;
    }

    /**
     * Check if tour is currently active
     */
    get isActive(): boolean {
        return this._isActive;
    }

    /**
     * Get current step index (0-based)
     */
    get currentStepIndex(): number {
        return this._currentStepIndex;
    }

    /**
     * Start the tour from the beginning
     */
    start(onComplete: () => void, onSkip: () => void): void {
        if (this.steps.length === 0) {
            onComplete();
            return;
        }

        this._isActive = true;
        this._currentStepIndex = 0;
        this._showCurrentStep(onComplete, onSkip);
    }

    /**
     * Stop the tour and hide current hint
     */
    stop(): void {
        this._isActive = false;
        if (this._currentHint) {
            this._currentHint.hide();
            this._currentHint = null;
        }
    }

    private _showCurrentStep(onComplete: () => void, onSkip: () => void): void {
        // Hide previous hint
        if (this._currentHint) {
            this._currentHint.hide();
            this._currentHint = null;
        }

        const stepConfig = this.steps[this._currentStepIndex];
        if (!stepConfig) {
            this._isActive = false;
            onComplete();
            return;
        }

        // Switch to the correct tab if specified
        if (stepConfig.tabId) {
            switchToTab(stepConfig.tabId);
        }

        // Find target element
        const target = document.querySelector(stepConfig.targetSelector) as HTMLElement;
        if (!target) {
            console.warn(`[Tour] Target not found for selector: ${stepConfig.targetSelector}`);
            // Skip to next step if target not found
            if (this._currentStepIndex < this.steps.length - 1) {
                this._currentStepIndex++;
                this._showCurrentStep(onComplete, onSkip);
            } else {
                this._isActive = false;
                onComplete();
            }
            return;
        }

        // Create a temporary Hint for this step
        const hint = new Hint({
            id: `${this.id}-step-${this._currentStepIndex}`,
            html: stepConfig.html,
            position: stepConfig.position,
            maxWidth: stepConfig.maxWidth,
        });

        this._currentHint = hint;

        const tourOptions: TourRenderOptions = {
            stepNumber: this._currentStepIndex + 1,
            totalSteps: this.steps.length,
            isFirstStep: this._currentStepIndex === 0,
            isLastStep: this._currentStepIndex === this.steps.length - 1,
            onNext: () => {
                if (this._currentStepIndex < this.steps.length - 1) {
                    this._currentStepIndex++;
                    this._showCurrentStep(onComplete, onSkip);
                } else {
                    this.stop();
                    onComplete();
                }
            },
            onBack: () => {
                if (this._currentStepIndex > 0) {
                    this._currentStepIndex--;
                    this._showCurrentStep(onComplete, onSkip);
                }
            },
            onSkip: () => {
                this.stop();
                onSkip();
            },
        };

        hint.render(target, () => {}, tourOptions);
    }
}

/**
 * Singleton manager for all tours
 */
class TourManagerClass {
    private _tours: Map<string, Tour> = new Map();
    private _completedFlags: Record<string, boolean> = {};

    /**
     * Register a tour for later use.
     * If the tour has a commandTitle, sends a message to register a VS Code command.
     */
    register(tour: Tour): void {
        this._tours.set(tour.id, tour);

        // If tour has a command title, register the command with the extension
        if (tour.commandTitle) {
            vscode.postMessage({
                command: 'registerTourCommand',
                data: {
                    tourId: tour.id,
                    commandTitle: tour.commandTitle,
                },
            });
        }
    }

    /**
     * Update completed flags from extension (called when configData arrives)
     */
    updateState(flags: Record<string, boolean>): void {
        this._completedFlags = { ...flags };
    }

    /**
     * Check if a tour has already been completed
     */
    isCompleted(id: string): boolean {
        if (DEBUG_ALWAYS_SHOW_HINTS) return false;
        const tour = this._tours.get(id);
        if (!tour) return true; // Unknown tour treated as completed
        return this._completedFlags[tour.flagKey] === true;
    }

    /**
     * Start a tour if it hasn't been completed yet
     * @returns true if tour was started, false if already completed or not found
     */
    startTour(id: string): boolean {
        const tour = this._tours.get(id);
        if (!tour) {
            console.warn(`[TourManager] Tour not found: ${id}`);
            return false;
        }

        if (this.isCompleted(id)) {
            return false;
        }

        // Stop any currently active tour
        this._stopActiveTour();

        tour.start(
            () => this._completeTour(id),
            () => this._completeTour(id), // Skip also marks as complete
        );

        return true;
    }

    /**
     * Force start a tour regardless of completion status.
     * Used when explicitly triggered from command palette.
     * @returns true if tour was started, false if not found
     */
    forceStartTour(id: string): boolean {
        const tour = this._tours.get(id);
        if (!tour) {
            console.warn(`[TourManager] Tour not found: ${id}`);
            return false;
        }

        // Stop any currently active tour
        this._stopActiveTour();

        tour.start(
            () => this._completeTour(id),
            () => this._completeTour(id), // Skip also marks as complete
        );

        return true;
    }

    /**
     * Mark a tour as completed without starting it
     */
    markCompleted(id: string): void {
        const tour = this._tours.get(id);
        if (!tour) {
            console.warn(`[TourManager] Tour not found: ${id}`);
            return;
        }

        if (this._completedFlags[tour.flagKey]) {
            return; // Already marked
        }

        this._completedFlags[tour.flagKey] = true;
        this._sendCompleteTourMessage(tour.flagKey);
    }

    /**
     * Stop any currently active tour
     */
    private _stopActiveTour(): void {
        for (const tour of this._tours.values()) {
            if (tour.isActive) {
                tour.stop();
            }
        }
    }

    /**
     * Mark tour as complete and persist
     */
    private _completeTour(id: string): void {
        const tour = this._tours.get(id);
        if (!tour) return;

        if (!this._completedFlags[tour.flagKey]) {
            this._completedFlags[tour.flagKey] = true;
            this._sendCompleteTourMessage(tour.flagKey);
        }
    }

    /**
     * Send message to extension to persist the completion flag
     */
    private _sendCompleteTourMessage(flagKey: string): void {
        vscode.postMessage({
            command: 'completeTour',
            data: { flagKey },
        });
    }

    /**
     * Get all registered tour flag keys
     */
    getRegisteredFlagKeys(): string[] {
        return Array.from(this._tours.values()).map((t) => t.flagKey);
    }
}

// Export singleton instance
export const tourManager = new TourManagerClass();
