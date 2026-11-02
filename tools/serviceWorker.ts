import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { transformWithOxc, type Plugin } from 'vite';

const SOURCE = 'src/sw.ts';

/**
 * Whether a built file belongs in the offline cache. Fonts only in the Latin
 * subsets the app's text uses, as woff2; other subsets are cached if ever fetched.
 */
const precached = (file: string): boolean => !/\.woff$/.test(file) && (!/\.woff2$/.test(file) || /-latin-(ext-)?\d/.test(file));

/** Builds `sw.js` next to index.html, listing every file the app needs to open offline. */
export function serviceWorker(): Plugin {
  return {
    name: 'drivey-service-worker',
    apply: 'build',
    // After Vite's own HTML step, so index.html is in the bundle to list.
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const publicFiles = (await readdir('public', { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
        .map(entry => `${entry.parentPath.slice('public'.length + 1)}/${entry.name}`.replace(/^\//, ''));
      const files = [...Object.keys(bundle), ...publicFiles].filter(precached).sort();
      const version = createHash('sha256');
      for (const file of files) {
        const out = bundle[file];
        version.update(file);
        version.update(out ? (out.type === 'chunk' ? out.code : out.source) : await readFile(`public/${file}`));
      }
      const { code } = await transformWithOxc(await readFile(SOURCE, 'utf8'), SOURCE);
      const source = code
        .replace(/^export \{\};\n/m, '')
        .replace(/\bPRECACHE\b/g, JSON.stringify(files))
        .replace(/\bVERSION\b/g, JSON.stringify(version.digest('hex').slice(0, 12)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}
