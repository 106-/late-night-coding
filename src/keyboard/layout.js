// Desk layout: where the keyboard and the chair stand.  The room pictures were rendered with
// meta.layout; changing the layout in the browser moves the keys, Rei's seat and the guides at once,
// and the background catches up when the room is rendered again.
import * as THREE from 'three';

export const LAYOUT_DEFAULTS = { kbScale: 1.3, kbSide: 0, kbAway: 0, kbYaw: 0, mouseShift: 0.08, chairFwd: 0, chairSide: 0, chairYaw: 0 };
export const LAYOUT_KEYS = Object.keys(LAYOUT_DEFAULTS);

const v3 = a => new THREE.Vector3().fromArray(a);
const deg = THREE.MathUtils.degToRad;

// keyboard placement, as a matrix acting on the keyboard as modelled (before any layout).
// It scales and turns about the middle of the board's near edge; height grows less than size.
function keyboardMatrix(meta, L) {
  const a = v3(meta.kbAnchor), side = v3(meta.kbSide0), away = v3(meta.kbAway0);
  const s = L.kbScale, sz = 1 + (s - 1) * 0.4;
  const shift = side.multiplyScalar(L.kbSide).add(away.multiplyScalar(L.kbAway));
  return new THREE.Matrix4().makeTranslation(a.x + shift.x, a.y + shift.y, a.z + shift.z)
    .multiply(new THREE.Matrix4().makeRotationY(deg(L.kbYaw)))
    .multiply(new THREE.Matrix4().makeScale(s, sz, s))
    .multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z));
}

const sameLayout = (a, b) => LAYOUT_KEYS.every(k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6);

export class Layout {
  constructor(meta, keymap) {
    this.meta = meta;
    this.keymap = keymap;
    this.baked = { ...LAYOUT_DEFAULTS, ...meta.layout };   // what the room pictures show
    this.current = { ...this.baked };
    // the keys exactly as rendered (several codes can share one keycap, and so one position)
    this.keyPos = new Map();
    this.keySize = new Map();
    for (const k of keymap.keys.values()) {
      if (!this.keyPos.has(k.pos)) this.keyPos.set(k.pos, k.pos.clone());
      this.keySize.set(k, [k.w, k.d]);
    }
    this.axes = { ax: keymap.ax.clone(), ay: keymap.ay.clone(), up: keymap.up.clone() };
    this.bakedInv = keyboardMatrix(meta, this.baked).invert();
  }

  get matchesRender() { return sameLayout(this.current, this.baked); }

  set(partial) {
    Object.assign(this.current, partial);
    const L = this.current, km = this.keymap, meta = this.meta;
    // keyboard: every key from where it was rendered to where it is now
    const D = keyboardMatrix(meta, L).multiply(this.bakedInv);
    for (const [pos, rendered] of this.keyPos) pos.copy(rendered).applyMatrix4(D);
    const r = L.kbScale / this.baked.kbScale;
    for (const [k, [w, d]] of this.keySize) { k.w = w * r; k.d = d * r; }
    const R = new THREE.Matrix3().setFromMatrix4(D);
    for (const axis of ['ax', 'ay', 'up']) km[axis].copy(this.axes[axis]).applyMatrix3(R).normalize();
    // chair: from where it was modelled
    const o = v3(meta.chairOrigin0).addScaledVector(v3(meta.chairFwd0), L.chairFwd).addScaledVector(v3(meta.chairLeft0), L.chairSide);
    const rot = new THREE.Matrix4().makeRotationY(deg(L.chairYaw));
    meta.chair.origin = o.toArray();
    meta.chair.x = v3(meta.chairX0).applyMatrix4(rot).toArray();
    meta.chair.y = v3(meta.chairY0).applyMatrix4(rot).toArray();
  }
}
