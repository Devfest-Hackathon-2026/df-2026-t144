import type { Budget, Coordinate, RouteOption } from './types';
import { ApiError, postJson } from './apiClient';

export async function fetchRoutes(origin: Coordinate, destinationId: string, budgetMinutes: Budget, topicIds: string[] = []): Promise<{ routes: RouteOption[]; warnings: string[] }> {
  let data: { routes?: unknown; warnings?: unknown };
  try {
    data = await postJson('/v1/routes', { origin, destinationId, budgetMinutes, topicIds }, 30_000);
  } catch (error) {
    throw new Error(error instanceof ApiError && error.code === 'NOT_CONNECTED' ? '経路サーバーが未接続です。' : error instanceof Error ? error.message : '経路を取得できませんでした。');
  }
  const routes = data.routes as RouteOption[];
  if (!Array.isArray(routes) || !routes.length || routes.some((r) => r.source !== 'google' || !Number.isFinite(r.totalSeconds) || !Array.isArray(r.spotIds) || !Array.isArray(r.coordinates))) throw new Error('経路の応答を確認できませんでした。');
  return { routes, warnings: Array.isArray(data.warnings) ? data.warnings.filter((v: unknown): v is string => typeof v === 'string') : [] };
}

/** Road line for the demo's fixed stop order. Only for drawing on a Google map. */
export async function fetchPath(origin: Coordinate, destinationId: string, spotIds: string[]): Promise<Coordinate[]> {
  const data = await postJson<{ coordinates?: unknown }>('/v1/path', { origin, destinationId, spotIds }, 15_000);
  const coordinates = data.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2
    || coordinates.some((p) => !p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))) throw new Error('経路の応答を確認できませんでした。');
  return coordinates as Coordinate[];
}
