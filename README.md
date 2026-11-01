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

The tests use a separate build (`npm run build:e2e`) that exposes scene state on `window.__drivey`; the public build doesn't include it. They run on every push, and a failure stops the deploy.

When adding a feature, add its test in `e2e/`, then break the feature on purpose to check that the test fails.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause |
| F | Fullscreen |
| H | Hide or show the UI |

## Project layout

| Folder | Contents |
| --- | --- |
| `src/app` | Frame loop and persisted settings |
| `src/scene` | Renderer, chunk pool, cockpit, drive motion, post-processing |
| `src/routes` | One definition per route, plus shared road parts |
| `src/weather` | Time-of-day and weather tables, and the environment that blends them |
| `src/timer` | Timestamp-based Pomodoro state machine and its driver |
| `src/ui` | HUD, settings surface, shortcuts and styles |
| `src/platform` | Browser adapter; a Capacitor implementation plugs in here |
| `src/lib` | Small shared helpers |

## Hosting

Every push to `main` runs the tests, builds the app and deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

Live at <https://teun-sudo1.github.io/drivey/>.
