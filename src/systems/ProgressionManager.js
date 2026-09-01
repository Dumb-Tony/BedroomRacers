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

  /* ── the end of the career ─────────────────────────────────────────────
     A career that cannot be finished is not a career, it is a list. Before
     this there was no expression anywhere in the game for "you have done it" —
     the ladder simply ran out, and the only terminal event of any kind was a
     3.2-second banner during a race when the last toy piece was touched.

     Three distinct endings, deliberately, because they are three different
     kinds of thorough and 06_Progression_Career.md wants them told apart:

       finished   every event raced and medalled — you have seen all of it
       collected  every toy piece found — the Heirloom, and the only thing
                  stars cannot buy (09_Vehicles.md)
       perfect    both, plus every star

     These are QUERIES, not state: nothing is stored, so they cannot drift out
     of step with the save and they are correct the moment a save is imported
     by code. */

  /* Reads the map directly rather than going through eventRecord(), which
     CREATES a record for anything it is asked about. This is called twice per
     race from record(); routing it through eventRecord would quietly write an
     empty entry for all 26 events into every save on the first finish. */
  eventsFinished() {
    const evs = this.save().progression.events;
    let n = 0;
    for (let i = 0; i < BR.EVENTS.length; i++) {
      const rec = evs[BR.EVENTS[i].id];
      if (rec && rec.medal && rec.medal !== 'none') n++;
    }
    return n;
  },

  /** Every event raced to a medal. The ladder's own ending. */
  careerComplete() {
    return BR.EVENTS.length > 0 &&
           this.eventsFinished() === BR.EVENTS.length;
  },

  /** Nothing left in the game. */
  careerPerfect() {
    return this.careerComplete() && this.setComplete() &&
           this.stars() >= this.maxStars();
  },

  /** One call for anything that wants to show where the player is. */
  careerState() {
    return {
      events:    this.eventsFinished(),
      eventsOf:  BR.EVENTS.length,
      stars:     this.stars(),
      starsOf:   this.maxStars(),
      pieces:    this.piecesFound().length,
      piecesOf:  this.piecesTotal(),
      complete:  this.careerComplete(),
      collected: this.setComplete(),
      perfect:   this.careerPerfect(),
    };
  },

  /* What a locked vehicle needs. Locked content stays visible so the player can
     see what is coming (11_UI.md). */
  unlockFor(vehicleId) {
    for (let i = 0; i < BR.UNLOCKS.length; i++) {
      if (BR.UNLOCKS[i].vehicle === vehicleId) return BR.UNLOCKS[i];
    }
    return null;
  },

  /* Four slots, one per possible player. They persist like anything else, so a
     group does not re-pick every session. Slot 1 keeps the original key name so
     existing saves carry over untouched. */
  MAX_SLOTS: 4,

  slotKey(slot) {
    return slot > 1 ? ('player' + slot + 'Vehicle') : 'selectedVehicle';
  },

  /** What every other slot is currently holding. */
  otherSlotVehicles(slot) {
    const st = this.save().state;
    const out = [];
    for (let s = 1; s <= this.MAX_SLOTS; s++) {
      if (s !== slot) out.push(st[this.slotKey(s)]);
    }
    return out;
  },

  selectedVehicleFor(slot) {
    const st = this.save().state;
    const id = st[this.slotKey(slot)];
    if (this.isVehicleOwned(id)) return id;

    // Fall back to anything owned that no other slot is using — several players
    // in the same car is confusing on track and in the standings.
    const taken = this.otherSlotVehicles(slot);
    const owned = this.ownedVehicles();
    for (let i = 0; i < owned.length; i++) {
      if (taken.indexOf(owned[i]) === -1) return owned[i];
    }
    // More players than cars. Duplicates beat crashing.
    return owned[0];
  },

  selectedVehicle() { return this.selectedVehicleFor(1); },

  /**
   * Assign a car to a slot. If the other player already has it, the two SWAP
   * rather than the pick being refused — it always does something sensible,
   * and duplicates become impossible rather than merely discouraged.
   */
  selectVehicleFor(id, slot) {
    if (!this.isVehicleOwned(id)) return false;
    const st = this.save().state;
    const mine = this.slotKey(slot);

    // Whichever slot already holds this car gives it up and takes ours.
    for (let s = 1; s <= this.MAX_SLOTS; s++) {
      if (s === slot) continue;
      const key = this.slotKey(s);
      if (st[key] === id) { st[key] = st[mine]; break; }
    }
    st[mine] = id;
    BR.SaveManager.save();
    return true;
  },

  selectVehicle(id) { return this.selectVehicleFor(id, 1); },

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

    // Sampled BEFORE this race's medal lands, so "did this race finish the
    // career?" can be answered by comparing the two.
    const wasComplete = this.careerComplete();

    const out = {
      medal: 'none', medalImproved: false,
      newObjectives: [], starsGained: 0,
      unlocked: [], personalBest: false,
      careerComplete: false, careerPerfect: false,
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

    /* THE HEIRLOOM IS SAID TWICE NOW, and it used to be said once.

       findPiece() grants it the instant the last toy piece is touched, which
       is right — a piece is banked on contact so that quitting the lap you
       spent fetching it still keeps it. But the announcement went with the
       grant: a banner during the race, at 3.2 seconds, over a car the player is
       still driving. Miss it and the game has told you nothing. The rarest
       thing in it — the only reward stars cannot buy, and the end of a
       48-piece collection spread across twelve tracks — could be handed over
       while you were busy looking at the next corner.

       So the first results card AFTER the set completes says it again, through
       the `unlocked` list the card already draws. No new UI: HUD.drawResults
       prints "UNLOCKED  <name>" for whatever is in here.

       The marker lives in setsCompleted because that array is already
       persisted AND already carried by save codes (SaveManager.js), so the
       announcement happens exactly once per save and survives an export. */
    const sets = this.save().collection.setsCompleted;
    if (this.setComplete() && sets.indexOf('toy-set-shown') === -1) {
      sets.push('toy-set-shown');
      if (out.unlocked.indexOf('heirloom') === -1) out.unlocked.push('heirloom');
    }

    /* Did this race end the career? Only true on the one result card that
       finishes it, never on a replay afterwards. */
    out.careerComplete = !wasComplete && this.careerComplete();
    out.careerPerfect  = this.careerPerfect();

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
        /* The threshold is the EVENT'S, not this file's. It used to read
           `event.id === 'rug-route-03' ? 27 : 29` — a track's measured lap time
           hardcoded into the progression system by id, so tuning one event's
           objective meant editing a system file, and deleting that event would
           have left a dead branch behind. Content belongs in content
           (16_Content_Pipeline.md). */
        case 'lap':      ok = r.bestLap !== null &&
                              r.bestLap < (event.lapUnder || 29); break;
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
