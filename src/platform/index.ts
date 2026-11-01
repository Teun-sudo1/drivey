import type { Platform } from './types';
import { createWebPlatform } from './web';

export type { Platform } from './types';

/** A Capacitor implementation gets selected here once the iOS shell exists. */
export function getPlatform(): Platform {
  return createWebPlatform();
}
