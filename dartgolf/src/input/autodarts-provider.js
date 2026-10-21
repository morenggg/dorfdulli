/**
 * DartGolf – Autodarts-Provider (EXPERIMENTELL)
 *
 * WICHTIG / EHRLICHKEIT:
 * Dieser Provider ist die Empfangsseite. Er wurde bisher NICHT mit echten
 * Autodarts-Daten getestet. Solange keine echte Quelle angebunden ist, meldet
 * er "getrennt" und liefert keine Würfe. Es sind keine Endpunkte fest
 * einprogrammiert – die Adresse gibt ausschließlich der Nutzer an.
 *
 * Zwei Transportwege:
 *
 *  1. BRIDGE (empfohlen)
 *     Eine separate Komponente (Browser-Erweiterung oder Userscript), die auf
 *     der Autodarts-Seite läuft, erkennt Treffer und sendet sie an den
 *     DartGolf-Tab. Empfang über BroadcastChannel (gleicher Origin) oder
 *     window.postMessage (Content-Script der Erweiterung).
 *
 *  2. WEBSOCKET
 *     Direkte Verbindung zu einer vom Nutzer eingetragenen WebSocket-Adresse
 *     (z. B. ein eigener lokaler Dienst). Es wird keine Adresse geraten.
 *
 * Sicherheitsregeln, die hier eingehalten werden:
 *  - keine Tokens, Passwörter oder Cookies werden gelesen, gespeichert oder
 *    protokolliert,
 *  - Rohereignisse werden nur an das Debug-Panel weitergegeben,
 *  - postMessage-Nachrichten werden auf Herkunft und Struktur geprüft,
 *  - Mixed-Content (ws:// von einer https-Seite) wird erkannt und klar gemeldet,
 *    statt eine unsichere Umgehung zu bauen.
 */

import { BaseDartProvider } from './dart-provider.js';
import { normalizeAutodartsEvent } from './autodarts-normalizer.js';
import { AUTODARTS } from '../config.js';

const { transports, bridgeChannelName, bridgeProtocolVersion, reconnect } = AUTODARTS;

export class AutodartsProvider extends BaseDartProvider {
  constructor() {
    super('autodarts');

    /** @type {string} aktuell gewählter Transportweg */
    this.transport = transports.BRIDGE;
    /** @type {string} vom Nutzer eingetragene WebSocket-Adresse */
    this.url = '';
    /** @type {string} optionale Board-ID (nicht sensibel) */
    this.boardId = '';
    /** @type {boolean} */
    this.autoReconnect = true;

    /** @type {WebSocket|null} */
    this._socket = null;
    /** @type {BroadcastChannel|null} */
    this._channel = null;
    /** @type {((e: MessageEvent) => void)|null} */
    this._windowListener = null;
    /** @type {number|null} */
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._manualDisconnect = false;

    /** @type {unknown} letztes Rohereignis – nur für das Debug-Panel */
    this.lastRawEvent = null;
    /** @type {number} Zeitpunkt der letzten empfangenen Nachricht */
    this.lastMessageAt = 0;
    /** @type {number} Anzahl empfangener, aber nicht verwertbarer Nachrichten */
    this.ignoredMessages = 0;
  }

  /**
   * Übernimmt die Verbindungseinstellungen aus dem Verbindungsdialog.
   * @param {{transport?:string, url?:string, boardId?:string, autoReconnect?:boolean}} settings
   */
  configure(settings = {}) {
    if (settings.transport) this.transport = settings.transport;
    if (typeof settings.url === 'string') this.url = settings.url.trim();
    if (typeof settings.boardId === 'string') this.boardId = settings.boardId.trim();
    if (typeof settings.autoReconnect === 'boolean') this.autoReconnect = settings.autoReconnect;
  }

  /**
   * Prüft vorab, ob der gewählte Transportweg im aktuellen Browser überhaupt
   * funktionieren kann. Gibt eine für Menschen verständliche Meldung zurück
   * oder null, wenn nichts dagegen spricht.
   * @returns {string|null}
   */
  checkPreconditions() {
    if (this.transport === transports.BRIDGE) {
      const hasChannel = typeof BroadcastChannel !== 'undefined';
      const hasPostMessage = typeof window !== 'undefined';
      if (!hasChannel && !hasPostMessage) {
        return 'Dieser Browser unterstützt die benötigten Funktionen (BroadcastChannel/postMessage) nicht.';
      }
      return null;
    }

    if (this.transport === transports.WEBSOCKET) {
      if (typeof WebSocket === 'undefined') {
        return 'Dieser Browser unterstützt keine WebSocket-Verbindungen.';
      }
      if (!this.url) {
        return 'Es ist keine WebSocket-Adresse eingetragen. Bitte im Verbindungsdialog eintragen.';
      }
      if (!/^wss?:\/\//i.test(this.url)) {
        return 'Die Adresse muss mit ws:// oder wss:// beginnen.';
      }
      // Mixed Content: eine über HTTPS geladene Seite darf keine unverschlüsselte
      // WebSocket-Verbindung öffnen. Das ist eine Browser-Regel, keine Einstellung.
      const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      if (isHttps && /^ws:\/\//i.test(this.url)) {
        return 'Diese Seite läuft über HTTPS. Der Browser blockiert unverschlüsselte '
          + 'ws://-Verbindungen (Mixed Content). Nutze eine wss://-Adresse oder den Bridge-Modus.';
      }
      return null;
    }

    return 'Unbekannter Transportweg.';
  }

  async connect() {
    this._manualDisconnect = false;

    const problem = this.checkPreconditions();
    if (problem) {
      this._connected = false;
      this._emitStatus('error', problem);
      return;
    }

    this._emitStatus('connecting', this.transport === transports.BRIDGE
      ? 'Warte auf eine Bridge …'
      : 'Verbinde …');

    if (this.transport === transports.BRIDGE) {
      this._openBridge();
    } else {
      this._openWebSocket();
    }
  }

  async disconnect() {
    this._manualDisconnect = true;
    this._clearReconnectTimer();
    this._closeBridge();
    this._closeWebSocket();
    this._connected = false;
    this._emitStatus('disconnected', 'Verbindung getrennt');
  }

  /* ---------------------------------------------------------------- *
   * Transport 1: Bridge (BroadcastChannel + postMessage)
   * ---------------------------------------------------------------- */

  _openBridge() {
    this._closeBridge();

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._channel = new BroadcastChannel(bridgeChannelName);
        this._channel.onmessage = (event) => this._handleBridgeMessage(event.data, 'broadcast');
      } catch (err) {
        this._channel = null;
        console.warn('[DartGolf] BroadcastChannel nicht verfügbar:', err && err.message);
      }
    }

    // Content-Scripts von Erweiterungen senden über window.postMessage.
    this._windowListener = (event) => {
      // Nur Nachrichten aus demselben Fenster und Origin akzeptieren.
      if (event.source !== window) return;
      if (event.origin !== location.origin) return;
      this._handleBridgeMessage(event.data, 'postMessage');
    };
    window.addEventListener('message', this._windowListener);

    // Der Bridge-Modus ist "empfangsbereit", aber erst nach der ersten
    // gültigen Nachricht wirklich verbunden. Das wird ehrlich so gemeldet.
    this._connected = false;
    this._emitStatus('connecting', 'Empfangsbereit – warte auf Treffer einer Bridge.');

    // Ein "hello" ermöglicht einer bereits laufenden Bridge, sich zu melden.
    this._postToBridge({ source: 'dartgolf', version: bridgeProtocolVersion, type: 'hello' });
  }

  _closeBridge() {
    if (this._channel) {
      try {
        this._channel.close();
      } catch { /* egal */ }
      this._channel = null;
    }
    if (this._windowListener) {
      window.removeEventListener('message', this._windowListener);
      this._windowListener = null;
    }
  }

  /**
   * Sendet eine Nachricht an eine mögliche Bridge (nur nicht sensible Daten).
   * @param {Record<string, unknown>} message
   */
  _postToBridge(message) {
    if (this._channel) {
      try {
        this._channel.postMessage(message);
      } catch { /* egal */ }
    }
    try {
      window.postMessage(message, location.origin);
    } catch { /* egal */ }
  }

  /**
   * Verarbeitet eine Nachricht der Bridge.
   * Erwartetes Format (siehe AUTODARTS-INTEGRATION.md):
   *   { source: 'dartgolf-bridge', version: 1, type: 'throw'|'status', payload: <raw event> }
   * @param {unknown} data
   * @param {string} via
   */
  _handleBridgeMessage(data, via) {
    if (!data || typeof data !== 'object') return;
    const msg = /** @type {Record<string, any>} */ (data);
    if (msg.source !== 'dartgolf-bridge') return;
    if (msg.version !== bridgeProtocolVersion) {
      this._emitStatus('error', `Bridge nutzt Protokollversion ${msg.version}, erwartet wird ${bridgeProtocolVersion}.`);
      return;
    }

    this.lastMessageAt = Date.now();

    if (msg.type === 'status') {
      const autodarts = msg.payload && msg.payload.autodarts;
      if (autodarts === 'socket') {
        this._autodartsSeen = true;
        this._emitStatus('connected', 'Verbunden – Autodarts-Tab sendet. Warte auf den ersten Dart.');
      } else if (autodarts) {
        this._autodartsSeen = true;
        this._emitStatus('connected', 'Verbunden – Autodarts-Tab gefunden. Dort ein Spiel starten.');
      } else if (!this._autodartsSeen) {
        this._emitStatus('connected', 'Erweiterung aktiv – Autodarts-Tab noch nicht gefunden. play.autodarts.io öffnen bzw. neu laden.');
      }
      this._connected = true;
      return;
    }

    if (msg.type !== 'throw') return;

    this._ingestRaw(msg.payload, `Bridge (${via})`);
  }

  /* ---------------------------------------------------------------- *
   * Transport 2: WebSocket
   * ---------------------------------------------------------------- */

  _openWebSocket() {
    this._closeWebSocket();

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      this._connected = false;
      this._emitStatus('error', `Verbindung konnte nicht aufgebaut werden: ${err && err.message ? err.message : 'unbekannter Fehler'}`);
      this._scheduleReconnect();
      return;
    }

    this._socket = socket;

    socket.onopen = () => {
      this._connected = true;
      this._reconnectAttempts = 0;
      this._emitStatus('connected', 'WebSocket verbunden.');
    };

    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      this._ingestRaw(event.data, 'WebSocket');
    };

    socket.onerror = () => {
      // Der Browser liefert aus Sicherheitsgründen keine Details.
      this._emitStatus('error', 'Die WebSocket-Verbindung meldet einen Fehler. Adresse und Erreichbarkeit prüfen.');
    };

    socket.onclose = (event) => {
      this._connected = false;
      if (this._manualDisconnect) return;
      this._emitStatus('lost', `Verbindung verloren (Code ${event.code}).`);
      this._scheduleReconnect();
    };
  }

  _closeWebSocket() {
    if (this._socket) {
      try {
        this._socket.onopen = null;
        this._socket.onmessage = null;
        this._socket.onerror = null;
        this._socket.onclose = null;
        this._socket.close();
      } catch { /* egal */ }
      this._socket = null;
    }
  }

  _scheduleReconnect() {
    if (!this.autoReconnect || this._manualDisconnect) return;
    if (this._reconnectAttempts >= reconnect.maxAttempts) {
      this._emitStatus('error', 'Automatische Wiederverbindung aufgegeben. Bitte manuell erneut verbinden.');
      return;
    }
    this._clearReconnectTimer();
    const delay = Math.min(
      reconnect.initialDelayMs * reconnect.factor ** this._reconnectAttempts,
      reconnect.maxDelayMs,
    );
    this._reconnectAttempts += 1;
    this._emitStatus('reconnecting', `Neuer Versuch in ${Math.round(delay / 100) / 10} s (Versuch ${this._reconnectAttempts}).`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.transport === transports.WEBSOCKET) this._openWebSocket();
    }, delay);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Gemeinsame Verarbeitung
   * ---------------------------------------------------------------- */

  /**
   * Nimmt ein Rohereignis entgegen, normalisiert es und gibt es weiter.
   * @param {unknown} raw
   * @param {string} via Quelle für die Statusmeldung
   */
  _ingestRaw(raw, via) {
    this.lastRawEvent = raw;

    const dartThrow = normalizeAutodartsEvent(raw);
    if (!dartThrow) {
      // Nicht jedes Ereignis ist ein Wurf – das ist der Normalfall, kein Fehler.
      this.ignoredMessages += 1;
      return;
    }

    if (!this._connected) {
      this._connected = true;
      this._emitStatus('connected', `Treffer empfangen über ${via}.`);
    }

    this._emit(dartThrow);
  }

  /**
   * Prüft die Verbindung, ohne Daten zu erfinden.
   * Es wird ausschließlich der tatsächliche Zustand berichtet.
   * @returns {{ok: boolean, message: string}}
   */
  testConnection() {
    const problem = this.checkPreconditions();
    if (problem) return { ok: false, message: problem };

    if (this.transport === transports.WEBSOCKET) {
      const open = this._socket && this._socket.readyState === WebSocket.OPEN;
      return open
        ? { ok: true, message: 'WebSocket ist offen. Ein echter Wurf bestätigt die Datenstruktur.' }
        : { ok: false, message: 'Es besteht derzeit keine offene WebSocket-Verbindung.' };
    }

    if (!this.lastMessageAt) {
      return { ok: false, message: 'Bisher wurde keine Nachricht einer Bridge empfangen.' };
    }
    const seconds = Math.round((Date.now() - this.lastMessageAt) / 1000);
    return { ok: true, message: `Letzte Bridge-Nachricht vor ${seconds} s.` };
  }
}
