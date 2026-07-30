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
      const p = self.local(e);
      const i = self.hit(p.x, p.y);
      if (i >= 0) self.dispatch(self.regions[i]);
    });
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

  set(s) { this.state = s; this.regions = []; this.hover = -1; },

  say(msg) { this.toast = msg; this.toastTime = 2.6; },

  dispatch(r) {
    const G = BR.Game, P = BR.ProgressionManager;
    BR.Audio.resume();

    switch (r.action) {
      case 'goto':    this.set(r.value); break;
      case 'start':   G.startEvent(BR.eventById(r.value)); break;
      case 'pick':
        if (P.selectVehicle(r.value)) { BR.Audio.checkpoint(); }
        else { this.say(this.lockLabel(P.unlockFor(r.value))); }
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
    if (this.state === this.RACE) return;
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
      : (hot ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)');
    this.round(ctx, x, y, w, h, 8);
    ctx.fill();
    if (!opts.primary) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 13px ui-monospace, Consolas, monospace';
    ctx.fillStyle = opts.primary ? '#221e1b' : '#ece6da';
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

    const pw = 118, pgap = 6;
    for (let i = 1; i <= 2; i++) {
      const px = cx - (pw * 2 + pgap) / 2 + (i - 1) * (pw + pgap);
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
      ctx.fillText(i === 1 ? 'ONE' : 'TWO — SPLIT SCREEN', px + pw / 2, by + 13);
      ctx.textAlign = 'left';
    }

    if (BR.Game.players === 2) {
      ctx.textAlign = 'center';
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText('Two up is an exhibition — no stars, medals or ghosts',
                   cx, by + 44);
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

    for (let i = 0; i < BR.EVENTS.length; i++) {
      const ev = BR.EVENTS[i];
      const rec = P.eventRecord(ev.id);
      const open = P.isEventUnlocked(ev);
      const rowH = 92;

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

      y += rowH + 12;
    }

    this.button(ctx, x, y + 6, 120, 36, '← BACK', 'goto', this.MENU);
  },

  // ── garage ───────────────────────────────────────────────────────────────
  drawGarage(ctx, w, h) {
    const P = BR.ProgressionManager;
    const ids = Object.keys(BR.VEHICLES);
    const cardW = Math.min(620, w - 48);
    const x = (w - cardW) / 2;
    let y = Math.max(24, h * 0.09);

    this.title(ctx, 'GARAGE', x, y);
    y += 44;

    const colW = Math.floor((cardW - 16) / 3);
    const selected = P.selectedVehicle();

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const spec = BR.VEHICLES[id];
      const owned = P.isVehicleOwned(id);
      const col = i % 3, row = Math.floor(i / 3);
      const cx2 = x + col * (colW + 8);
      const cy2 = y + row * 156;

      ctx.fillStyle = id === selected ? 'rgba(255,211,77,0.12)' : 'rgba(25,22,20,0.9)';
      this.round(ctx, cx2, cy2, colW, 146, 10);
      ctx.fill();
      ctx.strokeStyle = id === selected ? '#ffd34d' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = id === selected ? 2 : 1;
      ctx.stroke();

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
