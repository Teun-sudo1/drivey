import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/share-tech-mono/400.css';
import './ui/styles/tokens.css';
import './ui/styles/layout.css';
import './ui/styles/components.css';

import { Ambience } from './audio/ambience';
import { AudioEngine } from './audio/audioEngine';
import { Effects } from './audio/effects';
import { CarEngine } from './app/carEngine';
import { startLoop } from './app/loop';
import { SCENE_PRESETS, matchingPreset } from './app/scenePresets';
import { QUALITY, resolveQuality, type QualityId } from './app/quality';
import { DURATION_LIMITS, SettingsStore, type DriveSide, type DurationKey, type SeatId, type ToggleKey } from './app/settings';
import { MusicPlayer } from './music/player';
import { getPlatform } from './platform';
import { ROUTES, type RouteId } from './routes';
import { Backdrop } from './scene/backdrop';
import { ChunkPool, shelterAt } from './scene/chunkPool';
import { Cockpit } from './scene/cockpit/cockpit';
import { Drive } from './scene/drive';
import { createLights, placeHeadlights } from './scene/lights';
import { CITY_NEON_MATERIALS, NEON_SIGN_MATERIALS, REST_SIGN_MATERIAL, SIGN_MATERIALS } from './scene/materials';
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
import { bindDashRadio } from './ui/dashRadio';
import { STATIONS } from './scene/cockpit/radio';
import { bindShortcuts } from './ui/shortcuts';
import { createSoundPanel } from './ui/soundPanel';
import { createStatsPanel } from './ui/statsPanel';
import { bindTask } from './ui/task';
import { createSessionCard } from './ui/sessionCard';
import { showTipsOnce } from './ui/tips';
import { createStartScreen } from './ui/startScreen';
import { toast } from './ui/toast';
import { mountSegmented, mountStepper, mountSwitch } from './ui/widgets';
import { Environment } from './weather/environment';
import { Particles } from './weather/particles';
import { LATER, TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from './weather/tables';
import { createWindshield } from './weather/windshield';

const MIRROR_GAP_PX = 8;

const platform = getPlatform();
const settings = await SettingsStore.load(platform.storage);

/* Scene */
let route = ROUTES[settings.value.route];
const engine = new CarEngine();
const stage = new Stage($<HTMLCanvasElement>('#gl'));
const postfx = new PostFx(stage);
// Signs are picked at random as the road is rebuilt; uploading them all now means none stalls a frame later.
for (const { map } of [...SIGN_MATERIALS, REST_SIGN_MATERIAL, ...NEON_SIGN_MATERIALS, ...CITY_NEON_MATERIALS]) if (map) stage.renderer.initTexture(map);
const lights = createLights(stage.scene);
const cockpit = new Cockpit(stage.camera, route.name);
const backdrop = new Backdrop(stage.scene, route);
const roadSurface = new RoadSurface(stage, route);
const pool = new ChunkPool(stage.scene, route);
const drive = new Drive(stage, pool, backdrop, cockpit, route);
const traffic = new Traffic(stage.scene, route);
cockpit.mirror.setLamps(route.mirrorLamps);
const particles = new Particles(stage.scene);
engine.onChange(state => cockpit.setEngine(state));
engine.onChange(state => {
  if (state === 'running') showTipsOnce(settings);
});
const environment = new Environment(stage, lights, postfx, cockpit, backdrop, particles);
const windshield = createWindshield($<HTMLCanvasElement>('#glass'), stage.camera, cockpit.roof, cockpit.glassOccluders, cockpit.sideWindows, route.lampTint);
settings.onChange(() => stage.setSeat(settings.value.seat));
stage.setSeat(settings.value.seat, true);
// The first visit picks a seat behind steamed-up glass, so the scenery is still a surprise.
windshield.setMisted(!settings.value.seatPicked, true);
cockpit.setCabinLight(!settings.value.seatPicked);
const startScreen = createStartScreen(engine, {
  needed: !settings.value.seatPicked,
  done: () => {
    settings.update({ seat: stage.seatFor(), seatPicked: true });
    windshield.setMisted(false);
    cockpit.setCabinLight(false);
  }
});

/* Sound */
const audio = new AudioEngine();
const ambience = new Ambience(audio);
const effects = new Effects(audio);
const player = new MusicPlayer(audio);
windshield.onStroke(() => effects.swish());
// Browsers only allow sound after a tap or key press, so the first one on the start screen
// starts it: quiet music while setting up, then the key turn and the engine.
engine.onChange(state => {
  if (state === 'acc' || state === 'on') effects.click();
});

/** Music plays once the engine runs, unless it has been switched off. */
function applyMusic(): void {
  const s = settings.value;
  audio.setMuted(s.muted);
  player.setStyle(s.style);
  const wanted = s.musicOn && audio.graph !== null;
  if (wanted !== player.playing) {
    if (wanted) player.play();
    else player.pause();
  }
}
settings.onChange(applyMusic);
for (const type of ['pointerdown', 'keydown'] as const) {
  $('#start').addEventListener(type, () => {
    audio.unlock();
    applyMusic();
  });
}
applyMusic();

/* Timer */
const timer = new Pomodoro(() => settings.value);
startTimerDriver(timer);
timer.onChange(() => platform.keepAwake.set(timer.running));
const stats = createStatsPanel(platform.sessions, platform.saveFile);
const sessionCard = createSessionCard();

/* The chime for the end of the running phase is scheduled as it starts, on the audio clock,
   so it rings on time even in a background tab, where timers run late. */
let chimeFor: number | null = null;
let cancelChime: (() => void) | null = null;
timer.onChange(() => {
  if (timer.endsAt === chimeFor) return;
  // Called off only if it hasn't rung yet; one whose phase just ended is left to finish.
  if (chimeFor !== null && Date.now() < chimeFor) cancelChime?.();
  cancelChime = timer.endsAt === null ? null : effects.chime((timer.endsAt - Date.now()) / 1000);
  chimeFor = cancelChime ? timer.endsAt : null;
  if (timer.running) sessionCard.hide();
});
timer.onPhaseEnd(({ ended, next, endedAt, minutes }) => {
  // Without sound when the phase started, nothing was scheduled.
  if (chimeFor !== endedAt) effects.chime();
  if (ended === 'focus') {
    const { task, route, tod, weather, followSession } = settings.value;
    // The evening that drew in over the session stays.
    if (followSession && LATER[tod] !== tod) settings.update({ tod: LATER[tod] });
    stats
      .record({ endedAt, minutes, task: task.trim(), route, tod, weather })
      .then(() => sessionCard.show({ task: task.trim(), minutes, ...stats.summary() }))
      .catch(() => toast('This session couldn’t be saved'));
  }
  toast(next === 'focus' ? 'Break over. Back on the road.' : 'Nice work. Time for a break.');
});

/* UI */
const hud = createHud(
  timer,
  () => settings.value.every,
  // The task, once there is one, says more than the scene the driver can already see.
  () => settings.value.task.trim() || `${ROUTES[settings.value.route].name} · ${TIMES_OF_DAY[settings.value.tod].name} · ${WEATHERS[settings.value.weather].name}`,
  (txt, label) => cockpit.showTime(txt, label)
);
// The stats tab re-reads the clock when opened, in case midnight has passed.
const surface = createControlSurface(() => idle.wake(), tab => {
  if (tab === 'stats') stats.render();
});
const topBar = $('#top');
stage.onResize(() => stage.setMirrorTop(topBar.getBoundingClientRect().bottom + MIRROR_GAP_PX));
const idle = createIdleFade(() => timer.running && !surface.isOpen());

// The timer's buttons click like dashboard switches. The HUD has already toggled the timer by now.
$('#btnPlay').addEventListener('click', () => effects.press(timer.running));
for (const id of ['#btnReset', '#btnSkip']) $(id).addEventListener('click', () => effects.press(false));
$('#btnSkip').addEventListener('click', () => {
  timer.skip();
  toast(`Skipped to ${phaseName(timer.phase).toLowerCase()}`);
});
$('#btnFull').addEventListener('click', () => void toggleFullscreen());
bindShortcuts({
  togglePlay: () => {
    if (!engine.running) return;
    timer.toggle();
    effects.press(timer.running);
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
const presetNames = SCENE_PRESETS.map(p => [p.name, p.name] as const);
const sceneControls = [
  ...[$('#segPreset'), $('#startPreset')].map(el =>
    mountSegmented<string>(el, presetNames, () => matchingPreset(settings.value)?.name ?? '', name => {
      const { route, tod, weather, style } = SCENE_PRESETS.find(p => p.name === name)!;
      settings.update({ route, tod, weather, style });
    })
  ),
  ...[$('#segRoute'), $('#startRoute')].map(el => mountSegmented<RouteId>(el, options(ROUTES), () => settings.value.route, route => settings.update({ route }))),
  ...[$('#segSide'), $('#startSide')].map(el => mountSegmented<DriveSide>(el, [['left', 'Left'], ['right', 'Right']], () => settings.value.driveSide, driveSide => settings.update({ driveSide }))),
  ...[$('#segSeat'), $('#startSeatChoice')].map((el, i) => mountSegmented<SeatId>(el, [...(i ? [] : [['auto', 'Auto'] as const]), ['close', 'Close to the wheel'], ['back', 'Sit back']], () => (i ? stage.seatFor() : settings.value.seat), seat => settings.update({ seat }))),
  mountSegmented<QualityId>($('#segQuality'), [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => settings.value.quality, q => settings.update({ quality: q })),
  ...[$('#segTod'), $('#startTod')].map(el => mountSegmented<TimeOfDayId>(el, options(TIMES_OF_DAY), () => settings.value.tod, tod => settings.update({ tod }))),
  ...[$('#segWeather'), $('#startWeather')].map(el => mountSegmented<WeatherId>(el, options(WEATHERS), () => settings.value.weather, weather => settings.update({ weather })))
];
const refreshSoundPanel = createSoundPanel(settings, player);
const refreshTask = bindTask(settings);
const showDashVolume = bindDashRadio($<HTMLCanvasElement>('#gl'), stage.camera, cockpit.radio, $<HTMLInputElement>('#dashVolume'), {
  volume: music => settings.update({ mix: { ...settings.value.mix, music } }),
  station: i => settings.update({ style: STATIONS[i], musicOn: true }),
  seek: () => player.next(),
  power: () => settings.update({ musicOn: !settings.value.musicOn })
});
/** The radio shows the music settings: station, volume and whether it's on. */
function applyRadio(): void {
  const { mix, style, musicOn } = settings.value;
  Object.assign(cockpit.radioState, { volume: mix.music, station: STATIONS.indexOf(style), on: musicOn });
  showDashVolume(mix.music);
}
settings.onChange(applyRadio);
applyRadio();
cockpit.radioState.dial = cockpit.radioState.station;
settings.onChange(() => {
  hud.render();
  for (const refresh of sceneControls) refresh();
  refreshSoundPanel();
  refreshTask();
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

/** Resolution, reflection, particles and bloom, scaled together by the quality setting. */
const touchScreen = matchMedia('(pointer: coarse)').matches;
let quality = QUALITY.high;
function applyQuality(): void {
  quality = QUALITY[resolveQuality(settings.value.quality, touchScreen)];
  stage.setMaxPixelRatio(quality.pixelRatio);
  roadSurface.setDetail(quality.reflection);
  particles.budget = quality.particles;
}
settings.onChange(applyQuality);
applyQuality();

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
  // Following the session: the light moves on through a focus block, and a long break is spent at a rest stop.
  const evening = s.followSession && timer.phase === 'focus' ? timer.progress : 0;
  const resting = s.followSession && timer.phase === 'long';
  pool.requestRestStop(resting);
  traffic.holdFirstLane = resting;
  environment.update(dt, s.tod, s.weather, ignitionOn, evening);
  const side = s.driveSide === 'right' ? -1 : 1;
  drive.laneOffset = (traffic.ownOffset - drive.pull) * side;
  placeHeadlights(lights, side, drive.laneOffset);
  drive.update(dt, engine.state, s.breakSlow && timer.phase !== 'focus', s.reduced, environment.lampLevel, resting ? pool.restStopDistance() : null);
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
  postfx.render(settings.value.bloom && quality.bloom);
});

// Lets the browser tests read scene state. Compiled out of the public build.
if (import.meta.env.MODE === 'e2e') {
  Object.assign(window, { __drivey: { simulate, engine, startScreen, stage, postfx, pool, backdrop, traffic, cockpit, drive, audio, ambience, effects, player, stats, sessionCard, quality: () => quality, environment, particles, windshield, roadSurface, timer, settings } });
}
