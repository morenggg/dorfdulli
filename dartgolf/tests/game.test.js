/**
 * Tests für Spiel-Logik: Schlagberechnung, Physik, Kollision, Zugfilter,
 * Punktezählung und Bahndaten.
 *
 * Die Tests laufen ohne DOM und ohne Canvas – sie nutzen dieselben Module,
 * die im Browser auch das echte Spiel antreiben.
 */

import { test, assert, assertEqual, assertClose } from './runner.js';

import { BOARD_SEGMENT_ORDER, SHOT_POWER, CONTROL_MODE, RULES, PHYSICS } from '../src/config.js';
import { createDartThrow, computeScore, computeNotation } from '../src/input/dart-provider.js';
import { computeShot, segmentToAngle, describeDirection } from '../src/game/shot-mapper.js';
import {
  createBall, placeBall, strikeBall, integrate, speedOf,
  angleToVector, vectorToAngle, powerForDistance, distanceForPower, blendAngles,
} from '../src/game/golf-physics.js';
import { resolveCollisions, closestPointOnSegment, rectToSegments } from '../src/game/collision-system.js';
import { buildRound, prepareCourse, validateCourse, COURSES } from '../src/game/course-manager.js';
import { TurnManager } from '../src/game/turn-manager.js';
import { TURN_PHASE } from '../src/state.js';
import {
  createMatch, addStrokes, strokesOnCurrentHole, finishHoleForCurrentPlayer,
  totalStrokes, toPar, leaderboard, describeHoleResult, formatToPar,
} from '../src/game/scoring.js';

/* ========================== DartThrow-Erzeugung ========================= */

test('createDartThrow: Triple 20 ergibt 60 Punkte und T20', () => {
  const t = createDartThrow({ segment: 20, multiplier: 3, source: 'test' });
  assertEqual(t.score, 60);
  assertEqual(t.notation, 'T20');
  assertEqual(t.source, 'test');
  assert(typeof t.id === 'string' && t.id.length > 0, 'ID fehlt');
  assert(typeof t.timestamp === 'number', 'Zeitstempel fehlt');
});

test('createDartThrow: Bull kennt kein Triple', () => {
  const t = createDartThrow({ segment: 25, multiplier: 3, source: 'test' });
  assertEqual(t.multiplier, 2);
  assertEqual(t.score, 50);
});

test('createDartThrow: ungültiges Segment wird zum Miss', () => {
  const t = createDartThrow({ segment: 42, multiplier: 2, source: 'test' });
  assertEqual(t.segment, null);
  assertEqual(t.notation, 'MISS');
  assertEqual(t.score, 0);
});

test('createDartThrow: einzelne Koordinate reicht nicht', () => {
  const t = createDartThrow({ segment: 5, multiplier: 1, x: 0.4, source: 'test' });
  assertEqual(t.x, undefined);
  assertEqual(t.y, undefined);
});

test('computeScore/computeNotation decken alle Trefferarten ab', () => {
  assertEqual(computeScore(20, 1), 20);
  assertEqual(computeScore(20, 2), 40);
  assertEqual(computeScore(25, 1), 25);
  assertEqual(computeScore(25, 2), 50);
  assertEqual(computeScore(null, 0), 0);
  assertEqual(computeNotation(19, 2), 'D19');
  assertEqual(computeNotation(null, 0), 'MISS');
});

/* ============================ Segmentwinkel ============================= */

test('Segmentwinkel: die 20 zeigt nach vorn, die Reihenfolge stimmt', () => {
  assertEqual(segmentToAngle(20), 0);
  assertEqual(segmentToAngle(1), 18);
  assertEqual(segmentToAngle(6), 90);    // rechts
  assertEqual(segmentToAngle(3), 180);   // hinten
  assertEqual(segmentToAngle(11), 270);  // links
  assertEqual(BOARD_SEGMENT_ORDER.length, 20);
});

test('Segmentwinkel: jedes Segment kommt genau einmal vor', () => {
  const unique = new Set(BOARD_SEGMENT_ORDER);
  assertEqual(unique.size, 20);
  for (let n = 1; n <= 20; n += 1) assert(unique.has(n), `Segment ${n} fehlt`);
});

test('angleToVector/vectorToAngle sind zueinander invers', () => {
  for (const angle of [0, 18, 90, 180, 270, 342]) {
    assertClose(vectorToAngle(angleToVector(angle)), angle, 0.0001);
  }
  const forward = angleToVector(0);
  assertClose(forward.x, 0, 0.0001);
  assertClose(forward.y, -1, 0.0001, 'oben ist negative Y-Richtung');
});

test('describeDirection liefert verständliche Richtungen', () => {
  assertEqual(describeDirection(0), 'vorwärts');
  assertEqual(describeDirection(90), 'rechts');
  assertEqual(describeDirection(180), 'rückwärts');
  assertEqual(describeDirection(270), 'links');
});

test('blendAngles nimmt den kürzesten Weg', () => {
  assertClose(blendAngles(350, 10, 0.5), 0, 0.0001);
  assertClose(blendAngles(10, 350, 0.5), 0, 0.0001);
});

/* =========================== Schlagberechnung =========================== */

const shotContext = {
  ballPosition: { x: 100, y: 300 },
  holePosition: { x: 500, y: 300 },   // Loch liegt genau rechts vom Ball
  controlMode: CONTROL_MODE.ADVANCED,
};

test('Schlag: Single/Double/Triple unterscheiden sich in der Stärke', () => {
  const single = computeShot(createDartThrow({ segment: 20, multiplier: 1, source: 'test' }), shotContext);
  const double = computeShot(createDartThrow({ segment: 20, multiplier: 2, source: 'test' }), shotContext);
  const triple = computeShot(createDartThrow({ segment: 20, multiplier: 3, source: 'test' }), shotContext);

  assertEqual(single.power, SHOT_POWER.single);
  assertEqual(double.power, SHOT_POWER.double);
  assertEqual(triple.power, SHOT_POWER.triple);
  assertEqual(single.angleDeg, 0, 'Segment 20 schlägt nach vorn');
});

test('Schlag: Miss erzeugt keinen Ballkontakt', () => {
  const miss = computeShot(createDartThrow({ segment: null, multiplier: 0, source: 'test' }), shotContext);
  assertEqual(miss.power, 0);
  assertEqual(miss.angleDeg, null);
  assertEqual(miss.kind, 'miss');
});

test('Schlag: Outer Bull zielt Richtung Loch', () => {
  const shot = computeShot(createDartThrow({ segment: 25, multiplier: 1, source: 'test' }), shotContext);
  assertEqual(shot.kind, 'outerBull');
  assertClose(shot.angleDeg, 90, 0.001, 'Loch liegt rechts');
  assertEqual(shot.power, SHOT_POWER.outerBull);
});

test('Schlag: Bullseye passt die Stärke an die Entfernung an', () => {
  const shot = computeShot(createDartThrow({ segment: 25, multiplier: 2, source: 'test' }), shotContext);
  assertEqual(shot.kind, 'bullseye');
  assertClose(shot.angleDeg, 90, 0.001);
  const expected = Math.min(SHOT_POWER.bullseye, powerForDistance(400) * 1.02);
  assertClose(shot.power, expected, 0.001);
});

test('Schlag: Zielhilfe wirkt nur im einfachen Modus', () => {
  const dart = createDartThrow({ segment: 20, multiplier: 2, source: 'test' });
  const advanced = computeShot(dart, shotContext);
  const simple = computeShot(dart, { ...shotContext, controlMode: CONTROL_MODE.SIMPLE });
  assertEqual(advanced.angleDeg, 0);
  assert(simple.angleDeg > 0 && simple.angleDeg < 90, 'Zielhilfe dreht Richtung Loch');
});

test('Schlag: Koordinatenmodus nur mit vorhandenen Koordinaten', () => {
  const withoutCoords = createDartThrow({ segment: 20, multiplier: 1, source: 'test' });
  const shot = computeShot(withoutCoords, { ...shotContext, useCoordinates: true });
  assertEqual(shot.mode, 'segment', 'ohne Koordinaten bleibt es bei der Segmentsteuerung');

  const withCoords = createDartThrow({ segment: 20, multiplier: 1, x: 0.5, y: 0.5, source: 'test' });
  const coordShot = computeShot(withCoords, { ...shotContext, useCoordinates: true });
  assertEqual(coordShot.mode, 'coordinates');
  assert(coordShot.angleDeg > 90, 'positives x dreht nach rechts');
});

test('Schlag: Treffer nahe am Bull ergibt im Koordinatenmodus einen Präzisionsschlag', () => {
  const dart = createDartThrow({ segment: 25, multiplier: 2, x: 0.02, y: -0.03, source: 'test' });
  const shot = computeShot(dart, { ...shotContext, useCoordinates: true });
  assertEqual(shot.kind, 'precision');
  assertClose(shot.angleDeg, 90, 0.001);
});

/* ================================ Physik =============================== */

test('Physik: distanceForPower und powerForDistance sind invers', () => {
  assertClose(powerForDistance(distanceForPower(600)), 600, 0.0001);
});

test('Physik: der Ball kommt durch Reibung zum Stehen', () => {
  const ball = createBall({ x: 0, y: 0 });
  strikeBall(ball, 90, 600);
  assert(ball.moving, 'Ball sollte sich bewegen');
  for (let i = 0; i < 2000 && ball.moving; i += 1) integrate(ball, PHYSICS.fixedStep);
  assert(!ball.moving, 'Ball muss stehen bleiben');
  assertEqual(speedOf(ball), 0);
});

test('Physik: die Rollweite entspricht der Vorhersage', () => {
  const ball = createBall({ x: 0, y: 0 });
  const power = 600;
  strikeBall(ball, 90, power); // 90° = nach rechts
  for (let i = 0; i < 5000 && ball.moving; i += 1) integrate(ball, PHYSICS.fixedStep);
  // Die Restgeschwindigkeit beim Stoppen macht eine kleine Abweichung aus.
  assertClose(ball.position.x, distanceForPower(power), 25);
});

test('Physik: ein Schlag mit Stärke 0 bewegt den Ball nicht', () => {
  const ball = createBall({ x: 10, y: 10 });
  strikeBall(ball, 0, 0);
  assert(!ball.moving);
  assertEqual(ball.position.x, 10);
});

/* ============================== Kollision ============================== */

test('Kollision: nächster Punkt auf einer Strecke wird korrekt bestimmt', () => {
  const seg = { x1: 0, y1: 0, x2: 100, y2: 0 };
  assertEqual(closestPointOnSegment({ x: 50, y: 20 }, seg).x, 50);
  assertEqual(closestPointOnSegment({ x: -30, y: 5 }, seg).x, 0, 'Anfangspunkt begrenzt');
  assertEqual(closestPointOnSegment({ x: 130, y: 5 }, seg).x, 100, 'Endpunkt begrenzt');
});

test('Kollision: rectToSegments liefert vier Kanten', () => {
  assertEqual(rectToSegments({ x: 0, y: 0, w: 10, h: 10 }).length, 4);
});

test('Kollision: der Ball prallt von der Wand ab', () => {
  const course = prepareCourse({
    id: 'test', name: 'Test', par: 3, width: 400, height: 400,
    theme: { fairway: '#000', fairwayEdge: '#000', accent: '#fff', background: '#000' },
    start: { x: 200, y: 200 }, hole: { x: 40, y: 40, radius: 22 },
    polygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
    walls: [], obstacles: [], hazards: [],
  });

  const ball = createBall({ x: 200, y: 200 });
  strikeBall(ball, 90, 800); // nach rechts gegen die Wand bei x = 400
  let bounced = false;
  for (let i = 0; i < 4000 && ball.moving; i += 1) {
    integrate(ball, PHYSICS.fixedStep);
    resolveCollisions(ball, course);
    if (ball.velocity.x < 0) bounced = true;
  }
  assert(bounced, 'Der Ball muss die Richtung umkehren');
  assert(ball.position.x < 400, 'Der Ball darf die Wand nicht verlassen');
  assert(ball.position.x > 0, 'Der Ball darf nicht durch die Wand fallen');
});

test('Kollision: ein langsamer Ball fällt ins Loch', () => {
  const course = prepareCourse({
    id: 'test', name: 'Test', par: 3, width: 400, height: 400,
    theme: { fairway: '#000', fairwayEdge: '#000', accent: '#fff', background: '#000' },
    start: { x: 60, y: 200 }, hole: { x: 300, y: 200, radius: 22 },
    polygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
    walls: [], obstacles: [], hazards: [],
  });

  const ball = createBall(course.start);
  strikeBall(ball, 90, powerForDistance(240) * 1.02);
  let holed = false;
  for (let i = 0; i < 4000 && ball.moving && !holed; i += 1) {
    integrate(ball, PHYSICS.fixedStep);
    holed = resolveCollisions(ball, course).holed;
  }
  assert(holed, 'Der Präzisionsschlag muss einlochen');
});

test('Kollision: ein zu schneller Ball rollt über das Loch hinweg', () => {
  const course = prepareCourse({
    id: 'test', name: 'Test', par: 3, width: 900, height: 400,
    theme: { fairway: '#000', fairwayEdge: '#000', accent: '#fff', background: '#000' },
    start: { x: 60, y: 200 }, hole: { x: 300, y: 200, radius: 22 },
    polygon: [[0, 0], [900, 0], [900, 400], [0, 400]],
    walls: [], obstacles: [], hazards: [],
  });

  const ball = createBall(course.start);
  strikeBall(ball, 90, 1300);
  let holed = false;
  for (let i = 0; i < 600 && !holed; i += 1) {
    integrate(ball, PHYSICS.fixedStep);
    holed = resolveCollisions(ball, course).holed;
    if (ball.position.x > 420) break;
  }
  assert(!holed, 'Bei hoher Geschwindigkeit darf der Ball nicht fallen');
});

test('Kollision: Wasser wird erkannt', () => {
  const course = prepareCourse({
    id: 'test', name: 'Test', par: 3, width: 400, height: 400,
    theme: { fairway: '#000', fairwayEdge: '#000', accent: '#fff', background: '#000' },
    start: { x: 40, y: 200 }, hole: { x: 380, y: 380, radius: 22 },
    polygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
    walls: [], obstacles: [],
    hazards: [{ shape: 'rect', kind: 'water', x: 150, y: 150, w: 100, h: 100, name: 'Wasser' }],
  });

  const ball = createBall(course.start);
  strikeBall(ball, 90, 700);
  let hazard = null;
  for (let i = 0; i < 4000 && ball.moving && !hazard; i += 1) {
    integrate(ball, PHYSICS.fixedStep);
    hazard = resolveCollisions(ball, course).hazard;
  }
  assert(hazard !== null, 'Wasser muss erkannt werden');
  assertEqual(hazard.kind, 'water');
});

/* ================================ Bahnen =============================== */

test('Bahnen: alle Layouts sind gültig', () => {
  COURSES.forEach((course) => {
    const problems = validateCourse(course);
    assertEqual(problems.length, 0, `${course.name}: ${problems.join(' | ')}`);
  });
});

test('Bahnen: es gibt drei Layouts mit den geforderten Par-Werten', () => {
  assertEqual(COURSES.length, 9);
  assertEqual(COURSES[0].par, 3);
  assertEqual(COURSES[1].par, 4);
  assertEqual(COURSES[2].par, 4);
  assert(COURSES[2].hazards.length > 0, 'Bahn 3 braucht Gefahrenzonen');
});

test('Bahnen: buildRound erzeugt die gewünschte Anzahl mit eindeutigen IDs', () => {
  RULES.holeCountOptions.forEach((count) => {
    const round = buildRound(count);
    assertEqual(round.length, count);
    const ids = new Set(round.map((c) => c.instanceId));
    assertEqual(ids.size, count, 'Instanz-IDs müssen eindeutig sein');
    round.forEach((course) => {
      assert(course.wallSegments.length >= 3, 'Wandsegmente fehlen');
    });
  });
});

/* ============================== Zugfilter ============================== */

function makeThrow(id, timestamp) {
  return createDartThrow({ segment: 20, multiplier: 1, source: 'test', id, timestamp });
}

function makeTurnManager() {
  const courses = buildRound(3);
  const match = createMatch(
    [{ name: 'A', color: '#fff' }, { name: 'B', color: '#000' }],
    courses,
    { holeCount: 3 },
  );
  return { manager: new TurnManager(match), match };
}

test('Zugfilter: ein normaler Wurf wird angenommen', () => {
  const { manager } = makeTurnManager();
  const result = manager.filterThrow(makeThrow('a', 1000), TURN_PHASE.AWAITING_THROW);
  assert(result.accepted);
});

test('Zugfilter: derselbe Wurf wird kein zweites Mal angenommen', () => {
  const { manager } = makeTurnManager();
  manager.filterThrow(makeThrow('a', 1000), TURN_PHASE.AWAITING_THROW);
  const again = manager.filterThrow(makeThrow('a', 9000), TURN_PHASE.AWAITING_THROW);
  assert(!again.accepted);
  assertEqual(again.reason, 'duplicate');
  assertEqual(manager.rejected.duplicate, 1);
});

test('Zugfilter: zu schnelle Würfe werden abgelehnt (Cooldown)', () => {
  const { manager } = makeTurnManager();
  manager.filterThrow(makeThrow('a', 1000), TURN_PHASE.AWAITING_THROW);
  const tooFast = manager.filterThrow(makeThrow('b', 1100), TURN_PHASE.AWAITING_THROW);
  assert(!tooFast.accepted);
  assertEqual(tooFast.reason, 'cooldown');

  const later = manager.filterThrow(makeThrow('c', 3000), TURN_PHASE.AWAITING_THROW);
  assert(later.accepted, 'nach dem Cooldown wieder erlaubt');
});

test('Zugfilter: während der Ballbewegung wird nicht angenommen', () => {
  const { manager } = makeTurnManager();
  const result = manager.filterThrow(makeThrow('a', 1000), TURN_PHASE.BALL_MOVING);
  assert(!result.accepted);
  assertEqual(result.reason, 'ballMoving');
});

test('Zugfilter: in der Pause wird nicht angenommen', () => {
  const { manager } = makeTurnManager();
  const result = manager.filterThrow(makeThrow('a', 1000), TURN_PHASE.PAUSED);
  assert(!result.accepted);
  assertEqual(result.reason, 'notReady');
});

test('Zugfilter: Bahnende bei Einlochen und bei Schlaggrenze', () => {
  assert(TurnManager.evaluateHoleEnd(true, 2).done);
  assertEqual(TurnManager.evaluateHoleEnd(true, 2).reason, 'holed');
  assert(!TurnManager.evaluateHoleEnd(false, 2).done);
  assert(TurnManager.evaluateHoleEnd(false, RULES.maxStrokesPerHole).done);
  assertEqual(TurnManager.evaluateHoleEnd(false, RULES.maxStrokesPerHole).reason, 'maxStrokes');
});

test('Zugfilter: Reihenfolge Spieler → Spieler → nächste Bahn → Spielende', () => {
  const courses = buildRound(3);
  const match = createMatch(
    [{ name: 'A', color: '#fff' }, { name: 'B', color: '#000' }],
    courses,
    { holeCount: 3 },
  );
  const manager = new TurnManager(match);

  assertEqual(manager.advance().type, 'nextPlayer');
  assertEqual(match.currentPlayerIndex, 1);
  assertEqual(manager.advance().type, 'nextHole');
  assertEqual(match.currentHoleIndex, 1);
  assertEqual(match.currentPlayerIndex, 0);

  manager.advance(); // Spieler B, Bahn 2
  manager.advance(); // Bahn 3
  manager.advance(); // Spieler B, Bahn 3
  assertEqual(manager.advance().type, 'gameEnd');
});

/* ============================ Punktezählung ============================ */

test('Punkte: Schläge werden je Spieler und Bahn gezählt', () => {
  const match = createMatch(
    [{ name: 'A', color: '#fff' }, { name: 'B', color: '#000' }],
    buildRound(3),
    {},
  );
  addStrokes(match, 1);
  addStrokes(match, 1);
  assertEqual(strokesOnCurrentHole(match), 2);
  assertEqual(match.players[1].strokes[0], 0, 'Der zweite Spieler bleibt unberührt');
});

test('Punkte: Strafschlag erhöht die Schlagzahl', () => {
  const match = createMatch([{ name: 'A', color: '#fff' }], buildRound(3), {});
  addStrokes(match, 1);
  addStrokes(match, RULES.hazardPenalty);
  assertEqual(strokesOnCurrentHole(match), 1 + RULES.hazardPenalty);
});

test('Punkte: ohne Einlochen wird die Schlaggrenze gewertet', () => {
  const match = createMatch([{ name: 'A', color: '#fff' }], buildRound(3), {});
  addStrokes(match, 3);
  finishHoleForCurrentPlayer(match, false);
  assertEqual(match.players[0].strokes[0], RULES.maxStrokesPerHole);
});

test('Punkte: Rangliste und Par-Differenz', () => {
  const match = createMatch(
    [{ name: 'A', color: '#fff' }, { name: 'B', color: '#000' }],
    buildRound(3),
    {},
  );
  match.players[0].strokes = [2, 4, 4];  // Par 3 + 4 + 4 = 11 -> -1
  match.players[1].strokes = [5, 5, 5];  // -> +4

  assertEqual(totalStrokes(match.players[0]), 10);
  assertEqual(toPar(match, match.players[0]), -1);
  assertEqual(toPar(match, match.players[1]), 4);

  const board = leaderboard(match);
  assertEqual(board[0].player.name, 'A');
  assertEqual(board[0].rank, 1);
  assertEqual(board[1].rank, 2);
});

test('Punkte: gleiche Schlagzahl ergibt denselben Rang', () => {
  const match = createMatch(
    [{ name: 'A', color: '#fff' }, { name: 'B', color: '#000' }],
    buildRound(3),
    {},
  );
  match.players[0].strokes = [3, 4, 4];
  match.players[1].strokes = [3, 4, 4];
  const board = leaderboard(match);
  assertEqual(board[0].rank, 1);
  assertEqual(board[1].rank, 1);
});

test('Punkte: Ergebnisbezeichnungen', () => {
  assertEqual(describeHoleResult(1, 3), 'Hole-in-One');
  assertEqual(describeHoleResult(2, 3), 'Birdie');
  assertEqual(describeHoleResult(3, 3), 'Par');
  assertEqual(describeHoleResult(4, 3), 'Bogey');
  assertEqual(formatToPar(0), 'Par');
  assertEqual(formatToPar(-2), '-2');
  assertEqual(formatToPar(3), '+3');
});

/* ====================== Vollständiger Bahndurchlauf ==================== */

test('Ablauf: eine Bahn lässt sich allein mit Segmentwürfen beenden', () => {
  // Simuliert einen kompletten Bahndurchlauf ohne Canvas:
  // Der Spieler nutzt Bullseye-Präzisionsschläge, bis der Ball fällt.
  const course = buildRound(1)[0];
  const ball = createBall(course.start);
  let strokes = 0;
  let holed = false;

  for (let shot = 0; shot < RULES.maxStrokesPerHole && !holed; shot += 1) {
    const dart = createDartThrow({ segment: 25, multiplier: 2, source: 'test' });
    const plan = computeShot(dart, {
      ballPosition: ball.position,
      holePosition: course.hole,
      controlMode: CONTROL_MODE.ADVANCED,
    });
    strikeBall(ball, plan.angleDeg, plan.power);
    strokes += 1;

    for (let i = 0; i < 6000 && ball.moving && !holed; i += 1) {
      integrate(ball, PHYSICS.fixedStep);
      const result = resolveCollisions(ball, course);
      if (result.holed) holed = true;
      if (result.hazard) placeBall(ball, ball.safePosition);
    }
  }

  assert(holed, `Die Bahn muss lösbar sein (Schläge: ${strokes})`);
  assert(strokes <= RULES.maxStrokesPerHole, 'innerhalb der Schlaggrenze');
});

test('Ablauf: jede Bahn ist mit gutem Spiel innerhalb von Par lösbar', () => {
  // Sucht je Schlag den besten aller möglichen Würfe (kürzeste Restdistanz)
  // und prüft, dass keine Bahn unspielbar ist oder eine Sackgasse enthält.
  const allThrows = [];
  BOARD_SEGMENT_ORDER.forEach((segment) => {
    [1, 2, 3].forEach((multiplier) => allThrows.push({ segment, multiplier }));
  });
  allThrows.push({ segment: 25, multiplier: 1 }, { segment: 25, multiplier: 2 });

  /** Simuliert einen Schlag bis zum Stillstand, ins Loch oder in eine Gefahr. */
  function simulate(course, from, shot) {
    const ball = createBall(from);
    strikeBall(ball, shot.angleDeg, shot.power);
    let holed = false;
    let hazard = null;
    for (let i = 0; i < 8000 && ball.moving && !holed && !hazard; i += 1) {
      integrate(ball, PHYSICS.fixedStep);
      const result = resolveCollisions(ball, course);
      if (result.holed) holed = true;
      if (result.hazard) hazard = result.hazard;
    }
    return { position: { x: ball.position.x, y: ball.position.y }, holed, hazard };
  }

  buildRound(COURSES.length).forEach((course) => {
    let position = { ...course.start };
    let strokes = 0;
    let holed = false;

    while (strokes < RULES.maxStrokesPerHole && !holed) {
      let best = null;
      for (const option of allThrows) {
        const dart = createDartThrow({ ...option, source: 'test' });
        const shot = computeShot(dart, {
          ballPosition: position,
          holePosition: course.hole,
          controlMode: CONTROL_MODE.ADVANCED,
        });
        if (shot.power <= 0) continue;
        const result = simulate(course, position, shot);
        // Gefahren werden mit einem hohen Aufschlag bewertet, damit der
        // "beste" Wurf sie meidet.
        const score = result.holed
          ? -1000
          : Math.hypot(result.position.x - course.hole.x, result.position.y - course.hole.y)
            + (result.hazard ? 500 : 0);
        if (!best || score < best.score) best = { score, result };
      }

      strokes += 1;
      if (best.result.hazard) strokes += RULES.hazardPenalty;
      else position = best.result.position;
      if (best.result.holed) holed = true;
    }

    assert(holed, `${course.name}: die Bahn muss lösbar sein`);
    assert(strokes <= course.par, `${course.name}: mit optimalem Spiel sollten höchstens ${course.par} Schläge nötig sein (gebraucht: ${strokes})`);
  });
});

test('Sand: bremst den Ball stark, kostet aber keinen Strafschlag', () => {
  const base = {
    id: 'sandtest', name: 'Sandtest', par: 3, width: 1000, height: 600,
    start: { x: 100, y: 300 }, hole: { x: 950, y: 60, radius: 22 },
    polygon: [[0, 0], [1000, 0], [1000, 600], [0, 600]],
    walls: [], obstacles: [],
  };
  function rollDistance(hazards) {
    const course = prepareCourse({ ...base, hazards });
    const ball = createBall(base.start);
    strikeBall(ball, 90, 500);
    let hazard = null;
    for (let i = 0; i < 8000 && ball.moving; i += 1) {
      integrate(ball, PHYSICS.fixedStep);
      const result = resolveCollisions(ball, course);
      if (result.hazard) hazard = result.hazard;
    }
    return { distance: ball.position.x - base.start.x, hazard };
  }
  const free = rollDistance([]);
  const sand = rollDistance([{ shape: 'rect', kind: 'sand', x: 250, y: 200, w: 200, h: 200 }]);
  assert(sand.hazard === null, 'Sand darf keine Strafzone sein');
  assert(sand.distance < free.distance * 0.6, `Sand muss deutlich bremsen (frei ${Math.round(free.distance)}, Sand ${Math.round(sand.distance)})`);
});
