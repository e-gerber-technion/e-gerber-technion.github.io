// Default UR5 robot DH parameters (Standard DH convention)
// Type: 'R' (Revolute) or 'P' (Prismatic)
// Angular parameters (theta, alpha) are stored here in Degrees for readability and will be converted to Radians internally.
window.DEFAULT_UR5_DH = [
  { type: 'R', d: 0.089159, theta: 0, a: 0,        alpha: 90 },
  { type: 'R', d: 0,        theta: 0, a: -0.425,   alpha: 0 },
  { type: 'R', d: 0,        theta: 0, a: -0.39225, alpha: 0 },
  { type: 'R', d: 0.10915,  theta: 0, a: 0,        alpha: 90 },
  { type: 'R', d: 0.09465,  theta: 0, a: 0,        alpha: -90 },
  { type: 'R', d: 0.0823,   theta: 0, a: 0,        alpha: 0 }
];

// Default Franka Research 3 (FR3) robot DH parameters (Modified DH convention)
window.DEFAULT_FR3_DH = [
  { type: 'R', d: 0.333, theta: 0, a: 0,       alpha: 0,     convention: 'modified' },
  { type: 'R', d: 0,     theta: 0, a: 0,       alpha: -90,   convention: 'modified' },
  { type: 'R', d: 0.316, theta: 0, a: 0,       alpha: 90,    convention: 'modified' },
  { type: 'R', d: 0,     theta: 0, a: 0.0825,  alpha: 90,    convention: 'modified' },
  { type: 'R', d: 0.384, theta: 0, a: -0.0825, alpha: -90,   convention: 'modified' },
  { type: 'R', d: 0,     theta: 0, a: 0,       alpha: 90,    convention: 'modified' },
  { type: 'R', d: 0,     theta: 0, a: 0.088,   alpha: 90,    convention: 'modified' },
  { type: 'R', d: 0.107, theta: 0, a: 0,       alpha: 0,     convention: 'modified' }
];


// Loopable FR3 joint trajectory CSV (10 seconds, steps of 0.5s)
// All joint values respect FR3 physical joint limits:
// J1: [-166°, 166°], J2: [-105°, 105°], J3: [-166°, 166°]
// J4: [-176°, -6.7°] (strictly negative!), J5: [-164°, 164°]
// J6: [25.2°, 264.8°] (strictly positive!), J7: [-174°, 174°]
window.DEFAULT_FR3_JOINT_TRAJECTORY_CSV = `time,joint1,joint2,joint3,joint4,joint5,joint6,joint7
0.0,0.0,-45.0,0.0,-135.0,0.0,90.0,0.0
0.5,10.0,-40.0,5.0,-130.0,8.0,95.0,10.0
1.0,22.0,-35.0,12.0,-122.0,15.0,105.0,22.0
1.5,35.0,-28.0,20.0,-112.0,22.0,118.0,35.0
2.0,48.0,-22.0,28.0,-102.0,28.0,130.0,48.0
2.5,60.0,-18.0,35.0,-95.0,32.0,140.0,60.0
3.0,72.0,-15.0,40.0,-90.0,35.0,148.0,72.0
3.5,82.0,-18.0,35.0,-95.0,30.0,145.0,82.0
4.0,90.0,-25.0,25.0,-105.0,20.0,135.0,90.0
4.5,95.0,-32.0,12.0,-118.0,10.0,120.0,75.0
5.0,90.0,-40.0,0.0,-130.0,0.0,105.0,60.0
5.5,80.0,-48.0,-12.0,-140.0,-10.0,90.0,45.0
6.0,65.0,-55.0,-25.0,-148.0,-20.0,78.0,30.0
6.5,48.0,-60.0,-35.0,-152.0,-28.0,68.0,15.0
7.0,32.0,-62.0,-40.0,-155.0,-32.0,62.0,0.0
7.5,18.0,-58.0,-35.0,-150.0,-28.0,68.0,-15.0
8.0,8.0,-52.0,-25.0,-142.0,-20.0,76.0,-30.0
8.5,2.0,-48.0,-12.0,-138.0,-10.0,84.0,-45.0
9.0,0.0,-45.0,-5.0,-135.0,-5.0,88.0,-30.0
9.5,0.0,-45.0,-2.0,-135.0,-2.0,89.0,-15.0
10.0,0.0,-45.0,0.0,-135.0,0.0,90.0,0.0`;



// Loopable joint trajectory CSV (10 seconds, steps of 0.5s)
// Column values for revolute joints are in DEGREES.
window.DEFAULT_JOINT_TRAJECTORY_CSV = `time,joint1,joint2,joint3,joint4,joint5,joint6
0.0,0.0,0.0,0.0,0.0,0.0,0.0
0.5,10.0,-5.0,8.0,5.0,-10.0,15.0
1.0,22.0,-12.0,17.0,10.0,-20.0,30.0
1.5,35.0,-22.0,28.0,15.0,-30.0,45.0
2.0,48.0,-35.0,42.0,20.0,-40.0,60.0
2.5,60.0,-45.0,55.0,22.0,-45.0,75.0
3.0,72.0,-55.0,68.0,20.0,-42.0,90.0
3.5,82.0,-62.0,78.0,15.0,-35.0,95.0
4.0,90.0,-68.0,85.0,10.0,-25.0,90.0
4.5,95.0,-70.0,88.0,5.0,-12.0,75.0
5.0,90.0,-68.0,85.0,0.0,0.0,60.0
5.5,80.0,-60.0,78.0,-5.0,12.0,45.0
6.0,65.0,-48.0,65.0,-10.0,25.0,30.0
6.5,48.0,-35.0,50.0,-15.0,35.0,15.0
7.0,32.0,-22.0,35.0,-20.0,42.0,0.0
7.5,18.0,-12.0,20.0,-22.0,45.0,-15.0
8.0,8.0,-5.0,10.0,-20.0,40.0,-30.0
8.5,2.0,-2.0,3.0,-15.0,30.0,-45.0
9.0,0.0,0.0,0.0,-10.0,20.0,-30.0
9.5,0.0,0.0,0.0,-5.0,10.0,-15.0
10.0,0.0,0.0,0.0,0.0,0.0,0.0`;

// Loopable base motion CSV (10 seconds, steps of 1.0s)
// x, y, z are in meters; rx, ry, rz are in DEGREES.
window.DEFAULT_BASE_MOTION_CSV = `time,x,y,z,rx,ry,rz
0.0,0.0,0.0,0.0,0.0,0.0,0.0
1.0,0.02,0.01,0.03,2.0,0.0,5.0
2.0,0.05,0.02,0.08,4.0,1.0,12.0
3.0,0.08,0.02,0.12,3.0,2.0,20.0
4.0,0.09,0.01,0.17,1.0,1.0,25.0
5.0,0.10,0.00,0.20,0.0,0.0,30.0
6.0,0.09,-0.01,0.17,-1.0,-1.0,25.0
7.0,0.08,-0.02,0.12,-3.0,-2.0,20.0
8.0,0.05,-0.02,0.08,-4.0,-1.0,12.0
9.0,0.02,-0.01,0.03,-2.0,0.0,5.0
10.0,0.0,0.0,0.0,0.0,0.0,0.0`;

// Default stationary targets around the UR5 workspace
// Columns: x, y, z
window.DEFAULT_TARGETS_CSV = `x,y,z
0.4,0.4,0.3
-0.3,0.5,0.25
0.0,-0.55,0.45
0.5,-0.3,0.15`;
