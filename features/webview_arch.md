# VS Code Webview Architecture Guide

This document captures the complete webview architecture used in the Git Repo Window Colors extension. Use this as a reference for implementing webviews with proper security, separation of concerns, and CSP compliance.

## 📋 Architecture Overview

The webview implementation follows a **clean separation** pattern with three main components:

1. **Backend Provider** (`configWebview.ts`) - Extension context, VS Code API access
2. **Frontend Script** (`wvConfigWebview.ts`) - Webview context, UI logic
3. **Styling** (`configWebview.css`) - Presentation layer
4. **Type Definitions** (`webviewTypes.ts`) - Shared interfaces

```
┌─────────────────────────────────────────────────────┐
│                Extension Context                    │
│  ┌─────────────────────────────────────────────────┐│
│  │         ConfigWebviewProvider                   ││
│  │  • VS Code API access                           ││
│  │  • Settings management                          ││
│  │  • Message handling                             ││
│  │  • HTML template generation                     ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                            ↕ postMessage
┌─────────────────────────────────────────────────────┐
│                Webview Context                      │
│  ┌─────────────────────────────────────────────────┐│
│  │         wvConfigWebview.ts                      ││
│  │  • DOM manipulation                             ││
│  │  • User interactions                            ││
│  │  • Event handling                               ││
│  │  • Frontend logic                               ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────┐│
│  │         configWebview.css                       ││
│  │  • Visual styling                               ││
│  │  • Layout definitions                           ││
│  │  • Theme integration                            ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## 🏗️ File Structure

```
src/
├── webview/
│   ├── configWebview.ts       # Backend provider class
│   ├── wvConfigWebview.ts     # Frontend webview script
│   ├── configWebview.css      # Styles
│   └── tsconfig.json          # Webview-specific TS config
├── types/
│   └── webviewTypes.ts        # Shared type definitions
└── extension.ts               # Main extension entry
```

## 🔒 Content Security Policy (CSP)

### CSP Implementation

The webview uses a **strict CSP** that prevents inline scripts and restricts resource loading:

```html
<meta http-equiv="Content-Security-Policy" 
    content="default-src 'none'; 
    font-src ${webview.cspSource}; 
    img-src ${webview.cspSource}; 
    style-src 'unsafe-inline' ${webview.cspSource}; 
    script-src 'nonce-${nonce}';">
```

### Key CSP Elements

1. **`default-src 'none'`** - Deny all by default
2. **`script-src 'nonce-${nonce}'`** - Only allow scripts with valid nonce
3. **`style-src 'unsafe-inline' ${webview.cspSource}`** - Allow inline styles + extension CSS
4. **`${webview.cspSource}`** - VS Code's webview resource protocol

### Nonce Generation

```typescript
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
```

### Resource URIs

```typescript
// Convert extension file paths to webview-safe URIs
const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'configWebview.css')
);

const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'wvConfigWebview.js')
);
```

## 🎯 Backend Provider Pattern

### Core Provider Class

```typescript
export class ConfigWebviewProvider implements vscode.Disposable {
    private _panel: vscode.WebviewPanel | undefined;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _workspaceInfo: { repositoryUrl: string; currentBranch: string };

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public show(extensionUri: vscode.Uri) {
        // Singleton pattern - reuse existing panel
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        // Create new webview panel
        this._panel = vscode.window.createWebviewPanel(
            'uniqueViewType',
            'Display Title',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
                    vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
                ],
                retainContextWhenHidden: true,
            }
        );

        // Set HTML content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Handle incoming messages
        this._panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => await this._handleMessage(message),
            undefined,
            this._disposables
        );

        // Handle disposal
        this._panel.onDidDispose(() => this._onPanelDisposed(), null, this._disposables);

        // Send initial data
        this._sendInitialData();
    }
}
```

### Message Handling Pattern

```typescript
private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
        case 'requestConfig':
            this._sendConfigurationToWebview();
            break;
        case 'updateConfig':
            await this._updateConfiguration(message.data);
            break;
        case 'previewConfig':
            this._previewConfiguration(message.data);
            break;
        // Add more commands as needed
    }
}
```

### Async Configuration Updates

**Critical:** Configuration updates must be awaited before sending responses:

```typescript
private async _updateConfiguration(data: any): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('yourExtension');
        const updatePromises: Thenable<void>[] = [];

        // Collect all update promises
        if (data.someSettings) {
            updatePromises.push(config.update('someSetting', data.someSettings, true));
        }

        // Wait for ALL updates to complete
        await Promise.all(updatePromises);

        // ONLY after updates complete, send fresh data back
        this._sendConfigurationToWebview();
    } catch (error) {
        console.error('Configuration update failed:', error);
        vscode.window.showErrorMessage('Failed to update: ' + error.message);
    }
}
```

## 🎨 Frontend Script Pattern

### Webview Context Setup

```typescript
// Global declarations
declare const acquireVsCodeApi: any;
declare const DEVELOPMENT_MODE: boolean; // Injected by backend

// Initialize VS Code API
const vscode = acquireVsCodeApi();
let currentConfig: any = null;

// Request initial data
vscode.postMessage({
    command: 'requestConfig',
});
```

### Message Communication

```typescript
// Listen for messages from extension
window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
        case 'configData':
            handleConfigurationData(message.data);
            break;
        case 'colorPicked':
            handleColorPickerResult(message.data);
            break;
        // Handle other message types
    }
});

// Send messages to extension
function sendConfiguration() {
    vscode.postMessage({
        command: 'updateConfig',
        data: currentConfig,
    });
}
```

### Event Delegation Pattern

Use **event delegation** to handle dynamic content instead of inline event handlers (CSP compliance):

```typescript
function handleDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const action = target.getAttribute('data-action');
    
    switch (action) {
        case 'addRepoRule':
            addRepoRule();
            break;
        case 'deleteRule':
            const index = parseInt(target.getAttribute('data-index') || '0');
            const ruleType = target.getAttribute('data-rule-type') || '';
            deleteRule(index, ruleType);
            break;
        case 'moveRule':
            const moveIndex = parseInt(target.getAttribute('data-index') || '0');
            const moveRuleType = target.getAttribute('data-rule-type') || '';
            const direction = parseInt(target.getAttribute('data-direction') || '0');
            moveRule(moveIndex, moveRuleType, direction);
            break;
    }
}

// Attach single event listener
document.addEventListener('click', handleDocumentClick);
```

## 🎨 CSS Architecture

### File Separation

Keep CSS in separate files for maintainability:

```typescript
// Backend: Include CSS via webview URI
const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'configWebview.css')
);

// HTML template
return `<!DOCTYPE html>
<html>
<head>
    <link href="${cssUri}" rel="stylesheet">
</head>
...`;
```

### Theme Integration

Use VS Code CSS variables for consistent theming:

```css
body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
}

.primary-button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-button-border);
}

.input-field {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
}
```

## 🔧 Build Configuration

### Webpack Setup

Use **separate build configs** for extension and webview:

```javascript
// webpack.config.js
const extensionConfig = {
    name: 'extension',
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },
    externals: {
        vscode: 'commonjs vscode',
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: [/node_modules/, /src\/webview\/wvConfigWebview\.ts$/], // Exclude webview script
            use: ['ts-loader'],
        }],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{
                from: 'src/webview/*.css',
                to: 'webview/[name][ext]',
            }],
        }),
    ],
};

const webviewConfig = {
    name: 'webview',
    target: 'web', // Browser context
    entry: './src/webview/wvConfigWebview.ts',
    output: {
        path: path.resolve(__dirname, 'out', 'webview'),
        filename: 'wvConfigWebview.js',
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
                options: {
                    configFile: 'src/webview/tsconfig.json', // Separate TS config
                },
            }],
        }],
    },
};

module.exports = [extensionConfig, webviewConfig];
```

### TypeScript Configuration

Separate TS config for webview context:

```json
// src/webview/tsconfig.json
{
  "compilerOptions": {
    "target": "es2018",
    "lib": ["dom", "es2018"],        // Include DOM APIs
    "module": "es6",
    "moduleResolution": "node",
    "strict": false,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": [
    "wvConfigWebview.ts"              // Only webview script
  ]
}
```

## 📡 Type Safety

### Shared Type Definitions

```typescript
// src/types/webviewTypes.ts
export interface WebviewMessage {
    command: 'updateConfig' | 'requestConfig' | 'previewConfig';
    data: {
        // Define your data structure
        settings?: YourSettings;
        workspaceInfo?: WorkspaceInfo;
    };
}

export interface YourSettings {
    // Your configuration structure
}
```

### Backend Type Usage

```typescript
import { WebviewMessage } from '../types/webviewTypes';

private async _handleMessage(message: WebviewMessage): Promise<void> {
    // Fully typed message handling
}
```

## 🚀 Best Practices

### 1. Security First

- ✅ Always use CSP with nonces
- ✅ Use `webview.asWebviewUri()` for all resources
- ✅ Never use inline event handlers
- ✅ Sanitize any user-generated content

### 2. Performance

- ✅ Use `retainContextWhenHidden: true` for complex UIs
- ✅ Debounce user input validation
- ✅ Batch configuration updates
- ✅ Use event delegation for dynamic content

### 3. User Experience

- ✅ Provide loading states
- ✅ Handle error states gracefully
- ✅ Maintain state during panel recreation
- ✅ Support keyboard navigation

### 4. Development

- ✅ Separate concerns (backend/frontend/styles)
- ✅ Use TypeScript for type safety
- ✅ Implement proper disposal patterns
- ✅ Add comprehensive error handling

### 5. Accessibility

- ✅ Use ARIA labels and roles
- ✅ Support keyboard navigation
- ✅ Provide screen reader announcements
- ✅ Use semantic HTML elements

## 📚 Implementation Checklist

When implementing a new webview:

- [ ] Create separate TypeScript files for backend/frontend
- [ ] Set up proper CSP with nonces
- [ ] Configure webpack for dual-context builds
- [ ] Define shared types for message communication
- [ ] Use VS Code theme variables in CSS
- [ ] Implement proper disposal patterns
- [ ] Add error handling and validation
- [ ] Support keyboard navigation
- [ ] Test with different themes
- [ ] Handle async configuration updates properly

## 🎯 Example Implementation

For a complete reference implementation, see:

- `src/webview/configWebview.ts` - Backend provider
- `src/webview/wvConfigWebview.ts` - Frontend script  
- `src/webview/configWebview.css` - Styling
- `src/types/webviewTypes.ts` - Type definitions
- `webpack.config.js` - Build configuration

This architecture provides a secure, maintainable, and user-friendly foundation for VS Code webview extensions.
