// Rei's arms: hands over the keys, a finger to each pressed key, gestures (wave, yawn), and the
// two-bone IK that puts the wrist where it is asked to be.  Methods of Rei (see rei.js).
import * as THREE from 'three';
import { clamp, damp } from '../util.js';
import { PRESS, GRIP } from './pose.js';

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const rad = THREE.MathUtils.degToRad;
const _q = Q(), _q2 = Q(), _v = V(), _v2 = V(), _m = new THREE.Matrix4();

function quatFromBasis(x, y, z, out = Q()) {
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

// a hand orientation from where its fingers point and where the back of the hand faces
function handQuat(sgn, fingers, back, out) {
  const xAxis = fingers.clone().multiplyScalar(sgn);
  const zAxis = V().crossVectors(xAxis, back).normalize();
  const yAxis = V().crossVectors(zAxis, xAxis).normalize();
  return quatFromBasis(xAxis, yAxis, zAxis, out);
}

export const armMethods = {
  initArms() {
    const km = this.keymap;
    this.typingQuat = { left: Q(), right: Q() };
    // the home-row key under each finger, to know how far a key asks the finger to reach
    const k = code => km.keys.get(code);
    this.fingerHome = {
      left: [k('Space'), k('KeyF'), k('KeyD'), k('KeyS'), k('KeyA')],
      right: [k('Space'), k('KeyJ'), k('KeyK'), k('KeyL'), k('Semicolon')],
    };
    this.initGrip();
    this.buildHandPose();
  },

  // hand orientation over the keys, from the body's forward direction (symmetric for both hands)
  buildHandPose() {
    const c = this.cfg, up = this.keymap.up;
    const base = this.fwd.clone().addScaledVector(up, -this.fwd.dot(up)).normalize();
    for (const side of ['left', 'right']) {
      const sgn = side === 'left' ? 1 : -1;
      const f = base.clone().applyAxisAngle(up, rad(-c.handYaw * sgn));          // turned inwards
      f.applyAxisAngle(V().crossVectors(f, up).normalize(), rad(-c.handPitch)).normalize();
      const right = V().crossVectors(f, up).normalize();                          // towards the typist's right
      const back = V().crossVectors(right, f).normalize();                        // back of the hand
      back.applyAxisAngle(f, rad(c.handRoll * sgn));
      const xAxis = f.clone().multiplyScalar(sgn);
      quatFromBasis(xAxis, back, V().crossVectors(xAxis, back).normalize(), this.typingQuat[side]);
    }
  },

  // rotation of one finger joint.  press bends it onto a key, ext > 0 straightens it to reach the
  // upper rows, lift raises an idle finger off the caps, yaw swings it sideways to a key, grip closes
  // it round something
  fingerQuat(arm, i, seg, press, out, ext = 0, lift = 0, yaw = 0, grip = 0) {
    const a = rad(this.curl[i][seg] * (1 - 0.62 * ext) + PRESS[i][seg] * press - (seg === 0 ? 26 * lift : 0) + GRIP[i][seg] * grip);
    if (i === 0) {
      // thumb: tuck under the palm a little and swing towards the index finger
      out.setFromAxisAngle(Y, -arm.sgn * a * (seg === 0 ? 1.4 : 1.0));
      if (seg === 0) out.multiply(_q2.setFromAxisAngle(Z, -arm.sgn * rad(18 + 16 * press)));
      return out;
    }
    out.setFromAxisAngle(Z, -arm.sgn * a);
    if (seg === 0) out.premultiply(_q2.setFromAxisAngle(Y, arm.sgn * rad((i - 2.2) * 5) + yaw));   // fan the fingers
    return out;
  },

  // fingertip of a pressing finger, in hand space, reaching `ext` rows from home
  tipFor(arm, i, ext, out, yaw = 0) {
    const f = arm.fingers[i];
    out.copy(f.tipExt);
    for (let s = 2; s >= 0; s--) {
      this.fingerQuat(arm, i, s, 1, _q, ext, 0, yaw);
      out.applyQuaternion(_q).add(f.nodes[s].position);
    }
    return out;
  },

  updateArm(arm, dt, s) {
    const { sgn, side } = arm;
    const km = this.keymap, c = this.cfg, t = this.time;
    const home = side === 'left' ? km.home.L : km.home.R;
    const tq = this.typingQuat[side];
    const travel = clamp(c.handTravel, 0, 1);

    // typing target: a finger on its key, or the index hovering over its home key
    if (arm.keyTarget && t - arm.lastPress > 0.22) arm.keyTarget = null;
    const key = arm.keyTarget || home;
    const fi = arm.keyTarget ? arm.keyFinger : 1;
    let ext = 0, aside = 0;
    if (arm.keyTarget && fi > 0) {
      const d = _v.subVectors(key.pos, this.fingerHome[side][fi].pos);
      ext = clamp(d.dot(km.ay) / 0.03, -0.45, 1);
      aside = d.dot(km.ax);                      // how far the key is beside the finger's home key (m)
    }
    // hand at rest: index over its home key; bone tips ride a finger pad's thickness above the caps
    const homeTip = this.tipFor(arm, 1, 0, V()).applyQuaternion(tq);
    const typePos = _v2.copy(home.pos).addScaledVector(km.up, c.hover + Math.sin(t * 1.3 + sgn) * 0.0012)
      .sub(homeTip).addScaledVector(km.ay, -0.004);
    if (arm.keyTarget && travel > 0) {
      // the hand travels (part of the way) so the finger lands on its key
      const tip = this.tipFor(arm, fi, ext, _v).applyQuaternion(tq);
      typePos.lerp(V().copy(key.pos).addScaledVector(km.up, 0.0065).sub(tip), travel);
    }
    // whatever the hand does not travel, the finger reaches: it swings sideways towards the key
    // (~4.5 cm from the knuckle to the tip); for other rows it straightens (ext) and the knuckle
    // bends down a little so the tip doesn't rise off the caps
    const reachYaw = arm.keyTarget && fi > 0 ? clamp(Math.atan2(aside * (1 - travel), 0.045), -0.5, 0.5) : 0;
    const knuckle = (10 / 26) * (1 - travel);
    if (arm.yawSign === undefined) {   // which way a + swing turns the fingertip, seen on the keyboard
      const a = this.tipFor(arm, 1, 0, V(), 0.2).applyQuaternion(tq), b = this.tipFor(arm, 1, 0, V(), 0).applyQuaternion(tq);
      arm.yawSign = a.sub(b).dot(km.ax) >= 0 ? 1 : -1;
    }

    // a gesture takes the hand off the keys
    arm.grip = undefined;
    const shoulderPos = arm.upper.getWorldPosition(V());
    let g = 0;
    if (s.drink && side === s.drink.side) g = this.drinkArm(arm, s.drink, s.world.can, shoulderPos);
    else if (s.wave > 0.001 && side === 'right') g = this.waveTarget(arm, s.wave, shoulderPos, s.world.cameraPos);
    else if (s.yawn > 0.001 && side === 'left') g = this.yawnTarget(arm, s.yawn);
    arm.gesture = g;

    // asleep: hands slide back towards the desk edge
    if (s.sl > 0.01) typePos.addScaledVector(km.ay, -0.03 * s.sl).addScaledVector(km.up, -0.004 * s.sl);

    const goal = typePos.lerp(arm.gPos, g);
    if (!arm.wristInit) { arm.wrist.copy(goal); arm.wristInit = true; }
    // a hand that barely travels drifts softly after the finger instead of snapping
    const rate = arm.keyTarget ? 12 + 22 * travel : g > 0.01 ? 9 : 13;
    arm.wrist.lerp(goal, 1 - Math.exp(-rate * dt));
    arm.handQ.copy(tq).slerp(arm.gQ, g);

    // elbow: down and out while typing, wherever the gesture wants it otherwise
    const pole = V().copy(Y).negate().addScaledVector(this.left, sgn * c.elbowOut).addScaledVector(this.fwd, -c.elbowBack).normalize();
    if (g > 0) pole.lerp(arm.gPole.normalize(), g).normalize();
    this.solveArm(arm, shoulderPos, arm.wrist, arm.handQ, pole);
    if (arm.grip !== undefined) this.canFrame(arm);

    // fingers
    if (arm.grip === undefined) arm.thumbSol = null;
    // round the can: the thumb goes round the far side, as far as the hand has closed
    const thumb = arm.grip > 0 ? this.thumbGrip(arm) : null;
    arm.fingers.forEach((f, i) => {
      f.press = damp(f.press, 0, 13, dt);
      let relax, close = [0, 0, 0];
      if (arm.grip !== undefined) {
        // round the can: each finger wraps it joint by joint, never into it
        relax = Math.min(0, arm.grip);
        if (i > 0) {
          const gs = this.fingerGrip(arm, i, arm.grip);
          close = gs.map(v => Math.max(0, v));
          relax = Math.min(relax, gs[0]);   // the hand is so close the finger has to open to clear the can
        }
      } else relax = g * -0.6;   // an open hand in gestures
      const mine = arm.keyTarget && i === arm.keyFinger;
      f.ext = damp(f.ext, mine ? ext : 0, 30, dt);
      f.lift = damp(f.lift, arm.keyTarget && !mine && i !== 0 ? 1 : 0, 26, dt);
      f.yaw = damp(f.yaw, mine ? reachYaw : 0, 30, dt);
      const lift = (f.lift - (i > 0 ? knuckle * Math.max(0, f.ext) : 0)) * (1 - g);
      // fingers fanned for typing, side by side round the can
      const yaw = f.yaw * arm.yawSign * (1 - g) - (i > 0 && arm.grip > 0 ? arm.sgn * rad((i - 2.2) * 5) * Math.min(1, arm.grip / this.gripCurl) : 0);
      for (let seg = 0; seg < 3; seg++) {
        const q = f.nodes[seg].quaternion;
        this.fingerQuat(arm, i, seg, f.press + relax * 1.6 + s.sl * 0.5, q, f.ext, lift, yaw, close[seg]);
        if (i === 0 && thumb) q.slerp(this.thumbRot(arm, thumb, seg, _q), clamp(arm.grip / this.gripCurl, 0, 1));
      }
    });
  },

  // wave at the viewer with the right hand: fingers up, rocking, palm towards the camera
  waveTarget(arm, k, shoulderPos, cameraPos) {
    const toCam = V().subVectors(cameraPos, shoulderPos).setY(0).normalize();
    const swing = Math.sin(this.time * 9.5) * 0.3;
    arm.gPos.copy(shoulderPos).addScaledVector(Y, 0.13).addScaledVector(toCam, 0.2).addScaledVector(this.left, -0.13 + swing * 0.05);
    handQuat(arm.sgn, V().copy(Y).applyAxisAngle(toCam, swing + 0.15).normalize(), toCam.clone().negate(), arm.gQ);
    arm.gPole.copy(Y).negate().addScaledVector(this.left, -0.6);
    return k;
  },

  // left palm over the mouth: follows the real mouth and the way the head is turned, not the body
  yawnTarget(arm, k) {
    const c = this.cfg;
    const faceF = this.faceForward(V());
    const faceL = V().crossVectors(Y, faceF).normalize();
    const fingers = faceL.clone().negate().addScaledVector(Y, 0.3).normalize();   // across the mouth, a little up
    arm.gPos.copy(this.mouthWorld(V())).addScaledVector(faceF, c.yawnHandFwd)
      .addScaledVector(fingers, -c.yawnHandBack).addScaledVector(Y, c.yawnHandUp);
    handQuat(arm.sgn, fingers, faceF.clone(), arm.gQ);                            // back of the hand forward
    arm.gPole.copy(Y).negate().addScaledVector(this.left, 0.7);
    return k;
  },

  // two-bone IK: shoulder S, wrist target T, hand orientation, elbow pole
  solveArm(arm, S, T, handQ, pole) {
    const { sgn, l1, l2 } = arm;
    const d = _v.subVectors(T, S);
    const len = clamp(d.length(), 0.06, (l1 + l2) * 0.997);
    const dir = d.normalize();
    const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ortho = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = V().copy(S).addScaledVector(dir, a).addScaledVector(ortho, h);
    const Tc = V().copy(S).addScaledVector(dir, len);
    const dirSE = V().subVectors(E, S).normalize();
    const dirET = V().subVectors(Tc, E).normalize();
    const hinge = V().crossVectors(ortho, dir).normalize();
    // upper arm: bone axis along S->E, rest +Y maps to the hinge so the elbow bends the right way
    const ux = dirSE.clone().multiplyScalar(sgn);
    const uy = hinge.clone().multiplyScalar(-sgn);
    const qU = quatFromBasis(ux, uy, V().crossVectors(ux, uy).normalize());
    // the model's rest arm is not a straight T: the upper arm points ~22° down and the forearm
    // bends a little, so aim each bone's real rest offset (not the X axis) at its segment
    const restU = arm.lower.position.clone().normalize();
    const restL = arm.hand.position.clone().normalize();
    qU.premultiply(Q().setFromUnitVectors(restU.clone().applyQuaternion(qU).normalize(), dirSE));
    const q0 = Q().setFromUnitVectors(restL.clone().applyQuaternion(qU).normalize(), dirET).multiply(qU);
    const qh = Q().setFromUnitVectors(restL.clone().applyQuaternion(handQ).normalize(), dirET).multiply(handQ);
    const qL = q0.clone().slerp(qh, 0.55);                   // share the forearm twist
    const parentQ = arm.shoulder.getWorldQuaternion(Q());
    arm.upper.quaternion.copy(parentQ.invert()).multiply(qU);
    arm.lower.quaternion.copy(qU.clone().invert()).multiply(qL);
    arm.hand.quaternion.copy(qL.clone().invert()).multiply(handQ);
  },
};
