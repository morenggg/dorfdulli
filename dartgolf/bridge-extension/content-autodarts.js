/**
 * DartGolf Bridge – Inhaltsskript im Autodarts-Tab.
 *
 * hook.js läuft bereits im Seitenkontext (siehe manifest.json) und meldet
 * sich per window.postMessage. Dieses Skript reicht Würfe und ein einfaches
 * Lebenszeichen an den Hintergrunddienst weiter.
 */
(function () {
  function send(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch {
      // Erweiterung neu geladen oder deaktiviert – still ignorieren.
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== 'dartgolf-bridge-page') return;
    if (data.type === 'throw') send({ type: 'dartgolf-throw', payload: data.payload });
    else if (data.type === 'ready' || data.type === 'socket') send({ type: 'dartgolf-autodarts', state: data.type });
  });

  // Lebenszeichen, damit DartGolf weiß, dass ein Autodarts-Tab offen ist.
  send({ type: 'dartgolf-autodarts', state: 'tab' });
}());
