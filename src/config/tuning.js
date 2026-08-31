/* =============================================================================
   TUNING — every number that affects how the car feels.
   =============================================================================
   Phase 1 exists to find these values. They are guesses from
   GAME_BIBLE/03_Driving_Physics.md, not tuned numbers.

   RULE (17_Claude_Rules.md): no magic numbers anywhere else in the codebase.
   If it changes the feel, it lives here and it has a comment saying what it
   does to the feel.

   When a value is settled by playtesting, copy it back into
   GAME_BIBLE/03_Driving_Physics.md. The debug panel has a "Copy tuning" button
   that dumps this object with current values.
   ========================================================================== */

window.BR = window.BR || {};

BR.PHYSICS = {

  /* ── GRIP — the drift lever ──────────────────────────────────────────────
     Fraction of LATERAL velocity RETAINED per 1/60s tick.
     This is the whole drift mechanic. Everything else is trim.

       LOW  (0.86) = lateral velocity killed fast = car goes where it points
       HIGH (0.97) = lateral velocity persists    = car slides

     Note the direction: higher retention means LESS grip. 03_Driving_Physics.md
     originally had these named `gripNormal: 0.92 / gripDrifting: 0.62`, which
     is inverted — it made pressing drift INCREASE grip. Renamed here to make
     the direction unambiguous, and the bible has been corrected.

     The GAP between these two is how dramatic pressing drift feels.

     Measured on a 90-degree corner at full entry speed (Phase 1):
       retention   slip   ticks   speed kept      (steering only: 55 ticks,
         0.90       27°     40       85%           94% kept, 14 deg slip)
         0.92       33°     40       84%
         0.94       40°     40       84%
         0.96       50°     41       88%
         0.97       56°     42       91%   <- DIALLED IN: big, sideways slides
     Every value beats steering through the corner, so this is a look choice
     rather than a balance one. Drag the slider and pick.                    */
  lateralRetentionNormal: 0.86,  // driving normally — grippy
  lateralRetentionDrift:  0.97,  // drift held — slidey
  retentionBlendRate:      6.0,  // units/sec moving between the two.
                                 // Low = floaty vague transition,
                                 // high = snappy bite on press and release

  /* ── STEERING ────────────────────────────────────────────────────────────
     Turn rate is a CURVE over speed, not a constant. See turnRateFor().
     Sluggish when crawling, tightest mid-range, slightly reduced at top speed
     so fast straights feel committed instead of twitchy.                    */
  turnRateBase:   1.7,   // rad/sec at optimal speed. Higher = darty.
                         // Dialled well down from 2.6 — with the loose drift
                         // retention below, sharp steering made the car
                         // twitchy rather than committed
  turnSpeedFloor:  40,   // below this, steering authority ramps in
  turnSpeedPeak:  180,   // speed of maximum turn rate
  turnRateAtMax:  0.75,  // turn rate multiplier at top speed
  driftTurnBonus: 1.35,  // steering multiplier while drifting.
                         // This is why drifting corners tighter than steering
  airControl:     0.35,  // steering multiplier while airborne.
                         // Too high trivialises jump shortcuts, too low
                         // makes landings feel arbitrary

  /* ── LONGITUDINAL ────────────────────────────────────────────────────────
     engineForce is the BASE. A vehicle's `acceleration` stat is normalised
     against the reference vehicle (Red Racer, 160) to become a multiplier.  */
  engineForce:      900,    // units/sec^2. Higher = snappier off the line.
                            // NOTE: this is the debug slider's MAXIMUM. If it
                            // wanted more, widen the range rather than treating
                            // 900 as settled
  brakeForce:       640,    // units/sec^2 when braking
  reverseMaxSpeed:   70,    // reverse is deliberately slow — recovery, not tactic
  reverseForceMul:  0.4,    // reverse accelerates slower than braking
  rollingFriction: 0.986,   // speed retained per tick when coasting.
                            // Lower = car scrubs speed fast, feels heavy.
                            // Grounded only — see VehicleController step 5
  dragCoefficient: 0.0016,  // quadratic drag, dominates near top speed
  overspeedDecay:   400,    // units/sec^2 pulling back to max speed.
                            // Soft, so boost ending doesn't snap

  /* ── BOOST ───────────────────────────────────────────────────────────────  */
  boostForce:        800,   // extra forward force while boosting
  boostMaxSpeedMul: 1.28,   // raises the speed cap while boosting
  boostDuration:     1.2,   // seconds per activation
  boostDrainRate:   0.55,   // meter/sec while active.
                            // A full meter is ~1.3 activations
  boostMinToFire:   0.15,   // meter needed to trigger. Stops useless dribbles.
                            // NOT in the bible — added in Phase 1

  /* ── MAGNETIC BOOSTERS ───────────────────────────────────────────────────
     A booster is a rail (Rails.js), not a pad: it grabs the car, pulls it onto
     its groove, holds it for a beat and throws it out the far end faster than
     it arrived. These five numbers are the whole character of that.

     A pad hands you meter and lets you choose when to spend it; a booster
     spends it for you, immediately, and takes the wheel while it does. That is
     the trade, and it is why a booster gives no meter at all.               */
  boosterHoldFrac:  0.18,  // fraction of the strip spent clamped at arrival
                           // speed before the throw. The wind-up. Against a car
                           // already at its cap this is free — it is doing what
                           // driving would have done — and it costs only
                           // against one that was still accelerating. What a
                           // longer hold really does is spend strip that could
                           // have been throwing, so it pays less
  boosterExitMul:   1.55,  // release speed, as a multiple of arrival speed.
                           // Measured 0.32s a lap at this value
                           // (07_World_Stunt_Track.md). A much smaller multiple
                           // mostly evaporates: overspeedDecay hauls the car
                           // back to its cap at 400/sec^2
  boosterExitCap:   1.60,  // ceiling on release speed, in the car's own max.
                           // Bites only when you arrive already boosting, so
                           // a boost into a booster cannot compound
  boosterPull:      0.65,  // fraction of the car's lateral offset the magnet
                           // takes away. NOT 1.0 — see Rails.laneAnchor: a
                           // full snap puts a whole grid in one groove, and
                           // cars on a rail cannot collide
  boosterSnapFrac:  0.12,  // how much of the ride the pull takes. Short: the
                           // yank sideways is the magnet's signature, and a
                           // gate's leisurely 0.25 reads as drifting across

  /* ── DRIFT CHARGE ────────────────────────────────────────────────────────
     Continuous on slip angle — deliberately NOT tiered (no blue/orange
     sparks). Tiers reward HOLDING a drift, which trains players to slide on
     straights to farm boost. Continuous rewards drifting where corners are.
     See 03_Driving_Physics.md "Drift model".                                */
  driftChargeRate:    0.32,  // meter/sec while sliding. Higher = drift spam.
                             // Dialled down from 0.42 — boost was accruing
                             // faster than it could sensibly be spent
  driftMinAngle:      0.18,  // rad of slip before charge accrues.
                             // Stops tiny wobbles paying out
  driftMinSpeed:        40,  // below this, sliding earns nothing.
                             // NOT in the bible — added in Phase 1
  driftQualitySpan:    0.6,  // rad of slip above minimum for max charge rate
  driftChargeFalloff:  1.2,  // display-only decay/sec after releasing drift

  /* ── JUMPS ───────────────────────────────────────────────────────────────  */
  gravity:            1400,  // units/sec^2. Higher = snappier, less floaty
  rampMinSpeedFrac:   0.35,  // fraction of max speed needed to get air at all.
                             // Below this you just drive over the ramp — a
                             // crawling car popping into the sky looks absurd
  rampMinApproachDot: 0.35,  // how squarely you must be going UP the slope.
                             // Stops a ramp firing when you reverse into it
  rampLipFrac:         0.8,  // how far along the ramp you launch. Firing at the
                             // BOTTOM of the wedge meant a short jump could land
                             // back on the ramp it just left, which reads as
                             // bouncing rather than jumping
  landingGraceAngle:   0.5,  // rad of heading/velocity mismatch forgiven
  cleanLandingBoost:  0.15,  // meter awarded for a clean landing
  badLandingPenalty:  0.35,  // fraction of speed lost on the worst landing

  /* ── COLLISIONS ──────────────────────────────────────────────────────────
     Playful, not punishing. Control must return fast — frustration scales
     non-linearly with time spent not driving.                               */
  collisionRestitution: 0.30,  // bounce. Higher = pinball, lower = dead stop
  collisionSpeedLoss:   0.30,  // max fraction of speed lost on a square hit.
                               // Scaled by impact angle, so glancing blows
                               // barely register
  spinRecoveryTime:      0.6,  // HARD CAP on lost control, seconds
  spinTriggerDot:       0.75,  // how square a hit must be to cause a spin

  /* Leaning on a wall used to be free: 115 contact ticks cost 0.3% of speed and
     0% of distance, so the wall was a better racing line than the road
     (03_Driving_Physics.md open question 6, raised in Phase 1).

     Contact caps top speed rather than scrubbing velocity, because the engine
     re-accelerates every tick and simply buys scrubbed speed back — a per-tick
     tangential scrub of 0.9955 moved the real cost only from 0.3% to 2.9%. A
     ceiling cannot be out-accelerated.

     0.82 is a real cost without being a punishment, and it decays in 0.12s so a
     glancing blow is over before it bites. A glance and a lean differ by
     DURATION, not force. */
  wallContactMaxSpeed: 0.82,
  wallContactTime:     0.12,
};

/* ── SURFACES ──────────────────────────────────────────────────────────────
   Multiplicative modifiers. Phase 1 only uses rugRoad, but the lookup is
   wired so surface zones drop straight in at Phase 3. See 05_Tracks.md.    */
BR.SURFACES = {
  rugRoad:   { grip: 1.00, maxSpeed: 1.00, accel: 1.00 },
  rugGrass:  { grip: 0.95, maxSpeed: 0.82, accel: 0.90 },
  hardwood:  { grip: 0.78, maxSpeed: 1.12, accel: 1.05 },
  blanket:   { grip: 1.05, maxSpeed: 0.70, accel: 0.75 },
  plastic:   { grip: 1.10, maxSpeed: 1.15, accel: 1.10 },
  paper:     { grip: 0.60, maxSpeed: 1.00, accel: 0.85 },
  bookCover: { grip: 0.90, maxSpeed: 1.05, accel: 1.00 },

  /* ── Sandbox Speedway (08_World_Sandbox.md) ────────────────────────────
     Loose sand is slow and vague. Driving over it PACKS it down, and packed
     sand is nearly as good as road — so a racing line emerges over three laps
     rather than being painted on. The vehicle blends between these two by how
     compacted the ground under it actually is; see SandGrid.

     The gap between them is the whole feature. Too small and compaction is
     invisible; too large and lap one is miserable. */
  sand:       { grip: 0.74, maxSpeed: 0.82, accel: 0.76 },
  packedSand: { grip: 0.97, maxSpeed: 1.02, accel: 0.98 },

  // Off the dug track entirely. Not compactable — wandering out here is a
  // mistake, not a shortcut.
  looseSand:  { grip: 0.66, maxSpeed: 0.68, accel: 0.62 },

  // Standing water. Fast and frictionless in the worst way.
  puddle:     { grip: 0.42, maxSpeed: 0.95, accel: 0.70 },
};

/* Reference vehicle acceleration. A vehicle's `acceleration` stat is divided
   by this to become a multiplier on engineForce, so Red Racer (160) = 1.0. */
BR.ACCEL_REFERENCE = 160;

/* ── CAMERA — chase camera, behind the car ─────────────────────────────────
   Render-side, but it changes the feel as much as any physics constant, so it
   lives here with everything else that gets tuned.

   The camera yaw follows the DIRECTION OF TRAVEL, not the car's heading. If it
   followed the nose, drifting would swing the view sideways off the track.
   Following velocity means the car visibly slides sideways in frame while the
   view stays pointed where you're actually going — which is both what arcade
   racers do and the clearest possible read on how hard you're drifting.     */
BR.CAMERA = {
  zoom:          1.15,  // higher = closer, less track visible ahead.
                        // Pulled back from 1.45 to compensate for the low
                        // groundTilt, which compresses how much ground fits
                        // on screen

  /* ── SENSE OF SPEED ──────────────────────────────────────────────────────
     The projection is axonometric: nothing shrinks with distance, so there is
     no perspective flow to tell you how fast you are going. 12_Art_Guide calls
     this "the flatness problem". Toy cars at 350 units/sec can read as sliding
     rather than driving, and the fix has to come from the camera because it
     cannot come from the projection.

     Every value here is RENDER-ONLY. Nothing below is visible to the
     simulation, the AI or any measured time — the flat-plane rule (17_Claude_
     Rules.md) cuts both ways, and the camera is on the render side of it. */
  speedZoom:     0.16,  // how far the view pulls back at top speed, as a
                        // fraction of `zoom`. Too much and the car shrinks to
                        // a dot on a straight; too little and nothing reads
  zoomRate:       2.2,  // how fast the pull-back eases. SLOW on purpose: this
                        // should feel like the world opening up, not like the
                        // camera reacting to the throttle
  boostKick:     0.10,  // instant punch IN when a boost fires, released over
                        // boostKickDecay. Zooming in on acceleration is
                        // backwards from the speed pull-back, and that is the
                        // point — the contrast is what sells the shove
  boostKickDecay: 3.4,  // per second

  shakePerImpact:  11,  // screen-space pixels of shake at severity 1
  shakeMax:        18,  // ceiling, so a pile-up cannot make the screen useless
  shakeDecay:     7.0,  // per second. Fast — a lingering shake reads as a
                        // broken camera rather than as a hit
  shakeHz:         38,  // oscillation rate. High enough to read as an impact
                        // rather than as a wobble

  rumbleMax:      1.7,  /* pixels of tremor at full speed. TINY on purpose: a
                           rumble you can consciously see is a broken camera,
                           and this has to survive being on screen constantly
                           rather than for the half-second an impact lasts.
                           Scaled by the SQUARE of the speed fraction, so it is
                           absent through most of the range and only arrives
                           near the top. */
  rumbleHz:        27,  // slower than an impact, so the two never read as the
                        // same event

  streakSpeed:    240,  // speed at which motion streaks start to appear
  streakMax:     0.34,  // opacity ceiling
  streakFlow:     3.2,  /* how much faster than the ground the edge streaks
                           scroll. 1.0 is honest and useless: measured, a point
                           on the floor crosses a 595px view at 110 px/sec at
                           336 units/sec, so the screen takes five seconds to
                           scroll once and the periphery reads as still. The
                           streaks have to move at a rate the eye calls motion
                           while still rising and falling with the car — which
                           is what keeps it a speedometer rather than a decal. */
  followRate:     7.0,  // positional catch-up. Low = laggy and cinematic,
                        // high = locked to the car and can feel jittery
  yawRate:        4.5,  // how fast the view swings round to follow travel.
                        // LOW is good: a lagging yaw means the world rotates
                        // behind you through a drift, which looks great.
                        // Too high and the view snaps about mid-corner
  yawMinSpeed:     25,  // below this, follow HEADING instead — velocity
                        // direction is noise at a crawl, and reversing would
                        // otherwise flip the camera 180 degrees
  horizonBias:   0.62,  // where the car sits vertically. 0.5 = centred,
                        // higher = car lower on screen, more road visible.
                        // This is what makes it read as "behind" the car
  lookAhead:     0.10,  // extra bias along velocity. Lower than a fixed camera
                        // needs, because horizonBias already looks ahead
  lookAheadMax:   120,  // cap, so top speed doesn't push the car off screen

  /* Depth fade — warm haze toward the far edge.
     The projection has NO perspective: a car 2000 units away is drawn exactly
     the same size as one alongside, and at groundTilt 0.30 some 2300 units of
     depth compress into 800 pixels. Without a depth cue the scene reads as a
     flat stack of same-sized cars rather than a road going away from you
     (12_Art_Guide.md, "The flatness problem").

     0 disables it. Above about 0.7 the far half of the track starts washing
     out, which costs readability — see 05_Tracks.md. */
  depthFade:     0.42,  // strength of the haze at the far edge
  depthFadeEnd:  0.78,  // how far down the screen it reaches, as a fraction of
                        // horizonBias. 1.0 brings it all the way to the car
};
