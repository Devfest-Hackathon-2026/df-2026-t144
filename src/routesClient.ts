import type { Budget, Coordinate, RouteOption } from './types';

export const routesServerUrl = process.env.EXPO_PUBLIC_ROUTES_URL?.replace(/\/$/, '') ?? '';
export async function fetchRoutes(origin: Coordinate, destinationId: string, budgetMinutes: Budget): Promise<{ routes: RouteOption[]; warnings: string[] }> {
  if (!routesServerUrl) throw new Error('経路サーバーが未接続です。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${routesServerUrl}/v1/routes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destinationId, budgetMinutes }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || '経路を取得できませんでした。');
    if (!Array.isArray(data.routes) || !data.routes.length || data.routes.some((r: RouteOption) => r.source !== 'google' || !Number.isFinite(r.totalSeconds) || !Array.isArray(r.spotIds) || !Array.isArray(r.coordinates))) throw new Error('経路の応答を確認できませんでした。');
    return { routes: data.routes, warnings: Array.isArray(data.warnings) ? data.warnings.filter((v: unknown) => typeof v === 'string') : [] };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('経路の取得に時間がかかっています。もう一度お試しください。');
    throw error;
  } finally { clearTimeout(timeout); }
}
