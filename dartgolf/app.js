/**
 * DartGolf – Anwendungsstart
 *
 * Diese Datei verdrahtet nur: Provider, Engine, Oberfläche und Tastatur.
 * Spiel-Logik steht in /src/game, Eingabe in /src/input, Darstellung in /src/ui.
 *
 *   Trefferquelle (Test | Manuell | Autodarts)
 *        └─> DartThrow
 *              └─> GameEngine (Zugfilter, Schlag, Physik)
 *                    └─> HUD, Toasts, Zusammenfassungen
 */

import { APP_NAME, APP_VERSION, DEBUG, RULES } from './src/config.js';
import {
  state, setState, SCREEN, TURN_PHASE, CONNECTION_STATE,
  loadSettings, saveSettings, loadHighscores, addHighscores,
} from './src/state.js';

import { TestDartProvider } from './src/input/test-provider.js';
import { ManualDartProvider } from './src/input/manual-provider.js';
import { AutodartsProvider } from './src/input/autodarts-provider.js';

import { GameEngine } from './src/game/game-engine.js';
import { buildRound } from './src/game/course-manager.js';
import { createMatch, currentCourse, buildHighscoreEntries } from './src/game/scoring.js';
import { REJECT } from './src/game/turn-manager.js';

import { SoundManager } from './src/audio/sound-manager.js';

import { qs, setText, setHidden } from './src/ui/dom.js';
import {
  showScreen, toast, toggleFullscreen, showHoleSummary, hideHoleSummary,
  renderResult, setupOrientationHint, getCurrentScreen,
} from './src/ui/screens.js';
import { updateHud, updateConnectionDisplays, updateSoundButton, updatePauseButton } from './src/ui/hud.js';
import { initPlayerSetup, commitPlayerSetup } from './src/ui/player-setup.js';
import {
  initTestPanel, setTestPanelOpen, isTestPanelOpen, handleTestKey,
  triggerSelectedThrow, showThrowInPanel,
} from './src/ui/test-panel.js';
import { initConnectionPanel, openConnectionDialog, updateConnectionStatus, isConnectionDialogOpen } from './src/ui/connection-panel.js';
import { initDebugPanel, toggleDebug, recordRawEvent } from './src/ui/debug-panel.js';

/* ------------------------------------------------------------------ *
 * Bausteine
 * ------------------------------------------------------------------ */

const sound = new SoundManager();
const testProvider = new TestDartProvider();
const manualProvider = new ManualDartProvider();
const autodartsProvider = new AutodartsProvider();

/** @type {GameEngine|null} */
let engine = null;
/** Steuerung des Videodialogs (wird in init() gesetzt). */
let videoDialog = { open() {}, close() {} };
/** Zuletzt gespeicherte Einstellungen (werden beim Spielstart übernommen). */
let settings = loadSettings();

/* ------------------------------------------------------------------ *
 * Wurfverarbeitung
 * ------------------------------------------------------------------ */

/**
 * Nimmt einen Wurf aus einer beliebigen Quelle entgegen.
 * @param {import('./src/input/dart-provider.js').DartThrow} dartThrow
 */
function handleThrow(dartThrow) {
  // Rohereignis nur für das Debug-Panel merken.
  if (dartThrow.raw !== undefined) recordRawEvent(dartThrow.raw);
  showThrowInPanel(dartThrow);
  setState({ lastThrow: dartThrow });

  if (!engine || getCurrentScreen() !== SCREEN.GAME) {
    // Außerhalb des Spiels ist ein Wurf kein Fehler – er wird nur angezeigt.
    return;
  }

  const result = engine.handleThrow(dartThrow);
  if (result.accepted) {
    setState({ lastShot: engine.lastShot });
  }
  refreshHud();
}

/** Verbindet alle Provider mit der Wurfverarbeitung. */
function subscribeProviders() {
  // Der Testmodus bleibt immer verfügbar – auch wenn Autodarts aktiv ist.
  testProvider.subscribe(handleThrow);
  manualProvider.subscribe(handleThrow);
  autodartsProvider.subscribe(handleThrow);

  autodartsProvider.subscribeStatus((status) => {
    const mapped = {
      connected: CONNECTION_STATE.CONNECTED,
      connecting: CONNECTION_STATE.CONNECTING,
      reconnecting: CONNECTION_STATE.RECONNECTING,
      disconnected: CONNECTION_STATE.DISCONNECTED,
      lost: CONNECTION_STATE.LOST,
      error: CONNECTION_STATE.ERROR,
    }[status.state] || CONNECTION_STATE.DISCONNECTED;

    setState({
      connection: mapped,
      connectionDetail: status.detail || '',
      lastError: status.state === 'error' ? status.detail || '' : state.lastError,
    });
    updateConnectionStatus(status);
    updateConnectionDisplays(state);

    if (status.state === 'lost') toast('Autodarts-Verbindung verloren.', 'error');
    if (status.state === 'connected') toast('Treffer werden empfangen.', 'good');
  });
}

/**
 * Setzt die anzeigte Hauptquelle.
 * @param {'test'|'manual'|'autodarts'} name
 */
function setPrimaryProvider(name) {
  setState({ providerName: name });
  if (name === 'test') {
    testProvider.connect();
    setState({ connection: CONNECTION_STATE.DISCONNECTED, connectionDetail: 'Testmodus' });
  }
  updateConnectionDisplays(state);
}

/* ------------------------------------------------------------------ *
 * Spielablauf
 * ------------------------------------------------------------------ */

/** Startet ein neues Spiel mit den Angaben aus der Spielerstellung. */
function startGame() {
  const setup = commitPlayerSetup();
  settings = setup.settings;

  const courses = buildRound(settings.holeCount);
  const match = createMatch(setup.players, courses, settings);

  sound.setEnabled(settings.soundEnabled);
  sound.unlock(); // Aufruf erfolgt aus einem Klick heraus – Audio ist damit erlaubt.
  updateSoundButton(settings.soundEnabled);

  setState({ match, screen: SCREEN.GAME, paused: false, lastThrow: null, lastShot: null });
  showScreen(SCREEN.GAME);
  hideHoleSummary();
  setHidden(qs('#pause-overlay'), true);
  updatePauseButton(false);

  engine.startMatch(match);
  refreshHud();

  toast(`${APP_NAME}: ${currentCourse(match).name} – Par ${currentCourse(match).par}`, 'info');
}

/** Aktualisiert die Spielanzeige. */
function refreshHud() {
  if (!state.match) return;
  updateHud({
    match: state.match,
    phase: engine ? engine.phase : TURN_PHASE.IDLE,
    lastThrow: state.lastThrow,
    lastShot: state.lastShot,
    paused: state.paused,
  });
}

/** Zeigt die Zusammenfassung einer beendeten Bahn und schaltet danach weiter. */
function onHoleFinished(data) {
  const match = state.match;
  const isLastPlayer = match.currentPlayerIndex + 1 >= match.players.length;
  const isLastHole = match.currentHoleIndex + 1 >= match.courses.length;

  const nextLabel = isLastPlayer && isLastHole
    ? 'Endstand ansehen'
    : isLastPlayer ? 'Nächste Bahn' : 'Nächster Spieler';

  showHoleSummary({
    playerName: data.player.name,
    playerColor: data.player.color,
    courseName: data.course.name,
    strokes: data.strokes,
    par: data.course.par,
    holed: data.holed,
    nextLabel,
    onContinue: () => {
      const result = engine.advance();
      if (result.type === 'gameEnd') return; // onGameEnd übernimmt
      setState({ lastThrow: null, lastShot: null });
      refreshHud();
    },
  });

  if (!data.holed) {
    toast(`Schlaggrenze von ${RULES.maxStrokesPerHole} Schlägen erreicht.`, 'warn');
  }
}

/** Spiel beendet: Ergebnis anzeigen und Bestenliste ergänzen. */
function onGameEnd({ match }) {
  hideHoleSummary();
  renderResult(match);
  showScreen(SCREEN.RESULT);
  setState({ screen: SCREEN.RESULT });

  if (!match.settings.trainingMode) {
    addHighscores(buildHighscoreEntries(match));
  } else {
    toast('Trainingsmodus: Ergebnis wurde nicht gespeichert.', 'info');
  }
}

/** Beendet das laufende Spiel und kehrt zum Start zurück. */
function quitGame() {
  if (engine) engine.stop();
  hideHoleSummary();
  setHidden(qs('#pause-overlay'), true);
  setState({ match: null, screen: SCREEN.START, paused: false });
  showScreen(SCREEN.START);
}

/** Pausiert das Spiel oder setzt es fort. */
function togglePause(force) {
  if (!engine || !state.match) return;
  const paused = typeof force === 'boolean' ? force : !state.paused;
  setState({ paused });
  engine.setPaused(paused);
  setHidden(qs('#pause-overlay'), !paused);
  updatePauseButton(paused);
  refreshHud();
}

/* ------------------------------------------------------------------ *
 * Oberfläche verdrahten
 * ------------------------------------------------------------------ */

function wireStartScreen() {
  qs('#btn-start-game').addEventListener('click', () => {
    sound.unlock();
    initPlayerSetup();
    setState({ screen: SCREEN.SETUP });
    showScreen(SCREEN.SETUP);
  });

  qs('#btn-open-connection').addEventListener('click', () => {
    setPrimaryProvider('autodarts');
    openConnectionDialog();
  });

  qs('#btn-test-mode').addEventListener('click', () => {
    setPrimaryProvider('test');
    setTestPanelOpen(true);
    toast('Testmodus aktiv. Würfe kommen aus dem Testpanel.', 'good');
  });

  qs('#btn-open-guide').addEventListener('click', () => {
    setState({ screen: SCREEN.GUIDE });
    showScreen(SCREEN.GUIDE);
  });

  qs('#btn-fullscreen-start').addEventListener('click', () => toggleFullscreen());
  qs('#btn-guide-back').addEventListener('click', () => {
    setState({ screen: SCREEN.START });
    showScreen(SCREEN.START);
  });
}

/**
 * Erklärvideo: Dialog öffnen und schließen.
 *
 * Das Video wird erst geladen, wenn es abgespielt wird (preload="none").
 * Beim Schließen wird es angehalten, damit im Hintergrund kein Ton läuft.
 */
function wireVideoDialog() {
  const dialog = qs('#video-dialog');
  const video = qs('#demo-video');
  if (!dialog || !video) return;

  const open = () => {
    setHidden(dialog, false);
  };
  const close = () => {
    try {
      video.pause();
    } catch { /* ohne Abspielunterstützung unkritisch */ }
    setHidden(dialog, true);
  };

  qs('#btn-open-video').addEventListener('click', open);
  qs('#btn-video-close').addEventListener('click', close);
  // Klick auf den Hintergrund schließt den Dialog.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  return { open, close };
}

/** Ist der Videodialog gerade offen? */
function isVideoDialogOpen() {
  const dialog = qs('#video-dialog');
  return Boolean(dialog && !dialog.hasAttribute('hidden'));
}

function wireSetupScreen() {
  qs('#btn-setup-back').addEventListener('click', () => {
    setState({ screen: SCREEN.START });
    showScreen(SCREEN.START);
  });
  qs('#btn-setup-start').addEventListener('click', startGame);
}

function wireGameScreen() {
  qs('#btn-pause').addEventListener('click', () => togglePause());
  qs('#btn-resume').addEventListener('click', () => togglePause(false));
  qs('#btn-fullscreen-game').addEventListener('click', () => toggleFullscreen());
  qs('#btn-test-panel').addEventListener('click', () => setTestPanelOpen(!isTestPanelOpen()));

  qs('#btn-sound').addEventListener('click', () => {
    settings.soundEnabled = !settings.soundEnabled;
    sound.setEnabled(settings.soundEnabled);
    if (settings.soundEnabled) sound.unlock();
    saveSettings(settings);
    updateSoundButton(settings.soundEnabled);
  });

  qs('#btn-restart').addEventListener('click', () => {
    if (!state.match) return;
    const courses = buildRound(state.match.settings.holeCount);
    const match = createMatch(
      state.match.players.map((p) => ({ name: p.name, color: p.color })),
      courses,
      state.match.settings,
    );
    setState({ match, lastThrow: null, lastShot: null, paused: false });
    hideHoleSummary();
    setHidden(qs('#pause-overlay'), true);
    updatePauseButton(false);
    engine.startMatch(match);
    refreshHud();
    toast('Spiel neu gestartet.', 'info');
  });

  qs('#btn-quit').addEventListener('click', quitGame);
}

function wireResultScreen() {
  qs('#btn-result-again').addEventListener('click', () => {
    initPlayerSetup();
    setState({ screen: SCREEN.SETUP });
    showScreen(SCREEN.SETUP);
  });
  qs('#btn-result-home').addEventListener('click', () => {
    setState({ screen: SCREEN.START });
    showScreen(SCREEN.START);
  });
}

/** Tastatursteuerung. */
function wireKeyboard() {
  window.addEventListener('keydown', (event) => {
    // Läuft das Erklärvideo, gehören alle Tasten dem Player.
    // Nur Escape schließt den Dialog.
    if (isVideoDialogOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        videoDialog.close();
      }
      return;
    }

    // Eingabefelder haben Vorrang.
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    }

    // Debugpanel: Shift + D
    if (event.shiftKey && event.key.toUpperCase() === DEBUG.toggleKey) {
      event.preventDefault();
      toggleDebug();
      return;
    }

    switch (event.key) {
      case 'f':
      case 'F':
        event.preventDefault();
        toggleFullscreen();
        return;
      case 'p':
      case 'P':
        if (getCurrentScreen() === SCREEN.GAME) {
          event.preventDefault();
          togglePause();
        }
        return;
      case ' ':
        event.preventDefault();
        sound.unlock();
        triggerSelectedThrow();
        return;
      case 'Escape':
        if (isConnectionDialogOpen()) return; // Dialog schließt sich selbst
        if (getCurrentScreen() === SCREEN.GAME) togglePause(true);
        return;
      default:
        break;
    }

    // Alles Weitere gehört zum Testpanel (Segmentwahl, Art, Zufall).
    if (handleTestKey(event)) {
      event.preventDefault();
      sound.unlock();
    }
  });
}

/** Reagiert auf Netzwerkwechsel. */
function wireNetworkState() {
  const update = () => {
    setState({ online: navigator.onLine });
    setHidden(qs('#offline-note'), navigator.onLine);
    if (!navigator.onLine && state.providerName === 'autodarts') {
      toast('Offline: Spiel und Testmodus laufen weiter, die Autodarts-Verbindung nicht.', 'warn');
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/** Registriert den Service Worker (nur für den Offline-Betrieb dieser App). */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Über file:// funktioniert kein Service Worker – dann wird still verzichtet.
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    // Übernimmt eine neue Version die Kontrolle, einmal neu laden – sonst
    // läuft bis zum nächsten Aufruf noch der alte Code.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch((err) => {
      console.warn('[DartGolf] Service Worker nicht registriert:', err && err.message);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

function init() {
  setText(qs('#version-label'), APP_VERSION);
  document.title = `${APP_NAME} – Minigolf mit Dartpfeilen`;

  engine = new GameEngine({
    canvas: qs('#stage-canvas'),
    sound,
    callbacks: {
      onPhaseChange: () => refreshHud(),
      onShotPlanned: ({ shot }) => {
        setState({ lastShot: shot });
        refreshHud();
      },
      onStroke: () => refreshHud(),
      onMiss: () => toast('Kein Ballkontakt – der Schlag zählt trotzdem.', 'warn'),
      onHazard: ({ hazard, penalty }) => {
        toast(`${hazard.name || 'Gefahr'}: +${penalty} Strafschlag, zurück zum letzten Punkt.`, 'warn');
        refreshHud();
      },
      onHoleFinished,
      onGameEnd,
      onPlayerChanged: ({ player }) => toast(`${player.name} ist dran.`, 'info'),
      onHoleChanged: ({ course }) => toast(`Neue Bahn: ${course.name} – Par ${course.par}`, 'info'),
      onThrowRejected: ({ reason, text }) => {
        // Nicht jede Ablehnung muss den Bildschirm stören.
        if (reason === REJECT.DUPLICATE || reason === REJECT.COOLDOWN || reason === REJECT.BALL_MOVING) {
          toast(text, 'warn');
        }
      },
    },
  });

  subscribeProviders();
  initTestPanel(testProvider);
  initConnectionPanel(autodartsProvider, {
    onUseTestMode: () => {
      setPrimaryProvider('test');
      setTestPanelOpen(true);
      toast('Zurück im Testmodus.', 'good');
    },
  });

  initDebugPanel(() => ({
    ...(engine ? engine.getDebugSnapshot() : {}),
    providerName: state.providerName,
    connection: state.connection,
    connectionDetail: state.connectionDetail,
    lastThrow: state.lastThrow,
    lastError: state.lastError,
    sound: sound.getStatus(),
  }));

  wireStartScreen();
  wireSetupScreen();
  videoDialog = wireVideoDialog() || videoDialog;
  wireGameScreen();
  wireResultScreen();
  wireKeyboard();
  wireNetworkState();
  setupOrientationHint();

  setPrimaryProvider('test');
  showScreen(SCREEN.START);
  registerServiceWorker();

  // Eine kurze Startmeldung in der Konsole hilft beim Prüfen der Version.
  console.info(`[${APP_NAME}] ${APP_VERSION} bereit. Testmodus aktiv, ${loadHighscores().length} gespeicherte Ergebnisse.`);
}

document.addEventListener('DOMContentLoaded', init);
