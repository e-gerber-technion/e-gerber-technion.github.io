# Project Specifications

> **Project Name:** Robotic Arm Visualizer
> **Date:** 2026-05-17
> **Status:** `Draft` <!-- Draft | In Progress | Done -->
> **Author(s):** _________________

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Requirements](#3-requirements)
4. [Design & Architecture](#4-design--architecture)
5. [Data & Storage](#5-data--storage)
6. [Testing & Demo Scenarios](#6-testing--demo-scenarios)
7. [Dependencies](#7-dependencies)
8. [Open Questions](#8-open-questions)

---

## 1. Overview

A browser-based, locally-run interactive visualizer for a configurable robotic arm. The arm is rendered in a "stick-figure" style (line segments connected at joints). The user first configures the arm — selecting the number, type (rotary or prismatic), and order of joints, plus the resting segment length for each — and then controls each joint live via sliders. The visualizer computes forward kinematics in real time and updates the drawing accordingly.

The codebase is structured to make it straightforward to add **trajectory playback** (pre-programmed sequences of joint values over time) as a future feature, without requiring a redesign.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- [x] Stick-figure 2D rendering of a serial robotic arm (base → endpoint)
- [x] Support **rotary joints** (rotate the outgoing segment by an angle θ)
- [x] Support **prismatic (linear) joints** (extend/contract the segment by a displacement d)
- [x] User-configurable arm: number of joints, joint type, segment length, joint limits
- [x] Live slider control — one slider per joint, updates rendering in real time
- [x] Display the endpoint (end-effector) position clearly
- [x] Clean configuration UI → visualizer UI flow
- [x] Groundwork in data model and module structure for trajectory playback (future)

### 2.2 Non-Goals

- No network connections or server — runs fully from a local file in a browser
- No inverse kinematics (user sets joint values directly)
- No 3D rendering (2D only for this version)
- No trajectory playback UI or execution engine (data model stub only)
- No collision detection or physical simulation

---

## 3. Requirements

| ID    | Priority       | Description                                                                                   | Notes                                         |
|-------|----------------|-----------------------------------------------------------------------------------------------|-----------------------------------------------|
| R-001 | `Must have`    | User can set the number of joints (1–N) before launching the visualizer                       | Suggest max of ~8 for legibility              |
| R-002 | `Must have`    | Each joint is individually typed as **rotary** or **prismatic**                               |                                               |
| R-003 | `Must have`    | Each segment has a configurable resting/base length                                           | For prismatic joints: length at d = 0         |
| R-004 | `Must have`    | Each joint has configurable min/max value limits                                              | Degrees for rotary; units for prismatic       |
| R-005 | `Must have`    | One slider per joint; moving a slider updates the arm rendering in real time                  |                                               |
| R-006 | `Must have`    | Forward kinematics computed from joint values → segment positions → endpoint                  |                                               |
| R-007 | `Must have`    | Stick-figure rendering: line segments for links, circles/dots at joints, marker at endpoint   |                                               |
| R-008 | `Must have`    | Arm is anchored at a fixed base point on screen                                               |                                               |
| R-009 | `Should have`  | Display current joint value alongside each slider (numeric readout)                           |                                               |
| R-010 | `Should have`  | Display endpoint (x, y) coordinates on screen                                                 |                                               |
| R-011 | `Should have`  | Visual distinction between rotary joints and prismatic joints in the rendering                | e.g. different marker shapes                  |
| R-012 | `Should have`  | "Reset" button to return all joints to their default/zero position                            |                                               |
| R-013 | `Nice to have` | Auto-scale / pan so the arm always fits within the canvas                                     |                                               |
| R-014 | `Nice to have` | Configuration can be saved/loaded as a JSON string (copy-paste, no file I/O required)         |                                               |
| R-015 | `Nice to have` | Trajectory data field present in joint model (stub, not yet used in UI)                       | Groundwork for future feature                 |

---

## 4. Design & Architecture

### 4.1 Component Overview

```
┌──────────────────────────────────────────────────────┐
│                   index.html                         │
│  ┌─────────────────┐      ┌────────────────────────┐ │
│  │  Config Panel   │─────▶│    Arm State (model)   │ │
│  │ (joint setup)   │      │  joints[], armConfig   │ │
│  └─────────────────┘      └───────────┬────────────┘ │
│  ┌─────────────────┐                  │              │
│  │  Control Panel  │──(slider input)──┤              │
│  │  (sliders)      │                  │              │
│  └─────────────────┘                  ▼              │
│                          ┌────────────────────────┐  │
│                          │   Forward Kinematics   │  │
│                          │   (fk.js / inline)     │  │
│                          └───────────┬────────────┘  │
│                                      ▼               │
│                          ┌────────────────────────┐  │
│                          │   Renderer (canvas)    │  │
│                          │   draw segments, joints│  │
│                          │   endpoint marker      │  │
│                          └────────────────────────┘  │
│                                                      │
│   [Trajectory module stub — not active in v1]        │
└──────────────────────────────────────────────────────┘
```

### 4.2 UI Flow

1. **Configuration screen** — user sets number of joints; for each joint: type, base length, min/max limits.
2. User clicks **"Launch Visualizer"** → transitions to visualizer screen.
3. **Visualizer screen** — canvas showing the arm + a side panel with one slider per joint.
4. Sliders update joint values live; canvas redraws on every input event.

### 4.3 Forward Kinematics

The arm is a serial chain anchored at the **bottom-center of the canvas**. The arm starts pointing straight up. Joint angles are **relative** — each rotary joint's angle is measured from the direction of the incoming segment.

> ⚠️ Canvas Y-axis is inverted (Y increases downward). The FK math corrects for this so that positive angles rotate counter-clockwise as expected visually.

For each joint `i` with cumulative angle `α` (initialized to −90° = straight up):
- **Rotary joint:** `α += θᵢ` (degrees, relative to incoming direction)
- **Prismatic joint:** segment length `= baseLength + dᵢ` (pixels); `α` unchanged

Endpoint of segment `i`:
```
xᵢ₊₁ = xᵢ + Lᵢ · cos(α)
yᵢ₊₁ = yᵢ + Lᵢ · sin(α)      ← canvas Y is subtracted internally
```

Segment lengths and prismatic displacements are in **pixels** (clearly labeled in the UI).

### 4.4 Trajectory Groundwork

Each joint object will carry a `trajectory` field (initially `null` or `[]`) containing an array of `{ t, value }` keyframes. A separate `TrajectoryPlayer` module stub will be included but disabled; it will expose a `play()` / `pause()` / `reset()` interface for future use.

---

## 5. Data & Storage

- **Input:** User enters configuration (joint count, types, lengths, limits) via the config UI.
- **State:** Held entirely in memory as a JavaScript array of joint objects:
  ```js
  {
    type: "rotary" | "prismatic",
    baseLength: Number,   // px or abstract units
    min: Number,          // deg or units
    max: Number,
    value: Number,        // current slider position
    trajectory: []        // stub — reserved for future playback
  }
  ```
- **Output:** Rendered on an HTML `<canvas>` element; endpoint (x, y) shown as text.
- **Persistence:** None required for v1. Optional JSON export/import (R-014) is copy-paste only.

---

## 6. Testing & Demo Scenarios

| # | Scenario                                              | Expected Result                                                      |
|---|-------------------------------------------------------|----------------------------------------------------------------------|
| 1 | Configure 1 rotary joint, sweep slider 0° → 180°      | Single segment rotates smoothly around base point                    |
| 2 | Configure 1 prismatic joint, sweep slider              | Single segment grows/shrinks along fixed axis                        |
| 3 | Configure 3 rotary joints, move each slider            | Serial chain reacts correctly; endpoint traces expected arc          |
| 4 | Mix rotary + prismatic joints, adjust sliders          | Correct FK: rotation accumulates, prismatic changes segment length   |
| 5 | Hit "Reset"                                            | All joints return to 0 / default; arm returns to initial pose        |
| 6 | Set joint limits (e.g. rotary: −45° to +45°)           | Slider clamped to limits; arm cannot exceed configured range         |
| 7 | Inspect JS model in browser console                   | Each joint object has a `trajectory` field (empty array)             |

---

## 7. Dependencies

| Name                    | Version / Notes                                      |
|-------------------------|------------------------------------------------------|
| Web browser             | Any modern browser (Chrome, Firefox, Edge)           |
| HTML / CSS / JavaScript | Vanilla — no build step, no npm, no frameworks       |
| Canvas 2D API           | Built into all modern browsers                       |

---

## 8. Open Questions

_All questions resolved. Decisions recorded below._

| # | Question                                                                 | ✅ Decision                                              |
|---|--------------------------------------------------------------------------|---------------------------------------------------------|
| 1 | Arm base position and coordinate frame?                                  | **Bottom-center of canvas**, arm initially points up    |
| 2 | Should prismatic joints affect direction, or only length?                | **Length only** — direction is inherited from parent    |
| 3 | What units for segment lengths / displacements?                          | **Pixels** — clearly labeled in the UI                  |
| 4 | Joint angles: absolute or relative?                                      | **Relative** — each angle is measured from incoming direction |
| 5 | Max number of joints?                                                    | **8 joints maximum**                                    |

---

*Last updated: 2026-05-17*
