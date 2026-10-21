/**
 * Bahn 8 – "Dünen"
 *
 * Breite, offene Bahn – aber gespickt mit Bunkern. Wer im Sand landet,
 * verliert viel Tempo, aber keinen Strafschlag.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course08 = {
  id: 'duenen',
  name: 'Dünen',
  par: 3,
  width: 1000,
  height: 600,
  hint: 'Viel Platz, viel Sand. Die Lücken zwischen den Bunkern suchen.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 140, y: 470 },
  hole: { x: 860, y: 140, radius: 22 },

  polygon: [
    [60, 400], [260, 60], [940, 60], [940, 260], [720, 540], [60, 540],
  ],

  walls: [],

  obstacles: [
    { shape: 'circle', x: 640, y: 330, r: 24, label: 'Findling' },
  ],

  hazards: [
    { shape: 'circle', kind: 'sand', x: 400, y: 330, r: 60, name: 'Bunker' },
    { shape: 'circle', kind: 'sand', x: 560, y: 180, r: 55, name: 'Bunker' },
    { shape: 'circle', kind: 'sand', x: 760, y: 230, r: 48, name: 'Bunker' },
    { shape: 'rect', kind: 'sand', x: 880, y: 60, w: 60, h: 40, name: 'Bunker' },
  ],
};
