/* =============================================================================
   TOY — the material kit the whole interface is made of.
   =============================================================================
   The world had its material pass (12_Art_Guide.md): the cars are moulded
   plastic with a mould seam and a lit flank, the rug is woven pile printed with
   a town, the stunt deck is varnished floorboards. The interface was the last
   thing in the game that still looked like a dev tool — flat translucent black
   rectangles with monospace text on them.

   The direction, chosen explicitly: THE MENU LOOKS LIKE IT CAME IN THE BOX WITH
   THE CARS. So the interface is made of four things, and never of anything
   else:

     plastic    moulded slabs, dark outline, lit top edge, shaded bottom edge
     paper      cut stickers and printed labels, with a shadow and a tilt
     card       kraft board with a fibre tooth and a cut edge
     ink        what is printed on the paper

   WHY THIS LIVES IN HUD.js. It is shared by HUD, MiniMap, CornerHint and
   Screens, and src/ui/HUD.js is the first of those four to load in both
   index.html and tools/build-artifact.sh. A fifth file would mean editing a
   build manifest outside src/ui/ for a pure art change, which is not worth a
   merge conflict with whoever is adding the next track.

   ── ONE LIGHT, AND IT IS NOT THE ROOM'S ───────────────────────────────────
   Projection.light is a WORLD light: the camera rotates with travel, so shadows
   sweep across the screen as you corner, which is what a room does.

   The interface is not in the room. It is stuck to the glass. If a HUD plate
   took the world light, its highlight would swing round the screen every time
   the player turned a corner and the whole interface would read as a
   turntable — precisely the failure Projection.js warns about, one layer up. So
   Toy has its own light, FIXED in screen space, up and to the left, and every
   bevel, shadow and sticker in the game agrees with it.

   ── AND ONE THING THAT CANNOT BE MADE OF PLASTIC ──────────────────────────
   Nothing carrying a HIT REGION may be rotated. Screens.button registers an
   axis-aligned rect at the coordinates it draws at, and a rotated button would
   be clickable somewhere it is not drawn — the same class of lie as a barrier
   drawn shorter than it collides (12_Art_Guide.md). Stickers, stamps and
   banners tilt because none of them is pressable; buttons, rows and sliders
   never do.
   ========================================================================== */

window.BR = window.BR || {};

BR.Toy = {

  /* Direction the light comes FROM, in screen space: up and to the left. Used
     as a sign rather than as a vector — a top edge is lit, a bottom edge is
     shaded, a shadow falls down and to the right. */
  SHADOW_X: 1.6,
  SHADOW_Y: 3.0,

  PAPER:    '#efe3c8',   // label stock, printed white
  PAPER_D:  '#d3c3a0',   // its cut edge in shadow
  INK:      '#2c2219',   // what a toy company prints with
  KRAFT:    '#bd9560',   // box card
  SHELL:    '#37475c',   // the dark blue-grey plastic the parts are moulded in
  SHELL_LT: '#53667e',
  RED:      '#d8342f',
  YELLOW:   '#ffd34d',
  GREEN:    '#4fd8a8',
  BLUE:     '#4f8ef2',

  /* Labels are PRINTED, so they are set in a humanist sans, not in the
     monospace that made every screen read as a terminal.

     Numbers that TICK stay monospace, and that is not laziness: a proportional
     clock jitters its own width every hundredth of a second, and the timer is
     read while driving. A stamped number wheel is monospace too. */
  label(px, weight) {
    return (weight || 700) + ' ' + px +
           'px "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  },
  num(px, weight) {
    return (weight || 700) + ' ' + px + 'px ui-monospace, Consolas, monospace';
  },

  /* Renderer.shade, not a second copy of it. The cars, the kerbs, the walls and
     now the interface all tint the same way, which is most of why they look
     like they came out of the same factory.

     IT IS NORMALISED FIRST, AND THAT IS NOT TIDINESS. Renderer.shade takes a
     HEX string and returns an `rgb(...)` one, which is perfect for a fill and a
     trap for anything that shades a shade: parseInt('rgb(46,60,77)', 16) is
     NaN, so every channel comes out 0 and the part is drawn BLACK.

     Both happened, and neither throws. The boost channel — a shade of the shell
     handed to plate(), which shades it again for its bevels — was a black slab
     in the corner of every race. Worse, `button()` lightens its colour when the
     control is focused, so THE FOCUSED BUTTON WAS THE DARKEST THING ON SCREEN:
     RACE on the main menu rendered as a black rectangle with dark gold text on
     it, at exactly the moment a pad player needs to see which control they are
     on. A render at 2x is what found it. */
  shade(col, amt) { return BR.Renderer.shade(this.hex(col), amt); },

  hex(col) {
    if (!col || col.charAt(0) === '#') return col;
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(col);
    if (!m) return col;
    const p = function (v) { return ('0' + (+v).toString(16)).slice(-2); };
    return '#' + p(m[1]) + p(m[2]) + p(m[3]);
  },

  round(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  },

  /* ── PLASTIC ──────────────────────────────────────────────────────────────
     A moulded slab. Five things, in the order they earn their place, and they
     are the same five the cars got in Phase 12:

       1. a dark outline round the whole silhouette — separation, and most of
          why a shape reads as an object rather than as a coloured region
       2. a body that is lighter at the top than at the bottom, because it is
          crowned and the light is above it
       3. a lit hairline inside the top edge — the catch on the moulded edge
       4. a shaded hairline inside the bottom edge
       5. a shadow on the screen behind it, down and to the right

     Two variations, and they are different things:

       `press`  the part is PUSHED INTO ITS OWN SOCKET — a dark recess is drawn
                at the full rect and the body sits 1.5 down and in from it, with
                the light swapped so the top is the edge in shadow. This is the
                hover and keyboard-focus state, and it is also how a latched tab
                says it is the one that is down. No new element is drawn, so the
                pad highlight cannot drift out of step with the pointer one.

                A first version only swapped the bevel and lightened the body,
                and rendered as a barely-different button. The socket is what
                makes it unmistakable at a glance, which is the entire job of a
                focus indicator.

       `sunk`   a channel moulded INTO a bigger part — the boost meter, a volume
                track. Same inverted light, no socket, because there is no
                separate part sitting in it.

     The drawn body of a pressed part is 3px smaller than its hit region. That
     is deliberate and the safe direction: the target stays exactly as big as it
     was, and the pixels move inside it. */
  plate(ctx, x, y, w, h, r, col, opts) {
    opts = opts || {};
    const press = !!opts.press;
    const low = press || !!opts.sunk;

    if (press) {
      this.round(ctx, x, y, w, h, r);
      ctx.fillStyle = this.shade(col, -0.64);
      ctx.fill();
      /* The rim of the socket catches the light all the way round, which is
         what a recess in a moulded part actually does — and it is what makes
         the focused control readable across the room rather than merely
         different when compared side by side. */
      ctx.strokeStyle = this.shade(col, 0.55);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      x += 1.5; y += 2.5; w -= 3; h -= 4; r = Math.max(2, r - 1);
    }

    if (!press && opts.shadow !== false) {
      this.round(ctx, x + this.SHADOW_X, y + this.SHADOW_Y, w, h, r);
      ctx.fillStyle = 'rgba(12,9,7,0.38)';
      ctx.fill();
    }

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, this.shade(col, low ? -0.16 : 0.15));
    g.addColorStop(1, this.shade(col, low ? 0.06 : -0.17));

    this.round(ctx, x, y, w, h, r);
    ctx.strokeStyle = this.shade(col, -0.60);
    ctx.lineWidth = press ? 1.6 : 2.6;
    ctx.stroke();
    ctx.fillStyle = g;
    ctx.fill();

    const inset = Math.min(r * 0.75, w / 2 - 1);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + inset, y + 1.6);
    ctx.lineTo(x + w - inset, y + 1.6);
    ctx.strokeStyle = this.shade(col, low ? -0.32 : 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + inset, y + h - 1.6);
    ctx.lineTo(x + w - inset, y + h - 1.6);
    ctx.strokeStyle = this.shade(col, low ? 0.28 : -0.38);
    ctx.stroke();
  },

  /* A window sunk INTO a plastic part: printed paper behind a recess. The
     shadow goes inside the TOP edge, which is the whole difference between a
     hole and a bump — a plate proud of the surface is lit there instead. */
  inset(ctx, x, y, w, h, r, col) {
    this.round(ctx, x, y, w, h, r);
    ctx.fillStyle = col || this.PAPER;
    ctx.fill();
    ctx.strokeStyle = 'rgba(24,18,12,0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const inx = Math.min(r, w / 2 - 1);
    ctx.beginPath();
    ctx.moveTo(x + inx, y + 1.5);
    ctx.lineTo(x + w - inx, y + 1.5);
    ctx.strokeStyle = 'rgba(52,38,24,0.28)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  },

  /* ── PAPER ────────────────────────────────────────────────────────────────
     A cut sticker. Shadow, stock, and a pale bevel along the cut — vinyl is
     thick enough to catch the light on its edge, which is what stops it reading
     as a coloured rectangle. */
  sticker(ctx, x, y, w, h, col, r) {
    r = r === undefined ? 3 : r;
    this.round(ctx, x + this.SHADOW_X, y + this.SHADOW_Y, w, h, r);
    ctx.fillStyle = 'rgba(12,9,7,0.34)';
    ctx.fill();
    this.round(ctx, x, y, w, h, r);
    ctx.fillStyle = col || this.PAPER;
    ctx.fill();
    ctx.strokeStyle = this.shade(col || this.PAPER, -0.22);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1);
    ctx.lineTo(x + w - r, y + 1);
    ctx.strokeStyle = this.shade(col || this.PAPER, 0.45);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },

  /**
   * A sticker slapped on at an angle with a word on it. Everything a callout,
   * a banner or the countdown is made of.
   *
   * The tilt is the point — 11_UI.md asks for hand-cut and slightly wonky,
   * "nothing perfectly aligned" — and it is safe here because a sticker is
   * never pressable.
   */
  banner(ctx, text, cx, cy, opts) {
    opts = opts || {};
    const size = opts.size || 18;
    const font = opts.font || this.label(size, 800);
    const padX = opts.padX === undefined ? 14 : opts.padX;
    const padY = opts.padY === undefined ? 8 : opts.padY;

    ctx.save();
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2, h = size + padY * 2;

    ctx.translate(cx, cy);
    ctx.rotate(opts.tilt === undefined ? -0.028 : opts.tilt);
    this.sticker(ctx, -w / 2, -h / 2, w, h, opts.fill || this.YELLOW, 4);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.ink || this.INK;
    ctx.fillText(text, 0, 1);
    ctx.restore();
    return w;
  },

  /* Text with the shape of a moulded letter: a dark face below and to the
     right, the lit colour on top. Two fills, and it is the difference between
     a word printed on a part and a word raised out of it. */
  moulded(ctx, text, x, y, col, dark) {
    ctx.fillStyle = dark || 'rgba(10,8,6,0.55)';
    ctx.fillText(text, x + 1.3, y + 1.5);
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  },

  /* A rubber stamp: outline and word, tilted, slightly transparent, because
     ink on card never covers evenly. Used for NEW BEST TIME, which used to be
     a green line that collided with the standings. */
  stamp(ctx, text, cx, cy, col, tilt) {
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.translate(cx, cy);
    ctx.rotate(tilt === undefined ? -0.14 : tilt);
    ctx.font = this.label(12, 800);
    const tw = ctx.measureText(text).width;
    const w = tw + 22, h = 26;
    this.round(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(text, 0, 1);
    ctx.restore();
  },

  /* A torn strip of masking tape. The serrated ends are the whole tell; a
     straight-ended translucent rectangle is a UI panel again. */
  tape(ctx, x, y, w, h) {
    const teeth = 5, step = h / teeth;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < teeth; i++) {
      ctx.lineTo(x + (i % 2 ? 0 : 4), y + step * (i + 1));
    }
    ctx.lineTo(x + w, y + h);
    for (let i = teeth; i > 0; i--) {
      ctx.lineTo(x + w - (i % 2 ? 0 : 4), y + step * (i - 1));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(226,208,168,0.66)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,128,92,0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  /* ── CARD ─────────────────────────────────────────────────────────────────
     Kraft board with a tooth, and a CUT EDGE along the bottom and the right —
     board is thick, and the pale core showing at the cut is the only thing that
     says so.

     The tooth is a cached 64px pattern built with a SEEDED generator, never
     Math.random: a texture that differed between two renders would break every
     pixel-diff check in the project, and the shared stream is the AI's
     (12_Art_Guide.md). Same FNV-1a-into-mulberry shape the vehicle wear uses. */
  _tex: {},

  texture(kind) {
    if (this._tex[kind]) return this._tex[kind];
    const N = 64;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');

    let s = 2166136261;
    for (let i = 0; i < kind.length; i++) {
      s = Math.imul(s ^ kind.charCodeAt(i), 16777619);
    }
    const rnd = function () {
      s = (s + 0x6D2B79F5) | 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };

    if (kind === 'kraft') {
      // Fibres, lying every which way, dark and light in equal measure so the
      // mean barely moves while the local contrast triples — the same bargain
      // the rug's pile struck.
      for (let i = 0; i < 190; i++) {
        const x = rnd() * N, y = rnd() * N, a = rnd() * Math.PI, l = 2 + rnd() * 7;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(90,62,32,0.16)'
                                    : 'rgba(255,236,204,0.13)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    } else {
      // Printed stock: a fine speckle, nothing directional.
      for (let i = 0; i < 240; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(96,76,48,0.10)'
                                  : 'rgba(255,252,240,0.14)';
        g.fillRect(rnd() * N, rnd() * N, 1, 1);
      }
    }
    this._tex[kind] = g.canvas;
    return this._tex[kind];
  },

  pattern(ctx, kind) {
    const key = '_pat_' + kind;
    if (!this[key]) this[key] = ctx.createPattern(this.texture(kind), 'repeat');
    return this[key];
  },

  card(ctx, x, y, w, h, r, col, kind) {
    col = col || this.KRAFT;
    kind = kind || 'kraft';
    r = r === undefined ? 6 : r;

    this.round(ctx, x + this.SHADOW_X * 2, y + this.SHADOW_Y * 2, w, h, r);
    ctx.fillStyle = 'rgba(10,8,6,0.40)';
    ctx.fill();

    // The cut edge: the same board, 3 units down and right, in its pale core.
    this.round(ctx, x + 3, y + 3, w, h, r);
    ctx.fillStyle = this.shade(col, -0.30);
    ctx.fill();

    this.round(ctx, x, y, w, h, r);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = this.pattern(ctx, kind);
    ctx.fill();
    ctx.strokeStyle = this.shade(col, -0.42);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },

  /* A five-pointed star, as a path. One shape for the objectives on the event
     rows, the stars on the menu and the stars on the results card — they mean
     the same thing, so they are the same star. */
  star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.43;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  },

  starSticker(ctx, cx, cy, r, filled) {
    this.star(ctx, cx + 1, cy + 1.4, r);
    ctx.fillStyle = 'rgba(12,9,7,0.34)';
    ctx.fill();
    this.star(ctx, cx, cy, r);
    ctx.fillStyle = filled ? this.YELLOW : 'rgba(236,230,218,0.16)';
    ctx.fill();
    ctx.strokeStyle = filled ? this.shade(this.YELLOW, -0.45)
                             : 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  /* A pressed foil disc — the medal on the event rows and on the scorecard.
     The rim is a lit arc on the light's side and a shaded one opposite, so it
     reads as domed rather than as a coloured circle. */
  medal(ctx, cx, cy, r, col, letter) {
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1.6, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,9,7,0.36)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = this.shade(col, -0.40);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.4, Math.PI * 1.05, Math.PI * 1.85);
    ctx.strokeStyle = this.shade(col, 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (letter) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = this.label(Math.round(r * 1.1), 800);
      ctx.fillStyle = this.shade(col, -0.55);
      ctx.fillText(letter, cx, cy + 1);
      ctx.restore();
    }
  },
};


/* =============================================================================
   HUD — race readouts and results, made of plastic and paper.
   =============================================================================
   Ordering follows 11_UI.md: position is the most-read element, so it is the
   biggest and sits top-left. Nothing is drawn over the middle of the screen
   during racing — the racing line has to stay clear.

   ── THE READABILITY RULE THIS PASS RUNS ON ────────────────────────────────
   Colourful, legible, unobtrusive, IN THAT ORDER WHEN THEY CONFLICT — and the
   old HUD won legibility the cheap way, by putting white text on 45% black. A
   toy is not made of translucent black, so every readout is now one of exactly
   two pairings, and never anything between them:

     dark ink on a cream label      the numbers you read while driving
     cream moulded on dark plastic  the words that label them

   Both are near-maximum contrast. What is NOT allowed anywhere on this screen
   is a mid-tone on a mid-tone, which is the failure mode a bright plastic
   interface actually has.

   The boost meter is drawn TWICE on purpose: a ring around the car and a bar
   in the corner. 11_UI.md has placement as an open question, so both are on
   screen to be compared by driving.
   ========================================================================== */

BR.HUD = {

  /* Everything below is laid out for a full-size view. In a split, the whole
     HUD is scaled instead of being re-laid-out — one transform keeps every
     element in proportion and anchored to the same corners, where hand-tuned
     compact positions would drift out of sync with the originals. */
  REFERENCE_WIDTH: 900,

  /* One slot, top centre under the clock. Held item and nothing else —
     10_Items.md wants it simple to read at a glance, and a slot that can only
     ever contain one thing is the simplest readable thing there is.

     It is a SOCKET: a hole moulded through a plastic tab, with the piece
     sitting in it. Empty reads as empty because you can see the dark inside of
     the hole rather than an outlined rectangle.

     Drawn inside drawScaled rather than beside it. It used to compute its own
     scale with no lower clamp while everything else clamped at 0.55, so on a
     phone the slot climbed into the clock. */
  drawItemSlot(ctx, view, w, h) {
    const v = view.vehicle;
    if (!v) return;
    const T = BR.Toy;
    const bw = 84, bh = 50;
    const bx = w / 2 - bw / 2, by = 86;

    T.plate(ctx, bx, by, bw, bh, 8, T.SHELL);

    const r = 15;
    const cx = bx + bw / 2, cy = by + bh / 2 - 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,10,8,0.78)';
    ctx.fill();
    ctx.strokeStyle = T.shade(T.SHELL, -0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (v.item) {
      const def = BR.Items.DEFS[v.item];
      const col = def ? def.colour : '#ece6da';
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = T.shade(col, -0.45);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // The moulded catch, on the light's side, so the piece reads as a solid.
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, Math.PI * 1.05, Math.PI * 1.7);
      ctx.strokeStyle = T.shade(col, 0.5);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(8, 800);
      T.moulded(ctx, (def ? def.name : '').toUpperCase(),
                bx + bw / 2, by + bh - 12, 'rgba(240,232,214,0.86)');
      ctx.restore();
    }

    // A shield is worn rather than held, so it gets its own mark beside the
    // slot — a ring, never a colour change, because colour alone is not an
    // indicator (11_UI.md accessibility).
    if (v.shield > 0) {
      ctx.strokeStyle = '#69d0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx - 20, by + bh / 2, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(10,8,6,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },

  draw(ctx, view, game, w, h) {
    // Menus render over a live view of the track, so the race HUD must not
    // come with it.
    if (BR.Screens && BR.Screens.state !== BR.Screens.RACE) return;

    const k = Math.min(1, Math.max(0.55, w / this.REFERENCE_WIDTH));
    if (k < 1) {
      ctx.save();
      ctx.scale(k, k);
      this.drawScaled(ctx, view, game, w / k, h / k);
      ctx.restore();
      return;
    }
    this.drawScaled(ctx, view, game, w, h);
  },

  drawScaled(ctx, view, game, w, h) {
    const v = view.vehicle;
    const RM = BR.RaceManager;
    const racing = RM && RM.racers;
    // Each half of a split screen belongs to its own driver.
    const me = view.racer || (RM && RM.player());

    ctx.save();
    ctx.textBaseline = 'top';

    if (game.items) this.drawItemSlot(ctx, view, w, h);
    this.drawDriving(ctx, v, w, h);
    if (racing && me) {
      this.drawRaceState(ctx, RM, me, w, h);
      if (RM.state === RM.STATE.COUNTDOWN) this.drawCountdown(ctx, RM, w, h);
      if (RM.state === RM.STATE.FINISHED)  this.drawResults(ctx, RM, me, w, h);
    }
    this.drawCallouts(ctx, v, w, h);

    // In split screen, say whose half this is and how they steer.
    if (view.label) {
      const T = BR.Toy;
      const col = view.colour || T.YELLOW;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(12, 800);
      const tw = ctx.measureText(view.label).width;
      // A moulded name tag in the seat's own colour, matching the viewport
      // border it sits inside.
      T.plate(ctx, w / 2 - tw / 2 - 12, h - 40, tw + 24, 22, 6, col);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = T.shade(col, -0.62);
      ctx.fillText(view.label, w / 2, h - 28);
      ctx.restore();

      /* The control line under a split seat is the smallest type in the game:
         a quarter-screen viewport scales the HUD to 0.71, so 10 logical pixels
         land as 7 real ones. It cannot be made much bigger without eating the
         road, so it is made as legible as small type can be — heavier weight
         and more contrast, rather than more size. */
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = BR.Toy.label(11, 700);
      ctx.fillStyle = 'rgba(245,238,222,0.72)';
      // A seat on a pad should not be told to press Left Shift.
      const onPad = BR.Input.padFor(view.seat || 0);
      ctx.fillText(onPad ? BR.Input.PAD_LABEL : (view.controls || ''),
                   w / 2, h - 15);
      ctx.restore();
    } else {
      /* SOLO. The controls were drawn only in split screen, so the player most
         likely to be new to the game was the only one never told which keys
         drive the car.

         Shown across the countdown and faded out as the lights go out. The
         countdown is dead time — nothing else is on the lower screen and you
         cannot drive yet — so it costs a returning player nothing and is gone
         before the first corner. 11_UI.md: instruction is an aid, never a gate;
         a player who ignores it must still be able to finish the race. */
      this.drawSoloControls(ctx, RM, w, h);
    }

    ctx.restore();
  },

  // ── speed and boost ──────────────────────────────────────────────────────
  /* A moulded gauge block: the number is printed on a paper window sunk into
     the plastic, and the boost meter is a channel below it with a slug that
     fills up.

     The COLOURS ARE LOAD-BEARING and are unchanged — blue below
     boostMinToFire, green once it can be spent, amber while firing. That is the
     resolution to 11_UI.md open question 1: the state that matters is "can I
     use this yet", and a fill level alone does not say it. The moulded rib at
     the threshold says the same thing a second way, for anyone who cannot
     separate the blue from the green. */
  drawDriving(ctx, v, w, h) {
    const P = BR.PHYSICS;
    const T = BR.Toy;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const y0 = h - 100;

    T.plate(ctx, 16, y0, 168, 62, 9, T.SHELL);
    T.inset(ctx, 24, y0 + 9, 108, 44, 5);

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = T.num(30, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText(String(Math.round(speed)), 124, y0 + 16);
    ctx.textAlign = 'left';
    /* MOULDED, not printed. The first pass set these in ink — which is the
       right colour for the number, because the number is on paper, and quite
       invisible here, because these two words are on dark plastic. A render at
       3x is what showed it; the code reads fine either way. */
    ctx.font = T.label(9, 800);
    T.moulded(ctx, 'UNITS', 138, y0 + 18, 'rgba(240,232,214,0.72)');
    T.moulded(ctx, '/SEC', 138, y0 + 31, 'rgba(240,232,214,0.72)');
    ctx.restore();

    // ── the boost channel ─────────────────────────────────────────────────
    const bx = 16, by = y0 + 68, bw = 168, bh = 20;
    T.plate(ctx, bx, by, bw, bh, 6, T.shade(T.SHELL, -0.16), { sunk: true });

    const trackX = bx + 4, trackW = bw - 8;
    const fillW = trackW * v.boostMeter;
    if (fillW > 1.5) {
      const col = v.boosting ? T.YELLOW
        : (v.boostMeter >= P.boostMinToFire ? T.GREEN : T.BLUE);
      T.round(ctx, trackX, by + 4, fillW, bh - 8, 4);
      ctx.fillStyle = col;
      ctx.fill();
      // A slug of plastic, not a bar of colour: lit along its top.
      ctx.beginPath();
      ctx.moveTo(trackX + 2, by + 6.4);
      ctx.lineTo(trackX + Math.max(2, fillW - 2), by + 6.4);
      ctx.strokeStyle = T.shade(col, 0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* The threshold, as a rib moulded across the channel — a dark line with a
       pale one beside it, which is the same two hairlines that turn a scratch
       into a raised ridge on the cars.

       It has to survive an EMPTY meter, because "not yet" is the state it
       exists to describe, and an empty channel with nothing in it says nothing
       at all. */
    const tx = trackX + trackW * P.boostMinToFire;
    ctx.beginPath();
    ctx.moveTo(tx, by + 2.5); ctx.lineTo(tx, by + bh - 2.5);
    ctx.strokeStyle = 'rgba(8,6,5,0.70)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 1.8, by + 2.5); ctx.lineTo(tx + 1.8, by + bh - 2.5);
    ctx.strokeStyle = 'rgba(255,246,226,0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },

  // ── position, lap, timer ─────────────────────────────────────────────────
  drawRaceState(ctx, RM, me, w, h) {
    const T = BR.Toy;

    /* POSITION — the most-read element on screen, so it gets the treatment
       that survives being glanced at: the biggest numeral in the game, printed
       in ink on a cream label, on the chunkiest plate. Leading turns the label
       gold, which is a second channel on top of the number itself. */
    const lead = me.position === 1;
    T.plate(ctx, 16, 16, 148, 78, 10, T.SHELL);
    T.inset(ctx, 26, 26, 68, 54, 6, lead ? T.YELLOW : T.PAPER);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = T.num(40, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText(String(me.position), 60, 54);
    ctx.restore();

    ctx.save();
    ctx.font = T.label(16, 800);
    T.moulded(ctx, this.suffix(me.position), 102, 32,
              lead ? T.YELLOW : 'rgba(240,232,214,0.92)');
    ctx.font = T.label(10, 700);
    T.moulded(ctx, 'OF ' + RM.racers.length, 102, 58,
              'rgba(240,232,214,0.55)');
    ctx.restore();

    // ── LAP, moulded straight into the plastic ────────────────────────────
    const lapShown = Math.min(me.lap + 1, RM.laps);
    T.plate(ctx, 172, 16, 96, 78, 10, T.SHELL);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = T.label(10, 700);
    T.moulded(ctx, 'LAP', 220, 26, 'rgba(240,232,214,0.55)');
    ctx.font = T.num(30, 800);
    T.moulded(ctx, lapShown + '/' + RM.laps, 220, 46, '#f4ecd8');
    ctx.restore();

    // Final lap is worth shouting about, and a sticker is how a toy shouts.
    if (me.lap === RM.laps - 1 && RM.state === RM.STATE.RACING) {
      ctx.save();
      T.banner(ctx, 'FINAL LAP', 220, 102,
               { size: 11, padX: 9, padY: 5, fill: T.RED,
                 ink: '#fff4e2', tilt: -0.055 });
      ctx.restore();
    }

    /* THE CLOCK — a stopwatch face let into a plastic housing. Monospace on
       purpose: this is the one number that changes every frame, and a
       proportional one would breathe its own width while being read at speed. */
    T.plate(ctx, w / 2 - 92, 14, 184, 46, 9, T.SHELL);
    T.inset(ctx, w / 2 - 82, 22, 164, 30, 5);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = T.num(23, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText(RM.formatTime(RM.clock), w / 2, 38);
    ctx.restore();

    if (me.bestLap !== null) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = T.label(10, 700);
      T.moulded(ctx, 'BEST ' + RM.formatTime(me.bestLap), w / 2, 64,
                'rgba(240,232,214,0.62)');
      ctx.restore();
    }
  },

  /* How long the solo control line lingers after the lights go out. Long
     enough to still be readable while the car pulls away, short enough to be
     gone before anything is being asked of it. */
  SOLO_HINT_FADE: 2.2,

  drawSoloControls(ctx, RM, w, h) {
    if (!RM || !RM.STATE) return;
    /* Not while the first-run lessons are running. They occupy exactly the
       same two seconds of countdown, and the leaflet's first card names the
       steering control on a key cap of its own — two sets of key names in one
       glance is how a screen stops being read at all. */
    if (BR.Coach && BR.Coach.active) return;

    let a;
    if (RM.state === RM.STATE.COUNTDOWN) {
      a = 1;
    } else if (RM.state === RM.STATE.RACING) {
      // `clock` only starts advancing when the lights go out, which is exactly
      // the zero this wants. (Not `raceTime` — there is no such field, and
      // reading one would leave the hint on screen for the whole race.)
      const t = RM.clock || 0;
      if (t > this.SOLO_HINT_FADE) return;
      a = 1 - t / this.SOLO_HINT_FADE;
    } else {
      return;                      // finished, paused — nothing to teach
    }

    // On a touch device the pads are on screen with their own labels, so a list
    // of keys that do not exist is worse than nothing.
    if (BR.Touch && BR.Touch.capable) return;
    const onPad = BR.Input.padFor(0);
    const text = onPad ? BR.Input.PAD_LABEL : BR.Input.LABELS.solo;
    if (!text) return;

    const T = BR.Toy;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = T.label(11, 700);

    /* A strip of tape with the controls written on it, because this sits over
       moving track and the line is unreadable against a pale rug without
       something behind it. Tape rather than a plate: it is a note somebody
       stuck on, and it is meant to come off. */
    const pad = 16;
    const tw = ctx.measureText(text).width;
    ctx.save();
    ctx.translate(w / 2, h - 28);
    ctx.rotate(-0.008);
    T.tape(ctx, -(tw / 2 + pad), -13, tw + pad * 2, 26);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(48,36,24,0.88)';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.restore();
  },

  /* Three stickers and then GO. The numeral is ink on a cream disc; GO is the
     one that changes material, to green, because it is a different message. */
  drawCountdown(ctx, RM, w, h) {
    const T = BR.Toy;
    const n = Math.ceil(RM.countdown);
    const frac = 1 - (RM.countdown - Math.floor(RM.countdown));
    const go = n <= 0;

    /* THE FADE FLOOR IS 0.62, not the 0.35 the old numeral used.

       A 96px solid glyph survives being drawn at a third of its opacity; a
       cream disc with ink on it does not, because BOTH halves of the contrast
       fade together and what is left is a pale smudge on a grey road. Rendered
       at the same instant with the old floor and it was barely there. */
    ctx.save();
    ctx.globalAlpha = 0.62 + 0.38 * (1 - frac);
    const cx = w / 2, cy = h * 0.32;
    // Slapped on a touch bigger as it lands, then settling.
    const s = 1 + 0.10 * frac;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.rotate(go ? 0.03 : -0.035);

    const r = 60;
    ctx.beginPath();
    ctx.arc(2, 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,9,7,0.34)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = go ? T.GREEN : T.PAPER;
    ctx.fill();
    ctx.strokeStyle = T.shade(go ? T.GREEN : T.PAPER, -0.62);
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r - 7, Math.PI * 1.05, Math.PI * 1.85);
    ctx.strokeStyle = T.shade(go ? T.GREEN : T.PAPER, 0.5);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = go ? T.label(50, 800) : T.num(70, 800);
    ctx.fillStyle = go ? '#0d3325' : '#a82a20';
    ctx.fillText(go ? 'GO' : String(n), 0, 2);
    ctx.restore();
  },

  /* ── THE SCORECARD ───────────────────────────────────────────────────────
     Printed on card, because that is what a result is: the standings are a
     ruled table, the medal is a pressed foil disc, a personal best is a rubber
     stamp, and the stars are stickers.

     THE CARD IS NOT ROTATED. Everything on it that tilts — the stamp, the star
     cluster — carries no hit region; RACE AGAIN and EVENTS do, and
     Screens.button registers the rect it is told to draw at.

     Two overlaps this replaces, both visible in a render of the old card and
     neither caught by anything that measures:
       - the star count was drawn at w/2 + 110 on a 460-wide card and landed on
         top of the word PLACE;
       - UNLOCKED was drawn at cardH - 62, which is inside the standings once
         there are four racers, and it sat across the last row.
     Everything is now laid out down a single running y, so a longer list moves
     what follows it instead of colliding with it. */
  drawResults(ctx, RM, me, w, h) {
    const T = BR.Toy;
    const list = RM.standings();
    const res = BR.Screens && BR.Screens.lastResult;
    const P = BR.ProgressionManager;
    const unlocked = res && res.unlocked && res.unlocked.length ? res.unlocked : null;

    /* ── THE END OF THE CAREER ──────────────────────────────────────────────
       careerComplete(), careerPerfect() and careerState() were written, are
       correct, and NOTHING DREW THEM. Racing all twenty-six events produced an
       ordinary results card and the game never mentioned it again — a ladder
       with an ending computed and no ending shown, which from the player's seat
       is the same as not having one at all.

       `res.careerComplete` is true on exactly the card that ends it, because
       ProgressionManager compares against whether the career was already
       complete BEFORE this race, so it fires once. `careerPerfect` is the harder
       thing underneath — every event, every toy piece, every star — and may
       arrive on that same card or a long time after it. */
    const done = res && res.careerComplete;
    const perfect = res && res.careerPerfect;
    const endLines = done ? (perfect ? 2 : 1) : 0;

    const cardW = Math.min(470, w - 40);
    const rowH = 28;
    // Deep enough for a 28px headline AND the total/best line under it. At 96
    // the printed rule above the standings was drawn through the middle of
    // "TOTAL 1:11.40" — visible in a render, invisible in the code.
    const headH = 108 + (BR.Screens && BR.Screens.activeEvent ? 14 : 0);
    const cardH = headH + list.length * rowH + (unlocked ? 24 : 0) +
                  endLines * 26 + 62;
    const x = (w - cardW) / 2, y = (h - cardH) / 2;

    ctx.fillStyle = 'rgba(10,8,7,0.76)';
    ctx.fillRect(0, 0, w, h);

    T.card(ctx, x, y, cardW, cardH, 8, T.PAPER, 'paper');

    // ── headline ────────────────────────────────────────────────────────
    let cy = y + 16;

    // Whose card this is. A scorecard with no event on it could belong to any
    // race, and after a retry that is exactly the question being asked.
    const ev = BR.Screens && BR.Screens.activeEvent;
    if (ev) {
      ctx.save();
      ctx.textBaseline = 'top';
      ctx.font = T.label(10, 800);
      ctx.fillStyle = 'rgba(44,34,25,0.55)';
      ctx.fillText(ev.name.toUpperCase(), x + 60, cy);
      ctx.restore();
      cy += 14;
    }

    if (res) T.medal(ctx, x + 34, cy + 16, 16, P.medalColour(res.medal),
                     res.medal === 'none' ? '' : res.medal.charAt(0).toUpperCase());

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = T.label(28, 800);
    ctx.fillStyle = T.INK;
    ctx.fillText(RM.ordinal(me.position).toUpperCase() + ' PLACE', x + 60, cy + 2);

    ctx.font = T.label(11, 700);
    ctx.fillStyle = 'rgba(44,34,25,0.62)';
    ctx.fillText('TOTAL ' + RM.formatTime(me.finishTime) +
                 '     BEST LAP ' + RM.formatTime(me.bestLap), x + 60, cy + 38);
    ctx.restore();

    // Stars earned, as stickers on the top-right corner — clear of the
    // headline because they are anchored to the card's right edge.
    if (res && res.starsGained > 0) {
      for (let s = 0; s < res.starsGained; s++) {
        T.starSticker(ctx, x + cardW - 26 - s * 26, cy + 18, 11, true);
      }
    }

    // ── the standings, as a ruled table ─────────────────────────────────
    cy = y + headH - 30;
    ctx.save();
    ctx.strokeStyle = 'rgba(44,34,25,0.30)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 18, cy - 6); ctx.lineTo(x + cardW - 18, cy - 6);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      // Highlight the driver whose half of the screen this is, not every human.
      const mine = r === me;
      if (mine) {
        // A highlighter stripe. Translucent, so the ink under it still reads.
        ctx.fillStyle = 'rgba(255,211,77,0.55)';
        ctx.fillRect(x + 18, cy - 3, cardW - 36, rowH - 4);
      }

      ctx.save();
      ctx.textBaseline = 'top';
      ctx.font = T.label(13, mine ? 800 : 600);
      ctx.fillStyle = mine ? T.INK : 'rgba(44,34,25,0.78)';
      ctx.fillText(r.position + '.', x + 26, cy + 3);
      ctx.fillText(r.name, x + 54, cy + 3);
      ctx.textAlign = 'right';
      ctx.font = T.num(12, mine ? 800 : 600);
      // Racers still circulating show their live position and a dash, not DNF —
      // they have not failed, the race simply ended for the player first.
      ctx.fillText(r.finished ? RM.formatTime(r.finishTime)
                              : 'lap ' + (r.lap + 1) + '/' + RM.laps,
                   x + cardW - 26, cy + 4);
      ctx.restore();

      // A faint rule under every row but the last: printed tables have them.
      if (i < list.length - 1) {
        ctx.strokeStyle = 'rgba(44,34,25,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 18, cy + rowH - 5);
        ctx.lineTo(x + cardW - 18, cy + rowH - 5);
        ctx.stroke();
      }
      cy += rowH;
    }

    // ── what the race earned ────────────────────────────────────────────
    if (unlocked) {
      cy += 4;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = T.label(11, 800);
      ctx.fillStyle = '#1c6d52';
      ctx.fillText('UNLOCKED  ' +
        unlocked.map(function (id) { return BR.VEHICLES[id].name; }).join(', '),
        x + cardW / 2, cy);
      ctx.restore();
      cy += 20;
    }

    /* ── the last thing that happens ────────────────────────────────────────
       Drawn in the kit's own paper voice rather than as a special effect: this
       game is a box of toys, and the end of it should read like the sticker on
       the lid, not like a trophy cutscene. `perfect` gets its own second line
       because finishing the ladder and emptying the box are different
       achievements, and a player who has done both should be told so. */
    if (done) {
      cy += 6;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = T.label(13, 800);
      ctx.fillStyle = '#b8862c';
      ctx.fillText('THAT IS EVERY EVENT IN THE BOX', x + cardW / 2, cy);
      cy += 22;
      if (perfect) {
        ctx.font = T.label(11, 700);
        ctx.fillStyle = '#1c6d52';
        ctx.fillText('EVERY STAR, EVERY PIECE, NOTHING LEFT', x + cardW / 2, cy);
        cy += 20;
      }
      ctx.restore();
    }

    // The personal best, stamped across the corner rather than squeezed into
    // the header — a stamp is allowed to overlap, which is the point of it.
    if (res && res.personalBest) {
      T.stamp(ctx, 'NEW BEST TIME', x + cardW - 92, y + cardH - 76, '#b2352c');
    }

    // Buttons register hit regions with Screens, which owns click routing.
    // 11_UI.md: retry must be the most prominent and reachable in one press.
    const S = BR.Screens;
    if (S) {
      const bw = 150, gap = 14;
      const bx = w / 2 - bw - gap / 2;
      const by2 = y + cardH - 48;
      S.button(ctx, bx, by2, bw, 36, 'RACE AGAIN  (R)', 'retry', null, { primary: true });
      S.button(ctx, w / 2 + gap / 2, by2, bw, 36, 'EVENTS  (ESC)', 'quit', null);
    }
  },

  /* Callouts are stickers. 11_UI.md asks for exactly that, and asks for them to
     work with the sound off — so they are big, high-contrast, and never rely on
     colour alone to say which of the two they are. */
  drawCallouts(ctx, v, w, h) {
    const S = BR.Screens;
    const T = BR.Toy;

    // Toy piece pickup. Drawn here rather than in Screens because Screens does
    // not render during a race.
    if (S && S.pieceToastTime > 0) {
      const t = S.pieceToast;
      ctx.save();
      ctx.globalAlpha = Math.min(1, S.pieceToastTime);
      T.banner(ctx, 'TOY PIECE FOUND', w / 2, h * 0.30,
               { size: 20, fill: T.YELLOW, tilt: -0.03 });
      ctx.textAlign = 'center';
      ctx.font = T.label(13, 700);
      T.moulded(ctx, t.found + ' of ' + t.total, w / 2, h * 0.30 + 26,
                'rgba(245,238,222,0.9)');
      if (t.setComplete) {
        T.banner(ctx, 'SET COMPLETE — HEIRLOOM UNLOCKED', w / 2, h * 0.30 + 62,
                 { size: 14, fill: T.GREEN, ink: '#0e3629', tilt: 0.02 });
      }
      ctx.restore();
    }

    if (v.landingFlash <= 0) return;
    const clean = v.lastLanding === 'clean';
    const a = Math.min(1, v.landingFlash / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    T.banner(ctx, clean ? 'PERFECT LANDING!' : 'ROUGH LANDING', w / 2, h * 0.7,
             { size: 24, fill: clean ? T.YELLOW : '#ff7a6b',
               tilt: clean ? -0.04 : 0.05 });
    ctx.restore();
  },

  suffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const val = n % 100;
    return (s[(val - 20) % 10] || s[val] || s[0]).toUpperCase();
  },

  roundRect(ctx, x, y, w, h, r) { BR.Toy.round(ctx, x, y, w, h, r); },
};
