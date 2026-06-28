/**
 * Computes the forward kinematics of a serial manipulator using standard DH parameters.
 * 
 * @param {Array} dhTable - Array of joint DH parameters: { type: 'R'|'P', d: number, theta: number, a: number, alpha: number }
 * @param {Array} jointValues - Array of joint variable values (angles in radians for R, extensions in meters for P)
 * @param {Object} basePose - Base transformation: { x, y, z, rx, ry, rz } (rx, ry, rz in Euler radians, XYZ order). Can be null.
 * @returns {Array} List of frame structures containing: { transform: THREE.Matrix4, position: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3, zAxis: THREE.Vector3 }
 */
window.computeForwardKinematics = function(dhTable, jointValues, basePose) {
  const frames = [];

  // 1. Calculate Base Transform (Frame 0)
  const T_base = new THREE.Matrix4();
  if (basePose) {
    const translation = new THREE.Vector3(basePose.x, basePose.y, basePose.z);
    const rotation = new THREE.Euler(basePose.rx, basePose.ry, basePose.rz, 'XYZ');
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
    T_base.makeTranslation(translation.x, translation.y, translation.z).multiply(rotMatrix);
  }

  // Extract base frame vectors
  const pos0 = new THREE.Vector3().setFromMatrixPosition(T_base);
  const x0 = new THREE.Vector3(1, 0, 0).applyMatrix4(T_base).sub(pos0).normalize();
  const y0 = new THREE.Vector3(0, 1, 0).applyMatrix4(T_base).sub(pos0).normalize();
  const z0 = new THREE.Vector3(0, 0, 1).applyMatrix4(T_base).sub(pos0).normalize();

  frames.push({
    transform: T_base.clone(),
    position: pos0,
    xAxis: x0,
    yAxis: y0,
    zAxis: z0
  });

  // 2. Compute DH transformations sequentially
  let T_current = T_base.clone();

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

    // Standard DH homogeneous matrix formulation
    const cosTh = Math.cos(theta);
    const sinTh = Math.sin(theta);
    const cosAl = Math.cos(alpha);
    const sinAl = Math.sin(alpha);

    // Row-major declaration in .set() translates to column-major internally in Three.js
    const T_local = new THREE.Matrix4().set(
      cosTh, -sinTh * cosAl,  sinTh * sinAl, a * cosTh,
      sinTh,  cosTh * cosAl, -cosTh * sinAl, a * sinTh,
      0,      sinAl,          cosAl,         d,
      0,      0,              0,             1
    );

    // Cumulative transformation: W_T_i = W_T_i-1 * i-1_T_i
    T_current = T_current.clone().multiply(T_local);

    // Extract position and axes vectors for the current frame
    const pos = new THREE.Vector3().setFromMatrixPosition(T_current);
    const x = new THREE.Vector3(1, 0, 0).applyMatrix4(T_current).sub(pos).normalize();
    const y = new THREE.Vector3(0, 1, 0).applyMatrix4(T_current).sub(pos).normalize();
    const z = new THREE.Vector3(0, 0, 1).applyMatrix4(T_current).sub(pos).normalize();

    frames.push({
      transform: T_current.clone(),
      position: pos,
      xAxis: x,
      yAxis: y,
      zAxis: z
    });
  }

  return frames;
}
