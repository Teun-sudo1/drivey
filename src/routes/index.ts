import { city } from './city';
import { coast } from './coast';
import { country } from './country';
import { highway } from './highway';
import type { RouteDefinition } from './types';

export type RouteId = 'city' | 'coast' | 'highway' | 'country';

export const ROUTES: Record<RouteId, RouteDefinition> = { city, coast, highway, country };
