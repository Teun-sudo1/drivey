// Scans public/music/<style>/ for audio files and writes public/music/manifest.json,
// which the app reads for its local fallback music.
//
// Credits come from an optional sidecar file next to each track, e.g. song.mp3 + song.json:
//   { "title": "...", "artist": "...", "license": "CC BY 4.0", "licenseUrl": "...", "link": "..." }
// Without one, the file name becomes the title.
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';

const ROOT = new URL('../public/music/', import.meta.url).pathname;
const STYLES = ['chillhop', 'jazzy', 'ambient', 'synthwave', 'rainycafe'];
const AUDIO = /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;

const manifest = {};
for (const style of STYLES) {
  const dir = join(ROOT, style);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  manifest[style] = readdirSync(dir)
    .filter(f => AUDIO.test(f))
    .sort()
    .map(file => {
      const sidecar = join(dir, `${parse(file).name}.json`);
      const meta = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, 'utf8')) : {};
      return { file: `${style}/${file}`, title: meta.title ?? parse(file).name, artist: meta.artist ?? 'Unknown artist', license: meta.license, licenseUrl: meta.licenseUrl, link: meta.link };
    });
}
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const count = Object.values(manifest).reduce((n, list) => n + list.length, 0);
console.log(`music manifest: ${count} track${count === 1 ? '' : 's'}`);
