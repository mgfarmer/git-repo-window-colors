# Change Log

All notable changes to the "git-repo-window-colors" extension will be documented in this file.

## [1.1.0]

- Initial release

## [1.2.0]

- You can apply branch coloring without requiring a repo rule match first.

## [1.3.0] - Configuration UI Update

### Added

- **New Webview Configuration Interface**: Comprehensive visual interface for managing color rules
  - Intuitive drag-and-drop table interface for repository and branch rules
  - Built-in color picker with support for hex, named colors, RGB, and HSL formats
  - Real-time preview of configuration changes
  - Rule reordering with visual drag handles and up/down buttons

- **Enhanced User Experience**:
  - Comprehensive tooltips and help text throughout the interface
  - Visual examples and pattern documentation for branch rules
  - Professional table-based editing with proper validation feedback
  - Test button for comprehensive configuration validation

- **Accessibility Features**:
  - Full keyboard navigation support with custom shortcuts
  - Screen reader compatibility with ARIA labels and semantic HTML
  - High contrast mode support
  - Focus management and visual indicators
  - Comprehensive keyboard shortcuts (Ctrl+Alt+R, Ctrl+Alt+B, etc.)

- **Testing and Validation**:
  - Comprehensive testing suite with performance monitoring
  - Edge case testing for large configurations
  - Invalid configuration detection with helpful error messages
  - Color format validation with detailed feedback
  - Test data restoration to preserve real configuration

- **Command**: "Git Repo Window Colors: Open Configuration" to access the new interface

### Improved

- Better error handling and user feedback
- Enhanced validation with specific error messages
- Improved color picker integration
- More intuitive rule management workflow
