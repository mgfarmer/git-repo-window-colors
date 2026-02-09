import { TourConfig } from './hintUtils';

/**
 * Configuration for the Getting Started tour
 */
export const gettingStartedTour: TourConfig = {
    id: 'gettingStarted',
    commandTitle: 'Getting Started Tour',
    nextTourId: 'profiles',
    steps: [
        {
            targetSelector: '.help-button-global',
            html: `<strong>Help</strong><br>
               You can always get detailed, context-sensitive help by clicking 
               this icon. Each section of the configurator has its own 
               help page with tips and examples.`,
            position: 'bottom',
            maxWidth: 320,
        },
        {
            targetSelector: '.repo-panel',
            tabId: 'rules-tab',
            html: `<strong>Repository Rules - Where You Start</strong><br><br>
               This is the heart of the extension. Each rule matches one or more repositories 
               with a color scheme.<br><br>
               <strong>Getting Started:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Open a workspace containing a git repository</li>
                 <li>Click <strong>+ Add</strong> to create a new rule.</li>
                 <li>The rule will automatically match the current repository.</li>
                 <li>A random color is automatically assigned</li>
                 <li>Click the color swatch to pick a different color</li>
               </ul>
               <strong>Priority Order:</strong><br>
               Rules are matched from top to bottom. Drag rules to reorder them, 
               placing higher priority rules at the top.`,
            position: 'right',
            maxWidth: 420,
        },
        {
            targetSelector: '.color-options-section',
            tabId: 'rules-tab',
            html: `<strong>Color Options - Fine-Tune Your Colors</strong><br><br>
               When using simple fixed colors in your repository rules, these settings 
               let you control which UI elements get colored and add variation to the theme.<br><br>
               <strong>What You Can Control:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li><strong>Color Knob:</strong> Adjust brightness for non-title elements</li>
                 <li><strong>Element Toggles:</strong> Choose which UI elements to color</li>
               </ul>
               <strong>Important:</strong><br>
               These settings only affect repository rules that use simple color values. 
               When using Profile-based coloring, these are controlled by the profile itself.`,
            position: 'top',
            maxWidth: 420,
        },
        {
            targetSelector: '.other-options-section',
            tabId: 'rules-tab',
            html: `<strong>Other Options - Additional Features</strong><br><br>
               These options control helpful extension behaviors:<br><br>
               <strong>Preview Selected Rules:</strong><br>
               When enabled, clicking any repository rule immediately applies its colors 
               to the current workspace. This lets you test how rules look without 
               opening the matching repository.<br><br>
               <strong>Ask to Colorize Repository:</strong><br>
               When enabled, the extension will prompt you to create a color rule whenever 
               you open a workspace with an uncolored repository. This helps ensure all 
               your repositories are color-coded for easy identification.`,
            position: 'top',
            maxWidth: 420,
        },
        {
            targetSelector: '.import-export-buttons',
            tabId: 'rules-tab',
            html: `<strong>Export & Import - Backup and Share</strong><br><br>
               These buttons let you save and restore your entire configuration.<br><br>
               <strong>Export Configuration:</strong><br>
               Save all your rules, profiles, and settings to a JSON file. Perfect for 
               backing up your configuration or sharing it with your team.<br><br>
               <strong>Import Configuration:</strong><br>
               Load a previously exported configuration. This will merge with or replace 
               your existing settings, making it easy to synchronize configurations 
               across multiple machines or adopt team-wide color schemes.`,
            position: 'left',
            maxWidth: 400,
        },
        {
            targetSelector: '.branch-panel',
            tabId: 'rules-tab',
            html: `<strong>Branch Rules - Show When You're On a Branch</strong><br><br>
               Branch rules add visual indicators when you're working on a specific branch. 
               They use <strong>regular expressions</strong> to match branch names.<br><br>
               <strong>Key Concepts:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Multiple branch tables can exist for different workflows</li>
                 <li>Multiple repo rules can share the same branch table</li>
                 <li>The dropdown includes example patterns to get started</li>
                 <li>Create a new table using the <strong>Branch Table</strong> dropdown in a repo rule, select "Create New Table"</li>
               </ul>
               <strong>Priority Order:</strong><br>
               Like repository rules, branches are matched from top to bottom. 
               The first matching pattern applies.`,
            position: 'left',
            maxWidth: 420,
        },
        {
            // No targetSelector - this will be centered on the screen
            tabId: 'rules-tab',
            html: `<strong>Ready to Go!</strong><br><br>
               You now know the basics and can fully utilize this extension for your needs. 
               All the essential features have been covered.<br><br>
               <strong>What's Next?</strong><br>
               You can skip the rest of this tour and start using the extension right away, 
               or continue to learn about <strong>Profiles</strong> — an advanced feature 
               that gives you much more precise control over which UI elements get colored 
               and how they're styled.<br><br>
               Profiles are optional but powerful for users who want fine-grained customization.`,
            maxWidth: 450,
        },
    ],
};

/**
 * Configuration for the Profiles tour (advanced features)
 */
export const profilesTour: TourConfig = {
    id: 'profiles',
    commandTitle: 'Profiles Tour',
    steps: [
        {
            // No targetSelector - this will be centered on the screen
            tabId: 'profiles-tab',
            html: `<strong>Welcome to Profiles!</strong><br><br>
               Profiles give you precise control over VS Code's color scheme. Unlike simple 
               color rules that apply one color everywhere, profiles let you define a 
               <strong>palette of colors</strong> and map them individually to specific 
               UI elements.<br><br>
               <strong>Why Use Profiles?</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Fine-grained control over which elements get colored</li>
                 <li>Create sophisticated, multi-color themes</li>
                 <li>Reuse the same color scheme across multiple repositories</li>
                 <li>Professional, cohesive color coordination</li>
               </ul>`,
            maxWidth: 480,
        },
        {
            targetSelector: '.profiles-list-section',
            tabId: 'profiles-tab',
            html: `<strong>Profiles List</strong><br><br>
               This is where you manage your color profiles. Each profile is a reusable 
               color scheme that can be assigned to repository rules.<br><br>
               <strong>Getting Started:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Click <strong>+ Add</strong> to create a new profile</li>
                 <li>Select a profile to edit its colors and mappings</li>
                 <li>Profiles can be referenced by name in repository rules</li>
               </ul>`,
            position: 'right',
            maxWidth: 400,
        },
        {
            targetSelector: '.palette-editor-section',
            tabId: 'profiles-tab',
            html: `<strong>Reference Palette</strong><br><br>
               Define your color palette here. Each slot can hold a color that you'll 
               map to UI elements below.<br><br>
               <strong>Tips:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Use the <strong>magic wand</strong> button to auto-generate harmonious palettes</li>
                 <li>Click any color slot to pick a custom color</li>
                 <li>Not all slots need to be filled</li>
               </ul>`,
            position: 'bottom',
            maxWidth: 400,
        },
        {
            targetSelector: '#mapping-tab-tabs-breadcrumbs',
            tabId: 'profiles-tab',
            html: `<strong>Mappings - Connect Colors to UI Elements</strong><br><br>
               This is where you assign your palette colors to specific VS Code elements.<br><br>
               <strong>How It Works:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Each section (Title Bar, Status Bar, etc.) can be mapped to a palette slot</li>
                 <li>Choose foreground and background colors independently</li>
                 <li>Leave mappings empty to keep VS Code's default colors</li>
                 <li>Drag & drop to quickly copy mappings between sections</li>
               </ul>`,
            position: 'bottom',
            maxWidth: 450,
        },
        {
            targetSelector: '#mapping-tab-colored',
            tabId: 'profiles-tab',
            html: `<strong>⚡ Colored Tab - Quick Overview</strong><br><br>
               This special tab shows all UI elements you've explicitly colored in your profile, 
               consolidated in one place.<br><br>
               <strong>Why It's Useful:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>See all your color mappings at a glance</li>
                 <li>Quickly review which elements you've customized</li>
                 <li>Easy access to modify any colored element</li>
               </ul>
               This tab updates automatically as you add or remove color mappings in other tabs.`,
            position: 'bottom',
            maxWidth: 400,
        },
        {
            targetSelector: '#mapping-tab-starred',
            tabId: 'profiles-tab',
            html: `<strong>★ Starred Tab - Your Favorites</strong><br><br>
               Pin your most frequently adjusted UI elements here for quick access.<br><br>
               <strong>How to Use:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Click the star icon next to any mapping key to add it here</li>
                 <li>Unstar items by clicking the star again</li>
                 <li>Great for elements you tweak often across different profiles</li>
               </ul>
               Your starred items persist across all profiles, making it easy to find 
               the elements you care about most.`,
            position: 'bottom',
            maxWidth: 420,
        },
        {
            tabId: 'branch-tables-tab',
            html: `<strong>🗂️ Branch Tables - Reference View</strong><br><br>
               This tab shows which branch tables are being used by which repository rules.<br><br>
               <strong>What You Can Do Here:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>View the relationship between repo rules and branch tables</li>
                 <li>See which tables are actually in use</li>
                 <li>Delete unused tables that are no longer needed</li>
                 <li>Quickly reference table contents and assignments</li>
               </ul>
               This is primarily an informational view to help you understand your configuration 
               and clean up unused branch tables.`,
            position: 'bottom',
            maxWidth: 450,
        },
        {
            tabId: 'report-tab',
            html: `<strong>📊 Color Report - See What's Applied</strong><br><br>
               The Color Report shows exactly which colors are currently active in your 
               VS Code window for this repository.<br><br>
               <strong>Use This To:</strong><br>
               <ul style="margin: 8px 0 8px 16px; padding: 0;">
                 <li>Verify your color rules are working as expected</li>
                 <li>Debug why certain colors aren't showing</li>
                 <li>See which branch/repo rules matched</li>
                 <li>Quick reference of your current theme</li>
               </ul>
               This is a diagnostic tool that helps you understand what the extension 
               is doing behind the scenes in real-time.`,
            position: 'bottom',
            maxWidth: 450,
        },
    ],
};
