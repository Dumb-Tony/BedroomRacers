/* =============================================================================
   TOUCH — driving with thumbs.
   =============================================================================
   The game shipped a public link before it could be played on a phone. The
   MENUS were already touchable, because Screens uses pointer events for its hit
   regions — so on a phone you could browse the ladder, pick an event and start a
   race, and then discover there was no way to steer. `Input` listened for
   keydown, keyup and gamepads, and nothing else.

   That is the worst shape a gap can have: it looks like it works right up to the
   moment it matters. 11_UI.md has said "readable at mobile size first, if it
   works on a phone it works everywhere" since the first draft.

   ── what this is not ───────────────────────────────────────────────────────
   NOT a second control scheme. It produces the same booleans the keyboard
   produces and hands them to the same `Input.sample`, so the vehicle controller,
   the AI and every measured target time are untouched. A tilt-steering or
   swipe-gesture scheme would have been a different game to tune.

   NOT for split screen. Four thumbs on one phone is not a thing, so touch drives
   seat one only and the multiplayer seats stay on keys and pads.

   ── the layout ─────────────────────────────────────────────────────────────
   Auto-accelerate is on by default, so a thumb never has to hold the throttle:
   left thumb steers, right thumb does everything else. Buttons are sized from
   the viewport rather than fixed, because a 390-tall phone in landscape and a
   1024-tall tablet are both "touch".
   ========================================================================== */

window.BR = window.BR || {};

BR.Touch = {

  /* Shown only where it makes sense. A desktop with a touchscreen reports
     maxTouchPoints > 0 but is being played with a keyboard, so the pads stay
     hidden until an actual touch arrives — and a real key press hides them
     again, for a laptop that has both. */
  capable: false,
  active: false,

  // Live button state, ORed into Input.sample for seat one.
  state: { left: false, right: false, drift: false, boost: false, item: false },

  // pointerId -> which control it is holding down.
  held: {},

  regions: [],          // laid out every frame from the viewport
  pauseTapped: false,   // consumed once per frame, like Input.tapped

  init(canvas) {
    this.capable = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    this.canvas = canvas;
    const self = this;

    /* Pointer events, not touch events: one code path covers finger, pen and
       mouse. `pointerType` is what separates a thumb from a cursor — a mouse
       must not light the pads up on a desktop.

       These sit on the canvas alongside the menu handlers in Screens.js. They
       only claim a pointer when a race is actually being driven, so a tap on a
       menu button still reaches the menu. */
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      self.capable = true;
      if (!self.driving()) return;
      const hit = self.hit(e.clientX, e.clientY);
      if (!hit) return;
      self.active = true;
      self.held[e.pointerId] = hit;
      self.apply();
      if (hit === 'pause') self.pauseTapped = true;
      // Claim it, so the menu's click handler does not also fire.
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    /* A thumb that slides off a button must let go of it, and a thumb that
       slides ONTO one must take it — steering left to right without lifting is
       how anyone actually drives with a thumb. */
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') return;
      if (!(e.pointerId in self.held)) return;
      const hit = self.hit(e.clientX, e.clientY);
      self.held[e.pointerId] = hit || null;
      self.apply();
    }, { passive: true });

    const release = function (e) {
      if (!(e.pointerId in self.held)) return;
      delete self.held[e.pointerId];
      self.apply();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    // A finger that leaves the canvas never sends pointerup on some browsers.
    canvas.addEventListener('pointerleave', release);
    window.addEventListener('blur', function () {
      self.held = {};
      self.apply();
    });
  },

  /* Only while a race is actually being driven. Not in the menus, where the
     pads would eat taps meant for buttons, and not while paused, where the
     pause card owns the screen. */
  driving() {
    const S = BR.Screens, G = BR.Game;
    if (!S || !G) return false;
    if (S.state !== S.RACE) return false;
    if (G.paused) return false;
    return G.players === 1;
  },

  apply() {
    const s = { left: false, right: false, drift: false, boost: false, item: false };
    for (const id in this.held) {
      const k = this.held[id];
      if (k && k in s) s[k] = true;
    }
    this.state = s;
  },

  /* Laid out from the viewport every frame, so rotating a phone or resizing a
     window cannot leave the hit boxes somewhere the buttons are not. */
  /* Hit slop, as a multiple of the drawn radius. Thumbs are imprecise and a
     missed steering input is the difference between a corner and a wall — but
     the slop is also why buttons cannot simply be packed together: two boxes
     that overlap mean `hit` returns whichever was laid out first, so a thumb
     aimed at RIGHT silently gets LEFT. The spacing below is derived from this
     number rather than guessed. */
  SLOP: 1.25,

  layout(w, h) {
    // Item only exists in item races, and only once something is held — a dead
    // button teaches the wrong thing.
    const me = BR.Game.racers && BR.Game.racers[0];
    const hasItem = !!(me && me.vehicle && me.vehicle.item);
    const kRight = hasItem ? 3 : 2;

    /* Thumb-sized, but it has to FIT. The first version sized the radius from
       the screen's short edge alone, which on a 320-wide phone put the steering
       pads and the drift pad on top of each other.

       Laid out as: margin, two steering buttons, a central gap, kRight
       buttons, margin. Every span is a multiple of r, so the whole row can be
       solved for the largest r that fits. */
    const M = 0.55, GAP = 0.62, SEP = 1.2;      // all in units of r
    const unitsWide = 2 * M + (4 + GAP) + SEP + (2 * kRight + (kRight - 1) * GAP);
    const rFit = w / unitsWide;
    const rShort = Math.min(w, h) * 0.115;
    // 26 is about as small as a thumb target can usefully be; below that the
    // screen is too narrow for this game regardless.
    const r = Math.max(26, Math.min(58, Math.round(Math.min(rFit, rShort))));

    const m = Math.round(r * M);
    const gap = Math.round(r * GAP);
    // Centres, not corners. Placing the left pad's CENTRE at the margin hung a
    // 45-unit circle 20 units off the left edge.
    const by = h - m - r;

    const R = [];
    // ── left thumb: steering ────────────────────────────────────────────────
    R.push({ k: 'left',  x: m + r,                 y: by, r: r, label: '◀' });
    R.push({ k: 'right', x: m + r * 3 + gap,       y: by, r: r, label: '▶' });

    // ── right thumb: drift, boost, and item when one is held ───────────────
    R.push({ k: 'boost', x: w - m - r,             y: by, r: r, label: 'BOOST' });
    R.push({ k: 'drift', x: w - m - r * 3 - gap,   y: by, r: r, label: 'DRIFT' });
    if (hasItem) {
      R.push({ k: 'item', x: w - m - r * 5 - gap * 2, y: by, r: r, label: 'ITEM' });
    }

    // ── pause, out of the way ──────────────────────────────────────────────
    // A phone has no Escape key, so without this a race can only be left by
    // finishing it or reloading the page.
    const pr = Math.round(r * 0.62);
    R.push({ k: 'pause', x: w - m - pr, y: m + pr, r: pr, label: 'II', small: true });

    this.regions = R;
    return R;
  },

  hit(clientX, clientY) {
    // Client coordinates are CSS pixels; the canvas may be scaled.
    const rect = this.canvas.getBoundingClientRect();
    const sx = (BR.Renderer.w || rect.width) / (rect.width || 1);
    const sy = (BR.Renderer.h || rect.height) / (rect.height || 1);
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;

    for (let i = 0; i < this.regions.length; i++) {
      const R = this.regions[i];
      // A generous square rather than the drawn circle — see SLOP.
      if (Math.abs(x - R.x) <= R.r * this.SLOP &&
          Math.abs(y - R.y) <= R.r * this.SLOP) {
        return R.k;
      }
    }
    return null;
  },

  // Consumed once per frame, mirroring Input.tapped.
  tappedPause() {
    const t = this.pauseTapped;
    this.pauseTapped = false;
    return t;
  },

  draw(ctx, w, h) {
    if (!this.capable || !this.driving()) return;
    const R = this.layout(w, h);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < R.length; i++) {
      const b = R[i];
      const on = b.k === 'pause' ? false : !!this.state[b.k];

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(255,211,77,0.34)' : 'rgba(10,8,7,0.34)';
      ctx.fill();
      ctx.strokeStyle = on ? '#ffd34d' : 'rgba(255,255,255,0.30)';
      ctx.lineWidth = on ? 3 : 2;
      ctx.stroke();

      const big = b.label.length <= 2;
      ctx.font = (big ? '700 ' + Math.round(b.r * 0.9) + 'px '
                      : '700 ' + Math.round(b.r * 0.34) + 'px ') +
                 'ui-monospace, Consolas, monospace';
      ctx.fillStyle = on ? '#ffd34d' : 'rgba(255,255,255,0.72)';
      ctx.fillText(b.label, b.x, b.y + 1);
    }

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
