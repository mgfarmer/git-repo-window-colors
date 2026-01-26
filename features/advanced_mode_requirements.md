# Advanced Mode Requirements

## 1. Reference Palette (The 10 Colors)
The foundational layer of the advanced mode. Users define these ~10 slots, which serve as variables for the rest of the configuration.

| Slot Name | Description | Default Source |
| :--- | :--- | :--- |
| **Primary Active BG** | Main background color (e.g., Title Bar). | `Repo Color` |
| **Primary Active FG** | Main text color on top of Primary BG. | `Contrast(Repo Color)` |
| **Primary Inactive BG** | Background for inactive states (e.g., Inactive Tabs). | `Repo Color` (Darkened) |
| **Primary Inactive FG** | Text color for inactive states. | `Contrast(Inactive BG)` |
| **Secondary Active BG** | Accent background (e.g., Badges, Highlights). | `Branch Color` |
| **Secondary Active FG** | Text color on top of Secondary BG. | `Contrast(Branch Color)` |
| **Secondary Inactive BG** | Subtler accent background. | `Branch Color` (Faded/Darkened) |
| **Secondary Inactive FG** | Text color for subtler accents. | `Contrast(Secondary Inactive)` |
| **Terminal BG** | Specific background for the terminal panel. | Fixed (e.g., `#000000`) |
| **Terminal FG** | Specific text color for the terminal. | Fixed (e.g., `#ffffff`) |

*Note: Each slot can be set to a **Fixed Hex**, **Inherited (Repo/Branch)**, or **Transparent**.*

---

## 2. Colorable Sections & Elements
The UI allows mapping the following VS Code elements to one of the 10 Palette Slots (or "None").

### Section A: Title Bar
*   `titleBar.activeBackground`
*   `titleBar.activeForeground`
*   `titleBar.inactiveBackground`
*   `titleBar.inactiveForeground`
*   `titleBar.border`

### Section B: Activity Bar
*   `activityBar.background`
*   `activityBar.foreground`
*   `activityBar.inactiveForeground`
*   `activityBar.border` (optional)

### Section C: Status Bar
*   `statusBar.background`
*   `statusBar.foreground`
*   `statusBar.border` (optional)

### Section D: Editor Tabs & Breadcrumbs
*   **Tabs:**
    *   `tab.activeBackground`
    *   `tab.activeForeground`
    *   `tab.inactiveBackground`
    *   `tab.inactiveForeground`
    *   `tab.hoverBackground`
    *   `tab.unfocusedHoverBackground`
    *   `tab.activeBorder`
    *   `editorGroupHeader.tabsBackground`
*   **Breadcrumbs:**
    *   `breadcrumb.background`
    *   `breadcrumb.foreground`

### Section E: Command Center (Top Search)
*   `commandCenter.background`
*   `commandCenter.foreground`
*   `commandCenter.activeBackground`
*   `commandCenter.activeForeground`

### Section F: Terminal Surface
*   `terminal.background`
*   `terminal.foreground`

### Section G: Panels & Lists (Advanced)
*   **Panel Container:**
    *   `panel.background`
    *   `panel.border`
    *   `panelTitle.activeForeground`
    *   `panelTitle.inactiveForeground`
    *   `panelTitle.activeBorder`
*   **Lists (Explorer/Terminal Lists):**
    *   `list.activeSelectionBackground`
    *   `list.activeSelectionForeground`
    *   `list.inactiveSelectionBackground`
    *   `list.inactiveSelectionForeground`
    *   `list.focusOutline`
    *   `list.hoverBackground`
    *   `list.hoverForeground`
*   **Badges:**
    *   `badge.background`
    *   `badge.foreground`
    *   `panelTitleBadge.background`
    *   `panelTitleBadge.foreground`
*   **Inputs:**
    *   `input.background`
    *   `input.foreground`
    *   `input.border`
    *   `input.placeholderForeground`
    *   `focusBorder`

### Section H: Side Bar (File Explorer)
*   **Side Bar Container:**
    *   `sideBar.background`
    *   `sideBar.foreground`
    *   `sideBar.border`
*   **Headers:**
    *   `sideBarTitle.foreground`
    *   `sideBarSectionHeader.background`
    *   `sideBarSectionHeader.foreground`

### Section I: Editor Surface
*   **Main Editor:**
    *   `editor.background`
    *   `editor.foreground`
*   **Decorations:**
    *   `editor.lineHighlightBackground`
    *   `editorCursor.foreground`
    *   `editorLineNumber.foreground`
    *   `editorLineNumber.activeForeground`

---

## 3. Configuration & Syntax

### Profile Storage
Profiles are stored in `settings.json` under `windowColors.advancedProfiles`.

```json
"MyFocusTheme": {
  "palette": {
    "primaryActiveBg": { "source": "repoColor" },
    "primaryActiveFg": { "source": "fixed", "value": "#ffffff" },
    "secondaryActiveBg": { "source": "branchColor" }
    // ...
  },
  "mappings": {
    "titleBar.activeBackground": "primaryActiveBg",
    "statusBar.background": "none", // Transparent
    "activityBar.background": "secondaryActiveBg"
    // ...
  }
}
```

### Rule Activation
*   **Standard Rule**: `my-repo:ProfileName` -> Uses the profile. If the profile needs dynamic colors (Repo/Branch) but none are provided, it falls back to defaults.
*   **Hybrid Rule**: `my-repo:Blue:ProfileName` -> "Blue" is passed as `Repo Color`.
*   **Full Rule**: `my-repo:Blue/Red:ProfileName` -> "Blue" is `Repo Color`, "Red" is `Branch Color`.
