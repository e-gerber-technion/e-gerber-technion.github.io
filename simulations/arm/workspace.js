/**
 * workspace.js — Monte Carlo workspace sampler.
 *
 * Samples random joint configurations uniformly within each joint's [min, max]
 * range, computes FK, and records the end-effector position as an offset from
 * the base. Storing offsets (not absolute canvas coords) means the result
 * stays valid across window resizes — just add the current base position
 * at draw time.
 */
(function (global) {
  'use strict';

  /**
   * Computes reachable workspace via Monte Carlo sampling.
   *
   * @param {object[]} joints      Array of joint objects (reads type/min/max/baseLength/value).
   * @param {number}   [n=4000]   Number of random samples.
   * @returns {{dx: number, dy: number}[]}  Offsets from the arm base at (0, 0).
   */
  function compute(joints, n) {
    n = n || 4000;
    const offsets = new Array(n);

    // Save live joint values so we can restore them after sampling
    const saved = joints.map(j => j.value);

    for (let s = 0; s < n; s++) {
      // Draw a random configuration
      for (const j of joints) {
        j.value = j.min + Math.random() * (j.max - j.min);
      }
      // FK with base at origin gives us the offset directly
      const pts = Arm.computeFK(joints, 0, 0);
      const ep  = pts[pts.length - 1];
      offsets[s] = { dx: ep.x, dy: ep.y };
    }

    // Restore joint values
    joints.forEach((j, i) => { j.value = saved[i]; });

    return offsets;
  }

  global.Workspace = { compute };
})(window);
