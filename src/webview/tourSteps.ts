import { TourConfig } from './hintUtils';

/**
 * Configuration for the Getting Started tour
 */
export const gettingStartedTour: TourConfig = {
    id: 'gettingStarted',
    commandTitle: 'Getting Started Tour',
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
