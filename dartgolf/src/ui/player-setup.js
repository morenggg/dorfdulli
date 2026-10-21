/**
 * DartGolf – Spielerstellung
 *
 * Baut das Formular für Spieler, Reihenfolge, Bahnanzahl, Steuerungsmodus,
 * Ton und Trainingsmodus. Alles wird lokal gespeichert.
 */

import { el, qs, replaceChildren } from './dom.js';
import { PLAYER_COLORS, RULES, CONTROL_MODE, APP_VERSION } from '../config.js';
import { loadHighscores, loadPlayers, loadSettings, savePlayers, saveSettings, clearAllStoredData } from '../state.js';
import { toast } from './screens.js';
import { formatToPar } from '../game/scoring.js';

/** Aktueller Bearbeitungsstand des Formulars. */
let draftPlayers = [];
let draftSettings = {};

/** Erzeugt einen Standardnamen für einen neuen Spieler. */
function defaultPlayer(index) {
  return { name: `Spieler ${index + 1}`, color: PLAYER_COLORS[index % PLAYER_COLORS.length] };
}

/**
 * Baut die Spielerstellung auf.
 * @param {() => void} onChange wird nach jeder Änderung aufgerufen (Neuaufbau)
 */
export function renderPlayerSetup(onChange) {
  const body = qs('#setup-body');
  if (!body) return;

  const rows = draftPlayers.map((player, index) => el('div', { class: 'player-row' }, [
    el('span', { class: 'player-index', text: `${index + 1}.` }),
    el('input', {
      type: 'text',
      value: player.name,
      maxlength: '18',
      'aria-label': `Name Spieler ${index + 1}`,
      onInput: (event) => {
        draftPlayers[index].name = event.target.value.slice(0, 18);
      },
    }),
    el('input', {
      type: 'color',
      value: player.color,
      'aria-label': `Farbe Spieler ${index + 1}`,
      onInput: (event) => {
        draftPlayers[index].color = event.target.value;
        onChange();
      },
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--small btn--ghost btn--move',
      text: '↑',
      title: 'Nach oben',
      disabled: index === 0,
      onClick: () => {
        const [moved] = draftPlayers.splice(index, 1);
        draftPlayers.splice(index - 1, 0, moved);
        onChange();
      },
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--small btn--ghost',
      text: '✕',
      title: 'Spieler entfernen',
      disabled: draftPlayers.length <= RULES.minPlayers,
      onClick: () => {
        draftPlayers.splice(index, 1);
        onChange();
      },
    }),
  ]));

  const playerGroup = el('div', { class: 'field-group' }, [
    el('h3', { text: `Spieler (${draftPlayers.length} von ${RULES.maxPlayers})` }),
    el('div', { class: 'player-rows' }, rows),
    el('div', { class: 'option-row' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--small',
        text: '+ Spieler hinzufügen',
        disabled: draftPlayers.length >= RULES.maxPlayers,
        onClick: () => {
          draftPlayers.push(defaultPlayer(draftPlayers.length));
          onChange();
        },
      }),
    ]),
    el('p', { class: 'field-hint', text: 'Die Reihenfolge von oben nach unten ist die Spielreihenfolge.' }),
  ]);

  const holeGroup = el('div', { class: 'field-group' }, [
    el('h3', { text: 'Bahnen' }),
    el('div', { class: 'option-row' }, RULES.holeCountOptions.map((count) => el('button', {
      type: 'button',
      class: 'btn btn--small btn--toggle',
      text: `${count}`,
      'aria-pressed': draftSettings.holeCount === count ? 'true' : 'false',
      onClick: () => {
        draftSettings.holeCount = count;
        onChange();
      },
    }))),
    el('p', {
      class: 'field-hint',
      text: 'Neun verschiedene Bahnen. Bei 3 oder 6 werden die ersten davon gespielt.',
    }),
  ]);

  const modeGroup = el('div', { class: 'field-group' }, [
    el('h3', { text: 'Steuerung' }),
    el('div', { class: 'option-row' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--small btn--toggle',
        text: 'Einfach',
        'aria-pressed': draftSettings.controlMode === CONTROL_MODE.SIMPLE ? 'true' : 'false',
        onClick: () => {
          draftSettings.controlMode = CONTROL_MODE.SIMPLE;
          onChange();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--small btn--toggle',
        text: 'Fortgeschritten',
        'aria-pressed': draftSettings.controlMode === CONTROL_MODE.ADVANCED ? 'true' : 'false',
        onClick: () => {
          draftSettings.controlMode = CONTROL_MODE.ADVANCED;
          onChange();
        },
      }),
    ]),
    el('p', {
      class: 'field-hint',
      text: draftSettings.controlMode === CONTROL_MODE.SIMPLE
        ? 'Einfach: der Schlag wird anteilig Richtung Loch gedreht.'
        : 'Fortgeschritten: der Segmentwinkel gilt ohne Zielhilfe.',
    }),
  ]);

  const optionsGroup = el('div', { class: 'field-group' }, [
    el('h3', { text: 'Optionen' }),
    el('label', { class: 'checkbox-row' }, [
      el('input', {
        type: 'checkbox',
        checked: draftSettings.soundEnabled,
        onChange: (event) => { draftSettings.soundEnabled = event.target.checked; },
      }),
      'Ton einschalten',
    ]),
    el('label', { class: 'checkbox-row' }, [
      el('input', {
        type: 'checkbox',
        checked: draftSettings.trainingMode,
        onChange: (event) => { draftSettings.trainingMode = event.target.checked; },
      }),
      'Trainingsmodus (Ergebnisse zählen nicht für die Bestenliste)',
    ]),
    el('label', { class: 'checkbox-row' }, [
      el('input', {
        type: 'checkbox',
        checked: draftSettings.useCoordinates,
        onChange: (event) => { draftSettings.useCoordinates = event.target.checked; },
      }),
      'Koordinatensteuerung nutzen, falls Koordinaten vorliegen',
    ]),
    el('p', {
      class: 'field-hint',
      text: 'Ohne echte Trefferkoordinaten bleibt automatisch die Segmentsteuerung aktiv.',
    }),
  ]);

  const scores = loadHighscores().slice(0, 8);
  const scoreGroup = el('div', { class: 'field-group' }, [
    el('h3', { text: 'Lokale Bestenliste' }),
    scores.length === 0
      ? el('p', { class: 'field-hint', text: 'Noch keine Ergebnisse gespeichert.' })
      : el('table', { class: 'highscore-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Name' }),
          el('th', { text: 'Schläge' }),
          el('th', { text: 'Par' }),
          el('th', { text: 'Bahnen' }),
          el('th', { text: 'Datum' }),
        ])]),
        el('tbody', {}, scores.map((entry) => el('tr', {}, [
          el('td', { text: entry.name }),
          el('td', { text: String(entry.strokes) }),
          el('td', { text: formatToPar(entry.toPar) }),
          el('td', { text: String(entry.holes) }),
          el('td', { text: entry.date }),
        ]))),
      ]),
    el('div', { class: 'option-row' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--small btn--ghost',
        text: 'Lokale Daten löschen',
        onClick: () => {
          clearAllStoredData();
          toast('Gespeicherte Einstellungen und Ergebnisse gelöscht.', 'good');
          onChange();
        },
      }),
    ]),
  ]);

  replaceChildren(body, [
    playerGroup, holeGroup, modeGroup, optionsGroup, scoreGroup,
    el('p', { class: 'field-hint', text: `Version ${APP_VERSION}` }),
  ]);
}

/**
 * Lädt gespeicherte Werte und baut das Formular neu auf.
 * @returns {{players: Array, settings: Object}}
 */
export function initPlayerSetup() {
  draftPlayers = loadPlayers();
  if (draftPlayers.length === 0) draftPlayers = [defaultPlayer(0)];
  draftSettings = loadSettings();

  const rerender = () => renderPlayerSetup(rerender);
  rerender();
  return { players: draftPlayers, settings: draftSettings };
}

/**
 * Liefert die aktuellen Eingaben und speichert sie lokal.
 * @returns {{players: {name:string,color:string}[], settings: Object}}
 */
export function commitPlayerSetup() {
  const players = draftPlayers.map((player, index) => ({
    name: player.name.trim() || `Spieler ${index + 1}`,
    color: player.color,
  }));
  savePlayers(players);
  saveSettings(draftSettings);
  return { players, settings: { ...draftSettings } };
}
