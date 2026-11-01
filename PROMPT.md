# Claude Code prompt — "Night Drive" focus app

Paste everything below the line into Claude Code in an empty project folder.

---

## Start from the prototype
`prototype/index.html` in this folder is a working single-file prototype (Three.js scene, cockpit, weather, wipers/raindrops overlay, Pomodoro timer, generative Web Audio music and ambience, stats, presets, portrait + landscape). Treat it as the reference for look, feel and behaviour:
- Split it into the module structure below; keep its visuals, tuning values and audio synthesis rather than rewriting from scratch.
- Keep the shader-based road curvature (`bendify`: x += k·z² on every world vertex) so road chunks stay connected.
- Keep the z-fighting fixes (deck top below road surface, road decals lifted, camera near plane 0.15).
- The windshield overlay must stay clipped between the roof edge and the dashboard (re-measured every frame).
- Its generative music becomes one `MusicProvider` ("Generated"), next to Jamendo, Radio Browser and local files.

Build a focus app called **Night Drive**: a Pomodoro timer layered over a generated 3D first-person car drive, with adjustable weather, time of day, routes, an ambient sound mixer and bundled lofi music. Mood reference: a night-time cockpit view from a right-hand-drive Japanese taxi on a Tokyo elevated expressway — dark dashboard, glowing gauges, a blue LCD meter, sodium and teal streetlights, tail lights ahead, city lights blurred through the windshield. Calm, cinematic, low contrast, slightly film-grained.

## Platform and stack
- Web app first, built so it can later be wrapped for iOS with **Capacitor** without rewrites.
- Vite + TypeScript, **Three.js** for the scene, plain CSS or a small UI layer (no heavy framework unless you can justify it).
- Installable PWA (manifest, service worker, offline cache of assets).
- Keep platform-specific code (audio session, keep-awake, notifications, storage) behind a small `platform/` adapter so a Capacitor implementation can be dropped in later.

## Orientation — both must feel designed, not just stretched
- **Landscape:** full cinematic cockpit view (windshield + dashboard), timer integrated subtly, e.g. as the dashboard LCD/meter display, controls in a slide-out panel.
- **Portrait:** camera reframes (taller FOV, road and sky dominate, dashboard cropped to the bottom strip), timer large and centred, controls in a bottom sheet.
- Handle live rotation and window resize smoothly; respect iPhone safe areas and notches.

## 3D scene
- Procedural, endlessly looping road using reusable chunks (object pooling) — no hard seams, no growing memory.
- Cockpit: low-poly interior, steering wheel, glowing analogue gauges, dashboard LCD; subtle camera sway and road vibration.
- Traffic: a few cars ahead/oncoming with tail/headlights; occasional lane changes.
- **Routes** (selectable): City expressway (elevated, towers, signs), Coastal road (sea, guardrail, distant lights), Highway (open, tunnels, overpasses), Countryside (fields, trees, few lights).
- **Time of day:** Day, Dusk, Night — affects sky, fog colour, light intensity, window lights, headlights on/off. Smooth transitions.
- **Weather:** Clear, Rain, Heavy rain, Fog, Snow. Rain/snow particles outside, raindrops and streaks on the windshield (shader), animated wipers that run in rain, wet road reflections, fog density. Transitions blend over a few seconds.
- Post-processing: bloom on lights, light vignette, film grain — all toggleable.
- Performance: target 60 fps on a recent iPhone and 30 fps minimum on older devices. Add a quality setting (Low/Medium/High) that scales pixel ratio, particles, shadows and post-processing, and auto-picks a default. Pause rendering when the tab is hidden.
- Use generated geometry and textures; no copyrighted models or brand logos.

## Pomodoro timer
- Defaults 25 / 5 / 15 (long break every 4 sessions), all configurable.
- Start, pause, skip, reset; optional auto-start of next phase.
- Accurate across tab backgrounding (timestamp-based, not interval counting).
- Phase changes: soft chime, and the drive reacts, e.g. during breaks the car slows/pulls into a calmer stretch or the scene shifts to dusk (make this optional).
- Optional task label per session ("What are you focusing on?").

## Music (fetched from free APIs, with a local fallback)
Build a `MusicProvider` interface (`search(style) → Track[]`, `getStream(track)`) so sources can be added or removed, and a player that merges them per style.

Styles to start: Chillhop, Jazzy, Ambient, Synthwave, Rainy café. Map each style to provider-specific tags/queries in one config file.

**Providers:**
1. **Jamendo API v3** (primary, on-demand tracks): Creative Commons music, `GET https://api.jamendo.com/v3.0/tracks` with `client_id`, filtering by tags (e.g. `lofi`, `chillhop`, `ambient`, `jazz`, `synthwave`), `audioformat=mp32`, `include=licenses`. Read the licence and artist fields of each track and show attribution (artist, title, licence, link) in the now-playing view. Free tier is non-commercial only with a monthly request cap, so cache search results (IndexedDB, ~24 h) and fetch pages lazily, not on every track change.
2. **Radio Browser API** (live lofi radio, no key): search stations by tag (`lofi`, `chillhop`, `jazzhop`), only show stations whose last check was OK, prefer higher bitrate, send a consistent User-Agent/app name, pick a server from the official mirror list with failover. Present these as "Live radio" per style.
3. **Local fallback:** tracks in `public/music/<style>/` with a generated `manifest.json` (write a small script that scans the folders), used when offline or when the APIs fail. Ship only placeholder files and explain in the README how to add free-licensed tracks.

**Player behaviour:**
- Play/pause, next, shuffle within style, volume, crossfade between on-demand tracks, a source toggle per style (Tracks / Live radio / Local / Mix).
- Graceful handling of CORS issues, dead streams, rate limits (429) and no network: skip to the next track or fall back to local, with a quiet toast instead of an error screen.
- "Like" and "never play again" per track, stored locally and respected in future shuffles.
- API keys go in `.env` (`VITE_JAMENDO_CLIENT_ID`) with an `.env.example`; the app must still work (radio + local) without a Jamendo key.
- Credits screen listing everything played this session with licence links.
- Add a short note in the README about licence/terms: Jamendo's free tier is non-commercial, so a paid App Store version would need a commercial licence or a different source.

## Ambient sound mixer
- Independent volume sliders: Rain on glass, Engine hum, Wipers, Traffic/city, Wind.
- Generate these procedurally with Web Audio (filtered noise, oscillators) where possible so the app works with zero audio files; allow replacing with sample files later.
- Ambient defaults follow the scene (rain on → rain on glass up, wipers synced to the visual wipers), but manual changes win.
- Mixer presets: save/load named combinations.

## Session stats & tasks
- Store locally (IndexedDB): completed sessions, focus minutes, task labels, route/weather used.
- Stats view: today, this week, daily streak, simple bar chart of the last 7/30 days.
- Export/import as JSON.

## UX
- Minimal, dark, glassy UI that fades away after a few seconds of inactivity; tap/move to bring it back.
- One-tap "scene" presets, e.g. "Rainy Tokyo night", "Foggy coast at dusk", "Snowy countryside".
- Keyboard shortcuts on desktop (space = start/pause, M = mute, F = fullscreen, H = hide UI).
- Fullscreen button; Screen Wake Lock during focus sessions where supported.
- Remember last settings.
- Accessibility: reduced-motion mode (less sway, slower particles), sufficient contrast, labelled controls.

## Way of working
1. First propose the folder structure and module breakdown (scene, routes, weather, timer, audio, stats, ui, platform) and wait for my OK.
2. Then build in milestones, each runnable and committed separately:
   - M1: scaffold, empty looping city road, cockpit, basic timer, portrait + landscape layouts.
   - M2: weather system + time of day.
   - M3: remaining routes + traffic.
   - M4: music providers (Jamendo, Radio Browser, local fallback), player + ambient mixer.
   - M5: stats, tasks, presets, PWA/offline.
   - M6: performance pass, quality settings, Capacitor readiness check.
3. After each milestone, tell me what to look at and how to run it, and list any shortcuts or known issues.
4. Keep code typed, small modules, no dead code. Add a README with setup, adding music, and the steps to wrap with Capacitor for iOS later.
