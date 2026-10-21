/**
 * DartGolf – Kollisionssystem
 *
 * Alle Bahn-Geometrien werden auf zwei Grundformen zurückgeführt:
 *  - Strecken (Banden, Rechteckkanten, Polygonkanten)
 *  - Kreise (runde Hindernisse)
 *
 * Die Kollisionsauflösung ist bewusst richtungsunabhängig: Es wird immer der
 * nächstgelegene Punkt der Form zum Ballmittelpunkt gesucht. Dadurch prallt
 * der Ball von einer Außenwand (von innen) genauso korrekt ab wie von einem
 * Hindernis (von außen) – und Ecken funktionieren ohne Sonderfall.
 */

import { PHYSICS } from '../config.js';
import { vec, reflect } from './golf-physics.js';

/**
 * @typedef {{x1:number,y1:number,x2:number,y2:number}} Segment
 */

/**
 * Wandelt ein Rechteck in vier Kanten um.
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {Segment[]}
 */
export function rectToSegments(rect) {
  const { x, y, w, h } = rect;
  return [
    { x1: x, y1: y, x2: x + w, y2: y },
    { x1: x + w, y1: y, x2: x + w, y2: y + h },
    { x1: x + w, y1: y + h, x2: x, y2: y + h },
    { x1: x, y1: y + h, x2: x, y2: y },
  ];
}

/**
 * Wandelt einen geschlossenen Polygonzug in Kanten um.
 * @param {Array<[number, number]>} points
 * @returns {Segment[]}
 */
export function polygonToSegments(points) {
  const segments = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    segments.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
  }
  return segments;
}

/**
 * Nächstgelegener Punkt einer Strecke zu einem Punkt.
 * @param {{x:number,y:number}} p
 * @param {Segment} seg
 * @returns {{x:number,y:number}}
 */
export function closestPointOnSegment(p, seg) {
  const ax = seg.x1;
  const ay = seg.y1;
  const bx = seg.x2 - ax;
  const by = seg.y2 - ay;
  const lengthSq = bx * bx + by * by;
  if (lengthSq < 1e-9) return { x: ax, y: ay };
  let t = ((p.x - ax) * bx + (p.y - ay) * by) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + bx * t, y: ay + by * t };
}

/**
 * Liegt ein Punkt innerhalb eines Rechtecks?
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number,w:number,h:number}} rect
 */
export function pointInRect(p, rect) {
  return p.x >= rect.x && p.x <= rect.x + rect.w
    && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/**
 * Liegt ein Punkt innerhalb eines Kreises?
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number,r:number}} circle
 */
export function pointInCircle(p, circle) {
  return Math.hypot(p.x - circle.x, p.y - circle.y) <= circle.r;
}

/**
 * Löst die Kollision des Balls mit einer Strecke auf.
 * @param {{position:{x:number,y:number}, velocity:{x:number,y:number}, radius:number}} ball
 * @param {Segment} seg
 * @param {number} restitution
 * @returns {boolean} true, wenn eine Kollision stattfand
 */
export function collideWithSegment(ball, seg, restitution) {
  const closest = closestPointOnSegment(ball.position, seg);
  const away = vec.sub(ball.position, closest);
  const distance = vec.length(away);

  if (distance > ball.radius) return false;

  // Normale zeigt von der Kante zum Ball. Liegt der Ballmittelpunkt exakt auf
  // der Kante, wird die Bewegungsrichtung als Ausweichrichtung genutzt.
  let normal = distance > 1e-6
    ? vec.scale(away, 1 / distance)
    : vec.normalize(vec.scale(ball.velocity, -1));
  if (normal.x === 0 && normal.y === 0) normal = { x: 0, y: -1 };

  // Ball aus der Wand herausschieben, damit er nicht "klebt".
  const overlap = ball.radius - distance;
  ball.position.x += normal.x * (overlap + 0.01);
  ball.position.y += normal.y * (overlap + 0.01);

  // Nur reflektieren, wenn sich der Ball auf die Kante zubewegt.
  if (vec.dot(ball.velocity, normal) < 0) {
    const bounced = reflect(ball.velocity, normal, restitution);
    ball.velocity.x = bounced.x;
    ball.velocity.y = bounced.y;
  }
  return true;
}

/**
 * Löst die Kollision des Balls mit einem runden Hindernis auf.
 * @param {{position:{x:number,y:number}, velocity:{x:number,y:number}, radius:number}} ball
 * @param {{x:number,y:number,r:number}} circle
 * @param {number} restitution
 * @returns {boolean}
 */
export function collideWithCircle(ball, circle, restitution) {
  const away = vec.sub(ball.position, { x: circle.x, y: circle.y });
  const distance = vec.length(away);
  const minDistance = ball.radius + circle.r;
  if (distance > minDistance) return false;

  let normal = distance > 1e-6 ? vec.scale(away, 1 / distance) : { x: 0, y: -1 };
  const overlap = minDistance - distance;
  ball.position.x += normal.x * (overlap + 0.01);
  ball.position.y += normal.y * (overlap + 0.01);

  if (vec.dot(ball.velocity, normal) < 0) {
    const bounced = reflect(ball.velocity, normal, restitution);
    ball.velocity.x = bounced.x;
    ball.velocity.y = bounced.y;
  }
  return true;
}

/**
 * Führt alle Kollisionsprüfungen einer Bahn für einen Simulationsschritt aus.
 *
 * @param {ReturnType<import('./golf-physics.js').createBall>} ball
 * @param {import('./course-manager.js').PreparedCourse} course
 * @returns {{wallHits:number, hazard:null|{kind:string,name?:string}, holed:boolean, inSand:boolean}}
 */
export function resolveCollisions(ball, course) {
  let wallHits = 0;

  // Wände und Rechteck-/Polygon-Hindernisse.
  for (const seg of course.wallSegments) {
    if (collideWithSegment(ball, seg, PHYSICS.wallRestitution)) wallHits += 1;
  }
  for (const seg of course.obstacleSegments) {
    if (collideWithSegment(ball, seg, PHYSICS.obstacleRestitution)) wallHits += 1;
  }
  for (const circle of course.obstacleCircles) {
    if (collideWithCircle(ball, circle, PHYSICS.obstacleRestitution)) wallHits += 1;
  }

  // Gefahrenzonen (Wasser / Aus).
  // Sand ist keine Strafzone, bremst den Ball aber deutlich stärker ab.
  let hazard = null;
  let inSand = false;
  for (const hz of course.hazards) {
    const hit = hz.shape === 'circle'
      ? pointInCircle(ball.position, { x: hz.x, y: hz.y, r: hz.r })
      : pointInRect(ball.position, hz);
    if (!hit) continue;
    if (hz.kind === 'sand') {
      inSand = true;
      continue;
    }
    if (!hazard) hazard = { kind: hz.kind, name: hz.name };
  }
  if (inSand && ball.moving) {
    const sandDamping = (1 - PHYSICS.sandFriction) ** PHYSICS.fixedStep;
    ball.velocity.x *= sandDamping;
    ball.velocity.y *= sandDamping;
  }

  // Loch: der Ball muss langsam genug sein, sonst rollt er darüber hinweg.
  let holed = false;
  const holeDistance = Math.hypot(
    ball.position.x - course.hole.x,
    ball.position.y - course.hole.y,
  );
  if (holeDistance < course.hole.radius * PHYSICS.holeCaptureFactor) {
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed < PHYSICS.holeCaptureSpeed) {
      holed = true;
    } else {
      // Zu schnell: der Ball wird am Lochrand leicht abgelenkt statt gefangen.
      const outward = vec.normalize(vec.sub(ball.position, course.hole));
      ball.velocity.x = ball.velocity.x * 0.94 + outward.x * 18;
      ball.velocity.y = ball.velocity.y * 0.94 + outward.y * 18;
    }
  }

  return { wallHits, hazard, holed, inSand };
}
