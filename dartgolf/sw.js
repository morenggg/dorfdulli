/**
 * DartGolf – Service Worker
 *
 * Geltungsbereich: /dartgolf/ – die restliche Website bleibt unberührt.
 *
 * Strategie:
 *  - App-Shell beim Installieren in den Cache legen,
 *  - danach "cache first" für eigene Dateien, mit Aktualisierung im Hintergrund,
 *  - Navigationsanfragen fallen offline auf offline.html zurück,
 *  - fremde Adressen (z. B. eine Autodarts-Quelle) werden nie zwischengespeichert.
 */

const CACHE = 'dartgolf-v3';

const SHELL = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './src/config.js',
  './src/state.js',
  './src/audio/sound-manager.js',
  './src/game/game-engine.js',
  './src/game/course-renderer.js',
  './src/game/golf-physics.js',
  './src/game/collision-system.js',
  './src/game/course-manager.js',
  './src/game/scoring.js',
  './src/game/shot-mapper.js',
  './src/game/turn-manager.js',
  './src/input/dart-provider.js',
  './src/input/test-provider.js',
  './src/input/manual-provider.js',
  './src/input/autodarts-provider.js',
  './src/input/autodarts-normalizer.js',
  './src/ui/dom.js',
  './src/ui/screens.js',
  './src/ui/hud.js',
  './src/ui/player-setup.js',
  './src/ui/test-panel.js',
  './src/ui/connection-panel.js',
  './src/ui/debug-panel.js',
  './src/courses/course-01.js',
  './src/courses/course-02.js',
  './src/courses/course-03.js',
  './src/courses/course-04.js',
  './src/courses/course-05.js',
  './src/courses/course-06.js',
  './src/courses/course-07.js',
  './src/courses/course-08.js',
  './src/courses/course-09.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Einzelne fehlende Dateien dürfen die Installation nicht scheitern lassen.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('dartgolf-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Nur eigene Dateien im eigenen Geltungsbereich behandeln.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  // Das Erklärvideo bleibt außen vor: es ist rund 40 MB groß und wird vom
  // Player in Teilstücken (Range-Requests) geladen. Beides passt nicht in
  // einen Shell-Cache – der Browser übernimmt das selbst.
  if (url.pathname.includes('/video/')) return;
  if (request.headers.has('range')) return;

  // Seitenaufrufe: Netz zuerst, offline die Startseite aus dem Cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html')
          .then((cached) => cached || caches.match('./offline.html'))),
    );
    return;
  }

  // Dateien: aus dem Cache, im Hintergrund auffrischen.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
