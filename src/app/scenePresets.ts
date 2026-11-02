import type { StyleId } from '../music/styles';
import type { RouteId } from '../routes';
import type { TimeOfDayId, WeatherId } from '../weather/tables';

/** A one-tap drive: where, when, what weather, and the music that suits it. */
export interface ScenePreset {
  name: string;
  route: RouteId;
  tod: TimeOfDayId;
  weather: WeatherId;
  style: StyleId;
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  { name: 'Rainy city night', route: 'city', tod: 'night', weather: 'rain', style: 'chillhop' },
  { name: 'Storm on the expressway', route: 'city', tod: 'dusk', weather: 'heavy', style: 'jazzy' },
  { name: 'Foggy coast at dusk', route: 'coast', tod: 'dusk', weather: 'fog', style: 'ambient' },
  { name: 'Neon highway', route: 'highway', tod: 'night', weather: 'clear', style: 'synthwave' },
  { name: 'Snowy countryside', route: 'country', tod: 'night', weather: 'snow', style: 'rainycafe' },
  { name: 'Sunday drive', route: 'country', tod: 'day', weather: 'clear', style: 'jazzy' }
];

/** The preset the current settings match, if any; the music style may differ. */
export function matchingPreset(s: { route: RouteId; tod: TimeOfDayId; weather: WeatherId }): ScenePreset | undefined {
  return SCENE_PRESETS.find(p => p.route === s.route && p.tod === s.tod && p.weather === s.weather);
}
