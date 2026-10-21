/**
 * DartGolf – Bahnverwaltung
 *
 * Lädt die als Daten definierten Bahnen, bereitet sie für Kollision und
 * Darstellung auf und stellt die Bahnfolge einer Runde zusammen.
 *
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} name
 * @property {number} par
 * @property {number} width
 * @property {number} height
 * @property {string} [hint]
 * @property {{fairway:string, fairwayEdge:string, accent:string, background:string}} theme
 * @property {{x:number,y:number}} start
 * @property {{x:number,y:number,radius:number}} hole
 * @property {Array<[number,number]>} polygon
 * @property {Array<{x1:number,y1:number,x2:number,y2:number}>} walls
 * @property {Array<Object>} obstacles
 * @property {Array<Object>} hazards
 *
 * @typedef {Course & {
 *   wallSegments: Array<{x1:number,y1:number,x2:number,y2:number}>,
 *   obstacleSegments: Array<{x1:number,y1:number,x2:number,y2:number}>,
 *   obstacleCircles: Array<{x:number,y:number,r:number}>,
 * }} PreparedCourse
 */

import { polygonToSegments, rectToSegments } from './collision-system.js';
import { course01 } from '../courses/course-01.js';
import { course02 } from '../courses/course-02.js';
import { course03 } from '../courses/course-03.js';
import { course04 } from '../courses/course-04.js';
import { course05 } from '../courses/course-05.js';
import { course06 } from '../courses/course-06.js';
import { course07 } from '../courses/course-07.js';
import { course08 } from '../courses/course-08.js';
import { course09 } from '../courses/course-09.js';

/** Alle verfügbaren Bahnlayouts in Spielreihenfolge. */
export const COURSES = [
  course01, course02, course03, course04, course05,
  course06, course07, course08, course09,
];

/**
 * Bereitet eine Bahn für die Simulation auf: Polygone und Rechtecke werden
 * einmalig in Strecken zerlegt, damit das pro Frame nicht erneut passiert.
 * @param {Course} course
 * @returns {PreparedCourse}
 */
export function prepareCourse(course) {
  const wallSegments = [
    ...polygonToSegments(course.polygon || []),
    ...(course.walls || []),
  ];

  const obstacleSegments = [];
  const obstacleCircles = [];

  for (const obstacle of course.obstacles || []) {
    if (obstacle.shape === 'circle') {
      obstacleCircles.push({ x: obstacle.x, y: obstacle.y, r: obstacle.r });
    } else if (obstacle.shape === 'polygon') {
      obstacleSegments.push(...polygonToSegments(obstacle.points));
    } else {
      obstacleSegments.push(...rectToSegments(obstacle));
    }
  }

  const hazards = (course.hazards || []).map((hz) => ({
    shape: hz.shape || 'rect',
    kind: hz.kind || 'water',
    name: hz.name || ({ out: 'Aus', sand: 'Bunker' }[hz.kind] || 'Wasser'),
    x: hz.x, y: hz.y, w: hz.w, h: hz.h, r: hz.r,
  }));

  return {
    ...course,
    hazards,
    wallSegments,
    obstacleSegments,
    obstacleCircles,
  };
}

/**
 * Stellt die Bahnfolge für eine Runde zusammen.
 *
 * Es gibt neun eigenständige Layouts. Bei mehr Bahnen als Layouts würden sie
 * erneut gespielt – das wird im Bahnnamen sichtbar gemacht.
 *
 * @param {number} holeCount
 * @returns {PreparedCourse[]}
 */
export function buildRound(holeCount) {
  const round = [];
  for (let i = 0; i < holeCount; i += 1) {
    const base = COURSES[i % COURSES.length];
    const lap = Math.floor(i / COURSES.length) + 1;
    const prepared = prepareCourse(base);
    round.push({
      ...prepared,
      // Eindeutige ID je Bahnposition (für Punktetabelle und Debug).
      instanceId: `${base.id}-${i + 1}`,
      holeNumber: i + 1,
      name: lap > 1 ? `${base.name} (Durchgang ${lap})` : base.name,
    });
  }
  return round;
}

/**
 * Liegt ein Punkt innerhalb eines Polygons? (Strahlensatz-Verfahren)
 * Wird für die Validierung der Bahndaten genutzt.
 * @param {{x:number,y:number}} point
 * @param {Array<[number,number]>} polygon
 * @returns {boolean}
 */
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Prüft eine Bahn auf offensichtliche Datenfehler.
 * Wird von den Tests genutzt und meldet Probleme als Liste von Texten.
 * @param {Course} course
 * @returns {string[]} leere Liste = alles in Ordnung
 */
export function validateCourse(course) {
  const problems = [];
  const required = ['id', 'name', 'par', 'width', 'height', 'start', 'hole', 'polygon'];
  for (const key of required) {
    if (course[key] === undefined) problems.push(`Feld "${key}" fehlt.`);
  }
  if (problems.length > 0) return problems;

  if (!Array.isArray(course.polygon) || course.polygon.length < 3) {
    problems.push('Die Außenkontur braucht mindestens drei Punkte.');
  }
  if (!pointInPolygon(course.start, course.polygon)) {
    problems.push('Die Startposition liegt außerhalb der Außenkontur.');
  }
  if (!pointInPolygon(course.hole, course.polygon)) {
    problems.push('Das Loch liegt außerhalb der Außenkontur.');
  }
  if (course.hole.radius < 14) {
    problems.push('Das Loch ist kleiner als der Ball plus Toleranz.');
  }
  for (const obstacle of course.obstacles || []) {
    if (obstacle.shape === 'circle') {
      if (Math.hypot(obstacle.x - course.start.x, obstacle.y - course.start.y) < obstacle.r + 20) {
        problems.push(`Hindernis "${obstacle.label || obstacle.shape}" überdeckt den Abschlag.`);
      }
    }
  }
  for (const hazard of course.hazards || []) {
    if (hazard.shape !== 'circle'
      && course.start.x >= hazard.x && course.start.x <= hazard.x + hazard.w
      && course.start.y >= hazard.y && course.start.y <= hazard.y + hazard.h) {
      problems.push('Der Abschlag liegt in einer Gefahrenzone.');
    }
  }
  return problems;
}
