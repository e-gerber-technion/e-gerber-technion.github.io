// --- Global Bindings ---
const {
  computeForwardKinematics,
  parseJointCSV,
  parseBaseCSV,
  parseTargetsCSV,
  CanvasRecorder,
  DEFAULT_UR5_DH,
  DEFAULT_FR3_DH,
  DEFAULT_JOINT_TRAJECTORY_CSV,
  DEFAULT_BASE_MOTION_CSV,
  DEFAULT_TARGETS_CSV
} = window;


// --- State Variables ---
let dhTable = JSON.parse(JSON.stringify(DEFAULT_UR5_DH)); // Deep copy
let angularUnit = 'degrees'; // 'degrees' or 'radians'

let jointTrajectory = null; // { timeSteps: [], trajectories: [[]] }
let baseTrajectory = null;  // [{ t, x, y, z, rx, ry, rz }, ...]
let targets = [];           // [{ x, y, z }, ...]

const toggles = {
  showFrames: true,
  showLinks: true,
  showJoints: true,
  showEETrace: true,
  showBaseTrace: true,
  showTargets: true,
  movingBase: true,
  showLabels: true
};

const playback = {
  isPlaying: false,
  currentTime: 0,
  speed: 1.0,
  loop: true,
  maxTime: 10.0
};

// Trace geometries
let eeTracePoints = [];
let baseTracePoints = [];
let eeTraceLine = null;
let baseTraceLine = null;

// Three.js instances
let scene, camera, renderer, controls;
let robotGroup, targetsGroup;
let recorder;

// --- PERFORMANCE: Cached shared resources ---
let sharedLinkMaterial = null;
let sharedJointMaterial = null;
let sharedJointGeometry = null;
let sharedLinkGeometry = null; // unit-height cylinder, scaled per frame

// Mesh pool — pre-built objects whose transforms are updated each frame
const meshPool = {
  axes: [],    // AxesHelper objects (one per DH frame)
  labels: [],  // Sprite objects (3 per frame: X, Y, Z)
  joints: [],  // Mesh objects for joint cylinders
  links: [],   // Mesh objects for link cylinders
};
let currentPoolSize = -1; // tracks dhTable.length to know when to rebuild

// Sprite material cache (keyed by "text|color") — avoids re-creating canvases
const spriteMaterialCache = new Map();

// Cached compiled DH table (invalidated when dhTable or angularUnit changes)
let cachedCompiledDH = null;
let dhDirty = true;

// Cached DOM element references (populated in initUI)
let domTimeScrubber = null;
let domTimeCurrent = null;
let domTimeTotal = null;
let domRecordPercent = null;
let domPlayIcon = null;
let domPauseIcon = null;

// Pre-allocated scratch vectors for link transform computation
const _linkDir = new THREE.Vector3();
const _linkUp = new THREE.Vector3();
const _linkQuat = new THREE.Quaternion();
const _linkMid = new THREE.Vector3();

// --- Initialization ---
function init() {
  initThree();
  initSharedResources();
  loadEmbeddedDefaults();
  initUI();
  
  // Build initial mesh pool and first render
  rebuildMeshPool();
  recalculateEverything();
  renderTargets();
  
  // Animation Loop
  let lastTime = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    
    // Playback logic
    if (playback.isPlaying) {
      playback.currentTime += dt * playback.speed;
      
      // Check for loop boundary
      if (playback.currentTime >= playback.maxTime) {
        if (playback.loop) {
          playback.currentTime = 0;
          
          // If we are recording and have completed one loop, stop the recording
          if (recorder && recorder.isRecording) {
            stopRecording();
          }
        } else {
          playback.currentTime = playback.maxTime;
          playback.isPlaying = false;
          updatePlayPauseButton();
          
          if (recorder && recorder.isRecording) {
            stopRecording();
          }
        }
      }
      
      updateTimelineUI();
    }
    
    // Update animation poses in the 3D scene (transform updates only, no allocations)
    renderRobotPose(playback.currentTime);
    
    // Update recording overlay if recording
    if (recorder && recorder.isRecording) {
      const pct = Math.min(100, Math.floor((playback.currentTime / playback.maxTime) * 100));
      domRecordPercent.innerText = pct;
    }
    
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

// --- Initialize shared GPU resources (called once) ---
function initSharedResources() {
  // Materials (created once, reused forever)
  sharedLinkMaterial = new THREE.MeshPhongMaterial({ color: 0x4f6c8f, shininess: 30 });
  sharedJointMaterial = new THREE.MeshPhongMaterial({ color: 0xa085de, shininess: 50 });
  
  // Joint cylinder geometry (fixed size, pre-rotated to align with Z-axis)
  sharedJointGeometry = new THREE.CylinderGeometry(0.024, 0.024, 0.06, 16);
  sharedJointGeometry.rotateX(Math.PI / 2);
  
  // Link cylinder geometry (unit height = 1, scaled per frame to actual distance)
  sharedLinkGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8);
}

// --- Setup Three.js ---
function initThree() {
  const container = document.getElementById('canvas-container');
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0f16);
  
  // Set default up vector to Z (standard for robotics conventions)
  THREE.Object3D.DefaultUp.set(0, 0, 1);

  // Camera
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.05, 50);
  camera.position.set(2.0, -2.0, 1.5);
  
  // Orbit Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0.2);
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go too far under ground
  
  // Ambient and Directional Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);
  
  const dirLight2 = new THREE.DirectionalLight(0xa8b8ff, 0.3);
  dirLight2.position.set(-5, 4, -5);
  scene.add(dirLight2);
  
  // Grid and Floor Helper (rotated to XY plane)
  const gridHelper = new THREE.GridHelper(10, 50, 0x4f4f4f, 0x222222);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.z = -0.001; // Avoid z-fighting on floor
  scene.add(gridHelper);
  
  // Robot and Targets Container Groups
  robotGroup = new THREE.Group();
  scene.add(robotGroup);
  
  targetsGroup = new THREE.Group();
  scene.add(targetsGroup);
  
  // Setup trace lines
  const eeMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
  const baseMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
  
  eeTraceLine = new THREE.Line(new THREE.BufferGeometry(), eeMat);
  baseTraceLine = new THREE.Line(new THREE.BufferGeometry(), baseMat);
  
  scene.add(eeTraceLine);
  scene.add(baseTraceLine);
  
  // Window Resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  
  // Initialize video recorder
  recorder = new CanvasRecorder(renderer.domElement);
}

// --- Load Embedded Default Data ---
function loadEmbeddedDefaults() {
  try {
    jointTrajectory = parseJointCSV(DEFAULT_JOINT_TRAJECTORY_CSV);
    baseTrajectory = parseBaseCSV(DEFAULT_BASE_MOTION_CSV, 'degrees');
    targets = parseTargetsCSV(DEFAULT_TARGETS_CSV);
    
    if (jointTrajectory && jointTrajectory.timeSteps.length > 0) {
      playback.maxTime = jointTrajectory.timeSteps[jointTrajectory.timeSteps.length - 1];
    }
  } catch (err) {
    console.error('Error loading default embedded assets:', err);
  }
}

// --- PERFORMANCE: Cached compiled DH table ---
function markDHDirty() {
  dhDirty = true;
}

function getCompiledDH() {
  if (dhDirty || !cachedCompiledDH) {
    cachedCompiledDH = dhTable.map(joint => {
      let theta = joint.theta;
      let alpha = joint.alpha;
      
      if (angularUnit === 'degrees') {
        theta = theta * Math.PI / 180;
        alpha = alpha * Math.PI / 180;
      }
      
      return {
        type: joint.type,
        d: joint.d,
        theta: theta,
        a: joint.a,
        alpha: alpha,
        convention: joint.convention
      };

    });
    dhDirty = false;
  }
  return cachedCompiledDH;
}

// --- Recalculate Trajectories & Traces ---
function recalculateEverything() {
  markDHDirty();
  rebuildMeshPoolIfNeeded();
  
  // Pre-calculate visual traces
  eeTracePoints = [];
  baseTracePoints = [];
  
  if (!jointTrajectory) return;
  
  const compiledDH = getCompiledDH();
  const { timeSteps, trajectories } = jointTrajectory;
  
  for (let i = 0; i < timeSteps.length; i++) {
    const t = timeSteps[i];
    const joints = trajectories[i];
    
    // Scale angles to radians if using degrees
    const jointsRad = joints.map((val, idx) => {
      const jointDef = dhTable[idx];
      if (jointDef && jointDef.type === 'R' && angularUnit === 'degrees') {
        return val * Math.PI / 180;
      }
      return val;
    });
    
    // Get base position
    const basePose = (toggles.movingBase && baseTrajectory) ? interpolateBasePose(t) : null;
    
    // Process math (note: FK returns pooled frames — clone positions we need to keep)
    const frames = computeForwardKinematics(compiledDH, jointsRad, basePose);
    if (frames.length > 0) {
      baseTracePoints.push(frames[0].position.clone());
      eeTracePoints.push(frames[frames.length - 1].position.clone());
    }
  }
  
  // Update line geometries
  updateTraceGeometries();
}

function updateTraceGeometries() {
  if (toggles.showEETrace && eeTracePoints.length > 1) {
    eeTraceLine.geometry.setFromPoints(eeTracePoints);
    eeTraceLine.visible = true;
  } else {
    eeTraceLine.visible = false;
  }
  
  if (toggles.showBaseTrace && baseTracePoints.length > 1) {
    baseTraceLine.geometry.setFromPoints(baseTracePoints);
    baseTraceLine.visible = true;
  } else {
    baseTraceLine.visible = false;
  }
}

// --- Linear Interpolation Helpers ---
function interpolateBasePose(t) {
  if (!baseTrajectory || baseTrajectory.length === 0) return null;
  
  const n = baseTrajectory.length;
  if (t <= baseTrajectory[0].t) return baseTrajectory[0];
  if (t >= baseTrajectory[n - 1].t) return baseTrajectory[n - 1];
  
  for (let i = 0; i < n - 1; i++) {
    const p1 = baseTrajectory[i];
    const p2 = baseTrajectory[i + 1];
    
    if (t >= p1.t && t <= p2.t) {
      const w = (t - p1.t) / (p2.t - p1.t);
      return {
        x: p1.x + w * (p2.x - p1.x),
        y: p1.y + w * (p2.y - p1.y),
        z: p1.z + w * (p2.z - p1.z),
        rx: p1.rx + w * (p2.rx - p1.rx),
        ry: p1.ry + w * (p2.ry - p1.ry),
        rz: p1.rz + w * (p2.rz - p1.rz)
      };
    }
  }
  return null;
}

function interpolateJointValues(t) {
  if (!jointTrajectory) return [];
  const { timeSteps, trajectories } = jointTrajectory;
  
  const n = timeSteps.length;
  if (n === 0) return [];
  if (t <= timeSteps[0]) return trajectories[0];
  if (t >= timeSteps[n - 1]) return trajectories[n - 1];
  
  for (let i = 0; i < n - 1; i++) {
    const t1 = timeSteps[i];
    const t2 = timeSteps[i + 1];
    
    if (t >= t1 && t <= t2) {
      const w = (t - t1) / (t2 - t1);
      const q1 = trajectories[i];
      const q2 = trajectories[i + 1];
      
      const q = [];
      const len = Math.min(q1.length, q2.length);
      for (let j = 0; j < len; j++) {
        q.push(q1[j] + w * (q2[j] - q1[j]));
      }
      return q;
    }
  }
  return [];
}

// --- PERFORMANCE: Cached Sprite Materials ---
function getCachedSpriteMaterial(text, color) {
  const key = text + '|' + color;
  if (spriteMaterialCache.has(key)) return spriteMaterialCache.get(key);
  
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = 'bold 20px "Space Grotesk", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 16);
  
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  
  spriteMaterialCache.set(key, mat);
  return mat;
}

// --- PERFORMANCE: Mesh Pool Management ---

/**
 * Checks whether the mesh pool needs rebuilding (joint count changed)
 * and rebuilds if necessary. Called from recalculateEverything().
 */
function rebuildMeshPoolIfNeeded() {
  if (dhTable.length !== currentPoolSize) {
    rebuildMeshPool();
  }
}

/**
 * Rebuilds the mesh pool from scratch. Creates all Three.js objects for the
 * current DH table size and adds them to robotGroup with visibility=false.
 * The render loop then toggles visibility and updates transforms per frame.
 */
function rebuildMeshPool() {
  // Clear existing pool objects from robotGroup
  while (robotGroup.children.length > 0) {
    robotGroup.remove(robotGroup.children[0]);
  }
  
  // Reset pool arrays
  meshPool.axes = [];
  meshPool.labels = [];
  meshPool.joints = [];
  meshPool.links = [];
  
  const numFrames = dhTable.length + 1; // base frame + N joint frames
  
  // Create axes helpers (one per frame)
  for (let i = 0; i < numFrames; i++) {
    const axesHelper = new THREE.AxesHelper(0.12);
    axesHelper.matrixAutoUpdate = false;
    axesHelper.visible = false;
    robotGroup.add(axesHelper);
    meshPool.axes.push(axesHelper);
  }
  
  // Create label sprites (3 per frame: X, Y, Z)
  const labelColors = ['#ff4d4d', '#4dff4d', '#4d4dff'];
  const labelPrefixes = ['X', 'Y', 'Z'];
  for (let i = 0; i < numFrames; i++) {
    for (let a = 0; a < 3; a++) {
      const text = labelPrefixes[a] + i;
      const color = labelColors[a];
      const mat = getCachedSpriteMaterial(text, color);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.08, 0.04, 1);
      sprite.visible = false;
      robotGroup.add(sprite);
      meshPool.labels.push(sprite);
    }
  }
  
  // Create joint cylinders (one per joint, not for base frame)
  for (let i = 0; i < dhTable.length; i++) {
    const mesh = new THREE.Mesh(sharedJointGeometry, sharedJointMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    robotGroup.add(mesh);
    meshPool.joints.push(mesh);
  }
  
  // Create link cylinders (one per link between consecutive frames)
  for (let i = 0; i < dhTable.length; i++) {
    const mesh = new THREE.Mesh(sharedLinkGeometry, sharedLinkMaterial);
    mesh.visible = false;
    robotGroup.add(mesh);
    meshPool.links.push(mesh);
  }
  
  currentPoolSize = dhTable.length;
}

// --- Renders Robot in 3D (OPTIMIZED: updates transforms only, no allocations) ---
function renderRobotPose(time) {
  // Interpolated joint values
  const rawJoints = interpolateJointValues(time);
  
  // Convert angle values to radians if units are in degrees (or auto-detected degrees > PI)
  const isDeg = angularUnit === 'degrees' || rawJoints.some(v => Math.abs(v) > Math.PI + 0.1);
  const jointsRad = rawJoints.map((val, idx) => {
    const jointDef = dhTable[idx];
    if (jointDef && jointDef.type === 'R' && isDeg) {
      return val * Math.PI / 180;
    }
    return val;
  });

  
  // Interpolated base pose
  const basePose = (toggles.movingBase && baseTrajectory) ? interpolateBasePose(time) : null;
  
  // Solve forward kinematics (returns pooled frame objects — no allocations)
  const frames = computeForwardKinematics(getCompiledDH(), jointsRad, basePose);
  if (frames.length === 0) return;
  
  const numFrames = frames.length;
  
  // --- Update axes helpers ---
  for (let i = 0; i < meshPool.axes.length; i++) {
    if (i < numFrames && toggles.showFrames) {
      meshPool.axes[i].matrix.copy(frames[i].transform);
      meshPool.axes[i].visible = true;
    } else {
      meshPool.axes[i].visible = false;
    }
  }
  
  // --- Update label sprites ---
  for (let i = 0; i < meshPool.axes.length; i++) {
    const baseIdx = i * 3; // index into the flat labels array
    if (i < numFrames && toggles.showFrames && toggles.showLabels) {
      const frame = frames[i];
      // X label
      meshPool.labels[baseIdx].position.copy(frame.position).addScaledVector(frame.xAxis, 0.14);
      meshPool.labels[baseIdx].visible = true;
      // Y label
      meshPool.labels[baseIdx + 1].position.copy(frame.position).addScaledVector(frame.yAxis, 0.14);
      meshPool.labels[baseIdx + 1].visible = true;
      // Z label
      meshPool.labels[baseIdx + 2].position.copy(frame.position).addScaledVector(frame.zAxis, 0.14);
      meshPool.labels[baseIdx + 2].visible = true;
    } else {
      if (baseIdx < meshPool.labels.length) meshPool.labels[baseIdx].visible = false;
      if (baseIdx + 1 < meshPool.labels.length) meshPool.labels[baseIdx + 1].visible = false;
      if (baseIdx + 2 < meshPool.labels.length) meshPool.labels[baseIdx + 2].visible = false;
    }
  }
  
  // --- Update joint cylinders ---
  for (let i = 0; i < meshPool.joints.length; i++) {
    const frameIdx = i + 1; // joints correspond to frames 1..N
    if (frameIdx < numFrames && toggles.showJoints) {
      meshPool.joints[i].matrix.copy(frames[frameIdx].transform);
      meshPool.joints[i].visible = true;
    } else {
      meshPool.joints[i].visible = false;
    }
  }
  
  // --- Update link cylinders ---
  for (let i = 0; i < meshPool.links.length; i++) {
    const frameIdx = i + 1;
    if (frameIdx < numFrames && toggles.showLinks) {
      const start = frames[frameIdx - 1].position;
      const end = frames[frameIdx].position;
      const distance = start.distanceTo(end);
      
      if (distance > 0.005) {
        // Compute direction, orientation, and midpoint using pre-allocated scratch vectors
        _linkDir.subVectors(end, start).normalize();
        _linkUp.set(0, 1, 0);
        _linkQuat.setFromUnitVectors(_linkUp, _linkDir);
        _linkMid.addVectors(start, end).multiplyScalar(0.5);
        
        meshPool.links[i].position.copy(_linkMid);
        meshPool.links[i].quaternion.copy(_linkQuat);
        meshPool.links[i].scale.set(1, distance, 1); // scale unit-height cylinder to actual distance
        meshPool.links[i].visible = true;
      } else {
        meshPool.links[i].visible = false;
      }
    } else {
      meshPool.links[i].visible = false;
    }
  }
}

// --- Render target spheres (called only on data change, NOT per frame) ---
function renderTargets() {
  // Clear targets group
  while (targetsGroup.children.length > 0) {
    targetsGroup.remove(targetsGroup.children[0]);
  }
  
  if (!toggles.showTargets || !targets || targets.length === 0) return;
  
  const targetGeom = new THREE.SphereGeometry(0.04, 16, 16);
  const targetMat = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.45,
    shininess: 70,
    depthWrite: false
  });
  
  targets.forEach(target => {
    const mesh = new THREE.Mesh(targetGeom, targetMat);
    mesh.position.set(target.x, target.y, target.z);
    targetsGroup.add(mesh);
  });
}

// --- Play/Pause button state (module-level for access from animate + recording) ---
function updatePlayPauseButton() {
  if (playback.isPlaying) {
    domPlayIcon.classList.add('hidden');
    domPauseIcon.classList.remove('hidden');
  } else {
    domPlayIcon.classList.remove('hidden');
    domPauseIcon.classList.add('hidden');
  }
}

// --- UI Binding & Controls ---
function initUI() {
  // Cache DOM element references (avoids getElementById lookups each frame)
  domTimeScrubber = document.getElementById('timeline-scrubber');
  domTimeCurrent = document.getElementById('time-current');
  domTimeTotal = document.getElementById('time-total');
  domRecordPercent = document.getElementById('record-percent');
  domPlayIcon = document.getElementById('play-icon');
  domPauseIcon = document.getElementById('pause-icon');
  
  buildDHTableUI();
  
  // Set up event listeners for inputs and tables
  document.getElementById('angular-unit').addEventListener('change', (e) => {
    const prevUnit = angularUnit;
    angularUnit = e.target.value;
    
    // Convert DH parameters on unit change to avoid resetting table values
    dhTable.forEach(joint => {
      if (joint.type === 'R') {
        if (prevUnit === 'degrees' && angularUnit === 'radians') {
          joint.theta = joint.theta * Math.PI / 180;
          joint.alpha = joint.alpha * Math.PI / 180;
        } else if (prevUnit === 'radians' && angularUnit === 'degrees') {
          joint.theta = joint.theta * 180 / Math.PI;
          joint.alpha = joint.alpha * 180 / Math.PI;
        }
      } else {
        // Only alpha is angular for prismatic joints
        if (prevUnit === 'degrees' && angularUnit === 'radians') {
          joint.alpha = joint.alpha * Math.PI / 180;
        } else if (prevUnit === 'radians' && angularUnit === 'degrees') {
          joint.alpha = joint.alpha * 180 / Math.PI;
        }
      }
    });
    
    buildDHTableUI();
    recalculateEverything();
  });
  
  document.getElementById('reset-dh').addEventListener('click', () => {
    dhTable = JSON.parse(JSON.stringify(DEFAULT_UR5_DH));
    // Default angles are formatted as degrees. Adjust if UI is currently in radians.
    if (angularUnit === 'radians') {
      dhTable.forEach(joint => {
        joint.theta = joint.theta * Math.PI / 180;
        joint.alpha = joint.alpha * Math.PI / 180;
      });
    }
    buildDHTableUI();
    recalculateEverything();
  });

  const presetFr3Btn = document.getElementById('preset-fr3');

  if (presetFr3Btn) {
    presetFr3Btn.addEventListener('click', () => {
      angularUnit = 'degrees';
      const unitSelect = document.getElementById('angular-unit');
      if (unitSelect) unitSelect.value = 'degrees';

      dhTable = JSON.parse(JSON.stringify(DEFAULT_FR3_DH));
      buildDHTableUI();


      // Auto-load valid FR3 default joint trajectory if available
      if (window.DEFAULT_FR3_JOINT_TRAJECTORY_CSV) {
        jointTrajectory = parseJointCSV(window.DEFAULT_FR3_JOINT_TRAJECTORY_CSV);
        if (jointTrajectory && jointTrajectory.timeSteps.length > 0) {
          playback.maxTime = jointTrajectory.timeSteps[jointTrajectory.timeSteps.length - 1];
        }
        playback.currentTime = 0;
        const statusSpan = document.getElementById('joint-csv-status');
        if (statusSpan) {
          statusSpan.innerText = 'FR3 Default';
          statusSpan.className = 'status-indicator default';
        }
        const nameSpan = document.getElementById('joint-csv-name');
        if (nameSpan) {
          nameSpan.innerText = 'fr3_default_trajectory.csv';
        }
      }

      // Auto-check Franka Hand TCP offset checkbox
      const tcpOffsetCb = document.getElementById('export-apply-tcp-offset');
      if (tcpOffsetCb) tcpOffsetCb.checked = true;

      recalculateEverything();
    });
  }

  // Export Endpoint CSV
  const btnExportCSV = document.getElementById('btn-export-endpoint-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      exportEndpointCSV();
    });
  }

  
  document.getElementById('add-joint').addEventListener('click', () => {
    dhTable.push({
      type: 'R',
      d: 0.1,
      theta: 0,
      a: 0.2,
      alpha: 0
    });
    buildDHTableUI();
    recalculateEverything();
  });
  
  document.getElementById('save-config').addEventListener('click', () => {
    localStorage.setItem('ur_fk_dh_config', JSON.stringify(dhTable));
    localStorage.setItem('ur_fk_angular_unit', angularUnit);
    alert('Configuration saved to local cache!');
  });
  
  document.getElementById('load-config').addEventListener('click', () => {
    const savedTable = localStorage.getItem('ur_fk_dh_config');
    const savedUnit = localStorage.getItem('ur_fk_angular_unit');
    if (savedTable && savedUnit) {
      angularUnit = savedUnit;
      document.getElementById('angular-unit').value = angularUnit;
      dhTable = JSON.parse(savedTable);
      buildDHTableUI();
      recalculateEverything();
    } else {
      alert('No custom config found in browser cache.');
    }
  });

  // Playback Control Triggers
  const playPauseBtn = document.getElementById('btn-play-pause');
  
  playPauseBtn.addEventListener('click', () => {
    if (playback.isPlaying) {
      playback.isPlaying = false;
    } else {
      // Loop reset if time was already at limit
      if (playback.currentTime >= playback.maxTime) {
        playback.currentTime = 0;
      }
      playback.isPlaying = true;
    }
    updatePlayPauseButton();
  });
  
  document.getElementById('btn-stop').addEventListener('click', () => {
    playback.isPlaying = false;
    playback.currentTime = 0;
    updatePlayPauseButton();
    updateTimelineUI();
  });
  
  document.getElementById('play-speed').addEventListener('change', (e) => {
    playback.speed = parseFloat(e.target.value);
  });
  
  document.getElementById('playback-loop').addEventListener('change', (e) => {
    playback.loop = e.target.checked;
  });
  
  domTimeScrubber.addEventListener('input', (e) => {
    playback.currentTime = (parseFloat(e.target.value) / 100) * playback.maxTime;
    domTimeCurrent.innerText = playback.currentTime.toFixed(2) + 's';
  });
  
  // Render toggle handlers
  document.getElementById('toggle-frames').addEventListener('change', (e) => { toggles.showFrames = e.target.checked; });
  document.getElementById('toggle-links').addEventListener('change', (e) => { toggles.showLinks = e.target.checked; });
  document.getElementById('toggle-joints').addEventListener('change', (e) => { toggles.showJoints = e.target.checked; });
  document.getElementById('toggle-labels').addEventListener('change', (e) => { toggles.showLabels = e.target.checked; });
  document.getElementById('toggle-ee-trace').addEventListener('change', (e) => {
    toggles.showEETrace = e.target.checked;
    updateTraceGeometries();
  });
  document.getElementById('toggle-base-trace').addEventListener('change', (e) => {
    toggles.showBaseTrace = e.target.checked;
    updateTraceGeometries();
  });
  
  document.getElementById('reset-camera').addEventListener('click', () => {
    // Focus camera back on coordinate center, fitting the workspace (Z-up)
    camera.position.set(2.0, -2.0, 1.5);
    controls.target.set(0, 0, 0.2);
  });
  
  // Toggle sections
  const baseMotionToggle = document.getElementById('base-motion-toggle');
  baseMotionToggle.addEventListener('change', (e) => {
    toggles.movingBase = e.target.checked;
    const controlsDiv = document.getElementById('base-motion-controls');
    if (toggles.movingBase) {
      controlsDiv.classList.remove('hidden');
    } else {
      controlsDiv.classList.add('hidden');
    }
    recalculateEverything();
  });
  
  const targetsToggle = document.getElementById('targets-toggle');
  targetsToggle.addEventListener('change', (e) => {
    toggles.showTargets = e.target.checked;
    const controlsDiv = document.getElementById('targets-controls');
    if (toggles.showTargets) {
      controlsDiv.classList.remove('hidden');
    } else {
      controlsDiv.classList.add('hidden');
    }
    renderTargets();
  });
  
  // File Upload Handling
  setupCSVUpload('joint-csv-file', 'joint-csv-name', 'joint-csv-status', (text) => {
    jointTrajectory = parseJointCSV(text);
    if (jointTrajectory && jointTrajectory.timeSteps.length > 0) {
      playback.maxTime = jointTrajectory.timeSteps[jointTrajectory.timeSteps.length - 1];
    }
    playback.currentTime = 0;
    recalculateEverything();
  });
  
  setupCSVUpload('base-motion-file', 'base-motion-name', null, (text) => {
    baseTrajectory = parseBaseCSV(text, angularUnit);
    recalculateEverything();
  });
  
  setupCSVUpload('targets-file', 'targets-name', null, (text) => {
    targets = parseTargetsCSV(text);
    renderTargets();
  });
  
  // Recording
  document.getElementById('btn-record').addEventListener('click', () => {
    startRecording();
  });
  
  // Help Modal Handlers
  const helpModal = document.getElementById('help-modal');
  const btnHelp = document.getElementById('btn-help');
  const closeHelp = document.getElementById('close-help');
  
  if (btnHelp && helpModal && closeHelp) {
    btnHelp.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
    
    closeHelp.addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });
    
    // Close modal if user clicks outside the modal content
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.classList.add('hidden');
      }
    });
  }
}

function setupCSVUpload(inputId, nameId, statusId, callback) {
  const fileInput = document.getElementById(inputId);
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById(nameId).innerText = file.name;
    if (statusId) {
      const statusSpan = document.getElementById(statusId);
      statusSpan.innerText = 'Loaded';
      statusSpan.className = 'status-indicator uploaded';
    }
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        callback(evt.target.result);
      } catch (err) {
        alert('Error parsing CSV file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

// --- Updates Playback Interface (uses cached DOM refs) ---
function updateTimelineUI() {
  const pct = (playback.currentTime / playback.maxTime) * 100;
  domTimeScrubber.value = pct;
  domTimeCurrent.innerText = playback.currentTime.toFixed(2) + 's';
  domTimeTotal.innerText = playback.maxTime.toFixed(2) + 's';
}

// --- Build DH Editor Table ---
function buildDHTableUI() {
  const tableBody = document.getElementById('dh-table-body');
  tableBody.innerHTML = '';
  
  dhTable.forEach((joint, idx) => {
    const row = document.createElement('tr');
    
    // Index column
    const tdIndex = document.createElement('td');
    tdIndex.innerText = idx + 1;
    row.appendChild(tdIndex);
    
    // Type column
    const tdType = document.createElement('td');
    const selectType = document.createElement('select');
    selectType.className = 'cell-select';
    selectType.innerHTML = `
      <option value="R" ${joint.type === 'R' ? 'selected' : ''}>R</option>
      <option value="P" ${joint.type === 'P' ? 'selected' : ''}>P</option>
    `;
    selectType.addEventListener('change', (e) => {
      joint.type = e.target.value;
      recalculateEverything();
    });
    tdType.appendChild(selectType);
    row.appendChild(tdType);
    
    // d column
    const tdd = document.createElement('td');
    const inputd = document.createElement('input');
    inputd.type = 'number';
    inputd.step = '0.01';
    inputd.className = 'cell-input';
    inputd.value = joint.d;
    inputd.addEventListener('input', (e) => {
      joint.d = parseFloat(e.target.value) || 0;
      recalculateEverything();
    });
    tdd.appendChild(inputd);
    row.appendChild(tdd);
    
    // theta column
    const tdTheta = document.createElement('td');
    const inputTheta = document.createElement('input');
    inputTheta.type = 'number';
    inputTheta.step = '1';
    inputTheta.className = 'cell-input';
    inputTheta.value = joint.theta.toFixed(2);
    inputTheta.addEventListener('input', (e) => {
      joint.theta = parseFloat(e.target.value) || 0;
      recalculateEverything();
    });
    tdTheta.appendChild(inputTheta);
    row.appendChild(tdTheta);
    
    // a column
    const tda = document.createElement('td');
    const inputa = document.createElement('input');
    inputa.type = 'number';
    inputa.step = '0.01';
    inputa.className = 'cell-input';
    inputa.value = joint.a;
    inputa.addEventListener('input', (e) => {
      joint.a = parseFloat(e.target.value) || 0;
      recalculateEverything();
    });
    tda.appendChild(inputa);
    row.appendChild(tda);
    
    // alpha column
    const tdAlpha = document.createElement('td');
    const inputAlpha = document.createElement('input');
    inputAlpha.type = 'number';
    inputAlpha.step = '1';
    inputAlpha.className = 'cell-input';
    inputAlpha.value = joint.alpha.toFixed(2);
    inputAlpha.addEventListener('input', (e) => {
      joint.alpha = parseFloat(e.target.value) || 0;
      recalculateEverything();
    });
    tdAlpha.appendChild(inputAlpha);
    row.appendChild(tdAlpha);
    
    // Delete column
    const tdDelete = document.createElement('td');
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-danger-sm';
    btnDelete.innerHTML = '&times;';
    btnDelete.title = 'Remove Joint';
    btnDelete.addEventListener('click', () => {
      dhTable.splice(idx, 1);
      buildDHTableUI();
      recalculateEverything();
    });
    tdDelete.appendChild(btnDelete);
    row.appendChild(tdDelete);
    
    tableBody.appendChild(row);
  });
}

// --- Video Recording Handlers ---
function startRecording() {
  if (recorder.isRecording) return;
  
  // Setup interface
  document.getElementById('recording-overlay').classList.remove('hidden');
  document.getElementById('btn-record').classList.add('hidden');
  
  // Pause simulation, go to start
  playback.isPlaying = false;
  playback.currentTime = 0;
  updateTimelineUI();
  
  // Wait a small moment to render t=0
  setTimeout(() => {
    recorder.start(30); // Capture at 30 fps
    playback.isPlaying = true;
    playback.speed = 1.0; // Force 1x speed during recording for smoothness
    document.getElementById('play-speed').value = '1';
    updatePlayPauseButton();
  }, 200);
}

function stopRecording() {
  playback.isPlaying = false;
  updatePlayPauseButton();
  
  recorder.stop();
  
  document.getElementById('recording-overlay').classList.add('hidden');
  document.getElementById('btn-record').classList.remove('hidden');
}

// --- CSV Export Handler ---
function exportEndpointCSV() {
  if (!jointTrajectory || !jointTrajectory.timeSteps || jointTrajectory.timeSteps.length === 0) {
    alert("No joint trajectory loaded to export.");
    return;
  }

  const distUnitSelect = document.getElementById("export-distance-unit");
  const timeUnitSelect = document.getElementById("export-time-unit");
  const includeOriCheckbox = document.getElementById("export-include-orientation");

  const distUnit = distUnitSelect ? distUnitSelect.value : "m";
  const timeUnit = timeUnitSelect ? timeUnitSelect.value : "s";
  const includeOri = includeOriCheckbox ? includeOriCheckbox.checked : true;

  let distScale = 1.0;
  if (distUnit === "mm") distScale = 1000.0;
  else if (distUnit === "cm") distScale = 100.0;

  let timeScale = 1.0;
  if (timeUnit === "ms") timeScale = 1000.0;

  const compiledDH = getCompiledDH();
  const { timeSteps, trajectories } = jointTrajectory;
  const header = includeOri ? "time,x,y,z,orientation_1,orientation_2,orientation_3" : "time,x,y,z";
  const csvLines = [header];

  const _scratchMat = new THREE.Matrix4();
  const _scratchQuat = new THREE.Quaternion();

  for (let i = 0; i < timeSteps.length; i++) {
    const rawTime = timeSteps[i];
    const rawJoints = trajectories[i];

    // Scale angles to radians if using degrees or if raw values are in degrees
    const isDeg = angularUnit === 'degrees' || rawJoints.some(v => Math.abs(v) > Math.PI + 0.1);
    const jointsRad = rawJoints.map((val, idx) => {
      const jointDef = dhTable[idx];
      if (jointDef && jointDef.type === 'R' && isDeg) {
        return (val * Math.PI) / 180;
      }
      return val;
    });


    const basePose = (toggles.movingBase && baseTrajectory) ? interpolateBasePose(rawTime) : null;
    const frames = computeForwardKinematics(compiledDH, jointsRad, basePose);

    if (frames.length > 0) {
      const eeFrame = frames[frames.length - 1];
      const eePos = eeFrame.position;
      const tOut = (rawTime * timeScale).toFixed(6);
      const xOut = (eePos.x * distScale).toFixed(6);
      const yOut = (eePos.y * distScale).toFixed(6);
      const zOut = (eePos.z * distScale).toFixed(6);

      if (includeOri) {
        // Extract 3D Axis-Angle vector (rotvec in radians) from frame transform
        _scratchMat.extractRotation(eeFrame.transform);
        _scratchQuat.setFromRotationMatrix(_scratchMat);

        let w = Math.max(-1, Math.min(1, _scratchQuat.w));
        let angle = 2 * Math.acos(w);
        let sinHalfAngle = Math.sqrt(1 - w * w);

        let a1 = 0, a2 = 0, a3 = 0;
        if (sinHalfAngle > 1e-6) {
          a1 = (_scratchQuat.x / sinHalfAngle) * angle;
          a2 = (_scratchQuat.y / sinHalfAngle) * angle;
          a3 = (_scratchQuat.z / sinHalfAngle) * angle;
        }

        csvLines.push(`${tOut},${xOut},${yOut},${zOut},${a1.toFixed(6)},${a2.toFixed(6)},${a3.toFixed(6)}`);
      } else {
        csvLines.push(`${tOut},${xOut},${yOut},${zOut}`);
      }
    }
  }

  const csvString = csvLines.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `endpoint_trajectory_${distUnit}_${timeUnit}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Run Application ---
init();
