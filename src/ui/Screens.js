/* =============================================================================
   SCREENS — menu, event map, garage.
   =============================================================================
   A small state machine over the canvas. Not a scene system: the race is always
   built and the track is always rendered, so menus sit over a live view of the
   rug rather than a flat colour. Cheap, and it keeps the game visible.

   Hit regions are rebuilt every frame during draw and consumed by click(). That
   means the drawing IS the layout — no second copy of the coordinates to drift
   out of sync.

   Locked content is drawn, not hidden: players should see what is coming
   (11_UI.md).
   ========================================================================== */

window.BR = window.BR || {};

BR.Screens = {

  MENU: 'menu', EVENTS: 'events', GARAGE: 'garage', RACE: 'race',

  /* Say what changes, not how hard it is. "Medium" tells a player nothing. */
  DIFF_BLURB: {
    easy:   'Slower rivals, gentler crashes, more forgiving',
    normal: 'The race as intended',
    hard:   'Faster lines, better boost use, few mistakes',
  },

  state: 'menu',
  regions: [],
  hover: -1,
  lastResult: null,      // progression outcome, for the results card
  activeEvent: null,
  toast: null,
  toastTime: 0,
  pieceToast: null,
  pieceToastTime: 0,
  garageSlot: 1,          // which player the garage is currently picking for

  /* ── the event list scrolls ───────────────────────────────────────────────
     It did not, and with fourteen events across four worlds everything past
     the sixth was drawn off the bottom of the screen with no way to reach it.
     The whole stunt world was unreachable — you could not race a loop because
     you could not see that the event existed.

     Regions are rebuilt every frame at their DRAWN position, so offsetting the
     layout offsets the hit targets with it and nothing else has to know. */
  eventScroll: 0,
  eventScrollMax: 0,
  drag: null,

  /* Matches the viewport border colours in main.layoutViews. */
  SLOT_COLOUR: { 1: '#ffd34d', 2: '#69d0ff', 3: '#7fe06a', 4: '#ff9d6b' },

  /* What a locked vehicle asks of you, in words. */
  lockLabel(u) {
    if (!u) return 'Locked';
    return u.pieces === 'all' ? 'Find every toy piece'
                              : ('Needs ' + u.stars + ' stars');
  },

  init(canvas) {
    const self = this;
    this.canvas = canvas;

    canvas.addEventListener('mousemove', function (e) {
      const p = self.local(e);
      self.hover = self.hit(p.x, p.y);
      canvas.style.cursor = self.hover >= 0 ? 'pointer' : 'default';
    });
    canvas.addEventListener('click', function (e) {
      // A click that ended a drag is a scroll, not a press.
      if (self.dragMoved) { self.dragMoved = false; return; }
      const p = self.local(e);
      const i = self.hit(p.x, p.y);
      if (i >= 0) self.dispatch(self.regions[i], p);
    });

    canvas.addEventListener('wheel', function (e) {
      if (self.state !== self.EVENTS) return;
      e.preventDefault();
      self.scrollEvents(e.deltaY);
    }, { passive: false });

    /* Drag to scroll, because the canvas sets touch-action:none and a phone
       has no wheel. Pointer events cover mouse, touch and pen at once. */
    canvas.addEventListener('pointerdown', function (e) {
      if (self.state !== self.EVENTS) return;
      self.drag = { y: self.local(e).y, from: self.eventScroll };
      self.dragMoved = false;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!self.drag) return;
      const dy = self.local(e).y - self.drag.y;
      if (Math.abs(dy) > 4) self.dragMoved = true;
      self.eventScroll = self.drag.from - dy;
      self.clampEventScroll();
    });
    const endDrag = function () { self.drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);

    /* ── keyboard and gamepad menus (11_UI open question 3) ────────────────
       The menus were pointer-only, on a game with four-player couch
       multiplayer and gamepad support. A player holding a pad could drive but
       could not choose an event, pick a car, or leave the pause menu without
       somebody reaching for a mouse. */
    window.addEventListener('keydown', function (e) {
      if (self.state === self.RACE && !BR.Game.paused) return;
      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight':
          e.preventDefault(); self.moveFocus(1); break;
        case 'ArrowUp': case 'ArrowLeft':
          e.preventDefault(); self.moveFocus(-1); break;
        case 'Enter': case ' ':
          e.preventDefault(); self.activateFocus(); break;
        case 'Escape':
          e.preventDefault(); self.back(); break;
        case 'PageDown': self.scrollEvents(420); break;
        case 'PageUp':   self.scrollEvents(-420); break;
        case 'Home':     self.eventScroll = 0; break;
        case 'End':      self.eventScroll = self.eventScrollMax; break;
      }
    });
  },

  /* Focus is an index into `regions`, which is rebuilt every frame in a
     deterministic draw order — so the index is stable as long as the screen is.
     `set()` resets it, which is the only time the order can change. */
  focusIdx: -1,
  padPrev: null,

  moveFocus(dir) {
    const n = this.regions.length;
    if (!n) return;
    this.focusIdx = this.focusIdx < 0
      ? (dir > 0 ? 0 : n - 1)
      : (this.focusIdx + dir + n) % n;
    this.hover = this.focusIdx;          // reuse the existing highlight
    this.revealFocus();
  },

  activateFocus() {
    const r = this.regions[this.focusIdx];
    if (r) this.dispatch(r, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  },

  /* Escape / B. Every screen needs somewhere to go, or a pad player can get
     stranded on a screen with no way out. */
  back() {
    if (this.state === this.RACE && BR.Game.paused) { BR.Game.paused = false; return; }
    if (this.state === this.EVENTS || this.state === this.GARAGE) {
      this.set(this.MENU);
    }
  },

  /* Keep the focused row on screen. Without this, focus walks off the bottom of
     a fourteen-row event list and the highlight vanishes. */
  revealFocus() {
    if (this.state !== this.EVENTS) return;
    const r = this.regions[this.focusIdx];
    if (!r) return;
    const listTop = this.listTop || 0, listBot = this.listBottom || 0;
    if (r.y < listTop)          this.scrollEvents(r.y - listTop - 8);
    else if (r.y + r.h > listBot) this.scrollEvents(r.y + r.h - listBot + 8);
  },

  /* Gamepad, polled once per frame from draw(). Edge-detected, or a held stick
     scrolls the whole list in three frames. */
  pollPad() {
    if (!BR.Input || !BR.Input.padFor) return;
    const pad = BR.Input.padFor(0);
    if (!pad) { this.padPrev = null; return; }
    const B = BR.Input.BUTTON;
    const ax = pad.axes && pad.axes.length > 1 ? pad.axes[1] : 0;
    const now = {
      down: BR.Input.anyBtn(pad, B.dpadD) || ax > 0.5,
      up:   BR.Input.anyBtn(pad, B.dpadU) || ax < -0.5,
      go:   BR.Input.anyBtn(pad, B.accel) || BR.Input.anyBtn(pad, B.drift),
      back: BR.Input.anyBtn(pad, B.brake),
    };
    const p = this.padPrev;
    if (p) {
      if (now.down && !p.down) this.moveFocus(1);
      if (now.up   && !p.up)   this.moveFocus(-1);
      if (now.go   && !p.go)   this.activateFocus();
      if (now.back && !p.back) this.back();
    }
    this.padPrev = now;
  },

  scrollEvents(dy) {
    this.eventScroll += dy;
    this.clampEventScroll();
  },

  clampEventScroll() {
    if (this.eventScroll > this.eventScrollMax) this.eventScroll = this.eventScrollMax;
    if (this.eventScroll < 0) this.eventScroll = 0;
  },

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  hit(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  },

  set(s) {
    // Keep the scroll position when returning from a race, so finishing an
    // event does not throw you back to the top of a fourteen-row list.
    if (s !== this.EVENTS) this.drag = null;
    this.state = s; this.regions = []; this.hover = -1;
    // Focus is an index into a per-screen region order, so it cannot survive a
    // screen change.
    this.focusIdx = -1; this.padPrev = null;
    // Leaving the screen disarms the reset. A destructive action must never sit
    // primed while the player is somewhere else.
    this.resetArmed = false;
  },

  say(msg) { this.toast = msg; this.toastTime = 2.6; },

  dispatch(r, p) {
    const G = BR.Game, P = BR.ProgressionManager;
    BR.Audio.resume();

    switch (r.action) {
      case 'resume':  G.paused = false; break;
      case 'restart': G.paused = false; G.reset(); break;
      case 'quitToEvents':
        G.paused = false;
        G.abandonRace();
        this.set(this.EVENTS);
        break;
      case 'setvol': {
        // Click position IS the value — a one-click slider needs no drag
        // handling and no second interaction model on the canvas.
        const frac = BR.M.clamp(((p ? p.x : r.x) - r.x) / r.w, 0, 1);
        if (r.value === 'sfx') BR.Audio.sfxVolume = frac;
        else BR.Audio.musicVolume = frac;
        BR.Audio.setVolumes(BR.Audio.sfxVolume, BR.Audio.musicVolume);
        const st = BR.SaveManager.get().settings;
        st.sfxVolume = BR.Audio.sfxVolume;
        st.musicVolume = BR.Audio.musicVolume;
        BR.SaveManager.save();
        break;
      }
      case 'toggleMap': {
        const st = BR.SaveManager.get().settings;
        BR.MiniMap.size = BR.MiniMap.size > 0 ? 0 : 0.82;
        st.mapSize = BR.MiniMap.size;
        BR.SaveManager.save();
        BR.Audio.checkpoint();
        break;
      }
      case 'toggleCorners': {
        const st = BR.SaveManager.get().settings;
        BR.CornerHint.size = BR.CornerHint.size > 0 ? 0 : 1;
        st.cornerHint = BR.CornerHint.size;
        BR.SaveManager.save();
        BR.Audio.checkpoint();
        break;
      }
      case 'autoAccel':
        BR.Input.autoAccelerate = !BR.Input.autoAccelerate;
        BR.SaveManager.get().settings.autoAccelerate = BR.Input.autoAccelerate;
        BR.SaveManager.save();
        BR.Audio.checkpoint();
        break;
      /* ── reset progress ──────────────────────────────────────────────────
         15_Save_System.md open question 4: "probably yes, in settings, with
         confirmation."

         TWO STEPS, and the second one is not a generic "are you sure". The
         first press arms it and the button changes to say exactly what will be
         destroyed; only a second press on the armed button does it. Arming
         clears itself if you go anywhere else, so a stray click cannot leave it
         primed for later.

         There is no undo. Nothing else in this game destroys anything, which is
         precisely why this one needs the friction. */
      case 'resetArm':
        this.resetArmed = true;
        break;
      case 'resetConfirm': {
        BR.SaveManager.reset();
        BR.ProgressionManager.applyUnlocks();
        G.refreshPlayerVehicles();
        this.resetArmed = false;
        this.say('Progress reset');
        this.set(this.MENU);
        break;
      }

      case 'goto':    this.set(r.value); break;
      case 'start':   G.startEvent(BR.eventById(r.value)); break;
      case 'slot':
        this.garageSlot = r.value;
        BR.Audio.checkpoint();
        break;
      case 'pick':
        if (P.selectVehicleFor(r.value, this.garageSlot)) {
          BR.Audio.checkpoint();
          BR.Game.syncPlayerVehicles();
        } else {
          this.say(this.lockLabel(P.unlockFor(r.value)));
        }
        break;
      case 'retry':   G.startEvent(this.activeEvent); break;
      case 'quit':    G.abandonRace(); this.set(this.EVENTS); break;
      case 'locked':  this.say('Locked — needs ' + r.value + ' stars'); break;
      case 'players':
        BR.Game.players = r.value;
        BR.Game.buildRace();
        BR.Audio.checkpoint();
        break;
      case 'difficulty':
        BR.SaveManager.get().settings.difficulty = r.value;
        BR.SaveManager.save();
        BR.Game.difficulty = r.value;
        BR.Audio.checkpoint();
        break;
    }
  },

  /* ── drawing ───────────────────────────────────────────────────────────── */

  draw(ctx, w, h, dt) {
    if (this.pieceToastTime > 0) this.pieceToastTime -= dt;

    /* Polled here rather than on an event, because the Gamepad API has no
       events — it only reports state when asked. Skipped while actually racing,
       where the pad is driving the car. */
    if (this.state !== this.RACE || BR.Game.paused) this.pollPad();

    if (this.state === this.RACE) {
      // Drawn full-screen rather than per viewport: pause is one global state,
      // and in split screen any player can call it.
      if (BR.Game.paused) this.drawPause(ctx, w, h);
      return;
    }
    this.regions = [];

    // Dim the live track behind the UI.
    ctx.fillStyle = 'rgba(14,12,10,0.74)';
    ctx.fillRect(0, 0, w, h);

    if (this.state === this.MENU)   this.drawMenu(ctx, w, h);
    if (this.state === this.EVENTS) this.drawEvents(ctx, w, h);
    if (this.state === this.GARAGE) this.drawGarage(ctx, w, h);

    if (this.toastTime > 0) {
      this.toastTime -= dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTime);
      ctx.textAlign = 'center';
      ctx.font = '700 14px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#ff9d6b';
      ctx.fillText(this.toast, w / 2, h - 46);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  },

  button(ctx, x, y, w, h, label, action, value, opts) {
    opts = opts || {};
    const i = this.regions.length;
    this.regions.push({ x: x, y: y, w: w, h: h, action: action, value: value });
    const hot = this.hover === i;

    ctx.fillStyle = opts.primary
      ? (hot ? '#ffdf72' : '#ffd34d')
      : opts.danger
        ? (hot ? 'rgba(255,107,107,0.30)' : 'rgba(255,107,107,0.15)')
        : (hot ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)');
    this.round(ctx, x, y, w, h, 8);
    ctx.fill();
    if (!opts.primary) {
      ctx.strokeStyle = opts.danger ? '#ff6b6b' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = opts.danger ? 2 : 1;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = (opts.small ? '700 10px ' : '700 13px ') +
               'ui-monospace, Consolas, monospace';
    ctx.fillStyle = opts.primary ? '#221e1b'
                  : (opts.danger ? '#ffb3b3' : '#ece6da');
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  title(ctx, text, x, y) {
    ctx.font = '800 15px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#221e1b';
    const pad = 10;
    const wgt = ctx.measureText(text).width;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.012);
    ctx.fillStyle = '#ffd34d';
    this.round(ctx, 0, 0, wgt + pad * 2, 28, 3);
    ctx.fill();
    ctx.fillStyle = '#221e1b';
    ctx.fillText(text, pad, 8);
    ctx.restore();
  },

  starRow(ctx, x, y, got, total) {
    for (let i = 0; i < total; i++) {
      ctx.beginPath();
      const cx = x + i * 15, cy = y + 5;
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? 6 : 2.6;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = i < got ? '#ffd34d' : 'rgba(255,255,255,0.14)';
      ctx.fill();
    }
  },

  // ── pause ────────────────────────────────────────────────────────────────
  /* 11_UI.md: Resume, Restart, Settings, Quit — available at any time,
     including mid-air and during the countdown.

     Quitting lives HERE rather than on a key. Escape used to abandon a race
     outright with no confirmation, which is a lot of lost progress for a
     mistyped key. */
  drawPause(ctx, w, h) {
    const cardW = Math.min(380, w - 48);
    const cardH = 366;
    const x = (w - cardW) / 2, y = (h - cardH) / 2;

    ctx.fillStyle = 'rgba(10,8,7,0.72)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#191614';
    this.round(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '800 22px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('PAUSED', w / 2, y + 22);
    ctx.textAlign = 'left';

    const bw = cardW - 44, bx = x + 22;
    let by = y + 62;
    this.button(ctx, bx, by, bw, 40, 'RESUME', 'resume', null, { primary: true });
    by += 50;
    this.button(ctx, bx, by, bw, 36, 'RESTART RACE', 'restart', null);
    by += 46;
    this.button(ctx, bx, by, bw, 36, 'QUIT TO EVENTS', 'quitToEvents', null);

    // ── settings worth reaching mid-race ─────────────────────────────────
    by += 54;
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillText('SOUND', bx, by - 12);

    by = this.volSlider(ctx, bx, by, bw, 'SFX', BR.Audio.sfxVolume, 'sfx');
    by = this.volSlider(ctx, bx, by, bw, 'MUSIC', BR.Audio.musicVolume, 'music');

    by += 6;
    const auto = BR.Input.autoAccelerate;
    this.button(ctx, bx, by, bw, 30,
                'AUTO-ACCELERATE  ' + (auto ? 'ON' : 'OFF'), 'autoAccel', null);

    // Display options that used to live only in the debug panel. 11_UI.md asks
    // which of these earns its screen space; the answer should not require a
    // developer tool to explore.
    by += 40;
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillText('DISPLAY', bx, by - 12);

    const halfW = (bw - 8) / 2;
    this.button(ctx, bx, by, halfW, 30,
                'MAP  ' + (BR.MiniMap.size > 0 ? 'ON' : 'OFF'), 'toggleMap', null);
    this.button(ctx, bx + halfW + 8, by, halfW, 30,
                'CORNERS  ' + (BR.CornerHint.size > 0 ? 'ON' : 'OFF'),
                'toggleCorners', null);

    ctx.textAlign = 'center';
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('P or START to resume', w / 2, y + cardH - 16);
    ctx.textAlign = 'left';
  },

  /* Click-position slider. One interaction, no drag state. */
  volSlider(ctx, x, y, w, label, value, key) {
    const labW = 46, barX = x + labW, barW = w - labW, barH = 14;

    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(label, x, y + 3);

    const idx = this.regions.length;
    this.regions.push({ x: barX, y: y - 4, w: barW, h: barH + 8,
                        action: 'setvol', value: key });
    const hot = this.hover === idx;

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    this.round(ctx, barX, y, barW, barH, 5);
    ctx.fill();
    ctx.fillStyle = hot ? '#ffdf72' : '#ffd34d';
    if (value > 0.001) {
      this.round(ctx, barX, y, Math.max(6, barW * value), barH, 5);
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    if (value > 0.12) ctx.fillText(Math.round(value * 100) + '%', barX + barW * value - 6, y + 3);
    ctx.textAlign = 'left';

    return y + barH + 12;
  },

  // ── main menu ────────────────────────────────────────────────────────────
  drawMenu(ctx, w, h) {
    const P = BR.ProgressionManager;
    const cx = w / 2;

    ctx.textAlign = 'center';
    ctx.font = '800 40px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ece6da';
    ctx.fillText('BEDROOM RACERS', cx, h * 0.22);

    ctx.font = '600 12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('The toys race when nobody is watching', cx, h * 0.22 + 52);

    ctx.font = '700 13px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(P.stars() + ' / ' + P.maxStars() + ' STARS   ·   ' +
                 P.piecesFound().length + ' / ' + P.piecesTotal() + ' TOY PIECES',
                 cx, h * 0.22 + 82);

    /* The controls, on the front page. In-race the hint fades after a couple of
       seconds, which is right for a countdown and useless to somebody who has
       already forgotten which key drifts — so they are also somewhere you can
       go and look, without a screen to open or a menu to find.

       Multi-player seats are told their own keys under their own half of the
       split screen, so this shows the one-player scheme it belongs to. */
    if (BR.Game.players === 1) {
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText(BR.Input.padFor(0) ? BR.Input.PAD_LABEL : BR.Input.LABELS.solo,
                   cx, h * 0.22 + 104);
    }
    ctx.textAlign = 'left';

    const bw = 240, bx = cx - bw / 2;
    let by = h * 0.44;
    this.button(ctx, bx, by, bw, 46, 'RACE', 'goto', this.EVENTS, { primary: true });
    by += 58;
    this.button(ctx, bx, by, bw, 42, 'GARAGE', 'goto', this.GARAGE);

    // ── players ───────────────────────────────────────────────────────────
    by += 58;
    ctx.textAlign = 'center';
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillText('PLAYERS', cx, by - 16);
    ctx.textAlign = 'left';

    const pw = 58, pgap = 6, pn = BR.Game.MAX_PLAYERS;
    for (let i = 1; i <= pn; i++) {
      const px = cx - (pw * pn + pgap * (pn - 1)) / 2 + (i - 1) * (pw + pgap);
      const on = BR.Game.players === i;
      const idx = this.regions.length;
      this.regions.push({ x: px, y: by, w: pw, h: 34, action: 'players', value: i });
      const hot = this.hover === idx;
      ctx.fillStyle = on ? 'rgba(105,208,255,0.20)'
                         : (hot ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)');
      this.round(ctx, px, by, pw, 34, 7);
      ctx.fill();
      ctx.strokeStyle = on ? '#69d0ff' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '700 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = on ? '#69d0ff' : 'rgba(255,255,255,0.65)';
      ctx.fillText(String(i), px + pw / 2, by + 13);
      ctx.textAlign = 'left';
    }

    if (BR.Game.players > 1) {
      ctx.textAlign = 'center';
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText('Exhibition — no medals, stars or ghosts. Toy pieces still count.',
                   cx, by + 44);
      // The rollover warning only applies to seats actually on the keyboard.
      const pads = BR.Input.pads().length;
      const onKeys = Math.max(0, BR.Game.players - pads);
      if (onKeys > 2) {
        ctx.fillStyle = 'rgba(255,157,107,0.75)';
        ctx.fillText(onKeys + ' drivers on one keyboard can exceed what it reports at once',
                     cx, by + 58);
      }
    }

    // Gamepads claim seats in order, so say which are covered.
    const pads = BR.Input.pads().length;
    if (pads > 0) {
      ctx.textAlign = 'center';
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#7fe06a';
      ctx.fillText(pads === 1 ? '1 gamepad connected — player 1'
                              : (pads + ' gamepads connected — players 1 to ' + pads),
                   cx, by + (BR.Game.players > 1 ? 72 : 44));
      ctx.textAlign = 'left';
      ctx.textAlign = 'left';
    }

    // ── difficulty ────────────────────────────────────────────────────────
    // 11_UI.md lists this under accessibility, not options, so it lives where
    // it can be found rather than buried behind a settings screen.
    by += 62;
    ctx.textAlign = 'center';
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillText('DIFFICULTY', cx, by - 16);
    ctx.textAlign = 'left';

    const cur = BR.SaveManager.get().settings.difficulty;
    const opts = ['easy', 'normal', 'hard'];
    const dw = 78, gap = 5;
    const totalW = dw * 3 + gap * 2;
    for (let i = 0; i < 3; i++) {
      const x = cx - totalW / 2 + i * (dw + gap);
      const on = opts[i] === cur;
      const idx = this.regions.length;
      this.regions.push({ x: x, y: by, w: dw, h: 34,
                          action: 'difficulty', value: opts[i] });
      const hot = this.hover === idx;
      ctx.fillStyle = on ? 'rgba(255,211,77,0.22)'
                         : (hot ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)');
      this.round(ctx, x, by, dw, 34, 7);
      ctx.fill();
      ctx.strokeStyle = on ? '#ffd34d' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '700 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = on ? '#ffd34d' : 'rgba(255,255,255,0.65)';
      ctx.fillText(opts[i].toUpperCase(), x + dw / 2, by + 13);
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center';
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillText(this.DIFF_BLURB[cur] || '', cx, by + 44);
    ctx.textAlign = 'left';

    /* ── reset progress ────────────────────────────────────────────────────
       15_Save_System.md open question 4. Deliberately the smallest, dimmest
       control on the screen — it must be findable, not inviting.

       Only appears once there is something to lose. Offering to erase an empty
       save is noise, and it is the one button whose absence nobody misses. */
    const save = BR.SaveManager.get();
    const stars = P.stars();
    const evs = save.progression.events || {};
    let medals = 0;
    for (const k in evs) if (evs[k] && evs[k].medal) medals++;
    const pieces = (save.collection.piecesFound || []).length;

    if (stars > 0 || medals > 0 || pieces > 0) {
      /* Pinned near the bottom, but NEVER above the end of the flowed content.
         Bottom-anchoring alone put it straight on top of the difficulty buttons
         at 820x420 and below — and because hit() takes the last matching region,
         the reset won: a press aimed at DIFFICULTY armed a destructive control.
         Taking the max keeps it low on a normal window and clear of everything
         on a short one.

         `by` is the difficulty row; its blurb ends around by + 52, and the armed
         state needs two lines above the buttons, so by + 70 is the first safe y. */
      const ry = Math.max(h - 52, by + 70);
      if (!this.resetArmed) {
        this.button(ctx, cx - 70, ry, 140, 24, 'RESET PROGRESS',
                    'resetArm', null, { small: true });
      } else {
        /* Armed. The confirm names the actual numbers rather than asking "are
           you sure" — a player who has forgotten they have 14 stars deserves to
           be told before they press it, not after. */
        const bits = [];
        if (stars)  bits.push(stars  + (stars  === 1 ? ' star'  : ' stars'));
        if (medals) bits.push(medals + (medals === 1 ? ' medal' : ' medals'));
        if (pieces) bits.push(pieces + (pieces === 1 ? ' piece' : ' pieces'));

        ctx.textAlign = 'center';
        ctx.font = '700 11px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#ff8f8f';
        ctx.fillText('Erase ' + bits.join(', ') + ' and every lap record?',
                     cx, ry - 16);
        ctx.font = '600 10px ui-monospace, Consolas, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.fillText('This cannot be undone. Settings are kept.', cx, ry - 3);
        ctx.textAlign = 'left';

        this.button(ctx, cx - 150, ry + 6, 144, 26, 'YES, ERASE IT ALL',
                    'resetConfirm', null, { small: true, danger: true });
        this.button(ctx, cx + 6, ry + 6, 144, 26, 'KEEP MY PROGRESS',
                    'goto', this.MENU, { small: true });
      }
    }

    if (!BR.SaveManager.storageOk) {
      ctx.textAlign = 'center';
      ctx.font = '600 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#ff9d6b';
      ctx.fillText('Storage unavailable — progress will not be saved',
                   cx, h - 30);
      ctx.textAlign = 'left';
    }
  },

  // ── event map ────────────────────────────────────────────────────────────
  drawEvents(ctx, w, h) {
    const P = BR.ProgressionManager;
    const cardW = Math.min(560, w - 48);
    const x = (w - cardW) / 2;
    let y = Math.max(24, h * 0.10);

    this.title(ctx, 'CHOOSE AN EVENT', x, y);

    // Difficulty is shown here too — it changes what a medal is worth, so it
    // should not be something you have to go back to the menu to remember.
    const diff = BR.SaveManager.get().settings.difficulty;
    ctx.textAlign = 'right';
    ctx.font = '700 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = diff === 'hard' ? '#ff9d6b'
                  : (diff === 'easy' ? '#4fd8a8' : 'rgba(255,255,255,0.55)');
    ctx.fillText(diff.toUpperCase(), x + cardW, y + 9);
    if (diff === 'easy') {
      ctx.font = '600 9px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('no platinum on easy', x + cardW, y + 24);
    }
    ctx.textAlign = 'left';
    y += 46;

    /* ── the scrolling viewport ────────────────────────────────────────────
       Rows are laid out from listTop and shifted up by eventScroll, then
       clipped. The BACK button sits below the band so it never scrolls away. */
    const rowH = 92, rowGap = 12, rowStep = rowH + rowGap;
    const listTop = y;
    const listBottom = h - 62;
    // Published for revealFocus, which scrolls the keyboard-focused row into
    // this band.
    this.listTop = listTop;
    this.listBottom = listBottom;
    const listH = Math.max(rowStep, listBottom - listTop);
    const contentH = BR.EVENTS.length * rowStep;
    this.eventScrollMax = Math.max(0, contentH - listH);
    this.clampEventScroll();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 8, listTop, cardW + 16, listH);
    ctx.clip();

    y = listTop - this.eventScroll;

    for (let i = 0; i < BR.EVENTS.length; i++) {
      // Skip rows entirely outside the band. Not just a saving: a button drawn
      // off-band would still register a hit region and be clickable.
      if (y + rowH < listTop - 4 || y > listBottom + 4) { y += rowStep; continue; }
      const ev = BR.EVENTS[i];
      const rec = P.eventRecord(ev.id);
      const open = P.isEventUnlocked(ev);

      ctx.fillStyle = open ? 'rgba(25,22,20,0.92)' : 'rgba(25,22,20,0.55)';
      this.round(ctx, x, y, cardW, rowH, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Medal chip
      ctx.beginPath();
      ctx.arc(x + 32, y + 32, 14, 0, Math.PI * 2);
      ctx.fillStyle = P.medalColour(rec.medal);
      ctx.fill();
      if (rec.medal === 'none') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.stroke();
      }

      ctx.font = '700 15px ui-monospace, Consolas, monospace';
      ctx.fillStyle = open ? '#ece6da' : 'rgba(255,255,255,0.4)';
      ctx.fillText(ev.name, x + 58, y + 16);

      ctx.font = '600 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(ev.blurb, x + 58, y + 38);

      // Objectives, always visible before the race.
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      let oy = y + 58;
      for (let k = 0; k < ev.objectives.length; k++) {
        const o = ev.objectives[k];
        const got = rec.objectives.indexOf(o.id) !== -1;
        ctx.fillStyle = got ? '#ffd34d' : 'rgba(255,255,255,0.38)';
        ctx.fillText((got ? '★ ' : '☆ ') + o.label, x + 58 + (k % 2) * 250,
                     oy + Math.floor(k / 2) * 14);
      }

      if (open) {
        this.button(ctx, x + cardW - 106, y + 28, 88, 34, 'RACE', 'start', ev.id,
                    { primary: true });
      } else {
        this.button(ctx, x + cardW - 118, y + 28, 100, 34,
                    ev.unlockStars + ' ★ NEEDED', 'locked', ev.unlockStars);
      }

      y += rowStep;
    }

    ctx.restore();

    /* Scrollbar. Not decoration — with the list clipped there is otherwise
       nothing on screen to say that anything follows the sixth event, which is
       exactly how a whole world went missing. */
    if (this.eventScrollMax > 0) {
      const trackX = x + cardW + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      this.round(ctx, trackX, listTop, 5, listH, 2.5);
      ctx.fill();

      const thumbH = Math.max(34, listH * (listH / contentH));
      const thumbY = listTop +
        (listH - thumbH) * (this.eventScroll / this.eventScrollMax);
      ctx.fillStyle = 'rgba(255,211,77,0.7)';
      this.round(ctx, trackX, thumbY, 5, thumbH, 2.5);
      ctx.fill();

      // And say it in words, once, for anyone who has not spotted the bar.
      if (this.eventScroll < 4) {
        ctx.textAlign = 'center';
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.fillStyle = 'rgba(255,211,77,0.75)';
        ctx.fillText('SCROLL FOR MORE EVENTS ↓', x + cardW / 2, listBottom + 16);
        ctx.textAlign = 'left';
      }
    }

    this.button(ctx, x, h - 48, 120, 36, '← BACK', 'goto', this.MENU);
  },

  // ── garage ───────────────────────────────────────────────────────────────
  drawGarage(ctx, w, h) {
    const P = BR.ProgressionManager;
    /* Rival-only cars exist to fill out a grid, not to be driven. Listing them
       here would show a row that is permanently locked with no way to earn it,
       which reads as a bug rather than as a rival. */
    const ids = Object.keys(BR.VEHICLES).filter(function (id) {
      return !BR.VEHICLES[id].aiOnly;
    });
    const cardW = Math.min(620, w - 48);
    const x = (w - cardW) / 2;
    let y = Math.max(24, h * 0.09);

    this.title(ctx, 'GARAGE', x, y);

    const seats = Math.max(1, Math.min(BR.Game.MAX_PLAYERS, BR.Game.players));
    const twoUp = seats > 1;
    if (this.garageSlot > seats) this.garageSlot = 1;

    // In split screen the garage picks for whichever player is active. Both
    // choices stay visible on the cards, so it is never a mystery who is in
    // what.
    if (twoUp) {
      const tw = 62, tgap = 5;
      for (let s = 1; s <= seats; s++) {
        const tx = x + cardW - (tw * seats + tgap * (seats - 1)) +
                   (s - 1) * (tw + tgap);
        const on = this.garageSlot === s;
        const idx = this.regions.length;
        this.regions.push({ x: tx, y: y - 2, w: tw, h: 30, action: 'slot', value: s });
        const hot = this.hover === idx;
        ctx.fillStyle = on ? 'rgba(255,255,255,0.14)'
                           : (hot ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)');
        this.round(ctx, tx, y - 2, tw, 30, 6);
        ctx.fill();
        ctx.strokeStyle = on ? this.SLOT_COLOUR[s] : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = on ? 2 : 1;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = '700 11px ui-monospace, Consolas, monospace';
        ctx.fillStyle = on ? this.SLOT_COLOUR[s] : 'rgba(255,255,255,0.55)';
        ctx.fillText('P' + s, tx + tw / 2, y + 8);
        ctx.textAlign = 'left';
      }
    }
    y += 44;

    const colW = Math.floor((cardW - 16) / 3);
    // Which slot holds which car, so every seat's pick is visible at once.
    const held = {};
    for (let s = 1; s <= seats; s++) held[P.selectedVehicleFor(s)] = s;
    const selected = P.selectedVehicleFor(this.garageSlot);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const spec = BR.VEHICLES[id];
      const owned = P.isVehicleOwned(id);
      const col = i % 3, row = Math.floor(i / 3);
      const cx2 = x + col * (colW + 8);
      const cy2 = y + row * 156;

      const heldBy = held[id] || 0;
      const active = id === selected;

      ctx.fillStyle = heldBy ? 'rgba(255,255,255,0.10)' : 'rgba(25,22,20,0.9)';
      this.round(ctx, cx2, cy2, colW, 146, 10);
      ctx.fill();
      ctx.strokeStyle = heldBy ? this.SLOT_COLOUR[heldBy] : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = active ? 2 : (heldBy ? 1.5 : 1);
      ctx.stroke();

      // Badge, so both players' picks are legible at once.
      if (heldBy) {
        ctx.fillStyle = this.SLOT_COLOUR[heldBy];
        this.round(ctx, cx2 + colW - 30, cy2 + 8, 22, 16, 4);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 10px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#221e1b';
        ctx.fillText('P' + heldBy, cx2 + colW - 19, cy2 + 12);
        ctx.textAlign = 'left';
      }

      // Car, or a silhouette if it is not yours yet.
      ctx.save();
      ctx.translate(cx2 + colW / 2, cy2 + 40);
      ctx.fillStyle = owned ? spec.colorBody : 'rgba(255,255,255,0.13)';
      this.round(ctx, -22, -12, 44, 24, 5);
      ctx.fill();
      ctx.fillStyle = owned ? spec.colorTop : 'rgba(255,255,255,0.08)';
      this.round(ctx, -12, -8, 20, 16, 3);
      ctx.fill();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.font = '700 12px ui-monospace, Consolas, monospace';
      ctx.fillStyle = owned ? '#ece6da' : 'rgba(255,255,255,0.35)';
      ctx.fillText(owned ? spec.name : '???', cx2 + colW / 2, cy2 + 62);
      ctx.textAlign = 'left';

      if (owned) {
        this.stat(ctx, cx2 + 14, cy2 + 84, colW - 28, 'SPD', spec.maxSpeed / 420);
        this.stat(ctx, cx2 + 14, cy2 + 98, colW - 28, 'ACC', spec.acceleration / 210);
        this.stat(ctx, cx2 + 14, cy2 + 112, colW - 28, 'HND', spec.handling);
        this.stat(ctx, cx2 + 14, cy2 + 126, colW - 28, 'WGT', spec.weight / 1.5);
        this.regions.push({ x: cx2, y: cy2, w: colW, h: 146,
                            action: 'pick', value: id });
      } else {
        const u = P.unlockFor(id);
        ctx.textAlign = 'center';
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.fillStyle = '#ffd34d';
        if (u && u.pieces === 'all') {
          ctx.fillText('FIND EVERY', cx2 + colW / 2, cy2 + 94);
          ctx.fillText('TOY PIECE', cx2 + colW / 2, cy2 + 108);
          ctx.font = '600 10px ui-monospace, Consolas, monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillText(P.piecesFound().length + ' / ' + P.piecesTotal(),
                       cx2 + colW / 2, cy2 + 124);
        } else {
          ctx.font = '700 11px ui-monospace, Consolas, monospace';
          ctx.fillText((u ? u.stars : '?') + ' ★ TO UNLOCK', cx2 + colW / 2, cy2 + 100);
        }
        ctx.textAlign = 'left';
        this.regions.push({ x: cx2, y: cy2, w: colW, h: 146,
                            action: 'pick', value: id });
      }
    }

    const rows = Math.ceil(ids.length / 3);
    const by = y + rows * 156 + 6;
    ctx.font = '600 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(BR.VEHICLES[selected].description, x + 132, by + 12);
    if (twoUp) {
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillText('Picking a car the other player holds swaps them',
                   x + 132, by + 28);
    }
    this.button(ctx, x, by, 120, 36, '← BACK', 'goto', this.MENU);
  },

  stat(ctx, x, y, w, label, frac) {
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(label, x, y);
    const bx = x + 26, bw = w - 26;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    this.round(ctx, bx, y, bw, 7, 3); ctx.fill();
    ctx.fillStyle = '#4fd8a8';
    this.round(ctx, bx, y, Math.max(2, bw * Math.min(1, frac)), 7, 3); ctx.fill();
  },

  round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  },
};
