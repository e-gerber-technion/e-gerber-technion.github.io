/**
 * Computes the forward kinematics of a serial manipulator using standard DH parameters.
 * 
 * PERFORMANCE: Uses pre-allocated scratch objects and a frame pool to avoid
 * per-call allocations. The returned frames array and its objects are reused
 * across calls — callers must NOT hold references across multiple invocations.
 * Clone any data you need to persist (e.g. frame.position.clone()).
 * 
 * @param {Array} dhTable - Array of joint DH parameters: { type: 'R'|'P', d: number, theta: number, a: number, alpha: number }
 * @param {Array} jointValues - Array of joint variable values (angles in radians for R, extensions in meters for P)
 * @param {Object} basePose - Base transformation: { x, y, z, rx, ry, rz } (rx, ry, rz in Euler radians, XYZ order). Can be null.
 * @returns {Array} List of frame structures containing: { transform: THREE.Matrix4, position: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3, zAxis: THREE.Vector3 }
 */

// --- Pre-allocated scratch objects (reused every call) ---
const _fk_T_base = new THREE.Matrix4();
const _fk_T_local = new THREE.Matrix4();
const _fk_T_current = new THREE.Matrix4();
const _fk_rotMatrix = new THREE.Matrix4();
const _fk_translation = new THREE.Vector3();
const _fk_rotation = new THREE.Euler(0, 0, 0, 'XYZ');
const _fk_tempVec = new THREE.Vector3();

// --- Frame object pool (grows as needed, never shrinks) ---
const _framePool = [];
const _framesResult = [];

function _getPoolFrame(index) {
  while (index >= _framePool.length) {
    _framePool.push({
      transform: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      xAxis: new THREE.Vector3(),
      yAxis: new THREE.Vector3(),
      zAxis: new THREE.Vector3()
    });
  }
  return _framePool[index];
}

/** Extracts position and axis vectors from a 4x4 matrix into a frame object. */
function _extractFrame(matrix, frame) {
  frame.transform.copy(matrix);
  frame.position.setFromMatrixPosition(matrix);

  _fk_tempVec.set(1, 0, 0).applyMatrix4(matrix).sub(frame.position).normalize();
  frame.xAxis.copy(_fk_tempVec);

  _fk_tempVec.set(0, 1, 0).applyMatrix4(matrix).sub(frame.position).normalize();
  frame.yAxis.copy(_fk_tempVec);

  _fk_tempVec.set(0, 0, 1).applyMatrix4(matrix).sub(frame.position).normalize();
  frame.zAxis.copy(_fk_tempVec);
}

window.computeForwardKinematics = function(dhTable, jointValues, basePose) {
  _framesResult.length = 0;

  // 1. Calculate Base Transform (Frame 0)
  _fk_T_base.identity();
  if (basePose) {
    _fk_translation.set(basePose.x, basePose.y, basePose.z);
    _fk_rotation.set(basePose.rx, basePose.ry, basePose.rz, 'XYZ');
    _fk_rotMatrix.makeRotationFromEuler(_fk_rotation);
    _fk_T_base.makeTranslation(_fk_translation.x, _fk_translation.y, _fk_translation.z).multiply(_fk_rotMatrix);
  }

  // Extract base frame vectors into pool frame 0
  const frame0 = _getPoolFrame(0);
  _extractFrame(_fk_T_base, frame0);
  _framesResult.push(frame0);

  // 2. Compute DH transformations sequentially
  _fk_T_current.copy(_fk_T_base);

  for (let i = 0; i < dhTable.length; i++) {
    const joint = dhTable[i];
    
    // Override DH parameter with trajectory value if available
    let theta = joint.theta;
    let d = joint.d;
    
    if (jointValues && jointValues[i] !== undefined) {
      if (joint.type === 'R') {
        theta = jointValues[i]; // Angle trajectory value
      } else if (joint.type === 'P') {
        d = jointValues[i];     // Linear extension trajectory value
      }
    }

    const a = joint.a;
    const alpha = joint.alpha;

    // Standard or Modified DH homogeneous matrix formulation
    const cosTh = Math.cos(theta);
    const sinTh = Math.sin(theta);
    const cosAl = Math.cos(alpha);
    const sinAl = Math.sin(alpha);

    const isModified = (dhTable.dhConvention === 'modified') || (joint.convention === 'modified');

    if (isModified) {
      // Modified DH (Craig convention used by FR3): T_i = R_x(alpha_prev) * T_x(a_prev) * R_z(theta) * T_z(d)
      _fk_T_local.set(
        cosTh, -sinTh, 0, a,
        sinTh * cosAl, cosTh * cosAl, -sinAl, -d * sinAl,
        sinTh * sinAl, cosTh * sinAl, cosAl, d * cosAl,
        0, 0, 0, 1
      );
    } else {
      // Standard DH formulation (used by UR5)
      _fk_T_local.set(
        cosTh, -sinTh * cosAl,  sinTh * sinAl, a * cosTh,
        sinTh,  cosTh * cosAl, -cosTh * sinAl, a * sinTh,
        0,      sinAl,          cosAl,         d,
        0,      0,              0,             1
      );
    }


    // Cumulative transformation: W_T_i = W_T_i-1 * i-1_T_i
    _fk_T_current.multiply(_fk_T_local);

    // Extract position and axes vectors into pool frame
    const frame = _getPoolFrame(i + 1);
    _extractFrame(_fk_T_current, frame);
    _framesResult.push(frame);
  }

  return _framesResult;
}
