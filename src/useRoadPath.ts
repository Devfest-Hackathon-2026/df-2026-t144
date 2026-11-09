import { useEffect, useState } from 'react';
import type { Coordinate, RouteOption } from './types';
import { apiConfigured } from './apiClient';
import { fetchPath } from './routesClient';

// Kept in memory for this session only (Routes API terms); never stored.
const lines = new Map<string, Coordinate[]>();
const pending = new Map<string, Promise<Coordinate[] | null>>();

/**
 * Demo routes are straight sketch lines. Where the map is a Google map, ask the
 * server once for the road line of the same stop order and draw that instead.
 * Times and stops stay the demo's fixtures. On any failure the sketch line stays.
 */
export function useRoadPath(route: RouteOption | null, origin: Coordinate, destinationId: string, googleMap: boolean): RouteOption | null {
  const key = route && route.source === 'demo' ? `${destinationId}:${route.spotIds.join(',')}` : null;
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!key || !route || !googleMap || !apiConfigured || lines.has(key)) return;
    let alive = true;
    let request = pending.get(key);
    if (!request) {
      request = fetchPath(origin, destinationId, route.spotIds).catch(() => null);
      pending.set(key, request);
    }
    void request.then((line) => {
      if (line) lines.set(key, line);
      if (alive) setVersion((value) => value + 1);
    });
    return () => { alive = false; };
  }, [key, googleMap]);
  const line = key && googleMap ? lines.get(key) : undefined;
  return route && line ? { ...route, coordinates: line, source: 'google' } : route;
}
