import * as THREE from 'three';
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
import { FrameWatch, QUALITY, lowerQuality, resolveQuality, type QualityId, type QualityLevel } from './app/quality';
import { DURATION_LIMITS, SettingsStore, type DriveSide, type DurationKey, type ToggleKey } from './app/settings';
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
import { canFullscreen, toggleFullscreen } from './ui/fullscreen';
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
import { mountSegmented, mountSlider, mountStepper, mountSwitch } from './ui/widgets';
import { Environment } from './weather/environment';
import { Particles } from './weather/particles';
import { LATER, TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from './weather/tables';
import { createWindshield } from './weather/windshield';
import { renderChangelog } from './app/whatsNew';


const platform = getPlatform();
renderChangelog($('#changelog'), $('#startNews'));
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
const windshield = createWindshield($<HTMLCanvasElement>('#glass'), route.lampTint);
cockpit.addGlass(windshield.texture);
settings.onChange(() => stage.setPov(settings.value.pov));
stage.setPov(settings.value.pov, true);
// Each visit starts by settling into the seat behind steamed-up glass, so the scenery is a surprise.
windshield.setMisted(true, true);
cockpit.setCabinLight(true);
cockpit.setNavLoading(true);
const startScreen = createStartScreen(engine, instantly => {
  settings.update({ pov: stage.povFor() });
  windshield.setMisted(false, instantly);
  cockpit.setCabinLight(false);
  cockpit.setNavLoading(false);
});

/** How often the frame-rate counter updates, in seconds. */
const FPS_EVERY_S = 0.5;
/** How near the volume knob, in pixels, a press takes hold of it. */
const KNOB_GRAB_PX = 22;
/** How far the fan knob turns, in radians, and the temperature lever slides, in metres, per pixel dragged. */
const FIDDLE_TURN_PER_PX = 0.03, FIDDLE_SLIDE_PER_PX = 0.0004;
/** How far the volume knob is dragged, in pixels, for a quarter of the volume. */
const KNOB_DRAG_PX = 30;
/** How far the head turns per pixel dragged, in radians. */
const LOOK_PER_PX = 0.004;
// Tapping the A/C button on the dash: it lights up and keeps the glass clear of fog.
{
  const ray = new THREE.Raycaster(), at = new THREE.Vector2(), knobAt = new THREE.Vector3(), gl = $<HTMLCanvasElement>('#gl');
  // The interior is drawn on its own layer.
  ray.layers.enableAll();
  const setAirCon = (on: boolean): void => {
    windshield.airCon = on;
    cockpit.setAirCon(on);
  };
  // The radio's volume knob turns as it's dragged up or down.
  let turning: { y: number; volume: number } | null = null;
  // The fan knob turns and the temperature lever slides, just for the feel of it.
  let fiddling: { control: 'fan' | 'temp'; x: number; y: number } | null = null;
  // Dragging anywhere else turns the head to look around the car; the button beside fullscreen faces forward again.
  let looking: { x: number; y: number } | null = null;
  /** How far a press is from a dashboard control on screen, in pixels. */
  const pxFrom = (object: THREE.Object3D, e: PointerEvent): number => {
    const p = object.getWorldPosition(knobAt).project(stage.camera);
    return Math.hypot(((p.x + 1) / 2) * innerWidth - e.clientX, ((1 - p.y) / 2) * innerHeight - e.clientY);
  };
  const btnLook = $('#btnLook');
  gl.addEventListener('pointermove', e => {
    if (looking) {
      stage.lookBy((e.clientX - looking.x) * LOOK_PER_PX, (e.clientY - looking.y) * LOOK_PER_PX);
      looking = { x: e.clientX, y: e.clientY };
      btnLook.hidden = false;
    }
    if (fiddling) {
      if (fiddling.control === 'fan') cockpit.turnFan((fiddling.y - e.clientY) * FIDDLE_TURN_PER_PX);
      else cockpit.slideTemp((e.clientX - fiddling.x) * FIDDLE_SLIDE_PER_PX);
      fiddling = { ...fiddling, x: e.clientX, y: e.clientY };
    }
    if (!turning) return;
    const dy = (turning.y - e.clientY) / KNOB_DRAG_PX;
    settings.update({ mix: { ...settings.value.mix, music: Math.min(1, Math.max(0, turning.volume + dy * 0.25)) } });
  });
  addEventListener('pointerup', () => (turning = looking = fiddling = null));
  btnLook.addEventListener('click', () => {
    stage.lookBy(-stage.look.yaw, -stage.look.pitch);
    btnLook.hidden = true;
  });
  gl.addEventListener('pointerdown', e => {
    at.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(at, stage.camera);
    // The knobs are small, so a press anywhere a fingertip away from one takes hold of it.
    if (pxFrom(cockpit.radio.volumeKnob, e) < KNOB_GRAB_PX) {
      turning = { y: e.clientY, volume: settings.value.mix.music };
      gl.setPointerCapture(e.pointerId);
      return;
    }
    for (const [control, object] of [['fan', cockpit.fanKnob], ['temp', cockpit.tempLever]] as const) {
      if (pxFrom(object, e) >= KNOB_GRAB_PX) continue;
      fiddling = { control, x: e.clientX, y: e.clientY };
      gl.setPointerCapture(e.pointerId);
      return;
    }
    if (!ray.intersectObject(cockpit.acButton).length) {
      // The radio's own buttons and slider take their taps and drags.
      if (ray.intersectObject(cockpit.radio.group).length) return;
      looking = { x: e.clientX, y: e.clientY };
      gl.setPointerCapture(e.pointerId);
      return;
    }
    setAirCon(!windshield.airCon);
    effects.press(windshield.airCon);
  });
  // In rain or fog it's on from the moment the weather turns, so the glass never fogs unless the driver
  // switches it off; in dry weather it goes off again.
  let weatherFor = '';
  const followWeather = (): void => {
    const { weather } = settings.value;
    if (weather === weatherFor) return;
    weatherFor = weather;
    const wet = WEATHERS[weather].rain > 0 || WEATHERS[weather].veil > 0;
    if (wet === windshield.airCon) return;
    setAirCon(wet);
    if (wet) toast('A/C on to keep the glass clear');
  };
  settings.onChange(followWeather);
  followWeather();
}

/* Sound */
const audio = new AudioEngine(platform.playInBackground);
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
const idle = createIdleFade(() => timer.running && !surface.isOpen());

// The timer's buttons click like dashboard switches. The HUD has already toggled the timer by now.
$('#btnPlay').addEventListener('click', () => effects.press(timer.running));
for (const id of ['#btnReset', '#btnSkip']) $(id).addEventListener('click', () => effects.press(false));
$('#btnSkip').addEventListener('click', () => {
  timer.skip();
  toast(`Skipped to ${phaseName(timer.phase).toLowerCase()}`);
});
$('#btnFull').hidden = !canFullscreen();
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
  ...[$<HTMLInputElement>('#segPov'), $<HTMLInputElement>('#startPov')].map(el => mountSlider(el, () => stage.povFor(), pov => settings.update({ pov }))),
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
let quality = QUALITY.high, qualityLevel: QualityLevel = 'high';
/** Auto's ceiling, lowered for the rest of the visit if this device can't keep up. */
let autoCap: QualityLevel = 'high';
const frameWatch = new FrameWatch();
function applyQuality(): void {
  qualityLevel = resolveQuality(settings.value.quality, touchScreen, autoCap);
  quality = QUALITY[qualityLevel];
  stage.setMaxPixelRatio(quality.pixelRatio);
  roadSurface.setDetail(quality.reflection);
  particles.budget = quality.particles;
}
settings.onChange(applyQuality);
applyQuality();
settings.onChange(() => frameWatch.reset());
/** On Auto, steps down a level when frames stay slow. */
function watchFrames(dt: number): void {
  if (settings.value.quality !== 'auto' || !frameWatch.note(dt)) return;
  const lower = lowerQuality(qualityLevel);
  if (!lower) return;
  autoCap = lower;
  applyQuality();
  toast(`Graphics set to ${quality.name} to keep the drive smooth`);
}

const fpsCounter = $('#fps');
let fpsFrames = 0, fpsTime = 0;
/** Counts frames, showing the rate twice a second while the counter is on. */
function countFrames(dt: number): void {
  if (fpsCounter.hidden) return;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime < FPS_EVERY_S) return;
  fpsCounter.textContent = `${Math.round(fpsFrames / fpsTime)} fps`;
  fpsFrames = fpsTime = 0;
}

function applyBodyFlags(): void {
  const { grain, vignette, reduced, fps } = settings.value;
  fpsCounter.hidden = !fps;
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
  cockpit.setSignal(traffic.ownSignal);
  cockpit.setHeadlamps(environment.headlightLevel);
  cockpit.update(dt, drive.speed, drive.bend, drive.clock);
  const shelters = pool.shelters();
  // Nothing falls inside a tunnel; the camera sits at z = 0.
  const open = 1 - shelterAt(shelters, 0);
  shelter = 1 - open;
  particles.update({ dt, speed: drive.speed, clock: drive.clock, rain: environment.rainLevel * open, snow: environment.snowLevel * open, reducedMotion: s.reduced });
  windshield.update({ dt, speed: drive.speed, weather: WEATHERS[s.weather], lamp: environment.lampLevel, wipersOn: ignitionOn, shelter: 1 - open });
  cockpit.setSideMist(windshield.misted);
  roadSurface.setLevels(environment.wetLevel, environment.snowLevel, environment.headlightLevel);
  roadSurface.setShelters(shelters);
}

/** Whether the indicator was lit last frame, so the relay clicks on each change. */
let indicatorLit = false;
startLoop(dt => {
  simulate(dt);
  if (cockpit.indicatorLit !== indicatorLit) {
    indicatorLit = cockpit.indicatorLit;
    effects.tick(indicatorLit);
  }
  watchFrames(dt);
  countFrames(dt);
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
