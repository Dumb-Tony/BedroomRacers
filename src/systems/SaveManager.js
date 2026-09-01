/* =============================================================================
   SAVE MANAGER — LocalStorage, versioned, and defensive about it.
   =============================================================================
   Save data can vanish at any time: people clear their browser, private mode
   blocks storage, quotas fill. None of that may break the game. 15_Save_System.md
   requires the game to stay fully playable with storage disabled — progress is
   lost on refresh, which is acceptable; a crash is not.

   The `version` field exists from day one even at version 1. Retrofitting
   versioning onto an unversioned format is genuinely painful, and this game
   expects a long content tail.

   Loading MERGES against defaults, so a save written by an older build that
   lacks a field never produces undefined at the call site.
   ========================================================================== */

window.BR = window.BR || {};

BR.SaveManager = {

  KEY: 'bedroomracers.save.v1',
  VERSION: 1,

  data: null,
  storageOk: true,
  dirty: false,
  writeTimer: null,

  /* version -> function upgrading IN PLACE to version+1. Empty at v1, but the
     plumbing is here so the first migration is a data change, not a refactor. */
  MIGRATIONS: {
    // 1: function (s) { s.something = []; return s; },
  },

  defaults() {
    return {
      version: this.VERSION,
      created: Date.now(),
      updated: Date.now(),

      settings: {
        sfxVolume: 0.8,
        musicVolume: 0.32,
        controlScheme: 'simple',
        difficulty: 'normal',
        autoAccelerate: true,
        mapSize: 0.82,
        cornerHint: 1,

        /* Has this seat been shown how to play (src/ui/Coach.js). A SETTING,
           not progress, and deliberately: reset() keeps settings and import
           keeps this device's, so wiping your stars or pasting in a save code
           does not hand you the first-run lessons again. See the note at the
           top of Coach.js. */
        taught: false,
      },

      progression: {
        stars: 0,
        events: {},          // id -> { medal, objectives[], played, bestTime }
      },

      ownership: {
        vehicles: ['red-racer', 'blue-buggy'],
      },

      records: {},           // trackId -> { bestLap, bestTotal }

      /* Toy pieces are found permanently. Storing ids rather than counts means
         a piece added to a track later does not retroactively count as found. */
      collection: {
        piecesFound: [],
        setsCompleted: [],
      },

      state: {
        selectedVehicle: 'red-racer',
        player2Vehicle: 'blue-buggy',
        player3Vehicle: 'purple-micro',
        player4Vehicle: 'green-pickup',
        lastEvent: null,
      },
    };
  },

  /* ── storage probing ────────────────────────────────────────────────────
     Private mode can throw on the very first write, so availability is tested
     rather than assumed. */
  probe() {
    try {
      const k = '__br_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  },

  load() {
    this.storageOk = this.probe();

    if (!this.storageOk) {
      // In-memory only. The game runs; progress just does not persist.
      this.data = this.defaults();
      return this.data;
    }

    let raw = null;
    try { raw = window.localStorage.getItem(this.KEY); } catch (e) { raw = null; }

    if (!raw) {
      this.data = this.defaults();
      this.saveNow();
      return this.data;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // NEVER delete a save the game cannot read — back it up first.
      this.backup(raw, 'corrupt');
      this.data = this.defaults();
      this.saveNow();
      return this.data;
    }

    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      this.backup(raw, 'malformed');
      this.data = this.defaults();
      this.saveNow();
      return this.data;
    }

    if (parsed.version > this.VERSION) {
      // Written by a newer build. Do not guess at its shape.
      this.backup(raw, 'future');
      this.data = this.defaults();
      this.saveNow();
      return this.data;
    }

    while (parsed.version < this.VERSION) {
      const step = this.MIGRATIONS[parsed.version];
      if (!step) { parsed.version = this.VERSION; break; }
      parsed = step(parsed);
      parsed.version++;
    }

    this.data = this.merge(this.defaults(), parsed);
    return this.data;
  },

  /* Additive changes are always safe: anything missing falls back to default. */
  merge(def, got) {
    if (got === null || got === undefined) return def;
    if (Array.isArray(def)) return Array.isArray(got) ? got : def;
    if (typeof def !== 'object') return typeof got === typeof def ? got : def;

    const out = {};
    for (const k in def) out[k] = this.merge(def[k], got[k]);
    // Keep unknown keys so a downgrade does not silently destroy newer data.
    for (const k in got) if (!(k in out)) out[k] = got[k];
    return out;
  },

  backup(raw, reason) {
    try {
      window.localStorage.setItem(
        'bedroomracers.save.' + reason + '.' + Date.now(), raw);
    } catch (e) { /* out of room — the live save matters more */ }
  },

  /* Writes are debounced. LocalStorage is synchronous, so writing per frame or
     per lap causes visible hitches. */
  save() {
    this.dirty = true;
    if (this.writeTimer) return;
    const self = this;
    this.writeTimer = setTimeout(function () {
      self.writeTimer = null;
      if (self.dirty) self.saveNow();
    }, 400);
  },

  /**
   * Wipe progress back to a fresh save.
   *
   * SETTINGS SURVIVE. Volume, difficulty, map size and auto-accelerate are how
   * the player has set the game up to be played, not something they earned —
   * resetting progress should not also turn the sound back up and undo their
   * control preferences. Everything else goes: stars, medals, objectives,
   * records, owned vehicles.
   *
   * Written immediately rather than through the 400ms debounce, because the
   * player has just confirmed a destructive action and expects it to be done.
   */
  reset() {
    const keepSettings = this.get().settings;
    this.data = this.defaults();
    this.data.settings = keepSettings;
    this.saveNow();
    return this.data;
  },

  saveNow() {
    this.dirty = false;
    if (!this.storageOk || !this.data) return false;
    this.data.updated = Date.now();
    try {
      window.localStorage.setItem(this.KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      // Quota. Shed the least valuable data first — never settings.
      try {
        this.data.records = {};
        window.localStorage.setItem(this.KEY, JSON.stringify(this.data));
        return true;
      } catch (e2) {
        this.storageOk = false;   // give up writing, keep playing
        return false;
      }
    }
  },

  /* There was a `wipe()` here that took everything, settings included. Nothing
     called it: the only reset the game offers is the two-step button on the
     main menu, and that goes through `reset()`, which deliberately KEEPS
     settings (15_Save_System.md q4). Two functions for "start again" that
     disagree about volume and difficulty is one too many. */

  /* ══ SAVE CODES ═══════════════════════════════════════════════════════════
     15_Save_System.md open question 2. LocalStorage is per-origin AND per
     browser profile, so a save is trapped in the browser that made it. There
     is no server and never will be, so the only way progress crosses a machine
     is if the player carries it: a code they copy out of one browser and paste
     into another.

     THE CODE CARRIES PROGRESS, NOT SETTINGS — the same line reset() draws,
     from the other side. Volume, difficulty, minimap and auto-accelerate
     describe the place you are playing (headphones or a tinny laptop, a phone
     or a desk), and a code arriving from somewhere else has no business
     overwriting them. reset() keeps settings and drops progress; import keeps
     THIS device's settings and takes the progress. Both say the same thing:
     progress belongs to the player, settings belong to the seat.

     Shape:

         BR01-CHK1234-ABCDE-FGHJK-…

         BR       marker
         01       save version, in plain digits so a code from a NEWER build is
                  refused BEFORE a single byte of it is decoded
         CHK1234  FNV-1a 32 of the payload, 7 base32 characters
         rest     Crockford base32 of the payload, grouped in fives

     Crockford base32 rather than base64: the code gets pasted by hand and
     sometimes read aloud or retyped. It has no case, no punctuation, and no
     0/O or 1/I/L confusion, so the usual transcription slips decode to the
     same bytes instead of failing. Everything that is not an alphabet
     character is stripped before parsing, so line wraps, spaces and stray
     dashes are all harmless.

     The payload is LZW-compressed when that helps. The data is JSON full of
     repeated ids — 'sandbox-', '-01', the nine objective names over and over —
     which is exactly what LZW eats. A method byte in front says which, so an
     incompressible payload ships raw rather than growing.

     Nothing is trusted. A code is decoded, checksummed, unpacked, parsed and
     then type-checked field by field, and only when all of that passes is the
     live save touched — see importCode(). A code that fails at any step leaves
     the existing save exactly as it was.
     ====================================================================== */

  /* Crockford's alphabet: no I, L, O or U. */
  CODE_ALPHABET: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  CODE_MEDALS: ['none', 'bronze', 'silver', 'gold', 'platinum'],
  CODE_MEDAL_CHARS: 'NBSGP',

  /* A hand-pasted code is never this long. The cap exists so a pathological
     paste cannot make the decoder do real work before being refused. */
  CODE_MAX_CHARS: 20000,
  CODE_MAX_BYTES: 262144,

  /* Mirrors MIGRATIONS above: version -> function upgrading a decoded PAYLOAD
     to version+1. Empty at v1; the loop exists so the first one is a data
     change rather than a refactor. */
  CODE_MIGRATIONS: {
  },

  /* ── bytes ────────────────────────────────────────────────────────────── */

  /* Hand-rolled rather than TextEncoder: this has to work inside whatever the
     artifact host wraps the page in, and a dozen lines beats a capability
     check. Ids are ASCII today, but a code should not corrupt itself the day
     one is not. */
  utf8Encode(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) { out.push(c); continue; }
      if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); continue; }
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          const cp = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                   0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
          i++;
          continue;
        }
      }
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  },

  utf8Decode(b) {
    let s = '';
    for (let i = 0; i < b.length;) {
      const c = b[i++];
      if (c < 0x80) { s += String.fromCharCode(c); continue; }
      const need = (c & 0xe0) === 0xc0 ? 1 : (c & 0xf0) === 0xe0 ? 2
                 : (c & 0xf8) === 0xf0 ? 3 : -1;
      if (need < 0 || i + need > b.length) return null;
      let cp = c & (need === 1 ? 31 : need === 2 ? 15 : 7);
      for (let k = 0; k < need; k++) {
        const t = b[i++];
        if ((t & 0xc0) !== 0x80) return null;
        cp = (cp << 6) | (t & 63);
      }
      if (cp < 0x10000) s += String.fromCharCode(cp);
      else {
        const v = cp - 0x10000;
        s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
      }
    }
    return s;
  },

  /* FNV-1a 32. Not a hash for security — it is a smoke alarm for a character
     that got flipped, dropped or autocorrected somewhere between two browsers,
     and it catches every single-character change in the encoded body. */
  fnv1a(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  },

  /* ── base32 ───────────────────────────────────────────────────────────── */

  b32Encode(bytes) {
    const A = this.CODE_ALPHABET;
    let s = '', acc = 0, nb = 0;
    for (let i = 0; i < bytes.length; i++) {
      acc = (acc << 8) | bytes[i];
      nb += 8;
      while (nb >= 5) { nb -= 5; s += A.charAt((acc >> nb) & 31); acc &= (1 << nb) - 1; }
    }
    if (nb > 0) s += A.charAt((acc << (5 - nb)) & 31);
    return s;
  },

  b32Decode(str) {
    const A = this.CODE_ALPHABET;
    const out = [];
    let acc = 0, nb = 0;
    for (let i = 0; i < str.length; i++) {
      const v = A.indexOf(str.charAt(i));
      if (v < 0) return null;                       // U, or anything else stray
      acc = (acc << 5) | v;
      nb += 5;
      if (nb >= 8) { nb -= 8; out.push((acc >> nb) & 255); acc &= (1 << nb) - 1; }
    }
    /* The encoder pads with ZERO bits, so a non-zero remainder is a typo in the
       last character, and a whole spare character is a code that grew. Without
       this the final character carries bits nothing checks: fuzzing all 27249
       single-character bends of a full-progress code found the last position was
       the only one that got past the checksum. It still decoded correctly every
       time — but a typo the code accepts in silence is a typo it should name. */
    if (acc !== 0 || nb >= 5) return null;
    return out;
  },

  /* A 32-bit value as exactly 7 alphabet characters (35 bits, so it always
     fits and always has the same length — a short code is a broken code). */
  chk32(n) {
    const A = this.CODE_ALPHABET;
    let s = '', v = n >>> 0;
    for (let i = 0; i < 7; i++) { s = A.charAt(v % 32) + s; v = Math.floor(v / 32); }
    return s;
  },

  /* ── LZW ──────────────────────────────────────────────────────────────────
     Variable width, 9 to 15 bits, dictionary frozen when full.

     The decoder is always exactly ONE entry behind the encoder — it cannot add
     the entry for a code until it has read the next one. So the two grow their
     code width off different counters: the encoder on `next`, the decoder on
     `next + 1`. Get that wrong and the streams desynchronise thousands of
     bytes in, which is why the harness fuzzes the round trip rather than
     trusting a single sample. */
  CODE_LZW_MAX: 32768,

  lzwPack(bytes) {
    /* A NULL-PROTOTYPE map, because the keys are arbitrary byte sequences. On
       a plain object the sequence 'constructor' reads back as a function, so
       the encoder would think it had already seen a string it never emitted
       and produce a stream nothing can decode. */
    const dict = Object.create(null);
    for (let i = 0; i < 256; i++) dict[String.fromCharCode(i)] = i;
    let next = 256, width = 9;
    const out = [];
    let acc = 0, nb = 0;

    const emit = function (code) {
      acc = (acc << width) | code;
      nb += width;
      while (nb >= 8) { nb -= 8; out.push((acc >> nb) & 255); }
      acc &= (1 << nb) - 1;
    };

    let w = '';
    for (let i = 0; i < bytes.length; i++) {
      const ch = String.fromCharCode(bytes[i]);
      const wc = w + ch;
      if (dict[wc] !== undefined) { w = wc; continue; }
      emit(dict[w]);
      if (next < this.CODE_LZW_MAX) {
        dict[wc] = next++;
        if (next > (1 << width) && width < 15) width++;
      }
      w = ch;
    }
    if (w !== '') emit(dict[w]);
    if (nb > 0) out.push((acc << (8 - nb)) & 255);
    return out;
  },

  lzwUnpack(bytes) {
    const dict = [];
    for (let i = 0; i < 256; i++) dict.push(String.fromCharCode(i));
    let next = 256, width = 9;
    let bi = 0, acc = 0, nb = 0;

    const take = function () {
      while (nb < width) {
        if (bi >= bytes.length) return -1;
        acc = (acc << 8) | bytes[bi++];
        nb += 8;
      }
      nb -= width;
      const v = (acc >> nb) & ((1 << width) - 1);
      acc &= (1 << nb) - 1;
      return v;
    };

    const out = [];
    let prev = null;
    for (;;) {
      const code = take();
      if (code < 0) break;                       // only pad bits left
      let entry;
      if (code < dict.length) entry = dict[code];
      else if (code === dict.length && prev !== null) entry = prev + prev.charAt(0);
      else return null;                          // a code that was never defined

      for (let i = 0; i < entry.length; i++) out.push(entry.charCodeAt(i));
      if (out.length > this.CODE_MAX_BYTES) return null;

      if (prev !== null && next < this.CODE_LZW_MAX) { dict.push(prev + entry.charAt(0)); next++; }
      if (next + 1 > (1 << width) && width < 15) width++;
      prev = entry;
    }
    return out;
  },

  /* ── the payload ──────────────────────────────────────────────────────────
     Short keys and arrays, but FULL STRING IDS. Encoding events and pieces as
     indexes into BR.EVENTS would halve the code and was rejected: content is
     added between builds, so an index means a code written before a new event
     silently lands its medals on the wrong ones. A string id is either known or
     ignored. LZW pays most of the size back anyway, because the ids repeat. */
  snapshot() {
    const s = this.get();
    const M = this.CODE_MEDAL_CHARS, ORD = this.CODE_MEDALS;

    const e = {};
    const src = s.progression.events || {};
    for (const id in src) {
      const r = src[id] || {};
      const mi = ORD.indexOf(r.medal);
      e[id] = [
        M.charAt(mi < 0 ? 0 : mi),
        (r.objectives || []).slice(),
        r.played || 0,
        (typeof r.bestTime === 'number' && isFinite(r.bestTime)) ? r.bestTime : null,
      ];
    }

    const r = {};
    const rsrc = s.records || {};
    for (const id in rsrc) {
      const t = rsrc[id] || {};
      const lap = (typeof t.bestLap === 'number' && isFinite(t.bestLap)) ? t.bestLap : null;
      const tot = (typeof t.bestTotal === 'number' && isFinite(t.bestTotal)) ? t.bestTotal : null;
      if (lap === null && tot === null) continue;      // an empty row is noise
      r[id] = [lap, tot];
    }

    return {
      v: this.VERSION,
      s: s.progression.stars || 0,
      e: e,
      r: r,
      o: (s.ownership.vehicles || []).slice(),
      p: (s.collection.piecesFound || []).slice(),
      c: (s.collection.setsCompleted || []).slice(),
      sv: s.state.selectedVehicle,
    };
  },

  /**
   * Build a save code for the current progress.
   * @returns {string|null} null only if the code failed to verify against
   *          itself, in which case handing it over would be worse than saying
   *          no — a code that does not decode is a code that loses a save.
   */
  exportCode() {
    const payload = this.snapshot();
    const json = JSON.stringify(payload);
    const raw = this.utf8Encode(json);

    const packed = this.lzwPack(raw);
    const body = (packed && packed.length < raw.length)
      ? [1].concat(packed)
      : [0].concat(raw);

    const ver = ('0' + this.VERSION).slice(-2);
    const code = 'BR' + ver + '-' + this.chk32(this.fnv1a(body)) + '-' +
                 this.groupCode(this.b32Encode(body));

    /* Decode what was just produced and compare. Encoding is the one step with
       nobody downstream to catch it, and a broken code would only be
       discovered on the machine that has nothing on it. */
    const back = this.decodeCode(code);
    if (!back.ok) return null;
    if (JSON.stringify(back.payload) !== JSON.stringify(JSON.parse(json))) return null;
    return code;
  },

  /* Fives, because a wall of 900 characters cannot be checked by eye and the
     dashes are stripped on the way back in. */
  groupCode(s) {
    const parts = [];
    for (let i = 0; i < s.length; i += 5) parts.push(s.substr(i, 5));
    return parts.join('-');
  },

  /* Uppercase, fold Crockford's confusable characters, drop everything that is
     not an alphabet character. That last step is what makes a code survive an
     email client: line breaks, spaces, quotes and stray dashes all vanish. */
  normaliseCode(str) {
    return String(str).toUpperCase()
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9A-Z]/g, '');
  },

  /**
   * Decode and validate a code WITHOUT touching the save.
   * @returns {{ok:true, payload:object, version:number}|{ok:false, reason:string}}
   */
  decodeCode(str) {
    const NOPE = 'That does not look like a save code';
    const BROKEN = 'That code is damaged — copy the whole thing again';

    if (typeof str !== 'string' || !str) return { ok: false, reason: NOPE };
    if (str.length > this.CODE_MAX_CHARS) return { ok: false, reason: NOPE };

    const s = this.normaliseCode(str);
    // 2 marker + 2 version + 7 checksum + at least one payload character.
    if (s.length < 12) return { ok: false, reason: 'That code is too short to be whole' };
    if (s.charAt(0) !== 'B' || s.charAt(1) !== 'R') return { ok: false, reason: NOPE };

    const vs = s.substr(2, 2);
    if (vs.charCodeAt(0) < 48 || vs.charCodeAt(0) > 57 ||
        vs.charCodeAt(1) < 48 || vs.charCodeAt(1) > 57) {
      return { ok: false, reason: NOPE };
    }
    const ver = parseInt(vs, 10);
    if (ver < 1) return { ok: false, reason: NOPE };

    /* Refused HERE, before the body is decoded at all. A newer build may mean
       anything by these bytes; reading the half we recognise is how a save ends
       up plausible and wrong. */
    if (ver > this.VERSION) {
      return { ok: false, reason: 'That code is from a newer version of the game' };
    }

    const bytes = this.b32Decode(s.substr(11));
    if (!bytes || !bytes.length) return { ok: false, reason: BROKEN };
    if (this.chk32(this.fnv1a(bytes)) !== s.substr(4, 7)) return { ok: false, reason: BROKEN };

    let raw;
    if (bytes[0] === 0) raw = bytes.slice(1);
    else if (bytes[0] === 1) raw = this.lzwUnpack(bytes.slice(1));
    else return { ok: false, reason: BROKEN };
    if (!raw) return { ok: false, reason: BROKEN };

    const json = this.utf8Decode(raw);
    if (json === null) return { ok: false, reason: BROKEN };

    let payload;
    try { payload = JSON.parse(json); } catch (e) { return { ok: false, reason: BROKEN }; }

    /* The version is stated TWICE — once in the clear, so it can be refused
       before anything is decoded, and once inside the payload. They must agree,
       or a body has been spliced onto a header that lies about it. */
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        payload.v !== ver) {
      return { ok: false, reason: BROKEN };
    }

    try { payload = this.migrateCode(payload, ver); }
    catch (e) { return { ok: false, reason: BROKEN }; }

    const fault = this.codeFault(payload);
    if (fault) return { ok: false, reason: fault };

    return { ok: true, payload: payload, version: ver };
  },

  migrateCode(payload, ver) {
    let v = ver;
    while (v < this.VERSION) {
      const step = this.CODE_MIGRATIONS[v];
      if (!step) { v = this.VERSION; break; }
      payload = step(payload);
      v++;
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload.v = this.VERSION;
    }
    return payload;
  },

  /* ── validation ───────────────────────────────────────────────────────────
     Type-checked field by field rather than merged optimistically. merge() is
     right for a save this build wrote; a save code arrives from outside and may
     be anything at all, and half-reading it is exactly the failure the version
     check exists to prevent. One bad field rejects the whole code. */

  isCodeId(s) {
    if (typeof s !== 'string' || !s.length || s.length > 64) return false;
    // Assigning these as object keys would reach the prototype, not the map.
    return s !== '__proto__' && s !== 'constructor' && s !== 'prototype';
  },

  isCodeIdList(a, max) {
    if (!Array.isArray(a) || a.length > max) return false;
    for (let i = 0; i < a.length; i++) if (!this.isCodeId(a[i])) return false;
    return true;
  },

  isCodeCount(n, max) {
    return typeof n === 'number' && isFinite(n) && n >= 0 &&
           n === Math.floor(n) && n <= max;
  },

  isCodeTime(t) {
    return t === null || (typeof t === 'number' && isFinite(t) && t >= 0 && t < 1e9);
  },

  codeFault(p) {
    const BAD = 'That code does not hold readable progress';
    if (!p || typeof p !== 'object' || Array.isArray(p)) return BAD;
    if (p.v !== this.VERSION) return BAD;
    if (!this.isCodeCount(p.s, 100000)) return BAD;
    if (!p.e || typeof p.e !== 'object' || Array.isArray(p.e)) return BAD;
    if (!p.r || typeof p.r !== 'object' || Array.isArray(p.r)) return BAD;
    if (!this.isCodeIdList(p.o, 400)) return BAD;
    if (!this.isCodeIdList(p.p, 4000)) return BAD;
    if (!this.isCodeIdList(p.c, 400)) return BAD;
    if (p.sv !== undefined && p.sv !== null && !this.isCodeId(p.sv)) return BAD;

    let n = 0;
    for (const id in p.e) {
      if (++n > 2000 || !this.isCodeId(id)) return BAD;
      const a = p.e[id];
      if (!Array.isArray(a) || a.length !== 4) return BAD;
      if (typeof a[0] !== 'string' || a[0].length !== 1 ||
          this.CODE_MEDAL_CHARS.indexOf(a[0]) < 0) return BAD;
      if (!this.isCodeIdList(a[1], 64)) return BAD;
      if (!this.isCodeCount(a[2], 1e7)) return BAD;
      if (!this.isCodeTime(a[3])) return BAD;
    }

    n = 0;
    for (const id in p.r) {
      if (++n > 2000 || !this.isCodeId(id)) return BAD;
      const a = p.r[id];
      if (!Array.isArray(a) || a.length !== 2) return BAD;
      if (!this.isCodeTime(a[0]) || !this.isCodeTime(a[1])) return BAD;
    }
    return null;
  },

  /* What a code holds, for the confirmation that names both sides before
     anything is replaced. */
  codeTally(p) {
    let medals = 0;
    for (const id in p.e) if (p.e[id][0] !== 'N') medals++;
    return { stars: p.s || 0, medals: medals, pieces: (p.p || []).length,
             vehicles: (p.o || []).length };
  },

  /** The same tally for whatever is in the save right now. */
  saveTally() {
    const s = this.get();
    const evs = s.progression.events || {};
    let medals = 0;
    for (const id in evs) if (evs[id] && evs[id].medal && evs[id].medal !== 'none') medals++;
    return { stars: s.progression.stars || 0, medals: medals,
             pieces: (s.collection.piecesFound || []).length,
             vehicles: (s.ownership.vehicles || []).length };
  },

  /**
   * Replace progress with what a code holds. DESTRUCTIVE, and deliberately the
   * last thing that happens: decodeCode() has already proved the whole code
   * before a single field is written, so a bad code cannot leave a half-import
   * behind. On failure the live save has not been touched at all.
   *
   * Built from defaults() outward rather than merged over the old save, so
   * anything the code does not carry comes back at its default instead of
   * being inherited from whoever was playing here before.
   *
   * Written through saveNow(): the player has just confirmed a destructive
   * action, and a refresh one tick later must not resurrect what it replaced.
   *
   * @returns {{ok:true, tally:object}|{ok:false, reason:string}}
   */
  importCode(str) {
    const res = this.decodeCode(str);
    if (!res.ok) return res;

    const p = res.payload;
    const cur = this.get();
    const next = this.defaults();

    // This device's settings stay put — see the note at the top of this block.
    next.settings = cur.settings;
    // The code carries no timestamps: `created` describes this save slot, not
    // the progress that just moved into it.
    next.created = cur.created;

    next.progression.stars = p.s;
    const evs = {};
    for (const id in p.e) {
      const a = p.e[id];
      evs[id] = {
        medal: this.CODE_MEDALS[this.CODE_MEDAL_CHARS.indexOf(a[0])],
        objectives: a[1].slice(),
        played: a[2],
        bestTime: a[3],
      };
    }
    next.progression.events = evs;

    const recs = {};
    for (const id in p.r) recs[id] = { bestLap: p.r[id][0], bestTotal: p.r[id][1] };
    next.records = recs;

    next.ownership.vehicles = p.o.slice();
    next.collection.piecesFound = p.p.slice();
    next.collection.setsCompleted = p.c.slice();

    /* Only if the code actually owns it. An unowned selection is repaired
       downstream by selectedVehicleFor(), but starting from a coherent state
       beats relying on the repair. */
    if (typeof p.sv === 'string' && p.o.indexOf(p.sv) !== -1) {
      next.state.selectedVehicle = p.sv;
    }

    this.data = next;
    this.saveNow();
    return { ok: true, tally: this.codeTally(p) };
  },

  get() {
    if (!this.data) this.load();
    return this.data;
  },
};
