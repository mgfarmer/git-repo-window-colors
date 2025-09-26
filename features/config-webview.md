# Configuration Webview Feature

## Feature Overview

Add a rich webview-based configuration UI to replace the cumbersome Settings UI editing experience. The webview will provide:

1. **Easy rule reordering** - Visual drag/drop or up/down buttons for priority management
2. **Integrated color picker** - No need for external color tools
3. **Real-time preview** - Immediate visual feedback when rules change
4. **Better UX** - Intuitive table-based editing with proper validation

## Requirements Analysis

### Current Pain Points

- Settings UI doesn't allow rule reordering (first match wins, so order matters)
- No built-in color picker in Settings UI
- Users must manually edit JSON or use external color picker
- Poor discoverability of rule format and options

### Desired Solution

- **Three-panel layout**: Repository rules (left) | Branch rules (right) | Other settings (bottom)
- **Rule reordering**: Up/down buttons on left edge of each rule row
- **Color picker integration**: Click color values to open picker
- **Live updates**: Changes immediately reflected in VS Code window
- **Maintain compatibility**: Keep existing JSON schema and settings storage

## Technical Architecture

### Webview Structure

```text
┌─────────────────┬─────────────────┐
│  Repository     │  Branch Rules   │
│  Rules Panel    │  Panel          │
│                 │                 │
│  [Table with    │  [Table with    │
│   drag & drop,  │   drag & drop,  │
│   up/down btns, │   up/down btns, │
│   & columns for │   & columns for │
│   repo/branch/  │   pattern/color │
│   colors]       │   editing]      │
│                 │                 │
├─────────────────┴─────────────────┤
│  Other Settings Panel             │
│  [Toggle/slider controls]         │
└───────────────────────────────────┘
```

### Communication Flow

```
Extension Host ←→ Webview
    ↓
Settings Storage (workspace config)
    ↓
VS Code Window (live color updates)
```

## Implementation Plan

### Phase 1: Webview Foundation

- [x] **1.1** Add webview command to package.json
- [x] **1.2** Create webview provider class in extension.ts
- [x] **1.3** Set up basic HTML structure with three panels
- [x] **1.4** Implement webview lifecycle management
- [x] **1.5** Add CSS styling for panel layout

### Phase 2: Data Communication

- [x] **2.1** Create message protocol for extension ↔ webview communication
- [x] **2.2** Send current configuration to webview on open
- [x] **2.3** Handle configuration updates from webview
- [x] **2.4** Implement settings validation and error handling
- [x] **2.5** Add real-time preview by calling existing `doit()` function

### Phase 3: Repository Rules Panel

- [x] **3.1** Create repository rules table with separate columns:
  - [x] Repository Qualifier column (editable text input)
  - [x] Default Branch column (editable text input, optional)
  - [x] Primary Color column (VS Code color picker integration)
  - [x] Branch Color column (VS Code color picker integration, optional)
- [x] **3.2** Implement drag & drop reordering functionality
- [x] **3.3** Add up/down arrow buttons for reordering
- [x] **3.4** Add add/delete rule functionality with proper validation
- [x] **3.5** Implement 500ms debounced validation after typing stops
- [x] **3.6** Add real-time preview integration (call existing `doit()` function)

### Phase 4: Branch Rules Panel ✅ COMPLETE

- [x] **4.1** Create branch rules table with separate columns:
  - [x] Branch Pattern column (editable text input with regex support)
  - [x] Branch Color column (VS Code color picker integration)
- [x] **4.2** Implement drag & drop reordering functionality
- [x] **4.3** Add up/down arrow buttons for reordering
- [x] **4.4** Add add/delete rule functionality with proper validation
- [x] **4.5** Implement 500ms debounced validation after typing stops
- [x] **4.6** Add pattern testing/preview functionality
- [x] **4.7** Add real-time preview integration

### Phase 5: Other Settings Panel ✅ COMPLETE

- [x] **5.1** Create settings panel layout
- [x] **5.2** Add toggle controls for boolean settings
- [x] **5.3** Add slider/number controls for numeric settings
- [x] **5.4** Add help text and descriptions
- [x] **5.5** Group related settings logically

### Phase 6: Polish & Testing

- [x] **6.1** Add keyboard shortcuts for common actions
- [x] **6.2** Implement proper focus management
- [x] **6.3** Add tooltips and help text
- [x] **6.4** Test with various configurations (with proper test data restoration)
- [x] **6.5** Add accessibility features
- [x] **6.6** Update documentation

## Detailed TODO List

### Immediate Next Steps

#### 1. Add Webview Command (Package.json)

```json
{
  "command": "windowColors.openConfig",
  "title": "Open Configuration", 
  "category": "GRWC"
}
```

#### 2. Create Webview Provider Class Structure

- Extend from `vscode.Disposable`
- Handle webview creation and lifecycle
- Manage message passing
- Handle configuration updates

#### 3. HTML/CSS Structure

```html
<div class="config-container">
  <div class="top-panels">
    <div class="repo-panel"><!-- Repository Rules --></div>
    <div class="branch-panel"><!-- Branch Rules --></div>
  </div>
  <div class="bottom-panel"><!-- Other Settings --></div>
</div>
```

#### 4. Message Protocol Design

```typescript
interface WebviewMessage {
  command: 'updateConfig' | 'requestConfig' | 'previewConfig' | 'openColorPicker';
  data: {
    repoRules?: RepoRule[];
    branchRules?: BranchRule[];
    otherSettings?: OtherSettings;
    colorPickerData?: { ruleType: 'repo' | 'branch', ruleIndex: number, colorType: 'primary' | 'branch' };
  };
}

interface RepoRule {
  repoQualifier: string;
  defaultBranch?: string;
  primaryColor: string;
  branchColor?: string;
}

interface BranchRule {
  pattern: string;
  color: string;
}
```

#### 5. Table Column Structure

**Repository Rules Table:**

| Drag Handle | ↑↓ | Repository Qualifier | Default Branch | Primary Color | Branch Color | Actions |
|-------------|----|--------------------|----------------|---------------|--------------|---------|
| ⋮⋮⋮         | ↑↓ | `text input`       | `text input`   | `color swatch` | `color swatch` | 🗑️ |

**Branch Rules Table:**

| Drag Handle | ↑↓ | Branch Pattern | Color | Actions |
|-------------|----|--------------|---------|----|
| ⋮⋮⋮         | ↑↓ | `text input` | `color swatch` | 🗑️ |

## File Structure Changes

### New Files to Create

```
src/
├── webview/
│   ├── configWebview.ts          # Webview provider class
│   ├── webviewContent.html       # HTML template
│   ├── webview.css               # Styling
│   └── webview.js                # Client-side JavaScript
└── types/
    └── webviewTypes.ts           # Shared type definitions
```

### Files to Modify

- `src/extension.ts` - Add webview command registration
- `package.json` - Add new command and webview configuration
- `webpack.config.js` - Handle webview resource bundling

## Technical Considerations

### Color Picker Integration

- Use VS Code's native color picker API via `vscode.window.showColorPicker()` or webview message protocol
- Integrate with existing `Color()` constructor validation logic
- Provide color preview swatches in the table cells
- Support common color formats (hex, rgb, hsl, named colors)

### Rule Reordering Implementation

- Support both drag & drop and up/down buttons for maximum user flexibility
- Use HTML5 drag and drop API for drag functionality
- Store rules in arrays (maintain current format)
- Update settings atomically to prevent corruption
- Provide visual feedback during drag operations

### Real-time Preview

- Leverage existing `doit()` function for immediate preview
- Debounce updates to avoid excessive re-coloring (500ms after user stops typing)
- Handle preview vs. permanent state carefully
- Show loading indicator during color application

### Validation & Error Handling

- Implement 500ms debounced validation after user stops typing
- Validate rule format before saving using existing validation logic
- Show inline error messages in webview with specific error details
- Graceful degradation if webview fails
- Validate regex patterns for branch rules with helpful error messages

## Recommended Other Settings Panel Layout

### Suggested Control Groups

#### **Visual Customization**

- ☐ Color inactive titlebar
- ☐ Color editor tabs  
- ☐ Color status bar
- ☐ Apply branch color to tabs and status bar

#### **Color Adjustments**

- 🎛️ Activity bar color adjustment (-10 to +10 slider)
- 🎛️ Automatic branch indicator hue rotation (0-359° dial)

#### **Behavior**

- ☐ Remove managed colors when no rules match
- ☐ Invert branch color logic

#### **Advanced**

- 🔧 Reset all colors to default
- 📋 Export/Import configuration
- ❓ Show help and examples

### Control Types Legend

- ☐ = Toggle switch
- 🎛️ = Slider/numeric input  
- 🎨 = Color picker
- 🔧 = Button
- 📋 = File operations
- ❓ = Help/info

## Design Decisions

### Confirmed Requirements

1. **Color Picker**: Use VS Code's built-in color picker API for native feel
2. **Preview**: Real-time preview - changes immediately reflected in VS Code window
3. **Rule Format**: Separate columns for easier editing (not raw format strings)
4. **Reordering**: Both drag & drop AND up/down buttons for maximum flexibility
5. **Validation**: Validate rules 500ms after user stops typing (debounced)

### Open Questions

1. **Export/Import**: Would you like export/import functionality for sharing configurations?
2. **Undo/Redo**: Should we implement undo/redo functionality within the webview?
3. **Mobile/Responsive**: Do we need to consider different screen sizes or is desktop-only acceptable?

## Current Status

- [ ] **Planning Phase** - In progress
- [ ] **Implementation** - Not started  
- [ ] **Testing** - Not started
- [ ] **Documentation** - Not started

---

*Last updated: September 25, 2025*
*Next milestone: Complete Phase 1 - Webview Foundation*
