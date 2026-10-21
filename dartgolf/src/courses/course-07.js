/**
 * Bahn 7 – "Serpentine"
 *
 * Zwei Holzwände zwingen den Ball in eine S-Kurve: erst unten durch, dann
 * oben herum. Über die Banden lassen sich Schläge sparen.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course07 = {
  id: 'serpentine',
  name: 'Serpentine',
  par: 4,
  width: 1000,
  height: 600,
  hint: 'Unten durch, oben herum. Banden helfen.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 175, y: 140 },
  hole: { x: 830, y: 450, radius: 22 },

  polygon: [
    [60, 60], [940, 60], [940, 540], [60, 540],
  ],

  walls: [
    { x1: 340, y1: 60, x2: 340, y2: 390 },
    { x1: 660, y1: 210, x2: 660, y2: 540 },
  ],

  obstacles: [],

  hazards: [
    { shape: 'circle', kind: 'sand', x: 500, y: 110, r: 40, name: 'Bunker' },
  ],
};
