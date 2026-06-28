// --- Global Bindings ---
const {
  computeForwardKinematics,
  parseJointCSV,
  parseBaseCSV,
  parseTargetsCSV,
  CanvasRecorder,
  DEFAULT_UR5_DH,
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

// --- Initialization ---
function init() {
  initThree();
  loadEmbeddedDefaults();
  initUI();
  
  // First render
  recalculateEverything();
  
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
    
    // Update animation poses in the 3D scene
    renderRobotPose(playback.currentTime);
    
    // Update recording overlay if recording
    if (recorder && recorder.isRecording) {
      const pct = Math.min(100, Math.floor((playback.currentTime / playback.maxTime) * 100));
      document.getElementById('record-percent').innerText = pct;
    }
    
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
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

// --- Recalculate Trajectories & Traces ---
function recalculateEverything() {
  // Pre-calculate visual traces
  eeTracePoints = [];
  baseTracePoints = [];
  
  if (!jointTrajectory) return;
  
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
    
    // Process math
    const frames = computeForwardKinematics(compileDHTableRad(), jointsRad, basePose);
    if (frames.length > 0) {
      baseTracePoints.push(frames[0].position.clone());
      eeTracePoints.push(frames[frames.length - 1].position.clone());
    }
  }
  
  // Update line geometries
  updateTraceGeometries();
}

/**
 * Returns a compiled DH table where all angle parameters are in Radians.
 */
function compileDHTableRad() {
  return dhTable.map(joint => {
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
      alpha: alpha
    };
  });
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

// --- Helper to Create Text Sprites for Axes Labels ---
function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = 'bold 20px "Space Grotesk", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 16);
  
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.08, 0.04, 1);
  return sprite;
}

// --- Renders Robot in 3D ---
function renderRobotPose(time) {
  // Clear previous mesh drawings
  while (robotGroup.children.length > 0) {
    const obj = robotGroup.children[0];
    robotGroup.remove(obj);
  }
  
  // Interpolated joint values
  const rawJoints = interpolateJointValues(time);
  
  // Convert angle values to radians if units are in degrees
  const jointsRad = rawJoints.map((val, idx) => {
    const jointDef = dhTable[idx];
    if (jointDef && jointDef.type === 'R' && angularUnit === 'degrees') {
      return val * Math.PI / 180;
    }
    return val;
  });
  
  // Interpolated base pose
  const basePose = (toggles.movingBase && baseTrajectory) ? interpolateBasePose(time) : null;
  
  // Solve forward kinematics
  const frames = computeForwardKinematics(compileDHTableRad(), jointsRad, basePose);
  if (frames.length === 0) return;
  
  // Draw Coordinate frames (DH axes)
  if (toggles.showFrames) {
    frames.forEach((frame, idx) => {
      // Use standard THREE.AxesHelper
      const axesHelper = new THREE.AxesHelper(0.12);
      axesHelper.matrixAutoUpdate = false;
      axesHelper.matrix.copy(frame.transform);
      robotGroup.add(axesHelper);
      
      // Draw labels if enabled
      if (toggles.showLabels) {
        const sx = createTextSprite('X' + idx, '#ff4d4d');
        sx.position.copy(frame.position).addScaledVector(frame.xAxis, 0.14);
        robotGroup.add(sx);
        
        const sy = createTextSprite('Y' + idx, '#4dff4d');
        sy.position.copy(frame.position).addScaledVector(frame.yAxis, 0.14);
        robotGroup.add(sy);
        
        const sz = createTextSprite('Z' + idx, '#4d4dff');
        sz.position.copy(frame.position).addScaledVector(frame.zAxis, 0.14);
        robotGroup.add(sz);
      }
    });
  }
  
  // Materials
  const linkMaterial = new THREE.MeshPhongMaterial({ color: 0x4f6c8f, shininess: 30 });
  const jointMaterial = new THREE.MeshPhongMaterial({ color: 0xa085de, shininess: 50 });

  // Draw links & joint cylinders
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    // Draw joint cylinder
    if (toggles.showJoints && i > 0 && i <= dhTable.length) {
      // Joint revolves or translates along the Z axis of the CURRENT frame
      const jointRadius = 0.024;
      const jointHeight = 0.06;
      
      const jointGeom = new THREE.CylinderGeometry(jointRadius, jointRadius, jointHeight, 16);
      // Align cylinder axis along local Z-axis (default is local Y-axis in Three.js)
      jointGeom.rotateX(Math.PI / 2);
      
      const jointMesh = new THREE.Mesh(jointGeom, jointMaterial);
      jointMesh.matrixAutoUpdate = false;
      jointMesh.matrix.copy(frame.transform);
      robotGroup.add(jointMesh);
    }
    
    // Draw links between subsequent origins
    if (toggles.showLinks && i > 0) {
      const prevFrame = frames[i - 1];
      const start = prevFrame.position;
      const end = frame.position;
      const distance = start.distanceTo(end);
      
      if (distance > 0.005) {
        // Link cylinder connecting start to end
        const linkRadius = 0.012;
        const linkGeom = new THREE.CylinderGeometry(linkRadius, linkRadius, distance, 8);
        
        // Compute rotation to align link along the connection vector
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        
        const linkMesh = new THREE.Mesh(linkGeom, linkMaterial);
        linkMesh.position.copy(midpoint);
        linkMesh.quaternion.copy(quaternion);
        robotGroup.add(linkMesh);
      }
    }
  }
  
  // Render targets if toggled
  renderTargets();
}

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

// --- UI Binding & Controls ---
function initUI() {
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
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  
  function updatePlayPauseButton() {
    if (playback.isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  }

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
  
  const timelineScrubber = document.getElementById('timeline-scrubber');
  timelineScrubber.addEventListener('input', (e) => {
    playback.currentTime = (parseFloat(e.target.value) / 100) * playback.maxTime;
    document.getElementById('time-current').innerText = playback.currentTime.toFixed(2) + 's';
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

// --- Updates Playback Interface ---
function updateTimelineUI() {
  const pct = (playback.currentTime / playback.maxTime) * 100;
  document.getElementById('timeline-scrubber').value = pct;
  document.getElementById('time-current').innerText = playback.currentTime.toFixed(2) + 's';
  document.getElementById('time-total').innerText = playback.maxTime.toFixed(2) + 's';
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

// --- Run Application ---
init();
