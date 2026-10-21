/**
 * Bahn 9 – "Finale"
 *
 * Ein Bach teilt die Bahn, eine schmale Brücke führt hinüber. Danach
 * schützen Bunker und ein Aus-Bereich das Loch.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course09 = {
  id: 'finale',
  name: 'Finale',
  par: 4,
  width: 1000,
  height: 600,
  hint: 'Über die Brücke, dann vorsichtig zum Loch. Rechts oben ist Aus.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 135, y: 135 },
  hole: { x: 855, y: 455, radius: 22 },

  polygon: [
    [60, 60], [940, 60], [940, 540], [60, 540],
  ],

  walls: [],

  obstacles: [
    { shape: 'rect', x: 250, y: 330, w: 120, h: 22, label: 'Balken' },
    { shape: 'circle', x: 700, y: 400, r: 22, label: 'Poller' },
  ],

  hazards: [
    { shape: 'rect', kind: 'water', x: 450, y: 60, w: 70, h: 210, name: 'Bach' },
    { shape: 'rect', kind: 'water', x: 450, y: 340, w: 70, h: 200, name: 'Bach' },
    { shape: 'rect', kind: 'out', x: 760, y: 60, w: 180, h: 130, name: 'Aus' },
    { shape: 'circle', kind: 'sand', x: 870, y: 330, r: 44, name: 'Bunker' },
    { shape: 'circle', kind: 'sand', x: 760, y: 500, r: 36, name: 'Bunker' },
  ],
};
