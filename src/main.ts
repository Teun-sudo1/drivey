import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/share-tech-mono/400.css';
import './ui/styles/tokens.css';
import './ui/styles/layout.css';
import './ui/styles/components.css';

import { Ambience } from './audio/ambience';
import { AudioEngine } from './audio/engine';
import { Effects } from './audio/effects';
import { Engine } from './app/engine';
import { startLoop } from './app/loop';
import { DURATION_LIMITS, SettingsStore, type DriveSide, type DurationKey, type ToggleKey } from './app/settings';
import { MusicPlayer } from './music/player';
import { getPlatform } from './platform';
import { ROUTES, type RouteId } from './routes';
import { Backdrop } from './scene/backdrop';
import { ChunkPool, shelterAt } from './scene/chunkPool';
import { Cockpit } from './scene/cockpit/cockpit';
import { Drive } from './scene/drive';
import { createLights, setLightsSide } from './scene/lights';
import { PostFx } from './scene/postfx';
import { RoadSurface } from './scene/roadSurface';
import { Stage } from './scene/stage';
import { Traffic } from './traffic/traffic';
import { startTimerDriver } from './timer/driver';
import { Pomodoro } from './timer/pomodoro';
import { createControlSurface } from './ui/controlSurface';
import { $ } from './ui/dom';
import { toggleFullscreen } from './ui/fullscreen';
import { createHud, phaseName } from './ui/hud';
import { createIdleFade } from './ui/idle';
import { bindShortcuts } from './ui/shortcuts';
import { createSoundPanel } from './ui/soundPanel';
import { createStartScreen } from './ui/startScreen';
import { toast } from './ui/toast';
import { mountSegmented, mountStepper, mountSwitch } from './ui/widgets';
import { Environment } from './weather/environment';
import { Particles } from './weather/particles';
import { TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from './weather/tables';
import { createWindshield } from './weather/windshield';

const MIRROR_GAP_PX = 8;
const MOBILE_PARTICLES = 1100;
const DESKTOP_PARTICLES = 2000;

const platform = getPlatform();
const settings = await SettingsStore.load(platform.storage);

/* Scene */
let route = ROUTES[settings.value.route];
const engine = new Engine();
const stage = new Stage($<HTMLCanvasElement>('#gl'));
const postfx = new PostFx(stage);
const lights = createLights(stage.scene);
const cockpit = new Cockpit(stage.camera, route.name);
const backdrop = new Backdrop(stage.scene, route);
const roadSurface = new RoadSurface(stage, route);
const pool = new ChunkPool(stage.scene, route);
const drive = new Drive(stage, pool, backdrop, cockpit, route);
const traffic = new Traffic(stage.scene, route);
cockpit.mirror.setLamps(route.mirrorLamps);
const particles = new Particles(stage.scene, matchMedia('(pointer: coarse)').matches ? MOBILE_PARTICLES : DESKTOP_PARTICLES);
engine.onChange(state => cockpit.setEngine(state));
const startScreen = createStartScreen(engine);
const environment = new Environment(stage, lights, postfx, cockpit, backdrop, particles);
const windshield = createWindshield($<HTMLCanvasElement>('#glass'), stage.camera, cockpit.roof, cockpit.glassOccluders, route.lampTint);

/* Sound */
const audio = new AudioEngine();
const ambience = new Ambience(audio);
const effects = new Effects(audio);
const player = new MusicPlayer(audio);
windshield.onStroke(() => effects.swish());
// Turning the key is the gesture that lets the browser make sound.
for (const type of ['pointerdown', 'keydown'] as const) $('#ignition').addEventListener(type, () => audio.unlock());
engine.onChange(state => {
  if (state === 'acc' || state === 'on') effects.click();
});

/** Music plays once the engine runs, unless it has been switched off. */
function applyMusic(): void {
  const s = settings.value;
  audio.setMuted(s.muted);
  player.setStyle(s.style);
  const wanted = s.musicOn && engine.running;
  if (wanted !== player.playing) {
    if (wanted) player.play();
    else player.pause();
  }
}
settings.onChange(applyMusic);
engine.onChange(applyMusic);
applyMusic();

/* Timer */
const timer = new Pomodoro(() => settings.value);
startTimerDriver(timer);
timer.onChange(() => platform.keepAwake.set(timer.running));
timer.onPhaseEnd(({ next }) => {
  effects.chime();
  toast(next === 'focus' ? 'Break over. Back on the road.' : 'Nice work. Time for a break.');
});

/* UI */
const hud = createHud(
  timer,
  () => settings.value.every,
  () => `${ROUTES[settings.value.route].name} · ${TIMES_OF_DAY[settings.value.tod].name} · ${WEATHERS[settings.value.weather].name}`,
  (txt, label) => cockpit.showTime(txt, label)
);
const surface = createControlSurface(() => idle.wake());
const topBar = $('#top');
stage.onResize(() => stage.setMirrorTop(topBar.getBoundingClientRect().bottom + MIRROR_GAP_PX));
const idle = createIdleFade(() => timer.running && !surface.isOpen());

$('#btnSkip').addEventListener('click', () => {
  timer.skip();
  toast(`Skipped to ${phaseName(timer.phase).toLowerCase()}`);
});
$('#btnFull').addEventListener('click', () => void toggleFullscreen());
bindShortcuts({
  togglePlay: () => {
    if (engine.running) timer.toggle();
  },
  toggleMute: () => {
    settings.update({ muted: !settings.value.muted });
    toast(settings.value.muted ? 'Sound off' : 'Sound on');
  },
  toggleFullscreen,
  toggleHidden: () => idle.toggleHidden()
});

const options = <T extends string>(table: Record<T, { name: string }>) => (Object.keys(table) as T[]).map(k => [k, table[k].name] as const);
// The same controls appear on the start screen and in settings, so changes refresh both.
const sceneControls = [
  ...[$('#segRoute'), $('#startRoute')].map(el => mountSegmented<RouteId>(el, options(ROUTES), () => settings.value.route, route => settings.update({ route }))),
  ...[$('#segSide'), $('#startSide')].map(el => mountSegmented<DriveSide>(el, [['left', 'Left'], ['right', 'Right']], () => settings.value.driveSide, driveSide => settings.update({ driveSide }))),
  ...[$('#segTod'), $('#startTod')].map(el => mountSegmented<TimeOfDayId>(el, options(TIMES_OF_DAY), () => settings.value.tod, tod => settings.update({ tod }))),
  ...[$('#segWeather'), $('#startWeather')].map(el => mountSegmented<WeatherId>(el, options(WEATHERS), () => settings.value.weather, weather => settings.update({ weather })))
];
const refreshSoundPanel = createSoundPanel(settings, player);
settings.onChange(() => {
  hud.render();
  for (const refresh of sceneControls) refresh();
  refreshSoundPanel();
});

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

/** Swaps the road, scenery and traffic for another route, without stopping the car. */
function applyRoute(): void {
  const next = ROUTES[settings.value.route];
  if (next === route) return;
  route = next;
  pool.setRoute(route);
  backdrop.setRoute(route);
  traffic.setRoute(route);
  drive.setRoute(route);
  roadSurface.setRoute(route);
  windshield.setLampTint(route.lampTint);
  cockpit.setRouteName(route.name);
  cockpit.mirror.setLamps(route.mirrorLamps);
  environment.refresh();
}
settings.onChange(applyRoute);

function applyDriveSide(): void {
  const side = settings.value.driveSide === 'right' ? -1 : 1;
  pool.setSide(side);
  backdrop.setSide(side);
  traffic.setSide(side);
  cockpit.setSide(side);
  roadSurface.setSide(side);
  setLightsSide(lights, side);
}
settings.onChange(applyDriveSide);
applyDriveSide();

// Canvas text drawn before the web fonts arrive falls back to system fonts.
void Promise.all(['600 15px Inter', '14px Inter', '54px "Share Tech Mono"'].map(font => document.fonts.load(font))).then(() => {
  cockpit.invalidateText();
  hud.render();
});

let shelter = 0;

function simulate(dt: number): void {
  const s = settings.value;
  stage.updateFraming(dt, s.reduced);
  const ignitionOn = engine.state === 'on' || engine.state === 'running';
  environment.update(dt, s.tod, s.weather, ignitionOn);
  drive.update(dt, engine.state, s.breakSlow && timer.phase !== 'focus', s.reduced, environment.lampLevel);
  traffic.update(dt, drive.speed, environment.headlightLevel);
  cockpit.update(dt, drive.speed, drive.bend, drive.clock);
  const shelters = pool.shelters();
  // Nothing falls inside a tunnel; the camera sits at z = 0.
  const open = 1 - shelterAt(shelters, 0);
  shelter = 1 - open;
  particles.update({ dt, speed: drive.speed, clock: drive.clock, rain: environment.rainLevel * open, snow: environment.snowLevel * open, reducedMotion: s.reduced });
  windshield.update({ dt, speed: drive.speed, weather: WEATHERS[s.weather], lamp: environment.lampLevel, wipersOn: ignitionOn, mirrored: s.driveSide === 'right', shelter: 1 - open });
  roadSurface.setLevels(environment.wetLevel, environment.snowLevel, environment.headlightLevel);
  roadSurface.setShelters(shelters);
}

startLoop(dt => {
  simulate(dt);
  const s = settings.value;
  // Once a frame rather than per simulated step, as each call schedules audio changes.
  ambience.update({ dt, weather: WEATHERS[s.weather], route: s.route, speed: drive.speed, engine: engine.state, mix: s.mix, follow: s.follow, shelter });
  windshield.draw();
  roadSurface.render();
  postfx.render(settings.value.bloom);
});

// Lets the browser tests read scene state. Compiled out of the public build.
if (import.meta.env.MODE === 'e2e') {
  Object.assign(window, { __drivey: { simulate, engine, startScreen, stage, postfx, pool, backdrop, traffic, cockpit, drive, audio, ambience, effects, player, environment, particles, windshield, roadSurface, timer, settings } });
}
