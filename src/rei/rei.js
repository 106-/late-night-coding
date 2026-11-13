// Rei: seated pose, gaze, face and small gestures.  Her arms (typing, gestures) live in arms.js and
// drinking from the can in drink.js; both add methods to this class.
import * as THREE from 'three';
import { clamp, damp, smooth } from '../util.js';
import { POSE_DEFAULTS, FINGER_NAMES, SEGMENTS, DRINK, FACE_BINDS, MOUTH_SHAPE } from './pose.js';
import { armMethods } from './arms.js';
import { drinkMethods } from './drink.js';

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad;
const SIDES = ['left', 'right'];
const EXPRESSIONS = ['relaxed', 'surprised', 'sad', 'angry'];   // the ones emote() can show
const _e = new THREE.Euler();

export class Rei {
  constructor(vrm, meta, keymap, savedPose = {}) {
    this.vrm = vrm;
    this.meta = meta;
    this.keymap = keymap;
    this.root = vrm.scene;
    this.bone = name => vrm.humanoid.getNormalizedBoneNode(name);
    this.cfg = { ...POSE_DEFAULTS, ...savedPose };

    this.buildCurl();
    this.place();
    this.hipsRest = this.bone('hips').position.clone();
    this.arms = Object.fromEntries(SIDES.map(side => [side, this.makeArm(side)]));
    this.initArms();

    // gaze
    this.lookTarget = new THREE.Object3D();
    this.lookGoal = V();
    vrm.lookAt.target = this.lookTarget;
    this.gazeMode = 'screen';
    this.gazeUntil = 0;
    this.headYaw = 0; this.headPitch = 0; this.headRoll = 0;
    this.rollGoal = 0;          // extra head tilt (deg), e.g. after a typo
    // face
    this.expr = { relaxed: 0, surprised: 0, sad: 0, angry: 0, aa: 0, blink: 0 };
    this.exprGoal = { relaxed: 0, surprised: 0, sad: 0, angry: 0 };
    this.exprHold = 0;
    this.blinkT = 2; this.blinkPhase = -1;
    // body state
    this.sleepy = 0;            // 0 awake … 1 dozing
    this.asleep = false;
    this.lean = 0;              // typing concentration leans her in
    this.bob = 0;               // a small nod on each key
    this.gesture = null;        // { type, t, dur }
    this.typedAt = -10;
    this.time = 0;
    this.points = {};           // head position, updated each frame
    this.onCan = null;          // (what: 'lift' | 'sip' | 'down') => void

    this.bindFace();
    this.mouthLocal = this.findMouth();
    this.applyStatic();
  }

  makeArm(side) {
    const upper = this.bone(`${side}UpperArm`), lower = this.bone(`${side}LowerArm`), hand = this.bone(`${side}Hand`);
    const fingers = FINGER_NAMES.map((name, i) => {
      const nodes = SEGMENTS[i].map(seg => this.bone(`${side}${name}${seg}`));
      // past the last joint to the fingertip
      const tipExt = nodes[2].position.clone().normalize().multiplyScalar(i === 0 ? 0.022 : 0.019);
      return { nodes, tipExt, press: 0, ext: 0, lift: 0, yaw: 0 };
    });
    return {
      side, sgn: side === 'left' ? 1 : -1,
      upper, lower, hand, shoulder: this.bone(`${side}Shoulder`),
      l1: lower.position.length(), l2: hand.position.length(),
      fingers,
      wrist: V(), wristInit: false, handQ: Q(),
      keyTarget: null, keyFinger: 1, lastPress: -10,
      gesture: 0, gPos: V(), gQ: Q(), gPole: V(),   // gesture target, blended over typing by `gesture`
    };
  }

  // --- seat and static pose ---------------------------------------------------------

  // seat position and facing: square to the keyboard, F/J midpoint as close to straight ahead as the seat allows
  place() {
    const c = this.cfg, chair = this.meta.chair, km = this.keymap;
    this.root.position.fromArray(chair.origin).addScaledVector(V().fromArray(chair.y), c.back);
    this.root.position.y = 0;
    this.hipY = chair.origin[1] + chair.seatTopCentre + c.hipHeight;
    const kbFwd = km.ay.clone().setY(0).normalize();
    this.root.rotation.set(0, Math.atan2(kbFwd.x, kbFwd.z) + rad(c.yawOffset), 0);
    const q = Q().setFromEuler(this.root.rotation);
    this.fwd = V().set(0, 0, 1).applyQuaternion(q);
    this.left = V().set(1, 0, 0).applyQuaternion(q);
    const homeMid = km.home.L.pos.clone().add(km.home.R.pos).multiplyScalar(0.5);
    const lateral = clamp(homeMid.sub(this.root.position).dot(this.left), -0.10, 0.10);
    this.root.position.addScaledVector(this.left, lateral + c.side);
  }

  // finger curl at rest (deg per joint); middle and ring curl a little more than index and little
  buildCurl() {
    const c = this.cfg, t = c.thumb;
    const f = d => [c.fingerBase + d, c.fingerMid + d * 0.8, c.fingerTip];
    this.curl = [[4 * t, 10 * t, 12 * t], f(-0.8), f(0.4), f(1.2), f(0)];
  }

  // legs and shoulders that only change with the posture values
  applyStatic() {
    const c = this.cfg;
    for (const side of SIDES) {
      const sgn = side === 'left' ? 1 : -1;
      this.bone(`${side}UpperLeg`).quaternion.setFromEuler(_e.set(rad(-c.thigh + c.pelvisBack), rad(sgn * c.spread), rad(sgn * 2), 'YXZ'));
      this.bone(`${side}LowerLeg`).quaternion.setFromEuler(_e.set(rad(c.knee + (sgn > 0 ? 6 : -4)), 0, 0, 'XYZ'));
      this.bone(`${side}Foot`).quaternion.setFromEuler(_e.set(rad(18), 0, 0, 'XYZ'));
    }
  }

  // posture values changed (tuning panel)
  setPose(partial) {
    Object.assign(this.cfg, partial);
    this.buildCurl();
    this.place();
    this.buildHandPose();
    this.applyStatic();
  }

  // the keyboard moved (desk layout): re-seat and re-aim the hands
  syncKeyboard() {
    this.place();
    this.buildHandPose();
  }

  // --- what she can be asked to do ------------------------------------------------------

  // a key goes down under her finger; returns the key (null if the board has none for that code)
  press(code) {
    const key = this.keymap.keys.get(code);
    this.typedAt = this.time;
    if (this.asleep) this.wake();
    if (!key) return null;
    const [hand, finger] = key.finger;
    const arm = this.arms[hand === 'L' ? 'left' : 'right'];
    arm.keyTarget = key; arm.keyFinger = finger; arm.lastPress = this.time;
    arm.fingers[finger].press = 1;
    this.bob = 1;
    return key;
  }

  // show an expression for `hold` seconds (null clears)
  emote(name, amount = 1, hold = 2.2) {
    for (const k of EXPRESSIONS) this.exprGoal[k] = 0;
    if (name) this.exprGoal[name] = amount;
    this.exprHold = hold;
  }

  // a gesture: nod, shake, tilt, flinch, wave, yawn, drink
  play(type, dur) {
    if (this.handsBusy) return;                   // a can in hand: finish that first
    if (!this.asleep) this.gesture = { type, t: 0, dur };
  }

  lookAt(mode, seconds = 3) { this.gazeMode = mode; this.gazeUntil = this.time + seconds; }

  sleep() { this.asleep = true; this.gesture = null; }

  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.emote('surprised', 0.8, 0.9);
    this.lookAt('viewer', 2.5);
  }

  get handsBusy() { return this.gesture?.type === 'drink'; }

  // --- per frame ---------------------------------------------------------------------------
  // world: { can, cameraPos, screenPoint, lampPoint, penguinPoint, windowPoint, canPoint }
  update(dt, world) {
    this.time += dt;
    const t = this.time, c = this.cfg;
    const typing = t - this.typedAt < 1.2;
    const motion = this.gestureMotion(dt, world);

    this.sleepy = damp(this.sleepy, this.asleep ? 1 : 0, this.asleep ? 0.9 : 5, dt);
    this.lean = damp(this.lean, typing ? 1 : 0, 2.5, dt);
    this.bob = damp(this.bob, 0, 16, dt);
    const sl = this.sleepy;
    const { flinch, dLean, dTwist } = motion;

    // torso
    const breath = Math.sin(t * (1.55 - sl * 0.6)) * (1 + sl * 0.8);
    const hips = this.bone('hips');
    hips.position.set(this.hipsRest.x, this.hipY - sl * 0.012, this.hipsRest.z + this.lean * 0.006);
    hips.quaternion.setFromEuler(_e.set(rad(c.hipTilt - c.pelvisBack + this.lean * 2 + sl * 3), rad(c.twist * 0.3), 0, 'XYZ'));
    this.bone('spine').quaternion.setFromEuler(_e.set(
      rad(c.spine - c.recline * 0.6 + this.lean * 1.5 + sl * 12 + breath * 0.5 - flinch * 5 + dLean * 9),
      rad(c.twist * 0.4 + Math.sin(t * 0.23) * 1.2 + dTwist * 9),
      rad(Math.sin(t * 0.31) * 0.8), 'XYZ'));
    this.bone('chest').quaternion.setFromEuler(_e.set(
      rad(c.chest - c.recline * 0.4 + this.lean * 1 + sl * 11 + breath * 0.9 - flinch * 4 + dLean * 7),
      rad(c.twist * 0.3 + dTwist * 7), 0, 'XYZ'));
    for (const side of SIDES) {
      const sgn = side === 'left' ? 1 : -1;
      this.bone(`${side}Shoulder`).quaternion.setFromEuler(_e.set(0, rad(sgn * c.shoulderBack),
        rad(sgn * (-3 - c.shoulderDrop + breath * 0.6 + flinch * 9)), 'XYZ'));
    }
    // idle feet
    this.bone('leftLowerLeg').quaternion.setFromEuler(_e.set(rad(c.knee + 6 + Math.sin(t * 0.9) * 5 * (1 - sl)), 0, 0, 'XYZ'));
    this.bone('rightLowerLeg').quaternion.setFromEuler(_e.set(rad(c.knee - 4 + Math.sin(t * 0.9 + 2.1) * 5 * (1 - sl)), 0, 0, 'XYZ'));
    this.root.updateMatrixWorld(true);

    const headPos = this.bone('head').getWorldPosition(V());
    this.points.head = headPos;
    this.updateGaze(dt, world, typing, motion);

    this.root.updateMatrixWorld(true);
    for (const arm of Object.values(this.arms)) this.updateArm(arm, dt, { ...motion, sl, headPos, world });
    this.carryCan(world.can);

    this.updateFace(dt, motion);
    this.vrm.update(dt);
  }

  // the current gesture as weights 0..1 (or signed swings for nod / shake)
  gestureMotion(dt, world) {
    const g = this.gesture;
    const m = { wave: 0, yawn: 0, nod: 0, shake: 0, tilt: 0, flinch: 0, drink: null, dLean: 0, dTwist: 0, sip: 0 };
    if (!g) return m;
    g.t += dt;
    if (g.t >= g.dur) { this.gesture = null; return m; }
    const k = smooth(0, 0.35, g.t) * (1 - smooth(g.dur - 0.45, g.dur, g.t));
    switch (g.type) {
      case 'wave': m.wave = k; break;
      case 'yawn': m.yawn = k; break;
      case 'nod': m.nod = Math.sin(g.t * 9) * k; break;
      case 'shake': m.shake = Math.sin(g.t * 11) * k; break;
      case 'tilt': m.tilt = k; break;
      case 'flinch': m.flinch = k; break;
      case 'drink': {
        if (!world.can) { this.gesture = null; break; }
        // which hand, how far she leans out to the desk, how far back her head tips
        if (!g.side) g.side = V().subVectors(world.can.rest.pos, this.root.position).dot(this.left) >= 0 ? 'left' : 'right';
        const D = DRINK, tt = g.t;
        m.drink = g;
        m.dLean = smooth(0, 0.8, tt) * (1 - smooth(D.grab + 0.1, D.lifted, tt))
          + smooth(D.sipEnd + 0.2, D.down - 0.3, tt) * (1 - smooth(D.down, D.down + 0.7, tt));
        m.dTwist = m.dLean * (g.side === 'left' ? 1 : -1);
        m.sip = smooth(D.lifted - 0.1, D.lifted + 0.5, tt) * (1 - smooth(D.sipEnd - 0.5, D.sipEnd, tt));
        break;
      }
    }
    return m;
  }

  // --- gaze --------------------------------------------------------------------------------

  updateGaze(dt, world, typing, m) {
    const t = this.time, c = this.cfg, sl = this.sleepy;
    const head = this.bone('head'), headPos = this.points.head;
    this.pickGaze(typing);
    const goal = this.gazePoint(world);
    this.lookGoal.lerp(goal, 1 - Math.exp(-dt * 7));
    if (this.lookTarget.position.lengthSq() === 0) this.lookGoal.copy(goal);
    this.lookTarget.position.copy(this.lookGoal);
    this.lookTarget.updateMatrixWorld();

    // the head takes only part of the turn (the eyes do the rest) and stops at a separate limit
    // for each direction; + yaw is towards her left, + pitch is up
    const chestQ = this.bone('chest').getWorldQuaternion(Q());
    const dir = V().subVectors(this.lookGoal, headPos).applyQuaternion(chestQ.invert()).normalize();
    let yaw = clamp(Math.atan2(dir.x, dir.z) * c.headFollowH, rad(-c.headRight), rad(c.headLeft));
    let pitch = clamp(Math.asin(clamp(dir.y, -1, 1)) * c.headFollowV, rad(-c.headDown), rad(c.headUp));
    pitch += rad(sl * -26 + m.yawn * 10 + m.nod * -7 - this.bob * 1.2 + m.sip * 13);
    yaw += rad(m.shake * 9);
    this.headYaw = damp(this.headYaw, yaw, 6.5, dt);
    this.headPitch = damp(this.headPitch, pitch, 6.5, dt);
    this.headRoll = damp(this.headRoll, rad(this.rollGoal + c.headRoll + m.tilt * 13 + sl * 7 + Math.sin(t * 0.37) * 1.3), 5, dt);
    this.bone('neck').quaternion.setFromEuler(_e.set(-this.headPitch * 0.4, this.headYaw * 0.4, this.headRoll * 0.35, 'YXZ'));
    head.quaternion.setFromEuler(_e.set(-this.headPitch * 0.6, this.headYaw * 0.6, this.headRoll * 0.65, 'YXZ'));
  }

  // nothing scripted: wander between the screen, the keys, the viewer and the window
  pickGaze(typing) {
    if (this.time < this.gazeUntil) return;
    const r = Math.random();
    if (typing) {
      this.gazeMode = r < 0.82 ? 'screen' : 'keys';
      this.gazeUntil = this.time + (this.gazeMode === 'keys' ? 0.5 : 1.2 + Math.random() * 2);
    } else {
      this.gazeMode = r < 0.5 ? 'screen' : r < 0.82 ? 'viewer' : r < 0.92 ? 'window' : 'keys';
      this.gazeUntil = this.time + 2 + Math.random() * 4;
    }
  }

  gazePoint(world) {
    switch (this.gazeMode) {
      case 'viewer': return world.cameraPos;
      case 'keys': return V().copy(this.keymap.home.R.pos).lerp(this.keymap.home.L.pos, 0.5);
      case 'window': return world.windowPoint;
      case 'lamp': return world.lampPoint;
      case 'penguin': return world.penguinPoint;
      case 'can': return world.canPoint;
      case 'up': return V().copy(this.points.head).add(V().set(0, 1.5, 0)).addScaledVector(this.fwd, 0.6);
      default: return world.screenPoint;
    }
  }

  // where her face points, horizontally (the body's forward turned by the head yaw)
  faceForward(out) {
    return out.copy(this.fwd).setY(0).normalize().applyAxisAngle(Y, this.headYaw);
  }

  mouthWorld(out) {
    if (this.mouthLocal) return out.copy(this.mouthLocal).applyMatrix4(this.vrm.humanoid.getRawBoneNode('head').matrixWorld);
    // no mouth shape key: a guess in front of the head bone
    return this.bone('head').getWorldPosition(out).addScaledVector(this.faceForward(V()), 0.09).addScaledVector(Y, 0.01);
  }

  // --- face ---------------------------------------------------------------------------------

  // This VRM's expressions carry no binds (only the eye-look ones do), so blink / mouth did nothing.
  // Wire them to the face shape keys, unless the model already binds them itself.
  bindFace() {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const meshes = [];
    this.vrm.scene.traverse(o => { if (o.morphTargetDictionary?.[FACE_BINDS.blink[0][0]] !== undefined) meshes.push(o); });
    const proto = em.expressions.flatMap(e => e._binds ?? []).find(b => b.primitives && b.index !== undefined);
    if (!meshes.length || !proto) return;
    const Bind = proto.constructor;   // VRMExpressionMorphTargetBind
    for (const [name, list] of Object.entries(FACE_BINDS)) {
      const ex = em.getExpression(name);
      if (!ex || ex._binds?.length) continue;
      for (const [morph, weight] of list) {
        const index = meshes[0].morphTargetDictionary[morph];
        if (index !== undefined) ex.addBind(new Bind({ primitives: meshes, index, weight }));
      }
    }
  }

  // where the mouth is, in the raw head bone's space: the centre of what the mouth shape key moves
  findMouth() {
    const raw = this.vrm.humanoid.getRawBoneNode('head');
    const sum = V(), v = V();
    let total = 0;
    this.vrm.scene.traverse(o => {
      const index = o.morphTargetDictionary?.[MOUTH_SHAPE];
      if (!o.isSkinnedMesh || index === undefined) return;
      const bi = o.skeleton.bones.indexOf(raw);
      const g = o.geometry, pos = g.attributes.position, mt = g.morphAttributes.position?.[index];
      if (bi < 0 || !mt) return;
      const M = o.skeleton.boneInverses[bi].clone().multiply(o.bindMatrix);
      for (let i = 0; i < pos.count; i++) {
        const d = g.morphTargetsRelative
          ? Math.hypot(mt.getX(i), mt.getY(i), mt.getZ(i))
          : Math.hypot(mt.getX(i) - pos.getX(i), mt.getY(i) - pos.getY(i), mt.getZ(i) - pos.getZ(i));
        if (d < 1e-4) continue;
        sum.addScaledVector(v.fromBufferAttribute(pos, i).applyMatrix4(M), d);
        total += d;
      }
    });
    return total > 0 ? sum.multiplyScalar(1 / total) : null;
  }

  updateFace(dt, m) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    // blink every few seconds, sometimes twice
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkT = Math.random() < 0.18 ? 0.28 : 1.8 + Math.random() * 4.2;
    }
    let blink = 0;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.15;
      blink = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
      if (this.blinkPhase >= 1) this.blinkPhase = -1;
    }
    blink = Math.max(blink, this.cfg.lids, this.sleepy * 0.97, m.yawn * 0.85, m.flinch * 0.75);

    this.exprHold -= dt;
    if (this.exprHold <= 0) for (const k of EXPRESSIONS) this.exprGoal[k] = 0;
    for (const k of EXPRESSIONS) this.expr[k] = damp(this.expr[k], this.exprGoal[k], 7, dt);
    // a tired resting face under any other expression
    this.expr.relaxed = Math.max(this.expr.relaxed, this.cfg.relaxed * (1 - this.expr.surprised - this.expr.angry));
    this.expr.aa = damp(this.expr.aa, m.yawn * 0.9, 20, dt);
    this.expr.blink = blink;
    for (const [k, v] of Object.entries(this.expr)) em.setValue(k, clamp(v, 0, 1));
  }
}

Object.assign(Rei.prototype, armMethods, drinkMethods);
