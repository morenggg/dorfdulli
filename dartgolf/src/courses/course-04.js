/**
 * Bahn 4 – "Knick"
 *
 * Ein Dogleg nach links oben: Die direkte Linie verläuft über die Ecke
 * hinaus. Wer zu lang spielt, landet im Bunker hinten rechts.
 */

/** @type {import('../game/course-manager.js').Course} */
export const course04 = {
  id: 'knick',
  name: 'Knick',
  par: 3,
  width: 1000,
  height: 600,
  hint: 'Erst geradeaus, dann um die Ecke. Zu lang endet im Sand.',

  theme: {
    fairway: '#1d5a2c',
    fairwayEdge: '#2a7038',
    accent: '#e8d9a8',
    background: '#0c1a0f',
  },

  start: { x: 150, y: 455 },
  hole: { x: 790, y: 160, radius: 22 },

  polygon: [
    [60, 370], [590, 370], [590, 60], [940, 60],
    [940, 540], [60, 540],
  ],

  walls: [],

  obstacles: [
    { shape: 'circle', x: 760, y: 420, r: 26, label: 'Findling' },
  ],

  hazards: [
    { shape: 'rect', kind: 'sand', x: 830, y: 400, w: 110, h: 140, name: 'Bunker' },
    { shape: 'circle', kind: 'sand', x: 700, y: 85, r: 42, name: 'Bunker' },
  ],
};
