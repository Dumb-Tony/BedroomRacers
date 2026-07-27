/* =============================================================================
   PROJECTION — world space to screen space.
   =============================================================================
   THE most important architectural boundary in the project.

   The simulation is FLAT 2D. The camera tilt is a render-time transform and
   nothing else. No gameplay code may import this module or read groundTilt.
   If it does, the perspective becomes impossible to change later — and it
   WILL change, because the tilt value is still being decided.

   See GAME_BIBLE/03_Driving_Physics.md "Perspective: the single most
   important rule".
   ========================================================================== */

window.BR = window.BR || {};

BR.Projection = {

  /* Vertical squash of the ground plane.
       1.0  = pure top-down (a rotated sprite would look correct)
       0.62 = current guess
       0.4  = low, almost chase-cam

     LOCKING THIS IS A PHASE 1 EXIT CRITERION. It blocks all vehicle art and
     all track authoring, because vehicle sprites must be pre-rendered at this
     exact angle (12_Art_Guide.md). Getting it wrong invalidates art, not
     code — which is why it is the top risk in 18_Roadmap.md.               */
  groundTilt: 0.62,

  /* How much one world unit of height lifts a sprite up the screen.
     The gap between a car and its shadow is the ONLY height cue, so this
     controls how readable jumps are.                                       */
  heightScale: 0.85,

  /**
   * World -> screen.
   * @param {number} x world X (flat plane)
   * @param {number} y world Y (flat plane)
   * @param {number} z height above the plane
   */
  project(x, y, z) {
    return {
      sx: x,
      sy: y * this.groundTilt - (z || 0) * this.heightScale,
    };
  },

  /* Draw order. Larger world y draws in front — things further "up" the
     screen are further away and get overdrawn.                             */
  depthOf(y) {
    return y;
  },
};
