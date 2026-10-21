/**
 * DartGolf – Verbindungsdialog (EXPERIMENTELL)
 *
 * Der Dialog ist bewusst nüchtern gehalten und macht an jeder Stelle klar,
 * was tatsächlich funktioniert und was noch ungeprüft ist. Es werden keine
 * Adressen vorgegeben und keine Zugangsdaten abgefragt.
 */

import { el, qs, replaceChildren, setHidden, setText } from './dom.js';
import { AUTODARTS, APP_VERSION } from '../config.js';
import { loadConnectionSettings, saveConnectionSettings, CONNECTION_STATE } from '../state.js';
import { maskSensitive } from './debug-panel.js';
import { toast } from './screens.js';

const { transports } = AUTODARTS;

/** @type {import('../input/autodarts-provider.js').AutodartsProvider|null} */
let provider = null;
let callbacks = {};
let settings = loadConnectionSettings();
let lastStatus = { state: CONNECTION_STATE.DISCONNECTED, detail: '' };

/**
 * Richtet den Dialog ein.
 * @param {import('../input/autodarts-provider.js').AutodartsProvider} autodartsProvider
 * @param {{onUseTestMode: () => void, onConnected?: () => void}} handlers
 */
export function initConnectionPanel(autodartsProvider, handlers) {
  provider = autodartsProvider;
  callbacks = handlers || {};
  settings = loadConnectionSettings();
  provider.configure(settings);

  const closeButton = qs('#btn-connection-close');
  if (closeButton) closeButton.addEventListener('click', closeConnectionDialog);

  const dialog = qs('#connection-dialog');
  if (dialog) {
    // Klick auf den Hintergrund schließt den Dialog.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeConnectionDialog();
    });
  }

  render();
}

/** Öffnet den Dialog. */
export function openConnectionDialog() {
  render();
  setHidden(qs('#connection-dialog'), false);
}

/** Schließt den Dialog. */
export function closeConnectionDialog() {
  setHidden(qs('#connection-dialog'), true);
}

/** @returns {boolean} */
export function isConnectionDialogOpen() {
  const dialog = qs('#connection-dialog');
  return Boolean(dialog && !dialog.hasAttribute('hidden'));
}

/**
 * Übernimmt eine Statusmeldung des Providers.
 * @param {{state:string, detail?:string}} status
 */
export function updateConnectionStatus(status) {
  lastStatus = { state: status.state, detail: status.detail || '' };
  const node = qs('#connection-status-text');
  if (node) setText(node, describeStatus(lastStatus));
  const pill = qs('#connection-status-pill');
  if (pill) pill.dataset.state = pillState(lastStatus.state);
}

function pillState(state) {
  if (state === 'connected') return 'connected';
  if (state === 'connecting' || state === 'reconnecting') return 'connecting';
  if (state === 'error' || state === 'lost') return 'error';
  return 'disconnected';
}

function describeStatus(status) {
  const labels = {
    disconnected: 'Getrennt',
    connecting: 'Verbindung wird aufgebaut',
    connected: 'Verbunden',
    reconnecting: 'Erneute Verbindung',
    lost: 'Verbindung verloren',
    error: 'Fehler',
  };
  const label = labels[status.state] || status.state;
  return status.detail ? `${label} – ${status.detail}` : label;
}

/** Baut den Dialoginhalt auf. */
function render() {
  const body = qs('#connection-body');
  if (!body || !provider) return;

  const transportButton = (label, value, hint) => el('button', {
    type: 'button',
    class: 'btn btn--small btn--toggle',
    text: label,
    title: hint,
    'aria-pressed': settings.transport === value ? 'true' : 'false',
    onClick: () => {
      settings.transport = value;
      persist();
      render();
    },
  });

  const isWebsocket = settings.transport === transports.WEBSOCKET;

  replaceChildren(body, [
    el('div', { class: 'notice' }, [
      el('strong', { text: 'Experimentell. ' }),
      'Diese Verbindung wurde noch nicht mit echten Autodarts-Daten getestet. '
      + 'Bis dahin liefert sie keine Würfe. Das Spiel funktioniert im Testmodus vollständig.',
    ]),

    el('div', { class: 'field-group' }, [
      el('h3', { text: 'Status' }),
      el('div', { class: 'option-row' }, [
        el('span', { class: 'status-pill', id: 'connection-status-pill', dataset: { state: pillState(lastStatus.state) } }, [
          el('span', { class: 'status-dot' }),
          el('span', { class: 'status-text', id: 'connection-status-text', text: describeStatus(lastStatus) }),
        ]),
      ]),
    ]),

    el('div', { class: 'field-group' }, [
      el('h3', { text: 'Weg' }),
      el('div', { class: 'option-row' }, [
        transportButton('Bridge', transports.BRIDGE, 'Empfang über eine Erweiterung oder ein Userscript'),
        transportButton('WebSocket', transports.WEBSOCKET, 'Direkte Verbindung zu einer eigenen Adresse'),
      ]),
      settings.transport === transports.BRIDGE
        ? el('p', { class: 'field-hint' }, [
          'Bridge: eine kleine Browser-Erweiterung liest im Autodarts-Tab mit und schickt Treffer hierher. ',
          el('a', { href: 'dartgolf-bridge.zip', download: 'dartgolf-bridge.zip', text: 'Erweiterung herunterladen' }),
          ' (Version 0.2), entpacken und in Chrome oder Edge unter „Erweiterungen“ als entpackte Erweiterung laden. '
            + 'Danach den Autodarts-Tab einmal neu laden.',
        ])
        : el('p', {
          class: 'field-hint',
          text: 'WebSocket: Adresse einer eigenen Quelle. Es wird keine Adresse vorgegeben oder geraten.',
        }),
    ]),

    isWebsocket ? el('div', { class: 'field-group' }, [
      el('h3', { text: 'WebSocket-Adresse' }),
      el('input', {
        type: 'text',
        value: settings.url,
        placeholder: 'ws://… oder wss://…',
        'aria-label': 'WebSocket-Adresse',
        onInput: (event) => { settings.url = event.target.value.trim(); },
      }),
      el('p', {
        class: 'field-hint',
        text: 'Hinweis: Diese Seite läuft über HTTPS. Der Browser blockiert dann unverschlüsselte '
          + 'ws://-Verbindungen. Für lokale Geräte ohne TLS ist der Bridge-Weg vorgesehen.',
      }),
    ]) : null,

    el('div', { class: 'field-group' }, [
      el('h3', { text: 'Board' }),
      el('input', {
        type: 'text',
        value: settings.boardId,
        placeholder: 'Board-ID (optional)',
        'aria-label': 'Board-ID',
        onInput: (event) => { settings.boardId = event.target.value.trim(); },
      }),
      el('p', {
        class: 'field-hint',
        text: 'Die Board-ID ist nicht geheim und wird lokal gespeichert. '
          + 'Eine Auswahlliste ist erst möglich, wenn eine echte Quelle angebunden ist.',
      }),
    ]),

    el('div', { class: 'field-group' }, [
      el('h3', { text: 'Verhalten' }),
      el('label', { class: 'checkbox-row' }, [
        el('input', {
          type: 'checkbox',
          checked: settings.autoReconnect,
          onChange: (event) => {
            settings.autoReconnect = event.target.checked;
            persist();
          },
        }),
        'Automatisch erneut verbinden',
      ]),
    ]),

    el('div', { class: 'option-row' }, [
      el('button', {
        type: 'button', class: 'btn btn--primary', text: 'Verbindung starten',
        onClick: () => startConnection(),
      }),
      el('button', {
        type: 'button', class: 'btn btn--small', text: 'Trennen',
        onClick: () => stopConnection(),
      }),
      el('button', {
        type: 'button', class: 'btn btn--small', text: 'Verbindung testen',
        onClick: () => {
          const result = provider.testConnection();
          toast(result.message, result.ok ? 'good' : 'warn');
          updateConnectionStatus(lastStatus);
        },
      }),
    ]),

    el('div', { class: 'field-group' }, [
      el('h3', { text: 'Diagnose' }),
      el('p', { class: 'field-hint', text: 'Rohereignisse werden gekürzt und mögliche Zugangsdaten maskiert.' }),
      el('pre', { class: 'code-box', id: 'connection-diagnostics', text: buildDiagnostics() }),
      el('button', {
        type: 'button', class: 'btn btn--small', text: 'Diagnose aktualisieren',
        onClick: () => {
          const node = qs('#connection-diagnostics');
          if (node) setText(node, buildDiagnostics());
        },
      }),
    ]),

    el('button', {
      type: 'button',
      class: 'btn btn--ghost',
      text: 'Zurück zum Testmodus',
      onClick: () => {
        stopConnection();
        closeConnectionDialog();
        if (callbacks.onUseTestMode) callbacks.onUseTestMode();
      },
    }),
  ]);
}

/** Speichert die nicht sensiblen Einstellungen. */
function persist() {
  saveConnectionSettings(settings);
  if (provider) provider.configure(settings);
}

/** Startet die Verbindung mit den aktuellen Einstellungen. */
function startConnection() {
  persist();
  const problem = provider.checkPreconditions();
  if (problem) {
    toast(problem, 'warn');
    updateConnectionStatus({ state: 'error', detail: problem });
    return;
  }
  provider.connect();
  if (callbacks.onConnected) callbacks.onConnected();
}

/** Trennt die Verbindung. */
function stopConnection() {
  provider.disconnect();
}

/** Baut die Diagnoseansicht (ohne sensible Werte). */
function buildDiagnostics() {
  if (!provider) return '–';
  const info = {
    version: APP_VERSION,
    transport: settings.transport,
    urlGesetzt: Boolean(settings.url),
    boardId: settings.boardId || '(leer)',
    autoReconnect: settings.autoReconnect,
    verbunden: provider.isConnected(),
    letzteNachricht: provider.lastMessageAt
      ? new Date(provider.lastMessageAt).toLocaleTimeString('de-DE')
      : '–',
    ignorierteNachrichten: provider.ignoredMessages,
    seite: location.protocol,
    online: navigator.onLine,
  };

  const raw = provider.lastRawEvent === null || provider.lastRawEvent === undefined
    ? '(noch kein Rohereignis empfangen)'
    : maskSensitive(provider.lastRawEvent);

  return `${JSON.stringify(info, null, 2)}\n\nLetztes Rohereignis:\n${raw}`;
}
