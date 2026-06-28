/**
 * Parses raw CSV text into a structured array of rows.
 * Handles quoted fields, comma separators, and carriage returns.
 */
function parseRawCSV(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    // Split line by comma, respecting quotes
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());
    rows.push(fields);
  }
  return rows;
}

/**
 * Parses joint trajectory CSV.
 * Columns can be: time, joint1, joint2... or time, q1, q2... or columns after time represent joints sequentially.
 */
window.parseJointCSV = function(text) {
  const rows = parseRawCSV(text);
  if (rows.length < 2) return null; // Need header + at least one data row
  
  const headers = rows[0].map(h => h.toLowerCase());
  const timeIdx = headers.indexOf('time');
  
  if (timeIdx === -1) {
    throw new Error('Joint CSV must contain a "time" column.');
  }

  // Find joint columns: columns containing "joint", "q", or any non-time column if headers are simple
  const jointColIndices = [];
  for (let i = 0; i < headers.length; i++) {
    if (i === timeIdx) continue;
    if (headers[i].includes('joint') || headers[i].includes('q') || !isNaN(headers[i]) || headers.length > 1) {
      jointColIndices.push(i);
    }
  }

  // Sort indices to ensure joint1, joint2 order matches column appearance
  // Or, if headers have explicit numbers (e.g. joint3, joint1), sort by joint number
  const namedJoints = jointColIndices.map(idx => {
    const name = headers[idx];
    const numMatch = name.match(/\d+/);
    const orderNum = numMatch ? parseInt(numMatch[0], 10) : idx;
    return { idx, orderNum };
  });
  namedJoints.sort((a, b) => a.orderNum - b.orderNum);
  const sortedJointIndices = namedJoints.map(nj => nj.idx);

  const timeSteps = [];
  const trajectories = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue; // Skip malformed rows
    
    const t = parseFloat(row[timeIdx]);
    if (isNaN(t)) continue;
    
    const jointVals = sortedJointIndices.map(idx => {
      const val = parseFloat(row[idx]);
      return isNaN(val) ? 0 : val;
    });
    
    timeSteps.push(t);
    trajectories.push(jointVals);
  }

  // Sort by time just in case the CSV rows are out of order
  const combined = timeSteps.map((t, idx) => ({ t, vals: trajectories[idx] }));
  combined.sort((a, b) => a.t - b.t);

  return {
    timeSteps: combined.map(c => c.t),
    trajectories: combined.map(c => c.vals)
  };
}

/**
 * Parses base motion CSV.
 * Columns: time, x, y, z, rx, ry, rz
 */
window.parseBaseCSV = function(text, angularUnit = 'degrees') {
  const rows = parseRawCSV(text);
  if (rows.length < 2) return null;
  
  const headers = rows[0].map(h => h.toLowerCase());
  const timeIdx = headers.indexOf('time');
  const xIdx = headers.indexOf('x');
  const yIdx = headers.indexOf('y');
  const zIdx = headers.indexOf('z');
  const rxIdx = headers.indexOf('rx');
  const ryIdx = headers.indexOf('ry');
  const rzIdx = headers.indexOf('rz');
  
  if (timeIdx === -1 || xIdx === -1 || yIdx === -1 || zIdx === -1 || rxIdx === -1 || ryIdx === -1 || rzIdx === -1) {
    throw new Error('Base CSV must contain columns: "time", "x", "y", "z", "rx", "ry", "rz".');
  }

  const basePoses = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;
    
    const t = parseFloat(row[timeIdx]);
    const x = parseFloat(row[xIdx]);
    const y = parseFloat(row[yIdx]);
    const z = parseFloat(row[zIdx]);
    let rx = parseFloat(row[rxIdx]);
    let ry = parseFloat(row[ryIdx]);
    let rz = parseFloat(row[rzIdx]);
    
    if (isNaN(t) || isNaN(x) || isNaN(y) || isNaN(z) || isNaN(rx) || isNaN(ry) || isNaN(rz)) {
      continue;
    }
    
    // Convert euler rotation to radians if in degrees
    if (angularUnit === 'degrees') {
      const toRad = Math.PI / 180;
      rx *= toRad;
      ry *= toRad;
      rz *= toRad;
    }
    
    basePoses.push({ t, x, y, z, rx, ry, rz });
  }

  // Sort by time
  basePoses.sort((a, b) => a.t - b.t);
  return basePoses;
}

/**
 * Parses stationary targets CSV.
 * Columns: x, y, z (no header is strictly required, but if present we skip it)
 */
window.parseTargetsCSV = function(text) {
  const rows = parseRawCSV(text);
  if (rows.length === 0) return [];
  
  let startIdx = 0;
  const firstRow = rows[0];
  
  // Detect if there is a header
  const isHeader = firstRow.some(val => isNaN(parseFloat(val)));
  if (isHeader) {
    startIdx = 1;
  }
  
  const targets = [];
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const x = parseFloat(row[0]);
    const y = parseFloat(row[1]);
    const z = parseFloat(row[2]);
    
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      targets.push({ x, y, z });
    }
  }
  
  return targets;
}
