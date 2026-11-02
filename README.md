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

The tests use a separate build (`npm run build:e2e`) that exposes scene state on `window.__drivey`; the public build doesn't include it. GitHub doesn't run the browser tests, so deploys take about a minute: run the full `npm run test:e2e` locally and only push when it passes.

When adding a feature, add its test in `e2e/`, then break the feature on purpose to check that the test fails.

## Routes

Pick a route on the start screen, or switch mid-drive under Settings › Scene:

| Route | Road | Traffic |
| --- | --- | --- |
| City expressway | Elevated, between towers, with signs and overpasses | Two lanes our way, no oncoming |
| Coastal road | Along a cliff, sea on our side, distant shore lights | One lane each way |
| Highway | Dual carriageway with gantries, overpasses and tunnels | Two lanes each way, with overtaking |
| Countryside | Narrow lane through fields, trees and farmhouses | One lane each way, light |

A route is a `RouteDefinition` in `src/routes/`: a function that fills a 40 m chunk of road, plus its speed, curviness, traffic lanes, distant scenery and the lamps seen in the mirror. Text in a chunk goes in `chunk.labels` so it stays readable when driving on the right. To add a route, write one and add it to `ROUTES` in `src/routes/index.ts`.

## Music

Music starts when the engine does and is set up under Settings › Sound. Each style (Chillhop, Jazzy, Ambient, Synthwave, Rainy café) can draw from:

| Source | Where it comes from |
| --- | --- |
| Tracks | [Jamendo](https://www.jamendo.com) Creative Commons tracks, crossfaded |
| Live radio | Lofi stations from the [Radio Browser](https://www.radio-browser.info) directory |
| Local | Files shipped in `public/music/` |
| Mix | Jamendo and local tracks shuffled together |

If a source fails (no network, a dead stream, a rate limit), the player skips or falls back quietly: Jamendo to local files to music generated live in the browser, and radio to generated music. A short note appears instead of an error. Liked tracks come up more often; "never play again" is remembered. Everything played is listed with its licence under Credits.

How each style maps to Jamendo tags and radio tags is in `src/music/styles.ts`.

### Jamendo key

Copy `.env.example` to `.env` and set `VITE_JAMENDO_CLIENT_ID` to a client ID from the [Jamendo developer portal](https://devportal.jamendo.com). Without one, the app plays radio, local and generated music. For the GitHub Pages build, add it as a repository secret named `JAMENDO_CLIENT_ID`.

Search results are cached in IndexedDB for a day, and further pages are only fetched when the queue runs out, to stay inside the free tier's monthly cap.

**Licence:** Jamendo's free API tier is for non-commercial use only. A paid App Store version would need a Jamendo commercial licence or a different music source.

### Adding local music

1. Put free-licensed audio files in `public/music/<style>/` (mp3, m4a, ogg, opus, wav or flac).
2. Optionally add a sidecar with the credits next to each file, with the same name: `song.mp3` and `song.json` containing `{ "title": "…", "artist": "…", "license": "CC BY 4.0", "licenseUrl": "…", "link": "…" }`. Without one, the file name is used as the title.
3. Run `npm run music:manifest`, or just `npm run dev` or `npm run build`, which run it first. This writes `public/music/manifest.json`.

The repo ships empty style folders only.

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
| `src/app` | Frame loop and persisted settings |
| `src/scene` | Renderer, chunk pool, cockpit, drive motion, post-processing |
| `src/routes` | One definition per route, plus shared road parts |
| `src/traffic` | Cars and trucks, their lanes, lane changes and spacing |
| `src/audio` | Web Audio engine: mixer channels, ambience, effects and generated music |
| `src/music` | Music providers, the player, likes and the cache |
| `src/weather` | Time-of-day and weather tables, and the environment that blends them |
| `src/timer` | Timestamp-based Pomodoro state machine and its driver |
| `src/ui` | HUD, settings surface, shortcuts and styles |
| `src/platform` | Browser adapter; a Capacitor implementation plugs in here |
| `src/lib` | Small shared helpers |

## Hosting

Every push to `main` runs the unit tests, builds the app and deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

Live at <https://teun-sudo1.github.io/drivey/>.

## Wrapping for iOS with Capacitor

The app is built to be wrapped without rewrites: assets use relative paths, and storage, caching and keep-awake go through `src/platform/`.

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios`, then `npx cap init Drivey com.example.drivey --web-dir dist`.
2. `npm run build`, then `npx cap add ios` and `npx cap sync ios`.
3. Write `src/platform/capacitor.ts` implementing `Platform` with `@capacitor/preferences` for `storage`, a file or SQLite store for `cache`, and `@capacitor-community/keep-awake` for `keepAwake`, and pick it in `src/platform/index.ts` when `Capacitor.isNativePlatform()`.
4. For music to keep playing with the screen locked, enable the Audio background mode in Xcode (Signing & Capabilities › Background Modes).
5. `npx cap open ios` to build and run from Xcode.

On iOS a web page can't change an audio element's volume, so radio stations without CORS play at full volume in Safari; a native audio plugin would fix that in the app.
