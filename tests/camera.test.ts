import assert from 'node:assert/strict';
import test from 'node:test';
import { getCameraUnlockState } from '../src/domain.ts';
import type { LocationFix, Spot } from '../src/types.ts';

const NOW = Date.parse('2026-11-08T03:00:00.000Z');
const SPOT = { id: 'ikedaya', coordinate: { latitude: 35.00911111, longitude: 135.76980556 } } as Spot;
const north = (meters: number): LocationFix => ({
  latitude: SPOT.coordinate.latitude + (meters / 6_371_000) * 180 / Math.PI, longitude: SPOT.coordinate.longitude, accuracy: 150, timestamp: NOW,
});

test('demo mode lets a photo unlock anywhere', () => {
  assert.equal(getCameraUnlockState(SPOT, 'demo', null, NOW).allowed, true);
});

test('field mode needs a recent fix within 200 m, even a coarse one', () => {
  assert.equal(getCameraUnlockState(SPOT, 'gps', north(199), NOW).allowed, true);
  assert.equal(getCameraUnlockState(SPOT, 'gps', north(201), NOW).allowed, false);
  assert.equal(getCameraUnlockState(SPOT, 'gps', null, NOW).allowed, false);
  assert.equal(getCameraUnlockState(SPOT, 'gps', { ...north(10), timestamp: NOW - 120_001 }, NOW).allowed, false);
  assert.match(getCameraUnlockState(SPOT, 'gps', north(500), NOW).reason, /200m/);
});
