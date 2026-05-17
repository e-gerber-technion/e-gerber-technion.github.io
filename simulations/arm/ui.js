/**
 * ui.js — User interface logic for the robotic arm visualizer.
 *
 * Phase 1 — Configuration:
 *   User sets joint count, type, base length, limits, and max speed per joint.
 *   "Launch Visualizer" transitions to phase 2.
 *
 * Phase 2 — Control:
 *   Manual sliders drive each joint in real time.
 *   Trajectory panel: inline code editor + file load, Play/Pause/Stop/Reset.
 *   Workspace toggle: compute and display reachable workspace overlay.
 *
 * Depends on: arm.js, renderer.js, trajectory.js, workspace.js.
 */
(function (global) {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────

  let joints    = [];
  let canvas    = null;
  let ctx       = null;
  let player    = null;
  let wsPoints  = null;   // workspace offsets (null = not computed / hidden)
  let wsVisible = false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmt(value, type) {
    return type === 'rotary'
      ? parseFloat(value).toFixed(1) + '°'
      : parseFloat(value).toFixed(1) + ' px';
  }

  function baseCoords() {
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight - 40 };
  }

  function resizeCanvas() {
    const rect  = canvas.getBoundingClientRect();
    const dpr   = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function redraw() {
    resizeCanvas();
    const { x, y } = baseCoords();
    const points = Arm.computeFK(joints, x, y);
    Renderer.render(ctx, points, joints, wsVisible ? wsPoints : null);
    updateEndpointDisplay(points);
    syncSliders();
  }

  function updateEndpointDisplay(points) {
    const ep   = points[points.length - 1];
    const base = points[0];
    const dX   = (ep.x - base.x).toFixed(1);
    const dY   = (-(ep.y - base.y)).toFixed(1);
    const el   = document.getElementById('endpoint-display');
    if (el) el.textContent = `End-effector: (${dX} px, ${dY} px)`;
  }

  // Sync slider thumbs + readouts to current joint values (called during playback)
  function syncSliders() {
    joints.forEach((j, i) => {
      const slider = document.getElementById(`slider-${i}`);
      const readout = document.getElementById(`readout-${i}`);
      if (slider)  slider.value       = j.value;
      if (readout) readout.textContent = fmt(j.value, j.type);
    });
  }

  // ── Phase 1: Configuration ────────────────────────────────────────────────

  function buildJointRows(count) {
    const container = document.getElementById('joint-rows');
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'joint-row';
      row.innerHTML = `
        <div class="joint-row-header">
          <span class="joint-index">Joint ${i + 1}</span>
          <select class="joint-type-select" data-idx="${i}">
            <option value="rotary">Rotary</option>
            <option value="prismatic">Prismatic</option>
          </select>
        </div>
        <div class="joint-row-fields">
          <label>
            <span>Length</span>
            <div class="input-unit-wrap">
              <input type="number" class="field-length" value="100" min="10" max="500" step="1">
              <span class="unit-badge">px</span>
            </div>
          </label>
          <label>
            <span>Min</span>
            <div class="input-unit-wrap">
              <input type="number" class="field-min" value="-90" step="1">
              <span class="unit-badge unit-badge-type">°</span>
            </div>
          </label>
          <label>
            <span>Max</span>
            <div class="input-unit-wrap">
              <input type="number" class="field-max" value="90" step="1">
              <span class="unit-badge unit-badge-type">°</span>
            </div>
          </label>
          <label>
            <span>Speed</span>
            <div class="input-unit-wrap">
              <input type="number" class="field-speed" value="90" min="1" max="9999" step="1">
              <span class="unit-badge unit-badge-speed">°/s</span>
            </div>
          </label>
        </div>`;
      container.appendChild(row);

      const sel      = row.querySelector('.joint-type-select');
      const typeBadges  = row.querySelectorAll('.unit-badge-type');
      const speedBadge  = row.querySelector('.unit-badge-speed');
      const minEl    = row.querySelector('.field-min');
      const maxEl    = row.querySelector('.field-max');
      const speedEl  = row.querySelector('.field-speed');

      sel.addEventListener('change', () => {
        const isRotary = sel.value === 'rotary';
        typeBadges.forEach(b => b.textContent = isRotary ? '°' : 'px');
        speedBadge.textContent = isRotary ? '°/s' : 'px/s';
        if (isRotary)  { minEl.value = -90;  maxEl.value = 90;  speedEl.value = 90;  }
        else           { minEl.value = -50;  maxEl.value = 200; speedEl.value = 100; }
      });
    }
  }

  function readConfig() {
    const rows = document.querySelectorAll('.joint-row');
    joints = [];
    rows.forEach((row, i) => {
      const type       = row.querySelector('.joint-type-select').value;
      const baseLength = parseFloat(row.querySelector('.field-length').value)  || 100;
      const min        = parseFloat(row.querySelector('.field-min').value);
      const max        = parseFloat(row.querySelector('.field-max').value);
      const maxSpeed   = parseFloat(row.querySelector('.field-speed').value) || (type === 'rotary' ? 90 : 100);
      joints.push(Arm.createJoint({ id: i, type, baseLength, min, max, maxSpeed }));
    });
  }

  function initConfig() {
    const countInput = document.getElementById('joint-count');
    countInput.addEventListener('input', () => {
      const n = Math.min(8, Math.max(1, parseInt(countInput.value) || 1));
      buildJointRows(n);
    });
    buildJointRows(parseInt(countInput.value) || 3);

    document.getElementById('btn-launch').addEventListener('click', () => {
      readConfig();
      showVisualizer();
    });
  }

  // ── Phase 2: Slider panel ─────────────────────────────────────────────────

  function buildSliders() {
    const container = document.getElementById('slider-panel');
    container.innerHTML = '';

    joints.forEach((joint, i) => {
      const typeLabel = joint.type === 'rotary' ? 'Rotary' : 'Prismatic';
      const unit      = joint.type === 'rotary' ? '°' : ' px';
      const typeClass = joint.type === 'rotary' ? 'tag-rotary' : 'tag-prismatic';

      const card = document.createElement('div');
      card.className = 'slider-card';
      card.innerHTML = `
        <div class="slider-header">
          <span class="slider-label">Joint ${i + 1}</span>
          <span class="joint-tag ${typeClass}">${typeLabel}</span>
        </div>
        <div class="slider-row">
          <span class="slider-bound">${joint.min}${unit}</span>
          <input
            type="range"
            class="joint-slider"
            id="slider-${i}"
            min="${joint.min}"
            max="${joint.max}"
            value="0"
            step="${joint.type === 'rotary' ? 0.5 : 1}">
          <span class="slider-bound">${joint.max}${unit}</span>
        </div>
        <div class="slider-readout">
          <span class="readout-value" id="readout-${i}">0${unit}</span>
        </div>`;
      container.appendChild(card);

      card.querySelector('.joint-slider').addEventListener('input', (e) => {
        joint.value = parseFloat(e.target.value);
        document.getElementById(`readout-${i}`).textContent = fmt(e.target.value, joint.type);
        redraw();
      });
    });
  }

  function setSliderInteractivity(enabled) {
    document.querySelectorAll('.joint-slider').forEach(s => {
      s.disabled = !enabled;
      s.closest('.slider-card').classList.toggle('slider-disabled', !enabled);
    });
  }

  // ── Phase 2: Trajectory panel ─────────────────────────────────────────────

  function initTrajectoryPanel() {
    // Pre-populate with template
    const textarea = document.getElementById('traj-code');
    textarea.value = player.generateTemplate(4);

    // Load file button
    document.getElementById('btn-traj-file').addEventListener('click', () => {
      document.getElementById('traj-file-input').click();
    });
    document.getElementById('traj-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        textarea.value = ev.target.result;
        loadTrajectory();
      };
      reader.readAsText(file);
      e.target.value = ''; // allow re-selecting same file
    });

    // Load from textarea
    document.getElementById('btn-traj-load').addEventListener('click', loadTrajectory);

    // Playback buttons
    document.getElementById('btn-traj-play').addEventListener('click', () => {
      if (player.isPlaying) {
        player.pause();
        setPlayBtn(false);
        setSliderInteractivity(true);
      } else {
        loadTrajectory(); // always reload on play
        player.play();
        setPlayBtn(true);
        setSliderInteractivity(false);
      }
    });

    document.getElementById('btn-traj-stop').addEventListener('click', () => {
      player.stop();
      setPlayBtn(false);
      setSliderInteractivity(true);
      redraw();
    });

    // Scrubber
    const scrubber = document.getElementById('traj-scrubber');
    scrubber.addEventListener('input', () => {
      const t = parseFloat(scrubber.value);
      player.seek(t);
      redraw();
    });
    // Allow scrubbing while playing
    scrubber.addEventListener('mousedown', () => {
      if (player.isPlaying) { player.pause(); setPlayBtn(false); }
    });
  }

  function loadTrajectory() {
    const text = document.getElementById('traj-code').value;
    const kfs  = player.load(text);
    updateScrubber(0, player.totalDuration);
    setTrajStatus(kfs.length === 0 ? 'No keyframes loaded' : `${kfs.length} keyframes  •  ${player.totalDuration.toFixed(2)} s total`);
    document.getElementById('btn-traj-play').disabled = kfs.length === 0;
  }

  function setPlayBtn(playing) {
    const btn = document.getElementById('btn-traj-play');
    btn.textContent = playing ? '⏸ Pause' : '▶ Play';
    btn.classList.toggle('btn-playing', playing);
  }

  function setTrajStatus(msg) {
    const el = document.getElementById('traj-status');
    if (el) el.textContent = msg;
  }

  function updateScrubber(currentT, totalT) {
    const scrubber = document.getElementById('traj-scrubber');
    scrubber.max   = totalT || 1;
    scrubber.value = currentT;
    const timeEl   = document.getElementById('traj-time');
    if (timeEl) timeEl.textContent = `${currentT.toFixed(2)} / ${(totalT || 0).toFixed(2)} s`;
  }

  // ── Phase 2: Workspace ────────────────────────────────────────────────────

  function initWorkspaceToggle() {
    document.getElementById('btn-workspace').addEventListener('click', () => {
      wsVisible = !wsVisible;
      const btn = document.getElementById('btn-workspace');
      if (wsVisible) {
        btn.classList.add('ws-on');
        btn.textContent = '◉ Workspace: ON';
        if (!wsPoints) {
          btn.textContent = '◉ Computing…';
          // Use setTimeout so the button text updates before the heavy computation
          setTimeout(() => {
            wsPoints = Workspace.compute(joints, 5000);
            btn.textContent = '◉ Workspace: ON';
            redraw();
          }, 20);
          return;
        }
      } else {
        btn.classList.remove('ws-on');
        btn.textContent = '◎ Workspace: OFF';
      }
      redraw();
    });
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  function showVisualizer() {
    document.getElementById('phase-config').classList.add('hidden');
    document.getElementById('phase-control').classList.remove('hidden');
    document.getElementById('canvas-hint').classList.add('hidden');

    buildSliders();

    // Trajectory player
    player = new TrajectoryPlayer(joints, (currentT, totalT) => {
      updateScrubber(currentT, totalT);
      redraw();
      if (player.isDone) {
        setPlayBtn(false);
        setSliderInteractivity(true);
        setTrajStatus('Done');
      }
    });

    initTrajectoryPanel();
    initWorkspaceToggle();

    // Invalidate cached workspace on reconfigure
    wsPoints  = null;
    wsVisible = false;
    document.getElementById('btn-workspace').classList.remove('ws-on');
    document.getElementById('btn-workspace').textContent = '◎ Workspace: OFF';

    requestAnimationFrame(redraw);
  }

  function showConfig() {
    if (player && player.isPlaying) player.stop();
    document.getElementById('phase-control').classList.add('hidden');
    document.getElementById('phase-config').classList.remove('hidden');
    document.getElementById('canvas-hint').classList.remove('hidden');
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    canvas = document.getElementById('arm-canvas');
    ctx    = canvas.getContext('2d');

    window.addEventListener('resize', () => {
      if (!document.getElementById('phase-control').classList.contains('hidden')) redraw();
    });

    initConfig();

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (player && player.isPlaying) return;
      Arm.resetJoints(joints);
      syncSliders();
      redraw();
    });

    document.getElementById('btn-reconfig').addEventListener('click', showConfig);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
