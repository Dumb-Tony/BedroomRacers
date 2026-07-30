/* =============================================================================
   RACE MANAGER — countdown, laps, checkpoints, positions, finish, results.
   =============================================================================
   Lap validation is gate-based: a lap only counts when every checkpoint has
   been crossed IN ORDER and the finish line is crossed last. That closes
   reverse-driving and corner-cutting exploits for free, and gives respawn
   anchors as a side effect (05_Tracks.md).

   Crossing is detected as a segment intersection between the racer's movement
   this tick and the gate. Testing "is the car near the gate" instead would miss
   crossings at speed — at 350 units/sec a car covers ~6 units per tick and gates
   are infinitely thin.
   ========================================================================== */

window.BR = window.BR || {};

BR.RaceManager = {

  STATE: { COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished' },

  COUNTDOWN_SECONDS: 3,

  /* Beat between crossing the line and the results card, so the finish lands
     and the car is seen to coast past rather than the screen snapping. */
  FINISH_DELAY: 1.4,

  state: 'countdown',
  clock: 0,          // seconds since GO
  countdown: 3,
  finishTimer: 0,
  laps: 3,
  racers: null,      // [{ vehicle, isPlayer, name, progress... }]
  arena: null,
  finishOrder: null,

  init(arena, racers, laps) {
    this.arena = arena;
    this.racers = racers;
    this.laps = laps || 3;
    this.reset();
  },

  reset() {
    this.state = this.STATE.COUNTDOWN;
    this.countdown = this.COUNTDOWN_SECONDS;
    this.clock = 0;
    this.finishTimer = 0;
    this.finishOrder = [];

    const cps = this.arena.checkpoints.length;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      r.lap = 0;
      r.nextCp = 1 % cps;      // cp 0 is the finish; you start just after it
      r.cpsPassed = 0;
      r.lapStart = 0;
      r.lapTimes = [];
      r.bestLap = null;
      r.finished = false;
      r.finishTime = null;
      r.position = i + 1;
      r.distToNext = 0;
    }
  },

  /* Racers cannot drive during the countdown, but the sim still runs so the
     camera settles and the scene is live behind the numbers. */
  isLocked() {
    return this.state === this.STATE.COUNTDOWN;
  },

  update(dt) {
    if (this.state === this.STATE.COUNTDOWN) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = this.STATE.RACING;
        this.countdown = 0;
      }
      return;
    }

    if (this.state === this.STATE.RACING) this.clock += dt;

    for (let i = 0; i < this.racers.length; i++) {
      this.trackProgress(this.racers[i]);
    }
    this.sortPositions();

    // The race is over when every HUMAN has crossed the line — not when the
    // field has. Waiting for the AI meant coasting for another minute with no
    // results; waiting only for player one would cut player two off mid-lap in
    // split screen.
    let humansDone = true;
    for (let i = 0; i < this.racers.length; i++) {
      if (this.racers[i].isPlayer && !this.racers[i].finished) humansDone = false;
    }
    if (humansDone && this.state === this.STATE.RACING) {
      this.finishTimer += dt;
      if (this.finishTimer >= this.FINISH_DELAY) {
        this.state = this.STATE.FINISHED;
      }
    }
  },

  trackProgress(r) {
    if (r.finished) return;

    const v = r.vehicle;
    const cps = this.arena.checkpoints;
    const gate = cps[r.nextCp];

    if (this.segmentsCross(v.prevX, v.prevY, v.x, v.y,
                           gate.a[0], gate.a[1], gate.b[0], gate.b[1])) {
      r.cpsPassed++;

      if (gate.isFinish) {
        // Only a finish crossing that follows a complete checkpoint sequence
        // counts as a lap.
        r.lap++;
        const t = this.clock - r.lapStart;
        r.lapTimes.push(t);
        if (r.bestLap === null || t < r.bestLap) r.bestLap = t;
        r.lapStart = this.clock;

        if (r.lap >= this.laps) {
          r.finished = true;
          r.finishTime = this.clock;
          this.finishOrder.push(r);
          return;
        }
      }

      r.nextCp = (r.nextCp + 1) % cps.length;
    }

    const nxt = cps[r.nextCp];
    const mx = (nxt.a[0] + nxt.b[0]) / 2;
    const my = (nxt.a[1] + nxt.b[1]) / 2;
    r.distToNext = Math.hypot(mx - v.x, my - v.y);
  },

  /* Standings: finishers first in the order they finished, then by laps,
     checkpoints passed, and how close they are to the next gate. */
  sortPositions() {
    const order = this.racers.slice();
    const self = this;
    order.sort(function (a, b) {
      if (a.finished && b.finished) {
        return self.finishOrder.indexOf(a) - self.finishOrder.indexOf(b);
      }
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.cpsPassed !== b.cpsPassed) return b.cpsPassed - a.cpsPassed;
      return a.distToNext - b.distToNext;
    });
    for (let i = 0; i < order.length; i++) order[i].position = i + 1;
  },

  player() {
    for (let i = 0; i < this.racers.length; i++) {
      if (this.racers[i].isPlayer) return this.racers[i];
    }
    return this.racers[0];
  },

  standings() {
    return this.racers.slice().sort(function (a, b) {
      return a.position - b.position;
    });
  },

  /* Do two segments intersect? Orientation test, no divisions, no epsilon
     tuning to get wrong. */
  segmentsCross(p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y) {
    function cross(ax, ay, bx, by, cx, cy) {
      return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }
    const d1 = cross(q0x, q0y, q1x, q1y, p0x, p0y);
    const d2 = cross(q0x, q0y, q1x, q1y, p1x, p1y);
    const d3 = cross(p0x, p0y, p1x, p1y, q0x, q0y);
    const d4 = cross(p0x, p0y, p1x, p1y, q1x, q1y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  },

  formatTime(t) {
    if (t === null || t === undefined) return '--:--.--';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  },

  ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
};
