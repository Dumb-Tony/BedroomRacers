/* =============================================================================
   VEHICLE DATA — content, not code.
   =============================================================================
   Adding a vehicle must never require touching anything in src/systems/.
   See 09_Vehicles.md for the roster and 16_Content_Pipeline.md for why this
   matters.

   Phase 1 only instantiates Red Racer, but the full starter roster is here so
   the stat spread can be sanity-checked by driving it.

   Dimensions are world units. A car is ~28 long; keep that in mind when
   reading distances elsewhere (the test arena is ~100 car lengths wide).

   TOP SPEEDS SCALED x1.25 IN PHASE 1. The speed cap was being overrun by a
   strong engineForce, so the car actually ran at ~350 while its stat said 280.
   Tuning was dialled in against that real 350. Fixing the cap would otherwise
   have made every car abruptly slower than the version that was signed off, so
   the whole roster was scaled to preserve the felt speed and keep the relative
   spread intact.
   ========================================================================== */

window.BR = window.BR || {};

BR.VEHICLES = {

  'red-racer': {
    id: 'red-racer',
    name: 'Red Racer',
    description: 'Steady, dependable, a little scratched. Been here the longest.',
    maxSpeed: 350,
    acceleration: 160,   // reference value — see BR.ACCEL_REFERENCE
    handling: 0.85,
    weight: 1.0,
    boostPower: 1.15,
    // Placeholder geometry. Replaced by 16-frame sprite sheets once
    // groundTilt is locked (12_Art_Guide.md).
    length: 28, width: 16, height: 11,
    colorBody: '#d8342f', colorTop: '#f2564f', colorTrim: '#ffd9d7',
  },

  'blue-buggy': {
    id: 'blue-buggy',
    name: 'Blue Buggy',
    description: 'Fat tyres, no fear. Happiest where the carpet gets rough.',
    maxSpeed: 313,
    acceleration: 160,
    handling: 1.00,
    weight: 1.0,
    boostPower: 1.05,
    length: 26, width: 18, height: 13,
    colorBody: '#2f6fd8', colorTop: '#4f8ef2', colorTrim: '#d7e6ff',
  },

  'yellow-rocket': {
    id: 'yellow-rocket',
    name: 'Yellow Rocket',
    description: 'Fastest thing on the rug. Corners like a thrown brick.',
    maxSpeed: 413,
    acceleration: 165,
    handling: 0.62,
    weight: 0.8,
    boostPower: 1.30,
    length: 31, width: 14, height: 9,
    colorBody: '#e8b21c', colorTop: '#ffd34d', colorTrim: '#fff3cc',
  },

  'green-pickup': {
    id: 'green-pickup',
    name: 'Green Pickup',
    description: 'Wins every argument. Loses every corner.',
    maxSpeed: 306,
    acceleration: 158,
    handling: 0.74,
    weight: 1.45,
    boostPower: 1.00,
    length: 30, width: 18, height: 14,
    colorBody: '#2f9e52', colorTop: '#4fc072', colorTrim: '#d7f2e0',
  },

  /* The mysterious vehicle hidden under the bed (20_Narrative.md), and the
     reward for completing the toy piece set (01_Game_Loop.md). Not bought with
     stars — the only way to it is to go looking.

     Deliberately NOT the fastest thing in the game. It is a momentum car: the
     best handling on the roster, real weight behind it, a strong boost, and a
     top speed that will not save a scruffy lap. */
  'heirloom': {
    id: 'heirloom',
    name: 'Heirloom',
    description: 'Older than everything else in this room. Nobody remembers whose it was.',
    maxSpeed: 330,
    acceleration: 175,
    handling: 1.05,
    weight: 1.20,
    boostPower: 1.25,
    length: 27, width: 17, height: 13,
    colorBody: '#8a5a32', colorTop: '#b07a48', colorTrim: '#e8cfa8',
  },

  'purple-micro': {
    id: 'purple-micro',
    name: 'Purple Micro',
    description: 'Tiny, eager, always first out of a corner. Do not get hit.',
    maxSpeed: 344,
    acceleration: 200,
    handling: 0.98,
    weight: 0.75,
    boostPower: 1.10,
    length: 22, width: 13, height: 10,
    colorBody: '#8b4fd8', colorTop: '#a875f2', colorTrim: '#e8d7ff',
  },

  /* ── RIVAL-ONLY CARS ───────────────────────────────────────────────────────
     Every track has eight grid slots, but the field could only ever supply five
     cars — and the player takes one of them, so the three events asking for
     FIVE opponents were quietly fielding four. The grid was never full.

     These three exist to fill it. `aiOnly` keeps them out of the garage: a car
     you can see but never earn reads as a bug, not as a rival. They are not in
     BR.UNLOCKS and are never owned.

     Stats sit inside the existing roster's range rather than extending it. The
     point is more cars to race, not more performance to chase — the player's
     five remain the whole ladder (09_Vehicles.md). */
  'orange-tipper': {
    id: 'orange-tipper',
    name: 'Orange Tipper',
    description: 'Site truck. Heavy, stubborn, and hard to move off a line.',
    aiOnly: true,
    maxSpeed: 330,
    acceleration: 176,
    handling: 0.86,
    weight: 1.42,
    boostPower: 0.92,
    length: 27, width: 15, height: 13,
    colorBody: '#e07a2f', colorTop: '#f79c52', colorTrim: '#2b2622',
  },
  'teal-scout': {
    id: 'teal-scout',
    name: 'Teal Scout',
    description: 'Someone else\'s favourite. Tidy through the quick stuff.',
    aiOnly: true,
    maxSpeed: 338,
    acceleration: 190,
    handling: 0.97,
    weight: 0.92,
    boostPower: 1.02,
    length: 24, width: 13, height: 11,
    colorBody: '#2f9e9e', colorTop: '#4fc4c4', colorTrim: '#e8f7f7',
  },
  'cream-camper': {
    id: 'cream-camper',
    name: 'Cream Camper',
    description: 'Top heavy and far too keen. Leans on everything.',
    aiOnly: true,
    maxSpeed: 326,
    acceleration: 182,
    handling: 0.88,
    weight: 1.18,
    boostPower: 0.98,
    length: 28, width: 14, height: 15,
    colorBody: '#e8dcc0', colorTop: '#f5ecd8', colorTrim: '#8c6b3f',
  },
};

/* Collision radius. Cars are circles, not rotated rectangles — deliberate,
   not a shortcut. Circles never wedge in a corner and glancing blows slide
   off, which is what "playful rather than punishing" requires
   (03_Driving_Physics.md "Collision response"). */
BR.collisionRadius = function (spec) {
  return (spec.length + spec.width) * 0.27;
};
