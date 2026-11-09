import { readFile } from 'node:fs/promises';

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const WALK_WARNING = 'Google の徒歩経路はベータ版です。歩道や歩行者用通路が含まれない場合があります。現地の標識と安全を確認してください。';

export class RouteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function loadCatalog() {
  return JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
}

export function validateInput(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RouteError(400, 'INVALID_INPUT', '出発地点・目的地・寄り道時間を指定してください。');
  }
  const { origin, destinationId, budgetMinutes } = input;
  if (!origin || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)) {
    throw new RouteError(400, 'INVALID_ORIGIN', '出発地点の緯度経度が不正です。');
  }
  // The pilot supports this small part of Kyoto, not arbitrary billed global requests.
  if (origin.latitude < 35.0 || origin.latitude > 35.025 || origin.longitude < 135.755 || origin.longitude > 135.785) {
    throw new RouteError(422, 'OUTSIDE_AREA', '現在の対象地域は京都・三条周辺です。対象地域で再度お試しください。');
  }
  const destination = catalog.destinations.find((item) => item.id === destinationId);
  if (!destination) throw new RouteError(400, 'INVALID_DESTINATION', '登録された目的地を選んでください。');
  if (budgetMinutes !== 5 && budgetMinutes !== 10) {
    throw new RouteError(400, 'INVALID_BUDGET', '寄り道時間は5分または10分を選んでください。');
  }
  if (input.topicIds !== undefined && !Array.isArray(input.topicIds)) {
    throw new RouteError(400, 'INVALID_TOPICS', '興味の指定が不正です。');
  }
  const known = new Set((catalog.topics ?? []).map((topic) => topic.id));
  const topicIds = [...new Set((input.topicIds ?? []).filter((id) => known.has(id)))].slice(0, 3);
  return { origin: { latitude: origin.latitude, longitude: origin.longitude }, destination, budgetMinutes, topicIds };
}

function topicScore(stops, topicIds) {
  return stops.reduce((sum, spot) => sum + (spot.topics ?? []).filter((id) => topicIds.includes(id)).length, 0);
}

export function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 200_000) {
    throw new RouteError(502, 'INVALID_ROUTE', '経路の形状を取得できませんでした。');
  }
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  function nextDelta() {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      if (index >= encoded.length || shift > 30) throw new RouteError(502, 'INVALID_ROUTE', '経路データの形式が不正です。');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new RouteError(502, 'INVALID_ROUTE', '経路データの形式が不正です。');
      value |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return value & 1 ? ~(value >> 1) : value >> 1;
  }
  while (index < encoded.length) {
    latitude += nextDelta();
    longitude += nextDelta();
    const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
      throw new RouteError(502, 'INVALID_ROUTE', '経路の座標が不正です。');
    }
    points.push(point);
  }
  if (points.length < 2) throw new RouteError(502, 'INVALID_ROUTE', '経路の形状を取得できませんでした。');
  return points;
}

function distanceSquared(a, b) {
  return (a.latitude - b.latitude) ** 2 + ((a.longitude - b.longitude) * 0.819) ** 2;
}

// With at most three stopovers, evaluating all permutations is cheap and does
// not require Google's paid waypoint-optimization option. It is only a local
// straight-line heuristic; Google subsequently computes actual walking times.
function orderStops(stops, origin, destination) {
  const permutations = (items) => items.length <= 1 ? [items] : items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map((rest) => [item, ...rest]));
  const length = (order) => [origin, ...order.map((s) => s.coordinate), destination].reduce((sum, point, i, all) => i === 0 ? 0 : sum + Math.sqrt(distanceSquared(all[i - 1], point)), 0);
  return permutations(stops).sort((a, b) => length(a) - length(b))[0];
}

function candidateStops(catalog, budgetMinutes, origin, destination) {
  const ids = [
    ['sanjo-giboshi', 'ikedaya'],
    ['sanjo-giboshi', 'zuisenji'],
    ...(budgetMinutes === 10 ? [['ikedaya', 'zuisenji', 'takase-ichino-funairi']] : []),
  ];
  return ids.map((group) => group.map((id) => catalog.spots.find((spot) => spot.id === id)))
    .filter((group) => group.every(Boolean))
    .map((group) => orderStops(group, origin, destination));
}

async function requestWalkingRoute({ origin, destination, stops, apiKey, fetchImpl, beforeGoogleCall, timeoutMs }) {
  beforeGoogleCall();
  const waypoint = (coordinate) => ({ location: { latLng: coordinate } });
  let response;
  let body;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      // A server key must never follow a redirect to a different endpoint.
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline,routes.warnings',
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        intermediates: stops.map((spot) => waypoint(spot.coordinate)),
        travelMode: 'WALK',
        computeAlternativeRoutes: false,
        polylineQuality: 'OVERVIEW',
        languageCode: 'ja-JP',
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new RouteError(response.status === 429 ? 503 : 502, 'GOOGLE_UNAVAILABLE', 'Google の経路計算を利用できません。API設定と利用上限を確認してください。');
    }
    body = await response.json();
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError(502, 'GOOGLE_UNAVAILABLE', '経路を取得できませんでした。接続を確認してもう一度お試しください。');
  }
  const route = body?.routes?.[0];
  if (!route) return null;
  if (typeof route.duration !== 'string' || !/^\d+(?:\.\d+)?s$/.test(route.duration)) {
    throw new RouteError(502, 'INVALID_ROUTE', '経路の所要時間を取得できませんでした。');
  }
  const seconds = Math.ceil(Number(route.duration.slice(0, -1)));
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) {
    throw new RouteError(502, 'INVALID_ROUTE', '経路の所要時間が不正です。');
  }
  return {
    seconds,
    coordinates: decodePolyline(route.polyline?.encodedPolyline),
    warnings: Array.isArray(route.warnings) ? route.warnings.filter((item) => typeof item === 'string').slice(0, 10) : [],
  };
}

export async function computeRoutes(input, {
  catalog,
  apiKey,
  fetchImpl = fetch,
  beforeGoogleCall = () => {},
  timeoutMs = 8_000,
}) {
  const { origin, destination, budgetMinutes, topicIds } = validateInput(input, catalog);
  if (!apiKey) throw new RouteError(503, 'NOT_CONFIGURED', 'Google Routes API が未設定です。デモモードをご利用ください。');
  const query = (stops) => requestWalkingRoute({ origin, destination: destination.coordinate, stops, apiKey, fetchImpl, beforeGoogleCall, timeoutMs });
  const direct = await query([]);
  if (!direct) throw new RouteError(422, 'NO_ROUTE', 'この場所から目的地までの徒歩経路が見つかりませんでした。');
  const baseline = {
    id: `google-${destination.id}-direct`, kind: 'direct', label: 'いつもの道',
    walkingSeconds: direct.seconds, visitSeconds: 0, totalSeconds: direct.seconds, extraSeconds: 0,
    spotIds: [], coordinates: direct.coordinates, source: 'google',
  };
  const groups = candidateStops(catalog, budgetMinutes, origin, destination.coordinate);
  // Wait for all bounded calls even when one fails. Otherwise the HTTP handler
  // would release its concurrency slot while sibling Google calls still run.
  const results = await Promise.allSettled(groups.map(async (stops) => {
    const route = await query(stops);
    if (!route) return null;
    const visitSeconds = stops.reduce((sum, spot) => sum + spot.visitMinutes * 60, 0);
    const totalSeconds = route.seconds + visitSeconds;
    const extraSeconds = Math.max(0, totalSeconds - direct.seconds);
    if (extraSeconds > budgetMinutes * 60) return null;
    return {
      option: {
        id: `google-${destination.id}-${stops.map((spot) => spot.id).join('-')}`,
        kind: 'discovery', label: '発見のある道',
        walkingSeconds: route.seconds, visitSeconds, totalSeconds, extraSeconds,
        spotIds: stops.map((spot) => spot.id), coordinates: route.coordinates, source: 'google',
      },
      warnings: route.warnings,
      score: topicScore(stops, topicIds),
    };
  }));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  const candidates = results.map((result) => result.value);
  // More discoveries first, then more of the user's topics, then the shorter detour.
  const best = candidates.filter(Boolean).sort((a, b) => b.option.spotIds.length - a.option.spotIds.length
    || b.score - a.score || a.option.extraSeconds - b.option.extraSeconds)[0];
  return {
    routes: best ? [baseline, best.option] : [baseline],
    attribution: 'Google Maps',
    warnings: [...new Set([WALK_WARNING, ...direct.warnings, ...(best?.warnings ?? [])])],
  };
}

/**
 * Road geometry for a stop order the app already chose (the reproducible demo
 * route). One Routes API call; times stay the demo's fixtures, so only the line
 * changes. The polyline may only be drawn on a Google map, and the app keeps it
 * in memory for the session only.
 */
export async function computePath(input, {
  catalog,
  apiKey,
  fetchImpl = fetch,
  beforeGoogleCall = () => {},
  timeoutMs = 8_000,
}) {
  const { origin, destination } = validateInput({ ...input, budgetMinutes: 5 }, catalog);
  const ids = input.spotIds;
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length) {
    throw new RouteError(400, 'INVALID_STOPS', '立ち寄る「？」の指定が不正です。');
  }
  const stops = ids.map((id) => catalog.spots.find((spot) => spot.id === id));
  if (stops.some((spot) => !spot)) throw new RouteError(400, 'INVALID_STOPS', '登録された「？」を指定してください。');
  if (!apiKey) throw new RouteError(503, 'NOT_CONFIGURED', 'Google Routes API が未設定です。');
  const route = await requestWalkingRoute({ origin, destination: destination.coordinate, stops, apiKey, fetchImpl, beforeGoogleCall, timeoutMs });
  if (!route) throw new RouteError(422, 'NO_ROUTE', '徒歩経路が見つかりませんでした。');
  return { coordinates: route.coordinates, attribution: 'Google Maps' };
}
