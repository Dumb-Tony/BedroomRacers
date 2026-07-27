/* =============================================================================
   HUD — Phase 1 readouts.
   =============================================================================
   Placeholder styling. The sticker/notebook art direction in 11_UI.md is a
   Phase 3 concern; this exists to answer Phase 1 questions.

   NOTE — the boost meter is drawn TWICE on purpose:
     - a ring around the car (vehicle-attached, in Renderer)
     - a bar in the corner (traditional)
   11_UI.md has this as an open question: a corner meter forces the eye off the
   car at exactly the moment precision matters. Both are on screen so the
   comparison can be made by driving rather than by arguing. Pick one and
   delete the other before Phase 3.
   ========================================================================== */

window.BR = window.BR || {};

BR.HUD = {

  draw(ctx, v, w, h) {
    const P = BR.PHYSICS;
    const speed = Math.hypot(v.vel.x, v.vel.y);

    ctx.save();
    ctx.font = '600 13px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';

    // ── speed ────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(ctx, 16, 16, 148, 58, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '700 30px ui-monospace, Consolas, monospace';
    ctx.fillText(String(Math.round(speed)).padStart(3, ' '), 26, 22);
    ctx.font = '600 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('units/sec', 92, 40);

    // ── boost bar (corner variant) ───────────────────────────────────────
    const bx = 16, by = 84, bw = 148, bh = 18;
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

    // Threshold tick — below this, boost won't fire.
    const tx = bx + 3 + (bw - 6) * P.boostMinToFire;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, by + 2); ctx.lineTo(tx, by + bh - 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 11px ui-monospace, Consolas, monospace';
    ctx.fillText('BOOST', bx + 4, by + bh + 5);

    // ── drift slip readout ───────────────────────────────────────────────
    const slipDeg = v.slip * 180 / Math.PI;
    const charging = v.driftQuality > 0;
    ctx.fillStyle = charging ? '#ffd34d' : 'rgba(255,255,255,0.55)';
    ctx.fillText('SLIP ' + slipDeg.toFixed(0).padStart(2, ' ') + '°', bx + 62, by + bh + 5);

    // ── callouts ─────────────────────────────────────────────────────────
    if (v.landingFlash > 0) {
      const a = Math.min(1, v.landingFlash / 0.6);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '800 34px ui-monospace, Consolas, monospace';
      ctx.fillStyle = v.lastLanding === 'clean' ? '#ffd34d' : '#ff7a6b';
      ctx.fillText(
        v.lastLanding === 'clean' ? 'PERFECT LANDING!' : 'ROUGH LANDING',
        w / 2, h * 0.24);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    ctx.restore();
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
