# Git Repo Window Colors

**Never lose track of which repository you're working in again.**

Transform your VS Code experience by applying distinctive colors to your workspace based on the Git repository you have open. Perfect for developers juggling multiple projects, this extension provides instant visual identification across all your VS Code windows.

> ⚠️ **[PRERELEASE WARNING](#️-prerelease-warning)** - Please read if considering installing a prerelease version

---

## 🆕 What's New

### 🎨 Modern Configuration Editor

- Brand new visual configuration interface
- **Advanced Color Profiles** for complete UI customization (optional)
- Support for non-repository folders
- Drag & drop rule reordering for priority-based matching
- Built-in color picker with support for hex, RGB, HSL, and named colors (with autocomplete)
- Real-time validation and error handling
- Smart tooltips and contextual help throughout the interface
- Preview configurations without opening every workspace.

### Status Bar Icon Integration

- Optional status bar icon (palette symbol)
- Configurable visibility: show always or only when no rules match
- One-click access to configuration editor

---

## ⚡ Configuration Editor UI

The configuration editor has multiple tabs.  Each tab has dedicate context sensitive help documentation available from the help icon at the top right.

### The Rules Tab

Define repository-specific color rules and assign branch tables. Rules are matched in priority order against your repository URL or local folder path.

![alt](https://github.com/mgfarmer/git-repo-window-colors/blob/master/img/rules_tab.png?raw=true)

### The Branch Tables Tab

Manage reusable sets of branch rules that can be shared across multiple repositories. Perfect for consistent branch coloring across related groups of repositories.

![alt](https://github.com/mgfarmer/git-repo-window-colors/blob/master/img/branch_tab.png?raw=true)

### The Profiles Tab

Build advanced color profiles with fine-grained control over individual VS Code UI elements. Profiles can be referenced by name in any rule.

![alt](https://github.com/mgfarmer/git-repo-window-colors/blob/master/img/profile_tab.png?raw=true)

### The Color Report Tab

View a comprehensive report of all active color customizations in your current workspace, useful for debugging and understanding which rules are being applied.

![alt](https://github.com/mgfarmer/git-repo-window-colors/blob/master/img/color_tab.png?raw=true)

---

## 🔍 Live Preview Feature

**Test your color configurations instantly without opening different workspaces!**

The extension now includes a powerful preview feature that lets you see how your color rules will look without the need to open each repository or switch branches.

### How It Works

When you select any repository rule or branch rule in the configuration editor, simply enable the **Preview Selected Rules** checkbox (located in the Other Settings section). The extension will immediately apply the colors from that rule to your current workspace, giving you an instant preview of how the configuration will look.

**Key Benefits:**

- ✅ **No workspace switching needed** - Preview all your rules from a single workspace
- ✅ **Instant feedback** - See color changes in real-time as you adjust rules
- ✅ **Easy comparison** - Quickly switch between different rules to compare color schemes

### Using Preview Mode

1. Open the configuration editor
2. Enable the **Preview Selected Rules** checkbox in the Other Settings section
3. Navigate to the Rules or Branch Tables tab
4. Click on any repository rule or branch rule to select it
5. The colors from that rule will immediately apply to your workspace

**Preview Indicator:** When in preview mode, you'll see a "PREVIEW MODE" badge at the top of the configuration editor to remind you that you're viewing preview colors, not the actual workspace colors.

**Note:** Preview mode is a temporary visualization tool. Your actual color rules will still match based on your repository URL and branch name when preview mode is disabled.

---

## ⚡ Why You Need This

**The Problem:** You're a productive developer with many VS Code windows open across different repositories. They all look identical. You waste precious seconds (or minutes, or YEARS!) figuring out which window contains which project.

**The Solution:** Automatic, intelligent color-coding that makes every repository instantly recognizable at a glance.

✅ **Instant Recognition** - Spot the right window immediately  
✅ **Highly Customizable** - Fine-tune colors for your workflow  
✅ **Branch-Aware** - Different colors for feature branches, hotfixes, etc.  
✅ **Taskbar** - Colored thumbnails in Windows/Mac/Linux dock previews  

---

## 🚀 Quick Start

### 1. Install & Configure

1. **Install** the extension from VS Code marketplace
2. **Open a git repo** the extension will ask if you want to colorize this repo. (Hint: Answer 'Yes')
3. **Done!** Your workspace now has a unique color identity
4. **Open the Config Editor** Click the palette icon in the status bar
5. **More!** Tune the color to your liking, click on the color swatch

### 2. Recommended VS Code Settings

These global settings are required for the best visual experience:

```json
{
    "window.titleBarStyle": "custom",
    "workbench.colorCustomizations": {
        "window.customTitleBarVisibility": "auto"
    }
}
```

The extension will check these settings an offer to set them for you.

---

## 💡 How It Works

### Repository Rules (Primary Feature)

Configure colors for specific repositories. Rules are matched in priority order:

- **Repository Qualifier:** Part of your repo URL (e.g., `my-project`, `github.com/company/app`)
- **Primary Color:** Main window color for this repository (can be a simple color OR a profile name)
- **Branch Rules:** Configure local or global branch rules for branch-specific coloring (see Branch Rules section below)

### Branch Rules (Advanced Feature)

Create patterns that work across ALL repositories:

- **Pattern:** Regular expression matching branch names
- **Color:** Applied when pattern matches (can be a simple color OR a profile name)

**Examples:**

- `feature/.*:purple` → All feature branches, regardless of repository, are purple
- `hotfix.*:red` → All hotfix branches, regardless of repository, are red
- `JIRA-123.*:orange` → Specific ticket work, regardless of repository, is orange

Just like Repo Rules, you can tune the color to your preferences.

Unlike Repo Rules, which use a simple string.includes() pattern, Branch Rules are regular expressions
able to match any complex branch naming strategy.

---

## 🎨 Color Profiles

**Note:** Profiles are an **optional advanced feature** for users who want more control over their workspace appearance. The existing simple color-based system continues to work exactly as before - no changes required to your current configuration!

### What Are Profiles?

Color Profiles provide a comprehensive way to define more complex color schemes for your VS Code workspace. Instead of applying a single color and letting the extension automatically derive colors for a small set of UI elements, profiles give you **precise control** over many more UI elements.

**When to Use Profiles:**

- ✅ You want consistent color schemes across multiple repositories
- ✅ You want specific colors for different UI elements (title bar, activity bar, tabs, etc.)
- ✅ You want to reuse color schemes across different branches or repositories

**When to Use Simple Colors:**

- ✅ You just want quick, automatic coloring (recommended for most users)
- ✅ You're happy with the extension's smart color derivation
- ✅ You prefer simplicity over granular control

### How Profiles Work

1. **Create a Profile** - Define a palette of colors and map them to 60+ VS Code UI elements
2. **Reference the Profile** - Use the profile name in repository or branch rules instead of a color
3. **Automatic Application** - The profile applies whenever that rule matches

**Example:** Create a "Blue Corporate" profile that matches your company branding, then reference it across multiple repositories:

``` text
Repository Rules:
- company-org/frontend:Blue Corporate
- company-org/backend:Blue Corporate
- company-org/mobile:Blue Corporate
```

### Profile Components

Each profile consists of two parts:

**1. Palette Slots** (your base colors)

- Primary Active Background & Foreground
- Primary Inactive Background & Foreground  
- Secondary Active Background & Foreground
- Secondary Inactive Background & Foreground
- Tertiary Background & Foreground (for accent colors)
- Quartenary Background & Foreground (for accent colors)

**2. Mappings** (which palette colors go where)

- Title bar colors
- Activity bar colors
- Status bar colors
- Editor tabs colors
- And 60+ other VS Code UI elements

### Creating Profiles in the UI

1. Open the configuration editor (click status bar icon or use Command Palette)
2. Navigate to the **"Profiles"** tab
3. Click **"+ Add Profile"** to create a new profile
4. Set up your **Palette** - define your reference colors
5. Configure **Mappings** - assign palette colors to VS Code UI elements

**Pro Tips:**

- Use the color picker or enter color values directly
- Set opacity on individual UI elements for subtle effects
- Leave mappings set to "none" to use VS Code's default colors
- Use the palette generator to create full palettes from a singe primary background color

### Using Profiles in Rules

Once you've created a profile, simply reference it by name in your rules.  The autocomplete dropdown will list all matching profiles at the top of the list.

**Repository Rules:**

```
myrepo:My Profile Name
```

**Branch Rules:**

```
feature/.*:Feature Profile
hotfix.*:Hotfix Profile
```

**Combined (Repository Profile + Branch Profile):**

```
Repository: myrepo:Base Profile
Branch: feature/.*:Feature Overlay
```

When both are specified, the branch profile **overrides** colors from the repository profile, allowing you to have a base color scheme with branch-specific variations.

### Profile Precedence & Mixing

You can mix and match simple colors with profiles:

- **Repo Color + Branch Profile** ✅ Base colors use simple color logic, branch profile overlays specific elements
- **Repo Profile + Branch Profile** ✅ Branch profile overrides specific colors from repo profile
- **Simple Colors Only** ✅ Traditional mode, works exactly as before

### Example Use Cases

#### Case 1: Consistent Team Branding**

``` text
Create "Company Blue" profile → Reference in all company repos
```

#### Case 2: Feature Branch Highlighting**

``` text
Repo uses simple blue → Feature branches use "Feature Work" profile
Result: Most of the time simple blue, but feature branches get special highlighting
```

#### Case 3: Project-Specific Schemes**

``` text
Frontend repos: "Light Theme" profile
Backend repos: "Dark Theme" profile  
DevOps repos: "Terminal Focus" profile
```

#### Case 4: Branch Type Indication**

``` text
Base Repo: "Standard" profile
Hotfix branches: "Alert Red" profile (overrides critical elements)
Release branches: "Calm Green" profile (overrides with soothing colors)
```

### Migration Path

**Existing users:** Your current simple color configuration continues to work with zero changes. Try profiles when you're ready for more control.

**New users:** Start with simple colors (just click "Colorize this repo"). Explore profiles later when you want more customization.

---

## 🎨 Configuration Interface

### Modern, Intuitive UI

- **Visual Rule Builder** - No JSON editing
- **Drag & Drop Reordering** - Priority-based rule matching
- **Drag & Drop Color Assigments** - easily assign palette colors to UI elements
- **Built-in Color Picker** - Supports hex, RGB, HSL, named colors
- **HTML Color Autocomplete** - Intelligent suggestions for all 140 standard HTML color names with visual previews
- **Real-time Preview** - See changes instantly for your current workspace.

### Color Input Features

When entering colors in text fields:

- **Smart Autocomplete** - Type any part of a color name (e.g., "blue", "dark", "light") to see matching suggestions
- **Visual Color Preview** - Each autocomplete suggestion includes a color swatch for instant recognition
- **Random Color Generator** - If specifying a color is too much work, just shift-clik the color swatch!

---

## 🔧 Command Palette

Quick access to essential functions:

| Command | Purpose |
|---------|---------|
| `GRWC: Open Configuration` | Open full configuration UI *(recommended)* |
| `GRWC: Colorize this repo` | Quick-add current repository with a random color |
| `GRWC: Decolorize this repo` | Remove the rule that colorizes for current repository |
| `GRWC: Export Configuration` | Export all settings to JSON file |
| `GRWC: Import Configuration` | Import settings from JSON file |

---

## ⚙️ Advanced Features

### Smart Color Management

- **Theme Integration** - Works with light and dark themes. When random colors are generated the current theme is considered to ensure that text remains readable.

### Status Bar Integration

- **Visual Repository Indicator** - Optional status bar icon with color palette icon (on by default)
- **Smart Visibility Control** - Configure when the icon appears:
  - Always visible for Git repositories, or
  - Only visible when no repository rules match (helps identify unconfigured repos)
  - Hidden for non-Git workspaces automatically
- **One-Click Access** - Click the status icon to open the configuration editor instantly, if the current repository is not configured a new rule will be created for it using a random color that you can then tune.
- **Contextual Information** - Tooltip shows current repository status

### Multi-Element Coloring

Configure which VS Code elements get colored:

- Simple Color Mode
  - Title bar *(primary)*
  - Activity bar *(recommended)*
  - Editor tabs *(optional)*
  - Status bar *(optional)*
  - Inactive window title *(optional - but highly recommended)*
- Profiles
  - All simple mode elements plus 60+ additional UI elements

### Sync Ready

- **Settings Sync Compatible** - Colors follow you across machines
- **Settings are VSCode Profile Compatible** - Each VSCode profile can have it's onw settings.
- **Team Friendly** - Configurations don't pollute repository settings (unless you commit .vscode/settings.json to the repo). And you can share common configs across your team.

### Configuration Import/Export 🆕

Perfect for **team collaboration** and **standardizing workspace colors** across your organization:

- **Export Complete Configuration** - Save all your repository rules, branch patterns, and settings to a JSON file
- **Automatic Date Stamping** - Exported files include YYMMDD timestamp for easy organization, but feel free to rename it.
- **Smart Import Options** - Choose to replace existing configuration or merge with current settings
- **Team Setup Repository** - Commit configuration files to a shared team repository for consistent colors across all team members
- **One-Click Access** - Import/Export buttons available directly in the configuration interface

**Team Workflow Example:**

1. Team lead configures colors for all company repositories
2. Exports configuration to `team-colors-config-241004.json`
3. Commits the config file to team setup repository
4. Team members import the configuration for instant consistency
5. Everyone has the same visual repository identification system

---

## 📊 Perfect For

- **Full-stack Developers** working across frontend/backend/other repos
- **DevOps Engineers** managing multiple infrastructure projects  
- **Open Source Contributors** juggling personal and work projects
- **Team Leads** reviewing code across multiple repositories
- **Consultants** switching between client projects

---

## 🛠️ Troubleshooting

**Colors not applying?** Check the "Git Repo Window Colors" output channel for diagnostic information.

**Multiple windows same color?** Ensure your repository qualifiers are specific enough to differentiate repositories.  Being able to have a rule that colors multiple repositories is a FEATURE!  For instance, if you work in multiple orgs you can color each org differently.

---

## 💬 Support

**Found a bug?** Include output from the "Git Repo Window Colors" output channel in your issue report.

**Feature request?** We're always looking to make developers more productive!

## ⚠️ PRERELEASE WARNING**  
>
> **If you are considering switching to a prerelease version of this extension, please be aware of this:**
>
> **Prerelease versions of this extension may be unstable and buggy and may iterate rapidly.**
>
> **It is recommended that you do NOT use the prerelease version unless you are actively engaged with the extension developer for testing purposes.**  
>
> **Configuration settings may NOT be preserved when switching to or between prerelease versions.  We will make our best effort to preserve configurations when upgrading to new released versions.**
>
> **Please export your current configuration prior to switching.**
>
---

*Transform your workflow. Install Git Repo Window Colors today and never lose track of your projects again.*

If this extension saves you time and frustration, consider [buying me a coffee](https://www.buymeacoffee.com/KevinMills) ☕
