# Drivey

A Pomodoro focus timer layered over a generated 3D first-person night drive.

`prototype/index.html` is the original single-file prototype, kept as the reference for look, feel and tuning values. It is not part of the build.

## Setup

Requires Node 22 or newer.

```sh
npm install
npm run dev        # development server
npm run build      # typecheck, then production build in dist/
npm run preview    # serve the production build
npm test           # unit tests
npm run test:e2e   # browser tests
```

## Tests

`npm run test:e2e` drives the real app in a browser on four setups: phone portrait and phone landscape (WebKit), and laptop (WebKit and Chromium). The first run needs `npx playwright install chromium webkit`. To run one setup or one test:

```sh
npx playwright test --project=phone-portrait
npx playwright test -g "wipers"
```

The full run takes about 2½ minutes on six parallel browsers.

The test browsers send all sound to a muted node, so running them is silent. The tests use a separate build (`npm run build:e2e`) that exposes scene state on `window.__drivey`; the public build doesn't include it. GitHub doesn't run the browser tests, so deploys take about a minute: run the full `npm run test:e2e` locally and only push when it passes.

When adding a feature, add its test in `e2e/`, then break the feature on purpose to check that the test fails.

## Scene presets

One tap sets the route, time of day, weather and music style together: Rainy city night, Storm on the expressway, Foggy coast at dusk, Neon highway, Snowy countryside and Sunday drive. They're on the start screen ("Quick start") and under Settings › Scene. Add or change them in `src/app/scenePresets.ts`.

## Tasks and stats

Type what you're working on under Settings › Timer ("What are you focusing on?"); it shows under the timer. Every focus session that runs to the end is stored on the device (IndexedDB) with its length, task, route, time of day and weather. Skipped sessions don't count.

Settings › Stats shows minutes today and over the last seven days, the daily streak, a bar chart of the last 7 or 30 days, and the latest sessions. Export saves the history as a JSON file; Import reads one back and merges it, replacing sessions it already has, so importing the same file twice doesn't double anything. Clear history asks for a second tap.

## Install and offline

Drivey is an installable web app. On an iPhone, open it in Safari and choose Share › Add to Home Screen; in Chrome or Edge, use the install button in the address bar. It then opens full screen with its own icon.

After the first visit it also works with no network. The build writes `sw.js`, a service worker listing every file the app needs (`tools/serviceWorker.ts` makes the list); the browser stores them all, and a new deploy is picked up on the next visit. The dev server doesn't register it. The icons are in `public/` and the manifest is `public/manifest.webmanifest`.

## Routes

Pick a route on the start screen, or switch mid-drive under Settings › Scene:

| Route | Road | Traffic |
| --- | --- | --- |
| City expressway | Elevated dual carriageway with signs and overpasses, past towers, a harbour with cranes and ships, or a neon nightlife district | Two lanes each way, with lane changes |
| Coastal road | 80s style: a beach with palms, lifeguard huts and umbrellas down to the sea on our side; on the other, stretches of sandstone cliffs, neon-lit pastel motels, or palm groves and dunes | One lane each way |
| Highway | Dual carriageway with gantries, overpasses and tunnels, through industry, pine forest, desert (with wide shoulders) or across a causeway | Two lanes each way, with overtaking |
| Countryside | Narrow lane through farmland, villages (where it widens for parking) and past lakes | One lane each way, light |

On roads with two lanes our way, our own car moves over now and then when there's room; cars behind it drop back, and nobody cuts in just ahead.

A route is a `RouteDefinition` in `src/routes/`: a function that fills a 40 m chunk of road, plus its speed, curviness, traffic lanes, distant scenery and the lamps seen in the mirror. Text in a chunk goes in `chunk.labels` so it stays readable when driving on the right. Scenery that should change along the way goes in `chunk.variants`: one shows at a time, in stretches of three to seven chunks. To add a route, write one and add it to `ROUTES` in `src/routes/index.ts`.

## Music

Music is lofi made live in the browser from oscillators and noise: drums, bass, chords and a sparse melody, with reverb and vinyl crackle. It needs no internet and plays no ads. Browsers only allow sound after a tap, so it starts quietly at the first tap on the start screen and comes up to full level once the engine runs. Under Settings › Sound, pick a style (Chillhop, Jazzy, Ambient, Synthwave, Rainy café, 80s rock); "next" crossfades to a fresh variation in another key. The patterns for each style are in `src/music/styles.ts`.

## Ambient sound

Rain on glass, engine hum, wipers, traffic and wind are generated with Web Audio, so no audio files are needed. The wipers swish in step with the blades on screen, and turning the key plays the starter before the engine catches; the key turn is also what lets the browser start making sound. With "Ambience follows the scene" on, the weather and route shape each level (rain stops in tunnels); the mixer sliders set the level on top. Mixes can be saved as named presets.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause |
| M | Mute or unmute |
| F | Fullscreen |
| H | Hide or show the UI |

## Project layout

| Folder | Contents |
| --- | --- |
| `src/app` | Frame loop, persisted settings, and the car's ignition state |
| `src/scene` | Renderer, road chunks, road surface, drive motion, post-processing |
| `src/scene/cockpit` | Interior: gauges, timer display, nav screen, mirror, volume fader |
| `src/routes` | One file per route, plus shared road parts |
| `src/traffic` | Cars and trucks, their lanes, lane changes and spacing |
| `src/weather` | Time of day and weather, rain and snow, the windshield |
| `src/audio` | Web Audio engine, mixer channels, ambience and effects |
| `src/music` | Generated beats: the player, the generator and the styles |
| `src/timer` | Timestamp-based Pomodoro and its driver |
| `src/stats` | Session records, daily totals and streak, the export format |
| `src/ui` | Start screen and key, HUD, settings panel, shortcuts, styles |
| `src/platform` | Browser adapter (settings, session database, keep-awake, file saving, offline); a Capacitor implementation plugs in here |
| `src/sw.ts`, `tools/` | The offline service worker and the build step that fills in its file list |
| `public` | Manifest, favicon and app icons |
| `src/lib` | Small shared helpers |
| `e2e` | Browser tests, one file per feature; `support.ts` has the helpers |

### Where to find things

| To change… | Look in |
| --- | --- |
| The start screen and the ignition key | `src/ui/startScreen.ts`, `src/ui/ignition.ts` |
| What a route looks like, its speed and traffic | `src/routes/<route>.ts` |
| Tunnels | `src/routes/highway.ts`, `src/scene/chunkPool.ts` |
| Wet and snowy road, reflections | `src/scene/roadSurface.ts` |
| Raindrops, wipers and their clipping | `src/weather/windshield.ts` |
| Time-of-day and weather values | `src/weather/tables.ts`, `src/weather/environment.ts` |
| Camera framing per orientation, mirror and fader placement | `src/scene/stage.ts` |
| Gauges, timer display, nav screen | `src/scene/cockpit/` |
| The volume fader | `src/scene/cockpit/volumeFader.ts`, `src/ui/dashVolume.ts` |
| Music styles and their patterns | `src/music/styles.ts` |
| Rain, engine, wind and traffic sounds | `src/audio/ambience.ts` |
| Wiper swish, chime, key clicks | `src/audio/effects.ts` |
| Settings and their defaults | `src/app/settings.ts` |
| Scene presets | `src/app/scenePresets.ts` |
| Stats tab, export and import | `src/ui/statsPanel.ts`, `src/stats/` |
| Where sessions are stored | `src/platform/sessionDb.ts` |
| Offline caching | `src/sw.ts`, `tools/serviceWorker.ts` |
| How everything is wired together | `src/main.ts` |

## Hosting

Every push to `main` runs the unit tests, builds the app and deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

Live at <https://teun-sudo1.github.io/drivey/>.

## Wrapping for iOS with Capacitor

The app is built to be wrapped without rewrites: assets use relative paths, and storage, the session database, keep-awake and file saving go through `src/platform/`. The service worker is for the web only; a native shell has its files on the device already.

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios`, then `npx cap init Drivey com.example.drivey --web-dir dist`.
2. `npm run build`, then `npx cap add ios` and `npx cap sync ios`.
3. Write `src/platform/capacitor.ts` implementing `Platform` with `@capacitor/preferences` for `storage`, `@capacitor-community/keep-awake` for `keepAwake`, and `@capacitor/filesystem` with `@capacitor/share` for `saveFile` (IndexedDB works in the iOS webview, so `sessions` can stay as it is), and pick it in `src/platform/index.ts` when `Capacitor.isNativePlatform()`.
4. For music to keep playing with the screen locked, enable the Audio background mode in Xcode (Signing & Capabilities › Background Modes).
5. `npx cap open ios` to build and run from Xcode.
