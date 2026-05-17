/**
 * renderer.js — Stateless canvas renderer for the robotic arm visualizer.
 *
 * render(ctx, points, joints, wsOffsets) redraws the complete scene from
 * scratch each call. It is intentionally stateless so that animation /
 * trajectory playback can drive it by updating joint values and calling
 * render() each frame.
 *
 * Visual conventions:
 *   - Workspace   : faint violet point cloud (if wsOffsets provided)
 *   - Base        : green triangle anchor at points[0]
 *   - Segments    : light lines between consecutive points
 *   - Rotary      : blue filled circle at the joint origin
 *   - Prismatic   : amber diamond at the joint origin
 *   - Endpoint    : coral circle + crosshair at points[last]
 */
(function (global) {
  'use strict';

  const C = {
    bg:            '#0d1117',
    grid:          'rgba(255,255,255,0.035)',
    segment:       '#c9d1d9',
    base:          '#3fb950',
    baseGlow:      'rgba(63,185,80,0.4)',
    rotary:        '#58a6ff',
    rotaryGlow:    'rgba(88,166,255,0.4)',
    prismatic:     '#ffa657',
    prismaticGlow: 'rgba(255,166,87,0.4)',
    endpoint:      '#ff7b72',
    endpointGlow:  'rgba(255,123,114,0.5)',
    crosshair:     'rgba(255,123,114,0.55)',
    labelText:     'rgba(201,209,217,0.75)',
    workspace:     'rgba(139, 92, 246, 0.07)',  // violet, very faint per point
    wsBorder:      'rgba(139, 92, 246, 0.45)',
  };

  // ── helpers ──────────────────────────────────────────────────────────────

  function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx)            { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

  // ── background ───────────────────────────────────────────────────────────

  function drawBackground(ctx, w, h) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  // ── workspace ────────────────────────────────────────────────────────────

  /**
   * Renders workspace as a density point cloud.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{dx,dy}[]} offsets   Pre-computed offsets from Workspace.compute()
   * @param {number} baseX
   * @param {number} baseY
   */
  function renderWorkspace(ctx, offsets, baseX, baseY) {
    if (!offsets || offsets.length === 0) return;
    ctx.save();
    ctx.fillStyle = C.workspace;
    for (const { dx, dy } of offsets) {
      ctx.beginPath();
      ctx.arc(baseX + dx, baseY + dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── segments ─────────────────────────────────────────────────────────────

  function drawSegments(ctx, points) {
    ctx.save();
    glow(ctx, 'rgba(201,209,217,0.2)', 8);
    ctx.strokeStyle = C.segment;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i++) {
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
    }
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
  }

  // ── base anchor ──────────────────────────────────────────────────────────

  function drawBase(ctx, p) {
    ctx.save();
    glow(ctx, C.baseGlow, 14);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 14, p.y + 20);
    ctx.lineTo(p.x + 14, p.y + 20);
    ctx.closePath();
    ctx.fillStyle = C.base;
    ctx.fill();
    ctx.strokeStyle = C.base;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - 20, p.y + 20);
    ctx.lineTo(p.x + 20, p.y + 20);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let dx = -16; dx <= 16; dx += 8) {
      ctx.beginPath();
      ctx.moveTo(p.x + dx,     p.y + 20);
      ctx.lineTo(p.x + dx - 5, p.y + 27);
      ctx.stroke();
    }
    noGlow(ctx);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  // ── joint markers ─────────────────────────────────────────────────────────

  function drawRotaryJoint(ctx, p) {
    ctx.save();
    glow(ctx, C.rotaryGlow, 14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle   = C.rotary;
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
  }

  function drawPrismaticJoint(ctx, p) {
    const h = 8;
    ctx.save();
    glow(ctx, C.prismaticGlow, 14);
    ctx.beginPath();
    ctx.moveTo(p.x,     p.y - h);
    ctx.lineTo(p.x + h, p.y    );
    ctx.lineTo(p.x,     p.y + h);
    ctx.lineTo(p.x - h, p.y    );
    ctx.closePath();
    ctx.fillStyle   = C.prismatic;
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
  }

  // ── end-effector ──────────────────────────────────────────────────────────

  function drawEndpoint(ctx, p) {
    const cl = 20;
    ctx.save();
    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x - cl, p.y); ctx.lineTo(p.x + cl, p.y);
    ctx.moveTo(p.x, p.y - cl); ctx.lineTo(p.x, p.y + cl);
    ctx.stroke();
    ctx.setLineDash([]);
    glow(ctx, C.endpointGlow, 20);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,123,114,0.35)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.endpoint;
    ctx.fill();
    noGlow(ctx);
    ctx.restore();
  }

  function drawJointLabel(ctx, p, label) {
    ctx.save();
    ctx.font         = '600 11px Inter, sans-serif';
    ctx.fillStyle    = C.labelText;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x + 14, p.y - 14);
    ctx.restore();
  }

  // ── main render ───────────────────────────────────────────────────────────

  /**
   * Clears and redraws the full scene.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{x,y}>} points     FK output (length = joints.length + 1).
   * @param {object[]}     joints     Joint objects (for type metadata).
   * @param {{dx,dy}[]}   [wsOffsets] Workspace point cloud (optional).
   */
  function render(ctx, points, joints, wsOffsets) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    drawBackground(ctx, w, h);

    // Workspace underneath everything else
    if (wsOffsets && points && points.length > 0) {
      renderWorkspace(ctx, wsOffsets, points[0].x, points[0].y);
    }

    if (!points || points.length < 2) return;

    drawSegments(ctx, points);

    for (let i = 0; i < joints.length; i++) {
      const p = points[i];
      if (joints[i].type === 'rotary') drawRotaryJoint(ctx, p);
      else                             drawPrismaticJoint(ctx, p);
      drawJointLabel(ctx, p, 'J' + (i + 1));
    }

    drawBase(ctx, points[0]);
    drawEndpoint(ctx, points[points.length - 1]);
  }

  global.Renderer = { render, renderWorkspace };
})(window);
