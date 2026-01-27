# Advanced Mode Requirements

## Overview: Profiles vs Simple Mode

**Important:** Profiles are completely independent from the simple mode `repoColor` and `branchColor` settings defined in repository or branch rules. When you use a profile name in a rule (e.g., `my-repo:ProfileName`), the extension **only** uses the profile's palette and mappings. The profile's palette slots that are set to "repoColor" or "branchColor" sources are NOT related to any colors defined in simple mode rules—they are separate palette slot sources within the profile system.

In simple mode, rules like `my-repo:blue` use the extension's built-in color derivation logic. In profile mode, rules like `my-repo:MyProfile` use the profile's custom palette and mappings exclusively.

---

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

*Note: Each slot can be set to a **Fixed Hex**, **Repo Color Source** (inherits from profile's repoColor palette slot), **Branch Color Source** (inherits from profile's branchColor palette slot), or **Transparent**. These "Repo Color" and "Branch Color" sources are palette slot references within the profile system, not references to simple mode colors.*

---

## 2. Colorable Sections & Elements

The UI allows mapping the following VS Code elements to one of the 10 Palette Slots (or "None").

### Section A: Title Bar

* `titleBar.activeBackground`
* `titleBar.activeForeground`
* `titleBar.inactiveBackground`
* `titleBar.inactiveForeground`
* `titleBar.border`

### Section B: Activity Bar

* `activityBar.background`
* `activityBar.foreground`
* `activityBar.inactiveForeground`
* `activityBar.border` (optional)

### Section C: Status Bar

* `statusBar.background`
* `statusBar.foreground`
* `statusBar.border` (optional)

### Section D: Editor Tabs & Breadcrumbs

* **Tabs:**
  * `tab.activeBackground`
  * `tab.activeForeground`
  * `tab.inactiveBackground`
  * `tab.inactiveForeground`
  * `tab.hoverBackground`
  * `tab.unfocusedHoverBackground`
  * `tab.activeBorder`
  * `editorGroupHeader.tabsBackground`
* **Breadcrumbs:**
  * `breadcrumb.background`
  * `breadcrumb.foreground`

### Section E: Command Center (Top Search)

* `commandCenter.background`
* `commandCenter.foreground`
* `commandCenter.activeBackground`
* `commandCenter.activeForeground`

### Section F: Terminal Surface

* `terminal.background`
* `terminal.foreground`

### Section G: Panels & Lists (Advanced)

* **Panel Container:**
  * `panel.background`
  * `panel.border`
  * `panelTitle.activeForeground`
  * `panelTitle.inactiveForeground`
  * `panelTitle.activeBorder`
* **Lists (Explorer/Terminal Lists):**
  * `list.activeSelectionBackground`
  * `list.activeSelectionForeground`
  * `list.inactiveSelectionBackground`
  * `list.inactiveSelectionForeground`
  * `list.focusOutline`
  * `list.hoverBackground`
  * `list.hoverForeground`
* **Badges:**
  * `badge.background`
  * `badge.foreground`
  * `panelTitleBadge.background`
  * `panelTitleBadge.foreground`
* **Inputs:**
  * `input.background`
  * `input.foreground`
  * `input.border`
  * `input.placeholderForeground`
  * `focusBorder`

### Section H: Side Bar (File Explorer)

* **Side Bar Container:**
  * `sideBar.background`
  * `sideBar.foreground`
  * `sideBar.border`
* **Headers:**
  * `sideBarTitle.foreground`
  * `sideBarSectionHeader.background`
  * `sideBarSectionHeader.foreground`

### Section I: Editor Surface

* **Main Editor:**
  * `editor.background`
  * `editor.foreground`
* **Decorations:**
  * `editor.lineHighlightBackground`
  * `editorCursor.foreground`
  * `editorLineNumber.foreground`
  * `editorLineNumber.activeForeground`

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

**Important:** When using profiles, the simple mode `repoColor` and `branchColor` are ignored. Profiles define their own complete color system.

* **Profile-Only Rule**: `my-repo:ProfileName` -> Uses the profile with default palette slot values.
* **Profile with Repo Override**: `my-repo:Blue:ProfileName` -> "Blue" is used to populate the profile's "repoColor" palette slot (if any slots reference it).
* **Profile with Both Overrides**: `my-repo:Blue/Red:ProfileName` -> "Blue" populates the profile's "repoColor" slot, "Red" populates the "branchColor" slot.

**Note:** These color overrides are applied to the profile's palette sources, not mixed with simple mode coloring.
