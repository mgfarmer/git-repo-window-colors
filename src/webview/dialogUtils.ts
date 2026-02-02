/// <reference lib="dom" />

// Dialog utility functions for webview (sandboxed environment)

let currentDialog: HTMLDivElement | null = null;

export interface DialogOptions {
    title: string;
    message?: string;
    inputLabel?: string;
    inputValue?: string;
    inputPlaceholder?: string;
    confirmText?: string;
    cancelText?: string;
}

export function showInputDialog(options: DialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
        // Remove any existing dialog
        closeDialog();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000';

        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.backgroundColor = 'var(--vscode-editor-background)';
        dialog.style.border = '1px solid var(--vscode-panel-border)';
        dialog.style.borderRadius = '6px';
        dialog.style.padding = '20px';
        dialog.style.minWidth = '400px';
        dialog.style.maxWidth = '600px';
        dialog.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';

        // Title
        const title = document.createElement('h3');
        title.textContent = options.title;
        title.style.margin = '0 0 16px 0';
        title.style.color = 'var(--vscode-foreground)';
        dialog.appendChild(title);

        // Message (if provided)
        if (options.message) {
            const message = document.createElement('p');
            message.textContent = options.message;
            message.style.margin = '0 0 16px 0';
            message.style.color = 'var(--vscode-descriptionForeground)';
            dialog.appendChild(message);
        }

        // Input label (if provided)
        if (options.inputLabel) {
            const label = document.createElement('label');
            label.textContent = options.inputLabel;
            label.style.display = 'block';
            label.style.marginBottom = '8px';
            label.style.color = 'var(--vscode-foreground)';
            label.style.fontSize = '13px';
            dialog.appendChild(label);
        }

        // Input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = options.inputValue || '';
        input.placeholder = options.inputPlaceholder || '';
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.marginBottom = '16px';
        input.style.backgroundColor = 'var(--vscode-input-background)';
        input.style.color = 'var(--vscode-input-foreground)';
        input.style.border = '1px solid var(--vscode-input-border)';
        input.style.borderRadius = '2px';
        input.style.outline = 'none';
        input.style.fontSize = '13px';
        input.style.boxSizing = 'border-box';

        input.addEventListener('focus', () => {
            input.style.border = '1px solid var(--vscode-focusBorder)';
        });

        input.addEventListener('blur', () => {
            input.style.border = '1px solid var(--vscode-input-border)';
        });

        dialog.appendChild(input);

        // Buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        // Cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = options.cancelText || 'Cancel';
        cancelButton.style.padding = '6px 14px';
        cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
        cancelButton.style.color = 'var(--vscode-button-secondaryForeground)';
        cancelButton.style.border = '1px solid var(--vscode-button-border)';
        cancelButton.style.borderRadius = '2px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontSize = '13px';

        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
        });

        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
        });

        cancelButton.addEventListener('click', () => {
            closeDialog();
            resolve(null);
        });

        buttonContainer.appendChild(cancelButton);

        // Confirm button
        const confirmButton = document.createElement('button');
        confirmButton.textContent = options.confirmText || 'OK';
        confirmButton.style.padding = '6px 14px';
        confirmButton.style.backgroundColor = 'var(--vscode-button-background)';
        confirmButton.style.color = 'var(--vscode-button-foreground)';
        confirmButton.style.border = '1px solid var(--vscode-button-border)';
        confirmButton.style.borderRadius = '2px';
        confirmButton.style.cursor = 'pointer';
        confirmButton.style.fontSize = '13px';

        confirmButton.addEventListener('mouseenter', () => {
            confirmButton.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
        });

        confirmButton.addEventListener('mouseleave', () => {
            confirmButton.style.backgroundColor = 'var(--vscode-button-background)';
        });

        confirmButton.addEventListener('click', () => {
            const value = input.value.trim();
            closeDialog();
            resolve(value || null);
        });

        buttonContainer.appendChild(confirmButton);
        dialog.appendChild(buttonContainer);

        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmButton.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelButton.click();
            }
        });

        // Handle overlay click to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cancelButton.click();
            }
        });

        // Assemble and show
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        currentDialog = overlay;

        // Focus input after a short delay
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    });
}

export function showMessageDialog(
    options: Omit<DialogOptions, 'inputLabel' | 'inputValue' | 'inputPlaceholder'>,
): Promise<boolean> {
    return new Promise((resolve) => {
        // Remove any existing dialog
        closeDialog();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000';

        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.backgroundColor = 'var(--vscode-editor-background)';
        dialog.style.border = '1px solid var(--vscode-panel-border)';
        dialog.style.borderRadius = '6px';
        dialog.style.padding = '20px';
        dialog.style.minWidth = '400px';
        dialog.style.maxWidth = '600px';
        dialog.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';

        // Title
        const title = document.createElement('h3');
        title.textContent = options.title;
        title.style.margin = '0 0 16px 0';
        title.style.color = 'var(--vscode-foreground)';
        dialog.appendChild(title);

        // Message
        if (options.message) {
            const message = document.createElement('p');
            message.textContent = options.message;
            message.style.margin = '0 0 20px 0';
            message.style.color = 'var(--vscode-foreground)';
            dialog.appendChild(message);
        }

        // Buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        // Only show cancel button if cancelText is provided
        if (options.cancelText) {
            const cancelButton = document.createElement('button');
            cancelButton.textContent = options.cancelText;
            cancelButton.style.padding = '6px 14px';
            cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
            cancelButton.style.color = 'var(--vscode-button-secondaryForeground)';
            cancelButton.style.border = '1px solid var(--vscode-button-border)';
            cancelButton.style.borderRadius = '2px';
            cancelButton.style.cursor = 'pointer';
            cancelButton.style.fontSize = '13px';

            cancelButton.addEventListener('mouseenter', () => {
                cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
            });

            cancelButton.addEventListener('mouseleave', () => {
                cancelButton.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
            });

            cancelButton.addEventListener('click', () => {
                closeDialog();
                resolve(false);
            });

            buttonContainer.appendChild(cancelButton);
        }

        // Confirm button
        const confirmButton = document.createElement('button');
        confirmButton.textContent = options.confirmText || 'OK';
        confirmButton.style.padding = '6px 14px';
        confirmButton.style.backgroundColor = 'var(--vscode-button-background)';
        confirmButton.style.color = 'var(--vscode-button-foreground)';
        confirmButton.style.border = '1px solid var(--vscode-button-border)';
        confirmButton.style.borderRadius = '2px';
        confirmButton.style.cursor = 'pointer';
        confirmButton.style.fontSize = '13px';

        confirmButton.addEventListener('mouseenter', () => {
            confirmButton.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
        });

        confirmButton.addEventListener('mouseleave', () => {
            confirmButton.style.backgroundColor = 'var(--vscode-button-background)';
        });

        confirmButton.addEventListener('click', () => {
            closeDialog();
            resolve(true);
        });

        buttonContainer.appendChild(confirmButton);
        dialog.appendChild(buttonContainer);

        // Handle Escape key
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDialog();
                resolve(false);
                document.removeEventListener('keydown', handleKeyDown);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                confirmButton.click();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        // Handle overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && options.cancelText) {
                closeDialog();
                resolve(false);
            }
        });

        // Assemble and show
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        currentDialog = overlay;

        // Focus confirm button
        setTimeout(() => {
            confirmButton.focus();
        }, 100);
    });
}

export function closeDialog(): void {
    if (currentDialog) {
        currentDialog.remove();
        currentDialog = null;
    }
}
