/* =============================================================================
   COACH — the first race, with somebody sitting next to you.
   =============================================================================
   A first-time player used to press RACE and be dropped onto the rug knowing
   nothing. The game has drifting, a drift charge, a boost meter with a
   threshold, surfaces that behave differently, hidden toy pieces, three stars
   an event and a star gate across 26 of them — and the only thing it had ever
   said out loud was a strip of tape with the key bindings on it, which fades
   out 2.2 seconds after the lights go green.

   ── WHY THIS IS NOT A SCREEN OF TEXT ──────────────────────────────────────
   11_UI.md has said since its first draft that teaching here is diegetic and
   that TRACK 1 IS THE TUTORIAL. So this is not a tutorial mode, a sandbox, or
   a wall of instructions in front of the RACE button. It is the real Rookie
   Shakedown — the real event, the real opponents, the real stars — with a
   printed leaflet that turns a page as each thing becomes relevant.

   The rule that constrains every line below is also 11_UI.md's, and it is
   older than this file:

       A PLAYER WHO IGNORES EVERY PROMPT MUST STILL BE ABLE TO FINISH THE RACE.

   Nothing here gates anything. Nothing pauses the race, nothing waits for a
   correct input, nothing is drawn where the car is about to be. Every lesson
   carries a PATIENCE: if the player has not done the thing by then, the coach
   moves on without mentioning it. A tutorial that nags is worse than no
   tutorial, because it teaches that the game will not shut up.

   ── THE CORNER PROMPT COMES FROM THE TRACK, NOT FROM A TIMER ──────────────
   "Drift here" on a stopwatch would be wrong on the first corner the player
   arrives at early or late, and would be a second copy of the track's corner
   data — the exact failure CornerHint.js exists to avoid. So the drift lesson
   asks CornerHint.findCorner() for the next real bend on the racing line the
   AI already drives, and appears when one is genuinely coming. Move the
   waypoints and the prompt moves with them.

   ── IT DOES NOT TOUCH THE SIMULATION ──────────────────────────────────────
   update() reads the vehicle and the race manager and writes nothing but its
   own state. No physics, no AI, no difficulty, no target time. All 26 events
   still calibrate at 0.00 with this file loaded, which is the only claim that
   matters about a file that sits this close to a race.
   ========================================================================== */

window.BR = window.BR || {};

BR.Coach = {

  /* ── the flag, and why it lives in SETTINGS ───────────────────────────────
     `settings.taught`, not `progression` and not `state`.

     SaveManager draws one line down the middle of a save and draws it twice:
     reset() keeps settings and drops progress, and importCode() keeps THIS
     DEVICE's settings and takes the code's progress. Both say the same thing —
     progress belongs to the player, settings belong to the seat.

     Having been shown how to drive belongs to the seat. A player who wipes
     their stars to start the ladder again is not a person who has forgotten
     what the drift button is, and somebody who pastes a save code into a new
     browser has certainly played before. Both of those would be handed the
     first-run flow again if this lived with progress, which is precisely the
     "never appear again once done" the whole feature is for.

     And because it is a setting rather than a trophy, undoing it is allowed:
     SHOW THE LESSONS AGAIN sits in Settings, next to the other things about
     how this seat is set up. */
  taught() {
    const s = BR.SaveManager.get().settings;
    return !!s.taught;
  },

  markTaught() {
    BR.SaveManager.get().settings.taught = true;
    BR.SaveManager.save();
  },

  /* ── live state ───────────────────────────────────────────────────────────
     `cur` is the lesson being shown, or -1 between them. NOT a queue cursor —
     see the scan in update() and the note above it. */
  active: false,
  cur: -1,
  seen: {},        // id -> it has had its turn, whether or not it was answered
  count: 0,
  stepNo: 1,       // the leaflet's step number, for the "3 / 6" in the corner
  showT: -1,       // seconds the current lesson has been on screen, -1 = none
  doneT: -1,       // seconds since it was satisfied, -1 = not yet
  gapT: 0,         // breathing room between two cards
  wpHint: 0,       // last nearest-waypoint answer, for the corner lookahead
  offRoadT: 0,     // how long the car has been off the road, for the surface beat

  ACK: 1.5,        // how long GOT IT stays up before the page turns
  GAP: 0.7,        // blank pause between cards
  FADE: 0.28,

  /* 11_UI.md: TRACK 1 IS THE TUTORIAL. Said once, here, rather than at each of
     the two buttons that start it — the welcome card and SHOW THE LESSONS
     AGAIN in Settings must never be able to disagree about which event teaches,
     and the lessons below are written about this rug. */
  EVENT_ID: 'rug-route-01',

  /** Start the guided event. The only way in, from either button. */
  begin() {
    this.active = true;
    this.cur = -1; this.seen = {}; this.count = 0; this.stepNo = 1;
    this.showT = -1; this.doneT = -1; this.gapT = 0;
    this.offRoadT = 0; this.wpHint = 0;
    this.markTaught();
    /* One seat. Two people on a sofa do not need to be told what the drift
       button is one card at a time, and an exhibition race awards none of the
       stars the last lesson is about. */
    if (BR.Game) BR.Game.players = 1;
    const ev = BR.eventById(this.EVENT_ID);
    if (ev && BR.Game) BR.Game.startEvent(ev);
  },

  /* Player asked for it to stop, from the card or from the pause menu.

     NO TOAST. Screens.say puts a message on the menu layer, and Screens.draw
     returns before drawing it while a race is being driven — so the note would
     sit unrendered and then appear, stale, on whatever screen the player
     reached next. The card vanishing is the feedback; the sound is the
     acknowledgement. */
  skip() {
    this.active = false;
    this.markTaught();
    BR.Audio.checkpoint();
  },

  finish() { this.active = false; },

  /* ── the verbs, in three vocabularies ─────────────────────────────────────
     A tutorial that only knows the keyboard is wrong on a phone, and telling a
     phone to press SHIFT is worse than saying nothing at all — the same
     conclusion HUD.drawSoloControls reached about the tape strip.

     These deliberately do NOT come from Input.LABELS. That is one flat line
     built for a strip of tape ("← →  or  A D   ·   SPACE drift   ·   SHIFT
     boost"), and what a sentence needs is the single word, declined into the
     sentence. If a binding changes, this table changes with it — which is why
     it is one table and not six string literals scattered through the lessons
     below. */
  VERB: {
    key:   { steer: '← →  or  A D', drift: 'SPACE', boost: 'SHIFT', pause: 'ESC' },
    pad:   { steer: 'the stick',    drift: 'A',     boost: 'X',     pause: 'START' },
    touch: { steer: '◀  ▶',         drift: 'DRIFT', boost: 'BOOST', pause: 'II' },
  },

  /** Which vocabulary this player is holding, decided the same way the HUD
      decides which control line to draw. */
  dialect() {
    if (BR.Touch && BR.Touch.capable) return this.VERB.touch;
    if (BR.Input && BR.Input.padFor && BR.Input.padFor(0)) return this.VERB.pad;
    return this.VERB.key;
  },

  /* ── the lessons ──────────────────────────────────────────────────────────
     In the order the rug hands them to you, which is the order 02_Mechanics.md
     lists the verbs in and the order 01_Game_Loop.md's core loop needs them:
     steer, drift, spend the drift, stay on the road, look for the hidden
     things, and only then what any of it is worth.

     Each lesson is:
       ready    may it start yet — a question about the world, not the clock
       needs    the id of a lesson that must have had its turn first
       done     has the player DONE it (null = there is nothing to do)
       patience seconds it is allowed to sit unanswered before giving up
       linger   seconds an informational card stays up

     THE ORDER IS A PRIORITY, NOT A QUEUE, and that distinction was bought the
     hard way. Logging a full guided lap against the technician AI showed the
     surface lesson sitting at the head of the line for forty-five seconds
     waiting for a mistake that driver never makes — and because the lessons
     behind it could not start until it gave up, TOY PIECES AND STARS WERE
     NEVER TAUGHT AT ALL. The two beats that explain the whole progression
     model were blocked by an optional one about the carpet. update() now takes
     the first lesson that is ready rather than the next one in the line, so a
     lesson that is not relevant yet costs nothing and is picked up the moment
     it becomes relevant.

     Note what is NOT taught: items (the Shakedown has none, and a control for
     a thing that cannot happen teaches nothing), jumps (there are no ramps on
     the rug), split screen and time trials (both are menu choices this player
     has not made yet). Every lesson here is about something the player will
     meet inside the next ninety seconds. */
  LESSONS: [
    {
      id: 'steer',
      head: 'IT DRIVES ITSELF',
      body: 'The throttle is automatic. All you do is point it.',
      chip: function (V) { return V.steer; },
      /* Written as "pause with X" rather than "X pauses", which reads as a
         sentence in all three vocabularies — the touch one begins with the
         pause glyph, and "II pauses, any time" is not a sentence. */
      foot: function (V) {
        return 'Pause any time with ' + V.pause + ' — even mid-air.';
      },
      ready: function () { return true; },
      // Not "the countdown ended" — a beat of actually driving, so the first
      // card is still there when the car first moves and the words mean
      // something.
      done: function (c, g, v, RM) {
        return RM.state === RM.STATE.RACING && RM.clock > 1.6;
      },
      patience: 14,
    },

    {
      id: 'drift',
      /* It ARRIVES at a corner and it STAYS UP for as long as the player has
         not managed one, which is up to twenty seconds and several bends. The
         first head read "HERE COMES A CORNER", which is true for one second
         and a lie for the other nineteen — a render at 37 seconds had it still
         announcing a corner two corners later. The card has to be true for the
         whole time it is on screen, not only for the moment it appears. */
      head: 'CORNERS WANT A DRIFT',
      body: 'Hold it as you turn in. Tighter line, and it charges the meter.',
      chip: function (V) { return 'HOLD  ' + V.drift; },
      /* Asked of the racing line, not of a stopwatch: the prompt arrives when
         a real bend is 600-odd units away, wherever the player happens to be
         by then. A player who has already spun, or is miles back, still gets
         it on their own next corner. */
      ready: function (c, g, v, RM) {
        if (RM.state !== RM.STATE.RACING) return false;
        if (Math.hypot(v.vel.x, v.vel.y) < 90) return false;
        const cr = c.cornerAhead(g, v);
        return !!(cr && cr.distance < 620 && cr.severity > 0.30);
      },
      /* driftCharge is the honest test — it only rises while the car is
         actually sliding past driftMinAngle above driftMinSpeed
         (VehicleController). Holding the button in a straight line does not
         count, which is the whole point of the lesson. */
      done: function (c, g, v) { return v.driftCharge > 0.28; },
      patience: 20,
    },

    /* The copy says DRIFTS AND ARROWS, not "that slide was fuel", and the
       difference is not styling. The meter fills from boost pads too — the car
       starts a Rug Route race parked on one — so a player who has not managed
       a drift yet can still arrive here with a green bar, and a card that
       congratulates them on a slide they never made is a card that teaches
       them the wrong cause. It also gets the pads taught for free. */
    {
      id: 'boost',
      head: 'THE METER IS UP',
      body: 'Drifts fill it, and so do the arrows painted on the road.',
      chip: function (V) { return 'PRESS  ' + V.boost; },
      needs: 'drift',
      ready: function (c, g, v) {
        return v.boostMeter >= BR.PHYSICS.boostMinToFire;
      },
      done: function (c, g, v) { return !!v.boosting; },
      patience: 22,
    },

    /* The one lesson the player has to earn by making the mistake. It is only
       offered once the car has actually been off the road for a moment, which
       is when the words mean something — and if nobody ever leaves the tarmac,
       nobody is ever told, because they did not need telling. */
    {
      id: 'rug',
      head: 'THE RUG IS SLOW GOING',
      body: 'Pile drags. The road is quicker even when it is longer.',
      ready: function (c) { return c.offRoadT > 0.45; },
      done: null,
      linger: 4.5,
    },

    /* The two that explain what a race is FOR, held back by the clock rather
       than by the lessons in front of them. Nothing about the world says when
       is the right moment to mention toy pieces, and a lesson with no ready
       condition would fire during the countdown. */
    {
      id: 'pieces',
      head: 'THINGS ARE HIDDEN OUT HERE',
      body: 'Four toy pieces on this rug, off the fast line. They unlock what medals cannot.',
      ready: function (c, g, v, RM) {
        return RM.state === RM.STATE.RACING && RM.clock > 26;
      },
      done: null,
      linger: 5,
    },

    {
      id: 'stars',
      head: 'THREE STARS AN EVENT',
      body: 'Finish, podium, stay tidy. Stars open the rest of the box.',
      ready: function (c, g, v, RM) {
        return RM.state === RM.STATE.RACING &&
               (RM.player().lap >= RM.laps - 1 || RM.clock > 55);
      },
      done: null,
      linger: 5.5,
    },
  ],

  /** The next real bend on the racing line, or null on a straight. */
  cornerAhead(game, v) {
    const line = game.arena && game.arena.racingLine;
    if (!line || !line.length || !BR.CornerHint) return null;
    this.wpHint = BR.CornerHint.nearestWaypoint(line, v, this.wpHint);
    return BR.CornerHint.findCorner(line, this.wpHint);
  },

  /* ── update ───────────────────────────────────────────────────────────────
     Called once per RENDERED frame from main.frame — never from inside the
     fixed step. Nothing here feeds the simulation, and a lesson advancing
     twice on a 144Hz machine would be a UI bug, not a physics one. */
  update(game, dt) {
    if (!this.active) return;
    /* Split screen has no seat to teach: four cards, or one card that belongs
       to whichever quarter of the screen it happens to sit on. It is also an
       exhibition with no stars, so half the lessons would be lies. */
    if (!game || game.players !== 1) { this.finish(); return; }
    if (game.paused) return;

    const RM = BR.RaceManager;
    const v = game.vehicle;
    if (!RM || !RM.racers || !v) return;
    /* Leaving the race ENDS the lessons rather than pausing them. QUIT TO
       EVENTS mid-lesson used to leave the coach armed, so the next event the
       player chose — a sandbox, a time trial — was narrated by cards written
       about a rug. The same reason the event id is checked: these six lessons
       describe one track, and SHOW THE LESSONS AGAIN starts that track. */
    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) { this.finish(); return; }
    if (!game.event || game.event.id !== this.EVENT_ID) { this.finish(); return; }
    // The scorecard owns the screen once the race is over.
    if (RM.state === RM.STATE.FINISHED) { this.finish(); return; }

    /* Off-road time, for the surface lesson. Kept here rather than inside the
       lesson so it accumulates while the earlier ones are still running.

       Asked of the TRACK — `offSurface` is what TrackManager reports beyond
       the kerbs — rather than compared against the string 'rugRoad'. The one
       hard-coded surface name in a UI file is one that goes stale the first
       time a world is added, which is exactly the tax 16_Content_Pipeline.md
       is written to avoid. */
    const off = game.arena && game.arena.offSurface;
    this.offRoadT = (off && v.surface === off) ? this.offRoadT + dt : 0;

    // ── a lesson is on screen ────────────────────────────────────────────
    if (this.cur >= 0) {
      const L = this.LESSONS[this.cur];
      this.showT += dt;

      if (this.doneT >= 0) {
        this.doneT += dt;
        if (this.doneT > this.ACK) this.retire();
        return;
      }

      if (L.done) {
        if (L.done(this, game, v, RM)) {
          this.doneT = 0;
          BR.Audio.checkpoint();
        } else if (this.showT > L.patience) {
          // Given up on quietly. No "you failed", no repeat — see the header.
          this.retire();
        }
      } else if (this.showT > (L.linger || 4)) {
        this.retire();
      }
      return;
    }

    if (this.gapT > 0) { this.gapT -= dt; return; }

    /* ── choosing the next one ────────────────────────────────────────────
       THE FIRST LESSON THAT IS READY, not the next one in the list. List order
       is the tie-break — a corner and a full boost meter arriving together
       teach the drift first — but a lesson whose moment has not come does not
       hold up the ones behind it. `needs` is the only ordering that is
       enforced, and it is used once: nothing says "spend the boost" before the
       player has been told where boost comes from. */
    for (let i = 0; i < this.LESSONS.length; i++) {
      const L = this.LESSONS[i];
      if (this.seen[L.id]) continue;
      if (L.needs && !this.seen[L.needs]) continue;
      if (!L.ready(this, game, v, RM)) continue;
      this.cur = i;
      this.showT = 0;
      this.doneT = -1;
      this.stepNo = this.count + 1;
      return;
    }
  },

  /** This lesson has had its turn, answered or not. */
  retire() {
    const L = this.LESSONS[this.cur];
    if (L && !this.seen[L.id]) { this.seen[L.id] = true; this.count++; }
    this.cur = -1;
    this.showT = -1; this.doneT = -1;
    this.gapT = this.GAP;
    if (this.count >= this.LESSONS.length) this.finish();
  },

  /* ── draw ─────────────────────────────────────────────────────────────────
     THE LEAFLET THAT CAME IN THE BOX. Printed stock with ink on it — the same
     card the event rows and the scorecard are made of (11_UI.md, four
     materials and nothing else) — with the control named on a moulded key cap,
     because a key is a piece of plastic and a sentence is not.

     ── WHERE IT SITS, AND WHY NOT LOWER ─────────────────────────────────────
     Top centre, immediately under the clock. Everything else is spoken for:
     the car and the road it is about to cover are the middle and lower screen,
     the corner arrow is bottom-centre under the car by design, the speed and
     boost block is bottom-left, the map is bottom-right, and the control tape
     is on the bottom edge. Under the clock is the only band on this screen
     that is neither a readout nor the racing line.

     It is drawn ONCE, in screen space, not per viewport — there is only ever
     one seat being taught. It reads the same scale factor the HUD uses so the
     gap under the clock is the same gap at every size.
     ────────────────────────────────────────────────────────────────────── */
  draw(ctx, w, h, dt) {
    if (!this.active) return;
    const G = BR.Game;
    if (!G || G.players !== 1) return;
    // The pause card owns the screen, and it carries its own SKIP control.
    if (G.paused) return;
    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) return;
    const RM = BR.RaceManager;
    if (!RM || RM.state === RM.STATE.FINISHED) return;
    if (this.cur < 0 || this.showT < 0) return;

    const L = this.LESSONS[this.cur];
    if (!L) return;

    const T = BR.Toy;
    const V = this.dialect();

    // Fade in, and fade out under the acknowledgement so the page turn reads
    // as a page turn rather than a cut.
    let a = Math.min(1, this.showT / this.FADE);
    if (this.doneT >= 0) {
      a *= Math.min(1, Math.max(0, (this.ACK - this.doneT) / this.FADE));
    }
    if (a <= 0.01) return;

    /* Same clamp HUD.draw uses, so the card lands the same distance under the
       clock whatever the window is doing. */
    const k = Math.min(1, Math.max(0.55, w / 900));
    const cw = Math.min(452, w - 28);
    const x = Math.round((w - cw) / 2);

    let y = Math.round(60 * k + 12);
    /* Under the CLOCK on a wide screen, and under the position and lap plates
       as well on a narrow one. The card is centred and capped at 452, so on a
       phone it is nearly the full width and its top-left corner reaches back
       into the top-left block — a render at 375 had it sitting across the
       bottom of LAP 1/3. Both bounds come from the rectangles HUD.drawRaceState
       actually draws: the clock ends at 60, the plates at 94 and 268. */
    if (x < 268 * k) y = Math.max(y, Math.round(94 * k + 8));
    /* A phone puts its pause button in the top right corner and gives it a
       generous hit box, and on a narrow screen the card reaches it. Read the
       rect Touch actually laid out this frame rather than recomputing its
       arithmetic here — Touch.draw runs immediately before this. */
    if (BR.Touch && BR.Touch.capable && BR.Touch.driving()) {
      const R = BR.Touch.regions || [];
      for (let i = 0; i < R.length; i++) {
        if (R[i].k !== 'pause') continue;
        const bot = R[i].y + R[i].r * BR.Touch.SLOP + 8;
        if (bot > y) y = Math.round(bot);
      }
    }
    // An item race puts a slot at top centre. The Shakedown has no items, but
    // SHOW THE LESSONS AGAIN can be pressed with any event queued behind it.
    if (G.items && y < 146) y = 146;

    const hasChip = !!L.chip;
    const hasFoot = !!L.foot;

    /* ── the body WRAPS, it does not condense ─────────────────────────────
       fillText's maxWidth squeezes the glyphs instead of clipping them, which
       11_UI.md has already ruled on once for the event rows: a line squeezed
       to fit is present and unreadable. The longest lesson is 78 characters
       and a phone's card is 347 wide, so on a phone this is not an edge case,
       it is every card. The card grows a line instead. */
    ctx.save();
    ctx.font = T.label(12, 600);
    const bodyLines = this.wrap(ctx, L.body, cw - 32, 3);
    ctx.restore();
    const ch = 62 + (bodyLines.length - 1) * 16 +
               (hasChip ? 30 : 0) + (hasFoot ? 16 : 0);

    ctx.save();
    ctx.globalAlpha = a;

    T.card(ctx, x, y, cw, ch, 8, '#e8ddc3', 'paper');

    // The leaflet's step number, the way an assembly sheet counts its steps.
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = T.label(10, 800);
    ctx.fillStyle = 'rgba(44,34,25,0.45)';
    ctx.fillText(this.stepNo + ' / ' + this.LESSONS.length, x + cw - 14, y + 12);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = T.label(15, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText(L.head, x + 16, y + 12, cw - 76);

    ctx.font = T.label(12, 600);
    ctx.fillStyle = 'rgba(44,34,25,0.74)';
    for (let i = 0; i < bodyLines.length; i++) {
      ctx.fillText(bodyLines[i], x + 16, y + 34 + i * 16);
    }
    ctx.restore();

    let by = y + 56 + (bodyLines.length - 1) * 16;
    if (hasChip) {
      this.cap(ctx, x + 16, by, L.chip(V));
      by += 30;
    }
    if (hasFoot) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = T.label(10, 600);
      ctx.fillStyle = 'rgba(44,34,25,0.52)';
      ctx.fillText(L.foot(V), x + 16, by, cw - 32);
      ctx.restore();
    }

    /* GOT IT, as a rubber stamp across the corner of the leaflet — the same
       stamp NEW BEST TIME uses, because it means the same kind of thing. It
       tilts, and it is allowed to, because it carries no hit region. */
    if (this.doneT >= 0) {
      T.stamp(ctx, 'GOT IT', x + cw - 62, y + ch - 20, '#2e7d52', -0.10);
    }

    ctx.restore();

    /* ── the way out ──────────────────────────────────────────────────────
       A real button with a real region, registered through Screens.button so
       it uses the same hit test, the same hover highlight and the same
       plastic as every other control in the game.

       Screens.regions is cleared once per frame in main.frame and nothing
       else pushes to it while racing, so this is index 0 and cannot disturb
       any other screen's focus order. It is a POINTER and THUMB control:
       Screens' key handler deliberately ignores the keyboard while a race is
       being driven, so a keyboard or pad player skips from the pause menu,
       which carries the same action while these are running. Both routes
       exist because neither covers everybody. */
    if (BR.Screens) {
      ctx.save();
      ctx.globalAlpha = a;
      BR.Screens.button(ctx, x + cw - 74, y + ch + 8, 74, 24, 'SKIP',
                        'coachSkip', null, { small: true });
      ctx.restore();
    }
  },

  /**
   * Greedy word wrap against the CURRENT font, capped at `maxLines`. The last
   * line keeps whatever is left rather than being truncated — no lesson is
   * long enough to reach the cap, and a card that silently loses its last four
   * words would be worse than one that runs a line long.
   */
  wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const next = line ? line + ' ' + words[i] : words[i];
      if (line && ctx.measureText(next).width > maxW &&
          lines.length < maxLines - 1) {
        lines.push(line);
        line = words[i];
      } else {
        line = next;
      }
    }
    lines.push(line);
    return lines;
  },

  /* A moulded key cap with the control's name on it. Cream on dark plastic —
     one of the two pairings 11_UI.md allows, and the right one here because
     the word is a piece of the toy rather than something printed on paper. */
  cap(ctx, x, y, text) {
    const T = BR.Toy;
    ctx.save();
    ctx.font = T.label(12, 800);
    const tw = ctx.measureText(text).width;
    T.plate(ctx, x, y, tw + 26, 24, 6, T.SHELL);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    T.moulded(ctx, text, x + 13, y + 13, '#f4ecd8');
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
