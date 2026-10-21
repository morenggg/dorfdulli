/**
 * DartGolf – zentrale Konfiguration
 *
 * Alle spielbestimmenden Zahlenwerte stehen hier, damit das Balancing ohne
 * Eingriff in die Spiel-Logik geändert werden kann. Kein Modul darf solche
 * Werte hart codieren.
 *
 * Enthält bewusst KEINE Zugangsdaten, Tokens oder Secrets.
 */

/** Arbeitstitel – zentral, damit ein späterer Rename nur hier passiert. */
export const APP_NAME = 'DartGolf';
export const APP_VERSION = 'Prototype 0.2';

/** Prefix für alle localStorage-Schlüssel (verhindert Kollisionen mit der Website). */
export const STORAGE_PREFIX = 'dartgolf:';

/**
 * Reihenfolge der Segmente einer Standard-Steeldart-Scheibe,
 * im Uhrzeigersinn beginnend bei der 20 (oben).
 * Index * 18° ergibt den Winkel des Segmentmittelpunkts.
 */
export const BOARD_SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
  3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

/** Gradmaß eines Segments (360 / 20). */
export const SEGMENT_ARC_DEGREES = 360 / BOARD_SEGMENT_ORDER.length;

/**
 * Schlagstärken je Trefferart, in Welt-Einheiten pro Sekunde.
 * Eine Bahn ist per Konvention 1000 Einheiten breit (siehe /src/courses).
 */
export const SHOT_POWER = {
  /** Single: leichter Schlag. */
  single: 420,
  /** Double: mittlerer Schlag. */
  double: 640,
  /** Triple: starker Schlag. */
  triple: 880,
  /** Outer Bull (25): präziser mittlerer Schlag Richtung Loch. */
  outerBull: 600,
  /** Bullseye (50): Präzisionsschlag, Stärke wird auf die Loch-Distanz gerechnet. */
  bullseye: 700,
  /** Miss: kein Ballkontakt. */
  miss: 0,
};

/** Steuerungsmodi. */
export const CONTROL_MODE = {
  SIMPLE: 'simple',
  ADVANCED: 'advanced',
};

/**
 * Zielhilfe und Streuung je Steuerungsmodus.
 * `aimAssist` = Anteil (0..1), um den die Segment-Richtung Richtung Loch
 * gedreht wird. `spreadDeg` = zufällige Streuung in Grad (0 = reproduzierbar).
 */
export const CONTROL_TUNING = {
  [CONTROL_MODE.SIMPLE]: { aimAssist: 0.35, spreadDeg: 0, powerTolerance: 1.12 },
  [CONTROL_MODE.ADVANCED]: { aimAssist: 0, spreadDeg: 0, powerTolerance: 1.0 },
};

/** Physik-Parameter der Minigolf-Engine. */
export const PHYSICS = {
  /** Ballradius in Welt-Einheiten. */
  ballRadius: 9,
  /**
   * Rollreibung als Anteil der verbleibenden Geschwindigkeit pro Sekunde.
   * 0.62 => nach einer Sekunde sind noch 38 % der Geschwindigkeit übrig.
   */
  friction: 0.62,
  /** Unterhalb dieser Geschwindigkeit gilt der Ball als stehend. */
  stopSpeed: 12,
  /** Energieerhalt bei Wandkontakt (1 = perfekt elastisch). */
  wallRestitution: 0.74,
  /** Energieerhalt an Hindernissen. */
  obstacleRestitution: 0.7,
  /** Maximale Geschwindigkeit – verhindert Tunneln durch Wände. */
  maxSpeed: 1400,
  /** Fester Simulationsschritt in Sekunden (unabhängig von der Bildrate). */
  fixedStep: 1 / 120,
  /** Maximale nachgeholte Simulationszeit pro Frame (gegen Aufhol-Spiralen). */
  maxFrameTime: 0.1,
  /**
   * Der Ball fällt nur ins Loch, wenn er langsam genug ist – sonst rollt er
   * über die Kante hinweg. Wert in Welt-Einheiten pro Sekunde.
   */
  /** Zusätzliche Bremswirkung im Sandbunker (zur normalen Rollreibung). */
  sandFriction: 0.985,
  holeCaptureSpeed: 430,
  /** Sicherheitsabstand, ab dem der Ballmittelpunkt als "im Loch" gilt. */
  holeCaptureFactor: 0.75,
  /** Nach so vielen Sekunden ohne Stillstand wird der Ball zwangsgestoppt. */
  maxRollSeconds: 20,
};

/** Regelwerk. */
export const RULES = {
  /** Strafschlag bei Wasser / Aus. */
  hazardPenalty: 1,
  /** Nach so vielen Schlägen wird die Bahn für den Spieler beendet. */
  maxStrokesPerHole: 8,
  /** Ein "Miss" zählt als Schlag, bewegt den Ball aber nicht. */
  missCountsAsStroke: true,
  /** Auswählbare Bahn-Anzahlen. */
  holeCountOptions: [3, 6, 9],
  /** Spielerzahl-Grenzen. */
  minPlayers: 1,
  maxPlayers: 6,
};

/** Schutz gegen doppelt empfangene bzw. zu schnell aufeinanderfolgende Treffer. */
export const INPUT_GUARD = {
  /** Mindestabstand zwischen zwei akzeptierten Würfen in Millisekunden. */
  cooldownMs: 600,
  /** So viele zuletzt gesehene Wurf-IDs werden zur Duplikaterkennung gemerkt. */
  seenIdBufferSize: 64,
  /**
   * Sollen Würfe während der Ballbewegung in eine Warteschlange gelegt werden?
   * false = sie werden verworfen (mit Hinweis in der UI).
   */
  queueWhileBallMoving: false,
  /** Maximale Länge der Warteschlange, falls aktiviert. */
  maxQueueLength: 3,
};

/** Timing der Zug-Visualisierung in Millisekunden. */
export const TIMING = {
  /** Dauer der Richtungs-/Stärke-Vorschau vor dem Abschlag. */
  aimPreviewMs: 750,
  /** Pause nach Stillstand, bevor der nächste Wurf freigegeben wird. */
  settleDelayMs: 550,
  /** Anzeigedauer der Bahn-Zusammenfassung. */
  holeSummaryMs: 3200,
  /** Dauer eines Toasts. */
  toastMs: 2600,
};

/** Farbpalette für die Spielerauswahl (eigene Gestaltung, Neon-Akzente). */
export const PLAYER_COLORS = [
  '#3ddc97', // mint
  '#ff5d8f', // magenta
  '#4cc9f0', // cyan
  '#ffb703', // amber
  '#b892ff', // violett
  '#ff7b54', // koralle
];

/** Voreinstellung der Spielereinrichtung. */
export const DEFAULT_SETTINGS = {
  holeCount: 3,
  controlMode: CONTROL_MODE.SIMPLE,
  soundEnabled: true,
  trainingMode: false,
  /** Empfohlene Würfe als Streifen auf der Bahn zeigen. */
  showHints: true,
  /** Koordinatensteuerung (Modus B) – nur wirksam, wenn Koordinaten vorliegen. */
  useCoordinates: false,
  autoReconnect: true,
};

/** Konfiguration der Koordinatensteuerung (Modus B). */
export const COORDINATE_MODE = {
  /**
   * Maximaler Winkelversatz in Grad bei x = ±1.
   * x wird relativ zur direkten Linie zum Loch interpretiert.
   */
  maxAngleDeg: 75,
  /** Schlagstärke bei y = -1 (unterer Scheibenrand). */
  minPower: 360,
  /** Schlagstärke bei y = +1 (oberer Scheibenrand). */
  maxPower: 900,
  /** Innerhalb dieses Radius (0..1) gilt ein Treffer als Präzisionsschlag. */
  precisionRadius: 0.12,
};

/** Sound-Ereignisse (Namen werden vom SoundManager erwartet). */
export const SOUND_EVENTS = [
  'dart',          // erkannter Dartwurf
  'hit',           // Ballabschlag
  'wall',          // Bandenkollision
  'hazard',        // Wasser / Aus
  'holed',         // Ball im Loch
  'playerChange',  // Spielerwechsel
  'holeComplete',  // Bahn abgeschlossen
  'gameComplete',  // Spiel abgeschlossen
];

/**
 * Autodarts-Anbindung – EXPERIMENTELL.
 *
 * Wichtig: Hier stehen bewusst keine erfundenen Endpunkte. Der Nutzer gibt die
 * Adresse seiner eigenen Quelle selbst an; Standardwerte sind leer.
 * Details siehe AUTODARTS-INTEGRATION.md.
 */
export const AUTODARTS = {
  /** Verfügbare Transportwege des experimentellen Providers. */
  transports: {
    /** Empfang über BroadcastChannel/postMessage einer Bridge (Erweiterung/Userscript). */
    BRIDGE: 'bridge',
    /** Direkte WebSocket-Verbindung zu einer vom Nutzer angegebenen Adresse. */
    WEBSOCKET: 'websocket',
  },
  /** Name des BroadcastChannels, den eine Bridge nutzen muss. */
  bridgeChannelName: 'dartgolf-bridge',
  /** Protokollversion der Bridge-Nachrichten. */
  bridgeProtocolVersion: 1,
  /** Keine Vorbelegung – es wird keine URL erfunden. */
  defaultWebsocketUrl: '',
  /** Wiederverbindung. */
  reconnect: {
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    factor: 1.8,
    maxAttempts: 8,
  },
  /** Nach dieser Zeit ohne Nachricht gilt die Verbindung als still. */
  idleWarningMs: 120000,
};

/** Debug-Panel. */
export const DEBUG = {
  /** Query-Parameter, der das Panel freischaltet. */
  queryFlag: 'debug',
  /** Tastenkombination (Shift + D) als Alternative. */
  toggleKey: 'D',
  /** So viele Rohereignisse werden im Speicher gehalten. */
  rawEventBufferSize: 20,
};

/** Feldnamen, deren Werte im Debug-Panel maskiert werden. */
export const SENSITIVE_KEYS = [
  'token', 'access_token', 'accessToken', 'refresh_token', 'refreshToken',
  'id_token', 'idToken', 'authorization', 'auth', 'password', 'passwort',
  'secret', 'clientSecret', 'apiKey', 'api_key', 'cookie', 'session',
  'bearer', 'credentials', 'email', 'mail',
];
