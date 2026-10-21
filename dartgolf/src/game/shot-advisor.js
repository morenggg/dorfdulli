/**
 * DartGolf – Wurfempfehlungen
 *
 * Rechnet vor jedem Wurf alle Segmentwürfe (1–20, Single/Double/Triple)
 * mit der echten Physik durch und liefert die besten als Vorschlag –
 * samt Laufweg des Balls, damit die Bahn ihn als Streifen zeigen kann.
 *
 * Bull-Würfe werden bewusst nicht empfohlen: sie zielen ohnehin aufs Loch.
 */

import { BOARD_SEGMENT_ORDER, PHYSICS, CONTROL_MODE } from '../config.js';
import { createDartThrow } from '../input/dart-provider.js';
import { computeShot } from './shot-mapper.js';
import { createBall, strikeBall, integrate } from './golf-physics.js';
import { resolveCollisions } from './collision-system.js';

/** Abstand der gespeicherten Wegpunkte in Simulationsschritten. */
const PATH_EVERY = 3;

/**
 * Simuliert einen Schlag bis zum Stillstand und merkt sich den Weg.
 * @returns {{path:Array<{x:number,y:number}>, end:{x:number,y:number}, holed:boolean, hazard:boolean, bounces:number}}
 */
export function simulateShot(course, from, shot) {
  const ball = createBall(from);
  strikeBall(ball, shot.angleDeg, shot.power);
  const path = [{ x: from.x, y: from.y }];
  let holed = false;
  let hazard = false;
  let bounces = 0;
  let touching = false;
  for (let i = 0; i < 4000 && ball.moving; i += 1) {
    integrate(ball, PHYSICS.fixedStep);
    const result = resolveCollisions(ball, course);
    if (result.wallHits > 0 && !touching) bounces += 1;
    touching = result.wallHits > 0;
    if (i % PATH_EVERY === 0) path.push({ x: ball.position.x, y: ball.position.y });
    if (result.holed) { holed = true; break; }
    if (result.hazard) { hazard = true; break; }
  }
  const end = holed
    ? { x: course.hole.x, y: course.hole.y }
    : { x: ball.position.x, y: ball.position.y };
  path.push(end);
  return { path, end, holed, hazard, bounces };
}

/**
 * Liefert die besten Würfe für die aktuelle Ballposition.
 * @param {import('./course-manager.js').PreparedCourse} course
 * @param {{x:number,y:number}} ballPosition
 * @param {{controlMode?:string, count?:number}} [options]
 * @returns {Array<{notation:string, segment:number, multiplier:number,
 *   path:Array<{x:number,y:number}>, end:{x:number,y:number}, holed:boolean, distance:number}>}
 */
export function recommendThrows(course, ballPosition, options = {}) {
  const controlMode = options.controlMode || CONTROL_MODE.SIMPLE;
  const count = options.count || 3;
  const start = { x: ballPosition.x, y: ballPosition.y };
  const startDistance = Math.hypot(start.x - course.hole.x, start.y - course.hole.y);

  const candidates = [];
  for (const segment of BOARD_SEGMENT_ORDER) {
    for (const multiplier of [1, 2, 3]) {
      const dart = createDartThrow({ segment, multiplier, source: 'advisor' });
      const shot = computeShot(dart, {
        ballPosition: start,
        holePosition: course.hole,
        controlMode,
        useCoordinates: false,
      });
      if (!shot || shot.power <= 0 || shot.angleDeg === null) continue;
      const result = simulateShot(course, start, shot);
      if (result.hazard) continue;
      const distance = result.holed
        ? 0
        : Math.hypot(result.end.x - course.hole.x, result.end.y - course.hole.y);
      // Nur Würfe, die den Ball spürbar näher bringen.
      if (!result.holed && distance > startDistance - 40) continue;
      candidates.push({
        notation: dart.notation,
        segment,
        multiplier,
        path: result.path,
        end: result.end,
        holed: result.holed,
        distance,
        // Klare Wege mit wenig Bandenkontakt sind leichter nachzuvollziehen,
        // bei gleichem Ergebnis gewinnt der schwächere Wurf.
        score: distance + result.bounces * 45 + multiplier * 4,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Unterschiedliche Ziele zeigen, nicht dreimal fast denselben Weg.
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => (p.holed && c.holed)
      || Math.hypot(p.end.x - c.end.x, p.end.y - c.end.y) < 70);
    if (!tooClose) picked.push(c);
  }
  return picked;
}
