import type { Coordinate, Destination, Spot, StoryVariant, Topic } from '../types';
import catalog from './catalog.json';
import stories from './stories.json';

// Shared with the routes server. Provenance and field-verification limits: docs/SOURCES.md.
export const SPOTS: Spot[] = catalog.spots;
export const DESTINATIONS: Destination[] = catalog.destinations;
export const DEMO_ORIGIN: Coordinate = catalog.demoOrigin;
export const TOPICS: Topic[] = catalog.topics;
// Gemini drafts that a person has checked against the sources. Drafts never reach users.
export const STORIES: StoryVariant[] = (stories as StoryVariant[]).filter((story) => story.reviewStatus === 'verified');
