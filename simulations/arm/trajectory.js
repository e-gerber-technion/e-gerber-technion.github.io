/**
 * trajectory.js — Full TrajectoryPlayer implementation.
 *
 * Trajectory text format:
 *   # Lines starting with # or // are comments and are ignored.
 *   # Each data line: time(s)  J1  J2  ...  JN
 *   # Separators: any whitespace or commas.
 *   #
 *   0.0    0    0    0
 *   2.5   45   30  -20
 *   5.0  -30   60   45
 *   7.5    0    0    0
 *
 * Timestamp resolution:
 *   If the time between two keyframes is shorter than what a joint's maxSpeed
 *   allows, the segment is silently extended. All subsequent timestamps are
 *   shifted by the same delta (cascading delay).
 *
 * Interpolation: smoothstep (3t² − 2t³) for natural acceleration/deceleration.
 */
(function (global) {
  'use strict';

  class TrajectoryPlayer {
    /**
     * @param {object[]} joints    Reference to the arm's live joint array.
     * @param {Function} onUpdate  Called each animation frame with (currentT, totalT).
     */
    constructor(joints, onUpdate) {
      this._joints       = joints;
      this._onUpdate     = onUpdate || function () {};
      this._keyframes    = []; // resolved [{t, values}]
      this._playing      = false;
      this._done         = false;
      this._startWall    = null; // performance.now() at play start
      this._elapsedT     = 0;   // trajectory-time at last pause/seek
      this._rafId        = null;
      this._totalDuration = 0;
    }

    // ── Parsing ─────────────────────────────────────────────────────────────

    /**
     * Parses trajectory text into raw keyframes.
     * @param {string} text
     * @returns {{t:number, values:number[]}[]}
     */
    parse(text) {
      const keyframes = [];
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
        if (parts.length < 2) continue;
        const t = parseFloat(parts[0]);
        if (isNaN(t)) continue;
        keyframes.push({ t, values: parts.slice(1).map(Number) });
      }
      return keyframes.sort((a, b) => a.t - b.t);
    }

    /**
     * Loads trajectory text: parse → clamp → resolve timestamps.
     * @param {string} text
     * @returns {{t:number, values:number[]}[]} Resolved keyframes (for display).
     */
    load(text) {
      const raw = this.parse(text);
      if (raw.length === 0) {
        this._keyframes     = [];
        this._totalDuration = 0;
        this._elapsedT      = 0;
        this._done          = false;
        return [];
      }

      // Clamp values to joint limits; fill missing joints from previous keyframe
      const n = this._joints.length;
      const clamped = [];
      let prevValues = this._joints.map(j => j.value);
      for (const kf of raw) {
        const values = Array.from({ length: n }, (_, i) => {
          const v = kf.values[i] !== undefined ? kf.values[i] : prevValues[i];
          return Math.min(this._joints[i].max, Math.max(this._joints[i].min, v));
        });
        clamped.push({ t: kf.t, values });
        prevValues = values;
      }

      this._keyframes     = this._resolveTimestamps(clamped);
      this._totalDuration = this._keyframes[this._keyframes.length - 1].t;
      this._elapsedT      = 0;
      this._done          = false;
      return this._keyframes;
    }

    // ── Timestamp resolution ─────────────────────────────────────────────────

    _resolveTimestamps(raw) {
      if (raw.length === 0) return [];
      const resolved = [{ t: raw[0].t, values: raw[0].values.slice() }];

      for (let i = 1; i < raw.length; i++) {
        const prev           = resolved[i - 1];
        const curr           = raw[i];
        const requestedDt    = Math.max(0, curr.t - raw[i - 1].t);

        let minDt = requestedDt;
        for (let j = 0; j < this._joints.length; j++) {
          const delta  = Math.abs(curr.values[j] - prev.values[j]);
          const needed = delta / this._joints[j].maxSpeed;
          if (needed > minDt) minDt = needed;
        }

        resolved.push({ t: prev.t + minDt, values: curr.values.slice() });
      }
      return resolved;
    }

    // ── Interpolation ────────────────────────────────────────────────────────

    _getValuesAt(t) {
      const kfs = this._keyframes;
      if (kfs.length === 0) return this._joints.map(j => j.value);
      if (t <= kfs[0].t)               return kfs[0].values.slice();
      if (t >= kfs[kfs.length - 1].t)  return kfs[kfs.length - 1].values.slice();

      let lo = 0, hi = kfs.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (kfs[mid].t <= t) lo = mid; else hi = mid;
      }
      const k0 = kfs[lo], k1 = kfs[hi];
      const a  = (t - k0.t) / (k1.t - k0.t);
      const s  = a * a * (3 - 2 * a); // smoothstep

      return k0.values.map((v, i) => v + (k1.values[i] - v) * s);
    }

    // ── Playback controls ────────────────────────────────────────────────────

    play() {
      if (this._playing || this._keyframes.length === 0) return;
      if (this._done) this._elapsedT = 0;
      this._playing   = true;
      this._done      = false;
      this._startWall = performance.now() - this._elapsedT * 1000;
      this._tick();
    }

    _tick() {
      if (!this._playing) return;
      const nowT   = (performance.now() - this._startWall) / 1000;
      const values = this._getValuesAt(nowT);
      values.forEach((v, i) => { if (i < this._joints.length) this._joints[i].value = v; });
      this._elapsedT = nowT;
      this._onUpdate(Math.min(nowT, this._totalDuration), this._totalDuration);

      if (nowT >= this._totalDuration) {
        this._playing  = false;
        this._done     = true;
        this._elapsedT = this._totalDuration;
        return;
      }
      this._rafId = requestAnimationFrame(() => this._tick());
    }

    pause() {
      if (!this._playing) return;
      this._playing = false;
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    }

    /** Stop and return to t = 0. */
    stop() {
      this.pause();
      this._elapsedT = 0;
      this._done     = false;
      if (this._keyframes.length > 0) {
        const values = this._getValuesAt(0);
        values.forEach((v, i) => { if (i < this._joints.length) this._joints[i].value = v; });
      }
      this._onUpdate(0, this._totalDuration);
    }

    /** Seek to trajectory time t (seconds). */
    seek(t) {
      const wasPlaying  = this._playing;
      this.pause();
      this._elapsedT    = Math.max(0, Math.min(t, this._totalDuration));
      this._done        = this._elapsedT >= this._totalDuration;
      const values      = this._getValuesAt(this._elapsedT);
      values.forEach((v, i) => { if (i < this._joints.length) this._joints[i].value = v; });
      this._onUpdate(this._elapsedT, this._totalDuration);
      if (wasPlaying && !this._done) this.play();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Generates a starter template string based on current joint configuration.
     * @param {number} [steps=4]
     * @returns {string}
     */
    generateTemplate(steps) {
      steps = steps || 4;
      const n = this._joints.length;
      const header = [
        '# Robotic Arm Trajectory',
        '# Format:  time(s)  ' + this._joints.map((j, i) => `J${i + 1}(${j.type === 'rotary' ? '°' : 'px'})`).join('  '),
        '# Comments start with #. Commas or spaces as separators.',
        '# If a timestep is too short for the joint speed limit, it will be extended automatically.',
        '',
      ].join('\n');

      const lines = [];
      for (let s = 0; s < steps; s++) {
        const t      = (s * 2).toFixed(1);
        const vals   = this._joints.map(() => '0').join('   ');
        lines.push(`${t.padStart(5)}   ${vals}`);
      }
      return header + lines.join('\n');
    }

    get isPlaying()     { return this._playing; }
    get currentTime()   { return this._elapsedT; }
    get totalDuration() { return this._totalDuration; }
    get isDone()        { return this._done; }
    get hasTrajectory() { return this._keyframes.length > 0; }
  }

  global.TrajectoryPlayer = TrajectoryPlayer;
})(window);
