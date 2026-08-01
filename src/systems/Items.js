/* =============================================================================
   ITEMS — and the decision about where they are allowed to exist.
   =============================================================================
   10_Items.md left four open questions. All four are answered here, and the
   fourth is the one that mattered:

   ── Q4: should items exist in Standard Race at all? NO. ─────────────────────
   They get their own mode. The bible said "it is a legitimate design position
   that this game does not need items in its main mode", and by the time there
   were sixteen events the evidence had arrived:

     * SIX of them are Time Trials. A mode built on comparing your line against
       your own ghost is worth protecting, and so is the standard race it is
       measured against.
     * The flagship already has four sources of variance that reward DRIVING —
       drift-charged boost, shortcuts, worn sand, and speed-gated loops. It is
       not short of things to do with a corner.
     * Local multiplayer is the one place a flat skill gap makes racing dull,
       and that is exactly what an item mode is for.

   So Standard Race stays pure and item races are opt-in per event
   (`items: true`). That also answers Q3: yes, per-mode, in event data.

   ── Q1: position weighting vs the AI assistance model ──────────────────────
   NEVER BOTH — the bible's own warning about stacking two comeback systems.
   In an item race the AI's invisible catch-up is switched OFF (main.js) and
   position-weighted items are the whole comeback mechanism. That is the trade
   the bible was leaning toward: an item-based comeback is visible and
   understandable; speed rubber-banding is invisible and feels like a lie the
   moment it is noticed.

   ── Q2: do AI drivers use items? ───────────────────────────────────────────
   Yes, scaled by personality — see `itemSkill` in AIDriver.

   ── THE DESIGN STANCE IS A HARD CONSTRAINT ─────────────────────────────────
   Nothing here removes control for longer than the collision cap in
   03_Driving_Physics.md (0.4-0.8s), nothing is invisible, and nothing is both
   instant and unavoidable. Those are checked, not hoped for.
   ========================================================================== */

window.BR = window.BR || {};

BR.Items = {

  /* One slot, no stacking (10_Items.md). Simple to read, and it stops
     defensive item-holding from dominating. */

  DEFS: {
    boostBattery: {
      name: 'Boost Battery', colour: '#ffd34d', offensive: false,
      use(v) { v.boostMeter = Math.min(1, v.boostMeter + 0.6); },
    },
    windUpKey: {
      name: 'Wind-Up Key', colour: '#4fd8a8', offensive: false,
      /* Acceleration, not top speed — distinct from boost on purpose, so it is
         worth having out of a corner rather than down a straight. */
      use(v) { v.windUp = 3.2; },
    },
    shieldBubble: {
      name: 'Shield Bubble', colour: '#69d0ff', offensive: false,
      use(v) { v.shield = 7.0; },
    },
    toyHammer: {
      name: 'Toy Hammer', colour: '#ff9d6b', offensive: true, range: 210,
      use(v, game) {
        // Close range, no aim. You have to get near someone, which is the
        // thing that makes it fair.
        let hits = 0;
        for (let i = 0; i < game.vehicles.length; i++) {
          const o = game.vehicles[i];
          if (o === v || o.isGhost) continue;
          const dx = o.x - v.x, dy = o.y - v.y;
          const d = Math.hypot(dx, dy);
          if (d > this.range || d < 1e-3) continue;
          if (BR.Items.blocked(o)) continue;
          o.vel.x += (dx / d) * 260;
          o.vel.y += (dy / d) * 260;
          BR.Items.stun(o, 0.45);
          hits++;
        }
        return hits;
      },
    },
    stickyBlob: {
      name: 'Sticky Blob', colour: '#c88be0', offensive: true,
      use(v, game) {
        // Dropped BEHIND, and drawn on the surface, so it can be seen and
        // driven around.
        game.spawnDrop('blob', v.x - Math.cos(v.heading) * 70,
                               v.y - Math.sin(v.heading) * 70, v);
      },
    },
    paperAeroplane: {
      name: 'Paper Aeroplane', colour: '#ece6da', offensive: true,
      use(v, game) {
        /* The only projectile, and it has to be FASTER than a car or it can
           never connect. At 330 against a field doing ~350 it was fired from
           behind and simply fell away: a full item race produced exactly zero
           hits. 520 closes on a car ahead at about 170/sec, which is a couple
           of seconds of warning — dodgeable, which is the point, rather than
           unusable, which is not. The stance said "slow enough to dodge" and
           never said an item had to be able to land. It should have. */
        game.spawnDrop('plane', v.x + Math.cos(v.heading) * 60,
                                v.y + Math.sin(v.heading) * 60, v,
                       { heading: v.heading, speed: 520, life: 3.2 });
      },
    },
  },

  /* Position-weighted. The leader gets the plain ones, the tail gets the
     interesting ones. Mild on purpose — 04_AI.md's ceiling on assistance was
     "it compresses the field, it does not decide the race", and handing items
     the comeback job does not change what a comeback is allowed to be. */
  TABLE: [
    // id                 leader  midfield  last
    { id: 'boostBattery',   front: 5, mid: 4, back: 2 },
    { id: 'windUpKey',      front: 4, mid: 4, back: 3 },
    { id: 'shieldBubble',   front: 3, mid: 3, back: 3 },
    { id: 'stickyBlob',     front: 3, mid: 3, back: 3 },
    { id: 'toyHammer',      front: 1, mid: 3, back: 4 },
    { id: 'paperAeroplane', front: 1, mid: 3, back: 5 },
  ],

  /**
   * @param {number} pos    running position, 1-based
   * @param {number} field  how many are racing
   */
  roll(pos, field) {
    const f = field > 1 ? (pos - 1) / (field - 1) : 0;   // 0 leader, 1 last
    const band = f < 0.34 ? 'front' : (f < 0.67 ? 'mid' : 'back');

    let total = 0;
    for (let i = 0; i < this.TABLE.length; i++) total += this.TABLE[i][band];
    let r = Math.random() * total;
    for (let i = 0; i < this.TABLE.length; i++) {
      r -= this.TABLE[i][band];
      if (r <= 0) return this.TABLE[i].id;
    }
    return 'boostBattery';
  },

  /** A shield eats one hit and is spent. True if the hit was absorbed. */
  blocked(v) {
    if (!v.shield || v.shield <= 0) return false;
    v.shield = 0;
    v.shieldPopped = 0.5;
    return true;
  },

  /* THE CAP. 03_Driving_Physics.md puts the ceiling on lost control at 0.8s and
     nothing in this file is allowed past it — an item that takes the wheel away
     for longer than a bad crash is not playful, it is a punishment. */
  MAX_STUN: 0.8,

  stun(v, seconds) {
    const t = Math.min(seconds, this.MAX_STUN);
    if (t > v.stunTime) v.stunTime = t;
  },

  /** Per-step decay of everything an item switched on. */
  tick(v, dt) {
    if (v.windUp > 0) v.windUp -= dt;
    if (v.shield > 0) v.shield -= dt;
    if (v.stunTime > 0) v.stunTime -= dt;
    if (v.shieldPopped > 0) v.shieldPopped -= dt;
  },

  /** Fire the held item, if there is one. */
  fire(v, game) {
    if (!v.item) return false;
    const def = this.DEFS[v.item];
    v.item = null;
    if (!def) return false;
    def.use(v, game);
    return true;
  },
};
