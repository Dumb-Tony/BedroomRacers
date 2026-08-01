/* =============================================================================
   EVENTS — content, not code.
   =============================================================================
   An event is a track plus a set of rules plus what it takes to do well. Adding
   one is a config entry (16_Content_Pipeline.md).

   Medals come from FINISHING POSITION, not time, because position is what the
   player is actually racing for and it reads instantly. Target times exist as a
   fourth, harder tier so there is something left once gold is routine.

   Objectives are visible BEFORE the race so players can choose to chase them,
   and re-checkable after. Never hide an objective behind a surprise
   (01_Game_Loop.md).

   ── TARGET TIMES ARE MEASURED, NOT GUESSED ────────────────────────────────
   Author a new event by simulating it with the 'technician' AI on 'normal' and
   taking that total as the reference M.

   Simulate it FOUR TIMES and use the quickest. The technician makes random
   mistakes and a time trial has no traffic to average them out: tt-rug-route
   returned 90.4, 90.5 and 98.0 from identical code, so a single run once put
   the reference 8 seconds out. The cleanest run is also the better reference
   on its own terms — a target time should describe a lap without a fumble.

   Then:

       time trial      platinum 0.885·M   gold 0.951·M
                       silver   1.040·M   bronze 1.162·M
       standard race   platinum 0.93·M

   Those ratios come from the rug events, which were tuned by hand until they
   felt right; everything since is calibrated to match them.

   Skipping this is not a small error. Bedside and Sandbox shipped their first
   pass with hand-guessed times and gold sat 18-37 SECONDS off the pace — every
   medal free on the first attempt, and the whole reward curve dead on arrival.
   Neither was visible without simulating the race. */

window.BR = window.BR || {};

BR.EVENTS = [
  {
    id: 'rug-route-01',
    name: 'Rookie Shakedown',
    blurb: 'Three laps of the town rug. Learn where the corners are.',
    trackId: 'town-rug-loop',
    mode: 'standard-race',
    laps: 3,
    opponents: 3,
    difficulty: 'easy',
    platinumTime: 88,
    unlockStars: 0,
    objectives: [
      { id: 'finish',   label: 'Finish the race' },
      { id: 'podium',   label: 'Finish on the podium' },
      { id: 'clean',    label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'rug-route-02',
    name: 'Rug Route Circuit',
    blurb: 'The full field, racing properly. Boost pads matter now.',
    trackId: 'town-rug-loop',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 84,
    unlockStars: 2,
    objectives: [
      { id: 'win',      label: 'Win the race' },
      { id: 'drifter',  label: 'Spend 6 seconds drifting' },
      { id: 'lap',      label: 'Set a lap under 29 seconds' },
    ],
  },
  {
    id: 'rug-route-03',
    name: 'Bedroom Grand Prix',
    blurb: 'Five laps, full grid, no mistakes. The rug does not forgive.',
    trackId: 'town-rug-loop',
    mode: 'standard-race',
    laps: 5,
    opponents: 5,
    difficulty: 'hard',
    platinumTime: 138,
    unlockStars: 5,
    objectives: [
      { id: 'win',      label: 'Win the race' },
      { id: 'spotless', label: 'Win without a single collision' },
      { id: 'lap',      label: 'Set a lap under 27 seconds' },
    ],
  },
];

/* ── Time trials ───────────────────────────────────────────────────────────
   No opponents, no contact, nothing to hide behind. Medals come from TIME here
   rather than position, because there is no position to earn.

   Your best run is saved as a ghost and replays alongside you. It records
   inputs rather than positions (Ghost.js), which only works because the
   simulation is deterministic — the reason the fixed timestep exists. */
BR.EVENTS.push(
  {
    id: 'tt-rug-route',
    name: 'Rug Route Time Trial',
    blurb: 'Alone against the clock. Your best run races you.',
    trackId: 'town-rug-loop',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 86, silver: 94, bronze: 105 },
    platinumTime: 80,
    unlockStars: 3,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'lap',     label: 'Set a lap under 29 seconds' },
    ],
  },
  {
    id: 'bb-01',
    name: 'Under the Bed',
    blurb: 'Longer, faster, and half of it is bare floorboards.',
    trackId: 'bedside-boulevard',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 101,
    unlockStars: 6,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-bedside',
    name: 'Boulevard Time Trial',
    blurb: 'Hardwood rewards smooth hands. Nothing else will save you.',
    trackId: 'bedside-boulevard',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 103, silver: 112, bronze: 126 },
    platinumTime: 96,
    unlockStars: 9,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

/* ── Sandbox Speedway ──────────────────────────────────────────────────────
   The first world outside the bedroom. Gated behind the rug so a player meets
   sand after they can already drive — the ground changing under you is a poor
   first lesson. */
BR.EVENTS.push(
  {
    id: 'sb-01',
    name: 'Dune Dash',
    blurb: 'Out to the sandbox. Loose sand at first — until you wear a line in.',
    trackId: 'sandbox-dune-dash',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 85,
    unlockStars: 8,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-sandbox',
    name: 'Sandbox Time Trial',
    blurb: 'Three laps alone. The first is always the slowest — that is the point.',
    trackId: 'sandbox-dune-dash',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 90, silver: 99, bronze: 110 },
    platinumTime: 84,
    unlockStars: 12,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  },

  /* The rest of the sandbox. Each track argues with the compaction mechanic
     from a different side — narrow (Big Dig), vertical (Bucket Brigade), and
     interrupted (Tide Pool) — so the order below is difficulty, not just the
     order they were built. */
  {
    id: 'sb-02',
    name: 'The Big Dig',
    blurb: 'Down in the trenches. One line, no room, and everyone wants it.',
    trackId: 'sandbox-big-dig',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 73,           // 0.93 x 78.1, the clean reference run
    unlockStars: 14,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'sb-03',
    name: 'Bucket Brigade',
    blurb: 'Buckets in the road and spades propped against them. Go over.',
    trackId: 'sandbox-bucket-brigade',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 80,           // 0.93 x 86.1
    unlockStars: 17,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'sb-04',
    name: 'Tide Pool',
    blurb: 'The hose was left on. You cannot wear a line through water.',
    trackId: 'sandbox-tide-pool',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'hard',
    platinumTime: 83,           // 0.93 x 89.3
    unlockStars: 20,
    objectives: [
      { id: 'win',      label: 'Win the race' },
      { id: 'spotless', label: 'Win without a single collision' },
      { id: 'clean',    label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-tide-pool',
    name: 'Tide Pool Time Trial',
    blurb: 'Three laps, seven puddles, and a line that keeps stopping.',
    trackId: 'sandbox-tide-pool',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 87, silver: 95, bronze: 106 },   // clean reference 91.0
    platinumTime: 81,
    unlockStars: 23,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

/* ── Plastic Stunt Track ───────────────────────────────────────────────────
   The first world that leaves the floor. Gated well down the ladder: a player
   meeting a crossover should already know how the car handles, because reading
   which deck you are on is a new thing to learn on its own. */
BR.EVENTS.push(
  {
    id: 'st-01',
    name: 'Dresser Drop',
    blurb: 'A loop, a corkscrew along the dresser, then down and under yourself.',
    trackId: 'stunt-dresser-drop',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'normal',
    platinumTime: 103,          // 0.93 x 110.5, the clean reference run
    unlockStars: 26,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-dresser',
    name: 'Dresser Drop Time Trial',
    blurb: 'Three laps of the high road, alone.',
    trackId: 'stunt-dresser-drop',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 106, silver: 116, bronze: 130 },  // clean reference 111.9
    platinumTime: 99,
    unlockStars: 29,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

BR.EVENTS.push(
  {
    id: 'st-02',
    name: 'Shelf Run',
    blurb: 'Three storeys. You drive under the shelf, then over it.',
    trackId: 'stunt-shelf-run',
    mode: 'standard-race',
    laps: 3,
    opponents: 4,
    difficulty: 'hard',
    platinumTime: 99,           // 0.93 x 106.6, the clean reference run
    unlockStars: 32,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-shelf',
    name: 'Shelf Run Time Trial',
    blurb: 'The tall one, alone and against the clock.',
    trackId: 'stunt-shelf-run',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    times: { gold: 101, silver: 111, bronze: 124 },  // clean reference 106.6
    platinumTime: 94,
    unlockStars: 35,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

/* Vehicles are earned with stars. 09_Vehicles.md left open whether the starter
   roster should all be available immediately; two to start and three to earn
   gives progression something to hand out early, which is the whole point of a
   first unlock. */
BR.UNLOCKS = [
  { vehicle: 'purple-micro',  stars: 3 },
  { vehicle: 'green-pickup',  stars: 6 },
  { vehicle: 'yellow-rocket', stars: 9 },
  // Not bought with stars. The only way to it is to go looking.
  { vehicle: 'heirloom',      pieces: 'all' },
];

/* Every toy piece across every track forms one set. Completing it is the only
   route to the Heirloom. */
BR.allPieceIds = function () {
  const ids = [];
  for (const id in BR.TRACKS) {
    const cs = BR.TRACKS[id].collectibles || [];
    for (let i = 0; i < cs.length; i++) ids.push(cs[i].id);
  }
  return ids;
};

BR.eventById = function (id) {
  for (let i = 0; i < BR.EVENTS.length; i++) {
    if (BR.EVENTS[i].id === id) return BR.EVENTS[i];
  }
  return null;
};
