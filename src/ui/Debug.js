/* =============================================================================
   DEBUG PANEL — Phase 1 tooling. Delete before Phase 3.
   =============================================================================
   Phase 1's entire purpose is finding tuning values by feel, and the most
   important of them (groundTilt) blocks all vehicle art and track authoring.
   Editing a file and reloading is far too slow a loop for that, so every
   constant that matters is a live slider.

   "Copy tuning" dumps the current values as pasteable JS, because
   17_Claude_Rules.md requires settled values to go back into
   GAME_BIBLE/03_Driving_Physics.md rather than living only in code.

   THIS MODULE INJECTS ITS OWN CSS. That is deliberate. The styles used to live
   in index.html, which meant the bundled single-file build (tools/build-
   artifact.sh) shipped the panel completely unstyled — it rendered as a plain
   block at the bottom of the page instead of floating over the canvas. Owning
   its own styles means the panel cannot drift from whatever page hosts it.
   ========================================================================== */

window.BR = window.BR || {};

BR.Debug = {

  el: null,
  btn: null,
  readouts: null,
  visible: true,
  fpsAcc: 0, fpsFrames: 0, fps: 0,

  /* [label, object, key, min, max, step, hint] */
  sliders: null,

  CSS: [
    '#dbg-toggle{position:fixed;top:10px;right:10px;z-index:1000;',
    '  padding:7px 12px;background:rgba(18,16,14,0.92);color:#ffd34d;',
    '  border:1px solid rgba(255,255,255,0.18);border-radius:7px;',
    '  font:600 11px/1 ui-monospace,Consolas,monospace;letter-spacing:0.08em;',
    '  cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}',
    '#dbg-toggle:hover{background:rgba(40,36,32,0.95);}',
    '#dbg-toggle:focus-visible{outline:2px solid #ffd34d;outline-offset:2px;}',

    '#debug{position:fixed;top:48px;right:10px;z-index:999;',
    '  width:min(288px,calc(100vw - 20px));max-height:calc(100% - 60px);',
    '  overflow-y:auto;background:rgba(18,16,14,0.92);',
    '  border:1px solid rgba(255,255,255,0.10);border-radius:10px;',
    '  padding:10px 12px 12px;color:#e8e2d8;',
    '  font:11px/1.5 ui-monospace,"Cascadia Mono",Consolas,monospace;',
    '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    '  -webkit-user-select:none;user-select:none;}',
    '#debug::-webkit-scrollbar{width:8px;}',
    '#debug::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.16);border-radius:4px;}',

    '#debug .dbg-head{display:flex;justify-content:space-between;align-items:baseline;',
    '  padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.10);}',
    '#debug .dbg-head strong{font-size:11px;letter-spacing:0.06em;color:#ffd34d;}',
    '#debug .dbg-head span{font-size:10px;color:rgba(255,255,255,0.40);}',

    '#debug .dbg-readouts{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;',
    '  margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.04);',
    '  border-radius:6px;font-size:11px;}',
    '#debug .dbg-readouts span{display:flex;justify-content:space-between;}',
    '#debug .dbg-readouts i{font-style:normal;color:rgba(255,255,255,0.42);}',

    '#debug .dbg-section{margin:12px 0 5px;padding-top:8px;',
    '  border-top:1px solid rgba(255,255,255,0.08);font-size:9.5px;',
    '  letter-spacing:0.10em;color:rgba(255,255,255,0.45);text-transform:uppercase;}',
    '#debug .dbg-section:first-of-type{border-top:none;margin-top:4px;}',

    '#debug .dbg-row{display:grid;grid-template-columns:1fr auto;gap:0 6px;',
    '  margin-bottom:7px;cursor:help;}',
    '#debug .dbg-row label{color:rgba(255,255,255,0.78);}',
    '#debug .dbg-val{color:#ffd34d;font-variant-numeric:tabular-nums;}',
    '#debug .dbg-row input[type=range]{grid-column:1/-1;width:100%;height:14px;',
    '  margin:1px 0 0;accent-color:#ffd34d;cursor:pointer;}',

    '#debug .dbg-select{grid-template-columns:1fr;}',
    '#debug .dbg-select select{width:100%;margin-top:3px;padding:4px 6px;',
    '  background:rgba(255,255,255,0.07);color:#e8e2d8;',
    '  border:1px solid rgba(255,255,255,0.14);border-radius:5px;',
    '  font-family:inherit;font-size:11px;}',

    '#debug .dbg-actions{display:flex;gap:6px;margin-top:12px;}',
    '#debug .dbg-actions button{flex:1;padding:6px 4px;',
    '  background:rgba(255,255,255,0.08);color:#e8e2d8;',
    '  border:1px solid rgba(255,255,255,0.16);border-radius:5px;',
    '  font-family:inherit;font-size:10.5px;cursor:pointer;}',
    '#debug .dbg-actions button:hover{background:rgba(255,255,255,0.14);}',

    '#debug .dbg-help{margin-top:10px;padding-top:8px;',
    '  border-top:1px solid rgba(255,255,255,0.08);font-size:10px;line-height:1.7;',
    '  color:rgba(255,255,255,0.50);}',
    '#debug .dbg-help b{color:rgba(255,255,255,0.85);font-weight:600;}',

    /* Tuning dump. A visible, selectable textarea rather than a clipboard
       call, because artifacts run in a sandboxed iframe where the Clipboard
       API is usually blocked — it failed silently and the console fallback is
       unreachable inside an embedded frame. */
    '#dbg-dump{position:fixed;inset:0;z-index:1001;display:grid;place-items:center;',
    '  background:rgba(10,8,7,0.74);padding:20px;}',
    '#dbg-dump[hidden]{display:none;}',
    '#dbg-dump .dump-card{width:min(620px,100%);max-height:82vh;display:flex;',
    '  flex-direction:column;gap:10px;background:#191614;',
    '  border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:14px;}',
    '#dbg-dump h3{margin:0;font:700 11px/1 ui-monospace,Consolas,monospace;',
    '  letter-spacing:0.12em;color:#ffd34d;text-transform:uppercase;}',
    '#dbg-dump p{margin:0;font:11px/1.5 ui-monospace,Consolas,monospace;',
    '  color:rgba(255,255,255,0.55);}',
    '#dbg-dump textarea{flex:1;min-height:230px;resize:vertical;width:100%;',
    '  background:#0f0d0c;color:#e8e2d8;border:1px solid rgba(255,255,255,0.14);',
    '  border-radius:6px;padding:10px;white-space:pre;',
    '  font:11px/1.5 ui-monospace,Consolas,monospace;}',
    '#dbg-dump .dump-row{display:flex;gap:8px;}',
    '#dbg-dump button{flex:1;padding:8px;background:rgba(255,255,255,0.08);',
    '  color:#e8e2d8;border:1px solid rgba(255,255,255,0.16);border-radius:6px;',
    '  font:600 11px ui-monospace,Consolas,monospace;cursor:pointer;}',
    '#dbg-dump button:hover{background:rgba(255,255,255,0.14);}',
  ].join('\n'),

  injectCSS() {
    if (document.getElementById('dbg-css')) return;
    const s = document.createElement('style');
    s.id = 'dbg-css';
    s.textContent = this.CSS;
    document.head.appendChild(s);
  },

  init(game) {
    const P = BR.PHYSICS, Pj = BR.Projection, C = BR.CAMERA;

    this.sliders = [
      ['PERSPECTIVE'],
      ['Ground tilt',      Pj, 'groundTilt',  0.30, 1.00, 0.01,
       'BLOCKS ALL ART. 1.0 = pure top-down, 0.4 = low chase view.'],
      ['Height scale',     Pj, 'heightScale', 0.30, 1.60, 0.01,
       'How far a jump lifts the car from its shadow.'],

      ['CAMERA — chase'],
      ['Zoom',             C, 'zoom',          0.80, 2.60, 0.05,
       'Higher = closer, less track visible ahead.'],
      ['Horizon bias',     C, 'horizonBias',   0.40, 0.85, 0.01,
       'How far down the screen the car sits. Higher = more road ahead.'],
      ['Yaw rate',         C, 'yawRate',       1.0, 15.0, 0.25,
       'How fast the view swings to follow travel. LOW lets the world rotate '
       + 'behind you through a drift.'],
      ['Follow rate',      C, 'followRate',    2.0, 20.0, 0.5,
       'Positional catch-up. Low = laggy and cinematic.'],
      ['Look ahead',       C, 'lookAhead',     0.00, 0.60, 0.01,
       '0 = pure follow. horizonBias already looks ahead.'],

      ['GRIP — the drift lever'],
      ['Retention normal', P, 'lateralRetentionNormal', 0.70, 0.99, 0.005,
       'Lateral velocity kept per tick. LOWER = more grip.'],
      ['Retention drift',  P, 'lateralRetentionDrift',  0.80, 0.998, 0.002,
       'Higher = slides further when drift is held.'],
      ['Blend rate',       P, 'retentionBlendRate',     1.0, 20.0, 0.5,
       'How snappily grip changes on press and release.'],

      ['STEERING'],
      ['Turn rate',        P, 'turnRateBase',   1.0, 5.0, 0.05,
       'rad/sec at optimal speed. Higher = darty.'],
      ['Drift turn bonus', P, 'driftTurnBonus', 1.0, 2.2, 0.05,
       'Why drifting corners tighter than steering.'],
      ['Air control',      P, 'airControl',     0.0, 1.0, 0.05,
       'Too high trivialises jump shortcuts.'],

      ['SPEED'],
      ['Engine force',     P, 'engineForce',     150, 900, 10,
       'Higher = snappier off the line.'],
      ['Rolling friction', P, 'rollingFriction', 0.960, 0.999, 0.001,
       'Lower = scrubs speed fast, feels heavy.'],
      ['Brake force',      P, 'brakeForce',      200, 1200, 20, ''],

      ['BOOST & CHARGE'],
      ['Boost force',      P, 'boostForce',      300, 1400, 20, ''],
      ['Boost duration',   P, 'boostDuration',   0.4, 4.0, 0.1, ''],
      ['Charge rate',      P, 'driftChargeRate', 0.10, 1.20, 0.02,
       'Higher = drift spam pays too well.'],
      ['Charge min angle', P, 'driftMinAngle',   0.02, 0.60, 0.01,
       'Slip needed before charge accrues.'],

      ['COLLISION'],
      ['Restitution',      P, 'collisionRestitution', 0.0, 1.0, 0.05,
       'Higher = pinball.'],
      ['Speed loss',       P, 'collisionSpeedLoss',   0.0, 0.9, 0.05,
       'Scaled by how square the hit was.'],
      ['Spin recovery',    P, 'spinRecoveryTime',     0.1, 2.0, 0.05,
       'HARD CAP on lost control. Over ~0.8s reads as frustrating.'],
    ];

    this.injectCSS();
    this.build(game);
  },

  /* Any control that keeps focus steals the keyboard from the game: Space
     would re-press the last button instead of drifting, and arrow keys would
     move a slider or a dropdown instead of steering. Every control hands
     focus back. */
  releaseFocus(el) {
    if (el && el.blur) el.blur();
  },

  build(game) {
    const self = this;

    // Always-visible toggle. The panel used to be keyboard-only (H), which
    // left no way back if focus was lost — and in an embedded frame, focus is
    // lost constantly.
    const btn = document.createElement('button');
    btn.id = 'dbg-toggle';
    btn.type = 'button';
    btn.textContent = 'TUNING ▾';
    btn.addEventListener('click', function () {
      self.toggle();
      self.releaseFocus(btn);
    });
    document.body.appendChild(btn);
    this.btn = btn;

    const wrap = document.createElement('div');
    wrap.id = 'debug';

    const head = document.createElement('div');
    head.className = 'dbg-head';
    head.innerHTML = '<strong>PHASE 1 — DRIVING TEST</strong><span>H to hide</span>';
    wrap.appendChild(head);

    this.readouts = document.createElement('div');
    this.readouts.className = 'dbg-readouts';
    wrap.appendChild(this.readouts);

    // Vehicle picker — feel the stat spread from 09_Vehicles.md
    const vrow = document.createElement('div');
    vrow.className = 'dbg-row dbg-select';
    const vlabel = document.createElement('label');
    vlabel.textContent = 'Vehicle';
    const sel = document.createElement('select');
    Object.keys(BR.VEHICLES).forEach(function (id) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = BR.VEHICLES[id].name;
      sel.appendChild(o);
    });
    sel.value = 'red-racer';
    sel.addEventListener('change', function () {
      game.setVehicle(sel.value);
      self.releaseFocus(sel);   // else arrow keys change the car, not the line
    });
    vrow.appendChild(vlabel);
    vrow.appendChild(sel);
    wrap.appendChild(vrow);

    this.sliders.forEach(function (s) {
      if (s.length === 1) {
        const h = document.createElement('div');
        h.className = 'dbg-section';
        h.textContent = s[0];
        wrap.appendChild(h);
        return;
      }
      const label = s[0], obj = s[1], key = s[2];
      const min = s[3], max = s[4], step = s[5], hint = s[6];

      const row = document.createElement('div');
      row.className = 'dbg-row';
      row.title = hint || '';

      const lab = document.createElement('label');
      lab.textContent = label;

      const val = document.createElement('span');
      val.className = 'dbg-val';
      val.textContent = self.fmt(obj[key]);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step;
      input.value = obj[key];
      input.addEventListener('input', function () {
        obj[key] = parseFloat(input.value);
        val.textContent = self.fmt(obj[key]);
      });
      // On release, hand the keyboard back so steering works again.
      input.addEventListener('change', function () { self.releaseFocus(input); });

      row.appendChild(lab);
      row.appendChild(val);
      row.appendChild(input);
      wrap.appendChild(row);
    });

    const acts = document.createElement('div');
    acts.className = 'dbg-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Show tuning';
    copy.addEventListener('click', function () {
      self.showDump();
      self.releaseFocus(copy);
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset car (R)';
    reset.addEventListener('click', function () {
      game.reset();
      self.releaseFocus(reset);   // else Space re-triggers this, not drift
    });

    acts.appendChild(copy);
    acts.appendChild(reset);
    wrap.appendChild(acts);

    const help = document.createElement('div');
    help.className = 'dbg-help';
    help.innerHTML =
      '<b>&larr; &rarr;</b> / <b>A D</b> steer &nbsp; ' +
      '<b>Space</b> drift &nbsp; <b>Shift</b> boost<br>' +
      '<b>&uarr; &darr;</b> throttle/brake &nbsp; <b>T</b> auto-accel &nbsp; ' +
      '<b>R</b> reset &nbsp; <b>P</b> pause &nbsp; <b>H</b> hide';
    wrap.appendChild(help);

    document.body.appendChild(wrap);
    this.el = wrap;
  },

  fmt(n) {
    if (Math.abs(n) >= 100) return n.toFixed(0);
    if (Math.abs(n) >= 10)  return n.toFixed(1);
    return n.toFixed(3);
  },

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
    if (this.btn) this.btn.textContent = this.visible ? 'TUNING ▾' : 'TUNING ▸';
  },

  update(game, dt) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.35) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0; this.fpsFrames = 0;
    }
    if (!this.visible) return;

    const v = game.vehicle;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const rows = [
      ['fps',       this.fps.toFixed(0)],
      ['speed',     speed.toFixed(0)],
      ['slip',      (v.slip * 180 / Math.PI).toFixed(0) + '°'],
      ['retention', v.retention.toFixed(3)],
      ['boost',     v.boostMeter.toFixed(2) + (v.boosting ? ' ▶' : '')],
      ['height z',  v.z.toFixed(0)],
      ['spin',      v.spinTime > 0 ? v.spinTime.toFixed(2) : '—'],
      ['auto-acc',  BR.Input.autoAccelerate ? 'on' : 'off'],
    ];
    this.readouts.innerHTML = rows.map(function (r) {
      return '<span><i>' + r[0] + '</i>' + r[1] + '</span>';
    }).join('');
  },

  /**
   * Show the tuning snapshot in a selectable textarea.
   *
   * Deliberately NOT a bare clipboard call. Artifacts run in a sandboxed
   * iframe where navigator.clipboard is typically blocked, so the old button
   * failed silently and its console fallback was unreachable. A visible
   * textarea always works: select and copy by hand if the API is unavailable.
   */
  showDump() {
    const self = this;
    let ov = document.getElementById('dbg-dump');

    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'dbg-dump';
      ov.hidden = true;
      ov.innerHTML =
        '<div class="dump-card">' +
          '<h3>Tuning snapshot</h3>' +
          '<p>Already selected — press Ctrl+C, or use the button below.</p>' +
          '<textarea readonly spellcheck="false"></textarea>' +
          '<div class="dump-row">' +
            '<button type="button" data-act="copy">Copy</button>' +
            '<button type="button" data-act="close">Close</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      ov.addEventListener('click', function (e) {
        const act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'close' || e.target === ov) self.hideDump();
        else if (act === 'copy') self.copyDump(e.target);
      });
      ov.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.hideDump();
      });
    }

    const ta = ov.querySelector('textarea');
    ta.value = this.dumpTuning();
    ov.hidden = false;
    ta.focus();
    ta.select();
  },

  hideDump() {
    const ov = document.getElementById('dbg-dump');
    if (ov) ov.hidden = true;
  },

  /* execCommand first — it is deprecated but works in sandboxed frames where
     the async Clipboard API does not. */
  copyDump(btn) {
    const ov = document.getElementById('dbg-dump');
    const ta = ov.querySelector('textarea');
    ta.focus();
    ta.select();

    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }

    if (ok) {
      btn.textContent = 'Copied ✓';
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(
        function () { btn.textContent = 'Copied ✓'; },
        function () { btn.textContent = 'Press Ctrl+C'; });
      return;
    } else {
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(function () { btn.textContent = 'Copy'; }, 1800);
  },

  /* Pasteable JS for GAME_BIBLE/03_Driving_Physics.md. */
  dumpTuning() {
    const P = BR.PHYSICS, Pj = BR.Projection, C = BR.CAMERA;
    const lines = [];
    lines.push('// Bedroom Racers — tuning snapshot ' + new Date().toISOString());
    lines.push('');
    lines.push('Projection: groundTilt = ' + Pj.groundTilt +
               ', heightScale = ' + Pj.heightScale);
    lines.push('');
    lines.push('const CAMERA = {');
    Object.keys(C).forEach(function (k) { lines.push('  ' + k + ': ' + C[k] + ','); });
    lines.push('};');
    lines.push('');
    lines.push('const PHYSICS = {');
    Object.keys(P).forEach(function (k) { lines.push('  ' + k + ': ' + P[k] + ','); });
    lines.push('};');
    return lines.join('\n');
  },
};
