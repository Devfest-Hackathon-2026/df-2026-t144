import type { Coordinate, Destination, Spot } from '../types';
import catalog from './catalog.json';

// Shared with the routes server. Provenance and field-verification limits: docs/SOURCES.md.
export const SPOTS: Spot[] = catalog.spots;
export const DESTINATIONS: Destination[] = catalog.destinations;
export const DEMO_ORIGIN: Coordinate = catalog.demoOrigin;
