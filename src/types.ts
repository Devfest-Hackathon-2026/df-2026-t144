export type Coordinate = { latitude: number; longitude: number };
export type Mode = 'demo' | 'gps';
export type Budget = 5 | 10;
/** An interest angle such as water or architecture. IDs are the contract with the server and Gemini. */
export type Topic = { id: string; label: string; keywords: string[] };
/** A fact checked against `sources[sourceIndex]`. Gemini may only rephrase these. */
export type Fact = { id: string; text: string; sourceIndex: number };
export type Spot = {
  id: string;
  name: string;
  category: string;
  coordinate: Coordinate;
  radiusMeters: number;
  hint: string;
  story: string;
  lookFor: string;
  sources: { title: string; url: string }[];
  relatedSpotIds: string[];
  /** Fixed one-liner shown when moving to a related spot; also the fallback for Gemini teasers. */
  relatedNotes: Partial<Record<string, string>>;
  /** Words that would reveal this spot before it is discovered. */
  spoilerWords: string[];
  topics: string[];
  facts: Fact[];
  visitMinutes: number;
  coordinateNote?: string;
};
/** A topic-specific story drafted by Gemini. Only `verified` entries reach users. */
export type StoryVariant = {
  spotId: string;
  topicId: string;
  text: string;
  usedFactIds: string[];
  reviewStatus: 'draft' | 'verified' | 'rejected';
  model: string;
  generatedAt: string;
  problems: string[];
  reviewedBy?: string;
  reviewNote?: string;
};
export type Destination = { id: string; name: string; subtitle: string; coordinate: Coordinate };
export type Discovery = { spotId: string; mode: Mode; discoveredAt: string };
export type LocationFix = Coordinate & { accuracy: number | null; timestamp: number };
export type RouteOption = {
  id: string;
  kind: 'direct' | 'discovery';
  label: string;
  walkingSeconds: number;
  visitSeconds: number;
  totalSeconds: number;
  extraSeconds: number;
  spotIds: string[];
  coordinates: Coordinate[];
  source: 'demo' | 'google';
};
