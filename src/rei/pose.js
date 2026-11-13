// Rei's posture values and the fixed tables behind her hands and face.

// Posture.  Arms are IK (two-bone solve from the shoulder to the wrist, aimed so the pressing
// fingertip lands on the key; the elbow follows the pole set by elbowOut / elbowBack).  Everything
// else is forward kinematics.  The tuning panel edits these; assets/pose.json overrides them.
export const POSE_DEFAULTS = {
  // seat
  back: 0.06,           // hips from the chair centre towards the backrest (m; small = slid forward)
  side: 0,              // extra shift to the sitter's left (m, after centring on F/J)
  hipHeight: 0.139,     // hip joint above the seat cushion (m)
  yawOffset: 0,         // body turn (deg; 0 = square to the keyboard)
  // torso
  pelvisBack: 15,       // pelvis rolled back = leaning into the backrest (deg)
  hipTilt: -5,
  spine: 0, chest: 7,   // forward rounding of the lower / upper back (deg; negative arches)
  recline: 0,           // extra backward bend of the spine itself (deg)
  twist: 4,
  shoulderBack: -2,     // + pulls the shoulders back, - rolls them forward (deg)
  shoulderDrop: 4,      // shoulders lowered (deg)
  headRoll: 5,          // head tilt (deg)
  // how far the head turns to follow her gaze (the eyes cover the rest); limits in deg, per direction
  headLeft: 48, headRight: 48, headUp: 21, headDown: 20,
  headFollowH: 0.78, headFollowV: 0.7,   // share of the gaze turn taken by the head (0 = eyes only)
  // arms and hands (IK targets)
  elbowOut: 0.8, elbowBack: 0.7,         // elbow pole: sideways / backwards
  handYaw: 18,          // hands turned inwards (deg)
  handPitch: -6,        // fingers sloping down from the wrist (deg)
  handRoll: 2,          // little-finger side lower (deg)
  hover: 0.003,         // resting fingertip height above the caps (m)
  handTravel: 0.1,      // how far the hand moves to a key (0 = only the finger reaches, 1 = the whole hand)
  // fingers (deg per joint, index..little; thumb as a factor)
  fingerBase: 9.5, fingerMid: 17.5, fingerTip: 18.5, thumb: 0.8,
  // face
  lids: 0.51, relaxed: 0.35,
  // yawn: where the wrist goes, relative to her mouth (m): in front of it / back along the fingers / up
  yawnHandFwd: 0.03, yawnHandBack: 0.05, yawnHandUp: -0.015,
  // the can she drinks from: where it stands on the desk, from her seat (m, forward / to her left)
  canFwd: 0.27, canLeft: 0.27,
  // legs
  thigh: 84, knee: 96, spread: 7,
  // real-time lights that shade her toon material (the room itself is baked and does not change).
  // Directions are around her body: azimuth 0 = from in front of her, + = from her left (camera
  // side), ±180 = from behind; elevation + = from above
  winAz: -132, winEl: 18, winPower: 1,          // the window (blue key light, behind her right)
  fillAz: 105, fillEl: 24, fillPower: 1,        // soft room fill (camera side)
  crtFwd: 0.577, crtLeft: -0.476, crtUp: 0.034, crtPower: 1,   // CRT glow, offset from her head (m)
  lampPower: 1, ambientPower: 1,
  // bloom over the whole picture: brightness that starts to glow, its soft knee,
  // glow strength (dawn adds 0.2 on top) and spread
  bloomThreshold: 0.8, bloomSoft: 0.01, bloomStrength: 0.38, bloomRadius: 0.7,
};

export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
export const SEGMENTS = [
  ['Metacarpal', 'Proximal', 'Distal'],
  ['Proximal', 'Intermediate', 'Distal'], ['Proximal', 'Intermediate', 'Distal'],
  ['Proximal', 'Intermediate', 'Distal'], ['Proximal', 'Intermediate', 'Distal'],
];
// extra bend per joint (deg), thumb..little, for a finger pressing a key
export const PRESS = [[10, 14, 6], [15, 5, 3], [15, 5, 3], [15, 5, 3], [15, 5, 3]];
// extra bend per joint (deg) for a hand closed round a can
export const GRIP = [[18, 22, 18], [38, 52, 30], [40, 55, 32], [42, 55, 32], [45, 55, 30]];

// drinking from the can (seconds into the gesture): hand on the can, can at her lips, sip over,
// can back on the desk, hand back on the keys
export const DRINK = { grab: 1.15, lifted: 2.35, sipEnd: 4.6, down: 5.85, dur: 7.5 };

// expressions -> the model's own shape keys, for VRMs exported without expression binds
// (relaxed is left unbound on purpose: no smile)
export const FACE_BINDS = {
  blink: [['目閉じ', 1]],
  aa: [['あ', 1]],
};
export const MOUTH_SHAPE = 'あ';    // the shape key that shows where her mouth is
