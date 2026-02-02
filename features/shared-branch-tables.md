# Shared Branch Tables Feature

## Overview

Enable users to create and manage multiple shared branch rule tables that can be referenced by multiple repository rules, extending beyond the single "Global" table currently available.

## Current State

- **Global Branch Rules**: A single shared table used by all repo rules when `useGlobalBranchRules: true`
- **Local Branch Rules**: Each repo rule can have its own `branchRules` array when `useGlobalBranchRules: false`
- **Limitation**: No way to share custom branch rule sets across multiple repos without duplicating them

## Proposed Solution

Replace the boolean `useGlobalBranchRules` flag with a named table reference system where **all** branch rules live in shared tables. Every repo rule references a table by name - there is no separate "local" storage. Tables with a usage count of 1 are effectively private to that repo, while tables used by multiple repos are shared.

---

## Data Model

### Settings Structure

```json
{
  "windowColors.sharedBranchTables": {
    "Global": {
      "fixed": true,
      "rules": [
        { "pattern": "main|master", "color": "#blue", "enabled": true },
        { "pattern": "feature/.*", "color": "#green", "enabled": true }
      ]
    },
    "Feature Branches": {
      "fixed": false,
      "rules": [
        { "pattern": "feature/.*", "color": "#green", "enabled": true },
        { "pattern": "feat/.*", "color": "#green", "enabled": true }
      ]
    },
    "Release Branches": {
      "fixed": false,
      "rules": [
        { "pattern": "release/.*", "color": "#orange", "enabled": true },
        { "pattern": "hotfix/.*", "color": "#red", "enabled": true }
      ]
    }
  },
  "windowColors.repoRules": [
    {
      "repoQualifier": "myrepo",
      "primaryColor": "#blue",
      "branchTableName": "Global"  // References shared table (used by many)
    },
    {
      "repoQualifier": "otherrepo",
      "primaryColor": "#red",
      "branchTableName": "Feature Branches"  // References shared table (used by multiple)
    },
    {
      "repoQualifier": "specialrepo",
      "primaryColor": "#green",
      "branchTableName": "specialrepo-branches"  // References shared table (usage count: 1)
    }
  ]
}
```

### Branch Table Structure

Each entry in `sharedBranchTables` is an object with:

- **`fixed`** (boolean): If `true`, table cannot be deleted or renamed (e.g., Global). Default: `false`
- **`rules`** (array): Array of branch rule objects with `pattern`, `color`, `enabled` properties

**Benefits of `fixed` flag**:

- Eliminates hard-coded "Global" name checks throughout codebase
- Allows defining additional fixed tables in the future if needed
- Clear semantic meaning in code: `if (!table.fixed)` vs `if (tableName !== 'Global')`

### Repo Rule Changes

- **Remove**: `useGlobalBranchRules: boolean`
- **Remove**: `branchRules: BranchRule[]` (no longer stored on repo rules)
- **Add**: `branchTableName: string`
  - Value is the name of a table in `sharedBranchTables`
  - Every repo rule references a shared table by name
  - Tables with usage count of 1 are effectively private

### Migration Strategy

**Legacy String Format** (if needed):

The original extension used a string-based configuration format (e.g., `"reponame:color"`). That format only supported a single global branch rules list. Migration from that format is already handled by existing migration code in `extension.ts` (`migrateConfigurationToJson()`), which converts strings to JSON objects.

**Current (Unreleased) Format → New Format**:

Since the current architecture with `useGlobalBranchRules` and per-repo `branchRules` arrays has never been released, **no migration is required**. The new format will be the first release of the advanced mode architecture.

**For New Installations**:

```javascript
// Ensure sharedBranchTables exists with Global table
if (!config.sharedBranchTables) {
  config.sharedBranchTables = {
    'Global': {
      fixed: true,
      rules: config.branchRules || []
    }
  };
}

// Set default table reference for any repo rules without one
config.repoRules?.forEach(rule => {
  if (!rule.branchTableName) {
    rule.branchTableName = "Global";
  }
  
  // Clean up any unreferenced fields from development
  delete rule.useGlobalBranchRules;
  delete rule.branchRules;
});
```

**Note**: Migration from legacy string format to the new shared tables format will go through the existing JSON migration first, then apply these defaults.

---

## User Interface

### 1. Branch Table Column (Repository Rules Table)

**Current**: "Branch Mode" column with dropdown showing:

- Global
- Local

**New**: "Branch Table" column with dropdown showing:

- **Global** (always first, with icon/badge indicating it's default)
- **[All Other Tables]** (alphabetically sorted, with usage count badge)
  - Feature Branches (3)
  - Release Branches (2)
  - myrepo-branches (1) ← effectively "private" to one repo
- **➕ Create New Table...** (always last)

**Visual Indicators**:

- `$(globe)` Global (system default)
- `$(table)` All other shared tables (with usage count badge)

**Tooltips**:

- Hovering over a table name in the dropdown shows which repo rules use it
- Example tooltip: "Used by: myproject, otherproject, specialproject"
- Shows up to 5 repo qualifiers, with "...and X more" if more exist
- Helps users understand the impact before selecting a table

### 2. Creating New Table

**Trigger**: User selects "➕ Create New Table..." from dropdown

**Workflow**:

1. Show input dialog:

   ```
   ┌─────────────────────────────────────────┐
   │ Create New Branch Table                 │
   ├─────────────────────────────────────────┤
   │ Name: [____________________________]    │
   │                                         │
   │ [ ] Start with copy of current table    │
   │                                         │
   │ [ Cancel ]  [ Create Table ]            │
   └─────────────────────────────────────────┘
   ```

2. **Validation**:
   - Name cannot be empty
   - Name cannot be "Global" (reserved for system default)
   - Name must be unique (not already exist in `sharedBranchTables`)
   - Trim leading/trailing whitespace

3. **Action**:
   - Create new entry in `sharedBranchTables[name]`:
     - If checkbox checked: Copy rules from current table
     - If unchecked: Start with empty array `[]`
   - Update repo rule: `branchTableName = name`
   - Select the new table in dropdown
   - Show success message: "Created table '[name]'"

### 3. Shared Tables Management UI

**Location**: New dedicated tab in the configuration webview (separate from Rules/Profiles/Help tabs)

**Tab Name**: "Branch Tables"

**Display**: Table showing all shared tables with management actions

```
┌──────────────────────────────────────────────────────────────┐
│ Shared Branch Tables                          [ + New Table ] │
├──────────────────────────────────────────────────────────────┤
│ Name               | Rules | Used By | Actions                │
├────────────────────┼───────┼─────────┼────────────────────────┤
│ $(globe) Global    │   5   │    8    │ [Select] [View Usage]  │
│ $(table) Feature Branches│   3   │    4    │ [Select] [Rename] [...] │
│ $(table) Release Branches│   2   │    1    │ [Select] [Rename] [...] │
│ $(table) Hotfix Rules    │   4   │    0    │ [Select] [Rename] [Del]│
└──────────────────────────────────────────────────────────────┘
```

**Rationale**: Other tabs (Rules, Profiles) already use most screen real-estate, so a dedicated tab provides enough room for table management.

**Tooltips**:

- Hovering over the "Used By" count shows a tooltip listing all repo qualifiers that use this table
- Example: Hovering over "8" in Global row shows "myproject, otherproject, frontend, backend, api, mobile, web, desktop"
- For tables with 0 usage: "Not used by any repository rules"
- Provides quick visibility without needing to click "View Usage"

**Actions**:

- **Select**: Navigates to the Rules tab and selects a repo rule that references this table for editing
  - **Disabled** if "Used By" count is 0 (no repo rules reference this table)
  - **Selection Logic** (intelligent context-aware selection):
    1. If currently selected repo rule references this table → switch to Rules tab (table already loaded)
    2. Else if workspace matching rule references this table → select it and switch to Rules tab
    3. Else → select any repo rule that references this table and switch to Rules tab
  - The existing branch rules editor on the Rules tab is used (no duplicate editor needed)
  - User can view/edit/add/remove rules using the familiar UI
- **Rename**: Change the table name (updates all repo rule references)
  - Only available if `fixed: false`
  - Tables with `fixed: true` cannot be renamed
  - Shows inline rename dialog
  - Validates new name (unique, not already in use)
- **View Usage**: Shows which repo rules reference this table
  - Could be tooltip, inline expansion, or modal
  - Lists repo qualifiers that use this table
- **Delete** (...menu or icon):
  - Only available if "Used By" count is 0
  - Cannot delete "Global" table
  - Shows confirmation dialog before deletion

### 4. Switching Between Tables

**Simple Direct Switch**:

- All switches are direct - just update `branchTableName` to selected table
- No confirmation needed
- If user wants to preserve current table's rules:
  1. First use "Create New Table" with "copy current" option
  2. Then switch to the desired table

**Sharing Behavior**:

- To share rules with another repo: Just select the same table name
- To stop sharing: Create new table (copy current), then switch to it
- Usage count updates automatically when repos switch tables

### 5. Deleting Shared Tables

**Manual Deletion** (from management UI):

- Delete button only available when `fixed: false` AND usage count is 0
- Tables with `fixed: true` (like Global) cannot be deleted
- Confirmation dialog: "Are you sure you want to delete '[name]'? This cannot be undone."
- Users can manage unused tables from the Branch Tables tab at their convenience

---

## Validation Rules

1. **Table Names**:
   - Cannot be empty or whitespace-only
   - Cannot be "Global" (reserved for system default)
   - Must be unique within `sharedBranchTables`
   - Trim leading/trailing whitespace
   - Suggested max length: 50 characters

2. **References**:
   - Every `branchTableName` must reference an existing key in `sharedBranchTables`
   - Orphaned references should fallback to "Global" with warning logged

3. **Fixed Tables**:
   - Tables with `fixed: true` cannot be deleted
   - Tables with `fixed: true` cannot be renamed
   - Global table always has `fixed: true`
   - Global table must always be present in `sharedBranchTables`
   - If Global missing, recreate with `fixed: true` and default/empty rules

4. **Deletion**:
   - Cannot delete a table if `fixed: true`
   - Cannot delete a table if any repo rule references it (usage count > 0)

---

## Backend Implementation

### Configuration Provider Changes

**Methods to Add/Modify**:

```typescript
// Get rules for a specific repo
getBranchRulesForRepo(repoRuleIndex: number): BranchRule[] {
  const rule = this.repoRules[repoRuleIndex];
  if (!rule) return [];
  
  const tableName = rule.branchTableName || 'Global';
  const table = this.sharedBranchTables[tableName] || this.sharedBranchTables['Global'];
  return table?.rules || [];
}

// Create new shared table
createSharedTable(tableName: string, initialRules: BranchRule[] = []): boolean {
  // Validation
  if (!tableName) return false;
  if (this.sharedBranchTables[tableName]) return false;
  
  // Create table (user-created tables are not fixed)
  this.sharedBranchTables[tableName] = {
    fixed: false,
    rules: initialRules
  };
  return true;
}

// Delete shared table
deleteSharedTable(tableName: string): boolean {
  const table = this.sharedBranchTables[tableName];
  if (!table) return false;
  
  // Cannot delete fixed tables
  if (table.fixed) return false;
  
  // Cannot delete if in use
  if (this.getTableUsageCount(tableName) > 0) return false;
  
  // Remove from sharedBranchTables
  delete this.sharedBranchTables[tableName];
  return true;
}

// Rename shared table
renameSharedTable(oldName: string, newName: string): boolean {
  const table = this.sharedBranchTables[oldName];
  if (!table) return false;
  
  // Cannot rename fixed tables
  if (table.fixed) return false;
  
  // Validate new name
  if (!newName || this.sharedBranchTables[newName]) return false;
  
  // Update all repo rules that reference oldName
  this.repoRules.forEach(rule => {
    if (rule.branchTableName === oldName) {
      rule.branchTableName = newName;
    }
  });
  
  // Move table data
  this.sharedBranchTables[newName] = table;
  delete this.sharedBranchTables[oldName];
  return true;
}

// Get usage count for a shared table
getTableUsageCount(tableName: string): number {
  return this.repoRules.filter(r => r.branchTableName === tableName).length;
}

// Find best repo rule to select for a given table (for "Select" button in management UI)
findBestRepoRuleForTable(tableName: string, currentSelectedIndex?: number, workspaceMatchingIndex?: number): number | null {
  // Get all repo rules that reference this table
  const referencingIndices = this.repoRules
    .map((rule, index) => rule.branchTableName === tableName ? index : -1)
    .filter(index => index !== -1);
  
  if (referencingIndices.length === 0) {
    return null; // No repo rules reference this table
  }
  
  // Priority 1: Currently selected rule already references this table
  if (currentSelectedIndex !== undefined && referencingIndices.includes(currentSelectedIndex)) {
    return currentSelectedIndex;
  }
  
  // Priority 2: Workspace matching rule references this table
  if (workspaceMatchingIndex !== undefined && referencingIndices.includes(workspaceMatchingIndex)) {
    return workspaceMatchingIndex;
  }
  
  // Priority 3: Any rule that references this table
  return referencingIndices[0];
}
```

### Configuration Initialization

```typescript
function initializeConfig(config: Config): Config {
  // Ensure sharedBranchTables exists with Global table
  if (!config.sharedBranchTables) {
    config.sharedBranchTables = {
      'Global': {
        fixed: true,
        rules: config.branchRules || []
      }
    };
  }
  
  // Ensure Global table exists with fixed flag
  if (!config.sharedBranchTables['Global']) {
    config.sharedBranchTables['Global'] = {
      fixed: true,
      rules: []
    };
  } else if (config.sharedBranchTables['Global'].fixed === undefined) {
    // Ensure Global has fixed flag set
    config.sharedBranchTables['Global'].fixed = true;
  }
  
  // Set defaults for repo rules
  config.repoRules?.forEach(rule => {
    // Default to Global if no table specified
    if (!rule.branchTableName) {
      rule.branchTableName = 'Global';
    }
    
    // Clean up any development-only fields
    if (rule.useGlobalBranchRules !== undefined) {
      delete rule.useGlobalBranchRules;
    }
    if (rule.branchRules !== undefined) {
      delete rule.branchRules;
    }
    
    // Validate reference
    if (!config.sharedBranchTables[rule.branchTableName]) {
      console.warn(`Invalid table reference: ${rule.branchTableName}, falling back to Global`);
      rule.branchTableName = 'Global';
    }
  });
  
  return config;
}
```

---

## Webview Implementation---

## Webview Implementation

### State Management

```typescript
// Global state
let currentConfig: {
  repoRules: RepoRule[];
  sharedBranchTables: { [name: string]: { fixed: boolean; rules: BranchRule[] } };
  // ...
};

let selectedSharedTable: string | null = null; // For management UI
```

### Rendering Branch Rules Table

**Current Logic**:

- If repo rule has `useGlobalBranchRules: true`, render `config.branchRules`
- If `useGlobalBranchRules: false`, render `repoRule.branchRules`

**New Logic**:

```typescript
function renderBranchRulesForSelectedRepo() {
  const rule = currentConfig.repoRules[selectedRepoRuleIndex];
  const tableName = rule.branchTableName || 'Global';
  
  const table = currentConfig.sharedBranchTables[tableName] || 
                currentConfig.sharedBranchTables['Global'];
  const rules = table?.rules || [];
  
  const usageCount = getTableUsageCount(tableName);
  
  // Render with appropriate header/context
  renderBranchRules(rules, tableName, usageCount);
}
```

### Dropdown Rendering

```typescript
function renderBranchTableDropdown(repoRuleIndex: number): string {
  const rule = currentConfig.repoRules[repoRuleIndex];
  const currentTable = rule.branchTableName || 'Global';
  
  // Build options
  let options = [];
  
  // Global (always first)
  options.push({
    value: 'Global',
    label: '$(globe) Global',
    selected: currentTable === 'Global'
  });
  
  // All other tables (sorted alphabetically)
  const otherTables = Object.keys(currentConfig.sharedBranchTables)
    .filter(name => name !== 'Global')
    .sort();
  
  otherTables.forEach(name => {
    const count = getTableUsageCount(name);
    options.push({
      value: name,
      label: `$(table) ${name} (${count})`,
      selected: currentTable === name
    });
  });
  
  // Create new table (always last)
  options.push({
    value: '__CREATE__',
    label: '$(add) Create New Table...',
    selected: false
  });
  
  // Render select element
  return `<select>...</select>`;
}
```

  let options = [];
  
---

## New Repo Rule Creation

**Default Table Assignment**:

When creating a new repository rule:

1. **If no repo rule is currently selected**:
   - Default to `branchTableName: "Global"`

2. **If a repo rule is currently selected**:
   - Default to same table as the selected repo rule
   - Example: Selected rule uses "Feature Branches" → new rule defaults to "Feature Branches"
   - Rationale: User is likely working with similar repos and wants consistent branch rules

**User can then**:

- Keep the default table
- Select a different existing table from dropdown
- Create a new table via "➕ Create New Table..."

---

## Import/Export

**Export**: Include `sharedBranchTables` in exported config

```json
{
  "repoRules": [...],
  "sharedBranchTables": {
    "Global": [...],
    "Custom Table": [...]
  },
  "otherSettings": {...}
}
```

**Import**:

- Imported configuration **replaces** existing configuration entirely
- Simple and predictable behavior
- Users should export their current config before importing if they want to preserve it
- **Future Enhancement**: Add merge/conflict resolution options

---

## Design Decisions

1. **Import behavior**: Imported config entirely replaces existing config
   - Simple and predictable
   - Users can export before importing to preserve current config
   - Merging support deferred to future enhancements

2. **Editing shared tables**: No special warnings or confirmations required
   - Usage count is already displayed in the UI (e.g., "Feature Branches (3)")
   - Users can see how many repos reference a table
   - Allows for streamlined editing workflow

3. **Duplicating tables**: Satisfied by "copy current table" checkbox in create dialog
   - When creating a new table, users can copy rules from existing table
   - Provides same functionality as explicit "Duplicate" button
   - Simpler UI with fewer actions

4. **Undo/Redo**: Not supported in v1
   - Rely on VS Code's settings undo for now
   - Full undo/redo support deferred to future enhancements

5. **Search/Filter**: Not in v1
   - Tables shown in alphabetical order
   - Search/filter deferred to future enhancements for large workspaces

6. **Table descriptions**: Not in v1
   - Table names should be descriptive enough for v1
   - Optional description field deferred to future enhancements

---

## Implementation Phases

### Phase 1: Core Data Model

- [ ] Add `sharedBranchTables` to configuration type
- [ ] Remove `branchRules` array from `RepoRule` type
- [ ] Implement migration from `useGlobalBranchRules` + `branchRules` to `branchTableName`
- [ ] Auto-create unique table names from `repoQualifier` during migration
- [ ] Update `getBranchRulesForRepo()` to always use `sharedBranchTables`
- [ ] Add validation for table references

### Phase 2: Basic UI

- [ ] Update "Branch Mode" column to "Branch Table"
- [ ] Render dropdown with Global + all tables + Create option
- [ ] Show usage counts with codicon icons ($(globe) for Global, $(table) for others)
- [ ] Handle table selection changes
- [ ] Update branch rules rendering to show table name and usage context
- [ ] Implement new repo creation logic (default to Global or copy selected)

### Phase 3: Create Table Feature

- [ ] Add "➕ Create New Table..." to dropdown
- [ ] Implement creation dialog with name input
- [ ] Add "copy current table" checkbox option
- [ ] Create table in `sharedBranchTables`
- [ ] Update repo rule to reference new table
- [ ] Validation for unique names

### Phase 4: Management UI

- [ ] Add new "Branch Tables" tab to configuration webview
- [ ] Show all tables with usage counts in table format
- [ ] Implement "Select" button to navigate to Rules tab with table selected
- [ ] Implement rename functionality (inline edit, updates all references)
- [ ] Implement delete functionality (only when usage = 0, cannot delete Global)
- [ ] Add "View Usage" to show which repos use each table (tooltip/modal)
- [ ] Add "+ New Table" button in management UI

### Phase 5: Polish

- [ ] Usage count badges and visual indicators
- [ ] Import/export support
- [ ] Tooltips for table usage information

---

## Testing Scenarios

1. **Initialization** (No Migration Needed):
   - First load: Creates `sharedBranchTables` with Global table
   - Existing `branchRules` array migrated to Global table
   - All repo rules default to `branchTableName: "Global"`
   - Any development fields (`useGlobalBranchRules`, `branchRules`) cleaned up

2. **Creating Tables**:
   - Create table with unique name → success
   - Try to create with duplicate name → validation error
   - Try to create with "Global" name → validation error
   - Create with "copy current" checked → rules copied from current table
   - Create with "copy current" unchecked → empty array

3. **Switching Tables**:
   - Switch between any two tables → direct switch, no confirmation
   - Usage counts update automatically
   - Branch rules display updates to show new table's rules

4. **Sharing**:
   - Two repos select same table → both see same rules, usage count = 2
   - Edit rules in shared table → both repos see changes
   - One repo switches away → usage count decrements

5. **Deletion**:
   - Try to delete table with `fixed: true` → prevented
   - Try to delete table with usage > 0 → prevented
   - Delete table with `fixed: false` and usage = 0 → succeeds

6. **New Repo Rules**:
   - Create repo with no selection → defaults to Global
   - Create repo with another selected → defaults to that repo's table
   - User can override default via dropdown

7. **Edge Cases**:
   - Orphaned reference (table deleted outside migration) → fallback to Global with warning
   - Empty Global table → works fine
   - Table name with whitespace → trimmed
   - Very long table name → truncated or validated

8. **Rename**:
   - Rename table with `fixed: false` → all repo rules referencing it update automatically
   - Try to rename table with `fixed: true` → prevented
   - Cannot rename to existing table name

---

## Future Enhancements (Out of Scope for v1)

- **Import/Export enhancements**:
  - Merge imported config with existing (conflict resolution)
  - Import/export individual tables
  - Import with table renaming options
- **Table management**:
  - Table descriptions/notes field
  - Search/filter for large table lists
  - Drag-and-drop to reorder tables
  - Explicit "Duplicate" button in management UI
- **Undo/Redo**: Full operation history for table create/rename/delete
- **Bulk operations**: Apply table to multiple repos at once
- **Table templates/presets**: Common branch rule sets
- **Table versioning/history**: Track changes over time
- **Merge tables**: Combine rules from multiple tables
- **Share tables across workspaces**: Via cloud/file sync
