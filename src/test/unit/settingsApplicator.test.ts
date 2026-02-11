import { expect } from 'chai';
import { applyColors, removeAllManagedColors, MANAGED_COLORS } from '../../settingsApplicator';

describe('settingsApplicator', () => {
    describe('MANAGED_COLORS', () => {
        it('should export managed colors array', () => {
            expect(MANAGED_COLORS).to.be.an('array');
            expect(MANAGED_COLORS.length).to.be.greaterThan(0);
        });

        it('should contain expected color keys', () => {
            expect(MANAGED_COLORS).to.include('titleBar.activeBackground');
            expect(MANAGED_COLORS).to.include('activityBar.background');
            expect(MANAGED_COLORS).to.include('statusBar.background');
            expect(MANAGED_COLORS).to.include('tab.activeBackground');
        });

        it('should have 53 managed color keys', () => {
            // Verify we have the expected number of managed colors
            expect(MANAGED_COLORS).to.have.lengthOf(53);
        });
    });

    describe('removeAllManagedColors', () => {
        it('should return empty object for undefined settings', () => {
            const result = removeAllManagedColors(undefined);
            expect(result).to.deep.equal({});
        });

        it('should return empty object for empty settings', () => {
            const result = removeAllManagedColors({});
            expect(result).to.deep.equal({});
        });

        it('should remove all managed colors', () => {
            const settings = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
                'statusBar.background': '#0000ff',
            };

            const result = removeAllManagedColors(settings);

            expect(result).to.deep.equal({});
        });

        it('should preserve non-managed colors', () => {
            const settings = {
                'titleBar.activeBackground': '#ff0000',
                'my.custom.color': '#123456',
                'activityBar.background': '#00ff00',
                'another.custom.color': '#abcdef',
            };

            const result = removeAllManagedColors(settings);

            expect(result).to.deep.equal({
                'my.custom.color': '#123456',
                'another.custom.color': '#abcdef',
            });
        });

        it('should handle mixed managed and non-managed colors', () => {
            const settings = {
                'titleBar.activeBackground': '#ff0000',
                'statusBar.background': '#00ff00',
                'tab.activeBackground': '#0000ff',
                'editor.background': '#ffffff', // Not managed
                'sidebar.background': '#eeeeee', // Not managed
            };

            const result = removeAllManagedColors(settings);

            expect(result).to.deep.equal({
                'editor.background': '#ffffff',
                'sidebar.background': '#eeeeee',
            });
        });
    });

    describe('applyColors', () => {
        it('should apply colors to empty settings', () => {
            const newColors = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
            };

            const result = applyColors(undefined, newColors);

            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
            });
            expect(result.setCount).to.equal(2);
            expect(result.removedCount).to.equal(0);
        });

        it('should skip undefined values in newColors', () => {
            const newColors = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': undefined,
                'statusBar.background': '#0000ff',
            };

            const result = applyColors(undefined, newColors);

            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ff0000',
                'statusBar.background': '#0000ff',
            });
            expect(result.finalColors['activityBar.background']).to.be.undefined;
            expect(result.setCount).to.equal(2);
        });

        it('should preserve non-managed colors', () => {
            const currentSettings = {
                'titleBar.activeBackground': '#123456',
                'my.custom.color': '#abcdef',
            };
            const newColors = {
                'titleBar.activeBackground': '#ff0000',
            };

            const result = applyColors(currentSettings, newColors);

            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ff0000',
                'my.custom.color': '#abcdef',
            });
        });

        it('should remove stale managed colors', () => {
            const currentSettings = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
                'statusBar.background': '#0000ff',
            };
            const newColors = {
                'titleBar.activeBackground': '#ffff00',
                // activityBar and statusBar not in newColors - should be removed
            };

            const result = applyColors(currentSettings, newColors);

            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ffff00',
            });
            expect(result.finalColors['activityBar.background']).to.be.undefined;
            expect(result.finalColors['statusBar.background']).to.be.undefined;
            expect(result.removedCount).to.equal(2);
        });

        it('should handle undefined as "remove this color"', () => {
            const currentSettings = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
            };
            const newColors = {
                'titleBar.activeBackground': '#ffff00',
                'activityBar.background': undefined, // Explicitly remove
            };

            const result = applyColors(currentSettings, newColors);

            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ffff00',
            });
            expect(result.finalColors['activityBar.background']).to.be.undefined;
        });

        it('should track activity bar colors', () => {
            const newColors = {
                'activityBar.background': '#ff0000',
                'activityBar.foreground': '#ffffff',
                'titleBar.activeBackground': '#00ff00',
            };

            const result = applyColors(undefined, newColors);

            expect(result.activityBarColors).to.have.lengthOf(2);
            expect(result.activityBarColors).to.deep.include({ key: 'activityBar.background', value: '#ff0000' });
            expect(result.activityBarColors).to.deep.include({ key: 'activityBar.foreground', value: '#ffffff' });
        });

        it('should not include activity bar colors with undefined values', () => {
            const newColors = {
                'activityBar.background': '#ff0000',
                'activityBar.foreground': undefined,
            };

            const result = applyColors(undefined, newColors);

            expect(result.activityBarColors).to.have.lengthOf(1);
            expect(result.activityBarColors[0]).to.deep.equal({ key: 'activityBar.background', value: '#ff0000' });
        });

        it('should use logger when provided', () => {
            const logs: string[] = [];
            const logger = {
                appendLine: (message: string) => logs.push(message),
            };

            const newColors = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
            };

            applyColors(undefined, newColors, logger);

            expect(logs).to.have.lengthOf.greaterThan(0);
            expect(logs.some((log) => log.includes('Setting 2 color customizations'))).to.be.true;
            expect(logs.some((log) => log.includes('Activity bar colors'))).to.be.true;
        });

        it('should log warning when no activity bar colors are set', () => {
            const logs: string[] = [];
            const logger = {
                appendLine: (message: string) => logs.push(message),
            };

            const newColors = {
                'titleBar.activeBackground': '#ff0000',
            };

            applyColors(undefined, newColors, logger);

            expect(logs.some((log) => log.includes('WARNING: No activity bar colors being set'))).to.be.true;
        });

        it('should log removed stale colors', () => {
            const logs: string[] = [];
            const logger = {
                appendLine: (message: string) => logs.push(message),
            };

            const currentSettings = {
                'titleBar.activeBackground': '#ff0000',
                'activityBar.background': '#00ff00',
            };
            const newColors = {
                'titleBar.activeBackground': '#ffff00',
                // activityBar not in newColors - should be logged as removed
            };

            applyColors(currentSettings, newColors, logger);

            expect(logs.some((log) => log.includes('Removed stale color: activityBar.background'))).to.be.true;
        });

        it('should handle complex scenario with all operations', () => {
            const currentSettings = {
                // Managed colors
                'titleBar.activeBackground': '#111111',
                'activityBar.background': '#222222',
                'statusBar.background': '#333333',
                // Non-managed color
                'my.custom.color': '#999999',
            };

            const newColors = {
                // Update existing
                'titleBar.activeBackground': '#ff0000',
                // Remove by omission (statusBar)
                // Add new
                'tab.activeBackground': '#00ff00',
                // Explicitly undefined
                'panel.background': undefined,
            };

            const result = applyColors(currentSettings, newColors);

            // Verify final state
            expect(result.finalColors).to.include({
                'titleBar.activeBackground': '#ff0000',
                'tab.activeBackground': '#00ff00',
                'my.custom.color': '#999999',
            });
            expect(result.finalColors['activityBar.background']).to.be.undefined;
            expect(result.finalColors['statusBar.background']).to.be.undefined;
            expect(result.finalColors['panel.background']).to.be.undefined;

            // Verify statistics
            expect(result.setCount).to.equal(2); // titleBar and tab
            expect(result.removedCount).to.equal(2); // activityBar and statusBar
        });

        it('should return correct setCount for multiple colors', () => {
            const newColors = {
                'titleBar.activeBackground': '#ff0000',
                'titleBar.activeForeground': '#ffffff',
                'activityBar.background': '#00ff00',
                'activityBar.foreground': '#000000',
                'statusBar.background': undefined,
            };

            const result = applyColors(undefined, newColors);

            expect(result.setCount).to.equal(4); // Only non-undefined values
        });
    });
});
