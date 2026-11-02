/**
 * The service worker that lets Drivey open offline. Not part of the app bundle:
 * tools/serviceWorker.ts compiles it and fills in the two values below.
 */

// A module only so its names stay out of the app's global scope; the build drops this line.
export {};

/** Every built file the app needs, relative to this script. */
declare const PRECACHE: string[];
/** Changes whenever any built file does, which is what makes the browser install an update. */
declare const VERSION: string;

/** The service worker globals this file uses; the DOM typings don't include them. */
interface ExtendableEvent extends Event {
  waitUntil(work: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (e: FetchEvent) => void): void;
}
const worker = self as unknown as WorkerScope;

const PREFIX = 'drivey-';
const CACHE = PREFIX + VERSION;
const INDEX = new URL('index.html', location.href).href;

worker.addEventListener('install', e => {
  // Straight from the network: a cached copy of an older file would be stored under the new version.
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))).then(() => worker.skipWaiting()));
});

worker.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => worker.clients.claim())
  );
});

/** The page itself comes from the network when it can, so an update shows up on the next visit. */
async function page(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE)).put(INDEX, response.clone());
    return response;
  } catch {
    return (await caches.match(INDEX, { ignoreVary: true })) ?? Response.error();
  }
}

/** Built files have content hashes in their names, so a cached copy is never stale. */
async function asset(request: Request): Promise<Response> {
  // The page asks for its script with an Origin header the precache request didn't send, and some
  // servers mark files as varying by it, which would otherwise make every lookup miss.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  // Files outside the precache, like font subsets for other alphabets, are kept once fetched.
  if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

worker.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(request.mode === 'navigate' ? page(request) : asset(request));
});
