import assert from 'node:assert/strict';
import test from 'node:test';
import { addDiscovery, createDemoRoutes, distanceMeters, formatDistance, getAreaStatus, getUnlockState, pathBetween, pointAlong, sanitizeDiscoveries } from '../src/domain.ts';
import type { Coordinate, Destination, Discovery, LocationFix, Spot } from '../src/types.ts';

const NOW = Date.parse('2026-11-08T03:00:00.000Z');
const ORIGIN: Coordinate = { latitude: 35.009, longitude: 135.768 };
const CITY_HALL: Destination = { id: 'city-hall', name: '市役所', subtitle: '', coordinate: { latitude: 35.0116, longitude: 135.7681 } };
const SHIJO: Destination = { id: 'shijo-kawaramachi', name: '四条河原町', subtitle: '', coordinate: { latitude: 35.0037, longitude: 135.7686 } };
const SPOT: Spot = {
  id: 'sanjo-giboshi', name: '三条大橋', category: 'history', coordinate: ORIGIN,
  radiusMeters: 45, hint: '', story: '', lookFor: '', sources: [], relatedSpotIds: [], visitMinutes: 1,
};
const SPOTS: Spot[] = ['sanjo-giboshi', 'ikedaya', 'zuisenji', 'takase-ichino-funairi', 'ekiden-monument']
  .map((id, index) => ({ ...SPOT, id, coordinate: { latitude: 35.009 + index * 0.0002, longitude: 135.768 } }));
const FIX: LocationFix = { ...ORIGIN, accuracy: 10, timestamp: NOW };

function northBy(meters: number): Coordinate {
  return { ...ORIGIN, latitude: ORIGIN.latitude + (meters / 6_371_000) * 180 / Math.PI };
}

test('distance is symmetric, accurate at a known arc, and stable across the date line', () => {
  assert.equal(distanceMeters(ORIGIN, ORIGIN), 0);
  assert.ok(Math.abs(distanceMeters(ORIGIN, northBy(100)) - 100) < 0.0001);
  assert.equal(distanceMeters(ORIGIN, CITY_HALL.coordinate), distanceMeters(CITY_HALL.coordinate, ORIGIN));
  const crossing = distanceMeters({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 });
  assert.ok(crossing > 22_000 && crossing < 23_000);
  assert.ok(Number.isNaN(distanceMeters(ORIGIN, { latitude: 91, longitude: 0 })));
});

test('unlock includes the radius boundary and rejects a point just outside it', () => {
  assert.equal(getUnlockState(SPOT, { ...FIX, ...northBy(45) }, NOW).eligible, true);
  assert.equal(getUnlockState(SPOT, { ...FIX, ...northBy(45.01) }, NOW).eligible, false);
  assert.equal(getUnlockState(SPOT, FIX, NOW).eligible, true);
});

test('unlock requires a fresh fix with usable accuracy', () => {
  assert.equal(getUnlockState(SPOT, null, NOW).distanceMeters, null);
  assert.equal(getUnlockState(SPOT, undefined, NOW).eligible, false);
  assert.equal(getUnlockState(SPOT, { ...FIX, timestamp: NOW - 60_000, accuracy: 60 }, NOW).eligible, true);
  for (const fix of [
    { ...FIX, timestamp: NOW - 60_001 },
    { ...FIX, timestamp: NOW + 60_000 },
    { ...FIX, timestamp: Number.NaN },
    { ...FIX, accuracy: null },
    { ...FIX, accuracy: 60.01 },
    { ...FIX, accuracy: -1 },
    { ...FIX, accuracy: Number.NaN },
    { ...FIX, latitude: Number.NaN },
  ]) {
    const result = getUnlockState(SPOT, fix, NOW);
    assert.equal(result.eligible, false);
    assert.match(result.reason, /[\u3040-\u30ff\u4e00-\u9fff]/);
  }
});

test('five-minute demo includes two discoveries and counts visit time in the full budget', () => {
  const [direct, discovery] = createDemoRoutes(CITY_HALL, 5, SPOTS, ORIGIN);
  assert.equal(direct.totalSeconds, 9 * 60);
  assert.equal(direct.kind, 'direct');
  assert.equal(direct.extraSeconds, 0);
  assert.equal(discovery.source, 'demo');
  assert.deepEqual(discovery.spotIds, ['sanjo-giboshi', 'ikedaya']);
  assert.equal(discovery.visitSeconds, 2 * 60);
  assert.equal(discovery.walkingSeconds - direct.totalSeconds, 3 * 60);
  assert.equal(discovery.extraSeconds, 5 * 60);
  assert.equal(discovery.totalSeconds, discovery.walkingSeconds + discovery.visitSeconds);
  assert.equal(discovery.extraSeconds, discovery.totalSeconds - direct.totalSeconds);
  assert.deepEqual(discovery.coordinates[0], ORIGIN);
  assert.deepEqual(discovery.coordinates.at(-1), CITY_HALL.coordinate);
});

test('ten-minute demo selects destination-specific third stop without double-counting the bridge', () => {
  for (const destination of [CITY_HALL, SHIJO]) {
    const [direct, discovery] = createDemoRoutes(destination, 10, SPOTS, ORIGIN);
    assert.equal(direct.totalSeconds, destination.id === 'city-hall' ? 9 * 60 : 12 * 60);
    assert.equal(discovery.spotIds.length, 3);
    assert.equal(discovery.extraSeconds, 10 * 60);
    assert.equal(discovery.visitSeconds, 3 * 60);
    assert.equal(discovery.totalSeconds - direct.totalSeconds, 10 * 60);
    assert.ok(discovery.spotIds.includes(destination.id === 'city-hall' ? 'takase-ichino-funairi' : 'zuisenji'));
    assert.ok(!discovery.spotIds.includes('ekiden-monument'));
    assert.ok(discovery.spotIds.every((id) => SPOTS.some((spot) => spot.id === id)));
  }
});

test('demo budget remains a hard cap when visits change or catalog entries are missing', () => {
  const longVisits = SPOTS.map((spot) => ({ ...spot, visitMinutes: 2 }));
  for (const budget of [5, 10] as const) {
    const [direct, discovery] = createDemoRoutes(CITY_HALL, budget, longVisits, ORIGIN);
    assert.ok(discovery.extraSeconds <= budget * 60);
    assert.equal(discovery.visitSeconds, discovery.spotIds.length * 120);
    assert.equal(discovery.totalSeconds - direct.totalSeconds, discovery.extraSeconds);
    assert.ok(!discovery.spotIds.includes('ekiden-monument'));
  }
  const noCandidates = createDemoRoutes(CITY_HALL, 5, [], ORIGIN);
  assert.equal(noCandidates.length, 1);
  assert.equal(noCandidates[0].kind, 'direct');
  const tooLong = createDemoRoutes(CITY_HALL, 5, SPOTS.map((spot) => ({ ...spot, visitMinutes: 10 })), ORIGIN);
  assert.equal(tooLong.length, 1);
});

test('stored data rejects malformed records, unknown IDs, impossible calendar dates, and duplicates', () => {
  const good: Discovery = { spotId: SPOT.id, mode: 'demo', discoveredAt: '2026-11-08T03:00:00.000Z' };
  const cleaned = sanitizeDiscoveries([
    good,
    { ...good, discoveredAt: '2026-11-08T03:01:00Z' },
    { ...good, mode: 'gps', discoveredAt: '2026-11-08T12:00:00+09:00' },
    null,
    [],
    42,
    { ...good, spotId: 'unknown' },
    { ...good, mode: 'manual' },
    { ...good, discoveredAt: '2026-02-30T00:00:00Z' },
    { ...good, discoveredAt: '2026-11-08' },
    { ...good, discoveredAt: 1234 },
    { ...good, discoveredAt: '2026-11-08T24:00:00Z' },
  ], [SPOT.id]);
  assert.deepEqual(cleaned, [good, { ...good, mode: 'gps' }]);
  assert.deepEqual(sanitizeDiscoveries({ records: [good] }, [SPOT.id]), []);
  assert.deepEqual(sanitizeDiscoveries(null, [SPOT.id]), []);
  assert.deepEqual(sanitizeDiscoveries([good], []), []);
});

test('valid leap days are retained while non-leap days are rejected', () => {
  const records = ['2024-02-29T00:00:00Z', '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z']
    .map((discoveredAt, index) => ({ spotId: String(index), mode: 'gps', discoveredAt }));
  const cleaned = sanitizeDiscoveries(records, ['0', '1', '2']);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].discoveredAt, '2024-02-29T00:00:00.000Z');
});

test('discovery is idempotent per mode while a real visit can follow a demo discovery', () => {
  const original: Discovery[] = [];
  const demo = addDiscovery(original, SPOT.id, 'demo', NOW);
  assert.deepEqual(original, []);
  assert.deepEqual(addDiscovery(demo, SPOT.id, 'demo', NOW + 1_000), demo);
  const real = addDiscovery(demo, SPOT.id, 'gps', NOW + 2_000);
  assert.equal(real.length, 2);
  assert.equal(demo.length, 1);
  assert.deepEqual(real.map((entry) => entry.mode), ['demo', 'gps']);
  assert.equal(real[0].discoveredAt, '2026-11-08T03:00:00.000Z');
  assert.equal(real[1].discoveredAt, '2026-11-08T03:00:02.000Z');
  assert.deepEqual(addDiscovery(real, '', 'gps', NOW), real);
  assert.deepEqual(addDiscovery(real, 'ikedaya', 'gps', Number.NaN), real);
});

test('area status flags fixes far from every spot, even with poor accuracy', () => {
  assert.equal(getAreaStatus(null, SPOTS), null);
  assert.equal(getAreaStatus(FIX, []), null);
  const near = getAreaStatus({ ...FIX, ...northBy(1_900), accuracy: 500 }, [SPOT]);
  assert.equal(near?.inArea, true);
  const far = getAreaStatus({ ...FIX, ...northBy(2_100) }, [SPOT]);
  assert.equal(far?.inArea, false);
  assert.equal(far?.nearestSpot.id, 'sanjo-giboshi');
  const tokyo = getAreaStatus({ latitude: 35.681, longitude: 139.767, accuracy: 20, timestamp: NOW }, SPOTS);
  assert.equal(tokyo?.inArea, false);
  assert.equal(getAreaStatus({ ...FIX, latitude: Number.NaN }, SPOTS), null);
  assert.equal(formatDistance(1_234), '1.2km');
  assert.equal(formatDistance(364_000), '364km');
  assert.equal(formatDistance(44), '40m');
});

test('demo walk follows the road line between two stops and moves by distance', () => {
  const a = { latitude: 35, longitude: 135 };
  const corner = { latitude: 35.001, longitude: 135 };
  const b = { latitude: 35.001, longitude: 135.001 };
  const beyond = { latitude: 35.002, longitude: 135.001 };
  const road = [a, corner, b, beyond];
  assert.deepEqual(pathBetween(road, a, b), [a, a, corner, b, b]);
  assert.deepEqual(pathBetween([], a, b), [a, b]);
  assert.deepEqual(pointAlong(road, 0), a);
  assert.deepEqual(pointAlong(road, 1), beyond);
  const total = distanceMeters(a, corner) + distanceMeters(corner, b);
  const half = pointAlong([a, corner, b], 0.5);
  assert.equal(half.longitude, 135, 'halfway is still on the longer first leg, not cut across the block');
  assert.ok(Math.abs(distanceMeters(a, half) - total / 2) < 1);
});
