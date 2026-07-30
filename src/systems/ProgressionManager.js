/* =============================================================================
   PROGRESSION MANAGER — medals, stars, unlocks, records.
   =============================================================================
   Owns everything that outlives a race. Reads and writes through SaveManager,
   never LocalStorage directly.

   Medals never go DOWN. Replaying an event you already golded and finishing
   fourth must not take the gold away — players replay to chase objectives and
   times, and losing progress for trying is the fastest way to stop them.
   ========================================================================== */

window.BR = window.BR || {};

BR.ProgressionManager = {

  MEDAL_ORDER: ['none', 'bronze', 'silver', 'gold', 'platinum'],

  save() { return BR.SaveManager.get(); },

  /* ── queries ───────────────────────────────────────────────────────────── */

  stars() { return this.save().progression.stars; },

  eventRecord(id) {
    const ev = this.save().progression.events;
    if (!ev[id]) ev[id] = { medal: 'none', objectives: [], played: 0, bestTime: null };
    return ev[id];
  },

  medalOf(id) { return this.eventRecord(id).medal; },

  isEventUnlocked(event) {
    return this.stars() >= (event.unlockStars || 0);
  },

  ownedVehicles() { return this.save().ownership.vehicles.slice(); },

  isVehicleOwned(id) {
    return this.save().ownership.vehicles.indexOf(id) !== -1;
  },

  /* ── toy pieces ────────────────────────────────────────────────────────── */

  piecesFound() { return this.save().collection.piecesFound; },

  hasPiece(id) { return this.piecesFound().indexOf(id) !== -1; },

  piecesTotal() { return BR.allPieceIds().length; },

  setComplete() {
    const all = BR.allPieceIds();
    for (let i = 0; i < all.length; i++) if (!this.hasPiece(all[i])) return false;
    return all.length > 0;
  },

  /**
   * Found permanently, the instant it is touched — not banked at the finish.
   * Quitting a race keeps what you picked up, which matters because the whole
   * point of a piece is that fetching it costs you the lap.
   * @returns {object|null} null if already had it
   */
  findPiece(id) {
    if (this.hasPiece(id)) return null;
    this.piecesFound().push(id);

    const out = { id: id, found: this.piecesFound().length,
                  total: this.piecesTotal(), unlocked: [] };
    if (this.setComplete()) {
      const done = this.save().collection.setsCompleted;
      if (done.indexOf('toy-set') === -1) done.push('toy-set');
      out.unlocked = this.applyUnlocks();
      out.setComplete = true;
    }
    BR.SaveManager.save();
    return out;
  },

  /* What a locked vehicle needs. Locked content stays visible so the player can
     see what is coming (11_UI.md). */
  unlockFor(vehicleId) {
    for (let i = 0; i < BR.UNLOCKS.length; i++) {
      if (BR.UNLOCKS[i].vehicle === vehicleId) return BR.UNLOCKS[i];
    }
    return null;
  },

  selectedVehicle() {
    const id = this.save().state.selectedVehicle;
    return this.isVehicleOwned(id) ? id : this.save().ownership.vehicles[0];
  },

  selectVehicle(id) {
    if (!this.isVehicleOwned(id)) return false;
    this.save().state.selectedVehicle = id;
    BR.SaveManager.save();
    return true;
  },

  /* ── recording a result ────────────────────────────────────────────────── */

  /* Platinum is the mastery tier, so it is not available on Easy — where
     opponents are slower and the player's own crashes are softened, a platinum
     would not mean the same thing as anyone else's. Gold and below are
     unaffected: the point of an easier setting is to be able to finish and
     progress. */
  medalForPosition(position, total, time, event, difficulty) {
    const platAllowed = difficulty !== 'easy';

    // Time trials have no position to earn, so the clock is the whole contest.
    if (event.mode === 'time-trial') {
      if (time === null) return 'none';
      if (platAllowed && event.platinumTime && time <= event.platinumTime) return 'platinum';
      if (time <= event.times.gold) return 'gold';
      if (time <= event.times.silver) return 'silver';
      if (time <= event.times.bronze) return 'bronze';
      return 'none';
    }
    if (platAllowed && event.platinumTime && time !== null &&
        time <= event.platinumTime && position === 1) {
      return 'platinum';
    }
    if (position === 1) return 'gold';
    if (position <= Math.max(2, Math.ceil(total / 2))) return 'silver';
    return 'bronze';
  },

  /**
   * @param {object} event
   * @param {object} r  { position, total, finished, time, bestLap, collisions,
   *                      driftSeconds, trackId }
   * @returns {object}  what changed, for the results screen to announce
   */
  record(event, r) {
    const rec = this.eventRecord(event.id);
    rec.played++;

    const out = {
      medal: 'none', medalImproved: false,
      newObjectives: [], starsGained: 0,
      unlocked: [], personalBest: false,
    };

    if (!r.finished) {
      BR.SaveManager.save();
      return out;
    }

    // ── medal ──────────────────────────────────────────────────────────────
    const medal = this.medalForPosition(r.position, r.total, r.time, event,
                                        r.difficulty || 'normal');
    out.medal = medal;
    if (this.MEDAL_ORDER.indexOf(medal) > this.MEDAL_ORDER.indexOf(rec.medal)) {
      rec.medal = medal;
      out.medalImproved = true;
    }

    // ── objectives ─────────────────────────────────────────────────────────
    const done = this.checkObjectives(event, r);
    for (let i = 0; i < done.length; i++) {
      if (rec.objectives.indexOf(done[i]) === -1) {
        rec.objectives.push(done[i]);
        out.newObjectives.push(done[i]);
      }
    }
    out.starsGained = out.newObjectives.length;
    if (out.starsGained > 0) {
      this.save().progression.stars += out.starsGained;
    }

    // ── times ──────────────────────────────────────────────────────────────
    if (rec.bestTime === null || r.time < rec.bestTime) {
      rec.bestTime = r.time;
      out.personalBest = true;
    }
    const recs = this.save().records;
    if (!recs[r.trackId]) recs[r.trackId] = { bestLap: null, bestTotal: null };
    const tr = recs[r.trackId];
    if (r.bestLap !== null && (tr.bestLap === null || r.bestLap < tr.bestLap)) {
      tr.bestLap = r.bestLap;
    }
    if (tr.bestTotal === null || r.time < tr.bestTotal) tr.bestTotal = r.time;

    // ── unlocks ────────────────────────────────────────────────────────────
    out.unlocked = this.applyUnlocks();

    BR.SaveManager.save();
    return out;
  },

  checkObjectives(event, r) {
    const done = [];
    for (let i = 0; i < event.objectives.length; i++) {
      const o = event.objectives[i];
      let ok = false;
      switch (o.id) {
        case 'finish':   ok = r.finished; break;
        case 'podium':   ok = r.position <= 3; break;
        case 'win':      ok = r.position === 1; break;
        case 'clean':    ok = r.collisions < 4; break;
        case 'spotless': ok = r.position === 1 && r.collisions === 0; break;
        case 'drifter':  ok = r.driftSeconds >= 6; break;
        case 'lap':      ok = r.bestLap !== null &&
                              r.bestLap < (event.id === 'rug-route-03' ? 27 : 29); break;
        case 'ttGold':   ok = r.time !== null && event.times &&
                              r.time <= event.times.gold; break;
        case 'ttPlat':   ok = r.time !== null && event.platinumTime &&
                              r.time <= event.platinumTime; break;
      }
      if (ok) done.push(o.id);
    }
    return done;
  },

  /* Grants anything the current star total has earned. Idempotent, so it is
     safe to call on load as well as after a race — that also repairs a save
     where stars were earned by a build that predates an unlock. */
  applyUnlocks() {
    const owned = this.save().ownership.vehicles;
    const stars = this.stars();
    const gained = [];
    for (let i = 0; i < BR.UNLOCKS.length; i++) {
      const u = BR.UNLOCKS[i];
      if (owned.indexOf(u.vehicle) !== -1) continue;
      const earned = u.pieces === 'all' ? this.setComplete() : stars >= u.stars;
      if (earned) {
        owned.push(u.vehicle);
        gained.push(u.vehicle);
      }
    }
    return gained;
  },

  /* Total possible stars, for the progress readout. */
  maxStars() {
    let n = 0;
    for (let i = 0; i < BR.EVENTS.length; i++) n += BR.EVENTS[i].objectives.length;
    return n;
  },

  medalColour(m) {
    return { platinum: '#d8e8f0', gold: '#ffd34d', silver: '#c8ccd2',
             bronze: '#c88a4f', none: 'rgba(255,255,255,0.18)' }[m] || '#888';
  },
};
