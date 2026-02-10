/**
 * Tests for Element Classification and Correspondence Utilities
 */

import { expect } from 'chai';
import {
    PALETTE_SLOT_ORDER,
    FG_BG_PAIRS,
    ACTIVE_INACTIVE_PAIRS,
    isBackgroundElement,
    isForegroundElement,
    isActiveElement,
    isInactiveElement,
    isNeutralElement,
    findCorrespondingFgBg,
    getCorrespondingPaletteSlot,
    findCorrespondingActiveInactive,
    getCorrespondingActiveInactiveSlot,
    isSlotCompatibleWithKey,
    isSlotCongruousFgBg,
    isSlotCongruousActiveInactive,
    getFilteredPaletteOptions,
} from '../../webview/elementClassifiers';

describe('elementClassifiers', () => {
    describe('Constants', () => {
        it('PALETTE_SLOT_ORDER should contain 12 slots', () => {
            expect(PALETTE_SLOT_ORDER).to.have.length(12);
        });

        it('PALETTE_SLOT_ORDER should be in correct order', () => {
            expect(PALETTE_SLOT_ORDER[0]).to.equal('primaryActiveFg');
            expect(PALETTE_SLOT_ORDER[1]).to.equal('primaryActiveBg');
            expect(PALETTE_SLOT_ORDER[11]).to.equal('quaternaryBg');
        });

        it('FG_BG_PAIRS should contain bidirectional mappings', () => {
            expect(FG_BG_PAIRS['titleBar.activeForeground']).to.equal('titleBar.activeBackground');
            expect(FG_BG_PAIRS['titleBar.activeBackground']).to.equal('titleBar.activeForeground');
        });

        it('ACTIVE_INACTIVE_PAIRS should contain bidirectional mappings', () => {
            expect(ACTIVE_INACTIVE_PAIRS['titleBar.activeBackground']).to.equal('titleBar.inactiveBackground');
            expect(ACTIVE_INACTIVE_PAIRS['titleBar.inactiveBackground']).to.equal('titleBar.activeBackground');
        });
    });

    describe('isBackgroundElement', () => {
        it('should return true for keys with "background"', () => {
            expect(isBackgroundElement('titleBar.activeBackground')).to.be.true;
            expect(isBackgroundElement('panel.background')).to.be.true;
        });

        it('should return true for keys ending with "Bg"', () => {
            expect(isBackgroundElement('primaryActiveBg')).to.be.true;
            expect(isBackgroundElement('tertiaryBg')).to.be.true;
        });

        it('should return false for foreground keys', () => {
            expect(isBackgroundElement('titleBar.activeForeground')).to.be.false;
            expect(isBackgroundElement('primaryActiveFg')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(isBackgroundElement('TITLEBAR.BACKGROUND')).to.be.true;
            expect(isBackgroundElement('PrimaryActiveBg')).to.be.true;
        });
    });

    describe('isForegroundElement', () => {
        it('should return true for keys with "foreground"', () => {
            expect(isForegroundElement('titleBar.activeForeground')).to.be.true;
            expect(isForegroundElement('statusBar.foreground')).to.be.true;
        });

        it('should return true for keys ending with "Fg"', () => {
            expect(isForegroundElement('primaryActiveFg')).to.be.true;
            expect(isForegroundElement('quaternaryFg')).to.be.true;
        });

        it('should return false for background keys', () => {
            expect(isForegroundElement('titleBar.activeBackground')).to.be.false;
            expect(isForegroundElement('primaryActiveBg')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(isForegroundElement('TITLEBAR.FOREGROUND')).to.be.true;
            expect(isForegroundElement('PrimaryActiveFg')).to.be.true;
        });
    });

    describe('isActiveElement', () => {
        it('should return true for keys with "active" (but not "inactive")', () => {
            expect(isActiveElement('titleBar.activeBackground')).to.be.true;
            expect(isActiveElement('primaryActiveFg')).to.be.true;
        });

        it('should return false for keys with "inactive"', () => {
            expect(isActiveElement('titleBar.inactiveBackground')).to.be.false;
            expect(isActiveElement('primaryInactiveFg')).to.be.false;
        });

        it('should return false for neutral keys', () => {
            expect(isActiveElement('panel.background')).to.be.false;
            expect(isActiveElement('tertiaryBg')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(isActiveElement('TITLEBAR.ACTIVEBACKGROUND')).to.be.true;
        });
    });

    describe('isInactiveElement', () => {
        it('should return true for keys with "inactive"', () => {
            expect(isInactiveElement('titleBar.inactiveBackground')).to.be.true;
            expect(isInactiveElement('primaryInactiveFg')).to.be.true;
            expect(isInactiveElement('activityBar.inactiveForeground')).to.be.true;
        });

        it('should return false for active keys', () => {
            expect(isInactiveElement('titleBar.activeBackground')).to.be.false;
            expect(isInactiveElement('primaryActiveFg')).to.be.false;
        });

        it('should return false for neutral keys', () => {
            expect(isInactiveElement('panel.background')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(isInactiveElement('TITLEBAR.INACTIVEBACKGROUND')).to.be.true;
        });
    });

    describe('isNeutralElement', () => {
        it('should return true for keys without active/inactive', () => {
            expect(isNeutralElement('panel.background')).to.be.true;
            expect(isNeutralElement('tertiaryBg')).to.be.true;
            expect(isNeutralElement('statusBar.foreground')).to.be.true;
        });

        it('should return false for active keys', () => {
            expect(isNeutralElement('titleBar.activeBackground')).to.be.false;
            expect(isNeutralElement('primaryActiveFg')).to.be.false;
        });

        it('should return false for inactive keys', () => {
            expect(isNeutralElement('titleBar.inactiveBackground')).to.be.false;
            expect(isNeutralElement('primaryInactiveFg')).to.be.false;
        });

        it('should be case-insensitive', () => {
            expect(isNeutralElement('PANEL.BACKGROUND')).to.be.true;
        });
    });

    describe('findCorrespondingFgBg', () => {
        it('should find corresponding background for foreground', () => {
            const result = findCorrespondingFgBg('titleBar.activeForeground');
            expect(result).to.equal('titleBar.activeBackground');
        });

        it('should find corresponding foreground for background', () => {
            const result = findCorrespondingFgBg('titleBar.activeBackground');
            expect(result).to.equal('titleBar.activeForeground');
        });

        it('should return null for unmapped keys', () => {
            const result = findCorrespondingFgBg('unknown.key');
            expect(result).to.be.null;
        });

        it('should handle activity bar mappings', () => {
            expect(findCorrespondingFgBg('activityBar.foreground')).to.equal('activityBar.background');
            expect(findCorrespondingFgBg('activityBar.background')).to.equal('activityBar.foreground');
        });
    });

    describe('getCorrespondingPaletteSlot', () => {
        it('should swap Fg to Bg', () => {
            const result = getCorrespondingPaletteSlot('primaryActiveFg');
            expect(result).to.equal('primaryActiveBg');
        });

        it('should swap Bg to Fg', () => {
            const result = getCorrespondingPaletteSlot('primaryActiveBg');
            expect(result).to.equal('primaryActiveFg');
        });

        it('should return null for "none"', () => {
            const result = getCorrespondingPaletteSlot('none');
            expect(result).to.be.null;
        });

        it('should return null for slots without Fg/Bg suffix', () => {
            const result = getCorrespondingPaletteSlot('custom');
            expect(result).to.be.null;
        });

        it('should handle all palette slot orders', () => {
            expect(getCorrespondingPaletteSlot('secondaryInactiveFg')).to.equal('secondaryInactiveBg');
            expect(getCorrespondingPaletteSlot('tertiaryBg')).to.equal('tertiaryFg');
        });
    });

    describe('findCorrespondingActiveInactive', () => {
        it('should find corresponding inactive for active', () => {
            const result = findCorrespondingActiveInactive('titleBar.activeBackground');
            expect(result).to.equal('titleBar.inactiveBackground');
        });

        it('should find corresponding active for inactive', () => {
            const result = findCorrespondingActiveInactive('titleBar.inactiveBackground');
            expect(result).to.equal('titleBar.activeBackground');
        });

        it('should return null for unmapped keys', () => {
            const result = findCorrespondingActiveInactive('unknown.key');
            expect(result).to.be.null;
        });

        it('should handle activity bar special naming', () => {
            expect(findCorrespondingActiveInactive('activityBar.foreground')).to.equal(
                'activityBar.inactiveForeground',
            );
            expect(findCorrespondingActiveInactive('activityBar.inactiveForeground')).to.equal(
                'activityBar.foreground',
            );
        });
    });

    describe('getCorrespondingActiveInactiveSlot', () => {
        it('should swap Active to Inactive', () => {
            const result = getCorrespondingActiveInactiveSlot('primaryActiveFg');
            expect(result).to.equal('primaryInactiveFg');
        });

        it('should swap Inactive to Active', () => {
            const result = getCorrespondingActiveInactiveSlot('primaryInactiveBg');
            expect(result).to.equal('primaryActiveBg');
        });

        it('should return null for "none"', () => {
            const result = getCorrespondingActiveInactiveSlot('none');
            expect(result).to.be.null;
        });

        it('should return null for neutral slots', () => {
            const result = getCorrespondingActiveInactiveSlot('tertiaryBg');
            expect(result).to.be.null;
        });

        it('should handle secondary slots', () => {
            expect(getCorrespondingActiveInactiveSlot('secondaryActiveFg')).to.equal('secondaryInactiveFg');
            expect(getCorrespondingActiveInactiveSlot('secondaryInactiveBg')).to.equal('secondaryActiveBg');
        });
    });

    describe('isSlotCompatibleWithKey', () => {
        it('should allow Bg slot for Bg key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveBg', 'titleBar.activeBackground');
            expect(result).to.be.true;
        });

        it('should allow Fg slot for Fg key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveFg', 'titleBar.activeForeground');
            expect(result).to.be.true;
        });

        it('should reject Fg slot for Bg key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveFg', 'titleBar.activeBackground');
            expect(result).to.be.false;
        });

        it('should reject Bg slot for Fg key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveBg', 'titleBar.activeForeground');
            expect(result).to.be.false;
        });

        it('should allow active slot for active key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveBg', 'titleBar.activeBackground');
            expect(result).to.be.true;
        });

        it('should allow inactive slot for inactive key', () => {
            const result = isSlotCompatibleWithKey('primaryInactiveBg', 'titleBar.inactiveBackground');
            expect(result).to.be.true;
        });

        it('should allow neutral slot for active key', () => {
            const result = isSlotCompatibleWithKey('tertiaryBg', 'titleBar.activeBackground');
            expect(result).to.be.true;
        });

        it('should allow neutral slot for inactive key', () => {
            const result = isSlotCompatibleWithKey('tertiaryBg', 'titleBar.inactiveBackground');
            expect(result).to.be.true;
        });

        it('should reject active slot for inactive key', () => {
            const result = isSlotCompatibleWithKey('primaryActiveBg', 'titleBar.inactiveBackground');
            expect(result).to.be.false;
        });

        it('should allow any slot for completely neutral key', () => {
            // A key with no bg/fg/active/inactive context
            expect(isSlotCompatibleWithKey('primaryActiveBg', 'focusBorder')).to.be.true;
            expect(isSlotCompatibleWithKey('primaryActiveFg', 'focusBorder')).to.be.true;
            expect(isSlotCompatibleWithKey('tertiaryBg', 'focusBorder')).to.be.true;
        });
    });

    describe('isSlotCongruousFgBg', () => {
        it('should return true for Bg slot and Bg key', () => {
            const result = isSlotCongruousFgBg('titleBar.activeBackground', 'primaryActiveBg');
            expect(result).to.be.true;
        });

        it('should return true for Fg slot and Fg key', () => {
            const result = isSlotCongruousFgBg('titleBar.activeForeground', 'primaryActiveFg');
            expect(result).to.be.true;
        });

        it('should return false for Fg slot and Bg key', () => {
            const result = isSlotCongruousFgBg('titleBar.activeBackground', 'primaryActiveFg');
            expect(result).to.be.false;
        });

        it('should return false for Bg slot and Fg key', () => {
            const result = isSlotCongruousFgBg('titleBar.activeForeground', 'primaryActiveBg');
            expect(result).to.be.false;
        });

        it('should return true for special values', () => {
            expect(isSlotCongruousFgBg('titleBar.activeBackground', 'none')).to.be.true;
            expect(isSlotCongruousFgBg('titleBar.activeForeground', '__fixed__')).to.be.true;
        });
    });

    describe('isSlotCongruousActiveInactive', () => {
        it('should return true for Active slot and Active key', () => {
            const result = isSlotCongruousActiveInactive('titleBar.activeBackground', 'primaryActiveBg');
            expect(result).to.be.true;
        });

        it('should return true for Inactive slot and Inactive key', () => {
            const result = isSlotCongruousActiveInactive('titleBar.inactiveBackground', 'primaryInactiveBg');
            expect(result).to.be.true;
        });

        it('should return true for Neutral slot and Neutral key', () => {
            const result = isSlotCongruousActiveInactive('panel.background', 'tertiaryBg');
            expect(result).to.be.true;
        });

        it('should return false for Active slot and Inactive key', () => {
            const result = isSlotCongruousActiveInactive('titleBar.inactiveBackground', 'primaryActiveBg');
            expect(result).to.be.false;
        });

        it('should return false for Inactive slot and Active key', () => {
            const result = isSlotCongruousActiveInactive('titleBar.activeBackground', 'primaryInactiveBg');
            expect(result).to.be.false;
        });

        it('should return true for special values', () => {
            expect(isSlotCongruousActiveInactive('titleBar.activeBackground', 'none')).to.be.true;
            expect(isSlotCongruousActiveInactive('titleBar.inactiveBackground', '__fixed__')).to.be.true;
        });
    });

    describe('getFilteredPaletteOptions', () => {
        const allSlots = [
            'primaryActiveFg',
            'primaryActiveBg',
            'primaryInactiveFg',
            'primaryInactiveBg',
            'secondaryActiveFg',
            'secondaryActiveBg',
            'tertiaryFg',
            'tertiaryBg',
            'none',
        ];

        describe('with filtering enabled', () => {
            it('should filter to Bg slots for Bg key', () => {
                const result = getFilteredPaletteOptions('titleBar.activeBackground', allSlots, undefined, true);
                result.forEach((slot) => {
                    expect(slot.endsWith('Bg')).to.be.true;
                });
            });

            it('should filter to Fg slots for Fg key', () => {
                const result = getFilteredPaletteOptions('titleBar.activeForeground', allSlots, undefined, true);
                result.forEach((slot) => {
                    expect(slot.endsWith('Fg')).to.be.true;
                });
            });

            it('should filter to Active or Neutral slots for Active key', () => {
                const result = getFilteredPaletteOptions('titleBar.activeBackground', allSlots, undefined, true);
                // Should include primaryActiveBg, secondaryActiveBg, tertiaryBg
                expect(result).to.include('primaryActiveBg');
                expect(result).to.include('secondaryActiveBg');
                expect(result).to.include('tertiaryBg');
                // Should not include inactive
                expect(result).to.not.include('primaryInactiveBg');
            });

            it('should filter to Inactive or Neutral slots for Inactive key', () => {
                const result = getFilteredPaletteOptions('titleBar.inactiveBackground', allSlots, undefined, true);
                // Should include primaryInactiveBg, secondaryInactiveBg, tertiaryBg
                expect(result).to.include('primaryInactiveBg');
                expect(result).to.include('tertiaryBg');
                // Should not include active
                expect(result).to.not.include('primaryActiveBg');
            });

            it('should include currentSlot even if filtered out', () => {
                // Fg slot for Bg key should normally be filtered out
                const result = getFilteredPaletteOptions(
                    'titleBar.activeBackground',
                    allSlots,
                    'primaryActiveFg',
                    true,
                );
                expect(result).to.include('primaryActiveFg');
            });

            it('should return all slots (except none) for completely neutral key', () => {
                const result = getFilteredPaletteOptions('focusBorder', allSlots, undefined, true);
                // Should include all slots except 'none'
                expect(result.length).to.equal(allSlots.length - 1); // -1 for 'none'
                expect(result).to.not.include('none');
            });
        });

        describe('with filtering disabled', () => {
            it('should return all slots (except none) regardless of key type', () => {
                const result = getFilteredPaletteOptions('titleBar.activeBackground', allSlots, undefined, false);
                // Should include all slots except 'none'
                expect(result.length).to.equal(allSlots.length - 1); // -1 for 'none'
                expect(result).to.not.include('none');
            });

            it('should still sort by PALETTE_SLOT_ORDER', () => {
                const result = getFilteredPaletteOptions('titleBar.activeBackground', allSlots, undefined, false);
                expect(result[0]).to.equal('primaryActiveFg');
                expect(result[1]).to.equal('primaryActiveBg');
            });
        });

        describe('sorting', () => {
            it('should sort slots according to PALETTE_SLOT_ORDER', () => {
                const unordered = ['tertiaryBg', 'primaryActiveFg', 'secondaryActiveBg', 'primaryActiveBg'];
                const result = getFilteredPaletteOptions('statusBar.background', unordered, undefined, false);
                expect(result[0]).to.equal('primaryActiveFg');
                expect(result[1]).to.equal('primaryActiveBg');
                expect(result[2]).to.equal('secondaryActiveBg');
                expect(result[3]).to.equal('tertiaryBg');
            });

            it('should sort unknown slots alphabetically after known slots', () => {
                const withCustom = [...allSlots, 'customSlotZ', 'customSlotA'];
                const result = getFilteredPaletteOptions('panel.background', withCustom, undefined, false);
                // Custom slots should be at the end, sorted alphabetically
                const lastTwo = result.slice(-2);
                expect(lastTwo[0]).to.equal('customSlotA');
                expect(lastTwo[1]).to.equal('customSlotZ');
            });
        });
    });
});
