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

  draw(ctx, view, game, w, h) {
    // Menus render over a live view of the track, so the race HUD must not
    // come with it.
    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) return;

    const v = view.vehicle;
    const RM = BR.RaceManager;
    const racing = RM && RM.racers;
    // Each half of a split screen belongs to its own driver.
    const me = view.racer || (RM && RM.player());

    ctx.save();
    ctx.textBaseline = 'top';

    this.drawDriving(ctx, v, w, h);
    if (racing && me) {
      this.drawRaceState(ctx, RM, me, w, h);
      if (RM.state === RM.STATE.COUNTDOWN) this.drawCountdown(ctx, RM, w, h);
      if (RM.state === RM.STATE.FINISHED)  this.drawResults(ctx, RM, me, w, h);
    }
    this.drawCallouts(ctx, v, w, h);

    // In split screen, say whose half this is and how they steer.
    if (view.label) {
      ctx.textAlign = 'center';
      ctx.font = '700 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = view.colour || '#ffd34d';
      ctx.fillText(view.label, w / 2, h - 34);
      ctx.font = '600 9px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(view.controls || '', w / 2, h - 20);
      ctx.textAlign = 'left';
    }

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
  drawRaceState(ctx, RM, me, w, h) {
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

  drawResults(ctx, RM, me, w, h) {
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
      // Highlight the driver whose half of the screen this is, not every human.
      const mine = r === me;
      ctx.fillStyle = mine ? 'rgba(255,211,77,0.12)' : 'transparent';
      if (mine) { this.roundRect(ctx, x + 14, ry - 5, cardW - 28, 27, 5); ctx.fill(); }

      ctx.font = (mine ? '700 ' : '600 ') + '13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = mine ? '#ffd34d' : 'rgba(255,255,255,0.75)';
      ctx.fillText(r.position + '.', x + 26, ry);
      ctx.fillText(r.name, x + 56, ry);
      ctx.textAlign = 'right';
      // Racers still circulating show their live position and a dash, not DNF —
      // they have not failed, the race simply ended for the player first.
      ctx.fillText(r.finished ? RM.formatTime(r.finishTime)
                              : 'lap ' + (r.lap + 1) + '/' + RM.laps,
                   x + cardW - 26, ry);
      ctx.textAlign = 'left';
      ry += 30;
    }

    // ── medal, stars and unlocks ─────────────────────────────────────────
    const res = BR.Screens && BR.Screens.lastResult;
    if (res) {
      const P = BR.ProgressionManager;
      ctx.textAlign = 'center';

      ctx.beginPath();
      ctx.arc(w / 2 - 96, y + 34, 15, 0, Math.PI * 2);
      ctx.fillStyle = P.medalColour(res.medal);
      ctx.fill();
      ctx.font = '700 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillText(res.medal === 'none' ? '' : res.medal.charAt(0).toUpperCase(),
                   w / 2 - 96, y + 29);

      if (res.starsGained > 0) {
        ctx.font = '700 13px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#ffd34d';
        ctx.fillText('★ +' + res.starsGained + ' STAR' +
                     (res.starsGained > 1 ? 'S' : ''), w / 2 + 110, y + 26);
      }
      if (res.personalBest) {
        ctx.font = '700 11px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#4fd8a8';
        ctx.fillText('NEW BEST TIME', w / 2 + 110, y + 44);
      }
      if (res.unlocked && res.unlocked.length) {
        ctx.font = '700 12px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#4fd8a8';
        ctx.fillText('UNLOCKED: ' +
          res.unlocked.map(function (id) { return BR.VEHICLES[id].name; }).join(', '),
          w / 2, y + cardH - 62);
      }
      ctx.textAlign = 'left';
    }

    // Buttons register hit regions with Screens, which owns click routing.
    const S = BR.Screens;
    if (S) {
      const bw = 150, gap = 12;
      const bx = w / 2 - bw - gap / 2;
      const by2 = y + cardH - 44;
      S.button(ctx, bx, by2, bw, 34, 'RACE AGAIN  (R)', 'retry', null, { primary: true });
      S.button(ctx, w / 2 + gap / 2, by2, bw, 34, 'EVENTS  (ESC)', 'quit', null);
    }
  },

  drawCallouts(ctx, v, w, h) {
    const S = BR.Screens;

    // Toy piece pickup. Drawn here rather than in Screens because Screens does
    // not render during a race.
    if (S && S.pieceToastTime > 0) {
      const t = S.pieceToast;
      ctx.save();
      ctx.globalAlpha = Math.min(1, S.pieceToastTime);
      ctx.textAlign = 'center';
      ctx.font = '800 22px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('TOY PIECE FOUND', w / 2, h * 0.30);
      ctx.font = '700 13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(t.found + ' of ' + t.total, w / 2, h * 0.30 + 30);
      if (t.setComplete) {
        ctx.font = '800 15px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#4fd8a8';
        ctx.fillText('SET COMPLETE — HEIRLOOM UNLOCKED', w / 2, h * 0.30 + 56);
      }
      ctx.restore();
      ctx.textAlign = 'left';
    }

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
