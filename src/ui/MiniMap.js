/* =============================================================================
   MINI-MAP — a plan view of the circuit, fixed north-up.
   =============================================================================
   FIXED, NOT ROTATING. This is the decision 11_UI.md left open, and the chase
   camera settles it.

   The world already rotates around the car. A mini-map that rotated too would
   show the same orientation as the screen and tell the player nothing they
   could not already see — and it would leave no fixed reference anywhere in the
   interface. Held north-up it does the one job the rotating view cannot: shows
   where you are in the circuit as a whole, and which way round it you are
   facing.

   Drawn in WORLD coordinates, never through Projection — this is a plan view,
   so it deliberately ignores the camera tilt entirely.

   The size slider goes to zero. 11_UI.md asks whether a mini-map earns its
   screen space at all, or whether a next-corner indicator would serve better;
   being able to switch it off is how that gets answered by playing.
   ========================================================================== */

window.BR = window.BR || {};

BR.MiniMap = {

  size: 0.82,          // 0 turns it off entirely
  fit: null,           // cached world -> map transform
  fitFor: null,        // which track the cache belongs to

  /* Fit the track's bounds into the box, preserving aspect. Cached because the
     track does not move. */
  computeFit(track, boxX, boxY, boxW, boxH) {
    const b = track.bounds;
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    const scale = Math.min(boxW / w, boxH / h) * 0.86;
    this.fit = {
      scale: scale,
      cx: boxX + boxW / 2, cy: boxY + boxH / 2,
      wx: (b.minX + b.maxX) / 2, wy: (b.minY + b.maxY) / 2,
    };
    this.fitFor = track.id;
    this.fitBox = boxX + ':' + boxY + ':' + boxW + ':' + boxH;
  },

  toMap(x, y) {
    const f = this.fit;
    return { x: f.cx + (x - f.wx) * f.scale, y: f.cy + (y - f.wy) * f.scale };
  },

  draw(ctx, game, view, w, h) {
    if (this.size <= 0.01) return;
    const track = game.arena;
    if (!track || !track.centreline) return;

    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) return;
    const RM = BR.RaceManager;
    // The results card owns the screen; a map behind it is noise.
    if (RM && RM.state === RM.STATE.FINISHED) return;

    const boxW = Math.round(Math.min(190, w * 0.24) * this.size);
    const boxH = boxW;
    const pad = 16;
    const boxX = w - boxW - pad;
    const boxY = h - boxH - pad;

    // Recomputed per viewport: in split screen the two halves have different
    // boxes, so a cache keyed only on the track would fight itself.
    this.computeFit(track, boxX, boxY, boxW, boxH);

    ctx.save();

    /* ── the housing ──────────────────────────────────────────────────────
       A moulded plastic frame with the map SUNK INTO IT, so the map belongs to
       the same set of parts as the rest of the HUD (BR.Toy, src/ui/HUD.js).

       The window stays DARK. That is a decision, not an oversight: everything
       drawn inside it — opponents in their body colours, the player's yellow
       arrowhead, the amber hazard dots — was chosen to read against a dark
       ground, and a cream paper map would have put a yellow arrow on a cream
       field. The one indicator a player needs to find instantly is the one
       that would have suffered, so the frame changes and the window does not. */
    const T = BR.Toy;
    T.plate(ctx, boxX - 7, boxY - 7, boxW + 14, boxH + 14, 11, T.SHELL);

    this.roundRect(ctx, boxX, boxY, boxW, boxH, 8);
    ctx.fillStyle = 'rgba(14,12,10,0.62)';
    ctx.fill();
    ctx.strokeStyle = T.shade(T.SHELL, -0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Recessed: the shadow lies inside the TOP edge, as it does on every other
    // window in the interface.
    ctx.beginPath();
    ctx.moveTo(boxX + 8, boxY + 1.6);
    ctx.lineTo(boxX + boxW - 8, boxY + 1.6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Clip so nothing spills out of the window.
    ctx.save();
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 8);
    ctx.clip();

    // ── the road, as one thick stroked loop ───────────────────────────────
    const line = track.centreline;
    const roadPx = Math.max(3, track.halfWidth * 2 * this.fit.scale);

    ctx.beginPath();
    for (let i = 0; i < line.length; i++) {
      const p = this.toMap(line[i][0], line[i][1]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(236,230,218,0.16)';
    ctx.lineWidth = roadPx + 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,230,218,0.42)';
    ctx.lineWidth = Math.max(1.5, roadPx - 1);
    ctx.stroke();

    // ── finish line ───────────────────────────────────────────────────────
    const f = track.checkpoints[0];
    const fa = this.toMap(f.a[0], f.a[1]);
    const fb = this.toMap(f.b[0], f.b[1]);
    // Trim to roughly road width so it reads as a line, not a spike.
    const mx = (fa.x + fb.x) / 2, my = (fa.y + fb.y) / 2;
    const dx = fb.x - fa.x, dy = fb.y - fa.y;
    const dl = Math.hypot(dx, dy) || 1;
    const halfPx = roadPx * 0.62;
    ctx.beginPath();
    ctx.moveTo(mx - (dx / dl) * halfPx, my - (dy / dl) * halfPx);
    ctx.lineTo(mx + (dx / dl) * halfPx, my + (dy / dl) * halfPx);
    ctx.strokeStyle = '#ece6da';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ── hazards ───────────────────────────────────────────────────────────
    // Shown deliberately: 13_Audio.md and 05_Tracks.md both want a hazard to be
    // readable in advance. The train is meant to be timed, not stumbled into.
    for (let i = 0; i < track.hazards.length; i++) {
      const hz = track.hazards[i];
      const p = this.toMap(hz.x, hz.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#e0913f';
      ctx.fill();
    }

    // ── opponents ─────────────────────────────────────────────────────────
    // In their own body colours, so identifying a car on the map matches
    // identifying it on the track.
    const self = view.vehicle;
    for (let i = 0; i < game.vehicles.length; i++) {
      const v = game.vehicles[i];
      if (v === self) continue;
      const p = this.toMap(v.x, v.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = v.spec.colorTop;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── the player: an arrowhead, so facing is readable ───────────────────
    // Colour alone is not enough — vehicles are named by colour, and
    // 11_UI.md requires shape as well for colourblind players.
    const me = self;
    const p = this.toMap(me.x, me.y);
    const a = me.heading;
    const r = 6.5;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    ctx.lineTo(p.x + Math.cos(a + 2.5) * r * 0.8, p.y + Math.sin(a + 2.5) * r * 0.8);
    ctx.lineTo(p.x + Math.cos(a - 2.5) * r * 0.8, p.y + Math.sin(a - 2.5) * r * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#ffd34d';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();   // clip
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
