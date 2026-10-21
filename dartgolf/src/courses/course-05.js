/**
 * Bahn 5 – "Seeblick"
 *
 * Ein Teich liegt genau zwischen Abschlag und Loch. Oben und unten führt
 * je ein Weg um das Wasser herum, oben wartet ein Bunker am Grün.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course05 = {
  id: 'seeblick',
  name: 'Seeblick',
  par: 3,
  width: 1000,
  height: 600,
  hint: 'Direkt geht’s ins Wasser. Oben herum ist kürzer, unten sicherer.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 135, y: 300 },
  hole: { x: 865, y: 300, radius: 22 },

  polygon: [
    [60, 110], [180, 60], [820, 60], [940, 110],
    [940, 490], [820, 540], [180, 540], [60, 490],
  ],

  walls: [],

  obstacles: [],

  hazards: [
    { shape: 'circle', kind: 'water', x: 500, y: 300, r: 135, name: 'Teich' },
    { shape: 'circle', kind: 'sand', x: 800, y: 150, r: 46, name: 'Bunker' },
  ],
};
