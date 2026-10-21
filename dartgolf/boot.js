/**
 * DartGolf – Aufräumen alter Versionen
 *
 * Läuft vor der App. Ist im Browser noch eine ältere Fassung gespeichert
 * (Service Worker + Cache), wird sie einmalig komplett entfernt und die
 * Seite frisch vom Server geladen. Danach passiert hier nichts mehr.
 *
 * Wird mit Versionsparameter eingebunden (boot.js?v=…), damit kein alter
 * Cache diese Datei abfangen kann.
 */
(function () {
  var BUILD = '0.2.2';
  var KEY = 'dartgolf:build';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { return; }
  if (stored === BUILD) return;
  try { localStorage.setItem(KEY, BUILD); } catch (e) { return; }

  var jobs = [];
  if ('serviceWorker' in navigator) {
    jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs
        .filter(function (r) { return r.scope.indexOf('/dartgolf/') !== -1; })
        .map(function (r) { return r.unregister(); }));
    }));
  }
  if (window.caches) {
    jobs.push(caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (k) { return k.indexOf('dartgolf-') === 0; })
        .map(function (k) { return caches.delete(k); }));
    }));
  }
  Promise.all(jobs).then(function () {
    // Nur neu laden, wenn vorher schon eine Version installiert war.
    if (stored !== null || (navigator.serviceWorker && navigator.serviceWorker.controller)) {
      window.location.reload();
    }
  }).catch(function () {});
})();
