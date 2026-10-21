/**
 * DartGolf Bridge – läuft direkt im Seitenkontext von Autodarts
 * (Manifest: "world": "MAIN", "run_at": "document_start").
 *
 * Dadurch ist der Haken gesetzt, bevor die Autodarts-Seite ihren WebSocket
 * öffnet. Der Original-WebSocket bleibt über Vererbung vollständig erhalten
 * (Konstanten wie WebSocket.OPEN, instanceof, Prototyp).
 *
 * Es wird nichts gesendet und nichts verändert – nur eingehende Nachrichten
 * mitgelesen, die nach Wurfdaten aussehen.
 */
(function () {
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket || window.__dartgolfBridgeInstalled) return;
  window.__dartgolfBridgeInstalled = true;

  function looksLikeThrow(data) {
    if (typeof data !== 'string') return false;
    if (data.length > 200000) return false;
    return data.includes('"segment"') || data.includes('"throws"') || data.includes('"bed"');
  }

  function post(type, payload) {
    window.postMessage({ source: 'dartgolf-bridge-page', version: 1, type, payload }, window.location.origin);
  }

  class DartGolfObservedWebSocket extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => {
        try {
          if (typeof event.data === 'string') {
            if (looksLikeThrow(event.data)) post('throw', event.data);
          } else if (event.data instanceof Blob) {
            event.data.text().then((text) => { if (looksLikeThrow(text)) post('throw', text); }).catch(() => {});
          } else if (event.data instanceof ArrayBuffer) {
            const text = new TextDecoder().decode(event.data);
            if (looksLikeThrow(text)) post('throw', text);
          }
        } catch {
          // Die Autodarts-Seite darf niemals durch die Bridge gestört werden.
        }
      });
      post('socket', null);
    }
  }

  window.WebSocket = DartGolfObservedWebSocket;
  post('ready', null);
}());
