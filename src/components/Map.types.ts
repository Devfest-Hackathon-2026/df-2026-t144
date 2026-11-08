import type { Coordinate, Destination, RouteOption, Spot } from '../types';
export type MapProps = {
  spots: Spot[];
  discoveredIds: string[];
  route: RouteOption | null;
  destination: Destination;
  position: Coordinate | null;
  selectedId?: string;
  onSelect: (id: string) => void;
};
