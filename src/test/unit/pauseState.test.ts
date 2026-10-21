/**
 * Tests for Pause State Module
 */

import { expect } from 'chai';
import {
    PAUSE_INDEFINITE,
    computePauseUntil,
    isPaused,
    getPauseMenuLabel,
    getPauseTooltip,
} from '../../pauseState';

describe('pauseState', () => {
    const now = 1_000_000;

    describe('computePauseUntil', () => {
        it('adds the duration in minutes to now', () => {
            expect(computePauseUntil(5, now)).to.equal(now + 5 * 60_000);
        });

        it('returns PAUSE_INDEFINITE for a zero duration', () => {
            expect(computePauseUntil(0, now)).to.equal(PAUSE_INDEFINITE);
        });

        it('returns PAUSE_INDEFINITE for a negative or invalid duration', () => {
            expect(computePauseUntil(-3, now)).to.equal(PAUSE_INDEFINITE);
            expect(computePauseUntil(NaN, now)).to.equal(PAUSE_INDEFINITE);
        });
    });

    describe('isPaused', () => {
        it('is not paused when pauseUntil is undefined', () => {
            expect(isPaused(undefined, now)).to.be.false;
        });

        it('is paused indefinitely', () => {
            expect(isPaused(PAUSE_INDEFINITE, now)).to.be.true;
        });

        it('is paused before the end time', () => {
            expect(isPaused(now + 1, now)).to.be.true;
        });

        it('is not paused at or after the end time', () => {
            expect(isPaused(now, now)).to.be.false;
            expect(isPaused(now - 1, now)).to.be.false;
        });
    });

    describe('getPauseMenuLabel', () => {
        it('uses plural minutes', () => {
            expect(getPauseMenuLabel(5)).to.equal('Pause coloring for 5 minutes');
        });

        it('uses singular minute', () => {
            expect(getPauseMenuLabel(1)).to.equal('Pause coloring for 1 minute');
        });

        it('describes an indefinite pause for zero', () => {
            expect(getPauseMenuLabel(0)).to.equal('Pause coloring until restored');
        });
    });

    describe('getPauseTooltip', () => {
        it('describes an indefinite pause', () => {
            expect(getPauseTooltip(PAUSE_INDEFINITE)).to.equal(
                'Git Repo Window Colors - Coloring paused until restored',
            );
        });

        it('includes the resume time for a timed pause', () => {
            const until = new Date(2026, 0, 1, 10, 42).getTime();
            const expectedTime = new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            expect(getPauseTooltip(until)).to.equal(`Git Repo Window Colors - Coloring paused until ${expectedTime}`);
        });
    });
});
