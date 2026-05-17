/**
 * arm.js — Joint data model and forward kinematics engine.
 *
 * Joint object schema:
 * {
 *   id          : Number,
 *   type        : "rotary" | "prismatic",
 *   baseLength  : Number,  // resting segment length in pixels
 *   min         : Number,  // min value (deg for rotary, px for prismatic)
 *   max         : Number,  // max value
 *   value       : Number,  // current value (0 on creation)
 *   maxSpeed    : Number,  // max rate of change (°/s for rotary, px/s for prismatic)
 *   trajectory  : []       // populated by TrajectoryPlayer during playback
 * }
 *
 * FK conventions:
 *   - Initial cumulative angle α₀ = −90° (straight up on screen).
 *   - Canvas Y increases downward; math accounts for this automatically.
 *   - Rotary joints add their value (degrees) to the cumulative angle (relative).
 *   - Prismatic joints extend effectiveLength = baseLength + value (pixels); α unchanged.
 *   - Positive rotary value → clockwise on screen; negative → counter-clockwise.
 */
(function (global) {
  'use strict';

  /**
   * Creates a new joint object.
   * @param {object} cfg
   * @param {number} cfg.id
   * @param {'rotary'|'prismatic'} cfg.type
   * @param {number} cfg.baseLength  pixels
   * @param {number} cfg.min
   * @param {number} cfg.max
   * @param {number} [cfg.value=0]
   * @param {number} [cfg.maxSpeed]  °/s for rotary, px/s for prismatic. Defaults: 90 and 100.
   */
  function createJoint(cfg) {
    const defaultSpeed = cfg.type === 'rotary' ? 90 : 100;
    return {
      id:         cfg.id,
      type:       cfg.type,
      baseLength: cfg.baseLength,
      min:        cfg.min,
      max:        cfg.max,
      value:      cfg.value !== undefined ? cfg.value : 0,
      maxSpeed:   cfg.maxSpeed !== undefined ? cfg.maxSpeed : defaultSpeed,
      trajectory: [], // populated by TrajectoryPlayer
    };
  }

  /**
   * Computes forward kinematics for a serial arm.
   *
   * @param {object[]} joints  Array of joint objects.
   * @param {number}   baseX   X coordinate of the arm base (pixels).
   * @param {number}   baseY   Y coordinate of the arm base (pixels).
   * @returns {Array<{x:number, y:number}>}  Length = joints.length + 1.
   *   Index 0 = base; last index = end-effector.
   */
  function computeFK(joints, baseX, baseY) {
    const points = [{ x: baseX, y: baseY }];
    let alphaDeg = -90; // -90° = pointing straight up in canvas coordinates

    for (const joint of joints) {
      const prev = points[points.length - 1];

      if (joint.type === 'rotary') {
        alphaDeg += joint.value;
      }

      const length =
        joint.type === 'prismatic'
          ? Math.max(0, joint.baseLength + joint.value)
          : joint.baseLength;

      const alphaRad = (alphaDeg * Math.PI) / 180;
      points.push({
        x: prev.x + length * Math.cos(alphaRad),
        y: prev.y + length * Math.sin(alphaRad),
      });
    }

    return points;
  }

  /**
   * Resets all joint values to 0.
   * @param {object[]} joints
   */
  function resetJoints(joints) {
    joints.forEach((j) => { j.value = 0; });
  }

  global.Arm = { createJoint, computeFK, resetJoints };
})(window);
