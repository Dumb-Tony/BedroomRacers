/* =============================================================================
   CORNER HINT — what the road does next.
   =============================================================================
   11_UI.md open question 2 asked whether a mini-map earns its screen space or
   whether a next-corner indicator would serve better. Both now exist and both
   have a slider that reaches zero, so the question is answerable by driving
   rather than by arguing.

   They are not redundant. The map answers "where am I in the lap"; this answers
   "what happens in the next second". At a 17.5 degree camera you can see a long
   way ahead but the ground is compressed to 30%, so a corner reads late — this
   is the cue that buys the time back.

   Derived entirely from the racing line the AI already uses. Every waypoint
   carries a targetSpeed computed from curvature (05_Tracks.md), so severity is
   free and cannot disagree with the track — no second copy of the corner data
   to fall out of sync.

   Sits BOTTOM-CENTRE, just under the car. Corners are read while looking at the
   road, not at the corner of the screen (11_UI.md: nothing obscures the racing
   line, and the eye must not be pulled away at the moment precision matters).
   ========================================================================== */

window.BR = window.BR || {};

BR.CornerHint = {

  size: 1.0,          // 0 turns it off
  LOOKAHEAD: 1100,    // world units to scan ahead
  CORNER_AT: 0.88,    // targetSpeed below this counts as a corner

  /* targetSpeed floors at 0.62 (05_Tracks.md), so that is full severity. */
  severityOf(targetSpeed) {
    return BR.M.clamp((1 - targetSpeed) / 0.38, 0, 1);
  },

  TIERS: [
    { at: 0.34, colour: '#7fe06a', label: 'EASY' },
    { at: 0.68, colour: '#ffd34d', label: 'TIGHT' },
    { at: 1.01, colour: '#ff7a6b', label: 'HAIRPIN' },
  ],

  tierFor(sev) {
    for (let i = 0; i < this.TIERS.length; i++) {
      if (sev < this.TIERS[i].at) return this.TIERS[i];
    }
    return this.TIERS[this.TIERS.length - 1];
  },

  /**
   * Nearest waypoint to the car, searched locally from last frame's answer.
   * Falls back to a global search when that is stale — a reset or a respawn
   * moves the car further than a local window can follow.
   */
  nearestWaypoint(line, v, hint) {
    const n = line.length;
    let best = hint || 0, bd = Infinity;
    for (let k = -4; k < 20; k++) {
      const i = ((hint || 0) + k + n) % n;
      const d = Math.hypot(line[i].x - v.x, line[i].y - v.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 400) {
      bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(line[i].x - v.x, line[i].y - v.y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  },

  /**
   * The next corner ahead, or null on a straight.
   * Scans to the apex rather than stopping at the entry, so severity describes
   * the corner rather than its approach.
   */
  findCorner(line, from) {
    const n = line.length;
    let dist = 0;

    for (let k = 1; k < n; k++) {
      const i = (from + k) % n;
      const prev = line[(i - 1 + n) % n];
      dist += Math.hypot(line[i].x - prev.x, line[i].y - prev.y);
      if (dist > this.LOOKAHEAD) return null;
      if (line[i].targetSpeed >= this.CORNER_AT) continue;

      // Found the entry. Walk to the tightest point of this corner.
      let apex = i, slowest = line[i].targetSpeed;
      for (let j = 1; j < 14; j++) {
        const q = (i + j) % n;
        if (line[q].targetSpeed >= this.CORNER_AT) break;
        if (line[q].targetSpeed < slowest) { slowest = line[q].targetSpeed; apex = q; }
      }

      // Which way it bends, measured across the corner rather than at a point.
      const a = line[(i - 1 + n) % n], b = line[i];
      const c = line[apex], d = line[(apex + 2) % n];
      const inAng = Math.atan2(b.y - a.y, b.x - a.x);
      const outAng = Math.atan2(d.y - c.y, d.x - c.x);
      const turn = BR.M.wrapAngle(outAng - inAng);

      // entry and apex are returned so the direction can be checked against
      // the same stretch of road it was measured over.
      return { distance: dist, severity: this.severityOf(slowest),
               dir: turn >= 0 ? 1 : -1, turn: turn, entry: i, apex: apex };
    }
    return null;
  },

  draw(ctx, game, view, w, h) {
    if (this.size <= 0.01) return;
    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) return;
    const RM = BR.RaceManager;
    if (RM && RM.state === RM.STATE.FINISHED) return;

    const track = game.arena;
    const line = track && track.racingLine;
    if (!line || !line.length) return;

    const v = view.vehicle;
    view.wpHint = this.nearestWaypoint(line, v, view.wpHint);
    const corner = this.findCorner(line, view.wpHint);
    if (!corner) return;

    const tier = this.tierFor(corner.severity);
    // Fades in as it comes into range, so a far corner does not shout.
    const near = 1 - BR.M.clamp(corner.distance / this.LOOKAHEAD, 0, 1);
    const alpha = 0.25 + 0.75 * near;

    const s = this.size * Math.min(1, w / 900);
    const cx = w / 2;
    const cy = h - 92 * s;
    const armX = 42 * s, armY = 34 * s;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The bend itself: a curve leaving straight ahead and turning the way the
    // road does. Severity opens the angle, so a hairpin is visibly sharper.
    const bend = 0.45 + corner.severity * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy + armY);
    ctx.quadraticCurveTo(cx, cy - armY * 0.2,
                         cx + corner.dir * armX * bend, cy - armY * 0.75);
    ctx.strokeStyle = tier.colour;
    ctx.lineWidth = 7 * s;
    ctx.stroke();

    // Head, pointing along the exit.
    const hx = cx + corner.dir * armX * bend;
    const hy = cy - armY * 0.75;
    const ang = Math.atan2(-armY * 0.55, corner.dir * armX * bend * 0.9);
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(ang) * 13 * s, hy + Math.sin(ang) * 13 * s);
    ctx.lineTo(hx + Math.cos(ang + 2.5) * 12 * s, hy + Math.sin(ang + 2.5) * 12 * s);
    ctx.lineTo(hx + Math.cos(ang - 2.5) * 12 * s, hy + Math.sin(ang - 2.5) * 12 * s);
    ctx.closePath();
    ctx.fillStyle = tier.colour;
    ctx.fill();

    // Closing bar — fills as the corner arrives, so distance is a shape rather
    // than a number. World units mean nothing to a player.
    const barW = 76 * s, barH = 5 * s;
    const bx = cx - barW / 2, by = cy + armY + 12 * s;
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bx, by, barW, barH);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tier.colour;
    ctx.fillRect(bx, by, barW * near, barH);

    // Only name the worst tier. Labelling every bend is noise.
    if (corner.severity >= 0.68) {
      ctx.textAlign = 'center';
      ctx.font = '700 ' + Math.round(10 * s) + 'px ui-monospace, Consolas, monospace';
      ctx.fillStyle = tier.colour;
      ctx.fillText(tier.label, cx, by + 10 * s);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  },
};
