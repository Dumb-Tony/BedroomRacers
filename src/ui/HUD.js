/* =============================================================================
   HUD — race readouts and results.
   =============================================================================
   Placeholder styling. The sticker / notebook art direction in 11_UI.md is a
   Phase 3 concern; this exists to make the race legible.

   Ordering follows 11_UI.md: position is the most-read element, so it is the
   biggest and sits top-left. Nothing is drawn over the middle of the screen
   during racing — the racing line has to stay clear.

   The boost meter is drawn TWICE on purpose: a ring around the car and a bar
   in the corner. 11_UI.md has placement as an open question, so both are on
   screen to be compared by driving. Delete one before Phase 3.
   ========================================================================== */

window.BR = window.BR || {};

BR.HUD = {

  draw(ctx, v, w, h) {
    const RM = BR.RaceManager;
    const racing = RM && RM.racers;

    ctx.save();
    ctx.textBaseline = 'top';

    this.drawDriving(ctx, v, w, h);
    if (racing) {
      this.drawRaceState(ctx, RM, w, h);
      if (RM.state === RM.STATE.COUNTDOWN) this.drawCountdown(ctx, RM, w, h);
      if (RM.state === RM.STATE.FINISHED)  this.drawResults(ctx, RM, w, h);
    }
    this.drawCallouts(ctx, v, w, h);

    ctx.restore();
  },

  // ── speed and boost ──────────────────────────────────────────────────────
  drawDriving(ctx, v, w, h) {
    const P = BR.PHYSICS;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const y0 = h - 96;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, 16, y0, 148, 58, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '700 30px ui-monospace, Consolas, monospace';
    ctx.fillText(String(Math.round(speed)).padStart(3, ' '), 26, y0 + 6);
    ctx.font = '600 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('units/sec', 92, y0 + 24);

    const bx = 16, by = y0 + 64, bw = 148, bh = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, bx, by, bw, bh, 6);
    ctx.fill();

    const fillW = (bw - 6) * v.boostMeter;
    if (fillW > 0) {
      ctx.fillStyle = v.boosting ? '#ffd34d'
        : (v.boostMeter >= P.boostMinToFire ? '#4fd8a8' : '#4f8ef2');
      this.roundRect(ctx, bx + 3, by + 3, fillW, bh - 6, 4);
      ctx.fill();
    }

    const tx = bx + 3 + (bw - 6) * P.boostMinToFire;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, by + 2); ctx.lineTo(tx, by + bh - 2);
    ctx.stroke();
  },

  // ── position, lap, timer ─────────────────────────────────────────────────
  drawRaceState(ctx, RM, w, h) {
    const me = RM.player();

    // Position — the most-read element on screen.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, 16, 16, 132, 74, 10);
    ctx.fill();

    ctx.fillStyle = '#ffd34d';
    ctx.font = '800 40px ui-monospace, Consolas, monospace';
    ctx.fillText(String(me.position), 28, 20);
    ctx.font = '700 15px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(this.suffix(me.position), 28 + ctx.measureText(String(me.position)).width + 22, 32);

    ctx.font = '600 12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('of ' + RM.racers.length, 28, 66);

    // Lap
    const lapShown = Math.min(me.lap + 1, RM.laps);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, 156, 16, 96, 74, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px ui-monospace, Consolas, monospace';
    ctx.fillText(lapShown + '/' + RM.laps, 168, 30);
    ctx.font = '600 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('LAP', 168, 66);

    // Final lap is worth shouting about.
    if (me.lap === RM.laps - 1 && RM.state === RM.STATE.RACING) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = '800 13px ui-monospace, Consolas, monospace';
      ctx.fillText('FINAL LAP', 168, 8);
    }

    // Timer, centred.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, w / 2 - 82, 16, 164, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px ui-monospace, Consolas, monospace';
    ctx.fillText(RM.formatTime(RM.clock), w / 2, 24);
    ctx.textAlign = 'left';

    if (me.bestLap !== null) {
      ctx.textAlign = 'center';
      ctx.font = '600 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('BEST ' + RM.formatTime(me.bestLap), w / 2, 60);
      ctx.textAlign = 'left';
    }
  },

  drawCountdown(ctx, RM, w, h) {
    const n = Math.ceil(RM.countdown);
    const frac = 1 - (RM.countdown - Math.floor(RM.countdown));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.35 + 0.65 * (1 - frac);
    ctx.fillStyle = n <= 0 ? '#4fd8a8' : '#ffd34d';
    ctx.font = '800 96px ui-monospace, Consolas, monospace';
    ctx.fillText(n <= 0 ? 'GO' : String(n), w / 2, h * 0.32);
    ctx.restore();
  },

  drawResults(ctx, RM, w, h) {
    const me = RM.player();
    const list = RM.standings();
    const cardW = Math.min(460, w - 48);
    const cardH = 128 + list.length * 30;
    const x = (w - cardW) / 2, y = (h - cardH) / 2;

    ctx.fillStyle = 'rgba(10,8,7,0.78)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#191614';
    this.roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = me.position === 1 ? '#ffd34d' : '#ece6da';
    ctx.font = '800 30px ui-monospace, Consolas, monospace';
    ctx.fillText(RM.ordinal(me.position) + ' PLACE', w / 2, y + 22);

    ctx.font = '600 12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('TOTAL ' + RM.formatTime(me.finishTime) +
                 '     BEST LAP ' + RM.formatTime(me.bestLap), w / 2, y + 60);
    ctx.textAlign = 'left';

    let ry = y + 92;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const mine = r.isPlayer;
      ctx.fillStyle = mine ? 'rgba(255,211,77,0.12)' : 'transparent';
      if (mine) { this.roundRect(ctx, x + 14, ry - 5, cardW - 28, 27, 5); ctx.fill(); }

      ctx.font = (mine ? '700 ' : '600 ') + '13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = mine ? '#ffd34d' : 'rgba(255,255,255,0.75)';
      ctx.fillText(r.position + '.', x + 26, ry);
      ctx.fillText(r.name, x + 56, ry);
      ctx.textAlign = 'right';
      ctx.fillText(r.finished ? RM.formatTime(r.finishTime) : 'DNF', x + cardW - 26, ry);
      ctx.textAlign = 'left';
      ry += 30;
    }

    ctx.textAlign = 'center';
    ctx.font = '700 13px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#4fd8a8';
    ctx.fillText('PRESS  R  TO RACE AGAIN', w / 2, y + cardH - 26);
    ctx.textAlign = 'left';
  },

  drawCallouts(ctx, v, w, h) {
    if (v.landingFlash <= 0) return;
    const a = Math.min(1, v.landingFlash / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '800 30px ui-monospace, Consolas, monospace';
    ctx.fillStyle = v.lastLanding === 'clean' ? '#ffd34d' : '#ff7a6b';
    ctx.fillText(v.lastLanding === 'clean' ? 'PERFECT LANDING!' : 'ROUGH LANDING',
                 w / 2, h * 0.7);
    ctx.restore();
  },

  suffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const val = n % 100;
    return (s[(val - 20) % 10] || s[val] || s[0]).toUpperCase();
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  },
};
