# Night Drive

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
```

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
