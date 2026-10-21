# DartGolf Bridge – optionaler Fallback (experimentell, ungetestet)

Diese Browser-Erweiterung ist **nicht** Teil des Spiels. Sie ist der in
`AUTODARTS-INTEGRATION.md` beschriebene Fallback (Zielvariante C) für den Fall,
dass eine reine Website die Trefferdaten nicht erreichen kann.

**Status: ungetestet mit echter Scheibe.** Version 0.2 setzt den Haken über `"world": "MAIN"` vor dem Laden der Autodarts-Seite (0.1 kam dafür zu spät). Sie wurde bisher nicht mit einer echten Autodarts-Sitzung
ausgeführt. Ob die Wurfdaten in der beobachteten Form ankommen, ist offen.
Das Spiel selbst funktioniert vollständig ohne diese Erweiterung.

## Warum überhaupt eine Erweiterung?

Kurz: Browser-Regeln, keine technische Bequemlichkeit.

* Eine Seite auf `dorfdulliracing.de` darf die Sitzung von `autodarts.io`
  nicht mitlesen (Same-Origin-Policy). Cookies und Tokens der fremden Domain
  sind für sie unsichtbar.
* Für die Autodarts-Cloud-API wäre ein registrierter OAuth-Client mit
  hinterlegter Redirect-Adresse nötig. Einen solchen gibt es für dieses
  Projekt nicht, und er lässt sich nicht selbst erfinden.
* Ein lokaler Board Manager antwortet im Heimnetz unverschlüsselt über `http`.
  Eine über HTTPS ausgelieferte Seite darf keine `ws://`-Verbindung dorthin
  öffnen (Mixed Content). Das ist eine Browser-Regel und wird hier **nicht**
  umgangen.

Eine kleine Erweiterung darf beides: auf der Autodarts-Seite laufen und mit
dem DartGolf-Tab sprechen.

## Was die Erweiterung tut – und was nicht

**Sie tut:**

1. beobachtet im eigenen, bereits angemeldeten Autodarts-Tab eingehende
   WebSocket-Nachrichten,
2. filtert grob auf Nachrichten, die Wurfinformationen enthalten können,
3. reicht diese unverändert an den geöffneten DartGolf-Tab weiter.

**Sie tut nicht:**

* nichts an Autodarts senden, nichts verändern, nichts umgehen,
* keine Cookies, Tokens, Passwörter oder Kontodaten lesen,
* keine Verbindungsadressen weitergeben (sie können Tokens enthalten),
* keine Daten speichern und nichts an Dritte übertragen.

Alles bleibt im Browser des Nutzers, zwischen zwei seiner eigenen Tabs.

## Dateien

| Datei | Zweck |
| --- | --- |
| `manifest.json` | Manifest V3, Berechtigungen auf das Nötigste begrenzt |
| `hook.js` | Seiten-Kontext: beobachtet den WebSocket der Autodarts-Seite |
| `content-autodarts.js` | fügt `hook.js` ein und reicht Nachrichten weiter |
| `background.js` | leitet an offene DartGolf-Tabs weiter |
| `content-dartgolf.js` | übergibt die Nachricht an die DartGolf-Seite |

## Nachrichtenformat

Was auf der DartGolf-Seite ankommt (per `window.postMessage`, gleicher Origin):

```js
{
  source: 'dartgolf-bridge',
  version: 1,
  type: 'throw',      // oder 'status'
  payload: <Rohereignis von Autodarts, unverändert>
}
```

DartGolf prüft Fenster, Origin, Quelle und Protokollversion und schickt das
`payload` durch `normalizeAutodartsEvent()`. Nicht erkannte Nachrichten werden
still verworfen.

## Installation zum Ausprobieren

0. Fertiges Paket: `dartgolf/dartgolf-bridge.zip` (auch im Verbindungsdialog verlinkt), entpacken.
1. `chrome://extensions` bzw. `edge://extensions` öffnen, Entwicklermodus einschalten.
2. „Entpackte Erweiterung laden“ und den entpackten Ordner wählen.
3. Autodarts-Tab und DartGolf-Tab (`/dartgolf/`) gleichzeitig offen halten.
4. In DartGolf: „Autodarts verbinden“ → Weg „Bridge“ → „Verbindung starten“.

Die Domain in `manifest.json` (`dorfdulliracing.de`) muss zur eigenen Adresse
passen. Beim Testen auf `localhost` ist der Eintrag entsprechend zu ergänzen.

## Offene Punkte

* Wird eine Erweiterung überhaupt gebraucht, oder liefert der lokale Board
  Manager einen erreichbaren Endpunkt? Nicht geprüft.
* Welche Nachricht genau enthält einen neu erkannten Wurf, und wie oft wird
  sie wiederholt? Nicht geprüft. Die Duplikaterkennung in DartGolf ist darauf
  vorbereitet.
* Enthalten die Nachrichten Trefferkoordinaten, und in welcher Skalierung?
  Nicht geprüft – deshalb übernimmt DartGolf nur plausibel normalisierte Werte.
