/**
 * DartGolf Bridge – Inhaltsskript im DartGolf-Tab.
 * Übergibt Würfe und Statusmeldungen per window.postMessage an die Seite.
 */
const PROTOCOL_VERSION = 1;

function postToPage(type, payload) {
  window.postMessage({ source: 'dartgolf-bridge', version: PROTOCOL_VERSION, type, payload }, window.location.origin);
}

function announce(extra) {
  postToPage('status', { bridge: 'extension', ready: true, ...(extra || {}) });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === 'dartgolf-throw') postToPage('throw', message.payload);
  else if (message.type === 'dartgolf-autodarts') announce({ autodarts: message.state });
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (data && data.source === 'dartgolf' && data.type === 'hello') announce();
});

announce();
