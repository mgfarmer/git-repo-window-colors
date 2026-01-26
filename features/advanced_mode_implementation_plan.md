# Advanced Mode Implementation Plan

## Phase 1: Data Structure & Configuration Schema
**Goal:** Define how profiles are stored and validated.

1.  **Schema Definition (`package.json`)**:
    *   Add `windowColors.advancedProfiles` configuration object.
    *   Define validation schema for "Reference Palette" (layer 1) and "Section Mappings" (layer 2).
2.  **TypeScript Interfaces (`src/types/`)**:
    *   Create interfaces for `AdvancedProfile`, `PaletteDefinition`, `SectionMapping`.
    *   Ensure type safety for handling fixed colors vs dynamic references.

## Phase 2: Core Logic & Profile Resolution
**Goal:** Enable the extension to "understand" a profile and generate a color map.

1.  **Rule Parsing Updates (`src/extension.ts`)**:
    *   Update regex/logic to support new rule formats:
        *   `repo:ProfileName`
        *   `repo:Color:ProfileName` (Color acts as the "Seed" for dynamic slots).
2.  **Profile Resolution Engine**:
    *   Implement function `resolveProfile(profile: AdvancedProfile, seedColor: string, branchColor: string): ColorMap`.
    *   **Step A (Palette Resolution):** Calculate actual hex values for the 10 reference slots based on inputs (Fixed hex, or derived from Seed/Branch).
    *   **Step B (Mapping Resolution):** Walk through the Section Mappings and assign the calculated palette colors to the specific VS Code theme keys.
3.  **Integration**:
    *   Update main `doit()` loop to check for profile existence before falling back to legacy logic.

## Phase 3: Advanced Configuration Webview
**Goal:** Provide a UI for users to create and edit profiles.

1.  **Scaffold New Webview**:
    *   Create `src/webview/AdvancedConfigWebview.ts`.
    *   Register command `windowColors.openAdvancedConfig`.
2.  **UI Component: Palette Editor (Top Section)**:
    *   Input fields for the 10 reference slots.
    *   Type selector for each slot: "Fixed Color", "Repo Color", "Branch Color".
    *   Color picker for Fixed types.
    *   Opacity/Lightness modifiers for Derived types.
3.  **UI Component: Mapping Editor (Bottom Section)**:
    *   Tabbed container (Tabs for "Title Bar", "Activities", "Terminal", etc.).
    *   Rows for each VS Code element.
    *   Dropdowns to select one of the 10 Reference Slots (or "Transparent").

## Phase 4: Testing & Polish
1.  **Migration/Compatibility Check**: Ensure existing `repo:color` rules work exactly as before.
2.  **Visual Verification**: Test with various themes (Dark, Light, High Contrast) to ensure transparent fallbacks work.
3.  **Edge Cases**: Handle missing profiles, invalid color strings, and circular dependencies (if any).
