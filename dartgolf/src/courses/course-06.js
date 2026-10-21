/**
 * Bahn 6 – "Insel"
 *
 * Das Loch liegt auf einer kleinen Insel. Der einzige Zugang ist ein Steg
 * von links. Ein Findling auf der Ideallinie verlangt einen Umweg.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course06 = {
  id: 'insel',
  name: 'Insel',
  par: 4,
  width: 1000,
  height: 600,
  hint: 'Nur über den Steg aufs Grün. Am Findling vorbei ausrichten.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 140, y: 300 },
  hole: { x: 830, y: 300, radius: 22 },

  polygon: [
    [60, 60], [640, 60], [640, 150], [940, 150],
    [940, 450], [640, 450], [640, 540], [60, 540],
  ],

  walls: [],

  obstacles: [
    { shape: 'circle', x: 400, y: 300, r: 38, label: 'Findling' },
  ],

  hazards: [
    { shape: 'rect', kind: 'water', x: 640, y: 150, w: 300, h: 70, name: 'Wasser' },
    { shape: 'rect', kind: 'water', x: 640, y: 380, w: 300, h: 70, name: 'Wasser' },
    { shape: 'rect', kind: 'water', x: 640, y: 220, w: 70, h: 45, name: 'Wasser' },
    { shape: 'rect', kind: 'water', x: 640, y: 335, w: 70, h: 45, name: 'Wasser' },
  ],
};
