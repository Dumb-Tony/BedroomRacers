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

  wipe() {
    this.data = this.defaults();
    if (this.storageOk) {
      try { window.localStorage.removeItem(this.KEY); } catch (e) {}
    }
    this.saveNow();
  },

  get() {
    if (!this.data) this.load();
    return this.data;
  },
};
