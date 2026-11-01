import { city } from './city';
import type { RouteDefinition } from './types';

export type RouteId = 'city';

export const ROUTES: Record<RouteId, RouteDefinition> = { city };
