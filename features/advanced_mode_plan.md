# Advanced Mode Implementation Plan

## 1. Feature Overview

'Advanced Mode' introduces **Named Profiles**, allowing users to define reusable color schemes. This decouples color definitions from repository rules, enabling granular control over UI elements.

**Key Principle:** Profiles operate independently from simple mode. When a profile is active, it completely replaces the simple mode color derivation logic. Simple mode `repoColor` and `branchColor` settings are not used when a profile is applied—only the profile's own palette and mappings are used.

## 2. Architecture: Two-Layer System

### Layer 1: The Palette (Reference Colors)

A set of abstract "Color Slots" acting as variables.
Each slot can be:

* **Fixed**: A specific hex color (e.g., `#ff0000`).

### Layer 2: Section Mapping

Maps specific VS Code theme keys (keys in `workbench.colorCustomizations`) to one of the **Palette Slots** or **None** (Transparent).
Grouped by sections:

* **Activity Bar**: `activityBar.background`, `activityBar.foreground`
* **Title Bar**: `titleBar.activeBackground`, `titleBar.activeForeground`, etc.
* **Status Bar**: `statusBar.background`, `statusBar.foreground`
* **Tabs**: `tab.activeBackground`, `tab.inactiveBackground`, `tab.hoverBackground`
* **Terminal**: `terminal.background`, `terminal.foreground`
* **Side Bar**: `sideBarTitle.background`

## 3. Data Structures

### Settings Schema (`package.json`)

A new object `windowColors.advancedProfiles` will be added.

```json
"windowColors.advancedProfiles": {
    "type": "object",
    "additionalProperties": {
        "type": "object",
        "properties": {
            "palette": {
                "type": "object",
                "description": "Definitions for the abstract color slots",
                "properties": {
                    "primaryActive": { "type": "string" },
                    "primaryInactive": { "type": "string" },
                    "secondaryActive": { "type": "string" },
                     // ... other slots
                }
            },
            "mappings": {
                "type": "object",
                "description": "Mapping actual VS Code keys to palette slots",
                "properties": {
                    "activityBar.background": { "type": "string", "enum": ["primaryActive", "secondaryActive", "none", ...] },
                    // ... other keys
                }
            }
        }
    }
}
```

### Rule Syntax

Existing `repo:color` syntax matches will remain.
New syntax support for `repo:ProfileName` and `repo:color:ProfileName`.

## 4. User Interface (New Webview)

A dedicated "Advanced Profile Editor" Webview.

### Top Section: Palette Editor

* List of the fixed slots.
* For each slot, a control to choose the type (Fixed/Dynamic) and value.
* Color pickers for fixed values.

### Bottom Section: Mapping Editor

* **Tabs**: Organized by UI Section (Title Bar, Activity Bar, etc.).
* **Content**: List of properties for that section.
* **Controls**: Dropdowns mapping each property to a Palette Slot or "None".

## 5. Implementation Steps

1. **Schema Update**: Add `windowColors.advancedProfiles` to `package.json`.
2. **Logic Update (`src/extension.ts`)**:
    * Parse new rule formats.
    * Implement `resolveProfile(profileName, seedColor)` to generate the final color map.
    * Modify `doit()` to use `resolveProfile` when a profile is detected.
3. **UI Implementation**:
    * Create `AdvancedConfigProvider.ts`.
    * Build HTML/CSS for the split view (Palette vs Mappings).
    * Implement state management for editing profiles.
