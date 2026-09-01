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

  /* WELCOME is the first thing a brand new save sees, instead of the menu.
     SETTINGS and CREDITS are the two screens 11_UI.md has listed under "Main
     menu" since the first draft and which never got built — the settings that
     existed were reachable only from the pause card, mid-race, or from a key
     nobody was told about. */
  WELCOME: 'welcome', SETTINGS: 'settings', CREDITS: 'credits',

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
      /* The save-code panel is real DOM sitting over the canvas, and this
         listener is on `window` — so every character typed into its textarea
         would ALSO arrive here as menu navigation. Pasting a code would scroll
         the event list and Escape would walk out of the screen mid-paste.
         While the panel is open it owns the keyboard. */
      if (self.panel) {
        if (e.key === 'Escape') { e.preventDefault(); self.closePanel(); }
        return;
      }
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
    /* Escaping off the welcome card is declining it, not dodging it. If it
       came back on the next boot the flag would mean nothing, and the one
       thing this screen must never be is a thing you cannot get rid of. */
    if (this.state === this.WELCOME) {
      if (BR.Coach) BR.Coach.markTaught();
      this.set(this.MENU);
      return;
    }
    if (this.state === this.EVENTS || this.state === this.GARAGE ||
        this.state === this.SETTINGS || this.state === this.CREDITS) {
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
    // Same rule for the save-code panel, which can be sitting on a confirmation
    // that would replace everything.
    this.closePanel();
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
      /* ── accessibility (11_UI.md) ─────────────────────────────────────────
         Three steps rather than a slider, because the useful answers are "as
         designed", "less of it" and "none": a continuous control here invites
         hunting for a value, and the measurement says the middle is not even
         proportional — full rotation travels 598 degrees of yaw over forty
         seconds, half travels 498, and off travels none. */
      case 'camRot': {
        const st = BR.SaveManager.get().settings;
        const now = st.cameraRotation === undefined ? 1 : st.cameraRotation;
        const next = now === 1 ? 0.5 : (now === 0.5 ? 0 : 1);
        st.cameraRotation = next;
        BR.Renderer.cameraRotation = next;
        BR.SaveManager.save();
        BR.Audio.checkpoint();
        break;
      }
      case 'markShapes': {
        const st = BR.SaveManager.get().settings;
        st.markShapes = !st.markShapes;
        BR.MiniMap.markShapes = st.markShapes;
        BR.SaveManager.save();
        BR.Audio.checkpoint();
        break;
      }
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

      /* ── save codes ──────────────────────────────────────────────────────
         15_Save_System.md open question 2. Both open the same panel; the panel
         is where the friction lives, because importing destroys progress and a
         one-press button that eats a save is not acceptable. */
      case 'saveExport': this.openExport(); break;
      case 'saveImport': this.openImport(); break;

      /* ── the first-run lessons (src/ui/Coach.js) ─────────────────────────
         Three actions and no fourth: take them, decline them, stop them
         halfway. Coach.begin() picks the event itself, so the welcome card
         and SHOW THE LESSONS AGAIN cannot drift apart about which track
         teaches. All three mark the seat as taught — declining is an answer,
         and a screen that reappears after you have said no is a bug. */
      case 'coachStart':   BR.Coach.begin(); break;
      case 'coachDecline': BR.Coach.markTaught(); this.set(this.MENU); break;
      case 'coachSkip':    BR.Coach.skip(); break;

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

  /* ── the save-code panel ──────────────────────────────────────────────────
     The one piece of real DOM this game puts on the screen, and it is here
     because a save code is a THOUSAND characters that have to be selected,
     copied, and pasted back. A canvas cannot be selected and it cannot receive
     a paste; navigator.clipboard needs a permission the artifact host may not
     grant; window.prompt is a single-line box that throws the pasted text away
     the moment the code is rejected, which on a long code is the difference
     between fixing a paste and giving up.

     A textarea does all three jobs and degrades to the same floor every time:
     THE CODE IS VISIBLE AND SELECTABLE. Every clipboard convenience layered on
     top of that is allowed to fail.

     It is also where the destructive confirmation lives. Import is the only
     action in the game that can destroy progress the player did not choose to
     destroy, so like RESET PROGRESS it takes two presses, and the second names
     what is going and what is arriving rather than asking "are you sure".
     ────────────────────────────────────────────────────────────────────── */

  panel: null,

  el(tag, style, text) {
    const e = document.createElement(tag);
    // Set through CSSOM, never as a style ATTRIBUTE: the published page runs
    // under a CSP with no unsafe-inline, which blocks the attribute form.
    if (style) for (const k in style) e.style[k] = style[k];
    if (text !== undefined) e.textContent = text;
    return e;
  },

  tallyWords(t) {
    const bits = [];
    if (t.stars)  bits.push(t.stars  + (t.stars  === 1 ? ' star'  : ' stars'));
    if (t.medals) bits.push(t.medals + (t.medals === 1 ? ' medal' : ' medals'));
    if (t.pieces) bits.push(t.pieces + (t.pieces === 1 ? ' toy piece' : ' toy pieces'));
    if (!bits.length) return 'nothing yet';
    return bits.join(', ');
  },

  closePanel() {
    if (!this.panel) return;
    try {
      const b = this.panel.back;
      if (b && b.parentNode) b.parentNode.removeChild(b);
    } catch (e) { /* already gone */ }
    this.panel = null;
  },

  /**
   * Build the panel shell. Returns the panel record, or null if there is no
   * document to attach to — in which case the caller falls back to a toast
   * rather than throwing.
   */
  openPanel(title, hint) {
    this.closePanel();
    const self = this;
    if (typeof document === 'undefined' || !document.body) return null;

    const back = this.el('div', {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
      background: 'rgba(10,9,8,0.86)', zIndex: '9999',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    });

    const card = this.el('div', {
      width: '560px', maxWidth: '100%', boxSizing: 'border-box',
      background: '#191614', border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: '10px', padding: '16px',
      fontFamily: 'ui-monospace, Consolas, monospace',
      color: '#ece6da', fontSize: '12px', lineHeight: '1.5',
      boxShadow: '0 18px 44px rgba(0,0,0,0.6)',
    });

    const head = this.el('div', {
      fontSize: '13px', fontWeight: '800', letterSpacing: '0.04em',
      color: '#ffd34d', marginBottom: '8px',
    }, title);

    const note = this.el('div', {
      color: 'rgba(255,255,255,0.62)', marginBottom: '10px',
    }, hint);

    const area = this.el('textarea', {
      width: '100%', height: '132px', boxSizing: 'border-box',
      background: '#0f0d0c', color: '#ece6da',
      border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px',
      padding: '8px', fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '12px', lineHeight: '1.45', resize: 'vertical',
      // A code has no words in it, so wrapping mid-"word" is the correct thing
      // to do — otherwise it draws as one unbreakable 1000-character line.
      wordBreak: 'break-all',
    });
    area.spellcheck = false;
    area.autocapitalize = 'off';
    area.autocomplete = 'off';
    area.setAttribute('autocorrect', 'off');

    const status = this.el('div', {
      minHeight: '16px', marginTop: '8px', color: 'rgba(255,255,255,0.55)',
    }, '');

    const row = this.el('div', {
      display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px',
    });

    card.appendChild(head);
    card.appendChild(note);
    card.appendChild(area);
    card.appendChild(status);
    card.appendChild(row);
    back.appendChild(card);

    // Clicking the dark surround leaves. Clicking the card must not.
    back.addEventListener('click', function (e) {
      if (e.target === back) self.closePanel();
    });

    document.body.appendChild(back);
    this.panel = { back: back, card: card, head: head, note: note,
                   area: area, status: status, row: row };
    return this.panel;
  },

  panelSay(msg, colour) {
    if (!this.panel) return;
    this.panel.status.textContent = msg;
    this.panel.status.style.color = colour || 'rgba(255,255,255,0.55)';
  },

  /* Buttons are rebuilt rather than toggled, because the confirmation step
     replaces them entirely and a leftover handler on a hidden button is how a
     destructive action gets fired by the wrong press. */
  panelButtons(defs) {
    if (!this.panel) return;
    const row = this.panel.row;
    while (row.firstChild) row.removeChild(row.firstChild);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const b = this.el('button', {
        appearance: 'none', cursor: 'pointer',
        padding: '9px 14px', borderRadius: '7px',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '11px', fontWeight: '700', letterSpacing: '0.03em',
        background: d.danger ? 'rgba(255,107,107,0.16)'
                  : d.primary ? '#ffd34d' : 'rgba(255,255,255,0.08)',
        color: d.danger ? '#ffb3b3' : d.primary ? '#221e1b' : '#ece6da',
        border: d.danger ? '2px solid #ff6b6b' : '1px solid rgba(255,255,255,0.18)',
      }, d.label);
      b.type = 'button';
      b.addEventListener('click', d.on);
      row.appendChild(b);
    }
  },

  /* ── export ─────────────────────────────────────────────────────────────*/

  openExport() {
    const SM = BR.SaveManager;
    const code = SM.exportCode();
    if (!code) {
      // exportCode() verifies its own output and returns null rather than hand
      // over a code that will not decode. Saying nothing would be worse.
      this.say('Could not build a save code');
      return;
    }
    const t = SM.saveTally();
    const self = this;

    const p = this.openPanel('YOUR SAVE CODE',
      'Copy all of it into Bedroom Racers in another browser to bring ' +
      this.tallyWords(t) + ' across. It does not carry your settings — volume, ' +
      'difficulty and the minimap stay with each browser.');
    if (!p) { this.say('Could not open the save code'); return; }

    p.area.value = code;
    p.area.readOnly = true;
    p.area.focus();
    p.area.select();
    // select() leaves the caret at the end, which scrolls the box to the TAIL of
    // the code — the player opens the panel and sees the middle of a string with
    // no BR01 on it. Put it back to the top; the selection survives the scroll.
    p.area.scrollTop = 0;
    this.panelSay('Select it and copy, or press COPY.');

    this.panelButtons([
      { label: 'COPY', primary: true, on: function () {
          self.copyToClipboard(code, function (ok) {
            if (!self.panel) return;
            if (ok) self.panelSay('Copied.', '#7fe06a');
            else self.panelSay('This browser would not let the game reach the ' +
                               'clipboard — select the code above and copy it.',
                               '#ff9d6b');
          });
        } },
      { label: 'DONE', on: function () { self.closePanel(); } },
    ]);
  },

  /* Clipboard, then the old execCommand path, then nothing — and "nothing" is
     survivable because the code is already on screen and selectable. The async
     API needs a secure context and a permission the artifact host controls, so
     it is tried but never relied on. */
  copyToClipboard(text, done) {
    const self = this;
    const nav = window.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      try {
        const pr = nav.clipboard.writeText(text);
        if (pr && pr.then) {
          pr.then(function () { done(true); },
                  function () { done(self.copyLegacy(text)); });
          return;
        }
        done(true);
        return;
      } catch (e) { /* fall through to the legacy path */ }
    }
    done(this.copyLegacy(text));
  },

  copyLegacy(text) {
    try {
      const ta = this.el('textarea',
        { position: 'fixed', left: '-9999px', top: '0', opacity: '0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = !!(document.execCommand && document.execCommand('copy'));
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  },

  /* ── import ─────────────────────────────────────────────────────────────*/

  openImport() {
    const self = this;
    const p = this.openPanel('PASTE A SAVE CODE',
      'Paste the code from your other browser. Nothing on this browser changes ' +
      'until you confirm.');
    if (!p) { this.say('Could not open the save code box'); return; }

    p.area.value = '';
    p.area.readOnly = false;
    p.area.focus();

    this.panelButtons([
      { label: 'CHECK THE CODE', primary: true,
        on: function () { self.checkImport(); } },
      { label: 'CANCEL', on: function () { self.closePanel(); } },
    ]);
  },

  /* Decode ONLY. Nothing is written here — a rejected code must leave both the
     save and the pasted text exactly where they were, so the player can fix a
     truncated paste instead of starting again. */
  checkImport() {
    if (!this.panel) return;
    const SM = BR.SaveManager, self = this;
    const text = this.panel.area.value;

    const res = SM.decodeCode(text);
    if (!res.ok) { this.panelSay(res.reason, '#ff8f8f'); return; }

    const bring = SM.codeTally(res.payload);
    const have = SM.saveTally();

    // Nothing to lose: no confirmation to give. The two-step exists to protect
    // progress, and an empty save has none.
    if (!have.stars && !have.medals && !have.pieces) { this.applyImport(text); return; }

    this.panel.head.textContent = 'REPLACE YOUR PROGRESS?';
    this.panel.note.textContent =
      'That code holds ' + this.tallyWords(bring) + '. ' +
      'This browser has ' + this.tallyWords(have) + ', and all of it — ' +
      'plus every lap record — is replaced. This cannot be undone. ' +
      'Your settings are kept.';
    this.panel.area.readOnly = true;
    this.panelSay('');

    this.panelButtons([
      { label: 'YES, REPLACE IT', danger: true,
        on: function () { self.applyImport(text); } },
      { label: 'KEEP WHAT I HAVE', on: function () { self.closePanel(); } },
    ]);
  },

  applyImport(text) {
    const res = BR.SaveManager.importCode(text);
    if (!res.ok) { this.panelSay(res.reason, '#ff8f8f'); return; }

    // Repair anything the code could not carry: unlocks the current build
    // grants for those stars, and the four vehicle slots.
    BR.ProgressionManager.applyUnlocks();
    BR.Game.refreshPlayerVehicles();

    this.closePanel();
    this.set(this.MENU);
    this.say('Progress restored — ' + this.tallyWords(res.tally));
  },


  /* ── drawing ───────────────────────────────────────────────────────────────
     Every screen is made of BR.Toy (src/ui/HUD.js): plastic, paper, card and
     ink. Nothing here draws a translucent black rectangle any more.

     TWO RULES CONSTRAIN THE WHOLE PASS, and both are older than it:

       - DRAW ORDER IS FOCUS ORDER. Focus is an index into `regions`, rebuilt
         every frame in draw order, so moving a button changes what the D-pad
         reaches next. Nothing below reorders a region; decoration is inserted
         between them, which is invisible to the index.
       - NOTHING PRESSABLE IS ROTATED. A region is an axis-aligned rect at the
         coordinates it was drawn at. Stickers and stamps tilt because they
         carry no region; buttons, rows, tabs and sliders never do.
     ────────────────────────────────────────────────────────────────────────*/

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

    if (this.state === this.MENU)    this.drawMenu(ctx, w, h);
    if (this.state === this.EVENTS)  this.drawEvents(ctx, w, h);
    if (this.state === this.GARAGE)  this.drawGarage(ctx, w, h);
    if (this.state === this.WELCOME) this.drawWelcome(ctx, w, h);
    if (this.state === this.SETTINGS) this.drawSettings(ctx, w, h);
    if (this.state === this.CREDITS) this.drawCredits(ctx, w, h);

    // A note stuck on with tape, which is what a transient message is.
    if (this.toastTime > 0) {
      const T = BR.Toy;
      this.toastTime -= dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTime);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = T.label(13, 700);
      const tw = ctx.measureText(this.toast).width;
      ctx.translate(w / 2, h - 42);
      ctx.rotate(-0.012);
      T.tape(ctx, -(tw / 2 + 16), -14, tw + 32, 28);
      ctx.fillStyle = '#7a2f18';
      ctx.fillText(this.toast, 0, 0);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  },

  /* A chunky moulded button. Hover and keyboard focus are the SAME state and
     the same drawing — the plastic is pushed in and lightened, and the label
     moves down with it, because that is what a pressed button does. No extra
     element is drawn, so the pad highlight cannot drift out of step with the
     pointer one. */
  button(ctx, x, y, w, h, label, action, value, opts) {
    opts = opts || {};
    const T = BR.Toy;
    const i = this.regions.length;
    this.regions.push({ x: x, y: y, w: w, h: h, action: action, value: value });
    const hot = this.hover === i;

    const base = opts.primary ? T.YELLOW : (opts.danger ? T.RED : T.SHELL);
    const col = hot ? T.shade(base, 0.26) : base;
    T.plate(ctx, x, y, w, h, Math.min(9, h / 3), col, { press: hot });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = T.label(opts.small ? 11 : 14, 800);
    const cy = y + h / 2 + (hot ? 1.4 : 0);
    if (opts.primary) {
      // Dark ink on a bright part: a printed label, not a moulded one.
      ctx.fillStyle = T.shade(T.YELLOW, -0.66);
      ctx.fillText(label, x + w / 2, cy);
    } else {
      T.moulded(ctx, label, x + w / 2, cy,
                opts.danger ? '#ffe4dd' : '#f2ead8');
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  /* A screen's name, on a sticker slapped down slightly crooked. `x, y` is the
     top-left of the sticker, as it always was. */
  title(ctx, text, x, y) {
    const T = BR.Toy;
    ctx.save();
    ctx.font = T.label(15, 800);
    const tw = ctx.measureText(text).width;
    T.banner(ctx, text, x + tw / 2 + 13, y + 15,
             { size: 15, padX: 13, padY: 7, fill: T.YELLOW, tilt: -0.022 });
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  // ── pause ────────────────────────────────────────────────────────────────
  /* 11_UI.md: Resume, Restart, Settings, Quit — available at any time,
     including mid-air and during the countdown.

     Quitting lives HERE rather than on a key. Escape used to abandon a race
     outright with no confirmation, which is a lot of lost progress for a
     mistyped key.

     The panel is the control box that came in the set: one moulded shell with
     the buttons let into it. */
  drawPause(ctx, w, h) {
    const T = BR.Toy;
    const cardW = Math.min(380, w - 48);
    /* The lessons row only exists while they are running, which is a first-run
       state and nothing else. It is the KEYBOARD AND PAD route out of them —
       the card's own SKIP button is a pointer and thumb target, and Screens'
       key handler deliberately ignores the keyboard while a race is being
       driven, so without this a pad player could not stop them at all. */
    const coaching = !!(BR.Coach && BR.Coach.active);
    const cardH = 372 + (coaching ? 46 : 0);
    /* Centred, but never above the top edge. On a screen shorter than the card
       — a phone in landscape is 375 — centring puts RESUME off the top, and
       RESUME is the one control here that has to be reachable. Pushed down, the
       display toggles at the bottom are what gets cut instead, and those are
       preferences. */
    const x = (w - cardW) / 2, y = Math.max(4, (h - cardH) / 2);

    ctx.fillStyle = 'rgba(10,8,7,0.72)';
    ctx.fillRect(0, 0, w, h);

    T.plate(ctx, x, y, cardW, cardH, 14, T.SHELL);
    T.banner(ctx, 'PAUSED', w / 2, y + 24,
             { size: 19, padX: 18, padY: 7, fill: T.YELLOW, tilt: -0.018 });

    const bw = cardW - 44, bx = x + 22;
    let by = y + 62;
    this.button(ctx, bx, by, bw, 40, 'RESUME', 'resume', null, { primary: true });
    by += 50;
    this.button(ctx, bx, by, bw, 36, 'RESTART RACE', 'restart', null);
    by += 46;
    this.button(ctx, bx, by, bw, 36, 'QUIT TO EVENTS', 'quitToEvents', null);

    if (coaching) {
      by += 46;
      this.button(ctx, bx, by, bw, 36, 'SKIP THE LESSONS', 'coachSkip', null);
    }

    // ── settings worth reaching mid-race ─────────────────────────────────
    by += 54;
    this.section(ctx, 'SOUND', bx, by - 13);

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
    this.section(ctx, 'DISPLAY', bx, by - 13);

    const halfW = (bw - 8) / 2;
    this.button(ctx, bx, by, halfW, 30,
                'MAP  ' + (BR.MiniMap.size > 0 ? 'ON' : 'OFF'), 'toggleMap', null);
    this.button(ctx, bx + halfW + 8, by, halfW, 30,
                'CORNERS  ' + (BR.CornerHint.size > 0 ? 'ON' : 'OFF'),
                'toggleCorners', null);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = BR.Toy.label(10, 700);
    BR.Toy.moulded(ctx, 'P or START to resume', w / 2, y + cardH - 20,
                   'rgba(240,232,214,0.42)');
    ctx.restore();
    ctx.textAlign = 'left';
  },

  /* A moulded caption on a plastic part — the words screen-printed beside a
     control rather than typed above it. */
  section(ctx, text, x, y) {
    ctx.save();
    ctx.font = BR.Toy.label(9, 800);
    BR.Toy.moulded(ctx, text, x, y, 'rgba(240,232,214,0.50)');
    ctx.restore();
  },

  /* Click-position slider. One interaction, no drag state.

     A channel moulded into the shell with a coloured slug in it. The REGION IS
     UNCHANGED — same rect, same generous vertical slop — because where you
     click is the value and the target has to stay as easy to hit as it was. */
  volSlider(ctx, x, y, w, label, value, key) {
    const T = BR.Toy;
    const labW = 46, barX = x + labW, barW = w - labW, barH = 14;

    ctx.save();
    ctx.font = T.label(10, 700);
    T.moulded(ctx, label, x, y + 2, 'rgba(240,232,214,0.68)');
    ctx.restore();

    const idx = this.regions.length;
    this.regions.push({ x: barX, y: y - 4, w: barW, h: barH + 8,
                        action: 'setvol', value: key });
    const hot = this.hover === idx;

    // The channel, sunk in: dark, with the shadow inside its top edge.
    T.round(ctx, barX, y, barW, barH, 5);
    ctx.fillStyle = T.shade(T.SHELL, -0.42);
    ctx.fill();
    ctx.strokeStyle = T.shade(T.SHELL, -0.62);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (value > 0.001) {
      const slugW = Math.max(8, barW * value);
      const col = hot ? T.shade(T.YELLOW, 0.18) : T.YELLOW;
      T.round(ctx, barX, y, slugW, barH, 5);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(barX + 3, y + 2.6);
      ctx.lineTo(barX + slugW - 3, y + 2.6);
      ctx.strokeStyle = T.shade(col, 0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = T.shade(col, -0.45);
      ctx.lineWidth = 1.2;
      T.round(ctx, barX, y, slugW, barH, 5);
      ctx.stroke();

      if (value > 0.12) {
        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = T.label(9, 800);
        ctx.fillStyle = T.shade(T.YELLOW, -0.60);
        ctx.fillText(Math.round(value * 100) + '%', barX + slugW - 6, y + 3);
        ctx.restore();
      }
    }

    ctx.textAlign = 'left';
    return y + barH + 12;
  },

  // ── main menu ────────────────────────────────────────────────────────────
  drawMenu(ctx, w, h) {
    const T = BR.Toy;
    const P = BR.ProgressionManager;
    const cx = w / 2;

    /* ── the header sits ABOVE the buttons, at every height ────────────────
       It did not. The title block was pinned at h * 0.22 and ran 110px below
       that, while the button stack started at h * 0.44 — and 0.22 + 110/h
       passes 0.44 as soon as h drops under about 500. At 820x420 the solo
       control hint was drawn THROUGH the RACE button; you can read "←" on one
       side of it and "m" on the other.

       Pre-existing, and the same shape of fault as the difficulty overlap
       already recorded here: a layout that mixes a proportional anchor with a
       fixed block cannot hold as the screen shortens. Above about 620 tall
       nothing moves.

       ── THE WHOLE COLUMN IS SOLVED BEFORE ANYTHING IS DRAWN ────────────────
       It used to run the other way: `top` was chosen from the height, and the
       stack was then wedged in underneath whatever was left. That cannot work,
       because the stack is the part with a hard minimum — five controls and
       two captions that physically cannot be closer together — and the header
       is the part that can move. Solving the stack first and hanging the
       header off it is why 812x375 now fits with nothing overlapping and
       nothing sliced, and why 1280x800 is unmoved to the pixel. */
    const HEADER_H = 110;                  // subtitle, tally and hint below it
    const ROW_H = 26;                      // the SETTINGS / CREDITS row
    const BOT_PAD = 8;

    /* Gaps measured from one control's TOP to the next one's. The minimum for
       each is the height of the control it steps over, plus room for the
       moulded caption that sits above the next one where there is one — a
       caption drawn into the bevel of the button above it is the thing a
       render at 812x375 caught. */
    const wantG = [58, 58, 62, 46];
    const minG  = [50, 60, 52, 40];
    let wantSum = 0, minSum = 0;
    for (let i = 0; i < 4; i++) { wantSum += wantG[i]; minSum += minG[i]; }

    /* Anchored at 0.44 of the height, but never lower than the point where the
       stack stops fitting above the bottom edge. */
    let by = Math.min(h * 0.44, h - (minSum + ROW_H + BOT_PAD));
    if (by < HEADER_H + 16) by = HEADER_H + 16;
    const top = Math.min(h * 0.22, Math.max(8, by - 8 - HEADER_H));

    const budget = h - BOT_PAD - ROW_H - by;
    const s = BR.M.clamp((budget - minSum) / (wantSum - minSum), 0, 1);
    const g = [];
    for (let i = 0; i < 4; i++) g.push(minG[i] + (wantG[i] - minG[i]) * s);
    const gButton = g[0], gButton2 = g[1], gSection = g[2];

    /* THE LOGO IS THE BOX FRONT. A wordmark printed on a sticker, tilted,
       because nothing a child owns is aligned.

       It is MEASURED down to fit rather than drawn at a fixed 40px: a sticker
       is wider than the text inside it, and at 375 wide the old bare 40px title
       already had 20px of slack in total. */
    let ts = 40;
    ctx.font = T.label(ts, 800);
    const need = ctx.measureText('BEDROOM RACERS').width + 52;
    if (need > w - 24) ts = Math.max(15, Math.floor(ts * (w - 24) / need));
    T.banner(ctx, 'BEDROOM RACERS', cx, top + ts * 0.4,
             { size: ts, padX: Math.round(ts * 0.55), padY: Math.round(ts * 0.28),
               fill: T.RED, ink: '#fff2dc', tilt: -0.016 });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = T.label(12, 600);
    ctx.fillStyle = 'rgba(240,232,214,0.52)';
    ctx.fillText('The toys race when nobody is watching', cx, top + 52);

    // Progress, with a real star rather than a glyph — the same star the event
    // objectives and the results card use.
    const tally = P.stars() + ' / ' + P.maxStars() + ' STARS      ' +
                  P.piecesFound().length + ' / ' + P.piecesTotal() + ' TOY PIECES';
    ctx.font = T.label(13, 800);
    const tallyW = ctx.measureText(tally).width;
    T.moulded(ctx, tally, cx + 9, top + 80, T.YELLOW);
    T.starSticker(ctx, cx - tallyW / 2, top + 86, 7, true);
    ctx.restore();

    /* The controls, on the front page. In-race the hint fades after a couple of
       seconds, which is right for a countdown and useless to somebody who has
       already forgotten which key drifts — so they are also somewhere you can
       go and look, without a screen to open or a menu to find.

       Multi-player seats are told their own keys under their own half of the
       split screen, so this shows the one-player scheme it belongs to. */
    if (BR.Game.players === 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(10, 600);
      ctx.fillStyle = 'rgba(240,232,214,0.38)';
      // Telling a phone to press SHIFT is worse than saying nothing. The
      // on-screen pads carry their own labels, so touch needs no key list.
      const line = BR.Touch && BR.Touch.capable ? 'ON-SCREEN CONTROLS  ·  tap and hold'
                 : BR.Input.padFor(0) ? BR.Input.PAD_LABEL
                 : BR.Input.LABELS.solo;
      ctx.fillText(line, cx, top + 104);
      ctx.restore();
    }
    ctx.textAlign = 'left';

    /* ── vertical rhythm ──────────────────────────────────────────────────
       The stack STARTS proportionally (h * 0.44) and then advanced in FIXED
       pixels, which cannot hold as the screen shortens: on a phone in landscape
       at 812x375 the difficulty row drew past the bottom edge, so difficulty
       could not be changed at all. Proportional start, fixed gaps — it was
       always going to break somewhere, and a public link put phones in scope.

       The gaps now shrink, but ONLY when they have to: on anything with room
       the scale is 1 and the layout is pixel-for-pixel what it was, so nothing
       that has been looked at on a desktop moves. Button heights are left alone
       because they are touch targets, and shrinking those to win space is how
       a menu becomes unusable on exactly the devices it was shrunk for.

       ── AND IT STILL OVERLAPPED, at both of the sizes this file argues about
       A scale factor with a floor of 0.62 does not say anything about whether
       the parts fit; it only says how hard it tried. Rendering the menu at
       820x420 and at 812x375 with the save-code row still on it showed the row
       drawn THROUGH the bottom of the difficulty tabs at both — 7px at one,
       10px at the other — which is the same defect this document already
       records as fixed, and it is the dangerous direction: hit() takes the
       LAST matching region, so a press aimed at DIFFICULTY armed RESET
       PROGRESS.

       The gaps are now interpolated between what they WANT to be and the
       smallest that keep two parts apart, against the space actually
       available — solved at the top of this function, before the header is
       placed. Nothing can overlap, because the minimum is the height of the
       part above it; nothing can run off the bottom, because the budget is
       measured from the bottom. On anything over about 640 tall the gaps sit
       at their natural values and the desktop layout is unmoved, pixel for
       pixel. */
    const bw = 240, bx = cx - bw / 2;

    this.button(ctx, bx, by, bw, 46, 'RACE', 'goto', this.EVENTS, { primary: true });
    by += gButton;
    this.button(ctx, bx, by, bw, 42, 'GARAGE', 'goto', this.GARAGE);

    // ── players ───────────────────────────────────────────────────────────
    by += gButton2;
    ctx.save();
    ctx.textAlign = 'center';
    this.section(ctx, 'PLAYERS', cx, by - 16);
    ctx.restore();
    ctx.textAlign = 'left';

    const pw = 58, pgap = 6, pn = BR.Game.MAX_PLAYERS;
    for (let i = 1; i <= pn; i++) {
      const px = cx - (pw * pn + pgap * (pn - 1)) / 2 + (i - 1) * (pw + pgap);
      const on = BR.Game.players === i;
      this.tab(ctx, px, by, pw, 34, String(i), 'players', i, on, '#69d0ff');
    }

    if (BR.Game.players > 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(10, 600);
      ctx.fillStyle = 'rgba(240,232,214,0.40)';
      ctx.fillText('Exhibition — no medals, stars or ghosts. Toy pieces still count.',
                   cx, by + 44);
      // The rollover warning only applies to seats actually on the keyboard.
      const pads0 = BR.Input.pads().length;
      const onKeys = Math.max(0, BR.Game.players - pads0);
      if (onKeys > 2) {
        ctx.fillStyle = 'rgba(255,157,107,0.80)';
        ctx.fillText(onKeys + ' drivers on one keyboard can exceed what it reports at once',
                     cx, by + 58);
      }
      ctx.restore();
    }

    // Gamepads claim seats in order, so say which are covered.
    const pads = BR.Input.pads().length;
    if (pads > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(10, 700);
      ctx.fillStyle = '#7fe06a';
      ctx.fillText(pads === 1 ? '1 gamepad connected — player 1'
                              : (pads + ' gamepads connected — players 1 to ' + pads),
                   cx, by + (BR.Game.players > 1 ? 72 : 44));
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // ── difficulty ────────────────────────────────────────────────────────
    // 11_UI.md lists this under accessibility, not options, so it lives where
    // it can be found rather than buried behind a settings screen.
    by += gSection;
    ctx.save();
    ctx.textAlign = 'center';
    this.section(ctx, 'DIFFICULTY', cx, by - 16);
    ctx.restore();
    ctx.textAlign = 'left';

    const cur = BR.SaveManager.get().settings.difficulty;
    const opts = ['easy', 'normal', 'hard'];
    const dw = 78, gap = 5;
    const totalW = dw * 3 + gap * 2;
    for (let i = 0; i < 3; i++) {
      const x = cx - totalW / 2 + i * (dw + gap);
      this.tab(ctx, x, by, dw, 34, opts[i].toUpperCase(), 'difficulty', opts[i],
               opts[i] === cur, T.YELLOW);
    }

    /* ── settings and credits ──────────────────────────────────────────────
       11_UI.md has listed both under "Main menu" since its first draft and
       neither existed. What settings there were lived on the PAUSE card —
       reachable only from inside a race — plus one auto-accelerate toggle on
       an undocumented T key, which is the same as not existing.

       THE SAVE-CODE ROW MOVED IN THERE with them, and that is the point of
       putting this row here rather than adding a fourth one. Copying a code
       out, pasting one in and erasing everything are settings-shelf things, and
       a menu that grows a row per feature is how the 820x420 overlap above
       happened in the first place. The region count no longer depends on
       whether the save has progress in it either, so the menu's focus order is
       the same eleven controls on every save there has ever been.

       Flowed under the difficulty tabs, then pushed to the bottom of the
       screen if there is slack — so a desktop keeps its low, quiet row and a
       short window keeps its buttons whole. */
    const ry = Math.min(Math.max(by + g[3], h - 52), h - BOT_PAD - ROW_H);

    // The blurb, only if there is honestly room for it between the tabs and
    // the row.
    if (by + 56 <= ry - 6) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(11, 600);
      ctx.fillStyle = 'rgba(240,232,214,0.44)';
      ctx.fillText(this.DIFF_BLURB[cur] || '', cx, by + 44);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    const bw2 = 132, bg2 = 8, x0 = cx - (bw2 * 2 + bg2) / 2;
    this.button(ctx, x0, ry, bw2, ROW_H, 'SETTINGS', 'goto', this.SETTINGS,
                { small: true });
    this.button(ctx, x0 + bw2 + bg2, ry, bw2, ROW_H, 'CREDITS', 'goto',
                this.CREDITS, { small: true });

    /* Under the row rather than on top of it. At h - 30 this sat inside the
       bottom row at every window size, including the desktop one — a warning
       drawn through a button is a warning nobody reads. */
    if (!BR.SaveManager.storageOk) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(11, 700);
      ctx.fillStyle = '#ff9d6b';
      ctx.fillText('Storage unavailable — progress will not be saved',
                   cx, Math.min(h - 14, ry + ROW_H + 4));
      ctx.restore();
      ctx.textAlign = 'left';
    }
  },

  /* ══ WELCOME ══════════════════════════════════════════════════════════════
     The first thing a brand new save sees, in place of the menu.

     One question, two answers, and no third state — a first-run screen that
     can be dismissed WITHOUT answering is a first-run screen that comes back,
     and this one must never appear twice. Escape counts as the second answer
     (see back()).

     It is deliberately not a tour, a settings wizard or a name entry. It is
     the smallest possible fork in front of a player who does not yet know
     whether they want to be taught, and the expensive half of it — the lessons
     themselves — is the real first event with a leaflet on it (Coach.js).

     The card is PAPER on a dark screen, not kraft: it is a note that came in
     the box, and the two buttons under it are the only things on screen. */
  drawWelcome(ctx, w, h) {
    const T = BR.Toy;
    const cx = w / 2;
    const cw = Math.min(430, w - 28);
    const x = (w - cw) / 2;
    const ch = 116;

    /* Measured, not assumed: the logo sticker is wider than its text, and the
       block has to be centred as a whole or it drifts down a short screen. */
    let ts = 34;
    ctx.font = T.label(ts, 800);
    const need = ctx.measureText('BEDROOM RACERS').width + 44;
    if (need > w - 24) ts = Math.max(14, Math.floor(ts * (w - 24) / need));
    const logoH = ts + Math.round(ts * 0.28) * 2;

    const blockH = logoH + 18 + ch + 14 + 44 + 10 + 34;
    let y = Math.max(10, (h - blockH) / 2);

    T.banner(ctx, 'BEDROOM RACERS', cx, y + logoH / 2,
             { size: ts, padX: Math.round(ts * 0.55), padY: Math.round(ts * 0.28),
               fill: T.RED, ink: '#fff2dc', tilt: -0.016 });
    y += logoH + 18;

    T.card(ctx, x, y, cw, ch, 8, '#e8ddc3', 'paper');
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = T.label(15, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText('NEW TO THE BOX?', x + 16, y + 14, cw - 32);
    ctx.font = T.label(12, 600);
    ctx.fillStyle = 'rgba(44,34,25,0.76)';
    ctx.fillText('The first race can show you what the buttons are for,',
                 x + 16, y + 40, cw - 32);
    ctx.fillText('one at a time, as the rug asks for them.',
                 x + 16, y + 58, cw - 32);
    ctx.fillStyle = 'rgba(44,34,25,0.55)';
    ctx.fillText('It is a real event. Real rivals, real stars, and you can',
                 x + 16, y + 80, cw - 32);
    ctx.fillText('stop the lessons whenever you like.', x + 16, y + 94, cw - 32);
    ctx.restore();
    y += ch + 14;

    const bw = Math.min(260, cw);
    this.button(ctx, cx - bw / 2, y, bw, 44, 'SHOW ME HOW', 'coachStart', null,
                { primary: true });
    y += 54;
    this.button(ctx, cx - bw / 2, y, bw, 34, 'I WILL WORK IT OUT',
                'coachDecline', null, { small: true });
  },

  /* ══ SETTINGS ═════════════════════════════════════════════════════════════
     11_UI.md listed this on the main menu from the first draft and it was
     never built. Everything it holds already existed and none of it could be
     found: the volumes and the display toggles were on the PAUSE card, which
     means inside a race; auto-accelerate was on the T key and written down
     nowhere; the save codes and RESET PROGRESS were a row of small buttons on
     the menu that also overlapped the difficulty tabs on a short screen.

     ── TWO SHAPES, AND THE SHORT ONE IS NOT A SQUASHED TALL ONE ──────────────
     The same conclusion the event rows reached. One column reads better and is
     what a phone in portrait gets, because a portrait phone has height to
     spare. A screen too short for the column — a laptop window, a phone in
     landscape — gets two columns rather than shrunk controls, because these
     are touch targets and the one thing that must not shrink is the thing you
     are aiming at.

     The threshold is measured, not guessed: the single column needs about 470
     pixels of height including the BACK button, so that is where it switches.

     DIFFICULTY IS NOT HERE. It stays on the menu, where 11_UI.md put it under
     accessibility rather than options — it changes what a medal is worth, and
     it belongs next to the RACE button rather than behind another press. */
  drawSettings(ctx, w, h) {
    const T = BR.Toy;
    const roomy = h >= 470;
    const two = !roomy && w >= 460;
    const panelW = Math.min(two ? 600 : 380, w - 32);
    const x = (w - panelW) / 2;
    const top = Math.max(18, h * 0.07);

    this.title(ctx, 'SETTINGS', x, top);

    const colW = two ? Math.floor((panelW - 20) / 2) : panelW;
    const colBX = two ? x + colW + 20 : x;
    const cy0 = top + 46;

    // ── column one: what you hear, and how the car answers ────────────────
    let y = cy0;
    this.section(ctx, 'SOUND', x, y - 13);
    y = this.volSlider(ctx, x, y, colW, 'SFX', BR.Audio.sfxVolume, 'sfx');
    y = this.volSlider(ctx, x, y, colW, 'MUSIC', BR.Audio.musicVolume, 'music');

    y += 20;
    this.section(ctx, 'DRIVING', x, y - 13);
    this.button(ctx, x, y, colW, 30, 'AUTO-ACCELERATE  ' +
                (BR.Input.autoAccelerate ? 'ON' : 'OFF'), 'autoAccel', null);
    y += 36;

    /* ── accessibility ─────────────────────────────────────────────────────
       11_UI.md calls these "not optional, and not deferred", and several
       load-bearing for the 8+ audience. Two of the list are here now.

       Camera rotation matters most: the chase camera turns the entire world
       around the car, which that doc names as a known motion-sickness trigger
       and harder for younger players to read. Colour marks matter more in this
       game than in most, because every car is NAMED for its colour. */
    const camRot = (function () {
      const s = BR.SaveManager.get().settings.cameraRotation;
      return s === undefined ? 1 : s;
    })();
    this.button(ctx, x, y, colW, 30, 'CAMERA ROTATION  ' +
                (camRot === 1 ? 'FULL' : camRot === 0.5 ? 'REDUCED' : 'FIXED'),
                'camRot', null);
    y += 36;
    this.button(ctx, x, y, colW, 30, 'SHAPES ON THE MAP  ' +
                (BR.SaveManager.get().settings.markShapes ? 'ON' : 'OFF'),
                'markShapes', null);
    y += 36;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = T.label(10, 600);
    ctx.fillStyle = 'rgba(240,232,214,0.40)';
    ctx.fillText('On by default. The T key does the same thing mid-race.',
                 x, y, colW);
    /* The control line, in one more place you can go and look. In-race it
       fades after a couple of seconds, which is right for a countdown and no
       use at all to somebody who has forgotten which key drifts. */
    const line = BR.Touch && BR.Touch.capable
      ? 'ON-SCREEN CONTROLS  ·  tap and hold'
      : (BR.Input.padFor(0) ? BR.Input.PAD_LABEL : BR.Input.LABELS.solo);
    ctx.fillStyle = 'rgba(240,232,214,0.55)';
    ctx.font = T.label(10, 700);
    ctx.fillText(line, x, y + 17, colW);
    ctx.restore();
    y += 38;
    const colABottom = y;

    // ── column two: what you see, the lessons, and the save ───────────────
    y = two ? cy0 : colABottom + 26;
    this.section(ctx, 'DISPLAY', colBX, y - 13);
    const halfW = (colW - 8) / 2;
    this.button(ctx, colBX, y, halfW, 30,
                'MAP  ' + (BR.MiniMap.size > 0 ? 'ON' : 'OFF'), 'toggleMap', null);
    this.button(ctx, colBX + halfW + 8, y, halfW, 30,
                'CORNERS  ' + (BR.CornerHint.size > 0 ? 'ON' : 'OFF'),
                'toggleCorners', null);
    y += 50;

    this.section(ctx, 'LEARNING', colBX, y - 13);
    this.button(ctx, colBX, y, colW, 30, 'SHOW THE LESSONS AGAIN',
                'coachStart', null);
    y += 50;

    /* ── save codes and reset progress, moved here from the menu ───────────
       15_Save_System.md open questions 2 and 4. Findable, not inviting — the
       same intent as before, in the place a player now goes looking for it.

       COUNTED THROUGH SaveManager.saveTally(), not by walking the events map:
       eventRecord() CREATES a {medal:'none'} row for every event the list
       draws, and 'none' is truthy, so counting medals here gave a fresh save
       eighteen of them and offered to erase them.

       USE A SAVE CODE is always here, including on an empty save — a brand new
       browser is exactly where somebody needs to bring progress IN, and it is
       the one case where importing destroys nothing. */
    const t = BR.SaveManager.saveTally();
    const hasProgress = t.stars > 0 || t.medals > 0 || t.pieces > 0;

    this.section(ctx, 'SAVE', colBX, y - 13);
    if (hasProgress) {
      this.button(ctx, colBX, y, halfW, 26, 'COPY MY CODE', 'saveExport', null,
                  { small: true });
      this.button(ctx, colBX + halfW + 8, y, halfW, 26, 'USE A CODE',
                  'saveImport', null, { small: true });
      y += 32;
      this.button(ctx, colBX, y, colW, 26, 'RESET PROGRESS', 'resetArm', null,
                  { small: true });
      y += 32;
    } else {
      this.button(ctx, colBX, y, colW, 26, 'USE A SAVE CODE', 'saveImport',
                  null, { small: true });
      y += 32;
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = T.label(10, 600);
    ctx.fillStyle = 'rgba(240,232,214,0.34)';
    ctx.fillText('A save code moves progress to another browser.', colBX, y,
                 colW);
    ctx.restore();

    const contentBottom = Math.max(colABottom, y + 16);
    const by = Math.min(contentBottom + 18, h - 44);
    this.button(ctx, x, by, 120, 36, '← BACK', 'goto', this.MENU);

    if (!BR.SaveManager.storageOk) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = T.label(11, 700);
      ctx.fillStyle = '#ff9d6b';
      ctx.fillText('Storage unavailable — nothing here is being saved',
                   x + panelW, by + 12);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // Drawn over the top, last, so its two buttons win the hit test — the same
    // arrangement the menu used when the reset lived there.
    if (hasProgress && this.resetArmed) this.drawResetConfirm(ctx, w, h, t);
  },

  /* ══ CREDITS ══════════════════════════════════════════════════════════════
     Short, and in the game's own voice rather than a film crawl. A game about
     toys in a bedroom should not credit itself like a studio picture. */
  drawCredits(ctx, w, h) {
    const T = BR.Toy;
    const cx = w / 2;
    const cw = Math.min(430, w - 28);
    const x = (w - cw) / 2;
    const ch = 190;
    const y = Math.max(52, (h - ch) / 2 - 10);

    this.title(ctx, 'CREDITS', x, Math.max(14, y - 46));

    T.card(ctx, x, y, cw, ch, 8, '#e8ddc3', 'paper');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = T.label(17, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText('BEDROOM RACERS', cx, y + 16, cw - 32);

    ctx.font = T.label(12, 700);
    ctx.fillStyle = 'rgba(44,34,25,0.80)';
    ctx.fillText('Made by Dumb-Tony, with Claude.', cx, y + 44, cw - 32);

    ctx.font = T.label(11, 600);
    ctx.fillStyle = 'rgba(44,34,25,0.62)';
    ctx.fillText('No engine, no toolchain, no build step —', cx, y + 74, cw - 32);
    ctx.fillText('scripts in a page and a canvas to draw on.', cx, y + 90, cw - 32);
    /* COUNTED, NOT WRITTEN DOWN. This read "Twelve tracks, six worlds,
       twenty-six events" as literal text — true the day it was typed, and
       exactly the kind of line that quietly stops being true. The published
       page header had already drifted the same way twice, still advertising
       eight tracks and four worlds long after there were ten and five. A
       credits screen that lies about its own game is worse than one that says
       nothing. */
    const nTracks = Object.keys(BR.TRACKS || {}).length;
    const nEvents = (BR.EVENTS || []).length;
    const seenWorlds = {};
    for (const tid in (BR.TRACKS || {})) {
      const w = BR.TRACKS[tid] && BR.TRACKS[tid].world;
      if (w) seenWorlds[w] = 1;
    }
    /* +1 because Bedside Boulevard carries world 'town-rug' while the project
       has always counted it as a place of its own — 11_UI.md and 18_Roadmap.md
       both describe the pre-kitchen game as "fourteen events across four
       worlds" when there were three `world` values. */
    const nWorlds = Object.keys(seenWorlds).length + 1;
    ctx.fillText(nTracks + ' tracks, ' + nWorlds + ' worlds, ' + nEvents +
                 ' events,', cx, y + 112, cw - 32);
    ctx.fillText('and a rug that does not forgive.', cx, y + 128, cw - 32);
    ctx.restore();

    // The tagline gets the sticker, because it is the one line that is the
    // game rather than about it.
    T.banner(ctx, 'The toys race when nobody is watching', cx, y + ch - 22,
             { size: 11, padX: 12, padY: 6, fill: T.YELLOW, tilt: -0.02 });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const by = Math.min(Math.max(y + ch + 16, h - 52), h - 44);
    this.button(ctx, x, by, 120, 36, '← BACK', 'goto', this.MENU);
  },

  /* ── the armed reset ──────────────────────────────────────────────────────
     A warning plate in the middle of the screen, NOT a row pinned to the
     bottom of the menu.

     It was inline, and inline could not be made to fit. The armed state needs
     two lines of explanation and two buttons — about 60px — below a difficulty
     row that already ends at 375 on a 420-tall screen. Every arrangement of it
     either sat on the difficulty tabs (which is how a press aimed at DIFFICULTY
     came to arm a save wipe) or ran off the bottom edge. Centred, it fits at
     every size there is, and a confirmation that destroys everything is a thing
     that ought to stop the screen anyway.

     It pushes the SAME two regions in the same order as the row it replaces, so
     nothing about keyboard focus changes: the destructive one first, the way
     out second.

     The confirm names the actual numbers rather than asking "are you sure" — a
     player who has forgotten they have 14 stars deserves to be told before they
     press it, not after. */
  drawResetConfirm(ctx, w, h, t) {
    const T = BR.Toy;
    const cw = Math.min(380, w - 32), ch = 132;
    const x = (w - cw) / 2, y = Math.max(8, (h - ch) / 2);

    ctx.fillStyle = 'rgba(10,8,7,0.66)';
    ctx.fillRect(0, 0, w, h);
    T.plate(ctx, x, y, cw, ch, 12, '#7d2b25');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = T.label(12, 800);
    T.moulded(ctx, 'Erase ' + this.tallyWords(t) + ' and', w / 2, y + 20, '#ffd9d2');
    T.moulded(ctx, 'every lap record?', w / 2, y + 36, '#ffd9d2');
    ctx.font = T.label(10, 600);
    T.moulded(ctx, 'This cannot be undone. Settings are kept.',
              w / 2, y + 58, 'rgba(255,226,220,0.72)');
    ctx.restore();
    ctx.textAlign = 'left';

    const bw = Math.min(160, (cw - 36) / 2);
    this.button(ctx, w / 2 - bw - 6, y + ch - 44, bw, 30, 'YES, ERASE IT ALL',
                'resetConfirm', null, { small: true, danger: true });
    this.button(ctx, w / 2 + 6, y + ch - 44, bw, 30, 'KEEP MY PROGRESS',
                'goto', this.SETTINGS, { small: true });
  },

  /* A latching tab — one of a row where exactly one is down. The chosen one is
     PUSHED IN and wears its colour; the others stand proud in plain shell. That
     is a second channel on top of the colour, which 11_UI.md requires of every
     indicator.

     It registers its region in the same place and the same order the old
     inline loops did. */
  tab(ctx, x, y, w, h, label, action, value, on, colour) {
    const T = BR.Toy;
    const idx = this.regions.length;
    this.regions.push({ x: x, y: y, w: w, h: h, action: action, value: value });
    const hot = this.hover === idx;

    const base = on ? colour : T.SHELL;
    T.plate(ctx, x, y, w, h, 7, hot ? T.shade(base, 0.18) : base,
            { press: on || hot });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = T.label(11, 800);
    if (on) {
      ctx.fillStyle = T.shade(base, -0.66);
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    } else {
      T.moulded(ctx, label, x + w / 2, y + h / 2 + (hot ? 1.4 : 0),
                'rgba(240,232,214,0.78)');
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  // ── event map ────────────────────────────────────────────────────────────
  /* THE EVENTS LIVE IN THE BOX LID. A shallow tray of kraft board with the
     printed event cards laid out in it, which is where a set of tracks would
     actually be.

     The lid is drawn BEFORE the title and before any row, and it registers
     nothing — so the region order is untouched and a pad still walks the list
     in exactly the same sequence. */
  drawEvents(ctx, w, h) {
    const T = BR.Toy;
    const P = BR.ProgressionManager;
    const cardW = Math.min(560, w - 48);
    const x = (w - cardW) / 2;
    const top = Math.max(24, h * 0.10);

    /* ── two row shapes, and the narrow one is not a squashed wide one ─────
       At 375 wide the card is 327 across and the RACE button owns the right
       106 of it, so the blurb and the second column of objectives were drawn
       straight THROUGH the button. (The old layout was worse and quieter about
       it: the second objective column was pinned at a fixed +250, which on a
       327-wide card is off the card entirely.)

       Condensing the text to fit is the obvious fix and a bad one — a blurb
       squeezed to half width is present and unreadable. So a narrow card gets
       a taller row and stacks instead: one objective column, and the RACE
       button full width along the bottom, which is a better phone target
       anyway. Every event has exactly three objectives, so the tall row is
       sized for three and cannot be outgrown by content.

       maxWidth is still passed on every string as a backstop. It is the
       difference between ugly and wrong. */
    const narrow = cardW < 520;
    const rowH = narrow ? 142 : 92, rowGap = 12, rowStep = rowH + rowGap;
    const listTop = top + 46;
    const listBottom = h - 62;

    /* The lid: board, with a rim standing up around the inside.

       It reaches down to the BACK button rather than stopping at the list,
       because everything below the band — BACK and the scroll prompt — is
       drawn there, and a dark-ink prompt on a dark backdrop is a prompt nobody
       reads. The lid is what makes the ink legible; ending it early left the
       prompt hanging off the board. */
    const lx = x - 20, lw = cardW + 48;
    const ly = top - 16, lh = (h - 8) - ly;
    T.card(ctx, lx, ly, lw, lh, 10);
    ctx.strokeStyle = 'rgba(70,46,22,0.30)';
    ctx.lineWidth = 1.4;
    T.round(ctx, lx + 8, ly + 8, lw - 16, lh - 16, 7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,205,0.22)';
    ctx.lineWidth = 1.2;
    T.round(ctx, lx + 9.5, ly + 9.5, lw - 19, lh - 19, 7);
    ctx.stroke();

    this.title(ctx, 'CHOOSE AN EVENT', x, top);

    // Difficulty is shown here too — it changes what a medal is worth, so it
    // should not be something you have to go back to the menu to remember.
    const diff = BR.SaveManager.get().settings.difficulty;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = T.label(11, 800);
    // Written straight on the board, so it has to be INK-dark: kraft is a
    // mid-tone, and the dim greys this used on a black panel disappear on it.
    ctx.fillStyle = diff === 'hard' ? '#7c2409'
                  : (diff === 'easy' ? '#11543d' : '#463014');
    ctx.fillText(diff.toUpperCase(), x + cardW, top + 9);
    if (diff === 'easy') {
      ctx.font = T.label(9, 700);
      ctx.fillStyle = 'rgba(50,34,14,0.80)';
      ctx.fillText('no platinum on easy', x + cardW, top + 24);
    }
    ctx.restore();
    ctx.textAlign = 'left';

    /* ── the scrolling viewport ────────────────────────────────────────────
       Rows are laid out from listTop and shifted up by eventScroll, then
       clipped. The BACK button sits below the band so it never scrolls away. */
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

    let y = listTop - this.eventScroll;

    for (let i = 0; i < BR.EVENTS.length; i++) {
      // Skip rows entirely outside the band. Not just a saving: a button drawn
      // off-band would still register a hit region and be clickable.
      if (y + rowH < listTop - 4 || y > listBottom + 4) { y += rowStep; continue; }
      const ev = BR.EVENTS[i];
      const rec = P.eventRecord(ev.id);
      const open = P.isEventUnlocked(ev);

      // A printed card. Locked ones are the same card in a duller stock, so
      // what is coming is visible rather than hidden (11_UI.md).
      T.card(ctx, x, y, cardW, rowH, 8,
             open ? '#e8ddc3' : '#a89e88', 'paper');

      const ink  = open ? T.INK : 'rgba(38,30,22,0.52)';
      const dim  = open ? 'rgba(44,34,25,0.62)' : 'rgba(38,30,22,0.42)';

      T.medal(ctx, x + 34, y + 32, 15, P.medalColour(rec.medal),
              rec.medal === 'none' ? '' : rec.medal.charAt(0).toUpperCase());

      // Where the text is allowed to end: the whole card on a stacked row, and
      // short of the RACE button on a wide one.
      const tx = x + 60;
      const textW = (narrow ? x + cardW - 16 : x + cardW - 114) - tx;

      ctx.save();
      ctx.textBaseline = 'top';
      ctx.font = T.label(16, 800);
      ctx.fillStyle = ink;
      ctx.fillText(ev.name, tx, y + 14, textW);

      ctx.font = T.label(11, 600);
      ctx.fillStyle = dim;
      ctx.fillText(ev.blurb, tx, y + 37, textW);

      // Objectives, always visible before the race — a real star each, gold
      // when it has been done.
      ctx.font = T.label(10, 700);
      const cols = narrow ? 1 : 2;
      const colW = textW / cols;
      for (let k = 0; k < ev.objectives.length; k++) {
        const o = ev.objectives[k];
        const got = rec.objectives.indexOf(o.id) !== -1;
        const ox = tx + (k % cols) * colW;
        const oy = y + 60 + Math.floor(k / cols) * 15;
        T.starSticker(ctx, ox + 5, oy + 5, 5.5, got);
        ctx.fillStyle = got ? '#6b4a08' : dim;
        ctx.fillText(o.label, ox + 15, oy, colW - 18);
      }
      ctx.restore();

      if (narrow) {
        // Full width along the bottom of the row: on a phone this is the only
        // thing on the card anyone is aiming a thumb at.
        if (open) {
          this.button(ctx, x + 16, y + rowH - 40, cardW - 32, 32, 'RACE',
                      'start', ev.id, { primary: true });
        } else {
          this.button(ctx, x + 16, y + rowH - 40, cardW - 32, 32,
                      'NEEDS ' + ev.unlockStars + ' STARS', 'locked',
                      ev.unlockStars, { small: true });
        }
      } else if (open) {
        this.button(ctx, x + cardW - 106, y + 28, 88, 36, 'RACE', 'start', ev.id,
                    { primary: true });
      } else {
        this.button(ctx, x + cardW - 118, y + 28, 100, 36,
                    'NEEDS ' + ev.unlockStars + ' STARS', 'locked', ev.unlockStars,
                    { small: true });
      }

      y += rowStep;
    }

    ctx.restore();

    /* Scrollbar. Not decoration — with the list clipped there is otherwise
       nothing on screen to say that anything follows the sixth event, which is
       exactly how a whole world went missing. */
    if (this.eventScrollMax > 0) {
      const trackX = x + cardW + 10;
      T.round(ctx, trackX, listTop, 6, listH, 3);
      ctx.fillStyle = 'rgba(70,46,22,0.34)';
      ctx.fill();

      const thumbH = Math.max(34, listH * (listH / contentH));
      const thumbY = listTop +
        (listH - thumbH) * (this.eventScroll / this.eventScrollMax);
      T.plate(ctx, trackX - 1, thumbY, 8, thumbH, 4, T.YELLOW, { shadow: false });

      /* And say it in words, once, for anyone who has not spotted the bar.

         On the BACK button's own line, right-aligned, rather than centred just
         under the list: centred, it was sliced through by the BACK button at
         every width, because the button is pinned 14px lower and the two were
         laid out without reference to each other. */
      if (this.eventScroll < 4) {
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = T.label(11, 800);
        ctx.fillStyle = '#3d2708';
        ctx.fillText('SCROLL FOR MORE  ↓', x + cardW, h - 30);
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
    }

    this.button(ctx, x, h - 48, 120, 36, '← BACK', 'goto', this.MENU);
  },

  // ── garage ───────────────────────────────────────────────────────────────
  /* Cars on their backing cards, under a blister. It is a toy shelf or a
     carrying case in 09_Vehicles.md, and a blister pack is the version of that
     which also says, without a word, that a locked car is one you have not
     opened yet. */
  drawGarage(ctx, w, h) {
    const T = BR.Toy;
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
        this.tab(ctx, tx, y - 2, tw, 30, 'P' + s, 'slot', s,
                 this.garageSlot === s, this.SLOT_COLOUR[s]);
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

      // The pack a seat is holding sits on a coloured plastic tray, so both
      // players' picks are legible at a glance.
      if (heldBy) {
        T.plate(ctx, cx2 - 4, cy2 - 4, colW + 8, 154, 10,
                this.SLOT_COLOUR[heldBy], { shadow: false });
      }
      T.card(ctx, cx2, cy2, colW, 146, 8,
             owned ? '#e8ddc3' : '#a89e88', 'paper');

      if (heldBy) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = T.label(10, 800);
        T.sticker(ctx, cx2 + colW - 34, cy2 + 8, 26, 17,
                  this.SLOT_COLOUR[heldBy], 3);
        ctx.fillStyle = T.shade(this.SLOT_COLOUR[heldBy], -0.62);
        ctx.fillText('P' + heldBy, cx2 + colW - 21, cy2 + 17);
        ctx.restore();
      }

      // ── the car, under a blister ─────────────────────────────────────
      const bx = cx2 + colW / 2, by2 = cy2 + 40;
      ctx.save();
      ctx.translate(bx, by2);
      if (owned) {
        // A moulded shell in the car's own two tints, the way the renderer
        // paints it: body, darker roof, dark outline.
        T.round(ctx, -24, -13, 48, 26, 6);
        ctx.fillStyle = spec.colorBody;
        ctx.fill();
        ctx.strokeStyle = T.shade(spec.colorBody, -0.55);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        T.round(ctx, -12, -9, 22, 18, 4);
        ctx.fillStyle = spec.colorTop;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-20, -9.5); ctx.lineTo(20, -9.5);
        ctx.strokeStyle = T.shade(spec.colorBody, 0.42);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        T.round(ctx, -24, -13, 48, 26, 6);
        ctx.fillStyle = 'rgba(40,32,22,0.20)';
        ctx.fill();
      }
      // The bubble: a clear dome with a rim and one diagonal catch.
      T.round(ctx, -33, -24, 66, 48, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-27, 14); ctx.lineTo(-6, -19);
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(13, 800);
      ctx.fillStyle = owned ? T.INK : 'rgba(38,30,22,0.50)';
      ctx.fillText(owned ? spec.name : '???', cx2 + colW / 2, cy2 + 66);
      ctx.restore();
      ctx.textAlign = 'left';

      if (owned) {
        this.stat(ctx, cx2 + 14, cy2 + 88, colW - 28, 'SPD', spec.maxSpeed / 420);
        this.stat(ctx, cx2 + 14, cy2 + 102, colW - 28, 'ACC', spec.acceleration / 210);
        this.stat(ctx, cx2 + 14, cy2 + 116, colW - 28, 'HND', spec.handling);
        this.stat(ctx, cx2 + 14, cy2 + 130, colW - 28, 'WGT', spec.weight / 1.5);
        this.regions.push({ x: cx2, y: cy2, w: colW, h: 146,
                            action: 'pick', value: id });
      } else {
        const u = P.unlockFor(id);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b4a08';
        if (u && u.pieces === 'all') {
          ctx.font = T.label(11, 800);
          ctx.fillText('FIND EVERY', cx2 + colW / 2, cy2 + 94);
          ctx.fillText('TOY PIECE', cx2 + colW / 2, cy2 + 108);
          ctx.font = T.label(10, 600);
          ctx.fillStyle = 'rgba(44,34,25,0.60)';
          ctx.fillText(P.piecesFound().length + ' / ' + P.piecesTotal(),
                       cx2 + colW / 2, cy2 + 124);
        } else {
          ctx.font = T.label(11, 800);
          T.starSticker(ctx, cx2 + colW / 2 - 24, cy2 + 105, 7, true);
          ctx.textAlign = 'left';
          ctx.fillText((u ? u.stars : '?') + ' TO UNLOCK', cx2 + colW / 2 - 14,
                       cy2 + 99);
        }
        ctx.restore();
        ctx.textAlign = 'left';
        this.regions.push({ x: cx2, y: cy2, w: colW, h: 146,
                            action: 'pick', value: id });
      }
    }

    const rows = Math.ceil(ids.length / 3);
    const by = y + rows * 156 + 6;
    ctx.save();
    ctx.font = T.label(11, 600);
    ctx.fillStyle = 'rgba(240,232,214,0.50)';
    ctx.fillText(BR.VEHICLES[selected].description, x + 132, by + 12);
    if (twoUp) {
      ctx.font = T.label(10, 600);
      ctx.fillStyle = 'rgba(240,232,214,0.34)';
      ctx.fillText('Picking a car the other player holds swaps them',
                   x + 132, by + 28);
    }
    ctx.restore();
    this.button(ctx, x, by, 120, 36, '← BACK', 'goto', this.MENU);
  },

  /* A stat, as a channel with a slug in it — the same moulded parts the volume
     sliders and the boost meter are made of, so a bar means the same thing
     everywhere in the game. */
  stat(ctx, x, y, w, label, frac) {
    const T = BR.Toy;
    ctx.save();
    ctx.font = T.label(9, 800);
    ctx.fillStyle = 'rgba(44,34,25,0.66)';
    ctx.fillText(label, x, y);
    ctx.restore();

    const bx = x + 28, bw = w - 28;
    T.round(ctx, bx, y, bw, 8, 4);
    ctx.fillStyle = 'rgba(44,34,25,0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,34,25,0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const fw = Math.max(3, bw * Math.min(1, frac));
    T.round(ctx, bx, y, fw, 8, 4);
    ctx.fillStyle = '#2e9c78';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + 2, y + 2.2); ctx.lineTo(bx + fw - 2, y + 2.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  },

  round(ctx, x, y, w, h, r) { BR.Toy.round(ctx, x, y, w, h, r); },
};
