# DartGolf

Digitales Minigolf, gesteuert durch Dartwürfe. Läuft vollständig im Browser,
ohne Installation, ohne Server, ohne Buildschritt.

**Version: Prototype 0.1** · Arbeitstitel „DartGolf“ (zentral in
`src/config.js` als `APP_NAME` – ein Rename ist eine Zeile).

---

## 1. Projektziel

Ein vorhandenes Autodarts-Kamerasystem soll später ein Minigolfspiel auf einem
Fernseher steuern: jeder erkannte Dart ist ein Schlag. Das getroffene Segment
bestimmt die Richtung, der Multiplikator die Stärke.

Damit das Spiel nicht von einer bestimmten API abhängt, sind Trefferquelle und
Spiel strikt getrennt:

```
Autodarts | Testmodus | manuelle Eingabe
        └──> einheitliches DartThrow-Ereignis
                └──> Zugfilter (Duplikate, Cooldown, Ballbewegung)
                        └──> Schlagberechnung (Segment- oder Koordinatenmodus)
                                └──> Ballphysik und Bahn
                                        └──> Punkte und Oberfläche
```

Das Spiel kennt keine WebSockets und kein Autodarts. Es kennt nur `DartThrow`.

---

## 2. Aktueller Funktionsumfang

**Fertig und geprüft**

* Vollständig spielbar im Testmodus – ohne Dartscheibe, ohne Autodarts.
* 9 eigenständige Bahnen (Par 32), wahlweise 3, 6 oder 9 davon.
* Gefahren: Wasser und Aus (Strafschlag), Sandbunker (bremst stark, kein Strafschlag).
* Realistische Darstellung: gemähter Rasen, Holzbanden, Teiche, Bunker,
  Findlinge, wehende Fahne, Bäume rund um die Anlage (`src/game/course-renderer.js`).
* 1 bis 6 Spieler mit Name, Farbe und Reihenfolge.
* Eigene 2D-Physik: Rollreibung, Bandenreflexion, Hindernisse, Wasser/Aus,
  Strafschläge, Loch-Erkennung mit Geschwindigkeitsgrenze.
* Zwei Steuerungsmodi (einfach mit Zielhilfe, fortgeschritten ohne).
* Punktezählung je Bahn und Spieler, Par-Differenz, Rangliste, lokale Bestenliste.
* Testpanel für jeden möglichen Wurf, Zufallswurf, Testsequenz, Tastatursteuerung.
* Debug-Panel mit maskierten sensiblen Werten.
* PWA: Manifest, Icons, Service Worker, Offline-Seite.
* 65 automatische Tests (Node und Browser).

**Vorbereitet, aber nicht mit echten Daten belegt**

* Autodarts-Anbindung (Provider, Normalizer, Verbindungsdialog, Bridge-Protokoll).
* Koordinatensteuerung (Modus B) – aktiv nur, wenn echte Koordinaten ankommen.
* Optionale Bridge-Erweiterung unter `bridge-extension/`.

Details und die ehrliche Einordnung stehen in `AUTODARTS-INTEGRATION.md`.

---

## 3. Verzeichnisstruktur

```
dartgolf/
  index.html                  Alle Bildschirme als Grundgerüst
  styles.css                  Gestaltung (dunkel, kontrastreich, responsiv)
  app.js                      Verdrahtung von Provider, Engine und Oberfläche
  manifest.webmanifest        PWA-Manifest
  sw.js                       Service Worker (Scope /dartgolf/)
  offline.html                Offline-Startseite
  package.json                nur für den Testlauf mit Node (keine Abhängigkeiten)

  assets/
    icons/                    App-Icons (selbst erzeugt)
    audio/                    Platz für eigene Klangdateien (derzeit leer)
    images/                   Platz für eigene Grafiken (derzeit leer)

  src/
    config.js                 Alle Stellschrauben: Stärken, Physik, Regeln, Timing
    state.js                  Laufzeit-Zustand + localStorage

    game/
      game-engine.js          Loop, Zugablauf
      course-renderer.js      Zeichnen der Bahn (Rasen, Banden, Wasser, Fahne …)
      golf-physics.js         Vektoren, Bewegung, Reibung, Reflexion
      collision-system.js     Kreis gegen Strecke/Kreis, Gefahren, Loch
      course-manager.js       Bahnen laden, aufbereiten, Runde zusammenstellen
      shot-mapper.js          Dartwurf -> Richtung und Stärke
      scoring.js              Schläge, Par, Rangliste
      turn-manager.js         Eingangsfilter und Reihenfolge

    input/
      dart-provider.js        Schnittstelle + DartThrow-Erzeugung
      test-provider.js        Testmodus
      manual-provider.js      Eingabe von Hand
      autodarts-provider.js   Autodarts (experimentell)
      autodarts-normalizer.js Rohereignis -> DartThrow

    ui/
      dom.js                  Kleine DOM-Helfer (kein innerHTML)
      screens.js              Bildschirmwechsel, Toasts, Vollbild, Ergebnis
      hud.js                  Anzeige während des Spiels
      player-setup.js         Spielerstellung
      test-panel.js           Testpanel
      connection-panel.js     Verbindungsdialog
      debug-panel.js          Debug-Panel + Maskierung

    audio/
      sound-manager.js        Klänge, zur Laufzeit selbst erzeugt

    courses/
      course-01.js            Auftakt (Par 3)
      course-02.js            Bande (Par 4)
      course-03.js            Risiko (Par 4)
      course-04.js … 09.js    Knick, Seeblick, Insel, Serpentine, Dünen, Finale

  tests/                      Testgerüst, Testfälle, Browser-Testseite
  bridge-extension/           Optionaler Fallback (ungetestet)
```

`shot-mapper.js` und `ui/dom.js` sind Ergänzungen zur ursprünglich geplanten
Struktur: die Umrechnung Wurf → Schlag und die DOM-Hilfen gehören weder in die
Engine noch in einen einzelnen Bildschirm.

---

## 3b. Erklärvideo

Auf dem Startbildschirm führt die Schaltfläche **„Video ansehen"** zu einem
Erklärvideo (~116 s, 1920×1080). Es wird bewusst erst beim Abspielen geladen
(`preload="none"`, rund 40 MB) und ist vom Service-Worker-Cache ausgenommen –
die Startseite bleibt dadurch leicht. Untertitel liegen als WebVTT bei.

Unter `video/` liegt neben dem Video die **komplette Produktion** – Bühne,
Szenen, Tonspur und Bauskripte:

```
video/out/dartgolf-demo.mp4     fertiges Video
video/out/poster.jpg            Vorschaubild (auch Poster im Player)
video/narration.md              Sprechertext für eine echte Aufnahme
video/captions.vtt              Untertitel für den Player im Browser
video/captions.srt              dieselben Untertitel für Videoschnitt
video/README.md                 wie es gebaut wird und warum so
```

Besonderheit: Die Demo-Passage ist kein Nachbau, sondern die echte App in
einem iframe – mit virtualisierter Zeit, damit sie Frame-genau mitläuft.
Musik und Geräusche sind selbst berechnet, es liegen keine fremden
Mediendateien im Repository.

Neu bauen (Webserver auf `127.0.0.1:8099` vorausgesetzt):

```bash
cd dartgolf/video
npm install playwright ffmpeg-static
node build/build.mjs --fps 30
```

## 4. Lokale Entwicklung

Es gibt keinen Buildschritt. ES-Module brauchen aber einen Webserver
(`file://` funktioniert nicht):

```bash
cd /Pfad/zum/repo
python3 -m http.server 8080
# http://localhost:8080/dartgolf/
```

Tests:

```bash
cd dartgolf
node tests/run-node.mjs        # ohne Browser
# oder http://localhost:8080/dartgolf/tests/ im Browser
```

Debug-Panel: `?debug=true` an die Adresse hängen oder **Shift + D** drücken.

---

## 5. Deployment

Das Repository ist eine statische Website (GitHub Pages). Es genügt, den
Ordner `dartgolf/` zu committen – die Seite ist danach unter `/dartgolf/`
erreichbar. Bestehende Seiten werden nicht berührt.

Nach Änderungen an Dateien der App-Shell sollte die Cache-Version in `sw.js`
(`const CACHE = 'dartgolf-v2'`) erhöht werden, damit alle Clients die neue
Fassung laden.

---

## 6. Testmodus

Der Testmodus ist kein Nebenschauplatz, sondern der Normalfall bis zur
Autodarts-Anbindung. Er wird über „Testmodus“ (Start) oder „Testpanel“
(im Spiel) geöffnet.

Möglich sind:

* Segmente 1–20, Single/Double/Triple
* Outer Bull (25), Bullseye (50), Miss
* optionale Koordinaten x/y (−1 bis 1) für Steuerungsmodus B
* Zufallswurf
* Testsequenz über alle Trefferarten
* Anzeige des erzeugten `DartThrow`-Objekts und des Rohereignisses

---

## 7. Steuerung

### Spielprinzip

Richtung = Lage des Segments auf der Scheibe. Die 20 steht oben und schlägt
nach vorn; jedes Segment im Uhrzeigersinn dreht um 18°:

```
Winkel = Index in [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5] * 18°
```

Also: 20 → vorn, 6 → rechts, 3 → hinten, 11 → links. Eine Formel, keine
Sonderregeln.

Stärke = Multiplikator (Werte in `src/config.js`, `SHOT_POWER`):

| Treffer | Wirkung |
| --- | --- |
| Single | leichter Schlag |
| Double | mittlerer Schlag |
| Triple | starker Schlag |
| Outer Bull (25) | gezielter Schlag Richtung Loch, mittlere Stärke |
| Bullseye (50) | Präzisionsschlag: Richtung und Stärke passend zur Entfernung |
| Miss | kein Ballkontakt – der Schlag zählt trotzdem |

Wasser oder Aus kosten einen Strafschlag; der Ball kehrt an die Stelle vor dem
Schlag zurück. Nach `RULES.maxStrokesPerHole` Schlägen ist die Bahn beendet.

### Tastatur

| Taste | Wirkung |
| --- | --- |
| `1`–`9` (auch mehrstellig, z. B. `2` `0`) | Segment wählen |
| `S` / `D` / `T` | Single / Double / Triple |
| `B` | Bull (nochmal drücken: Bullseye) |
| `M` | Miss |
| `Leertaste` | gewählten Wurf auslösen |
| `R` | Zufallswurf |
| `F` | Vollbild |
| `P` | Pause |
| `Shift + D` | Debug-Panel |

---

## 8. Neue Bahnen erstellen

Bahnen sind reine Daten – die Renderfunktion kennt keine Bahn im Einzelnen.

1. Datei unter `src/courses/course-04.js` anlegen:

```js
export const course04 = {
  id: 'kessel',
  name: 'Kessel',
  par: 4,
  width: 1000,          // Weltmaß, passend zu 16:9
  height: 600,
  hint: 'Kurzer Hinweistext',
  theme: { fairway: '#123a2c', fairwayEdge: '#1d5a42', accent: '#3ddc97', background: '#080d12' },
  start: { x: 150, y: 300 },
  hole:  { x: 850, y: 300, radius: 22 },
  polygon: [[60, 100], [940, 100], [940, 500], [60, 500]],   // Außenbanden
  walls: [],                                                  // freie Bandenstücke
  obstacles: [
    { shape: 'rect',   x: 400, y: 250, w: 120, h: 80 },
    { shape: 'circle', x: 700, y: 200, r: 30 },
  ],
  hazards: [
    { shape: 'rect', kind: 'water', x: 300, y: 380, w: 200, h: 90, name: 'Wasser' },
  ],
};
```

2. In `src/game/course-manager.js` importieren und in `COURSES` eintragen.
3. Datei in `sw.js` zur `SHELL`-Liste hinzufügen und `CACHE` erhöhen.
4. `node tests/run-node.mjs` ausführen – die Tests prüfen automatisch, dass
   Start und Loch innerhalb der Kontur liegen und die Bahn mit gutem Spiel
   innerhalb von Par lösbar ist.

Anhaltswert für die Stärke: die Rollweite beträgt rund das 1,03-fache der
Schlagstärke (`distanceForPower()` in `golf-physics.js`). Ein Triple (880)
rollt also etwa 900 Einheiten weit.

---

## 9. Eingabe-Provider

Jede Trefferquelle erfüllt dieselbe Schnittstelle:

```js
interface DartInputProvider {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  subscribe(callback: (throwData: DartThrow) => void): () => void;
}
```

und liefert ausschließlich:

```js
type DartThrow = {
  id: string;              // eindeutig, für die Duplikaterkennung
  timestamp: number;
  segment: number | null;  // 1..20, 25 oder null (Miss)
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  notation: string;        // "T20", "BULL", "MISS", …
  x?: number;              // nur bei echten, plausiblen Koordinaten
  y?: number;
  source: "test" | "autodarts" | "manual";
  raw?: unknown;           // nur für das Debug-Panel
};
```

Vorhanden: `TestDartProvider`, `ManualDartProvider`, `AutodartsProvider`.
Eine neue Quelle erbt von `BaseDartProvider`, erzeugt Würfe über
`createDartThrow()` und wird in `app.js` per `subscribe(handleThrow)`
angemeldet. Am Spiel ändert sich dabei nichts.

---

## 10. Stand der Autodarts-Anbindung

Kurzfassung – die ausführliche Bewertung steht in `AUTODARTS-INTEGRATION.md`:

* Eine **direkte** Verbindung aus dieser Website scheitert nachweisbar an
  Browser-Regeln (Same-Origin, OAuth-Client, CORS, Mixed Content).
  Es wurde bewusst **keine** unsichere Umgehung gebaut.
* Umgesetzt ist die **Empfangsseite**: ein Bridge-Protokoll
  (`BroadcastChannel` / `postMessage`) und ein WebSocket-Weg mit einer
  Adresse, die ausschließlich der Nutzer einträgt.
* Der Normalizer liest nur Feldpfade, die in quelloffenen Projekten
  nachweislich verwendet werden.
* **Es wurde noch kein einziger echter Autodarts-Wurf verarbeitet.** Der
  Verbindungsdialog sagt das ebenso deutlich.

---

## 11. Bekannte Einschränkungen

* Autodarts-Anbindung ungetestet – ohne echte Quelle kommen keine Würfe an.
* Neun Bahnlayouts. Mehr Bahnen pro Runde gibt es derzeit nicht.
* Die Klänge sind schlichte, zur Laufzeit erzeugte Töne. Der Ordner
  `assets/audio/` ist leer – es wurden bewusst keine fremden Dateien verwendet.
* Der Koordinatenmodus ist vollständig umgesetzt, aber nur mit selbst
  eingegebenen Testkoordinaten geprüft.
* Ein Spieler spielt seine Bahn zu Ende, danach folgt der nächste.
  Abwechselndes Schlagen ist nicht umgesetzt.
* Auf dem iPhone gibt es keinen echten Vollbildmodus für Elemente – dort
  erscheint ein Hinweis statt einer Fehlermeldung.
* Die Bestenliste liegt nur im jeweiligen Browser (kein Abgleich zwischen Geräten).
* `frame-ancestors` fehlt in der CSP: die Richtlinie wirkt nur als HTTP-Header.
  Auf GitHub Pages lassen sich keine Header setzen; alle übrigen CSP-Regeln
  stehen im `<meta>`-Element von `index.html`.

---

## 12. Sicherheit und Datenschutz

> DartGolf verarbeitet Spielstände und Einstellungen lokal in diesem Browser.
> Bei Nutzung der experimentellen Autodarts-Verbindung werden nur die für das
> Spiel erforderlichen Trefferinformationen verarbeitet.

* Keine Analytics, keine Tracker, keine externen Skripte, keine Web-Fonts.
* Keine Secrets im Repository und keine im Frontend.
* Keine Autodarts-Passwörter – sie werden nirgends abgefragt.
* In `localStorage` liegen nur: Einstellungen, Spielernamen/-farben,
  lokale Bestenliste, Transportweg, selbst eingetragene Adresse, Board-ID.
* Kein `eval`, kein `innerHTML` – alle Texte über `textContent`.
* Content Security Policy im `<meta>`-Element: nur eigene Skripte und Stile,
  `object-src 'none'`, `base-uri 'none'`, `connect-src` erlaubt zusätzlich
  `ws:`/`wss:` für eine selbst eingetragene Quelle.
* Rohereignisse erscheinen nur im Debug-Panel und laufen durch
  `maskSensitive()`.
* Der Service Worker behandelt ausschließlich Anfragen im eigenen
  Geltungsbereich `/dartgolf/`.

Alle lokal gespeicherten Daten lassen sich in der Spielerstellung unter
„Lokale Daten löschen“ entfernen.

---

## 13. Nächste Schritte

1. **Bridge mit echter Scheibe prüfen** – die acht offenen Testpunkte in
   `AUTODARTS-INTEGRATION.md`, Abschnitt 7, abarbeiten.
2. Erst danach den Koordinatenmodus mit echten `coords` kalibrieren und die
   Skalierung dokumentieren.
3. Weitere Bahnen, damit 6 und 9 Bahnen ohne Wiederholung auskommen.
4. Eigene Klänge aufnehmen und in `assets/audio/` ablegen; der SoundManager
   ist bereits ereignisbasiert aufgebaut.
5. Turniermodus (mehrere Runden, Gesamtwertung) und Statistiken je Spieler.
6. Optional: gemeinsamer Bildschirm auf dem Fernseher, Bedienung per Smartphone.
