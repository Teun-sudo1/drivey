import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/share-tech-mono/400.css';
import './ui/styles/tokens.css';
import './ui/styles/layout.css';
import './ui/styles/components.css';

import { startLoop } from './app/loop';
import { DURATION_LIMITS, SettingsStore, type DurationKey, type ToggleKey } from './app/settings';
import { getPlatform } from './platform';
import { ROUTES } from './routes';
import { Backdrop } from './scene/backdrop';
import { ChunkPool } from './scene/chunkPool';
import { Cockpit } from './scene/cockpit/cockpit';
import { Drive } from './scene/drive';
import { createLights } from './scene/lights';
import { PostFx } from './scene/postfx';
import { Stage } from './scene/stage';
import { startTimerDriver } from './timer/driver';
import { Pomodoro } from './timer/pomodoro';
import { createControlSurface } from './ui/controlSurface';
import { $ } from './ui/dom';
import { toggleFullscreen } from './ui/fullscreen';
import { createHud, phaseName } from './ui/hud';
import { createIdleFade } from './ui/idle';
import { bindShortcuts } from './ui/shortcuts';
import { toast } from './ui/toast';
import { mountSegmented, mountStepper, mountSwitch } from './ui/widgets';
import { Environment } from './weather/environment';
import { Particles } from './weather/particles';
import { TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from './weather/tables';
import { createWindshield } from './weather/windshield';

const MOBILE_PARTICLES = 1100;
const DESKTOP_PARTICLES = 2000;

const platform = getPlatform();
const settings = await SettingsStore.load(platform.storage);

/* Scene */
const route = ROUTES[settings.value.route];
const stage = new Stage($<HTMLCanvasElement>('#gl'));
const postfx = new PostFx(stage);
const lights = createLights(stage.scene);
const cockpit = new Cockpit(stage.camera, route.name);
const backdrop = new Backdrop(stage.scene, route);
const pool = new ChunkPool(stage.scene, route);
const drive = new Drive(stage, pool, backdrop, cockpit, route);
const particles = new Particles(stage.scene, matchMedia('(pointer: coarse)').matches ? MOBILE_PARTICLES : DESKTOP_PARTICLES);
const environment = new Environment(stage, lights, postfx, cockpit, backdrop, particles);
const windshield = createWindshield($<HTMLCanvasElement>('#glass'), stage.camera, cockpit.roof, cockpit.glassOccluders, route.lampTint);

/* Timer */
const timer = new Pomodoro(() => settings.value);
startTimerDriver(timer);
timer.onChange(() => platform.keepAwake.set(timer.running));
timer.onPhaseEnd(({ next }) => {
  toast(next === 'focus' ? 'Break over. Back on the road.' : 'Nice work. Time for a break.');
});

/* UI */
const hud = createHud(
  timer,
  () => settings.value.every,
  () => `${route.name} · ${TIMES_OF_DAY[settings.value.tod].name} · ${WEATHERS[settings.value.weather].name}`,
  (txt, label) => cockpit.showTime(txt, label)
);
const surface = createControlSurface(() => idle.wake());
const idle = createIdleFade(() => timer.running && !surface.isOpen());

$('#btnSkip').addEventListener('click', () => {
  timer.skip();
  toast(`Skipped to ${phaseName(timer.phase).toLowerCase()}`);
});
$('#btnFull').addEventListener('click', () => void toggleFullscreen());
bindShortcuts({
  togglePlay: () => timer.toggle(),
  toggleFullscreen,
  toggleHidden: () => idle.toggleHidden()
});

const options = <T extends string>(table: Record<T, { name: string }>) => (Object.keys(table) as T[]).map(k => [k, table[k].name] as const);
mountSegmented<TimeOfDayId>($('#segTod'), options(TIMES_OF_DAY), () => settings.value.tod, tod => settings.update({ tod }));
mountSegmented<WeatherId>($('#segWeather'), options(WEATHERS), () => settings.value.weather, weather => settings.update({ weather }));
settings.onChange(() => hud.render());

for (const row of document.querySelectorAll<HTMLElement>('.tog')) {
  const key = row.dataset.k as ToggleKey;
  mountSwitch(row, () => settings.value[key], on => settings.update({ [key]: on }));
}
for (const row of document.querySelectorAll<HTMLElement>('.num')) {
  const key = row.dataset.n as DurationKey;
  mountStepper(row, () => settings.value[key], v => {
    settings.update({ [key]: v });
    timer.syncDurations();
  }, DURATION_LIMITS[key]);
}

function applyBodyFlags(): void {
  const { grain, vignette, reduced } = settings.value;
  document.body.classList.toggle('nograin', !grain);
  document.body.classList.toggle('novignette', !vignette);
  document.body.classList.toggle('reduced', reduced);
}
settings.onChange(applyBodyFlags);
applyBodyFlags();

// Canvas text drawn before the web fonts arrive falls back to system fonts.
void Promise.all(['600 15px Inter', '14px Inter', '54px "Share Tech Mono"'].map(font => document.fonts.load(font))).then(() => {
  cockpit.invalidateText();
  hud.render();
});

startLoop(dt => {
  const s = settings.value;
  stage.updateFraming(dt, s.reduced);
  environment.update(dt, s.tod, s.weather);
  drive.update(dt, s.breakSlow && timer.phase !== 'focus', s.reduced, environment.lampLevel);
  cockpit.update(dt, drive.speed, drive.bend, drive.clock);
  particles.update({ dt, speed: drive.speed, clock: drive.clock, rain: environment.rainLevel, snow: environment.snowLevel, reducedMotion: s.reduced });
  windshield.update({ dt, speed: drive.speed, weather: WEATHERS[s.weather], lamp: environment.lampLevel });
  postfx.render(s.bloom);
});
