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
    platinumTime: 87,
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
    platinumTime: 87,
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
    opponents: 7,
    difficulty: 'hard',
    platinumTime: 143,
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
    opponents: 5,
    difficulty: 'normal',
    platinumTime: 103,
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
    opponents: 5,
    difficulty: 'normal',
    platinumTime: 75,           // 0.93 x 81.0, re-measured from a mid-grid start
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
    opponents: 6,
    difficulty: 'normal',
    platinumTime: 83,           // 0.93 x 88.8, re-measured from a mid-grid start
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
    opponents: 7,
    difficulty: 'hard',
    platinumTime: 84,           // 0.93 x 90.8, scaled when the grid stopped double-booking a slot
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
    opponents: 6,
    difficulty: 'normal',
    /* 0.93 x 101.9. RE-MEASURED after rides were re-paced by ground distance
       (Rails.js): this track lost 9.1 seconds a race, because its loop had been
       parking the car for nearly two seconds every lap. Re-measured AGAIN for
       the magnetic boosters: the same stand-in ran 100.72 before them and 99.00
       after, so every target here is scaled by that measured 0.983 and nothing
       else on the board moved by so much as a tick. */
    platinumTime: 94,           // 0.93 x 101.8, scaled by the measured booster delta
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
    times: { gold: 96, silver: 105, bronze: 117 },   // clean reference 100.5
    platinumTime: 89,
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
    opponents: 7,
    difficulty: 'hard',
    platinumTime: 97,           // 0.93 x 104.7, re-measured from a mid-grid start
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
    times: { gold: 98, silver: 108, bronze: 121 },   // clean reference 103.6
    platinumTime: 92,
    unlockStars: 35,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

/* ── Kitchen Table ─────────────────────────────────────────────────────────
   The fifth world, and the one that asks for the most driving. Gated above the
   stunt track deliberately: laminate is the fastest base surface in the game
   and the second least grippy, and half the barrier is missing. A player who
   has not yet learned to be smooth will spend this world on the kitchen floor.

   19_World_Kitchen_Table.md carries the measurements. */
BR.EVENTS.push(
  {
    id: 'kt-01',
    name: 'Breakfast Run',
    blurb: 'Up on the table. Wiped laminate — fast everywhere, grippy nowhere.',
    trackId: 'kitchen-breakfast-run',
    mode: 'standard-race',
    laps: 3,
    opponents: 5,
    difficulty: 'normal',
    /* 0.93 x 103.0. Technician on normal, four runs from a mid-grid start:
       103.0 / 103.1 / 103.2 / 103.3, quickest taken. Laps 35.7 / 33.8 / 33.5 —
       the longest circuit in the game, and the slowest race in it. */
    platinumTime: 96,
    unlockStars: 38,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      // Laminate at 0.78 grip drifts almost by itself. Six seconds is a low
      // bar here on purpose — it is an invitation to find that out.
      { id: 'drifter', label: 'Spend 6 seconds drifting' },
    ],
  },
  {
    id: 'tt-breakfast',
    name: 'Breakfast Run Time Trial',
    blurb: 'Nobody to blame. The kerb still stops at the east end.',
    trackId: 'kitchen-breakfast-run',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    // Four solo runs: 103.9 / 104.0 / 104.1 / 104.3. Clean reference 103.9.
    times: { gold: 99, silver: 108, bronze: 121 },
    platinumTime: 92,
    unlockStars: 41,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  },
  {
    id: 'kt-02',
    name: "Table's Edge",
    blurb: 'Narrower, and the kerb is missing down the whole front straight.',
    trackId: 'kitchen-tables-edge',
    mode: 'standard-race',
    laps: 3,
    opponents: 7,
    difficulty: 'hard',
    /* 0.93 x 95.3. Four runs: 95.3 / 95.4 / 95.5 / 95.7. Seven and a half
       seconds quicker than Breakfast Run despite being the harder track: it is
       850 units shorter, and on laminate it is grip rather than distance that
       costs the time. */
    platinumTime: 89,
    unlockStars: 44,
    objectives: [
      { id: 'win',      label: 'Win the race' },
      { id: 'spotless', label: 'Win without a single collision' },
      { id: 'clean',    label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'tt-tables-edge',
    name: "Table's Edge Time Trial",
    blurb: 'Two gaps, one sugar slick, three laps. Do not run wide.',
    trackId: 'kitchen-tables-edge',
    mode: 'time-trial',
    laps: 3,
    opponents: 0,
    difficulty: 'normal',
    // Four solo runs: 95.6 / 95.6 / 95.8 / 95.9. Clean reference 95.6.
    times: { gold: 91, silver: 99, bronze: 111 },
    platinumTime: 85,
    unlockStars: 47,
    objectives: [
      { id: 'finish',  label: 'Set a time' },
      { id: 'ttGold',  label: 'Beat the gold time' },
      { id: 'ttPlat',  label: 'Beat the platinum time' },
    ],
  }
);

/* ── Item races ────────────────────────────────────────────────────────────
   A SEPARATE MODE, deliberately (10_Items.md Q4). The flagship Standard Race
   stays item-free: it already has drift-charged boost, shortcuts, worn sand and
   speed-gated loops to argue with, and the six Time Trials are only worth
   comparing against a race decided by driving.

   These exist because local multiplayer is the one place a flat skill gap makes
   racing dull, and because an item race is a different pleasure rather than a
   diluted version of the same one. */
BR.EVENTS.push(
  {
    id: 'ir-01',
    name: 'Toybox Scramble',
    blurb: 'Items on. Grab a box, hold your nerve, and watch your mirrors.',
    trackId: 'town-rug-loop',
    mode: 'standard-race',
    items: true,
    laps: 3,
    opponents: 7,
    difficulty: 'normal',
    platinumTime: 89,           // 0.93 x 95.9, re-measured from a mid-grid start
    unlockStars: 4,
    objectives: [
      { id: 'finish',  label: 'Finish the race' },
      { id: 'win',     label: 'Win the race' },
      { id: 'clean',   label: 'Finish with fewer than 4 collisions' },
    ],
  },
  {
    id: 'ir-02',
    name: 'Sandbox Scrap',
    blurb: 'Items in the sand. The line you wear in is the line they will take.',
    trackId: 'sandbox-dune-dash',
    mode: 'standard-race',
    items: true,
    laps: 3,
    opponents: 7,
    difficulty: 'hard',
    platinumTime: 87,           // 0.93 x 92.8, scaled when the grid stopped double-booking a slot
    unlockStars: 18,
    objectives: [
      { id: 'finish',   label: 'Finish the race' },
      { id: 'win',      label: 'Win the race' },
      { id: 'spotless', label: 'Win without a single collision' },
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
