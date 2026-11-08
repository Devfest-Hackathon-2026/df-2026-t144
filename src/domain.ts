import type { Budget, Coordinate, Destination, Discovery, LocationFix, Mode, RouteOption, Spot } from './types.ts';
import { topicScore } from './interests.ts';

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_FIX_AGE_MS = 60_000;
const MAX_ACCURACY_METERS = 60;

function isCoordinate(value: Coordinate): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  if (!isCoordinate(a) || !isCoordinate(b)) return Number.NaN;
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

export function getUnlockState(spot: Spot, fix: LocationFix | null | undefined, now = Date.now()): {
  eligible: boolean;
  reason: string;
  distanceMeters: number | null;
} {
  if (!fix) return { eligible: false, reason: '現在地を取得すると、発見までの距離がわかります。', distanceMeters: null };
  const distance = distanceMeters(fix, spot.coordinate);
  if (!Number.isFinite(distance) || !Number.isFinite(spot.radiusMeters) || spot.radiusMeters <= 0) {
    return { eligible: false, reason: '位置情報を確認できません。もう一度現在地を取得してください。', distanceMeters: null };
  }
  const result = { eligible: false, distanceMeters: distance };
  if (!Number.isFinite(now) || !Number.isFinite(fix.timestamp)
    || now - fix.timestamp > MAX_FIX_AGE_MS || fix.timestamp - now > 5_000) {
    return { ...result, reason: '現在地の情報が古くなっています。もう一度取得してください。' };
  }
  if (fix.accuracy === null || !Number.isFinite(fix.accuracy)
    || fix.accuracy < 0 || fix.accuracy > MAX_ACCURACY_METERS) {
    return { ...result, reason: 'GPSの精度が足りません。空の見える場所で少し待ってください。' };
  }
  if (distance > spot.radiusMeters + 0.000_001) {
    return { ...result, reason: `スポットの${spot.radiusMeters}m以内に近づくと発見できます。` };
  }
  return { eligible: true, reason: '近くに着きました。立ち止まって、発見しましょう。', distanceMeters: distance };
}

const CAMERA_RADIUS_METERS = 200;
const CAMERA_FIX_AGE_MS = 120_000;

/**
 * When a photo whose text names the spot may count as a discovery.
 * Demo: always (e.g. a printed photo of the marker at an indoor venue).
 * Field mode: only within 200 m, so the photo replaces a weak GPS fix near
 * the spot but never a visit.
 */
export function getCameraUnlockState(spot: Spot, mode: Mode, fix: LocationFix | null | undefined, now = Date.now()): { allowed: boolean; reason: string } {
  if (mode === 'demo') return { allowed: true, reason: 'デモでは、石碑や案内板の写真を撮っても発見できます。' };
  if (!fix || !Number.isFinite(fix.timestamp) || now - fix.timestamp > CAMERA_FIX_AGE_MS) {
    return { allowed: false, reason: '現地モードでは、現在地を取得してから撮ってください。' };
  }
  const distance = distanceMeters(fix, spot.coordinate);
  if (!Number.isFinite(distance) || distance > CAMERA_RADIUS_METERS) {
    return { allowed: false, reason: `現地モードでは、「？」の${CAMERA_RADIUS_METERS}m以内で撮ると発見できます。` };
  }
  return { allowed: true, reason: 'GPSが弱い場所でも、石碑や案内板の文字が写れば発見できます。' };
}

/**
 * A reproducible demo, not a walking-directions service. Times are fixtures;
 * coordinates are straight-line overview geometry, never road navigation.
 * The detour budget includes the complete visit time at each selected spot.
 * With topics, spots sharing more of them are chosen first; the walking order
 * stays the fixed geographic order of the candidate list.
 */
export function createDemoRoutes(
  destination: Destination,
  budget: Budget,
  spots: Spot[],
  origin: Coordinate,
  topicIds: string[] = [],
): RouteOption[] {
  const baselineSeconds = destination.id === 'city-hall' ? 9 * 60 : 12 * 60;
  const direct: RouteOption = {
    id: `demo-${destination.id}-direct`,
    kind: 'direct',
    label: 'まっすぐ向かう',
    walkingSeconds: baselineSeconds,
    visitSeconds: 0,
    totalSeconds: baselineSeconds,
    extraSeconds: 0,
    spotIds: [],
    coordinates: [origin, destination.coordinate],
    source: 'demo',
  };
  const addedWalkingSeconds = budget === 5 ? 3 * 60 : 7 * 60;
  const availableVisitSeconds = budget * 60 - addedWalkingSeconds;
  const candidates = ['sanjo-giboshi', 'ikedaya',
    destination.id === 'shijo-kawaramachi' ? 'zuisenji' : 'takase-ichino-funairi'];
  const pool = candidates
    .map((id, order) => ({ spot: spots.find((candidate) => candidate.id === id), order }))
    .filter((item): item is { spot: Spot; order: number } => Boolean(item.spot))
    .sort((a, b) => topicScore(b.spot, topicIds) - topicScore(a.spot, topicIds) || a.order - b.order);
  const chosen: { spot: Spot; order: number }[] = [];
  let visitSeconds = 0;
  for (const item of pool) {
    const { spot } = item;
    if (!isCoordinate(spot.coordinate)
      || !Number.isFinite(spot.visitMinutes) || spot.visitMinutes <= 0) continue;
    const duration = Math.ceil(spot.visitMinutes * 60);
    if (visitSeconds + duration > availableVisitSeconds) continue;
    chosen.push(item);
    visitSeconds += duration;
  }
  const selected = chosen.sort((a, b) => a.order - b.order).map((item) => item.spot);
  if (selected.length === 0) return [direct];
  const walkingSeconds = baselineSeconds + addedWalkingSeconds;
  const discovery: RouteOption = {
    id: `demo-${destination.id}-discovery-${budget}`,
    kind: 'discovery',
    label: '発見のある道',
    walkingSeconds,
    visitSeconds,
    totalSeconds: walkingSeconds + visitSeconds,
    extraSeconds: addedWalkingSeconds + visitSeconds,
    spotIds: selected.map((spot) => spot.id),
    coordinates: [origin, ...selected.map((spot) => spot.coordinate), destination.coordinate],
    source: 'demo',
  };
  return [direct, discovery];
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, , timezone] = parts;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const daysInMonth = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (timezone !== 'Z'
    && (Number(timezone.slice(1, 3)) > 23 || Number(timezone.slice(4, 6)) > 59)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function sanitizeDiscoveries(raw: unknown, validIds: string[]): Discovery[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(validIds);
  const seen = new Set<string>();
  const cleaned: Discovery[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.spotId !== 'string' || !valid.has(candidate.spotId)
      || (candidate.mode !== 'demo' && candidate.mode !== 'gps')) continue;
    const discoveredAt = normalizeIsoDate(candidate.discoveredAt);
    if (!discoveredAt) continue;
    const key = JSON.stringify([candidate.spotId, candidate.mode]);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ spotId: candidate.spotId, mode: candidate.mode, discoveredAt });
  }
  return cleaned;
}

export function addDiscovery(existing: Discovery[], spotId: string, mode: Mode, now = Date.now()): Discovery[] {
  const cleaned = sanitizeDiscoveries(existing, existing.map((discovery) => discovery.spotId));
  if (!spotId.trim() || (mode !== 'demo' && mode !== 'gps') || !Number.isFinite(now)
    || !Number.isFinite(new Date(now).getTime())) return cleaned;
  if (cleaned.some((discovery) => discovery.spotId === spotId && discovery.mode === mode)) return cleaned;
  return [...cleaned, { spotId, mode, discoveredAt: new Date(now).toISOString() }];
}
