// Drinking from the can.  The hand goes over the can and down its outer side, closes round it
// (each finger stops where it meets the can), and from then on the can rides in the hand at a fixed
// offset; the hand target is worked out backwards from where the can should be: on the desk, tipped
// against her lips, back down.  Methods of Rei (see rei.js).
import * as THREE from 'three';
import { smooth } from '../util.js';
import { DRINK } from './pose.js';

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad;
const _q = Q(), _v = V(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _wq = Q(), _ws = Q(), _wp = V(), _wj = V(), _wm = V(), _wt = V();   // finger walks

const curve = points => new THREE.CatmullRomCurve3(points, false, 'centripetal');

export const drinkMethods = {
  initGrip() {
    // knuckle line (palm side) off the can's surface (m); knuckles past the can's nearest point
    // along the fingers, so the palm lies on it; how far the fingers close (each stops where it
    // meets the can); finger half-thickness kept off the can
    this.gripGap = 0.03; this.gripWrap = 0.01; this.gripCurl = 1.2; this.fingerR = 0.0085;
    this.gripRoll = -0.6;      // hand rolled about the fingers (rad) so the thumb's root clears the can
    this.gripOutside = 0.7;    // 0 = palm pushes the way she reaches (hand on the inside), 1 = straight inwards
    // route to the can: over its top by this much (m), then down its outer side from this far out
    this.reachOver = 0.09; this.reachOut = 0.05;
    // at her mouth: the elbow pole (-1 = as at the desk, lower = elbow down by her side) and the
    // hand's side of the can (0 = straight out to her side, + towards the shoulder).  Picked for the
    // least wrist bend.
    this.drinkElbowUp = -2.5;
    this.drinkHandBack = -0.3;
  },

  // where the can stands on the desk (bottom centre), from her seat
  canSpot(out = V()) {
    const deskTop = Math.max(0.6, ...(this.meta.desk || []).map(d => d.max?.[1] ?? 0));
    return out.copy(this.root.position).addScaledVector(this.fwd, this.cfg.canFwd).addScaledVector(this.left, this.cfg.canLeft).setY(deskTop);
  },

  // the hand's target during the drink; returns how far the gesture overrides typing (0..1)
  drinkArm(arm, d, can, shoulderPos) {
    const D = DRINK, tt = d.t, sgn = arm.sgn;
    arm.gripCan = can;
    if (!d.from) { d.from = arm.wrist.clone(); d.fromQ = arm.handQ.clone(); }

    // grip pose at the can on the desk.  The palm presses towards the can's axis along `a`: from
    // the outside of the can (her left of it for the left hand), turned partly towards the reach
    // so the wrist stays nearly straight
    const axisP = V().copy(can.rest.pos).addScaledVector(Y, can.h * 0.42);
    const reach = V().subVectors(axisP, shoulderPos).setY(0).normalize();
    const inward = this.left.clone().multiplyScalar(-sgn);
    const a = reach.multiplyScalar(1 - this.gripOutside).addScaledVector(inward, this.gripOutside).normalize();
    // the hand's own knuckle line stands upright (index on top, thumb up) with the palm facing `a`;
    // the knuckles sit a little past the can's nearest point so the palm lies against it
    const { H, mid, along } = this.gripFrame(arm);
    _m.makeBasis(Y, a, V().crossVectors(Y, a)).multiply(_m2.copy(H).transpose());
    const restQ = Q().setFromRotationMatrix(_m);
    const fingersW = along.clone().applyQuaternion(restQ);
    restQ.premultiply(_q.setFromAxisAngle(fingersW, this.gripRoll * sgn));
    const restP = axisP.clone().addScaledVector(a, -(can.r + this.gripGap)).addScaledVector(fingersW, this.gripWrap)
      .sub(mid.clone().applyQuaternion(restQ));
    if (!d.a0) d.a0 = a.clone();
    // the way there and back: up above the can's inner side, across over its top, down its outer
    // side, then in onto it
    const over = restP.clone().addScaledVector(Y, can.h * 0.58 + this.reachOver).addScaledVector(a, 0.03);
    const inner = over.clone().addScaledVector(a, 0.07);
    const beside = restP.clone().addScaledVector(a, -this.reachOut).addScaledVector(Y, 0.02);

    // pick it up / sip / put it down
    if (tt >= D.grab && !d.grabbed && !d.released) {
      arm.hand.updateWorldMatrix(true, false);
      can.obj.updateMatrixWorld();
      can.grip.copy(arm.hand.matrixWorld).invert().multiply(can.obj.matrixWorld);
      can.held = arm.side; d.grabbed = true;
      this.onCan?.('lift');
    }
    if (d.grabbed && !d.sipped && tt >= D.lifted + 0.45) { d.sipped = true; this.onCan?.('sip'); }
    if (tt >= D.down && d.grabbed && !d.released) { this.releaseCan(can); d.released = true; this.onCan?.('down'); }

    // elbow: down and out at the desk; held lower while the can is up at her mouth, so the forearm
    // meets the hand without a sharp bend at the wrist
    const up = d.grabbed && !d.released ? smooth(D.grab, D.lifted, tt) * (1 - smooth(D.sipEnd, D.down - 0.3, tt)) : 0;
    arm.gPole.copy(Y).multiplyScalar(-1 + up * (1 + this.drinkElbowUp))
      .addScaledVector(this.left, sgn * (0.9 + up * 0.4)).addScaledVector(this.fwd, -0.3).normalize();

    if (!d.grabbed) {
      // reaching out: from where the hand was, over the can and down its outer side, hand open
      curve([d.from, inner, over, beside, restP]).getPoint(smooth(0.05, 1.0, tt), arm.gPos);
      arm.gQ.copy(d.fromQ).slerp(restQ, smooth(0.1, 0.85, tt));
      arm.grip = -0.6 + (this.gripCurl + 0.6) * smooth(D.grab - 0.4, D.grab, tt);
      return smooth(0, 0.25, tt);
    }
    if (d.released) {
      // letting go: open the hand, out and up over the can again, then back to the keys
      curve([restP, beside, over, inner]).getPoint(smooth(D.down + 0.3, D.down + 1.05, tt), arm.gPos);
      arm.gQ.copy(restQ);
      arm.grip = (this.gripCurl - (this.gripCurl + 0.6) * smooth(D.down, D.down + 0.3, tt)) * (1 - smooth(D.down + 0.9, D.dur, tt));
      return 1 - smooth(D.down + 0.95, D.dur - 0.05, tt);
    }
    // held: where the can should be now
    const lifted = this.canAtLips(can, d, 14, 0, shoulderPos);
    let p, q;
    if (tt < D.lifted) {
      const k = smooth(D.grab, D.lifted, tt);
      p = can.rest.pos.clone().lerp(lifted.p, k); q = can.rest.quat.clone().slerp(lifted.q, k);
    } else if (tt < D.sipEnd) {
      const s = smooth(D.lifted, D.lifted + 0.55, tt) * (1 - smooth(D.sipEnd - 0.55, D.sipEnd, tt));
      ({ p, q } = this.canAtLips(can, d, 14 + 46 * s, s, shoulderPos));
    } else {
      const k = smooth(D.sipEnd, D.down - 0.4, tt);   // down a moment before letting go, so the hand has caught up
      p = lifted.p.clone().lerp(can.rest.pos, k); q = lifted.q.clone().slerp(can.rest.quat, k);
    }
    // hand = can pose x inverse(grip)
    _m.compose(p, q, _v.set(1, 1, 1)).multiply(_m2.copy(can.grip).invert());
    _m.decompose(arm.gPos, arm.gQ, _v);
    arm.grip = this.gripCurl;
    return 1;
  },

  // can pose with its rim at her lips: tipped by `tilt` deg towards her face, `close` 0..1 how
  // near the lips; turned so the hand holding it is on the outside
  canAtLips(can, d, tilt, close, shoulderPos) {
    const mouth = this.mouthWorld(V());
    const faceF = this.faceForward(V());
    const faceL = V().crossVectors(Y, faceF).normalize();
    const rim = mouth.clone().addScaledVector(faceF, 0.075 - 0.065 * close).addScaledVector(Y, -0.055 * (1 - close));
    // the hand stays on her side of the can, between the shoulder it comes from and straight out to that side
    const toShoulder = V().subVectors(shoulderPos, rim).setY(0).normalize();
    const out = faceL.multiplyScalar(d.side === 'left' ? 1 : -1).lerp(toShoulder, this.drinkHandBack).normalize();
    const th = rad(tilt);
    const up = V().copy(Y).multiplyScalar(Math.cos(th)).addScaledVector(faceF, -Math.sin(th));    // can axis
    const toFace = V().copy(faceF).multiplyScalar(-Math.cos(th)).addScaledVector(Y, -Math.sin(th));
    const p = rim.addScaledVector(toFace, -can.r).addScaledVector(up, -can.h);                     // base centre
    // turn about the vertical so the gripped side (opposite the reach) faces outwards
    const turn = Q().setFromUnitVectors(d.a0.clone().negate(), out);
    const q = Q().setFromUnitVectors(Y, up).multiply(turn).multiply(can.rest.quat);
    return { p, q };
  },

  // the can follows the hand that holds it; a drink cut short puts it back
  carryCan(can) {
    if (!can?.held) return;
    if (this.gesture?.type !== 'drink') { this.releaseCan(can); return; }
    const hand = this.arms[can.held].hand;
    hand.updateWorldMatrix(true, false);
    _m.multiplyMatrices(hand.matrixWorld, can.grip).decompose(can.obj.position, can.obj.quaternion, _v);
  },

  releaseCan(can) {
    can.held = null;
    can.obj.position.copy(can.rest.pos);
    can.obj.quaternion.copy(can.rest.quat);
  },

  // --- fingers that stop on the can ---------------------------------------------------------

  // The hand's grip frame, in hand space: knuckle line (index -> little), the palm's facing (the
  // way the fingertips go when the hand closes) and the knuckles' midpoint.  H's columns are
  // (knuckle line, palm facing, their cross product); `along` points down the open fingers.
  gripFrame(arm) {
    if (arm.gripFrame) return arm.gripFrame;
    const F = arm.fingers;
    const k = V().subVectors(F[1].nodes[0].position, F[4].nodes[0].position).normalize();
    const mid = V().addVectors(F[1].nodes[0].position, F[4].nodes[0].position).multiplyScalar(0.5);
    const open = V(), shut = V();
    this.walkFinger(arm, 2, 0, p => open.copy(p));
    this.walkFinger(arm, 2, 1, p => shut.copy(p));
    const along = V().subVectors(open, F[2].nodes[0].position);
    along.addScaledVector(k, -along.dot(k)).normalize();
    const palm = V().crossVectors(along, k);
    if (palm.dot(shut.sub(open)) < 0) palm.negate();
    const H = new THREE.Matrix4().makeBasis(k, palm, V().crossVectors(k, palm));
    return (arm.gripFrame = { H, mid, along });
  },

  // points down finger i (joints, the halfway points between them, the tip) in hand space, with
  // the hand closed by g (< 0 opens it); the last point visited is the fingertip
  walkFinger(arm, i, g, visit) {
    const f = arm.fingers[i];
    const q = _wq.identity(), p = _wp.set(0, 0, 0), j = _wj;
    for (let s = 0; s < 3; s++) {
      j.copy(f.nodes[s].position).applyQuaternion(q).add(p);
      if (s > 0) visit(_wm.copy(p).lerp(j, 0.5));
      visit(j);
      p.copy(j);
      this.fingerQuat(arm, i, s, Math.min(0, g) * 1.6, _ws, 0, 0, 0, Math.max(0, g));
      q.multiply(_ws);
    }
    j.copy(f.tipExt).applyQuaternion(q).add(p);
    visit(_wm.copy(p).lerp(j, 0.5));
    visit(j);
  },

  // hand space -> the can's own space (base centre, axis up) for this frame
  canFrame(arm) {
    const can = arm.gripCan;
    arm.hand.updateWorldMatrix(true, false);
    if (can.held === arm.side) _m.multiplyMatrices(arm.hand.matrixWorld, can.grip);
    else { can.obj.updateMatrixWorld(); _m.copy(can.obj.matrixWorld); }
    arm.toCan = (arm.toCan || new THREE.Matrix4()).copy(_m).invert().multiply(arm.hand.matrixWorld);
  },

  // how close finger i comes to the can's side (m; < 0 inside it) with the hand closed by g
  fingerGap(arm, i, g) {
    const can = arm.gripCan, M = arm.toCan;
    let min = Infinity;
    this.walkFinger(arm, i, g, p => {
      _wt.copy(p).applyMatrix4(M);
      if (_wt.y > -0.01 && _wt.y < can.h + 0.005) min = Math.min(min, Math.hypot(_wt.x, _wt.z) - can.r);
    });
    return min;
  },

  // the most finger i may close towards `target` and still stay on the can's surface
  fingerGrip(arm, i, target) {
    const clear = this.fingerR;
    if (!arm.toCan || this.fingerGap(arm, i, target) >= clear) return target;
    let lo = -0.6, hi = target;
    if (hi <= lo || this.fingerGap(arm, i, lo) < clear) return Math.min(lo, target);
    for (let k = 0; k < 7; k++) {
      const m = (lo + hi) / 2;
      if (this.fingerGap(arm, i, m) >= clear) lo = m; else hi = m;
    }
    return lo;
  },
};
