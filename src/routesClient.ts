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
