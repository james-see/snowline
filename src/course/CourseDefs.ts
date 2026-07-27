import type { CourseDef } from '@/types/course.ts';

/**
 * Alpine Flow — wide blue groomer with reuniting alternate lines.
 * Center packed for speed, powder shelf left, rail park right.
 */
export const ALPINE_FLOW: CourseDef = {
  id: 'alpine',
  name: 'Alpine Flow',
  description:
    'A wide blue run with a forgiving groomed center, powder stashes on the left, ' +
    'and a rail line on the right. Multiple lines reunite at broad recovery gates.',
  seed: 0xa1f1_0e01,
  length: 2200,
  difficulty: 'blue',
  // Authoring hint only — loadCourse overwrites from mesh at SPAWN_PATH_T.
  spawn: { position: [0, 420, 0], yaw: 0, pitch: -8 },
  checkpoints: [
    { id: 'cp1', name: 'Meadow Gate', t: 0.16, width: 22 },
    { id: 'cp2', name: 'Powder Cut', t: 0.34, lateral: -22, width: 18 },
    { id: 'cp3', name: 'Sun Bowl', t: 0.52, width: 24 },
    { id: 'cp4', name: 'Rail District', t: 0.72, lateral: 20, width: 18 },
    { id: 'cp5', name: 'Village Approach', t: 0.88, width: 24 },
  ],
  finish: { id: 'finish', name: 'Village Arch', t: 0.97, width: 26 },
  controlPoints: [
    [0, 420, 0],
    [-90, 390, 260],
    [110, 355, 520],
    [-70, 320, 820],
    [130, 275, 1120],
    [-40, 230, 1420],
    [70, 185, 1720],
    [10, 145, 1980],
    [0, 110, 2180],
  ],
  terrain: {
    width: 100,
    apronWidth: 140,
    apronT: 0.12,
    drop: 300,
    pathSegmentsPer100m: 14,
    lateralSegments: 30,
    pitchDeg: 13,
    roughness: 0.38,
    reliefScale: 1.25,
    backdrop: { peakHeight: 320, nearOffset: 36, farOffset: 240 },
    altLines: [
      // Left powder shelf — soft channel that rejoins before Sun Bowl.
      { startT: 0.2, endT: 0.5, lateral: -28, width: 26, depth: 1.6 },
      // Right rail terrace — slightly raised pack for park line.
      { startT: 0.55, endT: 0.82, lateral: 30, width: 24, depth: 1.1 },
    ],
  },
  surfaceRegions: [
    { center: [-55, 350, 420], radius: 95, kind: 'powder' },
    { center: [-40, 300, 900], radius: 70, kind: 'powder' },
    { center: [48, 250, 1280], radius: 45, kind: 'ice' },
    { center: [0, 160, 1900], radius: 80, kind: 'packed' },
  ],
  props: [
    { id: 'flag-start', kind: 'flag', position: [-14, 419, 12], rotationY: 0.4 },
    { id: 'flag-start-r', kind: 'flag', position: [14, 419, 12], rotationY: -0.4 },
    { id: 'rock-landmark', kind: 'rock', position: [-78, 360, 300], variant: 2, scale: 2.2, recovery: true },
    // Rails stay on the right terrace — off the groomed fall line.
    { id: 'rail-main', kind: 'rail', position: [36, 330, 700], rotationY: -0.35, length: 22, grindable: true },
    { id: 'rail-alt', kind: 'rail', position: [44, 270, 1240], rotationY: 0.18, length: 18, grindable: true },
    { id: 'ramp-line', kind: 'ramp', position: [-12, 300, 980], rotationY: 0.08, lip: 2.4, scale: 1.15 },
    { id: 'ramp-recovery', kind: 'ramp', position: [28, 245, 1380], rotationY: -0.12, lip: 1.5, recovery: true },
    // Edge trees only — corridor center stays clear.
    { id: 'tree-edge-a', kind: 'tree', position: [-52, 375, 160], variant: 0, recovery: true },
    { id: 'tree-edge-b', kind: 'tree', position: [-56, 368, 210], variant: 1, recovery: true },
    { id: 'tree-edge-c', kind: 'tree', position: [58, 370, 190], variant: 2, recovery: true },
    { id: 'tree-powder-1', kind: 'tree', position: [-72, 340, 500], variant: 1, recovery: true },
    { id: 'tree-powder-2', kind: 'tree', position: [-76, 335, 560], variant: 0, recovery: true },
    { id: 'tree-powder-3', kind: 'tree', position: [-68, 310, 820], variant: 2, recovery: true },
    { id: 'gate-cp1', kind: 'checkpoint_gate', position: [0, 360, 350], rotationY: 0 },
    { id: 'gate-cp2', kind: 'checkpoint_gate', position: [-30, 320, 750], rotationY: 0 },
    { id: 'gate-cp3', kind: 'checkpoint_gate', position: [10, 280, 1140], rotationY: 0 },
    { id: 'gate-cp4', kind: 'checkpoint_gate', position: [30, 240, 1580], rotationY: 0 },
    { id: 'gate-cp5', kind: 'checkpoint_gate', position: [8, 180, 1920], rotationY: 0 },
    { id: 'finish', kind: 'finish_arch', position: [0, 112, 2120], rotationY: 0 },
  ],
  medals: {
    bronzeTime: 165,
    silverTime: 132,
    goldTime: 108,
    platinumTime: 94,
    bronzeScore: 4000,
    silverScore: 7000,
    goldScore: 10000,
    platinumScore: 14000,
  },
};

/**
 * Timberline — narrow black forest technical.
 * Main chute vs glade shortcut; tunnel landmark; rock garden; merge before finish.
 */
export const TIMBERLINE: CourseDef = {
  id: 'timberline',
  name: 'Timberline',
  description:
    'A narrow black run through old-growth forest. Thread tree gaps, duck a tunnel, ' +
    'and choose between the main chute or a tight glade shortcut with rocks to hop.',
  seed: 0x71ab_e1ae,
  length: 1850,
  difficulty: 'black',
  spawn: { position: [200, 400, -100], yaw: 0.15, pitch: -10 },
  checkpoints: [
    { id: 'cp1', name: 'Glade Entry', t: 0.18, width: 12 },
    { id: 'cp2', name: 'Tunnel Mouth', t: 0.4, width: 11 },
    // Shortcut line sits left of the main chute — still a fair gate.
    { id: 'cp3', name: 'Rock Garden', t: 0.58, lateral: -8, width: 13 },
    { id: 'cp4', name: 'Shortcut Merge', t: 0.78, width: 16 },
    { id: 'cp5', name: 'Forest Exit', t: 0.9, width: 16 },
  ],
  finish: { id: 'finish', name: 'Timber Gate', t: 0.985, width: 18 },
  controlPoints: [
    [200, 400, -100],
    [190, 380, 80],
    [155, 350, 300],
    [125, 320, 520],
    [85, 288, 740],
    [40, 255, 960],
    [5, 222, 1180],
    [-25, 190, 1400],
    [-40, 160, 1600],
    [-48, 130, 1780],
  ],
  terrain: {
    width: 42,
    apronWidth: 110,
    apronT: 0.12,
    drop: 265,
    pathSegmentsPer100m: 17,
    lateralSegments: 18,
    pitchDeg: 16.5,
    roughness: 0.78,
    reliefScale: 1.35,
    backdrop: { peakHeight: 300, nearOffset: 32, farOffset: 210 },
    altLines: [
      // Glade shortcut — left channel after the tunnel, merges at cp4.
      { startT: 0.42, endT: 0.76, lateral: -12, width: 14, depth: 2.0 },
    ],
  },
  surfaceRegions: [
    { center: [150, 340, 280], radius: 35, kind: 'packed' },
    { center: [90, 290, 700], radius: 28, kind: 'ice' },
    { center: [15, 220, 1150], radius: 40, kind: 'powder' },
  ],
  props: [
    // Tree gauntlet — edges + recovery trees on the shortcut, never blocking center.
    { id: 'tree-01', kind: 'tree', position: [178, 388, 40], variant: 0 },
    { id: 'tree-02', kind: 'tree', position: [168, 382, 70], variant: 1 },
    { id: 'tree-03', kind: 'tree', position: [186, 378, 95], variant: 2 },
    { id: 'tree-04', kind: 'tree', position: [148, 360, 200], variant: 0 },
    { id: 'tree-05', kind: 'tree', position: [138, 352, 240], variant: 1 },
    { id: 'tree-06', kind: 'tree', position: [162, 348, 270], variant: 2 },
    { id: 'tree-07', kind: 'tree', position: [108, 328, 400], variant: 0 },
    { id: 'tree-08', kind: 'tree', position: [98, 320, 440], variant: 1 },
    { id: 'tree-09', kind: 'tree', position: [120, 315, 480], variant: 2 },
    { id: 'tree-10', kind: 'tree', position: [70, 295, 600], variant: 0 },
    { id: 'tree-11', kind: 'tree', position: [58, 285, 660], variant: 1 },
    { id: 'tree-12', kind: 'tree', position: [82, 278, 720], variant: 2 },
    { id: 'tree-13', kind: 'tree', position: [28, 255, 860], variant: 0 },
    { id: 'tree-14', kind: 'tree', position: [18, 245, 920], variant: 1 },
    { id: 'tree-15', kind: 'tree', position: [40, 238, 980], variant: 2 },
    { id: 'tree-16', kind: 'tree', position: [-8, 210, 1220], variant: 0 },
    { id: 'tree-17', kind: 'tree', position: [-20, 200, 1280], variant: 1 },
    // Shortcut glade — recovery so collisions stay fair if you take the cut.
    { id: 'tree-sc-1', kind: 'tree', position: [72, 290, 780], variant: 0, recovery: true },
    { id: 'tree-sc-2', kind: 'tree', position: [68, 282, 820], variant: 1, recovery: true },
    { id: 'tree-sc-3', kind: 'tree', position: [55, 275, 860], variant: 2, recovery: true },
    { id: 'tree-sc-4', kind: 'tree', position: [48, 268, 900], variant: 0, recovery: true },
    { id: 'tunnel', kind: 'tunnel', position: [100, 300, 700], rotationY: 0.32, scale: 1.05 },
    // Rock garden — offset from fall line, hoppable gaps.
    { id: 'rock-1', kind: 'rock', position: [48, 260, 980], variant: 0, scale: 1.25 },
    { id: 'rock-2', kind: 'rock', position: [32, 252, 1030], variant: 1, scale: 1.05 },
    { id: 'rock-3', kind: 'rock', position: [55, 248, 1070], variant: 2, scale: 1.4 },
    { id: 'rock-4', kind: 'rock', position: [22, 240, 1120], variant: 0, scale: 1.15, recovery: true },
    { id: 'rail-stub', kind: 'rail', position: [-8, 215, 1340], rotationY: -0.45, length: 10, grindable: true },
    { id: 'ramp-stub', kind: 'ramp', position: [12, 208, 1380], rotationY: 0.15, lip: 2.0 },
    { id: 'flag-tl', kind: 'flag', position: [188, 399, -90], rotationY: 0.2 },
    { id: 'gate-cp1', kind: 'checkpoint_gate', position: [165, 355, 260], rotationY: 0 },
    { id: 'gate-cp2', kind: 'checkpoint_gate', position: [105, 305, 680], rotationY: 0 },
    { id: 'gate-cp3', kind: 'checkpoint_gate', position: [35, 250, 1020], rotationY: 0 },
    { id: 'gate-cp4', kind: 'checkpoint_gate', position: [-10, 200, 1420], rotationY: 0 },
    { id: 'gate-cp5', kind: 'checkpoint_gate', position: [-35, 165, 1620], rotationY: 0 },
    { id: 'finish', kind: 'finish_arch', position: [-46, 132, 1760], rotationY: 0 },
  ],
  medals: {
    bronzeTime: 148,
    silverTime: 118,
    goldTime: 96,
    platinumTime: 82,
    bronzeScore: 5000,
    silverScore: 8500,
    goldScore: 12000,
    platinumScore: 16500,
  },
};

/**
 * Summit Drop — double-black extreme.
 * Fair center line through ice lip, kickers, halfpipe, canyon finish.
 * Cliff rocks stay wide lateral; bypass line available mid-run.
 */
export const SUMMIT_DROP: CourseDef = {
  id: 'summit',
  name: 'Summit Drop',
  description:
    'Double-black hero run from the summit lip. Cliffs on either side, mandatory airs, ' +
    'a halfpipe section, then a canyon finish — stay center for the fair line.',
  seed: 0x5b01_17d0,
  length: 2450,
  difficulty: 'double-black',
  spawn: { position: [-300, 520, -200], yaw: 0.05, pitch: -12 },
  checkpoints: [
    { id: 'cp1', name: 'Summit Ledge', t: 0.1, width: 14 },
    { id: 'cp2', name: 'Cliff Bypass', t: 0.28, lateral: 10, width: 13 },
    { id: 'cp3', name: 'Kicker Row', t: 0.42, width: 16 },
    { id: 'cp4', name: 'Halfpipe Entry', t: 0.55, width: 22 },
    { id: 'cp5', name: 'Canyon Lip', t: 0.78, width: 14 },
  ],
  finish: { id: 'finish', name: 'Base Camp', t: 0.99, width: 24 },
  controlPoints: [
    [-300, 520, -200],
    [-290, 480, 60],
    [-250, 430, 340],
    [-190, 370, 640],
    [-120, 310, 940],
    [-50, 250, 1240],
    [20, 190, 1540],
    [40, 130, 1840],
    [35, 95, 2080],
    [28, 70, 2320],
  ],
  terrain: {
    width: 68,
    apronWidth: 130,
    apronT: 0.12,
    drop: 440,
    pathSegmentsPer100m: 15,
    lateralSegments: 24,
    pitchDeg: 19,
    roughness: 0.74,
    reliefScale: 1.3,
    backdrop: { peakHeight: 360, nearOffset: 40, farOffset: 260 },
    halfpipe: { startT: 0.52, endT: 0.7, depth: 5.2, width: 36 },
    canyon: { startT: 0.76, endT: 0.99, depth: 11 },
    altLines: [
      // Cliff bypass — right shelf around the exposed left wall.
      { startT: 0.18, endT: 0.4, lateral: 16, width: 18, depth: 1.8 },
    ],
  },
  surfaceRegions: [
    { center: [-270, 470, 120], radius: 55, kind: 'ice' },
    { center: [-200, 380, 560], radius: 40, kind: 'ice' },
    { center: [-40, 230, 1300], radius: 50, kind: 'packed' },
    { center: [30, 110, 2000], radius: 55, kind: 'packed' },
  ],
  props: [
    { id: 'flag-summit', kind: 'flag', position: [-312, 519, -190], rotationY: 0.3 },
    // Cliffs far lateral — visual drama, not unfair hits on the fair line.
    { id: 'rock-cliff-l', kind: 'rock', position: [-355, 440, 100], variant: 3, scale: 3.0, recovery: true },
    { id: 'rock-cliff-r', kind: 'rock', position: [-215, 430, 140], variant: 2, scale: 2.6, recovery: true },
    { id: 'rock-cliff-l2', kind: 'rock', position: [-340, 400, 280], variant: 1, scale: 2.4, recovery: true },
    // Kickers on/near center — readable mandatory airs.
    { id: 'ramp-kicker-1', kind: 'ramp', position: [-255, 400, 400], rotationY: 0.06, lip: 4.0, scale: 1.35 },
    { id: 'ramp-kicker-2', kind: 'ramp', position: [-185, 345, 740], rotationY: -0.04, lip: 4.8, scale: 1.5 },
    { id: 'ramp-kicker-3', kind: 'ramp', position: [-100, 285, 1060], rotationY: 0.1, lip: 4.4, scale: 1.4 },
    { id: 'rail-summit', kind: 'rail', position: [-140, 300, 920], rotationY: 0.35, length: 14, grindable: true },
    { id: 'rock-guard-1', kind: 'rock', position: [-210, 350, 800], variant: 1, scale: 1.6, recovery: true },
    { id: 'rock-guard-2', kind: 'rock', position: [25, 200, 1520], variant: 0, scale: 1.4, recovery: true },
    { id: 'gate-cp1', kind: 'checkpoint_gate', position: [-295, 490, 20], rotationY: 0 },
    { id: 'gate-cp2', kind: 'checkpoint_gate', position: [-230, 400, 500], rotationY: 0 },
    { id: 'gate-cp3', kind: 'checkpoint_gate', position: [-160, 340, 860], rotationY: 0 },
    { id: 'gate-cp4', kind: 'checkpoint_gate', position: [-50, 240, 1280], rotationY: 0 },
    { id: 'gate-cp5', kind: 'checkpoint_gate', position: [30, 145, 1780], rotationY: 0 },
    { id: 'finish', kind: 'finish_arch', position: [30, 72, 2280], rotationY: 0 },
  ],
  medals: {
    bronzeTime: 132,
    silverTime: 104,
    goldTime: 86,
    platinumTime: 74,
    bronzeScore: 6500,
    silverScore: 10500,
    goldScore: 15000,
    platinumScore: 21000,
  },
};

export const COURSE_CATALOG: Record<CourseDef['id'], CourseDef> = {
  alpine: ALPINE_FLOW,
  timberline: TIMBERLINE,
  summit: SUMMIT_DROP,
};

export const COURSE_LIST: readonly CourseDef[] = [ALPINE_FLOW, TIMBERLINE, SUMMIT_DROP];

export function getCourseDef(id: CourseDef['id']): CourseDef {
  const def = COURSE_CATALOG[id];
  if (!def) throw new Error(`Unknown course id: ${id}`);
  return def;
}
