/**
 * DartGolf – Darstellung der Bahn
 *
 * Zeichnet die Bahn so, dass sie wie ein echter Minigolfplatz aussieht:
 * gemähter Rasen mit Streifen, Holzbanden, Teiche, Sandbunker, Findlinge,
 * Abschlagmatte, Loch mit Fahne und ein Ball mit Schatten.
 *
 * Alles, was sich nicht bewegt, wird einmal je Bahn und Bildschirmgröße in
 * eine eigene Leinwand gezeichnet. Pro Frame kommen nur Wasser, Fahne,
 * Vorschau, Spur, Effekte und Ball dazu.
 *
 * Licht fällt von links oben, Schatten liegen also rechts unten.
 */

import { pointInPolygon } from './course-manager.js';
import { closestPointOnSegment } from './collision-system.js';
import { angleToVector, distanceForPower } from './golf-physics.js';

/** Schattenversatz in Welteinheiten (Licht von links oben). */
const SHADOW = { x: 7, y: 9 };

const PALETTE = {
  roughA: '#2c4f22',
  roughB: '#365c28',
  roughDark: '#1f3a18',
  fairwayA: '#5aa646',
  fairwayB: '#4c933b',
  collar: '#6dbb55',
  railDark: '#3a2412',
  railBase: '#86562a',
  railMid: '#a06a36',
  railTop: '#c08a4f',
  waterDeep: '#1b5a7e',
  waterShallow: '#3f8fb2',
  sand: '#e2cf9c',
  sandDark: '#c9b27b',
  sandLight: '#f1e4bd',
  flag: '#d4232c',
};

/* -------------------------------------------------------------------- *
 * Hilfen
 * -------------------------------------------------------------------- */

/** Deterministischer Zufall je Bahn – die Deko sieht jedes Mal gleich aus. */
function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygonPath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function shapePath(ctx, shape) {
  ctx.beginPath();
  if (shape.shape === 'circle') {
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
  } else if (shape.shape === 'polygon') {
    shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  } else {
    roundedRectPath(ctx, shape.x, shape.y, shape.w, shape.h, Math.min(10, shape.w / 4, shape.h / 4));
  }
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Abstand eines Punktes zum Rand eines Polygons. */
function distanceToPolygon(point, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const c = closestPointOnSegment(point, { x1, y1, x2, y2 });
    best = Math.min(best, Math.hypot(point.x - c.x, point.y - c.y));
  }
  return best;
}

/** Sichtbarer Weltausschnitt der Leinwand. */
function visibleWorld(view, width, height) {
  return {
    x0: -view.offsetX / view.scale,
    y0: -view.offsetY / view.scale,
    x1: (width - view.offsetX) / view.scale,
    y1: (height - view.offsetY) / view.scale,
  };
}

/* -------------------------------------------------------------------- *
 * Renderer
 * -------------------------------------------------------------------- */

export class CourseRenderer {
  constructor() {
    this._staticCanvas = null;
    this._staticKey = '';
  }

  /**
   * Zeichnet einen kompletten Frame.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} state Momentaufnahme der Engine
   */
  render(ctx, state) {
    const { width, height } = ctx.canvas;
    const { course, view } = state;

    const key = `${course.instanceId || course.id}|${width}x${height}|${view.scale.toFixed(4)}`;
    if (key !== this._staticKey || !this._staticCanvas) {
      this._buildStatic(course, view, width, height);
      this._staticKey = key;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._staticCanvas, 0, 0);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    const t = state.reducedMotion ? 0 : state.time;
    this._drawWaterMotion(ctx, course, t);
    this._drawEffects(ctx, state);
    this._drawTrail(ctx, state.trail);
    this._drawAimPreview(ctx, state);
    this._drawBall(ctx, state);
    this._drawFlag(ctx, course, t, state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Erzwingt einen Neuaufbau (z. B. nach Bahnwechsel). */
  invalidate() {
    this._staticKey = '';
  }

  /* ------------------------------ Statisch ----------------------------- */

  _buildStatic(course, view, width, height) {
    if (!this._staticCanvas) this._staticCanvas = document.createElement('canvas');
    const canvas = this._staticCanvas;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(course.id || 'bahn');
    const world = visibleWorld(view, width, height);

    ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    this._drawRough(ctx, world, rand);
    this._drawScenery(ctx, course, world, rand);
    this._drawCourseShadow(ctx, course);
    this._drawRails(ctx, course.polygon);
    this._drawFairway(ctx, course, rand);
    this._drawHazardsStatic(ctx, course, rand);
    this._drawCollar(ctx, course);
    this._drawTee(ctx, course);
    this._drawCup(ctx, course.hole);
    this._drawInnerWalls(ctx, course);
    this._drawObstacles(ctx, course, rand);
  }

  /** Halbhohes Gras rund um die Anlage. */
  _drawRough(ctx, w, rand) {
    const grad = ctx.createLinearGradient(w.x0, w.y0, w.x1, w.y1);
    grad.addColorStop(0, PALETTE.roughB);
    grad.addColorStop(1, PALETTE.roughA);
    ctx.fillStyle = grad;
    ctx.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);

    // Grasflecken in verschiedenen Tönen.
    const area = (w.x1 - w.x0) * (w.y1 - w.y0);
    const patches = Math.round(area / 9000);
    for (let i = 0; i < patches; i += 1) {
      const x = w.x0 + rand() * (w.x1 - w.x0);
      const y = w.y0 + rand() * (w.y1 - w.y0);
      const r = 30 + rand() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = rand() > 0.5;
      g.addColorStop(0, light ? 'rgba(80,120,50,0.22)' : 'rgba(20,45,15,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Einzelne Halme.
    const blades = Math.round(area / 55);
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    for (let i = 0; i < blades; i += 1) {
      const x = w.x0 + rand() * (w.x1 - w.x0);
      const y = w.y0 + rand() * (w.y1 - w.y0);
      const len = 3 + rand() * 5;
      const lean = (rand() - 0.5) * 3;
      const tone = rand();
      ctx.strokeStyle = tone > 0.6 ? 'rgba(110,150,70,0.45)' : tone > 0.25 ? 'rgba(30,60,22,0.5)' : 'rgba(150,170,90,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - len);
      ctx.stroke();
    }
  }

  /** Bäume und Büsche außerhalb der Bahn. */
  _drawScenery(ctx, course, w, rand) {
    const items = [];
    const tries = 260;
    for (let i = 0; i < tries; i += 1) {
      const p = { x: w.x0 + rand() * (w.x1 - w.x0), y: w.y0 + rand() * (w.y1 - w.y0) };
      const big = rand() > 0.35;
      const r = big ? 34 + rand() * 30 : 14 + rand() * 12;
      if (pointInPolygon(p, course.polygon)) continue;
      if (distanceToPolygon(p, course.polygon) < r + 26) continue;
      if (items.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < (o.r + r) * 0.85)) continue;
      items.push({ ...p, r, big });
    }
    // Von oben nach unten zeichnen, damit sich Kronen richtig überlappen.
    items.sort((a, b) => a.y - b.y);
    for (const item of items) {
      this._drawTreeShadow(ctx, item);
    }
    for (const item of items) {
      if (item.big) this._drawTree(ctx, item, rand);
      else this._drawBush(ctx, item, rand);
    }
  }

  _drawTreeShadow(ctx, { x, y, r }) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,20,6,0.38)';
    ctx.filter = 'blur(4px)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.45, r * 1.02, r * 0.92, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTree(ctx, { x, y, r }, rand) {
    const lobes = 6 + Math.floor(rand() * 4);
    const hue = rand();
    const dark = hue > 0.5 ? '#1c4316' : '#24481a';
    const mid = hue > 0.5 ? '#2f6a23' : '#3a6e25';
    const light = hue > 0.5 ? '#4f8f36' : '#5d9238';
    for (let i = 0; i < lobes; i += 1) {
      const a = (i / lobes) * Math.PI * 2 + rand() * 0.5;
      const d = r * (0.35 + rand() * 0.25);
      const lx = x + Math.cos(a) * d;
      const ly = y + Math.sin(a) * d;
      const lr = r * (0.5 + rand() * 0.2);
      const g = ctx.createRadialGradient(lx - lr * 0.35, ly - lr * 0.4, lr * 0.1, lx, ly, lr);
      g.addColorStop(0, light);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r * 0.75);
    g.addColorStop(0, light);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, 'rgba(30,70,25,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Blattstruktur.
    for (let i = 0; i < r * 1.6; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.85;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(120,170,80,0.25)' : 'rgba(10,35,8,0.25)';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5 + rand() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBush(ctx, { x, y, r }, rand) {
    const lobes = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < lobes; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = r * 0.4 * rand();
      const lx = x + Math.cos(a) * d;
      const ly = y + Math.sin(a) * d;
      const lr = r * (0.55 + rand() * 0.25);
      const g = ctx.createRadialGradient(lx - lr * 0.3, ly - lr * 0.35, lr * 0.1, lx, ly, lr);
      g.addColorStop(0, '#5e9a3c');
      g.addColorStop(1, '#2a5a1f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ab und zu ein paar Blüten.
    if (rand() > 0.55) {
      const color = ['#f2e9d0', '#e9c949', '#d8738a'][Math.floor(rand() * 3)];
      ctx.fillStyle = color;
      for (let i = 0; i < 6; i += 1) {
        const a = rand() * Math.PI * 2;
        const d = rand() * r * 0.7;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Schlagschatten der ganzen Anlage auf den Rasen. */
  _drawCourseShadow(ctx, course) {
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.fillStyle = 'rgba(5,15,4,0.5)';
    ctx.translate(SHADOW.x, SHADOW.y);
    polygonPath(ctx, course.polygon);
    ctx.lineWidth = 30;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = 'rgba(5,15,4,0.5)';
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Holzbanden außen herum – die Hälfte nach innen wird vom Rasen überdeckt. */
  _drawRails(ctx, polygon) {
    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 6;
    const layers = [
      [32, PALETTE.railDark],
      [28, PALETTE.railBase],
      [22, PALETTE.railMid],
      [13, PALETTE.railTop],
    ];
    for (const [width, color] of layers) {
      polygonPath(ctx, polygon);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    // Feine Maserung entlang der Bande.
    ctx.setLineDash([22, 9, 6, 14]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(60,35,15,0.45)';
    polygonPath(ctx, polygon);
    ctx.lineWidth = 24;
    ctx.globalAlpha = 0.12;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawFairway(ctx, course, rand) {
    ctx.save();
    polygonPath(ctx, course.polygon);
    ctx.clip();

    ctx.fillStyle = PALETTE.fairwayA;
    ctx.fillRect(0, 0, course.width, course.height);

    // Mähstreifen quer zur Spielrichtung.
    const dx = course.hole.x - course.start.x;
    const dy = course.hole.y - course.start.y;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    ctx.save();
    ctx.translate(course.width / 2, course.height / 2);
    ctx.rotate(angle);
    const span = Math.hypot(course.width, course.height);
    const stripe = 56;
    ctx.fillStyle = PALETTE.fairwayB;
    for (let x = -span; x < span; x += stripe * 2) {
      ctx.fillRect(x, -span, stripe, span * 2);
    }
    ctx.restore();

    // Feine Rasenstruktur.
    const dots = Math.round((course.width * course.height) / 70);
    for (let i = 0; i < dots; i += 1) {
      const x = rand() * course.width;
      const y = rand() * course.height;
      const tone = rand();
      ctx.fillStyle = tone > 0.5 ? 'rgba(140,200,100,0.16)' : 'rgba(30,80,20,0.16)';
      ctx.fillRect(x, y, 1.6, 1.6);
    }

    // Leichte Schattierung an den Banden.
    polygonPath(ctx, course.polygon);
    ctx.lineWidth = 34;
    ctx.strokeStyle = 'rgba(15,45,10,0.22)';
    ctx.filter = 'blur(6px)';
    ctx.stroke();
    ctx.filter = 'none';

    // Lichtverlauf von links oben.
    const light = ctx.createLinearGradient(0, 0, course.width, course.height);
    light.addColorStop(0, 'rgba(255,255,220,0.07)');
    light.addColorStop(1, 'rgba(0,20,0,0.1)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, course.width, course.height);
    ctx.restore();
  }

  _drawHazardsStatic(ctx, course, rand) {
    // Reihenfolge: Aus, Sand, Wasser – Wasser liegt optisch am tiefsten.
    const order = { out: 0, sand: 1, water: 2 };
    const hazards = [...course.hazards].sort((a, b) => order[a.kind] - order[b.kind]);
    ctx.save();
    polygonPath(ctx, course.polygon);
    ctx.clip();
    for (const hz of hazards) {
      if (hz.kind === 'water') this._drawWater(ctx, hz);
      else if (hz.kind === 'sand') this._drawSand(ctx, hz, rand);
      else this._drawOut(ctx, hz, rand);
    }
    ctx.restore();
  }

  _drawWater(ctx, hz) {
    // Uferkante: dunkler, feuchter Rand.
    ctx.save();
    shapePath(ctx, hz);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(30,60,25,0.55)';
    ctx.stroke();

    const cx = hz.shape === 'circle' ? hz.x : hz.x + hz.w / 2;
    const cy = hz.shape === 'circle' ? hz.y : hz.y + hz.h / 2;
    const r = hz.shape === 'circle' ? hz.r : Math.max(hz.w, hz.h) / 2;
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.1);
    g.addColorStop(0, PALETTE.waterDeep);
    g.addColorStop(1, PALETTE.waterShallow);
    ctx.fillStyle = g;
    shapePath(ctx, hz);
    ctx.fill();

    // Innerer Schatten der Uferkante.
    ctx.clip();
    shapePath(ctx, hz);
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(8,30,45,0.45)';
    ctx.filter = 'blur(5px)';
    ctx.translate(SHADOW.x * 0.4, SHADOW.y * 0.4);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    shapePath(ctx, hz);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(200,230,210,0.35)';
    ctx.stroke();
    ctx.restore();
  }

  _drawSand(ctx, hz, rand) {
    ctx.save();
    // Grasaufwurf um den Bunker.
    shapePath(ctx, hz);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(40,90,30,0.5)';
    ctx.stroke();

    shapePath(ctx, hz);
    ctx.fillStyle = PALETTE.sand;
    ctx.fill();
    ctx.clip();

    // Körnung.
    const bx = hz.shape === 'circle' ? hz.x - hz.r : hz.x;
    const by = hz.shape === 'circle' ? hz.y - hz.r : hz.y;
    const bw = hz.shape === 'circle' ? hz.r * 2 : hz.w;
    const bh = hz.shape === 'circle' ? hz.r * 2 : hz.h;
    const grains = Math.round((bw * bh) / 12);
    for (let i = 0; i < grains; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? PALETTE.sandDark : PALETTE.sandLight;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(bx + rand() * bw, by + rand() * bh, 1.3, 1.3);
    }
    ctx.globalAlpha = 1;

    // Geharkte Linien.
    ctx.strokeStyle = 'rgba(170,140,85,0.35)';
    ctx.lineWidth = 1.2;
    for (let y = by + 6; y < by + bh; y += 7) {
      ctx.beginPath();
      for (let x = bx; x <= bx + bw; x += 8) {
        const wy = y + Math.sin((x + y) * 0.045) * 3;
        if (x === bx) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    // Kante: oben links im Schatten, unten rechts im Licht.
    shapePath(ctx, hz);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(110,85,40,0.4)';
    ctx.filter = 'blur(4px)';
    ctx.translate(SHADOW.x * 0.6, SHADOW.y * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  _drawOut(ctx, hz, rand) {
    ctx.save();
    shapePath(ctx, hz);
    ctx.fillStyle = '#2f5626';
    ctx.fill();
    ctx.clip();
    const bx = hz.shape === 'circle' ? hz.x - hz.r : hz.x;
    const by = hz.shape === 'circle' ? hz.y - hz.r : hz.y;
    const bw = hz.shape === 'circle' ? hz.r * 2 : hz.w;
    const bh = hz.shape === 'circle' ? hz.r * 2 : hz.h;
    const blades = Math.round((bw * bh) / 14);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < blades; i += 1) {
      const x = bx + rand() * bw;
      const y = by + rand() * bh;
      const len = 5 + rand() * 7;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(130,160,80,0.55)' : 'rgba(20,45,15,0.6)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 1, y - len * 0.6, x + (rand() - 0.5) * 6, y - len);
      ctx.stroke();
    }
    ctx.restore();

    // Weiße Aus-Pfähle entlang der Grenze.
    if (hz.shape !== 'circle') {
      const stakes = [];
      for (let x = hz.x + 12; x < hz.x + hz.w; x += 44) stakes.push([x, hz.y], [x, hz.y + hz.h]);
      for (let y = hz.y + 12; y < hz.y + hz.h; y += 44) stakes.push([hz.x, y], [hz.x + hz.w, y]);
      for (const [x, y] of stakes) this._drawStake(ctx, x, y);
    }
  }

  _drawStake(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 5, 4, 3, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f2ea';
    ctx.strokeStyle = '#8c8a80';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Kurz gemähtes Grün rund ums Loch. */
  _drawCollar(ctx, course) {
    const { hole } = course;
    ctx.save();
    polygonPath(ctx, course.polygon);
    ctx.clip();
    const r = hole.radius + 64;
    const g = ctx.createRadialGradient(hole.x, hole.y, hole.radius, hole.x, hole.y, r);
    g.addColorStop(0, PALETTE.collar);
    g.addColorStop(0.7, 'rgba(109,187,85,0.55)');
    g.addColorStop(1, 'rgba(109,187,85,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Abschlagmatte mit zwei Markierungen. */
  _drawTee(ctx, course) {
    const { start, hole } = course;
    const angle = Math.atan2(hole.y - start.y, hole.x - start.x);
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    roundedRectPath(ctx, -30 + 3, -34 + 4, 60, 68, 6);
    ctx.fill();

    ctx.fillStyle = '#3e8a32';
    ctx.strokeStyle = '#2b6a24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundedRectPath(ctx, -30, -34, 60, 68, 6);
    ctx.fill();
    ctx.stroke();

    // Kunstrasen-Raster.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = -26; i < 30; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, -32);
      ctx.lineTo(i, 32);
      ctx.stroke();
    }

    for (const side of [-1, 1]) {
      const y = side * 26;
      const g = ctx.createRadialGradient(-2, y - 2, 0.5, 0, y, 6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#b8b8b8');
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(3, y + 3, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCup(ctx, hole) {
    const r = hole.radius;
    ctx.save();
    // Innenwand: oben links hell (Licht fällt hinein), unten rechts dunkel.
    const g = ctx.createRadialGradient(hole.x + r * 0.35, hole.y + r * 0.35, r * 0.2, hole.x, hole.y, r);
    g.addColorStop(0, '#050704');
    g.addColorStop(0.7, '#141a10');
    g.addColorStop(1, '#2b3424');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Weißer Lochrand (Becher).
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(245,245,235,0.9)';
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, r - 1.5, Math.PI * 0.15, Math.PI * 1.15);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180,180,170,0.55)';
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, r - 1.5, Math.PI * 1.15, Math.PI * 2.15);
    ctx.stroke();

    // Rasenkante.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(30,70,20,0.6)';
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Freistehende Holzwände (Bahn "Serpentine"). */
  _drawInnerWalls(ctx, course) {
    for (const wall of course.walls || []) {
      ctx.save();
      ctx.lineCap = 'square';
      ctx.translate(SHADOW.x * 0.7, SHADOW.y * 0.7);
      ctx.filter = 'blur(3px)';
      ctx.strokeStyle = 'rgba(5,20,4,0.45)';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.lineCap = 'square';
      for (const [width, color] of [[16, PALETTE.railDark], [12, PALETTE.railBase], [8, PALETTE.railMid], [3, PALETTE.railTop]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(wall.x1, wall.y1);
        ctx.lineTo(wall.x2, wall.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawObstacles(ctx, course, rand) {
    for (const obstacle of course.obstacles || []) {
      if (obstacle.shape === 'circle' && /poller/i.test(obstacle.label || '')) {
        this._drawBollard(ctx, obstacle);
      } else if (obstacle.shape === 'circle' || obstacle.shape === 'polygon') {
        this._drawRock(ctx, obstacle, rand);
      } else {
        this._drawTimber(ctx, obstacle, rand);
      }
    }
  }

  _drawRock(ctx, shape, rand) {
    ctx.save();
    ctx.save();
    ctx.translate(SHADOW.x, SHADOW.y);
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(5,15,4,0.5)';
    shapePath(ctx, shape);
    ctx.fill();
    ctx.restore();

    const cx = shape.shape === 'circle' ? shape.x : shape.points.reduce((s, p) => s + p[0], 0) / shape.points.length;
    const cy = shape.shape === 'circle' ? shape.y : shape.points.reduce((s, p) => s + p[1], 0) / shape.points.length;
    const r = shape.shape === 'circle' ? shape.r : 40;
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, '#c4bfb2');
    g.addColorStop(0.45, '#8e897d');
    g.addColorStop(1, '#4a463f');
    ctx.fillStyle = g;
    shapePath(ctx, shape);
    ctx.fill();
    ctx.clip();

    // Risse und Moos.
    ctx.strokeStyle = 'rgba(40,36,30,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1);
      ctx.lineTo(cx + Math.cos(a + 0.3) * r * 0.55, cy + Math.sin(a + 0.3) * r * 0.55);
      ctx.lineTo(cx + Math.cos(a - 0.1) * r, cy + Math.sin(a - 0.1) * r);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI * (0.1 + rand() * 0.8);
      const d = r * (0.6 + rand() * 0.35);
      ctx.fillStyle = 'rgba(80,110,45,0.45)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.08 + rand() * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBollard(ctx, c) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,15,4,0.45)';
    ctx.filter = 'blur(3px)';
    ctx.beginPath();
    ctx.arc(c.x + SHADOW.x, c.y + SHADOW.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.filter = 'none';

    const g = ctx.createRadialGradient(c.x - c.r * 0.35, c.y - c.r * 0.4, c.r * 0.1, c.x, c.y, c.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#a9aaa6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c62a2a';
    ctx.lineWidth = c.r * 0.28;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e9e9e4';
    ctx.beginPath();
    ctx.arc(c.x - c.r * 0.1, c.y - c.r * 0.1, c.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTimber(ctx, rect, rand) {
    ctx.save();
    ctx.save();
    ctx.translate(SHADOW.x, SHADOW.y);
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(5,15,4,0.5)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    const horizontal = rect.w >= rect.h;
    const g = horizontal
      ? ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h)
      : ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
    g.addColorStop(0, PALETTE.railTop);
    g.addColorStop(0.5, PALETTE.railMid);
    g.addColorStop(1, PALETTE.railBase);
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    // Bei großen Blöcken: einzelne Bohlen.
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    const plank = 22;
    ctx.strokeStyle = 'rgba(58,36,18,0.55)';
    ctx.lineWidth = 1.4;
    if (horizontal) {
      for (let y = rect.y + plank; y < rect.y + rect.h; y += plank) {
        ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke();
      }
    } else {
      for (let x = rect.x + plank; x < rect.x + rect.w; x += plank) {
        ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke();
      }
    }
    // Maserung.
    ctx.lineWidth = 0.7;
    const grains = Math.round((rect.w * rect.h) / 260) + 3;
    for (let i = 0; i < grains; i += 1) {
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(70,42,20,0.35)' : 'rgba(220,170,110,0.25)';
      ctx.beginPath();
      if (horizontal) {
        const y = rect.y + rand() * rect.h;
        const x = rect.x + rand() * rect.w * 0.6;
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 20, y + 1.5, x + 40, y - 1.5, x + 30 + rand() * 60, y);
      } else {
        const x = rect.x + rand() * rect.w;
        const y = rect.y + rand() * rect.h * 0.6;
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 1.5, y + 20, x - 1.5, y + 40, x, y + 30 + rand() * 60);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = PALETTE.railDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();
  }

  /* ------------------------------ Dynamisch ---------------------------- */

  /** Bewegte Lichtreflexe auf dem Wasser. */
  _drawWaterMotion(ctx, course, t) {
    for (const hz of course.hazards) {
      if (hz.kind !== 'water') continue;
      ctx.save();
      shapePath(ctx, hz);
      ctx.clip();
      const bx = hz.shape === 'circle' ? hz.x - hz.r : hz.x;
      const by = hz.shape === 'circle' ? hz.y - hz.r : hz.y;
      const bw = hz.shape === 'circle' ? hz.r * 2 : hz.w;
      const bh = hz.shape === 'circle' ? hz.r * 2 : hz.h;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let y = by + 10, row = 0; y < by + bh; y += 16, row += 1) {
        const phase = t * 0.8 + row * 1.7;
        for (let x = bx + ((row * 23) % 40) - 20; x < bx + bw; x += 46) {
          const shimmer = 0.5 + 0.5 * Math.sin(phase + x * 0.05);
          ctx.strokeStyle = `rgba(220,240,255,${0.08 + shimmer * 0.22})`;
          const ox = Math.sin(t * 0.6 + row) * 8;
          ctx.beginPath();
          ctx.moveTo(x + ox, y);
          ctx.quadraticCurveTo(x + ox + 9, y - 3, x + ox + 18, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  _drawEffects(ctx, state) {
    for (const fx of state.effects || []) {
      const age = state.time - fx.t;
      if (age < 0 || age > 1.2) continue;
      const k = age / 1.2;
      ctx.save();
      if (fx.type === 'splash') {
        for (let i = 0; i < 3; i += 1) {
          const kk = Math.max(0, k - i * 0.15);
          ctx.strokeStyle = `rgba(230,245,255,${(1 - kk) * 0.8})`;
          ctx.lineWidth = 2.5 * (1 - kk);
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 6 + kk * 46, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (fx.type === 'puff') {
        ctx.fillStyle = `rgba(240,225,180,${(1 - k) * 0.6})`;
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(a) * k * 26, fx.y + Math.sin(a) * k * 26, 3 * (1 - k) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  _drawTrail(ctx, trail) {
    if (!trail || trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      const alpha = (i / trail.length) * 0.28;
      ctx.strokeStyle = `rgba(255,255,245,${alpha})`;
      ctx.lineWidth = 2 + (i / trail.length) * 5;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAimPreview(ctx, state) {
    const shot = state.pendingShot && state.pendingShot.shot;
    if (!shot || shot.angleDeg === null || shot.power <= 0) return;
    const dir = angleToVector(shot.angleDeg);
    const length = Math.min(distanceForPower(shot.power), 520);
    const from = state.ball.position;
    const color = state.playerColor;
    const offset = state.reducedMotion ? 0 : (state.time * 60) % 18;

    ctx.save();
    // Vorschau nur innerhalb der Anlage zeigen.
    polygonPath(ctx, state.course.polygon);
    ctx.clip();
    for (let d = 22 + offset; d < length; d += 18) {
      const k = d / length;
      ctx.fillStyle = `rgba(255,255,250,${0.95 - k * 0.55})`;
      ctx.beginPath();
      ctx.arc(from.x + dir.x * d, from.y + dir.y * d, 3.2 - k * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const to = { x: from.x + dir.x * length, y: from.y + dir.y * length };
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(to.x, to.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(to.x - 7, to.y); ctx.lineTo(to.x + 7, to.y);
    ctx.moveTo(to.x, to.y - 7); ctx.lineTo(to.x, to.y + 7);
    ctx.stroke();
    ctx.restore();
  }

  _drawBall(ctx, state) {
    const { position, radius } = state.ball;
    let scale = 1;
    let fade = 1;
    if (state.holedAt !== null && state.holedAt !== undefined) {
      const k = Math.min(1, (state.time - state.holedAt) / 0.45);
      scale = 1 - k * 0.55;
      fade = 1 - k;
      if (fade <= 0) return;
    }
    const r = radius * scale;
    ctx.save();
    ctx.globalAlpha = fade;

    // Schatten.
    ctx.fillStyle = 'rgba(5,20,5,0.4)';
    ctx.beginPath();
    ctx.ellipse(position.x + 3.5, position.y + 4.5, r * 1.05, r * 0.85, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Spielerfarbe als feiner Ring.
    ctx.strokeStyle = state.playerColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = fade * 0.9;
    ctx.beginPath();
    ctx.arc(position.x, position.y, r + 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade;

    const g = ctx.createRadialGradient(position.x - r * 0.4, position.y - r * 0.45, r * 0.1, position.x, position.y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#f1f2ee');
    g.addColorStop(1, '#b9bdb6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(position.x, position.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Andeutung der Dimples.
    ctx.fillStyle = 'rgba(150,155,150,0.35)';
    for (const [dx, dy] of [[0.25, 0.1], [-0.1, 0.35], [0.4, 0.4], [0.05, -0.2], [-0.35, 0.05]]) {
      ctx.beginPath();
      ctx.arc(position.x + dx * r, position.y + dy * r, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Fahnenstange mit wehender Fahne – leicht perspektivisch. */
  _drawFlag(ctx, course, t, state) {
    const { hole } = course;
    // Nach dem Einlochen wird die Fahne halb transparent, damit der Ball
    // im Loch sichtbar bleibt.
    const alpha = state.holedAt !== null && state.holedAt !== undefined ? 0.55 : 1;
    const height = 78;
    const top = { x: hole.x, y: hole.y - height };

    ctx.save();
    ctx.globalAlpha = alpha;

    // Schatten von Stange und Fahne auf dem Rasen.
    ctx.strokeStyle = 'rgba(5,20,5,0.35)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y);
    ctx.lineTo(hole.x + 52, hole.y + 30);
    ctx.stroke();
    const sx = hole.x + 52;
    const sy = hole.y + 30;
    const sway = Math.sin(t * 4.2) * 2;
    ctx.fillStyle = 'rgba(5,20,5,0.22)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 36, sy + 6 + sway);
    ctx.lineTo(sx + 26, sy + 20 + sway);
    ctx.lineTo(sx - 9, sy + 15);
    ctx.closePath();
    ctx.fill();

    // Stange.
    const pole = ctx.createLinearGradient(hole.x - 2, 0, hole.x + 2, 0);
    pole.addColorStop(0, '#ffffff');
    pole.addColorStop(1, '#a8aaa4');
    ctx.strokeStyle = pole;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    // Wehendes Tuch.
    const w = 40;
    const h = 24;
    const steps = 10;
    const wave = (k) => Math.sin(t * 4.2 - k * 4) * 4 * k;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps;
      ctx.lineTo(top.x + k * w, top.y + wave(k) + k * 3);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const k = i / steps;
      ctx.lineTo(top.x + k * w, top.y + h + wave(k) + k * 1);
    }
    ctx.closePath();
    const cloth = ctx.createLinearGradient(top.x, top.y, top.x + w, top.y + h);
    cloth.addColorStop(0, '#e8343c');
    cloth.addColorStop(1, '#a3161d');
    ctx.fillStyle = cloth;
    ctx.fill();

    // Lochnummer auf der Fahne.
    if (course.holeNumber) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(course.holeNumber), top.x + w * 0.45, top.y + h / 2 + wave(0.45));
    }

    // Kugel oben auf der Stange.
    ctx.fillStyle = '#f1d54a';
    ctx.beginPath();
    ctx.arc(top.x, top.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
