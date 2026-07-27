/* =============================================================================
   DEBUG PANEL — Phase 1 tooling. Delete before Phase 3.
   =============================================================================
   Phase 1's entire purpose is finding tuning values by feel, and the single
   most important of them (groundTilt) blocks all vehicle art and track
   authoring. Editing a file and reloading is far too slow a loop for that, so
   every constant that matters is a live slider.

   "Copy tuning" dumps the current values as pasteable JS, because 17_Claude_
   Rules.md requires settled values to go back into
   GAME_BIBLE/03_Driving_Physics.md rather than living only in code.
   ========================================================================== */

window.BR = window.BR || {};

BR.Debug = {

  el: null,
  readouts: null,
  visible: true,
  fpsAcc: 0, fpsFrames: 0, fps: 0,

  /* [label, object, key, min, max, step, hint] */
  sliders: null,

  init(game) {
    const P = BR.PHYSICS, Pj = BR.Projection, C = BR.CAMERA;

    this.sliders = [
      ['PERSPECTIVE'],
      ['Ground tilt',      Pj, 'groundTilt',  0.30, 1.00, 0.01,
       'BLOCKS ALL ART. 1.0 = pure top-down, 0.4 = low chase view.'],
      ['Height scale',     Pj, 'heightScale', 0.30, 1.60, 0.01,
       'How far a jump lifts the car from its shadow.'],

      ['CAMERA'],
      ['Zoom',             C, 'zoom',          0.80, 2.60, 0.05,
       'Higher = closer, less track visible ahead.'],
      ['Follow rate',      C, 'followRate',    2.0, 20.0, 0.5,
       'Low = laggy and cinematic, high = locked and jittery.'],
      ['Look ahead',       C, 'lookAhead',     0.00, 0.60, 0.01,
       '0 = pure follow. Open question 4 in 03_Driving_Physics.md.'],

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

    this.build(game);
  },

  build(game) {
    const wrap = document.createElement('div');
    wrap.id = 'debug';

    const head = document.createElement('div');
    head.className = 'dbg-head';
    head.innerHTML = '<strong>PHASE 1 — DRIVING TEST</strong>' +
                     '<span>H to hide</span>';
    wrap.appendChild(head);

    // Live readouts
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
    sel.addEventListener('change', function () { game.setVehicle(sel.value); });
    vrow.appendChild(vlabel);
    vrow.appendChild(sel);
    wrap.appendChild(vrow);

    // Sliders
    const self = this;
    this.sliders.forEach(function (s) {
      if (s.length === 1) {
        const h = document.createElement('div');
        h.className = 'dbg-section';
        h.textContent = s[0];
        wrap.appendChild(h);
        return;
      }
      const [label, obj, key, min, max, step, hint] = s;

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

      row.appendChild(lab);
      row.appendChild(val);
      row.appendChild(input);
      wrap.appendChild(row);
    });

    // Actions
    const acts = document.createElement('div');
    acts.className = 'dbg-actions';

    const copy = document.createElement('button');
    copy.textContent = 'Copy tuning';
    copy.addEventListener('click', function () {
      const text = self.dumpTuning();
      console.log(text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { copy.textContent = 'Copied ✓'; },
          function () { copy.textContent = 'See console'; });
      } else {
        copy.textContent = 'See console';
      }
      setTimeout(function () { copy.textContent = 'Copy tuning'; }, 1600);
    });

    const reset = document.createElement('button');
    reset.textContent = 'Reset car (R)';
    reset.addEventListener('click', function () { game.reset(); });

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
