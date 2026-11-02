import { toast } from './toast';

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Refused, as when not started by a tap.
    toast('Fullscreen is not available here');
  }
}

/** iPhone Safari and a native shell's web view have no fullscreen; there the button would do nothing. */
export const canFullscreen = (): boolean => document.fullscreenEnabled === true;
