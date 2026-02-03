# Color Picker Implementation Options

The git-repo-window-colors extension now supports two different color picker implementations that can be selected at build time.

## Configuration

Edit `src/webview/configWebview.ts` and change the `USE_NATIVE_COLOR_PICKER` constant:

```typescript
// Set to false to use VS Code's input dialog, true to use native HTML color picker
const USE_NATIVE_COLOR_PICKER = true;
```

## Option 1: Native HTML Color Picker (Default)

**Enabled when:** `USE_NATIVE_COLOR_PICKER = true`

**Features:**

- Native browser color picker widget
- Visual color selection with color wheel/palette
- Hex color input field alongside the picker
- Real-time color preview
- Better user experience for color selection

**Interface:**

- Color picker button (shows selected color)
- Text input field (shows hex value, allows manual entry)
- Both inputs stay synchronized

## Option 2: VS Code Input Dialog

**Enabled when:** `USE_NATIVE_COLOR_PICKER = false`

**Features:**

- Uses VS Code's native `showInputBox` dialog
- Color swatch button that opens the dialog
- Text input field for manual color entry
- Supports named colors, hex, rgb(), etc.

**Interface:**

- Color swatch button (click to open VS Code dialog)
- Text input field (manual color entry)

## Implementation Details

### Native HTML Color Picker

- Uses `<input type="color">` for visual selection
- Converts colors to hex format for the native picker
- Supports named colors through conversion mapping
- Updates both picker and text input when either changes

### VS Code Input Dialog

- Uses `vscode.window.showInputBox()` API
- Accepts any CSS color format
- Simpler implementation, consistent with VS Code patterns

## Build Process

After changing the `USE_NATIVE_COLOR_PICKER` setting:

1. Save the file
2. Run `yarn compile` to rebuild
3. Reload VS Code extension host (F5 or restart VS Code)
4. Test with `Ctrl+Shift+P` → "Git Repo Window Colors: Configure"

## User Experience Comparison

| Feature | Native HTML | VS Code Dialog |
|---------|-------------|----------------|
| Visual color selection | ✅ Color wheel/palette | ❌ Text only |
| Real-time preview | ✅ Immediate | ✅ On dialog close |
| Keyboard accessibility | ✅ Tab navigation | ✅ VS Code standard |
| Mobile friendly | ✅ Touch support | ✅ VS Code handles it |
| Consistent with VS Code | ⚠️ Browser UI | ✅ Native VS Code |
| Complex color formats | ⚠️ Hex only picker | ✅ Any CSS format |

## Recommendation

- **Use Native HTML Color Picker** for better user experience and visual color selection
- **Use VS Code Dialog** for maximum consistency with VS Code patterns and broader color format support
